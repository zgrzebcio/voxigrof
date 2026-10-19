'use strict';
/* blocks/doors.js: doors. Their looks from their material's art, opening, locks and keys. */

/* voxiGrof — doors: 2-cell (1 wide × 2 high × 1/8 thick), right-click toggles open with a swinging animation, an
   open door is passable.

   Since 0.842 a door is a SHAPE of its material (blocks/blocks.js: SHAPE_DOOR / SHAPE_DOOR_R, picked on the hammer's
   Advanced page): planks of every wood, the iron, copper and tin blocks, adobe, glass, and their looks. The cell keeps
   the material's id; its variant is the door: high nibble the hinge side (SHAPE_DOOR left, SHAPE_DOOR_R right), low
   nibble bits 0-1 facing (0:+Z 1:-Z 2:+X 3:-X), 4 open, 8 the upper half. The old oak door block (B.DOOR, variant
   bit 16 = hinged right) is converted into an oak planks door wherever it is read (migrateLegacyVal, blocks/legacy.js).

   The mesher emits NOTHING for door cells — each door is one three.js mesh (a thin textured box) hinged at a corner,
   rotated smoothly between closed/open angles. Block cells still exist for collision + raycast; their boxes swap
   with the open bit so you can walk through. Inside this file a door's state is carried as the old variant layout
   (`dv`: bits 0-3 as above, 16 hinged right), which the swing tables below are written for.

   Locks and keys: a blank key used on an unlocked door locks it and is bound to it; the door then opens only
   for someone holding that key. Sneak + right-click with it unlocks the door and leaves the key blank again. A locked
   door can always be broken; its lock goes with it, so its key is blank again too. DOOR_LOCKS holds the lock codes,
   a key slot its code in `lock` (SLOT_META_KEYS, player/inventory.js). */

const DOORS = new Map();   // "x,y,z" of the BOTTOM cell -> {group, x, y, z, mat, ...}
const DOOR_T = 0.125;
// per-facing hinge placement. The open pose gets its own x/z offset (not just a rotation): a
// corner-hinged panel pokes out of the cell by DOOR_T when swung, so the open offset nudges it
// back flush against the side wall INSIDE the cell. Position + rotation both lerp during the swing.
// [closedX, closedZ, closedRotY, openX, openZ, openRotY]
const DOOR_ORI = [
  [0,       0,          0,            DOOR_T, 0,          -Math.PI / 2],  // facing +Z
  [0,       1 - DOOR_T, 0,            0,      1,           Math.PI / 2],  // facing -Z
  [DOOR_T,  0,          -Math.PI / 2, 0,      0,           0          ],  // facing +X
  [1,       0,          -Math.PI / 2, 1,      DOOR_T,     -Math.PI    ],  // facing -X
];
/* Right-hinged variants: the whole left-hinged door reflected across the cell centre — X for the
   +Z/-Z facings, Z for +X/-X. The panel geometry is rebuilt extending -X from the hinge, which is
   itself one reflection, so the rotation follows Mirror ∘ Rot(θ) = Rot(θ') ∘ Mirror:
     mirror in X -> θ' = -θ        mirror in Z -> θ' = π - θ
   Hinge points are the mirrored corners. Derived once and written out rather than computed, so
   the swing can be eyeballed per facing. */
const DOOR_ORI_R = [
  [1, 0,          0,            1 - DOOR_T, 0,          Math.PI / 2 ],  // facing +Z
  [1, 1 - DOOR_T, 0,            1,          1,         -Math.PI / 2 ],  // facing -Z
  [DOOR_T, 1,    -Math.PI / 2,  0,          1,          Math.PI     ],  // facing +X
  [1, 1,         -Math.PI / 2,  1,          1 - DOOR_T, 0           ],  // facing -X
];
const DOOR_HINGE_R = 16;                       // `dv` bit 4 (the old door's variant bit)
const doorOri = (dv) => (dv & DOOR_HINGE_R) ? DOOR_ORI_R[dv & 3] : DOOR_ORI[dv & 3];

/* a cell value as a door: is it one, its state in the old layout, and a door value from a material and a state. A door's
   MATERIAL is a value without the variant byte, id | look << 16 (matKey, blocks/looks.js): a dark glass door is glass, look 1. */
