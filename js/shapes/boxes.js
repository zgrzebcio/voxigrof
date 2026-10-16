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
  function shapeOfVal(v) {
    const va = (v >> 8) & 255, p = PROPS[v & 255];
    if (!va || !p || !p.shapes) return null;
    const fam = SHAPE_FAMILY[va >> 4];
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
     the same shape, diagonals included. Authored toward +X and +X+Z in sixteenths and mirrored for the rest. */
  const _joinSpec = (post, postColl, arm, diag, armColl, diagColl) => ({
    post: post.map(_s16), postColl: postColl.map(_s16),
    mesh: FENCE_DIRS.map(([dx, dz], d) => _fenceArm(d < 4 ? arm : diag, dx, dz)),
    coll: FENCE_DIRS.map(([dx, dz], d) => _fenceArm(d < 4 ? armColl : diagColl, dx, dz)),
  });
  const FENCE_SPEC = _joinSpec([[6, 0, 6, 10, 14, 10], [7, 14, 7, 9, 16, 9]], [[6, 0, 6, 10, 24, 10]],
                               FENCE_ARM, FENCE_DIAG, FENCE_ARM_COLL, FENCE_DIAG_COLL);
  // the wall: a 10 px post and 8 px thick arms, all the full block tall, with no gaps; collision 1.5 tall
  const WALL_SPEC = _joinSpec([[3, 0, 3, 13, 16, 13]], [[3, 0, 3, 13, 24, 13]],
                              [[13, 0, 4, 16, 16, 12]], [[11, 0, 11, 16, 16, 16]],
                              [[13, 0, 4, 16, 24, 12]], [[11, 0, 11, 16, 24, 16]]);
  function joinBoxesAt(spec, family, base, g, x, y, z, v, coll) {
    const pose = ((v >> 8) & 255) === base + 1, id = v & 255;
    const joins = (dx, dz) => {
      if (pose) return dz === 0;                      // the icon pose: both ways along X
      const n = g(x + dx, y, z + dz);
      return (n & 255) === id && shapeOfVal(n) === family;
    };
    const out = (coll ? spec.postColl : spec.post).slice();
    for (let d = 0; d < 8; d++) {
      const dx = FENCE_DIRS[d][0], dz = FENCE_DIRS[d][1];
      if (!joins(dx, dz)) continue;
      if (d >= 4 && (joins(dx, 0) || joins(0, dz))) continue;
      for (const b of (coll ? spec.coll : spec.mesh)[d]) out.push(b);
    }
    return out;
  }
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
  const SHAPE_DIM = { slab: 4, stairs: 6, pane: 2, fence: 1, wall: 2, cover: 2 };
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
  // the boxes a shaped value fills — mesh, collision and raycast all ask here — or null when it is not shaped
  // coll: the collision set, where it differs (a fence stands 1.5 tall to anything walking into it)
  function shapeBoxesAt(g, x, y, z, v, coll) {
    const s = shapeOfVal(v);
    if (!s) return null;
    const va = (v >> 8) & 255;
    // a stack you wade through has no collision at all; the crosshair still sees its full height
    if (s === 'layer') return coll && PROPS[v & 255].layerStack ? NO_BOXES : LAYER_BOX[va & 7];
    if (s === 'slab')  return [SLAB_HALF[va & ROT_MASK]];
    if (s === 'pane')  return [PANE_BOX[va & ROT_MASK]];
    if (s === 'fence') return joinBoxesAt(FENCE_SPEC, 'fence', SHAPE_FENCE, g, x, y, z, v, coll);
    if (s === 'wall')  return joinBoxesAt(WALL_SPEC, 'wall', SHAPE_WALL, g, x, y, z, v, coll);
    if (s === 'cover') return coll ? NO_BOXES : COVER_BOX[va & ROT_MASK];
    if (s === 'door')  return doorBoxes(va);                                      // 0.842
    return stairBoxesAt(g, x, y, z, v);
  }
});
