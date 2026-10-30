'use strict';
/* entities/boss-lair.js: the bosses' lairs, where one stands in a world and placing it: the snow castle, the Frozen King's,
   and the great pyramid, the Dead Pharaoh's (LAIR_KINDS: one machinery for both, below the castle's own notes). */

/* ==================================== the snow castle: his lair ====================================
   structures/cold/snow_castle.json, built by hand. It is not a lone prefab nor a settlement: there is at most one in every
   LAIR.CELL square of the world, never two within LAIR.APART blocks, and only in the open Coldest Deep Snow (not its
   Forest; new worlds, biomeRev 20). Where they stand is worked out from the seed alone, so the last quest's marker can
   point at the nearest one before its land was ever loaded:
     1. a cell's candidate spots: a grid every LAIR.STEP blocks where the open Coldest Deep Snow's own fields say yes
        (rimeOpenAt, microseconds) at the castle's middle and round its footprint, in a hashed order;
     2. each candidate in turn is checked by a worker (job 'probe': biomeAt and heightAt, milliseconds, off this thread):
        the real biome name all round, and ground within LAIR.SLOPE; the first that passes is the cell's site;
     3. a site stands only if no neighbouring cell's site lies within LAIR.APART with a lower roll.
   One probe is out at a time, and a cell worked out is kept with the world (`lairCells`): it depends on the seed alone,
   so a world opened again does not check its candidates again (each check is ~100 ms of a worker's time).
   Once all the land under a site has loaded, the castle is queued (34's placement queue, embedded: hills cut out of
   it, pillars under it) and a lair is recorded with the world (`bossLairs`). Its markers: the furnace is the gate (air,
   and a path cut out to it), the bedrock is where the king appears (air); oak chests become rime wood, snow carpets snow
   blocks, unlit torches and spent glow crystal lit (spent glowstone is meant so and stays), and none of its lights
   ever burn out. While the lair is not defeated and its hall is simulated, a king stands in it; he is never saved, so a
   reload brings him back the same way. Once killed, never again. */
const LAIR = { PREFAB: 'snow_castle', BOSS: 'frozen_king', BIOME: 'Coldest Deep Snow', HOME: "Frozen King's castle",
               CELL: 4096, APART: 4000, STEP: 128, MARGIN: 8, SLOPE: 10, PROBES: 12, RING: 2, SALT: 7771, PATH: 10,
               PRE: '', REV: 20,                 // its keys as they were before there were two kinds; the world gen it needs
               open: (g, x, z) => g.rimeOpenAt(x, z), prefab: () => _castlePrefab(),
               blend: { top: B.SNOW, deep: B.STONE }, done: (lair, cp) => _castleDone(lair, cp),
               spawn(lair) { const e = spawnFrozenKing(lair.bx + 0.5, lair.by, lair.bz + 0.5); e.yaw = Math.PI; return e; } };   // facing the gate (the castle's front is at -Z)
/* THE GREAT PYRAMID, the Dead Pharaoh's (structures/warm/big_pyramid.json, put right by pharaohPyramidPrefab in
   entities/pharaoh.js): the same steps as the castle's, in the Deep Red Desert Flat (biomeRev 42), found by its fields
   (rdfOpenAt), its whole footprint and a margin round it in that biome and its ground within SLOPE (the flattest 60 x 60
   squares there were 2-7 blocks from top to bottom); set into the ground on red sand and red sandstone. The pharaoh stands
   where its bedrock was. One in every CELL square at most, none within APART of another. */
const PYRAMID_LAIR = { BOSS: 'pharaoh', BIOME: 'Deep Red Desert Flat', HOME: "Dead Pharaoh's pyramid",
                       CELL: 3072, APART: 2500, STEP: 96, MARGIN: 6, SLOPE: 8, PROBES: 12, RING: 2, SALT: 9133, PATH: 0,
                       PRE: 'p:', REV: 42,
                       open: (g, x, z) => !!g.rdfOpenAt && g.rdfOpenAt(x, z), prefab: () => pharaohPyramidPrefab(),
                       blend: { top: B.RED_SAND, deep: B.RED_SANDSTONE }, done: (lair) => { lair.placed = true; lair._queued = false; },
                       spawn: (lair) => spawnPharaoh(lair.bx + 0.5, lair.by, lair.bz + 0.5) };
const LAIR_KINDS = [LAIR, PYRAMID_LAIR];
const _lairKindOf = (lair) => LAIR_KINDS.find(K => K.BOSS === lair.kind) || LAIR;
const lairKindOfBoss = (boss) => LAIR_KINDS.find(K => K.BOSS === boss) || null;
const _lairCells = new Map();      // its kind's PRE + "gx,gz" -> { K, gx, gz, state: 'cands' | 'probe' | 'done', cands, k, site, rank }
const BOSS_LAIRS = new Map();      // the same keys -> the saved lair: { key, kind (its boss), ox, oy, oz, bx, by, bz, placed, defeated }
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

