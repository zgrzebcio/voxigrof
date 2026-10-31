'use strict';
/* blocks/ladder-mortar.js: glassy sand (sand lightning struck), the ladder, and the mortar and pestle's voxel model.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* Glassy sand: sand that lightning struck, fused. It no longer falls or piles, and breaks into glass shards
     (50-loottable.js). Made by strikeLightning (53-storms.js) from any sand. */
  PROPS[B.GLASSY_SAND]    = { name:'Glassy sand', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:2.4, type:'ground',
                              faces:Array(6).fill(T.GLASSY_SAND), desc: 'Sand fused by lightning. Breaks into glass shards' };
  // ...red sand and pink sand fuse into its red and pink looks (blocks/looks.js)
  // fiber block: ten fiber pressed together. Soft enough to pull apart by hand; rarely found in plains
  PROPS[B.FIBER_BLOCK]   = { name:'Fiber block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:0.8, type:'grass',
                             faces:[T.FIBER_BLOCK,T.FIBER_BLOCK,T.FIBER_BLOCK,T.FIBER_BLOCK,T.FIBER_BLOCK,T.FIBER_BLOCK], desc: '' };
  /* The old ladder: a flat plate on a wall. A ladder is a hammer shape of planks, the iron block or a stone now
     (SHAPE_LADDER, shapes/shapes.js); this id stays only so old saves and prefabs convert into an oak planks one
     (migrateLegacyVal, blocks/legacy.js). Never placed, not in creative. */
  PROPS[B.LADDER] = { name:'Ladder', solid:false, opaque:false, raycast:true, pass:1, model:'wall', climbable:true,
                      stack:50, hardness:4.5, type:'wood', boxes:WALL_VAR[0], boxesByVar:WALL_VAR,
                      faces:[T.LADDER,T.LADDER,T.LADDER,T.LADDER,T.LADDER,T.LADDER], desc: '' };
  /* Mortar and pestle: a carved stone bowl with its pestle, built from a voxel model
     (mortar_voxels.json, with its top rim ring trimmed off). MORTAR_VOX holds the model as greedy-merged
     boxes in voxel units, seven numbers each: x0,y0,z0,x1,y1,z1,material (1 bowl, 2 ground powder,
     3 pestle). 27 voxels make one block, so the pestle's tip still sits inside the cell. Drawn by the
     mesher's 'voxel' branch, which is also what gives it a real 3D icon, drop and held item. */
  const MORTAR_VOX = [8,0,4,14,1,18,1,6,0,5,8,1,17,1,14,0,5,16,1,17,1,5,0,6,6,1,16,1,16,0,6,17,1,16,1,4,0,8,5,1,14,1,17,0,8,18,1,14,1,11,1,4,12,2,17,1,8,1,5,11,2,17,1,12,1,5,15,2,16,1,6,1,6,8,2,16,1,15,1,6,16,2,16,1,5,1,8,6,2,14,1,16,1,8,17,2,14,1,12,1,16,14,2,17,1,10,2,5,12,3,17,1,7,2,6,10,3,15,1,12,2,6,14,12,16,1,6,2,7,7,3,14,1,14,2,7,16,3,15,1,5,2,9,6,3,12,1,16,2,10,17,3,13,1,8,2,15,10,6,16,1,14,2,15,15,3,16,1,8,3,6,12,6,15,1,7,3,7,8,14,15,1,14,3,7,15,14,15,1,6,3,8,7,14,14,1,15,3,8,16,6,14,1,10,3,15,12,15,16,1,9,6,6,12,12,15,1,8,6,7,9,13,15,1,15,6,9,16,15,14,1,9,6,15,10,15,16,1,8,7,5,14,15,6,1,7,7,6,9,15,7,1,14,7,6,15,16,7,1,6,7,7,7,16,8,1,15,7,7,16,15,9,1,5,7,8,6,15,14,1,16,7,9,17,15,14,1,6,7,14,7,16,15,1,15,7,14,16,16,15,1,7,7,15,9,15,16,1,14,7,15,15,16,16,1,8,7,16,14,15,17,1,9,8,4,13,17,5,1,7,8,5,8,17,6,1,14,8,5,15,17,6,1,6,8,6,7,16,7,1,15,8,6,16,16,7,1,5,8,7,6,17,8,1,16,8,7,17,16,9,1,4,8,9,5,17,13,1,17,8,9,18,17,13,1,5,8,14,6,17,15,1,16,8,14,17,17,15,1,6,8,15,7,16,16,1,15,8,15,16,16,16,1,7,8,16,8,17,17,1,14,8,16,15,16,17,1,9,8,17,13,17,18,1,7,9,4,9,17,5,1,13,9,4,14,17,5,1,6,9,5,7,17,6,1,15,9,5,16,17,6,1,5,9,6,6,17,7,1,16,9,6,17,17,7,1,4,9,8,5,17,9,1,17,9,8,18,17,9,1,4,9,13,5,17,15,1,17,9,13,18,17,15,1,5,9,15,6,17,16,1,16,9,15,17,17,16,1,6,9,16,7,17,17,1,15,9,16,16,17,17,1,7,9,17,9,17,18,1,13,9,17,14,17,18,1,8,10,3,14,18,4,1,14,10,4,16,18,5,1,5,10,5,6,18,6,1,16,10,5,17,18,6,1,17,10,6,18,18,8,1,4,10,7,5,18,8,1,18,10,8,19,18,14,1,3,10,9,4,18,14,1,5,10,16,6,18,17,1,16,10,16,17,18,17,1,14,10,17,15,17,18,1,8,10,18,14,18,19,1,7,11,3,8,19,4,1,14,11,3,15,18,4,1,6,11,4,7,18,5,1,4,11,6,5,18,7,1,3,11,7,4,18,9,1,18,11,7,19,19,8,1,3,11,14,4,19,15,1,18,11,14,19,18,15,1,4,11,15,5,18,16,1,17,11,15,18,18,16,1,6,11,17,7,18,18,1,15,11,17,16,18,18,1,7,11,18,8,19,19,1,14,11,18,15,19,19,1,8,12,2,14,19,3,1,6,12,3,7,19,4,1,15,12,3,16,19,4,1,5,12,4,6,19,5,1,16,12,4,17,19,5,1,4,12,5,5,19,6,1,17,12,5,18,19,6,1,3,12,6,4,19,7,1,9,12,6,14,13,9,1,18,12,6,19,19,7,1,2,12,8,3,19,14,1,19,12,8,20,19,14,1,9,12,9,10,13,10,1,10,12,9,12,15,13,2,12,12,9,14,13,10,1,9,12,10,10,15,12,2,12,12,10,13,15,12,2,13,12,10,14,13,16,1,9,12,12,10,13,15,1,12,12,12,13,13,16,1,10,12,13,12,13,15,1,3,12,15,4,19,16,1,18,12,15,19,19,16,1,4,12,16,5,19,17,1,17,12,16,18,19,17,1,5,12,17,6,19,18,1,16,12,17,17,19,18,1,6,12,18,7,19,19,1,15,12,18,16,19,19,1,8,12,19,14,19,20,1,7,13,2,8,19,3,1,14,13,2,15,19,3,1,5,13,3,6,19,4,1,16,13,3,17,19,4,1,4,13,4,5,19,5,1,17,13,4,18,19,5,1,3,13,5,4,19,6,1,18,13,5,19,19,6,1,9,13,6,14,14,8,1,2,13,7,3,19,8,1,8,13,7,9,14,9,1,19,13,7,20,19,8,1,10,13,8,12,15,9,2,13,13,8,14,14,9,1,9,13,9,10,15,10,2,12,13,9,13,15,10,2,8,13,10,9,15,12,2,13,13,10,14,15,12,2,8,13,12,9,14,13,3,9,13,12,10,15,13,2,12,13,12,13,15,13,2,8,13,13,9,14,15,1,9,13,13,10,14,14,3,10,13,13,12,15,14,2,13,13,13,14,14,16,1,2,13,14,3,19,15,1,9,13,14,13,14,15,1,19,13,14,20,19,15,1,12,13,15,13,15,16,1,3,13,16,4,19,17,1,18,13,16,19,19,17,1,4,13,17,5,19,18,1,17,13,17,18,19,18,1,5,13,18,6,19,19,1,16,13,18,17,19,19,1,7,13,19,8,19,20,1,14,13,19,15,19,20,1,8,14,1,14,19,2,1,6,14,2,7,19,3,1,15,14,2,16,19,3,1,3,14,4,4,19,5,1,18,14,4,19,19,5,1,2,14,6,3,19,7,1,9,14,6,14,15,7,1,19,14,6,20,19,7,1,7,14,7,8,15,8,1,9,14,7,13,15,8,2,14,14,7,15,15,8,1,6,14,8,7,15,11,1,8,14,8,10,15,9,2,12,14,8,14,15,9,2,20,14,8,21,19,14,1,1,14,9,2,19,13,1,7,14,9,9,15,10,2,13,14,9,15,15,10,2,7,14,10,8,15,13,2,14,14,10,15,15,13,2,6,14,12,7,15,14,1,8,14,12,9,15,14,2,13,14,12,14,15,14,2,9,14,13,10,15,15,2,12,14,13,13,15,15,2,7,14,14,8,15,15,1,10,14,14,12,15,15,2,14,14,14,15,15,15,1,2,14,15,3,19,16,1,13,14,15,14,15,16,1,19,14,15,20,19,16,1,6,14,19,7,19,20,1,15,14,19,16,19,20,1,8,14,20,14,19,21,1,7,15,1,8,19,2,1,14,15,1,15,19,2,1,5,15,2,6,19,3,1,16,15,2,17,19,3,1,4,15,3,5,19,4,1,17,15,3,18,19,4,1,2,15,5,3,19,6,1,8,15,5,10,16,6,1,12,15,5,14,16,6,1,19,15,5,20,19,6,1,7,15,6,8,16,7,1,1,15,7,2,19,9,1,15,15,7,16,16,8,1,20,15,7,21,19,8,1,5,15,8,6,16,10,1,16,15,9,17,16,10,1,10,15,10,11,16,14,3,5,15,11,6,16,14,1,8,15,11,10,16,14,3,11,15,11,12,19,13,3,16,15,11,17,16,14,1,1,15,13,2,19,15,1,20,15,14,21,19,15,1,7,15,15,8,16,16,1,2,15,16,3,19,17,1,8,15,16,11,16,17,1,12,15,16,14,16,17,1,19,15,16,20,19,17,1,3,15,17,4,19,18,1,18,15,17,19,19,18,1,4,15,18,5,19,19,1,17,15,18,18,19,19,1,5,15,19,6,19,20,1,16,15,19,17,19,20,1,7,15,20,8,19,21,1,14,15,20,15,19,21,1,16,16,7,17,17,8,1,10,16,10,12,18,11,3,9,16,11,11,17,13,3,12,16,11,13,21,12,3,12,17,10,14,21,11,3,10,17,11,11,18,13,3,13,17,11,14,21,12,3,12,17,12,13,19,13,3,3,18,7,4,19,8,1,12,18,9,14,20,10,3,11,18,10,12,20,11,3,10,18,11,11,19,12,3,14,19,9,15,22,12,3,11,19,11,12,20,12,3,13,20,9,14,22,10,3,15,20,9,16,24,11,3,15,21,8,16,24,9,3,16,21,9,17,24,11,3,13,21,10,14,22,11,3,16,22,8,18,27,9,3,14,22,9,15,23,11,3,17,22,9,18,27,10,3,17,23,7,19,27,8,3,18,23,8,20,27,9,3,18,23,9,19,27,10,3,17,23,10,18,27,11,3,18,24,6,20,27,7,3,16,24,7,17,27,8,3,19,24,7,21,27,8,3,20,24,8,21,27,10,3,16,24,9,17,26,10,3,19,24,9,20,27,10,3,18,24,10,19,27,11,3,17,25,6,18,27,7,3,19,25,10,20,27,11,3];
  const MORTAR_S = 1 / 27, MORTAR_C = 11;                 // voxel size, and the model's centre column
  // bowl in plain stone (grey, like gen_mortar.py's palette), powder as sand, pestle in pale marble
  const MORTAR_FACES = { 1: [T.STONE,T.STONE,T.STONE,T.STONE,T.STONE,T.STONE],
                         2: [T.SAND,T.SAND,T.SAND,T.SAND,T.SAND,T.SAND],
                         3: [T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE] };
  const MORTAR_BOXES = [];
  for (let i = 0; i + 6 < MORTAR_VOX.length; i += 7) {
    const v = MORTAR_VOX, at = (n) => (n - MORTAR_C) * MORTAR_S + 0.5;
    MORTAR_BOXES.push([at(v[i]), v[i + 1] * MORTAR_S, at(v[i + 2]), at(v[i + 3]), v[i + 4] * MORTAR_S, at(v[i + 5]), v[i + 6]]);
  }
  PROPS[B.MORTAR] = { name:'Mortar and pestle', solid:true, opaque:false, raycast:true, pass:0, model:'voxel',
                      stack:10, hardness:2.0, type:'stone', mortar:true,   // `mortar`: it and its variants work as one
                      boxes:[[0.13, 0, 0.13, 0.87, 0.71, 0.87]],   // the bowl; the pestle is not in the way
                      voxBoxes: MORTAR_BOXES, matFaces: MORTAR_FACES, animMat: 3,   // the pestle moves
                      faces:[T.STONE,T.STONE,T.STONE,T.STONE,T.STONE,T.STONE],
                      desc: 'Keep its top clear: with a block or plant on it, it cannot be used' };   // 0.801
  PROPS[B.SULFUR_UP_TIP]   = { name:'Sulfur tip', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:50, hardness:0.6, type:'stone', boxes:[[0.2,0,0.2,0.8,0.8,0.8]], faces:[T.SULFUR_UP_TIP], desc: '' };
  // TNT: full cube. Variant byte's low bit (0/1) is the "lit" blink flag — mesher swaps faces to
  // the snow (white) tile when set, so a ticking TNT visibly pulses. hardness 0.5 for a quick pre-arm
  // break; a separate map (TNTS in blocks/tnt.js) protects blocks with an active fuse. Put down it sounds of cloth
  // (`placeSound`, read by playBlockSound in 32-sound.js); its own sound is heard when it is lit (armTNT).
  PROPS[B.TNT] = { name:'TNT', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:0.5, type:'tnt', placeSound:'wool', faces:[T.TNT_SIDE,T.TNT_SIDE,T.TNT_TOP,T.TNT_BOTTOM,T.TNT_SIDE,T.TNT_SIDE], desc: 'Light it with fire, a torch or flint' };
  // Obsidian: dark blast/lava-quench block. Very hard, pickaxe required (see MINE_REQ / TOOL_BLOCKS).
  PROPS[B.OBSIDIAN] = { name:'Obsidian', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:30, type:'stone', faces:[T.OBSIDIAN,T.OBSIDIAN,T.OBSIDIAN,T.OBSIDIAN,T.OBSIDIAN,T.OBSIDIAN], desc: '' };
  // Saplings — placed on grass, grow into a tree after 7..14 in-game days (tracked in SAPLINGS map)
  PROPS[B.OAK_SAPLING]   = { name:'Oak sapling',   solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.8,0.75]], faces:[T.OAK_SAPLING], desc: '' };
  PROPS[B.BIRCH_SAPLING] = { name:'Birch sapling', solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.8,0.75]], faces:[T.BIRCH_SAPLING], desc: '' };
  // Sugar cane — cross billboard; only placeable on sand/grass/dirt next to water, or stacked on
  // an existing cane. Column capped at 5 blocks tall. Break drops one sugar cane per broken block.
  PROPS[B.SUGAR_CANE]    = { name:'Sugar cane',    solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:50, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,1,0.9]], faces:[T.SUGAR_CANE], desc: '',
                             // by steps left to grow: 0 grown (a column's piece: emitCross), 1 stage 4 .. 5 the sprout
                             tilesByVar: [T.SUGAR_CANE, T.SUGAR_CANE_S4, T.SUGAR_CANE_S3, T.SUGAR_CANE_S2, T.SUGAR_CANE_S1, T.SUGAR_CANE_S0],
                             segTiles: [T.SUGAR_CANE_BOTTOM, T.SUGAR_CANE_MIDDLE, T.SUGAR_CANE_TOP] };
  PROPS[B.GRAVEL]      = { name:'Gravel',      solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:2.5, type:'ground',  faces:[T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL], desc: '' };
  PROPS[B.RED_MUSHROOM]  = { name:'Red mushroom',  solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:79, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.RED_MUSHROOM], desc: '' };
  // the third mushroom: grows wherever the red and brown do, and goes into mushroom stew
  PROPS[B.BLUE_MUSHROOM] = { name:'Blue mushroom', solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:79, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.BLUE_MUSHROOM], desc: '' };
  PROPS[B.BROWN_MUSHROOM]= { name:'Brown mushroom',solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:79, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.BROWN_MUSHROOM], desc: '' };
});
