import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLoad, reviewAuthority, PlanStatus } from '../src/sim/planner.js';

const raw = JSON.parse(readFileSync(new URL('../scenarios/EV_NUMERICAL_FIXTURES_v1.0.json', import.meta.url), 'utf8'));
// Adapt the handover's minutes-based fixture to the planner's inputs.
const B = raw.baseScenario;
const fx = {
  horizon: { startClock: B.horizonStartMinutes / 60, endClock: B.horizonEndMinutes / 60, slotMinutes: B.slotMinutes },
  ev: { capacityKwh: B.batteryCapacityKWh, initialKwh: B.initialStoredEnergyKWh, requiredKwh: B.targetStoredEnergyKWh, chargingEfficiency: B.chargeEfficiency, chargerKw: B.chargerMaxACPowerKW },
  tariff: B.tariffBands.map((b) => ({ fromClock: b.startMinutes / 60, toClock: b.endMinutes / 60, pencePerKwh: Math.round(b.priceGBPPerKWh * 100) })),
  essentialLoadKw: B.essentialFeederLoadKW,
  cases: raw.tests.filter((t) => !t.kind).map((t) => {
    const o = { ...B, ...t.overrides }; const e = t.expected;
    return { id: t.id, departureClock: o.departureMinutes / 60, capPence: o.hardMaxCostGBP == null ? null : Math.round(o.hardMaxCostGBP * 100), feederLimitKw: o.gridImportLimitKW,
      expect: { status: e.status, acKwh: e.ACInputEnergyKWh, addedKwh: e.energyAddedKWh, finalKwh: e.finalStoredEnergyKWh, costPence: e.minimumChargingCostGBP == null ? undefined : Math.round(e.minimumChargingCostGBP * 100), maxFinalKwh: e.diagnosticMaxFinalEnergyKWh, shortfallKwh: e.diagnosticShortfallKWh, reason: e.reason } };
  }),
};
const EPS_KWH = 1e-6;
const close = (a, b, eps = EPS_KWH) => Math.abs(a - b) <= eps;

function buildCase(c) {
  const { startClock, endClock, slotMinutes } = fx.horizon;
  const dt = slotMinutes / 60;
  const n = Math.round((endClock - startClock) / dt);
  const price = [], headroom = [], available = [];
  for (let i = 0; i < n; i++) {
    const clock = startClock + i * dt;
    const band = fx.tariff.find((b) => clock >= b.fromClock && clock < b.toClock);
    price.push(band.pencePerKwh);
    headroom.push(c.feederLimitKw - fx.essentialLoadKw);
    available.push(clock < c.departureClock);
  }
  return planLoad({
    pricePencePerKwh: price, headroomKw: headroom, available, dtHours: dt,
    maxPowerKw: fx.ev.chargerKw, energyNeededKwh: fx.ev.requiredKwh - fx.ev.initialKwh,
    efficiency: fx.ev.chargingEfficiency, capPence: c.capPence,
  });
}

for (const c of fx.cases) {
  test(`${c.id}: departure ${c.departureClock}:00, cap ${c.capPence ?? 'none'}, feeder ${c.feederLimitKw} kW`, () => {
    const r = buildCase(c);
    const e = c.expect;
    assert.equal(r.status, e.status, `status ${r.status}, reasons ${r.trace.reasonCodes}`);
    if (e.acKwh != null) assert.ok(close(r.acKwh, e.acKwh), `AC ${r.acKwh}`);
    if (e.addedKwh != null) assert.ok(close(r.addedKwh, e.addedKwh), `added ${r.addedKwh}`);
    if (e.finalKwh != null) assert.ok(close(fx.ev.initialKwh + r.addedKwh, e.finalKwh), `final ${fx.ev.initialKwh + r.addedKwh}`);
    if (e.costPence != null) assert.ok(close(r.costPence, e.costPence, 1e-6), `cost ${r.costPence}p`);
    if (e.reason) assert.ok(r.trace.reasonCodes.includes(e.reason), `reason ${e.reason} not in ${r.trace.reasonCodes}`);
    if (e.maxFinalKwh != null) {
      const maxFinal = fx.ev.initialKwh + (r.maxAddedWithinBudgetKwh ?? r.maxAddedKwh);
      assert.ok(close(maxFinal, e.maxFinalKwh), `max final ${maxFinal}`);
      assert.ok(close(fx.ev.requiredKwh - maxFinal, e.shortfallKwh), `shortfall ${fx.ev.requiredKwh - maxFinal}`);
    }
  });
}

