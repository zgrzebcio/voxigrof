'use strict';
/* player/equipment.js: worn equipment. The slots and what each takes, armor points and wear, set bonuses, saving, and
   gear that puts itself on. */

/* voxiGrof — equipment: armor slots, the equipment panel, and the live player preview.
   (31-armor.js until 0.82. The stat getters the panel lists and the timed effects moved to player/stats.js;
   what stays here is what the worn gear itself is: slots, armor points and wear, set bonuses, the preview.)

   Layout follows the design sketch: two columns of five slots flanking a player preview, with a
   stats readout underneath.
     left  column: helmet, necklace, chestplate, leggings, boots
     right column: back, belt, gloves, accessories, offhand
   Necklace and accessories are still placeholders, reserved so the layout and save format do not
   have to change when their items exist; every other slot has something that goes in it.

   Armor points: 100 = the full 5-icon bar above the health (20 until 0.82), and incoming damage is
   reduced proportionally (see armorDamageMultiplier). */

const EQUIP_SLOTS = [
  { key: 'helmet',      label: 'Helmet',      col: 'l', accepts: 'helmet'     },
  { key: 'necklace',    label: 'Necklace',    col: 'l', accepts: 'necklace'   },   // for now the hammer, which unlocks variants
  { key: 'chestplate',  label: 'Chestplate',  col: 'l', accepts: 'chestplate' },
  { key: 'leggings',    label: 'Leggings',    col: 'l', accepts: 'leggings'   },
  { key: 'boots',       label: 'Boots',       col: 'l', accepts: 'boots'      },
  { key: 'back',        label: 'Back',        col: 'r', accepts: 'back'       },   // backpacks
  { key: 'belt',        label: 'Belt',        col: 'r', accepts: 'belt'       },
  { key: 'gloves',      label: 'Gloves',      col: 'r', accepts: 'gloves'     },
  { key: 'accessories', label: 'Accessories', col: 'r', accepts: 'accessories' },  // "Others": the chisel
  { key: 'offhand',     label: 'Offhand',     col: 'r', accepts: 'offhand'    },   // shields
];
// blocks the OFFHAND slot takes besides shields: carried, lit, and placed from there
const OFFHAND_BLOCKS = new Set([B.TORCH, B.CRYSTAL_TORCH, B.TORCH_UNLIT]);   // every torch
const EQUIP_INDEX = {};
EQUIP_SLOTS.forEach((s, i) => { EQUIP_INDEX[s.key] = i; });

// live array, indexed to match EQUIP_SLOTS. Swapped out with the inventory on mode change.
var equipSlots = new Array(EQUIP_SLOTS.length).fill(null);

/* Belt: wearing one opens a row of quick-access slots above the equipment panel, sized by the
   belt's own `beltSlots`. They are reserved for utility gear (lantern, spyglass, map, compass,
   clock) — items tagged `beltItem: true`. None exist yet, so the row renders as placeholders. */
const BELT_MAX = 5;
var beltSlots = new Array(BELT_MAX).fill(null);
// how many belt slots are currently usable (0 = no belt worn)
function beltCapacity() {
  const s = equipSlots[EQUIP_INDEX.belt];
  const n = s && ITEM_PROPS[s.id]?.beltSlots;
  return Math.min(BELT_MAX, n || 0);
}
const beltAccepts = (i, id) =>
  i < beltCapacity() && id != null && id >= 256 && !!ITEM_PROPS[id]?.beltItem;
/* How many hotbar slots are in use: in survival the bar's own HOTBAR_SLOTS and the worn belt's `hotbarSlots` (the
   leather belt's 2: slots 9 and 10, keys 9 and 0), in creative all HOTBAR_MAX (12: keys - and = are 11 and 12). HOTBAR
   always holds HOTBAR_MAX slots (player/inventory.js); the ones past this are empty and hidden. Everything that fills or
   picks a hotbar slot counts to this, not HOTBAR.length. */
function hotbarLen() {
  if (currentInvMode === 'creative') return HOTBAR_MAX;
  const s = typeof equipSlots !== 'undefined' ? equipSlots[EQUIP_INDEX.belt] : null;
  return Math.min(HOTBAR_BELT_MAX, HOTBAR_SLOTS + ((s && ITEM_PROPS[s.id]?.hotbarSlots) || 0));
}

/* Called after any equipment change. Slots beyond the current capacity (belt removed, or
   swapped for a smaller one) spill back into the player's grids, dropping on the floor rather
   than vanishing if there is no room. */
