'use strict';
/* player/breaking.js: breaking a block by hand in creative, spending the held item, carving a pumpkin, clearing a
   plant out of a cell, and the ray under the crosshair. */

/* Spend one of the held stack after something has been successfully placed or used.
   Nine placement paths repeated these same four lines, none of which could tell the item feed what
   had just left your hand; they all call this instead. Creative slots are ephemeral, so it does
   nothing there — exactly as the inline `if (!player.canFly)` guards it replaced did. */
function spendHeld(reason = 'used') {
  if (player.canFly) return;
  const slot = HOTBAR[hotbarSel];
  if (!slot) return;
  if (typeof feedItem === 'function') feedItem(slot.id, -1, reason);
  // the thing a placed pick takes beside itself (a mossy look's vine, a chest's planks: _placeNeed, set by _doPlace in
  // player/place-block.js), once a placement
  if (reason === 'placed' && _placeNeed != null) {
    const need = _placeNeed;
    _placeNeed = null;
    if (_takeIngredients({ in: [[need, 1]], out: [need, 1] })) {
      if (typeof feedItem === 'function') feedItem(need, -1, 'used');
      saveAll();
    }
  }
  slot.count--;
  if (slot.count <= 0) HOTBAR[hotbarSel] = null;
  saveHotbar(); updateHotbar(); buildHotbar();
}

/* Carving: shears right-clicked on a pumpkin carve a face in it, turned toward you, for one point of wear;
   a torch right-clicked on a carved pumpkin goes inside and lights it. The crosshair passes over gourds (noTarget),
   so holding shears or a torch makes it stop on the one it can work (carveTargets, raycastVoxel in player/movement.js). */
function carveTargets(id) {
  const held = heldUseId();
  if (held == null) return false;
  if (id === B.PUMPKIN) return held >= 256 && ITEM_PROPS[held]?.tool === 'shears';
  if (id === B.CARVED_PUMPKIN) return held === B.TORCH;
  return false;
}
function tryCarvePumpkin(hit) {
  if (!hit || !carveTargets(hit.id)) return false;
  const { x, y, z } = hit;
  if (hit.id === B.PUMPKIN) {
    // the face toward you, the way a rot:'side' block is placed
    const ddx = player.pos.x - (x + 0.5), ddz = player.pos.z - (z + 0.5);
    const facing = Math.abs(ddx) > Math.abs(ddz) ? (ddx > 0 ? 2 : 3) : (ddz > 0 ? 0 : 1);
    setBlock(x, y, z, B.CARVED_PUMPKIN | (facing << 8));
    playBlockSound(B.PUMPKIN, 'break', x, y, z);
    addXP(XP_CARVE, 'carving');                                                   // 0.8281
    const slot = HOTBAR[hotbarSel];
    if (!player.canFly && slot && slot.dur != null) {
      if (wearSlot(slot) === 'gone') HOTBAR[hotbarSel] = null;
      saveHotbar(); buildHotbar(); updateHotbar();
    }
  } else {
    setBlock(x, y, z, B.JACK_O_LANTERN | (getBlock(x, y, z) & 0xFF00));   // keeps its facing
    playBlockSound(B.TORCH, 'place', x, y, z);
    spendHeld('used');
    addXP(XP_LANTERN, 'lighting a lantern');                                                 // 0.8281
  }
  return true;
}

/* Blocks a placement simply overwrites, the way air does. Only the grass billboards qualify —
   flowers, saplings and torches are deliberate placements and must not be silently destroyed. */
const PLANT_REPLACE = [B.SHORT_GRASS, B.TALLGRASS, B.TALL_LOWER, B.TALL_UPPER, B.DRY_GRASS, B.DRY_TALL_LOWER, B.DRY_TALL_UPPER];   // dry 0.84
const isPlantReplaceable = (id) => PLANT_REPLACE.includes(id & 255);
// the two-cell plants (0.84: the dry one too): lower half -> upper half, and back
const TALL_UPPER_OF = { [B.TALL_LOWER]: B.TALL_UPPER, [B.DRY_TALL_LOWER]: B.DRY_TALL_UPPER };
const TALL_LOWER_OF = { [B.TALL_UPPER]: B.TALL_LOWER, [B.DRY_TALL_UPPER]: B.DRY_TALL_LOWER };
const isPlaceableInto = (id) =>
  id === B.AIR || id === B.WATER || id === B.LAVA || isPlantReplaceable(id);
