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
