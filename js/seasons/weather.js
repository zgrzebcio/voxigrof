'use strict';
/* seasons/weather.js: weather and wind by region. What the sky does over a stretch of days, the weather at a place,
   and the wind on a walker and on plants. */

/* ================================== weather ================================== */
const WEATHER_TYPES = ['clear', 'sunny', 'cloudy', 'windy', 'rainy', 'darky', 'storm', 'foggy', 'blizzard'];   // blizzard 0.83
/* The weather by season: fair skies — clear, sunny, cloudy — are the usual thing all year, and every other
   weather is rare, each season leaning its own way. Spring: rain, fog and dark skies. Summer: sun above all, then
   storms (thunder), rain and strong wind (a sandstorm in a desert). Autumn: rain, dark skies, storms (the most hail,
   HAIL_BY_SEASON), wind and fog. Winter: cloud, and rain that falls as snow (weatherName). Sunny and clear days give
   heatstroke (player/stats.js); a desert's strong wind is a sandstorm (sandstormAt).
   Each row is out of 100, in WEATHER_TYPES order.
   BLIZZARD: a cold region's own — the colder (regionCold) the more often, most in winter and autumn — and
   rare anywhere else in winter (never in a desert). Wind, white-out fog, heavy snow that piles up, bitter cold. */
const WEATHER_BY_SEASON = [
  //  clear sunny cloudy windy rainy darky storm foggy blizzard
  [    24,   18,   26,    3,   10,    7,    2,   10,   0 ],   // spring
  [    24,   40,   14,    5,    6,    2,    8,    1,   0 ],   // summer
  [    20,   12,   28,    6,   12,    9,    6,    7,   0 ],   // autumn
  [    22,   10,   36,    4,   16,    5,    1,    6,   1 ],   // winter
];
const BLIZZARD_COLD = [6, 2, 8, 14];            // added in a region by season, times its cold to the 1.5
/* Wind speed range per weather, km/h (scaled down in 0.8121): under 10 is a light breeze, about 30 an ordinary
   windy day, past 60 very strong — only a storm (or a storm high over the sea) gets there. */
const WIND_RANGE = { clear: [5, 15], sunny: [0, 8], cloudy: [8, 20], windy: [25, 42], rainy: [12, 30],
                     darky: [10, 25], storm: [45, 65], foggy: [0, 6], blizzard: [40, 60] };
const OCEAN_WIND = 1.3;                          // open sea: nothing in the wind's way, 30% stronger
// a region's biome, read once at its centre: 'warm' (deserts), 'snow', 'ocean', or ''
const _regionKind = new Map();
function regionKind(rx, rz) {
  const k = rx + ',' + rz;
  let v = _regionKind.get(k);
  if (v == null) {
    const b = typeof mainGen !== 'undefined' && mainGen ? mainGen.biomeAt(rx * REGION_BLOCKS + REGION_BLOCKS / 2, rz * REGION_BLOCKS + REGION_BLOCKS / 2) : '';
    v = /Desert|Red Sand|Oasis/.test(b) ? 'warm' : /Snow/.test(b) ? 'snow' : /Ocean/.test(b) ? 'ocean' : '';   // the Deep Desert and the Oasis too
    _regionKind.set(k, v);
  }
  return v;
}
/* How cold a region is, 0..1, read once at its centre: on the climate ladder its air from 0°C down to -24°C
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
// the title backdrop has no weather: always clear skies, a light breeze, fair-weather clouds, no fog
// the title's backdrop, or a world made with its weather off: always clear, no fog, sand, hail, rain or snow
const _titleCalm = () => (typeof menuScene !== 'undefined' && !!menuScene)
  || (typeof currentWorld !== 'undefined' && !!currentWorld && currentWorld.weather === false);
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
/* Does a stretch's rain fall as snow? Always in a snow region; in winter 95% of the time anywhere but a
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
/* Wind is stronger up high: nothing below y 60, +5 km/h at y 100 (about sea level), +9 at y 150,
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
/* BLENDED between regions. A position takes the four region centres around it, weighted by how near
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
   and climbs 2.5% a km/h — 13.5% at 30 km/h — up to 35%. `mx, mz` is the step about to be taken. */
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
/* How much of the wind reaches someone, 0..1. Indoors — no open sky at the head — none. Outside, a
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
/* A player standing still in a strong wind is pushed along by it: the same push, as a share of a
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

/* ---- the wind the renderer bends plants with: player one's ---- */
function updateWindUniforms() {
  const p = typeof PLAYERS !== 'undefined' && PLAYERS[0] ? PLAYERS[0] : (typeof player !== 'undefined' ? player : null);
  if (!p || !sharedUniforms.uWindDir) return;
  const w = weatherAt(p.pos.x, p.pos.z), [wx, wz] = windVector(w.dir);
  sharedUniforms.uWindDir.value.set(wx, wz);
  sharedUniforms.uWindSpeed.value = w.speed;     // ground speed; the shader adds height per vertex
}
