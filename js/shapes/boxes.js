'use strict';
/* shapes/boxes.js: what a shaped cell IS. shapeOfVal (which shape a value has), solidVal and opaqueVal, the boxes of
   panes, fences and walls and how they join their neighbours, lightDim, and shapeBoxesAt (the boxes to draw and
   collide with). Ask these about a whole cell value; never test the bare id.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* which shape a value is in, or null (a full block, or no shapes at all). Each range only counts for a block
     that takes that shape: grass takes a cover, and its snowy variant (1) must not read as a slab. */
  const SHAPE_FAMILY = [];                       // high nibble -> family name
  SHAPE_FAMILY[SHAPE_SLAB      >> 4] = 'slab';
  SHAPE_FAMILY[SHAPE_STAIRS    >> 4] = 'stairs';
  SHAPE_FAMILY[SHAPE_PANE      >> 4] = 'pane';
  SHAPE_FAMILY[SHAPE_FENCE     >> 4] = 'fence';
  SHAPE_FAMILY[SHAPE_LAYER     >> 4] = 'layer';
  SHAPE_FAMILY[SHAPE_LAYER_MIX >> 4] = 'layer';  // a mixed stack is still a layer, just with a list beside it
  SHAPE_FAMILY[SHAPE_COVER     >> 4] = 'cover';
  SHAPE_FAMILY[SHAPE_WALL      >> 4] = 'wall';
  SHAPE_FAMILY[SHAPE_DOOR      >> 4] = 'door';   // 0.842, hinged left
  SHAPE_FAMILY[SHAPE_DOOR_R    >> 4] = 'door';   // ...and right
  SHAPE_FAMILY[SHAPE_PLATE     >> 4] = 'plate';  // the pressure plate
  SHAPE_FAMILY[SHAPE_SIGN      >> 4] = 'sign';
  SHAPE_FAMILY[SHAPE_GATE      >> 4] = 'gate';   // a fence or a wall made a gate (blocks/gates.js)
  SHAPE_FAMILY[SHAPE_LADDER    >> 4] = 'ladder'; // ...and the slope: the same nibble with SLOPE_BIT (below)
  function shapeOfVal(v) {
    const va = (v >> 8) & 255, p = PROPS[v & 255];
    if (!va || !p || !p.shapes) return null;
    let fam = SHAPE_FAMILY[va >> 4];
    if (fam === 'ladder' && (va & SLOPE_BIT)) fam = 'slope';
    return fam && p.shapes[fam] ? fam : null;
  }
  const isDoorVal = (v) => shapeOfVal(v) === 'door';   // 0.842
  const PANE_BOX = [[0, 0, 0.375, 1, 1, 0.625], [0.375, 0, 0, 0.625, 1, 1]];
  /* Fence: our own picket fence. A square post with a pointed tip; toward each fence of the same
     block beside it, an ARM — a low rail, a high rail and a thin picket standing through both; toward one
     that only touches corner-to-corner, the same arm stepped across the diagonal (the mesher draws only
     axis-aligned boxes). A diagonal is left out when either side between already holds such a fence, since
     the corner joins through that one. Arms are authored once toward +X and +X+Z, in sixteenths, and
     mirrored for the rest. Collision is a separate set 1.5 blocks tall — post and arms — so a fence cannot
     be jumped; the model and the crosshair keep the real one-block shape. */
  const _s16 = (b) => b.map(n => n / 16);
  const _mirX = (b) => [16 - b[3], b[1], b[2], 16 - b[0], b[4], b[5]];
  const _mirZ = (b) => [b[0], b[1], 16 - b[5], b[3], b[4], 16 - b[2]];
  const _swapXZ = (b) => [b[2], b[1], b[0], b[5], b[4], b[3]];
  const FENCE_POST = [[6, 0, 6, 10, 14, 10], [7, 14, 7, 9, 16, 9]].map(_s16);
  const FENCE_POST_COLL = _s16([6, 0, 6, 10, 24, 10]);
  const FENCE_ARM  = [[10, 4, 7, 16, 6, 9], [10, 10, 7, 16, 12, 9], [12, 2, 7.5, 14, 14, 8.5]];
  const FENCE_DIAG = [[10, 4, 10, 13, 6, 13], [13, 4, 13, 16, 6, 16], [10, 10, 10, 13, 12, 13], [13, 10, 13, 16, 12, 16],
                      [12.5, 2, 12.5, 13.5, 14, 13.5]];
  const FENCE_ARM_COLL  = [[10, 0, 7, 16, 24, 9]];
  const FENCE_DIAG_COLL = [[10, 0, 10, 13, 24, 13], [13, 0, 13, 16, 24, 16]];
  const FENCE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const _fenceArm = (list, dx, dz) => list.map(b => {
    if (dx && dz) { if (dx < 0) b = _mirX(b); if (dz < 0) b = _mirZ(b); }
    else if (dz) { b = _swapXZ(b); if (dz < 0) b = _mirZ(b); }
    else if (dx < 0) b = _mirX(b);
    return _s16(b);
  });
  /* A joining shape (fence 0.7841, wall 0.787): a post, and an arm toward each neighbour of the same block in
     the same shape, diagonals included. Authored toward +X and +X+Z in sixteenths and mirrored for the rest.
     `slope`: the boxes that go up or down a step (joinSlopesAt), one set for each of the four straight sides: from the
     post's middle to the cell's edge, so the steps of two neighbours meet at their edge and each meets its post. */
  const _joinSpec = (post, postColl, arm, diag, armColl, diagColl, slope) => ({
    post: post.map(_s16), postColl: postColl.map(_s16),
    mesh: FENCE_DIRS.map(([dx, dz], d) => _fenceArm(d < 4 ? arm : diag, dx, dz)),
    coll: FENCE_DIRS.map(([dx, dz], d) => _fenceArm(d < 4 ? armColl : diagColl, dx, dz)),
    slope: FENCE_DIRS.slice(0, 4).map(([dx, dz]) => _fenceArm(slope, dx, dz)),
  });
  // a fence's step is its two rails, without the picket
  const FENCE_SPEC = _joinSpec([[6, 0, 6, 10, 14, 10], [7, 14, 7, 9, 16, 9]], [[6, 0, 6, 10, 24, 10]],
                               FENCE_ARM, FENCE_DIAG, FENCE_ARM_COLL, FENCE_DIAG_COLL, [[8, 4, 7, 16, 6, 9], [8, 10, 7, 16, 12, 9]]);
  // a fence with a fence, a wall or a gate standing on it: its post goes up whole, without the tip (no neck between them)
  const FENCE_POST_TALL = [_s16([6, 0, 6, 10, 16, 10])];
  // the wall: a 10 px post and 8 px thick arms, all the full block tall, with no gaps; collision 1.5 tall
  const WALL_SPEC = _joinSpec([[3, 0, 3, 13, 16, 13]], [[3, 0, 3, 13, 24, 13]],
                              [[13, 0, 4, 16, 16, 12]], [[11, 0, 11, 16, 16, 16]],
                              [[13, 0, 4, 16, 24, 12]], [[11, 0, 11, 16, 24, 16]], [[8, 0, 4, 16, 16, 12]]);
  /* what a fence or a wall joins: any block in its shape (a birch fence joins a spruce one, a stone wall a brick one), or
     a gate made of that shape (a fence gate, a wall gate). `id` is the asker's block, kept for those who pass it. */
  const gateFamily = (n) => ((((n >> 8) & 255) & GATE_WALL) ? 'wall' : 'fence');
  function joinsAs(n, id, family) {
    const s = shapeOfVal(n);
    return s === family || (s === 'gate' && gateFamily(n) === family);
  }
  /* What a neighbour says to a join toward it along d (FENCE_DIRS): one whose joins were set by hand (the wrench:
     JOIN_MANUAL) takes it only if its own arm back this way is on, whatever the blocks (so a join set on one side, or
     taken off it, holds on both); any other as joinsAs says. JOIN_BACK: the straight side across from each. */
  const JOIN_BACK = [1, 0, 3, 2];
  const isJoinFamily = (s) => s === 'fence' || s === 'wall';
  function joinTakes(n, d, id, family) {
    if ((n & JOIN_MANUAL) && isJoinFamily(shapeOfVal(n))) return d < 4 && (((n >>> JOIN_ARMS_SHIFT) >> JOIN_BACK[d]) & 1) === 1;
    return joinsAs(n, id, family);
  }
  // the joins a fence or a wall makes by itself, one a direction of FENCE_DIRS (rl: as joinBoxesAt's)
  function autoJoins(family, g, x, y, z, v, rl = null) {
    const id = v & 255;
    return FENCE_DIRS.map(([dx, dz], d) => joinTakes(g(x + dx, y, z + dz), d, id, family)
                                           || (!!rl && joinTakes(rl(x + dx, y, z + dz), d, id, family)));
  }
  /* A WALL STANDING TOWARD ONE SIDE (WALL_BACK | facing): every box moved WALL_BACK_PX that way and cut at the cell's edge,
     and a box that reached the other edge still reaching it, so the arm that way meets the wall beside it */
  const WALL_FACE = [[2, 1], [2, -1], [0, 1], [0, -1]];        // facing -> [axis (0 x, 2 z), sign]
  function _wallBack(boxes, f) {
    const [a, s] = WALL_FACE[f], d = s * WALL_BACK_PX / 16, out = [];
    for (const b of boxes) {
      const o = b.slice();
      o[a] = b[a] <= 0 ? 0 : Math.min(1, Math.max(0, b[a] + d));
      o[a + 3] = b[a + 3] >= 1 ? 1 : Math.min(1, Math.max(0, b[a + 3] + d));
      if (o[a + 3] - o[a] > 1e-6) out.push(o);
    }
    return out;
  }
  // a whole block (stone, glass, leaves, a mixed slab...): a step's slope or a corner join never passes through one
  const _wholeBlock = (n) => {
    const p = PROPS[n & 255];
    return !!(n & 255) && !!p && p.model === 'cube' && (p.solid || p.pass === 1) && !shapeOfVal(n);
  };
  // the fence, wall or gate a cell holds for a join, and how high it stands: its own block at 0, else a rail lying in it
  function _joinCell(g, rl, x, y, z) {
    const n = g(x, y, z), s = shapeOfVal(n);
    if (!rl || s === 'fence' || s === 'wall' || s === 'gate') return [n, 0];
    const r = rl(x, y, z);
    return r && isJoinFamily(shapeOfVal(r)) ? [r, railLift(n, r)] : [n, 0];   // a ladder lying there is not joined
  }
  /* WHAT A FENCE OR A WALL JOINS: { j: an arm on its own level toward each of FENCE_DIRS, steps: [[d, dy], ...] the straight
     sides it joins with a slope rising dy blocks over a block }. `lift`: how high it stands (a rail on a slab or a step).
       the icon pose     both ways along X
       set by hand       its JOIN_MANUAL arms, straight, toward anything; no steps
       on its own        a level neighbour that takes the join (joinTakes): an arm, or a half step where one stands higher or
                         lower than the other (a fence on a slab beside one on the floor); with none, one of its shape (or a
                         gate of it) a step up or down, not one set by hand, unless one of the two joins on its own level
                         toward the other: the cell over (or under) this one is that level's (a stack joins on its own
                         levels), or a whole block stands in a cell between them (over the lower one or under the higher
                         one: the slope would go through it). Both of a pair ask the same, so each draws its half; a gate
                         draws none, so the step toward one is drawn whole on this side (twice the rise over its half
                         block), down or up to the gate. */
  function joinLinks(family, g, x, y, z, v, rl = null, lift = 0) {
    const va = (v >> 8) & 255, id = v & 255;
    if (va === (family === 'wall' ? SHAPE_WALL : SHAPE_FENCE) + 1) return { j: FENCE_DIRS.map(([, dz]) => dz === 0), steps: [] };
    if (v & JOIN_MANUAL) {
      const arms = (v >>> JOIN_ARMS_SHIFT) & 15;
      return { j: FENCE_DIRS.map((_, d) => d < 4 && ((arms >> d) & 1) === 1), steps: [] };
    }
    const j = [false, false, false, false, false, false, false, false], steps = [];
    const kind = (n) => !(n & JOIN_MANUAL) && joinsAs(n, id, family);
    const whole = (n) => shapeOfVal(n) === 'gate' ? 2 : 1;           // a step toward a gate: drawn all on this side
    for (let d = 0; d < 8; d++) {
      const [n, nl] = _joinCell(g, rl, x + FENCE_DIRS[d][0], y, z + FENCE_DIRS[d][1]);
      if (!joinTakes(n, d, id, family)) continue;
      const level = Math.abs(nl - lift) <= 0.1;
      if (level) j[d] = true;
      else if (d < 4) steps.push([d, whole(n) * (nl - lift)]);
    }
    for (let d = 0; d < 4; d++) {
      if (j[d] || steps.some(s => s[0] === d)) continue;
      const dx = FENCE_DIRS[d][0], dz = FENCE_DIRS[d][1];
      for (const dy of [1, -1]) {
        if (joinTakes(_joinCell(g, rl, x, y + dy, z)[0], JOIN_BACK[d], id, family)) continue;
        // a whole block between the two (over the lower one or under the higher one): no slope through it
        if (_wholeBlock(g(x, y + dy, z)) || _wholeBlock(g(x + dx, y, z + dz))) continue;
        const [n, nl] = _joinCell(g, rl, x + dx, y + dy, z + dz);
        if (kind(n)) { steps.push([d, whole(n) * (dy + nl - lift)]); break; }
      }
    }
    return { j, steps };
  }
  /* The boxes of a fence or a wall. rl: (x, y, z) -> a fence or wall lying in another block's cell there (a rail,
     blocks/rails.js), or 0: joins see those too. `lift`: how high it stands (joinLinks). A JOIN_MANUAL value (the wrench) has
     straight arms only, where its bits say, toward anything at all; one beside it that joins by itself follows it (joinTakes).
     A wall a step runs THROUGH (a step up one way, down the other) has no post: its steps meet in its middle, the wall a slope
     from end to end; one at a peak or a dip keeps it. A corner join is drawn by the mesher as rails turned 45 degrees
     (joinDiagsAt, emitDiagRails): only its collision is boxes here. */
  function joinBoxesAt(spec, family, base, g, x, y, z, v, coll, rl = null, lift = 0) {
    const va = (v >> 8) & 255, pose = va === base + 1;
    const { j, steps } = joinLinks(family, g, x, y, z, v, rl, lift);
    const tall = family === 'fence' && !pose && !coll && (() => {
      const s = shapeOfVal(g(x, y + 1, z));
      return s === 'fence' || s === 'wall' || s === 'gate';
    })();
    const dy = (d) => { const s = steps.find(s => s[0] === d); return s ? s[1] : 0; };
    const through = family === 'wall' && !coll && [0, 2].some(d => dy(d) * dy(d + 1) < 0);
    const out = through ? [] : (coll ? spec.postColl : tall ? FENCE_POST_TALL : spec.post).slice();
    for (let d = 0; d < 8; d++) {
      if (!j[d] || (d >= 4 && (!coll || _cornerOut(g, rl, x, y, z, d, j, v & 255, family)))) continue;
      for (const b of (coll ? spec.coll : spec.mesh)[d]) out.push(b);
    }
    // a step collides as a straight arm: the arm of the one a step up starts where this one's ends, so no gap opens
    if (coll) for (const [d] of steps) for (const b of spec.coll[d]) out.push(b);
    const res = family === 'wall' && !pose && (va & WALL_BACK) ? _wallBack(out, va & 3) : out;
    // ...and as the slope itself, where it reaches under or over the cell (moved already, as drawn)
    if (coll && steps.length) for (const b of _stepBoxes(family, v, steps, 0)) res.push(b);
    return res;
  }
  /* A STEP's slope (joinLinks' `steps`): the mesher draws spec.slope risen by `dy` over a block (emitSlantBox,
     chunks/mesher-models.js); it collides as a straight arm and as boxes following it (_stepBoxes), which the crosshair
     sees too (joinPickBoxes). [[d (0 +X, 1 -X, 2 +Z, 3 -Z), dy], ...] */
  function joinSlopesAt(family, g, x, y, z, v, rl = null, lift = 0) {
    return joinLinks(family, g, x, y, z, v, rl, lift).steps;
  }
  /* A CORNER JOIN's rails (the directions d of FENCE_DIRS from 4 on that it draws), turned 45 degrees from the post's
     middle to the cell's corner, where the neighbour's begin (emitDiagRails, chunks/mesher-models.js). A fence joins on its
     sides and on its corners both; a corner is left out (_cornerOut) where
       a whole block stands in one of the two cells between (stone, glass, leaves, a mixed slab: the rail would cut its edge)
       it already joins THROUGH a cell between, one that both ends join (an L of three fences, two rows side by side)
     Both are asked from both ends the same, so both draw it or neither. DIAG_RAILS: [bottom, top, half thickness] in
     blocks, by family. */
  const DIAG_RAILS = { fence: [[4 / 16, 6 / 16, 1 / 16], [10 / 16, 12 / 16, 1 / 16]], wall: [[0, 1, 4 / 16]] };
  function _cornerOut(g, rl, x, y, z, d, j, id, family) {
    const dx = FENCE_DIRS[d][0], dz = FENCE_DIRS[d][1];
    if (_wholeBlock(g(x + dx, y, z)) || _wholeBlock(g(x, y, z + dz))) return true;
    // does the one at the corner join the cell between, along its own side (dir from it: 0 +X, 1 -X, 2 +Z, 3 -Z)
    const far = (bx, bz, dir) => joinTakes(_joinCell(g, rl, bx, y, bz)[0], dir, id, family);
    return (j[dx > 0 ? 0 : 1] && far(x + dx, z, dz > 0 ? 3 : 2)) || (j[dz > 0 ? 2 : 3] && far(x, z + dz, dx > 0 ? 1 : 0));
  }
  const _diagsOf = (family, g, x, y, z, v, rl, j) => {
    const out = [];
    for (let d = 4; d < 8; d++) if (j[d] && !_cornerOut(g, rl, x, y, z, d, j, v & 255, family)) out.push(d);
    return out;
  };
  function joinDiagsAt(family, g, x, y, z, v, rl = null, lift = 0) {
    return _diagsOf(family, g, x, y, z, v, rl, joinLinks(family, g, x, y, z, v, rl, lift).j);
  }
  // how far a wall standing toward one side (WALL_BACK) is moved off the cell's middle, [x, z] in blocks; [0, 0] for the rest
  function wallShift(family, v) {
    const va = (v >> 8) & 255;
    if (family !== 'wall' || !(va & WALL_BACK) || va === SHAPE_WALL + 1) return [0, 0];
    const [a, s] = WALL_FACE[va & 3], m = s * WALL_BACK_PX / 16;
    return a === 0 ? [m, 0] : [0, m];
  }
  /* WHAT THE CROSSHAIR SEES of a fence's or a wall's steps and corner joins, which the mesher draws and its shape boxes leave
     out (rayBoxesAt, chunks/block-access.js; a rail's railBoxesAt, blocks/rails.js). In blocks, `lift` added.
       a step         PICK_STEPS boxes along the slope, each as high as the slope is over its stretch (the envelope of
                      spec.slope): they reach under the cell (a step down) or over it (up), so raycastVoxel asks the cells
                      over and under the one a ray is in. They collide too (joinBoxesAt).
       a corner join  PICK_STEPS boxes along the diagonal, each round its stretch and as thick as the rails */
  const PICK_STEPS = 4;
  function _stepBoxes(family, v, steps, lift) {
    const out = [];
    for (const [d, dy] of steps) {
      const ax = d < 2 ? 0 : 2, sg = d === 0 || d === 2 ? 1 : -1;
      const rise = (a) => dy * (sg > 0 ? a - 0.5 : 0.5 - a);         // as emitSlantBox's
      const e = [1, 1, 1, 0, 0, 0];
      for (const b of slopeBoxesOf(family, v, d))
        for (let k = 0; k < 3; k++) { e[k] = Math.min(e[k], b[k]); e[k + 3] = Math.max(e[k + 3], b[k + 3]); }
      for (let k = 0; k < PICK_STEPS; k++) {
        const a0 = e[ax] + (e[ax + 3] - e[ax]) * k / PICK_STEPS, a1 = e[ax] + (e[ax + 3] - e[ax]) * (k + 1) / PICK_STEPS;
        const r0 = rise(a0), r1 = rise(a1), o = e.slice();
        o[ax] = a0; o[ax + 3] = a1;
        o[1] = e[1] + lift + Math.min(r0, r1); o[4] = e[4] + lift + Math.max(r0, r1);
        out.push(o);
      }
    }
    return out;
  }
  function _diagBoxes(family, v, diags, lift) {
    if (!diags.length) return [];
    const [sx, sz] = wallShift(family, v), cl = (n) => Math.min(1, Math.max(0, n)), out = [];
    let y0 = 1, y1 = 0, h = 0;
    for (const [a, b, t] of DIAG_RAILS[family]) { y0 = Math.min(y0, a); y1 = Math.max(y1, b); h = Math.max(h, t); }
    for (const d of diags) {
      const dx = FENCE_DIRS[d][0], dz = FENCE_DIRS[d][1];
      for (let k = 0; k < PICK_STEPS; k++) {
        const s0 = 0.5 * k / PICK_STEPS, s1 = 0.5 * (k + 1) / PICK_STEPS;
        const xa = 0.5 + sx + dx * s0, xb = 0.5 + sx + dx * s1, za = 0.5 + sz + dz * s0, zb = 0.5 + sz + dz * s1;
        const o = [cl(Math.min(xa, xb) - h), y0 + lift, cl(Math.min(za, zb) - h), cl(Math.max(xa, xb) + h), y1 + lift, cl(Math.max(za, zb) + h)];
        if (o[3] - o[0] > 1e-6 && o[5] - o[2] > 1e-6) out.push(o);
      }
    }
    return out;
  }
  function joinPickBoxes(family, g, x, y, z, v, rl = null, lift = 0) {
    const { j, steps } = joinLinks(family, g, x, y, z, v, rl, lift);
    const out = _stepBoxes(family, v, steps, lift);
    for (const b of _diagBoxes(family, v, _diagsOf(family, g, x, y, z, v, rl, j), lift)) out.push(b);
    return out;
  }
  // a step's boxes as the mesher draws them: spec.slope, moved as its wall is (WALL_BACK)
  function slopeBoxesOf(family, v, d) {
    const va = (v >> 8) & 255, bx = (family === 'wall' ? WALL_SPEC : FENCE_SPEC).slope[d];
    return family === 'wall' && (va & WALL_BACK) ? _wallBack(bx, va & 3) : bx;
  }
  /* A GATE (blocks/gates.js), across its line's middle and 2/16 thick: a stile at each end, two rails (a wall gate three,
     and as tall as a wall), and a picket in the middle of a whole panel. Alone it opens as two halves from the middle, each
     swung round its own end; one of a pair (another gate of its block the same way beside it along its line) is one whole
     panel hinged at its far end. Open, it lies along the side it swung to (GATE_SWING_POS or not), and nothing collides
     with it; shut, it collides 1.5 tall as a fence. Authored along X in sixteenths. */
  const GATE_RAILS = { fence: [[4, 6], [10, 12]], wall: [[2, 4], [7, 9], [12, 14]] };
  const GATE_FOOT = { fence: 2, wall: 0 }, GATE_TOP = { fence: 14, wall: 16 };
  function _gatePanel(a0, a1, kind, picket) {
    const lo = GATE_FOOT[kind], hi = GATE_TOP[kind];
    const out = [[a0, lo, 7, a0 + 2, hi, 9], [a1 - 2, lo, 7, a1, hi, 9]];
    for (const [r0, r1] of GATE_RAILS[kind]) out.push([a0 + 2, r0, 7, a1 - 2, r1, 9]);
    if (picket) { const m = (a0 + a1) / 2; out.push([m - 1, lo, 7, m + 1, hi, 9]); }
    return out;
  }
  // a gate stays level on a slope: the fence or wall a step from it draws the whole step down (or up) to it (joinLinks)
  function gateBoxes(g, x, y, z, v, coll) {
    const va = (v >> 8) & 255, alongZ = (va & GATE_AXIS_Z) !== 0, open = (va & GATE_OPEN) !== 0;
    const toXZ = (b) => (alongZ ? [b[2], b[1], b[0], b[5], b[4], b[3]] : b).map(n => n / 16);
    if (coll) return open ? NO_BOXES : [toXZ([0, 0, 6, 16, 24, 10])];
    const kind = (va & GATE_WALL) ? 'wall' : 'fence', s = (va & GATE_SWING_POS) ? 1 : -1;
    const mate = (k) => {
      const n = alongZ ? g(x, y, z + k) : g(x + k, y, z);
      return (n & 255) === (v & 255) && shapeOfVal(n) === 'gate' && ((((n >> 8) & 255) & GATE_AXIS_Z) !== 0) === alongZ;
    };
    const pos = mate(1), neg = mate(-1);
    // [a0, a1, hinged at a0]: one of a pair is a whole panel, a gate alone two halves
    const panels = pos !== neg ? [[0, 16, pos]] : [[0, 8, true], [8, 16, false]];
    const out = [];
    for (const [a0, a1, h0] of panels) {
      const len = a1 - a0;
      if (!open) { for (const b of _gatePanel(a0, a1, kind, len > 8)) out.push(toXZ(b)); continue; }
      const aLo = h0 ? a0 : a1 - 2;                   // its thickness now lies along the line, at the hinge
      for (const [u0, y0, t0, u1, y1, t1] of _gatePanel(0, len, kind, len > 8)) {
        const c0 = s > 0 ? 8 + u0 : 8 - u1, c1 = s > 0 ? 8 + u1 : 8 - u0;
        out.push(toXZ([aLo + t0 - 7, y0, c0, aLo + t1 - 7, y1, c1]));
      }
    }
    return out;
  }
  /* A FENCE OR A WALL LYING IN ANOTHER BLOCK'S CELL, a rail (the page keeps it beside the cell: RAIL_OVER, blocks/rails.js):
       a fence on a bottom slab or upright stairs   stands on the slab or the stair's lower step, RAIL_LIFT up
       a fence in a top or a vertical slab          from the cell's floor, half of it inside the slab: posts under a top slab,
                                                    a half block with a fence's pattern on its face
       a wall in upright stairs                     along one side of them (WALL_BACK | facing toward it), RAIL_LIFT up
       a ladder in a slab, stairs, a carpet or a layer stack, a plant   against its wall as anywhere, through what the cell
                                                    holds (its boxes are a ladder's own: LADDER_BOX drawn, the page's crosshair
                                                    and collision LADDER_PICK and LADDER_COLL, blocks/rails.js)
     railHostOk: may `host` hold the rail `rail`; railLift: how high it stands there. One from the floor is kept RAIL_EPS
     inside its cell (none of its faces on the slab's: they flickered), and collides no higher than its cell (it would stand
     up through the slab's top). */
  const RAIL_LIFT = 0.5, RAIL_EPS = 1 / 256;
  function railHostOk(host, rail) {
    const hs = shapeOfVal(host), rs = shapeOfVal(rail), hva = (host >> 8) & 255, hp = PROPS[host & 255];
    if (rs === 'fence') return hs === 'slab' || (hs === 'stairs' && !(hva & 4));
    if (rs === 'wall') return hs === 'stairs' && !(hva & 4);
    if (rs === 'ladder') return !!hp && !!(host & 255) && (hs === 'slab' || hs === 'stairs' || hs === 'layer'
                                                          || (!hs && hp.model === 'cross' && !hp.solid));
    return false;
  }
  const railLift = (host, rail) => shapeOfVal(rail) === 'ladder' ? 0
                                 : shapeOfVal(host) === 'slab' && (((host >> 8) & 255) & ROT_MASK) !== 0 ? 0 : RAIL_LIFT;
  function railOverBoxes(g, x, y, z, rail, coll, rl) {
    const s = shapeOfVal(rail), lift = railLift(g(x, y, z), rail);
    if (s === 'ladder') return (coll ? LADDER_COLL : LADDER_BOX)[((rail >> 8) & 255) & 3];
    if (s !== 'fence' && s !== 'wall') return null;
    const bx = s === 'fence' ? joinBoxesAt(FENCE_SPEC, 'fence', SHAPE_FENCE, g, x, y, z, rail, coll && lift > 0, rl, lift)
                             : joinBoxesAt(WALL_SPEC, 'wall', SHAPE_WALL, g, x, y, z, rail, coll && lift > 0, rl, lift);
    if (!lift) return bx.map(b => b.map(n => Math.min(1 - RAIL_EPS, Math.max(RAIL_EPS, n))));
    return bx.map(b => [b[0], b[1] + lift, b[2], b[3], b[4] + lift, b[5]]);
  }
  /* The sign's boxes (shapes/shapes.js), authored facing +Z in sixteenths and turned for the rest: SIGN_BOX[mount][facing].
     Standing, the board on a post; on a wall, flat against the block behind it; hanging, under two short sticks. */
  const _SIGN_AUTHORED = [
    [[0, 7, 7.25, 16, 15, 8.75], [7.25, 0, 7.25, 8.75, 7, 8.75]],
    [[0, 4, 0, 16, 12, 1.5]],
    [[0, 1, 7.25, 16, 9, 8.75], [2.25, 9, 7.25, 3.75, 16, 8.75], [12.25, 9, 7.25, 13.75, 16, 8.75]],
  ];
  const SIGN_BOX = _SIGN_AUTHORED.map(list => [
    list, list.map(_mirZ), list.map(_swapXZ), list.map(b => _mirX(_swapXZ(b))),   // +Z, -Z, +X, -X
  ].map(l => l.map(_s16)));
  const COVER_BOX = [[0, 0, 0, 1, 0.125, 1], [0, 0.875, 0, 1, 1, 1], [0, 0, 0, 0.125, 1, 1],
                     [0.875, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 0.125], [0, 0, 0.875, 1, 1, 1]].map(b => [b]);
  // opacity of a VALUE: a shaped block lets light and its neighbours' faces through; its full block does not
  const opaqueVal = (v) => {
    const p = PROPS[v & 255];
    return !!p && !!p.opaque && !(((v >> 8) & 255) && p.shapes && shapeOfVal(v))
      && !(slabMixed(v) && ((v >> 8) & SLAB_MIX_SEE));                // a mixed slab with a glass half
  };
  /* ...but it is not nothing either: light LEAVING a shaped cell of an opaque block loses this many levels
     more than the usual one, so a slab roof shades what is under it and a stack of layers darkens by its depth.
     The cell itself keeps the light that reached it, so a slab's own top still reads as lit. Glass, leaves and
     the like are see-through as full blocks and stay so as shapes. */
  const SHAPE_DIM = { slab: 4, stairs: 6, pane: 2, fence: 1, wall: 2, cover: 2, gate: 1, slope: 4 };
  const lightDim = (v) => {
    const va = (v >> 8) & 255;
    if (!va) return 0;
    const p = PROPS[v & 255];
    if (!p || !p.opaque || !p.shapes) return 0;
    /* Layer stacks hold nothing back (0.819 dimmed them by depth): snow, litter, ash and sand piles change
       all the time — falling, melting, laid by the snowline — and every change of a dimming cell relit its whole
       neighbourhood, which is what made streaming stutter. */
    if (layerCount(v)) return 0;
    const s = shapeOfVal(v);
    return s ? (SHAPE_DIM[s] || 0) : 0;
  };
  /* LADDER: two rails and four rungs against the side its back is on (bits 0-1; authored here against -Z, side 0), like wall
     bars: stout rails, thin round rungs. What collides is a thin board at its back, LADDER_COLL (a body
     stands in front of it and climbs: player/movement.js; creatures too, entities/physics.js). The crosshair takes it as
     one board, LADDER_PICK (rayBoxesAt, chunks/block-access.js), so a click between the rungs never reaches the block
     behind. With WALL_PAIR (bit 2, blocks/glow-and-storage.js) a second ladder stands on the next side round, in the
     corner: its rails and rungs stop at the first one's front, and its pick board is the second (bi 1). */
  /* Wall bars: the two posts narrow to the front (RAIL_W) and deep to the side, from half a sixteenth off the wall out to
     LADDER_DEPTH; the rungs thin dowels (RUNG_T square) through the posts' sides at the middle of their depth, out a
     sixteenth past them on both sides (in 16ths; LADDER_COLL_T: the board a body runs into) */
  const LADDER_DEPTH = 3.5, LADDER_COLL_T = 3.5, RUNG_T = 1, RAIL_W = 1.5;
  const _rungZ = (0.5 + LADDER_DEPTH - RUNG_T) / 2;          // the rung's front-to-back place: the posts' middle
  const _LADDER_AUTH = [[1.5, 0, 0.5, 1.5 + RAIL_W, 16, LADDER_DEPTH], [14.5 - RAIL_W, 0, 0.5, 14.5, 16, LADDER_DEPTH],
                        ...[2, 6, 10, 14].map(y => [0.5, y, _rungZ, 15.5, y + RUNG_T, _rungZ + RUNG_T])];
  const _ladderTurn = (b, s) => s === 0 ? b : s === 1 ? _mirZ(b) : s === 2 ? _swapXZ(b) : _mirX(_swapXZ(b));
  /* the boxes of side s, and in a corner the second ladder's: `cut` = the ones cut back to the first one's front (one cut to
     nothing, the second's post in the corner, is left out: the first's post stands there) */
  const _ladderSet = (auth, cut) => {
    const out = [];
    for (let va = 0; va < 8; va++) {
      const s = va & 3, one = auth.map(b => _ladderTurn(b, s));
      if (va & WALL_PAIR) {
        const n = WALL_NEXT[s];
        auth.forEach((b, i) => {
          const c = cut(i) ? wallClip(_ladderTurn(b, n), s, LADDER_DEPTH, 16) : _ladderTurn(b, n);
          if (c[0] < c[3] && c[1] < c[4] && c[2] < c[5]) one.push(c);
        });
      }
      out[va] = one.map(_s16);
    }
    return out;
  };
  const LADDER_BOX = _ladderSet(_LADDER_AUTH, () => true);   // the second's rails too: they would stand in the first's
  const LADDER_PICK = _ladderSet([[0.5, 0, 0, 15.5, 16, LADDER_DEPTH]], () => true);
  const LADDER_COLL = _ladderSet([[0, 0, 0, 16, 16, LADDER_COLL_T]], () => false);
  /* A CORNER OF TWO DIFFERENT BLOCKS: an oak ladder and an iron one, a ladder and a vine, a vine and a glow vine. The cell is
     the one block (its id, look, variant: a ladder's shape, or a vine's side, with WALL_PAIR); bits 25-29 (WALL_MATE_SHIFT)
     name the other from WALL_MATES (0: the same block as the cell's, as above), always its plain block; bit 30
     (WALL_MATE_FIRST) puts that other one on the corner's first side and the cell's own on the second. Nothing else in a
     ladder's or a vine's cell uses those bits. WALL_MATES' numbers are in the saves: append only. A ladder beside a vine
     never overlaps it, so only two ladders cut the second back (the halves of the corner sets above). */
  const WALL_MATE_SHIFT = 25, WALL_MATE_FIRST = 1 << 30;
  const WALL_MATES = [0, B.VINE, B.GLOW_VINE, B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.RIME_PLANKS, B.PALM_PLANKS,
                      B.ACACIA_PLANKS, B.JUNGLE_PLANKS, B.IRON_BLOCK, B.STONE, B.COBBLE, B.GRANITE, B.MARBLE, B.LIMESTONE,
                      B.DOLOMITE, B.SANDSTONE, B.RED_SANDSTONE, B.PINK_SANDSTONE];
  // a ladder or a vine plate (blocks/glow-and-storage.js) as a cell value
  const isWallPlateVal = (v) => shapeOfVal(v) === 'ladder' || PROPS[v & 255]?.model === 'wall';
  // the other block of a corner of two (its WALL_MATES number), 0 for none
  const wallMateOf = (v) => isWallPlateVal(v) && (((v >> 8) & 255) & WALL_PAIR) ? (v >>> WALL_MATE_SHIFT) & 31 : 0;
  // plate block `id` alone on `side`: a vine's (or glow vine's) side, or a ladder of that block
  const wallPlateVal = (id, side) => (PROPS[id]?.model === 'wall' ? id | (side << 8) : id | ((SHAPE_LADDER | side) << 8)) >>> 0;
  // a corner's two, each as a value alone, in side order (its first side, then the one a quarter round); the cell's own
  // keeps its look, water and paid need
  function wallPairParts(v) {
    const s = (v >> 8) & 3, n = WALL_NEXT[s], m = (v >>> WALL_MATE_SHIFT) & 31;
    const own = (v & ~(7 << 8) & ~(31 << WALL_MATE_SHIFT) & ~WALL_MATE_FIRST) >>> 0;
    if (!m) return [(own | (s << 8)) >>> 0, (own | (n << 8)) >>> 0];
    return (v & WALL_MATE_FIRST) ? [wallPlateVal(WALL_MATES[m], s), (own | (n << 8)) >>> 0]
                                 : [(own | (s << 8)) >>> 0, wallPlateVal(WALL_MATES[m], n)];
  }
  // ...and their boxes, [first's, second's]: kind 0 drawn, 1 the crosshair's, 2 collision
  // (the first ladder's boxes are all there, as many as authored; the rest are the second's)
  const _LADDER_HALVES = [[LADDER_BOX, _LADDER_AUTH.length], [LADDER_PICK, 1], [LADDER_COLL, 1]].map(([set, h]) =>
    [0, 1, 2, 3].map(s => { const all = set[WALL_PAIR | s]; return [all.slice(0, h), all.slice(h)]; }));
  function wallPairBoxes(v, kind) {
    const s = (v >> 8) & 3, n = WALL_NEXT[s], [a, b] = wallPairParts(v);
    const la = shapeOfVal(a) === 'ladder', lb = shapeOfVal(b) === 'ladder', LS = [LADDER_BOX, LADDER_PICK, LADDER_COLL][kind];
    if (la && lb) return _LADDER_HALVES[kind][s];
    const vine = (k) => kind === 2 ? NO_BOXES : [WALL_VAR[WALL_PAIR | s][k]];   // two vines: the second cut back
    if (!la && !lb) return [vine(0), vine(1)];
    return [la ? LS[s] : kind === 2 ? NO_BOXES : WALL_VAR[s], lb ? LS[n] : kind === 2 ? NO_BOXES : WALL_VAR[n]];
  }
  /* SLOPE: a wedge (its slanted face is drawn by the mesher, emitSlope in chunks/mesher-models.js). As boxes it is steps,
     SLOPE_STEPS of them for the crosshair and SLOPE_COLL_STEPS for what stands on it, each as high as the wedge at its
     middle, rising away from its facing (stairs' way: facing 0 has its low edge at +Z); upside down they hang from the top. */
  const SLOPE_STEPS = 8, SLOPE_COLL_STEPS = 16;
  const _slopeBoxes = (va, n) => {
    const f = va & 3, flip = va & 4, out = [];
    for (let k = 0; k < n; k++) {
      const a = k / n, b = (k + 1) / n, h = 1 - (k + 0.5) / n;   // a..b: from the high side down; h: the height there
      const y0 = flip ? 1 - h : 0, y1 = flip ? 1 : h;
      out.push(f === 0 ? [0, y0, a, 1, y1, b] : f === 1 ? [0, y0, 1 - b, 1, y1, 1 - a]
             : f === 2 ? [a, y0, 0, b, y1, 1] : [1 - b, y0, 0, 1 - a, y1, 1]);
    }
    return out;
  };
  const SLOPE_BOX = [], SLOPE_COLL = [];
  for (let r = 0; r < 8; r++) { SLOPE_BOX[r] = _slopeBoxes(r, SLOPE_STEPS); SLOPE_COLL[r] = _slopeBoxes(r, SLOPE_COLL_STEPS); }
  // a slope's way down, unit [dx, dz] (its facing's: STAIR_DIR), or null: anything else, or one hung upside down
  const slopeDownOf = (v) => { const va = (v >> 8) & 255; return shapeOfVal(v) === 'slope' && !(va & 4) ? STAIR_DIR[va & 3] : null; };
  // the boxes a shaped value fills — mesh, collision and raycast all ask here — or null when it is not shaped
  // coll: the collision set, where it differs (a fence stands 1.5 tall to anything walking into it)
  // rl: the rails lying in other cells (joinBoxesAt), for a fence's or a wall's joins
  function shapeBoxesAt(g, x, y, z, v, coll, rl = null) {
    const s = shapeOfVal(v);
    if (!s) return null;
    const va = (v >> 8) & 255;
    // a stack you wade through has no collision at all; the crosshair still sees its full height
    if (s === 'layer') return coll && PROPS[v & 255].layerStack ? NO_BOXES : LAYER_BOX[va & 7];
    if (s === 'slab')  return [SLAB_HALF[va & ROT_MASK]];
    if (s === 'pane')  return [PANE_BOX[va & ROT_MASK]];
    if (s === 'fence') return joinBoxesAt(FENCE_SPEC, 'fence', SHAPE_FENCE, g, x, y, z, v, coll, rl);
    if (s === 'wall')  return joinBoxesAt(WALL_SPEC, 'wall', SHAPE_WALL, g, x, y, z, v, coll, rl);
    if (s === 'gate')  return gateBoxes(g, x, y, z, v, coll);
    if (s === 'cover') return coll ? NO_BOXES : COVER_BOX[va & ROT_MASK];
    if (s === 'door')  return doorBoxes(va);                                      // 0.842
    if (s === 'plate') return coll ? NO_BOXES : PLATE_BOX[va & PLATE_PRESSED];    // walked over, never into
    if (s === 'sign')  return coll ? NO_BOXES : (SIGN_BOX[(va >> 2) & 3] || SIGN_BOX[0])[va & 3];   // walked through
    if (s === 'ladder') {                                                          // a thin board at its back collides
      if (wallMateOf(v)) { const [a, b] = wallPairBoxes(v, coll ? 2 : 0); return a.concat(b); }   // a corner of two blocks
      return (coll ? LADDER_COLL : LADDER_BOX)[va & 7];
    }
    if (s === 'slope')  return (coll ? SLOPE_COLL : SLOPE_BOX)[va & 7];
    return stairBoxesAt(g, x, y, z, v);
  }
  /* A PRESSURE PLATE LYING IN ANOTHER BLOCK'S CELL (the page keeps it beside the cell: PLATE_OVER, blocks/pressure-plates.js).
     `host` is the cell's own value, `plate` the plate's (its block, SHAPE_PLATE, pressed or not, its look). Where it lies:
       a plant (a billboard: grass, a flower, a sapling)  on the floor under it, the plant drawn through it
       a carpet or a layer stack, 1 to 7 deep             on the top layer
       a bottom slab                                      on the slab, half a block up
       upright stairs                                     on the lower step, cut to the part of it the steps leave free
                                                          (a half, or a quarter by an inner corner), flush with the step
     ...and BURIED (PLATE_BURIED): a walk-through layer stack (sand, snow, leaves...) laid over a plate standing alone,
     the plate on the floor under it, hidden: the mesher draws none and the crosshair passes it, but it is pressed.
     Its boxes in the cell, or null when the cell's block holds no plate. g: the value reader (getBlock on the page, the
     mesher's gb), for the corners stairs take from their neighbours. */
  const PLATE_STEP_RECTS = [[0, 0.5, 1, 1], [0, 0, 1, 0.5], [0.5, 0, 1, 1], [0, 0, 0.5, 1],          // x0, z0, x1, z1: halves,
                            [0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];  // then quarters
  function plateOverBoxes(g, x, y, z, host, plate) {
    const p = PROPS[host & 255];
    if (!p || !(host & 255)) return null;
    const pb = PLATE_BOX[((plate >> 8) & PLATE_PRESSED) ? 1 : 0][0], th = pb[4];
    const lie = (h) => [[pb[0], h, pb[2], pb[3], h + th, pb[5]]];
    const s = shapeOfVal(host), va = (host >> 8) & 255;
    if ((plate >> 8) & PLATE_BURIED) return s === 'layer' && p.layerStack ? lie(0) : null;
    if (!s) return p.model === 'cross' && !p.solid ? lie(0) : null;
    if (s === 'layer') { const n = layerCount(host); return n < LAYER_MAX ? lie(n / LAYER_MAX) : null; }
    if (s === 'slab') return (va & ROT_MASK) === 0 ? lie(0.5) : null;
    if (s !== 'stairs' || (va & 4)) return null;
    const steps = stairBoxesAt(g, x, y, z, host).filter(b => b[1] >= 0.5);
    for (const r of PLATE_STEP_RECTS) {
      if (steps.some(b => b[0] < r[2] && b[3] > r[0] && b[2] < r[3] && b[5] > r[1])) continue;
      // a sixteenth in from the cell's edges, flush against the step
      return [[r[0] ? r[0] : pb[0], 0.5, r[1] ? r[1] : pb[2], r[2] < 1 ? r[2] : pb[3], 0.5 + th, r[3] < 1 ? r[3] : pb[5]]];
    }
    return null;
  }
  /* COVERS IN ANOTHER BLOCK'S CELL (the page keeps them beside the cell: COVER_OVER, blocks/covers.js), like the facades on
     a cable in Applied Energistics: up to six in a cell whose own block is not a whole one, one on each side (bottom, top,
     -X, +X, -Z, +Z: the cover's own rotation, COVER_BOX). What may hold them, and the boxes they keep clear of
     (coverHostBoxes): a shape (slab, stairs, fence, wall, pane, layer, plate, sign, a cover of its own; not a door, which
     swings), a chest, a small model (a pebble, a vine, a ladder, the mortar, a cluster), a hollow log; a plant or a torch
     holds them with nothing to keep clear of, drawn through them. A whole block, a fluid, fire, a bed, a log do not.
     Each cover is its side's plate, COVER_T thick, less what is in its way: a box of the host closer to that side than a
     cover is thick makes it thinner, down to COVER_THIN (so one fits over a chest, a sixteenth in from its cell); one
     closer still is cut out of it (the step of a stair, a fence's rail); and the covers of the same cell keep clear of each
     other in side order (bottom and top whole, the X sides between them, the Z sides between all four), so a cell boxed
     in by six is a hollow block with no two faces in one place. `covers`: the six values (0: none on that side). The
     boxes per side (null: none there, or no room for it), or null when the host holds no covers. */
  // a cover with less of its face than a quarter left (a thin frame round a chest's foot) has no room
  const COVER_T = 0.125, COVER_THIN = 0.0625, COVER_MIN_AREA = 0.24, _COVER_E = 1e-6;
  const COVER_AXIS = [1, 1, 0, 0, 2, 2], COVER_UV = [[1, 2], [0, 2], [0, 1]];   // a side's thin axis; the face's two
  function coverHostBoxes(g, x, y, z, host) {
    const id = host & 255, p = PROPS[id];
    if (!id || !p) return null;
    const s = shapeOfVal(host);
    if (s) return s === 'door' ? null : shapeBoxesAt(g, x, y, z, host);
    if (slabMixed(host)) return null;
    if (p.model === 'cross') return NO_BOXES;
    if (p.model === 'chest') return p.boxes;
    if (p.model === 'hollow') return p.boxesOf ? p.boxesOf(host) : null;
    if (p.model === 'carpet' || p.model === 'wall' || p.model === 'voxel' || p.model === 'cluster')
      return (p.boxesByVar && p.boxesByVar[(host >> 8) & 255]) || p.boxes || null;
    return null;
  }
  // the unit square less the rectangles `cuts` ([u0, v0, u1, v1]), as rectangles: a grid on every cut's edges, its free
  // cells run together along u, and runs that match the row below grow into it
  function _coverFree(cuts) {
    const U = [...new Set([0, 1, ...cuts.flatMap(c => [c[0], c[2]])])].sort((a, b) => a - b);
    const V = [...new Set([0, 1, ...cuts.flatMap(c => [c[1], c[3]])])].sort((a, b) => a - b);
    const out = [];
    let open = [];
    for (let j = 0; j + 1 < V.length; j++) {
      const vm = (V[j] + V[j + 1]) / 2, next = [];
      let a = -1;
      for (let i = 0; i + 1 < U.length; i++) {
        const um = (U[i] + U[i + 1]) / 2;
        const free = !cuts.some(c => um > c[0] && um < c[2] && vm > c[1] && vm < c[3]);
        if (free && a < 0) a = U[i];
        if ((!free || i + 2 === U.length) && a >= 0) {
          const b = free ? U[i + 1] : U[i], o = open.find(r => r[0] === a && r[2] === b);
          if (o) { o[3] = V[j + 1]; next.push(o); } else next.push([a, V[j], b, V[j + 1]]);
          a = -1;
        }
      }
      for (const r of open) if (!next.includes(r)) out.push(r);
      open = next;
    }
    return out.concat(open);
  }
  function _coverSide(s, obst) {
    const a = COVER_AXIS[s], hi = s & 1, [ua, va] = COVER_UV[a], cl = (n) => Math.max(0, Math.min(1, n));
    let t = COVER_T;
    const near = [];
    for (const b of obst) {
      if (b[ua] >= 1 - _COVER_E || b[ua + 3] <= _COVER_E || b[va] >= 1 - _COVER_E || b[va + 3] <= _COVER_E) continue;   // not over this face
      const d = hi ? 1 - b[a + 3] : b[a];                                                          // how far in from it
      if (d >= COVER_T - _COVER_E) continue;
      near.push([b, d]);
      if (d >= COVER_THIN - _COVER_E) t = Math.min(t, d);
    }
    const cuts = near.filter(([, d]) => d < t - _COVER_E).map(([b]) => [cl(b[ua]), cl(b[va]), cl(b[ua + 3]), cl(b[va + 3])]);
    const free = _coverFree(cuts);
    if (free.reduce((n, r) => n + (r[2] - r[0]) * (r[3] - r[1]), 0) < COVER_MIN_AREA) return null;
    return free.map(r => {
      const b = [0, 0, 0, 0, 0, 0];
      b[ua] = r[0]; b[ua + 3] = r[2]; b[va] = r[1]; b[va + 3] = r[3];
      b[a] = hi ? 1 - t : 0; b[a + 3] = hi ? 1 : t;
      return b;
    });
  }
  /* A BLOCK FALLEN INTO A DOORWAY (the page keeps it beside the door's cell: DOOR_FILL, blocks/doors.js) fills what the
     door's panel leaves of the cell: the cell less the panel's box, which lies along one side, open or shut. */
  function doorFillBoxes(door) {
    const b = doorBoxes((door >> 8) & 255)[0];
    for (let a = 0; a < 3; a++) {
      if (b[a] <= 0 && b[a + 3] >= 1) continue;
      const out = [0, 0, 0, 1, 1, 1];
      if (b[a] <= 0) out[a] = b[a + 3]; else out[a + 3] = b[a];
      return [out];
    }
    return [];
  }
  function coverOverBoxes(g, x, y, z, host, covers) {
    const hb = coverHostBoxes(g, x, y, z, host);
    if (!hb) return null;
    const out = [null, null, null, null, null, null], done = hb.slice();
    for (let s = 0; s < 6; s++) {
      if (!covers[s]) continue;
      out[s] = _coverSide(s, done);
      if (out[s]) done.push(...out[s]);
    }
    return out;
  }
});
