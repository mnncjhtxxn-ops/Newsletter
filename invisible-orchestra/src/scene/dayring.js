import * as THREE from 'three';
import { pointsMaterial, makePoints } from './glow.js';
import { SLOTS, slotHour, SCENARIO } from '../sim/scenario.js';

/**
 * The day as a place you stand inside. A ring of 96 quarter-hour beads
 * surrounds the viewer at horizon level, one concentric arc per
 * participant. Lit beads are the actual scheduled slots; the playhead sweeps
 * around you as the day plays. When a plan changes, the lit beads fly from
 * their old slots to their new ones: every mover is a real quarter-hour
 * moving to a real new time.
 *
 * 18:00 is behind the viewer, midnight to the left, 06:00 straight ahead,
 * midday to the right — so the night unfolds as you look around.
 */
export const RINGS = [
  { id: 'car', label: 'your car', r: 8.6, y: -2.6, color: '#5fc8ff', hot: '#d5f4ff', max: 7 },
  { id: 'home', label: 'your home', r: 9.1, y: -2.75, color: '#ffb36b', hot: '#ffe6c2', max: 3 },
  { id: 'bakery', label: 'the bakery', r: 9.6, y: -2.9, color: '#ff9a7a', hot: '#ffd2c0', max: 38 },
  { id: 'battery', label: 'battery', r: 10.1, y: -3.05, color: '#a678ff', hot: '#d9c4ff', max: 5 },
  { id: 'substation', label: 'the cable', r: 10.6, y: -3.2, color: '#b9c8ff', hot: '#ff5d6c', max: 70 },
];

export function slotAngle(slot) { return Math.PI + (slot / SLOTS) * Math.PI * 2; }
export function ringPoint(ring, slot, out = new THREE.Vector3()) {
  const a = slotAngle(slot);
  return out.set(Math.sin(a) * ring.r, ring.y, -Math.cos(a) * ring.r);
}

function seriesFor(sim, id) {
  const s = sim.series;
  if (id === 'car') return Array.from(s.ev);
  if (id === 'home') return Array.from(s.heat);
  if (id === 'bakery') return Array.from(s.ovens, (v, i) => v + s.cold[i]);
  if (id === 'battery') return Array.from(s.battery, (v) => Math.abs(v));
  return Array.from(s.feeder, (v) => Math.max(0, v));
}

