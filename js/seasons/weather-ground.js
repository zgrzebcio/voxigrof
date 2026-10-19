'use strict';
/* seasons/weather-ground.js: what weather leaves on the ground. Snow laid and washed away, salt on shores, the
   snowline by height. */

// the top cell of a column near height y0, if open to the sky: its y, else null
function _openTop(x, z, y0) {
  for (let y = Math.min(WORLD_TOP - 1, y0 + 24), lo = Math.max(1, y0 - 24); y >= lo; y--) {
    if (!getBlock(x, y, z)) continue;
    return getSkyWorld(x, y + 1, z) >= 15 ? y : null;
  }
  return null;
}
/* Never on what you work at: a bench, a mortar, a furnace or a chest needs its top clear, and a layer of snow
   on it stopped it working until it was swept off. Falling snow and the snowline's cover both leave them bare. */
const NO_SNOW_ON = new Set([B.CRAFTING_BENCH, B.MORTAR, B.FURNACE, B.CHEST, B.METAL_CHEST]);
function _laySnow(x, y, z, v, ids, max) {
  if (ids) { if (ids.length < Math.min(max, LAYER_MAX - 1)) setLayerStack(x, y, z, [...ids, B.SNOW]); return; }
  if (NO_SNOW_ON.has(v & 255)) return;
  if (y >= WORLD_TOP - 1 || !CORE.solidVal(v) || CORE.shapeOfVal(v) || !PROPS[v & 255]?.opaque) return;   // whole, solid, opaque tops only
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
    if (pr.rain > 0.05 && ids && _WXG_WASHED.has(ids[ids.length - 1] & 255)) {
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

/* SNOWLINE: above it the ground keeps a cover of snow, in every biome. It follows the sun's year
   (07-sky.js), so it sits high in summer and comes down the mountains in winter, and it is ragged by a block or
   two either way. The season sweep lays the snow (_snowlineChunk); snow melt leaves anything above it alone
   (woods/felling.js), and below it the snow melts away as any snow outside a cold biome does. */
const SNOWLINE_SUMMER = 176, SNOWLINE_WINTER = 134;
function snowlineY(x, z) {
  const s = typeof sunDeclination === 'function' ? sunDeclination() / SUN_DECL_MAX : 1;   // -1 midwinter .. 1 midsummer
  return SNOWLINE_WINTER + (SNOWLINE_SUMMER - SNOWLINE_WINTER) * (s + 1) / 2
       + 2 * Math.sin(x * 0.11 + z * 0.07) + 1.5 * Math.sin(z * 0.13 - x * 0.05) + _snowBareLift(x, z);
}
/* Bare mountains: about one in ten keeps no snow. A slow patchwork of the world's own (corners of a 384-block
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
    let y = WORLD_TOP;
    while (y > line0 && !data[li + (y << 8)]) y--;
    if (y <= line0) continue;
    const top = data[li + (y << 8)], x = wx0 + lx, z = wz0 + lz, line = snowlineY(x, z);
    if (y < line || y >= WORLD_TOP) continue;
    // on bare, solid, open ground only: not on leaves, snow already there, sand, or a plant
    const tid = top & 255;
    if (!CORE.solidVal(top) || CORE.layerCount(top) || tid === B.SNOW || tid === B.SAND || tid === B.RED_SAND || tid === B.PINK_SAND) continue;
    if (NO_SNOW_ON.has(tid)) continue;                             // a station, a furnace, a chest
    if (_skyAt(c, li + ((y + 1) << 8)) < 15) continue;
    if (_seasonOps >= SEASON_OPS_PER_FRAME) { c._snowCol = col; return false; }
    _seasonOps++;
    setBlock(x, y + 1, z, CORE.layerVal(B.SNOW, 1 + Math.min(3, Math.floor((y - line) / 6))));
  }
  c._snowCol = 0;
  return true;
}