const isDoorAt = (v) => BLOCKS.isDoorVal(v);
const doorDv = (v) => { const va = (v >> 8) & 255; return (va & 15) | ((va & 0xF0) === BLOCKS.SHAPE_DOOR_R ? DOOR_HINGE_R : 0); };
const doorValOf = (mat, dv) => (mat | ((((dv & DOOR_HINGE_R) ? BLOCKS.SHAPE_DOOR_R : BLOCKS.SHAPE_DOOR) | (dv & 15)) << 8)) >>> 0;
const DOOR_WEAR = 6, DOOR_COST = 3;            // hammer wear and blocks a door takes in survival; breaking gives the blocks back
// what a broken door gives: its blocks, as the block it is a look of (a dark glass door: glass)
const doorDropOf = (v) => [{ id: v & 255, count: DOOR_COST }];

/* ---- looks ----
   The oak planks door keeps its own art (Oak_door.png). Every other material's door is drawn once from its block's
   own art: the block twice, one over the other, a frame round it in its own colour darkened, two sunk panels and a
   handle; a glass door's frame is solid and its panes stay see-through. Looks of a block (dark glass, adobe brick)
   use their base block's door for now: DOOR_VARIANT_LOOKS true gives each its own, from its own art. */
const DOOR_VARIANT_LOOKS = false;
const doorLookOf = (mat) => DOOR_VARIANT_LOOKS ? matKey(mat) : (mat & 255);
// the art name of a material's side face (MESH_TEXTURES in 03 loads these with the game art)
const doorArtName = (mat) => { const F = PROPS[mat & 255] ? facesOfVal(mat) : null; return ATLAS_TILES[F?.[4] ?? F?.[0]]; };
// never cached blank — see the note on chestTexture in blocks/chest.js
const _doorTex = new Map();                    // look id -> { tex, edge }
function _newDoorTex(img) {
  const t = new THREE.Texture(img || undefined);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
  if (img) t.needsUpdate = true;
  return t;
}
// a material's door picture: a canvas twice as tall as wide, or null while its art has not loaded
function _doorArt(mat) {
  const src = IMAGES[doorArtName(mat)];
  if (!src || !src.width) return null;
  const S = src.width, c = document.createElement('canvas');
  c.width = S; c.height = S * 2;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, S, S); g.drawImage(src, 0, S, S, S);
  const glass = PROPS[mat & 255].pass === 4, px = S / 16;           // one model pixel
  const im = g.getImageData(0, 0, S, S * 2), d = im.data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  const avg = n ? [r / n, gg / n, b / n] : [140, 140, 140];
  const frameW = Math.round(px * 2), panelIn = Math.round(px * 3.5);
  const inFrame = (x, y) => x < frameW || x >= S - frameW || y < frameW || y >= S * 2 - frameW
                          || (y >= S - px && y < S + px);                   // the rail across the middle
  const inPanel = (x, y) => x >= panelIn && x < S - panelIn && ((y >= panelIn && y < S - panelIn + px) || (y >= S + panelIn - px && y < S * 2 - panelIn));
  const edgeOfPanel = (x, y) => inPanel(x, y) && (!inPanel(x - px, y) || !inPanel(x + px, y) || !inPanel(x, y - px) || !inPanel(x, y + px));
  for (let y = 0; y < S * 2; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (inFrame(x, y)) {
        if (glass) { d[i] = avg[0] * 0.55; d[i + 1] = avg[1] * 0.55; d[i + 2] = avg[2] * 0.6; d[i + 3] = 255; }
        else { d[i] *= 0.68; d[i + 1] *= 0.68; d[i + 2] *= 0.68; }
      } else if (glass) d[i + 3] = Math.max(d[i + 3], 150);         // the pane: see-through, but kept (alphaTest 0.5)
      else if (edgeOfPanel(x, y)) { d[i] *= 0.6; d[i + 1] *= 0.6; d[i + 2] *= 0.6; }   // the panels sunk in
    }
  g.putImageData(im, 0, 0);
  // the handle, on the side away from the hinge, at hand height
  g.fillStyle = glass ? 'rgb(70,70,76)' : `rgb(${avg.map(v => (v * 0.3) | 0).join(',')})`;
  g.fillRect(S - frameW - px * 2.5, S + px * 1.5, px * 1.5, px * 3);
  return { img: c, edge: (Math.round(avg[0] * 0.6) << 16) | (Math.round(avg[1] * 0.6) << 8) | Math.round(avg[2] * 0.6) };
}
const DOOR_EDGE_RGB = 0x8a6b41;                // the oak door's edges
function doorTexture(mat = B.PLANKS) {
  const look = doorLookOf(mat);
  let e = _doorTex.get(look);
  if (!e) _doorTex.set(look, e = { tex: _newDoorTex(null), edge: DOOR_EDGE_RGB });
  if (!e.tex.image) {
    if (look === B.PLANKS) { if (IMAGES.oak_door) { e.tex.image = IMAGES.oak_door; e.tex.needsUpdate = true; } }
    else { const a = _doorArt(look); if (a) { e.tex.image = a.img; e.tex.needsUpdate = true; e.edge = a.edge; } }
  }
  return e;
}
// hinged panel geometry with the -Z face's U flipped so the back isn't mirrored
function doorPanelGeom(hinged = true, hingeRight = false) {
  const geo = new THREE.BoxGeometry(1, 2, DOOR_T);
  // hinge corner at the local origin; a right-hinged panel extends -X from it instead of +X
  if (hinged) geo.translate(hingeRight ? -0.5 : 0.5, 1, DOOR_T / 2);
  const uv = geo.attributes.uv;                        // face order +X,-X,+Y,-Y,+Z,-Z (4 verts each)
  for (let i = 20; i < 24; i++) uv.setX(i, 1 - uv.getX(i));
  // A right-hinged door is the mirror image of a left-hinged one, so its artwork mirrors too —
  // otherwise both halves of a double door show their handle on the same side. Flipping U on
  // BOTH textured faces keeps front and back consistent with each other.
  if (hingeRight) for (let i = 16; i < 24; i++) uv.setX(i, 1 - uv.getX(i));
  uv.needsUpdate = true;
  return geo;
}
function doorMaterials(mat) {                          // fresh per door — tinted by world light
  const t = doorTexture(mat);
  const face = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.edge).convertSRGBToLinear() });
  return { mats: [edge, edge, edge, edge, face, face], face, edge, edgeRGB: t.edge };
}

