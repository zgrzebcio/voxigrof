'use strict';
/* blocks/clam.js: the clam on the page. Its model and lid, the clams known in the loaded land, opening one, what is
   inside it (sand, a pearl, a thing a player put in), a pearl growing, and the save of what is put in.

   THE BLOCK is B.CLAM (blocks/torch-blocks.js: its PROPS and CLAM_BITS, the variant byte: facing, OPEN, what it HAS, PLACED),
   laid on warm sea floors by the world (worldgen/desert-and-shore-plants.js, rev 38). The mesher draws nothing of it; the
   water round one standing in water is drawn as any waterlogged cell's. Here: its model (js/models/clam.js, read by
   entities/box-models.js; its sheet in textures/Blocks/Models/clam), the bottom valve and the lid as instances of two
   meshes, the lid swung up about its hinge as it opens (CLAM_LID_S), lit by the light over it, and what lies inside while
   it is open.

   FINDING THEM, as the termite hills: the worker lists them with the light sources (`pageModel`), finishChunkGen
   (chunks/stream.js, pageModelSeen) hands each to clamSeen, and setBlock's hook (chunks/block-access.js) calls clamChanged.
   A clam whose chunk is let go is forgotten; a thing put in one is not (CLAM_ITEMS).

   USING ONE: the right button (tryUseClam, from _doPlace); the holds run in updateClamHold (tickPlayer).
     shut, wild          held CLAM_OPEN_S: it opens
     shut, put down      it opens at once
     open, a pearl       held CLAM_TAKE_S: the pearl is yours
     open, sand          full (SAND_FULL), held CLAM_TAKE_S: a sand block is yours, and it fills again (a sand farm);
                         not full yet, nothing
     open, a thing       it comes back into your hands
     open, empty         ONE of what you hold goes in
     sneak + use         it shuts, with what is in it
   Broken, it drops itself (blockDrop): sand or a pearl in it is lost, a thing put in falls out.

   A PEARL GROWING. Only in a wild clam (not PLACED: one put down never does), in the simulated land, looked at every
   CLAM_TICK_S with the chances of that many ticks, scaled by the world's tick speed (tickFactor, blocks/layer-drops.js): shut,
   it takes in sand, a step at a time up to full (CLAM_SAND_CH a tick each: about a minute a step at tick speed 3, four from
   empty to full); with sand in it, at any step, the sand turns into a pearl (CLAM_PEARL_CH a tick: about an hour and a half).
   An otter told to find pearls takes them (clamPearlsNear, clamTakePearl: entities/otter.js).

   A THING IN ONE is kept by place in CLAM_ITEMS (saved as `clams`); food in it spoils as in a chest (_tickClamSpoil, from
   tickSpoilage in 44-spoil.js). */
const CLAM_MODEL = 'clam', CLAM_PNG = 'textures/Blocks/Models/clam/clam.png';   // its model's name (js/models/clam.js), its sheet
const CLAM_OPEN_S = 0.3, CLAM_TAKE_S = 0.8;     // seconds the right button is held: to open a wild one, to take its pearl or sand
const CLAM_REACH = 6;                            // a hold ends when you are further than this from it
const CLAM_LID_S = 0.4;                          // seconds the lid takes to swing up or down
const CLAM_LID_ANGLE = -67.5 * Math.PI / 180;    // how far up it swings, about the hinge along its back
const CLAM_HINGE = [8, 1.5, 0];                  // the hinge, in the model's 16ths
const CLAM_SAND_CH = 0.001, CLAM_PEARL_CH = 0.00001;   // a tick (SIM_HZ) at tick speed 3: sand taken in, sand turned to a pearl
const CLAM_TICK_S = 1;                           // how often the wild clams are looked at for that
const CLAM_PASS_S = 0.5;                         // how often the clams are looked over (chunks gone, which are drawn)
const CLAMS = new Map();                         // "x,y,z" -> { x, y, z, va, lid, inst, inner, innerKey }
const CLAM_ITEMS = new Map();                    // "x,y,z" -> { slot, spoilT }: the thing a player put in it
const _clamKey = (x, y, z) => x + ',' + y + ',' + z;
const _CB = BLOCKS.CLAM_BITS;
const clamHasOf = (va) => (va >> _CB.HAS_SHIFT) & 3;
const clamIsOpen = (va) => (va & _CB.OPEN) !== 0;
const clamIsPlaced = (va) => (va & _CB.PLACED) !== 0;
const clamSandOf = (va) => (va >> _CB.SAND_SHIFT) & 3;          // how far its sand has filled it
// the cell's value holding `has` instead (its water bit and the rest kept), its sand at step `sand` (0 for anything else)
const _clamWithHas = (v, has, sand = 0) =>
  ((v & ~((_CB.HAS_MASK | _CB.SAND_MASK) << 8)) | (has << (_CB.HAS_SHIFT + 8)) | ((has === _CB.SAND ? sand : 0) << (_CB.SAND_SHIFT + 8))) >>> 0;
