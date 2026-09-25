'use strict';
/* voxiGrof — shields, the offhand, and the arm that holds it (0.745, 0.7451)

   The OFFHAND is an equipment slot (31-armor.js). It takes a shield or a torch; anything in it
   shows in a second arm on the left of the view and on the body's left arm.

   A shield works from EITHER hand (0.7451). In the main hand it raises the right arm; in the
   offhand it raises the left — but only when the main hand has no right-click use of its own (a
   bow draws, food is eaten, a block is placed; a sword, a tool or an empty hand leave the button
   free). A main-hand shield always wins over an offhand one.

   Raised, it stops what comes at you from the FRONT: a mob's blow does no damage and barely
   shoves you, and an arrow glances off and tumbles away harmless. Every stopped hit costs the
   shield durability equal to the damage it would have done. Anything from the side or behind,
   and anything that is not an attack — a fall, lava, drowning — goes straight through. */

const SHIELD_FRONT_COS = Math.cos(70 * Math.PI / 180);   // a 140-degree cone in front of the view
const SHIELD_RAISE_TIME = 0.15;          // seconds to get it up before it counts: no parry spam
const SHIELD_KNOCK_MUL = 0.35;           // a blocked blow still shoves, just much less
const SHIELD_MOVE_MUL = 0.45;            // walking behind a raised shield is slow
const EAT_MOVE_MUL = SHIELD_MOVE_MUL;    // and so is eating (0.7591), read in 22-main-loop.js
const DRAW_MOVE_MUL = SHIELD_MOVE_MUL;   // ...and drawing a bow (0.7592)

const offhandSlot = () => (typeof equipSlots !== 'undefined' && equipSlots)
  ? equipSlots[EQUIP_INDEX.offhand] : null;
const offhandItemId = () => { const s = offhandSlot(); return s ? s.id : null; };
const isShieldId = (id) => id != null && id >= 256 && !!ITEM_PROPS[id]?.shield;
const offhandShield = () => { const s = offhandSlot(); return s && isShieldId(s.id) ? s : null; };

// Does the main hand already own the right mouse button? Then the offhand stays down.
function mainHandUsesRightClick(id) {
  if (id == null) return false;
  if (id < 256) return true;                                     // blocks place
  const p = ITEM_PROPS[id] || {};
  return !!(p.shield || p.food > 0 || p.ranged || p.throwable || p.tool === 'shears'
         || id === ITEM.BUCKET || id === ITEM.WATER_BUCKET || id === ITEM.LAVA_BUCKET
         || id === ITEM.SUGAR_CANE || id === ITEM.SADDLE);
}
// which shield the right button would raise right now, and from which hand (active seat)
function _activeShield() {
  const main = HOTBAR[hotbarSel];
  if (main && isShieldId(main.id)) return slotBroken(main) ? null : { slot: main, hand: 'main' };   // broken: no block (0.79)
  const off = offhandShield();
  if (off && !slotBroken(off) && !mainHandUsesRightClick(slotId(main))) return { slot: off, hand: 'off' };
  return null;
}

/* Once per frame, inside the active seat (called from the main loop after updateHands). The
   blocking state lives on the PLAYER object, so the mobs — which tick once for the whole world —
   can read whether the player they are hitting has it up. */
function updateShield(dt, wantPlace) {
  const a = _activeShield();
  const want = !!a && wantPlace && playing && !invOpen && !menuScene && !player.dead;
  player._shieldHand = a ? a.hand : null;
  player._raiseT = want ? Math.min(SHIELD_RAISE_TIME, (player._raiseT || 0) + dt) : 0;
  player.blocking = want && player._raiseT >= SHIELD_RAISE_TIME;
  // the visual raise leads the functional one, so the arm is already moving when you press
  const target = want ? 1 : 0;
  player._shieldUp = (player._shieldUp || 0) + (target - (player._shieldUp || 0)) * Math.min(1, dt * 16);
  if (player._shieldUp < 0.01) player._shieldUp = 0;
  if (player._shieldHitT > 0) player._shieldHitT -= dt;
  if (player._offSwingT > 0) player._offSwingT -= dt;
  if (player._offPickT > 0) player._offPickT -= dt;          // a forage grab with the left hand (0.802)
  _poseOffhandArm(dt);
}

/* The one place a hit is tested against a shield. `fromX/fromZ` is where the attack came from.
   Returns true when it was stopped — the caller then skips the damage. The shield worn is the
   one held by the player being HIT, which in split screen is not necessarily the seat that
   happens to be installed, hence withPlayer. */
