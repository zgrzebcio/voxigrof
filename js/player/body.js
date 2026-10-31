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
  m.uniforms.uWet.value = 0.0; m.uniforms.uWetBox.value.w = 0;   // ...nor the wet ground
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

/* Climbing, as everyone else sees it, laid over the pose animateHumanoid gave by the three weights (together at most 1):
     up     hand over hand, both arms high, a knee lifting with the other hand: the beat is `_climbT`, the one the
            first-person hands keep (player/hands.js, 40-shield.js), so a hand goes up in both views at once
     slide  both hands out on the rails, rattling a little over the rungs, the legs together
     hold   the left hand up on a rung, a foot a rung higher; the right arm stays as it was (free: it mines, places, holds) */
const CLIMB_ARM_UP = -2.6, CLIMB_ARM_REACH = 0.35;     // an arm up the ladder, and how far each hand goes over the other
const CLIMB_LEG_UP = -0.35, CLIMB_LEG_REACH = 0.35;    // a thigh lifted to a rung, and the step between the two
const CLIMB_SLIDE_ARM = -2.0, CLIMB_SLIDE_OUT = 0.28;  // sliding: arms lower, out to the rails
const CLIMB_HOLD_ARM = -2.5, CLIMB_HOLD_LEG = -0.3;
function poseBodyClimb(m, up, slide, hold) {
  const t = player._climbT || 0, s = Math.sin(t * 7), rattle = Math.sin(t * 46) * 0.03;
  const sway = Math.sin(performance.now() * 0.0016) * 0.06;
  const mix = (base, w, ...poses) => {           // poses as [value, weight]
    let v = base * (1 - w);
    for (const [p, k] of poses) v += p * k;
    return v;
  };
  const all = up + slide + hold, both = up + slide;
  // right: up and slide only (holding still it is free)
  m.armR.rotation.x = mix(m.armR.rotation.x, both, [CLIMB_ARM_UP - CLIMB_ARM_REACH * s, up], [CLIMB_SLIDE_ARM + rattle, slide]);
  m.armR.rotation.z = mix(m.armR.rotation.z, both, [0.12, up], [-CLIMB_SLIDE_OUT, slide]);
  m.armR.rotation.y *= 1 - both;
  m.armL.rotation.x = mix(m.armL.rotation.x, all, [CLIMB_ARM_UP + CLIMB_ARM_REACH * s, up], [CLIMB_SLIDE_ARM - rattle, slide],
                          [CLIMB_HOLD_ARM + sway, hold]);
  m.armL.rotation.z = mix(m.armL.rotation.z, all, [-0.12, up], [CLIMB_SLIDE_OUT, slide], [-0.1, hold]);
  m.armL.rotation.y *= 1 - all;
  // the left knee comes up with the right hand, and the other way round
  m.legL.rotation.x = mix(m.legL.rotation.x, all, [CLIMB_LEG_UP - CLIMB_LEG_REACH * s, up], [-0.12, slide], [CLIMB_HOLD_LEG, hold]);
  m.legR.rotation.x = mix(m.legR.rotation.x, all, [CLIMB_LEG_UP + CLIMB_LEG_REACH * s, up], [-0.12, slide], [0, hold]);
}

/* Working a station, as everyone else sees it (the first-person hands: BENCH_ARM, player/hands.js; same beat): both arms
   forward and down over the work, w the eased weight `_benchW`. At a bench they beat in turn; at a mortar the right one
   grinds round and the left holds the bowl. */
const WORK_ARM = -0.95, WORK_BEAT = 0.3, WORK_IN = 0.18;
function poseBodyWork(m, w) {
  const t = (player._benchT || 0) * BENCH_BEAT, grind = benchWorkIsMortar(player);
  const r = grind ? Math.sin(t * 0.7) * 0.12 : Math.sin(t) * WORK_BEAT, l = grind ? 0 : -Math.sin(t) * WORK_BEAT;
  const mix = (a, b) => a + (b - a) * w;
  m.armR.rotation.x = mix(m.armR.rotation.x, WORK_ARM + r);
  m.armL.rotation.x = mix(m.armL.rotation.x, WORK_ARM + l);
  m.armR.rotation.z = mix(m.armR.rotation.z, WORK_IN + (grind ? Math.cos(t * 0.7) * 0.1 : 0));
  m.armL.rotation.z = mix(m.armL.rotation.z, -WORK_IN);
  m.armR.rotation.y *= 1 - w; m.armL.rotation.y *= 1 - w;
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
    /* On a ladder, a vine or a wall the body faces what it climbs and the head turns on it to where this player looks (the
       look is held within CLIMB_LOOK_HOLD of it, player/movement.js). The three weights player/tick.js eases, 0..1 together. */
    let cUp = player._climbUpW || 0, cSlide = player._climbSlideW || 0, cHold = player._climbHoldW || 0;
    const cSum = cUp + cSlide + cHold;
    if (cSum > 1) { cUp /= cSum; cSlide /= cSum; cHold /= cSum; }
    const climbW = Math.min(1, cSum) * (1 - lie);
    let climbTurn = 0;
    if (climbW > 0.001 && player._climbFace != null) {
      const want = player._climbFace + Math.PI - yawStand;
      climbTurn = Math.atan2(Math.sin(want), Math.cos(want)) * climbW;
    }
    _selfModel.root.rotation.y = yawStand + dyaw * lie + climbTurn;
    _selfModel.root.rotation.x = -Math.PI / 2 * lie;     // onto its back, head toward the pillow
    _syncSelfHeld();
    _selfHeld.visible = !mainHandBusy(player);            // both hands at work: put away (player/hands.js)
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
      if (_selfModel.offGrp && offHandBusy(player)) _selfModel.offGrp.visible = false;   // climbing, drinking, a bow drawn
      poseMainShield(_selfHeld, _selfHeldId,
                     (player._shieldHand === 'main' ? (player._shieldUp || 0) : 0) * (1 - lie));
    }
    // a worn backpack, riding on the torso so it leans with a sneak (41-backpack.js)
    if (typeof poseBodyBack === 'function') poseBodyBack(_selfModel, backpackItemId());
    // a live fish held out in both hands (player/fish-hold.js), an otter round the neck (entities/otter.js)
    if (typeof poseHeldFishOnBody === 'function') poseHeldFishOnBody(_selfModel, player);
    if (typeof poseOtterScarf === 'function') poseOtterScarf(_selfModel, player, dt);
    if (typeof poseMeerkatShoulder === 'function') poseMeerkatShoulder(_selfModel, player, dt);   // a meerkat on the shoulder (entities/meerkat.js)
    _selfModel.head.rotation.order = 'YXZ';                // the head's turn first, then its nod, as the look
    _selfModel.head.rotation.y = -climbTurn;
    if (climbW > 0.001) poseBodyClimb(_selfModel, cUp * (1 - lie), cSlide * (1 - lie), cHold * (1 - lie));
    if (player._benchW > 0.01) poseBodyWork(_selfModel, player._benchW * (1 - lie));   // working a bench or a mortar
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
