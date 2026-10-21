'use strict';
/* chunks/mesher-cubes.js: meshChunk's set-up and its main pass. Reading the chunk and its four neighbour strips
   (gb, gl), per-vertex climate and dryness, the quad writers, and the greedy pass that merges the faces of full cubes.
   First part of meshChunk's body (chunks/mesher.js): the parts after it use its names. */

corePart('mesh.chunk', function () {
    let data = new Uint32Array(dataBuf);
    const sxn = new Uint32Array(sxnB), sxp = new Uint32Array(sxpB);
    const szn = new Uint32Array(sznB), szp = new Uint32Array(szpB);
    let light = new Uint16Array(lightBuf);    // this chunk's block-light (flood-filled main-thread); 16 bits for the colour
    let lxn = new Uint16Array(lxnB), lxp = new Uint16Array(lxpB);
    let lzn = new Uint16Array(lznB), lzp = new Uint16Array(lzpB);
    // the real light, kept for the dark-cave test below: the evened light of level 2 is only for shading
    const L0 = { light, lxn, lxp, lzn, lzp };
    const data0 = data;                       // ...and the real cells (seeEdge below)
    if (lod >= 2) {
      [data, light] = lodDownsample(data, light);
      lxn = lodEdgeLight(lxn); lxp = lodEdgeLight(lxp); lzn = lodEdgeLight(lzn); lzp = lodEdgeLight(lzp);
      layers = null;
    }
    const P = PROPS;
    // the climate at the chunk's 17x17 column corners: -1 cold .. 1 warm — world chunks only, not icons or drops
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
    /* The Dryland's dryness at the same corners, 0..255 (DRY_TILE above); null where the chunk has none, which
       is nearly every chunk: nine corners are looked at first, and the field is far too slow to hide between them. */
    let dry = null;
    const dryField = ox != null && !!_dryAt;      // a world chunk: the grass's dry colour is the field's, not its variant's
    if (dryField) {
      let some = false;
      for (let z = 0; z <= 16 && !some; z += 8) for (let x = 0; x <= 16; x += 8) if (_dryAt(ox + x, oz + z) > 0.002) { some = true; break; }
      if (some) {
        dry = new Uint8Array(289);
        for (let z = 0; z <= 16; z++) for (let x = 0; x <= 16; x++) dry[x + z * 17] = Math.round(_dryAt(ox + x, oz + z) * 255);
      }
    }
    function dryOf(x, z) {
      x = x < 0 ? 0 : x > 16 ? 16 : x; z = z < 0 ? 0 : z > 16 ? 16 : z;
      const ix = Math.min(15, x | 0), iz = Math.min(15, z | 0), fx = x - ix, fz = z - iz, i = ix + iz * 17;
      const a = dry[i] + (dry[i + 1] - dry[i]) * fx, b = dry[i + 17] + (dry[i + 18] - dry[i + 17]) * fx;
      return Math.round(a + (b - a) * fz);
    }
    /* What keeps a grass face from merging with its neighbours in the greedy sweep: 0 or its one dryness when every
       corner of the face has the same (those merge as ever), else a number of its own, so each block's face keeps its
       four corners and the colour runs smoothly through them. `d` the sweep's axis, (x, z) the cell, e the face's plane. */
    function dryKey(d, x, z, e) {
      let a, b, c, f;
      if (d === 1) { a = dry[x + z * 17]; b = dry[x + 1 + z * 17]; c = dry[x + (z + 1) * 17]; f = dry[x + 1 + (z + 1) * 17]; }
      else if (d === 0) { a = c = dry[e + z * 17]; b = f = dry[e + (z + 1) * 17]; }
      else { a = c = dry[x + e * 17]; b = f = dry[x + 1 + e * 17]; }
      return a === b && a === c && a === f ? a : 256 + x + z * 16;
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
    // Byte is PACKED: low nibble = block light (glow), high nibble = sky light; bit 8 its colour (LIGHT_COLD).
    function gl(x, y, z) {
      if (y > CY - 1) return 0xF0;               // open sky above the world
      if (y < 0) return 0;
      if (x < 0)  return lxn[z + y * 16];
      if (x > 15) return lxp[z + y * 16];
      if (z < 0)  return lzn[x + y * 16];
      if (z > 15) return lzp[x + y * 16];
      return light[x + (z << 4) + (y << 8)];
    }
    // the sky light a cell really has, not evened out (the dark-cave test of a far chunk)
    function skyReal(x, y, z) {
      if (y > CY - 1) return 15;
      if (y < 0) return 0;
      const v = x < 0 ? L0.lxn[z + y * 16] : x > 15 ? L0.lxp[z + y * 16] : z < 0 ? L0.lzn[x + y * 16]
              : z > 15 ? L0.lzp[x + y * 16] : L0.light[x + (z << 4) + (y << 8)];
      return (v >> 4) & 15;
    }

    /* A block beside water is wet: its faces darker (WET_TILE tiles only, SHORE_WET_SHADE in chunks/mesher.js). Beside it:
       water over it, in one of the four cells round it, or under one of those (a beach's sand a block above the sea).
       World chunks only; looked at once a cell. */
    const wetField = ox != null;
    if (wetField) WETC.fill(-1);
    const _isW = (v) => (v & 255) === B.WATER;
    function wetBeside(x, y, z) {
      const i = x + (z << 4) + (y << 8);
      let c = WETC[i];
      if (c < 0) {
        c = _isW(gb(x, y + 1, z)) || _isW(gb(x + 1, y, z)) || _isW(gb(x - 1, y, z)) || _isW(gb(x, y, z + 1)) || _isW(gb(x, y, z - 1))
         || _isW(gb(x + 1, y - 1, z)) || _isW(gb(x - 1, y - 1, z)) || _isW(gb(x, y - 1, z + 1)) || _isW(gb(x, y - 1, z - 1)) ? 1 : 0;
        WETC[i] = c;
      }
      return c;
    }

    /* A half-resolution chunk's see-through face ACROSS its edge (leaves, glass, ice, water): drawn only where the real cell on
       this side holds that block. Its 2x2x2 groups grow a block past the real ones (leaves into the air beside them, water a
       block over its surface), while the chunk beside it is read in its real cells, so those grown blocks drew faces standing
       in the open along every far chunk's edge. (x, y, z) the cell, v what is drawn there. Always true below level 2. */
    const seeEdge = (x, y, z, v) => lod < 2 || matKey(data0[x + (z << 4) + (y << 8)]) === matKey(v);

    // one growable buffer set per render pass
    // 0 opaque, 1 cutout (leaves, plants), 2 water, 3 lava, 4 see-through (glass)
    // dark: a water surface's depth shade per corner, 0..255; only quadW writes it, padded with 0 to the vertex
    const passes = [null, null, null, null, null].map(() => ({ pos: [], uv: [], tile: [], shade: [], lite: [], clim: [], dark: [], index: [], v: 0 }));
    let minY = CY, maxY = 0;
    function pushClim(g, tile, c0, c1, c2, c3) {
      if (clim && TINTED[tile]) g.clim.push(climOf(c0[0], c0[2]), climOf(c1[0], c1[2]), climOf(c2[0], c2[2]), climOf(c3[0], c3[2]));
      else g.clim.push(0, 0, 0, 0);
      // a grass face's dryness at its corners, in `dark`, padded with 0 up to here as quadW does
      if (dry && DRY_TILE[tile]) {
        const a = dryOf(c0[0], c0[2]), b = dryOf(c1[0], c1[2]), c = dryOf(c2[0], c2[2]), d = dryOf(c3[0], c3[2]);
        if (a | b | c | d) { while (g.dark.length < g.v) g.dark.push(0); g.dark.push(a, b, c, d); }
      }
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
            let m = 0, ml = 0, md = 0;
            if (a !== 0 && P[a & 255] && P[a & 255].model === 'cube' && (a & 255) !== B.WATER && (a & 255) !== B.LAVA
                && !(((a >> 8) & 255) && P[a & 255].shapes && (shapeOfVal(a) || slabMixed(a)))) {   // a chiseled cube emits with the models below, a mixed slab too   // non-cube models emit separately; water/lava handled by emitWater/emitLava
              npos[0] = pos[0]; npos[1] = pos[1]; npos[2] = pos[2]; npos[d] += s;
              const nv = gb(npos[0], npos[1], npos[2]);
              const nl = gl(npos[0], npos[1], npos[2]);
              /* A far chunk (lod 1+) leaves out a face that opens onto pitch-dark AIR: the inside of a cave
                 no sky light reaches, which cannot be seen from half the render distance away. That is most
                 of a chunk's faces (measured ~60%). Dark water is kept, so a deep sea floor never opens. */
              if (lod && (nv & 255) === B.AIR && skyReal(npos[0], npos[1], npos[2]) === 0) { /* skipped */ }
              /* a half-resolution chunk's see-through block (leaves, ice, glass) shows a face across the chunk's edge
                 only off a real one (seeEdge above). Its 2x2x2 groups grow it a block past the real ones (ice into the
                 water under a frozen lake, leaves into the air), and the edge is read from the neighbour's REAL cells, so
                 every far chunk's edge drew walls of faces: the grid of lines seen through frozen lakes, leaves in the air. */
              else if (lod >= 2 && !P[a & 255].opaque && (npos[0] < 0 || npos[0] > 15 || npos[2] < 0 || npos[2] > 15)
                       && !seeEdge(pos[0], pos[1], pos[2], a)) { /* skipped */ }
              else if (faceVisible(a, nv, P)) {
                m = a; any = true;
                ml = nl;                              // face lit by the transparent cell it faces
                // a faint glow of its own (ores), so it can be spotted in a pitch-black cave
                const sg = P[a & 255].selfGlow;
                if (sg && (ml & 15) < sg) ml = (ml & 0xF0) | sg;
                /* Grass in a world chunk: its dry colour comes from the field, so a GRASS_DRY block is the grass
                   block here (and merges with it), and where the dryness changes across a face it stands alone (dryKey) */
                if (dryField && (a & 255) === B.GRASS) {
                  if (((a >> 8) & 255) === V.GRASS_DRY) m = B.GRASS;
                  if (dry && dir !== 1) md = dryKey(d, pos[0], pos[2], n + (s > 0 ? 1 : 0));
                }
                if (wetField && wetBeside(pos[0], pos[1], pos[2])) md |= MD_WET;   // a wet face merges only with wet ones
              }
            }
            mask[u + v * us] = m;
            maskL[u + v * us] = ml;
            maskD[u + v * us] = md;
          }
        }
        if (!any) continue;

        // ---- greedy rectangle expansion (faces merge only when tile AND light match; a grass face's dryness too) ----
        for (let v = 0; v < vsE; v++) {
          for (let u = 0; u < us;) {
            const val = mask[u + v * us], lv = maskL[u + v * us], dv2 = maskD[u + v * us];
            if (!val) { u++; continue; }
            let w = 1;
            while (u + w < us && mask[u + w + v * us] === val && maskL[u + w + v * us] === lv && maskD[u + w + v * us] === dv2) w++;
            let h = 1;
            outer: while (v + h < vsE) {
              for (let k = 0; k < w; k++)
                if (mask[u + k + (v + h) * us] !== val || maskL[u + k + (v + h) * us] !== lv || maskD[u + k + (v + h) * us] !== dv2) break outer;
              h++;
            }
            emit(dir, n, u, v, w, h, val, lv, dv2);
            for (let dv = 0; dv < h; dv++)
              for (let k = 0; k < w; k++) mask[u + k + (v + dv) * us] = 0;
            u += w;
          }
        }
      }

      function emit(dir, n, u0, v0, w, h, val, lv, md) {
        const id = val & 255, prop = PROPS[id];
        // MODEL dispatch — only 'cube' exists today; non-cube models (slabs, stairs,
        // torches, doors + rotation variants) would branch here with their own emitters.
        if (prop.model !== 'cube') return;
        const F = facesOfVal(val);           // its look's art, or its own (blocks/looks.js)
        let tile = F[faceIdx];
        const varb = (val >> 8) & 255;
        // grass "snowy" variant: snow-covered sides (top stays grass, bottom stays dirt).
        // driven by the variant byte, set wherever a snow block sits on grass.
        if (id === B.GRASS && varb === V.GRASS_SNOWY && faceIdx !== 2 && faceIdx !== 3)
          tile = T.GRASS_SNOW_SIDE;
        // the Dryland's pale grass: its own top and sides, never moved by the climate colour
        if (id === B.GRASS && varb === V.GRASS_DRY && faceIdx !== 3) tile = faceIdx === 2 ? T.GRASS_TOP_DRY : T.GRASS_SIDE_DRY;
        // TNT lit-blink variant: every face flashes white over its OWN picture — the top keeps the top
        if (id === B.TNT && (varb & 1)) tile = faceIdx === 2 ? T.TNT_TOP_LIT : faceIdx === 3 ? T.TNT_BOTTOM : T.TNT_LIT;
        // lying log: ring texture on the faces along the log's axis (1 = X, 2 = Z)
        if (id === B.LOG && varb)
          tile = (varb === 1 ? (faceIdx === 0 || faceIdx === 1) : (faceIdx === 4 || faceIdx === 5))
            ? T.LOG_TOP : T.LOG;
        // rot:'side' blocks: front tile sits on the variant's facing; lit furnace swaps it
        if (id === B.FURNACE) tile = furnaceTile(varb, faceIdx);   // its rock's set
        if (id === B.CRAFTING_BENCH) tile = benchTile(varb, faceIdx);   // its wood's set
        /* A lying pillar: its top on the two faces along its axis (1 = X, 2 = Z), and its side art
           turned a quarter on the rest, so the fluting runs along it rather than across. */
        let sw = false;
        if (pillarOfVal(val) && (varb & 3)) {
          const ax = varb & 3, end = ax === 1 ? (faceIdx === 0 || faceIdx === 1) : (faceIdx === 4 || faceIdx === 5);
          tile = end ? F[2] : F[0];
          sw = !end && (ax === 1 || dir === 2 || dir === 3);
        }
        // a block turned to face you (rot:'side') with `rotTop` turns its top and bottom art with it (the seashell block)
        const q = prop.rotTop && dir <= 1 ? [0, 2, 1, 3][varb & 3] : 0;
        const R = sw ? (a) => [a[1], a[0]] : q === 1 ? (a) => [a[1], -a[0]] : q === 2 ? (a) => [-a[0], -a[1]]
                : q === 3 ? (a) => [-a[1], a[0]] : (a) => a;
        const sh = (md & MD_WET) && WET_TILE[tile] ? Math.round(shade * SHORE_WET_SHADE) : shade;   // beside water: wet
        // fast leaves: solid, in the opaque pass, the tile marked for the shader to fill
        const fastL = fastLeaf(val);
        const pass = fastL ? 0 : prop.pass;
        if (fastL) tile |= FAST_LEAF_TILE;
        let wc = n + (s > 0 ? 1 : 0);        // face plane coordinate along axis d
        // water surface sits slightly below the block top (classic look)
        if (dir === 0 && id === B.WATER) wc -= 0.12;
        const u1 = u0 + w, v1 = v0 + h;
        switch (dir) {
          case 0: quad(pass, [u0,wc,v0],[u0,wc,v1],[u1,wc,v1],[u1,wc,v0], R([0,0]),R([0,h]),R([w,h]),R([w,0]), tile, sh, lv); break;
          case 1: quad(pass, [u0,wc,v0],[u1,wc,v0],[u1,wc,v1],[u0,wc,v1], R([0,0]),R([w,0]),R([w,h]),R([0,h]), tile, sh, lv); break;
          case 2: quad(pass, [wc,v0,u0],[wc,v1,u0],[wc,v1,u1],[wc,v0,u1], R([w,0]),R([w,h]),R([0,h]),R([0,0]), tile, sh, lv); break;
          case 3: quad(pass, [wc,v0,u0],[wc,v0,u1],[wc,v1,u1],[wc,v1,u0], R([0,0]),R([w,0]),R([w,h]),R([0,h]), tile, sh, lv); break;
          case 4: quad(pass, [u0,v0,wc],[u1,v0,wc],[u1,v1,wc],[u0,v1,wc], R([0,0]),R([w,0]),R([w,h]),R([0,h]), tile, sh, lv); break;
          case 5: quad(pass, [u0,v0,wc],[u0,v1,wc],[u1,v1,wc],[u1,v0,wc], R([w,0]),R([w,h]),R([0,h]),R([0,0]), tile, sh, lv); break;
        }
      }
    }
});
