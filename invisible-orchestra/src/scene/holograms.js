import * as THREE from 'three';
import { pointsMaterial, makePoints } from './glow.js';

/**
 * Hard-light projections. When a hero object is pulled forward, its
 * particles coalesce into a solid holographic form: translucent surfaces
 * of light with bright fresnel edges, a faint scanline shimmer and tiny
 * dust motes drifting through the projection's field. Still unmistakably
 * made of light — just more substantial than the overview.
 *
 * Everything is procedural geometry: no external assets.
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
  float scan = 0.87 + 0.13 * sin(vW.y * 46.0 - uTime * 2.6);
  float flicker = 0.96 + 0.04 * sin(uTime * 19.0) * sin(uTime * 5.3);
  vec3 col = mix(uColor, uColorHot, f);
  float a = (0.2 + 0.9 * f) * scan * flicker * uOpacity * rise;
  a += (1.0 - seam) * 0.9 * uOpacity * step(0.001, uBuild) * step(uBuild, 0.999);
  gl_FragColor = vec4(col * (0.75 + f * 1.2), clamp(a, 0.0, 1.0));
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
    blending: THREE.AdditiveBlending,
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

const BUILDERS = {
  car() {
    const parts = [];
    const body = new THREE.BoxGeometry(2.4, 0.55, 1.1, 1, 1, 1); body.translate(0, -0.1, 0); parts.push(body);
    const cabin = new THREE.Shape();
    cabin.moveTo(-0.95, 0.17); cabin.lineTo(-0.5, 0.65); cabin.lineTo(0.7, 0.65); cabin.lineTo(1.12, 0.17); cabin.lineTo(-0.95, 0.17);
    const cg = new THREE.ExtrudeGeometry(cabin, { depth: 1.0, bevelEnabled: false }); cg.translate(0, 0, -0.5); parts.push(cg);
    for (const x of [-0.8, 0.8]) for (const z of [0.56, -0.56]) { const w = new THREE.CylinderGeometry(0.23, 0.23, 0.14, 24); w.rotateX(Math.PI / 2); w.translate(x, -0.42, z); parts.push(w); }
    const port = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12); port.rotateX(Math.PI / 2); port.translate(-1.0, 0.05, 0.56); parts.push(port);
    for (const z of [0.35, -0.35]) { const l = new THREE.SphereGeometry(0.07, 10, 8); l.translate(1.2, -0.05, z); parts.push(l); }
    return { parts, y0: -0.7, y1: 0.7, dust: [2.4, 1.3, 1.2] };
  },
  house() {
    const parts = [];
    const b = new THREE.BoxGeometry(1.8, 1.3, 1.6); b.translate(0, -0.35, 0); parts.push(b);
    const r = prism(2.0, 0.85, 1.8); r.translate(0, 0.3, 0); parts.push(r);
    const c = new THREE.BoxGeometry(0.22, 0.5, 0.22); c.translate(0.55, 1.0, -0.3); parts.push(c);
    const win = new THREE.BoxGeometry(0.4, 0.4, 0.04); win.translate(-0.35, -0.35, 0.81); parts.push(win);
    const door = new THREE.BoxGeometry(0.3, 0.6, 0.04); door.translate(0.35, -0.7, 0.81); parts.push(door);
    return { parts, y0: -1.0, y1: 1.3, dust: [1.9, 2.2, 1.7] };
  },
  bakery() {
    const parts = [];
    const b = new THREE.BoxGeometry(2.6, 1.5, 1.6); b.translate(0, -0.25, 0); parts.push(b);
    const aw = new THREE.BoxGeometry(2.7, 0.06, 0.5); aw.translate(0, 0.2, 1.0); parts.push(aw);
    const win = new THREE.BoxGeometry(2.0, 0.75, 0.04); win.translate(0, -0.48, 0.81); parts.push(win);
    const ch = new THREE.BoxGeometry(0.3, 0.7, 0.3); ch.translate(0.8, 0.85, -0.4); parts.push(ch);
    return { parts, y0: -1.0, y1: 1.2, dust: [2.6, 2.1, 1.7] };
  },
  battery() {
    const parts = [];
    const c = new THREE.CylinderGeometry(0.55, 0.55, 1.8, 40); parts.push(c);
    const cap = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 24); cap.translate(0, 0.98, 0); parts.push(cap);
    const core = new THREE.CylinderGeometry(0.34, 0.34, 1.5, 24); parts.push(core);
    return { parts, y0: -0.9, y1: 1.05, dust: [1.2, 2.0, 1.2] };
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
    this.edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(def.hot), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.meshes = [];
    this.edges = [];
    for (const g of built.parts) {
      const m = new THREE.Mesh(g, this.mat); m.frustumCulled = false; this.group.add(m); this.meshes.push(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), this.edgeMat); e.frustumCulled = false; this.group.add(e); this.edges.push(e);
    }
    if (built.blades) {
      this.blades = new THREE.Group();
      this.blades.position.set(0, 1.45, 0.55);
      for (const g of bladesGeometry()) {
        const m = new THREE.Mesh(g, this.mat); m.frustumCulled = false; this.blades.add(m); this.meshes.push(m);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), this.edgeMat); e.frustumCulled = false; this.blades.add(e); this.edges.push(e);
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
    this.mat.uniforms.uOpacity.value = Math.min(1, c * 1.2);
    this.edgeMat.opacity = 0.7 * Math.pow(c, 1.5);
    this.baseMat.opacity = 0.35 * Math.pow(c, 2) * (0.85 + 0.15 * Math.sin(time * 1.4));
    this.rings[1].rotation.z = time * 0.3;
    const sc = 1 + 0.12 * c;
    this.group.scale.setScalar(sc);
    this.dustMat.uniforms.uOpacity.value = 0.95 * Math.pow(c, 2);
    this.dustMat.uniforms.uTime.value = time * 0.35;
    if (this.blades && bladeAngle != null) this.blades.rotation.z = bladeAngle;
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    for (const e of this.edges) e.geometry.dispose();
    this.mat.dispose(); this.edgeMat.dispose(); this.baseMat.dispose(); for (const r of this.rings) r.geometry.dispose();
    this.dust.geometry.dispose(); this.dustMat.userData.halo?.dispose(); this.dustMat.dispose();
  }
}

export const HOLO_NODES = new Set(['car', 'home', 'bakery', 'battery', 'wind']);
