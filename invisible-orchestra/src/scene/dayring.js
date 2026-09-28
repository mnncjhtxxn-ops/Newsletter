import * as THREE from 'three';
import { pointsMaterial, makePoints } from './glow.js';
import { SLOTS, SCENARIO } from '../sim/scenario.js';

/**
 * The day as a place you stand inside. A ring of 96 quarter-hour beads
 * surrounds the viewer, one tier per participant, stepping up and outward
 * like an amphitheatre so each arc reads on its own line. Lit beads are the
 * actual scheduled slots; the playhead sweeps around you as the day plays.
 *
 * The ring is the only timeline. Three things tie it to the objects:
 *   - the bead under the playhead flares when that participant is running;
 *   - a thread of light runs from that bead up to the object while energy
 *     arrives there, so "this slot, now" and "this object, now" are one thing;
 *   - when a plan changes, the lit beads fly from their old slots to their
 *     new ones, and the previous plan stays as a ghost tier beneath each arc
 *     for the length of the replay, so before and after sit side by side.
 *
 * 18:00 is behind the viewer, midnight to the left, 06:00 straight ahead,
 * midday to the right — so the night unfolds as you look around.
 */
export const RINGS = [
  { id: 'car', label: 'your car', r: 8.6, y: -2.7, color: '#5fc8ff', hot: '#d5f4ff', max: 7 },
  { id: 'home', label: 'your home', r: 9.4, y: -2.45, color: '#ffb36b', hot: '#ffe6c2', max: 3 },
  { id: 'bakery', label: 'the bakery', r: 10.2, y: -2.2, color: '#ff9a7a', hot: '#ffd2c0', max: 38 },
  { id: 'battery', label: 'the battery', r: 11.0, y: -1.95, color: '#a678ff', hot: '#d9c4ff', max: 5 },
  { id: 'substation', label: 'the cable', r: 11.8, y: -1.7, color: '#b9c8ff', hot: '#ff5d6c', max: 70 },
];
const GHOST_DY = -0.16, GHOST_DR = -0.28;
const THREAD_N = 56;

export function slotAngle(slot) { return Math.PI + (slot / SLOTS) * Math.PI * 2; }
export function ringPoint(ring, slot, out = new THREE.Vector3()) {
  const a = slotAngle(slot);
  return out.set(Math.sin(a) * ring.r, ring.y, -Math.cos(a) * ring.r);
}

export function seriesFor(sim, id) {
  const s = sim.series;
  if (id === 'car') return Array.from(s.ev);
  if (id === 'home') return Array.from(s.heat);
  if (id === 'bakery') return Array.from(s.ovens, (v, i) => v + s.cold[i]);
  if (id === 'battery') return Array.from(s.battery, (v) => Math.abs(v));
  return Array.from(s.feeder, (v) => Math.max(0, v));
}

function beadSizes(def, s, out) {
  for (let i = 0; i < SLOTS; i++) {
    const v = s[i];
    const on = v > 1e-6;
    const level = Math.min(1, v / def.max);
    out[i] = on ? 0.55 + 1.25 * level : 0.22;
    if (def.id === 'substation' && v > SCENARIO.feederLimitKw) out[i] = 2.2;
  }
}

