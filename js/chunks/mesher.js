'use strict';
/* chunks/mesher.js: the mesher's shared pieces and meshChunk. Which faces show (faceVisible), fast leaves, the
   reusable masks, level of detail (lodDownsample), then meshChunk's first and last line. Its body is the parts named
   mesh.chunk: mesher-cubes.js, mesher-models.js, mesher-plants.js, mesher-logs.js, fluids/mesher-fluids.js,
   mesher-finish.js.
   A part of VOXEL_CORE (chunks/voxel-core.js). */

corePart('voxel', function () {
  /* ---------- greedy mesher ----------
     Six directional sweeps. For each slice a 2D mask stores the raw voxel value
     (ID + variant), so only faces with identical texture/variant merge. Corner tables per
     direction keep windings CCW-outward and side textures upright & unmirrored.            */

  /* Fast leaves (Options > Video): a whole leaf block is drawn as a solid block. It hides
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
    if (opaqueVal(b)) return false;           // hidden behind an opaque neighbour (a chiseled one is not)
    if (fastLeaf(b)) return false;            // fast leaves hide what is behind them
    if (A.opaque) return true;                // opaque against transparent -> visible
    if (Bp.shapes && ((b >> 8) & 255) && (shapeOfVal(b) || slabMixed(b))) return true;   // glass beside a glass slab (or a mixed one) still needs its face
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
  const maskL = new Uint16Array(16 * CY);    // parallel mask of per-face block-light level (with its colour bit)
  const maskD = new Uint16Array(16 * CY);    // ...and of a grass face's dryness key (dryKey): faces merge only when it matches too
  /* Light COLOUR: a packed light is block light (bits 0-3) | sky light (4-7) | LIGHT_COLD (bit 8), set where the
     brightest block light reaching the cell is a cold one (crystal torch, glowcrystal block, glow vine). The shader (04)
     tints that light blue. Two lights joined per nibble keep the colour of the brighter block light. */
  const LIGHT_COLD = 0x100;
  const litMax = (m, n) => (Math.max((m >> 4) & 15, (n >> 4) & 15) << 4)
                         | ((m & 15) >= (n & 15) ? m & (15 | LIGHT_COLD) : n & (15 | LIGHT_COLD));

  /* ---- LEVEL OF DETAIL ----
     A far chunk is meshed simpler (chunks/chunks.js picks the level from its distance):
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
    if (shapeOfVal(v) === 'door') return 0;                         // a door is drawn as its own mesh
    if ((v & 255) === B.WATER || (v & 255) === B.LAVA) return 1;
    return p.opaque ? 3 : (shapeOfVal(v) ? 3 : 2);                 // a slab or stairs counts as its full block
  }
  // the value a group is drawn as: shapes dropped, logs full width, fluids full
  function _lodVal(v) {
    const id = v & 255, p = PROPS[id], va = (v >> 8) & 255;
    if (p.model === 'log') return (id | (((va & 3) | (LOG_W_BLOCK << 2)) << 8)) >>> 0;
    if (id === B.WATER || id === B.LAVA) return id;
    if (!p.opaque) return id;                                      // leaves and glass: no variant, so they merge
    return p.shapes && (shapeOfVal(v) || slabMixed(v)) ? id : v;    // a mixed slab far off: its low block
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

  // layers: Map(cell index -> block ids bottom to top) for this chunk's mixed layer stacks, or null
  // lod: 0 full detail, 1 no small things, 2 half resolution (see LEVEL OF DETAIL above)
  // ox, oz: the chunk's world origin, for things that vary by place (a mushroom's size); null for icons and drops
  function meshChunk(dataBuf, sxnB, sxpB, sznB, szpB, lightBuf, lxnB, lxpB, lznB, lzpB, layers, lod = 0, ox = null, oz = 0) {
    /*@include mesh.chunk*/
  }
});
