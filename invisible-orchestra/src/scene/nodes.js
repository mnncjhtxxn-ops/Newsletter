import * as THREE from 'three';
import { pointsMaterial, makePoints } from './glow.js';
import * as shapes from './shapes.js';
import { Hologram, HOLO_NODES } from './holograms.js';

/**
 * The cast of the sculpture. Positions form a loose constellation; colours
 * identify participants, and the material's uniforms are driven each frame
 * by the simulation state (activity, fill level, ripple).
 */
/** Place an object on the ring around the viewer: bearing in degrees (0 = straight ahead), distance, height. */
const ring = (deg, r, y) => { const a = deg * Math.PI / 180; return [Math.sin(a) * r, y, -Math.cos(a) * r]; };
export const NODE_DEFS = [
  { id: 'wind', label: 'The wind', pos: ring(-72, 19, 5.5), color: '#5bd38c', hot: '#b6ffd2', shape: 'turbine', scale: 1.4, dim: 0.6, face: -72 },
  { id: 'sun', label: 'The rooftops', pos: ring(66, 21, 8.5), color: '#ffd166', hot: '#fff3c4', shape: 'sun', scale: 1.3, face: 66 },
  { id: 'grid', label: 'The wider grid', pos: ring(180, 24, 10), color: '#8fa3d9', hot: '#dfe7ff', shape: 'grid', scale: 2.0, dim: 0.3, face: 180 },
  { id: 'substation', label: "The street's cable", pos: ring(6, 19, 3.2), color: '#b9c8ff', hot: '#ffffff', shape: 'substation', scale: 0.95, dim: 0.3, size: 0.65, face: 6 },
  { id: 'score', label: 'The orchestra', pos: [0, -3.4, -1.2], color: '#9fe9ff', hot: '#ffffff', shape: 'score', scale: 0.9, info: true, dim: 0.35 },
  { id: 'battery', label: 'The home battery', pos: ring(-14, 11.5, -2.6), color: '#a678ff', hot: '#d9c4ff', shape: 'battery', scale: 0.8, dim: 0.22, size: 0.5, face: -14 },
  { id: 'car', label: 'Your car', pos: ring(-40, 12.5, -2.5), color: '#5fc8ff', hot: '#d5f4ff', shape: 'car', scale: 1.35, dim: 0.5, size: 0.42, face: -40 },
  { id: 'home', label: 'Your home', pos: ring(42, 12.5, -2.3), color: '#ffb36b', hot: '#ffe6c2', shape: 'house', scale: 1.5, dim: 0.45, size: 0.42, face: 42 },
  { id: 'bakery', label: 'The bakery', pos: ring(-118, 13.5, -0.8), color: '#ff9a7a', hot: '#ffd2c0', shape: 'bakery', scale: 1.15, dim: 0.45, size: 0.42, face: -118 },
  { id: 'street', label: 'The other homes', pos: ring(124, 15, -0.2), color: '#b7a6f2', hot: '#e6dcff', shape: 'street', scale: 1.1, dim: 0.32, face: 124 },
];

