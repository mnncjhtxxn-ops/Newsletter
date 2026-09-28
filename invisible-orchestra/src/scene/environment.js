import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { pointsMaterial, makePoints } from './glow.js';

/**
 * The world the sculpture stands in: a dark mirror of water beneath, a pool
 * of rings above, ripple pools under each object, pillars of light rising
 * from the surface, and a hinted landscape of hills and far spires that
 * fades into the dark. Everything is procedural.
 *
 * Costs: the floor reflection re-renders the scene once into a texture
 * (Balanced and Detail only); pools, pillars, ceiling and landscape are one
 * draw call each.
 */
const FLOOR_Y = -3.7;
const CEIL_Y = 12.5;

const POOL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uPhase;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  if (r > 1.0) discard;
  float rings = pow(0.5 + 0.5 * sin(r * 16.0 - uTime * 1.5 - uPhase), 10.0);
  float edge = (1.0 - r) * (1.0 - r);
  float a = rings * edge * 0.9 + pow(1.0 - r, 5.0) * 0.35;
  gl_FragColor = vec4(uColor * (0.8 + 0.4 * rings), a * uIntensity);
}
`;
const POOL_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const CEIL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
varying vec2 vUv;
float ring(vec2 p, vec2 c, float speed, float freq) {
  float r = length(p - c);
  return pow(0.5 + 0.5 * sin(r * freq - uTime * speed), 14.0) * exp(-r * 2.2);
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float a = ring(p, vec2(0.0, 0.05), 0.9, 34.0);
  float b = ring(p, vec2(-0.55, -0.3), 0.7, 28.0);
  float c = ring(p, vec2(0.6, -0.25), 1.1, 40.0);
  vec3 col = uA * a + uB * b + uC * c;
  float fade = 1.0 - smoothstep(0.55, 1.0, length(p));
  gl_FragColor = vec4(col, (a + b + c) * 0.6 * fade);
}
`;

const PILLAR_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aCorner;   // x: side (-1..1), y: vertical (0..1)
attribute vec3 aColor;
attribute float aPhase;
attribute float aHeight;
attribute float aWidth;
uniform float uTime;
varying float vV; varying float vSide; varying vec3 vColor; varying float vBreath; varying float vFog;
void main() {
  vec3 toCam = aCenter - cameraPosition;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 pos = aCenter + right * aCorner.x * aWidth + vec3(0.0, aCorner.y * aHeight, 0.0);
  vV = aCorner.y; vSide = aCorner.x; vColor = aColor;
  vBreath = 0.55 + 0.45 * sin(uTime * 0.6 + aPhase * 6.2831);
  vec4 mv = viewMatrix * vec4(pos, 1.0);
  vFog = exp(-max(0.0, -mv.z - 9.0) * 0.03);
  gl_Position = projectionMatrix * mv;
}
`;
const PILLAR_FRAG = /* glsl */ `
uniform float uOpacity;
varying float vV; varying float vSide; varying vec3 vColor; varying float vBreath; varying float vFog;
void main() {
  float vert = smoothstep(0.0, 0.08, vV) * (1.0 - smoothstep(0.45, 1.0, vV));
  float horiz = pow(1.0 - abs(vSide), 1.6);
  float a = vert * horiz * vBreath * uOpacity * vFog;
  gl_FragColor = vec4(vColor * (0.7 + 0.5 * horiz), a);
}
`;

function reflectorShader() {
  return {
    name: 'WaterMirror',
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 }, uEye: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv; varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vUv = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec3 uEye;
      varying vec4 vUv; varying vec3 vWorld;
      void main() {
        // slow ripples disturb the reflection; they fade with distance so the far mirror stays calm
        float d = length(vWorld.xz - uEye.xz);
        float amp = 0.006 * exp(-d * 0.05);
        vec2 rip = vec2(sin(vWorld.x * 0.9 + uTime * 0.7) + sin(vWorld.z * 1.7 - uTime * 0.45), cos(vWorld.z * 1.1 + uTime * 0.6) + sin(vWorld.x * 2.3 + uTime * 0.35)) * amp;
        vec4 uv = vUv; uv.xy += rip * uv.w;
        vec4 base = texture2DProj(tDiffuse, uv);
        // far water settles into the same dark as the sky, so there is no horizon line
        float fall = exp(-d * 0.035);
        vec3 bg = vec3(0.0196, 0.0275, 0.0588);
        vec3 col = bg + base.rgb * 0.52 * fall + vec3(0.0, 0.01, 0.025) * fall;
        gl_FragColor = vec4(col, 1.0);
      }`,
  };
}

