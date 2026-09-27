/**
 * Touch model. Exactly three signature gestures:
 *   touch (hold)  → freeze
 *   pull (drag)   → reveal the decision behind the object under the finger
 *   tap           → the same reveal, for visitors who find dragging difficult
 * Only the first active pointer is tracked; a second finger is ignored.
 */
export class Touch {
  constructor(el, { hitRadius = 90 } = {}) {
    this.el = el;
    this.hitRadius = hitRadius;
    this.handlers = {};
    this.active = null;
    this.projected = {};
    const opts = { passive: false };
    el.addEventListener('pointerdown', (e) => this.down(e), opts);
    el.addEventListener('pointermove', (e) => this.move(e), opts);
    el.addEventListener('pointerup', (e) => this.up(e), opts);
    el.addEventListener('pointercancel', (e) => this.up(e), opts);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt, data) { for (const fn of this.handlers[evt] || []) fn(data); }

  /** Called each frame with node screen positions. */
  setProjected(p) { this.projected = p; }

  hit(x, y) {
    let best = null;
    for (const id in this.projected) {
      const p = this.projected[id];
      if (!p.visible || id === 'score' || id === 'grid') continue;
      const d = Math.hypot(p.x - x, p.y - y);
      const r = this.hitRadius * (id === 'wind' || id === 'substation' ? 1.4 : 1);
      if (d < r && (!best || d < best.d)) best = { id, d };
    }
    return best ? best.id : null;
  }

  down(e) {
    if (this.active) return;
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    const x = e.clientX, y = e.clientY;
    this.active = { id: e.pointerId, x0: x, y0: y, x, y, t0: performance.now(), node: this.hit(x, y), pulled: false };
    this.emit('down', { x, y, node: this.active.node });
  }

  move(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    const a = this.active;
    a.x = e.clientX; a.y = e.clientY;
    const dx = a.x - a.x0, dy = a.y - a.y0;
    const dist = Math.hypot(dx, dy);
    this.emit('move', { x: a.x, y: a.y, node: a.node, dist });
    if (a.node && dist > 18) {
      a.pulled = true;
      // progress: how far the decision has been pulled out (towards the viewer = downwards or outwards)
      const progress = Math.min(1, dist / 220);
      this.emit('pull', { node: a.node, progress, x: a.x, y: a.y });
    }
  }

  up(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    const a = this.active;
    this.active = null;
    const dt = performance.now() - a.t0;
    const dist = Math.hypot(a.x - a.x0, a.y - a.y0);
    if (a.pulled) this.emit('pullend', { node: a.node, progress: Math.min(1, dist / 220) });
    else if (dist < 14 && dt < 450) this.emit('tap', { x: a.x, y: a.y, node: a.node });
    this.emit('up', { x: a.x, y: a.y, node: a.node });
  }
}
