'use strict';
/* woods/palm.js: the palm, the oases' and warm shores' tree. Its entry in the woods table (woods/woods.js says
   what each line is for).
   The rest of it: its blocks are in woods/wood-blocks.js; its tree in a new world is woods/gen-palms.js; the tree
   its sapling grows into is _growPalm in woods/saplings.js (a copy of the generator's shape: change both).
   It has no hollow log, and no `apples`: nothing but sticks and its sapling comes off a palm. */
defineWood('palm', {
  name: 'Palm',
  log: B.PALM_LOG, stripped: B.STRIPPED_PALM_LOG, planks: B.PALM_PLANKS, leaves: B.PALM_LEAVES, sapling: B.PALM_SAPLING,
  xp: { log: 2, sapling: 100 },
  saplingOn: 'sandy_dirt',                     // sandy dirt only, the ground every palm in the world roots in
  grow: (x, y, z) => _growPalm(x, y, z),
});
