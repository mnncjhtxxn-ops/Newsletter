import * as THREE from 'three';
import { pointsMaterial, makePoints } from './glow.js';
import { assetGeometry } from '../assets/loader.js';

/**
 * Hard-light projections. When a hero object is pulled forward, its
 * particles coalesce into a solid holographic form: translucent surfaces
 * of light with bright fresnel edges, a faint scanline shimmer and tiny
 * dust motes drifting through the projection's field. Still unmistakably
 * made of light — just more substantial than the overview.
 *
 * The car is a supplied model; everything else is procedural geometry.
 */

const HOLO_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
uniform float uBuild;
uniform float uTime;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vL = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const HOLO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColorHot;
uniform float uOpacity;
uniform float uTime;
uniform float uBuild;
uniform float uBuildY0;
uniform float uBuildY1;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float f = pow(1.0 - abs(dot(normalize(vN), V)), 1.7);
  // the projection assembles from the ground up as it condenses
  float rise = smoothstep(uBuild, uBuild - 0.25, (vL.y - uBuildY0) / (uBuildY1 - uBuildY0));
  float seam = smoothstep(0.0, 0.05, abs(((vL.y - uBuildY0) / (uBuildY1 - uBuildY0)) - uBuild)) ;
  float scan = 0.94 + 0.06 * sin(vW.y * 30.0 - uTime * 1.2);
  float flicker = 1.0;
  vec3 col = mix(uColor, uColorHot, f);
  float a = (0.2 + 0.9 * f) * scan * flicker * uOpacity * rise;
  a += (1.0 - seam) * 0.9 * uOpacity * step(0.001, uBuild) * step(uBuild, 0.999);
  // premultiplied: the material blends with MAX, so overlapping faces never stack up to white
  a = clamp(a, 0.0, 1.0);
  gl_FragColor = vec4(col * (0.75 + f * 1.2) * a, a);
}
`;

function holoMaterial(color, hot) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uColorHot: { value: new THREE.Color(hot) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uBuild: { value: 0 },
      uBuildY0: { value: -1 },
      uBuildY1: { value: 1 },
    },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // hard light does not stack: where faces overlap, the brightest wins rather than summing to white
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
}

/* ---------------- geometry: the hero objects as solids ---------------- */

function prism(w, h, d) {
  // triangular roof prism along Z
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(0, h); shape.lineTo(w / 2, 0); shape.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/* Dense models with many overlapping faces accumulate more additive light
   per pixel, so each asset carries an intensity that keeps the projection
   translucent rather than blown out. */
function fromAsset(name, intensity = 1, dustPad = 0.3) {
  const g = assetGeometry(name);
  const bb = g.boundingBox;
  return { parts: [g], shared: true, intensity, y0: bb.min.y, y1: bb.max.y, dust: [bb.max.x - bb.min.x + dustPad, bb.max.y - bb.min.y + dustPad, bb.max.z - bb.min.z + dustPad] };
}

const BUILDERS = {
  car() { return fromAsset('car', 0.9); },
  house() {
    const parts = [];
    const b = new THREE.BoxGeometry(2.2, 1.8, 1.6); parts.push(b);
    const r = prism(1.8, 0.65, 2.4); r.rotateY(Math.PI / 2); r.translate(0, 0.9, 0); parts.push(r);
    const c = new THREE.BoxGeometry(0.28, 0.6, 0.28); c.translate(-0.7, 1.35, -0.25); parts.push(c);
    const door = new THREE.BoxGeometry(0.45, 0.75, 0.05); door.translate(-0.025, -0.525, 0.81); parts.push(door);
    for (const [x, y, w, h] of [[0.64, -0.41, 0.48, 0.42], [-0.63, 0.43, 0.46, 0.42], [0.64, 0.43, 0.48, 0.42]]) { const g = new THREE.BoxGeometry(w, h, 0.05); g.translate(x, y, 0.81); parts.push(g); }
    const hp = new THREE.BoxGeometry(0.5, 0.62, 0.26); hp.translate(1.52, -0.55, 0.25); parts.push(hp);
    const fan = new THREE.TorusGeometry(0.2, 0.025, 8, 32); fan.translate(1.52, -0.53, 0.39); parts.push(fan);
    return { parts, y0: -0.9, y1: 1.55, dust: [3.0, 2.6, 1.9], intensity: 0.5 };
  },
  bakery() {
    // many overlapping additive faces: keep the projection translucent
    const parts = [];
    const b = new THREE.BoxGeometry(2.6, 2.0, 1.6); parts.push(b);
    const r = prism(1.8, 0.45, 2.6); r.rotateY(Math.PI / 2); r.translate(0, 1.0, 0); parts.push(r);
    const aw = new THREE.BoxGeometry(2.55, 0.04, 0.58); aw.rotateX(0.24); aw.translate(0, 0.05, 1.07); parts.push(aw);
    const win = new THREE.BoxGeometry(1.6, 0.66, 0.05); win.translate(-0.35, -0.42, 0.81); parts.push(win);
    const door = new THREE.BoxGeometry(0.46, 0.88, 0.05); door.translate(0.85, -0.56, 0.81); parts.push(door);
    const signBand = new THREE.BoxGeometry(2.4, 0.3, 0.05); signBand.translate(0, 0.35, 0.81); parts.push(signBand);
    for (const x of [-0.65, 0.65]) { const w = new THREE.BoxGeometry(0.5, 0.3, 0.05); w.translate(x, 0.75, 0.81); parts.push(w); }
    const ch = new THREE.BoxGeometry(0.3, 0.5, 0.3); ch.translate(0.8, 1.25, -0.3); parts.push(ch);
    return { parts, y0: -1.0, y1: 1.5, dust: [2.9, 2.8, 2.0], intensity: 0.55 };
  },
  carProcedural() {
    const parts = [];
    // Side profile of a compact hatchback (x = length, y = height), extruded across the width with a soft bevel.
    const p = new THREE.Shape();
    p.moveTo(-1.22, -0.36);
    p.lineTo(-1.24, -0.05);
    p.quadraticCurveTo(-1.24, 0.12, -1.1, 0.16);   // tailgate
    p.quadraticCurveTo(-0.9, 0.22, -0.62, 0.62);  // rear glass
    p.quadraticCurveTo(-0.5, 0.7, -0.3, 0.7);     // roof
    p.lineTo(0.35, 0.7);
    p.quadraticCurveTo(0.6, 0.68, 0.9, 0.3);      // windscreen
    p.quadraticCurveTo(1.05, 0.2, 1.22, 0.14);    // bonnet
    p.quadraticCurveTo(1.28, 0.05, 1.26, -0.1);   // nose
    p.lineTo(1.24, -0.36);
    p.quadraticCurveTo(1.0, -0.4, 0.98, -0.36);
    p.absarc(0.78, -0.36, 0.27, 0, Math.PI, true);  // front wheel arch
    p.lineTo(-0.51, -0.36);
    p.absarc(-0.78, -0.36, 0.27, 0, Math.PI, true); // rear wheel arch
    p.lineTo(-1.22, -0.36);
    const body = new THREE.ExtrudeGeometry(p, { depth: 0.98, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 12 });
    body.translate(0, 0, -0.49); parts.push(body);
    // glazing outlines as thin shells so the edges read
    const glass = new THREE.Shape();
    glass.moveTo(-0.58, 0.24); glass.quadraticCurveTo(-0.5, 0.6, -0.28, 0.63); glass.lineTo(0.33, 0.63); glass.quadraticCurveTo(0.55, 0.6, 0.82, 0.26); glass.lineTo(-0.58, 0.24);
    const g = new THREE.ExtrudeGeometry(glass, { depth: 1.02, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -0.51); parts.push(g);
    for (const x of [-0.78, 0.78]) for (const z of [0.52, -0.52]) {
      const w = new THREE.CylinderGeometry(0.25, 0.25, 0.16, 28); w.rotateX(Math.PI / 2); w.translate(x, -0.36, z); parts.push(w);
      const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12); hub.rotateX(Math.PI / 2); hub.translate(x, -0.36, z); parts.push(hub);
    }
    const port = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14); port.rotateX(Math.PI / 2); port.translate(-1.0, 0.06, 0.53); parts.push(port);
    for (const z of [0.34, -0.34]) { const l = new THREE.BoxGeometry(0.06, 0.09, 0.22); l.translate(1.24, 0.0, z); parts.push(l); }
    return { parts, y0: -0.62, y1: 0.76, dust: [2.5, 1.4, 1.1] };
  },
  bakery() {
    // many overlapping additive faces: keep the projection translucent
    const parts = [];
    const b = new THREE.BoxGeometry(2.6, 2.0, 1.6); parts.push(b);
    const r = prism(1.8, 0.45, 2.6); r.rotateY(Math.PI / 2); r.translate(0, 1.0, 0); parts.push(r);
    const aw = new THREE.BoxGeometry(2.55, 0.04, 0.58); aw.rotateX(0.24); aw.translate(0, 0.05, 1.07); parts.push(aw);
    const win = new THREE.BoxGeometry(1.6, 0.66, 0.05); win.translate(-0.35, -0.42, 0.81); parts.push(win);
    const door = new THREE.BoxGeometry(0.46, 0.88, 0.05); door.translate(0.85, -0.56, 0.81); parts.push(door);
    const signBand = new THREE.BoxGeometry(2.4, 0.3, 0.05); signBand.translate(0, 0.35, 0.81); parts.push(signBand);
    for (const x of [-0.65, 0.65]) { const w = new THREE.BoxGeometry(0.5, 0.3, 0.05); w.translate(x, 0.75, 0.81); parts.push(w); }
    const ch = new THREE.BoxGeometry(0.3, 0.5, 0.3); ch.translate(0.8, 1.25, -0.3); parts.push(ch);
    return { parts, y0: -1.0, y1: 1.5, dust: [2.9, 2.8, 2.0], intensity: 0.55 };
  },
  carProcedural() {
    const parts = [];
    // Side profile of a compact hatchback (x = length, y = height), extruded across the width with a soft bevel.
    const p = new THREE.Shape();
    p.moveTo(-1.22, -0.36);
    p.lineTo(-1.24, -0.05);
    p.quadraticCurveTo(-1.24, 0.12, -1.1, 0.16);   // tailgate
    p.quadraticCurveTo(-0.9, 0.22, -0.62, 0.62);  // rear glass
    p.quadraticCurveTo(-0.5, 0.7, -0.3, 0.7);     // roof
    p.lineTo(0.35, 0.7);
    p.quadraticCurveTo(0.6, 0.68, 0.9, 0.3);      // windscreen
    p.quadraticCurveTo(1.05, 0.2, 1.22, 0.14);    // bonnet
    p.quadraticCurveTo(1.28, 0.05, 1.26, -0.1);   // nose
    p.lineTo(1.24, -0.36);
    p.quadraticCurveTo(1.0, -0.4, 0.98, -0.36);
    p.absarc(0.78, -0.36, 0.27, 0, Math.PI, true);  // front wheel arch
    p.lineTo(-0.51, -0.36);
    p.absarc(-0.78, -0.36, 0.27, 0, Math.PI, true); // rear wheel arch
    p.lineTo(-1.22, -0.36);
    const body = new THREE.ExtrudeGeometry(p, { depth: 0.98, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 12 });
    body.translate(0, 0, -0.49); parts.push(body);
    // glazing outlines as thin shells so the edges read
    const glass = new THREE.Shape();
    glass.moveTo(-0.58, 0.24); glass.quadraticCurveTo(-0.5, 0.6, -0.28, 0.63); glass.lineTo(0.33, 0.63); glass.quadraticCurveTo(0.55, 0.6, 0.82, 0.26); glass.lineTo(-0.58, 0.24);
    const g = new THREE.ExtrudeGeometry(glass, { depth: 1.02, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -0.51); parts.push(g);
    for (const x of [-0.78, 0.78]) for (const z of [0.52, -0.52]) {
      const w = new THREE.CylinderGeometry(0.25, 0.25, 0.16, 28); w.rotateX(Math.PI / 2); w.translate(x, -0.36, z); parts.push(w);
      const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12); hub.rotateX(Math.PI / 2); hub.translate(x, -0.36, z); parts.push(hub);
    }
    const port = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14); port.rotateX(Math.PI / 2); port.translate(-1.0, 0.06, 0.53); parts.push(port);
    for (const z of [0.34, -0.34]) { const l = new THREE.BoxGeometry(0.06, 0.09, 0.22); l.translate(1.24, 0.0, z); parts.push(l); }
    return { parts, y0: -0.62, y1: 0.76, dust: [2.5, 1.4, 1.1] };
  },
  houseProcedural() {
    const parts = [];
    const b = new THREE.BoxGeometry(1.8, 1.3, 1.6); b.translate(0, -0.35, 0); parts.push(b);
    const r = prism(2.0, 0.85, 1.8); r.translate(0, 0.3, 0); parts.push(r);
    const c = new THREE.BoxGeometry(0.22, 0.5, 0.22); c.translate(0.55, 1.0, -0.3); parts.push(c);
    const win = new THREE.BoxGeometry(0.4, 0.4, 0.04); win.translate(-0.35, -0.35, 0.81); parts.push(win);
    const door = new THREE.BoxGeometry(0.3, 0.6, 0.04); door.translate(0.35, -0.7, 0.81); parts.push(door);
    return { parts, y0: -1.0, y1: 1.3, dust: [1.9, 2.2, 1.7] };
  },
  battery() {
    const parts = [];
    const slab = new THREE.BoxGeometry(1.0, 1.9, 0.28); parts.push(slab);
    const panel = new THREE.BoxGeometry(0.8, 1.64, 0.03); panel.translate(0, 0, 0.15); parts.push(panel);
    const bolt = new THREE.Shape();
    bolt.moveTo(-0.12, 0.5); bolt.lineTo(-0.4, 0.02); bolt.lineTo(-0.2, 0.02); bolt.lineTo(-0.34, -0.5); bolt.lineTo(-0.02, 0.1); bolt.lineTo(-0.22, 0.1); bolt.lineTo(-0.12, 0.5);
    const bg = new THREE.ExtrudeGeometry(bolt, { depth: 0.04, bevelEnabled: false }); bg.translate(0, 0, 0.165); parts.push(bg);
    for (let k = 0; k < 6; k++) { const bar = new THREE.BoxGeometry(0.28, 0.16, 0.03); bar.translate(0.21, -0.53 + k * 0.245, 0.17); parts.push(bar); }
    return { parts, y0: -0.95, y1: 0.95, dust: [1.4, 2.2, 1.0], intensity: 0.9 };
  },
  turbine() {
    const parts = [];
    const t = new THREE.CylinderGeometry(0.08, 0.16, 4.0, 16); t.translate(0, -0.6, 0); parts.push(t);
    const n = new THREE.BoxGeometry(0.5, 0.35, 0.8); n.translate(0, 1.45, 0.1); parts.push(n);
    const base = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24); base.translate(0, -2.6, 0); parts.push(base);
    return { parts, y0: -2.6, y1: 1.7, dust: [2.2, 4.4, 1.2], blades: true };
  },
};

function bladesGeometry() {
  const parts = [];
  for (let b = 0; b < 3; b++) {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0.09, 0.3); s.lineTo(0.06, 1.7); s.lineTo(-0.06, 1.7); s.lineTo(-0.09, 0.3); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
    g.rotateZ((b / 3) * Math.PI * 2);
    parts.push(g);
  }
  const hub = new THREE.SphereGeometry(0.16, 14, 10); parts.push(hub);
  return parts;
}

export class Hologram {
  constructor(node) {
    const def = node.def;
    const built = BUILDERS[def.shape]();
    this.group = new THREE.Group();
    this.mat = holoMaterial(def.color, def.hot);
    this.mat.uniforms.uBuildY0.value = built.y0;
    this.mat.uniforms.uBuildY1.value = built.y1;
    this.edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(def.color).lerp(new THREE.Color(def.hot), 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.meshes = [];
    this.edges = [];
    this.shared = !!built.shared; // asset geometry is owned by the loader cache, never disposed here
    this.intensity = built.intensity ?? 1;
    for (const g of built.parts) {
      const m = new THREE.Mesh(g, this.mat); m.frustumCulled = false; this.group.add(m); this.meshes.push(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, built.shared ? 55 : 40), this.edgeMat); e.frustumCulled = false; this.group.add(e); this.edges.push(e);
    }
    if (built.blades) {
      this.blades = new THREE.Group();
      this.blades.position.set(0, 1.45, 0.55);
      for (const g of bladesGeometry()) {
        const m = new THREE.Mesh(g, this.mat); m.frustumCulled = false; this.blades.add(m); this.meshes.push(m);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 40), this.edgeMat); e.frustumCulled = false; this.blades.add(e); this.edges.push(e);
      }
      this.group.add(this.blades);
    }
    // dust motes drifting through the projection's field
    const [dw, dh, dd] = built.dust;
    const n = 220;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * dw; pos[i * 3 + 1] = built.y0 + Math.random() * (built.y1 - built.y0); pos[i * 3 + 2] = (Math.random() - 0.5) * dd; }
    this.dustMat = pointsMaterial({ color: '#ffffff', colorHot: def.hot, size: 0.42, opacity: 0 });
    this.dustMat.uniforms.uBreath.value = 0.09;
    this.dustMat.uniforms.uActivity.value = 0.6;
    this.dust = makePoints(pos, this.dustMat);
    this.dust.children[0].material.uniforms.uBreath = this.dustMat.uniforms.uBreath;
    this.group.add(this.dust);
    // emitter: a faint pair of rings beneath the projection
    this.baseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.hot), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const rw = Math.max(dw, dd) * 0.62;
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(rw * 0.94, rw, 64), this.baseMat);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(rw * 0.55, rw * 0.58, 48), this.baseMat);
    for (const r of [ring1, ring2]) { r.rotation.x = -Math.PI / 2; r.position.y = built.y0 - 0.12; r.frustumCulled = false; this.group.add(r); }
    this.rings = [ring1, ring2];
    this.group.visible = false;
    node.group.add(this.group);
    this.c = 0;
  }

  /** c = 0 … 1 how far the particles have condensed into the projection. */
  update(c, time, bladeAngle) {
    this.c = c;
    this.group.visible = c > 0.005;
    if (!this.group.visible) return;
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uBuild.value = Math.min(1, c * 1.15);
    this.mat.uniforms.uOpacity.value = Math.min(1, c * 1.2) * this.intensity;
    this.edgeMat.opacity = 0.5 * Math.pow(c, 1.5) * Math.min(1, this.intensity + 0.3);
    this.baseMat.opacity = 0.35 * Math.pow(c, 2) * (0.85 + 0.15 * Math.sin(time * 1.4));
    this.rings[1].rotation.z = time * 0.3;
    const sc = 1 + 0.12 * c;
    this.group.scale.setScalar(sc);
    this.dustMat.uniforms.uOpacity.value = 0.95 * Math.pow(c, 2);
    this.dustMat.uniforms.uTime.value = time * 0.35;
    if (this.blades && bladeAngle != null) this.blades.rotation.z = bladeAngle;
  }

  dispose() {
    for (const m of this.meshes) if (!this.shared) m.geometry.dispose();
    for (const e of this.edges) e.geometry.dispose();
    this.mat.dispose(); this.edgeMat.dispose(); this.baseMat.dispose(); for (const r of this.rings) r.geometry.dispose();
    this.dust.geometry.dispose(); this.dustMat.userData.halo?.dispose(); this.dustMat.dispose();
  }
}

export const HOLO_NODES = new Set(['car', 'home', 'bakery', 'battery', 'wind']);
