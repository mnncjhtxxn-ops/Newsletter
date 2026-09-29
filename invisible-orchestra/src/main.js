import * as THREE from 'three';
import { simulate, lessons, runs, describeRuns } from './sim/engine.js';
import { reviewAuthority, PlanStatus } from './sim/planner.js';
import {
  SLOTS, slotHour, formatClock, SCENARIO, COMFORT_BANDS, DEFAULT_PROMISES, DEFAULT_PERMISSIONS,
  EV_DEPARTURE_OPTIONS, EV_TARGET_OPTIONS, EV_PRICE_CAP_OPTIONS, BAKERY_OPENING_OPTIONS,
} from './sim/scenario.js';
import { createRenderer } from './scene/renderer.js';
import { RenderGovernor, LruCache, PROFILES } from './scene/governor.js';
import { Nodes } from './scene/nodes.js';
import { buildRibbons } from './scene/ribbons.js';
import { Field } from './scene/field.js';
import { DayRing } from './scene/dayring.js';
import { Environment } from './scene/environment.js';
import { Touch } from './scene/touch.js';
import { Orchestra } from './ui/audio.js';
import { XRMode } from './xr/vr.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const money = (p) => `£${(p / 100).toFixed(2)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------------ */
/* Settings (station-level, persisted best-effort; URL hash overrides) */
/* ------------------------------------------------------------------ */
const settings = { profile: 'balanced', timeout: 90, dayLength: 110, sound: 1 };
try {
  const saved = JSON.parse(localStorage.getItem('orchestra.settings') || '{}');
  Object.assign(settings, saved);
} catch (e) { /* private mode or file:// – fine */ }
for (const [k, v] of new URLSearchParams(location.hash.slice(1))) if (k in settings) settings[k] = k === 'profile' ? v : Number(v);
if (!PROFILES[settings.profile]) settings.profile = 'balanced';
function saveSettings() { try { localStorage.setItem('orchestra.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */
const canvas = $('#gl');
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
function fatal(title, text) {
  const d = document.createElement('div');
  d.id = 'fatal';
  d.innerHTML = `<div class="box"><div class="t">${title}</div><div class="s">${text}</div></div>`;
  document.body.appendChild(d);
}
{
  const probe = document.createElement('canvas');
  const gl2 = probe.getContext('webgl2');
  if (!gl2) {
    fatal('This screen cannot show The Invisible Orchestra.', 'The browser or graphics driver on this station does not provide WebGL 2. Staff: check the graphics driver and that hardware acceleration is enabled in Edge, then relaunch.');
    throw new Error('WebGL2 unavailable');
  }
  const ext = gl2.getExtension('WEBGL_lose_context');
  if (ext) ext.loseContext();
}
const R = createRenderer(canvas, { profile: settings.profile });
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (!$('#fatal')) fatal('One moment.', 'The graphics context was interrupted. Recovering…'); });
canvas.addEventListener('webglcontextrestored', () => { $('#fatal')?.remove(); });
const nodes = new Nodes(R.scene, R.renderer);
const ribbons = buildRibbons(nodes);
for (const k in ribbons.energy) R.scene.add(ribbons.energy[k].points);
for (const k in ribbons.info) R.scene.add(ribbons.info[k].points);
const prof = () => PROFILES[settings.profile];
const field = new Field(R.scene, prof().fieldStrands, Math.round(prof().ambientParticles / prof().fieldStrands));
const dayring = new DayRing(R.scene);
const env = new Environment(R.scene, { reflection: prof().reflection, reflectionSize: prof().reflectionSize });
env.attach(nodes, dayring.hourMarks());
dayring.attach(nodes);
const touch = new Touch(canvas);
const audio = new Orchestra();

/* The viewer stands at the centre of the sculpture. The camera has a yaw
   (where you are looking around the ring), a pitch, and a small dolly
   towards the object you are inspecting. Dragging empty space turns your head. */
const EYE = new THREE.Vector3(0, 0.4, 0);
const cam = { yaw: 0, pitch: 0.02, dolly: 0, yawT: 0, pitchT: 0.02, dollyT: 0, userYaw: 0, userPitch: 0 };
const camPos = EYE.clone();
const camLook = new THREE.Vector3(0, 0.4, -1);
function forwardOf(yaw, pitch, out = new THREE.Vector3()) { return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
function bearingOf(v) { return { yaw: Math.atan2(v.x, -v.z), pitch: Math.atan2(v.y - EYE.y, Math.hypot(v.x, v.z)), dist: v.distanceTo(EYE) }; }
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

/* ------------------------------------------------------------------ */
/* The conductor's chair (WebXR)                                        */
/* ------------------------------------------------------------------ */
const xr = new XRMode(R, {
  eye: EYE, nodes, dayring,
  onSelectNode: (id) => { noteInput(); wake(); leaveAttract(); openReveal(id); },
  onRing: (slot, phase) => {
    noteInput(); wake();
    if (phase === 'start') { leaveAttract(); app.holding = true; app.timeScale = 0; app.baton = 'xr'; app.batonTarget = slot; app.scrubbing = true; audio.setFrozen(true); }
    else if (phase === 'move') { if (slot != null) app.batonTarget = slot; }
    else { app.holding = false; app.baton = null; app.batonTarget = null; app.scrubbing = false; resumeAfterTouch(); }
  },
  onHold: (phase) => {
    noteInput(); wake();
    if (phase === 'start') { leaveAttract(); if (app.mode === 'reveal') return; app.holding = true; app.timeScale = 0; app.touch.targetStrength = 1; audio.setFrozen(true); }
    else { app.holding = false; app.touch.targetStrength = 0; resumeAfterTouch(); }
  },
  onPanel: (element) => {
    noteInput(); wake();
    if (element === 'release') { closeReveal({ replay: app.reveal.dirty }); return; }
    if (element === 'close') { closeReveal({ replay: false }); return; }
    const m = /^c(\d+):(\d+)$/.exec(element);
    if (!m) return;
    const defs = CONTROLS[app.reveal.id]?.(app.input) || [];
    const d = defs[Number(m[1])];
    if (!d) return;
    const opts = d.kind === 'perm' ? ['auto', 'ask', 'never'] : d.options;
    const v = opts[Number(m[2])];
    setIn(app.input, d.key, v);
    markDirty();
    renderControls(app.reveal.id);
    xr.refreshPanel();
  },
  panelModel: (id) => panelModel(id),
  onSession: (on) => {
    app.xrPresenting = on;
    if (on) { gov.beginExternal(); R.renderer.setAnimationLoop((t) => gov.pump(t)); if (settings.sound) audio.enable(); }
    else { R.renderer.setAnimationLoop(null); gov.endExternal(); }
    document.body.classList.toggle('xr', on);
  },
});
/** The reveal panel as data, for the in-room panel: same explanation, same controls as the HTML one. */
function panelModel(id) {
  const ex = app.sim.explain[id];
  const defs = CONTROLS[id]?.(app.input) || [];
  const controls = defs.map((d, di) => {
    const cur = getIn(app.input, d.key);
    const opts = d.kind === 'perm' ? ['auto', 'ask', 'never'] : d.options;
    const shown = d.kind === 'slider' ? opts.filter((v, k) => k % 2 === 0 || v === cur) : opts;
    return {
      label: d.label,
      options: shown.map((v) => ({ id: `c${di}:${opts.indexOf(v)}`, text: d.kind === 'perm' ? PERM_LABELS[v] : d.fmt(v), on: v === cur, tone: d.kind === 'perm' ? v : undefined })),
    };
  });
  return {
    eyebrow: ex.title, promise: ex.promise,
    layers: [{ head: 'You asked for this.', text: ex.short.asked }, { head: 'You allowed this.', text: ex.short.allowed }, { head: 'So this happened.', text: ex.short.happened }],
    controls, release: app.reveal.dirty ? 'Replay with this change' : 'Release',
    note: app.guide.step === 2 ? (GUIDE_CHANGE[app.guide.lastReveal] || GUIDE_STEPS[2].title) : undefined,
  };
}
function resumeAfterTouch() {
  if (app.mode !== 'reveal' && !app.paused) setTimeout(() => { if (!app.holding && app.mode !== 'reveal' && !app.paused && !app.pending) { app.timeScale = 1; audio.setFrozen(false); } }, 700);
}

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
  // input = the visitor's draft; accepted = the agreed intent the world runs on
  input: { promises: clone(DEFAULT_PROMISES), permissions: clone(DEFAULT_PERMISSIONS), resolutions: {} },
  accepted: { promises: clone(DEFAULT_PROMISES), permissions: clone(DEFAULT_PERMISSIONS), resolutions: {} },
  pending: null, // { input, sim, loads } — a proposed change waiting for the visitor
  lastDeclined: false,
  sim: null,
  prevSim: null,
  reveal: { id: null, pull: 0, dirty: false, condense: 0 },
  touch: { world: new THREE.Vector3(0, -999, 0), strength: 0, r: 0, x: 0, y: 0 },
  decisionCursor: 0,
  lastInput: performance.now(),
  idleShown: false,
  replays: 0,
  guide: { step: 0, since: 0, lastReveal: null },
  ride: null, // the camera riding the energy after a replay is committed
  lessonsAuto: false,
  t: 0,
  fps: 60,
};

const el = {
  attract: $('#attract'), clock: $('#clock'), clockTime: $('#clock .time'), clockSub: $('#clock .sub'), promise: $('#promise'),
  labels: $('#labels'), captions: $('#captions'), cards: $('#cards'), panel: $('#panel'), toast: $('#toast'), lessons: $('#lessons'),
  tiers: $('#tiers'), controls: $('#controls'), chipChanged: $('#chipChanged'), chipLessons: $('#chipLessons'),
  btnPause: $('#btnPause'), btnSound: $('#btnSound'), btnHome: $('#btnHome'), idle: $('#idle'), staff: $('#staff'), corner: $('#corner'),
  guide: $('#guide'),
};

// Labels: one per node, positioned every frame.
const LABEL_OFFSET = { wind: 120, sun: 78, grid: 64, substation: 110, score: 40, battery: 112, car: 100, home: 128, bakery: 132, street: 76 };
const LABEL_REST = { car: 0.55, home: 0.55, bakery: 0.55, battery: 0.5, substation: 0.5, wind: 0.45, sun: 0.3, street: 0.3, grid: 0.25 };
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
/* Planning is event-driven: it runs on a committed change, never in the frame loop.
   Identical committed inputs are served from a bounded cache (physics only —
   permission is decided afresh every time by reviewAuthority). */
const planCache = new LruCache(32);
const diag = { solves: 0, cacheHits: 0, solveMs: 0 };
function plan(input) {
  const key = JSON.stringify({ p: input.promises, n: { ev: input.permissions.ev === 'never', heat: input.permissions.heat === 'never', bakery: input.permissions.bakery === 'never', battery: input.permissions.battery === 'never' }, r: input.resolutions, v: 2 });
  const hit = planCache.get(key);
  if (hit) { diag.cacheHits++; return hit; }
  const t0 = performance.now();
  const r = simulate(input);
  diag.solveMs = performance.now() - t0;
  diag.solves++;
  planCache.set(key, r);
  return r;
}

/** Put a new agreed intent and its plan into the world. */
function accept(input, sim, { replay = false } = {}) {
  if (typeof gov !== 'undefined') wake();
  app.accepted = clone(input);
  app.input = clone(input);
  app.pending = null;
  app.prevSim = app.sim;
  app.sim = sim;
  dayring.setSim(app.sim);
  renderCards();
  renderPromise();
  if (replay) {
    app.slotF = 0;
    app.decisionCursor = 0;
    app.replays++;
    app.mode = 'replay';
    // Choreography: the links whose schedule changed let go, the lit slots fly
    // around the ring to their new times, then the day starts again.
    const changedLinks = { ev: 'toCar', heat: 'toHome', bakery: 'toBakery', battery: 'battery' };
    let anyChange = false;
    if (app.prevSim) {
      for (const k in changedLinks) {
        const a = app.prevSim.schedules[k], b = app.sim.schedules[k];
        let diff = false; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) { diff = true; break; }
        if (diff) { ribbons.energy[changedLinks[k]].burst = 1; ribbons.info[{ ev: 'car', heat: 'home', bakery: 'bakery', battery: 'battery' }[k]]?.pulse(-1); anyChange = true; }
      }
      // which load moved? the ride follows the first one that did
      const moved = ['ev', 'heat', 'bakery', 'battery'].find((k) => { const a = app.prevSim.schedules[k], b = app.sim.schedules[k]; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return true; return false; });
      const dest = moved ? { ev: 'car', heat: 'home', bakery: 'bakery', battery: 'battery' }[moved] : null;
      if (dest && !reducedMotion && startRide(dest)) anyChange = true;
      else { const flights = dayring.migrate(app.prevSim, app.sim); anyChange = anyChange || flights > 0; }
    }
    guideEvent('replay');
    app.choreoUntil = app.ride ? Infinity : anyChange ? performance.now() + 2300 : 0; // wall clock: the pause must not stretch on a slow frame rate; a ride sets it when it lands
    app.timeScale = app.paused ? 0 : anyChange ? 0 : 1;
    app.lessonsAuto = false;
    audio.downbeat();
    if (app.ride) app.toastPending = true; else showToast();
    el.chipChanged.classList.remove('hidden');
    el.chipLessons.classList.remove('hidden');
    for (const c of app.sim.conflicts) if (!c.resolved) audio.ping('conflict');
  } else {
    syncCursor();
  }
}

