'use strict';
/* blocks/rails.js: fences and walls lying in another block's cell, railings for stairs and slabs; and ladders lying in one
   (a ladder up out of a slab, stairs, a carpet or a plant: put there by tryLadderOver and climbed, held and dropped like any
   ladder, blocks/ladders.js; no joins).

   A fence put down on a bottom slab or on upright stairs goes INTO that cell and stands on the slab, or on the stair's lower
   step, RAIL_LIFT up; one put into a top or a vertical slab stands from the cell's floor, half of it in the slab (posts
   under a top slab; a half block with a fence on its face). A wall put on upright stairs runs along one side of them, the
   side of the cell the click was nearer (WALL_BACK | facing toward it), RAIL_LIFT up too (where each stands: railLift,
   shapes/boxes.js). The cell keeps its slab or stairs; the fence or wall lives beside it: RAIL_OVER "cx,cz" ->
   Map(cell index -> its value). What may hold one and the boxes it fills there are railHostOk / railOverBoxes
   (shapes/boxes.js, shared with the mesher, which draws them from the mesh job's `rails`: this chunk's and the ring of cells
   round it, railsForMesh). It joins the fences and walls round it, in their own cells or in others', a step up or down too
   (joinSlopesAt): stairs in a row with a fence or a wall in each are a railing.

   Never written by hand: setRailOver keeps the count and meshes its chunk again, and the chunk across its edge when it lies
   on one. Saved as `railOver` (16-worlds.js); prefabs `rails` (captureStructure, applyStructureRails in 34-structures.js).
   AIMED AT as a plate or a cover in another cell is: `over`, bi RAIL_OVER_BI (overValAt, overBoxesAt, breakOverAt in
   blocks/covers.js answer for it), and it collides (blockBoxes, chunks/block-access.js). A cell holding one takes no plate or
   cover, and the other way round. What holds it gone, it becomes the cell's block; what holds it turned into something that
   cannot, it comes off as its block (railChanged, setBlock's hook). */

const RAIL_OVER = new Map();
let _railOverN = 0;                      // cells holding one: a ray or a hook looks only when there are some
const RAIL_OVER_BI = 17;                 // a ray's `bi` on one (a doorway's fill is 16, covers 10-15, a plate 9)

// the fence or wall lying in the cell (x, y, z), or 0
function railOverAt(x, y, z) {
  if (!_railOverN) return 0;
  const m = RAIL_OVER.get(Math.floor(x / 16) + ',' + Math.floor(z / 16));
  return m ? (m.get(_plateCellI(x, y, z)) || 0) : 0;
}
// the lookup the shape boxes take for their joins (shapeBoxesAt's rl), or null while there are none
const railLookup = () => _railOverN ? railOverAt : null;
// put one in the cell (v its value), or take it away (v 0); its chunk is meshed again, and the one across its edge
function setRailOver(x, y, z, v) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16), ck = cx + ',' + cz, i = _plateCellI(x, y, z);
  let m = RAIL_OVER.get(ck);
  const had = !!m && m.has(i), old = had ? m.get(i) : 0;
  if (!v && !had) return;
  if (v) { if (!m) RAIL_OVER.set(ck, m = new Map()); m.set(i, v >>> 0); if (!had) _railOverN++; }
  else { m.delete(i); _railOverN--; if (!m.size) RAIL_OVER.delete(ck); }
  // a ladder put there or taken: what holds the ladders round it (blocks/ladders.js)
  if (isLadderVal(old) || isLadderVal(v)) ladderChanged(x, y, z, old, v >>> 0);
  markDirty(getChunk(cx, cz));
  const lx = x & 15, lz = z & 15;
  if (lx === 0) markDirty(getChunk(cx - 1, cz));
  if (lx === 15) markDirty(getChunk(cx + 1, cz));
  if (lz === 0) markDirty(getChunk(cx, cz - 1));
  if (lz === 15) markDirty(getChunk(cx, cz + 1));
}
/* its boxes where it lies (railOverBoxes, shapes/boxes.js), or null; coll: the ones that collide. The crosshair's (not coll)
   take its steps and corner joins too (joinPickBoxes) */
