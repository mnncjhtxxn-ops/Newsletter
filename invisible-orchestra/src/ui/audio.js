/**
 * The orchestra, heard.
 *
 * This is the stem player. It replaces the synthesised engine and keeps its
 * contract: the same class, the same calls, the same meaning for each call.
 * Nothing in main.js has to change for it to work (three optional one-line
 * changes are listed in INTEGRATION.md).
 *
 * What plays:
 *
 *   scenes     four looping phrases of the symphony, one per price mode, each
 *              as nine stems, one per thing in the street. Each stem is dry
 *              and mono; it is placed at its object and sent to the hall.
 *   beds       the event passages (the question, the ride, the release, the
 *              afterglow) as finished stereo recordings.
 *   shots      short answers: an object's call when it is pointed at, the
 *              small stingers, harp glissandi for the baton, timpani warnings.
 *
 * What the calls do:
 *
 *   setFrame(f)        stem levels follow the street; the price picks the scene
 *   setFrozen(true)    after a moment the whole orchestra holds the chord it
 *                      is on (a fermata), and resumes from the same place
 *   gesture('point')   the object answers, and is brought forward while its
 *                      decision is open
 *   gesture('sweep')   a harp glissando the way the hand goes, and the
 *                      orchestra swells (forward) or hushes (back)
 *   downbeat()         a change is committed: the held dominant, a breath, and
 *                      the release lands as the ride arrives
 *   ping('ask')        a small question; when a plan is waiting for a yes, the
 *                      orchestra lands on B flat and waits over a held A
 *   beat()             timpani warnings from the cable
 *
 * Rules it keeps: nothing is muted for a cue; a scene changes only at the end
 * of a phrase; once the ride has begun it is not interrupted.
 *
 * The sound never carries a fact on its own; every fact is also on screen.
 */
import { SCORE } from './score-data.js';
import { AUDIO, AUDIO_BASE, AUDIO_EXT } from './audio-assets.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const db = (d) => Math.pow(10, d / 20);

/* ------------------------------------------------------------------ */
/* Kept from the synthesised engine, for callers and tests that use them */
/* ------------------------------------------------------------------ */
const ROOT = 146.83; // D3
const MODES = { lydian: [0, 2, 4, 6, 7, 9, 11], ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10] };
export function modeForPrice(pence) {
  return pence <= 10 ? 'lydian' : pence <= 18 ? 'ionian' : pence <= 26 ? 'dorian' : 'aeolian';
}
export function degreeHz(mode, degree, octave = 0) {
  const scale = MODES[mode] || MODES.ionian;
  const oct = Math.floor(degree / 7);
  const step = scale[((degree % 7) + 7) % 7];
  return ROOT * Math.pow(2, (step + 12 * oct + 12 * octave) / 12);
}
export function chordTones(root) {
  const out = [];
  for (let o = -1; o <= 2; o++) for (const k of [0, 2, 4, 6]) out.push(root + k + 7 * o);
  return out.sort((a, b) => a - b);
}
export function leadVoice(prev, root, lo = -7, hi = 14) {
  let best = null;
  for (const t of chordTones(root)) {
    if (t < lo || t > hi) continue;
    const d = Math.abs(t - prev);
    if (!best || d < best.d || (d === best.d && t < best.t)) best = { t, d };
  }
  return best ? best.t : prev;
}

/** The scene for a price: the cheapest hours are `wind`, then `day`, `dawn`, and `peak` for the dear evening. */
export const SCENE_FOR_MODE = { lydian: 'wind', ionian: 'day', dorian: 'dawn', aeolian: 'peak' };
export function sceneForPrice(pence) { return SCENE_FOR_MODE[modeForPrice(pence)]; }

/* ------------------------------------------------------------------ */
/* Tuning constants (all in one place)                                  */
/* ------------------------------------------------------------------ */
const ROLES = SCORE.roles; // floor, wind_soft, wind_full, home, car, bakery, battery, cable, thread
const PRE = SCORE.preroll; // every file starts this long before its first beat
/** Where each stem plays from: a key of the map given to setPositions(). */
const PLACE = { floor: 'bass', wind_soft: 'strings', wind_full: 'strings', home: 'pad', car: 'cello', bakery: 'brass', battery: 'harp', cable: 'timpani', thread: 'pad' };
/** Which stems an object owns (for gesture('point')). */
const SECTION_ROLES = { wind: ['wind_soft', 'wind_full'], home: ['home'], car: ['car'], bakery: ['bakery'], battery: ['battery'], substation: ['cable', 'floor'], street: ['floor'], sun: ['thread'] };
const SECTION_CALLS = { wind: ['call_wind', 'call_wind_2'], home: ['call_home', 'call_home_2'], car: ['call_car', 'call_car_2'], bakery: ['call_bakery', 'call_bakery_2'], battery: ['call_battery', 'call_battery_2'], substation: ['call_cable'], street: ['call_home_2'], sun: ['call_battery_2'] };
const SECTION_PLACE = { wind: 'strings', home: 'pad', car: 'cello', bakery: 'brass', battery: 'harp', substation: 'timpani', street: 'pad', sun: 'harp' };
const DEFAULT_POSITIONS = { strings: [-7, 3, -9], bass: [0, -1, -11], timpani: [2, -1, -11], pad: [-9, 0, -3], brass: [9, 0, -4], cello: [6, -1, -8], harp: [-4, 0, -10] };

const T = {
  sceneGainDb: 9.0,      // scenes are quiet music; this lifts them so they carry in a room (the release is left as it is)
  trimDb: { equalpower: 0.0, HRTF: -1.0 },  // measured: with these a scene through the panners is as loud as its stage recording
  shotGainDb: -2.0,      // one-shots against the scenes
  bedGainDb: 0.0,        // event passages against the scenes
  master: 0.85,
  levelTc: 0.3,          // how fast a stem follows the street, seconds
  lookahead: 2.6,        // how far ahead a loop pass is scheduled (hidden tabs throttle timers to 1 s)
  moodSettle: 1.2,       // a price mode must hold this long before the scene changes
  minDwell: 6.0,         // a scene plays at least this long
  sceneFade: 1.6,        // the old scene's fade under the new one
  holdAfter: 1.0,        // a freeze shorter than this is ignored (taps)
  holdMin: 0.8,
  holdDark: 0.55,        // the held chord is a little darker
  holdGainDb: -1.5,      // and a little softer
  focusGain: 1.35,       // the object whose decision is open comes forward
  focusOthers: 0.8,
  sweepEvery: 0.3,
  glissEvery: 0.9,
  fullReleaseEvery: 150, // seconds: the long release at most this often; other commits get the brief one
  afterglowOverlap: 6.0, // the scene returns this long before the afterglow's last beat
};

/* ------------------------------------------------------------------ */
/* The frozen chord                                                     */
/* ------------------------------------------------------------------ */
/**
 * Make a seamless loop that holds the sound of one moment of a recording.
 * Every component of the spectrum of a half-second window is continued as a steady tone at its own
 * measured frequency (a phase-vocoder freeze), so a held chord stays a chord: no stutter of a repeated
 * slice and no wavering. The frequencies are rounded so that a whole number of cycles fits the loop,
 * which makes the loop seamless. At loop time zero the result equals the recording at the centre of the
 * last window, so a hold that starts there is the same notes carrying on.
 * Self-contained: it is also the whole source of the worker that runs it off the main thread.
 *   seg     Float32Array of W + W/16 samples ending at the moment to hold (W a power of two)
 *   mult    the loop is mult * W samples long (a power of two)
 */
