'use strict';
/* shapes/shapes.js: the chisel shapes. A shape is a VARIANT of a full block, never a new id: the high nibble of the
   variant byte names it (slab, stairs, pane, fence, layer, cover, wall, door), the low nibble turns it.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* CHISEL SHAPES (pane and fence 0.784). A shape is a VARIANT of a full block, not a block of its
     own: the block keeps its id — so its textures, hardness, sound, tool, mining gate and drops are simply
     its own — and the variant byte says how much of the cell it fills. Variant 0 is always the full block.
     A fence's arms point toward each fence OF THE SAME BLOCK beside it, diagonals included — read
     from the neighbours like stair corners, so never stored.
     SHAPE_BLOCKS says which blocks take which shape, written into PROPS[id].shapes, so making another block
     shapeable is one entry. The layout of the variant byte itself is written out below.
     Two halves of the same block in one cell are just the full block again. */
  /* THE VARIANT BYTE OF A SHAPE: the HIGH nibble names the shape, the LOW nibble is its rotation —
     which half, which way a stair faces, how many layers deep. Before 0.792 each shape owned a stretch of
     the byte with its rotations counted into it (slab 1-6, stairs 16-23, layer 64-79, ...), which spent
     most of the byte on a handful of shapes and left every shape a different size. Now each shape has the
     same 16 rotations and there is room for seven more of them (0x90..0xF0).
       0x10 slab    0..5  bottom, top, -X, +X, -Z, +Z
       0x20 stairs  0..7  bits 0-1 facing, bit 2 upside down (STAIR_BOXES)
       0x30 pane    0..1  spanning X (0) or Z (1)
       0x40 fence         arms read from the neighbours, never stored; rotation 1 is the icon pose
       0x50 layer   0..7  n-1 layers of this cell's own block     0x60 the same, MIXED (LAYER_STACKS)
       0x70 cover   0..5  which side of the cell the plate is on
       0x80 wall          joins like the fence; rotation 1 is the icon pose
     A value is written as SHAPE_X + rotation exactly as before, since a rotation never reaches 16. Values
     saved BEFORE 0.792 use the old layout and are not converted: an old slab reads as a full block and an
     old stair as a slab. A block with any shape must not use its variant byte for anything else. */
  const SHAPE_SLAB = 0x10, SHAPE_STAIRS = 0x20, SHAPE_PANE = 0x30, SHAPE_FENCE = 0x40;
  const SHAPE_MASK = 0xF0, ROT_MASK = 0x0F;          // high nibble: which shape. low nibble: how it sits
  /* LAYERS — carpets. Each layer is 1/8 of a block.
       SHAPE_LAYER     + n-1   n layers (1..8) all of this cell's own block
       SHAPE_LAYER_MIX + n-1   n layers of MIXED blocks: the cell's id is the TOP one, and the full list,
                               bottom to top, lives beside the chunk (LAYER_STACKS, chunks/chunks.js), so the
                               world array stays 32 bits a cell and only mixed stacks cost anything
     Blocks marked layerStack pile up to 8, mix with each other, and are walked through (snow, leaves,
     sand, gravel, fiber); every other layer block lies one layer deep and is as solid as its block. */
  const SHAPE_LAYER = 0x50, SHAPE_LAYER_MIX = 0x60, LAYER_MAX = 8;
  /* COVER: SHAPE_COVER + 0..5, a 1/8 plate on one side of the cell (bottom, top, -X, +X, -Z, +Z) that
     nothing collides with — a false floor over a pit, a false wall across a doorway.
     WALL: SHAPE_WALL, a solid wall 8 px thick and the full block tall, joining walls of the SAME block
     straight and diagonally like the fence; +1 is the pose for icons and the hand. */
  const SHAPE_COVER = 0x70, SHAPE_WALL = 0x80;
  /* DOOR: a door is a shape of its material (planks, the iron, copper and tin blocks, adobe, glass and their
     looks), hinged on the left (SHAPE_DOOR) or the right (SHAPE_DOOR_R). Low nibble: bits 0-1 facing (0 +Z, 1 -Z, 2 +X,
     3 -X), 4 open, 8 the upper half. The mesher draws nothing for it: blocks/doors.js gives each door its own swinging mesh,
     its look built from the material's art. Boxes as the old oak door's (B.DOOR, kept only to convert old saves). */
  const SHAPE_DOOR = 0xA0, SHAPE_DOOR_R = 0xB0;
  const _DT = 0.125;
  const DOOR_CLOSED = [[[0,0,0,1,1,_DT]], [[0,0,1-_DT,1,1,1]], [[0,0,0,_DT,1,1]], [[1-_DT,0,0,1,1,1]]];
  const DOOR_OPEN   = [[[0,0,0,_DT,1,1]], [[0,0,0,_DT,1,1]], [[0,0,0,1,1,_DT]], [[0,0,0,1,1,_DT]]];
  const DOOR_OPEN_R = [[[1-_DT,0,0,1,1,1]], [[1-_DT,0,0,1,1,1]], [[0,0,1-_DT,1,1,1]], [[0,0,1-_DT,1,1,1]]];
  const doorBoxes = (va) => ((va & 4) ? ((va & 0xF0) === SHAPE_DOOR_R ? DOOR_OPEN_R : DOOR_OPEN) : DOOR_CLOSED)[va & 3];
});
