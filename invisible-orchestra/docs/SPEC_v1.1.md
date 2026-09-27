# 2037: THE INVISIBLE ORCHESTRA
## Creative ambition, interaction design and engineering specification for Claude Code

**Version:** 1.1 — Optimised planning and low-load rendering — 27 September 2026  
**Status:** Revised build brief with tested reference scheduling/control modules; not a completed or hardware-validated 3D application  
**Event:** ScottishPower Digital Summit, SWG3 Glasgow, 10 March 2027  
**Primary platform:** Offline Windows PC, 50–55-inch portrait touchscreen  
**Preferred implementation:** HTML/CSS/TypeScript and Three.js; locally packaged dependencies and assets  
**Operating requirement:** At least eight hours of exhibition operation; proposed acceptance test is twelve hours of real elapsed mixed use

---

## 0. Read this first: what is established, what is proposed

### What changed in v1.1

This version supersedes v1.0 for new Invisible Orchestra development. It retains the creative ambition, visitor journey and checked numerical fixtures, but replaces the default always-60-FPS performance target with a state-aware graphics policy. Section 11.1 is the authoritative low-load contract: **CPU-only planning on committed changes; cached results; no per-frame solver; 30-FPS ambient motion; faster short interactions where supported; render-on-change inspection; bounded pixel/effect/resource budgets.**

The accompanying dependency-free reference implements the isolated EV planner, bounded cache, worker request broker, revision/permission gate and render cadence/pixel cap. It does not contain the premium 3D scene or a complete multi-device optimiser. Read `docs/TEST_RESULTS.md` for actual tests and untested work. Do not present the small diagnostic harness as the exhibit's visual design.


### Established direction from Adam's brief and the original concept

- This is a new experience, separate from Powering Up Glasgow, Energy Horizons and Play for Life.
- The theme is the future of energy in 2037. The experience should connect customer needs, renewables, networks and digital coordination.
- It is an interactive living energy sculpture, not another map, technology radar or grid-building game.
- The central interaction is to reveal an invisible decision, change a human requirement or permission, and replay a genuinely different outcome.
- It must be visually exceptional on a large touchscreen, with depth, convincing materials and meaningful motion. Cosmetic glow added to a basic diagram is not sufficient.
- It must work without venue Wi-Fi, cloud AI, live data or another station.
- Start in the existing web ecosystem. A native engine must solve a demonstrated problem before a migration is considered.
- Prove one excellent interaction before expanding into a large application.

### Detailed decisions proposed by this specification

The exact screen layout, scenario numbers, performance budgets, engineering contracts, copy, timings and release gates below are proposed implementation requirements. The scenario numbers are invented, internally checkable fixtures, not ScottishPower operational data, actual tariffs or forecasts for 2037. Test with people and the intended PC before declaring final visual or ergonomic acceptance.

**Priority language:** MUST = necessary for the specified release; SHOULD = preferred unless a measured reason is documented; LATER = excluded from the initial slice.

**Do not import requirements from Play for Life by association.** This exhibit does not need runners, cancer cells, high-fives, bauble smashing, scores, winners, registrations or a DeLorean. Reuse suitable technical infrastructure or licensed assets only where genuinely helpful.

---

## 1. The commission in one paragraph

Build a premium, interactive museum exhibit in which a visitor can see a future energy system coordinating ordinary life, stop a moment, physically open one of its decisions, understand what it knew and what it was permitted to do, change a requirement, and watch the same world respond differently. The visitor should leave thinking: **“It changed that because I changed what mattered. And it could explain the decision rather than asking me to trust it blindly.”** The spectacle and the explanation must be inseparable.

### The emotional sequence

**Wonder → recognition → agency → understanding → trust through transparency.**

The visitor should first be drawn to something beautiful, then recognise an everyday need, then discover that their input matters. They should not begin by studying a dashboard or selecting an energy technology.

### The central proposition

> The future is not only more equipment. It is existing and emerging equipment working together around people—with boundaries people can understand and control.

### What makes this different from the portfolio

| Experience | Primary role | What this exhibit must not duplicate |
|---|---|---|
| Powering Up Glasgow | Explore the energy world and business | A navigable city, infrastructure tour or exhaustive company overview |
| Energy Horizons | Discover technologies and possibilities | A catalogue, radar, trends browser or stack of technology cards |
| Facilitated grid scenario | Discuss infrastructure decisions together | A resource-allocation or grid-building challenge |
| IoT fault-finding game | Experience a particular digital capability | A troubleshooting task or reaction game |
| Play for Life | Play, compete and support the relay activation | Points, arcade effects and repeated scoring loops |
| The Invisible Orchestra | Experience and interrogate coordination | Its own territory: human promises, permissions, decisions and consequences |

### Success is not

- A neon network graph with seven circular buttons.
- A particle screensaver that ignores the visitor's choices.
- A collection of white icons in glass balls.
- A technically functional prototype presented as finished exhibition art.
- An “AI on/off” switch where “on” magically improves everything.
- A quiz whose correct answer is to give the system more control.
- An impressive video with a few hotspots pretending to be a simulation.

---

## 2. Visual ambition: a living sculpture, not a diagram

### 2.1 The overall composition

Imagine a tall, dark exhibition window containing an illuminated sculpture with real spatial depth. Luminous strands loop through a small constellation of recognisable, carefully modelled objects: an electric car, a lived-in room, renewable generation, storage and a small business. Objects emerge from the strands and remain physically convincing when inspected.

Do not arrange everything around a perfect circle. Use a composed, asymmetric vertical arrangement, a stable focal point and deliberate negative space. The broad system remains coherent while one object comes forward.

There are three distinct depths:

1. **Distant context:** restrained atmospheric light, faint infrastructure silhouettes and the wider connections that establish scale.
2. **Working system:** the current story's objects and legible energy routes.
3. **Inspection foreground:** the selected object and its decision layers, moving into the visitor's visual space without clipping through the screen interface.

Depth comes from parallax, occlusion, scale, lighting and material response—not from putting a blurred image behind flat circles. No free-flight camera is needed.

### 2.2 Material and asset quality

Aim for premium product visualisation with an artistic treatment, not literal photographic simulation of every object. Cars must have recognisable wheels, glazing, paint and charging connections. Turbines need good proportions, convincing blades and hubs. A home needs a believable room, not a cube with a window pasted onto it.

Use physically based material families: painted metal, brushed metal, ceramic, fabric, restrained glass and luminous fibre. Do not make everything translucent or metallic. The different surfaces need to remain recognisable under one consistent lighting setup.

