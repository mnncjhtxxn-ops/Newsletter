# Music brief: The Invisible Orchestra

**What this is.** An interactive exhibit (a 55-inch touchscreen, and a VR version) in which a visitor stands inside a sculpture of light showing a street's energy over one night in 2037. Six things in the scene each "play": the wind, the home, the car, the bakery, a battery and the street's cable. The visitor changes a promise ("I leave at 05:00"), the whole night replans around it, and they ride the energy along the strands to see the result. The music must feel like a real orchestra that is **being conducted by the visitor**: calm, beautiful, never discordant, and audibly responding to what they do.

**What I need from you.** Not one piece, and not many pieces to pick from. I need an **adaptive score built as stems**, so the software can mix it live. Please compose and render it with real orchestral sample libraries (for example Spitfire BBC Symphony Orchestra, Spitfire LABS, or equivalent; confirm the library licence allows public exhibition use). Deliver rendered audio **and** the MIDI or score, so it can be revised.

## How the software will use it

- It plays a **loop** for the current mood and sets the **volume of each stem** from what is happening (the wind blowing raises the strings, the car charging brings in the pizzicato, the ovens bring the brass, and so on). A stem that is silent for ten minutes and then fades in must still sound right.
- It **crossfades between moods** at bar boundaries as the night's electricity price changes.
- It fires **one-shot stingers** on the visitor's actions, quantised to the next beat.
- It positions every stem in 3D (the cello comes from the car, the brass from the bakery) and adds its own hall reverb. So **everything must be delivered dry and mono** (or dual-mono): no reverb, no stereo width baked in. The one exception is a separate optional stereo "hall tail" file I can ignore.

## Fixed musical rules

- **Key D. Tempo 60 bpm. 4/4.** Every loop is exactly **8 bars (32.000 seconds)** and loops seamlessly (the file is the loop; no tails past the end; the last beat must lead back to bar 1).
- **Four moods**, one per mode, all on the same tempo and the same bar grid so any mood can crossfade into any other at a bar line:
  1. `wind` — D Lydian. The cheapest, windiest hours of the night. Open, bright, floating.
  2. `day` — D Ionian. Ordinary daytime. Warm, settled.
  3. `dawn` — D Dorian. Early morning as the price climbs. Gently restless.
  4. `peak` — D Aeolian. The dear evening when the street is busiest. Darker, more weight, still beautiful. **No harsh dissonance anywhere, in any mood.**
- Each mood is delivered as **eight stems** that are all the same 32 seconds and all harmonically locked, written so that **any subset sounds complete**: the harmony lives in `bass` + `strings_soft`; everything else decorates and may be absent.

| Stem | What plays it | What it means in the scene |
|---|---|---|
| `strings_soft` | sustained strings, pads of chords | the wind, light |
| `strings_full` | fuller strings with movement, replaces `strings_soft` when the wind is strong | the wind, strong |
| `bass` | cello and bass, the chord root, sustained | the floor of the room; always present |
| `pad` | warm upper voices (horns or clarinets, soft) | the home being heated |
| `pizz` | cello pizzicato on the beat, walking the chord | the car charging |
| `brass` | slow-attack brass chords, no fanfares | the bakery's ovens |
| `harp` | harp arpeggios, rising figures | the battery storing or releasing |
| `melody` | a flute or oboe line: one memorable motif, used sparingly, with rests | the thread; the thing a visitor hums afterwards |

Also per mood: `timpani` as a separate **stinger set**, not a loop (see below), because it must only appear when the street's cable is near its limit.

## Stingers (one-shots, dry, mono)

Short, in key, and able to land over **any** mood. To make that safe, build them only from **D, E and A** (open fifth and ninth, any octave), except the glissandi, which are per mood.

| File | Trigger | Length |
|---|---|---|
| `sting_release` | the visitor commits a change: a cadence, the ensemble landing together, a warm chord with bells | 3–4 s |
| `sting_ride` | the ride begins: a swell that rises over 6 s and resolves (strings and harp) | 8 s |
| `sting_hold` | the visitor stops time: a soft held chord that can be sustained (loopable middle section) | 4 s + loop |
| `sting_decision` | a small decision is made: one soft bell or celesta note | 1.5 s |
| `sting_ask` | the system asks a question: two rising notes | 1.5 s |
| `sting_conflict` | two requirements clash: a gentle minor-second-free tension, resolved (think suspended, not dissonant) | 2.5 s |
| `call_wind`, `call_home`, `call_car`, `call_bakery`, `call_battery` | the visitor points at that object: a two-note call from its instrument | 1–1.5 s each |
| `timp_soft`, `timp_hard` | the cable near its limit, and over it | 1.5 s each |
| `gliss_<mood>_up`, `gliss_<mood>_down` | the visitor sweeps the baton: a harp glissando through that mood's scale | 1.2 s each, 8 files |

## Delivery

- **WAV, 48 kHz, 24-bit**, mono (dual-mono acceptable), peak no louder than −3 dBFS, every loop at the same perceived loudness (around −18 LUFS integrated) so the live mixing stays balanced.
- Names exactly as above: `wind_strings_soft.wav`, `peak_pizz.wav`, `gliss_dawn_up.wav`, and so on. 32 loop files, about 25 stingers.
- A short text file stating tempo, bars, key, and confirming each loop's length is exactly 32.000 s.
- The MIDI (or MusicXML) for everything, so a part can be rewritten without re-recording the rest.
- Rough size in the app after encoding is about 15 MB; that is fine.

**Tone, in one line.** Nocturne, not film score: no percussion driving, no epic swells except the ride, nothing that would embarrass a quiet room. It should sound inevitable, as if the street had always been music.
