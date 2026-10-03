'use strict';
/* voxiGrof — bed: 2-cell block (1 wide × 1/2 tall × 2 long), right-click to sleep the night away.

   Like the door, the chunk mesher emits NOTHING for bed cells — each bed is a single three.js
   mesh (mattress, frame and four legs) built here. The voxel cells still exist for collision and
   raycast so you can stand on it and mine it.

   variant byte: bits 0-1 facing (0:+Z 1:-Z 2:+X 3:-X), bit 3 (8) = this cell is the HEAD,
   bits 4-5 the frame's wood (0.8342, BED_WOOD_SHIFT; 0 oak, as every older bed is).
   The FOOT cell owns the mesh; the head is registered from it via the facing offset. */

const BEDS = new Map();            // "x,y,z" of the FOOT cell -> {group, x, y, z, facing, wood, colors, mats, lastB}
const BED_H = 0.5;                 // 64 of the art's 128 px a block (0.8342; 9/16 before)

// facing -> unit vector from the FOOT cell toward the HEAD cell
const BED_DIR = [[0, 1], [0, -1], [1, 0], [-1, 0]];   // 0:+Z 1:-Z 2:+X 3:-X

/* ---------------------------------- textures (0.8342) ----------------------------------
   Four grey sheets in textures/Blocks/Interactables/Bed, one per part so each takes its own colour: the frame
   (tinted by its wood's planks, as the chest is), the blanket, the sheet folded back at the head, and the pillow.
   Every sheet has the same layout, 128 px a block, 512 x 192:
     y   0-127  the top (x 0-255) and the underside (x 256-511): 2 blocks long (foot at x 0) by 1 wide
     y 128-191  a long side (x 0-255, foot at x 0), the head end (x 256-383), the foot end (x 384-511)
   On the sides and ends the mattress is the top 32 rows, the frame's rail the next 14 and the legs the last 18.
   The parts never overlap, so they are laid into one texture per wood and colour set. */
const BED_SHEET_W = 512, BED_SHEET_H = 192, BED_PX = 128;
/* The raised pillow (0.8343): a little box on the mattress at the head, BED_PILLOW_H tall, its footprint the pillow on
   the top art. Its sides wear the pillow's strips from the side and head art, which move off the mattress into rows
   192+ of the bed's texture (BED_TEX_H), and the sheet under them closes the gap they leave. Measured from
   bed_pillow.png ([x, y, w, h] on the sheet; the top's x runs along the bed): move these if the pillow art moves. */
const BED_PILLOW_H = 12 / BED_PX;
const BED_PILLOW_R = 9 / BED_PX, BED_PILLOW_RV = 4 / BED_PX;   // its rounded corners and top edge, as drawn (0.8346)
const BED_PILLOW_TOP = [204, 14, 44, 100];
const BED_PILLOW_SIDE = [200, 130, 52, 18], BED_PILLOW_HEAD = [264, 130, 112, 18];
/* Where they go in the bed's texture. The top too (0.8344): taken from the bed's top it brought the sheet round the
   pillow's rounded corners up onto the raised box, so the box top has the pillow's own pixels only, corners clear. */
const BED_PILLOW_OUT = { side: [0, 192], head: [64, 192], top: [192, 192] };
const BED_TEX_H = 320;
const BED_LEG_H = 18 / BED_PX, BED_LEG_W = 16 / BED_PX;
const BED_PARTS = ['bed_frame', 'bed_blanket', 'bed_sheet', 'bed_pillow'];
const BED_WOODS = ['oak', 'birch', 'spruce'];             // the variant bar's woods (46-variants.js), as the chest's
const BED_WOOD_SHIFT = 4;
const bedWoodOf = (va) => { const w = (va >> BED_WOOD_SHIFT) & 3; return w < BED_WOODS.length ? w : 0; };
/* The bedding's colours, sRGB hex. Every bed takes this set until colours come in (a later dye update): the whole
   pipeline already takes any set per bed (bedTexture, setBedLook). */
const BED_COLORS_DEFAULT = { blanket: 0xe9e4da, sheet: 0xf7f6f2, pillow: 0xffffff };

// the mean colour (0..1) of an image's opaque pixels, from row y0 down (the frame: its sides only, see _bedTint)
function _bedMean(img, y0 = 0) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, y0, c.width, c.height - y0).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  return n ? [r / n / 255, gg / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
}
/* A part's tint: the colour it should average out to over its grey's own mean, per pixel then (it may brighten,
   so the grey art's shading survives under a light colour). The frame's colour is its wood's planks, matched on
   the sides and ends you see: its big dark underside pulled the mean down and washed the rails out pale. */
