'use strict';
/* voxiGrof — chest: storage block with an animated lid, pairing into a double chest.

   Like the door and the bed, the chunk mesher emits NOTHING for chest cells — each chest is one
   three.js group (base box + hinged lid) built here. The voxel cell stays for collision/raycast.

   variant byte: bits 0-1 facing (0:+Z 1:-Z 2:+X 3:-X).

   Two chests that sit side by side ACROSS their facing form a double chest: both lids animate
   together and the GUI shows both inventories as one tall grid. Each cell keeps its own slot
   array — the UI renders them as two stacked regions ('chest' and 'chest2') so the existing
   drag/drop machinery works unchanged. */

const CHEST_COLS = 7, CHEST_ROWS = 5;                 // wide and short so it fits without scrolling
const CHEST_SLOTS = CHEST_COLS * CHEST_ROWS;          // 35 per cell; a double stacks to 10 x 7
const CHESTS = new Map();                             // "x,y,z" -> record
var activeChest = null;                               // key of the primary cell whose GUI is open
var activeChest2 = null;                              // key of its partner, or null

const chestKey = (x, y, z) => x + ',' + y + ',' + z;
const mkChest = () => ({ slots: new Array(CHEST_SLOTS).fill(null) });

/* ---------------------------------- geometry ---------------------------------- */
// art is a 16px grid: lid occupies the top 5 rows, body the lower 10 (see mkchest.ps1)
const CHEST_LID_H = 5 / 16, CHEST_BASE_H = 10 / 16;
const CHEST_INSET = 1 / 16;                           // chest is 14/16 wide, centred in the cell
const CHEST_WALL = 1 / 16;                            // the body is a box you can see into (0.809)

/* WOOD (0.809): the chest art is grey wood with its metal fittings on separate overlay sheets. Each wood
   tints the grey by the colour of its planks, then the metal goes on top untinted. The wood sits in bits
   4-5 of the variant byte, picked on the variant bar (46-variants.js); 0 is oak, as every older chest is. */
const CHEST_WOODS = ['oak', 'birch', 'spruce'];
const CHEST_WOOD_SHIFT = 4;
const chestWoodOf = (va) => { const w = (va >> CHEST_WOOD_SHIFT) & 3; return w < CHEST_WOODS.length ? w : 0; };
const _CHEST_TINT_FALLBACK = [[1.2, 0.91, 0.57], [1.54, 1.4, 1.11], [0.82, 0.56, 0.33]];
const _chestTints = [];
/* The planks' mean colour over the grey art's mean, so a tinted chest averages out to its planks. It can
   pass 1: the grey is darker than any plank, and the tint is applied per pixel, which may brighten. */
