'use strict';
/* blocks/covers.js: covers lying in another block's cell, on the page, like the facades on a cable in Applied Energistics.

   A COVER is the chisel's Cover shape (SHAPE_COVER + side, shapes/shapes.js; COVER_BOX in shapes/boxes.js): a plate an
   eighth thick on one side of a cell that nothing collides with. Put down in an empty cell it is that cell's block, as
   always. Put down in a cell holding a block that is not a whole one (a slab, stairs, a fence, a wall, a pane, a layer, a
   chest, a plant, a torch, a sign, a cover already there...) it lies in THAT cell beside its block, up to one on each of
   the six sides: a fence or a chest boxed in by covers looks like a whole block. What may hold them, and how each is cut
   to the room it has, is coverOverBoxes (shapes/boxes.js, shared with the mesher, which draws them from the map the mesh job
   carries). Each keeps its own block and look: broken with that block's tool, it drops that block.

   COVER_OVER "cx,cz" -> Map(cell index -> [six cover values, 0 where none]). Never written by hand: setCoverOver keeps the
   count and meshes the chunk again. Saved as `coverOver` (16-worlds.js); prefabs `covers` (captureStructure,
   applyStructureCovers in 34-structures.js).

   AIMED AT: the ray (raycastVoxel, player/movement.js) finds them as it finds a plate lying in another cell: `over`, and
   bi COVER_OVER_BI + the side. The value aimed at, its boxes and breaking it alone: overValAt, overBoxesAt, breakOverAt
   (they answer for a plate too). A chest a cover lies in front of does not open from that side (the ray is on the cover),
   and one with a cover over its lid does not open at all (chestCovered, blocks/chest.js).

   PLACING (tryCoverOver, from place-block.js): a face clicked INSIDE its cell (a fence post's side, a slab's top, a chest's
   front) puts the cover in that cell, on the side that face looks toward; a cover's own broad face clicked near one of its
   edges puts the new one on that edge's side (so a box of six can be built from inside); a plant or torch clicked, on the
   side the ray goes on out by. A face on the cell's edge puts it in the next cell against that face, as any cover goes, when
   that cell holds a block. A cell a plate lies in takes no cover (and the other way round).

   WHAT HOLDS THEM CHANGED (coverChanged, setBlock's hook): emptied (the chest broken, the plant picked, the cell's own
   cover taken) one of them becomes the cell's block and the rest lie on it; turned into something with no room for one,
   that one comes off as its block. */

const COVER_OVER = new Map();
let _coverOverN = 0;                     // cells holding any: a ray or a hook looks only when there are some
const COVER_OVER_BI = 10;                // a ray's `bi` on one: + its side (a plate in another cell is PLATE_OVER_BI, 9)
const COVER_EDGE = 0.25;                 // a cover's broad face clicked this near an edge: the new one on that edge's side
const COVER_SIDE_NEG = [2, 0, 4], COVER_SIDE_POS = [3, 1, 5];   // the side toward -axis / +axis (x, y, z)
const isCoverVal = (v) => CORE.shapeOfVal(v) === 'cover';
const coverSideOfVal = (v) => ((v >> 8) & 255) & ROT_MASK;
// the held block as a value (mat: its block | look << 16, and NEED_PAID when it took a need: given back when broken) made a
// cover on side s
const coverValOf = (mat, s) => ((mat & 0xFF00FF) | (mat & NEED_PAID) | ((SHAPE_COVER + s) << 8)) >>> 0;
// the side of a cell a face with this normal looks toward
const _coverToward = (nx, ny, nz) => ny > 0 ? 1 : ny < 0 ? 0 : nx > 0 ? 3 : nx < 0 ? 2 : nz > 0 ? 5 : 4;
const coverOverSide = (bi) => bi >= COVER_OVER_BI && bi < COVER_OVER_BI + 6 ? bi - COVER_OVER_BI : -1;

