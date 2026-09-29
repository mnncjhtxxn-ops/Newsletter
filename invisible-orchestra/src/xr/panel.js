import * as THREE from 'three';

/**
 * A decision panel that lives in the room. Inside a headset there is no HTML,
 * so the reveal panel is drawn onto a canvas and shown on a plane in front
 * of the visitor, and a controller or hand ray hits its buttons by UV.
 *
 * The model it draws is built by main.js from the same explanation and
 * control definitions the HTML panel uses, so the two never disagree:
 *   { eyebrow, promise, layers: [{ head, text }×3],
 *     controls: [{ label, options: [{ id, text, on }] }],
 *     release: 'Release' | 'Replay with this change', note?: string }
 */
const W = 1024, H = 1408;
const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export class VRPanel {
  constructor({ width = 1.05, height = width * (H / W) } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    this.mesh.renderOrder = 50;
    this.mesh.visible = false;
    this.hits = []; // { id, x, y, w, h } in canvas px
    this.hover = null;
    this.model = null;
  }

  /** Draw a model. Buttons become hit rectangles. */
  render(model) {
    this.model = model;
    const c = this.ctx;
    this.hits = [];
    c.clearRect(0, 0, W, H);
    // card
    c.fillStyle = 'rgba(6, 9, 20, 0.92)';
    roundRect(c, 0, 0, W, H, 36); c.fill();
    c.strokeStyle = 'rgba(191, 245, 255, 0.35)'; c.lineWidth = 3; roundRect(c, 1.5, 1.5, W - 3, H - 3, 36); c.stroke();
    let y = 64;
    const X = 56, INNER = W - 2 * X;
    c.textBaseline = 'top';
    c.fillStyle = '#bff5ff'; c.font = `600 22px ${FONT}`;
    c.fillText(String(model.eyebrow || '').toUpperCase().split('').join(String.fromCharCode(8202)), X, y); y += 40;
    c.fillStyle = '#eef3ff'; c.font = `400 44px ${FONT}`;
    for (const line of wrap(c, `“${model.promise}”`, INNER)) { c.fillText(line, X, y); y += 52; }
    y += 18;
    const heads = ['#ffd166', '#bff5ff', '#5bd38c'];
    (model.layers || []).forEach((L, i) => {
      c.font = `400 27px ${FONT}`;
      const lines = wrap(c, L.text, INNER - 40);
      const h = 52 + lines.length * 34 + 16;
      c.fillStyle = 'rgba(255,255,255,0.05)'; roundRect(c, X, y, INNER, h, 22); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 2; roundRect(c, X, y, INNER, h, 22); c.stroke();
      c.fillStyle = heads[i]; c.font = `700 20px ${FONT}`; c.fillText(L.head.toUpperCase(), X + 20, y + 16);
      c.fillStyle = '#eef3ff'; c.font = `400 27px ${FONT}`;
      lines.forEach((ln, k) => c.fillText(ln, X + 20, y + 52 + k * 34));
      y += h + 12;
    });
    y += 10;
    if (model.note) {
      c.fillStyle = 'rgba(191,245,255,0.10)'; roundRect(c, X, y, INNER, 60, 16); c.fill();
      c.fillStyle = '#eef3ff'; c.font = `400 24px ${FONT}`; c.fillText(model.note, X + 18, y + 17); y += 74;
    }
    for (const ctl of model.controls || []) {
      c.fillStyle = 'rgba(238,243,255,0.45)'; c.font = `600 20px ${FONT}`;
      c.fillText(ctl.label.toUpperCase(), X, y); y += 34;
      let x = X;
      c.font = `500 26px ${FONT}`;
      for (const o of ctl.options) {
        const tw = c.measureText(o.text).width + 44;
        if (x + tw > X + INNER) { x = X; y += 66; }
        const bh = 56;
        c.fillStyle = o.on ? (o.tone === 'ask' ? 'rgba(255,209,102,0.18)' : o.tone === 'never' ? 'rgba(255,93,108,0.18)' : 'rgba(38,191,100,0.22)') : 'rgba(255,255,255,0.06)';
        roundRect(c, x, y, tw, bh, 16); c.fill();
        c.strokeStyle = o.on ? (o.tone === 'ask' ? '#ffd166' : o.tone === 'never' ? '#ff5d6c' : '#5bd38c') : 'rgba(255,255,255,0.18)'; c.lineWidth = this.hover === o.id ? 5 : 2;
        roundRect(c, x, y, tw, bh, 16); c.stroke();
        c.fillStyle = o.on ? '#eef3ff' : 'rgba(238,243,255,0.75)';
        c.fillText(o.text, x + 22, y + 14);
        this.hits.push({ id: o.id, x, y, w: tw, h: bh });
        x += tw + 12;
      }
      y += 66 + 18;
    }
    // footer
    const fy = H - 120, bw = (INNER - 20) / 2;
    const btn = (id, text, x, primary) => {
      c.fillStyle = primary ? '#26bf64' : 'rgba(255,255,255,0.07)';
      roundRect(c, x, fy, bw, 80, 22); c.fill();
      c.strokeStyle = this.hover === id ? '#ffffff' : (primary ? 'transparent' : 'rgba(255,255,255,0.2)'); c.lineWidth = this.hover === id ? 5 : 2; roundRect(c, x, fy, bw, 80, 22); c.stroke();
      c.fillStyle = primary ? '#04120a' : '#eef3ff'; c.font = `${primary ? 700 : 500} 30px ${FONT}`;
      c.textAlign = 'center'; c.fillText(text, x + bw / 2, fy + 24); c.textAlign = 'left';
      this.hits.push({ id, x, y: fy, w: bw, h: 80 });
    };
    btn('release', model.release || 'Release', X, true);
    btn('close', 'Close', X + bw + 20, false);
    this.texture.needsUpdate = true;
  }

  /** Element id under a UV hit (0..1, v up), or null. */
  hit(uv) {
    if (!uv) return null;
    const px = uv.x * W, py = (1 - uv.y) * H;
    for (const h of this.hits) if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h.id;
    return null;
  }

  setHover(id) { if (id !== this.hover) { this.hover = id; if (this.model) this.render(this.model); } }

  /** Place the panel facing an eye, at a bearing and distance. */
  place(eye, toward, distance = 2.2, lift = -0.15) {
    const dir = toward.clone().sub(eye); dir.y = 0; dir.normalize();
    this.mesh.position.copy(eye).add(dir.multiplyScalar(distance));
    this.mesh.position.y = eye.y + lift;
    this.mesh.lookAt(eye.x, this.mesh.position.y, eye.z);
    this.mesh.visible = true;
  }

  hide() { this.mesh.visible = false; this.hover = null; }

  dispose() { this.texture.dispose(); this.mesh.material.dispose(); this.mesh.geometry.dispose(); }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
