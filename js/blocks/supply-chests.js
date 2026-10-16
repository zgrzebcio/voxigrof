'use strict';
/* blocks/supply-chests.js: supply chests found in the world: wooden crates and sealed metal chests. */

/* ---------------------------------- supply chests in the world ---------------------------------- */
/* every kind shares ONE spacing. The world is squares of SUPPLY_CELL blocks, and each holds one supply chest,
   somewhere in its middle SUPPLY_JITTER blocks, so the next one along is always 100 to 250 blocks away (0.843 rolled a
   chance per chunk for each metal, and the wooden supply crate another of its own: two could stand side by side, or
   none for a long way). Which kind is rolled from the square too (SUPPLY_KINDS):
     wood    the supply crate structure (structures/supply_crate.json), set on the ground with its own loot; it no
             longer rolls as a lone prefab (34 _spawnCandidates). Not on water. its chest is SEALED like the
             metal ones, and a blank wooden key (crafted: 4 planks and a nugget) opens it.
     metal   a sealed copper, iron or gold chest at any height in its column: a cave floor, a peak, the open plain, on
             any whole cell of air standing on a whole solid block. Its loot is rolled the first time a key opens it
             (DEFAULT_LOOT's <metal>_chest, 34).
   Placed with the structures' roll, once as the chunk holding the spot first arrives (trySpawnStructureInChunk, 34),
   seeded by the world like them. */
const SUPPLY_CELL = 175, SUPPLY_JITTER = 75;
/* fewer wooden crates (45% of the squares before), a few more metal chests (28 / 19 / 8%), and what is left
   over, 16% of the squares, holds nothing: the shares no longer add up to 1 (supplySiteOf's kind is then null). */
const SUPPLY_KINDS = [['wood', 0.30], ['copper', 0.30], ['iron', 0.21], ['gold', 0.09]];
const SUPPLY_CRATE = 'supply_crate';                           // the wooden kind's prefab
const WORLD_CHEST_TRIES = 6;                                   // columns looked down for a metal chest's spot
// the supply chest of square (gx, gz): where it stands and what it is
function supplySiteOf(gx, gz) {
  const pad = (SUPPLY_CELL - SUPPLY_JITTER) / 2;
  let r = _structHash(gx, gz, 503), kind = null;                // null: an empty square
  for (const [k, w] of SUPPLY_KINDS) { if (r < w) { kind = k; break; } r -= w; }
  return { x: gx * SUPPLY_CELL + Math.floor(pad + _structHash(gx, gz, 501) * SUPPLY_JITTER),
           z: gz * SUPPLY_CELL + Math.floor(pad + _structHash(gx, gz, 502) * SUPPLY_JITTER), kind };
}
function trySpawnWorldChest(cx, cz) {
  const x0 = cx * 16, z0 = cz * 16;
  for (let gz = Math.floor(z0 / SUPPLY_CELL); gz <= Math.floor((z0 + 15) / SUPPLY_CELL); gz++)
    for (let gx = Math.floor(x0 / SUPPLY_CELL); gx <= Math.floor((x0 + 15) / SUPPLY_CELL); gx++) {
      const s = supplySiteOf(gx, gz);
      if (s.x < x0 || s.x > x0 + 15 || s.z < z0 || s.z > z0 + 15) continue;
      if (!s.kind) return false;
      return s.kind === 'wood' ? _spawnSupplyCrate(cx, cz, s) : _spawnSealedChest(cx, cz, s);
    }
  return false;
}
// the wooden one: the supply crate set into the ground at the spot, kept inside this chunk; a bare chest if the prefab is missing
function _spawnSupplyCrate(cx, cz, s) {
  const x0 = cx * 16, z0 = cz * 16, p = typeof STRUCTURES !== 'undefined' ? STRUCTURES.get(SUPPLY_CRATE) : null;
  const [w, h, l] = (p && p.size) || [1, 1, 1];
  const ax = Math.min(Math.max(s.x - (w >> 1), x0 + 1), x0 + 15 - w), az = Math.min(Math.max(s.z - (l >> 1), z0 + 1), z0 + 15 - l);
  const fp = _footprint(ax, az, w, l);
  if (fp.wet || fp.hi - fp.lo > 10) return false;               // water, or a cliff: no crate in this square
  if (p) {
    const oy = fp.lo + 1;
    // once it stands, its chest is sealed: every wooden chest in the crate's box
    const seal = () => {
      for (let y = oy; y < oy + h; y++) for (let z = az; z < az + l; z++) for (let x = ax; x < ax + w; x++) {
        const v = getBlock(x, y, z);
        if ((v & 255) === B.CHEST && !chestSealed(v)) setBlock(x, y, z, (v | (CHEST_SEALED << 8)) >>> 0);
      }
    };
    queuePlacement({ kind: 'prefab', prefab: p, ox: ax, oy, oz: az, w, h, l, blend: true, blendOpts: { from: 0 }, onDone: seal });
    return true;
  }
  const y = fp.lo + 1, facing = Math.floor(_structHash(cx, cz, 421) * 4);
  if (getBlock(ax, y, az) !== B.AIR) return false;
  setBlock(ax, y, az, B.CHEST | ((facing | CHEST_SEALED) << 8));
  registerChest(ax, y, az, facing);
  markPendingLoot(ax, y, az, '1', null);
  return true;
}
// a metal one: sealed, at any height in the spot's column, or in a column near it when that one has no room
function _spawnSealedChest(cx, cz, s) {
  const metal = CHEST_METALS.findIndex(m => m.name === s.kind);
  if (metal < 0) return false;
  for (let t = 0; t < WORLD_CHEST_TRIES; t++) {
    const x = t ? cx * 16 + Math.floor(_structHash(cx, cz, 411 + t * 7) * 16) : s.x;
    const z = t ? cz * 16 + Math.floor(_structHash(cx, cz, 413 + t * 7) * 16) : s.z;
    const spots = [];
    for (let y = WORLD_TOP - 2; y > 1; y--) {
      if (getBlock(x, y, z) !== B.AIR) continue;              // a whole empty cell: no water, plant or snow layer in it
      const below = getBlock(x, y - 1, z);
      if (CORE.opaqueVal(below) && !CORE.shapeOfVal(below)) spots.push(y);
    }
    if (!spots.length) continue;
    const y = spots[Math.floor(_structHash(cx, cz, 419 + t) * spots.length)];
    const facing = Math.floor(_structHash(cx, cz, 421) * 4);
    setBlock(x, y, z, B.METAL_CHEST | ((facing | (metal << CHEST_WOOD_SHIFT) | CHEST_SEALED) << 8));
    registerChest(x, y, z, facing);
    markPendingLoot(x, y, z, CHEST_METALS[metal].loot, null);
    return true;
  }
  return false;
}
