'use strict';
/* worldgen/gen-setup.js: makeGen's set-up. The switches by biomeRev, the world's noise functions, the land asked from
   BIOMES (terrainInfo, biomeAt...), banded desert rock, and the hashes placement is rolled from.
   A part of makeGen's body (worldgen/make-gen.js): the parts after it use these names. */

corePart('gen.make', function () {
    const FLAT = terrainType === 'flat';
    const PINK_BEACHES = biomeRev >= 4;               // warm beaches run pink in places
    const PINK_FROM = biomeRev >= 34 ? 0.28 : 0.1;    // ...where their noise passes this: about half as much from rev 34
    /* rev 35: a deep beach's pink in smaller patches (its own finer noise, DB_PINK_F, and DB_PINK_UP higher), and a quarter fewer caves: no noise
       caves where CAVE_GATE's slow field is low (worldgen/underground.js), and ROOM_SHARE of the room cells hold a room
       (worldgen/gen-caves-plan.js); the caves that are there keep their size */
    const REV35 = biomeRev >= 35, DB_PINK_F = 0.075, DB_PINK_UP = 0.1, CAVE_GATE = -0.27, ROOM_SHARE = REV35 ? 0.6 : 0.8;
    /* rev 36: ore veins a tenth more often, coal and the rock patches as they were (ORE_MORE_K, worldgen/underground.js), and the
       Savanna's tall grass half again as common and its tall dry grass nearly four times (SAV_TALL, SAV_DRY_TALL, worldgen/ground-plants.js);
       its land lies flatter too (SAV_FLAT, biomes/fields.js) */
    const REV36 = biomeRev >= 36, ORE_MORE_K = 1.1, SAV_TALL = REV36 ? 0.24 : 0.16, SAV_DRY_TALL = REV36 ? 0.03 : 0.008;
    /* rev 37: a quarter more cobwebs (WEB_CH, worldgen/underground.js), 30% more cave lava pools (LAVA_POOL_CH, same file) and 40%
       more lava mushrooms (LAVA_SHROOM_CH, worldgen/cave-floors.js). Each only raises its roll's threshold: what an older rev
       placed is still placed */
    const REV37 = biomeRev >= 37, WEB_CH = REV37 ? 0.003125 : 0.0025, LAVA_POOL_CH = REV37 ? 0.104 : 0.08, LAVA_SHROOM_CH = REV37 ? 0.021 : 0.015;
    /* rev 38: clams on warm sea floors, CLAM_TOP and under (worldgen/desert-and-shore-plants.js), in beds CLAM_BED_F across;
       each one a CLAM_CH chance in a bed. Rolled on hashes of place only, after everything else on the floor */
    const REV38 = biomeRev >= 38, CLAM_TOP = 93, CLAM_CH = 0.05, CLAM_BED_F = 0.03;
    // rev 39: no two clams nearer than CLAM_APART blocks (of the places the hashes pick, the one ranked higher keeps it)
    const REV39 = biomeRev >= 39, CLAM_APART = 5;
    // rev 40: coal, iron, copper and tin lie higher, their veins' best band and top moved up (ORE_HIGH, worldgen/underground.js)
    const REV40 = biomeRev >= 40;
    /* rev 41: wild carrots, small patches on the mild (level 0) plains, mostly in the flowery meadows: a CARROT_MEADOW
       chance a chunk there, CARROT_PLAINS on the rest of the plains (worldgen/ground-plants.js); about wild wheat's rate on
       that land (its two tries of 0.144 / 0.0288) */
    const REV41 = biomeRev >= 41, CARROT_MEADOW = 0.29, CARROT_PLAINS = 0.058;
    /* rev 44: sugar cane CANE_HOT_MUL times as often on a shore by the Jungle, a desert (sand or red sand) or the Savanna: the
       shore column or one within 2 of it (worldgen/desert-and-shore-plants.js). It only raises the seed chance there */
    const REV44 = biomeRev >= 44, CANE_HOT_MUL = 2.5;
    // rev 45: vines on the giant jungle trees, down their trunks and from their leaves (woods/jungle-trees.js, gen-jungle.js)
    const VINES = biomeRev >= 45;
    const TALL_SPRUCE = biomeRev >= 6;                // spruce forest trees on a bare stem
    const LADDER = biomeRev >= 7;                     // the climate ladder (biomes/biomes.js)
    const SPIKES = biomeRev >= 9;                     // the Ice Spikes biome and the snow's icebergs
    const BIG_BERGS = biomeRev >= 10;                 // about a third of the icebergs big and high
    const SHROOMS2 = biomeRev >= 20;                  // 30% more mushrooms, by the kind of tree over them
    const FOSSIL2 = biomeRev >= 24;                   // 70% fewer skeletons in the Dryland
    const SHORTGRASS = biomeRev >= 29;                // half the grass plants come up as short grass, the smallest
    const LAVA2 = biomeRev >= 25;                     // 20% more surface lava ponds in warm plains and the Dryland
    const PALM2 = biomeRev >= 26;                     // shore palms only where the land is level +1 or warmer
    const SAV3 = biomeRev >= 32;                      // 60% fewer acacias, 90% fewer termite hills, wheat by the climate (0.8471)
    const FLUSH = biomeRev >= 27;                     // a river's or lake's shore level with its water is a little beach (FLUSH, biomes/fields.js)
    const WATER_LEVEL = FLAT ? FLAT_WATER_LEVEL : 99;
    const seedFn = xmur3(String(seedStr));
    const seedInt = seedFn();
    const noise2 = makeNoise(sfc32(seedFn(), seedFn(), seedFn(), seedFn()));

    function fbm(x, y, oct) {                 // fractal brownian motion
      let sum = 0, amp = 1, freq = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        sum += amp * noise2(x * freq, y * freq);
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    }
    const smooth01 = (t, a, b) => {
      t = Math.min(1, Math.max(0, (t - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };

    /* The land's shape and its biomes — continents, climate, hills, deserts, rivers, oceans (terrainInfo), the
    biome's name (biomeAt) and the sub-biome masks — live in biomes/biomes.js since 0.823 (BIOME_CORE, shipped into the
    worker beside this core). */
    const bio = BIOMES.makeBiomes({ noise2, fbm, smooth01, seedInt, WATER_LEVEL, FLAT, FLAT_TOP, biomeRev });
    const { terrainInfo, heightAt, biomeAt, birchAt, snowForestAt, iceSpikesAt, climAt, SHORES, shoreKindAt, shoreWidth, HILLS, UPLAND, RIV2, FALLS, DIVIDE, RIME, RIME2, DESERT2, DESERT3, DRYLAND, SAVANNA, SAV2, DBEACH, DB_SAND, DB_BAND, JUNGLE } = bio;
    /* The desert update (0.84, rev 21, biomes/biomes.js): the Deep Desert's rock is banded sandstone from DD_ROCK_FROM up,
       a band of red every DD_BAND layers (ddStrata: `off` wobbles the bands by column). Rev 22 by its half,
       `kind`: 1 the Deep Desert, sandstone with a thin red band every DD_BAND_Y; 2 the Deep Red Desert, red sandstone
       with a pale band every DD_BAND; 0 rev 21's. */
    const DD_ROCK_FROM = 80, DD_BAND = 9, DD_BAND_Y = 13;
    const ddStrata = (y, off, kind = 0) => {
      if (kind === 1) return (((y + off) % DD_BAND_Y) + DD_BAND_Y) % DD_BAND_Y === 0 ? B.RED_SANDSTONE : B.SANDSTONE;
      const k = (((y + off) % DD_BAND) + DD_BAND) % DD_BAND;
      return kind === 2 ? (k < 2 ? B.SANDSTONE : B.RED_SANDSTONE) : (k < 2 ? B.RED_SANDSTONE : B.SANDSTONE);
    };
    /* 0.837 (rev 20): how much of 0.836's rime trees and ice shapes the Coldest Deep Snow keeps, in its Forest half
       (`rimeW` > 0.5) and in the open half (left for building) */
    const rimeKeep = (ti) => !RIME2 ? 1 : ti.rimeW > 0.5 ? 0.5 : 0.12;
    /* rev 14: the wet grid's margin grows to 10 for beaches up to 10 wide; a pond under POND_MIN cells is
       filled. A pond with a column in the chunk's 2-block margin cannot reach the grid's edge in under 9 cells, so
       every chunk that sees it sees it whole and judges it alike. */
    const WM = HILLS ? 10 : 8, WG = 16 + 2 * WM, POND_MIN = 9;

    // deterministic per-column hash in [0,1) — used for tree placement
    function hash2(x, z) {
      let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) ^ seedInt;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }

    // the Coldest Deep Snow's wind: its way in radians, turning slowly over the land (sastrugi, bent trees, ice)
    const rimeWindAt = (x, z) => fbm(x * 0.0006 + 3131.3, z * 0.0006 - 1717.7, 2) * 4.7;

    // 3D value noise for cave carving: hashed lattice + trilinear smoothstep interpolation
    function hash3(x, y, z) {
      let h = (Math.imul(x, 374761393) + Math.imul(y, 217645177) + Math.imul(z, 668265263)) ^ seedInt;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }
    function vnoise3(x, y, z) {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      const fx = x - ix, fy = y - iy, fz = z - iz;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
      const c000 = hash3(ix, iy, iz),     c100 = hash3(ix + 1, iy, iz);
      const c010 = hash3(ix, iy + 1, iz), c110 = hash3(ix + 1, iy + 1, iz);
      const c001 = hash3(ix, iy, iz + 1),     c101 = hash3(ix + 1, iy, iz + 1);
      const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
      const x00 = c000 + (c100 - c000) * sx, x10 = c010 + (c110 - c010) * sx;
      const x01 = c001 + (c101 - c001) * sx, x11 = c011 + (c111 - c011) * sx;
      const y0 = x00 + (x10 - x00) * sy, y1 = x01 + (x11 - x01) * sy;
      return (y0 + (y1 - y0) * sz) * 2 - 1;
    }
    function fbm3(x, y, z, oct) {
      let sum = 0, amp = 1, freq = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        sum += amp * vnoise3(x * freq, y * freq, z * freq);
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    }
});
