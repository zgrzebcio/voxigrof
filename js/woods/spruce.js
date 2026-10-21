'use strict';
/* woods/spruce.js: the spruce, the cold forest's conifer. Its entry in the woods table (woods/woods.js says what
   each line is for).
   The rest of it: its blocks are in woods/wood-blocks.js and woods/hollow-logs.js; its tree in a new world is
   woods/gen-tree-loop.js; its sapling grows one of five kinds at random, _growSpruce in woods/saplings.js (the usual
   cone, very tall, a narrow pole, a twin top, wide and old).
   Not `seasonal`: a spruce keeps its needles. */
defineWood('spruce', {
  name: 'Spruce',
  log: B.SPRUCE_LOG, stripped: B.STRIPPED_SPRUCE_LOG, hollow: B.HOLLOW_SPRUCE_LOG, planks: B.SPRUCE_PLANKS,
  leaves: B.SPRUCE_LEAVES, sapling: B.SPRUCE_SAPLING,
  apples: true,
  shroom: B.BLUE_MUSHROOM,
  xp: { hollow: 200, sapling: 50 },
  grow: (x, y, z) => _growSpruce(x, y, z),
});
