'use strict';
/* voxiGrof — calendar, seasons, weather and wind (0.81)

   CALENDAR. A month is MONTH_DAYS in-game days and a world begins on 1 April. Seasons go by months:
   spring Mar-May, summer Jun-Aug, autumn Sep-Nov, winter Dec-Feb.

   SEASONS change the land:
   - plants grow 30% faster in spring, as normal in summer, 30% slower in autumn, and not at all in winter
     (seasonGrowth(): saplings, berry bushes, wheat, hollow-log mushrooms);
   - oak and birch leaves fall through autumn onto the ground as litter, and the last of them in winter; in
     spring each grows back where it was, a few at a time;
   - grass plants, flowers, mushrooms, berry bushes, wheat and gourds wither through autumn and are gone by
     winter. Each is remembered, and in spring has a 50% chance to come back where it was, and a 0.1% chance
     to seed one more beside it — then it is forgotten, so nothing multiplies year on year;
   - only what the sky reaches changes: a cave mushroom does not know it is winter.
   Every cell's turn is a hash of its position, compared against how far through the season the world is.
   That makes a chunk far away catch up exactly on its next visit: it simply finds the state it should be in.

   WEATHER (rain and snow on screen and on the ground since 0.83: precipAt below, _fxWeather in 49, the fog in 52).
   The world is split into WEATHER_REGION x WEATHER_REGION
   chunk regions; each runs its own weather in stretches of 6 to 24 in-game hours, drawn from a hash of the
   region and the time, weighted by season and by the region's biome. What comes next is known 12 hours
   ahead (weatherHere().next), for the clouds that will one day roll in first.

   WIND blows in every weather, harder in some. It bends grass and leaves (04-materials.js) and, when strong,
   pushes a walking player along or holds them back (22-main-loop.js). */

const MONTH_DAYS = 7, START_MONTH = 3;                  // 3 = April
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                     'October', 'November', 'December'];
const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_GROWTH = [1.3, 1, 0.7, 0];
const WEATHER_REGION = 16;                              // chunks (8 until 0.813)
const REGION_BLOCKS = WEATHER_REGION * 16;
const WEATHER_AHEAD_H = 12;

// the world clock in days (worldDay counts whole days, worldTime the part of today)
const worldClockDays = () => (typeof worldDay !== 'undefined' ? worldDay + worldTime : 0);
/* The date at a moment (in days since the world began): day of month, month, year, season, and how far
   through that season it is (0..1). */
/* A world made with seasons off (0.818, the create screen) stays on 1 July for good: summer weather, summer
   growth, July's long days, and no season sweep. Worlds from before it have no flag and keep their seasons. */
const seasonsOn = () => !(typeof currentWorld !== 'undefined' && currentWorld && currentWorld.seasons === false);
const FIXED_DAY = ((6 - START_MONTH + 12) % 12) * MONTH_DAYS;   // 1 July, in days from the world's start
function gameDate(t = worldClockDays()) {
  if (!seasonsOn()) t = FIXED_DAY + (t - Math.floor(t));
  const dayIdx = Math.floor(t);
  const monthsIn = Math.floor(dayIdx / MONTH_DAYS);
  const month = (START_MONTH + monthsIn) % 12;
  const year = 1 + Math.floor((START_MONTH + monthsIn) / 12);
  const season = [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][month];
  const firstMonth = [2, 5, 8, 11][season];               // March, June, September, December
  // days into the season: whole months since it began, plus how far into this month (fractional)
  const within = ((month - firstMonth + 12) % 12) * MONTH_DAYS + (t - monthsIn * MONTH_DAYS);
  return { day: (dayIdx % MONTH_DAYS) + 1, month, year, season, progress: Math.min(1, within / (3 * MONTH_DAYS)) };
}
const seasonGrowth = () => SEASON_GROWTH[gameDate().season];

/* ---- hashing ---- */
const _seedN = () => (typeof SEED === 'number' ? SEED : String(typeof SEED !== 'undefined' ? SEED : 0)
  .split('').reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7));
function sHash(a, b, c, d) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 217645177)
          + Math.imul(d | 0, 1103515245)) ^ _seedN();
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ================================== weather ================================== */
const WEATHER_TYPES = ['clear', 'sunny', 'cloudy', 'windy', 'rainy', 'darky', 'storm', 'foggy', 'blizzard'];   // blizzard 0.83
/* The weather by season (0.8241): fair skies — clear, sunny, cloudy — are the usual thing all year, and every other
   weather is rare, each season leaning its own way. Spring: rain, fog and dark skies. Summer: sun above all, then
   storms (thunder), rain and strong wind (a sandstorm in a desert). Autumn: rain, dark skies, storms (the most hail,
   HAIL_BY_SEASON), wind and fog. Winter: cloud, and rain that falls as snow (weatherName). Sunny and clear days give
   heatstroke (0.825, 54-stats-effects.js); a desert's strong wind is a sandstorm (sandstormAt).
   Each row is out of 100, in WEATHER_TYPES order.
   BLIZZARD (0.83): a cold region's own — the colder (regionCold) the more often, most in winter and autumn — and
   rare anywhere else in winter (never in a desert). Wind, white-out fog, heavy snow that piles up, bitter cold. */
const WEATHER_BY_SEASON = [
  //  clear sunny cloudy windy rainy darky storm foggy blizzard
  [    24,   18,   26,    3,   10,    7,    2,   10,   0 ],   // spring
  [    24,   40,   14,    5,    6,    2,    8,    1,   0 ],   // summer
  [    20,   12,   28,    6,   12,    9,    6,    7,   0 ],   // autumn
  [    22,   10,   36,    4,   16,    5,    1,    6,   1 ],   // winter
];
const BLIZZARD_COLD = [6, 2, 8, 14];            // added in a region by season, times its cold to the 1.5 (0.83)
/* Wind speed range per weather, km/h (scaled down in 0.8121): under 10 is a light breeze, about 30 an ordinary
   windy day, past 60 very strong — only a storm (or a storm high over the sea) gets there. */
const WIND_RANGE = { clear: [5, 15], sunny: [0, 8], cloudy: [8, 20], windy: [25, 42], rainy: [12, 30],
                     darky: [10, 25], storm: [45, 65], foggy: [0, 6], blizzard: [40, 60] };
const OCEAN_WIND = 1.3;                          // open sea: nothing in the wind's way, 30% stronger (0.8121)
// a region's biome, read once at its centre: 'warm' (deserts), 'snow', 'ocean' (0.8121), or ''
const _regionKind = new Map();
function regionKind(rx, rz) {
  const k = rx + ',' + rz;
  let v = _regionKind.get(k);
  if (v == null) {
    const b = typeof mainGen !== 'undefined' && mainGen ? mainGen.biomeAt(rx * REGION_BLOCKS + REGION_BLOCKS / 2, rz * REGION_BLOCKS + REGION_BLOCKS / 2) : '';
    v = /Desert|Red Sand/.test(b) ? 'warm' : /Snow/.test(b) ? 'snow' : /Ocean/.test(b) ? 'ocean' : '';
    _regionKind.set(k, v);
  }
  return v;
}
/* How cold a region is, 0..1, read once at its centre (0.83): on the climate ladder its air from 0°C down to -24°C
   (deep snow 1, snow about 0.67, cold plains 0.3), on older worlds its snow cover. Blizzards follow it. */
const _regionCold = new Map();
function regionCold(rx, rz) {
  const k = rx + ',' + rz;
  let v = _regionCold.get(k);
  if (v == null) {
    const c = typeof mainGen !== 'undefined' && mainGen && mainGen.climateAt
      ? mainGen.climateAt(rx * REGION_BLOCKS + REGION_BLOCKS / 2, rz * REGION_BLOCKS + REGION_BLOCKS / 2) : null;
    v = !c ? 0 : c.air != null ? Math.max(0, Math.min(1, -c.air / 24)) : Math.min(1, c.snow || 0);
    _regionCold.set(k, v);
  }
  return v;
}
// the stretch of weather an hour falls in: each day is cut at 6, 12 and/or 18 o'clock by the hash
function _weatherStretch(rx, rz, H) {
  const E = Math.floor(H / 24), h = H - E * 24;
  const cuts = [0];
  for (const c of [6, 12, 18]) if (sHash(rx, rz, E, c) < 0.5) cuts.push(c);
  cuts.push(24);
  let i = 0;
  while (cuts[i + 1] <= h) i++;
  return { start: E * 24 + cuts[i], end: E * 24 + cuts[i + 1] };
}
// the title backdrop has no weather (0.8198): always clear skies, a light breeze, fair-weather clouds, no fog
const _titleCalm = () => typeof menuScene !== 'undefined' && menuScene;
function _pickWeather(rx, rz, start) {
  if (_titleCalm()) return 'clear';
  const season = gameDate(start / 24).season, kind = regionKind(rx, rz);
  const w = WEATHER_TYPES.map((t, i) => {
    let v = WEATHER_BY_SEASON[season][i];
    if (kind === 'warm') v *= { sunny: 3, rainy: 0.2, windy: 1.5, foggy: 0.2, cloudy: 0.6, blizzard: 0 }[t] ?? 1;
    if (kind === 'snow') v *= { sunny: 0.5, rainy: 1.3 }[t] || 1;
    if (t === 'blizzard' && kind !== 'warm') v += BLIZZARD_COLD[season] * Math.pow(regionCold(rx, rz), 1.5);   // 0.83
    return v;
  });
  let r = sHash(rx, rz, Math.floor(start), 99) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return WEATHER_TYPES[i]; }
  return 'clear';
}
/* Does a stretch's rain fall as snow (0.83)? Always in a snow region; in winter 95% of the time anywhere but a
   desert (PRECIP_WINTER_SNOW, rolled once a stretch; every winter rain was snow from 0.8241). */
