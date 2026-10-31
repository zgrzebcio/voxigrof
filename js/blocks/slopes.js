'use strict';
/* blocks/slopes.js: sliding down a slope. A slope is a hammer shape (SHAPE_SLOPE, shapes/shapes.js): a wedge, its steps and
   its way down (slopeDownOf) in shapes/boxes.js, drawn by emitSlope in chunks/mesher-models.js. Nothing stays on one:
     a player     gathers speed down it, faster than a sprint, and keeps a little of it past its foot (playerSlopeSlide, from
                  tickPlayer in player/tick.js)
     a creature   is carried off its low edge (entSlopeSlide, entities/update.js)
     a drop       rolls off it (15-drops.js)
   One hung upside down is a roof: its flat top holds like any block. */

const SLOPE_ACCEL = 16;           // blocks a second gained each second on one
const SLOPE_MAX = 7;              // the fastest slide: past a walk (4.3) and a sprint (6.9), so no one walks up one
const SLOPE_FRICTION = 5;         // off it, on the ground, the slide dies away at this rate (a second)
const SLOPE_AIR_DRAG = 0.5;       // ...and in the air, slower: shot off a slope's foot you fly on
const SLOPE_ENT_SPEED = 3.5;      // a creature carried off one, blocks a second
const SLOPE_DROP_SPEED = 2.5;     // a dropped item rolling off one

// the way down of a slope at (x, y, z), [dx, dz], or null (anything else, or one upside down)
const slopeDownAt = (x, y, z) => CORE.slopeDownOf(getBlock(x, y, z));

// the way down under the feet at p, over every slope the body's footprint stands on, or null
function _slopeUnderPlayer(p) {
  const R = player.R - 0.02;
  let sx = 0, sz = 0, any = false;
  for (let y = Math.floor(p.y - 0.06); y <= Math.floor(p.y + 0.02); y++)
    for (let z = Math.floor(p.z - R); z <= Math.floor(p.z + R); z++)
      for (let x = Math.floor(p.x - R); x <= Math.floor(p.x + R); x++) {
        const d = slopeDownAt(x, y, z);
        if (d) { sx += d[0]; sz += d[1]; any = true; }
      }
  const L = Math.hypot(sx, sz);
  return any && L > 1e-6 ? [sx / L, sz / L] : null;
}
/* A player's slide, once a frame after they moved (tickPlayer). `player._slide` is its speed { x, z } in blocks a second,
   added to whatever they walk; on a slope it grows down the slope and the body is pressed down onto its face, so a run
   of slopes is ridden, not flown off step by step. Riding one is never a fall; landing on one from a height still is
   (the frame it lands, the fall is left for updateVitals). */
function playerSlopeSlide(dt) {
  const p = player.pos, s = player._slide || (player._slide = { x: 0, z: 0 });
  const grounded = onGround(), down = grounded ? _slopeUnderPlayer(p) : null;
  if (down && player._onSlope) player.fallStart = null;
  player._onSlope = !!down;
  if (down) {
    s.x += down[0] * SLOPE_ACCEL * dt; s.z += down[1] * SLOPE_ACCEL * dt;
    const sp = Math.hypot(s.x, s.z);
    if (sp > SLOPE_MAX) { s.x *= SLOPE_MAX / sp; s.z *= SLOPE_MAX / sp; }
  } else {
    const k = Math.exp(-(grounded ? SLOPE_FRICTION : SLOPE_AIR_DRAG) * dt);
    s.x *= k; s.z *= k;
  }
  if (Math.abs(s.x) < 0.02 && Math.abs(s.z) < 0.02) { s.x = s.z = 0; return; }
  const x0 = p.x, z0 = p.z, mx = s.x * dt, mz = s.z * dt;
  movePlayer(mx, 0, mz);
  if (Math.abs(p.x - x0) < Math.abs(mx) * 0.5) s.x = 0;    // a wall stops it
  if (Math.abs(p.z - z0) < Math.abs(mz) * 0.5) s.z = 0;
  if (down && player.vy <= 0) movePlayer(0, -Math.hypot(s.x, s.z) * dt * 1.1, 0);   // pressed onto the face going down
}
// a creature standing on a slope is carried off its low edge (its box is installed: _useBox, entities/update.js)
function entSlopeSlide(e, dt) {
  if (!e.onGround) return;
  const d = slopeDownAt(Math.floor(e.x), Math.floor(e.y - 0.02), Math.floor(e.z));
  if (!d) return;
  const nx = e.x + d[0] * SLOPE_ENT_SPEED * dt, nz = e.z + d[1] * SLOPE_ENT_SPEED * dt;
  if (!_entBlocked(nx, e.y, nz)) { e.x = nx; e.z = nz; }
}
