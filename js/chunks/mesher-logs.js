'use strict';
/* chunks/mesher-logs.js: cactus and logs, inset columns of any width along any axis (emitLog).
   A part of meshChunk's body (chunks/mesher.js). */

corePart('mesh.chunk', function () {
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
    /* A QUARTER of a log two blocks wide (LOG_W_QUAD, blocks/basic.js: a jungle giant's 2x2 trunk). The four cells draw
       ONE log scaled x2: every face takes its uv from where it lies on the big log (its bark a picture over two blocks
       each way, its top's rings one over all four cells), a face against the next quarter of the same log is left out,
       and only the big log's four outer long edges are notched round (LOG_BEVEL of its width: twice a block log's). An
       end is left out against an opaque block or the same quarter going on at least as wide. `w`: its width index, which
       quarter (quadOf: bit 0 the high half across the first axis beside the log's own, bit 1 the second); the quarter
       reaches quadReach of its cell out from the middle line (its swings so far, LOG_CUT_SHIFT, blocks/basic.js). */
    const QL_SH = [178, 178, 255, 140, 216, 216];
    const QL_NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const QL_UVF = [(l) => [1 - l[2], l[1]], (l) => [l[2], l[1]], (l) => [l[0], l[2]],
                    (l) => [l[0], l[2]], (l) => [l[0], l[1]], (l) => [1 - l[0], l[1]]];
    function emitQuadLog(x, y, z, val, va, w, fam, pss) {
      const id = val & 255, A = va === 1 ? 0 : va === 2 ? 2 : 1, Pa = va === 1 ? 1 : 0, Qa = va === 2 ? 1 : 2;
      const q = quadOf(w), e = quadReach(val);                      // as far as its swings have cut it, every one shown
      const qp = q & 1, qq = (q >> 1) & 1, sP = qp ? 1 : -1, sQ = qq ? 1 : -1;
      const par = [(ox || 0) + x, y, (oz || 0) + z][A] & 1;      // which of the two blocks along the log this is
      const F = PROPS[id].faces, side = F[0], top = F[2], cut = 2 * LOG_BEVEL * e;
      const lit = (d) => gl(x + QL_NB[d][0], y + QL_NB[d][1], z + QL_NB[d][2]);
      const at = (a, p, r) => { const l = [0, 0, 0]; l[A] = a; l[Pa] = p; l[Qa] = r; return l; };
      // a point of this cell on the big log: 0..1 across its four quarters and along its two blocks
      const big = (l) => { const b = [0, 0, 0]; b[A] = (par + l[A]) / 2; b[Pa] = (qp + l[Pa]) / 2; b[Qa] = (qq + l[Qa]) / 2; return b; };
      const face = (pts, n, ud, tile, shade, lite) => {
        const [c0, c1, c2] = pts;
        const e = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]], f = [c2[0] - c0[0], c2[1] - c0[1], c2[2] - c0[2]];
        const dot = (e[1] * f[2] - e[2] * f[1]) * n[0] + (e[2] * f[0] - e[0] * f[2]) * n[1] + (e[0] * f[1] - e[1] * f[0]) * n[2];
        if (dot < 0) pts = [pts[0], pts[3], pts[2], pts[1]];
        const w = pts.map(l => [x + l[0], y + l[1], z + l[2]]), u = pts.map(l => QL_UVF[ud](big(l)));
        quad(pss, w[0], w[1], w[2], w[3], u[0], u[1], u[2], u[3], tile, shade, lite);
      };
      const unit = (k, s) => { const n = [0, 0, 0]; n[k] = s; return n; };
      const dirOf = (k, s) => 2 * k + (s < 0 ? 1 : 0);
      const nbv = (d) => gb(x + QL_NB[d][0], y + QL_NB[d][1], z + QL_NB[d][2]);
      const shut = (d) => { const nv = nbv(d); return opaqueVal(nv) || fastLeaf(nv); };
      /* the big log's quarter `want` (same wood family, same axis) in the cell that way, cut in no further than this one:
         as wide or wider, so it hides the face between them */
      const quarterAt = (d, want) => {
        const v = nbv(d), p = P[v & 255];
        if (!p || p.model !== 'log' || (p.family || 'wood') !== fam || ((v >> 8) & 3) !== va) return false;
        const nw = logWidthOf((v >> 8) & 255);
        return isQuadW(nw) && quadOf(nw) === want && quadReach(v) >= e - 1e-6;
      };
      // across each axis: [from, to] the quarter spans in its cell (the middle line at its inner side), its outer face
      const pSpan = qp ? [0, e] : [1 - e, 1], qSpan = qq ? [0, e] : [1 - e, 1];
      const pOut = qp ? pSpan[1] : pSpan[0], qOut = qq ? qSpan[1] : qSpan[0];
      const pIn = qp ? pSpan[0] : pSpan[1], qIn = qq ? qSpan[0] : qSpan[1];
      const pRest = qp ? [pSpan[0], pSpan[1] - cut] : [pSpan[0] + cut, pSpan[1]], qRest = qq ? [qSpan[0], qSpan[1] - cut] : [qSpan[0] + cut, qSpan[1]];
      const pStrip = qp ? [pSpan[1] - cut, pSpan[1]] : [pSpan[0], pSpan[0] + cut], qStrip = qq ? [qSpan[1] - cut, qSpan[1]] : [qSpan[0], qSpan[0] + cut];
      const atEdge = e >= 0.999;                                  // the outer faces lie on the cell's sides: an opaque block there hides them
      // the two ends: the quarter's square less the notch at its outer corner
      for (const s of [1, -1]) {
        const d = dirOf(A, s), av = s > 0 ? 1 : 0;
        if (shut(d) || quarterAt(d, q)) continue;
        const n = unit(A, s), L = lit(d);
        face([at(av, pSpan[0], qRest[0]), at(av, pSpan[1], qRest[0]), at(av, pSpan[1], qRest[1]), at(av, pSpan[0], qRest[1])], n, d, top, QL_SH[d], L);
        face([at(av, pRest[0], qStrip[0]), at(av, pRest[1], qStrip[0]), at(av, pRest[1], qStrip[1]), at(av, pRest[0], qStrip[1])], n, d, top, QL_SH[d], L);
      }
      // the two outer sides, each short of the notch
      const dpo = dirOf(Pa, sP), dqo = dirOf(Qa, sQ);
      if (!atEdge || !shut(dpo)) face([at(0, pOut, qRest[0]), at(1, pOut, qRest[0]), at(1, pOut, qRest[1]), at(0, pOut, qRest[1])], unit(Pa, sP), dpo, side, QL_SH[dpo], lit(dpo));
      if (!atEdge || !shut(dqo)) face([at(0, pRest[0], qOut), at(1, pRest[0], qOut), at(1, pRest[1], qOut), at(0, pRest[1], qOut)], unit(Qa, sQ), dqo, side, QL_SH[dqo], lit(dqo));
      // the notch: a square step, two small faces
      const pi = pOut - sP * cut, qi = qOut - sQ * cut, Ln = litMax(lit(dpo), lit(dqo));
      face([at(0, pi, qStrip[0]), at(1, pi, qStrip[0]), at(1, pi, qStrip[1]), at(0, pi, qStrip[1])], unit(Pa, sP), dpo, side, QL_SH[dpo], Ln);
      face([at(0, pStrip[0], qi), at(1, pStrip[0], qi), at(1, pStrip[1], qi), at(0, pStrip[1], qi)], unit(Qa, sQ), dqo, side, QL_SH[dqo], Ln);
      // the two inner sides, on the middle lines: only where the next quarter is not there as wide (cut away, or never grown)
      const dpi = dirOf(Pa, -sP), dqi = dirOf(Qa, -sQ);
      if (!shut(dpi) && !quarterAt(dpi, q ^ 1)) face([at(0, pIn, qSpan[0]), at(1, pIn, qSpan[0]), at(1, pIn, qSpan[1]), at(0, pIn, qSpan[1])], unit(Pa, -sP), dpi, side, QL_SH[dpi], lit(dpi));
      if (!shut(dqi) && !quarterAt(dqi, q ^ 2)) face([at(0, pSpan[0], qIn), at(1, pSpan[0], qIn), at(1, pSpan[1], qIn), at(0, pSpan[1], qIn)], unit(Qa, -sQ), dqi, side, QL_SH[dqi], lit(dqi));
    }
    function emitLog(x, y, z, val) {
      const id = val & 255, variant = (val >> 8) & 255, va = variant & 3;
      const fam = PROPS[id].family || 'wood';
      const pss = PROPS[id].pass;              // wood is opaque(0), cactus is cutout(1)
      const myW = logWidthOf(variant);
      if (isQuadW(myW)) { emitQuadLog(x, y, z, val, va, myW, fam, pss); return; }
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
      /* 3. CORNERS. Two logs side by side on the same axis, where one ENDS one way and the other the other way, are one
         bent branch (an acacia's limb: a stair of upright logs, each step ending at its top beside the next one's foot).
         Each draws an arm across to their shared face, square, as wide as the narrower one's flat bark, round the middle of the cell
         along its axis (`joins`), and its open end is cut back to that band (`clipHi` / `clipLo`): an elbow, not two
         posts a gap apart. Parallel trunks both run on past each other and are left apart. Wood only. */
      const A = va === 1 ? 0 : va === 2 ? 2 : 1;               // world axis the log runs along
      const Pa = va === 1 ? 1 : 0, Qa = va === 2 ? 1 : 2;      // the two axes across it
      const joins = [];                                        // [axis across, side, the arm's half width]
      let clipHi = null, clipLo = null;
      if (fam === 'wood') {
        const ua = [0, 0, 0]; ua[A] = 1;
        const runs = (nx, ny, nz) => { const n = logAt(nx, ny, nz, fam); return !!n && n.axis === va; };
        const endHi = !runs(x + ua[0], y + ua[1], z + ua[2]), endLo = !runs(x - ua[0], y - ua[1], z - ua[2]);
        if (endHi || endLo) for (const k of [Pa, Qa]) for (const s of [1, -1]) {
          const d = [0, 0, 0]; d[k] = s;
          const nx = x + d[0], ny = y + d[1], nz = z + d[2], n = logAt(nx, ny, nz, fam);
          if (!n || n.axis !== va) continue;
          const hiJoin = endHi && !runs(nx - ua[0], ny - ua[1], nz - ua[2]);   // we end on top, it at its foot
          const loJoin = endLo && !runs(nx + ua[0], ny + ua[1], nz + ua[2]);
          if (!hiJoin && !loJoin) continue;
          const half = Math.min(logWidthPx(myW), logWidthPx(n.w)) / 128 * (1 - 2 * LOG_BEVEL);   // inside the bevels
          joins.push([k, s, half]);
          if (hiJoin) clipHi = Math.max(clipHi ?? 0, 0.5 + half);
          if (loJoin) clipLo = Math.min(clipLo ?? 1, 0.5 - half);
        }
      }
      if (clipHi != null) b[A + 3] = Math.min(b[A + 3], clipHi);
      if (clipLo != null) b[A] = Math.max(b[A], clipLo);
      const F = PROPS[id].faces, side = F[0], top = F[2];
      /* An end cap is culled only against a same-axis log at least as wide as this cell — the
         narrower of two stacked logs must keep its cap or you see into the hollow.

         `flared` overrides that. A cell that pulled a face out to meet a branch is wider than
         the width it has stored, so the neighbour above compares against a stale number, culls,
         and leaves the collar open at the top — the horizontal slit where a branch meets the
         trunk. A flared cell always draws both of its axis caps. */
      const capped = (nx, ny, nz) => {
        const nv = gb(nx, ny, nz);
        if (opaqueVal(nv) || fastLeaf(nv)) return true;   // fast leaves hide a cap too
        if (flared) return false;
        const n = logAt(nx, ny, nz, fam);
        return !!n && n.axis === va && n.w >= myW;        // continuous trunk, no narrower than us
      };
      /* Rounded bark: each of the four edges that
         run ALONG the log has a square notch LOG_BEVEL of its width deep (2 of 16 pixels on a full log; a diagonal until 0.7931), so
         trunks and branches read round. The texture is untouched: every face keeps the uv mapping
         the box had, and a bevel strip borrows the mapping of the side face next to it. Only the
         mesh changes — collision and the selection box stay the box. Cactus has them too since 0.794. */
      const cut = LOG_BEVEL * logWidthPx(myW) / 64;
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
        // an end cut back to a corner's band lies inside the cell: whatever is beyond cannot hide it
        if ((s > 0 ? clipHi : clipLo) == null && capped(x + NB[d][0], y + NB[d][1], z + NB[d][2])) continue;
        const n = unit(A, s), L = lit(d);
        face([at(av, p0, q0 + cut), at(av, p1, q0 + cut), at(av, p1, q1 - cut), at(av, p0, q1 - cut)], n, d, top, SH[d], L);
        if (cut > 0) {
          face([at(av, p0 + cut, q0), at(av, p1 - cut, q0), at(av, p1 - cut, q0 + cut), at(av, p0 + cut, q0 + cut)], n, d, top, SH[d], L);
          face([at(av, p0 + cut, q1 - cut), at(av, p1 - cut, q1 - cut), at(av, p1 - cut, q1), at(av, p0 + cut, q1)], n, d, top, SH[d], L);
        }
      }
      // the four bark sides, each narrowed by the bevels either side of it
      /* With fast leaves a full-width log's side flush against a solid leaf or an opaque block is left out:
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
      // ...and the four corner notches between them: a square step, two small faces each (was a diagonal)
      if (cut > 0) for (const sp of [1, -1]) for (const sq of [1, -1]) {
        const dp = 2 * Pa + (sp < 0 ? 1 : 0), dq = 2 * Qa + (sq < 0 ? 1 : 0);
        const pi = (sp > 0 ? p1 : p0) - sp * cut, qi = (sq > 0 ? q1 : q0) - sq * cut;   // the notch's inner corner
        const pe = sp > 0 ? p1 : p0, qe = sq > 0 ? q1 : q0;
        face([at(a0, pi, qi), at(a1, pi, qi), at(a1, pi, qe), at(a0, pi, qe)], unit(Pa, sp), dp, side, SH[dp], litMax(lit(dp), lit(dq)));
        face([at(a0, pi, qi), at(a1, pi, qi), at(a1, pe, qi), at(a0, pe, qi)], unit(Qa, sq), dq, side, SH[dq], litMax(lit(dp), lit(dq)));
      }
      /* the corners' arms (3. above): a bark box from this log's side out to the shared face, its four sides only (one end
         is inside the log, the other meets the neighbour's arm) */
      for (const [k, s, half] of joins) {
        const o = k === Pa ? Qa : Pa, lo = [0, 0, 0], hi = [0, 0, 0];
        lo[k] = s > 0 ? b[k + 3] : 0; hi[k] = s > 0 ? 1 : b[k];
        if (hi[k] - lo[k] < 0.001) continue;                    // flared out to the edge already
        lo[A] = lo[o] = 0.5 - half; hi[A] = hi[o] = 0.5 + half;
        for (const m of [A, o]) for (const t of [1, -1]) {
          const d = 2 * m + (t < 0 ? 1 : 0), u = (m + 1) % 3, w = (m + 2) % 3, v = t > 0 ? hi[m] : lo[m];
          const pt = (pu, pw) => { const l = [0, 0, 0]; l[m] = v; l[u] = pu; l[w] = pw; return l; };
          face([pt(lo[u], lo[w]), pt(hi[u], lo[w]), pt(hi[u], hi[w]), pt(lo[u], hi[w])], unit(m, t), d, side, SH[d], lit(d));
        }
      }
    }
    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          const lp = PROPS[val & 255];
          if (lp && lp.model === 'log') emitLog(x, y, z, val);   // an id this build does not know is skipped, as everywhere else
        }
});
