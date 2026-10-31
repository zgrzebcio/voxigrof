'use strict';
/* blocks/ladders.js: what holds a ladder up, a ladder put on the end of another, and a second ladder or vine in a corner. A
   ladder is a hammer shape of planks, the iron block or a stone (SHAPE_LADDER, shapes/shapes.js; its boxes in
   shapes/boxes.js), climbed like a vine (playerOnClimbable, player/movement.js), its variant from the click in
   player/placing.js (_shapeVariantFor) and put down in player/place-block.js.
   WHAT HOLDS IT: ladders stacked straight up and down are one COLUMN, held while any of them has a solid block behind it,
   the lowest stands on a solid block or the highest hangs from one. So one ladder fixed to a wall carries a long run up
   through open air. A column nothing holds any more comes down whole, each ladder dropping its block (ladderChanged,
   setBlock's hook in chunks/block-access.js).
   ITS BOARD: a thin board at its back collides (LADDER_COLL); a ladder put down where a body stands shoves it out in front.
   CORNERS: a ladder, a vine or a glow vine put on the other wall of an inside corner whose cell holds one already goes into
   that cell beside it (tryWallPair): variant bit WALL_PAIR, the second on the side a quarter round (WALL_NEXT,
   blocks/glow-and-storage.js). Of the same block, the cell is that block; of two different ones (an oak ladder and an iron
   one, a ladder and a vine) the cell is one and names the other in its bits 25-30 (WALL_MATES, shapes/boxes.js). Either way
   wallParts gives the two as values alone, and everything here works on those: a corner's ladder and its vine each keep
   their own rules (woods/vines.js). It breaks one at a time, the one aimed at (player/tick.js, player/breaking.js), and as a
   whole it is two (blockDrop, 50-loottable.js). */

const { WALL_PAIR, wallSides, wallPairVar, WALL_MATES, WALL_MATE_SHIFT, WALL_MATE_FIRST } = BLOCKS;
const LADDER_COLUMN_MAX = 64;                              // how far a column is followed up and down
const LADDER_EXTEND = 6;                                   // how far along its column a ladder clicked takes the next one
const _LADDER_BACK = [[0, -1], [0, 1], [-1, 0], [1, 0]];   // the side a ladder's back is on (its variant's bits 0-1) as [dx, dz]
const isLadderVal = (v) => CORE.shapeOfVal(v) === 'ladder';
const ladderSideOf = (v) => (v >> 8) & 3;
// a ladder or a vine (a wall plate) that is two in a corner
const wallPaired = (v) => !!(((v >> 8) & 255) & WALL_PAIR) && BLOCKS.isWallPlateVal(v);
// the one or two plates of a cell, each as a value alone (in a corner: its first side, then the second)
const wallParts = (v) => wallPaired(v) ? BLOCKS.wallPairParts(v) : [v];
const wallSingle = (v, k) => wallParts(v)[k];
// a corner of two different blocks (its other block's WALL_MATES number), else 0
const wallMateOf = (v) => BLOCKS.wallMateOf(v);
// a ladder in the cell (alone, or one of a corner's two), and the sides its ladders' backs are on
const hasLadder = (v) => isLadderVal(v) || (wallPaired(v) && wallParts(v).some(isLadderVal));
const ladderSidesOf = (v) => wallPaired(v) ? wallParts(v).filter(isLadderVal).map(ladderSideOf) : isLadderVal(v) ? [ladderSideOf(v)] : [];
/* the ladder at a cell: the cell's own value when it holds one (alone or in a corner), else one lying in another block's
   cell (a slab's, stairs', a carpet's, a plant's: RAIL_OVER, blocks/rails.js), else 0 */
function ladderValAt(x, y, z) {
  const v = getBlock(x, y, z);
  if (hasLadder(v)) return v;
  const r = railOverAt(x, y, z);
  return r && isLadderVal(r) ? r : 0;
}

// the boards a body runs into at a cell (its ladder, a corner's ladders, one lying in the cell), or null
function ladderBoardsAt(x, y, z, v = getBlock(x, y, z)) {
  let out = null;
  if (wallMateOf(v)) out = BLOCKS.wallPairBoxes(v, 2).flat();
  else if (isLadderVal(v)) out = CORE.shapeBoxesAt(getBlock, x, y, z, v, true);
  const r = railOverAt(x, y, z);
  if (r && isLadderVal(r)) out = (out || []).concat(BLOCKS.LADDER_COLL[ladderSideOf(r)]);
  return out && out.length ? out : null;
}

