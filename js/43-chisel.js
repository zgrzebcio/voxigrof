'use strict';
/* voxiGrof — the chisel (0.78)

   A tool worn in the equipment's Others slot (accessories). While it is worn, holding Q — or holding B
   on a gamepad, where a TAP of B still opens the inventory — opens a radial of block SHAPES above the
   hotbar: aim with the mouse or the right stick and let go to pick one. The picked shape shows in a
   slot just right of the hotbar.

   CHISEL_PAGES is what the radial draws, one ring per page (0.7892), so a new shape is one entry on
   one of those pages. Entries marked `soon` (0.7845) are shapes still in development: the radial
   names them, but they cannot be picked.

   Previews are built from each shape's boxes (in sixteenths of a block), white with black edges, and
   photographed through the same offscreen icon renderer as block icons (_renderIconScene, 05-icons.js).
   Every shape that is not `soon` places since 0.784. */

/* PAGES (0.7892). The radial holds more shapes than one ring can carry without the slices getting
   too thin to aim at, so the list is paged: the first page is the everyday set, the second the
   advanced one. Scroll the wheel — or press a bumper on a pad — to turn the page while the radial
   is open; that input is taken from the hotbar for as long as it is open, since you cannot see the
   hotbar through the ring anyway.

   Each page is its own ring, so an index is only ever meaningful together with its page. */
/* An empty slot: a wedge that says only "Coming soon". Both pages are the same TEN slices, so the
   ring never changes shape under you when you turn the page, and the gaps show how much of the
   advanced set is still to come. */
const _soonSlot = (n) => ({ key: '_soon' + n, name: '', soon: true });
const CHISEL_PAGES = [
  [
    { key: 'block',  name: 'Block',         desc: 'The whole cube',                boxes: [[0, 0, 0, 16, 16, 16]] },
    { key: 'slab',   name: 'Slab',          desc: 'Half height, top or bottom',    boxes: [[0, 0, 0, 16, 8, 16]] },
    { key: 'vslab',  name: 'Vertical slab', desc: 'Half depth, stood on its edge', boxes: [[0, 0, 0, 16, 16, 8]] },
    { key: 'stairs', name: 'Stairs',        desc: 'A step, facing where you click',boxes: [[0, 0, 0, 16, 8, 16], [0, 8, 0, 16, 16, 8]] },
    { key: 'pane',   name: 'Pane',          desc: 'A thin upright sheet',          boxes: [[0, 0, 6, 16, 16, 10]] },   // half a vertical slab thick (0.784)
    { key: 'fence',  name: 'Fence',         desc: 'A post, rails to its neighbours',boxes: [[6, 0, 6, 10, 16, 10], [0, 6, 7, 16, 9, 9], [0, 12, 7, 16, 15, 9]] },
    // in development: shown by name, not pickable yet
    { key: 'slope',  name: 'Slope',  soon: true },                              // 0.7892, took the cover's slot
    { key: 'carpet', name: 'Carpet',        desc: 'One thin layer on the floor',   boxes: [[0, 0, 0, 16, 2, 16]] },    // one 1/8 layer (0.785)
    { key: 'wall',   name: 'Wall',          desc: 'A thick post that joins up' },  // drawn from the real wall (0.787)
    { key: 'bars',   name: 'Bars',   soon: true },
  ],
  [
    { key: 'cover',  name: 'Cover',         desc: 'A thin plate you walk through', boxes: [[0, 0, 14, 16, 16, 16]] },  // 0.787
    ...Array.from({ length: 9 }, (_, i) => _soonSlot(i + 1)),
  ],
];
const CHISEL_PAGE_NAMES = ['Simple', 'Advanced'];
// flat, for every lookup that only knows a key — a shape's page is a property of the radial, not of it
const CHISEL_SHAPES = CHISEL_PAGES.flat();
const _chiselPage = (i) => CHISEL_PAGES[Math.min(CHISEL_PAGES.length - 1, Math.max(0, i | 0))];
const _shapeReady = (s) => !!s && !s.soon;
const CHISEL_HOLD = 0.25;             // a pad's B held this long opens the radial instead of the inventory

