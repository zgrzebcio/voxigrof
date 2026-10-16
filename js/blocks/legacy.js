'use strict';
/* blocks/legacy.js: old saves. Ids that were slabs, stairs and layers of their own before shapes became variants are
   turned into today's values (migrateLegacyVal, migrateLegacyLayers, legacyItemId). */

/* Slabs and stairs had ids of their own until 0.783 ([base, stairs?] per old id, 37 was the retired cactus
   slab). Saved edits, inventories and prefabs holding one are converted here into the shape variant of
   the full block. A double slab becomes the full block; a mixed double keeps its own half. */
const LEGACY_SHAPE = {
  12: [B.PLANKS, 0], 28: [B.PLANKS, 1], 29: [B.COBBLE, 0], 31: [B.BRICKS, 0], 32: [B.BRICKS, 1],
  35: [B.STONE_BRICK, 0], 36: [B.STONE, 0], 37: [0, 0], 38: [B.GLASS, 0],
  113: [B.STONE, 1], 114: [B.COBBLE, 1], 115: [B.BIRCH_PLANKS, 0], 116: [B.BIRCH_PLANKS, 1],
  117: [B.SPRUCE_PLANKS, 0], 118: [B.SPRUCE_PLANKS, 1], 119: [B.STONE_BRICK, 1], 120: [B.GLASS, 1],
  121: [B.SANDSTONE, 0], 122: [B.SANDSTONE, 1], 123: [B.RED_SANDSTONE, 0], 124: [B.RED_SANDSTONE, 1],
};
function migrateLegacyVal(v) {
  /* the old oak door (B.DOOR, until 0.842; variant bits 0-3 as the door shape's, bit 4 hinged right) is an oak planks door
     shape now: same place, facing, open and hinge */
  if (typeof v === 'number' && (v & 255) === B.DOOR) {
    const va = (v >> 8) & 255;
    return (B.PLANKS | ((((va & 16) ? BLOCKS.SHAPE_DOOR_R : BLOCKS.SHAPE_DOOR) | (va & 15)) << 8)) >>> 0;
  }
  const m = typeof v === 'number' ? LEGACY_SHAPE[v & 255] : null;
  if (!m) return v;
  if (!m[0]) return 0;
  const va = (v >> 8) & 255;
  if (m[1]) return m[0] | ((SHAPE_STAIRS + (va & 7)) << 8);
  if (va < 6) return m[0] | ((SHAPE_SLAB + va) << 8);
  if (va < 16) return m[0];
  return m[0] | ((SHAPE_SLAB + ((va - 16) & 7)) << 8);
}
/* Carpets were blocks of their own until 0.785: 81 the mixed stack (3 bits a layer: 1 snow, 2 oak, 3 birch,
   4 spruce litter), 58/71/72/77 the older single ones (variant = layers - 1). Now they are layer stacks of
   the real block. Returns null for anything else, or [value, ids] — ids only for a stack that mixes. */
const _LEGACY_LAYER_MAT = [0, B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES];
const _LEGACY_LAYER_ID = { 58: B.SNOW, 71: B.LEAVES, 72: B.BIRCH_LEAVES, 77: B.SPRUCE_LEAVES };
function migrateLegacyLayers(v) {
  if (typeof v !== 'number') return null;
  const id = v & 255;
  if (_LEGACY_LAYER_ID[id]) return [CORE.layerVal(_LEGACY_LAYER_ID[id], ((v >> 8) & 255) + 1), null];
  if (id !== 81) return null;
  const ids = [];
  for (let i = 0; i < 8; i++) { const m = (v >>> (8 + i * 3)) & 7; if (!m) break; ids.push(_LEGACY_LAYER_MAT[m] || B.SNOW); }
  if (!ids.length) return [0, null];
  const mixed = ids.some(b => b !== ids[0]);
  return [CORE.layerVal(ids[ids.length - 1], ids.length, mixed), mixed ? ids : null];
}
// an old slab or stairs item in a slot: the full block it was made from (null for the cactus slab)
// ...and since 0.794 a stone brick item is plain stone: brick is a variant you pick (blocks/variants.js), not an item
const legacyItemId = (id) => {
  if (typeof id === 'number' && id < 256 && LEGACY_SHAPE[id]) id = LEGACY_SHAPE[id][0] || null;
  return id === B.STONE_BRICK ? B.STONE : id;
};
