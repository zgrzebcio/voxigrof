'use strict';
/* fluids/water.js: water's entry in the fluids table (fluids/kinds.js says what each line is for).
   A part of VOXEL_CORE. The rest of water: its block is in blocks/basic.js, how it is drawn is emitWater in
   fluids/mesher-fluids.js, the current that carries things is fluids/current.js, and rivers, lakes and seas are
   world generation (biomes/rivers-lakes.js, worldgen/water-finish.js). */

corePart('voxel', function () {
  defineFluid(B.WATER, {
    name: 'water',
    step: 1, max: 7,                 // a step thinner each block: it runs 7 blocks from a source
    delay: 0.4, dry: 0.16,           // seconds a block, at the world's usual tick speed
    // touching lava, flowing water turns to stone; a still source waits for the lava's own turn
    meets: { [B.LAVA]: { flowing: B.STONE } },
  });
});
