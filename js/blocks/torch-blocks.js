'use strict';
/* blocks/torch-blocks.js: the three torches (fire, unlit, crystal), their wall-hanging variants and crosshair boxes,
   and the metal chest's block.
   A part of BLOCK_CORE (blocks/blocks.js). What torches DO (burning out, relighting) is blocks/torches.js. */

corePart('blocks', function () {
  // torch: cross model (texture has transparent margins so it reads as a small stick),
  // light 10 placed / 5 in hand (handLight overrides the default held-light scaling),
  // topOnly = placeable only when clicking a block's top face
  /* Torch variants: 0 stands on the floor; 1-4 hang on a wall and lean AWAY from it —
     toward +X, -X, +Z, -Z respectively (the clicked face's normal). The mesher draws a real stick
     for it (emitTorch); these are the matching ray/selection boxes, one per variant, so the
     outline follows the lean. `model` stays 'cross' on purpose: free breaking, hand breaking, the
     pop-off support rule and the placement rule all key off it. */
  // wall variants hug the leaning stick: foot on the wall plane, top 0.26 out, 1/8 wide
  const TORCH_RAY_BOXES = [
    [[0.40, 0,    0.40, 0.60, 0.70, 0.60]],
    [[0.00, 0.18, 0.43, 0.33, 0.81, 0.57]],
    [[0.67, 0.18, 0.43, 1.00, 0.81, 0.57]],
    [[0.43, 0.18, 0.00, 0.57, 0.81, 0.33]],
    [[0.43, 0.18, 0.67, 0.57, 0.81, 1.00]],
  ];
  /* the fire torch (the old torch, id kept), the unlit one it burns down to, and the crystal torch. `torch`: drawn
     as a stick by emitTorch, hangs on walls, held fattened in the hand. They burn out (blocks/torches.js): fire 5-10 minutes,
     crystal 15-30; rain puts a fire torch out. Right-click an unlit one with flint or a glow crystal to light it. */
  PROPS[B.TORCH] = { name:'Fire torch', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:79, hardness:0, light:15, handLight:8, topOnly:true, type:'wood', boxes:[[0.4,0,0.4,0.6,0.7,0.6]], rayBoxesByVar: TORCH_RAY_BOXES, faces:[T.TORCH_FIRE], torch:true,
                     desc: 'Carried in the offhand it lights your way; forage with an empty main hand. Burns out in 5-10 minutes; rain puts it out' };   // 0.7992; burns out 0.834
  PROPS[B.TORCH_UNLIT] = { name:'Unlit torch', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:79, hardness:0, topOnly:true, type:'wood', boxes:[[0.4,0,0.4,0.6,0.7,0.6]], rayBoxesByVar: TORCH_RAY_BOXES, faces:[T.TORCH_UNLIT], torch:true,
                     desc: 'Place it, then right-click it with flint to light it, or with a glow crystal for a crystal torch' };
  PROPS[B.CRYSTAL_TORCH] = { name:'Crystal torch', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:79, hardness:0, light:12, handLight:6, coldLight:true, topOnly:true, type:'wood', boxes:[[0.4,0,0.4,0.6,0.7,0.6]], rayBoxesByVar: TORCH_RAY_BOXES, faces:[T.TORCH_CRYSTAL], torch:true,
                     desc: 'A cold blue light: it melts nothing and stays lit under water and in rain. Burns out in 15-30 minutes' };
  // furnace: front picked per variant facing (rot:'side'); lit bit swaps the front tile
  // its top is a chimney since 0.801: an open hole that must stay clear (blocks/furnace.js)
  PROPS[B.FURNACE] = { name:'Furnace', solid:true, opaque:true, raycast:true, pass:0, model:'cube', rot:'side', stack:20, hardness:8.5, type:'stone',  faces:[T.FURNACE_SIDE,T.FURNACE_SIDE,T.FURNACE_TOP_OPEN,T.FURNACE_TOP,T.FURNACE_FRONT,T.FURNACE_SIDE],
                       desc: 'Keep its top clear: with a block on it, it stops smelting but its fuel still burns away' };
  PROPS[B.RED_SAND] = { name:'Red Sand', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:2.1, type:'ground', faces:[T.RED_SAND_SIDE,T.RED_SAND_SIDE,T.RED_SAND,T.RED_SAND,T.RED_SAND_SIDE,T.RED_SAND_SIDE], desc: '' };   // own sides 0.8091
  // oak door: 2-cell (bottom + upper half), 1/8 thick. Rendered as an animated standalone mesh
  // (blocks/doors.js) — the chunk mesher emits nothing for it. Collision boxes swap with the open
  // bit so an open door is passable. variant: bits 0-1 facing, bit 2 open, bit 3 upper half,
  // bit 4 (16) = hinged on the RIGHT instead of the left (mirrored swing; two doors side by side
  // with opposite hinges form a double door that opens outward from the middle).
  {
    const t = 0.125;
    const closed = [[[0,0,0,1,1,t]], [[0,0,1-t,1,1,1]], [[0,0,0,t,1,1]], [[1-t,0,0,1,1,1]]];
    // open door: thin panel flush against a side wall INSIDE its own cell. blocks/doors.js applies a
    // per-facing position nudge so the swung mesh lands exactly on these boxes (a corner-hinged
    // panel can't be flush both closed and open by rotation alone). Doorway stays clear — you walk
    // through the gap but not through the panel.
    const opened = [ [[0,0,0,t,1,1]], [[0,0,0,t,1,1]], [[0,0,0,1,1,t]], [[0,0,0,1,1,t]] ];
    // right-hinged doors swing to the opposite wall: mirror each open panel across the cell
    // centre (X for the +Z/-Z facings, Z for +X/-X). Closed panels span the whole cell either
    // way, so only the open set differs.
    const openedR = [ [[1-t,0,0,1,1,1]], [[1-t,0,0,1,1,1]], [[0,0,1-t,1,1,1]], [[0,0,1-t,1,1,1]] ];
    const bv = [], rv = [];
    for (let v = 0; v < 32; v++) {
      const set = (v & 4) ? ((v & 16) ? openedR : opened) : closed;
      bv[v] = set[v & 3];                                 // open door has a thin panel hitbox
      rv[v] = bv[v];                                      // raycast == collision (both match the visual)
    }
    PROPS[B.DOOR] = { name:'Oak door', solid:true, opaque:false, raycast:true, pass:1, model:'door', rot:'side', stack:10, hardness:3.5, type:'wood', boxes:closed[0], boxesByVar:bv, rayBoxesByVar:rv, faces:[T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS], desc: '' };
  }
  // Bed: 2 cells long (1 wide x 9/16 tall). Like the door the mesher emits nothing for it —
  // blocks/bed.js draws one textured mesh per bed. The cells stay for collision + raycast.
  // variant byte: bits 0-1 facing (0:+Z 1:-Z 2:+X 3:-X), bit 3 (8) = HEAD half.
  // Chest: storage with an animated lid, drawn by blocks/chest.js (mesher emits nothing).
  // variant byte: bits 0-1 facing. Two chests facing the same way, side by side, form a double.
  PROPS[B.CHEST] = { name:'Chest', solid:true, opaque:false, raycast:true, pass:1, model:'chest', rot:'side',
                     stack:50, hardness:4.5, type:'wood', boxes:[[0.0625, 0, 0.0625, 0.9375, 0.9375, 0.9375]],   // 4.5 = bench
                     faces:[T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS], desc: '' };
  /* Metal chest: the chest in iron, copper or gold, 6 rows (a double 6 + 1 + 6). Variant bits 0-3 as the chest,
     4-5 the metal (blocks/chest.js CHEST_METALS), 6 SEALED: found locked in the world, opened by a key of its metal. Never
     crafted: it comes from the world, and an opened one is mined with a pickaxe. */
  PROPS[B.METAL_CHEST] = { name:'Metal chest', solid:true, opaque:false, raycast:true, pass:1, model:'chest', rot:'side',
                           stack:50, hardness:6.0, type:'stone', boxes:[[0.0625, 0, 0.0625, 0.9375, 0.9375, 0.9375]],
                           faces:Array(6).fill(T.IRON_BLOCK), desc: 'Found sealed in the world: a key of its metal opens it. 6 rows; two side by side hold 13' };
  PROPS[B.BED] ={ name:'Bed', solid:true, opaque:false, raycast:true, pass:1, model:'bed', rot:'side',
                   stack:1, hardness:1.0, type:'wood', boxes:[[0, 0, 0, 1, 0.5, 1]],   // half a block, as its art (9/16 before)
                   faces:[T.WOOL,T.WOOL,T.WOOL,T.PLANKS,T.WOOL,T.WOOL], desc: '' };
  /* Termite hill: the Savanna's mound of packed earth (biomes/gen-savanna.js). Like the bed the mesher emits nothing:
     blocks/termite-hill.js draws its model (textures/Blocks/Models/termite_hill) and keeps its termites, and
     `pageModel` has the worker list its cells with the light sources so the page finds them as a chunk comes in.
     Variant 0: a small hill, one cell. 1 + dx + dz * 2 + dy * 4: a cell of a big one (2 x 2 wide, 3 tall), dx dz dy
     from its north-west foot cell (variant 1). Its boxes follow the model's shape, roughly: the small one's are its
     model's own boxes, a big one's cell the box round what of the model is in it. */
  const _hb = (a) => a.map(n => n / 16);
  const HILL_SMALL_BOXES = [[1, 0, 1, 15, 4, 15], [3, 4, 3, 13, 8, 12], [10, 4, 9, 14, 9, 13], [5, 8, 5, 10, 11, 10], [6, 11, 6, 9, 14, 9]].map(_hb);
  const HILL_BIG_BOXES = [null, [0, 0, 0, 16, 16, 16], [0, 0, 1, 16, 16, 16], [0, 0, 0, 16, 16, 16], [0, 0, 0, 16, 16, 16],
                          [3, 0, 4, 16, 16, 16], [0, 0, 4, 11, 16, 16], [3, 0, 0, 16, 16, 12], [0, 0, 0, 11, 16, 12],
                          [6, 0, 6, 16, 16, 16], [0, 0, 8, 8, 13, 16], [9, 0, 0, 16, 6, 2], [0, 0, 0, 8, 6, 2]];
  PROPS[B.TERMITE_HILL] = { name:'Termite hill', solid:true, opaque:false, raycast:true, pass:1, model:'hill', noInv:true, pageModel:true,
                            stack:1, hardness:5.0, type:'ground', boxes:HILL_SMALL_BOXES,
                            boxesByVar:[HILL_SMALL_BOXES, ...HILL_BIG_BOXES.slice(1).map(b => [_hb(b)])],
                            faces:Array(6).fill(T.DIRT), desc: 'Termites live in it. Break it and they come out' };
});
