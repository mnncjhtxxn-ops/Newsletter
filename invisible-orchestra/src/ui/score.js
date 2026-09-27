import { SLOTS, slotHour, formatClock, SCENARIO, COMFORT_BANDS } from '../sim/scenario.js';

/**
 * The day as a score: one stave per participant, drawn crisp on a 2D
 * canvas. It is the accessible twin of the sculpture — tap a stave to
 * open that participant, drag to move through time — and it is where
 * "the pattern changed" becomes unmistakable after a replay.
 */
const ROWS = [
  { id: 'wind', label: 'wind · sun · price' },
  { id: 'car', label: 'your car' },
  { id: 'home', label: 'your home' },
  { id: 'bakery', label: 'the bakery' },
  { id: 'battery', label: 'battery' },
  { id: 'substation', label: 'the cable' },
];
const LABEL_W = 96;

export class Score {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.sim = null;
    this.ghost = null;
    this.active = null;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const pr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.hgt = r.height; this.pr = pr;
    this.canvas.width = Math.round(r.width * pr);
    this.canvas.height = Math.round(r.height * pr);
    this.ctx.setTransform(pr, 0, 0, pr, 0, 0);
  }

  setSim(sim, ghost) { this.sim = sim; this.ghost = ghost || null; }

  xOf(slot) { return LABEL_W + (slot / SLOTS) * (this.w - LABEL_W - 4); }
  slotOf(x) { return Math.max(0, Math.min(SLOTS - 0.001, ((x - LABEL_W) / (this.w - LABEL_W - 4)) * SLOTS)); }

  down(e) {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const r = this.canvas.getBoundingClientRect();
    this.active = { id: e.pointerId, x0: e.clientX - r.left, y0: e.clientY - r.top, moved: false };
    this.h.onTouch?.();
  }
  move(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (!this.active.moved && Math.abs(x - this.active.x0) > 8) { this.active.moved = true; this.h.onScrubStart?.(); }
    if (this.active.moved) this.h.onScrub?.(this.slotOf(x));
  }
  up(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    const a = this.active; this.active = null;
    if (a.moved) { this.h.onScrubEnd?.(); return; }
    if (a.x0 < LABEL_W - 4 || true) {
      const rowH = this.hgt / ROWS.length;
      const row = ROWS[Math.max(0, Math.min(ROWS.length - 1, Math.floor(a.y0 / rowH)))];
      if (a.x0 >= LABEL_W) this.h.onScrub?.(this.slotOf(a.x0));
      this.h.onTapRow?.(row.id, a.x0 >= LABEL_W);
    }
  }

  draw(slotF, { revealId = null, dimmed = false } = {}) {
    const { ctx, w } = this;
    const H = this.hgt;
    ctx.clearRect(0, 0, w, H);
    if (!this.sim) return;
    const s = this.sim.series;
    const g = this.ghost?.series;
    const rowH = H / ROWS.length;
    const X0 = LABEL_W, X1 = w - 4;
    const band = COMFORT_BANDS[this.sim.promises.home.comfort];
    const limit = SCENARIO.feederLimitKw;

    // stave background and hour ticks
    ctx.fillStyle = 'rgba(8, 12, 26, 0.55)';
    ctx.beginPath(); ctx.roundRect(0, 0, w, H, 12); ctx.fill();
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (let i = 0; i < SLOTS; i += 8) {
      const x = this.xOf(i);
      const h = slotHour(i) % 24;
      ctx.strokeStyle = h === 0 || h === 12 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, H - 2); ctx.stroke();
      if (i % 16 === 0) { ctx.fillStyle = 'rgba(238,243,255,0.35)'; ctx.fillText(formatClock(h), x + 3, 3); }
    }
    // night shading
    const nx0 = this.xOf(16), nx1 = this.xOf(52);
    ctx.fillStyle = 'rgba(30, 50, 110, 0.10)';
    ctx.fillRect(nx0, 0, nx1 - nx0, H);

    const bar = (row, arr, color, maxV, opts = {}) => {
      const y0 = row * rowH, y1 = (row + 1) * rowH;
      const base = opts.centered ? (y0 + y1) / 2 : y1 - 2;
      const scale = (opts.centered ? (rowH / 2 - 2) : (rowH - 6)) / maxV;
      ctx.fillStyle = color;
      for (let i = 0; i < SLOTS; i++) {
        const v = arr[i];
        if (Math.abs(v) < 1e-6) continue;
        const x = this.xOf(i), x2 = this.xOf(i + 1);
        const hgt = v * scale;
        if (opts.colorFn) ctx.fillStyle = opts.colorFn(i, v);
        ctx.fillRect(x, base - Math.max(0, hgt), Math.max(1, x2 - x - 0.5), Math.abs(hgt));
      }
    };
    const line = (row, arr, color, minV, maxV, width = 1.2, dash) => {
      const y0 = row * rowH + 3, y1 = (row + 1) * rowH - 3;
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      for (let i = 0; i < SLOTS; i++) {
        const t = (arr[i] - minV) / (maxV - minV);
        const x = this.xOf(i + 0.5), y = y1 - t * (y1 - y0);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    };
    const ghostBar = (row, arr, maxV, opts = {}) => {
      if (!g) return;
      ctx.save(); ctx.globalAlpha = 0.5;
      bar(row, arr, 'rgba(255,255,255,0.10)', maxV, opts);
      ctx.restore();
    };

    // row 0: wind, sun, price
    bar(0, s.wind, 'rgba(91, 211, 140, 0.35)', 60);
    bar(0, s.solar, 'rgba(255, 209, 102, 0.35)', 60);
    line(0, s.price, 'rgba(238,243,255,0.5)', 0, 34, 1.2, [3, 3]);
    // row 1: car — colour by how much wind was available at the moment
    ghostBar(1, g?.ev || [], 7);
    bar(1, s.ev, '', 7, { colorFn: (i) => { const f = s.renewFrac[i]; return `rgba(${Math.round(124 + (91 - 124) * f)}, ${Math.round(216 + (211 - 216) * f)}, ${Math.round(255 + (140 - 255) * f)}, 0.9)`; } });
    // row 2: home — heat bars and temperature within the band
    ghostBar(2, g?.heat || [], 3);
    bar(2, s.heat, 'rgba(255, 179, 107, 0.6)', 3);
    line(2, s.temp, 'rgba(255, 240, 214, 0.9)', band.low - 0.5, band.high + 0.5, 1.4);
    // row 3: bakery
    ghostBar(3, g?.ovens.map((v, i) => v + g.cold[i]) || [], 38);
    bar(3, s.ovens, 'rgba(255, 154, 122, 0.55)', 38);
    bar(3, s.cold.map((v, i) => v + s.ovens[i]), 'rgba(255, 154, 122, 0.0)', 38, { colorFn: (i, v) => (s.cold[i] > 0 ? 'rgba(255, 200, 180, 0.7)' : 'rgba(0,0,0,0)') });
    // row 4: battery — up = storing, down = releasing
    bar(4, s.battery, '', 5, { centered: true, colorFn: (i, v) => (v > 0 ? 'rgba(184, 140, 255, 0.75)' : 'rgba(239, 226, 255, 0.55)') });
    // row 5: the cable
    ghostBar(5, g?.feeder.map((v) => Math.max(0, v)) || [], 70);
    bar(5, s.feeder.map((v) => Math.max(0, v)), '', 70, { colorFn: (i, v) => (v > limit ? 'rgba(255, 93, 108, 0.9)' : v > limit * 0.85 ? 'rgba(255, 209, 102, 0.6)' : 'rgba(185, 200, 255, 0.45)') });
    { const y1 = 6 * rowH - 2 - (rowH - 6) * (limit / 70); ctx.strokeStyle = 'rgba(255, 93, 108, 0.6)'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X0, y1); ctx.lineTo(X1, y1); ctx.stroke(); ctx.setLineDash([]); }

    // row labels and separators
    ctx.textBaseline = 'middle';
    for (let r = 0; r < ROWS.length; r++) {
      const y = r * rowH;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      const hot = revealId === ROWS[r].id;
      ctx.fillStyle = hot ? 'rgba(191,245,255,0.95)' : 'rgba(238,243,255,0.45)';
      ctx.font = `${hot ? 600 : 400} 11px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(ROWS[r].label, 10, y + rowH / 2);
      if (hot) { ctx.fillStyle = 'rgba(191,245,255,0.06)'; ctx.fillRect(0, y, w, rowH); }
    }
    // decisions as small ticks
    for (const d of this.sim.decisions) {
      const r = ROWS.findIndex((x) => x.id === (d.node === 'substation' ? 'substation' : d.node));
      if (r < 0) continue;
      const x = this.xOf(d.slot);
      ctx.fillStyle = d.kind === 'ask' ? 'rgba(255,209,102,0.9)' : 'rgba(191,245,255,0.7)';
      ctx.beginPath(); ctx.arc(x, r * rowH + 5, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // playhead
    const px = this.xOf(slotF);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(px, 4, 3, 0, Math.PI * 2); ctx.fill();
    if (dimmed) { ctx.fillStyle = 'rgba(5,7,15,0.35)'; ctx.fillRect(0, 0, w, H); }
  }
}
