'use strict';
/* woods/gen-rime-trees.js: rime trees, the frozen wood of the Coldest Deep Snow, in its five forms.
   A part of genChunk's body (worldgen/gen-chunk.js); called from the tree loop (woods/gen-tree-loop.js). */

corePart('gen.chunk', function () {
      /* Rime trees (biomeRev 19): the Coldest Deep Snow's frozen wood in five forms, all hung with rime (its leaves).
           GHOST    32%  the trunk buried in a lumpy column of rime leaning down the wind, arms and a head of it: the
                         "snow monsters" frost builds on trees in the hardest cold
           SKELETON 23%  bare and crooked, branches reaching up and out with rime only on their tips, icicles under them
           SPIRE    23%  tall and slender, tight tiers of rime drooping at their rims
           BENT     16%  leant down the wind, its rime flagged out on the lee side only
           GIANT     6%  a broad stump 18-25 tall under a heavy lumpy crown, frozen spray round its foot
         Everything stays within 8 of the trunk (the tree loop's margin). Short hidden boughs inside the rime keep every leaf
         within the leaves' reach of wood (isLeavesConnected, woods/leaf-decay.js). */
      const RLOG = (w, axis = 0) => B.RIME_LOG | ((axis | (w << 2)) << 8);
      // into air or loose snow only (frozen spray, icicles), never over the tree or the ground
      const putSoft = (x, y, z, id) => {
        if (x < 0 || x > 15 || z < 0 || z > 15 || y < 2 || y > CY - 1) return;
        const i = idx(x, y, z), b = data[i];
        if (b === B.AIR || ((b & 255) === B.SNOW && layerCount(b) > 0)) data[i] = id;
      };
      function rimeTree(tx, tz, h, wx, wz, gcx, gcz) {
        const rnd = (a, b) => hash2(gcx * 59 + a, gcz * 83 + b);
        const f = rnd(3, 11);
        const wa = rimeWindAt(wx, wz), wdx = Math.cos(wa), wdz = Math.sin(wa);
        // a lumpy column of rime from y0 to y1 round a centre leaning `lean` down the wind by the top; rad(t), t 0..1 up it
        const column = (y0, y1, rad, lean) => {
          for (let ly = y0; ly <= y1; ly++) {
            const t = (ly - y0) / Math.max(1, y1 - y0), co = lean * t;
            const rr = rad(t) + 0.8 * vnoise3(wx * 0.5 + 31.7, ly * 0.55, wz * 0.5 - 17.3), ri = Math.ceil(rr + co);
            for (let oz = -ri; oz <= ri; oz++)
              for (let ox = -ri; ox <= ri; ox++) {
                const d = Math.hypot(ox - wdx * co, oz - wdz * co);
                if (d > rr || (d > rr - 0.7 && hash2(wx + ox * 31 + ly * 7, wz + oz * 17 - ly) < 0.35)) continue;
                put(tx + ox, ly, tz + oz, B.RIME_LEAVES, false);
              }
          }
        };
        // a trunk from h+1 to h+th whose centre leans `lean` down the wind by the top (k: how the lean grows), width w(t)
        const trunk = (th, lean, k, w) => {
          let px = 0, pz = 0;
          for (let y = h + 1; y <= h + th; y++) {
            const t = (y - h - 1) / Math.max(1, th - 1), c = Math.pow(t, k) * lean;
            const nx = Math.round(wdx * c), nz = Math.round(wdz * c), ww = Math.round(w(t));
            if (nx !== px || nz !== pz) put(tx + nx, y - 1, tz + nz, RLOG(ww), true);   // the bend's step joined below
            put(tx + nx, y, tz + nz, RLOG(ww), true);
            px = nx; pz = nz;
          }
        };
        // hidden boughs inside a rime column, every third layer, 1-2 out each way
        const boughs = (y0, y1, lean, reach) => {
          for (let y = y0 + 1; y <= y1 - 1; y += 3) {
            const t = (y - y0) / Math.max(1, y1 - y0), bx = Math.round(wdx * lean * t), bz = Math.round(wdz * lean * t);
            for (const [ax, az, axis] of [[1, 0, 1], [-1, 0, 1], [0, 1, 2], [0, -1, 2]])
              for (let s = 1; s <= reach; s++) put(tx + bx + ax * s, y, tz + bz + az * s, RLOG(10, axis), true);
          }
        };
        const blob = (bx, by, bz, r, salt) => {
          const ri = Math.ceil(r);
          for (let oy = -ri; oy <= ri; oy++)
            for (let oz = -ri; oz <= ri; oz++)
              for (let ox = -ri; ox <= ri; ox++) {
                const d = Math.sqrt(ox * ox + oy * oy * 1.4 + oz * oz);   // its middle column is never thinned, so it hangs together
                if (d > r || (d > r - 0.6 && (ox || oz) && hash2(wx + ox * 71 + salt, wz + oz * 83 + oy * 13 + salt) < 0.4)) continue;
                put(bx + ox, by + oy, bz + oz, B.RIME_LEAVES, false);
              }
        };
        const icicle = (x, y, z, n) => {
          if (x < 0 || x > 15 || z < 0 || z > 15) return;
          for (let k = 1; k <= n && y - k > 2; k++) { if (data[idx(x, y - k, z)] !== B.AIR) break; data[idx(x, y - k, z)] = B.ICE; }
        };
        if (f < 0.32) {                                                    // GHOST
          const th = 8 + ((rnd(5, 7) * 8) | 0), fat = 2.0 + rnd(9, 13) * 0.8, lean = 1.3;
          trunk(th, lean, 1, (t) => 28 - 12 * t);
          boughs(h + 2, h + th, lean, 2);
          column(h + 2, h + th + 1, (t) => fat * (1 - 0.5 * t) * (t < 0.12 ? 0.7 + t * 2.5 : 1), lean);
          const arms = 2 + ((rnd(15, 17) * 2) | 0);
          for (let k = 0; k < arms; k++) {
            const a = rnd(19 + k, 23 - k) * Math.PI * 2, ay = h + 3 + ((rnd(29 + k, 31 + k) * Math.max(1, th - 5)) | 0);
            const t = (ay - h - 2) / th, d = fat * (1 - 0.5 * t) + 0.6;
            blob(tx + Math.round(Math.cos(a) * d + wdx * lean * t), ay, tz + Math.round(Math.sin(a) * d + wdz * lean * t), 1.2, k * 7);
          }
          blob(tx + Math.round(wdx * lean), h + th + 1, tz + Math.round(wdz * lean), 1.5, 99);   // the head, on the trunk's top
          return;
        }
        if (f < 0.55) {                                                    // SKELETON
          const th = 7 + ((rnd(5, 7) * 6) | 0);
          trunk(th, 0, 1, (t) => 26 - 14 * t);
          const nb = 4 + ((rnd(37, 41) * 4) | 0);
          for (let b = 0; b < nb; b++) {
            let a = rnd(43 + b * 3, 47 - b * 5) * Math.PI * 2, fx = 0, fz = 0, bx = 0, bz = 0;
            let by = h + Math.floor(th * 0.4) + Math.floor(b * th * 0.55 / nb);
            const droop = rnd(53 + b, 59 - b) < 0.25, len = 3 + ((rnd(61 + b * 7, 67 + b) * 4) | 0);
            for (let s = 1; s <= len; s++) {
              a += (rnd(71 + b * 11 + s, 73 - s) - 0.5) * 0.9;              // crooked
              fx += Math.cos(a); fz += Math.sin(a);
              bx = Math.round(fx); bz = Math.round(fz);
              const rise = droop && s > 2 ? -1 : rnd(79 + b + s * 5, 83 + s) < 0.55 ? 1 : 0;
              by += rise;
              const axis = rise ? 0 : Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a)) ? 1 : 2;
              put(tx + bx, by, tz + bz, RLOG(Math.max(LOG_W_MIN + 2, 18 - (s - 1) * 3), axis), true);
              if (hash2(wx + bx * 37 + by, wz + bz * 41 - by) < 0.35) put(tx + bx, by + 1, tz + bz, B.RIME_LEAVES, false);   // frost on it
              if (s >= 2 && hash2(wx + bx * 43 - by, wz + bz * 47 + by) < 0.3) icicle(tx + bx, by, tz + bz, 1 + ((hash2(wx + bx, wz + bz + by) * 3) | 0));
            }
            blob(tx + bx, by, tz + bz, 1.1, b * 13);                       // rime on the tip
          }
          blob(tx, h + th + 1, tz, 1.2, 77);
          return;
        }
        if (f < 0.78) {                                                    // SPIRE
          const sh = 13 + ((rnd(5, 7) * 9) | 0), base = h + 3, top = h + sh;
          trunk(sh, 0, 1, (t) => 26 - 12 * t);
          for (let ly = base; ly <= top; ly++) {
            const t = (ly - base) / Math.max(1, top - base), tier = (ly - base) % 3;
            const rad = Math.max(1, Math.round(2.6 - 1.8 * t)) - (tier === 2 ? 1 : 0);
            if (rad < 1) continue;
            for (let oz = -rad; oz <= rad; oz++)
              for (let ox = -rad; ox <= rad; ox++) {
                const d = Math.abs(ox) + Math.abs(oz);
                if (d > rad || (d === rad && hash2(wx + ox * 29 + ly, wz + oz * 23 - ly) > 0.8)) continue;
                put(tx + ox, ly, tz + oz, B.RIME_LEAVES, false);
                // the rim of a tier droops under its weight of frost
                if (d === rad && tier === 0 && hash2(wx + ox * 53 - ly, wz + oz * 59 + ly) < 0.6) put(tx + ox, ly - 1, tz + oz, B.RIME_LEAVES, false);
              }
          }
          for (let t2 = 1; t2 <= 2; t2++) put(tx, top + t2, tz, B.RIME_LEAVES, false);
          return;
        }
        if (f < 0.94) {                                                    // BENT
          const th = 8 + ((rnd(5, 7) * 6) | 0), lean = 1.5 + rnd(89, 97) * 1.5;
          trunk(th, lean, 1.6, (t) => 26 - 12 * t);
          for (let k = 0; k < 6; k++) {
            const y = h + Math.floor(th * 0.4) + ((rnd(101 + k, 103 - k) * th * 0.6) | 0);
            const c = Math.pow(Math.max(0, (y - h - 1) / (th - 1)), 1.6) * lean;
            const d = 1 + rnd(107 + k, 109 + k) * 1.4, side = (rnd(113 + k, 117 - k) - 0.5) * 1.6;
            const bx = Math.round(wdx * c), bz = Math.round(wdz * c);
            // a bough out to the lee under each tuft, so the flag hangs on wood
            for (let s = 1; s <= Math.round(d); s++) put(tx + Math.round(wdx * (c + s)), y, tz + Math.round(wdz * (c + s)), RLOG(12, Math.abs(wdx) >= Math.abs(wdz) ? 1 : 2), true);
            blob(tx + bx + Math.round(wdx * d - wdz * side), y, tz + bz + Math.round(wdz * d + wdx * side), 1.1 + rnd(119 + k, 121) * 0.5, k * 17);
          }
          blob(tx + Math.round(wdx * (lean + 0.5)), h + th + 1, tz + Math.round(wdz * (lean + 0.5)), 1.5, 61);
          return;
        }
        // GIANT
        const th = 18 + ((rnd(5, 7) * 8) | 0), fat = 3.0 + rnd(9, 13) * 0.8, c0 = h + Math.floor(th * 0.4);
        trunk(th, 0, 1, (t) => 38 - 22 * Math.min(1, t / 0.7));
        boughs(c0, h + th, 0, 2);
        column(c0, h + th + 1, (t) => fat * (1 - 0.6 * t) * (t < 0.1 ? 0.6 + t * 4 : 1), 0);
        for (let k = 0; k < 4; k++) {
          const a = rnd(131 + k, 137 - k) * Math.PI * 2, ay = c0 + 1 + ((rnd(139 + k, 141 + k) * th * 0.45) | 0);
          const d = fat * (1 - 0.6 * (ay - c0) / th) + 0.5;
          blob(tx + Math.round(Math.cos(a) * d), ay, tz + Math.round(Math.sin(a) * d), 1.4, k * 19);
        }
        blob(tx, h + th + 2, tz, 1.8, 41);
        // frozen spray round its foot
        for (let oz = -2; oz <= 2; oz++)
          for (let ox = -2; ox <= 2; ox++) {
            const d = Math.hypot(ox, oz);
            if (d < 0.9 || d > 2.3 || hash2(wx + ox * 61 + 5, wz + oz * 67 - 5) > 0.55) continue;
            putSoft(tx + ox, h + 1, tz + oz, B.ICE);
            if (hash2(wx + ox * 71 - 3, wz + oz * 73 + 3) < 0.3) putSoft(tx + ox, h + 2, tz + oz, B.ICE);
          }
      }
});
