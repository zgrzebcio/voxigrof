'use strict';
/* voxiGrof — VOXEL_CORE + WORKER_MAIN: terrain gen, mesher (the block registry is 58-blocks.js since 0.8376). Stringified into the worker blob — MUST stay self-contained (no outer-scope references but BIOMES and BLOCKS, shipped beside it) */

/* ================================================================================================
   VOXEL_CORE — code shared verbatim between the main thread and the web workers.
   This function is stringified into the worker blob, so it must be fully self-contained
   (no references to outer-scope variables but BLOCKS and BIOMES, shipped with it). It provides:
     - the block registry, taken from BLOCKS (58-blocks.js, 0.8376) and handed on in its return
     - seeded simplex noise + terrain generator
     - the greedy mesher
   ================================================================================================ */
function VOXEL_CORE() {
  'use strict';

  /* The block registry — ids, tiles, properties, models' boxes, chisel shapes and the value helpers — lives in
     58-blocks.js since 0.8376 (BLOCK_CORE, shipped into the worker beside this core). Everything it has: */
  const { T, FURNACE_T, FURNACE_ROCK_N, BENCH_WOOD_N, BENCH_T, SHROOM_T, DECOR_T, BERRY_KINDS, BERRY_STAGES,
          CAVE_DIRT_AT, CAVE_YELLOW_BUSH, ICE_FROM_WATER, CANE_STEPS, CANE_JOIN_LEFT, B, V, SIDE_FACE,
          furnaceRockOf, benchWoodOf, furnaceTile, benchTile, PROPS, LOG_W_MIN, LOG_W_MAX, LOG_W_BLOCK,
          LOG_W_NORMAL, logWidthPx, logWidthOf, LOG_BEVEL, logCutBox, LOG_CUT_COLL, SLAB_HALF, WALL_T, WALL_VAR,
          CLUSTER_DIRS, CLUSTER_LAYOUTS, _clusterLayout, CLUSTER_UP, _clusterTurn, CLUSTER_BOXES, CLUSTER_HIT,
          CLUSTER_BED_SHIFT, CLUSTER_BEDS, CLUSTER_BED_OF, MORTAR_VOX, MORTAR_S, MORTAR_C, MORTAR_FACES,
          MORTAR_BOXES, SHROOM_SHAPE, _shroom, SHROOM_WHERE, _anyShroom, _grilled, _SHROOM_STD, _SHROOM_WHITE,
          _SHROOM_YELLOW, SHROOM_MODEL, TORCH_RAY_BOXES, STAIR_BOXES, STAIR_DIR, STAIR_OPP, STAIR_CCW, STAIR_CF,
          stairVarOf, stairBoxesAt, BERRY_STAGE, berryStage, BERRY_BUSHES, isBerryBush, _berryBush, FR,
          FLINT_ROCK_BOX, GOURD_BOX, FULL_UV_BOX, _gourd, _carvedFaces, _carved, SHAPE_SLAB, SHAPE_STAIRS,
          SHAPE_PANE, SHAPE_FENCE, SHAPE_MASK, ROT_MASK, SHAPE_LAYER, SHAPE_LAYER_MIX, LAYER_MAX, SHAPE_COVER,
          SHAPE_WALL, VARIANT_BLOCKS, _BRICK_VARIANTS, _GLASS_VARIANTS, _ALL_PLANKS, _ROCKS, _ROCK_LOOKS,
          _SANDSTONES, _GLOWS, _NO_COVER, _METALS, _GEM_COAL, SHAPE_BLOCKS, LAYER_STACKING, VARIANT_FAMILIES,
          CHIMNEY_MAX, CHIMNEY_ROCKS, chimneyWall, chimneyHeight, layerCount, layerMixed, layerVal, SHAPE_SLAB_MIX,
          SLAB_MIX_SEE, SLAB_MIX_HIGH, slabMixed, slabMixVal, slabsMix, slabMixBoxes, sideListed, LAYER_BOX,
          NO_BOXES, solidVal, SHAPE_FAMILY, shapeOfVal, PANE_BOX, _s16, _mirX, _mirZ, _swapXZ, FENCE_POST,
          FENCE_POST_COLL, FENCE_ARM, FENCE_DIAG, FENCE_ARM_COLL, FENCE_DIAG_COLL, FENCE_DIRS, _fenceArm,
          _joinSpec, FENCE_SPEC, WALL_SPEC, joinBoxesAt, COVER_BOX, opaqueVal, SHAPE_DIM, lightDim, shapeBoxesAt,
          HOLLOW_FILLS, HOLLOW_WALLS, HOLLOW_CORE_UP, HOLLOW_CORE_LYING, HOLLOW_SWAP, HOLLOW_INNER, _hollowOnAxis,
          _hollowParts, _hollowBoxes, hollowParts, hollowBoxes } = BLOCKS;
  /* The climate colour (0.8231): grass and water blend smoothly toward their warm or cold look by a value per
     vertex, -1 cold .. 0 usual .. 1 warm (the 'clim' attribute). The fragment shader mixes in the warm or cold tile
     above, or tints the water (04, row 1 of TILE_LAYER in 03). TINTED: the tiles that take it. */
  const TINTED = new Uint8Array(1024);
  for (const t of [T.GRASS_TOP, T.GRASS_SIDE, T.GRASS_PLANT, T.TALL_BOT, T.TALL_TOP, T.WATER, T.WATER_FLOW, T.WATER_FLOW_FAST, T.WATER_FALL]) TINTED[t] = 1;
  // the climate sampler (climAt, 55-biomes.js): the worker sets it from its world's generator; icons have none
  let _climAt = null;
  const setTintSampler = (fn) => { _climAt = fn || null; };                                                       // 0.804                                                  // 0.801                                                 // 0.7947
  const CX = 16, CY = 250, CZ = 16;
  /* Flat ("superflat") worlds: a 25-block slab — 1 bedrock, 19 stone, 4 dirt, 1 grass — with a
     matching low water level so lakes and ponds still carve into it. Everything else about the
     world (biome = Plains, trees, surface plants) works exactly as it does at normal altitude. */
  const FLAT_TOP = 24;                     // y of the grass layer
  // Water sits 4 below the surface, not 1. Every decorator (trees, plants, melons, cacti) skips
  // columns at h <= WATER_LEVEL + 1 or + 3 to keep shorelines clear — parking the flat surface
  // just above water level would have tripped all of those and left a completely barren world.
  const FLAT_WATER_LEVEL = FLAT_TOP - 4;
  const idx = (x, y, z) => x + (z << 4) + (y << 8);   // voxel index inside a chunk

  /* ---------- seeded PRNG + 2D simplex noise ---------- */
  function xmur3(str) {                       // string hash -> 32-bit seed stream
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function sfc32(a, b, c, d) {
    return () => {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  const G2D = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), GG2 = (3 - Math.sqrt(3)) / 6;

  function makeNoise(rand) {
    const p = new Uint8Array(512);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {           // Fisher–Yates with seeded PRNG
      const j = (rand() * (i + 1)) | 0;
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

    return function noise2(xin, yin) {        // classic Gustavson simplex, range ~[-1,1]
      let n0 = 0, n1 = 0, n2 = 0;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * GG2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + GG2, y1 = y0 - j1 + GG2;
      const x2 = x0 - 1 + 2 * GG2, y2 = y0 - 1 + 2 * GG2;
      const ii = i & 255, jj = j & 255;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { t0 *= t0; const g = G2D[p[ii + p[jj]] & 7];       n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { t1 *= t1; const g = G2D[p[ii + i1 + p[jj + j1]] & 7]; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { t2 *= t2; const g = G2D[p[ii + 1 + p[jj + 1]] & 7];   n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
      return 70 * (n0 + n1 + n2);
    };
  }

  /* ---------- terrain generator ---------- */
  /* biomeRev (0.819): 1 for worlds made before 0.819, so their unexplored land still joins what they already have;
     2 gives bigger snow and desert biomes (see `temp` below). Fixed per world at creation (w.biomeRev). */
  function makeGen(seedStr, terrainType, biomeRev = 1) {
    const FLAT = terrainType === 'flat';
    const PINK_BEACHES = biomeRev >= 4;               // 0.822: warm beaches run pink in places
    const TALL_SPRUCE = biomeRev >= 6;                // 0.8231: spruce forest trees on a bare stem
    const LADDER = biomeRev >= 7;                     // 0.8232: the climate ladder (55-biomes.js)
    const SPIKES = biomeRev >= 9;                     // 0.835: the Ice Spikes biome and the snow's icebergs
    const BIG_BERGS = biomeRev >= 10;                 // 0.8351: about a third of the icebergs big and high
    const SHROOMS2 = biomeRev >= 20;                  // 0.837: 30% more mushrooms, by the kind of tree over them
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
    biome's name (biomeAt) and the sub-biome masks — live in 55-biomes.js since 0.823 (BIOME_CORE, shipped into the
    worker beside this core). */
    const bio = BIOMES.makeBiomes({ noise2, fbm, smooth01, seedInt, WATER_LEVEL, FLAT, FLAT_TOP, biomeRev });
    const { terrainInfo, heightAt, biomeAt, birchAt, snowForestAt, iceSpikesAt, climAt, SHORES, shoreKindAt, shoreWidth, HILLS, UPLAND, RIV2, FALLS, DIVIDE, RIME, RIME2 } = bio;
    /* 0.837 (rev 20): how much of 0.836's rime trees and ice shapes the Coldest Deep Snow keeps, in its Forest half
       (`rimeW` > 0.5) and in the open half (left for building) */
    const rimeKeep = (ti) => !RIME2 ? 1 : ti.rimeW > 0.5 ? 0.5 : 0.12;
    /* rev 14 (0.83547): the wet grid's margin grows to 10 for beaches up to 10 wide; a pond under POND_MIN cells is
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

    // the Coldest Deep Snow's wind (0.836): its way in radians, turning slowly over the land (sastrugi, bent trees, ice)
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

    /* Rooms and cave mouths (0.83548, biomeRev 15; carved in genChunk): one candidate per cell, a pure function of the
       cell, kept for the generator's life so the neighbouring chunks asking again cost nothing. A room: in most
       ROOM_CELL squares, 4-14 across (a hall to 26 now and then) at any depth under the crust. A mouth: the steepest
       drop (5+ over 8 blocks) at five points of a MOUTH_CELL square, the tunnel's start at its foot, heading in. */
    const ROOM_CELL = 24, MOUTH_CELL = 40, _rooms = new Map(), _mouths = new Map();
    function roomOf(gx, gz) {
      const k = gx + ',' + gz;
      if (_rooms.has(k)) return _rooms.get(k);
      let rm = null;
      if (hash2(gx * 7151 + 13, gz * 6007 - 29) < 0.8) {
        const x = (gx + 0.15 + 0.7 * hash2(gx * 31 + 7, gz * 17 + 3)) * ROOM_CELL, z = (gz + 0.15 + 0.7 * hash2(gx * 13 - 5, gz * 37 + 11)) * ROOM_CELL;
        const hall = hash2(gx * 97 + 1, gz * 89 - 1) < 0.07;
        const r = hall ? 9 + 4 * hash2(gx * 3 + 41, gz * 5 - 43) : 2 + 5 * hash2(gx * 11 + 61, gz * 7 - 59);
        const ry = r * (hall ? 0.6 : 0.8), ti = terrainInfo(x, z);
        const top = ti.h - (ti.h < ti.wl ? 11 : 8) - ry, lo = 6 + ry;
        if (top > lo) rm = { x, z, r, ry, y: lo + (top - lo) * Math.pow(hash2(gx * 23 + 9, gz * 29 - 9), 1.4) };
      }
      _rooms.set(k, rm);
      return rm;
    }
    function mouthOf(gx, gz) {
      const k = gx + ',' + gz;
      if (_mouths.has(k)) return _mouths.get(k);
      let m = null;
      const roll = hash2(gx * 5113 + 77, gz * 4271 - 91);
      if (roll < 0.6) {
        const cx0 = (gx + 0.5) * MOUTH_CELL, cz0 = (gz + 0.5) * MOUTH_CELL;
        let best = 4, pick = null;
        for (const [ox, oz] of [[0, 0], [-11, -7], [11, -7], [-7, 11], [7, 11]]) {
          const px = cx0 + ox, pz = cz0 + oz, c = terrainInfo(px, pz);
          if (c.h < c.wl + 3 || c.h <= WATER_LEVEL + 3) continue;
          for (let a = 0; a < 8; a++) {
            const ax = Math.cos(a * Math.PI / 4), az = Math.sin(a * Math.PI / 4), t = terrainInfo(px + ax * 8, pz + az * 8);
            const g = t.h, drop = c.h - g;
            if (drop > best && g > WATER_LEVEL && g >= t.wl) { best = drop; pick = [px + ax * 8, pz + az * 8, g, Math.atan2(-az, -ax)]; }   // its foot on dry ground
          }
        }
        if (pick) {
          /* the way in, step by step [x, y, z, roof]: open (roof 0) wherever its top comes within 3 of the ground, so it
             breaks out of the face (and an arch out of the far side, where it ends), 2 blocks of roof inside */
          const arch = roll < 0.18, rad = arch ? 2.2 + 1.2 * hash2(gx * 29 + 2, gz * 31 - 2) : 1.6 + 0.9 * hash2(gx * 37 + 2, gz * 41 - 2);
          const len = (arch ? 22 : 14) + 22 * hash2(gx * 17 + 1, gz * 19 - 1), fall = arch ? 0 : 0.12 + 0.2 * hash2(gx * 53 + 2, gz * 59 - 2);
          let ang = pick[3] + (hash2(gx * 43 + 2, gz * 47 - 2) - 0.5) * 0.6, x = pick[0], z = pick[1], y = pick[2] + rad - 0.3, inside = false;
          const path = [];
          for (let s = 0, n = 0; s < len; s += 0.8, n++) {
            x += Math.cos(ang) * 0.8; z += Math.sin(ang) * 0.8; y -= fall * 0.8;
            ang += (hash2(gx * 7 + n, gz * 11 - n) - 0.5) * 0.1;
            const g = terrainInfo(x, z).h;
            if (g >= y + rad + 3) inside = true;
            else if (inside && g < y - rad) break;                                        // out the far side
            path.push([x, y, z, g >= y + rad + 3 ? 2 : 0]);
          }
          if (inside) m = { x: pick[0], z: pick[1], low: pick[2], arch, rad, path };
        }
      }
      _mouths.set(k, m);
      return m;
    }

    /* Generate one chunk of voxels. Column layout (top -> bottom):
       air/water | 1 grass (sand near water) | 5 dirt (or sand) | stone | 2 bedrock.
       Trees are stamped from a 2-block margin so canopies cross chunk borders seamlessly
       (placement is a pure function of world position, so every chunk agrees).            */
    function genChunk(cx, cz) {
      const data = new Uint32Array(CX * CY * CZ);
      const H = new Int16Array(400);                           // heights incl. 2-block margin
      const DES = new Uint8Array(400);                         // desert surface flag
      const RED = new Uint8Array(400);                         // red-sand desert flag
      const ROCK = new Uint8Array(400);                        // rocky desert-hill top flag
      const SNO = new Uint8Array(400);                         // snowy (cold biome) surface flag
      const DSNO = new Uint8Array(400);                        // deep snow, the coldest level: more of it solid (0.8232)
      const WARM = new Float32Array(400);                      // how far into hot climate, 0..1 (pink beaches, 0.822)
      const TAIGA = new Uint8Array(400);                       // spruce forest / cold plains (0.823)
      const TREE = new Float32Array(400);                      // tree density factor (0 in plains/desert)
      const LVL = new Float32Array(400);                       // climate level, -3 deep snow .. 3 red sand (0.8233, CLIMATE_LADDER)
      const SPK = new Uint8Array(400);                         // the Ice Spikes biome (0.835)
      const CLF = new Float32Array(400);                       // a rocky coast, 0..1 (0.8356, cliffAt in 55)
      const RIM = new Uint8Array(400);                         // the Coldest Deep Snow (0.836, fRime in 55)
      const RIMF = new Float32Array(400);                      // ...how far into it, 0..1 (its canyons fade out)
      // wider wet grid (32x32, 8-block margin) so beach width can vary per water type:
      // ocean 4..8 blocks, river/lake 2..4. WW cells: 0 dry, 1 ocean, 2 river/lake.
      // (WG x WG with a WM margin since 0.83547: 32 and 8 before rev 14)
      const WW = new Uint8Array(WG * WG);
      /* each column's top water y (0.83548, rev 15: a river or lake up in the land has its own; the sea's is WATER_LEVEL),
         on the grid (WLG) and the 20x20 (WLV); HIWET: some of it stands above the sea's */
      const WLG = new Int16Array(WG * WG), WLV = new Int16Array(400), FDV = new Uint8Array(400);   // FDV: a river's way, 1-8 (0.83549)
      const FFV = new Uint8Array(400);                                                                // FFV: it runs fast (0.835491)
      const HG = new Int16Array(WG * WG), RVG = new Uint8Array(WG * WG), FDG = new Uint8Array(WG * WG);   // the grid's ground, a river's water and way (0.83549)
      let HIWET = false, HIWL = WATER_LEVEL;
      for (let gz = 0; gz < WG; gz++)
        for (let gx = 0; gx < WG; gx++) {
          const ti = terrainInfo(cx * 16 + gx - WM, cz * 16 + gz - WM);
          let ww = 0;
          if (ti.h < ti.wl) ww = (ti.rT > 0.3 || ti.lk > 0.3) ? 2 : 1;
          WW[gx + gz * WG] = ww;
          WLG[gx + gz * WG] = ti.wl;
          HG[gx + gz * WG] = ti.h;
          RVG[gx + gz * WG] = ww && ti.rT > ti.lk ? 1 : 0;
          FDG[gx + gz * WG] = ti.fd || 0;
          if (ww && ti.wl > WATER_LEVEL) { HIWET = true; HIWL = Math.max(HIWL, ti.wl); }
          if (gx >= WM - 2 && gx <= WM + 17 && gz >= WM - 2 && gz <= WM + 17) {
            const i = (gx - WM + 2) + (gz - WM + 2) * 20;
            H[i] = ti.h;
            WLV[i] = ti.wl;
            FDV[i] = ti.fd || 0;
            FFV[i] = ti.ff ? 1 : 0;
            DES[i] = ti.fDesert > 0.5 ? 1 : 0;
            RED[i] = ti.fRed > 0.5 ? 1 : 0;
            ROCK[i] = (ti.dh > 0.5 && ti.fRed <= 0.5) ? 1 : 0;   // tall desert hills expose stone (not in red zones)
            SNO[i] = ti.fSnow > 0.5 ? 1 : 0;
            DSNO[i] = ti.fDeepSnow > 0.5 ? 1 : 0;
            WARM[i] = LADDER ? ti.warm : ti.fDesert;              // on the ladder the warm plains' beaches (0.8232)
            TAIGA[i] = ti.fTaiga > 0.5 ? 1 : 0;
            TREE[i] = 1 - ti.fPlains;
            LVL[i] = ti.lvl;
            RIMF[i] = RIME ? ti.fRime : 0;
            RIM[i] = RIMF[i] > 0.5 ? 1 : 0;
            SPK[i] = SPIKES && !RIM[i] && ti.fSnow > 0.5 && ti.h <= 132 && iceSpikesAt(cx * 16 + gx - WM, cz * 16 + gz - WM) ? 1 : 0;
            CLF[i] = ti.cliff || 0;
          }
        }
      // no puddles (0.83547, rev 14): a pond the grid sees whole, under POND_MIN cells (8-connected), is dry land at the water's level
      if (HILLS) {
        const seen = new Uint8Array(WG * WG), stack = [], cells = [];
        for (let s = 0; s < WG * WG; s++) {
          if (!WW[s] || seen[s]) continue;
          seen[s] = 1; stack.push(s); cells.length = 0;
          let edge = false;
          while (stack.length) {
            const c = stack.pop(), gx = c % WG, gz = (c / WG) | 0;
            cells.push(c);
            if (gx === 0 || gz === 0 || gx === WG - 1 || gz === WG - 1) edge = true;
            for (let dz = -1; dz <= 1; dz++)
              for (let dx = -1; dx <= 1; dx++) {
                const nx = gx + dx, nz = gz + dz;
                if (nx < 0 || nz < 0 || nx >= WG || nz >= WG) continue;
                const n = nx + nz * WG;
                if (WW[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
              }
          }
          if (edge || cells.length >= POND_MIN) continue;
          for (const c of cells) {
            WW[c] = 0;
            const hx = c % WG - WM + 2, hz = ((c / WG) | 0) - WM + 2;
            if (hx >= 0 && hx < 20 && hz >= 0 && hz < 20) H[hx + hz * 20] = WLG[c];
          }
        }
      }
      /* no slivers (0.83549, rev 17): a patch of water at one level (4-connected, under POND_MIN cells, seen whole) that
         stands over lower water beside it - the edge of one lake poking past another's - takes the lower water's level,
         and where its ground stands at or over that, is dry. Judged alike by every chunk, as the ponds are. */
      if (FALLS) {
        const seen = new Uint8Array(WG * WG), stack = [], cells = [];
        for (let s = 0; s < WG * WG; s++) {
          if (!WW[s] || seen[s]) continue;
          const lv = WLG[s];
          seen[s] = 1; stack.push(s); cells.length = 0;
          let edge = false, low = lv;
          while (stack.length) {
            const c = stack.pop(), gx = c % WG, gz = (c / WG) | 0;
            cells.push(c);
            if (gx === 0 || gz === 0 || gx === WG - 1 || gz === WG - 1) edge = true;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = gx + dx, nz = gz + dz;
              if (nx < 0 || nz < 0 || nx >= WG || nz >= WG) continue;
              const n = nx + nz * WG;
              if (!WW[n]) continue;
              if (WLG[n] === lv) { if (!seen[n]) { seen[n] = 1; stack.push(n); } }
              else if (WLG[n] < low) low = WLG[n];
            }
          }
          if (edge || cells.length >= POND_MIN || low >= lv) continue;
          for (const c of cells) {
            WLG[c] = low;
            const hx = c % WG - WM + 2, hz = ((c / WG) | 0) - WM + 2, inH = hx >= 0 && hx < 20 && hz >= 0 && hz < 20;
            if (inH) WLV[hx + hz * 20] = low;
            if (HG[c] >= low) {
              /* rev 18 (0.835491): cut down into the lower water instead of left a dry knob (which the containment then
                 raised into a pillar between a fall's sheets); rev 17 left it dry */
              if (DIVIDE) { HG[c] = low - 1; if (inH) H[hx + hz * 20] = low - 1; }
              else WW[c] = 0;
            }
          }
        }
        /* where a lake's water meets lower water (two lakes, or a lake and the sea, met at their edges) a bar of its shore
           holds it back, its ground raised to the lake's top; a river does the same where water 2+ under it lies at its
           side (another river's lake it runs by): only straight down its way does a river fall (the curtains at the end) */
        const bar = [];
        for (let s = 0; s < WG * WG; s++) {
          if (!WW[s]) continue;
          const gx = s % WG, gz = (s / WG) | 0, fd = RVG[s] ? FDG[s] : 0;
          const fa = (fd - 1) * Math.PI / 4, fx = fd ? Math.cos(fa) : 0, fz = fd ? Math.sin(fa) : 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = gx + dx, nz = gz + dz;
            if (nx < 0 || nz < 0 || nx >= WG || nz >= WG) continue;
            const n = nx + nz * WG;
            if (!WW[n] || WLG[n] >= WLG[s]) continue;
            // rev 18 (0.835491): the divides keep apart waters that are not kin, so only a lake meeting the sea needs a bar;
            // a river falls whichever way its lip runs
            if (DIVIDE) { if (!RVG[s] && WLG[n] === WATER_LEVEL && !RVG[n]) { bar.push(s); break; } continue; }
            if (!RVG[s] || (WLG[n] <= WLG[s] - 2 && dx * fx + dz * fz < 0.4)) { bar.push(s); break; }
          }
        }
        for (const s of bar) {
          WW[s] = 0; HG[s] = WLG[s];
          const hx = s % WG - WM + 2, hz = ((s / WG) | 0) - WM + 2;
          if (hx >= 0 && hx < 20 && hz >= 0 && hz < 20) H[hx + hz * 20] = WLV[hx + hz * 20];
        }
      }

      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          const wx = cx * 16 + x, wz = cz * 16 + z;
          // surface material: grass/dirt on land, sand on beaches/seafloor/deserts, stone caps on
          // desert hills, clay+dirt patches on the seabed, snowy grass (+snow cap) in cold biomes
          let topB, underB, snowCap = false;
          // altitude at which solid snow starts winning over carpet (see the snowCap block below)
          const SNOW_SOLID_Y = WATER_LEVEL + 26;
          // beach mask: for above-water columns near shore level, sand only if the nearest
          // wet column is closer than that water type's beach width. Ocean beaches vary 4..8,
          // river/lake beaches 2..4, both from a low-freq noise so widths change by region.
          let nearWater = false;
          /* Shores (0.8356, rev 13): the coast's kind (shoreKindAt in 55: 0 turf to the water, 1 sand, 2 gravel), a rocky
             one where the cliffs rise (`rock`: stone from the water a few blocks in, up the cliff's face), and beaches a
             ragged 1-6 wide (shoreWidth). */
          let shore = 1, rock = false;
          const wl = WLV[gi];                                   // this column's top water y (0.83548)
          const shoreTop = SHORES && CLF[gi] > 0.45 ? WATER_LEVEL + (HILLS ? 22 : 16) : WATER_LEVEL + 3;
          // a dry column by the sea's level, or (rev 15) anywhere when this chunk has water up in the land
          if (h >= wl && h >= WATER_LEVEL && (h <= shoreTop || HIWET && h <= HIWL + 3)) {
            const gxw = x + WM, gzw = z + WM;
            let hitType = 0, minD2 = 9999, hitWl = WATER_LEVEL;
            for (let dz = -WM; dz <= WM; dz++)
              for (let dx = -WM; dx <= WM; dx++) {
                const t = WW[(gxw + dx) + (gzw + dz) * WG];
                if (!t) continue;
                const d2 = dx * dx + dz * dz;
                if (d2 < minD2) { minD2 = d2; hitType = t; hitWl = WLG[(gxw + dx) + (gzw + dz) * WG]; }
              }
            if (hitType && SHORES) {
              const dist = Math.sqrt(minD2), w = shoreWidth(wx, wz, hitType);
              // the cliff and the ledge at its foot (no wider for the wider beaches, 0.83547)
              if (hitType === 1 && CLF[gi] > 0.45 && hitWl === WATER_LEVEL) rock = h <= shoreTop && dist < (HILLS ? Math.min(w, 5) : w) + 2;
              else if (h <= hitWl + 3 && h >= hitWl && dist < w) { nearWater = true; shore = shoreKindAt(wx, wz); }
            } else if (hitType) {
              const bn = (fbm(wx * 0.007 + 217.3, wz * 0.007 - 803.7, 2) + 1) * 0.5;
              const width = hitType === 1 ? 2 + bn * 2 : bn * 0.4;
              const dist  = Math.sqrt(minD2);
              const dither = fbm(wx * 0.02 + 401.3, wz * 0.02 - 193.7, 2) * 0.8;
              if (dist < width + dither) nearWater = true;
            }
          }
          /* Rev 14 (0.83547): under the shallow water by a beach its sand or gravel runs on (`under`, a shoreKindAt kind, or
             3 a rocky coast's stone; -1 none, 0 a turf shore keeps the sea floor's patches); and a steep face is bare stone,
             a drop of 4 to a side (3 now and then), the water's top counting as the floor. */
          let under = -1, steep = false;
          if (HILLS && h < wl && h >= wl - (UPLAND ? 6 : 4)) {
            const gxw = x + WM, gzw = z + WM;
            let land = false;
            for (let dz = -5; dz <= 5 && !land; dz++)
              for (let dx = -5; dx <= 5; dx++)
                if (dx * dx + dz * dz <= 25 && !WW[(gxw + dx) + (gzw + dz) * WG]) { land = true; break; }
            if (land) under = CLF[gi] > 0.45 && wl === WATER_LEVEL ? 3 : shoreKindAt(wx, wz);
          } else if (HILLS && h > wl + 1) {
            let low = 1e4;
            for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) low = Math.min(low, Math.max(H[n], WLV[n]));
            /* rev 15 (0.83548): some hills keep their turf, bare only where a drop is 6 or more (`firm` low) */
            const firm = UPLAND ? fbm(wx * 0.0032 + 2129.7, wz * 0.0032 - 4471.3, 2) : 1;
            const need = firm < -0.08 ? 6 : 4;
            steep = h - low >= need || (h - low === need - 1 && hash2(wx * 7 + 1291, wz * 5 - 733) < 0.5);
          }
          if (ROCK[gi] || rock) {
            topB = underB = B.STONE;
          } else if (h < wl || (nearWater && shore !== 0) || DES[gi] === 1) {
            const submerged = h < wl - 1;
            /* a beach's own floor: no clay, dirt or gravel patches. Rev 15 (0.83548): the beach's own block only just under
               the top (all of the first row, about half the second, a few of the third, by a patchy noise), then the shore
               water's floor, more dirt and gravel than sand */
            let beachy = under > 0, mixed = submerged;
            const shoreMix = UPLAND && under >= 0;
            if (shoreMix) {
              const dep = wl - 1 - h, dth = (fbm(wx * 0.11 + 77.1, wz * 0.11 - 31.7, 2) + 1) * 0.5;
              beachy = under > 0 && (dep === 0 || (dep === 1 && dth < 0.55) || (dep === 2 && dth < 0.2));
              mixed = !beachy;
            }
            const clay       = mixed && !beachy && fbm(wx * 0.045 - 205.1, wz * 0.045 + 733.7, 2) > 0.55;  // reduced clay
            const oceanDirt  = mixed && !beachy && !clay && fbm(wx * 0.02 + 911.3, wz * 0.02 + 417.9, 2) > (shoreMix ? -0.1 : 0.12);  // more/larger dirt
            const oceanGravel = mixed && !beachy && !clay && !oceanDirt && fbm(wx * 0.025 + 531.7, wz * 0.025 - 644.3, 2) > (shoreMix ? 0.05 : 0.35);
            topB = underB = clay ? B.CLAY : oceanDirt ? B.DIRT : oceanGravel ? B.GRAVEL
                          : RED[gi] ? B.RED_SAND
                          /* a warm beach (0.822): near a desert but not in one, at and just under the waterline, in patches */
                          : (PINK_BEACHES && !DES[gi] && WARM[gi] > 0.2 && h >= wl - 2
                             && fbm(wx * 0.03 + 71.3, wz * 0.03 - 455.1, 2) > 0.1) ? B.PINK_SAND : B.SAND;   // -0.1 before 0.8233: about half as much
            if (shore === 2 && !submerged && !DES[gi]) topB = underB = B.GRAVEL;   // a gravel beach (0.8356)
            if (beachy && under === 2) topB = underB = B.GRAVEL;
            else if (beachy && under === 3) topB = underB = B.STONE;
          } else if (steep) {
            topB = underB = B.STONE; snowCap = !!SNO[gi];        // in the snow it still takes its cover
          } else if (RIM[gi]) {
            /* the Coldest Deep Snow (0.836): a floor of snow blocks under drifts the wind has combed into ridges (the
               sastrugi in the snow cover below), and here and there a sheet of bare ice it has swept clean */
            const sheet = fbm(wx * 0.035 - 2711.3, wz * 0.035 + 1913.9, 2) > 0.42;
            topB = sheet ? B.PACKED_ICE : B.SNOW;
            underB = B.DIRT; snowCap = !sheet;
          } else if (SPK[gi]) {
            // the Ice Spikes (0.835): a floor of snow blocks with sheets of packed ice in it, no carpet, no grass
            topB = fbm(wx * 0.06 + 1717.1, wz * 0.06 - 2929.3, 2) > 0.3 ? B.PACKED_ICE : B.SNOW;
            underB = B.DIRT;
          } else if (SNO[gi]) {
            topB = B.GRASS | (V.GRASS_SNOWY << 8);  // snowy sides; a snow block caps it below
            underB = B.DIRT; snowCap = true;
          } else {
            topB = B.GRASS; underB = B.DIRT;
          }
          if (FLAT) {
            // 1 bedrock / 19 stone / 4 dirt / 1 grass. A pond column has h below FLAT_TOP, so
            // its dirt loop shortens (or empties) and the surface material logic above has
            // already picked sand/gravel/clay for the bed.
            data[idx(x, 0, z)] = B.BEDROCK;
            for (let y = 1; y <= 19; y++) data[idx(x, y, z)] = B.STONE;
            for (let y = 20; y < h; y++) data[idx(x, y, z)] = underB;
            data[idx(x, h, z)] = topB;
          } else {
          data[idx(x, 0, z)] = B.BEDROCK;
          data[idx(x, 1, z)] = B.BEDROCK;
          const dirtFrom = Math.max(2, h - 5);
          for (let y = 2; y < dirtFrom; y++) data[idx(x, y, z)] = B.STONE;
          for (let y = dirtFrom; y < h; y++) data[idx(x, y, z)] = underB;
          if (h >= 2) data[idx(x, h, z)] = topB;
          }
          // a snowy beach, gravel or rock shore lies under one layer of snow (0.8356): the snow's own cover stops at them
          if (SHORES && SNO[gi] && !snowCap && h >= wl && h + 1 <= CY - 1) {
            const t = topB & 255;
            if (t === B.SAND || t === B.GRAVEL || t === B.STONE || t === B.PINK_SAND || t === B.RED_SAND)
              data[idx(x, h + 1, z)] = layerVal(B.SNOW, 1);
          }
          if (snowCap && h + 1 <= CY - 1) {
            // Pattern-driven snow cover:
            //  - biome edge (non-SNO neighbor): thin 1-layer carpet, keeps a crisp biome seam
            //  - steep terrain (neighbour Δh ≥ 2): thick 4-5 layer carpet, reads like a snow drift
            //  - interior: fbm patch noise decides full snow vs tapered carpet.
            //    Layer count fades 5..1 as patch rises above the full-block threshold, so cells
            //    bordering full SNOW blocks always come in at ~5 layers for a smooth blend.
            let bioEdge = false, steep = false;
            for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
              const ngi = (x + 2 + ndx) + (z + 2 + ndz) * 20;
              if (!SNO[ngi]) { bioEdge = true; break; }
              if (Math.abs(H[ngi] - h) >= 2) steep = true;
            }
            if (bioEdge) {
              data[idx(x, h + 1, z)] = layerVal(B.SNOW, 1);
            } else if (steep) {
              const thick = 5 + Math.floor(hash2(wx * 17 + 331, wz * 19 + 733) * 3);   // 5..7 of 8
              data[idx(x, h + 1, z)] = layerVal(B.SNOW, thick);
            } else if (RIM[gi]) {
              /* sastrugi (0.836): the drifts combed across the wind's way (rimeWindAt) into ridges 2-7 layers deep, a whole
                 block on the highest crests */
              const wa = rimeWindAt(wx, wz), u = wx * Math.cos(wa) + wz * Math.sin(wa);
              const rip = 0.5 + 0.5 * Math.sin(u * 0.62 + fbm(wx * 0.05 + 77.3, wz * 0.05 - 19.1, 2) * 4);
              const n = 2 + Math.round(rip * rip * 5.4 + (hash2(wx * 13 + 7, wz * 11 - 5) - 0.5) * 0.8);
              data[idx(x, h + 1, z)] = n >= 8 ? B.SNOW : layerVal(B.SNOW, Math.max(1, n));
            } else {
              /* Solid snow is now an ALTITUDE feature, not the default filler. At sea level a
                 snow biome is almost entirely carpet — the ground still reads white but you can
                 see the grass and plants through it — and full blocks only take over as you
                 climb. `snowline` runs 0 below SNOW_SOLID_Y to 1 well above it, and gates the
                 patch threshold, which cuts low-altitude snow blocks by ~90%. */
              const patch = (fbm(wx * 0.045 + 1201.7, wz * 0.045 - 903.3, 3) + 1) * 0.5;
              const snowline = smooth01(h, SNOW_SOLID_Y, SNOW_SOLID_Y + 34);
              const solidCut = DSNO[gi] ? 0.4 + 0.3 * snowline      // deep snow: 40% solid even low down (0.8232)
                             : 0.04 + 0.5 * snowline;            // 4% low down, ~54% up high
              if (patch < solidCut) {
                data[idx(x, h + 1, z)] = B.SNOW;                  // solid snowfield
              } else {
                // taper: just above the cut -> 7 layers (blends into neighbouring full blocks)
                const layers = Math.min(7, Math.max(DSNO[gi] ? 4 : 1, 7 - Math.floor((patch - solidCut) * 10)));
                data[idx(x, h + 1, z)] = layerVal(B.SNOW, layers);
              }
            }
          }
          for (let y = h + 1; y <= wl; y++) data[idx(x, y, z)] = B.WATER;
          // the top runs the river's way (variant bits 3-6, 0.83549), bit 7 fast down a steep stretch (0.835491)
          if (FDV[gi] && h < wl) data[idx(x, wl, z)] = B.WATER | (FDV[gi] << 11) | (FFV[gi] << 15);
        }
      }

      /* Everything from here to the tree pass carves or fills UNDERGROUND: ore, gravel, caves,
         cave entrances, lava pools and sulfur. A flat world is a 25-block slab meant as a clean
         testbed, so the whole region is skipped rather than left to riddle it with holes. */
      if (!FLAT) {

      /* ---- ore veins (before caves so cave walls naturally expose ore faces) ---- */
      {
        const ORE_TYPES = [
       // [oreId,   attempts, minN, maxN, bestLo, bestHi, rangeLo, rangeHi]
          [B.COAL_ORE,    20,    4,   14,     60,     90,      35,     180],
          [B.IRON_ORE,    12,    3,    9,     50,     65,      15,     130],
          [B.DIAMOND_ORE,  2,    1,    5,     15,     20,       2,      30],
          [B.COPPER_ORE,   8,    3,   10,     70,     80,      20,      85],
          [B.TIN_ORE,      6,    2,    8,     40,     45,      10,      70],
          [B.GOLD_ORE,     4,    2,    6,     20,     30,       5,      40],
          // gems (0.766): emerald only in mountain rock, ruby deep, sapphire just below the surface band
          [B.EMERALD_ORE,  4,    1,    4,    150,    160,     120,     200],
          [B.RUBY_ORE,     3,    1,    4,     43,     47,      30,      70],
          [B.SAPPHIRE_ORE, 3,    1,    4,     93,     97,      80,     130],
          [B.TOPAZ_ORE,    3,    1,    4,     78,     82,      60,     100],   // 0.769
          // big rock patches embedded in stone (chunky blobs, wide depth range)
          [B.MARBLE,       5, 24, 60, 50, 92,  30, 94],
          [B.GRANITE,      5, 24, 60,  6, 55,   2, 60],
          [B.LIMESTONE,    5, 24, 60, 40, 92,  20, 94],
          // appended, so every row above keeps the index that seeds its veins (0.809)
          [B.DOLOMITE,     4, 24, 60, 60, 110, 40, 130],
        ];
        for (let oi = 0; oi < ORE_TYPES.length; oi++) {
          const [oreId, attempts, minN, maxN, bestLo, bestHi, rangeLo, rangeHi] = ORE_TYPES[oi];
          // gems grow as clusters in caves since 0.7945 (below). Skipped rather than removed, so every other
          // row keeps its index `oi`, which seeds its veins: the rest of the underground stays where it was
          if (PROPS[oreId].model === 'cluster') continue;
          for (let ai = 0; ai < attempts; ai++) {
            const lx = (hash3(cx * 47 + oi + ai,       11, cz * 43 + oi + ai    ) * 16) | 0;
            const lz = (hash3(cx * 53 + oi + ai * 3,   17, cz * 59 + oi + ai    ) * 16) | 0;
            const inBest = hash3(cx + oi * 7 + ai * 3, 31, cz + oi * 3 + ai * 7) < 0.7;
            const ly = inBest
              ? bestLo  + ((hash3(cx * 13 + ai + oi, 41, cz * 11 + ai) * (bestHi  - bestLo  + 1)) | 0)
              : rangeLo + ((hash3(cx * 19 + ai + oi, 37, cz * 17 + ai) * (rangeHi - rangeLo + 1)) | 0);
            if (ly < rangeLo || ly > rangeHi || ly < 2 || ly > CY - 2) continue;
            if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
            const count = minN + ((hash3(cx + ai, ly + oi, cz + ai) * (maxN - minN + 1)) | 0);
            // LCG seeded from position for deterministic vein shape
            let lcg = (Math.imul(cx * 37 + lx + oi * 13, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
            const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
            const front = [[lx, ly, lz]];
            let placed = 0;
            while (front.length && placed < count) {
              const fi = (nlcg() * front.length) | 0;
              const [bx, by, bz] = front.splice(fi, 1)[0];
              if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
              if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
              data[idx(bx, by, bz)] = oreId;
              placed++;
              front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
            }
          }
        }
      }

      /* ---- gravel patches: mountain slopes and underground cave floors ---- */
      {
        // mountain surface patches — near surface of tall columns
        for (let ai = 0; ai < 9; ai++) {
          const lx = (hash3(cx * 47 + 500 + ai,       7, cz * 43 + 500 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 500 + ai * 3,  13, cz * 59 + 500 + ai    ) * 16) | 0;
          const gi = (lx + 2) + (lz + 2) * 20;
          if (H[gi] <= 82) continue;                             // only in mountain columns
          const ly = H[gi] - 4 - ((hash3(cx + 500 + ai, 29, cz + 500 + ai) * 16) | 0);
          if (ly < 2 || ly > CY - 2) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 20 + ((hash3(cx + ai + 500, ly, cz + ai + 500) * 30) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 500, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
        // underground patches — scattered through caves / mid-depth stone
        for (let ai = 0; ai < 8; ai++) {
          const lx = (hash3(cx * 47 + 600 + ai,       11, cz * 43 + 600 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 600 + ai * 3,   17, cz * 59 + 600 + ai    ) * 16) | 0;
          const ly = 12 + ((hash3(cx + 600 + ai, 23, cz + 600 + ai) * 48) | 0);
          if (ly < 2 || ly > CY - 2) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 10 + ((hash3(cx + ai + 600, ly, cz + ai + 600) * 20) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 600, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
        // general-biome surface patches — small, all elevated terrain h > 65
        for (let ai = 0; ai < 6; ai++) {
          const lx = (hash3(cx * 47 + 700 + ai,       31, cz * 43 + 700 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 700 + ai * 3,   37, cz * 59 + 700 + ai    ) * 16) | 0;
          const gi = (lx + 2) + (lz + 2) * 20;
          if (H[gi] <= 65) continue;                             // only above beach level
          const ly = H[gi] - 3 - ((hash3(cx + 700 + ai, 43, cz + 700 + ai) * 10) | 0);
          if (ly < 2 || ly > CY - 2) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 5 + ((hash3(cx + ai + 700, ly, cz + ai + 700) * 12) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 700, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 2) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
      }

      /* may a cave cut this cell (0.835481, rev 16)? Not in the crust under water (9), nor beside a water cell, which it
         would open: water does not flow, so it would stand hanging over the hole. Older worlds cut as they did. */
      const keepsWater = (lx, gy, lz) => {
        if (!RIV2) return true;
        const gi = (lx + 2) + (lz + 2) * 20;
        if (H[gi] < WLV[gi] && gy > H[gi] - 9) return false;
        for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) if (H[n] < WLV[n] && gy > H[n] && gy <= WLV[n]) return false;
        return true;
      };
      /* ---- caves: two 3D-noise bands intersect into winding tunnels ("spaghetti"), plus
         large low-altitude "cheese" caverns. A solid crust stays under the surface (6 land /
         9 underwater) so caves only reach daylight through the entrance shafts below. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const capY = h - (h < WLV[gi] ? 9 : 6);                  // its own water (0.83548)
          // long-tunnel region gate (2D, per-column): ~40% of areas also grow long sweeping
          // tunnels from a separate LOW-frequency band pair (long wavelength = long tunnels)
          const longTun = fbm(wx * 0.003 + 4040, wz * 0.003 - 2020, 2) > 0.12;
          for (let y = 3; y <= capY; y++) {
            // taper the band shut approaching the crust so noise never breaches the surface
            const taper = Math.min(1, (capY - y) * 0.25 + 0.4);
            // boost band width inside tall mountains so interiors are more cavernous
            const w = (0.062 + (1 - y / 96) * 0.02 + Math.max(0, h - 90) * 0.00045) * taper;
            const n1 = fbm3(wx * 0.055, y * 0.075, wz * 0.055, 2);
            if (Math.abs(n1) <= w) {                          // spaghetti band
              const n2 = fbm3(wx * 0.055 + 133.7, y * 0.075 - 71.3, wz * 0.055 + 291.1, 2);
              if (Math.abs(n2) <= w && keepsWater(x, y, z)) { data[idx(x, y, z)] = B.AIR; continue; }
            }
            if (!longTun) continue;                           // long tunnels only in gated regions
            const lw = w * 0.85;                              // a touch narrower so they read as tunnels
            const t1 = fbm3(wx * 0.018 + 512, y * 0.05 - 88, wz * 0.018 + 707, 2);
            if (Math.abs(t1) > lw) continue;                  // early out before the 2nd band
            const t2 = fbm3(wx * 0.018 - 333, y * 0.05 + 219, wz * 0.018 - 141, 2);
            if (Math.abs(t2) <= lw && keepsWater(x, y, z)) data[idx(x, y, z)] = B.AIR;
          }
          // cheese caverns deep down (big rooms, stone only). Some regions widen into GRAND
          // caverns — taller, lower carve threshold — held up by full stone pillars and
          // floor/ceiling rock spikes (per-column hash keeps them chunk-border stable).
          const grand = fbm(wx * 0.006 + 777, wz * 0.006 + 321, 2) > 0.30;
          const thr = grand ? 0.40 : 0.47;
          const pr = hash2(wx * 13 + 5, wz * 29 - 11);
          const isPillar = grand && pr < 0.012;                          // full floor-to-ceiling pillar
          const stalag = grand && !isPillar && pr < 0.055 ? 4 + ((pr * 4096 | 0) % 7) : 0;   // floor spike
          const stalac = grand && !isPillar && pr >= 0.055 && pr < 0.095 ? 4 + ((pr * 8192 | 0) % 7) : 0; // ceiling spike
          const yMaxC = Math.min(grand ? 42 : 34, capY);
          for (let y = 5; y <= yMaxC; y++) {
            const i = idx(x, y, z);
            /* Carve every rock, not just stone (0.7948). Ore veins, granite, marble and limestone blobs and
               gravel patches are laid down BEFORE the caves, and a room that only cleared plain stone left all
               of them hanging in mid-air inside it. Liquids and bedrock still stay put. */
            const cb = data[i] & 255;
            if (cb === B.AIR || cb === B.WATER || cb === B.LAVA || cb === B.BEDROCK) continue;
            if (isPillar) continue;
            if (stalag && y < 5 + stalag) continue;
            if (stalac && y > yMaxC - stalac) continue;
            if (fbm3(wx * 0.02, y * 0.03, wz * 0.02, 2) > thr) data[i] = B.AIR;
          }
        }

      /* ---- cave entrances: one dice roll per 16-block cell; a winding shaft bores from the
         surface down into cave depth. Land: 5% of cells (14% in mountains), r~2.4 with a
         flared mouth. Underwater: 0.5% and a tighter r~1.5. Pure function of world position.
         Shafts travel ~1.5 blocks horizontally per block of descent so entrances slope gently
         rather than plunging straight down. */
      const EMARGIN = 28;
      for (let ecz = Math.floor((cz * 16 - EMARGIN) / 16); ecz <= Math.floor((cz * 16 + 15 + EMARGIN) / 16); ecz++)
        for (let ecx = Math.floor((cx * 16 - EMARGIN) / 16); ecx <= Math.floor((cx * 16 + 15 + EMARGIN) / 16); ecx++) {
          const roll = hash2(ecx * 913 + 71, ecz * 641 - 233);
          const jx = ecx * 16 + 3 + (((roll * 4241) | 0) % 10);   // jittered start inside the cell
          const jz = ecz * 16 + 3 + (((roll * 6553) | 0) % 10);
          const ti = terrainInfo(jx, jz);
          const under = ti.h < ti.wl;                             // column has water above it (its own level, 0.83548)
          const isMtn = !under && ti.h > 126;
          const landChance = isMtn ? 0.14 : 0.05;
          if (roll > (under ? 0.005 : landChance)) continue;
          if (under && RIV2) continue;                            // rev 16 (0.835481): none under water, it left the water hanging over the shaft
          const depth = 14 + (((roll * 88007) | 0) % 12) + (isMtn ? 6 : 0);
          const targetY = Math.max(8, ti.h - depth);
          let px = jx + 0.5, pz = jz + 0.5;
          let ang = hash2(ecx * 57 + 991, ecz * 83 - 447) * Math.PI * 2;
          // entrance style: 0 gentle winding slope · 1 plain vertical hole · 2 steep drop ·
          // 3 grand flared mouth · 4 grotto (hemispherical room, then a slope out its floor) ·
          // 5 long near-level tunnel that ends in a steep drop
          const style = ((roll * 7919) | 0) % 6;
          const clearCell = (gx, gy, gz) => {                    // shared carve helper (local coords)
            const lx = gx - cx * 16, lz = gz - cz * 16;
            if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || gy < 3 || gy > CY - 1) return;
            const ii = idx(lx, gy, lz), bid = data[ii] & 255;
            if (bid !== B.WATER && bid !== B.BEDROCK && keepsWater(lx, gy, lz)) data[ii] = B.AIR;
          };
          let startY = ti.h + 1;
          if (style === 4 && !under) {                           // grotto: dome carved into the surface
            const R = 4 + (((roll * 331) | 0) % 2);
            for (let dy = 0; dy <= R; dy++)
              for (let oz = -R; oz <= R; oz++)
                for (let ox = -R; ox <= R; ox++) {
                  if (ox * ox + oz * oz + dy * dy * 2 > R * R) continue;
                  clearCell(Math.round(px) + ox, ti.h + 1 - dy, Math.round(pz) + oz);
                }
            startY = ti.h + 1 - R;                               // shaft leaves through the grotto floor
          }
          if (style === 5 && !under) {                           // long gently-declining tunnel first
            const L = 8 + (((roll * 557) | 0) % 8);
            for (let s2 = 0; s2 < L; s2++) {
              px += Math.cos(ang) * 1.0; pz += Math.sin(ang) * 1.0;
              ang += (hash2(jx * 19 + s2, jz * 23 - s2) - 0.5) * 0.3;
              const yy0 = ti.h - 1 - (s2 >> 2);
              const cxi = Math.round(px), czi = Math.round(pz);
              for (let oz = -2; oz <= 2; oz++)
                for (let ox = -2; ox <= 2; ox++) {
                  if (ox * ox + oz * oz > 3.2) continue;
                  clearCell(cxi + ox, yy0, czi + oz);
                  clearCell(cxi + ox, yy0 - 1, czi + oz);
                }
              startY = yy0 - 1;                                  // steep drop starts at tunnel end
            }
          }
          const horiz = style === 1 ? 0 : (style === 2 || style === 5) ? 0.5 : 1.5;
          const flare = style === 3 ? 2.6 : 1.1;
          const rBase = (under ? 1.5 : (isMtn ? 2.8 : 2.4)) * (style === 1 ? 0.9 : 1);
          for (let y = startY; y >= targetY; y--) {
            const t = startY - y;                                 // steps below the entry point
            ang += (hash2(jx * 31 + t, jz * 17 - t) - 0.5) * 0.55; // gentle wobble for gradual slope
            px += Math.cos(ang) * horiz;
            pz += Math.sin(ang) * horiz;
            const flaring = style <= 3 && t < (style === 3 ? 4 : 2) && !under;
            const r = rBase + (flaring ? flare * Math.max(0.3, 1 - t * 0.25) : 0) - Math.min(0.8, t * 0.04);
            const cxi = Math.round(px), czi = Math.round(pz), ri = Math.ceil(r);
            for (let oz = -ri; oz <= ri; oz++)
              for (let ox = -ri; ox <= ri; ox++) {
                if (ox * ox + oz * oz > r * r) continue;
                const lx = cxi + ox - cx * 16, lz = czi + oz - cz * 16;
                if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                for (let dy = 0; dy >= -1; dy--) {                // 2-tall passage
                  const yy = y + dy;
                  if (yy < 3 || yy > CY - 1) continue;
                  const ii = idx(lx, yy, lz);
                  const bid = data[ii] & 255;
                  if (bid !== B.WATER && bid !== B.BEDROCK && keepsWater(lx, yy, lz)) data[ii] = B.AIR;
                }
              }
          }
        }

      /* ---- rooms, tunnels, cave mouths, arches and overhangs (0.83548, biomeRev 15) ----
         Rooms: round caves 4-14 across (now and then a hall up to 26), one in most ROOM_CELL squares at any depth under
         the crust, each joined to its east and south neighbours' by a winding tunnel. Mouths: from the foot of a slope
         (a drop of 6+ over 7 blocks) a tunnel runs into the hill, falling as it goes; arches run level, and come out the
         far side of a hill narrow enough. Both keep 2 blocks of roof, so they open only on the face. Overhangs: along
         some cliffs the face is cut back under its lip, one or two columns deep. All pure functions of the world
         position, so every chunk carves its part alike. */
      if (UPLAND) {
        const X0 = cx * 16, Z0 = cz * 16;
        // clear a cell of this chunk; roof: blocks kept under the ground there (-1: the crust, 9 under water, 6 on land)
        const dig = (gx, gy, gz, roof) => {
          const lx = gx - X0, lz = gz - Z0;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || gy < 3 || gy > CY - 2) return;
          const gi = (lx + 2) + (lz + 2) * 20;
          if (gy > H[gi] - (H[gi] < WLV[gi] ? 9 : roof < 0 ? 6 : roof)) return;   // under water always the full crust
          for (const n of [gi - 1, gi + 1, gi - 20, gi + 20])                     // never opens a water cell's side
            if (H[n] < WLV[n] && gy > H[n] && gy <= WLV[n]) return;
          const i = idx(lx, gy, lz), b = data[i] & 255;
          if (b === B.WATER || b === B.LAVA || b === B.BEDROCK || b === B.ICE) return;
          data[i] = B.AIR;
        };
        // an upright ellipsoid of radius r (a little taller than wide above its middle)
        const blob = (px, py, pz, r, roof) => {
          if (px + r + 1 < X0 || px - r - 1 > X0 + 15 || pz + r + 1 < Z0 || pz - r - 1 > Z0 + 15) return;
          const ri = Math.ceil(r);
          for (let oy = -ri; oy <= ri + 1; oy++)
            for (let oz = -ri; oz <= ri; oz++)
              for (let ox = -ri; ox <= ri; ox++) {
                const ey = oy > 0 ? oy / (r * 1.15) : oy / r;
                if ((ox * ox + oz * oz) / (r * r) + ey * ey <= 1) dig(Math.floor(px) + ox, Math.floor(py) + oy, Math.floor(pz) + oz, roof);
              }
        };
        const RC = ROOM_CELL;
        const tube = (a, b, seed) => {
          const vx = b.x - a.x, vz = b.z - a.z, vy = b.y - a.y, Lh = Math.hypot(vx, vz);
          if (Lh < 1 || Math.abs(vy) > Lh * 0.9) return;                         // too steep to walk: no tunnel
          if (Math.max(a.x, b.x) + 10 < X0 || Math.min(a.x, b.x) - 10 > X0 + 15 || Math.max(a.z, b.z) + 10 < Z0 || Math.min(a.z, b.z) - 10 > Z0 + 15) return;
          const nx = -vz / Lh, nz = vx / Lh, L = Math.hypot(Lh, vy);
          const amp = 2 + 5 * hash2(seed, 77), ph = hash2(seed, 91) * 6.283, waves = 1 + ((hash2(seed, 13) * 2) | 0);
          const rad = 1.3 + 0.9 * hash2(seed, 55);
          for (let s = 0; s <= L; s += 0.8) {
            const t = s / L, env = Math.sin(t * Math.PI), off = Math.sin(t * Math.PI * waves + ph) * amp * env;
            blob(a.x + vx * t + nx * off, a.y + vy * t + Math.sin(t * Math.PI * 2 + ph) * 2 * env, a.z + vz * t + nz * off, rad, -1);
          }
        };
        for (let gz = Math.floor((Z0 - 10) / RC) - 2; gz <= Math.floor((Z0 + 25) / RC); gz++)
          for (let gx = Math.floor((X0 - 10) / RC) - 2; gx <= Math.floor((X0 + 25) / RC); gx++) {
            const rm = roomOf(gx, gz);
            if (!rm) continue;
            const R = rm.r * 1.2 + 1;
            if (rm.x + R >= X0 && rm.x - R <= X0 + 15 && rm.z + R >= Z0 && rm.z - R <= Z0 + 15)
              for (let gz2 = Math.floor(rm.z - R); gz2 <= rm.z + R; gz2++)
                for (let gx2 = Math.floor(rm.x - R); gx2 <= rm.x + R; gx2++) {
                  if (gx2 < X0 || gx2 > X0 + 15 || gz2 < Z0 || gz2 > Z0 + 15) continue;
                  const dx = (gx2 + 0.5 - rm.x) / rm.r, dz = (gz2 + 0.5 - rm.z) / rm.r, d2 = dx * dx + dz * dz;
                  if (d2 > 1.44) continue;
                  for (let gy = Math.floor(rm.y - rm.ry * 0.7); gy <= rm.y + rm.ry * 1.25; gy++) {
                    const dy = (gy + 0.5 - rm.y) / rm.ry;
                    if (dy < -0.62) continue;                                     // a flat floor
                    const wob = 1 + 0.2 * vnoise3(gx2 * 0.22, gy * 0.22, gz2 * 0.22);
                    if (d2 + dy * dy <= wob * wob) dig(gx2, gy, gz2, -1);
                  }
                }
            if (hash2(gx * 61 + 5, gz * 67 - 5) < 0.7) { const e = roomOf(gx + 1, gz); if (e) tube(rm, e, gx * 73 + gz * 79 + 1); }
            if (hash2(gx * 71 - 5, gz * 59 + 5) < 0.7) { const s = roomOf(gx, gz + 1); if (s) tube(rm, s, gx * 83 - gz * 89 + 2); }
          }
        // cave mouths and arches, from the foot of a slope into the hill
        const MC = MOUTH_CELL, REACH = 56;
        for (let gz = Math.floor((Z0 - REACH) / MC); gz <= Math.floor((Z0 + 15 + REACH) / MC); gz++)
          for (let gx = Math.floor((X0 - REACH) / MC); gx <= Math.floor((X0 + 15 + REACH) / MC); gx++) {
            const m = mouthOf(gx, gz);
            if (!m || m.x + REACH < X0 || m.x - REACH > X0 + 15 || m.z + REACH < Z0 || m.z - REACH > Z0 + 15) continue;
            for (const [x, y, z, roof] of m.path) blob(x, y, z, m.rad, roof);
          }
        // overhangs: along some cliffs (a drop of 6+ to a side) the face is cut back under its lip, two columns deep in places
        for (let z = 0; z < 16; z++)
          for (let x = 0; x < 16; x++) {
            const gi = (x + 2) + (z + 2) * 20, h = H[gi];
            if (h < WLV[gi] || DES[gi]) continue;
            const wx = X0 + x, wz = Z0 + z;
            if (fbm(wx * 0.05 + 3713.1, wz * 0.05 - 1291.7, 2) < 0.05) continue;
            for (const d of [1, -1, 20, -20]) {
              let low = Math.max(H[gi + d], WLV[gi + d]), depth = 1;
              if (h - low < 6 && H[gi + d] >= h - 1) { low = Math.max(H[gi + 2 * d], WLV[gi + 2 * d]); depth = 2; }
              if (h - low < 6) continue;
              const k = Math.min(h - low - 3, 2 + ((hash2(wx * 3 + d, wz * 5 - d) * 3) | 0)) - (depth - 1);
              for (let y = low + 1; y <= low + k; y++) {
                const i = idx(x, y, z), b = data[i] & 255;
                if (b !== B.WATER && b !== B.LAVA && b !== B.BEDROCK && b !== B.ICE) data[i] = B.AIR;
              }
            }
          }
      }

      // ---- cave lava pools (pool-seeded grid, bowl-shaped multi-y crater) ----
      // 22×22 cells, 22% chance each, radius up to ~6 blocks. Per-cell pool y is deterministic;
      // each column within radius carves a lava column from (poolY - bowlDepth) up to poolY, with
      // bowlDepth tapering parabolically from ~4 at the centre to 0 at the rim → looks like a
      // real crater/pond, not a flat slab. Rim pass fills air side-neighbors with stone.
      {
        const PCELL = 22, PR = 6, PR2 = PR * PR;
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const gcx = Math.round(wx / PCELL), gcz = Math.round(wz / PCELL);
          const ddx = wx - gcx * PCELL, ddz = wz - gcz * PCELL;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > PR2) continue;
          if (hash2(gcx * 31 + 5501, gcz * 37 + 6601) > 0.08) continue;
          const poolY = 5 + Math.floor(hash2(gcx * 71 + 2201, gcz * 73 + 3301) * 40);   // 5..44
          // parabolic bowl: deeper in middle, 0 at edge
          const t = 1 - d2 / PR2;
          const bowlDepth = Math.max(0, Math.floor(4 * t * t));
          const y0 = poolY - bowlDepth, y1 = poolY;
          for (let y = y0; y <= y1; y++) {
            const cur = data[idx(x, y, z)] & 255;
            if (cur === B.AIR || cur === B.STONE) data[idx(x, y, z)] = B.LAVA;
          }
        }
        // rim: side-neighbours of any lava cell that are air become stone (dam flow)
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) for (let y = 3; y < 48; y++) {
          if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
          for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + ndx, nz = z + ndz;
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
            if ((data[idx(nx, y, nz)] & 255) === B.AIR) data[idx(nx, y, nz)] = B.STONE;
          }
        }
      }

      // ---- surface lava ponds (crater-shape, biome-biased, cross-chunk consistent) ----
      // Uses terrainInfo(wx,wz) — a pure noise function — for every decision (rim y, biome bias,
      // flatness, water proximity), so any chunk overlapping a pool computes IDENTICAL results.
      // No dependence on the local chunk's H array or data grid → no seams, no floating lava.
      // Chances reduced 90% from 0.582; hill/mountain terrain rejected via rim y cap + flatness.
      {
        const PCELL = 40, PR = 6, PR2 = PR * PR;
        // deterministic per-pool center info, cached
        const centerCache = new Map();
        const centerInfo = (gcx, gcz) => {
          const k = gcx + ',' + gcz;
          if (centerCache.has(k)) return centerCache.get(k);
          const ti = terrainInfo(gcx * PCELL, gcz * PCELL);
          centerCache.set(k, ti);
          return ti;
        };
        // flatness + water-clearance check at pool center. Samples 4 rim points and 4 diagonals.
        const poolOkCache = new Map();
        const poolOk = (gcx, gcz, rimY) => {
          const k = gcx + ',' + gcz;
          if (poolOkCache.has(k)) return poolOkCache.get(k);
          let ok = true;
          const OFF = [[PR,0],[-PR,0],[0,PR],[0,-PR],[PR,PR],[-PR,-PR],[PR,-PR],[-PR,PR]];
          for (const [dx, dz] of OFF) {
            const ti = terrainInfo(gcx * PCELL + dx, gcz * PCELL + dz);
            if (Math.abs(ti.h - rimY) > 3) { ok = false; break; }        // hilly / mountainous
            if (ti.h <= ti.wl + 3) { ok = false; break; }               // beach / ocean / a lake up in the land nearby
          }
          poolOkCache.set(k, ok);
          return ok;
        };
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const gcx = Math.round(wx / PCELL), gcz = Math.round(wz / PCELL);
          const ddx = wx - gcx * PCELL, ddz = wz - gcz * PCELL;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > PR2) continue;
          const ci = centerInfo(gcx, gcz);
          const isDesertC = ci.fDesert > 0.5, isSnowC = ci.fSnow > 0.5;
          const chance = isSnowC ? 0.0002 : isDesertC ? 0.01 : 0.002;
          if (hash2(gcx * 41 + 7001, gcz * 43 + 7101) > chance) continue;
          const rimY = ci.h;
          if (rimY <= WATER_LEVEL + 3 || rimY <= ci.wl + 3) continue;    // no ocean/beach altitude, no lake up in the land
          if (rimY > 110) continue;                                      // no hills/mountains
          if (!poolOk(gcx, gcz, rimY)) continue;                         // reject if not flat / near water
          const t = 1 - d2 / PR2;
          const bowlDepth = Math.max(0, Math.floor(3 * t * t));
          const y0 = rimY - bowlDepth, y1 = rimY;
          for (let y = y0; y <= y1; y++) {
            if (y < 2 || y > CY - 1) continue;
            const cur = data[idx(x, y, z)] & 255;
            if (cur !== B.WATER && cur !== B.BEDROCK) data[idx(x, y, z)] = B.LAVA;
          }
          if (rimY + 1 <= CY - 1) {
            const above = data[idx(x, rimY + 1, z)] & 255;
            if (above !== B.WATER && above !== B.AIR) data[idx(x, rimY + 1, z)] = B.AIR;
          }
        }
        // rim: any side-neighbour of a lava cell that is air, grass, sand, red sand or dirt gets
        // replaced with stone — pool never touches grass or sand.
        const rimReplace = new Set([B.AIR, B.GRASS, B.SAND, B.RED_SAND, B.DIRT]);
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) for (let y = 60; y < CY - 1; y++) {
          if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
          for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + ndx, nz = z + ndz;
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
            const nb = data[idx(nx, y, nz)] & 255;
            if (rimReplace.has(nb)) data[idx(nx, y, nz)] = B.STONE;
          }
          // also convert the block directly ABOVE the pool's top rim if it's grass/sand (looks weird
          // touching lava). Only for the top-most lava cell of each column.
          if ((data[idx(x, y + 1, z)] & 255) === B.AIR || (data[idx(x, y + 1, z)] & 255) === B.WATER) {
            // this y is the surface: convert diagonal-top grass/sand within-chunk to stone
            for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx = x + ndx, nz = z + ndz;
              if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
              const above = data[idx(nx, y + 1, nz)] & 255;
              if (above === B.GRASS || above === B.SAND || above === B.RED_SAND)
                data[idx(nx, y + 1, nz)] = B.STONE;
            }
          }
        }
      }

      /* ---- glow vines (0.765): strands hanging down cave walls, lighting the tunnels. A rare roll
         per open cave cell picks one side; if that side is rock, a strand of 2-6 hangs down it for
         as long as the rock face and the open air beside it both last. ---- */
      {
        const VINE_WALLS = [[0, -1, 0], [0, 1, 1], [-1, 0, 2], [1, 0, 3]];   // [dx, dz, variant]
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const top = Math.min(H[(x + 2) + (z + 2) * 20] - 6, 90);
            for (let y = 8; y < top; y++) {
              if ((data[idx(x, y, z)] & 255) !== B.AIR) continue;
              if (hash3(cx * 1543 + x, y + 7000, cz * 1327 + z) >= 0.005) continue;   // 0.7651: ~3x as common
              const w = VINE_WALLS[Math.floor(hash3(cx * 1543 + x, y + 7100, cz * 1327 + z) * 4) & 3];
              const wx = x + w[0], wz = z + w[1];
              if (wx < 0 || wx > 15 || wz < 0 || wz > 15) continue;
              const len = 2 + Math.floor(hash3(cx * 1543 + x, y + 7200, cz * 1327 + z) * 5);
              for (let k = 0; k < len && y - k > 2; k++) {
                if ((data[idx(x, y - k, z)] & 255) !== B.AIR || (data[idx(wx, y - k, wz)] & 255) !== B.STONE) break;
                data[idx(x, y - k, z)] = B.GLOW_VINE | (w[2] << 8);
              }
            }
          }
      }

      /* ---- cobwebs (0.766): strung in cave corners. A rare roll per open cave cell, kept only where at
         least two sides are rock, so a web sits in a nook — on the floor, a wall or the ceiling. ---- */
      {
        const WEB_NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const top = Math.min(H[(x + 2) + (z + 2) * 20] - 6, 95);
            for (let y = 4; y < top; y++) {
              if ((data[idx(x, y, z)] & 255) !== B.AIR) continue;
              if (hash3(cx * 1601 + x, y + 8000, cz * 1409 + z) >= 0.0025) continue;
              let rock = 0;
              for (const [dx, dy, dz] of WEB_NB) {
                const nx = x + dx, nz = z + dz;
                if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
                if ((data[idx(nx, y + dy, nz)] & 255) === B.STONE) rock++;
              }
              if (rock >= 2) data[idx(x, y, z)] = B.COBWEB;   // still hung in nooks; the pass at the end makes sure (0.806)
            }
          }
      }

      // ---- sulfur deposits ----
      // Two spawn modes:
      //   (a) under lava: 5-10 blocks below any lava cell, replace stone with a small cluster,
      //       tips (up on top of a block below air, down on ceiling above air) spawn frequently.
      //   (b) random single blocks: 0.05% per stone cell in y=30..80, peak density around y=48..50.
      //       Rare occasional tip on top/bottom.
      {
        // Sulfur block spawn rules:
        //   * must sit in stone
        //   * must have AIR directly above or below (cave-visible)
        //   * no lava or water in any of 6 neighbors (never touches liquids)
        // After the block is placed, try to grow a tip into the adjacent air on the exposed face.
        const inBounds = (nx, ny, nz) =>
          nx >= 0 && nx <= 15 && nz >= 0 && nz <= 15 && ny >= 0 && ny <= CY - 1;
        const idAt = (nx, ny, nz) => inBounds(nx, ny, nz) ? (data[idx(nx, ny, nz)] & 255) : -1;
        const placeSulfur = (bx, by, bz, tipHash) => {
          if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > CY - 3) return;
          if ((data[idx(bx, by, bz)] & 255) !== B.STONE) return;
          const airTop = idAt(bx, by + 1, bz) === B.AIR;
          const airBot = idAt(bx, by - 1, bz) === B.AIR;
          if (!airTop && !airBot) return;                        // must be cave-exposed via top or bottom
          // reject if any neighbor is lava or water
          const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
          for (const [dx, dy, dz] of DIRS) {
            const nb = idAt(bx + dx, by + dy, bz + dz);
            if (nb === B.LAVA || nb === B.WATER) return;
          }
          data[idx(bx, by, bz)] = B.SULFUR_BLOCK;
          // try to grow a tip on each exposed face (50% chance each). tipHash provides variety.
          if (airTop && (tipHash === undefined || tipHash < 0.5))
            data[idx(bx, by + 1, bz)] = B.SULFUR_UP_TIP;
          if (airBot && (tipHash === undefined || tipHash >= 0.5))
            data[idx(bx, by - 1, bz)] = B.SULFUR_UP_TIP | (1 << 8);   // variant 1 = down orientation
        };
        // (a) under-lava clusters
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          for (let y = 3; y < 190; y++) {
            if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
            const wx = cx * 16 + x, wz = cz * 16 + z;
            const depth = 2 + Math.floor(hash3(wx * 29 + 12001, y * 7 + 3, wz * 31 + 12001) * 9);   // 2..10
            const cy = y - depth;
            if (cy < 3) continue;
            const clusterN = 3 + Math.floor(hash3(wx * 41 + 13001, y * 11 + 5, wz * 37 + 13001) * 4);
            for (let k = 0; k < clusterN; k++) {
              const ox = Math.floor(hash3(wx * 53 + k, cy + 7 * k, wz * 47 + k * 3) * 3) - 1;
              const oy = Math.floor(hash3(wx * 61 + k * 5, cy * 3 + k, wz * 59 + k) * 3) - 1;
              const oz = Math.floor(hash3(wx * 67 + k * 7, cy + k * 11, wz * 71 + k * 5) * 3) - 1;
              const tipH = hash3(wx * 79 + k, cy + k * 13, wz * 83 + k * 5);
              placeSulfur(x + ox, cy + oy, z + oz, tipH);
            }
            break;   // one cluster per column max
          }
        }
        // (b) rare single blocks y=30..80, peak 48..50
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          for (let y = 30; y <= 80; y++) {
            if ((data[idx(x, y, z)] & 255) !== B.STONE) continue;
            const d = (y - 49) / 10;
            const weight = Math.exp(-d * d);
            const chance = 0.0005 * (0.3 + 0.7 * weight);
            if (hash3(wx * 89 + 14001, y * 19 + 7, wz * 97 + 14001) < chance) {
              const tipH = hash3(wx * 103, y * 23, wz * 107);
              placeSulfur(x, y, z, tipH);
            }
          }
        }
      }

      /* ---- gem clusters (0.7945) ----
         Each gem keeps the depth band its ore vein had. A try picks a column and a height in that band, then
         looks up and down from there for the nearest open cave cell touching rock, and grows the cluster out
         of that rock: floor, ceiling or wall, whichever it touches (a coin picks between several). A cell
         open to the sky does not count — except for emerald, which has always lived in mountain rock. */
      {
        const GEMS = [
          // [id,          tries, bestLo, bestHi, rangeLo, rangeHi, sky ok]
          [B.DIAMOND_ORE,   3,     15,     20,      3,      30,   false],
          [B.EMERALD_ORE,   5,    150,    160,    120,     196,   true ],
          [B.RUBY_ORE,      4,     43,     47,     30,      70,   false],
          [B.SAPPHIRE_ORE,  4,     93,     97,     80,     130,   false],
          [B.TOPAZ_ORE,     4,     78,     82,     60,     100,   false],
        ];
        const CLUSTER_TRY_CHANCE = 0.05;
        const rockAt = (x, y, z) => {
          if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y > CY - 2) return false;
          const p = PROPS[data[idx(x, y, z)] & 255];
          return !!p && !!p.opaque && p.type === 'stone';
        };
        const underRoof = (x, y, z) => {
          for (let yy = y + 1; yy < CY; yy++) if (PROPS[data[idx(x, yy, z)] & 255]?.opaque) return true;
          return false;
        };
        for (let gi = 0; gi < GEMS.length; gi++) {
          const [gem, tries, bestLo, bestHi, rangeLo, rangeHi, skyOk] = GEMS[gi];
          for (let t = 0; t < tries; t++) {
            const s = 21000 + gi * 101 + t * 7;
            // 95% of tries never happen (0.7948): 0.7945's rate put far too many clusters in every cave
            if (hash3(cx * 61 + s, 17, cz * 67 + s) >= CLUSTER_TRY_CHANCE) continue;
            const lx = (hash3(cx * 31 + s, 3, cz * 29 + s) * 16) | 0;
            const lz = (hash3(cx * 37 + s, 5, cz * 41 + s) * 16) | 0;
            const inBest = hash3(cx + s, 7, cz + s * 3) < 0.7;
            const ly0 = inBest ? bestLo + ((hash3(cx * 13 + s, 9, cz * 11 + s) * (bestHi - bestLo + 1)) | 0)
                               : rangeLo + ((hash3(cx * 17 + s, 13, cz * 19 + s) * (rangeHi - rangeLo + 1)) | 0);
            for (let k = 0; k <= 24; k++) {
              const ly = ly0 + ((k & 1) ? -((k + 1) >> 1) : (k >> 1));   // 0, -1, +1, -2, +2 ...
              if (ly < 2 || ly > CY - 3 || ly < rangeLo - 4 || ly > rangeHi + 4) continue;
              if (data[idx(lx, ly, lz)] !== B.AIR) continue;
              const opts = [];
              for (let o = 0; o < 6; o++) {
                const d = CLUSTER_DIRS[o];
                if (rockAt(lx - d[0], ly - d[1], lz - d[2])) opts.push(o);
              }
              if (!opts.length) continue;
              if (!skyOk && !underRoof(lx, ly, lz)) break;
              const o = opts[(hash3(cx * 43 + s, ly, cz * 47 + s) * opts.length) | 0];
              const lay = (hash3(cx * 53 + s, ly + 1, cz * 59 + s) * CLUSTER_LAYOUTS) | 0;   // which look (0.7946)
              // its bed is the rock it grows on: stone, granite, marble, limestone; on anything else its ore (0.7948)
              const d = CLUSTER_DIRS[o], rock = data[idx(lx - d[0], ly - d[1], lz - d[2])] & 255;
              const bed = CLUSTER_BED_OF[rock] || 0;
              data[idx(lx, ly, lz)] = gem | ((o | (lay << 3) | (bed << CLUSTER_BED_SHIFT)) << 8);
              break;
            }
          }
        }
      }

      }   // end !FLAT underground section

      // trees — evaluated over the margin so neighbours get the overlapping leaves
      const put = (x, y, z, id, force) => {
        if (x < 0 || x > 15 || z < 0 || z > 15 || y < 2 || y > CY - 1) return;
        const i = idx(x, y, z);
        if (force || data[i] === B.AIR) data[i] = id;
      };
      /* Rime trees (0.836, biomeRev 19): the Coldest Deep Snow's frozen wood in five forms, all hung with rime (its leaves).
           GHOST    32%  the trunk buried in a lumpy column of rime leaning down the wind, arms and a head of it: the
                         "snow monsters" frost builds on trees in the hardest cold
           SKELETON 23%  bare and crooked, branches reaching up and out with rime only on their tips, icicles under them
           SPIRE    23%  tall and slender, tight tiers of rime drooping at their rims
           BENT     16%  leant down the wind, its rime flagged out on the lee side only
           GIANT     6%  a broad stump 18-25 tall under a heavy lumpy crown, frozen spray round its foot
         Everything stays within 8 of the trunk (the tree loop's margin). Short hidden boughs inside the rime keep every leaf
         within the leaves' reach of wood (isLeavesConnected, 22-main-loop.js). */
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
      // At most one tree per 5x5 world-grid cell, at a hash-jittered position 1..3 inside the
      // cell — trunks are therefore always >=3 blocks apart (no touching twin trees), while
      // remaining a pure function of world position so chunk borders agree.
      // widened margin (-8..+23) so wider big-tree branches from neighbouring cells reach into this chunk
      const minX = cx * 16 - 8, maxX = cx * 16 + 23, minZ = cz * 16 - 8, maxZ = cz * 16 + 23;
      for (let gcz = Math.floor(minZ / 5); gcz <= Math.floor(maxZ / 5); gcz++) {
        for (let gcx = Math.floor(minX / 5); gcx <= Math.floor(maxX / 5); gcx++) {
          const r = hash2(gcx, gcz);                           // the cell's dice roll
          const wx = gcx * 5 + 1 + (((r * 977) | 0) % 3);      // jittered trunk position
          const wz = gcz * 5 + 1 + (((r * 7919) | 0) % 3);
          if (wx < minX || wx > maxX || wz < minZ || wz > maxZ) continue;
          const tx = wx - cx * 16, tz = wz - cz * 16;
          // sample biome/height at the actual trunk world position — the H/TREE/DES arrays
          // only cover chunk+2 margin, but our widened tree loop reaches further.
          const ti = terrainInfo(wx, wz);
          const h = ti.h;
          if (h <= WATER_LEVEL + 1 || h < ti.wl + 1 || h > (DIVIDE ? 199 : 146) || ti.fDesert > 0.5) continue;   // none in a lake up in the land (0.83548)
          // rev 18 (0.835491): over 146, up to 199, a few small oaks on the mountains (none in their snow)
          const isRime = RIME && ti.fRime > 0.5;                  // the Coldest Deep Snow's frozen trees (0.836)
          const highOak = DIVIDE && h > 146 && !isRime;
          if (highOak && ti.fSnow > 0.5) continue;
          // no trees on or hanging over canyon lines — conservative buffer covering every canyon
          // type (crack/wide/long) so canopies always clear the rim
          if (fbm(wx * 0.0015 + 555, wz * 0.0015 - 333, 2) > 0.28 &&
              (Math.abs(fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2)) < 0.15 ||
               Math.abs(fbm(wx * 0.0035 + 911, wz * 0.011 - 477, 2)) < 0.10 ||
               Math.abs(fbm(wx * 0.011 + 911, wz * 0.0035 - 477, 2)) < 0.10)) continue;
          if (isRime) {
            /* in groves with open snow between: thick in a grove, a few about its edge, the odd lone one out on the snow */
            const grove = fbm(wx * 0.011 - 4417.1, wz * 0.011 + 2903.3, 2);
            if (r > (grove > 0.1 ? 0.3 : grove > -0.15 ? 0.08 : 0.015) * rimeKeep(ti)) continue;
            let flat = true;
            for (let oz = -2; oz <= 2 && flat; oz++)
              for (let ox = -2; ox <= 2; ox++)
                if (heightAt(wx + ox, wz + oz) > h + 2) { flat = false; break; }
            if (flat) rimeTree(tx, tz, h, wx, wz, gcx, gcz);
            continue;
          }
          const isPlains = ti.fPlains > 0.5;
          // snow: trees only inside the Snow Forest sub-biome mask; plain Snow stays treeless
          const isSnow = ti.fSnow > 0.5;
          if (isSnow && (ti.fDeepSnow > 0.5 || !snowForestAt(wx, wz))) continue;   // deep snow is treeless (0.8232)
          if (isSnow && iceSpikesAt(wx, wz)) continue;                                // ...and so are the ice spikes (0.835)
          /* 0.823 (biomeRev 5, 55-biomes.js): the spruce forest's chilly band grows spruce, and so do the cold plains,
             sparsely; a deep forest stands about twice as thick, with more of the big oaks and taller trees */
          const isTaiga = ti.fTaiga > 0.5, coldPlains = isPlains && isTaiga;
          const isDeep = !isPlains && ti.deepF > 0.5;
          const forestNoise = fbm(wx * 0.01 + 700, wz * 0.01 - 300, 2) > 0.12;
          const treeF = 1 - ti.fPlains;
          // birch: dedicated "Birch Forest" regions (dense) + 1% scattered birches in ordinary
          // forests. Never in snow biomes, never the big/mega form.
          const birchRegion = !isPlains && !isSnow && !isTaiga && birchAt(wx, wz);
          const isBirch = !highOak && (birchRegion || (!isPlains && !isSnow && !isTaiga && hash2(gcx * 211 + 5, gcz * 197 + 3) < 0.005));   // 1% before 0.8233
          /* spruce is the cold biomes' tree, bar the odd oak (0.8233): 1 in 100 in the spruce forest and cold plains, 1 in 200
             in a deep one, 1 in 2000 in a snow forest. No spruce scattering into temperate forest. */
          const oakOdd = (isSnow || isTaiga) && hash2(gcx * 313 + 17, gcz * 271 + 29) < (isSnow ? 0.0005 : isDeep ? 0.005 : 0.01);
          const isSpruce = !highOak && !isBirch && !oakOdd && (isSnow || isTaiga);
          // plains/meadow: flat 0.1% chance. forest/other: original density-scaled odds. birch forest: dense.
          // flat worlds are entirely Plains, and plains odds (0.1%) would leave a testbed with
          // almost no trees at all — lift it enough that a few are always in sight
          /* Roughly halved across the board. Canopies are far bigger than they used to be —
             wider oaks, tall spruce cones — so the old per-cell odds packed the forest into a
             solid roof with no gaps or light between trunks. */
          // twice the plains' trees in rev 18 (0.835491)
          let baseProb = isPlains ? (FLAT ? 0.02 : (coldPlains ? 0.004 : 0.0007) * (DIVIDE ? 2 : 1)) : (forestNoise ? 0.26 : 0.04) * treeF;
          if (highOak) baseProb = 0.02;
          if (birchRegion) baseProb = Math.max(baseProb, 0.24);
          if (isDeep) baseProb = Math.min(0.6, baseProb * 2 + 0.12);
          if (r > baseProb) continue;
          // flatness check
          let clear = true;
          for (let oz = -2; oz <= 2 && clear; oz++)
            for (let ox = -2; ox <= 2; ox++)
              if (heightAt(wx + ox, wz + oz) > h + 2) { clear = false; break; }
          if (!clear) continue;
          // big-tree roll (independent hash). plains: 50% of the 1%. others: ~3%.
          const rBig = hash2(gcx * 131 + 7, gcz * 173 + 19);
          const bigProb = isPlains || isDeep ? 0.3 : 0.03;
          const isBig = rBig < bigProb && !isBirch && !isTaiga && !highOak;   // birch never grows the big form, nor a taiga spruce, nor a mountain oak

          if (isBig) {
            // procedural big tree: tall trunk, 3-5 branches with leaf clusters, wide top canopy
            // same independent-hash rule as the small tree — `r` is too small to derive from
            const bRand = (a, b) => hash2(gcx * 29 + a, gcz * 61 + b);
            const trunkH = 9 + ((bRand(3, 5) * 4) | 0);        // 9..12
            put(tx, h, tz, B.DIRT, true);
            // big oak: an oversized stump flaring past its own cell, tapering one index per cell
            // down to the trunk — a hard step from stump straight to trunk width read as a wide
            // block with a pole balanced on it
            const bigStumpW = LOG_W_BLOCK + 6, bigTrunkW = 26;
            for (let y = h + 1; y <= h + trunkH; y++) {
              const w = Math.max(bigTrunkW, bigStumpW - (y - (h + 1)));
              put(tx, y, tz, B.LOG | ((w << 2) << 8), true);
            }
            // top canopy: 7x7 base spanning 3 layers, then 5x5, 3x3, tip
            for (let ly = h + trunkH - 2; ly <= h + trunkH + 1; ly++)
              for (let oz = -3; oz <= 3; oz++)
                for (let ox = -3; ox <= 3; ox++) {
                  const rad2 = ox * ox + oz * oz;
                  if (rad2 > 10) continue;                   // rounded footprint
                  if (rad2 >= 8 && hash2(wx + ox * 31, wz + oz * 17 + ly) < 0.55) continue;
                  put(tx + ox, ly, tz + oz, B.LEAVES, false);
                }
            const cap = h + trunkH + 2;
            for (let oz = -2; oz <= 2; oz++)
              for (let ox = -2; ox <= 2; ox++) {
                const rad2 = ox * ox + oz * oz;
                if (rad2 > 5) continue;
                if (rad2 >= 4 && hash2(wx + ox * 61, wz + oz * 41 + cap) < 0.55) continue;
                put(tx + ox, cap, tz + oz, B.LEAVES, false);
              }
            for (let oz = -1; oz <= 1; oz++)
              for (let ox = -1; ox <= 1; ox++)
                if (Math.abs(ox) + Math.abs(oz) < 2) put(tx + ox, cap + 1, tz + oz, B.LEAVES, false);
            put(tx, cap + 2, tz, B.LEAVES, false);
            // 5..8 branches, angled outward from mid-upper trunk with fatter leaf blobs
            const nBranches = 5 + ((bRand(7, 11) * 4) | 0);
            for (let b = 0; b < nBranches; b++) {
              const bh = h + Math.floor(trunkH * 0.45) + Math.floor(b * 0.8);
              const angle = hash2(wx + b * 53, wz + b * 89) * Math.PI * 2;
              const dx = Math.cos(angle), dz = Math.sin(angle);
              const len = 3 + ((bRand(31 + b * 5, 37 + b * 3) * 4) | 0);   // 3..6
              // branch logs lie along their dominant horizontal axis (variant 1 = X, 2 = Z)
              const branchVar = Math.abs(dx) >= Math.abs(dz) ? 1 : 2;
              let bx = 0, bz2 = 0, by = bh;
              for (let s = 1; s <= len; s++) {
                bx = Math.round(dx * s);
                bz2 = Math.round(dz * s);
                by = bh + Math.floor(s * 0.45);
                // taper as it reaches out, same rule the small tree uses
                const bw = Math.max(LOG_W_MIN + 3, 22 - (s - 1) * 3);
                put(tx + bx, by, tz + bz2, B.LOG | ((branchVar | (bw << 2)) << 8), true);
              }
              // wider leaf blob at branch tip (radius ~2) + a smaller blob mid-branch
              for (let ly = -2; ly <= 2; ly++)
                for (let oz = -2; oz <= 2; oz++)
                  for (let ox = -2; ox <= 2; ox++) {
                    const d = Math.abs(ox) + Math.abs(oz) + Math.abs(ly);
                    if (d > 4) continue;
                    if (d === 4 && hash2(wx + ox * 71 + b, wz + oz * 83 + ly) < 0.5) continue;
                    put(tx + bx + ox, by + ly + 1, tz + bz2 + oz, B.LEAVES, false);
                  }
              // mid-branch leaf tuft (halfway along the branch)
              const midS = Math.max(1, Math.floor(len * 0.55));
              const mx = Math.round(dx * midS), mz2 = Math.round(dz * midS);
              const my = bh + Math.floor(midS * 0.45);
              for (let ly = -1; ly <= 1; ly++)
                for (let oz = -1; oz <= 1; oz++)
                  for (let ox = -1; ox <= 1; ox++)
                    if (Math.abs(ox) + Math.abs(oz) + Math.abs(ly) < 3)
                      put(tx + mx + ox, my + ly + 1, tz + mz2 + oz, B.LEAVES, false);
            }
            continue;
          }

          /* Small tree (also used for all birches). birch trunks are taller (5..10).
             Three canopy silhouettes chosen per tree so a forest is not one shape repeated:
               0 ROUND  - the classic 5x5 blob, widest in the middle
               1 TALL   - narrower and one layer higher, reads as a young/crowded tree
               2 SPREAD - 7-wide bottom layer thinning fast, the "old oak" umbrella
             Every form also grows 1-3 stub branches: a single horizontal log poking out of the
             upper trunk with a small tuft on it. That is what makes the trunk read as a tree
             rather than a pole, and it costs one extra log per branch. */
          const LOG = isSpruce ? B.SPRUCE_LOG : isBirch ? B.BIRCH_LOG : B.LOG;
          const LEAF = isSpruce ? B.SPRUCE_LEAVES : isBirch ? B.BIRCH_LEAVES : B.LEAVES;

          /* Spruce is a cone, not a ball, so it gets its own shape entirely: a straight pole with
             skirts of needles that shrink toward a point. Branch stubs are skipped — a conifer's
             limbs are short and buried in the skirt, so a bare stub sticking out looks wrong. */
          if (isSpruce) {
            /* In the spruce forest (0.8231) a tree stands on a bare stem 4..8 high before its needles start, that much
               taller, and the stem keeps the stump's width up to them. Snow forest and cold plains spruces as before. */
            /* Forms (0.83549, rev 17): in the spruce forest the usual tree stands 3 lower, and some are GIANTS (8%: 9-10 taller,
               a skirt two wider, a stump flaring past its cell), some SMALL (20%: 8-11 tall) and some CROWNED (15%: a heavy
               top, only thin tufts below it). The cold plains and snow forest keep theirs, bar a rare giant (2%) or crown (3%). */
            const inForest = isTaiga && !isPlains;
            const sRoll = FALLS ? hash2(gcx * 73 + 19, gcz * 89 - 13) : 0.5;
            const giant = FALLS && sRoll < (inForest ? 0.08 : 0.02);
            const crown = FALLS && !giant && sRoll < (inForest ? 0.23 : 0.05);
            const small = FALLS && !giant && !crown && sRoll > (inForest ? 0.8 : 0.9);
            let bare = TALL_SPRUCE && inForest ? 4 + ((hash2(gcx * 29 + 11, gcz * 61 + 5) * 5) | 0) : 0;
            if (small) bare = Math.min(bare, 2);
            let sh = 14 + ((hash2(gcx * 53 + 3, gcz * 97 + 7) * 7) | 0) + (isDeep ? 5 : 0) + bare;   // 14..20 tall, 19..25 deep (0.823)
            if (FALLS && inForest) sh -= 3;
            if (giant) sh += 9 + ((hash2(gcx * 7 + 3, gcz * 13 - 3) * 2) | 0);
            else if (small) sh = 8 + ((hash2(gcx * 53 + 3, gcz * 97 + 7) * 4) | 0) + bare;
            else if (crown) sh += 2;
            put(tx, h, tz, B.DIRT, true);
            /* The trunk narrows the whole way up rather than stepping from stump to a constant
               width — a real conifer is a spike, and by the crown it is barely thicker than a
               branch. 30 units at the base down to 14 at the tip; the narrowing starts where the needles do.
               A giant's stump flares to 38 (wider than its cell) and narrows from the ground (0.83549); a small one 24. */
            const SPR_STUMP = giant ? 38 : small ? 24 : 30, SPR_TIP = giant ? 16 : 14, taperY = giant ? h + 1 : h + 1 + bare;
            for (let y = h + 1; y <= h + sh; y++) {
              const t = Math.max(0, y - taperY) / Math.max(1, h + sh - taperY);
              const w = Math.round(SPR_STUMP - (SPR_STUMP - SPR_TIP) * t);
              put(tx, y, tz, LOG | ((w << 2) << 8), true);
            }
            /* Needles: a broad heavy skirt low down thinning to a spike, and never absent at the
               top — radius is interpolated 4 -> 1 over the canopy and floored at 1, so the crown
               always carries foliage instead of ending in bare trunk. Alternate tiers pull in one
               step for the layered look, and the rim thins out as it climbs so the silhouette
               reads dense at the bottom and wispy at the top. */
            const base = h + 2 + bare, topY = h + sh, span = Math.max(1, topY - base);
            // a crowned tree's heavy top: the upper 45% of it, and only tufts below (0.83549)
            const crownFrom = crown ? base + Math.floor(span * 0.55) : base;
            for (let ly = base; ly <= topY; ly++) {
              const t = (ly - base) / span;                                        // 0 low .. 1 high
              if (ly < crownFrom) {
                if (((ly - base) % 3) !== 0) continue;                              // a tuft every third layer
                for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                  if (hash2(wx + ox * 43 + ly, wz + oz * 59 - ly) < 0.6) put(tx + ox, ly, tz + oz, LEAF, false);
                continue;
              }
              const tc = crown ? (ly - crownFrom) / Math.max(1, topY - crownFrom) : t;
              let rad = Math.max(1, Math.round((giant ? 6 : small ? 3 : crown ? 4.5 : isDeep ? 5 : 4) + (giant && isDeep ? 1 : 0) - (giant ? 5 : small ? 2.2 : 3.2) * tc));   // a wider skirt in a deep forest (0.823)
              if (((ly - base) % 2) === 1) rad = Math.max(1, rad - 1);
              const rimKeep = crown ? 0.95 - 0.4 * tc : 0.85 - 0.5 * t;           // thinner rim up top; a crown dense
              for (let oz = -rad; oz <= rad; oz++)
                for (let ox = -rad; ox <= rad; ox++) {
                  const d = Math.abs(ox) + Math.abs(oz);
                  if (d > rad) continue;
                  if (d === rad && hash2(wx + ox * 31 + ly, wz + oz * 17 - ly) > rimKeep) continue;
                  put(tx + ox, ly, tz + oz, LEAF, false);
                }
            }
            for (let t2 = 1; t2 <= 2; t2++) put(tx, topY + t2, tz, LEAF, false);   // spire
            const SLIT = layerVal(B.SPRUCE_LEAVES, 1);
            for (let oz = -2; oz <= 2; oz++)
              for (let ox = -2; ox <= 2; ox++) {
                if (!ox && !oz) continue;
                if (hash2(wx + ox * 137 + 41, wz + oz * 211 - 29) > 0.3) continue;
                const lx = tx + ox, lz = tz + oz;
                if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
                put(lx, h + 1, lz, SLIT, false);
              }
            continue;
          }
          // birch grows tall and straight (7..12); oak keeps a shorter, thicker stump (5..8)
          const th = (isBirch ? 7 + ((hash2(gcx * 43 + 5, gcz * 71 + 9) * 6) | 0)
                              : 5 + ((hash2(gcx * 43 + 5, gcz * 71 + 9) * 4) | 0))
                   + (isDeep ? (isBirch ? 3 : 2) : 0);            // taller in a deep forest (0.823)
          /* Per-tree dice. NOT derived from `r`: a tree only exists when r <= baseProb, and
             baseProb is as low as 0.001, so every `(r * K) | 0` truncated to 0 and each tree came
             out with identical form, branch count and branch length. These are independent
             hashes of the grid cell, still a pure function of world position. */
          const tRand = (a, b) => hash2(gcx * 37 + a, gcz * 53 + b);
          const form = (tRand(11, 23) * 3) | 0;

          /* Trunk width, and the flared stump at its foot.
             Oak carries a stump wider than a full cell (up to 76 units). That only looks right on
             open ground, so it needs 3x3 of grass/dirt under it — otherwise the flare hangs over
             a ledge. Failing the test isn't fatal: the tree still grows, just on a plain trunk.
             Birch never flares; its width tracks its height so tall ones aren't spindly. */
          const TRUNK_W_MIN = 26;                                          // 60 units, both species
          const trunkW = isBirch ? Math.max(TRUNK_W_MIN, Math.min(28, 16 + th))
                                 : TRUNK_W_MIN + ((tRand(131, 137) * 3) | 0);
          let stumpW = trunkW;
          if (!isBirch) {
            const want = LOG_W_BLOCK + 2 + ((tRand(139, 149) * 5) | 0);    // 68..76 units
            let flat = true;
            for (let oz = -1; oz <= 1 && flat; oz++)
              for (let ox = -1; ox <= 1; ox++) {
                const gx2 = tx + ox, gz2 = tz + oz;
                if (gx2 < 0 || gx2 > 15 || gz2 < 0 || gz2 > 15) continue;  // outside: trust the flatness test
                const under = data[idx(gx2, h, gz2)] & 255;
                if (under !== B.GRASS && under !== B.DIRT) { flat = false; break; }
              }
            if (flat) stumpW = want;
          }
          const wBits = (w) => (w << 2);                   // variant bits 2-7 carry the width

          put(tx, h, tz, B.DIRT, true);
          /* The flare tapers away instead of stopping dead: each cell above the stump loses one
             width index (2 units) until it reaches the trunk width. A 70-unit stump therefore
             reads 70, 68, 66 ... down to 60, which is what makes the base look grown rather than
             like a wide block with a thin pole balanced on it. */
          for (let y = h + 1; y <= h + th; y++) {
            const w = Math.max(trunkW, stumpW - (y - (h + 1)));
            put(tx, y, tz, LOG | (wBits(w) << 8), true);
          }

          /* Stub branches on the upper half of the trunk, each on its own side and each its own
             LENGTH (1..3 cells, rising as it goes out). Uniform 1-cell stubs made every tree
             look identical from a distance; varying the reach is what gives a stand its ragged,
             overlapping canopy line. */
          /* Birch and oak branch very differently, and treating them the same was what made
             birches look wrong — a fat branch a third of the way up a slender white trunk.

             BIRCH: a tall clean pole. Branches only in the top quarter, at most two, and only on
                    a trunk tall enough to have earned them.
             OAK:   branchier and shaggier, 2..4 branches spread over the upper half.

             Branch cells carry thickness 2 in variant bits 2-3, so a branch renders visibly
             thinner than the trunk it grows from instead of being another full log. */
          const isTall = th >= (isBirch ? 8 : 6);
          const nStub = isBirch ? (isTall ? 1 + ((tRand(41, 59) * 2) | 0) : 0)
                                : 2 + ((tRand(41, 59) * 3) | 0);
          const stubLow  = isBirch ? h + th - Math.max(1, Math.round(th * 0.25))   // top quarter
                                   : h + th - Math.max(2, Math.round(th * 0.5));   // upper half
          const stubSpan = Math.max(1, (h + th - 1) - stubLow);
          const STUB_DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (let s = 0; s < nStub; s++) {
            const dir = STUB_DIR[(tRand(71 + s * 13, 83 + s * 7) * 4) | 0];
            const sy = stubLow + ((tRand(97 + s * 11, 101 + s * 5) * stubSpan) | 0);
            if (sy <= h + 2) continue;                           // never down at the stump
            // birch twigs stay short; oak reaches out and rises as it goes
            const len = isBirch ? 1 + ((tRand(103 + s * 3, 107 + s * 9) * 2) | 0)
                                : 1 + ((tRand(103 + s * 3, 107 + s * 9) * 3) | 0);
            /* Walk the branch as a path of horizontal runs and vertical risers rather than one
               diagonal line of horizontal logs. The riser cells are Y-axis logs, so at every turn
               the horizontal log flares into the vertical one (logInto already does that) and the
               pair reads as an L elbow pointing the way the branch is going — which is what a
               real limb looks like where it kinks upward.

               Birch rises a cell per step, so it is elbows all the way up; oak runs out level and
               kinks once it is clear of the trunk. */
            const axisVar = dir[0] ? 1 : 2;                      // lie flat along X or Z
            let ex = tx, ez = tz, ey = sy;
            for (let k = 1; k <= len; k++) {
              ex = tx + dir[0] * k; ez = tz + dir[1] * k;
              const bw = isBirch ? 11                            // 30 units, uniform
                                 : Math.max(LOG_W_MIN + 3, trunkW - 4 - (k - 1) * 3);
              put(ex, ey, ez, LOG | ((axisVar | wBits(bw)) << 8), true);   // horizontal run
              const rise = isBirch ? 1 : (k === 1 ? 1 : 0);
              for (let u = 0; u < rise; u++) {
                ey++;
                put(ex, ey, ez, LOG | ((0 | wBits(bw)) << 8), true);       // the elbow, vertical
              }
            }
            // leaf tuft on the branch tip, sized with the branch
            const tuft = len >= 3 ? 2 : 1;
            for (let ly = 0; ly <= tuft; ly++)
              for (let oz = -tuft; oz <= tuft; oz++)
                for (let ox = -tuft; ox <= tuft; ox++)
                  if (Math.abs(ox) + Math.abs(oz) + ly <= tuft + 1)
                    put(ex + ox, ey + ly, ez + oz, LEAF, false);
          }

          const wide = form === 2 ? 3 : 2;                       // SPREAD reaches one further
          const lowTop = form === 1 ? h + th : h + th - 1;       // TALL starts its canopy higher
          for (let ly = lowTop - 1; ly <= lowTop; ly++)
            for (let oz = -wide; oz <= wide; oz++)
              for (let ox = -wide; ox <= wide; ox++) {
                if (ox === 0 && oz === 0) continue;
                const rad2 = ox * ox + oz * oz;
                if (rad2 > wide * wide + 1) continue;            // rounded, not square
                if (form === 1 && rad2 > 4) continue;            // TALL stays narrow
                if (rad2 >= wide * wide && hash2(wx + ox * 31, wz + oz * 17 + ly) < 0.5) continue;
                put(tx + ox, ly, tz + oz, LEAF, false);
              }
          const cap = lowTop + 1;                                // 3x3 cap without corners
          for (let oz = -1; oz <= 1; oz++)
            for (let ox = -1; ox <= 1; ox++)
              if (Math.abs(ox) + Math.abs(oz) < 2) put(tx + ox, cap, tz + oz, LEAF, false);
          put(tx, cap + 1, tz, LEAF, false);                     // tip
          if (form === 1) put(tx, cap + 2, tz, LEAF, false);      // TALL gets one more

          /* Fallen leaf litter around the base. Placed only where the cell below is actually
             grass inside this chunk — the canopy overhangs neighbouring columns whose height we
             have not sampled, and littering those blind would leave carpets floating on slopes. */
          const LITTER = layerVal(isBirch ? B.BIRCH_LEAVES : B.LEAVES, 1);
          for (let oz = -2; oz <= 2; oz++)
            for (let ox = -2; ox <= 2; ox++) {
              if (!ox && !oz) continue;
              if (hash2(wx + ox * 137 + 9, wz + oz * 211 - 5) > 0.3) continue;
              const lx = tx + ox, lz = tz + oz;
              if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
              if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
              put(lx, h + 1, lz, LITTER, false);
            }
        }
      }

      /* Snowy grass sides are only correct when snow is actually sitting on the block. The snow
         cap is laid before the tree pass, so any column a trunk landed in still claims a white
         rim under bare wood. Sweep it off after the trees have gone in. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi2 = (x + 2) + (z + 2) * 20, hh = H[gi2];
          if (hh < 1 || hh > CY - 2) continue;
          const gv = data[idx(x, hh, z)];
          if ((gv & 255) !== B.GRASS || ((gv >> 8) & 255) !== V.GRASS_SNOWY) continue;
          // a snow block or a stack of snow layers (layers are the snow block's own id since 0.785)
          const snowAbove = (data[idx(x, hh + 1, z)] & 255) === B.SNOW;
          if (!snowAbove) data[idx(x, hh, z)] = B.GRASS;
        }

      /* ---- dirt in caves (0.8271): patches of it on cave floors, a block deep, where a 3D noise says so (some 10-block
         blobs, a pure function of world position, so chunk borders agree). Mushrooms grow on it as on stone, and the
         yellow berry bush grows only on it down there. ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const top = Math.min(H[(x + 2) + (z + 2) * 20] - 6, 94), wx = cx * 16 + x, wz = cz * 16 + z;
          for (let y = 4; y < top; y++) {
            if ((data[idx(x, y, z)] & 255) !== B.STONE || (data[idx(x, y + 1, z)] & 255) !== B.AIR) continue;
            if (fbm3(wx * 0.09 + 911, y * 0.12 - 37, wz * 0.09 - 411, 2) < CAVE_DIRT_AT) continue;
            data[idx(x, y, z)] = B.DIRT;
            if ((data[idx(x, y - 1, z)] & 255) === B.STONE) data[idx(x, y - 1, z)] = B.DIRT;
          }
        }

      /* ---- red mushrooms: cave floors + shadowed ground under leaves ---- */
      // where a brown mushroom grows, a black, a white or (0.821) a yellow one may instead, a quarter each (0.8091)
      const brownish = (r) => r < 0.25 ? B.BROWN_MUSHROOM : r < 0.5 ? B.BLACK_MUSHROOM : r < 0.75 ? B.WHITE_TALL_MUSHROOM : B.YELLOW_MUSHROOM;
      // is there lava within 3 blocks across and 1 up or down? (the lava mushroom's ground, 0.8091)
      const lavaNear = (x, y, z) => {
        for (let dy = -1; dy <= 1; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const lx = x + dx, lz = z + dz, ly = y + dy;
          if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && ly > 0 && (data[idx(lx, ly, lz)] & 255) === B.LAVA) return true;
        }
        return false;
      };
      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          // cave floors: stone floor with air directly above, below surface crust
          const caveTop = Math.min(h - 4, 94);
          for (let y = 3; y < caveTop; y++) {
            const floor = data[idx(x, y, z)] & 255, cave = (floor === B.STONE || floor === B.DIRT) && (data[idx(x, y + 1, z)] & 255) === B.AIR;   // dirt 0.8271
            if (cave && hash3(cx * 1171 + x, y + 3000, cz * 937 + z) < (SHROOMS2 ? 0.00065 : 0.0005))   // halved in 0.799 (was 0.002), again 0.819; 30% more in rev 20 (0.837)
              data[idx(x, y + 1, z)] = hash3(cx * 1171 + x, y + 4000, cz * 937 + z) < 1 / 3
                ? B.RED_MUSHROOM : hash3(cx * 1171 + x, y + 4000, cz * 937 + z) < 2 / 3
                ? brownish(hash3(cx * 1181 + x, y + 4100, cz * 941 + z)) : B.BLUE_MUSHROOM;   // thirds since 0.7691
            // a lava mushroom on cave floor near lava (0.8091)
            else if (cave && hash3(cx * 1187 + x, y + 3100, cz * 947 + z) < 0.015 && lavaNear(x, y, z))   // halved 0.819
              data[idx(x, y + 1, z)] = B.LAVA_MUSHROOM;
            // a yellow berry bush, in any stage, on the cave's dirt (0.8271; rarely on any floor in 0.827): it glows as it ripens
            else if (cave && floor === B.DIRT && hash3(cx * 1193 + x, y + 3200, cz * 953 + z) < CAVE_YELLOW_BUSH)
              data[idx(x, y + 1, z)] = B.YELLOWBERRY_BUSH | ((((hash3(cx * 1197 + x, y + 3300, cz * 959 + z) * BERRY_STAGES) | 0) % BERRY_STAGES) << 8);
          }
          // surface under leaves: air at h+1 with leaves within 2..5 blocks above
          if (h > WATER_LEVEL && h < 120) {
            const topBk = data[idx(x, h, z)] & 255;
            if (SHROOMS2 && (topBk === B.GRASS || topBk === B.DIRT) && (data[idx(x, h + 1, z)] & 255) === B.AIR) {
              /* rev 20 (0.837): under ANY tree and 30% more of them: brown and black under every kind, and the tree's
                 own, red under birch, blue under spruce, yellow under oak; white out in the open beside trees (a
                 clearing, a meadow by a wood), and very rarely on the plains' flat by a tree */
              let leaf = 0;
              for (let dy = 2; dy <= 6 && h + dy < CY; dy++) {
                const b = data[idx(x, h + dy, z)] & 255;
                if (b === B.LEAVES || b === B.BIRCH_LEAVES || b === B.SPRUCE_LEAVES) { leaf = b; break; }
              }
              const r0 = hash3(cx * 1279 + x, h + 5000, cz * 1031 + z);
              if (leaf && r0 < 0.000175 * 1.3) {
                const k = hash3(cx * 1279 + x, h + 6000, cz * 1031 + z);
                data[idx(x, h + 1, z)] = k < 0.3 ? B.BROWN_MUSHROOM : k < 0.6 ? B.BLACK_MUSHROOM
                  : leaf === B.BIRCH_LEAVES ? B.RED_MUSHROOM : leaf === B.SPRUCE_LEAVES ? B.BLUE_MUSHROOM : B.YELLOW_MUSHROOM;
              } else if (!leaf && topBk === B.GRASS && r0 < (TREE[gi] >= 0.5 ? 0.00022 : 0.00003)) {
                // a tree's wood within 4 (this chunk's), and on the plains a flat spot
                let wood = false;
                for (let dz = -4; dz <= 4 && !wood; dz++)
                  for (let dx = -4; dx <= 4 && !wood; dx++) {
                    const lx = x + dx, lz = z + dz;
                    if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                    for (let dy = 1; dy <= 3; dy++) {
                      const b = data[idx(lx, h + dy, lz)] & 255;
                      if (b === B.LOG || b === B.BIRCH_LOG || b === B.SPRUCE_LOG) { wood = true; break; }
                    }
                  }
                const flatHere = TREE[gi] >= 0.5 || (H[gi - 1] === h && H[gi + 1] === h && H[gi - 20] === h && H[gi + 20] === h);
                if (wood && flatHere) data[idx(x, h + 1, z)] = B.WHITE_TALL_MUSHROOM;
              }
            } else if ((topBk === B.GRASS || topBk === B.DIRT) &&
                (data[idx(x, h + 1, z)] & 255) === B.AIR) {
              let hasLeaves = false;
              for (let dy = 2; dy <= 5 && h + dy < CY; dy++) {
                if ((data[idx(x, h + dy, z)] & 255) === B.LEAVES) { hasLeaves = true; break; }
              }
              if (hasLeaves && hash3(cx * 1279 + x, h + 5000, cz * 1031 + z) < 0.000175)   // halved in 0.799, again 0.819
                data[idx(x, h + 1, z)] = hash3(cx * 1279 + x, h + 6000, cz * 1031 + z) < 1 / 3
                  ? B.RED_MUSHROOM : hash3(cx * 1279 + x, h + 6000, cz * 1031 + z) < 2 / 3
                  ? brownish(hash3(cx * 1289 + x, h + 6100, cz * 1039 + z)) : B.BLUE_MUSHROOM;   // thirds since 0.7691
            }
          }
        }
      }

      /* ---- fallen hollow logs (0.7842): now and then a forest chunk has a hollow log lying in the grass, 3-5
         long along X or Z, of the wood that grows there, with mushrooms springing up around it. Kept inside
         the chunk, on level ground, and cut short at the first cell that is not free (never under 3).
         0.7845: rarer, fewer mushrooms, and some start from a stump — a standing hollow log or a plain log. ---- */
      {
        const sx = (hash3(cx * 61 + 7300, 31, cz * 67 + 7300) * 16) | 0;
        const sz = (hash3(cx * 71 + 7300, 37, cz * 73 + 7300) * 16) | 0;
        const gi = (sx + 2) + (sz + 2) * 20, h = H[gi];
        const wx = cx * 16 + sx, wz = cz * 16 + sz;
        if (TREE[gi] >= 0.5 && !DES[gi] && h > WATER_LEVEL + 1 && h <= 146 &&
            (RIM[gi] || !(SNO[gi] && !snowForestAt(wx, wz))) &&                      // plain snow has no trees to fall
            hash3(cx * 79 + 7300, 41, cz * 83 + 7300) < 0.075) {                            // 0.35 before 0.7845, 0.15 before 0.799
          const wood = RIM[gi] ? B.HOLLOW_RIME_LOG                                 // a frozen one in the coldest snow (0.836)
                     : SNO[gi] || TAIGA[gi] ? B.HOLLOW_SPRUCE_LOG                  // spruce forest too (0.823)
                     : birchAt(wx, wz) ? B.HOLLOW_BIRCH_LOG : B.HOLLOW_LOG;
          const alongX = hash3(cx * 89 + 7300, 43, cz * 97 + 7300) < 0.5;
          const want = 3 + ((hash3(cx * 101 + 7300, 47, cz * 103 + 7300) * 3) | 0);
          const ground = (t) => t === B.GRASS || t === B.DIRT || (RIM[gi] && t === B.SNOW);   // ...lying on its snow (0.836)
          const open = (v) => (v & 255) === B.AIR || layerCount(v) > 0;                  // leaf litter or snow gives way
          const cells = [];
          for (let k = 0; k < want; k++) {
            const lx = sx + (alongX ? k : 0), lz = sz + (alongX ? 0 : k);
            if (lx > 15 || lz > 15 || H[(lx + 2) + (lz + 2) * 20] !== h) break;
            if (!ground(data[idx(lx, h, lz)] & 255) || !open(data[idx(lx, h + 1, lz)])) break;
            cells.push([lx, lz]);
          }
          if (cells.length >= 3) {
            // the first cell is sometimes the stump it fell from: 30% a standing hollow log, 20% the tree's plain log
            const stump = hash3(cx * 107 + 7300, 53, cz * 109 + 7300);
            const plainLog = wood === B.HOLLOW_RIME_LOG ? B.RIME_LOG : wood === B.HOLLOW_SPRUCE_LOG ? B.SPRUCE_LOG : wood === B.HOLLOW_BIRCH_LOG ? B.BIRCH_LOG : B.LOG;
            cells.forEach(([lx, lz], k) => {
              data[idx(lx, h + 1, lz)] = k === 0 && stump < 0.3 ? wood
                                     : k === 0 && stump < 0.5 ? plainLog
                                     : wood | ((alongX ? 1 : 2) << 8);
            });
            const frozen = wood === B.HOLLOW_RIME_LOG;                                   // nothing grows by a rime log (0.836)
            const shroom = (mx, mz, salt) => {
              if (frozen || mx < 0 || mx > 15 || mz < 0 || mz > 15 || H[(mx + 2) + (mz + 2) * 20] !== h) return;
              const roll = hash3(cx * 1301 + mx, h + 7400 + salt, cz * 1307 + mz);
              if (roll >= 0.03) return;                                                   // 0.3 before 0.7845, 0.12 before 0.799, 0.06 before 0.819
              if (!ground(data[idx(mx, h, mz)] & 255) || !open(data[idx(mx, h + 1, mz)])) return;
              data[idx(mx, h + 1, mz)] = roll < 0.01 ? B.RED_MUSHROOM
                : roll < 0.02 ? brownish(hash3(cx * 1303 + mx, h + 7500 + salt, cz * 1309 + mz)) : B.BLUE_MUSHROOM;
            };
            cells.forEach(([lx, lz], k) => { shroom(lx + (alongX ? 0 : 1), lz + (alongX ? 1 : 0), k * 2);
                                             shroom(lx - (alongX ? 0 : 1), lz - (alongX ? 1 : 0), k * 2 + 1); });
            // ...and now and then a tuft of loose fiber, 1-2 layers, in the free grass beside it (0.786)
            const fiber = (mx, mz, salt) => {
              if (frozen || mx < 0 || mx > 15 || mz < 0 || mz > 15 || H[(mx + 2) + (mz + 2) * 20] !== h) return;
              const roll = hash3(cx * 1409 + mx, h + 7600 + salt, cz * 1423 + mz);
              if (roll >= 0.1) return;                                                    // 0.2 before 0.791
              if (!ground(data[idx(mx, h, mz)] & 255) || (data[idx(mx, h + 1, mz)] & 255) !== B.AIR) return;
              data[idx(mx, h + 1, mz)] = layerVal(B.FIBER_BLOCK, roll < 0.035 ? 2 : 1);   // same 35% double share
            };
            cells.forEach(([lx, lz], k) => { fiber(lx + (alongX ? 0 : 1), lz + (alongX ? 1 : 0), k * 2);
                                             fiber(lx - (alongX ? 0 : 1), lz - (alongX ? 1 : 0), k * 2 + 1); });
            const [ax, az] = cells[0], [bx, bz] = cells[cells.length - 1];
            shroom(ax - (alongX ? 1 : 0), az - (alongX ? 0 : 1), 50);
            shroom(bx + (alongX ? 1 : 0), bz + (alongX ? 0 : 1), 51);
          }
        }
      }

      /* ---- fiber blocks (0.769): very rarely an open-plains grass block is a tuft of packed fiber
         instead. Same plains test the melons below use: low tree density, no desert, no snow. ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h <= WATER_LEVEL + 1 || h > 146 || DES[gi] || SNO[gi] || TREE[gi] >= 0.5) continue;
          if ((data[idx(x, h, z)] & 255) !== B.GRASS) continue;
          if (hash3(cx * 1709 + x, 9100, cz * 1523 + z) < 0.00002) data[idx(x, h, z)] = B.FIBER_BLOCK;   // 0.0006 before 0.791, 0.0002 before 0.8096
        }

      /* ---- gourds (0.8233): each on its own climate level (LVL, CLIMATE_LADDER in 55-biomes.js), in a small patch on grass.
         Pumpkins in the cold (-1: cold plains, spruce forest) 2-6, watermelons in the warm plains (1) 2-4, cantaloupes in
         the mild land (0) 1-2 and very rare. Two tries a chunk; `ch` is a try's chance [open plains, forest]. ---- */
      const gourdPatch = (salt, block, lvl, ch, nMin, nMax, radius) => {
        for (let ai = 0; ai < 2; ai++) {
          const mx = (hash3(cx * 47 + salt + ai,     19, cz * 43 + salt + ai) * 16) | 0;
          const mz = (hash3(cx * 53 + salt + ai * 3, 23, cz * 59 + salt + ai) * 16) | 0;
          const gi = (mx + 2) + (mz + 2) * 20, h = H[gi];
          if (h <= WATER_LEVEL + 1 || h > 146 || DES[gi] || SNO[gi] || Math.round(LVL[gi]) !== lvl) continue;
          if (hash3(cx * 71 + salt + ai, 77, cz * 67 + salt + ai) >= ch[TREE[gi] < 0.5 ? 0 : 1]) continue;
          const want = nMin + ((hash3(cx + salt + ai, 81, cz + salt + ai) * (nMax - nMin + 1)) | 0);
          // up to four tries a gourd, so a patch nearly always reaches its count
          for (let k = 0, got = 0; k < want * 4 && got < want; k++) {
            const lx = mx + (((hash3(cx * 31 + ai + k * 7 + salt,  89, cz * 29 + ai + k * 5) * (radius * 2 + 1)) | 0) - radius);
            const lz = mz + (((hash3(cx * 37 + ai + k * 11 + salt, 97, cz * 41 + ai + k * 3) * (radius * 2 + 1)) | 0) - radius);
            if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
            const lh = H[(lx + 2) + (lz + 2) * 20];
            if (lh <= WATER_LEVEL + 1 || lh > 146) continue;
            if ((data[idx(lx, lh, lz)] & 255) !== B.GRASS || (data[idx(lx, lh + 1, lz)] & 255) !== B.AIR) continue;
            data[idx(lx, lh + 1, lz)] = block;
            got++;
          }
        }
      };
      // a fifth more of each since 0.835491
      gourdPatch(2200, B.PUMPKIN,    -1, [0.0144, 0.0072], 2, 6, 3);
      gourdPatch(1100, B.MELON,       1, [0.0144, 0.0072], 2, 4, 2);
      gourdPatch(3300, B.CANTALOUPE,  0, [0.0036, 0.0012], 1, 2, 2);

      /* ---- salt crust (0.8091): a thin white skin on beach sand at the water's edge, in patches ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h < WATER_LEVEL || h > WATER_LEVEL + 1) continue;                     // the beach line, just above the water
          if ((data[idx(x, h, z)] & 255) !== B.SAND || (data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          if (!(H[gi - 1] < WATER_LEVEL || H[gi + 1] < WATER_LEVEL || H[gi - 20] < WATER_LEVEL || H[gi + 20] < WATER_LEVEL)) continue;
          const wx = cx * 16 + x, wz = cz * 16 + z;
          if (fbm(wx * 0.06 + 4100, wz * 0.06 - 4100, 2) < 0.1) continue;          // patches, not a ribbon round every shore
          // a quarter more beside the sea than a lake or a river (0.8233): WW 1 is ocean
          const wi = (x + WM) + (z + WM) * WG;
          const sea = WW[wi + 1] === 1 || WW[wi - 1] === 1 || WW[wi + WG] === 1 || WW[wi - WG] === 1;
          if (hash3(cx * 1319 + x, h + 8100, cz * 1321 + z) < 0.0275 * (sea ? 1.25 : 1)) data[idx(x, h + 1, z)] = layerVal(B.SALT_CRUST, 1, false);   // one layer (0.8097); a quarter of 0.11 since 0.8193
        }

      /* ---- wild wheat (0.8233): patches of 4-7 on mild, flat land (level 0 open plains), mostly in the flowery meadows
         (the same mask the surface plants use below) and a little rarer on the rest of the plains. ---- */
      for (let ai = 0; ai < 2; ai++) {
        const mx = (hash3(cx * 61 + 4400 + ai,     29, cz * 67 + 4400 + ai) * 16) | 0;
        const mz = (hash3(cx * 71 + 4400 + ai * 3, 31, cz * 73 + 4400 + ai) * 16) | 0;
        const gi = (mx + 2) + (mz + 2) * 20, h = H[gi];
        if (h < 100 || h > CY - 2 || DES[gi] || SNO[gi] || TREE[gi] >= 0.5 || Math.round(LVL[gi]) !== 0) continue;
        const meadow = fbm((cx * 16 + mx) * 0.006 + 6006, (cz * 16 + mz) * 0.006 - 3003, 2) > 0.32;
        if (hash3(cx * 79 + 4400 + ai, 61, cz * 83 + 4400 + ai) >= (meadow ? 0.144 : 0.0288)) continue;   // twice as many patches since 0.826 (0.06, 0.012), a fifth more since 0.835491
        const want = 4 + ((hash3(cx + 4400 + ai, 67, cz + 4400 + ai) * 4) | 0);
        for (let k = 0, got = 0; k < want * 4 && got < want; k++) {
          const lx = mx + (((hash3(cx * 43 + ai + k * 7 + 4400,  71, cz * 47 + ai + k * 5) * 5) | 0) - 2);
          const lz = mz + (((hash3(cx * 53 + ai + k * 11 + 4400, 73, cz * 59 + ai + k * 3) * 5) | 0) - 2);
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
          const lh = H[(lx + 2) + (lz + 2) * 20];
          if (lh < 100 || lh > CY - 2) continue;
          if ((data[idx(lx, lh, lz)] & 255) !== B.GRASS || (data[idx(lx, lh + 1, lz)] & 255) !== B.AIR) continue;
          // in any stage (0.826; always ripe before): variant 0 ripe, 1..6 growing (updateWheatGrow, 51-seasons.js; 1..7 until 0.8273)
          data[idx(lx, lh + 1, lz)] = B.WHEAT | ((((hash3(cx * 37 + lx + 4500, lh, cz * 41 + lz + 4500) * 7) | 0) % 7) << 8);
          got++;
        }
      }

      /* ---- flint stones (0.732): dark nodules lying loose on the turf, 0.05% of grass columns.
         Runs BEFORE the plant scatter on purpose — the plants all require air above them, so
         claiming the cell first is what stops a 22% grass roll from swallowing a 0.05% one.
         Grass-only, which already rules out desert and beach; SNO rules out the snow biome. ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 99 || h > CY - 2 || SNO[gi]) continue;
          if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          if (hash3(cx * 73 + lx + 8100, 43, cz * 67 + lz + 8100) >= 0.002) continue;    // 0.2%
          data[idx(lx, h + 1, lz)] = B.FLINT_ROCK;
        }
      /* ---- stone pebbles (0.8095): commoner than flint, on turf, dirt, stone and gravel, so a mountain
         walk turns them up as readily as a meadow. Five make a stone block, the first stone you can keep. ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 99 || h > CY - 2 || SNO[gi]) continue;
          const top = data[idx(lx, h, lz)] & 255;
          if (top !== B.GRASS && top !== B.DIRT && top !== B.STONE && top !== B.GRAVEL) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          if (hash3(cx * 79 + lx + 8300, 47, cz * 71 + lz + 8300) >= 0.004) continue;    // 0.4%
          data[idx(lx, h + 1, lz)] = B.STONE_PEBBLE;
        }

      /* ---- surface plants: short grass (small amount over all forest/plains, none in
         desert/snow) + poppy / blue orchid flowers (denser in plains/meadows) ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 99 || h > CY - 2 || DES[gi] || SNO[gi]) continue;                       // y100..200; none in desert/snow
          if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          const isPlains = TREE[gi] < 0.5;
          // meadow = flower-rich sub-region of plains (own low-freq mask)
          const wx = cx * 16 + lx, wz = cz * 16 + lz;
          const meadow = isPlains && fbm(wx * 0.006 + 6006, wz * 0.006 - 3003, 2) > 0.32;
          const r = hash3(cx * 97 + lx + 5500, 71, cz * 83 + lz + 5500);
          // flowers cut ~95%: forest tiny, plains small, meadows the main place they gather
          const flowerCh = (meadow ? 0.02 : isPlains ? 0.0015 : 0.0003) * 0.15;  // 70% fewer flowers (0.799), half again (0.819)
          // short grass thins with altitude (full at y100, ~1/4 at y200) but never disappears
          const alt = Math.min(1, Math.max(0, (h - 100) / 100));
          const grassCh  = 0.22 * (1 - alt * 0.75);
          // two-block tall grass: a slice of the short-grass budget, plains-heavier, needs 2 air
          const tallCh   = (isPlains ? 0.05 : 0.015) * (1 - alt * 0.75);
          /* Berry bushes are scattered thinly and land in a RANDOM growth stage, so a fresh world
             already has some ripe and some bare — the regrow timer takes over from there. */
          const berryCh = (isPlains ? 0 : 0.0045) * (1 - alt * 0.75);             // forests only since 0.8233; 25% more 0.826 (0.003), 20% more 0.8272
          if (r < flowerCh) {
            data[idx(lx, h + 1, lz)] = hash3(cx * 31 + lx + 12, 19, cz * 29 + lz + 7) < 0.5 ? B.POPPY : B.ORCHID;
          } else if (r < flowerCh + berryCh) {
            /* Stage and KIND are rolled from two independent hashes, so a fresh world already has
               sprouts, bare bushes and ripe ones of both bushes — the regrow timer takes over from
               there. The stage numbers are the growth order, so the roll is just 0..3. */
            const stage = Math.min(BERRY_STAGE.GROWN, (hash3(cx * 41 + lx + 909, 37, cz * 43 + lz + 606) * BERRY_STAGES) | 0);
            /* Which bush, by what the place is like (0.827; red 40%, blue 40%, black 20% anywhere before): white in
               a birch wood, black in a spruce one, blue by water, red the higher up, yellow now and then in a deep
               (dark) forest. Each is a weight, so a mixed place grows a mix. */
            const ti = terrainInfo(wx, wz);
            let wet = false;
            for (let dz = -3; dz <= 3 && !wet; dz++) for (let dx = -3; dx <= 3; dx++) if (WW[(lx + WM + dx) + (lz + WM + dz) * WG]) { wet = true; break; }
            const high = Math.min(1, Math.max(0, (h - 120) / 40));
            const W = [[B.REDBERRY_BUSH, 0.3 + 2 * high], [B.BLUEBERRY_BUSH, wet ? 3 : 0.08],
                       [B.BLACKBERRY_BUSH, TAIGA[gi] || ti.fTaiga > 0.5 ? 3 : 0.12],
                       [B.YELLOWBERRY_BUSH, ti.deepF > 0.5 ? 0.5 : 0.02], [B.WHITEBERRY_BUSH, birchAt(wx, wz) ? 3 : 0.1]];
            let roll = hash3(cx * 53 + lx + 4242, 29, cz * 59 + lz + 2424) * W.reduce((a, w) => a + w[1], 0), bush = B.REDBERRY_BUSH;
            for (const [b, w] of W) { roll -= w; if (roll <= 0) { bush = b; break; } }
            data[idx(lx, h + 1, lz)] = bush | (stage << 8);
          } else if (r < flowerCh + berryCh + tallCh && h + 2 < CY && (data[idx(lx, h + 2, lz)] & 255) === B.AIR) {
            data[idx(lx, h + 1, lz)] = B.TALL_LOWER;
            data[idx(lx, h + 2, lz)] = B.TALL_UPPER;
          } else if (r < flowerCh + berryCh + tallCh + grassCh) {
            data[idx(lx, h + 1, lz)] = B.TALLGRASS;
          }
        }

      /* ---- canyons: rare winding ravines. A low-freq region mask gates them (deserts get a
         much higher chance); inside a region, a ridge line |noise|≈0 cuts a V-shaped gorge up
         to ~32 deep. Normal-biome canyons are 50/50 filled with water (per 128-block cell);
         desert canyons are always dry. Runs after decoration so the cut clears trees/plants.
         Skipped in flat worlds — a 32-deep gorge would punch clean through the slab. */
      if (!FLAT)
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          if (h <= WATER_LEVEL || h > 141 || HIWET) continue;   // skip oceans and high peaks; no cut by water up in the land (0.83548)
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const isDesert = DES[gi] === 1;
          const rg = fbm(wx * 0.0015 + 555, wz * 0.0015 - 333, 2);
          if (rg < (isDesert ? 0.10 : 0.30)) continue;           // region gate (deserts: far more)
          // canyon TYPE per 128-block region: 0 = crack (thin earth-crack, rare),
          // 1 = wide canyon (5-10+ across, flatter floor), 2 = long canyon (stretched along one axis)
          const rcx = Math.floor(wx / 128), rcz = Math.floor(wz / 128);
          const tr = hash2(rcx * 3 + 41, rcz * 5 - 17);
          const type = tr < 0.18 ? 0 : tr < 0.62 ? 1 : 2;
          let cn, lw, dMax;
          if (type === 0)      { cn = fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2); lw = 0.03; dMax = 30; }
          else if (type === 1) { cn = fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2); lw = 0.12; dMax = 36; }
          else {                                                 // long: anisotropic noise stretches the line
            const flip = hash2(rcx * 7 + 3, rcz * 9 - 5) < 0.5;
            cn = flip ? fbm(wx * 0.0035 + 911, wz * 0.011 - 477, 2)
                      : fbm(wx * 0.011 + 911, wz * 0.0035 - 477, 2);
            lw = 0.07; dMax = 32;
          }
          if (Math.abs(cn) > lw) continue;                       // not on this region's canyon line
          const prof = 1 - Math.abs(cn) / lw;                    // 1 at centre -> 0 at rim
          // wide: flatter floor; none in the Coldest Deep Snow, fading out over its edge (0.836: its ice stands on whole ground)
          const depth = Math.floor(Math.pow(prof, type === 1 ? 1.4 : 2) * dMax * (1 - RIMF[gi]));
          if (depth < 4) continue;
          const floorY = Math.max(22, h - depth);
          const watered = !isDesert &&
            hash2(Math.floor(wx / 128) * 7 + 13, Math.floor(wz / 128) * 11 - 7) < 0.2;
          const wFill = 90;                                      // water surface inside wet canyons
          for (let y = Math.min(h + 8, CY - 1); y >= floorY; y--) { // +8 clears trunks/leaves above the cut
            const i = idx(x, y, z);
            if ((data[i] & 255) === B.BEDROCK) break;
            data[i] = (watered && y <= wFill) ? B.WATER : B.AIR;
          }
        }

      /* ---- cactus: sparse 1-wide columns, 1-4 tall, on open desert / red-sand tops.
         Neighbouring terrain must not rise above the base so a fresh cactus never
         touches a block on its sides (matches the placement rule). ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          if (!DES[gi]) continue;
          const wx = cx * 16 + x, wz = cz * 16 + z;
          /* A fifth as many as before 0.8193, and gathered: a slow noise makes stands of cactus with open sand between
             (0.8 of the old chance inside a stand, none outside; about a fifth over the whole desert). */
          const stand = smooth01(fbm(wx * 0.012 + 3333.3, wz * 0.012 - 777.7, 2), 0.1, 0.5);
          const chance = (RED[gi] ? 0.0005 : 0.001) * 0.8 * stand;   // desert 0.1%, red sand 0.05% at the most
          if (hash3(wx, 7777, wz) >= chance) continue;
          const h = H[gi];
          const top = data[idx(x, h, z)] & 255;
          if (top !== B.SAND && top !== B.RED_SAND) continue;
          if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          if (heightAt(wx + 1, wz) > h || heightAt(wx - 1, wz) > h ||
              heightAt(wx, wz + 1) > h || heightAt(wx, wz - 1) > h) continue;
          /* Saguaro: a tapering column with 0-2 arms. An arm is one horizontal cactus cell out
             from the trunk followed by a short vertical run, so it flares into the trunk exactly
             the way a tree branch does and reads as a raised hand. Arms are placed with the same
             cell writes as the trunk — the log mesher does the rest. */
          const cw = (w) => (w << 2);                          // variant bits 2-7 = width index
          const CAC_BASE = 26, CAC_TIP = 20;                   // 60 -> 48 units
          const n = 3 + ((hash3(wx, 8888, wz) * 4) | 0);       // 3..6 tall
          const putCac = (cx2, cy2, cz2, axis, w) => {
            if (cx2 < 0 || cx2 > 15 || cz2 < 0 || cz2 > 15 || cy2 < 2 || cy2 > CY - 2) return;
            const i2 = idx(cx2, cy2, cz2);
            if ((data[i2] & 255) !== B.AIR) return;
            data[i2] = B.CACTUS | ((axis | cw(w)) << 8);
          };
          for (let k = 1; k <= n && h + k < CY - 1; k++) {
            const t = (k - 1) / Math.max(1, n - 1);
            putCac(x, h + k, z, 0, Math.round(CAC_BASE - (CAC_BASE - CAC_TIP) * t));
          }
          /* Arms leave the trunk high up — near the crown, and often above it once their vertical
             run is added, which is what gives a saguaro its raised-hands silhouette. Branching
             from halfway down made them read as a shrub. */
          const FLOWER_CHANCE = 0.05;
          const capFlower = (fx, fy, fz, salt) => {
            if (fy >= CY - 1 || (data[idx(fx, fy, fz)] & 255) !== B.AIR) return;
            if (fx < 0 || fx > 15 || fz < 0 || fz > 15) return;
            if (hash3(wx + salt, 3141 + salt, wz - salt) >= FLOWER_CHANCE) return;
            data[idx(fx, fy, fz)] = B.PINCUSHION;
          };
          const armCount = (hash3(wx + 5, 9999, wz + 5) * 2.4) | 0;    // 0..2
          const ARM_DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (let a = 0; a < armCount && n >= 4; a++) {
            const d = ARM_DIR[(hash3(wx + a * 7, 1234 + a, wz - a * 11) * 4) | 0];
            /* The elbow must sit BESIDE trunk, never level with the crown or above it — an arm
               that starts at the top reads as a second cactus balanced on the first rather than
               a limb. Clamping it one cell below the crown keeps it flanked by trunk; the 1-2
               cell vertical run afterwards is what raises the hand to crown height and past it. */
            const lo = h + Math.max(2, n - 3);
            const ay = Math.min(h + n - 1, lo + ((hash3(wx - a * 3, 4321 + a, wz + a * 13) * 3) | 0));
            const armAxis = d[0] ? 1 : 2;
            const ax2 = x + d[0], az2 = z + d[1];
            putCac(ax2, ay, az2, armAxis, 18);                         // 44 units, thinner than trunk
            const up = 1 + ((hash3(wx + a * 17, 555 + a, wz + a * 19) * 2) | 0);   // rises 1..2
            for (let u = 1; u <= up; u++) putCac(ax2, ay + u, az2, 0, 18);
            capFlower(ax2, ay + up + 1, az2, 17 + a * 31);             // flower on the raised hand
          }
          capFlower(x, h + n + 1, z, 3);                               // ...and on the trunk's crown
        }

      /* ---- sugar cane: ground column must be exactly one block above water level so the sand
         base sits at the shoreline and a side neighbour is water. Cane base ends up at y=h+1
         with water at y=WATER_LEVEL directly beside the sand base — the classic beach look.
         0.8233: only on warm and hot shores (climate level 1 and up, or a desert), about a third more of it, and in
         stands: a shore cell grows cane when it is a stand's seed, or mostly when a cell beside it is. The seeds are
         pure hashes of place, so a stand across a chunk border still agrees. ---- */
      const caneSeed = (wx, wz, s) => hash3(wx * 11 + 3301, 4242, wz * 13 + 5501) < s;
      for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
        const gi = (x + 2) + (z + 2) * 20;
        const h = H[gi];
        if (h !== WATER_LEVEL + 1) continue;                            // must be exactly at shore
        if (!DES[gi] && LVL[gi] < 0.5) continue;                        // warm or hot land only (0.8233)
        const top = data[idx(x, h, z)] & 255;
        if (top !== B.SAND && top !== B.GRASS && top !== B.DIRT && top !== B.RED_SAND && top !== B.PINK_SAND
            && top !== B.GRAVEL) continue;   // pink 0.822; gravel 0.8356 (the gravel beaches)
        if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
        // water adjacent at exactly y = WATER_LEVEL (shoreline)
        let waterAdj = false;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
          if ((data[idx(nx, WATER_LEVEL, nz)] & 255) === B.WATER) { waterAdj = true; break; }
        }
        if (!waterAdj) continue;
        const isBeach = (top === B.SAND || top === B.RED_SAND || top === B.PINK_SAND || top === B.GRAVEL);
        /* The old chance per cell (beach 0.85%, bank 0.25%) x 1.3, spread over a seed and about 5.6 more cells round it
           (8 neighbours x 70%), so the seed chance is that over 6.6. A fifth more since 0.8356 (x 1.2). */
        const s = (isBeach ? 0.85 : 0.25) * 0.01 * 1.3 * 1.2 / 6.6;
        const wx = cx * 16 + x, wz = cz * 16 + z;
        let grow = caneSeed(wx, wz, s);
        if (!grow && hash3(wx * 7 + 919, 4343, wz * 5 - 717) < 0.7)
          for (let dz = -1; dz <= 1 && !grow; dz++)
            for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && caneSeed(wx + dx, wz + dz, s)) { grow = true; break; }
        if (!grow) continue;
        const tall = 1 + Math.floor(hash3(wx, 9191, wz) * 3);           // 1..3
        // Start cane at h (replacing the top sand) so the base cell sits at water-surface elevation
        // and the plant reads as growing from the shoreline instead of on a raised ledge.
        for (let k = 0; k < tall && h + k < CY - 1; k++) data[idx(x, h + k, z)] = B.SUGAR_CANE;
      }

      /* ---- saplings: very sparse spawn on grass in tree-rich (forest) zones. Almost all oak;
         birch is a rare drop within an already-rare roll. ---- */
      for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
        const gi = (x + 2) + (z + 2) * 20;
        if (TREE[gi] < 0.35) continue;
        const h = H[gi];
        if (h <= WATER_LEVEL) continue;
        if ((data[idx(x, h, z)] & 255) !== B.GRASS) continue;
        if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
        const wx = cx * 16 + x, wz = cz * 16 + z;
        const r = hash3(wx * 19 + 4401, 8181, wz * 23 + 4501);
        if (r >= 0.00001) continue;                                     // 0.001%
        // pick oak vs birch on a separate hash so a single-value bias can't force birch every time
        const birchRoll = hash3(wx * 29 + 5501, 4747, wz * 31 + 6601);
        data[idx(x, h + 1, z)] = birchRoll < 0.1 ? B.BIRCH_SAPLING : B.OAK_SAPLING;
      }

      /* ---- loose ground layers (0.786) ----
         Desert dunes: sand, or red sand on red sand, piled 1-7 layers deep in rolling patches with bare
         ground between them. Exposed gravel carries 1-4 loose layers on top, and very rarely a thin
         scatter of gravel (1-2 layers) lies on other open ground. The last pass, so it only ever takes
         cells nothing else wanted. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h <= WATER_LEVEL || h > CY - 3 || (data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          const top = data[idx(x, h, z)] & 255, wx = cx * 16 + x, wz = cz * 16 + z;
          if ((top === B.SAND || top === B.RED_SAND) && DES[gi]) {
            const dune = fbm(wx * 0.035 + 811.3, wz * 0.035 - 377.9, 2) + (hash2(wx * 13 + 71, wz * 7 - 19) - 0.5) * 0.06;
            const n = Math.min(7, Math.floor((dune - 0.08) * 16));
            if (n >= 1) data[idx(x, h + 1, z)] = layerVal(top, n);
          } else if (top === B.GRAVEL) {
            const r = hash3(wx * 31 + 9100, 4101, wz * 37 - 9100);
            // a third as many since 0.799, and 1-2 deep instead of 1-4 (was r < 0.45)
            if (r < 0.15) data[idx(x, h + 1, z)] = layerVal(B.GRAVEL, 1 + ((r / 0.15 * 2) | 0));
          } else if (top === B.GRASS || top === B.DIRT || top === B.STONE) {
            const r = hash3(wx * 41 + 9300, 4303, wz * 43 - 9300);
            if (r < 0.00075) data[idx(x, h + 1, z)] = layerVal(B.GRAVEL, r < 0.00025 ? 2 : 1);   // halved in 0.799
            /* ...and a drift of fallen leaves the same way (0.7992), of the wood that grows there, only on
               the turf and only under a canopy-ish sky — near trees it reads as litter, not as scenery. */
            else if ((top === B.GRASS || top === B.DIRT) && TREE[gi] >= 0.4) {
              const lr = hash3(wx * 47 + 9500, 4507, wz * 53 - 9500);
              if (lr < 0.006) {
                const leaf = SNO[gi] || TAIGA[gi] ? B.SPRUCE_LEAVES
                           : birchAt(wx, wz) ? B.BIRCH_LEAVES : B.LEAVES;
                data[idx(x, h + 1, z)] = layerVal(leaf, lr < 0.002 ? 2 : 1);
              }
            }
          }
        }
      /* A cobweb must hang ON something (0.806): floor, wall or ceiling. Later passes — caves, ravines,
         water — can carve away the rock it was strung from, so every web is checked last and one with no
         solid face under, over or beside it (inside this chunk) is taken down. */
      {
        const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (let i = 0; i < data.length; i++) {
          if ((data[i] & 255) !== B.COBWEB) continue;
          const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
          let held = false;
          for (const [dx, dy, dz] of NB) {
            const nx = x + dx, ny = y + dy, nz = z + dz;
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || ny < 0 || ny >= CY) continue;
            const n = data[idx(nx, ny, nz)];
            if (n !== 0 && solidVal(n)) { held = true; break; }
          }
          if (!held) data[i] = B.AIR;
        }
      }
      /* ---- ice spikes (0.835, biomeRev 9) ----
         Pillars of packed ice standing out of the Ice Spikes biome, about one in fifteen of them huge, and small icebergs in
         the open sea of the snow. A spike is a pure function of its grid cell, so every chunk it reaches draws its own part
         of it and it crosses chunk borders whole, as the trees do. Each is a stack of discs narrowing to a point; a land
         one is sunk in the ground with its foot filled down to the slope, an iceberg runs from the bed as a column to the
         waterline and tapers above it. */
      if (SPIKES && !FLAT) {
        const SR = 7, SG = 6;                                  // the widest foot (from the centre), one candidate per SG x SG cell
        const x0 = cx * 16, z0 = cz * 16;
        for (let gcz = Math.floor((z0 - SR) / SG); gcz <= Math.floor((z0 + 15 + SR) / SG); gcz++)
          for (let gcx = Math.floor((x0 - SR) / SG); gcx <= Math.floor((x0 + 15 + SR) / SG); gcx++) {
            const r = hash2(gcx * 7 + 401, gcz * 11 - 977);
            const wx = gcx * SG + (((r * 4999) | 0) % SG), wz = gcz * SG + (((r * 6007) | 0) % SG);
            if (wx < x0 - SR || wx > x0 + 15 + SR || wz < z0 - SR || wz > z0 + 15 + SR) continue;
            const ti = terrainInfo(wx, wz);
            if (ti.fSnow <= 0.5) continue;
            const r2 = hash2(gcx * 13 + 7, gcz * 17 + 3), r3 = hash2(gcx * 19 - 5, gcz * 23 + 11);
            let base, top, from, rad, land = false;
            if (ti.h >= WATER_LEVEL && ti.h <= 132 && iceSpikesAt(wx, wz)) {
              if (r > 0.45) continue;                          // a spike in a little under half the cells
              land = true;
              const huge = r2 < 0.07;
              rad = huge ? 2.6 + r3 * 1.4 : 0.9 + r3 * 1.3;
              base = from = ti.h - 2;                          // its foot set in the ground
              top = ti.h + (huge ? 22 + ((r3 * 23) | 0) : 4 + ((r2 * 11) | 0));
            } else if (ti.h < WATER_LEVEL - 2 && !(ti.rT > 0.3 || ti.lk > 0.3)) {
              if (r > 0.035) continue;                         // the sea: an iceberg now and then
              const big = BIG_BERGS && r2 < 0.3;               // 0.8351: about a third of them big, and high
              rad = big ? 3.2 + r3 * 2.4 : 1.4 + r3 * 2.2;
              base = ti.h; from = WATER_LEVEL;                 // a column from the bed, tapering above the water
              top = WATER_LEVEL + (big ? 10 + ((r2 / 0.3 * 15) | 0) : 3 + ((r2 * 8) | 0));
            } else continue;
            top = Math.min(CY - 2, top);
            for (let y = base; y <= top; y++) {
              const t = y <= from ? 0 : (y - from) / Math.max(1, top - from);
              const rr = Math.max(0.3, rad * Math.pow(1 - t, 0.9));
              const ri = Math.ceil(rr);
              for (let dz = -ri; dz <= ri; dz++)
                for (let dx = -ri; dx <= ri; dx++) {
                  if (dx * dx + dz * dz > rr * rr + 0.3) continue;
                  const lx = wx + dx - x0, lz = wz + dz - z0;
                  if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                  data[idx(lx, y, lz)] = B.PACKED_ICE;
                  // the foot of a land spike reaches down to the ground on a slope, so no disc floats
                  if (land && y === base) {
                    for (let d = 1; d <= 6 && y - d > 1; d++) {
                      const below = data[idx(lx, y - d, lz)];
                      if (below !== 0 && solidVal(below)) break;
                      data[idx(lx, y - d, lz)] = B.PACKED_ICE;
                    }
                  }
                }
            }
          }
      }
      /* ---- rime ice (0.836, biomeRev 19) ----
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
            if (RIME2 && rr(0) > RI_KEEP * rimeKeep(ti)) continue;           // fewer, by its half (0.837)
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
            if (RIME2 && rr(0) > 0.24 * rimeKeep(ti)) continue;               // fewer, by its half (0.837)
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
      /* waterfalls (0.83549, rev 17): where water stands 2+ over the water beside it (a river's fall, a lake's outlet, a
         river reaching the sea off a cliff), the falling water hangs down the face as a sheet in the lower column, from
         its surface up to the higher one, its top running the upper water's way */
      if (FALLS) {
        // a column's curtain top (its own water's if none): the highest water 2+ over it beside it
        const curtainTop = (gi) => {
          let top = WLV[gi];
          if (H[gi] >= top) return -1;
          for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) if (H[n] < WLV[n] && WLV[n] >= WLV[gi] + 2 && WLV[n] > top) top = WLV[n];
          return top > WLV[gi] ? top : -1;
        };
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const gi = (x + 2) + (z + 2) * 20, wl = WLV[gi], wet = H[gi] < wl;
            const top = wet ? curtainTop(gi) : -1;
            if (top >= 0) {
              let fd = 0;
              for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) if (H[n] < WLV[n] && WLV[n] === top) fd = FDV[n];
              for (let y = wl + 1; y <= top && y <= CY - 2; y++) {
                const i = idx(x, y, z);
                if ((data[i] & 255) === B.AIR) data[i] = y === top && fd ? B.WATER | (fd << 11) | (1 << 15) : B.WATER;   // a fall's lip runs fast
              }
            }
            /* beside a falling sheet: dry ground rises in rock to its top, so the fall runs in a notch, not out over a
               bank; and any cave beside it (under dry ground or under water), dug before the sheet hung, is filled so it
               never shows the sheet's side. Dry ground lower than any water beside it (where two rivers' levels meet,
               the bank going with the lower) is raised in its own top block to hold that water in. */
            for (const n of [gi - 1, gi + 1, gi - 20, gi + 20]) {
              const nt = curtainTop(n);
              if (nt >= 0) {
                // beside a sheet: an open cell over lower water stays open (the fall's face); over ground, or in a cave, rock
                for (let y = WLV[n] + 1; y <= nt && y <= CY - 2; y++) {
                  const i = idx(x, y, z), b = data[i] & 255;
                  if (b !== B.AIR && b !== B.SNOW) continue;
                  let yy = y - 1;
                  while (yy > 1 && (data[idx(x, yy, z)] & 255) === B.AIR) yy--;
                  if ((data[idx(x, yy, z)] & 255) !== B.WATER) data[i] = B.STONE;
                }
              } else if (!wet && H[n] < WLV[n] && WLV[n] > H[gi]) {
                const fill = WLV[n] - H[gi] > 2 ? B.STONE : data[idx(x, H[gi], z)] & 255;   // a tall rise is rock
                for (let y = H[gi] + 1; y <= WLV[n] && y <= CY - 2; y++) {
                  const i = idx(x, y, z), b = data[i] & 255;
                  if (b === B.AIR || b === B.SNOW) data[i] = fill;
                }
              }
            }
          }
      }
      /* the last word on leaks (0.835491, rev 18): water beside open air whose column stands on dry ground below (not on
         lower water, which is a fall's open face) gets that air filled with the ground's top block, upward, so no water
         ever stands open over a ledge however the passes above left it. Inside this chunk, from what is really there. */
      if (DIVIDE)
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const gi = (x + 2) + (z + 2) * 20;
            for (let y = Math.max(2, Math.min(H[gi], WLV[gi]) + 1); y <= CY - 2; y++) {
              if ((data[idx(x, y, z)] & 255) !== B.WATER) { if (y > WLV[gi] + 60) break; continue; }
              for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, nz = z + dz;
                if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || (data[idx(nx, y, nz)] & 255) !== B.AIR) continue;
                let yy = y - 1;
                while (yy > 1 && (data[idx(nx, yy, nz)] & 255) === B.AIR) yy--;
                const below = data[idx(nx, yy, nz)] & 255;
                if (below === B.WATER || below === B.ICE) continue;
                const fill = PROPS[below] && PROPS[below].opaque && y - yy <= 2 ? below : B.STONE;   // a tall rise is rock
                for (let fy = yy + 1; fy <= y; fy++) data[idx(nx, fy, nz)] = fill;
              }
            }
          }
      /* water up in the land stays water (0.83548): anything a later pass set in it (a plant, a pebble, a log) goes */
      if (HIWET)
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const gi = (x + 2) + (z + 2) * 20, wl = WLV[gi];
            if (wl <= WATER_LEVEL || H[gi] >= wl) continue;
            for (let y = H[gi] + 1; y <= wl; y++) {
              const b = data[idx(x, y, z)] & 255;
              if (b !== B.WATER && b !== B.ICE && b !== B.PACKED_ICE) data[idx(x, y, z)] = B.WATER;
            }
          }
      return data.buffer;
    }

    // how far inside snow and hot (desert, red sand) climate a column is, 0..1, and its height: the main thread's
    // temperature reads it (0.82, 54-stats-effects.js)
    const climateAt = (x, z) => {
      const t = terrainInfo(x, z);
      // air: on the climate ladder (0.8232) the level's own warmth or cold in degrees (CLIMATE_LADDER), else null
      return { snow: t.fSnow || 0, hot: Math.max(t.fDesert || 0, t.fRed || 0), red: t.fRed || 0, h: t.h, air: t.air,   // red: the sandstorm's colour (0.825)
               inland: Math.max(t.rT || 0, t.lk || 0) > 0.3,     // a river or a lake, not the sea (0.8351, the ice)
               rime: t.rimeAir || 0 };                           // how far into the Coldest Deep Snow's cold (0.836)
    };
    return { genChunk, heightAt, biomeAt, climateAt, climAt, rimeOpenAt: bio.rimeOpenAt };   // rimeOpenAt: castle sites (0.8393)
  }

  /* ---------- greedy mesher ----------
     Six directional sweeps. For each slice a 2D mask stores the raw voxel value
     (ID + variant), so only faces with identical texture/variant merge. Corner tables per
     direction keep windings CCW-outward and side textures upright & unmirrored.            */

  /* Fast leaves (0.8386, MultithreadPlan C7, Options > Video): a whole leaf block is drawn as a solid block. It hides
     every face behind it (logs inside a canopy, other leaves of any kind, the ground under a bush), goes in the opaque
     pass (one-sided, no see-through sorting) and its tile carries FAST_LEAF_TILE, which the shader (04) reads as "fill
     the holes with the leaf's own colour, darker" and "do not sway". Set in the workers only (setFastLeaves, from the
     'opts' message): icons and drops built on the main thread keep their see-through leaves. */
  let FAST_LEAVES = false;
  const FAST_LEAF_TILE = 0x8000;
  const LEAFY = new Uint8Array(256);
  for (const k of Object.keys(B)) if (/LEAVES$/.test(k) && PROPS[B[k]] && PROPS[B[k]].model === 'cube') LEAFY[B[k]] = 1;
  const fastLeaf = (v) => FAST_LEAVES && LEAFY[v & 255] === 1 && !layerCount(v) && !shapeOfVal(v);
  function setFastLeaves(on) { FAST_LEAVES = !!on; }
  // Does block `a` show a face toward neighbour `b`?
  function faceVisible(a, b, P) {
    if (a === 0) return false;
    if (b === 0) return true;
    const A = P[a & 255], Bp = P[b & 255];
    if (!Bp) return true;                     // an id this build does not know: treat it as open
    if (opaqueVal(b)) return false;           // hidden behind an opaque neighbour (a chiseled one is not, 0.783)
    if (fastLeaf(b)) return false;            // fast leaves hide what is behind them (0.8386)
    if (A.opaque) return true;                // opaque against transparent -> visible
    if (Bp.shapes && ((b >> 8) & 255) && (shapeOfVal(b) || slabMixed(b))) return true;   // glass beside a glass slab (or a mixed one, 0.8264) still needs its face
    if ((a & 255) === (b & 255)) return false; // same type (incl. leaf|leaf): cull inner faces —
                                               // inside a bush only the outer shell renders, and
                                               // the cutout pass is double-sided so that shell
                                               // is visible from within (big-bush feeling)
    return true;                              // different transparents (water vs glass...)
  }

  //          dir:      +Y        -Y        +X        -X        +Z        -Z
  const DIR_FACE  = [    2,        3,        0,        1,        4,        5   ]; // faces[] index
  const DIR_SHADE = [   255,      140,      178,      178,      216,      216  ]; // baked light
  const mask = new Int32Array(16 * CY);      // reused across sweeps (max plane size)
  const maskL = new Uint16Array(16 * CY);    // parallel mask of per-face block-light level (with its colour bit, 0.834)
  /* Light COLOUR (0.834): a packed light is block light (bits 0-3) | sky light (4-7) | LIGHT_COLD (bit 8), set where the
     brightest block light reaching the cell is a cold one (crystal torch, glowcrystal block, glow vine). The shader (04)
     tints that light blue. Two lights joined per nibble keep the colour of the brighter block light. */
  const LIGHT_COLD = 0x100;
  const litMax = (m, n) => (Math.max((m >> 4) & 15, (n >> 4) & 15) << 4)
                         | ((m & 15) >= (n & 15) ? m & (15 | LIGHT_COLD) : n & (15 | LIGHT_COLD));

  /* ---- LEVEL OF DETAIL (0.8092) ----
     A far chunk is meshed simpler (11-chunks.js picks the level from its distance):
       1  no small things: plants, torches, mushrooms, gourds, pebbles, vines, the mortar, gem clusters and
          the furnace chimney are left out. Blocks and trees look exactly the same.
       2  as 1, and the chunk is meshed at HALF resolution: every 2x2x2 group of cells becomes one block.
     Level 2 works on a copy of the chunk in which all 8 cells of a group hold the same value, so the ordinary
     greedy mesher merges them and never draws the faces between them. A group is SOLID if ANY of its cells
     is: a far chunk can only grow by a block, never open a hole, so the full-detail chunk beside it (which
     culls against this chunk's real cells) never shows a gap. The upper cells are looked at first, so a
     grass top stays grass. The light is evened out per group too, or the per-cell light would stop the faces
     merging and half resolution would save nothing. */
  // how strongly a value claims its group: 3 a solid cube or log, 2 leaves / glass, 1 water or lava, 0 nothing
  function _lodRank(v) {
    const p = PROPS[v & 255];
    if (!p || !(v & 255)) return 0;
    if (p.model === 'log') return 3;
    if (p.model !== 'cube' || layerCount(v)) return 0;            // snow and leaf layers stay out: a skin, not a block
    if ((v & 255) === B.WATER || (v & 255) === B.LAVA) return 1;
    return p.opaque ? 3 : (shapeOfVal(v) ? 3 : 2);                 // a slab or stairs counts as its full block
  }
  // the value a group is drawn as: shapes dropped, logs full width, fluids full
  function _lodVal(v) {
    const id = v & 255, p = PROPS[id], va = (v >> 8) & 255;
    if (p.model === 'log') return (id | (((va & 3) | (LOG_W_BLOCK << 2)) << 8)) >>> 0;
    if (id === B.WATER || id === B.LAVA) return id;
    if (!p.opaque) return id;                                      // leaves and glass: no variant, so they merge
    return p.shapes && (shapeOfVal(v) || slabMixed(v)) ? id : v;    // a mixed slab far off: its low block (0.8263)
  }
  function lodDownsample(data, light) {
    const out = new Uint32Array(data.length), lout = new Uint16Array(light.length);
    for (let y0 = 0; y0 < CY; y0 += 2)
      for (let z0 = 0; z0 < 16; z0 += 2)
        for (let x0 = 0; x0 < 16; x0 += 2) {
          let best = 0, rank = 0, glo = 0, sky = 0, cold = 0;
          for (let dy = 1; dy >= 0; dy--)
            for (let dz = 0; dz < 2; dz++)
              for (let dx = 0; dx < 2; dx++) {
                const i = (x0 + dx) + ((z0 + dz) << 4) + ((y0 + dy) << 8), v = data[i], r = _lodRank(v);
                if (r > rank) { rank = r; best = v; }
                const l = light[i];
                if ((l & 15) > glo) { glo = l & 15; cold = l & LIGHT_COLD; }
                if (((l >> 4) & 15) > sky) sky = (l >> 4) & 15;
              }
          const v = rank ? _lodVal(best) : 0, l = glo | (sky << 4) | cold;
          // a log keeps ONE full-width column per group: four would each draw their own bark (a tree grew 4x the faces)
          const oneCol = rank && PROPS[v & 255].model === 'log';
          for (let dy = 0; dy < 2; dy++)
            for (let dz = 0; dz < 2; dz++)
              for (let dx = 0; dx < 2; dx++) {
                const i = (x0 + dx) + ((z0 + dz) << 4) + ((y0 + dy) << 8);
                out[i] = oneCol && (dx || dz) ? 0 : v; lout[i] = l;
              }
        }
    return [out, lout];
  }
  // a neighbour's border light (16 x CY, [i + y*16]) evened out in 2x2 groups to match
  function lodEdgeLight(s) {
    const o = new Uint16Array(s.length);
    for (let y = 0; y < CY; y += 2)
      for (let i = 0; i < 16; i += 2) {
        let glo = 0, sky = 0, cold = 0;
        for (const k of [i + y * 16, i + 1 + y * 16, i + (y + 1) * 16, i + 1 + (y + 1) * 16]) {
          if ((s[k] & 15) > glo) { glo = s[k] & 15; cold = s[k] & LIGHT_COLD; }
          if (((s[k] >> 4) & 15) > sky) sky = (s[k] >> 4) & 15;
        }
        const l = glo | (sky << 4) | cold;
        o[i + y * 16] = o[i + 1 + y * 16] = o[i + (y + 1) * 16] = o[i + 1 + (y + 1) * 16] = l;
      }
    return o;
  }

  // layers (0.785): Map(cell index -> block ids bottom to top) for this chunk's mixed layer stacks, or null
  // lod (0.8092): 0 full detail, 1 no small things, 2 half resolution (see LEVEL OF DETAIL above)
  // ox, oz: the chunk's world origin, for things that vary by place (a mushroom's size, 0.819); null for icons and drops
  function meshChunk(dataBuf, sxnB, sxpB, sznB, szpB, lightBuf, lxnB, lxpB, lznB, lzpB, layers, lod = 0, ox = null, oz = 0) {
    let data = new Uint32Array(dataBuf);
    const sxn = new Uint32Array(sxnB), sxp = new Uint32Array(sxpB);
    const szn = new Uint32Array(sznB), szp = new Uint32Array(szpB);
    let light = new Uint16Array(lightBuf);    // this chunk's block-light (flood-filled main-thread); 16 bits for the colour (0.834)
    let lxn = new Uint16Array(lxnB), lxp = new Uint16Array(lxpB);
    let lzn = new Uint16Array(lznB), lzp = new Uint16Array(lzpB);
    // the real light, kept for the dark-cave test below: the evened light of level 2 is only for shading
    const L0 = { light, lxn, lxp, lzn, lzp };
    if (lod >= 2) {
      [data, light] = lodDownsample(data, light);
      lxn = lodEdgeLight(lxn); lxp = lodEdgeLight(lxp); lzn = lodEdgeLight(lzn); lzp = lodEdgeLight(lzp);
      layers = null;
    }
    const P = PROPS;
    // the climate at the chunk's 17x17 column corners (0.8231): -1 cold .. 1 warm — world chunks only, not icons or drops
    let clim = null;
    if (ox != null && _climAt) {
      clim = new Float32Array(289);
      for (let z = 0; z <= 16; z++) for (let x = 0; x <= 16; x++) clim[x + z * 17] = _climAt(ox + x, oz + z);
    }
    // a vertex's climate, bilinear between the corners, as a signed byte: neighbouring quads agree on shared corners
    function climOf(x, z) {
      x = x < 0 ? 0 : x > 16 ? 16 : x; z = z < 0 ? 0 : z > 16 ? 16 : z;
      const ix = Math.min(15, x | 0), iz = Math.min(15, z | 0), fx = x - ix, fz = z - iz, i = ix + iz * 17;
      const a = clim[i] + (clim[i + 1] - clim[i]) * fx, b = clim[i + 17] + (clim[i + 18] - clim[i + 17]) * fx;
      return Math.round((a + (b - a) * fz) * 127);
    }

    // neighbour-aware voxel read (y out of world: below = stone so bottom faces cull, above = air)
    function gb(x, y, z) {
      if (y < 0) return B.STONE;
      if (y > CY - 1) return 0;
      if (x < 0)  return sxn[z + y * 16];
      if (x > 15) return sxp[z + y * 16];
      if (z < 0)  return szn[x + y * 16];
      if (z > 15) return szp[x + y * 16];
      return data[x + (z << 4) + (y << 8)];
    }
    // neighbour-aware light read (a face's light = light of the transparent cell it faces).
    // Byte is PACKED: low nibble = block light (glow), high nibble = sky light; bit 8 its colour (LIGHT_COLD, 0.834).
    function gl(x, y, z) {
      if (y > CY - 1) return 0xF0;               // open sky above the world
      if (y < 0) return 0;
      if (x < 0)  return lxn[z + y * 16];
      if (x > 15) return lxp[z + y * 16];
      if (z < 0)  return lzn[x + y * 16];
      if (z > 15) return lzp[x + y * 16];
      return light[x + (z << 4) + (y << 8)];
    }
    // the sky light a cell really has, not evened out (the dark-cave test of a far chunk, 0.8092)
    function skyReal(x, y, z) {
      if (y > CY - 1) return 15;
      if (y < 0) return 0;
      const v = x < 0 ? L0.lxn[z + y * 16] : x > 15 ? L0.lxp[z + y * 16] : z < 0 ? L0.lzn[x + y * 16]
              : z > 15 ? L0.lzp[x + y * 16] : L0.light[x + (z << 4) + (y << 8)];
      return (v >> 4) & 15;
    }

    // one growable buffer set per render pass
    // 0 opaque, 1 cutout (leaves, plants), 2 water, 3 lava, 4 see-through (glass, 0.8263)
    // dark (0.835492): a water surface's depth shade per corner, 0..255; only quadW writes it, padded with 0 to the vertex
    const passes = [null, null, null, null, null].map(() => ({ pos: [], uv: [], tile: [], shade: [], lite: [], clim: [], dark: [], index: [], v: 0 }));
    let minY = CY, maxY = 0;
    function pushClim(g, tile, c0, c1, c2, c3) {
      if (clim && TINTED[tile]) g.clim.push(climOf(c0[0], c0[2]), climOf(c1[0], c1[2]), climOf(c2[0], c2[2]), climOf(c3[0], c3[2]));
      else g.clim.push(0, 0, 0, 0);
    }

    function quad(pass, c0, c1, c2, c3, u0, u1, u2, u3, tile, shade, lite) {
      const g = passes[pass], base = g.v;
      g.pos.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], c3[0], c3[1], c3[2]);
      g.uv.push(u0[0], u0[1], u1[0], u1[1], u2[0], u2[1], u3[0], u3[1]);
      g.tile.push(tile, tile, tile, tile);
      g.shade.push(shade, shade, shade, shade);
      g.lite.push(lite, lite, lite, lite);
      pushClim(g, tile, c0, c1, c2, c3);
      g.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      g.v += 4;
      const lo = Math.min(c0[1], c2[1]), hi = Math.max(c0[1], c2[1]);
      if (lo < minY) minY = lo;
      if (hi > maxY) maxY = hi;
    }
    function quadV(pass, c0, c1, c2, c3, u0, u1, u2, u3, tile, s0, s1, s2, s3, lite) {
      const g = passes[pass], base = g.v;
      g.pos.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], c3[0], c3[1], c3[2]);
      g.uv.push(u0[0], u0[1], u1[0], u1[1], u2[0], u2[1], u3[0], u3[1]);
      g.tile.push(tile, tile, tile, tile);
      g.shade.push(s0, s1, s2, s3);
      g.lite.push(lite, lite, lite, lite);
      pushClim(g, tile, c0, c1, c2, c3);
      g.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      g.v += 4;
      const lo = Math.min(c0[1], c2[1]), hi = Math.max(c0[1], c2[1]);
      if (lo < minY) minY = lo;
      if (hi > maxY) maxY = hi;
    }

    // sweep config per direction: normal axis d, sign s, mask axes (ua=u, va=v), plane dims
    const CFG = [
      { d: 1, s: +1, ua: 0, va: 2, us: 16, vs: 16  },   // +Y
      { d: 1, s: -1, ua: 0, va: 2, us: 16, vs: 16  },   // -Y
      { d: 0, s: +1, ua: 2, va: 1, us: 16, vs: CY },   // +X
      { d: 0, s: -1, ua: 2, va: 1, us: 16, vs: CY },   // -X
      { d: 2, s: +1, ua: 0, va: 1, us: 16, vs: CY },   // +Z
      { d: 2, s: -1, ua: 0, va: 1, us: 16, vs: CY },   // -Z
    ];
    const dims = [16, CY, 16];
    const pos = [0, 0, 0], npos = [0, 0, 0];

    // highest non-air layer in this chunk — everything above is open sky with no faces, so the
    // sweeps (and the per-model loops below) skip it. Huge win now the world is tall: a flat
    // chunk tops out ~y66 and never scans the 130+ empty layers above.
    let topY = 0;
    for (let y = dims[1] - 1; y >= 0; y--) {
      const base = y << 8; let has = false;
      for (let i = 0; i < 256; i++) if (data[base + i] !== 0) { has = true; break; }
      if (has) { topY = y; break; }
    }
    const yCap = Math.min(dims[1], topY + 2);   // +1 layer of air above the top block keeps top faces

    for (let dir = 0; dir < 6; dir++) {
      const { d, s, ua, va, us, vs } = CFG[dir];
      const faceIdx = DIR_FACE[dir], shade = DIR_SHADE[dir];
      const nMax = d === 1 ? Math.min(dims[d], yCap) : dims[d];   // cap the vertical extent
      const vsE  = va === 1 ? Math.min(vs, yCap) : vs;

      for (let n = 0; n < nMax; n++) {
        // ---- build visibility mask for this slice ----
        let any = false;
        for (let v = 0; v < vsE; v++) {
          for (let u = 0; u < us; u++) {
            pos[d] = n; pos[ua] = u; pos[va] = v;
            const a = data[pos[0] + (pos[2] << 4) + (pos[1] << 8)];
            let m = 0, ml = 0;
            if (a !== 0 && P[a & 255] && P[a & 255].model === 'cube' && (a & 255) !== B.WATER && (a & 255) !== B.LAVA
                && !(((a >> 8) & 255) && P[a & 255].shapes && (shapeOfVal(a) || slabMixed(a)))) {   // a chiseled cube emits with the models below (0.783), a mixed slab too (0.8263)   // non-cube models emit separately; water/lava handled by emitWater/emitLava
              npos[0] = pos[0]; npos[1] = pos[1]; npos[2] = pos[2]; npos[d] += s;
              const nv = gb(npos[0], npos[1], npos[2]);
              const nl = gl(npos[0], npos[1], npos[2]);
              /* A far chunk (lod 1+) leaves out a face that opens onto pitch-dark AIR: the inside of a cave
                 no sky light reaches, which cannot be seen from half the render distance away. That is most
                 of a chunk's faces (0.8092, measured ~60%). Dark water is kept, so a deep sea floor never opens. */
              if (lod && (nv & 255) === B.AIR && skyReal(npos[0], npos[1], npos[2]) === 0) { /* skipped */ }
              /* 0.837: a half-resolution chunk's see-through block (ice, glass) shows no face across the chunk's edge
                 unless an opaque block stands there. Its 2x2x2 groups grow ice a block past the real ice (into the
                 water under a frozen lake, the air over it), and the edge is read from the neighbour's REAL cells, so
                 every far chunk's edge drew a wall of ice faces: the grid of lines seen through frozen lakes. */
              else if (lod >= 2 && P[a & 255].pass === 4 && (npos[0] < 0 || npos[0] > 15 || npos[2] < 0 || npos[2] > 15)
                       && !opaqueVal(nv)) { /* skipped */ }
              else if (faceVisible(a, nv, P)) {
                m = a; any = true;
                ml = nl;                              // face lit by the transparent cell it faces
                // a faint glow of its own (ores, 0.765), so it can be spotted in a pitch-black cave
                const sg = P[a & 255].selfGlow;
                if (sg && (ml & 15) < sg) ml = (ml & 0xF0) | sg;
              }
            }
            mask[u + v * us] = m;
            maskL[u + v * us] = ml;
          }
        }
        if (!any) continue;

        // ---- greedy rectangle expansion (faces merge only when tile AND light match) ----
        for (let v = 0; v < vsE; v++) {
          for (let u = 0; u < us;) {
            const val = mask[u + v * us], lv = maskL[u + v * us];
            if (!val) { u++; continue; }
            let w = 1;
            while (u + w < us && mask[u + w + v * us] === val && maskL[u + w + v * us] === lv) w++;
            let h = 1;
            outer: while (v + h < vsE) {
              for (let k = 0; k < w; k++)
                if (mask[u + k + (v + h) * us] !== val || maskL[u + k + (v + h) * us] !== lv) break outer;
              h++;
            }
            emit(dir, n, u, v, w, h, val, lv);
            for (let dv = 0; dv < h; dv++)
              for (let k = 0; k < w; k++) mask[u + k + (v + dv) * us] = 0;
            u += w;
          }
        }
      }

      function emit(dir, n, u0, v0, w, h, val, lv) {
        const id = val & 255, prop = PROPS[id];
        // MODEL dispatch — only 'cube' exists today; non-cube models (slabs, stairs,
        // torches, doors + rotation variants) would branch here with their own emitters.
        if (prop.model !== 'cube') return;
        let tile = prop.faces[faceIdx];
        const varb = (val >> 8) & 255;
        // grass "snowy" variant: snow-covered sides (top stays grass, bottom stays dirt).
        // driven by the variant byte, set wherever a snow block sits on grass.
        if (id === B.GRASS && varb === V.GRASS_SNOWY && faceIdx !== 2 && faceIdx !== 3)
          tile = T.GRASS_SNOW_SIDE;
        // TNT lit-blink variant: every face flashes white over its OWN picture — the top keeps the top (0.804)
        if (id === B.TNT && (varb & 1)) tile = faceIdx === 2 ? T.TNT_TOP_LIT : faceIdx === 3 ? T.TNT_BOTTOM : T.TNT_LIT;
        // lying log: ring texture on the faces along the log's axis (1 = X, 2 = Z)
        if (id === B.LOG && varb)
          tile = (varb === 1 ? (faceIdx === 0 || faceIdx === 1) : (faceIdx === 4 || faceIdx === 5))
            ? T.LOG_TOP : T.LOG;
        // rot:'side' blocks: front tile sits on the variant's facing; lit furnace swaps it
        if (id === B.FURNACE) tile = furnaceTile(varb, faceIdx);   // its rock's set (0.809)
        if (id === B.CRAFTING_BENCH) tile = benchTile(varb, faceIdx);   // its wood's set (0.809)
        /* A lying pillar (0.8093): its top on the two faces along its axis (1 = X, 2 = Z), and its side art
           turned a quarter on the rest, so the fluting runs along it rather than across. */
        let sw = false;
        if (prop.pillar && (varb & 3)) {
          const ax = varb & 3, end = ax === 1 ? (faceIdx === 0 || faceIdx === 1) : (faceIdx === 4 || faceIdx === 5);
          tile = end ? prop.faces[2] : prop.faces[0];
          sw = !end && (ax === 1 || dir === 2 || dir === 3);
        }
        const R = sw ? (a) => [a[1], a[0]] : (a) => a;
        // fast leaves: solid, in the opaque pass, the tile marked for the shader to fill (0.8386)
        const fastL = fastLeaf(val);
        const pass = fastL ? 0 : prop.pass;
        if (fastL) tile |= FAST_LEAF_TILE;
        let wc = n + (s > 0 ? 1 : 0);        // face plane coordinate along axis d
        // water surface sits slightly below the block top (classic look)
        if (dir === 0 && id === B.WATER) wc -= 0.12;
        const u1 = u0 + w, v1 = v0 + h;
        switch (dir) {
          case 0: quad(pass, [u0,wc,v0],[u0,wc,v1],[u1,wc,v1],[u1,wc,v0], R([0,0]),R([0,h]),R([w,h]),R([w,0]), tile, shade, lv); break;
          case 1: quad(pass, [u0,wc,v0],[u1,wc,v0],[u1,wc,v1],[u0,wc,v1], R([0,0]),R([w,0]),R([w,h]),R([0,h]), tile, shade, lv); break;
          case 2: quad(pass, [wc,v0,u0],[wc,v1,u0],[wc,v1,u1],[wc,v0,u1], R([w,0]),R([w,h]),R([0,h]),R([0,0]), tile, shade, lv); break;
          case 3: quad(pass, [wc,v0,u0],[wc,v0,u1],[wc,v1,u1],[wc,v1,u0], R([0,0]),R([w,0]),R([w,h]),R([0,h]), tile, shade, lv); break;
          case 4: quad(pass, [u0,v0,wc],[u1,v0,wc],[u1,v1,wc],[u0,v1,wc], R([0,0]),R([w,0]),R([w,h]),R([0,h]), tile, shade, lv); break;
          case 5: quad(pass, [u0,v0,wc],[u0,v1,wc],[u1,v1,wc],[u1,v0,wc], R([w,0]),R([w,h]),R([0,h]),R([0,0]), tile, shade, lv); break;
        }
      }
    }

    // ---- non-cube models (slab): emitted per-block with bespoke geometry ----
    // Chisel shapes (slab halves, stairs) come from shapeBoxesAt since 0.783; below, the older notes on
    // doubles). Each face's UVs come from the box extents so half faces sample the matching half
    // of the texture. Faces flush with the cell border cull against opaque neighbours.
    // f = 6-tile faces array [+X,-X,+Y(top),-Y(bottom),+Z,-Z] so slabs get real top/bottom textures
    /* `own` (wall plates, 0.7651): a face that sits INSIDE the cell reads the cell's own light, not the
       neighbour's. A glow vine's front face faces the cell beyond it, and in a one-block gap that cell
       is rock with no light of its own, so the vine rendered dark right beside its own glow. */
    // sw (0.7842): bitmask by face index (+X,-X,top,bottom,+Z,-Z) of faces whose texture turns a quarter,
    // so the bark of a lying hollow log runs along it instead of across
    // a furnace's chimney (0.809): a 6 x 6 x 6 px box on the cell floor, each face showing the whole texture
    function emitChimney(x, y, z, set) {
      const x0 = x + 5 / 16, x1 = x + 11 / 16, z0 = z + 5 / 16, z1 = z + 11 / 16, y0 = y, y1 = y + 6 / 16;
      const L = gl(x, y, z), side = set[5];
      quad(0, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0], [0,0],[0,1],[1,1],[1,0], set[6], 255, L);   // top
      quad(0, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1], [1,0],[1,1],[0,1],[0,0], side, 178, L);     // +X
      quad(0, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], [0,0],[1,0],[1,1],[0,1], side, 178, L);     // -X
      quad(0, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], [0,0],[1,0],[1,1],[0,1], side, 216, L);     // +Z
      quad(0, [x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0], [1,0],[1,1],[0,1],[0,0], side, 216, L);     // -Z
    }
    /* A mushroom (0.8091): SHROOM_MODEL's boxes, each face on its sheet at 8 texels a model pixel. The sheet
       sits in its layer's bottom-left corner (03-atlas.js), so one model pixel is 1/16 of the layer's UV. */
    /* In the world (0.819) a mushroom is 40% of its model, and each place grows its own: 0.5x to 1.5x of that,
       from a hash of where it stands, scaled about the middle of its foot. The art is squeezed with it (the UVs
       keep the model's own sizes). Icons and drops (no ox) keep the full model. */
    /* Growth (0.821, 51-seasons.js): the variant's bits 0-2 are the size it grows to (1..7 = 0.5x..1.5x; 0 = one
       from before, or from the world generator, sized by where it stands as above) and bits 3-7 how many of 31
       steps it still has to grow (0 = grown). A sprout is drawn at the part it has grown, never under 12%. */
    const SHROOM_SCALE = 0.4, SHROOM_STEPS = 31;
    function emitShroom(x, y, z, kind, vr = 0) {
      const set = SHROOM_T[kind], L = gl(x, y, z), P = 1 / 16;
      let s = 1;
      if (ox != null) {
        const m = vr & 7, left = (vr >> 3) & 31;
        let size;
        if (m) size = 0.5 + (m - 1) / 6;
        else {
          let hh = Math.imul((ox + x) | 0, 374761393) + Math.imul(y | 0, 217645177) + Math.imul((oz + z) | 0, 668265263);
          hh = Math.imul(hh ^ (hh >>> 13), 1274126177); hh ^= hh >>> 16;
          size = 0.5 + (hh >>> 0) / 4294967296;
        }
        s = SHROOM_SCALE * size * Math.max(0.12, 1 - left / SHROOM_STEPS);
      }
      const sx = (a) => x + (8 + (a - 8) * s) * P, sz = (c) => z + (8 + (c - 8) * s) * P, sy = (b) => y + b * s * P;
      for (const [a0, b0, c0, a1, b1, c1, side, top, bot] of SHROOM_MODEL[kind]) {
        const x0 = sx(a0), x1 = sx(a1), y0 = sy(b0), y1 = sy(b1), z0 = sz(c0), z1 = sz(c1);
        const w = (a1 - a0) * P, h = (b1 - b0) * P, d = (c1 - c0) * P;
        if (side) {
          const t = set[side[0]], u0 = side[1] * P, v0 = side[2] * P;
          const U = (k) => u0 + k, V = (k) => v0 + k;
          quad(0, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1], [U(d),V(0)],[U(d),V(h)],[U(0),V(h)],[U(0),V(0)], t, 178, L);   // +X
          quad(0, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], [U(0),V(0)],[U(d),V(0)],[U(d),V(h)],[U(0),V(h)], t, 178, L);   // -X
          quad(0, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], [U(0),V(0)],[U(w),V(0)],[U(w),V(h)],[U(0),V(h)], t, 216, L);   // +Z
          quad(0, [x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0], [U(w),V(0)],[U(w),V(h)],[U(0),V(h)],[U(0),V(0)], t, 216, L);   // -Z
        }
        if (top) {
          const t = set[top[0]], u0 = top[1] * P, v0 = top[2] * P;
          quad(0, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0], [u0,v0],[u0,v0+d],[u0+w,v0+d],[u0+w,v0], t, 255, L);
        }
        if (bot) {
          const t = set[bot[0]], u0 = bot[1] * P, v0 = bot[2] * P;
          quad(0, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], [u0,v0],[u0+w,v0],[u0+w,v0+d],[u0,v0+d], t, 140, L);
        }
      }
    }
    // `u`: the box the UVs are taken from, the box itself unless a model maps its whole picture on each face (0.824)
    // `ps`: the render pass, 0 unless the block is see-through (glass shapes and carpets in the cutout pass, 0.8261)
    /* Shapes and carpets of a see-through block (glass and its looks) go in its own pass with the full block, so they
       stay see-through (0.8261; drawn in the opaque pass since shapes came in 0.783, which showed glass solid; the
       see-through pass 4 since 0.8263). Leaf and snow carpets stay where they were. */
    const _shapePass = (id) => { const p = PROPS[id].pass; return p === 4 ? 4 : p === 1 && !PROPS[id].layerStack ? 1 : 0; };
    // `skip`: faces left out, a bit each in the order below (top 1, bottom 2, +X 4, -X 8, +Z 16, -Z 32; 0.8264)
    function emitBoxFaces(x, y, z, b, f, own, sw = 0, glow = 0, u = b, ps = 0, skip = 0) {
      const x0 = x+b[0], y0 = y+b[1], z0 = z+b[2], x1 = x+b[3], y1 = y+b[4], z1 = z+b[5];
      const op = (xx, yy, zz) => { const nv = gb(xx, yy, zz); return opaqueVal(nv) || fastLeaf(nv); };   // fast leaves hide too (0.8386)
      let L = own ? gl(x, y, z) : -1;
      // a faint light of its own, as an ore's selfGlow gives its faces (gem clusters, 0.7945)
      if (glow && L >= 0 && (L & 15) < glow) L = (L & 0xF0) | glow;
      const lit = (inner, xx, yy, zz) => (inner && L >= 0 ? L : gl(xx, yy, zz));
      const T4 = (k, a, c, d, e) => ((sw >> k) & 1) ? [[a[1],a[0]], [c[1],c[0]], [d[1],d[0]], [e[1],e[0]]] : [a, c, d, e];
      if (!(skip & 1) && (b[4] < 1 || !op(x, y+1, z)))    // top
        quad(ps, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],
             ...T4(2, [u[0],u[2]],[u[0],u[5]],[u[3],u[5]],[u[3],u[2]]), f[2], 255, lit(b[4] < 1, x, y+1, z));
      if (!(skip & 2) && (b[1] > 0 || !op(x, y-1, z)))    // bottom
        quad(ps, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],
             ...T4(3, [u[0],u[2]],[u[3],u[2]],[u[3],u[5]],[u[0],u[5]]), f[3], 140, lit(b[1] > 0, x, y-1, z));
      if (!(skip & 4) && (b[3] < 1 || !op(x+1, y, z)))    // +X
        quad(ps, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],
             ...T4(0, [1-u[2],u[1]],[1-u[2],u[4]],[1-u[5],u[4]],[1-u[5],u[1]]), f[0], 178, lit(b[3] < 1, x+1, y, z));
      if (!(skip & 8) && (b[0] > 0 || !op(x-1, y, z)))    // -X
        quad(ps, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],
             ...T4(1, [u[2],u[1]],[u[5],u[1]],[u[5],u[4]],[u[2],u[4]]), f[1], 178, lit(b[0] > 0, x-1, y, z));
      if (!(skip & 16) && (b[5] < 1 || !op(x, y, z+1)))   // +Z
        quad(ps, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
             ...T4(4, [u[0],u[1]],[u[3],u[1]],[u[3],u[4]],[u[0],u[4]]), f[4], 216, lit(b[5] < 1, x, y, z+1));
      if (!(skip & 32) && (b[2] > 0 || !op(x, y, z-1)))   // -Z
        quad(ps, [x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],
             ...T4(5, [1-u[0],u[1]],[1-u[0],u[4]],[1-u[3],u[4]],[1-u[3],u[1]]), f[5], 216, lit(b[2] > 0, x, y, z-1));
    }
    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)], vid = val & 255;
          if (!PROPS[vid]) continue;                           // an id this build does not know
          const lc = layerCount(val);                          // a layer stack (0.785)
          const shapeBoxes = lc ? null : shapeBoxesAt(gb, x, y, z, val);   // a chiseled slab or stairs (0.783)
          /* The furnace's chimney (0.8041): a 6px stub standing proud of its top, drawn only — no
             hitbox, it never blocks a placement. Emitted in the cell above so the open air lights it.
             Since 0.809 it is 6px tall (furnace_*.json) in its rock's own chimney art, the whole picture
             on every face rather than a window of the furnace's. */
          // ...on top of a chimney of walls when one stands on it (0.827)
          if (vid === B.FURNACE && !lod) {
            const k = chimneyHeight(gb, x, y, z);
            if (y + 1 + k < CY && !opaqueVal(gb(x, y + 1 + k, z))) emitChimney(x, y + 1 + k, z, FURNACE_T[furnaceRockOf((val >> 8) & 255)]);
          }
          // a far chunk leaves out the small models: pebbles, gourds, salt, vines, the mortar, clusters (0.8092)
          if (lod) { const md = PROPS[vid].model; if (md === 'carpet' || md === 'wall' || md === 'voxel' || md === 'cluster') continue; }
          if (lc) {
            /* One box per RUN of the same block rather than one per layer: a 6-deep snow drift is one box,
               and only a real change of block costs another. A mixed stack reads its list; if that is
               missing it draws as its top block all the way down rather than not at all. */
            const ids = layerMixed(val) && layers ? layers.get(x + (z << 4) + (y << 8)) : null;
            const at = (i) => (ids && i < ids.length ? ids[i] : vid);
            for (let i = 0; i < lc;) {
              const b = at(i);
              let j = i + 1;
              while (j < lc && at(j) === b) j++;
              if (PROPS[b]) { const bx = [0, i / LAYER_MAX, 0, 1, j / LAYER_MAX, 1]; emitBoxFaces(x, y, z, bx, PROPS[b].faces, false, 0, 0, bx, _shapePass(b)); }
              i = j;
            }
          }
          else if (shapeBoxes)
            for (const bx of shapeBoxes) emitBoxFaces(x, y, z, bx, PROPS[vid].faces, false, 0, 0, bx, _shapePass(vid));
          else if (slabMixed(val)) {                     // two slabs of different blocks (0.8263): each half in its own art
            const ids = layers ? layers.get(x + (z << 4) + (y << 8)) : null;
            const hb = slabMixBoxes(val), ax = (((val >> 8) & ROT_MASK) & 6) >> 1;   // 0 y, 1 x, 2 z
            const two = [0, 1].map(h => ids && ids.length === 2 && PROPS[ids[h]] ? ids[h] : vid);
            /* The face where the halves meet is drawn only when the half across it can be seen through (0.8264): a
               glass half shows the stone under it, but never draws its own face flat against that stone. Each half
               in its own pass, so a glass half is see-through like a glass slab. */
            const INNER = [[1, 2], [4, 8], [16, 32]][ax];          // the low half's inner face, the high half's
            for (let h = 0; h < 2; h++)
              emitBoxFaces(x, y, z, hb[h], PROPS[two[h]].faces, false, 0, 0, hb[h], _shapePass(two[h]),
                           PROPS[two[1 - h]].opaque ? INNER[h] : 0);
          }
          else if (PROPS[vid].model === 'hollow')      // a hollow log (0.7842): bark shell and its filling, lit from inside
            for (const [bx, f, sw] of hollowParts(val)) emitBoxFaces(x, y, z, bx, f, true, sw);
          else if (PROPS[vid].model === 'carpet' || PROPS[vid].model === 'wall') {   // a wall plate is an upright carpet (0.765)
            const va = (val >> 8) & 255;
            const boxes = PROPS[vid].boxesByVar[va] || PROPS[vid].boxesByVar[0];
            const own = PROPS[vid].model === 'wall';     // lit by its own cell (0.7651)
            // a carved pumpkin (0.824): its face on the side it was turned to, and the whole picture on each face
            const fv = PROPS[vid].facesByVar, fl = PROPS[vid].fullUV ? FULL_UV_BOX : undefined;
            for (let bi = 0; bi < boxes.length; bi++)
              emitBoxFaces(x, y, z, boxes[bi], fv ? fv[va & 3] : PROPS[vid].faces, own, 0, 0, fl);
          }
          else if (PROPS[vid].model === 'voxel') {
            // a voxel model (0.77): every box in its own material, lit from its own cell like a wall plate
            // variant 1 leaves out the animated part, variant 2 is that part alone (0.772, the grinding pestle)
            const vp = PROPS[vid], va = (val >> 8) & 255;
            for (const bx of vp.voxBoxes) {
              if ((va === 1 && bx[6] === vp.animMat) || (va === 2 && bx[6] !== vp.animMat)) continue;
              emitBoxFaces(x, y, z, bx, vp.matFaces[bx[6]] || vp.faces, true);
            }
          }
          else if (PROPS[vid].model === 'cluster')      // a gem cluster (0.7945): crystals out of the face behind it
          {
            const va = (val >> 8) & 255, cp = PROPS[vid];
            const bed = CLUSTER_BEDS[va >> CLUSTER_BED_SHIFT] || cp.bedFaces;   // the rock it grows from (0.7948)
            for (const [bx, gem] of CLUSTER_BOXES[(va & 7) % 6][(va >> 3) & (CLUSTER_LAYOUTS - 1)])
              emitBoxFaces(x, y, z, bx, gem ? cp.faces : bed, true, 0, gem ? (cp.selfGlow || 0) : 0);
          }
        }

    // ---- non-cube: cross/billboard (plants) ----
    // Two diagonal quads, each emitted front + back (double-sided)
    /* Torch (0.7451): a real stick rather than a flat billboard, so it can LEAN on a wall. The
       stick is the torch texture's own 8-texel column (28..35) and its bottom 40 rows, so every
       side shows stick and flame — the same UV scheme emitBoxFaces uses, face for face. Variant
       0 stands upright; 1-4 hang on a wall and lean away from it (+X, -X, +Z, -Z). A wall torch
       is the floor stick slid against the wall, raised, and SHEARED outward along its height: a
       shear keeps every face planar, as a rotation would, for a fraction of the arithmetic. */
    const TORCH_DIRS = [null, [1, 0], [-1, 0], [0, 1], [0, -1]];
    const TORCH_LEAN = 0.41;                       // tan(~22 degrees): the classic wall-torch lean
    // how far a wall torch's foot slides toward its wall: the stick's centre on the wall plane, half of it buried (0.7531)
    const TORCH_WALL = 0.5;
    const TORCH_BOX = [28 / 64, 0, 28 / 64, 36 / 64, 40 / 64, 36 / 64];
    function emitTorch(x, y, z, varb, id = B.TORCH) {   // id: which torch, for its picture (0.834)
      const d = TORCH_DIRS[varb & 7] || null;
      const nx = d ? d[0] : 0, nz = d ? d[1] : 0;
      const T3 = (px, py, pz) => {
        if (!d) return [px, py, pz];
        const ly = py - y;                         // height up the stick, 0..0.625
        return [px - nx * TORCH_WALL + nx * TORCH_LEAN * ly, py + 0.18, pz - nz * TORCH_WALL + nz * TORCH_LEAN * ly];
      };
      /* The cap samples the flame's top 2x2 (texture rows 6-7, v 0.5-0.625) and the foot the end of
         the stick (rows 14-15). Both used to take the box's own XZ footprint as UVs, which lands mid
         sprite: half flame, half brown stick across the top of every torch (0.7523). */
      const b = TORCH_BOX, tile = PROPS[id].faces[0], lite = gl(x, y, z);
      const x0 = x+b[0], y0 = y+b[1], z0 = z+b[2], x1 = x+b[3], y1 = y+b[4], z1 = z+b[5];
      quad(1, T3(x0,y1,z0),T3(x0,y1,z1),T3(x1,y1,z1),T3(x1,y1,z0),
           [b[0],0.5],[b[0],0.625],[b[3],0.625],[b[3],0.5], tile, 255, lite);          // top
      quad(1, T3(x0,y0,z0),T3(x1,y0,z0),T3(x1,y0,z1),T3(x0,y0,z1),
           [b[0],0],[b[3],0],[b[3],0.125],[b[0],0.125], tile, 140, lite);          // bottom
      quad(1, T3(x1,y0,z0),T3(x1,y1,z0),T3(x1,y1,z1),T3(x1,y0,z1),
           [1-b[2],b[1]],[1-b[2],b[4]],[1-b[5],b[4]],[1-b[5],b[1]], tile, 178, lite);  // +X
      quad(1, T3(x0,y0,z0),T3(x0,y0,z1),T3(x0,y1,z1),T3(x0,y1,z0),
           [b[2],b[1]],[b[5],b[1]],[b[5],b[4]],[b[2],b[4]], tile, 178, lite);          // -X
      quad(1, T3(x0,y0,z1),T3(x1,y0,z1),T3(x1,y1,z1),T3(x0,y1,z1),
           [b[0],b[1]],[b[3],b[1]],[b[3],b[4]],[b[0],b[4]], tile, 216, lite);          // +Z
      quad(1, T3(x0,y0,z0),T3(x0,y1,z0),T3(x1,y1,z0),T3(x1,y0,z0),
           [1-b[0],b[1]],[1-b[0],b[4]],[1-b[3],b[4]],[1-b[3],b[1]], tile, 216, lite);  // -Z
    }
    function emitCross(x, y, z, blockId, varb) {
      // sulfur tip: variant 1 = flipped/down orientation, swap tile to the down-tip texture
      let tile = PROPS[blockId].faces[0];
      if (blockId === B.SULFUR_UP_TIP && (varb & 1)) tile = T.SULFUR_DOWN_TIP;
      // per-variant billboard texture (berry bush growth stages)
      const tv = PROPS[blockId].tilesByVar;
      if (tv && tv[varb] != null) tile = tv[varb];
      /* sugar cane (0.829): a grown cell in a column draws its bottom, middle or top piece; alone it stays whole.
         A cane above joins once it has stalks, so a fresh sprout on top does not cut the crown off under it. */
      if (blockId === B.SUGAR_CANE && !(varb & 7)) {
        const va = gb(x, y + 1, z);
        const up = (va & 255) === B.SUGAR_CANE && ((va >> 8) & 7) <= CANE_JOIN_LEFT;
        const dn = (gb(x, y - 1, z) & 255) === B.SUGAR_CANE;
        if (up || dn) tile = up && dn ? T.SUGAR_CANE_MIDDLE : up ? T.SUGAR_CANE_BOTTOM : T.SUGAR_CANE_TOP;
      }
      /* Lit by its OWN cell as well as the one above (0.7521). The cell above alone reads as 0
         wherever a plant grows under a ceiling, so a mushroom in a low tunnel took the darkness of
         the rock over it even beside a torch. Per nibble: sky and torchlight each take the brighter. */
      const la = gl(x, y + 1, z), lo = gl(x, y, z);
      const lite = litMax(la, lo);
      const sh = 210;
      quad(1,[x,y,z+1],[x+1,y,z],[x+1,y+1,z],[x,y+1,z+1], [0,0],[1,0],[1,1],[0,1],tile,sh,lite);
      quad(1,[x,y+1,z+1],[x+1,y+1,z],[x+1,y,z],[x,y,z+1], [0,1],[1,1],[1,0],[0,0],tile,sh,lite);
      quad(1,[x+1,y,z+1],[x,y,z],[x,y+1,z],[x+1,y+1,z+1], [0,0],[1,0],[1,1],[0,1],tile,sh,lite);
      quad(1,[x+1,y+1,z+1],[x,y+1,z],[x,y,z],[x+1,y,z+1], [0,1],[1,1],[1,0],[0,0],tile,sh,lite);
    }
    for (let y = 1; y < Math.min(CY - 1, yCap); y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          const bid = val & 255;
          if (!lod && PROPS[bid] && PROPS[bid].model === 'cross') {   // a far chunk draws no plants or torches (0.8092)
            if (PROPS[bid].torch) emitTorch(x, y, z, (val >> 8) & 255, bid);   // a stick, not a billboard (every torch, 0.834)
            else if (PROPS[bid].shroom != null) emitShroom(x, y, z, PROPS[bid].shroom, (val >> 8) & 255);   // a model (0.8091), grown so far (0.821)
            else emitCross(x, y, z, bid, (val >> 8) & 255);
          }
        }

    // ---- non-cube: cactus — full-height column, side faces inset 1/16 (thin look) ----
    // cactus is drawn by the log pass below (model:'log'), so it needs no emitter of its own

    // ---- logs: inset column (like cactus) on the two axes perpendicular to the trunk axis;
    // reuses emitBoxFaces so end-cap faces still cull against opaque/same neighbours ----
    /* A log's box comes straight from its width index. Two joint problems have to be solved on
       top of that, both caused by neighbouring logs having DIFFERENT widths:

       1. A branch butts into the side of a trunk. The branch spans its whole cell along its own
          axis, so it reaches the shared boundary — but the trunk's wood starts inset from that
          boundary, leaving a hole. Fix: the trunk grows the face on that side out to the cell
          edge, but ONLY toward a log whose axis runs INTO it. Expanding toward any log at all
          would also weld two parallel trunks standing side by side into one slab.

       2. A wide cell sits above a narrow one (stump under trunk, or a cut notch). The narrow
          log's end cap must still be drawn or you see straight into the hollow; the wide one's
          cap is what would show through. Fix: cull an end cap only against a same-axis log at
          least as wide as this one. That is also what draws the ring where a trunk steps down. */
    /* `family` separates the two things that use the log model — wood and cactus — so a cactus
       standing beside a trunk never flares into it or culls its cap against it. Undefined means
       wood, so every existing log entry keeps working untouched. */
    const logAt = (nx, ny, nz, fam) => {
      const v = gb(nx, ny, nz);
      const p = P[v & 255];
      if (!p || p.model !== 'log') return null;
      if ((p.family || 'wood') !== fam) return null;
      return { axis: (v >> 8) & 3, w: logWidthOf((v >> 8) & 255) };
    };
    /* A neighbour running INTO this cell along `axis`, thick enough to be worth meeting. A twig
       narrower than LOG_JOIN_MIN just pokes out of the bark — flaring the whole trunk face to
       greet it made the trunk bulge for something a few units across. */
    const LOG_JOIN_MIN = 14;                              // 36 units
    const logInto = (nx, ny, nz, axis, fam) => {
      const n = logAt(nx, ny, nz, fam);
      return !!n && n.axis === axis && n.w >= LOG_JOIN_MIN;
    };
    function emitLog(x, y, z, val) {
      const id = val & 255, variant = (val >> 8) & 255, va = variant & 3;
      const fam = PROPS[id].family || 'wood';
      const pss = PROPS[id].pass;              // wood is opaque(0), cactus is cutout(1)
      const myW = logWidthOf(variant);
      const b = logCutBox(va, myW);
      let flared = false;                                 // did a branch pull a face out to the edge?
      if (va !== 1) {                                     // X faces are inset unless this IS an X log
        if (logInto(x - 1, y, z, 1, fam)) { b[0] = 0; flared = true; }
        if (logInto(x + 1, y, z, 1, fam)) { b[3] = 1; flared = true; }
      }
      if (va !== 0) {                                     // Y faces
        if (logInto(x, y - 1, z, 0, fam)) { b[1] = 0; flared = true; }
        if (logInto(x, y + 1, z, 0, fam)) { b[4] = 1; flared = true; }
      }
      if (va !== 2) {                                     // Z faces
        if (logInto(x, y, z - 1, 2, fam)) { b[2] = 0; flared = true; }
        if (logInto(x, y, z + 1, 2, fam)) { b[5] = 1; flared = true; }
      }
      const F = PROPS[id].faces, side = F[0], top = F[2];
      /* An end cap is culled only against a same-axis log at least as wide as this cell — the
         narrower of two stacked logs must keep its cap or you see into the hollow.

         `flared` overrides that. A cell that pulled a face out to meet a branch is wider than
         the width it has stored, so the neighbour above compares against a stale number, culls,
         and leaves the collar open at the top — the horizontal slit where a branch meets the
         trunk. A flared cell always draws both of its axis caps. */
      const capped = (nx, ny, nz) => {
        const nv = gb(nx, ny, nz);
        if (opaqueVal(nv) || fastLeaf(nv)) return true;   // fast leaves hide a cap too (0.8386)
        if (flared) return false;
        const n = logAt(nx, ny, nz, fam);
        return !!n && n.axis === va && n.w >= myW;        // continuous trunk, no narrower than us
      };
      /* Rounded bark (0.793): each of the four edges that
         run ALONG the log has a square notch LOG_BEVEL of its width deep (2 of 16 pixels on a full log; a diagonal until 0.7931), so
         trunks and branches read round. The texture is untouched: every face keeps the uv mapping
         the box had, and a bevel strip borrows the mapping of the side face next to it. Only the
         mesh changes — collision and the selection box stay the box. Cactus has them too since 0.794. */
      const cut = LOG_BEVEL * logWidthPx(myW) / 64;
      const A = va === 1 ? 0 : va === 2 ? 2 : 1;               // world axis the log runs along
      const Pa = va === 1 ? 1 : 0, Qa = va === 2 ? 1 : 2;      // the two axes across it
      const a0 = b[A], a1 = b[A + 3], p0 = b[Pa], p1 = b[Pa + 3], q0 = b[Qa], q1 = b[Qa + 3];
      const at = (a, p, q) => { const l = [0, 0, 0]; l[A] = a; l[Pa] = p; l[Qa] = q; return l; };
      // per face direction (0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z): shade, the cell it takes light from, uv of a local point
      const SH = [178, 178, 255, 140, 216, 216];
      const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      const UVF = [(l) => [1 - l[2], l[1]], (l) => [l[2], l[1]], (l) => [l[0], l[2]],
                   (l) => [l[0], l[2]], (l) => [l[0], l[1]], (l) => [1 - l[0], l[1]]];
      const lit = (d) => gl(x + NB[d][0], y + NB[d][1], z + NB[d][2]);
      // one quad of local points, wound to face `n` (an outward direction, need not be unit)
      const face = (pts, n, ud, tile, shade, lite) => {
        const [c0, c1, c2] = pts;
        const e = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]], f = [c2[0] - c0[0], c2[1] - c0[1], c2[2] - c0[2]];
        const dot = (e[1] * f[2] - e[2] * f[1]) * n[0] + (e[2] * f[0] - e[0] * f[2]) * n[1] + (e[0] * f[1] - e[1] * f[0]) * n[2];
        if (dot < 0) pts = [pts[0], pts[3], pts[2], pts[1]];
        const w = pts.map(l => [x + l[0], y + l[1], z + l[2]]), u = pts.map(UVF[ud]);
        quad(pss, w[0], w[1], w[2], w[3], u[0], u[1], u[2], u[3], tile, shade, lite);
      };
      const unit = (k, s) => { const n = [0, 0, 0]; n[k] = s; return n; };
      // the two end caps (culled against the trunk they continue), an octagon as a band and two trapezoids
      for (const [s, av] of [[1, a1], [-1, a0]]) {
        const d = 2 * A + (s < 0 ? 1 : 0);
        if (capped(x + NB[d][0], y + NB[d][1], z + NB[d][2])) continue;
        const n = unit(A, s), L = lit(d);
        face([at(av, p0, q0 + cut), at(av, p1, q0 + cut), at(av, p1, q1 - cut), at(av, p0, q1 - cut)], n, d, top, SH[d], L);
        if (cut > 0) {
          face([at(av, p0 + cut, q0), at(av, p1 - cut, q0), at(av, p1 - cut, q0 + cut), at(av, p0 + cut, q0 + cut)], n, d, top, SH[d], L);
          face([at(av, p0 + cut, q1 - cut), at(av, p1 - cut, q1 - cut), at(av, p1 - cut, q1), at(av, p0 + cut, q1)], n, d, top, SH[d], L);
        }
      }
      // the four bark sides, each narrowed by the bevels either side of it
      /* With fast leaves (0.8386) a full-width log's side flush against a solid leaf or an opaque block is left out:
         a trunk inside a fast canopy cannot be seen. Fancy leaves keep every side, as before. */
      const hidden = (d, edge) => {
        if (!FAST_LEAVES || (edge > 0.001 && edge < 0.999)) return false;
        const nv = gb(x + NB[d][0], y + NB[d][1], z + NB[d][2]);
        return opaqueVal(nv) || fastLeaf(nv);
      };
      for (const s of [1, -1]) {
        const dp = 2 * Pa + (s < 0 ? 1 : 0), pe = s > 0 ? p1 : p0;
        if (!hidden(dp, pe))
          face([at(a0, pe, q0 + cut), at(a1, pe, q0 + cut), at(a1, pe, q1 - cut), at(a0, pe, q1 - cut)], unit(Pa, s), dp, side, SH[dp], lit(dp));
        const dq = 2 * Qa + (s < 0 ? 1 : 0), qe = s > 0 ? q1 : q0;
        if (!hidden(dq, qe))
          face([at(a0, p0 + cut, qe), at(a1, p0 + cut, qe), at(a1, p1 - cut, qe), at(a0, p1 - cut, qe)], unit(Qa, s), dq, side, SH[dq], lit(dq));
      }
      // ...and the four corner notches between them: a square step, two small faces each (0.7931, was a diagonal)
      if (cut > 0) for (const sp of [1, -1]) for (const sq of [1, -1]) {
        const dp = 2 * Pa + (sp < 0 ? 1 : 0), dq = 2 * Qa + (sq < 0 ? 1 : 0);
        const pi = (sp > 0 ? p1 : p0) - sp * cut, qi = (sq > 0 ? q1 : q0) - sq * cut;   // the notch's inner corner
        const pe = sp > 0 ? p1 : p0, qe = sq > 0 ? q1 : q0;
        face([at(a0, pi, qi), at(a1, pi, qi), at(a1, pi, qe), at(a0, pi, qe)], unit(Pa, sp), dp, side, SH[dp], litMax(lit(dp), lit(dq)));
        face([at(a0, pi, qi), at(a1, pi, qi), at(a1, pe, qi), at(a0, pe, qi)], unit(Qa, sq), dq, side, SH[dq], litMax(lit(dp), lit(dq)));
      }
    }
    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          if (PROPS[val & 255].model === 'log') emitLog(x, y, z, val);
        }

    // ---- per-block water: level-based top height, no greedy merge ----
    // variant byte = level: 0 = source (full), 1-7 = flowing ((8-level)/8 height); bits 3-6 a river's way, 7 it runs fast
    /* Depth shading (0.835491): a surface darkens smoothly with the still water under it, 0.72 x (1 - e^(-depth/6)) of its
       sky light (about a quarter at 3 deep, half at 7, two thirds by 20), worked out at each CORNER from the cells round it
       so the colour fades across the surface instead of in squares. A falling sheet (water with air beside it) is no
       depth: a waterfall and its lip stay light. Depths are kept per column for this mesh. */
    const WATER_DEPTH_MAX = 20, _wDepth = new Map();
    const _wDark = (d) => 0.72 * (1 - Math.exp(-d / 6));
    const _airLike = (v) => { const id = v & 255; return id !== B.WATER && !(P[id] && P[id].opaque); };
    function _waterDepth(cx2, y, cz2) {
      const k = cx2 + ',' + y + ',' + cz2;
      let d = _wDepth.get(k);
      if (d !== undefined) return d;
      // a column the mesher cannot see (diagonal to a chunk corner, 0.835493) has no surface to count
      if ((cx2 < 0 || cx2 > 15) && (cz2 < 0 || cz2 > 15)) d = -1;
      else if ((gb(cx2, y, cz2) & 255) !== B.WATER || (gb(cx2, y + 1, cz2) & 255) === B.WATER) d = -1;
      else {
        d = 0;
        while (d < WATER_DEPTH_MAX && (gb(cx2, y - 1 - d, cz2) & 255) === B.WATER) {
          const yy = y - 1 - d;
          if (_airLike(gb(cx2 + 1, yy, cz2)) || _airLike(gb(cx2 - 1, yy, cz2)) || _airLike(gb(cx2, yy, cz2 + 1)) || _airLike(gb(cx2, yy, cz2 - 1))) { d = Math.min(d, 1); break; }
          d++;
        }
        // the surface cell itself beside air: a fall's lip, as light as the sheet under it
        if (_airLike(gb(cx2 + 1, y, cz2)) || _airLike(gb(cx2 - 1, y, cz2)) || _airLike(gb(cx2, y, cz2 + 1)) || _airLike(gb(cx2, y, cz2 - 1))) d = Math.min(d, 1);
      }
      _wDepth.set(k, d);
      return d;
    }
    /* A fall's lip (0.835491): a surface corner next to a cell the water would spill into (air over no solid ground, at
       its own height) sinks to LIP_H, so the top rolls down over the edge instead of ending square. Worked out from the
       four cells round the corner, so every surface sharing it agrees. */
    const LIP_H = 0.3;
    /* The mesher sees its neighbours only as the four one-cell strips along its sides (gb), never the cells diagonal to its
       corners: read there, gb returns some other cell. So (0.835493) a cell off both axes counts as unseen, and a corner
       on a chunk's corner never sinks at all - the four chunks sharing it each see a different three of its cells, and
       one sinking it while another did not opened a slit in the water at every chunk corner. */
    const _seen = (cx2, cz2) => !((cx2 < 0 || cx2 > 15) && (cz2 < 0 || cz2 > 15));
    const _spillCell = (cx2, y, cz2) => _seen(cx2, cz2) && _airLike(gb(cx2, y, cz2)) && !(P[gb(cx2, y - 1, cz2) & 255] && P[gb(cx2, y - 1, cz2) & 255].opaque);
    const _lipCorner = (vx, y, vz) => !((vx === 0 || vx === 16) && (vz === 0 || vz === 16)) &&
      (_spillCell(vx - 1, y, vz - 1) || _spillCell(vx, y, vz - 1) || _spillCell(vx - 1, y, vz) || _spillCell(vx, y, vz));
    function quadW(pass, c0, c1, c2, c3, u0, u1, u2, u3, tile, s0, s1, s2, s3, l0, l1, l2, l3, d0 = 0, d1 = 0, d2 = 0, d3 = 0) {
      const g = passes[pass], base = g.v;
      while (g.dark.length < base) g.dark.push(0);
      g.dark.push(d0, d1, d2, d3);
      g.pos.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], c3[0], c3[1], c3[2]);
      g.uv.push(u0[0], u0[1], u1[0], u1[1], u2[0], u2[1], u3[0], u3[1]);
      g.tile.push(tile, tile, tile, tile);
      g.shade.push(s0, s1, s2, s3);
      g.lite.push(l0, l1, l2, l3);
      pushClim(g, tile, c0, c1, c2, c3);
      g.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      g.v += 4;
      const lo = Math.min(c0[1], c1[1], c2[1], c3[1]), hi = Math.max(c0[1], c1[1], c2[1], c3[1]);
      if (lo < minY) minY = lo;
      if (hi > maxY) maxY = hi;
    }
    function emitWater(x, y, z, val) {
      const level = (val >> 8) & 7;
      const frac  = (8 - level) / 9;          // source≈0.889, level7≈0.111
      const x0 = x, x1 = x + 1, y0 = y, z0 = z, z1 = z + 1;
      /* still frames on a calm top, the flow animation on anything running (0.8093). Speeds (0.835491): a river's top
         runs at the flow speed, a steep stretch's (bit 7) and a lip's faster (WATER_FLOW_FAST), and every side face - a
         fall, a step - fastest of all (WATER_FALL). */
      const fdir = (val >> 11) & 15, fastBit = (val >> 15) & 1;
      const tile = T.WATER, flow = T.WATER_FLOW, fall = T.WATER_FALL, topTile = level === 0 ? tile : flow;
      /* Water light needs two corrections that plain neighbour-sampling gets wrong.

         SIDE faces read the light of the cell they face. Against a shore that cell is sand —
         opaque, so its stored light is 0 — which made shallow water at the water's edge read
         almost black, exactly where it should be at its brightest. Taking the brighter of the
         neighbour and the water cell itself fixes it without affecting open water, where the
         neighbour is another water cell and already the brighter of the two.

         TOP faces read the AIR above the surface, which is open sky at 15 no matter how deep
         the water is — so a 40-block ocean lit identically to a puddle. The surface is now
         darkened by how much water sits UNDER it, which is what actually reads as depth. */
      const maxLite = litMax;                 // with the light's colour (0.834)
      const above = gl(x, y + 1, z);
      // scale rather than subtract: at night the sky nibble is already low and a flat -7 would clamp every deep surface to pitch black
      /* 0.835492: the light byte stays one value for the whole face (it is unpacked bit by bit, so blending it between
         corners drew false glow lines); the depth goes in the face's dark per corner instead (04 VSH_WATER) */
      const topLite = () => above;
      // a corner's depth shade 0..255: the mean depth of the surfaces round it (this cell's own if it is the only one)
      const cornerDark = (vx, vz) => {
        let s = 0, n = 0;
        for (const [ax, az] of [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]]) { const d = _waterDepth(ax, y, az); if (d >= 0) { s += d; n++; } }
        return Math.round(_wDark(Math.max(0, n ? s / n : _waterDepth(x, y, z))) * 255);
      };
      /* A surface source uses topLite() for its whole ring — top quad and all four side quads —
         so the depth shading stays continuous around the waterline instead of the top face
         reading dark over deep water while the side faces beside it read bright. Submerged and
         flowing cells keep the neighbour-max value, which is what rescues shore water from the
         opaque sand's zero light. */
      const openTop = (gb(x, y + 1, z) & 255) !== B.WATER;
      const surfLite = (level === 0 && openTop) ? topLite() : null;
      const sideLite = (nx, ny, nz) =>
        surfLite !== null ? surfLite : maxLite(gl(nx, ny, nz), gl(x, y, z));
      // the top's four corners [x0z0, x0z1, x1z1, x1z0]: a lip's sink below the full height (only on an open surface)
      const lip = openTop ? [_lipCorner(x0, y, z0), _lipCorner(x0, y, z1), _lipCorner(x1, y, z1), _lipCorner(x1, y, z0)] : [false, false, false, false];
      const anyLip = lip[0] || lip[1] || lip[2] || lip[3];
      const hc = lip.map(l => openTop ? (l ? LIP_H : frac) : 1);
      if (openTop) {
        // top: shade 255 = a waving corner, 240 = still (flowing water, and a lip's sunk corners)
        const sv = hc.map((h, i) => level === 0 && !lip[i] ? 255 : 240);
        const lt = topLite(), dv = [cornerDark(x0, z0), cornerDark(x0, z1), cornerDark(x1, z1), cornerDark(x1, z0)];
        let uv = [[0, 0], [0, 1], [1, 1], [1, 0]], tt = topTile;
        if (fdir >= 1 && fdir <= 8) {
          /* a river's top (0.83549): variant bits 3-6 hold its way (1-8, an eighth turn each from +x, set by the generator);
             it wears the flowing texture turned so the art runs downstream, as it runs down a fall's face */
          const a = (fdir - 1) * Math.PI / 4, fx = Math.cos(a), fz = Math.sin(a);
          const uvAt = (px, pz) => [0.5 - (px - 0.5) * fz + (pz - 0.5) * fx, 0.5 - ((px - 0.5) * fx + (pz - 0.5) * fz)];
          uv = [uvAt(0, 0), uvAt(0, 1), uvAt(1, 1), uvAt(1, 0)];
          tt = fastBit || anyLip ? T.WATER_FLOW_FAST : flow;
        } else if (anyLip) tt = T.WATER_FLOW_FAST;
        quadW(2, [x0,y+hc[0],z0],[x0,y+hc[1],z1],[x1,y+hc[2],z1],[x1,y+hc[3],z0], uv[0], uv[1], uv[2], uv[3], tt, sv[0], sv[1], sv[2], sv[3], lt, lt, lt, lt, dv[0], dv[1], dv[2], dv[3]);
      }
      // bottom: only if below is not water/opaque
      const belowId = gb(x, y - 1, z) & 255;
      if (belowId !== B.WATER && !(P[belowId] && P[belowId].opaque))
        quad(2, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], [0,0],[1,0],[1,1],[0,1], tile, 140, sideLite(x, y - 1, z));
      /* shade 253 marks "waving surface vertex" → only an open source surface waves; flowing stays static.
         Steps (0.835481): a cell with water over it stands its full height (1, its side faces up to the cell above's,
         not stopping short at 8/9 and leaving a slit), and only an open surface waves its sides' top edge. Where a side
         rises from a lower open surface beside it, its foot waves with that surface (`footS`), so the fall's face stays
         joined to the water it runs into. A side's top follows the corners (a lip's sunk ones, 0.835491). */
      const topS = (i) => level === 0 && openTop && !lip[i] ? 253 : 0;    // 0 = fall through to base shade below
      // how high the water stands in a neighbour cell (1 under more water), and whether its top waves
      const nH = (raw, nx, nz) => (gb(nx, y + 1, nz) & 255) === B.WATER ? 1 : (8 - ((raw >> 8) & 7)) / 9;
      const nWave = (raw, nx, nz) => ((raw >> 8) & 7) === 0 && (gb(nx, y + 1, nz) & 255) !== B.WATER ? 253 : 0;
      /* one side: corners a (bottom-left to top-left) and b in the vertex order the old faces used; ca/cb index hc */
      const side = (nRaw, nx, nz, ca, cb, P0, P1, ua, ub, base) => {
        const nId = nRaw & 255;
        const ha = hc[ca], hb = hc[cb];
        let fa = 0, fb = 0, footS = 0;
        if (nId === B.WATER) {
          const nf = nH(nRaw, nx, nz);
          if (Math.max(ha, hb) <= nf + 0.01) return;
          fa = Math.min(nf, ha); fb = Math.min(nf, hb); footS = nWave(nRaw, nx, nz);
        } else if (P[nId] && P[nId].opaque) return;
        const lt = sideLite(nx, y, nz);
        quadV(2, [P0[0], y + fa, P0[1]], [P0[0], y + ha, P0[1]], [P1[0], y + hb, P1[1]], [P1[0], y + fb, P1[1]],
              [ua, fa], [ua, ha], [ub, hb], [ub, fb], fall, footS || base, topS(ca) || base, topS(cb) || base, footS || base, lt);
      };
      side(gb(x + 1, y, z), x + 1, z, 3, 2, [x1, z0], [x1, z1], 1, 0, 178);   // +X
      side(gb(x - 1, y, z), x - 1, z, 1, 0, [x0, z1], [x0, z0], 1, 0, 178);   // -X
      side(gb(x, y, z + 1), x, z + 1, 2, 1, [x1, z1], [x0, z1], 1, 0, 216);   // +Z
      side(gb(x, y, z - 1), x, z - 1, 0, 3, [x0, z0], [x1, z0], 1, 0, 216);   // -Z
    }
    // ---- per-block lava: same as water (pass 3, opaque, slower waves) ----
    function emitLava(x, y, z, val) {
      const level = (val >> 8) & 7;
      const frac  = (8 - level) / 9;
      const x0 = x, x1 = x + 1, y0 = y, z0 = z, z1 = z + 1;
      // still frames on a calm top, the flow animation on the sides and on anything running (0.8093)
      const tile = T.LAVA, flow = T.LAVA_FLOW, topTile = level === 0 ? tile : flow;
      const lite = 255;   // emissive: always full brightness
      if ((gb(x, y + 1, z) & 255) !== B.LAVA)
        quad(3, [x0,y+frac,z0],[x0,y+frac,z1],[x1,y+frac,z1],[x1,y+frac,z0], [0,0],[0,1],[1,1],[1,0], topTile, level === 0 ? 255 : 240, lite);
      const belowId = gb(x, y - 1, z) & 255;
      if (belowId !== B.LAVA && !(P[belowId] && P[belowId].opaque))
        quad(3, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], [0,0],[1,0],[1,1],[0,1], tile, 140, lite);
      const topS = level === 0 ? 253 : 0;
      const bxpRaw = gb(x + 1, y, z); const bxpId = bxpRaw & 255;
      if (bxpId !== B.LAVA) {
        if (!(P[bxpId] && P[bxpId].opaque))
          quadV(3, [x1,y0,z0],[x1,y+frac,z0],[x1,y+frac,z1],[x1,y0,z1], [1,0],[1,frac],[0,frac],[0,0], flow, 178,topS||178,topS||178,178, lite);
      } else { const nf = (8 - ((bxpRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(3, [x1,y+nf,z0],[x1,y+frac,z0],[x1,y+frac,z1],[x1,y+nf,z1], [1,nf],[1,frac],[0,frac],[0,nf], flow, 178,topS||178,topS||178,178, lite);
      }
      const bxnRaw = gb(x - 1, y, z); const bxnId = bxnRaw & 255;
      if (bxnId !== B.LAVA) {
        if (!(P[bxnId] && P[bxnId].opaque))
          quadV(3, [x0,y0,z0],[x0,y0,z1],[x0,y+frac,z1],[x0,y+frac,z0], [0,0],[1,0],[1,frac],[0,frac], flow, 178,178,topS||178,topS||178, lite);
      } else { const nf = (8 - ((bxnRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(3, [x0,y+nf,z0],[x0,y+nf,z1],[x0,y+frac,z1],[x0,y+frac,z0], [0,nf],[1,nf],[1,frac],[0,frac], flow, 178,178,topS||178,topS||178, lite);
      }
      const bzpRaw = gb(x, y, z + 1); const bzpId = bzpRaw & 255;
      if (bzpId !== B.LAVA) {
        if (!(P[bzpId] && P[bzpId].opaque))
          quadV(3, [x0,y0,z1],[x1,y0,z1],[x1,y+frac,z1],[x0,y+frac,z1], [0,0],[1,0],[1,frac],[0,frac], flow, 216,216,topS||216,topS||216, lite);
      } else { const nf = (8 - ((bzpRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(3, [x0,y+nf,z1],[x1,y+nf,z1],[x1,y+frac,z1],[x0,y+frac,z1], [0,nf],[1,nf],[1,frac],[0,nf], flow, 216,216,topS||216,topS||216, lite);
      }
      const bznRaw = gb(x, y, z - 1); const bznId = bznRaw & 255;
      if (bznId !== B.LAVA) {
        if (!(P[bznId] && P[bznId].opaque))
          quadV(3, [x0,y0,z0],[x0,y+frac,z0],[x1,y+frac,z0],[x1,y0,z0], [1,0],[1,frac],[0,frac],[0,0], flow, 216,topS||216,topS||216,216, lite);
      } else { const nf = (8 - ((bznRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(3, [x0,y+nf,z0],[x0,y+frac,z0],[x1,y+frac,z0],[x1,y+nf,z0], [1,nf],[1,frac],[0,frac],[0,nf], flow, 216,topS||216,topS||216,216, lite);
      }
    }

    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          if ((val & 255) === B.WATER) emitWater(x, y, z, val);
          else if ((val & 255) === B.LAVA) emitLava(x, y, z, val);
        }

    // pack into typed arrays (transferable)
    const out = passes.map(g => g.v === 0 ? null : ({
      pos:   new Float32Array(g.pos),
      uv:    new Float32Array(g.uv),
      tile:  new Uint16Array(g.tile),        // a texture-array layer: past 255 since 0.809
      shade: new Uint8Array(g.shade),
      lite:  new Uint16Array(g.lite),        // bit 8 the light's colour (0.834)
      clim:  new Int8Array(g.clim),          // the climate colour, -127 cold .. 127 warm (0.8231)
      dark:  g.dark.length ? (() => { const a = new Uint8Array(g.v); a.set(g.dark.slice(0, g.v)); return a; })() : null,   // 0.835492
      index: new Uint32Array(g.index),
    }));
    return { passes: out, minY: Math.min(minY, maxY), maxY: Math.max(maxY, 2) };
  }

  return { setTintSampler, setFastLeaves, B, T, V, PROPS, VARIANT_BLOCKS, CLUSTER_DIRS, CLUSTER_BED_SHIFT, SHAPE_SLAB, SHAPE_STAIRS, SHAPE_PANE, SHAPE_FENCE, SHAPE_COVER, SHAPE_WALL,
           SHAPE_MASK, ROT_MASK, shapeOfVal,
           HOLLOW_FILLS, opaqueVal, lightDim, shapeBoxesAt, stairBoxesAt, makeGen, meshChunk, idx,
           logWidthOf, logWidthPx, LOG_W_MIN, LOG_W_MAX, LOG_W_NORMAL, LOG_W_BLOCK,
           SHAPE_LAYER, SHAPE_LAYER_MIX, LAYER_MAX, layerCount, layerMixed, layerVal, solidVal,
           SHAPE_SLAB_MIX, slabMixed, slabMixVal, slabsMix, slabMixBoxes, sideListed, VARIANT_FAMILIES,   // 0.8263
           BERRY_BUSHES, BERRY_STAGES, chimneyHeight, CHIMNEY_MAX,                                          // 0.827
           BERRY_STAGE, berryStage, isBerryBush, CANE_STEPS, ICE_FROM_WATER };                             // cane 0.829; ice 0.833
}

/* ---------- worker entry point (stringified into the blob together with VOXEL_CORE) ---------- */
function WORKER_MAIN() {
  let gen = null;
  /* The cells that may give light (0.8381, MultithreadPlan.md B1): a block with light of its own, light by its variant,
     or the furnace. Found here as a chunk is made, so the main thread's finish pass (finishChunkGen, 11) checks only
     these instead of walking all of the chunk's cells. Same test as EMITTER_ID (08). */
  const EMIT = new Uint8Array(256);
  for (let id = 0; id < 256; id++) { const p = CORE.PROPS[id]; if (p && (p.light > 0 || p.lightByVar)) EMIT[id] = 1; }
  EMIT[CORE.B.FURNACE] = 1;
  const emittersOf = (d) => {
    let n = 0;
    for (let i = 0; i < d.length; i++) if (EMIT[d[i] & 255]) n++;
    const out = new Int32Array(n);
    for (let i = 0, k = 0; i < d.length; i++) if (EMIT[d[i] & 255]) out[k++] = i;
    return out;
  };
  /* A new chunk's own sky light (0.8383, MultithreadPlan.md B3): the same rules as seedSkyForChunk and propagateSky
     (09-light-sky.js) — open sky straight down each column, water taking `water` a block, a shaped block its lightDim,
     then spread sideways and down from the relief between columns — but only inside the chunk. The main thread adds
     what comes across its borders (seedSkyFromWorker). `L` = { top, sky, water } from init (WORLD_TOP, SKY_LEVEL,
     WATER_ABSORB), so the two sides never disagree. */
  let L = null;
  const skyOf = (d) => {
    const top = L.top, WAT = CORE.B.WATER, sky = new Uint8Array(d.length), tops = new Int16Array(256);
    for (let col = 0; col < 256; col++) {
      let t = -1;
      for (let y = top; y >= 0; y--) if (CORE.opaqueVal(d[col + (y << 8)])) { t = y; break; }
      tops[col] = t;
      let lv = L.sky;
      for (let y = top; y >= t + 1; y--) {
        const i = col + (y << 8);
        sky[i] = lv;
        lv = (d[i] & 255) === WAT ? Math.max(0, lv - L.water) : Math.max(0, lv - CORE.lightDim(d[i]));
      }
    }
    const q = [];
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        const t = tops[lx + lz * 16];
        let hi = t;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = lx + dx, nz = lz + dz;
          if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16) hi = Math.max(hi, tops[nx + nz * 16]);
        }
        for (let y = t + 1, yMax = Math.min(top, hi); y <= yMax; y++) {
          const ci = lx + (lz << 4) + (y << 8), v = sky[ci] - CORE.lightDim(d[ci]);
          if (v > 1) q.push(lx, y, lz, v);
        }
      }
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let h = 0; h < q.length;) {
      const x = q[h++], y = q[h++], z = q[h++], lv = q[h++];
      if (lv <= 1) continue;
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || ny < 0 || ny > top) continue;
        const i = nx + (nz << 4) + (ny << 8), v = d[i];
        if (CORE.opaqueVal(v)) continue;
        const nl = lv - ((v & 255) === WAT ? L.water : 1);
        if (nl <= 0 || sky[i] >= nl) continue;
        sky[i] = nl;
        q.push(nx, ny, nz, nl - CORE.lightDim(v));
      }
    }
    return sky;
  };
  /* ---- a mesh job's light (0.8386, MultithreadPlan C10) ----
     The main thread used to pack every cell's light into the mesher's 16 bits before posting. Now the job brings the
     raw arrays (its own, and either the four neighbours' whole arrays in shared memory or their border planes) and this
     packs them: block light (0..31, capped 15) low nibble with its cold bit moved to 8, sky light the high nibble; a
     chunk with no sky array yet reads as open sky, one with no block light as dark. `PK` from init (LIGHT_LEVEL_MASK,
     LIGHT_COLD_BIT, SKY_LEVEL), so the two sides never disagree. */
  let PK = { mask: 31, cold: 0x80, sky: 15 };
  const edgeOf = (d, side, Ctor) => {        // a neighbour's plane against this chunk, as edgeSlice (11) cuts it
    const cy = d.length >> 8, s = new Ctor(16 * cy);
    for (let y = 0; y < cy; y++) {
      const yo = y << 8, so = y << 4;
      for (let i = 0; i < 16; i++) {
        if (side === 0) s[i + so] = d[15 + (i << 4) + yo];        // west: its x = 15
        else if (side === 1) s[i + so] = d[(i << 4) + yo];        // east: x = 0
        else if (side === 2) s[i + so] = d[i + (15 << 4) + yo];   // north: z = 15
        else s[i + so] = d[i + yo];                               // south: z = 0
      }
    }
    return s;
  };
  const packLight = (glow, sky, n) => {
    const out = new Uint16Array(n), M = PK.mask, C = PK.cold, S = PK.sky << 4;
    for (let i = 0; i < n; i++) {
      const g = glow ? glow[i] : 0;
      out[i] = (g ? Math.min(15, g & M) | ((g & C) << 1) : 0) | (sky ? sky[i] << 4 : S);
    }
    return out;
  };
  const meshJob = (m) => {
    const S = m.self, N = m.nb, n = S.data.length;
    // shared: a still copy of the cells (the main thread may edit on while this meshes); else the copy that came
    const data = m.shared ? S.data.slice() : S.data;
    const light = packLight(S.light, S.sky, n);
    const sx = [], lx = [];
    for (let k = 0; k < 4; k++) {
      const nb = N[k];
      if (m.shared) {
        sx[k] = edgeOf(nb.data, k, Uint32Array);
        lx[k] = packLight(nb.light ? edgeOf(nb.light, k, Uint8Array) : null, nb.sky ? edgeOf(nb.sky, k, Uint8Array) : null, sx[k].length);
      } else {
        sx[k] = nb.data;
        lx[k] = packLight(nb.light, nb.sky, nb.data.length);
      }
    }
    return CORE.meshChunk(data.buffer, sx[0].buffer, sx[1].buffer, sx[2].buffer, sx[3].buffer,
                          light.buffer, lx[0].buffer, lx[1].buffer, lx[2].buffer, lx[3].buffer, m.layers, m.lod | 0,
                          m.cx * 16, m.cz * 16);   // lod 0.8092; world origin for per-place sizes (0.819)
  };

  /* ---- the light thread (0.8386, MultithreadPlan C9, LIGHT_THREAD with shared memory) ----
     One worker of the pool's kind is started as the light thread (08 lightThreadStart). The main thread registers each
     loaded chunk's cells (`lreg`, shared) and forgets it on unload; the floods it used to run itself come here as jobs,
     in order: `lbox` clears a box and floods its sources into it (an edit, a held light moving), `ladd` only floods
     (a chunk arriving near lights). Same rules as propagateLightMany (08): bucketed by level, brightest first, a cell lit
     only at its highest level, opaque cells stop it, shaped cells pass on less (lightDim), the cold bit rides along.
     A box is worked out in a scratch array and written back at the end, so a mesh read meanwhile never sees it cleared.
     A chunk with no block light array gets one here (in shared memory) the first time light is written into it; it goes
     back with the answer, which also lists the chunks whose light changed. */
  const LREG = new Map();                    // "cx,cz" -> { data, light, lid }
  let LTOP = 249;
  const LDX = [1, -1, 0, 0, 0, 0], LDY = [0, 0, 1, -1, 0, 0], LDZ = [0, 0, 0, 0, 1, -1];
  const lightFlood = (srcs, box, scratch, made, touched) => {
    const M = PK.mask, Bk = [];
    let top = 0;
    for (const s of srcs) {
      const lv = s[3] + 1;
      (Bk[lv] || (Bk[lv] = [])).push(s[0], s[1], s[2], s[4] || 0);
      if (lv > top) top = lv;
    }
    const W = box ? box.x1 - box.x0 + 1 : 0, WD = box ? W * (box.z1 - box.z0 + 1) : 0;
    let ccx = 1e9, ccz = 1e9, ent = null;
    for (let lv = top; lv >= 2; lv--) {
      const q = Bk[lv];
      if (!q) continue;
      const nl = lv - 1;
      for (let h = 0; h < q.length; h += 4) {
        const x = q[h], y = q[h + 1], z = q[h + 2], cb = q[h + 3];
        for (let d = 0; d < 6; d++) {
          const nx = x + LDX[d], ny = y + LDY[d], nz = z + LDZ[d];
          if (ny < 0 || ny > LTOP) continue;
          const kx = Math.floor(nx / 16), kz = Math.floor(nz / 16);
          if (kx !== ccx || kz !== ccz) { ccx = kx; ccz = kz; ent = LREG.get(kx + ',' + kz) || null; }
          if (!ent) continue;                // not loaded: lit when it arrives
          const i = (nx & 15) + ((nz & 15) << 4) + (ny << 8), v = ent.data[i];
          if (CORE.opaqueVal(v)) continue;
          const inBox = box && nx >= box.x0 && nx <= box.x1 && ny >= box.y0 && ny <= box.y1 && nz >= box.z0 && nz <= box.z1;
          const si = inBox ? (nx - box.x0) + (nz - box.z0) * W + (ny - box.y0) * WD : -1;
          const cur = inBox ? scratch[si] : ent.light ? ent.light[i] : 0;
          if ((cur & M) >= nl) continue;
          if (inBox) scratch[si] = nl | cb;
          else {
            if (!ent.light) { ent.light = new Uint8Array(new SharedArrayBuffer(ent.data.length)); made.push(ent); }
            ent.light[i] = nl | cb;
            touched.add(ccx + ',' + ccz);
          }
          const out = nl - CORE.lightDim(v);
          if (out >= 2) (Bk[out] || (Bk[out] = [])).push(nx, ny, nz, cb);
        }
      }
      Bk[lv] = null;
    }
  };
  // a worked-out box back into the chunks' light (only chunks that have light, or now get some)
  const lightBoxBack = (box, scratch, made, touched) => {
    const W = box.x1 - box.x0 + 1, WD = W * (box.z1 - box.z0 + 1);
    for (let cz = Math.floor(box.z0 / 16); cz <= Math.floor(box.z1 / 16); cz++)
      for (let cx = Math.floor(box.x0 / 16); cx <= Math.floor(box.x1 / 16); cx++) {
        const ent = LREG.get(cx + ',' + cz);
        if (!ent) continue;
        const lx0 = Math.max(0, box.x0 - cx * 16), lx1 = Math.min(15, box.x1 - cx * 16);
        const lz0 = Math.max(0, box.z0 - cz * 16), lz1 = Math.min(15, box.z1 - cz * 16);
        const len = lx1 - lx0 + 1, sx0 = cx * 16 + lx0 - box.x0;
        if (!ent.light) {                    // dark before: only worth an array if light lands in it now
          let any = false;
          for (let y = box.y0; y <= box.y1 && !any; y++)
            for (let lz = lz0; lz <= lz1 && !any; lz++) {
              const si = sx0 + (cz * 16 + lz - box.z0) * W + (y - box.y0) * WD;
              for (let k = 0; k < len; k++) if (scratch[si + k]) { any = true; break; }
            }
          if (!any) continue;
          ent.light = new Uint8Array(new SharedArrayBuffer(ent.data.length));
          made.push(ent);
        }
        const L = ent.light;
        for (let y = box.y0; y <= box.y1; y++)
          for (let lz = lz0; lz <= lz1; lz++) {
            const si = sx0 + (cz * 16 + lz - box.z0) * W + (y - box.y0) * WD;
            L.set(scratch.subarray(si, si + len), lx0 + (lz << 4) + (y << 8));
          }
        touched.add(cx + ',' + cz);
      }
  };
  const lightJob = (m) => {
    const made = [], touched = new Set();
    if (m.type === 'lbox') {
      const b = m.box, scratch = new Uint8Array((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1));
      lightFlood(m.srcs, b, scratch, made, touched);
      lightBoxBack(b, scratch, made, touched);
    } else lightFlood(m.srcs, null, null, made, touched);
    self.postMessage({ type: 'lit', id: m.id, touched: [...touched],
                       made: made.map((e) => ({ key: e.key, lid: e.lid, light: e.light })) });
  };

  // a made (or cached) chunk back to the main thread with its light emitters and, with the light settings, its own sky
  const sendChunk = (cx, cz, buf, fromSave) => {
    const d = new Uint32Array(buf), emit = emittersOf(d), sky = L ? skyOf(d) : null;
    const msg = { type: 'gen', cx, cz, data: buf, emit: emit.buffer, _fromSave: !!fromSave }, tr = [buf, emit.buffer];
    if (sky) { msg.sky = sky.buffer; tr.push(sky.buffer); }
    self.postMessage(msg, tr);
  };
  self.onmessage = (e) => {
    const m = e.data;
    try {
      if (m.type === 'init') {
        gen = CORE.makeGen(m.seed, m.terrainType, m.biomeRev | 0 || 1);   // biome sizes by world (0.819)
        CORE.setTintSampler(gen.climAt);                                   // the grass and water climate colour (0.8231)
        L = m.light || null;                                               // 0.8383
        if (m.pack) PK = m.pack;                                           // how light packs for the mesher (0.8386)
      } else if (m.type === 'opts') {
        CORE.setFastLeaves(!!m.fastLeaves);                                // Options > Video (0.8386)
      } else if (m.type === 'lreg') {                                      // the light thread (0.8386)
        const k = m.cx + ',' + m.cz;
        LREG.set(k, { key: k, lid: m.lid, data: m.data, light: m.light || null });
      } else if (m.type === 'lforget') {
        LREG.delete(m.cx + ',' + m.cz);
      } else if (m.type === 'lreset') {
        LREG.clear();
        if (m.top) LTOP = m.top;
        if (m.pack) PK = m.pack;
      } else if (m.type === 'lbox' || m.type === 'ladd') {
        lightJob(m);
      } else if (m.type === 'probe') {
        // a few places' biome and ground (0.8393, the snow castle's sites, 60-bosses.js): milliseconds each, so not on the game's thread
        const names = [], heights = [];
        for (const [x, z] of m.pts) { names.push(gen.biomeAt(x, z)); heights.push(gen.heightAt(x, z)); }
        self.postMessage({ type: 'probe', id: m.id, names, heights });
      } else if (m.type === 'gen') {
        sendChunk(m.cx, m.cz, gen.genChunk(m.cx, m.cz), false);
      } else if (m.type === 'prep') {
        sendChunk(m.cx, m.cz, m.data, true);                               // a chunk from the terrain cache (0.8383)
      } else if (m.type === 'scan') {
        // a chunk's season pass (0.8382, MultithreadPlan.md B2): the cells whose id is wanted, as indices
        const d = new Uint32Array(m.data), want = m.want;
        let n = 0;
        for (let i = 0; i < d.length; i++) if (want[d[i] & 255]) n++;
        const out = new Int32Array(n);
        for (let i = 0, k = 0; i < d.length; i++) if (want[d[i] & 255]) out[k++] = i;
        self.postMessage({ type: 'scan', cx: m.cx, cz: m.cz, cand: out.buffer }, [out.buffer]);
      } else if (m.type === 'mesh') {
        const r = meshJob(m);                                              // packs its own light (0.8386)
        const transfers = [];
        for (const p of r.passes) if (p) { transfers.push(p.pos.buffer, p.uv.buffer, p.tile.buffer, p.shade.buffer, p.lite.buffer, p.clim.buffer, p.index.buffer); if (p.dark) transfers.push(p.dark.buffer); }
        self.postMessage({ type: 'mesh', cx: m.cx, cz: m.cz, rev: m.rev, passes: r.passes, minY: r.minY, maxY: r.maxY }, transfers);
      }
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.stack || err) });
    }
  };
}

