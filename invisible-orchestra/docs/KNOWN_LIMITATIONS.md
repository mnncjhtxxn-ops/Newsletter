# Known limitations

**Model**
- The battery has no round-trip losses and earns the import price on export. Declared in the technical layer; fix before the storage story is presented as its own lesson.
- Wind, solar, the tariff and the carbon table are authored curves. Cheap hours and windy hours coincide because the scenario says so, not because of a universal rule.
- The heat pump uses a single-zone first-order thermal model with constant COP and no solar gain or ventilation.
- The heat-pump and battery rules are readable heuristics, not optimisers. Only the car and the cold store use the verified cheapest-slot planner with provable bounds.
- Carbon is computed but not shown to visitors, in line with the spec's P0 exclusion.
- Loads are scheduled in a fixed order (car, cold store, heat, battery). A different order could find a cheaper combined day; the explanation states the order rather than claiming optimality of the whole day.

**Experience**
- Only the car uses a supplied 3D model (decimated to 24k triangles, geometry only, CC0). The house, bakery, turbine and battery are procedural drawings in light: legible, but stylised rather than photoreal. The two models supplied for the house and bakery are retired and not bundled.
- There is no way to scrub through the day by hand now that the score strip is gone: the pause button and the ring are the time controls. If scrubbing is wanted, the natural place is dragging the playhead around the ring.
- The guided first minute assumes a visitor starts with the car or the home; a visitor who opens the bakery first is guided through the bakery's controls and then pointed at the home.
- Projections are additive translucent double-sided meshes; on weak GPUs they are the most expensive thing on screen. Only one is ever visible at a time.
- The mirror floor is a second full render of the scene per frame (Balanced 1024², Detail 1536²). It is the most expensive element on screen after the projection and is untested on exhibition hardware; Economy turns it off. The decorative landscape, pillars and bokeh push the visible point count above the v1.1 800-particle cap (see `docs/PERFORMANCE.md`).
- The landscape is a hint (dim hills and spires), not a place; there is no horizon geometry, sky or terrain, and the ceiling pool is a flat shader disc.
- Only one scenario exists (Larkfield Street). Presets for a business day or a fleet are not built.
- Sound is a small synthesised layer with no authored composition.

**Operations**
- No exhibition hardware has been used. Frame time, touch ergonomics and the twelve-hour soak are unverified.
- The pending-request state stops the modelled clock. If a visitor walks away mid-request, the idle reset (default 90 s + 15 s) returns the station to attract; nothing else advances.