test('F01 schedule: earlier tie-break puts the dear portion at 01:00–02:00 and the cheap portion at 05:00–07:00', () => {
  const r = buildCase(fx.cases[0]);
  const kw = Array.from(r.powerKw);
  assert.deepEqual(kw.slice(0, 4).map((v) => +v.toFixed(3)), [7.2, 7.2, 7.2, 0.8]);
  assert.ok(kw.slice(4, 16).every((v) => v === 0));
  assert.ok(kw.slice(16, 24).every((v) => close(v, 7.2)));
});

test('F07: identical inputs give identical schedule, metrics and trace', () => {
  const a = buildCase(fx.cases[0]);
  const b = buildCase(fx.cases[0]);
  assert.deepEqual(Array.from(a.powerKw), Array.from(b.powerKw));
  assert.deepEqual(a.trace, b.trace);
  assert.equal(a.costPence, b.costPence);
});

test('F08: rescheduling that requires approval is not dispatched while pending; decline keeps the accepted plan', () => {
  const accepted = buildCase(fx.cases[0]).powerKw; // 07:00 plan, agreed
  const proposed = buildCase(fx.cases[1]).powerKw; // 05:00 plan, requested
  const pending = reviewAuthority({ accepted: { ev: accepted }, proposed: { ev: proposed }, permissions: { ev: 'ask' } });
  assert.equal(pending.status, PlanStatus.AWAITING_PERMISSION);
  assert.equal(pending.dispatched, 'accepted');
  assert.deepEqual(pending.pending, ['ev']);
  const yes = reviewAuthority({ accepted: { ev: accepted }, proposed: { ev: proposed }, permissions: { ev: 'ask' }, decision: 'approved' });
  assert.equal(yes.dispatched, 'proposed');
  const no = reviewAuthority({ accepted: { ev: accepted }, proposed: { ev: proposed }, permissions: { ev: 'ask' }, decision: 'declined' });
  assert.equal(no.dispatched, 'accepted');
  assert.equal(no.declined, true);
  // automatic permission needs no approval; an unchanged schedule needs none either
  const auto = reviewAuthority({ accepted: { ev: accepted }, proposed: { ev: proposed }, permissions: { ev: 'auto' } });
  assert.equal(auto.status, PlanStatus.FEASIBLE);
  const same = reviewAuthority({ accepted: { ev: accepted }, proposed: { ev: accepted }, permissions: { ev: 'ask' } });
  assert.equal(same.status, PlanStatus.FEASIBLE);
});

test('bounds are proofs: no schedule can beat the reported minimum cost or exceed the capacity bound', () => {
  const r = buildCase(fx.cases[0]);
  // brute-force check on a coarse grid: any allocation of 20 kWh across the 24 slots at ≤ 1.8 kWh each costs ≥ £3.12
  const price = fx.tariff.flatMap((b) => Array(Math.round((b.toClock - b.fromClock) * 4)).fill(b.pencePerKwh));
  let best = Infinity;
  for (let cheap = 0; cheap <= 14.4 + 1e-9; cheap += 0.1) {
    const dear = 20 - cheap; if (dear < 0 || dear > 16 * 1.8) continue;
    best = Math.min(best, cheap * 10 + dear * 30);
  }
  assert.ok(close(best, r.minCostPence, 1e-6));
  assert.ok(close(r.maxAcKwh, 24 * 1.8));
  assert.equal(price.length, 24);
});
