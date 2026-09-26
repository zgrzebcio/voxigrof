'use strict';
/* voxiGrof — variants (0.794)

   A variant is another look of the same block: stone can be laid as stone brick. It is NOT an item and
   not a stack of its own. The pick is per player and per block, so while brick is picked EVERY stone you
   carry shows, is held and places as brick, and a brick broken comes back as plain stone (blockDrop).
   Nothing is saved: every world you join starts on the default, which is always the first slot.

   The bar: seven slots above the vitals holding the held block's variants, the default in the middle,
   the 4th (VARIANT_POS; five until 0.809). A block with fewer leaves the rest empty. Hold R and scroll, or
   hold D-pad Right and press a bumper, to step through the real ones (0.7944); tap R or D-pad Right twice
   to jump back to the default (0.809). A variant block takes the chisel shapes its own id supports
   (SHAPE_BLOCKS in 02).

   A variant needs the CHISEL worn in the NECK slot (only the chisel since 0.803); creative needs none. The bar is
   meant to switch ammo types later too: that will be one more entry in VARIANT_SOURCES, without a tool. */

const VARIANT_SLOTS = 7;                           // 5 until 0.809
// block -> its variants after the default: `id` is the block it places as, `name` goes in brackets
// (the variant blocks themselves are VARIANT_BLOCKS in 02-voxel-core.js; mossy, cracked and the three bricks 0.7941)
const BLOCK_VARIANTS = {
  // cracked brick left the bar in 0.8091 (placed ones stay) and polished came in
  [B.STONE]:        [{ id: B.STONE_BRICK, name: 'brick' }, { id: B.MOSSY_STONE_BRICK, name: 'mossy brick' },
                     { id: B.POLISHED_STONE, name: 'polished' }],
  // the looks of glass, and adobe's brick (0.8091)
  [B.GLASS]:        [{ id: B.DARK_GLASS, name: 'dark' }, { id: B.GREENHOUSE_GLASS, name: 'greenhouse' },
                     { id: B.GLASS_BRICKS, name: 'brick' }, { id: B.DARK_GLASS_BRICKS, name: 'dark brick' }],
  [B.ADOBE]:        [{ id: B.ADOBE_BRICK, name: 'brick' }],  [B.BRICKS]:       [{ id: B.TERRACOTTA_BRICKS, name: 'brick' }],   // terracotta since 0.8093
  [B.COBBLE]:       [{ id: B.MOSSY_COBBLE, name: 'mossy' }],
  [B.SULFUR_BLOCK]: [{ id: B.SULFUR_BRICKS, name: 'brick' }],
  // every rock: brick, mossy brick, polished (mossy and polished 0.809; dolomite 0.809)
  [B.GRANITE]:      [{ id: B.GRANITE_BRICKS, name: 'brick' }, { id: B.MOSSY_GRANITE_BRICKS, name: 'mossy brick' },
                     { id: B.POLISHED_GRANITE, name: 'polished' }],
  [B.MARBLE]:       [{ id: B.MARBLE_BRICKS, name: 'brick' }, { id: B.MOSSY_MARBLE_BRICKS, name: 'mossy brick' },
                     { id: B.POLISHED_MARBLE, name: 'polished' }],
  [B.LIMESTONE]:    [{ id: B.LIMESTONE_BRICKS, name: 'brick' }, { id: B.MOSSY_LIMESTONE_BRICKS, name: 'mossy brick' },
                     { id: B.POLISHED_LIMESTONE, name: 'polished' }],
  [B.DOLOMITE]:     [{ id: B.DOLOMITE_BRICKS, name: 'brick' }, { id: B.MOSSY_DOLOMITE_BRICKS, name: 'mossy brick' },
                     { id: B.POLISHED_DOLOMITE, name: 'polished' }],
  // the mortar's bowl in another rock (0.7945)
  [B.MORTAR]:       [{ id: B.GRANITE_MORTAR, name: 'granite' }, { id: B.MARBLE_MORTAR, name: 'marble' },
                     { id: B.LIMESTONE_MORTAR, name: 'limestone' }],
};
/* A gem cluster's bed (0.7948): the same block with the rock in its variant bits rather than a block of
   its own, so an option can also carry `bits`, OR'd into the variant byte when it is placed. */
