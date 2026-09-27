/**
 * The Invisible Orchestra – local, inspectable simulation.
 *
 * This is deliberately a small rule-based scheduler, not a machine-learning
 * model. Every decision it makes is recorded in a trace with the numbers
 * it used, so the on-screen explanation is tied to what actually happened.
 *
 * Order of play (deterministic):
 *   1. Fixed loads: the other homes, the visitor's home base load, the
 *      bakery's ovens (locked to its opening time).
 *   2. Hard-deadline flexible loads: the car, then the bakery cold store.
 *   3. Comfort-bounded load: the heat pump (thermal model).
 *   4. The home battery, which balances what is left.
 *   5. A check of the street's cable against everything above.
 *
 * Each flexible load is scheduled under a *mode* derived from the
 * visitor's permission for it:
 *   'auto'      – the orchestra may move it inside the agreed window.
 *   'ask'       – the orchestra proposes a move and waits; until the visitor
 *                 answers, the load behaves as if nobody was coordinating it.
 *   'never'     – the load runs the way it would with no coordination.
 */

import {
  SLOTS, DT, slotHour, slotClock, clockToSlot, formatClock, buildSeries,
  SCENARIO, DEFAULT_PROMISES, DEFAULT_PERMISSIONS, COMFORT_BANDS,
} from './scenario.js';
import { planLoad, PlanStatus } from './planner.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function quantile(arr, q) {
  const s = Array.from(arr).sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function sum(arr) {
  let t = 0;
  for (let i = 0; i < arr.length; i++) t += arr[i];
  return t;
}

/** Contiguous runs of active slots, for describing schedules in words. */
export function runs(power) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= power.length; i++) {
    const on = i < power.length && power[i] > 1e-6;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push({ from: start, to: i });
      start = -1;
    }
  }
  return out;
}

export function describeRuns(rs, opts = {}) {
  if (!rs.length) return 'never';
  const parts = rs.map((r) => `${formatClock(slotHour(r.from))}–${formatClock(slotHour(r.to))}`);
  if (parts.length <= 2 || opts.all) return parts.join(', ');
  return `${parts[0]}, ${parts[1]} and ${parts.length - 2} more`;
}

/**
 * 'never' means the load is not the orchestra's to plan: it runs the way it
 * would with nobody coordinating it. 'auto' and 'ask' are both planned here;
 * whether an 'ask' plan may replace the agreed one is decided by the
 * authority review in planner.js, outside the simulation.
 */
function modeFor(permission) {
  return permission === 'never' ? 'immediate' : 'auto';
}

/* ------------------------------------------------------------------ */
/* Fixed loads                                                          */
/* ------------------------------------------------------------------ */

function bakeryOvenProfile(openingClock) {
  const { ovenPreheatKw, preheatHours, bakingKw, bakingHours, afternoonKw } = SCENARIO.bakery;
  const p = new Float64Array(SLOTS);
  const open = clockToSlot(openingClock);
  const preheat = open - Math.round(preheatHours / DT);
  const bakeEnd = open + Math.round(bakingHours / DT);
  for (let i = 0; i < SLOTS; i++) {
    if (i >= preheat && i < open) p[i] = ovenPreheatKw;
    else if (i >= open && i < bakeEnd) p[i] = bakingKw;
    else if (i >= bakeEnd && slotHour(i) < 24 + 17) p[i] = afternoonKw; // until 17:00 next day
    else if (slotHour(i) < 20) p[i] = 4; // closing down on the first evening
  }
  return { power: p, open, preheat, bakeEnd };
}

/* ------------------------------------------------------------------ */
/* Deadline loads: choose the cheapest slots inside a window            */
/* ------------------------------------------------------------------ */

function scheduleEv(mode, ctx) {
  const { price, committed, limit, wind, solar, load } = ctx;
  const ev = SCENARIO.ev;
  const pr = ctx.promises.ev;
  const P = ev.chargerKw;
  const eta = ev.chargingEfficiency;
  const depart = clockToSlot(pr.departureClock);
  const from = ev.arriveSlot;
  const energyNeeded = Math.max(0, (pr.targetPct - ev.startPct) / 100 * ev.capacityKwh); // into the battery
  const available = Array.from({ length: SLOTS }, (_, i) => i >= from && i < depart);

  let plan;
  if (mode === 'auto') {
    plan = planLoad({
      pricePencePerKwh: Array.from(price), headroomKw: Array.from(committed, (c) => limit - c), available, dtHours: DT,
      maxPowerKw: P, energyNeededKwh: energyNeeded, efficiency: eta, capPence: pr.priceCapPence,
      priority: ctx.resolutions.evPriority === 'price' ? 'budget' : 'target',
    });
  } else {
    // Nobody coordinating: charge at full power from the moment it is plugged in.
    const flat = Array.from({ length: SLOTS }, () => 0);
    plan = planLoad({ pricePencePerKwh: flat, headroomKw: Array.from({ length: SLOTS }, () => P), available, dtHours: DT, maxPowerKw: P, energyNeededKwh: energyNeeded, efficiency: eta, capPence: null });
    plan.costPence = 0;
    for (let i = 0; i < SLOTS; i++) plan.costPence += plan.acKwhPerSlot[i] * price[i];
    plan.minCostPence = plan.costPence;
    plan.trace.reasonCodes = ['NO_COORDINATION'];
  }

  const power = plan.powerKw;
  const soc = new Float64Array(SLOTS + 1);
  soc[0] = ev.startPct;
  for (let i = 0; i < SLOTS; i++) soc[i + 1] = soc[i] + (power[i] * DT * eta / ev.capacityKwh) * 100;
  const reachedPct = soc[depart];
  const delivered = plan.acKwh;

  // Earliest moment the target could be met ignoring price (for the "leave later" option).
  let acc = 0, fullSlot = -1;
  for (let i = from; i < SLOTS; i++) { acc += Math.min(P, Math.max(0, limit - committed[i])) * DT; if (acc * eta >= energyNeeded - 1e-9) { fullSlot = i + 1; break; } }

  // Wind share of the car's energy at the moments it drew power.
  let windKwh = 0;
  for (let i = 0; i < SLOTS; i++) {
    if (power[i] > 0) {
      const total = load[i] + power[i];
      windKwh += power[i] * DT * clamp((wind[i] + solar[i]) / Math.max(total, 1e-6), 0, 1);
    }
  }

  const capacityShort = plan.boundReason === 'CHARGER_POWER_AND_TIME_LIMIT' || plan.boundReason === 'FEEDER_HEADROOM_BINDING';
  const priceConflict = plan.trace.reasonCodes.includes('BUDGET_TARGET_CONFLICT')
    ? { cap: pr.priceCapPence, costIfDeparture: plan.minCostPence, priority: ctx.resolutions.evPriority || 'departure', maxPctWithinBudget: ev.startPct + (plan.maxAddedWithinBudgetKwh / ev.capacityKwh) * 100 }
    : null;

  return {
    power, soc, slots: [...power.keys()].filter((i) => power[i] > 1e-9), depart, from, energyNeeded, acNeeded: plan.acNeededKwh, delivered, addedKwh: plan.addedKwh,
    reachedPct, feasible: !capacityShort, maxPct: ev.startPct + (plan.maxAddedKwh / ev.capacityKwh) * 100,
    cost: plan.costPence, minCost: plan.minCostPence, priceConflict, windShare: delivered > 0 ? windKwh / delivered : 0,
    latestFullClock: fullSlot > 0 ? slotClock(fullSlot) : null, status: plan.status, boundReason: plan.boundReason, trace: plan.trace,
    need: Math.ceil(plan.acNeededKwh / (P * DT) - 1e-9), windowSlots: depart - from,
  };
}

