'use strict';
/* blocks/variants.js: the variant bar. Picking a block's look or stage before placing it. */

/* voxiGrof — variants

   A variant is another look of the same block: stone can be laid as stone brick. It is NOT an item and
   not a stack of its own. The pick is per player and per block, so while brick is picked EVERY stone you
   carry shows, is held and places as brick, and a brick broken comes back as plain stone (blockDrop).
   Nothing is saved: every world you join starts on the default, which is always the first slot.

   The bar: seven slots above the vitals holding the held block's variants, the default in the middle,
   the 4th (VARIANT_POS; five until 0.809). A block with fewer leaves the rest empty. Hold R and scroll, or
   hold D-pad Right and press a bumper, to step through the real ones; tap R or D-pad Right twice
   to jump back to the default. A variant block takes the chisel shapes its own id supports
   (SHAPE_BLOCKS in 02).

   A variant needs the CHISEL worn in the NECK slot (only the chisel since 0.803); creative needs none. The bar is
   meant to switch ammo types later too: that will be one more entry in VARIANT_SOURCES, without a tool. */

const VARIANT_SLOTS = 7;                           // 5 until 0.809
/* block -> its variants after the default. An option is either a LOOK of the block, `{ id, look }`, kept in the cell's
   bits 16-23 (the table is LOOKS in blocks/looks.js, which gives each look its name and art), or a block of its own,
   `{ id }` (the few looks that are still ids: VARIANT_BLOCKS there), or variant bits, `{ id, bits }` (a cluster's bed, a
   furnace's rock, a bench's wood...). `name` goes in brackets. The order here is the order on the bar. */
const _looks = (base, ...nums) => nums.map(n => ({ id: base, look: n, name: CORE.LOOKS[base][n].key }));
const BLOCK_VARIANTS = {
  // stone: brick, mossy brick, polished, band, pillar, carved (cracked brick, look 3, left the bar: placed ones stay)
  [B.STONE]:        _looks(B.STONE, 1, 2, 4, 5, 6, 7),
  // every rock: brick, mossy brick, polished, band, pillar, carved (seven with the default: the bar is full)
  [B.GRANITE]:      _looks(B.GRANITE, 1, 2, 3, 4, 5, 6),
  [B.MARBLE]:       _looks(B.MARBLE, 1, 2, 3, 4, 5, 6),
  [B.LIMESTONE]:    _looks(B.LIMESTONE, 1, 2, 3, 4, 5, 6),
  [B.DOLOMITE]:     _looks(B.DOLOMITE, 1, 2, 3, 4, 5, 6),
  // the looks of glass; adobe; terracotta; obsidian; cobblestone; the sulfur block; the bone block; dirt
  [B.GLASS]:        _looks(B.GLASS, 1, 2, 3, 4),
  [B.ADOBE]:        _looks(B.ADOBE, 1, 2, 3, 4, 5),
  [B.BRICKS]:       _looks(B.BRICKS, 1, 2, 3, 4, 5),
  [B.OBSIDIAN]:     _looks(B.OBSIDIAN, 1, 2, 3),
  [B.COBBLE]:       _looks(B.COBBLE, 1, 2),
  [B.SULFUR_BLOCK]: _looks(B.SULFUR_BLOCK, 1, 2, 3),
  [B.BONE_BLOCK]:   _looks(B.BONE_BLOCK, 1, 2, 3),
  [B.DIRT]:         _looks(B.DIRT, 1, 2, 3),
  // the mortar's bowl in another rock
  [B.MORTAR]:       _looks(B.MORTAR, 1, 2, 3, 4),
  // every planks' brick: added below from the woods table
  // the sandstones: brick, polished, carved, mossy brick, cracked, cracked brick (seven with the default: the bar is full)
  [B.SANDSTONE]:      _looks(B.SANDSTONE, 1, 2, 3, 4, 5, 6),
  [B.RED_SANDSTONE]:  _looks(B.RED_SANDSTONE, 1, 2, 3, 4, 5, 6),
  [B.PINK_SANDSTONE]: _looks(B.PINK_SANDSTONE, 1, 2, 3, 4, 5, 6),
  // hay's thatch, a block of its own: it stays where it is put, unlike the bale (FALL_WHOLE_BLOCKS, blocks/falling.js);
  // carved thatch, the thatch brick and the mossy one are thatch's looks
  [B.HAY]:          [{ id: B.THATCH, name: 'thatch' }, { id: B.THATCH, look: 1, name: 'carved thatch' },
                     { id: B.THATCH, look: 2, name: 'thatch brick' }, { id: B.THATCH, look: 3, name: 'mossy thatch brick' }],
  // glassy sand's red and pink looks. Every one breaks into glass shards (blockDrop, 50)
  [B.GLASSY_SAND]:    _looks(B.GLASSY_SAND, 1, 2),
  // the cobweb tangled and in a corner (it breaks like the plain one: blockDrop, 50)
  [B.COBWEB]:         _looks(B.COBWEB, 1, 2),
  /* worked snow and ice: the snow brick and the ice brick are blocks of their own (they never fall or melt), the rest
     their looks, shown on the snow's and the ice's bar; the snow-ice brick is on both. Ice before snow: the snow brick
     is the snow's (_VARIANT_BASE) */
  [B.ICE]:            [{ id: B.ICE_BRICKS, name: 'brick' }, { id: B.SNOW_BRICKS, look: 1, name: 'snow-ice brick' },
                       { id: B.ICE_BRICKS, look: 1, name: 'carved' }],
  [B.SNOW]:           [{ id: B.SNOW_BRICKS, name: 'brick' }, { id: B.SNOW_BRICKS, look: 1, name: 'snow-ice brick' },
                       { id: B.SNOW_BRICKS, look: 2, name: 'carved' }],
};
for (const planks of woodBlocks('planks')) BLOCK_VARIANTS[planks] = _looks(planks, 1, 2);
// the default's own name in the tooltip's list of variants (ui/inventory.js); 'default' for the rest
const VARIANT_DEFAULT_NAME = {};
/* A gem cluster's bed: the same block with the rock in its variant bits rather than a block of
   its own, so an option can also carry `bits`, OR'd into the variant byte when it is placed. */
