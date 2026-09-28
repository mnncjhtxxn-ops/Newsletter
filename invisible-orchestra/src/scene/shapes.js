/**
 * Point-cloud shapes: every recognisable object in the sculpture is formed
 * from light. Each generator returns { positions: Float32Array, fills?: Float32Array }
 * in local units (roughly 1 = 1 metre of sculpture space).
 */

import { sampleSurface, sampleEdges, assetGeometry, silhouetteSegments, samplePolylines } from '../assets/loader.js';

const rnd = (a = 1) => (Math.random() * 2 - 1) * a;

/**
 * A modelled object expressed as light: points sampled on its surface, plus
 * a few interior points whose brightness follows the object's state (charge,
 * warmth, oven heat). The same mesh becomes the hard-light projection.
 */
function fromAsset(name, surfaceCount, interior, edgeShare = 0.6, edgeDeg = 32, ctx = null) {
  const nEdge = Math.round(surfaceCount * edgeShare);
  const surf = sampleSurface(name, surfaceCount - nEdge, name.length * 7919);
  // With a viewing context, draw the real silhouette: visible outline and creases from where the viewer stands.
  const edges = ctx && ctx.viewDirs && ctx.renderer
    ? samplePolylines(silhouetteSegments(name, ctx.viewDirs, ctx.renderer, { creaseDeg: edgeDeg }), nEdge, name.length * 131)
    : sampleEdges(name, nEdge, edgeDeg);
  const bb = assetGeometry(name).boundingBox;
  const a = Array.from(edges).concat(Array.from(surf));
  const n0 = a.length / 3;
  const fills = [];
  for (let i = 0; i < n0; i++) fills.push(0);
  if (interior) {
    const { count, box, fill } = interior;
    for (let i = 0; i < count; i++) {
      const x = box[0] + Math.random() * (box[3] - box[0]);
      const y = box[1] + Math.random() * (box[4] - box[1]);
      const z = box[2] + Math.random() * (box[5] - box[2]);
      a.push(x, y, z);
      fills.push(fill(x, y, z));
    }
  }
  return { positions: Float32Array.from(a), fills: Float32Array.from(fills), bb };
}

function push(arr, x, y, z) {
  arr.push(x, y, z);
}

/** Points along a polyline with slight jitter. */
function polyline(arr, pts, perUnit = 40, jitter = 0.02) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [a, b] = [pts[s], pts[s + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(2, Math.round(len * perUnit));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      push(arr, a[0] + (b[0] - a[0]) * t + rnd(jitter), a[1] + (b[1] - a[1]) * t + rnd(jitter), a[2] + (b[2] - a[2]) * t + rnd(jitter));
    }
  }
}

function ring(arr, cx, cy, cz, r, n, axis = 'z', jitter = 0.02) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const u = Math.cos(a) * r;
    const v = Math.sin(a) * r;
    if (axis === 'z') push(arr, cx + u + rnd(jitter), cy + v + rnd(jitter), cz + rnd(jitter));
    else if (axis === 'y') push(arr, cx + u + rnd(jitter), cy + rnd(jitter), cz + v + rnd(jitter));
    else push(arr, cx + rnd(jitter), cy + u + rnd(jitter), cz + v + rnd(jitter));
  }
}

function box(arr, w, h, d, cx = 0, cy = 0, cz = 0, perUnit = 30) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, b] of e) polyline(arr, [c[a], c[b]], perUnit);
}

function scatterVolume(arr, n, w, h, d, cx = 0, cy = 0, cz = 0) {
  for (let i = 0; i < n; i++) push(arr, cx + rnd(w / 2), cy + rnd(h / 2), cz + rnd(d / 2));
}

export function turbine() {
  const a = [];
  polyline(a, [[0, -2.6, 0], [0, 1.4, 0]], 50, 0.03);
  polyline(a, [[-0.5, -2.6, 0], [0.5, -2.6, 0]], 30);
  box(a, 0.5, 0.35, 0.8, 0, 1.45, 0.1, 40);
  return { positions: Float32Array.from(a) };
}

export function turbineBlades() {
  const a = [];
  for (let b = 0; b < 3; b++) {
    const ang = (b / 3) * Math.PI * 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const width = 0.11 * Math.sin(t * Math.PI) + 0.02;
      push(a, dx * t * 1.7 + rnd(width) - dy * (t - 0.5) * 0.06, dy * t * 1.7 + rnd(width) + dx * (t - 0.5) * 0.06, rnd(0.03));
    }
  }
  ring(a, 0, 0, 0, 0.14, 24);
  return { positions: Float32Array.from(a) };
}

