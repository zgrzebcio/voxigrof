'use strict';
/* entities/boss-lair.js: the snow castle, the Frozen King's lair. Where one stands in a world, and placing it. */

/* ==================================== the snow castle: his lair ====================================
   structures/snow_castle.json, built by hand. It is not a lone prefab nor a settlement: there is at most one in every
   LAIR.CELL square of the world, never two within LAIR.APART blocks, and only in the open Coldest Deep Snow (not its
   Forest; new worlds, biomeRev 20). Where they stand is worked out from the seed alone, so the last quest's marker can
   point at the nearest one before its land was ever loaded:
     1. a cell's candidate spots: a grid every LAIR.STEP blocks where the open Coldest Deep Snow's own fields say yes
        (rimeOpenAt, microseconds) at the castle's middle and round its footprint, in a hashed order;
     2. each candidate in turn is checked by a worker (job 'probe': biomeAt and heightAt, milliseconds, off this thread):
        the real biome name all round, and ground within LAIR.SLOPE; the first that passes is the cell's site;
     3. a site stands only if no neighbouring cell's site lies within LAIR.APART with a lower roll.
   Once all the land under a site has loaded, the castle is queued (34's placement queue, embedded: hills cut out of
   it, pillars under it) and a lair is recorded with the world (`bossLairs`). Its markers: the furnace is the gate (air,
   and a path cut out to it), the bedrock is where the king appears (air); oak chests become rime wood, snow carpets snow
   blocks, unlit torches and spent glow crystal lit (spent glowstone is meant so and stays), and none of its lights
   ever burn out. While the lair is not defeated and its hall is simulated, a king stands in it; he is never saved, so a
   reload brings him back the same way. Once killed, never again. */
const LAIR = { PREFAB: 'snow_castle', BOSS: 'frozen_king', BIOME: 'Coldest Deep Snow',
               CELL: 4096, APART: 4000, STEP: 128, MARGIN: 8, SLOPE: 10, PROBES: 12, RING: 2, SALT: 7771, PATH: 10 };
const _lairCells = new Map();      // "gx,gz" -> { gx, gz, state: 'cands' | 'probe' | 'done', cands, k, site, rank }
const BOSS_LAIRS = new Map();      // "gx,gz" -> the saved lair: { key, kind, ox, oy, oz, bx, by, bz, placed, defeated }
const _lairProbes = new Map();     // probe id -> the cell waiting on it
let _lairProbeN = 0, _castleCache = null;

/* The castle's chests: every one rolls this, whatever the JSON says (the file is saved again from a structure
   block now and then, and that writes the plain table). Better than any other chest: food for a long cold trip (stew
   above all: it is in four times; raw meat and fish), metal (bronze, ingots, nuggets of every kind up to 6), light
   (glow crystal and dust), what is scarce out there (rime planks; leather, which keeps the cold out, and cloth, which is
   for the heat but goes into many recipes), now and then a leather armour piece (cloth until then, the wrong
   one for the cold), a golden apple, a saddle or a backpack, and in about one chest in nine a single gem (`once`: never
   two, 34 rollLootInto). Its chests pay LOOT_XP x CASTLE_LOOT_XP_MUL for the first open. Rolled 10,000 times: 5.4 stacks
   a chest, 1 stew, a gem in 11% (about 1.4 a castle), a leather armour piece 18%, a golden apple 4.5%. */
