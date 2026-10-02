/**
 * The orchestra, heard.
 *
 * A generative score played from the simulation, not over it. Every
 * participant is a section and each section plays only what its part of
 * the day is doing:
 *
 *   wind      strings     four voices, voice-led chords, a chorus and a hall
 *   (always)  bass        the chord root an octave below, the floor of the room
 *   home      pad         warm upper chord tones, a slow tremolo; swells while the heat pump runs
 *   car       cello       pizzicato on the beat with a body resonance and an echo, only while charging
 *   bakery    brass       slow-attack chords through a resonant filter while the ovens are hot
 *   battery   harp        an arpeggio up when storing, down when releasing, with a ping-pong sparkle
 *   cable     timpani     enter only near the limit; every beat over it
 *   (thread)  flute       a motif, two bars on and one bar's rest, for whichever section leads
 *
 * One beat is one quarter-hour of the modelled day; a bar is an hour. The
 * mode follows the tariff: Lydian when electricity is cheapest, then Ionian,
 * Dorian, and Aeolian for the dear evening. Each mode has its own chord cycle,
 * every note comes from the mode and chord tones sit on strong beats, so it
 * is never discordant. Voice leading moves each sustained voice to the
 * nearest chord tone rather than jumping in parallel.
 *
 * Gestures are musical: a hold is a fermata, the ride is a swell with rising
 * arpeggios, a release is a cadence, a sweep of the baton is a glissando in
 * the direction of the sweep, pointing at an object is a two-note call from
 * its section.
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
// one chord per bar (hour), as roots in scale degrees; all chords are diatonic sevenths
const PROG = {
  lydian: [0, 1, 4, 0],   // I  II  V   I   (the bright Lydian II)
  ionian: [0, 5, 3, 4],   // I  vi  IV  V
  dorian: [0, 3, 6, 0],   // i  IV  VII i
  aeolian: [0, 5, 2, 6],  // i  VI  III VII
};
// motifs: [scale degree relative to the chord root, length in beats]
const MOTIFS = {
  car: [[4, 1], [5, 0.5], [4, 0.5], [2, 1], [0, 1], [2, 0.5], [4, 0.5], [7, 3]],
  home: [[2, 1], [4, 1], [5, 0.5], [4, 0.5], [2, 1], [0, 1], [1, 1], [0, 2]],
  bakery: [[0, 0.5], [0, 0.5], [4, 1], [7, 2], [4, 0.5], [2, 0.5], [0, 1], [0, 2]],
  battery: [[7, 1], [6, 1], [4, 1], [2, 1], [4, 1], [2, 1], [0, 2]],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function modeForPrice(pence) {
  return pence <= 10 ? 'lydian' : pence <= 18 ? 'ionian' : pence <= 26 ? 'dorian' : 'aeolian';
}
/** Frequency of an absolute scale degree (0 = root; 7 = the root an octave up) in a mode, shifted by octaves. */
export function degreeHz(mode, degree, octave = 0) {
  const scale = MODES[mode] || MODES.ionian;
  const oct = Math.floor(degree / 7);
  const step = scale[((degree % 7) + 7) % 7];
  return ROOT * Math.pow(2, (step + 12 * oct + 12 * octave) / 12);
}
/** Chord tones of the diatonic seventh on a root degree, across octaves -1..2. */
export function chordTones(root) {
  const out = [];
  for (let o = -1; o <= 2; o++) for (const k of [0, 2, 4, 6]) out.push(root + k + 7 * o);
  return out.sort((a, b) => a - b);
}
/** Nearest chord tone to a previous degree: voice leading by the smallest step. */
export function leadVoice(prev, root, lo = -7, hi = 14) {
  let best = null;
  for (const t of chordTones(root)) {
    if (t < lo || t > hi) continue;
    const d = Math.abs(t - prev);
    if (!best || d < best.d || (d === best.d && t < best.t)) best = { t, d };
  }
  return best ? best.t : prev;
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
    this.positions = {};
    this.phrase = { section: null, beat: 0, rest: 0 };
    this.lastSweep = -1;
  }

  enable() {
    if (this.enabled) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      const offline = typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext;
      if (c.state === 'suspended' && !offline) c.resume();
      if (!this.master) this.build(c);
      this.master.gain.setTargetAtTime(0.5, c.currentTime, 1.2);
      this.enabled = true;
    } catch (e) { this.enabled = false; }
  }

  disable() {
    if (!this.enabled) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    this.enabled = false;
  }

  /* ---------------- the room ---------------- */

  build(c) {
    this.master = c.createGain(); this.master.gain.value = 0;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -16; this.comp.ratio.value = 3; this.comp.attack.value = 0.01; this.comp.release.value = 0.3; this.comp.knee.value = 12;
    this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -3; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12; this.limiter.knee.value = 0;
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 4200; this.tone.Q.value = 0.2;
    // the hall: early reflections then a long decorrelated tail, with a pre-delay and a darker wet
    this.reverb = c.createConvolver(); this.reverb.buffer = hallImpulse(c, 3.6);
    this.predelay = c.createDelay(0.1); this.predelay.delayTime.value = 0.022;
    this.wetTone = c.createBiquadFilter(); this.wetTone.type = 'lowpass'; this.wetTone.frequency.value = 3200;
    this.wet = c.createGain(); this.wet.gain.value = 0.34;
    this.dry = c.createGain(); this.dry.gain.value = 0.95;
    this.bus = c.createGain();
    this.bus.connect(this.dry); this.dry.connect(this.tone);
    this.bus.connect(this.predelay); this.predelay.connect(this.reverb); this.reverb.connect(this.wetTone); this.wetTone.connect(this.wet); this.wet.connect(this.tone);
    this.tone.connect(this.comp); this.comp.connect(this.limiter); this.limiter.connect(this.master); this.master.connect(c.destination);
    // a short echo for plucks (an eighth of a beat later, quiet)
    this.echo = c.createDelay(2); this.echo.delayTime.value = 0.36;
    this.echoGain = c.createGain(); this.echoGain.gain.value = 0.22;
    this.echoTone = c.createBiquadFilter(); this.echoTone.type = 'lowpass'; this.echoTone.frequency.value = 2200;
    this.echoIn = c.createGain();
    this.echoIn.connect(this.echo); this.echo.connect(this.echoTone); this.echoTone.connect(this.echoGain); this.echoGain.connect(this.bus); this.echoGain.connect(this.echo);
    // sustained sections
    this.sections.strings = this.section({ kind: 'strings', voices: [0, 2, 4, 7], cutoff: 1400, gainTc: 0.8 });
    this.sections.bass = this.section({ kind: 'bass', voices: [0], cutoff: 500, gainTc: 0.6 });
    this.sections.pad = this.section({ kind: 'pad', voices: [9, 11, 14], cutoff: 900, gainTc: 1.2 });
    this.sections.brass = this.section({ kind: 'brass', voices: [-7, -3, 0], cutoff: 600, gainTc: 1.0 });
    this.retune(true);
  }

  /** A sustained section: voices start on scale degrees and are voice-led to the nearest chord tone on each change. */
  section({ kind, voices, cutoff, gainTc }) {
    const c = this.ctx;
    const gain = c.createGain(); gain.gain.value = 0;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = kind === 'brass' ? 2.2 : 0.6;
    const panner = makePanner(c);
    filter.connect(gain);
    let tail = gain;
    if (kind === 'strings') {
      // a chorus: two short modulated delays for width
      const mix = c.createGain(); mix.gain.value = 0.42;
      for (const [ms, rate] of [[0.018, 0.31], [0.025, 0.23]]) {
        const d = c.createDelay(0.1); d.delayTime.value = ms;
        const lfo = c.createOscillator(); lfo.frequency.value = rate; const lg = c.createGain(); lg.gain.value = 0.0018;
        lfo.connect(lg); lg.connect(d.delayTime); lfo.start();
        gain.connect(d); d.connect(mix);
      }
      mix.connect(panner);
    }
    gain.connect(panner); panner.connect(this.bus);
    const vs = voices.map((degree) => {
      const oscs = [];
      const mk = (type, detune, g, octave = 0) => { const o = c.createOscillator(); o.type = type; o.detune.value = detune; const og = c.createGain(); og.gain.value = g / voices.length; o.connect(og); og.connect(filter); o.start(); oscs.push({ o, octave }); };
      if (kind === 'strings') { mk('sawtooth', -7, 0.5); mk('sawtooth', 7, 0.5); mk('triangle', 0, 0.35, -1); }
      else if (kind === 'bass') { mk('triangle', 0, 0.9, -1); mk('sawtooth', 0, 0.25, -1); mk('sine', 0, 0.5, -2); }
      else if (kind === 'pad') { mk('sine', 0, 0.7); mk('triangle', 4, 0.35); }
      else { mk('sawtooth', 0, 0.6); mk('square', -5, 0.22); }
      return { oscs, degree };
    });
    if (kind === 'strings') { const lfo = c.createOscillator(); lfo.frequency.value = 5.1; const lg = c.createGain(); lg.gain.value = 3.5; lfo.connect(lg); for (const v of vs) for (const { o } of v.oscs) lg.connect(o.detune); lfo.start(); }
    if (kind === 'pad') { const lfo = c.createOscillator(); lfo.frequency.value = 0.27; const lg = c.createGain(); lg.gain.value = 0.18; lfo.connect(lg); lg.connect(gain.gain); lfo.start(); }
    return { kind, gain, filter, voices: vs, level: 0, cutoff, panner, gainTc };
  }

  retune(now = false) {
    const c = this.ctx;
    const t = c.currentTime;
    for (const key in this.sections) {
      const s = this.sections[key];
      for (const v of s.voices) {
        v.degree = s.kind === 'bass' ? this.chordRoot : leadVoice(v.degree, this.chordRoot, s.kind === 'brass' ? -7 : s.kind === 'pad' ? 7 : -3, s.kind === 'pad' ? 16 : 11);
        for (const { o, octave } of v.oscs) {
          const hz = degreeHz(this.mode, v.degree, octave);
          if (now) o.frequency.setValueAtTime(hz, t); else o.frequency.setTargetAtTime(hz, t, 0.09);
        }
      }
    }
  }

  setLevel(name, level) {
    const s = this.sections[name];
    if (!s) return;
    if (Math.abs(level - s.level) < 0.003) return;
    s.level = level;
    s.gain.gain.setTargetAtTime(level, this.ctx.currentTime, s.gainTc);
  }

  /** Per rendered frame: the sustained sections follow the state of the day. */
  setFrame(f) {
    if (!this.enabled) return;
    const sw = this.swell;
    const t = this.ctx.currentTime;
    const busy = clamp(Math.abs(f.evKw) / 7 + f.heatKw / 3 + f.bakeryKw / 30 + Math.abs(f.batteryKw) / 5, 0, 1);
    this.setLevel('strings', (0.05 + 0.15 * f.windFrac) * (1 + 0.9 * sw));
    this.sections.strings.filter.frequency.setTargetAtTime(700 + 1500 * f.windFrac + 2000 * sw, t, 0.6);
    this.setLevel('bass', 0.09 + 0.08 * busy + 0.08 * sw);
    this.setLevel('pad', 0.025 + (f.heatKw > 0.1 ? 0.085 : 0.02 * (f.tempFrac || 0)));
    const oven = clamp(f.bakeryKw / 30, 0, 1);
    this.setLevel('brass', 0.11 * oven);
    this.sections.brass.filter.frequency.setTargetAtTime(600 + 2000 * oven, t, 0.9);
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
    const prog = PROG[mode];
    const root = prog[bar % prog.length];
    if (mode !== this.mode || root !== this.chordRoot) { this.mode = mode; this.chordRoot = root; this.retune(); }
    const sec = clamp(beatSec, 0.25, 4);
    const P = this.positions;
    // cello pizzicato while the car charges: root – fifth – third – fifth, an octave below, with the "and" lighter
    if (Math.abs(f.evKw) > 0.1) {
      const walk = [0, 4, 2, 4][beatInBar];
      const g = 0.17 * clamp(Math.abs(f.evKw) / 7, 0.25, 1);
      this.cello(t0, degreeHz(mode, root + walk, -1), g, P.cello);
      this.cello(t0 + sec * 0.5, degreeHz(mode, root + walk + 2, -1), g * 0.6, P.cello);
    }
    // harp while the battery moves: up when storing, down when releasing, over two octaves
    if (Math.abs(f.batteryKw) > 0.1) {
      const up = f.batteryKw > 0;
      const tones = chordTones(root).filter((d) => d >= 7 && d <= 20);
      for (let k = 0; k < 4; k++) {
        const d = up ? tones[k] : tones[tones.length - 1 - k];
        this.harp(t0 + k * sec * 0.25, degreeHz(mode, d, 0), 0.075, P.harp);
      }
    }
    // timpani only near the cable's limit; every beat when over it
    const strain = clamp((f.cableFrac - 0.82) / 0.18, 0, 1);
    if (strain > 0 && (f.cableFrac > 1 || beatInBar === 0)) this.timpani(t0, 0.25 + 0.75 * strain, P.timpani);
    // the ride: rising arpeggios while the swell is up
    if (this.swell > 0.5 && beatInBar % 2 === 0) {
      const tones = chordTones(root).filter((d) => d >= 0 && d <= 14);
      for (let k = 0; k < 6; k++) this.harp(t0 + k * sec * 0.12, degreeHz(mode, tones[Math.min(tones.length - 1, k + beatInBar)], 0), 0.06, null);
    }
    // the thread: a motif for whichever section leads, two bars on and one bar's rest
    this.thread(t0, slot, beatInBar, sec, f, mode, root);
  }

  thread(t0, slot, beatInBar, sec, f, mode, root) {
    const ph = this.phrase;
    if (beatInBar === 0) {
      if (ph.section && ph.beat >= 8) { ph.section = null; ph.rest = 4; }
      if (!ph.section) {
        if (ph.rest > 0) ph.rest -= 4;
        else {
          const cand = [['car', Math.abs(f.evKw) / 7], ['bakery', f.bakeryKw / 30], ['home', f.heatKw / 3], ['battery', Math.abs(f.batteryKw) / 5]].filter((x) => x[1] > 0.2).sort((a, b) => b[1] - a[1]);
          if (cand.length) { ph.section = cand[0][0]; ph.beat = 0; }
        }
      }
    }
    if (!ph.section) return;
    const motif = MOTIFS[ph.section];
    // notes whose start falls in this beat
    let at = 0;
    for (const [deg, len] of motif) {
      if (at >= ph.beat && at < ph.beat + 1) {
        const hz = degreeHz(mode, root + deg, 1);
        this.flute(t0 + (at - ph.beat) * sec, hz, len * sec, 0.07, this.positions[ph.section === 'car' ? 'cello' : ph.section === 'battery' ? 'harp' : ph.section === 'bakery' ? 'brass' : 'pad']);
      }
      at += len;
    }
    ph.beat += 1;
  }

  /* ---------------- instruments ---------------- */

  /** A plucked cello: triangle and a little saw through a body resonance, quick decay, into the echo. */
  cello(t, hz, gain, pos) {
    const c = this.ctx;
    const out = this.out(pos);
    const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = hz;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = hz; o2.detune.value = 3;
    const g2 = c.createGain(); g2.gain.value = 0.3;
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 190; body.Q.value = 2; body.gain.value = 6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = c.createGain(); g.gain.value = 0;
    o1.connect(body); o2.connect(g2); g2.connect(body); body.connect(lp); lp.connect(g); g.connect(out); g.connect(this.echoIn);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(gain * 0.3, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0004, t + 0.6);
    o1.start(t); o2.start(t); o1.stop(t + 0.65); o2.stop(t + 0.65);
  }

  /** A harp string: a sine with its second partial, a slow decay, into the echo for sparkle. */
  harp(t, hz, gain, pos) {
    const c = this.ctx;
    const out = this.out(pos);
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = hz;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 2.001;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const g = c.createGain(); g.gain.value = 0;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out); g.connect(this.echoIn);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0004, t + 0.9);
    o1.start(t); o2.start(t); o1.stop(t + 0.95); o2.stop(t + 0.95);
  }

  /** A flute: a sine with a little triangle and breath, a soft attack and release. */
  flute(t, hz, dur, gain, pos) {
    const c = this.ctx;
    const out = this.out(pos);
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = hz;
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = hz; const g2 = c.createGain(); g2.gain.value = 0.18;
    const vib = c.createOscillator(); vib.frequency.value = 5.4; const vg = c.createGain(); vg.gain.value = 5; vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune);
    const g = c.createGain(); g.gain.value = 0;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    const a = Math.min(0.12, dur * 0.3), r = Math.min(0.25, dur * 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.setValueAtTime(gain, t + Math.max(a, dur - r)); g.gain.linearRampToValueAtTime(0, t + dur);
    o1.start(t); o2.start(t); vib.start(t); o1.stop(t + dur + 0.02); o2.stop(t + dur + 0.02); vib.stop(t + dur + 0.02);
  }

  timpani(t, gain, pos = null) {
    const c = this.ctx;
    const dest = this.out(pos);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(88, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.3);
    const g = c.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
    o.start(t); o.stop(t + 1.2);
    const n = c.createBufferSource(); const len = Math.floor(c.sampleRate * 0.1); const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = b; const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 380;
    const ng = c.createGain(); ng.gain.value = 0.22 * gain;
    n.connect(nf); nf.connect(ng); ng.connect(dest); n.start(t);
  }

  /** A small bell: two partials, the second slightly inharmonic, so it rings but stays soft. */
  bell(t, hz, gain, pos = null) {
    const c = this.ctx;
    const dest = this.out(pos);
    for (const [ratio, g0, dec] of [[1, 1, 1.6], [2.76, 0.28, 0.9]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz * ratio;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * g0, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0004, t + dec);
      o.start(t); o.stop(t + dec + 0.05);
    }
  }

  /** A destination at a place in the room, or the plain bus. */
  out(pos) {
    if (!pos) return this.bus;
    const p = makePanner(this.ctx); setPos(p, pos); p.connect(this.bus);
    return p;
  }

  /* ---------------- gestures ---------------- */

  /** A release: the ensemble lands on the chord together. */
  downbeat() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime + 0.02;
    this.timpani(t, 0.45, this.positions.timpani);
    const tones = [0, 4, 7, 11];
    tones.forEach((d, k) => this.bell(t + k * 0.05, degreeHz(this.mode, this.chordRoot + d, 0), 0.09));
    const s = this.sections.strings;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setTargetAtTime(s.level + 0.14, t, 0.08);
    s.gain.gain.setTargetAtTime(s.level, t + 0.7, 0.9);
  }

  /**
   * Conducting gestures.
   *   sweep  { dir: +1 | -1, speed: 0..1 }   the baton across the ring: a glissando the way the hand goes
   *   point  { section }                      a two-note call from that section
   *   open   {}                               a soft rising figure when a decision opens
   */
  gesture(kind, data = {}) {
    if (!this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime + 0.01;
    const P = this.positions;
    if (kind === 'sweep') {
      if (t - this.lastSweep < 0.3) return;
      this.lastSweep = t;
      const n = 5 + Math.round(9 * clamp(data.speed ?? 0.5, 0, 1));
      const tones = chordTones(this.chordRoot).filter((d) => d >= 0 && d <= 21);
      const step = 0.26 / Math.max(1, n) + 0.02;
      for (let k = 0; k < n; k++) {
        const idx = data.dir >= 0 ? Math.min(tones.length - 1, k) : Math.max(0, tones.length - 1 - k);
        this.harp(t + k * step, degreeHz(this.mode, tones[idx], 0), 0.06 + 0.03 * (data.speed ?? 0.5), P.harp);
      }
      return;
    }
    if (kind === 'point') {
      const sec = data.section;
      const voice = sec === 'car' ? 'cello' : sec === 'battery' ? 'harp' : sec === 'bakery' ? 'brass' : sec === 'wind' ? 'strings' : 'pad';
      const hz1 = degreeHz(this.mode, this.chordRoot + 4, voice === 'cello' ? -1 : 0), hz2 = degreeHz(this.mode, this.chordRoot + 7, voice === 'cello' ? -1 : 0);
      if (voice === 'cello') { this.cello(t, hz1, 0.14, P.cello); this.cello(t + 0.22, hz2, 0.12, P.cello); }
      else if (voice === 'harp') { this.harp(t, hz1, 0.08, P.harp); this.harp(t + 0.18, hz2, 0.08, P.harp); }
      else { this.flute(t, hz1, 0.5, 0.07, P[voice] || null); this.flute(t + 0.28, hz2, 0.7, 0.07, P[voice] || null); }
      return;
    }
    if (kind === 'open') {
      [0, 2, 4].forEach((d, k) => this.bell(t + k * 0.09, degreeHz(this.mode, this.chordRoot + d, 1), 0.06));
    }
  }

  /** The ride: brighter, wetter, bigger. 0 … 1. */
  setSwell(a) {
    if (!this.enabled) return;
    a = clamp(a, 0, 1);
    if (Math.abs(a - this.swell) < 0.01) return;
    this.swell = a;
    const t = this.ctx.currentTime;
    this.wet.gain.setTargetAtTime(0.34 + 0.4 * a, t, 0.5);
    if (!this.frozen) this.tone.frequency.setTargetAtTime(4200 + 5000 * a, t, 0.5);
  }

  /** A hold is a fermata: the sustained sections hold under a closed filter, the plucks stop. */
  setFrozen(f) {
    this.frozen = f;
    if (!this.enabled) return;
    this.tone.frequency.setTargetAtTime(f ? 900 : 4200 + 5000 * this.swell, this.ctx.currentTime, 0.6);
  }

  /** Small events: a decision made, a question asked, a conflict raised. All in the mode. */
  ping(kind = 'decision') {
    if (!this.enabled) return;
    const t = this.ctx.currentTime + 0.01;
    if (kind === 'conflict') { this.bell(t, degreeHz(this.mode, this.chordRoot + 5, 0), 0.1); this.bell(t + 0.03, degreeHz(this.mode, this.chordRoot + 1, 1), 0.07); return; }
    if (kind === 'ask') { this.bell(t, degreeHz(this.mode, this.chordRoot + 4, 1), 0.09); this.bell(t + 0.2, degreeHz(this.mode, this.chordRoot + 6, 1), 0.08); return; }
    this.bell(t, degreeHz(this.mode, this.chordRoot + 7, 1), 0.08);
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
/** A concert hall from arithmetic: a few early reflections, then a long decorrelated exponential tail. */
function hallImpulse(c, seconds) {
  const len = Math.floor(c.sampleRate * seconds);
  const ir = c.createBuffer(2, len, c.sampleRate);
  const early = [[0.011, 0.5], [0.019, 0.38], [0.027, 0.33], [0.041, 0.26], [0.058, 0.2], [0.074, 0.15]];
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let s = 1234 + ch * 777;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
    for (let i = 0; i < len; i++) {
      const t = i / c.sampleRate;
      d[i] = rnd() * Math.exp(-t * (3.2 / seconds) * 2.1) * 0.32 * (t < 0.02 ? t / 0.02 : 1);
    }
    for (const [tt, g] of early) { const i = Math.floor(tt * c.sampleRate + ch * 7); if (i < len) d[i] += g * (ch ? -1 : 1) * 0.6; }
  }
  return ir;
}
