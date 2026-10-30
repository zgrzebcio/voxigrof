'use strict';
/* player/armor-model.js: armor you can see. The textures of each piece, the pieces on a body model (the inventory's
   preview and players in the world), the cloth cap's cut. */

/* ---------------------------------- preview ---------------------------------- */
/* A small offscreen three.js render of the player wearing whatever is equipped. Armor is drawn
   as slightly-inflated copies of the body parts, each with its material's picture for that part
   (EQUIP_TEXTURES in 01, <mat>_<part>, 0.82) laid over every face of the box. Materials without
   pictures (gold, diamond for now) simply show no overlay. */
const PREVIEW_W = 150, PREVIEW_H = 266;   // matches #equipPreview in style.css
let _pvRenderer = null, _pvScene = null, _pvCam = null, _pvModel = null, _pvArmor = null;
const _pvTexCache = {};

function _armorTex(name) {
  if (_pvTexCache[name]) return _pvTexCache[name];
  const img = IMAGES[name];
  if (!img) return null;                           // not loaded yet (or none): asked again next time
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
  t.needsUpdate = true;
  _pvTexCache[name] = t;
  return t;
}
// one inflated overlay piece; `grow` pushes it just outside the skin so it never z-fights.
// The box's own UVs put the whole part picture on each face.
/* `cap` (per face 0.8446, the cloth bandana): a piece that is a cap, not a helmet. Each face it names is
   [keep, vTop, vBottom]: how much of the face is kept, from its top down, and the rows of the picture it shows (v 1 is
   the picture's top edge, 0 its bottom); null drops the face; a face not named wears the whole picture as before. A
   box's faces come in the order +x -x +y -y +z -z, four corners each, the two top ones first; the model's front is +z.
   The bandana's picture is cloth on top, a band under it and the knot's tails hanging at the bottom right, so:
     top     all of it, in the cloth rows only (the whole picture left a hole where its lower part is empty)
     front   a strip at the hairline, the face under it bare; the two sides the same strip
     back    the picture's lower rows on the top of the face: the band at the hairline's height, the knot under it
     under   nothing */
// CAP_TOP_V: just under the picture's top edge, clear of its ragged first rows
const CAP_STRIP = 0.25, CAP_BACK = 0.42, CAP_CLOTH_ROWS = 0.32, CAP_TOP_V = 0.95;
const _capStrip = [CAP_STRIP, CAP_TOP_V, CAP_TOP_V - CAP_STRIP];
const ARMOR_CAP = { cloth: { px: _capStrip, nx: _capStrip, pz: _capStrip,
                             nz: [CAP_BACK, CAP_BACK, 0], py: [1, CAP_TOP_V, CAP_CLOTH_ROWS], ny: null } };
/* Every other helmet (leather cap, iron, bronze, steel, gold) leaves the face open: on the front only a brow of
   HELM_BROW of the face, showing the picture's lowest rows (its rim, the rivets' band), so the face shows under it; the
   top, the sides and the back whole; nothing under the chin. */
const HELM_BROW = 0.375;
const HELMET_OPEN_FACE = { pz: [HELM_BROW, HELM_BROW, 0], ny: null };
/* What is laid on the torso that is not armor (an item's `wear`, <wear>_torso_overlay in WORN_TEXTURES). Both
   pictures are drawn for the FRONT of the torso, so they are cut like a cap:
     a backpack's straps  the front only
     a belt               the whole picture on the front; round the sides and the back the same band without its
                          buckle (the picture's left third, a face entry's 4th and 5th numbers: columns uLeft..uRight)
   Each sits a little further out than the chestplate (G1 in syncArmorOnModel), the straps over the belt. */
