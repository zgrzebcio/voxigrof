'use strict';
/* voxiGrof — ranged weapons and ammunition

   Deliberately NOT "the bow file". A ranged weapon is a table entry (RANGED) naming what it
   fires, how long it takes to draw and how hard it throws; a projectile is a table entry (AMMO)
   naming what it does when it lands. A crossbow, a longbow or a firearm is a row in RANGED plus
   whatever new ammo row it wants — no new flight code, no new draw code, no new hit code.

   The item registry marks the two sides: ITEM_PROPS[id].ranged = family name (bow, crossbow…),
   ITEM_PROPS[id].ammo = ammunition family. Everything else keys off these tables.

   Both the player and the mobs shoot through the SAME spawnArrow(): one flight simulation, one
   set of hit rules, so a skeleton's arrow and yours behave identically. */

/* ---------------------------------- registries ---------------------------------- */
/* draw    seconds from nock to full draw
   minDraw fraction of the draw below which the release is a fumble — nothing is loosed
   speed   muzzle velocity at FULL draw, blocks/second (scaled down for a partial draw)
   spread  radians of random deviation at full draw; a rushed shot scatters much wider
   wear    durability spent per shot
   two-handed weapons all pull ammo the same way: first matching stack in hotbar, then inventory */
const RANGED = {
  [ITEM.BOW]: {
    family: 'bow', ammo: ['arrow'], draw: 0.9, minDraw: 0.22, speed: 42, dmgMul: 1,
    spread: 0.012, wear: 1, sound: 'snowball', rate: 0.75,
  },
};
/* damage    at full draw, before the weapon's multiplier
   gravity   blocks/s² pulled down in flight (a heavier head drops faster)
   drag      velocity bleed per second
   stick     seconds a SPENT round stays in the block it hit before it is cleaned up
   recover   chance a player's own round survives the shot and can be walked over and picked up
   stickPick how long a recoverable one waits to be collected — far longer than a spent one,
             because the whole point is that you go and fetch your arrows back */
const AMMO = {
  [ITEM.ARROW]: { damage: 6, gravity: 11, drag: 0.06, stick: 20, stickPick: 150,
                  recover: 0.5, knock: 5.5 },
};

const rangedProps = (id) => (id != null && id >= 256) ? (RANGED[id] || null) : null;
const isRangedItem = (id) => !!rangedProps(id);
const ammoProps = (id) => (id != null && id >= 256) ? (AMMO[id] || null) : null;
// every id that satisfies one of this weapon's ammo families, best (first listed) first
function ammoIdsFor(rp) {
  const out = [];
  for (const fam of rp.ammo)
    for (const k in AMMO) { const id = +k; if (ITEM_PROPS[id]?.ammo === fam) out.push(id); }
  return out;
}
/* Which stack this shot will draw from — the hotbar is searched before the backpack, so the
   arrows you chose to carry on the bar are the ones that fly. Returns null when dry. */
function findAmmoSlot(rp) {
  const ids = ammoIdsFor(rp);
  for (const arr of [HOTBAR, invSlots]) {
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      if (s && s.count > 0 && ids.includes(s.id)) return { arr, i, slot: s };
    }
  }
  return null;
}
function takeAmmo(found) {
  found.slot.count--;
  if (found.slot.count <= 0) found.arr[found.i] = null;
  saveHotbar(); buildHotbar(); updateHotbar();
  if (invOpen) buildInventory();
}

/* ---------------------------------- the player's draw ----------------------------------
   Per-seat state (split screen swaps these — see SWAP_KEYS): how far the string is pulled, and
   which ammo id is nocked, so the hand and the third-person body can show the arrow that is
   actually about to fly rather than a generic one. */
var _drawT = 0;              // seconds held
var _drawAmmoId = null;      // what is nocked right now
var _drawDry = false;        // held with nothing to shoot: the bow stays slack

const rangedDraw = () => {
  const rp = rangedProps(heldUseId());       // a broken bow cannot be drawn (0.79)
  return rp ? Math.min(1, _drawT / rp.draw) : 0;
};
const rangedNocked = () => (_drawT > 0 && !_drawDry) ? _drawAmmoId : null;

/* Called once per frame from the main loop with the same `wantPlace` the eat and place paths
   read. Right click draws; letting go looses. Returns 0..1 for the animators. */
