'use strict';
/* blocks/waterlog.js: blocks that stand in water. A cell's bit 24 (WATERLOGGED, above the look's bits 16-23) says the block
   in it also holds still water: the block is drawn as itself and the cell round it as still water (fluids/mesher-fluids.js),
   a player swims there, the flow takes it for a still source that it never writes (fluids/rules.js `asFluid`: its water
   spills into open cells beside it), and the water stays when the block goes.
   canWaterlog says which blocks can. The page's side, taking the water when a block is put into it and giving it back
   when the block goes, and the chest's bubbles, is fluids/waterlog.js.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  const WATERLOGGED = 0x1000000;
  const isWaterlogged = (v) => (v & WATERLOGGED) !== 0;
  // water in the cell: the water block itself, or a block standing in it
  const isWaterVal = (v) => (v & 255) === B.WATER || (v & WATERLOGGED) !== 0;
  /* What may stand in water: a block that is not whole. The shapes (slab, stairs, pane, fence, wall, cover, door, and a
     carpet that does not fall: a stack of snow, sand or leaves does), the gem clusters, the hollow logs, and the blocks
     marked `waterlog` below. */
  function canWaterlog(v) {
    const p = PROPS[v & 255];
    if (!p) return false;
    if (p.waterlog || p.model === 'cluster' || p.model === 'hollow') return true;
    const s = shapeOfVal(v);
    return !!s && (s !== 'layer' || !p.layerStack);
  }
  /* the chests, the old ladder, the glow vine (the jungle's vine never stands in water: player/place-block.js), and the two
     torches with no flame (a burning torch goes out in water) */
  for (const id of [B.CHEST, B.METAL_CHEST, B.LADDER, B.GLOW_VINE, B.CRYSTAL_TORCH, B.TORCH_UNLIT]) PROPS[id].waterlog = true;
});
