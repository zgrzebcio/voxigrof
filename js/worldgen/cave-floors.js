'use strict';
/* worldgen/cave-floors.js: what lies on cave floors and in shade. Patches of dirt, and the mushrooms by kind.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* ---- dirt in caves: patches of it on cave floors, a block deep, where a 3D noise says so (some 10-block
         blobs, a pure function of world position, so chunk borders agree). Mushrooms grow on it as on stone, and the
         yellow berry bush grows only on it down there. ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const top = Math.min(H[(x + 2) + (z + 2) * 20] - 6, 94), wx = cx * 16 + x, wz = cz * 16 + z;
          for (let y = 4; y < top; y++) {
            if ((data[idx(x, y, z)] & 255) !== B.STONE || (data[idx(x, y + 1, z)] & 255) !== B.AIR) continue;
            if (fbm3(wx * 0.09 + 911, y * 0.12 - 37, wz * 0.09 - 411, 2) < CAVE_DIRT_AT) continue;
            data[idx(x, y, z)] = B.DIRT;
            if ((data[idx(x, y - 1, z)] & 255) === B.STONE) data[idx(x, y - 1, z)] = B.DIRT;
          }
        }

      /* ---- red mushrooms: cave floors + shadowed ground under leaves ---- */
      // where a brown mushroom grows, a black, a white or a yellow one may instead, a quarter each
      const brownish = (r) => r < 0.25 ? B.BROWN_MUSHROOM : r < 0.5 ? B.BLACK_MUSHROOM : r < 0.75 ? B.WHITE_TALL_MUSHROOM : B.YELLOW_MUSHROOM;
      // is there lava within 3 blocks across and 1 up or down? (the lava mushroom's ground)
      const lavaNear = (x, y, z) => {
        for (let dy = -1; dy <= 1; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const lx = x + dx, lz = z + dz, ly = y + dy;
          if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && ly > 0 && (data[idx(lx, ly, lz)] & 255) === B.LAVA) return true;
        }
        return false;
      };
      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          // cave floors: stone floor with air directly above, below surface crust
          const caveTop = Math.min(h - 4, 94);
          for (let y = 3; y < caveTop; y++) {
            const floor = data[idx(x, y, z)] & 255, cave = (floor === B.STONE || floor === B.DIRT) && (data[idx(x, y + 1, z)] & 255) === B.AIR;   // dirt 0.8271
            if (cave && hash3(cx * 1171 + x, y + 3000, cz * 937 + z) < (SHROOMS2 ? 0.00065 : 0.0005))   // halved in 0.799 (was 0.002), again 0.819; 30% more in rev 20
              data[idx(x, y + 1, z)] = hash3(cx * 1171 + x, y + 4000, cz * 937 + z) < 1 / 3
                ? B.RED_MUSHROOM : hash3(cx * 1171 + x, y + 4000, cz * 937 + z) < 2 / 3
                ? brownish(hash3(cx * 1181 + x, y + 4100, cz * 941 + z)) : B.BLUE_MUSHROOM;   // thirds since 0.7691
            // a lava mushroom on cave floor near lava
            else if (cave && hash3(cx * 1187 + x, y + 3100, cz * 947 + z) < 0.015 && lavaNear(x, y, z))   // halved 0.819
              data[idx(x, y + 1, z)] = B.LAVA_MUSHROOM;
            // a yellow berry bush, in any stage, on the cave's dirt (rarely on any floor in 0.827): it glows as it ripens
            else if (cave && floor === B.DIRT && hash3(cx * 1193 + x, y + 3200, cz * 953 + z) < CAVE_YELLOW_BUSH)
              data[idx(x, y + 1, z)] = B.YELLOWBERRY_BUSH | (wildBerryStage(hash3(cx * 1197 + x, y + 3300, cz * 959 + z)) << 8);   // ripe 20% more often
          }
          // surface under leaves: air at h+1 with leaves within 2..5 blocks above
          if (h > WATER_LEVEL && h < 120) {
            const topBk = data[idx(x, h, z)] & 255;
            if (SHROOMS2 && (topBk === B.GRASS || topBk === B.DIRT) && (data[idx(x, h + 1, z)] & 255) === B.AIR) {
              /* rev 20: under ANY tree and 30% more of them: brown and black under every kind, and the tree's
                 own, red under birch, blue under spruce, yellow under oak; white out in the open beside trees (a
                 clearing, a meadow by a wood), and very rarely on the plains' flat by a tree */
              let leaf = 0;
              for (let dy = 2; dy <= 6 && h + dy < CY; dy++) {
                const b = data[idx(x, h + dy, z)] & 255;
                if (b === B.LEAVES || b === B.BIRCH_LEAVES || b === B.SPRUCE_LEAVES) { leaf = b; break; }
              }
              const r0 = hash3(cx * 1279 + x, h + 5000, cz * 1031 + z);
              if (leaf && r0 < 0.000175 * 1.3) {
                const k = hash3(cx * 1279 + x, h + 6000, cz * 1031 + z);
                data[idx(x, h + 1, z)] = k < 0.3 ? B.BROWN_MUSHROOM : k < 0.6 ? B.BLACK_MUSHROOM
                  : leaf === B.BIRCH_LEAVES ? B.RED_MUSHROOM : leaf === B.SPRUCE_LEAVES ? B.BLUE_MUSHROOM : B.YELLOW_MUSHROOM;
              } else if (!leaf && topBk === B.GRASS && r0 < (TREE[gi] >= 0.5 ? 0.00022 : 0.00003)) {
                // a tree's wood within 4 (this chunk's), and on the plains a flat spot
                let wood = false;
                for (let dz = -4; dz <= 4 && !wood; dz++)
                  for (let dx = -4; dx <= 4 && !wood; dx++) {
                    const lx = x + dx, lz = z + dz;
                    if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                    for (let dy = 1; dy <= 3; dy++) {
                      const b = data[idx(lx, h + dy, lz)] & 255;
                      if (b === B.LOG || b === B.BIRCH_LOG || b === B.SPRUCE_LOG) { wood = true; break; }
                    }
                  }
                const flatHere = TREE[gi] >= 0.5 || (H[gi - 1] === h && H[gi + 1] === h && H[gi - 20] === h && H[gi + 20] === h);
                if (wood && flatHere) data[idx(x, h + 1, z)] = B.WHITE_TALL_MUSHROOM;
              }
            } else if ((topBk === B.GRASS || topBk === B.DIRT) &&
                (data[idx(x, h + 1, z)] & 255) === B.AIR) {
              let hasLeaves = false;
              for (let dy = 2; dy <= 5 && h + dy < CY; dy++) {
                if ((data[idx(x, h + dy, z)] & 255) === B.LEAVES) { hasLeaves = true; break; }
              }
              if (hasLeaves && hash3(cx * 1279 + x, h + 5000, cz * 1031 + z) < 0.000175)   // halved in 0.799, again 0.819
                data[idx(x, h + 1, z)] = hash3(cx * 1279 + x, h + 6000, cz * 1031 + z) < 1 / 3
                  ? B.RED_MUSHROOM : hash3(cx * 1279 + x, h + 6000, cz * 1031 + z) < 2 / 3
                  ? brownish(hash3(cx * 1289 + x, h + 6100, cz * 1039 + z)) : B.BLUE_MUSHROOM;   // thirds since 0.7691
            }
          }
        }
      }
});
