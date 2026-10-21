'use strict';
/* player/placing.js: the right button, before the block goes down. Filling half slabs, which variant a chiselled
   block takes from where you click, buckets, the offhand, and doPlace. */

// `mat`: the held block as a value, id | look << 16; the halves of a mixed slab are side-list entries (stackEntry)
function _fillHalf(x, y, z, mat) {
  const p = player.pos, R = player.R;              // cell becomes full — don't squash the player
  if (x + 1 > p.x - R && x < p.x + R && y + 1 > p.y && y < p.y + player.H &&
      z + 1 > p.z - R && z < p.z + R) return false;
  const hv = getBlock(x, y, z);
  if (matKey(hv) === mat) setBlock(x, y, z, mat);
  else {
    const r = ((hv >> 8) & 255) & ROT_MASK;         // the half already there; the new one goes in the other
    const e = stackEntry(mat), have = stackEntry(hv);
    if (r & 1) setSlabMix(x, y, z, e, have, r & 6); else setSlabMix(x, y, z, have, e, r);
  }
  playBlockSound(mat & 255, 'place', x, y, z);
  handPlaceSwing = true;
  spendHeld("placed");
  chiselWear();
  return true;
}
/* The variant a chisel shape goes down in, from where it was clicked:
     stairs          full side toward the player; a ceiling click turns them upside down
     slab            always flat; a ceiling click, or the upper half of a wall, hangs it high
     vertical slab   hugs the clicked wall; on a floor or ceiling it takes the half away from you
     pane            through the middle, its wide face toward you
     fence           a post; its rails follow the fences around it, so nothing to choose */