/* Which worn items open the radial. The hammer (0.788) REPLACED the chisel in 0.789 — its recipe is
   `removed` — but the chisel is still listed so one already in a save keeps working instead of
   turning into a dead trinket. Anything added here needs `chisel: true` in its ITEM_PROPS so the
   inventory describes it and shows its durability bar. */
const CHISEL_TOOLS = [ITEM.HAMMER, ITEM.CHISEL];
// worn in survival; creative needs no chisel at all (0.7811)
const chiselEquipped = () => typeof player !== 'undefined' && !player.dead &&
  (player.canFly || (CHISEL_TOOLS.includes(equipSlots[EQUIP_INDEX.accessories]?.id)
                    && !slotBroken(equipSlots[EQUIP_INDEX.accessories])));   // a broken hammer shapes nothing (0.79)
const _chiselShape = (key) => CHISEL_SHAPES.find(s => _shapeReady(s) && s.key === key) || CHISEL_SHAPES[0];
// the picked shape. Not saved anywhere since 0.7844: every world you join starts back on the full block
function chiselShapeKey() {
  if (player.chiselShape == null) player.chiselShape = 'block';
  return player.chiselShape;
}

/* ---- shaping blocks (0.782; variants since 0.783; pane and fence 0.784) ----
   Every shape in the radial now places. A shape is the full block's own id with the shape in its variant
   byte (CHISEL SHAPES in 02-voxel-core.js); which blocks take which shape is SHAPE_BLOCKS there, read here
   through PROPS[id].shapes — so a block can take a pane but no fence, and the slots show that. */
const CHISEL_BLOCK_SHAPE = { slab: 'slab', vslab: 'slab', stairs: 'stairs', pane: 'pane', fence: 'fence',
                             carpet: 'layer', cover: 'cover', wall: 'wall' };   // radial key -> family (carpet 0.785, cover/wall 0.787)
// how a slot or the hand draws each shape: a bottom half, a back half standing up, stairs facing away,
// a pane facing you, and a fence with its rails out both sides (a lone post would read as a stick)
const CHISEL_ICON_VAR = { slab: SHAPE_SLAB, vslab: SHAPE_SLAB + 4, stairs: SHAPE_STAIRS,
                          pane: SHAPE_PANE, fence: SHAPE_FENCE + 1, carpet: SHAPE_LAYER,
                          cover: SHAPE_COVER + 4, wall: SHAPE_WALL + 1 };
// what a held block places as right now: { key }, or null (no chisel, a shape without a model, or a block that cannot take it)
function chiselShapedPlace(id) {
  if (id == null || id >= 256 || !PROPS[id]?.shapes || !chiselEquipped()) return null;
  const key = chiselShapeKey(), fam = CHISEL_BLOCK_SHAPE[key];
  return fam && PROPS[id].shapes[fam] ? { key } : null;
}
// the variant a block is drawn in, in a slot or in the hand: its shape while the chisel would place it so
const chiselHeldVariant = (id) => { const s = chiselShapedPlace(id); return s ? CHISEL_ICON_VAR[s.key] : 0; };
// a slot's icon. Icons are cached per id and variant, so each shaped icon renders once, then only swaps.
function chiselSlotIcon(id) {
  const v = chiselHeldVariant(id);
  return v ? renderBlockIcon(id, v) : renderBlockIcon(id);
}
// one point of wear per shaped placement, survival only; at 0 the tool breaks
function chiselWear() {
  if (player.canFly) return;
  const i = EQUIP_INDEX.accessories, s = equipSlots[i];
  if (!s || !CHISEL_TOOLS.includes(s.id) || s.dur == null) return;
  const w = wearSlot(s);
  if (w === 'gone') equipSlots[i] = null;
  if (w !== 'kept') playSound('toolBreak', { gain: 0.8 });
  saveEquip();
  if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
}

