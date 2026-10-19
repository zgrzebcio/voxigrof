'use strict';
/* blocks/layer-drops.js: the world's tick speed, and what a layer, a stack of layers or a plant gives when dug. */

/* ---- world simulation speed (per-world "random tick speed" setting; default 3) ----
   scales natural processes: leaves decay, water flow, grass spread. factor 1.0 at the default. */
let randomTickSpeed = 3;
const tickFactor = () => Math.max(0.05, randomTickSpeed / 3);

/* ---- fluid flow ----
   Water and lava flowing live in fluids/fluids.js since 0.844 (the simulation itself: makeFluidSim, chunks/voxel-core.js). */
/* What one layer gives when it is dug off (moved out of the mining tick, which now also takes whole stacks). */
function _dropLayer(L, x, y, z) {
  if (L === B.SNOW) {
    // a snow layer never hands back a block — only a shovel packs it into a snowball
    if (ITEM_PROPS[heldUseId()]?.tool === 'shovel') spawnDrop(ITEM.SNOWBALL, x, y, z);
  } else if (LEAF_BLOCKS.has(L)) {
    // leaf litter yields exactly what its leaves yield, never a block of leaves
    for (const drop of blockDrop(L, false)) for (let i = 0; i < drop.count; i++) spawnDrop(drop.id, x, y, z);
  } else if (L === B.GRAVEL) {
    // a gravel layer gives no gravel, but its flint as often as a gravel block does
    if (Math.random() < GRAVEL_FLINT_CHANCE) spawnDrop(ITEM.FLINT, x, y, z);
  } else if (L === B.SALT_CRUST) {
    // each salt layer rolls its salt like a whole crust does
    for (const drop of blockDrop(L, false)) for (let i = 0; i < drop.count; i++) spawnDrop(drop.id, x, y, z);
  } else if (L === B.ASH) {
    if (rollLoot(LOOT.ashLayer)) spawnDrop(ITEM.ASHES, x, y, z);   // an ash carpet: ashes half the time
  } else if (L === B.FIBER_BLOCK) {
    // a fiber carpet comes apart into fiber: LOOT.fiberCarpet
    for (let i = rollLoot(LOOT.fiberCarpet); i > 0; i--) spawnDrop(ITEM.FIBER, x, y, z);
  } else if (!LOOSE_LAYER_BLOCKS.has(L)) spawnDrop(L, x, y, z);   // a loose sand layer gives nothing
}
/* A whole stack off at once with a shovel. Sand and gravel give their block for every 8 layers (the odd
   ones as a chance), snow a snowball for every 2; the rest as one layer each. */
function _dropStackLayers(ids, x, y, z) {
  const count = new Map();
  for (const L of ids) count.set(L & 255, (count.get(L & 255) || 0) + 1);   // entries: a look of a layer gives its block
  for (const [L, k] of count) {
    if (L === B.SNOW) { for (let i = Math.ceil(k / 2); i > 0; i--) spawnDrop(ITEM.SNOWBALL, x, y, z); continue; }
    if (LOOSE_LAYER_BLOCKS.has(L) && L !== B.FIBER_BLOCK) {
      const n = Math.floor(k / LAYER_MAX) + (Math.random() < (k % LAYER_MAX) / LAYER_MAX ? 1 : 0);
      for (let i = 0; i < n; i++) for (const d of blockDrop(L, false)) for (let j = 0; j < d.count; j++) spawnDrop(d.id, x, y, z);
      continue;
    }
    for (let i = 0; i < k; i++) _dropLayer(L, x, y, z);
  }
}
function _breakBillboard(x, y, z, id) {
  if (!player.canFly)
    for (const d of blockDrop(id, true)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
}