function syncBeltCapacity() {
  const cap = beltCapacity();
  const back = (s) => {
    for (let n = 0; n < s.count; n++)
      if (!tryPickup(s.id, s.dur ?? null, 'unpacked', slotMeta(s)))
        spawnDrop(s.id, Math.floor(player.pos.x), Math.floor(player.pos.y + 0.5), Math.floor(player.pos.z),
                  undefined, undefined, s.dur ?? null, slotMeta(s));
  };
  for (let i = cap; i < beltSlots.length; i++) {
    const s = beltSlots[i];
    if (!s) continue;
    beltSlots[i] = null;
    back(s);
  }
  // ...and the hotbar slots the belt gave: emptied into the rest of the inventory, the selection pulled back onto the bar
  const n = hotbarLen();
  let moved = false;
  for (let i = n; i < HOTBAR.length; i++) {
    const s = HOTBAR[i];
    if (!s) continue;
    HOTBAR[i] = null;
    back(s);
    moved = true;
  }
  if (hotbarSel >= n) hotbarSel = n - 1;
  if (typeof hotbarEl !== 'undefined' && hotbarEl && hotbarSlotEls().length !== n) { saveHotbar(); buildHotbar(); }
  else if (moved) { saveHotbar(); buildHotbar(); }
}

// does this item belong in that slot? placeholders accept nothing
function equipAccepts(slotIdx, id) {
  const want = EQUIP_SLOTS[slotIdx] && EQUIP_SLOTS[slotIdx].accepts;
  if (want === 'offhand' && id != null && OFFHAND_BLOCKS.has(id)) return true;   // a torch
  if (!want || id == null || id < 256) return false;
  // no necklace exists yet: the neck holds the chisel, which unlocks block variants (only the chisel since 0.803)
  if (want === 'necklace') return id === ITEM.CHISEL;
  return ITEM_PROPS[id]?.equip === want;
}

/* ---------------------------------- stats ---------------------------------- */
const MAX_ARMOR = 100, ARMOR_QUARTER = 5;          // 0.82: out of 100, and a quarter icon is 5 points
function playerArmorPoints() {
  let n = 0;
  for (const s of equipSlots) if (s && !slotBroken(s) && ITEM_PROPS[s.id]?.armor) n += ITEM_PROPS[s.id].armor;
  return Math.min(MAX_ARMOR, n);
}
/* The armor bar is MIXED. It used to pick ONE sprite set for the whole row — the
   highest-value piece won — so an iron chestplate over leather trousers drew a row of solid iron.
   The pieces inside one icon can come from DIFFERENT materials: that is exactly the case the
   part sprites exist for. So the bar is driven by a flat list of one material per QUARTER icon
   (ARMOR_QUARTER points, 0.82; one per point before), in a fixed equipment order, rather than by a
   single "which material wins" answer. The armorMat names are returned as they are.
   Capped at the bar's 20 quarters to match playerArmorPoints, so the list and the total agree. */
const ARMOR_BAR_ORDER = ['helmet', 'chestplate', 'leggings', 'boots', 'gloves'];
function playerArmorPointMats() {
  const out = [], cap = MAX_ARMOR / ARMOR_QUARTER;
  for (const key of ARMOR_BAR_ORDER) {
    const s = equipSlots[EQUIP_INDEX[key]];
    const p = s && !slotBroken(s) && ITEM_PROPS[s.id];
    if (!p || !p.armor) continue;
    const mat = p.armorMat || 'iron';
    for (let i = 0, n = Math.round(p.armor / ARMOR_QUARTER); i < n && out.length < cap; i++) out.push(mat);
  }
  return out;
}
// cheap change-detector for the HUD: repaint the bar when the MIX changes, not just the total
const armorBarSignature = () => playerArmorPointMats().join(',');
/* The share of a hit that gets through. Armor soaks 0.8% a point up to 80% (4% of 20 points before 0.82).
   Thick Skin added 10% on top until 0.8446: it is health only now (THICK_SKIN_HP, player/stats.js). */
const ARMOR_SOAK_PER_POINT = 0.008;
// ...less what effects take off it (`damageReduction`: the summer curse -1% a stack, entities/pharaoh.js); under 0, more gets through
function armorDamageMultiplier() {
  const fx = typeof _effectSum === 'function' ? _effectSum('damageReduction') : 0;
  return 1 - Math.max(-1, Math.min(0.8, playerArmorPoints() * ARMOR_SOAK_PER_POINT) + fx);
}
/* Armour wear follows the blow: every worn piece loses three quarters of the damage taken,
   rounded, and never less than 2. It used to lose a flat 1 however hard the hit, so a set lasted ages. */
