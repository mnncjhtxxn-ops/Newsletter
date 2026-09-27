# Operator guide

**Start.** Open `invisible-orchestra.html` in Edge (kiosk / Assigned Access recommended). No server, no network. Settings can be pinned in the URL hash, e.g. `invisible-orchestra.html#scale=0.75&timeout=120&dayLength=110&sound=0`.

**Reset.** The circular arrow button (bottom right), or triple-tap the top-left corner for the staff panel and press "Reset the station". The station also resets itself after `timeout` seconds without touch (default 90) plus a 15-second "Still there?" notice.

**Staff panel.** Triple-tap the top-left corner: scene resolution (50 / 75 / 100 %), idle timeout, day length, sound, live frame-rate readout, reset. Escape closes panels; space pauses (for laptop testing).

**Quality profile.** Pick the lowest scene resolution at which the sculpture still looks right on the actual screen. Text and controls stay sharp regardless.

**If the screen shows "This screen cannot show The Invisible Orchestra".** WebGL 2 is unavailable: check the graphics driver and Edge hardware acceleration, then relaunch.

**If the screen shows "One moment… recovering".** The graphics context was lost. It normally restores itself; if not within a few seconds, relaunch the kiosk.

**Expected limits.** See `KNOWN_LIMITATIONS.md`. Nothing on screen is a forecast, tariff or real network.
