import * as THREE from 'three';

/**
 * Renderer with an independently adjustable internal resolution: the 3D
 * scene can render below the display's native size while the HTML text
 * layer stays crisp. `scale` defaults from the URL (#scale=0.75) or 1.
 */
export function createRenderer(canvas, { scale = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.setClearColor(0x05070f, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070f, 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 1.5, 30);
  const state = { scale, width: 1, height: 1, pixelRatio: 1, camZ: 30 };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    state.width = w;
    state.height = h;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * state.scale;
    state.pixelRatio = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole constellation in view on narrow screens
    const aspect = w / h;
    camera.fov = aspect < 1 ? 56 : aspect < 1.4 ? 50 : 42;
    state.camZ = aspect < 0.7 ? 64 : aspect < 1 ? 50 : aspect < 1.4 ? 36 : 30;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer, scene, camera, state, resize,
    setScale(s) { state.scale = s; resize(); },
    render() { renderer.render(scene, camera); },
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); },
  };
}