// the column the ladder at (x, y, z) is in: its lowest and highest y
function _ladderColumn(x, y, z) {
  let lo = y, hi = y;
  while (lo > 0 && y - lo < LADDER_COLUMN_MAX && ladderValAt(x, lo - 1, z)) lo--;
  while (hi < WORLD_TOP && hi - y < LADDER_COLUMN_MAX && ladderValAt(x, hi + 1, z)) hi++;
  return [lo, hi];
}
// is there a solid block behind any of these sides at (x, y, z)?
const _ladderBacked = (x, y, z, sides) => sides.some(s => isSolid(x + _LADDER_BACK[s][0], y, z + _LADDER_BACK[s][1]));
// does anything hold the column the ladder at (x, y, z) is in?
function ladderColumnHeld(x, y, z) {
  const [lo, hi] = _ladderColumn(x, y, z);
  if (isSolid(x, lo - 1, z) || isSolid(x, hi + 1, z)) return true;
  for (let yy = lo; yy <= hi; yy++) if (_ladderBacked(x, yy, z, ladderSidesOf(ladderValAt(x, yy, z)))) return true;
  return false;
}
// may a ladder with its back on `side` go into (x, y, z)? Something to hold it there, or a ladder over or under it to join
function ladderCanStand(x, y, z, side) {
  return _ladderBacked(x, y, z, [side & 3]) || isSolid(x, y - 1, z) || isSolid(x, y + 1, z)
      || !!ladderValAt(x, y - 1, z) || !!ladderValAt(x, y + 1, z);
}
/* One of a cell's plates comes off (k: its place in wallParts): the other stays as the cell's block, or the cell empties.
   `drop`: it falls as what it is (none in creative). */
