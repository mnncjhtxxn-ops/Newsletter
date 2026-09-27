import * as THREE from 'three';
import { simulate, lessons, runs, describeRuns } from './sim/engine.js';
import {
  SLOTS, slotHour, formatClock, SCENARIO, COMFORT_BANDS, DEFAULT_PROMISES, DEFAULT_PERMISSIONS,
  EV_DEPARTURE_OPTIONS, EV_TARGET_OPTIONS, EV_PRICE_CAP_OPTIONS, BAKERY_OPENING_OPTIONS,
} from './sim/scenario.js';
import { createRenderer } from './scene/renderer.js';
import { Nodes } from './scene/nodes.js';
import { buildRibbons } from './scene/ribbons.js';
import { Field } from './scene/field.js';
import { Touch } from './scene/touch.js';
import { Score } from './ui/score.js';
import { Orchestra } from './ui/audio.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const money = (p) => `£${(p / 100).toFixed(2)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------------ */
/* Settings (station-level, persisted best-effort; URL hash overrides) */
/* ------------------------------------------------------------------ */
const settings = { scale: 1, timeout: 90, dayLength: 110, sound: 0 };
try {
  const saved = JSON.parse(localStorage.getItem('orchestra.settings') || '{}');
  Object.assign(settings, saved);
} catch (e) { /* private mode or file:// – fine */ }
for (const [k, v] of new URLSearchParams(location.hash.slice(1))) if (k in settings) settings[k] = Number(v);
function saveSettings() { try { localStorage.setItem('orchestra.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */
const canvas = $('#gl');
const R = createRenderer(canvas, { scale: settings.scale });
const nodes = new Nodes(R.scene);
const ribbons = buildRibbons(nodes);
for (const k in ribbons.energy) R.scene.add(ribbons.energy[k].points);
for (const k in ribbons.info) R.scene.add(ribbons.info[k].points);
const field = new Field(R.scene, 22);
const touch = new Touch(canvas);
const score = new Score($('#scoreCanvas'), {});
const audio = new Orchestra();

const CAM_BASE = new THREE.Vector3(0, 1.5, 30);
const LOOK_BASE = new THREE.Vector3(0, 0.8, -3);
const camPos = CAM_BASE.clone();
const camLook = LOOK_BASE.clone();
const camPosTarget = CAM_BASE.clone();
const camLookTarget = LOOK_BASE.clone();

/* ------------------------------------------------------------------ */
/* App state                                                             */
/* ------------------------------------------------------------------ */
const app = {
  mode: 'attract', // attract | live | reveal | replay
  slotF: 0,
  timeScale: 1,
  timeScaleCur: 1,
  paused: false,
  holding: false,
  input: { promises: clone(DEFAULT_PROMISES), permissions: clone(DEFAULT_PERMISSIONS), approvals: {}, resolutions: {} },
  sim: null,
  prevSim: null,
  reveal: { id: null, pull: 0, dirty: false },
  touch: { world: new THREE.Vector3(0, -999, 0), strength: 0, r: 0, x: 0, y: 0 },
  decisionCursor: 0,
  lastInput: performance.now(),
  idleShown: false,
  replays: 0,
  lessonsAuto: false,
  t: 0,
  fps: 60,
};

const el = {
  attract: $('#attract'), clock: $('#clock'), clockTime: $('#clock .time'), clockSub: $('#clock .sub'), promise: $('#promise'),
  labels: $('#labels'), captions: $('#captions'), cards: $('#cards'), panel: $('#panel'), toast: $('#toast'), lessons: $('#lessons'),
  score: $('#score'), controls: $('#controls'), chipChanged: $('#chipChanged'), chipLessons: $('#chipLessons'),
  btnPause: $('#btnPause'), btnSound: $('#btnSound'), btnHome: $('#btnHome'), idle: $('#idle'), staff: $('#staff'), corner: $('#corner'),
};

// Labels: one per node, positioned every frame.
const LABEL_OFFSET = { wind: 128, sun: 78, grid: 64, substation: 104, score: 40, battery: 66, car: 70, home: 84, bakery: 80, street: 66 };
const labelEls = {};
for (const id of Object.keys(nodes.byId)) {
  if (id === 'score') continue;
  const d = document.createElement('div');
  d.className = 'label';
  d.innerHTML = `<div class="name">${nodes.byId[id].def.label}</div><div class="state"></div><div class="dot"></div>`;
  el.labels.appendChild(d);
  labelEls[id] = { root: d, state: d.querySelector('.state') };
}

/* ------------------------------------------------------------------ */
/* Simulation plumbing                                                  */
/* ------------------------------------------------------------------ */
function resim({ replay = false } = {}) {
  app.prevSim = app.sim;
  app.sim = simulate(app.input);
  score.setSim(app.sim, replay ? app.prevSim : null);
  renderCards();
  renderPromise();
  if (replay) {
    app.slotF = 0;
    app.decisionCursor = 0;
    app.replays++;
    app.mode = 'replay';
    app.timeScale = app.paused ? 0 : 1;
    app.lessonsAuto = false;
    showToast();
    el.chipChanged.classList.remove('hidden');
    el.chipLessons.classList.remove('hidden');
    for (const c of app.sim.conflicts) if (!c.resolved) audio.ping('conflict');
  } else {
    syncCursor();
  }
}
function syncCursor() {
  const s = Math.floor(app.slotF);
  app.decisionCursor = app.sim.decisions.findIndex((d) => d.slot >= s);
  if (app.decisionCursor < 0) app.decisionCursor = app.sim.decisions.length;
}

/** Everything the scene needs for one moment of the day. */
function frameAt(sim, slotF, dt) {
  const s = sim.series;
  const i = Math.min(SLOTS - 1, Math.floor(slotF));
  const j = Math.min(SLOTS - 1, i + 1);
  const f = slotF - i;
  const L = (arr) => arr[i] + (arr[j] - arr[i]) * f;
  const band = COMFORT_BANDS[sim.promises.home.comfort];
  const wind = L(s.wind), solar = L(s.solar), feeder = L(s.feeder), street = L(s.street);
  const ev = L(s.ev), heat = L(s.heat), ovens = L(s.ovens), cold = L(s.cold), battery = L(s.battery);
  const evSoc = s.evSoc[i] + (s.evSoc[i + 1] - s.evSoc[i]) * f;
  const temp = s.temp[i] + (s.temp[i + 1] - s.temp[i]) * f;
  const bSoc = (s.batterySoc[i] + (s.batterySoc[i + 1] - s.batterySoc[i]) * f) / SCENARIO.battery.capacityKwh;
  const depart = sim.parts.ev.depart;
  const carAway = slotF >= depart && slotF < SLOTS - 2;
  return {
    dt, i, wind, solar, feeder, street, ev, heat, ovens, cold, battery, evSoc, temp, bSoc, carAway,
    price: L(s.price), renewFrac: L(s.renewFrac), outdoor: L(s.outdoor),
    windFrac: wind / 56, solarFrac: solar / 42, importFrac: Math.max(0, feeder - wind) / 40,
    evKw: ev, heatKw: heat, bakeryKw: ovens + cold, batteryKw: battery, batterySoc: bSoc,
    tempFrac: clamp((temp - band.low) / (band.high - band.low), 0, 1),
    cableFrac: Math.max(0, feeder) / SCENARIO.feederLimitKw, streetFrac: street / 46,
    band,
  };
}

/* ------------------------------------------------------------------ */
/* Words for the moment                                                 */
/* ------------------------------------------------------------------ */
function mood(h) {
  if (h >= 18 && h < 21) return 'Evening. The street comes home.';
  if (h >= 21 || h < 0) return 'Night. The wind picks up.';
  if (h < 4.5) return "Small hours. The orchestra's busiest time.";
  if (h < 7) return 'Before dawn. The bakery wakes.';
  if (h < 9.5) return 'Morning rush.';
  if (h < 15) return 'Daytime. The rooftops are working.';
  return 'Afternoon. Nearly home.';
}
function windWords(kw) { return kw > 45 ? 'wind strong' : kw > 25 ? 'wind steady' : kw > 12 ? 'wind light' : 'wind fading'; }

function stateText(id, f, sim) {
  const pr = sim.promises;
  switch (id) {
    case 'car':
      if (f.carAway) return `away · came back at 18:00 with ${SCENARIO.ev.startPct}%`;
      if (f.evKw > 0.1) return `charging ${f.evKw.toFixed(0)} kW · ${f.evSoc.toFixed(0)}%`;
      if (f.i >= sim.parts.ev.depart - 1) return `ready · ${f.evSoc.toFixed(0)}%`;
      return `plugged in · ${f.evSoc.toFixed(0)}% · waiting for wind`;
    case 'home':
      return `${f.temp.toFixed(1)} °C · ${f.heatKw > 0.1 ? `heating ${f.heatKw.toFixed(0)} kW` : f.temp > (f.band.low + f.band.high) / 2 ? 'coasting on stored warmth' : 'holding'}`;
    case 'bakery': {
      const open = sim.parts.ovens.open, pre = sim.parts.ovens.preheat, end = sim.parts.ovens.bakeEnd;
      const cold = f.cold > 0.1 ? ' · cold store running' : '';
      if (f.i >= pre && f.i < open) return `ovens heating ${f.ovens.toFixed(0)} kW${cold}`;
      if (f.i >= open && f.i < end) return `open · baking ${f.ovens.toFixed(0)} kW`;
      if (f.i >= end && f.ovens > 0) return `open · ${f.ovens.toFixed(0)} kW`;
      return `closed${cold || ' · quiet'}`;
    }
    case 'battery':
      return `${(f.bSoc * 100).toFixed(0)}% · ${f.batteryKw > 0.1 ? `storing ${f.batteryKw.toFixed(0)} kW` : f.batteryKw < -0.1 ? `releasing ${(-f.batteryKw).toFixed(0)} kW` : 'holding'}`;
    case 'wind': return `${f.wind.toFixed(0)} kW to the street · ${windWords(f.wind)}`;
    case 'sun': return f.solar > 0.5 ? `${f.solar.toFixed(0)} kW from the rooftops` : 'night';
    case 'substation': return `${Math.max(0, f.feeder).toFixed(0)} of ${SCENARIO.feederLimitKw} kW${f.feeder > SCENARIO.feederLimitKw ? ' · OVER LIMIT' : ''}`;
    case 'street': return `${f.street.toFixed(0)} kW · ${f.street > 34 ? 'dinner time' : f.street < 14 ? 'asleep' : 'ticking over'}`;
    case 'grid': return f.feeder - f.wind > 0.5 ? `${(f.feeder - f.wind).toFixed(0)} kW beyond the wind` : 'nothing needed';
    default: return '';
  }
}

/* ------------------------------------------------------------------ */
/* UI: promise summary, cards, toast, lessons, panel                   */
/* ------------------------------------------------------------------ */
function renderPromise() {
  const p = app.sim.promises, pm = app.sim.permissions;
  const autoCount = Object.values(pm).filter((v) => v === 'auto').length;
  el.promise.innerHTML = `<b>Your promises</b>Car ${p.ev.targetPct}% by ${formatClock(p.ev.departureClock)}${p.ev.priceCapPence != null ? ` for ≤ ${money(p.ev.priceCapPence)}` : ''} · home ${COMFORT_BANDS[p.home.comfort].label} · bakery opens ${formatClock(p.bakery.openingClock)}<br>${autoCount} of 4 things may be moved automatically`;
}

function applyChange(apply, { replay = true } = {}) {
  if (app.reveal.id) closeReveal();
  if (apply.promises) for (const k in apply.promises) Object.assign(app.input.promises[k], apply.promises[k]);
  if (apply.permissions) for (const k in apply.permissions) { app.input.permissions[k] = apply.permissions[k]; delete app.input.approvals[k]; }
  if (apply.approvals) Object.assign(app.input.approvals, apply.approvals);
  if (apply.resolutions) Object.assign(app.input.resolutions, apply.resolutions);
  resim({ replay });
}

function renderCards() {
  const sim = app.sim;
  el.cards.innerHTML = '';
  for (const c of sim.conflicts) {
    const d = document.createElement('div');
    d.className = `card conflict ${c.severity}`;
    d.innerHTML = `<div class="kicker">${c.severity === 'hard' ? 'The system cannot solve this alone' : 'The system needs your decision'}</div><h3>${c.title}</h3><p>${c.text}</p><div class="opts"></div>`;
    const opts = d.querySelector('.opts');
    for (const o of c.options || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.label;
      if (c.chosen === o.id && c.resolved) b.classList.add('on');
      if (o.apply) b.addEventListener('click', () => { noteInput(); applyChange(o.apply); });
      else b.classList.add('ghost');
      opts.appendChild(b);
    }
    el.cards.appendChild(d);
  }
  for (const r of sim.requests) {
    const d = document.createElement('div');
    d.className = 'card request';
    d.innerHTML = `<div class="kicker">${r.declined ? 'You said not now' : 'Waiting for your permission'}</div><h3>${r.title}</h3><p>${r.text}</p><div class="opts"></div>`;
    const opts = d.querySelector('.opts');
    const yes = document.createElement('button'); yes.type = 'button'; yes.textContent = r.declined ? 'Allow after all' : 'Yes, move it';
    yes.addEventListener('click', () => { noteInput(); applyChange({ approvals: { [r.id]: true } }); });
    opts.appendChild(yes);
    if (!r.declined) {
      const no = document.createElement('button'); no.type = 'button'; no.className = 'ghost'; no.textContent = 'Not now';
      no.addEventListener('click', () => { noteInput(); applyChange({ approvals: { [r.id]: false } }); });
      opts.appendChild(no);
    }
    el.cards.appendChild(d);
  }
}

let toastTimer = null;
function diffLines(a, b) {
  const out = [];
  const arrow = (x, y, fmt, goodDown = true) => {
    if (Math.abs(x - y) < 1e-6) return `<b>${fmt(y)}</b> (unchanged)`;
    const cls = (y < x) === goodDown ? 'down' : 'up';
    return `${fmt(x)} → <b class="${cls}">${fmt(y)}</b>`;
  };
  const ra = describeRuns(runs(a.series.ev)), rb = describeRuns(runs(b.series.ev));
  if (ra !== rb) out.push(`Car charging: ${ra} → <b>${rb}</b>`);
  out.push(`Your home's day: ${arrow(a.metrics.homeCostPence, b.metrics.homeCostPence, money)}`);
  out.push(`Car ready: ${arrow(a.metrics.evReadyPct, b.metrics.evReadyPct, (v) => `${Math.round(v)}%`, false)}`);
  out.push(`Car on wind: ${arrow(a.metrics.evWindShare, b.metrics.evWindShare, (v) => `${Math.round(v * 100)}%`, false)}`);
  out.push(`Street peak: ${arrow(a.metrics.peakKw, b.metrics.peakKw, (v) => `${v.toFixed(0)} kW`)} of ${SCENARIO.feederLimitKw}`);
  if (a.metrics.overloadMinutes !== b.metrics.overloadMinutes) out.push(`Cable over limit: ${arrow(a.metrics.overloadMinutes, b.metrics.overloadMinutes, (v) => `${v} min`)}`);
  const ha = a.parts.heat.preheatSlots * 15, hb = b.parts.heat.preheatSlots * 15;
  if (ha !== hb) out.push(`Home pre-warmed on wind: ${ha} → <b>${hb} min</b>`);
  const ca = describeRuns(runs(a.series.cold)), cb = describeRuns(runs(b.series.cold));
  if (ca !== cb) out.push(`Bakery cold store: ${ca} → <b>${cb}</b>`);
  if (b.conflicts.length) out.push(`<b class="up">${b.conflicts.length} decision${b.conflicts.length > 1 ? 's' : ''} need${b.conflicts.length > 1 ? '' : 's'} you</b>`);
  if (b.requests.filter((r) => !r.declined).length) out.push(`<b>${b.requests.filter((r) => !r.declined).length} request${b.requests.length > 1 ? 's' : ''} waiting for permission</b>`);
  return out;
}
function showToast(auto = true) {
  if (!app.prevSim) return;
  const lines = diffLines(app.prevSim, app.sim);
  el.toast.innerHTML = `<div class="kicker">Replaying the same day</div><div class="big">Same equipment. Same weather. Different human requirements.</div><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  if (auto) toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 11000);
}
function showLessons() {
  const ls = lessons(app.sim, app.prevSim);
  el.lessons.querySelector('ol').innerHTML = ls.map((l, i) => `<li><span class="n">${i + 1}</span><span>${l.text}</span></li>`).join('');
  el.lessons.classList.remove('hidden');
  el.toast.classList.add('hidden');
}

/* ---------------- the reveal panel ---------------- */
const CONTROLS = {
  car: (ip) => [
    { kind: 'slider', label: 'I leave for work at', key: ['promises', 'ev', 'departureClock'], options: EV_DEPARTURE_OPTIONS, fmt: (v) => formatClock(v) },
    { kind: 'chips', label: 'The car must be at', key: ['promises', 'ev', 'targetPct'], options: EV_TARGET_OPTIONS, fmt: (v) => `${v}%` },
    { kind: 'chips', label: 'Spend no more than', key: ['promises', 'ev', 'priceCapPence'], options: EV_PRICE_CAP_OPTIONS, fmt: (v) => (v == null ? 'No limit' : money(v)) },
    { kind: 'perm', label: 'What the system may do with charging', key: ['permissions', 'ev'] },
  ],
  home: (ip) => [
    { kind: 'chips', label: 'Keep the house', key: ['promises', 'home', 'comfort'], options: ['tight', 'normal', 'relaxed'], fmt: (v) => `${COMFORT_BANDS[v].words} · ${COMFORT_BANDS[v].label}` },
    { kind: 'perm', label: 'What the system may do with heating', key: ['permissions', 'heat'] },
  ],
  bakery: (ip) => [
    { kind: 'slider', label: 'The bakery opens at', key: ['promises', 'bakery', 'openingClock'], options: BAKERY_OPENING_OPTIONS, fmt: (v) => formatClock(v) },
    { kind: 'perm', label: 'What the system may do with the cold store', key: ['permissions', 'bakery'] },
  ],
  battery: (ip) => [
    { kind: 'perm', label: 'What the system may do with the battery', key: ['permissions', 'battery'] },
  ],
};
const PERM_LABELS = { auto: 'You can reschedule this automatically.', ask: 'Ask me before changing it.', never: 'Never move this.' };

function getIn(o, path) { return path.reduce((a, k) => a[k], o); }
function setIn(o, path, v) { const p = path.slice(); const last = p.pop(); getIn(o, p)[last] = v; }

function openReveal(id, { viaPull = false } = {}) {
  if (!id || id === 'grid' || id === 'score') return;
  app.reveal.id = id;
  app.reveal.dirty = false;
  app.mode = 'reveal';
  app.timeScale = 0;
  const ex = app.sim.explain[id];
  const p = el.panel;
  p.querySelector('.eyebrow').textContent = ex.title;
  p.querySelector('h2.promise').textContent = `“${ex.promise}”`;
  p.querySelector('.l1 p').textContent = ex.short.asked;
  p.querySelector('.l2 p').textContent = ex.short.allowed;
  p.querySelector('.l3 p').textContent = ex.short.happened;
  const tds = p.querySelectorAll('.deep td');
  tds[0].innerHTML = ex.knew.map((t) => `<div>${t}</div>`).join('');
  tds[1].innerHTML = ex.allowed.map((t) => `<div>${t}</div>`).join('');
  tds[2].innerHTML = ex.decided.map((t) => `<div>${t}</div>`).join('');
  p.classList.remove('deep');
  renderControls(id);
  p.querySelector('.release').classList.remove('dirty');
  p.querySelector('.release').textContent = 'Release';
  p.classList.remove('hiddenpanel');
  if (!viaPull) { p.classList.remove('pulling'); p.classList.add('open'); p.style.setProperty('--pull', 1); }
  audio.setFrozen(true);
}

function renderControls(id) {
  const box = el.panel.querySelector('.controls');
  box.innerHTML = '';
  const defs = CONTROLS[id]?.(app.input) || [];
  if (!defs.length) {
    box.innerHTML = `<div class="ctl"><div class="lbl">Nothing to change here</div><div style="font-size:14px;color:var(--ink-dim)">${id === 'substation' ? 'A cable has no preferences. Its limit shapes every other decision.' : id === 'wind' || id === 'sun' ? 'Weather is not negotiable. The orchestra moves what waits for it.' : 'This is the backdrop the orchestra works around.'}</div></div>`;
    return;
  }
  for (const d of defs) {
    const wrap = document.createElement('div');
    wrap.className = 'ctl';
    wrap.innerHTML = `<div class="lbl">${d.label}</div>`;
    const cur = getIn(app.input, d.key);
    if (d.kind === 'slider') {
      const idx = Math.max(0, d.options.indexOf(cur));
      const s = document.createElement('div'); s.className = 'slider';
      s.innerHTML = `<div class="val">${d.fmt(cur)}</div><input type="range" min="0" max="${d.options.length - 1}" step="1" value="${idx}">`;
      const inp = s.querySelector('input'); const val = s.querySelector('.val');
      inp.addEventListener('input', () => { const v = d.options[Number(inp.value)]; val.textContent = d.fmt(v); setIn(app.input, d.key, v); markDirty(); });
      inp.addEventListener('pointerdown', (e) => e.stopPropagation());
      wrap.appendChild(s);
    } else if (d.kind === 'chips') {
      const c = document.createElement('div'); c.className = 'chips';
      for (const o of d.options) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = d.fmt(o);
        if (o === cur) b.classList.add('on');
        b.addEventListener('click', () => { setIn(app.input, d.key, o); c.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); markDirty(); });
        c.appendChild(b);
      }
      wrap.appendChild(c);
    } else if (d.kind === 'perm') {
      const c = document.createElement('div'); c.className = 'chips';
      for (const o of ['auto', 'ask', 'never']) {
        const b = document.createElement('button'); b.type = 'button'; b.className = o; b.textContent = PERM_LABELS[o];
        if (o === cur) b.classList.add('on');
        b.addEventListener('click', () => { setIn(app.input, d.key, o); delete app.input.approvals[d.key[1]]; c.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); markDirty(); });
        c.appendChild(b);
      }
      wrap.appendChild(c);
    }
    box.appendChild(wrap);
  }
}
function markDirty() {
  noteInput();
  app.reveal.dirty = true;
  const b = el.panel.querySelector('.release');
  b.classList.add('dirty');
  b.textContent = 'Release and replay the day';
}
function closeReveal({ replay = false } = {}) {
  el.panel.classList.remove('open', 'pulling');
  el.panel.style.setProperty('--pull', 0);
  app.reveal.id = null;
  if (replay) resim({ replay: true });
  else app.mode = app.mode === 'replay' ? 'replay' : 'live';
  if (!app.paused) app.timeScale = 1;
  audio.setFrozen(false);
}

/* ------------------------------------------------------------------ */
/* Mode transitions                                                     */
/* ------------------------------------------------------------------ */
function showUI(show) {
  el.clock.classList.toggle('show', show);
  el.score.classList.toggle('show', show);
  el.controls.classList.toggle('show', show);
  el.promise.classList.toggle('hidden', !show);
  el.cards.classList.toggle('hidden', !show);
}
function leaveAttract() {
  if (app.mode !== 'attract') return;
  app.mode = 'live';
  el.attract.classList.remove('show');
  showUI(true);
  if (settings.sound) { audio.enable(); el.btnSound.classList.add('on'); }
}
function resetToAttract() {
  app.input = { promises: clone(DEFAULT_PROMISES), permissions: clone(DEFAULT_PERMISSIONS), approvals: {}, resolutions: {} };
  app.prevSim = null;
  app.sim = simulate(app.input);
  score.setSim(app.sim, null);
  renderCards(); renderPromise();
  app.slotF = 0; app.decisionCursor = 0; app.replays = 0; app.paused = false; app.timeScale = 1;
  app.reveal = { id: null, pull: 0, dirty: false };
  app.mode = 'attract';
  el.panel.classList.remove('open', 'pulling', 'deep'); el.panel.style.setProperty('--pull', 0);
  el.toast.classList.add('hidden'); el.lessons.classList.add('hidden'); el.idle.classList.add('hidden'); el.staff.classList.add('hidden');
  el.chipChanged.classList.add('hidden'); el.chipLessons.classList.add('hidden');
  el.btnPause.classList.remove('paused');
  el.captions.innerHTML = '';
  el.attract.classList.add('show');
  showUI(false);
  audio.disable(); el.btnSound.classList.remove('on');
  app.idleShown = false;
}
function noteInput() {
  app.lastInput = performance.now();
  if (app.idleShown) { el.idle.classList.add('hidden'); app.idleShown = false; }
}

/* ------------------------------------------------------------------ */
/* Touch wiring                                                          */
/* ------------------------------------------------------------------ */
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2();
function worldAt(x, y, nodeId) {
  ndc.set((x / R.state.width) * 2 - 1, -(y / R.state.height) * 2 + 1);
  ray.setFromCamera(ndc, R.camera);
  const out = new THREE.Vector3();
  if (nodeId) { const w = nodes.get(nodeId).world; plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), w); }
  else plane.set(new THREE.Vector3(0, 0, 1), 0);
  if (!ray.ray.intersectPlane(plane, out)) out.set(0, 0, 0);
  return out;
}
touch.on('down', ({ x, y, node }) => {
  noteInput();
  const first = app.mode === 'attract';
  leaveAttract();
  if (app.mode === 'reveal') return; // the panel owns the interaction
  app.holding = true;
  app.timeScale = 0;
  app.touch.world.copy(worldAt(x, y, node));
  app.touch.x = x; app.touch.y = y;
  app.touch.targetStrength = 1;
  if (first) audio.ping('decision');
  audio.setFrozen(true);
});
touch.on('move', ({ x, y, node }) => {
  if (!app.holding) return;
  app.touch.x = x; app.touch.y = y;
  if (!node) app.touch.world.lerp(worldAt(x, y, null), 0.5);
});
touch.on('pull', ({ node, progress }) => {
  if (app.mode === 'reveal' && app.reveal.id !== node) return;
  if (app.reveal.id !== node) openReveal(node, { viaPull: true });
  app.reveal.pull = progress;
  el.panel.classList.add('pulling');
  el.panel.style.setProperty('--pull', progress.toFixed(3));
});
touch.on('pullend', ({ node, progress }) => {
  app.holding = false;
  el.panel.classList.remove('pulling');
  if (progress > 0.3) { el.panel.classList.add('open'); el.panel.style.setProperty('--pull', 1); app.reveal.pull = 1; }
  else closeReveal();
});
touch.on('tap', ({ node }) => {
  app.holding = false;
  if (app.mode === 'reveal') { if (node && node !== app.reveal.id) openReveal(node); return; }
  if (node) openReveal(node);
});
touch.on('up', () => {
  app.holding = false;
  app.touch.targetStrength = 0;
  if (app.mode !== 'reveal' && !app.paused) { setTimeout(() => { if (!app.holding && app.mode !== 'reveal' && !app.paused) { app.timeScale = 1; audio.setFrozen(false); } }, 700); }
});

/* Score strip: tap a stave → reveal; drag → scrub time */
Object.assign(score.h, {
  onTouch: () => { noteInput(); leaveAttract(); },
  onScrubStart: () => { app.timeScale = 0; app.scrubbing = true; },
  onScrub: (slot) => { app.slotF = slot; syncCursor(); },
  onScrubEnd: () => { app.scrubbing = false; if (app.mode !== 'reveal' && !app.paused) app.timeScale = 1; },
  onTapRow: (id) => { if (app.mode === 'reveal' && app.reveal.id === id) return; openReveal(id); },
});

/* Panel buttons */
el.panel.querySelector('.more').addEventListener('click', () => { noteInput(); el.panel.classList.toggle('deep'); el.panel.querySelector('.more').textContent = el.panel.classList.contains('deep') ? 'Hide the working' : 'Show me the working'; });
el.panel.querySelector('.release').addEventListener('click', () => { noteInput(); closeReveal({ replay: app.reveal.dirty }); });
el.panel.querySelector('.close').addEventListener('click', () => { noteInput(); closeReveal({ replay: false }); });
el.panel.addEventListener('pointerdown', (e) => { e.stopPropagation(); noteInput(); });

/* Corner controls */
el.btnPause.addEventListener('click', () => {
  noteInput();
  app.paused = !app.paused;
  el.btnPause.classList.toggle('paused', app.paused);
  if (app.mode !== 'reveal') app.timeScale = app.paused ? 0 : 1;
  audio.setFrozen(app.paused);
});
el.btnSound.addEventListener('click', () => {
  noteInput();
  if (audio.enabled) { audio.disable(); el.btnSound.classList.remove('on'); }
  else { audio.enable(); el.btnSound.classList.toggle('on', audio.enabled); }
});
el.btnHome.addEventListener('click', () => resetToAttract());
el.chipChanged.addEventListener('click', () => { noteInput(); if (el.toast.classList.contains('hidden')) showToast(false); else el.toast.classList.add('hidden'); });
el.chipLessons.addEventListener('click', () => { noteInput(); if (el.lessons.classList.contains('hidden')) showLessons(); else el.lessons.classList.add('hidden'); });
el.lessons.querySelector('.x').addEventListener('click', () => { noteInput(); el.lessons.classList.add('hidden'); });
el.toast.addEventListener('click', () => { noteInput(); el.toast.classList.add('hidden'); });
el.idle.addEventListener('pointerdown', () => noteInput());

/* Staff menu: triple-tap the top-left corner */
let cornerTaps = [];
el.corner.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  const now = performance.now();
  cornerTaps = cornerTaps.filter((t) => now - t < 1200); cornerTaps.push(now);
  if (cornerTaps.length >= 3) { cornerTaps = []; el.staff.classList.toggle('hidden'); syncStaff(); }
});
function syncStaff() { el.staff.querySelectorAll('select').forEach((s) => { s.value = String(settings[s.dataset.k]); }); }
el.staff.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => {
  settings[s.dataset.k] = Number(s.value); saveSettings();
  if (s.dataset.k === 'scale') R.setScale(settings.scale);
  if (s.dataset.k === 'sound') { if (settings.sound) { audio.enable(); el.btnSound.classList.add('on'); } else { audio.disable(); el.btnSound.classList.remove('on'); } }
}));
el.staff.querySelector('.x').addEventListener('click', () => el.staff.classList.add('hidden'));
el.staff.querySelector('.reset').addEventListener('click', () => resetToAttract());
el.staff.addEventListener('pointerdown', (e) => { e.stopPropagation(); noteInput(); });
window.addEventListener('resize', () => score.resize());
window.addEventListener('keydown', (e) => { if (e.key === ' ') el.btnPause.click(); if (e.key === 'Escape') { if (app.mode === 'reveal') closeReveal(); else if (!el.staff.classList.contains('hidden')) el.staff.classList.add('hidden'); } });

/* ------------------------------------------------------------------ */
/* Captions: the moment a decision is made                              */
/* ------------------------------------------------------------------ */
const captionPool = [];
function caption(nodeId, text) {
  // one live caption per object: a newer decision replaces the older one
  for (let k = captionPool.length - 1; k >= 0; k--) if (captionPool[k].node === nodeId) { captionPool[k].el.remove(); captionPool.splice(k, 1); }
  const d = document.createElement('div');
  d.className = 'cap';
  d.textContent = text;
  d.dataset.node = nodeId;
  el.captions.appendChild(d);
  captionPool.push({ el: d, node: nodeId, born: performance.now() });
  while (captionPool.length > 4) captionPool.shift().el.remove();
}

/* ------------------------------------------------------------------ */
/* The loop                                                              */
/* ------------------------------------------------------------------ */
resetToAttract();
let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsT = 0;

function tick(now) {
  requestAnimationFrame(tick);
  const dtRaw = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  app.t += dtRaw;
  fpsAcc += dtRaw; fpsN++; if (fpsAcc > 1) { app.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (!el.staff.classList.contains('hidden')) el.staff.querySelector('.fps').textContent = `${app.fps.toFixed(0)} fps · scene at ${Math.round(settings.scale * 100)}%`; }

  // time
  app.timeScaleCur += (app.timeScale - app.timeScaleCur) * (app.timeScale < app.timeScaleCur ? 0.18 : 0.06);
  const dayLen = app.mode === 'replay' ? settings.dayLength * 0.7 : settings.dayLength;
  const slotsPerSec = SLOTS / dayLen;
  const prevSlot = Math.floor(app.slotF);
  app.slotF = Math.max(0, app.slotF + dtRaw * slotsPerSec * app.timeScaleCur);
  if (app.slotF >= SLOTS) {
    app.slotF -= SLOTS;
    app.decisionCursor = 0;
    if (app.mode === 'replay') {
      app.mode = 'live';
      if (!app.lessonsAuto && el.lessons.classList.contains('hidden') && app.replays > 0) { app.lessonsAuto = true; showLessons(); }
    }
  }
  const sim = app.sim;
  const f = frameAt(sim, app.slotF, dtRaw);
  const slot = Math.floor(app.slotF);
  const frozen = app.timeScaleCur < 0.2;

  // decisions crossing the playhead → pulses, captions, sound
  if (app.timeScaleCur > 0.2) {
    while (app.decisionCursor < sim.decisions.length && sim.decisions[app.decisionCursor].slot <= slot) {
      const d = sim.decisions[app.decisionCursor++];
      const rb = ribbons.info[d.node];
      if (rb) rb.pulse(-1);
      if (app.mode !== 'attract' && d.kind !== 'ask') caption(d.node, d.text);
      audio.ping(d.kind === 'ask' ? 'ask' : 'decision');
    }
    if (slot !== prevSlot && slot % 8 === 0) { for (const id of ['car', 'home', 'bakery', 'wind']) ribbons.info[id]?.pulse(1); }
    if (slot !== prevSlot && slot % 12 === 6) { ribbons.info.substation?.pulse(1); ribbons.info.battery?.pulse(1); }
  }

  // touch ripple
  const ts = app.touch;
  ts.strength += ((ts.targetStrength || 0) - ts.strength) * 0.12;
  ts.r += ((ts.targetStrength ? 7.5 : 0) - ts.r) * 0.08;
  if (app.mode === 'reveal' && app.reveal.id) { ts.world.lerp(nodes.get(app.reveal.id).world, 0.15); ts.strength += (0.6 - ts.strength) * 0.1; ts.r += (6 - ts.r) * 0.1; }

  // camera
  const drift = frozen ? 0 : 1;
  if (app.mode === 'reveal' && app.reveal.id) {
    const w = nodes.get(app.reveal.id).world;
    const dir = new THREE.Vector3(0, 1.5, R.state.camZ).sub(w).normalize();
    const landscape = R.state.width / R.state.height > 1 && R.state.width > 760;
    camPosTarget.copy(w).add(dir.multiplyScalar(landscape ? 18 : R.state.camZ * 0.85)).add(new THREE.Vector3(landscape ? 6 : w.x * -0.5, 1.2, 0));
    camLookTarget.copy(w).add(new THREE.Vector3(landscape ? 6 : w.x * -0.5, landscape ? 0 : 5, 0));
  } else {
    camPosTarget.set(Math.sin(app.t * 0.05) * 1.6 * drift, 1.5 + Math.sin(app.t * 0.037) * 0.6 * drift, R.state.camZ + Math.sin(app.t * 0.021) * 1.2 * drift);
    camLookTarget.copy(LOOK_BASE);
  }
  camPos.lerp(camPosTarget, 0.04);
  camLook.lerp(camLookTarget, 0.04);
  R.camera.position.copy(camPos);
  R.camera.lookAt(camLook);

  // scene state
  const revealId = app.reveal.id;
  nodes.update({ time: app.t, pixelRatio: R.state.pixelRatio, touch: ts.world, touchR: ts.r, touchStrength: ts.strength, revealId, spread: app.reveal.pull * 0.6, dim: 1, frame: { ...f, frozen, infoActivity: 0.3 } });
  const E = ribbons.energy;
  const imp = Math.max(0, f.feeder);
  E.windIn.flow = Math.min(f.wind, imp);
  E.gridIn.flow = Math.max(0, imp - f.wind);
  E.sunIn.flow = f.solar;
  E.toCar.flow = f.evKw;
  E.toHome.flow = f.heatKw + SCENARIO.home.baseKw;
  E.toBakery.flow = f.bakeryKw;
  E.toStreet.flow = f.street;
  E.battery.flow = f.batteryKw;
  const dimOthers = revealId ? 0.45 : 1;
  const linkOf = { windIn: 'wind', gridIn: 'grid', sunIn: 'sun', toCar: 'car', toHome: 'home', toBakery: 'bakery', toStreet: 'street', battery: 'battery' };
  for (const k in E) E[k].update(dtRaw, app.timeScaleCur, { dim: revealId && linkOf[k] !== revealId && revealId !== 'substation' ? dimOthers : 1 });
  for (const k in ribbons.info) ribbons.info[k].update(dtRaw, app.timeScaleCur, { trace: frozen || app.mode === 'reveal' ? (revealId ? (k === revealId ? 1 : 0.25) : 0.7) : 0.08 });
  field.update(dtRaw, app.timeScaleCur, revealId ? 0.5 : 1);
  R.render();

  // audio follows activity
  if (audio.enabled) {
    audio.setActivity('wind', f.windFrac); audio.setActivity('sun', f.solarFrac); audio.setActivity('car', f.evKw > 0 ? 1 : 0.1);
    audio.setActivity('home', f.heatKw > 0 ? 0.9 : 0.2); audio.setActivity('bakery', f.bakeryKw / 30); audio.setActivity('battery', Math.abs(f.batteryKw) / 5);
    audio.setActivity('substation', f.cableFrac); audio.setActivity('street', f.streetFrac);
  }

  // HTML overlay
  const proj = nodes.project(R.camera, R.state.width, R.state.height);
  touch.setProjected(proj);
  const showLabels = app.mode !== 'attract';
  for (const id in labelEls) {
    const L = labelEls[id]; const p = proj[id];
    let op = 0;
    const pending = sim.requests.some((r) => r.node === id && !r.declined);
    if (showLabels) {
      if (app.mode === 'reveal') op = id === revealId ? 1 : 0.28;
      else if (app.holding || app.scrubbing || app.paused) op = app.holding ? clamp(1.15 - Math.hypot(p.x - ts.x, p.y - ts.y) / 520, 0.3, 1) : 0.9;
      else op = pending ? 0.75 : 0;
    }
    L.root.style.opacity = op.toFixed(2);
    L.root.classList.toggle('pending', pending);
    L.root.classList.toggle('hot', id === revealId);
    if (op > 0.01) {
      L.root.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y + LABEL_OFFSET[id]).toFixed(1)}px) translate(-50%, 0)`;
      L.state.textContent = stateText(id, f, sim);
      L.state.classList.toggle('over', id === 'substation' && f.feeder > SCENARIO.feederLimitKw);
    }
  }
  for (let k = captionPool.length - 1; k >= 0; k--) {
    const c = captionPool[k]; const p = proj[c.node];
    if (now - c.born > 5600) { c.el.remove(); captionPool.splice(k, 1); continue; }
    c.el.style.left = `${p.x.toFixed(1)}px`; c.el.style.top = `${(p.y - LABEL_OFFSET[c.node] * 0.9).toFixed(1)}px`;
  }
  if (app.mode !== 'attract') {
    const h = slotHour(app.slotF) % 24;
    el.clockTime.textContent = formatClock(h);
    const over = f.feeder > SCENARIO.feederLimitKw;
    el.clockSub.innerHTML = `${mood(h)} · ${windWords(f.wind)} · <b>${f.price.toFixed(0)}p</b>/kWh · cable <b class="${over ? 'over' : ''}">${Math.max(0, f.feeder).toFixed(0)} of ${SCENARIO.feederLimitKw} kW</b>${app.mode === 'replay' ? ' · <b>replaying</b>' : ''}${frozen && !app.paused ? ' · paused at your fingertip' : ''}`;
    score.draw(app.slotF, { revealId, dimmed: false });
  }

  // idle → attract
  if (app.mode !== 'attract' && settings.timeout > 0) {
    const idle = (now - app.lastInput) / 1000;
    if (idle > settings.timeout && !app.idleShown) { app.idleShown = true; el.idle.classList.remove('hidden'); }
    if (app.idleShown) {
      const left = Math.max(0, Math.ceil(settings.timeout + 15 - idle));
      el.idle.querySelector('b').textContent = String(left);
      if (left <= 0) resetToAttract();
    }
  }
}
requestAnimationFrame(tick);

// Expose a tiny inspection hook for testing on the station (no UI).
window.__orchestra = { app, simulate, settings, resetToAttract, frameAt, openReveal, closeReveal, applyChange };
window.__orchestra.nodes = nodes; window.__orchestra.R = R; window.__orchestra.ribbons = ribbons;