export function car(ctx) {
  // outline of the concept car; interior points fill left→right with state of charge
  return fromAsset('car', 1100, { count: 160, box: [-1.0, -0.3, -0.34, 1.0, 0.25, 0.34], fill: (x) => (x + 1.0) / 2.0 }, 0.8, 42, ctx);
}

export function carProcedural() {
  const a = [];
  // body: lower box and a cabin, softened by jitter
  box(a, 2.4, 0.55, 1.1, 0, -0.1, 0, 34);
  polyline(a, [[-0.9, 0.18, 0.55], [-0.5, 0.65, 0.55], [0.7, 0.65, 0.55], [1.1, 0.18, 0.55]], 40);
  polyline(a, [[-0.9, 0.18, -0.55], [-0.5, 0.65, -0.55], [0.7, 0.65, -0.55], [1.1, 0.18, -0.55]], 40);
  polyline(a, [[-0.5, 0.65, 0.55], [-0.5, 0.65, -0.55]], 30);
  polyline(a, [[0.7, 0.65, 0.55], [0.7, 0.65, -0.55]], 30);
  for (const x of [-0.8, 0.8]) for (const z of [0.58, -0.58]) ring(a, x, -0.42, z, 0.22, 26, 'z');
  // headlights
  scatterVolume(a, 30, 0.1, 0.1, 0.25, 1.2, -0.05, 0.35);
  scatterVolume(a, 30, 0.1, 0.1, 0.25, 1.2, -0.05, -0.35);
  // the charge port glow
  scatterVolume(a, 40, 0.15, 0.15, 0.1, -1.0, 0.05, 0.56);
  // the "fill" : interior points whose brightness follows state of charge
  const n0 = a.length / 3;
  for (let i = 0; i < 360; i++) push(a, rnd(1.05), -0.35 + Math.random() * 0.75, rnd(0.45));
  const positions = Float32Array.from(a);
  const fills = new Float32Array(positions.length / 3);
  for (let i = n0; i < fills.length; i++) fills[i] = (positions[i * 3] + 1.05) / 2.1; // fill left → right
  return { positions, fills };
}

/**
 * Your home is a cottage drawn in light: pitched roof, chimney, a door and
 * four windows whose glass brightens with the warmth inside, and the heat
 * pump on the side wall that the orchestra actually schedules. Procedural,
 * in the same hand as the bakery, because a house must read as a house at
 * ten metres and a dense timber-frame model did not.
 */
