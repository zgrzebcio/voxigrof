'use strict';
/* entities/held-items.js: what a creature holds in its hand. Showing it on the arm, picking things up off the ground,
   dropping them, and the bow's pose. */

/* ---- what a mob is carrying, in its own hand ----
   Same idea as the player's third-person _selfHeld: the item's drop sprite parented to the right
   arm so it swings with the limb. `_brightMat` keeps a held BLOCK readable at night; item sprites
   carry their own materials. A second, hidden group holds the nocked arrow, which the bow-armed
   skeleton reveals while it draws. */
/* ONE hold pose for every humanoid. The player's own third-person hand, a zombie's fist
   and a skeleton's bow arm are the SAME rig hanging off the same armR, so an item has to sit in
   the same place, at the same size, whoever is carrying it — a zombie holding your sword must
   look exactly like you holding it. Both _syncSelfHeld and setMobHeld route through here, and
   nothing is allowed its own private numbers any more. */
function setHeldOnArm(grp, id) {
  while (grp.children.length) grp.remove(grp.children[0]);
  if (id == null) return;
  // a shield in a hand is its own model, hung off the outside of the forearm; blocking
  // re-poses it every frame (poseMainShield in 40-shield.js)
  if (id >= 256 && ITEM_PROPS[id]?.shield && typeof buildShieldNode === 'function') {
    const n = buildShieldNode(id); n.scale.setScalar(1.24);   // doubled in 0.757
    grp.add(n);
    grp.scale.setScalar(1);
    grp.position.set(-2.3 * PX, -7 * PX, 0);
    grp.rotation.set(0, -Math.PI / 2, 0);
    return;
  }
  const isItem  = id >= 256;
  const isBow   = isItem && !!ITEM_PROPS[id]?.ranged;
  const isTool  = isItem && (!!ITEM_PROPS[id]?.tool || isBow);
  const isCross = !isItem && PROPS[id]?.model === 'cross';
  // Sit the object at the fist and tip it FORWARD (out of the chest) so the pose reads as
  // actually gripping it, rather than having it grow out of the arm.
  /* Where it sits. A tool's handle corner is gripped at 1.5px and its blade runs forward
     out of the hand. Flat things (item sprites and plants) stand UP out of the fist: they used to
     lie along the arm, which with the arm raised to hold them put them flat on top of the fist. Their lower
     part now sits in the fist and the rest rises clear of it. A block sits in front of the fist. A torch is
     held three times the size of a plant so it reads at a distance, and fattened like the first-person one. */
  const isTorch = id < 256 && !!PROPS[id]?.torch;   // every torch
  const upright = isCross || (isItem && !isTool);
  grp.position.set(0, (upright ? -10.3 : -11.5) * PX, (isTool ? 1.5 : upright ? 2.0 : 4.4) * PX);
  grp.scale.setScalar(isTool ? 0.42 : isTorch ? 0.63 : isItem ? 0.42 * 0.70 : 0.42 * 0.50);
  if (isBow) _poseHeldBow(grp);                       // a bow has its own axes — see below
  /* A tool's blade points FORWARD out of the fist. It used to run back UP the arm (Rx -0.30,
     Ry PI), which buried most of the sprite inside the arm box: from the front, all that showed was a
     couple of dark pixels poking through the fist. Rx(1.835) swings the handle-to-tip diagonal (+Y after
     Rz) out ahead of the hand, so with the arm raised to hold it the blade points forward and up at about
     45 degrees; Ry(-PI/2) stands the sprite in a vertical plane that faces out to the side. */
  else if (isTool) grp.rotation.set(1.835, -Math.PI / 2, Math.PI / 4);
  /* Upright: Rx(1.05) cancels the holding arm's own 1.05 lift, so the item's up is the WORLD's up;
     Ry turns a sprite edge-on to the body so its face shows from the side, as a tool's does. */
  else if (upright) grp.rotation.set(1.05, isItem ? -Math.PI / 2 : 0.4, 0);
  else grp.rotation.set(-0.35, 0.4, 0);               // a block
  let target = grp;
  if (isTool && !isBow) {
    // a tool's handle is its sprite's lower-left corner: slide that corner onto the fist
    const g = new THREE.Group();
    g.position.set(0.42, 0.42, 0);
    grp.add(g);
    target = g;
  } else if (isTorch) {
    // the lower third of the stick in the fist, flame up, thickened like the first-person torch
    const g = new THREE.Group();
    g.position.y = 0.32;
    g.scale.set(HELD_TORCH_THICK, 1, HELD_TORCH_THICK);
    g.rotation.y = Math.PI / 4;
    grp.add(g);
    target = g;
  } else if (isCross) {
    const g = new THREE.Group();
    g.position.y = 0.35;
    grp.add(g);
    target = g;
  }
  for (const { p, geo, mat: mo, node } of buildDropGeom(id))
    target.add(node || new THREE.Mesh(geo, mo || _brightMat(p)));
}
function setMobHeld(e, id) {
  const m = e.model;
  if (!m || m._heldId === id) return;
  m._heldId = id;
  if (!m.heldGrp) { m.heldGrp = new THREE.Group(); m.armR.add(m.heldGrp); }
  setHeldOnArm(m.heldGrp, id);
}

