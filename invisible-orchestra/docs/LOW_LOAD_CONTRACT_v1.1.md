# Invisible Orchestra v1.1 — Low-load contract

This is an extract of Section 11.1 from the full revised specification, not a replacement for its creative/semantic requirements.

### 11.1 Optimised performance contract — replaces the v1.0 60-FPS default

**Revision intent:** preserve the original spectacle and truth model while making low continuous load the default. A calm, beautifully art-directed 30-FPS sculpture is the standard starting profile. Use 60 FPS briefly for manipulation and transitions only where the PC sustains it. This is not permission to downgrade the artwork into a flat node graph.

**Important distinction:** there are two schedulers. The energy planner is a CPU-only, event-driven calculation. The rendering controller decides when to submit graphics work. Moving the planner into a worker does not make shaders cheaper. Conversely, reducing visual quality must never change an energy plan, an explanation or a permission result.

#### A. Energy planner: calculate rarely, exactly and within a bounded problem

- MUST run the P0 energy calculation in ordinary JavaScript on one dedicated Web Worker. No WebGPU compute, ML inference, tensor library, GPU solver, agent-per-object loop or OffscreenCanvas is needed. The included reference contains no graphics API calls. Workers provide a separate script execution context and message interface; they do not automatically move arbitrary computation to the GPU. [R11]
- MUST calculate on the initial accepted scenario and on a committed, material input change. Merely touching an object, opening a decision, scrubbing time, rotating the camera, pausing, changing quality or replaying an unchanged plan triggers **zero new planning calculations**.
- Default: sliders edit a draft and update their HTML value immediately. `Replay with this change` commits it. Do not solve on every pointer movement. An optional live preview may debounce 150–250 ms, but is off in the first slice; it must be visibly a proposal, not dispatched authority.
- P0 supports one continuously controllable EV, 24 fifteen-minute slots for the example night and an absolute maximum of 96 slots for a day. Sort eligible slots once by price, then time; fill within charging/headroom constraints. The narrow divisible-load, non-negative-price problem does not need combinatorial search.
- Validate and bound inputs before solving. Reject unsupported storage, generation, V2G, minimum charging rates and non-continuous charging rather than pretending the simple reference solves them. Do not silently generalise its exact-optimum claim to future multi-device scenarios.
- Maintain only one in-flight worker request and the newest pending request. A burst of 2,000 edits cannot enqueue 2,000 solves. Mark superseded results stale immediately; do not display them on arrival.
- Use a bounded least-recently-used cache of at most 32 physical results. Key it by canonical validated inputs and model/solver version. Include prices, headroom, battery/efficiency, departure, target and binding budget. Exclude camera pose and rendering quality.
- **Do not cache permission as part of an executable result.** A cached physically feasible plan must pass the current authority gate, revision check and intent validation every time. Approval applies to the exact current proposal, not an earlier plan or previous visitor.
- Keep baseline, latest proposal, accepted plan and diagnostic infeasibility distinct. At most four such app-owned references plus the bounded physics cache are needed. Never retain an unbounded history of pointer events, plans or sessions.
- Reset increments the application revision and removes all visitor-specific intent/approval. The synthetic physics cache may remain; the previous visitor's authority may not. A pending old reply is ignored.
- P0 solve target: p95 under 5 ms of worker compute on the chosen Windows reference PC, and under 100 ms warm input-to-result including messaging. These are engineering targets, not measurements from this handover. The supplied Node benchmark is a separate synthetic CPU check.
- A two-second worker-response watchdog in the reference is a failure guard, not a permitted normal runtime and not a two-second compute allowance. It terminates a non-responsive worker, returns ERROR and waits for a new explicit request. Do not relaunch indefinitely.
- A synchronous busy worker cannot receive a cancellation message until its job yields. The supplied P0 solver relies on the strict 96-slot bound; it does not claim pre-emptive cancellation. Later searches must yield/check revisions or be terminated by the main thread. [R11]

**No approximation of the visitor's promise to make caching easier.** Do not round a 05:10 request to 05:00 secretly. The reference handles a departure within a planning slot using its shorter active interval; tariff boundaries must align with the declared slots.

