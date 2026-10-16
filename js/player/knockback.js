'use strict';
/* player/knockback.js: a player shoved by a blow, fading out over a moment. */

/* Player shove: mob hits and body collisions feed a decaying velocity here rather than moving
   the player outright, so being struck slides you back instead of teleporting you. */
/* Shove state lives ON the player object so each split-screen player is knocked about
   independently. `_plyKick` stays as the active player's alias for the code that reads it. */
var _plyKick = { x: 0, z: 0 };
function playerKick(p) { return p._kick || (p._kick = { x: 0, z: 0 }); }
function _movePlayerBy(p, dx, dz) {
  const q = p.pos;
  if (!_entBlocked(q.x + dx, q.y, q.z)) q.x += dx;
  if (!_entBlocked(q.x, q.y, q.z + dz)) q.z += dz;
}
function _updatePlayerKick(dt) {
  for (const p of PLAYERS) {
    const k = playerKick(p);
    if (!k.x && !k.z) continue;
    _movePlayerBy(p, k.x * dt, k.z * dt);
    const d = Math.max(0, 1 - PLY_KNOCK_DECAY * dt);
    k.x *= d; k.z *= d;
    if (Math.abs(k.x) < 0.05 && Math.abs(k.z) < 0.05) { k.x = 0; k.z = 0; }
  }
}
