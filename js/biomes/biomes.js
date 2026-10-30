'use strict';
/* biomes/biomes.js: builds BIOME_CORE, the land's shape and what each place is called, and runs it for the page
   (BIOMES). Loaded LAST of the biomes parts, because it glues them together.

   BIOME_CORE also runs as text inside the workers (10-workers.js), so no part of it may touch anything outside
   itself: makeGen (worldgen/make-gen.js) hands makeBiomes the world's noise and settings. It is built before the
   blocks and the voxel core, whose makeGen calls BIOMES.makeBiomes.

   The parts, in the order they are glued:
     biomes/climate-ladder.js   the temperature levels
     this file                  makeBiomes(o): its first and last line, and BIOME_CORE's return
       biomes/fields.js         ...its body: the world's settings by biomeRev, the shore helpers
       biomes/rivers-lakes.js   rivers traced downhill, lakes, basins, waterfalls' steps
       biomes/oasis.js          the oases of the desert
       biomes/terrain.js        terrainInfo(x, z): height, water and every mask of one column
       biomes/queries.js        heightAt, biomeAt, climAt, dryAt... and what makeBiomes returns
   What generation then BUILDS on that land is the voxel core's genChunk: worldgen/, woods/gen-*.js, biomes/gen-*.js.

   biomeRev is fixed per world when it is made (w.biomeRev), so a world's unexplored land always joins what it has.
   Every rule added to the land is switched on from a revision number; CLAUDE.md lists them. */

corePart('biomes', function () {
  /* The grass's dryness scale (dryAt, biomes/queries.js): 0 green, DRY_PALE the Dryland's pale grass, 1 the Savanna's
     golden grass. The mesher packs it per corner; the shader (04-materials.js) reads BIOMES.DRY_PALE to split it. */
  const DRY_PALE = 0.8;
  function makeBiomes(o) {
    /*@include biomes.make*/
  }
  // the names every biome-keyed list should treat alike (entity spawns, structures, mushrooms): the base name
  // ...and a forest's or the plains' hills count as that forest or plain
  // ...but the Deep Desert is its own: no desert village there; the Deep Red one too, and its Flat (the great pyramid's)
  const biomeBase = (name) => String(name || '').replace(/^Deep (?!(Red )?Desert( Flat)?$)/, '').replace(/^(Warm|Cold) /, '').replace(/^((?:Birch |Spruce )?Forest|Plains|Jungle) Hills$/, '$1');
  return { makeBiomes, biomeBase, CLIMATE_LADDER, DRY_PALE };
});

const BIOME_CORE = buildCore('biomes');

const BIOMES = BIOME_CORE();