/**
 * The visitor releases a draft. Loads set to "ask me first" may not have
 * their agreed schedule changed without a yes: if the draft would change
 * one, the world keeps the agreed plan, the modelled clock stops, and the
 * proposal waits. Nothing is dispatched while it waits.
 */
function commitDraft() {
  const proposed = plan(app.input);
  const review = reviewAuthority({ accepted: app.sim.schedules, proposed: proposed.schedules, permissions: app.input.permissions });
  if (review.status === PlanStatus.AWAITING_PERMISSION) {
    app.pending = { input: clone(app.input), sim: proposed, loads: review.pending };
    app.timeScale = 0;
    audio.setFrozen(true);
    audio.ping('ask');
    renderCards();
    renderPromise();
    return false;
  }
  accept(app.input, proposed, { replay: true });
  return true;
}
function approvePending() {
  if (!app.pending) return;
  const { input, sim } = app.pending;
  app.lastDeclined = false;
  accept(input, sim, { replay: true });
  audio.setFrozen(false);
}
function declinePending() {
  if (typeof gov !== 'undefined') wake();
  if (!app.pending) return;
  const wanted = app.pending.input.promises;
  app.pending = null;
  app.input = clone(app.accepted);
  app.lastDeclined = true;
  renderCards();
  renderPromise();
  const acc = app.accepted.promises;
  const lines = [];
  if (wanted.ev.departureClock !== acc.ev.departureClock || wanted.ev.targetPct !== acc.ev.targetPct) lines.push(`The car stays on the agreed plan: ${acc.ev.targetPct}% by ${formatClock(acc.ev.departureClock)}. Leaving at ${formatClock(wanted.ev.departureClock)} with ${wanted.ev.targetPct}% still needs a different plan.`);
  if (wanted.home.comfort !== acc.home.comfort) lines.push(`The house stays ${COMFORT_BANDS[acc.home.comfort].words} (${COMFORT_BANDS[acc.home.comfort].label}).`);
  if (wanted.bakery.openingClock !== acc.bakery.openingClock) lines.push(`The bakery still opens at ${formatClock(acc.bakery.openingClock)}.`);
  if (!lines.length) lines.push('Nothing was changed behind your back.');
  el.toast.innerHTML = `<div class="kicker">You said no</div><div class="big">Your agreed plan stays in force.</div><ul class="one">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 9000);
  if (app.mode !== 'reveal' && !app.paused) app.timeScale = 1;
  audio.setFrozen(false);
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
  const ev = L(s.ev), heat = L(s.heat), ovens = L(s.ovens), cold = L(s.cold), battery = L(s.battery), lend = s.lend ? L(s.lend) : 0;
  const evSoc = s.evSoc[i] + (s.evSoc[i + 1] - s.evSoc[i]) * f;
  const temp = s.temp[i] + (s.temp[i + 1] - s.temp[i]) * f;
  const bSoc = (s.batterySoc[i] + (s.batterySoc[i + 1] - s.batterySoc[i]) * f) / SCENARIO.battery.capacityKwh;
  const depart = sim.parts.ev.depart;
  const carAway = slotF >= depart && slotF < SLOTS - 2;
  return {
    dt, i, wind, solar, feeder, street, ev, heat, ovens, cold, battery, evSoc, temp, bSoc, carAway, lend,
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
      if (f.evKw < -0.1) return `selling ${(-f.evKw).toFixed(0)} kW to the street · ${f.evSoc.toFixed(0)}%`;
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
      return `${(f.bSoc * 100).toFixed(0)}% · ${f.batteryKw > 0.1 ? `storing ${f.batteryKw.toFixed(0)} kW` : f.batteryKw < -0.1 ? `${sim.parts.battery.trade ? 'selling' : 'releasing'} ${(-f.batteryKw).toFixed(0)} kW` : 'holding'}`;
    case 'wind': return `${f.wind.toFixed(0)} kW to the street · ${windWords(f.wind)}`;
    case 'sun': return f.solar > 0.5 ? `${f.solar.toFixed(0)} kW from the rooftops` : 'night';
    case 'substation': return `${Math.max(0, f.feeder).toFixed(0)} of ${SCENARIO.feederLimitKw} kW${f.feeder > SCENARIO.feederLimitKw ? ' · OVER LIMIT' : ''}`;
    case 'street': return f.lend > 0.1 ? `lending ${f.lend.toFixed(0)} kW to the cable · the network asked` : `${f.street.toFixed(0)} kW · ${f.street > 34 ? 'dinner time' : f.street < 14 ? 'asleep' : 'ticking over'}`;
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
  const askCount = Object.values(pm).filter((v) => v === 'ask').length;
  el.promise.innerHTML = `<b>Your agreed promises</b>Car ${p.ev.targetPct}% by ${formatClock(p.ev.departureClock)}${p.ev.priceCapPence != null ? ` for ≤ ${money(p.ev.priceCapPence)}` : ''}${p.ev.exportAllowed ? ', may sell at the peak' : ''} · home ${COMFORT_BANDS[p.home.comfort].label} · bakery opens ${formatClock(p.bakery.openingClock)}${p.battery?.mode === 'trade' ? ' · battery trades' : ''}${p.battery?.share === false ? ' · battery never lends' : ''}<br>${autoCount} of 4 things may be moved automatically${askCount ? `, ${askCount} only after asking you` : ''}${app.pending ? '<br><span class="pend">A change is waiting for your answer</span>' : ''}`;
}

function applyChange(apply) {
  if (app.reveal.id) closeReveal();
  if (apply.promises) for (const k in apply.promises) Object.assign(app.input.promises[k], apply.promises[k]);
  if (apply.permissions) for (const k in apply.permissions) app.input.permissions[k] = apply.permissions[k];
  if (apply.resolutions) Object.assign(app.input.resolutions, apply.resolutions);
  commitDraft();
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
  if (app.pending) {
    const P = app.pending;
    const names = { ev: 'your car', heat: 'your heating', bakery: "the bakery's cold store", battery: 'the battery' };
    const acc = app.accepted.promises, want = P.input.promises;
    const asks = [];
    if (want.ev.departureClock !== acc.ev.departureClock || want.ev.targetPct !== acc.ev.targetPct || want.ev.priceCapPence !== acc.ev.priceCapPence) asks.push(`the car at ${want.ev.targetPct}% by ${formatClock(want.ev.departureClock)}${want.ev.priceCapPence != null ? ` for ≤ ${money(want.ev.priceCapPence)}` : ''}`);
    if (want.home.comfort !== acc.home.comfort) asks.push(`the house ${COMFORT_BANDS[want.home.comfort].words}`);
    if (want.bakery.openingClock !== acc.bakery.openingClock) asks.push(`the bakery open at ${formatClock(want.bakery.openingClock)}`);
    const changes = P.loads.map((id) => {
      const a = describeRuns(runs(app.sim.schedules[id])), b = describeRuns(runs(P.sim.schedules[id]));
      return `<li><b>${names[id]}</b>: ${a} → ${b}</li>`;
    }).join('');
    const dCost = P.sim.metrics.homeCostPence - app.sim.metrics.homeCostPence;
    const d = document.createElement('div');
    d.className = 'card request';
    d.innerHTML = `<div class="kicker">Ask before changing an agreed plan</div><h3>${asks.length ? `You asked for ${asks.join(' and ')}.` : 'This would change an agreed plan.'} May I change the plan?</h3><p>You told me to ask before moving ${P.loads.map((id) => names[id]).join(' and ')}. The clock is stopped while you decide; the agreed plan stays in force until you say yes.</p><ul class="changes">${changes}</ul><p>Your home's day would be ${money(P.sim.metrics.homeCostPence)} (${dCost >= 0 ? '+' : '−'}${money(Math.abs(dCost))}).${P.sim.conflicts.length ? ' The new plan also raises a conflict you would need to settle.' : ''}</p><div class="opts"></div>`;
    const opts = d.querySelector('.opts');
    const yes = document.createElement('button'); yes.type = 'button'; yes.textContent = 'Yes, change the plan';
    yes.addEventListener('click', () => { noteInput(); approvePending(); });
    const no = document.createElement('button'); no.type = 'button'; no.className = 'ghost'; no.textContent = 'No, keep the agreed plan';
    no.addEventListener('click', () => { noteInput(); declinePending(); });
    opts.appendChild(yes); opts.appendChild(no);
    el.cards.prepend(d);
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
  if (a.metrics.evExportEarnedPence !== b.metrics.evExportEarnedPence) out.push(`Car earned: ${arrow(a.metrics.evExportEarnedPence, b.metrics.evExportEarnedPence, money, false)}`);
  if (a.metrics.batterySoldKwh !== b.metrics.batterySoldKwh) out.push(`Battery sold: ${arrow(a.metrics.batterySoldKwh, b.metrics.batterySoldKwh, (v) => `${v.toFixed(1)} kWh`, false)}`);
  if (a.metrics.lentKwh !== b.metrics.lentKwh) out.push(`Street lent: ${arrow(a.metrics.lentKwh, b.metrics.lentKwh, (v) => `${v.toFixed(1)} kWh`)}`);
  if (a.metrics.overloadMinutes !== b.metrics.overloadMinutes) out.push(`Cable over limit: ${arrow(a.metrics.overloadMinutes, b.metrics.overloadMinutes, (v) => `${v} min`)}`);
  const ha = a.parts.heat.preheatSlots * 15, hb = b.parts.heat.preheatSlots * 15;
  if (ha !== hb) out.push(`Home pre-warmed on wind: ${ha} → <b>${hb} min</b>`);
  const ca = describeRuns(runs(a.series.cold)), cb = describeRuns(runs(b.series.cold));
  if (ca !== cb) out.push(`Bakery cold store: ${ca} → <b>${cb}</b>`);
  if (b.conflicts.length) out.push(`<b class="up">${b.conflicts.length} decision${b.conflicts.length > 1 ? 's' : ''} need${b.conflicts.length > 1 ? '' : 's'} you</b>`);
  return out;
}
function changedInputs(a, b) {
  const out = [];
  if (a.promises.ev.departureClock !== b.promises.ev.departureClock) out.push(`departure ${formatClock(a.promises.ev.departureClock)} → ${formatClock(b.promises.ev.departureClock)}`);
  if (a.promises.ev.targetPct !== b.promises.ev.targetPct) out.push(`car target ${a.promises.ev.targetPct}% → ${b.promises.ev.targetPct}%`);
  if (a.promises.ev.priceCapPence !== b.promises.ev.priceCapPence) out.push(`spending limit ${a.promises.ev.priceCapPence == null ? 'none' : money(a.promises.ev.priceCapPence)} → ${b.promises.ev.priceCapPence == null ? 'none' : money(b.promises.ev.priceCapPence)}`);
  if (a.promises.home.comfort !== b.promises.home.comfort) out.push(`home ${COMFORT_BANDS[a.promises.home.comfort].label} → ${COMFORT_BANDS[b.promises.home.comfort].label}`);
  if (a.promises.bakery.openingClock !== b.promises.bakery.openingClock) out.push(`bakery opens ${formatClock(a.promises.bakery.openingClock)} → ${formatClock(b.promises.bakery.openingClock)}`);
  if (!!a.promises.ev.exportAllowed !== !!b.promises.ev.exportAllowed) out.push(`car ${b.promises.ev.exportAllowed ? 'may now sell' : 'no longer sells'} at the evening peak`);
  if ((a.promises.battery?.mode || 'keep') !== (b.promises.battery?.mode || 'keep')) out.push(`battery ${b.promises.battery.mode === 'trade' ? 'now trades with the grid' : 'now keeps the house running'}`);
  if ((a.promises.battery?.share ?? true) !== (b.promises.battery?.share ?? true)) out.push(`battery ${b.promises.battery.share ? 'may lend' : 'no longer lends'} to the street`);
  for (const k of ['ev', 'heat', 'bakery', 'battery']) if (a.permissions[k] !== b.permissions[k]) out.push(`${{ ev: 'car', heat: 'heating', bakery: 'cold store', battery: 'battery' }[k]} permission: ${a.permissions[k]} → ${b.permissions[k]}`);
  if (a.resolutions.evPriority !== b.resolutions.evPriority) out.push(`priority: ${b.resolutions.evPriority === 'price' ? 'the price limit' : 'the departure target'}`);
  return out;
}
function showToast(auto = true) {
  if (!app.prevSim) return;
  const lines = diffLines(app.prevSim, app.sim);
  const changed = changedInputs(app.prevSim, app.sim);
  el.toast.innerHTML = `<div class="kicker">Replaying the same day</div><div class="big">Same starting point. ${changed.length ? changed[0].charAt(0).toUpperCase() + changed[0].slice(1) + '.' : 'Different human requirements.'}</div>${changed.length > 1 ? `<div class="also">Also: ${changed.slice(1).join(' · ')}.</div>` : ''}<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><div class="fine">Same equipment, same weather, same tariff. "Your home's day" = the car, heating, battery and base load at the scenario tariff.</div>`;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  if (auto) toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 11000);
}
function showLessons() {
  if (typeof gov !== 'undefined') wake();
  const ls = lessons(app.sim, app.prevSim, { pending: !!app.pending, declined: app.lastDeclined });
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
    { kind: 'chips', label: 'Sell power to the street at the evening peak (vehicle to grid)', key: ['promises', 'ev', 'exportAllowed'], options: [false, true], fmt: (v) => (v ? `Yes, keep ${SCENARIO.ev.exportReservePct}% in reserve` : 'No') },
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
    { kind: 'chips', label: 'Use the battery to', key: ['promises', 'battery', 'mode'], options: ['keep', 'trade'], fmt: (v) => (v === 'trade' ? 'Trade with the grid' : 'Keep the house running') },
    { kind: 'chips', label: 'Lend to the street when the network asks', key: ['promises', 'battery', 'share'], options: [true, false], fmt: (v) => (v ? 'Yes' : 'No') },
    { kind: 'perm', label: 'What the system may do with the battery', key: ['permissions', 'battery'] },
  ],
};
const PERM_LABELS = { auto: 'You can reschedule this automatically.', ask: 'Ask me before changing it.', never: 'Never move this.' };