function railBoxesAt(x, y, z, coll = false) {
  const rv = railOverAt(x, y, z);
  if (!rv) return null;
  // a ladder: its board at the back, to bodies and to the crosshair (shapes/boxes.js)
  if (isLadderVal(rv)) return (coll ? BLOCKS.LADDER_COLL : BLOCKS.LADDER_PICK)[ladderSideOf(rv)];
  const bx = BLOCKS.railOverBoxes(getBlock, x, y, z, rv, coll, railOverAt);
  if (coll || !bx) return bx;
  const pk = BLOCKS.joinPickBoxes(CORE.shapeOfVal(rv), getBlock, x, y, z, rv, railOverAt, BLOCKS.railLift(getBlock(x, y, z), rv));
  return pk.length ? bx.concat(pk) : bx;
}
/* the mesh job's `rails` (meshChunk, chunks/mesher.js): this chunk's and those in the ring of cells round it, keyed by
   (x + 1) + (z + 1) * 18 + y * 324 with x and z from -1 to 16; null when there are none near */
function railsForMesh(cx, cz) {
  if (!_railOverN) return null;
  let out = null;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const m = RAIL_OVER.get((cx + dx) + ',' + (cz + dz));
      if (!m) continue;
      for (const [i, v] of m) {
        const x = (i & 15) + dx * 16, z = ((i >> 4) & 15) + dz * 16;
        if (x < -1 || x > 16 || z < -1 || z > 16) continue;
        (out || (out = new Map())).set((x + 1) + (z + 1) * 18 + (i >> 8) * 324, v);
      }
    }
  return out;
}

/* ---- putting one down (place-block.js, a fence or a wall shape in hand) ----
   A face clicked INSIDE its cell (a slab's top, a stair's lower step) puts it in that cell; a face on the cell's edge, in
   the cell in front of it, when that one holds what can take it. 'placed', 'taken' (one lies there already, or a plate or a
   cover does), or null: the usual placing goes on. `mat`: the held block | look << 16, and NEED_PAID when it took a need
   (blocks/variants.js: given back when broken). */
