'use strict';
/* seasons/weather-sky.js: what the weather fills the air with. Fog and rainbows, sandstorms, hail, and how much rain
   or snow falls at a place (precipAt). */

/* ================================== fog and rainbows ==================================
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
  if (_titleCalm()) return { dense: 0, light: 0, bow: 0 };        // no fog or rainbow on the title
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

/* SANDSTORM: a desert region's strong wind (weatherName calls it a sandstorm) fills the air with sand. Its
   share at a world position, 0..1, blended between region centres like mistAt, and thinner where the ground under
   it is less desert (an edge over grass: 40%). Whoever reads it eases it in (30-60 s): applyMist (52-clouds.js) for
   the sight, tickSandstorm (player/stats.js) for the body, _fxSandstorm (49-particles.js) for the sand. */
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

/* HAIL: some storms bring hail, rolled once per storm like the rest of the weather. The share at a position,
   blended between region centres like weatherAt; 53-storms.js does the rest. How many by season (a flat 35%
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

/* RAIN AND SNOW: how much falls at a world position, { rain, snow, blizzard } each 0..1, blended between region
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

/* WEATHER ON THE GROUND. Every WXG_TICK seconds, round one seat (sweepOriginPlayer), a few random columns
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
