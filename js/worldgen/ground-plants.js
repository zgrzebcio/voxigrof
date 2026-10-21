'use strict';
/* worldgen/ground-plants.js: small things on open ground. Fiber tufts, gourds by climate level, salt crust on
   beaches, wild wheat, flint and stone pebbles, grass and flowers, the desert's dry plants, cane at an oasis.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* ---- fiber blocks: very rarely an open-plains grass block is a tuft of packed fiber
         instead. Same plains test the melons below use: low tree density, no desert, no snow. ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h <= WATER_LEVEL + 1 || h > 146 || DES[gi] || SNO[gi] || TREE[gi] >= 0.5) continue;
          if ((data[idx(x, h, z)] & 255) !== B.GRASS) continue;
          if (hash3(cx * 1709 + x, 9100, cz * 1523 + z) < 0.00002) data[idx(x, h, z)] = B.FIBER_BLOCK;   // 0.0006 before 0.791, 0.0002 before 0.8096
        }

      /* ---- gourds: each on its own climate level (LVL, CLIMATE_LADDER in biomes/biomes.js), in a small patch on grass.
         Pumpkins in the cold (-1: cold plains, spruce forest) 2-6, watermelons in the warm plains (1) 2-4, cantaloupes in
         the mild land (0) 1-2 and very rare. Two tries a chunk; `ch` is a try's chance [open plains, forest]. ---- */
      const gourdPatch = (salt, block, lvl, ch, nMin, nMax, radius) => {
        for (let ai = 0; ai < 2; ai++) {
          const mx = (hash3(cx * 47 + salt + ai,     19, cz * 43 + salt + ai) * 16) | 0;
          const mz = (hash3(cx * 53 + salt + ai * 3, 23, cz * 59 + salt + ai) * 16) | 0;
          const gi = (mx + 2) + (mz + 2) * 20, h = H[gi];
          if (h <= WATER_LEVEL + 1 || h > 146 || DES[gi] || SNO[gi] || Math.round(LVL[gi]) !== lvl) continue;
          if (hash3(cx * 71 + salt + ai, 77, cz * 67 + salt + ai) >= ch[TREE[gi] < 0.5 ? 0 : 1]) continue;
          const want = nMin + ((hash3(cx + salt + ai, 81, cz + salt + ai) * (nMax - nMin + 1)) | 0);
          // up to four tries a gourd, so a patch nearly always reaches its count
          for (let k = 0, got = 0; k < want * 4 && got < want; k++) {
            const lx = mx + (((hash3(cx * 31 + ai + k * 7 + salt,  89, cz * 29 + ai + k * 5) * (radius * 2 + 1)) | 0) - radius);
            const lz = mz + (((hash3(cx * 37 + ai + k * 11 + salt, 97, cz * 41 + ai + k * 3) * (radius * 2 + 1)) | 0) - radius);
            if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
            const lh = H[(lx + 2) + (lz + 2) * 20];
            if (lh <= WATER_LEVEL + 1 || lh > 146) continue;
            if ((data[idx(lx, lh, lz)] & 255) !== B.GRASS || (data[idx(lx, lh + 1, lz)] & 255) !== B.AIR) continue;
            data[idx(lx, lh + 1, lz)] = block;
            got++;
          }
        }
      };
      // a fifth more of each since 0.835491
      gourdPatch(2200, B.PUMPKIN,    -1, [0.0144, 0.0072], 2, 6, 3);
      gourdPatch(1100, B.MELON,       1, [0.0144, 0.0072], 2, 4, 2);
      gourdPatch(3300, B.CANTALOUPE,  0, [0.0036, 0.0012], 1, 2, 2);

      /* ---- salt crust: a thin white skin on beach sand at the water's edge, in patches ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h < WATER_LEVEL || h > WATER_LEVEL + 1) continue;                     // the beach line, just above the water
          if ((data[idx(x, h, z)] & 255) !== B.SAND || (data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          if (!(H[gi - 1] < WATER_LEVEL || H[gi + 1] < WATER_LEVEL || H[gi - 20] < WATER_LEVEL || H[gi + 20] < WATER_LEVEL)) continue;
          const wx = cx * 16 + x, wz = cz * 16 + z;
          if (fbm(wx * 0.06 + 4100, wz * 0.06 - 4100, 2) < 0.1) continue;          // patches, not a ribbon round every shore
          // a quarter more beside the sea than a lake or a river: WW 1 is ocean
          const wi = (x + WM) + (z + WM) * WG;
          const sea = WW[wi + 1] === 1 || WW[wi - 1] === 1 || WW[wi + WG] === 1 || WW[wi - WG] === 1;
          if (hash3(cx * 1319 + x, h + 8100, cz * 1321 + z) < 0.0275 * (sea ? 1.25 : 1)) data[idx(x, h + 1, z)] = layerVal(B.SALT_CRUST, 1, false);   // one layer; a quarter of 0.11 since 0.8193
        }

      /* ---- wild wheat: patches of 4-7 on mild, flat land (level 0 open plains), mostly in the flowery meadows
         (the same mask the surface plants use below) and a little rarer on the rest of the plains. ---- */
      for (let ai = 0; ai < 2; ai++) {
        const mx = (hash3(cx * 61 + 4400 + ai,     29, cz * 67 + 4400 + ai) * 16) | 0;
        const mz = (hash3(cx * 71 + 4400 + ai * 3, 31, cz * 73 + 4400 + ai) * 16) | 0;
        const gi = (mx + 2) + (mz + 2) * 20, h = H[gi];
        /* rev 32 (SAV3): by the climate. The warm plains (level 1, not the Dryland or the Savanna) are wheat country, a patch
           in most chunks and bigger (6-11); the cold plains (level -1) have the odd small one; level 0 as before */
        const lv = Math.round(LVL[gi]), warmW = SAV3 && lv === 1 && DRYF[gi] < 0.5 && !SAV[gi], coldW = SAV3 && lv === -1;
        if (h < 100 || h > CY - 2 || DES[gi] || SNO[gi] || TREE[gi] >= 0.5 || (lv !== 0 && !warmW && !coldW)) continue;
        const meadow = fbm((cx * 16 + mx) * 0.006 + 6006, (cz * 16 + mz) * 0.006 - 3003, 2) > 0.32;
        const chance = warmW ? (meadow ? 0.6 : 0.35) : coldW ? 0.02 : (meadow ? 0.144 : 0.0288);   // level 0: twice as many patches since 0.826, a fifth more since 0.835491
        if (hash3(cx * 79 + 4400 + ai, 61, cz * 83 + 4400 + ai) >= chance) continue;
        const want = warmW ? 6 + ((hash3(cx + 4400 + ai, 67, cz + 4400 + ai) * 6) | 0) : 4 + ((hash3(cx + 4400 + ai, 67, cz + 4400 + ai) * 4) | 0);
        for (let k = 0, got = 0; k < want * 4 && got < want; k++) {
          const lx = mx + (((hash3(cx * 43 + ai + k * 7 + 4400,  71, cz * 47 + ai + k * 5) * 5) | 0) - 2);
          const lz = mz + (((hash3(cx * 53 + ai + k * 11 + 4400, 73, cz * 59 + ai + k * 3) * 5) | 0) - 2);
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
          const lh = H[(lx + 2) + (lz + 2) * 20];
          if (lh < 100 || lh > CY - 2) continue;
          if ((data[idx(lx, lh, lz)] & 255) !== B.GRASS || (data[idx(lx, lh + 1, lz)] & 255) !== B.AIR) continue;
          // in any stage (always ripe before): variant 0 ripe, 1..6 growing (updateWheatGrow, seasons/growth.js; 1..7 until 0.8273)
          data[idx(lx, lh + 1, lz)] = B.WHEAT | ((((hash3(cx * 37 + lx + 4500, lh, cz * 41 + lz + 4500) * 7) | 0) % 7) << 8);
          got++;
        }
      }

      /* ---- flint stones: dark nodules lying loose on the turf, 0.05% of grass columns.
         Runs BEFORE the plant scatter on purpose — the plants all require air above them, so
         claiming the cell first is what stops a 22% grass roll from swallowing a 0.05% one.
         Grass-only, which already rules out desert and beach; SNO rules out the snow biome. ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 99 || h > CY - 2 || SNO[gi]) continue;
          if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          if (hash3(cx * 73 + lx + 8100, 43, cz * 67 + lz + 8100) >= 0.002) continue;    // 0.2%
          data[idx(lx, h + 1, lz)] = B.FLINT_ROCK;
        }
      /* ---- stone pebbles: commoner than flint, on turf, dirt, stone and gravel, so a mountain
         walk turns them up as readily as a meadow. Five make a stone block, the first stone you can keep. ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 99 || h > CY - 2 || SNO[gi]) continue;
          const top = data[idx(lx, h, lz)] & 255;
          if (top !== B.GRASS && top !== B.DIRT && top !== B.STONE && top !== B.GRAVEL) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          if (hash3(cx * 79 + lx + 8300, 47, cz * 71 + lz + 8300) >= 0.004) continue;    // 0.4%
          data[idx(lx, h + 1, lz)] = B.STONE_PEBBLE;
        }

      /* ---- surface plants: short grass (small amount over all forest/plains, none in
         desert/snow) + poppy / blue orchid flowers (denser in plains/meadows) ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 99 || h > CY - 2 || DES[gi] || SNO[gi]) continue;                       // y100..200; none in desert/snow
          if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          const isPlains = TREE[gi] < 0.5;
          // meadow = flower-rich sub-region of plains (own low-freq mask)
          const wx = cx * 16 + lx, wz = cz * 16 + lz;
          const meadow = isPlains && fbm(wx * 0.006 + 6006, wz * 0.006 - 3003, 2) > 0.32;
          const r = hash3(cx * 97 + lx + 5500, 71, cz * 83 + lz + 5500);
          // flowers cut ~95%: forest tiny, plains small, meadows the main place they gather
          let flowerCh = (meadow ? 0.02 : isPlains ? 0.0015 : 0.0003) * 0.15;    // 70% fewer flowers, half again
          // short grass thins with altitude (full at y100, ~1/4 at y200) but never disappears
          const alt = Math.min(1, Math.max(0, (h - 100) / 100));
          let grassCh  = 0.22 * (1 - alt * 0.75);
          // two-block tall grass: a slice of the short-grass budget, plains-heavier, needs 2 air
          let tallCh   = (isPlains ? 0.05 : 0.015) * (1 - alt * 0.75);
          /* Berry bushes are scattered thinly and land in a RANDOM growth stage, so a fresh world
             already has some ripe and some bare — the regrow timer takes over from there. */
          let berryCh = (isPlains ? 0 : 0.0045) * (1 - alt * 0.75);               // forests only since 0.8233; 25% more 0.826 (0.003), 20% more 0.8272
          // the Dryland: half the green grass and no flowers or berries; its dry plants come in the pass below
          // ...a quarter since 0.8442 (half before): half the grass of every kind in the Dryland and the desert
          if (DRYF[gi] > 0.5) { grassCh *= 0.25; tallCh *= 0.25; flowerCh = 0; berryCh = 0; }
          // the Savanna: grass everywhere, much of it tall; no flowers or berries
          if (SAV[gi]) { grassCh = 0.3 * (1 - alt * 0.75); tallCh = SAV_TALL * (1 - alt * 0.75); flowerCh = 0; berryCh = 0; }
          if (r < flowerCh) {
            data[idx(lx, h + 1, lz)] = hash3(cx * 31 + lx + 12, 19, cz * 29 + lz + 7) < 0.5 ? B.POPPY : B.ORCHID;
          } else if (r < flowerCh + berryCh) {
            /* Stage and KIND are rolled from two independent hashes, so a fresh world already has
               sprouts, bare bushes and ripe ones of both bushes — the regrow timer takes over from
               there. The stage numbers are the growth order, so the roll is just 0..3. */
            const stage = wildBerryStage(hash3(cx * 41 + lx + 909, 37, cz * 43 + lz + 606));   // ripe 20% more often
            /* Which bush, by what the place is like (red 40%, blue 40%, black 20% anywhere before): white in
               a birch wood, black in a spruce one, blue by water, red the higher up, yellow now and then in a deep
               (dark) forest. Each is a weight, so a mixed place grows a mix. */
            const ti = terrainInfo(wx, wz);
            let wet = false;
            for (let dz = -3; dz <= 3 && !wet; dz++) for (let dx = -3; dx <= 3; dx++) if (WW[(lx + WM + dx) + (lz + WM + dz) * WG]) { wet = true; break; }
            const high = Math.min(1, Math.max(0, (h - 120) / 40));
            const W = [[B.REDBERRY_BUSH, 0.3 + 2 * high], [B.BLUEBERRY_BUSH, wet ? 3 : 0.08],
                       [B.BLACKBERRY_BUSH, TAIGA[gi] || ti.fTaiga > 0.5 ? 3 : 0.12],
                       [B.YELLOWBERRY_BUSH, ti.deepF > 0.5 ? 0.5 : 0.02], [B.WHITEBERRY_BUSH, birchAt(wx, wz) ? 3 : 0.1]];
            let roll = hash3(cx * 53 + lx + 4242, 29, cz * 59 + lz + 2424) * W.reduce((a, w) => a + w[1], 0), bush = B.REDBERRY_BUSH;
            for (const [b, w] of W) { roll -= w; if (roll <= 0) { bush = b; break; } }
            data[idx(lx, h + 1, lz)] = bush | (stage << 8);
          } else if (r < flowerCh + berryCh + tallCh && h + 2 < CY && (data[idx(lx, h + 2, lz)] & 255) === B.AIR) {
            data[idx(lx, h + 1, lz)] = B.TALL_LOWER;
            data[idx(lx, h + 2, lz)] = B.TALL_UPPER;
          } else if (r < flowerCh + berryCh + tallCh + grassCh) {
            // rev 29: half of it the short grass, by its own roll
            data[idx(lx, h + 1, lz)] = SHORTGRASS && hash3(cx * 61 + lx + 7700, 83, cz * 67 + lz + 7700) < 0.5 ? B.SHORT_GRASS : B.TALLGRASS;
          }
        }

      /* ---- dry plants (0.84, rev 21): dry grass, tall dry grass and dry bushes. On the desert's open sand a medium amount,
         the grass in stands with bare sand between and never on a dune (the dunes pass below piles sand where its noise
         says, and a plant there would stand in a pit); the Deep Desert has fewer grasses and more bushes. Rare on the warm
         plains' turf, among the green grass. ---- */
      if (DESERT2)
        for (let lz = 0; lz < CZ; lz++)
          for (let lx = 0; lx < CX; lx++) {
            const gi = (lx + 2) + (lz + 2) * 20, h = H[gi];
            if (h <= WATER_LEVEL || h > CY - 3 || h < WLV[gi]) continue;
            if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
            const top = data[idx(lx, h, lz)] & 255, wx = cx * 16 + lx, wz = cz * 16 + lz;
            let gCh, tCh, bCh;
            if (DES[gi] && (top === B.SAND || top === B.RED_SAND)) {
              const dune = fbm(wx * 0.035 + 811.3, wz * 0.035 - 377.9, 2) + (hash2(wx * 13 + 71, wz * 7 - 19) - 0.5) * 0.06;
              if (Math.floor((dune - 0.08) * 16) >= 1) continue;
              const stand = smooth01(fbm(wx * 0.02 + 5151.3, wz * 0.02 - 1717.9, 2), -0.25, 0.35);
              // half the dry grass and tall dry grass since 0.8442 (0.012 / 0.04 and 0.003 / 0.01 before); the bushes as they were
              gCh = (DDS[gi] ? 0.006 : 0.02) * stand; tCh = (DDS[gi] ? 0.0015 : 0.005) * stand; bCh = DDS[gi] ? 0.008 : 0.005;
            } else if ((top === B.GRASS || top === B.DIRT) && DRYF[gi] > 0.5) {
              // the Dryland: a lot of them, about twice the green grass left beside them; half of it since 0.8442 (0.26, 0.06)
              gCh = 0.13; tCh = 0.03; bCh = 0.014;
            } else if ((top === B.GRASS || top === B.DIRT) && SAV[gi]) {
              gCh = 0.02; tCh = SAV_DRY_TALL; bCh = 0.004;        // the Savanna: a few, among its green grass
            } else if (top === B.GRASS && !DES[gi] && !SNO[gi] && !OAS[gi] && TREE[gi] < 0.5 && Math.round(LVL[gi]) === 1) {
              gCh = 0.006; tCh = 0.0015; bCh = 0.0008;
            } else continue;
            const r = hash3(cx * 89 + lx + 6100, 53, cz * 97 + lz + 6100);
            if (r < bCh) data[idx(lx, h + 1, lz)] = B.DRY_BUSH;
            else if (r < bCh + tCh && (data[idx(lx, h + 2, lz)] & 255) === B.AIR) {
              data[idx(lx, h + 1, lz)] = B.DRY_TALL_LOWER;
              data[idx(lx, h + 2, lz)] = B.DRY_TALL_UPPER;
            } else if (r < bCh + tCh + gCh) data[idx(lx, h + 1, lz)] = B.DRY_GRASS;
          }
      /* ---- sugar cane by an oasis's water: its lake stands over the sea, so the shore pass below never sees it. In
         stands on about a quarter of its shore, starting at the bank's top block as the sea's cane does. ---- */
      if (DESERT2)
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const gi = (x + 2) + (z + 2) * 20, h = H[gi];
            if (!OAS[gi] || h < WLV[gi] || h > CY - 4) continue;
            const top = data[idx(x, h, z)] & 255;
            if ((top !== B.GRASS && top !== B.SAND && top !== B.RED_SAND) || (data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
            let bank = false;
            for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) if (H[n] < WLV[n] && WLV[n] === h - 1) { bank = true; break; }
            if (!bank) continue;
            const wx = cx * 16 + x, wz = cz * 16 + z;
            if (smooth01(fbm(wx * 0.15 + 3131.7, wz * 0.15 - 1919.3, 2), 0.05, 0.25) * 0.8 < hash3(wx * 7 + 6200, 4545, wz * 5 - 6200)) continue;
            const tall = 1 + Math.floor(hash3(wx, 9393, wz) * 3);
            for (let k = 0; k < tall; k++) data[idx(x, h + k, z)] = B.SUGAR_CANE;
          }
});
