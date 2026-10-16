'use strict';
/* woods/gen-trees.js: `put`, the helper every tree is built with (a block goes down only where nothing solid is).
   A part of genChunk's body (worldgen/gen-chunk.js). The trees themselves follow: gen-rime-trees.js, gen-palms.js,
   gen-dry-bush.js, and gen-tree-loop.js, which chooses and places them. */

corePart('gen.chunk', function () {
      // trees — evaluated over the margin so neighbours get the overlapping leaves
      const put = (x, y, z, id, force) => {
        if (x < 0 || x > 15 || z < 0 || z > 15 || y < 2 || y > CY - 1) return;
        const i = idx(x, y, z);
        if (force || data[i] === B.AIR) data[i] = id;
      };
});