export class DayRing {
  constructor(scene) {
    this.group = new THREE.Group();
    this.rings = [];
    for (const def of RINGS) {
      const pos = new Float32Array(SLOTS * 3);
      const gpos = new Float32Array(SLOTS * 3);
      const v = new THREE.Vector3();
      const ghostDef = { r: def.r + GHOST_DR, y: def.y + GHOST_DY };
      for (let i = 0; i < SLOTS; i++) {
        ringPoint(def, i + 0.5, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        ringPoint(ghostDef, i + 0.5, v); gpos[i * 3] = v.x; gpos[i * 3 + 1] = v.y; gpos[i * 3 + 2] = v.z;
      }
      const mat = pointsMaterial({ color: def.color, colorHot: def.hot, size: 0.8, opacity: 0.85 });
      mat.uniforms.uBreath.value = 0;
      mat.uniforms.uActivity.value = 0.6;
      const pts = makePoints(pos, mat);
      this.group.add(pts);
      // the ghost tier: the previous plan, shown beneath during a replay
      const gmat = pointsMaterial({ color: '#ffffff', colorHot: '#ffffff', size: 0.55, opacity: 0 });
      gmat.uniforms.uBreath.value = 0;
      gmat.uniforms.uActivity.value = 0.2;
      const gpts = makePoints(gpos, gmat);
      this.group.add(gpts);
      // the thread: energy arriving at the object from this slot
      const tmat = pointsMaterial({ color: def.color, colorHot: def.hot, size: 0.7, opacity: 0 });
      tmat.uniforms.uBreath.value = 0;
      tmat.uniforms.uActivity.value = 0.9;
      const tpts = makePoints(new Float32Array(THREAD_N * 3), tmat);
      this.group.add(tpts);
      const tphase = new Float32Array(THREAD_N);
      for (let i = 0; i < THREAD_N; i++) tphase[i] = i / THREAD_N;
      this.rings.push({
        def, pts, mat, size: pts.geometry.getAttribute('aSize'), base: new Float32Array(SLOTS), active: new Uint8Array(SLOTS), flare: -1,
        ghost: gpts, ghostMat: gmat, ghostSize: gpts.geometry.getAttribute('aSize'),
        thread: tpts, threadMat: tmat, threadPos: tpts.geometry.getAttribute('position'), threadPhase: tphase, activity: 0, target: null,
      });
    }
    // playhead: a spoke from near the viewer's feet out to the ring, then a column of light at the current time
    const n = 64;
    this.playMat = pointsMaterial({ color: '#ffffff', colorHot: '#ffffff', size: 0.6, opacity: 0.9 });
    this.playMat.uniforms.uBreath.value = 0.01;
    this.playMat.uniforms.uActivity.value = 0.9;
    this.play = makePoints(new Float32Array(n * 3), this.playMat);
    this.playN = n;
    const ps = this.play.geometry.getAttribute('aSize').array;
    for (let i = 0; i < n; i++) ps[i] = i < 24 ? 0.35 + (i / 24) * 0.5 : 0.7 + Math.random() * 0.7;
    this.play.geometry.getAttribute('aSize').needsUpdate = true;
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
    this._p0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3();
    this.choreo = 0; // 0..1 while a migration is in flight
    this.ghostAlpha = 0;
    this.dim = 1;
  }

  /** Where each participant's thread lands: the object's world position. */
  attach(nodes) {
    for (const r of this.rings) r.target = nodes.get(r.def.id)?.world || null;
  }

  /** Light the beads from a plan. */
  setSim(sim) {
    for (const ring of this.rings) {
      const s = seriesFor(sim, ring.def.id);
      beadSizes(ring.def, s, ring.base);
      for (let i = 0; i < SLOTS; i++) ring.active[i] = s[i] > 1e-6 ? 1 : 0;
      ring.size.array.set(ring.base);
      ring.size.needsUpdate = true;
      ring.flare = -1;
      if (ring.def.id === 'substation') {
        // the cable arc turns hot where it is over its limit
        const over = s.some((v) => v > SCENARIO.feederLimitKw);
        ring.mat.uniforms.uActivity.value = over ? 1 : 0.5;
      }
    }
  }

  /** The previous plan, as a ghost tier beneath each arc (null clears it). */
  setGhost(prevSim) {
    for (const ring of this.rings) {
      const arr = ring.ghostSize.array;
      if (!prevSim) { arr.fill(0.001); }
      else {
        const s = seriesFor(prevSim, ring.def.id);
        for (let i = 0; i < SLOTS; i++) arr[i] = s[i] > 1e-6 ? 0.5 + 0.8 * Math.min(1, s[i] / ring.def.max) : 0.001;
      }
      ring.ghostSize.needsUpdate = true;
    }
    this.hasGhost = !!prevSim;
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
    this.setGhost(prevSim);
    return this.flights.length;
  }

  /** First lit slot of a participant in the current plan, or -1. */
  firstActive(id) {
    const r = this.rings.find((x) => x.def.id === id);
    if (!r) return -1;
    for (let i = 0; i < SLOTS; i++) if (r.active[i]) return i;
    return -1;
  }

  /** World position of a bead on a participant's arc. */
  beadAt(id, slot, out = new THREE.Vector3()) {
    const r = this.rings.find((x) => x.def.id === id);
    return ringPoint(r ? r.def : RINGS[0], slot + 0.5, out);
  }

  /**
   * @param activities  { car, home, bakery, battery, substation } 0..1 — energy arriving now
   * @param ghost       whether the previous plan should be visible
   */
  update(dt, slotF, time, activities = {}, ghost = false) {
    const slot = Math.min(SLOTS - 1, Math.floor(slotF));
    // playhead: spoke + column
    const p = this.play.geometry.getAttribute('position').array;
    const a = slotAngle(slotF);
    for (let i = 0; i < this.playN; i++) {
      if (i < 24) {
        const t = i / 23;
        const r = 3.2 + t * 5.2;
        p[i * 3] = Math.sin(a) * r; p[i * 3 + 1] = -2.75 + t * 0.05; p[i * 3 + 2] = -Math.cos(a) * r;
      } else {
        const t = (i - 24) / (this.playN - 25);
        const r = 8.4 + t * 3.8;
        p[i * 3] = Math.sin(a) * r; p[i * 3 + 1] = -2.7 + t * 1.0 + Math.sin(time * 2 + i) * 0.03; p[i * 3 + 2] = -Math.cos(a) * r;
      }
    }
    this.play.geometry.getAttribute('position').needsUpdate = true;
    // beads flare under the playhead; threads carry the slot up to the object
    this.ghostAlpha += ((ghost && this.hasGhost ? 1 : 0) - this.ghostAlpha) * Math.min(1, dt * 2.5);
    for (const ring of this.rings) {
      const arr = ring.size.array;
      if (ring.flare !== slot) {
        if (ring.flare >= 0) arr[ring.flare] = ring.base[ring.flare];
        ring.flare = slot;
      }
      const act = ring.active[slot] ? 1 : 0;
      arr[slot] = ring.base[slot] * (act ? 2.1 + 0.3 * Math.sin(time * 6) : 1.6);
      ring.size.needsUpdate = true;
      ring.ghostMat.uniforms.uOpacity.value = 0.55 * this.ghostAlpha * this.dim;
      ring.ghostMat.uniforms.uTime.value = time;
      // thread
      const want = Math.min(1, activities[ring.def.id] ?? 0) * (ring.target ? 1 : 0);
      ring.activity += (want - ring.activity) * Math.min(1, dt * 4);
      const tm = ring.threadMat;
      tm.uniforms.uOpacity.value = 0.95 * ring.activity * this.dim;
      tm.uniforms.uTime.value = time;
      if (ring.activity > 0.01 && ring.target) {
        const arr2 = ring.threadPos.array;
        ringPoint(ring.def, slotF, this._p0);
        const p1 = ring.target;
        // control point: lifted above the midpoint so the thread arcs up out of the ring
        const mx = (this._p0.x + p1.x) * 0.5, mz = (this._p0.z + p1.z) * 0.5;
        const my = Math.max(this._p0.y, p1.y) + 1.6 + 0.12 * this._p0.distanceTo(p1);
        for (let i = 0; i < THREAD_N; i++) {
          let t = (ring.threadPhase[i] + time * 0.22) % 1;
          const u = 1 - t, w = t;
          const x = u * u * this._p0.x + 2 * u * w * mx + w * w * p1.x;
          const y = u * u * this._p0.y + 2 * u * w * my + w * w * p1.y;
          const z = u * u * this._p0.z + 2 * u * w * mz + w * w * p1.z;
          // a little spread near the object so it lands as a soft shower, not a line
          const sp = t * t * 0.35;
          arr2[i * 3] = x + Math.sin(i * 7.1 + time) * sp; arr2[i * 3 + 1] = y + Math.cos(i * 3.3 + time * 0.7) * sp; arr2[i * 3 + 2] = z + Math.sin(i * 5.7 - time) * sp;
        }
        ring.threadPos.needsUpdate = true;
      }
    }
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
    return [18, 0, 6, 12].map((h) => { const slot = ((h - 18 + 24) % 24) * 4; return { label: `${String(h).padStart(2, '0')}:00`, pos: ringPoint({ r: 12.7, y: -1.9 }, slot) }; });
  }

  /** The bead under the playhead for each tier, with whether it is lit (for HTML tier labels). */
  playheadBeads(slotF) {
    const slot = Math.min(SLOTS - 1, Math.floor(slotF));
    return this.rings.map((r) => ({ id: r.def.id, label: r.def.label, pos: ringPoint(r.def, slotF, new THREE.Vector3()), on: !!r.active[slot], activity: r.activity }));
  }

  /** Nearest arc to a screen point (CSS px), or null. Used for tap-to-open on the ring itself. */
  nearest(camera, width, height, x, y, maxPx = 84) {
    let best = null;
    const v = this._v;
    for (const r of this.rings) {
      for (let i = 0; i < SLOTS; i++) {
        ringPoint(r.def, i + 0.5, v).project(camera);
        if (v.z >= 1) continue;
        const sx = (v.x * 0.5 + 0.5) * width, sy = (-v.y * 0.5 + 0.5) * height;
        const d = Math.hypot(sx - x, sy - y);
        if (d < maxPx && (!best || d < best.d)) best = { id: r.def.id, d };
      }
    }
    return best ? best.id : null;
  }

  setDim(d) { this.dim = d; for (const r of this.rings) r.mat.uniforms.uOpacity.value = 0.85 * d; this.playMat.uniforms.uOpacity.value = 0.9 * d; }
  materials() { return [...this.rings.map((r) => r.mat), ...this.rings.map((r) => r.ghostMat), ...this.rings.map((r) => r.threadMat), this.playMat, this.moverMat]; }
}
