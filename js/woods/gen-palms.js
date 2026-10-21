'use strict';
/* woods/gen-palms.js: palms. A slim leaning trunk under a crown of fronds on ribs of thin log.
   A part of genChunk's body (worldgen/gen-chunk.js); called from the tree loop. A palm sapling grows from its own
   copy of this shape (woods/saplings.js, _growPalm): change both. */

corePart('gen.chunk', function () {
      /* Palms (0.84, rev 21): a slim trunk 7-11 tall leaning out up to 2.5 as it rises (the lean grows with the square of
         the height), on a root of dirt. Its crown (palmCrown) is four long fronds, each on a hidden rib of thin palm wood
         two out from the top so every leaf lies within the leaves' reach of wood (isLeavesConnected, woods/leaf-decay.js), out
         flat and drooping in steps, and now and then a short one between them. 22-main-loop.js grows the same from a sapling. */
      const PALM_W0 = 20, PALM_W1 = 14, PALM_RIB_W = 4;
      /* where palms grow (rev 31): one tree cell in DB_PALMS on a deep beach, one in SHORE_PALMS on any other warm shore (a
         third of what it was: the deep beaches are the palms' place now) */
      const DB_PALMS = 0.072, SHORE_PALMS = 0.01;
      // ...and only up to DB_PALM_TOP: the high land a deep beach's band reaches (hills, a mountain's flank) grows its own trees
      const DB_PALM_TOP = 110;
      // `log(x, y, z, val)` and `leaf(x, y, z)` place; `rnd(k)` is 0..1 for the k-th roll of this tree
      function palmCrown(cx0, cy0, cz0, log, leaf, rnd) {
        leaf(cx0, cy0 + 1, cz0);
        for (let d = 0; d < 4; d++) {
          const dx = [1, -1, 0, 0][d], dz = [0, 0, 1, -1][d], axis = dx ? 1 : 2;
          for (let s = 1; s <= 2; s++) { log(cx0 + dx * s, cy0, cz0 + dz * s, B.PALM_LOG | ((axis | (PALM_RIB_W << 2)) << 8)); leaf(cx0 + dx * s, cy0 + 1, cz0 + dz * s); }
          // out flat from the rib, then down a step and out, and down again: 3-5 long past the rib
          const L = 3 + ((rnd(10 + d) * 3) | 0);
          const cells = [[3, 0], [4, 0], [4, -1], [5, -1], [5, -2]].slice(0, L);
          for (const [u, v] of cells) leaf(cx0 + dx * u, cy0 + v, cz0 + dz * u);
          // a short frond between this one and the next (60%)
          if (rnd(20 + d) < 0.6) {
            const ex = [1, -1, -1, 1][d], ez = [1, 1, -1, -1][d];
            leaf(cx0 + ex, cy0 + 1, cz0 + ez); leaf(cx0 + ex * 2, cy0, cz0 + ez); leaf(cx0 + ex * 2, cy0, cz0 + ez * 2);
            if (rnd(30 + d) < 0.5) leaf(cx0 + ex * 2, cy0 - 1, cz0 + ez * 2);
          }
        }
      }
      function palmTree(tx, tz, h, gcx, gcz) {
        const rnd = (k) => hash2(gcx * 41 + k * 7 + 3, gcz * 67 - k * 13 + 5);
        const th = 7 + ((rnd(1) * 5) | 0), a = rnd(2) * Math.PI * 2, lean = 0.8 + rnd(3) * 1.7, ca = Math.cos(a), sa = Math.sin(a);
        put(tx, h, tz, DBEACH ? B.SANDY_DIRT : B.DIRT, true);   // a palm roots in sandy dirt (rev 31), the sapling's ground too
        let px = 0, pz = 0;
        for (let k = 1; k <= th; k++) {
          const t = (k - 1) / (th - 1), c = t * t * lean;
          const nx = Math.round(ca * c), nz = Math.round(sa * c), v = B.PALM_LOG | ((Math.round(PALM_W0 - (PALM_W0 - PALM_W1) * t) << 2) << 8);
          if (nx !== px || nz !== pz) {                                   // the bend's step joined below, both ways
            put(tx + nx, h + k - 1, tz + nz, v, true);
            if (nx !== px && nz !== pz) put(tx + nx, h + k - 1, tz + pz, v, true);
          }
          put(tx + nx, h + k, tz + nz, v, true);
          px = nx; pz = nz;
        }
        palmCrown(tx + px, h + th, tz + pz, (x, y, z, v) => put(x, y, z, v, true), (x, y, z) => put(x, y, z, B.PALM_LEAVES, false), rnd);
      }
});