function updateRanged(dt, wantPlace) {
  if (!playing || invOpen || menuScene || player.dead) { _drawT = 0; _drawDry = false; return 0; }
  const slot = HOTBAR[hotbarSel];
  const rp = rangedProps(slotId(slot));
  if (!rp) { _drawT = 0; _drawDry = false; return 0; }

  if (wantPlace) {
    if (_drawT === 0) {
      // nock: creative shoots for free, survival needs something in the quiver
      const found = player.canFly ? null : findAmmoSlot(rp);
      _drawAmmoId = found ? found.slot.id : ammoIdsFor(rp)[0];
      _drawDry = !player.canFly && !found;
      if (_drawDry) toast('no arrows');
    }
    _drawT = Math.min(rp.draw, _drawT + dt);
    return _drawDry ? 0 : Math.min(1, _drawT / rp.draw);
  }
  // released
  if (_drawT > 0) {
    const draw = Math.min(1, _drawT / rp.draw);
    _drawT = 0;
    if (!_drawDry && draw >= rp.minDraw) fireRanged(rp, slot, draw);
    _drawDry = false;
  }
  return 0;
}

const _rvFwd = new THREE.Vector3();
function fireRanged(rp, slot, draw) {
  let ammoId = _drawAmmoId;
  if (!player.canFly) {
    const found = findAmmoSlot(rp);          // re-checked at release: the quiver may have moved
    if (!found) { toast('no arrows'); return; }
    ammoId = found.slot.id;
    takeAmmo(found);
    if (slot && slot.dur != null) {
      const w = wearSlot(slot, rp.wear);
      if (w === 'gone') HOTBAR[hotbarSel] = null;
      if (w !== 'kept') playSound('toolBreak', { gain: 0.7 });
      saveHotbar(); buildHotbar(); updateHotbar();
    }
  }
  camera.getWorldDirection(_rvFwd);
  if (camView === 2) _rvFwd.negate();        // front view: the camera looks back at the player
  const ap = ammoProps(ammoId) || { damage: 4, gravity: 11, drag: 0.05, stick: 20, recover: 0, knock: 4 };
  // a snatched shot scatters; a full draw goes where you pointed it
  const sp = rp.spread * (1.6 - draw) * 2;
  const vx = _rvFwd.x + (Math.random() - 0.5) * sp;
  const vy = _rvFwd.y + (Math.random() - 0.5) * sp;
  const vz = _rvFwd.z + (Math.random() - 0.5) * sp;
  const v = rp.speed * (0.35 + 0.65 * draw);
  const strength = typeof playerStrength === 'function' ? playerStrength() : 0;
  spawnArrow(
    player.pos.x + _rvFwd.x * 0.4, player.pos.y + player.EYE - 0.12, player.pos.z + _rvFwd.z * 0.4,
    vx * v, vy * v, vz * v,
    { ammoId, dmg: (ap.damage * (0.35 + 0.65 * draw) * rp.dmgMul) + strength * 0.5,
      // creative never spent an arrow, so there is nothing to hand back
      fromPlayer: true, owner: player, recover: player.canFly ? 0 : ap.recover });
  playSound(rp.sound, { gain: 0.55, rate: rp.rate + draw * 0.35 });
}

/* ---------------------------------- projectiles in flight ---------------------------------- */
const ARROWS = [];
const ARROW_SCALE = 0.85;
// the arrow sprite's tip runs along the icon's lower-left -> upper-right diagonal
const _ARROW_AXIS = new THREE.Vector3(1, 1, 0).normalize();
const _aDir = new THREE.Vector3();

function spawnArrow(x, y, z, vx, vy, vz, opts = {}) {
  const ammoId = opts.ammoId != null ? opts.ammoId : ITEM.ARROW;
  const passes = buildDropGeom(ammoId);
  if (!passes.length) return null;
  const group = new THREE.Group();
  for (const { p, geo, mat: matOverride, node } of passes) {
    if (node) { group.add(node); continue; }
    const m = new THREE.Mesh(geo, matOverride || MATERIALS[p]);
    m.renderOrder = p;
    group.add(m);
  }
  group.scale.setScalar((typeof DROP_SCALE === 'number' ? DROP_SCALE : 0.3) * ARROW_SCALE);
  group.position.set(x, y, z);
  scene.add(group);
  const ap = ammoProps(ammoId) || {};
  const a = {
    ammoId, group, vx, vy, vz, age: 0, stuck: 0,
    dmg: opts.dmg != null ? opts.dmg : (ap.damage || 4),
    gravity: ap.gravity != null ? ap.gravity : 11,
    drag: ap.drag || 0,
    knock: ap.knock || 4,
    stickTime: ap.stick || 15,
    stickPick: ap.stickPick || 120,
    pickable: false,                        // decided at impact, see updateArrows
    fromPlayer: !!opts.fromPlayer,
    recover: opts.recover || 0,
    shooter: opts.shooter || null,          // the entity that loosed it, so it can't hit itself
    byName: opts.byName || 'Skeleton',
  };
  _aimArrow(a);
  ARROWS.push(a);
  return a;
}
function _aimArrow(a) {
  _aDir.set(a.vx, a.vy, a.vz);
  if (_aDir.lengthSq() < 1e-6) return;
  a.group.quaternion.setFromUnitVectors(_ARROW_AXIS, _aDir.normalize());
}
function removeArrow(i) {
  scene.remove(ARROWS[i].group);
  ARROWS.splice(i, 1);
}
function clearArrows() { while (ARROWS.length) removeArrow(ARROWS.length - 1); }

