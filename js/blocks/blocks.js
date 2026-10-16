'use strict';
/* blocks/blocks.js: builds BLOCK_CORE, every block there is, and runs it for the page (BLOCKS). Loaded LAST of the
   block parts, because it glues them together and holds the core's return.

   BLOCK_CORE also runs as text inside the workers (10-workers.js), so no part of it may touch anything outside
   itself. The voxel core takes all of it from BLOCKS and hands it on in its own return, so the game reads CORE.B,
   CORE.PROPS and the names set out of CORE in chunks/voxel-core.js.

   The parts, in the order they are glued (blocks/ unless said):
     ids.js, tiles.js            ids B, tiles T, variant bits V, the PROPS table
     basic.js                    log width, the plain blocks
     woods/wood-blocks.js        logs, planks and leaves of each wood
     glow-and-storage.js, gem-clusters.js, ladder-mortar.js, mushrooms.js, dry-plants.js, torch-blocks.js
     shapes/stairs.js            stairs
     plants.js                   cactus, berries, gourds, pebbles, wheat...
     shapes/shapes.js            the shape ids and the variant byte
     looks.js                    the looks of a block (VARIANT_BLOCKS)
     shapes/shape-blocks.js, shapes/chimney-mixed.js, shapes/boxes.js
     woods/hollow-logs.js
     this file                   the return: every name the rest of the game may use

   A NEW NAME declared in a part must be added to the return below, and to the list taken from BLOCKS at the top of
   chunks/voxel-shared.js (and to the voxel core's return if the page needs it). */

corePart('blocks', function () {
  return { T, FURNACE_T, FURNACE_ROCK_N, BENCH_WOOD_N, BENCH_T, SHROOM_T, DECOR_T, BERRY_KINDS, BERRY_STAGES,
           CAVE_DIRT_AT, CAVE_YELLOW_BUSH, ICE_FROM_WATER, CANE_STEPS, CANE_JOIN_LEFT, B, V, SIDE_FACE,
           furnaceRockOf, benchWoodOf, furnaceTile, benchTile, PROPS, LOG_W_MIN, LOG_W_MAX, LOG_W_BLOCK,
           LOG_W_NORMAL, logWidthPx, logWidthOf, LOG_BEVEL, logCutBox, LOG_CUT_COLL, SLAB_HALF, WALL_T, WALL_VAR,
           CLUSTER_DIRS, CLUSTER_LAYOUTS, _clusterLayout, CLUSTER_UP, _clusterTurn, CLUSTER_BOXES, CLUSTER_HIT,
           CLUSTER_BED_SHIFT, CLUSTER_BEDS, CLUSTER_BED_OF, MORTAR_VOX, MORTAR_S, MORTAR_C, MORTAR_FACES,
           MORTAR_BOXES, SHROOM_SHAPE, _shroom, SHROOM_WHERE, _anyShroom, _grilled, _SHROOM_STD, _SHROOM_WHITE,
           _SHROOM_YELLOW, SHROOM_MODEL, TORCH_RAY_BOXES, STAIR_BOXES, STAIR_DIR, STAIR_OPP, STAIR_CCW, STAIR_CF,
           stairVarOf, stairBoxesAt, BERRY_STAGE, berryStage, BERRY_BUSHES, isBerryBush, _berryBush, FR,
           FLINT_ROCK_BOX, GOURD_BOX, FULL_UV_BOX, _gourd, _carvedFaces, _carved, SHAPE_SLAB, SHAPE_STAIRS,
           SHAPE_PANE, SHAPE_FENCE, SHAPE_MASK, ROT_MASK, SHAPE_LAYER, SHAPE_LAYER_MIX, LAYER_MAX, SHAPE_COVER,
           SHAPE_WALL, VARIANT_BLOCKS, _BRICK_VARIANTS, _GLASS_VARIANTS, _ALL_PLANKS, _ROCKS, _ROCK_LOOKS,
           _SANDSTONES, _GLOWS, _NO_COVER, _METALS, _GEM_COAL, SHAPE_BLOCKS, LAYER_STACKING, VARIANT_FAMILIES,
           CHIMNEY_MAX, CHIMNEY_ROCKS, chimneyWall, chimneyHeight, layerCount, layerMixed, layerVal,
           SHAPE_SLAB_MIX, SLAB_MIX_SEE, SLAB_MIX_HIGH, slabMixed, slabMixVal, slabsMix, slabMixBoxes, sideListed,
           LAYER_BOX, NO_BOXES, solidVal, SHAPE_FAMILY, shapeOfVal, PANE_BOX, _s16, _mirX, _mirZ, _swapXZ,
           FENCE_POST, FENCE_POST_COLL, FENCE_ARM, FENCE_DIAG, FENCE_ARM_COLL, FENCE_DIAG_COLL, FENCE_DIRS,
           _fenceArm, _joinSpec, FENCE_SPEC, WALL_SPEC, joinBoxesAt, COVER_BOX, opaqueVal, SHAPE_DIM, lightDim,
           shapeBoxesAt, HOLLOW_FILLS, HOLLOW_WALLS, HOLLOW_CORE_UP, HOLLOW_CORE_LYING, HOLLOW_SWAP, HOLLOW_INNER,
           _hollowOnAxis, _hollowParts, _hollowBoxes, hollowParts, hollowBoxes,
           SHAPE_DOOR, SHAPE_DOOR_R, isDoorVal, doorBoxes };                     // 0.842 (main thread: BLOCKS.*)
});

const BLOCK_CORE = buildCore('blocks');

const BLOCKS = BLOCK_CORE();
