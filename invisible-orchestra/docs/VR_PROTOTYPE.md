# The conductor's chair: VR prototype

The same single file, worn. When the exhibit is opened in a headset browser that supports WebXR (a Meta Quest 2, 3 or Pro in its own browser), an **Enter VR** button appears in the control row. Pressing it starts an immersive session in the same scene: the visitor stands at the centre of the sculpture, the ring of the day at their feet, the objects around them, the orchestra playing from where the objects are.

## Status, honestly

Built and exercised **without a headset**. The ray logic (pinch an object, pinch the ring and sweep, pinch nothing and hold, press the panel's buttons) is driven by synthetic rays in an automated test against the real scene, and the in-room panel is rendered and hit-tested the same way. No one has worn it. The first session on a real Quest will find things: comfort of the ride, the panel's distance and size, hand-tracking pinch reliability, and frame rate on the mobile GPU. Budget a day with a headset before showing it to anyone.

## How to run it on a Quest

WebXR needs a secure origin, and the headset cannot read a laptop's disk, so serve the built file over HTTPS on the local network:

```
npm run build
npm run vr          # prints https://<laptop LAN IP>:8443/
```

On the headset, open that address in the Quest browser, accept the self-signed certificate once, touch the screen once (audio needs a gesture), then press **Enter VR**. To let the crowd watch, cast the headset to a TV or Chromecast with the Quest's own casting; the page's 2D window also mirrors the view in the Quest browser.

## What it does

- **Standing at the eye.** The rig stands where the kiosk camera stands; the headset's own tracking replaces the drag-to-look-around. A `local-floor` reference space puts the floor at your feet; the mirror floor of the sculpture is about four metres below, so you float on a platform above the pool.
- **A ray from each hand or controller.** Pinch (or trigger) on an object opens its decision. The decision appears as a panel in the room, two metres away at the object's bearing, with the same three layers and the same chips as the kiosk panel (drawn from the same explanation and control definitions). Point at a chip and pinch; press *Replay with this change*.
- **The baton.** Pinch on the ring and sweep: the day follows the hand, the short way round. Let go and it plays on.
- **A hold.** Pinch on nothing and hold: time stops, as a touch does on the kiosk.
- **The ride.** On release, the rig rides the energy along the strands as the kiosk camera does. This is vection and some people will feel it; if it proves uncomfortable the ride can be skipped in VR by treating the session like reduced motion (one line in `src/main.js`).
- **The orchestra in the room.** Every section has a position: strings at the turbine, the cello at the car, brass at the bakery, the harp at the battery, timpani at the cable. The listener follows the head.

## What it does not do yet

- No hand models: a ray and a reticle only. Three.js can draw tracked hands; it is a small addition.
- No prompts beyond one starting card. The guided first minute is HTML and does not exist in a session.
- Conflict and permission cards (the yellow "ask me first" and price-limit cards) are HTML and are not yet drawn in the room. A decision that raises one still records it; the visitor sees it when they take the headset off. This is the first thing to add.
- Quality: the session runs whatever profile the station is on. On a Quest the mirror floor and halo pass will cost too much; set the profile to Economy in the staff panel before entering, or add an automatic switch.
- The kiosk's 2D window is not a clean spectator view; casting is the way to show the crowd.

## Effort

A convincing first wearing: one day with a headset for tuning. Cards in the room, hand models and an automatic quality switch: about a week. A polished conductor's chair with its own onboarding and a spectator view: three to four weeks.
