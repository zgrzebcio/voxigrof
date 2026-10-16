'use strict';
/* blocks/dry-plants.js: the desert's dry plants (dry grass, tall dry grass, dry bush).
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* The desert's dry plants: picked like the grass (player/placing.js). Dry grass gives a fiber now and then, tall dry
     grass is cut down to dry grass, a dry bush gives sticks. They stand on sand, red sand, grass or dirt. */
  PROPS[B.DRY_GRASS]      = { name:'Dry grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',rot:'all',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,0.8,0.9]], faces:[T.DRY_GRASS],
                              desc: 'Grows in deserts, and here and there on the warm plains' };
  PROPS[B.DRY_TALL_LOWER] = { name:'Tall dry grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, noInv:true, stack:79, type:'grass', hardness:0, boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.DRY_TALL_BOT], desc: '' };
  PROPS[B.DRY_TALL_UPPER] = { name:'Tall dry grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',noInv:true, stack:79, hardness:0, type:'grass', boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.DRY_TALL_TOP], desc: '' };
  PROPS[B.DRY_BUSH]       = { name:'Dry bush', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.15,0,0.15,0.85,0.8,0.85]], faces:[T.DRY_BUSH],
                              desc: 'Pick it for sticks' };
  // faces [+X,-X,top,bottom,+Z,-Z]; front picked per variant (rot:'side') in the mesher
  PROPS[B.CRAFTING_BENCH] = { name:'Crafting bench', solid:true, opaque:true, raycast:true, pass:0, model:'cube', rot:'side', stack:20, hardness:4.5, type:'wood', faces:[T.CRAFT_SIDE,T.CRAFT_SIDE,T.CRAFT_TOP,T.PLANKS,T.CRAFT_FRONT,T.CRAFT_FRONT],
                              desc: 'Keep its top clear: with a block or plant on it, it cannot be used' };   // 0.801
});
