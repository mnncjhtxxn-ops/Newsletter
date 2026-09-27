import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, lessons, runs } from '../src/sim/engine.js';
import { SLOTS, clockToSlot, formatClock, SCENARIO } from '../src/sim/scenario.js';

const sumSeries = (s) => Array.from(s).reduce((a, b) => a + b, 0);

test('time helpers', () => {
  assert.equal(clockToSlot(18), 0);
  assert.equal(clockToSlot(7), 52);
  assert.equal(formatClock(31), '07:00');
  assert.equal(formatClock(5.5), '05:30');
});

test('default day: promises kept, no conflicts, cable held', () => {
  const r = simulate();
  assert.equal(r.conflicts.length, 0, JSON.stringify(r.conflicts));
  assert.ok(r.metrics.evReadyPct >= 79.9, `ev ready ${r.metrics.evReadyPct}`);
  assert.equal(r.metrics.overloadMinutes, 0);
  assert.equal(r.metrics.comfortMinutesOutside, 0);
  assert.ok(r.metrics.evWindShare > 0.9, `wind share ${r.metrics.evWindShare}`);
  assert.ok(r.metrics.homeCostPence < r.baseline.homeCostPence, 'orchestra cheaper than no coordination');
  // charging sits in the night, not the evening
  const first = runs(r.series.ev)[0];
  assert.ok(first.from >= 12, `charging starts at slot ${first.from}`); // 21:00 or later
});

test('energy delivered to the car matches the promise exactly', () => {
  const r = simulate();
  const kwh = sumSeries(r.series.ev) * 0.25;
  assert.ok(Math.abs(kwh - 54) < 1e-6, `delivered ${kwh}`);
});

test('no coordination: everything runs at once and the cable is breached', () => {
  const r = simulate({ permissions: { ev: 'never', heat: 'never', battery: 'never', bakery: 'never' } });
  assert.ok(r.metrics.overloadMinutes > 0, 'expected an overload with nothing coordinated');
  const cable = r.conflicts.find((c) => c.id === 'cable');
  assert.ok(cable, 'cable conflict raised');
  assert.equal(cable.options.length, 4);
  assert.ok(r.metrics.evReadyPct >= 79.9);
});

test('earlier departure changes the schedule but keeps the target', () => {
  const a = simulate();
  const b = simulate({ promises: { ev: { departureClock: 5 } } });
  assert.ok(b.metrics.evReadyPct >= 79.9);
  assert.notDeepEqual(Array.from(a.series.ev), Array.from(b.series.ev));
  assert.ok(runs(b.series.ev)[0].from < runs(a.series.ev)[0].from, 'charging starts earlier');
});

test('price cap can conflict with the departure target and be resolved either way', () => {
  const r = simulate({ promises: { ev: { departureClock: 4.5, targetPct: 100, priceCapPence: 400 } } });
  const c = r.conflicts.find((x) => x.id === 'ev-price');
  assert.ok(c, 'price conflict expected: ' + JSON.stringify(r.conflicts.map((x) => x.id)));
  assert.equal(c.resolved, false);
  assert.ok(r.metrics.evReadyPct >= 99.9, 'default keeps the departure target');
  const p = simulate({ promises: { ev: { departureClock: 4.5, targetPct: 100, priceCapPence: 400 } }, resolutions: { evPriority: 'price' } });
  assert.ok(p.parts.ev.cost <= 400 + 1e-6, `cost ${p.parts.ev.cost}`);
  assert.ok(p.metrics.evReadyPct < 99.9);
});

test('an impossible departure is reported, not silently missed', () => {
  // 100% needed = 72 kWh = 6.5 h; leaving at 22:30 is impossible: use targetPct 100 and departure 00:00 (slot 24 = 6 h window)
  const r = simulate({ promises: { ev: { departureClock: 0, targetPct: 100 } } });
  const c = r.conflicts.find((x) => x.id === 'ev-feasible');
  assert.ok(c);
  assert.ok(r.metrics.evReadyPct < 100);
});

test('ask-me-first creates a request and runs the default until approved', () => {
  const r = simulate({ permissions: { ev: 'ask' } });
  assert.equal(r.requests.length, 1);
  assert.equal(r.requests[0].id, 'ev');
  assert.ok(r.requests[0].saving > 0);
  assert.equal(r.modes.ev, 'immediate');
  const approved = simulate({ permissions: { ev: 'ask' }, approvals: { ev: true } });
  assert.equal(approved.modes.ev, 'auto');
  assert.equal(approved.requests.length, 0);
  const declined = simulate({ permissions: { ev: 'ask' }, approvals: { ev: false } });
  assert.equal(declined.modes.ev, 'immediate');
  assert.equal(declined.requests[0].declined, true);
});

test('comfort band is never violated in any mode', () => {
  for (const comfort of ['tight', 'normal', 'relaxed']) {
    for (const heat of ['auto', 'never']) {
      const r = simulate({ promises: { home: { comfort } }, permissions: { heat } });
      assert.equal(r.metrics.comfortMinutesOutside, 0, `${comfort}/${heat}`);
    }
  }
});

test('battery never leaves its bounds', () => {
  const r = simulate();
  for (const e of r.series.batterySoc) {
    assert.ok(e >= SCENARIO.battery.capacityKwh * SCENARIO.battery.minPct / 100 - 1e-6 && e <= SCENARIO.battery.capacityKwh + 1e-6);
  }
});

test('explanations and lessons are produced for every node', () => {
  const r = simulate();
  for (const k of ['car', 'home', 'bakery', 'battery', 'wind', 'substation', 'street', 'sun']) {
    assert.ok(r.explain[k].short.asked && r.explain[k].knew.length && r.explain[k].decided.length, k);
  }
  const l = lessons(r);
  assert.ok(l.length >= 1 && l.length <= 4);
  assert.ok(l.every((x) => x.text.length > 20));
});

test('bakery opening time moves the ovens and every feasible combination stays sane', () => {
  for (const openingClock of [4, 5, 6, 7]) {
    for (const departureClock of [4, 5, 6, 7, 8, 10]) {
      const r = simulate({ promises: { bakery: { openingClock }, ev: { departureClock } } });
      assert.equal(r.series.feeder.length, SLOTS);
      assert.ok(Number.isFinite(r.metrics.homeCostPence));
      assert.ok(r.metrics.evReadyPct >= 79.9, `${openingClock}/${departureClock} => ${r.metrics.evReadyPct}`);
    }
  }
});
