'use strict';
/* seasons/seasons.js: the seasons on the land. The title screen's season, the sweep that dresses chunks for the time
   of year (leaf fall, plants, snow), and its place in the save. */

/* ================================== the title's season ==================================
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
    let y = WORLD_TOP - 1;
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
const SEASON_LEAVES = new Set(woodBlocks('leaves', w => w.seasonal));    // the woods marked `seasonal` (woods/woods.js): oak, birch; spruce keeps its needles
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
  if (!seasonsOn()) { _shroomChunk(c); _iceChunk(c); return _snowlineChunk(c); }   // always July: the high snow, mushrooms, ice
  const d = gameDate(), k = key(c.cx, c.cz), wx0 = c.cx * 16, wz0 = c.cz * 16;
  if (d.season >= 2) {
    const level = d.season === 3 ? 1.01 : d.progress;           // how much of the fall has happened
    const data = c.data;
    // the worker's list of the cells worth a look, or every cell; `q` its place in it
    /* the place was named `k` until now, hiding the chunk key `k` above: what fell was remembered under the place
       number instead of the chunk, so spring could not find it to put back */
    const cand = c._scanCand, n = cand ? cand.length : data.length;
    for (let q = c._seasonScan || 0; q < n; q++) {
      const i = cand ? cand[q] : q, v = data[i], id = v & 255;
      if (!(SEASON_LEAVES.has(id) || SEASON_PLANTS.has(id)) || CORE.layerCount(v)) continue;
      if (_skyAt(c, i) === 0) continue;                           // underground: no seasons there
      const x = wx0 + (i & 15), y = i >> 8, z = wz0 + ((i >> 4) & 15);
      if (sHash(x, y, z, SEASON_LEAVES.has(id) ? 1 : 2) >= level) continue;
      if (_seasonOps >= SEASON_OPS_PER_FRAME) { c._seasonScan = q; return false; }
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
  _shroomChunk(c);                                               // mushrooms, every season
  _iceChunk(c);                                                  // water freezing and thawing
  return _snowlineChunk(c);                                      // and the snowline, every season
}
/* per frame: a couple of chunks inside the simulation radius whose hour has come round (updateSeasonScan), and the
   growing and the weather on the ground (updateSeasonGrowth). with the fixed tick (SIM_FIXED) the growing
   steps in the tick and the scanning stays a frame's background work; updateSeasons does both, as before. */