// a door's mesh, from its bottom cell's value (it took facing, open and hinge before)
function registerDoor(x, y, z, val) {
  const k = x + ',' + y + ',' + z;
  if (DOORS.has(k) || !isDoorAt(val)) return;
  const dv = doorDv(val), mat = matKey(val), open = !!(dv & 4), hingeRight = !!(dv & DOOR_HINGE_R);
  const m = doorMaterials(mat);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(doorPanelGeom(true, hingeRight), m.mats));
  const o = doorOri(dv);
  group.position.set(x + (open ? o[3] : o[0]), y, z + (open ? o[4] : o[1]));
  group.rotation.y = open ? o[5] : o[2];
  scene.add(group);
  DOORS.set(k, { group, x, y, z, mat, face: m.face, edge: m.edge, edgeRGB: m.edgeRGB, lastB: -1 });
}
function removeDoorMesh(k) {
  const d = DOORS.get(k);
  if (d) {
    scene.remove(d.group);
    d.group.children[0].geometry.dispose();
    d.face.dispose(); d.edge.dispose();
    DOORS.delete(k);
  }
}
function clearDoors() { for (const k of [...DOORS.keys()]) removeDoorMesh(k); }

// one half was broken / replaced: remove the mesh, the other half and its lock (guarded, no recursion loop)
function doorBroken(x, y, z, oldVal) {
  const upper = ((oldVal >> 8) & 8) !== 0, by = upper ? y - 1 : y;
  removeDoorMesh(x + ',' + by + ',' + z);
  DOOR_LOCKS.delete(x + ',' + by + ',' + z);           // its key is blank again
  const oy = upper ? y - 1 : y + 1;
  if (isDoorAt(getBlock(x, oy, z))) setBlock(x, oy, z, B.AIR);
}

/* Double door: the bottom cell of a same-facing door beside this one, across the facing, whose
   hinge is on the OPPOSITE side. The opposite-hinge test is what makes it a real double — two
   doors hinged the same way are two independent doors that happen to be adjacent, and swinging
   them together would send one straight through the other. Any two materials pair. */
