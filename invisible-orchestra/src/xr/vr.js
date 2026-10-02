import * as THREE from 'three';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
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
const BATON_LENGTH = 0.34; // metres from the hand to the glowing tip

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
    // conflict and permission cards: the yellow and red cards of the kiosk, in the room
    this.cards = new VRPanel({ width: 0.85, accent: 'rgba(255, 209, 102, 0.6)' });
    R.scene.add(this.cards.mesh);
    this.cardsKey = null;
    // a beacon ring for the guide, around the object the prompt points at
    this.beacon = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: 0xbff5ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beacon.rotation.x = Math.PI / 2;
    this.beacon.visible = false;
    R.scene.add(this.beacon);
    this.guideStep = 0;
    this.handFactory = new XRHandModelFactory();
    this.tips = [];
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
      this.dressController(c);
      this.rig.add(c);
      this.controllers.push(c);
      // tracked hands, drawn as spheres at the joints (procedural: nothing to download)
      try {
        const hand = r.xr.getHand(i);
        hand.add(this.handFactory.createHandModel(hand, 'spheres'));
        this.rig.add(hand);
      } catch (e) { /* no hand tracking on this device */ }
    }
    session.addEventListener('end', () => this.onEnd());
    this.h.onSession?.(true);
  }

  /** A baton for each controller: a tapered white wand with a glowing tip; the ray leaves the tip. */
  dressController(c) {
    const baton = this.makeBaton();
    c.add(baton);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const line = new THREE.Line(geo, this.rayMat); line.scale.z = 12;
    const tip = new THREE.Group(); tip.position.z = -BATON_LENGTH; tip.add(line); c.add(tip);
    c.userData.line = line; c.userData.tip = tip; c.userData.lastTip = null;
  }
  makeBaton() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.006, BATON_LENGTH - 0.06, 10), new THREE.MeshBasicMaterial({ color: 0xf2f6ff }));
    shaft.rotation.x = Math.PI / 2; shaft.position.z = -(BATON_LENGTH - 0.06) / 2 - 0.06; g.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.06, 10), new THREE.MeshBasicMaterial({ color: 0x1b2233 }));
    grip.rotation.x = Math.PI / 2; grip.position.z = -0.03; g.add(grip);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbff5ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    tip.position.z = -BATON_LENGTH; g.add(tip);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5bd38c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.z = -BATON_LENGTH; g.add(glow);
    g.userData.tip = tip; g.userData.glow = glow;
    return g;
  }

  exit() { this.session?.end(); }

  onEnd() {
    this.presenting = false;
    this.session = null;
    for (const c of this.controllers) this.rig.remove(c);
    this.controllers = [];
    this.R.renderer.xr.enabled = false;
    this.rig.remove(this.R.camera);
    this.panel.hide(); this.card.hide(); this.cards.hide(); this.beacon.visible = false; this.reticle.visible = false;
    this.active = null;
    this.h.onSession?.(false);
  }

  /* ---------------- the ray ---------------- */

  rayFrom(controller) {
    this.tmpM.identity().extractRotation(controller.matrixWorld);
    this.ray.ray.direction.set(0, 0, -1).applyMatrix4(this.tmpM).normalize();
    this.ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    if (controller.userData.tip) this.ray.ray.origin.addScaledVector(this.ray.ray.direction, BATON_LENGTH);
    return this.ray;
  }

  /** What a ray points at: the panel first, then an object, then the ring, else nothing. */
  probe(ray) {
    for (const pnl of [this.panel, this.cards, this.card]) {
      if (!pnl.mesh.visible) continue;
      const hit = ray.intersectObject(pnl.mesh, false)[0];
      if (hit) return { kind: 'panel', panel: pnl, point: hit.point, element: pnl.hit(hit.uv), dist: hit.distance };
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
    if (hit.kind === 'panel') { this.active = { kind: 'panel', controller }; if (hit.element) this.h.onPanel?.(hit.element, hit.panel === this.cards ? 'cards' : hit.panel === this.card ? 'card' : 'panel'); return; }
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
    if (!c.userData.tip && !this.controllers.length) { c.userData.tip = null; }
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
  update({ eye, ridePos, riding, revealId, dt }) {
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
    // the cards: conflicts and a pending request, drawn when they change
    const cm = this.h.cardsModel?.();
    if (cm && cm.key !== this.cardsKey) {
      this.cardsKey = cm.key;
      if (cm.model) {
        this.cards.render(cm.model);
        const head = this.headPosition();
        const toward = revealId ? this.h.nodes.get(revealId).world : head.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(this.headQuaternion()).setY(0).normalize().multiplyScalar(3));
        this.cards.place(head, toward, 2.0, 0.05);
        // beside the decision panel when one is open: rotate 38° to the left around the head
        if (revealId) { const v = this.cards.mesh.position.clone().sub(head); v.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.66); this.cards.mesh.position.copy(head).add(v); this.cards.mesh.lookAt(head.x, this.cards.mesh.position.y, head.z); }
      } else this.cards.hide();
    }
    // the beacon breathes
    if (this.beacon.visible) { const s = 1 + 0.08 * Math.sin(performance.now() * 0.0025); this.beacon.scale.set(s, s, s); this.beacon.material.opacity = 0.35 + 0.3 * Math.sin(performance.now() * 0.0025); }
    // rays, hover, and the baton's flourishes
    let hot = null;
    const dtS = Math.max(0.001, dt || 0.016);
    for (const c of this.controllers) {
      const hit = this.pointerFrame(c);
      const line = c.userData.line;
      if (line) { line.material = hit.kind === 'none' ? this.rayMat : this.rayHotMat; line.scale.z = hit.kind === 'none' ? 12 : Math.max(0.05, hit.dist); }
      if (hit.kind !== 'none') hot = hit;
      if (hit.kind === 'panel') hit.panel.setHover(hit.element);
      // a quick sideways flick of the tip, with nothing pinched, is a flourish: a glissando the way the hand goes
      const tipPos = new THREE.Vector3().setFromMatrixPosition(c.userData.tip ? c.userData.tip.matrixWorld : c.matrixWorld);
      const last = c.userData.lastTip;
      if (last && !this.active) {
        const v = tipPos.clone().sub(last).multiplyScalar(1 / dtS);
        const speed = v.length();
        if (speed > 1.3) {
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.headQuaternion());
          const lateral = v.dot(right);
          if (Math.abs(lateral) > 0.6 * speed) this.h.onFlourish?.(Math.sign(lateral), Math.min(1, (speed - 1.3) / 2.5));
        }
      }
      c.userData.lastTip = tipPos;
    }
    if (hot) { this.reticle.visible = true; this.reticle.position.copy(hot.point); } else this.reticle.visible = false;
    if (!this.controllers.some((c) => this.probe(this.rayFrom(c)).kind === 'panel')) { this.panel.setHover(null); this.cards.setHover(null); this.card.setHover(null); }
  }

  headQuaternion() {
    const cam = this.R.renderer.xr.isPresenting ? this.R.renderer.xr.getCamera() : this.R.camera;
    return new THREE.Quaternion().setFromRotationMatrix(cam.matrixWorld);
  }

  /**
   * The guided first minute, in the room: a card near the anchor object with a
   * breathing ring around it. step 0 hides everything; a step without an anchor
   * (the panel note) hides the card but keeps nothing else.
   */
  guide(step, anchorWorld, title, sub, kicker) {
    this.guideStep = step;
    if (!step || !anchorWorld) { this.card.hide(); this.beacon.visible = false; return; }
    this.card.render({ eyebrow: kicker || 'Start here', promise: title, layers: [{ head: 'How', text: sub }], controls: [], footer: [] });
    const head = this.headPosition();
    this.card.place(head, anchorWorld, 2.4, 0.35);
    this.beacon.position.copy(anchorWorld);
    this.beacon.visible = true;
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
