'use strict';
/* woods/oak.js: the oak. Its entry in the woods table (woods/woods.js says what each line is for).
   The rest of it: its blocks are in blocks/basic.js (log, planks, leaves), woods/wood-blocks.js (stripped),
   woods/hollow-logs.js and blocks/ladder-mortar.js (sapling); its tree in a new world is woods/gen-tree-loop.js;
   the tree its sapling grows into is _growRound in woods/saplings.js. */
defineWood('oak', {
  name: 'Oak',
  log: B.LOG, stripped: B.STRIPPED_LOG, hollow: B.HOLLOW_LOG, planks: B.PLANKS, leaves: B.LEAVES, sapling: B.OAK_SAPLING,
  seasonal: true, apples: true,
  shroom: B.BROWN_MUSHROOM,              // ...and from that, black, white or yellow, as brown grows in the wild
  xp: { hollow: 6, sapling: 30 },
  grow: (x, y, z) => _growRound(x, y, z, WOODS.oak),
});
