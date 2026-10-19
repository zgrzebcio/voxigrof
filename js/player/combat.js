'use strict';
/* player/combat.js: a player fighting. Which creature the crosshair is on, whether it beats the block behind it,
   how fast and how hard a swing is, and the swing itself (tryAttackEntity). */

/* Ray from the camera against every entity's AABB — used by the attack hook so hitting a mob
   takes priority over mining the block behind it. Returns the nearest entity within reach. */
const _atkDir = new THREE.Vector3();
const _atkOrigin = new THREE.Vector3();
const _blockDir = new THREE.Vector3();
function pickEntityHit(maxDist = 4.0) {
  camera.getWorldDirection(_atkDir);
  if (camView === 2) _atkDir.negate();     // front view: the camera looks back at the player
  // Always swing from the EYE, never from camera.position — in third person the camera has been
  // pulled several blocks backwards, which put most of the reach behind the player and made
  // hits (and therefore knockback) silently miss.
  _atkOrigin.set(player.pos.x, player.pos.y + player.EYE, player.pos.z);
  const o = _atkOrigin;
  let best = null, bestT = Infinity;
  for (const e of ENTITIES) {
    // the animal under you is never the thing you are swinging at — its box now grows with it,
    // and aiming down from the saddle would otherwise land every blow on your own horse
    if (e.rider === player) continue;
    // slab test against the entity box
    const er = entR(e), eh = entH(e);          // its own size: a foal is a smaller target
    const bx0 = e.x - er, bx1 = e.x + er;
    const by0 = e.y,      by1 = e.y + eh;
    const bz0 = e.z - er, bz1 = e.z + er;
    let t0 = 0, t1 = maxDist, ok = true;
    for (const [ro, rd, b0, b1] of [[o.x, _atkDir.x, bx0, bx1],
                                    [o.y, _atkDir.y, by0, by1],
                                    [o.z, _atkDir.z, bz0, bz1]]) {
      if (Math.abs(rd) < 1e-6) { if (ro < b0 || ro > b1) { ok = false; break; } continue; }
      let ta = (b0 - ro) / rd, tb = (b1 - ro) / rd;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < bestT) { bestT = t0; best = e; }
  }
  return best ? { ent: best, t: bestT } : null;
}
function pickEntity(maxDist = 4.0) {
  const h = pickEntityHit(maxDist);
  return h ? h.ent : null;
}

/* Blocks you can reach a mob through: billboards (tall grass, flowers, saplings) and leaves.
   Standing in a bush must not make the bush eat your swing. Glass and other cutout blocks are
   deliberately excluded — they're solid to a fist. */
function _swingPassable(id) {
  const p = PROPS[id & 255];
  if (!p) return false;
  return p.model === 'cross' || (id & 255) === B.LEAVES || (id & 255) === B.BIRCH_LEAVES;
}

/* Does the aimed entity take priority over the aimed block?
   `hit.t` is measured from camera.position (which in third person sits metres behind the head)
   while entity picking starts at the eye, so the block distance is re-measured from the eye
   before the two are compared. */
