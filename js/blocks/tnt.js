'use strict';
/* blocks/tnt.js: TNT. The fuse, the blinking, the blast. */

/* ---- TNT: fuse tick, blinking, explosion ----
   Lit TNT blocks live in TNTS with a countdown timer + a blink phase. The block ID stays
   B.TNT the whole time; only the variant byte's low bit toggles (0 → normal faces, 1 → white
   flash via the mesher swap). While a TNT is armed, its position is protected from being
   broken (isTNTFuseActive is checked by both mining paths and doBreak). */
const TNTS = new Map();                  // "x,y,z" -> { t, blinkT, lit }
const TNT_FUSE = 3.0;
const TNT_RADIUS = 5.2;                   // blocks (a sphere; its loops run over whole cells, Math.ceil)
const _tntKey = (x, y, z) => x + ',' + y + ',' + z;
// lit, however it was (fire, a torch, flint, lava, a plate, a blast): its own sound, the one TNT's blocks make, at half
// a placed block's loudness (putting one down sounds of cloth instead: its `placeSound`, blocks/ladder-mortar.js)
const TNT_LIT_GAIN = 0.425;
function armTNT(x, y, z) {
  TNTS.set(_tntKey(x, y, z), { t: TNT_FUSE, blinkT: 0, lit: 0 });
  if (typeof playSound === 'function')
    playSound(blockSoundKey(B.TNT), { gain: TNT_LIT_GAIN, rate: 0.95 + Math.random() * 0.1, pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 } });
}
function isTNTFuseActive(x, y, z) { return TNTS.has(_tntKey(x, y, z)); }
/* TNT is lit by fire, never by being put down. A right click with fire in the hand (the Fire item, used up), a burning
   torch, or flint struck on it (it may not catch, and wears the flint, as lighting a torch does: blocks/torches.js); a fire
   burning beside it (_updateFires, 53-storms.js); lava beside it, when the TNT is put down or the lava comes
   (tntHeatAround, from place-block.js and fluids/fluids.js); a pressure plate pressed beside it, over it or on the block over
   it (PLATE_REACH, blocks/pressure-plates.js); and another blast (explodeAt). */
const _TNT_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function tryLightTNT(hit) {
  if (!hit || hit.id !== B.TNT || isTNTFuseActive(hit.x, hit.y, hit.z)) return false;
  const held = heldUseId(), { x, y, z } = hit;
  if (held !== ITEM.FIRE && held !== B.TORCH && held !== ITEM.FLINT) return false;
  if (act && act.place) return true;                 // one strike a press
  if (held === ITEM.FLINT) {
    const took = Math.random() >= TORCH_STRIKE_FAIL;
    if (Math.random() < FLINT_WEAR) spendHeld('used');
    if (!took) {                                      // sparks that did not take
      playBlockSound(B.FLINT_ROCK, 'hit', x, y, z);
      if (typeof _fxEmber === 'function')
        for (let i = 0; i < 4; i++) _fxEmber(x + 0.5, y + 1.02, z + 0.5, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8);
      return true;
    }
  } else if (held === ITEM.FIRE) spendHeld('used');
  armTNT(x, y, z);
  if (typeof _fireSound === 'function') _fireSound('fireIgnite', x + 0.5, y + 0.5, z + 0.5);
  return true;
}
// fire or lava at (x, y, z) or beside it: any TNT there or beside it catches
function tntHeatAround(x, y, z) {
  const here = getBlock(x, y, z) & 255, hot = (id) => id === B.FIRE || id === B.LAVA;
  for (const [dx, dy, dz] of _TNT_DIRS) {
    const tx = x + dx, ty = y + dy, tz = z + dz, id = getBlock(tx, ty, tz) & 255;
    if (here === B.TNT && hot(id) && !isTNTFuseActive(x, y, z)) armTNT(x, y, z);
    if (hot(here) && id === B.TNT && !isTNTFuseActive(tx, ty, tz)) armTNT(tx, ty, tz);
  }
}
function explodeAt(cx, cy, cz, R) {
  const survival = !player.canFly;
  const chained = [];
  const R2 = R * R;
  if (typeof fxExplode === 'function') fxExplode(cx + 0.5, cy + 0.5, cz + 0.5, R);   // a smoke ball and flying sparks
  const Ri = Math.ceil(R);                 // the whole cells the sphere can reach (R need not be whole)
  for (let dy = -Ri; dy <= Ri; dy++)
    for (let dz = -Ri; dz <= Ri; dz++)
      for (let dx = -Ri; dx <= Ri; dx++) {
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) continue;
        // fuzzy shell: cells near the sphere surface drop out with rising probability, so the
        // crater silhouette reads as a sphere instead of an axis-aligned diamond of cubes.
        const d = Math.sqrt(d2);
        if (R - d < 0.9 && Math.random() < 0.55) continue;
        const x = cx + dx, y = cy + dy, z = cz + dz;
        if (y < 0 || y > WORLD_TOP) continue;
        const val = getBlock(x, y, z);
        const id = val & 255;
        if (id === B.AIR || id === B.BEDROCK || id === B.WATER || id === B.LAVA) continue;
        if (id === B.TNT && !(x === cx && y === cy && z === cz)) chained.push([x, y, z]);
        // a locked or sealed chest blown up gives nothing back, itself included
        if (survival && id !== B.TNT && !(isChestId(id) && chestLocked(x, y, z, val)) && Math.random() < 0.5) {
          for (const drop of blockDrop(val, false))   // a look gives its block
            for (let i = 0; i < drop.count; i++) spawnDrop(drop.id, x, y, z);
        }
        TNTS.delete(_tntKey(x, y, z));
        // a pressure plate lying in the cell goes with it, not down onto the floor left (blocks/pressure-plates.js)
        if (_plateOverN && plateOverAt(x, y, z)) breakPlateOver(x, y, z, survival && Math.random() < 0.5, true);
        // ...and the covers lying in it (blocks/covers.js)
        if (_coverOverN) breakCoversAt(x, y, z, () => survival && Math.random() < 0.5);
        // ...and a block fallen into a doorway (blocks/doors.js)
        if (_doorFillN && doorFillAt(x, y, z)) breakDoorFill(x, y, z, survival && Math.random() < 0.5, true);
        // ...and a fence or a wall lying on its slab or stairs (blocks/rails.js)
        if (_railOverN && railOverAt(x, y, z)) breakRail(x, y, z, survival && Math.random() < 0.5, true);
        setBlock(x, y, z, B.AIR);
        queueWaterAround(x, y, z);
        queueLavaAround(x, y, z);
      }
  for (const [x, y, z] of chained) armTNT(x, y, z);
}
function updateTNTs(dt) {
  if (TNTS.size === 0) return;
  const stale = [];
  for (const [k, r] of TNTS) {
    const p = k.split(','), x = +p[0], y = +p[1], z = +p[2];
    const val = getBlock(x, y, z);
    if ((val & 255) !== B.TNT) { stale.push(k); continue; }
    r.t -= dt;
    r.blinkT -= dt;
    if (typeof fxTntFuse === 'function') fxTntFuse(r, x, y, z, dt);   // sparks off the fuse on top
    if (r.blinkT <= 0) {
      r.lit ^= 1;
      // blink period accelerates toward zero: 0.35s at 3s left → 0.06s minimum near boom
      r.blinkT = Math.max(0.06, r.t * 0.18);
      setBlock(x, y, z, B.TNT | (r.lit << 8));
    }
    if (r.t <= 0) {
      stale.push(k);
      explodeAt(x, y, z, TNT_RADIUS);
    }
  }
  for (const k of stale) TNTS.delete(k);
}
