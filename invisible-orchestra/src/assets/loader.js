import * as THREE from 'three';
import carGeo from './car.geo';
import houseGeo from './house.geo';
import bakeryGeo from './bakery.geo';

/**
 * Compact geometry embedded in the build (see tools/prepare-assets.py).
 * Decoded once, lazily; shared between the ambient point cloud (surface
 * samples) and the hard-light projection (the mesh itself), so the object
 * that resolves is the same form the visitor saw in the sculpture.
 */
const FILES = { car: carGeo, house: houseGeo, bakery: bakeryGeo };
const cache = {};

function decode(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'IOG1' && magic !== 'IOG2') throw new Error('bad geometry file');
  const wide = magic === 'IOG2';
  const nv = dv.getUint32(4, true), nt = dv.getUint32(8, true);
  const mn = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)];
  const mx = [dv.getFloat32(24, true), dv.getFloat32(28, true), dv.getFloat32(32, true)];
  let off = 36;
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) {
    const q = dv.getInt16(off, true); off += 2;
    const k = i % 3;
    pos[i] = mn[k] + ((q + 32767) / 65534) * (mx[k] - mn[k]);
  }
  const idx = wide ? new Uint32Array(nt * 3) : new Uint16Array(nt * 3);
  for (let i = 0; i < nt * 3; i++) { idx[i] = wide ? dv.getUint32(off, true) : dv.getUint16(off, true); off += wide ? 4 : 2; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.boundingBox = new THREE.Box3(new THREE.Vector3(...mn), new THREE.Vector3(...mx));
  return g;
}

export function assetGeometry(name) {
  if (!cache[name]) cache[name] = decode(FILES[name]);
  return cache[name];
}

/** Area-weighted random points on the mesh surface (deterministic seed). */
export function sampleSurface(name, count, seed = 1) {
  const g = assetGeometry(name);
  const p = g.attributes.position.array;
  const idx = g.index.array;
  const nt = idx.length / 3;
  const area = new Float64Array(nt);
  let total = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    A.fromArray(p, idx[t * 3] * 3); B.fromArray(p, idx[t * 3 + 1] * 3); C.fromArray(p, idx[t * 3 + 2] * 3);
    total += area[t] = t1.subVectors(B, A).cross(t2.subVectors(C, A)).length() * 0.5;
  }
  // cumulative table for O(log n) selection
  const cum = new Float64Array(nt);
  let acc = 0;
  for (let t = 0; t < nt; t++) { acc += area[t]; cum[t] = acc / total; }
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rnd();
    let lo = 0, hi = nt - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const t = lo;
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    A.fromArray(p, idx[t * 3] * 3); B.fromArray(p, idx[t * 3 + 1] * 3); C.fromArray(p, idx[t * 3 + 2] * 3);
    out[i * 3] = A.x + (B.x - A.x) * u + (C.x - A.x) * v;
    out[i * 3 + 1] = A.y + (B.y - A.y) * u + (C.y - A.y) * v;
    out[i * 3 + 2] = A.z + (B.z - A.z) * u + (C.z - A.z) * v;
  }
  return out;
}

/**
 * Points along the crease edges of the mesh (where adjacent faces meet at
 * more than `thresholdDeg`). These carry the silhouette: with them, a car is
 * a car before anyone touches it, not a cloud in the shape of a car.
 */