const _gem = (id) => ({ id, min: 1, max: 1, chance: 0.06, once: 'gem' });
const _leather = (id) => ({ id, min: 1, max: 1, chance: 0.1, once: 'armour' });
const CASTLE_LOOT = {
  name: 'snow castle', rolls: [7, 11], xp: [25, 50], minKinds: 5,
  entries: [
    _gem('DIAMOND'), _gem('EMERALD'), _gem('RUBY'), _gem('SAPPHIRE'), _gem('TOPAZ'),
    { id: 'BRONZE_INGOT', min: 1, max: 3, chance: 0.5 },
    { id: 'IRON_NUGGET', min: 1, max: 6, chance: 0.6 }, { id: 'GOLD_NUGGET', min: 1, max: 6, chance: 0.55 },
    { id: 'COPPER_NUGGET', min: 1, max: 6, chance: 0.6 }, { id: 'TIN_NUGGET', min: 1, max: 6, chance: 0.6 },
    { id: 'BRONZE_NUGGET', min: 1, max: 6, chance: 0.55 },
    { id: 'MUSHROOM_STEW', min: 1, max: 1, chance: 0.9 }, { id: 'MUSHROOM_STEW', min: 1, max: 1, chance: 0.9 },
    { id: 'MUSHROOM_STEW', min: 1, max: 1, chance: 0.9 }, { id: 'MUSHROOM_STEW', min: 1, max: 1, chance: 0.9 },
    { id: 'BEEF', min: 2, max: 5, chance: 0.6 }, { id: 'PORK', min: 2, max: 5, chance: 0.6 }, { id: 'MUTTON', min: 2, max: 5, chance: 0.6 },
    { id: 'COD', min: 2, max: 4, chance: 0.5 }, { id: 'SALMON', min: 2, max: 4, chance: 0.5 },
    { id: 'PIKE', min: 1, max: 3, chance: 0.4 }, { id: 'CATFISH', min: 1, max: 3, chance: 0.35 },
    { id: 'IRON_INGOT', min: 2, max: 5, chance: 0.45 }, { id: 'GOLD_INGOT', min: 1, max: 3, chance: 0.35 },
    { id: 'GLOW_CRYSTAL', min: 2, max: 6, chance: 0.5 }, { id: 'GLOW_DUST', min: 2, max: 5, chance: 0.35 },
    { id: 'B:RIME_PLANKS', min: 4, max: 10, chance: 0.35 },
    { id: 'CLOTH', min: 3, max: 8, chance: 0.4 }, { id: 'LEATHER', min: 2, max: 6, chance: 0.4 },
    { id: 'BREAD', min: 2, max: 4, chance: 0.45 }, { id: 'COOKED_PUMPKIN_PIE', min: 1, max: 2, chance: 0.3 },
    { id: 'ARROW', min: 6, max: 16, chance: 0.45 },
    { id: 'GOLDEN_APPLE', min: 1, max: 1, chance: 0.12 },
    _leather('LEATHER_HELMET'), _leather('LEATHER_CHESTPLATE'), _leather('LEATHER_LEGGINGS'), _leather('LEATHER_BOOTS'),
    _leather('LEATHER_GLOVES'),
    { id: 'SADDLE', min: 1, max: 1, chance: 0.06 }, { id: 'BACKPACK', min: 1, max: 1, chance: 0.04 },
  ],
};
const CASTLE_LOOT_XP_MUL = 3;

// the castle prefab, its marker cells taken out and its blocks put right (built once from the loaded prefab)
function _castlePrefab() {
  const src = typeof STRUCTURES !== 'undefined' ? STRUCTURES.get(LAIR.PREFAB) : null;
  if (!src || !Array.isArray(src.blocks)) return null;
  if (_castleCache && _castleCache.src === src) return _castleCache;
  // its chests roll the castle's own table; '1' too, for the chests of a castle placed in 0.8393
  src.lootTables = { castle: CASTLE_LOOT, '1': CASTLE_LOOT };
  if (src.loot) for (const k in src.loot) src.loot[k] = 'castle';
  src.lootXpMul = CASTLE_LOOT_XP_MUL;
  let gate = null, boss = null;
  const blocks = [];
  for (const b of src.blocks) {
    if (!Array.isArray(b) || b.length < 4) continue;
    let [x, y, z, id, v = 0] = b;
    if (id === B.FURNACE) { gate = [x, y, z]; continue; }                       // the gate: left open
    if (id === B.BEDROCK) { boss = [x, y, z]; continue; }                       // where he appears
    if (id === B.CHEST && chestWoodOf(v) === 0) v |= chestWoodBits(3);                  // oak -> rime
    if (id === B.SNOW && CORE.layerCount(id | (v << 8)) > 0) v = 0;             // a snow carpet -> a snow block
    if (id === B.TORCH_UNLIT) id = B.TORCH;                                     // lit (same wall, same variant)
    if (id === B.GLOWCRYSTAL_SPENT) id = B.GLOWCRYSTAL_BLOCK;
    blocks.push(b.length > 5 ? [x, y, z, id, v, b[5]] : [x, y, z, id, v]);   // its look kept (blocks/looks.js)
  }
  _castleCache = { src, prefab: { ...src, blocks }, gate, boss };
  return _castleCache;
}