// the six covers lying in the cell (x, y, z), or null
function coversAt(x, y, z) {
  if (!_coverOverN) return null;
  const m = COVER_OVER.get(Math.floor(x / 16) + ',' + Math.floor(z / 16));
  return m ? (m.get(_plateCellI(x, y, z)) || null) : null;
}
const coverAt = (x, y, z, s) => { const c = coversAt(x, y, z); return c ? c[s] : 0; };
// put one on side s (v a cover value), or take it away (v 0); its chunk is meshed again
function setCoverOver(x, y, z, s, v) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16), ck = cx + ',' + cz, i = _plateCellI(x, y, z);
  let m = COVER_OVER.get(ck), c = m ? m.get(i) : null;
  if (!v && !(c && c[s])) return;
  if (!c) {
    if (!m) COVER_OVER.set(ck, m = new Map());
    m.set(i, c = [0, 0, 0, 0, 0, 0]);
    _coverOverN++;
  }
  c[s] = v >>> 0;
  if (!c.some(Boolean)) { m.delete(i); _coverOverN--; if (!m.size) COVER_OVER.delete(ck); }
  markDirty(getChunk(cx, cz));
}
// their boxes where they lie, by side (shapes/boxes.js), or null
function coverBoxesAt(x, y, z) {
  const c = coversAt(x, y, z);
  return c ? BLOCKS.coverOverBoxes(getBlock, x, y, z, getBlock(x, y, z), c) : null;
}

/* ---- what lies in another block's cell, a plate, a cover or a block fallen into a doorway (DOOR_FILL, blocks/doors.js),
   by the `bi` a ray gave it ---- */
