'use strict';
/* blocks/chest.js: chests. Their models, pairing into doubles, opening and locks, what happens when one breaks, and
   saving. */

/* voxiGrof — chest: storage block with an animated lid, pairing into a double chest.

   Like the door and the bed, the chunk mesher emits NOTHING for chest cells — each chest is one
   three.js group (base box + hinged lid) built here. The voxel cell stays for collision/raycast.

   variant byte: bits 0-1 facing (0:+Z 1:-Z 2:+X 3:-X).

   Two chests that sit side by side ACROSS their facing form a double chest: both lids animate
   together and the GUI shows both inventories as one tall grid. Each cell keeps its own slot
   array — the UI renders them as two stacked regions ('chest' and 'chest2') so the existing
   drag/drop machinery works unchanged. */

/* a single chest is 3 rows (5 before); a double is 7, its first half (chestPairOrdered) having a bonus
   fourth row. A cell's slots are sized to what it shows when the chest opens (fitChestSlots below). */
const CHEST_COLS = 7, CHEST_ROWS = 3, CHEST_ROWS_BONUS = 1;
const CHEST_SLOTS = CHEST_COLS * CHEST_ROWS;          // 21 per cell; a double is 21 + 28 = 7 x 7
const CHEST_SAVE_MAX = 128;                           // the most slots a saved chest is read back with (64 before 0.843)

/* METAL CHESTS: B.METAL_CHEST, the chest in iron, copper or gold (variant bits 4-5, where a wooden chest keeps
   its wood), 6 rows, a double 6 + 1 + 6. Its body is the metal block's own art with the wooden chest's fittings over
   it. They lie about the world SEALED (bit 6), at any height on any block (trySpawnWorldChest), and a key of their
   metal opens one, staying in its lock; then it is a chest like any other, and a pickaxe takes it home. One is also made at
   the bench (a chest, a metal block, five iron: items/recipes.js), never sealed.
   Keys come from monsters (entities/entities.js). Any chest can be locked with a key like a door (useChest below; the codes
   live in DOOR_LOCKS with the doors', blocks/doors.js), and a locked chest broken takes its contents and itself with it. */
const CHEST_ROWS_METAL = 6;
const CHEST_SEALED = 64;
const CHEST_METALS = [
  { name: 'iron',   block: B.IRON_BLOCK,   key: ITEM.IRON_KEY,   keyText: 'an iron key',   loot: 'iron_chest' },
  { name: 'copper', block: B.COPPER_BLOCK, key: ITEM.COPPER_KEY, keyText: 'a copper key',  loot: 'copper_chest' },
  { name: 'gold',   block: B.GOLD_BLOCK,   key: ITEM.GOLDEN_KEY, keyText: 'a golden key',  loot: 'gold_chest' },
];
const isChestId = (id) => id === B.CHEST || id === B.METAL_CHEST;
const chestMetalOf = (va) => { const m = (va >> 4) & 3; return m < CHEST_METALS.length ? m : 0; };
// a chest's look, one number: 0-3 its wood, CHEST_METAL_LOOK + the metal for a metal chest
const CHEST_METAL_LOOK = 4;
const chestLookOf = (val) => (val & 255) === B.METAL_CHEST ? CHEST_METAL_LOOK + chestMetalOf((val >> 8) & 255) : chestWoodOf((val >> 8) & 255);
const chestRowsOf = (val) => (val & 255) === B.METAL_CHEST ? CHEST_ROWS_METAL : CHEST_ROWS;
/* a WOODEN chest can be sealed too (the same bit): the supply crate's. A blank wooden key opens it and stays in
   its lock, like a metal chest's key; the wooden key is crafted, never dropped. */
const chestSealed = (val) => isChestId(val & 255) && ((val >> 8) & CHEST_SEALED) !== 0;
const CHEST_WOOD_SEAL = { name: 'wooden', key: ITEM.WOODEN_KEY, keyText: 'a wooden key' };
// what opens a sealed chest: its metal's entry, or the wooden one
const chestSealOf = (val) => (val & 255) === B.METAL_CHEST ? CHEST_METALS[chestMetalOf((val >> 8) & 255)] : CHEST_WOOD_SEAL;
// sealed, or locked by a player's key
const chestLocked = (x, y, z, val = getBlock(x, y, z)) => chestSealed(val) || DOOR_LOCKS.has(chestKey(x, y, z));
const CHESTS = new Map();                             // "x,y,z" -> record
var activeChest = null;                               // key of the primary cell whose GUI is open
var activeChest2 = null;                              // key of its partner, or null

const chestKey = (x, y, z) => x + ',' + y + ',' + z;
const mkChest = () => ({ slots: new Array(CHEST_SLOTS).fill(null) });

/* ---------------------------------- geometry ---------------------------------- */
// art is a 16px grid: lid occupies the top 5 rows, body the lower 10 (see mkchest.ps1)
const CHEST_LID_H = 5 / 16, CHEST_BASE_H = 10 / 16;
const CHEST_INSET = 1 / 16;                           // chest is 14/16 wide, centred in the cell
const CHEST_WALL = 1 / 16;                            // the body is a box you can see into

/* WOOD: the chest art is grey wood with its metal fittings on separate overlay sheets. Each wood
   tints the grey by the colour of its planks, then the metal goes on top untinted. The wood sits in bits
   4-5 of the variant byte, picked on the variant bar (blocks/variants.js); 0 is oak, as every older chest is. */
