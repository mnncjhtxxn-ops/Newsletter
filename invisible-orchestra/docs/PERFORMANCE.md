# Performance contract (spec v1.1 §11.1) — what the build does

**Hardware:** none. Everything below was measured in headless Chromium with SwiftShader software rendering inside a Linux container. Those numbers describe behaviour (frame policy, solve counts, buffer sizes), not what a kiosk GPU will deliver.

## Two schedulers, kept apart

| | Energy planner | Render governor |
|---|---|---|
| Runs | on the initial scenario and on a committed change (`Replay with this change`, a card option, approving a pending request) | one `requestAnimationFrame` chain, the only owner |
| Never runs on | touching, opening a decision, scrubbing time, camera motion, pausing, changing quality, replaying an unchanged plan | — |
| Cost | whole day, including the no-coordination baseline and all explanation text: **2.3 ms average** on this container's CPU (`node -e` over 200 runs) | — |
| Cache | 32-entry LRU keyed by promises, which loads are locked, resolutions and solver version. Physics only: permission is decided afresh every commit by `reviewAuthority` | — |

**Deviation from the spec:** the planner runs on the main thread, not in a Web Worker. At 2.3 ms for the whole day it is inside the spec's own 5 ms worker target and well under one frame; a worker would add asynchronous state and message latency for no responsiveness gain in a single-file build. If a later scenario grows past ~5 ms, move it.

## Frame policy

| Mode | Cap | When |
|---|---|---|
| ATTRACT | 30 fps | the day is playing (attract, live, replay) |
| ACTIVE | 60 fps (30 in Economy) | touch held or moved in the last 0.9 s, scrubbing, or a camera / projection / ripple transition still moving |
| READING | on change only | a decision held open, or a request waiting, once everything has settled; visual time is frozen, so no shimmer or dust drift forces redraws |
| PAUSED | on change only | pause button, settled |
| HIDDEN | nothing | `document.hidden`; audio muted; on return one fresh frame, no catch-up |

The cap is a deadline check inside the rAF chain (unit-tested at 60, 120 and 144 Hz). Model time advances from the raw frame gap, capped at 250 ms, and samples a precomputed schedule, so 15, 30 and 60 fps give the same energy, cost and permission result.

## Pixel budget

Profiles from `scenarios/QUALITY_PROFILES_v1.1.json`. The drawing buffer is fitted with `fitDrawingBuffer` (devicePixelRatio applied exactly once, capped at 1.5) and resized only on window or profile change. HTML text and controls stay at native CSS resolution.

| Profile | Max pixels | Ambient / active | Ambient particles | Mirror floor |
|---|---:|---|---:|---|
| Economy | 1,440,000 | 30 / 30 | 300 | off (flat dark floor) |
| Balanced (default) | 2,073,600 | 30 / 60 | 800 | 1024² reflection |
| Detail | 3,686,400 | 30 / 60 | 800 | 1536² reflection |

Verified: a 1080×1920 CSS viewport at DPR 2 renders at 1080×1920 (2,073,600 px) in Balanced, not 2160×3840.

## The environment pass (deviation from the v1.1 particle cap)

The room around the sculpture (mirror floor, ceiling pool, per-object ripple pools, light pillars, hinted landscape, foreground bokeh) was added after the v1.1 low-load contract was written and is **not** counted by the "ambient particles" column above:

- The mirror floor renders the whole scene a second time into a 1024² (Balanced) or 1536² (Detail) texture every frame it draws. On a 1080×1920 kiosk that is roughly a 50 % increase in fill work in Balanced. Economy disables it entirely.
- The landscape is about 2,200 dim hill points plus 40 spires, the pillar field is 34 ambient beams plus one per participant and hour mark, and the bokeh layer is 22 sprites. These are static GPU buffers animated in their vertex shaders; they add draw calls but no per-frame JavaScript.
- Per-frame JavaScript for the environment is a handful of uniform writes.

This exceeds the 800-particle ambient cap in Balanced/Detail when the decorative points are counted. It is documented rather than hidden so that hardware profiling can decide whether to keep it. If the real kiosk cannot hold 30 fps in Balanced, the first two things to remove are the reflection (set `reflection: false` in `src/scene/governor.js` PROFILES) and the landscape points.

The day ring adds five ghost tiers (96 beads each, one draw call per tier) and five threads of 56 points, animated in JavaScript only for tiers whose participant is active. The ride is a camera path; it adds nothing to the draw list.

## What is not implemented

- Adaptive quality (automatic downgrade / upgrade with hysteresis, E11). Profiles are staff-selected.
- GPU timer queries. The staff panel shows raw frame gaps (p95), draw calls, triangles and point counts from the renderer's own counters.
- Glass / transmission: none is used, so the transmission budget rows do not apply.
- Twelve-hour soak, 500 cycles, hardware profiling (E12, O03–O05).

## Diagnostics

Triple-tap the top-left corner. The line reads, for example:
`READING · 0 fps (p95 gap 0 ms) · 1080×1920 px · 41 draws · 62k tris · 21k pts · solves 3 (2.1 ms) · cache hits 2`