function getIn(o, path) { return path.reduce((a, k) => a[k], o); }
function setIn(o, path, v) { const p = path.slice(); const last = p.pop(); getIn(o, p)[last] = v; }

function openReveal(id, { viaPull = false } = {}) {
  if (typeof gov !== 'undefined') wake();
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
  const tech = p.querySelector('.tech');
  if (ex.technical) {
    const t = ex.technical;
    tech.innerHTML = `<div class="row"><span>Status</span><code>${t.status}</code></div><div class="row"><span>Reason codes</span><code>${t.reasonCodes.join(', ') || '—'}</code></div><div class="row"><span>Binding limits</span><span>${t.bindingConstraints.join('; ') || '—'}</span></div>${t.observations.length ? `<div class="row"><span>Evidence</span><span>${t.observations.map((o) => `${o.key} = ${o.value}${o.unit ? ' ' + o.unit : ''}`).join(' · ')}</span></div>` : ''}<div class="row"><span>Assumptions</span><span>${t.assumptions.map((a) => `<div>${a}</div>`).join('')}</span></div>`;
    tech.classList.remove('hidden');
  } else tech.classList.add('hidden');
  p.classList.remove('deep', 'tech-open');
  p.querySelector('.more').textContent = 'Show me the working';
  guideEvent('reveal', id);
  renderControls(id);
  p.querySelector('.release').classList.remove('dirty');
  p.querySelector('.release').textContent = 'Release';
  if (app.pending) p.querySelector('.controls').insertAdjacentHTML('afterbegin', '<div class="ctl pendnote">A change to the agreed plan is waiting for your answer. Answer it first, or edit again to replace it.</div>');
  p.classList.remove('hiddenpanel');
  if (!viaPull) { p.classList.remove('pulling'); p.classList.add('open'); p.style.setProperty('--pull', 1); }
  audio.setFrozen(true);
}

