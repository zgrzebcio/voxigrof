'use strict';
/* temperature/temperature.js: how warm it is. The air at a place (season, hour, biome, height, weather), heat from
   fire, lava and what is held, and the temperature a body eases toward (ambientTemp). */

/* ---- temperature ----
   What the air around you is, in °C: the season (a cosine through the year, warmest mid July), the biome (snow
   and desert, blended across their edges), the hour (warmest at 15:00), the weather and wind chill (out in the
   open only), height, deep underground (the same all year), water, and heat from lava, fire, torches and lit
   furnaces nearby. The body follows it over TEMP_EASE_S. The HUD shows -40..80; nothing else reads it yet. */
const TEMP_SAMPLE_S = 0.5, TEMP_EASE_S = 10, TEMP_EASE_WATER_S = 4;
const TEMP_MEAN = 11, TEMP_SWING = 13;             // about -2 in mid January, 24 in mid July
const SNOW_BIOME_MEAN = -10, SNOW_BIOME_SWING = 4, SNOWFALL_CHILL = 4;   // 0.8323 (airTempAt)
const DEEP_SNOW_CHILL = 1.5;                       // how much colder the deep snow is, per degree its level is past the snow's: about -22°C (0.5, -14 before)
const RIME_MEAN = -60, RIME_SWING = 3;             // the Coldest Deep Snow
// the Deep Desert: this much hotter than the red sand round it, by day and night alike, eased in over its edge (c.dd)
const DEEP_DESERT_HEAT = 8;
const TEMP_FLOOR = -75;                            // the coldest the air ever reads (-50 before 0.836)
const TEMP_PEAK_DAY = 6.5 * MONTH_DAYS;            // mid July, in days from 1 January
const TEMP_SNOW = -16, TEMP_HOT = 14;              // deep inside a snow biome, a desert
const TEMP_DAY_AMP = 5;                            // the day's swing either way; a desert doubles it by day
/* A desert's night. 0.8245 made the night's swing 4.5x as deep, but on the day's own curve, which only turns
   cold at 21:00 and bottoms out at 03:00: ten at night in April still read 19°C. Now the dark itself does it: over
   DESERT_COOL_H hours from sunset the desert's share of the air falls to DESERT_NIGHT_T — 5°C in April, DESERT_NIGHT_SWING
   either way with the year (15 in July, -5 in January) — whatever the day's heat was, DESERT_NIGHT_DIP lower at the
   coldest hour, and warms back over DESERT_WARM_H after sunrise. The Deep Desert keeps DEEP_NIGHT_KEEP of its extra
   heat. Under a roof or cloud it cools less, as the day's swing does. */
const DESERT_NIGHT_T = 5, DESERT_NIGHT_SWING = 10, DESERT_NIGHT_DIP = 3;
const DESERT_COOL_H = 1.5, DESERT_WARM_H = 1.5, DEEP_NIGHT_KEEP = 0.4;
// how far into the night it is at this time of day, 0 by day .. 1 (sunTimes, 07-sky.js: worldTime 0 = 06:00)
function nightDepth(dayFrac) {
  if (typeof sunTimes !== 'function') return 0;
  const { rise, set } = sunTimes(), u = dayFrac > 0.75 ? dayFrac - 1 : dayFrac;   // u: -0.25 (00:00) .. 0.75
  if (u >= set) return Math.min(1, (u - set) * 24 / DESERT_COOL_H);
  if (u < rise) return Math.min(1, (u + 1 - set) * 24 / DESERT_COOL_H);
  return Math.max(0, 1 - (u - rise) * 24 / DESERT_WARM_H);
}
const TEMP_LAPSE_FROM = 110, TEMP_LAPSE = 0.12;    // colder by this a block above that height
/* A cave's air (a flat 12°C before): cold near the surface, TEMP_CAVE, and a little warmer the deeper under
   the ground you are, TEMP_CAVE_DEEP_PER a block past TEMP_CAVE_DEEP_FROM, up to TEMP_CAVE_DEEP_MAX more. */