function _shapeVariantFor(key, hit, px, py, pz) {
  const ddx = player.pos.x - (px + 0.5), ddz = player.pos.z - (pz + 0.5), alongX = Math.abs(ddx) > Math.abs(ddz);
  if (key === 'carpet') return SHAPE_LAYER;                 // one layer
  if (key === 'wall') return SHAPE_WALL;                    // joins its neighbours on its own
  if (key === 'cover') {
    /* A cover goes where it hides something:
         over a hole (walled in on 3+ sides, open above)  a lid flush with the top of the cell
         in a doorway (walled on both sides along one axis) a plate flush with the wall, on your side —
                                                             click the floor of the gap or its side jamb
         anywhere else                                      flat against the face you clicked */
    const S = (dx, dy, dz) => CORE.solidVal(getBlock(px + dx, py + dy, pz + dz));
    const xp = S(1, 0, 0), xn = S(-1, 0, 0), zp = S(0, 0, 1), zn = S(0, 0, -1);
    const walls = xp + xn + zp + zn;
    if (hit.ny !== -1 && walls >= 3 && !S(0, 1, 0)) return SHAPE_COVER + 1;
    const alongX = xp && xn, alongZ = zp && zn;
    if (hit.ny !== -1 && alongX !== alongZ && (hit.ny === 1 || (alongX ? hit.nx : hit.nz)))
      return alongX ? SHAPE_COVER + (ddz > 0 ? 5 : 4) : SHAPE_COVER + (ddx > 0 ? 3 : 2);
    return SHAPE_COVER + (hit.ny === 1 ? 0 : hit.ny === -1 ? 1 : hit.nx === 1 ? 2 : hit.nx === -1 ? 3 : hit.nz === 1 ? 4 : 5);
  }
  if (key === 'pane') return SHAPE_PANE + (alongX ? 1 : 0);
  if (key === 'fence') return SHAPE_FENCE;
  if (key === 'stairs') return SHAPE_STAIRS + ((alongX ? (ddx > 0 ? 2 : 3) : (ddz > 0 ? 0 : 1)) | (hit.ny === -1 ? 4 : 0));
  if (key === 'slab') {
    const fy = camera.position.y + _dir.y * hit.t - py;
    return SHAPE_SLAB + (hit.ny === 1 ? 0 : hit.ny === -1 ? 1 : fy > 0.5 ? 1 : 0);
  }
  if (hit.ny === 0) return SHAPE_SLAB + (hit.nx === 1 ? 2 : hit.nx === -1 ? 3 : hit.nz === 1 ? 4 : 5);
  return SHAPE_SLAB + (alongX ? (ddx > 0 ? 2 : 3) : (ddz > 0 ? 4 : 5));
}
// swap the held bucket to a new item id (creative: no change — treated as infinite)
function _swapHeld(newId) {
  if (player.canFly) return;
  // a bucket filling or emptying is one item becoming another, so the feed shows both halves
  const oldId = slotId(HOTBAR[hotbarSel]);
  if (typeof feedItem === 'function') {
    if (oldId != null && oldId !== newId) feedItem(oldId, -1, 'used');
    if (newId != null && newId !== oldId) feedItem(newId, 1, 'used');
  }
  HOTBAR[hotbarSel] = newId != null ? mkSlot(newId, 1) : null;
  saveHotbar(); updateHotbar(); buildHotbar();
}
// march the camera ray in small steps; return {x,y,z} of the first LAVA source before any solid
function _rayLava(maxDist = 6) {
  camera.getWorldDirection(_dir);
  const o = camera.position;
  for (let t = 0; t <= maxDist; t += 0.15) {
    const x = Math.floor(o.x + _dir.x * t), y = Math.floor(o.y + _dir.y * t), z = Math.floor(o.z + _dir.z * t);
    const val = getBlock(x, y, z), id = val & 255;
    if (id === B.LAVA) return ((val >> 8) & 7) === 0 ? { x, y, z } : null;   // source only (level bits 0-2)
    if (id !== B.AIR) return null;
  }
  return null;
}
// march the camera ray in small steps; return {x,y,z} of the first WATER cell before any solid
function _rayWater(maxDist = 6) {
  camera.getWorldDirection(_dir);
  const o = camera.position;
  for (let t = 0; t <= maxDist; t += 0.15) {
    const x = Math.floor(o.x + _dir.x * t), y = Math.floor(o.y + _dir.y * t), z = Math.floor(o.z + _dir.z * t);
    const val = getBlock(x, y, z), id = val & 255;
    if (id === B.WATER) return ((val >> 8) & 7) === 0 ? { x, y, z } : null;   // source only, not flowing (a river's top too)
    if (id !== B.AIR) return null;          // hit something solid first — no water grabbed
  }
  return null;
}
function useBucket(heldId, hit) {
  handPlaceSwing = true;
  if (heldId === ITEM.BUCKET) {             // fill: try water source first, then lava source
    const w = _rayWater();
    if (w) {
      setBlock(w.x, w.y, w.z, B.AIR);
      dryWaterFrom(w.x, w.y, w.z);
      _swapHeld(ITEM.WATER_BUCKET);
      return;
    }
    const lv = _rayLava();
    if (lv) {
      setBlock(lv.x, lv.y, lv.z, B.AIR);
      queueLavaAround(lv.x, lv.y, lv.z);
      _swapHeld(ITEM.LAVA_BUCKET);
    }
  } else if (heldId === ITEM.WATER_BUCKET) { // pour water
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    const cur = getBlock(px, py, pz) & 255;
    if (cur !== B.AIR && cur !== B.WATER) return;
    setBlock(px, py, pz, B.WATER);
    if (typeof notePlacedWater === 'function') notePlacedWater(px, py, pz);   // not to drink or bottle (player/drinking.js)
    queueWaterAt(px, py, pz);
    _swapHeld(ITEM.BUCKET);
  } else if (heldId === ITEM.LAVA_BUCKET) {  // pour lava
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    const cur = getBlock(px, py, pz) & 255;
    if (cur !== B.AIR && cur !== B.LAVA) return;
    setBlock(px, py, pz, B.LAVA);
    queueLavaAt(px, py, pz);
    _swapHeld(ITEM.BUCKET);
  }
}
// every block edit inside a place action is the player's own work — see player/leveling.js
/* Placing from the OFFHAND. With a placeable block in the offhand (a torch) and nothing
   in the main hand that uses right click, a right click places the offhand block — a torch in
   the left hand, a pick in the right. Done by swapping the offhand stack into the selected hotbar
   slot for the length of the place, so every consumption path in _doPlace (there are several)
   takes from the right stack without being taught about hands; whatever is left goes straight
   back. The LEFT arm does the swing. */