const _clamWithOpen = (v, open) => (open ? v | (_CB.OPEN << 8) : v & ~(_CB.OPEN << 8)) >>> 0;
const _CLAM_TURN = [0, Math.PI, Math.PI / 2, -Math.PI / 2];   // by facing: the model opens toward +Z

/* ---- drawing: the bottom valve and the lid, one instanced mesh each ---- */
boxModel(CLAM_MODEL, CLAM_PNG);                  // its sheet fetched from the start
const clamModelReady = () => boxModel(CLAM_MODEL, CLAM_PNG).ready;
let _clamGeo = null, _clamMat = null;
// the two geometries from the model (shut): the bottom about the middle of its floor, the lid about its hinge
function _clamParts() {
  if (_clamGeo) return _clamGeo;
  const m = boxModel(CLAM_MODEL, CLAM_PNG);
  if (!m.ready) return null;
  const els = m.json.elements || [];
  _clamGeo = {
    bottom: boxModelGeometry(m, els.filter(e => !/^lid/.test(e.name || '')), [8, 0, 8]),
    lid: boxModelGeometry(m, els.filter(e => /^lid/.test(e.name || '')), CLAM_HINGE),
  };
  _clamMat = new THREE.MeshBasicMaterial({ map: m.tex, alphaTest: 0.5 });
  return _clamGeo;
}
const _clamDraw = { bottom: null, lid: null, cap: 0, list: [] };
let _clamDirty = true, _clamPassT = 0, _clamLightT = 0, _clamTickT = 0;
const _clamM4 = new THREE.Matrix4(), _clamM4b = new THREE.Matrix4(), _clamCol = new THREE.Color();
const _clamHingeOff = new THREE.Vector3((CLAM_HINGE[0] - 8) / 16, CLAM_HINGE[1] / 16, (CLAM_HINGE[2] - 8) / 16);
function _clamMeshes(need) {
  const g = _clamParts();
  if (!g) return false;
  if (_clamDraw.bottom && _clamDraw.cap >= need) return true;
  const cap = Math.max(32, need * 2);
  for (const part of ['bottom', 'lid']) {
    const old = _clamDraw[part];
    if (old) { scene.remove(old); old.dispose(); }
    const mesh = new THREE.InstancedMesh(g[part], _clamMat, cap);
    mesh.frustumCulled = false;                  // its instances are all over the land
    mesh.count = 0;
    scene.add(mesh);
    _clamDraw[part] = mesh;
  }
  _clamDraw.cap = cap;
  return true;
}
// the bottom's place and turn, and the lid's: the same, then out to the hinge and swung up by how far it is open
function _clamPlace(c) {
  const turn = _CLAM_TURN[c.va & 3];
  _clamM4.makeRotationY(turn).setPosition(c.x + 0.5, c.y, c.z + 0.5);
  _clamDraw.bottom.setMatrixAt(c.inst, _clamM4);
  _clamM4b.makeTranslation(_clamHingeOff.x, _clamHingeOff.y, _clamHingeOff.z);
  _clamM4.multiply(_clamM4b);
  _clamM4.multiply(_clamM4b.makeRotationX(CLAM_LID_ANGLE * _clamEase(c.lid)));
  _clamDraw.lid.setMatrixAt(c.inst, _clamM4);
}
const _clamEase = (t) => t * t * (3 - 2 * t);
// which clams are drawn (the ones within the full-detail radius, as creatures), and where
function _clamRebuild() {
  _clamDirty = false;
  const list = [];
  for (const c of CLAMS.values()) {
    c.inst = -1;
    if (chunkDist2ToPlayers(Math.floor(c.x / 16), Math.floor(c.z / 16)) <= viewDist * viewDist) list.push(c);
    else _clamDropInner(c);
  }
  if (!_clamMeshes(list.length)) { if (list.length) _clamDirty = true; return; }   // its model is not in yet: again next pass
  list.forEach((c, i) => { c.inst = i; _clamPlace(c); });
  for (const part of ['bottom', 'lid']) { _clamDraw[part].count = list.length; _clamDraw[part].instanceMatrix.needsUpdate = true; }
  _clamDraw.list = list;
  _clamLightT = 0;
}
// each drawn clam lit by the light just over it, as a creature is (_lightAt, entities/rig.js)
function _clamRelight() {
  if (!_clamDraw.bottom || !_clamDraw.list.length) return;
  for (const c of _clamDraw.list) {
    _clamCol.setScalar(_lightAt(c.x + 0.5, c.y + 0.3, c.z + 0.5));
    _clamDraw.bottom.setColorAt(c.inst, _clamCol);
    _clamDraw.lid.setColorAt(c.inst, _clamCol);
  }
  for (const part of ['bottom', 'lid']) if (_clamDraw[part].instanceColor) _clamDraw[part].instanceColor.needsUpdate = true;
}

