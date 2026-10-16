'use strict';
/* seasons/ice.js: ice. Water freezing by climate and season, thawing, and melting near heat. */

/* ---- ice ----
   FREEZING. Each chunk's season pass looks at the top of every column under the open sky: water there freezes over
   (only that top cell) in a snow biome at any time, and in winter everywhere but a desert — a little more of it each
   day through the first third of winter. In spring (and any warmer time, a world with seasons off too) that seasonal
   ice melts back, by day only, through the first third of spring. A snow biome's ice stays, and so does ice a player
   put down. Nothing freezes near heat.
   HEAT melts ice in ICE_MELT_S: a torch within 1 block (placed, or held by a player standing that close), a lit
   furnace within 3, fire 5, lava 9 (cubes round the source). Ice in reach is found when the heat appears (a setBlock
   hook, iceHeatPlaced in chunks/chunks.js), when ice is placed (iceQueueIfHot) and twice a second round a torch in hand. */
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
  if (y < 0 || y > WORLD_TOP) return 0;
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
// a player holding a lit torch at (px, py, pz), feet: the ice within a block of them warms (from tickStats, player/stats.js)
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
    // ice that froze from water melts back into it; ice someone put down just melts away
    setBlock(x, y, z, ((getBlock(x, y, z) >> 8) & 255) === ICE_FROM_WATER ? B.WATER : B.AIR);
    if (typeof fxSnowMelt === 'function') fxSnowMelt(x, y, z);
  }
  _iceHeld.clear();
}
/* A column's kind for ice: 1 the snow's land, lakes, rivers and shallows, 3 the snow's open sea, 2 a desert, 0 the rest.
   By the CLIMATE since 0.8351, not the biome's name: the water of the snow is named River, Lake, Ocean or Ice Spikes,
   so it never froze. ICE_SNOW_FROM reaches a little past the snow's edge.
   Smooth since 0.8352: one climate per 8x8 blocks made the ice end in straight lines along that grid. The climate is
   now read at the corners of the 8-block lattice (kept in _iceKinds) and eased between them for each column, the edge
   itself wanders by ICE_EDGE_WOBBLE on a smooth noise, and sea or shallows is the column's own water depth. */
const ICE_SNOW_FROM = 0.3, ICE_EDGE_WOBBLE = 0.12, ICE_SEA_DEPTH = 4;
const _iceKinds = new Map();                 // "gx,gz" of a lattice corner -> [snow, hot, inland 0/1]
function _iceLat(gx, gz) {
  const k = gx + ',' + gz;
  let v = _iceKinds.get(k);
  if (v === undefined) {
    const c = typeof mainGen !== 'undefined' && mainGen && mainGen.climateAt ? mainGen.climateAt(gx * 8, gz * 8) : null;
    v = c ? [c.snow || 0, c.hot || 0, c.inland ? 1 : 0] : [0, 0, 0];
    if (_iceKinds.size > 65536) _iceKinds.clear();
    _iceKinds.set(k, v);
  }
  return v;
}
// a smooth value noise in 0..1 on a `cell`-block lattice (the sea's holes, the ice's edge)
function _iceNoise(x, z, cell, salt) {
  const gx = Math.floor(x / cell), gz = Math.floor(z / cell), fx = x / cell - gx, fz = z / cell - gz;
  const h = (a, b) => sHash(a, 0, b, salt);
  return (h(gx, gz) * (1 - fx) + h(gx + 1, gz) * fx) * (1 - fz) + (h(gx, gz + 1) * (1 - fx) + h(gx + 1, gz + 1) * fx) * fz;
}
// `depth`: how deep the water is under this column's top (4 = deep enough to be the open sea)
function _iceKindAt(x, z, depth = 1) {
  const gx = Math.floor(x / 8), gz = Math.floor(z / 8), fx = (x - gx * 8) / 8, fz = (z - gz * 8) / 8;
  const a = _iceLat(gx, gz), b = _iceLat(gx + 1, gz), c = _iceLat(gx, gz + 1), d = _iceLat(gx + 1, gz + 1);
  const mix = (k) => (a[k] * (1 - fx) + b[k] * fx) * (1 - fz) + (c[k] * (1 - fx) + d[k] * fx) * fz;
  if (mix(1) > 0.5) return 2;
  if (mix(0) <= ICE_SNOW_FROM + (_iceNoise(x, z, 7, 78) - 0.5) * ICE_EDGE_WOBBLE) return 0;
  return depth >= ICE_SEA_DEPTH && mix(2) < 0.5 ? 3 : 1;
}
// how deep the water is from cell index i down (the top cell counts: it is water, or ice that was), up to ICE_SEA_DEPTH
function _iceDepth(data, i) {
  let n = 1;
  for (let j = i - 256; n < ICE_SEA_DEPTH && j >= 0 && (data[j] & 255) === B.WATER; j -= 256) n++;
  return n;
}
/* The snow's sea is ice with open water in it: ICE_HOLES of it left open, in blobs of a few blocks — a smooth
   value noise on an ICE_HOLE_CELL lattice — where a seal could come up, and where the polar bears hunt. */