const _bedGrey = {};
function _bedTint(part, rgb) {
  const m = _bedGrey[part] || (_bedGrey[part] = _bedMean(IMAGES[part], part === 'bed_frame' ? 128 : 0));
  const l = Math.max(0.05, (m[0] + m[1] + m[2]) / 3);
  return rgb.map(v => v / l);
}
const _hexRgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const _bedWoodRgb = [];
const bedWoodRgb = (wood) => _bedWoodRgb[wood] || (_bedWoodRgb[wood] = _bedMean(IMAGES[BED_WOODS[wood] + '_planks']));

/* One texture per wood and colour set, the four parts laid together. Never cached blank (see chestTexture,
   30-chest.js): one built before its art arrived fills in place the moment IMAGES has it (updateBed asks). */
const _bedTexCache = {};
const bedArtReady = (wood = 0) => BED_PARTS.every(n => IMAGES[n]) && !!IMAGES[BED_WOODS[wood] + '_planks'];
function bedTexture(wood = 0, colors = BED_COLORS_DEFAULT) {
  const key = wood + ':' + colors.blanket + ':' + colors.sheet + ':' + colors.pillow;
  let t = _bedTexCache[key];
  if (!t) {
    t = _bedTexCache[key] = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped (0.8092)
  }
  if (!t.image && bedArtReady(wood)) {
    const W = BED_SHEET_W, H = BED_SHEET_H;
    const c = document.createElement('canvas'); c.width = W; c.height = BED_TEX_H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    const out = g.createImageData(W, BED_TEX_H), o = out.data;
    const rgb = { bed_frame: bedWoodRgb(wood), bed_blanket: _hexRgb(colors.blanket),
                  bed_sheet: _hexRgb(colors.sheet), bed_pillow: _hexRgb(colors.pillow) };
    const inRect = (x, y, r) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
    for (const part of BED_PARTS) {
      g.clearRect(0, 0, W, BED_TEX_H);
      g.drawImage(IMAGES[part], 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, [r, gg, b] = _bedTint(part, rgb[part]);
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        let j = i;
        // the pillow's strips on a side and the head end go to its raised box's own rows (0.8343)
        if (part === 'bed_pillow' && i >= W * 128 * 4) {
          const x = (i >> 2) % W, y = ((i >> 2) / W) | 0;
          const m = inRect(x, y, BED_PILLOW_SIDE) ? [BED_PILLOW_SIDE, BED_PILLOW_OUT.side]
                  : inRect(x, y, BED_PILLOW_HEAD) ? [BED_PILLOW_HEAD, BED_PILLOW_OUT.head] : null;
          if (m) j = ((m[1][1] + y - m[0][1]) * W + m[1][0] + x - m[0][0]) * 4;
        }
        o[j] = Math.min(255, d[i] * r); o[j + 1] = Math.min(255, d[i + 1] * gg); o[j + 2] = Math.min(255, d[i + 2] * b);
        o[j + 3] = d[i + 3];
        // the pillow on the top is ALSO copied, alone, for the raised box's top (0.8344)
        if (part === 'bed_pillow' && i < W * 128 * 4) {
          const x = (i >> 2) % W, y = ((i >> 2) / W) | 0;
          if (inRect(x, y, BED_PILLOW_TOP)) {
            const k = ((BED_PILLOW_OUT.top[1] + y - BED_PILLOW_TOP[1]) * W + BED_PILLOW_OUT.top[0] + x - BED_PILLOW_TOP[0]) * 4;
            o[k] = o[i]; o[k + 1] = o[i + 1]; o[k + 2] = o[i + 2]; o[k + 3] = o[i + 3];
          }
        }
      }
    }
    /* The raised box must be solid (0.8345): the art's rounded corners left clear pixels on its top and its strips,
       and through them you saw into the box, holes at every edge. Each clear pixel there takes the nearest pillow one. */
    for (const [ox, oy, w, h] of [[...BED_PILLOW_OUT.top, BED_PILLOW_TOP[2], BED_PILLOW_TOP[3]],
                                  [...BED_PILLOW_OUT.side, BED_PILLOW_SIDE[2], BED_PILLOW_SIDE[3]],
                                  [...BED_PILLOW_OUT.head, BED_PILLOW_HEAD[2], BED_PILLOW_HEAD[3]]]) {
      const at = (x, y) => ((oy + y) * W + ox + x) * 4;
      const art = new Uint8Array(w * h);                           // which pixels the art itself filled
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) art[x + y * w] = o[at(x, y) + 3] ? 1 : 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (art[x + y * w]) continue;
          let src = -1;
          for (let r = 1; r < Math.max(w, h) && src < 0; r++)       // rings outward: the nearest pixel of the art
            for (let dy = -r; dy <= r && src < 0; dy++)
              for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const sx = x + dx, sy = y + dy;
                if (sx >= 0 && sy >= 0 && sx < w && sy < h && art[sx + sy * w]) { src = at(sx, sy); break; }
              }
          if (src >= 0) { const k = at(x, y); o[k] = o[src]; o[k + 1] = o[src + 1]; o[k + 2] = o[src + 2]; o[k + 3] = 255; }
        }
    }
    // ...and the gap they leave on the mattress is closed with the sheet below them, row for row (its rows 20-31)
    for (const rc of [BED_PILLOW_SIDE, BED_PILLOW_HEAD]) {
      const below = rc[1] + rc[3], span = 160 - below;            // 160: the mattress's last row + 1
      for (let y = rc[1]; y < below; y++)
        for (let x = rc[0]; x < rc[0] + rc[2]; x++) {
          const i = (y * W + x) * 4;
          if (o[i + 3]) continue;
          const s = ((below + (y - rc[1]) % span) * W + x) * 4;
          o[i] = o[s]; o[i + 1] = o[s + 1]; o[i + 2] = o[s + 2]; o[i + 3] = o[s + 3];
        }
    }
    g.putImageData(out, 0, 0);
    t.image = c;
    t.needsUpdate = true;
  }
  return t;
}

