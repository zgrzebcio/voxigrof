'use strict';
/* woods/gen-fallen-logs.js: fallen hollow logs lying in forests.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* ---- fallen hollow logs: now and then a forest chunk has a hollow log lying in the grass, 3-5
         long along X or Z, of the wood that grows there, with mushrooms springing up around it. Kept inside
         the chunk, on level ground, and cut short at the first cell that is not free (never under 3).
         rarer, fewer mushrooms, and some start from a stump — a standing hollow log or a plain log. ---- */
      {
        const sx = (hash3(cx * 61 + 7300, 31, cz * 67 + 7300) * 16) | 0;
        const sz = (hash3(cx * 71 + 7300, 37, cz * 73 + 7300) * 16) | 0;
        const gi = (sx + 2) + (sz + 2) * 20, h = H[gi];
        const wx = cx * 16 + sx, wz = cz * 16 + sz;
        if (TREE[gi] >= 0.5 && !DES[gi] && h > WATER_LEVEL + 1 && h <= 146 &&
            (RIM[gi] || !(SNO[gi] && !snowForestAt(wx, wz))) &&                      // plain snow has no trees to fall
            hash3(cx * 79 + 7300, 41, cz * 83 + 7300) < 0.075) {                            // 0.35 before 0.7845, 0.15 before 0.799
          const wood = RIM[gi] ? B.HOLLOW_RIME_LOG                                 // a frozen one in the coldest snow
                     : SNO[gi] || TAIGA[gi] ? B.HOLLOW_SPRUCE_LOG                  // spruce forest too
                     : birchAt(wx, wz) ? B.HOLLOW_BIRCH_LOG : B.HOLLOW_LOG;
          const alongX = hash3(cx * 89 + 7300, 43, cz * 97 + 7300) < 0.5;
          const want = 3 + ((hash3(cx * 101 + 7300, 47, cz * 103 + 7300) * 3) | 0);
          const ground = (t) => t === B.GRASS || t === B.DIRT || (RIM[gi] && t === B.SNOW);   // ...lying on its snow
          const open = (v) => (v & 255) === B.AIR || layerCount(v) > 0;                  // leaf litter or snow gives way
          const cells = [];
          for (let k = 0; k < want; k++) {
            const lx = sx + (alongX ? k : 0), lz = sz + (alongX ? 0 : k);
            if (lx > 15 || lz > 15 || H[(lx + 2) + (lz + 2) * 20] !== h) break;
            if (!ground(data[idx(lx, h, lz)] & 255) || !open(data[idx(lx, h + 1, lz)])) break;
            cells.push([lx, lz]);
          }
          if (cells.length >= 3) {
            // the first cell is sometimes the stump it fell from: 30% a standing hollow log, 20% the tree's plain log
            const stump = hash3(cx * 107 + 7300, 53, cz * 109 + 7300);
            const plainLog = wood === B.HOLLOW_RIME_LOG ? B.RIME_LOG : wood === B.HOLLOW_SPRUCE_LOG ? B.SPRUCE_LOG : wood === B.HOLLOW_BIRCH_LOG ? B.BIRCH_LOG : B.LOG;
            cells.forEach(([lx, lz], k) => {
              data[idx(lx, h + 1, lz)] = k === 0 && stump < 0.3 ? wood
                                     : k === 0 && stump < 0.5 ? plainLog
                                     : wood | ((alongX ? 1 : 2) << 8);
            });
            const frozen = wood === B.HOLLOW_RIME_LOG;                                   // nothing grows by a rime log
            const shroom = (mx, mz, salt) => {
              if (frozen || mx < 0 || mx > 15 || mz < 0 || mz > 15 || H[(mx + 2) + (mz + 2) * 20] !== h) return;
              const roll = hash3(cx * 1301 + mx, h + 7400 + salt, cz * 1307 + mz);
              if (roll >= 0.03) return;                                                   // 0.3 before 0.7845, 0.12 before 0.799, 0.06 before 0.819
              if (!ground(data[idx(mx, h, mz)] & 255) || !open(data[idx(mx, h + 1, mz)])) return;
              data[idx(mx, h + 1, mz)] = roll < 0.01 ? B.RED_MUSHROOM
                : roll < 0.02 ? brownish(hash3(cx * 1303 + mx, h + 7500 + salt, cz * 1309 + mz)) : B.BLUE_MUSHROOM;
            };
            cells.forEach(([lx, lz], k) => { shroom(lx + (alongX ? 0 : 1), lz + (alongX ? 1 : 0), k * 2);
                                             shroom(lx - (alongX ? 0 : 1), lz - (alongX ? 1 : 0), k * 2 + 1); });
            // ...and now and then a tuft of loose fiber, 1-2 layers, in the free grass beside it
            const fiber = (mx, mz, salt) => {
              if (frozen || mx < 0 || mx > 15 || mz < 0 || mz > 15 || H[(mx + 2) + (mz + 2) * 20] !== h) return;
              const roll = hash3(cx * 1409 + mx, h + 7600 + salt, cz * 1423 + mz);
              if (roll >= 0.1) return;                                                    // 0.2 before 0.791
              if (!ground(data[idx(mx, h, mz)] & 255) || (data[idx(mx, h + 1, mz)] & 255) !== B.AIR) return;
              data[idx(mx, h + 1, mz)] = layerVal(B.FIBER_BLOCK, roll < 0.035 ? 2 : 1);   // same 35% double share
            };
            cells.forEach(([lx, lz], k) => { fiber(lx + (alongX ? 0 : 1), lz + (alongX ? 1 : 0), k * 2);
                                             fiber(lx - (alongX ? 0 : 1), lz - (alongX ? 1 : 0), k * 2 + 1); });
            const [ax, az] = cells[0], [bx, bz] = cells[cells.length - 1];
            shroom(ax - (alongX ? 1 : 0), az - (alongX ? 0 : 1), 50);
            shroom(bx + (alongX ? 1 : 0), bz + (alongX ? 0 : 1), 51);
          }
        }
      }
});
