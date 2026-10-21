'use strict';
/* fluids/waterlog.js: blocks standing in water, on the page. What a waterlogged cell is and which blocks can be one is
   blocks/waterlog.js (BLOCK_CORE); how its water is drawn, fluids/mesher-fluids.js; that the flow takes it for a still source it
   never writes, fluids/rules.js; water spilt beside the world's still water settling into still water, _settleWater
   (fluids/fluids.js). Here: what setBlock (chunks/block-access.js) writes when a cell with water in it changes, and the
   bubbles a chest opened under water lets out (blocks/chest.js).

   Only STILL water takes a block in: a source, level 0 (a river's and a lake's water, a bucket's). A block put into
   flowing water pushes it out as before. */

/* The value setBlock really writes for `val` going into a cell that held `oldVal`:
     - a block that can stand in water (canWaterlog), put into still water: it keeps the water
     - a block standing in water that turns into another that can (a door opened, a chest unsealed, a torch's look):
       the water stays in it
     - a block standing in water taken away (broken, blown up, a wand): the water stays, still
     - anything else put over it (a whole block, another fluid): the water is gone
     - a value that says it holds water written where there is none (the building wand copying one, a structure stamped
       on dry land): it goes down dry */
function waterlogValue(oldVal, val) {
  const wet = (oldVal & WATERLOGGED) !== 0;
  if (wet && (val & 255) === B.AIR) return B.WATER;
  const still = wet || ((oldVal & 255) === B.WATER && ((oldVal >> 8) & 7) === 0);
  return still && canWaterlog(val) ? (val | WATERLOGGED) >>> 0 : (val & ~WATERLOGGED) >>> 0;
}

// a chest opened under water: bubbles rise out of it as the lid lifts and water fills it (openChest, blocks/chest.js)
const WATERLOG_CHEST_BUBBLES = 10;
function waterlogChestOpened(x, y, z) {
  if (!isWaterlogged(getBlock(x, y, z)) || typeof _fxBubble !== 'function') return;
  for (let n = 0; n < WATERLOG_CHEST_BUBBLES; n++)
    _fxBubble(x + 0.2 + Math.random() * 0.6, y + 0.5 + Math.random() * 0.3, z + 0.2 + Math.random() * 0.6);
}