const PRECIP_WINTER_SNOW = 0.95;
function _snowsIn(rx, rz, start) {
  const kind = regionKind(rx, rz);
  if (kind === 'snow') return true;
  return kind !== 'warm' && gameDate(start / 24).season === 3 && sHash(rx, rz, Math.floor(start), 61) < PRECIP_WINTER_SNOW;
}
// what a weather is called where it falls: rain that falls as snow is snowy (a storm a snowstorm), strong wind is a
// sandstorm in a desert (`snows`: _snowsIn of its stretch, 0.83)
function weatherName(type, kind, snows = false) {
  if (type === 'rainy' && snows) return 'snowy';
  if (type === 'storm' && snows) return 'snowstorm';
  if (type === 'windy' && kind === 'warm') return 'sandstorm';
  return type;
}
/* Wind is stronger up high (0.812): nothing below y 60, +5 km/h at y 100 (about sea level), +9 at y 150,
   +0.08 a block past it. The shader adds the same per vertex (04-materials.js). */
const windHeightBonus = (y) => y <= 60 ? 0 : y <= 100 ? 5 * (y - 60) / 40 : 5 + (y - 100) * 0.08;
/* The weather and wind at a world position: { type, name, next, nextName, nextIn (hours), speed (km/h),
   dir (degrees the wind blows TOWARD, 0 = north, 90 = east) }. `next` is set once the change is within 12h.
   With `y` the speed includes the height bonus; `aheadH` looks that many in-game hours ahead. */
// one region's own weather at hour H: its type, what comes next, and its wind as a speed and a direction
function _regionWeather(rx, rz, H) {
  const s = _weatherStretch(rx, rz, H), type = _pickWeather(rx, rz, s.start), kind = regionKind(rx, rz);
  const next = s.end - H <= WEATHER_AHEAD_H ? _pickWeather(rx, rz, s.end) : null;
  const [lo, hi] = WIND_RANGE[type];
  const base = lo + (hi - lo) * sHash(rx, rz, Math.floor(s.start), 7);
  const speed = Math.max(0, base * (0.85 + 0.15 * Math.sin(H * 2.1 + rx) + 0.1 * Math.sin(H * 5.3 + rz)))
              * (kind === 'ocean' ? OCEAN_WIND : 1);
  const dir = ((sHash(rx, rz, Math.floor(H / 24), 11) * 360 + 40 * Math.sin(H * 0.3 + rz)) % 360 + 360) % 360;
  // rain or snow, for its name (0.83; the season until then)
  const snows = _snowsIn(rx, rz, s.start), nextSnows = next ? _snowsIn(rx, rz, s.end) : false;
  return { type, kind, snows, nextSnows, next, nextIn: next ? Math.max(0, Math.ceil(s.end - H)) : null, speed, dir };
}
const _smooth = (t) => t * t * (3 - 2 * t);
/* BLENDED between regions (0.813). A position takes the four region centres around it, weighted by how near
   it is to each (smoothed), so the wind eases from one region's to the next instead of jumping from 4 km/h to
   40 at a line. Speed and direction blend as one vector. The weather type cannot be averaged: `type` is the
   one with the most weight here, and `mix` lists every type with its share — sunny fading into a storm reads
   as { sunny: 0.7, storm: 0.3 } a quarter region from the edge. `next` and `nextIn` are the leading region's. */
function weatherAt(x, z, y = null, aheadH = 0) {
  const H = worldClockDays() * 24 + aheadH;
  const u = x / REGION_BLOCKS - 0.5, v = z / REGION_BLOCKS - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v), fu = _smooth(u - i0), fv = _smooth(v - j0);
  const mix = {};
  let vx = 0, vz = 0, spd = 0, lead = null, leadW = -1;
  for (const [di, dj, wgt] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]) {
    if (wgt <= 0) continue;
    const r = _regionWeather(i0 + di, j0 + dj, H);
    mix[r.type] = (mix[r.type] || 0) + wgt;
    spd += r.speed * wgt;
    const [wx, wz] = windVector(r.dir);
    vx += wx * r.speed * wgt; vz += wz * r.speed * wgt;
    if (wgt > leadW) { leadW = wgt; lead = r; }
  }
  let type = lead.type, best = -1;
  for (const t in mix) if (mix[t] > best) { best = mix[t]; type = t; }
  // direction from the blended vector; where the winds cancel out, the leading region's
  const dir = Math.hypot(vx, vz) > 0.5 ? ((Math.atan2(vx, -vz) * 180 / Math.PI) + 360) % 360 : lead.dir;
  return { type, name: weatherName(type, lead.kind, lead.snows), mix, next: lead.next, nextName: lead.next && weatherName(lead.next, lead.kind, lead.nextSnows),
           nextIn: lead.nextIn, speed: spd + (y == null ? 0 : windHeightBonus(y)), dir };
}
// the wind as a unit vector in the world (x east, z south): heading 0 is north (-z)
const windVector = (dir) => [Math.sin(dir * Math.PI / 180), -Math.cos(dir * Math.PI / 180)];
/* How much a strong wind changes a walk: along the wind faster, into it slower. It starts at 25 km/h with 1%
   and climbs 2.5% a km/h — 13.5% at 30 km/h — up to 35% (0.811). `mx, mz` is the step about to be taken. */
const WIND_PUSH_FROM = 25, WIND_PUSH_BASE = 0.01, WIND_PUSH_PER_KMH = 0.025, WIND_PUSH_MAX = 0.35;
// ...all of it at a fifth of that since 0.8141 (WIND_PUSH_SCALE): 2.7% at 30 km/h, 7% at the most
const WIND_PUSH_SCALE = 0.2;
const windPush = (w) => w.speed < WIND_PUSH_FROM ? 0 : WIND_PUSH_SCALE * Math.min(WIND_PUSH_MAX, WIND_PUSH_BASE + (w.speed - WIND_PUSH_FROM) * WIND_PUSH_PER_KMH);
function windMoveMul(w, mx, mz, shelter = 1) {
  const len = Math.hypot(mx, mz), push = windPush(w) * shelter;
  if (!len || !push) return 1;
  const [wx, wz] = windVector(w.dir);
  return 1 + ((mx * wx + mz * wz) / len) * push;
}
/* How much of the wind reaches someone (0.812), 0..1. Indoors — no open sky at the head — none. Outside, a
   wall on the side the wind comes from shelters them: right behind it fully, four blocks off only a little.
   Feet and head are looked at separately, so a low wall only half-shelters. */
function windShelter(p) {
  const fx = Math.floor(p.pos.x), fz = Math.floor(p.pos.z), fy = Math.floor(p.pos.y), hy = Math.floor(p.pos.y + 1.5);
  if (typeof getSkyWorld === 'function' && getSkyWorld(fx, hy, fz) < 12) return 0;
  const [wx, wz] = windVector(weatherAt(p.pos.x, p.pos.z).dir);
  const row = (y) => {
    for (let d = 1; d <= 4; d++)
      if (CORE.solidVal(getBlock(Math.floor(p.pos.x - wx * d), y, Math.floor(p.pos.z - wz * d)))) return (d - 1) / 4;
    return 1;
  };
  return (row(fy) + row(hy)) / 2;
}
/* A player standing still in a strong wind is pushed along by it (0.812): the same push, as a share of a
   walking pace, in the direction it blows — half of it since 0.818 (WIND_DRIFT_SCALE). A sneaking player is
   never carried off an edge by it (22-main-loop.js). */
const WIND_DRIFT_SCALE = 0.5;
function windDrift(p, dt) {
  const w = weatherAt(p.pos.x, p.pos.z, p.pos.y), push = windPush(w);
  if (!push) return null;
  const s = push * windShelter(p);
  if (!s) return null;
  const [wx, wz] = windVector(w.dir), v = (p.walkSpeed || 4.3) * s * WIND_DRIFT_SCALE * dt;
  return [wx * v, wz * v];
}