// clear a plant out of a cell before building there; tall grass is 2 cells, so take both halves.
// Every `noTarget` plant counts, not just the replaceable ones: creative can aim straight at a
// wheat or berry cell now, and building there has to take the plant with it.
const isNoTargetPlant = (id) => !!(PROPS[id & 255] && PROPS[id & 255].noTarget);
function clearPlantAt(x, y, z) {
  const id = getBlock(x, y, z) & 255;
  if (!isPlantReplaceable(id) && !isNoTargetPlant(id)) return;
  if (TALL_UPPER_OF[id]) setBlock(x, y + 1, z, B.AIR);
  else if (TALL_LOWER_OF[id]) setBlock(x, y - 1, z, B.AIR);
  setBlock(x, y, z, B.AIR);
}

/* A log wider than one block (a flared stump) physically overhangs its neighbours, so those cells
   are already occupied even though they read as air. Refuse to build into them — except with the
   things that legitimately grow through a canopy or wash around a trunk. */
const OVERHANG_OK = [...woodBlocks('leaves'), B.WATER, B.LAVA];   // every wood's leaves (the woods table, woods/woods.js)
function logOverhangsCell(x, y, z) {
  // a log only bulges along its two NON-axis directions, so check each neighbour accordingly
  const dirs = [[1,0,0,0],[-1,0,0,0],[0,1,0,1],[0,-1,0,1],[0,0,1,2],[0,0,-1,2]];
  for (const [dx, dy, dz, dirAxis] of dirs) {
    const v = getBlock(x + dx, y + dy, z + dz);
    const p = PROPS[v & 255];
    if (!p || p.model !== 'log') continue;
    const variant = (v >> 8) & 255;
    if (((variant & 3) || 0) === dirAxis) continue;        // bulge is only across the trunk axis
    if (CORE.logWidthPx(logWidthOf(variant)) > 64) return true;
  }
  return false;
}

const _dir = new THREE.Vector3();
function currentRay() {
  camera.getWorldDirection(_dir);
  return raycastVoxel(camera.position, _dir, 7);
}
function doBreak() {
  const hit = currentRay();
  if (!hit) return;
  if (isTNTFuseActive(hit.x, hit.y, hit.z)) return;             // armed TNT is unbreakable
  // a pressure plate or a cover lying in another block's cell goes alone; the block holding it stays (blocks/covers.js)
  if (hit.over) { breakOverAt(hit.x, hit.y, hit.z, hit.bi, false); return; }
  // a plant can only be the target in creative, and it comes out whole — a lone floating
  // TALL_UPPER left standing over the half you broke is not a thing anyone wants to see
  if (isNoTargetPlant(hit.id)) {
    // its own sound: these are not all grass any more (a flint stone is `type:'stone'`)
    playBlockSound(hit.id, 'break', hit.x, hit.y, hit.z);
    if (typeof fxBreak === 'function') fxBreak(hit.x, hit.y, hit.z, getBlock(hit.x, hit.y, hit.z));   // its forage colours
    clearPlantAt(hit.x, hit.y, hit.z);
    return;
  }
  if (tryChopLog(hit.x, hit.y, hit.z)) return;   // axe on a log: strip / fell instead of breaking
  // a mixed slab loses the half you aim at; the other stays
  if (CORE.slabMixed(getBlock(hit.x, hit.y, hit.z))) {
    playBlockSound(hit.id, 'break', hit.x, hit.y, hit.z);
    breakSlabMixHalf(hit.x, hit.y, hit.z, hit.bi ? 1 : 0);
    return;
  }
  // ...and a corner's two ladders or vines the one aimed at (blocks/ladders.js)
  const pv = getBlock(hit.x, hit.y, hit.z);
  if (wallPaired(pv)) {
    playBlockSound(hit.id, 'break', hit.x, hit.y, hit.z);
    setBlock(hit.x, hit.y, hit.z, wallSingle(pv, hit.bi ? 0 : 1));
    return;
  }
  const inf = layerBreakInfo(hit.x, hit.y, hit.z);
  playBlockSound(hit.id, 'break', hit.x, hit.y, hit.z);
  if (typeof fxBreak === 'function') fxBreak(hit.x, hit.y, hit.z, getBlock(hit.x, hit.y, hit.z));   // 0.8
  if (inf) inf.apply(); else setBlock(hit.x, hit.y, hit.z, B.AIR);   // a layer stack loses its top layer only
}