/* ---- what lies inside while it is open: sand, a pearl, the thing put in ---- */
function _clamInnerKey(c) {
  const has = clamHasOf(c.va);
  if (has === _CB.ITEM) { const it = CLAM_ITEMS.get(_clamKey(c.x, c.y, c.z)); return it ? 'i' + it.slot.id : ''; }
  return has === _CB.SAND ? 's' + clamSandOf(c.va) : has === _CB.PEARL ? 'p' : '';
}
function _clamDropInner(c) {
  if (!c.inner) return;
  scene.remove(c.inner);
  c.inner = null; c.innerKey = '';
}
/* Built as a drop is (buildDropGeom), straight in a group at its place in the world, so a block in it is lit by its own cell
   the way a drop is (_dropLightHook): sand a heap that grows with each step it fills, a pearl standing, a block a small
   cube, an item lying flat. */
function _clamBuildInner(c, key) {
  _clamDropInner(c);
  if (!key) return;
  const sand = key[0] === 's', sk = sand ? (1 + +key.slice(1)) / (_CB.SAND_FULL + 1) : 0;   // its heap: a quarter .. whole
  const id = sand ? B.SAND : key === 'p' ? ITEM.PEARL : +key.slice(1);
  const g = new THREE.Group();
  const turn = _CLAM_TURN[c.va & 3], fz = 0.06;   // a little toward its open side, off the hinge
  g.position.set(c.x + 0.5 + Math.sin(turn) * fz, c.y + 1.5 / 16, c.z + 0.5 + Math.cos(turn) * fz);
  g.rotation.y = turn;
  const item = id >= 256;
  for (const { p, geo, mat, node } of buildDropGeom(id)) {
    const o = node || new THREE.Mesh(geo, mat || _dropMat(p));
    if (!node && !mat) o.onBeforeRender = _dropLightHook;
    if (sand) { o.scale.set(0.2 + 0.3 * sk, 0.03 + 0.07 * sk, 0.18 + 0.26 * sk); o.position.y = (0.03 + 0.07 * sk) / 2; }
    else if (key === 'p') { o.scale.setScalar(0.2); o.position.y = 0.1; }
    else if (item) { o.scale.setScalar(0.42); o.rotation.x = -Math.PI / 2; o.position.y = 0.03; }
    else { o.scale.setScalar(0.28); o.position.y = 0.14; }
    g.add(o);
  }
  scene.add(g);
  c.inner = g; c.innerKey = key;
}