function doorPartnerCell(x, by, z, facing, hinge) {
  const dirs = (facing === 0 || facing === 1) ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  for (const [dx, dz] of dirs) {
    const nv = getBlock(x + dx, by, z + dz);
    if (!isDoorAt(nv)) continue;
    const ndv = doorDv(nv);
    if ((ndv & 3) !== facing || (ndv & 8)) continue;              // same facing, bottom half only
    if ((ndv & DOOR_HINGE_R) === hinge) continue;                 // same hinge: not a pair
    return { x: x + dx, z: z + dz, hinge: ndv & DOOR_HINGE_R, mat: matKey(nv) };
  }
  return null;
}

/* Which side the hinge lands on for a door placed at (px,pz) facing `facing`, given the exact
   point on the block that was clicked. Clicking the left half hinges left (opens left-to-right),
   the right half hinges right. "Left" is from the player's view, i.e. relative to the facing —
   hence the per-facing axis and sign. */
function doorHingeFromHit(facing, fx, fz) {
  if (facing === 0) return fx > 0.5;      // door faces +Z, player's right is +X
  if (facing === 1) return fx < 0.5;      // faces -Z, right is -X
  if (facing === 2) return fz < 0.5;      // faces +X, right is -Z
  return fz > 0.5;                        // faces -X, right is +Z
}

// right-click either half: flip the open bit on both halves (facing bits preserved), and on the
// neighbouring door if this is a double — unless that one is locked by another key.
// One sound for the whole action, however many panels move.
function toggleDoor(x, y, z) {
  const val = getBlock(x, y, z);
  if (!isDoorAt(val)) return;
  const by = ((val >> 8) & 8) ? y - 1 : y;
  const bval = getBlock(x, by, z);
  if (!isDoorAt(bval)) return;
  const bdv = doorDv(bval), mat = matKey(bval);
  const facing = bdv & 3;
  const hinge = bdv & DOOR_HINGE_R;
  const opening = !(bdv & 4);
  const openBit = opening ? 4 : 0;
  const nv = facing | hinge | openBit;
  setBlock(x, by, z, doorValOf(mat, nv));
  const tv = getBlock(x, by + 1, z);
  setBlock(x, by + 1, z, doorValOf(isDoorAt(tv) ? matKey(tv) : mat, nv | 8));
  const p = doorPartnerCell(x, by, z, facing, hinge);
  const myLock = DOOR_LOCKS.get(x + ',' + by + ',' + z), pLock = p ? DOOR_LOCKS.get(p.x + ',' + by + ',' + p.z) : undefined;
  if (p && (pLock == null || pLock === myLock)) {
    const pv = facing | p.hinge | openBit;      // partner keeps its own (opposite) hinge
    setBlock(p.x, by, p.z, doorValOf(p.mat, pv));
    const ptv = getBlock(p.x, by + 1, p.z);
    setBlock(p.x, by + 1, p.z, doorValOf(isDoorAt(ptv) ? matKey(ptv) : p.mat, pv | 8));
  }
  playSound(opening ? 'doorOpen' : 'doorClose',
            { gain: 0.8, pos: { x: x + 0.5, y: by + 1, z: z + 0.5 } });
}

/* ---- locks and keys ---- */
const DOOR_LOCKS = new Map();                  // "x,y,z" of a door's bottom cell -> its lock code; a locked chest's cells too (blocks/chest.js)
const isKeyItem = (id) => id != null && id >= 256 && !!ITEM_PROPS[id]?.key;
// the code a key slot is bound to, while a door still has that lock; null when the key is blank (or its door is gone)
function keyBoundCode(s) {
  if (!s || s.lock == null) return null;
  for (const c of DOOR_LOCKS.values()) if (c === s.lock) return c;
  return null;
}
// where a bound key's door is, for its tooltip
function keyDoorPos(code) {
  for (const [k, c] of DOOR_LOCKS) if (c === code) return k.split(',').map(Number);
  return null;
}
const _newLockCode = () => {
  let c;
  do c = 1 + Math.floor(Math.random() * 0x3fffffff); while ([...DOOR_LOCKS.values()].includes(c));
  return c;
};
/* Right-click on a door. A blank key locks an unlocked door; its own key opens it, and with sneak unlocks it; any
   other hand opens an unlocked door. Creative opens any door. */