/* ---------------------------------- the model (0.8342) ----------------------------------
   Authored lying along +Z, the FOOT at z=0 and the HEAD at z=2, x 0..1 across, on the foot cell's corner: the
   mattress and rail as one box from the legs' top up to BED_H, the four legs under its corners and the pillow on
   top at the head (0.8343). Every face
   finds its own pixels on the sheet from where it sits on the bed, so a leg shows the leg in the art. */
function _bedGeometry() {
  const pos = [], uv = [], idx = [];
  const row = (y) => 128 + (BED_H - y) * BED_PX;              // side and end rows: the top of the bed is row 128
  // a face's pixel for a point on it, by which way it faces
  const PX = {
    top:    (p) => [p[2] * BED_PX, p[0] * BED_PX],
    bottom: (p) => [256 + p[2] * BED_PX, p[0] * BED_PX],
    side:   (p) => [p[2] * BED_PX, row(p[1])],                 // both long sides: the head end is the pillow's
    head:   (p) => [256 + p[0] * BED_PX, row(p[1])],
    foot:   (p) => [384 + (1 - p[0]) * BED_PX, row(p[1])],     // seen from the foot, not mirrored
  };
  // one quad, wound to face `n` (an outward direction), its UVs from where its corners sit
  const quad = (pts, n, px) => {
    const [a, b, c] = pts;
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const dot = (e[1] * f[2] - e[2] * f[1]) * n[0] + (e[2] * f[0] - e[0] * f[2]) * n[1] + (e[0] * f[1] - e[1] * f[0]) * n[2];
    if (dot < 0) pts = [pts[0], pts[3], pts[2], pts[1]];
    const base = pos.length / 3;
    for (const p of pts) { pos.push(p[0], p[1], p[2]); const q = px(p); uv.push(q[0] / BED_SHEET_W, 1 - q[1] / BED_TEX_H); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // ...and one triangle the same way (the pillow's rounded top, 0.8346)
  const tri = (pts, n, px) => {
    const [a, b, c] = pts;
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const dot = (e[1] * f[2] - e[2] * f[1]) * n[0] + (e[2] * f[0] - e[0] * f[2]) * n[1] + (e[0] * f[1] - e[1] * f[0]) * n[2];
    if (dot < 0) pts = [pts[0], pts[2], pts[1]];
    const base = pos.length / 3;
    for (const p of pts) { pos.push(p[0], p[1], p[2]); const q = px(p); uv.push(q[0] / BED_SHEET_W, 1 - q[1] / BED_TEX_H); }
    idx.push(base, base + 1, base + 2);
  };
  const box = (x0, y0, z0, x1, y1, z1, top) => {
    if (top) quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], PX.top);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], PX.bottom);
    quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], PX.side);
    quad([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], PX.side);
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], PX.head);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], PX.foot);
  };
  box(0, BED_LEG_H, 0, 1, BED_H, 2, true);                       // mattress and rail
  const L = BED_LEG_W;
  for (const [x0, z0] of [[0, 0], [1 - L, 0], [0, 2 - L], [1 - L, 2 - L]]) box(x0, 0, z0, x0 + L, BED_LEG_H, z0 + L, false);
  /* The raised pillow (0.8343): its top the pillow on the top art, its sides and ends its strips (BED_PILLOW_OUT).
     Rounded in its geometry since 0.8346, as the art draws it: the corners on BED_PILLOW_R and the top edge on
     BED_PILLOW_RV, so its texture can stay solid (0.8345) and nothing shows through. Rings go round it from the bottom
     up, each a rounded rectangle drawn a little further in over the top edge, and the top is a fan inside the last. */
  const PT = BED_PILLOW_TOP, S = BED_PILLOW_SIDE, E = BED_PILLOW_HEAD, O = BED_PILLOW_OUT;
  const x0 = PT[1] / BED_PX, x1 = (PT[1] + PT[3]) / BED_PX, z0 = PT[0] / BED_PX, z1 = (PT[0] + PT[2]) / BED_PX;
  const y0 = BED_H, y1 = BED_H + BED_PILLOW_H;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, RC = BED_PILLOW_R, RV = BED_PILLOW_RV, SEG = 3;
  const along = (p) => (p[2] - z0) / (z1 - z0), across = (p) => (p[0] - x0) / (x1 - x0);
  const strip = (out, rc, f) => (p) => [out[0] + f(p) * rc[2], out[1] + (y1 - p[1]) / BED_PILLOW_H * rc[3]];
  // the pillow alone (BED_PILLOW_OUT.top), laid as on the bed's top, x along the bed and y across (0.8344)
  const topPx = (p) => [O.top[0] + p[2] * BED_PX - PT[0], O.top[1] + p[0] * BED_PX - PT[1]];
  // one ring at height y, `ins` in from the footprint: the corner arcs keep their centres, their radius shrinks
  const ring = (y, ins) => {
    const pts = [];
    for (const [ox, oz, q] of [[x1 - RC, z1 - RC, 0], [x0 + RC, z1 - RC, 1], [x0 + RC, z0 + RC, 2], [x1 - RC, z0 + RC, 3]])
      for (let s = 0; s <= SEG; s++) {
        const a = (q + s / SEG) * Math.PI / 2;
        pts.push([ox + Math.cos(a) * (RC - ins), y, oz + Math.sin(a) * (RC - ins)]);
      }
    return pts;
  };
  const rings = [ring(y0, 0), ring(y1 - RV, 0)];
  for (const a of [Math.PI / 4, Math.PI / 2]) rings.push(ring(y1 - RV + Math.sin(a) * RV, RV * (1 - Math.cos(a))));
  const N = rings[0].length;
  for (let r = 0; r + 1 < rings.length; r++)
    for (let k = 0; k < N; k++) {
      const a = rings[r][k], b = rings[r][(k + 1) % N];
      // this piece's outward way in plan: square to its own edge, turned away from the middle
      let nx = b[2] - a[2], nz = a[0] - b[0];
      if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[2] + b[2]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
      // the upright band wears the strip of the side it faces; the rounded top edge the top, seen from above
      const px = r > 0 ? topPx
               : Math.abs(nx) >= Math.abs(nz) ? strip(O.side, S, along)
               : nz > 0 ? strip(O.head, E, across) : strip(O.head, E, (p) => 1 - across(p));
      quad([a, b, rings[r + 1][(k + 1) % N], rings[r + 1][k]], [nx, r > 0 ? 0.8 : 0, nz], px);
    }
  const top = rings[rings.length - 1], mid = [cx, y1, cz];
  for (let k = 0; k < N; k++) tri([mid, top[k], top[(k + 1) % N]], [0, 1, 0], topPx);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
