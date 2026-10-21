'use strict';
/* entities/physics.js: a creature's body in the world. Its box by kind and size, what blocks it, stepping up, what
   it will not walk into, room to spawn, fall damage, and bodies pushing each other apart. */

/* ---- per-entity hitboxes ----
   A body's box is its KIND's `box` in the creature table ([radius, height] at size 1, entities/mobs.js) times
   its own `size`. A kind that gives none stands in the humanoid's ENT_R / ENT_H (villager, zombie, skeleton, and
   the pig). The animals' boxes match their models. The horse's radius is wider than its barrel because a square
   column is all this collision has, and the body is long: 0.45 keeps its head and rump out of most walls while
   an ordinary one still fits a one-wide gap (0.54 would not). A fish's box is scaled by its species' length as
   well as its own size (its entry's `sizeOf`).

   _entBlocked takes no entity (it has dozens of callers, spawn checks included), so the box it
   tests is a small piece of state: updateEntities installs each mob's box before ticking it and
   restores the default afterwards. Everything outside that loop sees the plain humanoid box. */
const HUMAN_BOX = [ENT_R, ENT_H];
const entR = (e) => { const d = mobOf(e); return (d.box || HUMAN_BOX)[0] * (d.sizeOf ? d.sizeOf(e) : (e.size || 1)); };
const entH = (e) => { const d = mobOf(e); return (d.box || HUMAN_BOX)[1] * (d.sizeOf ? d.sizeOf(e) : (e.size || 1)); };
let _boxR = ENT_R, _boxH = ENT_H;
function _useBox(e) { _boxR = e ? entR(e) : ENT_R; _boxH = e ? entH(e) : ENT_H; }

// AABB test against solid voxels for a candidate position, using the installed box (_useBox)
function _entBlocked(x, y, z) {
  const x0 = Math.floor(x - _boxR), x1 = Math.floor(x + _boxR);
  const z0 = Math.floor(z - _boxR), z1 = Math.floor(z + _boxR);
  // NO epsilon on the bottom edge. A +0.02 lift meant a mob resting exactly on a block top
  // tested the AIR cell it stands in rather than the floor, so gravity pulled it ~0.02 down
  // every frame until the check finally caught and snapped it back — a permanent shake, and
  // onGround stayed false, which also killed the knockback hop.
  const y0 = Math.floor(y), y1 = Math.floor(y + _boxH - 0.02);
  for (let yy = y0; yy <= y1; yy++)
    for (let zz = z0; zz <= z1; zz++)
      for (let xx = x0; xx <= x1; xx++)
        if (isSolid(xx, yy, zz)) return true;
  return false;
}

/* Lowest Y at or above the feet where the body actually FITS at (nx,nz), or null.
   The old climb test just probed `e.y + 1`, which fails at a shoreline: a mob floating at
   y≈99.4 probes 100.4, and floor(100.4) IS the solid shore block, so the step never looked
   possible and it bobbed against the bank forever. Probing candidate STANDING heights instead
   finds y=101 (on top of the shore) correctly. */
function _stepUpTarget(e, nx, nz, maxRise = 1.7) {
  const base = Math.floor(e.y);
  for (let k = 1; k <= 2; k++) {
    const ty = base + k;
    if (ty - e.y > maxRise) break;
    if (!_entBlocked(nx, ty, nz)) return ty;
  }
  return null;
}

// Cells a mob refuses to walk into. Lava and cactus hurt; deep-ish water is avoided so they
// don't wander out to sea and drown. Checked against the two cells the body occupies.
function _entHazard(x, y, z) {
  for (let dy = 0; dy <= 1; dy++) {
    const id = getBlock(Math.floor(x), Math.floor(y + dy), Math.floor(z)) & 255;
    if (id === B.LAVA || id === B.CACTUS) return true;
  }
  const fx = Math.floor(x), fz = Math.floor(z), fy = Math.floor(y);
  // a step that would drop the feet into water counts as a hazard too
  if (isWaterVal(getBlock(fx, fy, fz))) return true;            // a block standing in water too
  /* ...and so does a ledge: probe downward for a floor and refuse the step if the drop would
     hurt. WATER FOUND ON THE WAY DOWN IS ALSO A HAZARD — it used to count as a floor,
     on the reasoning that falling into a pond is survivable. That is exactly how mobs kept
     ending up in the sea: standing on a bank, the cell straight ahead is air (the water surface
     is a block lower), so the step looked clean and they walked straight off into it. Now the
     shoreline reads as a wall and they turn along it instead. */
  let d = 0;
  while (d <= ENT_LEDGE_MAX && fy - 1 - d >= 0) {
    const bv = getBlock(fx, fy - 1 - d, fz), bid = bv & 255;
    if (isWaterVal(bv)) return true;
    if (CORE.solidVal(bv)) break;                // a drift of snow or leaves is not a floor
    d++;
  }
  return d > ENT_LEDGE_MAX;
}
/* A spawn needs real ROOM, not just a body-sized gap: a 2x2x2 block of open cells. Without this
   a mob could be placed into a one-block-high cave mouth or a crevice and be sealed in the
   instant it settled — the body AABB is only 0.6 wide, so it fitted where nothing could move. */
