'use strict';
/* player/inventory.js: what a player carries. Which blocks can be held, a slot's extra data (meta), the sizes of the
   hotbar and grids, the creative palette's order, and loading the inventory of a mode. */

/* ---------------------------------- block edit actions ---------------------------------- */
// every placeable block, straight from the registry (raycastable excludes water/air) —
// new blocks registered in blocks/blocks.js automatically appear in the inventory
const PLACEABLE = PROPS.map((p, id) => (p && id !== B.AIR && p.raycast && !p.noInv) ? id : -1).filter(id => id >= 0);

/* ---- disabled blocks ----
   Slabs and stairs are switched OFF, not deleted: their PROPS entries, meshes, collision boxes
   and merge rules all stay, so worlds that already contain them still load, render and break
   normally. They simply have no way IN any more — no creative palette entry, no recipe.
   Deliberately NOT filtered out of PLACEABLE, because _isValidId reads that list to decide
   whether a saved slot survives a load: dropping them there would quietly bin the slabs sitting
   in someone's existing survival chest. */
// ...empty since 0.783: slabs and stairs are no longer blocks at all, but chisel shapes of the full block
const DISABLED_BLOCKS = new Set();
const isDisabledBlock = (id) => id != null && id < 256 && DISABLED_BLOCKS.has(id);
// an obtainable id: what the creative palette lists and what a recipe is allowed to hand out
const isObtainable = (id) => !isDisabledBlock(id);

// Inventories are per game mode:
//  - creative: reset to default (one of every block, sorted by ID) every time creative is entered
//  - survival: empty on first join, persists in localStorage, never touched by creative
// Storage keys are namespaced so switching modes cannot leak into the survival inventory.
// Slot model: `null` (empty) OR `{id, count}` where `count >= 1`. Stack cap comes from
// PROPS[id].stack (blocks default 60; future items can set 20/99/etc.).
/* every stack is smaller. In the registries (blocks/blocks.js, items/items.js): items 79 (99 before), blocks 50 (60),
   and the small "special" stacks ten less (a bowl, a snowball or a golden apple 20, a bucket or a stew 10, a melon
   slice 30). A stack saved bigger than it may be now is split when its world is joined (restackInventory, 15-drops.js). */
const DEFAULT_STACK = 50;
const _baseStack = (id) => id >= 256 ? (ITEM_PROPS[id]?.stack ?? DEFAULT_STACK) : (PROPS[id]?.stack ?? DEFAULT_STACK);
// Pack Rat: blocks that stack at all stack 10 higher
/* 20 more on an item's stack (79 -> 99), 10 more on a block's (50 -> 60), nothing on the special ones (under
   PACK_RAT_MIN). By the stack's size, so the plants and torches that stack as items do (79) get the 20 too. */
const PACK_RAT_ITEMS = 20, PACK_RAT_BLOCKS = 10, PACK_RAT_MIN = 50, PACK_RAT_ITEM_STACK = 79;
const _packRatRoom = (id) => { const s = _baseStack(id); return s >= PACK_RAT_ITEM_STACK ? PACK_RAT_ITEMS : s >= PACK_RAT_MIN ? PACK_RAT_BLOCKS : 0; };
const stackSize = (id) => _baseStack(id) + ((typeof hasSkill === 'function' && hasSkill('packRat')) ? _packRatRoom(id) : 0);
const STACK_SANE_MAX = 999;                    // the most a saved slot may claim: over its stack it is split, not thrown away
/* A tool or piece of gear at 0 durability only exists with the Mender skill: broken, kept, useless
   until repaired. Every place that asks what the held item DOES asks through heldUseId, so a
   broken pickaxe mines like a bare hand and a broken sword hits like one. */
const slotBroken = (s) => !!s && s.dur === 0;
const heldUseId = () => { const s = HOTBAR[hotbarSel]; return s && !slotBroken(s) ? s.id : null; };
const slotId    = (s) => s ? s.id : null;
const slotCount = (s) => s ? s.count : 0;
// tools carry their own durability in the slot (`dur` counts down; slot dies at 0)
const mkSlot    = (id, n = 1) => {
  const d = id >= 256 ? ITEM_PROPS[id]?.durability : null;
  const s = d ? { id, count: n, dur: d } : { id, count: n };
  // food comes into the world fresh; `fresh` is its spoilage clock in seconds (44-spoil.js)
  const f = typeof spoilMax === 'function' ? spoilMax(id) : (id >= 256 ? ITEM_PROPS[id]?.spoil : null);   // blocks too
  if (f) s.fresh = f;
  return s;
};
/* A slot's per-instance extras beyond id, count and wear: `fresh` is food's spoilage clock
, `wm` marks a tool or piece of gear as Well made (the Fine Work skill). Every path that
   moves a slot through the world — a throw, a drop, a pickup, a chest, a save — carries them as one
   object, so a new field only has to be added to this list. */
