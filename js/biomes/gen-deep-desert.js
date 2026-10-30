'use strict';
/* biomes/gen-deep-desert.js: the Deep Desert's hoodoos (rock pillars) and bones.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* ---- the Deep Desert's hoodoos and bones (0.84, biomeRev 21) ----
         Hoodoos: a column of the banded rock 5-16 tall, now and then wider at the foot, under a cap of red sandstone
         wider than its neck (a balanced rock), or tapering to a point; one in a third of HD_CELL squares.
         Bones: the skeletons of great beasts half buried in the sand, of four kinds and every size: a ribcage under an
         arched spine with its skull and tusks, a serpent's long winding spine, a lone horned skull, and a scatter of loose
         bones. One in BN_KEEP of BN_CELL squares. Both are pure functions of their cell, drawn by every chunk they reach.
         Bone goes only into air, loose sand layers or a dry plant: what dips under the sand stays buried. A bone block lies
         along its bone (its axis bits, as a log's). */
      if (DESERT2 && !FLAT) {
        const x0 = cx * 16, z0 = cz * 16;
        const sandLayer = (b) => { const t = b & 255; return (t === B.SAND || t === B.RED_SAND) && layerCount(b) > 0; };
        // ...and the green grass too, in the Dryland
        const dryPlant = (b) => { const t = b & 255; return t === B.DRY_GRASS || t === B.DRY_BUSH || t === B.DRY_TALL_LOWER || t === B.DRY_TALL_UPPER
                                                        || t === B.SHORT_GRASS || t === B.TALLGRASS || t === B.TALL_LOWER || t === B.TALL_UPPER; };
        const soft = (b) => b === B.AIR || sandLayer(b) || dryPlant(b);
        const setSoft = (x, y, z, v) => {
          const lx = x - x0, lz = z - z0;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 2 || y > CY - 2) return;
          const i = idx(lx, y, lz);
          if (!soft(data[i])) return;
          const t = data[i] & 255;
          if ((t === B.DRY_TALL_LOWER || t === B.TALL_LOWER) && y + 1 < CY) data[idx(lx, y + 1, lz)] = B.AIR;
          if (t === B.DRY_TALL_UPPER || t === B.TALL_UPPER) data[idx(lx, y - 1, lz)] = B.AIR;
          data[i] = v;
        };
        // never on a canyon's line (the canyons pass, desert gate) nor, for bones, across a cliff: nothing hangs in the air
        const onCanyon = (x, z) => fbm(x * 0.0015 + 555, z * 0.0015 - 333, 2) > 0.10 &&
          (Math.abs(fbm(x * 0.008 + 911, z * 0.008 - 477, 2)) < 0.15 || Math.abs(fbm(x * 0.0035 + 911, z * 0.011 - 477, 2)) < 0.10 ||
           Math.abs(fbm(x * 0.011 + 911, z * 0.0035 - 477, 2)) < 0.10);
        // hoodoos
        const HD_CELL = 14, HD_REACH = 4;
        for (let gcz = Math.floor((z0 - HD_REACH) / HD_CELL); gcz <= Math.floor((z0 + 15 + HD_REACH) / HD_CELL); gcz++)
          for (let gcx = Math.floor((x0 - HD_REACH) / HD_CELL); gcx <= Math.floor((x0 + 15 + HD_REACH) / HD_CELL); gcx++) {
            const rr = (k) => hash2(gcx * 5303 + k * 71 + 9, gcz * 4127 - k * 311 - 7);
            if (rr(0) > 0.33) continue;
            const ax = gcx * HD_CELL + 2 + Math.floor(rr(1) * (HD_CELL - 4)), az = gcz * HD_CELL + 2 + Math.floor(rr(2) * (HD_CELL - 4));
            if (ax < x0 - HD_REACH || ax > x0 + 15 + HD_REACH || az < z0 - HD_REACH || az > z0 + 15 + HD_REACH) continue;
            const ti = terrainInfo(ax, az);
            // (none on the Deep Red Desert Flat: an open plain, biomes/fields.js RDFLAT)
            if (!(ti.fDeepD > 0.5) || (ti.rdf || 0) > 0.5 || ti.h < ti.wl || ti.h <= WATER_LEVEL || onCanyon(ax, az)) continue;
            const g = ti.h, hgt = 5 + Math.floor(rr(3) * 12), off = Math.round(rr(4) * 8), capped = rr(5) < 0.55;
            const kind = DESERT3 ? (ti.ddRed > 0.5 ? 2 : 1) : 0, capB = kind === 1 ? B.SANDSTONE : B.RED_SANDSTONE;   // by its half
            const neck = 0.7 + rr(6) * 0.9, foot = neck + (rr(7) < 0.5 ? 1 : 0.3);
            for (let y = g - 2; y <= g + hgt + (capped ? 1 : 0); y++) {
              const t = (y - g) / hgt, cap = capped && y > g + hgt - 1;
              const rad = cap ? neck + 1.3 : capped ? Math.max(0.5, foot + (neck - foot) * Math.min(1, Math.max(0, t) * 1.6))
                                                    : Math.max(0.4, foot * (1 - Math.max(0, t)) + 0.4);
              const ri = Math.ceil(rad);
              for (let dz = -ri; dz <= ri; dz++)
                for (let dx = -ri; dx <= ri; dx++) {
                  if (dx * dx + dz * dz > rad * rad + 0.25) continue;
                  setSoft(ax + dx, y, az + dz, cap ? capB : ddStrata(y, off, kind));
                }
            }
          }
        // bones
        const BN_CELL = 40, BN_KEEP = 0.4, BN_REACH = 40;
        const boneVal = (dx, dy, dz) => {                              // a bone block lying along (dx, dy, dz)
          const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
          return B.BONE_BLOCK | ((ay >= ax && ay >= az ? 0 : ax >= az ? 1 : 2) << 8);
        };
        // a ball of bone about a point (at least the cell it is in, so a thin bone never breaks)
        const ball = (px, py, pz, r, v) => {
          const ri = Math.ceil(r), bx = Math.round(px), by = Math.round(py), bz = Math.round(pz), r2 = Math.max(0.76, r * r + 0.3);
          if (bx + ri < x0 || bx - ri > x0 + 15 || bz + ri < z0 || bz - ri > z0 + 15) return;
          for (let dy = -ri; dy <= ri; dy++)
            for (let dz = -ri; dz <= ri; dz++)
              for (let dx = -ri; dx <= ri; dx++) {
                const ex = bx + dx - px, ey = by + dy - py, ez = bz + dz - pz;
                if (ex * ex + ey * ey + ez * ez <= r2) setSoft(bx + dx, by + dy, bz + dz, v);
              }
        };
        // a bone along a curve p(t), t 0..1, about `len` long, radius r(t); each piece lies along the curve there
        const bone = (p, len, r) => {
          const n = Math.max(2, Math.ceil(len * 2.4));
          for (let k = 0; k <= n; k++) {
            const t = k / n, c = p(t), c2 = p(Math.min(1, t + 0.02)), c1 = p(Math.max(0, t - 0.02));
            ball(c[0], c[1], c[2], r(t), boneVal(c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2]));
          }
        };
        // a hollow egg along (ca2, sa2), radii ra along, ry up, rs across, its shell from `inner` out; hole(u, v, w) left open
        const egg = (px, py, pz, ca2, sa2, ra, ry, rs, inner, hole) => {
          const ri = Math.ceil(Math.max(ra, ry, rs)), bx = Math.round(px), by = Math.round(py), bz = Math.round(pz);
          if (bx + ri < x0 || bx - ri > x0 + 15 || bz + ri < z0 || bz - ri > z0 + 15) return;
          for (let dy = -ri; dy <= ri; dy++)
            for (let dz = -ri; dz <= ri; dz++)
              for (let dx = -ri; dx <= ri; dx++) {
                const ex = bx + dx - px, ey = by + dy - py, ez = bz + dz - pz;
                const u = (ex * ca2 + ez * sa2) / ra, v = ey / ry, w = (-ex * sa2 + ez * ca2) / rs, qq = u * u + v * v + w * w;
                if (qq > 1 || qq < inner * inner || (hole && hole(u, v, w))) continue;
                setSoft(bx + dx, by + dy, bz + dz, B.BONE_BLOCK);
              }
        };
        // a skull facing (fc, fs): a hollow egg with eye and nose holes, a jaw under it, horns or tusks out of its sides
        const skull = (kx, ky, kz, fc, fs, sc, horns) => {
          egg(kx, ky, kz, fc, fs, 3.3 * sc, 2.4 * sc, 2.6 * sc, 0.62, (u, v, w) =>
            (u > 0.3 && v > 0.05 && v < 0.62 && Math.abs(Math.abs(w) - 0.45) < 0.24) || (u > 0.6 && Math.abs(w) < 0.16 && v > -0.4 && v < 0.05));
          egg(kx + fc * 0.9 * sc, ky - 1.8 * sc, kz + fs * 0.9 * sc, fc, fs, 2.9 * sc, 0.9 * sc, 2.1 * sc, 0.45, (u, v) => v > 0.25);
          for (const side of [1, -1]) {
            const bx = kx - fs * side * 2.2 * sc, by = ky + (horns ? 1.2 * sc : -0.8 * sc), bz = kz + fc * side * 2.2 * sc;
            if (horns)   // up and out, curling forward
              bone((t) => [bx - fs * side * 2.6 * sc * Math.sin(t * 1.4) + fc * 2.2 * sc * t * t, by + 4.2 * sc * Math.sin(t * 1.2),
                           bz + fc * side * 2.6 * sc * Math.sin(t * 1.4) + fs * 2.2 * sc * t * t], 7 * sc, (t) => 0.85 * sc * (1 - t) + 0.35);
            else         // tusks: forward and curving up
              bone((t) => [bx + fc * 4 * sc * t - fs * side * 1.4 * sc * Math.sin(t * 1.6), by + 3.6 * sc * t * t,
                           bz + fs * 4 * sc * t + fc * side * 1.4 * sc * Math.sin(t * 1.6)], 6 * sc, (t) => 0.8 * sc * (1 - t) + 0.35);
          }
        };
        for (let gcz = Math.floor((z0 - BN_REACH) / BN_CELL); gcz <= Math.floor((z0 + 15 + BN_REACH) / BN_CELL); gcz++)
          for (let gcx = Math.floor((x0 - BN_REACH) / BN_CELL); gcx <= Math.floor((x0 + 15 + BN_REACH) / BN_CELL); gcx++) {
            const rr = (k) => hash2(gcx * 6113 + k * 197 + 31, gcz * 7019 - k * 541 + 17);
            if (rr(0) > BN_KEEP) continue;
            const ax = gcx * BN_CELL + 6 + Math.floor(rr(1) * (BN_CELL - 12)), az = gcz * BN_CELL + 6 + Math.floor(rr(2) * (BN_CELL - 12));
            if (ax < x0 - BN_REACH || ax > x0 + 15 + BN_REACH || az < z0 - BN_REACH || az > z0 + 15 + BN_REACH) continue;
            const ti = terrainInfo(ax, az);
            // the Deep Desert, and the Dryland half as often
            const dryland = DRYLAND && ti.fDry > 0.5;
            if (!(ti.fDeepD > 0.5 || dryland) || (ti.rdf || 0) > 0.5 || ti.h < ti.wl || ti.h <= WATER_LEVEL || onCanyon(ax, az)) continue;
            // ...and 70% fewer again in worlds made since 0.8442 (rev 24; a whole skeleton or none, so not in older worlds)
            if (dryland && rr(0) > BN_KEEP * 0.5 * (FOSSIL2 ? 0.3 : 1)) continue;
            let lo = ti.h, hi = ti.h;
            for (let k = 0; k < 8; k++) {
              const hh = terrainInfo(ax + Math.cos(k * Math.PI / 4) * 10, az + Math.sin(k * Math.PI / 4) * 10).h;
              lo = Math.min(lo, hh); hi = Math.max(hi, hh);
            }
            if (hi - lo > 5) continue;                                     // a cliff or a crag: no room to lie
            const g = ti.h + 1, kind = rr(3), sz = 0.55 + rr(4) * rr(4) * 1.35;   // most middling, now and then a giant
            const a = rr(5) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
            let nk = 10;
            const q = () => rr(nk++);
            if (kind < 0.35) {
              /* a great beast fallen on its belly or rolled to its side: an arched spine with its ribs in hoops under it (a few
                 broken short), its tail running into the sand, its skull at the front; sunk 1-3 into the sand */
              const L = Math.min(28, (12 + q() * 8) * sz), Rm = Math.min(7, (2.6 + q() * 1.8) * sz), tilt = (q() - 0.5) * 0.9, sink = 1 + q() * 2;
              const ux = -sa * Math.sin(tilt), uy = Math.cos(tilt), uz = ca * Math.sin(tilt);
              const sx = -sa * Math.cos(tilt), sy = -Math.sin(tilt), sz2 = ca * Math.cos(tilt);
              const env = (s) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.04) / 0.86))), 0.7);
              const lift = (s) => s > 0.95 ? Math.max(0.2, 1.2 - (s - 0.95) * 5) : 1.2 + 1.5 * Rm * env(s);
              const P = (s) => { const al = (s - 0.5) * L, l = lift(s) - sink; return [ax + ca * al + ux * l, g + uy * l, az + sa * al + uz * l]; };
              bone((t) => P(-0.02 + t * 1.22), L * 1.25, (t) => (t * L * 1.22) % 1.4 < 0.5 ? 1.05 : 0.6);
              for (let s = 0.17; s <= 0.8; s += 2.1 * Math.max(0.8, sz) / L) {
                const Rr = Rm * env(s) * (0.85 + 0.3 * q()), c = P(s);
                const hx = c[0] - ux * Rr, hy = c[1] - uy * Rr, hz = c[2] - uz * Rr;
                for (const side of [1, -1]) {
                  const tm = q() < 0.2 ? 0.9 + q() * 0.9 : 2.5;
                  bone((t) => { const th = t * tm, cu = Rr * Math.cos(th), su = side * Rr * 1.1 * Math.sin(th);
                                return [hx + ux * cu + sx * su, hy + uy * cu + sy * su, hz + uz * cu + sz2 * su]; },
                       Rr * tm * 1.1, (t) => 0.55 + 0.2 * (1 - t));
                }
              }
              const sc = Rm / 4.5, hd = L * 0.5 + 2.6 * sc;
              skull(ax - ca * hd, g + 1.6 * sc - sink, az - sa * hd, -ca, -sa, sc, q() < 0.4);
            } else if (kind < 0.55) {
              // a serpent: a long spine winding through the sand, rising out of it and diving back, short ribs along it
              const L = Math.min(56, (26 + q() * 18) * sz), wv = 2 + q() * 2, amp = (3 + q() * 3) * Math.min(1.4, sz), ph = q() * 6;
              const P = (t) => { const al = (t - 0.5) * L, sw = Math.sin(t * wv * Math.PI * 2 + ph) * amp, up = Math.sin(t * Math.PI * (wv + 1)) * 1.6 * sz - 0.8;
                                 return [ax + ca * al - sa * sw, g + up, az + sa * al + ca * sw]; };
              bone(P, L * 1.3, () => Math.max(0.55, 0.75 * Math.min(1.4, sz)));
              for (let t = 0.04; t < 0.94; t += 1.6 / L) {
                const c = P(t), c2 = P(t + 0.01), tx = c2[0] - c[0], tz = c2[2] - c[2], tl = Math.hypot(tx, tz) || 1;
                const nx = -tz / tl, nz = tx / tl, rl = 1.2 + 1.3 * Math.min(1.4, sz) * Math.sin(Math.PI * t);
                for (const side of [1, -1])
                  bone((u) => [c[0] + nx * side * rl * u, c[1] - u * u * 1.2, c[2] + nz * side * rl * u], rl, () => 0.5);
              }
              skull(P(0)[0] - ca * 1.5, P(0)[1] + 0.4, P(0)[2] - sa * 1.5, -ca, -sa, 0.45 * Math.min(1.4, sz), false);
            } else if (kind < 0.75) {
              // a lone skull, horned or tusked, half sunk where it fell, tipped a little
              const sc = 0.7 + 0.9 * sz;
              skull(ax, g + 0.8 * sc - 1.2, az, ca, sa, sc, q() < 0.6);
            } else {
              // loose bones: a few long limb bones lying about, knobbed at both ends, and a broken rib or two
              const n = 3 + ((q() * 4) | 0);
              for (let k = 0; k < n; k++) {
                const bx = ax + (q() - 0.5) * 10 * sz, bz = az + (q() - 0.5) * 10 * sz, ba = q() * Math.PI * 2, bl = (3 + q() * 5) * Math.min(1.5, sz);
                const ex = Math.cos(ba) * bl, ez = Math.sin(ba) * bl, by = g - 0.3 + q() * 0.6, rise = (q() - 0.3) * 1.5;
                if (q() < 0.7) {
                  bone((t) => [bx + ex * t, by + rise * t, bz + ez * t], bl, () => 0.45);
                  ball(bx, by, bz, 0.9, B.BONE_BLOCK); ball(bx + ex, by + rise, bz + ez, 0.9, B.BONE_BLOCK);
                } else {
                  const rr2 = bl * 0.6;
                  bone((t) => [bx + Math.cos(ba + t * 2) * rr2, by + Math.sin(t * Math.PI) * rr2 * 0.8, bz + Math.sin(ba + t * 2) * rr2], rr2 * 2, () => 0.45);
                }
              }
            }
          }
      }
});