/* rime wood the fourth the two bits hold; acacia the fifth, its third bit bit 7 (CHEST_WOOD_HIGH: free, a metal chest
   keeps its metal in bits 4-5 alone). Read and write the wood only through chestWoodOf / chestWoodBits. */
const CHEST_WOODS = ['oak', 'birch', 'spruce', 'rime', 'acacia'];
const CHEST_WOOD_SHIFT = 4, CHEST_WOOD_HIGH = 128;
const chestWoodOf = (va) => { const w = ((va >> CHEST_WOOD_SHIFT) & 3) | ((va & CHEST_WOOD_HIGH) ? 4 : 0); return w < CHEST_WOODS.length ? w : 0; };
const chestWoodBits = (w) => ((w & 3) << CHEST_WOOD_SHIFT) | ((w & 4) ? CHEST_WOOD_HIGH : 0);
const _CHEST_TINT_FALLBACK = [[1.2, 0.91, 0.57], [1.54, 1.4, 1.11], [0.82, 0.56, 0.33], [1.4, 1.5, 1.62], [1.6, 0.92, 0.5]];
/* THE ART: four sheets, 128 px a face. chest_wood / chest_metal hold a single chest, one row: front | side |
   top | bottom. chest_wood_double / chest_metal_double hold a double's two halves, three rows (front, top, bottom),
   the left half in the first column and the right in the second, so each row reads as the whole wide face. The
   metal sheets are the fittings (lock, corners, bands) in the same places, empty where a face has none. */
const CHEST_SHEET = {
  single: { wood: 'chest_wood', metal: 'chest_metal', cols: 4, rows: 1, front: [0, 0], side: [1, 0], top: [2, 0], bottom: [3, 0] },
  double: { wood: 'chest_wood_double', metal: 'chest_metal_double', cols: 2, rows: 3, front: [0, 0], top: [0, 1], bottom: [0, 2] },
};
// where a face sits on its sheet: [image, sx, sy, size]; the right half of a double is one column on
const _chestCell = (img, sh, part, half) => {
  const s = img.width / sh.cols, [c, r] = sh[part];
  return [img, (c + (half === 'right' ? 1 : 0)) * s, r * s, s];
};
const _chestTints = [];
/* The planks' mean colour over the grey art's mean, so a tinted chest averages out to its planks. It can
   pass 1: the grey is darker than any plank, and the tint is applied per pixel, which may brighten. */
function _chestTint(wood) {
  if (_chestTints[wood]) return _chestTints[wood];
  const planks = IMAGES[CHEST_WOODS[wood] + '_planks'], grey = IMAGES.chest_wood;
  if (!planks || !grey) return _CHEST_TINT_FALLBACK[wood];
  const mean = (img, sx = 0, sy = 0, sw = img.width, sh = img.height) => {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, sx, sy, sw, sh, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return n ? [r / n / 255, gg / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
  };
  const [, sx, sy, s] = _chestCell(grey, CHEST_SHEET.single, 'side', null);
  const p = mean(planks), gm = mean(grey, sx, sy, s, s), l = Math.max(0.05, (gm[0] + gm[1] + gm[2]) / 3);
  return (_chestTints[wood] = p.map(v => v / l));
}
// the art a metal chest's body is cut from: its metal's block (MESH_TEXTURES in 03 loads it)
const chestMetalArt = (look) => IMAGES[ATLAS_TILES[PROPS[CHEST_METALS[look - CHEST_METAL_LOOK].block].faces[0]]];

/* One texture per look, face and half: a wooden chest is the grey wood multiplied by the tint, its own alpha kept; a
   metal one its block's art with a frame and the lid's seam shaded in; then the fittings over either, untinted
   (`fit` false: none, the back of a double's half). Cached per key, but NEVER cached blank: a texture built
   before its art arrived keeps asking, and heals in place the moment IMAGES has it — otherwise it renders black. */
const _chestTexCache = {};
function chestTexture(look, part, half = null, fit = true) {
  const key = look + ':' + part + ':' + (half || '') + ':' + (fit ? 1 : 0);
  let t = _chestTexCache[key];
  if (!t) {
    t = _chestTexCache[key] = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
  }
  const sh = CHEST_SHEET[half ? 'double' : 'single'], metal = look >= CHEST_METAL_LOOK;
  const wood = IMAGES[sh.wood], fitImg = IMAGES[sh.metal], body = metal ? chestMetalArt(look) : wood;
  if (!t.image && wood && fitImg && body) {
    const [, sx, sy, s] = _chestCell(wood, sh, part, half), c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    if (!metal) {
      g.drawImage(wood, sx, sy, s, s, 0, 0, s, s);
      // per pixel rather than a canvas multiply, which can only darken: alpha is left as it is
      const [r, gg, b] = _chestTint(look), px = g.getImageData(0, 0, s, s), d = px.data;
      for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] * r); d[i + 1] = Math.min(255, d[i + 1] * gg); d[i + 2] = Math.min(255, d[i + 2] * b); }
      g.putImageData(px, 0, 0);
    } else {
      g.drawImage(body, 0, 0, s, s);
      /* A frame a sixteenth wide, darker, round the face — but not along the edge a double's half shares with its
         partner (the right side of a left half's picture, the left of a right's), so the two read as one chest */
      const e = s / 16;
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, 0, s, e); g.fillRect(0, s - e, s, e);
      if (half !== 'right') g.fillRect(0, e, e, s - 2 * e);
      if (half !== 'left') g.fillRect(s - e, e, e, s - 2 * e);
      // the lid's seam on the faces round it: the lid is the top 5 sixteenths (CHEST_LID_H)
      if (part === 'front' || part === 'side') { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, s * CHEST_LID_H - s / 64, s, s / 32); }
    }
    if (fit) { const [, fx, fy, fs] = _chestCell(fitImg, sh, part, half); g.drawImage(fitImg, fx, fy, fs, fs, 0, 0, s, s); }   // the fittings, untinted
    t.image = c;
    t.needsUpdate = true;
  }
  return t;
}
// the inside of a chest is plain planks of its wood, no frame, so the two halves of a double meet cleanly; a metal one its metal
const _chestInnerTex = [];
function chestInnerTexture(look) {
  let t = _chestInnerTex[look];
  if (!t) {
    t = _chestInnerTex[look] = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
  }
  const img = look >= CHEST_METAL_LOOK ? chestMetalArt(look) : IMAGES[CHEST_WOODS[look] + '_planks'];
  if (!t.image && img) { t.image = img; t.needsUpdate = true; }
  return t;
}
// k: how bright it draws against the light at the chest (the inside is in its own shade)
const chestMat = (tex, k = 1) => { const m = new THREE.MeshBasicMaterial({ map: tex }); m.userData.k = k; m.color.setScalar(k); return m; };

