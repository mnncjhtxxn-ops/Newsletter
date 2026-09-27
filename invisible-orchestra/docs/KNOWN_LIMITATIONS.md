# Known limitations

**Model**
- The battery has no round-trip losses and earns the import price on export. Declared in the technical layer; fix before the storage story is presented as its own lesson.
- Wind, solar, the tariff and the carbon table are authored curves. Cheap hours and windy hours coincide because the scenario says so, not because of a universal rule.
- The heat pump uses a single-zone first-order thermal model with constant COP and no solar gain or ventilation.
- The heat-pump and battery rules are readable heuristics, not optimisers. Only the car and the cold store use the verified cheapest-slot planner with provable bounds.
- Carbon is computed but not shown to visitors, in line with the spec's P0 exclusion.
- Loads are scheduled in a fixed order (car, cold store, heat, battery). A different order could find a cheaper combined day; the explanation states the order rather than claiming optimality of the whole day.

**Experience**
- Objects are formed from light (point clouds with a halo pass), which is the original concept but not the specification's PBR product-visualisation bar. This is an open art-direction decision.
- Only one scenario exists (Larkfield Street). Presets for a business day or a fleet are not built.
- Sound is a small synthesised layer with no authored composition.

**Operations**
- No exhibition hardware has been used. Frame time, touch ergonomics and the twelve-hour soak are unverified.
- The pending-request state stops the modelled clock. If a visitor walks away mid-request, the idle reset (default 90 s + 15 s) returns the station to attract; nothing else advances.