// the bed's mesh in a wood and a colour set: one geometry, one material
function bedMesh(wood = 0, colors = BED_COLORS_DEFAULT) {
  const mat = new THREE.MeshBasicMaterial({ map: bedTexture(wood, colors), transparent: true, alphaTest: 0.5 });
  return { mesh: new THREE.Mesh(_bedGeometry(), mat), mats: [mat] };
}

/* Bed as a held/dropped item — the real model, as the chest. One shared prototype per wood cloned per use; built
   lazily because IMAGES is empty at parse time. The model is 1 x BED_H x 2 anchored at the foot corner, so it is
   shifted to sit centred on the origin the way drop/hand geometry expects. */
const _bedItemProto = [];
function bedItemNode(wood = 0) {
  bedTexture(wood);                              // fills the shared texture in place if its art came late
  if (!_bedItemProto[wood]) {
    const inner = new THREE.Group();
    inner.add(bedMesh(wood).mesh);
    inner.position.set(-0.5, -BED_H / 2, -1);
    _bedItemProto[wood] = new THREE.Group();
    _bedItemProto[wood].add(inner);
    _bedItemProto[wood].scale.setScalar(0.62);   // 2 cells long — shrink so it reads in the hand
  }
  return _bedItemProto[wood].clone();
}

/* ---------------------------------- lifecycle ---------------------------------- */
const bedKey = (x, y, z) => x + ',' + y + ',' + z;

