'use strict';
/* voxiGrof — first-person right-hand renderer */

/* Separate scene so the hand always renders on top of world geometry without
   z-fighting or fog. After the main pass: clearDepth, then render this. */

const handScene = new THREE.Scene();
const handCam   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.02, 8);
window.addEventListener('resize', () => {
  handCam.aspect = window.innerWidth / window.innerHeight;
  handCam.updateProjectionMatrix();
});

/* ─── arm materials ───
   convertSRGBToLinear: ColorManagement disabled but renderer sRGB-encodes output,
   so raw hex colors render ~53% brighter without the correction. */
const _skinBase  = new THREE.Color(0xf0c080).convertSRGBToLinear();
const _skinGlow  = new THREE.Color(0xfde8b8).convertSRGBToLinear();  // warm brightened for held-light tint
const _sleeveCol = new THREE.Color(0x4a6ecc).convertSRGBToLinear();
/* Geometry is shared; MATERIALS are not. Each split-screen player owns a whole arm rig, because
   the pose is integrated frame to frame (lerped, bobbed, swung) rather than recomputed from
   scratch — four players sharing one arm would each drag it toward their own target. The skin
   material is per-rig too, since the held-light glow tint is per player. */
const _armForeGeo  = new THREE.BoxGeometry(0.24, 0.24, 0.96);
/* sleeve is long and pushed far back so its end goes off-screen, never clips into view */
const _armUpperGeo = new THREE.BoxGeometry(0.27, 0.27, 0.72);

/* ─── held-item container ─── */
/* Pose is re-applied per item in _rebuildHeld: blocks/generic items keep the old loose grip,
   while tools and weapons get a dedicated "held by the handle" pose (see HELD_POSE). */

/* Tool/weapon grip.
   Item sprites are built as an upright quad in the XY plane with the icon's handle in the
   LOWER-LEFT corner and the head in the upper-right, so the shaft runs along the (1,1,0)
   diagonal. Euler order is XYZ, i.e. Z is applied first:
     Rz(+45°)  swings that diagonal onto +Y, so the tool now stands straight up
     Ry(-0.80) yaws it to the right (negative Y swings the tip toward +X)
     Rx(-70°)  tips the top away from the camera, pointing it forward into the scene
   The inner group then slides the sprite so its lower-left (the handle) sits on the pivot,
   which is what makes the fist grab the handle instead of the middle of the blade.
   0.7521: pulled back into the fist (z -0.30 -> -0.12) and yawed a little more to the right
   (-0.55 -> -0.80), so the tool reads as held rather than thrust out ahead of the hand. A step
   of only 0.10 back was barely visible side by side; this one is clear and still clean. */
const HELD_POSE = {
  tool:  { pos: [0.10, -0.01, -0.12], scale: 0.95, rot: [-70 * Math.PI / 180, -0.80, Math.PI / 4], grip: 0.42 },
  block: { pos: [0.02, 0.12, -0.44],  scale: 0.60, rot: [-0.15, -0.52, 0.30],        grip: 0 },
  /* A bow is NOT gripped like a tool (0.7351). A tool's handle is the sprite's lower-left corner,
     so the fist takes that corner — do the same to a bow and the hand ends up clamped around the
     lower nock with the whole weapon hanging off it. A bow is held at its MIDDLE, so grip is 0
     and the sprite's centre sits on the fist.

     Euler order is XYZ, so Z is applied first:
       Rz(+45°)  stands the string up: the icon's chord runs along its (1,1) diagonal, and this
                 swings that onto +Y. The arc then bulges along the sprite's local +X.
       Ry(+1.0)  turns that bulge AWAY from the eye — (1,0,0) becomes (0.54, 0, -0.84) — which
                 leaves the STRING SIDE facing the player (0.7352). It used to be a NEGATIVE yaw,
                 which tipped the arc toward the camera and showed the bow back-to-front. Not a
                 full 90°: the sprite is only 1/16 thick, so edge-on it would be a hairline —
                 ~57° keeps half the width visible while still reading as "seen from behind".
       Rx(-0.12) a slight tip of the top away, so it does not look pasted onto the screen. */
  bow:   { pos: [-0.06, 0.07, -0.56], scale: 0.98, rot: [-0.12, 1.0, Math.PI / 4], grip: 0 },
  /* A shield in the RIGHT hand (0.7451): held by its middle, turned edge-on to the view with its
     front facing away (the half turn about Y), mirroring the offhand's rest pose. Raising it
     squares it up — see the main-hand shield block in updateHands. */
  shield: { pos: [0.02, 0.05, -0.30], scale: 2.5, rot: [-0.15, Math.PI + 0.6, -0.06], grip: 0 },
};