const TEMP_CAVE = 4, TEMP_CAVE_DEEP_FROM = 16, TEMP_CAVE_DEEP_PER = 0.1, TEMP_CAVE_DEEP_MAX = 10;
const caveTemp = (depth) => TEMP_CAVE + Math.min(TEMP_CAVE_DEEP_MAX, Math.max(0, depth - TEMP_CAVE_DEEP_FROM) * TEMP_CAVE_DEEP_PER);
const TEMP_WEATHER = { clear: 0, sunny: 2, cloudy: -1, windy: -1, rainy: -3, darky: -2, storm: -5, foggy: -1.5, blizzard: -25 };   // blizzard 0.83; -12 before 0.837
const TEMP_WATER = -6, TEMP_ON_FIRE = 25;
// heat right beside a source, fading with distance, summed over HEAT_R blocks around you
const HEAT_OF = new Float32Array(256);
HEAT_OF[B.LAVA] = 30; HEAT_OF[B.FIRE] = 20; HEAT_OF[B.TORCH] = 3;
HEAT_OF[B.GLOWSTONE] = 2; HEAT_OF[B.GLOWCRYSTAL_BLOCK] = -2;   // a little warm, the blue crystal a little cold
HEAT_OF[B.GLOW_VINE] = -1.5; HEAT_OF[B.CRYSTAL_TORCH] = -1;      // the blue crystal's cold in a vine and a torch too
const FURNACE_HEAT = 12, HEAT_R = 3, HEAT_MAX = 60;
function _heatNear(x, y, z) {
  let heat = 0;
  for (let dy = -1; dy <= 2; dy++)
    for (let dz = -HEAT_R; dz <= HEAT_R; dz++)
      for (let dx = -HEAT_R; dx <= HEAT_R; dx++) {
        const v = getBlock(x + dx, y + dy, z + dz), id = v & 255;
        const h = id === B.FURNACE ? (blockLightOf(v) > 0 ? FURNACE_HEAT : 0) : HEAT_OF[id];
        if (h) heat += h / (1 + (dx * dx + dy * dy + dz * dz) * 0.35);
      }
  return Math.min(HEAT_MAX, heat);
}
/* What you hold warms (or cools) you as if it were right beside you: a torch, glowstone, the glowcrystal
   block. The stronger of the two hands counts, and a torch under water is out (torchDoused, 22-main-loop.js). */
function _heldHeat(p) {
  const ids = [HOTBAR[hotbarSel]?.id, typeof offhandItemId === 'function' ? offhandItemId() : null];
  let h = 0;
  for (const id of ids) {
    if (id == null || id >= 256 || !HEAT_OF[id]) continue;
    if (id === B.TORCH && typeof torchDoused === 'function' && torchDoused(p)) continue;
    if (Math.abs(HEAT_OF[id]) > Math.abs(h)) h = HEAT_OF[id];
  }
  return h;
}
/* The air at a place, °C (out of ambientTemp so snow melt reads it too): season, biome, hour, weather and
   wind (`open` = how much sky is over it), and height. Height, since 0.8244: above the snowline the air is 0°C or
   colder, so its snow keeps; anywhere under it (a bare mountain too) height alone never takes it below
   TEMP_BARE_MIN, so snow up there can melt. `c` is the climate sample (for the caller's cave test). */
const TEMP_BARE_MIN = 5.5;
function airTempAt(x, y, z, open = 1) {
  const d = gameDate(), dayFrac = worldTime - Math.floor(worldTime);
  const doy = d.month * MONTH_DAYS + d.day - 1 + dayFrac;
  const yearCos = Math.cos(2 * Math.PI * (doy - TEMP_PEAK_DAY) / (12 * MONTH_DAYS));
  let t = TEMP_MEAN + TEMP_SWING * yearCos;
  const c = mainGen && mainGen.climateAt ? mainGen.climateAt(x, z) : { snow: 0, hot: 0, h: y };
  t += c.air != null ? c.air : TEMP_SNOW * c.snow + TEMP_HOT * c.hot;   // a ladder world: its level's air (biomes/biomes.js)
  /* SNOW BIOMES: about -10°C the year round (SNOW_BIOME_MEAN, swinging SNOW_BIOME_SWING either way with the
     seasons; it reached 13°C on a summer noon before), deep snow about -22 (DEEP_SNOW_CHILL, 0.836; -14 before); blended
     in by how snowy the place is (a ladder level from cold plains to snow). Falling snow takes up to SNOWFALL_CHILL more,
     below. The Coldest Deep Snow is RIME_MEAN, eased in over its edge (c.rime, biomes/biomes.js). */
  const snowy = c.air != null ? Math.max(0, Math.min(1, (-c.air - 7) / 9)) : Math.min(1, c.snow || 0);
  if (snowy > 0) {
    const snowT = SNOW_BIOME_MEAN + SNOW_BIOME_SWING * yearCos + (c.air != null ? Math.min(0, c.air + 16) * DEEP_SNOW_CHILL : 0);
    t += (snowT - t) * snowy;
  }
  if (c.rime > 0) t += (RIME_MEAN + RIME_SWING * yearCos - t) * c.rime;
  if (c.dd > 0) t += DEEP_DESERT_HEAT * c.dd;                                       // 0.84
  const w = weatherAt(x + 0.5, z + 0.5, y);
  if (typeof precipAt === 'function') t -= SNOWFALL_CHILL * precipAt(x + 0.5, z + 0.5, y).snow * open;   // 0.8323
  const overcast = !(w.type === 'clear' || w.type === 'sunny' || w.type === 'windy');
  const hour = (6 + dayFrac * 24) % 24;
  /* The day's swing: warmest at 15:00, a desert's twice as far by day. A desert's night is cold from dusk (the
     constants above; 0.8245 had it cold only in the small hours): in the dark its share of the air goes to nightT. */
  const cyc = Math.cos(2 * Math.PI * (hour - 15) / 24);
  let swing = TEMP_DAY_AMP * (1 + (cyc > 0 ? c.hot : 0)) * cyc;
  const dn = c.hot > 0 ? c.hot * nightDepth(dayFrac) : 0;
  if (dn > 0) {
    const nightT = DESERT_NIGHT_T + DESERT_NIGHT_SWING * yearCos + DEEP_DESERT_HEAT * DEEP_NIGHT_KEEP * (c.dd || 0)
                 - DESERT_NIGHT_DIP * Math.max(0, -cyc);
    swing += (nightT - t - swing) * dn;
  }
  t += swing * (overcast ? 0.5 : 1) * (0.4 + 0.6 * open);
  t += ((TEMP_WEATHER[w.type] || 0) - Math.max(0, w.speed - 10) * 0.1) * open;   // wind chill past 10 km/h
  const high = t - Math.max(0, y - TEMP_LAPSE_FROM) * TEMP_LAPSE;
  if (typeof snowlineY === 'function' && y >= snowlineY(x, z)) t = Math.min(high, 0);
  else t = Math.max(high, Math.min(t, TEMP_BARE_MIN));
  return { t, c };
}
function ambientTemp(p) {
  const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z), y = Math.floor(p.pos.y + 1);
  const open = getSkyWorld(x, Math.floor(p.pos.y + p.EYE), z) / 15;   // how much sky is over you
  const a = airTempAt(x, y, z, open), c = a.c;
  let t = a.t;
  const deep = Math.max(0, Math.min(1, (c.h - y - 2) / 12)) * (1 - open);
  t += (caveTemp(c.h - y) - t) * deep;           // colder near the top, a little warmer deep down
  if (p._inWater) t += TEMP_WATER;
  t += Math.min(HEAT_MAX, _heatNear(x, Math.floor(p.pos.y), z) + _heldHeat(p));
  if (p.fireT > 0) t += TEMP_ON_FIRE;
  return Math.max(TEMP_FLOOR, Math.min(90, t));
}
/* How fast the body follows the air. A big gap closes faster: the ease time is cut by 1 + gap /
   TEMP_EASE_BIG (a 15° jump twice as fast, 30° three times). Resistance slows the turn toward its side: cold
   resistance while you cool toward cold air (under TEMP_COMFORT), heat resistance while you warm toward hot air,
   by 1 + res x TEMP_RESIST_EASE (30% resistance: 1.6x slower; cloth's negative cold resistance speeds it). */