// Register from the FOOT cell. facing points foot -> head; wood (0.8342) is read from the cell when not given.
function registerBed(x, y, z, facing, wood = null) {
  const k = bedKey(x, y, z);
  if (BEDS.has(k)) return;
  if (wood == null) wood = bedWoodOf((getBlock(x, y, z) >> 8) & 255);
  const group = new THREE.Group();
  const colors = BED_COLORS_DEFAULT;
  const m = bedMesh(wood, colors);
  group.add(m.mesh);
  // geometry is authored along +Z; rotate the whole group onto the actual facing
  group.position.set(x, y, z);
  group.rotation.y = [0, Math.PI, Math.PI / 2, -Math.PI / 2][facing & 3];
  // Rotating about the cell corner swings the body off its cells, so shift it back.
  // Ry maps local (x,z) -> (x·cosθ + z·sinθ, −x·sinθ + z·cosθ); solving each facing for
  // "box must cover the foot cell and the head cell" gives these offsets.
  const off = [[0, 0], [1, 1], [0, 1], [1, 0]][facing & 3];
  group.position.x += off[0];
  group.position.z += off[1];
  scene.add(group);
  BEDS.set(k, { group, x, y, z, facing, wood, colors, mats: m.mats, lastB: -1 });
}
// a bed's wood or bedding changed: the same material takes the other texture (0.8342; colours: the dye update's hook)
function setBedLook(k, wood, colors) {
  const b = BEDS.get(k);
  if (!b) return;
  if (wood != null) b.wood = wood;
  if (colors) b.colors = colors;
  for (const mt of b.mats) { mt.map = bedTexture(b.wood, b.colors); mt.needsUpdate = true; }
}

function removeBedMesh(k) {
  const b = BEDS.get(k);
  if (!b) return;
  scene.remove(b.group);
  for (const c of b.group.children) c.geometry.dispose();
  for (const mt of b.mats) mt.dispose();
  BEDS.delete(k);
}
/* Loading another world takes every bed with it, so nobody may be left flagged as lying in one —
   a stale `sleepingAt` would pin that player in place forever with no bed to get out of. */
function clearBeds() {
  for (const k of [...BEDS.keys()]) removeBedMesh(k);
  BEDS.clear();
  for (const p of PLAYERS) p.sleepingAt = null;
  _sleeping = false;
  _lapse = null;                              // 0.8323
  _sleepFade = 0;
  _sleepEl.style.display = 'none';
}

// the FOOT cell of the bed that owns (x,y,z), or null
function bedFootOf(x, y, z) {
  const val = getBlock(x, y, z);
  if ((val & 255) !== B.BED) return null;
  const varb = (val >> 8) & 255;
  if (!(varb & 8)) return { x, y, z, facing: varb & 3 };     // already the foot
  const d = BED_DIR[varb & 3];
  const fx = x - d[0], fz = z - d[1];
  if ((getBlock(fx, y, fz) & 255) !== B.BED) return null;
  return { x: fx, y, z: fz, facing: varb & 3 };
}

// one half broken/replaced: drop the mesh and take the other half with it
function bedBroken(x, y, z, oldVal) {
  const varb = (oldVal >> 8) & 255;
  const d = BED_DIR[varb & 3];
  const isHead = (varb & 8) !== 0;
  const fx = isHead ? x - d[0] : x;
  const fz = isHead ? z - d[1] : z;
  releaseBedSpawns(bedKey(fx, y, fz));
  removeBedMesh(bedKey(fx, y, fz));
  const ox = isHead ? x - d[0] : x + d[0];
  const oz = isHead ? z - d[1] : z + d[1];
  if ((getBlock(ox, y, oz) & 255) === B.BED) setBlock(ox, y, oz, B.AIR);
}