/* ---- one machinery for every kind of lair (K: an entry of LAIR_KINDS) ---- */
const _lairKey = (K, gx, gz) => K.PRE + gx + ',' + gz;
function _lairCell(K, gx, gz) {
  const k = _lairKey(K, gx, gz);
  let c = _lairCells.get(k);
  if (!c) _lairCells.set(k, c = { K, gx, gz, state: 'cands', cands: null, k: 0, site: undefined, rank: _structHash(gx, gz, K.SALT) });
  return c;
}
// 1. the candidates: its biome at the middle and round the footprint, by the fields alone
function _lairCands(c, W, L) {
  const K = c.K, g = mainGen, x0 = c.gx * K.CELL, z0 = c.gz * K.CELL, M = K.MARGIN, out = [];
  for (let z = z0 + K.STEP / 2; z < z0 + K.CELL - L; z += K.STEP)
    for (let x = x0 + K.STEP / 2; x < x0 + K.CELL - W; x += K.STEP) {
      if (!K.open(g, x + W / 2, z + L / 2)) continue;
      let ok = true;
      for (const [px, pz] of [[x - M, z - M], [x + W + M, z - M], [x - M, z + L + M], [x + W + M, z + L + M]])
        if (!K.open(g, px, pz)) { ok = false; break; }
      if (ok) out.push({ x, z, r: _structHash(x >> 4, z >> 4, K.SALT + 1) });
    }
  out.sort((a, b) => a.r - b.r);
  c.cands = out.slice(0, K.PROBES);
  c.k = 0;
  c.state = c.cands.length ? 'probe' : 'done';
  if (!c.cands.length) c.site = null;
}
// 2. the worker's look at a candidate: the real biome everywhere round it, and its ground
const _lairPts = (K, x, z, W, L) => {
  const M = K.MARGIN, out = [];
  for (const fz of [-M, L / 2, L + M]) for (const fx of [-M, W / 2, W + M]) out.push([Math.round(x + fx), Math.round(z + fz)]);
  return out;
};
const LAIR_PROBE_WAIT_MS = 10000;     // an answer not back by then (a worker's error) is given up and the probe sent again
function _lairProbe(c, W, L) {
  const cand = c.cands[c.k], id = ++_lairProbeN;
  _lairProbes.set(id, { c, cand, t: performance.now() });
  c.state = 'wait';
  if (typeof postScanJob === 'function') postScanJob({ type: 'probe', id, pts: _lairPts(c.K, cand.x, cand.z, W, L) }, []);
}
// the worker's answer (onWorkerMessage, chunks/stream.js)
function bossLairProbe(m) {
  const p = _lairProbes.get(m.id);
  if (!p) return;                                      // another world's, or forgotten
  _lairProbes.delete(m.id);
  const { c, cand } = p, K = c.K;
  const lo = Math.min(...m.heights), hi = Math.max(...m.heights);
  if (m.names.every(n => n === K.BIOME) && hi - lo <= K.SLOPE) {
    c.site = { x: cand.x, z: cand.z, lo, hi };
    c.state = 'done';
    return;
  }
  if (++c.k >= c.cands.length) { c.site = null; c.state = 'done'; }
  else c.state = 'probe';
}
// 3. a cell's lair, if it has one that stands: undefined while its neighbours are still being worked out
function _lairSite(K, gx, gz) {
  const c = _lairCells.get(_lairKey(K, gx, gz));
  if (!c || c.state !== 'done') return undefined;
  if (!c.site) return null;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const n = _lairCells.get(_lairKey(K, gx + dx, gz + dz));
    if (!n || n.state !== 'done') return undefined;
    if (n.site && n.rank < c.rank && Math.hypot(n.site.x - c.site.x, n.site.z - c.site.z) < K.APART) return null;
  }
  return c.site;
}
const _lairsOn = (K) => !!currentWorld && !menuScene && currentWorld.structures !== false && (currentWorld.biomeRev || 1) >= K.REV;
// whether this world can hold that boss's lairs at all: none in a world made before them or with structures off (the quests skip it)
const bossLairsInWorld = (boss) => { const K = lairKindOfBoss(boss); return !K || _lairsOn(K); };

/* Per frame (frame loop, 22): for every kind, the cells round the player worked out a little at a time (one cell's
   candidates, or one probe, a frame, for all kinds together), lairs placed once their land is in, and each standing
   lair's boss put in his hall. */
