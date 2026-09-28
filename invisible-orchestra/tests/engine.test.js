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

test('energy delivered to the car matches the promise exactly, after charging losses', () => {
  const r = simulate();
  const ac = sumSeries(r.series.ev) * 0.25;
  const needed = (80 - 20) / 100 * SCENARIO.ev.capacityKwh;
  assert.ok(Math.abs(ac * SCENARIO.ev.chargingEfficiency - needed) < 1e-6, `stored ${ac * SCENARIO.ev.chargingEfficiency} vs ${needed}`);
  assert.equal(r.parts.ev.status, 'FEASIBLE');
});

test('N02: energy balances in every slot (import + solar + discharge = loads + charge)', () => {
  for (const [perms, promises] of [[{}, {}], [{ ev: 'never', heat: 'never', battery: 'never', bakery: 'never' }, {}], [{}, { ev: { exportAllowed: true }, battery: { mode: 'trade' } }], [{ ev: 'never', battery: 'never' }, {}]]) {
    const r = simulate({ permissions: perms, promises });
    const s = r.series;
    for (let i = 0; i < SLOTS; i++) {
      const loads = s.street[i] + s.homeBase[i] + s.ovens[i] + s.cold[i] + Math.max(0, s.ev[i]) + s.heat[i] + Math.max(0, s.battery[i]);
      const supply = s.feeder[i] + s.solar[i] + Math.max(0, -s.battery[i]) + Math.max(0, -s.ev[i]) + s.lend[i];
      assert.ok(Math.abs(loads - supply) < 1e-9, `slot ${i}: loads ${loads} supply ${supply}`);
    }
  }
});

test('N03: the car never charges after it has left; the cold store never runs outside its window', () => {
  for (const dep of [4, 5.5, 7, 10]) {
    const r = simulate({ promises: { ev: { departureClock: dep } } });
    for (let i = r.parts.ev.depart; i < SLOTS; i++) assert.equal(r.series.ev[i], 0, `charging at slot ${i} after departure ${dep}`);
    for (let i = 0; i < SLOTS; i++) if (r.series.cold[i] > 0) assert.ok(i >= r.parts.cold.from && i < r.parts.cold.to);
  }
});

test('the orchestra never breaches the cable by itself: any overload comes from loads it may not move', () => {
  const r = simulate();
  assert.equal(r.metrics.overloadMinutes, 0);
  assert.equal(r.metrics.lentKwh, 0, 'a coordinated default day never needs the street to lend');
  // without the street's pool, uncoordinated evening charging with no battery cover breaches the cable
  const s = simulate({ permissions: { ev: 'never', battery: 'never' }, streetPool: false });
  assert.ok(s.metrics.overloadMinutes > 0, 'uncoordinated evening charging with no battery cover breaches the cable');
  const cable = s.conflicts.find((c) => c.id === 'cable');
  assert.deepEqual(cable.options.map((o) => o.id), ['unlock-ev', 'unlock-battery']);
  // with the pool, the network asks the street and the street covers it
  const t = simulate({ permissions: { ev: 'never', battery: 'never' } });
  assert.ok(t.metrics.lentKwh > 0, 'the street lent');
  assert.ok(t.metrics.overloadMinutes < s.metrics.overloadMinutes, 'lending shortens or removes the overload');
  assert.ok(t.decisions.some((d) => d.node === 'street'), 'the lending is a recorded decision');
});

test('no coordination: everything runs at once and the cable is breached; the pool does not answer for nobody', () => {
  const r = simulate({ permissions: { ev: 'never', heat: 'never', battery: 'never', bakery: 'never' } });
  assert.ok(r.metrics.overloadMinutes > 0, 'expected an overload with nothing coordinated');
  assert.equal(r.metrics.lentKwh, 0, 'no coordination means no pool');
  const cable = r.conflicts.find((c) => c.id === 'cable');
  assert.ok(cable, 'cable conflict raised');
  assert.equal(cable.options.length, 4);
  assert.ok(r.metrics.evReadyPct >= 79.9);
});

test('street lending is bounded by the pool: a long overload exhausts it and the conflict remains', () => {
  // everything locked but the bakery cold store: the pool is asked for hours and runs dry
  const r = simulate({ permissions: { ev: 'never', heat: 'never', battery: 'never' }, promises: { ev: { targetPct: 100 } } });
  assert.ok(r.metrics.lentKwh > 0);
  assert.ok(r.metrics.lentKwh <= SCENARIO.street.poolKwh + 1e-9, 'never more than the pool');
  for (let i = 0; i < SLOTS; i++) assert.ok(r.series.lend[i] <= SCENARIO.street.poolKw + 1e-9);
  if (r.metrics.poolExhausted) {
    assert.ok(r.metrics.overloadMinutes > 0, 'an exhausted pool leaves the overload');
    assert.ok(r.conflicts.find((c) => c.id === 'cable').text.includes('everything they had'));
  }
});

test('vehicle to grid: the car sells at the evening peak, keeps its reserve, and still leaves at the target', () => {
  const off = simulate();
  const on = simulate({ promises: { ev: { exportAllowed: true } } });
  const ev = on.parts.ev;
  assert.ok(ev.exportKwh > 0, 'exported');
  assert.ok(ev.exportKwh <= SCENARIO.ev.exportCapKwh + 1e-9);
  assert.ok(ev.minSocPct >= SCENARIO.ev.exportReservePct - 1e-6, `reserve kept: ${ev.minSocPct}`);
  assert.ok(on.metrics.evReadyPct >= 79.9, 'target still met');
  for (let i = 0; i < SLOTS; i++) if (on.series.ev[i] < 0) assert.ok(on.series.price[i] >= SCENARIO.ev.exportPriceFloorPence, `export only when dear (slot ${i})`);
  assert.ok(ev.exportEarnPence > 0);
  assert.ok(on.metrics.homeCostPence < off.metrics.homeCostPence, 'selling dear and buying cheap pays');
  assert.ok(on.metrics.peakKw <= off.metrics.peakKw + 1e-9, 'export at the peak never raises the street peak');
  assert.equal(on.metrics.overloadMinutes, 0);
  assert.ok(on.decisions.some((d) => d.node === 'car' && d.text.includes('selling')));
  // export shrinks to nothing rather than breaking the promise
  const tight = simulate({ promises: { ev: { exportAllowed: true, departureClock: 4, targetPct: 100 } } });
  assert.ok(tight.parts.ev.exportKwh === 0 || tight.metrics.evReadyPct >= 99.9, 'no export that breaks the promise');
});

