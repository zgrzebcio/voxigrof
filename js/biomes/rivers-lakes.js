'use strict';
/* biomes/rivers-lakes.js: water on the land. Rivers traced downhill from lakes to the sea, basin and placed lakes,
   the steps and plunge pools of waterfalls, and which water a column belongs to (_riverAt, _lakeAt, _wetKey).
   A part of makeBiomes' body (biomes/biomes.js). */

corePart('biomes.make', function () {
    /* ---- flowing rivers (biomeRev 11) ----
       A river is traced, not drawn: from a spring well inland (one candidate per RIV_SPRING square, kept by chance) it
       walks downhill on the drainage field (_drain: the continent, and the mountains a river goes round) in RIV_STEP
       strides, turned a little by a slow noise so it meanders, until it reaches the sea. One that finds no way further
       down (a basin) or runs out of RIV_MAX_STEPS ends in a lake. It starts a brook and widens as it goes. The traced
       segments go in buckets of RIV_BUCKET blocks, each spread by how far a river's valley reaches, so a column only
       reads its own bucket. Every spring a bucket could be reached from is traced the first time the bucket is asked
       for, and kept: a pure function of the seed, so every thread and every chunk agrees. */
    const RIV_SPRING = 224, RIV_SPRING_CHANCE = 0.45, RIV_SPRING_INLAND = 0.08;
    const RIV_STEP = 12, RIV_MAX_STEPS = 220, RIV_REACH = RIV_STEP * RIV_MAX_STEPS;
    const RIV_BASIN = 6, RIV_LAKE_MIN = 15;           // no fall over this many steps is a basin; a lake ends a river this long
    const RIV_SPILLS = 3;                             // basins a river may fill and spill out of on its way
    const RIV_BUCKET = 64, RIV_INFL = 56;              // a valley reaches at most ~48 past the bank
    const RIV_SEA = -0.22;                            // continent value under which the land is under water
    const _rivTraced = new Set(), _rivIndex = new Map(), _rivReady = new Set();
    const _rh = (a, b, s) => {                        // a hash of a spring cell, 0..1
      let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 1442695041)) ^ seedInt;
      h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    const _contAt = (x, z) => fbm(x * 0.0016 * OS, z * 0.0016 * OS, 3) + CONT_LIFT;
    /* the land's lie for water: the continent in blocks, and the mountain country a river would rather go round. Only
       the slow fields: the ridges' own noise made a basin every few hundred blocks, and every river died in one. */
    function _drain(x, z) {
      const mm = smooth01((fbm(x * 0.0011 * BS - 71.7, z * 0.0011 * BS + 13.9, 2) + 1) * 0.5, 0.44, 0.74);
      return _contAt(x, z) * 16 + mm * 30 - (FALLS ? _valley(x, z) * mm * 14 : 0);   // rev 17: down the mountain valleys
    }
    function _rivAdd(seg, x0, z0, x1, z1) {
      for (let bz = Math.floor((z0 - RIV_INFL) / RIV_BUCKET); bz <= Math.floor((z1 + RIV_INFL) / RIV_BUCKET); bz++)
        for (let bx = Math.floor((x0 - RIV_INFL) / RIV_BUCKET); bx <= Math.floor((x1 + RIV_INFL) / RIV_BUCKET); bx++) {
          const k = bx + ',' + bz;
          let l = _rivIndex.get(k);
          if (!l) _rivIndex.set(k, l = []);
          l.push(seg);
        }
    }
    function _rivTrace(gx, gz) {
      const key = gx + ',' + gz;
      if (_rivTraced.has(key)) return;
      _rivTraced.add(key);
      if (_rh(gx, gz, 1) > RIV_SPRING_CHANCE) return;
      let x = (gx + 0.15 + 0.7 * _rh(gx, gz, 2)) * RIV_SPRING, z = (gz + 0.15 + 0.7 * _rh(gx, gz, 3)) * RIV_SPRING;
      if (_contAt(x, z) < RIV_SPRING_INLAND) return;  // springs rise well inland
      const pts = [[x, z]], hist = [], lakes = [];
      let e = _drain(x, z), sea = false, px = 0, pz = 0, spills = 0;
      for (let s = 0; s < RIV_MAX_STEPS; s++) {
        const gxv = _drain(x + 4, z) - e, gzv = _drain(x, z + 4) - e, len = Math.hypot(gxv, gzv);
        let dx = len > 1e-7 ? -gxv / len : px, dz = len > 1e-7 ? -gzv / len : pz;
        // it keeps half its way (momentum), so a little dip is crossed rather than drowned in
        if (s > 0) { dx = dx * 0.5 + px * 0.5; dz = dz * 0.5 + pz * 0.5; }
        const dl = Math.hypot(dx, dz);
        if (dl < 1e-7) break;
        dx /= dl; dz /= dl;
        px = dx; pz = dz;
        const a = noise2(x * 0.004 + 913.7, z * 0.004 - 277.1) * 0.5, ca = Math.cos(a), sa = Math.sin(a);
        const mx = dx * ca - dz * sa, mz = dx * sa + dz * ca;    // the meander, on top of the way it keeps
        x += mx * RIV_STEP; z += mz * RIV_STEP;
        pts.push([x, z]);
        if (_contAt(x, z) < RIV_SEA) { sea = true; break; }
        hist.push(e);
        e = _drain(x, z);
        // no fall at all over the last RIV_BASIN steps: it is in a basin
        if (hist.length >= RIV_BASIN && e > hist[hist.length - RIV_BASIN] - 0.05) {
          /* The basin fills and spills over its lowest rim, as water does: a lake here, and the river goes on
             from the lowest ground found round it, cutting through the rim. With none lower near, it stays a lake. */
          if (spills >= RIV_SPILLS) break;
          let best = null, be = e - 0.3;
          for (let r = 48; r <= 192 && !best; r += 48)
            for (let k = 0; k < 16; k++) {
              const ang = k / 16 * Math.PI * 2, sx = x + Math.cos(ang) * r, sz = z + Math.sin(ang) * r, se = _drain(sx, sz);
              if (se < be) { be = se; best = [sx, sz]; }
            }
          if (!best) break;
          lakes.push([x, z, pts.length]);
          spills++;
          const [sx, sz] = best, n = Math.max(1, Math.ceil(Math.hypot(sx - x, sz - z) / RIV_STEP));
          for (let j = 1; j <= n; j++) pts.push([x + (sx - x) * j / n, z + (sz - z) * j / n]);
          const dl2 = Math.hypot(sx - x, sz - z) || 1;
          px = (sx - x) / dl2; pz = (sz - z) / dl2;
          x = sx; z = sz; e = be; hist.length = 0;
          if (_contAt(x, z) < RIV_SEA) { sea = true; break; }
        }
      }
      if (pts.length < 4 || (!sea && pts.length < RIV_LAKE_MIN)) return;   // a spring that goes nowhere is no river
      // a brook at the spring, about 7 wide near its end; deeper as it goes
      const hw = (i) => Math.min(0.5 + i * 0.25, 0.9 + 2.4 * Math.min(1, i / 90));
      const dp = (i) => 2 + 3 * Math.min(1, i / 90);
      if (!sea) lakes.push([...pts[pts.length - 1], pts.length]);   // trapped for good: it ends in a lake
      const lakeR = (at) => 8 + Math.min(20, at / 5);               // each lake as big as the river was long when it came to it
      /* rev 15: the water's top y at each point, the lowest ground passed so far less one, never under the sea's;
         a lake stops at its rim (the lowest of 16 points round it), and the river leaves it no higher */
      const lv = new Array(pts.length).fill(WATER_LEVEL), lakeLv = new Map();
      if (UPLAND) {
        const lakeAtPt = new Map();
        for (const lk of lakes) lakeAtPt.set(lk[2] - 1, lk);
        let s = 1e9;
        for (let i = 0; i < pts.length; i++) {
          s = Math.min(s, Math.floor(terrainInfo(pts[i][0], pts[i][1], true).h) - 1);
          const lk = lakeAtPt.get(i);
          if (lk) {
            const rr = lakeR(lk[2]) + 4;
            for (let a = 0; a < 16; a++)
              s = Math.min(s, Math.floor(terrainInfo(lk[0] + Math.cos(a * Math.PI / 8) * rr, lk[1] + Math.sin(a * Math.PI / 8) * rr, true).h) - 1);
            lakeLv.set(lk, Math.max(WATER_LEVEL, s));
          }
          lv[i] = Math.max(WATER_LEVEL, s);
        }
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        _rivAdd({ ax, az, bx, bz, ha: hw(i), hb: hw(i + 1), da: dp(i), db: dp(i + 1), la: lv[i], lb: lv[i + 1] },
                Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
      }
      for (const lk of lakes) {
        const [lx, lz, at] = lk, r = lakeR(at);
        _rivAdd({ lake: true, x: lx, z: lz, r, d: 3 + Math.min(3, at / 40), lv: lakeLv.get(lk) ?? WATER_LEVEL }, lx - r, lz - r, lx + r, lz + r);
      }
    }
    /* A lake's river (rev 16): from the low point of the lake's rim downhill on _drain as _rivTrace walks, its
       top y the lowest ground passed less one (held at the lake's own level to the rim). It ends in the sea, in another
       lake no higher than it (it runs to the middle at that lake's level), or trapped in a lake of its own; a basin on
       the way fills and spills as before. A lake higher than it pushes it away, so no lake is left perched over a
       river's cut. Then its steps are spread back upstream (a fall over 1 a stride is cut into, up to 4 deep), keeping
       every lake's level as it is. */
    function _lakeRiver(lgx, lgz) {
      const key = 'L' + lgx + ',' + lgz;
      if (_rivTraced.has(key)) return;
      _rivTraced.add(key);
      const src = _lakeDef(lgx, lgz);
      if (!src || _rh(lgx, lgz, 71) > LAKE_OUTLET) return;
      let [x, z] = src.out, s = src.lv, e = _drain(x, z);
      const pts = [[src.x, src.z], [x, z]], lvs = [s, s], fixed = new Set([0, 1]), lakes = [], hist = [];
      const lakeAtIdx = new Map([[0, src.id]]);                    // rev 18: which lake a point lies in the middle of
      let px = x - src.x, pz = z - src.z, sea = false, joined = null, spills = 0;
      { const l = Math.hypot(px, pz) || 1; px /= l; pz /= l; }
      for (let st = 0; st < RIV_MAX_STEPS && !joined; st++) {
        const gxv = _drain(x + 4, z) - e, gzv = _drain(x, z + 4) - e, len = Math.hypot(gxv, gzv);
        let dx = len > 1e-7 ? -gxv / len : px, dz = len > 1e-7 ? -gzv / len : pz;
        dx = dx * 0.5 + px * 0.5; dz = dz * 0.5 + pz * 0.5;
        for (const M of _lakesNear(x, z, 40)) {                    // round a lake higher than the water here
          if (M === src || M.lv <= s) continue;
          const d = _lakeDist(M, x, z) - M.r, dd = Math.hypot(x - M.x, z - M.z) || 1;
          if (d < 26) { dx += (x - M.x) / dd * (26 - d) / 10; dz += (z - M.z) / dd * (26 - d) / 10; }
        }
        const dl = Math.hypot(dx, dz);
        if (dl < 1e-7) break;
        dx /= dl; dz /= dl; px = dx; pz = dz;
        const a = noise2(x * 0.004 + 913.7, z * 0.004 - 277.1) * 0.5, ca = Math.cos(a), sa = Math.sin(a);
        x += (dx * ca - dz * sa) * RIV_STEP; z += (dx * sa + dz * ca) * RIV_STEP;
        pts.push([x, z]);
        if (_contAt(x, z) < RIV_SEA) { sea = true; lvs.push(WATER_LEVEL); break; }
        s = Math.max(WATER_LEVEL, Math.min(s, Math.floor(terrainInfo(x, z, true).h) - 1));
        lvs.push(s);
        // into a lake at or under it (rev 17: from 12 off its shore, so a river never runs along a lake far below it)
        for (const M of _lakesNear(x, z, FALLS ? 16 : 8))
          if (M !== src && M.lv <= s && _lakeDist(M, x, z) - M.r < (FALLS ? 12 : 5)) { joined = M; break; }
        if (joined) {
          lvs[lvs.length - 1] = joined.lv; fixed.add(lvs.length - 1);
          pts.push([joined.x, joined.z]); lvs.push(joined.lv); fixed.add(lvs.length - 1);
          lakeAtIdx.set(lvs.length - 1, joined.id);
          break;
        }
        hist.push(e);
        e = _drain(x, z);
        if (hist.length >= RIV_BASIN && e > hist[hist.length - RIV_BASIN] - 0.05) {   // a basin: it fills and spills
          const at = pts.length;
          if (DIVIDE) {
            /* rev 18: the basin's lake is its lattice cell's (shared by every river trapped there), when it lies no higher
               than the river; the river runs to its middle at its level, and spills on from there */
            const BL = _basinLake(x, z);
            if (BL && BL.lv <= s) {
              pts.push([BL.x, BL.z]); s = BL.lv; lvs.push(s); fixed.add(lvs.length - 1);
              lakes.push(BL); lakeAtIdx.set(lvs.length - 1, BL.id);
              x = BL.x; z = BL.z; e = _drain(x, z);
            }
            if (spills >= RIV_SPILLS) break;
          } else {
          const rr = 8 + Math.min(20, at / 5) + 4;
          let ring = 1e9;
          for (let k = 0; k < 16; k++) ring = Math.min(ring, Math.floor(terrainInfo(x + Math.cos(k * Math.PI / 8) * rr, z + Math.sin(k * Math.PI / 8) * rr, true).h) - 1);
          s = Math.max(WATER_LEVEL, Math.min(s, ring));
          lvs[lvs.length - 1] = s; fixed.add(lvs.length - 1);
          if (spills >= RIV_SPILLS) break;
          }
          let best = null, be = e - 0.3;
          for (let r = 48; r <= 192 && !best; r += 48)
            for (let k = 0; k < 16; k++) {
              const ang = k / 16 * Math.PI * 2, sx = x + Math.cos(ang) * r, sz = z + Math.sin(ang) * r, se = _drain(sx, sz);
              if (se < be) { be = se; best = [sx, sz]; }
            }
          if (!best) break;
          if (!DIVIDE) lakes.push([x, z, at, s]);
          spills++;
          const [sx, sz] = best, n = Math.max(1, Math.ceil(Math.hypot(sx - x, sz - z) / RIV_STEP));
          for (let j = 1; j <= n; j++) { pts.push([x + (sx - x) * j / n, z + (sz - z) * j / n]); lvs.push(s); }
          const dl2 = Math.hypot(sx - x, sz - z) || 1;
          px = (sx - x) / dl2; pz = (sz - z) / dl2;
          x = sx; z = sz; e = be; hist.length = 0;
          if (_contAt(x, z) < RIV_SEA) { sea = true; lvs[lvs.length - 1] = WATER_LEVEL; break; }
        }
      }
      if (pts.length < 3) return;
      if (DIVIDE && !sea && !joined) {                             // trapped: it ends in its basin's lattice lake, if any (rev 18)
        const BL = _basinLake(x, z);
        if (BL && BL.lv <= lvs[lvs.length - 1]) {
          pts.push([BL.x, BL.z]); lvs.push(BL.lv); fixed.add(lvs.length - 1);
          lakes.push(BL); lakeAtIdx.set(lvs.length - 1, BL.id);
        }
      } else if (!sea && !joined) {                                // trapped for good: it ends in a lake, at its rim
        const at = pts.length, rr = 8 + Math.min(20, at / 5) + 4;
        let l = lvs[lvs.length - 1];
        for (let k = 0; k < 16; k++) l = Math.min(l, Math.floor(terrainInfo(x + Math.cos(k * Math.PI / 8) * rr, z + Math.sin(k * Math.PI / 8) * rr, true).h) - 1);
        l = Math.max(WATER_LEVEL, l);
        lvs[lvs.length - 1] = l;
        lakes.push([x, z, at, l]);
        fixed.add(lvs.length - 1);
      }
      if (!DIVIDE) for (const lk of lakes) fixed.add(lk[2] - 1);
      // spread the steps back upstream: at most 1 a stride, cutting at most 4 under the natural level
      const lv0 = lvs.slice();
      for (let i = lvs.length - 2; i >= 0; i--)
        if (!fixed.has(i)) lvs[i] = Math.min(lvs[i], Math.max(lvs[i + 1] + 1, lv0[i] - 4));
      const n = pts.length, ends = sea || !!joined;
      const hw = (i) => Math.min(1 + i * 0.25, 0.9 + 2.4 * Math.min(1, i / 90));
      // deeper as it goes, shallowing over its last three strides into the sea or a lake
      const dp = (i) => (2 + 3 * Math.min(1, i / 90)) * (ends ? Math.max(0.35, Math.min(1, (n - 1 - i) / 3)) : 1);
      // rev 18: each stride's group (its source), the lake it last left (`up`) and the one it runs into next (`dn`)
      const ups = new Array(n), dns = new Array(n);
      for (let i = 0, u = src.id; i < n; i++) { if (lakeAtIdx.has(i)) u = lakeAtIdx.get(i); ups[i] = u; }
      for (let i = n - 1, d = null; i >= 0; i--) { dns[i] = d; if (lakeAtIdx.has(i)) d = lakeAtIdx.get(i); }
      for (let i = 0; i + 1 < n; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        _rivAdd({ ax, az, bx, bz, ha: hw(i), hb: hw(i + 1), da: dp(i), db: dp(i + 1), la: lvs[i], lb: lvs[i + 1],
                  g: src.id, up: ups[i], dn: dns[i] },
                Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
      }
      if (DIVIDE) for (const L of lakes) _rivAdd({ lake: true, x: L.x, z: L.z, r: L.r, d: L.d, lv: L.lv, g: L.id }, L.x - L.r, L.z - L.r, L.x + L.r, L.z + L.r);
      else for (const [lx, lz, at, l] of lakes) {
        const r = 8 + Math.min(20, at / 5);
        _rivAdd({ lake: true, x: lx, z: lz, r, d: 3 + Math.min(3, at / 40), lv: l }, lx - r, lz - r, lx + r, lz + r);
      }
    }
    /* a basin's own lake (rev 18): one per BASIN_CELL square, at its middle, 10-22 across the radius, its top just under the
       lowest of 16 points round it; none where a placed lake already lies (a river trapped there joins or passes that) */
    const _basins = new Map();
    function _basinLake(x, z) {
      const gx = Math.floor(x / BASIN_CELL), gz = Math.floor(z / BASIN_CELL), id = 'B' + gx + ',' + gz;
      if (_basins.has(id)) return _basins.get(id);
      const cx = (gx + 0.5) * BASIN_CELL, cz = (gz + 0.5) * BASIN_CELL, r = 10 + 12 * _rh(gx, gz, 91), rr = r + 4;
      let ring = 1e9;
      for (let k = 0; k < 16; k++)
        ring = Math.min(ring, Math.floor(terrainInfo(cx + Math.cos(k * Math.PI / 8) * rr, cz + Math.sin(k * Math.PI / 8) * rr, true).h) - 1);
      let b = { id, x: cx, z: cz, r, lv: Math.max(WATER_LEVEL, ring), d: 3 + 3 * _rh(gx, gz, 93) };
      for (const M of _lakesNear(cx, cz, r + 12))
        if (Math.hypot(cx - M.x, cz - M.z) < M.r * M.el * 1.3 + r + 10) { b = null; break; }
      _basins.set(id, b);
      return b;
    }
    // which of two waters a column belongs to (rev 15): any it lies in beats one it only lies near, the lower the better
    const _wetKey = (w) => UPLAND && w.edge < WET_EDGE ? -1e4 + w.level + w.edge * 1e-3 : w.edge;
    // the river (or a river's lake) nearest this column: how far outside its bank (negative: in it), and its depth
    function _riverAt(x, z) {
      const bx = Math.floor(x / RIV_BUCKET), bz = Math.floor(z / RIV_BUCKET), k = bx + ',' + bz;
      if (!_rivReady.has(k)) {
        _rivReady.add(k);
        const R = RIV_REACH + RIV_BUCKET + RIV_INFL;   // any spring whose river could pass within a valley of this bucket
        const cx = (bx + 0.5) * RIV_BUCKET, cz = (bz + 0.5) * RIV_BUCKET;
        const cell = RIV2 ? LAKE_CELL : RIV_SPRING, trace = RIV2 ? _lakeRiver : _rivTrace;   // rev 16: every lake's river
        for (let gz = Math.floor((cz - R) / cell); gz <= Math.floor((cz + R) / cell); gz++)
          for (let gx = Math.floor((cx - R) / cell); gx <= Math.floor((cx + R) / cell); gx++) trace(gx, gz);
      }
      const segs = _rivIndex.get(k);
      if (!segs) return null;
      let best = null, bk = 1e9;
      const near = DIVIDE ? [] : null;                            // rev 18: every water within reach of a divide
      for (const s of segs) {
        let w;
        if (s.lake) w = { edge: Math.hypot(x - s.x, z - s.z) - s.r, depth: s.d, lake: true, level: s.lv ?? WATER_LEVEL, w: s.r, g: s.g };
        else {
          const vx = s.bx - s.ax, vz = s.bz - s.az, L2 = vx * vx + vz * vz;
          const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / L2)) : 0;
          const drop = s.la - s.lb, fall = FALLS && drop >= 3;
          // rev 18: under a fall the river spreads into a pool 1.7x as wide (and 1.5 more), so the whole lip
          // falls into water instead of half of it onto a bank raised into pillars between the sheets
          const hw = (s.ha + (s.hb - s.ha) * t) * (DIVIDE && fall && t >= 0.5 && t < 0.85 ? 1.7 : 1) + (DIVIDE && fall && t >= 0.5 && t < 0.85 ? 1.5 : 0);
          // rev 17: a stride dropping 3+ falls all at once half way, into a pool under it; its way, for the flowing texture
          w = { edge: Math.hypot(x - s.ax - vx * t, z - s.az - vz * t) - hw, depth: s.da + (s.db - s.da) * t, lake: false,
                level: fall ? (t < 0.5 ? s.la : s.lb) : Math.floor(s.la + (s.lb - s.la) * t), w: hw,
                pool: fall && t >= 0.5 && t < 0.8 ? Math.min(3, drop / 3) : 0, vx, vz, drop, g: s.g, up: s.up, dn: s.dn };
        }
        if (near && w.edge < WET_EDGE + DIV_REACH) near.push(w);
        const key = _wetKey(w);
        if (key < bk) { bk = key; best = w; }
      }
      if (best && near) best.near = near;
      return best && best.edge < RIV_INFL ? best : null;
    }
    /* Lakes of their own (rev 15): one cell in LAKE_CELL may hold one, tried at up to three spots, kept only where
       the ground is a flat or a hollow (its middle no more than 4 over the lowest of 16 points round it): its top is just
       under that rim. Any height, so the hills and the mountains have lakes; none by the sea or in a desert. */
    const LAKE_CELL = 160, LAKE_CHANCE = 0.55, _lakes = new Map(), _lakesKept = new Map();
    /* rev 18: a lake overlapping a lower placed lake is not placed, so two never meet at different heights */
    function _lakeDef(gx, gz) {
      if (!DIVIDE) return _lakeDefRaw(gx, gz);
      const key = gx + ',' + gz;
      if (_lakesKept.has(key)) return _lakesKept.get(key);
      let L = _lakeDefRaw(gx, gz);
      for (let dz = -2; dz <= 2 && L; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const M = (dx || dz) ? _lakeDefRaw(gx + dx, gz + dz) : null;
          if (M && M.lv < L.lv && Math.hypot(L.x - M.x, L.z - M.z) < (L.r * L.el + M.r * M.el) * 1.3 + 10) { L = null; break; }
        }
      _lakesKept.set(key, L);
      return L;
    }
    function _lakeDefRaw(gx, gz) {
      const key = gx + ',' + gz;
      if (_lakes.has(key)) return _lakes.get(key);
      let def = null;
      if (_rh(gx, gz, 31) < LAKE_CHANCE)
        for (let k = 0; k < (FALLS ? 8 : 4) && !def; k++) {        // 8 tries in rev 17, so the valleys find theirs
          const x = (gx + 0.1 + 0.8 * _rh(gx, gz, 32 + k)) * LAKE_CELL, z = (gz + 0.1 + 0.8 * _rh(gx, gz, 40 + k)) * LAKE_CELL;
          // most small (6-16), a quarter bigger (16-28), now and then a big one (30-42)
          const sz = _rh(gx, gz, 48 + k);
          let r = sz < 0.7 ? 6 + 10 * sz / 0.7 : sz < 0.95 ? 16 + 12 * (sz - 0.7) / 0.25 : 30 + 12 * (sz - 0.95) / 0.05;
          /* rev 16: twice the biggest (6-16 60%, 16-30 24%, 30-48 11%, 48-60 5%, across the short way), and
             long: stretched up to 1.6x (a little for a small one) along a way of its own */
          let el = 1, ca = 1, sa = 0;
          if (RIV2) {
            r = sz < 0.6 ? 6 + 10 * sz / 0.6 : sz < 0.84 ? 16 + 14 * (sz - 0.6) / 0.24 : sz < 0.95 ? 30 + 18 * (sz - 0.84) / 0.11 : 48 + 12 * (sz - 0.95) / 0.05;
            el = 1 + (r > 12 ? 0.6 : 0.25) * _rh(gx, gz, 60 + k);
            const an = _rh(gx, gz, 64 + k) * Math.PI;
            ca = Math.cos(an); sa = Math.sin(an);
          }
          const c = terrainInfo(x, z, true);
          if (c.h < WATER_LEVEL + 3 || c.fDesert > 0.5) continue;
          // rev 17: a lake up in a mountain valley lies along it, 1.6-2.4 times as long as it is wide
          if (FALLS && c.h > 125 && _valley(x, z) > 0.3) {
            const f0 = fbm(x * 0.0025 + 3301.7, z * 0.0025 - 1907.3, 2);
            const gx2 = fbm((x + 4) * 0.0025 + 3301.7, z * 0.0025 - 1907.3, 2) - f0, gz2 = fbm(x * 0.0025 + 3301.7, (z + 4) * 0.0025 - 1907.3, 2) - f0;
            const gl = Math.hypot(gx2, gz2) || 1;
            ca = -gz2 / gl; sa = gx2 / gl; el = 1.6 + 0.8 * _rh(gx, gz, 68 + k); r = Math.min(r, 22);
          }
          const rr = r * 1.3 + 4;
          let ring = 1e9, out = null;
          for (let a = 0; a < 16; a++) {
            const lu = Math.cos(a * Math.PI / 8) * rr * el, lw = Math.sin(a * Math.PI / 8) * rr;
            const ox = x + lu * ca - lw * sa, oz = z + lu * sa + lw * ca, g = terrainInfo(ox, oz, true).h;
            if (g < ring) { ring = g; out = [ox, oz]; }               // the low point of the rim: where its river leaves (rev 16)
          }
          // a slope or a top holds no lake; in the mountains a tarn may be cut into a shelf up to 14 over its rim
          if (c.h > ring + 4 + 10 * smooth01(c.h, 128, 160)) continue;
          const level = Math.min(ring - 1, c.h + 1);
          if (level > WATER_LEVEL + 1) def = { id: 'P' + key, x, z, r, lv: level, d: 3 + 4 * _rh(gx, gz, 56 + k), el, ca, sa, out };
        }
      _lakes.set(key, def);
      return def;
    }
    // how far from a lake's middle, in its short-way blocks (a long lake's long way counts el times less)
    const _lakeDist = (L, x, z) => {
      const dx = x - L.x, dz = z - L.z;
      return Math.hypot((dx * L.ca + dz * L.sa) / L.el, -dx * L.sa + dz * L.ca);
    };
    // the lakes whose shore lies within `pad` of here (by the middle's distance)
    function _lakesNear(x, z, pad) {
      const gx = Math.floor(x / LAKE_CELL), gz = Math.floor(z / LAKE_CELL), out = [], N = RIV2 ? 2 : 1;
      for (let dz = -N; dz <= N; dz++)
        for (let dx = -N; dx <= N; dx++) {
          const L = _lakeDef(gx + dx, gz + dz);
          if (L && Math.hypot(x - L.x, z - L.z) <= L.r * L.el * 1.3 + pad) out.push(L);
        }
      return out;
    }
    function _lakeAt(x, z) {
      let best = null, bk = 1e9;
      const near = DIVIDE ? [] : null;
      for (const L of _lakesNear(x, z, RIV_INFL)) {
        const d = _lakeDist(L, x, z);
        // a ragged shore: the radius wanders by up to 30%
        const w = { edge: d - L.r * (1 + 0.3 * fbm(x * 0.035 + L.x * 0.37, z * 0.035 - L.z * 0.37, 2)), depth: L.d, lake: true, level: L.lv, w: L.r, g: L.id };
        if (near && w.edge < WET_EDGE + DIV_REACH) near.push(w);
        const key = _wetKey(w);
        if (key < bk) { bk = key; best = w; }
      }
      if (best && near) best.near = near;
      return best && best.edge < RIV_INFL ? best : null;
    }
});
