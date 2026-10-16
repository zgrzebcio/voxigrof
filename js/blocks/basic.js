'use strict';
/* blocks/basic.js: log width (how thick a log or a cut is) and the plain blocks: stone, soil, sand, glass, ice...
   A part of BLOCK_CORE (blocks/blocks.js): it fills PROPS for its blocks. */

corePart('blocks', function () {
  /* ---- log width ----
     Log variant byte: bits 0-1 axis | bits 2-7 WIDTH INDEX (1..40).

     Textures are 64x64, so one block is 64 units across. Width index w maps to 8 + 2w units:
     index 1 = 10 (thinnest twig), 12 = 32 (half a block), 24 = 56 (the width every log in the
     game has had until now), 28 = 64 (exactly one block), up to 40 = 88 (a stump that bulges
     past its own cell). One field drives everything — the mesh, the collision box, branch taper,
     stump girth, and how many axe swings a cell takes to cut through, since felling just walks
     the width down.

     Index 0 means "unset" and reads as LOG_W_NORMAL. That is what keeps hand-placed logs, and
     every log in a world saved before this, looking exactly as they did. */
  const LOG_W_MIN = 1, LOG_W_MAX = 40;
  const LOG_W_BLOCK = 28;                                    // 64 units — a full cell
  // A log you hold, place or see in the inventory is a full block. Only grown wood is slimmer:
  // trunks sit at 60 units and branches well under that.
  const LOG_W_NORMAL = LOG_W_BLOCK;
  const logWidthPx = (w) => 8 + 2 * Math.max(LOG_W_MIN, Math.min(LOG_W_MAX, w));
  const logWidthOf = (variant) => ((variant >> 2) & 63) || LOG_W_NORMAL;
  // how much of a wooden log's width is cut off each of its long edges when meshed: 2 of 16 pixels
  const LOG_BEVEL = 0.125;
  function logCutBox(axis, w) {
    const t = (1 - logWidthPx(w) / 64) / 2;                  // inset per side; negative past 64
    return axis === 1 ? [0, t, t, 1, 1 - t, 1 - t]           // X-axis: inset Y,Z
         : axis === 2 ? [t, t, 0, 1 - t, 1 - t, 1]           // Z-axis: inset X,Y
         :              [t, 0, t, 1 - t, 1, 1 - t];          // Y-axis: inset X,Z
  }
  // indexed by the whole variant byte, so the width bits never fall through to prop.boxes
  const LOG_CUT_COLL = [];
  for (let v = 0; v < 256; v++) LOG_CUT_COLL[v] = [logCutBox(v & 3, logWidthOf(v))];
  PROPS[B.LOG]     = { name:'Oak log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:4.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.LOG,T.LOG,T.LOG_TOP,T.LOG_TOP,T.LOG,T.LOG], desc: '' };
  PROPS[B.PLANKS]  = { name:'Oak planks', solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:50, hardness:4.0, type:'wood', faces:[T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS], desc: '' };
  PROPS[B.LEAVES]  = { name:'Oak leaves',     solid:false, opaque:false, raycast:true,  pass:1, model:'cube', stack:50, hardness:0.4, type:'grass', faces:[T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES], desc: '' };
  PROPS[B.BIRCH_LOG]    = { name:'Birch log',    solid:true,  opaque:false,  raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:4.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.BIRCH_LOG,T.BIRCH_LOG,T.BIRCH_LOG_TOP,T.BIRCH_LOG_TOP,T.BIRCH_LOG,T.BIRCH_LOG], desc: '' };
  PROPS[B.BIRCH_PLANKS] = { name:'Birch planks', solid:true,  opaque:true,  raycast:true, pass:0, model:'cube', stack:50, hardness:3.0, type:'wood', faces:[T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS], desc: '' };
  PROPS[B.BIRCH_LEAVES] = { name:'Birch leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:50, hardness:0.4, type:'grass', faces:[T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES], desc: '' };
  PROPS[B.SAND]    = { name:'Sand',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:50, hardness:1.9, type:'ground', faces:[T.SAND_SIDE,T.SAND_SIDE,T.SAND,T.SAND,T.SAND_SIDE,T.SAND_SIDE], desc: '' };   // own sides 0.8091
  // pass 4: the see-through pass, blended without writing depth, so glass shows through glass (04-materials.js)
  PROPS[B.GLASS]   = { name:'Glass',      solid:true,  opaque:false, raycast:true,  pass:4, model:'cube', stack:50, hardness:0.9, type:'glass', faces:[T.GLASS,T.GLASS,T.GLASS,T.GLASS,T.GLASS,T.GLASS], desc: '' };
  PROPS[B.BEDROCK] = { name:'Bedrock',    solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:50, hardness:Infinity, type:'stone', faces:[T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK], desc: '' };
  PROPS[B.WATER]   = { name:'Water',      solid:false, opaque:false, raycast:false, pass:2, model:'cube', hardness:0, faces:[T.WATER,T.WATER,T.WATER,T.WATER,T.WATER,T.WATER], desc: '' };
  PROPS[B.GLOWSTONE] = { name:'Glow dust block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', light:20,handLight:10, stack:50, hardness:2.5, type:'glass', faces:[T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE], desc: '' };
  // the six halves a slab shape can fill: bottom, top, -X, +X, -Z, +Z (see CHISEL SHAPES below)
  const SLAB_HALF = [[0,0,0,1,0.5,1],[0,0.5,0,1,1,1],[0,0,0,0.5,1,1],[0.5,0,0,1,1,1],[0,0,0,1,1,0.5],[0,0,0.5,1,1,1]];
  PROPS[B.CLAY]    = { name:'Clay',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:50, hardness:2.2, type:'ground', faces:[T.CLAY,T.CLAY,T.CLAY,T.CLAY,T.CLAY,T.CLAY], desc: '' };
  PROPS[B.SNOW]    = { name:'Snow',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:50, hardness:1.2, type:'snow', faces:[T.SNOW,T.SNOW,T.SNOW,T.SNOW,T.SNOW,T.SNOW], desc: '' };
  /* Ice: see-through like glass (pass 4). It covers the water of a snow biome all year and every lake in winter
     but a desert's; breaking it leaves water and drops nothing, and heat melts it (seasons/seasons.js). */
  PROPS[B.ICE]     = { name:'Ice',        solid:true,  opaque:false, raycast:true,  pass:4, model:'cube', stack:50, hardness:0.5, type:'glass', faces:Array(6).fill(T.ICE),
                       desc: 'Breaks into water. Melts within 1 block of a torch, 3 of a lit furnace, 5 of fire, 9 of lava' };
  // packed ice: the ice spikes' and icebergs' ice, pressed hard over the years. Solid, it never melts; mined only
  PROPS[B.PACKED_ICE] = { name:'Packed ice', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:1.5, type:'glass',
                          faces:Array(6).fill(T.PACKED_ICE), desc: 'Ice pressed hard over the years: it never melts' };
  // the bone block: pressed from ten bones; a pillar that turns to the face it is put on, its brick a look of it
  PROPS[B.BONE_BLOCK] = { name:'Bone block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:2, type:'stone',
                          pillar: true, rot: 'all',
                          faces:[T.BONE_BLOCK_SIDE, T.BONE_BLOCK_SIDE, T.BONE_BLOCK_TOP, T.BONE_BLOCK_TOP, T.BONE_BLOCK_SIDE, T.BONE_BLOCK_SIDE], desc: '' };
});
