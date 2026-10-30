'use strict';
/* voxiGrof — the backpack

   Worn in the BACK equipment slot (player/equipment.js), which until now took nothing. Wearing one opens
   the SECOND inventory grid — two more rows under the main one — and it is a real bag, not a
   display: picked-up drops fall into it once the hotbar and the main grid are full, quick-move
   reaches it, and crafting spends out of it.

   Its storage is `invSlots2`, which has been allocated, per-seat swapped and saved with the world
   since the inventory was written and was reserved for exactly this. Creative still uses that same
   array for its overflow block palette, so every test in here is gated on survival — in creative
   the grid is the palette and a backpack would have nothing to add.

   `packSlots` on the item is what opens the slots, so a bigger pack is a one-line item, and
   syncBackpackCapacity already knows how to spill the difference when you swap down to a
   smaller one. */

const backpackSlot = () => (typeof equipSlots !== 'undefined' && equipSlots)
  ? equipSlots[EQUIP_INDEX.back] : null;
const backpackItemId = () => { const s = backpackSlot(); return s ? s.id : null; };
const isBackpackId = (id) => id != null && id >= 256 && !!ITEM_PROPS[id]?.packSlots;

// how many of invSlots2's slots the worn pack actually opens (0 = no pack, or creative)
function backpackCapacity() {
  if (typeof player === 'undefined' || player.canFly || typeof equipSlots === 'undefined') return 0;
  const s = backpackSlot();
  const n = s && ITEM_PROPS[s.id]?.packSlots;
  return Math.min(INV2_SLOTS, n || 0);
}
/* Usable length of a grid, for every helper that fills or scans one. Each is simply its own
   length — except the backpack's, whose tail stays locked until a bigger pack opens it. Without
   this a quick-move would happily stuff items into rows the player cannot see. */
function gridLen(arr) {
  if (arr === HOTBAR) return hotbarLen();       // the belt's hotbar slots only while a belt opens them
  return (arr === invSlots2 && !player.canFly) ? backpackCapacity() : arr.length;
}
/* Called after any equipment change, exactly as syncBeltCapacity is. Anything past the new capacity
   (the pack taken off, or traded for a smaller one) goes back into the BASE inventory: the main grid
   first, then the hotbar, topping up stacks before taking empty slots. Whatever still does not
   fit is thrown out in front of the player rather than dropped at their feet. It used to go through
   tryPickup one item at a time, which filled the hotbar before the main grid and fed a "+1 unpacked"
   line for every single item. */
function stowIntoBase(s) {
  const cap = stackSize(s.id);
  let left = s.count;
  if (s.dur == null)
    for (const g of [invSlots, HOTBAR])
      for (let i = 0; i < gridLen(g) && left > 0; i++) {
        const o = g[i];
        if (o && o.id === s.id && o.dur == null && o.count < cap) {
          const t = Math.min(cap - o.count, left);
          stackInto(o, t, s.fresh ?? null); left -= t;
        }
      }
  for (const g of [invSlots, HOTBAR])
    for (let i = 0; i < gridLen(g) && left > 0; i++)
      if (g[i] == null) { const t = Math.min(cap, left); g[i] = carrySlot(s, t); left -= t; }
  return left;
}
function syncBackpackCapacity() {
  if (typeof invSlots2 === 'undefined' || typeof player === 'undefined' || player.canFly) return;
  const cap = backpackCapacity();
  let spilled = false, thrown = 0;
  for (let i = cap; i < invSlots2.length; i++) {
    const s = invSlots2[i];
    if (!s) continue;
    invSlots2[i] = null;
    spilled = true;
    const left = stowIntoBase(s);
    if (left > 0) {
      throwFromPlayer(s.id, left, s.dur ?? null, slotMeta(s));
      if (typeof feedItem === 'function') feedItem(s.id, -left, 'dropped');
      thrown += left;
    }
  }
  if (spilled) { saveInv(); saveHotbar(); }
  if (thrown && typeof feedWarn === 'function') feedWarn('no room: backpack items dropped in front of you');
}

/* ---------------------------------- the worn pack ----------------------------------
   A real model on the back, not an extruded icon: the pack is the piece of gear other players see most, and a
   flat sprite would disappear edge-on. Each kind of pack is named by the item's `wear` (items/items.js):
     its model     js/models/backpacks.js, defineBoxModel(<wear>, ...) (entities/box-models.js): a list of boxes
                   (`elements`), each with `from` and `to` corners and, per face, the part of the sheet it shows (`uv`:
                   left, top, right, bottom, in 16ths of the sheet)
     its sheet     textures/Entity/equipment/Backpacks/<wear>.png
   (The straps over the chest are a third, <wear>_torso_overlay.png, laid on the torso by player/armor-model.js.)

   THE MODEL'S SPACE is the one its JSON describes: units are skin pixels, the torso is 8 x 12 x 4 round x = 0,
   z = 0 with the waist at y = 0, the body FACES -Z and the pack sticks out to +Z. The game's bodies face +Z, so
   every corner is turned half round (x and z negated) as it is read; a turn, not a mirror, so every face keeps
   its picture the right way round. The waist is the TORSO group's own origin, so the node needs no offset.

   Its sheet is loaded the first time a pack of that kind is worn. Until it is in, buildBackpackNode gives null and its
   callers ask again. */
