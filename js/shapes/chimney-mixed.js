'use strict';
/* shapes/chimney-mixed.js: furnace chimneys (a column of rock walls), layer counts and values, and mixed slabs (two
   halves of different blocks in one cell).
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* FURNACE CHIMNEYS: a single column of WALLS of any rock (stone, cobblestone, granite, marble, limestone,
     dolomite, in any of their looks) standing on a furnace is its chimney, up to CHIMNEY_MAX high. The furnace's own
     chimney cap sits on top of it, and the smoke leaves from there (fxFurnace, 49-particles.js). */
  const CHIMNEY_MAX = 6;
  const CHIMNEY_ROCKS = new Set([B.STONE, B.COBBLE, B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE]);   // any look of them too: a look is its rock
  const chimneyWall = (v) => CHIMNEY_ROCKS.has(v & 255) && shapeOfVal(v) === 'wall';
  // how many chimney walls stand on the furnace at (x, y, z), read through `g` (getBlock, or the mesher's own)
  const chimneyHeight = (g, x, y, z) => { let k = 0; while (k < CHIMNEY_MAX && chimneyWall(g(x, y + 1 + k, z))) k++; return k; };
  for (const b of LAYER_STACKING) PROPS[b].layerStack = true;
  // how many layers a value holds (0 = not a layer stack), whether it mixes, and a value to write
  const layerCount = (v) => {
    const va = (v >> 8) & 255, p = PROPS[v & 255];
    const hi = va & SHAPE_MASK;
    if (!p || !p.shapes || !p.shapes.layer || (hi !== SHAPE_LAYER && hi !== SHAPE_LAYER_MIX)) return 0;
    return Math.min(LAYER_MAX, (va & ROT_MASK) + 1);
  };
  const layerMixed = (v) => ((((v >> 8) & 255) & SHAPE_MASK) === SHAPE_LAYER_MIX) && layerCount(v) > 0;
  const layerVal = (id, n, mixed) =>
    (id | (((mixed ? SHAPE_LAYER_MIX : SHAPE_LAYER) + Math.max(1, Math.min(LAYER_MAX, n)) - 1) << 8)) >>> 0;
  /* MIXED SLABS: two halves of DIFFERENT blocks in one cell, kept the way a mixed carpet stack is. The variant
     byte is SHAPE_SLAB_MIX + the low half's rotation (0, 2 or 4: bottom, -X, -Z), and the two ids, low then high, live
     beside the chunk in the same list a mixed stack uses (LAYER_STACKS, chunks/chunks.js). To everything but the mesher,
     the crosshair and breaking (both halves, chunks/chunks.js) the cell is a full block: shapeOfVal says null.
     Glass and glowstone mix too since 0.8264, through the rotation's two spare bits:
       SLAB_MIX_SEE  (8)  a half is see-through (glass): the cell lets light and its neighbours' faces through
       SLAB_MIX_HIGH (1)  the cell's id is the HIGH half's block, not the low one's: the half that glows (the
                          brighter, if both do), since a cell's light comes from its id */
  const SHAPE_SLAB_MIX = 0x90, SLAB_MIX_SEE = 8, SLAB_MIX_HIGH = 1;
  const slabMixed = (v) => ((((v >> 8) & 255) & SHAPE_MASK) === SHAPE_SLAB_MIX) && !!PROPS[v & 255]?.shapes?.slab;
  /* the value of a mixed slab of `low` and `high`, the low half at even rotation `rot`. The halves are side-list ENTRIES,
     id | look << 8 (stackEntry, blocks/looks.js): a plain id is one. The cell holds the id alone; the list holds the looks. */
  const slabMixVal = (low, rot, high = low) => {
    const pl = PROPS[low & 255], ph = PROPS[high & 255];
    const hi = (ph.light || 0) > (pl.light || 0);
    const bits = (rot & 6) | (!pl.opaque || !ph.opaque ? SLAB_MIX_SEE : 0) | (hi ? SLAB_MIX_HIGH : 0);
    return (((hi ? high : low) & 255) | ((SHAPE_SLAB_MIX + bits) << 8)) >>> 0;
  };
  const slabsMix = (a, b) => a !== b && [a, b].every(e => { const p = PROPS[e & 255];   // two entries: stone and polished stone mix
    return !!p && !!p.shapes && !!p.shapes.slab && p.solid && p.model === 'cube'; });
  // the two halves' boxes, low then high
  const slabMixBoxes = (v) => { const r = ((v >> 8) & ROT_MASK) & 6; return [SLAB_HALF[r], SLAB_HALF[r + 1]]; };
  // a value whose blocks are listed beside the chunk: a mixed carpet stack or a mixed slab
  const sideListed = (v) => layerMixed(v) || slabMixed(v);
  const LAYER_BOX = [];
  for (let n = 1; n <= LAYER_MAX; n++) LAYER_BOX[n - 1] = [[0, 0, 0, 1, n / LAYER_MAX, 1]];
  const NO_BOXES = [];
  // solidity of a VALUE: a stack you wade through (snow, leaves, sand, ...) is not solid, whatever its block is
  // ...and a cover is not solid either
  const solidVal = (v) => {
    const p = PROPS[v & 255];
    if (!p || !p.solid) return false;
    const va = (v >> 8) & 255;
    if (!va || !p.shapes) return true;
    return !(p.layerStack && layerCount(v)) && !(p.shapes.cover && (va & SHAPE_MASK) === SHAPE_COVER);
  };
});
