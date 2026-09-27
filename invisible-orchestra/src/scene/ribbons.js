import * as THREE from 'three';
import { pointsMaterial, addHalo } from './glow.js';

/**
 * Ribbons are particle streams along a curve. Energy ribbons carry a
 * continuous flow whose density and speed follow the simulated power on
 * that link. Information ribbons carry discrete packets — pulses that
 * travel only when a decision is made, plus a faint dotted trace so the
 * visitor can see the nervous system when the scene is frozen.
 */

const LUT = 96;

export class Ribbon {
  constructor({ from, to, color, colorHot, kind = 'energy', count = 320, bulge = 2.0, width = 0.6, maxKw = 40, seed = 0 }) {
    this.kind = kind;
    this.maxKw = maxKw;
    this.flow = 0; // kW (signed: negative flows backwards)
    this.visual = 0; // smoothed 0..1
    this.count = count;
    this.width = width;
    this.from = from.clone();
    this.to = to.clone();
    this.pulses = [];
    this.traceAlpha = 0;
    this.setCurve(bulge, seed);

    const positions = new Float32Array(count * 3);
    this.t = new Float32Array(count);
    this.off = new Float32Array(count * 2);
    this.speed = new Float32Array(count);
    this.alpha = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.t[i] = Math.random();
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      this.off[i * 2] = Math.cos(ang) * r;
      this.off[i * 2 + 1] = Math.sin(ang) * r;
      this.speed[i] = 0.7 + Math.random() * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    const fill = new Float32Array(count);
    for (let i = 0; i < count; i++) { phase[i] = Math.random(); size[i] = kind === 'info' ? 0.5 + Math.random() * 0.3 : 0.5 + Math.random() * 0.9; }
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aFill', new THREE.BufferAttribute(fill, 1));
    this.sizeAttr = geo.getAttribute('aSize');
    this.baseSize = Float32Array.from(size);
    this.mat = pointsMaterial({ color, colorHot: colorHot || color, size: kind === 'info' ? 0.55 : 0.8, opacity: 1 });
    this.mat.uniforms.uBreath.value = 0;
    this.mat.uniforms.uActivity.value = kind === 'info' ? 0.5 : 0.6;
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    addHalo(this.points);
    this.posAttr = geo.getAttribute('position');
  }

  setCurve(bulge, seed) {
    const mid = this.from.clone().lerp(this.to, 0.5);
    const dir = this.to.clone().sub(this.from).normalize();
    const side = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
    const s1 = Math.sin(seed * 12.9898) * 0.6;
    const s2 = Math.cos(seed * 78.233) * 0.6;
    const p1 = this.from.clone().lerp(this.to, 0.3).add(side.clone().multiplyScalar(bulge * (1 + s1))).add(new THREE.Vector3(0, bulge * 0.35, bulge * 0.4 * s2));
    const p2 = this.from.clone().lerp(this.to, 0.7).add(side.clone().multiplyScalar(bulge * (0.6 + s2))).add(new THREE.Vector3(0, -bulge * 0.2, bulge * 0.3 * s1));
    const curve = new THREE.CatmullRomCurve3([this.from, p1, mid.add(side.clone().multiplyScalar(bulge * 0.9)), p2, this.to], false, 'centripetal', 0.6);
    this.curve = curve;
    const frames = curve.computeFrenetFrames(LUT, false);
    this.lutP = curve.getSpacedPoints(LUT);
    this.lutN = frames.normals;
    this.lutB = frames.binormals;
  }

  sample(t, out, u, v, w) {
    const x = t * LUT;
    const i = Math.min(LUT - 1, Math.floor(x));
    const f = x - i;
    const p0 = this.lutP[i], p1 = this.lutP[i + 1];
    const n0 = this.lutN[i], b0 = this.lutB[i];
    // width tapers at the ends so the ribbon appears to emerge from the object
    const taper = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * 0.7 + 0.3;
    out.x = p0.x + (p1.x - p0.x) * f + (n0.x * u + b0.x * v) * w * taper;
    out.y = p0.y + (p1.y - p0.y) * f + (n0.y * u + b0.y * v) * w * taper;
    out.z = p0.z + (p1.z - p0.z) * f + (n0.z * u + b0.z * v) * w * taper;
  }

  /** Fire a packet along the ribbon (information only). dir = +1 from→to, -1 to→from */
  pulse(dir = 1) {
    this.pulses.push({ t: dir > 0 ? -0.08 : 1.08, dir });
    if (this.pulses.length > 6) this.pulses.shift();
  }

