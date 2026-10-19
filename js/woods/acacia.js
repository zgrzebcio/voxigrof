'use strict';
/* woods/acacia.js: the acacia, the Savanna's flat-topped tree. Its entry in the woods table (woods/woods.js says what
   each line is for).
   The rest of it: its blocks are in woods/wood-blocks.js and woods/hollow-logs.js; its tree in a new world is
   woods/gen-acacia.js; the tree its sapling grows into is _growAcacia in woods/saplings.js (a copy of the generator's
   shape: change both). No `apples`. Termites eat its logs (and any wood's) into hollow logs (entities/termite.js). */
defineWood('acacia', {
  name: 'Acacia',
  log: B.ACACIA_LOG, stripped: B.STRIPPED_ACACIA_LOG, hollow: B.HOLLOW_ACACIA_LOG, planks: B.ACACIA_PLANKS, leaves: B.ACACIA_LEAVES,
  sapling: B.ACACIA_SAPLING,
  xp: { log: 2, hollow: 6, sapling: 60 },   // hollow as an oak's: termites hollow many of them
  grow: (x, y, z) => _growAcacia(x, y, z),
});