function entityBeatsBlock(entHit, hit) {
  if (!entHit) return false;
  if (!hit || hit.t == null) return true;
  if (_swingPassable(hit.id)) return true;
  camera.getWorldDirection(_blockDir);        // NOT _atkDir — that one is flipped in front view
  const hx = camera.position.x + _blockDir.x * hit.t;
  const hy = camera.position.y + _blockDir.y * hit.t;
  const hz = camera.position.z + _blockDir.z * hit.t;
  const dx = hx - _atkOrigin.x, dy = hy - _atkOrigin.y, dz = hz - _atkOrigin.z;
  return entHit.t <= Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/* Attack pacing. A bare hand needs HAND_ATTACK_TIME between swings; a weapon's attackSpeed is a
   multiplier that shortens that (attackSpeed 2 = twice as fast). Swapping what you're holding
   re-arms the full hand delay, so you can't scroll onto a fast sword and hit instantly. */
const HAND_ATTACK_TIME = 0.5;
const FIST_ATTACK_TIME = 1.2;                   // bare hand, or anything that is not a tool
const HAND_DAMAGE = 1;                          // a bare hand (or a block, food): one point of a creature's health
var _atkCooldown = 0;
var _lastHeldForAtk;
function attackCooldownFor(id) {
  const p = id != null && id >= 256 ? ITEM_PROPS[id] : null;
  /* A bare fist, or anything that is not a tool or weapon (a block, food), punches every 1.2s.
     Tools and weapons start from that same hand time and apply their own attackSpeed to it:
     a stone pickaxe at 0.8 swings every 1.5s, an iron sword at 1.9 every ~0.63s. Worn gear speeds
     either one up. */
  const gear = typeof playerAtkSpeedMul === 'function' ? playerAtkSpeedMul() : 1;
  if (!p || !(p.tool || p.ranged)) return FIST_ATTACK_TIME / gear;   // a bow paces like a weapon
  const spd = p.attackSpeed > 0 ? p.attackSpeed : 1;
  return FIST_ATTACK_TIME / (spd * gear);
}
function attackDamageFor(id) {
  const p = id != null && id >= 256 ? ITEM_PROPS[id] : null;
  const base = p && p.damage > 0 ? p.damage : HAND_DAMAGE;
  // strength from equipment is flat bonus damage (diamond sword 7 + iron gloves 0.75 = 7.75)
  return base + (typeof playerStrength === 'function' ? playerStrength() : 0);
}

const TORCH_FIRE_S = 1.5;                    // seconds a creature burns after a torch hits it (4 until 0.8195)
var _fireBlow = false;                       // the blow being dealt right now is a fire torch's (read in damageEntity)
function tryAttackEntity(ent) {
  if (_atkCooldown > 0) return false;
  if (!ent) ent = pickEntity();
  if (!ent) return false;
  // your own tamed hound is never what you swing at: it stands in every fight you have
  if (ent.kind === 'hellhound' && ent.tame && ent.owner === player) return false;
  const held = heldUseId();                  // a broken weapon hits like a fist
  playSound('hit', { gain: 0.9, rate: 0.95 + Math.random() * 0.1, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
  _atkCooldown = attackCooldownFor(held);
  _fireBlow = held === B.TORCH;
  const died = damageEntity(ent, attackDamageFor(held), { x: player.pos.x, z: player.pos.z });
  _fireBlow = false;
  // a torch swung at a creature sets it alight: the same fire lightning starts (53-storms.js)
  if (!died && held === B.TORCH && !player.canFly) {
    if (!(ent.fireT > 0)) playSound('fireIgnite', { gain: 0.8, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
    ent.fireT = Math.max(ent.fireT || 0, TORCH_FIRE_S);
    ent._fireBy = player;                    // whose fire it is
  }
  // Knockback: push along player -> entity. When the two overlap that vector is ~zero and
  // normalising it produced a random direction (the occasional "pulled toward me" hit), so fall
  // back to the aim direction, which is always outward.
  if (!died) {
    let dx = ent.x - player.pos.x, dz = ent.z - player.pos.z;
    let m = Math.hypot(dx, dz);
    if (m < 0.2) { dx = _atkDir.x; dz = _atkDir.z; m = Math.hypot(dx, dz) || 1; }
    // stored as a velocity that decays over the next few frames — moving the position directly
    // read as a teleport
    ent.kx = dx / m * ENT_KNOCK * 12;
    ent.kz = dz / m * ENT_KNOCK * 12;
    // test the floor directly rather than trusting the onGround flag from the previous tick
    if (_entBlocked(ent.x, ent.y - 0.02, ent.z)) ent.vy = ENT_KNOCK_HOP;
  }
  // tools wear from swinging at mobs, same as breaking a block
  const slot = HOTBAR[hotbarSel];
  if (!player.canFly && slot && slot.dur != null) {
    if (wearSlot(slot) === 'gone') HOTBAR[hotbarSel] = null;
    saveHotbar(); buildHotbar(); updateHotbar();
  }
  return true;
}

/* Swing pacing is PER PLAYER, so it ticks inside each player's own context rather than once for
   the world — see the per-player pass in 22-main-loop.js. */
function updateAttackCooldown(dt) {
  if (_atkCooldown > 0) _atkCooldown -= dt;
  // swapping hotbar slot / item re-arms the full bare-hand delay
  const heldNow = slotId(HOTBAR[hotbarSel]);
  if (heldNow !== _lastHeldForAtk) {
    if (_lastHeldForAtk !== undefined) _atkCooldown = Math.max(_atkCooldown, HAND_ATTACK_TIME);
    _lastHeldForAtk = heldNow;
  }
}