function updateBossLairs() {
  if (typeof mainGen === 'undefined' || !mainGen.rimeOpenAt) return;
  const p = PLAYERS[0] && PLAYERS[0].spawned ? PLAYERS[0] : player;
  // a probe whose answer never came back: given up, its cell asks again
  for (const [id, pr] of _lairProbes)
    if (performance.now() - pr.t > LAIR_PROBE_WAIT_MS) { _lairProbes.delete(id); if (pr.c.state === 'wait') pr.c.state = 'probe'; }
  let worked = false;
  for (const K of LAIR_KINDS) if (_lairsOn(K)) worked = _lairKindStep(K, p, worked) || worked;
  // his hall: the boss in every standing lair close enough to be simulated
  for (const lair of BOSS_LAIRS.values()) {
    if (!lair.placed || lair.defeated || lair.bx == null) continue;
    if (ENTITIES.some(e => e.boss && e.lairKey === lair.key)) continue;
    const cx = Math.floor(lair.bx / 16), cz = Math.floor(lair.bz / 16), ch = getChunk(cx, cz);
    if (!ch || !ch.data || !inSimRangeChunk(cx, cz)) continue;
    const e = _lairKindOf(lair).spawn(lair);
    e.lairKey = lair.key;
  }
}
// one kind's step; `busy`: a step of the work was taken this frame already. True when this one took it.
function _lairKindStep(K, p, busy) {
  const cp = K.prefab();
  if (!cp) return false;
  const [W, H, L] = cp.prefab.size;
  const pgx = Math.floor(p.pos.x / K.CELL), pgz = Math.floor(p.pos.z / K.CELL);
  // the work: nearest cells first, one step a frame
  let worked = false;
  for (let r = 0; r <= K.RING && !worked && !busy; r++)
    for (let dz = -r; dz <= r && !worked; dz++) for (let dx = -r; dx <= r && !worked; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const c = _lairCell(K, pgx + dx, pgz + dz);
      if (c.state === 'cands') { _lairCands(c, W, L); worked = true; }
      else if (c.state === 'probe' && !_lairProbes.size) { _lairProbe(c, W, L); worked = true; }   // one out at a time
    }
  // lairs whose land is all in: placed
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const gx = pgx + dx, gz = pgz + dz, key = _lairKey(K, gx, gz);
    const lair = BOSS_LAIRS.get(key);
    if (lair && (lair.placed || lair._queued)) continue;
    const s = lair ? { x: lair.ox, z: lair.oz } : _lairSite(K, gx, gz);
    if (!s) continue;
    if (Math.hypot(s.x + W / 2 - p.pos.x, s.z + L / 2 - p.pos.z) > drawDist() * 16) continue;
    if (!_footprintReady(s.x - K.PATH, s.z - K.PATH, W + 2 * K.PATH, L + 2 * K.PATH)) continue;
    _placeLair(K, key, lair || { key, kind: K.BOSS, ox: s.x, oy: s.lo + 1, oz: s.z, placed: false, defeated: false }, cp, W, H, L);
  }
  return worked;
}
function _placeLair(K, key, lair, cp, W, H, L) {
  lair._queued = true;
  if (cp.boss) { lair.bx = lair.ox + cp.boss[0]; lair.by = lair.oy + cp.boss[1]; lair.bz = lair.oz + cp.boss[2]; }
  BOSS_LAIRS.set(key, lair);
  queuePlacement({ kind: 'prefab', prefab: cp.prefab, ox: lair.ox, oy: lair.oy, oz: lair.oz, w: W, h: H, l: L,
                   blend: true, blendOpts: K.blend, onDone: () => K.done(lair, cp) });
}
// the castle stands (its lights burn for good, as every structure's: stampStructureSlice, 34-structures.js): the way to
// its gate cut through the snow, the lair marked
function _castleDone(lair, cp) {
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
/* the lair of this kind a player should head for (the boss quests' marker, ui/boss-hud.js): the nearest standing one not
   yet defeated, or the nearest site worked out. Its middle, at its top. */
function _nearestLair(p, K) {
  let best = null, bd = Infinity;
  const cp = K.prefab();
  if (!cp) return null;
  const [W, H, L] = cp.prefab.size;
  const consider = (x, y, z) => { const d = Math.hypot(x - p.pos.x, z - p.pos.z); if (d < bd) { bd = d; best = { x, y, z, d }; } };
  for (const lair of BOSS_LAIRS.values())
    if (!lair.defeated && lair.kind === K.BOSS) consider(lair.ox + W / 2, lair.oy + H, lair.oz + L / 2);
  for (const c of _lairCells.values()) {
    if (c.K !== K || BOSS_LAIRS.has(_lairKey(K, c.gx, c.gz))) continue;
    const s = _lairSite(K, c.gx, c.gz);
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
// the cells worked out, saved with the world: [gx, gz, site [x, z, lo, hi] or 0 for none, and its kind's PRE when not the castle's]
const serializeLairCells = () => [..._lairCells.values()].filter(c => c.state === 'done')
  .map(c => { const r = [c.gx, c.gz, c.site ? [c.site.x, c.site.z, c.site.lo, c.site.hi] : 0]; if (c.K.PRE) r.push(c.K.PRE); return r; });
function restoreLairCells(list) {
  if (!Array.isArray(list)) return;
  for (const r of list) {
    if (!Array.isArray(r) || !Number.isInteger(r[0]) || !Number.isInteger(r[1])) continue;
    const K = LAIR_KINDS.find(k => k.PRE === (r[3] || ''));
    if (!K) continue;
    const c = _lairCell(K, r[0], r[1]), s = r[2];
    c.state = 'done';
    c.site = Array.isArray(s) && s.every(Number.isFinite) ? { x: s[0], z: s[1], lo: s[2], hi: s[3] } : null;
  }
}
