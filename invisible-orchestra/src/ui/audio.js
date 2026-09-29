/**
 * The orchestra, heard.
 *
 * A generative score played from the simulation, not over it. Every
 * participant is a section, and each section plays only what its part of
 * the day is doing:
 *
 *   wind      strings    sustained; louder as the wind rises
 *   home      pad        warm chord tones; swells while the heat pump runs
 *   car       cello      pizzicato on the beat, only while charging
 *   bakery    brass      slow-attack chords while the ovens are hot
 *   battery   harp       an arpeggio up when storing, down when releasing
 *   cable     timpani    enters only near the limit; every beat when over it
 *
 * One beat is one quarter-hour of the modelled day; a bar is an hour. The
 * mode follows the tariff: Lydian when electricity is cheapest, then
 * Ionian, Dorian, and Aeolian for the dear evening. A hold is a fermata
 * (the sustained sections hold, the plucks stop). The ride is a swell.
 * A release is a downbeat.
 *
 * Everything is synthesised: no recordings, no licences, nothing to load.
 * The sound never carries a fact on its own; every fact is also on screen.
 */

const ROOT = 146.83; // D3
const MODES = {
  lydian: [0, 2, 4, 6, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};
const PROG = [0, 3, 4, 0]; // I IV V I, one chord per hour
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function modeForPrice(pence) {
  return pence <= 10 ? 'lydian' : pence <= 18 ? 'ionian' : pence <= 26 ? 'dorian' : 'aeolian';
}
/** Frequency of a scale degree (0 = root; 7 = the root an octave up) in a mode, shifted by octaves. */
export function degreeHz(mode, degree, octave = 0) {
  const scale = MODES[mode] || MODES.ionian;
  const oct = Math.floor(degree / 7);
  const step = scale[((degree % 7) + 7) % 7];
  return ROOT * Math.pow(2, (step + 12 * oct + 12 * octave) / 12);
}

export class Orchestra {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.sections = {};
    this.mode = 'ionian';
    this.chordRoot = 0;
    this.frozen = false;
    this.swell = 0;
    this.lastBeat = -1;
    this.positions = {}; // section → [x, y, z] in scene metres; set by the app from the objects' places
  }

  /** Where each section plays from (for the listener's ears, on a headset or a stereo pair). */
  setPositions(map) {
    Object.assign(this.positions, map);
    for (const k in this.sections) { const p = this.positions[k]; if (p && this.sections[k].panner) setPos(this.sections[k].panner, p); }
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

  enable() {
    if (this.enabled) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      if (c.state === 'suspended') c.resume();
      if (!this.master) this.build(c);
      this.master.gain.setTargetAtTime(0.55, c.currentTime, 1.5);
      this.enabled = true;
    } catch (e) { this.enabled = false; }
  }

  disable() {
    if (!this.enabled) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    this.enabled = false;
  }

  build(c) {
    this.master = c.createGain(); this.master.gain.value = 0;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 4; this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 3200; this.tone.Q.value = 0.3;
    // a hall: generated impulse, no file
    this.reverb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 2.4);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.7)) * 0.5; }
    this.reverb.buffer = ir;
    this.wet = c.createGain(); this.wet.gain.value = 0.28;
    this.dry = c.createGain(); this.dry.gain.value = 1;
    this.bus = c.createGain();
    this.bus.connect(this.dry); this.dry.connect(this.tone);
    this.bus.connect(this.reverb); this.reverb.connect(this.wet); this.wet.connect(this.tone);
    this.tone.connect(this.comp); this.comp.connect(this.master); this.master.connect(c.destination);
    // sustained sections
    this.sections.strings = this.section({ type: 'sawtooth', voices: [[0, 0, -6], [4, 0, 5], [7, 0, -3]], cutoff: 900, level: 0 });
    this.sections.pad = this.section({ type: 'triangle', voices: [[2, 0, 0], [6, 0, 4], [0, 1, -4]], cutoff: 700, level: 0 });
    this.sections.brass = this.section({ type: 'sawtooth', voices: [[0, -1, 0], [4, -1, 7], [2, 0, -7]], cutoff: 500, level: 0 });
    this.setPositions(this.positions);
    // slow vibrato on the strings
    const lfo = c.createOscillator(); lfo.frequency.value = 4.6;
    const lfoG = c.createGain(); lfoG.gain.value = 2.2;
    lfo.connect(lfoG); for (const v of this.sections.strings.voices) lfoG.connect(v.osc.detune); lfo.start();
    this.retune(true);
  }

  /** A sustained section: voices = [[degree, octave, detuneCents], …]. */
  section({ type, voices, cutoff, level }) {
    const c = this.ctx;
    const gain = c.createGain(); gain.gain.value = level;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.5;
    const panner = makePanner(c);
    filter.connect(gain); gain.connect(panner); panner.connect(this.bus);
    const vs = voices.map(([degree, octave, detune]) => {
      const osc = c.createOscillator(); osc.type = type; osc.detune.value = detune;
      const g = c.createGain(); g.gain.value = 1 / voices.length;
      osc.connect(g); g.connect(filter); osc.start();
      return { osc, degree, octave };
    });
    return { gain, filter, voices: vs, level, cutoff, panner };
  }

  retune(now = false) {
    const c = this.ctx;
    const t = c.currentTime;
    for (const key in this.sections) {
      for (const v of this.sections[key].voices) {
        const hz = degreeHz(this.mode, this.chordRoot + v.degree, v.octave);
        if (now) v.osc.frequency.setValueAtTime(hz, t); else v.osc.frequency.setTargetAtTime(hz, t, 0.12);
      }
    }
  }

  setLevel(name, level, tc = 0.35) {
    const s = this.sections[name];
    if (!s) return;
    if (Math.abs(level - s.level) < 0.003) return;
    s.level = level;
    s.gain.gain.setTargetAtTime(level, this.ctx.currentTime, tc);
  }

  /** Per rendered frame: the sustained sections follow the state of the day. */
  setFrame(f) {
    if (!this.enabled) return;
    const swell = this.swell;
    this.setLevel('strings', (0.05 + 0.13 * f.windFrac) * (1 + 0.8 * swell));
    this.sections.strings.filter.frequency.setTargetAtTime(600 + 1600 * f.windFrac + 1800 * swell, this.ctx.currentTime, 0.5);
    this.setLevel('pad', 0.02 + (f.heatKw > 0.1 ? 0.09 : 0.02 * f.tempFrac));
    const oven = clamp(f.bakeryKw / 30, 0, 1);
    this.setLevel('brass', 0.12 * oven, 0.9);
    this.sections.brass.filter.frequency.setTargetAtTime(500 + 1800 * oven, this.ctx.currentTime, 0.9);
  }

  /** One beat = one quarter-hour of the modelled day. */
  beat(slot, f, beatSec) {
    if (!this.enabled || this.frozen) return;
    if (slot === this.lastBeat) return;
    this.lastBeat = slot;
    const c = this.ctx;
    const t0 = c.currentTime + 0.02;
    const bar = Math.floor(slot / 4);
    const beatInBar = slot % 4;
    const mode = modeForPrice(f.price);
    const root = PROG[bar % PROG.length];
    if (mode !== this.mode || root !== this.chordRoot) { this.mode = mode; this.chordRoot = root; this.retune(); }
    const sec = clamp(beatSec, 0.25, 4);
    // cello pizzicato while the car charges: root – fifth – third – fifth, an octave below
    if (f.evKw > 0.1) {
      const walk = [0, 4, 2, 4][beatInBar];
      const g = 0.16 * clamp(f.evKw / 7, 0.2, 1);
      this.pluck(t0, degreeHz(mode, root + walk, -1), g, 0.45, 'triangle', 1100, this.positions.cello);
      this.pluck(t0 + sec * 0.5, degreeHz(mode, root + walk + 2, -1), g * 0.7, 0.35, 'triangle', 1100, this.positions.cello);
    }
    // harp while the battery moves: up when storing, down when releasing
    if (Math.abs(f.batteryKw) > 0.1) {
      const up = f.batteryKw > 0;
      for (let k = 0; k < 4; k++) {
        const d = up ? k * 2 : 6 - k * 2;
        this.pluck(t0 + k * sec * 0.25, degreeHz(mode, root + d, 1), 0.07, 0.6, 'sine', 4000, this.positions.harp);
      }
    }
    // timpani only near the cable's limit; every beat when over it
    const strain = clamp((f.cableFrac - 0.82) / 0.18, 0, 1);
    if (strain > 0 && (f.cableFrac > 1 || beatInBar === 0)) this.timpani(t0, 0.25 + 0.75 * strain, this.positions.timpani);
  }

  pluck(t, hz, gain, decay, type = 'triangle', cutoff = 1200, pos = null) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = hz;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff;
    const g = c.createGain(); g.gain.value = 0;
    o.connect(fl); fl.connect(g); g.connect(this.out(pos));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0004, t + decay);
    o.start(t); o.stop(t + decay + 0.05);
  }

  timpani(t, gain, pos = null) {
    const c = this.ctx;
    const dest = this.out(pos);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(92, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const g = c.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
    o.start(t); o.stop(t + 1);
    // the skin: a short burst of filtered noise
    const n = c.createBufferSource(); const len = Math.floor(c.sampleRate * 0.12); const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = b; const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 400;
    const ng = c.createGain(); ng.gain.value = 0.25 * gain;
    n.connect(nf); nf.connect(ng); ng.connect(dest); n.start(t);
  }

  /** A destination at a place in the room, or the plain bus. */
  out(pos) {
    if (!pos) return this.bus;
    const p = makePanner(this.ctx); setPos(p, pos); p.connect(this.bus);
    return p;
  }

  /** A release: the ensemble lands on the chord together. */
  downbeat() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime + 0.02;
    this.timpani(t, 0.5);
    for (let k = 0; k < 3; k++) this.pluck(t + k * 0.06, degreeHz(this.mode, this.chordRoot + [0, 4, 7][k], 0), 0.12, 1.2, 'sine', 3000);
    const s = this.sections.strings;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setTargetAtTime(s.level + 0.12, t, 0.1);
    s.gain.gain.setTargetAtTime(s.level, t + 0.6, 0.8);
  }

  /** The ride: brighter, wetter, bigger. 0 … 1. */
  setSwell(a) {
    if (!this.enabled) return;
    a = clamp(a, 0, 1);
    if (Math.abs(a - this.swell) < 0.01) return;
    this.swell = a;
    const t = this.ctx.currentTime;
    this.wet.gain.setTargetAtTime(0.28 + 0.4 * a, t, 0.5);
    if (!this.frozen) this.tone.frequency.setTargetAtTime(3200 + 4000 * a, t, 0.5);
  }

  /** A hold is a fermata: the sustained sections hold under a closed filter, the plucks stop. */
  setFrozen(f) {
    this.frozen = f;
    if (!this.enabled) return;
    this.tone.frequency.setTargetAtTime(f ? 700 : 3200 + 4000 * this.swell, this.ctx.currentTime, 0.6);
  }

  /** Small events: a decision made, a question asked, a conflict raised. */
  ping(kind = 'decision') {
    if (!this.enabled) return;
    const t = this.ctx.currentTime + 0.01;
    if (kind === 'conflict') { this.pluck(t, degreeHz('aeolian', this.chordRoot + 1, 0), 0.14, 1.4, 'sine', 3000); this.pluck(t + 0.02, degreeHz('aeolian', this.chordRoot + 4, 0), 0.1, 1.4, 'sine', 3000); return; }
    if (kind === 'ask') { this.pluck(t, degreeHz(this.mode, this.chordRoot + 4, 1), 0.12, 1.2, 'sine', 4000); this.pluck(t + 0.18, degreeHz(this.mode, this.chordRoot + 6, 1), 0.1, 1.2, 'sine', 4000); return; }
    this.pluck(t, degreeHz(this.mode, this.chordRoot + 7, 1), 0.1, 1.0, 'sine', 4000);
  }

  /** Kept for callers that only know activity levels; the score itself uses setFrame and beat. */
  setActivity() {}
}

function makePanner(c) {
  const p = c.createPanner();
  p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 7; p.rolloffFactor = 0.35; p.coneInnerAngle = 360;
  return p;
}
function setPos(p, v) {
  const [x, y, z] = v;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
}
