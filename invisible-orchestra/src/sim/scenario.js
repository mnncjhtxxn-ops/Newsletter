/**
 * The fictional 2037 scenario.
 *
 * Everything here is invented for an exhibition story: a single street
 * ("Larkfield Street") of forty homes and a bakery, on a cold, windy
 * March night. Numbers are chosen to be plausible in shape, not to
 * forecast any real bill, tariff or network. The simulation runs on
 * these tables only — no live data, no internet.
 *
 * Time model: 96 slots of 15 minutes, starting at 18:00 in the evening
 * and running through the night to 18:00 the next day, so that the
 * night (when the car charges and the bakery wakes) sits in the middle.
 */

export const SLOTS = 96;
export const DT = 0.25; // hours per slot
export const START_HOUR = 18; // absolute hour of slot 0

/** Absolute hour (18 … 41.75) for a slot index. */
export function slotHour(i) {
  return START_HOUR + i * DT;
}

/** Clock hour (0 … 23.75) for a slot index. */
export function slotClock(i) {
  return slotHour(i) % 24;
}

/** Slot index for a clock time on the *next* morning/day, or the evening of day 0. */
export function clockToSlot(clockHour) {
  // Clock hours >= 18 belong to the evening of day 0; anything earlier is day 1.
  const abs = clockHour >= START_HOUR ? clockHour : clockHour + 24;
  return Math.round((abs - START_HOUR) / DT);
}

export function formatClock(hourAbs, opts = {}) {
  const h = ((hourAbs % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const s = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return opts.day && hourAbs >= 24 ? `${s} tomorrow` : s;
}

/** Hourly tables indexed by clock hour 0 … 23. */
const HOURLY = {
  // Wind available to the street from the wider system, kW. A strong,
  // steady night of wind that fades after dawn and returns in the afternoon.
  wind: [40, 46, 52, 56, 54, 48, 36, 24, 15, 11, 9, 10, 12, 15, 19, 23, 26, 27, 26, 27, 29, 33, 36, 38],
  // Rooftop solar across the street, kW. A clear spring day.
  solar: [0, 0, 0, 0, 0, 0, 0, 3, 10, 20, 30, 38, 42, 40, 34, 25, 14, 5, 1, 0, 0, 0, 0, 0],
  // Fixed demand of the other 38 homes on the street, kW.
  street: [14, 12, 11, 11, 12, 15, 22, 32, 30, 24, 20, 19, 20, 19, 19, 21, 26, 38, 46, 44, 38, 30, 24, 18],
  // The scenario's dynamic tariff, pence per kWh. Cheap when the wind
  // blows and demand is low; dear at the morning and evening peaks.
  price: [9, 7, 6, 6, 7, 9, 14, 22, 26, 22, 18, 15, 13, 13, 14, 16, 20, 28, 32, 30, 25, 18, 13, 11],
  // Carbon intensity of imported electricity, gCO2 per kWh.
  carbon: [40, 30, 25, 25, 30, 45, 80, 130, 160, 150, 120, 100, 85, 85, 90, 100, 130, 170, 180, 175, 150, 110, 70, 50],
  // Outdoor temperature, °C. A cold clear night.
  outdoor: [1, 0, -1, -1, -1, -1, 0, 1, 3, 5, 6, 7, 8, 8, 8, 7, 6, 6, 6, 5, 4, 3, 2, 2],
};

/** Linear interpolation of an hourly clock table at a slot. */
function sample(table, i) {
  const c = slotClock(i);
  const h0 = Math.floor(c);
  const h1 = (h0 + 1) % 24;
  const f = c - h0;
  return table[h0] * (1 - f) + table[h1] * f;
}

export function buildSeries() {
  const s = {};
  for (const k of Object.keys(HOURLY)) {
    s[k] = new Float64Array(SLOTS);
    for (let i = 0; i < SLOTS; i++) s[k][i] = sample(HOURLY[k], i);
  }
  return s;
}

export const SCENARIO = {
  name: 'Larkfield Street, 2037',
  season: 'A cold, windy night in March',
  feederLimitKw: 55, // what the street's cable can carry
  home: {
    baseKw: 0.4,
    thermalCapacityKwhPerC: 6, // kWh of heat per °C of the house
    heatLossKwPerC: 0.25, // kW lost per °C indoor–outdoor difference
    heatPumpKw: 3, // electrical
    heatPumpCop: 3.5,
    startTempC: 20.5,
  },
  ev: {
    capacityKwh: 90,
    chargerKw: 7,
    arriveSlot: 0, // plugged in at 18:00
    startPct: 20,
  },
  battery: {
    capacityKwh: 13.5,
    powerKw: 5,
    startPct: 50,
    minPct: 10,
  },
  bakery: {
    ovenPreheatKw: 30,
    preheatHours: 2,
    bakingKw: 20,
    bakingHours: 6, // from opening
    afternoonKw: 8,
    // A cold store that must run 4 hours some time between 22:00 and 06:00.
    coldStoreKw: 8,
    coldStoreHours: 4,
    coldWindowStartClock: 22,
    coldWindowEndClock: 6,
  },
};

/** Default human promises and permissions – what the visitor can change. */
export const DEFAULT_PROMISES = {
  ev: { departureClock: 7, targetPct: 80, priceCapPence: null },
  home: { comfort: 'normal' }, // 'tight' | 'normal' | 'relaxed'
  bakery: { openingClock: 6 },
};

export const COMFORT_BANDS = {
  tight: { low: 20, high: 21, label: '20–21 °C', words: 'exactly right' },
  normal: { low: 19, high: 22, label: '19–22 °C', words: 'comfortable' },
  relaxed: { low: 18, high: 23, label: '18–23 °C', words: 'easy-going' },
};

export const DEFAULT_PERMISSIONS = {
  ev: 'auto', // 'auto' | 'ask' | 'never'
  heat: 'auto',
  battery: 'auto',
  bakery: 'auto',
};

export const PERMISSION_WORDS = {
  auto: 'You can reschedule this automatically.',
  ask: 'Ask me before changing it.',
  never: 'Never move this.',
};

export const EV_DEPARTURE_OPTIONS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const EV_TARGET_OPTIONS = [60, 80, 100];
export const EV_PRICE_CAP_OPTIONS = [null, 600, 400];
export const BAKERY_OPENING_OPTIONS = [4, 4.5, 5, 5.5, 6, 6.5, 7];
