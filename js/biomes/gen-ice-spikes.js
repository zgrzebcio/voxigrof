'use strict';
/* biomes/gen-ice-spikes.js: the Ice Spikes biome's spikes, and icebergs in the snow's seas.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* ---- ice spikes (biomeRev 9) ----
         Pillars of packed ice standing out of the Ice Spikes biome, about one in fifteen of them huge, and small icebergs in
         the open sea of the snow. A spike is a pure function of its grid cell, so every chunk it reaches draws its own part
         of it and it crosses chunk borders whole, as the trees do. Each is a stack of discs narrowing to a point; a land
         one is sunk in the ground with its foot filled down to the slope, an iceberg runs from the bed as a column to the
         waterline and tapers above it. */
      if (SPIKES && !FLAT) {
        const SR = 7, SG = 6;                                  // the widest foot (from the centre), one candidate per SG x SG cell
        const x0 = cx * 16, z0 = cz * 16;
        for (let gcz = Math.floor((z0 - SR) / SG); gcz <= Math.floor((z0 + 15 + SR) / SG); gcz++)
          for (let gcx = Math.floor((x0 - SR) / SG); gcx <= Math.floor((x0 + 15 + SR) / SG); gcx++) {
            const r = hash2(gcx * 7 + 401, gcz * 11 - 977);
            const wx = gcx * SG + (((r * 4999) | 0) % SG), wz = gcz * SG + (((r * 6007) | 0) % SG);
            if (wx < x0 - SR || wx > x0 + 15 + SR || wz < z0 - SR || wz > z0 + 15 + SR) continue;
            const ti = terrainInfo(wx, wz);
            if (ti.fSnow <= 0.5) continue;
            const r2 = hash2(gcx * 13 + 7, gcz * 17 + 3), r3 = hash2(gcx * 19 - 5, gcz * 23 + 11);
            let base, top, from, rad, land = false;
            if (ti.h >= WATER_LEVEL && ti.h <= 132 && iceSpikesAt(wx, wz)) {
              if (r > 0.45) continue;                          // a spike in a little under half the cells
              land = true;
              const huge = r2 < 0.07;
              rad = huge ? 2.6 + r3 * 1.4 : 0.9 + r3 * 1.3;
              base = from = ti.h - 2;                          // its foot set in the ground
              top = ti.h + (huge ? 22 + ((r3 * 23) | 0) : 4 + ((r2 * 11) | 0));
            } else if (ti.h < WATER_LEVEL - 2 && !(ti.rT > 0.3 || ti.lk > 0.3)) {
              if (r > 0.035) continue;                         // the sea: an iceberg now and then
              const big = BIG_BERGS && r2 < 0.3;               // about a third of them big, and high
              rad = big ? 3.2 + r3 * 2.4 : 1.4 + r3 * 2.2;
              base = ti.h; from = WATER_LEVEL;                 // a column from the bed, tapering above the water
              top = WATER_LEVEL + (big ? 10 + ((r2 / 0.3 * 15) | 0) : 3 + ((r2 * 8) | 0));
            } else continue;
            top = Math.min(CY - 2, top);
            for (let y = base; y <= top; y++) {
              const t = y <= from ? 0 : (y - from) / Math.max(1, top - from);
              const rr = Math.max(0.3, rad * Math.pow(1 - t, 0.9));
              const ri = Math.ceil(rr);
              for (let dz = -ri; dz <= ri; dz++)
                for (let dx = -ri; dx <= ri; dx++) {
                  if (dx * dx + dz * dz > rr * rr + 0.3) continue;
                  const lx = wx + dx - x0, lz = wz + dz - z0;
                  if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                  data[idx(lx, y, lz)] = B.PACKED_ICE;
                  // the foot of a land spike reaches down to the ground on a slope, so no disc floats
                  if (land && y === base) {
                    for (let d = 1; d <= 6 && y - d > 1; d++) {
                      const below = data[idx(lx, y - d, lz)];
                      if (below !== 0 && solidVal(below)) break;
                      data[idx(lx, y - d, lz)] = B.PACKED_ICE;
                    }
                  }
                }
            }
          }
      }
});