const ICE_HOLES = 0.28, ICE_HOLE_CELL = 5;
const _iceHole = (x, z) => _iceNoise(x, z, ICE_HOLE_CELL, 77) < ICE_HOLES;
// should open water at (x, y, z) be ice now? the snow's always (its sea bar the holes); elsewhere but a desert, a share
// more each day of winter's first third
const _iceFreezes = (x, y, z, kind, d, season) =>
  kind === 1 || (kind === 3 && !_iceHole(x, z)) || (kind === 0 && season === 3 && sHash(x, y, z, 40 + d.year * 16) < d.progress * 3);
// the top non-air cell of a chunk column (open sky above it), as its data index, or -1
function _iceTop(data, li) {
  let y = WORLD_TOP - 1;
  while (y > 1 && !data[li + (y << 8)]) y--;
  return y > 1 ? li + (y << 8) : -1;
}
/* A chunk just in from the generator (finishChunkGen, chunks/chunks.js, after its edits and its lights are in): its open
   water is frozen as the season says, straight in the data — no edits, no re-mesh, no light work (ice and water both
   let light through). A reload dresses it again the same way, so nothing needs saving. */
// returns how many cells it froze (a chunk with none keeps the sky light its worker gave it, chunks/chunks.js)
function iceDressChunk(c) {
  if (typeof menuScene !== 'undefined' && menuScene) return 0;
  const d = seasonsOn() ? gameDate() : null, season = d ? d.season : 1;
  const data = c.data, wx0 = c.cx * 16, wz0 = c.cz * 16, heat = _heatAround(c.cx, c.cz);
  let edges = 0, froze = 0;                                       // which borders it froze along: -X 1, +X 2, -Z 4, +Z 8
  for (let col = 0; col < 256; col++) {
    const lx = col & 15, lz = col >> 4, i = _iceTop(data, lx + (lz << 4));
    // still water only: flowing water frozen would thaw into a source, and water is finite
    if (i < 0 || (data[i] & 255) !== B.WATER || ((data[i] >> 8) & 7)) continue;
    const x = wx0 + lx, z = wz0 + lz, y = i >> 8;
    if (!_iceFreezes(x, y, z, _iceKindAt(x, z, _iceDepth(data, i)), d, season) || (heat && iceHeatNear(x, y, z))) continue;
    data[i] = B.ICE | (ICE_FROM_WATER << 8);                     // ice that was water
    froze++;
    edges |= (lx === 0 ? 1 : 0) | (lx === 15 ? 2 : 0) | (lz === 0 ? 4 : 0) | (lz === 15 ? 8 : 0);
  }
  /* A neighbour that meshed while this chunk was still water drew its ice's sides against that water, and kept them once
     it froze: a line of see-through faces along every chunk border on a frozen sea. It meshes again. */
  if (edges & 1) markDirty(getChunk(c.cx - 1, c.cz));
  if (edges & 2) markDirty(getChunk(c.cx + 1, c.cz));
  if (edges & 4) markDirty(getChunk(c.cx, c.cz - 1));
  if (edges & 8) markDirty(getChunk(c.cx, c.cz + 1));
  return froze;
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
    const x = wx0 + lx, z = wz0 + lz, y = i >> 8, kind = _iceKindAt(x, z, _iceDepth(data, i));
    if (id === B.WATER) {
      if ((data[i] >> 8) & 7) continue;                            // flowing water never freezes (iceDressChunk)
      if (!_iceFreezes(x, y, z, kind, d, season) || (heat && iceHeatNear(x, y, z))) continue;
      if (_seasonOps >= SEASON_OPS_PER_FRAME) return;
      _seasonOps++;
      _iceSetting = true; setBlock(x, y, z, B.ICE | (ICE_FROM_WATER << 8)); _iceSetting = false;   // from water
    } else if (heat && iceHeatNear(x, y, z)) {
      _queueIce(x, y, z);                                          // heat beside it from before a reload: it melts
    } else if (kind !== 1 && kind !== 3 && season !== 3 && day && ((data[i] >> 8) & 255) === ICE_FROM_WATER) {   // only ice that was water; the snow's sea ice stays
      // out of winter, by day: seasonal ice melts, a share more each day of spring's first third (at once later on)
      if (season === 0 && sHash(x, y, z, 41 + d.year * 16) >= d.progress * 3) continue;
      if (_seasonOps >= SEASON_OPS_PER_FRAME) return;
      _seasonOps++;
      setBlock(x, y, z, B.WATER);
    }
  }
}