function useDoor(x, y, z) {
  const val = getBlock(x, y, z);
  if (!isDoorAt(val)) return;
  const by = ((val >> 8) & 8) ? y - 1 : y, k = x + ',' + by + ',' + z;
  const lock = DOOR_LOCKS.get(k), held = HOTBAR[hotbarSel];
  const bound = isKeyItem(held?.id) ? keyBoundCode(held) : null;
  const say = (fn, msg) => { if (typeof fn === 'function') fn(msg); };
  if (isKeyItem(held?.id)) {
    if (lock == null && bound == null) {                     // a blank key locks it
      const code = _newLockCode();
      DOOR_LOCKS.set(k, code);
      held.lock = code;
      saveHotbar(); buildHotbar();
      playSound('doorClose', { gain: 0.5, pos: { x: x + 0.5, y: by + 1, z: z + 0.5 } });
      say(typeof feedInfo === 'function' ? feedInfo : feedWarn, `Door locked: only this ${ITEM_PROPS[held.id].name.toLowerCase()} opens it now`);
      return;
    }
    if (lock != null && bound === lock) {
      if (player.sneaking) {                                // its own key, sneaking: unlocked, the key blank again
        DOOR_LOCKS.delete(k);
        delete held.lock;
        saveHotbar(); buildHotbar();
        say(typeof feedInfo === 'function' ? feedInfo : feedWarn, 'Door unlocked: the key is blank again');
        return;
      }
      toggleDoor(x, y, z);
      return;
    }
  }
  if (lock != null && !player.canFly) {
    say(feedWarn, held && isKeyItem(held.id) ? 'Locked: this is not its key' : 'Locked: hold its key to open it');
    playSound('doorClose', { gain: 0.3, pos: { x: x + 0.5, y: by + 1, z: z + 0.5 } });
    return;
  }
  toggleDoor(x, y, z);
}
// saved with the world: [[key, code], ...]
const serializeDoorLocks = () => [...DOOR_LOCKS];
function restoreDoorLocks(list) {
  DOOR_LOCKS.clear();
  if (Array.isArray(list)) for (const e of list)
    if (Array.isArray(e) && typeof e[0] === 'string' && Number.isInteger(e[1])) DOOR_LOCKS.set(e[0], e[1]);
}

// per-frame: swing each door toward its block state's angle; hide while the chunk is unloaded
function updateDoors(dt) {
  for (const [k, d] of DOORS) {
    const c = getChunk(Math.floor(d.x / 16), Math.floor(d.z / 16));
    if (!c || !c.data) { d.group.visible = false; continue; }
    const val = getBlock(d.x, d.y, d.z);
    if (!isDoorAt(val)) { removeDoorMesh(k); continue; }
    // a look whose art had not loaded yet when the door was made
    if (!d.face.map.image) { const t = doorTexture(d.mat); if (t.tex.image) { d.edgeRGB = t.edge; d.lastB = -1; } }
    d.group.visible = true;
    const dv = doorDv(val);
    const o = doorOri(dv);
    const open = (dv & 4);
    const target = open ? o[5] : o[2];
    const diff = target - d.group.rotation.y;
    if (Math.abs(diff) > 0.002) {
      const step = Math.max(-9 * dt, Math.min(9 * dt, diff));
      d.group.rotation.y += step;
    } else d.group.rotation.y = target;
    // slide the small flush-correction offset in lockstep with the swing, so the panel ends up
    // flat against the wall inside its cell instead of poking out by the thickness
    const tpx = d.x + (open ? o[3] : o[0]), tpz = d.z + (open ? o[4] : o[1]);
    const lerp = Math.min(1, 12 * dt);
    d.group.position.x += (tpx - d.group.position.x) * lerp;
    d.group.position.z += (tpz - d.group.position.z) * lerp;
    // tint by world light at the door cell (same curves as the chunk shader, approximated)
    const bl = getLightWorld(d.x, d.y, d.z) / 15;
    const sky = getSkyWorld(d.x, d.y, d.z) / 15;
    const skyF = SKY_FLOOR + (1 - SKY_FLOOR) * sky * sky;   // must track the chunk shader in 04-materials.js (SKY_FLOOR 0.8442)
    const sun = sharedUniforms.uAmbient.value + sharedUniforms.uDirect.value;
    const b = Math.min(1, skyF * sun * 0.92 + (bl * 0.45 + bl * bl * 0.85));
    if (Math.abs(b - d.lastB) > 0.02) {
      d.lastB = b;
      d.face.color.setScalar(b).convertSRGBToLinear();
      d.edge.color.set(d.edgeRGB ?? DOOR_EDGE_RGB).multiplyScalar(b).convertSRGBToLinear();
    }
  }
}
