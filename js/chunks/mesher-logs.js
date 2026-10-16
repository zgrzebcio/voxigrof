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
    }
    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          if (PROPS[val & 255].model === 'log') emitLog(x, y, z, val);
        }
});
