'use strict';
/* biomes/terrain.js: terrainInfo(x, z), the heart of the land. From the fields it works out one column's height, its
   water, its temperature level and every mask the generator, the mesher and the game ask about (desert, snow, rime,
   dryland, hills, mountains, shore...).
   A part of makeBiomes' body (biomes/biomes.js). */

corePart('biomes.make', function () {
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
    // `bare`: the land as it lies before the rivers and lakes cut it, what their water levels are read from
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
      const cont   = fbm(x * 0.0016 * OS, z * 0.0016 * OS, 3) + CONT_LIFT;   // OS: oceans 3x bigger in rev 11
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
         2): two thirds the frequency, snow and desert from a lower threshold, and a desert is the hot
         climate itself, so every desert and snowfield is hundreds of blocks across. */
      const temp = _temp(x, z);
      let warm = _warm(temp);
      let cold = _cold(temp);

      // narrower band -> smaller plains; rev 18 half as much plains again (PLAINS_FROM, and half the warm band)
      let fPlains = smooth01(t, PLAINS_FROM, PLAINS_FROM + 0.1);
      let fDesert = BIG_CLIMATE ? warm : smooth01(t, 0.16, 0.28) * warm;  // wider band = bigger deserts; hot climate only
      let fSnow   = cold;                               // snowy surface in cold climate
      /* The spruce forest (rev 5): the chilly band next to the snow, where it is cold but not snowy — a forest there
         grows spruce. 1 from a fifth of the way to snow, 0 again where the snow begins. */
      let fTaiga = REV5 ? smooth01(cold, 0.12, 0.22) * (1 - smooth01(cold, 0.46, 0.5)) : 0;
      /* The climate ladder (rev 7): the level decides it all, each change eased over a fifth of a level. From
         warm (1) up there is no forest, only warm plains and then desert; cold (-1) is cold plains or spruce forest;
         snow from -2, deep snow at -3; red sand is the desert's hottest level (3) instead of patches in any desert. */
      // the level is reported in every world, for what grows where (genChunk); only the ladder builds biomes on it
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
      const fRime = RIME ? smooth01(-temp, RIME_FROM, RIME_TO) * fDeepSnow : 0;   // 0.836
      const rimeAir = RIME ? smooth01(-temp, RIME_AIR_FROM, RIME_TO) * fDeepSnow : 0;
      // rev 20: its forest half, by a slow noise of its own (about half), and how calm the open half lies here
      const rimeW = RIME2 ? smooth01(fbm(x * 0.0018 + 5511.3, z * 0.0018 - 3307.1, 2), -0.06, 0.06) : 1;
      const calm = RIME2 ? RIME_CALM * fRime * (1 - rimeW) : 0;
      // the Deep Desert (0.84, rev 21): the hottest heart of the deserts, and the heat that comes on a little before it
      const fDeepD = DESERT2 ? smooth01(temp, DD_FROM, DD_TO) * fDesert : 0;
      const ddAir = DESERT2 ? smooth01(temp, DD_AIR_FROM, DD_TO) * fDesert : 0;
      // ...and which half of it this is (rev 22): 1 the Deep Red Desert, 0 the (yellow) Deep Desert; all red before
      const ddRed = DESERT3 ? smooth01(fbm(x * 0.0017 + 8813.1, z * 0.0017 - 6611.3, 2), -0.06, 0.06) : 1;
      // the Dryland (rev 23): the warm plains' hot side, short of the desert
      const fDry = DRYLAND && LADDER ? smooth01(lvl + 0.3 * fbm(x * 0.0021 + 1771.3, z * 0.0021 - 4419.7, 2), DRY_FROM, DRY_TO) * (1 - fDesert) : 0;
      /* Deep forests (rev 5): their own patches inside forest country, where trees stand denser and grow bigger. */
      const deepF = REV5 ? smooth01(fbm(x * 0.0022 * BS + 3137.1, z * 0.0022 * BS - 1289.3, 2), 0.18, 0.34) : 0;

      // `flat` saturates at fPlains=0.5 — the exact point where the biome label flips to
      // Plains/Desert — so everywhere labelled Plains is genuinely flat (no half-suppressed
      // mountains leaking across the border band). A big desert is flat too, bar its dunes.
      const flat    = Math.min(1, Math.max(fPlains * 2, BIG_CLIMATE ? fDesert * 2 : 0));
      const hillAmp = (TALL ? 8.5 : 6) * (1 - flat) + (0.8 + 1.2 * fDesert) * flat;   // plains ~dead flat; deserts mostly flat too
      let mTerm     = mMask * ridge * ridge * (TALL ? 135 : 90) * (1 - flat);   // mountains only in forest zones; taller in rev 12
      /* rev 17: in places the mountains are broad (ridges at half the frequency) and flat on top (eased into a
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
      if (calm > 0) mTerm *= 1 - calm;                 // the open Coldest Deep Snow lies low
      // desert hills sub-biome: tall dunes / small sandy mountains with rocky tops
      // rarer dune hills = flatter deserts; biomeRev 3 about 30% fewer again
      const dhN    = fbm(x * 0.0035 * BS + 641.3, z * 0.0035 * BS - 141.7, 2);
      const dh     = (FEWER_HILLS ? smooth01(dhN, 0.33, 0.68) : smooth01(dhN, 0.25, 0.62)) * fDesert * (1 - fDeepD);   // none in the Deep Desert
      // red sand sub-desert: separate low-freq mask splits hot deserts into normal / red zones
      const fRed = (LADDER ? fRedL : smooth01(fbm(x * 0.00065 * BS - 911.7, z * 0.00065 * BS + 617.3, 2), 0.22, 0.36)) * fDesert;   // half freq = 2x patch size
      // red spike hills: narrow ridged spikes (all red sand — no sandstone yet), clustered
      // by their own hill mask so flat red desert and spike fields both exist
      const rdh = smooth01(fbm(x * 0.0035 * BS + 941.3, z * 0.0035 * BS - 241.7, 2), 0.1, 0.55) * fRed * (1 - fDeepD);
      // snowy hills (biomeRev 10): the snow's own rolling hills, in patches as the desert's dunes, up to ~26 high
      const sh = SNOW_HILLS ? smooth01(fbm(x * 0.0035 * BS - 1641.3, z * 0.0035 * BS + 1141.7, 2), 0.28, 0.62) * fSnow : 0;
      let h = 102 + cont * 16 + hills * hillAmp * (1 - 0.6 * calm) + mTerm + dh * 30 + sh * 26 * (1 - calm)   // calm: 0.837
            + (TALL ? Math.max(0, cont) * 22 : 0);    // rev 12: the land climbs the further inland it lies
      if (rdh > 0.01) {
        const sp = 1 - Math.abs(fbm(x * 0.045 + 77.7, z * 0.045 - 55.5, 2));
        h += Math.pow(smooth01(sp, 0.78, 0.97), 2) * 30 * rdh;
      }
      /* The Deep Desert's broken land (0.84, rev 21): tables 12-34 high in terraces of DD_TERRACE, shattered into blocks by
         two sets of cracks (each a noise's zero line) cut nearly to the floor, jagged ridges 8-24 high snaking between the
         tables, and a rough skin on all of it. Its crags, hoodoos and bones are genChunk's (worldgen/gen-chunk.js). */
      if (fDeepD > 0.01) {
        const mesa = smooth01(fbm(x * 0.0055 + 7711.3, z * 0.0055 - 2213.7, 3), -0.02, 0.06);
        let hm = 0;
        if (mesa > 0.001) {
          const top = 12 + 22 * (fbm(x * 0.0021 - 991.1, z * 0.0021 + 3313.3, 2) + 1) * 0.5;
          const s = mesa * top / DD_TERRACE;
          hm = DD_TERRACE * (Math.floor(s) + smooth01(s - Math.floor(s), 0.7, 1));
          const c1 = Math.abs(fbm(x * 0.017 + 311.1, z * 0.017 - 977.7, 2)), c2 = Math.abs(fbm(x * 0.009 - 1511.3, z * 0.026 + 615.9, 2));
          hm *= 1 - 0.8 * Math.max(1 - smooth01(c1, 0.015, 0.045), 1 - smooth01(c2, 0.012, 0.04));
        }
        const rg = 1 - Math.abs(fbm(x * 0.008 + 4421.7, z * 0.008 - 1733.1, 3));
        const ridge = Math.pow(smooth01(rg, 0.74, 0.97), 1.6) * (8 + 16 * (fbm(x * 0.004 + 2217.9, z * 0.004 - 819.3, 2) + 1) * 0.5) * (1 - mesa);
        const rough = fbm(x * 0.09 + 55.1, z * 0.09 - 77.3, 2) * 1.6 * Math.max(mesa, smooth01(rg, 0.7, 0.9));
        h += (hm + ridge + rough) * fDeepD;
      }
      /* Hills and cliffs (rev 14) so no land lies long flat: none on the sea floor or in the mountains (their
         own), less on the plains, little in a desert */
      let hlv = 0;                                     // the hills' own height here (names them)
      if (HILLS) {
        const land = smooth01(cont, -0.16, 0.02) * (1 - Math.min(1, mTerm / 30)) * (1 - 0.35 * fPlains) * (1 - 0.7 * fDesert);
        if (land > 0.01) {
          const size = (fbm(x * 0.006 - 811.9, z * 0.006 + 433.1, 2) + 1) * 0.5;          // small .. medium, by region
          /* rev 15: in places the hills are smoother (`smo`: wider, gentler, no crags, fewer cliffs), in others
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
          h += hl * land * (1 - calm);                 // the open Coldest Deep Snow only gently rolling
          hlv = hl * land * (1 - calm);
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
      const deepN = fbm(x * 0.0007 * OS + 1571.3, z * 0.0007 * OS - 733.1, 2);   // its deeps grow with it
      let deep = smooth01(deepN, DEEP_FROM, 0.70 + (REV5 ? 0.1 : 0)) * smooth01(-cont, 0.26, 0.52);
      deep = deep * deep * (3 - 2 * deep);              // ease the descent at BOTH ends
      h -= deep * 34;
      /* A rocky coast (rev 13): the low land just above the water is lifted SHORE_CLIFF_H, the sea floor not, so
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
      // sizes in every biome revision (only the land biomes grew).
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
        // rev 11: the drawn rivers are gone (FLOW traces real ones below); the lakes stay, as ponds
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
      /* The flowing rivers (rev 11): the channel at its own width and depth, its banks eased down to the water
         over a valley as wide as the land is high above it (so a river in the hills runs in a vale, not a slot). A
         river's end lake is a 'Lake'. Deserts and mountains do not stop them: a river crosses the sand, cuts a gorge. */
      let wl = WATER_LEVEL, fd = 0, ff = 0;                        // ff: a steep river's fast flow
      if (FLOW && !bare && UPLAND) {
        const rv0 = _riverAt(x, z);
        let rv = rv0;
        const lw = _lakeAt(x, z);
        if (lw && (!rv || _wetKey(lw) < _wetKey(rv))) rv = lw;
        if (rv) {
          let into = WET_EDGE - rv.edge;                            // into > 0: under the water
          /* a divide (rev 18): within DIV_REACH of another group's lower water this column is a dry ridge of the
             higher water's (its bank, at its top + 1); short of that, its bed rises toward the ridge (`toDiv`) */
          let toDiv = 1e9;
          if (DIVIDE && into > 0)
            for (const c of [...(rv0 && rv0.near || []), ...(lw && lw.near || [])])
              if (c !== rv && c.level < rv.level && !_kin(rv, c)) toDiv = Math.min(toDiv, c.edge - WET_EDGE - DIV_REACH);
          if (toDiv <= 0) into = Math.min(into, -0.01);
          const L = rv.level;
          if (into > 0) {
            /* the bed: shallow by the bank and deepest toward the middle, with humps and holes, so only some
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
            // a river's way for the flowing texture: 1-8, an eighth turn each from +x; a lake's water lies still
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
      /* An oasis (0.84, rev 21): the land eased flat to its ground a block over its water, over 14 outside its ragged ring,
         and its lake cut in, 1 deep at the edge and up to its own depth further in */
      let oas = 0;
      if (DESERT2 && !bare && fDesert > 0.5) {
        const O = _oasisAt(x, z);
        if (O) {
          const d = Math.hypot(x - O.x, z - O.z);
          const R = O.R * (1 + 0.18 * fbm(x * 0.03 + O.x * 0.11, z * 0.03 - O.z * 0.11, 2));
          const r = O.r * (1 + 0.28 * fbm(x * 0.07 - O.z * 0.13, z * 0.07 + O.x * 0.13, 2));
          const ease = 1 - smooth01(d, R, R + 14);
          if (ease > 0) h += (O.g + 1 - h) * ease;
          if (d < r) {
            const into = r - d;
            h = Math.min(h, O.g - 1, O.g - Math.min(O.d, 1 + into * 0.7) + fbm(x * 0.15 + 13.7, z * 0.15 - 41.3, 2) * 0.8);
            wl = O.g; lk = Math.max(lk, smooth01(into, 0, 0.6));
          }
          if (d < R) oas = 1;
        }
      }
      /* Seabed relief: broad lumps plus a ridged term for the occasional spike, faded to nothing at the shoreline
         and inside a river or lake bed, and clamped below water so a spike never surfaces as an island. */
      if (h < WATER_LEVEL) {
        // rev 16: the shore's floor falls away a third faster, with more relief near it: less flat shallows
        if (RIV2) h -= (WATER_LEVEL - h) * 0.3 * (1 - carveBed);
        const amp = Math.min(1, (WATER_LEVEL - h) / (RIV2 ? 5.5 : 8)) * (1 - carveBed * 0.9);
        const lump  = fbm(x * 0.018 + 1777.3, z * 0.018 - 2213.9, 3);
        const spike = 1 - Math.abs(fbm(x * 0.05 - 611.7, z * 0.05 + 733.1, 2));
        h += lump * 5.0 * amp;
        h += Math.pow(smooth01(spike, 0.93, 0.995), 2) * 2.0 * amp;
        h = Math.min(h, WATER_LEVEL - 1);
      }
      if (!UPLAND) h = capH(h);                        // the peaks ease into the cap, not shorn off on it
      h = Math.min(TALL ? TALL_CAP : 196, Math.max(4, Math.floor(h)));
      return { h, fPlains, fDesert, fSnow, dh, fRed, rdh, rT, lk, deep, warm, cold, fTaiga, deepF,
               fDeepSnow, lvl, air: LADDER ? climateAir(lvl) : null, sh, cliff, wl, fd, ff, mt: mTerm, hlv, fRime, rimeAir, rimeW,
               fDeepD, ddAir, oas, ddRed, fDry };          // 0.84; ddRed 0.841; fDry 0.8411
    }
});
