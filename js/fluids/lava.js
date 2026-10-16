'use strict';
/* fluids/lava.js: lava's entry in the fluids table (fluids/kinds.js says what each line is for).
   A part of VOXEL_CORE. The rest of lava: its block is in woods/wood-blocks.js (PROPS[B.LAVA]), how it is drawn
   is emitLava in fluids/mesher-fluids.js, what it does to a player is player/hazards.js, and lava pools are
   world generation (worldgen/underground.js). */

corePart('voxel', function () {
  defineFluid(B.LAVA, {
    name: 'lava',
    step: 2, max: 6,                 // two steps thinner each block: it runs 3 blocks from a source
    delay: 2.0, dry: 0.8,            // five times slower than water
    // touching water, a lava source turns to obsidian; flowing lava turns the water beside it to cobblestone
    meets: { [B.WATER]: { source: B.OBSIDIAN, turns: B.COBBLE } },
  });
});