function shieldBlock(tp, fromX, fromZ, dmg) {
  if (!tp || !tp.blocking) return false;
  const fx = -Math.sin(tp.yaw), fz = -Math.cos(tp.yaw);           // where the player is looking
  const dx = fromX - tp.pos.x, dz = fromZ - tp.pos.z, d = Math.hypot(dx, dz) || 1;
  if ((dx * fx + dz * fz) / d < SHIELD_FRONT_COS) return false;   // from the side or behind
  withPlayer(tp, () => {
    const a = _activeShield();
    if (!a || tp.canFly || a.slot.dur == null) return;
    const w = wearSlot(a.slot, Math.max(1, Math.ceil(dmg || 1)));
    if (w === 'gone') {
      if (a.hand === 'main') HOTBAR[hotbarSel] = null;
      else equipSlots[EQUIP_INDEX.offhand] = null;
    }
    if (w !== 'kept') { tp.blocking = false; playSound('toolBreak', { gain: 0.8 }); }
    if (a.hand === 'main') { saveHotbar(); buildHotbar(); updateHotbar(); }
    else { saveEquip(); if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel(); }
  });
  playSound('wood', { gain: 0.9, rate: 0.72 + Math.random() * 0.1,
                      pos: { x: tp.pos.x, y: tp.pos.y + 1.2, z: tp.pos.z } });
  tp._shieldHitT = 0.18;                   // the arm jolts back on impact
  if (typeof fxShieldHit === 'function') fxShieldHit(tp, fromX, fromZ);   // wood chips and sparks off its face (0.803)
  return true;
}

/* ---------------------------------- the shield model ----------------------------------
   The front is the item icon extruded like every other held item. The side you HOLD is a
   different picture (shield_back.png: battens, padding and grip), laid on a plane just behind
   the sprite. It gets the same 0.12-pi lean buildItemDropGeom gives the sprite, or the two would
   separate at the edges. */
let _shieldBackTex = null;
function buildShieldNode(id) {
  const g = new THREE.Group();
  for (const { p, geo, mat: mo, node } of buildDropGeom(id))
    g.add(node || new THREE.Mesh(geo, mo || MATERIALS[p]));
  if (!_shieldBackTex && typeof IMAGES !== 'undefined' && IMAGES.shield_back) {
    _shieldBackTex = new THREE.Texture(IMAGES.shield_back);
    _shieldBackTex.colorSpace = THREE.SRGBColorSpace;
    _shieldBackTex.magFilter = THREE.NearestFilter;
    _shieldBackTex.minFilter = THREE.NearestFilter;
    _shieldBackTex.generateMipmaps = false;
    _shieldBackTex.needsUpdate = true;
  }
  if (_shieldBackTex) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateY(Math.PI);                                        // faces -Z: the held side
    geo.translate(0, 0, -(ITEM_DROP_THICK / 2) - 0.004);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI * 0.12));
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: _shieldBackTex, transparent: true, alphaTest: 0.5 })));
  }
  return g;
}

/* ---------------------------------- first person: the offhand arm ----------------------------------
   Built with the right arm (24-hands.js) and hung off root.userData.off. It shows whatever the
   offhand holds. A shield rests low on the left turned edge-on, and when raised swings in front
   of the left half of the view with its back toward you (its FRONT always faces away, hence the
   half turn about Y). A torch is simply carried, upright, where you can see its light. */