/* One face of an axis box, with its normal `dir` pointing out of the box: 'px' 'nx' 'py' 'ny' 'pz' 'nz'.
   UVs read the picture the right way round from the side the face is seen from; a side face maps its
   height onto the rows v0..v1 of the sheet, and `ref` (a box) lets a strip of a top take its UVs from the
   whole top rather than stretching the picture over itself. The inside of the chest is these same faces
   turned inward: a wall seen from within is the outward face of the opposite direction. */
function _chestFace(A, dir, b, mat, v0 = 0, v1 = 1, ref = b) {
  const [x0, y0, z0, x1, y1, z1] = b;
  const [rx0, ry0, rz0, rx1, ry1, rz1] = ref;
  const U = (x) => (x - rx0) / (rx1 - rx0), W = (z) => (z - rz0) / (rz1 - rz0), Vy = (y) => v0 + (y - ry0) / (ry1 - ry0) * (v1 - v0);
  let P;
  switch (dir) {
    case 'pz': P = [[x0,y0,z1, U(x0),Vy(y0)], [x1,y0,z1, U(x1),Vy(y0)], [x1,y1,z1, U(x1),Vy(y1)], [x0,y1,z1, U(x0),Vy(y1)]]; break;
    case 'nz': P = [[x1,y0,z0, 1-U(x1),Vy(y0)], [x0,y0,z0, 1-U(x0),Vy(y0)], [x0,y1,z0, 1-U(x0),Vy(y1)], [x1,y1,z0, 1-U(x1),Vy(y1)]]; break;
    case 'px': P = [[x1,y0,z1, 1-W(z1),Vy(y0)], [x1,y0,z0, 1-W(z0),Vy(y0)], [x1,y1,z0, 1-W(z0),Vy(y1)], [x1,y1,z1, 1-W(z1),Vy(y1)]]; break;
    case 'nx': P = [[x0,y0,z0, W(z0),Vy(y0)], [x0,y0,z1, W(z1),Vy(y0)], [x0,y1,z1, W(z1),Vy(y1)], [x0,y1,z0, W(z0),Vy(y1)]]; break;
    case 'py': P = [[x0,y1,z1, U(x0),1-W(z1)], [x1,y1,z1, U(x1),1-W(z1)], [x1,y1,z0, U(x1),1-W(z0)], [x0,y1,z0, U(x0),1-W(z0)]]; break;
    case 'ny': P = [[x0,y0,z0, U(x0),W(z0)], [x1,y0,z0, U(x1),W(z0)], [x1,y0,z1, U(x1),W(z1)], [x0,y0,z1, U(x0),W(z1)]]; break;
  }
  const base = A.pos.length / 3;
  for (const p of P) { A.pos.push(p[0], p[1], p[2]); A.uv.push(p[3], p[4]); }
  A.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  A.groups.push({ start: A.idx.length - 6, count: 6, mat });
}
function _chestGeo(A) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
  geo.setIndex(A.idx);
  for (const g of A.groups) geo.addGroup(g.start, g.count, g.mat);
  return geo;
}

/* Authored with the FRONT at +Z; registerChest rotates the group onto the real facing. Cell-local coords.
   `half`: null for a single chest, or 'left' / 'right' for one half of a double — seen from the
   front, 'left' is the half at local -X. A half reaches the shared edge, has no wall there, and draws the
   double chest's own sheets, so the pair reads as one wide chest with one cavity. */