function scheduleBakeryCold(mode, ctx) {
  const { price, committed, limit } = ctx;
  const b = SCENARIO.bakery;
  const from = clockToSlot(b.coldWindowStartClock);
  const to = clockToSlot(b.coldWindowEndClock);
  const available = Array.from({ length: SLOTS }, (_, i) => i >= from && i < to);
  const energy = b.coldStoreHours * b.coldStoreKw;
  let plan;
  if (mode === 'auto') {
    plan = planLoad({ pricePencePerKwh: Array.from(price), headroomKw: Array.from(committed, (c) => limit - c), available, dtHours: DT, maxPowerKw: b.coldStoreKw, energyNeededKwh: energy, divisible: false });
  } else {
    const flat = Array.from({ length: SLOTS }, () => 0);
    plan = planLoad({ pricePencePerKwh: flat, headroomKw: Array.from({ length: SLOTS }, () => b.coldStoreKw), available, dtHours: DT, maxPowerKw: b.coldStoreKw, energyNeededKwh: energy, divisible: false });
    plan.trace.reasonCodes = ['NO_COORDINATION'];
  }
  const power = plan.powerKw;
  const cost = sum(Array.from(power, (p, i) => p * DT * price[i]));
  return { power, slots: [...power.keys()].filter((i) => power[i] > 1e-9), cost, from, to, status: plan.status, shortfallKwh: plan.shortfallKwh, trace: plan.trace };
}

/* ------------------------------------------------------------------ */
/* The heat pump: a comfort band, a thermal model and a few rules      */
/* ------------------------------------------------------------------ */

function scheduleHeat(mode, ctx) {
  const { price, committed, limit, outdoor } = ctx;
  const h = SCENARIO.home;
  const band = COMFORT_BANDS[ctx.promises.home.comfort];
  const mid = (band.low + band.high) / 2;
  const Pth = h.heatPumpKw * h.heatPumpCop;
  const power = new Float64Array(SLOTS);
  const temp = new Float64Array(SLOTS + 1);
  const reasons = new Array(SLOTS).fill('');
  temp[0] = h.startTempC;

  // Look-ahead thresholds: what counts as cheap or dear over the next 8 hours.
  const look = Math.round(8 / DT);
  let preheatSlots = 0;
  let coastSlots = 0;
  let shedSlots = 0;
  let minutesOutside = 0;

  for (let i = 0; i < SLOTS; i++) {
    const T = temp[i];
    const win = Array.from(price.slice(i, Math.min(SLOTS, i + look)));
    const cheap = quantile(win, 0.35);
    const dear = quantile(win, 0.65);
    const loss = h.heatLossKwPerC * (T - outdoor[i]);
    const tOff = T - loss * DT / h.thermalCapacityKwhPerC;
    const tOn = T + (Pth - loss) * DT / h.thermalCapacityKwhPerC;
    const canCoast = tOff >= band.low + 0.05;
    const canWarm = tOn <= band.high - 0.05;
    let on = false;
    let why = '';
    const cableFull = committed[i] + h.heatPumpKw > limit;

    if (!canCoast) {
      on = true;
      why = 'hold';
    } else if (mode === 'auto') {
      if (cableFull) {
        on = false;
        why = 'shed';
        shedSlots++;
      } else if (price[i] <= cheap && canWarm) {
        on = true;
        why = 'preheat';
        preheatSlots++;
      } else if (price[i] >= dear) {
        on = false;
        why = 'coast';
        coastSlots++;
      } else {
        on = T < mid && canWarm;
        why = 'thermostat';
      }
    } else {
      const wasOn = i > 0 && power[i - 1] > 0;
      on = (T < mid - 0.25 || (wasOn && T < mid + 0.25)) && canWarm;
      why = 'thermostat';
    }

    power[i] = on ? h.heatPumpKw : 0;
    reasons[i] = why;
    temp[i + 1] = on ? tOn : tOff;
    if (temp[i + 1] < band.low - 0.05 || temp[i + 1] > band.high + 0.05) minutesOutside += 15;
  }

  const cost = sum(Array.from(power, (p, i) => p * DT * price[i]));
  const kwh = sum(power) * DT;
  return { power, temp, reasons, cost, kwh, band, preheatSlots, coastSlots, shedSlots, minutesOutside };
}

/* ------------------------------------------------------------------ */
/* The home battery: charge when cheap, cover peaks and the cable       */
/* ------------------------------------------------------------------ */

