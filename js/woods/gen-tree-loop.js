'use strict';
/* woods/gen-tree-loop.js: the tree pass. Over a grid of 5-block cells (reaching past the chunk's edge, so a tree's
   crown crosses borders) it decides whether a tree stands there, which one by the biome, and builds oak, birch and
   spruce in place; rime trees, palms and dry bushes it hands to their own files.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      for (let gcz = Math.floor(minZ / 5); gcz <= Math.floor(maxZ / 5); gcz++) {
        for (let gcx = Math.floor(minX / 5); gcx <= Math.floor(maxX / 5); gcx++) {
          const r = hash2(gcx, gcz);                           // the cell's dice roll
          const wx = gcx * 5 + 1 + (((r * 977) | 0) % 3);      // jittered trunk position
          const wz = gcz * 5 + 1 + (((r * 7919) | 0) % 3);
          if (wx < minX || wx > maxX || wz < minZ || wz > maxZ) continue;
          const tx = wx - cx * 16, tz = wz - cz * 16;
          // sample biome/height at the actual trunk world position — the H/TREE/DES arrays
          // only cover chunk+2 margin, but our widened tree loop reaches further.
          const ti = terrainInfo(wx, wz);
          const h = ti.h;
          /* palms (0.84, rev 21): thick in an oasis's ring of grass; very rarely on a warm shore by the sea, on its turf (a turf
             coast, or behind the beach's sand), never on the sand itself */
          if (DESERT2 && h > WATER_LEVEL && h >= ti.wl + 1 && h < CY - 20) {
            if (ti.oas > 0.5) { if (r < 0.32) palmTree(tx, tz, h, gcx, gcz); continue; }
            // 0.8445 (PALM2, new worlds): from level +1 on, not from half way into it: none in a plain or cold land's edge
            if (r < 0.03 && !(ti.fDesert > 0.5) && h <= WATER_LEVEL + 4 && ti.lvl >= (PALM2 ? 1 : 0.5) && !(ti.cliff > 0.45)) {
              let d = 0;
              for (let rr = 1; rr <= 9 && !d; rr++)
                for (let k = 0; k < 8; k++) {
                  const t2 = terrainInfo(wx + Math.round(Math.cos(k * Math.PI / 4) * rr), wz + Math.round(Math.sin(k * Math.PI / 4) * rr));
                  if (t2.h < t2.wl && t2.wl === WATER_LEVEL && !(t2.rT > 0.3 || t2.lk > 0.3)) { d = rr; break; }
                }
              if (d && (shoreKindAt(wx, wz) === 0 || d > shoreWidth(wx, wz, 1) + 0.5)) { palmTree(tx, tz, h, gcx, gcz); continue; }
            }
          }
          // the Dryland (rev 23): no trees, big dry bushes instead (one in 14 cells)
          if (DRYLAND && ti.fDry > 0.5) {
            if (r < 0.07 && h > WATER_LEVEL && h >= ti.wl + 1 && h < CY - 6) dryBush(tx, tz, h, gcx, gcz);
            continue;
          }
          if (h <= WATER_LEVEL + 1 || h < ti.wl + 1 || h > (DIVIDE ? 199 : 146) || ti.fDesert > 0.5) continue;   // none in a lake up in the land
          // rev 18: over 146, up to 199, a few small oaks on the mountains (none in their snow)
          const isRime = RIME && ti.fRime > 0.5;                  // the Coldest Deep Snow's frozen trees
          const highOak = DIVIDE && h > 146 && !isRime;
          if (highOak && ti.fSnow > 0.5) continue;
          // no trees on or hanging over canyon lines — conservative buffer covering every canyon
          // type (crack/wide/long) so canopies always clear the rim
          if (fbm(wx * 0.0015 + 555, wz * 0.0015 - 333, 2) > 0.28 &&
              (Math.abs(fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2)) < 0.15 ||
               Math.abs(fbm(wx * 0.0035 + 911, wz * 0.011 - 477, 2)) < 0.10 ||
               Math.abs(fbm(wx * 0.011 + 911, wz * 0.0035 - 477, 2)) < 0.10)) continue;
          if (isRime) {
            /* in groves with open snow between: thick in a grove, a few about its edge, the odd lone one out on the snow */
            const grove = fbm(wx * 0.011 - 4417.1, wz * 0.011 + 2903.3, 2);
            if (r > (grove > 0.1 ? 0.3 : grove > -0.15 ? 0.08 : 0.015) * rimeKeep(ti)) continue;
            let flat = true;
            for (let oz = -2; oz <= 2 && flat; oz++)
              for (let ox = -2; ox <= 2; ox++)
                if (heightAt(wx + ox, wz + oz) > h + 2) { flat = false; break; }
            if (flat) rimeTree(tx, tz, h, wx, wz, gcx, gcz);
            continue;
          }
          const isPlains = ti.fPlains > 0.5;
          // snow: trees only inside the Snow Forest sub-biome mask; plain Snow stays treeless
          const isSnow = ti.fSnow > 0.5;
          if (isSnow && (ti.fDeepSnow > 0.5 || !snowForestAt(wx, wz))) continue;   // deep snow is treeless
          if (isSnow && iceSpikesAt(wx, wz)) continue;                                // ...and so are the ice spikes
          /* 0.823 (biomeRev 5, biomes/biomes.js): the spruce forest's chilly band grows spruce, and so do the cold plains,
             sparsely; a deep forest stands about twice as thick, with more of the big oaks and taller trees */
          const isTaiga = ti.fTaiga > 0.5, coldPlains = isPlains && isTaiga;
          const isDeep = !isPlains && ti.deepF > 0.5;
          const forestNoise = fbm(wx * 0.01 + 700, wz * 0.01 - 300, 2) > 0.12;
          const treeF = 1 - ti.fPlains;
          // birch: dedicated "Birch Forest" regions (dense) + 1% scattered birches in ordinary
          // forests. Never in snow biomes, never the big/mega form.
          const birchRegion = !isPlains && !isSnow && !isTaiga && birchAt(wx, wz);
          const isBirch = !highOak && (birchRegion || (!isPlains && !isSnow && !isTaiga && hash2(gcx * 211 + 5, gcz * 197 + 3) < 0.005));   // 1% before 0.8233
          /* spruce is the cold biomes' tree, bar the odd oak: 1 in 100 in the spruce forest and cold plains, 1 in 200
             in a deep one, 1 in 2000 in a snow forest. No spruce scattering into temperate forest. */
          const oakOdd = (isSnow || isTaiga) && hash2(gcx * 313 + 17, gcz * 271 + 29) < (isSnow ? 0.0005 : isDeep ? 0.005 : 0.01);
          const isSpruce = !highOak && !isBirch && !oakOdd && (isSnow || isTaiga);
          // plains/meadow: flat 0.1% chance. forest/other: original density-scaled odds. birch forest: dense.
          // flat worlds are entirely Plains, and plains odds (0.1%) would leave a testbed with
          // almost no trees at all — lift it enough that a few are always in sight
          /* Roughly halved across the board. Canopies are far bigger than they used to be —
             wider oaks, tall spruce cones — so the old per-cell odds packed the forest into a
             solid roof with no gaps or light between trunks. */
          // twice the plains' trees in rev 18
          let baseProb = isPlains ? (FLAT ? 0.02 : (coldPlains ? 0.004 : 0.0007) * (DIVIDE ? 2 : 1)) : (forestNoise ? 0.26 : 0.04) * treeF;
          if (highOak) baseProb = 0.02;
          if (birchRegion) baseProb = Math.max(baseProb, 0.24);
          if (isDeep) baseProb = Math.min(0.6, baseProb * 2 + 0.12);
          if (r > baseProb) continue;
          // flatness check
          let clear = true;
          for (let oz = -2; oz <= 2 && clear; oz++)
            for (let ox = -2; ox <= 2; ox++)
              if (heightAt(wx + ox, wz + oz) > h + 2) { clear = false; break; }
          if (!clear) continue;
          // big-tree roll (independent hash). plains: 50% of the 1%. others: ~3%.
          const rBig = hash2(gcx * 131 + 7, gcz * 173 + 19);
          const bigProb = isPlains || isDeep ? 0.3 : 0.03;
          const isBig = rBig < bigProb && !isBirch && !isTaiga && !highOak;   // birch never grows the big form, nor a taiga spruce, nor a mountain oak

          if (isBig) {
            // procedural big tree: tall trunk, 3-5 branches with leaf clusters, wide top canopy
            // same independent-hash rule as the small tree — `r` is too small to derive from
            const bRand = (a, b) => hash2(gcx * 29 + a, gcz * 61 + b);
            const trunkH = 9 + ((bRand(3, 5) * 4) | 0);        // 9..12
            put(tx, h, tz, B.DIRT, true);
            // big oak: an oversized stump flaring past its own cell, tapering one index per cell
            // down to the trunk — a hard step from stump straight to trunk width read as a wide
            // block with a pole balanced on it
            const bigStumpW = LOG_W_BLOCK + 6, bigTrunkW = 26;
            for (let y = h + 1; y <= h + trunkH; y++) {
              const w = Math.max(bigTrunkW, bigStumpW - (y - (h + 1)));
              put(tx, y, tz, B.LOG | ((w << 2) << 8), true);
            }
            // top canopy: 7x7 base spanning 3 layers, then 5x5, 3x3, tip
            for (let ly = h + trunkH - 2; ly <= h + trunkH + 1; ly++)
              for (let oz = -3; oz <= 3; oz++)
                for (let ox = -3; ox <= 3; ox++) {
                  const rad2 = ox * ox + oz * oz;
                  if (rad2 > 10) continue;                   // rounded footprint
                  if (rad2 >= 8 && hash2(wx + ox * 31, wz + oz * 17 + ly) < 0.55) continue;
                  put(tx + ox, ly, tz + oz, B.LEAVES, false);
                }
            const cap = h + trunkH + 2;
            for (let oz = -2; oz <= 2; oz++)
              for (let ox = -2; ox <= 2; ox++) {
                const rad2 = ox * ox + oz * oz;
                if (rad2 > 5) continue;
                if (rad2 >= 4 && hash2(wx + ox * 61, wz + oz * 41 + cap) < 0.55) continue;
                put(tx + ox, cap, tz + oz, B.LEAVES, false);
              }
            for (let oz = -1; oz <= 1; oz++)
              for (let ox = -1; ox <= 1; ox++)
                if (Math.abs(ox) + Math.abs(oz) < 2) put(tx + ox, cap + 1, tz + oz, B.LEAVES, false);
            put(tx, cap + 2, tz, B.LEAVES, false);
            // 5..8 branches, angled outward from mid-upper trunk with fatter leaf blobs
            const nBranches = 5 + ((bRand(7, 11) * 4) | 0);
            for (let b = 0; b < nBranches; b++) {
              const bh = h + Math.floor(trunkH * 0.45) + Math.floor(b * 0.8);
              const angle = hash2(wx + b * 53, wz + b * 89) * Math.PI * 2;
              const dx = Math.cos(angle), dz = Math.sin(angle);
              const len = 3 + ((bRand(31 + b * 5, 37 + b * 3) * 4) | 0);   // 3..6
              // branch logs lie along their dominant horizontal axis (variant 1 = X, 2 = Z)
              const branchVar = Math.abs(dx) >= Math.abs(dz) ? 1 : 2;
              let bx = 0, bz2 = 0, by = bh;
              for (let s = 1; s <= len; s++) {
                bx = Math.round(dx * s);
                bz2 = Math.round(dz * s);
                by = bh + Math.floor(s * 0.45);
                // taper as it reaches out, same rule the small tree uses
                const bw = Math.max(LOG_W_MIN + 3, 22 - (s - 1) * 3);
                put(tx + bx, by, tz + bz2, B.LOG | ((branchVar | (bw << 2)) << 8), true);
              }
              // wider leaf blob at branch tip (radius ~2) + a smaller blob mid-branch
              for (let ly = -2; ly <= 2; ly++)
                for (let oz = -2; oz <= 2; oz++)
                  for (let ox = -2; ox <= 2; ox++) {
                    const d = Math.abs(ox) + Math.abs(oz) + Math.abs(ly);
                    if (d > 4) continue;
                    if (d === 4 && hash2(wx + ox * 71 + b, wz + oz * 83 + ly) < 0.5) continue;
                    put(tx + bx + ox, by + ly + 1, tz + bz2 + oz, B.LEAVES, false);
                  }
              // mid-branch leaf tuft (halfway along the branch)
              const midS = Math.max(1, Math.floor(len * 0.55));
              const mx = Math.round(dx * midS), mz2 = Math.round(dz * midS);
              const my = bh + Math.floor(midS * 0.45);
              for (let ly = -1; ly <= 1; ly++)
                for (let oz = -1; oz <= 1; oz++)
                  for (let ox = -1; ox <= 1; ox++)
                    if (Math.abs(ox) + Math.abs(oz) + Math.abs(ly) < 3)
                      put(tx + mx + ox, my + ly + 1, tz + mz2 + oz, B.LEAVES, false);
            }
            continue;
          }

          /* Small tree (also used for all birches). birch trunks are taller (5..10).
             Three canopy silhouettes chosen per tree so a forest is not one shape repeated:
               0 ROUND  - the classic 5x5 blob, widest in the middle
               1 TALL   - narrower and one layer higher, reads as a young/crowded tree
               2 SPREAD - 7-wide bottom layer thinning fast, the "old oak" umbrella
             Every form also grows 1-3 stub branches: a single horizontal log poking out of the
             upper trunk with a small tuft on it. That is what makes the trunk read as a tree
             rather than a pole, and it costs one extra log per branch. */
          const LOG = isSpruce ? B.SPRUCE_LOG : isBirch ? B.BIRCH_LOG : B.LOG;
          const LEAF = isSpruce ? B.SPRUCE_LEAVES : isBirch ? B.BIRCH_LEAVES : B.LEAVES;

          /* Spruce is a cone, not a ball, so it gets its own shape entirely: a straight pole with
             skirts of needles that shrink toward a point. Branch stubs are skipped — a conifer's
             limbs are short and buried in the skirt, so a bare stub sticking out looks wrong. */
          if (isSpruce) {
            /* In the spruce forest a tree stands on a bare stem 4..8 high before its needles start, that much
               taller, and the stem keeps the stump's width up to them. Snow forest and cold plains spruces as before. */
            /* Forms (rev 17): in the spruce forest the usual tree stands 3 lower, and some are GIANTS (8%: 9-10 taller,
               a skirt two wider, a stump flaring past its cell), some SMALL (20%: 8-11 tall) and some CROWNED (15%: a heavy
               top, only thin tufts below it). The cold plains and snow forest keep theirs, bar a rare giant (2%) or crown (3%). */
            const inForest = isTaiga && !isPlains;
            const sRoll = FALLS ? hash2(gcx * 73 + 19, gcz * 89 - 13) : 0.5;
            const giant = FALLS && sRoll < (inForest ? 0.08 : 0.02);
            const crown = FALLS && !giant && sRoll < (inForest ? 0.23 : 0.05);
            const small = FALLS && !giant && !crown && sRoll > (inForest ? 0.8 : 0.9);
            let bare = TALL_SPRUCE && inForest ? 4 + ((hash2(gcx * 29 + 11, gcz * 61 + 5) * 5) | 0) : 0;
            if (small) bare = Math.min(bare, 2);
            let sh = 14 + ((hash2(gcx * 53 + 3, gcz * 97 + 7) * 7) | 0) + (isDeep ? 5 : 0) + bare;   // 14..20 tall, 19..25 deep
            if (FALLS && inForest) sh -= 3;
            if (giant) sh += 9 + ((hash2(gcx * 7 + 3, gcz * 13 - 3) * 2) | 0);
            else if (small) sh = 8 + ((hash2(gcx * 53 + 3, gcz * 97 + 7) * 4) | 0) + bare;
            else if (crown) sh += 2;
            put(tx, h, tz, B.DIRT, true);
            /* The trunk narrows the whole way up rather than stepping from stump to a constant
               width — a real conifer is a spike, and by the crown it is barely thicker than a
               branch. 30 units at the base down to 14 at the tip; the narrowing starts where the needles do.
               A giant's stump flares to 38 (wider than its cell) and narrows from the ground; a small one 24. */
            const SPR_STUMP = giant ? 38 : small ? 24 : 30, SPR_TIP = giant ? 16 : 14, taperY = giant ? h + 1 : h + 1 + bare;
            for (let y = h + 1; y <= h + sh; y++) {
              const t = Math.max(0, y - taperY) / Math.max(1, h + sh - taperY);
              const w = Math.round(SPR_STUMP - (SPR_STUMP - SPR_TIP) * t);
              put(tx, y, tz, LOG | ((w << 2) << 8), true);
            }
            /* Needles: a broad heavy skirt low down thinning to a spike, and never absent at the
               top — radius is interpolated 4 -> 1 over the canopy and floored at 1, so the crown
               always carries foliage instead of ending in bare trunk. Alternate tiers pull in one
               step for the layered look, and the rim thins out as it climbs so the silhouette
               reads dense at the bottom and wispy at the top. */
            const base = h + 2 + bare, topY = h + sh, span = Math.max(1, topY - base);
            // a crowned tree's heavy top: the upper 45% of it, and only tufts below
            const crownFrom = crown ? base + Math.floor(span * 0.55) : base;
            for (let ly = base; ly <= topY; ly++) {
              const t = (ly - base) / span;                                        // 0 low .. 1 high
              if (ly < crownFrom) {
                if (((ly - base) % 3) !== 0) continue;                              // a tuft every third layer
                for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                  if (hash2(wx + ox * 43 + ly, wz + oz * 59 - ly) < 0.6) put(tx + ox, ly, tz + oz, LEAF, false);
                continue;
              }
              const tc = crown ? (ly - crownFrom) / Math.max(1, topY - crownFrom) : t;
              let rad = Math.max(1, Math.round((giant ? 6 : small ? 3 : crown ? 4.5 : isDeep ? 5 : 4) + (giant && isDeep ? 1 : 0) - (giant ? 5 : small ? 2.2 : 3.2) * tc));   // a wider skirt in a deep forest
              if (((ly - base) % 2) === 1) rad = Math.max(1, rad - 1);
              const rimKeep = crown ? 0.95 - 0.4 * tc : 0.85 - 0.5 * t;           // thinner rim up top; a crown dense
              for (let oz = -rad; oz <= rad; oz++)
                for (let ox = -rad; ox <= rad; ox++) {
                  const d = Math.abs(ox) + Math.abs(oz);
                  if (d > rad) continue;
                  if (d === rad && hash2(wx + ox * 31 + ly, wz + oz * 17 - ly) > rimKeep) continue;
                  put(tx + ox, ly, tz + oz, LEAF, false);
                }
            }
            for (let t2 = 1; t2 <= 2; t2++) put(tx, topY + t2, tz, LEAF, false);   // spire
            const SLIT = layerVal(B.SPRUCE_LEAVES, 1);
            for (let oz = -2; oz <= 2; oz++)
              for (let ox = -2; ox <= 2; ox++) {
                if (!ox && !oz) continue;
                if (hash2(wx + ox * 137 + 41, wz + oz * 211 - 29) > 0.3) continue;
                const lx = tx + ox, lz = tz + oz;
                if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
                put(lx, h + 1, lz, SLIT, false);
              }
            continue;
          }
          // birch grows tall and straight (7..12); oak keeps a shorter, thicker stump (5..8)
          const th = (isBirch ? 7 + ((hash2(gcx * 43 + 5, gcz * 71 + 9) * 6) | 0)
                              : 5 + ((hash2(gcx * 43 + 5, gcz * 71 + 9) * 4) | 0))
                   + (isDeep ? (isBirch ? 3 : 2) : 0);            // taller in a deep forest
          /* Per-tree dice. NOT derived from `r`: a tree only exists when r <= baseProb, and
             baseProb is as low as 0.001, so every `(r * K) | 0` truncated to 0 and each tree came
             out with identical form, branch count and branch length. These are independent
             hashes of the grid cell, still a pure function of world position. */
          const tRand = (a, b) => hash2(gcx * 37 + a, gcz * 53 + b);
          const form = (tRand(11, 23) * 3) | 0;

          /* Trunk width, and the flared stump at its foot.
             Oak carries a stump wider than a full cell (up to 76 units). That only looks right on
             open ground, so it needs 3x3 of grass/dirt under it — otherwise the flare hangs over
             a ledge. Failing the test isn't fatal: the tree still grows, just on a plain trunk.
             Birch never flares; its width tracks its height so tall ones aren't spindly. */
          const TRUNK_W_MIN = 26;                                          // 60 units, both species
          const trunkW = isBirch ? Math.max(TRUNK_W_MIN, Math.min(28, 16 + th))
                                 : TRUNK_W_MIN + ((tRand(131, 137) * 3) | 0);
          let stumpW = trunkW;
          if (!isBirch) {
            const want = LOG_W_BLOCK + 2 + ((tRand(139, 149) * 5) | 0);    // 68..76 units
            let flat = true;
            for (let oz = -1; oz <= 1 && flat; oz++)
              for (let ox = -1; ox <= 1; ox++) {
                const gx2 = tx + ox, gz2 = tz + oz;
                if (gx2 < 0 || gx2 > 15 || gz2 < 0 || gz2 > 15) continue;  // outside: trust the flatness test
                const under = data[idx(gx2, h, gz2)] & 255;
                if (under !== B.GRASS && under !== B.DIRT) { flat = false; break; }
              }
            if (flat) stumpW = want;
          }
          const wBits = (w) => (w << 2);                   // variant bits 2-7 carry the width

          put(tx, h, tz, B.DIRT, true);
          /* The flare tapers away instead of stopping dead: each cell above the stump loses one
             width index (2 units) until it reaches the trunk width. A 70-unit stump therefore
             reads 70, 68, 66 ... down to 60, which is what makes the base look grown rather than
             like a wide block with a thin pole balanced on it. */
          for (let y = h + 1; y <= h + th; y++) {
            const w = Math.max(trunkW, stumpW - (y - (h + 1)));
            put(tx, y, tz, LOG | (wBits(w) << 8), true);
          }

          /* Stub branches on the upper half of the trunk, each on its own side and each its own
             LENGTH (1..3 cells, rising as it goes out). Uniform 1-cell stubs made every tree
             look identical from a distance; varying the reach is what gives a stand its ragged,
             overlapping canopy line. */
          /* Birch and oak branch very differently, and treating them the same was what made
             birches look wrong — a fat branch a third of the way up a slender white trunk.

             BIRCH: a tall clean pole. Branches only in the top quarter, at most two, and only on
                    a trunk tall enough to have earned them.
             OAK:   branchier and shaggier, 2..4 branches spread over the upper half.

             Branch cells carry thickness 2 in variant bits 2-3, so a branch renders visibly
             thinner than the trunk it grows from instead of being another full log. */
          const isTall = th >= (isBirch ? 8 : 6);
          const nStub = isBirch ? (isTall ? 1 + ((tRand(41, 59) * 2) | 0) : 0)
                                : 2 + ((tRand(41, 59) * 3) | 0);
          const stubLow  = isBirch ? h + th - Math.max(1, Math.round(th * 0.25))   // top quarter
                                   : h + th - Math.max(2, Math.round(th * 0.5));   // upper half
          const stubSpan = Math.max(1, (h + th - 1) - stubLow);
          const STUB_DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (let s = 0; s < nStub; s++) {
            const dir = STUB_DIR[(tRand(71 + s * 13, 83 + s * 7) * 4) | 0];
            const sy = stubLow + ((tRand(97 + s * 11, 101 + s * 5) * stubSpan) | 0);
            if (sy <= h + 2) continue;                           // never down at the stump
            // birch twigs stay short; oak reaches out and rises as it goes
            const len = isBirch ? 1 + ((tRand(103 + s * 3, 107 + s * 9) * 2) | 0)
                                : 1 + ((tRand(103 + s * 3, 107 + s * 9) * 3) | 0);
            /* Walk the branch as a path of horizontal runs and vertical risers rather than one
               diagonal line of horizontal logs. The riser cells are Y-axis logs, so at every turn
               the horizontal log flares into the vertical one (logInto already does that) and the
               pair reads as an L elbow pointing the way the branch is going — which is what a
               real limb looks like where it kinks upward.

               Birch rises a cell per step, so it is elbows all the way up; oak runs out level and
               kinks once it is clear of the trunk. */
            const axisVar = dir[0] ? 1 : 2;                      // lie flat along X or Z
            let ex = tx, ez = tz, ey = sy;
            for (let k = 1; k <= len; k++) {
              ex = tx + dir[0] * k; ez = tz + dir[1] * k;
              const bw = isBirch ? 11                            // 30 units, uniform
                                 : Math.max(LOG_W_MIN + 3, trunkW - 4 - (k - 1) * 3);
              put(ex, ey, ez, LOG | ((axisVar | wBits(bw)) << 8), true);   // horizontal run
              const rise = isBirch ? 1 : (k === 1 ? 1 : 0);
              for (let u = 0; u < rise; u++) {
                ey++;
                put(ex, ey, ez, LOG | ((0 | wBits(bw)) << 8), true);       // the elbow, vertical
              }
            }
            // leaf tuft on the branch tip, sized with the branch
            const tuft = len >= 3 ? 2 : 1;
            for (let ly = 0; ly <= tuft; ly++)
              for (let oz = -tuft; oz <= tuft; oz++)
                for (let ox = -tuft; ox <= tuft; ox++)
                  if (Math.abs(ox) + Math.abs(oz) + ly <= tuft + 1)
                    put(ex + ox, ey + ly, ez + oz, LEAF, false);
          }

          const wide = form === 2 ? 3 : 2;                       // SPREAD reaches one further
          const lowTop = form === 1 ? h + th : h + th - 1;       // TALL starts its canopy higher
          for (let ly = lowTop - 1; ly <= lowTop; ly++)
            for (let oz = -wide; oz <= wide; oz++)
              for (let ox = -wide; ox <= wide; ox++) {
                if (ox === 0 && oz === 0) continue;
                const rad2 = ox * ox + oz * oz;
                if (rad2 > wide * wide + 1) continue;            // rounded, not square
                if (form === 1 && rad2 > 4) continue;            // TALL stays narrow
                if (rad2 >= wide * wide && hash2(wx + ox * 31, wz + oz * 17 + ly) < 0.5) continue;
                put(tx + ox, ly, tz + oz, LEAF, false);
              }
          const cap = lowTop + 1;                                // 3x3 cap without corners
          for (let oz = -1; oz <= 1; oz++)
            for (let ox = -1; ox <= 1; ox++)
              if (Math.abs(ox) + Math.abs(oz) < 2) put(tx + ox, cap, tz + oz, LEAF, false);
          put(tx, cap + 1, tz, LEAF, false);                     // tip
          if (form === 1) put(tx, cap + 2, tz, LEAF, false);      // TALL gets one more

          /* Fallen leaf litter around the base. Placed only where the cell below is actually
             grass inside this chunk — the canopy overhangs neighbouring columns whose height we
             have not sampled, and littering those blind would leave carpets floating on slopes. */
          const LITTER = layerVal(isBirch ? B.BIRCH_LEAVES : B.LEAVES, 1);
          for (let oz = -2; oz <= 2; oz++)
            for (let ox = -2; ox <= 2; ox++) {
              if (!ox && !oz) continue;
              if (hash2(wx + ox * 137 + 9, wz + oz * 211 - 5) > 0.3) continue;
              const lx = tx + ox, lz = tz + oz;
              if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
              if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
              put(lx, h + 1, lz, LITTER, false);
            }
        }
      }

      /* Snowy grass sides are only correct when snow is actually sitting on the block. The snow
         cap is laid before the tree pass, so any column a trunk landed in still claims a white
         rim under bare wood. Sweep it off after the trees have gone in. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi2 = (x + 2) + (z + 2) * 20, hh = H[gi2];
          if (hh < 1 || hh > CY - 2) continue;
          const gv = data[idx(x, hh, z)];
          if ((gv & 255) !== B.GRASS || ((gv >> 8) & 255) !== V.GRASS_SNOWY) continue;
          // a snow block or a stack of snow layers (layers are the snow block's own id since 0.785)
          const snowAbove = (data[idx(x, hh + 1, z)] & 255) === B.SNOW;
          if (!snowAbove) data[idx(x, hh, z)] = B.GRASS;
        }
});