/* ================================== fog and rainbows (0.816) ==================================
   Besides foggy weather (thick: FOG_DENSE_FAR in 52-clouds.js), a region can have a lighter fog: on a quarter
   of mornings from 3 to 6 o'clock, and after half the rains and storms for FOG_AFTER_H hours once they end.
   One rain or storm in ten leaves a rainbow for RAINBOW_H hours. All of it is hashed like the weather, so it is
   the same for everyone and after a reload. */
const FOG_MORNING_CHANCE = 0.25, FOG_AFTER_RAIN_CHANCE = 0.5, RAINBOW_CHANCE = 0.1;
const FOG_MORNING_FROM = 3, FOG_MORNING_TO = 6;           // o'clock, with half an hour to come and go each side
const FOG_AFTER_H = 2.5, RAINBOW_H = 2.5;                 // in-game hours after the rain ends
const _WET = new Set(['rainy', 'storm']);
// the hour the region's rain or storm ended, if the stretch it is in now came straight after one; else null
function _rainEndedAt(rx, rz, H) {
  const s = _weatherStretch(rx, rz, H);
  if (_WET.has(_pickWeather(rx, rz, s.start))) return null;
  return _WET.has(_pickWeather(rx, rz, _weatherStretch(rx, rz, s.start - 0.01).start)) ? s.start : null;
}
// a 0..1 bump: rises over `inH` from `from`, holds, falls over `outH` to `to`
const _bump = (h, from, to, inH, outH) => Math.max(0, Math.min(1, (h - from) / inH, (to - h) / outH));
// one region's light fog (0..1) and rainbow (0..1) at hour H
function _regionMist(rx, rz, H) {
  let fog = 0, bow = 0;
  const clock = ((H + 6) % 24 + 24) % 24, day = Math.floor((H + 6) / 24);   // the clock reads 06:00 at sunrise
  if (regionKind(rx, rz) !== 'warm' && sHash(rx, rz, day, 31) < FOG_MORNING_CHANCE)
    fog = _bump(clock, FOG_MORNING_FROM - 0.5, FOG_MORNING_TO + 0.5, 0.5, 0.5);
  const end = _rainEndedAt(rx, rz, H);
  if (end != null) {
    const since = H - end, e = Math.floor(end);
    if (sHash(rx, rz, e, 33) < FOG_AFTER_RAIN_CHANCE) fog = Math.max(fog, _bump(since, 0, FOG_AFTER_H, 0.25, 0.75));
    if (sHash(rx, rz, e, 35) < RAINBOW_CHANCE) bow = _bump(since, 0, RAINBOW_H, 0.25, 0.75);
  }
  return { fog, bow };
}
/* The mist at a world position, blended between region centres like weatherAt: `dense` is foggy weather's
   share, `light` the morning / after-rain fog, `bow` the rainbow. */
function mistAt(x, z) {
  if (_titleCalm()) return { dense: 0, light: 0, bow: 0 };        // no fog or rainbow on the title (0.8198)
  const H = worldClockDays() * 24;
  const u = x / REGION_BLOCKS - 0.5, v = z / REGION_BLOCKS - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v), fu = _smooth(u - i0), fv = _smooth(v - j0);
  let dense = 0, light = 0, bow = 0;
  for (const [di, dj, wgt] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]) {
    if (wgt <= 0) continue;
    const rx = i0 + di, rz = j0 + dj, m = _regionMist(rx, rz, H);
    if (_pickWeather(rx, rz, _weatherStretch(rx, rz, H).start) === 'foggy') dense += wgt;
    light += m.fog * wgt; bow += m.bow * wgt;
  }
  return { dense, light, bow };
}

/* SANDSTORM (0.825): a desert region's strong wind (weatherName calls it a sandstorm) fills the air with sand. Its
   share at a world position, 0..1, blended between region centres like mistAt, and thinner where the ground under
   it is less desert (an edge over grass: 40%). Whoever reads it eases it in (30-60 s): applyMist (52-clouds.js) for
   the sight, tickSandstorm (54-stats-effects.js) for the body, _fxSandstorm (49-particles.js) for the sand. */
function sandstormAt(x, z) {
  if (_titleCalm()) return 0;
  const H = worldClockDays() * 24;
  const u = x / REGION_BLOCKS - 0.5, v = z / REGION_BLOCKS - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v), fu = _smooth(u - i0), fv = _smooth(v - j0);
  let s = 0;
  for (const [di, dj, wgt] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]) {
    if (wgt <= 0) continue;
    const rx = i0 + di, rz = j0 + dj;
    if (regionKind(rx, rz) === 'warm' && _pickWeather(rx, rz, _weatherStretch(rx, rz, H).start) === 'windy') s += wgt;
  }
  if (!s) return 0;
  const c = typeof mainGen !== 'undefined' && mainGen && mainGen.climateAt ? mainGen.climateAt(x, z) : null;
  return s * (c ? 0.4 + 0.6 * Math.min(1, c.hot) : 1);
}
// how red a sandstorm's sand is at a position, 0 (desert sand) .. 1 (red sand)
function sandstormRedAt(x, z) {
  const c = typeof mainGen !== 'undefined' && mainGen && mainGen.climateAt ? mainGen.climateAt(x, z) : null;
  return c && c.hot > 0 ? Math.min(1, (c.red || 0) / c.hot) : 0;
}

/* HAIL (0.819): some storms bring hail, rolled once per storm like the rest of the weather. The share at a position,
   blended between region centres like weatherAt; 53-storms.js does the rest. How many by season (0.8241, a flat 35%
   before): autumn's storms most, winter's none — its storms are snow. */
const HAIL_BY_SEASON = [0.3, 0.2, 0.6, 0];
function hailAt(x, z) {
  if (_titleCalm()) return 0;
  const H = worldClockDays() * 24;
  const u = x / REGION_BLOCKS - 0.5, v = z / REGION_BLOCKS - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v), fu = _smooth(u - i0), fv = _smooth(v - j0);
  let hail = 0;
  for (const [di, dj, wgt] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]) {
    if (wgt <= 0) continue;
    const rx = i0 + di, rz = j0 + dj, s = _weatherStretch(rx, rz, H);
    if (_pickWeather(rx, rz, s.start) === 'storm'
        && sHash(rx, rz, Math.floor(s.start), 51) < HAIL_BY_SEASON[gameDate(s.start / 24).season]) hail += wgt;
  }
  return hail;
}

/* RAIN AND SNOW (0.83): how much falls at a world position, { rain, snow, blizzard } each 0..1, blended between region
   centres like hailAt: a region's share times its stretch's strength. A rainy stretch is light to heavy (rolled once),
   a storm heavy, a blizzard full and all snow. Rain falls as snow where _snowsIn says, and with `y` given, snow too up
   within PRECIP_SNOWLINE of the snowline; above the cloud layer nothing falls. Read by the particles (_fxWeather, 49),
   the fog (applyMist, 52) and the ground (updateWeatherGround below). */
const PRECIP_SNOWLINE = 6;
function _regionPrecip(rx, rz, H) {
  const s = _weatherStretch(rx, rz, H), type = _pickWeather(rx, rz, s.start);
  if (type !== 'rainy' && type !== 'storm' && type !== 'blizzard') return null;
  const k = Math.floor(s.start);
  const amt = type === 'blizzard' ? 1 : type === 'storm' ? 0.85 + 0.15 * sHash(rx, rz, k, 63) : 0.3 + 0.7 * sHash(rx, rz, k, 63);
  return { amt, snow: type === 'blizzard' || _snowsIn(rx, rz, s.start), blizzard: type === 'blizzard' };
}
function precipAt(x, z, y = null) {
  const out = { rain: 0, snow: 0, blizzard: 0 };
  if (_titleCalm()) return out;
  if (y != null && typeof cloudsBelow === 'function' && cloudsBelow(y) >= 1) return out;
  const H = worldClockDays() * 24;
  const u = x / REGION_BLOCKS - 0.5, v = z / REGION_BLOCKS - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v), fu = _smooth(u - i0), fv = _smooth(v - j0);
  for (const [di, dj, wgt] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]) {
    if (wgt <= 0) continue;
    const r = _regionPrecip(i0 + di, j0 + dj, H);
    if (!r) continue;
    if (r.snow) out.snow += r.amt * wgt; else out.rain += r.amt * wgt;
    if (r.blizzard) out.blizzard += wgt;
  }
  if (y != null && out.rain > 0 && y >= snowlineY(x, z) - PRECIP_SNOWLINE) { out.snow += out.rain; out.rain = 0; }
  return out;
}

/* WEATHER ON THE GROUND (0.83). Every WXG_TICK seconds, round one seat (sweepOriginPlayer), a few random columns
   whose top is under the open sky:
     - rain washes the top layer of snow, ash or salt off (WXG_RAIN_MELT, by how hard it falls);
     - falling snow lays a layer on open solid ground or tops up a drift, to WXG_SNOW_MAX layers (WXG_BLIZZARD_MAX in
       a blizzard, which lays it three times as fast);
     - a dry sandy shore beside the sea grows a crust of salt, very slowly (WXG_SALT), up to WXG_SALT_MAX layers.
   Chances are per sampled column, times the world's tick speed; a column is sampled about every 200 s, so at full
   strength rain takes a layer every ~4 min, snow lays one every ~6 min (a blizzard ~2), salt every ~6 h. */