function scheduleBattery(mode, ctx) {
  const { price, committed, limit } = ctx;
  const b = SCENARIO.battery;
  const power = new Float64Array(SLOTS); // +charge / -discharge (kW)
  const soc = new Float64Array(SLOTS + 1);
  const reasons = new Array(SLOTS).fill('');
  soc[0] = b.startPct / 100 * b.capacityKwh;
  const minE = b.minPct / 100 * b.capacityKwh;
  let peakKwh = 0;
  let cableKwh = 0;
  let chargeKwh = 0;
  if (mode === 'auto') {
    const cheap = quantile(price, 0.3);
    const dear = quantile(price, 0.7);
    for (let i = 0; i < SLOTS; i++) {
      const e = soc[i];
      const overload = committed[i] - limit;
      let p = 0;
      if (overload > 0 && e > minE) {
        p = -Math.min(b.powerKw, overload + 0.5, (e - minE) / DT);
        reasons[i] = 'cable';
        cableKwh += -p * DT;
      } else if (price[i] >= dear && e > minE && committed[i] > 0) {
        p = -Math.min(b.powerKw, committed[i], (e - minE) / DT);
        reasons[i] = 'peak';
        peakKwh += -p * DT;
      } else if (price[i] <= cheap && e < b.capacityKwh && committed[i] + b.powerKw <= limit) {
        p = Math.min(b.powerKw, (b.capacityKwh - e) / DT);
        reasons[i] = 'store';
        chargeKwh += p * DT;
      }
      power[i] = p;
      soc[i + 1] = e + p * DT;
    }
  } else {
    for (let i = 0; i < SLOTS; i++) soc[i + 1] = soc[i];
  }
  const cost = sum(Array.from(power, (p, i) => p * DT * price[i])); // negative = earned
  return { power, soc, reasons, cost, peakKwh, cableKwh, chargeKwh };
}

/* ------------------------------------------------------------------ */
/* The whole day                                                        */
/* ------------------------------------------------------------------ */