#### B. Keep four clocks and two rates independent

1. **Wall clock:** event operation, idle warning and externally measured soak duration.
2. **Model time:** position within the accepted, precomputed overnight schedule.
3. **Visual time:** camera ease, ribbon phase, material highlights and reveal animation.
4. **Measurement time:** uncapped frame/worker intervals recorded by diagnostics.

The planner is not a 15-minute ticking process and not a per-frame simulation. It returns the entire schedule once. During replay, sample that schedule at the selected model time. Derive energy from the plan's interval values, not frame-count accumulation. Animating at 15, 30 or 60 FPS must give the same energy, price and permission result.

When the visitor opens an explanation, pause model time and let the scene settle. On a hidden page, stop custom rendering and audio, cancel/obsolete unnecessary work, and freeze the story. On returning, draw a fresh frame and resume only from the intended state; do not advance hours of model time or flush a catch-up animation backlog. The Page Visibility API supplies the visibility change signal. [R12]

#### C. Frame policy: one owner, no duplicate loops

| Mode | 3D rendering target | Energy planning | Behaviour |
|---|---:|---|---|
| BOOT / assets changing | On change plus bounded warm-up | Initial plan once | Progress UI stays responsive; no repeated compilation |
| ATTRACT / ambient playback | 30 FPS maximum | None for an unchanged scenario | Calm, composed movement; one chosen scenario, not parallel hidden worlds |
| ACTIVE / touch manipulation | Up to 60 FPS, or 30 in economy | None while editing a draft | Short smooth camera/reveal transitions; immediate HTML feedback |
| PLAN_PLAYBACK | 30 FPS normally | None | Sample the accepted schedule; fixed-duration authored motion |
| READING / decision held open | Render on change; zero repeating 3D frames | None | Scene visibly paused; labels remain sharp and interactive |
| PAUSED / reduced motion settled | Render on change | None | No hidden decorative animation forcing redraws |
| HIDDEN / page not visible | Zero application render submissions | Obsolete irrelevant pending work | Resume with no jump or new animation loop |

`requestAnimationFrame` has one owner. Do not also run `setAnimationLoop`, a second component rAF, a physics loop or an effect composer loop. All scene components expose update functions called by the owner. In on-demand states, no repeated rAF is scheduled after the dirty frame has rendered. Render invalidation from many events before the next paint must coalesce into one request. This follows Three.js's documented on-demand pattern. [R13]

The reference uses a cheap rAF deadline check during animation and skips unnecessary render submissions; it does not spin up separate timers for each object. On a 120/144-Hz display, ATTRACT still submits about 30 frames per second. Do not create a second independent interval limiter that accidentally halves the intended rate again.

**Zero application redraws is not a promise of zero GPU utilisation:** browser compositing, the desktop and the display still have work. Do not advertise a universal GPU-percentage cap from JavaScript.

#### D. Resolution and quality budgets

No kiosk CPU/GPU has been provided or measured for this application. Profiles below are starting ceilings requiring validation, not hardware certification. Physical screen size is not the same as rendering resolution.

| Budget | Economy | Balanced — default | Detail — staff-selected after profiling |
|---|---:|---:|---:|
| Maximum main 3D pixels | 1,440,000 (900×1600 portrait) | 2,073,600 (1080×1920) | 3,686,400 (1440×2560) |
| Ambient / active FPS caps | 30 / 30 | 30 / 60 | 30 / 60 |
| Initial opaque visible triangle ceiling | 200,000 | 350,000 | 500,000 |
| Initial whole-frame draw-call target | <120 | <180 | <250 |
| Transmissive focal objects | 1 | 1–2 | 1–2 |
| Transmission target linear scale | 0.5 initially | 0.5–0.75 initially | 0.75–1.0 after proof |
| Live shadow maps | 0; authored grounding | At most 1×1024² | At most 1×2048² |
| Estimated resident GPU resources | Aim ≤192 MiB | Aim ≤256 MiB | Aim ≤384 MiB |