const _lairKey = (gx, gz) => gx + ',' + gz;
function _lairCell(gx, gz) {
  const k = _lairKey(gx, gz);
  let c = _lairCells.get(k);
  if (!c) _lairCells.set(k, c = { gx, gz, state: 'cands', cands: null, k: 0, site: undefined, rank: _structHash(gx, gz, LAIR.SALT) });
  return c;
}
// 1. the candidates: open Coldest Deep Snow at the middle and round the footprint, by the fields alone
function _lairCands(c, W, L) {
  const g = mainGen, x0 = c.gx * LAIR.CELL, z0 = c.gz * LAIR.CELL, M = LAIR.MARGIN, out = [];
  for (let z = z0 + LAIR.STEP / 2; z < z0 + LAIR.CELL - L; z += LAIR.STEP)
    for (let x = x0 + LAIR.STEP / 2; x < x0 + LAIR.CELL - W; x += LAIR.STEP) {
      if (!g.rimeOpenAt(x + W / 2, z + L / 2)) continue;
      let ok = true;
      for (const [px, pz] of [[x - M, z - M], [x + W + M, z - M], [x - M, z + L + M], [x + W + M, z + L + M]])
        if (!g.rimeOpenAt(px, pz)) { ok = false; break; }
      if (ok) out.push({ x, z, r: _structHash(x >> 4, z >> 4, LAIR.SALT + 1) });
    }
  out.sort((a, b) => a.r - b.r);
  c.cands = out.slice(0, LAIR.PROBES);
  c.k = 0;
  c.state = c.cands.length ? 'probe' : 'done';
  if (!c.cands.length) c.site = null;
}
// 2. the worker's look at a candidate: the real biome everywhere round it, and its ground
const _lairPts = (x, z, W, L) => {
  const M = LAIR.MARGIN, out = [];
  for (const fz of [-M, L / 2, L + M]) for (const fx of [-M, W / 2, W + M]) out.push([Math.round(x + fx), Math.round(z + fz)]);
  return out;
};
function _lairProbe(c, W, L) {
  const cand = c.cands[c.k], id = ++_lairProbeN;
  _lairProbes.set(id, { c, cand });
  c.state = 'wait';
  if (typeof postScanJob === 'function') postScanJob({ type: 'probe', id, pts: _lairPts(cand.x, cand.z, W, L) }, []);
}
// the worker's answer (onWorkerMessage, chunks/stream.js)
function bossLairProbe(m) {
  const p = _lairProbes.get(m.id);
  if (!p) return;                                      // another world's, or forgotten
  _lairProbes.delete(m.id);
  const { c, cand } = p;
  const lo = Math.min(...m.heights), hi = Math.max(...m.heights);
  if (m.names.every(n => n === LAIR.BIOME) && hi - lo <= LAIR.SLOPE) {
    c.site = { x: cand.x, z: cand.z, lo, hi };
    c.state = 'done';
    return;
  }
  if (++c.k >= c.cands.length) { c.site = null; c.state = 'done'; }
  else c.state = 'probe';
}
// 3. a cell's castle, if it has one that stands: undefined while its neighbours are still being worked out
function _lairSite(gx, gz) {
  const c = _lairCells.get(_lairKey(gx, gz));
  if (!c || c.state !== 'done') return undefined;
  if (!c.site) return null;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const n = _lairCells.get(_lairKey(gx + dx, gz + dz));
    if (!n || n.state !== 'done') return undefined;
    if (n.site && n.rank < c.rank && Math.hypot(n.site.x - c.site.x, n.site.z - c.site.z) < LAIR.APART) return null;
  }
  return c.site;
}
const _lairsOn = () => !!currentWorld && !menuScene && currentWorld.structures !== false && (currentWorld.biomeRev || 1) >= 20;

/* Per frame (frame loop, 22): the cells round the player worked out a little at a time (one cell's candidates, or one
   probe, a frame), castles placed once their land is in, and each standing lair's king put in his hall. */