Important objects MUST use actual coloured, modelled forms. A white pictogram is acceptable for a small interface control, not as a substitute for the hero object.

Glass is a selective material, not the concept itself. It may be used in a battery cutaway, vehicle glazing or a decision layer. Where used, it must read as glass rather than transparent plastic. Three.js distinguishes physical transmission from merely lowering opacity; its documentation also notes that physical material features have a rendering cost. Keep the expensive treatment selective. [R2]

**Do not put every object inside a glass bauble.** That belongs to a different experience and would obscure the system's relationships.

### 2.3 Light and atmosphere

- A quiet, deep blue-green/dark background, never a featureless black void.
- A consistent environment light and deliberate key/rim lighting to reveal form.
- Restrained bloom on selected luminous routes only; it must not erase object detail or text.
- A slight atmospheric separation between depths, without hiding meaningful activity.
- No full-screen flashes, perpetual zooming, camera shake or confetti.
- The foreground remains crisp during inspection. Do not blur information the visitor is trying to read.

Use consistent colour management. Colour textures, data textures and final output have different roles; incorrect colour-space treatment can make otherwise good assets look wrong. Test the assembled scene rather than compensating for mistakes by randomly increasing light intensity. [R3]

### 2.4 ScottishPower palette

Use the supplied palette as the anchor, not a requirement to saturate every surface:

| Role | Colour |
|---|---|
| Primary green | `#008C39` |
| Blue | `#0792E5` |
| Orange | `#E3850D` |
| Dark green | `#00402A` |
| Supporting greens | `#00A443`, `#26BF64`, `#5BD38C` |
| Reading-panel body text | `#3A3735` |
| Reading surfaces | White or warm off-white |

The dark immersive stage preserves the original Invisible Orchestra direction. Use light reading panels with dark text where explanation needs more contrast. Do not assume every supplied brand colour is suitable for small text on every background; measure contrast.

### 2.5 Three visual languages, never one ambiguous effect

| Layer | Meaning | Appearance | Behaviour |
|---|---|---|---|
| Energy | Modelled power transfer | Substantial, continuous luminous ribbons | Activity follows actual non-zero flows; optional labels show kW |
| Information | A forecast, measurement or request | Finer dashed routes or bounded travelling packets | Appears when a defined message event occurs |
| Authority | Permission or a limit | Gates, brackets and restrained status labels | Opens only when the model grants authority; pending and denied are visibly different |

Use shape, motion and labels as well as colour. A visitor must be able to distinguish these layers without memorising a colour legend.

Energy ribbons are schematic representations of power exchange. They are not literal electrons travelling from a named wind turbine to a named household. Ribbon packet speed is an artistic convention, not the speed of electricity. Capacity limits apply to the modelled connections, not to every line that happens to cross on screen.

Ambient glints, drifting background particles and camera easing may be decorative. Every **meaning-bearing** change—charging, opening a gate, pausing an action, increasing a load—must originate in simulation state.

---

## 3. The visitor experience: a complete worked journey

Design for three levels of engagement: an intelligible 30-second encounter, a complete approximately 2–3-minute guided journey, and optional exploration beyond that. These are testing targets, not forced timers.

### Beat 1 — Attract: ordinary life, extraordinary coordination

The sculpture quietly animates an authored example day. A car receives charge, a room remains comfortable, storage changes state and a business prepares to open. Not everything is active simultaneously.

Visible copy:

> **2037: THE INVISIBLE ORCHESTRA**  
> Life carries on. Look inside what makes it possible.  
> **Touch to begin**

Include a discreet “Illustrative 2037 scenario” identifier. Do not demand a name, display a loading spinner over the artwork or require watching the loop to its end. Touch must interrupt the attract state immediately.

### Beat 2 — Choose a promise, not a technology

Full release presents three human statements:

- **My car must be ready when I leave.**
- **My home must stay comfortable.**
- **My business must be ready to open.**

The first slice implements only the car. Do not display two dead or “coming soon” choices to visitors. Show only complete experiences.

A short interactive control establishes the requirement: “Ready by 07:00” and a clear charge target. Show charge in a comprehensible way, with precise units available in the explanation. Do not invent a mileage conversion without a declared model.

### Beat 3 — Let the world work

Play a compressed overnight sequence, approximately 15–25 seconds. The car, other loads and relevant network connection remain stable in space while the clock and activities change.

The visitor sees a clear sequence, not an instantaneous solved dashboard. It can include some early charging and more later; do not force “charge only at the cheapest time” when the charger cannot deliver enough energy in that window.

A brief prompt draws attention to one decision:

> **Why did charging happen then?**

The visitor may open it immediately. No mandatory voiceover or explanation must delay interaction.

### Beat 4 — Touch to stop; pull to reveal

Touching the relevant object/decision opens inspection and pauses the modelled story. The selected ribbon brightens. The rest of the scene recedes but remains recognisable.

An optional downward pull makes the decision separate into three elegant layers. The motion should feel like opening a mechanism: connected, weighted and reversible—not like launching a modal webpage unrelated to the object.

The three layers are:

> **You asked for this.**  
> Enough charge by 07:00.
>
> **You allowed this.**  
> Charging could move within the agreed window.
>
> **So this happened.**  
> Most charging used the lower-priced period. Some happened earlier to meet your target.

Use a small visual timeline to support the final statement. Highlight the actual relevant slots from the calculated plan.

A visible **Show the decision** button must perform the same reveal as the drag. The experience cannot depend on discovering a gesture. W3C's dragging criterion specifically calls for a non-dragging single-pointer alternative when dragging is not essential. [R4]

### Beat 5 — Change the promise

Offer one strong counterfactual:

> **What changes if you leave at 05:00?**

Use a preset and accessible plus/minus controls rather than a text field. The default public time increment is 15 minutes; the preset creates the first dramatic comparison.

Edits remain a draft until the visitor selects **Replay with this change**. Show the changed input explicitly. Do not silently change price, weather, battery state or equipment to make the result more dramatic.

For the initial release, this is a rewind-and-replay from the same scenario starting state. Label it:

> **Same starting point. Earlier departure.**

It is not a command that somehow changes already-completed charging in the past.

### Beat 6 — Watch the difference

Reassemble the sculpture and replay from the identical starting state. The car's schedule and relevant energy routes now differ. Show one concise outcome summary, not a wall of metrics.

Example for the checked fixture:

> Ready by 05:00.  
> Illustrative charging cost: **£6.00**, previously **£3.12**.  
> The lower-priced period is now after your departure.

The real rendering must show the altered schedule. A changed caption over the same animation fails this requirement.