const WXG_TICK = 1, WXG_TRIES = 16, WXG_R = 28;
const WXG_RAIN_MELT = 0.8, WXG_SNOW_LAY = 0.6, WXG_SNOW_MAX = 3, WXG_BLIZZARD_MAX = 6;
const WXG_SALT = 0.01, WXG_SALT_MAX = 2;
const _WXG_WASHED = new Set([B.SNOW, B.ASH, B.SALT_CRUST]);
const _WXG_SAND = new Set([B.SAND, B.RED_SAND, B.PINK_SAND]);
let _wxgT = 0;
// the top cell of a column near height y0, if open to the sky: its y, else null
function _openTop(x, z, y0) {
  for (let y = Math.min(198, y0 + 24), lo = Math.max(1, y0 - 24); y >= lo; y--) {
    if (!getBlock(x, y, z)) continue;
    return getSkyWorld(x, y + 1, z) >= 15 ? y : null;
  }
  return null;
}
function _laySnow(x, y, z, v, ids, max) {
  if (ids) { if (ids.length < Math.min(max, LAYER_MAX - 1)) setLayerStack(x, y, z, [...ids, B.SNOW]); return; }
  if (y >= 198 || !CORE.solidVal(v) || CORE.shapeOfVal(v) || !PROPS[v & 255]?.opaque) return;   // whole, solid, opaque tops only
  if (!getBlock(x, y + 1, z)) setBlock(x, y + 1, z, CORE.layerVal(B.SNOW, 1));
}
function _laySalt(x, y, z, v, ids) {
  let ground = y;
  if (ids) { if (ids.length >= WXG_SALT_MAX || ids.some(b => b !== B.SALT_CRUST)) return; ground = y - 1; }
  if (!_WXG_SAND.has(getBlock(x, ground, z) & 255) || Math.abs(ground - WATER_Y) > 1) return;   // a beach, at the sea
  let sea = false;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    if ((getBlock(x + dx, ground, z + dz) & 255) === B.WATER || (getBlock(x + dx, ground + 1, z + dz) & 255) === B.WATER) { sea = true; break; }
  if (!sea) return;
  if (ids) setLayerStack(x, y, z, [...ids, B.SALT_CRUST]);
  else if (!getBlock(x, y + 1, z)) setBlock(x, y + 1, z, CORE.layerVal(B.SALT_CRUST, 1));
}
function updateWeatherGround(dt) {
  _wxgT += dt;
  if (_wxgT < WXG_TICK) return;
  const step = Math.min(5, _wxgT) * (typeof tickFactor === 'function' ? tickFactor() : 1);
  _wxgT = 0;
  const sp = typeof sweepOriginPlayer === 'function' ? sweepOriginPlayer() : null;
  if (!sp) return;
  const px = Math.floor(sp.pos.x), py = Math.floor(sp.pos.y), pz = Math.floor(sp.pos.z);
  const pr = precipAt(sp.pos.x, sp.pos.z);       // the sweep is small beside a region: one reading serves it
  const bliz = pr.blizzard > 0.5;
  for (let n = 0; n < WXG_TRIES; n++) {
    const x = px + ((Math.random() * (2 * WXG_R + 1)) | 0) - WXG_R, z = pz + ((Math.random() * (2 * WXG_R + 1)) | 0) - WXG_R;
    if (!inSimRange(x, z)) continue;
    const y = _openTop(x, z, py);
    if (y == null) continue;
    const v = getBlock(x, y, z), ids = layerIdsAt(x, y, z, v);
    if (pr.rain > 0.05 && ids && _WXG_WASHED.has(ids[ids.length - 1])) {
      if (Math.random() < WXG_RAIN_MELT * pr.rain * step) removeLayerAt(x, y, z, ids.length - 1);
      continue;
    }
    if (pr.snow > 0.05) {
      if (Math.random() < WXG_SNOW_LAY * pr.snow * (bliz ? 3 : 1) * step) _laySnow(x, y, z, v, ids, bliz ? WXG_BLIZZARD_MAX : WXG_SNOW_MAX);
      continue;
    }
    if (pr.rain <= 0.05 && Math.random() < WXG_SALT * step) _laySalt(x, y, z, v, ids);
  }
}

/* SNOWLINE (0.819): above it the ground keeps a cover of snow, in every biome. It follows the sun's year
   (07-sky.js), so it sits high in summer and comes down the mountains in winter, and it is ragged by a block or
   two either way. The season sweep lays the snow (_snowlineChunk); snow melt leaves anything above it alone
   (33-felling.js), and below it the snow melts away as any snow outside a cold biome does. */
const SNOWLINE_SUMMER = 176, SNOWLINE_WINTER = 134;
function snowlineY(x, z) {
  const s = typeof sunDeclination === 'function' ? sunDeclination() / SUN_DECL_MAX : 1;   // -1 midwinter .. 1 midsummer
  return SNOWLINE_WINTER + (SNOWLINE_SUMMER - SNOWLINE_WINTER) * (s + 1) / 2
       + 2 * Math.sin(x * 0.11 + z * 0.07) + 1.5 * Math.sin(z * 0.13 - x * 0.05) + _snowBareLift(x, z);
}
/* Bare mountains (0.8241): about one in ten keeps no snow. A slow patchwork of the world's own (corners of a 384-block
   grid, 8.5% of them bare, eased between: about a tenth of the land) lifts the snowline out of reach there, so the snow draws back up the
   slopes over a few hundred blocks instead of stopping at a line. */
const SNOW_BARE_CELL = 384, SNOW_BARE_SHARE = 0.085, SNOW_BARE_LIFT = 90;
function _snowBareLift(x, z) {
  const u = x / SNOW_BARE_CELL, v = z / SNOW_BARE_CELL, i = Math.floor(u), j = Math.floor(v);
  const fu = _smooth(u - i), fv = _smooth(v - j);
  const bare = (a, b) => (sHash(a, b, 0, 377) < SNOW_BARE_SHARE ? 1 : 0);
  const n = (bare(i, j) * (1 - fu) + bare(i + 1, j) * fu) * (1 - fv) + (bare(i, j + 1) * (1 - fu) + bare(i + 1, j + 1) * fu) * fv;
  return n > 0 ? SNOW_BARE_LIFT * _smooth(Math.min(1, n * 2)) : 0;
}
// one chunk's columns: a snow cover on open ground above the snowline, deeper the higher it is
function _snowlineChunk(c) {
  const data = c.data, wx0 = c.cx * 16, wz0 = c.cz * 16;
  const line0 = snowlineY(wx0 + 8, wz0 + 8) - 4;              // nothing in this chunk can be near it: skip fast
  for (let col = c._snowCol || 0; col < 256; col++) {
    const lx = col & 15, lz = col >> 4, li = lx + (lz << 4);
    let y = 199;
    while (y > line0 && !data[li + (y << 8)]) y--;
    if (y <= line0) continue;
    const top = data[li + (y << 8)], x = wx0 + lx, z = wz0 + lz, line = snowlineY(x, z);
    if (y < line || y >= 199) continue;
    // on bare, solid, open ground only: not on leaves, snow already there, sand, or a plant
    const tid = top & 255;
    if (!CORE.solidVal(top) || CORE.layerCount(top) || tid === B.SNOW || tid === B.SAND || tid === B.RED_SAND || tid === B.PINK_SAND) continue;
    if (_skyAt(c, li + ((y + 1) << 8)) < 15) continue;
    if (_seasonOps >= SEASON_OPS_PER_FRAME) { c._snowCol = col; return false; }
    _seasonOps++;
    setBlock(x, y + 1, z, CORE.layerVal(B.SNOW, 1 + Math.min(3, Math.floor((y - line) / 6))));
  }
  c._snowCol = 0;
  return true;
}

/* ================================== the title's season (0.8194) ==================================
   The title backdrop has no seasons running, but it is set on a random day each time it is shown, so you see the
   world in some season: winter 5% of the time, spring, summer and autumn a third of the rest each (31.7%). Its
   chunks are dressed for that day as they arrive from the generator (seasonDressChunk: the leaves and plants that
   season would have taken, and snow above the snowline), straight into their data, and the day is shown top left. */