export function sampleEdges(name, count, thresholdDeg = 32, seed = 7) {
  const g = assetGeometry(name);
  const key = `edges${thresholdDeg}`;
  if (!cache[name + key]) cache[name + key] = new THREE.EdgesGeometry(g, thresholdDeg).attributes.position.array;
  const e = cache[name + key];
  const nseg = e.length / 6;
  const len = new Float64Array(nseg);
  let total = 0;
  for (let i = 0; i < nseg; i++) {
    const dx = e[i * 6 + 3] - e[i * 6], dy = e[i * 6 + 4] - e[i * 6 + 1], dz = e[i * 6 + 5] - e[i * 6 + 2];
    total += len[i] = Math.hypot(dx, dy, dz);
  }
  const cum = new Float64Array(nseg);
  let acc = 0;
  for (let i = 0; i < nseg; i++) { acc += len[i]; cum[i] = acc / total; }
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rnd();
    let lo = 0, hi = nseg - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const t = rnd(), k = lo * 6;
    out[i * 3] = e[k] + (e[k + 3] - e[k]) * t;
    out[i * 3 + 1] = e[k + 1] + (e[k + 4] - e[k + 1]) * t;
    out[i * 3 + 2] = e[k + 2] + (e[k + 5] - e[k + 2]) * t;
  }
  return out;
}

/**
 * Visible silhouette curves of a model as seen from given local-space
 * directions. Edges where a front-facing face meets a back-facing one (the
 * outline) and strong creases (structure) are candidates; each candidate is
 * then depth-tested against a one-off render from that direction so that
 * interior edges hidden behind the surface are dropped. The result is what a
 * draughtsman would draw: the contour, not the wireframe.
 *
 * Runs once per model at start-up; cost is one small offscreen render per
 * direction plus a pass over the edge list.
 */