The preferred portrait comparison is **Before / With your change**, synchronised at the same modelled time. Toggle, crossfade or show a restrained ghost of the former route. Do not default to two tiny side-by-side worlds on a narrow screen. Use the same colour/scale conventions in both.

### Beat 7 — Find a boundary

Offer a spending limit or an authority constraint. With a £4 limit and the earlier departure in the checked fixture, the system cannot deliver the requested charge.

Do not solve this with a magical efficiency boost. Show:

> **I cannot meet both limits in this example.**  
> Ready by 05:00 requires £6.00 of charging.  
> Your limit is £4.00.

Offer only alternatives the solver has validated. For this fixture: approve £6; retain 07:00 at £3.12; or explicitly accept a lower charge target. None is preselected as morally or personally superior.

### Beat 8 — Change authority

A separate, simple choice changes how much the simulated service may do:

- **Automatically, within my limits**
- **Ask before changing an agreed plan**

Do not conflate authority with willingness to spend. A price limit, a departure target, permission to reschedule and permission to share information are different fields.

When approval is required, the simulation presents the proposed change and pauses for a yes/no decision. In this exhibit, pausing for a visitor response does not secretly advance the modelled clock and punish them for reading slowly.

If they decline, the new promise is not falsely confirmed. Keep the last accepted plan/promise visible and explain which new requirement cannot currently be accepted. Always recheck physical availability; an EV cannot continue to charge after it has departed.

### Beat 9 — Human payoff

Finish on ordinary outcomes, not a synthetic “system intelligence” score:

> The car is ready. Your limits were respected. The decision is explainable.

For a deliberately unresolved branch, use truthful alternative copy such as:

> Your price limit stayed protected. The earlier departure still needs a different plan.

Final line:

> **The future is not just smarter equipment. It is coordination we can understand and control.**

Offer **Try another promise**, **Explore this decision** and a clearly accessible **Start again**. No winner, ranking, countdown or aggressive replay prompt.

---

## 4. Physical interaction and portrait ergonomics

### 4.1 Proposed composition

- Top: modest title and context; optional information but no essential high-reaching controls.
- Upper/middle area: the principal sculpture and visual outcome.
- Middle/lower area: active inspection layers and the selected human promise.
- Lower reachable band: time/limit controls, Play, Compare, Back and Start again.

Treat these as a layout strategy, not guaranteed accessibility. Measure mounting height and reach on the installed screen. Offer a **Lower controls** mode which relocates all essential actions without requiring a top-edge button to activate it.

Build and test at 1080×1920 and 2160×3840 portrait outputs, plus common Windows scaling settings. Keep readable interface text independent of the 3D rendering resolution.

### 4.2 Input rules

- One person can complete the entire experience with one hand and individual taps.
- Dragging is an enhancement. Multi-touch is never required.
- Use Pointer Events and a deliberate hit-testing layer rather than relying on one-pixel-wide ribbons.
- Make each selectable object and its label both usable entry points.
- Give immediate pressed/selected feedback before any expensive computation.
- Capture the pointer during a deliberate drag; handle pointer cancellation and release outside the canvas.
- Distinguish taps from drags. Tune thresholds on hardware; do not hard-code a physical reach assumption from an iPhone test.
- Clamp editable values and provide plus/minus or preset alternatives to sliders.
- Ignore conflicting secondary touches safely; never trigger two different promises at once.
- No browser text selection, pinch-to-zoom or page scrolling while manipulating the canvas. Do not suppress native interaction unnecessarily in explanatory reading panels.
- Keyboard operation and visible focus must cover core controls for testing and accessibility.

Use at least 48 CSS pixels as an initial control target and increase where necessary. This is a proposed design floor, not a claim that CSS pixels correspond to a particular physical size. W3C's enhanced target-size criterion uses 44×44 CSS pixels; a large installed touchscreen still needs a physical reach and sizing check. [R5]

### 4.3 Camera choreography

Use authored camera poses: `OVERVIEW`, `PROMISE_FOCUS`, `DECISION_OPEN`, `COMPARISON` and `OUTCOME`. Transitions should generally last roughly 0.5–1.2 seconds and be interruptible.

Keep the selected object in approximately the same screen region through the reveal so the visitor can follow it. Other objects move aside only enough to make space. Limit orbiting to a small, bounded inspection movement or omit it entirely in the first slice.

Respect reduced motion: retain all explanatory states using cuts/crossfades and static flow indicators rather than long camera moves. No outcome requires audio, animation speed or colour discrimination alone.

### 4.4 Session flow

Proposed default: after 75 seconds without input, show a 15-second “Still exploring?” notice before returning to attract. Do not reset during active interaction. Tune the reading-state timeout separately; deliberate playback and pending computation must not trigger immediate abandonment. Provide a facilitator mode that disables automatic visitor resets.

A visitor reset clears their draft choices and comparison history. It must not recreate the entire renderer or discard all shared assets.

---

## 5. Scope and scenarios

### P0 — First complete slice: the car promise

One EV, one home with fixed essential load, a modelled network connection and a renewable context/source where the public scenario includes one. One overnight schedule, one changed departure time, one binding price constraint, one permission branch and one clear before/after comparison.

The unit-test fixture in section 7 intentionally disables generation and storage to make arithmetic independently checkable. Do not turn a dormant battery into an apparently active feature merely to fill the first scene. Add it when its behaviour is actually modelled.

The first slice MUST include real-quality presentation. “Polish later” is not an excuse to deliver the wrong visual class again.

### P1 — Shared flexibility and storage

Add a stationary battery with explicit capacity, charge/discharge limits, losses and a protected reserve. Add a shared feeder constraint so scheduling one flexible activity can affect another. Prove that the battery's contribution is physically bounded and that moving demand can help without always solving the problem.

In a public renewable-rich scenario, cheaper slots and more available wind may coincide, but label that as an authored scenario. Do not encode a universal rule that more wind always makes an individual customer's tariff cheaper.

### P2 — Comfortable home

Human promise: **“Keep the home within the comfort range I agreed.”**

Use a declared simple thermal model or a fixed, documented thermal fixture. Define indoor/outdoor temperatures, thermal capacity, loss coefficient, heat-pump input limit and COP assumption. Calculate temperature over time; never change a thermometer just because a mode is labelled “smart”.

A possible model is:

`T_next = T + dt_hours × (COP × P_heat_kW − loss_kW_per_degC × (T − T_out)) / thermal_capacity_kWh_per_degC`

All coefficients are illustrative. No ventilation, solar gains or variable COP unless explicitly modelled. Check units and numerical stability. Do not present this as a prediction for a real home or a medically safe temperature recommendation.