const _beltBand = [1, 1, 0, 0.03, 0.36];
const TORSO_OVERLAY = {
  belt: { grow: 0.040, cut: { px: _beltBand, nx: _beltBand, nz: _beltBand, py: null, ny: null } },
  back: { grow: 0.048, cut: { px: null, nx: null, nz: null, py: null, ny: null } },
};
function _armorPiece(tex, w, h, d, grow, cap = null) {
  const geo = new THREE.BoxGeometry(w * PX + grow, h * PX + grow, d * PX + grow);
  if (cap) {
    const pos = geo.attributes.position, uv = geo.attributes.uv, H = h * PX + grow, drop = [];
    ['px', 'nx', 'py', 'ny', 'pz', 'nz'].forEach((f, i) => {
      const c = cap[f], b = i * 4;
      if (c === undefined) return;
      if (c === null) { drop.push(i); return; }
      const [keep, vTop, vBot, uLeft, uRight] = c;
      // a side face shortened from the top down (the top and bottom faces lie flat: they keep their size)
      if (f !== 'py' && f !== 'ny' && keep < 1) { pos.setY(b + 2, H / 2 - H * keep); pos.setY(b + 3, H / 2 - H * keep); }
      uv.setY(b, vTop); uv.setY(b + 1, vTop); uv.setY(b + 2, vBot); uv.setY(b + 3, vBot);
      // ...and only some of the picture's columns, when it names them (a face's corners: left, right, left, right)
      if (uLeft != null) { uv.setX(b, uLeft); uv.setX(b + 1, uRight); uv.setX(b + 2, uLeft); uv.setX(b + 3, uRight); }
    });
    if (drop.length) {
      geo.setIndex(Array.from(geo.index.array).filter((_, k) => !drop.includes((k / 6) | 0)));   // six indices a face
      geo.clearGroups();
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
  }
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.35,
  }));
}

function _pvInit() {
  if (_pvRenderer) return true;
  const host = invPanel('equipPreview');
  if (!host) return false;
  _pvRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  _pvRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  _pvRenderer.setSize(PREVIEW_W, PREVIEW_H);
  host.appendChild(_pvRenderer.domElement);
  _pvScene = new THREE.Scene();
  _pvCam = new THREE.PerspectiveCamera(30, PREVIEW_W / PREVIEW_H, 0.1, 20);
  _pvCam.position.set(0, 1.0, 4.2);
  _pvCam.lookAt(0, 0.95, 0);
  _pvModel = buildHumanoid();                       // same builder the world entities use
  // model's front is +Z and the camera sits at +Z looking back, so yaw 0 already faces us —
  // the extra PI turned its back to the camera
  _pvModel.root.rotation.y = 0;
  for (const m of _pvModel.mats) m.color.setScalar(1);
  _pvScene.add(_pvModel.root);
  _pvArmor = new THREE.Group();
  _pvModel.root.add(_pvArmor);
  return true;
}

/* The armor one humanoid wears: the equipment preview, and since 0.821 every player's body in the world
   (applyCameraView, entities/entities.js), so third person and the other players in split screen see it too. Each
   piece hangs off the body part it covers, so it follows every pose; its material joins m.mats, the list
   shadeHumanoid lights, so worn armor darkens at night with the body. Rebuilt only when a worn piece changes.
     helmet     head picture on the head
     chestplate torso picture on the body, arm picture on both arms
     leggings   leg picture on both legs, hugged tight
     boots      foot picture over the bottom five pixels of each leg, its sole along the bottom
     gloves     hand picture over the bottom five pixels of each arm (the chestplate's cuff until 0.82) */
/*   belt       its `wear` picture round the waist (TORSO_OVERLAY.belt)
     backpack   its straps down the front of the torso (TORSO_OVERLAY.back); the pack itself is 41-backpack.js */
