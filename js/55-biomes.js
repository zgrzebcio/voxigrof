'use strict';
/* voxiGrof — biomes (0.823)

   The land's shape and what it is called, moved out of makeGen in 02-voxel-core.js: continents and oceans, the
   climate (a temperature field), the biome selector (forest / plains), hills, mountains, deserts, rivers and lakes
   — terrainInfo — the biome's name at a place (biomeAt), and the masks the generator and the mesher ask about
   (birchAt, snowForestAt, climAt). The generator still places the blocks, trees and decorations (genChunk, 02).

   BIOME_CORE is stringified into the mesh/worldgen worker beside VOXEL_CORE (10-workers.js), so like it, it must
   not touch anything outside itself: makeGen hands makeBiomes the world's noise and settings. It loads BEFORE
   02-voxel-core.js (index.html), whose makeGen calls BIOMES.makeBiomes.

   biomeRev, fixed per world when it is made (w.biomeRev), so a world's unexplored land always joins what it has:
     1  before 0.819
     2  bigger snow and desert (0.819)
     3  fewer desert hills (0.8193)
     4  pink warm beaches (0.822, genChunk)
     5  (0.823) every land biome half as big again; more land and fewer, smaller deep oceans; deep forests (oak,
        birch and spruce: denser, bigger trees); the spruce forest, cold but not snowy; cold plains with the odd
        spruce. Warm and cold plains and oceans are named in every world, and the grass is tinted by the climate
        (climAt since 0.8231) in every world: that changes no block.
     6  (0.8231) spruce forest trees stand on a bare stem 4..8 high (genChunk, 02)
     7  (0.8232) the climate ladder (CLIMATE_LADDER below): every land biome has a temperature level and only meets
        the levels either side of it, so a forest never borders a desert or the snow; red sand is the hottest level,
        deep snow the coldest. */