The human can decline preheating or rescheduling. That is a valid boundary, not a lower moral score. No trade-off silently overrides a protected comfort requirement.

### P3 — The business opens

Human promise: **“The bakery must be ready to open at 06:00.”**

Represent a small, understandable process: a scheduled preparation/heating task with an earliest start, required uninterrupted duration, power profile and completion deadline. Refrigeration or another declared essential load remains protected. Moving the start is allowed only inside the approved window; an oven process is not randomly paused like EV charging.

The payoff is warm light, a completed batch and an opening sign. No need for animated people in the first version. The modelled business process matters more than a decorative facade.

### LATER — Explicit uncertainty

A forecast shortfall or equipment unavailability can be added after the deterministic journey works. Keep forecast and realised values separate. Replays use the same realised event sequence when comparing policies. Decisions may only use information available at their timestamp; no accidental clairvoyance.

Do not add this merely for drama. It must teach why resilient plans and clear fallback permissions matter.

---

## 6. The simulation contract

### 6.1 Architecture of truth

The dependency must be:

`validated scenario + accepted visitor intent → plan → decision trace → presentation`

Never:

`visual effect → invented explanation or savings number`

The energy planner has no dependency on Three.js or the DOM and requests no GPU compute. One CPU Web Worker runs it on initial/committed inputs, with bounded caching and latest-request handling. Rendering reads a stable simulation result; it cannot modify cost, permissions or energy balances. Explanation copy is generated from the same recorded decisions as the schedules. A separate main-thread authority gate prevents a cached physical plan becoming permission. See Section 11.1 and the included reference code.

### 6.2 Time and units

Use explicit fields such as `powerKW`, `energyKWh`, `priceGBPPerKWh`, `durationHours` and `timeMinutes`. A bare variable named `energy` is insufficient at a system boundary.

The first fixture uses 24 slots of 15 minutes, from 01:00 through 07:00. A larger day may use 96 slots. Keep four clocks separate: wall-clock operation, modelled scenario time, visual transition time and performance measurement.

Displayed animation samples a precomputed schedule at the modelled time. Pausing an explanation pauses the modelled story. A slow GPU cannot change the numerical result. On tab/background suspension, pause the visitor story and resume predictably rather than jumping to an unexplained outcome.

Round money only for display. Keep enough internal precision for independent assertions. Use a documented epsilon, proposed `1e-6 kWh` for energy assertions in these small fixtures, rather than comparing formatted strings.

### 6.3 Minimum physical constraints

For each slot:

`grid_import + renewable_used + battery_discharge = essential_load + flexible_load + battery_charge + grid_export`

All powers in kW. No simultaneous import/export or simultaneous battery charge/discharge in this simplified model. Any unused renewable generation must be accounted for as export or curtailment.

Battery update:

`E_next = E + eta_charge × P_charge × dt − P_discharge × dt / eta_discharge`

EV update for the first release:

`EV_E_next = EV_E + eta_EV × P_EV_AC × dt`

Respect capacity, target, charger power, availability windows and network limits. Do not model V2G until it has its own permissions, reserve requirement and energy accounting. No charge is delivered while the vehicle is absent.

Explicit simplifications: aggregate real-power scheduling only; no voltage, frequency, phase imbalance, AC load-flow calculation or line-loss model in the first slice. Do not describe a connection as safe for a real network because this teaching model finds a feasible schedule.

### 6.4 Hard constraints, preferences and authority

Separate these categories in data and explanations:

- **Physical limits:** charger capacity, available energy, connection capacity and device availability.
- **Accepted human commitments:** target charge, agreed deadline, protected comfort/process requirements.
- **Optional hard commercial limits:** a visitor's explicitly binding maximum cost.
- **Soft preferences:** lower cost, less schedule movement or greater coincidence with renewable availability.
- **Authority:** whether a particular reschedule/data use/control action is allowed, requires approval or is prohibited.

A solver may return “no feasible plan” for an incompatible set. It must not silently demote a hard requirement to a preference.

Do not award higher scores for looser privacy or more automation. Do not reduce comfort to make a demonstration appear successful.

### 6.5 Scheduling method and claims

For the isolated EV fixture, a deterministic cheapest-available-slot allocation is sufficient: fill eligible slots in ascending tariff order, constrained by charger and feeder headroom, until the required AC energy is scheduled. Break ties by earlier time. Partial-slot **average** power is permitted within the declared continuous 0–7.2 kW fictional charger model.

For more complex coupled cases, use a documented deterministic optimiser or bounded enumeration appropriate to the small scenario. Vendor any library locally and record its licence. A heuristic is acceptable only if its limitations are exposed.

Allowed statuses:

- `FEASIBLE`
- `PROVEN_INFEASIBLE`
- `NO_PLAN_FOUND`
- `AWAITING_PERMISSION`
- `ERROR`

A failed heuristic search is not proof of physical impossibility. Use a capacity bound, minimum-cost bound or a suitable solver certificate before reporting `PROVEN_INFEASIBLE`. Otherwise say the current planner did not find a plan.

For infeasible combinations, keep diagnostic unmet quantities separate from the last accepted feasible plan. Do not animate an invalid schedule as though it were dispatched.

### 6.6 Cost, carbon and claimed benefits

In the checked fixture, cost means **the EV's AC charging energy multiplied by its synthetic retail tariff**. It excludes household base-load cost, standing charges, taxes beyond the fictitious rate, export revenues and network-service payments. It is not total system cost.

A source-of-energy visual and a retail charging bill are separate concepts. Do not double-count energy bought by one actor and transferred to another.

Carbon is excluded from P0. Add it only with declared factors, a clear accounting boundary, appropriate treatment of storage charging and an explanation of what the number does not mean. Do not generate “CO2 saved” by multiplying a screen score by an arbitrary factor.

No claims of actual savings, automatic customer entitlement or guaranteed 2037 capability. Real-world context: SP Energy Networks describes flexibility services and participation involving EV chargers, batteries and heat pumps. That supports the theme, not this fictional configuration or its numerical outcomes. [R1]

### 6.7 Multiple actors, not one omnipotent controller

The exhibit may run a central local scheduler for clarity, but the depicted world must distinguish customer/device, supplier or aggregator, renewable source and network constraint. A network operator is not shown casually accessing every customer's personal information or controlling every appliance.

Define what each actor can know, what it can request, and what it may execute. A shared deadline or flexibility window is not the same as disclosing a person's calendar, destination or identity.

The first permission feature can be narrow: permission to reschedule the EV. Defer a wider data-sharing simulator unless implemented with meaningful consequences and credible actor boundaries.