const armorWearFor = (hit) => Math.max(2, Math.round(hit * 0.75));
// durability charged to every worn piece on a damaging hit
function damageArmorDurability(hit = 1) {
  let changed = false;
  for (let i = 0; i < equipSlots.length; i++) {
    const s = equipSlots[i];
    if (!s || s.dur == null) continue;
    // a shield wears only when it actually STOPS something (40-shield.js) — never from a hit
    // it did not take, and certainly not from a fall
    if (ITEM_PROPS[s.id]?.shield) continue;
    if (s.dur <= 0) continue;                     // broken and kept (Mender): nothing left to wear
    if (wearSlot(s, armorWearFor(hit)) === 'gone') equipSlots[i] = null;
    changed = true;
  }
  if (changed) { saveEquip(); if (invOpen) buildEquipPanel(); }
}
/* Worn-gear stat totals. Every modifier is additive across pieces, so a full iron set (helmet,
   chest, legs, boots, gloves) stacks its five penalties into -4% move speed (halved, -8% before). */
function _equipSum(field) {
  let n = 0;
  for (const s of equipSlots) {
    const v = s && !slotBroken(s) && ITEM_PROPS[s.id]?.[field];
    if (typeof v === 'number') n += v;
  }
  return n;
}

/* ---------------------------------- set bonuses ----------------------------------
   Wear all FOUR body pieces of one material and the set does something the pieces alone do not.
   Gloves are deliberately excluded from the test: they are the cheap fifth piece, and letting
   them gate the bonus would mean the bonus vanished the moment a pair broke.

   A bonus is permanent while the set is on — it is not a timer — so it reports `time: Infinity`
   and the panel prints an infinity sign instead of a countdown. Taking a piece off, or wearing
   one out, drops the set and the effect with it, because nothing is stored: it is recomputed from
   what is equipped every time it is asked for. */
const ARMOR_SET_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
const ARMOR_SET_BONUS = {
  // toughness is knockback resistance in percent, 100% = never knocked back
  iron:    { name: 'Toughness', toughness: 0.20, good: true,
             desc: 'Full set: +20% toughness' },
  /* Leather does NOT slow you down — it blunts the slowdown the GROUND inflicts. Wading through
     leaf litter and deep snow costs 30% less than it does barefoot, which is what soft boots are
     actually for. It is a multiplier on the penalty, not on your speed. */
  leather: { name: 'Slowness resistance',  terrainDrag: 0.30, good: true,
             desc: 'Full set: leaf and snow slowdown 30% weaker' },
  /* Cloth: 40% less from sandstorms and heatstroke, read by the 0.825 weather (player/stats.js): heatstroke
     builds 40% slower, and a sandstorm slows you and drains your stamina 40% less. */
  cloth:   { name: 'Weather resistance', sandstormResist: 0.40, heatstrokeResist: 0.40, good: true,
             desc: 'Full set: 40% resistance to sandstorms and heatstroke' },
  // Bronze: 35% less from what is shot or thrown at you: arrows, a boss's fireballs and beams (playerProjectileMul)
  bronze:  { name: 'Projectile resistance', projectileResist: 0.35, good: true,
             desc: 'Full set: 35% less damage from arrows and other projectiles' },
  // Gold: 10% more of every XP earned (addXP, player/leveling.js)
  golden:  { name: 'Gilded', xpBonus: 0.10, good: true,
             desc: 'Full set: +10% XP on everything you earn' },
};
// the material every body piece shares, or null if the set is incomplete or mismatched
function playerArmorSet() {
  let mat = null;
  for (const key of ARMOR_SET_SLOTS) {
    const s = equipSlots[EQUIP_INDEX[key]];
    const m = s && !slotBroken(s) && ITEM_PROPS[s.id]?.armorMat;
    if (!m) return null;
    if (mat === null) mat = m;
    else if (m !== mat) return null;
  }
  return mat;
}
const armorSetBonus = () => ARMOR_SET_BONUS[playerArmorSet()] || null;
// what a projectile's damage is multiplied by for player `p` (the bronze set): read with p's own gear installed
const playerProjectileMul = (p) => 1 - ((typeof withPlayer === 'function' ? withPlayer(p, armorSetBonus) : armorSetBonus())?.projectileResist || 0);
/* Toughness, move speed and the other stat getters, and the timed effects (EFFECT_DEFS, the effect bar),
   moved to player/stats.js in 0.82. */

