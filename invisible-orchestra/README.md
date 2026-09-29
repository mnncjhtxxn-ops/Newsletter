# 2037: The Invisible Orchestra

**An interactive, living energy sculpture for exhibition touchscreens.**
Reach inside a fictional 2037 street, pull out an invisible decision, change what matters to you, and watch the whole system respond.

It is a single self-contained HTML file. It runs offline, from `file://`, with no server, no network, no cloud AI and no external assets.

> **2037. Life carries on.**
> **Touch to see what makes it possible.**

## What the visitor experiences

| Moment | What happens | Design target |
|---|---|---|
| **Walk past** | A dark space where luminous strands weave between objects formed from light: a turbine, a car, a warm house, a bakery, a battery, the street's cable. An imagined day unfolds continuously. | Beautiful even when nobody is using it. |
| **Touch to freeze** | The first touch stops time. The scene opens around the finger, every object says what it is doing *right now*, and the thin dotted information layer (the "nervous system") becomes visible. | An extraordinary response before anyone reads a word. ~30 s. |
| **Pull to reveal** | Drag an object towards you (or simply tap it) and the decision behind it separates into three layers: **You asked for this. You allowed this. So this happened.** "Show me the working" opens the fuller table: what the system knew / what it was allowed to do / what it decided. | The complete story in 2–3 minutes. |
| **Change and replay** | Move the departure time, the target charge, the price limit, the comfort band, the bakery's opening time, or a permission (*automatic* / *ask me first* / *never*). Release. The same day replays with the same weather and equipment, and a "what changed" panel shows the difference. | "Oh, I see. It changed that because I changed what mattered." |
| **The system needs you** | When two requirements cannot both be met the system says so and asks: *"I can meet your departure target, but not within the price limit you set. Which should I prioritise?"* Loads set to *ask me first* wait, visibly, with the cost of waiting shown. | Not magic. Authority has edges. |
| **What this day taught** | Three or four lessons, computed from the actual run (never canned text): how far the charge moved onto wind, whether the cable, not the energy, was the binding limit, what the comfort band was worth as storage, what asking first cost. | Insight that survives the exhibition hall. |

There are exactly three signature gestures (touch, pull, change-and-replay), a visible pause button for those who prefer it, and the day ring itself as the accessible alternative: tap any arc of the ring to open that participant.

### The first minute is guided

Kiosks need verbs. A new visitor gets three prompts, one at a time, each anchored to a real object in the room and dismissed only by doing it: **Touch the car** (a beacon on the car; the camera turns to face it), **Change when you leave, then press Replay** (a note at the top of the panel, worded for whichever object was opened), and once the day has been replanned, **Now try your home**. A prompt that is off screen falls to a screen edge with an arrow. The guide restarts for every visitor.

## Standing inside it

The viewer stands at the centre of the sculpture. Objects surround you at different depths and heights, strands pass close by, and dragging empty space turns your head.

**The ring is the only timeline.** The day is a ring around you: 96 quarter-hour beads, one arc per participant, stepping up and outward like an amphitheatre so each reads on its own line, lit where that participant is actually scheduled, with the playhead (a spoke from your feet and a column of light) sweeping round as the night unfolds (18:00 behind you, midnight to the left, 06:00 ahead, midday to the right). Each arc names itself with a small label riding the playhead wherever it is lit. Three things tie the ring to the objects: the bead under the playhead flares while that participant is running; a thread of light arcs from that bead up to the object while energy is arriving there, so "this quarter-hour, now" and "this object, now" are visibly one thing; and when a plan changes the lit beads fly from their old slots to their new ones while the previous plan stays as a ghost tier beneath each arc for the length of the replay. Every mover is a real quarter-hour moving to a real new time.