const _clusterBeds = (gem) => [['stone', 1], ['granite', 2], ['marble', 3], ['limestone', 4], ['dolomite', 5]]   // dolomite 0.809
  .map(([name, b]) => ({ id: gem, name, bits: b << CORE.CLUSTER_BED_SHIFT }));
for (const gem of [B.DIAMOND_ORE, B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, B.TOPAZ_ORE]) BLOCK_VARIANTS[gem] = _clusterBeds(gem);
/* A furnace in another rock and a bench or a chest in another wood: bits-only options like the
   cluster beds. The furnace keeps its rock in bits 3-5 and the bench its wood in bits 2-4 (V in 02); the
   chest its wood in bits 4-5 (CHEST_WOOD_SHIFT, blocks/chest.js). */
/* WHAT A PICK TAKES. Some picks take one more thing out of the bags as each goes down, given back when it is broken: every
   mossy look a vine; a chest, a bench and a bed planks of their wood; a furnace a block of its rock; a metal chest a block
   of its metal. `need` on an option (one of it), VARIANT_DEFAULT_NEED for a block's default, which takes it with the
   chisel off too (heldNeedOf). _doPlace (player/place-block.js) refuses without it and takes it as the block goes down
   (spendHeld, player/breaking.js); the bar shows it under each slot. Creative takes nothing. A cell that took one carries
   NEED_PAID, bit 31, so only it gives the thing back (paidNeedOf, read by blockDrop in 50-loottable.js): a chest found in
   the world gives no planks. A value rebuilt from its id and variant byte loses the bit (and its refund): keep the high
   bits when changing one (the chest's pairing, the furnace's fire do). */