function renderControls(id) {
  const box = el.panel.querySelector('.controls');
  box.innerHTML = '';
  const defs = CONTROLS[id]?.(app.input) || [];
  if (defs.length && app.guide.step === 2) box.innerHTML = guideNote();
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
        b.addEventListener('click', () => { setIn(app.input, d.key, o); c.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); markDirty(); });
        c.appendChild(b);
      }
      wrap.appendChild(c);
    }
    box.appendChild(wrap);
  }
}
function markDirty() {
  noteInput();
  xr.refreshPanel();
  app.reveal.dirty = true;
  const b = el.panel.querySelector('.release');
  b.classList.add('dirty');
  b.textContent = 'Replay with this change';
}
function closeReveal({ replay = false } = {}) {
  if (typeof gov !== 'undefined') wake();
  app.reveal.condense = Math.min(app.reveal.condense, 0.9);
  el.panel.classList.remove('open', 'pulling');
  el.panel.style.setProperty('--pull', 0);
  app.reveal.id = null;
  let accepted = true;
  if (replay) accepted = commitDraft();
  else { app.mode = 'live'; guideEvent('close'); }
  if (!app.paused && accepted && !app.pending && !app.choreoUntil) app.timeScale = 1;
  if (accepted && !app.pending) audio.setFrozen(false);
}

/* ------------------------------------------------------------------ */
/* Guided first minute                                                  */
/* ------------------------------------------------------------------ */
/* Kiosks need verbs. One prompt at a time, anchored to a real object, and
   each is dismissed only by doing it:
     1  touch the car                       → a reveal opens
     2  change when you leave, then Replay  → a replay is committed
     3  the day has been replanned; now try your home → another reveal opens
   The guide is per visitor: reset returns it to the start. */
const GUIDE_STEPS = {
  1: { anchor: 'car', kicker: 'Start here', title: 'Touch the car', sub: 'Every object here made a decision tonight. Touch one to see it.' },
  2: { anchor: null, kicker: 'Step 2 of 3', title: 'Change when you leave, then press Replay', sub: 'The whole street replans the same night around your new answer.' },
  3: { anchor: 'home', kicker: 'Step 3 of 3', title: 'Now try your home', sub: 'Everything is connected. Watch what your comfort setting moves.' },
};
const GUIDE_CHANGE = {
  car: 'Change when you leave, then press Replay',
  home: 'Change how warm to keep the house, then press Replay',
  bakery: 'Change when the bakery opens, then press Replay',
  battery: 'Change what the system may do, then press Replay',
};
const GUIDE_NEXT = { home: { title: 'Now try your home', sub: 'Everything is connected. Watch what your comfort setting moves.' }, car: { title: 'Now try the car', sub: 'Everything is connected. Watch what your departure time moves.' } };
function setGuide(step) {
  const g = app.guide;
  if (g.step === step) return;
  g.step = step;
  g.since = performance.now();
  const def = GUIDE_STEPS[step];
  el.guide.classList.toggle('hidden', !def || !def.anchor);
  g.anchor = null;
  if (def && def.anchor) {
    let { anchor, title, sub } = def;
    if (step === 3) { anchor = g.lastReveal === 'home' ? 'car' : 'home'; ({ title, sub } = GUIDE_NEXT[anchor]); }
    g.anchor = anchor;
    el.guide.querySelector('b').textContent = title;
    el.guide.querySelector('span').textContent = sub;
    let k = el.guide.querySelector('.step');
    if (!k) { k = document.createElement('div'); k.className = 'step'; el.guide.querySelector('.text').prepend(k); }
    k.textContent = def.kicker;
    // turn to face the anchor so the prompt is on screen
    const b = bearingOf(nodes.get(g.anchor).world);
    cam.userYaw = b.yaw; cam.userPitch = clamp(b.pitch - 0.05, -0.2, 0.3);
  }
  if (typeof gov !== 'undefined') wake();
}
function guideNote() {
  const g = app.guide;
  if (g.step !== 2) return '';
  const d = GUIDE_STEPS[2];
  return `<div class="ctl guidenote"><span class="step">${d.kicker}</span>${GUIDE_CHANGE[g.lastReveal] || d.title}. ${d.sub}</div>`;
}
/** Events the guide listens to. */
function guideEvent(evt, arg) {
  const g = app.guide;
  if (g.step === 0 || g.step == null) return;
  if (evt === 'reveal') {
    if (g.step === 1) { g.lastReveal = arg; setGuide(2); }
    else if (g.step === 2) g.lastReveal = arg;
    else if (g.step === 3 && arg !== g.lastReveal) { setGuide(0); showHint(); }
  } else if (evt === 'close') {
    if (g.step === 2) setGuide(1);
  } else if (evt === 'replay') {
    if (g.step === 2) { g.step = 2.5; g.since = performance.now(); el.guide.classList.add('hidden'); }
  } else if (evt === 'settled') {
    if (g.step === 2.5) setGuide(3);
  }
}
function showHint() {
  const hint = $('#hint');
  hint.classList.remove('hidden', 'fade');
  clearTimeout(app.hintTimer);
  app.hintTimer = setTimeout(() => { hint.classList.add('fade'); setTimeout(() => hint.classList.add('hidden'), 1100); }, 9000);
}