const _clusterBeds = (gem) => [['stone', 1], ['granite', 2], ['marble', 3], ['limestone', 4], ['dolomite', 5]]   // dolomite 0.809
  .map(([name, b]) => ({ id: gem, name, bits: b << CORE.CLUSTER_BED_SHIFT }));
for (const gem of [B.DIAMOND_ORE, B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, B.TOPAZ_ORE]) BLOCK_VARIANTS[gem] = _clusterBeds(gem);
/* A furnace in another rock and a bench or a chest in another wood (0.809): bits-only options like the
   cluster beds. The furnace keeps its rock in bits 3-5 and the bench its wood in bits 2-4 (V in 02); the
   chest its wood in bits 4-5 (CHEST_WOOD_SHIFT, 30-chest.js). */
BLOCK_VARIANTS[B.FURNACE] = FURNACE_ROCKS.slice(1).map((name, i) => ({ id: B.FURNACE, name, bits: (i + 1) << V.FURNACE_ROCK_SHIFT }));
BLOCK_VARIANTS[B.CRAFTING_BENCH] = BENCH_WOODS.slice(1).map((name, i) => ({ id: B.CRAFTING_BENCH, name, bits: (i + 1) << V.BENCH_WOOD_SHIFT }));
BLOCK_VARIANTS[B.CHEST] = CHEST_WOODS.slice(1).map((name, i) => ({ id: B.CHEST, name, bits: (i + 1) << CHEST_WOOD_SHIFT }));
// the reverse, for drops: a placed variant breaks back into the block it is a variant of (a bits-only option is that block already)
// band and pillar join every rock's list (0.8093)
for (const [rock, K] of [[B.STONE, 'STONE'], [B.GRANITE, 'GRANITE'], [B.MARBLE, 'MARBLE'], [B.LIMESTONE, 'LIMESTONE'], [B.DOLOMITE, 'DOLOMITE']])
  BLOCK_VARIANTS[rock].push({ id: B[K + '_BAND'], name: 'band' }, { id: B[K + '_PILLAR'], name: 'pillar' });
const _VARIANT_BASE = {};
for (const k in BLOCK_VARIANTS) for (const v of BLOCK_VARIANTS[k]) if (v.id !== +k) _VARIANT_BASE[v.id] = +k;
// the 0.7947 stone-bed clusters, retired from the bar, still break into their gem's cluster
for (const [id, base] of [[B.DIAMOND_CLUSTER_STONE, B.DIAMOND_ORE], [B.EMERALD_CLUSTER_STONE, B.EMERALD_ORE], [B.RUBY_CLUSTER_STONE, B.RUBY_ORE],
                          [B.SAPPHIRE_CLUSTER_STONE, B.SAPPHIRE_ORE], [B.TOPAZ_CLUSTER_STONE, B.TOPAZ_ORE]]) _VARIANT_BASE[id] = base;
_VARIANT_BASE[B.CRACKED_STONE_BRICK] = B.STONE;   // off the bar since 0.8091; a placed one still breaks into stone
const variantBaseOf = (blockId) => _VARIANT_BASE[blockId] ?? null;

const variantToolWorn = () => typeof player !== 'undefined' && !!player && !player.dead &&
  (player.canFly || (equipSlots[EQUIP_INDEX.necklace]?.id === ITEM.CHISEL                // variants are the chisel's alone (0.803)
                     && !slotBroken(equipSlots[EQUIP_INDEX.necklace])));

/* Where a held thing's options come from. A source takes an id and returns its options, default first,
   as [{ id, name }], or null when it has none for that id. The first source with an answer wins. */
