/**
 * Where the engine finds its audio: every file inside the bundle.
 *
 * Use this in place of audio-assets.js for the single offline HTML file. esbuild needs to be told to embed the files:
 *   loader: { '.opus': 'binary', '.wav': 'binary' }      (in build.js)
 * and the audio folder must sit at invisible-orchestra/audio/ (two levels above this file).
 * The list matches score-data.js. Do not edit by hand.
 */
import a0 from '../../audio/wind_floor.opus';
import a1 from '../../audio/wind_wind_soft.opus';
import a2 from '../../audio/wind_wind_full.opus';
import a3 from '../../audio/wind_home.opus';
import a4 from '../../audio/wind_car.opus';
import a5 from '../../audio/wind_bakery.opus';
import a6 from '../../audio/wind_battery.opus';
import a7 from '../../audio/wind_cable.opus';
import a8 from '../../audio/wind_thread.opus';
import a9 from '../../audio/day_floor.opus';
import a10 from '../../audio/day_wind_soft.opus';
import a11 from '../../audio/day_wind_full.opus';
import a12 from '../../audio/day_home.opus';
import a13 from '../../audio/day_car.opus';
import a14 from '../../audio/day_bakery.opus';
import a15 from '../../audio/day_battery.opus';
import a16 from '../../audio/day_cable.opus';
import a17 from '../../audio/day_thread.opus';
import a18 from '../../audio/dawn_floor.opus';
import a19 from '../../audio/dawn_wind_soft.opus';
import a20 from '../../audio/dawn_wind_full.opus';
import a21 from '../../audio/dawn_home.opus';
import a22 from '../../audio/dawn_car.opus';
import a23 from '../../audio/dawn_bakery.opus';
import a24 from '../../audio/dawn_battery.opus';
import a25 from '../../audio/dawn_cable.opus';
import a26 from '../../audio/dawn_thread.opus';
import a27 from '../../audio/peak_floor.opus';
import a28 from '../../audio/peak_wind_soft.opus';
import a29 from '../../audio/peak_wind_full.opus';
import a30 from '../../audio/peak_home.opus';
import a31 from '../../audio/peak_car.opus';
import a32 from '../../audio/peak_bakery.opus';
import a33 from '../../audio/peak_battery.opus';
import a34 from '../../audio/peak_cable.opus';
import a35 from '../../audio/peak_thread.opus';
import a36 from '../../audio/question.opus';
import a37 from '../../audio/ride.opus';
import a38 from '../../audio/release.opus';
import a39 from '../../audio/release_brief.opus';
import a40 from '../../audio/afterglow.opus';
import a41 from '../../audio/call_wind.opus';
import a42 from '../../audio/call_wind_2.opus';
import a43 from '../../audio/call_home.opus';
import a44 from '../../audio/call_home_2.opus';
import a45 from '../../audio/call_car.opus';
import a46 from '../../audio/call_car_2.opus';
import a47 from '../../audio/call_bakery.opus';
import a48 from '../../audio/call_bakery_2.opus';
import a49 from '../../audio/call_battery.opus';
import a50 from '../../audio/call_battery_2.opus';
import a51 from '../../audio/call_cable.opus';
import a52 from '../../audio/sting_decision.opus';
import a53 from '../../audio/sting_ask.opus';
import a54 from '../../audio/sting_conflict.opus';
import a55 from '../../audio/sting_commit.opus';
import a56 from '../../audio/gliss_up.opus';
import a57 from '../../audio/gliss_down.opus';
import a58 from '../../audio/timp_soft.opus';
import a59 from '../../audio/timp_hard.opus';
import hall from '../../audio/hall.wav';
export const AUDIO = {
  'wind_floor': a0,
  'wind_wind_soft': a1,
  'wind_wind_full': a2,
  'wind_home': a3,
  'wind_car': a4,
  'wind_bakery': a5,
  'wind_battery': a6,
  'wind_cable': a7,
  'wind_thread': a8,
  'day_floor': a9,
  'day_wind_soft': a10,
  'day_wind_full': a11,
  'day_home': a12,
  'day_car': a13,
  'day_bakery': a14,
  'day_battery': a15,
  'day_cable': a16,
  'day_thread': a17,
  'dawn_floor': a18,
  'dawn_wind_soft': a19,
  'dawn_wind_full': a20,
  'dawn_home': a21,
  'dawn_car': a22,
  'dawn_bakery': a23,
  'dawn_battery': a24,
  'dawn_cable': a25,
  'dawn_thread': a26,
  'peak_floor': a27,
  'peak_wind_soft': a28,
  'peak_wind_full': a29,
  'peak_home': a30,
  'peak_car': a31,
  'peak_bakery': a32,
  'peak_battery': a33,
  'peak_cable': a34,
  'peak_thread': a35,
  'question': a36,
  'ride': a37,
  'release': a38,
  'release_brief': a39,
  'afterglow': a40,
  'call_wind': a41,
  'call_wind_2': a42,
  'call_home': a43,
  'call_home_2': a44,
  'call_car': a45,
  'call_car_2': a46,
  'call_bakery': a47,
  'call_bakery_2': a48,
  'call_battery': a49,
  'call_battery_2': a50,
  'call_cable': a51,
  'sting_decision': a52,
  'sting_ask': a53,
  'sting_conflict': a54,
  'sting_commit': a55,
  'gliss_up': a56,
  'gliss_down': a57,
  'timp_soft': a58,
  'timp_hard': a59,
  'hall.wav': hall,
};
export const AUDIO_BASE = '';
export const AUDIO_EXT = '.opus';