export function freezeLoop(seg, mult) {
  const W = 1 << Math.floor(Math.log2(seg.length)), hop = seg.length - W, N = W * mult;
  const out = new Float32Array(N);
  if (hop <= 0) return out;
  const makeFFT = (n) => {
    const bits = Math.round(Math.log2(n)), half = n >> 1;
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    const cs = new Float64Array(half), sn = new Float64Array(half);
    for (let i = 0; i < half; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
    return (re, im, inverse) => {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const h = size >> 1, step = n / size;
        for (let s = 0; s < n; s += size) {
          for (let k = 0, ti = 0; k < h; k++, ti += step) {
            const wr = cs[ti], wi = inverse ? sn[ti] : -sn[ti];
            const a = s + k, b = a + h;
            const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          }
        }
      }
    };
  };
  let energy = 0;
  for (let i = 0; i < seg.length; i++) energy += seg[i] * seg[i];
  if (energy < 1e-12) return out;
  const fft = makeFFT(W);
  const reA = new Float64Array(W), imA = new Float64Array(W), reB = new Float64Array(W), imB = new Float64Array(W);
  let wsum = 0, psum = 0;
  for (let i = 0; i < W; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W); reA[i] = seg[i] * w; reB[i] = seg[i + hop] * w; wsum += w * w; psum += reB[i] * reB[i]; }
  const target = Math.sqrt(psum / wsum);   // how loud the recording is around the moment being held
  fft(reA, imA, false); fft(reB, imB, false);
  const re = new Float64Array(N), im = new Float64Array(N);
  const H = W >> 1, twoPi = 2 * Math.PI;
  const mag = new Float64Array(H + 1);
  for (let k = 0; k <= H; k++) mag[k] = Math.hypot(reB[k], imB[k]);
  // every peak of the spectrum is one partial; the bins around it, out to the dips on either side, belong to it
  const peaks = [];
  for (let k = 2; k < H - 2; k++) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > mag[k - 2] && mag[k] >= mag[k + 2]) peaks.push(k);
  for (let p = 0; p < peaks.length; p++) {
    const k0 = peaks[p];
    let lo = p ? peaks[p - 1] : 1, hi = p < peaks.length - 1 ? peaks[p + 1] : H - 1;
    let a = k0, b = k0;
    if (p) { let m = k0; for (let k = k0 - 1; k > lo; k--) if (mag[k] < mag[m]) m = k; a = m; } else a = lo;
    if (p < peaks.length - 1) { let m = k0; for (let k = k0 + 1; k < hi; k++) if (mag[k] <= mag[m]) m = k; b = m - 1 >= k0 ? m - 1 : k0; } else b = hi;
    // the partial's true frequency, from how far its phase moved between the two windows
    const phA = Math.atan2(imA[k0], reA[k0]), phB = Math.atan2(imB[k0], reB[k0]);
    let d = phB - phA - twoPi * k0 * hop / W; d -= twoPi * Math.round(d / twoPi);
    const q = Math.round((k0 / W + d / (twoPi * hop)) * N);
    if (q < 1 || q >= N / 2) continue;
    // its bins, each turned to the phase it has at the centre of the window, add up to the partial as it sounds there
    let cr = 0, ci = 0;
    for (let k = a; k <= b; k++) { const sgn = k & 1 ? -1 : 1; cr += sgn * reB[k]; ci += sgn * imB[k]; }
    cr /= W; ci /= W;
    re[q] += cr; im[q] += ci; re[N - q] += cr; im[N - q] -= ci;
  }
  makeFFT(N)(re, im, true);
  // level the result: partials a few hertz apart beat slowly against each other, and a held chord should not swell and fade
  const box = Math.max(8, Math.round(N / mult / 16) | 0);          // about 30 ms
  const sq = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) sq[i + 1] = sq[i] + re[i] * re[i];
  const mean = Math.sqrt(sq[N] / N);
  if (mean < 1e-9) return out;
  const fix = Math.min(2, Math.max(0.5, target / mean));   // and the hold is as loud as that
  const env = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let lo = i - box, hi = i + box, sum;
    if (lo < 0) sum = sq[hi] + (sq[N] - sq[lo + N]); else if (hi > N) sum = (sq[N] - sq[lo]) + sq[hi - N]; else sum = sq[hi] - sq[lo];
    env[i] = Math.sqrt(sum / (2 * box));
  }
  // smooth the envelope once more (circular box), so the levelling never follows single cycles of a low note
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + env[i];
  for (let i = 0; i < N; i++) {
    let lo = i - box, hi = i + box, sum;
    if (lo < 0) sum = cum[hi] + (cum[N] - cum[lo + N]); else if (hi > N) sum = (cum[N] - cum[lo]) + cum[hi - N]; else sum = cum[hi] - cum[lo];
    const e = sum / (2 * box);
    const g = e > 1e-9 ? Math.min(2.8, Math.max(0.4, mean / e)) : 1;
    out[i] = re[i] * g * fix;
  }
  return out;
}
const FREEZE_W = 16384, FREEZE_SEG = FREEZE_W + (FREEZE_W >> 4);   // a third to a half of a second, at any sample rate
const FREEZE_WORKER = `const F=(${freezeLoop.toString().replace(/^export\s+/, '')});self.onmessage=(e)=>{const d=e.data;const out=d.segs.map((s)=>s?F(s,d.frames):null);self.postMessage({id:d.id,out:out},out.filter(Boolean).map((a)=>a.buffer));};`;