function tryRailOver(hit, mat, key) {
  const fam = key === 'fence' ? 'fence' : key === 'wall' ? 'wall' : null;
  if (!fam || hit.over) return null;
  const o = camera.position, P = [o.x + _dir.x * hit.t - hit.x, o.y + _dir.y * hit.t - hit.y, o.z + _dir.z * hit.t - hit.z];
  const ax = hit.nx ? 0 : hit.ny ? 1 : 2, n = hit.nx || hit.ny || hit.nz;
  const inner = n > 0 ? P[ax] < 1 - 1e-3 : P[ax] > 1e-3;
  for (const [x, y, z] of [inner ? [hit.x, hit.y, hit.z] : [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz]]) {
    const host = getBlock(x, y, z);
    let rv = ((mat & 0xFF00FF) | (mat & NEED_PAID) | (SHAPE_FENCE << 8)) >>> 0;
    if (fam === 'wall') {
      // along the side of the stairs nearer the click: their climb runs along the axis of their facing
      const f = ((host >> 8) & 255) & 3, px = o.x + _dir.x * hit.t - x, pz = o.z + _dir.z * hit.t - z;
      const side = f < 2 ? (px < 0.5 ? 3 : 2) : (pz < 0.5 ? 1 : 0);
      rv = ((mat & 0xFF00FF) | (mat & NEED_PAID) | ((SHAPE_WALL | BLOCKS.WALL_BACK | side) << 8)) >>> 0;
    }
    if (!BLOCKS.railHostOk(host, rv)) continue;
    if (railOverAt(x, y, z) || plateOverAt(x, y, z) || coversAt(x, y, z)) return 'taken';
    setRailOver(x, y, z, rv);
    playBlockSound(mat & 255, 'place', x, y, z);
    return 'placed';
  }
  return null;
}
// broken by a player or a blast: `drops` its block back; `quiet` when the caller made the sound
function breakRail(x, y, z, drops, quiet) {
  const rv = railOverAt(x, y, z);
  if (!rv) return;
  setRailOver(x, y, z, 0);
  if (!quiet) {
    playBlockSound(rv & 255, 'break', x, y, z);
    if (typeof fxBreak === 'function') fxBreak(x, y, z, rv);
  }
  if (drops) for (const d of blockDrop(rv, false)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
}

/* ---- setBlock's hook (chunks/block-access.js): what holds it changed ---- */
function railChanged(x, y, z, oldVal, val) {
  if (!_railOverN) return;
  const rv = railOverAt(x, y, z);
  if (!rv || BLOCKS.railHostOk(val, rv)) return;
  setRailOver(x, y, z, 0);
  // emptied (the slab or the stairs broken): it stays, as the cell's own block; else it comes off as its block
  if (!(val & 255)) { setBlock(x, y, z, rv); return; }
  if (!player.canFly) for (const d of blockDrop(rv)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
}

/* ---- prefabs (34-structures.js): `rails` [dx, dy, dz, id, variant, look?] ---- */
function structureRailsIn(v) {
  const out = [];
  for (const [ck, m] of RAIL_OVER) {
    const [cx, cz] = ck.split(',').map(Number);
    for (const [i, rv] of m) {
      const dx = cx * 16 + (i & 15) - v.x0, dy = (i >> 8) - v.y0, dz = cz * 16 + ((i >> 4) & 15) - v.z0;
      if (dx < 0 || dy < 0 || dz < 0 || dx >= v.w || dy >= v.h || dz >= v.l) continue;
      out.push(lookOf(rv) ? [dx, dy, dz, rv & 255, (rv >> 8) & 255, lookOf(rv)] : [dx, dy, dz, rv & 255, (rv >> 8) & 255]);
    }
  }
  return out;
}
// laid once a prefab's blocks are down; one with nothing to hold it where it goes is left out. `swap`: the prefab's swaps
function applyStructureRails(prefab, ox, oy, oz, swap = null) {
  if (!prefab || !Array.isArray(prefab.rails)) return;
  for (const p of prefab.rails) {
    if (!Array.isArray(p) || p.length < 5 || !p.slice(0, 5).every(Number.isInteger)) continue;
    const [dx, dy, dz, id0, variant, look = 0] = p, x = ox + dx, y = oy + dy, z = oz + dz;
    const id = swap && swap[id0] != null ? swap[id0] | 0 : id0;
    if (!PROPS[id]) continue;
    const rv = (id | ((variant & 255) << 8) | ((look & 255) << 16)) >>> 0;
    if (BLOCKS.railHostOk(getBlock(x, y, z), rv) && !railOverAt(x, y, z)) setRailOver(x, y, z, rv);
  }
}

/* ---- the save: [x, y, z, value] ---- */
function serializeRailOver() {
  const out = [];
  for (const [ck, m] of RAIL_OVER) {
    const [cx, cz] = ck.split(',').map(Number);
    for (const [i, rv] of m) out.push([cx * 16 + (i & 15), i >> 8, cz * 16 + ((i >> 4) & 15), rv]);
  }
  return out;
}
// as a world loads (its chunks are not in yet: nothing to mesh again)
function restoreRailOver(list) {
  RAIL_OVER.clear();
  _railOverN = 0;
  if (!Array.isArray(list)) return;
  for (const r of list) {
    if (!Array.isArray(r) || !r.slice(0, 4).every(Number.isInteger)) continue;
    const rv = r[3] >>> 0, s = CORE.shapeOfVal(rv);
    if (s !== 'fence' && s !== 'wall' && s !== 'ladder') continue;
    const ck = Math.floor(r[0] / 16) + ',' + Math.floor(r[2] / 16), i = _plateCellI(r[0], r[1], r[2]);
    let m = RAIL_OVER.get(ck);
    if (!m) RAIL_OVER.set(ck, m = new Map());
    if (!m.has(i)) _railOverN++;
    m.set(i, rv);
  }
}