export class Nodes {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.byId = {};
    this.materials = [];
    for (const def of NODE_DEFS) {
      const g = new THREE.Group();
      g.position.set(...def.pos);
      g.scale.setScalar(def.scale);
      if (def.face != null) g.rotation.y = -def.face * Math.PI / 180; // long axis tangential to the ring, front toward the viewer
      const mat = pointsMaterial({ color: def.color, colorHot: def.hot, size: def.size || (def.info ? 0.55 : 0.85), opacity: def.dim || 0.9 });
      const shape = shapes[def.shape]();
      const pts = makePoints(shape.positions, mat, shape.fills);
      g.add(pts);
      const node = { def, group: g, points: pts, mat, extras: {}, activity: 0.3, fill: 1, world: new THREE.Vector3(...def.pos) };
      this.materials.push(mat);
      if (def.id === 'wind') {
        const bm = pointsMaterial({ color: def.color, colorHot: def.hot, size: 0.85, opacity: 0.9 });
        const blades = makePoints(shapes.turbineBlades().positions, bm);
        blades.position.set(0, 1.45, 0.55);
        g.add(blades);
        node.extras.blades = blades;
        this.materials.push(bm);
      }
      if (def.id === 'bakery') {
        const sm = pointsMaterial({ color: '#ffffff', colorHot: '#ffe9d6', size: 1.3, opacity: 0.5 });
        sm.uniforms.uBreath.value = 0.12;
        const st = makePoints(shapes.steam().positions, sm);
        g.add(st);
        node.extras.steam = st;
        node.extras.steamMat = sm;
        this.materials.push(sm);
      }
      if (def.id === 'substation') {
        const rm = pointsMaterial({ color: '#8fd0ff', colorHot: '#ff5d6c', size: 0.7, opacity: 0.85 });
        const ringShape = shapes.capacityRing();
        const ringPts = makePoints(ringShape.positions, rm, ringShape.fills);
        ringPts.position.set(0, -2.2, 0);
        g.add(ringPts);
        node.extras.ring = ringPts;
        node.extras.ringMat = rm;
        this.materials.push(rm);
      }
      this.group.add(g);
      this.byId[def.id] = node;
    }
    this._tmp = new THREE.Vector3();
  }

  get(id) {
    return this.byId[id];
  }

  /** Lazily build a node's hard-light projection. */
  hologram(id) {
    const n = this.byId[id];
    if (!n || !HOLO_NODES.has(id)) return null;
    if (!n.holo) n.holo = new Hologram(n);
    return n.holo;
  }

  /** Per-frame: time, touch and reveal uniforms, plus state from the sim frame. */
  update({ time, pixelRatio, touch, touchR, touchStrength, revealId, spread, dim, frame, condense = 0 }) {
    for (const m of this.materials) {
      m.uniforms.uTime.value = time;
      m.uniforms.uPixelRatio.value = pixelRatio;
      m.uniforms.uTouch.value.copy(touch);
      m.uniforms.uTouchR.value = touchR;
      m.uniforms.uTouchStrength.value = touchStrength;
    }
    for (const id in this.byId) {
      const n = this.byId[id];
      const isRevealed = revealId === id;
      let target = revealId && !isRevealed ? 0.35 * dim : 1;
      if (id === 'car' && frame?.carAway) target *= 0.12;
      // condensing: the particles pull in and dim as the projection takes over
      const c = isRevealed ? condense : (n.holo ? n.holo.c : 0);
      if (c > 0) target *= 1 - 0.65 * c;
      n.mat.uniforms.uBreath.value = 0.02 * (1 - 0.8 * c);
      if (n.holo) n.holo.update(isRevealed ? condense : Math.max(0, n.holo.c - (frame?.dt ?? 0.016) * 2.5), time, n.extras.blades ? n.extras.blades.rotation.z : null);
      if (id === 'sun' && frame) target *= 0.18 + 0.82 * Math.min(1, frame.solarFrac * 1.5);
      n.mat.uniforms.uOpacity.value += ((n.def.dim || 0.9) * target - n.mat.uniforms.uOpacity.value) * 0.08;
      n.mat.uniforms.uSpread.value = isRevealed ? spread * (1 - condense) - 0.12 * condense : 0;
      if (n.extras.blades) n.extras.blades.material.uniforms.uOpacity.value = n.mat.uniforms.uOpacity.value;
      if (n.extras.ringMat) n.extras.ringMat.uniforms.uOpacity.value = n.mat.uniforms.uOpacity.value * 0.95;
    }
    if (!frame) return;
    const f = frame;
    const setAct = (id, a) => { const n = this.byId[id]; n.mat.uniforms.uActivity.value += (a - n.mat.uniforms.uActivity.value) * 0.1; };
    const setFill = (id, v) => { this.byId[id].mat.uniforms.uFillLevel.value += (v - this.byId[id].mat.uniforms.uFillLevel.value) * 0.1; };

    setAct('wind', 0.15 + 0.85 * f.windFrac);
    this.byId.wind.extras.blades.rotation.z -= (0.2 + f.windFrac * 1.6) * f.dt;
    setAct('sun', Math.min(1, f.solarFrac * 1.2));
    setAct('grid', 0.2 + 0.8 * f.importFrac);
    setAct('car', f.evKw > 0 ? 1 : 0.25);
    setFill('car', f.evSoc / 100);
    setAct('home', f.heatKw > 0 ? 1 : 0.3);
    setFill('home', f.tempFrac);
    setAct('bakery', f.bakeryKw > 8 ? 1 : f.bakeryKw > 0 ? 0.6 : 0.2);
    setFill('bakery', Math.min(1, f.bakeryKw / 30));
    this.byId.bakery.extras.steamMat.uniforms.uOpacity.value += ((f.bakeryKw >= 20 ? 0.5 : 0) - this.byId.bakery.extras.steamMat.uniforms.uOpacity.value) * 0.05;
    setAct('battery', Math.abs(f.batteryKw) > 0 ? 1 : 0.3);
    setFill('battery', f.batterySoc);
    setAct('substation', 0.3 + 0.7 * f.cableFrac);
    const rm = this.byId.substation.extras.ringMat;
    rm.uniforms.uFillLevel.value += (Math.min(1, f.cableFrac) - rm.uniforms.uFillLevel.value) * 0.1;
    rm.uniforms.uActivity.value += ((f.cableFrac > 1 ? 1 : Math.max(0, (f.cableFrac - 0.8) / 0.2)) - rm.uniforms.uActivity.value) * 0.1;
    setAct('street', 0.25 + 0.75 * f.streetFrac);
    setAct('score', f.frozen ? 0.9 : 0.15 + 0.25 * f.infoActivity);
  }

  /** Screen-space positions (in CSS pixels) for labels and hit-testing. */
  project(camera, width, height) {
    const out = {};
    for (const id in this.byId) {
      const n = this.byId[id];
      this._tmp.copy(n.world).project(camera);
      out[id] = { x: (this._tmp.x * 0.5 + 0.5) * width, y: (-this._tmp.y * 0.5 + 0.5) * height, z: this._tmp.z, visible: this._tmp.z < 1 };
    }
    return out;
  }

  dispose() {
    for (const id in this.byId) {
      const n = this.byId[id];
      n.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      n.holo?.dispose();
    }
    for (const m of this.materials) { m.userData.halo?.dispose(); m.dispose(); }
  }
}
