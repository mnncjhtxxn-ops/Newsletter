/**
 * Render governor: the single owner of requestAnimationFrame.
 *
 * Modes and their frame caps (spec v1.1 §11.1 C):
 *   ATTRACT  ambient playback, 30 fps
 *   ACTIVE   touch, transitions, up to 60 fps (30 in economy)
 *   READING  a decision held open and settled: render only when invalidated
 *   PAUSED   paused / reduced-motion settled: render only when invalidated
 *   HIDDEN   page not visible: no application render submissions at all
 *
 * The cap is a deadline check inside one rAF chain, so a 120/144 Hz monitor
 * still gets ~30 frames per second in ATTRACT, and there is never a second
 * loop or timer. Diagnostics get the raw, uncapped frame gap.
 */
export const PROFILES = {
  economy: { maxPixels: 1440000, maxDPR: 1.5, rates: { ATTRACT: 30, ACTIVE: 30, READING: 0, PAUSED: 0, HIDDEN: 0 }, ambientParticles: 300, fieldStrands: 4, reflection: false, reflectionSize: 0 },
  balanced: { maxPixels: 2073600, maxDPR: 1.5, rates: { ATTRACT: 30, ACTIVE: 60, READING: 0, PAUSED: 0, HIDDEN: 0 }, ambientParticles: 800, fieldStrands: 8, reflection: true, reflectionSize: 1024 },
  detail: { maxPixels: 3686400, maxDPR: 1.5, rates: { ATTRACT: 30, ACTIVE: 60, READING: 0, PAUSED: 0, HIDDEN: 0 }, ambientParticles: 800, fieldStrands: 8, reflection: true, reflectionSize: 1536 },
};

export class RenderGovernor {
  constructor(render, { raf = (fn) => requestAnimationFrame(fn), caf = (id) => cancelAnimationFrame(id), rates = PROFILES.balanced.rates } = {}) {
    this.render = render;
    this.raf = raf;
    this.caf = caf;
    this.rates = { ...rates };
    this.mode = 'PAUSED'; // nothing is scheduled until a mode is chosen
    this.handle = null;
    this.dirty = false;
    this.deadline = null;
    this.previous = null;
    this.frames = 0;
    this.submitted = 0; // frames actually rendered
    this.disposed = false;
    this.boundFrame = (t) => this.frame(t);
  }

  setRates(rates) { this.rates = { ...rates }; this.deadline = null; }

  setMode(mode) {
    if (!(mode in this.rates)) throw new RangeError(`Unknown mode: ${mode}`);
    if (this.disposed || this.mode === mode) return;
    this.mode = mode;
    this.deadline = null;
    if (mode === 'HIDDEN') { this.cancel(); this.previous = null; return; }
    this.invalidate();
  }

  /** Ask for one frame; many calls before the next paint coalesce into one. */
  invalidate() {
    if (this.disposed) return;
    this.dirty = true;
    if (this.mode !== 'HIDDEN' && this.handle === null) this.handle = this.raf(this.boundFrame);
  }

  cancel() { if (this.handle !== null) this.caf(this.handle); this.handle = null; }

  frame(ts) {
    this.handle = null;
    if (this.disposed || this.mode === 'HIDDEN') return;
    const fps = this.rates[this.mode];
    if (fps === 0 && !this.dirty) return; // on-demand mode, nothing changed: stop the chain
    if (fps > 0 && this.deadline !== null && ts < this.deadline - 0.01) { // too early for the cap: wait for the next vsync
      this.handle = this.raf(this.boundFrame);
      return;
    }
    const rawGapMs = this.previous === null ? 0 : Math.max(0, ts - this.previous);
    // After a long stall (tab switch, GC pause) visual time does not jump.
    const dt = fps > 0 && rawGapMs < 250 ? rawGapMs / 1000 : (this.dirty && fps === 0 ? 0 : Math.min(rawGapMs, 250) / 1000);
    this.previous = ts;
    this.dirty = false;
    if (fps > 0) {
      const period = 1000 / fps;
      if (this.deadline === null) this.deadline = ts + period;
      else { const missed = Math.floor(Math.max(0, ts - this.deadline) / period) + 1; this.deadline += missed * period; }
    }
    this.frames++;
    this.submitted++;
    this.render({ ts, rawGapMs, dt, mode: this.mode });
    if (!this.disposed && this.mode !== 'HIDDEN' && (this.rates[this.mode] > 0 || this.dirty) && this.handle === null) this.handle = this.raf(this.boundFrame);
  }

  /**
   * Hand the loop to an external driver (a WebXR session must render every
   * frame from its own animation loop). While external, the governor's own
   * rAF is a no-op and the driver calls pump(ts) once per frame.
   */
  beginExternal() {
    this.cancel();
    this.savedRaf = this.raf;
    this.raf = () => 1; // scheduled but never fires: the external driver pumps
    this.external = true;
    this.previous = null;
    this.deadline = null;
  }
  pump(ts) {
    if (!this.external) return;
    this.handle = null;
    // a headset renders every frame: no cap, no on-demand skipping
    this.dirty = true;
    this.deadline = null;
    this.frame(ts);
  }
  endExternal() {
    if (!this.external) return;
    this.external = false;
    this.raf = this.savedRaf;
    this.handle = null;
    this.previous = null;
    this.deadline = null;
    this.invalidate();
  }

  dispose() { this.cancel(); this.disposed = true; }
}

/**
 * Drawing-buffer size under a pixel budget, with devicePixelRatio counted
 * exactly once. HTML text stays at native CSS resolution regardless.
 */
export function fitDrawingBuffer(cssWidth, cssHeight, devicePixelRatio = 1, { maxPixels = 2073600, maxDPR = 1.5, maxDimension = 8192 } = {}) {
  for (const n of [cssWidth, cssHeight, devicePixelRatio, maxPixels, maxDPR, maxDimension]) if (!Number.isFinite(n) || n <= 0) throw new RangeError('Positive finite dimensions required.');
  const scale = Math.min(devicePixelRatio, maxDPR, Math.sqrt(maxPixels / (cssWidth * cssHeight)), maxDimension / cssWidth, maxDimension / cssHeight);
  return { width: Math.max(1, Math.floor(cssWidth * scale)), height: Math.max(1, Math.floor(cssHeight * scale)), scale };
}

/** Bounded least-recently-used cache for physical plan results (no permission inside). */
export class LruCache {
  constructor(max = 32) { this.max = max; this.map = new Map(); this.hits = 0; this.misses = 0; }
  get(key) {
    if (!this.map.has(key)) { this.misses++; return undefined; }
    const v = this.map.get(key); this.map.delete(key); this.map.set(key, v); this.hits++; return v;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  get size() { return this.map.size; }
}