const PACK_DIR = 'textures/Entity/equipment/Backpacks/';
const _packModels = {};                          // wear name -> { geo, tex } once loaded, 'loading', or 'failed'
// one box's six faces as seen from outside: [the JSON's name for it, its four corners: top left, top right,
// bottom left, bottom right], each corner by which end (0 = from, 1 = to) it takes on x, y, z
const _PACK_FACES = [
  ['east',  [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0]]],
  ['west',  [[0, 1, 0], [0, 1, 1], [0, 0, 0], [0, 0, 1]]],
  ['up',    [[0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]]],
  ['down',  [[0, 0, 1], [1, 0, 1], [0, 0, 0], [1, 0, 0]]],
  ['south', [[0, 1, 1], [1, 1, 1], [0, 0, 1], [1, 0, 1]]],
  ['north', [[1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]]],
];
// every box of a model as ONE geometry, already in the game's space and size
function _packGeometry(json) {
  const pos = [], uv = [], idx = [];
  for (const el of json.elements || []) {
    const ends = [el.from, el.to];
    for (const [name, corners] of _PACK_FACES) {
      const f = el.faces && el.faces[name];
      if (!f || !f.uv) continue;
      const [u0, v0, u1, v1] = f.uv, base = pos.length / 3;
      corners.forEach(([ex, ey, ez], k) => {
        pos.push(-ends[ex][0] * PX, ends[ey][1] * PX, -ends[ez][2] * PX);   // turned half round to face +Z
        uv.push((k % 2 ? u1 : u0) / 16, 1 - (k < 2 ? v0 : v1) / 16);        // the sheet's top is v = 1
      });
      idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
function _loadPackModel(wear) {
  const json = BOX_MODEL_DATA[wear];
  if (!json) { _packModels[wear] = 'failed'; console.error('backpack model ' + wear + ': no such model (js/models/backpacks.js)'); return; }
  _packModels[wear] = 'loading';
  const tex = new THREE.TextureLoader().load(PACK_DIR + wear + '.png', () => { _packModels[wear] = { geo: _packGeometry(json), tex }; },
    undefined, (e) => { _packModels[wear] = 'failed'; console.error('backpack sheet ' + wear + ':', e); });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
  tex.generateMipmaps = true;
}
/* The pack `id` is, as a mesh positioned for the TORSO group (which pivots at the hips with 12px of body above
   it), or null while its files are still loading (or it has none). Each mesh gets its own copy of the geometry
   and its own material (a body lights its own, and whoever takes a pack off disposes of both); they share the
   sheet. */
function buildBackpackNode(id) {
  const wear = ITEM_PROPS[id]?.wear;
  if (!wear) return null;
  const model = _packModels[wear];
  if (!model) { _loadPackModel(wear); return null; }
  if (typeof model === 'string') return null;      // loading, or failed
  return new THREE.Mesh(model.geo.clone(), new THREE.MeshBasicMaterial({ map: model.tex, transparent: true, alphaTest: 0.5 }));
}
/* Hung off the torso rather than the root, so it leans with a sneak and tips with the model in a
   bed. Its material joins m.mats — the list shadeHumanoid walks — so the pack darkens at night
   and flashes with the body when its wearer is hurt, instead of glowing on an unlit player. */
function poseBodyBack(m, id) {
  if (!m || !m.torso) return;
  const want = isBackpackId(id);
  // another kind of pack than the one on the back: that one comes off first
  if (m.packNode && want && m._packBuilt !== id) {
    m.torso.remove(m.packNode);
    if (m.mats) m.mats = m.mats.filter(mt => mt !== m.packNode.material);
    m.packNode.geometry.dispose();
    m.packNode.material.dispose();
    m.packNode = null;
  }
  if (!want && !m.packNode) { m._packId = null; return; }
  if (want && !m.packNode) {
    const node = buildBackpackNode(id);
    if (!node) { m._packId = null; return; }       // its model is not in yet: asked again next frame
    m.packNode = node;
    m._packBuilt = id;
    m.torso.add(m.packNode);
    if (m.mats) m.mats.push(m.packNode.material); else m.mats = [m.packNode.material];
  }
  m._packId = want ? id : null;
  m.packNode.visible = want;
}
