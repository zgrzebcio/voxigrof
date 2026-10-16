'use strict';
/* worldgen/canyons.js: canyons, rare winding ravines cut into the land.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* ---- canyons: rare winding ravines. A low-freq region mask gates them (deserts get a
         much higher chance); inside a region, a ridge line |noise|≈0 cuts a V-shaped gorge up
         to ~32 deep. Normal-biome canyons are 50/50 filled with water (per 128-block cell);
         desert canyons are always dry. Runs after decoration so the cut clears trees/plants.
         Skipped in flat worlds — a 32-deep gorge would punch clean through the slab. */
      if (!FLAT)
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          if (h <= WATER_LEVEL || h > 141 || HIWET) continue;   // skip oceans and high peaks; no cut by water up in the land
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const isDesert = DES[gi] === 1;
          const rg = fbm(wx * 0.0015 + 555, wz * 0.0015 - 333, 2);
          if (rg < (isDesert ? 0.10 : 0.30)) continue;           // region gate (deserts: far more)
          // canyon TYPE per 128-block region: 0 = crack (thin earth-crack, rare),
          // 1 = wide canyon (5-10+ across, flatter floor), 2 = long canyon (stretched along one axis)
          const rcx = Math.floor(wx / 128), rcz = Math.floor(wz / 128);
          const tr = hash2(rcx * 3 + 41, rcz * 5 - 17);
          const type = tr < 0.18 ? 0 : tr < 0.62 ? 1 : 2;
          let cn, lw, dMax;
          if (type === 0)      { cn = fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2); lw = 0.03; dMax = 30; }
          else if (type === 1) { cn = fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2); lw = 0.12; dMax = 36; }
          else {                                                 // long: anisotropic noise stretches the line
            const flip = hash2(rcx * 7 + 3, rcz * 9 - 5) < 0.5;
            cn = flip ? fbm(wx * 0.0035 + 911, wz * 0.011 - 477, 2)
                      : fbm(wx * 0.011 + 911, wz * 0.0035 - 477, 2);
            lw = 0.07; dMax = 32;
          }
          if (Math.abs(cn) > lw) continue;                       // not on this region's canyon line
          const prof = 1 - Math.abs(cn) / lw;                    // 1 at centre -> 0 at rim
          // wide: flatter floor; none in the Coldest Deep Snow, fading out over its edge (its ice stands on whole ground)
          const depth = Math.floor(Math.pow(prof, type === 1 ? 1.4 : 2) * dMax * (1 - RIMF[gi]));
          if (depth < 4) continue;
          const floorY = Math.max(22, h - depth);
          const watered = !isDesert &&
            hash2(Math.floor(wx / 128) * 7 + 13, Math.floor(wz / 128) * 11 - 7) < 0.2;
          const wFill = 90;                                      // water surface inside wet canyons
          for (let y = Math.min(h + 8, CY - 1); y >= floorY; y--) { // +8 clears trunks/leaves above the cut
            const i = idx(x, y, z);
            if ((data[i] & 255) === B.BEDROCK) break;
            data[i] = (watered && y <= wFill) ? B.WATER : B.AIR;
          }
        }
});
