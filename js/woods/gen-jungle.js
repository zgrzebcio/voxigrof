'use strict';
/* woods/gen-jungle.js: the Jungle's trees in a new world (rev 43). One cell of the tree loop's grid at a time: a tree
   standing thick (a Deep Jungle thicker, with more giants), else now and then a bush. The shapes are woods/jungle-trees.js
   (jungleTree, at the voxel core's top level: a sapling grows the same ones on the page).
   A part of genChunk's body (worldgen/gen-chunk.js); called from the tree loop (woods/gen-tree-loop.js). */

corePart('gen.chunk', function () {
      const JUNGLE_TREE_P = 0.6, DEEP_JUNGLE_TREE_P = 0.72;      // a cell's chance of a tree
      const JUNGLE_BUSH_P = 0.22, DEEP_JUNGLE_BUSH_P = 0.18;      // ...and of a bush when it has none
      function jungleCell(tx, tz, h, wx, wz, gcx, gcz, r, ti) {
        const deep = ti.deepF > 0.5;
        const rnd = (a, b) => hash2(gcx * 73 + a * 19 - 7, gcz * 89 - b * 23 + 11);
        const at = (dx, dy, dz, v, wood) => put(tx + dx, h + 1 + dy, tz + dz, v, wood);   // true when written
        const treeP = deep ? DEEP_JUNGLE_TREE_P : JUNGLE_TREE_P;
        if (r > treeP) {
          if (r < treeP + (deep ? DEEP_JUNGLE_BUSH_P : JUNGLE_BUSH_P)) jungleTree(JUNGLE_TREE.BUSH, at, rnd);
          return;
        }
        let kind = jungleKindOf(rnd(1, 1), deep);
        /* a giant needs its 2x2 foot on dry ground no more than a block above or below this column's; else it grows as a
           tall one. Its four columns get dirt under the trunk, filling a lower one up to the rest. */
        if (kind === JUNGLE_TREE.GIANT) {
          let room = h < CY - 40;
          for (const [dx, dz] of [[1, 0], [0, 1], [1, 1]]) {
            if (!room) break;
            const t2 = terrainInfo(wx + dx, wz + dz);
            if (Math.abs(t2.h - h) > 1 || t2.h < t2.wl + 1) room = false;
          }
          if (room) for (const [dx, dz] of [[1, 0], [0, 1], [1, 1]]) put(tx + dx, h, tz + dz, B.DIRT, true);
          else kind = JUNGLE_TREE.TALL;
        }
        put(tx, h, tz, B.DIRT, true);
        jungleTree(kind, at, rnd, { cocoa: true, vines: VINES });   // vines on the giants from rev 45 (gen-setup.js)
      }
});
