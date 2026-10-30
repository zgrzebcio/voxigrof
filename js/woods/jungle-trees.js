'use strict';
/* woods/jungle-trees.js: the jungle's trees, ONE shape for each kind, used both by the world generator (the tree loop,
   woods/gen-jungle.js) and by a jungle sapling growing (woods/jungle.js, through CORE.jungleTree): nothing is copied.
   A part of VOXEL_CORE (chunks/voxel-core.js), at its top level, so the page has it too.

   jungleTree(kind, put, rnd, o) builds one tree with its first trunk cell at (0, 0, 0); the ground under it is the
   caller's.
     put(dx, dy, dz, val, wood)  writes one cell; `wood` true for logs (they go over anything), false for leaves, pods and
                                 vines (only where there is room: the caller decides what room is); true when it wrote
                                 the cell (a vine's strand stops where one did not go down)
     rnd(a, b)                   a number 0..1 for the choice keyed (a, b): the generator's hashes of the tree's cell, the
                                 page's Math.random
     o.cocoa                     hang wild cocoa pods on a straight tree (the generator; a grown sapling gets them later,
                                 woods/cocoa.js)
     o.vines                     hang vines on a giant (the generator from biomeRev 45, and a grown sapling)
   The kinds (JUNGLE_TREE):
     GIANT  a 2x2 trunk (quarters of one log scaled x2, LOG_W_QUAD in blocks/basic.js) 18-29 tall, buttress roots, three
            to five long limbs high up under leaf blobs, and a wide crown over four short limbs at its top
     TALL   a straight trunk a block wide, 9-15 tall, a round crown and a few stubs: the cocoa's tree
     SMALL  a short trunk 3-5 tall under a round bush of a crown
     BENT   a stump 2-4 tall that turns hard into one limb (and now and then a second, the other way) running out
            level 3-4 blocks and up again: its crown hangs out to the side, never over the stump
     BUSH   one log on the ground in a heap of leaves
   Nothing is written more than 7 blocks from the trunk across (the tree loop reaches 8 past a chunk's edge), and every
   leaf lies within the leaves' reach of wood (isLeavesConnected, woods/leaf-decay.js). */