const OFF_REST  = { pos: [-0.86, -1.06, -2.10], arm: [H_RX, -H_RY],        sh: [0.14, 0.46, 0.10], rot: [-0.15, Math.PI - 0.6, 0.06] };
const OFF_RAISE = { pos: [-0.44, -0.60, -1.78], arm: [H_RX + 0.35, -0.12], sh: [0.20, 0.40, 0.06], rot: [0.0,   Math.PI - 0.14, 0.0] };
const OFF_ITEM  = { sh: [0.10, 0.52, 0.02], rot: [-0.25, 0.25, 0.10], scale: 0.55 };   // a carried block (torch)
const SHIELD_FP_SCALE = 2.5;                // doubled in 0.757
function _poseOffhandArm(dt) {
  const off = handRoot && handRoot.userData && handRoot.userData.off;
  if (!off) return;
  const id = offhandItemId();
  // an empty left arm still comes up for a forage grab (0.802)
  const show = (id != null || player._offPickT > 0 || player._climbAnim) && playing && !menuScene && !invOpen && !player.dead;
  off.root.visible = show;
  if (!show) { off.root.position.y = OFF_REST.pos[1] - 1.4; return; }       // come back up from below
  const shield = id != null && isShieldId(id);
  if (off.heldId !== id) {
    off.heldId = id;
    while (off.held.children.length) off.held.remove(off.held.children[0]);
    if (id == null) { /* bare hand */ }
    else if (shield) {
      const node = buildShieldNode(id);
      node.scale.setScalar(SHIELD_FP_SCALE);
      off.held.add(node);
    } else {
      const passes = buildDropGeom(id);
      // a torch is fattened and turned so it reads as a stick, not a sliver (24-hands.js, 0.7523)
      if (id === B.TORCH && typeof wrapHeldTorch === 'function') wrapHeldTorch(off.held, passes);
      else for (const { p, geo, mat: mo, node } of passes)
        off.held.add(node || new THREE.Mesh(geo, mo || MATERIALS[p]));
      off.held.scale.setScalar(OFF_ITEM.scale);
    }
    if (shield) off.held.scale.setScalar(1);
  }
  // only an OFFHAND shield raises this arm; a main-hand one is the right arm's business
  const u = shield && player._shieldHand === 'off' ? (player._shieldUp || 0) : 0;
  const L = (a, b) => a + (b - a) * u;
  const jolt = (player._shieldHitT > 0 && player._shieldHand === 'off') ? player._shieldHitT / 0.18 * 0.12 : 0;
  const swing = player._offPickT > 0 ? Math.sin((1 - player._offPickT / 0.35) * Math.PI)          // forage grab
    : player._offSwingT > 0 ? Math.sin((1 - player._offSwingT / 0.25) * Math.PI) : 0;               // placed a torch
  // climbing (0.804): the left arm reaches while the right one pulls (24-hands.js), half a beat apart
  const cl = player._climbAnim ? Math.sin((player._climbT || 0) * 7 + Math.PI) : 0, climb = player._climbAnim ? 1 : 0;
  const k = 1 - Math.exp(-dt * 18);
  const r = off.root.position;
  r.x += (L(OFF_REST.pos[0], OFF_RAISE.pos[0]) + climb * 0.12 - r.x) * k;
  r.y += (L(OFF_REST.pos[1], OFF_RAISE.pos[1]) + swing * 0.06 + climb * (0.4 + cl * 0.16) - r.y) * k;
  r.z += (L(OFF_REST.pos[2], OFF_RAISE.pos[2]) + jolt - r.z) * k;
  off.pivot.rotation.x = L(OFF_REST.arm[0], OFF_RAISE.arm[0]) - swing * 0.8 + climb * (0.75 + cl * 0.3);
  off.pivot.rotation.y = L(OFF_REST.arm[1], OFF_RAISE.arm[1]);
  if (shield) {
    off.held.position.set(L(OFF_REST.sh[0], OFF_RAISE.sh[0]), L(OFF_REST.sh[1], OFF_RAISE.sh[1]),
                          L(OFF_REST.sh[2], OFF_RAISE.sh[2]));
    off.held.rotation.set(L(OFF_REST.rot[0], OFF_RAISE.rot[0]), L(OFF_REST.rot[1], OFF_RAISE.rot[1]),
                          L(OFF_REST.rot[2], OFF_RAISE.rot[2]));
  } else {
    off.held.position.set(OFF_ITEM.sh[0], OFF_ITEM.sh[1] + swing * 0.1, OFF_ITEM.sh[2]);
    off.held.rotation.set(OFF_ITEM.rot[0] - swing * 0.5, OFF_ITEM.rot[1], OFF_ITEM.rot[2]);
  }
}

/* ---------------------------------- third person ----------------------------------
   Offhand item on the body's LEFT arm. A shield hanging faces outward from the arm; blocking,
   the arm comes up (animateHumanoid's `block`), and in a raised arm's frame world-forward is
   local -Y — so Rx(+90deg) turns the face to point where the player is looking. Anything else in
   the offhand (a torch) takes the shared hold pose from setHeldOnArm. */
function _poseShieldGroup(grp, up, side) {
  if (up > 0.5) {
    grp.position.set(0, -12.5 * PX, 0);
    grp.rotation.set(Math.PI / 2, 0, 0);
  } else {
    grp.position.set(side * 2.3 * PX, -7 * PX, 0);
    grp.rotation.set(0, side * Math.PI / 2, 0);
  }
}
function poseBodyOffhand(m, id, up) {
  if (!m) return;
  if (id == null && !m.offGrp) return;
  if (!m.offGrp) { m.offGrp = new THREE.Group(); m.armL.add(m.offGrp); }
  if (m._offId !== id) {
    m._offId = id;
    if (isShieldId(id)) {
      while (m.offGrp.children.length) m.offGrp.remove(m.offGrp.children[0]);
      const n = buildShieldNode(id); n.scale.setScalar(1.24); m.offGrp.add(n);
      m.offGrp.scale.setScalar(1);
    } else setHeldOnArm(m.offGrp, id);
  }
  m.offGrp.visible = id != null;
  if (isShieldId(id)) _poseShieldGroup(m.offGrp, up, 1);         // +X: outside of the left arm
}
// a shield in the MAIN hand, on the right arm: hanging outward, or up in front when blocking
function poseMainShield(grp, id, up) {
  if (grp && isShieldId(id)) _poseShieldGroup(grp, up, -1);       // -X: outside of the right arm
}
