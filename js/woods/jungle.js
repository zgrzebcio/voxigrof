'use strict';
/* woods/jungle.js: jungle wood, the Jungle's trees. Its entry in the woods table (woods/woods.js says what each line is
   for).
   The rest of it: its blocks are in woods/wood-blocks.js and woods/hollow-logs.js; its trees' shapes are ONE function,
   jungleTree (woods/jungle-trees.js, in the voxel core), which the world generator (woods/gen-jungle.js) and its sapling
   (_growJungle, woods/saplings.js) both build. A giant's 2x2 trunk is four quarters of one log (LOG_W_QUAD,
   blocks/basic.js). Cocoa pods grow on its straight trunks (woods/cocoa.js). Evergreen, no `apples`. */
defineWood('jungle', {
  name: 'Jungle',
  log: B.JUNGLE_LOG, stripped: B.STRIPPED_JUNGLE_LOG, hollow: B.HOLLOW_JUNGLE_LOG, planks: B.JUNGLE_PLANKS, leaves: B.JUNGLE_LEAVES,
  sapling: B.JUNGLE_SAPLING,
  xp: { log: 2, hollow: 5, sapling: 80 },
  grow: (x, y, z) => _growJungle(x, y, z),
});