const CORE = VOXEL_CORE();
const { B, V, PROPS, SHAPE_SLAB, SHAPE_STAIRS, SHAPE_PANE, SHAPE_FENCE, SHAPE_COVER, SHAPE_WALL,
        SHAPE_MASK, ROT_MASK, HOLLOW_FILLS, logWidthOf, LOG_W_MIN, LOG_W_NORMAL } = CORE;
/* Slabs and stairs had ids of their own until 0.783 ([base, stairs?] per old id, 37 was the retired cactus
   slab). Saved edits, inventories and prefabs holding one are converted here into the shape variant of
   the full block. A double slab becomes the full block; a mixed double keeps its own half. */
const LEGACY_SHAPE = {
  12: [B.PLANKS, 0], 28: [B.PLANKS, 1], 29: [B.COBBLE, 0], 31: [B.BRICKS, 0], 32: [B.BRICKS, 1],
  35: [B.STONE_BRICK, 0], 36: [B.STONE, 0], 37: [0, 0], 38: [B.GLASS, 0],
  113: [B.STONE, 1], 114: [B.COBBLE, 1], 115: [B.BIRCH_PLANKS, 0], 116: [B.BIRCH_PLANKS, 1],
  117: [B.SPRUCE_PLANKS, 0], 118: [B.SPRUCE_PLANKS, 1], 119: [B.STONE_BRICK, 1], 120: [B.GLASS, 1],
  121: [B.SANDSTONE, 0], 122: [B.SANDSTONE, 1], 123: [B.RED_SANDSTONE, 0], 124: [B.RED_SANDSTONE, 1],
};
function migrateLegacyVal(v) {
  const m = typeof v === 'number' ? LEGACY_SHAPE[v & 255] : null;
  if (!m) return v;
  if (!m[0]) return 0;
  const va = (v >> 8) & 255;
  if (m[1]) return m[0] | ((SHAPE_STAIRS + (va & 7)) << 8);
  if (va < 6) return m[0] | ((SHAPE_SLAB + va) << 8);
  if (va < 16) return m[0];
  return m[0] | ((SHAPE_SLAB + ((va - 16) & 7)) << 8);
}
/* Carpets were blocks of their own until 0.785: 81 the mixed stack (3 bits a layer: 1 snow, 2 oak, 3 birch,
   4 spruce litter), 58/71/72/77 the older single ones (variant = layers - 1). Now they are layer stacks of
   the real block. Returns null for anything else, or [value, ids] — ids only for a stack that mixes. */
