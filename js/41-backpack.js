'use strict';
/* voxiGrof — the backpack (0.75)

   Worn in the BACK equipment slot (31-armor.js), which until now took nothing. Wearing one opens
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
  return (arr === invSlots2 && !player.canFly) ? backpackCapacity() : arr.length;
}
/* Called after any equipment change, exactly as syncBeltCapacity is. Anything past the new capacity
   (the pack taken off, or traded for a smaller one) goes back into the BASE inventory: the main grid
   first, then the hotbar, topping up stacks before taking empty slots (0.755). Whatever still does not
   fit is thrown out in front of the player rather than dropped at their feet. It used to go through
   tryPickup one item at a time, which filled the hotbar before the main grid and fed a "+1 unpacked"
   line for every single item. */
function stowIntoBase(s) {
  const cap = stackSize(s.id);
  let left = s.count;
  if (s.dur == null)
    for (const g of [invSlots, HOTBAR])
      for (let i = 0; i < g.length && left > 0; i++) {
        const o = g[i];
        if (o && o.id === s.id && o.dur == null && o.count < cap) {
          const t = Math.min(cap - o.count, left);
          o.count += t; left -= t;
        }
      }
  for (const g of [invSlots, HOTBAR])
    for (let i = 0; i < g.length && left > 0; i++)
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
      throwFromPlayer(s.id, left, s.dur ?? null);
      if (typeof feedItem === 'function') feedItem(s.id, -left, 'dropped');
      thrown += left;
    }
  }
  if (spilled) { saveInv(); saveHotbar(); }
  if (thrown && typeof feedWarn === 'function') feedWarn('no room: backpack items dropped in front of you');
}

/* ---------------------------------- the worn pack ----------------------------------
   A real box on the back, not an extruded icon: the pack is the piece of gear other players see
   most, and a flat sprite would disappear edge-on. textures/Entity/backpack.png is a 128x128
   sheet in the ordinary 64-space skin layout (w8 h8 d4 based at 0,0), so _skinUV maps it with no
   special case — the same trick the skeleton's double-resolution sheet uses.

   The geometry is shallower than the sheet's four pixels of depth. UVs are fractions of the
   sheet, so squashing the box does not move them; it just stops the pack sticking out as far as
   the player's own chest is deep. */
const PACK_W = 8, PACK_H = 8, PACK_D = 4;        // the sheet's layout, in skin pixels
const PACK_DEPTH = 3.2;                          // how deep it actually sits off the back
let _packTex = null;
function _packMat() {
  if (!_packTex) {
    _packTex = new THREE.TextureLoader().load('textures/Entity/equipment/backpack.png');
    _packTex.colorSpace = THREE.SRGBColorSpace;
    _packTex.magFilter = THREE.NearestFilter;
    _packTex.minFilter = THREE.NearestFilter;
    _packTex.generateMipmaps = false;
  }
  return new THREE.MeshBasicMaterial({ map: _packTex, transparent: true, alphaTest: 0.5 });
}
// Positioned for the TORSO group, which pivots at the hips with 12px of body above it.
function buildBackpackNode() {
  const geo = new THREE.BoxGeometry(PACK_W * PX, PACK_H * PX, PACK_DEPTH * PX);
  _skinUV(geo, PACK_W, PACK_H, PACK_D, 0, 0);
  const mesh = new THREE.Mesh(geo, _packMat());
  mesh.position.set(0, 7 * PX, -(2 + PACK_DEPTH / 2) * PX);   // 2px = half the torso's depth
  return mesh;
}
/* Hung off the torso rather than the root, so it leans with a sneak and tips with the model in a
   bed. Its material joins m.mats — the list shadeHumanoid walks — so the pack darkens at night
   and flashes with the body when its wearer is hurt, instead of glowing on an unlit player. */
function poseBodyBack(m, id) {
  if (!m || !m.torso) return;
  const want = isBackpackId(id);
  if (!want && !m.packNode) { m._packId = null; return; }
  if (want && !m.packNode) {
    m.packNode = buildBackpackNode();
    m.torso.add(m.packNode);
    if (m.mats) m.mats.push(m.packNode.material); else m.mats = [m.packNode.material];
  }
  m._packId = want ? id : null;
  m.packNode.visible = want;
}