---

## 7. Checked numerical fixtures: non-negotiable regression tests

These are artificial tests, not real tariff advice or the final complete community scenario. The accompanying JSON contains the same values.

### Common fixture

- Horizon: 01:00–07:00; 15-minute slots.
- EV battery capacity: 60 kWh.
- Initial stored energy: 12 kWh.
- Required stored energy at departure: 30 kWh.
- Required addition: 18 kWh into the battery.
- Charging efficiency: 0.90, constant.
- Charger input: continuously variable 0–7.2 kW AC.
- Required charging input: `18 / 0.90 = 20 kWh`.
- Tariff 01:00–05:00: £0.30/kWh; 05:00–07:00: £0.10/kWh.
- Essential feeder load: 2 kW throughout.
- Base feeder import limit: 12 kW.
- Generation, stationary storage and V2G: disabled in these tests.
- Initial authority: automatic rescheduling within accepted limits.

| ID | Change | Expected result |
|---|---|---|
| F01 | Departure 07:00, no price cap | Feasible; 20 kWh AC; 18 kWh added; 30 kWh final; minimum EV charge cost £3.12 |
| F02 | Departure 05:00, no price cap | Feasible; same required energy; minimum cost £6.00; £2.88 more than F01 |
| F03 | Departure 05:00, hard £4 cap | Proven incompatible with 30 kWh target; within-budget maximum final charge is 24 kWh; shortfall 6 kWh |
| F04 | Departure 03:00, no price cap | Proven power/time limit; maximum final charge 24.96 kWh; shortfall 5.04 kWh |
| F05 | Departure 05:00; feeder limit reduced to 6 kW | Only 4 kW remains after essential load; maximum final charge 26.4 kWh; shortfall 3.6 kWh |
| F06 | Departure 07:00; feeder limit 6 kW | Feasible with no price cap; minimum charging cost £4.40, not £3.12 |
| F07 | Rerun F01 with identical inputs | Same schedule, metrics, event ordering and deterministic trace content |
| F08 | F02 rescheduling requires approval | No changed plan dispatched while pending; approval permits validated plan; decline does not falsely confirm the 05:00 promise |

F01 arithmetic: the two cheap hours can supply 14.4 kWh AC. The remaining 5.6 kWh must be bought in the dearer period: `14.4 × £0.10 + 5.6 × £0.30 = £3.12`.

With the earlier-slot tie-break, the expensive portion uses 01:00–01:45 at 7.2 kW and 01:45–02:00 at 0.8 kW. The cheap portion uses 05:00–07:00 at 7.2 kW. This schedule is a fixture, not an instruction to hard-code the rendered animation.

F06 arithmetic: headroom is 4 kW, so cheap slots can supply only 8 kWh. The other 12 kWh costs the higher rate: `8 × £0.10 + 12 × £0.30 = £4.40`.

Do not include random session IDs or wall-clock timestamps in a deterministic equality comparison. Keep those in a separate diagnostic envelope.

---

## 8. Explainability: decisions you can actually inspect

A decision object MUST retain enough evidence to answer both “What happened?” and “Why did it happen here?”

Proposed fields:

```ts
type PlanStatus =
  | 'FEASIBLE' | 'PROVEN_INFEASIBLE' | 'NO_PLAN_FOUND'
  | 'AWAITING_PERMISSION' | 'ERROR';

interface DecisionRecord {
  id: string;
  planId: string;
  scenarioVersion: string;
  actorId: string;
  deviceId: string;
  decisionTimeMinutes: number;
  actionType: string;
  affectedSlots: number[];
  promiseIds: string[];
  permissionIds: string[];
  observations: Array<{
    key: string; value: number | string | boolean;
    unit?: string; knownAtMinutes: number;
  }>;
  bindingConstraints: string[];
  reasonCodes: string[];
  consideredAlternatives: Array<{
    id: string; status: PlanStatus; rejectionReason?: string;
  }>;
  resultingMetricIds: string[];
}
```

The full application schema also needs Scenario, Device, Promise, Permission, ScheduleSlot, PlanResult, Comparison and VisitorSession. Validate scenario JSON and reject missing units, negative capacities, invalid timestamps and unknown enum values.

Use a small authored template system driven by reason codes. No online LLM is needed to explain that cheap capacity was insufficient before departure.

Example reason codes: `CHEAPER_SLOTS_USED`, `CHEAP_WINDOW_CAPACITY_LIMIT`, `DEPARTURE_EXCLUDES_CHEAP_WINDOW`, `FEEDER_HEADROOM_BINDING`, `BUDGET_TARGET_CONFLICT`, `APPROVAL_REQUIRED` and `PERMISSION_DECLINED`.

Reasons must correspond to facts that affected the decision. Merely observing “the wind forecast was high” does not justify claiming it caused a change if the scheduler ignored it. Use actual constraint/alternative evidence where possible. Do not manufacture a long explanation to make a trivial calculation sound like sophisticated AI.

### Explanation layers

- **Public:** the three human statements, approximately 10–20 words each.
- **Curious visitor:** timeline, one binding limit and the most useful alternative.
- **Technical detail:** exact assumptions, units, decision record and the simplified model's boundary.

No layer should obscure the ability to return to the story.

---

## 9. Rendering and interaction implementation

### Preferred stack

Use TypeScript, Three.js and standard HTML/CSS for the accessible interface. A development bundler is acceptable; the event build must not depend on a running development server or package installation.

Pin an actual Three.js version and its matching loaders/post-processing modules. Record it in the lockfile and release manifest. Verify APIs against that release; do not combine snippets from different revisions. The current Three.js WebGLRenderer uses WebGL2, so run a real capability check and provide an honest unsupported-device state. WebGPU is not required for this brief. [R6]

### Suggested modules

```text
src/
  app/            # app state machine, visitor intent, restart/recovery
  simulation/     # CPU planner, worker broker, bounded plan cache, constraints
  rendering/      # single cadence owner, demand rendering, quality/pixel budgets
  explanation/    # decision records, reason templates, comparisons
  scene/          # objects, ribbons, lighting, cameras, reveal animation
  interaction/    # pointer hit tests, gesture state, accessible actions
  ui/             # HTML panels, controls, copy, focus management
  audio/          # optional local sonification
  diagnostics/    # timings, resource counts, test-mode hooks
scenarios/
assets/
tests/
docs/
```

The exact filenames can change. The separation of responsibilities cannot.

### State machine