/* rest position: lower-right of screen, arm angled inward
   Large H_RX tips the arm up so its LENGTH is visible on screen (not just the end-face).
   H_RY angles it toward screen center. At rest the sleeve goes off bottom-right. */
const _shE = new THREE.Euler(), _shQ = new THREE.Quaternion(), _pivInv = new THREE.Quaternion();   // main-hand shield pose scratch (0.757)
const H_X  =  0.82, H_Y  = -1.04, H_Z  = -2.10;
const H_RX =  0.92, H_RY =  0.48;

/* ─── one whole arm rig per player ─── */
const HAND_RIGS = [];
function buildHandRig() {
  const matSkin   = new THREE.MeshBasicMaterial({ color: _skinBase.clone() });
  const matSleeve = new THREE.MeshBasicMaterial({ color: _sleeveCol.clone() });
  const fore  = new THREE.Mesh(_armForeGeo, matSkin);    fore.position.z  = 0.06;
  const upper = new THREE.Mesh(_armUpperGeo, matSleeve); upper.position.z = 0.84;
  const held = new THREE.Group();
  held.position.set(0.02, 0.12, -0.44);   // connected to hand tip
  held.scale.setScalar(0.60);              // larger item in hand
  held.rotation.set(-0.15, -0.52, 0.30);  // -0.52 rad ≈ 30° left rotation
  /* The round on the string. It hangs off the ARM pivot rather than off the held group, because
     it has to slide back past the bow as the draw fills instead of being carried by it. Empty
     and hidden until something ranged is actually drawn (see updateHands). */
  const nock = new THREE.Group();
  nock.visible = false;
  nock.scale.setScalar(0.55);
  // the item sprite's tip runs along its own (1,1,0) diagonal; swing that onto the view axis
  nock.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 0).normalize(),
                                     new THREE.Vector3(0, 0, -1));
  const pivot = new THREE.Group();
  pivot.add(fore, upper, held, nock);
  pivot.rotation.set(H_RX, H_RY, 0);
  // screen-space root — starts at rest position to avoid near-clip pop on frame 1
  const root = new THREE.Group();
  root.add(pivot);
  root.position.set(H_X, H_Y, H_Z);
  handScene.add(root);
  /* Offhand arm (0.745): a mirror of this one on the LEFT. A SIBLING in the hand scene rather than
     a child of `root` — the right arm's root is bobbed and swung every frame, and the shield must
     not ride that. Hidden unless a shield is equipped; 40-shield.js poses it. Hung off
     root.userData so it travels with the rig when split screen swaps seats — no new globals. */
  const offFore  = new THREE.Mesh(_armForeGeo, matSkin);    offFore.position.z  = 0.06;
  const offUpper = new THREE.Mesh(_armUpperGeo, matSleeve); offUpper.position.z = 0.84;
  const offPivot = new THREE.Group();
  offPivot.add(offFore, offUpper);
  offPivot.rotation.set(H_RX, -H_RY, 0);
  const offHeld = new THREE.Group();
  const offRoot = new THREE.Group();
  offRoot.add(offPivot, offHeld);
  offRoot.position.set(-H_X, H_Y, H_Z);
  offRoot.visible = false;
  handScene.add(offRoot);
  root.userData.off = { root: offRoot, pivot: offPivot, held: offHeld, heldId: undefined };
  const rig = { root, pivot, held, nock, matSkin };
  HAND_RIGS.push(rig);
  return rig;
}
// player one's rig IS the default binding; 36-splitscreen.js swaps these per viewport
var _hand0    = buildHandRig();
var handRoot  = _hand0.root;
var armPivot  = _hand0.pivot;
var heldGroup = _hand0.held;
var nockGroup = _hand0.nock;
var _matSkin  = _hand0.matSkin;
var _nockId   = undefined;

