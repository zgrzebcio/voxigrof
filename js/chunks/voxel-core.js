'use strict';
/* chunks/voxel-core.js: builds VOXEL_CORE (world generation, the mesher, the fluid rules) and runs it for the page:
   CORE, and the names the game uses straight from it (B, PROPS, the shape helpers...).

   VOXEL_CORE also runs as text inside the workers (10-workers.js). It must stay self-contained: nothing from the page,
   only BIOMES and BLOCKS, which are shipped beside it.

   The parts, in the order they are glued:
     chunks/voxel-shared.js      the block registry from BLOCKS, tinted tiles, the chunk's size
     worldgen/noise.js           seeded random numbers and noise
     worldgen/make-gen.js        makeGen: a world's generator (its body: worldgen/gen-*.js; genChunk's body is listed
                                 in worldgen/gen-chunk.js)
     chunks/mesher.js            the mesher (meshChunk's body: chunks/mesher-*.js, fluids/mesher-fluids.js)
     fluids/kinds.js             the fluids table (FLUID), then one entry file per fluid: fluids/water.js, fluids/lava.js
     fluids/rules.js             makeFluidSim, the rules every fluid in the table flows by
     this file                   the return: every name the page and the workers may use
   The worker's own entry point is chunks/worker.js. */

corePart('voxel', function () {
  return { setTintSampler, setFastLeaves, B, T, V, PROPS, VARIANT_BLOCKS, CLUSTER_DIRS, CLUSTER_BED_SHIFT, SHAPE_SLAB, SHAPE_STAIRS, SHAPE_PANE, SHAPE_FENCE, SHAPE_COVER, SHAPE_WALL,
           makeFluidSim, flChunkKey, FLUID,                                                                  // fluids: the rules, and the table (fluids/kinds.js)
           SHAPE_MASK, ROT_MASK, shapeOfVal,
           HOLLOW_FILLS, opaqueVal, lightDim, shapeBoxesAt, stairBoxesAt, makeGen, meshChunk, idx,
           logWidthOf, logWidthPx, LOG_W_MIN, LOG_W_MAX, LOG_W_NORMAL, LOG_W_BLOCK,
           SHAPE_LAYER, SHAPE_LAYER_MIX, LAYER_MAX, layerCount, layerMixed, layerVal, solidVal,
           SHAPE_SLAB_MIX, slabMixed, slabMixVal, slabsMix, slabMixBoxes, sideListed, VARIANT_FAMILIES,   // 0.8263
           BERRY_BUSHES, BERRY_STAGES, chimneyHeight, CHIMNEY_MAX,                                          // 0.827
           BERRY_STAGE, berryStage, isBerryBush, CANE_STEPS, ICE_FROM_WATER };                             // cane 0.829; ice 0.833
});

const VOXEL_CORE = buildCore('voxel');

const CORE = VOXEL_CORE();
const { B, V, PROPS, SHAPE_SLAB, SHAPE_STAIRS, SHAPE_PANE, SHAPE_FENCE, SHAPE_COVER, SHAPE_WALL,
        SHAPE_MASK, ROT_MASK, HOLLOW_FILLS, logWidthOf, LOG_W_MIN, LOG_W_NORMAL } = CORE;

const { SHAPE_LAYER, LAYER_MAX, BERRY_STAGE, berryStage, isBerryBush, BERRY_BUSHES, BERRY_STAGES, CANE_STEPS, ICE_FROM_WATER } = CORE;
