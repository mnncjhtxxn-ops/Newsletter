import * as THREE from 'three';
import { fitDrawingBuffer, PROFILES } from './governor.js';

/**
 * Renderer under a pixel budget: the drawing buffer is fitted to the
 * profile's maximum pixels with devicePixelRatio counted exactly once,
 * while the HTML text layer stays at native resolution. The buffer is
 * resized only when the window or the profile changes, never per frame.
 */
export function createRenderer(canvas, { profile = 'balanced' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.setClearColor(0x05070f, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070f, 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 0.4, 0);
  const state = { profile: PROFILES[profile] ? profile : 'balanced', width: 1, height: 1, pixelRatio: 1, bufferWidth: 1, bufferHeight: 1, camZ: 30 };

  function resize() {
    // The canvas is CSS-sized to the viewport (position: fixed; inset: 0), so the
    // window is the source of truth. Reading clientWidth back would return whatever
    // size the previous resize left, which broke landscape → portrait transitions.
    const w = window.innerWidth || canvas.clientWidth;
    const h = window.innerHeight || canvas.clientHeight;
    state.width = w;
    state.height = h;
    const fit = fitDrawingBuffer(w, h, window.devicePixelRatio || 1, PROFILES[state.profile]);
    state.pixelRatio = fit.scale; // used by the point-size shader; DPR is applied here exactly once
    state.bufferWidth = fit.width;
    state.bufferHeight = fit.height;
    renderer.setPixelRatio(1);
    renderer.setSize(fit.width, fit.height, false);
    camera.aspect = w / h;
    // keep the whole constellation in view on narrow screens
    const aspect = w / h;
    camera.fov = aspect < 1 ? 80 : aspect < 1.4 ? 66 : 58;
    state.camZ = 0;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer, scene, camera, state, resize,
    setProfile(name) { if (PROFILES[name]) { state.profile = name; resize(); } },
    render() { renderer.render(scene, camera); },
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); },
  };
}