/* ---------------------------------- persistence ---------------------------------- */
// creative gets its own throwaway set so survival gear is never touched
var survEquip = new Array(EQUIP_SLOTS.length).fill(null);
var survBelt  = new Array(BELT_MAX).fill(null);
function saveEquip() {
  if (currentInvMode === 'survival') { survEquip = equipSlots; survBelt = beltSlots; }
}
function loadEquipForMode(mode) {
  equipSlots = mode === 'survival' ? survEquip : new Array(EQUIP_SLOTS.length).fill(null);
  beltSlots  = mode === 'survival' ? survBelt  : new Array(BELT_MAX).fill(null);
}
const _packSlots = (arr) => arr.map(s => s ? [s.id, s.count, s.dur ?? null, s.fresh ?? null, s.wm ? 1 : 0] : null);
/* Accepts BOTH shapes a save can hold. Worn gear only ever came back from packed
   [id, count, dur] arrays — but the per-profile record, which is what every world with a profile
   actually restores from, was written with the live slot objects, so every load threw all of it
   away. And the id had to be an ITEM, so a torch in the offhand (a block) was dropped even from a
   correctly packed save. Saves already written with raw objects get their gear back. */
function _unpackSlots(list, len) {
  const out = new Array(len).fill(null);
  if (Array.isArray(list))
    for (let i = 0; i < len && i < list.length; i++) {
      const s = list[i];
      if (!s) continue;
      const arr = Array.isArray(s);
      const id = arr ? s[0] : s.id, n = arr ? s[1] : s.count, dur = arr ? s[2] : s.dur;
      const fresh = arr ? s[3] : s.fresh, wm = arr ? s[4] : s.wm;   // 0.79
      if (typeof id !== 'number' || id <= 0 || !(id >= 256 ? ITEM_PROPS[id] : PROPS[id])) continue;
      const slot = mkSlot(id, Math.min(stackSize(id), Math.max(1, n | 0)));
      if (dur != null) slot.dur = dur;
      if (fresh != null && slot.fresh != null) slot.fresh = Math.max(0, Math.min(slot.fresh, +fresh || 0));
      if (wm && slot.dur != null) slot.wm = 1;
      out[i] = slot;
    }
  return out;
}
/* The SURVIVAL set, not whatever is live: saving while the world sat in creative packed the empty
   creative array over the real gear. In survival the two are the same array anyway. */
function serializeEquip() { return _packSlots(survEquip); }
function serializeBelt()  { return _packSlots(survBelt); }

/* ---- equipment that fills itself ----
   A batch of torches tops up a part-used offhand stack before it goes anywhere else, whether it
   was crafted or picked up; a freshly CRAFTED piece of gear goes straight into its slot when that
   slot is empty. Gear picked up off the floor is not auto-worn — you may not want it on. */
function offhandRoom(id, dur) {
  if (typeof player === 'undefined' || player.canFly || dur != null || id == null) return 0;
  const s = equipSlots[EQUIP_INDEX.offhand];
  return s && s.id === id && s.dur == null ? Math.max(0, stackSize(id) - s.count) : 0;
}
function offhandTopUp(id, n, fresh = null) {
  const t = Math.min(n, offhandRoom(id, null));
  if (t <= 0) return 0;
  stackInto(equipSlots[EQUIP_INDEX.offhand], t, fresh);
  saveEquip();
  if (invOpen && typeof buildInventory === 'function') buildInventory();
  return t;
}
// the equipment slot an item or block belongs in, torches included, or -1
function equipSlotFor(id) {
  if (id == null) return -1;
  // an item's own slot first, so the hammer still goes to Others and only reaches the neck when dragged
  const own = id >= 256 ? EQUIP_SLOTS.findIndex(s => s.accepts === ITEM_PROPS[id]?.equip) : -1;
  if (own >= 0) return own;
  for (let k = 0; k < EQUIP_SLOTS.length; k++) if (equipAccepts(k, id)) return k;
  return -1;
}
// the empty slot a newly made piece drops straight into, or -1
function autoEquipSlot(id) {
  if (typeof player === 'undefined' || player.canFly || id == null || id < 256) return -1;
  const want = ITEM_PROPS[id]?.equip;
  if (!want) return -1;
  const i = EQUIP_SLOTS.findIndex(s => s.accepts === want);
  return i >= 0 && !equipSlots[i] ? i : -1;
}
function restoreEquip(list, beltList) {
  survEquip = _unpackSlots(list, EQUIP_SLOTS.length);
  survBelt  = _unpackSlots(beltList, BELT_MAX);
  if (currentInvMode === 'survival') { equipSlots = survEquip; beltSlots = survBelt; }
}