/* ---------------------------------- placement ---------------------------------- */
// Called from doPlace. Needs two free cells on solid ground; lays the foot under the player
// and the head one cell further along the facing.
// bits (0.8342): the variant bar's pick, the frame's wood (BED_WOOD_SHIFT)
function tryPlaceBed(px, py, pz, bits = 0) {
  // Facing points foot -> head, and the bed reads correctly when the head lands on the player's
  // side — same block-toward-player convention the door and chest use. Measuring player -> block
  // instead put the whole bed the other way round.
  const ddx = player.pos.x - (px + 0.5), ddz = player.pos.z - (pz + 0.5);
  const facing = Math.abs(ddx) > Math.abs(ddz) ? (ddx > 0 ? 2 : 3) : (ddz > 0 ? 0 : 1);
  const d = BED_DIR[facing];
  const hx = px + d[0], hz = pz + d[1];
  // grass counts as free for BOTH cells — checked before anything is written, so a bed never
  // mows one cell of grass and then bails because the other end was blocked
  const free = (x, z) => isPlaceableInto(getBlock(x, py, z) & 255) && isSolid(x, py - 1, z);
  if (!free(px, pz) || !free(hx, hz)) { toast('no room for the bed'); return false; }
  clearPlantAt(px, py, pz);
  clearPlantAt(hx, py, hz);
  const wood = bedWoodOf(bits), wb = wood << BED_WOOD_SHIFT;
  setBlock(px, py, pz, B.BED | ((facing | wb) << 8));
  setBlock(hx, py, hz, B.BED | ((facing | 8 | wb) << 8));
  registerBed(px, py, pz, facing, wood);
  return true;
}

/* ---------------------------------- sleeping ---------------------------------- */
// night runs from dusk to dawn: the day's own sunset and sunrise since 0.818 (sunTimes, 07-sky.js)
const BED_NIGHT_EARLY = 0.02;      // a bed takes you this long (in worldTime) before sunset; 0.48 was fixed
const BED_WAKE_TIME = 0.005;       // just after sunrise
/* Sleeping skips the world's clock, so it is a WORLD action even though one person does it: the
   fade covers the whole screen and everyone wakes to the same morning. `_sleeper` remembers who
   climbed in, because the rest and the respawn point are theirs alone. */
let _sleepFade = 0, _sleeping = false, _sleeper = null;
let _lapse = null;                  // the night's time-lapse while it runs: { left, total, t } (0.8323)
const SLEEP_LAPSE_S = 10;           // real seconds a night takes in bed (0.8323)

const _sleepEl = document.createElement('div');
_sleepEl.id = 'sleepOverlay';
Object.assign(_sleepEl.style, {
  // a vignette since 0.8323 (it was solid black): the night's sky runs past in the middle while you sleep
  position: 'fixed', inset: '0', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 35%, rgba(0,0,0,0.9) 100%)', opacity: '0',
  pointerEvents: 'none', zIndex: '20', transition: 'none', display: 'none',
});
document.body.appendChild(_sleepEl);

const isNightForSleep = () => isDarkTime(worldTime, BED_NIGHT_EARLY);

/* ---- lying down (0.7294) ----
   Getting into bed is a STATE now, not an instant fade to dawn. The player is laid out on the
   mattress, their body visible to everyone else doing the same, and they stay there until they
   sneak back out. A bed holds ONE person: `occupant` is why the second player to try a bed is
   turned away rather than sharing it, which is what makes "everyone needs their own bed" a real
   requirement rather than a suggestion.

   The night only passes once EVERY spawned player is in a bed — see updateBed. */
const bedOccupant = (rec) => (rec && rec.occupant && rec.occupant.sleepingAt) ? rec.occupant : null;
const isSleeping = (p) => !!(p && p.sleepingAt);

// where on the bed a sleeper's body goes: the midpoint of the two cells, up on the mattress
function bedRestPose(foot) {
  const d = BED_DIR[foot.facing & 3];
  return { x: foot.x + 0.5 + d[0] * 0.5, y: foot.y + BED_H, z: foot.z + 0.5 + d[1] * 0.5,
           yaw: Math.atan2(d[0], d[1]) };          // head end is the direction they face
}

