/**
 * A single verified planner for one deadline load (a car to charge, a cold
 * store to run): choose the cheapest available quarter-hours that fit under
 * the cable, until the required energy is scheduled.
 *
 * For one divisible load with independent per-slot caps, cheapest-first is
 * optimal, so the minimum cost it returns is a true minimum and the bounds
 * it reports are proofs, not the failure of a heuristic:
 *   - capacity bound: sum of (cap × dt × efficiency) over the window
 *   - budget bound:  the most energy the money can buy in the cheapest slots
 * That is what allows the status PROVEN_INFEASIBLE to be used honestly.
 *
 * No dependency on the renderer or the DOM. Units are explicit.
 */

export const PlanStatus = Object.freeze({
  FEASIBLE: 'FEASIBLE',
  PROVEN_INFEASIBLE: 'PROVEN_INFEASIBLE',
  NO_PLAN_FOUND: 'NO_PLAN_FOUND',
  AWAITING_PERMISSION: 'AWAITING_PERMISSION',
  ERROR: 'ERROR',
});

const EPS = 1e-9;

/**
 * @param {object} p
 * @param {number[]} p.pricePencePerKwh  per slot
 * @param {number[]} p.headroomKw         per slot: what the cable can still carry (may be ≤ 0)
 * @param {boolean[]} [p.available]       per slot: is the device present / allowed (default true)
 * @param {number} p.dtHours
 * @param {number} p.maxPowerKw           device limit (charger / appliance)
 * @param {number} p.energyNeededKwh      energy to deliver INTO the device (after losses)
 * @param {number} [p.efficiency=1]       fraction of AC energy that ends up stored
 * @param {number|null} [p.capPence]      hard spending limit on this load's energy
 * @param {'target'|'budget'} [p.priority='target']  when both cannot be met, which one wins
 * @param {boolean} [p.divisible=true]    false → whole slots at maxPowerKw only
 */
