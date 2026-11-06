'use strict';
/* js/entities/birds.js: what every bird shares: flying, taking off and landing, standing on a perch (on leaves too), and
   finding a perch. A bird's own file (entities/parrot.js, entities/owl.js) keeps its numbers and its mind; each step its
   mind gives a plan { to, speed, land, face } and birdStep moves the bird by it.

   A bird is either PERCHED (on its feet, falling like any creature) or FLYING (`e.flying`: no gravity; it goes straight
   at `plan.to`, turning at N.turn, rising or sinking at most N.climb, lifted over what is in the way: birdFlyStep). It
   takes off for any point it is given and lands on one with `plan.land` once it is there (birdLand); a point it gets to
   is marked `done`, so its mind can tell. No point (`plan.to` null): perched it stays sitting, flying it hovers, turned to
   `plan.face` (a player) when it has one. `N` is the bird's own numbers ({ turn, climb, perchEvery }: PARROT, OWL).

   LEAVES are not solid (a player walks through them, so does every other body), but a whole leaf block holds a bird:
   birdFloorVal is what one can stand on, birdStep's perched fall stops on a leaf top, and birdFindPerch takes leaf tops
   first. In flight leaves do not stop it: it flies through a canopy. */

// a whole leaf block, not litter (a leaf layer): a perch for a bird, though no floor for other bodies
const birdLeafVal = (v) => LEAF_BLOCKS.has(v & 255) && !((v >> 8) & 255);
// what a bird can stand on
const birdFloorVal = (v) => CORE.solidVal(v) || birdLeafVal(v);
const birdRand = (r) => r[0] + Math.random() * (r[1] - r[0]);

function birdTakeOff(e) {
  e.flying = true; e.onGround = false; e.vy = 0; e._airT = 0; e._stuckT = 0;
  mobSound(e, 'fly', 0.45);
}
// down on its perch: there until its mind gives it another point; it sits N.perchEvery before looking for the next
function birdLand(e, to, N) {
  e.flying = false; e.x = to.x; e.y = to.y; e.z = to.z; e.vy = 0; e.onGround = true; e.vyF = 0;
  to.done = true;
  if (N.perchEvery) e._perchT = birdRand(N.perchEvery);
  mobSound(e, 'land', 0.4);
}
/* One step of flight toward `to` at `speed`: it turns toward it at N.turn, goes slower while facing away and as it
   arrives, rises or sinks toward its height at most N.climb, and climbs over what blocks it across. Returns how far it
   went across. */