/* ---- previews ---- */
const _chiselIcons = {};
const CHISEL_EDGE = 0.7 / 16;         // outline thickness in blocks: real bars, so it survives any icon size
function chiselShapeIcon(shape) {
  if (!shape) return '';
  if (_chiselIcons[shape.key]) return _chiselIcons[shape.key];
  if (typeof renderer === 'undefined' || !renderer) return '';
  const scene = new THREE.Scene(), geos = [];
  // flat shades per face (+x, -x, +y, -y, +z, -z), so the shape reads without any light in the scene
  const faceMats = [0xd4d4d4, 0xd4d4d4, 0xffffff, 0x8c8c8c, 0xeaeaea, 0xeaeaea]
    .map(c => new THREE.MeshBasicMaterial({ color: c }));
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); scene.add(o); geos.push(g); };
  const e = CHISEL_EDGE;
  // the fence preview is the real picket fence in its icon pose, so the two never drift apart (0.7841)
  // ...and the wall the same way (0.787)
  const pose = { fence: B.PLANKS | ((SHAPE_FENCE + 1) << 8), wall: B.COBBLE | ((SHAPE_WALL + 1) << 8) }[shape.key];
  const boxes = pose ? CORE.shapeBoxesAt(() => 0, 0, 0, 0, pose).map(b => b.map(n => n * 16)) : shape.boxes;
  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    const w = (x1 - x0) / 16, h = (y1 - y0) / 16, d = (z1 - z0) / 16;
    const cx = (x0 + x1) / 32 - 0.5, cy = (y0 + y1) / 32 - 0.5, cz = (z0 + z1) / 32 - 0.5;
    add(new THREE.BoxGeometry(w, h, d), faceMats, cx, cy, cz);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {           // the twelve edges
      add(new THREE.BoxGeometry(w + e, e, e), edgeMat, cx, cy + a * h / 2, cz + b * d / 2);
      add(new THREE.BoxGeometry(e, h + e, e), edgeMat, cx + a * w / 2, cy, cz + b * d / 2);
      add(new THREE.BoxGeometry(e, e, d + e), edgeMat, cx + a * w / 2, cy + b * h / 2, cz);
    }
  }
  const cam = new THREE.OrthographicCamera(-0.86, 0.86, 0.86, -0.86, 0.1, 10);   // the chest icon's angle, a little closer
  cam.position.set(1.4, 1.15, 1.8);
  cam.lookAt(0, -0.05, 0);
  const url = _renderIconScene(scene, cam);
  for (const g of geos) g.dispose();
  for (const m of [...faceMats, edgeMat]) m.dispose();
  return (_chiselIcons[shape.key] = url);
}

/* ---- the radial ----
   Per player: player._chiselRad = { ax, ay, last } while open. Mouse movement piles up into (ax, ay),
   clamped; a stick only counts while pushed, and `last` keeps what it pointed at, so letting the stick
   spring back a moment before B still picks that shape. Released in the middle, nothing changes. */
const chiselRadialOpen = () => typeof player !== 'undefined' && !!player._chiselRad;
function openChiselRadial() {
  if (!chiselEquipped() || player._chiselRad) return;
  // opens on the page the picked shape lives on, so the thing you are using is the thing you see
  const key = chiselShapeKey();
  const page = Math.max(0, CHISEL_PAGES.findIndex(p => p.some(s => s.key === key)));
  player._chiselRad = { ax: 0, ay: 0, last: -1, page };
}
function _chiselHover(x, y, dead, n) {
  if (Math.hypot(x, y) < dead) return -1;
  const full = Math.PI * 2;
  return Math.round(((Math.atan2(x, -y) + full) % full) / (full / n)) % n;   // 0 at the top, clockwise
}
function chiselAim(x, y, fromPad) {
  const r = player._chiselRad;
  if (!r) return;
  const n = _chiselPage(r.page).length;
  if (fromPad) { const i = _chiselHover(x, y, 0.4, n); if (i >= 0) r.last = i; return; }
  r.ax += x; r.ay += y;
  const len = Math.hypot(r.ax, r.ay), max = 90;
  if (len > max) { r.ax *= max / len; r.ay *= max / len; }
  r.last = _chiselHover(r.ax, r.ay, 24, n);
}
/* Turn the page. Wraps, because two pages reached by one wheel should not have a dead end, and the
   hover is dropped: the slice under the pointer on the old ring means nothing on the new one. */
