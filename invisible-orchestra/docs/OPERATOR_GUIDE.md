# Operator guide

**Start.** Open `invisible-orchestra.html` in Edge (kiosk / Assigned Access recommended). No server, no network. Settings can be pinned in the URL hash, e.g. `invisible-orchestra.html#profile=balanced&timeout=120&dayLength=110&sound=0`.

**Reset.** The circular arrow button (bottom right), or triple-tap the top-left corner for the staff panel and press "Reset the station". The station also resets itself after `timeout` seconds without touch (default 90) plus a 15-second "Still there?" notice.

**Staff panel.** Triple-tap the top-left corner: quality profile (Economy / Balanced / Detail), idle timeout, day length, sound, a live diagnostics line (mode, frame rate, buffer size, draw calls, solves), reset. Escape closes panels; space pauses (for laptop testing).

**Quality profile.** Start on Balanced. Drop to Economy if the diagnostics line shows p95 frame gaps well above 33 ms while the day is playing. Text and controls stay sharp regardless.

**If the screen shows "This screen cannot show The Invisible Orchestra".** WebGL 2 is unavailable: check the graphics driver and Edge hardware acceleration, then relaunch.

**If the screen shows "One moment… recovering".** The graphics context was lost. It normally restores itself; if not within a few seconds, relaunch the kiosk.

**Expected limits.** See `KNOWN_LIMITATIONS.md`. Nothing on screen is a forecast, tariff or real network.