/* ------------------------------------------------------------------ */
/* The orchestra                                                        */
/* ------------------------------------------------------------------ */
export class Orchestra {
  /**
   * @param opts  all optional:
   *   decodeRate   sample rate the audio is decoded to: 'auto' (32 kHz on a headset or phone to save memory, native elsewhere), a number, or 0 for native
   *   panning      'HRTF' (for headphones: the default in a headset) or 'equalpower' (for loudspeakers: the default elsewhere)
   *   sceneCache   how many decoded scenes to keep (each is about 65 MB at 48 kHz, 43 MB at 32 kHz): 1 on a headset or phone, 4 elsewhere
   *   firstRelease 'release' (48 s) or 'release_brief' (14 s) for the first commit of a visit
   *   hall         how much hall on the positioned stems: 1 is the hall the event passages were recorded in
   *   preload      true: start decoding at setPositions(), before the first touch; false: wait for enable()
   */
  constructor(opts = {}) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const small = /OculusBrowser|Quest|Android|iPhone|iPad|Mobile/i.test(ua);
    const headset = /OculusBrowser|Quest/i.test(ua);
    this.opts = Object.assign({ decodeRate: 'auto', panning: headset ? 'HRTF' : 'equalpower', sceneCache: small ? 1 : 4, firstRelease: 'release', laterRelease: 'release_brief', hall: 1, preload: true, small }, opts);
    this.ctx = null;
    this.enabled = false;
    this.built = false;
    this.positions = Object.assign({}, DEFAULT_POSITIONS);
    this.frame = null;
    this.frozen = false;
    this.frozenAt = 0;
    this.justFrozen = false;
    this.swell = 0;
    this.phase = 'idle';          // idle | scene | hold | bed
    this.scene = null;           // the playing scene instance
    this.old = [];               // scene instances fading out
    this.hold = null;
    this.bed = null;
    this.waiting = false;        // a plan is waiting for the visitor's yes: the dawn scene, whatever the hour
    this.wantMood = 'day';
    this.moodSince = 0;
    this.change = null;          // a scene change waiting for its exit point
    this.focus = null;
    this.levels = {};
    this.buffers = new Map();    // name -> AudioBuffer
    this.loading = new Map();    // name -> Promise
    this.sceneOrder = [];        // decoded scenes, most recent last
    this.pendingWork = new Set();
    this.lastSweep = -1; this.lastGliss = -1; this.lastPing = {}; this.callAlt = {};
    this.lastFullRelease = -1e9; this.commits = 0; this.lastDownbeat = -1e9;
    this.lastBeat = -1;
    this.calmAt = -1e9;
    this.failed = new Map();
    this.timer = null;
    this.freezeId = 0; this.freezeJobs = new Map(); this.worker = null; this.freezeCost = 0.3;
    this.awaitFrame = false; this.enabledAt = 0;      // a visit starts on the scene of its first frame, not the last visit's
    this.pumpGap = 0.1; this.lastPumpAt = 0;          // how often the scheduler is being run (a hidden page runs it once a second)
    this.sceneLoads = new Map(); this.sceneSettled = new Set();
    this.lastResumeTry = 0; this.lastPreloadTry = 0; this.readyFailed = false;
    this.conflictAt = 0;
    this.log = [];               // what the music did and when (for tools and the staff view)
    if (typeof document !== 'undefined' && document.addEventListener) {
      // main.js freezes the music when the page is hidden and has no call for when it is shown again.
      // This listener is added before main.js adds its own, so it sees the state before that freeze.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.frozenBeforeHide = this.frozen;
        else if (this.frozenBeforeHide === false && this.frozen) { this.frozenBeforeHide = null; this.setFrozen(false); }
      });
    }
  }

  /** The musical mode for the current price, as the synthesised engine reported it (tools read this). */
  get mode() { return modeForPrice(this.frame ? this.frame.price : 15); }

  /* ---------------- switching on and off ---------------- */

  enable() {
    if (this.enabled) return;
    try {
      this.ensureContext();
      const c = this.ctx;
      this.wake();
      this.master.gain.cancelScheduledValues(c.currentTime);
      this.master.gain.setTargetAtTime(T.master, c.currentTime, 0.5);
      this.enabled = true;
      this.commits = 0; this.lastFullRelease = -1e9;
      this.awaitFrame = true; this.enabledAt = wall();
      if (this.frozen) this.frozenAt = c.currentTime;
      this.preload();
      if (!this.offline && !this.timer && typeof setInterval !== 'undefined') this.timer = setInterval(() => this.pump(), 100);
      this.pump();
    } catch (e) { this.enabled = false; this.note('error', String(e && e.message || e)); }
  }

  disable() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.3);
    this.enabled = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    // everything stops once the fade has finished; a new visit starts from a clean stage
    this.stopAll(t + 1.4);
    this.frozen = false; this.frozenBeforeHide = null;   // main.js does not unfreeze when it resets to the attract screen
  }

  /**
   * A browser keeps a context suspended until a touch has ended (the touch going down is not enough), and
   * main.js switches sound on as the touch goes down. So the context is asked again until it runs.
   */
  wake() {
    const c = this.ctx;
    if (!c || this.offline || c.state !== 'suspended') return;
    const w = wall();
    if (w - this.lastResumeTry < 250) return;
    this.lastResumeTry = w;
    try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* asked again on the next pump */ }
  }

  ensureContext() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const c = this.ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext;
    if (!this.built) this.build(c);
  }

  /**
   * Decode what the first touch will need. Called from setPositions() at start-up, so the
   * audio is ready before anyone touches the screen. Returns a promise for tools that render offline.
   */
  preload() {
    if (this.ready && !this.readyFailed) return this.ready;
    try { this.ensureContext(); } catch (e) { return Promise.resolve(); }
    this.readyFailed = false; this.lastPreloadTry = wall();
    const first = this.frame ? sceneForPrice(this.frame.price) : 'peak'; // the modelled day starts at 18:00, in the dear evening
    const always = ['ride', 'release_brief', 'question', ...Object.keys(SCORE.shots), ...(this.opts.small ? [] : ['release', 'afterglow'])];
    this.ready = this.track(Promise.all([this.loadHall().catch(() => null), this.loadScene(first), ...always.map((n) => this.load(n).catch(() => null))]).then(() => {
      const missing = always.filter((n) => !this.buffers.has(n));
      if (!this.hallLoaded) missing.push('hall');
      this.readyFailed = missing.length > 0;                 // asked for again every few seconds until everything is in
      if (this.readyFailed) this.note('error', 'not loaded yet: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? ' and ' + (missing.length - 4) + ' more' : ''));
      else this.note('ready', first);
      this.pump();
    }));
    return this.ready;
  }

  /** Resolves when nothing is being decoded or computed (tools that render offline wait on this). */
  async settled() { while (this.pendingWork.size) await Promise.allSettled([...this.pendingWork]); }
  track(p) { this.pendingWork.add(p); const done = () => this.pendingWork.delete(p); p.then(done, done); return p; }
  note(what, detail) { this.log.push({ t: this.ctx ? +this.ctx.currentTime.toFixed(3) : 0, what, detail }); if (this.log.length > 400) this.log.shift(); if (this.onNote) this.onNote(what, detail); }

  /* ---------------- loading ---------------- */

  decodeRate() {
    const r = this.opts.decodeRate;
    if (r === 'auto') return this.opts.small ? 32000 : 0;
    return r || 0;
  }

  async bytes(name, ext) {
    const key = name + (ext || '');
    const a = AUDIO && (AUDIO[key] || AUDIO[name]);
    if (a) { // embedded in the build: copy, because decoding takes the buffer away
      if (a instanceof ArrayBuffer) return a.slice(0);
      if (ArrayBuffer.isView(a)) return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength);
      if (typeof a === 'string') { const s = atob(a); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
    }
    const r = await fetch(AUDIO_BASE + name + (ext || AUDIO_EXT));
    if (!r.ok) throw new Error('audio file missing: ' + name);
    return r.arrayBuffer();
  }

  decodeWith(c, ab) {
    return new Promise((ok, no) => { const p = c.decodeAudioData(ab, ok, no); if (p && p.catch) p.catch(no); });
  }

  /** One file, decoded once. Stems and beds are decoded at the reduced rate where memory is short. */
  load(name, { native = false, ext = null } = {}) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    if (this.failed.has(name) && wall() - this.failed.get(name) < 4000) return Promise.reject(new Error('audio file unavailable: ' + name));
    const p = this.track((async () => {
      const ab = await this.bytes(name, ext);
      const rate = native ? 0 : this.decodeRate();
      let buf = null;
      if (rate && rate < this.ctx.sampleRate) {
        try { this.decoder ||= new OfflineAudioContext(1, 1, rate); buf = await this.decodeWith(this.decoder, ab.slice(0)); } catch (e) { buf = null; }
      }
      if (!buf) buf = await this.decodeWith(this.ctx, ab);
      this.buffers.set(name, buf); this.loading.delete(name); this.failed.delete(name);
      return buf;
    })());
    this.loading.set(name, p);
    p.catch((e) => { this.loading.delete(name); if (!this.failed.has(name)) this.note('error', String(e && e.message || e)); this.failed.set(name, wall()); });
    return p;
  }

  async loadHall() {
    if (this.hallLoaded) return;
    const buf = await this.load('hall', { native: true, ext: '.wav' });
    this.reverb.buffer = buf; this.hallLoaded = true;
  }

  /** A scene can play when all nine stems are decoded, or when every load has finished and at least the floor is there. */
  sceneReady(id) { return this.buffers.has(id + '_floor') && (this.sceneSettled.has(id) || ROLES.every((r) => this.buffers.has(id + '_' + r))); }

  loadScene(id) {
    if (this.sceneLoads.has(id)) return this.sceneLoads.get(id);
    this.sceneSettled.delete(id);
    const p = Promise.all(ROLES.map((r) => this.load(id + '_' + r).catch(() => null))).then(() => {
      this.sceneLoads.delete(id); this.sceneSettled.add(id);
      if (!this.sceneReady(id)) return;
      this.sceneOrder = this.sceneOrder.filter((s) => s !== id); this.sceneOrder.push(id);
      this.trimScenes(id);
    });
    this.sceneLoads.set(id, p);
    return p;
  }

  /** Keep memory bounded: forget the scenes used longest ago (never one that is sounding or about to). */
  trimScenes(also) {
    const keep = new Set([also, this.scene && this.scene.id, this.hold && this.hold.id, this.holdPlan && this.holdPlan.id, this.change && this.change.to, ...this.old.map((o) => o.id)]);
    while (this.sceneOrder.length > this.opts.sceneCache) {
      const drop = this.sceneOrder.find((s) => !keep.has(s));
      if (!drop) break;
      this.sceneOrder = this.sceneOrder.filter((s) => s !== drop);
      this.sceneSettled.delete(drop);
      for (const r of ROLES) this.buffers.delete(drop + '_' + r);
    }
  }

  /* ---------------- the room ---------------- */

  build(c) {
    this.master = c.createGain(); this.master.gain.value = 0;
    // a safety limiter only: the score keeps its own dynamics, quiet scenes and a loud release
    this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -2.5; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.2; this.limiter.knee.value = 2;
    this.sum = c.createGain();
    this.sum.connect(this.limiter); this.limiter.connect(this.master); this.master.connect(c.destination);
    // the positioned stems and one-shots; the baton's hairpins act here
    this.surge = c.createGain();
    this.air = c.createBiquadFilter(); this.air.type = 'highshelf'; this.air.frequency.value = 6000; this.air.gain.value = 0;
    this.body = c.createBiquadFilter(); this.body.type = 'lowshelf'; this.body.frequency.value = 280; this.body.gain.value = 0;
    this.dryBus = c.createGain();
    this.dryBus.connect(this.body); this.body.connect(this.air); this.air.connect(this.surge); this.surge.connect(this.sum);
    // the hall: the same impulse response the event passages were recorded in, so scenes and passages share one room
    this.reverb = c.createConvolver(); this.reverb.normalize = false;
    this.predelay = c.createDelay(0.1); this.predelay.delayTime.value = SCORE.hall.predelay;
    this.revIn = c.createGain(); this.revIn.gain.value = SCORE.hall.sourceToSend / SCORE.hall.fileGain;
    this.wet = c.createGain(); this.wet.gain.value = this.opts.hall;
    this.revIn.connect(this.predelay); this.predelay.connect(this.reverb); this.reverb.connect(this.wet); this.wet.connect(this.dryBus);
    // event passages: finished stereo, straight to the sum
    this.bedBus = c.createGain(); this.bedBus.gain.value = db(T.bedGainDb);
    this.bedBus.connect(this.sum);
    // one chain per stem: level, brightness, place, hall
    this.stems = {};
    for (const role of ROLES) {
      const input = c.createGain();
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 20000; filter.Q.value = 0.707;
      const gain = c.createGain(); gain.gain.value = 0;
      const panner = this.makePanner();
      const send = c.createGain(); send.gain.value = db(SCORE.hall.sendDb0 + SCORE.hall.sendDbPerDepth * 0.5);
      input.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(this.dryBus); gain.connect(send); send.connect(this.revIn);
      this.stems[role] = { input, filter, gain, panner, send, level: -1, cutoff: 0, place: null };
      this.levels[role] = role === 'floor' || role === 'wind_soft' || role === 'thread' ? 0.6 : 0;
    }
    this.built = true;
    this.applyPositions();
    // Head-related panning (for headphones) is fuller in the bass and duller on top than the stage recordings
    // of the event passages; decoding at a lower rate also softens the very top. Two shelves give the balance back.
    const r = this.decodeRate(), hrtf = this.opts.panning === 'HRTF';
    this.air.gain.value = (hrtf ? 4 : 0) + (r && r < c.sampleRate ? 2.5 : 0);
    this.body.gain.value = hrtf ? -2 : 0;
  }

  makePanner() {
    const p = this.ctx.createPanner();
    p.panningModel = this.opts.panning; p.distanceModel = 'inverse'; p.refDistance = 7; p.rolloffFactor = 0.35; p.coneInnerAngle = 360;
    return p;
  }

  applyPositions() {
    if (!this.built) return;
    for (const role of ROLES) if (role !== 'thread' || !this.stems.thread.place) this.placeStem(role, PLACE[role]);
  }
  placeStem(role, key, glide = false) {
    const s = this.stems[role], v = this.positions[key];
    if (!s || !v || s.place === key + ':' + v.join(',')) return;
    const moving = glide && s.place != null;
    s.place = key + ':' + v.join(',');
    // a stem that is sounding walks to its new place; a jump would be heard as a click
    if (moving && s.panner.positionX) { const t = this.ctx.currentTime; s.panner.positionX.setTargetAtTime(v[0], t, 0.25); s.panner.positionY.setTargetAtTime(v[1], t, 0.25); s.panner.positionZ.setTargetAtTime(v[2], t, 0.25); }
    else setPos(s.panner, v);
  }

  /* ---------------- the street sets the balance ---------------- */

  /** Per rendered frame: each object's stem follows what that object is doing. */
  setFrame(f) {
    this.frame = f;
    if (!this.enabled) return;
    const want = sceneForPrice(f.price);
    if (this.awaitFrame) { this.awaitFrame = false; this.wantMood = want; this.moodSince = -1e9; }
    if (want !== this.wantMood) { this.wantMood = want; this.moodSince = this.ctx.currentTime; }
    this.balance();
    this.pump();
  }

  balance() {
    if (!this.built) return;
    const f = this.frame || {};
    const t = this.ctx.currentTime;
    const ev = Math.abs(f.evKw || 0), bat = Math.abs(f.batteryKw || 0), heat = f.heatKw || 0, ovens = f.bakeryKw || 0;
    const busy = clamp(ev / 7 + heat / 3 + ovens / 30 + bat / 5, 0, 1);
    const w = clamp(f.windFrac || 0, 0, 1);
    const L = this.levels;
    L.floor = 0.8 + 0.2 * busy;
    L.wind_soft = 0.45 + 0.55 * clamp(w / 0.45, 0, 1);
    L.wind_full = clamp((w - 0.35) / 0.5, 0, 1);
    L.home = heat > 0.1 ? 1 : 0.18 + 0.2 * (f.tempFrac || 0);
    L.car = ev > 0.1 ? clamp(ev / 7, 0.3, 1) : 0;
    L.bakery = clamp(ovens / 30, 0, 1);
    L.battery = bat > 0.1 ? clamp(0.35 + 0.65 * bat / 5, 0, 1) : 0;
    L.cable = clamp(((f.cableFrac || 0) - 0.82) / 0.18, 0, 1);
    L.thread = 0.55 + 0.45 * busy;
    // the tune comes from whichever object leads
    const lead = [['cello', ev / 7], ['brass', ovens / 30], ['pad', heat / 3], ['harp', bat / 5]].sort((a, b) => b[1] - a[1])[0];
    this.placeStem('thread', lead[1] > 0.2 ? lead[0] : 'pad', true);
    const held = this.phase === 'hold';
    const trim = db(T.sceneGainDb + (T.trimDb[this.opts.panning] || 0) + (held ? T.holdGainDb : 0));
    for (const role of ROLES) {
      let v = L[role];
      if (this.focus) v = this.focus.includes(role) ? Math.max(v, 0.7) * T.focusGain : v * T.focusOthers;
      const s = this.stems[role];
      if (Math.abs(v - s.level) > 0.004 || s.trim !== trim) {
        s.level = v; s.trim = trim;
        s.gain.gain.setTargetAtTime(v * trim, t, T.levelTc);
      }
      // a quiet stem is also a darker one, as a quiet player is; the hold darkens everything a little
      const cut = clamp(1500 * Math.pow(2, 3.9 * Math.pow(clamp(v, 0, 1), 0.6)) * (held ? T.holdDark : 1) * (1 + 0.5 * this.swell), 900, 21000);
      if (Math.abs(cut - s.cutoff) > 40) { s.cutoff = cut; s.filter.frequency.setTargetAtTime(cut, t, 0.4); }
    }
  }

  /* ---------------- the clock of the music ---------------- */

  def(id) {
    const d = SCORE.scenes[id];
    if (!d.bar) { d.bar = d.len / d.bars; d.beat = d.bar / 4; d.exit = d.bar * d.exitBars; }
    return d;
  }

  /** Start a scene so that scene time `offset` sounds at `at`. */
  startScene(id, at, { offset = 0, fade = 0 } = {}) {
    const c = this.ctx, d = this.def(id);
    const inst = { id, d, gains: {}, sources: [], passes: [], startedAt: at, ending: false };
    for (const role of ROLES) {
      const g = c.createGain();
      const norm = db(-d.stems[role].norm);
      if (fade > 0) { g.gain.value = 0; g.gain.setValueAtTime(0, Math.max(c.currentTime, at - 0.005)); g.gain.linearRampToValueAtTime(norm, at + fade); } else g.gain.value = norm;
      g.connect(this.stems[role].input);
      inst.gains[role] = g; inst.norm = inst.norm || {}; inst.norm[role] = norm;
      this.stems[role].send.gain.setTargetAtTime(db(SCORE.hall.sendDb0 + SCORE.hall.sendDbPerDepth * d.stems[role].depth), c.currentTime, 0.3);
    }
    this.schedulePass(inst, at - offset, offset);
    this.scene = inst; this.phase = 'scene';
    this.note('scene', id + (offset ? ' @' + offset.toFixed(2) : ''));
    return inst;
  }

  /** One pass of the loop: every stem from the same sample. `from` skips into the pass (used when resuming). */
  schedulePass(inst, passAt, from = 0) {
    const c = this.ctx;
    for (const role of ROLES) {
      const buf = this.buffers.get(inst.id + '_' + role);
      if (!buf) continue;
      const src = c.createBufferSource(); src.buffer = buf;
      let when = passAt - PRE + (from > 0 ? PRE + from : 0), off = from > 0 ? PRE + from : 0, late = false;
      if (when < c.currentTime) { off += c.currentTime - when; when = c.currentTime; late = true; }
      if (off >= buf.duration) continue;
      if (late) { // the scheduler was held up: come in under a short fade, not in the middle of a note at full level
        const g = c.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + 0.04);
        src.connect(g); g.connect(inst.gains[role]); src.onended = () => g.disconnect();
      } else src.connect(inst.gains[role]);
      src.start(when, off); inst.sources.push(src);
    }
    inst.passes.push(passAt);
    inst.nextAt = passAt + inst.d.len;
  }

  /** Scene time now, and the start of the pass it belongs to. */
  where(inst, t) {
    let p = inst.passes[0];
    for (const q of inst.passes) if (q <= t) p = q;
    return { pass: p, pos: t - p };
  }

  /** The next place this scene may be left: the end of a phrase. */
  nextExit(inst, t) {
    const { pass } = this.where(inst, t);
    const u = inst.d.exit;
    return pass + Math.max(1, Math.ceil((t + 0.3 - pass) / u)) * u;
  }

  nextBeat(div = 1) {
    const t = this.ctx.currentTime + PRE + 0.02;   // a one-shot's file starts PRE before its beat
    if (this.phase !== 'scene' || !this.scene) return t;
    const { pass } = this.where(this.scene, t), u = this.scene.d.beat / div;
    return pass + Math.ceil((t - pass) / u) * u;
  }

  endScene(inst, at, fade) {
    if (!inst || inst.ending) return;
    const c = this.ctx; inst.ending = true;
    const t0 = Math.max(c.currentTime, at);
    for (const role of ROLES) { const g = inst.gains[role].gain; holdParam(g, t0); g.setTargetAtTime(0, t0, fade / 4); }
    inst.deadAt = t0 + fade * 1.5 + 0.1;
    for (const s of inst.sources) { try { s.stop(inst.deadAt); } catch (e) { /* already stopped */ } }
    this.old.push(inst);
    if (this.scene === inst) this.scene = null;
  }

  sweepOld(t) {
    const n = this.old.length;
    this.old = this.old.filter((o) => {
      if (t < o.deadAt + 0.3) return true;
      for (const role of ROLES) o.gains[role].disconnect();
      return false;
    });
    if (this.old.length < n) this.trimScenes();
  }

  /* ---------------- the scheduler ---------------- */

  /** Called every frame and from a timer: keeps the loop scheduled and moves the music between its states. */
  pump() {
    if (!this.enabled || !this.built) return;
    const c = this.ctx, t = c.currentTime;
    this.wake();
    const gap = t - this.lastPumpAt;
    if (gap > 0.001) { this.pumpGap = gap > this.pumpGap ? Math.min(3, gap) : 0.8 * this.pumpGap + 0.2 * gap; this.lastPumpAt = t; }
    this.sweepOld(t);
    if (this.readyFailed && wall() - this.lastPreloadTry > 5000) this.preload();
    if (this.conflictAt && t >= this.conflictAt) { this.conflictAt = 0; this.shot('sting_conflict', { at: this.nextBeat(2) }); }
    const mood = this.waiting ? 'dawn' : this.wantMood;

    if (this.phase === 'idle') {
      if (this.awaitFrame && !this.offline && wall() - this.enabledAt < 300) return;   // the first frame says which hour it is
      if (this.sceneReady(mood)) { this.balance(); this.startScene(mood, t + 0.15); }
      else this.loadScene(mood);
      return;
    }

    if (this.phase === 'bed') { this.pumpBed(t, mood); return; }

    if (this.phase === 'hold') {
      const h = this.hold;
      if (!this.frozen && t - h.at >= T.holdMin) this.leaveHold(t, mood);
      else if (mood !== h.id && !this.sceneReady(mood) && t - this.moodSince > 0.4) this.loadScene(mood); // have the next scene ready for the end of the hold (not every hour the baton passes)
      return;
    }

    // a scene is playing
    const s = this.scene;
    if (!s) { this.phase = 'idle'; return; }
    if (t > s.nextAt - T.lookahead) this.schedulePass(s, s.nextAt);
    if (s.passes.length > 3) s.passes.splice(0, s.passes.length - 3);

    // hold: the visitor has stopped time for long enough
    const lead = Math.max(0.15, 1.5 * this.pumpGap);   // how far ahead things must be scheduled to be sure of being on time
    if (this.frozen && !this.waiting && t - s.startedAt > 1.2 && !this.change && !this.holdPlan && t - this.frozenAt >= 0.12) this.planHold(s);
    const plan = this.holdPlan;
    if (plan) {
      if (!this.frozen || this.waiting) this.holdPlan = null;                       // let go before the hold was due
      else if (plan.loops && t > plan.at + 0.45) this.holdPlan = null;              // too late for that chord: plan again from here
      else if (plan.loops && t >= plan.at - lead) { this.enterHold(Math.max(plan.at, t + 0.02)); return; }
    }

    // the price has moved to another mode: change scene at the end of the phrase
    if (mood !== s.id && !this.holdPlan) {
      const settled = this.waiting || t - this.moodSince >= T.moodSettle;
      if (!this.change && settled && t - s.startedAt >= T.minDwell - 0.01) {
        this.change = { to: mood, at: this.nextExit(s, t) };
        if (!this.sceneReady(mood)) this.loadScene(mood);
      }
    }
    if (this.change) {
      const ch = this.change;
      if (ch.to !== mood) this.change = null; // the price moved back: stay
      else if (t > ch.at - Math.max(0.35, lead)) {
        if (this.sceneReady(ch.to) && t < ch.at - 0.02) {
          this.endScene(s, ch.at, T.sceneFade);
          this.startScene(ch.to, ch.at);
          this.change = null;
        } else ch.at = this.nextExit(s, t + 0.4); // not decoded yet: take the next exit
      }
    }
  }

  /* ---------------- the hold ---------------- */

  /**
   * Time has stopped. The chord to hold is the one that will be sounding holdAfter from the touch (a little later
   * where that would straddle a beat). The recording is known in advance, so the loops are made before they are needed.
   */
  planHold(s) {
    const c = this.ctx, t = c.currentTime, d = s.d;
    const earliest = Math.max(this.frozenAt + T.holdAfter, t + this.freezeCost * 1.4 + 0.08, t + 1.5 * this.pumpGap + 0.05);
    const { pass } = this.where(s, earliest);
    // where the beat is long enough, the stretch that is analysed lies inside one beat, so that it does not mix two chords
    const any = this.buffers.get(s.id + '_floor'), rate = any ? any.sampleRate : c.sampleRate;
    const span = Math.min(FREEZE_SEG / rate + 0.05, 0.9 * d.beat);
    const into = (earliest - pass) % d.beat;
    const at = into >= span ? earliest : earliest + (span - into);
    const pos = ((at - pass) % d.len + d.len) % d.len;
    const plan = this.holdPlan = { id: s.id, at, pos, loops: null, rate: 0 };
    const segs = ROLES.map((role) => {
      const buf = this.buffers.get(s.id + '_' + role);
      if (!buf) return null;
      const W = FREEZE_W, n = FREEZE_SEG;
      const end = Math.round((PRE + pos) * buf.sampleRate);
      const seg = new Float32Array(n);
      const a = end - n;
      if (a >= 0 && buf.copyFromChannel) buf.copyFromChannel(seg, 0, a);
      else {
        const ch = buf.getChannelData(0); // the hold falls at the very start of a pass: the end of the previous pass is what was sounding
        const wrap = Math.round(d.len * buf.sampleRate);
        for (let i = 0; i < n; i++) { let j = a + i; if (j < 0) j += wrap; seg[i] = ch[Math.max(0, Math.min(j, ch.length - 1))]; }
      }
      plan.rate = buf.sampleRate; plan.centre = (W >> 1) / buf.sampleRate;
      return seg;
    });
    const asked = c.currentTime;
    this.track(this.freeze(segs, 8).then((loops) => {
      if (!this.offline) this.freezeCost = 0.5 * this.freezeCost + 0.5 * Math.max(0.02, c.currentTime - asked);
      if (this.holdPlan === plan) { if (c.currentTime > plan.at + 0.45) this.holdPlan = null; else plan.loops = loops; }   // too late: the next pump plans again
      this.pump();
    }));
  }

  /** Make the held loops off the main thread; on it, a stem at a time, where a worker is not available. */
  freeze(segs, frames) {
    if (this.worker === null && !this.offline) {
      try {
        this.worker = new Worker(URL.createObjectURL(new Blob([FREEZE_WORKER], { type: 'text/javascript' })));
        this.worker.onmessage = (e) => { const job = this.freezeJobs.get(e.data.id); if (job) { this.freezeJobs.delete(e.data.id); job(e.data.out); } };
        this.worker.onerror = () => {
          try { this.worker.terminate(); } catch (e) { /* gone already */ }
          this.worker = false; this.note('error', 'the hold is being worked out on the main thread (the background worker failed)');
          for (const [, job] of this.freezeJobs) job(null); this.freezeJobs.clear();
        };
      } catch (e) { this.worker = false; }
    }
    if (this.worker) {
      return new Promise((ok) => {
        const id = ++this.freezeId;
        this.freezeJobs.set(id, (out) => ok(out || this.freezeHere(segs, frames)));
        this.worker.postMessage({ id, segs, frames });
      });
    }
    return this.freezeHere(segs, frames);
  }
  async freezeHere(segs, frames) {
    const out = [];
    for (const s of segs) {
      out.push(s ? freezeLoop(s, frames) : null);
      if (!this.offline) await new Promise((r) => setTimeout(r, 0)); // let a frame through between stems
    }
    return out;
  }

  /** Everything is scheduled for `t`, which may be a moment ahead: the loops come in as the scene goes out. */
  enterHold(t) {
    const c = this.ctx, plan = this.holdPlan, s = this.scene;
    this.holdPlan = null;
    const h = this.hold = { id: plan.id, at: t, pos: plan.pos, sources: [], gains: [], askedAt: 0 };
    ROLES.forEach((role, i) => {
      const data = plan.loops[i];
      if (!data) return;
      const buf = c.createBuffer(1, data.length, plan.rate);
      buf.copyToChannel ? buf.copyToChannel(data, 0) : buf.getChannelData(0).set(data);
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(s.norm[role], t + 0.3);
      src.connect(g); g.connect(this.stems[role].input);
      src.onended = () => g.disconnect();
      // loop time zero is the centre of the analysed window: starting here, each held note is the played note carrying on
      src.start(t, (((t - plan.at + plan.centre) % buf.duration) + buf.duration) % buf.duration);
      h.sources.push(src); h.gains.push(g);
    });
    this.endScene(s, t, 0.3);
    this.phase = 'hold'; this.change = null;
    this.note('hold', plan.id + ' @' + plan.pos.toFixed(2));
    this.balance();
  }

  /** The hold ends: the same phrase goes on from where it stopped, or, if the hour has changed, the new scene begins. */
  leaveHold(t, mood) {
    const h = this.hold;
    let same = mood === h.id;
    if (!this.sceneReady(same ? h.id : mood)) {
      this.loadScene(same ? h.id : mood);
      h.askedAt = h.askedAt || t;
      if (same || t - h.askedAt < 2 || !this.sceneReady(h.id)) { if (t - h.askedAt > 6) { this.fadeHold(t, 1.4); this.phase = 'idle'; } return; }   // a chord is never left sounding for good
      same = true;   // the new hour's scene will not load: go on with the one that was playing
    }
    this.fadeHold(t, same ? 0.5 : 1.4);
    if (same) this.startScene(h.id, t + 0.06, { offset: h.pos, fade: 0.25 });
    else this.startScene(mood, t + 0.2);
    this.balance();
  }

  fadeHold(t, fade) {
    const h = this.hold; if (!h) return;
    for (const g of h.gains) { holdParam(g.gain, t); g.gain.setTargetAtTime(0, t, fade / 3.5); }
    for (const s of h.sources) { try { s.stop(t + fade * 1.6 + 0.1); } catch (e) { /* already stopped */ } }
    this.hold = null;
  }

  /** A hold is a fermata: the orchestra holds the chord it is on, and takes it up again where it left off. */
  setFrozen(f) {
    f = !!f;
    if (f && !this.frozen) this.frozenAt = this.ctx ? this.ctx.currentTime : 0;
    if (f) {
      // main.js stops the clock and asks its question in the same call; a touch stops the clock in a task of its own
      this.justFrozen = true;
      if (typeof queueMicrotask !== 'undefined') queueMicrotask(() => { this.justFrozen = false; }); else this.justFrozen = false;
    }
    this.frozen = f;
    if (!f) {
      this.focus = null;
      if (this.waiting) { this.waiting = false; this.moodSince = -1e9; this.note('answer', 'no'); } // the visitor said no: back to the hour
    }
    if (this.enabled) { this.balance(); this.pump(); }
  }

  /* ---------------- event passages ---------------- */

  playBed(name, at, { from = 0 } = {}) {
    const c = this.ctx, d = SCORE.beds[name], buf = this.buffers.get(name);
    if (!buf) return null;
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); const v = db(d.gainDb - d.norm);
    let when = at - PRE + from, off = from;
    if (when < c.currentTime) { off += c.currentTime - when; when = c.currentTime; }
    if (off > 0.001) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(v, when + 0.05); } else g.gain.value = v;
    if (off >= buf.duration) return null;
    src.connect(g); g.connect(this.bedBus);
    src.start(when, off);
    const voice = { name, src, g, v, at };
    src.onended = () => { g.disconnect(); if (this.bedVoices) this.bedVoices = this.bedVoices.filter((x) => x !== voice); };
    (this.bedVoices ||= []).push(voice);
    return voice;
  }

  fadeBeds(t, fade) {
    for (const v of this.bedVoices || []) { holdParam(v.g.gain, t); v.g.gain.setTargetAtTime(0, t, fade / 3.5); try { v.src.stop(t + fade * 1.6 + 0.1); } catch (e) { /* already stopped */ } }
  }

  /** Clear the stage for a passage: whatever was playing fades under it. */
  clearFor(t, fade) {
    for (const o of this.old) for (const role of ROLES) { const g = o.gains[role].gain; holdParam(g, t); g.setTargetAtTime(0, t, fade / 4); }   // a scene still fading for a change goes now
    if (this.scene) this.endScene(this.scene, t, fade);
    if (this.hold) this.fadeHold(t, fade);
    this.fadeBeds(t, fade);
    this.holdPlan = null; this.change = null;
  }

  /**
   * A change is committed. The held dominant and a breath (7.5 s), then the release, which lands as the ride
   * arrives at the object (main.js: 0.6 of its 12.6 s). The first commit of a visit gets the long release and
   * the afterglow; later ones the brief release, so the answer never outstays the question.
   * @param data  optional { ride: false } when the app commits without a ride (reduced motion, or nothing moved)
   */
  downbeat(data = {}) {
    if (!this.enabled || !this.built) return;
    const c = this.ctx, t = c.currentTime;
    this.focus = null;
    this.commits++; this.lastDownbeat = t;
    const releasing = t < this.calmAt;   // the ride and the release are not interrupted
    if (releasing || data.ride === false || !this.buffers.has('ride')) { this.shot('sting_commit', { at: t + 0.03, gain: 1.6 }); this.note('commit', 'sting'); return; }
    const long = this.opts.firstRelease === 'release' && t - this.lastFullRelease >= T.fullReleaseEvery;
    const t0 = t + 0.05;
    this.clearFor(t, 0.6);
    this.waiting = false;
    if (this.opts.small) { for (const id of this.sceneOrder) for (const r of ROLES) this.buffers.delete(id + '_' + r); this.sceneOrder = []; this.sceneSettled.clear(); } // the scenes are not needed for a while: make room for the release
    const ride = SCORE.beds.ride;
    const landAt = t0 + PRE + ride.len;
    this.playBed('ride', t0 + PRE);
    this.bed = { kind: 'commit', long, landAt, steps: [{ name: long ? 'release' : this.opts.laterRelease, at: landAt, done: false }], sceneAt: null, calmAt: Infinity };
    this.planRelease(this.bed.steps[0].name);
    if (long) { this.load('release').catch(() => {}); this.load('afterglow').catch(() => {}); }
    this.phase = 'bed';
    this.note('commit', long ? 'ride, release, afterglow' : 'ride, brief release');
  }

  planRelease(name) {
    const b = this.bed, d = SCORE.beds[name];
    b.steps = [{ name, at: b.landAt, done: false }];
    if (name === 'release') {
      b.calmAt = b.landAt + d.len;                                  // the afterglow may be interrupted; the release may not
      b.steps.push({ name: 'afterglow', at: b.calmAt, done: false });
      b.sceneAt = b.calmAt + SCORE.beds.afterglow.len - T.afterglowOverlap;
    } else {
      b.calmAt = b.landAt + d.len;
      b.sceneAt = b.calmAt + 1.0;                                   // the last chord rings, then the hour returns
    }
    this.calmAt = b.calmAt;
  }

  /** The system needs the visitor's yes: the orchestra lands on B flat instead of home, and waits over a held A. */
  question() {
    const c = this.ctx, t = c.currentTime;
    if (t < this.calmAt) { this.shot('sting_ask'); return; }
    if (!this.buffers.has('question')) { this.shot('sting_ask'); return; }
    const t0 = t + 0.05;
    this.clearFor(t, 0.5);
    this.playBed('question', t0 + PRE);
    this.waiting = true;
    this.bed = { kind: 'question', steps: [], sceneAt: t0 + PRE + SCORE.beds.question.len, calmAt: t };
    this.phase = 'bed';
    if (!this.sceneReady('dawn')) this.loadScene('dawn');
    this.note('question', 'B flat, then waiting');
  }

  pumpBed(t, mood) {
    const b = this.bed;
    for (const st of b.steps) {
      if (st.done) continue;
      if (this.buffers.has(st.name)) { if (t > st.at - 1.2) { this.playBed(st.name, st.at); st.done = true; if (st.name === 'release') this.lastFullRelease = st.at; if (this.opts.small && st.name !== 'release_brief') this.buffers.delete(st.name); } } // once it is playing, the long passage needs no copy here
      else if (st.name === 'release' && t > st.at - 0.4) { this.planRelease(this.opts.laterRelease); this.note('commit', 'long release not decoded in time: brief release'); return; }
      else if (st.name === 'afterglow' && t > st.at - 0.2) { st.done = true; b.sceneAt = st.at + 1.0; }
      else if (st.name !== 'release' && st.name !== 'afterglow' && t > st.at - 0.2) { st.done = true; b.calmAt = this.calmAt = st.at; b.sceneAt = st.at + 0.5; this.shot('sting_commit', { at: st.at, gain: 1.6 }); }   // no release to play: a chord, and back to the hour
    }
    if (b.sceneAt != null && t > b.sceneAt - 5 && !this.sceneReady(mood)) this.loadScene(mood);
    if (b.sceneAt != null && t > b.sceneAt - T.lookahead) {
      if (this.sceneReady(mood)) {
        const at = Math.max(b.sceneAt, t + 0.15);
        this.bed = null;
        this.balance();
        this.startScene(mood, at, { fade: 1.2 });
      } else this.loadScene(mood);
    }
  }

  /* ---------------- short answers ---------------- */

  /** A one-shot at a place in the room. Nothing else is turned down for it. */
  shot(name, { at = null, gain = 1, place = null } = {}) {
    const c = this.ctx, d = SCORE.shots[name], buf = this.buffers.get(name);
    if (!d || !buf) return;
    const t = Math.max(c.currentTime, (at == null ? c.currentTime + 0.02 : at) - PRE);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = db(d.gainDb - d.norm + T.shotGainDb) * gain;
    const p = this.makePanner(); setPos(p, this.positions[place || PLACE[d.role]] || DEFAULT_POSITIONS.pad);
    const send = c.createGain(); send.gain.value = db(SCORE.hall.sendDb0 + SCORE.hall.sendDbPerDepth * d.depth);
    src.connect(g); g.connect(p); p.connect(this.dryBus); g.connect(send); send.connect(this.revIn);
    src.onended = () => { g.disconnect(); p.disconnect(); send.disconnect(); };
    src.start(t);
  }

  /**
   * Conducting gestures.
   *   sweep  { dir: +1 | -1, speed: 0..1 }   a glissando the way the hand goes; forward the orchestra swells, back it hushes
   *   point  { section }                      that object answers, and comes forward while its decision is open
   *   open   {}                               a soft rising figure
   */
  gesture(kind, data = {}) {
    if (!this.enabled || !this.built) return;
    const c = this.ctx, t = c.currentTime;
    if (kind === 'sweep') {
      if (t - this.lastSweep < T.sweepEvery) return;
      this.lastSweep = t;
      const speed = clamp(data.speed == null ? 0.5 : data.speed, 0, 1), up = data.dir >= 0;
      const g = this.surge.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(up ? 1 + 0.45 * speed : 1 - 0.35 * speed, t, 0.09);
      g.setTargetAtTime(1, t + 0.45, up ? 0.7 : 0.9);
      if (t - this.lastGliss >= T.glissEvery) { this.lastGliss = t; this.shot(up ? 'gliss_up' : 'gliss_down', { gain: 0.55 + 0.45 * speed }); }
      return;
    }
    if (kind === 'point') {
      const sec = data.section;
      const calls = SECTION_CALLS[sec]; if (!calls) return;
      const n = (this.callAlt[sec] = ((this.callAlt[sec] || 0) + 1) % calls.length);
      this.shot(calls[n], { at: this.nextBeat(2), place: SECTION_PLACE[sec] });
      this.focus = SECTION_ROLES[sec] || null;
      this.balance();
      return;
    }
    if (kind === 'open') this.shot('sting_ask', { gain: 0.6 });
  }

  /** The ride: the camera's swell opens the stems a little; the music of the ride itself begins at downbeat(). */
  setSwell(a) {
    if (!this.enabled) return;
    a = clamp(a, 0, 1);
    if (Math.abs(a - this.swell) < 0.01) return;
    this.swell = a;
  }

  /** Small events: a decision made, a question asked, a conflict raised. */
  ping(kind = 'decision', data = {}) {
    if (!this.enabled || !this.built) return;
    const t = this.ctx.currentTime;
    const pending = data.pending != null ? !!data.pending : (kind === 'ask' && this.frozen && this.justFrozen);
    if (kind === 'ask' && pending) { this.question(); return; }
    if (t - (this.lastPing[kind] || -9) < 0.35) return;                   // several at once sound as one
    if (kind === 'conflict' && t < Math.max(this.calmAt, this.lastDownbeat + 2)) { const at = Math.max(this.calmAt, t) + 1.5; this.conflictAt = at - t <= 30 ? at : 0; return; }   // main.js raises conflicts in the same call as the commit: they sound once the release has landed
    this.lastPing[kind] = t;
    const quiet = this.phase === 'bed' ? 0.6 : 1;
    this.shot(kind === 'conflict' ? 'sting_conflict' : kind === 'ask' ? 'sting_ask' : 'sting_decision', { at: this.nextBeat(2), gain: quiet });
  }

  /** One beat of the modelled day (a quarter-hour). The music keeps its own tempo; the cable's warnings follow the day. */
  beat(slot, f) {
    if (!this.enabled || !this.built || this.frozen) return;
    if (slot === this.lastBeat) return;
    this.lastBeat = slot;
    if (this.phase === 'bed') return;
    const cable = f.cableFrac || 0;
    if (cable > 1 && slot % 4 === 0) this.shot('timp_hard', { gain: 0.8 });
    else if (cable > 0.82 && slot % 8 === 0) this.shot('timp_soft', { gain: 0.5 + 0.5 * clamp((cable - 0.82) / 0.18, 0, 1) });
  }

  /* ---------------- places ---------------- */

  /** Where each section plays from. Also the moment the audio starts decoding, before the first touch. */
  setPositions(map) {
    Object.assign(this.positions, map);
    this.applyPositions();
    if (typeof window !== 'undefined' && !this.ready && this.opts.preload) { try { this.preload(); } catch (e) { /* the first touch will do it */ } }
  }

  /** The listener follows the visitor's head. */
  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else if (L.setPosition) { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }

  stopAll(at) {
    const t = this.ctx.currentTime;
    if (this.scene) this.endScene(this.scene, t, Math.max(0.05, at - t));
    if (this.hold) this.fadeHold(t, Math.max(0.05, at - t) * 0.6);
    this.fadeBeds(t, Math.max(0.05, at - t) * 0.6);
    this.phase = 'idle'; this.bed = null; this.holdPlan = null; this.change = null; this.waiting = false; this.focus = null; this.calmAt = -1e9; this.conflictAt = 0;
  }

  /** What is playing, for the staff view and for tests. */
  state() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    return { t, phase: this.phase, mode: this.mode, scene: this.scene ? this.scene.id : this.hold ? this.hold.id : null, bed: this.bed ? this.bed.kind : null, waiting: this.waiting, frozen: this.frozen, mood: this.wantMood, levels: Object.assign({}, this.levels), decoded: this.buffers.size };
  }

  /** Kept for callers that only know activity levels; the score itself uses setFrame and beat. */
  setActivity() {}
}

/** Stop a parameter's scheduled changes at t without a jump in its value. */
function holdParam(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else { const v = param.value; param.cancelScheduledValues(t); param.setValueAtTime(v, t); }
}
/** Wall-clock milliseconds (the audio clock stands still while a context is suspended). */
function wall() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
function setPos(p, v) {
  const [x, y, z] = v;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
}