// `look`: chestLookOf (the wood before)
function buildChestMesh(look = 0, half = null) {
  const L = half === 'left', R = half === 'right', other = L ? 'right' : 'left';
  const tex = { front: chestTexture(look, 'front', half),
                back:  half ? chestTexture(look, 'front', other, false) : chestTexture(look, 'side'),
                top:   chestTexture(look, 'top', half),
                bottom: chestTexture(look, 'bottom', half, false) };
  const mats = [chestMat(tex.front), chestMat(tex.back), chestMat(chestTexture(look, 'side')),
                chestMat(tex.top), chestMat(tex.bottom), chestMat(chestInnerTexture(look), 0.6)];
  const [FRONT, BACK, SIDE, TOP, BOTTOM, INNER] = [0, 1, 2, 3, 4, 5];
  const BODY_V = 1 - CHEST_LID_H;                       // body art = lower rows, lid art = the top 5

  // the body: outer walls, a rim, and the cavity inside
  const x0 = R ? 0 : CHEST_INSET, x1 = L ? 1 : 1 - CHEST_INSET, z0 = CHEST_INSET, z1 = 1 - CHEST_INSET, H = CHEST_BASE_H;
  const Wl = R ? 0 : CHEST_WALL, Wr = L ? 0 : CHEST_WALL;   // no wall on the shared edge
  const ix0 = x0 + Wl, ix1 = x1 - Wr, iz0 = z0 + CHEST_WALL, iz1 = z1 - CHEST_WALL, iy0 = CHEST_WALL;
  const A = { pos: [], uv: [], idx: [], groups: [] };
  const body = [x0, 0, z0, x1, H, z1];
  _chestFace(A, 'pz', body, FRONT, 0, BODY_V);
  _chestFace(A, 'nz', body, BACK, 0, BODY_V);
  if (!R) _chestFace(A, 'nx', body, SIDE, 0, BODY_V);
  if (!L) _chestFace(A, 'px', body, SIDE, 0, BODY_V);
  _chestFace(A, 'ny', body, BOTTOM);
  // the rim: the top of the walls, its UVs taken from the whole top so the wood lines up
  _chestFace(A, 'py', [x0, 0, iz1, x1, H, z1], SIDE, 0, 1, body);
  _chestFace(A, 'py', [x0, 0, z0, x1, H, iz0], SIDE, 0, 1, body);
  if (Wl) _chestFace(A, 'py', [x0, 0, iz0, ix0, H, iz1], SIDE, 0, 1, body);
  if (Wr) _chestFace(A, 'py', [ix1, 0, iz0, x1, H, iz1], SIDE, 0, 1, body);
  // the cavity: its floor and the four walls seen from inside
  _chestFace(A, 'py', [ix0, 0, iz0, ix1, iy0, iz1], INNER);
  _chestFace(A, 'nz', [ix0, iy0, iz1, ix1, H, iz1], INNER, iy0 / H * BODY_V, BODY_V);
  _chestFace(A, 'pz', [ix0, iy0, iz0, ix1, H, iz0], INNER, iy0 / H * BODY_V, BODY_V);
  if (Wl) _chestFace(A, 'px', [ix0, iy0, iz0, ix0, H, iz1], INNER, iy0 / H * BODY_V, BODY_V);
  if (Wr) _chestFace(A, 'nx', [ix1, iy0, iz0, ix1, H, iz1], INNER, iy0 / H * BODY_V, BODY_V);
  const base = new THREE.Mesh(_chestGeo(A), mats);

  // lid pivots on its BACK edge so it swings up and away from the player
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, H, z0);
  const lid = [x0, 0, 0, x1, CHEST_LID_H, z1 - z0];
  const B2 = { pos: [], uv: [], idx: [], groups: [] };
  _chestFace(B2, 'pz', lid, FRONT, BODY_V, 1);
  _chestFace(B2, 'nz', lid, BACK, BODY_V, 1);
  if (!R) _chestFace(B2, 'nx', lid, SIDE, BODY_V, 1);
  if (!L) _chestFace(B2, 'px', lid, SIDE, BODY_V, 1);
  _chestFace(B2, 'py', lid, TOP);
  _chestFace(B2, 'ny', lid, INNER);                     // its underside, seen when it is open
  lidPivot.add(new THREE.Mesh(_chestGeo(B2), mats));

  const group = new THREE.Group();
  group.add(base, lidPivot);
  return { group, lidPivot, mats };
}

/* Chest as a held/dropped item: one shared prototype per look, cloned per use so every copy shares the
   geometry and materials. Built lazily — IMAGES isn't populated when this file is parsed.
   buildChestMesh authors in cell-local 0..1 space; drops and hands expect the model centred on
   the origin, hence the offset. */
const _chestItemProto = [];
function chestItemNode(look = 0) {
  if (!_chestItemProto[look]) {
    const m = buildChestMesh(look);
    m.group.position.set(-0.5, -0.5, -0.5);
    _chestItemProto[look] = new THREE.Group();
    _chestItemProto[look].add(m.group);
  }
  return _chestItemProto[look].clone();
}

/* ---------------------------------- lifecycle ---------------------------------- */
/* Which half of a double chest this cell is, seen from the front: 'left' when its partner lies to the
   local +X (the viewer's right), 'right' when to the -X, null when single. */
function _chestHalf(x, y, z, facing) {
  const p = chestPartner(x, y, z);
  if (!p) return null;
  const ang = [0, Math.PI, Math.PI / 2, -Math.PI / 2][facing & 3];
  const rx = Math.round(Math.cos(ang)), rz = Math.round(-Math.sin(ang));   // local +X in the world
  return (p.x - x) * rx + (p.z - z) * rz > 0 ? 'left' : 'right';
}
/* `val` is the cell's value when the caller has it and the world may not yet (a world loading registers every
   saved chest before a single chunk is in: getBlock read 0 there, and every chest came back as a single OAK one — a
   sealed iron chest that looked wooden and asked for an iron key). What it was built as is kept (look, half), and
   updateChests looks again the first time its chunk is there. */