**The ride.** When you release a change, you ride the energy: the camera leaves the eye and follows the strand from the source that will feed the load that moved (the wind if that is what will be charging it, otherwise the wider grid), through the street's cable and into the object, lands looking down at that object's arc on the ring as its quarter-hours fly to their new times, then returns to the eye facing the object as the day starts again. It is the one moment of being *in* the flow, and it ends where the decision can be read. Reduced motion skips it.

## Made of light at every scale

At overview scale every object is a cloud of light. When you pull one forward, its particles coalesce into a **hard-light projection**: solid translucent surfaces with bright edges, a faint scanline shimmer, an emitter ring beneath, and tiny dust motes drifting through the field. It is more substantial than the overview, and still unmistakably made of light. Release it and it dissolves back into the strands. The car comes from a supplied 3D model prepared by `tools/prepare-assets.py` (Blender's Python module: join, drop ground planes, decimate, normalise, quantise to int16) and embedded as compact geometry; the same mesh feeds the ambient point cloud (surface and real silhouette samples from where the viewer stands) and the projection, so the object that resolves is the one the visitor saw. The house (a cottage with a chimney, lit windows and the heat pump on its wall), the bakery (a storefront with a lit window, striped awning, sign and chimney), the turbine and the battery (a wall unit with a bolt and a charge gauge) are drawn procedurally in one hand, because at ten metres a modelled timber frame and a shop interior did not read as a house and a bakery. Objects sit close, large and at three-quarter angles, and every object carries a soft permanent label. Projections blend with *max* rather than additively, so overlapping faces never stack up to white. Licence status for the car is in `assets/manifest.json`.

## Strings, and the orchestra heard

Alternating current is a wave, and now every strand shows it: a transverse wave runs along each energy strand, its amplitude following the kilowatts on the link and its speed the tariff, so a loaded strand trembles and a cheap, windy hour hums slow. When the cable is near its limit, the strands feeding it shudder.

The sound is a generative score played from the simulation, not over it. Each participant is a section: wind as sustained strings, the home as a warm pad that swells while the heat pump runs, the car as pizzicato cello only while it charges, the bakery as slow-attack brass while the ovens are hot, the battery as a harp running up when it stores and down when it releases, and the cable as timpani that enter only near the limit and play every beat over it. One beat is one modelled quarter-hour and a bar is an hour. The mode follows the tariff: Lydian when electricity is cheapest, then Ionian, Dorian, and Aeolian for the dear evening. A hold is a fermata, the ride is a swell, and a release is a downbeat. Everything is synthesised in the browser: nothing is recorded, nothing is licensed, and no fact is carried by sound alone (`src/ui/audio.js`). Sound is on by default and staff can turn it off; in a loud hall it needs a directional speaker over the station or headphones (see the operator guide).

**The baton.** A drag that starts on an arc of the ring sweeps the day to wherever the finger goes, the short way round; a tap on an arc opens that participant; dragging empty space still turns your head.

## 2037, not 2027

Three things stretch the scenario beyond today's flexibility, each bounded and explained in the panel:

- **Vehicle to grid.** The car may sell into the street at the evening peak (only in quarter-hours priced at or above 24p), keeping a reserve the driver sets, never more than a daily cap, and it must still meet its departure promise afterwards: the amount sold shrinks until it does, and can shrink to nothing. It buys the energy back on the wind. Paid the tariff less 2p.
- **The street lends.** When the cable would be over its limit, the network asks the street and six neighbours' shared batteries lend what they can, up to a bounded pool of power and energy. The visitor's own battery joins if they allow it and is paid an illustrative flexibility fee. This only happens where something is being coordinated at all; the uncoordinated baseline gets no pool.
- **The battery trades.** In *trade* mode the home battery sells into the dearest third of the day, stores the street's midday sun surplus, and still lends when asked; in *keep* mode it only serves the house.

Every one of these is a promise or permission the visitor can change, replays through the same verified planner, and shows up in the decisions, the ring, the "what changed" summary and the lessons.

## The conductor's chair (VR)

The same file, worn. In a headset browser with WebXR (a Meta Quest in its own browser) an **Enter VR** button appears. The visitor stands at the centre of the sculpture with the ring at their feet; a ray from each hand or controller pinches an object to open its decision on a panel in the room (the same layers and chips as the kiosk panel, drawn from the same data), pinches the ring and sweeps to drive time, or pinches nothing and holds to stop it. The orchestra plays from where the objects are. Serve it with `npm run vr` (HTTPS on the local network) and see `docs/VR_PROTOTYPE.md` for status: built and exercised with synthetic rays against the real scene, **not yet worn**.

## The room it stands in

The sculpture stands over a dark mirror. The floor is a still, black pool that reflects every object and strand with a slow ripple that fades to nothing in the distance; a second, fainter pool hangs above as a ring of light in the ceiling. Each participant sits on its own ripple pool, and rings of soft light pillars rise from the horizon like the far edge of a landscape, with low hills of dim points and a few spires hinted beyond them. Near the viewer a few large, very faint bokeh discs drift, so the space reads as air rather than vacuum. All of it is decorative and none of it carries data: the pools brighten with a participant's activity, but every fact is still in the strands, the ring and the panel.

The mirror is a real second render of the scene (three.js `Reflector`) and is the one deliberately expensive thing in the picture. Economy turns it off and shows a plain dark floor; Balanced renders it at 1024² and Detail at 1536². See `docs/PERFORMANCE.md`.

## Why the spectacle has substance

**Every visual change corresponds to something that changed in the simulation.** Ribbon density and speed follow the simulated kilowatts on that link. The car fills as it charges. The house glows with its temperature inside the band. The cable's ring fills towards its limit and turns red when it is breached. Information packets travel only when a decision is made. A ribbon never gets smoother because a "smart" button was pressed.

The intelligence is a small, inspectable, rule-based scheduler (`src/sim/engine.js`), not a machine-learning model. It records the numbers it used, so the on-screen explanation is tied to what it actually did. Its full behaviour is covered by unit tests (`npm test`).

### The scenario (fictional, bounded)

*Larkfield Street, 2037. Forty homes and a bakery on a cold, windy March night.* The day runs from 18:00 to 18:00 in 96 quarter-hours.

| Participant | What it wants | What it can do |
|---|---|---|
| **Your car** | Be at 60/80/100 % by a departure time you choose (04:00–10:00), optionally under a spending limit. 90 kWh pack, 7 kW charger, home at 18:00 with 20 %. | Charging moves inside the window if permitted. The departure target is never traded away without asking. |
| **Your home** | Stay inside a comfort band: *exactly right* 20–21 °C, *comfortable* 19–22 °C, *easy-going* 18–23 °C. | A simple thermal model lets the house be warmed on cheap wind and coast through dear hours, using the band as storage. It also pauses for the cable if the house is warm enough. |
| **The bakery** | Open at a time you choose (04:00–07:00) with the ovens hot. | The ovens are never moved (a promise to customers). Its cold store needs four hours some time between 22:00 and 06:00 and may be moved. |
| **The home battery** | Nothing directly: it serves the other promises. 13.5 kWh, 5 kW. | Stores the cheapest third of the day, releases at the dearest third, and holds the street inside its cable limit. |
| **The wind** | Blows when it blows. Strongest 02:00–04:00. | Nothing. The orchestra moves what waits for it. |
| **The street's cable** | Never carry more than 55 kW. | Nothing can be negotiated with a cable. Software cannot wish a physical limit away. |
| **The other homes** | The ordinary shape of a day. | Taken as given: the backdrop the orchestra works around. |

A dynamic tariff and a carbon intensity curve are part of the scenario. They are invented for the story and do not represent any real market, network or bill.

### What "ask me first" means

Each flexible load has an *agreed* plan. Under **automatic**, a replan replaces it at once. Under **ask me first**, a change to that load's schedule is proposed and waits: the modelled clock stops, the agreed plan stays in force, and nothing is dispatched until the visitor says yes. Saying no keeps the agreed plan *and* the agreed promise; the new promise is never confirmed by the back door. Under **never**, the load runs the way it would with nobody coordinating it.

### Verified planner and fixtures

The car and the cold store are scheduled by `src/sim/planner.js`: cheapest available quarter-hours first, capped per slot by the charger and by the cable's remaining headroom, with charging efficiency applied. For one divisible load with per-slot caps this is optimal, so the minimum cost and the capacity / budget bounds it reports are proofs. That is what lets it say `PROVEN_INFEASIBLE` honestly. The handover's fixtures F01–F08 (`scenarios/EV_NUMERICAL_FIXTURES_v1.0.json`) run against it in `tests/fixtures.test.js`.

### Order of play (deterministic)

1. Fixed loads: the other homes, the home base load, the ovens.
2. Deadline loads pick the cheapest quarter-hours that fit under the cable: first the car, then the cold store.
3. The heat pump runs the thermal model with a few readable rules (hold, pre-warm, coast, shed).
4. The battery balances what is left.
5. The cable is checked. Anything it cannot solve becomes an explicit conflict card with real options.

A "no coordination" baseline is computed for every run so the lessons can say what the orchestra actually changed.

## The four business perspectives, in one experience

| Perspective | What becomes tangible |
|---|---|
| **Customers** | My needs, preferences and permissions shape what the system does. Asking first is allowed to cost something. |
| **Renewables** | Variable generation changes *when* useful things can happen, not just how much electricity there is. |
| **Networks** | Coordination must respect physical limits. The cable, not the amount of energy, is often the binding constraint. |
| **Digital** | Information becomes decisions, decisions become actions, and every one of them can be explained. |

## Running it

```bash
npm install          # three.js + esbuild (build-time only)
npm test             # simulation unit tests
npm run build        # → dist/invisible-orchestra.html (single file, ~625 kB)
npm run dev          # rebuild on change
```

Open `dist/invisible-orchestra.html` directly in Edge or Chrome. No server is needed. The built file is committed so a station can be set up by copying one file.

**Settings** (station-level, persisted in `localStorage` where available; URL hash overrides):

| Key | Values | Meaning |
|---|---|---|
| `profile` | economy / balanced / detail | Pixel budget, frame caps and ambient particle cap (see `docs/PERFORMANCE.md`). Text and controls stay crisp at native resolution. |
| `timeout` | seconds, 0 = never | Inactivity before the "Still there?" prompt; the station returns to the attract screen 15 s later and resets every choice. |
| `dayLength` | seconds | How long the imagined day takes to unfold (replays run 30 % faster). |
| `sound` | 0 / 1 | Optional generative musical layer, synthesised, off by default. The story is complete without it. |

Example: `invisible-orchestra.html#profile=economy&timeout=120`. Staff can also triple-tap the top-left corner for an on-screen settings panel with a live frame-rate readout.

Keyboard, for testing on a laptop: space pauses, Escape closes the panel.

## Kiosk deployment (Windows)

- Use **Edge kiosk mode (digital/interactive signage)** with a Windows **Assigned Access** configuration so the app relaunches if it is ever closed. Edge's own inactivity timeout closes the browser; it does not restart it.
- Launch the local file directly. Because everything is inlined there are no ES-module `file://` restrictions and nothing to cache.
- Edge kiosk sessions run InPrivate: nothing in this app needs to persist between sessions. Station settings can be pinned in the URL hash instead of relying on `localStorage`.
- One instance per screen; no shared server; no venue Wi-Fi; no dependency on another station.

### Acceptance tests before sign-off

| Test | Requirement |
|---|---|
| **Offline cold start** | Boot with networking disconnected; open the file from a fresh profile that has never seen it. Everything renders (no fonts, libraries or data are fetched). |
| **Actual station** | Run on the intended PC, display resolution, Windows scaling and touch hardware, not a development laptop. Pick `scale` there. |
| **12-hour mixed use** | Alternate complete journeys, abandoned sessions, attract mode and resets. No unexplained freeze or crash. |
| **Repeated sessions** | Hundreds of open/change/replay/reset cycles. Heap and frame time must not trend upwards after warm-up. The included soak script (below) is a starting point. |
| **Recovery** | Close the browser, kill the page, restart the PC: the kiosk configuration must bring the attract screen back unattended. |

What has been verified so far in this repository (headless Chromium, software rendering):
the full interaction loop with zero console errors; 60 automated visitor cycles with a flat JavaScript heap (about 6 MB), one shader program and a constant geometry count; portrait and landscape layouts. Frame rate on real exhibition hardware has **not** been measured and must be, on one of the actual PCs.

## Performance design

- One render governor owns `requestAnimationFrame`: 30 fps while the day plays, up to 60 during touch and transitions, render-on-change while a decision is held open, nothing while the page is hidden.
- The drawing buffer is fitted to the profile's pixel budget with devicePixelRatio counted once; HTML stays at native resolution.
- Planning runs only on a committed change (about 2 ms for the whole day) and never in the frame loop; identical inputs are served from a bounded cache, and permission is re-checked every time.
- A handful of draw calls, one shared point shader, additive sprites with a procedurally drawn glow and a halo pass instead of post-processing bloom. Only one projection is ever visible.
- The mirror floor is the largest single cost: it renders the scene a second time into a square texture (1024² Balanced, 1536² Detail) and is off in Economy. Decorative pillars, pools and the landscape are static buffers animated in their shaders, so they add draw calls but no per-frame JavaScript.
- Reset reuses the scene: no second loop, no duplicate handlers, no re-created geometry.

## Project layout

```
src/
  sim/scenario.js    the fictional 2037 street: tables, defaults, options
  sim/engine.js      the scheduler, explanations and lessons (pure, tested)
  scene/glow.js      shader material, procedural sprite, halo pass
  scene/shapes.js    objects formed from light (point-cloud generators)
  scene/holograms.js hard-light projections the objects condense into when revealed
  assets/loader.js   decodes embedded geometry; surface and crease-edge sampling
  assets/*.geo       decimated, quantised model geometry (see tools/prepare-assets.py)
assets/manifest.json asset provenance, changes made and licence status
tools/prepare-assets.py  model preparation (needs `pip install bpy`)
  scene/nodes.js     the cast, driven by simulation state each frame
  scene/ribbons.js   energy ribbons (flow) and information ribbons (packets)
  scene/field.js     ambient drifting strands
  scene/touch.js     touch → freeze / pull / tap
  ui/audio.js        optional synthesised musical layer
  main.js            state machine, overlay, camera, loop
  index.html, styles.css
  sim/planner.js     verified cheapest-slot planner with provable bounds; authority review
scenarios/           the handover's numerical fixtures (F01–F08)
tests/               engine tests and fixture tests
docs/                test ledger, limitations, operator guide, spec gap analysis
build.js             bundles everything into dist/invisible-orchestra.html
```

## Honest limitations and what to do next

- **It is a scheduler, not a market.** The tariff, the wind and the cable rating are story devices with plausible shape. Do not present outputs as forecasts or as how any real flexibility service prices.
- **Hardware is unproven.** Sixteen touchscreens are not necessarily sixteen graphics-capable PCs. Prove it on one real station before committing to the look.
- **Test the "oh, I see" moment.** Put it in front of people without explaining it. The measure is not "that looks amazing" but "it changed that because I changed what mattered". Adjust the copy in `engine.js` explanations first; the visuals second.
- **Presets** (a business opening for the day, a fleet preparing to leave) are a natural next step once the core minute is proven; the engine already separates scenario from mechanism.
