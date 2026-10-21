'use strict';
/* biomes/queries.js: the questions asked of the land. heightAt, biomeAt (a place's name), birchAt, snowForestAt,
   iceSpikesAt, rimeOpenAt, dryAt, climAt (the climate colour), and makeBiomes' return.
   The last part of makeBiomes' body (biomes/biomes.js). */

corePart('biomes.make', function () {
    const heightAt = (x, z) => terrainInfo(x, z).h;

    // the sub-biome masks, one place for the generator (trees, hollow logs) and the labels alike
    const birchAt = (x, z) => fbm(x * 0.004 * BS + 1234, z * 0.004 * BS - 987, 2) > 0.35;
    const snowForestAt = (x, z) => fbm(x * 0.004 * BS + 2222, z * 0.004 * BS + 888, 2) > 0.25;
    // Ice Spikes (biomeRev 9): patches of the snow, below the mountains, standing with spikes of packed ice (02 genChunk)
    const iceSpikesAt = (x, z) => SPIKES && fbm(x * 0.004 * BS - 3311, z * 0.004 * BS + 1717, 2) > 0.36;
    /* Mountains all round (x, z): six or more of the eight points DRY_MIN / 2 + 1 away are mountains by biomeAt's rule. A pocket
       narrower than DRY_MIN has its rim beyond all eight; the mountains' edge has open land on one side. */
    // the land's height round (x, z): the mean of the column (h) and eight points 6 blocks away
    function _meanH(x, z, h) {
      const r = 6, k = Math.SQRT1_2 * r;
      let s = h;
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [k, k], [-k, k], [k, -k], [-k, -k]])
        s += terrainInfo(Math.round(x + dx), Math.round(z + dz)).h;
      return s / 9;
    }
    function _mountainPocket(x, z) {
      const r = DRY_MIN / 2 + 1, k = Math.SQRT1_2;
      let n = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [k, k], [-k, k], [k, -k], [-k, -k]]) {
        const tn = terrainInfo(Math.round(x + dx * r), Math.round(z + dz * r));
        if (tn.h > 150 && (tn.mt || 0) >= (tn.hlv || 0)) n++;
      }
      return n >= 6;
    }
    // a place's climate word: warm or cold past a fifth of the way to desert or snow
    const _clim = (ti) => ti.warm > 0.2 ? 'Warm ' : ti.cold > 0.2 ? 'Cold ' : '';

    // biome classification — used by the generator and by the HUD label on the main thread
    function biomeAt(x, z) {
      const ti = terrainInfo(x, z);
      const { h, fPlains, fDesert, fSnow, dh, fRed, rdh, rT, lk, deep, fTaiga, deepF, fDeepSnow, sh } = ti;
      if ((ti.oas || 0) > 0.5) return 'Oasis';                          // its lake too
      if (h < ti.wl) {
        if (rT > 0.3 && rT >= lk) return 'River';
        if (lk > 0.3 || ti.wl > WATER_LEVEL) return 'Lake';   // water up in the land is a river's or a lake's
        // warm and cold oceans, their deep parts too
        if (deep > 0.45 && h < 84) return 'Deep ' + _clim(ti) + 'Ocean';
        return h < 94 ? _clim(ti) + 'Ocean' : 'Beach';
      }
      // a deep beach's sand and the sandy band behind it (rev 31)
      if (DBEACH && (ti.db || 0) > 0.5 && ti.dbd < DB_BAND[1] && h >= ti.wl && ti.wl === WATER_LEVEL) return 'Deep Beach';
      if (h <= WATER_LEVEL + 3) {
        // find nearest wet column and its type; ocean uses width 4..8, river/lake 2..4
        let hitType = 0, minD2 = 9999;
        const SR = HILLS ? 10 : 8;                       // the wider beaches
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
        // rev 13: the beach genChunk lays, and only where it is sand or gravel; turf to the water is the land's own biome
        if (SHORES ? hitType > 0 && dist < shoreWidth(x, z, hitType) : hitType > 0 && dist < width + dither) {
          if (rT > 0.3 && rT >= lk) return 'River';
          if (lk > 0.3) return 'Lake';
          if (!SHORES || (shoreKindAt(x, z) !== 0 && !(ti.cliff > SHORE_ROCK))) return 'Beach';
        }
      }
      // the hot heart of the deserts, in two halves since 0.841 (rev 22)
      if ((ti.fDeepD || 0) > 0.5) return DESERT3 && ti.ddRed > 0.5 ? 'Deep Red Desert' : 'Deep Desert';
      if (fRed > 0.5) return rdh > 0.35 ? 'Red Sand Hills' : 'Red Sand';
      if (fDesert > 0.5) return dh > 0.35 ? 'Desert Hills' : 'Desert';
      /* rev 18: Mountains from 150, and only where the ridges make the height rather than the hills; raised land
         that is not that (the hills' own, or under 150 over 132) keeps its biome's name with 'Hills' */
      /* rev 33: near 150 the height the label reads is the mean round the column (_meanH): a mountain's flank or saddle
         hovering at 150 no longer speckles into one-block pockets of the land's biome */
      const mtH = DRY4 && DIVIDE && Math.abs(h - 150) <= 8 ? _meanH(x, z, h) : h;
      const mountain = DIVIDE ? mtH > 150 && (ti.mt || 0) >= (ti.hlv || 0) : h > 132;
      const hilly = DIVIDE && !mountain && ((ti.hlv || 0) > 7 || h > 132);
      if (fSnow > 0.5) {
        if (mountain) return 'Snowy Mountains';
        // no ice spikes or hills of its own name in it; its Forest half since 0.837 (rev 20)
        if ((ti.fRime || 0) > 0.5) return RIME2 && ti.rimeW > 0.5 ? 'Coldest Deep Snow Forest' : 'Coldest Deep Snow';
        if (iceSpikesAt(x, z)) return 'Ice Spikes';                      // 0.835
        if (sh > 0.35 || hilly) return 'Snowy Hills';                    // 0.8351
        if (fDeepSnow > 0.5) return 'Deep Snow';                         // the coldest level, treeless
        // snow forest sub-biome: same mask the tree pass uses; outside it snow is treeless
        return snowForestAt(x, z) ? 'Snow Forest' : 'Snow';
      }
      if (mountain) return 'Mountains';
      const sav = (ti.fSav || 0) > 0.5, dry = !sav && (ti.fDry || 0) > 0.5;
      // rev 33: a pocket of either among the mountains, under DRY_MIN across, is the mountains' too
      if ((sav || dry) && DRY4 && DIVIDE && h > 135 && _mountainPocket(x, z)) return 'Mountains';
      if (sav) return 'Savanna';                                        // the Dryland's hot edge (rev 28)
      if (dry) return 'Dryland';                                        // 0.8411
      if (fPlains > 0.5) return hilly ? 'Plains Hills' : _clim(ti) + 'Plains';   // warm and cold plains
      const deepW = deepF > 0.5 && !hilly ? 'Deep ' : '';               // deep forests
      const hl = hilly ? ' Hills' : '';
      if (fTaiga > 0.5) return deepW + 'Spruce Forest' + hl;
      if (birchAt(x, z)) return deepW + 'Birch Forest' + hl;
      return deepW + 'Forest' + hl;
    }

    /* The grass and water colour here (was a dithered 0/1/2 tintAt in 0.823): -1 cold (dark grass, deep blue
       water) .. 0 the usual .. 1 warm (pale dry grass, cyan water). Smooth all the way, from the temperature field, with
       a slow wander of its own on top, so each stretch of land has a palette a little its own and nothing is speckled.
       Cheap enough for the mesher to ask at every column corner; nothing about the blocks changes. */
    /* The open Coldest Deep Snow by its fields alone (the snow castle's sites, entities/frozen-king.js): the same fRime and
       rimeW terrainInfo works out, but only those few noises — microseconds, where biomeAt costs milliseconds. It does not
       know about water or mountains; a site it finds is checked with biomeAt and heightAt (on a worker) after. */
    function rimeOpenAt(x, z) {
      if (!RIME2 || !LADDER) return false;
      const temp = _temp(x, z);
      const fDeepSnow = smooth01(-climateLevel(temp), 2.4, 2.6);
      if (smooth01(-temp, RIME_FROM, RIME_TO) * fDeepSnow <= 0.5) return false;
      return smooth01(fbm(x * 0.0018 + 5511.3, z * 0.0018 - 3307.1, 2), -0.06, 0.06) <= 0.5;
    }
    /* The grass's colour by dryness here, for the mesher to ask at every column corner like climAt: 0 the usual green,
       DRY_PALE (biomes/biomes.js) the Dryland's pale grass, 1 the Savanna's golden grass beyond it. From terrainInfo's
       own fields alone (`fDry`, `fSav`). The grass fades from green to pale over the Dryland's whole edge, tens of
       blocks, and from pale to gold over the Savanna's, instead of block by block (the dry and green blocks dithered
       there since 0.8411 read as a checkerboard, the two colours being so far apart). The shader (04-materials.js)
       reads the same scale. */
    function dryAt(x, z) {
      if (!DRYLAND || !LADDER) return 0;
      const lvl = climateLevel(_temp(x, z)), wob = _dryBand(x, z, lvl)[0], shift = _dryOut[1];   // biomes/terrain.js
      const d = smooth01(wob, DRY_LO - shift, DRY_HI - shift);
      if (d <= 0) return 0;
      const s = SAVANNA ? smooth01(wob, SAV_LO, SAV_HI) : 0;
      return (d * DRY_PALE + s * (1 - DRY_PALE)) * (1 - smooth01(lvl, DESERT_LVL - 0.1, DESERT_LVL + 0.1));   // not where the desert has begun (fDesert)
    }
    function climAt(x, z) {
      const temp = _temp(x, z);
      // on the ladder: half way at warm or cold plains, full in the desert and the snow
      const c = (LADDER ? climateLevel(temp) / 2 : smooth01(_warm(temp), 0.0, 0.3) - smooth01(_cold(temp), 0.0, 0.3))
              + fbm(x * 0.006 + 517.9, z * 0.006 - 331.3, 2) * 0.2;
      return c < -1 ? -1 : c > 1 ? 1 : c;
    }

    return { terrainInfo, heightAt, biomeAt, birchAt, snowForestAt, iceSpikesAt, climAt, dryAt, rimeOpenAt, SHORES, shoreKindAt, shoreWidth, HILLS, UPLAND, RIV2, FALLS, DIVIDE, RIME, RIME2, DESERT2, DESERT3, DRYLAND, SAVANNA, SAV2,
             DBEACH, DB_SAND, DB_BAND };
});