/* An arrow fired at 40 blocks/s crosses two thirds of a block per frame, and a mob is 0.6 wide —
   so the flight is stepped in sub-block hops rather than one jump per frame. Nothing tunnels
   through a wall or past a body it should have hit. */
const ARROW_STEP = 0.25;
function updateArrows(dt) {
  for (let i = ARROWS.length - 1; i >= 0; i--) {
    const a = ARROWS[i];
    a.age += dt;
    if (a.stuck > 0) {                       // planted in a block: no physics, just a fuse
      a.stuck -= dt;
      // a recoverable arrow is collected by walking over it, exactly like a dropped item
      if (a.pickable && _arrowPickup(a)) { removeArrow(i); continue; }
      if (a.stuck <= 0) removeArrow(i);
      continue;
    }
    if (a.age > 25 || a.group.position.y < -30) { removeArrow(i); continue; }
    if (a.drag) { const k = Math.max(0, 1 - a.drag * dt); a.vx *= k; a.vy *= k; a.vz *= k; }
    a.vy -= a.gravity * dt;
    const speed = Math.hypot(a.vx, a.vy, a.vz);
    const steps = Math.max(1, Math.min(12, Math.ceil(speed * dt / ARROW_STEP)));
    const sdt = dt / steps;
    let done = false;
    for (let s = 0; s < steps && !done; s++) {
      const pos = a.group.position;
      const nx = pos.x + a.vx * sdt, ny = pos.y + a.vy * sdt, nz = pos.z + a.vz * sdt;
      // 1) a body in the way
      const ent = _arrowHitEntity(a, nx, ny, nz);
      if (ent) {
        pos.set(nx, ny, nz);
        _arrowHitsEntity(a, ent);
        removeArrow(i); done = true; break;
      }
      // 2) a player in the way (mob arrows only — you cannot shoot yourself in the back)
      if (!a.fromPlayer && !a.spent) {
        const tp = _arrowHitPlayer(nx, ny, nz);
        if (tp) {
          // a raised shield facing the shot turns it: it glances off and tumbles away (0.745)
          if (typeof shieldBlock === 'function' && shieldBlock(tp, nx - a.vx, nz - a.vz, a.dmg)) {
            _bounceArrow(a);
            break;                               // still in flight — it just changed direction
          }
          _arrowHitsPlayer(a, tp, nx, ny, nz);
          removeArrow(i); done = true; break;
        }
      }
      // 3) terrain: plant it where it struck
      if (isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        pos.set(pos.x + a.vx * sdt * 0.5, pos.y + a.vy * sdt * 0.5, pos.z + a.vz * sdt * 0.5);
        /* Landing decides whether this one survived the shot. Half of your own arrows do, and
           those are left standing in the ground to be walked over and picked back up; the rest
           are broken shafts that simply rot away, and nothing a mob fired is ever recoverable. */
        a.pickable = a.fromPlayer && a.recover > 0 && Math.random() < a.recover;
        a.stuck = a.pickable ? a.stickPick : a.stickTime;
        a.vx = a.vy = a.vz = 0;
        playSound('hit', { gain: 0.35, rate: 1.5 + Math.random() * 0.2,
                           pos: { x: pos.x, y: pos.y, z: pos.z } });
        done = true; break;
      }
      pos.set(nx, ny, nz);
    }
    if (!done) _aimArrow(a);                 // nose follows the arc on the way down
  }
}

/* Walk-over pickup for a planted arrow. Deliberately the SAME rules a dropped item uses — the
   nearest living player inside DROP_PICKUP_R takes it, the grab runs inside that player's context
   so split screen lands it in the right inventory, and a full inventory means it stays put. */
function _arrowPickup(a) {
  const p = a.group.position;
  let taker = null, bestD2 = DROP_PICKUP_R * DROP_PICKUP_R;
  for (const pl of PLAYERS) {
    if (pl.dead || !pl.spawned || pl.canFly) continue;
    const dx = p.x - pl.pos.x, dy = p.y - (pl.pos.y + pl.H * 0.5), dz = p.z - pl.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; taker = pl; }
  }
  if (!taker) return false;
  return withPlayer(taker, () => tryPickup(a.ammoId, null, 'recovered'));
}

/* Deflected by a shield: thrown back and up at a fraction of its speed, and SPENT — it can no
   longer hurt anything, player or mob, and when it lands it is a broken shaft, not a pickup. */