function registerChest(x, y, z, facing, val = null) {
  const k = chestKey(x, y, z);
  let rec = CHESTS.get(k);
  if (!rec) { rec = mkChest(); CHESTS.set(k, rec); }
  if (rec.group) return rec;                          // mesh already built
  const half = _chestHalf(x, y, z, facing);
  const here = getBlock(x, y, z), look = chestLookOf(isChestId(here & 255) ? here : (val ?? here));
  const m = buildChestMesh(look, half);   // its wood or metal
  m.group.position.set(x, y, z);
  m.group.rotation.y = [0, Math.PI, Math.PI / 2, -Math.PI / 2][facing & 3];
  // rotating about the cell corner swings the body off its cell — shift it back
  const off = [[0, 0], [1, 1], [0, 1], [1, 0]][facing & 3];
  m.group.position.x += off[0];
  m.group.position.z += off[1];
  scene.add(m.group);
  Object.assign(rec, { group: m.group, lidPivot: m.lidPivot, mats: m.mats,
                       x, y, z, facing, lid: 0, lastB: -1, look, half, checked: false });
  return rec;
}
// a chest that became, or stopped being, half of a pair draws again as what it is now
function rebuildChestMesh(x, y, z) {
  const k = chestKey(x, y, z);
  if (!CHESTS.get(k)?.group) return;
  removeChestMesh(k);
  registerChest(x, y, z, (getBlock(x, y, z) >> 8) & 3);
}
function removeChestMesh(k) {
  const c = CHESTS.get(k);
  if (!c || !c.group) return;
  scene.remove(c.group);
  c.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  for (const mt of c.mats) mt.dispose();
  c.group = null; c.lidPivot = null; c.mats = null;
}
function clearChests() {
  for (const k of [...CHESTS.keys()]) removeChestMesh(k);
  CHESTS.clear();
  activeChest = activeChest2 = null;
}

/* Chests pair ACROSS their facing: two chests looking the same way, side by side.

   The pairing is DECIDED ONCE, when the second chest is placed, and stored in the variant byte
   rather than re-derived by scanning neighbours. Scanning made a row of three chests ambiguous —
   the middle one answered "yes, I'm paired" to both of its neighbours, so it appeared as the
   other half of two different double chests and its contents showed up in both GUIs.

   variant bit 2 = paired, bit 3 = the partner sits in the NEGATIVE direction. */
const CHEST_PAIRED  = 4;
const CHEST_PAIR_NEG = 8;

// the two cells a chest with this facing could pair with: [positive, negative]
const chestPairDirs = (facing) =>
  (facing === 0 || facing === 1) ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];

// a metal chest pairs with a metal chest, a wooden one with a wooden one
function chestPartner(x, y, z) {
  const val = getBlock(x, y, z), id = val & 255;
  if (!isChestId(id)) return null;
  const va = (val >> 8) & 255;
  if (!(va & CHEST_PAIRED)) return null;
  const [dx, dz] = chestPairDirs(va & 3)[(va & CHEST_PAIR_NEG) ? 1 : 0];
  const nv = getBlock(x + dx, y, z + dz);
  if ((nv & 255) !== id) return null;               // partner gone — fall back to a single chest
  return { x: x + dx, y, z: z + dz };
}

/* Called right after a chest block is placed. Links it to ONE unpaired same-facing neighbour and
   writes the link into both variant bytes. A neighbour that is already half of a double is
   skipped, so a single chest can never be claimed twice. */
function tryPairChest(x, y, z, facing) {
  const dirs = chestPairDirs(facing), id = getBlock(x, y, z) & 255;
  for (let i = 0; i < 2; i++) {
    const [dx, dz] = dirs[i];
    const nv = getBlock(x + dx, y, z + dz);
    if ((nv & 255) !== id) continue;                      // the same kind of chest
    const nva = (nv >> 8) & 255, va = (getBlock(x, y, z) >> 8) & 255;
    if ((nva & 3) !== facing || (nva & CHEST_PAIRED)) continue;
    if (chestWoodOf(nva) !== chestWoodOf(va)) continue;   // one wood (or metal, the same bits) per double chest
    if (chestLocked(x + dx, y, z + dz, nv)) continue;     // a sealed or locked chest stays on its own
    const wood = (va & 255) & (3 << CHEST_WOOD_SHIFT | CHEST_WOOD_HIGH);   // its wood (or metal), kept through the pairing
    const mine  = facing | CHEST_PAIRED | (i === 1 ? CHEST_PAIR_NEG : 0) | wood;
    const their = facing | CHEST_PAIRED | (i === 1 ? 0 : CHEST_PAIR_NEG) | wood;
    setBlock(x, y, z, id | (mine << 8));
    setBlock(x + dx, y, z + dz, id | (their << 8));
    rebuildChestMesh(x + dx, y, z + dz);                  // the neighbour turns into its half
    return true;
  }
  return false;
}

/* A broken chest leaves its partner single again — otherwise the survivor keeps a paired bit
   pointing at an empty cell and chestPartner has to keep guessing. */
function unpairChestNeighbour(x, y, z, oldVal) {
  const va = (oldVal >> 8) & 255, id = oldVal & 255;
  if (!(va & CHEST_PAIRED)) return;
  const [dx, dz] = chestPairDirs(va & 3)[(va & CHEST_PAIR_NEG) ? 1 : 0];
  const nv = getBlock(x + dx, y, z + dz);
  if ((nv & 255) !== id) return;
  const keep = ((nv >> 8) & 3) | ((nv >> 8) & (3 << CHEST_WOOD_SHIFT | CHEST_WOOD_HIGH));   // facing and wood (or metal)
  setBlock(x + dx, y, z + dz, id | (keep << 8));
  rebuildChestMesh(x + dx, y, z + dz);                    // a whole chest again
}
// deterministic ordering so both halves agree which cell is "first"
function chestPairOrdered(x, y, z) {
  const p = chestPartner(x, y, z);
  if (!p) return [{ x, y, z }, null];
  const a = { x, y, z };
  const first = (a.x < p.x || (a.x === p.x && a.z < p.z)) ? a : p;
  const second = first === a ? p : a;
  return [first, second];
}