const _LEGACY_LAYER_MAT = [0, B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES];
const _LEGACY_LAYER_ID = { 58: B.SNOW, 71: B.LEAVES, 72: B.BIRCH_LEAVES, 77: B.SPRUCE_LEAVES };
function migrateLegacyLayers(v) {
  if (typeof v !== 'number') return null;
  const id = v & 255;
  if (_LEGACY_LAYER_ID[id]) return [CORE.layerVal(_LEGACY_LAYER_ID[id], ((v >> 8) & 255) + 1), null];
  if (id !== 81) return null;
  const ids = [];
  for (let i = 0; i < 8; i++) { const m = (v >>> (8 + i * 3)) & 7; if (!m) break; ids.push(_LEGACY_LAYER_MAT[m] || B.SNOW); }
  if (!ids.length) return [0, null];
  const mixed = ids.some(b => b !== ids[0]);
  return [CORE.layerVal(ids[ids.length - 1], ids.length, mixed), mixed ? ids : null];
}
// an old slab or stairs item in a slot: the full block it was made from (null for the cactus slab)
// ...and since 0.794 a stone brick item is plain stone: brick is a variant you pick (46-variants.js), not an item
const legacyItemId = (id) => {
  if (typeof id === 'number' && id < 256 && LEGACY_SHAPE[id]) id = LEGACY_SHAPE[id][0] || null;
  return id === B.STONE_BRICK ? B.STONE : id;
};
const { SHAPE_LAYER, LAYER_MAX, BERRY_STAGE, berryStage, isBerryBush, BERRY_BUSHES, BERRY_STAGES, CANE_STEPS, ICE_FROM_WATER } = CORE;

