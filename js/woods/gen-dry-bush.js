'use strict';
/* woods/gen-dry-bush.js: the Dryland's big dry bush, a mound of dry leaves with no wood.
   A part of genChunk's body (worldgen/gen-chunk.js); called from the tree loop. */

corePart('gen.chunk', function () {
      /* A big dry bush (the Dryland): a mound of dry leaves on the ground, no wood. Small (45%: one block, now and then
         two high), medium (35%: about 3 across, 2 high) or big (20%: about 5 across, 3 high), narrower up top, ragged. */
      function dryBush(tx, tz, h, gcx, gcz) {
        const rnd = (k) => hash2(gcx * 53 + k * 11 - 7, gcz * 71 - k * 5 + 9), s = rnd(1);
        const R = s < 0.45 ? 0.6 : s < 0.8 ? 1.4 : 2.3, H2 = s < 0.45 ? 1 + (rnd(2) < 0.4 ? 1 : 0) : s < 0.8 ? 2 : 3, ri = Math.ceil(R);
        for (let oy = 0; oy < H2; oy++) {
          const rr = R * (1 - oy / (H2 + 0.6));
          for (let oz = -ri; oz <= ri; oz++)
            for (let ox = -ri; ox <= ri; ox++) {
              const d2 = ox * ox + oz * oz;
              if (d2 > rr * rr + 0.3) continue;
              if (d2 > 1 && d2 > (rr - 0.8) * (rr - 0.8) && hash2(gcx * 97 + ox * 13 + oy * 7, gcz * 89 + oz * 17 - oy) < 0.3) continue;
              put(tx + ox, h + 1 + oy, tz + oz, B.DRY_LEAVES, false);
            }
        }
      }
      // At most one tree per 5x5 world-grid cell, at a hash-jittered position 1..3 inside the
      // cell — trunks are therefore always >=3 blocks apart (no touching twin trees), while
      // remaining a pure function of world position so chunk borders agree.
      // widened margin (-8..+23) so wider big-tree branches from neighbouring cells reach into this chunk
      const minX = cx * 16 - 8, maxX = cx * 16 + 23, minZ = cz * 16 - 8, maxZ = cz * 16 + 23;
});