export function planLoad(p) {
  const n = p.pricePencePerKwh.length;
  const dt = p.dtHours;
  const eta = p.efficiency ?? 1;
  const divisible = p.divisible !== false;
  const acNeededKwh = p.energyNeededKwh / eta;
  const trace = { reasonCodes: [], bindingConstraints: [], observations: [] };

  // Per-slot AC energy caps.
  const capKwh = new Float64Array(n);
  let feederBinding = false;
  for (let i = 0; i < n; i++) {
    const avail = p.available ? p.available[i] : true;
    const head = Math.max(0, p.headroomKw[i]);
    if (head + EPS < p.maxPowerKw) feederBinding = true;
    let kw = avail ? Math.min(p.maxPowerKw, head) : 0;
    if (!divisible && kw + EPS < p.maxPowerKw) kw = 0;
    capKwh[i] = kw * dt;
  }
  const order = [...Array(n).keys()].filter((i) => capKwh[i] > EPS).sort((a, b) => p.pricePencePerKwh[a] - p.pricePencePerKwh[b] || a - b);

  // Capacity bound.
  let maxAcKwh = 0;
  for (const i of order) maxAcKwh += capKwh[i];
  trace.observations.push({ key: 'acNeededKwh', value: round(acNeededKwh), unit: 'kWh' });
  trace.observations.push({ key: 'maxAcKwhInWindow', value: round(maxAcKwh), unit: 'kWh' });

  // Cheapest-first fill.
  const acKwh = new Float64Array(n);
  let remaining = acNeededKwh;
  let cost = 0;
  for (const i of order) {
    if (remaining <= EPS) break;
    const e = divisible ? Math.min(capKwh[i], remaining) : capKwh[i];
    acKwh[i] = e;
    remaining -= e;
    cost += e * p.pricePencePerKwh[i];
  }
  const capacityShort = remaining > 1e-6;
  const minCostPence = cost;

  let status = PlanStatus.FEASIBLE;
  let boundReason = null;
  let maxAddedWithinBudgetKwh = null;

  if (capacityShort) {
    status = PlanStatus.PROVEN_INFEASIBLE;
    // Attribute the bound honestly: the cable is the reason only if the
    // charger alone, over the same window, could have delivered the energy.
    let unconstrained = 0;
    for (let i = 0; i < n; i++) if (p.available ? p.available[i] : true) unconstrained += p.maxPowerKw * dt;
    const cableIsTheReason = feederBinding && unconstrained + EPS >= acNeededKwh;
    boundReason = cableIsTheReason ? 'FEEDER_HEADROOM_BINDING' : 'CHARGER_POWER_AND_TIME_LIMIT';
    trace.reasonCodes.push(boundReason);
    trace.bindingConstraints.push(cableIsTheReason ? 'feeder headroom' : 'charger power × available time');
    trace.observations.push({ key: 'maxAcKwhWithoutCable', value: round(unconstrained), unit: 'kWh' });
  }

  if (p.capPence != null && minCostPence > p.capPence + 1e-6) {
    // Budget bound: the most AC energy the money buys, cheapest slots first.
    let budget = p.capPence;
    let bought = 0;
    const acWithin = new Float64Array(n);
    for (const i of order) {
      if (budget <= EPS) break;
      const price = p.pricePencePerKwh[i];
      const affordable = price > 0 ? budget / price : capKwh[i];
      const e = Math.min(capKwh[i], affordable, acNeededKwh - bought);
      if (e <= EPS) continue;
      acWithin[i] = e;
      bought += e;
      budget -= e * price;
    }
    maxAddedWithinBudgetKwh = bought * eta;
    trace.reasonCodes.push('BUDGET_TARGET_CONFLICT');
    trace.bindingConstraints.push(`spending limit ${p.capPence}p`);
    trace.observations.push({ key: 'minCostPence', value: round(minCostPence), unit: 'p' });
    trace.observations.push({ key: 'maxAddedWithinBudgetKwh', value: round(maxAddedWithinBudgetKwh), unit: 'kWh' });
    if (status === PlanStatus.FEASIBLE) status = PlanStatus.PROVEN_INFEASIBLE;
    boundReason ??= 'BUDGET_TARGET_CONFLICT';
    if ((p.priority || 'target') === 'budget') {
      acKwh.set(acWithin);
      cost = 0;
      for (let i = 0; i < n; i++) cost += acKwh[i] * p.pricePencePerKwh[i];
    }
  }

  if (status === PlanStatus.FEASIBLE) {
    const cheapest = Math.min(...p.pricePencePerKwh.filter((_, i) => capKwh[i] > EPS));
    const usedDearer = order.some((i) => acKwh[i] > EPS && p.pricePencePerKwh[i] > cheapest + EPS);
    trace.reasonCodes.push('CHEAPER_SLOTS_USED');
    if (usedDearer) { trace.reasonCodes.push('CHEAP_WINDOW_CAPACITY_LIMIT'); trace.bindingConstraints.push('cheap window too short at this power'); }
    if (feederBinding && order.some((i) => acKwh[i] > EPS && capKwh[i] + EPS < p.maxPowerKw * dt)) { trace.reasonCodes.push('FEEDER_HEADROOM_BINDING'); trace.bindingConstraints.push('feeder headroom'); }
  }

  let acTotal = 0;
  for (let i = 0; i < n; i++) acTotal += acKwh[i];
  const powerKw = Float64Array.from(acKwh, (e) => e / dt);
  return {
    status, boundReason,
    powerKw, acKwhPerSlot: acKwh,
    acKwh: acTotal, addedKwh: acTotal * eta, acNeededKwh,
    costPence: cost, minCostPence,
    maxAcKwh, maxAddedKwh: maxAcKwh * eta,
    maxAddedWithinBudgetKwh,
    shortfallKwh: Math.max(0, p.energyNeededKwh - acTotal * eta),
    trace,
  };
}

function round(v) { return Math.round(v * 1e6) / 1e6; }

/**
 * Authority review. The world runs on the last ACCEPTED plan. A proposed
 * plan replaces it only where the visitor's permission allows:
 *   auto  – accepted immediately
 *   ask   – if this load's schedule would change, it waits for a yes/no
 *   never – the load is not the orchestra's to plan (handled upstream)
 * Nothing is dispatched while a request is pending, and a declined request
 * leaves the accepted plan and the accepted promise in force.
 *
 * @param {object} a
 * @param {Record<string, Float64Array|number[]>} a.accepted  schedules by load id
 * @param {Record<string, Float64Array|number[]>} a.proposed  schedules by load id
 * @param {Record<string, 'auto'|'ask'|'never'>} a.permissions
 * @param {'approved'|'declined'|undefined} a.decision  the visitor's answer to the current proposal
 */
export function reviewAuthority(a) {
  const changed = [];
  for (const id in a.proposed) {
    if (a.permissions[id] !== 'ask') continue;
    const acc = a.accepted[id];
    const prop = a.proposed[id];
    if (!acc) continue;
    let differs = false;
    for (let i = 0; i < prop.length; i++) if (Math.abs((acc[i] || 0) - prop[i]) > 1e-6) { differs = true; break; }
    if (differs) changed.push(id);
  }
  if (!changed.length || a.decision === 'approved') return { status: PlanStatus.FEASIBLE, dispatched: 'proposed', pending: [], changed };
  if (a.decision === 'declined') return { status: PlanStatus.FEASIBLE, dispatched: 'accepted', pending: [], changed, declined: true };
  return { status: PlanStatus.AWAITING_PERMISSION, dispatched: 'accepted', pending: changed, changed };
}
