/**
 * An optional, generative musical layer — the "orchestra" heard rather than
 * seen. No audio assets: everything is synthesised. Off by default; the
 * story must survive without it in a noisy hall.
 */
const NOTES = { wind: 73.42, substation: 146.83, street: 185.0, battery: 277.18, bakery: 329.63, car: 369.99, home: 440.0, sun: 554.37 };

export class Orchestra {
  constructor() { this.ctx = null; this.enabled = false; this.voices = {}; }

  enable() {
    if (this.enabled) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      if (c.state === 'suspended') c.resume();
      if (!this.master) {
        this.master = c.createGain(); this.master.gain.value = 0;
        this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 1800; this.filter.Q.value = 0.4;
        this.master.connect(this.filter); this.filter.connect(c.destination);
        for (const id in NOTES) {
          const g = c.createGain(); g.gain.value = 0;
          const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = NOTES[id];
          const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = NOTES[id] * 1.003; // slow beating
          const og = c.createGain(); og.gain.value = 0.35;
          o1.connect(g); o2.connect(og); og.connect(g); g.connect(this.master);
          o1.start(); o2.start();
          this.voices[id] = { g, target: 0 };
        }
      }
      this.master.gain.setTargetAtTime(0.16, c.currentTime, 1.5);
      this.enabled = true;
    } catch (e) { this.enabled = false; }
  }

  disable() {
    if (!this.enabled) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    this.enabled = false;
  }

  setActivity(id, a) {
    const v = this.voices[id];
    if (!v || !this.enabled) return;
    const t = 0.02 + 0.10 * Math.max(0, Math.min(1, a));
    if (Math.abs(t - v.target) > 0.005) { v.target = t; v.g.gain.setTargetAtTime(t, this.ctx.currentTime, 0.8); }
  }

  setFrozen(f) {
    if (!this.enabled) return;
    this.filter.frequency.setTargetAtTime(f ? 500 : 1800, this.ctx.currentTime, 0.6);
  }

  ping(kind = 'decision') {
    if (!this.enabled) return;
    const c = this.ctx;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = kind === 'ask' ? 659.25 : kind === 'conflict' ? 311.13 : 987.77;
    g.gain.value = 0;
    o.connect(g); g.connect(this.master);
    const t = c.currentTime;
    g.gain.linearRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.6);
    o.start(t); o.stop(t + 1.7);
  }
}
