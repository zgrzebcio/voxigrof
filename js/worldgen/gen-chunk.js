'use strict';
/* worldgen/gen-chunk.js: genChunk(cx, cz), one chunk of blocks. This file holds its first and last line, then
   climateAt and what makeGen returns. Its body is the parts named gen.chunk, in this order:
     worldgen/terrain-columns.js          every column's ground, water and top block
     worldgen/underground.js              caves, ores, rooms, lava
     woods/gen-trees.js, gen-rime-trees.js, gen-palms.js, gen-acacia.js, biomes/gen-savanna.js (termite hills),
       woods/gen-dry-bush.js, gen-tree-loop.js    trees
     worldgen/cave-floors.js              cave dirt and mushrooms
     woods/gen-fallen-logs.js
     worldgen/ground-plants.js            gourds, wheat, flint, pebbles, grass, dry plants
     worldgen/canyons.js
     worldgen/desert-and-shore-plants.js  cactus, sugar cane, saplings, loose layers
     biomes/gen-ice-spikes.js, gen-rime-ice.js, gen-deep-desert.js, gen-mines.js
     worldgen/water-finish.js             waterfalls, leaks, the result
   The order is the order things are built in, and every part draws random numbers: keep it.
   SPEED. All these parts glued together make genChunk one huge function, and the browser does not optimise a
   function that big: its loops ran slow, 2 to 40 times slower than the same loop in a small function (measured: the
   cobweb check 4 ms against 0.1, the leak pass 14 against 0.4). So every heavy pass sits in a function of its own,
   called at once where it stands:
       (() => {   // own function: see SPEED in worldgen/gen-chunk.js
       ...the pass, as it was...
       })();
   That made a chunk 2.3 times faster to make, the land exactly the same. A new pass with loops goes in such a
   function too. What a pass declares inside it is seen only there: something later parts read (the grids, H, WLV,
   keepsWater...) is declared outside the wrappers.
   A part of makeGen's body (worldgen/make-gen.js). */

corePart('gen.make', function () {
    /* Generate one chunk of voxels. Column layout (top -> bottom):
       air/water | 1 grass (sand near water) | 5 dirt (or sand) | stone | 2 bedrock.
       Trees are stamped from a 2-block margin so canopies cross chunk borders seamlessly
       (placement is a pure function of world position, so every chunk agrees).            */
    function genChunk(cx, cz) {
      /*@include gen.chunk*/
    }

    // how far inside snow and hot (desert, red sand) climate a column is, 0..1, and its height: the main thread's
    // temperature reads it (0.82, player/stats.js)
    const climateAt = (x, z) => {
      const t = terrainInfo(x, z);
      // air: on the climate ladder the level's own warmth or cold in degrees (CLIMATE_LADDER), else null
      // red: the sandstorm's colour; not over the (yellow) Deep Desert's half
      return { snow: t.fSnow || 0, hot: Math.max(t.fDesert || 0, t.fRed || 0), red: (t.fRed || 0) * (1 - (t.fDeepD || 0) * (1 - (t.ddRed ?? 1))), h: t.h, air: t.air,
               inland: Math.max(t.rT || 0, t.lk || 0) > 0.3,     // a river or a lake, not the sea (the ice)
               rime: t.rimeAir || 0,                             // how far into the Coldest Deep Snow's cold
               dd: t.ddAir || 0 };                               // ...and the Deep Desert's heat
    };
    return { genChunk, heightAt, biomeAt, climateAt, climAt, rimeOpenAt: bio.rimeOpenAt,     // rimeOpenAt: castle sites
             rdfOpenAt: bio.rdfOpenAt,                                                        // ...and the great pyramid's
             dryAt: bio.dryAt,                                                                // the Dryland's grass colour
             seaLevel: WATER_LEVEL };                                                         // the sea's top water y (seasons/waves.js)
});