/* ------------------------------------------------------------------ */
/* The ride                                                             */
/* ------------------------------------------------------------------ */
/* When a change is committed, the visitor rides the energy: the camera leaves
   the eye, follows the strand from the source (wind if that is what will be
   charging it, otherwise the wider grid) through the street's cable and into
   the object that moved, then lands looking down at that object's arc on the
   ring as its lit quarter-hours fly to their new times, and returns to the
   eye as the day starts again. It is the one moment of being *in* the flow,
   and it ends where the decision can be read. Wall-clock timed. */
const RIDE = { fly: 8.2, land: 2.4, back: 1.8 }; // seconds; fly includes the shrink from the eye into the source strand
const RIDE_LINK = { car: 'toCar', home: 'toHome', bakery: 'toBakery', battery: 'battery' };
function startRide(dest) {
  const link = ribbons.energy[RIDE_LINK[dest]];
  if (!link) return false;
  const first = dayring.firstActive(dest);
  const slot0 = first >= 0 ? first : 0;
  const src = app.sim.series.renewFrac[slot0] >= 0.5 ? 'windIn' : 'gridIn';
  const pts = [];
  // from the eye, shrink towards the source, then along its strand: the hop is short so most of the ride is inside the flow
  const srcStart = ribbons.energy[src].curve.getPointAt(0).clone(); srcStart.y += 0.35;
  for (let i = 0; i < 12; i++) { const u = i / 12; pts.push(EYE.clone().lerp(srcStart, u * u * (3 - 2 * u)).add(new THREE.Vector3(0, Math.sin(u * Math.PI) * 1.2, 0))); }
  for (let i = 0; i <= 40; i++) { const v = ribbons.energy[src].curve.getPointAt(i / 40); v.y += 0.35; pts.push(v); }
  for (let i = 1; i <= 40; i++) { const v = link.curve.getPointAt(i / 40); v.y += 0.35; pts.push(v); }
  const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const target = nodes.get(dest).world;
  const bead = dayring.beadAt(dest, slot0);
  const landPos = target.clone().add(EYE.clone().sub(target).normalize().multiplyScalar(4.8)).add(new THREE.Vector3(0, 1.4, 0));
  app.ride = { t0: performance.now(), dest, src, path, target, bead, landPos, phase: 'fly', endPos: path.getPointAt(1), migrated: false, looked: false };
  app.rideAmt = 0;
  ribbons.energy[src].burst = 1;
  link.burst = 1;
  return true;
}
/** Advance the ride; returns true while it owns the camera. */
function updateRide(now, pos, look) {
  const r = app.ride;
  if (!r) return false;
  const t = (now - r.t0) / 1000;
  const smooth = (u) => u * u * (3 - 2 * u);
  if (t < RIDE.fly) {
    // ease in slowly (the shrink), cruise, ease out at the object
    const x = clamp(t / RIDE.fly, 0, 1);
    const u = x < 0.22 ? 0.12 * Math.pow(x / 0.22, 2) : 0.12 + 0.88 * smooth((x - 0.22) / 0.78);
    r.path.getPointAt(u, pos);
    r.path.getPointAt(Math.min(1, u + 0.02), look);
    if (u > 0.985) look.copy(r.target);
    app.rideAmt = Math.min(1, t / 1.6); // the world grows around you as you become small
    return true;
  }
  // phase entries are idempotent and also run at the end, so a slow or hidden frame rate can never skip them
  const land = () => {
    if (r.migrated) return;
    r.migrated = true;
    // the lit quarter-hours fly to their new times while the visitor is looking at the ring
    if (app.prevSim) dayring.migrate(app.prevSim, app.sim);
    dayring.spotlight(r.dest, 3.2);
  };
  const lookHome = () => {
    if (r.looked) return;
    r.looked = true;
    const b = bearingOf(r.target);
    cam.userYaw = b.yaw; cam.userPitch = clamp(b.pitch - 0.06, -0.3, 0.3);
    cam.yaw = cam.yawT = b.yaw; cam.pitch = cam.pitchT = cam.userPitch + 0.02; cam.dolly = cam.dollyT = 0;
    app.choreoUntil = performance.now() + RIDE.back * 1000 + 300;
  };
  if (t < RIDE.fly + RIDE.land) {
    land();
    const u = smooth(clamp((t - RIDE.fly) / RIDE.land, 0, 1));
    pos.copy(r.endPos).lerp(r.landPos, u);
    look.copy(r.target).lerp(r.bead, u);
    app.rideAmt = 1 - u; // back to full size as you land
    return true;
  }
  if (t < RIDE.fly + RIDE.land + RIDE.back) {
    land(); lookHome();
    const u = smooth(clamp((t - RIDE.fly - RIDE.land) / RIDE.back, 0, 1));
    app.rideAmt = 0;
    pos.copy(r.landPos).lerp(EYE, u);
    const fwd = forwardOf(cam.yaw, cam.pitch).add(EYE);
    look.copy(r.bead).lerp(fwd, u);
    return true;
  }
  land(); lookHome();
  app.ride = null;
  app.rideAmt = 0;
  if (app.toastPending) { app.toastPending = false; showToast(); }
  return false;
}

