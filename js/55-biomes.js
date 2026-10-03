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
    { lvl: -2, to: -0.27, air: -16, biomes: 'Snow, Snow Forest, Snowy Mountains' },
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
    function terrainInfo(x, z) {
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
                 warm: 0, cold: 0, fTaiga: 0, deepF: 0, fDeepSnow: 0, lvl: 0, air: null };
      }
      const cont   = fbm(x * 0.0016, z * 0.0016, 3) + CONT_LIFT;
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

      let fPlains = smooth01(t, 0.0, 0.1);              // narrower band -> smaller plains
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
        fPlains = Math.max(fPlains, warm);
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
      const hillAmp = 6 * (1 - flat) + (0.8 + 1.2 * fDesert) * flat;       // plains ~dead flat; deserts mostly flat too
      const mTerm   = mMask * ridge * ridge * 90 * (1 - flat);             // mountains only in forest zones
      // desert hills sub-biome: tall dunes / small sandy mountains with rocky tops
      // rarer dune hills = flatter deserts; biomeRev 3 (0.8193) about 30% fewer again
      const dhN    = fbm(x * 0.0035 * BS + 641.3, z * 0.0035 * BS - 141.7, 2);
      const dh     = (FEWER_HILLS ? smooth01(dhN, 0.33, 0.68) : smooth01(dhN, 0.25, 0.62)) * fDesert;
      // red sand sub-desert: separate low-freq mask splits hot deserts into normal / red zones
      const fRed = (LADDER ? fRedL : smooth01(fbm(x * 0.00065 * BS - 911.7, z * 0.00065 * BS + 617.3, 2), 0.22, 0.36)) * fDesert;   // half freq = 2x patch size
      // red spike hills: narrow ridged spikes (all red sand — no sandstone yet), clustered
      // by their own hill mask so flat red desert and spike fields both exist
      const rdh = smooth01(fbm(x * 0.0035 * BS + 941.3, z * 0.0035 * BS - 241.7, 2), 0.1, 0.55) * fRed;
      let h = 102 + cont * 16 + hills * hillAmp + mTerm + dh * 30;
      if (rdh > 0.01) {
        const sp = 1 - Math.abs(fbm(x * 0.045 + 77.7, z * 0.045 - 55.5, 2));
        h += Math.pow(smooth01(sp, 0.78, 0.97), 2) * 30 * rdh;
      }
      /* Continental shelf -> oceans. The descent used to switch on the instant cont crossed -0.2,
         which left a crease all along that contour; the smoothstep eases it in over the same band
         the deep-ocean mask uses, and is fully 1 by -0.30 so open-ocean depth is unchanged. */
      if (cont < -0.2) h += (cont + 0.2) * 45 * smooth01(-cont, 0.20, 0.30);
      /* Deep ocean: separate low-freq mask carves broad abyssal basins well below the shelf.
         This is a 34-block drop, so ALL of its steepness lives in how fast the mask crosses 0..1: a low
         frequency, a wide mask band and a second smoothstep over the finished mask stretch it into a real
         continental slope, and the gate on `cont` starts only after the shelf descent has fully engaged. */
      const deepN = fbm(x * 0.0007 + 1571.3, z * 0.0007 - 733.1, 2);
      let deep = smooth01(deepN, DEEP_FROM, 0.70 + (REV5 ? 0.1 : 0)) * smooth01(-cont, 0.26, 0.52);
      deep = deep * deep * (3 - 2 * deep);              // ease the descent at BOTH ends
      h -= deep * 34;

      // rivers & lakes (fade out in deserts, oceans, real mountains). Carving is TWO-tier so
      // water never sits in a canyon: a broad `valley` mask first eases the surrounding land
      // gently down to a low rim, then a tighter `core` mask scoops a shallow basin. They keep their
      // sizes in every biome revision (0.823: only the land biomes grew).
      let rT = 0, lk = 0, carveBed = 0;   // carveBed 0..1: how far inside a river/lake channel
      // river/lake carving stays active across the continental shelf so a river mouth cuts
      // straight through to the ocean instead of fading out and leaving a beach ridge
      const landF = smooth01(cont, -0.30, -0.20) * (1 - fDesert) * (1 - Math.min(1, mTerm / 18));
      if (landF > 0.01) {
        const rn = 1 - Math.abs(fbm(x * 0.0014 + 1223.7, z * 0.0014 - 817.3, 2));   // river ridge (lower freq -> longer rivers)
        const ln = fbm(x * 0.0042 - 313.7, z * 0.0042 + 991.1, 2);                  // lake blobs
        // River WIDTH varies by region, and wide stretches also run deep — one noise field
        // drives both so the two always agree. wN 0 = narrow+shallow, 1 = wide+deep.
        const wN = (fbm(x * 0.0009 + 2411.7, z * 0.0009 - 1877.3, 2) + 1) * 0.5;
        const valley = Math.max(smooth01(ln, 0.18, 0.74), smooth01(rn, 0.34 - wN * 0.06, 0.95)) * landF;
        // core band 0.88-0.965 at wN=0: rivers are several blocks across at minimum
        const coreLo = 0.88 - wN * 0.10;
        const core   = Math.max(smooth01(ln, 0.64, 0.84), smooth01(rn, coreLo, 0.965)) * landF;
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
        rT = smooth01(rn, coreLo, 0.965) * landF;   // tracks the carve, so 'River' labels the real channel
        lk = smooth01(ln, 0.64, 0.84) * landF;
      }
      /* Seabed relief: broad lumps plus a ridged term for the occasional spike, faded to nothing at the shoreline
         and inside a river or lake bed, and clamped below water so a spike never surfaces as an island. */
      if (h < WATER_LEVEL) {
        const amp = Math.min(1, (WATER_LEVEL - h) / 8) * (1 - carveBed * 0.9);
        const lump  = fbm(x * 0.018 + 1777.3, z * 0.018 - 2213.9, 3);
        const spike = 1 - Math.abs(fbm(x * 0.05 - 611.7, z * 0.05 + 733.1, 2));
        h += lump * 5.0 * amp;
        h += Math.pow(smooth01(spike, 0.93, 0.995), 2) * 2.0 * amp;
        h = Math.min(h, WATER_LEVEL - 1);
      }
      h = Math.min(196, Math.max(4, Math.floor(h)));
      return { h, fPlains, fDesert, fSnow, dh, fRed, rdh, rT, lk, deep, warm, cold, fTaiga, deepF,
               fDeepSnow, lvl, air: LADDER ? climateAir(lvl) : null };
    }
    const heightAt = (x, z) => terrainInfo(x, z).h;

    // the sub-biome masks, one place for the generator (trees, hollow logs) and the labels alike
    const birchAt = (x, z) => fbm(x * 0.004 * BS + 1234, z * 0.004 * BS - 987, 2) > 0.35;
    const snowForestAt = (x, z) => fbm(x * 0.004 * BS + 2222, z * 0.004 * BS + 888, 2) > 0.25;
    // a place's climate word: warm or cold past a fifth of the way to desert or snow (0.823)
    const _clim = (ti) => ti.warm > 0.2 ? 'Warm ' : ti.cold > 0.2 ? 'Cold ' : '';

    // biome classification — used by the generator and by the HUD label on the main thread
    function biomeAt(x, z) {
      const ti = terrainInfo(x, z);
      const { h, fPlains, fDesert, fSnow, dh, fRed, rdh, rT, lk, deep, fTaiga, deepF, fDeepSnow } = ti;
      if (h < WATER_LEVEL) {
        if (rT > 0.3 && rT >= lk) return 'River';
        if (lk > 0.3) return 'Lake';
        // warm and cold oceans (0.823), their deep parts too
        if (deep > 0.45 && h < 84) return 'Deep ' + _clim(ti) + 'Ocean';
        return h < 94 ? _clim(ti) + 'Ocean' : 'Beach';
      }
      if (h <= WATER_LEVEL + 3) {
        // find nearest wet column and its type; ocean uses width 4..8, river/lake 2..4
        let hitType = 0, minD2 = 9999;
        for (let dz = -8; dz <= 8; dz++)
          for (let dx = -8; dx <= 8; dx++) {
            const tn = terrainInfo(x + dx, z + dz);
            if (tn.h >= WATER_LEVEL) continue;
            const ty = (tn.rT > 0.3 || tn.lk > 0.3) ? 2 : 1;
            const d2 = dx * dx + dz * dz;
            if (d2 < minD2) { minD2 = d2; hitType = ty; }
          }
        const bn = (fbm(x * 0.007 + 217.3, z * 0.007 - 803.7, 2) + 1) * 0.5;
        const width = hitType === 1 ? 4 + bn * 4 : 2 + bn * 2;
        const dist  = Math.sqrt(minD2);
        const dither = fbm(x * 0.02 + 401.3, z * 0.02 - 193.7, 2) * 0.8;
        if (hitType > 0 && dist < width + dither) {
          if (rT > 0.3 && rT >= lk) return 'River';
          if (lk > 0.3) return 'Lake';
          return 'Beach';
        }
      }
      if (fRed > 0.5) return rdh > 0.35 ? 'Red Sand Hills' : 'Red Sand';
      if (fDesert > 0.5) return dh > 0.35 ? 'Desert Hills' : 'Desert';
      if (fSnow > 0.5) {
        if (h > 132) return 'Snowy Mountains';
        if (fDeepSnow > 0.5) return 'Deep Snow';                         // the coldest level, treeless (0.8232)
        // snow forest sub-biome: same mask the tree pass uses; outside it snow is treeless
        return snowForestAt(x, z) ? 'Snow Forest' : 'Snow';
      }
      if (h > 132) return 'Mountains';
      if (fPlains > 0.5) return _clim(ti) + 'Plains';                  // warm and cold plains (0.823)
      const deepW = deepF > 0.5 ? 'Deep ' : '';                         // deep forests (0.823)
      if (fTaiga > 0.5) return deepW + 'Spruce Forest';
      if (birchAt(x, z)) return deepW + 'Birch Forest';
      return deepW + 'Forest';
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

    return { terrainInfo, heightAt, biomeAt, birchAt, snowForestAt, climAt };
  }
  // the names every biome-keyed list should treat alike (entity spawns, structures, mushrooms): the base name
  const biomeBase = (name) => String(name || '').replace(/^Deep /, '').replace(/^(Warm|Cold) /, '');
  return { makeBiomes, biomeBase, CLIMATE_LADDER };
}
const BIOMES = BIOME_CORE();