const NEED_PAID = 0x80000000;
const _woodPlanks = (wood) => WOODS[wood]?.planks ?? null;    // a wood's planks by its name; null for one not in the game
const _rockBlock = (rock) => B[rock.toUpperCase()] ?? null;    // stone, granite, marble...
BLOCK_VARIANTS[B.FURNACE] = FURNACE_ROCKS.slice(1).map((name, i) => ({ id: B.FURNACE, name, bits: (i + 1) << V.FURNACE_ROCK_SHIFT, need: _rockBlock(name) }));
BLOCK_VARIANTS[B.CRAFTING_BENCH] = BENCH_WOODS.slice(1).map((name, i) => ({ id: B.CRAFTING_BENCH, name, bits: (i + 1) << V.BENCH_WOOD_SHIFT, need: _woodPlanks(name) }));
BLOCK_VARIANTS[B.CHEST] = CHEST_WOODS.slice(1).map((name, i) => ({ id: B.CHEST, name, bits: chestWoodBits(i + 1), need: _woodPlanks(name) }));   // acacia's high bit too
// the metal chest's metal the same way, in the same bits (CHEST_METALS in blocks/chest.js)
BLOCK_VARIANTS[B.METAL_CHEST] = CHEST_METALS.slice(1).map((m, i) => ({ id: B.METAL_CHEST, name: m.name, bits: (i + 1) << CHEST_WOOD_SHIFT, need: m.block }));
VARIANT_DEFAULT_NAME[B.METAL_CHEST] = CHEST_METALS[0].name;
// the bed's frame the same way, its wood in bits 4-5 (BED_WOOD_SHIFT in blocks/bed.js)
BLOCK_VARIANTS[B.BED] = BED_WOODS.slice(1).map((name, i) => ({ id: B.BED, name, bits: (i + 1) << BED_WOOD_SHIFT, need: _woodPlanks(name) }));
// a stone furnace is built of cobblestone: it takes a block of that, not of stone (its other rocks take their own)
const VARIANT_DEFAULT_NEED = {
  [B.FURNACE]: B.COBBLE, [B.CRAFTING_BENCH]: _woodPlanks(BENCH_WOODS[0]), [B.CHEST]: _woodPlanks(CHEST_WOODS[0]),
  [B.METAL_CHEST]: CHEST_METALS[0].block, [B.BED]: _woodPlanks(BED_WOODS[0]),
};
// every mossy look: a vine (the jungle's, woods/vines.js)
for (const k in BLOCK_VARIANTS) for (const v of BLOCK_VARIANTS[k]) if (v.look && /mossy/.test(v.name)) v.need = B.VINE;
VARIANT_DEFAULT_NAME[B.BED] = BED_WOODS[0];
VARIANT_DEFAULT_NAME[B.FURNACE] = FURNACE_ROCKS[0];
VARIANT_DEFAULT_NAME[B.CRAFTING_BENCH] = BENCH_WOODS[0];
VARIANT_DEFAULT_NAME[B.CHEST] = CHEST_WOODS[0];
for (const gem of [B.DIAMOND_ORE, B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, B.TOPAZ_ORE]) VARIANT_DEFAULT_NAME[gem] = 'ore';
/* GROWTH STAGES: a berry bush and wheat are laid at any stage of their growth. The default is the last, ripe
   (its bits in VARIANT_DEFAULT_BITS); the stages follow in growing order from the slot right of it, round the bar
   (VARIANT_LINEAR), so a step right from ripe meets the sprout and steps on up to ripe again. Wheat has eight, so
   its bar is a slot wider. */
const VARIANT_DEFAULT_BITS = {};
const VARIANT_LINEAR = new Set();
for (const bush of BERRY_BUSHES) {
  BLOCK_VARIANTS[bush] = ['sprout', 'small', 'young', 'bush', 'bare', 'green fruit'].map((name, s) => ({ id: bush, name, bits: s }));
  VARIANT_DEFAULT_BITS[bush] = BERRY_STAGE.GROWN; VARIANT_DEFAULT_NAME[bush] = 'ripe'; VARIANT_LINEAR.add(bush);
}
// wheat and the carrot: variant 0 is ripe, 1..6 their stages (updateCropGrow, seasons/growth.js; wheat's 1..7 until 0.8273)
for (const crop of [B.WHEAT, B.CARROT]) {
  BLOCK_VARIANTS[crop] = [1, 2, 3, 4, 5, 6].map(b => ({ id: crop, name: 'stage ' + b, bits: b }));
  VARIANT_DEFAULT_BITS[crop] = 0; VARIANT_DEFAULT_NAME[crop] = 'ripe'; VARIANT_LINEAR.add(crop);
}
// the reverse, for drops: a look that is a block of its own breaks back into the block it is a look of (a look in the
// cell's bits, or a bits-only option, is that block already)
const _VARIANT_BASE = {};
for (const k in BLOCK_VARIANTS) for (const v of BLOCK_VARIANTS[k]) if (v.id !== +k) _VARIANT_BASE[v.id] = +k;
const variantBaseOf = (blockId) => _VARIANT_BASE[blockId] ?? null;
// a look that is a block of its own takes its default's shapes (VARIANT_FAMILIES, shapes/shape-blocks.js): say so at boot if not
for (const k in BLOCK_VARIANTS) for (const v of BLOCK_VARIANTS[k]) if (v.id !== +k
    && JSON.stringify(PROPS[+k].shapes || {}) !== JSON.stringify(PROPS[v.id].shapes || {}))
  console.error(`[variants] ${PROPS[v.id].name} takes other shapes than ${PROPS[+k].name}: add it to VARIANT_FAMILIES (shapes/shape-blocks.js)`);
