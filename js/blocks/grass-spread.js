'use strict';
/* blocks/grass-spread.js: dirt beside grass slowly turns to grass. */

/* ---- grass spread: a dirt block slowly turns to grass when it's lit from above (transparent
   block overhead = sunlight/light reaches it) AND a grass block sits in the neighbouring 3×3×
   (±1 y) column. Very slow; sampled randomly near the player and scaled by the tick speed. ---- */
let _grassTimer = 0;
// grass blocks that are covered (opaque block above): key "x,y,z" -> seconds it has stayed dark.
// Only a full 24 in-game hours (= DAY_LEN real seconds) of continuous cover turns it to dirt,
// so a passing night or shadow (which never make the block above opaque) can't trigger it.
const _darkGrass = new Map();
function processGrassSpread(dt) {
  if (menuScene || !player.spawned) return;      // don't mutate the title panorama
  _grassTimer += dt;
  const interval = 1.0 / tickFactor();
  if (_grassTimer < interval) return;
  _grassTimer -= interval;
  const px = Math.floor(player.pos.x), py = Math.floor(player.pos.y), pz = Math.floor(player.pos.z);
  // sampling is anchored on GRASS blocks and spreads outward to a neighbouring lit dirt — far
  // higher hit rate than probing random air, so spread is actually visible. Scales with tick speed.
  const tries = Math.max(4, Math.round(30 * tickFactor()));
  for (let i = 0; i < tries; i++) {
    const x = px + (Math.random() * 48 | 0) - 24;
    const z = pz + (Math.random() * 48 | 0) - 24;
    const y = py + (Math.random() * 16 | 0) - 8;
    if (!_plainGrass(getBlock(x, y, z))) continue;                  // spread originates from grass (a block, not a cover)
    if (CORE.opaqueVal(getBlock(x, y + 1, z))) {                   // covered grass: track for decay
      const k = `${x},${y},${z}`; if (!_darkGrass.has(k)) _darkGrass.set(k, 0);
      continue;
    }
    // pick a random neighbour in the 3×3×3 shell; convert it if it's dirt lit from above
    const tx = x + (Math.random() * 3 | 0) - 1, ty = y + (Math.random() * 3 | 0) - 1, tz = z + (Math.random() * 3 | 0) - 1;
    if (getBlock(tx, ty, tz) !== B.DIRT) continue;                  // plain dirt only: a dirt cover stays one
    if (CORE.opaqueVal(getBlock(tx, ty + 1, tz))) continue;         // target needs light too
    // the Dryland's pale grass spreads as itself
    setBlock(tx, ty, tz, ((getBlock(x, y, z) >> 8) & 255) === V.GRASS_DRY ? B.GRASS | (V.GRASS_DRY << 8) : B.GRASS);
  }
  // age the covered-grass timers; convert after 24h dark, drop entries that got uncovered/changed
  for (const [k, t] of _darkGrass) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) continue;             // dark-cover clock pauses outside the sim radius
    if (!_plainGrass(getBlock(x, y, z)) || !CORE.opaqueVal(getBlock(x, y + 1, z))) { _darkGrass.delete(k); continue; }
    const nt = t + interval;
    if (nt >= DAY_LEN) { setBlock(x, y, z, B.DIRT); _darkGrass.delete(k); }
    else _darkGrass.set(k, nt);
  }
}
