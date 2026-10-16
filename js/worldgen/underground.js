'use strict';
/* worldgen/underground.js: everything carved or filled under the ground. Caves, ores, the planned rooms, tunnels,
   mouths and mountain halls, overhangs, lava pools.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* Everything from here to the tree pass carves or fills UNDERGROUND: ore, gravel, caves,
         cave entrances, lava pools and sulfur. A flat world is a 25-block slab meant as a clean
         testbed, so the whole region is skipped rather than left to riddle it with holes. */
      if (!FLAT) {

      /* ---- ore veins (before caves so cave walls naturally expose ore faces) ---- */
      {
        const ORE_TYPES = [
       // [oreId,   attempts, minN, maxN, bestLo, bestHi, rangeLo, rangeHi]
          [B.COAL_ORE,    20,    4,   14,     60,     90,      35,     180],
          [B.IRON_ORE,    12,    3,    9,     50,     65,      15,     130],
          [B.DIAMOND_ORE,  2,    1,    5,     15,     20,       2,      30],
          [B.COPPER_ORE,   8,    3,   10,     70,     80,      20,      85],
          [B.TIN_ORE,      6,    2,    8,     40,     45,      10,      70],
          [B.GOLD_ORE,     4,    2,    6,     20,     30,       5,      40],
          // gems: emerald only in mountain rock, ruby deep, sapphire just below the surface band
          [B.EMERALD_ORE,  4,    1,    4,    150,    160,     120,     200],
          [B.RUBY_ORE,     3,    1,    4,     43,     47,      30,      70],
          [B.SAPPHIRE_ORE, 3,    1,    4,     93,     97,      80,     130],
          [B.TOPAZ_ORE,    3,    1,    4,     78,     82,      60,     100],   // 0.769
          // big rock patches embedded in stone (chunky blobs, wide depth range)
          [B.MARBLE,       5, 24, 60, 50, 92,  30, 94],
          [B.GRANITE,      5, 24, 60,  6, 55,   2, 60],
          [B.LIMESTONE,    5, 24, 60, 40, 92,  20, 94],
          // appended, so every row above keeps the index that seeds its veins
          [B.DOLOMITE,     4, 24, 60, 60, 110, 40, 130],
        ];
        for (let oi = 0; oi < ORE_TYPES.length; oi++) {
          const [oreId, attempts, minN, maxN, bestLo, bestHi, rangeLo, rangeHi] = ORE_TYPES[oi];
          // gems grow as clusters in caves since 0.7945 (below). Skipped rather than removed, so every other
          // row keeps its index `oi`, which seeds its veins: the rest of the underground stays where it was
          if (PROPS[oreId].model === 'cluster') continue;
          for (let ai = 0; ai < attempts; ai++) {
            const lx = (hash3(cx * 47 + oi + ai,       11, cz * 43 + oi + ai    ) * 16) | 0;
            const lz = (hash3(cx * 53 + oi + ai * 3,   17, cz * 59 + oi + ai    ) * 16) | 0;
            const inBest = hash3(cx + oi * 7 + ai * 3, 31, cz + oi * 3 + ai * 7) < 0.7;
            const ly = inBest
              ? bestLo  + ((hash3(cx * 13 + ai + oi, 41, cz * 11 + ai) * (bestHi  - bestLo  + 1)) | 0)
              : rangeLo + ((hash3(cx * 19 + ai + oi, 37, cz * 17 + ai) * (rangeHi - rangeLo + 1)) | 0);
            if (ly < rangeLo || ly > rangeHi || ly < 2 || ly > CY - 2) continue;
            if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
            const count = minN + ((hash3(cx + ai, ly + oi, cz + ai) * (maxN - minN + 1)) | 0);
            // LCG seeded from position for deterministic vein shape
            let lcg = (Math.imul(cx * 37 + lx + oi * 13, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
            const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
            const front = [[lx, ly, lz]];
            let placed = 0;
            while (front.length && placed < count) {
              const fi = (nlcg() * front.length) | 0;
              const [bx, by, bz] = front.splice(fi, 1)[0];
              if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
              if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
              data[idx(bx, by, bz)] = oreId;
              placed++;
              front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
            }
          }
        }
        /* Red desert gold (rev 22): under the red sand (the Red Sand, its hills and the Deep Red Desert) gold lies at
           any height, from the deep rock up into the hills and crags just under the surface, in stone or sandstone. Up to
           RG_TRIES veins a chunk, 3-7 ore each, on top of the usual deep gold. */
        if (DESERT3) {
          const RG_TRIES = 9, RG_ROCK = new Set([B.STONE, B.SANDSTONE, B.RED_SANDSTONE]);
          for (let ai = 0; ai < RG_TRIES; ai++) {
            const lx = (hash3(cx * 61 + 900 + ai, 13, cz * 67 + 900 + ai) * 16) | 0;
            const lz = (hash3(cx * 71 + 900 + ai * 3, 19, cz * 73 + 900 + ai) * 16) | 0;
            const gi = (lx + 2) + (lz + 2) * 20, top = H[gi] - 2;
            if (!RED[gi] || top < 10) continue;
            const ly = 5 + ((hash3(cx * 79 + ai, 23, cz * 83 + ai) * (top - 5)) | 0);
            const count = 3 + ((hash3(cx + ai + 900, ly, cz + ai + 900) * 5) | 0);
            let lcg = (Math.imul(cx * 37 + lx + 900, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
            const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
            const front = [[lx, ly, lz]];
            let placed = 0;
            while (front.length && placed < count) {
              const [bx, by, bz] = front.splice((nlcg() * front.length) | 0, 1)[0];
              if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
              if (!RG_ROCK.has(data[idx(bx, by, bz)] & 255)) continue;
              data[idx(bx, by, bz)] = B.GOLD_ORE;
              placed++;
              front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
            }
          }
        }
      }

      /* ---- gravel patches: mountain slopes and underground cave floors ---- */
      {
        // mountain surface patches — near surface of tall columns
        for (let ai = 0; ai < 9; ai++) {
          const lx = (hash3(cx * 47 + 500 + ai,       7, cz * 43 + 500 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 500 + ai * 3,  13, cz * 59 + 500 + ai    ) * 16) | 0;
          const gi = (lx + 2) + (lz + 2) * 20;
          if (H[gi] <= 82) continue;                             // only in mountain columns
          const ly = H[gi] - 4 - ((hash3(cx + 500 + ai, 29, cz + 500 + ai) * 16) | 0);
          if (ly < 2 || ly > CY - 2) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 20 + ((hash3(cx + ai + 500, ly, cz + ai + 500) * 30) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 500, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
        // underground patches — scattered through caves / mid-depth stone
        for (let ai = 0; ai < 8; ai++) {
          const lx = (hash3(cx * 47 + 600 + ai,       11, cz * 43 + 600 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 600 + ai * 3,   17, cz * 59 + 600 + ai    ) * 16) | 0;
          const ly = 12 + ((hash3(cx + 600 + ai, 23, cz + 600 + ai) * 48) | 0);
          if (ly < 2 || ly > CY - 2) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 10 + ((hash3(cx + ai + 600, ly, cz + ai + 600) * 20) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 600, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
        // general-biome surface patches — small, all elevated terrain h > 65
        for (let ai = 0; ai < 6; ai++) {
          const lx = (hash3(cx * 47 + 700 + ai,       31, cz * 43 + 700 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 700 + ai * 3,   37, cz * 59 + 700 + ai    ) * 16) | 0;
          const gi = (lx + 2) + (lz + 2) * 20;
          if (H[gi] <= 65) continue;                             // only above beach level
          const ly = H[gi] - 3 - ((hash3(cx + 700 + ai, 43, cz + 700 + ai) * 10) | 0);
          if (ly < 2 || ly > CY - 2) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 5 + ((hash3(cx + ai + 700, ly, cz + ai + 700) * 12) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 700, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
      }

      /* may a cave cut this cell (rev 16)? Not in the crust under water (9), nor beside a water cell, which it
         would open: water does not flow, so it would stand hanging over the hole. Older worlds cut as they did. */
      const keepsWater = (lx, gy, lz) => {
        if (!RIV2) return true;
        const gi = (lx + 2) + (lz + 2) * 20;
        if (H[gi] < WLV[gi] && gy > H[gi] - 9) return false;
        for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) if (H[n] < WLV[n] && gy > H[n] && gy <= WLV[n]) return false;
        return true;
      };
      /* ---- caves: two 3D-noise bands intersect into winding tunnels ("spaghetti"), plus
         large low-altitude "cheese" caverns. A solid crust stays under the surface (6 land /
         9 underwater) so caves only reach daylight through the entrance shafts below. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const capY = h - (h < WLV[gi] ? 9 : 6);                  // its own water
          // long-tunnel region gate (2D, per-column): ~40% of areas also grow long sweeping
          // tunnels from a separate LOW-frequency band pair (long wavelength = long tunnels)
          const longTun = fbm(wx * 0.003 + 4040, wz * 0.003 - 2020, 2) > 0.12;
          for (let y = 3; y <= capY; y++) {
            // taper the band shut approaching the crust so noise never breaches the surface
            const taper = Math.min(1, (capY - y) * 0.25 + 0.4);
            // boost band width inside tall mountains so interiors are more cavernous
            const w = (0.062 + (1 - y / 96) * 0.02 + Math.max(0, h - 90) * 0.00045) * taper;
            const n1 = fbm3(wx * 0.055, y * 0.075, wz * 0.055, 2);
            if (Math.abs(n1) <= w) {                          // spaghetti band
              const n2 = fbm3(wx * 0.055 + 133.7, y * 0.075 - 71.3, wz * 0.055 + 291.1, 2);
              if (Math.abs(n2) <= w && keepsWater(x, y, z)) { data[idx(x, y, z)] = B.AIR; continue; }
            }
            if (!longTun) continue;                           // long tunnels only in gated regions
            const lw = w * 0.85;                              // a touch narrower so they read as tunnels
            const t1 = fbm3(wx * 0.018 + 512, y * 0.05 - 88, wz * 0.018 + 707, 2);
            if (Math.abs(t1) > lw) continue;                  // early out before the 2nd band
            const t2 = fbm3(wx * 0.018 - 333, y * 0.05 + 219, wz * 0.018 - 141, 2);
            if (Math.abs(t2) <= lw && keepsWater(x, y, z)) data[idx(x, y, z)] = B.AIR;
          }
          // cheese caverns deep down (big rooms, stone only). Some regions widen into GRAND
          // caverns — taller, lower carve threshold — held up by full stone pillars and
          // floor/ceiling rock spikes (per-column hash keeps them chunk-border stable).
          const grand = fbm(wx * 0.006 + 777, wz * 0.006 + 321, 2) > 0.30;
          const thr = grand ? 0.40 : 0.47;
          const pr = hash2(wx * 13 + 5, wz * 29 - 11);
          const isPillar = grand && pr < 0.012;                          // full floor-to-ceiling pillar
          const stalag = grand && !isPillar && pr < 0.055 ? 4 + ((pr * 4096 | 0) % 7) : 0;   // floor spike
          const stalac = grand && !isPillar && pr >= 0.055 && pr < 0.095 ? 4 + ((pr * 8192 | 0) % 7) : 0; // ceiling spike
          const yMaxC = Math.min(grand ? 42 : 34, capY);
          for (let y = 5; y <= yMaxC; y++) {
            const i = idx(x, y, z);
            /* Carve every rock, not just stone. Ore veins, granite, marble and limestone blobs and
               gravel patches are laid down BEFORE the caves, and a room that only cleared plain stone left all
               of them hanging in mid-air inside it. Liquids and bedrock still stay put. */
            const cb = data[i] & 255;
            if (cb === B.AIR || cb === B.WATER || cb === B.LAVA || cb === B.BEDROCK) continue;
            if (isPillar) continue;
            if (stalag && y < 5 + stalag) continue;
            if (stalac && y > yMaxC - stalac) continue;
            if (fbm3(wx * 0.02, y * 0.03, wz * 0.02, 2) > thr) data[i] = B.AIR;
          }
        }

      /* ---- cave entrances: one dice roll per 16-block cell; a winding shaft bores from the
         surface down into cave depth. Land: 5% of cells (14% in mountains), r~2.4 with a
         flared mouth. Underwater: 0.5% and a tighter r~1.5. Pure function of world position.
         Shafts travel ~1.5 blocks horizontally per block of descent so entrances slope gently
         rather than plunging straight down. */
      const EMARGIN = 28;
      for (let ecz = Math.floor((cz * 16 - EMARGIN) / 16); ecz <= Math.floor((cz * 16 + 15 + EMARGIN) / 16); ecz++)
        for (let ecx = Math.floor((cx * 16 - EMARGIN) / 16); ecx <= Math.floor((cx * 16 + 15 + EMARGIN) / 16); ecx++) {
          const roll = hash2(ecx * 913 + 71, ecz * 641 - 233);
          const jx = ecx * 16 + 3 + (((roll * 4241) | 0) % 10);   // jittered start inside the cell
          const jz = ecz * 16 + 3 + (((roll * 6553) | 0) % 10);
          const ti = terrainInfo(jx, jz);
          const under = ti.h < ti.wl;                             // column has water above it (its own level)
          const isMtn = !under && ti.h > 126;
          const landChance = isMtn ? 0.14 : 0.05;
          if (roll > (under ? 0.005 : landChance)) continue;
          if (under && RIV2) continue;                            // rev 16: none under water, it left the water hanging over the shaft
          const depth = 14 + (((roll * 88007) | 0) % 12) + (isMtn ? 6 : 0);
          const targetY = Math.max(8, ti.h - depth);
          let px = jx + 0.5, pz = jz + 0.5;
          let ang = hash2(ecx * 57 + 991, ecz * 83 - 447) * Math.PI * 2;
          // entrance style: 0 gentle winding slope · 1 plain vertical hole · 2 steep drop ·
          // 3 grand flared mouth · 4 grotto (hemispherical room, then a slope out its floor) ·
          // 5 long near-level tunnel that ends in a steep drop
          const style = ((roll * 7919) | 0) % 6;
          const clearCell = (gx, gy, gz) => {                    // shared carve helper (local coords)
            const lx = gx - cx * 16, lz = gz - cz * 16;
            if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || gy < 3 || gy > CY - 1) return;
            const ii = idx(lx, gy, lz), bid = data[ii] & 255;
            if (bid !== B.WATER && bid !== B.BEDROCK && keepsWater(lx, gy, lz)) data[ii] = B.AIR;
          };
          let startY = ti.h + 1;
          if (style === 4 && !under) {                           // grotto: dome carved into the surface
            const R = 4 + (((roll * 331) | 0) % 2);
            for (let dy = 0; dy <= R; dy++)
              for (let oz = -R; oz <= R; oz++)
                for (let ox = -R; ox <= R; ox++) {
                  if (ox * ox + oz * oz + dy * dy * 2 > R * R) continue;
                  clearCell(Math.round(px) + ox, ti.h + 1 - dy, Math.round(pz) + oz);
                }
            startY = ti.h + 1 - R;                               // shaft leaves through the grotto floor
          }
          if (style === 5 && !under) {                           // long gently-declining tunnel first
            const L = 8 + (((roll * 557) | 0) % 8);
            for (let s2 = 0; s2 < L; s2++) {
              px += Math.cos(ang) * 1.0; pz += Math.sin(ang) * 1.0;
              ang += (hash2(jx * 19 + s2, jz * 23 - s2) - 0.5) * 0.3;
              const yy0 = ti.h - 1 - (s2 >> 2);
              const cxi = Math.round(px), czi = Math.round(pz);
              for (let oz = -2; oz <= 2; oz++)
                for (let ox = -2; ox <= 2; ox++) {
                  if (ox * ox + oz * oz > 3.2) continue;
                  clearCell(cxi + ox, yy0, czi + oz);
                  clearCell(cxi + ox, yy0 - 1, czi + oz);
                }
              startY = yy0 - 1;                                  // steep drop starts at tunnel end
            }
          }
          const horiz = style === 1 ? 0 : (style === 2 || style === 5) ? 0.5 : 1.5;
          const flare = style === 3 ? 2.6 : 1.1;
          const rBase = (under ? 1.5 : (isMtn ? 2.8 : 2.4)) * (style === 1 ? 0.9 : 1);
          for (let y = startY; y >= targetY; y--) {
            const t = startY - y;                                 // steps below the entry point
            ang += (hash2(jx * 31 + t, jz * 17 - t) - 0.5) * 0.55; // gentle wobble for gradual slope
            px += Math.cos(ang) * horiz;
            pz += Math.sin(ang) * horiz;
            const flaring = style <= 3 && t < (style === 3 ? 4 : 2) && !under;
            const r = rBase + (flaring ? flare * Math.max(0.3, 1 - t * 0.25) : 0) - Math.min(0.8, t * 0.04);
            const cxi = Math.round(px), czi = Math.round(pz), ri = Math.ceil(r);
            for (let oz = -ri; oz <= ri; oz++)
              for (let ox = -ri; ox <= ri; ox++) {
                if (ox * ox + oz * oz > r * r) continue;
                const lx = cxi + ox - cx * 16, lz = czi + oz - cz * 16;
                if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                for (let dy = 0; dy >= -1; dy--) {                // 2-tall passage
                  const yy = y + dy;
                  if (yy < 3 || yy > CY - 1) continue;
                  const ii = idx(lx, yy, lz);
                  const bid = data[ii] & 255;
                  if (bid !== B.WATER && bid !== B.BEDROCK && keepsWater(lx, yy, lz)) data[ii] = B.AIR;
                }
              }
          }
        }

      /* ---- rooms, tunnels, cave mouths, arches and overhangs (biomeRev 15) ----
         Rooms: round caves 4-14 across (now and then a hall up to 26), one in most ROOM_CELL squares at any depth under
         the crust, each joined to its east and south neighbours' by a winding tunnel. Mouths: from the foot of a slope
         (a drop of 6+ over 7 blocks) a tunnel runs into the hill, falling as it goes; arches run level, and come out the
         far side of a hill narrow enough. Both keep 2 blocks of roof, so they open only on the face. Overhangs: along
         some cliffs the face is cut back under its lip, one or two columns deep. All pure functions of the world
         position, so every chunk carves its part alike. */
      if (UPLAND) {
        const X0 = cx * 16, Z0 = cz * 16;
        // clear a cell of this chunk; roof: blocks kept under the ground there (-1: the crust, 9 under water, 6 on land)
        const dig = (gx, gy, gz, roof) => {
          const lx = gx - X0, lz = gz - Z0;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || gy < 3 || gy > CY - 2) return;
          const gi = (lx + 2) + (lz + 2) * 20;
          if (gy > H[gi] - (H[gi] < WLV[gi] ? 9 : roof < 0 ? 6 : roof)) return;   // under water always the full crust
          for (const n of [gi - 1, gi + 1, gi - 20, gi + 20])                     // never opens a water cell's side
            if (H[n] < WLV[n] && gy > H[n] && gy <= WLV[n]) return;
          const i = idx(lx, gy, lz), b = data[i] & 255;
          if (b === B.WATER || b === B.LAVA || b === B.BEDROCK || b === B.ICE) return;
          data[i] = B.AIR;
        };
        // an upright ellipsoid of radius r (a little taller than wide above its middle)
        const blob = (px, py, pz, r, roof) => {
          if (px + r + 1 < X0 || px - r - 1 > X0 + 15 || pz + r + 1 < Z0 || pz - r - 1 > Z0 + 15) return;
          const ri = Math.ceil(r);
          for (let oy = -ri; oy <= ri + 1; oy++)
            for (let oz = -ri; oz <= ri; oz++)
              for (let ox = -ri; ox <= ri; ox++) {
                const ey = oy > 0 ? oy / (r * 1.15) : oy / r;
                if ((ox * ox + oz * oz) / (r * r) + ey * ey <= 1) dig(Math.floor(px) + ox, Math.floor(py) + oy, Math.floor(pz) + oz, roof);
              }
        };
        const RC = ROOM_CELL;
        const tube = (a, b, seed) => {
          const vx = b.x - a.x, vz = b.z - a.z, vy = b.y - a.y, Lh = Math.hypot(vx, vz);
          if (Lh < 1 || Math.abs(vy) > Lh * 0.9) return;                         // too steep to walk: no tunnel
          if (Math.max(a.x, b.x) + 10 < X0 || Math.min(a.x, b.x) - 10 > X0 + 15 || Math.max(a.z, b.z) + 10 < Z0 || Math.min(a.z, b.z) - 10 > Z0 + 15) return;
          const nx = -vz / Lh, nz = vx / Lh, L = Math.hypot(Lh, vy);
          const amp = 2 + 5 * hash2(seed, 77), ph = hash2(seed, 91) * 6.283, waves = 1 + ((hash2(seed, 13) * 2) | 0);
          const rad = 1.3 + 0.9 * hash2(seed, 55);
          for (let s = 0; s <= L; s += 0.8) {
            const t = s / L, env = Math.sin(t * Math.PI), off = Math.sin(t * Math.PI * waves + ph) * amp * env;
            blob(a.x + vx * t + nx * off, a.y + vy * t + Math.sin(t * Math.PI * 2 + ph) * 2 * env, a.z + vz * t + nz * off, rad, -1);
          }
        };
        for (let gz = Math.floor((Z0 - 10) / RC) - 2; gz <= Math.floor((Z0 + 25) / RC); gz++)
          for (let gx = Math.floor((X0 - 10) / RC) - 2; gx <= Math.floor((X0 + 25) / RC); gx++) {
            const rm = roomOf(gx, gz);
            if (!rm) continue;
            const R = rm.r * 1.2 + 1;
            if (rm.x + R >= X0 && rm.x - R <= X0 + 15 && rm.z + R >= Z0 && rm.z - R <= Z0 + 15)
              for (let gz2 = Math.floor(rm.z - R); gz2 <= rm.z + R; gz2++)
                for (let gx2 = Math.floor(rm.x - R); gx2 <= rm.x + R; gx2++) {
                  if (gx2 < X0 || gx2 > X0 + 15 || gz2 < Z0 || gz2 > Z0 + 15) continue;
                  const dx = (gx2 + 0.5 - rm.x) / rm.r, dz = (gz2 + 0.5 - rm.z) / rm.r, d2 = dx * dx + dz * dz;
                  if (d2 > 1.44) continue;
                  for (let gy = Math.floor(rm.y - rm.ry * 0.7); gy <= rm.y + rm.ry * 1.25; gy++) {
                    const dy = (gy + 0.5 - rm.y) / rm.ry;
                    if (dy < -0.62) continue;                                     // a flat floor
                    const wob = 1 + 0.2 * vnoise3(gx2 * 0.22, gy * 0.22, gz2 * 0.22);
                    if (d2 + dy * dy <= wob * wob) dig(gx2, gy, gz2, -1);
                  }
                }
            if (hash2(gx * 61 + 5, gz * 67 - 5) < 0.7) { const e = roomOf(gx + 1, gz); if (e) tube(rm, e, gx * 73 + gz * 79 + 1); }
            if (hash2(gx * 71 - 5, gz * 59 + 5) < 0.7) { const s = roomOf(gx, gz + 1); if (s) tube(rm, s, gx * 83 - gz * 89 + 2); }
          }
        // cave mouths and arches, from the foot of a slope into the hill
        const MC = MOUTH_CELL, REACH = 56;
        for (let gz = Math.floor((Z0 - REACH) / MC); gz <= Math.floor((Z0 + 15 + REACH) / MC); gz++)
          for (let gx = Math.floor((X0 - REACH) / MC); gx <= Math.floor((X0 + 15 + REACH) / MC); gx++) {
            const m = mouthOf(gx, gz);
            if (!m || m.x + REACH < X0 || m.x - REACH > X0 + 15 || m.z + REACH < Z0 || m.z - REACH > Z0 + 15) continue;
            for (const [x, y, z, roof] of m.path) blob(x, y, z, m.rad, roof);
          }
        // the mountains' halls, their ways out and their deep shafts, and tunnels between neighbouring halls (rev 22)
        if (DESERT3) {
          const MR = 80;
          for (let gz = Math.floor((Z0 - MR) / MT_CELL); gz <= Math.floor((Z0 + 15 + MR) / MT_CELL); gz++)
            for (let gx = Math.floor((X0 - MR) / MT_CELL); gx <= Math.floor((X0 + 15 + MR) / MT_CELL); gx++) {
              const cv = mtCaveOf(gx, gz);
              if (!cv) continue;
              const R = cv.r * 1.25 + 1;
              if (cv.x + R >= X0 && cv.x - R <= X0 + 15 && cv.z + R >= Z0 && cv.z - R <= Z0 + 15)
                for (let gz2 = Math.floor(cv.z - R); gz2 <= cv.z + R; gz2++)
                  for (let gx2 = Math.floor(cv.x - R); gx2 <= cv.x + R; gx2++) {
                    if (gx2 < X0 || gx2 > X0 + 15 || gz2 < Z0 || gz2 > Z0 + 15) continue;
                    const dx = (gx2 + 0.5 - cv.x) / cv.r, dz = (gz2 + 0.5 - cv.z) / cv.r, d2 = dx * dx + dz * dz;
                    if (d2 > 1.56) continue;
                    for (let gy = Math.floor(cv.y - cv.ry * 0.7); gy <= cv.y + cv.ry * 1.3; gy++) {
                      const dy = (gy + 0.5 - cv.y) / cv.ry;
                      if (dy < -0.5) continue;                                      // a flat floor
                      const wob = 1 + 0.22 * vnoise3(gx2 * 0.18, gy * 0.2, gz2 * 0.18);
                      if (d2 + dy * dy <= wob * wob) dig(gx2, gy, gz2, -1);
                    }
                  }
              for (const ex of cv.exits) for (const [x, y, z, roof] of ex) blob(x, y, z, 1.7, roof);
              for (const [x, y, z] of cv.deep) blob(x, y, z, cv.dr, -1);
              if (hash2(gx * 41 + 3, gz * 43 - 3) < 0.6) { const e = mtCaveOf(gx + 1, gz); if (e) tube(cv, e, gx * 97 + gz * 101 + 5); }
              if (hash2(gx * 47 - 3, gz * 53 + 3) < 0.6) { const s = mtCaveOf(gx, gz + 1); if (s) tube(cv, s, gx * 103 - gz * 107 + 6); }
            }
        }
        // overhangs: along some cliffs (a drop of 6+ to a side) the face is cut back under its lip, two columns deep in places
        for (let z = 0; z < 16; z++)
          for (let x = 0; x < 16; x++) {
            const gi = (x + 2) + (z + 2) * 20, h = H[gi];
            if (h < WLV[gi] || DES[gi]) continue;
            const wx = X0 + x, wz = Z0 + z;
            if (fbm(wx * 0.05 + 3713.1, wz * 0.05 - 1291.7, 2) < 0.05) continue;
            for (const d of [1, -1, 20, -20]) {
              let low = Math.max(H[gi + d], WLV[gi + d]), depth = 1;
              if (h - low < 6 && H[gi + d] >= h - 1) { low = Math.max(H[gi + 2 * d], WLV[gi + 2 * d]); depth = 2; }
              if (h - low < 6) continue;
              const k = Math.min(h - low - 3, 2 + ((hash2(wx * 3 + d, wz * 5 - d) * 3) | 0)) - (depth - 1);
              for (let y = low + 1; y <= low + k; y++) {
                const i = idx(x, y, z), b = data[i] & 255;
                if (b !== B.WATER && b !== B.LAVA && b !== B.BEDROCK && b !== B.ICE) data[i] = B.AIR;
              }
            }
          }
      }

      // ---- cave lava pools (pool-seeded grid, bowl-shaped multi-y crater) ----
      // 22×22 cells, 22% chance each, radius up to ~6 blocks. Per-cell pool y is deterministic;
      // each column within radius carves a lava column from (poolY - bowlDepth) up to poolY, with
      // bowlDepth tapering parabolically from ~4 at the centre to 0 at the rim → looks like a
      // real crater/pond, not a flat slab. Rim pass fills air side-neighbors with stone.
      {
        const PCELL = 22, PR = 6, PR2 = PR * PR;
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const gcx = Math.round(wx / PCELL), gcz = Math.round(wz / PCELL);
          const ddx = wx - gcx * PCELL, ddz = wz - gcz * PCELL;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > PR2) continue;
          if (hash2(gcx * 31 + 5501, gcz * 37 + 6601) > 0.08) continue;
          const poolY = 5 + Math.floor(hash2(gcx * 71 + 2201, gcz * 73 + 3301) * 40);   // 5..44
          // parabolic bowl: deeper in middle, 0 at edge
          const t = 1 - d2 / PR2;
          const bowlDepth = Math.max(0, Math.floor(4 * t * t));
          const y0 = poolY - bowlDepth, y1 = poolY;
          for (let y = y0; y <= y1; y++) {
            const cur = data[idx(x, y, z)] & 255;
            if (cur === B.AIR || cur === B.STONE) data[idx(x, y, z)] = B.LAVA;
          }
        }
        // rim: side-neighbours of any lava cell that are air become stone (dam flow)
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) for (let y = 3; y < 48; y++) {
          if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
          for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + ndx, nz = z + ndz;
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
            if ((data[idx(nx, y, nz)] & 255) === B.AIR) data[idx(nx, y, nz)] = B.STONE;
          }
        }
      }

      // ---- surface lava ponds (crater-shape, biome-biased, cross-chunk consistent) ----
      // Uses terrainInfo(wx,wz) — a pure noise function — for every decision (rim y, biome bias,
      // flatness, water proximity), so any chunk overlapping a pool computes IDENTICAL results.
      // No dependence on the local chunk's H array or data grid → no seams, no floating lava.
      // Chances reduced 90% from 0.582; hill/mountain terrain rejected via rim y cap + flatness.
      {
        const PCELL = 40, PR = 6, PR2 = PR * PR;
        // deterministic per-pool center info, cached
        const centerCache = new Map();
        const centerInfo = (gcx, gcz) => {
          const k = gcx + ',' + gcz;
          if (centerCache.has(k)) return centerCache.get(k);
          const ti = terrainInfo(gcx * PCELL, gcz * PCELL);
          centerCache.set(k, ti);
          return ti;
        };
        // flatness + water-clearance check at pool center. Samples 4 rim points and 4 diagonals.
        const poolOkCache = new Map();
        const poolOk = (gcx, gcz, rimY) => {
          const k = gcx + ',' + gcz;
          if (poolOkCache.has(k)) return poolOkCache.get(k);
          let ok = true;
          const OFF = [[PR,0],[-PR,0],[0,PR],[0,-PR],[PR,PR],[-PR,-PR],[PR,-PR],[-PR,PR]];
          for (const [dx, dz] of OFF) {
            const ti = terrainInfo(gcx * PCELL + dx, gcz * PCELL + dz);
            if (Math.abs(ti.h - rimY) > 3) { ok = false; break; }        // hilly / mountainous
            if (ti.h <= ti.wl + 3) { ok = false; break; }               // beach / ocean / a lake up in the land nearby
          }
          poolOkCache.set(k, ok);
          return ok;
        };
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const gcx = Math.round(wx / PCELL), gcz = Math.round(wz / PCELL);
          const ddx = wx - gcx * PCELL, ddz = wz - gcz * PCELL;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > PR2) continue;
          const ci = centerInfo(gcx, gcz);
          const isDesertC = ci.fDesert > 0.5, isSnowC = ci.fSnow > 0.5;
          // 0.8444 (LAVA2, new worlds): a fifth more in warm land short of the desert (warm plains, the Dryland)
          const isWarmC = LAVA2 && !isDesertC && (ci.lvl || 0) >= 0.5;
          const chance = isSnowC ? 0.0002 : isDesertC ? 0.01 : isWarmC ? 0.0024 : 0.002;
          if (hash2(gcx * 41 + 7001, gcz * 43 + 7101) > chance) continue;
          const rimY = ci.h;
          if (rimY <= WATER_LEVEL + 3 || rimY <= ci.wl + 3) continue;    // no ocean/beach altitude, no lake up in the land
          if (rimY > 110) continue;                                      // no hills/mountains
          if (!poolOk(gcx, gcz, rimY)) continue;                         // reject if not flat / near water
          const t = 1 - d2 / PR2;
          const bowlDepth = Math.max(0, Math.floor(3 * t * t));
          const y0 = rimY - bowlDepth, y1 = rimY;
          for (let y = y0; y <= y1; y++) {
            if (y < 2 || y > CY - 1) continue;
            const cur = data[idx(x, y, z)] & 255;
            if (cur !== B.WATER && cur !== B.BEDROCK) data[idx(x, y, z)] = B.LAVA;
          }
          if (rimY + 1 <= CY - 1) {
            const above = data[idx(x, rimY + 1, z)] & 255;
            if (above !== B.WATER && above !== B.AIR) data[idx(x, rimY + 1, z)] = B.AIR;
          }
        }
        // rim: any side-neighbour of a lava cell that is air, grass, sand, red sand or dirt gets
        // replaced with stone — pool never touches grass or sand.
        const rimReplace = new Set([B.AIR, B.GRASS, B.SAND, B.RED_SAND, B.DIRT]);
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) for (let y = 60; y < CY - 1; y++) {
          if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
          for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + ndx, nz = z + ndz;
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
            const nb = data[idx(nx, y, nz)] & 255;
            if (rimReplace.has(nb)) data[idx(nx, y, nz)] = B.STONE;
          }
          // also convert the block directly ABOVE the pool's top rim if it's grass/sand (looks weird
          // touching lava). Only for the top-most lava cell of each column.
          if ((data[idx(x, y + 1, z)] & 255) === B.AIR || (data[idx(x, y + 1, z)] & 255) === B.WATER) {
            // this y is the surface: convert diagonal-top grass/sand within-chunk to stone
            for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx = x + ndx, nz = z + ndz;
              if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
              const above = data[idx(nx, y + 1, nz)] & 255;
              if (above === B.GRASS || above === B.SAND || above === B.RED_SAND)
                data[idx(nx, y + 1, nz)] = B.STONE;
            }
          }
        }
      }

      /* ---- glow vines: strands hanging down cave walls, lighting the tunnels. A rare roll
         per open cave cell picks one side; if that side is rock, a strand of 2-6 hangs down it for
         as long as the rock face and the open air beside it both last. ---- */
      {
        const VINE_WALLS = [[0, -1, 0], [0, 1, 1], [-1, 0, 2], [1, 0, 3]];   // [dx, dz, variant]
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const top = Math.min(H[(x + 2) + (z + 2) * 20] - 6, 90);
            for (let y = 8; y < top; y++) {
              if ((data[idx(x, y, z)] & 255) !== B.AIR) continue;
              if (hash3(cx * 1543 + x, y + 7000, cz * 1327 + z) >= 0.005) continue;   // ~3x as common
              const w = VINE_WALLS[Math.floor(hash3(cx * 1543 + x, y + 7100, cz * 1327 + z) * 4) & 3];
              const wx = x + w[0], wz = z + w[1];
              if (wx < 0 || wx > 15 || wz < 0 || wz > 15) continue;
              const len = 2 + Math.floor(hash3(cx * 1543 + x, y + 7200, cz * 1327 + z) * 5);
              for (let k = 0; k < len && y - k > 2; k++) {
                if ((data[idx(x, y - k, z)] & 255) !== B.AIR || (data[idx(wx, y - k, wz)] & 255) !== B.STONE) break;
                data[idx(x, y - k, z)] = B.GLOW_VINE | (w[2] << 8);
              }
            }
          }
      }

      /* ---- cobwebs: strung in cave corners. A rare roll per open cave cell, kept only where at
         least two sides are rock, so a web sits in a nook — on the floor, a wall or the ceiling. ---- */
      {
        const WEB_NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const top = Math.min(H[(x + 2) + (z + 2) * 20] - 6, 95);
            for (let y = 4; y < top; y++) {
              if ((data[idx(x, y, z)] & 255) !== B.AIR) continue;
              if (hash3(cx * 1601 + x, y + 8000, cz * 1409 + z) >= 0.0025) continue;
              let rock = 0;
              for (const [dx, dy, dz] of WEB_NB) {
                const nx = x + dx, nz = z + dz;
                if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
                if ((data[idx(nx, y + dy, nz)] & 255) === B.STONE) rock++;
              }
              if (rock >= 2) data[idx(x, y, z)] = B.COBWEB;   // still hung in nooks; the pass at the end makes sure
            }
          }
      }

      // ---- sulfur deposits ----
      // Two spawn modes:
      //   (a) under lava: 5-10 blocks below any lava cell, replace stone with a small cluster,
      //       tips (up on top of a block below air, down on ceiling above air) spawn frequently.
      //   (b) random single blocks: 0.05% per stone cell in y=30..80, peak density around y=48..50.
      //       Rare occasional tip on top/bottom.
      {
        // Sulfur block spawn rules:
        //   * must sit in stone
        //   * must have AIR directly above or below (cave-visible)
        //   * no lava or water in any of 6 neighbors (never touches liquids)
        // After the block is placed, try to grow a tip into the adjacent air on the exposed face.
        const inBounds = (nx, ny, nz) =>
          nx >= 0 && nx <= 15 && nz >= 0 && nz <= 15 && ny >= 0 && ny <= CY - 1;
        const idAt = (nx, ny, nz) => inBounds(nx, ny, nz) ? (data[idx(nx, ny, nz)] & 255) : -1;
        const placeSulfur = (bx, by, bz, tipHash) => {
          if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 3) return;
          if ((data[idx(bx, by, bz)] & 255) !== B.STONE) return;
          const airTop = idAt(bx, by + 1, bz) === B.AIR;
          const airBot = idAt(bx, by - 1, bz) === B.AIR;
          if (!airTop && !airBot) return;                        // must be cave-exposed via top or bottom
          // reject if any neighbor is lava or water
          const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
          for (const [dx, dy, dz] of DIRS) {
            const nb = idAt(bx + dx, by + dy, bz + dz);
            if (nb === B.LAVA || nb === B.WATER) return;
          }
          data[idx(bx, by, bz)] = B.SULFUR_BLOCK;
          // try to grow a tip on each exposed face (50% chance each). tipHash provides variety.
          if (airTop && (tipHash === undefined || tipHash < 0.5))
            data[idx(bx, by + 1, bz)] = B.SULFUR_UP_TIP;
          if (airBot && (tipHash === undefined || tipHash >= 0.5))
            data[idx(bx, by - 1, bz)] = B.SULFUR_UP_TIP | (1 << 8);   // variant 1 = down orientation
        };
        // (a) under-lava clusters
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          for (let y = 3; y < 190; y++) {
            if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
            const wx = cx * 16 + x, wz = cz * 16 + z;
            const depth = 2 + Math.floor(hash3(wx * 29 + 12001, y * 7 + 3, wz * 31 + 12001) * 9);   // 2..10
            const cy = y - depth;
            if (cy < 3) continue;
            const clusterN = 3 + Math.floor(hash3(wx * 41 + 13001, y * 11 + 5, wz * 37 + 13001) * 4);
            for (let k = 0; k < clusterN; k++) {
              const ox = Math.floor(hash3(wx * 53 + k, cy + 7 * k, wz * 47 + k * 3) * 3) - 1;
              const oy = Math.floor(hash3(wx * 61 + k * 5, cy * 3 + k, wz * 59 + k) * 3) - 1;
              const oz = Math.floor(hash3(wx * 67 + k * 7, cy + k * 11, wz * 71 + k * 5) * 3) - 1;
              const tipH = hash3(wx * 79 + k, cy + k * 13, wz * 83 + k * 5);
              placeSulfur(x + ox, cy + oy, z + oz, tipH);
            }
            break;   // one cluster per column max
          }
        }
        // (b) rare single blocks y=30..80, peak 48..50
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          for (let y = 30; y <= 80; y++) {
            if ((data[idx(x, y, z)] & 255) !== B.STONE) continue;
            const d = (y - 49) / 10;
            const weight = Math.exp(-d * d);
            const chance = 0.0005 * (0.3 + 0.7 * weight);
            if (hash3(wx * 89 + 14001, y * 19 + 7, wz * 97 + 14001) < chance) {
              const tipH = hash3(wx * 103, y * 23, wz * 107);
              placeSulfur(x, y, z, tipH);
            }
          }
        }
      }

      /* ---- gem clusters ----
         Each gem keeps the depth band its ore vein had. A try picks a column and a height in that band, then
         looks up and down from there for the nearest open cave cell touching rock, and grows the cluster out
         of that rock: floor, ceiling or wall, whichever it touches (a coin picks between several). A cell
         open to the sky does not count — except for emerald, which has always lived in mountain rock. */
      {
        const GEMS = [
          // [id,          tries, bestLo, bestHi, rangeLo, rangeHi, sky ok]
          [B.DIAMOND_ORE,   3,     15,     20,      3,      30,   false],
          [B.EMERALD_ORE,   5,    150,    160,    120,     196,   true ],
          [B.RUBY_ORE,      4,     43,     47,     30,      70,   false],
          [B.SAPPHIRE_ORE,  4,     93,     97,     80,     130,   false],
          [B.TOPAZ_ORE,     4,     78,     82,     60,     100,   false],
        ];
        const CLUSTER_TRY_CHANCE = 0.05;
        const rockAt = (x, y, z) => {
          if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y > CY - 2) return false;
          const p = PROPS[data[idx(x, y, z)] & 255];
          return !!p && !!p.opaque && p.type === 'stone';
        };
        const underRoof = (x, y, z) => {
          for (let yy = y + 1; yy < CY; yy++) if (PROPS[data[idx(x, yy, z)] & 255]?.opaque) return true;
          return false;
        };
        for (let gi = 0; gi < GEMS.length; gi++) {
          const [gem, tries, bestLo, bestHi, rangeLo, rangeHi, skyOk] = GEMS[gi];
          for (let t = 0; t < tries; t++) {
            const s = 21000 + gi * 101 + t * 7;
            // 95% of tries never happen: 0.7945's rate put far too many clusters in every cave
            if (hash3(cx * 61 + s, 17, cz * 67 + s) >= CLUSTER_TRY_CHANCE) continue;
            const lx = (hash3(cx * 31 + s, 3, cz * 29 + s) * 16) | 0;
            const lz = (hash3(cx * 37 + s, 5, cz * 41 + s) * 16) | 0;
            const inBest = hash3(cx + s, 7, cz + s * 3) < 0.7;
            const ly0 = inBest ? bestLo + ((hash3(cx * 13 + s, 9, cz * 11 + s) * (bestHi - bestLo + 1)) | 0)
                               : rangeLo + ((hash3(cx * 17 + s, 13, cz * 19 + s) * (rangeHi - rangeLo + 1)) | 0);
            for (let k = 0; k <= 24; k++) {
              const ly = ly0 + ((k & 1) ? -((k + 1) >> 1) : (k >> 1));   // 0, -1, +1, -2, +2 ...
              if (ly < 2 || ly > CY - 3 || ly < rangeLo - 4 || ly > rangeHi + 4) continue;
              if (data[idx(lx, ly, lz)] !== B.AIR) continue;
              const opts = [];
              for (let o = 0; o < 6; o++) {
                const d = CLUSTER_DIRS[o];
                if (rockAt(lx - d[0], ly - d[1], lz - d[2])) opts.push(o);
              }
              if (!opts.length) continue;
              if (!skyOk && !underRoof(lx, ly, lz)) break;
              const o = opts[(hash3(cx * 43 + s, ly, cz * 47 + s) * opts.length) | 0];
              const lay = (hash3(cx * 53 + s, ly + 1, cz * 59 + s) * CLUSTER_LAYOUTS) | 0;   // which look
              // its bed is the rock it grows on: stone, granite, marble, limestone; on anything else its ore
              const d = CLUSTER_DIRS[o], rock = data[idx(lx - d[0], ly - d[1], lz - d[2])] & 255;
              const bed = CLUSTER_BED_OF[rock] || 0;
              data[idx(lx, ly, lz)] = gem | ((o | (lay << 3) | (bed << CLUSTER_BED_SHIFT)) << 8);
              break;
            }
          }
        }
      }

      }   // end !FLAT underground section
});
