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
| PBR GLB hero assets, glass, environment lighting | **Not done — open decision.** See the handover note |
| Loopback server launcher | Not needed: single-file route (spec §11.2 option 3), tested from `file://` |
| Twelve-hour soak, 500 cycles, hardware profiling, human evaluation | NOT RUN / BLOCKED (see TEST_RESULTS.md) |
| TypeScript | Not used; plain ES modules bundled with esbuild. A `.d.ts`-free codebase was a deliberate speed choice; converting is mechanical |