// Items (IDs >= 256): ITEM and ITEM_PROPS live in 59-items.js since 0.8377, loaded right after this file
/* A pumpkin is food now, not masonry (0.7992): it goes off in four hours and cannot be planted back into
   the ground in survival. One that grew in the world is still a block, and creative still places them. */
PROPS[B.PUMPKIN].spoil = 14400;
PROPS[B.PUMPKIN].noPlace = true;
// flowers cannot be planted in survival either (0.826): picked, they come apart into fiber (FLOWER_BLOCKS, 50-loottable.js)
for (const id of [B.POPPY, B.ORCHID, B.PINCUSHION]) PROPS[id].noPlace = true;

// blocks that only DROP when broken with the right tool type at (or above) a tier.
// Not listed = always drops. Block still breaks either way, just yields nothing.
const MINE_REQ = {
  [B.STONE]:       { tool: 'pick', tier: 2 },
  [B.COBBLE]:      { tool: 'pick', tier: 1 },
  [B.STONE_BRICK]: { tool: 'pick', tier: 2 },
  [B.BRICKS]:      { tool: 'pick', tier: 1 },
  [B.FURNACE]:     { tool: 'pick', tier: 1 },
  [B.COAL_ORE]:    { tool: 'pick', tier: 2 },     // stone pickaxe and up, like stone itself (0.829)
  [B.COPPER_ORE]:  { tool: 'pick', tier: 2 },     // 0.829
  [B.IRON_ORE]:    { tool: 'pick', tier: 2 },
  [B.TIN_ORE]:     { tool: 'pick', tier: 2 },
  [B.GOLD_ORE]:    { tool: 'pick', tier: 3 },
  // diamond and every gem need a bronze pickaxe (tier 4) or better since 0.774
  [B.DIAMOND_ORE]: { tool: 'pick', tier: 4 },
  [B.EMERALD_ORE]: { tool: 'pick', tier: 4 },
  [B.RUBY_ORE]:    { tool: 'pick', tier: 4 },
  [B.SAPPHIRE_ORE]:{ tool: 'pick', tier: 4 },
  [B.COBWEB]:      { tool: 'sword', tier: 0 },      // any sword cuts the string out; anything else just tears it
  [B.OBSIDIAN]: { tool: 'pick', tier: 5 },          // still diamond only now that bronze is tier 4 (0.774)
  [B.SNOW]:        { tool: 'shovel', tier: 1 },
  [B.SULFUR_BLOCK]:    { tool: 'pick', tier: 2 },
  [B.SULFUR_DOWN_TIP]: { tool: 'pick', tier: 2 },
  [B.SULFUR_UP_TIP]:   { tool: 'pick', tier: 2 },
  [B.MARBLE]:      { tool: 'pick', tier: 2 },
  [B.GRANITE]:     { tool: 'pick', tier: 2 },
  [B.LIMESTONE]:   { tool: 'pick', tier: 2 },
  [B.DOLOMITE]:    { tool: 'pick', tier: 2 },      // 0.809
  // glow vine: any tool at all harvests its crystals; a bare hand just tears it down (0.765)
  [B.GLOW_VINE]:   { tool: 'any', tier: 0 },
};
// storage blocks (0.768): any pickaxe takes one back up; also on the pickaxe's list and in creative
const STORAGE_BLOCK_IDS = [B.COAL_BLOCK, B.CHARCOAL_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.TIN_BLOCK, B.COPPER_BLOCK,
  B.DIAMOND_BLOCK, B.EMERALD_BLOCK, B.RUBY_BLOCK, B.SAPPHIRE_BLOCK,
  B.RAW_IRON_BLOCK, B.RAW_GOLD_BLOCK, B.RAW_TIN_BLOCK, B.RAW_COPPER_BLOCK, B.TOPAZ_BLOCK];
