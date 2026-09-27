# Test ledger

Environment for every row marked PASS: headless Chromium 1194 (Playwright 1.56), SwiftShader software rendering, Linux container, Node 22. No exhibition hardware has been touched. Frame rates measured here say nothing about the kiosk PC.

Status vocabulary: **PASS** ran and met the condition · **FAIL** ran and did not · **NOT RUN** not attempted · **BLOCKED** cannot be run in this environment and why.

## Numerical and authority tests (spec §7, §12)

| ID | Test | Status | Evidence |
|---|---|---|---|
| N01 / F01–F06 | Handover fixtures: energy, cost and infeasibility bounds | PASS | `tests/fixtures.test.js` reads `scenarios/EV_NUMERICAL_FIXTURES_v1.0.json`; £3.12, £6.00, 24 kWh, 24.96 kWh, 26.4 kWh, £4.40 all match to 1e-6 kWh / 1e-6 p, with the expected reason codes |
| F01 schedule | Earlier-slot tie-break: 01:00–01:45 at 7.2 kW, 01:45–02:00 at 0.8 kW, 05:00–07:00 at 7.2 kW | PASS | same file |
| F07 | Determinism of schedule, metrics and trace | PASS | same file |
| F08 | Ask-before-changing: nothing dispatched while pending; approve dispatches; decline keeps the accepted plan | PASS | `reviewAuthority` unit test, plus the browser run below |
| Bound proof | Brute-force check that no allocation beats the reported minimum cost | PASS | same file |
| N02 | Energy balance in every slot | PASS | `tests/engine.test.js` |
| N03 | No charging after departure; cold store only in its window | PASS | `tests/engine.test.js` |
| N04 | Result independent of frame rate | PASS by construction | rendering samples a precomputed plan; the loop never writes into the simulation |
| N05 | Pending/declined authority never executes a changed plan | PASS | browser run: `pending → ts 0`, decline restores accepted promise |
| N06 | Displayed reasons derive from the decision record | PASS | explanations and technical layer are built from the same trace object (`engine.js` explainAll) |
| N07 | Timeout / no-plan-found never labelled proven impossible | PASS | the planner only returns PROVEN_INFEASIBLE from a capacity or budget bound; NO_PLAN_FOUND is not produced by this planner |
| N08 | Changing departure does not change prices, forecasts, initial charge or equipment | PASS | scenario tables are constants; unit test compares series across departures |
| N09 | Reset returns to the canonical scenario | PASS | soak test resets every 6 cycles; DOM and scene counts constant |
| N10 | Storage / thermal modules independently checked | PARTIAL | comfort band never violated (test); thermal coefficients declared; battery round-trip losses **not modelled** (see limitations) |

## Visual and interaction tests (spec §12)

| ID | Test | Status | Evidence |
|---|---|---|---|
| V01 | Attract scene: composed depth, recognisable objects, negative space | PASS as built / **awaiting your visual sign-off** | screenshots in the session; the objects are light-formed point clouds, not PBR models (see the art-direction note in the handover) |
| V02 | Close inspection quality | PASS as built / **awaiting your visual sign-off** | hard-light projections for car, home, bakery, battery and turbine; settled framing verified at 729–759 px of a 740 px target beside the panel |
| V03 | Pull-apart reveal with tap alternative | PASS | tap on object, tap on score stave, and the visible "Why did charging happen then?" button all open the same reveal |
| V04 | Before / with-your-change replay | PASS | ghost bars of the previous run in the score, "what changed" panel with the changed input named |
| V05 | Conflicting requirements | PASS | price-limit conflict with two validated options; infeasible target with bound-based options |
| V06 | Layers distinguishable without colour alone | PASS | energy = continuous streams, information = dotted traces and packets, authority = cards and a pending marker |
| V07 | Glass | NOT RUN | no glass is used |
| V08 | Reduced motion / audio off | PASS | `prefers-reduced-motion` removes camera drift and damps the ripple; sound is off by default and never carries meaning |
| V09 | Portrait hardware reach | PARTIAL | portrait layout puts cards, controls and the score in the lower band; physical reach on a mounted 55-inch screen **BLOCKED** (no hardware) |
| V10 | Rapid interaction cannot strand the app | PASS | 60 automated cycles with cancelled interactions, resets mid-transition, no errors |

## Operational tests (spec §12)

| ID | Test | Status | Evidence |
|---|---|---|---|
| O01 | Cold offline launch | PASS | loaded via `file://` in a fresh headless profile; no network requests possible in the container |
| O02 | Network audit | PASS | the built file contains no external URLs at runtime (fonts are the system stack; no images) |
| O03 | Twelve-hour soak | NOT RUN | longest run so far: ~2 minutes of continuous automated use |
| O04 | ≥ 500 automated cycles | PARTIAL | 60 cycles, heap flat at 6.1–6.4 MB, 1 shader program, 50 geometries constant |
| O05 | Honest profiling on hardware | BLOCKED | no kiosk PC in this environment |
| O06 | Recovery after browser closure / context loss / restart | PARTIAL | WebGL2 absence and context loss show a recovery state (implemented, exercised only by code review); PC restart BLOCKED |
| O07 | Missing / invalid config | PASS | settings fall back to defaults; `localStorage` failures are caught |
| O08 | Clean install on a second machine | BLOCKED | one file to copy; not exercised on a second machine |

## Human evaluation

NOT RUN. The four questions (what did you ask, what changed, why, what was it allowed to do) have not been put to anyone.