export function simulate(input = {}) {
  const promises = {
    ev: { ...DEFAULT_PROMISES.ev, ...(input.promises?.ev || {}) },
    home: { ...DEFAULT_PROMISES.home, ...(input.promises?.home || {}) },
    bakery: { ...DEFAULT_PROMISES.bakery, ...(input.promises?.bakery || {}) },
  };
  const permissions = { ...DEFAULT_PERMISSIONS, ...(input.permissions || {}) };
  const approvals = { ...(input.approvals || {}) };
  const resolutions = { ...(input.resolutions || {}) };
  const withBaseline = input.withBaseline !== false;

  const S = buildSeries();
  const limit = SCENARIO.feederLimitKw;

  // 1. Fixed loads.
  const ovens = bakeryOvenProfile(promises.bakery.openingClock);
  const homeBase = new Float64Array(SLOTS).fill(SCENARIO.home.baseKw);
  const committed = new Float64Array(SLOTS);
  for (let i = 0; i < SLOTS; i++) committed[i] = S.street[i] + homeBase[i] + ovens.power[i] - S.solar[i];
  const load = new Float64Array(SLOTS);
  for (let i = 0; i < SLOTS; i++) load[i] = S.street[i] + homeBase[i] + ovens.power[i];

  const ctxBase = { price: S.price, wind: S.wind, solar: S.solar, outdoor: S.outdoor, limit, promises, resolutions, load };
  const decisions = [];
  const conflicts = [];

  // 2a. The car.
  const evMode = modeFor(permissions.ev);
  const ev = scheduleEv(evMode, { ...ctxBase, committed });
  for (let i = 0; i < SLOTS; i++) committed[i] += ev.power[i];

  // 2b. The bakery cold store.
  const bakeryMode = modeFor(permissions.bakery);
  const cold = scheduleBakeryCold(bakeryMode, { ...ctxBase, committed });
  for (let i = 0; i < SLOTS; i++) committed[i] += cold.power[i];

  // 3. The heat pump.
  const heatMode = modeFor(permissions.heat);
  const heat = scheduleHeat(heatMode, { ...ctxBase, committed });
  for (let i = 0; i < SLOTS; i++) committed[i] += heat.power[i];

  // 4. The battery.
  const batteryMode = modeFor(permissions.battery);
  const battery = scheduleBattery(batteryMode, { ...ctxBase, committed });
  for (let i = 0; i < SLOTS; i++) committed[i] += battery.power[i];

  // 5. The cable.
  const feeder = committed; // net flow through the substation into the street
  const overload = [];
  let peak = -Infinity;
  let peakSlot = 0;
  for (let i = 0; i < SLOTS; i++) {
    if (feeder[i] > peak) { peak = feeder[i]; peakSlot = i; }
    if (feeder[i] > limit + 1e-6) overload.push(i);
  }

  /* ---------------- conflicts ---------------- */
  if (!ev.feasible) {
    conflicts.push({
      id: 'ev-feasible', node: 'car', severity: 'hard',
      title: 'I cannot make both of those true.',
      text: (ev.boundReason === 'FEEDER_HEADROOM_BINDING'
        ? `The street's cable leaves too little room for the charger before ${formatClock(promises.ev.departureClock)}: ` 
        : `Charging at ${SCENARIO.ev.chargerKw} kW from ${formatClock(slotHour(ev.from))} is not enough time: `) +
        `the most the car can reach is ${Math.round(ev.maxPct)}%` +
        (ev.latestFullClock != null ? `. It would be at ${promises.ev.targetPct}% by ${formatClock(ev.latestFullClock)}.` : '.'),
      options: [
        { id: 'accept', label: `Leave at ${formatClock(promises.ev.departureClock)} with ${Math.round(ev.maxPct)}%`, apply: { promises: { ev: { targetPct: Math.floor(ev.maxPct / 10) * 10 } } } },
        ...(ev.latestFullClock != null ? [{ id: 'later', label: `Leave at ${formatClock(Math.ceil(ev.latestFullClock * 2) / 2)} with ${promises.ev.targetPct}%`,
          apply: { promises: { ev: { departureClock: Math.ceil(ev.latestFullClock * 2) / 2 } } } }] : []),
      ],
    });
  }
  if (ev.priceConflict) {
    const pc = ev.priceConflict;
    conflicts.push({
      id: 'ev-price', node: 'car', severity: 'choice', resolved: !!resolutions.evPriority, chosen: pc.priority,
      title: 'I can meet your departure target, but not within the price limit you set.',
      text: `The cheapest way to reach ${promises.ev.targetPct}% by ${formatClock(promises.ev.departureClock)} costs ` +
        `£${(pc.costIfDeparture / 100).toFixed(2)}; you asked me to spend no more than £${(pc.cap / 100).toFixed(2)}. ` +
        `Which should I prioritise?`,
      options: [
        { id: 'departure', label: `The departure target (£${(pc.costIfDeparture / 100).toFixed(2)})`, apply: { resolutions: { evPriority: 'departure' } } },
        { id: 'price', label: `The price limit (${Math.round(pc.maxPctWithinBudget)}% at departure)`, apply: { resolutions: { evPriority: 'price' } } },
      ],
    });
  }
  if (overload.length) {
    const locked = [];
    if (permissions.ev === 'never') locked.push({ id: 'ev', name: 'your car' });
    if (permissions.bakery === 'never') locked.push({ id: 'bakery', name: "the bakery's cold store" });
    if (permissions.heat === 'never') locked.push({ id: 'heat', name: 'your heating' });
    if (permissions.battery === 'never') locked.push({ id: 'battery', name: 'the battery' });
    const worst = overload.reduce((a, i) => (feeder[i] > feeder[a] ? i : a), overload[0]);
    conflicts.push({
      id: 'cable', node: 'substation', severity: locked.length ? 'choice' : 'hard',
      title: `The street's cable is over its limit for ${overload.length * 15} minutes.`,
      text: `At ${formatClock(slotHour(worst))} the street asks for ${feeder[worst].toFixed(0)} kW; the cable can carry ${limit}. ` +
        (locked.length
          ? `I could spread this out, but you have told me not to move ${locked.map((l) => l.name).join(', ')}. What may I move?`
          : `Even moving everything I am allowed to move, the ovens and the morning cannot both fit. In 2037 the network would have to cap the street.`),
      options: locked.map((l) => ({ id: `unlock-${l.id}`, label: `You may move ${l.name}`, apply: { permissions: { [l.id]: 'auto' } } })),
      overloadSlots: overload, worstSlot: worst, worstKw: feeder[worst],
    });
  }

  /* ---------------- decisions (the information layer) ---------------- */
  const evRuns = runs(ev.power);
  if (evRuns.length) {
    decisions.push({
      slot: Math.max(0, evRuns[0].from - 1), node: 'car', kind: evMode === 'auto' ? 'schedule' : 'default',
      text: evMode === 'auto'
        ? `Car: charging ${describeRuns(evRuns)} — the windiest, cheapest hours before ${formatClock(promises.ev.departureClock)}.`
        : `Car: charging as soon as it was plugged in, ${describeRuns(evRuns)} — nobody was coordinating it.`,
    });
    decisions.push({ slot: ev.depart, node: 'car', kind: 'outcome', text: `Car ready: ${Math.round(ev.reachedPct)}% at ${formatClock(promises.ev.departureClock)}.` });
  }
  const coldRuns = runs(cold.power);
  if (coldRuns.length) decisions.push({ slot: Math.max(0, coldRuns[0].from - 1), node: 'bakery', kind: bakeryMode === 'auto' ? 'schedule' : 'default', text: `Bakery cold store: running ${describeRuns(coldRuns)}.` });
  decisions.push({ slot: Math.max(0, ovens.preheat - 1), node: 'bakery', kind: 'fixed', text: `Bakery ovens: preheating from ${formatClock(slotHour(ovens.preheat))} — opening time is not negotiable.` });
  decisions.push({ slot: ovens.open, node: 'bakery', kind: 'outcome', text: `The bakery opens at ${formatClock(promises.bakery.openingClock)}.` });
  let lastWhy = '';
  for (let i = 0; i < SLOTS; i++) {
    const w = heat.reasons[i];
    if (w !== lastWhy && (w === 'preheat' || w === 'coast' || w === 'shed')) {
      const words = { preheat: 'warming the house early while the wind blows', coast: 'letting the house coast through dear electricity', shed: 'pausing to keep the street inside its cable limit' };
      decisions.push({ slot: i, node: 'home', kind: 'schedule', text: `Home: ${words[w]} (${heat.temp[i].toFixed(1)} °C).` });
    }
    lastWhy = w;
  }
  let lastB = '';
  for (let i = 0; i < SLOTS; i++) {
    const w = battery.reasons[i];
    if (w !== lastB && w) {
      const words = { store: 'storing cheap wind', peak: 'covering the peak from storage', cable: "holding the street inside its cable limit" };
      decisions.push({ slot: i, node: 'battery', kind: 'schedule', text: `Battery: ${words[w]} (${Math.round(battery.soc[i] / SCENARIO.battery.capacityKwh * 100)}%).` });
    }
    lastB = w;
  }
  decisions.sort((a, b) => a.slot - b.slot);

  /* ---------------- metrics ---------------- */
  const homeLoad = new Float64Array(SLOTS);
  const importKw = new Float64Array(SLOTS);
  const renewFrac = new Float64Array(SLOTS);
  let homeCost = 0;
  let carbonG = 0;
  let consumption = 0;
  let renewable = 0;
  for (let i = 0; i < SLOTS; i++) {
    homeLoad[i] = homeBase[i] + ev.power[i] + heat.power[i] + battery.power[i];
    homeCost += homeLoad[i] * DT * S.price[i];
    importKw[i] = Math.max(0, feeder[i]);
    const total = load[i] + ev.power[i] + cold.power[i] + heat.power[i] + Math.max(0, battery.power[i]);
    renewFrac[i] = clamp((S.wind[i] + S.solar[i]) / Math.max(total, 1e-6), 0, 1);
    consumption += total * DT;
    renewable += total * DT * renewFrac[i];
    carbonG += importKw[i] * DT * S.carbon[i];
  }
  const metrics = {
    homeCostPence: homeCost,
    evCostPence: ev.cost,
    heatCostPence: heat.cost,
    batteryCostPence: battery.cost,
    evReadyPct: ev.reachedPct,
    evTargetPct: promises.ev.targetPct,
    evWindShare: ev.windShare,
    streetRenewableShare: consumption > 0 ? renewable / consumption : 0,
    peakKw: peak,
    peakSlot,
    limitKw: limit,
    overloadMinutes: overload.length * 15,
    comfortMinutesOutside: heat.minutesOutside,
    carbonKg: carbonG / 1000,
    conflicts: conflicts.length,
    status: conflicts.some((c) => c.severity === 'hard' || (c.severity === 'choice' && !c.resolved && c.id !== 'cable')) ? PlanStatus.PROVEN_INFEASIBLE : PlanStatus.FEASIBLE,
  };

  const result = {
    promises, permissions, approvals, resolutions,
    series: {
      wind: S.wind, solar: S.solar, price: S.price, carbon: S.carbon, outdoor: S.outdoor, street: S.street,
      ovens: ovens.power, cold: cold.power, ev: ev.power, evSoc: ev.soc, heat: heat.power, temp: heat.temp,
      battery: battery.power, batterySoc: battery.soc, feeder, importKw, renewFrac, homeBase,
    },
    parts: { ev, cold, heat, battery, ovens },
    modes: { ev: evMode, bakery: bakeryMode, heat: heatMode, battery: batteryMode },
    decisions, conflicts, metrics, overload,
    schedules: { ev: ev.power, bakery: cold.power, heat: heat.power, battery: battery.power },
  };
  if (withBaseline) {
    const base = simulate({ promises, permissions: { ev: 'never', heat: 'never', battery: 'never', bakery: 'never' }, withBaseline: false });
    result.baseline = base.metrics;
    result.baselineSeries = base.series;
  }
  result.explain = explainAll(result);
  return result;
}