test('battery trading: trade mode sells into the dear evening and stores the sun surplus; bounds hold', () => {
  const keep = simulate();
  const trade = simulate({ promises: { battery: { mode: 'trade' } } });
  const b = trade.parts.battery;
  assert.ok(b.sellKwh > 0, 'sold');
  assert.ok(b.solarKwh > 0, 'stored sun surplus');
  for (let i = 0; i < SLOTS; i++) if (b.reasons[i] === 'sell') assert.ok(trade.series.price[i] >= b.sellFloorPence - 1e-9);
  for (const e of trade.series.batterySoc) assert.ok(e >= SCENARIO.battery.capacityKwh * SCENARIO.battery.minPct / 100 - 1e-6 && e <= SCENARIO.battery.capacityKwh + 1e-6);
  assert.ok(-b.cost > -keep.parts.battery.cost, 'trading earns more than keeping');
  assert.ok(trade.metrics.evReadyPct >= 79.9 && trade.metrics.comfortMinutesOutside === 0, 'other promises untouched');
});

test('battery share: refusing to lend keeps the battery for the house', () => {
  const yes = simulate({ permissions: { ev: 'never' } });
  const no = simulate({ permissions: { ev: 'never' }, promises: { battery: { share: false } } });
  assert.equal(no.parts.battery.cableKwh, 0, 'never lends');
  assert.ok(yes.parts.battery.cableKwh >= 0);
  assert.equal(no.metrics.lendEarnedPence, 0);
});

test('earlier departure changes the schedule but keeps the target', () => {
  const a = simulate();
  const b = simulate({ promises: { ev: { departureClock: 5 } } });
  assert.ok(b.metrics.evReadyPct >= 79.9);
  assert.notDeepEqual(Array.from(a.series.ev), Array.from(b.series.ev));
  assert.ok(runs(b.series.ev)[0].from < runs(a.series.ev)[0].from, 'charging starts earlier');
});

test('price cap can conflict with the departure target and be resolved either way', () => {
  const r = simulate({ promises: { ev: { departureClock: 5, targetPct: 100, priceCapPence: 500 } } });
  const c = r.conflicts.find((x) => x.id === 'ev-price');
  assert.ok(c, 'price conflict expected: ' + JSON.stringify(r.conflicts.map((x) => x.id)));
  assert.equal(c.resolved, false);
  assert.equal(r.parts.ev.status, 'PROVEN_INFEASIBLE');
  assert.ok(r.parts.ev.trace.reasonCodes.includes('BUDGET_TARGET_CONFLICT'));
  assert.ok(r.metrics.evReadyPct >= 99.9, 'default keeps the departure target');
  const p = simulate({ promises: { ev: { departureClock: 5, targetPct: 100, priceCapPence: 500 } }, resolutions: { evPriority: 'price' } });
  assert.ok(p.parts.ev.cost <= 500 + 1e-6, `cost ${p.parts.ev.cost}`);
  assert.ok(p.metrics.evReadyPct < 99.9);
  assert.ok(Math.abs(p.metrics.evReadyPct - r.parts.ev.priceConflict.maxPctWithinBudget) < 1e-6, 'the option label matches what actually happens');
});

test('an impossible departure is reported, not silently missed', () => {
  // 100% needed = 72 kWh = 6.5 h; leaving at 22:30 is impossible: use targetPct 100 and departure 00:00 (slot 24 = 6 h window)
  const r = simulate({ promises: { ev: { departureClock: 0, targetPct: 100 } } });
  const c = r.conflicts.find((x) => x.id === 'ev-feasible');
  assert.ok(c);
  assert.equal(r.parts.ev.status, 'PROVEN_INFEASIBLE');
  assert.equal(r.parts.ev.boundReason, 'CHARGER_POWER_AND_TIME_LIMIT');
  assert.ok(r.metrics.evReadyPct < 100);
  assert.ok(Math.abs(r.metrics.evReadyPct - r.parts.ev.maxPct) < 1e-6, 'diagnostic bound equals what the dispatched partial plan reaches');
});

test('ask-me-first is planned like auto; authority is applied outside the engine on the agreed plan', () => {
  const a = simulate({ permissions: { ev: 'ask' } });
  assert.equal(a.modes.ev, 'auto');
  assert.deepEqual(Array.from(a.series.ev), Array.from(simulate().series.ev));
  assert.ok(a.schedules.ev && a.schedules.heat && a.schedules.battery && a.schedules.bakery);
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
    for (const departureClock of [4.5, 5, 6, 7, 8, 10]) {
      const r = simulate({ promises: { bakery: { openingClock }, ev: { departureClock } } });
      assert.equal(r.series.feeder.length, SLOTS);
      assert.ok(Number.isFinite(r.metrics.homeCostPence));
      assert.ok(r.metrics.evReadyPct >= 79.9, `${openingClock}/${departureClock} => ${r.metrics.evReadyPct}`);
    }
  }
});