for (const id of STORAGE_BLOCK_IDS) MINE_REQ[id] = { tool: 'pick', tier: 1 };
// 0.769: topaz ore needs iron like the other gems; sandstone any pickaxe
MINE_REQ[B.TOPAZ_ORE] = { tool: 'pick', tier: 4 };   // bronze, like the other gems (0.774)
MINE_REQ[B.SANDSTONE] = MINE_REQ[B.RED_SANDSTONE] = MINE_REQ[B.PINK_SANDSTONE] = { tool: 'pick', tier: 1 };   // pink 0.822
MINE_REQ[B.ADOBE] = { tool: 'pick', tier: 1 };   // a flint pickaxe keeps it (0.8097)   // 0.8096: flint keeps crafted blocks, not natural rock
/* 0.8095: stone, cobblestone, the rocks, sandstone, terracotta and the furnace keep nothing for a flint pickaxe —
   it still breaks them, but only stone (tier 2) and up brings them home. Stone pebbles are the way round it. */
// does the held item satisfy the block's drop requirement? (hand = tier 0, no tool type)
function mineDropAllowed(heldId, blockId) {
  const req = MINE_REQ[blockId];
  if (!req) return true;
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  return !!(p && p.tool && (req.tool === 'any' || p.tool === req.tool) && (p.tier || 0) >= req.tier);
}