/* ---- mobs pick things up ----
   A zombie that walks over a dropped item takes it, and if that item is something you would hit
   with, it hits with it: the weapon's own damage is ADDED to the mob's bare-handed damage, so
   the sword you died holding makes the thing that killed you worse. One item only — a mob with
   full hands walks past everything — and whatever it took falls back out when it dies, so your
   gear is always recoverable rather than deleted by a passing corpse.

   Deliberately the same reach and the same pickup grace a player gets, so you cannot lose a
   stack to a mob standing where it landed before you have had a chance to grab it yourself. */
const MOB_PICKUP_R = 1.5;
const MOB_PICKUP_CD = 0.6;               // seconds between looks; this is not a vacuum
function mobPickupDamage(id) {
  return (id != null && id >= 256) ? (ITEM_PROPS[id]?.damage || 0) : 0;
}
function _mobTryPickup(e, baseDmg) {
  if (e.heldItem != null) return;                       // already carrying something
  for (let i = DROPS.length - 1; i >= 0; i--) {
    const d = DROPS[i];
    if (d.age < d.pickupDelay) continue;                // same grace a player has to respect
    const p = d.group.position;
    const dx = p.x - e.x, dy = p.y - (e.y + ENT_H * 0.5), dz = p.z - e.z;
    if (dx * dx + dy * dy + dz * dz > MOB_PICKUP_R * MOB_PICKUP_R) continue;
    e.heldItem = d.id;
    e.heldDur = d.dur != null ? d.dur : null;
    e.heldMeta = d.meta || null;             // 0.79
    const bonus = mobPickupDamage(d.id);
    if (bonus > 0) e.dmg = baseDmg + bonus;
    setMobHeld(e, d.id);
    playSound('hit', { gain: 0.3, rate: 1.6, pos: { x: e.x, y: e.y + 1, z: e.z } });
    if ((d.count || 1) > 1) _dropSetCount(d, d.count - 1);   // one off a stack
    else removeDrop(i);
    return;
  }
}
// whatever a mob was carrying falls where it stood — on death, and on the dawn sweep too
function _mobDropHeld(e) {
  if (e.heldItem == null) return;
  spawnDrop(e.heldItem, Math.floor(e.x), Math.floor(e.y + 0.5), Math.floor(e.z),
    { x: (Math.random() - 0.5) * 2, y: 2.4, z: (Math.random() - 0.5) * 2 }, 0.6, e.heldDur ?? null, e.heldMeta || null);
  e.heldItem = null; e.heldDur = null; e.heldMeta = null;
}
/* A bow in a raised arm, oriented the way one is actually held. The tool rotation lays
   an item ALONG the arm, which is right for a sword and wrong for a bow: it left the skeleton's
   bow lying flat and back-to-front.

   When an arm is raised to aim (rotation.x = -90°) its local axes read: -Y is world forward
   (down the arm, where the shot goes), +Z is world up, ±X is sideways. A bow wants its limbs
   world-VERTICAL and its arc pointing forward with the string toward the archer, so the sprite's
   axes have to land as: chord -> +Z, bulge -> -Y. Rz(45°) first puts the icon's diagonal chord on
   +Y and its bulge on +X; the basis below is the rotation that carries those onto (0,0,1) and
   (0,-1,0). Same geometry as HELD_POSE.bow in player/hands.js, expressed in arm space. */
const _BOW_BASIS = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0),
                                new THREE.Vector3(0, 0, 1),
                                new THREE.Vector3(-1, 0, 0)));
const _BOW_ROLL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);
function _poseHeldBow(grp) {
  grp.quaternion.copy(_BOW_BASIS).multiply(_BOW_ROLL);    // roll first, then the basis
  grp.position.set(0, -12.5 * PX, 1.5 * PX);
}
/* The arrow a shooter has on the string. Parented to the BOW arm (armR, the one holding the
   weapon) and pointed down the arm, so it tracks the bow rather than the hand hauling the string. */
function setModelNock(m, id) {
  if (!m) return;
  if (!m.nockGrp) {
    m.nockGrp = new THREE.Group();
    m.nockGrp.visible = false;
    m.armR.add(m.nockGrp);
  }
  if (m._nockId !== id) {
    m._nockId = id;
    while (m.nockGrp.children.length) m.nockGrp.remove(m.nockGrp.children[0]);
    if (id != null) {
      const inner = new THREE.Group();
      inner.scale.setScalar(0.40);
      // the sprite's tip runs along its own (1,1,0) diagonal; swing that onto the arm's forward
      inner.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 0).normalize(),
                                          new THREE.Vector3(0, -1, 0));
      for (const { p, geo, mat: mo, node } of buildDropGeom(id))
        inner.add(node || new THREE.Mesh(geo, mo || _brightMat(p)));
      m.nockGrp.add(inner);
    }
  }
}
/* Show/hide the nocked round and slide it back with the draw. One call covers a mob and a
   player body alike — same rig, same arm, same motion. */
function poseModelNock(m, id, drawP) {
  if (!m) return;
  if (drawP <= 0 && !m.nockGrp) return;              // never built one, nothing to hide
  setModelNock(m, id);
  if (!m.nockGrp) return;
  m.nockGrp.visible = drawP > 0 && id != null;
  m.nockGrp.position.set(0, (-13.5 + 3.0 * drawP) * PX, 1.5 * PX);
}