// ...and `lock`: the lock code a key is bound to (blocks/doors.js)
const SLOT_META_KEYS = ['fresh', 'wm', 'lock'];
function slotMeta(s) {
  if (!s) return null;
  let m = null;
  for (const k of SLOT_META_KEYS) if (s[k] != null) (m || (m = {}))[k] = s[k];
  return m;
}
function applyMeta(t, m) {
  if (t && m) for (const k of SLOT_META_KEYS) if (m[k] != null) t[k] = m[k];
  return t;
}
// split/move n items out of an existing slot, KEEPING its wear and its extras
const carrySlot = (src, n) => {
  const t = mkSlot(src.id, n);
  if (src.dur != null) t.dur = src.dur;
  return applyMeta(t, slotMeta(src));
};
/* ---- inventory shape ----
   One place decides how many slots there are, because a dozen files used to spell "9" and "27"
   out by hand. The grid is INV_COLS wide; the hotbar is one row of the same width, so the two
   line up on screen and a quick-move lands where you expect. */
const INV_COLS = 8, INV_ROWS = 4;
const HOTBAR_SLOTS = INV_COLS;                 // 8
// ...and up to 2 more a worn belt opens (hotbarLen, player/equipment.js): every hotbar array holds HOTBAR_MAX
const HOTBAR_MAX = HOTBAR_SLOTS + 2;
const INV_SLOTS = INV_COLS * INV_ROWS;         // 32
const INV2_SLOTS = INV_SLOTS;                  // second grid matches (creative palette overflows it)

/* ---- creative palette order ----
   Hand-ordered rather than sorted by block id, because ids are a history of when things were
   ADDED and say nothing about what belongs next to what. Reads as: terrain, then the wood chain,
   then loose ground, then the stones, then the built materials, ores, and finally everything
   that stands ON the ground — furniture, then plants.

   Anything PLACEABLE but missing from this list still appears: it falls to the end in id order,
   so a newly registered block shows up on its own rather than vanishing until someone remembers
   to add it here. */
