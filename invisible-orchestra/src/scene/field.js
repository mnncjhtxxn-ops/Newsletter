import * as THREE from 'three';
import { Ribbon } from './ribbons.js';

/**
 * The ambient field: long, dim strands of light that drift through the
 * whole space so the sculpture reads as living even when nothing is
 * being decided. They slow to a near-stop when time is frozen.
 */
export class Field {
  constructor(scene, count = 8, perStrand = 100) {
    this.group = new THREE.Group();
    this.ribbons = [];
    const R = (a) => (Math.random() * 2 - 1) * a;
    for (let k = 0; k < count; k++) {
      // endpoints on a shell around the viewer, so strands pass close by and far away
      const shell = () => { const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 19; return new THREE.Vector3(Math.sin(a) * r, R(6) + 1, -Math.cos(a) * r); };
      const from = shell(), to = shell();
      const rb = new Ribbon({ from, to, color: k % 3 === 0 ? '#3aa7a0' : k % 3 === 1 ? '#2f6fa8' : '#3f8f6a', colorHot: '#9de2ff', bulge: 3 + Math.random() * 5, width: 1.2, maxKw: 1, count: perStrand, seed: k * 3.7 });
      rb.flow = 0.35 + Math.random() * 0.5;
      rb.mat.uniforms.uSize.value = 0.55;
      rb.mat.uniforms.uActivity.value = 0.25;
      this.group.add(rb.points);
      this.ribbons.push(rb);
    }
    scene.add(this.group);
  }

  update(dt, timeScale, dim = 1) {
    for (const rb of this.ribbons) rb.update(dt, 0.35 + 0.65 * timeScale, { dim: 0.35 * dim });
  }

  dispose() {
    for (const rb of this.ribbons) rb.dispose();
  }
}
