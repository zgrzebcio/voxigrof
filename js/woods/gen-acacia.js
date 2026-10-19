'use strict';
/* woods/gen-acacia.js: the acacia, the Savanna's tree. A short trunk that forks into one or two limbs climbing out
   at a slant, each under a flat, wide crown.
   A part of genChunk's body (worldgen/gen-chunk.js); called from the tree loop (woods/gen-tree-loop.js). Its sapling
   grows the page's copy of this shape (_growAcacia, woods/saplings.js): change both. */

corePart('gen.chunk', function () {
      /* An acacia (rev 28): a trunk 3-5 tall on a root of dirt, then one limb (40%) or two (60%, about opposite ways)
         climbing out a block up for each block out, 2-4 long. A limb is a stair of upright logs, every step also joined
         beside the one before (both ways on a diagonal), so its wood is one piece. Its crown is a flat disc of leaves
         over its tip, 3 out (ragged at the rim), and a smaller one on that: every leaf within the leaves' reach of wood
         (isLeavesConnected, woods/leaf-decay.js). */
      const ACACIA_TRUNK_W = 22, ACACIA_LIMB_W = 17;
      function acaciaTree(tx, tz, h, gcx, gcz) {
        const rnd = (k) => hash2(gcx * 59 + k * 13 - 11, gcz * 83 - k * 7 + 17);
        const LOG = (w) => B.ACACIA_LOG | ((w << 2) << 8);
        const th = 3 + ((rnd(1) * 3) | 0);
        put(tx, h, tz, B.DIRT, true);
        for (let y = h + 1; y <= h + th; y++) put(tx, y, tz, LOG(ACACIA_TRUNK_W), true);
        const limbs = rnd(2) < 0.4 ? 1 : 2, a0 = rnd(3) * Math.PI * 2;
        for (let l = 0; l < limbs; l++) {
          const a = a0 + l * (Math.PI + (rnd(4 + l) - 0.5) * 1.2), ca = Math.cos(a), sa = Math.sin(a);
          const len = 2 + ((rnd(6 + l) * 3) | 0);
          let px = 0, pz = 0, y = h + th;
          for (let s = 1; s <= len; s++) {
            const nx = Math.round(ca * s * 1.1), nz = Math.round(sa * s * 1.1);
            put(tx + nx, y, tz + nz, LOG(ACACIA_LIMB_W), true);                      // beside the last step
            if (nx !== px && nz !== pz) put(tx + nx, y, tz + pz, LOG(ACACIA_LIMB_W), true);
            y++;
            put(tx + nx, y, tz + nz, LOG(ACACIA_LIMB_W), true);                      // ...and up
            px = nx; pz = nz;
          }
          // the crown: a disc a block over the limb's tip, and a smaller one on it
          const ex = tx + px, ez = tz + pz, R2 = 10;
          for (let oz = -3; oz <= 3; oz++)
            for (let ox = -3; ox <= 3; ox++) {
              const d2 = ox * ox + oz * oz;
              if (d2 > R2) continue;
              if (d2 >= 8 && hash2(gcx * 101 + ox * 17 + l * 5, gcz * 97 + oz * 23 - l * 3) < 0.45) continue;
              put(ex + ox, y + 1, ez + oz, B.ACACIA_LEAVES, false);
            }
          for (let oz = -2; oz <= 2; oz++)
            for (let ox = -2; ox <= 2; ox++) {
              const d2 = ox * ox + oz * oz;
              if (d2 > 4 || (d2 >= 4 && hash2(gcx * 71 + ox * 29 + l, gcz * 67 + oz * 31 - l) < 0.5)) continue;
              put(ex + ox, y + 2, ez + oz, B.ACACIA_LEAVES, false);
            }
        }
      }
});