// which blocks each tool class speeds up (material families, incl. their slab/stair forms)
const TOOL_BLOCKS = {
  shovel: new Set([B.SAND, B.RED_SAND, B.PINK_SAND, B.DIRT, B.GRASS, B.SNOW, B.CLAY, B.GRAVEL, B.SALT_CRUST, B.ASH, B.GLASSY_SAND, B.GLASSY_RED_SAND, B.GLASSY_PINK_SAND]),   // glassy 0.824, red and pink 0.8241   // ash 0.8191   // salt crust 0.8091
  pick:   new Set([B.STONE, B.COBBLE, B.COAL_ORE, B.IRON_ORE, B.DIAMOND_ORE, B.BRICKS, B.STONE_BRICK, B.ICE, B.BONE_BLOCK, B.PACKED_ICE,   // ice 0.8321; bone 0.833; packed 0.835
                   B.FURNACE, B.GRASS,
                   B.MARBLE, B.GRANITE, B.LIMESTONE, B.DOLOMITE, B.ADOBE, B.GLASS,   // adobe 0.8091
                   B.SULFUR_BLOCK, B.SULFUR_DOWN_TIP, B.SULFUR_UP_TIP, B.TIN_ORE, B.COPPER_ORE, B.GOLD_ORE,
                   B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, ...STORAGE_BLOCK_IDS,
                   B.TOPAZ_ORE, B.SANDSTONE, B.RED_SANDSTONE, B.PINK_SANDSTONE]),   // pink 0.822
  hatchet: new Set([B.LOG, B.PLANKS, B.BIRCH_LOG, B.BIRCH_PLANKS, B.STRIPPED_LOG, B.STRIPPED_BIRCH_LOG, B.SPRUCE_LOG, B.STRIPPED_SPRUCE_LOG, B.SPRUCE_PLANKS,
                    B.RIME_LOG, B.STRIPPED_RIME_LOG, B.RIME_PLANKS,   // 0.836
                    B.MELON, B.PUMPKIN, B.CANTALOUPE, B.CRAFTING_BENCH, B.DOOR, B.CACTUS, B.CHEST, B.BED,
                    B.CARVED_PUMPKIN, B.JACK_O_LANTERN]),   // chest and bed 0.7992, cantaloupe 0.8091, carved 0.824
  hoe:    new Set([B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.HAY]),
  // shears are the wool tool; they also snip plant matter cleanly
  shears: new Set([B.WOOL, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.TALLGRASS, B.TALL_LOWER, B.TALL_UPPER,
                   B.POPPY, B.ORCHID, B.SUGAR_CANE]),
  // a blade cuts soft, fibrous things fast — plants, leaves, melons, cane and webbing-like props
  sword:  new Set([B.COBWEB, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.HAY, B.MELON, B.PUMPKIN, B.CANTALOUPE, B.SUGAR_CANE,
                   B.BLACK_MUSHROOM, B.WHITE_TALL_MUSHROOM, B.LAVA_MUSHROOM, B.YELLOW_MUSHROOM,     // 0.8091, yellow 0.821
                   B.TALLGRASS, B.TALL_LOWER, B.TALL_UPPER, B.POPPY, B.ORCHID,
                   B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING, B.PINCUSHION, B.RED_MUSHROOM, B.BROWN_MUSHROOM, B.BLUE_MUSHROOM, B.CACTUS]),
};
// variant blocks (0.7941) mine exactly like the block each plays like: same tool, same drop gate
for (const [id, like] of CORE.VARIANT_BLOCKS) {
  if (MINE_REQ[like]) MINE_REQ[id] = MINE_REQ[like];
  for (const k in TOOL_BLOCKS) if (TOOL_BLOCKS[k].has(like)) TOOL_BLOCKS[k].add(id);
}
/* A flint pickaxe on stone or a rock (0.8291) keeps no block, but knocks out a stone pebble, and a second one 25% of
   the time. Not cobblestone: flint keeps that whole. A rock's variants (bricks, polished...) count as the rock. */