const TEMP_EASE_BIG = 15, TEMP_COMFORT = 20, TEMP_RESIST_EASE = 2;
function _tempEaseMul(p) {
  const gap = p._tempAim - p.temp;
  const res = gap < 0 && p._tempAim < TEMP_COMFORT ? tempResist(true)
            : gap > 0 && p._tempAim > TEMP_COMFORT ? tempResist(false) : 0;
  return Math.max(0.5, 1 + res * TEMP_RESIST_EASE) / (1 + Math.abs(gap) / TEMP_EASE_BIG);
}
function _tickTemperature(dt) {
  const p = player;
  p._tempT = (p._tempT || 0) - dt;
  if (p._tempT <= 0 || p._tempAim == null || typeof p.temp !== 'number') {
    p._tempT = TEMP_SAMPLE_S; p._tempAim = ambientTemp(p);
    if (typeof p.temp !== 'number') p.temp = p._tempAim;
    p._tempEase = _tempEaseMul(p);
    _sampleExposure(p);                              // sun, roof, sandstorm
  }
  const ease = (p._inWater ? TEMP_EASE_WATER_S : TEMP_EASE_S) * (p._tempEase || 1);
  p.temp += (p._tempAim - p.temp) * (1 - Math.exp(-dt / ease));
}
/* Where this seat stands, sampled with the temperature: how much sun is on it (_hsSun: a sunny or clear sky,
   by day, open sky over the head, not in water), whether it is under a roof or in a cave (_roofed), how much desert
   the ground is (_hsDesert), and the sandstorm there (_sandAim). */
const HS_SUN = { sunny: 1, clear: 0.8 };            // the sun's strength under each sky; any other sky has none
function _sampleExposure(p) {
  const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z), sky = getSkyWorld(x, Math.floor(p.pos.y + p.EYE), z);
  const w = weatherAt(p.pos.x, p.pos.z, p.pos.y), day = typeof _skyDayF === 'number' ? _skyDayF : 1;
  p._hsSun = sky >= 15 && !p._inWater ? (HS_SUN[w.type] || 0) * day : 0;
  p._roofed = sky < 12;
  const c = mainGen && mainGen.climateAt ? mainGen.climateAt(x, z) : null;
  p._hsDesert = c ? Math.min(1, c.hot) : 0;
  p._hsDeep = c ? c.dd || 0 : 0;                     // the Deep Desert
  p._sandAim = typeof sandstormAt === 'function' ? sandstormAt(p.pos.x, p.pos.z) : 0;
  // a storm or hail overhead, for the weathering XP
  p._wxHarsh = !p._roofed && ((w.mix && (w.mix.storm || 0) >= 0.5) || (typeof hailAt === 'function' && hailAt(p.pos.x, p.pos.z) > 0.3));
}