function randomTitleDay() {
  const r = Math.random();
  const season = r < 0.05 ? 3 : r < 0.05 + 0.95 / 3 ? 0 : r < 0.05 + 0.95 * 2 / 3 ? 1 : 2;
  const month = [[2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 0, 1]][season][(Math.random() * 3) | 0];
  return ((month - START_MONTH + 12) % 12) * MONTH_DAYS + ((Math.random() * MONTH_DAYS) | 0);
}
function seasonDressChunk(c) {
  const d = gameDate(), data = c.data, wx0 = c.cx * 16, wz0 = c.cz * 16;
  if (d.season >= 2) {
    const level = d.season === 3 ? 1.01 : d.progress;           // as far through the fall as the day is
    for (let i = 95 << 8; i < data.length; i++) {               // above the caves: they have no seasons
      const v = data[i], id = v & 255;
      if (!(SEASON_LEAVES.has(id) || SEASON_PLANTS.has(id)) || CORE.layerCount(v)) continue;
      const x = wx0 + (i & 15), y = i >> 8, z = wz0 + ((i >> 4) & 15);
      if (sHash(x, y, z, SEASON_LEAVES.has(id) ? 1 : 2) >= level) continue;
      data[i] = 0;
      if (id === B.TALL_LOWER && i + 256 < data.length && (data[i + 256] & 255) === B.TALL_UPPER) data[i + 256] = 0;
    }
  }
  // the snowline, as _snowlineChunk lays it, and the grass under it snowy
  for (let col = 0; col < 256; col++) {
    const li = (col & 15) + ((col >> 4) << 4), x = wx0 + (col & 15), z = wz0 + (col >> 4), line = snowlineY(x, z);
    let y = 198;
    while (y > line && !data[li + (y << 8)]) y--;
    if (y < line) continue;
    const top = data[li + (y << 8)], tid = top & 255;
    if (!CORE.solidVal(top) || CORE.layerCount(top) || tid === B.SNOW || tid === B.SAND || tid === B.RED_SAND || tid === B.PINK_SAND || data[li + ((y + 1) << 8)]) continue;
    data[li + ((y + 1) << 8)] = CORE.layerVal(B.SNOW, 1 + Math.min(3, Math.floor((y - line) / 6)));
    if (tid === B.GRASS) data[li + (y << 8)] = B.GRASS | (V.GRASS_SNOWY << 8);
  }
}
// the day and season in the title's top left corner
const titleDateEl = document.createElement('div');
titleDateEl.id = 'titleDate';
titleDateEl.style.display = 'none';
document.body.appendChild(titleDateEl);
function showTitleDate(on) {
  if (!on) { titleDateEl.style.display = 'none'; return; }
  const d = gameDate();
  titleDateEl.textContent = `${d.day} ${MONTH_NAMES[d.month]} · ${SEASON_NAMES[d.season]}`;
  titleDateEl.style.display = '';
}

/* ================================== the seasons on the land ================================== */
const SEASON_LEAVES = new Set([B.LEAVES, B.BIRCH_LEAVES]);               // spruce keeps its needles
// mushrooms left this list in 0.821: they have their own year now (mushroom growth, below)
const SEASON_PLANTS = new Set([B.TALLGRASS, B.TALL_LOWER, B.POPPY, B.ORCHID, B.PINCUSHION,
  B.REDBERRY_BUSH, B.BLUEBERRY_BUSH, B.BLACKBERRY_BUSH, B.YELLOWBERRY_BUSH, B.WHITEBERRY_BUSH,   // yellow, white 0.827
  B.WHEAT, B.MELON, B.PUMPKIN, B.CANTALOUPE]);
// "cx,cz" -> Map(cell index -> the value that stood there): what autumn took and spring may give back. Saved.
const SEASON_MEM = new Map();
const SEASON_CHUNK_EVERY_H = 1;              // a chunk looks at the season again every in-game hour
const SEASON_OPS_PER_FRAME = 250;            // block changes a frame may make, so a catch-up is spread out
const SEASON_SCANS_PER_FRAME = 2;            // chunks a frame may scan

function _seasonMem(k) { let m = SEASON_MEM.get(k); if (!m) SEASON_MEM.set(k, m = new Map()); return m; }
const _skyAt = (c, i) => (c.sky ? c.sky[i] : 15);
// a leaf lets go: it lands on the ground below as litter that rots in days, not seconds
function _seasonLeafFall(x, y, z, id) {
  setBlock(x, y, z, B.AIR);
  let ly = y - 1;
  while (ly > 0 && fallPassable(getBlock(x, ly, z))) ly--;
  const mat = (typeof LITTER_OF !== 'undefined' && LITTER_OF[id]) || id;
  if (typeof _addLitter === 'function' && _addLitter(x, ly + 1, z, mat))
    for (const yy of [ly, ly + 1, ly + 2]) {
      const k = x + ',' + yy + ',' + z;
      if (litterRot.has(k)) litterRot.set(k, (LITTER_LIFE_NATURAL + Math.random() * LITTER_LIFE_NATURAL_JITTER) * _dayLen());
    }
}
// can a remembered plant stand here again: an empty cell on solid ground
const _plantFits = (x, y, z) => (getBlock(x, y, z) & 255) === B.AIR && CORE.solidVal(getBlock(x, y - 1, z));
function _placePlant(x, y, z, v) {
  setBlock(x, y, z, v);
  if ((v & 255) === B.TALL_LOWER && (getBlock(x, y + 1, z) & 255) === B.AIR) setBlock(x, y + 1, z, B.TALL_UPPER);
}

/* One chunk's turn: take away what autumn/winter should have taken by now, give back what spring should
   have given. Returns false when it ran out of budget (it carries on next frame). */
let _seasonOps = 0;
function _seasonChunk(c) {
  if (!seasonsOn()) { _shroomChunk(c); _iceChunk(c); return _snowlineChunk(c); }   // always July: the high snow (0.819), mushrooms (0.821), ice (0.8321)
  const d = gameDate(), k = key(c.cx, c.cz), wx0 = c.cx * 16, wz0 = c.cz * 16;
  if (d.season >= 2) {
    const level = d.season === 3 ? 1.01 : d.progress;           // how much of the fall has happened
    const data = c.data;
    for (let i = c._seasonScan || 0; i < data.length; i++) {
      const v = data[i], id = v & 255;
      if (!(SEASON_LEAVES.has(id) || SEASON_PLANTS.has(id)) || CORE.layerCount(v)) continue;
      if (_skyAt(c, i) === 0) continue;                           // underground: no seasons there
      const x = wx0 + (i & 15), y = i >> 8, z = wz0 + ((i >> 4) & 15);
      if (sHash(x, y, z, SEASON_LEAVES.has(id) ? 1 : 2) >= level) continue;
      if (_seasonOps >= SEASON_OPS_PER_FRAME) { c._seasonScan = i; return false; }
      _seasonOps++;
      _seasonMem(k).set(i, v);
      if (SEASON_LEAVES.has(id)) _seasonLeafFall(x, y, z, id);
      else {
        if (id === B.TALL_LOWER && (getBlock(x, y + 1, z) & 255) === B.TALL_UPPER) setBlock(x, y + 1, z, B.AIR);
        setBlock(x, y, z, B.AIR);
      }
    }
    c._seasonScan = 0;
  } else {
    const mem = SEASON_MEM.get(k);
    if (mem && mem.size) {
      const level = d.season === 1 ? 1.01 : d.progress;         // leaves: through the whole of spring
      const plantLevel = Math.min(1.01, level * 4);               // plants: in its first weeks
      for (const [i, v] of mem) {
        const id = v & 255, x = wx0 + (i & 15), y = i >> 8, z = wz0 + ((i >> 4) & 15);
        const isLeaf = SEASON_LEAVES.has(id);
        if (sHash(x, y, z, isLeaf ? 3 : 4) >= (isLeaf ? level : plantLevel)) continue;
        if (_seasonOps >= SEASON_OPS_PER_FRAME) return false;
        _seasonOps++;
        mem.delete(i);
        if (isLeaf) { if ((getBlock(x, y, z) & 255) === B.AIR) setBlock(x, y, z, v); continue; }
        // wheat comes back as a sprout and grows; the rest as they were
        const back = id === B.WHEAT ? (B.WHEAT | (1 << 8)) : v;
        // the year in the roll: a new 50% each spring (this call sat inside the comment until 0.819, so none came back)
        if (sHash(x, y, z, 5 + d.year * 16) < 0.5 && _plantFits(x, y, z)) _placePlant(x, y, z, back);
        if (sHash(x, y, z, 6 + d.year * 16) < 0.001) {                          // ...and a rare seed beside it, come back or not
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], [dx, dz] = dirs[(sHash(x, y, z, 8 + d.year * 16) * 4) | 0];
          if (_plantFits(x + dx, y, z + dz)) _placePlant(x + dx, y, z + dz, back);
        }
      }
      if (!mem.size) SEASON_MEM.delete(k);
    }
  }
  _shroomChunk(c);                                               // mushrooms, every season (0.821)
  _iceChunk(c);                                                  // water freezing and thawing (0.8321)
  return _snowlineChunk(c);                                      // and the snowline, every season (0.819)
}
// per frame: a couple of chunks inside the simulation radius whose hour has come round
let _seasonKeys = [], _seasonCursor = 0, _seasonListT = 0;
function updateSeasons(dt) {
  if (typeof menuScene !== 'undefined' && menuScene) return;
  if (typeof currentWorld !== 'undefined' && !currentWorld) return;
  _seasonOps = 0;
  _seasonListT -= dt;
  if (_seasonListT <= 0 || _seasonCursor >= _seasonKeys.length) { _seasonKeys = [...chunks.keys()]; _seasonCursor = 0; _seasonListT = 5; }
  const nowH = worldClockDays() * 24, season = gameDate().season;
  let scans = 0;
  while (_seasonCursor < _seasonKeys.length && scans < SEASON_SCANS_PER_FRAME && _seasonOps < SEASON_OPS_PER_FRAME) {
    const c = chunks.get(_seasonKeys[_seasonCursor]);
    if (!c || !c.data || !c.lit || !inSimRangeChunk(c.cx, c.cz)) { _seasonCursor++; continue; }
    if (c._seasonH != null && nowH - c._seasonH < SEASON_CHUNK_EVERY_H && c._seasonS === season) { _seasonCursor++; continue; }
    scans++;
    if (_seasonChunk(c)) { c._seasonH = nowH; c._seasonS = season; _seasonCursor++; }
    else break;                                                   // out of budget: same chunk next frame
  }
  updateWheatGrow(dt);
  updateShroomGrow(dt);                                          // 0.821
  updateCaneGrow(dt);                                            // 0.829
  updateWeatherGround(dt);                                       // rain washes, snow lays, salt grows (0.83)
  updateIceMelt(dt);                                             // ice by heat (0.8321)
  if (typeof updateBurns === 'function') updateBurns(dt);        // torches and glow blocks burning out (0.834, 56-torches.js)
}
function serializeSeasons() {
  const out = [];
  for (const [k, m] of SEASON_MEM) if (m.size) out.push([k, [...m].flat()]);
  return out;
}
function restoreSeasons(list) {
  SEASON_MEM.clear();
  if (!Array.isArray(list)) return;
  for (const [k, flat] of list) {
    if (typeof k !== 'string' || !Array.isArray(flat)) continue;
    const m = new Map();
    for (let i = 0; i + 1 < flat.length; i += 2) m.set(flat[i] | 0, flat[i + 1] >>> 0);
    if (m.size) SEASON_MEM.set(k, m);
  }
}