All passes count towards actual measured cost: opaque, shadows, transmission, bloom, antialiasing and any comparison views. The draw-call targets are not a licence to ignore internal passes; log the pinned renderer's counters and verify a representative capture. Keep a separate inventory of textures and render targets. Counts are not byte-accurate VRAM telemetry.

The main pixel cap is a drawing-buffer limit **after** devicePixelRatio. Keep HTML text and controls at native CSS display resolution. Resize the buffer only when dimensions or a controlled quality step changes, not each frame. Use the included `fitDrawingBuffer` helper or an equivalent tested function, then prevent a second DPR multiplication in the renderer/composer. [R10]

At the same 30 FPS, 1080×1920 is one quarter of the main framebuffer pixels of 2160×3840. Relative to 4K at 60 FPS, it is one eighth of the main framebuffer pixel submissions per second. **This arithmetic is not an 87.5% measured GPU/power saving:** shader complexity, geometry, extra passes and CPU work still matter.

Emergency 720×1280 can be an explicitly labelled diagnostic fallback. Do not silently ship an unattractive low-resolution scene as meeting the visual brief.

#### E. Spend graphics work where the visitor looks

**Preserve:** a convincing close EV/home/turbine, coherent lighting, material depth, true focal glass, meaningful flowing ribbons, the spatial reveal and smooth manipulation.

**Simplify first:** distant ornaments, hidden nodes, redundant transparency, oversized textures, decorative particle count, repeated shadows and full-screen effects.

- Use roughly 6–8 principal objects and a curated 8–16 visible connections in the overview. One selected object and its decision receive the highest detail. Higher detail can switch at the authored camera transition, with hysteresis; no rapid popping.
- Bake static indirect lighting/ambient occlusion and prepare the environment reflection map at load/build time. No per-frame cubemap captures. Baked grounding belongs to static geometry; moving selected objects need an appropriate contact treatment, not a shadow frozen at the old position.
- Use standard PBR materials for ordinary objects and MeshPhysicalMaterial only where physical transmission or another premium feature is actually visible. Camera motion still changes reflections from a prefiltered environment without recapturing the world.
- Keep actual transmission on selected close glass. Test `renderer.transmissionResolutionScale` on the pinned version; Three.js documents this as a performance control for the transmission render target. Lower the separate transmission-buffer resolution before removing glass from the focal object. [R6]
- One or two glass objects can still be expensive if they cover the screen or multiply render passes. Avoid nested layers and large overlapping translucent sheets. Count the glass pass, not merely the material count. Test its approximation with the actual background. [R2]
- Give distant decorative elements art-directed reflections/opaque materials; do not call them physically refracting when they are not. Do not make every node a bauble.
- Cache spline paths and ribbon geometry. Animate a phase/amplitude uniform or a bounded set of instance attributes. At most the selected short route is rebuilt while being pulled; no per-frame tube-geometry generation across the scene.
- Use at most about 300 ambient decorative particles in Economy and 800 in Balanced, in one/few pooled batches. These are initial caps, not requirements to fill the screen. Keep quads small to limit overdraw and do not map particles to fictitious electrical units.
- Use geometric depth, occlusion and simple depth fog rather than full-screen depth of field or expensive volumetric fog. No real-time ray/path tracing, SSAO, screen-space reflections or motion blur in the first slice.
- Bloom is optional. Begin without it, then add a restrained reduced-resolution pass only if the measured budget allows. A convincing highlight is not an excuse to obscure an object with glow.
- Use a single scene for comparison. Swap between two cached model results, synchronised at the same model time, or show a simple ghost/timeline. Do not keep two full 3D worlds rendering continuously offscreen.
- Throttle diagnostics and DOM value updates to 2–4 Hz, or to data changes. Update a slider's immediate numeric feedback on input, not at the next throttled diagnostic tick. Do not continuously animate giant CSS blur/backdrop-filter layers over the 3D canvas.

#### F. Adaptive quality without flicker or dishonest measurements

Choose Balanced at boot unless staff explicitly selected a previously validated profile. Do a bounded warm-up once; do not run endless synthetic benchmarks in the background. Prewarm actual used materials with the pinned renderer's supported compile path, not every possible variant. [R6]