export function house() {
  const a = [];
  const F = 0.8;
  box(a, 2.2, 1.8, 1.6, 0, 0, 0, 26);
  // roof: ridge along x, gables, eaves, a slight overhang
  for (const x of [-1.2, 1.2]) polyline(a, [[x, 0.9, -0.9], [x, 1.55, 0], [x, 0.9, 0.9]], 44);
  polyline(a, [[-1.2, 1.55, 0], [1.2, 1.55, 0]], 40, 0.015);
  polyline(a, [[-1.2, 0.9, 0.9], [1.2, 0.9, 0.9]], 30); polyline(a, [[-1.2, 0.9, -0.9], [1.2, 0.9, -0.9]], 30);
  // chimney with a cap
  box(a, 0.28, 0.6, 0.28, -0.7, 1.35, -0.25, 30);
  polyline(a, [[-0.9, 1.65, -0.45], [-0.5, 1.65, -0.45], [-0.5, 1.65, -0.05], [-0.9, 1.65, -0.05], [-0.9, 1.65, -0.45]], 40, 0.008);
  // door with a step and a handle
  polyline(a, [[-0.25, -0.9, F], [-0.25, -0.15, F], [0.2, -0.15, F], [0.2, -0.9, F]], 50, 0.01);
  polyline(a, [[-0.35, -0.9, F + 0.12], [0.3, -0.9, F + 0.12]], 40, 0.01);
  push(a, 0.12, -0.5, F + 0.02); push(a, 0.12, -0.52, F + 0.02);
  // windows: ground floor right, first floor left and right, each with a cross bar
  const win = (x0, y0, w, h) => {
    polyline(a, [[x0, y0, F], [x0 + w, y0, F], [x0 + w, y0 + h, F], [x0, y0 + h, F], [x0, y0, F]], 50, 0.008);
    polyline(a, [[x0 + w / 2, y0, F], [x0 + w / 2, y0 + h, F]], 40, 0.006);
    polyline(a, [[x0, y0 + h / 2, F], [x0 + w, y0 + h / 2, F]], 40, 0.006);
  };
  const WINS = [[0.4, -0.62, 0.48, 0.42], [-0.86, 0.22, 0.46, 0.42], [0.4, 0.22, 0.48, 0.42]];
  for (const w of WINS) win(...w);
  // the heat pump: a unit on the side wall with a fan
  const hx = 1.1 + 0.3, hy = -0.55, hz = 0.25;
  box(a, 0.5, 0.62, 0.26, hx + 0.12, hy, hz, 30);
  ring(a, hx + 0.12, hy + 0.02, hz + 0.14, 0.2, 40, 'z', 0.008);
  ring(a, hx + 0.12, hy + 0.02, hz + 0.14, 0.07, 14, 'z', 0.005);
  // lit interior: the glass fills with warmth, the hearth glows deepest
  const n0 = a.length / 3;
  const fills = [];
  for (let i = 0; i < n0; i++) fills.push(0);
  for (const [x0, y0, w, h] of WINS) for (let i = 0; i < 70; i++) { push(a, x0 + 0.04 + Math.random() * (w - 0.08), y0 + 0.04 + Math.random() * (h - 0.08), F - 0.02 - Math.random() * 0.2); fills.push(0.1 + Math.random() * 0.9); }
  for (let i = 0; i < 90; i++) { const r = Math.random() * 0.28; const t = Math.random() * 6.283; push(a, -0.6 + Math.cos(t) * r, -0.5 + rnd(0.15), -0.2 + Math.sin(t) * r); fills.push(Math.random() * 0.25); }
  return { positions: Float32Array.from(a), fills: Float32Array.from(fills) };
}

/* Stroke letters for the shop sign: each glyph in a 0.8 × 1 box, advance 1. */
const GLYPHS = {
  B: [[[0, 0], [0, 1], [0.6, 1], [0.72, 0.9], [0.72, 0.6], [0.6, 0.5], [0, 0.5]], [[0.6, 0.5], [0.76, 0.38], [0.76, 0.1], [0.64, 0], [0, 0]]],
  A: [[[0, 0], [0.4, 1], [0.8, 0]], [[0.16, 0.4], [0.64, 0.4]]],
  K: [[[0, 0], [0, 1]], [[0.72, 1], [0, 0.42]], [[0.26, 0.58], [0.74, 0]]],
  E: [[[0.7, 0], [0, 0], [0, 1], [0.7, 1]], [[0, 0.5], [0.56, 0.5]]],
  R: [[[0, 0], [0, 1], [0.6, 1], [0.72, 0.9], [0.72, 0.6], [0.6, 0.5], [0, 0.5]], [[0.36, 0.5], [0.76, 0]]],
  Y: [[[0, 1], [0.4, 0.5], [0.8, 1]], [[0.4, 0.5], [0.4, 0]]],
};
function sign(arr, text, x0, y0, z, h) {
  let x = x0;
  for (const ch of text) {
    for (const stroke of GLYPHS[ch] || []) polyline(arr, stroke.map(([u, v]) => [x + u * h, y0 + v * h, z]), 110, 0.006);
    x += h * 1.05;
  }
}

/**
 * The bakery is a storefront: a two-storey shop with a big lit window, a
 * striped awning, a door, a sign that says what it is, a pitched roof and a
 * chimney. Interior points behind the window brighten with oven power. It is
 * built here rather than from a model because a shop must read as a shop at
 * ten metres, and a modelled interior did not.
 */