/* ------------------------------------------------------------------ */
/* Explanations: what it knew / what it was allowed to do / what it did */
/* ------------------------------------------------------------------ */

const money = (p) => `£${(p / 100).toFixed(2)}`;

function explainAll(r) {
  const { promises: pr, permissions: pm, parts, series, metrics, modes } = r;
  const ev = parts.ev;
  const heat = parts.heat;
  const bat = parts.battery;
  const cold = parts.cold;
  const limit = SCENARIO.feederLimitKw;
  const windPeakSlot = series.wind.indexOf(Math.max(...series.wind));
  const cheapestSlot = series.price.indexOf(Math.min(...series.price));
  const evRuns = runs(ev.power);

  const permWords = {
    auto: (what) => `Move ${what} automatically inside the agreed window`,
    ask: (what) => `Propose moving ${what}, then wait for your answer`,
    never: (what) => `Never move ${what}`,
  };

  const out = {};

  out.car = {
    title: 'Your car',
    promise: `My car must be ready when I leave at ${formatClock(pr.ev.departureClock)}.`,
    short: {
      asked: `Be at ${pr.ev.targetPct}% by ${formatClock(pr.ev.departureClock)}${pr.ev.priceCapPence != null ? `, for no more than ${money(pr.ev.priceCapPence)}` : ''}.`,
      allowed: permWords[pm.ev]('charging') + '.',
      happened: modes.ev === 'auto'
        ? `Charged ${describeRuns(evRuns)}; ${Math.round(ev.reachedPct)}% at departure for ${money(ev.cost)}, ${Math.round(ev.windShare * 100)}% of it wind.`
        : `Charged as soon as it was plugged in, ${describeRuns(evRuns)}; ${Math.round(ev.reachedPct)}% at departure for ${money(ev.cost)}, ${Math.round(ev.windShare * 100)}% of it wind.`,
    },
    knew: [
      `Departure ${formatClock(pr.ev.departureClock)}; ${pr.ev.targetPct}% wanted, ${SCENARIO.ev.startPct}% on arrival: ${ev.energyNeeded.toFixed(0)} kWh into the battery, ${ev.acNeeded.toFixed(0)} kWh from the socket at ${Math.round(SCENARIO.ev.chargingEfficiency * 100)}% efficiency, ${(ev.acNeeded / SCENARIO.ev.chargerKw).toFixed(1)} h at ${SCENARIO.ev.chargerKw} kW.`,
      `The scenario's wind forecast: strongest at ${formatClock(slotHour(windPeakSlot))} (${series.wind[windPeakSlot].toFixed(0)} kW to the street).`,
      `The scenario's tariff: cheapest at ${formatClock(slotHour(cheapestSlot))} (${series.price[cheapestSlot].toFixed(0)}p), dearest in the evening (${Math.max(...series.price).toFixed(0)}p).`,
      `The street's cable carries ${limit} kW, and what the bakery and the other homes already need.`,
    ],
    allowed: [
      permWords[pm.ev]('charging') + (pm.ev === 'auto' ? ` (${formatClock(slotHour(ev.from))}–${formatClock(pr.ev.departureClock)}).` : '.'),
      pr.ev.priceCapPence != null ? `Spend no more than ${money(pr.ev.priceCapPence)}.` : 'No spending limit was set.',
      'Never trade the departure target away without asking.',
    ],
    decided: [
      modes.ev === 'auto'
        ? `Chose the ${ev.slots.length} cheapest quarter-hours that fit under the cable: ${describeRuns(evRuns, { all: true })}.`
        : `Started charging at ${formatClock(slotHour(ev.from))} and ran until full — nothing was coordinated.`,
      `Cost ${money(ev.cost)}; ${Math.round(ev.windShare * 100)}% of the charge arrived while wind and sun could cover the street.`,
      ev.feasible
        ? `Protected the target: ${Math.round(ev.reachedPct)}% at ${formatClock(pr.ev.departureClock)}.`
        : `Could not reach the target: at most ${Math.round(ev.maxPct)}% by ${formatClock(pr.ev.departureClock)} — raised it with you instead of guessing.`,
    ],
    technical: {
      status: ev.status, reasonCodes: ev.trace.reasonCodes, bindingConstraints: ev.trace.bindingConstraints, observations: ev.trace.observations,
      assumptions: [
        `Battery ${SCENARIO.ev.capacityKwh} kWh; charger ${SCENARIO.ev.chargerKw} kW AC, continuously variable; charging efficiency ${SCENARIO.ev.chargingEfficiency} constant.`,
        'Cost = the car\'s AC energy × the scenario tariff. Excludes standing charges, the rest of the home, export and any network payments.',
        'Cheapest-slot-first with per-slot caps (charger, cable headroom). For one divisible load this is optimal, so the minimum cost and the capacity/budget bounds are proofs.',
        'Aggregate real power only: no voltage, frequency, phases or losses in the cable are modelled.',
      ],
    },
  };

  const hrs = runs(heat.power);
  out.home = {
    title: 'Your home',
    promise: `Keep the house ${heat.band.words} (${heat.band.label}).`,
    short: {
      asked: `Stay between ${heat.band.label} all day.`,
      allowed: permWords[pm.heat]('heating') + '.',
      happened: modes.heat === 'auto'
        ? `Warmed early ${heat.preheatSlots * 15} min, coasted ${heat.coastSlots * 15} min${heat.shedSlots ? `, paused ${heat.shedSlots * 15} min for the cable` : ''}; ${heat.kwh.toFixed(1)} kWh for ${money(heat.cost)}, ${heat.minutesOutside === 0 ? 'never outside the band' : `${heat.minutesOutside} min outside the band`}.`
        : `Held the thermostat at ${((heat.band.low + heat.band.high) / 2).toFixed(1)} °C; ${heat.kwh.toFixed(1)} kWh for ${money(heat.cost)}.`,
    },
    knew: [
      `Your comfort band ${heat.band.label}, the house at ${SCENARIO.home.startTempC} °C at 18:00, outside falling to ${Math.min(...series.outdoor).toFixed(0)} °C.`,
      `How fast this house loses heat (${SCENARIO.home.heatLossKwPerC} kW per °C) and how much it can store (${SCENARIO.home.thermalCapacityKwhPerC} kWh per °C).`,
      `A ${SCENARIO.home.heatPumpKw} kW heat pump giving ${(SCENARIO.home.heatPumpKw * SCENARIO.home.heatPumpCop).toFixed(1)} kW of heat.`,
    ],
    allowed: [
      permWords[pm.heat]('heating') + '.',
      `Use the band as storage: warm towards ${heat.band.high} °C when electricity is cheap, coast towards ${heat.band.low} °C when it is dear.`,
      'Never let the house leave the band.',
    ],
    decided: [
      `Heat pump ran ${describeRuns(hrs)}.`,
      modes.heat === 'auto'
        ? `${heat.preheatSlots ? `Pre-warmed for ${(heat.preheatSlots * 15 / 60).toFixed(1)} h on cheap wind. ` : ''}${heat.coastSlots ? `Coasted ${(heat.coastSlots * 15 / 60).toFixed(1)} h through the dearest hours. ` : ''}${heat.shedSlots ? `Paused ${heat.shedSlots * 15} min for the cable.` : ''}`
        : 'Ran as a plain thermostat, ignoring price, wind and the cable.',
      `${heat.kwh.toFixed(1)} kWh for ${money(heat.cost)}; house ${heat.minutesOutside === 0 ? 'stayed inside the band all day' : `outside the band for ${heat.minutesOutside} min`}.`,
    ],
    technical: {
      status: PlanStatus.FEASIBLE, reasonCodes: [...new Set(heat.reasons.filter((w) => w && w !== 'thermostat').map((w) => ({ preheat: 'PREWARM_ON_CHEAP_SLOTS', coast: 'COAST_THROUGH_DEAR_SLOTS', shed: 'SHED_FOR_FEEDER_HEADROOM', hold: 'HOLD_COMFORT_FLOOR' }[w])))],
      bindingConstraints: [`comfort band ${heat.band.label}`], observations: [{ key: 'kWh', value: +heat.kwh.toFixed(2), unit: 'kWh' }, { key: 'minutesOutsideBand', value: heat.minutesOutside, unit: 'min' }],
      assumptions: [
        `T_next = T + dt × (COP × P_heat − loss × (T − T_out)) / C, with C = ${SCENARIO.home.thermalCapacityKwhPerC} kWh/°C, loss = ${SCENARIO.home.heatLossKwPerC} kW/°C, COP = ${SCENARIO.home.heatPumpCop}, heat pump ${SCENARIO.home.heatPumpKw} kW electrical. Illustrative, single-zone, no solar gain or ventilation.`,
        'Rules, in order: hold the floor; pause for the cable if the house can coast; pre-warm on the cheapest 35 % of the next 8 h; coast on the dearest 35 %; otherwise thermostat at the middle of the band.',
      ],
    },
  };

  const coldRuns = runs(cold.power);
  out.bakery = {
    title: 'The bakery',
    promise: `The bakery must open at ${formatClock(pr.bakery.openingClock)}.`,
    short: {
      asked: `Open at ${formatClock(pr.bakery.openingClock)}, with the ovens hot.`,
      allowed: permWords[pm.bakery]('the cold store') + ' The ovens are never moved.',
      happened: `Ovens preheated from ${formatClock(slotHour(parts.ovens.preheat))}; cold store ran ${describeRuns(coldRuns)} for ${money(cold.cost)}.`,
    },
    knew: [
      `Opening ${formatClock(pr.bakery.openingClock)}: ovens need ${SCENARIO.bakery.preheatHours} h at ${SCENARIO.bakery.ovenPreheatKw} kW first, then ${SCENARIO.bakery.bakingKw} kW while baking.`,
      `The cold store needs ${SCENARIO.bakery.coldStoreHours} h at ${SCENARIO.bakery.coldStoreKw} kW some time between ${formatClock(SCENARIO.bakery.coldWindowStartClock)} and ${formatClock(SCENARIO.bakery.coldWindowEndClock)}.`,
      'The tariff, the wind, and what the rest of the street had already claimed.',
    ],
    allowed: [
      'Never move the ovens: opening time is a promise to customers.',
      permWords[pm.bakery]('the cold store') + '.',
    ],
    decided: [
      `Ovens on at ${formatClock(slotHour(parts.ovens.preheat))}, doors open at ${formatClock(pr.bakery.openingClock)}.`,
      modes.bakery === 'auto'
        ? `Cold store placed in the cheapest hours that fit: ${describeRuns(coldRuns, { all: true })}, ${money(cold.cost)}.`
        : `Cold store ran at the start of its window, ${describeRuns(coldRuns)}, ${money(cold.cost)}.`,
    ],
    technical: {
      status: cold.status, reasonCodes: cold.trace.reasonCodes, bindingConstraints: cold.trace.bindingConstraints, observations: cold.trace.observations,
      assumptions: [
        `Ovens: ${SCENARIO.bakery.preheatHours} h at ${SCENARIO.bakery.ovenPreheatKw} kW before opening, then ${SCENARIO.bakery.bakingKw} kW for ${SCENARIO.bakery.bakingHours} h — an uninterrupted process locked to the opening time.`,
        `Cold store: ${SCENARIO.bakery.coldStoreHours} h at ${SCENARIO.bakery.coldStoreKw} kW in whole quarter-hours between ${formatClock(SCENARIO.bakery.coldWindowStartClock)} and ${formatClock(SCENARIO.bakery.coldWindowEndClock)}; a run is only placed where the cable has room for its full power.`,
      ],
    },
  };

  const bRuns = runs(bat.power.map((p) => Math.abs(p)));
  out.battery = {
    title: 'The home battery',
    promise: 'Store what is cheap; spend it when it matters.',
    short: {
      asked: 'Nothing directly — the battery serves the other promises.',
      allowed: permWords[pm.battery]('the battery') + '.',
      happened: modes.battery === 'auto'
        ? `Stored ${bat.chargeKwh.toFixed(1)} kWh of cheap wind; released ${bat.peakKwh.toFixed(1)} kWh at the peaks${bat.cableKwh > 0 ? ` and ${bat.cableKwh.toFixed(1)} kWh to protect the cable` : ''}. Worth ${money(-bat.cost)}.`
        : 'Sat idle at 50%: nobody was allowed to use it.',
    },
    knew: [
      `${SCENARIO.battery.capacityKwh} kWh at up to ${SCENARIO.battery.powerKw} kW, starting at ${SCENARIO.battery.startPct}%.`,
      'The tariff and the moments the street would press against its cable.',
    ],
    allowed: [
      permWords[pm.battery]('the battery') + '.',
      `Keep at least ${SCENARIO.battery.minPct}% in reserve.`,
    ],
    decided: [
      modes.battery === 'auto' ? `Active ${describeRuns(bRuns)}.` : 'Did nothing.',
      modes.battery === 'auto'
        ? `Charged in the cheapest third of the day, discharged in the dearest third${bat.cableKwh > 0 ? ' and whenever the cable was over its limit' : ''}.`
        : 'No cheap energy was stored, no peak was shaved.',
    ],
    technical: {
      status: PlanStatus.FEASIBLE, reasonCodes: [...new Set(bat.reasons.filter(Boolean).map((w) => ({ store: 'STORE_ON_CHEAP_SLOTS', peak: 'DISCHARGE_ON_DEAR_SLOTS', cable: 'DISCHARGE_FOR_FEEDER_HEADROOM' }[w])))],
      bindingConstraints: [`${SCENARIO.battery.minPct}% reserve`, `${SCENARIO.battery.powerKw} kW`], observations: [{ key: 'chargedKwh', value: +bat.chargeKwh.toFixed(2), unit: 'kWh' }, { key: 'peakKwh', value: +bat.peakKwh.toFixed(2), unit: 'kWh' }, { key: 'cableKwh', value: +bat.cableKwh.toFixed(2), unit: 'kWh' }],
      assumptions: ['Round-trip losses are not modelled in this version; 100 % efficiency is an acknowledged simplification. Export earns the same price as import in the scenario.'],
    },
  };

  out.wind = {
    title: 'The wind',
    promise: 'Blows when it blows.',
    short: {
      asked: 'Nothing — the wind has no requirements.',
      allowed: 'Nothing to decide: generation follows the weather.',
      happened: `Strongest at ${formatClock(slotHour(windPeakSlot))}; ${Math.round(metrics.streetRenewableShare * 100)}% of the street's energy today could be covered by wind and sun.`,
    },
    knew: [`The forecast: ${series.wind[windPeakSlot].toFixed(0)} kW available to the street at ${formatClock(slotHour(windPeakSlot))}, fading to ${Math.min(...series.wind).toFixed(0)} kW mid-morning.`],
    allowed: ['Nothing. The orchestra cannot make the wind blow; it can only move the things that wait for it.'],
    decided: [`${Math.round(ev.windShare * 100)}% of the car's charge and ${Math.round(metrics.streetRenewableShare * 100)}% of the street's day landed on wind and sun.`],
  };

  out.substation = {
    title: 'The street\'s cable',
    promise: `Never carry more than ${limit} kW.`,
    short: {
      asked: 'Nothing — it is a physical limit, not a preference.',
      allowed: 'Nothing can be negotiated with a cable.',
      happened: metrics.overloadMinutes === 0
        ? `Peak ${metrics.peakKw.toFixed(0)} kW at ${formatClock(slotHour(metrics.peakSlot))}: ${(limit - metrics.peakKw).toFixed(0)} kW of headroom kept.`
        : `Over its limit for ${metrics.overloadMinutes} minutes; peak ${metrics.peakKw.toFixed(0)} kW at ${formatClock(slotHour(metrics.peakSlot))}.`,
    },
    knew: [`The cable's rating: ${limit} kW for the whole street, whatever the wind is doing far away.`],
    allowed: ['Software cannot wish this limit away. It can only move loads so that they do not all arrive at once.'],
    decided: [
      metrics.overloadMinutes === 0
        ? `Held. Peak ${metrics.peakKw.toFixed(0)} kW at ${formatClock(slotHour(metrics.peakSlot))}.`
        : `Breached for ${metrics.overloadMinutes} min. Something must be allowed to move.`,
    ],
  };

  out.street = {
    title: 'The other homes',
    promise: 'Life carries on.',
    short: {
      asked: 'Dinner, showers, screens, the school run: the ordinary shape of a day.',
      allowed: 'Not part of this story: their demand is taken as given.',
      happened: `Evening peak ${Math.max(...series.street).toFixed(0)} kW; quietest ${Math.min(...series.street).toFixed(0)} kW in the small hours.`,
    },
    knew: ['A typical demand curve for 38 homes, from the scenario.'],
    allowed: ['Nothing to move here — this is the backdrop the orchestra works around.'],
    decided: ['Their peaks decided where the cable was tight, and therefore where the car and the cold store could not go.'],
  };

  out.sun = {
    title: 'The rooftops',
    promise: 'Shine when the sky is clear.',
    short: {
      asked: 'Nothing.',
      allowed: 'Nothing to decide.',
      happened: `Peaked at ${Math.max(...series.solar).toFixed(0)} kW around midday and trimmed the cable's load behind the substation.`,
    },
    knew: ['A clear March day: rooftop panels across the street.'],
    allowed: ['Nothing. It is behind the substation, so it eases the cable directly.'],
    decided: [`Midday import fell by up to ${Math.max(...series.solar).toFixed(0)} kW.`],
  };

  return out;
}