function _bounceArrow(a) {
  a.vx *= -0.28; a.vz *= -0.28;
  a.vy = Math.abs(a.vy) * 0.2 + 3.2;
  a.spent = true;
  a.recover = 0;
}

function _arrowHitEntity(a, x, y, z) {
  if (a.spent) return null;                  // a deflected arrow is harmless
  for (const e of ENTITIES) {
    if (e.hp <= 0 || e === a.shooter) continue;
    if (a.fromPlayer && e.rider && e.rider === a.owner) continue;   // never your own mount
    if (!a.fromPlayer && e.kind === a.shooterKind) continue;   // mobs don't shoot their own kind
    const er = entR(e);                      // each body's own box (size-scaled, 0.7441)
    if (Math.abs(x - e.x) > er + 0.15 || Math.abs(z - e.z) > er + 0.15) continue;
    if (y < e.y - 0.1 || y > e.y + entH(e)) continue;
    return e;
  }
  return null;
}
function _arrowHitsEntity(a, ent) {
  const m = Math.hypot(a.vx, a.vz) || 1;
  ent.kx = a.vx / m * a.knock;
  ent.kz = a.vz / m * a.knock;
  playSound('hit', { gain: 0.6, rate: 1.1 + Math.random() * 0.15,
                     pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
  // a mob's arrow is a creature's blow (0.7912): no XP or loot for the player, no grudge against them
  if (a.fromPlayer) damageEntity(ent, a.dmg); else damageEntityByMob(ent, a.dmg, a.shooter);
}
function _arrowHitPlayer(x, y, z) {
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    const r = (p.R || 0.3) + 0.15;
    if (Math.abs(x - p.pos.x) > r || Math.abs(z - p.pos.z) > r) continue;
    if (y < p.pos.y - 0.1 || y > p.pos.y + (p.H || 1.8)) continue;
    return p;
  }
  return null;
}
function _arrowHitsPlayer(a, tp, x, y, z) {
  tp.hp -= a.dmg;
  tp._dmgCause = `was shot by a ${a.byName}`;
  const m = Math.hypot(a.vx, a.vz) || 1;
  const kick = playerKick(tp);
  const kbMul = 1 - (typeof playerKnockbackResist === 'function'
                     ? withPlayer(tp, playerKnockbackResist) : 0);
  kick.x = a.vx / m * PLY_KNOCK * 0.55 * kbMul;
  kick.z = a.vz / m * PLY_KNOCK * 0.55 * kbMul;
  playSound('hit', { gain: 0.7, rate: 1.0, pos: { x, y, z } });
}

/* ---------------------------------- mobs ----------------------------------
   A mob shoots through the same spawnArrow the player does; only the aim is different. It leads
   the target slightly and lifts the shot, because an arrow that leaves flat always lands short. */
function mobShoot(e, tp, opts = {}) {
  const dx = tp.pos.x - e.x;
  const dy = (tp.pos.y + (tp.EYE || 1.62) * 0.6) - (e.y + 1.5);
  const dz = tp.pos.z - e.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const speed = opts.speed || 30;
  const t = dist / speed;                              // rough time of flight
  const g = opts.gravity != null ? opts.gravity : 11;
  const spread = opts.spread != null ? opts.spread : 0.05;
  // aim high by half the drop over the flight, plus a little scatter so they are not snipers
  const aimY = dy + 0.5 * g * t * t;
  const inv = 1 / Math.hypot(dx, aimY, dz);
  const vx = (dx * inv + (Math.random() - 0.5) * spread) * speed;
  const vy = (aimY * inv + (Math.random() - 0.5) * spread) * speed;
  const vz = (dz * inv + (Math.random() - 0.5) * spread) * speed;
  const a = spawnArrow(e.x, e.y + 1.45, e.z, vx, vy, vz, {
    ammoId: opts.ammoId != null ? opts.ammoId : ITEM.ARROW,
    dmg: opts.dmg != null ? opts.dmg : 4,
    fromPlayer: false, shooter: e, byName: e.name || 'Skeleton',
  });
  if (a) a.shooterKind = e.kind;
  playSound('snowball', { gain: 0.5, rate: 0.9 + Math.random() * 0.2,
                          pos: { x: e.x, y: e.y + 1.4, z: e.z } });
  return a;
}

/* Clear line to the target? Marched in half-block steps from the shooter's chest to the target's
   — a skeleton behind a wall draws its bow forever otherwise, and arrows into the wall are worse. */
function hasLineOfSight(x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const dist = Math.hypot(dx, dy, dz);
  const n = Math.ceil(dist / 0.5);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isSolid(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t), Math.floor(z0 + dz * t)))
      return false;
  }
  return true;
}