let _seasonKeys = [], _seasonCursor = 0, _seasonListT = 0;
function updateSeasons(dt) {
  updateSeasonScan(dt);
  updateSeasonGrowth(dt);
}
// `ground` false: the weather on the ground sits this tick out (land is waiting near a player: simTick, 22)
function updateSeasonGrowth(dt, ground = true) {
  if (typeof menuScene !== 'undefined' && menuScene) return;
  if (typeof currentWorld !== 'undefined' && !currentWorld) return;
  updateWheatGrow(dt);
  updateShroomGrow(dt);
  updateCaneGrow(dt);
  if (ground) updateWeatherGround(dt);                           // rain washes, snow lays, salt grows
  updateIceMelt(dt);                                             // ice by heat
  if (typeof updateBurns === 'function') updateBurns(dt);        // torches and glow blocks burning out (blocks/torches.js)
}
function updateSeasonScan(dt) {
  if (typeof menuScene !== 'undefined' && menuScene) return;
  if (typeof currentWorld !== 'undefined' && !currentWorld) return;
  /* Land is waiting near a player (streamBehind in chunks/chunks.js): the season's look at each chunk can wait an
     hour of the world's time, a hole in the world cannot — these passes take the same main thread and the same
     workers the new chunks need. */
  if (typeof streamBehind !== 'undefined' && streamBehind) return;
  _seasonOps = 0;
  _seasonListT -= dt;
  if (_seasonListT <= 0 || _seasonCursor >= _seasonKeys.length) { _seasonKeys = [...chunks.keys()]; _seasonCursor = 0; _seasonListT = 5; }
  const nowH = worldClockDays() * 24, season = gameDate().season;
  let scans = 0, asks = 0;
  /* 0.8382 (SEASON_WORKER_SCAN in 00-config): a chunk whose hour has come is first handed to a
     worker, which lists the cells worth a look (leaves, the season's plants, wild mushrooms, cane: seasonScanIds);
     when the list is back (seasonScanResult) the chunk takes its turn here, looking at those cells only. Everything
     done to them is decided here as before; a cell changed meanwhile is simply judged as it is now. */
  while (_seasonReady.length && scans < SEASON_SCANS_PER_FRAME && _seasonOps < SEASON_OPS_PER_FRAME) {
    const c = _seasonReady[0];
    if (!c.data || chunks.get(key(c.cx, c.cz)) !== c || !c._scanCand) { c._scanCand = null; _seasonReady.shift(); continue; }
    scans++;
    if (_seasonChunk(c)) { c._seasonH = nowH; c._seasonS = season; c._scanCand = null; c._seasonScan = 0; _seasonReady.shift(); }
    else break;                                                   // out of budget: same chunk next frame
  }
  while (_seasonCursor < _seasonKeys.length && scans < SEASON_SCANS_PER_FRAME && _seasonOps < SEASON_OPS_PER_FRAME) {
    const c = chunks.get(_seasonKeys[_seasonCursor]);
    if (!c || !c.data || !c.lit || !inSimRangeChunk(c.cx, c.cz)) { _seasonCursor++; continue; }
    if (c._seasonH != null && nowH - c._seasonH < SEASON_CHUNK_EVERY_H && c._seasonS === season) { _seasonCursor++; continue; }
    if (c._scanPending || c._scanCand) { _seasonCursor++; continue; }   // with a worker, or waiting its turn above
    if (SEASON_WORKER_SCAN && typeof postScanJob === 'function' && !c._seasonScan) {
      if (asks >= SEASON_ASKS_PER_FRAME) break;
      asks++;
      c._scanPending = true;
      // shared memory (C10): the worker reads the chunk where it lies, nothing copied
      if (c.data.buffer instanceof (globalThis.SharedArrayBuffer || Array))
        postScanJob({ type: 'scan', cx: c.cx, cz: c.cz, data: c.data.buffer, want: seasonScanIds() }, []);
      else {
        const copy = c.data.slice();
        postScanJob({ type: 'scan', cx: c.cx, cz: c.cz, data: copy.buffer, want: seasonScanIds() }, [copy.buffer]);
      }
      _seasonCursor++;
      continue;
    }
    scans++;
    if (_seasonChunk(c)) { c._seasonH = nowH; c._seasonS = season; _seasonCursor++; }
    else break;                                                   // out of budget: same chunk next frame
  }
}
// the cells a season pass looks at, by id, for the worker's scan; built at first use, as SHROOM_WILD comes below
let _seasonScanIds = null;
const seasonScanIds = () => {
  if (_seasonScanIds) return _seasonScanIds;
  _seasonScanIds = new Uint8Array(256);
  for (const id of [...SEASON_LEAVES, ...SEASON_PLANTS, ...SHROOM_WILD, B.SUGAR_CANE]) _seasonScanIds[id] = 1;
  return _seasonScanIds;
};
const SEASON_ASKS_PER_FRAME = 4;             // chunks a frame may hand to the workers
const _seasonReady = [];                     // chunks whose list is back, in order
// a worker's list for a chunk (onWorkerMessage, chunks/chunks.js)
function seasonScanResult(c, m) {
  if (!c) return;
  c._scanPending = false;
  if (chunks.get(key(c.cx, c.cz)) !== c || !c.data) return;
  c._scanCand = new Int32Array(m.cand);
  c._seasonScan = 0;
  _seasonReady.push(c);
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

function clearSeasonState() { SEASON_MEM.clear(); wheatGrow.clear(); shroomGrow.clear(); caneGrow.clear(); _regionKind.clear(); _regionCold.clear(); iceMelt.clear(); _iceHeld.clear(); _iceKinds.clear(); _seasonKeys = []; }