// right-click a bed: lie down on it and make it your respawn point
function trySleep(x, y, z) {
  const foot = bedFootOf(x, y, z);
  if (!foot) return false;
  if (isSleeping(player)) return true;
  if (!isNightForSleep()) { toast('you can only sleep at night'); return true; }
  const dx = player.pos.x - (x + 0.5), dz = player.pos.z - (z + 0.5);
  if (dx * dx + dz * dz > 25) { toast('bed is too far away'); return true; }
  const rec = BEDS.get(bedKey(foot.x, foot.y, foot.z));
  const taken = bedOccupant(rec);
  if (taken && taken !== player) { toast(`${playerLabel(taken)} is already in this bed`); return true; }

  const pose = bedRestPose(foot);
  player.sleepingAt = { x: foot.x, y: foot.y, z: foot.z, facing: foot.facing, key: bedKey(foot.x, foot.y, foot.z) };
  player.pos.set(pose.x, pose.y, pose.z);
  player.yaw = pose.yaw;
  player.pitch = -0.55;                            // looking up at the ceiling
  player.vy = 0; player.flying = false; player.fast = false; player.sneaking = false;
  /* Lying down switches you to third person (0.7341) so you can actually see yourself on the
     mattress — the whole point of the pose. Look is untouched: the mouse still turns the head
     freely, it is only walking that is gated. The view you were using is remembered and handed
     back when you get up. */
  if (typeof camView !== 'undefined') {
    player._camViewBeforeBed = camView;
    camView = 1;                                   // over the shoulder
  }
  if (rec) rec.occupant = player;
  /* Sleeping here makes this your respawn point, and the bed is REMEMBERED (0.7341) — break it
     and you go back to where the world first put you, rather than respawning at a bed that is no
     longer there. `homeSpawn` is that original point, captured the first time anyone spawns. */
  if (!player.homeSpawn) player.homeSpawn = (player.spawnPos || player.pos).clone();
  player.spawnPos = new THREE.Vector3(foot.x + 0.5, y, foot.z + 0.5);
  player.spawnBedKey = bedKey(foot.x, foot.y, foot.z);
  toast('respawn point set');
  const waiting = PLAYERS.filter(p => p.spawned && !isSleeping(p)).length;
  if (waiting) toast(waiting === 1 ? 'waiting for 1 more player to sleep'
                                   : `waiting for ${waiting} more players to sleep`);
  else toast('sneak to get up');
  return true;
}

/* Anyone whose respawn point was THIS bed goes back to their original spawn (0.7341). Called
   before the mesh goes, from bedBroken — so breaking a bed you slept in tells you so rather than
   silently respawning you at a gap in the floor later. */
function releaseBedSpawns(key) {
  for (const p of PLAYERS) {
    if (p.spawnBedKey !== key) continue;
    p.spawnBedKey = null;
    p.spawnPos = p.homeSpawn ? p.homeSpawn.clone() : null;
    // only tell the player it happened to — everyone else's bed is none of their business
    withPlayer(p, () => toast('bed broken — respawn point reset'));
  }
}

/* Get up. Steps off to the side of the bed so nobody wakes inside the frame, and releases the
   bed for whoever wants it next. */
function leaveBed(p = player) {
  const s = p.sleepingAt;
  if (!s) return;
  p.sleepingAt = null;
  // hand back whatever view they were using before they lay down
  if (p._camViewBeforeBed != null) {
    const back = p._camViewBeforeBed;
    p._camViewBeforeBed = null;
    withPlayer(p, () => { camView = back; });
  }
  const rec = BEDS.get(s.key);
  if (rec && rec.occupant === p) rec.occupant = null;
  // sidestep perpendicular to the bed, falling back to the foot cell if that is walled in
  const d = BED_DIR[s.facing & 3];
  const side = [-d[1], d[0]];
  const tx = s.x + 0.5 + side[0], tz = s.z + 0.5 + side[1];
  if (typeof isSolid === 'function' && !isSolid(Math.floor(tx), s.y, Math.floor(tz)))
    p.pos.set(tx, s.y, tz);
  else p.pos.set(s.x + 0.5, s.y + 1, s.z + 0.5);
  p.vy = 0;
}