export function bakery() {
  const a = [];
  const F = 0.8; // front face
  box(a, 2.6, 2.0, 1.6, 0, 0, 0, 26);
  // roof: ridge along x, gables at each end, eaves
  for (const x of [-1.3, 1.3]) polyline(a, [[x, 1.0, -0.85], [x, 1.45, 0], [x, 1.0, 0.85]], 40);
  polyline(a, [[-1.3, 1.45, 0], [1.3, 1.45, 0]], 40, 0.015);
  polyline(a, [[-1.3, 1.0, 0.85], [1.3, 1.0, 0.85]], 30); polyline(a, [[-1.3, 1.0, -0.85], [1.3, 1.0, -0.85]], 30);
  // chimney
  box(a, 0.3, 0.5, 0.3, 0.8, 1.25, -0.3, 30);
  // shop window (left) and door (right)
  polyline(a, [[-1.15, -0.1, F], [0.45, -0.1, F], [0.45, -0.75, F], [-1.15, -0.75, F], [-1.15, -0.1, F]], 60, 0.01);
  polyline(a, [[-0.35, -0.1, F], [-0.35, -0.75, F]], 50, 0.01);
  polyline(a, [[0.62, -0.12, F], [1.08, -0.12, F], [1.08, -1.0, F], [0.62, -1.0, F]], 50, 0.01);
  push(a, 0.98, -0.58, F + 0.02); push(a, 0.98, -0.6, F + 0.02);
  // awning: a striped slope over the window, with a valance
  for (let x = -1.25; x <= 1.25 + 1e-6; x += 0.25) polyline(a, [[x, 0.12, F], [x, -0.02, F + 0.55]], 40, 0.008);
  polyline(a, [[-1.25, -0.02, F + 0.55], [1.25, -0.02, F + 0.55]], 60, 0.01);
  polyline(a, [[-1.25, -0.12, F + 0.55], [1.25, -0.12, F + 0.55]], 40, 0.01);
  polyline(a, [[-1.25, 0.12, F], [1.25, 0.12, F]], 60, 0.01);
  // sign band and the word itself
  polyline(a, [[-1.2, 0.2, F], [1.2, 0.2, F], [1.2, 0.5, F], [-1.2, 0.5, F], [-1.2, 0.2, F]], 50, 0.01);
  sign(a, 'BAKERY', -0.7, 0.24, F + 0.02, 0.22);
  // upper windows
  for (const x of [-0.65, 0.65]) polyline(a, [[x - 0.25, 0.6, F], [x + 0.25, 0.6, F], [x + 0.25, 0.9, F], [x - 0.25, 0.9, F], [x - 0.25, 0.6, F]], 50, 0.01);
  // lit interior: the window glass fills with light as the ovens run, and the oven itself glows deep inside
  const n0 = a.length / 3;
  const fills = [];
  for (let i = 0; i < n0; i++) fills.push(0);
  for (let i = 0; i < 300; i++) { push(a, -1.1 + Math.random() * 1.5, -0.72 + Math.random() * 0.58, F - 0.02 - Math.random() * 0.25); fills.push(0.15 + Math.random() * 0.85); }
  for (let i = 0; i < 140; i++) { const r = Math.random() * 0.3; const t = Math.random() * 6.283; push(a, -0.35 + Math.cos(t) * r, -0.5 + rnd(0.2), 0.15 + Math.sin(t) * r); fills.push(Math.random() * 0.3); }
  return { positions: Float32Array.from(a), fills: Float32Array.from(fills) };
}

export function steam() {
  // Rising steam above the bakery chimney; animated by phase in the material's breathing.
  const a = [];
  for (let i = 0; i < 140; i++) {
    const t = Math.random();
    push(a, 0.8 + rnd(0.15 + t * 0.35), 1.2 + t * 1.6, -0.4 + rnd(0.15 + t * 0.3));
  }
  return { positions: Float32Array.from(a) };
}

/**
 * The home battery is a wall unit: a tall slab with an inset panel, a bolt,
 * and six bars that fill from the bottom with its state of charge.
 */
export function battery() {
  const a = [];
  box(a, 1.0, 1.9, 0.28, 0, 0, 0, 52);
  const F = 0.15;
  polyline(a, [[-0.4, -0.82, F], [0.4, -0.82, F], [0.4, 0.82, F], [-0.4, 0.82, F], [-0.4, -0.82, F]], 44, 0.008);
  // bolt
  polyline(a, [[-0.12, 0.5, F + 0.02], [-0.4, 0.02, F + 0.02], [-0.2, 0.02, F + 0.02], [-0.34, -0.5, F + 0.02], [-0.02, 0.1, F + 0.02], [-0.22, 0.1, F + 0.02], [-0.12, 0.5, F + 0.02]], 90, 0.006);
  const n0 = a.length / 3;
  const fills = [];
  for (let i = 0; i < n0; i++) fills.push(0);
  // charge bars: six segments, each lit when the state of charge reaches it
  for (let k = 0; k < 6; k++) {
    const y = -0.62 + k * 0.245;
    for (let i = 0; i < 46; i++) { push(a, 0.08 + Math.random() * 0.26, y + Math.random() * 0.17, F + 0.02 + rnd(0.01)); fills.push(k / 6 + 0.02); }
  }
  return { positions: Float32Array.from(a), fills: Float32Array.from(fills) };
}