const variantToolWorn = () => typeof player !== 'undefined' && !!player && !player.dead &&
  (player.canFly || (equipSlots[EQUIP_INDEX.necklace]?.id === ITEM.CHISEL                // variants are the chisel's alone
                     && !slotBroken(equipSlots[EQUIP_INDEX.necklace])));

/* Where a held thing's options come from. A source takes an id and returns its options, default first,
   as [{ id, name }], or null when it has none for that id. The first source with an answer wins. */
const VARIANT_SOURCES = [
  // blocks: the neck tool unlocks them
  (id) => (id != null && id < 256 && BLOCK_VARIANTS[id] && variantToolWorn())
    ? [{ id, name: null, bits: VARIANT_DEFAULT_BITS[id] || 0, need: VARIANT_DEFAULT_NEED[id] }, ...BLOCK_VARIANTS[id]] : null,   // a default with bits: ripe
  // ammo types go here (no tool needed)
];
function variantOptions(id) {
  if (id == null) return null;
  for (const src of VARIANT_SOURCES) { const o = src(id); if (o) return o.slice(0, variantSlots(id)); }
  return null;
}
// the picked index for an id: per player, never saved
const _variantPicks = () => player._variantPick || (player._variantPick = {});
function variantIndex(id) {
  const o = variantOptions(id);
  if (!o) return 0;
  const i = _variantPicks()[id] | 0;
  return i < o.length ? i : 0;
}
// what a held id acts as: stone with brick picked is held, drawn and placed as stone brick
function heldBlockOf(id) {
  const o = variantOptions(id);
  return o ? o[variantIndex(id)].id : id;
}
// the look the pick places with (stone's brick: 1, in the cell's bits 16-23); 0 for the block's own look
function heldLookOf(id) {
  const o = variantOptions(id);
  return o ? (o[variantIndex(id)].look || 0) : 0;
}
// what an option is drawn as: the variant passed to renderBlockIcon / buildDropGeom (variant byte | look << 8)
const variantOptVariant = (v, varb = v.bits || 0) => (varb | ((v.look || 0) << 8)) >>> 0;
// the extra variant bits the pick places with (a cluster's bed); 0 for everything else
function heldVariantBitsOf(id) {
  const o = variantOptions(id);
  return o ? (o[variantIndex(id)].bits || 0) : 0;
}
// what placing the held id takes beside itself (WHAT A PICK TAKES, above): its pick's need, or its default's with no bar
function heldNeedOf(id) {
  if (id == null || id >= 256) return null;
  const o = variantOptions(id);
  return (o ? o[variantIndex(id)].need : VARIANT_DEFAULT_NEED[id]) ?? null;
}
// the bits a block's options set apart in its variant byte (a chest's wood, a furnace's rock...): which option made a cell
const _NEED_BITS = {};
for (const k in BLOCK_VARIANTS) for (const v of BLOCK_VARIANTS[k]) if (v.bits && v.id === +k) _NEED_BITS[k] = (_NEED_BITS[k] || 0) | v.bits;
/* what a placed cell took beside itself and gives back when it is broken: only a cell that paid it (NEED_PAID); null for
   the rest. Its option is found by its look, else by its option bits, else it is the default. A look of a block that is
   itself a look (thatch's mossy brick) sits on the bar of the block it is a look of (hay's): its options are searched there. */
