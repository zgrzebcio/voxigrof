'use strict';
/* woods/rime.js: rime wood, the frozen trees of the Coldest Deep Snow. Its entry in the woods table
   (woods/woods.js says what each line is for).
   The rest of it: its blocks are in woods/wood-blocks.js and woods/hollow-logs.js; its trees in a new world are
   woods/gen-rime-trees.js; the tree its sapling grows is the spire (_growRimeSpire, woods/saplings.js, a copy of the
   generator's SPIRE). No `shroom` comes up on its hollow log. */
defineWood('rime', {
  name: 'Rime',
  log: B.RIME_LOG, stripped: B.STRIPPED_RIME_LOG, hollow: B.HOLLOW_RIME_LOG, planks: B.RIME_PLANKS, leaves: B.RIME_LEAVES,
  sapling: B.RIME_SAPLING,
  saplingOn: 'cold',                     // snow, dirt or grass: it roots in the frozen ground it grows on
  hardy: true,                           // it grows in winter too
  charcoalS: 5,                          // it thaws first, a little slower
  xp: { log: 3, hollow: 300, sapling: 80 },   // frozen wood from the far cold
  grow: (x, y, z) => _growRimeSpire(x, y, z),
});
