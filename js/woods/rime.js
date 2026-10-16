'use strict';
/* woods/rime.js: rime wood, the frozen trees of the Coldest Deep Snow. Its entry in the woods table
   (woods/woods.js says what each line is for).
   The rest of it: its blocks are in woods/wood-blocks.js and woods/hollow-logs.js; its trees in a new world are
   woods/gen-rime-trees.js.
   It has no sapling, so nothing grows it: its leaves give sticks only, and no `shroom` comes up on its hollow log. */
defineWood('rime', {
  name: 'Rime',
  log: B.RIME_LOG, stripped: B.STRIPPED_RIME_LOG, hollow: B.HOLLOW_RIME_LOG, planks: B.RIME_PLANKS, leaves: B.RIME_LEAVES,
  charcoalS: 5,                          // it thaws first, a little slower
  xp: { log: 3, hollow: 300 },           // frozen wood from the far cold
});