// spill contents and forget the chest when its block goes away
function chestBroken(x, y, z, oldVal) {
  const k = chestKey(x, y, z);
  // a locked or sealed chest broken takes its contents (and its unrolled loot) with it; the lock goes too
  const locked = chestSealed(oldVal) || DOOR_LOCKS.has(k);
  DOOR_LOCKS.delete(k);
  if (locked) PENDING_LOOT.delete(lootKey(x, y, z));
  unpairChestNeighbour(x, y, z, oldVal);
  const c = CHESTS.get(k);
  removeChestMesh(k);
  if (!c) return;
  if (!player.canFly && !locked)
    for (const s of c.slots)
      if (s) spawnDrop(s.id, x, y, z, null, undefined, s.dur ?? null, slotMeta(s), 0, s.count);   // one stack a slot, wear kept
  CHESTS.delete(k);
  if (activeChest === k || activeChest2 === k) {
    activeChest = activeChest2 = null;
    if (invOpen) toggleInventory(false);
  }
}

// right-click: open the GUI for this chest (plus its partner, if any)
function openChest(x, y, z) {
  const [a, b] = chestPairOrdered(x, y, z);
  registerChest(a.x, a.y, a.z, (getBlock(a.x, a.y, a.z) >> 8) & 3);
  if (b) registerChest(b.x, b.y, b.z, (getBlock(b.x, b.y, b.z) >> 8) & 3);
  activeChest = chestKey(a.x, a.y, a.z);
  activeChest2 = b ? chestKey(b.x, b.y, b.z) : null;
  // each half to its size: the first half of a double has the bonus row; a metal chest has 6 rows
  const rows = chestRowsOf(getBlock(a.x, a.y, a.z));
  const fit = [[CHESTS.get(activeChest), CHEST_COLS * (rows + (b ? CHEST_ROWS_BONUS : 0))]];
  if (b) fit.push([CHESTS.get(activeChest2), CHEST_COLS * rows]);
  fitChestSlots(fit, a.x, a.y, a.z);
  /* Structure loot is rolled on FIRST OPEN, not when the structure was stamped — a hundred
     untouched chests then cost nothing, and the contents feel rolled for you. */
  const ra = CHESTS.get(activeChest);
  if (ra) fillPendingLoot(a.x, a.y, a.z, ra.slots);
  if (b) { const rb = CHESTS.get(activeChest2); if (rb) fillPendingLoot(b.x, b.y, b.z, rb.slots); }
  // ONE sound for the whole chest, single or double — it's one lid action either way
  playSound('chestOpen', { gain: 0.8, pos: { x: a.x + 0.5, y: a.y + 0.5, z: a.z + 0.5 } });
  // a dust puff from under the lid; under water, bubbles instead (fluids/waterlog.js)
  for (const c of b ? [a, b] : [a]) {
    if (isWaterlogged(getBlock(c.x, c.y, c.z))) { if (typeof waterlogChestOpened === 'function') waterlogChestOpened(c.x, c.y, c.z); }
    else if (typeof fxPuff === 'function') fxPuff(c.x + 0.5, c.y + 0.9, c.z + 0.5, [0.8, 0.74, 0.62], 6);
  }
  toggleInventory(true);
}

/* Right-click on a chest in survival, keys as on a door (useDoor, blocks/doors.js). A SEALED metal chest opens
   for a key of its metal only, which stays in its lock: the chest is open for good then. Otherwise a blank key locks
   it (both halves of a double, one code), its own key opens it, and with sneak unlocks it; any other hand opens an
   unlocked chest. */