  update(dt, timeScale, opts = {}) {
    const arr = this.posAttr.array;
    const p = new THREE.Vector3();
    if (this.kind === 'energy') {
      const target = Math.min(1, Math.abs(this.flow) / this.maxKw);
      this.visual += (target - this.visual) * 0.08;
      const dir = this.flow >= 0 ? 1 : -1;
      const activeCount = Math.round(this.count * (0.05 + 0.95 * Math.pow(this.visual, 0.7)));
      const spd = (0.05 + 0.32 * this.visual) * timeScale + 0.004;
      const w = this.width * (0.35 + 0.65 * this.visual);
      for (let i = 0; i < this.count; i++) {
        let t = this.t[i] + dir * dt * spd * this.speed[i];
        if (t > 1) t -= 1; if (t < 0) t += 1;
        this.t[i] = t;
        if (i < activeCount) {
          this.sample(t, p, this.off[i * 2], this.off[i * 2 + 1], w);
        } else {
          p.set(0, -9999, 0);
        }
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      this.mat.uniforms.uOpacity.value += ((0.25 + 0.75 * this.visual) * (opts.dim ?? 1) - this.mat.uniforms.uOpacity.value) * 0.08;
    } else {
      // Information: a faint dotted trace (visible when frozen or revealed) + packets.
      const traceTarget = opts.trace ?? 0;
      this.traceAlpha += (traceTarget - this.traceAlpha) * 0.08;
      const traceN = Math.floor(this.count * 0.45);
      const packetN = this.count - traceN;
      for (let i = 0; i < traceN; i++) {
        const t = i / traceN;
        // dotted: hide every other run
        const dotted = Math.floor(t * 40) % 2 === 0;
        if (dotted && this.traceAlpha > 0.02) this.sample(t, p, 0, 0, 0); else p.set(0, -9999, 0);
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      // advance pulses
      for (const pl of this.pulses) pl.t += pl.dir * dt * (0.55 * Math.max(timeScale, 0.25) + 0.15);
      this.pulses = this.pulses.filter((pl) => pl.t > -0.1 && pl.t < 1.1);
      let k = traceN;
      const perPulse = 10;
      for (const pl of this.pulses) {
        for (let j = 0; j < perPulse && k < this.count; j++, k++) {
          const t = pl.t - pl.dir * j * 0.012;
          if (t < 0 || t > 1) { arr[k * 3] = 0; arr[k * 3 + 1] = -9999; arr[k * 3 + 2] = 0; continue; }
          this.sample(t, p, 0, 0, 0);
          arr[k * 3] = p.x; arr[k * 3 + 1] = p.y; arr[k * 3 + 2] = p.z;
        }
      }
      for (; k < this.count; k++) { arr[k * 3] = 0; arr[k * 3 + 1] = -9999; arr[k * 3 + 2] = 0; }
      const hasPulse = this.pulses.length > 0;
      this.mat.uniforms.uOpacity.value += ((hasPulse ? 1 : 0.55) * Math.max(this.traceAlpha, hasPulse ? 1 : 0) * (opts.dim ?? 1) - this.mat.uniforms.uOpacity.value) * 0.15;
    }
    this.posAttr.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.userData.halo?.dispose();
    this.mat.dispose();
  }
}

/** The energy and information links of the sculpture. */
export function buildRibbons(nodes) {
  const P = (id) => nodes.get(id).world;
  const energy = {
    windIn: new Ribbon({ from: P('wind'), to: P('substation'), color: '#5bd38c', colorHot: '#bfffd8', bulge: 2.4, maxKw: 55, count: 700, seed: 1 }),
    gridIn: new Ribbon({ from: P('grid'), to: P('substation'), color: '#8fa3d9', colorHot: '#dfe7ff', bulge: 1.2, maxKw: 40, count: 480, seed: 2 }),
    sunIn: new Ribbon({ from: P('sun'), to: P('substation'), color: '#ffd166', colorHot: '#fff3c4', bulge: 2.0, maxKw: 40, count: 480, seed: 3 }),
    toCar: new Ribbon({ from: P('substation'), to: P('car'), color: '#7cd8ff', colorHot: '#ffffff', bulge: 2.2, maxKw: 7, count: 420, seed: 4 }),
    toHome: new Ribbon({ from: P('substation'), to: P('home'), color: '#ffb36b', colorHot: '#fff0d6', bulge: 2.2, maxKw: 4, count: 400, seed: 5 }),
    toBakery: new Ribbon({ from: P('substation'), to: P('bakery'), color: '#ff9a7a', colorHot: '#ffe4d6', bulge: 1.6, maxKw: 38, count: 520, seed: 6 }),
    toStreet: new Ribbon({ from: P('substation'), to: P('street'), color: '#c9b8ff', colorHot: '#f1ecff', bulge: 1.6, maxKw: 46, count: 520, seed: 7 }),
    battery: new Ribbon({ from: P('substation'), to: P('battery'), color: '#b88cff', colorHot: '#efe2ff', bulge: 1.8, maxKw: 5, count: 380, seed: 8 }),
  };
  const info = {};
  for (const id of ['car', 'home', 'bakery', 'battery', 'wind', 'substation', 'sun']) {
    info[id] = new Ribbon({ from: P(id), to: P('score'), color: '#bff5ff', colorHot: '#ffffff', kind: 'info', bulge: 0.8, count: 160, seed: 20 + id.length });
  }
  return { energy, info };
}