export class Environment {
  constructor(scene, { reflection = true, reflectionSize = 1024 } = {}) {
    this.group = new THREE.Group();
    this.time = 0;
    // ---- floor: a dark mirror of water ----
    const floorGeo = new THREE.PlaneGeometry(600, 600);
    if (reflection) {
      this.floor = new Reflector(floorGeo, { textureWidth: reflectionSize, textureHeight: reflectionSize, clipBias: 0.003, shader: reflectorShader() });
      this.floorUniforms = this.floor.material.uniforms;
    } else {
      const m = new THREE.MeshBasicMaterial({ color: 0x05070f });
      this.floor = new THREE.Mesh(floorGeo, m);
      this.floorUniforms = null;
    }
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = FLOOR_Y;
    this.group.add(this.floor);

    // ---- ceiling: a pool of rings above ----
    this.ceilMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color('#26bf64') }, uB: { value: new THREE.Color('#0792e5') }, uC: { value: new THREE.Color('#e3850d') } },
      vertexShader: POOL_VERT, fragmentShader: CEIL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), this.ceilMat);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = CEIL_Y;
    this.group.add(ceil);

    // ---- pools under objects ----
    this.pools = {};
    // ---- pillars ----
    this.pillarDefs = [];
    this.pillars = null;
    // ---- landscape ----
    this.buildLandscape();
    // ---- bokeh ----
    this.buildBokeh();
    scene.add(this.group);
  }

  /** Call once nodes exist: a ripple pool and a pillar of light under each. */
  attach(nodes, hourMarks) {
    for (const id in nodes.byId) {
      const n = nodes.byId[id];
      if (id === 'score' || id === 'grid' || id === 'sun') continue;
      const radius = id === 'street' ? 4.5 : id === 'wind' ? 3.4 : 3.2;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(n.def.color) }, uTime: { value: 0 }, uIntensity: { value: 0.5 }, uPhase: { value: Math.random() * 6.28 } },
        vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(n.world.x, FLOOR_Y + 0.02, n.world.z);
      this.group.add(mesh);
      this.pools[id] = { mesh, mat, target: 0.5 };
      this.pillarDefs.push({ x: n.world.x, z: n.world.z, h: id === 'wind' ? 12 : 6.5, w: 0.5, color: n.def.color, phase: Math.random() });
    }
    for (const mk of hourMarks) this.pillarDefs.push({ x: mk.pos.x, z: mk.pos.z, h: 4.5, w: 0.22, color: '#dfe7ff', phase: Math.random() });
    // ambient pillars out in the landscape
    const palette = ['#26bf64', '#0792e5', '#e3850d', '#5bd38c', '#a678ff'];
    let s = 12345;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2, r = 18 + rnd() * 26;
      this.pillarDefs.push({ x: Math.sin(a) * r, z: -Math.cos(a) * r, h: 3 + rnd() * 10, w: 0.15 + rnd() * 0.35, color: palette[Math.floor(rnd() * palette.length)], phase: rnd() });
    }
    this.buildPillars();
  }

  buildPillars() {
    const N = this.pillarDefs.length;
    const center = new Float32Array(N * 4 * 3), corner = new Float32Array(N * 4 * 2), color = new Float32Array(N * 4 * 3);
    const phase = new Float32Array(N * 4), height = new Float32Array(N * 4), width = new Float32Array(N * 4);
    const idx = [];
    const c = new THREE.Color();
    this.pillarDefs.forEach((d, i) => {
      c.set(d.color);
      const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        center.set([d.x, FLOOR_Y, d.z], v * 3); corner.set(corners[k], v * 2); color.set([c.r, c.g, c.b], v * 3);
        phase[v] = d.phase; height[v] = d.h; width[v] = d.w;
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3)); // unused; required by three
    g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aHeight', new THREE.BufferAttribute(height, 1));
    g.setAttribute('aWidth', new THREE.BufferAttribute(width, 1));
    g.setIndex(idx);
    this.pillarMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.55 } }, vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.pillars = new THREE.Mesh(g, this.pillarMat);
    this.pillars.frustumCulled = false;
    this.group.add(this.pillars);
  }

  buildLandscape() {
    let s = 777;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const hill = (a) => 2.2 + 2.6 * Math.sin(a * 3 + 1.1) + 1.8 * Math.sin(a * 7.3 + 2.4) + 1.1 * Math.sin(a * 13.7 + 0.6) + 0.7 * Math.sin(a * 23 + 4);
    const pts = [];
    // hills: a dense edge plus a sparse body below it
    for (let i = 0; i < 2200; i++) {
      const a = rnd() * Math.PI * 2, r = 22 + rnd() * 18;
      const h = Math.max(0.6, hill(a) * (0.7 + 0.3 * Math.sin(r * 0.4)));
      const edge = rnd() < 0.45;
      const y = edge ? FLOOR_Y + h + (rnd() - 0.5) * 0.5 : FLOOR_Y + Math.pow(rnd(), 1.8) * h;
      pts.push(Math.sin(a) * r, y, -Math.cos(a) * r);
    }
    // far spires: a hinted skyline
    for (let k = 0; k < 40; k++) {
      const a = rnd() * Math.PI * 2, r = 30 + rnd() * 12, h = 4 + rnd() * 11, w = 0.15 + rnd() * 0.3;
      const n = 26;
      for (let i = 0; i < n; i++) { const t = i / n; pts.push(Math.sin(a) * r + (rnd() - 0.5) * w, FLOOR_Y + t * h, -Math.cos(a) * r + (rnd() - 0.5) * w); }
    }
    this.landMat = pointsMaterial({ color: '#3a9aae', colorHot: '#a8e0ff', size: 0.55, opacity: 0.9 });
    this.landMat.uniforms.uBreath.value = 0.01;
    this.landMat.uniforms.uActivity.value = 0.3;
    this.land = makePoints(Float32Array.from(pts), this.landMat);
    this.group.add(this.land);
  }

  buildBokeh() {
    const pts = [];
    let s = 99;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 22; i++) { const a = rnd() * Math.PI * 2, r = 1.6 + rnd() * 3.2; pts.push(Math.sin(a) * r, -1.5 + rnd() * 3, -Math.cos(a) * r); }
    this.bokehMat = pointsMaterial({ color: '#3fbf7a', colorHot: '#ffb36b', size: 40, opacity: 0.05 });
    this.bokehMat.uniforms.uMaxSize.value = 150;
    this.bokehMat.uniforms.uBreath.value = 0.35;
    this.bokehMat.uniforms.uActivity.value = 0.5;
    this.bokeh = makePoints(Float32Array.from(pts), this.bokehMat);
    this.group.add(this.bokeh);
  }

  /** activities: { nodeId: 0..1 } */
  update(dt, time, eye, activities, dim = 1) {
    this.time = time;
    if (this.floorUniforms) { this.floorUniforms.uTime.value = time; this.floorUniforms.uEye.value.copy(eye); }
    this.ceilMat.uniforms.uTime.value = time;
    if (this.pillarMat) { this.pillarMat.uniforms.uTime.value = time; this.pillarMat.uniforms.uOpacity.value = 0.55 * dim; }
    for (const id in this.pools) {
      const p = this.pools[id];
      p.mat.uniforms.uTime.value = time;
      const target = (0.25 + 0.75 * (activities[id] ?? 0.3)) * dim;
      p.mat.uniforms.uIntensity.value += (target - p.mat.uniforms.uIntensity.value) * Math.min(1, dt * 3);
    }
    this.landMat.uniforms.uTime.value = time;
    this.landMat.uniforms.uOpacity.value = 0.9 * dim;
    this.bokehMat.uniforms.uTime.value = time * 0.3;
  }

  materials() { return [this.landMat, this.bokehMat]; }

  dispose() {
    this.floor.geometry.dispose(); this.floor.material.dispose(); if (this.floor.dispose) this.floor.dispose();
    this.ceilMat.dispose(); this.pillarMat?.dispose(); this.pillars?.geometry.dispose();
    for (const id in this.pools) { this.pools[id].mesh.geometry.dispose(); this.pools[id].mat.dispose(); }
    this.land.geometry.dispose(); this.landMat.dispose(); this.bokeh.geometry.dispose(); this.bokehMat.dispose();
  }
}
