import * as THREE from 'three';
import { VRPanel } from './panel.js';

/**
 * The conductor's chair: the same sculpture, stood inside with a headset.
 *
 * WebXR immersive VR through three.js. The headset drives the view, so the
 * kiosk's yaw/pitch camera model is replaced by a rig that stands at the eye
 * (or rides the energy). Hands or controllers cast a ray: pinch an object to
 * open its decision on a panel that appears in the room; pinch on the ring
 * and sweep to drive time (the baton); pinch on nothing and hold to stop
 * time. The HTML layer does not exist in a session, so labels and prompts are
 * replaced by the panel and a small card.
 *
 * Status: built and exercised without a headset (the ray logic is driven by
 * simulated rays in tests). It has not been worn. See docs/VR_PROTOTYPE.md.
 */
const HEAD_HEIGHT = 1.6; // local-floor: the floor is y = 0 and a standing head is about here
const RING_PLANE_Y = -2.3;

export class XRMode {
  /**
   * @param R           the renderer bundle from createRenderer
   * @param hooks       { eye, nodes, dayring, onSelectNode(id), onRing(slotF, phase), onHold(phase), onPanel(elementId), panelModel(id), state() }
   */
  constructor(R, hooks) {
    this.R = R;
    this.h = hooks;
    this.session = null;
    this.rig = new THREE.Group();
    this.rig.name = 'xr-rig';
    R.scene.add(this.rig);
    this.rig.position.set(hooks.eye.x, hooks.eye.y - HEAD_HEIGHT, hooks.eye.z);
    this.panel = new VRPanel();
    R.scene.add(this.panel.mesh);
    this.card = new VRPanel({ width: 0.7 });
    R.scene.add(this.card.mesh);
    this.controllers = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 60;
    this.tmp = new THREE.Vector3();
    this.tmpM = new THREE.Matrix4();
    this.active = null; // { kind: 'panel'|'node'|'ring'|'hold', ... } while a select is held
    this.presenting = false;
    this.rayMat = new THREE.LineBasicMaterial({ color: 0xbff5ff, transparent: true, opacity: 0.55 });
    this.rayHotMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.reticle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xbff5ff, transparent: true, opacity: 0.9 }));
    this.reticle.visible = false;
    R.scene.add(this.reticle);
    this.revealId = null;
    this.hitSpheres = {};
    for (const id in hooks.nodes.byId) {
      if (id === 'score' || id === 'grid') continue;
      const n = hooks.nodes.byId[id];
      this.hitSpheres[id] = new THREE.Sphere(n.world.clone(), Math.max(1.4, 1.1 * n.def.scale));
    }
  }

  /** Is an immersive headset available in this browser? */
  static async supported() {
    try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch (e) { return false; }
  }

  async enter() {
    if (this.session) return;
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking', 'bounded-floor'] });
    this.session = session;
    const r = this.R.renderer;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    await r.xr.setSession(session);
    this.presenting = true;
    // the camera rides in the rig only while presenting; on the desktop it is positioned directly
    this.rig.add(this.R.camera);
    for (let i = 0; i < 2; i++) {
      const c = r.xr.getController(i);
      c.userData.index = i;
      c.addEventListener('selectstart', () => this.selectStart(c));
      c.addEventListener('selectend', () => this.selectEnd(c));
      c.addEventListener('connected', (e) => { c.userData.source = e.data; });
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(geo, this.rayMat); line.scale.z = 12; c.add(line); c.userData.line = line;
      this.rig.add(c);
      this.controllers.push(c);
    }
    session.addEventListener('end', () => this.onEnd());
    this.h.onSession?.(true);
    this.showCard('Point at the car and pinch', 'Pinch an object to open its decision. Pinch the ring and sweep to move time. Pinch nothing and hold to stop it.');
  }

  exit() { this.session?.end(); }

  onEnd() {
    this.presenting = false;
    this.session = null;
    for (const c of this.controllers) this.rig.remove(c);
    this.controllers = [];
    this.R.renderer.xr.enabled = false;
    this.rig.remove(this.R.camera);
    this.panel.hide(); this.card.hide(); this.reticle.visible = false;
    this.active = null;
    this.h.onSession?.(false);
  }

  /* ---------------- the ray ---------------- */

  rayFrom(controller) {
    this.tmpM.identity().extractRotation(controller.matrixWorld);
    this.ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.ray.ray.direction.set(0, 0, -1).applyMatrix4(this.tmpM).normalize();
    return this.ray;
  }

  /** What a ray points at: the panel first, then an object, then the ring, else nothing. */
  probe(ray) {
    if (this.panel.mesh.visible) {
      const hit = ray.intersectObject(this.panel.mesh, false)[0];
      if (hit) return { kind: 'panel', point: hit.point, element: this.panel.hit(hit.uv), dist: hit.distance };
    }
    let best = null;
    for (const id in this.hitSpheres) {
      const s = this.hitSpheres[id];
      const p = ray.ray.intersectSphere(s, this.tmp);
      if (p) { const d = p.distanceTo(ray.ray.origin); if (!best || d < best.dist) best = { kind: 'node', id, point: p.clone(), dist: d }; }
    }
    if (best) return best;
    const o = ray.ray.origin, d = ray.ray.direction;
    if (d.y < -1e-4) {
      const t = (RING_PLANE_Y - o.y) / d.y;
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      const r = Math.hypot(px, pz);
      if (r > 7.6 && r < 13.2) {
        const a = Math.atan2(px, -pz);
        let s = ((a - Math.PI) / (Math.PI * 2)) * 96; s = ((s % 96) + 96) % 96;
        return { kind: 'ring', slot: s, point: new THREE.Vector3(px, RING_PLANE_Y, pz), dist: t };
      }
    }
    return { kind: 'none' };
  }

  selectStart(controller) {
    const hit = this.probe(this.rayFrom(controller));
    if (hit.kind === 'panel') { this.active = { kind: 'panel', controller }; if (hit.element) this.h.onPanel?.(hit.element); return; }
    if (hit.kind === 'node') { this.active = { kind: 'node', controller, id: hit.id }; this.h.onSelectNode?.(hit.id); return; }
    if (hit.kind === 'ring') { this.active = { kind: 'ring', controller }; this.h.onRing?.(hit.slot, 'start'); return; }
    this.active = { kind: 'hold', controller };
    this.h.onHold?.('start');
  }

  selectEnd(controller) {
    const a = this.active;
    if (!a || a.controller !== controller) return;
    this.active = null;
    if (a.kind === 'ring') this.h.onRing?.(null, 'end');
    if (a.kind === 'hold') this.h.onHold?.('end');
  }

  /** For tests and the desktop: drive the same logic with a synthetic ray. phase: 'start' | 'move' | 'end' */
  simulate(origin, direction, phase) {
    const c = this.controllers[0] || (this.fake ||= this.makeFake());
    c.position.copy(origin);
    c.lookAt(origin.clone().add(direction));
    c.rotateY(Math.PI); // lookAt points +z at the target; a controller's ray is -z
    c.updateMatrixWorld(true);
    if (phase === 'start') this.selectStart(c);
    else if (phase === 'end') this.selectEnd(c);
    else this.pointerFrame(c);
    return this.probe(this.rayFrom(c));
  }
  makeFake() { const g = new THREE.Group(); this.R.scene.add(g); g.updateMatrixWorld(true); return g; }

  pointerFrame(c) {
    const hit = this.probe(this.rayFrom(c));
    const a = this.active;
    if (a && a.controller === c && a.kind === 'ring' && hit.kind === 'ring') this.h.onRing?.(hit.slot, 'move');
    return hit;
  }

  /** Per rendered frame while presenting. */
  update({ eye, ridePos, riding, revealId }) {
    // the rig: stand at the eye, or ride the energy
    if (riding && ridePos) this.rig.position.set(ridePos.x, ridePos.y - HEAD_HEIGHT, ridePos.z);
    else this.rig.position.set(eye.x, eye.y - HEAD_HEIGHT, eye.z);
    // the panel appears when a decision opens, in front of the visitor at the object's bearing
    if (revealId !== this.revealId) {
      this.revealId = revealId;
      if (revealId) {
        const model = this.h.panelModel(revealId);
        this.panel.render(model);
        const head = this.headPosition();
        this.panel.place(head, this.h.nodes.get(revealId).world, 2.0, -0.2);
        this.card.hide();
      } else this.panel.hide();
    } else if (revealId && this.panelDirty) { this.panel.render(this.h.panelModel(revealId)); this.panelDirty = false; }
    // rays and hover
    let hot = null;
    for (const c of this.controllers) {
      const hit = this.pointerFrame(c);
      const line = c.userData.line;
      if (line) { line.material = hit.kind === 'none' ? this.rayMat : this.rayHotMat; line.scale.z = hit.kind === 'none' ? 12 : hit.dist; }
      if (hit.kind !== 'none') hot = hit;
      if (hit.kind === 'panel') this.panel.setHover(hit.element);
    }
    if (hot) { this.reticle.visible = true; this.reticle.position.copy(hot.point); } else this.reticle.visible = false;
    if (!this.controllers.some((c) => this.probe(this.rayFrom(c)).kind === 'panel')) this.panel.setHover(null);
  }

  headPosition() {
    const cam = this.R.renderer.xr.isPresenting ? this.R.renderer.xr.getCamera() : this.R.camera;
    return new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  }

  refreshPanel() { this.panelDirty = true; }

  showCard(title, text) {
    this.card.render({ eyebrow: 'The conductor\'s chair', promise: title, layers: [{ head: 'How', text }], controls: [], release: 'Begin' });
    const head = this.headPosition();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.R.camera.quaternion);
    this.card.place(head, head.clone().add(fwd), 1.6, -0.1);
  }
}