export class DayRing {
  constructor(scene) {
    this.group = new THREE.Group();
    this.rings = [];
    for (const def of RINGS) {
      const pos = new Float32Array(SLOTS * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < SLOTS; i++) { ringPoint(def, i + 0.5, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
      const mat = pointsMaterial({ color: def.color, colorHot: def.hot, size: 0.75, opacity: 0.85 });
      mat.uniforms.uBreath.value = 0;
      mat.uniforms.uActivity.value = 0.6;
      const pts = makePoints(pos, mat);
      this.group.add(pts);
      this.rings.push({ def, pts, mat, size: pts.geometry.getAttribute('aSize'), active: new Uint8Array(SLOTS) });
    }
    // playhead: a column of light at the current time
    const n = 36;
    const ppos = new Float32Array(n * 3);
    this.playMat = pointsMaterial({ color: '#ffffff', colorHot: '#ffffff', size: 0.6, opacity: 0.9 });
    this.playMat.uniforms.uBreath.value = 0.01;
    this.playMat.uniforms.uActivity.value = 0.9;
    this.play = makePoints(ppos, this.playMat);
    this.playN = n;
    this.group.add(this.play);
    // movers: lit slots in flight between old and new times
    const M = 480;
    this.moverMat = pointsMaterial({ color: '#ffffff', colorHot: '#ffffff', size: 0.95, opacity: 1 });
    this.moverMat.uniforms.uBreath.value = 0;
    this.moverMat.uniforms.uActivity.value = 1;
    this.movers = makePoints(new Float32Array(M * 3), this.moverMat);
    this.moverMax = M;
    this.flights = [];
    this.group.add(this.movers);
    scene.add(this.group);
    this._v = new THREE.Vector3();
    this.choreo = 0; // 0..1 while a migration is in flight
  }

  /** Light the beads from a plan. */
  setSim(sim) {
    for (const ring of this.rings) {
      const s = seriesFor(sim, ring.def.id);
      const arr = ring.size.array;
      for (let i = 0; i < SLOTS; i++) {
        const v = s[i];
        const on = v > 1e-6;
        ring.active[i] = on ? 1 : 0;
        const level = Math.min(1, v / ring.def.max);
        arr[i] = on ? 0.55 + 1.25 * level : 0.22;
        if (ring.def.id === 'substation' && v > SCENARIO.feederLimitKw) arr[i] = 2.2;
      }
      ring.size.needsUpdate = true;
      if (ring.def.id === 'substation') {
        // the cable arc turns hot where it is over its limit
        const over = s.some((v) => v > SCENARIO.feederLimitKw);
        ring.mat.uniforms.uActivity.value = over ? 1 : 0.5;
      }
    }
  }

  /** Slots that changed between two plans fly to their new times. */
  migrate(prevSim, sim) {
    this.flights = [];
    for (const ring of this.rings) {
      const a = seriesFor(prevSim, ring.def.id), b = seriesFor(sim, ring.def.id);
      const removed = [], added = [];
      for (let i = 0; i < SLOTS; i++) {
        const wasOn = a[i] > 1e-6, isOn = b[i] > 1e-6;
        if (wasOn && !isOn) removed.push(i);
        if (!wasOn && isOn) added.push(i);
      }
      const n = Math.max(removed.length, added.length);
      for (let k = 0; k < n && this.flights.length < this.moverMax; k++) {
        const from = removed.length ? removed[k % removed.length] : added[k];
        const to = added.length ? added[k % added.length] : removed[k];
        let da = slotAngle(to) - slotAngle(from);
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        this.flights.push({ ring: ring.def, a0: slotAngle(from), da, t: -Math.random() * 0.5, dur: 1.4 + Math.random() * 0.8, lift: 1 + Math.random() * 2.5, dim: !added.length });
      }
    }
    this.choreo = this.flights.length ? 1 : 0;
    return this.flights.length;
  }

  update(dt, slotF, time) {
    // playhead column
    const p = this.play.geometry.getAttribute('position').array;
    const a = slotAngle(slotF);
    for (let i = 0; i < this.playN; i++) {
      const t = i / (this.playN - 1);
      const r = 8.4 + t * 2.6;
      p[i * 3] = Math.sin(a) * r; p[i * 3 + 1] = -2.55 - t * 0.7 + Math.sin(time * 2 + i) * 0.03; p[i * 3 + 2] = -Math.cos(a) * r;
    }
    this.play.geometry.getAttribute('position').needsUpdate = true;
    // movers
    const m = this.movers.geometry.getAttribute('position').array;
    let alive = 0;
    for (let k = 0; k < this.moverMax; k++) {
      const f = this.flights[k];
      if (!f || f.t > f.dur) { m[k * 3] = 0; m[k * 3 + 1] = -9999; m[k * 3 + 2] = 0; continue; }
      f.t += dt;
      alive++;
      const u = Math.max(0, Math.min(1, f.t / f.dur));
      const e = u * u * (3 - 2 * u);
      const ang = f.a0 + f.da * e;
      const lift = Math.sin(u * Math.PI) * f.lift;
      m[k * 3] = Math.sin(ang) * f.ring.r; m[k * 3 + 1] = f.ring.y + lift; m[k * 3 + 2] = -Math.cos(ang) * f.ring.r;
    }
    this.movers.geometry.getAttribute('position').needsUpdate = true;
    this.choreo = alive ? 1 : 0;
    if (!alive && this.flights.length) this.flights = [];
    this.playMat.uniforms.uTime.value = time;
    this.moverMat.uniforms.uTime.value = time;
    for (const r of this.rings) r.mat.uniforms.uTime.value = time;
  }

  /** World positions for the hour marks, for HTML labels. */
  hourMarks() {
    return [18, 0, 6, 12].map((h) => { const slot = ((h - 18 + 24) % 24) * 4; return { label: `${String(h).padStart(2, '0')}:00`, pos: ringPoint({ r: 11.4, y: -3.35 }, slot) }; });
  }

  setDim(d) { for (const r of this.rings) r.mat.uniforms.uOpacity.value = 0.85 * d; this.playMat.uniforms.uOpacity.value = 0.9 * d; }
  materials() { return [...this.rings.map((r) => r.mat), this.playMat, this.moverMat]; }
}