```text
BOOT → ATTRACT → PROMISE → PLAN_PLAYBACK → DECISION_OPEN
DECISION_OPEN → EDIT_DRAFT → REPLAN → COMPARISON → OUTCOME
REPLAN → CONFLICT or AWAITING_PERMISSION or ERROR
CONFLICT / AWAITING_PERMISSION → explicit visitor choice → REPLAN
Any visitor state → safe reset → ATTRACT
```

Introduce a separate idle-warning overlay without corrupting the underlying state. A cancelled drag or a dismissed help panel returns to the correct prior state.

### Selection and visual binding

Every selectable scene object has a stable semantic ID, a large interaction proxy, a matching HTML control and known connection anchors. Selection resolves to that ID, not an arbitrary visual triangle index.

Use restrained spline/ribbon geometry and GPU animation where suitable. Cache routes and update uniforms/attributes rather than rebuilding thousands of meshes each frame. Depth ordering must keep explanations and the selected connection legible.

Separate actual values from animation interpolation. The amount of displayed stored charge is a sampled model value. Visual easing may soften a transition, but it must not overshoot or imply energy above capacity.

The selected decision should expose enough of the system to show its relationships while avoiding 20 overlapping routes. In guided mode, show a curated subset. “More detail” may expose the rest.

### Glass/material lab

Before applying transmission widely, create a test scene with an opaque object behind the glass, a dark and light background, moving highlights and two potentially overlapping transmissive objects. Verify that the pinned renderer's approximation holds up for the composition. Do not assume nested transparent layers behave like offline ray tracing.

Use `MeshPhysicalMaterial` only where its features are needed. Initial glass parameters can be transmission near 1, metalness 0, opacity 1, low but nonzero roughness, IOR around 1.5 and thickness appropriate to the asset's scale. These are starting values for look development, not a guaranteed premium appearance. [R2]

Avoid fake chromatic aberration and excessive distortion that make the inner object or decision text harder to read.

### Optional audio

Use locally packaged, licensed sounds or restrained synthesis. Each actor may have a soft musical motif; a permission request may suspend a phrase; a resumed action may resolve it. Audio must be user-enabled after interaction, muted by default or configured by staff, and never imply that declining permission is a wrong answer through an unpleasant failure sound.

The entire exhibit must be understandable in silence. No essential narration. Never use browser speech synthesis as a guaranteed offline voice asset.

---

## 10. Asset requirements and production hygiene

### Minimum asset set

| Asset | Visible quality requirement | Functional anchors |
|---|---|---|
| Electric car | Recognisable proportions, coloured bodywork, wheels, glazing, charging port | Charge connection, inspection pivot, label anchor |
| Renewable source/turbine | Convincing rotor/hub/tower proportions; controlled slow animation | Power-output anchor; generation data binding |
| Home/room slice | Warm materials, window, familiar furnishings; no need for a full house | Essential-load anchor; later thermal-state binding |
| Network connection | Clear physical suggestion of a feeder/meter/connection, not a fake control room | Import/export anchors, capacity annotation |
| Stationary battery, P1 | Distinct housing with a legible internal energy representation | Charge/discharge ports and reserve marker |
| Bakery/business, P3 | Detailed but compact shop/process slice | Process-load and completion-state anchors |
| Ribbons and reveal layers | Elegant generated geometry with stable depth and coherent lighting | IDs linked to flows, permissions and decisions |

A turbine symbol may stand for the scenario's allocated renewable contribution. Label the modelled scope; do not imply a physically tiny turbine or a direct private wire from a real wind farm unless that is the defined fictional topology.

### Asset contract

- glTF/GLB for scene assets; metres, Y-up, documented forward direction and sensible object origins.
- Named meshes, materials and anchor nodes. Do not infer connection points from an arbitrary bounding box at runtime.
- Source files and optimised runtime files kept separately.
- Preserve correct normals, UVs, tangents and material channels. Inspect them under the intended lighting.
- Record triangle count, material count, texture resolution, estimated runtime texture footprint and compressed size.
- Start with 1K/2K maps where adequate. Higher-resolution maps must earn their cost in close inspection. Do not use “4K texture” as a proxy for quality.
- LODs share position, orientation, semantic ID and connection anchors. Do not change an object's pose or location when its detail level changes.
- Use KTX2/geometry compression only when the locally packaged decoder pipeline has been tested. Smaller download size does not prove low runtime cost.
- No placeholder logos or source filenames visible in a visitor release.

### Licensing

Prefer original or verified permissively licensed assets. Do not buy assets, subscribe to a service or use a paid generation API without explicit approval. Do not assume a file is CC0 because the surrounding site has other CC0 files.

Maintain `assets/manifest.json` containing asset ID, creator, source URL, licence/version, attribution text, permitted modifications, original filename, changes made, runtime path and checksum. Preserve licences/credits inside the package. Check redistribution terms for an offline bundle; permission to render an asset and permission to distribute raw source assets are not automatically the same.

Do not reuse scanned people merely because they are available from Play for Life. This exhibit can establish human meaning through rooms, devices, business outcomes and language without a character-animation production burden.

---

## 11. Performance, reliability and offline deployment

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

### 11.2 Offline means cold-start offline

Deliver a production folder that starts with the PC's internet connection disabled, from a fresh browser session, without prior cache warming. Include fonts, models, textures, environment maps, sounds, JSON data, JavaScript and any WASM/worker decoder files.

Do not use CDNs, Google Fonts, remote analytics, remote images, live weather/prices, login services, cloud LLMs or remotely fetched licence checks. Attribution/source URLs in an optional staff reading page are references, not runtime dependencies.

Use a loopback static server for the modular folder build. `file://` is not an interchangeable substitute for serving ES modules; MDN documents local-file module security restrictions. [R8]

**A folder copy alone is not a complete deployment plan.** Provide an IT-approved launch route with all required runtime prerequisites accounted for. Do not assume Windows has Python, Node, a package manager or administrator rights installed/available.

Acceptable release routes:

1. A supplied, approved local static-server executable with the required licence notices and platform build; or
2. An agreed, preinstalled runtime whose existence/version is checked before launch; or
3. An automated single-file distribution from the same source, only if all assets/loading paths actually work through the intended file launch and the size remains acceptable.

Choose and document the actual supported route. Do not advertise all three unless they have been tested. Never disable browser security to make a build appear offline-compatible.

### 11.3 Launcher behaviour

The Windows launcher must check paths safely, support spaces in the installation folder, bind only to `127.0.0.1`, use a documented configurable port, avoid killing unrelated processes, verify readiness and launch the correct page in Edge. A second launch should reuse a verified existing instance or fail clearly rather than starting duplicate loops/servers.