/* ─── state ─── */
var _armGlow   = 0;   // animated 0-1 glow factor for arm skin tint
var _bobT      = 0;
var _swimT     = 0;
var _eatBobT   = 0;
var _inactive  = 0;   // seconds without any input
var _swingT    = -1;  // -1 = idle; 0..1 = swing progress
var _prevMining = false;
var _prevBreak  = false;
var _prevPlace  = false;
var _prevYaw   = 0, _prevPitch = 0;
var _heldId    = undefined;  // undefined forces first build
var _heldVar   = 0;          // variant it is drawn in: a chisel shape (0.783)

function _rebuildHeld(id, variant = 0) {
  _heldId = id;
  _heldVar = variant;
  while (heldGroup.children.length) heldGroup.remove(heldGroup.children[0]);
  if (id === null) return;
  const passes = buildDropGeom(id, variant);
  const isCross = id < 256 && PROPS[id]?.model === 'cross';
  // anything with a tool type (pick/shovel/hatchet/hoe/sword) is gripped by its handle
  const isTool = id >= 256 && !!ITEM_PROPS[id]?.tool;
  const isBow  = id >= 256 && !!ITEM_PROPS[id]?.ranged;
  const isShield = id >= 256 && !!ITEM_PROPS[id]?.shield;
  const pose = isShield ? HELD_POSE.shield : isBow ? HELD_POSE.bow : isTool ? HELD_POSE.tool : HELD_POSE.block;
  heldGroup.position.set(...pose.pos);
  heldGroup.scale.setScalar(pose.scale);
  heldGroup.rotation.set(...pose.rot);
  let target = heldGroup;
  if (pose.grip) {
    // shift the sprite diagonally so its lower-left handle corner lands on the pivot
    const g = new THREE.Group();
    g.position.set(pose.grip, pose.grip, 0);
    heldGroup.add(g);
    target = g;
  } else if (isCross) {
    const g = new THREE.Group();
    g.position.y = 0.35;
    heldGroup.add(g);
    target = g;
  }
  // a shield is its own model: the extruded front plus the held-side picture (40-shield.js)
  if (isShield && typeof buildShieldNode === 'function') { target.add(buildShieldNode(id)); return; }
  if (id === B.TORCH) { wrapHeldTorch(target, passes); return; }
  for (const { p, geo, mat: mo, node } of passes)
    target.add(node || new THREE.Mesh(geo, mo || MATERIALS[p]));
}
/* A TORCH in a first-person hand (0.7523), main hand and offhand alike. The block model is a true
   2px stick, and held that close it is a sliver so thin that only one face ever shows: it read as a
   flat plank. In the hand it is fattened ACROSS (never taller, so the flame stays the same height) and
   turned 45 degrees about its own axis, so two differently shaded sides show and it reads as a stick. */
const HELD_TORCH_THICK = 1.35;                 // 0.7531: 2.2, turned 45 degrees, read as a square
function wrapHeldTorch(parent, passes) {
  const g = new THREE.Group();
  g.scale.set(HELD_TORCH_THICK, 1, HELD_TORCH_THICK);
  g.rotation.y = Math.PI / 4;
  for (const { p, geo, mat: mo, node } of passes)
    g.add(node || new THREE.Mesh(geo, mo || MATERIALS[p]));
  parent.add(g);
  return g;
}

/* Swap the sprite on the string for whatever ammunition is nocked right now — the current
   arrow, and tomorrow the current bolt or shell. Rebuilt only when the id changes. */
function _rebuildNock(id) {
  _nockId = id;
  while (nockGroup.children.length) nockGroup.remove(nockGroup.children[0]);
  if (id == null) return;
  for (const { p, geo, mat: mo, node } of buildDropGeom(id))
    nockGroup.add(node || new THREE.Mesh(geo, mo || MATERIALS[p]));
}