function _entSpawnRoom(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  for (let dy = 0; dy <= 1; dy++)
    for (let dz = 0; dz <= 1; dz++)
      for (let dx = 0; dx <= 1; dx++) {
        const v = getBlock(fx + dx, fy + dy, fz + dz), id = v & 255;
        if (CORE.solidVal(v) || id === B.WATER || id === B.LAVA) return false;
      }
  return true;
}

/* Fall damage, mirroring the player's rule. Tracks the highest point reached while airborne
   rather than integrating vy, so a mob knocked upward off a cliff is measured from the apex.
   Returns true if the entity died and was removed — the caller must return immediately, since
   ENTITIES has been spliced under it. */
/* A fall of ENT_FALL_SAFE blocks does not hurt; a kind may give its own `fallSafe` in the creature table (the
   horse: HORSE_FALL_SAFE, 8). The drop a mob will step off on its own is only 3 (ENT_LEDGE_MAX, _entHazard): it
   can take a longer fall than that, it does not go looking for one. */
const ENT_FALL_SAFE = 6;              // blocks of free fall a mob shrugs off
const ENT_LEDGE_MAX = 3;              // the deepest drop a mob walks off by itself
function _entFallDamage(e, i, wasGround, inWater) {
  if (inWater) { e.peakY = null; return false; }
  if (!e.onGround) {
    e.peakY = (e.peakY == null) ? e.y : Math.max(e.peakY, e.y);
    return false;
  }
  const peak = e.peakY;
  e.peakY = null;
  if (wasGround || peak == null) return false;
  const drop = peak - e.y, safe = mobOf(e).fallSafe || ENT_FALL_SAFE;
  if (drop <= safe) return false;
  e.hurtT = 0.25;
  e.hp -= Math.round(drop - safe) * 5;            // 5 a block
  if (e.hp > 0) return false;
  if (!player.canFly) _entDropLoot(e);
  _removeEntity(i);
  return true;
}

/* Bodies are solid to each other: overlapping mobs (and the player) get pushed apart so nothing
   ends up standing inside anyone. Vertical overlap is required, otherwise stacked mobs on
   different floors would shove each other. */
function _separateBodies(dt) {
  for (let a = 0; a < ENTITIES.length; a++) {
    const e = ENTITIES[a];
    if (e.active === false || isFish(e)) continue;   // frozen in an unloaded chunk — nothing to push; fish shove nobody
    // vs other entities — two bodies touch at the SUM of their own radii
    for (let b = a + 1; b < ENTITIES.length; b++) {
      const o = ENTITIES[b];
      if (o.active === false || isFish(o)) continue;
      if (Math.abs(o.y - e.y) >= Math.max(entH(e), entH(o))) continue;
      const minD = entR(e) + entR(o), minD2 = minD * minD;
      let dx = o.x - e.x, dz = o.z - e.z;
      let d2 = dx * dx + dz * dz;
      if (d2 >= minD2) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz) || 1; }
      const push = (minD - d) / minD * ENT_PUSH * dt;
      const ux = dx / d * push, uz = dz / d * push;
      _useBox(e); if (!_entBlocked(e.x - ux, e.y, e.z - uz)) { e.x -= ux; e.z -= uz; }
      _useBox(o); if (!_entBlocked(o.x + ux, o.y, o.z + uz)) { o.x += ux; o.z += uz; }
    }
    // vs every player — creative flying passes through, survival gets shoved
    _useBox(e);
    for (const p of PLAYERS) {
      if (!p.spawned || (p.canFly && p.flying)) continue;
      if (Math.abs(p.pos.y - e.y) >= entH(e)) continue;
      if (p.riding === e) continue;             // its own rider sits inside it by design
      let dx = p.pos.x - e.x, dz = p.pos.z - e.z;
      const d2 = dx * dx + dz * dz;
      const pMin = entR(e) + p.R;
      if (d2 >= pMin * pMin) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz) || 1; }
      const push = (pMin - d) / pMin * ENT_PUSH * dt;
      const ux = dx / d * push, uz = dz / d * push;
      if (!_entBlocked(e.x - ux, e.y, e.z - uz)) { e.x -= ux; e.z -= uz; }
      _movePlayerBy(p, ux, uz);
    }
  }
}
