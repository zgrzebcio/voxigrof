'use strict';
/* worldgen/desert-and-shore-plants.js: cactus, sugar cane at the water's edge, wild saplings, and the loose layers of
   sand, gravel and leaves on the ground.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* ---- cactus: sparse 1-wide columns, 1-4 tall, on open desert / red-sand tops.
         Neighbouring terrain must not rise above the base so a fresh cactus never
         touches a block on its sides (matches the placement rule). ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          if (!DES[gi]) continue;
          const wx = cx * 16 + x, wz = cz * 16 + z;
          /* A fifth as many as before 0.8193, and gathered: a slow noise makes stands of cactus with open sand between
             (0.8 of the old chance inside a stand, none outside; about a fifth over the whole desert). */
          const stand = smooth01(fbm(wx * 0.012 + 3333.3, wz * 0.012 - 777.7, 2), 0.1, 0.5);
          const chance = (RED[gi] ? 0.0005 : 0.001) * 0.8 * stand;   // desert 0.1%, red sand 0.05% at the most
          if (hash3(wx, 7777, wz) >= chance) continue;
          const h = H[gi];
          const top = data[idx(x, h, z)] & 255;
          if (top !== B.SAND && top !== B.RED_SAND) continue;
          if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          if (heightAt(wx + 1, wz) > h || heightAt(wx - 1, wz) > h ||
              heightAt(wx, wz + 1) > h || heightAt(wx, wz - 1) > h) continue;
          /* Saguaro: a tapering column with 0-2 arms. An arm is one horizontal cactus cell out
             from the trunk followed by a short vertical run, so it flares into the trunk exactly
             the way a tree branch does and reads as a raised hand. Arms are placed with the same
             cell writes as the trunk — the log mesher does the rest. */
          const cw = (w) => (w << 2);                          // variant bits 2-7 = width index
          const CAC_BASE = 26, CAC_TIP = 20;                   // 60 -> 48 units
          const n = 3 + ((hash3(wx, 8888, wz) * 4) | 0);       // 3..6 tall
          const putCac = (cx2, cy2, cz2, axis, w) => {
            if (cx2 < 0 || cx2 > 15 || cz2 < 0 || cz2 > 15 || cy2 < 2 || cy2 > CY - 2) return;
            const i2 = idx(cx2, cy2, cz2);
            if ((data[i2] & 255) !== B.AIR) return;
            data[i2] = B.CACTUS | ((axis | cw(w)) << 8);
          };
          for (let k = 1; k <= n && h + k < CY - 1; k++) {
            const t = (k - 1) / Math.max(1, n - 1);
            putCac(x, h + k, z, 0, Math.round(CAC_BASE - (CAC_BASE - CAC_TIP) * t));
          }
          /* Arms leave the trunk high up — near the crown, and often above it once their vertical
             run is added, which is what gives a saguaro its raised-hands silhouette. Branching
             from halfway down made them read as a shrub. */
          const FLOWER_CHANCE = 0.05;
          const capFlower = (fx, fy, fz, salt) => {
            if (fy >= CY - 1 || (data[idx(fx, fy, fz)] & 255) !== B.AIR) return;
            if (fx < 0 || fx > 15 || fz < 0 || fz > 15) return;
            if (hash3(wx + salt, 3141 + salt, wz - salt) >= FLOWER_CHANCE) return;
            data[idx(fx, fy, fz)] = B.PINCUSHION;
          };
          const armCount = (hash3(wx + 5, 9999, wz + 5) * 2.4) | 0;    // 0..2
          const ARM_DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (let a = 0; a < armCount && n >= 4; a++) {
            const d = ARM_DIR[(hash3(wx + a * 7, 1234 + a, wz - a * 11) * 4) | 0];
            /* The elbow must sit BESIDE trunk, never level with the crown or above it — an arm
               that starts at the top reads as a second cactus balanced on the first rather than
               a limb. Clamping it one cell below the crown keeps it flanked by trunk; the 1-2
               cell vertical run afterwards is what raises the hand to crown height and past it. */
            const lo = h + Math.max(2, n - 3);
            const ay = Math.min(h + n - 1, lo + ((hash3(wx - a * 3, 4321 + a, wz + a * 13) * 3) | 0));
            const armAxis = d[0] ? 1 : 2;
            const ax2 = x + d[0], az2 = z + d[1];
            putCac(ax2, ay, az2, armAxis, 18);                         // 44 units, thinner than trunk
            const up = 1 + ((hash3(wx + a * 17, 555 + a, wz + a * 19) * 2) | 0);   // rises 1..2
            for (let u = 1; u <= up; u++) putCac(ax2, ay + u, az2, 0, 18);
            capFlower(ax2, ay + up + 1, az2, 17 + a * 31);             // flower on the raised hand
          }
          capFlower(x, h + n + 1, z, 3);                               // ...and on the trunk's crown
        }

      /* ---- sugar cane: ground column must be exactly one block above water level so the sand
         base sits at the shoreline and a side neighbour is water. Cane base ends up at y=h+1
         with water at y=WATER_LEVEL directly beside the sand base — the classic beach look.
         only on warm and hot shores (climate level 1 and up, or a desert), about a third more of it, and in
         stands: a shore cell grows cane when it is a stand's seed, or mostly when a cell beside it is. The seeds are
         pure hashes of place, so a stand across a chunk border still agrees. ---- */
      const caneSeed = (wx, wz, s) => hash3(wx * 11 + 3301, 4242, wz * 13 + 5501) < s;
      for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
        const gi = (x + 2) + (z + 2) * 20;
        const h = H[gi];
        if (h !== WATER_LEVEL + 1) continue;                            // must be exactly at shore
        if (!DES[gi] && LVL[gi] < 0.5) continue;                        // warm or hot land only
        const top = data[idx(x, h, z)] & 255;
        if (top !== B.SAND && top !== B.GRASS && top !== B.DIRT && top !== B.RED_SAND && top !== B.PINK_SAND
            && top !== B.GRAVEL) continue;   // pink 0.822; gravel 0.8356 (the gravel beaches)
        if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
        // water adjacent at exactly y = WATER_LEVEL (shoreline)
        let waterAdj = false;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
          if ((data[idx(nx, WATER_LEVEL, nz)] & 255) === B.WATER) { waterAdj = true; break; }
        }
        if (!waterAdj) continue;
        const isBeach = (top === B.SAND || top === B.RED_SAND || top === B.PINK_SAND || top === B.GRAVEL);
        /* The old chance per cell (beach 0.85%, bank 0.25%) x 1.3, spread over a seed and about 5.6 more cells round it
           (8 neighbours x 70%), so the seed chance is that over 6.6. A fifth more since 0.8356 (x 1.2). */
        // rev 44: CANE_HOT_MUL times as often by the Jungle, a desert or the Savanna (this column or one within 2 of it)
        let hot = false;
        if (REV44)
          for (let dz = -2; dz <= 2 && !hot; dz++)
            for (let dx = -2; dx <= 2; dx++) {
              const g = gi + dx + dz * 20;
              if (JNG[g] || DES[g] || RED[g] || SAV[g]) { hot = true; break; }
            }
        const s = (isBeach ? 0.85 : 0.25) * 0.01 * 1.3 * 1.2 / 6.6 * (hot ? CANE_HOT_MUL : 1);
        const wx = cx * 16 + x, wz = cz * 16 + z;
        let grow = caneSeed(wx, wz, s);
        if (!grow && hash3(wx * 7 + 919, 4343, wz * 5 - 717) < 0.7)
          for (let dz = -1; dz <= 1 && !grow; dz++)
            for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && caneSeed(wx + dx, wz + dz, s)) { grow = true; break; }
        if (!grow) continue;
        const tall = 1 + Math.floor(hash3(wx, 9191, wz) * 3);           // 1..3
        // Start cane at h (replacing the top sand) so the base cell sits at water-surface elevation
        // and the plant reads as growing from the shoreline instead of on a raised ledge.
        for (let k = 0; k < tall && h + k < CY - 1; k++) data[idx(x, h + k, z)] = B.SUGAR_CANE;
      }

      /* ---- seashells: now and then one on a sea beach's sand, within SHELL_REACH of the sea (the wet grid's ocean,
         WW 1: never by a river or a lake), none on a snowy shore. Picked up by hand (player/foraging.js). ---- */
      (() => {   // own function: see SPEED in worldgen/gen-chunk.js
        const SHELL_CHANCE = 0.02, SHELL_REACH = 5;
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h < WATER_LEVEL || h > WATER_LEVEL + 3 || SNO[gi]) continue;
          const wx = cx * 16 + x, wz = cz * 16 + z;
          if (hash3(wx * 17 + 6101, 6262, wz * 19 - 6303) >= SHELL_CHANCE) continue;
          const top = data[idx(x, h, z)] & 255;
          if (top !== B.SAND && top !== B.PINK_SAND && top !== B.RED_SAND) continue;
          if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          let sea = false;
          for (let dz = -SHELL_REACH; dz <= SHELL_REACH && !sea; dz++)
            for (let dx = -SHELL_REACH; dx <= SHELL_REACH; dx++)
              if (WW[(x + WM + dx) + (z + WM + dz) * WG] === 1) { sea = true; break; }
          if (sea) data[idx(x, h + 1, z)] = B.SEASHELL;
        }
      })();

      /* ---- clams (rev 38): on the floor of a warm sea (the wet grid's ocean, warm past a fifth), CLAM_TOP and under, in beds
         a slow noise draws. Each stands in the water (WATERLOGGED), turned any way; a fifth hold sand, where a pearl may grow,
         and one in a thousand a pearl already (blocks/clam.js). Rev 39: CLAM_APART between any two; a place the hashes pick
         (clamSlot) keeps its clam only if no other place they pick within that is ranked higher (clamRank). Both are hashes and
         noise of the place alone, so a chunk and its neighbour agree. ---- */
      if (REV38) (() => {   // own function: see SPEED in worldgen/gen-chunk.js
        const { HAS_SHIFT, SAND, PEARL } = CLAM_BITS;
        const clamSlot = (wx, wz) => {
          const r = hash3(wx * 13 + 7171, 7373, wz * 11 - 7575);
          if (r >= CLAM_CH) return false;
          const bed = smooth01(fbm(wx * CLAM_BED_F + 1919.1, wz * CLAM_BED_F - 2727.3, 2), 0.05, 0.35);
          return r < CLAM_CH * bed;
        };
        const clamRank = (wx, wz) => hash3(wx * 3 + 1231, 4561, wz * 5 - 7891);
        const outranked = (wx, wz) => {
          const me = clamRank(wx, wz), R = CLAM_APART - 1;
          for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++)
            if ((dx || dz) && dx * dx + dz * dz < CLAM_APART * CLAM_APART && clamSlot(wx + dx, wz + dz) && clamRank(wx + dx, wz + dz) > me) return true;
          return false;
        };
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h + 1 > CLAM_TOP || WLV[gi] !== WATER_LEVEL || WARM[gi] <= 0.2 || WW[(x + WM) + (z + WM) * WG] !== 1) continue;
          const wx = cx * 16 + x, wz = cz * 16 + z;
          if (!clamSlot(wx, wz) || (REV39 && outranked(wx, wz))) continue;
          const floor = data[idx(x, h, z)], cell = data[idx(x, h + 1, z)];
          if (!PROPS[floor & 255] || !PROPS[floor & 255].opaque || cell !== B.WATER) continue;   // still water on a whole block
          const r = hash3(wx * 7 - 8181, 8383, wz * 5 + 8585);
          const has = r < 0.001 ? PEARL : r < 0.201 ? SAND : 0;
          const facing = (hash3(wx + 9191, 9393, wz - 9595) * 4) | 0;
          data[idx(x, h + 1, z)] = (B.CLAM | ((facing | (has << HAS_SHIFT)) << 8) | WATERLOGGED) >>> 0;
        }
      })();

      /* ---- saplings: very sparse spawn on grass in tree-rich (forest) zones. Almost all oak;
         birch is a rare drop within an already-rare roll. ---- */
      for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
        const gi = (x + 2) + (z + 2) * 20;
        if (TREE[gi] < 0.35) continue;
        const h = H[gi];
        if (h <= WATER_LEVEL) continue;
        if ((data[idx(x, h, z)] & 255) !== B.GRASS) continue;
        if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
        const wx = cx * 16 + x, wz = cz * 16 + z;
        const r = hash3(wx * 19 + 4401, 8181, wz * 23 + 4501);
        if (r >= 0.00001) continue;                                     // 0.001%
        // pick oak vs birch on a separate hash so a single-value bias can't force birch every time
        const birchRoll = hash3(wx * 29 + 5501, 4747, wz * 31 + 6601);
        data[idx(x, h + 1, z)] = birchRoll < 0.1 ? B.BIRCH_SAPLING : B.OAK_SAPLING;
      }

      /* ---- loose ground layers ----
         Desert dunes: sand, or red sand on red sand, piled 1-7 layers deep in rolling patches with bare
         ground between them. Exposed gravel carries 1-4 loose layers on top, and very rarely a thin
         scatter of gravel (1-2 layers) lies on other open ground. The last pass, so it only ever takes
         cells nothing else wanted. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h <= WATER_LEVEL || h > CY - 3 || (data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          const top = data[idx(x, h, z)] & 255, wx = cx * 16 + x, wz = cz * 16 + z;
          if ((top === B.SAND || top === B.RED_SAND) && DES[gi]) {
            const dune = fbm(wx * 0.035 + 811.3, wz * 0.035 - 377.9, 2) + (hash2(wx * 13 + 71, wz * 7 - 19) - 0.5) * 0.06;
            const n = Math.min(7, Math.floor((dune - 0.08) * 16));
            if (n >= 1) data[idx(x, h + 1, z)] = layerVal(top, n);
          } else if (top === B.GRAVEL) {
            const r = hash3(wx * 31 + 9100, 4101, wz * 37 - 9100);
            // a third as many since 0.799, and 1-2 deep instead of 1-4 (was r < 0.45)
            if (r < 0.15) data[idx(x, h + 1, z)] = layerVal(B.GRAVEL, 1 + ((r / 0.15 * 2) | 0));
          } else if (top === B.GRASS || top === B.DIRT || top === B.STONE) {
            const r = hash3(wx * 41 + 9300, 4303, wz * 43 - 9300);
            if (r < 0.00075) data[idx(x, h + 1, z)] = layerVal(B.GRAVEL, r < 0.00025 ? 2 : 1);   // halved in 0.799
            /* ...and a drift of fallen leaves the same way, of the wood that grows there, only on
               the turf and only under a canopy-ish sky — near trees it reads as litter, not as scenery. */
            else if ((top === B.GRASS || top === B.DIRT) && TREE[gi] >= 0.4) {
              const lr = hash3(wx * 47 + 9500, 4507, wz * 53 - 9500);
              if (lr < 0.006) {
                const leaf = SNO[gi] || TAIGA[gi] ? B.SPRUCE_LEAVES
                           : birchAt(wx, wz) ? B.BIRCH_LEAVES : B.LEAVES;
                data[idx(x, h + 1, z)] = layerVal(leaf, lr < 0.002 ? 2 : 1);
              }
            }
          }
        }
      (() => {   // own function: see SPEED in worldgen/gen-chunk.js
      /* A cobweb must hang ON something: floor, wall or ceiling. Later passes — caves, ravines,
         water — can carve away the rock it was strung from, so every web is checked last and one with no
         solid face under, over or beside it (inside this chunk) is taken down. */
      {
        const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (let i = 0; i < data.length; i++) {
          if ((data[i] & 255) !== B.COBWEB) continue;
          const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
          let held = false;
          for (const [dx, dy, dz] of NB) {
            const nx = x + dx, ny = y + dy, nz = z + dz;
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || ny < 0 || ny >= CY) continue;
            const n = data[idx(nx, ny, nz)];
            if (n !== 0 && solidVal(n)) { held = true; break; }
          }
          if (!held) data[i] = B.AIR;
        }
      }
      })();
});
