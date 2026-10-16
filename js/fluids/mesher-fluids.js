'use strict';
/* fluids/mesher-fluids.js: how water and lava are drawn. Surface height by level, depth shading per corner, lips and
   falls, river flow tiles (emitWater, emitLava).
   A part of meshChunk's body (chunks/mesher.js). */

corePart('mesh.chunk', function () {
    // ---- per-block water: level-based top height, no greedy merge ----
    // variant byte = level: 0 = source (full), 1-7 = flowing ((8-level)/8 height); bits 3-6 a river's way, 7 it runs fast
    /* Depth shading: a surface darkens smoothly with the still water under it, 0.72 x (1 - e^(-depth/6)) of its
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
      // a column the mesher cannot see (diagonal to a chunk corner) has no surface to count
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
    /* A fall's lip: a surface corner next to a cell the water would spill into (air over no solid ground, at
       its own height) sinks to LIP_H, so the top rolls down over the edge instead of ending square. Worked out from the
       four cells round the corner, so every surface sharing it agrees. */
    const LIP_H = 0.3;
    /* The mesher sees its neighbours only as the four one-cell strips along its sides (gb), never the cells diagonal to its
       corners: read there, gb returns some other cell. So a cell off both axes counts as unseen, and a corner
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
      /* still frames on a calm top, the flow animation on anything running. Speeds: a river's top
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
      const maxLite = litMax;                 // with the light's colour
      const above = gl(x, y + 1, z);
      // scale rather than subtract: at night the sky nibble is already low and a flat -7 would clamp every deep surface to pitch black
      /* the light byte stays one value for the whole face (it is unpacked bit by bit, so blending it between
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
          /* a river's top: variant bits 3-6 hold its way (1-8, an eighth turn each from +x, set by the generator);
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
         Steps: a cell with water over it stands its full height (1, its side faces up to the cell above's,
         not stopping short at 8/9 and leaving a slit), and only an open surface waves its sides' top edge. Where a side
         rises from a lower open surface beside it, its foot waves with that surface (`footS`), so the fall's face stays
         joined to the water it runs into. A side's top follows the corners (a lip's sunk ones). */
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
      // still frames on a calm top, the flow animation on the sides and on anything running
      const tile = T.LAVA, flow = T.LAVA_FLOW, topTile = level === 0 ? tile : flow;
      const lite = 255;   // emissive: always full brightness
      if ((gb(x, y + 1, z) & 255) !== B.LAVA) {
        // flowing lava's top runs its way, as water's does (bits 3-6, set as it spreads, makeFluidSim)
        const fdir = (val >> 11) & 15;
        let uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
        if (level && fdir >= 1 && fdir <= 8) {
          const a = (fdir - 1) * Math.PI / 4, fx = Math.cos(a), fz = Math.sin(a);
          const uvAt = (px, pz) => [0.5 - (px - 0.5) * fz + (pz - 0.5) * fx, 0.5 - ((px - 0.5) * fx + (pz - 0.5) * fz)];
          uv = [uvAt(0, 0), uvAt(0, 1), uvAt(1, 1), uvAt(1, 0)];
        }
        quad(3, [x0,y+frac,z0],[x0,y+frac,z1],[x1,y+frac,z1],[x1,y+frac,z0], uv[0], uv[1], uv[2], uv[3], topTile, level === 0 ? 255 : 240, lite);
      }
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
});
