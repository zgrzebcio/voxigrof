'use strict';
/* worldgen/water-finish.js: the chunk's last passes. Waterfall curtains, the fix for water left beside open air,
   lake water kept water, and the result genChunk returns.
   The last part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      (() => {   // own function: see SPEED in worldgen/gen-chunk.js
      /* waterfalls (rev 17): where water stands 2+ over the water beside it (a river's fall, a lake's outlet, a
         river reaching the sea off a cliff), the falling water hangs down the face as a sheet in the lower column, from
         its surface up to the higher one, its top running the upper water's way */
      if (FALLS) {
        // a column's curtain top (its own water's if none): the highest water 2+ over it beside it
        const curtainTop = (gi) => {
          let top = WLV[gi];
          if (H[gi] >= top) return -1;
          for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) if (H[n] < WLV[n] && WLV[n] >= WLV[gi] + 2 && WLV[n] > top) top = WLV[n];
          return top > WLV[gi] ? top : -1;
        };
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const gi = (x + 2) + (z + 2) * 20, wl = WLV[gi], wet = H[gi] < wl;
            const top = wet ? curtainTop(gi) : -1;
            if (top >= 0) {
              let fd = 0;
              for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) if (H[n] < WLV[n] && WLV[n] === top) fd = FDV[n];
              for (let y = wl + 1; y <= top && y <= CY - 2; y++) {
                const i = idx(x, y, z);
                if ((data[i] & 255) === B.AIR) data[i] = y === top && fd ? B.WATER | (fd << 11) | (1 << 15) : B.WATER;   // a fall's lip runs fast
              }
            }
            /* beside a falling sheet: dry ground rises in rock to its top, so the fall runs in a notch, not out over a
               bank; and any cave beside it (under dry ground or under water), dug before the sheet hung, is filled so it
               never shows the sheet's side. Dry ground lower than any water beside it (where two rivers' levels meet,
               the bank going with the lower) is raised in its own top block to hold that water in. */
            for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) {
              const nt = curtainTop(n);
              if (nt >= 0) {
                // beside a sheet: an open cell over lower water stays open (the fall's face); over ground, or in a cave, rock
                for (let y = WLV[n] + 1; y <= nt && y <= CY - 2; y++) {
                  const i = idx(x, y, z), b = data[i] & 255;
                  if (b !== B.AIR && b !== B.SNOW) continue;
                  let yy = y - 1;
                  while (yy > 1 && (data[idx(x, yy, z)] & 255) === B.AIR) yy--;
                  if ((data[idx(x, yy, z)] & 255) !== B.WATER) data[i] = B.STONE;
                }
              } else if (!wet && H[n] < WLV[n] && WLV[n] > H[gi]) {
                const fill = WLV[n] - H[gi] > 2 ? B.STONE : data[idx(x, H[gi], z)] & 255;   // a tall rise is rock
                for (let y = H[gi] + 1; y <= WLV[n] && y <= CY - 2; y++) {
                  const i = idx(x, y, z), b = data[i] & 255;
                  if (b === B.AIR || b === B.SNOW) data[i] = fill;
                }
              }
            }
          }
      }
      })();
      (() => {   // own function: see SPEED in worldgen/gen-chunk.js
      /* the last word on leaks (rev 18): water beside open air whose column stands on dry ground below (not on
         lower water, which is a fall's open face) gets that air filled with the ground's top block, upward, so no water
         ever stands open over a ledge however the passes above left it. Inside this chunk, from what is really there. */
      if (DIVIDE)
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const gi = (x + 2) + (z + 2) * 20;
            for (let y = Math.max(2, Math.min(H[gi], WLV[gi]) + 1); y <= CY - 2; y++) {
              if ((data[idx(x, y, z)] & 255) !== B.WATER) { if (y > WLV[gi] + 60) break; continue; }
              for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, nz = z + dz;
                if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || (data[idx(nx, y, nz)] & 255) !== B.AIR) continue;
                let yy = y - 1;
                while (yy > 1 && (data[idx(nx, yy, nz)] & 255) === B.AIR) yy--;
                const below = data[idx(nx, yy, nz)] & 255;
                if (below === B.WATER || below === B.ICE) continue;
                const fill = PROPS[below] && PROPS[below].opaque && y - yy <= 2 ? below : B.STONE;   // a tall rise is rock
                for (let fy = yy + 1; fy <= y; fy++) data[idx(nx, fy, nz)] = fill;
              }
            }
          }
      })();
      /* water up in the land stays water: anything a later pass set in it (a plant, a pebble, a log) goes */
      if (HIWET)
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const gi = (x + 2) + (z + 2) * 20, wl = WLV[gi];
            if (wl <= WATER_LEVEL || H[gi] >= wl) continue;
            for (let y = H[gi] + 1; y <= wl; y++) {
              const b = data[idx(x, y, z)] & 255;
              if (b !== B.WATER && b !== B.ICE && b !== B.PACKED_ICE) data[idx(x, y, z)] = B.WATER;
            }
          }
      return data.buffer;
});
