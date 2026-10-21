'use strict';
/* woods/birch.js: the birch. Its entry in the woods table (woods/woods.js says what each line is for).
   The rest of it: its blocks are in blocks/basic.js (log, planks, leaves), woods/wood-blocks.js (stripped),
   woods/hollow-logs.js and blocks/ladder-mortar.js (sapling); its tree in a new world is woods/gen-tree-loop.js;
   the tree its sapling grows into is _growBirch in woods/saplings.js (saplings only: the world's own birches stay as the
   generator makes them). */
defineWood('birch', {
  name: 'Birch',
  log: B.BIRCH_LOG, stripped: B.STRIPPED_BIRCH_LOG, hollow: B.HOLLOW_BIRCH_LOG, planks: B.BIRCH_PLANKS,
  leaves: B.BIRCH_LEAVES, sapling: B.BIRCH_SAPLING,
  seasonal: true, apples: true,
  shroom: B.RED_MUSHROOM,
  xp: { hollow: 30, sapling: 40 },
  grow: (x, y, z) => _growBirch(x, y, z),
});