function overValAt(x, y, z, bi) {
  if (bi === DOOR_FILL_BI) return doorFillAt(x, y, z);
  if (bi === RAIL_OVER_BI) return railOverAt(x, y, z);           // a fence or wall (blocks/rails.js)
  const s = coverOverSide(bi);
  return s >= 0 ? coverAt(x, y, z, s) : bi === PLATE_OVER_BI ? plateOverAt(x, y, z) : 0;
}
function overBoxesAt(x, y, z, bi) {
  if (bi === DOOR_FILL_BI) return doorFillBoxesAt(x, y, z);
  if (bi === RAIL_OVER_BI) return railBoxesAt(x, y, z);
  const s = coverOverSide(bi);
  if (s < 0) return plateOverBoxesAt(x, y, z);
  const bx = coverBoxesAt(x, y, z);
  return bx ? bx[s] : null;
}
// broken by a player or a blast: `drops` its block back; `quiet` when the caller made the sound
function breakOverAt(x, y, z, bi, drops, quiet) {
  if (bi === DOOR_FILL_BI) { breakDoorFill(x, y, z, drops, quiet); return; }
  if (bi === RAIL_OVER_BI) { breakRail(x, y, z, drops, quiet); return; }
  const s = coverOverSide(bi);
  if (s < 0) { breakPlateOver(x, y, z, drops, quiet); return; }
  const cv = coverAt(x, y, z, s);
  if (!cv) return;
  setCoverOver(x, y, z, s, 0);
  if (!quiet) {
    playBlockSound(cv & 255, 'break', x, y, z);
    if (typeof fxBreak === 'function') fxBreak(x, y, z, cv);
  }
  if (drops) for (const d of blockDrop(cv, false)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
}
// every cover in the cell broken at once (a blast); `drops` asked for each
function breakCoversAt(x, y, z, drops) {
  const c = coversAt(x, y, z);
  if (c) for (let s = 0; s < 6; s++) if (c[s]) breakOverAt(x, y, z, COVER_OVER_BI + s, drops(), true);
}

/* ---- putting one down (the header above) ---- */
// 'placed', 'taken' (no room, or one lies there already), or null: no block to lie beside, the usual placing goes on
function tryCoverOver(hit, mat) {
  const o = camera.position, px = o.x + _dir.x * hit.t - hit.x, py = o.y + _dir.y * hit.t - hit.y, pz = o.z + _dir.z * hit.t - hit.z;
  const P = [px, py, pz], ax = hit.nx ? 0 : hit.ny ? 1 : 2, n = hit.nx || hit.ny || hit.nz;
  const inner = n > 0 ? P[ax] < 1 - 1e-3 : P[ax] > 1e-3;     // the face clicked lies inside its cell, not on its edge
  let x = hit.x, y = hit.y, z = hit.z, s;
  if (inner) {
    const hv = getBlock(x, y, z);
    s = _coverToward(hit.nx, hit.ny, hit.nz);
    // a cover's broad face: near one of its edges, the new one goes on that edge's side
    const own = hit.over ? coverOverSide(hit.bi) : isCoverVal(hv) ? coverSideOfVal(hv) : -1;
    if (own >= 0 && BLOCKS.COVER_AXIS[own] === ax) {
      let best = COVER_EDGE;
      for (let k = 0; k < 3; k++) {
        if (k === ax) continue;
        if (P[k] < best) { best = P[k]; s = COVER_SIDE_NEG[k]; }
        if (1 - P[k] < best) { best = 1 - P[k]; s = COVER_SIDE_POS[k]; }
      }
    }
    // a plant or a torch, aimed at: the side the ray goes on out of its cell by (the floor, under grass looked down at)
    else if (!hit.over && BLOCKS.coverHostBoxes(getBlock, x, y, z, hv)?.length === 0) {
      let tMin = Infinity;
      const D = [_dir.x, _dir.y, _dir.z];
      for (let k = 0; k < 3; k++) {
        if (!D[k]) continue;
        const t = ((D[k] > 0 ? 1 : 0) - P[k]) / D[k];
        if (t < tMin) { tMin = t; s = D[k] > 0 ? COVER_SIDE_POS[k] : COVER_SIDE_NEG[k]; }
      }
    }
  } else {
    x += hit.nx; y += hit.ny; z += hit.nz;
    s = _coverToward(-hit.nx, -hit.ny, -hit.nz);              // against the face clicked
  }
  const host = getBlock(x, y, z), id = host & 255;
  if (!id || id === B.WATER || id === B.LAVA) return null;    // an empty cell: the cover goes in as its block
  if (!BLOCKS.coverHostBoxes(getBlock, x, y, z, host)) return null;   // a whole block, a door...: nothing lies beside it
  if (plateOverAt(x, y, z) || railOverAt(x, y, z) || (isCoverVal(host) && coverSideOfVal(host) === s)) return 'taken';
  const next = (coversAt(x, y, z) || [0, 0, 0, 0, 0, 0]).slice();
  if (next[s]) return 'taken';
  next[s] = coverValOf(mat, s);
  const bx = BLOCKS.coverOverBoxes(getBlock, x, y, z, host, next);
  if (!bx || next.some((v, k) => v && !bx[k])) return 'taken';   // no room for it, or it would leave none for one there
  setCoverOver(x, y, z, s, next[s]);
  playBlockSound(mat & 255, 'place', x, y, z);
  return 'placed';
}

/* A prefab's covers lying in other blocks' cells (`covers`: [dx, dy, dz, id, variant, look?], captureStructure in
   34-structures.js), laid once its blocks are down; one with no room where it goes is left out. `swap`: the block swaps
   it was laid with. */
function applyStructureCovers(prefab, ox, oy, oz, swap = null) {
  if (!prefab || !Array.isArray(prefab.covers)) return;
  for (const p of prefab.covers) {
    if (!Array.isArray(p) || p.length < 5 || !p.slice(0, 5).every(Number.isInteger)) continue;
    const [dx, dy, dz, id0, variant, look = 0] = p, x = ox + dx, y = oy + dy, z = oz + dz;
    const id = swap && swap[id0] != null ? swap[id0] | 0 : id0;
    const cv = (id | ((variant & 255) << 8) | ((look & 255) << 16)) >>> 0, host = getBlock(x, y, z), s = coverSideOfVal(cv);
    if (!PROPS[id] || !PROPS[id].shapes?.cover || ((variant & 255) & SHAPE_MASK) !== SHAPE_COVER || s > 5) continue;
    const next = (coversAt(x, y, z) || [0, 0, 0, 0, 0, 0]).slice();
    if (next[s]) continue;
    next[s] = cv;
    const bx = (host & 255) ? BLOCKS.coverOverBoxes(getBlock, x, y, z, host, next) : null;
    if (bx && bx[s]) setCoverOver(x, y, z, s, cv);
  }
}
// the covers lying in a prefab's volume (v: structVolume), as the prefab keeps them
function structureCoversIn(v) {
  const out = [];
  for (const [ck, m] of COVER_OVER) {
    const [cx, cz] = ck.split(',').map(Number);
    for (const [i, c] of m) {
      const dx = cx * 16 + (i & 15) - v.x0, dy = (i >> 8) - v.y0, dz = cz * 16 + ((i >> 4) & 15) - v.z0;
      if (dx < 0 || dy < 0 || dz < 0 || dx >= v.w || dy >= v.h || dz >= v.l) continue;
      for (const cv of c) if (cv) out.push(lookOf(cv) ? [dx, dy, dz, cv & 255, (cv >> 8) & 255, lookOf(cv)] : [dx, dy, dz, cv & 255, (cv >> 8) & 255]);
    }
  }
  return out;
}

/* ---- setBlock's hook (chunks/block-access.js) ---- */
const _coverJoins = (v) => { const s = CORE.shapeOfVal(v); return s === 'fence' || s === 'wall' || s === 'stairs'; };
function coverChanged(x, y, z, oldVal, val) {
  if (!_coverOverN) return;
  const c = coversAt(x, y, z);
  if (c) _coversHeld(x, y, z, val, c);
  // a fence, a wall or stairs beside: what joins them changed, and with it the room the covers by them have
  if (_coverJoins(oldVal) || _coverJoins(val))
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const nc = (dx || dz) ? coversAt(x + dx, y, z + dz) : null;
      if (nc) _coversHeld(x + dx, y, z + dz, getBlock(x + dx, y, z + dz), nc);
    }
}
function _coversHeld(x, y, z, host, c) {
  // emptied: the first of them becomes the cell's block (its own hook then finds the rest lying on it)
  if (!(host & 255)) {
    const s = c.findIndex(Boolean), cv = c[s];
    setCoverOver(x, y, z, s, 0);
    setBlock(x, y, z, cv);
    return;
  }
  const bx = BLOCKS.coverOverBoxes(getBlock, x, y, z, host, c);
  for (let s = 0; s < 6; s++) {
    if (!c[s] || (bx && bx[s])) continue;
    const cv = c[s];                                      // no room for it now: it comes off as its block
    setCoverOver(x, y, z, s, 0);
    if (!player.canFly) for (const d of blockDrop(cv)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
  }
}

/* ---- the save ---- */
function serializeCoverOver() {
  const out = [];
  for (const [ck, m] of COVER_OVER) {
    const [cx, cz] = ck.split(',').map(Number);
    for (const [i, c] of m) for (const cv of c) if (cv) out.push([cx * 16 + (i & 15), i >> 8, cz * 16 + ((i >> 4) & 15), cv]);
  }
  return out;
}
// as a world loads (its chunks are not in yet: nothing to mesh again)
function restoreCoverOver(list) {
  COVER_OVER.clear();
  _coverOverN = 0;
  if (!Array.isArray(list)) return;
  for (const r of list) {
    if (!Array.isArray(r) || !r.slice(0, 4).every(Number.isInteger)) continue;
    const cv = r[3] >>> 0, s = coverSideOfVal(cv);
    if (!isCoverVal(cv) || s > 5) continue;
    const ck = Math.floor(r[0] / 16) + ',' + Math.floor(r[2] / 16), i = _plateCellI(r[0], r[1], r[2]);
    let m = COVER_OVER.get(ck);
    if (!m) COVER_OVER.set(ck, m = new Map());
    let c = m.get(i);
    if (!c) { m.set(i, c = [0, 0, 0, 0, 0, 0]); _coverOverN++; }
    c[s] = cv;
  }
}
