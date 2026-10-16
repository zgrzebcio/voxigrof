'use strict';
/* player/body.js: a player's own body in the world and the third-person camera (F5). */

/* ================================ third-person view ================================ */
// 0 = first person, 1 = over the shoulder, 2 = looking back at the face
var camView = 0;
var _selfModel = buildHumanoid();
_selfModel.root.visible = false;
scene.add(_selfModel.root);
var _selfPhase = 0, _selfPrevX = 0, _selfPrevZ = 0;
var _selfCrouch = 0;                 // 0..1 eased sneak amount, drives the torso lean
var _selfLie = 0;                    // 0..1 eased "in bed" amount, tips the model onto its back

/* Held item in the third-person right hand. Reuses the drop geometry (same meshes the
   first-person hand uses) parented to the arm pivot so it swings with the walk cycle. */
/* Held blocks use the world voxel shader, which reads the live day/night uniforms — in a hand
   that made the item almost black at night. These clones freeze their own uniform set at
   full-bright with shadows and fog off, so a carried block stays readable like the
   first-person one does. Cloned lazily so the atlas texture is already assigned. */
const _brightMats = [];
function _brightMat(p) {
  if (_brightMats[p]) return _brightMats[p];
  const m = MATERIALS[p].clone();                 // ShaderMaterial.clone deep-copies uniforms
  m.uniforms.uAmbient.value = 1.0;
  m.uniforms.uDirect.value = 0.0;
  m.uniforms.uShadowOn.value = 0.0;
  m.uniforms.uCloudOn.value = 0.0;                // its own copy never follows the clouds
  m.uniforms.uLightColor.value.set(1, 1, 1);
  if (m.uniforms.fogNear) m.uniforms.fogNear.value = 1e6;
  if (m.uniforms.fogFar) m.uniforms.fogFar.value = 1e7;
  _brightMats[p] = m;
  return m;
}

var _selfHeld = new THREE.Group();
_selfModel.armR.add(_selfHeld);
var _selfHeldId = undefined;
function _syncSelfHeld() {
  const id = slotId(HOTBAR[hotbarSel]);
  if (id === _selfHeldId) return;
  _selfHeldId = id;
  setHeldOnArm(_selfHeld, id);   // the shared humanoid pose — mobs use the very same one
}

function cycleCameraView() {
  camView = (camView + 1) % 3;
  toast(camView === 0 ? 'First person' : camView === 1 ? 'Third person' : 'Third person (front)');
}

// March out from the eye until a solid block is hit, so the camera never ends up inside terrain.
function _camPullback(ox, oy, oz, dx, dy, dz, want) {
  for (let t = 0.25; t <= want; t += 0.15) {
    if (isSolid(Math.floor(ox + dx * t), Math.floor(oy + dy * t), Math.floor(oz + dz * t)))
      return Math.max(0, t - 0.3);
  }
  return want;
}

/* Called from the frame loop right after the first-person camera transform is set.

   The body is now POSED UNCONDITIONALLY, not only in third person. In split screen every
   other player has to see this one walking around, and that means the model must be animated and
   lit whether or not its owner is looking at it. Who actually sees it is decided per render pass:
   36-splitscreen.js hides a player's own body in their own viewport when they are in first
   person, and shows it in everyone else's. */
/* How far through an arm swing this player is, as the `atk` value animateHumanoid wants: 1 at the
   start of the stroke, falling to 0 as it lands.

   This reads the SAME state the first-person hand does (player/hands.js) rather than tracking its own,
   so the body and the arm you are holding always agree. `_swingT` is set to 0 by every action that
   should look like a swing — breaking, a landed placement, a bush pickup — and mining drives a
   continuous chop off the accumulated dig time instead. Both are per-player swapped globals, so
   each seat animates from its own actions. One frame behind the hand, which nobody can see. */
function selfSwingPhase() {
  if (!playing || menuScene) return 0;
  const HAND_SWING_PERIOD = 0.32;                       // must match updateHands
  if (!player.canFly && mining.active)
    return 1 - (mining.elapsed % HAND_SWING_PERIOD) / HAND_SWING_PERIOD;
  return _swingT >= 0 ? 1 - _swingT : 0;
}