/* ------------------------------------------------------------------ */
/* Mode transitions                                                     */
/* ------------------------------------------------------------------ */
function showUI(show) {
  el.clock.classList.toggle('show', show);
  el.controls.classList.toggle('show', show);
  el.promise.classList.toggle('hidden', !show);
  el.cards.classList.toggle('hidden', !show);
}
function leaveAttract() {
  if (app.mode !== 'attract') return;
  app.mode = 'live';
  el.attract.classList.remove('show');
  setGuide(1);
  showUI(true);
  if (settings.sound) { audio.enable(); el.btnSound.classList.add('on'); }
}
function resetToAttract() {
  if (typeof gov !== 'undefined') wake();
  app.input = { promises: clone(DEFAULT_PROMISES), permissions: clone(DEFAULT_PERMISSIONS), resolutions: {} };
  app.accepted = clone(app.input);
  app.pending = null;
  app.lastDeclined = false;
  app.prevSim = null;
  app.sim = plan(app.input);
  dayring.setSim(app.sim);
  dayring.setGhost(null);
  renderCards(); renderPromise();
  app.slotF = 0; app.decisionCursor = 0; app.replays = 0; app.paused = false; app.timeScale = 1;
  app.reveal = { id: null, pull: 0, dirty: false, condense: 0 };
  app.mode = 'attract';
  el.panel.classList.remove('open', 'pulling', 'deep'); el.panel.style.setProperty('--pull', 0);
  el.toast.classList.add('hidden'); el.lessons.classList.add('hidden'); el.idle.classList.add('hidden'); el.staff.classList.add('hidden');
  el.chipChanged.classList.add('hidden'); el.chipLessons.classList.add('hidden');
  el.btnPause.classList.remove('paused');
  el.captions.innerHTML = '';
  el.attract.classList.add('show');
  $('#hint').classList.add('hidden');
  cam.userYaw = 0; cam.userPitch = 0;
  app.guide = { step: 0, since: 0, lastReveal: null }; el.guide.classList.add('hidden');
  app.ride = null; app.rideAmt = 0; app.choreoUntil = 0; app.toastPending = false;
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
  const fwd = forwardOf(cam.yaw, cam.pitch);
  if (nodeId) plane.setFromNormalAndCoplanarPoint(fwd.clone().negate(), nodes.get(nodeId).world);
  else plane.setFromNormalAndCoplanarPoint(fwd.clone().negate(), camPos.clone().add(fwd.multiplyScalar(9)));
  if (!ray.ray.intersectPlane(plane, out)) out.copy(camPos).add(forwardOf(cam.yaw, cam.pitch).multiplyScalar(9));
  return out;
}
touch.on('down', ({ x, y, node }) => {
  noteInput();
  if (app.ride) return; // the ride owns the camera for a few seconds
  const first = app.mode === 'attract';
  leaveAttract();
  if (app.mode === 'reveal') return; // the panel owns the interaction
  app.holding = true;
  app.timeScale = 0;
  // the baton: a drag that starts on an arc of the ring sweeps time to wherever the finger goes
  app.baton = !node && app.mode !== 'attract' ? dayring.nearest(R.camera, R.state.width, R.state.height, x, y) : null;
  app.batonTarget = null;
  app.touch.lastX = x; app.touch.lastY = y;
  app.touch.world.copy(worldAt(x, y, node));
  app.touch.x = x; app.touch.y = y;
  app.touch.targetStrength = 1;
  if (first) audio.ping('decision');
  audio.setFrozen(true);
});
touch.on('move', ({ x, y, node }) => {
  if (!app.holding) return;
  if (app.baton) {
    const s = dayring.slotAtScreen(R.camera, R.state.width, R.state.height, x, y);
    if (s != null && Math.hypot(x - app.touch.lastX, y - app.touch.lastY) > 0) { app.batonTarget = s; app.scrubbing = true; }
    app.touch.x = x; app.touch.y = y;
    return;
  }
  if (!node && app.touch.lastX != null) {
    // dragging empty space turns your head
    const k = (R.camera.fov * Math.PI / 180) / R.state.height;
    cam.userYaw = wrapAngle(cam.userYaw - (x - app.touch.lastX) * k);
    cam.userPitch = clamp(cam.userPitch + (y - app.touch.lastY) * k * 0.7, -0.35, 0.5);
    app.looked = true;
  }
  app.touch.lastX = x; app.touch.lastY = y;
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
touch.on('tap', ({ x, y, node }) => {
  app.holding = false;
  if (app.ride) return;
  if (app.looked) { app.looked = false; return; }
  const target = node || (app.mode !== 'attract' ? dayring.nearest(R.camera, R.state.width, R.state.height, x, y) : null);
  if (app.mode === 'reveal') { if (target && target !== app.reveal.id) openReveal(target); return; }
  if (target) openReveal(target);
});
touch.on('up', () => {
  app.holding = false;
  app.baton = null; app.batonTarget = null; app.scrubbing = false;
  app.touch.lastX = null;
  setTimeout(() => { app.looked = false; }, 50);
  app.touch.targetStrength = 0;
  if (app.mode !== 'reveal' && !app.paused) { setTimeout(() => { if (!app.holding && app.mode !== 'reveal' && !app.paused && !app.pending) { app.timeScale = 1; audio.setFrozen(false); } }, 700); }
});

/* Panel buttons */
el.panel.querySelector('.more').addEventListener('click', () => { noteInput(); el.panel.classList.toggle('deep'); el.panel.querySelector('.more').textContent = el.panel.classList.contains('deep') ? 'Hide the working' : 'Show me the working'; });
el.panel.querySelector('.techbtn').addEventListener('click', () => { noteInput(); el.panel.classList.toggle('tech-open'); });
$('#chipWhy').addEventListener('click', () => { noteInput(); leaveAttract(); openReveal('car'); });
el.panel.querySelector('.release').addEventListener('click', () => { noteInput(); closeReveal({ replay: app.reveal.dirty }); });
el.panel.querySelector('.close').addEventListener('click', () => { noteInput(); closeReveal({ replay: false }); });
el.panel.addEventListener('pointerdown', (e) => { e.stopPropagation(); noteInput(); });

/* Corner controls */
el.btnPause.addEventListener('click', () => {
  noteInput();
  app.paused = !app.paused;
  el.btnPause.classList.toggle('paused', app.paused);
  if (app.mode !== 'reveal') app.timeScale = app.paused || app.pending ? 0 : 1;
  audio.setFrozen(app.paused);
});
el.btnSound.addEventListener('click', () => {
  noteInput();
  if (audio.enabled) { audio.disable(); el.btnSound.classList.remove('on'); }
  else { audio.enable(); el.btnSound.classList.toggle('on', audio.enabled); }
});
el.btnHome.addEventListener('click', () => resetToAttract());
XRMode.supported().then((ok) => { if (ok) $('#vrbtn').classList.remove('hidden'); });
$('#vrbtn').addEventListener('click', () => { noteInput(); leaveAttract(); xr.enter().catch((e) => { console.warn('VR session refused', e); }); });
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
  settings[s.dataset.k] = s.dataset.k === 'profile' ? s.value : Number(s.value); saveSettings();
  if (s.dataset.k === 'profile') { R.setProfile(settings.profile); gov.setRates(prof().rates); }
  if (s.dataset.k === 'sound') { if (settings.sound) { audio.enable(); el.btnSound.classList.add('on'); } else { audio.disable(); el.btnSound.classList.remove('on'); } }
}));
el.staff.querySelector('.x').addEventListener('click', () => el.staff.classList.add('hidden'));
el.staff.querySelector('.reset').addEventListener('click', () => resetToAttract());
el.staff.addEventListener('pointerdown', (e) => { e.stopPropagation(); noteInput(); });
window.addEventListener('keydown', (e) => { if (e.key === ' ') el.btnPause.click(); if (e.key === 'Escape') { if (app.mode === 'reveal') closeReveal(); else if (!el.staff.classList.contains('hidden')) el.staff.classList.add('hidden'); } });

/* ------------------------------------------------------------------ */
/* Captions: the moment a decision is made                              */
/* ------------------------------------------------------------------ */
const captionPool = [];
const listenerUp = new THREE.Vector3(0, 1, 0);
audio.setPositions({ strings: nodes.get('wind').world.toArray(), pad: nodes.get('home').world.toArray(), brass: nodes.get('bakery').world.toArray(), cello: nodes.get('car').world.toArray(), harp: nodes.get('battery').world.toArray(), timpani: nodes.get('substation').world.toArray() });
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
let fpsWin = []; // raw frame gaps, ms, for the last second of genuine animation
let lastInputFrame = 0;
let domTick = 0;
let settledFrames = 0;

/** Something happened that must be drawn: wake the governor. */
function wake() {
  lastInputFrame = performance.now();
  if (!document.hidden) gov.setMode('ACTIVE');
  gov.invalidate();
}
window.addEventListener('pointerdown', wake, { capture: true, passive: true });
window.addEventListener('pointermove', (e) => { if (e.buttons) wake(); }, { capture: true, passive: true });
window.addEventListener('pointerup', wake, { capture: true, passive: true });
window.addEventListener('keydown', wake, { capture: true });
window.addEventListener('resize', () => wake());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { gov.setMode('HIDDEN'); audio.setFrozen(true); }
  else { wake(); }
});

/** Decide the frame policy from what the visitor is doing. */
function chooseMode(settled, now) {
  if (document.hidden) return 'HIDDEN';
  const recentInput = now - lastInputFrame < 900;
  if (recentInput || app.holding || app.scrubbing) return 'ACTIVE';
  const playing = app.timeScale > 0 || app.timeScaleCur > 0;
  if (playing) return 'ATTRACT'; // ambient / playback: the drifting camera is the intended 30 fps motion
  if (!settled) return 'ACTIVE'; // a reveal, ripple or projection still moving
  if (app.mode === 'reveal' || app.pending) return 'READING';
  return 'PAUSED';
}