// fade to black, jump the clock, fade back in
function updateBed(dt) {
  for (const [k, b] of BEDS) {
    const c = getChunk(Math.floor(b.x / 16), Math.floor(b.z / 16));
    if (!c || !c.data) { b.group.visible = false; continue; }
    const bv = getBlock(b.x, b.y, b.z);
    if ((bv & 255) !== B.BED) { removeBedMesh(k); continue; }
    b.group.visible = true;
    // the cell's wood (a bed registered before its chunk was in reads oak), and art that arrived late (0.8342)
    const w = bedWoodOf((bv >> 8) & 255);
    if (w !== b.wood) setBedLook(k, w, null);
    else if (!b.mats[0].map.image) bedTexture(b.wood, b.colors);
    // tint by world light at the bed cell (same approximation the doors use)
    const bl = getLightWorld(b.x, b.y, b.z) / 15;
    const sky = getSkyWorld(b.x, b.y, b.z) / 15;
    const skyF = 0.276 + 0.724 * sky * sky;   // must track the chunk shader in 04-materials.js (0.8242)
    const sun = sharedUniforms.uAmbient.value + sharedUniforms.uDirect.value;
    const br = Math.min(1, skyF * sun * 0.92 + (bl * 0.45 + bl * bl * 0.85));
    if (Math.abs(br - b.lastB) > 0.02) {
      b.lastB = br;
      for (const mt of b.mats) mt.color.setScalar(br).convertSRGBToLinear();
    }
  }

  /* Somebody has to still be in bed for the sleepers' beds to hold them: a bed broken out from
     under a sleeper leaves them lying in mid-air otherwise. */
  for (const p of PLAYERS) {
    const s = p.sleepingAt;
    if (s && (getBlock(s.x, s.y, s.z) & 255) !== B.BED) leaveBed(p);
  }

  /* The night passes only when EVERY spawned player is in a bed — which is the whole reason a bed
     can only hold one person. Solo that is the single sleeper and nothing has changed. */
  const live = PLAYERS.filter(p => p.spawned);
  const allIn = live.length > 0 && live.every(isSleeping);
  /* THE NIGHT AS A TIME-LAPSE (0.8323; it was a fade to black and a jump to dawn). Once everyone is in bed at night the
     screen dims to a vignette and the clock runs on to sunrise over SLEEP_LAPSE_S real seconds, easing in and out — the
     sun, moon and stars wheel over the sky — and everyone wakes rested at dawn. Somebody getting up stops it where it
     is (the night carries on from there, nobody rested). Furnaces smelt through the hours as they pass. */
  if (!_lapse && allIn && isNightForSleep()) {
    const rise = Math.max(0, sunTimes().rise) + BED_WAKE_TIME;
    const left = ((rise - worldTime) % 1 + 1) % 1;            // in days, to the coming sunrise
    if (left > 1e-4) _lapse = { left, total: left, t: 0 };
  }
  if (_lapse && !allIn) _lapse = null;
  _sleeping = !!_lapse;
  if (!_lapse) {
    if (_sleepFade > 0) {                       // fading back in after waking
      _sleepFade = Math.max(0, _sleepFade - dt * 1.2);
      _sleepEl.style.opacity = _sleepFade.toFixed(3);
      if (_sleepFade <= 0) _sleepEl.style.display = 'none';
    }
    return;
  }
  _sleepEl.style.display = '';
  _sleepFade = Math.min(1, _sleepFade + dt * 1.2);
  _sleepEl.style.opacity = _sleepFade.toFixed(3);
  // the clock's pace: a smooth bump (half a sine) over the whole lapse, so it eases in and out of the fast run
  _lapse.t += dt;
  const u = Math.min(1, _lapse.t / SLEEP_LAPSE_S), pace = Math.PI / 2 * Math.sin(Math.PI * u);
  const step = Math.min(_lapse.left, _lapse.total * pace * dt / SLEEP_LAPSE_S + (u >= 1 ? _lapse.left : 0));
  _lapse.left -= step;
  worldTime += step;
  if (worldTime >= 1) { worldTime -= 1; worldDay++; }        // the day count turns over at 06:00 (0.818)
  if (typeof furnaceCatchUp === 'function') furnaceCatchUp(step * DAY_LEN);
  if (_lapse.left <= 1e-6) {
    // a night's rest: energy full (the rest banked as over-energy), a little health; it costs a little food, thirst,
    // fruit, vegetables and protein, never below 10 (0.8321, wakeRested in 54)
    for (const p of live) wakeRested(p);
    /* Nobody is stood up (0.7341): they stay lying, and the vignette fades back out over the sleeper still on the
       mattress. Sneak is what gets you up. */
    _lapse = null;
    _sleeping = false;
    toast('Good morning');
  }
}