/* ------------------------------------------------------------------ */
/* Lessons: what this particular day taught, computed from the result   */
/* ------------------------------------------------------------------ */

export function lessons(r, prev, opts = {}) {
  const m = r.metrics;
  const b = r.baseline;
  const out = [];
  const ev = r.parts.ev;

  if (b && r.modes.ev === 'auto' && ev.delivered > 0) {
    const moved = Math.abs(runs(r.baselineSeries.ev)[0]?.from - (runs(ev.power)[0]?.from ?? 0)) * DT;
    if (moved >= 1) {
      out.push({
        key: 'ev-shift', icon: 'car',
        text: `Moving ${ev.delivered.toFixed(0)} kWh of charging by ${moved.toFixed(0)} hours turned ${Math.round(ev.windShare * 100)}% of your car's energy into wind energy, and cut its cost from ${money(b.evCostPence)} to ${money(ev.cost)}.`,
      });
    }
  }
  if (b && m.overloadMinutes === 0 && b.overloadMinutes > 0) {
    out.push({
      key: 'cable-held', icon: 'substation',
      text: `Without coordination the street's cable would have been over its limit for ${b.overloadMinutes} minutes. The orchestra spread the same energy so the peak stayed at ${m.peakKw.toFixed(0)} of ${m.limitKw} kW. The cable, not the amount of electricity, was the binding limit.`,
    });
  }
  if (m.overloadMinutes > 0) {
    out.push({
      key: 'cable-breached', icon: 'substation',
      text: `The cable was over its limit for ${m.overloadMinutes} minutes. Software cannot wish a physical limit away; it can only ask for permission to move things.`,
    });
  }
  if (opts.pending) {
    out.push({
      key: 'ask-cost', icon: 'hand',
      text: `A change to the agreed plan is waiting for you. Until you answer, the world keeps the plan you already accepted: nothing is changed behind your back, and the new promise is not confirmed. Staying in control is allowed to cost something.`,
    });
  }
  if (opts.declined) {
    out.push({
      key: 'declined', icon: 'hand',
      text: `You declined a change. The agreed plan and the agreed promise stayed in force; the system did not quietly do it anyway. That boundary is the point, not a failure.`,
    });
  }
  if (r.parts.heat.preheatSlots > 0 && r.modes.heat === 'auto') {
    const h = r.parts.heat;
    out.push({
      key: 'comfort-storage', icon: 'home',
      text: `Your comfort band of ${(h.band.high - h.band.low).toFixed(0)} °C worked as ${((h.band.high - h.band.low) * SCENARIO.home.thermalCapacityKwhPerC).toFixed(0)} kWh of storage: the house was warmed on cheap wind and coasted through the dear hours without ever leaving ${h.band.label}.`,
    });
  }
  if (r.conflicts.some((c) => c.id === 'ev-price')) {
    const c = r.conflicts.find((x) => x.id === 'ev-price');
    out.push({
      key: 'tradeoff', icon: 'car',
      text: c.resolved
        ? `You chose ${c.chosen === 'price' ? 'the price limit over the departure target' : 'the departure target over the price limit'}. The system could not decide that for you, and it should not.`
        : 'Two of your requirements could not both be met. A good system makes that conflict explicit rather than quietly picking one.',
    });
  }
  if (prev && prev.metrics) {
    const d = m.homeCostPence - prev.metrics.homeCostPence;
    const dw = m.evWindShare - prev.metrics.evWindShare;
    if (Math.abs(d) > 20 || Math.abs(dw) > 0.05) {
      out.push({
        key: 'replay', icon: 'replay',
        text: `Same equipment. Same weather. Different human requirements: your home's day now costs ${money(m.homeCostPence)} (${d >= 0 ? '+' : '−'}${money(Math.abs(d))}) and your car's charge is ${Math.round(m.evWindShare * 100)}% wind (${dw >= 0 ? '+' : '−'}${Math.round(Math.abs(dw) * 100)} points).`,
      });
    }
  }
  if (!out.length) {
    out.push({ key: 'quiet', icon: 'wind', text: `A quiet day: every promise kept, ${Math.round(m.streetRenewableShare * 100)}% of the street's energy on wind and sun, and the cable never above ${m.peakKw.toFixed(0)} kW.` });
  }
  return out.slice(0, 4);
}

export { formatClock, slotHour, slotClock, clockToSlot, SLOTS, DT };