function tick({ ts: now, rawGapMs, dt: dtRaw }) {
  app.t += dtRaw;
  // measurement time: raw gaps, never the clamped visual delta
  if (gov.mode === 'ATTRACT' || gov.mode === 'ACTIVE') { fpsWin.push(rawGapMs); if (fpsWin.length > 120) fpsWin.shift(); }
  const dayLen = app.mode === 'replay' ? settings.dayLength * 0.7 : settings.dayLength;
  const slotsPerSec = SLOTS / dayLen;

  // time
  app.timeScaleCur += (app.timeScale - app.timeScaleCur) * (1 - Math.exp(-dtRaw * (app.timeScale < app.timeScaleCur ? 12 : 4)));
  if (Math.abs(app.timeScale - app.timeScaleCur) < 0.005) app.timeScaleCur = app.timeScale;
  const prevSlot = Math.floor(app.slotF);
  app.slotF = Math.max(0, app.slotF + dtRaw * slotsPerSec * app.timeScaleCur);
  if (app.batonTarget != null && app.holding) {
    // sweep the day to the slot under the finger, the short way round
    let d = app.batonTarget - app.slotF;
    if (d > SLOTS / 2) d -= SLOTS; if (d < -SLOTS / 2) d += SLOTS;
    app.slotF = ((app.slotF + d * Math.min(1, dtRaw * 9)) % SLOTS + SLOTS) % SLOTS;
    syncCursor();
  }
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
    if (slot !== prevSlot) audio.beat(slot, f, (dayLen / SLOTS) / Math.max(app.timeScaleCur, 0.2));
    if (slot !== prevSlot && slot % 8 === 0) { for (const id of ['car', 'home', 'bakery', 'wind']) ribbons.info[id]?.pulse(1); }
    if (slot !== prevSlot && slot % 12 === 6) { ribbons.info.substation?.pulse(1); ribbons.info.battery?.pulse(1); }
  }

  // touch ripple
  const ts = app.touch;
  const k = 1 - Math.exp(-dtRaw * 7);
  const inReveal = app.mode === 'reveal' && app.reveal.id;
  const ripTarget = inReveal ? 0.6 : (ts.targetStrength || 0) * (reducedMotion ? 0.4 : 1);
  ts.strength += (ripTarget - ts.strength) * k;
  ts.r += ((inReveal ? 6 : ts.targetStrength ? 7.5 : 0) - ts.r) * k * 0.7;
  if (inReveal) ts.world.lerp(nodes.get(app.reveal.id).world, k);

  // choreography gate: the day restarts once the slots have flown
  if (app.choreoUntil && performance.now() >= app.choreoUntil && (!dayring.choreo || performance.now() >= app.choreoUntil + 4000)) { app.choreoUntil = 0; if (!app.paused && !app.pending && app.mode !== 'reveal') app.timeScale = 1; }

  // camera: standing at the centre, looking around
  const guiding = app.guide.step === 1 || app.guide.step === 3;
  const drift = frozen || reducedMotion || guiding ? 0 : 1;
  const landscape = R.state.width / R.state.height > 1 && R.state.width > 760;
  if (app.mode === 'reveal' && app.reveal.id) {
    // turn to face the object and step a little towards it, placing it beside the panel (landscape) or above the sheet (portrait)
    const b = bearingOf(nodes.get(app.reveal.id).world);
    const vFov = THREE.MathUtils.degToRad(R.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * R.camera.aspect);
    const panelFrac = landscape ? 440 / R.state.width : 0;
    const targetX = landscape ? (1 - panelFrac) * 0.5 : 0.5;
    const targetY = landscape ? 0.46 : 0.30;
    cam.yawT = b.yaw + (0.5 - targetX) * hFov;
    cam.pitchT = b.pitch - (0.5 - targetY) * vFov * 0.9;
    // stop at a viewing distance set per object (bigger objects further), so a projection never fills the frame
    const view = nodes.get(app.reveal.id).def.view;
    cam.dollyT = view ? Math.max(0, b.dist - view * (landscape ? 1 : 1.3)) : b.dist * (landscape ? 0.42 : 0.3);
  } else {
    cam.yawT = cam.userYaw + Math.sin(app.t * 0.045) * 0.55 * drift;
    cam.pitchT = cam.userPitch + 0.02 + Math.sin(app.t * 0.031) * 0.03 * drift;
    cam.dollyT = 0;
  }
  const ease = 1 - Math.exp(-dtRaw * (reducedMotion ? 18 : 2.4));
  cam.yaw += wrapAngle(cam.yawT - cam.yaw) * ease;
  cam.pitch += (cam.pitchT - cam.pitch) * ease;
  cam.dolly += (cam.dollyT - cam.dolly) * ease;
  const camDist = Math.abs(wrapAngle(cam.yawT - cam.yaw)) * 8 + Math.abs(cam.pitchT - cam.pitch) * 8 + Math.abs(cam.dollyT - cam.dolly);
  if (camDist < 0.02) { cam.yaw = cam.yawT; cam.pitch = cam.pitchT; cam.dolly = cam.dollyT; }
  const fwd = forwardOf(cam.yaw, cam.pitch);
  camPos.copy(EYE).add(fwd.clone().multiplyScalar(cam.dolly));
  camLook.copy(camPos).add(fwd);
  const riding = updateRide(performance.now(), camPos, camLook);
  if (xr.presenting) xr.update({ eye: EYE, ridePos: camPos, riding, revealId: app.reveal.id });
  else { R.camera.position.copy(camPos); R.camera.lookAt(camLook); }
  {
    const amt = app.rideAmt || 0;
    const fov = R.state.fov + 26 * amt;
    if (Math.abs(R.camera.fov - fov) > 0.01) { R.camera.fov = fov; R.camera.updateProjectionMatrix(); }
    for (const k2 in ribbons.energy) {
      const m = ribbons.energy[k2].mat.uniforms;
      if (ribbons.energy[k2].baseSize == null) ribbons.energy[k2].baseSize = m.uSize.value;
      m.uSize.value = ribbons.energy[k2].baseSize * (1 + 1.2 * amt);
      m.uMaxSize.value = 26 + 18 * amt; // the halo pass is 3.8× this, so keep it modest: fill cost, not taste, is the limit
    }
  }

  // scene state
  const revealId = app.reveal.id;
  const wantCondense = revealId && el.panel.classList.contains('open') ? 1 : 0;
  if (revealId) nodes.hologram(revealId);
  app.reveal.condense += (wantCondense - app.reveal.condense) * (1 - Math.exp(-dtRaw * (wantCondense ? 2.2 : 7)));
  if (Math.abs(app.reveal.condense - wantCondense) < 0.01) app.reveal.condense = wantCondense;
  // visual time freezes while the visitor reads: no shimmer, no drifting dust
  const visualTime = gov.mode === 'READING' ? app.tFrozen : (app.tFrozen = app.t);
  nodes.update({ time: visualTime, pixelRatio: R.state.pixelRatio, touch: ts.world, touchR: ts.r, touchStrength: ts.strength, revealId, spread: app.reveal.pull * 0.6, dim: 1, frame: { ...f, frozen, infoActivity: 0.3 }, condense: app.reveal.condense });
  const E = ribbons.energy;
  const imp = Math.max(0, f.feeder);
  E.windIn.flow = Math.min(f.wind, imp);
  E.gridIn.flow = Math.max(0, imp - f.wind);
  E.sunIn.flow = f.solar;
  E.toCar.flow = f.evKw;
  E.toHome.flow = f.heatKw + SCENARIO.home.baseKw;
  E.toBakery.flow = f.bakeryKw;
  E.toStreet.flow = f.street - 2.5 * f.lend; // lending: the street sends power back up the strand
  E.battery.flow = f.batteryKw;
  const dimOthers = revealId ? 0.45 : 1;
  const linkOf = { windIn: 'wind', gridIn: 'grid', sunIn: 'sun', toCar: 'car', toHome: 'home', toBakery: 'bakery', toStreet: 'street', battery: 'battery' };
  const ribbonTime = riding ? 1 : app.timeScaleCur;
  // the strings: pitch from the tariff, shudder from cable strain
  const stringHz = 0.45 + 1.3 * clamp((f.price - 6) / 26, 0, 1);
  const shudder = clamp((f.cableFrac - 0.85) / 0.15, 0, 1);
  for (const k2 in E) E[k2].update(dtRaw, ribbonTime, { hz: stringHz, wave: 0.6, shudder: k2 === 'toStreet' || k2 === 'windIn' || k2 === 'gridIn' ? shudder : shudder * 0.5, dim: revealId && linkOf[k2] !== revealId && revealId !== 'substation' ? dimOthers : 1 });
  for (const k2 in ribbons.info) ribbons.info[k2].update(dtRaw, app.timeScaleCur, { trace: frozen || app.mode === 'reveal' ? (revealId ? (k2 === revealId ? 1 : 0.25) : 0.7) : 0.08 });
  field.update(dtRaw, app.timeScaleCur, revealId ? 0.5 : 1);
  const ringAct = { car: Math.abs(f.evKw) / 7, home: f.heatKw / 3, bakery: f.bakeryKw / 38, battery: Math.abs(f.batteryKw) / 5, substation: 0 };
  dayring.update(dtRaw, app.slotF, visualTime, frozen ? {} : ringAct, app.mode === 'replay');
  dayring.setDim(revealId ? 0.45 : app.mode === 'attract' ? 0.7 : 1);
  env.update(dtRaw, visualTime, camPos, {
    car: f.evKw > 0 ? 1 : 0.25, home: f.heatKw > 0 ? 0.9 : 0.3, bakery: f.bakeryKw > 8 ? 1 : 0.3, battery: Math.abs(f.batteryKw) > 0 ? 1 : 0.3,
    substation: 0.3 + 0.7 * Math.min(1, f.cableFrac), wind: 0.2 + 0.8 * f.windFrac, street: f.lend > 0.1 ? 1 : 0.3 + 0.7 * f.streetFrac,
  }, revealId ? 0.55 : 1);
  R.render();

  // audio follows activity
  if (audio.enabled) {
    audio.setFrame(f); audio.setSwell(app.rideAmt || 0);
    const head = xr.presenting ? xr.headPosition() : camPos;
    const hf = xr.presenting ? new THREE.Vector3(0, 0, -1).applyQuaternion(R.renderer.xr.getCamera().quaternion) : forwardOf(cam.yaw, cam.pitch);
    audio.setListener(head, hf, listenerUp);
  }

  // HTML overlay: positions every rendered frame; text at ~4 Hz or on change
  const proj = nodes.project(R.camera, R.state.width, R.state.height);
  touch.setProjected(proj);
  const textNow = now - domTick > 250;
  if (textNow) domTick = now;
  const showLabels = app.mode !== 'attract' && !riding;
  for (const id in labelEls) {
    const L = labelEls[id]; const p = proj[id];
    let op = 0;
    const pendingNode = { ev: 'car', heat: 'home', bakery: 'bakery', battery: 'battery' };
    const pending = !!app.pending && app.pending.loads.some((l) => pendingNode[l] === id);
    if (showLabels && p.visible && Math.abs(p.x - R.state.width / 2) < R.state.width * 0.6) {
      if (app.mode === 'reveal') op = id === revealId ? 1 : 0.28;
      else if (app.holding || app.scrubbing || app.paused) op = app.holding ? clamp(1.15 - Math.hypot(p.x - ts.x, p.y - ts.y) / 520, 0.3, 1) : 0.9;
      else op = pending ? 0.85 : riding ? 0 : LABEL_REST[id] ?? 0.3;
    }
    if (L.op !== op) { L.root.style.opacity = op.toFixed(2); L.op = op; }
    L.root.classList.toggle('pending', pending);
    L.root.classList.toggle('hot', id === revealId);
    if (op > 0.01) {
      const near = clamp(13 / camPos.distanceTo(nodes.get(id).world), 0.5, 2.6);
      L.root.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y + LABEL_OFFSET[id] * near).toFixed(1)}px) translate(-50%, 0)`;
      if (textNow || L.stale) { const t = stateText(id, f, sim); if (t !== L.text) { L.state.textContent = t; L.text = t; } L.stale = false; }
      L.state.classList.toggle('over', id === 'substation' && f.feeder > SCENARIO.feederLimitKw);
    } else L.stale = true;
  }
  for (let k2 = captionPool.length - 1; k2 >= 0; k2--) {
    const c = captionPool[k2]; const p = proj[c.node];
    if (now - c.born > 5600) { c.el.remove(); captionPool.splice(k2, 1); continue; }
    c.el.style.left = `${p.x.toFixed(1)}px`; c.el.style.top = `${(p.y - LABEL_OFFSET[c.node] * 0.9).toFixed(1)}px`;
  }
  {
    const marks = dayring.hourMarks();
    const hs = $('#hours').children;
    const tmp = new THREE.Vector3();
    marks.forEach((mk, i) => {
      tmp.copy(mk.pos).project(R.camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && app.mode !== 'attract';
      hs[i].style.opacity = vis ? 0.9 : 0;
      if (vis) hs[i].style.transform = `translate(${((tmp.x * 0.5 + 0.5) * R.state.width).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * R.state.height).toFixed(1)}px) translate(-50%, -50%)`;
    });
  }
  // guide prompt follows its anchor; falls to a screen edge if the anchor is out of view
  {
    const g = app.guide;
    if (g.step === 2.5 && !app.ride && !app.choreoUntil && !dayring.choreo && app.mode !== 'reveal' && !app.pending) guideEvent('settled');
    if (g.step === 3 && now - g.since > 30000) { setGuide(0); showHint(); }
    const def = GUIDE_STEPS[g.step];
    if (def && g.anchor && app.mode !== 'reveal') {
      const p = proj[g.anchor];
      const W = R.state.width, H = R.state.height;
      const inView = p.visible && p.x > 60 && p.x < W - 60 && p.y > 80 && p.y < H - 80;
      el.guide.classList.remove('hidden');
      el.guide.classList.toggle('edge', !inView);
      if (inView) el.guide.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -30%)`;
      else {
        const right = p.visible ? p.x > W / 2 : wrapAngle(bearingOf(nodes.get(g.anchor).world).yaw - cam.yaw) > 0;
        el.guide.classList.toggle('right', right);
        el.guide.style.transform = `translate(${right ? W - 200 : 200}px, ${(H * 0.45).toFixed(0)}px) translate(-50%, -50%)`;
      }
    } else if (def && g.anchor) el.guide.classList.add('hidden');
  }
  {
    // tier labels ride the playhead: each arc names itself where it is lit right now
    const beads = dayring.playheadBeads(app.slotF);
    const ts2 = el.tiers.children;
    const tmp = new THREE.Vector3();
    beads.forEach((b, i) => {
      tmp.copy(b.pos).project(R.camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && app.mode !== 'attract' && b.on && !revealId;
      const op = vis ? 0.45 + 0.55 * b.activity : 0;
      if (ts2[i].dataset.op !== op.toFixed(2)) { ts2[i].style.opacity = op.toFixed(2); ts2[i].dataset.op = op.toFixed(2); }
      if (vis) ts2[i].style.transform = `translate(${((tmp.x * 0.5 + 0.5) * R.state.width).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * R.state.height).toFixed(1)}px) translate(16px, -50%)`;
    });
  }
  $('#chipWhy').classList.toggle('hidden', app.mode === 'attract' || app.mode === 'reveal' || !!app.pending);
  if (app.mode !== 'attract' && (textNow || frozen)) {
    const h = slotHour(app.slotF) % 24;
    const tt = formatClock(h);
    if (el.clockTime.textContent !== tt) el.clockTime.textContent = tt;
    const over = f.feeder > SCENARIO.feederLimitKw;
    const sub = `${mood(h)} · ${windWords(f.wind)} · <b>${f.price.toFixed(0)}p</b>/kWh · cable <b class="${over ? 'over' : ''}">${Math.max(0, f.feeder).toFixed(0)} of ${SCENARIO.feederLimitKw} kW</b>${app.mode === 'replay' ? ' · <b>replaying</b>' : ''}${app.pending ? ' · <b class="pend">waiting for your answer</b>' : app.ride ? ' · <b>following the energy</b>' : app.choreoUntil ? ' · replanning' : frozen && !app.paused ? ' · paused at your fingertip' : ''}`;
    if (sub !== el.clockSub.innerHTML) el.clockSub.innerHTML = sub;
  }

  // settled? (camera, condense, ripple, time scale and captions all at rest)
  if (Math.abs(ts.strength - ripTarget) < 0.01) ts.strength = ripTarget;
  const settled = camDist < 0.02 && !app.ride && !dayring.choreo && !app.choreoUntil && app.reveal.condense === wantCondense && ts.strength === ripTarget && app.timeScaleCur === app.timeScale && captionPool.length === 0 && (!ts.targetStrength || app.mode === 'reveal');
  diag.settle = { camDist, condense: app.reveal.condense, wantCondense, rip: ts.strength, ripTarget, tsc: app.timeScaleCur, tsT: app.timeScale, captions: captionPool.length, holding: app.holding, scrubbing: app.scrubbing, lastInputAgo: now - lastInputFrame, settled };
  settledFrames = settled ? settledFrames + 1 : 0;
  const mode = chooseMode(settledFrames > 2, now);
  if (mode !== gov.mode) gov.setMode(mode);

  // diagnostics at ~2 Hz while the staff panel is open
  if (textNow && !el.staff.classList.contains('hidden')) {
    const gaps = fpsWin.slice().sort((a, b) => a - b);
    const p95 = gaps.length ? gaps[Math.floor(gaps.length * 0.95)] : 0;
    const fps = gaps.length ? 1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
    app.fps = fps;
    const info = R.renderer.info.render;
    el.staff.querySelector('.fps').textContent = `${gov.mode} · ${fps.toFixed(0)} fps (p95 gap ${p95.toFixed(0)} ms) · ${R.state.bufferWidth}×${R.state.bufferHeight} px · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris · ${info.points} pts · solves ${diag.solves} (${diag.solveMs.toFixed(1)} ms) · cache hits ${diag.cacheHits}`;
  }
}