function useChest(x, y, z) {
  const val = getBlock(x, y, z);
  if (!isChestId(val & 255)) return;
  const held = HOTBAR[hotbarSel], isKey = isKeyItem(held?.id), pos = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
  // a locked chest says so and stays shut: no lid sound, it never moved (it played the closing lid quietly)
  const deny = (msg) => { feedWarn(msg); };
  const [a, b] = chestPairOrdered(x, y, z), cells = b ? [a, b] : [a];
  /* the lid needs room. A chest with a block on it does not open — another chest on top is fine (they stack),
     and a double opens as long as ONE of its halves is clear. Locking and unlocking with a key need no lid. */
  const covered = cells.every(c => chestCovered(c.x, c.y, c.z));
  // sealed: this cell, or the half a chest was put beside (the other half is no way round the seal)
  const sealedAt = cells.find(c => chestSealed(getBlock(c.x, c.y, c.z)));
  if (sealedAt) {
    const m = chestSealOf(getBlock(sealedAt.x, sealedAt.y, sealedAt.z));
    if (held?.id !== m.key) { deny(`Locked: it takes ${m.keyText}`); return; }
    if (keyBoundCode(held) != null) { deny(`That ${ITEM_PROPS[m.key].name.toLowerCase()} locks something else: unlock it first`); return; }
    if (covered) { deny(CHEST_COVERED_MSG); return; }            // before the key is spent
    // the key is turned with the button held, CHEST_UNSEAL_S, the progress ring round the crosshair (updateChestUnseal)
    if (!player._unseal) player._unseal = { x, y, z, sel: hotbarSel, key: m.key, t: 0 };
    return;
  }
  const lock = cells.map(c => DOOR_LOCKS.get(chestKey(c.x, c.y, c.z))).find(c => c != null);
  const bound = isKey ? keyBoundCode(held) : null;
  if (isKey && lock == null && bound == null) {                // a blank key locks it
    const code = _newLockCode();
    for (const c of cells) DOOR_LOCKS.set(chestKey(c.x, c.y, c.z), code);
    held.lock = code;
    saveHotbar(); buildHotbar();
    playSound('chestClose', { gain: 0.5, pos });
    feedInfo(`Chest locked: only this ${ITEM_PROPS[held.id].name.toLowerCase()} opens it now`);
    return;
  }
  if (lock != null) {
    if (!isKey || bound !== lock) { deny(isKey ? 'Locked: this is not its key' : 'Locked: hold its key to open it'); return; }
    if (player.sneaking) {                                       // its own key, sneaking: unlocked, the key blank again
      for (const c of cells) DOOR_LOCKS.delete(chestKey(c.x, c.y, c.z));
      delete held.lock;
      saveHotbar(); buildHotbar();
      feedInfo('Chest unlocked: the key is blank again');
      return;
    }
  }
  if (covered) { deny(CHEST_COVERED_MSG); return; }
  openChest(x, y, z);
}
/* A sealed chest opens with its key held in it a moment: the right button down CHEST_UNSEAL_S with the key in hand,
   standing by it (started by useChest). Let go, change hands or walk off and it stays sealed. Once a frame per seat
   (tickPlayer, player/tick.js); returns how far it is, 0..1, for the progress ring (interactProgress, ui/hud.js). */
const CHEST_UNSEAL_S = 0.8, CHEST_UNSEAL_REACH = 6;
function updateChestUnseal(dt, held) {
  const u = player._unseal;
  if (!u) return 0;
  const slot = HOTBAR[hotbarSel];
  const ok = held && playing && !invOpen && !player.dead && hotbarSel === u.sel && slot && slot.id === u.key
    && chestSealed(getBlock(u.x, u.y, u.z))
    && Math.hypot(player.pos.x - u.x - 0.5, player.pos.y - u.y, player.pos.z - u.z - 0.5) <= CHEST_UNSEAL_REACH;
  if (!ok) { player._unseal = null; return 0; }
  player._milkLatch = true;                          // the held button is the key's, not a block placed (tickPlayer)
  u.t += dt;
  if (u.t < CHEST_UNSEAL_S) return u.t / CHEST_UNSEAL_S;
  player._unseal = null;
  const [a, b] = chestPairOrdered(u.x, u.y, u.z), m = chestSealOf(getBlock(u.x, u.y, u.z));
  if ((slot.count | 0) > 1) slot.count--; else HOTBAR[hotbarSel] = null;   // the key stays in its lock
  saveHotbar(); buildHotbar();
  for (const c of b ? [a, b] : [a]) {
    const cv = getBlock(c.x, c.y, c.z);
    if (chestSealed(cv)) setBlock(c.x, c.y, c.z, (cv & ~(CHEST_SEALED << 8)) >>> 0);
  }
  feedInfo(`Unlocked: ${m.keyText} stays in its lock`);
  openChest(u.x, u.y, u.z);
  return 0;
}
// something on top of the chest that is not another chest, nor water (a chest under water opens: fluids/waterlog.js)
const CHEST_COVERED_MSG = 'Clear the top of the chest first';
const chestCovered = (x, y, z) => { const up = getBlock(x, y + 1, z) & 255; return up !== B.AIR && up !== B.WATER && !isChestId(up); };
// the chest tab's name: "Chest", "Large Chest", "Iron Chest", "Large Gold Chest"
function chestTabName() {
  const p = activeChest ? activeChest.split(',').map(Number) : null;
  const v = p ? getBlock(p[0], p[1], p[2]) : 0;
  const kind = (v & 255) === B.METAL_CHEST ? CHEST_METALS[chestMetalOf((v >> 8) & 255)].name : '';
  return (activeChest2 ? 'Large ' : '') + (kind ? kind[0].toUpperCase() + kind.slice(1) + ' Chest' : 'Chest');
}

/* Size each cell's slots to what it shows, list = [[record, slots], ...]. Whatever sits past the end — a
   5-row chest from before 0.829, or a first half that lost its partner and its bonus row — moves into a free slot,
   and what finds none falls out at the chest (creative, where nothing drops, keeps it in an extra row). */
function fitChestSlots(list, x, y, z) {
  const spill = [];
  for (const [c, n] of list) {
    if (!c) continue;
    for (let i = n; i < c.slots.length; i++) if (c.slots[i]) spill.push(c.slots[i]);
    c.slots.length = n;
    for (let i = 0; i < n; i++) if (c.slots[i] === undefined) c.slots[i] = null;
  }
  let fell = 0;
  for (const s of spill) {
    const at = list.find(([c]) => c && c.slots.includes(null));
    if (at) { at[0].slots[at[0].slots.indexOf(null)] = s; continue; }
    if (!player.canFly) {
      spawnDrop(s.id, x, y + 1, z, null, undefined, s.dur ?? null, slotMeta(s), 0, s.count);   // one stack
      fell++;
      continue;
    }
    const c = list[0][0];                              // creative: one more row to hold it
    c.slots.push(s);
    while (c.slots.length % CHEST_COLS) c.slots.push(null);
  }
  if (fell && typeof feedWarn === 'function') feedWarn(`Chests are smaller now: ${fell} stack${fell > 1 ? 's' : ''} fell out`);
}

