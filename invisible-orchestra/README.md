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

There are exactly three signature gestures (touch, pull, change-and-replay), a visible pause button for those who prefer it, and a "score" strip at the bottom that doubles as an accessible alternative: tap a stave to open that participant, drag to move through the day.

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

### Order of play (deterministic)

1. Fixed loads: the other homes, the home base load, the ovens.
2. Deadline loads pick the cheapest quarter-hours that fit under the cable: first the car, then the cold store.
3. The heat pump runs the thermal model with a few readable rules (hold, pre-warm, coast, shed).
4. The battery balances what is left.
5. The cable is checked. Anything it cannot solve becomes an explicit conflict card with real options.

Under *ask me first* a load behaves as if nobody was coordinating it until the visitor answers, and the request card quantifies what saying yes would do. Under *never* it runs the way it would with no coordination. A "no coordination" baseline is computed for every run so the lessons can say what the orchestra actually changed.

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
| `scale` | 0.5 / 0.75 / 1 | Internal resolution of the 3D scene. Text and controls stay crisp at native resolution. |
| `timeout` | seconds, 0 = never | Inactivity before the "Still there?" prompt; the station returns to the attract screen 15 s later and resets every choice. |
| `dayLength` | seconds | How long the imagined day takes to unfold (replays run 30 % faster). |
| `sound` | 0 / 1 | Optional generative musical layer, synthesised, off by default. The story is complete without it. |

Example: `invisible-orchestra.html#scale=0.75&timeout=120`. Staff can also triple-tap the top-left corner for an on-screen settings panel with a live frame-rate readout.

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

- Roughly 30k points per frame in a handful of draw calls; one shared shader program; additive sprites with a shared, procedurally drawn glow texture; a second "halo" pass per object gives bloom without post-processing.
- The 3D canvas renders at an adjustable internal scale independent of the crisp HTML text layer.
- Reset reuses the scene: no second animation loop, no duplicate input handlers, no re-created geometry.
- The whole simulation for a day runs in well under a millisecond, so "release and replay" is instant.

## Project layout

```
src/
  sim/scenario.js    the fictional 2037 street: tables, defaults, options
  sim/engine.js      the scheduler, explanations and lessons (pure, tested)
  scene/glow.js      shader material, procedural sprite, halo pass
  scene/shapes.js    objects formed from light (point-cloud generators)
  scene/nodes.js     the cast, driven by simulation state each frame
  scene/ribbons.js   energy ribbons (flow) and information ribbons (packets)
  scene/field.js     ambient drifting strands
  scene/touch.js     touch → freeze / pull / tap
  ui/score.js        the day as a score (2D canvas, accessible twin)
  ui/audio.js        optional synthesised musical layer
  main.js            state machine, overlay, camera, loop
  index.html, styles.css
tests/engine.test.js
build.js             bundles everything into dist/invisible-orchestra.html
```

## Honest limitations and what to do next

- **It is a scheduler, not a market.** The tariff, the wind and the cable rating are story devices with plausible shape. Do not present outputs as forecasts or as how any real flexibility service prices.
- **Hardware is unproven.** Sixteen touchscreens are not necessarily sixteen graphics-capable PCs. Prove it on one real station before committing to the look.
- **Test the "oh, I see" moment.** Put it in front of people without explaining it. The measure is not "that looks amazing" but "it changed that because I changed what mattered". Adjust the copy in `engine.js` explanations first; the visuals second.
- **Presets** (a business opening for the day, a fleet preparing to leave) are a natural next step once the core minute is proven; the engine already separates scenario from mechanism.