If a dependency is missing, show a useful staff-facing error. Do not try to download it during the event. Build a macOS developer/preview route separately and state its prerequisites.

A separate optional mobile-preview host may be used during development, but it is not part of the offline kiosk acceptance. Do not expose the local server to the venue network by default.

### 11.4 Kiosk lifecycle

Keep Windows kiosk configuration separate from application logic. Edge's kiosk idle-timeout option closes the browser and does not itself restart it; Microsoft documents the need for a relaunch mechanism such as Assigned Access. [R9]

Use the app's inactivity reset for visitor sessions. Do not rely on periodic browser restarts to conceal leaks. An external, IT-approved recovery mechanism may monitor the launcher/page health, but must distinguish a legitimate paused inspection from an unresponsive application.

Handle missing assets, shader failure and WebGL context loss with a clear recovery state. Do not silently replace the whole experience with an unlabelled low-quality slideshow. Retry only in a bounded way and avoid infinite reload loops.

### 11.5 Data

No personal data is required. Do not carry across Play for Life's full-name capture or leaderboard logic.

Optional local aggregate diagnostics: starts, completed journeys, opened decisions, selected scenario IDs, error counts and performance summaries. Do not retain a named person's privacy choices, spending limits or inferred household behaviour. Use synthetic visitor choices and avoid profiling.

The application must work when persistent browser storage is unavailable or cleared. Staff settings may use a validated local config file. Diagnostics export must distinguish synthetic test activity from actual event usage. Browser storage alone is not a guaranteed archival mechanism.

---

## 12. Acceptance tests: what counts as done

### Visual and interaction tests

| ID | Test | Pass condition |
|---|---|---|
| V01 | Actual renderer, attract scene | Composed depth, recognisable coloured objects, controlled light and negative space; not a generic node graph |
| V02 | Close object inspection | Geometry/material quality holds up in the intended close view; no white placeholder icon replacing the object |
| V03 | Pull-apart reveal | Selected object, its connections and explanation retain clear spatial continuity; tap alternative works |
| V04 | Before/after replay | Same starting state and comparison time; actual schedule/flow differences visible and numerically supported |
| V05 | Conflicting requirements | No fake success animation; genuine conflict and validated alternatives shown |
| V06 | Layers | Energy, information and authority remain distinguishable without colour alone |
| V07 | Glass where used | Object and background remain legible; no opaque-plastic look, sorting disaster or excessive distortion |
| V08 | Reduced motion/audio off | Full meaning and all core actions remain available |
| V09 | Portrait hardware | Essential controls reachable and readable on mounted screen, including lower-controls mode |
| V10 | Rapid interaction | Repeated taps, cancelled drags and back/reset during transitions cannot strand the application |

### Numerical and authority tests

| ID | Test | Pass condition |
|---|---|---|
| N01 | Fixtures F01–F06 | Expected energy, cost and infeasibility bounds match independently calculated values |
| N02 | Energy balance | Every slot balances within documented tolerance; no negative storage or capacity overflow |
| N03 | Availability | No activity after EV departure or outside allowed business/process windows |
| N04 | Repeatability | F07 produces deterministic result/trace content; independent of frame rate and cosmetic random seed |
| N05 | Permission | Pending/declined authority never executes a changed plan as though it were approved |
| N06 | Explanation consistency | Displayed reasons, metrics and affected timeline slots derive from the selected decision record |
| N07 | Solver limitation | Timeout/no-plan-found is not labelled proven impossible without evidence |
| N08 | Counterfactual | Changing departure does not secretly change prices, forecasts, initial charge or equipment |
| N09 | Reset | Next visitor starts from the canonical scenario, not the previous visitor's edited world |
| N10 | Later storage/thermal modules | Independently checked losses, reserves, temperatures and process continuity before public inclusion |

### Operational tests

| ID | Test | Pass condition |
|---|---|---|
| O01 | Cold offline launch | Fresh session and network disconnected; all content loads from local package |
| O02 | Network audit | No external runtime requests; optional source links not opened automatically |
| O03 | Twelve-hour soak | Actual elapsed mixed use, not a clock fast-forward; no unexplained crash/freeze or progressive deterioration |
| O04 | Repeated sessions | At least 500 automated reset/journey cycles where feasible, plus real touch testing; retained resources stabilise |
| O05 | Honest profiling | Raw frame intervals, render settings, all relevant render passes and hardware recorded |
| O06 | Recovery | Demonstrated behaviour after browser closure, server interruption, context loss and PC restart |
| O07 | Missing/invalid config | Clear bounded failure; no silent unsafe defaults or endless spinner |
| O08 | Clean install | Unzip and launch on a second machine/account with documented prerequisites only |

### Human evaluation

Test with at least five people unfamiliar with the concept before expanding the first slice. This is formative testing, not statistical proof of learning.

Ask them, without prompting the answers:

1. What did you ask the system to do?
2. What changed when you changed the departure time?
3. Why did it change?
4. What was it allowed to do without asking you?

Proposed early gate: at least four of five can explain the principal cause-and-effect and complete the journey without coaching. Record confusion and revise. “Looks amazing” alone is not a pass; “I understood it” over a visually poor diagram is not a pass either.

### Evidence requirements

Use screenshots and screen recordings from the running application. Generated concept art may guide design, but must be labelled and cannot serve as proof of implemented quality. A headless browser image proves a state rendered, not that a real touchscreen is ergonomic or the PC can run it for eight hours.

Keep a test ledger with `PASS`, `FAIL`, `NOT RUN` and `BLOCKED`. Record exact duration and environment. Never describe an unexecuted patch, a syntax check or one attractive still as full UAT.

---

## 13. Delivery sequence and gates

### Gate A — Establish the honest core

Create a separate project/repository. Preserve other event apps. Read and run the accompanying reference implementation and tests first. Write scenario/unit validation and implement F01–F08 before coupling results to graphics. Prove E01–E08's scheduling/control requirements before scaling up artwork. Produce a plain diagnostic readout for development only.

Deliver: validated scenario contract, fixture tests and a short explanation of the chosen scheduler. No claim of a complete exhibit at this stage.

### Gate B — Prove the visual language

Build a look-development scene with the hero EV, home, connection and a small number of correctly differentiated routes. Add a working pause/reveal with real decision data. Render overview, focus and inspection views at portrait resolution.

Deliver: actual app screenshots and a short capture of movement. If it still looks like glowing icons, improve this scene rather than expanding the feature set.

### Gate C — One exceptional minute

Integrate the car's baseline, earlier departure, before/after replay and one honest conflict. This is one coherent playable/usable slice, not disconnected demos. Include the no-drag path and a visitor reset.