function chiselRadialPage(delta) {
  const r = typeof player !== 'undefined' && player._chiselRad;
  if (!r || !delta) return false;
  const n = CHISEL_PAGES.length;
  r.page = ((r.page + (delta > 0 ? 1 : -1)) % n + n) % n;
  r.last = -1; r.ax = 0; r.ay = 0;
  return true;
}
function closeChiselRadial(pick) {
  const r = player._chiselRad;
  if (!r) return;
  player._chiselRad = null;
  if (!pick || r.last < 0) return;
  const s = _chiselPage(r.page)[r.last];
  if (!_shapeReady(s)) { toast(`${s ? s.name : 'That shape'} is still in development`); return; }
  player.chiselShape = s.key;
}
/* Pie-slice wedges (0.781), not boxes: an SVG ring cut into CHISEL_SHAPES.length slices around a hub
   that names the shape, with each preview laid over the middle of its slice. Sizes are CSS pixels and
   must match .chiselRadial in style.css. */
// The hub radius: wide enough for a shape name AND the line of description under it
const CHISEL_RAD = { size: 440, inner: 92, outer: 214, icon: 155, gap: 1.2 };   // gap in degrees
function _buildChiselRadial(pageIdx) {
  const el = document.createElement('div');
  el.className = 'chiselRadial';
  el._page = pageIdx;                     // so syncChiselHud can tell when the ring has to be rebuilt
  const shapes = _chiselPage(pageIdx);
  const { size, inner, outer, icon: ri, gap } = CHISEL_RAD, C = size / 2, n = shapes.length;
  const pt = (deg, r) => `${(C + Math.sin(deg * Math.PI / 180) * r).toFixed(2)} ${(C - Math.cos(deg * Math.PI / 180) * r).toFixed(2)}`;
  let segs = '', icons = '';
  shapes.forEach((s, i) => {
    const mid = i * 360 / n, a0 = mid - 180 / n + gap, a1 = mid + 180 / n - gap;
    /* The large-arc flag. A page holding one or two shapes has slices wider than a half circle, and
       an SVG arc always takes the SHORT way round unless told otherwise — without this a one-shape
       page draws as a hairline sliver instead of a full ring. */
    const big = (a1 - a0) > 180 ? 1 : 0;
    const ready = _shapeReady(s);
    segs += `<path class="crSeg${ready ? '' : ' soon'}" d="M${pt(a0, outer)} A${outer} ${outer} 0 ${big} 1 ${pt(a1, outer)} ` +
            `L${pt(a1, inner)} A${inner} ${inner} 0 ${big} 0 ${pt(a0, inner)} Z"/>`;
    const [x, y] = pt(mid, ri).split(' ');
    const url = ready ? chiselShapeIcon(s) : '';
    const soonLabel = s && s.name ? `${s.name}<small>in development</small>` : '<small>Coming soon</small>';
    icons += `<div class="crIcon${ready ? '' : ' soon'}" style="left:${x}px;top:${y}px">` +
             (ready ? (url ? `<img src="${url}" alt="">` : '') : soonLabel) + '</div>';
  });
  /* A one-slice ring is a full circle with no visible cut, so the page label under the hub is the
     only thing telling you which ring you are on. It always says where you are and how to move. */
  const pager = CHISEL_PAGES.length > 1
    ? `<div class="crPage">${CHISEL_PAGE_NAMES[pageIdx] || 'Page ' + (pageIdx + 1)}` +
      ` <small>${pageIdx + 1}/${CHISEL_PAGES.length} · scroll or bumper</small></div>`
    : '';
  el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${segs}` +
                 `<circle class="crHub" cx="${C}" cy="${C}" r="${inner - 6}"/></svg>${icons}` +
                 `<div class="crHubText"><div class="crName"></div><div class="crDesc"></div></div>${pager}`;
  return el;
}

/* Per frame, per seat, from updateVitals beside the offhand slot. Both elements live INSIDE #hotbar, so
   they follow the bar into every split-screen pane; buildHotbar clears them, and this puts them back. */
function syncChiselHud() {
  if (typeof hotbarEl === 'undefined' || !hotbarEl) return;
  const on = chiselEquipped();
  if (player._chiselRad && (!on || !playing || invOpen)) closeChiselRadial(false);
  const key = on ? chiselShapeKey() : '';
  /* slots draw shapeable blocks in the picked shape (0.782), so a new shape — or the chisel going on or
     off — redraws the hotbar and an open inventory once */
  if (key !== player._chiselIconSig) {
    const first = player._chiselIconSig === undefined;
    player._chiselIconSig = key;
    if (!first) { buildHotbar(); if (invOpen) buildInventory(); }
  }
  const icon = on ? chiselShapeIcon(_chiselShape(key)) : '';
  const sig = on ? key + ':' + (icon ? 1 : 0) : '';
  if (sig !== hotbarEl._chiselKey) {
    hotbarEl._chiselKey = sig;
    let el = hotbarEl.querySelector(':scope > .chiselSlot');
    if (!on) { if (el) el.remove(); }
    else {
      if (!el) { el = document.createElement('div'); el.className = 'slot chiselSlot'; hotbarEl.appendChild(el); }
      el.innerHTML = icon ? `<img class="i3d" src="${icon}" alt="">` : '';
    }
  }
  const r = player._chiselRad;
  let rad = hotbarEl.querySelector(':scope > .chiselRadial');
  if (!r) { if (rad) rad.remove(); return; }
  // turning the page swaps the whole ring: a different count of slices is a different SVG
  if (rad && rad._page !== r.page) { rad.remove(); rad = null; }
  if (!rad) { rad = _buildChiselRadial(r.page); hotbarEl.appendChild(rad); }
  const shapes = _chiselPage(r.page);
  const segs = rad.querySelectorAll('.crSeg'), icons = rad.querySelectorAll('.crIcon');
  shapes.forEach((s, i) => {
    const cur = _shapeReady(s) && s.key === key;
    segs[i].classList.toggle('hov', i === r.last); segs[i].classList.toggle('cur', cur);
    icons[i].classList.toggle('hov', i === r.last);
  });
  /* The hub names what you are pointing at and says in one line what it does. A placeholder has no
     name of its own, so it says so; a named shape still in development says that instead of a
     description, since "what it does" is "nothing yet". */
  const hs = r.last >= 0 ? shapes[r.last] : _chiselShape(key);
  rad.querySelector('.crName').textContent =
    !hs ? '' : hs.soon ? (hs.name || 'Coming soon') : hs.name;
  rad.querySelector('.crDesc').textContent =
    !hs ? '' : hs.soon ? (hs.name ? 'In development' : 'Not yet decided') : (hs.desc || '');
}

/* Keyboard: hold Q to open, release to pick. Made sturdier in 0.7844, where it sometimes did not open:
     - pointer lock is no longer required — a browser that refuses or is slow to give it back (right after
       the inventory closes, say) used to swallow the key, and the mouse still aims without it
     - a first keydown that already arrives as a repeat (focus came back mid-press) still opens it
     - keyboard and mouse belong to seat one, so with split screen they act as that seat, whichever
       seat happened to be installed when the event came in
     - losing window focus drops an open radial, so a missed keyup cannot leave it stuck */
const _asKeyboardSeat = (fn) =>
  (typeof withSlot === 'function' && typeof PSTATE !== 'undefined' && PSTATE.length > 1 ? withSlot(0, fn) : fn());
document.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyQ') return;
  if (typeof inputCapture !== 'undefined' && inputCapture) return;
  _asKeyboardSeat(() => { if (playing && !invOpen && !worldJoining()) openChiselRadial(); });
});
document.addEventListener('keyup', (e) => { if (e.code === 'KeyQ') _asKeyboardSeat(() => closeChiselRadial(true)); });
addEventListener('blur', () => _asKeyboardSeat(() => closeChiselRadial(false)));
// mouse aiming, called first thing by 17-input.js's look handler: true when the radial took the movement
function chiselMouseAim(dx, dy) {
  return _asKeyboardSeat(() => {
    if (!chiselRadialOpen()) return false;
    if (dx || dy) chiselAim(dx, dy, false);
    return true;
  });
}
// the wheel, from the same handler that moves the hotbar: true when the radial took it instead (0.7892)
function chiselWheel(deltaY) {
  return _asKeyboardSeat(() => chiselRadialOpen() ? (chiselRadialPage(deltaY), true) : false);
}