const FLINT_PEBBLE_ROCKS = new Set([B.STONE, B.STONE_BRICK, B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE]);
for (const [id, like] of CORE.VARIANT_BLOCKS) if (FLINT_PEBBLE_ROCKS.has(like)) FLINT_PEBBLE_ROCKS.add(id);
function flintPebbles(heldId, blockId) {
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  if (!p || p.tool !== 'pick' || (p.tier || 0) !== 1 || !FLINT_PEBBLE_ROCKS.has(blockId)) return 0;
  return 1 + (Math.random() < 0.25 ? 1 : 0);
}
/* Hollow logs (0.7842): cut with a hatchet like any log. HOLLOW_FILL_OF is what can be packed into one
   (block id -> fill index in its variant); an UPRIGHT one full of dirt or grass takes what grass takes, and
   one full of sand takes a cactus. */
for (const id of [B.HOLLOW_LOG, B.HOLLOW_BIRCH_LOG, B.HOLLOW_SPRUCE_LOG, B.HOLLOW_RIME_LOG]) TOOL_BLOCKS.hatchet.add(id);
const HOLLOW_FILL_OF = {};
HOLLOW_FILLS.forEach((id, i) => { if (id) HOLLOW_FILL_OF[id] = i; });
const isHollowLog = (v) => PROPS[v & 255]?.model === 'hollow';
const hollowFillOf = (v) => (isHollowLog(v) ? HOLLOW_FILLS[(v >> 10) & 7] || 0 : 0);
const potSoil = (v) => { const f = hollowFillOf(v); return ((v >> 8) & 3) === 0 && (f === B.DIRT || f === B.GRASS); };
const potSand = (v) => { const f = hollowFillOf(v); return ((v >> 8) & 3) === 0 && (f === B.SAND || f === B.RED_SAND); };
// mining-time divisor for held item vs block: 1.5 when the right tool, 1 otherwise
function toolFactor(heldId, blockId) {
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  return (p && p.tool && TOOL_BLOCKS[p.tool] && TOOL_BLOCKS[p.tool].has(blockId)) ? p.toolSpeed : 1;
}
/* Billboards cost a tool NOTHING (0.7345): a torch, a flower, a sapling, a mushroom. You brush
   them aside — no edge touches anything, so no edge dulls. */
