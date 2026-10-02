#!/usr/bin/env node
/**
 * Render audio samples of the generative score, offline, so the music can be
 * judged without a kiosk or a headset. Each clip plays the real simulation at
 * a chosen hour through the real Orchestra class into an OfflineAudioContext,
 * then writes a 16-bit stereo WAV.
 *
 *   node tools/render-samples.cjs [outDir]
 *
 * Needs the built file and a Chromium that Playwright can launch.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');

const out = process.argv[2] || path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });
const page = 'file://' + path.resolve(__dirname, '..', 'dist', 'invisible-orchestra.html');

const CLIPS = [
  { name: '01-02h-car-charges-on-wind', seconds: 16, slots: [32, 44], sim: {}, note: '02:00. Lydian: the wind is strong and cheap. Strings and bass, cello pizzicato while the car charges, the car motif on the flute.' },
  { name: '02-18h-evening-peak-cable-strained', seconds: 16, slots: [1, 13], sim: { permissions: { ev: 'never', battery: 'never' }, streetPool: false }, note: '18:15. Aeolian: the dear evening. The cable near its limit brings the timpani; the uncoordinated car charges at dinner time.' },
  { name: '03-06h-the-bakery-opens', seconds: 16, slots: [46, 58], sim: {}, note: '06:00. Dorian into Ionian as the price climbs. Brass while the ovens are hot, the bakery fanfare on the flute, the harp as the battery releases.' },
  { name: '04-release-downbeat-and-ride', seconds: 16, slots: [30, 42], sim: {}, note: 'A release: the cadence, then the swell of the ride with rising arpeggios, then it settles.', events: 'ride' },
  { name: '05-the-baton', seconds: 14, slots: [30, 41], sim: {}, note: 'The baton across the ring: glissandi the way the hand goes, faster hand, more notes.', events: 'baton' },
  { name: '06-hold-then-decisions', seconds: 16, slots: [36, 48], sim: {}, note: 'A hold (fermata: the ensemble holds under a closed filter), then a decision, a question, a conflict, a pointed call, and an opening figure.', events: 'decisions' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const pg = await ctx.newPage();
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto(page);
  await pg.waitForTimeout(1500);
  for (const clip of CLIPS) {
    const b64 = await pg.evaluate(async (clip) => {
      const o = window.__orchestra;
      const sim = o.simulate(clip.sim);
      const A = o.audio.constructor;
      const a = new A();
      const rate = 44100;
      a.ctx = new OfflineAudioContext(2, rate * clip.seconds, rate);
      const W = (id) => o.nodes.get(id).world.toArray();
      a.setPositions({ strings: W('wind'), bass: W('substation'), pad: W('home'), brass: W('bakery'), cello: W('car'), harp: W('battery'), timpani: W('substation') });
      a.enable();
      a.setListener({ x: 0, y: 0.4, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
      const beatSec = 110 / 96; // the kiosk's default day length
      const sched = [];
      const [s0, s1] = clip.slots;
      for (let k = 0; s0 + k < s1; k++) {
        const slot = s0 + k;
        sched.push({ t: 0.4 + k * beatSec, fn: () => { const f = o.frameAt(sim, slot + 0.5, 0.016); a.setFrame(f); a.beat(slot, f, beatSec); } });
      }
      if (clip.events === 'ride') {
        sched.push({ t: 1.0, fn: () => a.downbeat() });
        for (let i = 0; i <= 12; i++) sched.push({ t: 1.6 + i * 0.5, fn: () => a.setSwell(Math.min(1, i / 8)) });
        for (let i = 0; i <= 6; i++) sched.push({ t: 9.2 + i * 0.5, fn: () => a.setSwell(Math.max(0, 1 - i / 5)) });
      }
      if (clip.events === 'baton') {
        const sweeps = [[1.0, 1, 0.3], [2.4, 1, 0.7], [3.9, -1, 0.9], [5.3, -1, 0.4], [6.9, 1, 1], [8.6, -1, 0.6], [10.3, 1, 0.5]];
        for (const [t, dir, speed] of sweeps) sched.push({ t, fn: () => a.gesture('sweep', { dir, speed }) });
      }
      if (clip.events === 'decisions') {
        sched.push({ t: 4.0, fn: () => a.setFrozen(true) });
        sched.push({ t: 8.0, fn: () => a.setFrozen(false) });
        sched.push({ t: 9.0, fn: () => a.ping('decision') });
        sched.push({ t: 10.6, fn: () => a.ping('ask') });
        sched.push({ t: 12.2, fn: () => a.ping('conflict') });
        sched.push({ t: 13.6, fn: () => a.gesture('point', { section: 'car' }) });
        sched.push({ t: 14.8, fn: () => a.gesture('open') });
      }
      sched.sort((p, q) => p.t - q.t);
      // distinct, increasing suspend times (quantised to the render quantum)
      let last = -1;
      for (const e of sched) {
        let t = Math.round(e.t * rate / 128) * 128 / rate;
        if (t <= last) t = last + 128 / rate;
        last = t;
        a.ctx.suspend(t).then(() => { try { e.fn(); } catch (err) { console.error('event failed', err.message); } a.ctx.resume(); }).catch(() => {});
      }
      const buf = await a.ctx.startRendering();
      // 16-bit stereo WAV
      const n = buf.length, ch = 2;
      const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
      const str = (o2, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o2 + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
      data.setUint32(24, rate, true); data.setUint32(28, rate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, n * ch * 2, true);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      let peak = 0;
      for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      const norm = peak > 0.95 ? 0.95 / peak : 1;
      let o2 = 44;
      for (let i = 0; i < n; i++) { data.setInt16(o2, Math.max(-1, Math.min(1, L[i] * norm)) * 32767, true); o2 += 2; data.setInt16(o2, Math.max(-1, Math.min(1, R[i] * norm)) * 32767, true); o2 += 2; }
      const bytes = new Uint8Array(data.buffer);
      let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { b64: btoa(s), peak, mode: a.mode };
    }, clip);
    const file = path.join(out, `${clip.name}.wav`);
    fs.writeFileSync(file, Buffer.from(b64.b64, 'base64'));
    console.log(`${clip.name}.wav  peak ${b64.peak.toFixed(2)}  last mode ${b64.mode}  — ${clip.note}`);
  }
  console.log('errors', errors.length ? errors : 'none');
  await browser.close();
})();