export function sun() {
  const a = [];
  ring(a, 0, 0, 0, 0.9, 90, 'z', 0.03);
  for (let i = 0; i < 260; i++) {
    const r = Math.sqrt(Math.random()) * 0.8;
    const ang = Math.random() * Math.PI * 2;
    push(a, Math.cos(ang) * r, Math.sin(ang) * r, rnd(0.1));
  }
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    polyline(a, [[Math.cos(ang) * 1.1, Math.sin(ang) * 1.1, 0], [Math.cos(ang) * 1.5, Math.sin(ang) * 1.5, 0]], 30);
  }
  return { positions: Float32Array.from(a) };
}

export function substation() {
  const a = [];
  // a pylon: two tapering frames
  for (const z of [-0.35, 0.35]) {
    polyline(a, [[-0.9, -2.2, z], [-0.25, 2.2, z], [0.25, 2.2, z], [0.9, -2.2, z]], 34, 0.02);
    for (let y = -1.6; y < 2.2; y += 0.6) {
      const w = 0.9 - (y + 2.2) / 4.4 * 0.65;
      polyline(a, [[-w, y, z], [w, y, z]], 30, 0.015);
    }
  }
  // cross arms
  polyline(a, [[-1.6, 1.2, 0], [1.6, 1.2, 0]], 40, 0.02);
  polyline(a, [[-1.2, 0.3, 0], [1.2, 0.3, 0]], 40, 0.02);
  return { positions: Float32Array.from(a) };
}

export function capacityRing() {
  const a = [];
  ring(a, 0, 0, 0, 2.6, 180, 'y', 0.03);
  ring(a, 0, 0, 0, 2.7, 120, 'y', 0.05);
  const positions = Float32Array.from(a);
  const fills = new Float32Array(positions.length / 3);
  // fill = angle fraction, so the ring "fills up" as the cable loads
  for (let i = 0; i < fills.length; i++) {
    const ang = Math.atan2(positions[i * 3 + 2], positions[i * 3]);
    fills[i] = (ang + Math.PI) / (Math.PI * 2);
  }
  return { positions, fills };
}

export function street() {
  const a = [];
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 1.35;
    const h = 0.9 + (k % 2) * 0.25;
    box(a, 1.0, h, 1.0, x, -0.4, 0, 22);
    polyline(a, [[x - 0.55, -0.4 + h / 2, 0.5], [x, 0.15 + h / 2, 0.5], [x + 0.55, -0.4 + h / 2, 0.5]], 22);
    polyline(a, [[x - 0.55, -0.4 + h / 2, -0.5], [x, 0.15 + h / 2, -0.5], [x + 0.55, -0.4 + h / 2, -0.5]], 22);
    polyline(a, [[x, 0.15 + h / 2, 0.5], [x, 0.15 + h / 2, -0.5]], 22);
    // windows
    for (let i = 0; i < 24; i++) push(a, x + rnd(0.3), -0.45 + rnd(0.2), 0.52);
  }
  return { positions: Float32Array.from(a) };
}

export function score() {
  // The orchestra's "score": a faint lattice ring that information flows to.
  const a = [];
  for (let k = 0; k < 3; k++) ring(a, 0, k * 0.12 - 0.12, 0, 1.6 + k * 0.08, 140, 'y', 0.02);
  for (let k = 0; k < 24; k++) {
    const ang = (k / 24) * Math.PI * 2;
    polyline(a, [[Math.cos(ang) * 1.4, -0.3, Math.sin(ang) * 1.4], [Math.cos(ang) * 1.4, 0.3, Math.sin(ang) * 1.4]], 20, 0.01);
  }
  return { positions: Float32Array.from(a) };
}

export function grid() {
  // The wider grid: a distant lattice of faint points.
  const a = [];
  for (let i = 0; i < 420; i++) { const x = rnd(3.2); push(a, x, rnd(1.2) * (1 - Math.abs(x) / 4), rnd(0.8)); }
  return { positions: Float32Array.from(a) };
}
