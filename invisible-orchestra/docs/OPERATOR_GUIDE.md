# Operator guide

## Sound

Sound is **on by default** and is a generative score played from the simulation (nothing is recorded, nothing needs a licence). It starts on the first touch, because browsers require a gesture before audio. The speaker button at the bottom right toggles it for a visitor; the staff panel (triple-tap the top-left corner) sets the station default.

In a loud hall the PC's own speakers will be either inaudible or intrusive. Use one of:

- **A directional speaker over the station** (a parabolic or ultrasonic "audio spotlight"). One visitor hears the orchestra, the crowd around sees the sculpture. This is the recommended set-up: no hygiene, no cables, no queue for headsets.
- **Wired headphones** on a hook from the PC's headphone socket. Simplest, but cables wear and hygiene covers are needed.
- **Silent-disco headsets** on a transmitter per station (each station on its own channel). Good for several listeners around one screen; batteries must last the day and the headsets need wiping between visitors.

Whichever is used, the experience must survive with sound off: every fact is also on screen.


**Start.** Open `invisible-orchestra.html` in Edge (kiosk / Assigned Access recommended). No server, no network. Settings can be pinned in the URL hash, e.g. `invisible-orchestra.html#profile=balanced&timeout=120&dayLength=110&sound=0`.

**Reset.** The circular arrow button (bottom right), or triple-tap the top-left corner for the staff panel and press "Reset the station". The station also resets itself after `timeout` seconds without touch (default 90) plus a 15-second "Still there?" notice.

**Staff panel.** Triple-tap the top-left corner: quality profile (Economy / Balanced / Detail), idle timeout, day length, sound, a live diagnostics line (mode, frame rate, buffer size, draw calls, solves), reset. Escape closes panels; space pauses (for laptop testing).

**Quality profile.** Start on Balanced. Drop to Economy if the diagnostics line shows p95 frame gaps well above 33 ms while the day is playing. Text and controls stay sharp regardless.

**If the screen shows "This screen cannot show The Invisible Orchestra".** WebGL 2 is unavailable: check the graphics driver and Edge hardware acceleration, then relaunch.

**If the screen shows "One moment… recovering".** The graphics context was lost. It normally restores itself; if not within a few seconds, relaunch the kiosk.

**Expected limits.** See `KNOWN_LIMITATIONS.md`. Nothing on screen is a forecast, tariff or real network.
