'use strict';
/* shapes/stairs.js: stairs. Their boxes by facing and upside-down, and how two stairs join into a corner.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  // oak stairs: base half-slab + back step. variant: bits 0-1 facing (full side toward player),
  // bit 2 (4) = upside-down (ceiling placement). Two boxes per variant, shared by collision,
  // raycast and the mesher.
  const STAIR_BOXES = [];
  for (let v = 0; v < 8; v++) {
    const f = v & 3, flip = v & 4;
    const base = flip ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
    const sy0 = flip ? 0 : 0.5, sy1 = flip ? 0.5 : 1;
    const step = f === 0 ? [0, sy0, 0,   1,   sy1, 0.5] : f === 1 ? [0,   sy0, 0.5, 1, sy1, 1]
               : f === 2 ? [0, sy0, 0,   0.5, sy1, 1  ] :           [0.5, sy0, 0,   1, sy1, 1];
    STAIR_BOXES[v] = [base, step];
  }
  // Minecraft-style stair corners: shape derived live from neighbouring stairs, not stored.
  // g(x,y,z) = block-val getter — the worker passes its chunk+neighbour reader, the main thread
  // passes getBlock, so collision, raycast, selection and the mesher all agree on the same shape.
  // NB: in this game the tall step sits on BACK(f); MC's `facing` points at that tall side, so
  // MC's facing dir = OPP[f]. All neighbour tests run in that "tall direction" (M) space.
  const STAIR_DIR = [[0,1],[0,-1],[1,0],[-1,0]];     // facing index -> unit dir: 0:+Z 1:-Z 2:+X 3:-X
  const STAIR_OPP = [1,0,3,2];                        // opposite facing index
  const STAIR_CCW = [2,3,1,0];                        // 90° CCW (top view) of a facing index
  const STAIR_CF = [                                  // per f: axisZ + back/front/left/right sub-indices
    { axisZ:true,  back:0, front:1, left:1, right:0 },
    { axisZ:true,  back:1, front:0, left:0, right:1 },
    { axisZ:false, back:0, front:1, left:0, right:1 },
    { axisZ:false, back:1, front:0, left:1, right:0 },
  ];
  // a value's stair variant 0..7 (bits 0-1 facing, bit 2 flipped), or -1 — stairs are a chisel shape since 0.783
  const stairVarOf = v => {
    const p = PROPS[v & 255], va = (v >> 8) & 255;
    return (p && p.shapes && p.shapes.stairs && (va & SHAPE_MASK) === SHAPE_STAIRS) ? (va & ROT_MASK) : -1;
  };
  function stairBoxesAt(g, x, y, z, val) {
    const sv = stairVarOf(val), f = sv & 3, flip = sv & 4;
    const M = STAIR_OPP[f];                           // MC facing = tall-side direction
    const isSt   = v => stairVarOf(v) >= 0;
    const tallOf = v => STAIR_OPP[stairVarOf(v) & 3]; // a stair's tall-side dir index
    const flipOf = v => stairVarOf(v) & 4;
    const axis   = i => i < 2 ? 0 : 1;
    let shape = 0, fside = 0;                         // shape 0 straight, 1 inner, 2 outer; fside 0=left(f) 1=right(f)
    // outer: the stair the tall side faces (M) turns perpendicular, unless it's a continuing run
    const fd = STAIR_DIR[M], fv = g(x + fd[0], y, z + fd[1]);
    if (isSt(fv) && flipOf(fv) === flip && axis(tallOf(fv)) !== axis(M)) {
      const t = tallOf(fv), gd = STAIR_DIR[STAIR_OPP[t]], gg = g(x + gd[0], y, z + gd[1]);
      if (!isSt(gg) || tallOf(gg) !== M || flipOf(gg) !== flip) { shape = 2; fside = t === STAIR_CCW[M] ? 1 : 0; }
    }
    // inner: the stair on the low side (opp M) turns perpendicular (outer wins if both, per MC)
    if (!shape) {
      const bd = STAIR_DIR[STAIR_OPP[M]], bv = g(x + bd[0], y, z + bd[1]);
      if (isSt(bv) && flipOf(bv) === flip && axis(tallOf(bv)) !== axis(M)) {
        const t = tallOf(bv), gd = STAIR_DIR[t], gg = g(x + gd[0], y, z + gd[1]);
        if (!isSt(gg) || tallOf(gg) !== M || flipOf(gg) !== flip) { shape = 1; fside = t === STAIR_CCW[M] ? 1 : 0; }
      }
    }
    if (!shape) return STAIR_BOXES[sv] || STAIR_BOXES[0];
    const c = STAIR_CF[f];
    const sy0 = flip ? 0 : 0.5, sy1 = flip ? 0.5 : 1;
    const base = flip ? [0,0.5,0,1,1,1] : [0,0,0,1,0.5,1];
    const mkQ = (xi, zi) => [xi*0.5, sy0, zi*0.5, xi*0.5+0.5, sy1, zi*0.5+0.5];
    const strip = c.axisZ ? [0, sy0, c.back*0.5, 1, sy1, c.back*0.5+0.5]
                          : [c.back*0.5, sy0, 0, c.back*0.5+0.5, sy1, 1];
    const sIdx = fside ? c.right : c.left;
    if (shape === 2) {                               // outer corner: single back-side quarter step
      const q = c.axisZ ? mkQ(sIdx, c.back) : mkQ(c.back, sIdx);
      return [base, q];
    }
    const q = c.axisZ ? mkQ(sIdx, c.front) : mkQ(c.front, sIdx);   // inner: back strip + front-side quarter
    return [base, strip, q];
  }
});
