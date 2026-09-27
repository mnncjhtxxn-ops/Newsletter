/**
 * Point-cloud shapes: every recognisable object in the sculpture is formed
 * from light. Each generator returns { positions: Float32Array, fills?: Float32Array }
 * in local units (roughly 1 = 1 metre of sculpture space).
 */

const rnd = (a = 1) => (Math.random() * 2 - 1) * a;

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

export function car() {
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

export function house() {
  const a = [];
  box(a, 1.8, 1.3, 1.6, 0, -0.35, 0, 30);
  // roof
  const r = [[-1.0, 0.3, 0.9], [0, 1.15, 0.9], [1.0, 0.3, 0.9]];
  const rb = [[-1.0, 0.3, -0.9], [0, 1.15, -0.9], [1.0, 0.3, -0.9]];
  polyline(a, r, 30); polyline(a, rb, 30);
  polyline(a, [r[1], rb[1]], 30);
  // chimney
  box(a, 0.22, 0.5, 0.22, 0.55, 1.0, -0.3, 30);
  // window
  polyline(a, [[-0.55, -0.15, 0.81], [-0.15, -0.15, 0.81], [-0.15, -0.55, 0.81], [-0.55, -0.55, 0.81], [-0.55, -0.15, 0.81]], 40);
  // warmth: a soft core inside the room (fill = height so warmth "rises")
  const n0 = a.length / 3;
  for (let i = 0; i < 380; i++) push(a, rnd(0.7), -0.9 + Math.random() * 1.1, rnd(0.6));
  const positions = Float32Array.from(a);
  const fills = new Float32Array(positions.length / 3);
  for (let i = n0; i < fills.length; i++) fills[i] = (positions[i * 3 + 1] + 0.9) / 1.1;
  return { positions, fills };
}

export function bakery() {
  const a = [];
  box(a, 2.6, 1.5, 1.6, 0, -0.25, 0, 30);
  // awning ridge and a big front window
  polyline(a, [[-1.3, 0.2, 0.85], [1.3, 0.2, 0.85]], 40);
  polyline(a, [[-1.0, -0.1, 0.81], [1.0, -0.1, 0.81], [1.0, -0.85, 0.81], [-1.0, -0.85, 0.81], [-1.0, -0.1, 0.81]], 36);
  // oven chimney
  box(a, 0.3, 0.7, 0.3, 0.8, 0.85, -0.4, 30);
  // oven glow inside (fills drive brightness with oven power)
  const n0 = a.length / 3;
  for (let i = 0; i < 300; i++) push(a, rnd(0.9), -0.8 + Math.random() * 0.8, rnd(0.6));
  const positions = Float32Array.from(a);
  const fills = new Float32Array(positions.length / 3);
  for (let i = n0; i < fills.length; i++) fills[i] = Math.random();
  return { positions, fills };
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

export function battery() {
  const a = [];
  // a standing cell: two rings and vertical lines, plus a cap
  ring(a, 0, -0.9, 0, 0.55, 60, 'y');
  ring(a, 0, 0.9, 0, 0.55, 60, 'y');
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    polyline(a, [[Math.cos(ang) * 0.55, -0.9, Math.sin(ang) * 0.55], [Math.cos(ang) * 0.55, 0.9, Math.sin(ang) * 0.55]], 24, 0.015);
  }
  ring(a, 0, 1.05, 0, 0.2, 20, 'y');
  const n0 = a.length / 3;
  for (let i = 0; i < 520; i++) {
    const r = Math.sqrt(Math.random()) * 0.45;
    const ang = Math.random() * Math.PI * 2;
    push(a, Math.cos(ang) * r, -0.85 + Math.random() * 1.7, Math.sin(ang) * r);
  }
  const positions = Float32Array.from(a);
  const fills = new Float32Array(positions.length / 3);
  for (let i = n0; i < fills.length; i++) fills[i] = (positions[i * 3 + 1] + 0.85) / 1.7;
  return { positions, fills };
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