const CREATIVE_ORDER = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE,
  // the wood chain, each row every wood in the woods table's order (woods/woods.js)
  ...woodBlocks('log'), ...woodBlocks('stripped'), ...woodBlocks('hollow'), ...woodBlocks('planks'), ...woodBlocks('leaves'),
  B.SAND, B.RED_SAND, B.PINK_SAND, B.GLASSY_SAND,   // pink sand 0.822; glassy 0.824 (red and pink are its looks)
  B.SANDY_DIRT, B.GRAVEL, B.CLAY, B.SNOW, B.ICE, B.PACKED_ICE, B.BONE_BLOCK, B.SEASHELL_BLOCK, B.BONE_ASH_BLOCK, B.BEDROCK,   // ice 0.8321; bone block 0.833; packed ice 0.835
  B.MARBLE, B.GRANITE, B.LIMESTONE, B.DOLOMITE, B.BRICKS, B.ADOBE, B.SALT_CRUST, B.ASH,   // dolomite 0.809; adobe, salt crust 0.8091; ash 0.8191
  B.GLASS, B.GLOWSTONE, B.GLOWSTONE_SPENT, B.WOOL,   // spent 0.834
  // every ore together, the gem clusters right after the metals, then the blocks they press into
  B.COAL_ORE, B.IRON_ORE, B.TIN_ORE, B.COPPER_ORE, B.GOLD_ORE,
  B.DIAMOND_ORE, B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, B.TOPAZ_ORE,
  // storage blocks in ore order: the topaz block right after sapphire's, then the raw metals
  B.COAL_BLOCK, B.CHARCOAL_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.TIN_BLOCK, B.COPPER_BLOCK,
  B.DIAMOND_BLOCK, B.EMERALD_BLOCK, B.RUBY_BLOCK, B.SAPPHIRE_BLOCK, B.TOPAZ_BLOCK,
  B.RAW_IRON_BLOCK, B.RAW_GOLD_BLOCK, B.RAW_TIN_BLOCK, B.RAW_COPPER_BLOCK,
  B.SULFUR_BLOCK, B.SULFUR_UP_TIP, B.GLOWCRYSTAL_BLOCK, B.GLOWCRYSTAL_SPENT, B.OBSIDIAN,
  B.SANDSTONE, B.RED_SANDSTONE, B.PINK_SANDSTONE, B.FIBER_BLOCK, B.CACTUS,
  B.CRAFTING_BENCH, B.FURNACE, B.MORTAR, B.TNT, B.HAY, B.BED, B.CHEST, B.METAL_CHEST, B.LADDER, B.STRUCTURE_BLOCK,   // doors are a hammer shape; metal chest 0.843
  B.MELON, B.PUMPKIN, B.CARVED_PUMPKIN, B.JACK_O_LANTERN, B.CANTALOUPE, B.SUGAR_CANE, B.TORCH,   // cantaloupe 0.8091, carved 0.824
  B.CRYSTAL_TORCH, B.TORCH_UNLIT,                                                                // 0.834
  B.RED_MUSHROOM, B.BROWN_MUSHROOM, B.BLUE_MUSHROOM, B.BLACK_MUSHROOM, B.WHITE_TALL_MUSHROOM, B.YELLOW_MUSHROOM, B.LAVA_MUSHROOM,   // 0.8091; yellow 0.822
  ...woodBlocks('sapling'),
  B.SHORT_GRASS, B.TALLGRASS, B.DRY_GRASS, B.DRY_BUSH, B.POPPY, B.ORCHID, B.PINCUSHION, B.WHEAT,   // dry grass and bush 0.84
  B.REDBERRY_BUSH, B.BLUEBERRY_BUSH, B.BLACKBERRY_BUSH, B.YELLOWBERRY_BUSH, B.WHITEBERRY_BUSH,   // yellow, white 0.827
  B.FLINT_ROCK, B.STONE_PEBBLE, B.SEASHELL,   // stone pebble 0.8095
  B.GLOW_VINE, B.COBWEB,
];
function _defaultCreativeInventory() {
  const rank = new Map();
  CREATIVE_ORDER.forEach((id, i) => rank.set(id, i));
  const rankOf = (id) => rank.has(id) ? rank.get(id) : CREATIVE_ORDER.length + id;
  // blocks in palette order, then a few useful items (infinite water bucket) appended
  const sorted = PLACEABLE.filter(id => isObtainable(id) && !PROPS[id].noCreative)   // not the grilled mushrooms
                          .sort((a, b) => rankOf(a) - rankOf(b))
                          .concat([ITEM.WATER_BUCKET, ITEM.LAVA_BUCKET, ITEM.BUILD_WAND, ITEM.BREAK_WAND, ITEM.FIRE]);   // the wands 0.8371 / 0.8374; fire 0.845
  /* The hotbar starts EMPTY. Creative used to deal the first eight blocks into it, which
     meant every session opened holding grass, dirt and stone whether or not that was what you
     wanted — and the palette read as if it began at slot nine. The whole palette lives in the
     grids now, and you carry whatever you choose to drag down. */
  const hot = new Array(HOTBAR_MAX).fill(null);
  const inv = new Array(INV_SLOTS).fill(null);
  // overflow palette — scrolls in the UI. Sized well past the current block count so newly
  // registered blocks (structure block, spruce set, ...) don't silently fall off the end.
  // ...and 5 empty rows past the last block, since the 72 had filled up
  const inv2 = new Array(Math.max(72, Math.ceil((sorted.length - INV_SLOTS) / INV_COLS) * INV_COLS + 5 * INV_COLS)).fill(null);
  for (let i = 0; i < sorted.length; i++) {
    if (i < INV_SLOTS) inv[i] = mkSlot(sorted[i]);
    else if (i - INV_SLOTS < inv2.length) inv2[i - INV_SLOTS] = mkSlot(sorted[i]);
  }
  return { hot, inv, inv2 };
}

/* Reshape a saved stash into the current slot counts without losing anything. A world written
   before 0.7292 has a 9-slot hotbar and 27-slot grids; trimming those with _validArr alone would
   quietly bin whatever sat in the slots that no longer exist. Instead everything is poured into
   one list and dealt back out, so the items survive even though their positions shift once. */