function applyCameraView(dt) {
  const alive = !menuScene && player.spawned;
  _selfModel.root.visible = alive;
  player._bodyVisibleToSelf = alive && camView !== 0;
  if (alive) {
    const dx = player.pos.x - _selfPrevX, dz = player.pos.z - _selfPrevZ;
    const spd = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    _selfPhase += Math.min(spd, 9) * dt * 2.2;
    const swing = Math.min(spd / 5.5, 1) * 0.72;
    /* Sneaking: ease the lean in and out rather than snapping, and drop the whole body with it —
       the first-person eye already dips from 1.62 to 1.42, so the model has to follow or the two
       views disagree about how tall this player currently is. */
    _selfCrouch += ((player.sneaking ? 1 : 0) - _selfCrouch) * Math.min(1, dt * 12);
    /* Lying in a bed: the whole model is tipped onto its back and dropped to mattress
       height, so from another player's viewport you can see who is actually asleep. Eased, so
       climbing in and getting up read as movements rather than a snap. */
    _selfLie += ((player.sleepingAt ? 1 : 0) - _selfLie) * Math.min(1, dt * 9);
    const lie = _selfLie;
    /* the body lies along the BED, not the way you look (the mouse still turns your head while you lie), on
       its back whichever way the bed points — the tip is about the body's own X now (Euler 'YXZ': yaw first), where it
       was about the world's X and rolled a sideways bed's sleeper onto their right side. The feet are pulled back half
       a body length from the bed's middle so the sleeper lies on the mattress, head on the pillow, not beside it. */
    if (player.sleepingAt) player._bedDir = BED_DIR[player.sleepingAt.facing & 3];   // kept on the player for the ease out of bed
    const bd = player._bedDir || [0, 1], half = 0.9 * lie;       // half the body's 1.8 length
    _selfModel.root.rotation.order = 'YXZ';
    _selfModel.root.position.set(player.pos.x - bd[0] * half,
      player.pos.y - 0.14 * _selfCrouch * (1 - lie) + 0.23 * lie, player.pos.z - bd[1] * half);   // the back of the head on the mattress
    const yawStand = player.yaw + Math.PI, yawBed = Math.atan2(bd[0], bd[1]) + Math.PI;   // model faces +Z, yaw 0 looks -Z
    const dyaw = Math.atan2(Math.sin(yawBed - yawStand), Math.cos(yawBed - yawStand));
    _selfModel.root.rotation.y = yawStand + dyaw * lie;
    _selfModel.root.rotation.x = -Math.PI / 2 * lie;     // onto its back, head toward the pillow
    _syncSelfHeld();
    // worn armor on the body, for third person and everyone else's view (player/equipment.js)
    if (typeof syncArmorOnModel === 'function') syncArmorOnModel(_selfModel, equipSlots);
    animateHumanoid(_selfModel, _selfPhase, swing * (1 - lie), -player.pitch * 0.6 * (1 - lie),
                    selfSwingPhase() * (1 - lie), {
      lean: 0.5 * _selfCrouch * (1 - lie),
      eat: player._eatProg || 0,
      hold: _selfHeldId != null,
      // an offhand torch is carried out in front on the left, as the right arm carries its item
      holdL: typeof offhandItemId === 'function' && offhandItemId() != null && !isShieldId(offhandItemId()),
      // everyone else sees this player draw, and how far back the string is (38-ranged.js)
      draw: (player._drawProg || 0) * (1 - lie),
      // a raised shield, in whichever hand holds it (40-shield.js)
      block:  (player._shieldHand === 'off'  ? (player._shieldUp || 0) : 0) * (1 - lie),
      blockR: (player._shieldHand === 'main' ? (player._shieldUp || 0) : 0) * (1 - lie),
    });
    // the arrow on this player's string, shown to everyone else at the same draw as their own view
    poseModelNock(_selfModel, typeof rangedNocked === 'function' ? rangedNocked() : null,
                  (player._drawProg || 0) * (1 - lie));
    // whatever the offhand holds on the left arm, and a main-hand shield's raise, seen by everyone
    if (typeof poseBodyOffhand === 'function') {
      poseBodyOffhand(_selfModel, offhandItemId(),
                      (player._shieldHand === 'off' ? (player._shieldUp || 0) : 0) * (1 - lie));
      poseMainShield(_selfHeld, _selfHeldId,
                     (player._shieldHand === 'main' ? (player._shieldUp || 0) : 0) * (1 - lie));
    }
    // a worn backpack, riding on the torso so it leans with a sneak (41-backpack.js)
    if (typeof poseBodyBack === 'function') poseBodyBack(_selfModel, backpackItemId());
    // arms tucked in at the sides while asleep, rather than hanging as if standing
    if (lie > 0.01) {
      _selfModel.armR.rotation.x *= (1 - lie); _selfModel.armL.rotation.x *= (1 - lie);
      _selfModel.armR.rotation.z = 0.12 * lie;  _selfModel.armL.rotation.z = -0.12 * lie;
      _selfModel.legR.rotation.x *= (1 - lie);  _selfModel.legL.rotation.x *= (1 - lie);
    }
    shadeHumanoid(_selfModel, player.pos.x, player.pos.y, player.pos.z, false);
    /* Name tag: normally drawn through the world so you can find each other, but crouching hides
       it behind blocks AND dims it — sneaking is how you stop advertising your position. The
       depth test is a hard switch on the input; the dimming follows the eased crouch so it fades
       with the pose rather than snapping. */
    const tag = _selfModel.nameTag;
    if (tag) {
      tag.material.depthTest = !!player.sneaking;
      tag.material.color.setScalar(1 - 0.5 * _selfCrouch);   // darker, not more transparent
    }
  }
  _selfPrevX = player.pos.x; _selfPrevZ = player.pos.z;
  if (camView === 0) return;

  const eye = camera.position;
  // camera-space backward vector, then pulled to whichever side this view wants
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  const sign = camView === 1 ? 1 : -1;
  const d = _camPullback(eye.x, eye.y, eye.z, back.x * sign, back.y * sign, back.z * sign, 3.6);
  eye.set(eye.x + back.x * sign * d, eye.y + back.y * sign * d, eye.z + back.z * sign * d);
  if (camView === 2) camera.rotation.set(-player.pitch, player.yaw + Math.PI, 0);
}
