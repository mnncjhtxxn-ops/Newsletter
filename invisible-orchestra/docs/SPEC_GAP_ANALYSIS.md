# Specification v1.0 versus the build

| Spec requirement | Status in this build |
|---|---|
| Gate A: fixtures F01–F08 pass without graphics | **Done.** `src/sim/planner.js` + `tests/fixtures.test.js` against the handover JSON |
| Simulation has no dependency on Three.js / DOM | Done |
| `PlanStatus` vocabulary; PROVEN_INFEASIBLE only with a bound | Done for the car and cold store (capacity and budget bounds are proofs for a single divisible load) |
| Decision record with reason codes, binding constraints, observations, assumptions | Done as a `technical` layer per node; codes: CHEAPER_SLOTS_USED, CHEAP_WINDOW_CAPACITY_LIMIT, FEEDER_HEADROOM_BINDING, BUDGET_TARGET_CONFLICT, CHARGER_POWER_AND_TIME_LIMIT, NO_COORDINATION, PREWARM_ON_CHEAP_SLOTS, COAST_THROUGH_DEAR_SLOTS, SHED_FOR_FEEDER_HEADROOM, STORE_ON_CHEAP_SLOTS, DISCHARGE_ON_DEAR_SLOTS, DISCHARGE_FOR_FEEDER_HEADROOM. `consideredAlternatives` is not recorded |
| Charging efficiency, energy balance, no charging after departure | Done and tested |
| Three explanation levels | Done: three statements → knew/allowed/decided table → technical detail |
| Ask before changing an agreed plan: pending pauses the clock, decline respected | Done (`reviewAuthority`, app-level accepted/draft/pending state) |
| Edits stay a draft until "Replay with this change" | Done |
| "Same starting point. Earlier departure." | Done: the "what changed" panel names the changed input |
| Visible non-drag alternative to pull | Done: tap, score stave, and a visible "Why did charging happen then?" button |
| Portrait lower control band; 48 px targets | Done for layout (cards, controls, score in the lower band; ≥ 42–50 px targets); physical reach untested |
| Reduced motion | Done |
| WebGL2 capability check and context-loss state | Done |
| Attract copy with "Illustrative 2037 scenario" | Done (kept the original "Touch to see what makes it possible" line) |
| Car story only in the first slice | **Deliberately not followed.** The build keeps home, bakery and battery because they are what make the cable constraint and the coordination visible; each has its own tests. The spec's concern (three shallow stories) is answered by the fact that the car is the only story with a verified optimal planner and fixtures |
| PBR GLB hero assets, glass, environment lighting | **Resolved as a hybrid (agreed with Adam).** At overview scale the objects are formed from light; when pulled forward, the particles coalesce into a hard-light holographic projection: solid translucent surfaces with fresnel edges, scanline shimmer, crisp light edges, an emitter ring and dust motes drifting through the field (`src/scene/holograms.js`, procedural geometry, no assets). Still unmistakably made of light, but substantial enough to inspect. Not photoreal PBR by design |
| Loopback server launcher | Not needed: single-file route (spec §11.2 option 3), tested from `file://` |
| Twelve-hour soak, 500 cycles, hardware profiling, human evaluation | NOT RUN / BLOCKED (see TEST_RESULTS.md) |
| TypeScript | Not used; plain ES modules bundled with esbuild. A `.d.ts`-free codebase was a deliberate speed choice; converting is mechanical |

## v1.1 optimised handover

| v1.1 requirement | Status |
|---|---|
| Planner event-driven, never in the render loop | Done (E01) |
| Planner in a Web Worker | **Deviation:** main thread, measured 2.3 ms for the whole day; see PERFORMANCE.md |
| One in-flight + newest pending request, stale-reply defence | N/A (synchronous planner) |
| 32-entry LRU physics cache, permission never cached | Done (E02, E04) |
| Reset clears visitor intent/approval | Done |
| Four clocks: wall, model, visual, measurement | Done; fps from raw gaps, visual time frozen in READING |
| Frame policy 30 / 60 / on-demand / hidden, one rAF owner | Done (`src/scene/governor.js`, E06, E07) |
| Pixel budget after DPR, resize only on change | Done (E08) |
| Ambient decorative particles ≤ 300 / 800 | Done (field strands sized from the profile) |
| DOM updates throttled to 2–4 Hz | Done (label and clock text at 4 Hz, positions per rendered frame only) |
| Adaptive quality with hysteresis | Not implemented |
| GPU timer queries | Not implemented |
| Authoritative visual clarification (coalesce, no flicker, no generic wireframe, ambient recognisable) | Done: flicker removed, scanlines near-invisible, edges in the object's own colour, sculpted car body; selection never re-plans |
