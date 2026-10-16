'use strict';
/* blocks/tnt.js: TNT. The fuse, the blinking, the blast. */

/* ---- TNT: fuse tick, blinking, explosion ----
   Placed TNT blocks live in TNTS with a countdown timer + a blink phase. The block ID stays
   B.TNT the whole time; only the variant byte's low bit toggles (0 → normal faces, 1 → white
   flash via the mesher swap). While a TNT is armed, its position is protected from being
   broken (isTNTFuseActive is checked by both mining paths and doBreak). */
const TNTS = new Map();                  // "x,y,z" -> { t, blinkT, lit }
const TNT_FUSE = 3.0;
const TNT_RADIUS = 4;
const _tntKey = (x, y, z) => x + ',' + y + ',' + z;
function armTNT(x, y, z) { TNTS.set(_tntKey(x, y, z), { t: TNT_FUSE, blinkT: 0, lit: 0 }); }
function isTNTFuseActive(x, y, z) { return TNTS.has(_tntKey(x, y, z)); }
function explodeAt(cx, cy, cz, R) {
  const survival = !player.canFly;
  const chained = [];
  const R2 = R * R;
  if (typeof fxExplode === 'function') fxExplode(cx + 0.5, cy + 0.5, cz + 0.5, R);   // a smoke ball and flying sparks
  for (let dy = -R; dy <= R; dy++)
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
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
          for (const drop of blockDrop(id, false))
            for (let i = 0; i < drop.count; i++) spawnDrop(drop.id, x, y, z);
        }
        TNTS.delete(_tntKey(x, y, z));
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