const ARMOR_WORN = ['helmet', 'chestplate', 'leggings', 'boots', 'gloves'];
const TORSO_WORN = ['belt', 'back'];
function syncArmorOnModel(m, slots) {
  if (!m || !slots) return;
  const worn = ARMOR_WORN.map(k => { const s = slots[EQUIP_INDEX[k]]; return s && !slotBroken(s) ? s.id : 0; });
  const laid = TORSO_WORN.map(k => { const s = slots[EQUIP_INDEX[k]]; return s ? s.id : 0; });
  const key = worn.join(',') + '|' + laid.join(',');
  if (m._armorKey === key) return;
  m._armorKey = key;
  for (const g of [m.head, m.body, m.armR, m.armL, m.legR, m.legL])
    for (let i = g.children.length - 1; i >= 0; i--)
      if (g.children[i].userData.armor) { const c = g.children[i]; c.geometry.dispose(); c.material.dispose(); g.remove(c); }
  if (m._armorMats && m.mats) m.mats = m.mats.filter(mt => !m._armorMats.includes(mt));
  m._armorMats = [];
  const add = (parent, mesh, y = 0) => {
    mesh.userData.armor = true;
    mesh.position.set(0, y, 0);
    parent.add(mesh);
    m._armorMats.push(mesh.material);
    if (m.mats) m.mats.push(mesh.material);
  };
  const G1 = 0.030, G2 = 0.055;                     // helmet/legs sit closer than the torso layer
  // the picture for one body part of the material worn in a slot, or null
  let pending = false;                               // a picture that exists but has not loaded yet
  const texFor = (i, part) => {
    const mat = worn[i] && ITEM_PROPS[worn[i]]?.armorMat, name = mat && mat + '_' + part;
    const t = name ? _armorTex(name) : null;
    if (name && !t && EQUIP_TEXTURES[name]) pending = true;
    return t;
  };
  const limbY = -6 * PX, endY = -(12 - 5 / 2) * PX;   // a 12-long limb pivots at its top; its last five pixels
  const helm = texFor(0, 'head');
  // the cloth bandana is a cap: a strip at the hairline on the face, nothing under the chin; any other helmet a brow
  if (helm) add(m.head, _armorPiece(helm, 8, 8, 8, G2, ARMOR_CAP[ITEM_PROPS[worn[0]]?.armorMat] || HELMET_OPEN_FACE));
  const chest = texFor(1, 'torso'), sleeve = texFor(1, 'arm');
  if (chest) add(m.body, _armorPiece(chest, 8, 12, 4, G1));
  if (sleeve) for (const arm of [m.armR, m.armL]) add(arm, _armorPiece(sleeve, 4, 12, 4, G1), limbY);
  const legs = texFor(2, 'leg');
  if (legs) for (const leg of [m.legR, m.legL]) add(leg, _armorPiece(legs, 4, 12, 4, 0.012), limbY);
  const boots = texFor(3, 'foot');
  if (boots) for (const leg of [m.legR, m.legL]) add(leg, _armorPiece(boots, 4, 5, 4, G2), endY);
  const gloves = texFor(4, 'hand');
  if (gloves) for (const arm of [m.armR, m.armL]) add(arm, _armorPiece(gloves, 4, 5, 4, G2), endY);
  // the belt, and a backpack's straps: each item's own picture, laid on the torso
  TORSO_WORN.forEach((slotKey, i) => {
    const wear = laid[i] && ITEM_PROPS[laid[i]]?.wear, name = wear && wear + '_torso_overlay';
    if (!name || !EQUIP_TEXTURES[name]) return;     // nothing worn there, or it has no picture
    const t = _armorTex(name);
    if (!t) { pending = true; return; }
    add(m.body, _armorPiece(t, 8, 12, 4, TORSO_OVERLAY[slotKey].grow, TORSO_OVERLAY[slotKey].cut));
  });
  if (pending) m._armorKey = null;                  // try again once the art is in
}
// the preview: the armor, plus the backpack
let _pvArmorKey = '';
function _pvSyncArmor() {
  const key = equipSlots.map(s => s ? s.id : 0).join(',');
  if (key === _pvArmorKey) return;
  _pvArmorKey = key;
  _pvModel._armorKey = null;                         // another seat's inventory may be up now: rebuild
  syncArmorOnModel(_pvModel, equipSlots);
  for (const mt of _pvModel.mats) mt.color.setScalar(1);
  for (let i = _pvArmor.children.length - 1; i >= 0; i--) { const c = _pvArmor.children[i]; c.geometry.dispose(); _pvArmor.remove(c); }
  /* Backpack — not an overlay at all but a model of its own, so it is built by
     41-backpack.js and simply dropped in here. Its node is positioned for the TORSO group, which
     sits 12 pixels up; _pvArmor hangs off the root instead, so that offset is added back. Its model is read from
     a file the first time one is worn: until that is in, there is no node and this is asked again next frame. */
  const packSlot = equipSlots[EQUIP_INDEX.back];
  if (packSlot && typeof buildBackpackNode === 'function' && ITEM_PROPS[packSlot.id]?.packSlots) {
    const n = buildBackpackNode(packSlot.id);
    if (n) { n.position.y += 12 * PX; _pvArmor.add(n); }
    else _pvArmorKey = '';
  }
}

let _pvSpin = 0;
function updateEquipPreview(dt) {
  if (!invOpen || !_pvRenderer) return;
  /* One WebGL renderer, one canvas, and up to four inventories open at once — so make
     sure the canvas is actually parented into THIS seat's preview box before drawing this seat's
     armour into it. The caller picks a single owner per frame, so this settles immediately rather
     than tugging the canvas back and forth. */
  const host = invPanel('equipPreview');
  if (!host) return;
  if (_pvRenderer.domElement.parentNode !== host) {
    host.appendChild(_pvRenderer.domElement);
    _pvArmorKey = '';                                // different player: force an overlay refresh
  }
  _pvSyncArmor();
  _pvSpin += dt * 0.5;
  _pvModel.root.rotation.y = Math.sin(_pvSpin) * 0.45;   // gentle turntable around front-on
  _pvRenderer.render(_pvScene, _pvCam);
}
