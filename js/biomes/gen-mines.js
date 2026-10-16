'use strict';
/* biomes/gen-mines.js: mine shafts, dug and framed from the plan in worldgen/gen-caves-plan.js (mineOf).
   A part of genChunk's body (worldgen/gen-chunk.js). The last of the carving. */

corePart('gen.chunk', function () {
      /* ---- mine shafts (rev 22): mineOf's plan, dug and framed. Last of the carving, so nothing fills it again. ---- */
      if (DESERT3 && !FLAT) {
        const x0 = cx * 16, z0 = cz * 16, MS_REACH = 48;
        const FENCE = B.PLANKS | (SHAPE_FENCE << 8), BEAM = B.PLANKS | ((SHAPE_SLAB + 1) << 8);   // a post, and a top slab as the beam
        const inC = (x, z) => x >= x0 && x <= x0 + 15 && z >= z0 && z <= z0 + 15;
        const get = (x, y, z) => inC(x, z) && y >= 1 && y < CY ? data[idx(x - x0, y, z - z0)] : -1;
        const set = (x, y, z, v) => { if (inC(x, z) && y >= 2 && y < CY - 1) data[idx(x - x0, y, z - z0)] = v; };
        // clear a cell (never water, lava or bedrock); a tall plant's other half goes with it
        const clear = (x, y, z) => {
          const b = get(x, y, z), t = b & 255;
          if (b < 0 || t === B.WATER || t === B.LAVA || t === B.BEDROCK) return;
          if (t === B.DRY_TALL_LOWER || t === B.TALL_LOWER) set(x, y + 1, z, B.AIR);
          if (t === B.DRY_TALL_UPPER || t === B.TALL_UPPER) set(x, y - 1, z, B.AIR);
          set(x, y, z, B.AIR);
        };
        const solidAt = (x, y, z) => { const b = get(x, y, z); return b > 0 && solidVal(b); };
        // a roof cell of sand or gravel would fall in: sandstone instead
        const holdRoof = (x, y, z, red) => { const t = get(x, y, z) & 255; if (t === B.SAND || t === B.RED_SAND || t === B.GRAVEL) set(x, y, z, red ? B.RED_SANDSTONE : B.SANDSTONE); };
        const torchLean = (wx, wz) => wx > 0 ? 2 : wx < 0 ? 1 : wz > 0 ? 4 : 3;   // a wall torch leans away from its wall (+X wall: -X, 2)
        for (let gz = Math.floor((z0 - MS_REACH) / MS_CELL); gz <= Math.floor((z0 + 15 + MS_REACH) / MS_CELL); gz++)
          for (let gx = Math.floor((x0 - MS_REACH) / MS_CELL); gx <= Math.floor((x0 + 15 + MS_REACH) / MS_CELL); gx++) {
            const m = mineOf(gx, gz);
            if (!m) continue;
            const { fx, fz, y, dx, dz, len, depth, side, sideLen, red } = m, px = -dz, pz = dx;
            const ex = fx + dx * len, ez = fz + dz * len, yb = y - depth;      // the shaft's middle, and the room's floor
            if (Math.min(fx, ex, ex + px * (sideLen + 4), ex - px * (sideLen + 4)) - 4 > x0 + 15 || Math.max(fx, ex, ex + px * (sideLen + 4), ex - px * (sideLen + 4)) + 4 < x0 ||
                Math.min(fz, ez, ez + pz * (sideLen + 4), ez - pz * (sideLen + 4)) - 4 > z0 + 15 || Math.max(fz, ez, ez + pz * (sideLen + 4), ez - pz * (sideLen + 4)) + 4 < z0) continue;
            const h = (a, b) => hash2(gx * 7919 + a * 31 + b, gz * 6007 - a * 17 + b * 3);
            // a straight run of tunnel from (sx, sz) along (ax, az) for n, floor at fy: dug, floored, roofed, framed every 4
            const run = (sx, sz, ax, az, n, fy, salt) => {
              const qx = -az, qz = ax;
              for (let s = 0; s <= n; s++) {
                const cx2 = sx + ax * s, cz2 = sz + az * s;
                for (let o = -1; o <= 1; o++) {
                  const x = cx2 + qx * o, z = cz2 + qz * o;
                  for (let yy = fy; yy <= fy + 2; yy++) clear(x, yy, z);
                  if (get(x, fy - 1, z) === B.AIR) set(x, fy - 1, z, B.PLANKS);   // over a dip or a cave: a plank floor
                  holdRoof(x, fy + 3, z, red);
                }
                if (s >= 2 && s % 4 === 2) {                                     // a frame
                  const broken = h(salt + s, 1) < 0.18;
                  for (const o of [-1, 1]) {
                    if (broken && h(salt + s, 2 + o) < 0.5) continue;           // a post gone
                    set(cx2 + qx * o, fy, cz2 + qz * o, FENCE); set(cx2 + qx * o, fy + 1, cz2 + qz * o, FENCE);
                  }
                  for (let o = -1; o <= 1; o++) if (!broken || h(salt + s, 5 + o) < 0.4) set(cx2 + qx * o, fy + 2, cz2 + qz * o, BEAM);
                  if (broken) {                                                  // what came down: a little gravel on the floor
                    const o = h(salt + s, 9) < 0.5 ? 1 : -1;
                    if (get(cx2 + qx * o, fy, cz2 + qz * o) === B.AIR) set(cx2 + qx * o, fy, cz2 + qz * o, layerVal(B.GRAVEL, 2 + ((h(salt + s, 10) * 3) | 0)));
                  }
                } else if (s % 4 === 0 && s > 0) {
                  // cobwebs in the upper corners now and then, a burnt-out torch on a wall
                  for (const o of [-1, 1])
                    if (h(salt + s, 11 + o) < 0.3 && solidAt(cx2 + qx * (o * 2), fy + 2, cz2 + qz * (o * 2))) set(cx2 + qx * o, fy + 2, cz2 + qz * o, B.COBWEB);
                  if (s % 8 === 4) {
                    const o = h(salt + s, 15) < 0.5 ? 1 : -1;
                    if (solidAt(cx2 + qx * o * 2, fy + 1, cz2 + qz * o * 2)) set(cx2 + qx * o, fy + 1, cz2 + qz * o, B.TORCH_UNLIT | (torchLean(qx * o, qz * o) << 8));
                  }
                }
              }
            };
            run(fx, fz, dx, dz, len + 1, y, 0);
            // the shaft: 3x3 from the room's ceiling up to the tunnel's floor, a ladder on its far wall
            for (let yy = yb; yy < y; yy++)
              for (let a = -1; a <= 1; a++)
                for (let b = -1; b <= 1; b++) clear(ex + dx * a + px * b, yy, ez + dz * a + pz * b);
            const lx = ex + dx, lz = ez + dz, ladder = B.LADDER | ((dx > 0 ? 3 : dx < 0 ? 2 : dz > 0 ? 1 : 0) << 8);
            for (let yy = yb; yy <= y; yy++) if (solidAt(lx + dx, yy, lz + dz)) set(lx, yy, lz, ladder);
            // the room at the bottom: 7x7 and 3 high, with a frame on each side of the ladder, and the side tunnel out of it
            for (let a = -3; a <= 3; a++)
              for (let b = -3; b <= 3; b++) {
                const x = ex + dx * a + px * b, z = ez + dz * a + pz * b;
                if (Math.abs(a) === 3 && Math.abs(b) === 3) continue;             // rounded corners
                if (a === 2 && b === 0) continue;                                  // the rock the ladder hangs on, down to the floor
                for (let yy = yb; yy <= yb + 2; yy++) clear(x, yy, z);
                if (get(x, yb - 1, z) === B.AIR) set(x, yb - 1, z, B.PLANKS);
                holdRoof(x, yb + 3, z, red);
                // gold in the red desert's walls, the odd stone of it showing
                if (red) for (let yy = yb; yy <= yb + 3; yy++)
                  for (const [ox, oz] of [[dx, dz], [-dx, -dz], [px, pz], [-px, -pz]]) {
                    const t = get(x + ox, yy, z + oz) & 255;
                    if ((t === B.STONE || t === B.SANDSTONE || t === B.RED_SANDSTONE) && h(x * 3 + yy, z * 5 + ox * 7 + oz) < 0.04) set(x + ox, yy, z + oz, B.GOLD_ORE);
                  }
              }
            for (const b of [-2, 2]) { set(ex + px * b, yb, ez + pz * b, FENCE); set(ex + px * b, yb + 1, ez + pz * b, FENCE); set(ex + px * b, yb + 2, ez + pz * b, BEAM); }
            run(ex + px * side * 3, ez + pz * side * 3, px * side, pz * side, sideLen, yb, 50);
          }
      }
});