// One owner of requestAnimationFrame. Idle detection runs on the wall clock, independent of frames.
const gov = new RenderGovernor(tick, { rates: prof().rates });
app.tFrozen = 0;
gov.setMode('ATTRACT');
setInterval(() => {
  if (app.mode !== 'attract' && settings.timeout > 0) {
    const idle = (performance.now() - app.lastInput) / 1000;
    if (idle > settings.timeout && !app.idleShown) { app.idleShown = true; el.idle.classList.remove('hidden'); gov.invalidate(); }
    if (app.idleShown) {
      const left = Math.max(0, Math.ceil(settings.timeout + 15 - idle));
      el.idle.querySelector('b').textContent = String(left);
      if (left <= 0) { resetToAttract(); wake(); }
    }
  }
}, 1000);

// Expose a tiny inspection hook for testing on the station (no UI).
window.__orchestra = { app, simulate, settings, resetToAttract, frameAt, openReveal, closeReveal, applyChange, commitDraft, approvePending, declinePending, diag, gov, planCache, dayring, cam, env };
window.__orchestra.nodes = nodes; window.__orchestra.R = R; window.__orchestra.ribbons = ribbons; window.__orchestra.touch = touch; window.__orchestra.RIDE = RIDE; window.__orchestra.audio = audio; window.__orchestra.xr = xr; window.__orchestra.THREE = THREE;