/* ---- wheat growth (0.81): variants 1..6 are stages 0..5, 0 is ripe (its art is wheat_stage6 since 0.8273; 1..7 before). Same adoption sweep and pause
   outside the simulation radius as the berry bushes (33-felling.js), each stage on its own clock. ---- */
const wheatGrow = new Map();
const WHEAT_STAGE_LIFE = 0.35, WHEAT_STAGE_JITTER = 0.3;    // in-game days per stage
const _wheatLife = () => (WHEAT_STAGE_LIFE + Math.random() * WHEAT_STAGE_JITTER) * _dayLen();
let _wheatTimer = 0, _wheatSweep = 0;
function updateWheatGrow(dt) {
  _wheatSweep += dt;
  if (_wheatSweep >= 5) {
    _wheatSweep = 0;
    const sp = sweepOriginPlayer();
    if (sp) for (let n = 0; n < 20; n++) {
      const x = Math.floor(sp.pos.x) + (Math.random() * 48 | 0) - 24, z = Math.floor(sp.pos.z) + (Math.random() * 48 | 0) - 24;
      const y = Math.floor(sp.pos.y) + (Math.random() * 12 | 0) - 6;
      const v = getBlock(x, y, z);
      if ((v & 255) === B.WHEAT && ((v >> 8) & 7)) { const k = x + ',' + y + ',' + z; if (!wheatGrow.has(k)) wheatGrow.set(k, _wheatLife()); }
    }
  }
  _wheatTimer += dt;
  if (_wheatTimer < 1) return;
  const step = _wheatTimer * (typeof tickFactor === 'function' ? tickFactor() : 1) * seasonGrowth();
  _wheatTimer = 0;
  if (!step) return;                                            // winter: nothing grows
  for (const [k, t] of wheatGrow) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) continue;
    const v = getBlock(x, y, z), st = (v >> 8) & 7;
    if ((v & 255) !== B.WHEAT || !st) { wheatGrow.delete(k); continue; }
    const left = t - step;
    if (left > 0) { wheatGrow.set(k, left); continue; }
    const next = st >= 6 ? 0 : st + 1;                           // past stage 5 it is ripe (6 until 0.8273)
    setBlock(x, y, z, B.WHEAT | (next << 8));
    if (next) wheatGrow.set(k, _wheatLife()); else wheatGrow.delete(k);
  }
}
/* ---- mushrooms grow (0.821) ----
   A mushroom's variant: bits 0-2 the size it grows to (1..7 = 0.5x..1.5x; 0 = one from the world generator or from
   before, grown, sized by where it stands), bits 3-7 how many of SHROOM_STEPS steps it still has to grow — the
   mesher draws it at the share it has (emitShroom, 02-voxel-core.js). New ones come up as sprouts (sproutShroom):
     - in autumn on the forest floor, a few a chunk (_shroomAutumn), and more beside a fallen hollow log;
     - on top of a hollow log packed with dirt or grass, spring to autumn (both processHollowMushrooms, 22).
   They grow by day only, SHROOM_GROW_S from sprout to full. Under the open sky (not in a cave, and never the lava
   kind) a grown one lasts SHROOM_LIFE_S and is gone, and in winter they all go, a few at a time. Under 40% grown a
   mushroom cannot be picked (shroomTooSmall; it gave nothing before 0.826), and the prompt says how big it is. The clocks are not saved: a chunk's mushrooms are
   picked up again on its next hourly season pass (_shroomChunk), which restarts a grown one's time. */
const SHROOM_STEPS = 31, SHROOM_GROW_S = 900, SHROOM_LIFE_S = 1800;
const SHROOM_WILD = new Set([B.RED_MUSHROOM, B.BROWN_MUSHROOM, B.BLUE_MUSHROOM, B.BLACK_MUSHROOM,
                             B.WHITE_TALL_MUSHROOM, B.YELLOW_MUSHROOM]);      // not the lava one
const SHROOM_OAK = [B.BROWN_MUSHROOM, B.BLACK_MUSHROOM, B.WHITE_TALL_MUSHROOM, B.YELLOW_MUSHROOM];
// what an autumn forest grows, by its biome (read once per chunk)
const SHROOM_BY_BIOME = { 'Forest': SHROOM_OAK, 'Birch Forest': [B.RED_MUSHROOM], 'Snow Forest': [B.BLUE_MUSHROOM],
                          'Spruce Forest': [B.BLUE_MUSHROOM] };   // spruce forest 0.823; deep ones by their base (biomeBase)
const SHROOM_AUTUMN_TRIES = 2, SHROOM_AUTUMN_CHANCE = 0.03;   // per chunk, per hourly pass: a few standing at once
const SHROOM_AUTUMN_MAX = 6;                                  // a chunk with this many out already grows no more
const shroomLeft = (vr) => ((vr || 0) >> 3) & 31;
const shroomTooSmall = (id, vr) => PROPS[id]?.shroom != null && shroomLeft(vr) > SHROOM_STEPS * 0.6;
/* How big a mushroom is right now, as the mesher draws it (emitShroom, 02-voxel-core.js): its full size (bits 0-2,
   0.5x..1.5x; 0 = sized by a hash of where it stands) times the share it has grown, never under 12%. The pickup
   prompt shows it (0.826, findBushPickup in 13-actions.js). */
