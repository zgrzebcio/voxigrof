'use strict';
/* worldgen/terrain-columns.js: the chunk's ground. The grids of height, water and climate round the chunk (with a
   margin, so trees and banks agree across borders), then every column filled from bedrock to its top block.
   First part of genChunk's body (worldgen/gen-chunk.js): the parts after it use its grids (H, the water levels...). */

corePart('gen.chunk', function () {
      const data = new Uint32Array(CX * CY * CZ);
      const H = new Int16Array(400);                           // heights incl. 2-block margin
      const DES = new Uint8Array(400);                         // desert surface flag
      const RED = new Uint8Array(400);                         // red-sand desert flag
      const ROCK = new Uint8Array(400);                        // rocky desert-hill top flag
      const SNO = new Uint8Array(400);                         // snowy (cold biome) surface flag
      const DSNO = new Uint8Array(400);                        // deep snow, the coldest level: more of it solid
      const WARM = new Float32Array(400);                      // how far into hot climate, 0..1 (pink beaches)
      const TAIGA = new Uint8Array(400);                       // spruce forest / cold plains
      const TREE = new Float32Array(400);                      // tree density factor (0 in plains/desert)
      const LVL = new Float32Array(400);                       // climate level, -3 deep snow .. 3 red sand (CLIMATE_LADDER)
      const SPK = new Uint8Array(400);                         // the Ice Spikes biome
      const CLF = new Float32Array(400);                       // a rocky coast, 0..1 (cliffAt in biomes/fields.js)
      const RIM = new Uint8Array(400);                         // the Coldest Deep Snow (fRime in biomes/terrain.js)
      const RIMF = new Float32Array(400);                      // ...how far into it, 0..1 (its canyons fade out)
      const DDS = new Uint8Array(400);                         // the Deep Desert (0.84, fDeepD in biomes/terrain.js)
      const OAS = new Uint8Array(400);                         // an oasis's land and water (0.84, oas in 55): not desert
      const DDK = new Uint8Array(400);                         // the Deep Desert's half, ddStrata's kind
      const DRYF = new Float32Array(400);                      // how far into the Dryland, 0..1 (fDry in 55)
      // wider wet grid (32x32, 8-block margin) so beach width can vary per water type:
      // ocean 4..8 blocks, river/lake 2..4. WW cells: 0 dry, 1 ocean, 2 river/lake.
      // (WG x WG with a WM margin since 0.83547: 32 and 8 before rev 14)
      const WW = new Uint8Array(WG * WG);
      /* each column's top water y (rev 15: a river or lake up in the land has its own; the sea's is WATER_LEVEL),
         on the grid (WLG) and the 20x20 (WLV); HIWET: some of it stands above the sea's */
      const WLG = new Int16Array(WG * WG), WLV = new Int16Array(400), FDV = new Uint8Array(400);   // FDV: a river's way, 1-8
      const FFV = new Uint8Array(400);                                                                // FFV: it runs fast
      const HG = new Int16Array(WG * WG), RVG = new Uint8Array(WG * WG), FDG = new Uint8Array(WG * WG);   // the grid's ground, a river's water and way
      let HIWET = false, HIWL = WATER_LEVEL;
      (() => {   // own function: see SPEED in worldgen/gen-chunk.js
      for (let gz = 0; gz < WG; gz++)
        for (let gx = 0; gx < WG; gx++) {
          const wx = cx * 16 + gx - WM, wz = cz * 16 + gz - WM;
          const inner = gx >= WM - 2 && gx <= WM + 17 && gz >= WM - 2 && gz <= WM + 17;
          /* the wet grid's five numbers of a column outside the 20 x 20 come from the column cache when some chunk worked
             them out already (worldgen/column-cache.js); the 20 x 20 needs all of terrainInfo and puts its five in */
          const cached = inner ? -1 : colGet(wx, wz);
          let ti = null, h, wl, ww, rv, fd;
          if (cached >= 0) {
            h = cached & 255; wl = (cached >> 8) & 255; ww = (cached >> 16) & 3; rv = (cached >> 18) & 1; fd = (cached >> 19) & 15;
          } else {
            ti = terrainInfo(wx, wz);
            h = ti.h; wl = ti.wl; ww = 0;
            if (h < wl) ww = (ti.rT > 0.3 || ti.lk > 0.3) ? 2 : 1;
            rv = ww && ti.rT > ti.lk ? 1 : 0; fd = ti.fd || 0;
            colPut(wx, wz, h, wl, ww, rv, fd);
          }
          WW[gx + gz * WG] = ww;
          WLG[gx + gz * WG] = wl;
          HG[gx + gz * WG] = h;
          RVG[gx + gz * WG] = rv;
          FDG[gx + gz * WG] = fd;
          if (ww && wl > WATER_LEVEL) { HIWET = true; HIWL = Math.max(HIWL, wl); }
          if (inner) {
            const i = (gx - WM + 2) + (gz - WM + 2) * 20;
            H[i] = ti.h;
            WLV[i] = ti.wl;
            FDV[i] = ti.fd || 0;
            FFV[i] = ti.ff ? 1 : 0;
            OAS[i] = DESERT2 && ti.oas > 0.5 ? 1 : 0;
            DDS[i] = DESERT2 && ti.fDeepD > 0.5 ? 1 : 0;
            DES[i] = ti.fDesert > 0.5 && !OAS[i] ? 1 : 0;        // an oasis is green, not sand
            DDK[i] = DDS[i] && DESERT3 ? (ti.ddRed > 0.5 ? 2 : 1) : 0;
            DRYF[i] = DRYLAND ? ti.fDry : 0;
            RED[i] = ti.fRed > 0.5 && DDK[i] !== 1 ? 1 : 0;      // the (yellow) Deep Desert's half is not red
            ROCK[i] = (ti.dh > 0.5 && ti.fRed <= 0.5 && !OAS[i]) ? 1 : 0;   // tall desert hills expose stone (not in red zones)
            SNO[i] = ti.fSnow > 0.5 ? 1 : 0;
            DSNO[i] = ti.fDeepSnow > 0.5 ? 1 : 0;
            WARM[i] = LADDER ? ti.warm : ti.fDesert;              // on the ladder the warm plains' beaches
            TAIGA[i] = ti.fTaiga > 0.5 ? 1 : 0;
            TREE[i] = 1 - ti.fPlains;
            LVL[i] = ti.lvl;
            RIMF[i] = RIME ? ti.fRime : 0;
            RIM[i] = RIMF[i] > 0.5 ? 1 : 0;
            SPK[i] = SPIKES && !RIM[i] && ti.fSnow > 0.5 && ti.h <= 132 && iceSpikesAt(cx * 16 + gx - WM, cz * 16 + gz - WM) ? 1 : 0;
            CLF[i] = ti.cliff || 0;
          }
        }
      })();
      (() => {   // own function: see SPEED in worldgen/gen-chunk.js
      // no puddles (rev 14): a pond the grid sees whole, under POND_MIN cells (8-connected), is dry land at the water's level
      if (HILLS) {
        const seen = new Uint8Array(WG * WG), stack = [], cells = [];
        for (let s = 0; s < WG * WG; s++) {
          if (!WW[s] || seen[s]) continue;
          seen[s] = 1; stack.push(s); cells.length = 0;
          let edge = false;
          while (stack.length) {
            const c = stack.pop(), gx = c % WG, gz = (c / WG) | 0;
            cells.push(c);
            if (gx === 0 || gz === 0 || gx === WG - 1 || gz === WG - 1) edge = true;
            for (let dz = -1; dz <= 1; dz++)
              for (let dx = -1; dx <= 1; dx++) {
                const nx = gx + dx, nz = gz + dz;
                if (nx < 0 || nz < 0 || nx >= WG || nz >= WG) continue;
                const n = nx + nz * WG;
                if (WW[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
              }
          }
          if (edge || cells.length >= POND_MIN) continue;
          for (const c of cells) {
            WW[c] = 0;
            const hx = c % WG - WM + 2, hz = ((c / WG) | 0) - WM + 2;
            if (hx >= 0 && hx < 20 && hz >= 0 && hz < 20) H[hx + hz * 20] = WLG[c];
          }
        }
      }
      })();
      (() => {   // own function: see SPEED in worldgen/gen-chunk.js
      /* no slivers (rev 17): a patch of water at one level (4-connected, under POND_MIN cells, seen whole) that
         stands over lower water beside it - the edge of one lake poking past another's - takes the lower water's level,
         and where its ground stands at or over that, is dry. Judged alike by every chunk, as the ponds are. */
      if (FALLS) {
        const seen = new Uint8Array(WG * WG), stack = [], cells = [];
        for (let s = 0; s < WG * WG; s++) {
          if (!WW[s] || seen[s]) continue;
          const lv = WLG[s];
          seen[s] = 1; stack.push(s); cells.length = 0;
          let edge = false, low = lv;
          while (stack.length) {
            const c = stack.pop(), gx = c % WG, gz = (c / WG) | 0;
            cells.push(c);
            if (gx === 0 || gz === 0 || gx === WG - 1 || gz === WG - 1) edge = true;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = gx + dx, nz = gz + dz;
              if (nx < 0 || nz < 0 || nx >= WG || nz >= WG) continue;
              const n = nx + nz * WG;
              if (!WW[n]) continue;
              if (WLG[n] === lv) { if (!seen[n]) { seen[n] = 1; stack.push(n); } }
              else if (WLG[n] < low) low = WLG[n];
            }
          }
          if (edge || cells.length >= POND_MIN || low >= lv) continue;
          for (const c of cells) {
            WLG[c] = low;
            const hx = c % WG - WM + 2, hz = ((c / WG) | 0) - WM + 2, inH = hx >= 0 && hx < 20 && hz >= 0 && hz < 20;
            if (inH) WLV[hx + hz * 20] = low;
            if (HG[c] >= low) {
              /* rev 18: cut down into the lower water instead of left a dry knob (which the containment then
                 raised into a pillar between a fall's sheets); rev 17 left it dry */
              if (DIVIDE) { HG[c] = low - 1; if (inH) H[hx + hz * 20] = low - 1; }
              else WW[c] = 0;
            }
          }
        }
        /* where a lake's water meets lower water (two lakes, or a lake and the sea, met at their edges) a bar of its shore
           holds it back, its ground raised to the lake's top; a river does the same where water 2+ under it lies at its
           side (another river's lake it runs by): only straight down its way does a river fall (the curtains at the end) */
        const bar = [];
        for (let s = 0; s < WG * WG; s++) {
          if (!WW[s]) continue;
          const gx = s % WG, gz = (s / WG) | 0, fd = RVG[s] ? FDG[s] : 0;
          const fa = (fd - 1) * Math.PI / 4, fx = fd ? Math.cos(fa) : 0, fz = fd ? Math.sin(fa) : 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = gx + dx, nz = gz + dz;
            if (nx < 0 || nz < 0 || nx >= WG || nz >= WG) continue;
            const n = nx + nz * WG;
            if (!WW[n] || WLG[n] >= WLG[s]) continue;
            // rev 18: the divides keep apart waters that are not kin, so only a lake meeting the sea needs a bar;
            // a river falls whichever way its lip runs
            if (DIVIDE) { if (!RVG[s] && WLG[n] === WATER_LEVEL && !RVG[n]) { bar.push(s); break; } continue; }
            if (!RVG[s] || (WLG[n] <= WLG[s] - 2 && dx * fx + dz * fz < 0.4)) { bar.push(s); break; }
          }
        }
        for (const s of bar) {
          WW[s] = 0; HG[s] = WLG[s];
          const hx = s % WG - WM + 2, hz = ((s / WG) | 0) - WM + 2;
          if (hx >= 0 && hx < 20 && hz >= 0 && hz < 20) H[hx + hz * 20] = WLV[hx + hz * 20];
        }
      }

      })();
      (() => {   // own function: see SPEED in worldgen/gen-chunk.js
      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          const wx = cx * 16 + x, wz = cz * 16 + z;
          // surface material: grass/dirt on land, sand on beaches/seafloor/deserts, stone caps on
          // desert hills, clay+dirt patches on the seabed, snowy grass (+snow cap) in cold biomes
          let topB, underB, snowCap = false;
          // altitude at which solid snow starts winning over carpet (see the snowCap block below)
          const SNOW_SOLID_Y = WATER_LEVEL + 26;
          // beach mask: for above-water columns near shore level, sand only if the nearest
          // wet column is closer than that water type's beach width. Ocean beaches vary 4..8,
          // river/lake beaches 2..4, both from a low-freq noise so widths change by region.
          let nearWater = false;
          /* Shores (rev 13): the coast's kind (shoreKindAt in biomes/fields.js: 0 turf to the water, 1 sand, 2 gravel), a rocky
             one where the cliffs rise (`rock`: stone from the water a few blocks in, up the cliff's face), and beaches a
             ragged 1-6 wide (shoreWidth). */
          let shore = 1, rock = false;
          const wl = WLV[gi];                                   // this column's top water y
          const shoreTop = SHORES && CLF[gi] > 0.45 ? WATER_LEVEL + (HILLS ? 22 : 16) : WATER_LEVEL + 3;
          // a dry column by the sea's level, or (rev 15) anywhere when this chunk has water up in the land
          if (h >= wl && h >= WATER_LEVEL && (h <= shoreTop || HIWET && h <= HIWL + 3)) {
            const gxw = x + WM, gzw = z + WM;
            let hitType = 0, minD2 = 9999, hitWl = WATER_LEVEL;
            for (let dz = -WM; dz <= WM; dz++)
              for (let dx = -WM; dx <= WM; dx++) {
                const t = WW[(gxw + dx) + (gzw + dz) * WG];
                if (!t) continue;
                const d2 = dx * dx + dz * dz;
                if (d2 < minD2) { minD2 = d2; hitType = t; hitWl = WLG[(gxw + dx) + (gzw + dz) * WG]; }
              }
            if (hitType && SHORES) {
              const dist = Math.sqrt(minD2), w = shoreWidth(wx, wz, hitType);
              // the cliff and the ledge at its foot (no wider for the wider beaches)
              if (hitType === 1 && CLF[gi] > 0.45 && hitWl === WATER_LEVEL) rock = h <= shoreTop && dist < (HILLS ? Math.min(w, 5) : w) + 2;
              else if (h <= hitWl + 3 && h >= hitWl && dist < w) { nearWater = true; shore = OAS[gi] ? 1 : shoreKindAt(wx, wz); }   // an oasis's shore sand
            } else if (hitType) {
              const bn = (fbm(wx * 0.007 + 217.3, wz * 0.007 - 803.7, 2) + 1) * 0.5;
              const width = hitType === 1 ? 2 + bn * 2 : bn * 0.4;
              const dist  = Math.sqrt(minD2);
              const dither = fbm(wx * 0.02 + 401.3, wz * 0.02 - 193.7, 2) * 0.8;
              if (dist < width + dither) nearWater = true;
            }
          }
          /* Rev 14: under the shallow water by a beach its sand or gravel runs on (`under`, a shoreKindAt kind, or
             3 a rocky coast's stone; -1 none, 0 a turf shore keeps the sea floor's patches); and a steep face is bare stone,
             a drop of 4 to a side (3 now and then), the water's top counting as the floor. */
          let under = -1, steep = false;
          if (HILLS && h < wl && h >= wl - (UPLAND ? 6 : 4)) {
            const gxw = x + WM, gzw = z + WM;
            let land = false;
            for (let dz = -5; dz <= 5 && !land; dz++)
              for (let dx = -5; dx <= 5; dx++)
                if (dx * dx + dz * dz <= 25 && !WW[(gxw + dx) + (gzw + dz) * WG]) { land = true; break; }
            if (land) under = CLF[gi] > 0.45 && wl === WATER_LEVEL ? 3 : shoreKindAt(wx, wz);
          } else if (HILLS && h > wl + 1) {
            let low = 1e4;
            for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) low = Math.min(low, Math.max(H[n], WLV[n]));
            /* rev 15: some hills keep their turf, bare only where a drop is 6 or more (`firm` low) */
            const firm = UPLAND ? fbm(wx * 0.0032 + 2129.7, wz * 0.0032 - 4471.3, 2) : 1;
            const need = firm < -0.08 ? 6 : 4;
            steep = h - low >= need || (h - low === need - 1 && hash2(wx * 7 + 1291, wz * 5 - 733) < 0.5);
          }
          if (ROCK[gi] || rock) {
            topB = underB = B.STONE;
          } else if (h < wl || (nearWater && shore !== 0) || DES[gi] === 1) {
            const submerged = h < wl - 1;
            /* a beach's own floor: no clay, dirt or gravel patches. Rev 15: the beach's own block only just under
               the top (all of the first row, about half the second, a few of the third, by a patchy noise), then the shore
               water's floor, more dirt and gravel than sand */
            let beachy = under > 0, mixed = submerged;
            const shoreMix = UPLAND && under >= 0;
            if (shoreMix) {
              const dep = wl - 1 - h, dth = (fbm(wx * 0.11 + 77.1, wz * 0.11 - 31.7, 2) + 1) * 0.5;
              beachy = under > 0 && (dep === 0 || (dep === 1 && dth < 0.55) || (dep === 2 && dth < 0.2));
              mixed = !beachy;
            }
            const clay       = mixed && !beachy && fbm(wx * 0.045 - 205.1, wz * 0.045 + 733.7, 2) > 0.55;  // reduced clay
            const oceanDirt  = mixed && !beachy && !clay && fbm(wx * 0.02 + 911.3, wz * 0.02 + 417.9, 2) > (shoreMix ? -0.1 : 0.12);  // more/larger dirt
            const oceanGravel = mixed && !beachy && !clay && !oceanDirt && fbm(wx * 0.025 + 531.7, wz * 0.025 - 644.3, 2) > (shoreMix ? 0.05 : 0.35);
            topB = underB = clay ? B.CLAY : oceanDirt ? B.DIRT : oceanGravel ? B.GRAVEL
                          : RED[gi] ? B.RED_SAND
                          /* a warm beach: near a desert but not in one, at and just under the waterline, in patches */
                          : (PINK_BEACHES && !DES[gi] && !OAS[gi] && WARM[gi] > 0.2 && h >= wl - 2
                             && fbm(wx * 0.03 + 71.3, wz * 0.03 - 455.1, 2) > 0.1) ? B.PINK_SAND : B.SAND;   // -0.1 before 0.8233: about half as much
            if (shore === 2 && !submerged && !DES[gi]) topB = underB = B.GRAVEL;   // a gravel beach
            if (beachy && under === 2) topB = underB = B.GRAVEL;
            else if (beachy && under === 3) topB = underB = B.STONE;
          } else if (steep) {
            topB = underB = B.STONE; snowCap = !!SNO[gi];        // in the snow it still takes its cover
          } else if (RIM[gi]) {
            /* the Coldest Deep Snow: a floor of snow blocks under drifts the wind has combed into ridges (the
               sastrugi in the snow cover below), and here and there a sheet of bare ice it has swept clean */
            const sheet = fbm(wx * 0.035 - 2711.3, wz * 0.035 + 1913.9, 2) > 0.42;
            topB = sheet ? B.PACKED_ICE : B.SNOW;
            underB = B.DIRT; snowCap = !sheet;
          } else if (SPK[gi]) {
            // the Ice Spikes: a floor of snow blocks with sheets of packed ice in it, no carpet, no grass
            topB = fbm(wx * 0.06 + 1717.1, wz * 0.06 - 2929.3, 2) > 0.3 ? B.PACKED_ICE : B.SNOW;
            underB = B.DIRT;
          } else if (SNO[gi]) {
            topB = B.GRASS | (V.GRASS_SNOWY << 8);  // snowy sides; a snow block caps it below
            underB = B.DIRT; snowCap = true;
          } else {
            topB = B.GRASS; underB = B.DIRT;
            /* the Dryland: pale dry grass (dithered over its edge, so no hard line), bare dry earth in patches */
            if (DRYF[gi] > 0.3 && DRYF[gi] > 0.5 + (hash2(wx * 3 + 811, wz * 7 - 233) - 0.5) * 0.4) {
              topB = fbm(wx * 0.05 + 6121.3, wz * 0.05 - 2333.1, 2) > 0.38 ? B.DIRT : B.GRASS | (V.GRASS_DRY << 8);
            }
          }
          /* The Deep Desert: a column standing 3+ over a side is a bare crag of its banded rock, top to foot, and a
             little of that rock shows through the sand of the flats too */
          let ddBare = false, ddOff = 0;
          if (DDS[gi] && h >= wl) {
            ddOff = Math.round(fbm(wx * 0.013 + 401.7, wz * 0.013 - 233.9, 2) * 3);
            let low = 1e4;
            for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) low = Math.min(low, H[n]);
            ddBare = h - low >= 3 || fbm(wx * 0.05 - 1313.7, wz * 0.05 + 977.1, 2) > 0.45;
          }
          if (FLAT) {
            // 1 bedrock / 19 stone / 4 dirt / 1 grass. A pond column has h below FLAT_TOP, so
            // its dirt loop shortens (or empties) and the surface material logic above has
            // already picked sand/gravel/clay for the bed.
            data[idx(x, 0, z)] = B.BEDROCK;
            for (let y = 1; y <= 19; y++) data[idx(x, y, z)] = B.STONE;
            for (let y = 20; y < h; y++) data[idx(x, y, z)] = underB;
            data[idx(x, h, z)] = topB;
          } else {
          data[idx(x, 0, z)] = B.BEDROCK;
          data[idx(x, 1, z)] = B.BEDROCK;
          /* rev 21: dry desert land is 5 sand deep (the top block and 4 under it) over 5 of sandstone, red under
             red sand, then stone; in the Deep Desert the banded rock from DD_ROCK_FROM up instead, bare on a crag */
          const tb = topB & 255;
          const sandy = DESERT2 && DES[gi] && h >= wl && (tb === B.SAND || tb === B.RED_SAND);
          const dirtFrom = Math.max(2, h - (sandy ? 4 : 5)), ssFrom = sandy ? Math.max(2, h - 9) : dirtFrom;
          const sstone = tb === B.RED_SAND ? B.RED_SANDSTONE : B.SANDSTONE;
          const ddk = DDK[gi];
          for (let y = 2; y < ssFrom; y++) data[idx(x, y, z)] = DDS[gi] && y >= DD_ROCK_FROM ? ddStrata(y, ddOff, ddk) : B.STONE;
          for (let y = ssFrom; y < dirtFrom; y++) data[idx(x, y, z)] = DDS[gi] ? ddStrata(y, ddOff, ddk) : sstone;
          if (ddBare) for (let y = dirtFrom; y <= h; y++) data[idx(x, y, z)] = ddStrata(y, ddOff, ddk);
          else {
            for (let y = dirtFrom; y < h; y++) data[idx(x, y, z)] = underB;
            if (h >= 2) data[idx(x, h, z)] = topB;
          }
          }
          // a snowy beach, gravel or rock shore lies under one layer of snow: the snow's own cover stops at them
          if (SHORES && SNO[gi] && !snowCap && h >= wl && h + 1 <= CY - 1) {
            const t = topB & 255;
            if (t === B.SAND || t === B.GRAVEL || t === B.STONE || t === B.PINK_SAND || t === B.RED_SAND)
              data[idx(x, h + 1, z)] = layerVal(B.SNOW, 1);
          }
          if (snowCap && h + 1 <= CY - 1) {
            // Pattern-driven snow cover:
            //  - biome edge (non-SNO neighbor): thin 1-layer carpet, keeps a crisp biome seam
            //  - steep terrain (neighbour Δh ≥ 2): thick 4-5 layer carpet, reads like a snow drift
            //  - interior: fbm patch noise decides full snow vs tapered carpet.
            //    Layer count fades 5..1 as patch rises above the full-block threshold, so cells
            //    bordering full SNOW blocks always come in at ~5 layers for a smooth blend.
            let bioEdge = false, steep = false;
            for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
              const ngi = (x + 2 + ndx) + (z + 2 + ndz) * 20;
              if (!SNO[ngi]) { bioEdge = true; break; }
              if (Math.abs(H[ngi] - h) >= 2) steep = true;
            }
            if (bioEdge) {
              data[idx(x, h + 1, z)] = layerVal(B.SNOW, 1);
            } else if (steep) {
              const thick = 5 + Math.floor(hash2(wx * 17 + 331, wz * 19 + 733) * 3);   // 5..7 of 8
              data[idx(x, h + 1, z)] = layerVal(B.SNOW, thick);
            } else if (RIM[gi]) {
              /* sastrugi: the drifts combed across the wind's way (rimeWindAt) into ridges 2-7 layers deep, a whole
                 block on the highest crests */
              const wa = rimeWindAt(wx, wz), u = wx * Math.cos(wa) + wz * Math.sin(wa);
              const rip = 0.5 + 0.5 * Math.sin(u * 0.62 + fbm(wx * 0.05 + 77.3, wz * 0.05 - 19.1, 2) * 4);
              const n = 2 + Math.round(rip * rip * 5.4 + (hash2(wx * 13 + 7, wz * 11 - 5) - 0.5) * 0.8);
              data[idx(x, h + 1, z)] = n >= 8 ? B.SNOW : layerVal(B.SNOW, Math.max(1, n));
            } else {
              /* Solid snow is now an ALTITUDE feature, not the default filler. At sea level a
                 snow biome is almost entirely carpet — the ground still reads white but you can
                 see the grass and plants through it — and full blocks only take over as you
                 climb. `snowline` runs 0 below SNOW_SOLID_Y to 1 well above it, and gates the
                 patch threshold, which cuts low-altitude snow blocks by ~90%. */
              const patch = (fbm(wx * 0.045 + 1201.7, wz * 0.045 - 903.3, 3) + 1) * 0.5;
              const snowline = smooth01(h, SNOW_SOLID_Y, SNOW_SOLID_Y + 34);
              const solidCut = DSNO[gi] ? 0.4 + 0.3 * snowline      // deep snow: 40% solid even low down
                             : 0.04 + 0.5 * snowline;            // 4% low down, ~54% up high
              if (patch < solidCut) {
                data[idx(x, h + 1, z)] = B.SNOW;                  // solid snowfield
              } else {
                // taper: just above the cut -> 7 layers (blends into neighbouring full blocks)
                const layers = Math.min(7, Math.max(DSNO[gi] ? 4 : 1, 7 - Math.floor((patch - solidCut) * 10)));
                data[idx(x, h + 1, z)] = layerVal(B.SNOW, layers);
              }
            }
          }
          for (let y = h + 1; y <= wl; y++) data[idx(x, y, z)] = B.WATER;
          // the top runs the river's way (variant bits 3-6), bit 7 fast down a steep stretch
          if (FDV[gi] && h < wl) data[idx(x, wl, z)] = B.WATER | (FDV[gi] << 11) | (FFV[gi] << 15);
        }
      }
      })();
});