/* Closing is driven from toggleInventory (Esc, E, clicking away all land there), so the sound
   lives in a helper it can call rather than being duplicated at each exit. */
function chestClosedSound() {
  const c = activeChest && CHESTS.get(activeChest);
  if (!c) return;
  playSound('chestClose', { gain: 0.8, pos: { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 } });
}

/* ---------------------------------- per-frame ---------------------------------- */
const CHEST_OPEN_ANGLE = -1.15;
function updateChests(dt) {
  for (const [k, c] of CHESTS) {
    if (!c.group) continue;
    const ch = getChunk(Math.floor(c.x / 16), Math.floor(c.z / 16));
    if (!ch || !ch.data) { c.group.visible = false; c.checked = false; continue; }
    const cv = getBlock(c.x, c.y, c.z);
    if (!isChestId(cv & 255)) { removeChestMesh(k); continue; }   // either kind
    /* The first time its chunk is there: is the model what the cell says — its wood or metal, its facing,
       its half of a double? One built while the world was still loading is not, and is built again. A half whose
       partner's chunk has not come yet keeps looking until it has. */
    if (!c.checked) {
      const va = (cv >> 8) & 255, half = _chestHalf(c.x, c.y, c.z, va & 3);
      if (!((va & CHEST_PAIRED) && !half)) c.checked = true;
      if (chestLookOf(cv) !== c.look || half !== c.half || (va & 3) !== c.facing) { rebuildChestMesh(c.x, c.y, c.z); continue; }
    }
    c.group.visible = true;
    // lid eases toward open/closed; a double chest opens both halves together
    const wantOpen = invOpen && (activeChest === k || activeChest2 === k);
    const target = wantOpen ? 1 : 0;
    if (Math.abs(target - c.lid) > 0.001) {
      const step = Math.min(1, dt * 7);
      c.lid += (target - c.lid) * step;
    } else c.lid = target;
    c.lidPivot.rotation.x = c.lid * CHEST_OPEN_ANGLE;
    // tint by world light at the chest cell (same approximation the doors use)
    const bl = getLightWorld(c.x, c.y, c.z) / 15;
    const sky = getSkyWorld(c.x, c.y, c.z) / 15;
    const skyF = SKY_FLOOR + (1 - SKY_FLOOR) * sky * sky;   // must track the chunk shader in 04-materials.js (SKY_FLOOR 0.8442)
    const sun = sharedUniforms.uAmbient.value + sharedUniforms.uDirect.value;
    const br = Math.min(1, skyF * sun * 0.92 + (bl * 0.45 + bl * bl * 0.85));
    if (Math.abs(br - c.lastB) > 0.02) {
      c.lastB = br;
      for (const mt of c.mats) mt.color.setScalar(br * (mt.userData.k ?? 1)).convertSRGBToLinear();   // the inside darker
    }
  }
}

/* ---------------------------------- save / load ---------------------------------- */
function serializeChests() {
  const out = [];
  for (const [k, c] of CHESTS) {
    if (!c.slots.some(s => s)) continue;               // skip empties, they rebuild from the block
    out.push([k, c.slots.map(s => s ? [s.id, s.count, s.dur ?? null, s.fresh ?? null, s.wm ? 1 : 0, s.lock ?? null] : null),   // a key's lock
              { t: c.spoilT ?? null, s: c.saltT || 0 }]);   // the world-clock time it last spoiled, its salt timer
  }
  return out;
}
function restoreChests(list) {
  if (!Array.isArray(list)) return;
  for (const rec of list) {
    if (!Array.isArray(rec) || typeof rec[0] !== 'string') continue;
    const c = mkChest();
    const arr = Array.isArray(rec[1]) ? rec[1] : [];
    // every saved slot comes back, 35 from before 0.829 too; opening the chest fits them to its rows (fitChestSlots)
    while (c.slots.length < Math.min(arr.length, CHEST_SAVE_MAX)) c.slots.push(null);
    for (let i = 0; i < c.slots.length && i < arr.length; i++) {
      const s = arr[i];
      if (!Array.isArray(s)) continue;
      const [raw, count, dur, fresh, wm, lock] = s;
      // stone brick is a variant of stone since 0.794; an old oak door is its 3 oak planks since 0.842
      const oldDoor = raw === B.DOOR, id = oldDoor ? B.PLANKS : legacyItemId(raw);
      if (!(PROPS[id] || ITEM_PROPS[id])) continue;
      const slot = mkSlot(id, Math.max(1, count | 0) * (oldDoor ? 3 : 1));
      if (dur != null) slot.dur = dur;
      if (fresh != null) slot.fresh = fresh;      // 0.789
      if (wm) slot.wm = 1;                        // 0.79
      if (Number.isInteger(lock)) slot.lock = lock;   // a key's door
      c.slots[i] = slot;
    }
    const meta = rec[2] && typeof rec[2] === 'object' ? rec[2] : null;   // 0.8099
    if (meta && typeof meta.t === 'number') c.spoilT = meta.t;
    if (meta && typeof meta.s === 'number') c.saltT = meta.s;
    CHESTS.set(rec[0], c);
  }
}