function shroomSizeAt(x, y, z, vr) {
  const m = (vr || 0) & 7;
  let size;
  if (m) size = 0.5 + (m - 1) / 6;
  else {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 217645177) + Math.imul(z | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    size = 0.5 + (h >>> 0) / 4294967296;
  }
  return size * Math.max(0.12, 1 - shroomLeft(vr) / SHROOM_STEPS);
}
const shroomGrow = new Map();       // "x,y,z" -> seconds to its next step (growing) or until it goes (grown)
const _shroomStepS = () => SHROOM_GROW_S / SHROOM_STEPS;
// a new mushroom, just come up: a random full size, all its growing ahead of it
function sproutShroom(x, y, z, id) {
  const size = 1 + ((Math.random() * 7) | 0);
  setBlock(x, y, z, id | ((size | ((SHROOM_STEPS - 1) << 3)) << 8));
  shroomGrow.set(x + ',' + y + ',' + z, _shroomStepS());
}
// a random kind of those an oak-type place grows
const shroomOak = () => SHROOM_OAK[(Math.random() * SHROOM_OAK.length) | 0];
// one chunk on its hourly season pass: pick up its open-air mushrooms, clear some away in winter, grow some in autumn
function _shroomChunk(c) {
  const d = seasonsOn() ? gameDate() : null, season = d ? d.season : 1;
  const data = c.data, wx0 = c.cx * 16, wz0 = c.cz * 16;
  let out = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i], id = v & 255;
    if (id === B.SUGAR_CANE) { _caneAdopt(wx0 + (i & 15), i >> 8, wz0 + ((i >> 4) & 15), v); continue; }   // the same scan finds cane (0.829)
    if (!SHROOM_WILD.has(id) || _skyAt(c, i) === 0) continue;      // a cave's stay as they are
    const x = wx0 + (i & 15), y = i >> 8, z = wz0 + ((i >> 4) & 15);
    if (season === 3 && sHash(x, y, z, 9 + d.year * 16) < d.progress * 1.5) {   // winter takes them
      if (_seasonOps < SEASON_OPS_PER_FRAME) { _seasonOps++; setBlock(x, y, z, B.AIR); }
      continue;
    }
    out++;
    const k = x + ',' + y + ',' + z;
    if (!shroomGrow.has(k))
      shroomGrow.set(k, shroomLeft(v >> 8) ? _shroomStepS() : SHROOM_LIFE_S * (0.5 + 0.5 * Math.random()));
  }
  if (season === 2 && out < SHROOM_AUTUMN_MAX) _shroomAutumn(c);
}
// autumn: now and then a sprout on a forest chunk's floor — grass or dirt with air over it
function _shroomAutumn(c) {
  if (c._shroomBiome === undefined)
    c._shroomBiome = typeof mainGen !== 'undefined' && mainGen ? BIOMES.biomeBase(mainGen.biomeAt(c.cx * 16 + 8, c.cz * 16 + 8)) : '';
  const kinds = SHROOM_BY_BIOME[c._shroomBiome];
  if (!kinds) return;
  for (let t = 0; t < SHROOM_AUTUMN_TRIES; t++) {
    if (Math.random() >= SHROOM_AUTUMN_CHANCE || _seasonOps >= SEASON_OPS_PER_FRAME) continue;
    const lx = (Math.random() * 16) | 0, lz = (Math.random() * 16) | 0;
    // down from the sky past air and the canopy to the first ground
    for (let y = 198; y > 1; y--) {
      const i = lx + (lz << 4) + (y << 8), id = c.data[i] & 255;
      if (id === B.AIR || !CORE.solidVal(c.data[i]) || PROPS[id]?.type === 'wood' || id === B.LEAVES
          || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES) continue;
      if ((id === B.GRASS || id === B.DIRT) && (c.data[i + 256] & 255) === B.AIR) {
        _seasonOps++;
        sproutShroom(c.cx * 16 + lx, y + 1, c.cz * 16 + lz, kinds[(Math.random() * kinds.length) | 0]);
      }
      break;
    }
  }
}
// once a second: the growing take a step by day, the grown under the sky run out
let _shroomTickT = 0;
function updateShroomGrow(dt) {
  _shroomTickT += dt;
  if (_shroomTickT < 1) return;
  const step = _shroomTickT * (typeof tickFactor === 'function' ? tickFactor() : 1);
  _shroomTickT = 0;
  const day = !(typeof isDarkTime === 'function' && isDarkTime());
  for (const [k, t] of shroomGrow) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) continue;                              // its clock waits while nobody is near
    const v = getBlock(x, y, z), id = v & 255;
    if (!SHROOM_WILD.has(id)) { shroomGrow.delete(k); continue; }
    const vr = (v >> 8) & 255, left = shroomLeft(vr);
    if (left) {
      if (!day) continue;                                         // growing waits for morning
      if (t - step > 0) { shroomGrow.set(k, t - step); continue; }
      setBlock(x, y, z, id | (((vr & 7) | ((left - 1) << 3)) << 8));
      shroomGrow.set(k, left > 1 ? _shroomStepS() : SHROOM_LIFE_S);
      continue;
    }
    if (getSkyWorld(x, y, z) === 0) { shroomGrow.delete(k); continue; }   // grown in the dark: it stays
    if (t - step > 0) { shroomGrow.set(k, t - step); continue; }
    setBlock(x, y, z, B.AIR);                                     // its time is up
    shroomGrow.delete(k);
  }
}
/* ---- sugar cane grows (0.829) ----
   A cane's variant bits 0-2 are the steps it still has to grow (CANE_STEPS a sprout .. 0 grown; the mesher draws stage
   0-4, then a grown column's pieces). A grown cane on top of its column, with air over it and water beside the column's
   foot, puts a new shoot on itself until the column is CANE_MAX_H high. Found by each chunk's season pass (_shroomChunk's
   scan) and by planting (13-actions.js); its clock waits outside the simulation radius, and in winter. */
const CANE_MAX_H = 5;
const CANE_STEP_LIFE = 0.15, CANE_STEP_JITTER = 0.1;   // in-game days a step: a new block about every 20 minutes
const caneGrow = new Map();
const _caneLife = () => (CANE_STEP_LIFE + Math.random() * CANE_STEP_JITTER) * _dayLen();
function queueCaneGrow(x, y, z) { caneGrow.set(x + ',' + y + ',' + z, _caneLife()); }
// can this grown cane put a shoot on top: the column's top, under CANE_MAX_H, air above, water beside its foot
function _caneCanRise(x, y, z) {
  if (y + 1 >= 199 || (getBlock(x, y + 1, z) & 255) !== B.AIR) return false;
  let foot = y;
  while (foot > 1 && (getBlock(x, foot - 1, z) & 255) === B.SUGAR_CANE) foot--;
  if (y - foot + 1 >= CANE_MAX_H) return false;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    for (const yy of [foot, foot - 1]) if ((getBlock(x + dx, yy, z + dz) & 255) === B.WATER) return true;
  return false;
}
// the season pass meets a cane: keep a clock on it if it is still growing, or could grow taller
function _caneAdopt(x, y, z, v) {
  const k = x + ',' + y + ',' + z;
  if (!caneGrow.has(k) && (((v >> 8) & 7) || _caneCanRise(x, y, z))) caneGrow.set(k, _caneLife());
}
let _caneTickT = 0;
function updateCaneGrow(dt) {
  _caneTickT += dt;
  if (_caneTickT < 1) return;
  const step = _caneTickT * (typeof tickFactor === 'function' ? tickFactor() : 1) * seasonGrowth();
  _caneTickT = 0;
  if (!step) return;                                             // winter: nothing grows
  for (const [k, t] of caneGrow) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) continue;
    const v = getBlock(x, y, z);
    if ((v & 255) !== B.SUGAR_CANE) { caneGrow.delete(k); continue; }
    if (t - step > 0) { caneGrow.set(k, t - step); continue; }
    const left = (v >> 8) & 7;
    if (left) {                                                  // a stage on
      setBlock(x, y, z, B.SUGAR_CANE | ((((v >> 8) & ~7) | (left - 1)) << 8));
      if (left > 1 || _caneCanRise(x, y, z)) caneGrow.set(k, _caneLife()); else caneGrow.delete(k);
      continue;
    }
    caneGrow.delete(k);
    if (_caneCanRise(x, y, z)) {                                 // grown: a new shoot on top, past the seedling
      setBlock(x, y + 1, z, B.SUGAR_CANE | ((CANE_STEPS - 1) << 8));
      queueCaneGrow(x, y + 1, z);
    }
  }
}

/* ---- ice (0.8321) ----
   FREEZING. Each chunk's season pass looks at the top of every column under the open sky: water there freezes over
   (only that top cell) in a snow biome at any time, and in winter everywhere but a desert — a little more of it each
   day through the first third of winter. In spring (and any warmer time, a world with seasons off too) that seasonal
   ice melts back, by day only, through the first third of spring. A snow biome's ice stays, and so does ice a player
   put down. Nothing freezes near heat.
   HEAT melts ice in ICE_MELT_S: a torch within 1 block (placed, or held by a player standing that close), a lit
   furnace within 3, fire 5, lava 9 (cubes round the source). Ice in reach is found when the heat appears (a setBlock
   hook, iceHeatPlaced in 11-chunks.js), when ice is placed (iceQueueIfHot) and twice a second round a torch in hand. */
const ICE_MELT_S = 8, ICE_REACH = 9;
const ICE_HEAT_R = { [B.TORCH]: 1, [B.FIRE]: 5, [B.LAVA]: 9 };
const ICE_FURNACE_R = 3;
const iceMelt = new Map();                      // "x,y,z" -> seconds of heat it has had
const _iceHeld = new Set();                     // cells a held torch warmed since the last melt tick
let _iceT = 0;
const _iceKey = (x, y, z) => x + ',' + y + ',' + z;
/* 0.8322, the cost: the heat scans read blocks through one cached chunk (_iceBlk, forgotten at each call's start)
   rather than getBlock's string key per cell; a biome is read once per 8x8 blocks and kept (_iceKindAt), not 256
   times a chunk; heat is only looked for where some light source is in the chunk or beside it (_heatAround); and a
   chunk arriving from the generator is frozen straight in its data (iceDressChunk), not by a setBlock (an edit and a
   re-mesh) per cell on its first season pass. */