Collect a bounded rolling sample window. Once per second during genuine animation, evaluate delivered raw frame gaps, CPU submission time and optional asynchronous GPU timing. Do not use the intentionally idle interval in READING as evidence of slow performance. Do not mistake CPU time around `renderer.render()` for GPU execution time: command submission is asynchronous. Where available, use non-blocking timer queries, discard disjoint results and label unavailable GPU timings as unavailable. Never call `gl.finish()` or synchronous readback just to make a performance number. [R14, R15]

Proposed targets on the reference kiosk: animated-main-thread p95 below 4 ms; GPU render work p95 around 12 ms or less at 30 FPS, and around 10 ms or less for enabled 60-FPS transitions. Those work budgets seek headroom rather than a permanent saturation target; validate visual quality and actual GPU behaviour on the hardware. They do not guarantee watts or GPU utilisation.

Proposed downgrade trigger: three consecutive animated one-second windows with p95 frame gaps >1.25× the target period, or a supported GPU-timing budget persistently exceeded. Drop one step, then allow at least ten seconds before another step. Diagnose non-graphics causes too; dropping pixels will not fix a busy JavaScript thread.

Order: reduce decorative work/bloom → lower transmission resolution within the approved glass look → reduce main pixel budget one step → disable optional live shadows → choose 30-FPS ACTIVE. Never change model numbers, permissions, legibility or target reach.

Upgrade only at a safe idle/reset boundary, after at least 30 seconds of sustained headroom; stop at staff profile limits. Avoid toggling quality during the important glass reveal. Keep canonical assets resident or use a bounded cache; do not continually destroy/recreate the scene during quality adjustment. The supplied reference implements cadence and pixel budgeting, **not a complete adaptive-quality manager or 3D render graph**; Claude must implement and profile the quality controller.

#### G. Failure, disposal and endurance

A Worker is not a replacement for bounded algorithms. CPU and GPU share power/memory bandwidth on some PCs; a 100%-busy worker can still hurt the exhibit. This design aims to leave it idle between brief committed edits.

Have one owner for every worker, listener, asset, timer, render target and animation controller. Reset scene state without re-downloading, recompiling or recreating everything. Dispose genuinely retired resources exactly once and preserve those still shared. [R7]

Context loss should enter a clear paused recovery state, with bounded restoration attempts and a fresh draw. No infinite reload loop or silent fallback claiming success. Pause the renderer on `webglcontextlost`; invalidate the scene after successful restoration.

The release still needs cold offline launch, 500 repeated sessions and a twelve-hour real-elapsed mixed-use soak. A short benchmark, reference harness or fake-clock test cannot certify the actual 3D installation. Performance improvements must be compared using the same scene, camera, device, browser, duration and visibility state.

#### H. Additional acceptance tests for this revision

| ID | Requirement | Evidence |
|---|---|---|
| E01 | No planning inside render/update loop | Instrumented solve count unchanged through five minutes of playback/inspection |
| E02 | One solve per new committed scenario; cache reuse | Repeated identical choices do not recompute; keys change for all physical inputs |
| E03 | Bounded request queue | Thousands of edits keep one in-flight plus one latest; stale replies cannot win |
| E04 | Permission bypass impossible via cache | Cached FEASIBLE still waits after policy change; reset/decline cannot dispatch |
| E05 | Correct independent time bases | Identical outcomes at 15/30/60 FPS and after hidden/resume |
| E06 | Render-on-demand is real | After settling, 60 seconds in READING produces no repeating app render submissions |
| E07 | FPS cap survives high-refresh monitors | 60/120/144-Hz tests; no duplicate frame owner |
| E08 | Pixel cap survives 4K and DPR | Actual drawing-buffer pixels, not merely CSS dimensions, stay within profile |
| E09 | True focal glass preserved | Before/after actual renderer captures; readability and transmitted background checked |
| E10 | Budget includes whole graph | Record main/shadow/transmission/post-process counts and timings |
| E11 | No quality thrash | Controlled synthetic load and real hardware; downgrade/upgrade hysteresis observed |
| E12 | Eight-hour operating ambition still valid | Twelve-hour real-elapsed run and recovery tests; not marked PASS until performed |

