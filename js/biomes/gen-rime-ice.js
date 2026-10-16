'use strict';
/* biomes/gen-rime-ice.js: the ice shapes of the Coldest Deep Snow: ribcages, arches, rings, fins, spires, waves,
   tusks, ice trees, crystals, shards.
   A part of genChunk's body (worldgen/gen-chunk.js). */

corePart('gen.chunk', function () {
      /* ---- rime ice (biomeRev 19) ----
         Over the Coldest Deep Snow the frost and the wind have built ice into every shape: the ribs of great beasts frozen
         where they fell, arches and linked rings, fins carved thin with windows worn through, twisted spires, waves frozen
         as they broke, tusks and claws, ice trees and crystal clusters; between them little shards, ice stumps and rows of
         penitentes (blades of snow with ice tips). One big candidate per RI_CELL square (RI_KEEP of them kept) and one small
         per RI_SMALL, each a pure function of its cell, drawn by every chunk it reaches as the spikes are. Ice only goes
         into air or loose snow: what dips into the ground stays buried, and a tree is never cut into. */
      if (RIME && !FLAT) {
        const x0 = cx * 16, z0 = cz * 16;
        const RI_CELL = 26, RI_KEEP = 0.8, RI_REACH = 32, RI_SMALL = 8, RS_REACH = 6;
        const soft = (b) => b === B.AIR || ((b & 255) === B.SNOW && layerCount(b) > 0);
        // ...and not in a column whose top was dug away (a cave mouth's pit), so no ice hangs down in it
        const cut = (lx, lz) => { const t = data[idx(lx, H[(lx + 2) + (lz + 2) * 20], lz)] & 255; return t === B.AIR || t === B.WATER ? 1e9 : 0; };
        const setIce = (x, y, z, id) => {
          const lx = x - x0, lz = z - z0;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 2 || y > CY - 2 || y <= cut(lx, lz)) return;
          const i = idx(lx, y, lz);
          if (soft(data[i])) data[i] = id;
        };
        // a ball of ice of radius r about a point (a thin one at least the cell the point is in, so a thin tube never breaks)
        const ball = (px, py, pz, r, id = B.ICE) => {
          const ri = Math.ceil(r), bx = Math.round(px), by = Math.round(py), bz = Math.round(pz), r2 = Math.max(0.76, r * r + 0.3);
          if (bx + ri < x0 || bx - ri > x0 + 15 || bz + ri < z0 || bz - ri > z0 + 15) return;
          for (let dy = -ri; dy <= ri; dy++)
            for (let dz = -ri; dz <= ri; dz++)
              for (let dx = -ri; dx <= ri; dx++) {
                const ex = bx + dx - px, ey = by + dy - py, ez = bz + dz - pz;
                if (ex * ex + ey * ey + ez * ez <= r2) setIce(bx + dx, by + dy, bz + dz, id);
              }
        };
        // a tube along a curve p(t) (t 0..1, about `len` long, measured too so a coiled one is sampled finely), radius r(t)
        const tube = (p, len, r, id) => {
          let est = 0, pr = p(0);
          for (let k = 1; k <= 24; k++) { const c = p(k / 24); est += Math.hypot(c[0] - pr[0], c[1] - pr[1], c[2] - pr[2]); pr = c; }
          const n = Math.max(2, Math.ceil(Math.max(len, est) * 2.4));
          for (let k = 0; k <= n; k++) { const t = k / n, c = p(t); ball(c[0], c[1], c[2], r(t), id); }
        };
        // a hollow egg along the way (ca2, sa2): radii ra along, ry up, rs across, its shell from `inner` of the way out;
        // hole(u, v, w) (each -1..1: forward is u > 0) leaves a cell open
        const egg = (px, py, pz, ca2, sa2, ra, ry, rs, inner, hole) => {
          const ri = Math.ceil(Math.max(ra, ry, rs)), bx = Math.round(px), by = Math.round(py), bz = Math.round(pz);
          if (bx + ri < x0 || bx - ri > x0 + 15 || bz + ri < z0 || bz - ri > z0 + 15) return;
          for (let dy = -ri; dy <= ri; dy++)
            for (let dz = -ri; dz <= ri; dz++)
              for (let dx = -ri; dx <= ri; dx++) {
                const ex = bx + dx - px, ey = by + dy - py, ez = bz + dz - pz;
                const u = (ex * ca2 + ez * sa2) / ra, v = ey / ry, w = (-ex * sa2 + ez * ca2) / rs, qq = u * u + v * v + w * w;
                if (qq > 1 || qq < inner * inner || (hole && hole(u, v, w))) continue;
                setIce(bx + dx, by + dy, bz + dz, B.ICE);
              }
        };
        // a foot: down from under a point through air and loose snow to the ground, so no end floats (this chunk's own cells)
        const foot = (x, y, z) => {
          x = Math.round(x); y = Math.round(y); z = Math.round(z);
          const lx = x - x0, lz = z - z0;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15) return;
          for (let yy = y - 1, n = 0; yy > cut(lx, lz) && n < 12; yy--, n++) {
            const i = idx(lx, yy, lz);
            if (!soft(data[i])) break;
            data[i] = B.ICE;
          }
        };
        for (let gcz = Math.floor((z0 - RI_REACH) / RI_CELL); gcz <= Math.floor((z0 + 15 + RI_REACH) / RI_CELL); gcz++)
          for (let gcx = Math.floor((x0 - RI_REACH) / RI_CELL); gcx <= Math.floor((x0 + 15 + RI_REACH) / RI_CELL); gcx++) {
            const rr = (k) => hash2(gcx * 7919 + k * 131 + 17, gcz * 6007 - k * 977 + 3);
            if (rr(0) > RI_KEEP) continue;
            const ax = gcx * RI_CELL + 4 + Math.floor(rr(1) * (RI_CELL - 8)), az = gcz * RI_CELL + 4 + Math.floor(rr(2) * (RI_CELL - 8));
            if (ax < x0 - RI_REACH || ax > x0 + 15 + RI_REACH || az < z0 - RI_REACH || az > z0 + 15 + RI_REACH) continue;
            const ti = terrainInfo(ax, az);
            if (!(ti.fRime > 0.5) || ti.h < ti.wl || ti.h <= WATER_LEVEL) continue;
            if (RIME2 && rr(0) > RI_KEEP * rimeKeep(ti)) continue;           // fewer, by its half
            const g = ti.h + 1, kind = Math.floor(rr(4) * 9);              // g: the snow's top, where a shape stands
            const big = rr(3) < 0.18 ? (kind === 0 ? 1.25 : 1.45) : 1;     // now and then one far bigger
            const a = rr(5) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);   // its way: along (ca, sa), across (-sa, ca)
            let nk = 10;
            const q = () => rr(nk++);
            if (kind === 0) {
              /* the ribs of a great beast, frozen where it fell: a knobbled spine arching over hoops of ribs (a few broken
                 short), rolled a little onto its side, the tail running into the snow, at the front a hollow skull with eye
                 holes, a jaw and two tusks */
              const L = (14 + q() * 10) * big, Rm = (3.5 + q() * 2.5) * big, tilt = (q() - 0.5) * 0.8;
              const ux = -sa * Math.sin(tilt), uy = Math.cos(tilt), uz = ca * Math.sin(tilt);    // its up, rolled about the spine
              const sx = -sa * Math.cos(tilt), sy = -Math.sin(tilt), sz = ca * Math.cos(tilt);   // its across
              const env = (s) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.04) / 0.86))), 0.7);
              const lift = (s) => s > 0.95 ? Math.max(0.2, 1.2 - (s - 0.95) * 5) : 1.2 + 1.5 * Rm * env(s);
              const P = (s) => { const al = (s - 0.5) * L, l = lift(s); return [ax + ca * al + ux * l, g + uy * l, az + sa * al + uz * l]; };
              tube((t) => P(-0.02 + t * 1.22), L * 1.25, (t) => (t * L * 1.22) % 1.4 < 0.5 ? 1.15 : 0.65);
              for (let s = 0.17; s <= 0.8; s += 2.3 * big / L) {
                const Rr = Rm * env(s) * (0.85 + 0.3 * q()), c = P(s);
                const hx = c[0] - ux * Rr, hy = c[1] - uy * Rr, hz = c[2] - uz * Rr;            // the hoop's centre under the spine
                for (const side of [1, -1]) {
                  const tm = q() < 0.14 ? 1.0 + q() * 0.9 : 2.5;                                 // a broken rib stops short
                  const rib = (t) => { const th = t * tm, cu = Rr * Math.cos(th), su = side * Rr * 1.1 * Math.sin(th);
                                       return [hx + ux * cu + sx * su, hy + uy * cu + sy * su, hz + uz * cu + sz * su]; };
                  tube(rib, Rr * tm * 1.1, (t) => 0.62 + 0.25 * (1 - t));
                  const e = rib(1);
                  if (tm > 2) foot(e[0], e[1], e[2]);
                }
              }
              const sc = Rm / 4.5, hd = L * 0.5 + 2.6 * sc;
              const kx = ax - ca * hd, ky = g + 1.8 * sc, kz = az - sa * hd;                    // the skull, facing away (-ca, -sa)
              egg(kx, ky, kz, -ca, -sa, 3.3 * sc, 2.4 * sc, 2.6 * sc, 0.62, (u, v, w) =>
                (u > 0.3 && v > 0.05 && v < 0.62 && Math.abs(Math.abs(w) - 0.45) < 0.24) ||       // the eyes
                (u > 0.6 && Math.abs(w) < 0.16 && v > -0.4 && v < 0.05));                          // the nose
              egg(kx - ca * 0.9 * sc, ky - 1.8 * sc, kz - sa * 0.9 * sc, -ca, -sa, 2.9 * sc, 0.9 * sc, 2.1 * sc, 0.45, (u, v) => v > 0.25);   // the jaw
              for (const side of [1, -1]) {
                const bx = kx - ca * 2.3 * sc - sa * side * 1.5 * sc, by = ky - 1.0 * sc, bz = kz - sa * 2.3 * sc + ca * side * 1.5 * sc;
                tube((t) => [bx - ca * 3.5 * sc * t - sa * side * 1.8 * sc * Math.sin(t * 1.6), by + 4.5 * sc * t * t,
                             bz - sa * 3.5 * sc * t + ca * side * 1.8 * sc * Math.sin(t * 1.6)], 7 * sc, (t) => 0.9 * sc * (1 - t) + 0.35);
              }
            } else if (kind === 1) {
              // an arch, its feet set in the snow, swaying a little in plan; now and then a second one crossing it
              const arches = q() < 0.3 ? 2 : 1;
              for (let k = 0; k < arches; k++) {
                const S = (9 + q() * 13) * big * (k ? 0.75 : 1), Ht = (5 + q() * 9) * big * (k ? 0.8 : 1);
                const th = (0.9 + q() * 0.8) * Math.min(1.3, big), sway = (q() - 0.5) * 5 * big;
                const ka = k ? a + Math.PI / 2 + (q() - 0.5) * 0.6 : a, kc = Math.cos(ka), ks = Math.sin(ka);
                const p = (t) => { const al = (t - 0.5) * S, sw = sway * Math.sin(Math.PI * t);
                                   return [ax + kc * al - ks * sw, g - 1 + Ht * Math.pow(Math.sin(Math.PI * t), 0.8), az + ks * al + kc * sw]; };
                tube(p, S * 1.6, (t) => th * (1 - 0.35 * Math.sin(Math.PI * t)) + 0.15);
                for (const t of [0, 1]) { const e = p(t); foot(e[0], e[1], e[2]); }
              }
            } else if (kind === 2) {
              // a ring on its edge, half sunk, leaning; sometimes a smaller one linked through it like a chain
              const Rg = (3.5 + q() * 4) * big, tl = (q() - 0.5) * 0.7, cy0 = g + Rg * 0.55;
              const ring = (px, py, pz, kc, ks, rad, th, lean) => tube((t) => {
                const an = t * Math.PI * 2, c = Math.cos(an) * rad, s2 = Math.sin(an) * rad;
                return [px + kc * c - ks * s2 * Math.sin(lean), py + s2 * Math.cos(lean), pz + ks * c + kc * s2 * Math.sin(lean)];
              }, rad * 6.4, () => th);
              ring(ax, cy0, az, ca, sa, Rg, 0.8 + q() * 0.5, tl);
              if (q() < 0.35) ring(ax + ca * Rg, cy0, az + sa * Rg, -sa, ca, Rg * 0.6, 0.75 + q() * 0.3, (q() - 0.5) * 0.4);
            } else if (kind === 3) {
              // fins the wind has carved thin and set along its way, leaning, with windows worn through them
              const fins = 1 + ((q() * 3) | 0), wa = rimeWindAt(ax, az), lx = Math.cos(wa), lz = Math.sin(wa);
              for (let k = 0; k < fins; k++) {
                const Lf = (10 + q() * 10) * big, Hf = (5 + q() * 8) * big, off = (k - (fins - 1) / 2) * (4 + q() * 2);
                const bend = (q() - 0.5) * 6, lean = (q() - 0.5) * 0.5;
                for (let s = 0; s <= 1; s += 0.4 / Lf) {
                  const hgt = Hf * Math.pow(Math.sin(Math.PI * s), 0.6) * (0.8 + 0.2 * vnoise3(s * 9 + k * 7, gcx, gcz));
                  const o = off + bend * Math.sin(Math.PI * s);
                  const bx = ax + lx * (s - 0.5) * Lf - lz * o, bz = az + lz * (s - 0.5) * Lf + lx * o;
                  for (let y = g - 2; y <= g + hgt; y++) {
                    const up = y - g, px = bx - lz * lean * up, pz = bz + lx * lean * up;
                    // a window, under a rim two thick that keeps the whole fin in one piece
                    if (up > 1 && up < hgt - 2 && vnoise3(px * 0.28 + 11.3, y * 0.32, pz * 0.28 - 7.7) > 0.42) continue;
                    setIce(Math.round(px), y, Math.round(pz), B.ICE);
                  }
                  foot(bx, g - 2, bz);
                }
              }
            } else if (kind === 4) {
              // a spire twisting up from two or three strands round a thin core, leaning down the wind
              const H = (10 + q() * 13) * big, strands = 2 + ((q() * 2) | 0), Rb = (1.6 + q() * 1.2) * Math.min(1.3, big);
              const turns = 0.8 + q() * 1.4, wa = rimeWindAt(ax, az), lean = (1 + q() * 3) * big, wx2 = Math.cos(wa), wz2 = Math.sin(wa);
              for (let k = 0; k < strands; k++)
                tube((t) => {
                  const an = a + t * turns * Math.PI * 2 + k * Math.PI * 2 / strands, rad = Rb * Math.pow(1 - t, 0.8), c = Math.pow(t, 1.5) * lean;
                  return [ax + wx2 * c + Math.cos(an) * rad, g - 1 + t * H, az + wz2 * c + Math.sin(an) * rad];
                }, H * 1.4, (t) => 0.45 + 0.75 * (1 - t));
              tube((t) => { const c = Math.pow(t * 0.75, 1.5) * lean; return [ax + wx2 * c, g - 1 + t * H * 0.75, az + wz2 * c]; }, H, () => 0.55);
            } else if (kind === 5) {
              // a wave frozen as it broke: a long back rising to a crest that curls over into a tube
              const Lw = (12 + q() * 12) * big, Hc0 = (5 + q() * 4) * big, wob = q() * 6;
              for (let v = -0.5; v <= 0.5; v += 0.45 / Lw) {
                const Hc = Hc0 * Math.pow(Math.sin(Math.PI * (v + 0.5)), 0.5);
                if (Hc < 1.5) continue;
                const shift = Math.sin(v * 4 + wob) * 1.5;                                        // the crest line wanders
                const bx = ax - sa * v * Lw + ca * shift, bz = az + ca * v * Lw + sa * shift;
                const P = (u, y) => [bx + ca * u, g - 1 + y, bz + sa * u];                         // u forward, (ca, sa)
                const back = 1.6 * Hc;
                for (let u = -back; u <= 0; u += 0.6) { const c = P(u, Hc * Math.pow((u + back) / back, 1.6)); ball(c[0], c[1], c[2], 0.9); }
                const rc = Hc * 0.4, ucx = rc * 0.25, ycx = Hc - rc;
                for (let ph = Math.PI / 2; ph >= -Math.PI * 0.62; ph -= 0.5 / Math.max(1, rc)) {
                  const c = P(ucx + rc * Math.cos(ph), ycx + rc * Math.sin(ph));
                  ball(c[0], c[1], c[2], 0.95 - 0.35 * (Math.PI / 2 - ph) / (Math.PI * 1.12));
                }
              }
            } else if (kind === 6) {
              // tusks: a pair curving up toward each other; or claws, three to five rising round a ring and hooking inward
              const pair = q() < 0.5, n = pair ? 2 : 3 + ((q() * 3) | 0);
              const Hh = (6 + q() * 8) * big, Rb = (pair ? 3 + q() * 3 : 2 + q() * 2) * big;
              for (let k = 0; k < n; k++) {
                const ka = pair ? a + k * Math.PI : a + k * Math.PI * 2 / n + (q() - 0.5) * 0.5, kc = Math.cos(ka), ks = Math.sin(ka);
                const out = (pair ? 1.5 : 1.5 + q() * 2) * big, r0 = (1.1 + q() * 0.6) * Math.min(1.3, big);
                const bx = ax + kc * Rb, bz = az + ks * Rb, inward = Rb * (pair ? 0.75 : 0.9);
                tube((t) => { const o = Math.sin(t * 1.7) * out - t * t * inward; return [bx + kc * o, g - 1 + Hh * Math.sin(t * 1.35), bz + ks * o]; },
                     Hh * 1.5, (t) => r0 * (1 - t) + 0.3);
              }
            } else if (kind === 7) {
              // an ice tree: a trunk forking into branches that fork again, like frost on a pane stood up
              const grow = (px, py, pz, dx, dy, dz, len, r, depth) => {
                const ex = px + dx * len, ey = py + dy * len, ez = pz + dz * len;
                tube((t) => [px + (ex - px) * t, py + (ey - py) * t, pz + (ez - pz) * t], len, (t) => r * (1 - 0.3 * t));
                if (depth <= 0) return;
                const kids = 2 + (q() < 0.4 ? 1 : 0);
                for (let k = 0; k < kids; k++) {
                  const yaw = q() * Math.PI * 2, tip = 0.45 + q() * 0.45;                         // off the parent's way
                  const nx = dx + Math.cos(yaw) * Math.sin(tip), ny = dy * Math.cos(tip) + 0.25, nz = dz + Math.sin(yaw) * Math.sin(tip);
                  const m = Math.hypot(nx, ny, nz);
                  grow(ex, ey, ez, nx / m, ny / m, nz / m, len * (0.62 + q() * 0.15), Math.max(0.45, r * 0.7), depth - 1);
                }
              };
              grow(ax, g - 1, az, 0, 1, 0, (4 + q() * 4) * big, 1.2 * Math.min(1.3, big), 3);
            } else {
              // a cluster of crystals: long prisms of ice leaning out of one root, pointed at the tip
              const n = 5 + ((q() * 6) | 0);
              for (let k = 0; k < n; k++) {
                const yaw = q() * Math.PI * 2, tip = 0.1 + q() * 0.8, len = (3 + q() * 9) * big * (1 - tip * 0.4), r0 = 0.6 + q() * 0.7;
                const dx = Math.cos(yaw) * Math.sin(tip), dy = Math.cos(tip), dz = Math.sin(yaw) * Math.sin(tip);
                const bx = ax + (q() - 0.5) * 2, bz = az + (q() - 0.5) * 2;
                tube((t) => [bx + dx * len * t, g - 1.5 + dy * len * t, bz + dz * len * t], len, (t) => t > 0.75 ? r0 * (1 - t) * 3.2 + 0.2 : r0);
              }
            }
          }
        // the small things between: shards, ice stumps and rows of penitentes
        for (let gcz = Math.floor((z0 - RS_REACH) / RI_SMALL); gcz <= Math.floor((z0 + 15 + RS_REACH) / RI_SMALL); gcz++)
          for (let gcx = Math.floor((x0 - RS_REACH) / RI_SMALL); gcx <= Math.floor((x0 + 15 + RS_REACH) / RI_SMALL); gcx++) {
            const rr = (k) => hash2(gcx * 3571 + k * 61 - 7, gcz * 4219 - k * 433 + 11);
            if (rr(0) > 0.24) continue;
            const ax = gcx * RI_SMALL + Math.floor(rr(1) * RI_SMALL), az = gcz * RI_SMALL + Math.floor(rr(2) * RI_SMALL);
            if (ax < x0 - RS_REACH || ax > x0 + 15 + RS_REACH || az < z0 - RS_REACH || az > z0 + 15 + RS_REACH) continue;
            const ti = terrainInfo(ax, az);
            if (!(ti.fRime > 0.5) || ti.h < ti.wl || ti.h <= WATER_LEVEL) continue;
            if (RIME2 && rr(0) > 0.24 * rimeKeep(ti)) continue;               // fewer, by its half
            const g = ti.h + 1, kind = rr(3);
            if (kind < 0.45) {
              const n = 1 + ((rr(4) * 3) | 0);
              for (let k = 0; k < n; k++) {
                const yaw = rr(5 + k) * Math.PI * 2, tip = 0.15 + rr(9 + k) * 0.6, len = 2 + rr(13 + k) * 4;
                const dx = Math.cos(yaw) * Math.sin(tip), dy = Math.cos(tip), dz = Math.sin(yaw) * Math.sin(tip);
                tube((t) => [ax + dx * len * t, g - 1 + dy * len * t, az + dz * len * t], len, (t) => t > 0.7 ? 0.35 : 0.6);
              }
            } else if (kind < 0.8) {
              /* penitentes: blades of snow with ice tips, 2-4 tall, in rows running east-west (as the sun carves them) two
                 apart; each stands on its own column's ground, found in this chunk */
              const n = 3 + ((rr(4) * 6) | 0);
              for (let k = 0; k < n; k++) {
                const bx = ax + ((rr(5 + k) * 7) | 0) - 3, bz = az + ((rr(15 + k) * 3) | 0) * 2 - 2, lx = bx - x0, lz = bz - z0;
                if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                let y = g + 4;
                while (y > g - 8 && soft(data[idx(lx, y, lz)])) y--;
                if (y < cut(lx, lz)) continue;                                   // down in a cut, not on the land
                const gb = data[idx(lx, y, lz)] & 255;
                if (gb !== B.SNOW && gb !== B.PACKED_ICE && gb !== B.STONE) continue;
                const hgt = 2 + ((rr(25 + k) * 3) | 0);
                for (let j = 1; j <= hgt; j++) setIce(bx, y + j, bz, j === hgt ? B.ICE : B.SNOW);
              }
            } else {
              // an ice stump, a column snapped off short
              const hgt = 1 + ((rr(4) * 3) | 0);
              for (let j = 0; j < hgt; j++) ball(ax, g + j, az, j ? 0.4 : 0.9);
              foot(ax, g, az);
            }
          }
      }
});