/* ---- the clams known ---- */
// a clam's cell met in a chunk coming in (finishChunkGen), or put down (clamChanged)
function clamSeen(x, y, z, v) {
  const k = _clamKey(x, y, z), va = (v >> 8) & 255;
  const c = CLAMS.get(k);
  if (c) { c.va = va; return; }
  CLAMS.set(k, { x, y, z, va, lid: clamIsOpen(va) ? 1 : 0, inst: -1, inner: null, innerKey: '' });
  _clamDirty = true;
}
// setBlock's hook: a clam put down, opened, shut, filled, emptied, or broken
function clamChanged(x, y, z, oldVal, val) {
  const k = _clamKey(x, y, z);
  const was = (oldVal & 255) === B.CLAM, is = (val & 255) === B.CLAM;
  if (is) {
    if (!was) CLAM_ITEMS.delete(k);            // a new one holds nothing yet
    clamSeen(x, y, z, val);
    if (clamHasOf((val >> 8) & 255) !== _CB.ITEM) CLAM_ITEMS.delete(k);
    return;
  }
  if (!was) return;
  // broken: what was put in falls out; sand or a pearl is lost with it
  const it = CLAM_ITEMS.get(k);
  if (it && !player.canFly) spawnDrop(it.slot.id, x, y, z, null, undefined, it.slot.dur ?? null, slotMeta(it.slot), 0, it.slot.count);
  CLAM_ITEMS.delete(k);
  const c = CLAMS.get(k);
  if (c) _clamDropInner(c);
  CLAMS.delete(k);
  _clamDirty = true;
}
function clearClams() {
  for (const c of CLAMS.values()) _clamDropInner(c);
  CLAMS.clear();
  CLAM_ITEMS.clear();
  if (_clamDraw.bottom) { _clamDraw.bottom.count = 0; _clamDraw.lid.count = 0; _clamDraw.list = []; }
  _clamDirty = true;
}
// the wild clams with a pearl in them within r of (x, y, z), nearest first (an otter's 'pearls' stance)
function clamPearlsNear(x, y, z, r) {
  const out = [];
  for (const c of CLAMS.values()) {
    if (clamIsPlaced(c.va) || clamHasOf(c.va) !== _CB.PEARL) continue;
    const d = Math.hypot(c.x + 0.5 - x, c.z + 0.5 - z);
    if (d <= r && Math.abs(c.y - y) <= r) out.push({ x: c.x, y: c.y, z: c.z, d });
  }
  return out.sort((a, b) => a.d - b.d);
}
// the pearl taken out of the clam at x, y, z (it opens for it): true when there was one
function clamTakePearl(x, y, z) {
  const v = getBlock(x, y, z);
  if ((v & 255) !== B.CLAM || clamHasOf((v >> 8) & 255) !== _CB.PEARL) return false;
  setBlock(x, y, z, _clamWithOpen(_clamWithHas(v, _CB.NONE), true));
  return true;
}