function migrateStash(hot, inv, inv2) {
  // a stash already in today's shape keeps every slot where it was (a hotbar of 8 from before the belt's slots is padded)
  if (Array.isArray(hot) && (hot.length === HOTBAR_SLOTS || hot.length === HOTBAR_MAX) && Array.isArray(inv) && inv.length === INV_SLOTS
      && (inv2 == null || (Array.isArray(inv2) && inv2.length === INV2_SLOTS)))
    return { hot: _validArr(hot, HOTBAR_MAX), inv: _validArr(inv, INV_SLOTS), inv2: _validArr(inv2, INV2_SLOTS) };
  const all = [];
  for (const a of [hot, inv, inv2])
    if (Array.isArray(a)) for (const s of a) { const v = _validateSlot(s); if (v) all.push(v); }
  const out = { hot: new Array(HOTBAR_MAX).fill(null),
                inv: new Array(INV_SLOTS).fill(null),
                inv2: new Array(INV2_SLOTS).fill(null) };
  let i = 0;
  for (const key of ['hot', 'inv', 'inv2'])   // the hotbar's belt slots stay empty: no belt is known yet
    for (let j = 0; j < (key === 'hot' ? HOTBAR_SLOTS : out[key].length) && i < all.length; j++) out[key][j] = all[i++];
  return out;
}
// Legacy inventories were arrays of raw IDs; migrate on load so old saves stack from 1.
const _isValidId = (id) => id >= 256 ? ITEM_PROPS[id] != null : PLACEABLE.includes(id);
function _validateSlot(v) {
  if (v === null) return null;
  // an old slab or stairs item (before 0.783) comes back as the full block it was made of
  if (typeof v === 'number') v = legacyItemId(v);
  else if (v && typeof v === 'object' && legacyItemId(v.id) !== v.id) v = { ...v, id: legacyItemId(v.id) };
  // an old oak door item (doors are a hammer shape now) comes back as the 3 oak planks a door takes
  if (v === B.DOOR) v = { id: B.PLANKS, count: 3 };
  else if (v && typeof v === 'object' && v.id === B.DOOR) v = { id: B.PLANKS, count: Math.min(stackSize(B.PLANKS), Math.max(1, v.count | 0) * 3) };
  if (typeof v === 'number' && _isValidId(v)) return mkSlot(v);
  /* a count over the stack is kept (it was thrown away past stackSize + Pack Rat's room): stacks got smaller, and
     restackInventory splits it as the world is joined */
  if (v && typeof v === 'object' && _isValidId(v.id)
      && Number.isInteger(v.count) && v.count >= 1 && v.count <= STACK_SANE_MAX) {
    const out = { id: v.id, count: v.count };
    const maxD = v.id >= 256 ? ITEM_PROPS[v.id]?.durability : null;   // keep tool wear across saves
    // 0 is a broken tool kept by Mender, not a corrupt one: it comes back broken, not repaired
    if (maxD) out.dur = Number.isInteger(v.dur) && v.dur >= 0 && v.dur <= maxD ? v.dur : maxD;
    // ...and its freshness. A save written before food spoiled has none: it comes back fresh
    const maxF = typeof spoilMax === 'function' ? spoilMax(v.id) : (v.id >= 256 ? ITEM_PROPS[v.id]?.spoil : null);   // 0.7992
    if (maxF) out.fresh = Number.isFinite(v.fresh) && v.fresh >= 0 && v.fresh <= maxF ? v.fresh : maxF;
    if (maxD && v.wm) out.wm = 1;                  // Well made only means anything on something that wears
    if (v.id >= 256 && ITEM_PROPS[v.id]?.key && Number.isInteger(v.lock)) out.lock = v.lock;   // a key's door
    return out;
  }
  return null;
}
function _loadSurvivalArr(key, len) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(s) && s.length === len) return s.map(_validateSlot);
  } catch {}
  return new Array(len).fill(null);
}
const _validArr = (a, len) => {
  const out = new Array(len).fill(null);
  if (Array.isArray(a)) for (let i = 0; i < len; i++) out[i] = _validateSlot(a[i]);
  return out;
};
var currentInvMode = localStorage.getItem('vg_mode') === 'survival' ? 'survival' : 'creative';
// per-world survival items: lives in memory, persisted inside the world save (vg_world_<id>)
// inv2 = second grid. Creative: overflow block palette. Survival: the backpack's contents, shown
// only while one is worn and sized by that pack (41-backpack.js).
var survStash = { hot: new Array(HOTBAR_MAX).fill(null), inv: new Array(INV_SLOTS).fill(null), inv2: new Array(INV2_SLOTS).fill(null) };
var HOTBAR, invSlots, invSlots2;
function loadInventoryForMode(mode) {
  currentInvMode = mode;
  if (mode === 'creative') {
    const d = _defaultCreativeInventory();
    HOTBAR = d.hot; invSlots = d.inv; invSlots2 = d.inv2;     // wiped fresh — no save; creative is ephemeral
  } else {
    if (!survStash.inv2) survStash.inv2 = new Array(INV2_SLOTS).fill(null);   // migrate older saves
    HOTBAR = survStash.hot; invSlots = survStash.inv; invSlots2 = survStash.inv2;   // live refs — world save persists them
  }
  // equipment follows the same survival/creative split. Guarded: this runs once at script-load
  // time, before player/equipment.js has been parsed.
  if (typeof loadEquipForMode === 'function') loadEquipForMode(mode);
}
loadInventoryForMode(currentInvMode);
const saveHotbar = () => { if (currentInvMode === 'survival') survStash.hot = HOTBAR; };
const saveInv    = () => { if (currentInvMode === 'survival') { survStash.inv = invSlots; survStash.inv2 = invSlots2; } };
const saveAll = () => { saveHotbar(); saveInv(); if (typeof saveEquip === 'function') saveEquip(); };
var hotbarSel = 0;
