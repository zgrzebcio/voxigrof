'use strict';
/* chunks/voxel-shared.js: what every part of the voxel core shares. The block registry taken from BLOCKS, the tiles
   tinted by climate and dryness (TINTED, DRY_TILE, setTintSampler), the chunk's size (CX, CZ, CY) and idx().
   First part of VOXEL_CORE (see core-parts.js; built in chunks/voxel-core.js). */

corePart('voxel', function () {
  'use strict';

  /* The block registry — ids, tiles, properties, models' boxes, chisel shapes and the value helpers — lives in
     blocks/blocks.js since 0.8376 (BLOCK_CORE, shipped into the worker beside this core). Everything it has: */
  const { T, FURNACE_T, FURNACE_ROCK_N, BENCH_WOOD_N, BENCH_T, SHROOM_T, DECOR_T, BERRY_KINDS, BERRY_STAGES,
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
          CHIMNEY_MAX, CHIMNEY_ROCKS, chimneyWall, chimneyHeight, layerCount, layerMixed, layerVal, SHAPE_SLAB_MIX,
          SLAB_MIX_SEE, SLAB_MIX_HIGH, slabMixed, slabMixVal, slabsMix, slabMixBoxes, sideListed, LAYER_BOX,
          NO_BOXES, solidVal, SHAPE_FAMILY, shapeOfVal, PANE_BOX, _s16, _mirX, _mirZ, _swapXZ, FENCE_POST,
          FENCE_POST_COLL, FENCE_ARM, FENCE_DIAG, FENCE_ARM_COLL, FENCE_DIAG_COLL, FENCE_DIRS, _fenceArm,
          _joinSpec, FENCE_SPEC, WALL_SPEC, joinBoxesAt, COVER_BOX, opaqueVal, SHAPE_DIM, lightDim, shapeBoxesAt,
          HOLLOW_FILLS, HOLLOW_WALLS, HOLLOW_CORE_UP, HOLLOW_CORE_LYING, HOLLOW_SWAP, HOLLOW_INNER, _hollowOnAxis,
          _hollowParts, _hollowBoxes, hollowParts, hollowBoxes } = BLOCKS;
  /* The climate colour: grass and water blend smoothly toward their warm or cold look by a value per
     vertex, -1 cold .. 0 usual .. 1 warm (the 'clim' attribute). The fragment shader mixes in the warm or cold tile
     above, or tints the water (04, row 1 of TILE_LAYER in 03). TINTED: the tiles that take it. */
  const TINTED = new Uint8Array(1024);
  for (const t of [T.GRASS_TOP, T.GRASS_SIDE, T.GRASS_PLANT, T.SHORT_GRASS_PLANT, T.TALL_BOT, T.TALL_TOP, T.WATER, T.WATER_FLOW, T.WATER_FLOW_FAST, T.WATER_FALL]) TINTED[t] = 1;
  // the climate sampler (climAt, biomes/biomes.js): the worker sets it from its world's generator; icons have none
  let _climAt = null, _dryAt = null;
  /* The Dryland's dry grass: the grass block's top and sides fade to their pale dry look (T.GRASS_TOP_DRY,
     T.GRASS_SIDE_DRY) by a second value per vertex, 0 green .. 1 dry, from the generator's own field (dryAt, biomes/queries.js), so the
     two colours meet over tens of blocks and not block by block. It rides in the `dark` attribute, which only water
     used (its depth shade): the opaque pass's vertex shader reads it as dryness (04). In a world chunk the block's own
     GRASS_DRY variant no longer picks its tile; icons and drops (no sampler) still show it by that. */
  const DRY_TILE = new Uint8Array(1024);
  DRY_TILE[T.GRASS_TOP] = 1; DRY_TILE[T.GRASS_SIDE] = 1;
  // ...and the grass PLANTS since 0.8444: short and tall grass pale by the same dryness at their foot (the shader, 04)
  DRY_TILE[T.GRASS_PLANT] = 1; DRY_TILE[T.TALL_BOT] = 1; DRY_TILE[T.TALL_TOP] = 1; DRY_TILE[T.SHORT_GRASS_PLANT] = 1;
  const setTintSampler = (fn, dry) => { _climAt = fn || null; _dryAt = dry || null; };                                                     // 0.804                                                  // 0.801                                                 // 0.7947
  const CX = 16, CY = 250, CZ = 16;
  /* Flat ("superflat") worlds: a 25-block slab — 1 bedrock, 19 stone, 4 dirt, 1 grass — with a
     matching low water level so lakes and ponds still carve into it. Everything else about the
     world (biome = Plains, trees, surface plants) works exactly as it does at normal altitude. */
  const FLAT_TOP = 24;                     // y of the grass layer
  // Water sits 4 below the surface, not 1. Every decorator (trees, plants, melons, cacti) skips
  // columns at h <= WATER_LEVEL + 1 or + 3 to keep shorelines clear — parking the flat surface
  // just above water level would have tripped all of those and left a completely barren world.
  const FLAT_WATER_LEVEL = FLAT_TOP - 4;
  const idx = (x, y, z) => x + (z << 4) + (y << 8);   // voxel index inside a chunk
});