/* ---- the player's hand on one ---- */
const _clamPos = (x, y, z) => ({ x: x + 0.5, y: y + 0.2, z: z + 0.5 });
function _clamSetOpen(x, y, z, open) {
  const v = getBlock(x, y, z);
  if ((v & 255) !== B.CLAM || clamIsOpen((v >> 8) & 255) === open) return;
  setBlock(x, y, z, _clamWithOpen(v, open));
  playSound(open ? 'chestOpen' : 'chestClose', { gain: 0.4, rate: 1.7, pos: _clamPos(x, y, z) });
  // under water a few bubbles rise out of it as it opens
  if (open && isWaterlogged(v) && typeof _fxBubble === 'function')
    for (let n = 0; n < 5; n++) _fxBubble(x + 0.25 + Math.random() * 0.5, y + 0.15 + Math.random() * 0.2, z + 0.25 + Math.random() * 0.5);
}
const _clamName = (id) => (id >= 256 ? ITEM_PROPS[id]?.name : PROPS[id]?.name) || 'something';
/* From _doPlace, for a click on a clam (any mode). True: the click was the clam's, nothing is placed behind it. */
function tryUseClam(hit) {
  if (!hit || hit.id !== B.CLAM) return false;
  if (act && act.place) return true;               // fresh presses only: a hold runs in updateClamHold
  const { x, y, z } = hit, v = getBlock(x, y, z), va = (v >> 8) & 255, k = _clamKey(x, y, z), has = clamHasOf(va);
  handPlaceSwing = true;
  if (player.sneaking) { _clamSetOpen(x, y, z, false); return true; }
  if (!clamIsOpen(va)) {
    if (clamIsPlaced(va)) _clamSetOpen(x, y, z, true);
    else player._clamHold = { x, y, z, what: 'open', t: 0, need: CLAM_OPEN_S };
    return true;
  }
  if (has === _CB.PEARL) { player._clamHold = { x, y, z, what: 'pearl', t: 0, need: CLAM_TAKE_S }; return true; }
  if (has === _CB.SAND) {
    if (clamSandOf(va) >= _CB.SAND_FULL) player._clamHold = { x, y, z, what: 'sand', t: 0, need: CLAM_TAKE_S };
    else feedInfo('The sand in this clam is not full yet: shut, it fills, and a pearl may grow from it');
    return true;
  }
  if (has === _CB.ITEM) {
    const it = CLAM_ITEMS.get(k);
    if (it && !tryPickup(it.slot.id, it.slot.dur ?? null, 'taken', slotMeta(it.slot))) { feedWarn('No room for it'); return true; }
    CLAM_ITEMS.delete(k);
    setBlock(x, y, z, _clamWithHas(v, _CB.NONE));
    playSound('chestClose', { gain: 0.25, rate: 2, pos: _clamPos(x, y, z) });
    return true;
  }
  // empty: one of what you hold goes in (in creative a copy: nothing is spent there)
  const slot = HOTBAR[hotbarSel];
  if (!slot) return true;
  const one = carrySlot(slot, 1);
  if (!player.canFly) { slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null; saveHotbar(); buildHotbar(); updateHotbar(); }
  CLAM_ITEMS.set(k, { slot: one, spoilT: null });
  setBlock(x, y, z, _clamWithHas(v, _CB.ITEM));
  playSound('chestClose', { gain: 0.25, rate: 1.8, pos: _clamPos(x, y, z) });
  feedInfo(`${_clamName(one.id)} put in the clam (sneak + use shuts it)`);
  return true;
}
/* A hold on a clam, started by tryUseClam: the right button down CLAM_OPEN_S to open a wild one, CLAM_TAKE_S to take its
   pearl or its full sand, the crosshair on it. Let go or look away and it stops. Once a frame per seat (tickPlayer);
   returns 0..1 for the progress ring (interactProgress, ui/hud.js). */
