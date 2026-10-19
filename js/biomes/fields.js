'use strict';
/* biomes/fields.js: makeBiomes' set-up. What the generator handed over (noise, seed, settings), the switches each
   biomeRev turns on (FLOW, SHORES, HILLS, UPLAND, RIME, DESERT2...), and the shore helpers (kind, cliff, width).
   A part of makeBiomes' body (biomes/biomes.js): the parts after it use these names. */

corePart('biomes.make', function () {
    const { noise2, fbm, smooth01, seedInt, WATER_LEVEL, FLAT, FLAT_TOP, biomeRev } = o;
    const BIG_CLIMATE = biomeRev >= 2;
    const FEWER_HILLS = biomeRev >= 3;                // about 30% fewer desert hills
    const REV5 = biomeRev >= 5;                       // 0.823
    const LADDER = biomeRev >= 7;                     // the climate ladder
    const BIGGER = biomeRev >= 8;                     // every biome twice as big again
    const SPIKES = biomeRev >= 9;                     // the Ice Spikes biome, and icebergs in the snow's seas
    const SNOW_HILLS = biomeRev >= 10;                // Snowy Hills, and bigger icebergs (02)
    const FLOW = biomeRev >= 11;                      // oceans 3x bigger and rarer; rivers that flow to the sea
    const OS = FLOW ? 1 / 3 : 1;                      // the continents' scale: a third of the frequency, the same share of sea
    /* The world 250 tall (biomeRev 12): the land inland rises higher, hills are taller, and mountains reach
       for TALL_CAP, eased into it above TALL_EASE so the highest peaks round off instead of being sheared flat. */
    const TALL = biomeRev >= 12, TALL_EASE = 196, TALL_CAP = 240;
    /* Shores (biomeRev 13). Along the water a stretch of coast is, by a slow noise, a sand beach (about half),
       turf down to the water (most of the rest) or gravel (about 1 in 20): shoreKindAt, 0 turf, 1 sand, 2 gravel. Where
       cliffAt rises near the edge of a continent, the low land by the sea stands up as a rocky shore, SHORE_CLIFF_H
       blocks over the water (terrainInfo; its face is stone, genChunk). Beaches run 1-6 wide with ragged edges. */
    const SHORES = biomeRev >= 13, SHORE_ROCK = 0.45, SHORE_CLIFF_H = 11, SHORE_GRAVEL = -0.56, SHORE_SAND = 0.0;   // measured: 5% under -0.56, 50% under 0
    /* Hills, cliffs and wider beaches (biomeRev 14). Small and medium hills in patches over the land, some of
       them steep crags, and cliffs (a step of 5-14 along a noise's contour, a plateau's edge) inland (terrainInfo); the
       rocky coasts more common, 8-20 high and sharper; sea beaches up to 10 wide. genChunk bares stone on a steep face,
       makes a pond of under 9 cells land again and runs a beach's sand or gravel on under the shallow water. */
    const HILLS = biomeRev >= 14;
    /* Uplands (biomeRev 15): water at its own height. A flowing river's surface follows the land down (the
       lowest ground it has passed less one, so it only ever falls: a step, a little fall where the land drops) and its
       basin lakes lie at their rim; lakes of their own (_lakeAt, in place of the noise ponds) fill hollows and flats at
       any height, the mountains too. terrainInfo reports `wl`, the column's top water y (WATER_LEVEL for the sea), and
       a bank that falls away is raised to hold the water in. Beds deepen toward the middle, with humps and holes. The
       hills come smoother in some places and long and wide in others; genChunk adds rooms, tunnels, cave mouths,
       arches and overhangs. */
    const UPLAND = biomeRev >= 15, WET_EDGE = 2.4;    // a river or lake is water inside WET_EDGE of its bank line
    /* Lake rivers (biomeRev 16): every river runs out of a lake, from the low point of its rim, downhill to
       another lake at or under it or to the sea (_lakeRiver; no bare springs), and steers round a lake standing higher
       than it. Its steps are spread (no more than 1 a stride where cutting at most 4 deeper can do it), it shallows
       toward its mouth, and cuts no trench into the sea floor. Lakes come bigger (to 60 across the short way) and
       longer (up to 1.6x), shores and banks ease out a third wider, a bank holding water back slopes off instead of
       standing up, and the sea floor falls away from the shore a third faster. */
    const RIV2 = biomeRev >= 16, LAKE_OUTLET = 0.9;
    /* Mountains and falls (biomeRev 17). Some mountains are broad and flat-topped (`mesa`: their ridges at half
       the frequency, eased to a plateau), and mountain country is cut by valleys (`vl`, along a noise's zero line) that
       the drainage follows, so the lakes found in them send their rivers down them. A river stride that drops 3 or more
       does it at once, half way: a waterfall, with a plunge pool under it (genChunk hangs the falling water down the
       face). terrainInfo reports a river's way (`fd` 1-8, an eighth turn each from +x) for the flowing texture. */
    const FALLS = biomeRev >= 17;
    /* Divides (biomeRev 18). Waters are grouped: a lake is its own group, a river carries its source's group,
       the lake it last left (`up`) and the one it runs into (`dn`). Where a column would be one water's but lies within
       3 of another group's lower water, it is a dry ridge at the higher water's top + 1 instead, so two waters at
       different heights never touch; only a river's own steps and falls (and into or out of its own lakes) do. A placed
       lake overlapping a lower one is not placed, and a river's basin lake sits on a 64-block lattice, sized and levelled
       by its cell alone, so two rivers trapped in one basin share one lake. Mountains are named from 150 (where the
       ridges, not the hills, make the height), raised land below or of hills is '<biome> Hills'; plains half as many. */
    const DIVIDE = biomeRev >= 18, DIV_REACH = 3, BASIN_CELL = 64, PLAINS_FROM = DIVIDE ? 0.28 : 0.0;
    /* Coldest Deep Snow (biomeRev 19): the heart of the deep snow, where the temperature field is lowest (the
       coldest two fifths of the deep snow, about 3% of the land). -60°C there (`rimeAir`, player/stats.js), rime trees
       and ice the wind has carved standing over the snow (genChunk, worldgen/gen-chunk.js). `fRime` names it from RIME_TO; `rimeAir` starts
       at RIME_AIR_FROM, a few hundred blocks out, so the cold comes on before the biome does. */
    const RIME = biomeRev >= 19, RIME_FROM = 0.60, RIME_TO = 0.64, RIME_AIR_FROM = 0.55;
    /* Its two halves (biomeRev 20): the Coldest Deep Snow Forest (`rimeW` 1), where the rime trees and the ice
       stand (half as thick as 0.836 had them everywhere), and the open Coldest Deep Snow, gently rolling, its hills and
       mountains mostly smoothed away (RIME_CALM), with only the odd tree or ice shape: room to build (the snow castle). */
    const RIME2 = biomeRev >= 20, RIME_CALM = 0.8;
    /* The desert update (0.84, biomeRev 21). The Deep Desert is the hot heart of the deserts, where the temperature field
       is highest (from DD_FROM, inside the red sand, about 5% of the land): mesas cut into terraces and shattered by
       cracks, jagged broken ridges between them (terrainInfo), sandstone crags, hoodoos and the bones of great beasts
       (genChunk, worldgen/gen-chunk.js). Hotter than the desert (`ddAir`, from DD_AIR_FROM, so the heat comes on before the biome does;
       player/stats.js). An Oasis (_oasisAt) is a rare lake in a ring of grass out in the open desert, under palms.
       genChunk also lays the desert's sand 5 deep over 5 of sandstone, grows dry plants and the odd palm on a warm shore. */
    const DESERT2 = biomeRev >= 21, DD_FROM = 0.55, DD_TO = 0.59, DD_AIR_FROM = 0.5, DD_TERRACE = 5;
    /* The red desert and mountains update (biomeRev 22): a slow noise splits the Deep Desert into two halves side
       by side, the Deep Desert (yellow sand, sandstone) and the Deep Red Desert (red sand, red sandstone): `ddRed`.
       genChunk (worldgen/gen-chunk.js) also hollows all high land with halls, tunnels out to the slopes and deep shafts, lays gold at any
       height under the red sand, and digs small mine shafts into the desert hills, mostly the red ones. */
    const DESERT3 = biomeRev >= 22;
    /* The Dryland (biomeRev 23): the hot side of the warm plains, beside the desert (from DRY_FROM of a level, with
       a wobble of its own so it is not a ring), `fDry`. Pale dry grass, many dry plants and half the green ones, big dry
       bushes, no trees, and now and then bones (genChunk, worldgen/gen-chunk.js). */
    const DRYLAND = biomeRev >= 23, DRY_FROM = 1.08, DRY_TO = 1.22;
    /* The Savanna (biomeRev 28): the Dryland's hot edge, next to the desert (from SAV_FROM of a level, on the Dryland's
       own wobble, so it always lies on the desert's side of it), `fSav`. Golden grass (dryAt), tall grass, a few dry
       plants, flat-topped acacias standing apart, and termite hills (genChunk: woods/gen-acacia.js,
       biomes/gen-savanna.js). The Dryland keeps only what lies before it. */
    const SAVANNA = biomeRev >= 28, SAV_FROM = 1.28, SAV_TO = 1.36;
    /* A big Savanna (biomeRev 30): from SAV2_FROM, and the desert pushed out to start from DESERT_LVL (a level of 1.75
       instead of 1.5), so the Savanna is a broad biome of its own, about as wide as the desert left beside it. Its
       termite hills fewer and spaced out (biomes/gen-savanna.js). */
    const SAV2 = biomeRev >= 30, SAV2_FROM = 1.2, SAV2_TO = 1.28;
    const DESERT_LVL = SAV2 ? 1.75 : 1.5;
    const SAV_LO = SAV2 ? SAV2_FROM : SAV_FROM, SAV_HI = SAV2 ? SAV2_TO : SAV_TO;
    /* Level shores (biomeRev 27): about half of a river's or a lake's shore lies level with its water, its first FLUSH_W
       columns' ground at the water's top, so a swimmer walks out instead of jumping a block; genChunk lays each such
       stretch as a little beach of sand (gravel on a gravel shore: worldgen/terrain-columns.js). A slow noise along the
       shore picks them, more of them where the shore is sand already (under FLUSH_SAND there, FLUSH_ELSE elsewhere).
       Never within FLUSH_SAFE of a higher water: its rim has to stand (terrainInfo, biomes/terrain.js). */
    const FLUSH = biomeRev >= 27, FLUSH_W = 2, FLUSH_SAND = 0.55, FLUSH_ELSE = 0.2, FLUSH_SAFE = 4;
    // two waters that may meet at different heights: one group, or a river and a lake it leaves or enters
    const _kin = (a, b) => a.g === b.g || (!a.lake && b.lake && (a.up === b.g || a.dn === b.g)) || (!b.lake && a.lake && (b.up === a.g || b.dn === a.g));
    // the mountain valleys' depth 0..1 at a place, from the same mask the mountains use (0 outside mountain country)
    const _valley = (x, z) => FALLS ? smooth01(1 - Math.abs(fbm(x * 0.0025 + 3301.7, z * 0.0025 - 1907.3, 2)), 0.86, 0.975) : 0;
    const shoreKindAt = (x, z) => {
      const n = fbm(x * 0.006 + 4411.7, z * 0.006 - 2297.3, 2);
      return n < SHORE_GRAVEL ? 2 : n < SHORE_SAND ? 0 : 1;
    };
    // 0..1, how much a rocky coast this is: in patches, and only near a continent's edge (cont), where the sea is
    const cliffAt = (x, z, cont) => SHORES
      ? smooth01(fbm(x * 0.003 + 7123.1, z * 0.003 - 5511.9, 2), HILLS ? 0.24 : 0.32, HILLS ? 0.40 : 0.48) * (1 - smooth01(cont, -0.10, 0.04)) : 0;
    // a beach's width at a column: `type` 1 the sea, 2 a river or a lake; ragged, a slow width and two quicker wobbles on it
    const shoreWidth = (x, z, type) => {
      const bn = (fbm(x * 0.007 + 217.3, z * 0.007 - 803.7, 2) + 1) * 0.5;
      const rag = fbm(x * 0.02 + 401.3, z * 0.02 - 193.7, 2) * 1.6 + fbm(x * 0.09 - 77.7, z * 0.09 + 31.1, 2) * 1.2;
      return (type === 1 ? 1 + bn * (HILLS ? 9 : 5) : bn * 0.6) + rag;   // the sea's 1-10 in rev 14
    };
});