export function silhouetteSegments(name, viewDirs, renderer, { creaseDeg = 55, size = 384 } = {}) {
  const g = assetGeometry(name);
  const key = `sil:${viewDirs.map((d) => d.toArray().map((v) => v.toFixed(2)).join(',')).join('|')}:${creaseDeg}`;
  if (cache[name + key]) return cache[name + key];
  const p = g.attributes.position.array;
  const idx = g.index.array;
  const nt = idx.length / 3;
  const nv = p.length / 3;
  // face normals
  const fn = new Float32Array(nt * 3);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    A.fromArray(p, idx[t * 3] * 3); B.fromArray(p, idx[t * 3 + 1] * 3); C.fromArray(p, idx[t * 3 + 2] * 3);
    t1.subVectors(B, A).cross(t2.subVectors(C, A)).normalize();
    fn[t * 3] = t1.x; fn[t * 3 + 1] = t1.y; fn[t * 3 + 2] = t1.z;
  }
  // edge → faces
  const edges = new Map();
  for (let t = 0; t < nt; t++) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t * 3 + e], b = idx[t * 3 + ((e + 1) % 3)];
      const k = a < b ? a * nv + b : b * nv + a;
      let rec = edges.get(k);
      if (!rec) { rec = { a: Math.min(a, b), b: Math.max(a, b), f: [] }; edges.set(k, rec); }
      if (rec.f.length < 2) rec.f.push(t);
    }
  }
  const cosCrease = Math.cos(creaseDeg * Math.PI / 180);
  const bb = g.boundingBox;
  const centre = bb.getCenter(new THREE.Vector3());
  const radius = bb.getSize(new THREE.Vector3()).length() * 0.5 + 0.05;
  const keep = new Set();

  // one depth render per direction
  const rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
  const depthMat = new THREE.ShaderMaterial({
    uniforms: { uNear: { value: 0 }, uFar: { value: 1 } },
    vertexShader: 'varying float vZ; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uNear; uniform float uFar; varying float vZ; void main(){ float d = clamp((vZ - uNear) / (uFar - uNear), 0.0, 1.0); float hi = floor(d * 255.0) / 255.0; float lo = fract(d * 255.0); gl_FragColor = vec4(hi, lo, 0.0, 1.0); }',
    side: THREE.DoubleSide,
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(g, depthMat);
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 4);
  const buf = new Uint8Array(size * size * 4);
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const near = 0.01, far = radius * 4;
  depthMat.uniforms.uNear.value = near; depthMat.uniforms.uFar.value = far;
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  let readable = true;
  for (const dir of viewDirs) {
    const d = dir.clone().normalize();
    cam.position.copy(centre).add(d.clone().multiplyScalar(radius * 2));
    cam.up.set(0, 1, 0);
    if (Math.abs(d.y) > 0.95) cam.up.set(0, 0, 1);
    cam.lookAt(centre);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    try {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    } catch (e) { readable = false; }
    const visibleAt = (x, y, z) => {
      if (!readable) return true;
      P.set(x, y, z);
      V.copy(P).applyMatrix4(cam.matrixWorldInverse);
      const zd = (-V.z - near) / (far - near);
      P.project(cam);
      const px = Math.round((P.x * 0.5 + 0.5) * (size - 1)), py = Math.round((P.y * 0.5 + 0.5) * (size - 1));
      if (px < 0 || py < 0 || px >= size || py >= size) return false;
      const o = (py * size + px) * 4;
      const bd = buf[o] / 255 + buf[o + 1] / 255 / 255;
      return zd <= bd + 0.006;
    };
    for (const [k, e] of edges) {
      if (keep.has(k)) continue;
      let cand = false;
      if (e.f.length === 1) cand = fn[e.f[0] * 3] * d.x + fn[e.f[0] * 3 + 1] * d.y + fn[e.f[0] * 3 + 2] * d.z > -0.2;
      else {
        const f0 = e.f[0], f1 = e.f[1];
        const d0 = fn[f0 * 3] * d.x + fn[f0 * 3 + 1] * d.y + fn[f0 * 3 + 2] * d.z;
        const d1 = fn[f1 * 3] * d.x + fn[f1 * 3 + 1] * d.y + fn[f1 * 3 + 2] * d.z;
        const silhouette = d0 * d1 < 0;
        const cosA = fn[f0 * 3] * fn[f1 * 3] + fn[f0 * 3 + 1] * fn[f1 * 3 + 1] + fn[f0 * 3 + 2] * fn[f1 * 3 + 2];
        const crease = cosA < cosCrease && (d0 > 0.05 || d1 > 0.05);
        cand = silhouette || crease;
      }
      if (!cand) continue;
      const ax = p[e.a * 3], ay = p[e.a * 3 + 1], az = p[e.a * 3 + 2], bx = p[e.b * 3], by = p[e.b * 3 + 1], bz = p[e.b * 3 + 2];
      let vis = 0;
      for (const t of [0.15, 0.5, 0.85]) if (visibleAt(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) vis++;
      if (vis >= 2) keep.add(k);
    }
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  rt.dispose(); depthMat.dispose();
  const segs = new Float32Array(keep.size * 6);
  let i = 0;
  for (const k of keep) { const e = edges.get(k); segs.set([p[e.a * 3], p[e.a * 3 + 1], p[e.a * 3 + 2], p[e.b * 3], p[e.b * 3 + 1], p[e.b * 3 + 2]], i); i += 6; }
  cache[name + key] = segs;
  return segs;
}

/** Points along an arbitrary set of segments, weighted by length. */
export function samplePolylines(e, count, seed = 11) {
  const nseg = e.length / 6;
  if (!nseg) return new Float32Array(0);
  const len = new Float64Array(nseg);
  let total = 0;
  for (let i = 0; i < nseg; i++) total += len[i] = Math.hypot(e[i * 6 + 3] - e[i * 6], e[i * 6 + 4] - e[i * 6 + 1], e[i * 6 + 5] - e[i * 6 + 2]);
  const cum = new Float64Array(nseg);
  let acc = 0;
  for (let i = 0; i < nseg; i++) { acc += len[i]; cum[i] = acc / total; }
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rnd();
    let lo = 0, hi = nseg - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const t = rnd(), k = lo * 6;
    out[i * 3] = e[k] + (e[k + 3] - e[k]) * t;
    out[i * 3 + 1] = e[k + 1] + (e[k + 4] - e[k + 1]) * t;
    out[i * 3 + 2] = e[k + 2] + (e[k + 5] - e[k + 2]) * t;
  }
  return out;
}