const VARIANT_SOURCES = [
  // blocks: the neck tool unlocks them
  (id) => (id != null && id < 256 && BLOCK_VARIANTS[id] && variantToolWorn())
    ? [{ id, name: null }, ...BLOCK_VARIANTS[id]] : null,
  // ammo types go here (no tool needed)
];
function variantOptions(id) {
  if (id == null) return null;
  for (const src of VARIANT_SOURCES) { const o = src(id); if (o) return o.slice(0, VARIANT_SLOTS); }
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
// the extra variant bits the pick places with (a cluster's bed, 0.7948); 0 for everything else
function heldVariantBitsOf(id) {
  const o = variantOptions(id);
  return o ? (o[variantIndex(id)].bits || 0) : 0;
}
// "Stone (brick)"; the plain name while the default is picked
function variantNameOf(id) {
  const base = (id >= 256 ? ITEM_PROPS[id]?.name : PROPS[id]?.name) || '';
  const o = variantOptions(id), v = o && o[variantIndex(id)];
  return v && v.name ? `${base} (${v.name})` : base;
}
/* THE LAYOUT (0.7944): the default sits in the MIDDLE slot and the variants spread out from it — first
   right, then left, then further right and left — so a block with one variant fills the middle two and a
   step either way from the default meets a variant. Option i sits in display slot VARIANT_POS[i]. */
const VARIANT_POS = [3, 4, 2, 5, 1, 6, 0];         // seven slots, the default 4th (0.809)
/* Hold R and scroll, or hold D-pad Right and press a bumper (0.7944; a tap stepped right before): the
   pick moves one FILLED slot left or right, wrapping round and skipping the empty ones. */
function stepHeldVariant(dir) {
  if (!playing || invOpen || player.dead) return false;
  const id = slotId(HOTBAR[hotbarSel]);
  const o = variantOptions(id);
  if (!o || o.length < 2) return false;
  const order = o.map((_, i) => i).sort((a, b) => VARIANT_POS[a] - VARIANT_POS[b]);   // left to right
  const k = order.indexOf(variantIndex(id));
  _variantPicks()[id] = order[(k + (dir > 0 ? 1 : -1) + order.length) % order.length];
  if (typeof flashBlockName === 'function') flashBlockName();   // the name over the hotbar follows the pick (0.7942)
  return true;
}
/* Tap the bind twice (R, or D-pad Right) to put the held block back on its default (0.809). The held
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
  if (!o) { if (el) el.remove(); return; }
  const cur = variantIndex(id);
  // each variant drawn in the chisel's picked shape when it can take it, like the hotbar slots (0.7941)
  const shp = o.map(v => (typeof chiselHeldVariant === 'function' ? chiselHeldVariant(v.id) : 0) || v.bits || 0);   // + a bed (0.7948)
  const srcs = o.map((v, i) => (shp[i] ? renderBlockIcon(v.id, shp[i]) : renderBlockIcon(v.id)));
  // the bind on its left follows the device you last touched (0.7942): hold R + scroll, or hold D-pad Right + bumpers
  const pad = typeof lastInputDevice !== 'undefined' && lastInputDevice === 'pad';
  const hint = pad ? `<b>D-pad &#9654;</b> + ${_padIsPS() ? 'L1/R1' : 'LB/RB'}` : '<b>R</b> + scroll';
  const held = variantHeld();
  el && el.classList.toggle('hold', held);         // lit while the bind is held, so you know the wheel is the bar's
  const key = id + ':' + cur + ':' + shp.join(',') + ':' + srcs.map(s => (s ? 1 : 0)).join('') + ':' + hint;
  if (el && el._key === key) return;
  if (!el) { el = document.createElement('div'); el.className = 'variantBar' + (held ? ' hold' : ''); hotbarEl.appendChild(el); }
  el._key = key;
  let html = `<div class="vKey">${hint}</div>`;
  for (let pos = 0; pos < VARIANT_SLOTS; pos++) {
    const i = VARIANT_POS.indexOf(pos);            // the default in the middle (0.7944)
    if (i < 0 || !o[i]) { html += '<div class="slot vEmpty"></div>'; continue; }
    html += `<div class="slot${i === cur ? ' sel' : ''}">${srcs[i] ? `<img class="i3d" src="${srcs[i]}" alt="">` : ''}</div>`;
  }
  el.innerHTML = html;
}