function _chestTint(wood) {
  if (_chestTints[wood]) return _chestTints[wood];
  const planks = IMAGES[CHEST_WOODS[wood] + '_planks'], grey = IMAGES.chest_side;
  if (!planks || !grey) return _CHEST_TINT_FALLBACK[wood];
  const mean = (img) => {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return n ? [r / n / 255, gg / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
  };
  const p = mean(planks), gm = mean(grey), l = Math.max(0.05, (gm[0] + gm[1] + gm[2]) / 3);
  return (_chestTints[wood] = p.map(v => v / l));
}

/* One texture per wood and sheet: the grey wood multiplied by the tint, its own alpha kept, the metal
   drawn over it. Cached per key, but NEVER cached blank (0.724): a texture built before its art arrived
   keeps asking, and heals in place the moment IMAGES has it — otherwise the chest renders solid black. */
const _chestTexCache = {};
function chestTexture(wood, sheet, metal) {
  const key = wood + ':' + sheet + ':' + (metal || '');
  let t = _chestTexCache[key];
  if (!t) {
    t = _chestTexCache[key] = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped (0.8092)
  }
  if (!t.image && IMAGES[sheet] && (!metal || IMAGES[metal])) {
    const src = IMAGES[sheet], c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0);
    // per pixel rather than a canvas multiply, which can only darken: alpha is left as it is
    const [r, gg, b] = _chestTint(wood), px = g.getImageData(0, 0, c.width, c.height), d = px.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] * r); d[i + 1] = Math.min(255, d[i + 1] * gg); d[i + 2] = Math.min(255, d[i + 2] * b); }
    g.putImageData(px, 0, 0);
    if (metal) g.drawImage(IMAGES[metal], 0, 0, c.width, c.height);   // the fittings, untinted
    t.image = c;
    t.needsUpdate = true;
  }
  return t;
}
// the inside of a chest is plain planks of its wood, no frame, so the two halves of a double meet cleanly (0.809)
const _chestInnerTex = [];
function chestInnerTexture(wood) {
  let t = _chestInnerTex[wood];
  if (!t) {
    t = _chestInnerTex[wood] = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped (0.8092)
  }
  const img = IMAGES[CHEST_WOODS[wood] + '_planks'];
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
   `half`: null for a single chest, or 'left' / 'right' for one half of a double (0.809) — seen from the
   front, 'left' is the half at local -X. A half reaches the shared edge, has no wall there, and draws the
   double chest's own sheets, so the pair reads as one wide chest with one cavity. */
function buildChestMesh(wood = 0, half = null) {
  const L = half === 'left', R = half === 'right', other = L ? 'right' : 'left';
  const tex = half
    ? { front: chestTexture(wood, `chest_double_front_${half}`, `chest_double_front_${half}_metal`),
        back:  chestTexture(wood, `chest_double_front_${other}`, null),
        top:   chestTexture(wood, `chest_double_top_${half}`, `chest_double_top_${half}_metal`),
        bottom: chestTexture(wood, `chest_double_bottom_${half}`, null) }
    : { front: chestTexture(wood, 'chest_front', 'chest_front_metal'),
        back:  chestTexture(wood, 'chest_side', 'chest_side_metal'),
        top:   chestTexture(wood, 'chest_top', 'chest_top_metal'),
        bottom: chestTexture(wood, 'chest_bottom', null) };
  const mats = [chestMat(tex.front), chestMat(tex.back), chestMat(chestTexture(wood, 'chest_side', 'chest_side_metal')),
                chestMat(tex.top), chestMat(tex.bottom), chestMat(chestInnerTexture(wood), 0.6)];
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

/* Chest as a held/dropped item: one shared prototype per wood, cloned per use so every copy shares the
   geometry and materials. Built lazily — IMAGES isn't populated when this file is parsed.
   buildChestMesh authors in cell-local 0..1 space; drops and hands expect the model centred on
   the origin, hence the offset. */
const _chestItemProto = [];
function chestItemNode(wood = 0) {
  if (!_chestItemProto[wood]) {
    const m = buildChestMesh(wood);
    m.group.position.set(-0.5, -0.5, -0.5);
    _chestItemProto[wood] = new THREE.Group();
    _chestItemProto[wood].add(m.group);
  }
  return _chestItemProto[wood].clone();
}

/* ---------------------------------- lifecycle ---------------------------------- */
/* Which half of a double chest this cell is, seen from the front: 'left' when its partner lies to the
   local +X (the viewer's right), 'right' when to the -X, null when single (0.809). */
function _chestHalf(x, y, z, facing) {
  const p = chestPartner(x, y, z);
  if (!p) return null;
  const ang = [0, Math.PI, Math.PI / 2, -Math.PI / 2][facing & 3];
  const rx = Math.round(Math.cos(ang)), rz = Math.round(-Math.sin(ang));   // local +X in the world
  return (p.x - x) * rx + (p.z - z) * rz > 0 ? 'left' : 'right';
}
function registerChest(x, y, z, facing) {
  const k = chestKey(x, y, z);
  let rec = CHESTS.get(k);
  if (!rec) { rec = mkChest(); CHESTS.set(k, rec); }
  if (rec.group) return rec;                          // mesh already built
  const va = (getBlock(x, y, z) >> 8) & 255;
  const half = _chestHalf(x, y, z, facing);
  const m = buildChestMesh(chestWoodOf(va), half);
  m.group.position.set(x, y, z);
  m.group.rotation.y = [0, Math.PI, Math.PI / 2, -Math.PI / 2][facing & 3];
  // rotating about the cell corner swings the body off its cell — shift it back
  const off = [[0, 0], [1, 1], [0, 1], [1, 0]][facing & 3];
  m.group.position.x += off[0];
  m.group.position.z += off[1];
  scene.add(m.group);
  Object.assign(rec, { group: m.group, lidPivot: m.lidPivot, mats: m.mats,
                       x, y, z, facing, lid: 0, lastB: -1 });
  return rec;
}
// a chest that became, or stopped being, half of a pair draws again as what it is now (0.809)
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

function chestPartner(x, y, z) {
  const val = getBlock(x, y, z);
  if ((val & 255) !== B.CHEST) return null;
  const va = (val >> 8) & 255;
  if (!(va & CHEST_PAIRED)) return null;
  const [dx, dz] = chestPairDirs(va & 3)[(va & CHEST_PAIR_NEG) ? 1 : 0];
  const nv = getBlock(x + dx, y, z + dz);
  if ((nv & 255) !== B.CHEST) return null;          // partner gone — fall back to a single chest
  return { x: x + dx, y, z: z + dz };
}

/* Called right after a chest block is placed. Links it to ONE unpaired same-facing neighbour and
   writes the link into both variant bytes. A neighbour that is already half of a double is
   skipped, so a single chest can never be claimed twice. */
function tryPairChest(x, y, z, facing) {
  const dirs = chestPairDirs(facing);
  for (let i = 0; i < 2; i++) {
    const [dx, dz] = dirs[i];
    const nv = getBlock(x + dx, y, z + dz);
    if ((nv & 255) !== B.CHEST) continue;
    const nva = (nv >> 8) & 255, va = (getBlock(x, y, z) >> 8) & 255;
    if ((nva & 3) !== facing || (nva & CHEST_PAIRED)) continue;
    if (chestWoodOf(nva) !== chestWoodOf(va)) continue;   // one wood per double chest (0.809)
    const wood = chestWoodOf(va) << CHEST_WOOD_SHIFT;     // kept through the pairing (0.809)
    const mine  = facing | CHEST_PAIRED | (i === 1 ? CHEST_PAIR_NEG : 0) | wood;
    const their = facing | CHEST_PAIRED | (i === 1 ? 0 : CHEST_PAIR_NEG) | wood;
    setBlock(x, y, z, B.CHEST | (mine << 8));
    setBlock(x + dx, y, z + dz, B.CHEST | (their << 8));
    rebuildChestMesh(x + dx, y, z + dz);                  // the neighbour turns into its half (0.809)
    return true;
  }
  return false;
}

/* A broken chest leaves its partner single again — otherwise the survivor keeps a paired bit
   pointing at an empty cell and chestPartner has to keep guessing. */
function unpairChestNeighbour(x, y, z, oldVal) {
  const va = (oldVal >> 8) & 255;
  if (!(va & CHEST_PAIRED)) return;
  const [dx, dz] = chestPairDirs(va & 3)[(va & CHEST_PAIR_NEG) ? 1 : 0];
  const nv = getBlock(x + dx, y, z + dz);
  if ((nv & 255) !== B.CHEST) return;
  const keep = ((nv >> 8) & 3) | (chestWoodOf((nv >> 8) & 255) << CHEST_WOOD_SHIFT);   // facing and wood (0.809)
  setBlock(x + dx, y, z + dz, B.CHEST | (keep << 8));
  rebuildChestMesh(x + dx, y, z + dz);                    // a whole chest again (0.809)
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
  unpairChestNeighbour(x, y, z, oldVal);
  const k = chestKey(x, y, z);
  const c = CHESTS.get(k);
  removeChestMesh(k);
  if (!c) return;
  if (!player.canFly)
    for (const s of c.slots)
      if (s) for (let n = 0; n < s.count; n++) spawnDrop(s.id, x, y, z);
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
  /* Structure loot is rolled on FIRST OPEN, not when the structure was stamped — a hundred
     untouched chests then cost nothing, and the contents feel rolled for you. */
  const ra = CHESTS.get(activeChest);
  if (ra) fillPendingLoot(a.x, a.y, a.z, ra.slots);
  if (b) { const rb = CHESTS.get(activeChest2); if (rb) fillPendingLoot(b.x, b.y, b.z, rb.slots); }
  // ONE sound for the whole chest, single or double — it's one lid action either way
  playSound('chestOpen', { gain: 0.8, pos: { x: a.x + 0.5, y: a.y + 0.5, z: a.z + 0.5 } });
  if (typeof fxPuff === 'function') {                // a dust puff from under the lid (0.803)
    fxPuff(a.x + 0.5, a.y + 0.9, a.z + 0.5, [0.8, 0.74, 0.62], 6);
    if (b) fxPuff(b.x + 0.5, b.y + 0.9, b.z + 0.5, [0.8, 0.74, 0.62], 6);
  }
  toggleInventory(true);
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
    if (!ch || !ch.data) { c.group.visible = false; continue; }
    if ((getBlock(c.x, c.y, c.z) & 255) !== B.CHEST) { removeChestMesh(k); continue; }
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
    const skyF = 0.24 + 0.76 * sky * sky;   // must track the chunk shader in 04-materials.js
    const sun = sharedUniforms.uAmbient.value + sharedUniforms.uDirect.value;
    const br = Math.min(1, skyF * sun * 0.92 + (bl * 0.45 + bl * bl * 0.85));
    if (Math.abs(br - c.lastB) > 0.02) {
      c.lastB = br;
      for (const mt of c.mats) mt.color.setScalar(br * (mt.userData.k ?? 1)).convertSRGBToLinear();   // the inside darker (0.809)
    }
  }
}

/* ---------------------------------- GUI ---------------------------------- */
// Rendered to the RIGHT of the inventory. A single chest is CHEST_ROWS x CHEST_COLS; a double
// stacks a second identical grid above it, giving the 14 x 5 the design calls for. The grid
// lives in a fixed-height scroller so a double chest can't run off the screen.
function buildChestPanel() {
  const panel = invPanel('chestPanel');
  if (!panel) return;
  const a = activeChest && CHESTS.get(activeChest);
  if (!a || invRightTab() !== 'chest') { panel.style.display = 'none'; return; }   // or another tab is up (0.795)
  const b = activeChest2 && CHESTS.get(activeChest2);
  panel.style.display = 'flex';
  panel.innerHTML = '';                                       // its tab names it (0.796; was a "Chest" title)
  addInvTabs(panel, 'chest');                                 // Chest / Equipment / Skill tree (0.795)
  const mkGrid = (arr, region) => {
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.dataset.region = region;
    for (let row = 0; row < CHEST_ROWS; row++) {       // row 0 renders at the bottom
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      for (let col = 0; col < CHEST_COLS; col++) {
        const div = document.createElement('div');
        div.className = 'slot';
        div.innerHTML = slotInner(arr[row * CHEST_COLS + col]);
        rowEl.appendChild(div);
      }
      grid.appendChild(rowEl);
    }
    return grid;
  };
  // 5 x 7 fits on screen outright, and a double is only 10 rows — no scroller needed
  if (b) panel.appendChild(mkGrid(b.slots, 'chest2'));      // partner sits above
  panel.appendChild(mkGrid(a.slots, 'chest'));
  // its own Sort under the slots (0.7571): both halves of a large chest sort as one
  if (typeof invButton === 'function') {
    const row = document.createElement('div');
    row.className = 'invActions';
    row.appendChild(invButton('Sort A-Z', 'Merge stacks and sort this chest by name', sortChest));
    // 0.7575: emptying the chest belongs on the chest — everything, or only what you already carry
    row.appendChild(invButton('Pull all', 'Take everything out of the chest', pullAll));
    row.appendChild(invButton('Quick stack', 'Take out only the items you already carry some of', quickStackToMe));
    panel.appendChild(row);
  }
}

/* ---------------------------------- save / load ---------------------------------- */
function serializeChests() {
  const out = [];
  for (const [k, c] of CHESTS) {
    if (!c.slots.some(s => s)) continue;               // skip empties, they rebuild from the block
    out.push([k, c.slots.map(s => s ? [s.id, s.count, s.dur ?? null, s.fresh ?? null, s.wm ? 1 : 0] : null),
              { t: c.spoilT ?? null, s: c.saltT || 0 }]);   // the world-clock time it last spoiled, its salt timer (0.8099)
  }
  return out;
}
function restoreChests(list) {
  if (!Array.isArray(list)) return;
  for (const rec of list) {
    if (!Array.isArray(rec) || typeof rec[0] !== 'string') continue;
    const c = mkChest();
    const arr = Array.isArray(rec[1]) ? rec[1] : [];
    for (let i = 0; i < CHEST_SLOTS && i < arr.length; i++) {
      const s = arr[i];
      if (!Array.isArray(s)) continue;
      const [raw, count, dur, fresh, wm] = s;
      const id = legacyItemId(raw);               // stone brick is a variant of stone since 0.794
      if (!(PROPS[id] || ITEM_PROPS[id])) continue;
      const slot = mkSlot(id, Math.max(1, count | 0));
      if (dur != null) slot.dur = dur;
      if (fresh != null) slot.fresh = fresh;      // 0.789
      if (wm) slot.wm = 1;                        // 0.79
      c.slots[i] = slot;
    }
    const meta = rec[2] && typeof rec[2] === 'object' ? rec[2] : null;   // 0.8099
    if (meta && typeof meta.t === 'number') c.spoilT = meta.t;
    if (meta && typeof meta.s === 'number') c.saltT = meta.s;
    CHESTS.set(rec[0], c);
  }
}
