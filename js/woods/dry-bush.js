'use strict';
/* woods/dry-bush.js: the Dryland's big dry bushes. Its entry in the woods table (woods/woods.js says what each
   line is for).
   Not a tree (`tree: false`): only leaves, standing on the ground with no wood, so they never decay and never lie
   as litter. They give sticks only. Its block is in woods/wood-blocks.js; the bushes in a new world are
   woods/gen-dry-bush.js. (The small dry bush plant, B.DRY_BUSH, is another thing: blocks/dry-plants.js.) */
defineWood('dry', {
  name: 'Dry bush',
  leaves: B.DRY_LEAVES,
  tree: false,
  burn: { leaves: [2, 0.7] },            // they go up fast and pass it on
});
