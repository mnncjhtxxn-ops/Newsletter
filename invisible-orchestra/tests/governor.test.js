import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderGovernor, fitDrawingBuffer, LruCache, PROFILES } from '../src/scene/governor.js';

/** A fake display running at `hz`, driving the governor's rAF chain. */
function fakeDisplay(hz) {
  const cbs = new Map(); let id = 0; let t = 0;
  const raf = (fn) => { cbs.set(++id, fn); return id; };
  const caf = (h) => cbs.delete(h);
  const run = (seconds) => { const frames = Math.round(seconds * hz); for (let i = 0; i < frames; i++) { t += 1000 / hz; const pending = [...cbs.entries()]; cbs.clear(); for (const [, fn] of pending) fn(t); } };
  return { raf, caf, run, pending: () => cbs.size };
}

test('E07: the 30 fps ATTRACT cap holds on 60, 120 and 144 Hz displays', () => {
  for (const hz of [60, 120, 144]) {
    const d = fakeDisplay(hz);
    let rendered = 0;
    const g = new RenderGovernor(() => rendered++, { raf: d.raf, caf: d.caf });
    g.setMode('ATTRACT');
    d.run(10);
    assert.ok(rendered >= 290 && rendered <= 305, `${hz} Hz → ${rendered} frames in 10 s`);
  }
});

test('ACTIVE renders up to 60 fps and never above the display rate', () => {
  const d = fakeDisplay(144);
  let rendered = 0;
  const g = new RenderGovernor(() => rendered++, { raf: d.raf, caf: d.caf });
  g.setMode('ACTIVE');
  d.run(5);
  assert.ok(rendered >= 290 && rendered <= 305, `${rendered}`);
  const d60 = fakeDisplay(60); rendered = 0;
  const g2 = new RenderGovernor(() => rendered++, { raf: d60.raf, caf: d60.caf });
  g2.setMode('ACTIVE'); d60.run(5);
  assert.ok(rendered >= 295 && rendered <= 300, `${rendered}`);
});

test('E06: READING renders once when invalidated, then submits nothing', () => {
  const d = fakeDisplay(60);
  let rendered = 0;
  const g = new RenderGovernor(() => rendered++, { raf: d.raf, caf: d.caf });
  g.setMode('ATTRACT'); d.run(1);
  g.setMode('READING'); d.run(1);
  const after = rendered;
  d.run(60);
  assert.equal(rendered, after, 'no frames during 60 s of reading');
  assert.equal(d.pending(), 0, 'no rAF left scheduled');
  g.invalidate(); g.invalidate(); g.invalidate(); d.run(0.5);
  assert.equal(rendered, after + 1, 'three invalidations coalesce into one frame');
});

test('HIDDEN submits nothing and resumes without a time jump', () => {
  const d = fakeDisplay(60);
  const dts = [];
  const g = new RenderGovernor(({ dt }) => dts.push(dt), { raf: d.raf, caf: d.caf });
  g.setMode('ATTRACT'); d.run(1);
  g.setMode('HIDDEN');
  const n = dts.length;
  d.run(30);
  assert.equal(dts.length, n);
  g.setMode('ATTRACT'); d.run(0.2);
  assert.ok(dts.length > n);
  assert.ok(dts.slice(n).every((dt) => dt <= 0.25), 'no catch-up delta after 30 s hidden');
});

test('E08: the pixel budget is a drawing-buffer limit after devicePixelRatio', () => {
  const b = fitDrawingBuffer(2160, 3840, 2, PROFILES.balanced);
  assert.ok(b.width * b.height <= PROFILES.balanced.maxPixels);
  assert.ok(b.width * b.height > PROFILES.balanced.maxPixels * 0.98);
  const e = fitDrawingBuffer(1080, 1920, 1, PROFILES.economy);
  assert.ok(e.width * e.height <= PROFILES.economy.maxPixels);
  const small = fitDrawingBuffer(800, 600, 1, PROFILES.detail);
  assert.deepEqual([small.width, small.height, small.scale], [800, 600, 1], 'never upscales');
  const dpr = fitDrawingBuffer(1000, 1000, 3, PROFILES.detail);
  assert.equal(dpr.scale, 1.5, 'DPR is capped at maxDPR');
});

test('E02: the plan cache is bounded and least-recently-used', () => {
  const c = new LruCache(3);
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  c.get('a');
  c.set('d', 4);
  assert.equal(c.get('b'), undefined, 'least recently used entry evicted');
  assert.equal(c.get('a'), 1);
  assert.equal(c.size, 3);
});