function updateClamHold(dt, held) {
  const h = player._clamHold;
  if (!h) return 0;
  const v = getBlock(h.x, h.y, h.z), va = (v >> 8) & 255, hit = held ? currentRay() : null;
  const still = h.what === 'open' ? !clamIsOpen(va)
              : h.what === 'pearl' ? clamIsOpen(va) && clamHasOf(va) === _CB.PEARL
              : clamIsOpen(va) && clamHasOf(va) === _CB.SAND && clamSandOf(va) >= _CB.SAND_FULL;
  const ok = held && playing && !invOpen && !player.dead && (v & 255) === B.CLAM && still
    && hit && hit.x === h.x && hit.y === h.y && hit.z === h.z
    && Math.hypot(player.pos.x - h.x - 0.5, player.pos.y - h.y, player.pos.z - h.z - 0.5) <= CLAM_REACH;
  if (!ok) { player._clamHold = null; return 0; }
  player._milkLatch = true;                        // the held button is the clam's, not a block placed (tickPlayer)
  h.t += dt;
  if (h.t < h.need) return h.t / h.need;
  player._clamHold = null;
  if (h.what === 'open') { _clamSetOpen(h.x, h.y, h.z, true); return 0; }
  setBlock(h.x, h.y, h.z, _clamWithHas(v, _CB.NONE));
  const got = h.what === 'pearl' ? ITEM.PEARL : B.SAND;
  if (!tryPickup(got, null, 'found')) throwFromPlayer(got, 1);
  if (got === ITEM.PEARL) playSound('glass', { gain: 0.45, rate: 1.9, pos: _clamPos(h.x, h.y, h.z) });
  else playBlockSound(B.SAND, 'break', h.x, h.y, h.z);
  handPlaceSwing = true;
  return 0;
}
// what the crosshair says about the clam it is on (ui/hud.js), '' when it is on none
function clamPrompt() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return '';
  const hit = currentRay();
  if (!hit || hit.id !== B.CLAM) return '';
  const va = (getBlock(hit.x, hit.y, hit.z) >> 8) & 255, has = clamHasOf(va);
  const dim = (s) => `<br><span style="opacity:.8;font-size:.9em">${s}</span>`, shut = '(<b>sneak + use</b>) to shut';
  if (!clamIsOpen(va)) return '<b>Clam</b>' + dim(clamIsPlaced(va) ? '(<b>use</b>) to open' : '(<b>hold use</b>) to open');
  if (has === _CB.PEARL) return '<b>Clam</b> · a pearl!' + dim(`(<b>hold use</b>) to take it · ${shut}`);
  if (has === _CB.SAND) {
    const s = clamSandOf(va);
    return s >= _CB.SAND_FULL ? '<b>Clam</b> · full of sand' + dim(`(<b>hold use</b>) to take it · ${shut}: a pearl may grow from it`)
                              : `<b>Clam</b> · sand ${s + 1}/${_CB.SAND_FULL + 1}` + dim(`${shut}: it fills, and a pearl may grow from it`);
  }
  if (has === _CB.ITEM) {
    const it = CLAM_ITEMS.get(_clamKey(hit.x, hit.y, hit.z));
    return `<b>Clam</b> · holds ${_esc(_clamName(it ? it.slot.id : null))}` + dim(`(<b>use</b>) to take it · ${shut}`);
  }
  return '<b>Clam</b> · empty' + dim(`(<b>use</b>) puts in one of what you hold · ${shut}`);
}

/* ---- held, dropped and in the inventory: the shut clam's own model ---- */
const _clamNodesWaiting = [];                     // nodes asked for before the model was in: filled by updateClams
function _clamFillNode(g) {
  const parts = _clamParts();
  if (!parts) return false;
  g.add(new THREE.Mesh(parts.bottom, _clamMat));
  const lid = new THREE.Mesh(parts.lid, _clamMat);
  lid.position.copy(_clamHingeOff);                // the lid's geometry is about its hinge: out to it, shut on the bottom
  g.add(lid);
  return true;
}
// the model shut, its middle on the origin as a drop's cube is (buildDropGeom, 15-drops.js)
function clamItemNode() {
  const outer = new THREE.Group(), g = new THREE.Group();
  g.position.y = -1.5 / 16;
  outer.add(g);
  if (!_clamFillNode(g)) _clamNodesWaiting.push(g);
  return outer;
}

/* ---- once a frame: keep the clams and their drawing up to date ---- */
function updateClams(dt) {
  if (menuScene) return;
  if (_clamNodesWaiting.length && clamModelReady()) while (_clamNodesWaiting.length) _clamFillNode(_clamNodesWaiting.pop());
  _clamPassT -= dt;
  if (_clamPassT <= 0) {
    _clamPassT = CLAM_PASS_S;
    // forget the clams whose chunk is gone
    for (const [k, c] of CLAMS) {
      const ch = getChunk(Math.floor(c.x / 16), Math.floor(c.z / 16));
      if (!ch || !ch.data || (getBlock(c.x, c.y, c.z) & 255) !== B.CLAM) { _clamDropInner(c); CLAMS.delete(k); }
    }
    _clamDirty = true;                             // and which are drawn, the players having moved
  }
  if (_clamDirty) _clamRebuild();
  if (!_clamDraw.bottom) return;
  // the lids swing toward what their cells say; what is inside shows while one is open
  let moved = false;
  for (const c of _clamDraw.list) {
    const want = clamIsOpen(c.va) ? 1 : 0;
    if (c.lid !== want) {
      c.lid = want > c.lid ? Math.min(1, c.lid + dt / CLAM_LID_S) : Math.max(0, c.lid - dt / CLAM_LID_S);
      _clamPlace(c);
      moved = true;
    }
    const key = c.lid > 0.05 ? _clamInnerKey(c) : '';
    if (key !== c.innerKey) _clamBuildInner(c, key);
  }
  if (moved) { _clamDraw.bottom.instanceMatrix.needsUpdate = true; _clamDraw.lid.instanceMatrix.needsUpdate = true; }
  _clamLightT -= dt;
  if (_clamLightT <= 0) { _clamLightT = 0.25; _clamRelight(); }
}
/* Once a fixed tick (simTick): every CLAM_TICK_S the wild clams in the simulated land take in sand and grow pearls, with
   the chances of that many ticks. Not while land is waiting near a player (streamBehind): it writes blocks. */