function paidNeedOf(val) {
  if (typeof val !== 'number' || !(val & NEED_PAID)) return null;
  const id = val & 255, opts = BLOCK_VARIANTS[id] || BLOCK_VARIANTS[_VARIANT_BASE[id]] || [], look = lookOf(val);
  if (look) return opts.find(v => v.id === id && v.look === look)?.need ?? null;
  const bits = ((val >> 8) & 255) & (_NEED_BITS[id] || 0);
  const o = bits ? opts.find(v => v.id === id && (v.bits || 0) === bits) : null;
  return (o ? o.need : VARIANT_DEFAULT_NEED[id]) ?? null;
}
// a block's or an item's name, for the warning that one is missing
const _needName = (id) => (id >= 256 ? ITEM_PROPS[id]?.name : PROPS[id]?.name) || '';
const needWarning = (id, need) => `${variantNameOf(id)} takes 1 ${_needName(need).toLowerCase()} to place`;
// "Stone (brick)"; the plain name while the default is picked
function variantNameOf(id) {
  const base = (id >= 256 ? ITEM_PROPS[id]?.name : PROPS[id]?.name) || '';
  const o = variantOptions(id), v = o && o[variantIndex(id)];
  return v && v.name ? `${base} (${v.name})` : base;
}
/* THE LAYOUT: the default sits in the MIDDLE slot and the variants spread out from it — first
   right, then left, then further right and left — so a block with one variant fills the middle two and a
   step either way from the default meets a variant. Option i sits in display slot VARIANT_POS[i]. */
const VARIANT_POS = [3, 4, 2, 5, 1, 6, 0];         // seven slots, the default 4th
// ...a growth block's stages instead run in order from right of the default round the bar, which is as wide as
// they need: option i in slot (3 + i) mod the slots
const variantSlots = (id) => VARIANT_LINEAR.has(id) ? Math.max(VARIANT_SLOTS, 1 + BLOCK_VARIANTS[id].length) : VARIANT_SLOTS;
const variantPos = (id, i) => VARIANT_LINEAR.has(id) ? (3 + i) % variantSlots(id) : VARIANT_POS[i];
/* Hold R and scroll, or hold D-pad Right and press a bumper (a tap stepped right before): the
   pick moves one FILLED slot left or right, wrapping round and skipping the empty ones. */
function stepHeldVariant(dir) {
  if (!playing || invOpen || player.dead) return false;
  const id = slotId(HOTBAR[hotbarSel]);
  const o = variantOptions(id);
  if (!o || o.length < 2) return false;
  const order = o.map((_, i) => i).sort((a, b) => variantPos(id, a) - variantPos(id, b));   // left to right
  const k = order.indexOf(variantIndex(id));
  _variantPicks()[id] = order[(k + (dir > 0 ? 1 : -1) + order.length) % order.length];
  if (typeof flashBlockName === 'function') flashBlockName();   // the name over the hotbar follows the pick
  return true;
}
/* Tap the bind twice (R, or D-pad Right) to put the held block back on its default. The held
   block's pick goes to 0; a single tap does nothing, so holding it to scroll is untouched. */
const VARIANT_DOUBLE_TAP_S = 0.35;
function variantBindTap() {
  const now = performance.now() / 1000, last = player._variantTapT || 0;
  player._variantTapT = now;
  if (now - last > VARIANT_DOUBLE_TAP_S) return;
  player._variantTapT = 0;                         // a third tap starts a new pair
  const id = slotId(HOTBAR[hotbarSel]);
  if (!variantOptions(id) || !variantIndex(id)) return;
  _variantPicks()[id] = 0;
  if (typeof flashBlockName === 'function') flashBlockName();
}
// is the variant bind held? The pad's D-pad Right is noted per seat by pollGamepad; R is seat one's keyboard
const variantHeld = () => !!player._variantHold || !!(typeof keys !== 'undefined' && keys['KeyR']);
// the wheel, from 17-input.js before it moves the hotbar: true when R is held and the step was taken
function variantWheel(deltaY) {
  return !!(deltaY && typeof keys !== 'undefined' && keys['KeyR']) && stepHeldVariant(deltaY > 0 ? 1 : -1);
}
const _padIsPS = () => {
  const g = typeof getPad === 'function' ? getPad() : null;
  return /dualshock|dualsense|playstation|\bps[45]\b/.test((g && g.id || '').toLowerCase());
};

