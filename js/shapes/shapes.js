'use strict';
/* shapes/shapes.js: the chisel shapes. A shape is a VARIANT of a full block, never a new id: the high nibble of the
   variant byte names it (slab, stairs, pane, fence, layer, cover, wall, door, plate, sign), the low nibble turns it.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* CHISEL SHAPES (pane and fence 0.784). A shape is a VARIANT of a full block, not a block of its
     own: the block keeps its id — so its textures, hardness, sound, tool, mining gate and drops are simply
     its own — and the variant byte says how much of the cell it fills. Variant 0 is always the full block.
     A fence's arms point toward each fence OF THE SAME BLOCK beside it, diagonals included — read
     from the neighbours like stair corners, so not stored (unless the wrench set them by hand: JOIN_MANUAL below).
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
       0x80 wall          joins like the fence; rotation 1 is the icon pose; 0 stands in the middle of its cell (walls from
                          before 0.851); WALL_BACK | facing (0 +Z, 1 -Z, 2 +X, 3 -X) stands WALL_BACK_PX toward that side
       0xC0 plate   0..3  a pressure plate; bit 0 pressed down, bit 1 buried under a layer stack laid over it, kept
                          beside that cell (PLATE_OVER: blocks/pressure-plates.js; a plate standing alone never has it)
       0xD0 sign    bits 0-1 facing (0 +Z, 1 -Z, 2 +X, 3 -X), bits 2-3 how it is put up (SIGN_STAND / WALL / HANG)
       0xE0 gate    a fence or a wall made a gate (blocks/gates.js): GATE_AXIS_Z it spans Z (else X), GATE_OPEN, GATE_SWING_POS it
                          opened toward + of the other axis, GATE_WALL it was a wall (as tall as one)
     (0x90 is the mixed slab, 0xA0 / 0xB0 the door.)
     THE HIGH BITS 25-29 of a fence's, a wall's or a stair's cell (set by the wrench, player/wrench.js; the 2x2 trunk's quarters
     keep their cut in 25-30, blocks/basic.js: another block):
       fence, wall  JOIN_MANUAL: its joins are set by hand, the four arms in bits 26-29 (JOIN_ARMS_SHIFT; +X, -X, +Z, -Z)
       stairs       bits 25-27 (STAIR_FORCE_SHIFT): 0 its corner read from the neighbours, 1 straight, 2 / 3 an inner corner
                    on its left / right, 4 / 5 an outer corner on its left / right (stairBoxesAt, shapes/stairs.js)
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
  /* PLATE: SHAPE_PLATE, a pressure plate. A carpet's one layer with its edges drawn in a sixteenth all round; pressed
     (PLATE_PRESSED) it sinks to half that. Nothing collides with it: what stands on it stands on the block under it,
     which is what presses it (blocks/pressure-plates.js). */
  const SHAPE_PLATE = 0xC0, PLATE_PRESSED = 1, PLATE_BURIED = 2;
  const PLATE_BOX = [[[1 / 16, 0, 1 / 16, 15 / 16, 2 / 16, 15 / 16]], [[1 / 16, 0, 1 / 16, 15 / 16, 1 / 16, 15 / 16]]];
  /* SIGN: SHAPE_SIGN | facing | mount << 2. A board 16 wide and 8 high, 1.5 thick, its writing on the side it faces
     (blocks/signs.js draws the words; the boxes are SIGN_BOX in shapes/boxes.js). SIGN_STAND: on a post from the floor;
     SIGN_WALL: flat against the block behind it; SIGN_HANG: from two short sticks under the ceiling. Nothing collides
     with it. SIGN_FRONT / SIGN_MID_Y: where the board's face is and its middle height, in 16ths, facing +Z, by mount. */
  const SHAPE_SIGN = 0xD0, SIGN_STAND = 0, SIGN_WALL = 1, SIGN_HANG = 2;
  const SIGN_FRONT = [8.75, 1.5, 8.75], SIGN_MID_Y = [11, 8, 5];
  /* a wall standing toward one side of its cell: WALL_BACK | facing, WALL_BACK_PX sixteenths off the middle (boxes.js): its
     post a sixteenth short of that edge, so its faces never lie on a stair's beside it (they flickered) */
  const WALL_BACK = 8, WALL_BACK_PX = 2;
  const SHAPE_GATE = 0xE0, GATE_AXIS_Z = 1, GATE_OPEN = 2, GATE_SWING_POS = 4, GATE_WALL = 8;
  const JOIN_MANUAL = 1 << 25, JOIN_ARMS_SHIFT = 26, STAIR_FORCE_SHIFT = 25;
});
