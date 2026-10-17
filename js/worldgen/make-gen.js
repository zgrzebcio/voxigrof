'use strict';
/* worldgen/make-gen.js: makeGen(seed, type, biomeRev, colBuf), the generator of one world. This file holds its first and
   last line; its body is the parts named gen.make: worldgen/gen-setup.js, gen-caves-plan.js, column-cache.js, gen-chunk.js.
   A part of VOXEL_CORE (chunks/voxel-core.js). */

corePart('voxel', function () {
  /* A wild berry bush's growth stage from a roll 0..1: ripe, with its fruit, 20% more often than the even sixth it
     was (BERRY_RIPE_SHARE 0.2), the other five stages sharing the rest evenly. New chunks only, any world (no seam to see). */
  const BERRY_RIPE_SHARE = 0.2;
  const wildBerryStage = (r) => r < BERRY_RIPE_SHARE ? BERRY_STAGE.GROWN
    : Math.min(BERRY_STAGE.GROWN - 1, ((r - BERRY_RIPE_SHARE) / (1 - BERRY_RIPE_SHARE) * BERRY_STAGE.GROWN) | 0);

  /* ---------- terrain generator ---------- */
  /* biomeRev: 1 for worlds made before 0.819, so their unexplored land still joins what they already have;
     2 gives bigger snow and desert biomes (see `temp` below). Fixed per world at creation (w.biomeRev).
     colBuf: the workers' shared column cache (worldgen/column-cache.js), or null for a table of its own. */
  function makeGen(seedStr, terrainType, biomeRev = 1, colBuf = null) {
    /*@include gen.make*/
  }
});