function birdFlyStep(e, dt, to, speed, N) {
  const dx = to.x - e.x, dz = to.z - e.z, dh = Math.hypot(dx, dz);
  let face = 1;
  if (dh > 0.15) {
    let d = Math.atan2(dx, dz) - e.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = Math.max(-N.turn * dt, Math.min(N.turn * dt, d));
    e.yaw += turn;
    face = Math.max(0.25, Math.cos(d - turn));
  }
  const sp = Math.min(speed * face, dh * 3);
  const sx = Math.sin(e.yaw) * sp * dt, sz = Math.cos(e.yaw) * sp * dt;
  let moved = 0, blocked = false;
  if (sx && !_entBlocked(e.x + sx, e.y, e.z)) { e.x += sx; moved += Math.abs(sx); } else if (sx) blocked = true;
  if (sz && !_entBlocked(e.x, e.y, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else if (sz) blocked = true;
  let vy = Math.max(-N.climb, Math.min(N.climb, (to.y - e.y) * 3));
  if (blocked) vy = N.climb;                // over what is in the way
  const ny = e.y + vy * dt;
  let stuck = blocked;
  if (!_entBlocked(e.x, ny, e.z)) e.y = ny; else if (vy > 0) stuck = true;
  e.vyF = vy;
  e._stuckT = stuck ? (e._stuckT || 0) + dt : 0;
  return moved;
}
// the top of a leaf block the bird's middle passed going down from y0 to y1 in its column, or null
function _birdLeafBetween(x, z, y0, y1) {
  for (let c = Math.floor(y0) - 1; c + 1 >= y1; c--) if (birdLeafVal(getBlock(x, c, z))) return c + 1;
  return null;
}
/* A bird's step from its mind's plan: taking off, flying (or hovering), landing, or sitting on its perch (it falls, a
   leaf top or anything solid holding it, and catches itself on the wing when there is nothing under it for long); a
   blow's knockback, lava and cactus. Its goal points (`_goal`, `_fleeGoal`) are let go when it is stuck. Returns its
   speed across (blocks a second) for the pose, or -1 when it died and was taken out (`i`: its place in ENTITIES). */
function birdStep(e, dt, plan, i, N) {
  // in water: up and out of it
  if (!plan.to && isWaterVal(getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z))))
    plan.to = { x: e.x, y: Math.floor(e.y) + 2.2, z: e.z, air: true };
  if (plan.to && !e.flying && !plan.to.done) birdTakeOff(e);
  let moved = 0;
  const wasX = e.x, wasZ = e.z;
  if (e.flying) {
    const to = plan.to && !plan.to.done ? plan.to : null;
    moved = birdFlyStep(e, dt, to || { x: e.x, y: e.y, z: e.z }, to ? plan.speed : 0, N);
    if (plan.face && (!to || Math.hypot(to.x - e.x, to.z - e.z) < 0.5)) {   // hovering: turned to who it waits on
      let d = Math.atan2(plan.face.pos.x - e.x, plan.face.pos.z - e.z) - e.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      e.yaw += Math.max(-N.turn * dt, Math.min(N.turn * dt, d));
    }
    if (to) {
      const dh = Math.hypot(to.x - e.x, to.z - e.z), dy = to.y - e.y;
      if (plan.land && dh < 0.4 && Math.abs(dy) < 0.35 && !_entBlocked(to.x, to.y, to.z)) birdLand(e, to, N);
      else if (to.air && dh < 0.7 && Math.abs(dy) < 0.7) to.done = true;
    }
    if (e._stuckT > 1.5) { e._stuckT = 0; e._goal = null; e._fleeGoal = null; }
    e.peakY = null; e.onGround = false;
  } else {
    const fx = Math.floor(e.x), fz = Math.floor(e.z), wasGround = e.onGround, under = Math.floor(e.y - 0.02);
    const onLeaf = birdLeafVal(getBlock(fx, under, fz)) && e.y - (under + 1) < 0.05;
    if (e.vy <= 0 && (onLeaf || _entBlocked(e.x, e.y - 0.02, e.z))) { e.y = under + 1; e.vy = 0; e.onGround = true; }
    else {
      const ny = _entFallStep(e, dt);
      const leafTop = e.vy < 0 ? _birdLeafBetween(fx, fz, e.y, ny) : null;
      if (leafTop != null) { e.y = leafTop; e.vy = 0; e.onGround = true; }
      else if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; } e.vy = 0; }
      else { e.y = ny; e.onGround = false; }
    }
    e._airT = e.onGround ? 0 : (e._airT || 0) + dt;
    if (!e.onGround && !wasGround && e._airT > 0.25) birdTakeOff(e);
    e.peakY = null;
  }
  if (e.kx || e.kz) {                       // a blow's knockback, spent
    const kdx = e.kx * dt, kdz = e.kz * dt;
    if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
    if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
    const kk = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= kk; e.kz *= kk;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
  }
  if (e.hazCd > 0) e.hazCd -= dt;
  const feetId = getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255;
  if (feetId === B.LAVA) e.fireT = Math.max(e.fireT || 0, LAVA_FIRE_S);
  if (e.hazCd <= 0 && (feetId === B.LAVA || feetId === B.CACTUS)) {
    e.hazCd = ENT_HAZARD_CD; e.hurtT = 0.25; e.hp -= feetId === B.LAVA ? ENT_LAVA_DMG : ENT_CACTUS_DMG;
    if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return -1; }
  }
  return Math.max(moved, Math.hypot(e.x - wasX, e.z - wasZ)) / Math.max(dt, 1e-4);
}

/* A place to perch within r of (cx, cz) about height cy: the top of something a bird stands on (birdFloorVal: a leaf
   block or anything solid) with open air over it (a plant may stand in it), looked for down each of `tries` columns from
   10 over cy to 12 under it; the first such top in a column. Leaves score first, then a wood's block (a log), then the
   higher. Options: `from` a point it is getting away from (the further the better), `avoid` a point whose column it keeps
   clear of (its owner's), `leaves: 'only'` leaf tops alone (the owl's tree) or `'never'` (looked through, as a plant:
   the ground under a tree, a crow's), `tries`. { x, y, z } (y its feet), or null. */
function birdFindPerch(cx, cy, cz, r, o = {}) {
  let best = null, bs = -Infinity;
  const top = Math.floor(cy) + 10, bottom = Math.max(1, Math.floor(cy) - 12), only = o.leaves === 'only';
  for (let k = 0, tries = o.tries || 14; k < tries; k++) {
    const x = Math.floor(cx + (Math.random() * 2 - 1) * r), z = Math.floor(cz + (Math.random() * 2 - 1) * r);
    if (o.avoid && Math.abs(x + 0.5 - o.avoid.x) < 1.2 && Math.abs(z + 0.5 - o.avoid.z) < 1.2) continue;
    let open = false;
    for (let y = top; y >= bottom; y--) {
      const v = getBlock(x, y, z), id = v & 255;
      if (id === B.AIR) { open = true; continue; }
      const leaf = o.leaves !== 'never' && birdLeafVal(v);
      if (!leaf && !CORE.solidVal(v)) {       // a plant can be sat in; water, lava and fire cannot be sat over
        if (isWaterVal(v) || id === B.LAVA || id === B.FIRE) open = false;
        continue;
      }
      if (open && (leaf || !only)) {
        let s = (leaf ? 4 : woodOf(id) ? 3 : 0) + (y - bottom) * 0.05 + Math.random() * 0.5;
        if (o.from) s += Math.hypot(x + 0.5 - o.from.x, z + 0.5 - o.from.z) * 0.2;
        if (s > bs) { bs = s; best = { x: x + 0.5, y: y + 1, z: z + 0.5 }; }
        break;
      }
      open = false;                            // covered: a lower branch may still be open
    }
  }
  return best;
}
