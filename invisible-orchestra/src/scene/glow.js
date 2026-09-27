import * as THREE from 'three';

/** A soft radial sprite, drawn procedurally so no image assets are needed. */
export function makeGlowTexture(size = 64, inner = 0.0, falloff = 1.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18 + inner, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, `rgba(255,255,255,${0.22 * falloff})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const VERT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uTouch;
uniform float uTouchR;
uniform float uTouchStrength;
uniform float uBreath;
uniform float uSpread;
uniform float uHalo;
attribute float aPhase;
attribute float aSize;
attribute float aFill;
varying float vTwinkle;
varying float vFill;
varying float vNear;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Breathing: a slow, tiny drift so the object feels alive.
  world.xyz += vec3(sin(uTime * 0.7 + aPhase * 6.2831), cos(uTime * 0.5 + aPhase * 4.0), sin(uTime * 0.6 + aPhase * 2.0)) * uBreath;
  // Ripple: the scene opens around the visitor's finger.
  vec3 d = world.xyz - uTouch;
  float dist = length(d);
  float open = smoothstep(uTouchR, 0.0, dist) * uTouchStrength;
  world.xyz += normalize(d + vec3(0.0001)) * open * 1.4 * (0.6 + aSize * 0.6);
  // Spread: exploded-view separation for the revealed node.
  world.xyz += (world.xyz - uTouch) * uSpread * 0.35;
  vNear = smoothstep(uTouchR * 1.6, 0.0, dist);
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uSize * uPixelRatio * (220.0 / max(1.0, -mv.z)) * mix(1.0, 3.8, uHalo);
  vTwinkle = 0.55 + 0.45 * sin(uTime * 1.7 + aPhase * 12.566);
  vFill = aFill;
}
`;

export const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform vec3 uColorHot;
uniform float uOpacity;
uniform float uActivity;
uniform float uFillLevel;
uniform float uHalo;
varying float vTwinkle;
varying float vFill;
varying float vNear;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  float filled = step(vFill, uFillLevel);
  vec3 col = mix(uColor, uColorHot, uActivity * 0.85);
  float a = t.a * uOpacity * (0.35 + 0.65 * vTwinkle) * (0.35 + 0.65 * filled) * (0.55 + 0.45 * uActivity + vNear * 0.6);
  a *= mix(1.0, 0.07 + 0.07 * uActivity, uHalo);
  gl_FragColor = vec4(col * (0.6 + 0.45 * uActivity + vNear * 0.5), a);
}
`;

let sharedTexture = null;
export function pointsMaterial({ color, colorHot, size = 1, opacity = 1 }) {
  if (!sharedTexture) sharedTexture = makeGlowTexture(64);
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: sharedTexture },
      uTime: { value: 0 },
      uSize: { value: size },
      uPixelRatio: { value: 1 },
      uTouch: { value: new THREE.Vector3(0, -999, 0) },
      uTouchR: { value: 0 },
      uTouchStrength: { value: 0 },
      uBreath: { value: 0.02 },
      uSpread: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uColorHot: { value: new THREE.Color(colorHot || color) },
      uOpacity: { value: opacity },
      uActivity: { value: 0.3 },
      uFillLevel: { value: 1 },
      uHalo: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
}

/** A soft, wide halo pass that shares every uniform with its core material. */
export function haloMaterialFrom(core) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...core.uniforms, uHalo: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  core.userData.halo = m;
  return m;
}

/** Attach a halo child to a Points object (shares geometry). */
export function addHalo(points) {
  const halo = new THREE.Points(points.geometry, haloMaterialFrom(points.material));
  halo.frustumCulled = false;
  points.add(halo);
  return halo;
}

/** Build a Points object from a Float32Array of positions. */
export function makePoints(positions, material, fills) {
  const n = positions.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const phase = new Float32Array(n);
  const size = new Float32Array(n);
  const fill = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    phase[i] = Math.random();
    size[i] = 0.55 + Math.random() * 0.9;
    fill[i] = fills ? fills[i] : 0;
  }
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aFill', new THREE.BufferAttribute(fill, 1));
  const pts = new THREE.Points(geo, material);
  pts.frustumCulled = false;
  addHalo(pts);
  return pts;
}