/* Per frame, per seat, beside syncChiselHud. The bar lives INSIDE #hotbar like the chisel slot, so it
   follows the hotbar into every split-screen pane; buildHotbar clears it and this puts it back. */
function syncVariantHud() {
  if (typeof hotbarEl === 'undefined' || !hotbarEl) return;
  // a new pick, or the tool going on or off, redraws the slot icons once: they show the picked variant
  const picks = player._variantPick || {};
  const iconSig = (variantToolWorn() ? 1 : 0) + ':' + Object.keys(picks).map(k => k + '=' + picks[k]).join(',');
  if (iconSig !== player._variantIconSig) {
    const first = player._variantIconSig === undefined;
    player._variantIconSig = iconSig;
    if (!first) { buildHotbar(); if (invOpen) buildInventory(); }
  }
  const id = slotId(HOTBAR[hotbarSel]);
  const o = variantOptions(id);
  let el = hotbarEl.querySelector(':scope > .variantBar');
  // gone while the inventory is open: it sits higher now, over the vitals, and would cover the panel
  if (!o || invOpen) { if (el) el.remove(); return; }
  const cur = variantIndex(id);
  // each variant drawn in the chisel's picked shape when it can take it, like the hotbar slots
  const shp = o.map(v => variantOptVariant(v, (typeof chiselHeldVariant === 'function' ? chiselHeldVariant(v.id) : 0) || v.bits || 0));   // + a bed, a look
  // a growth stage always by its own stage, the sprout's 0 too
  const srcs = o.map((v, i) => (shp[i] || VARIANT_LINEAR.has(id) ? renderBlockIcon(v.id, shp[i]) : renderBlockIcon(v.id)));
  // the bind on its left follows the device you last touched: hold R + scroll, or hold D-pad Right + bumpers
  const pad = typeof lastInputDevice !== 'undefined' && lastInputDevice === 'pad';
  const hint = pad ? `<b>D-pad &#9654;</b> + ${_padIsPS() ? 'L1/R1' : 'LB/RB'}` : '<b>R</b> + scroll';
  const held = variantHeld();
  el && el.classList.toggle('hold', held);         // lit while the bind is held, so you know the wheel is the bar's
  // what each pick takes beside itself (WHAT A PICK TAKES, above), under its slot, dim while the bags hold none of it;
  // nothing in creative, which takes nothing. Every need is a block: drawn as its icon
  const needs = o.map(v => (player.canFly ? null : v.need ?? null));
  const have = needs.map(nd => nd == null || invCount(nd) > 0);
  const key = id + ':' + cur + ':' + shp.join(',') + ':' + srcs.map(s => (s ? 1 : 0)).join('') + ':' + hint
            + ':' + needs.join(',') + ':' + have.map(h => (h ? 1 : 0)).join('');
  if (el && el._key === key) return;
  if (!el) { el = document.createElement('div'); el.className = 'variantBar' + (held ? ' hold' : ''); hotbarEl.appendChild(el); }
  el._key = key;
  el.classList.toggle('needs', needs.some(nd => nd != null));   // a row under the slots for them
  let html = `<div class="vKey">${hint}</div>`;
  for (let pos = 0, n = variantSlots(id); pos < n; pos++) {
    const i = o.findIndex((_, k) => variantPos(id, k) === pos);   // the default in the middle
    if (i < 0 || !o[i]) { html += '<div class="slot vEmpty"></div>'; continue; }
    const nsrc = needs[i] != null ? renderBlockIcon(needs[i]) : null;
    html += `<div class="slot${i === cur ? ' sel' : ''}">${srcs[i] ? `<img class="i3d" src="${srcs[i]}" alt="">` : ''}`
          + (nsrc ? `<img class="vNeed${have[i] ? '' : ' lack'}" src="${nsrc}" alt="" title="takes 1 ${_needName(needs[i]).toLowerCase()}">` : '')
          + '</div>';
  }
  el.innerHTML = html;
}