corePart('voxel', function () {
  const JUNGLE_TREE = { GIANT: 0, TALL: 1, SMALL: 2, BENT: 3, BUSH: 4 };
  const JLOG = (w, axis = 0) => (B.JUNGLE_LOG | ((axis | (w << 2)) << 8)) >>> 0;
  const JQUAD = (q) => JLOG(LOG_W_QUAD + q);
  const JLEAF = B.JUNGLE_LEAVES;
  const JUNGLE_TRUNK_W = 24, JUNGLE_SMALL_W = 20, JUNGLE_LIMB_W = 17, JUNGLE_ROOT_W = 22;
  const JUNGLE_COCOA_UP = 6;               // a wild pod's lowest trunk cell (0 the first log): 7 blocks over the ground
  // which kind a roll picks: giants thicker in a Deep Jungle
  const jungleKindOf = (r, deep) => r < (deep ? 0.26 : 0.1) ? JUNGLE_TREE.GIANT : r < 0.46 ? JUNGLE_TREE.TALL
                                  : r < 0.68 ? JUNGLE_TREE.SMALL : JUNGLE_TREE.BENT;

  /* Leaves for a heap or a disc: `cells` [x, y, z, inner]. Inner cells always go down; a rim cell (one the ragged rim
     kept) only if it joins an inner one through the others, face to face. The rim's gaps would else leave a leaf alone,
     touching no other leaf, out of reach of wood (and so decaying). */
  const J_D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function _jPutJoined(put, cells) {
    const at = new Map(), q = [];
    for (const c of cells) at.set(c[0] + ',' + c[1] + ',' + c[2], c);
    for (const c of cells) if (c[3]) { c[4] = true; q.push(c); }
    while (q.length) {
      const c = q.pop();
      for (const d of J_D6) {
        const n = at.get((c[0] + d[0]) + ',' + (c[1] + d[1]) + ',' + (c[2] + d[2]));
        if (n && !n[4]) { n[4] = true; q.push(n); }
      }
    }
    for (const c of cells) if (c[4]) put(c[0], c[1], c[2], JLEAF, false);
  }
  /* a heap of leaves round (cx, cy, cz), its cells within `r` (Manhattan, the y counted `flat` times over), the rim ragged */
  function _jBlob(put, rnd, cx, cy, cz, r, flat, key) {
    const R = Math.ceil(r), cells = [];
    for (let dy = -R; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * flat;
          if (d > r) continue;
          const inner = d <= r - 1;
          if (!inner && rnd(key + dx * 7 + dy * 13, dz * 11 - dy * 5) < 0.4) continue;
          cells.push([cx + dx, cy + dy, cz + dz, inner]);
        }
    _jPutJoined(put, cells);
  }
  /* a crown disc at height y round the point (cx, cz) (a cell's middle is its corner + 0.5: a one-block trunk at cell 0
     is 0.5, a 2x2 one 1), radius r, the rim ragged */
  function _jDisc(put, rnd, cx, y, cz, r, key) {
    const cells = [];
    for (let ez = Math.floor(cz - r); ez <= Math.ceil(cz + r); ez++)
      for (let ex = Math.floor(cx - r); ex <= Math.ceil(cx + r); ex++) {
        const fx = ex + 0.5 - cx, fz = ez + 0.5 - cz, dd = fx * fx + fz * fz;
        if (dd > r * r) continue;
        const inner = dd <= (r - 1) * (r - 1);
        if (!inner && rnd(key + ex * 17, ez * 23 + y) < 0.45) continue;
        cells.push([ex, y, ez, inner]);
      }
    _jPutJoined(put, cells);
  }
  /* Vines on a giant (o.vines): strands down the 2x2 trunk's outer sides, and strands hanging from the edges of its
     leaves where nothing of the tree is under them. A strand goes down from its top until a cell will not take it (put
     answers false: no room, out of the chunk) or a block over the ground, so every cell of it hangs on the trunk or on
     the vine over it (woods/vines.js). `mine`: the cells the tree wrote, "x,y,z"; `leaves`: its leaf cells [x, y, z]. A
     vine's variant is the side it hangs on: 0 -Z, 1 +Z, 2 -X, 3 +X. Nothing farther than 7 from the trunk across. */
  const VINE_TRUNK_P = 0.55, VINE_CROWN_P = 0.07;   // a trunk side's strand; a canopy edge cell's (about ten a giant)
  const VINE_SIDES = [[-1, 0, 3], [-1, 1, 3], [2, 0, 2], [2, 1, 2], [0, -1, 1], [1, -1, 1], [0, 2, 0], [1, 2, 0]];   // [x, z, variant]
  const VINE_OUT = [[1, 0, 2], [-1, 0, 3], [0, 1, 0], [0, -1, 1]];   // out of a leaf: [dx, dz, the variant hanging on it]
  const _jVineVal = (w) => (B.VINE | (w << 8)) >>> 0;
  function _jStrand(put, mine, x, top, z, len, w) {
    for (let y = top; y > top - len && y >= 1; y--) {
      if (mine.has(x + ',' + y + ',' + z) || !put(x, y, z, _jVineVal(w), false)) return;
    }
  }
  function _jVines(put, rnd, th, mine, leaves) {
    for (let i = 0; i < VINE_SIDES.length; i++) {
      if (rnd(40 + i, 1) > VINE_TRUNK_P) continue;
      const [x, z, w] = VINE_SIDES[i], top = Math.floor(th * (0.35 + rnd(40 + i, 2) * 0.4));
      _jStrand(put, mine, x, top, z, 3 + ((rnd(40 + i, 3) * top) | 0), w);
    }
    for (const [lx, ly, lz] of leaves) {
      if (mine.has(lx + ',' + (ly - 1) + ',' + lz)) continue;           // the canopy's underside only
      for (let d = 0; d < 4; d++) {
        const [dx, dz, w] = VINE_OUT[d], x = lx + dx, z = lz + dz;
        if (x < -7 || x > 8 || z < -7 || z > 8 || mine.has(x + ',' + ly + ',' + z)) continue;
        if (rnd(lx * 31 + lz * 17 + d * 7 + 600, ly + 500) > VINE_CROWN_P) continue;
        _jStrand(put, mine, x, ly, z, 2 + ((rnd(lx * 13 + d, lz * 29 + ly) * 6) | 0), w);
      }
    }
  }
  /* a limb out from (sx, sy, sz) toward (ax, az) (a unit-ish way), `len` cells level, then `rise` up: logs a cell per axis
     move (every turn a mesher elbow); returns its tip */
  function _jLimb(put, sx, sy, sz, ax, az, len, rise, w) {
    let x = sx, z = sz, y = sy, fx = 0, fz = 0;
    for (let s = 1; s <= len; s++) {
      fx += ax; fz += az;
      const nx = sx + Math.round(fx), nz = sz + Math.round(fz);
      if (nx !== x) { x = nx; put(x, y, z, JLOG(w, 1), true); }
      if (nz !== z) { z = nz; put(x, y, z, JLOG(w, 2), true); }
    }
    for (let k = 0; k < rise; k++) { y++; put(x, y, z, JLOG(w, 0), true); }
    return [x, y, z];
  }

  function jungleTree(kind, put, rnd, o = {}) {
    const K = JUNGLE_TREE;
    if (kind === K.BUSH) {
      put(0, 0, 0, JLOG(JUNGLE_SMALL_W), true);
      _jBlob(put, rnd, 0, 0, 0, 2.5, 2, 900);
      return;
    }
    if (kind === K.GIANT) {
      // with vines, every cell it writes is noted first: they hang beside them (_jVines)
      const mine = o.vines ? new Set() : null, leaves = [];
      if (mine) {
        const put0 = put;
        put = (dx, dy, dz, v, wood) => {
          mine.add(dx + ',' + dy + ',' + dz);
          if (v === JLEAF) leaves.push([dx, dy, dz]);
          return put0(dx, dy, dz, v, wood);
        };
      }
      const th = 18 + ((rnd(1, 2) * 12) | 0);
      for (let y = 0; y < th; y++)
        for (let q = 0; q < 4; q++) put(q & 1, y, q >> 1, JQUAD(q), true);
      // buttress roots: upright logs flared against the trunk's foot, two or three high
      const FEET = [[-1, 0], [-1, 1], [2, 0], [2, 1], [0, -1], [1, -1], [0, 2], [1, 2]];
      for (let i = 0; i < FEET.length; i++) {
        if (rnd(10 + i, 3) > 0.45) continue;
        const [fx, fz] = FEET[i], hh = 1 + ((rnd(10 + i, 7) * 2) | 0);
        for (let y = 0; y < hh; y++) put(fx, y, fz, JLOG(JUNGLE_ROOT_W - y * 3), true);
      }
      // long limbs high up, each out of the trunk's side under a heap of leaves
      const nLimbs = 3 + ((rnd(20, 1) * 3) | 0);
      for (let b = 0; b < nLimbs; b++) {
        const a = (b / nLimbs + rnd(21 + b, 5) * 0.3) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const by = Math.floor(th * 0.55) + ((rnd(22 + b, 9) * Math.max(1, th * 0.3)) | 0);
        // out of the trunk cell on that side (its quarter nearest the way it goes)
        const tip = _jLimb(put, ca >= 0 ? 1 : 0, by, sa >= 0 ? 1 : 0, ca, sa, 2 + ((rnd(23 + b, 11) * 2) | 0), 1, JUNGLE_LIMB_W);
        _jBlob(put, rnd, tip[0], tip[1] + 1, tip[2], 3, 2, 100 + b * 50);
      }
      // the crown: eight short limbs out of the top (the corners' too, so the disc's rim is within reach of wood), a wide
      // disc over them, smaller ones on that
      const top = th - 1, D = Math.SQRT1_2;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1], [D, D], [-D, D], [D, -D], [-D, -D]])
        _jLimb(put, ax > 0 ? 1 : 0, top, az > 0 ? 1 : 0, ax, az, 3, 0, JUNGLE_LIMB_W);
      _jDisc(put, rnd, 1, top, 1, 5.5, 300);
      _jDisc(put, rnd, 1, top + 1, 1, 6.4, 310);
      _jDisc(put, rnd, 1, top + 2, 1, 4.6, 320);
      _jDisc(put, rnd, 1, top + 3, 1, 2.6, 330);
      if (mine) _jVines(put, rnd, th, mine, leaves);
      return;
    }
    if (kind === K.TALL) {
      const th = 9 + ((rnd(1, 2) * 7) | 0);
      for (let y = 0; y < th; y++) put(0, y, 0, JLOG(y === 0 ? JUNGLE_TRUNK_W + 3 : JUNGLE_TRUNK_W), true);
      // two or three stubs under the crown, a tuft on each
      const nStub = 2 + ((rnd(3, 1) * 2) | 0);
      for (let s = 0; s < nStub; s++) {
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][(rnd(4 + s, 3) * 4) | 0];
        const sy = th - 2 - ((rnd(5 + s, 7) * 3) | 0);
        const tip = _jLimb(put, 0, sy, 0, d[0], d[1], 1 + ((rnd(6 + s, 9) * 2) | 0), 1, JUNGLE_LIMB_W);
        _jBlob(put, rnd, tip[0], tip[1] + 1, tip[2], 1.5, 2, 200 + s * 40);
      }
      _jDisc(put, rnd, 0.5, th - 2, 0.5, 3.2, 400);
      _jDisc(put, rnd, 0.5, th - 1, 0.5, 3.6, 410);
      _jDisc(put, rnd, 0.5, th, 0.5, 2.6, 420);
      _jDisc(put, rnd, 0.5, th + 1, 0.5, 1.5, 430);
      /* wild cocoa pods high on the bare trunk, below the crown: from JUNGLE_COCOA_UP (the first log is a block over the
         ground, so 7 blocks up, COCOA_MIN_UP in woods/cocoa.js) to 4 under the top. The side it hangs on is where its trunk is */
      const lo = JUNGLE_COCOA_UP, hi = th - 4;
      if (o.cocoa && hi >= lo) {
        const SIDE = [[0, -1], [0, 1], [-1, 0], [1, 0]];          // a pod here has its trunk at +Z, -Z, +X, -X (COCOA_BITS.FACE)
        for (let k = 0; k < 4; k++) {
          if (rnd(30 + k, 1) > 0.32) continue;
          const face = (rnd(30 + k, 2) * 4) | 0, y = lo + ((rnd(30 + k, 3) * (hi - lo + 1)) | 0);
          const st = (rnd(30 + k, 4) * (COCOA_BITS.RIPE + 1)) | 0;
          put(SIDE[face][0], y, SIDE[face][1], (B.COCOA | ((face | (st << COCOA_BITS.STAGE_SHIFT)) << 8)) >>> 0, false);
        }
      }
      return;
    }
    if (kind === K.SMALL) {
      const th = 3 + ((rnd(1, 2) * 3) | 0);
      for (let y = 0; y < th; y++) put(0, y, 0, JLOG(JUNGLE_SMALL_W), true);
      _jBlob(put, rnd, 0, th, 0, 2.6, 1.6, 500);
      return;
    }
    // BENT: a stump that turns hard into a level limb; the crown out at its end
    const th = 2 + ((rnd(1, 2) * 3) | 0);
    for (let y = 0; y < th; y++) put(0, y, 0, JLOG(JUNGLE_TRUNK_W - 2), true);
    const a0 = rnd(2, 5) * Math.PI * 2, arms = rnd(3, 5) < 0.35 ? 2 : 1;
    for (let l = 0; l < arms; l++) {
      const a = a0 + l * (Math.PI + (rnd(4 + l, 1) - 0.5) * 0.8), ca = Math.cos(a), sa = Math.sin(a);
      const len = (l ? 2 : 3) + ((rnd(5 + l, 3) * 2) | 0), rise = 1 + ((rnd(6 + l, 3) * 2) | 0);
      const tip = _jLimb(put, 0, th - 1, 0, ca, sa, len, rise, JUNGLE_LIMB_W + 2);
      _jDisc(put, rnd, tip[0] + 0.5, tip[1], tip[2] + 0.5, l ? 2.2 : 2.8, 600 + l * 30);
      _jDisc(put, rnd, tip[0] + 0.5, tip[1] + 1, tip[2] + 0.5, l ? 1.6 : 2.2, 620 + l * 30);
      put(tip[0], tip[1] + 2, tip[2], JLEAF, false);
    }
  }
});