function updateBossLairs() {
  if (!_lairsOn() || typeof mainGen === 'undefined' || !mainGen.rimeOpenAt) return;
  const cp = _castlePrefab();
  if (!cp) return;
  const [W, H, L] = cp.prefab.size;
  const p = PLAYERS[0] && PLAYERS[0].spawned ? PLAYERS[0] : player;
  const pgx = Math.floor(p.pos.x / LAIR.CELL), pgz = Math.floor(p.pos.z / LAIR.CELL);
  // the work: nearest cells first, one step a frame
  let worked = false;
  for (let r = 0; r <= LAIR.RING && !worked; r++)
    for (let dz = -r; dz <= r && !worked; dz++) for (let dx = -r; dx <= r && !worked; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const c = _lairCell(pgx + dx, pgz + dz);
      if (c.state === 'cands') { _lairCands(c, W, L); worked = true; }
      else if (c.state === 'probe') { _lairProbe(c, W, L); worked = true; }
    }
  // castles whose land is all in: placed
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const gx = pgx + dx, gz = pgz + dz, key = _lairKey(gx, gz);
    const lair = BOSS_LAIRS.get(key);
    if (lair && (lair.placed || lair._queued)) continue;
    const s = lair ? { x: lair.ox, z: lair.oz } : _lairSite(gx, gz);
    if (!s) continue;
    if (Math.hypot(s.x + W / 2 - p.pos.x, s.z + L / 2 - p.pos.z) > drawDist() * 16) continue;
    if (!_footprintReady(s.x - LAIR.PATH, s.z - LAIR.PATH, W + 2 * LAIR.PATH, L + 2 * LAIR.PATH)) continue;
    _placeCastle(key, lair || { key, kind: LAIR.BOSS, ox: s.x, oy: s.lo + 1, oz: s.z, placed: false, defeated: false }, cp, W, H, L);
  }
  // his hall: a king in every standing lair close enough to be simulated
  for (const lair of BOSS_LAIRS.values()) {
    if (!lair.placed || lair.defeated || lair.bx == null) continue;
    if (ENTITIES.some(e => e.boss && e.lairKey === lair.key)) continue;
    const cx = Math.floor(lair.bx / 16), cz = Math.floor(lair.bz / 16), ch = getChunk(cx, cz);
    if (!ch || !ch.data || !inSimRangeChunk(cx, cz)) continue;
    const e = spawnFrozenKing(lair.bx + 0.5, lair.by, lair.bz + 0.5);
    e.lairKey = lair.key;
    e.yaw = Math.PI;                                   // facing the gate (the castle's front is at -Z)
  }
}
function _placeCastle(key, lair, cp, W, H, L) {
  lair._queued = true;
  if (cp.boss) { lair.bx = lair.ox + cp.boss[0]; lair.by = lair.oy + cp.boss[1]; lair.bz = lair.oz + cp.boss[2]; }
  BOSS_LAIRS.set(key, lair);
  queuePlacement({ kind: 'prefab', prefab: cp.prefab, ox: lair.ox, oy: lair.oy, oz: lair.oz, w: W, h: H, l: L,
                   blend: true, blendOpts: { top: B.SNOW, deep: B.STONE },
                   onDone: () => _castleDone(lair, cp) });
}
// the castle stands: its lights kept lit for good, the way to its gate cut through the snow, the lair marked
function _castleDone(lair, cp) {
  if (typeof BURNS !== 'undefined' && typeof BURN_S !== 'undefined')
    for (const b of cp.prefab.blocks) {
      if (!BURN_S[b[3]]) continue;
      const x = lair.ox + b[0], y = lair.oy + b[1], z = lair.oz + b[2];
      BURNS.set(x + ',' + y + ',' + z, [x, y, z, BURN_NEVER]);
    }
  if (cp.gate) {
    const gx = lair.ox + cp.gate[0], fy = lair.oy + cp.gate[1] - 1, gz = lair.oz + cp.gate[2];
    _bulkWrite(gx - 2, gz - LAIR.PATH - 1, 5, LAIR.PATH + 2, () => {
      for (let d = 1; d <= LAIR.PATH + 1; d++) {
        const z = gz - d;
        for (let x = gx - 1; x <= gx + 1; x++) {
          if (!isSolid(x, fy, z)) setBlock(x, fy, z, B.SNOW);               // something to walk on, level with the gate
          for (let y = fy + 1; y <= fy + 4; y++) if ((getBlock(x, y, z) & 255) !== B.AIR) setBlock(x, y, z, B.AIR);
        }
      }
    });
  }
  lair.placed = true;
  lair._queued = false;
}
// the castle a player should head for: the nearest standing lair not yet defeated, or the nearest site worked out
function _nearestCastle(p) {
  let best = null, bd = Infinity;
  const cp = _castlePrefab();
  if (!cp) return null;
  const [W, H, L] = cp.prefab.size;
  const consider = (x, y, z) => { const d = Math.hypot(x - p.pos.x, z - p.pos.z); if (d < bd) { bd = d; best = { x, y, z, d }; } };
  for (const lair of BOSS_LAIRS.values())
    if (!lair.defeated) consider(lair.ox + W / 2, lair.oy + H, lair.oz + L / 2);
  for (const c of _lairCells.values()) {
    if (BOSS_LAIRS.has(_lairKey(c.gx, c.gz))) continue;
    const s = _lairSite(c.gx, c.gz);
    if (s) consider(s.x + W / 2, s.hi + H, s.z + L / 2);
  }
  return best;
}
// saved with the world (16): where each castle stands and whether its king is dead
function serializeBossLairs() {
  return [...BOSS_LAIRS.values()].map(l => ({ key: l.key, kind: l.kind, ox: l.ox, oy: l.oy, oz: l.oz, bx: l.bx, by: l.by, bz: l.bz,
                                              placed: !!l.placed, defeated: !!l.defeated }));
}
function restoreBossLairs(list) {
  BOSS_LAIRS.clear(); _lairCells.clear(); _lairProbes.clear(); _castleCache = null;
  if (!Array.isArray(list)) return;
  for (const l of list) {
    if (!l || typeof l.key !== 'string' || ![l.ox, l.oy, l.oz].every(Number.isFinite)) continue;
    BOSS_LAIRS.set(l.key, { key: l.key, kind: l.kind || LAIR.BOSS, ox: l.ox, oy: l.oy, oz: l.oz, bx: l.bx, by: l.by, bz: l.bz,
                            placed: !!l.placed, defeated: !!l.defeated });
  }
}