function updateHands(dt, wantBreak, wantPlace, eatProg, drawProg = 0) {
  if (!playing || menuScene || invOpen) {
    if (nockGroup) nockGroup.visible = false;
    handRoot.visible = true;
    const k = 1 - Math.exp(-dt * 24);
    handRoot.position.y += (-2.4 - handRoot.position.y) * k;
    return;
  }

  /* sync held item */
  const slot  = HOTBAR[hotbarSel];
  const curId = slot ? slot.id : null;
  // a block the chisel would shape is held in that shape (0.783)
  const curVar = curId != null && typeof chiselHeldVariant === 'function' ? chiselHeldVariant(curId) : 0;
  if (curId !== _heldId || curVar !== _heldVar) _rebuildHeld(curId, curVar);
  const hasItem = curId !== null;
  const heldIsFood = curId !== null && ITEM_PROPS[curId]?.food > 0;

  /* inactivity — right hand always shown when holding something */
  const moving = !!player._movingH;
  const looked = Math.abs(player.yaw - _prevYaw) + Math.abs(player.pitch - _prevPitch) > 0.0005;
  const acting = wantBreak || (mousePlace && pointerLocked) || act.padBreak || act.padPlace;
  _prevYaw = player.yaw; _prevPitch = player.pitch;
  if (moving || looked || acting) _inactive = 0; else _inactive += dt;
  const inactive = !hasItem && _inactive > 0.8;
  handRoot.visible = true;

  /* swing triggers */
  const miningNow = !player.canFly && mining.active;
  if (miningNow && !_prevMining)                                  _swingT = 0;  // new block targeted
  if (player.canFly && wantBreak && _swingT < 0)                 _swingT = 0;  // creative break
  if (!player.canFly && wantBreak && !_prevBreak && _swingT < 0) _swingT = 0;  // survival: swing even in air
  if (handPlaceSwing && _swingT < 0 && !heldIsFood)              _swingT = 0;  // successful place only
  // bush pickup: you grab with your hand whatever you happen to be holding, so unlike a place
  // this one is NOT gated on food — mid-meal harvesting still animates.
  if (handPickSwing && _swingT < 0)                              _swingT = 0;
  handPlaceSwing = false;
  handPickSwing = false;
  _prevMining = miningNow;
  _prevBreak  = wantBreak;
  _prevPlace  = wantPlace;
  if (_swingT >= 0 && !miningNow) {                   // free-timer swing (creative / place / air)
    _swingT += dt / 0.28;
    if (_swingT >= 1) _swingT = -1;
  }

  /* target transform */
  let tx = H_X, ty = H_Y, tz = H_Z;
  let trx = H_RX, try_ = H_RY;

  if (inactive) ty = -2.4;                            // slide below screen

  if (player._inWater && !player.flying && moving) {  // swim stroke: circular paddle motion
    _swimT += dt;
    const f = player.fast ? 7.0 : 4.5;
    const a = player.fast ? 1.3 : 1.0;
    tx  += Math.cos(_swimT * f) * 0.09 * a;
    ty  += Math.sin(_swimT * f) * 0.11 * a;
    trx += Math.sin(_swimT * f) * 0.45 * a - 0.30;    // arm sweeps forward-down like a stroke
    _bobT = 0;
  } else if (moving && !player.flying) {              // walk / sprint bob
    const freq = player.fast ? 11.0 : 7.5;
    const amp  = player.fast ? 0.055 : 0.030;
    _bobT += dt;
    ty  += Math.sin(_bobT * freq) * amp;
    tx  += Math.sin(_bobT * freq * 0.5) * amp * 0.5;
    trx += Math.sin(_bobT * freq) * 0.05;
    _swimT = 0;
  } else { _bobT = 0; _swimT = 0; }

  if (!player.flying && player.vy > 1.5)             // jump: hand lifts
    ty += 0.06 * Math.min(1, (player.vy - 1.5) / 7);

  /* swing: forward-back arc — fixed visual period regardless of block hardness */
  const SWING_PERIOD = 0.32;
  const swingProg = miningNow
    ? (mining.elapsed % SWING_PERIOD) / SWING_PERIOD
    : Math.max(0, _swingT);
  if (miningNow || _swingT >= 0) {
    const s = Math.sin(swingProg * Math.PI);
    trx += s * -0.82;
    ty  += s *  0.06;
    tx  += s * -0.04;
  }

  /* eat animation: arm lifts toward face while holding food + place */
  if (eatProg > 0) {
    const ramp = Math.min(1, eatProg * 5);    // reaches full raise in first 20% of eat time
    _eatBobT += dt;
    trx += ramp * 1.0 + Math.sin(_eatBobT * 14) * 0.05 * ramp;  // lift + nibble bob
    ty  += ramp * 0.30;
    tx  += ramp * -0.15;
  } else {
    _eatBobT = 0;
  }

  /* bow draw (0.735): the bow comes up into the middle of the view and steadies there, while the
     nocked round slides back past it toward the eye. The arrow shown is the one that will fly —
     rangedNocked() reports the ammo the shot has actually reserved. */
  if (drawProg > 0) {
    const r = Math.min(1, drawProg * 4);              // up fast, then only the string moves
    tx  += -0.34 * r;
    ty  +=  0.36 * r + 0.04 * drawProg;
    tz  +=  0.34 * r;
    trx += -0.62 * r - 0.12 * drawProg;
    try_ += -0.34 * r;
    // hauling back turns the bow a little further face-on, the way a real draw squares it up
    heldGroup.rotation.y = HELD_POSE.bow.rot[1] - 0.22 * drawProg;
    const ammoId = typeof rangedNocked === 'function' ? rangedNocked() : null;
    if (ammoId !== _nockId) _rebuildNock(ammoId);
    nockGroup.visible = ammoId != null;
    // on the string, in line with the bow's middle, hauled back toward the eye as the draw fills
    nockGroup.position.set(-0.06, 0.07, -0.99 + 0.55 * drawProg);
  } else {
    if (nockGroup.visible) nockGroup.visible = false;
    // released: the bow settles back to the resting yaw the draw was leaning off
    if (curId !== null && ITEM_PROPS[curId]?.ranged) heldGroup.rotation.y = HELD_POSE.bow.rot[1];
  }

  /* main-hand shield (0.7451, mirrored 0.757): the right arm takes the offhand arm's own rest and raise
     pose, mirrored across the middle of the view, so the two hands hold a shield the same way */
  const mainShieldUp = player._shieldHand === 'main' ? (player._shieldUp || 0) : 0;
  const mainShield = curId !== null && !!ITEM_PROPS[curId]?.shield && typeof OFF_REST !== 'undefined';
  if (mainShield) {
    const u = mainShieldUp, L = (a, b) => a + (b - a) * u;
    tx = -L(OFF_REST.pos[0], OFF_RAISE.pos[0]); ty = L(OFF_REST.pos[1], OFF_RAISE.pos[1]); tz = L(OFF_REST.pos[2], OFF_RAISE.pos[2]);
    trx = L(OFF_REST.arm[0], OFF_RAISE.arm[0]); try_ = -L(OFF_REST.arm[1], OFF_RAISE.arm[1]);
    if (player._shieldHitT > 0 && player._shieldHand === 'main') tz += player._shieldHitT / 0.18 * 0.12;
  }

  /* arm skin brightens when holding a light block — instant visual feedback, no chunk lag */
  const targetGlow = (typeof _hlRaw !== 'undefined' && _hlRaw > 0) ? _hlRaw / 14 : 0;
  _armGlow += (targetGlow - _armGlow) * (1 - Math.exp(-dt * 10));
  if (_armGlow > 0.005) _matSkin.color.lerpColors(_skinBase, _skinGlow, _armGlow);
  else _matSkin.color.copy(_skinBase);

  /* lerp toward target */
  const k = 1 - Math.exp(-dt * 18);
  handRoot.position.x += (tx   - handRoot.position.x) * k;
  handRoot.position.y += (ty   - handRoot.position.y) * k;
  handRoot.position.z += (tz   - handRoot.position.z) * k;
  armPivot.rotation.x += (trx  - armPivot.rotation.x) * k;
  armPivot.rotation.y += (try_ - armPivot.rotation.y) * k;
  /* The main-hand shield is posed OUTSIDE the arm's tilt (0.757). The held group hangs inside the arm pivot,
     which is tipped 0.92 rad to show the arm's length, so a shield posed in that frame leaned with the
     forearm and turned nearly edge-on: held "the other way". The offhand's shield is not parented to its
     pivot, which is why it always looked right. So the pivot's current rotation is cancelled here, and the
     shield takes the offhand's rest and raise pose, mirrored (x flips, and so do the Y and Z turns). */
  if (mainShield) {
    const u = mainShieldUp, L = (a, b) => a + (b - a) * u;
    _shE.set(L(OFF_REST.rot[0], OFF_RAISE.rot[0]), -L(OFF_REST.rot[1], OFF_RAISE.rot[1]), -L(OFF_REST.rot[2], OFF_RAISE.rot[2]));
    _pivInv.setFromEuler(armPivot.rotation).invert();
    heldGroup.quaternion.copy(_pivInv).multiply(_shQ.setFromEuler(_shE));
    heldGroup.position.set(-L(OFF_REST.sh[0], OFF_RAISE.sh[0]), L(OFF_REST.sh[1], OFF_RAISE.sh[1]),
                           L(OFF_REST.sh[2], OFF_RAISE.sh[2])).applyQuaternion(_pivInv);
  }
}