function clamTick(dt) {
  _clamTickT += dt;
  if (_clamTickT < CLAM_TICK_S) return;
  const span = _clamTickT;
  _clamTickT = 0;
  if (menuScene || streamBehind) return;
  const k = span * SIM_HZ * tickFactor();         // ticks gone by, at tick speed 3 (blocks/layer-drops.js)
  for (const c of [...CLAMS.values()]) {
    if (clamIsPlaced(c.va) || !inSimRangeChunk(Math.floor(c.x / 16), Math.floor(c.z / 16))) continue;
    const has = clamHasOf(c.va), sand = clamSandOf(c.va), shut = !clamIsOpen(c.va);
    let to = -1, step = 0;
    if (has === _CB.SAND && Math.random() < CLAM_PEARL_CH * k) to = _CB.PEARL;
    else if (has === _CB.NONE && shut && Math.random() < CLAM_SAND_CH * k) to = _CB.SAND;
    else if (has === _CB.SAND && shut && sand < _CB.SAND_FULL && Math.random() < CLAM_SAND_CH * k) { to = _CB.SAND; step = sand + 1; }
    if (to < 0) continue;
    const v = getBlock(c.x, c.y, c.z);
    if ((v & 255) === B.CLAM) setBlock(c.x, c.y, c.z, _clamWithHas(v, to, step));
  }
}

/* ---- food put in a clam spoils, at a chest's rate on the world clock (44-spoil.js) ---- */
function _tickClamSpoil() {
  const now = spoilClock();
  for (const [k, it] of CLAM_ITEMS) {
    if (it.spoilT == null || it.spoilT > now) { it.spoilT = now; continue; }
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRangeChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
    const elapsed = Math.floor(now - it.spoilT);
    if (elapsed < 1) continue;
    it.spoilT += elapsed;
    const sl = [it.slot], left = [];
    if (_spoilSlots(sl, elapsed, left) < 2) continue;
    if (sl[0]) { for (const id of left) spawnDrop(id, x, y + 1, z); continue; }
    // the one in it went off: what it leaves (rotten flesh) stays in its place, or the clam is empty
    if (left.length) { it.slot = mkSlot(left[0], 1); continue; }
    CLAM_ITEMS.delete(k);
    const v = getBlock(x, y, z);
    if ((v & 255) === B.CLAM) setBlock(x, y, z, _clamWithHas(v, _CB.NONE));
  }
}

/* ---- save / load: what was put in clams, by place ---- */
function serializeClams() {
  const out = [];
  for (const [k, it] of CLAM_ITEMS) {
    const s = it.slot;
    out.push([k, [s.id, s.count, s.dur ?? null, s.fresh ?? null, s.wm ? 1 : 0, s.lock ?? null], it.spoilT ?? null]);
  }
  return out;
}
function restoreClams(list) {
  if (!Array.isArray(list)) return;
  for (const rec of list) {
    if (!Array.isArray(rec) || typeof rec[0] !== 'string' || !Array.isArray(rec[1])) continue;
    const [id, count, dur, fresh, wm, lock] = rec[1];
    if (!(PROPS[id] || ITEM_PROPS[id])) continue;
    const slot = mkSlot(id, Math.max(1, count | 0));
    if (dur != null) slot.dur = dur;
    if (fresh != null) slot.fresh = fresh;
    if (wm) slot.wm = 1;
    if (Number.isInteger(lock)) slot.lock = lock;
    CLAM_ITEMS.set(rec[0], { slot, spoilT: typeof rec[2] === 'number' ? rec[2] : null });
  }
}