function _offhandPlaceable() {
  const s = typeof offhandSlot === 'function' ? offhandSlot() : null;
  if (!s || s.id >= 256 || typeof OFFHAND_BLOCKS === 'undefined' || !OFFHAND_BLOCKS.has(s.id)) return null;
  if (typeof mainHandUsesRightClick === 'function' && mainHandUsesRightClick(slotId(HOTBAR[hotbarSel]))) return null;
  return s;
}
// the crosshair is on a door or a chest (what a key locks)
function _aimsAtLockable() {
  const hit = currentRay();
  if (!hit) return false;
  const v = getBlock(hit.x, hit.y, hit.z);
  return BLOCKS.isDoorVal(v) || isChestId(v & 255);
}
function doPlace() {
  // a wand in hand builds or breaks a layer, whatever the off hand holds (breaking 0.8374)
  const wand = slotId(HOTBAR[hotbarSel]);
  if (wand === ITEM.BUILD_WAND || wand === ITEM.BREAK_WAND)
    return withPlayerPlacement(() => { const hit = currentRay(); if (hit) (wand === ITEM.BUILD_WAND ? wandBuild : wandBreak)(hit); });
  return withPlayerPlacement(() => {
    const off = _offhandPlaceable();
    // a door or a chest answers to the main hand: its key is looked for there (useDoor, useChest), never the off hand's torch
    if (!off || _aimsAtLockable()) return _doPlace();
    const main = HOTBAR[hotbarSel], before = off.count;
    HOTBAR[hotbarSel] = off;
    try { return _doPlace(); }
    finally {
      const left = HOTBAR[hotbarSel];
      equipSlots[EQUIP_INDEX.offhand] = left;              // null once the last one is placed
      HOTBAR[hotbarSel] = main;
      if (!left || left.count !== before) { handPlaceSwing = false; player._offSwingT = 0.25; }
      saveHotbar(); buildHotbar(); updateHotbar(); saveEquip();
      if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
    }
  });
}
/* The wands, creative only. Right-click a block's face and the wand takes every block JOINED to it across that face:
   the very same block, look, shape and turn, in the face's plane, touching side by side or corner to corner (
   only side by side in 0.8371) — a gap parts them.
     the BUILDING wand lays a copy one cell out on each of them, wherever that cell is free (air, water, a
       plant): a wall clicked on its side grows a course thicker, on its top a course taller; a floor a layer up. A
       grown log is copied as a placed log on the same axis (no tree's width, so it never fells).
     the BREAKING wand takes them all away, as creative breaks: no drops.
   Up to WAND_MAX at once, the nearest first, within WAND_REACH of the click. Blocks with a mesh or storage of their own
   (door, bed, chest, furnace...), plants, torches and mixed stacks are left alone. While a wand is held, what it would
   do is outlined (updateWandOutline): one outline round the lot, seen through the blocks in front. */
const WAND_MAX = 256, WAND_REACH = 48;
const WAND_SKIP = new Set([B.AIR, B.WATER, B.LAVA, B.DOOR, B.BED, B.CHEST, B.METAL_CHEST,B.FURNACE, B.CRAFTING_BENCH, B.MORTAR,
                           B.STRUCTURE_BLOCK, B.TNT, B.BEDROCK, B.FIRE]);
// the plane's eight neighbours: side by side, then corner to corner
const _wandSteps = (A) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  .map(([a, b]) => [A[0][0] * a + A[1][0] * b, A[0][1] * a + A[1][1] * b, A[0][2] * a + A[1][2] * b]);