let _ibCx = 1e9, _ibCz = 1e9, _ibData = null;
const _iceBlkReset = () => { _ibCx = _ibCz = 1e9; _ibData = null; };
function _iceBlk(x, y, z) {
  if (y < 0 || y > 199) return 0;
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  if (cx !== _ibCx || cz !== _ibCz) { const c = getChunk(cx, cz); _ibCx = cx; _ibCz = cz; _ibData = c && c.data; }
  return _ibData ? _ibData[(x & 15) + ((z & 15) << 4) + (y << 8)] : 0;
}
function _heatReach(v) {
  const id = v & 255;
  if (id === B.FURNACE) return blockLightOf(v) > 0 ? ICE_FURNACE_R : 0;
  return ICE_HEAT_R[id] || 0;
}
// any light source in this chunk or the eight round it? (heat is always one, and reaches at most 9 < 16 blocks)
function _heatAround(cx, cz) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (glowByChunk.has((cx + dx) + ',' + (cz + dz))) return true;
  return false;
}
// is a placed heat source in reach of this cell? (every one of them gives light, so the light index finds them)
function iceHeatNear(x, y, z) {
  let hot = false;
  forEachGlowNear(x, z, ICE_REACH, (gx, gy, gz) => {
    const r = _heatReach(getBlock(gx, gy, gz));
    if (r && Math.abs(gx - x) <= r && Math.abs(gy - y) <= r && Math.abs(gz - z) <= r) { hot = true; return false; }
  });
  return hot;
}
const _queueIce = (x, y, z) => { const k = _iceKey(x, y, z); if (!iceMelt.has(k)) iceMelt.set(k, 0); };
// heat just appeared at (x, y, z): every ice in its reach starts to melt
function iceHeatPlaced(x, y, z, v) {
  const r = _heatReach(v);
  if (!r) return;
  _iceBlkReset();
  for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
    if ((_iceBlk(x + dx, y + dy, z + dz) & 255) === B.ICE) _queueIce(x + dx, y + dy, z + dz);
}
// ice just placed: if heat is already in reach, it melts (the season pass checks that itself: _iceSetting)
let _iceSetting = false;
function iceQueueIfHot(x, y, z) {
  if (!_iceSetting && _heatAround(Math.floor(x / 16), Math.floor(z / 16)) && iceHeatNear(x, y, z)) _queueIce(x, y, z);
}
// a player holding a lit torch at (px, py, pz), feet: the ice within a block of them warms (from tickStats, 54)
function iceWarmHeld(px, py, pz) {
  _iceBlkReset();
  for (let dy = -1; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
    if ((_iceBlk(px + dx, py + dy, pz + dz) & 255) === B.ICE) { _queueIce(px + dx, py + dy, pz + dz); _iceHeld.add(_iceKey(px + dx, py + dy, pz + dz)); }
}
function updateIceMelt(dt) {
  _iceT += dt;
  if (_iceT < 1) return;
  const step = Math.min(5, _iceT);
  _iceT = 0;
  for (const [k, t] of iceMelt) {
    const [x, y, z] = k.split(',').map(Number);
    if ((getBlock(x, y, z) & 255) !== B.ICE) { iceMelt.delete(k); continue; }
    if (!_iceHeld.has(k) && !iceHeatNear(x, y, z)) { iceMelt.delete(k); continue; }   // the heat went: it sets again
    if (t + step < ICE_MELT_S) { iceMelt.set(k, t + step); continue; }
    iceMelt.delete(k);
    // ice that froze from water melts back into it; ice someone put down just melts away (0.833)
    setBlock(x, y, z, ((getBlock(x, y, z) >> 8) & 255) === ICE_FROM_WATER ? B.WATER : B.AIR);
    if (typeof fxSnowMelt === 'function') fxSnowMelt(x, y, z);
  }
  _iceHeld.clear();
}
// a column's kind for ice, read once per 8x8 blocks and kept: 1 a snow biome, 2 a desert, 0 the rest
const _iceKinds = new Map();
function _iceKindAt(x, z) {
  const k = (x >> 3) + ',' + (z >> 3);
  let v = _iceKinds.get(k);
  if (v === undefined) {
    const b = typeof mainGen !== 'undefined' && mainGen ? mainGen.biomeAt((x & ~7) + 4, (z & ~7) + 4) : '';
    v = /Snow/.test(b) ? 1 : /Desert|Red Sand/.test(b) ? 2 : 0;
    if (_iceKinds.size > 65536) _iceKinds.clear();
    _iceKinds.set(k, v);
  }
  return v;
}
// should open water at (x, y, z) be ice now? a snow biome's always; elsewhere but a desert, a share more each day of
// winter's first third
const _iceFreezes = (x, y, z, kind, d, season) =>
  kind === 1 || (kind === 0 && season === 3 && sHash(x, y, z, 40 + d.year * 16) < d.progress * 3);
// the top non-air cell of a chunk column (open sky above it), as its data index, or -1
function _iceTop(data, li) {
  let y = 198;
  while (y > 1 && !data[li + (y << 8)]) y--;
  return y > 1 ? li + (y << 8) : -1;
}
/* A chunk just in from the generator (finishChunkGen, 11-chunks.js, after its edits and its lights are in): its open
   water is frozen as the season says, straight in the data — no edits, no re-mesh, no light work (ice and water both
   let light through). A reload dresses it again the same way, so nothing needs saving. */
function iceDressChunk(c) {
  if (typeof menuScene !== 'undefined' && menuScene) return;
  const d = seasonsOn() ? gameDate() : null, season = d ? d.season : 1;
  const data = c.data, wx0 = c.cx * 16, wz0 = c.cz * 16, heat = _heatAround(c.cx, c.cz);
  for (let col = 0; col < 256; col++) {
    const lx = col & 15, lz = col >> 4, i = _iceTop(data, lx + (lz << 4));
    if (i < 0 || (data[i] & 255) !== B.WATER) continue;
    const x = wx0 + lx, z = wz0 + lz, y = i >> 8;
    if (!_iceFreezes(x, y, z, _iceKindAt(x, z), d, season) || (heat && iceHeatNear(x, y, z))) continue;
    data[i] = B.ICE | (ICE_FROM_WATER << 8);                     // ice that was water (0.833)
  }
}
function _iceChunk(c) {
  const d = seasonsOn() ? gameDate() : null, season = d ? d.season : 1;
  const data = c.data, wx0 = c.cx * 16, wz0 = c.cz * 16, heat = _heatAround(c.cx, c.cz);
  const day = !(typeof isDarkTime === 'function' && isDarkTime());
  for (let col = 0; col < 256; col++) {
    const lx = col & 15, lz = col >> 4, i = _iceTop(data, lx + (lz << 4));
    if (i < 0) continue;
    const id = data[i] & 255;
    if (id !== B.WATER && id !== B.ICE) continue;
    const x = wx0 + lx, z = wz0 + lz, y = i >> 8, kind = _iceKindAt(x, z);
    if (id === B.WATER) {
      if (!_iceFreezes(x, y, z, kind, d, season) || (heat && iceHeatNear(x, y, z))) continue;
      if (_seasonOps >= SEASON_OPS_PER_FRAME) return;
      _seasonOps++;
      _iceSetting = true; setBlock(x, y, z, B.ICE | (ICE_FROM_WATER << 8)); _iceSetting = false;   // from water (0.833)
    } else if (heat && iceHeatNear(x, y, z)) {
      _queueIce(x, y, z);                                          // heat beside it from before a reload: it melts
    } else if (kind !== 1 && season !== 3 && day && ((data[i] >> 8) & 255) === ICE_FROM_WATER) {   // only ice that was water (0.833)
      // out of winter, by day: seasonal ice melts, a share more each day of spring's first third (at once later on)
      if (season === 0 && sHash(x, y, z, 41 + d.year * 16) >= d.progress * 3) continue;
      if (_seasonOps >= SEASON_OPS_PER_FRAME) return;
      _seasonOps++;
      setBlock(x, y, z, B.WATER);
    }
  }
}

function clearSeasonState() { SEASON_MEM.clear(); wheatGrow.clear(); shroomGrow.clear(); caneGrow.clear(); _regionKind.clear(); _regionCold.clear(); iceMelt.clear(); _iceHeld.clear(); _iceKinds.clear(); _seasonKeys = []; }

/* ---- the wind the renderer bends plants with: player one's (0.81) ---- */
function updateWindUniforms() {
  const p = typeof PLAYERS !== 'undefined' && PLAYERS[0] ? PLAYERS[0] : (typeof player !== 'undefined' ? player : null);
  if (!p || !sharedUniforms.uWindDir) return;
  const w = weatherAt(p.pos.x, p.pos.z), [wx, wz] = windVector(w.dir);
  sharedUniforms.uWindDir.value.set(wx, wz);
  sharedUniforms.uWindSpeed.value = w.speed;     // ground speed; the shader adds height per vertex (0.812)
}