const isFreeBreak = (id) => { const p = PROPS[id & 255]; return !!(p && p.model === 'cross'); };
// ...and the ground layers — leaf litter, snow, any layer stack — are swept, not dug. They still cost the
// ordinary point of wear, they just never count as the WRONG tool for the job. Takes a VALUE (0.785).
const isLayerBlock = (v) => {
  const p = PROPS[v & 255];
  return !!(p && (p.model === 'carpet' || CORE.layerCount(v)));
};

/* Using the WRONG tool on a block (0.7344) — a pickaxe on dirt. Costs double wear and pays no
   experience, so a tool is something you pick for the job rather than one blunt instrument.

   True only when some tool class actually CLAIMS the block and what you are holding is not one of
   them. Two cases deliberately excluded: bare hands (nothing to blunt, and hands are not a wrong
   choice), and blocks no class claims at all — glass, wool, a torch have no right tool, so there
   is nothing to get wrong about them. */
function isWrongTool(heldId, blockId) {
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  if (!p || !p.tool) return false;
  const id = blockId & 255;
  // 0.7345: a billboard or a ground layer is a brush-aside, not a dig — nothing to do wrong
  if (isFreeBreak(id) || isLayerBlock(blockId)) return false;
  let claimed = false;
  for (const cls in TOOL_BLOCKS) {
    if (!TOOL_BLOCKS[cls].has(id)) continue;
    if (cls === p.tool) return false;               // the held tool is one of this block's own
    claimed = true;
  }
  return claimed;
}
/* Bare hands break FOLIAGE and nothing else (0.7341). Carpets, billboards and leaves come away by
   hand; every solid block needs a tool in hand before the crack even starts. That is what makes
   the flint tier a real gate rather than a convenience — and it is why the flint recipes cost no
   wood, since a log is on the far side of this rule. */
const LEAF_BLOCKS = new Set([B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES]);   // rime 0.836
/* Loose blocks (0.786): they fall, land as a pile of 8 walk-through layers (pouring into a pile below), and
   a layer of one breaks away to nothing. */
const LOOSE_LAYER_BLOCKS = new Set([B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL, B.FIBER_BLOCK,   // not ash: a whole ash block stands, its layers fall (0.8193)
                                    B.SNOW,     // a whole snow block falls too, and lands as a drift (0.8244)
                                    B.ASH]);    // ...and a whole ash block, landing as a pile of 8 layers (0.8262)
/* By hand, slowly (0.8244): the loose ground and glass. Twice what a flint tool of the block's own kind takes
   (handMineFactor); sand, gravel and snow come away a layer at a time (DIG_BY_LAYER, 22-main-loop.js), glass whole. */
const DIG_BY_LAYER = new Set([B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL, B.SNOW]);
const HAND_SLOW_BLOCKS = new Set([...DIG_BY_LAYER, B.GLASS, B.GLASSY_SAND, B.GLASSY_RED_SAND, B.GLASSY_PINK_SAND]);
// the bare hand's speed on such a block: half of the flint tool that claims it (a flint pickaxe for glass, no class)
function handMineFactor(id) {
  const FLINT = { shovel: ITEM.FLINT_SHOVEL, pick: ITEM.FLINT_PICKAXE, hatchet: ITEM.FLINT_HATCHET };
  for (const cls in TOOL_BLOCKS) if (TOOL_BLOCKS[cls].has(id & 255) && FLINT[cls]) return (ITEM_PROPS[FLINT[cls]].toolSpeed || 1) / 2;
  return (ITEM_PROPS[ITEM.FLINT_PICKAXE].toolSpeed || 1) / 2;
}
/* FURNITURE comes apart by hand too (0.7442). A bench, a chest, a bed and a hay bale are things
   you built or stacked, not ground you dig — needing an axe to move your own bed was a chore, and
   the flint gate is about the WORLD, not your furniture. They also pay no XP (see XP_BLOCK in
   35-leveling.js), so hand-breaking them is housekeeping and never a grind. */
const HAND_BREAK_BLOCKS = new Set([B.CRAFTING_BENCH, B.CHEST, B.BED, B.HAY, B.FIBER_BLOCK, B.LADDER,   // + fiber block, ladder (0.769)
                                   B.MORTAR]);                                                         // + mortar (0.77)
// takes a VALUE since 0.785: a stack of snow, leaves or sand comes away by hand, a stone layer does not
function handBreakable(id) {
  const p = PROPS[id & 255];
  if (!p) return false;
  return p.model === 'cross' || p.model === 'carpet' || (p.layerStack && CORE.layerCount(id) > 0) || p.model === 'wall'
      || LEAF_BLOCKS.has(id & 255) || HAND_BREAK_BLOCKS.has(id & 255) || HAND_SLOW_BLOCKS.has(id & 255);   // slow ones 0.8244
}
// does what is in hand count as a tool at all? (any tool class — pick, shovel, hatchet, hoe, ...)
const isToolItem = (id) => !!(id != null && id >= 256 && ITEM_PROPS[id] && ITEM_PROPS[id].tool);

// blockDrop, BLOCK_DROP and every drop chance live in 50-loottable.js since 0.806