function BIOME_CORE() {
  /* The climate ladder (0.8232, biomeRev 7), coldest first: the biomes of each temperature level, `to` the value of the
     temperature field (about -1..1) where the next level begins, `air` what the level adds to the air's temperature in
     degrees (ambientTemp, 54-stats-effects.js). The temperature field is smooth, so the land steps through the levels
     one at a time. `biomes` is for reading only: which biome a level grows is decided in terrainInfo and biomeAt below.
     The edges share the land out about 8 / 17 / 15 / 20 / 15 / 17 / 8 % (spawn is pulled to level 0). */
  const CLIMATE_LADDER = [
    { lvl: -3, to: -0.51, air: -24, biomes: 'Deep Snow' },
    { lvl: -2, to: -0.27, air: -16, biomes: 'Snow, Snow Forest, Snowy Mountains, Ice Spikes (0.835), Snowy Hills (0.8351)' },
    { lvl: -1, to: -0.10, air: -7,  biomes: 'Cold Plains, Spruce Forest' },
    { lvl:  0, to:  0.10, air: 0,   biomes: 'Plains, Forest, Birch Forest, Mountains' },
    { lvl:  1, to:  0.27, air: 6,   biomes: 'Warm Plains' },
    { lvl:  2, to:  0.51, air: 14,  biomes: 'Desert, Desert Hills' },
    { lvl:  3,            air: 20,  biomes: 'Red Sand, Red Sand Hills' },
  ];
  const LADDER_LO = CLIMATE_LADDER[0].lvl, LADDER_HI = CLIMATE_LADDER[CLIMATE_LADDER.length - 1].lvl;
  // the temperature field as a smooth level: a level's own band runs from lvl - 0.5 to lvl + 0.5
  function climateLevel(temp) {
    const E = [];
    for (let i = 0; i < CLIMATE_LADDER.length - 1; i++) E.push(CLIMATE_LADDER[i].to);
    let i = 0;
    while (i < E.length && temp >= E[i]) i++;
    // the two outer levels are as wide as their neighbours
    const lo = i > 0 ? E[i - 1] : 2 * E[0] - E[1], hi = i < E.length ? E[i] : 2 * E[E.length - 1] - E[E.length - 2];
    const L = LADDER_LO + i - 0.5 + (temp - lo) / (hi - lo);
    return Math.max(LADDER_LO - 0.5, Math.min(LADDER_HI + 0.5, L));
  }
  // what the level adds to the air, eased between the levels' own values
  function climateAir(L) {
    const k = Math.max(LADDER_LO, Math.min(LADDER_HI - 1, Math.floor(L))), f = Math.max(0, Math.min(1, L - k));
    const a = CLIMATE_LADDER[k - LADDER_LO].air, b = CLIMATE_LADDER[k + 1 - LADDER_LO].air;
    return a + (b - a) * f;
  }

  function makeBiomes(o) {
    const { noise2, fbm, smooth01, seedInt, WATER_LEVEL, FLAT, FLAT_TOP, biomeRev } = o;
    const BIG_CLIMATE = biomeRev >= 2;
    const FEWER_HILLS = biomeRev >= 3;                // 0.8193: about 30% fewer desert hills
    const REV5 = biomeRev >= 5;                       // 0.823
    const LADDER = biomeRev >= 7;                     // 0.8232: the climate ladder
    const BIGGER = biomeRev >= 8;                     // 0.833: every biome twice as big again
    const SPIKES = biomeRev >= 9;                     // 0.835: the Ice Spikes biome, and icebergs in the snow's seas
    const SNOW_HILLS = biomeRev >= 10;                // 0.8351: Snowy Hills, and bigger icebergs (02)
    const FLOW = biomeRev >= 11;                      // 0.8353: oceans 3x bigger and rarer; rivers that flow to the sea
    const OS = FLOW ? 1 / 3 : 1;                      // the continents' scale: a third of the frequency, the same share of sea
    /* The world 250 tall (0.8354, biomeRev 12): the land inland rises higher, hills are taller, and mountains reach
       for TALL_CAP, eased into it above TALL_EASE so the highest peaks round off instead of being sheared flat. */
    const TALL = biomeRev >= 12, TALL_EASE = 196, TALL_CAP = 240;
    /* Shores (0.8356, biomeRev 13). Along the water a stretch of coast is, by a slow noise, a sand beach (about half),
       turf down to the water (most of the rest) or gravel (about 1 in 20): shoreKindAt, 0 turf, 1 sand, 2 gravel. Where
       cliffAt rises near the edge of a continent, the low land by the sea stands up as a rocky shore, SHORE_CLIFF_H
       blocks over the water (terrainInfo; its face is stone, genChunk). Beaches run 1-6 wide with ragged edges. */
    const SHORES = biomeRev >= 13, SHORE_ROCK = 0.45, SHORE_CLIFF_H = 11, SHORE_GRAVEL = -0.56, SHORE_SAND = 0.0;   // measured: 5% under -0.56, 50% under 0
    /* Hills, cliffs and wider beaches (0.83547, biomeRev 14). Small and medium hills in patches over the land, some of
       them steep crags, and cliffs (a step of 5-14 along a noise's contour, a plateau's edge) inland (terrainInfo); the
       rocky coasts more common, 8-20 high and sharper; sea beaches up to 10 wide. genChunk bares stone on a steep face,
       makes a pond of under 9 cells land again and runs a beach's sand or gravel on under the shallow water. */
    const HILLS = biomeRev >= 14;
    /* Uplands (0.83548, biomeRev 15): water at its own height. A flowing river's surface follows the land down (the
       lowest ground it has passed less one, so it only ever falls: a step, a little fall where the land drops) and its
       basin lakes lie at their rim; lakes of their own (_lakeAt, in place of the noise ponds) fill hollows and flats at
       any height, the mountains too. terrainInfo reports `wl`, the column's top water y (WATER_LEVEL for the sea), and
       a bank that falls away is raised to hold the water in. Beds deepen toward the middle, with humps and holes. The
       hills come smoother in some places and long and wide in others; genChunk adds rooms, tunnels, cave mouths,
       arches and overhangs. */
    const UPLAND = biomeRev >= 15, WET_EDGE = 2.4;    // a river or lake is water inside WET_EDGE of its bank line
    /* Lake rivers (0.835481, biomeRev 16): every river runs out of a lake, from the low point of its rim, downhill to
       another lake at or under it or to the sea (_lakeRiver; no bare springs), and steers round a lake standing higher
       than it. Its steps are spread (no more than 1 a stride where cutting at most 4 deeper can do it), it shallows
       toward its mouth, and cuts no trench into the sea floor. Lakes come bigger (to 60 across the short way) and
       longer (up to 1.6x), shores and banks ease out a third wider, a bank holding water back slopes off instead of
       standing up, and the sea floor falls away from the shore a third faster. */
    const RIV2 = biomeRev >= 16, LAKE_OUTLET = 0.9;
    /* Mountains and falls (0.83549, biomeRev 17). Some mountains are broad and flat-topped (`mesa`: their ridges at half
       the frequency, eased to a plateau), and mountain country is cut by valleys (`vl`, along a noise's zero line) that
       the drainage follows, so the lakes found in them send their rivers down them. A river stride that drops 3 or more
       does it at once, half way: a waterfall, with a plunge pool under it (genChunk hangs the falling water down the
       face). terrainInfo reports a river's way (`fd` 1-8, an eighth turn each from +x) for the flowing texture. */
    const FALLS = biomeRev >= 17;
    /* Divides (0.835491, biomeRev 18). Waters are grouped: a lake is its own group, a river carries its source's group,
       the lake it last left (`up`) and the one it runs into (`dn`). Where a column would be one water's but lies within
       3 of another group's lower water, it is a dry ridge at the higher water's top + 1 instead, so two waters at
       different heights never touch; only a river's own steps and falls (and into or out of its own lakes) do. A placed
       lake overlapping a lower one is not placed, and a river's basin lake sits on a 64-block lattice, sized and levelled
       by its cell alone, so two rivers trapped in one basin share one lake. Mountains are named from 150 (where the
       ridges, not the hills, make the height), raised land below or of hills is '<biome> Hills'; plains half as many. */
    const DIVIDE = biomeRev >= 18, DIV_REACH = 3, BASIN_CELL = 64, PLAINS_FROM = DIVIDE ? 0.28 : 0.0;
    // two waters that may meet at different heights: one group, or a river and a lake it leaves or enters
    const _kin = (a, b) => a.g === b.g || (!a.lake && b.lake && (a.up === b.g || a.dn === b.g)) || (!b.lake && a.lake && (b.up === a.g || b.dn === a.g));
    // the mountain valleys' depth 0..1 at a place, from the same mask the mountains use (0 outside mountain country)
    const _valley = (x, z) => FALLS ? smooth01(1 - Math.abs(fbm(x * 0.0025 + 3301.7, z * 0.0025 - 1907.3, 2)), 0.86, 0.975) : 0;
    const shoreKindAt = (x, z) => {
      const n = fbm(x * 0.006 + 4411.7, z * 0.006 - 2297.3, 2);
      return n < SHORE_GRAVEL ? 2 : n < SHORE_SAND ? 0 : 1;
    };
    // 0..1, how much a rocky coast this is: in patches, and only near a continent's edge (cont), where the sea is
    const cliffAt = (x, z, cont) => SHORES
      ? smooth01(fbm(x * 0.003 + 7123.1, z * 0.003 - 5511.9, 2), HILLS ? 0.24 : 0.32, HILLS ? 0.40 : 0.48) * (1 - smooth01(cont, -0.10, 0.04)) : 0;
    // a beach's width at a column: `type` 1 the sea, 2 a river or a lake; ragged, a slow width and two quicker wobbles on it
    const shoreWidth = (x, z, type) => {
      const bn = (fbm(x * 0.007 + 217.3, z * 0.007 - 803.7, 2) + 1) * 0.5;
      const rag = fbm(x * 0.02 + 401.3, z * 0.02 - 193.7, 2) * 1.6 + fbm(x * 0.09 - 77.7, z * 0.09 + 31.1, 2) * 1.2;
      return (type === 1 ? 1 + bn * (HILLS ? 9 : 5) : bn * 0.6) + rag;   // the sea's 1-10 in rev 14 (0.83547)
    };

    /* ---- flowing rivers (0.8353, biomeRev 11) ----
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
          /* The basin fills and spills over its lowest rim (0.8353), as water does: a lake here, and the river goes on
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
      /* rev 15 (0.83548): the water's top y at each point, the lowest ground passed so far less one, never under the sea's;
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
    /* A lake's river (rev 16, 0.835481): from the low point of the lake's rim downhill on _drain as _rivTrace walks, its
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
          // rev 18 (0.835491): under a fall the river spreads into a pool 1.7x as wide (and 1.5 more), so the whole lip
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
    /* Lakes of their own (rev 15, 0.83548): one cell in LAKE_CELL may hold one, tried at up to three spots, kept only where
       the ground is a flat or a hollow (its middle no more than 4 over the lowest of 16 points round it): its top is just
       under that rim. Any height, so the hills and the mountains have lakes; none by the sea or in a desert. */
    const LAKE_CELL = 160, LAKE_CHANCE = 0.55, _lakes = new Map(), _lakesKept = new Map();
    /* rev 18 (0.835491): a lake overlapping a lower placed lake is not placed, so two never meet at different heights */
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
          /* rev 16 (0.835481): twice the biggest (6-16 60%, 16-30 24%, 30-48 11%, 48-60 5%, across the short way), and
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
    // biome-scale noise at two thirds the frequency: 1.5x as big (rev 5); at a third: 3x the old, twice rev 5's (rev 8)
    const BS = BIGGER ? 1 / 3 : REV5 ? 1 / 1.5 : 1;
    const CONT_LIFT = REV5 ? 0.1 : 0;                 // the continents raised: less ocean, and less of it deep
    const DEEP_FROM = REV5 ? 0.05 : -0.20;            // ...and the abyssal mask starts later

    // the climate: one smooth temperature field (hot deserts, cold snow, a temperate band between)
    function _temp(x, z) {
      const f = (BIG_CLIMATE ? 0.0005 : 0.00075) * BS;
      let temp = fbm(x * f + 811.3, z * f - 442.1, 2);
      // temperate spawn: 99% of seeds pull the temperature toward 0 near the origin (see terrainInfo)
      if ((seedInt >>> 0) % 100 !== 0) {
        const bias = 1 - smooth01(Math.hypot(x, z), 120, 480);
        temp *= (1 - bias * 0.95);
      }
      return temp;
    }
    const _warm = (temp) => BIG_CLIMATE ? smooth01(temp, 0.0, 0.22) : smooth01(temp, 0.02, 0.30);
    const _cold = (temp) => BIG_CLIMATE ? smooth01(-temp, 0.0, 0.22) : smooth01(-temp, 0.02, 0.30);

    // world-space column terrain sample: continents + biome-weighted hills + ridged mountains.
    // The biome selector `t` sweeps forest -> plains -> desert; fPlains rises through BOTH
    // plains and desert (it flattens hills/mountains and fades out trees), while fDesert
    // separates desert from plains. Both factors are smooth 0..1 so borders blend seamlessly.
    // `bare` (0.83548): the land as it lies before the rivers and lakes cut it, what their water levels are read from
    function terrainInfo(x, z, bare) {
      /* Flat world: no continents, hills or mountains — just the slab top, with the SAME
         river/lake carving the normal generator uses so ponds still appear. Reporting
         fPlains = 1 makes every column read as Plains to the biome label, the decorators and
         the mob spawner, so nothing downstream needs a flat-world special case. */
      if (FLAT) {
        let h = FLAT_TOP;
        const rn = 1 - Math.abs(fbm(x * 0.0014 + 1223.7, z * 0.0014 - 817.3, 2));
        const ln = fbm(x * 0.0042 - 313.7, z * 0.0042 + 991.1, 2);
        const valley = Math.max(smooth01(ln, 0.18, 0.74), smooth01(rn, 0.34, 0.95));
        const core   = Math.max(smooth01(ln, 0.64, 0.84), smooth01(rn, 0.88, 0.965));
        if (valley > 0.001) {
          const rim = WATER_LEVEL + 1, floor = WATER_LEVEL - 3;
          let target = h + (rim - h) * valley;
          target += (floor - rim) * core;
          if (target < h) h = target;
        }
        return { h: Math.max(4, Math.floor(h)), fPlains: 1, fDesert: 0, fSnow: 0,
                 dh: 0, fRed: 0, rdh: 0,
                 rT: smooth01(rn, 0.88, 0.965), lk: smooth01(ln, 0.64, 0.84), deep: 0,
                 warm: 0, cold: 0, fTaiga: 0, deepF: 0, fDeepSnow: 0, lvl: 0, air: null, wl: WATER_LEVEL };
      }
      const cont   = fbm(x * 0.0016 * OS, z * 0.0016 * OS, 3) + CONT_LIFT;   // OS: oceans 3x bigger in rev 11 (0.8353)
      const hills  = fbm(x * 0.009 + 37.3, z * 0.009 - 11.7, 4);
      const ridge  = 1 - Math.abs(fbm(x * 0.004 + 91.1, z * 0.004 + 57.9, 3));
      const mMask  = smooth01((fbm(x * 0.0011 * BS - 71.7, z * 0.0011 * BS + 13.9, 2) + 1) * 0.5, 0.44, 0.74);

      // biome selector, domain-warped so borders meander instead of following the razor-straight contours of a
      // single low-frequency noise. The wobble is ~250 blocks long (x1.5 in rev 5), so a biome pocket is never a sliver.
      const bwx = x + noise2(x * 0.004 * BS + 313.1, z * 0.004 * BS - 97.7) * 80 / BS;
      const bwz = z + noise2(x * 0.004 * BS - 411.9, z * 0.004 * BS + 229.3) * 80 / BS;
      const t = fbm(bwx * 0.0009 * BS + 523.7, bwz * 0.0009 * BS - 331.9, 2);
      /* Climate temperature (its own low-frequency field): deserts need HOT, snow needs COLD, and one smooth field
         always has a temperate band between, so a snow biome never sits next to a desert. Bigger climates (biomeRev
         2, 0.819): two thirds the frequency, snow and desert from a lower threshold, and a desert is the hot
         climate itself, so every desert and snowfield is hundreds of blocks across. */
      const temp = _temp(x, z);
      let warm = _warm(temp);
      let cold = _cold(temp);

      // narrower band -> smaller plains; rev 18 (0.835491) half as much plains again (PLAINS_FROM, and half the warm band)
      let fPlains = smooth01(t, PLAINS_FROM, PLAINS_FROM + 0.1);
      let fDesert = BIG_CLIMATE ? warm : smooth01(t, 0.16, 0.28) * warm;  // wider band = bigger deserts; hot climate only
      let fSnow   = cold;                               // snowy surface in cold climate
      /* The spruce forest (rev 5): the chilly band next to the snow, where it is cold but not snowy — a forest there
         grows spruce. 1 from a fifth of the way to snow, 0 again where the snow begins. */
      let fTaiga = REV5 ? smooth01(cold, 0.12, 0.22) * (1 - smooth01(cold, 0.46, 0.5)) : 0;
      /* The climate ladder (rev 7, 0.8232): the level decides it all, each change eased over a fifth of a level. From
         warm (1) up there is no forest, only warm plains and then desert; cold (-1) is cold plains or spruce forest;
         snow from -2, deep snow at -3; red sand is the desert's hottest level (3) instead of patches in any desert. */
      // the level is reported in every world, for what grows where (0.8233, genChunk); only the ladder builds biomes on it
      const lvl = climateLevel(temp);
      let fDeepSnow = 0, fRedL = 0;
      if (LADDER) {
        const up = (a) => smooth01(lvl, a - 0.1, a + 0.1), down = (a) => smooth01(-lvl, a - 0.1, a + 0.1);
        warm = up(0.5); cold = down(0.5);
        fPlains = Math.max(fPlains, DIVIDE ? warm * smooth01(fbm(x * 0.0012 * BS + 1907.3, z * 0.0012 * BS - 2711.9, 2), -0.05, 0.05) : warm);
        fDesert = up(1.5);
        fRedL = up(2.5);
        fSnow = down(1.5);
        fDeepSnow = down(2.5);
        fTaiga = cold * (1 - fSnow);
      }
      /* Deep forests (rev 5): their own patches inside forest country, where trees stand denser and grow bigger. */
      const deepF = REV5 ? smooth01(fbm(x * 0.0022 * BS + 3137.1, z * 0.0022 * BS - 1289.3, 2), 0.18, 0.34) : 0;

      // `flat` saturates at fPlains=0.5 — the exact point where the biome label flips to
      // Plains/Desert — so everywhere labelled Plains is genuinely flat (no half-suppressed
      // mountains leaking across the border band). A big desert is flat too, bar its dunes (0.819).
      const flat    = Math.min(1, Math.max(fPlains * 2, BIG_CLIMATE ? fDesert * 2 : 0));
      const hillAmp = (TALL ? 8.5 : 6) * (1 - flat) + (0.8 + 1.2 * fDesert) * flat;   // plains ~dead flat; deserts mostly flat too
      let mTerm     = mMask * ridge * ridge * (TALL ? 135 : 90) * (1 - flat);   // mountains only in forest zones; taller in rev 12
      /* rev 17 (0.83549): in places the mountains are broad (ridges at half the frequency) and flat on top (eased into a
         plateau 45-85 over the land), and valleys cut down through mountain country to 15% of its height */
      if (FALLS && mMask > 0.01) {
        const mesa = smooth01(fbm(x * 0.0013 + 2711.9, z * 0.0013 - 4127.3, 2), 0.05, 0.3);
        if (mesa > 0.01) {
          const rw = 1 - Math.abs(fbm(x * 0.002 + 611.3, z * 0.002 - 177.9, 3));
          const m = mMask * rw * rw * 135 * (1 - flat);
          const top = 45 + 40 * (fbm(x * 0.003 - 913.1, z * 0.003 + 517.7, 2) + 1) * 0.5;
          mTerm += (top * smooth01(m / top, 0, 0.7) - mTerm) * mesa;
        }
        mTerm *= 1 - 0.85 * _valley(x, z) * mMask;
      }
      // desert hills sub-biome: tall dunes / small sandy mountains with rocky tops
      // rarer dune hills = flatter deserts; biomeRev 3 (0.8193) about 30% fewer again
      const dhN    = fbm(x * 0.0035 * BS + 641.3, z * 0.0035 * BS - 141.7, 2);
      const dh     = (FEWER_HILLS ? smooth01(dhN, 0.33, 0.68) : smooth01(dhN, 0.25, 0.62)) * fDesert;
      // red sand sub-desert: separate low-freq mask splits hot deserts into normal / red zones
      const fRed = (LADDER ? fRedL : smooth01(fbm(x * 0.00065 * BS - 911.7, z * 0.00065 * BS + 617.3, 2), 0.22, 0.36)) * fDesert;   // half freq = 2x patch size
      // red spike hills: narrow ridged spikes (all red sand — no sandstone yet), clustered
      // by their own hill mask so flat red desert and spike fields both exist
      const rdh = smooth01(fbm(x * 0.0035 * BS + 941.3, z * 0.0035 * BS - 241.7, 2), 0.1, 0.55) * fRed;
      // snowy hills (0.8351, biomeRev 10): the snow's own rolling hills, in patches as the desert's dunes, up to ~26 high
      const sh = SNOW_HILLS ? smooth01(fbm(x * 0.0035 * BS - 1641.3, z * 0.0035 * BS + 1141.7, 2), 0.28, 0.62) * fSnow : 0;
      let h = 102 + cont * 16 + hills * hillAmp + mTerm + dh * 30 + sh * 26
            + (TALL ? Math.max(0, cont) * 22 : 0);    // rev 12: the land climbs the further inland it lies (0.8354)
      if (rdh > 0.01) {
        const sp = 1 - Math.abs(fbm(x * 0.045 + 77.7, z * 0.045 - 55.5, 2));
        h += Math.pow(smooth01(sp, 0.78, 0.97), 2) * 30 * rdh;
      }
      /* Hills and cliffs (rev 14, 0.83547) so no land lies long flat: none on the sea floor or in the mountains (their
         own), less on the plains, little in a desert */
      let hlv = 0;                                     // the hills' own height here (0.835491: names them)
      if (HILLS) {
        const land = smooth01(cont, -0.16, 0.02) * (1 - Math.min(1, mTerm / 30)) * (1 - 0.35 * fPlains) * (1 - 0.7 * fDesert);
        if (land > 0.01) {
          const size = (fbm(x * 0.006 - 811.9, z * 0.006 + 433.1, 2) + 1) * 0.5;          // small .. medium, by region
          /* rev 15 (0.83548): in places the hills are smoother (`smo`: wider, gentler, no crags, fewer cliffs), in others
             long and wide (`lng`: ridges stretched 4x along one of two ways, cliffs twice as long and a little higher) */
          const smo = UPLAND ? smooth01(fbm(x * 0.0024 + 6151.3, z * 0.0024 - 2731.9, 2), -0.1, 0.25) : 0;
          const lng = UPLAND ? smooth01(fbm(x * 0.0021 - 5113.7, z * 0.0021 + 1771.3, 2), 0.0, 0.3) : 0;
          let hl = 0;
          // rolling hills ~30 across, 4-16 high, in patches over most of the land
          const patch = smooth01(fbm(x * 0.0035 + 2711.3, z * 0.0035 - 1913.7, 2), -0.2, 0.2);
          if (patch > 0.01) {
            let b = fbm(x * 0.022 + 1537.7, z * 0.022 - 2671.3, 3);
            if (lng > 0.01) {
              const way = smooth01(fbm(x * 0.0015 + 811.1, z * 0.0015 - 1411.9, 2), -0.1, 0.1);
              const ua = x * 0.8 + z * 0.6, va = -x * 0.6 + z * 0.8, ub = x * 0.26 - z * 0.97, vb = x * 0.97 + z * 0.26;
              const la = fbm(ua * 0.0055 + 2311.3, va * 0.022 - 717.9, 3), lb = fbm(ub * 0.0055 - 1903.1, vb * 0.022 + 3391.7, 3);
              b += ((la + (lb - la) * way) - b) * lng;
            }
            hl += patch * smooth01(b, -0.25 * smo, 0.6 + 0.4 * smo) * (4 + 12 * size) * (1 - 0.3 * smo);
          }
          // crags: here and there a steep knoll, sharp at the top
          const crag = smooth01(fbm(x * 0.0045 - 3917.3, z * 0.0045 + 2253.9, 2), 0.28, 0.46) * (1 - smo);
          if (crag > 0.01) {
            const k = smooth01(fbm(x * 0.04 + 611.3, z * 0.04 - 977.1, 2), 0.1, 0.6);
            hl += crag * k * k * (8 + 12 * size);
          }
          // cliffs: the land steps up along a contour, sharp or softer by a noise of its own
          const cm = smooth01(fbm(x * 0.0028 + 4471.9, z * 0.0028 - 3137.3, 2), 0.18, 0.4) * (1 - 0.7 * smo);
          if (cm > 0.01) {
            const soft = Math.min(1, (fbm(x * 0.005 + 917.3, z * 0.005 - 613.9, 2) + 1) * 0.5 + 0.5 * smo);
            let cs = fbm(x * 0.007 - 1291.7, z * 0.007 + 2081.3, 2);
            if (lng > 0.01) cs += (fbm(x * 0.0035 + 1733.9, z * 0.0035 - 2909.1, 2) - cs) * lng;
            hl += cm * smooth01(cs, 0.0, 0.025 + 0.09 * soft) * (5 + 9 * size) * (1 + 0.4 * lng);
          }
          h += hl * land;
          hlv = hl * land;
        }
      }
      /* Continental shelf -> oceans. The descent used to switch on the instant cont crossed -0.2,
         which left a crease all along that contour; the smoothstep eases it in over the same band
         the deep-ocean mask uses, and is fully 1 by -0.30 so open-ocean depth is unchanged. */
      if (cont < -0.2) h += (cont + 0.2) * 45 * smooth01(-cont, 0.20, 0.30);
      /* Deep ocean: separate low-freq mask carves broad abyssal basins well below the shelf.
         This is a 34-block drop, so ALL of its steepness lives in how fast the mask crosses 0..1: a low
         frequency, a wide mask band and a second smoothstep over the finished mask stretch it into a real
         continental slope, and the gate on `cont` starts only after the shelf descent has fully engaged. */
      const deepN = fbm(x * 0.0007 * OS + 1571.3, z * 0.0007 * OS - 733.1, 2);   // its deeps grow with it (0.8353)
      let deep = smooth01(deepN, DEEP_FROM, 0.70 + (REV5 ? 0.1 : 0)) * smooth01(-cont, 0.26, 0.52);
      deep = deep * deep * (3 - 2 * deep);              // ease the descent at BOTH ends
      h -= deep * 34;
      /* A rocky coast (0.8356, rev 13): the low land just above the water is lifted SHORE_CLIFF_H, the sea floor not, so
         the shore stands up as a cliff; higher land is left as it is. Before the rivers, so they cut down through it. */
      const cliff = cliffAt(x, z, cont);
      if (cliff > 0.001 && h > WATER_LEVEL - 0.5) {
        if (HILLS) {   // rev 14: 8-20 high, rising over a narrower band (sharper), and the land behind never dips under its top
          const ch = 8 + 12 * (fbm(x * 0.01 + 3311.7, z * 0.01 - 1717.3, 2) + 1) * 0.5;
          h += cliff * ch * smooth01(h, WATER_LEVEL - 0.5, WATER_LEVEL + 0.1) * (1 - smooth01(h, WATER_LEVEL + 4, WATER_LEVEL + 4 + 1.6 * ch));
        } else
          h += cliff * SHORE_CLIFF_H * smooth01(h, WATER_LEVEL - 0.5, WATER_LEVEL + 1) * (1 - smooth01(h, WATER_LEVEL + 6, WATER_LEVEL + 18));
      }
      // rev 15: the peaks eased before the water is cut, so a lake's level (read from the bare land) and its banks agree
      const capH = (v) => TALL && v > TALL_EASE ? TALL_EASE + (TALL_CAP - TALL_EASE) * (1 - Math.exp(-(v - TALL_EASE) / (TALL_CAP - TALL_EASE))) : v;
      if (UPLAND) h = capH(h);

      // rivers & lakes (fade out in deserts, oceans, real mountains). Carving is TWO-tier so
      // water never sits in a canyon: a broad `valley` mask first eases the surrounding land
      // gently down to a low rim, then a tighter `core` mask scoops a shallow basin. They keep their
      // sizes in every biome revision (0.823: only the land biomes grew).
      let rT = 0, lk = 0, carveBed = 0;   // carveBed 0..1: how far inside a river/lake channel
      // river/lake carving stays active across the continental shelf so a river mouth cuts
      // straight through to the ocean instead of fading out and leaving a beach ridge
      const landF = smooth01(cont, -0.30, -0.20) * (1 - fDesert) * (1 - Math.min(1, mTerm / 18));
      if (landF > 0.01 && !UPLAND) {                   // rev 15: no noise ponds, the lakes are placed (_lakeAt)
        const rn = 1 - Math.abs(fbm(x * 0.0014 + 1223.7, z * 0.0014 - 817.3, 2));   // river ridge (lower freq -> longer rivers)
        const ln = fbm(x * 0.0042 - 313.7, z * 0.0042 + 991.1, 2);                  // lake blobs
        // River WIDTH varies by region, and wide stretches also run deep — one noise field
        // drives both so the two always agree. wN 0 = narrow+shallow, 1 = wide+deep.
        const wN = (fbm(x * 0.0009 + 2411.7, z * 0.0009 - 1877.3, 2) + 1) * 0.5;
        // rev 11 (0.8353): the drawn rivers are gone (FLOW traces real ones below); the lakes stay, as ponds
        const rnF = FLOW ? 0 : 1;
        const valley = Math.max(smooth01(ln, 0.18, 0.74), rnF * smooth01(rn, 0.34 - wN * 0.06, 0.95)) * landF;
        // core band 0.88-0.965 at wN=0: rivers are several blocks across at minimum
        const coreLo = 0.88 - wN * 0.10;
        const core   = Math.max(smooth01(ln, 0.64, 0.84), rnF * smooth01(rn, coreLo, 0.965)) * landF;
        if (valley > 0.001) {
          // depth is a function of WIDTH: a narrow brook is ~3 below water, the widest channels ~11
          const rim = WATER_LEVEL + 1, depth = 3 + wN * 8, floor = WATER_LEVEL - depth;
          // flat bed, steep banks: `core` raised to a low power saturates as soon as you are inside the channel
          const bed = Math.pow(core, 0.35);
          let target = h + (rim - h) * valley;                     // ease land down to the rim
          target += (floor - rim) * bed;                           // then scoop the basin
          // ...and the bottom is not a mirror: two octaves of relief on the bed, fading out at the banks
          const bedRelief = fbm(x * 0.026 + 5501.3, z * 0.026 - 4417.9, 3) * 0.55
                          + fbm(x * 0.0060 - 2207.7, z * 0.0060 + 3313.1, 2) * 0.45;
          target += bedRelief * Math.min(2.4, depth * 0.34) * bed;
          if (target < h) { h = target; carveBed = bed; }          // only ever lower terrain
        }
        rT = rnF * smooth01(rn, coreLo, 0.965) * landF;   // tracks the carve, so 'River' labels the real channel
        lk = smooth01(ln, 0.64, 0.84) * landF;
      }
      /* The flowing rivers (rev 11, 0.8353): the channel at its own width and depth, its banks eased down to the water
         over a valley as wide as the land is high above it (so a river in the hills runs in a vale, not a slot). A
         river's end lake is a 'Lake'. Deserts and mountains do not stop them: a river crosses the sand, cuts a gorge. */
      let wl = WATER_LEVEL, fd = 0, ff = 0;                        // ff: a steep river's fast flow (0.835491)
      if (FLOW && !bare && UPLAND) {
        const rv0 = _riverAt(x, z);
        let rv = rv0;
        const lw = _lakeAt(x, z);
        if (lw && (!rv || _wetKey(lw) < _wetKey(rv))) rv = lw;
        if (rv) {
          let into = WET_EDGE - rv.edge;                            // into > 0: under the water
          /* a divide (rev 18, 0.835491): within DIV_REACH of another group's lower water this column is a dry ridge of the
             higher water's (its bank, at its top + 1); short of that, its bed rises toward the ridge (`toDiv`) */
          let toDiv = 1e9;
          if (DIVIDE && into > 0)
            for (const c of [...(rv0 && rv0.near || []), ...(lw && lw.near || [])])
              if (c !== rv && c.level < rv.level && !_kin(rv, c)) toDiv = Math.min(toDiv, c.edge - WET_EDGE - DIV_REACH);
          if (toDiv <= 0) into = Math.min(into, -0.01);
          const L = rv.level;
          if (into > 0) {
            /* the bed (0.83548): shallow by the bank and deepest toward the middle, with humps and holes, so only some
               of it lies flat; never less than a block of water. Rev 18: a lake's shore shelves off gently (a quarter
               wider, the humps and holes and most of the depth kept off the first blocks), and so does a divide's. */
            const span = rv.lake ? (DIVIDE ? Math.max(4, rv.w * 0.75) : Math.max(3, rv.w * 0.6)) : Math.max(1.5, rv.w + 1);
            let prof = smooth01(DIVIDE ? Math.min(into, toDiv) : into, 0, span);
            const pr2 = DIVIDE ? Math.pow(prof, 1.5) : prof;
            const rel = fbm(x * 0.085 + 5501.3, z * 0.085 - 4417.9, 2) * 2.0 + fbm(x * 0.022 - 2207.7, z * 0.022 + 3313.1, 2) * 2.2;
            const hole = Math.pow(smooth01(1 - Math.abs(fbm(x * 0.045 + 919.1, z * 0.045 - 3131.7, 2)), 0.84, 0.98), 2) * 4;
            let bottom = Math.min(L - 1, L - 1 - (rv.depth - 1) * (DIVIDE ? Math.pow(prof, 1.5) : prof) + (rel - hole) * pr2);
            if (RIV2 && h < L) bottom = Math.max(bottom, h - 1);   // under water already (a mouth in the sea): no trench (rev 16)
            if (rv.pool) bottom -= rv.pool * prof;                 // the plunge pool under a waterfall (rev 17)
            if (bottom < h) { h = bottom; carveBed = Math.max(carveBed, prof); }
            wl = L;
            // a river's way for the flowing texture (0.83549): 1-8, an eighth turn each from +x; a lake's water lies still
            if (!rv.lake && rv.vx !== undefined) fd = 1 + (((Math.round(Math.atan2(rv.vz, rv.vx) / (Math.PI / 4)) % 8) + 8) % 8);
            if (DIVIDE && fd && rv.drop >= 2) ff = 1;              // a stride dropping 2+ runs fast (rev 18)
          } else {
            // the banks eased down to the water over a vale as wide as the land stands over it (a third wider, rev 16)
            const vw = RIV2 ? Math.max(9, Math.min(52, (h - L) * 3)) : Math.max(6, Math.min(48, (h - L) * 2.2));
            const valley = 1 - smooth01(rv.edge, 0, vw);
            let target = h + (L + 1 - h) * valley;
            // rev 16: a river's vale stops short of a higher lake's rim, so the lake is never left standing over a cut
            if (RIV2 && !rv.lake && lw && lw.level > L && lw.edge < 14) target = Math.max(target, Math.min(h, lw.level + 1));
            if (target < h) h = target;
            if (L > WATER_LEVEL && h < L + 1) {
              // where the land falls away, a bank holds it in: a wall 1.6 thick (rev 15), a bank sloping off 1 in 2 (rev 16)
              if (RIV2) h = Math.max(h, L + 1 + into * 0.5);
              else if (into > -1.6) h = L + 1;
            }
          }
          const c = smooth01(into, 0, 0.6);
          if (rv.lake) lk = Math.max(lk, c); else rT = Math.max(rT, c);
        }
      } else if (FLOW && !bare) {
        const rv = _riverAt(x, z);
        if (rv) {
          const core = 1 - smooth01(rv.edge, 0, 2.5);
          const vw = Math.max(6, Math.min(48, (h - WATER_LEVEL) * 2.2));
          const valley = 1 - smooth01(rv.edge, 0, vw);
          if (valley > 0.001) {
            const rim = WATER_LEVEL + 1, floor = WATER_LEVEL - rv.depth, bed = Math.pow(core, 0.35);
            let target = h + (rim - h) * valley;
            target += (floor - rim) * bed;
            if (target < h) { h = target; carveBed = Math.max(carveBed, bed); }
          }
          if (rv.lake) lk = Math.max(lk, core); else rT = Math.max(rT, core);
        }
      }
      /* Seabed relief: broad lumps plus a ridged term for the occasional spike, faded to nothing at the shoreline
         and inside a river or lake bed, and clamped below water so a spike never surfaces as an island. */
      if (h < WATER_LEVEL) {
        // rev 16 (0.835481): the shore's floor falls away a third faster, with more relief near it: less flat shallows
        if (RIV2) h -= (WATER_LEVEL - h) * 0.3 * (1 - carveBed);
        const amp = Math.min(1, (WATER_LEVEL - h) / (RIV2 ? 5.5 : 8)) * (1 - carveBed * 0.9);
        const lump  = fbm(x * 0.018 + 1777.3, z * 0.018 - 2213.9, 3);
        const spike = 1 - Math.abs(fbm(x * 0.05 - 611.7, z * 0.05 + 733.1, 2));
        h += lump * 5.0 * amp;
        h += Math.pow(smooth01(spike, 0.93, 0.995), 2) * 2.0 * amp;
        h = Math.min(h, WATER_LEVEL - 1);
      }
      if (!UPLAND) h = capH(h);                        // the peaks ease into the cap, not shorn off on it (0.8354)
      h = Math.min(TALL ? TALL_CAP : 196, Math.max(4, Math.floor(h)));
      return { h, fPlains, fDesert, fSnow, dh, fRed, rdh, rT, lk, deep, warm, cold, fTaiga, deepF,
               fDeepSnow, lvl, air: LADDER ? climateAir(lvl) : null, sh, cliff, wl, fd, ff, mt: mTerm, hlv };
    }
    const heightAt = (x, z) => terrainInfo(x, z).h;

    // the sub-biome masks, one place for the generator (trees, hollow logs) and the labels alike
    const birchAt = (x, z) => fbm(x * 0.004 * BS + 1234, z * 0.004 * BS - 987, 2) > 0.35;
    const snowForestAt = (x, z) => fbm(x * 0.004 * BS + 2222, z * 0.004 * BS + 888, 2) > 0.25;
    // Ice Spikes (0.835, biomeRev 9): patches of the snow, below the mountains, standing with spikes of packed ice (02 genChunk)
    const iceSpikesAt = (x, z) => SPIKES && fbm(x * 0.004 * BS - 3311, z * 0.004 * BS + 1717, 2) > 0.36;
    // a place's climate word: warm or cold past a fifth of the way to desert or snow (0.823)
    const _clim = (ti) => ti.warm > 0.2 ? 'Warm ' : ti.cold > 0.2 ? 'Cold ' : '';

    // biome classification — used by the generator and by the HUD label on the main thread
    function biomeAt(x, z) {
      const ti = terrainInfo(x, z);
      const { h, fPlains, fDesert, fSnow, dh, fRed, rdh, rT, lk, deep, fTaiga, deepF, fDeepSnow, sh } = ti;
      if (h < ti.wl) {
        if (rT > 0.3 && rT >= lk) return 'River';
        if (lk > 0.3 || ti.wl > WATER_LEVEL) return 'Lake';   // water up in the land is a river's or a lake's (0.83548)
        // warm and cold oceans (0.823), their deep parts too
        if (deep > 0.45 && h < 84) return 'Deep ' + _clim(ti) + 'Ocean';
        return h < 94 ? _clim(ti) + 'Ocean' : 'Beach';
      }
      if (h <= WATER_LEVEL + 3) {
        // find nearest wet column and its type; ocean uses width 4..8, river/lake 2..4
        let hitType = 0, minD2 = 9999;
        const SR = HILLS ? 10 : 8;                       // the wider beaches (0.83547)
        for (let dz = -SR; dz <= SR; dz++)
          for (let dx = -SR; dx <= SR; dx++) {
            const tn = terrainInfo(x + dx, z + dz);
            if (tn.h >= tn.wl) continue;
            const ty = (tn.rT > 0.3 || tn.lk > 0.3) ? 2 : 1;
            const d2 = dx * dx + dz * dz;
            if (d2 < minD2) { minD2 = d2; hitType = ty; }
          }
        const bn = (fbm(x * 0.007 + 217.3, z * 0.007 - 803.7, 2) + 1) * 0.5;
        const width = hitType === 1 ? 4 + bn * 4 : 2 + bn * 2;
        const dist  = Math.sqrt(minD2);
        const dither = fbm(x * 0.02 + 401.3, z * 0.02 - 193.7, 2) * 0.8;
        // rev 13 (0.8356): the beach genChunk lays, and only where it is sand or gravel; turf to the water is the land's own biome
        if (SHORES ? hitType > 0 && dist < shoreWidth(x, z, hitType) : hitType > 0 && dist < width + dither) {
          if (rT > 0.3 && rT >= lk) return 'River';
          if (lk > 0.3) return 'Lake';
          if (!SHORES || (shoreKindAt(x, z) !== 0 && !(ti.cliff > SHORE_ROCK))) return 'Beach';
        }
      }
      if (fRed > 0.5) return rdh > 0.35 ? 'Red Sand Hills' : 'Red Sand';
      if (fDesert > 0.5) return dh > 0.35 ? 'Desert Hills' : 'Desert';
      /* rev 18 (0.835491): Mountains from 150, and only where the ridges make the height rather than the hills; raised land
         that is not that (the hills' own, or under 150 over 132) keeps its biome's name with 'Hills' */
      const mountain = DIVIDE ? h > 150 && (ti.mt || 0) >= (ti.hlv || 0) : h > 132;
      const hilly = DIVIDE && !mountain && ((ti.hlv || 0) > 7 || h > 132);
      if (fSnow > 0.5) {
        if (mountain) return 'Snowy Mountains';
        if (iceSpikesAt(x, z)) return 'Ice Spikes';                      // 0.835
        if (sh > 0.35 || hilly) return 'Snowy Hills';                    // 0.8351
        if (fDeepSnow > 0.5) return 'Deep Snow';                         // the coldest level, treeless (0.8232)
        // snow forest sub-biome: same mask the tree pass uses; outside it snow is treeless
        return snowForestAt(x, z) ? 'Snow Forest' : 'Snow';
      }
      if (mountain) return 'Mountains';
      if (fPlains > 0.5) return hilly ? 'Plains Hills' : _clim(ti) + 'Plains';   // warm and cold plains (0.823)
      const deepW = deepF > 0.5 && !hilly ? 'Deep ' : '';               // deep forests (0.823)
      const hl = hilly ? ' Hills' : '';
      if (fTaiga > 0.5) return deepW + 'Spruce Forest' + hl;
      if (birchAt(x, z)) return deepW + 'Birch Forest' + hl;
      return deepW + 'Forest' + hl;
    }

    /* The grass and water colour here (0.8231, was a dithered 0/1/2 tintAt in 0.823): -1 cold (dark grass, deep blue
       water) .. 0 the usual .. 1 warm (pale dry grass, cyan water). Smooth all the way, from the temperature field, with
       a slow wander of its own on top, so each stretch of land has a palette a little its own and nothing is speckled.
       Cheap enough for the mesher to ask at every column corner; nothing about the blocks changes. */
    function climAt(x, z) {
      const temp = _temp(x, z);
      // on the ladder (0.8232): half way at warm or cold plains, full in the desert and the snow
      const c = (LADDER ? climateLevel(temp) / 2 : smooth01(_warm(temp), 0.0, 0.3) - smooth01(_cold(temp), 0.0, 0.3))
              + fbm(x * 0.006 + 517.9, z * 0.006 - 331.3, 2) * 0.2;
      return c < -1 ? -1 : c > 1 ? 1 : c;
    }

    return { terrainInfo, heightAt, biomeAt, birchAt, snowForestAt, iceSpikesAt, climAt, SHORES, shoreKindAt, shoreWidth, HILLS, UPLAND, RIV2, FALLS, DIVIDE };
  }
  // the names every biome-keyed list should treat alike (entity spawns, structures, mushrooms): the base name
  // ...and a forest's or the plains' hills count as that forest or plain (0.835491)
  const biomeBase = (name) => String(name || '').replace(/^Deep /, '').replace(/^(Warm|Cold) /, '').replace(/^((?:Birch |Spruce )?Forest|Plains) Hills$/, '$1');
  return { makeBiomes, biomeBase, CLIMATE_LADDER };
}
const BIOMES = BIOME_CORE();