Deliver: a locally runnable production package, verified numbers and a 60–90-second walkthrough. The walkthrough length is a demonstration target, not a forced visitor timer.

### Gate D — Human agency

Add the bounded permission branch, clear pending/declined states and a validated alternative-plan flow. Prove that refusal is respected without shaming or false success.

Deliver: decision trace and explicit authority tests alongside the visual journey.

### Gate E — Expand only after the core works

Add shared storage/network constraints, then the home and business promises. Use the same interaction language and data contracts. Each scenario needs its own numerical fixtures and evidence that the added mechanics are actually present.

Do not produce three shallow scenarios instead of one excellent one.

### Gate F — Exhibition release

Profile on intended hardware with the v1.1 state-aware 30/60/on-demand policy and whole-frame graphics budgets; complete long-run, touch and recovery tests; package licences, operator guide and rollback-ready prior release. Add optional audio only after the silent experience is complete.

### Scope discipline

Claude Code should work through gates without repeatedly asking to reconfirm settled requirements. Where an essential asset or hardware fact is missing, record the assumption and continue with independent work. Do not spend money, publish publicly, weaken security or claim final visual sign-off without authority/evidence. A visual approval gate can be prepared with evidence; it must not be self-certified on Adam's behalf.

---

## 14. Required deliverables

1. Maintainable source with a pinned dependency lockfile and documented build steps.
2. Production offline folder and the actually supported launch mechanism.
3. Canonical scenario files and checked numerical fixtures.
4. Reusable object, ribbon, camera and reveal components—not a monolithic canvas script.
5. Asset/licence manifest and any required on-screen attribution.
6. A concise operator guide covering start, reset, exit, recovery, quality profiles and expected limitations.
7. Automated test output and a human-readable acceptance ledger.
8. Actual in-app screenshots/recordings for key states and portrait layouts.
9. A performance report naming hardware, browser, render resolution and test duration.
10. A handover note separating completed features, provisional implementation, known defects, blocked work and genuine later scope.
11. Scheduling/control evidence: compute counts, queue and cache bounds, stale-reply/permission tests, and proof that frozen inspection stops drawing.
12. Per-profile actual pixel buffers, complete render-pass costs, memory estimates, raw timings and hardware-specific quality settings.

Suggested documentation:

```text
docs/
  CREATIVE_BRIEF.md
  SCENARIO_AND_UNITS.md
  DECISION_TRACE.md
  OPERATOR_GUIDE.md
  ASSET_LICENCES.md
  TEST_RESULTS.md
  PERFORMANCE.md
  KNOWN_LIMITATIONS.md
```

Do not include private development paths, credentials, unused source scans or large unnecessary master files in the runtime package. Do not edit existing Play for Life releases as part of this project.

---

## 15. Quality bar: non-negotiable final checks

- The visitor sees a meaningful change in the world, not just a different number.
- The system can explain a decision using the evidence that actually produced it.
- “No feasible plan” is sometimes the correct, useful outcome.
- People remain in control of accepted requirements and permissions.
- The sculpture is beautiful before a panel opens and understandable after it opens.
- Recognisable, coloured 3D assets hold up close; generic icons do not stand in for them.
- Visual ornament never claims false energy, savings or authority.
- Offline cold start and repeated-use stability are proven, not inferred from the architecture.
- It remains a coherent exhibit, not an overgrown dashboard or an arcade game.

### North-star test

> **A visitor touches something beautiful, discovers an invisible decision, changes what matters, and sees exactly why the future changes.**

---

## 16. Primary-source implementation references

The references below verify specific existing technical capabilities or background context. They do not validate the proposed design, performance targets, fictional scenario or 2037 forecasts. Consult the documentation matching the actual pinned software release.

- **R1 — SP Energy Networks, Flexibility Services.** Existing context for flexibility and distributed devices; not a source for our synthetic tariffs or scenario outcomes. https://www.spenergynetworks.co.uk/pages/flexibility.aspx
- **R2 — Three.js, MeshPhysicalMaterial.** Physical transmission, thickness, IOR and material trade-offs. https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- **R3 — Three.js, Color Management.** Input/working/output colour spaces and texture treatment. https://threejs.org/manual/en/color-management.html
- **R4 — W3C WAI, Understanding SC 2.5.7 Dragging Movements.** Single-pointer alternatives to dragging. https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- **R5 — W3C WAI, Understanding SC 2.5.5 Target Size (Enhanced).** 44×44 CSS-pixel enhanced target criterion; physical kiosk reach still requires testing. https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
- **R6 — Three.js, WebGLRenderer.** Current WebGL2 baseline and renderer diagnostics. https://threejs.org/docs/pages/WebGLRenderer.html
- **R7 — Three.js, Cleanup.** Explicit resource disposal and shared-resource ownership. https://threejs.org/manual/en/cleanup.html
- **R8 — MDN, JavaScript modules.** Local-file security restrictions and module-serving requirements. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- **R9 — Microsoft, Configure Edge kiosk mode.** Kiosk operation and idle-timeout relaunch caveat. https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode
- **R10 — Three.js, Responsive Design.** Separating canvas display dimensions and rendering dimensions. https://threejs.org/manual/pages/responsive.html

- **R11 — MDN, Using Web Workers.** Separate script context, messages and immediate worker termination. https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- **R12 — MDN, Page Visibility API.** Visibility-driven suspension/resumption. https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- **R13 — Three.js, Rendering on Demand.** Coalesced invalidation and avoiding continuous redraw when unchanged. https://threejs.org/manual/pages/rendering-on-demand.html
- **R14 — MDN, WebGL best practices.** Avoid blocking readback; memory/resource and rendering-budget considerations. https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- **R15 — MDN, EXT_disjoint_timer_query.** Optional asynchronous GPU time measurement and disjoint validity; choose the corresponding available WebGL2 extension in implementation. https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query

### Instruction to Claude Code

Read this v1.1 document, `docs/INTEGRATION.md`, `docs/TEST_RESULTS.md` and the accompanying unchanged numerical fixtures as the authoritative brief. Preserve the art direction. Integrate CPU-only planning and the low-load graphics contract before expanding the new Invisible Orchestra project. Begin with Gates A–C. Build a separate project, preserve existing apps, implement the checked scenario, and prove the sculpture/reveal/replay quality in the actual renderer. Do not replace the concept with a glowing node dashboard, a technology catalogue or a simulated success animation. Keep an honest test ledger and state what has actually run. The first deliverable is one exceptional, explainable, offline slice—not the largest possible feature list.