function wallPartOff(x, y, z, k, drop) {
  const parts = wallParts(getBlock(x, y, z)), off = parts[k];
  setBlock(x, y, z, parts.length > 1 ? parts[1 - k] : B.AIR);
  if (typeof fxBreak === 'function') fxBreak(x, y, z, off);
  if (drop && !player.canFly) for (const d of blockDrop(off)) spawnDrop(d.id, x, y, z, null, undefined, null, null, 0, d.count);
}
// the ladders of one cell of a column nothing holds come down, dropping their block (a vine beside them stays, and the
// block one lay in)
function _ladderDrop(x, y, z) {
  if (!hasLadder(getBlock(x, y, z))) { breakRail(x, y, z, !player.canFly, false); return; }
  const parts = wallParts(getBlock(x, y, z)), lad = parts.map(isLadderVal);
  if (lad.every(Boolean)) {
    const v = getBlock(x, y, z);
    setBlock(x, y, z, B.AIR);
    if (typeof fxBreak === 'function') fxBreak(x, y, z, v);
    if (!player.canFly) for (const d of blockDrop(v)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
  } else wallPartOff(x, y, z, lad.indexOf(true), true);
}
/* A ladder put down (or turned) where this seat's body stands: the body goes out in front of its boards, which would
   otherwise hold it inside them (the collision only pushes a body out of a box it moves into). */
function _ladderShove(x, y, z, v) {
  const p = player.pos, R = player.R, H = player.H, E = 0.001;
  for (const part of wallParts(v)) {
    if (!isLadderVal(part)) continue;
    const s = ladderSideOf(part);
    for (const b of CORE.shapeBoxesAt(getBlock, x, y, z, part, true)) {
      if (!(p.x - R < x + b[3] && p.x + R > x + b[0] && p.y < y + b[4] && p.y + H > y + b[1] && p.z - R < z + b[5] && p.z + R > z + b[2])) continue;
      if (s === 0) p.z = z + b[5] + R + E; else if (s === 1) p.z = z + b[2] - R - E;
      else if (s === 2) p.x = x + b[3] + R + E; else p.x = x + b[0] - R - E;
    }
  }
}
/* setBlock's hook, and setRailOver's for a ladder lying in another block's cell (old and new are then that ladder or 0).
   Only a cell turning solid or not, or a ladder put down, taken or losing a side, can change what holds one: the columns
   over and under it and the ladders beside it with their back on it are asked (and its own column when it lost a side), and
   one nothing holds comes down whole. A ladder put down is never asked about itself here: placing it checked its room
   (ladderCanStand), and a prefab may lay a ladder before the wall behind it. */
let _ladderDropping = false;
function ladderChanged(x, y, z, oldVal, val) {
  if (_ladderDropping) return;
  const was = hasLadder(oldVal), now = hasLadder(val);
  if (now && oldVal !== val) _ladderShove(x, y, z, val);
  const lost = was && now && ladderSidesOf(oldVal).some(s => !ladderSidesOf(val).includes(s));
  if (!lost && was === now && CORE.solidVal(oldVal) === CORE.solidVal(val)) return;
  const ask = lost ? [[x, y, z]] : [];
  if (ladderValAt(x, y + 1, z)) ask.push([x, y + 1, z]);
  if (ladderValAt(x, y - 1, z)) ask.push([x, y - 1, z]);
  for (let s = 0; s < 4; s++) {
    const d = _LADDER_BACK[s], nx = x - d[0], nz = z - d[1];
    if (ladderSidesOf(ladderValAt(nx, y, nz)).includes(s)) ask.push([nx, y, nz]);
  }
  if (!ask.length) return;
  _ladderDropping = true;                                   // a column coming down is dropped whole, not asked again cell by cell
  try {
    for (const [ax, ay, az] of ask) {
      if (!ladderValAt(ax, ay, az) || ladderColumnHeld(ax, ay, az)) continue;
      const [lo, hi] = _ladderColumn(ax, ay, az);
      for (let yy = lo; yy <= hi; yy++) _ladderDrop(ax, yy, az);
    }
  } finally { _ladderDropping = false; }
}
/* A ladder in hand clicked on a ladder: the next one goes on the end of that column, up (down while you look down), on the
   side of the one clicked (in a corner, the board aimed at), LADDER_EXTEND at most from it. `mat`: the held block | look
   << 16, and NEED_PAID when it took a need (blocks/variants.js). 'placed', 'taken' (that end is not free, or too far), or
   null: no ladder was clicked (a corner's vine: the click places as on anything else). */
function tryExtendLadder(hit, mat) {
  const v = getBlock(hit.x, hit.y, hit.z);
  const part = hit.over ? (hit.bi === RAIL_OVER_BI ? railOverAt(hit.x, hit.y, hit.z) : 0) : wallParts(v)[hit.bi || 0] ?? v;
  if (!isLadderVal(part)) return null;
  const side = ladderSideOf(part), lv = ((mat & 0xFF00FF) | (mat & NEED_PAID) | ((SHAPE_LADDER | side) << 8)) >>> 0;
  const dir = player.pitch < -0.35 ? -1 : 1;
  let y = hit.y;
  while (Math.abs(y - hit.y) <= LADDER_EXTEND && ladderValAt(hit.x, y, hit.z)) y += dir;
  if (Math.abs(y - hit.y) > LADDER_EXTEND || y < 1 || y > WORLD_TOP) return 'taken';
  if (plateOverAt(hit.x, y, hit.z) || coversAt(hit.x, y, hit.z) || railOverAt(hit.x, y, hit.z)) return 'taken';
  const host = getBlock(hit.x, y, hit.z);
  if (BLOCKS.railHostOk(host, lv)) setRailOver(hit.x, y, hit.z, lv);   // up through a slab, stairs, a carpet, a plant
  else if (!isPlaceableInto(host & 255)) return 'taken';
  else { clearPlantAt(hit.x, y, hit.z); setBlock(hit.x, y, hit.z, lv); }
  playBlockSound(mat & 255, 'place', hit.x, y, hit.z);
  return 'placed';
}
/* A ladder put into the cell of a block it can lie in (a slab, stairs, a carpet or a layer stack, a plant: railHostOk,
   shapes/boxes.js), as a fence goes onto a slab: the cell clicked when the face lies inside it (a slab's top), else the
   one in front of the face. Its side as anywhere (_shapeVariantFor, player/placing.js). 'placed', 'taken' (something lies
   there already), 'warned' (nothing holds it there), or null: the usual placing goes on. */
function tryLadderOver(hit, mat) {
  if (hit.over) return null;
  const o = camera.position, P = [o.x + _dir.x * hit.t - hit.x, o.y + _dir.y * hit.t - hit.y, o.z + _dir.z * hit.t - hit.z];
  const ax = hit.nx ? 0 : hit.ny ? 1 : 2, n = hit.nx || hit.ny || hit.nz;
  const inner = n > 0 ? P[ax] < 1 - 1e-3 : P[ax] > 1e-3;
  const x = inner ? hit.x : hit.x + hit.nx, y = inner ? hit.y : hit.y + hit.ny, z = inner ? hit.z : hit.z + hit.nz;
  const host = getBlock(x, y, z), va = _shapeVariantFor('ladder', hit, x, y, z);
  const lv = ((mat & 0xFF00FF) | (mat & NEED_PAID) | ((va & 255) << 8)) >>> 0;
  if (!BLOCKS.railHostOk(host, lv)) return null;
  if (railOverAt(x, y, z) || plateOverAt(x, y, z) || coversAt(x, y, z)) return 'taken';
  if (!ladderCanStand(x, y, z, va & 3)) { feedWarn('A ladder needs a block behind, under or over it, or a ladder above or below'); return 'warned'; }
  setRailOver(x, y, z, lv);
  playBlockSound(mat & 255, 'place', x, y, z);
  return 'placed';
}
/* A ladder or a vine put on the side of a block (hit), into the cell (px, py, pz) where a ladder, a vine or a glow vine
   already stands alone on the other wall of the corner: the two share the cell. `mat`: the held block | look << 16, and
   NEED_PAID when it took a need; `ladder`: it goes on as a ladder (else as its plate). Of the same block and look the cell
   is that block; else one of the two is the cell's own block and the other its mate, always plain (WALL_MATES): the one
   with a look is the cell's own (two with a look cannot share), then a glow vine (its light is the cell's block's), then
   the one already there. A vine hangs on a solid block's side only. True when it went in; 'warned' when it was refused
   with a word. */
function tryWallPair(hit, px, py, pz, mat, ladder) {
  if (hit.over || hit.ny || !(hit.nx || hit.nz)) return false;
  const tv = getBlock(px, py, pz), va = (tv >> 8) & 255;
  if (!BLOCKS.isWallPlateVal(tv) || (va & WALL_PAIR)) return false;
  if (!ladder && !isSolid(hit.x, hit.y, hit.z)) return false;
  if ((mat & 255) === B.VINE && !ladder && isWaterVal(tv)) { feedWarn('A vine does not grow in water'); return 'warned'; }
  const side = hit.nz === 1 ? 0 : hit.nz === -1 ? 1 : hit.nx === 1 ? 2 : 3;   // the wall clicked is the one behind it
  const pv = wallPairVar(va & 3, side);
  if (pv < 0) return false;
  const nv = ladder ? ((mat & 0xFF00FF) | (mat & NEED_PAID) | ((SHAPE_LADDER | side) << 8)) >>> 0
                    : ((mat & 0xFF00FF) | (mat & NEED_PAID) | (side << 8)) >>> 0;
  let cell;
  if (matKey(tv) === matKey(nv) && isLadderVal(tv) === ladder) cell = ((tv & ~(7 << 8)) | ((pv & 7) << 8)) >>> 0;
  else {
    const tLook = lookOf(tv), nLook = lookOf(nv);
    if (tLook && nLook) { feedWarn('Two blocks with a look cannot share a corner'); return 'warned'; }
    const glow = (v) => (v & 255) === B.GLOW_VINE;
    const ownNew = nLook ? true : tLook ? false : glow(nv) && !glow(tv);
    const own = ownNew ? nv : tv, mate = ownNew ? tv : nv, m = WALL_MATES.indexOf(mate & 255);
    if (m < 1) return false;
    // the own block's variant: a ladder's shape or a vine's side, the corner's first side; its mate first when the own one is second
    const first = ladderSideOf(own) !== (pv & 3);
    const ova = isLadderVal(own) ? (SHAPE_LADDER | pv) : pv;
    cell = ((own & ~(0xFF << 8) & ~(31 << WALL_MATE_SHIFT) & ~WALL_MATE_FIRST) | (ova << 8) | (m << WALL_MATE_SHIFT)
           | (first ? WALL_MATE_FIRST : 0) | (tv & CORE.WATERLOGGED)) >>> 0;
  }
  setBlock(px, py, pz, cell);
  playBlockSound(nv & 255, 'place', px, py, pz);
  return true;
}
