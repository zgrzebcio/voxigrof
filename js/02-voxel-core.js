'use strict';
/* voxiGrof — VOXEL_CORE + WORKER_MAIN: terrain gen, mesher, block registry. Stringified into the worker blob — MUST stay self-contained (no outer-scope references) */

/* ================================================================================================
   VOXEL_CORE — code shared verbatim between the main thread and the web workers.
   This function is stringified into the worker blob, so it must be fully self-contained
   (no references to outer-scope variables). It provides:
     - the block registry (IDs + per-type properties, per-face tiles, geometry model)
     - seeded simplex noise + terrain generator
     - the greedy mesher
   ================================================================================================ */
function VOXEL_CORE() {
  'use strict';

  /* ---------- block registry ----------
     Every block = numeric ID + properties. A voxel in storage is a uint32 (0.69; it was a
     uint16 until then):
       bits 0-7   = block ID
       bits 8-31  = variant/metadata — 24 bits, not 8. Every block that existed before 0.69 uses
                    only bits 8-15, so `(val >> 8) & 255` still reads its variant byte unchanged
                    and old saves load as-is. The extra 16 bits are what lets ONE cell describe a
                    whole stack of different materials (see the carpet layout below) instead of
                    just one number.
     `model` describes geometry: 'cube' is the only model implemented, but the mesher
     dispatches on it so slabs/stairs/torches can be added without touching cube code.
     `faces` = atlas tile per face, ordered [+X, -X, +Y(top), -Y(bottom), +Z, -Z].          */
  const T = { GRASS_TOP:0, GRASS_SIDE:1, DIRT:2, STONE:3, SAND:4, BEDROCK:5,
              LOG:6, LOG_TOP:7, PLANKS:8, LEAVES:9, GLASS:10, WATER:11, GLOWSTONE:12,
              CLAY:13, SNOW:14, GRASS_SNOW_SIDE:15, COBBLE:16,
              COAL_ORE:17, IRON_ORE:18, DIAMOND_ORE:19, GRAVEL:20, RED_MUSHROOM:21, BROWN_MUSHROOM:22,
              CRAFT_TOP:23, CRAFT_FRONT:24, CRAFT_SIDE:25, TORCH:26,
              FURNACE_FRONT:27, FURNACE_FRONT_ON:28, FURNACE_SIDE:29, FURNACE_TOP:30,
              RED_SAND:31, CACTUS_SIDE:32, CACTUS_TOP:33, CACTUS_BOTTOM:34, BRICKS:35, MELON_TOP:36, MELON_SIDE:37, STONE_BRICK:38, WOOL:39,
              PUMPKIN_TOP:40, PUMPKIN_SIDE:41, WHEAT:42, TIN_ORE:43, COPPER_ORE:44, GOLD_ORE:45,
              BIRCH_LOG:43, BIRCH_LOG_TOP:44, BIRCH_PLANKS:45, BIRCH_LEAVES:46,
              HAY_TOP:47, HAY_SIDE:48, MARBLE:49, GRANITE:50, LIMESTONE:51,
              GRASS_PLANT:52, POPPY:53, ORCHID:54, TALL_BOT:55, TALL_TOP:56, LAVA:57, TIN_ORE:58, GOLD_ORE:59, COPPER_ORE:60,
              OBSIDIAN:61, TNT_TOP:62, TNT_SIDE:63, TNT_BOTTOM:64, SULFUR_BLOCK:65, SULFUR_DOWN_TIP:66,
              SULFUR_UP_TIP:67, TNT_LIT:68, OAK_SAPLING:69, BIRCH_SAPLING:70, SUGAR_CANE:71,
              STRIPPED_LOG:72, STRIPPED_LOG_TOP:73, STRIPPED_BIRCH_LOG:74, STRIPPED_BIRCH_LOG_TOP:75,
              SPRUCE_LOG:76, SPRUCE_LOG_TOP:77, SPRUCE_PLANKS:78, SPRUCE_LEAVES:79, SPRUCE_SAPLING:80,
              STRIPPED_SPRUCE_LOG:81, STRIPPED_SPRUCE_LOG_TOP:82, PINCUSHION:83, STRUCTURE_BLOCK:84,
              BERRY_BUSH_EMPTY:85, BERRY_BUSH_FRUITLING:86, BERRY_BUSH_RED:87,
              FLINT_ROCK:88, FLINT_ROCK_TOP:89,
              BERRY_BUSH_BLUE:90, BERRY_BUSH_SMALL:91,
              GLOW_VINE:92, GLOWCRYSTAL:93,
              COBWEB:94, EMERALD_ORE:95, RUBY_ORE:96, SAPPHIRE_ORE:97,
              COAL_BLOCK:98, CHARCOAL_BLOCK:99, IRON_BLOCK:100, GOLD_BLOCK:101, TIN_BLOCK:102, COPPER_BLOCK:103,
              DIAMOND_BLOCK:104, EMERALD_BLOCK:105, RUBY_BLOCK:106, SAPPHIRE_BLOCK:107,
              RAW_IRON_BLOCK:108, RAW_GOLD_BLOCK:109, RAW_TIN_BLOCK:110, RAW_COPPER_BLOCK:111,
              TOPAZ_ORE:112, TOPAZ_BLOCK:113, SANDSTONE_TOP:114, SANDSTONE_SIDE:115, SANDSTONE_BOTTOM:116,
              RED_SANDSTONE_TOP:117, RED_SANDSTONE_SIDE:118, RED_SANDSTONE_BOTTOM:119, FIBER_BLOCK:120, LADDER:121,
              BLUE_MUSHROOM:122 };
  const B = { AIR:0, GRASS:1, DIRT:2, STONE:3, LOG:4, PLANKS:5, LEAVES:6, SAND:7,
              GLASS:8, BEDROCK:9, WATER:10, GLOWSTONE:11, CLAY:13, SNOW:14, COBBLE:15,
              COAL_ORE:16, IRON_ORE:17, DIAMOND_ORE:18, GRAVEL:19, RED_MUSHROOM:20, BROWN_MUSHROOM:21,
              CRAFTING_BENCH:22, TORCH:23, FURNACE:24, RED_SAND:25, CACTUS:26, DOOR:27,
              BRICKS:30, MELON:33, STONE_BRICK:34,
              WOOL:39, PUMPKIN:40, WHEAT:41,
              BIRCH_LOG:42, BIRCH_PLANKS:43, BIRCH_LEAVES:44, HAY:45, MARBLE:46, GRANITE:47, LIMESTONE:48,
              TALLGRASS:49, POPPY:50, ORCHID:51, TALL_LOWER:52, TALL_UPPER:53, TIN_ORE:54, GOLD_ORE:55, COPPER_ORE:56, LAVA:57,
              OBSIDIAN:59, SULFUR_BLOCK:60, SULFUR_DOWN_TIP:61, SULFUR_UP_TIP:62, OAK_SAPLING:63, BIRCH_SAPLING:64, SUGAR_CANE:65, TNT:66,
              BED:67, CHEST:68,
              // felling: a log is stripped before it can be cut through; leaves land as carpet
              STRIPPED_LOG:69, STRIPPED_BIRCH_LOG:70,
              SPRUCE_LOG:73, STRIPPED_SPRUCE_LOG:74, SPRUCE_PLANKS:75, SPRUCE_LEAVES:76,
              SPRUCE_SAPLING:78, PINCUSHION:79, STRUCTURE_BLOCK:80,
              // 58, 71, 72, 77 and 81 were the carpets until 0.785, when layers became a shape of the real
              // block (SHAPE_LAYER below). Old saves are converted by migrateLegacyLayers — never reuse them.
              /* Berry bushes (0.698, split in two in 0.7332): TWO blocks, one per fruit, each
                 running the same four growth stages in its variant byte. Red keeps id 82 so
                 existing worlds are untouched. */
              REDBERRY_BUSH:82,
              // flint stone (0.732): a dark nodule lying on the turf, picked by hand for flint
              FLINT_ROCK:83,
              BLUEBERRY_BUSH:84,
              // glow vine hanging on cave walls, and the block its crystals make (0.765)
              GLOW_VINE:85, GLOWCRYSTAL_BLOCK:86,
              // cave cobwebs and the three gem ores (0.766)
              COBWEB:87, EMERALD_ORE:88, RUBY_ORE:89, SAPPHIRE_ORE:90,
              // storage blocks: ten of a material pressed into one (0.768)
              COAL_BLOCK:91, CHARCOAL_BLOCK:92, IRON_BLOCK:93, GOLD_BLOCK:94, TIN_BLOCK:95, COPPER_BLOCK:96,
              DIAMOND_BLOCK:97, EMERALD_BLOCK:98, RUBY_BLOCK:99, SAPPHIRE_BLOCK:100,
              RAW_IRON_BLOCK:101, RAW_GOLD_BLOCK:102, RAW_TIN_BLOCK:103, RAW_COPPER_BLOCK:104,
              // topaz, sandstones, the fiber block and the ladder (0.769)
              TOPAZ_ORE:105, TOPAZ_BLOCK:106, SANDSTONE:107, RED_SANDSTONE:108, FIBER_BLOCK:109, LADDER:110,
              BLUE_MUSHROOM:111,                                      // 0.7691
              MORTAR:112,                                             // 0.77
              // hollow logs (0.7842): bark shells that hold soil or sand. 113-124 stay unused, see below
              HOLLOW_LOG:125, HOLLOW_BIRCH_LOG:126, HOLLOW_SPRUCE_LOG:127, };
  /* ids 12, 28, 29, 31, 32, 35-38 and 113-124 were slabs and stairs until 0.783, when shapes became variants
     of the full block (SHAPE_SLAB below). Old saves are converted by migrateLegacyVal — never reuse them. */
  /* variant byte layout:
     - grass: 1 = snowy sides
     - rot:'side' blocks (furnace, bench): bits 0-1 = facing (0:+Z 1:-Z 2:+X 3:-X);
       furnace additionally uses bit 2 (value 4) = lit
     - log (rot:'all'): 0 = Y axis, 1 = X (lying), 2 = Z (lying)
     - slab (rot:'all'): 0 bottom, 1 top(ceiling), 2..5 vertical halves (-X,+X,-Z,+Z side) */
  const V = { GRASS_SNOWY:1, FURNACE_ON:4 };
  const SIDE_FACE = [4, 5, 0, 1];            // facing bits -> faces[] index of the front
  // pass: 0 = opaque, 1 = cutout/transparent (leaves, glass), 2 = water
  // `light` = block-light emission level (0..15); glowstone lights up to 14 blocks around
  const PROPS = [];
  // `hardness` = seconds to break by hand in survival. Infinity = unbreakable (bedrock).
  PROPS[B.AIR]     = { name:'Air', solid:false, opaque:false, raycast:false, pass:0, model:'cube', hardness:0,    faces:null, desc: '' };
  PROPS[B.GRASS]   = { name:'Grass', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2.0, type:'grass', faces:[T.GRASS_SIDE,T.GRASS_SIDE,T.GRASS_TOP,T.DIRT,T.GRASS_SIDE,T.GRASS_SIDE], desc: '' };
  PROPS[B.DIRT]    = { name:'Dirt', solid:true,  opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:1.8, type:'ground', faces:[T.DIRT,T.DIRT,T.DIRT,T.DIRT,T.DIRT,T.DIRT], desc: '' };
  PROPS[B.STONE]   = { name:'Stone', solid:true,  opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:8.0, type:'stone', faces:[T.STONE,T.STONE,T.STONE,T.STONE,T.STONE,T.STONE], desc: '' };
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
  function logCutBox(axis, w) {
    const t = (1 - logWidthPx(w) / 64) / 2;                  // inset per side; negative past 64
    return axis === 1 ? [0, t, t, 1, 1 - t, 1 - t]           // X-axis: inset Y,Z
         : axis === 2 ? [t, t, 0, 1 - t, 1 - t, 1]           // Z-axis: inset X,Y
         :              [t, 0, t, 1 - t, 1, 1 - t];          // Y-axis: inset X,Z
  }
  // indexed by the whole variant byte, so the width bits never fall through to prop.boxes
  const LOG_CUT_COLL = [];
  for (let v = 0; v < 256; v++) LOG_CUT_COLL[v] = [logCutBox(v & 3, logWidthOf(v))];
  PROPS[B.LOG]     = { name:'Oak log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:4.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.LOG,T.LOG,T.LOG_TOP,T.LOG_TOP,T.LOG,T.LOG], desc: '' };
  PROPS[B.PLANKS]  = { name:'Oak planks', solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:4.0, type:'wood', faces:[T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS], desc: '' };
  PROPS[B.LEAVES]  = { name:'Oak leaves',     solid:false, opaque:false, raycast:true,  pass:1, model:'cube', stack:60, hardness:0.4, type:'grass', faces:[T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES], desc: '' };
  PROPS[B.BIRCH_LOG]    = { name:'Birch log',    solid:true,  opaque:false,  raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:4.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.BIRCH_LOG,T.BIRCH_LOG,T.BIRCH_LOG_TOP,T.BIRCH_LOG_TOP,T.BIRCH_LOG,T.BIRCH_LOG], desc: '' };
  PROPS[B.BIRCH_PLANKS] = { name:'Birch planks', solid:true,  opaque:true,  raycast:true, pass:0, model:'cube', stack:60, hardness:3.0, type:'wood', faces:[T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS], desc: '' };
  PROPS[B.BIRCH_LEAVES] = { name:'Birch leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:60, hardness:0.4, type:'grass', faces:[T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES], desc: '' };
  PROPS[B.SAND]    = { name:'Sand',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:1.9, type:'ground', faces:[T.SAND,T.SAND,T.SAND,T.SAND,T.SAND,T.SAND], desc: '' };
  PROPS[B.GLASS]   = { name:'Glass',      solid:true,  opaque:false, raycast:true,  pass:1, model:'cube', stack:60, hardness:0.9, type:'glass', faces:[T.GLASS,T.GLASS,T.GLASS,T.GLASS,T.GLASS,T.GLASS], desc: '' };
  PROPS[B.BEDROCK] = { name:'Bedrock',    solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:Infinity, type:'stone', faces:[T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK], desc: '' };
  PROPS[B.WATER]   = { name:'Water',      solid:false, opaque:false, raycast:false, pass:2, model:'cube', hardness:0, faces:[T.WATER,T.WATER,T.WATER,T.WATER,T.WATER,T.WATER], desc: '' };
  PROPS[B.GLOWSTONE] = { name:'Glowstone', solid:true, opaque:true, raycast:true, pass:0, model:'cube', light:20,handLight:10, stack:60, hardness:2.5, type:'glass', faces:[T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE], desc: '' };
  // the six halves a slab shape can fill: bottom, top, -X, +X, -Z, +Z (see CHISEL SHAPES below)
  const SLAB_HALF = [[0,0,0,1,0.5,1],[0,0.5,0,1,1,1],[0,0,0,0.5,1,1],[0.5,0,0,1,1,1],[0,0,0,1,1,0.5],[0,0,0.5,1,1,1]];
  PROPS[B.CLAY]    = { name:'Clay',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:2.2, type:'ground', faces:[T.CLAY,T.CLAY,T.CLAY,T.CLAY,T.CLAY,T.CLAY], desc: '' };
  PROPS[B.SNOW]    = { name:'Snow',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:1.2, type:'snow', faces:[T.SNOW,T.SNOW,T.SNOW,T.SNOW,T.SNOW,T.SNOW], desc: '' };
  /* Stripped logs: what a log becomes after the first axe hit. Same 'log' model so the 0.6692
     gap-fill still welds them to their neighbours, and softer than a live log because the bark
     is already off. */
  PROPS[B.STRIPPED_LOG]       = { name:'Stripped oak log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:3.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_LOG,T.STRIPPED_LOG,T.STRIPPED_LOG_TOP,T.STRIPPED_LOG_TOP,T.STRIPPED_LOG,T.STRIPPED_LOG], desc: '' };
  PROPS[B.STRIPPED_BIRCH_LOG] = { name:'Stripped birch log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:3.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_BIRCH_LOG,T.STRIPPED_BIRCH_LOG,T.STRIPPED_BIRCH_LOG_TOP,T.STRIPPED_BIRCH_LOG_TOP,T.STRIPPED_BIRCH_LOG,T.STRIPPED_BIRCH_LOG], desc: '' };
  /* Spruce: the cold-forest conifer. */
  PROPS[B.SPRUCE_LOG]          = { name:'Spruce log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:4.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.SPRUCE_LOG,T.SPRUCE_LOG,T.SPRUCE_LOG_TOP,T.SPRUCE_LOG_TOP,T.SPRUCE_LOG,T.SPRUCE_LOG], desc: '' };
  PROPS[B.STRIPPED_SPRUCE_LOG] = { name:'Stripped spruce log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:3.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_SPRUCE_LOG,T.STRIPPED_SPRUCE_LOG,T.STRIPPED_SPRUCE_LOG_TOP,T.STRIPPED_SPRUCE_LOG_TOP,T.STRIPPED_SPRUCE_LOG,T.STRIPPED_SPRUCE_LOG], desc: '' };
  PROPS[B.SPRUCE_PLANKS]       = { name:'Spruce planks', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:3.0, type:'wood', faces:[T.SPRUCE_PLANKS,T.SPRUCE_PLANKS,T.SPRUCE_PLANKS,T.SPRUCE_PLANKS,T.SPRUCE_PLANKS,T.SPRUCE_PLANKS], desc: '' };
  PROPS[B.SPRUCE_LEAVES]       = { name:'Spruce leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:60, hardness:0.4, type:'grass', faces:[T.SPRUCE_LEAVES,T.SPRUCE_LEAVES,T.SPRUCE_LEAVES,T.SPRUCE_LEAVES,T.SPRUCE_LEAVES,T.SPRUCE_LEAVES], desc: '' };
  PROPS[B.SPRUCE_SAPLING]      = { name:'Spruce sapling', solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.8,0.75]], faces:[T.SPRUCE_SAPLING], desc: '' };
  PROPS[B.COBBLE]      = { name:'Cobblestone', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:8.0, type:'stone', faces:[T.COBBLE,T.COBBLE,T.COBBLE,T.COBBLE,T.COBBLE,T.COBBLE], desc: '' };
  PROPS[B.COAL_ORE]    = { name:'Coal ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:9.0, type:'stone', faces:[T.COAL_ORE,T.COAL_ORE,T.COAL_ORE,T.COAL_ORE,T.COAL_ORE,T.COAL_ORE], desc: '' };
  PROPS[B.IRON_ORE]    = { name:'Iron ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:12.0, type:'stone', selfGlow:2, faces:[T.IRON_ORE,T.IRON_ORE,T.IRON_ORE,T.IRON_ORE,T.IRON_ORE,T.IRON_ORE], desc: '' };
  PROPS[B.DIAMOND_ORE] = { name:'Diamond ore', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:18.0, type:'stone', selfGlow:3, faces:[T.DIAMOND_ORE,T.DIAMOND_ORE,T.DIAMOND_ORE,T.DIAMOND_ORE,T.DIAMOND_ORE,T.DIAMOND_ORE], desc: '' };
  PROPS[B.COPPER_ORE]    = { name:'Copper ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:10.0, type:'stone', selfGlow:2, faces:[T.COPPER_ORE,T.COPPER_ORE,T.COPPER_ORE,T.COPPER_ORE,T.COPPER_ORE,T.COPPER_ORE], desc: '' };
  PROPS[B.TIN_ORE]    = { name:'Tin ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:13.0, type:'stone', selfGlow:2, faces:[T.TIN_ORE,T.TIN_ORE,T.TIN_ORE,T.TIN_ORE,T.TIN_ORE,T.TIN_ORE], desc: '' };
  PROPS[B.GOLD_ORE]    = { name:'Gold ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:15.0, type:'stone',  selfGlow:2, faces:[T.GOLD_ORE,T.GOLD_ORE,T.GOLD_ORE,T.GOLD_ORE,T.GOLD_ORE,T.GOLD_ORE], desc: '' };
  PROPS[B.MARBLE]      = { name:'Marble',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:8.0, type:'stone', faces:[T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE], desc: '' };
  PROPS[B.GRANITE]     = { name:'Granite',   solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:8.5, type:'stone', faces:[T.GRANITE,T.GRANITE,T.GRANITE,T.GRANITE,T.GRANITE,T.GRANITE], desc: '' };
  PROPS[B.LIMESTONE]   = { name:'Limestone', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:7.5, type:'stone', faces:[T.LIMESTONE,T.LIMESTONE,T.LIMESTONE,T.LIMESTONE,T.LIMESTONE,T.LIMESTONE], desc: '' };
  PROPS[B.LAVA]        = { name:'Lava',      solid:false,opaque:false, raycast:false, pass:3, model:'cube', light:15, hardness:0, faces:[T.LAVA,T.LAVA,T.LAVA,T.LAVA,T.LAVA,T.LAVA], desc: '' };
  // Sulfur crystal block: full opaque cube, drops itself. Common cave form.
  PROPS[B.SULFUR_BLOCK] = { name:'Sulfur block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2.5, type:'stone', faces:[T.SULFUR_BLOCK,T.SULFUR_BLOCK,T.SULFUR_BLOCK,T.SULFUR_BLOCK,T.SULFUR_BLOCK,T.SULFUR_BLOCK], desc: '' };
  // Sulfur tip billboards: cross model, two orientations. Down tip = stalactite (from ceiling),
  // up tip = stalagmite (from floor). Break drops ITEM.SULFUR only (handled in blockDrop).
  // Sulfur tip — single placeable block with rotation via variant (0 = up, 1 = down).
  // Legacy SULFUR_DOWN_TIP kept for storage compatibility, hidden from inventory, drops as SULFUR_UP_TIP.
  PROPS[B.SULFUR_DOWN_TIP] = { name:'Sulfur tip', solid:false, opaque:false, raycast:true, pass:1, model:'cross', noInv:true, stack:60, hardness:0.6, type:'stone', boxes:[[0.2,0.2,0.2,0.8,1,0.8]], faces:[T.SULFUR_DOWN_TIP], desc: '' };
  /* Glow vine (0.765): a thin plate against the wall it hangs on, drawn like a carpet turned upright
     ('wall' model, see the carpet branch of the mesher). Walk-through, climbable, and a light source.
     Variant = the wall it clings to: 0 -Z, 1 +Z, 2 -X, 3 +X. */
  const WALL_T = 1 / 16;
  const WALL_VAR = [[[0, 0, 0, 1, 1, WALL_T]], [[0, 0, 1 - WALL_T, 1, 1, 1]],
                    [[0, 0, 0, WALL_T, 1, 1]], [[1 - WALL_T, 0, 0, 1, 1, 1]]];
  PROPS[B.GLOW_VINE] = { name:'Glow vine', solid:false, opaque:false, raycast:true, pass:1, model:'wall', climbable:true,
                         light:10, stack:60, hardness:0.3, type:'grass', boxes:WALL_VAR[0], boxesByVar:WALL_VAR,
                         faces:[T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE], desc: '' };
  // five glow crystals pressed into a block: brighter than glowstone's reach, a real room light (0.765)
  PROPS[B.GLOWCRYSTAL_BLOCK] = { name:'Glowcrystal block', solid:true, opaque:true, raycast:true, pass:0, model:'cube',
                         light:18, handLight:12, stack:60, hardness:2.5, type:'glass',
                         faces:[T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL], desc: '' };
  /* Cobweb (0.766): a billboard strung in cave corners — floor, wall or ceiling, it needs no support.
     Walking into one slows you by 80% (12-player.js); only a sword cuts the string out of it. */
  PROPS[B.COBWEB] = { name:'Cobweb', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:60,
                      hardness:0.8, type:'wool', boxes:[[0.05,0,0.05,0.95,1,0.95]],
                      faces:[T.COBWEB,T.COBWEB,T.COBWEB,T.COBWEB,T.COBWEB,T.COBWEB], desc: '' };
  // gem ores (0.766): an iron pickaxe or better, and they glow like diamond ore so they read in the dark
  PROPS[B.EMERALD_ORE]  = { name:'Emerald ore',  solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:15.0, type:'stone', selfGlow:3, faces:[T.EMERALD_ORE,T.EMERALD_ORE,T.EMERALD_ORE,T.EMERALD_ORE,T.EMERALD_ORE,T.EMERALD_ORE], desc: '' };
  PROPS[B.RUBY_ORE]     = { name:'Ruby ore',     solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:15.0, type:'stone', selfGlow:3, faces:[T.RUBY_ORE,T.RUBY_ORE,T.RUBY_ORE,T.RUBY_ORE,T.RUBY_ORE,T.RUBY_ORE], desc: '' };
  PROPS[B.SAPPHIRE_ORE] = { name:'Sapphire ore', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:15.0, type:'stone', selfGlow:3, faces:[T.SAPPHIRE_ORE,T.SAPPHIRE_ORE,T.SAPPHIRE_ORE,T.SAPPHIRE_ORE,T.SAPPHIRE_ORE,T.SAPPHIRE_ORE], desc: '' };
  /* Storage blocks (0.768): ten of a material pressed into one block, and back again at the bench. Plain
     cubes that drop themselves; the coal and charcoal ones burn in a furnace (26-furnace.js). */
  for (const [bid, name, tile] of [
    [B.COAL_BLOCK, 'Block of coal', T.COAL_BLOCK],         [B.CHARCOAL_BLOCK, 'Block of charcoal', T.CHARCOAL_BLOCK],
    [B.IRON_BLOCK, 'Block of iron', T.IRON_BLOCK],         [B.GOLD_BLOCK, 'Block of gold', T.GOLD_BLOCK],
    [B.TIN_BLOCK, 'Block of tin', T.TIN_BLOCK],            [B.COPPER_BLOCK, 'Block of copper', T.COPPER_BLOCK],
    [B.DIAMOND_BLOCK, 'Block of diamond', T.DIAMOND_BLOCK], [B.EMERALD_BLOCK, 'Block of emerald', T.EMERALD_BLOCK],
    [B.RUBY_BLOCK, 'Block of ruby', T.RUBY_BLOCK],         [B.SAPPHIRE_BLOCK, 'Block of sapphire', T.SAPPHIRE_BLOCK],
    [B.RAW_IRON_BLOCK, 'Block of raw iron', T.RAW_IRON_BLOCK], [B.RAW_GOLD_BLOCK, 'Block of raw gold', T.RAW_GOLD_BLOCK],
    [B.RAW_TIN_BLOCK, 'Block of raw tin', T.RAW_TIN_BLOCK],   [B.RAW_COPPER_BLOCK, 'Block of raw copper', T.RAW_COPPER_BLOCK],
    [B.TOPAZ_BLOCK, 'Block of topaz', T.TOPAZ_BLOCK],                                              // 0.769
  ])
    PROPS[bid] = { name, solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:6.0, type:'stone',
                   faces:[tile,tile,tile,tile,tile,tile], desc: '' };
  // topaz ore (0.769): the fourth gem, same rules as the others
  PROPS[B.TOPAZ_ORE] = { name:'Topaz ore', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:15.0, type:'stone', selfGlow:3, faces:[T.TOPAZ_ORE,T.TOPAZ_ORE,T.TOPAZ_ORE,T.TOPAZ_ORE,T.TOPAZ_ORE,T.TOPAZ_ORE], desc: '' };
  // sandstone (0.769): five sand of its colour, with its own top, side and bottom faces [+X,-X,top,bottom,+Z,-Z]
  PROPS[B.SANDSTONE]     = { name:'Sandstone',     solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:4.0, type:'stone',
                             faces:[T.SANDSTONE_SIDE,T.SANDSTONE_SIDE,T.SANDSTONE_TOP,T.SANDSTONE_BOTTOM,T.SANDSTONE_SIDE,T.SANDSTONE_SIDE], desc: '' };
  PROPS[B.RED_SANDSTONE] = { name:'Red sandstone', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:4.0, type:'stone',
                             faces:[T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_TOP,T.RED_SANDSTONE_BOTTOM,T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_SIDE], desc: '' };
  // fiber block (0.769): ten fiber pressed together. Soft enough to pull apart by hand; rarely found in plains
  PROPS[B.FIBER_BLOCK]   = { name:'Fiber block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:0.8, type:'grass',
                             faces:[T.FIBER_BLOCK,T.FIBER_BLOCK,T.FIBER_BLOCK,T.FIBER_BLOCK,T.FIBER_BLOCK,T.FIBER_BLOCK], desc: '' };
  /* Ladder (0.769): a glow vine made of sticks — the same upright plate on a wall, climbed the same way,
     but no light. Wood, and it comes down by hand as quickly as a crafting bench does. */
  PROPS[B.LADDER] = { name:'Ladder', solid:false, opaque:false, raycast:true, pass:1, model:'wall', climbable:true,
                      stack:60, hardness:4.5, type:'wood', boxes:WALL_VAR[0], boxesByVar:WALL_VAR,
                      faces:[T.LADDER,T.LADDER,T.LADDER,T.LADDER,T.LADDER,T.LADDER], desc: '' };
  /* Mortar and pestle (0.77): a carved stone bowl with its pestle, built from a voxel model
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
                      stack:10, hardness:3.0, type:'stone',
                      boxes:[[0.13, 0, 0.13, 0.87, 0.71, 0.87]],   // the bowl; the pestle is not in the way
                      voxBoxes: MORTAR_BOXES, matFaces: MORTAR_FACES, animMat: 3,   // the pestle moves (0.772)
                      faces:[T.STONE,T.STONE,T.STONE,T.STONE,T.STONE,T.STONE], desc: '' };
  PROPS[B.SULFUR_UP_TIP]   = { name:'Sulfur tip', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:60, hardness:0.6, type:'stone', boxes:[[0.2,0,0.2,0.8,0.8,0.8]], faces:[T.SULFUR_UP_TIP], desc: '' };
  // TNT: full cube. Variant byte's low bit (0/1) is the "lit" blink flag — mesher swaps faces to
  // the snow (white) tile when set, so a ticking TNT visibly pulses. hardness 0.5 for a quick pre-arm
  // break; a separate map (TNTS in 22-main-loop.js) protects blocks with an active fuse.
  PROPS[B.TNT] = { name:'TNT', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:0.5, type:'tnt', faces:[T.TNT_SIDE,T.TNT_SIDE,T.TNT_TOP,T.TNT_BOTTOM,T.TNT_SIDE,T.TNT_SIDE], desc: '' };
  // Obsidian: dark blast/lava-quench block. Very hard, pickaxe required (see MINE_REQ / TOOL_BLOCKS).
  PROPS[B.OBSIDIAN] = { name:'Obsidian', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:30, type:'stone', faces:[T.OBSIDIAN,T.OBSIDIAN,T.OBSIDIAN,T.OBSIDIAN,T.OBSIDIAN,T.OBSIDIAN], desc: '' };
  // Saplings — placed on grass, grow into a tree after 7..14 in-game days (tracked in SAPLINGS map)
  PROPS[B.OAK_SAPLING]   = { name:'Oak sapling',   solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.8,0.75]], faces:[T.OAK_SAPLING], desc: '' };
  PROPS[B.BIRCH_SAPLING] = { name:'Birch sapling', solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.8,0.75]], faces:[T.BIRCH_SAPLING], desc: '' };
  // Sugar cane — cross billboard; only placeable on sand/grass/dirt next to water, or stacked on
  // an existing cane. Column capped at 5 blocks tall. Break drops one sugar cane per broken block.
  PROPS[B.SUGAR_CANE]    = { name:'Sugar cane',    solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:64, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,1,0.9]], faces:[T.SUGAR_CANE], desc: '' };
  PROPS[B.GRAVEL]      = { name:'Gravel',      solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2.5, type:'ground',  faces:[T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL], desc: '' };
  PROPS[B.RED_MUSHROOM]  = { name:'Red mushroom',  solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:99, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.RED_MUSHROOM], desc: '' };
  // the third mushroom (0.7691): grows wherever the red and brown do, and goes into mushroom stew
  PROPS[B.BLUE_MUSHROOM] = { name:'Blue mushroom', solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:99, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.BLUE_MUSHROOM], desc: '' };
  PROPS[B.BROWN_MUSHROOM]= { name:'Brown mushroom',solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:99, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.BROWN_MUSHROOM], desc: '' };
  PROPS[B.TALLGRASS]     = { name:'Short grass',   solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',rot:'all',topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,0.9,0.9]], faces:[T.GRASS_PLANT], desc: '' };
  PROPS[B.POPPY]         = { name:'Poppy',   solid:false,opaque:false,raycast:true, pass:1, model:'cross',topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.85,0.75]], faces:[T.POPPY], desc: '' };
  PROPS[B.ORCHID]        = { name:'Blue orchid',solid:false,opaque:false,raycast:true, pass:1, model:'cross',topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.85,0.75]], faces:[T.ORCHID], desc: '' };
  PROPS[B.TALL_LOWER]    = { name:'Tall grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, noInv:true, stack:99, type:'grass', hardness:0, boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.TALL_BOT], desc: '' };
  PROPS[B.TALL_UPPER]    = { name:'Tall grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',noInv:true, stack:99, hardness:0, type:'grass', boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.TALL_TOP], desc: '' };
  // faces [+X,-X,top,bottom,+Z,-Z]; front picked per variant (rot:'side') in the mesher
  PROPS[B.CRAFTING_BENCH] = { name:'Crafting bench', solid:true, opaque:true, raycast:true, pass:0, model:'cube', rot:'side', stack:30, hardness:4.5, type:'wood', faces:[T.CRAFT_SIDE,T.CRAFT_SIDE,T.CRAFT_TOP,T.PLANKS,T.CRAFT_FRONT,T.CRAFT_FRONT], desc: '' };
  // torch: cross model (texture has transparent margins so it reads as a small stick),
  // light 10 placed / 5 in hand (handLight overrides the default held-light scaling),
  // topOnly = placeable only when clicking a block's top face
  /* Torch variants (0.7451): 0 stands on the floor; 1-4 hang on a wall and lean AWAY from it —
     toward +X, -X, +Z, -Z respectively (the clicked face's normal). The mesher draws a real stick
     for it (emitTorch); these are the matching ray/selection boxes, one per variant, so the
     outline follows the lean. `model` stays 'cross' on purpose: free breaking, hand breaking, the
     pop-off support rule and the placement rule all key off it. */
  // wall variants hug the leaning stick (0.757): foot on the wall plane, top 0.26 out, 1/8 wide
  const TORCH_RAY_BOXES = [
    [[0.40, 0,    0.40, 0.60, 0.70, 0.60]],
    [[0.00, 0.18, 0.43, 0.33, 0.81, 0.57]],
    [[0.67, 0.18, 0.43, 1.00, 0.81, 0.57]],
    [[0.43, 0.18, 0.00, 0.57, 0.81, 0.33]],
    [[0.43, 0.18, 0.67, 0.57, 0.81, 1.00]],
  ];
  PROPS[B.TORCH] = { name:'Torch', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:99, hardness:0, light:15, handLight:8, topOnly:true, type:'wood', boxes:[[0.4,0,0.4,0.6,0.7,0.6]], rayBoxesByVar: TORCH_RAY_BOXES, faces:[T.TORCH], desc: '' };
  // furnace: front picked per variant facing (rot:'side'); lit bit swaps the front tile
  PROPS[B.FURNACE] = { name:'Furnace', solid:true, opaque:true, raycast:true, pass:0, model:'cube', rot:'side', stack:30, hardness:8.5, type:'stone',  faces:[T.FURNACE_SIDE,T.FURNACE_SIDE,T.FURNACE_TOP,T.FURNACE_TOP,T.FURNACE_FRONT,T.FURNACE_SIDE], desc: '' };
  PROPS[B.RED_SAND] = { name:'Red Sand', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2.1, type:'ground', faces:[T.RED_SAND,T.RED_SAND,T.RED_SAND,T.RED_SAND,T.RED_SAND,T.RED_SAND], desc: '' };
  // oak door: 2-cell (bottom + upper half), 1/8 thick. Rendered as an animated standalone mesh
  // (27-doors.js) — the chunk mesher emits nothing for it. Collision boxes swap with the open
  // bit so an open door is passable. variant: bits 0-1 facing, bit 2 open, bit 3 upper half,
  // bit 4 (16) = hinged on the RIGHT instead of the left (mirrored swing; two doors side by side
  // with opposite hinges form a double door that opens outward from the middle).
  {
    const t = 0.125;
    const closed = [[[0,0,0,1,1,t]], [[0,0,1-t,1,1,1]], [[0,0,0,t,1,1]], [[1-t,0,0,1,1,1]]];
    // open door: thin panel flush against a side wall INSIDE its own cell. 27-doors.js applies a
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
    PROPS[B.DOOR] = { name:'Oak door', solid:true, opaque:false, raycast:true, pass:1, model:'door', rot:'side', stack:20, hardness:3.5, type:'wood', boxes:closed[0], boxesByVar:bv, rayBoxesByVar:rv, faces:[T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS], desc: '' };
  }
  // Bed: 2 cells long (1 wide x 9/16 tall). Like the door the mesher emits nothing for it —
  // 29-bed.js draws one textured mesh per bed. The cells stay for collision + raycast.
  // variant byte: bits 0-1 facing (0:+Z 1:-Z 2:+X 3:-X), bit 3 (8) = HEAD half.
  // Chest: storage with an animated lid, drawn by 30-chest.js (mesher emits nothing).
  // variant byte: bits 0-1 facing. Two chests facing the same way, side by side, form a double.
  PROPS[B.CHEST] = { name:'Chest', solid:true, opaque:false, raycast:true, pass:1, model:'chest', rot:'side',
                     stack:60, hardness:4.5, type:'wood', boxes:[[0.0625, 0, 0.0625, 0.9375, 0.9375, 0.9375]],   // 4.5 = bench (0.769)
                     faces:[T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS], desc: '' };
  PROPS[B.BED] = { name:'Bed', solid:true, opaque:false, raycast:true, pass:1, model:'bed', rot:'side',
                   stack:1, hardness:1.0, type:'wood', boxes:[[0, 0, 0, 1, 0.5625, 1]],
                   faces:[T.WOOL,T.WOOL,T.WOOL,T.PLANKS,T.WOOL,T.WOOL], desc: '' };
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
  // cactus: own model — side faces inset 1/16 so the column reads thin; touching it hurts (19-vitals)
  /* Cactus runs on the LOG model. It gains an axis and a width index for free, which is what lets
     a saguaro put out arms: the arm is a horizontal cactus cell that flares into the trunk exactly
     the way a branch does. `family` keeps it from welding itself to actual wood if the two ever
     end up adjacent. No stripping and no leaves — those live in 33-felling, which only knows about
     the wood ids. */
  PROPS[B.CACTUS] = { name:'Cactus', solid:true, opaque:false, raycast:true, pass:1, model:'log', rot:'all', family:'cactus', stack:60, hardness:1.4, type:'grass', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.CACTUS_SIDE,T.CACTUS_SIDE,T.CACTUS_TOP,T.CACTUS_BOTTOM,T.CACTUS_SIDE,T.CACTUS_SIDE], desc: '' };
  /* Build tool, not a material: it has no recipe, so it only ever reaches a player through the
     creative palette. Left fully solid so a capture volume can be lined up against it. */
  PROPS[B.STRUCTURE_BLOCK] = { name:'Structure block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:1, hardness:1.0, type:'stone', faces:[T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK], desc: '' };
  /* Berry bushes (0.7332) — TWO separate blocks, red and blue, rather than one block with a
     colour bit. They share the first three stages of art (a sprout and a bare bush look the same
     whatever they will fruit into) and differ only at ripe, which is exactly how the art is
     drawn, so the split costs one block id and removes the bit-packing entirely.

     Cross billboards, `noTarget` like the grass, so the crosshair passes through and the ONLY way
     to work one is bush pickup: a ripe bush hands over its berries and drops back to empty, then
     regrows on its own. The variant byte is now nothing but the STAGE, and the stage numbers are
     the growth order, so advancing is stage + 1.

     Red keeps block id 82, so an existing world's bushes stay bushes. They do each shift down one
     stage once (0.7331 renumbering), which the regrow timer undoes on its own. */
  const BERRY_STAGE = { SMALL: 0, EMPTY: 1, FRUITLING: 2, GROWN: 3 };
  const berryStage = (v) => v & 3;
  const isBerryBush = (id) => id === B.REDBERRY_BUSH || id === B.BLUEBERRY_BUSH;
  const _berryBush = (name, ripe) => ({
    name, solid:false, opaque:false, raycast:true, noTarget:true,
    pass:1, model:'cross', topOnly:true, stack:99, hardness:0, type:'grass',
    boxes:[[0.1,0,0.1,0.9,0.9,0.9]], faces:[T.BERRY_BUSH_EMPTY],
    // indexed by stage: only the ripe tile differs between the two bushes
    tilesByVar:[T.BERRY_BUSH_SMALL, T.BERRY_BUSH_EMPTY, T.BERRY_BUSH_FRUITLING, ripe],
    desc: '',
  });
  PROPS[B.REDBERRY_BUSH]  = _berryBush('Red berry bush',  T.BERRY_BUSH_RED);
  PROPS[B.BLUEBERRY_BUSH] = _berryBush('Blue berry bush', T.BERRY_BUSH_BLUE);
  PROPS[B.PINCUSHION] = { name:'Pincushion', solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.7,0.75]], faces:[T.PINCUSHION], desc: '' };
  /* Flint stone (0.732) — a dark nodule lying on the turf. Built on the `carpet` model, which is
     just "one flat box, chosen by variant", so it renders as a low slab rather than a full cube;
     it has a single variant because nothing about it stacks. `noTarget` puts it in the same class
     as the grass and the berry bush: the crosshair passes straight through and BUSH PICKUP is how
     you take it, which is what makes it a stoop-and-grab rather than something you mine. */
  /* 16 x 8 x 16 of this game's 64-pixel block (0.7332), i.e. a quarter of a cell wide and an
     eighth of one tall — a pebble sitting in the middle of its cell, not a slab covering it.
     0.733 shipped this eight times too big by reading the pixel sizes against a 16-unit block;
     voxiGrof's unit is 64, so every pixel dimension here divides by 64.
     One entry, because the variant byte means nothing here; the array shape is only what the
     carpet model expects. */
  const FR = 1 / 64;
  const FLINT_ROCK_BOX = [[[24 * FR, 0, 24 * FR, 40 * FR, 8 * FR, 40 * FR]]];
  PROPS[B.FLINT_ROCK] = { name:'Flint pebble', solid:false, opaque:false, raycast:true, noTarget:true,
                          pass:0, model:'carpet', topOnly:true, stack:60, hardness:0.4, type:'stone',
                          boxes:FLINT_ROCK_BOX[0], boxesByVar:FLINT_ROCK_BOX,
                          faces:[T.FLINT_ROCK, T.FLINT_ROCK, T.FLINT_ROCK_TOP, T.FLINT_ROCK_TOP,
                                 T.FLINT_ROCK, T.FLINT_ROCK],
                          desc: 'Pick it up by hand for flint' };
  PROPS[B.BRICKS]    = { name:'Bricks', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:6.5, type:'stone', faces:[T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS], desc: '' };
  /* Gourds (0.7343) — 32 x 32 x 32 of this game's 64-pixel block, so half a cell across and half
     a cell tall, centred on the floor of its cell rather than filling it. They are FRUIT lying in
     a field, not masonry: you walk straight through one (`solid:false`), the crosshair passes over
     it (`noTarget:true`), and bush pickup is what gathers it — the same stoop-and-grab the berry
     bushes and flint stones use. Built on the `carpet` model, which is just "one box picked by
     variant", so the shape needs no new mesher path. */
  const GOURD_BOX = [[[16 / 64, 0, 16 / 64, 48 / 64, 32 / 64, 48 / 64]]];
  const _gourd = (name, side, top) => ({
    name, solid:false, opaque:false, raycast:true, noTarget:true,
    pass:0, model:'carpet', topOnly:true, stack:60, hardness:2.5, type:'wood',
    boxes:GOURD_BOX[0], boxesByVar:GOURD_BOX,
    faces:[side, side, top, top, side, side], desc: '',
  });
  PROPS[B.MELON]    = _gourd('Watermelon', T.MELON_SIDE, T.MELON_TOP);
  PROPS[B.PUMPKIN]  = _gourd('Pumpkin', T.PUMPKIN_SIDE, T.PUMPKIN_TOP);
  PROPS[B.WHEAT]    = { name:'Wheat', solid:false, opaque:false, raycast:true, noTarget:true, pass:1, model:'cross', stack:99, hardness:0, type:'grass', boxes:[[0.15,0,0.15,0.85,0.9,0.85]], faces:[T.WHEAT], desc: '' };
  PROPS[B.STONE_BRICK]    = { name:'Stone brick', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60,  hardness:8.5, type:'stone', faces:[T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK], desc: '' };
  PROPS[B.WOOL]    = { name:'Wool', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2.5, type:'wool', faces:[T.WOOL,T.WOOL,T.WOOL,T.WOOL,T.WOOL,T.WOOL], desc: '' };
  PROPS[B.HAY]     = { name:'Hay bale', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:1.0, type:'grass', faces:[T.HAY_SIDE,T.HAY_SIDE,T.HAY_TOP,T.HAY_TOP,T.HAY_SIDE,T.HAY_SIDE], desc: '' };
  /* CHISEL SHAPES (0.783; pane and fence 0.784). A shape is a VARIANT of a full block, not a block of its
     own: the block keeps its id — so its textures, hardness, sound, tool, mining gate and drops are simply
     its own — and the variant byte says how much of the cell it fills. Variant 0 is always the full block.
     A fence's arms point toward each fence OF THE SAME BLOCK beside it, diagonals included (0.7841) — read
     from the neighbours like stair corners, so never stored.
     SHAPE_BLOCKS says which blocks take which shape, written into PROPS[id].shapes, so making another block
     shapeable is one entry. The layout of the variant byte itself is written out below.
     Two halves of the same block in one cell are just the full block again. */
  /* THE VARIANT BYTE OF A SHAPE (0.792): the HIGH nibble names the shape, the LOW nibble is its rotation —
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
  /* LAYERS (0.785) — carpets. Each layer is 1/8 of a block.
       SHAPE_LAYER     + n-1   n layers (1..8) all of this cell's own block
       SHAPE_LAYER_MIX + n-1   n layers of MIXED blocks: the cell's id is the TOP one, and the full list,
                               bottom to top, lives beside the chunk (LAYER_STACKS, 11-chunks.js), so the
                               world array stays 32 bits a cell and only mixed stacks cost anything
     Blocks marked layerStack pile up to 8, mix with each other, and are walked through (snow, leaves,
     sand, gravel, fiber); every other layer block lies one layer deep and is as solid as its block. */
  const SHAPE_LAYER = 0x50, SHAPE_LAYER_MIX = 0x60, LAYER_MAX = 8;
  /* COVER (0.787): SHAPE_COVER + 0..5, a 1/8 plate on one side of the cell (bottom, top, -X, +X, -Z, +Z) that
     nothing collides with — a false floor over a pit, a false wall across a doorway.
     WALL (0.787): SHAPE_WALL, a solid wall 8 px thick and the full block tall, joining walls of the SAME block
     straight and diagonally like the fence; +1 is the pose for icons and the hand. */
  const SHAPE_COVER = 0x70, SHAPE_WALL = 0x80;
  const _ALL_PLANKS = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
  const SHAPE_BLOCKS = {
    slab:   [B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS, B.STONE_BRICK, B.GLASS, B.SANDSTONE, B.RED_SANDSTONE],
    stairs: [B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS, B.STONE_BRICK, B.GLASS, B.SANDSTONE, B.RED_SANDSTONE],
    pane:   [B.WOOL, B.GLASS, ..._ALL_PLANKS, B.STONE, B.COBBLE, B.BRICKS],                  // 0.784
    fence:  [..._ALL_PLANKS, B.BRICKS, B.IRON_BLOCK, B.COPPER_BLOCK],                         // 0.784
    layer:  [B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.SAND, B.RED_SAND, B.GRAVEL, B.FIBER_BLOCK,   // 0.785
             B.WOOL, ..._ALL_PLANKS, B.STONE, B.COBBLE, B.GLASS, B.IRON_BLOCK, B.GOLD_BLOCK],
    cover:  [B.DIRT, B.GRASS, B.STONE, B.COBBLE, ..._ALL_PLANKS, B.STONE_BRICK, B.BRICKS,              // 0.787
             B.GRANITE, B.MARBLE, B.LIMESTONE, B.SANDSTONE, B.RED_SANDSTONE],
    wall:   [B.COBBLE, B.STONE_BRICK, B.BRICKS, B.IRON_BLOCK, B.COPPER_BLOCK, B.GOLD_BLOCK,          // 0.787
             B.GRANITE, B.MARBLE, B.LIMESTONE, B.WOOL, B.SANDSTONE, B.RED_SANDSTONE],
  };
  const LAYER_STACKING = [B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.SAND, B.RED_SAND, B.GRAVEL, B.FIBER_BLOCK];
  for (const fam in SHAPE_BLOCKS)
    for (const b of SHAPE_BLOCKS[fam]) (PROPS[b].shapes || (PROPS[b].shapes = {}))[fam] = true;
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
  const LAYER_BOX = [];
  for (let n = 1; n <= LAYER_MAX; n++) LAYER_BOX[n - 1] = [[0, 0, 0, 1, n / LAYER_MAX, 1]];
  const NO_BOXES = [];
  // solidity of a VALUE: a stack you wade through (snow, leaves, sand, ...) is not solid, whatever its block is
  // ...and a cover is not solid either (0.787)
  const solidVal = (v) => {
    const p = PROPS[v & 255];
    if (!p || !p.solid) return false;
    const va = (v >> 8) & 255;
    if (!va || !p.shapes) return true;
    return !(p.layerStack && layerCount(v)) && !(p.shapes.cover && (va & SHAPE_MASK) === SHAPE_COVER);
  };
  /* which shape a value is in, or null (a full block, or no shapes at all). Each range only counts for a block
     that takes that shape (0.787): grass takes a cover, and its snowy variant (1) must not read as a slab. */
  const SHAPE_FAMILY = [];                       // high nibble -> family name (0.792)
  SHAPE_FAMILY[SHAPE_SLAB      >> 4] = 'slab';
  SHAPE_FAMILY[SHAPE_STAIRS    >> 4] = 'stairs';
  SHAPE_FAMILY[SHAPE_PANE      >> 4] = 'pane';
  SHAPE_FAMILY[SHAPE_FENCE     >> 4] = 'fence';
  SHAPE_FAMILY[SHAPE_LAYER     >> 4] = 'layer';
  SHAPE_FAMILY[SHAPE_LAYER_MIX >> 4] = 'layer';  // a mixed stack is still a layer, just with a list beside it
  SHAPE_FAMILY[SHAPE_COVER     >> 4] = 'cover';
  SHAPE_FAMILY[SHAPE_WALL      >> 4] = 'wall';
  function shapeOfVal(v) {
    const va = (v >> 8) & 255, p = PROPS[v & 255];
    if (!va || !p || !p.shapes) return null;
    const fam = SHAPE_FAMILY[va >> 4];
    return fam && p.shapes[fam] ? fam : null;
  }
  const PANE_BOX = [[0, 0, 0.375, 1, 1, 0.625], [0.375, 0, 0, 0.625, 1, 1]];
  /* Fence (0.7841): our own picket fence. A square post with a pointed tip; toward each fence of the same
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
    return !!p && !!p.opaque && !(((v >> 8) & 255) && p.shapes && shapeOfVal(v));
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
    return stairBoxesAt(g, x, y, z, v);
  }

  /* HOLLOW LOGS (0.7842). A log with its heart gone: a bark shell 2/16 thick, open at both ends, lying along
     the axis in its variant like a log (bits 0-1: 0 Y, 1 X, 2 Z). Bits 2-4 index HOLLOW_FILLS, what has been
     packed inside, so an upright one works as a planter. The ends use the log's ring texture, which at the
     shell's thickness is just the bark rim; the inside walls are bark too. Walls are authored standing up
     and turned onto the axis; on a lying log the bark is turned as well, so its grain runs along the log. */
  const HOLLOW_FILLS = [0, B.DIRT, B.GRASS, B.SAND, B.RED_SAND];
  const HOLLOW_WALLS = [[0,0,0,16,16,2], [0,0,14,16,16,16], [0,0,2,2,16,14], [14,0,2,16,16,14]].map(b => b.map(n => n / 16));
  const HOLLOW_CORE_UP = [2,0,2,14,15,14].map(n => n / 16);      // soil sits just under the rim
  const HOLLOW_CORE_LYING = [2,0,2,14,16,14].map(n => n / 16);   // ...and runs out to both ends lying down
  const HOLLOW_SWAP = [0, (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5), (1 << 0) | (1 << 1)];   // faces whose UVs turn, per axis
  // the face of each wall that looks INTO the log, per axis — those show stripped wood (0.7844)
  const HOLLOW_INNER = [[4, 5, 0, 1], [4, 5, 2, 3], [2, 3, 0, 1]];
  const _hollowOnAxis = (b, axis) => axis === 1 ? [b[1], b[0], b[2], b[4], b[3], b[5]]
                                   : axis === 2 ? [b[0], b[2], b[1], b[3], b[5], b[4]] : b;
  const _hollowParts = new Map(), _hollowBoxes = new Map();
  // [box, six tiles, UV-turn mask] for each part of a hollow log value: four walls, then its filling
  function hollowParts(v) {
    const key = v & 0xFFFF;
    let out = _hollowParts.get(key);
    if (out) return out;
    const va = (v >> 8) & 255, axis = Math.min(2, va & 3), fill = HOLLOW_FILLS[(va >> 2) & 7] || 0;
    const S = PROPS[v & 255].faces[0], E = PROPS[v & 255].faces[2];
    const f = axis === 0 ? [S, S, E, E, S, S] : axis === 1 ? [E, E, S, S, S, S] : [S, S, S, S, E, E];
    const inner = PROPS[v & 255].innerTile;
    out = HOLLOW_WALLS.map((b, w) => {
      const fw = f.slice();
      fw[HOLLOW_INNER[axis][w]] = inner;
      return [_hollowOnAxis(b, axis), fw, HOLLOW_SWAP[axis]];
    });
    if (fill) out.push([_hollowOnAxis(axis ? HOLLOW_CORE_LYING : HOLLOW_CORE_UP, axis), PROPS[fill].faces, 0]);
    _hollowParts.set(key, out);
    return out;
  }
  function hollowBoxes(v) {
    const key = v & 0xFFFF;
    let b = _hollowBoxes.get(key);
    if (!b) _hollowBoxes.set(key, b = hollowParts(v).map(q => q[0]));
    return b;
  }
  for (const [bid, name, log, stripped] of [[B.HOLLOW_LOG, 'Hollow oak log', B.LOG, B.STRIPPED_LOG],
                                            [B.HOLLOW_BIRCH_LOG, 'Hollow birch log', B.BIRCH_LOG, B.STRIPPED_BIRCH_LOG],
                                            [B.HOLLOW_SPRUCE_LOG, 'Hollow spruce log', B.SPRUCE_LOG, B.STRIPPED_SPRUCE_LOG]]) {
    PROPS[bid] = { name, solid:true, opaque:false, raycast:true, pass:0, model:'hollow', rot:'all', stack:60, hardness:3.0,
                   type:'wood', faces:PROPS[log].faces.slice(), innerTile:PROPS[stripped].faces[0],   // inside: stripped wood (0.7844)
                   boxesOf:hollowBoxes, desc:'Fill it with dirt, grass or sand to plant in it' };
    PROPS[bid].boxes = hollowBoxes(bid);
  }
  const CX = 16, CY = 200, CZ = 16;
  /* Flat ("superflat") worlds: a 25-block slab — 1 bedrock, 19 stone, 4 dirt, 1 grass — with a
     matching low water level so lakes and ponds still carve into it. Everything else about the
     world (biome = Plains, trees, surface plants) works exactly as it does at normal altitude. */
  const FLAT_TOP = 24;                     // y of the grass layer
  // Water sits 4 below the surface, not 1. Every decorator (trees, plants, melons, cacti) skips
  // columns at h <= WATER_LEVEL + 1 or + 3 to keep shorelines clear — parking the flat surface
  // just above water level would have tripped all of those and left a completely barren world.
  const FLAT_WATER_LEVEL = FLAT_TOP - 4;
  const idx = (x, y, z) => x + (z << 4) + (y << 8);   // voxel index inside a chunk

  /* ---------- seeded PRNG + 2D simplex noise ---------- */
  function xmur3(str) {                       // string hash -> 32-bit seed stream
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function sfc32(a, b, c, d) {
    return () => {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  const G2D = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), GG2 = (3 - Math.sqrt(3)) / 6;

  function makeNoise(rand) {
    const p = new Uint8Array(512);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {           // Fisher–Yates with seeded PRNG
      const j = (rand() * (i + 1)) | 0;
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

    return function noise2(xin, yin) {        // classic Gustavson simplex, range ~[-1,1]
      let n0 = 0, n1 = 0, n2 = 0;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * GG2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + GG2, y1 = y0 - j1 + GG2;
      const x2 = x0 - 1 + 2 * GG2, y2 = y0 - 1 + 2 * GG2;
      const ii = i & 255, jj = j & 255;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { t0 *= t0; const g = G2D[p[ii + p[jj]] & 7];       n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { t1 *= t1; const g = G2D[p[ii + i1 + p[jj + j1]] & 7]; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { t2 *= t2; const g = G2D[p[ii + 1 + p[jj + 1]] & 7];   n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
      return 70 * (n0 + n1 + n2);
    };
  }

  /* ---------- terrain generator ---------- */
  function makeGen(seedStr, terrainType) {
    const FLAT = terrainType === 'flat';
    const WATER_LEVEL = FLAT ? FLAT_WATER_LEVEL : 99;
    const seedFn = xmur3(String(seedStr));
    const seedInt = seedFn();
    const noise2 = makeNoise(sfc32(seedFn(), seedFn(), seedFn(), seedFn()));

    function fbm(x, y, oct) {                 // fractal brownian motion
      let sum = 0, amp = 1, freq = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        sum += amp * noise2(x * freq, y * freq);
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    }
    const smooth01 = (t, a, b) => {
      t = Math.min(1, Math.max(0, (t - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };

    // world-space column terrain sample: continents + biome-weighted hills + ridged mountains.
    // The biome selector `t` sweeps forest -> plains -> desert; fPlains rises through BOTH
    // plains and desert (it flattens hills/mountains and fades out trees), while fDesert
    // separates desert from plains. Both factors are smooth 0..1 so borders blend seamlessly.
    function terrainInfo(x, z) {
      /* Flat world: no continents, hills or mountains — just the slab top, with the SAME
         river/lake carving the normal generator uses so ponds still appear. Reporting
         fPlains = 1 makes every column read as Plains to the biome label, the decorators and
         the mob spawner, so nothing downstream needs a flat-world special case. */
      if (FLAT) {
        let h = FLAT_TOP;
        const rn = 1 - Math.abs(fbm(x * 0.0014 + 1223.7, z * 0.0014 - 817.3, 2));
        const ln = fbm(x * 0.0042 - 313.7, z * 0.0042 + 991.1, 2);
        const valley = Math.max(smooth01(ln, 0.18, 0.74), smooth01(rn, 0.34, 0.95));
        const core   = Math.max(smooth01(ln, 0.64, 0.84), smooth01(rn, 0.88, 0.965));
        if (valley > 0.001) {
          const rim = WATER_LEVEL + 1, floor = WATER_LEVEL - 3;
          let target = h + (rim - h) * valley;
          target += (floor - rim) * core;
          if (target < h) h = target;
        }
        return { h: Math.max(4, Math.floor(h)), fPlains: 1, fDesert: 0, fSnow: 0,
                 dh: 0, fRed: 0, rdh: 0,
                 rT: smooth01(rn, 0.88, 0.965), lk: smooth01(ln, 0.64, 0.84), deep: 0 };
      }
      const cont   = fbm(x * 0.0016, z * 0.0016, 3);
      const hills  = fbm(x * 0.009 + 37.3, z * 0.009 - 11.7, 4);
      const ridge  = 1 - Math.abs(fbm(x * 0.004 + 91.1, z * 0.004 + 57.9, 3));
      const mMask  = smooth01((fbm(x * 0.0011 - 71.7, z * 0.0011 + 13.9, 2) + 1) * 0.5, 0.44, 0.74);

      // biome selector, domain-warped + high-frequency dither so borders meander instead of
      // following the razor-straight contours of a single low-frequency noise
      // wider warp + no fine dither: border wobble happens at ~250-block wavelength,
      // so a biome pocket can't be narrower than ~25-30 blocks in either axis.
      // warp amplitude 80 (was 120): strong enough to meander borders, weak enough that the
      // warp can no longer pinch a biome band into a ~10-block sliver. Lower selector freq
      // (0.0009) makes every biome patch larger overall.
      const bwx = x + noise2(x * 0.004 + 313.1, z * 0.004 - 97.7) * 80;
      const bwz = z + noise2(x * 0.004 - 411.9, z * 0.004 + 229.3) * 80;
      const t = fbm(bwx * 0.0009 + 523.7, bwz * 0.0009 - 331.9, 2);
      // climate temperature (separate low-freq field): deserts need HOT, snow needs COLD. Because
      // it's one smooth field, hot and cold regions are always separated by a temperate band —
      // so a snow biome can never sit next to a desert.
      // temperate spawn: 99% of seeds pull the temperature field toward 0 near origin so
       // the player lands in Forest/Plains, not Snow/Desert. 1% skip the bias so extreme
       // spawns still happen occasionally (future temperature-system stress test).
       let temp = fbm(x * 0.00075 + 811.3, z * 0.00075 - 442.1, 2);
       if ((seedInt >>> 0) % 100 !== 0) {
         const bias = 1 - smooth01(Math.hypot(x, z), 120, 480);   // 1 at origin, 0 past 480
         temp *= (1 - bias * 0.95);
       }
      const warm = smooth01(temp, 0.02, 0.30);
      const cold = smooth01(-temp, 0.02, 0.30);

      const fPlains = smooth01(t, 0.0, 0.1);            // narrower band -> smaller plains
      const fDesert = smooth01(t, 0.16, 0.28) * warm;  // wider band = bigger deserts; hot climate only
      const fSnow   = cold;                             // snowy surface in cold climate

      // `flat` saturates at fPlains=0.5 — the exact point where the biome label flips to
      // Plains/Desert — so everywhere labelled Plains is genuinely flat (no half-suppressed
      // mountains leaking across the border band)
      const flat    = Math.min(1, fPlains * 2);
      const hillAmp = 6 * (1 - flat) + (0.8 + 1.2 * fDesert) * flat;       // plains ~dead flat; deserts mostly flat too
      const mTerm   = mMask * ridge * ridge * 90 * (1 - flat);             // mountains only in forest zones
      // desert hills sub-biome: tall dunes / small sandy mountains with rocky tops
      const dh     = smooth01(fbm(x * 0.0035 + 641.3, z * 0.0035 - 141.7, 2), 0.25, 0.62) * fDesert;   // rarer dune hills = flatter deserts
      // red sand sub-desert: separate low-freq mask splits hot deserts into normal / red zones
      const fRed = smooth01(fbm(x * 0.00065 - 911.7, z * 0.00065 + 617.3, 2), 0.22, 0.36) * fDesert;   // half freq = 2x patch size
      // red spike hills: narrow ridged spikes (all red sand — no sandstone yet), clustered
      // by their own hill mask so flat red desert and spike fields both exist
      const rdh = smooth01(fbm(x * 0.0035 + 941.3, z * 0.0035 - 241.7, 2), 0.1, 0.55) * fRed;
      let h = 102 + cont * 16 + hills * hillAmp + mTerm + dh * 30;
      if (rdh > 0.01) {
        const sp = 1 - Math.abs(fbm(x * 0.045 + 77.7, z * 0.045 - 55.5, 2));
        h += Math.pow(smooth01(sp, 0.78, 0.97), 2) * 30 * rdh;
      }
      /* Continental shelf -> oceans. The descent used to switch on the instant cont crossed -0.2,
         which left a crease all along that contour; the smoothstep eases it in over the same band
         the deep-ocean mask uses, and is fully 1 by -0.30 so open-ocean depth is unchanged. */
      if (cont < -0.2) h += (cont + 0.2) * 45 * smooth01(-cont, 0.20, 0.30);
      /* Deep ocean: separate low-freq mask carves broad abyssal basins well below the shelf.

         This is a 34-block drop, so ALL of its steepness lives in how fast the mask crosses 0..1.
         The old band (0.02..0.42 of an fbm at 0.0009) crossed in well under a hundred blocks and
         produced a scarp — a wall you could stand on the lip of. Three changes stretch it into a
         real continental slope: a lower frequency, a mask band more than twice as wide, and a
         second smoothstep over the finished mask so both the top and the toe of the slope ease
         off instead of meeting the flat in a crease. The gate on `cont` also starts AFTER the
         shelf descent has fully engaged, so a basin never begins while the shelf is still
         dropping — that overlap stacked two descents into one step. */
      const deepN = fbm(x * 0.0007 + 1571.3, z * 0.0007 - 733.1, 2);
      let deep = smooth01(deepN, -0.20, 0.70) * smooth01(-cont, 0.26, 0.52);
      deep = deep * deep * (3 - 2 * deep);              // ease the descent at BOTH ends
      h -= deep * 34;

      // rivers & lakes (fade out in deserts, oceans, real mountains). Carving is TWO-tier so
      // water never sits in a canyon: a broad `valley` mask first eases the surrounding land
      // gently down to a low rim, then a tighter `core` mask scoops a shallow basin. Because
      // the rim descent spans a wide noise band, high plains/forest slope down to the shore
      // over many blocks instead of leaving vertical walls beside the water.
      let rT = 0, lk = 0, carveBed = 0;   // carveBed 0..1: how far inside a river/lake channel
      // river/lake carving stays active across the continental shelf so a river mouth cuts
      // straight through to the ocean instead of fading out and leaving a beach ridge
      const landF = smooth01(cont, -0.30, -0.20) * (1 - fDesert) * (1 - Math.min(1, mTerm / 18));
      if (landF > 0.01) {
        const rn = 1 - Math.abs(fbm(x * 0.0014 + 1223.7, z * 0.0014 - 817.3, 2));   // river ridge (lower freq -> longer rivers)
        const ln = fbm(x * 0.0042 - 313.7, z * 0.0042 + 991.1, 2);                  // lake blobs
        // River WIDTH varies by region, and wide stretches also run deep — one noise field
        // drives both so the two always agree: a broad river is never a shallow puddle and a
        // narrow one never a canyon. wN 0 = narrow+shallow, 1 = wide+deep.
        const wN = (fbm(x * 0.0009 + 2411.7, z * 0.0009 - 1877.3, 2) + 1) * 0.5;
        const valley = Math.max(smooth01(ln, 0.18, 0.74), smooth01(rn, 0.34 - wN * 0.06, 0.95)) * landF;
        // core band 0.88-0.965 at wN=0: rivers are several blocks across at minimum, never a
        // 1-block water thread. Widening the band's lower edge is what broadens the channel.
        const coreLo = 0.88 - wN * 0.10;
        const core   = Math.max(smooth01(ln, 0.64, 0.84), smooth01(rn, coreLo, 0.965)) * landF;
        if (valley > 0.001) {
          /* Depth is a function of WIDTH and nothing else: a narrow brook is ~3 below water, the
             widest channels ~11. One field (wN) drives both, so the two can never disagree. */
          const rim = WATER_LEVEL + 1, depth = 3 + wN * 8, floor = WATER_LEVEL - depth;
          /* FLAT BED, steep banks. `core` is a smooth 0..1 ramp, and using it directly made the
             channel a V — deepest exactly on the centre line and shelving up the whole way out.
             Raising it to a low power saturates it almost as soon as you are inside the channel,
             so the cross-section reads as a shallow box: banks drop, then the bottom runs level. */
          const bed = Math.pow(core, 0.35);
          let target = h + (rim - h) * valley;                     // ease land down to the rim
          target += (floor - rim) * bed;                           // then scoop the basin
          /* ...and the bottom is not a mirror. Two octaves of relief ride on the flat bed: a
             broad slow term that reads as a submerged slope, and a finer one for humps and
             hollows. Scaled to a fraction of the depth and multiplied by `bed`, so the relief
             fades out at the banks and a hump can never break the surface. */
          const bedRelief = fbm(x * 0.026 + 5501.3, z * 0.026 - 4417.9, 3) * 0.55
                          + fbm(x * 0.0060 - 2207.7, z * 0.0060 + 3313.1, 2) * 0.45;
          target += bedRelief * Math.min(2.4, depth * 0.34) * bed;
          if (target < h) { h = target; carveBed = bed; }          // only ever lower terrain
        }
        rT = smooth01(rn, coreLo, 0.965) * landF;   // tracks the carve, so 'River' labels the real channel
        lk = smooth01(ln, 0.64, 0.84) * landF;
      }
      /* Seabed relief. Everything above shapes LAND; underwater the shelf and basin terms are
         both very low frequency, so the floor came out as a near-featureless plane. Two extra
         octaves ride on top of it: broad lumps plus a ridged term for the occasional spike.
         Amplitude fades to zero at the shoreline (so beaches and the sand/beach-width logic are
         untouched) and the result is clamped below water level so a spike can never surface as
         an unintended island. */
      if (h < WATER_LEVEL) {
        /* Ocean relief. Damped to near nothing inside a carved river/lake bed — that bed carries
           its own, gentler relief, and stacking the seabed octaves on top of it was what made
           rivers read as lumpy trenches instead of channels with a floor. */
        const amp = Math.min(1, (WATER_LEVEL - h) / 8) * (1 - carveBed * 0.9);
        // lower frequency + bigger amplitude = broad rolling hills rather than choppy bumps
        const lump  = fbm(x * 0.018 + 1777.3, z * 0.018 - 2213.9, 3);
        const spike = 1 - Math.abs(fbm(x * 0.05 - 611.7, z * 0.05 + 733.1, 2));
        h += lump * 5.0 * amp;
        // spikes kept as rare accents: narrower threshold band and a much smaller height
        h += Math.pow(smooth01(spike, 0.93, 0.995), 2) * 2.0 * amp;
        h = Math.min(h, WATER_LEVEL - 1);
      }
      h = Math.min(196, Math.max(4, Math.floor(h)));
      return { h, fPlains, fDesert, fSnow, dh, fRed, rdh, rT, lk, deep };
    }
    const heightAt = (x, z) => terrainInfo(x, z).h;

    // biome classification — used by the generator and by the HUD label on the main thread
    function biomeAt(x, z) {
      const { h, fPlains, fDesert, fSnow, dh, fRed, rdh, rT, lk, deep } = terrainInfo(x, z);
      if (h < WATER_LEVEL) {
        if (rT > 0.3 && rT >= lk) return 'River';
        if (lk > 0.3) return 'Lake';
        if (deep > 0.45 && h < 84) return 'Deep Ocean';
        return h < 94 ? 'Ocean' : 'Beach';
      }
      if (h <= WATER_LEVEL + 3) {
        // find nearest wet column and its type; ocean uses width 4..8, river/lake 2..4
        let hitType = 0, minD2 = 9999;
        for (let dz = -8; dz <= 8; dz++)
          for (let dx = -8; dx <= 8; dx++) {
            const ti = terrainInfo(x + dx, z + dz);
            if (ti.h >= WATER_LEVEL) continue;
            const t = (ti.rT > 0.3 || ti.lk > 0.3) ? 2 : 1;
            const d2 = dx * dx + dz * dz;
            if (d2 < minD2) { minD2 = d2; hitType = t; }
          }
        const bn = (fbm(x * 0.007 + 217.3, z * 0.007 - 803.7, 2) + 1) * 0.5;
        const width = hitType === 1 ? 4 + bn * 4 : 2 + bn * 2;
        const dist  = Math.sqrt(minD2);
        const dither = fbm(x * 0.02 + 401.3, z * 0.02 - 193.7, 2) * 0.8;
        const nearWater = hitType > 0 && dist < width + dither;
        if (nearWater) {
          if (rT > 0.3 && rT >= lk) return 'River';
          if (lk > 0.3) return 'Lake';
          return 'Beach';
        }
      }
      if (fRed > 0.5) return rdh > 0.35 ? 'Red Sand Hills' : 'Red Sand';
      if (fDesert > 0.5) return dh > 0.35 ? 'Desert Hills' : 'Desert';
      if (fSnow > 0.5) {
        if (h > 132) return 'Snowy Mountains';
        // snow forest sub-biome: same mask the tree pass uses; outside it snow is treeless
        return fbm(x * 0.004 + 2222, z * 0.004 + 888, 2) > 0.25 ? 'Snow Forest' : 'Snow';
      }
      if (h > 132) return 'Mountains';
      if (fPlains > 0.5) return 'Plains';
      if (fbm(x * 0.004 + 1234, z * 0.004 - 987, 2) > 0.35) return 'Birch Forest';   // matches birchRegion
      return 'Forest';
    }

    // deterministic per-column hash in [0,1) — used for tree placement
    function hash2(x, z) {
      let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) ^ seedInt;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }

    // 3D value noise for cave carving: hashed lattice + trilinear smoothstep interpolation
    function hash3(x, y, z) {
      let h = (Math.imul(x, 374761393) + Math.imul(y, 217645177) + Math.imul(z, 668265263)) ^ seedInt;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }
    function vnoise3(x, y, z) {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      const fx = x - ix, fy = y - iy, fz = z - iz;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
      const c000 = hash3(ix, iy, iz),     c100 = hash3(ix + 1, iy, iz);
      const c010 = hash3(ix, iy + 1, iz), c110 = hash3(ix + 1, iy + 1, iz);
      const c001 = hash3(ix, iy, iz + 1),     c101 = hash3(ix + 1, iy, iz + 1);
      const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
      const x00 = c000 + (c100 - c000) * sx, x10 = c010 + (c110 - c010) * sx;
      const x01 = c001 + (c101 - c001) * sx, x11 = c011 + (c111 - c011) * sx;
      const y0 = x00 + (x10 - x00) * sy, y1 = x01 + (x11 - x01) * sy;
      return (y0 + (y1 - y0) * sz) * 2 - 1;
    }
    function fbm3(x, y, z, oct) {
      let sum = 0, amp = 1, freq = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        sum += amp * vnoise3(x * freq, y * freq, z * freq);
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    }

    /* Generate one chunk of voxels. Column layout (top -> bottom):
       air/water | 1 grass (sand near water) | 5 dirt (or sand) | stone | 2 bedrock.
       Trees are stamped from a 2-block margin so canopies cross chunk borders seamlessly
       (placement is a pure function of world position, so every chunk agrees).            */
    function genChunk(cx, cz) {
      const data = new Uint32Array(CX * CY * CZ);
      const H = new Int16Array(400);                           // heights incl. 2-block margin
      const DES = new Uint8Array(400);                         // desert surface flag
      const RED = new Uint8Array(400);                         // red-sand desert flag
      const ROCK = new Uint8Array(400);                        // rocky desert-hill top flag
      const SNO = new Uint8Array(400);                         // snowy (cold biome) surface flag
      const TREE = new Float32Array(400);                      // tree density factor (0 in plains/desert)
      // wider wet grid (32x32, 8-block margin) so beach width can vary per water type:
      // ocean 4..8 blocks, river/lake 2..4. WW cells: 0 dry, 1 ocean, 2 river/lake.
      const WW = new Uint8Array(1024);
      for (let gz = 0; gz < 32; gz++)
        for (let gx = 0; gx < 32; gx++) {
          const ti = terrainInfo(cx * 16 + gx - 8, cz * 16 + gz - 8);
          let ww = 0;
          if (ti.h < WATER_LEVEL) ww = (ti.rT > 0.3 || ti.lk > 0.3) ? 2 : 1;
          WW[gx + gz * 32] = ww;
          if (gx >= 6 && gx <= 25 && gz >= 6 && gz <= 25) {
            const i = (gx - 6) + (gz - 6) * 20;
            H[i] = ti.h;
            DES[i] = ti.fDesert > 0.5 ? 1 : 0;
            RED[i] = ti.fRed > 0.5 ? 1 : 0;
            ROCK[i] = (ti.dh > 0.5 && ti.fRed <= 0.5) ? 1 : 0;   // tall desert hills expose stone (not in red zones)
            SNO[i] = ti.fSnow > 0.5 ? 1 : 0;
            TREE[i] = 1 - ti.fPlains;
          }
        }

      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          const wx = cx * 16 + x, wz = cz * 16 + z;
          // surface material: grass/dirt on land, sand on beaches/seafloor/deserts, stone caps on
          // desert hills, clay+dirt patches on the seabed, snowy grass (+snow cap) in cold biomes
          let topB, underB, snowCap = false;
          // altitude at which solid snow starts winning over carpet (see the snowCap block below)
          const SNOW_SOLID_Y = WATER_LEVEL + 26;
          // beach mask: for above-water columns near shore level, sand only if the nearest
          // wet column is closer than that water type's beach width. Ocean beaches vary 4..8,
          // river/lake beaches 2..4, both from a low-freq noise so widths change by region.
          let nearWater = false;
          if (h <= WATER_LEVEL + 3 && h >= WATER_LEVEL) {
            const gxw = x + 8, gzw = z + 8;
            let hitType = 0, minD2 = 9999;
            for (let dz = -8; dz <= 8; dz++)
              for (let dx = -8; dx <= 8; dx++) {
                const t = WW[(gxw + dx) + (gzw + dz) * 32];
                if (!t) continue;
                const d2 = dx * dx + dz * dz;
                if (d2 < minD2) { minD2 = d2; hitType = t; }
              }
            if (hitType) {
              const bn = (fbm(wx * 0.007 + 217.3, wz * 0.007 - 803.7, 2) + 1) * 0.5;
              const width = hitType === 1 ? 2 + bn * 2 : bn * 0.4;
              const dist  = Math.sqrt(minD2);
              const dither = fbm(wx * 0.02 + 401.3, wz * 0.02 - 193.7, 2) * 0.8;
              if (dist < width + dither) nearWater = true;
            }
          }
          if (ROCK[gi]) {
            topB = underB = B.STONE;
          } else if (h < WATER_LEVEL || (h <= WATER_LEVEL + 3 && nearWater) || DES[gi] === 1) {
            const submerged = h < WATER_LEVEL - 1;
            const clay       = submerged && fbm(wx * 0.045 - 205.1, wz * 0.045 + 733.7, 2) > 0.55;  // reduced clay
            const oceanDirt  = submerged && !clay && fbm(wx * 0.02 + 911.3, wz * 0.02 + 417.9, 2) > 0.12;  // more/larger dirt
            const oceanGravel = submerged && !clay && !oceanDirt && fbm(wx * 0.025 + 531.7, wz * 0.025 - 644.3, 2) > 0.35;
            topB = underB = clay ? B.CLAY : oceanDirt ? B.DIRT : oceanGravel ? B.GRAVEL
                          : RED[gi] ? B.RED_SAND : B.SAND;
          } else if (SNO[gi]) {
            topB = B.GRASS | (V.GRASS_SNOWY << 8);  // snowy sides; a snow block caps it below
            underB = B.DIRT; snowCap = true;
          } else {
            topB = B.GRASS; underB = B.DIRT;
          }
          if (FLAT) {
            // 1 bedrock / 19 stone / 4 dirt / 1 grass. A pond column has h below FLAT_TOP, so
            // its dirt loop shortens (or empties) and the surface material logic above has
            // already picked sand/gravel/clay for the bed.
            data[idx(x, 0, z)] = B.BEDROCK;
            for (let y = 1; y <= 19; y++) data[idx(x, y, z)] = B.STONE;
            for (let y = 20; y < h; y++) data[idx(x, y, z)] = underB;
            data[idx(x, h, z)] = topB;
          } else {
          data[idx(x, 0, z)] = B.BEDROCK;
          data[idx(x, 1, z)] = B.BEDROCK;
          const dirtFrom = Math.max(2, h - 5);
          for (let y = 2; y < dirtFrom; y++) data[idx(x, y, z)] = B.STONE;
          for (let y = dirtFrom; y < h; y++) data[idx(x, y, z)] = underB;
          if (h >= 2) data[idx(x, h, z)] = topB;
          }
          if (snowCap && h + 1 <= 199) {
            // Pattern-driven snow cover:
            //  - biome edge (non-SNO neighbor): thin 1-layer carpet, keeps a crisp biome seam
            //  - steep terrain (neighbour Δh ≥ 2): thick 4-5 layer carpet, reads like a snow drift
            //  - interior: fbm patch noise decides full snow vs tapered carpet.
            //    Layer count fades 5..1 as patch rises above the full-block threshold, so cells
            //    bordering full SNOW blocks always come in at ~5 layers for a smooth blend.
            let bioEdge = false, steep = false;
            for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
              const ngi = (x + 2 + ndx) + (z + 2 + ndz) * 20;
              if (!SNO[ngi]) { bioEdge = true; break; }
              if (Math.abs(H[ngi] - h) >= 2) steep = true;
            }
            if (bioEdge) {
              data[idx(x, h + 1, z)] = layerVal(B.SNOW, 1);
            } else if (steep) {
              const thick = 5 + Math.floor(hash2(wx * 17 + 331, wz * 19 + 733) * 3);   // 5..7 of 8
              data[idx(x, h + 1, z)] = layerVal(B.SNOW, thick);
            } else {
              /* Solid snow is now an ALTITUDE feature, not the default filler. At sea level a
                 snow biome is almost entirely carpet — the ground still reads white but you can
                 see the grass and plants through it — and full blocks only take over as you
                 climb. `snowline` runs 0 below SNOW_SOLID_Y to 1 well above it, and gates the
                 patch threshold, which cuts low-altitude snow blocks by ~90%. */
              const patch = (fbm(wx * 0.045 + 1201.7, wz * 0.045 - 903.3, 3) + 1) * 0.5;
              const snowline = smooth01(h, SNOW_SOLID_Y, SNOW_SOLID_Y + 34);
              const solidCut = 0.04 + 0.5 * snowline;            // 4% low down, ~54% up high
              if (patch < solidCut) {
                data[idx(x, h + 1, z)] = B.SNOW;                  // solid snowfield
              } else {
                // taper: just above the cut -> 7 layers (blends into neighbouring full blocks)
                const layers = Math.min(7, Math.max(1, 7 - Math.floor((patch - solidCut) * 10)));
                data[idx(x, h + 1, z)] = layerVal(B.SNOW, layers);
              }
            }
          }
          for (let y = h + 1; y <= WATER_LEVEL; y++) data[idx(x, y, z)] = B.WATER;
        }
      }

      /* Everything from here to the tree pass carves or fills UNDERGROUND: ore, gravel, caves,
         cave entrances, lava pools and sulfur. A flat world is a 25-block slab meant as a clean
         testbed, so the whole region is skipped rather than left to riddle it with holes. */
      if (!FLAT) {

      /* ---- ore veins (before caves so cave walls naturally expose ore faces) ---- */
      {
        const ORE_TYPES = [
       // [oreId,   attempts, minN, maxN, bestLo, bestHi, rangeLo, rangeHi]
          [B.COAL_ORE,    20,    4,   14,     60,     90,      35,     180],
          [B.IRON_ORE,    12,    3,    9,     50,     65,      15,     130],
          [B.DIAMOND_ORE,  2,    1,    5,     15,     20,       2,      30],
          [B.COPPER_ORE,   8,    3,   10,     70,     80,      20,      85],
          [B.TIN_ORE,      6,    2,    8,     40,     45,      10,      70],
          [B.GOLD_ORE,     4,    2,    6,     20,     30,       5,      40],
          // gems (0.766): emerald only in mountain rock, ruby deep, sapphire just below the surface band
          [B.EMERALD_ORE,  4,    1,    4,    150,    160,     120,     200],
          [B.RUBY_ORE,     3,    1,    4,     43,     47,      30,      70],
          [B.SAPPHIRE_ORE, 3,    1,    4,     93,     97,      80,     130],
          [B.TOPAZ_ORE,    3,    1,    4,     78,     82,      60,     100],   // 0.769
          // big rock patches embedded in stone (chunky blobs, wide depth range)
          [B.MARBLE,       5, 24, 60, 50, 92,  30, 94],
          [B.GRANITE,      5, 24, 60,  6, 55,   2, 60],
          [B.LIMESTONE,    5, 24, 60, 40, 92,  20, 94],
        ];
        for (let oi = 0; oi < ORE_TYPES.length; oi++) {
          const [oreId, attempts, minN, maxN, bestLo, bestHi, rangeLo, rangeHi] = ORE_TYPES[oi];
          for (let ai = 0; ai < attempts; ai++) {
            const lx = (hash3(cx * 47 + oi + ai,       11, cz * 43 + oi + ai    ) * 16) | 0;
            const lz = (hash3(cx * 53 + oi + ai * 3,   17, cz * 59 + oi + ai    ) * 16) | 0;
            const inBest = hash3(cx + oi * 7 + ai * 3, 31, cz + oi * 3 + ai * 7) < 0.7;
            const ly = inBest
              ? bestLo  + ((hash3(cx * 13 + ai + oi, 41, cz * 11 + ai) * (bestHi  - bestLo  + 1)) | 0)
              : rangeLo + ((hash3(cx * 19 + ai + oi, 37, cz * 17 + ai) * (rangeHi - rangeLo + 1)) | 0);
            if (ly < rangeLo || ly > rangeHi || ly < 2 || ly > 198) continue;
            if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
            const count = minN + ((hash3(cx + ai, ly + oi, cz + ai) * (maxN - minN + 1)) | 0);
            // LCG seeded from position for deterministic vein shape
            let lcg = (Math.imul(cx * 37 + lx + oi * 13, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
            const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
            const front = [[lx, ly, lz]];
            let placed = 0;
            while (front.length && placed < count) {
              const fi = (nlcg() * front.length) | 0;
              const [bx, by, bz] = front.splice(fi, 1)[0];
              if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > 198) continue;
              if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
              data[idx(bx, by, bz)] = oreId;
              placed++;
              front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
            }
          }
        }
      }

      /* ---- gravel patches: mountain slopes and underground cave floors ---- */
      {
        // mountain surface patches — near surface of tall columns
        for (let ai = 0; ai < 9; ai++) {
          const lx = (hash3(cx * 47 + 500 + ai,       7, cz * 43 + 500 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 500 + ai * 3,  13, cz * 59 + 500 + ai    ) * 16) | 0;
          const gi = (lx + 2) + (lz + 2) * 20;
          if (H[gi] <= 82) continue;                             // only in mountain columns
          const ly = H[gi] - 4 - ((hash3(cx + 500 + ai, 29, cz + 500 + ai) * 16) | 0);
          if (ly < 2 || ly > 198) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 20 + ((hash3(cx + ai + 500, ly, cz + ai + 500) * 30) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 500, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > 198) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
        // underground patches — scattered through caves / mid-depth stone
        for (let ai = 0; ai < 8; ai++) {
          const lx = (hash3(cx * 47 + 600 + ai,       11, cz * 43 + 600 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 600 + ai * 3,   17, cz * 59 + 600 + ai    ) * 16) | 0;
          const ly = 12 + ((hash3(cx + 600 + ai, 23, cz + 600 + ai) * 48) | 0);
          if (ly < 2 || ly > 198) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 10 + ((hash3(cx + ai + 600, ly, cz + ai + 600) * 20) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 600, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > 198) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
        // general-biome surface patches — small, all elevated terrain h > 65
        for (let ai = 0; ai < 6; ai++) {
          const lx = (hash3(cx * 47 + 700 + ai,       31, cz * 43 + 700 + ai    ) * 16) | 0;
          const lz = (hash3(cx * 53 + 700 + ai * 3,   37, cz * 59 + 700 + ai    ) * 16) | 0;
          const gi = (lx + 2) + (lz + 2) * 20;
          if (H[gi] <= 65) continue;                             // only above beach level
          const ly = H[gi] - 3 - ((hash3(cx + 700 + ai, 43, cz + 700 + ai) * 10) | 0);
          if (ly < 2 || ly > 198) continue;
          if ((data[idx(lx, ly, lz)] & 255) !== B.STONE) continue;
          const count = 5 + ((hash3(cx + ai + 700, ly, cz + ai + 700) * 12) | 0);
          let lcg = (Math.imul(cx * 37 + lx + 700, 374761393) ^ Math.imul(ly * 7 + ai, 668265263) ^ (cz * 41 + lz)) | 0;
          const nlcg = () => { lcg = Math.imul(lcg, 1664525) + 1013904223 | 0; return (lcg >>> 0) / 4294967296; };
          const front = [[lx, ly, lz]];
          let placed = 0;
          while (front.length && placed < count) {
            const fi = (nlcg() * front.length) | 0;
            const [bx, by, bz] = front.splice(fi, 1)[0];
            if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > 198) continue;
            if ((data[idx(bx, by, bz)] & 255) !== B.STONE) continue;
            data[idx(bx, by, bz)] = B.GRAVEL;
            placed++;
            front.push([bx+1,by,bz],[bx-1,by,bz],[bx,by+1,bz],[bx,by-1,bz],[bx,by,bz+1],[bx,by,bz-1]);
          }
        }
      }

      /* ---- caves: two 3D-noise bands intersect into winding tunnels ("spaghetti"), plus
         large low-altitude "cheese" caverns. A solid crust stays under the surface (6 land /
         9 underwater) so caves only reach daylight through the entrance shafts below. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const capY = h - (h < WATER_LEVEL ? 9 : 6);
          // long-tunnel region gate (2D, per-column): ~40% of areas also grow long sweeping
          // tunnels from a separate LOW-frequency band pair (long wavelength = long tunnels)
          const longTun = fbm(wx * 0.003 + 4040, wz * 0.003 - 2020, 2) > 0.12;
          for (let y = 3; y <= capY; y++) {
            // taper the band shut approaching the crust so noise never breaches the surface
            const taper = Math.min(1, (capY - y) * 0.25 + 0.4);
            // boost band width inside tall mountains so interiors are more cavernous
            const w = (0.062 + (1 - y / 96) * 0.02 + Math.max(0, h - 90) * 0.00045) * taper;
            const n1 = fbm3(wx * 0.055, y * 0.075, wz * 0.055, 2);
            if (Math.abs(n1) <= w) {                          // spaghetti band
              const n2 = fbm3(wx * 0.055 + 133.7, y * 0.075 - 71.3, wz * 0.055 + 291.1, 2);
              if (Math.abs(n2) <= w) { data[idx(x, y, z)] = B.AIR; continue; }
            }
            if (!longTun) continue;                           // long tunnels only in gated regions
            const lw = w * 0.85;                              // a touch narrower so they read as tunnels
            const t1 = fbm3(wx * 0.018 + 512, y * 0.05 - 88, wz * 0.018 + 707, 2);
            if (Math.abs(t1) > lw) continue;                  // early out before the 2nd band
            const t2 = fbm3(wx * 0.018 - 333, y * 0.05 + 219, wz * 0.018 - 141, 2);
            if (Math.abs(t2) <= lw) data[idx(x, y, z)] = B.AIR;
          }
          // cheese caverns deep down (big rooms, stone only). Some regions widen into GRAND
          // caverns — taller, lower carve threshold — held up by full stone pillars and
          // floor/ceiling rock spikes (per-column hash keeps them chunk-border stable).
          const grand = fbm(wx * 0.006 + 777, wz * 0.006 + 321, 2) > 0.30;
          const thr = grand ? 0.40 : 0.47;
          const pr = hash2(wx * 13 + 5, wz * 29 - 11);
          const isPillar = grand && pr < 0.012;                          // full floor-to-ceiling pillar
          const stalag = grand && !isPillar && pr < 0.055 ? 4 + ((pr * 4096 | 0) % 7) : 0;   // floor spike
          const stalac = grand && !isPillar && pr >= 0.055 && pr < 0.095 ? 4 + ((pr * 8192 | 0) % 7) : 0; // ceiling spike
          const yMaxC = Math.min(grand ? 42 : 34, capY);
          for (let y = 5; y <= yMaxC; y++) {
            const i = idx(x, y, z);
            if ((data[i] & 255) !== B.STONE) continue;
            if (isPillar) continue;
            if (stalag && y < 5 + stalag) continue;
            if (stalac && y > yMaxC - stalac) continue;
            if (fbm3(wx * 0.02, y * 0.03, wz * 0.02, 2) > thr) data[i] = B.AIR;
          }
        }

      /* ---- cave entrances: one dice roll per 16-block cell; a winding shaft bores from the
         surface down into cave depth. Land: 5% of cells (14% in mountains), r~2.4 with a
         flared mouth. Underwater: 0.5% and a tighter r~1.5. Pure function of world position.
         Shafts travel ~1.5 blocks horizontally per block of descent so entrances slope gently
         rather than plunging straight down. */
      const EMARGIN = 28;
      for (let ecz = Math.floor((cz * 16 - EMARGIN) / 16); ecz <= Math.floor((cz * 16 + 15 + EMARGIN) / 16); ecz++)
        for (let ecx = Math.floor((cx * 16 - EMARGIN) / 16); ecx <= Math.floor((cx * 16 + 15 + EMARGIN) / 16); ecx++) {
          const roll = hash2(ecx * 913 + 71, ecz * 641 - 233);
          const jx = ecx * 16 + 3 + (((roll * 4241) | 0) % 10);   // jittered start inside the cell
          const jz = ecz * 16 + 3 + (((roll * 6553) | 0) % 10);
          const ti = terrainInfo(jx, jz);
          const under = ti.h < WATER_LEVEL;                       // column has water above it
          const isMtn = !under && ti.h > 126;
          const landChance = isMtn ? 0.14 : 0.05;
          if (roll > (under ? 0.005 : landChance)) continue;
          const depth = 14 + (((roll * 88007) | 0) % 12) + (isMtn ? 6 : 0);
          const targetY = Math.max(8, ti.h - depth);
          let px = jx + 0.5, pz = jz + 0.5;
          let ang = hash2(ecx * 57 + 991, ecz * 83 - 447) * Math.PI * 2;
          // entrance style: 0 gentle winding slope · 1 plain vertical hole · 2 steep drop ·
          // 3 grand flared mouth · 4 grotto (hemispherical room, then a slope out its floor) ·
          // 5 long near-level tunnel that ends in a steep drop
          const style = ((roll * 7919) | 0) % 6;
          const clearCell = (gx, gy, gz) => {                    // shared carve helper (local coords)
            const lx = gx - cx * 16, lz = gz - cz * 16;
            if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || gy < 3 || gy > 199) return;
            const ii = idx(lx, gy, lz), bid = data[ii] & 255;
            if (bid !== B.WATER && bid !== B.BEDROCK) data[ii] = B.AIR;
          };
          let startY = ti.h + 1;
          if (style === 4 && !under) {                           // grotto: dome carved into the surface
            const R = 4 + (((roll * 331) | 0) % 2);
            for (let dy = 0; dy <= R; dy++)
              for (let oz = -R; oz <= R; oz++)
                for (let ox = -R; ox <= R; ox++) {
                  if (ox * ox + oz * oz + dy * dy * 2 > R * R) continue;
                  clearCell(Math.round(px) + ox, ti.h + 1 - dy, Math.round(pz) + oz);
                }
            startY = ti.h + 1 - R;                               // shaft leaves through the grotto floor
          }
          if (style === 5 && !under) {                           // long gently-declining tunnel first
            const L = 8 + (((roll * 557) | 0) % 8);
            for (let s2 = 0; s2 < L; s2++) {
              px += Math.cos(ang) * 1.0; pz += Math.sin(ang) * 1.0;
              ang += (hash2(jx * 19 + s2, jz * 23 - s2) - 0.5) * 0.3;
              const yy0 = ti.h - 1 - (s2 >> 2);
              const cxi = Math.round(px), czi = Math.round(pz);
              for (let oz = -2; oz <= 2; oz++)
                for (let ox = -2; ox <= 2; ox++) {
                  if (ox * ox + oz * oz > 3.2) continue;
                  clearCell(cxi + ox, yy0, czi + oz);
                  clearCell(cxi + ox, yy0 - 1, czi + oz);
                }
              startY = yy0 - 1;                                  // steep drop starts at tunnel end
            }
          }
          const horiz = style === 1 ? 0 : (style === 2 || style === 5) ? 0.5 : 1.5;
          const flare = style === 3 ? 2.6 : 1.1;
          const rBase = (under ? 1.5 : (isMtn ? 2.8 : 2.4)) * (style === 1 ? 0.9 : 1);
          for (let y = startY; y >= targetY; y--) {
            const t = startY - y;                                 // steps below the entry point
            ang += (hash2(jx * 31 + t, jz * 17 - t) - 0.5) * 0.55; // gentle wobble for gradual slope
            px += Math.cos(ang) * horiz;
            pz += Math.sin(ang) * horiz;
            const flaring = style <= 3 && t < (style === 3 ? 4 : 2) && !under;
            const r = rBase + (flaring ? flare * Math.max(0.3, 1 - t * 0.25) : 0) - Math.min(0.8, t * 0.04);
            const cxi = Math.round(px), czi = Math.round(pz), ri = Math.ceil(r);
            for (let oz = -ri; oz <= ri; oz++)
              for (let ox = -ri; ox <= ri; ox++) {
                if (ox * ox + oz * oz > r * r) continue;
                const lx = cxi + ox - cx * 16, lz = czi + oz - cz * 16;
                if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                for (let dy = 0; dy >= -1; dy--) {                // 2-tall passage
                  const yy = y + dy;
                  if (yy < 3 || yy > 199) continue;
                  const ii = idx(lx, yy, lz);
                  const bid = data[ii] & 255;
                  if (bid !== B.WATER && bid !== B.BEDROCK) data[ii] = B.AIR;
                }
              }
          }
        }

      // ---- cave lava pools (pool-seeded grid, bowl-shaped multi-y crater) ----
      // 22×22 cells, 22% chance each, radius up to ~6 blocks. Per-cell pool y is deterministic;
      // each column within radius carves a lava column from (poolY - bowlDepth) up to poolY, with
      // bowlDepth tapering parabolically from ~4 at the centre to 0 at the rim → looks like a
      // real crater/pond, not a flat slab. Rim pass fills air side-neighbors with stone.
      {
        const PCELL = 22, PR = 6, PR2 = PR * PR;
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const gcx = Math.round(wx / PCELL), gcz = Math.round(wz / PCELL);
          const ddx = wx - gcx * PCELL, ddz = wz - gcz * PCELL;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > PR2) continue;
          if (hash2(gcx * 31 + 5501, gcz * 37 + 6601) > 0.08) continue;
          const poolY = 5 + Math.floor(hash2(gcx * 71 + 2201, gcz * 73 + 3301) * 40);   // 5..44
          // parabolic bowl: deeper in middle, 0 at edge
          const t = 1 - d2 / PR2;
          const bowlDepth = Math.max(0, Math.floor(4 * t * t));
          const y0 = poolY - bowlDepth, y1 = poolY;
          for (let y = y0; y <= y1; y++) {
            const cur = data[idx(x, y, z)] & 255;
            if (cur === B.AIR || cur === B.STONE) data[idx(x, y, z)] = B.LAVA;
          }
        }
        // rim: side-neighbours of any lava cell that are air become stone (dam flow)
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) for (let y = 3; y < 48; y++) {
          if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
          for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + ndx, nz = z + ndz;
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
            if ((data[idx(nx, y, nz)] & 255) === B.AIR) data[idx(nx, y, nz)] = B.STONE;
          }
        }
      }

      // ---- surface lava ponds (crater-shape, biome-biased, cross-chunk consistent) ----
      // Uses terrainInfo(wx,wz) — a pure noise function — for every decision (rim y, biome bias,
      // flatness, water proximity), so any chunk overlapping a pool computes IDENTICAL results.
      // No dependence on the local chunk's H array or data grid → no seams, no floating lava.
      // Chances reduced 90% from 0.582; hill/mountain terrain rejected via rim y cap + flatness.
      {
        const PCELL = 40, PR = 6, PR2 = PR * PR;
        // deterministic per-pool center info, cached
        const centerCache = new Map();
        const centerInfo = (gcx, gcz) => {
          const k = gcx + ',' + gcz;
          if (centerCache.has(k)) return centerCache.get(k);
          const ti = terrainInfo(gcx * PCELL, gcz * PCELL);
          centerCache.set(k, ti);
          return ti;
        };
        // flatness + water-clearance check at pool center. Samples 4 rim points and 4 diagonals.
        const poolOkCache = new Map();
        const poolOk = (gcx, gcz, rimY) => {
          const k = gcx + ',' + gcz;
          if (poolOkCache.has(k)) return poolOkCache.get(k);
          let ok = true;
          const OFF = [[PR,0],[-PR,0],[0,PR],[0,-PR],[PR,PR],[-PR,-PR],[PR,-PR],[-PR,PR]];
          for (const [dx, dz] of OFF) {
            const ti = terrainInfo(gcx * PCELL + dx, gcz * PCELL + dz);
            if (Math.abs(ti.h - rimY) > 3) { ok = false; break; }        // hilly / mountainous
            if (ti.h <= WATER_LEVEL + 3) { ok = false; break; }          // beach / ocean nearby
          }
          poolOkCache.set(k, ok);
          return ok;
        };
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const gcx = Math.round(wx / PCELL), gcz = Math.round(wz / PCELL);
          const ddx = wx - gcx * PCELL, ddz = wz - gcz * PCELL;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > PR2) continue;
          const ci = centerInfo(gcx, gcz);
          const isDesertC = ci.fDesert > 0.5, isSnowC = ci.fSnow > 0.5;
          const chance = isSnowC ? 0.0002 : isDesertC ? 0.01 : 0.002;
          if (hash2(gcx * 41 + 7001, gcz * 43 + 7101) > chance) continue;
          const rimY = ci.h;
          if (rimY <= WATER_LEVEL + 3) continue;                         // no ocean/beach altitude
          if (rimY > 110) continue;                                      // no hills/mountains
          if (!poolOk(gcx, gcz, rimY)) continue;                         // reject if not flat / near water
          const t = 1 - d2 / PR2;
          const bowlDepth = Math.max(0, Math.floor(3 * t * t));
          const y0 = rimY - bowlDepth, y1 = rimY;
          for (let y = y0; y <= y1; y++) {
            if (y < 2 || y > 199) continue;
            const cur = data[idx(x, y, z)] & 255;
            if (cur !== B.WATER && cur !== B.BEDROCK) data[idx(x, y, z)] = B.LAVA;
          }
          if (rimY + 1 <= 199) {
            const above = data[idx(x, rimY + 1, z)] & 255;
            if (above !== B.WATER && above !== B.AIR) data[idx(x, rimY + 1, z)] = B.AIR;
          }
        }
        // rim: any side-neighbour of a lava cell that is air, grass, sand, red sand or dirt gets
        // replaced with stone — pool never touches grass or sand.
        const rimReplace = new Set([B.AIR, B.GRASS, B.SAND, B.RED_SAND, B.DIRT]);
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) for (let y = 60; y < 199; y++) {
          if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
          for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + ndx, nz = z + ndz;
            if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
            const nb = data[idx(nx, y, nz)] & 255;
            if (rimReplace.has(nb)) data[idx(nx, y, nz)] = B.STONE;
          }
          // also convert the block directly ABOVE the pool's top rim if it's grass/sand (looks weird
          // touching lava). Only for the top-most lava cell of each column.
          if ((data[idx(x, y + 1, z)] & 255) === B.AIR || (data[idx(x, y + 1, z)] & 255) === B.WATER) {
            // this y is the surface: convert diagonal-top grass/sand within-chunk to stone
            for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx = x + ndx, nz = z + ndz;
              if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
              const above = data[idx(nx, y + 1, nz)] & 255;
              if (above === B.GRASS || above === B.SAND || above === B.RED_SAND)
                data[idx(nx, y + 1, nz)] = B.STONE;
            }
          }
        }
      }

      /* ---- glow vines (0.765): strands hanging down cave walls, lighting the tunnels. A rare roll
         per open cave cell picks one side; if that side is rock, a strand of 2-6 hangs down it for
         as long as the rock face and the open air beside it both last. ---- */
      {
        const VINE_WALLS = [[0, -1, 0], [0, 1, 1], [-1, 0, 2], [1, 0, 3]];   // [dx, dz, variant]
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const top = Math.min(H[(x + 2) + (z + 2) * 20] - 6, 90);
            for (let y = 8; y < top; y++) {
              if ((data[idx(x, y, z)] & 255) !== B.AIR) continue;
              if (hash3(cx * 1543 + x, y + 7000, cz * 1327 + z) >= 0.005) continue;   // 0.7651: ~3x as common
              const w = VINE_WALLS[Math.floor(hash3(cx * 1543 + x, y + 7100, cz * 1327 + z) * 4) & 3];
              const wx = x + w[0], wz = z + w[1];
              if (wx < 0 || wx > 15 || wz < 0 || wz > 15) continue;
              const len = 2 + Math.floor(hash3(cx * 1543 + x, y + 7200, cz * 1327 + z) * 5);
              for (let k = 0; k < len && y - k > 2; k++) {
                if ((data[idx(x, y - k, z)] & 255) !== B.AIR || (data[idx(wx, y - k, wz)] & 255) !== B.STONE) break;
                data[idx(x, y - k, z)] = B.GLOW_VINE | (w[2] << 8);
              }
            }
          }
      }

      /* ---- cobwebs (0.766): strung in cave corners. A rare roll per open cave cell, kept only where at
         least two sides are rock, so a web sits in a nook — on the floor, a wall or the ceiling. ---- */
      {
        const WEB_NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (let z = 0; z < CZ; z++)
          for (let x = 0; x < CX; x++) {
            const top = Math.min(H[(x + 2) + (z + 2) * 20] - 6, 95);
            for (let y = 4; y < top; y++) {
              if ((data[idx(x, y, z)] & 255) !== B.AIR) continue;
              if (hash3(cx * 1601 + x, y + 8000, cz * 1409 + z) >= 0.0025) continue;
              let rock = 0;
              for (const [dx, dy, dz] of WEB_NB) {
                const nx = x + dx, nz = z + dz;
                if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
                if ((data[idx(nx, y + dy, nz)] & 255) === B.STONE) rock++;
              }
              if (rock >= 2) data[idx(x, y, z)] = B.COBWEB;
            }
          }
      }

      // ---- sulfur deposits ----
      // Two spawn modes:
      //   (a) under lava: 5-10 blocks below any lava cell, replace stone with a small cluster,
      //       tips (up on top of a block below air, down on ceiling above air) spawn frequently.
      //   (b) random single blocks: 0.05% per stone cell in y=30..80, peak density around y=48..50.
      //       Rare occasional tip on top/bottom.
      {
        // Sulfur block spawn rules:
        //   * must sit in stone
        //   * must have AIR directly above or below (cave-visible)
        //   * no lava or water in any of 6 neighbors (never touches liquids)
        // After the block is placed, try to grow a tip into the adjacent air on the exposed face.
        const inBounds = (nx, ny, nz) =>
          nx >= 0 && nx <= 15 && nz >= 0 && nz <= 15 && ny >= 0 && ny <= 199;
        const idAt = (nx, ny, nz) => inBounds(nx, ny, nz) ? (data[idx(nx, ny, nz)] & 255) : -1;
        const placeSulfur = (bx, by, bz, tipHash) => {
          if (bx < 0 || bx > 15 || bz < 0 || bz > 15 || by < 2 || by > 197) return;
          if ((data[idx(bx, by, bz)] & 255) !== B.STONE) return;
          const airTop = idAt(bx, by + 1, bz) === B.AIR;
          const airBot = idAt(bx, by - 1, bz) === B.AIR;
          if (!airTop && !airBot) return;                        // must be cave-exposed via top or bottom
          // reject if any neighbor is lava or water
          const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
          for (const [dx, dy, dz] of DIRS) {
            const nb = idAt(bx + dx, by + dy, bz + dz);
            if (nb === B.LAVA || nb === B.WATER) return;
          }
          data[idx(bx, by, bz)] = B.SULFUR_BLOCK;
          // try to grow a tip on each exposed face (50% chance each). tipHash provides variety.
          if (airTop && (tipHash === undefined || tipHash < 0.5))
            data[idx(bx, by + 1, bz)] = B.SULFUR_UP_TIP;
          if (airBot && (tipHash === undefined || tipHash >= 0.5))
            data[idx(bx, by - 1, bz)] = B.SULFUR_UP_TIP | (1 << 8);   // variant 1 = down orientation
        };
        // (a) under-lava clusters
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          for (let y = 3; y < 190; y++) {
            if ((data[idx(x, y, z)] & 255) !== B.LAVA) continue;
            const wx = cx * 16 + x, wz = cz * 16 + z;
            const depth = 2 + Math.floor(hash3(wx * 29 + 12001, y * 7 + 3, wz * 31 + 12001) * 9);   // 2..10
            const cy = y - depth;
            if (cy < 3) continue;
            const clusterN = 3 + Math.floor(hash3(wx * 41 + 13001, y * 11 + 5, wz * 37 + 13001) * 4);
            for (let k = 0; k < clusterN; k++) {
              const ox = Math.floor(hash3(wx * 53 + k, cy + 7 * k, wz * 47 + k * 3) * 3) - 1;
              const oy = Math.floor(hash3(wx * 61 + k * 5, cy * 3 + k, wz * 59 + k) * 3) - 1;
              const oz = Math.floor(hash3(wx * 67 + k * 7, cy + k * 11, wz * 71 + k * 5) * 3) - 1;
              const tipH = hash3(wx * 79 + k, cy + k * 13, wz * 83 + k * 5);
              placeSulfur(x + ox, cy + oy, z + oz, tipH);
            }
            break;   // one cluster per column max
          }
        }
        // (b) rare single blocks y=30..80, peak 48..50
        for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          for (let y = 30; y <= 80; y++) {
            if ((data[idx(x, y, z)] & 255) !== B.STONE) continue;
            const d = (y - 49) / 10;
            const weight = Math.exp(-d * d);
            const chance = 0.0005 * (0.3 + 0.7 * weight);
            if (hash3(wx * 89 + 14001, y * 19 + 7, wz * 97 + 14001) < chance) {
              const tipH = hash3(wx * 103, y * 23, wz * 107);
              placeSulfur(x, y, z, tipH);
            }
          }
        }
      }

      }   // end !FLAT underground section

      // trees — evaluated over the margin so neighbours get the overlapping leaves
      const put = (x, y, z, id, force) => {
        if (x < 0 || x > 15 || z < 0 || z > 15 || y < 2 || y > 199) return;
        const i = idx(x, y, z);
        if (force || data[i] === B.AIR) data[i] = id;
      };
      // At most one tree per 5x5 world-grid cell, at a hash-jittered position 1..3 inside the
      // cell — trunks are therefore always >=3 blocks apart (no touching twin trees), while
      // remaining a pure function of world position so chunk borders agree.
      // widened margin (-8..+23) so wider big-tree branches from neighbouring cells reach into this chunk
      const minX = cx * 16 - 8, maxX = cx * 16 + 23, minZ = cz * 16 - 8, maxZ = cz * 16 + 23;
      for (let gcz = Math.floor(minZ / 5); gcz <= Math.floor(maxZ / 5); gcz++) {
        for (let gcx = Math.floor(minX / 5); gcx <= Math.floor(maxX / 5); gcx++) {
          const r = hash2(gcx, gcz);                           // the cell's dice roll
          const wx = gcx * 5 + 1 + (((r * 977) | 0) % 3);      // jittered trunk position
          const wz = gcz * 5 + 1 + (((r * 7919) | 0) % 3);
          if (wx < minX || wx > maxX || wz < minZ || wz > maxZ) continue;
          const tx = wx - cx * 16, tz = wz - cz * 16;
          // sample biome/height at the actual trunk world position — the H/TREE/DES arrays
          // only cover chunk+2 margin, but our widened tree loop reaches further.
          const ti = terrainInfo(wx, wz);
          const h = ti.h;
          if (h <= WATER_LEVEL + 1 || h > 146 || ti.fDesert > 0.5) continue;
          // no trees on or hanging over canyon lines — conservative buffer covering every canyon
          // type (crack/wide/long) so canopies always clear the rim
          if (fbm(wx * 0.0015 + 555, wz * 0.0015 - 333, 2) > 0.28 &&
              (Math.abs(fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2)) < 0.15 ||
               Math.abs(fbm(wx * 0.0035 + 911, wz * 0.011 - 477, 2)) < 0.10 ||
               Math.abs(fbm(wx * 0.011 + 911, wz * 0.0035 - 477, 2)) < 0.10)) continue;
          const isPlains = ti.fPlains > 0.5;
          // snow: trees only inside the Snow Forest sub-biome mask; plain Snow stays treeless
          const isSnow = ti.fSnow > 0.5;
          if (isSnow && fbm(wx * 0.004 + 2222, wz * 0.004 + 888, 2) <= 0.25) continue;
          const forestNoise = fbm(wx * 0.01 + 700, wz * 0.01 - 300, 2) > 0.12;
          const treeF = 1 - ti.fPlains;
          // birch: dedicated "Birch Forest" regions (dense) + 1% scattered birches in ordinary
          // forests. Never in snow biomes, never the big/mega form.
          const birchRegion = !isPlains && !isSnow && fbm(wx * 0.004 + 1234, wz * 0.004 - 987, 2) > 0.35;
          const isBirch = birchRegion || (!isPlains && !isSnow && hash2(gcx * 211 + 5, gcz * 197 + 3) < 0.01);
          // spruce is strictly a cold-biome tree — no scattering into temperate forest
          const isSpruce = !isBirch && isSnow;
          // plains/meadow: flat 0.1% chance. forest/other: original density-scaled odds. birch forest: dense.
          // flat worlds are entirely Plains, and plains odds (0.1%) would leave a testbed with
          // almost no trees at all — lift it enough that a few are always in sight
          /* Roughly halved across the board. Canopies are far bigger than they used to be —
             wider oaks, tall spruce cones — so the old per-cell odds packed the forest into a
             solid roof with no gaps or light between trunks. */
          let baseProb = isPlains ? (FLAT ? 0.02 : 0.0007) : (forestNoise ? 0.26 : 0.04) * treeF;
          if (birchRegion) baseProb = Math.max(baseProb, 0.24);
          if (r > baseProb) continue;
          // flatness check
          let clear = true;
          for (let oz = -2; oz <= 2 && clear; oz++)
            for (let ox = -2; ox <= 2; ox++)
              if (heightAt(wx + ox, wz + oz) > h + 2) { clear = false; break; }
          if (!clear) continue;
          // big-tree roll (independent hash). plains: 50% of the 1%. others: ~3%.
          const rBig = hash2(gcx * 131 + 7, gcz * 173 + 19);
          const bigProb = isPlains ? 0.3 : 0.03;
          const isBig = rBig < bigProb && !isBirch;      // birch never grows the big form

          if (isBig) {
            // procedural big tree: tall trunk, 3-5 branches with leaf clusters, wide top canopy
            // same independent-hash rule as the small tree — `r` is too small to derive from
            const bRand = (a, b) => hash2(gcx * 29 + a, gcz * 61 + b);
            const trunkH = 9 + ((bRand(3, 5) * 4) | 0);        // 9..12
            put(tx, h, tz, B.DIRT, true);
            // big oak: an oversized stump flaring past its own cell, tapering one index per cell
            // down to the trunk — a hard step from stump straight to trunk width read as a wide
            // block with a pole balanced on it
            const bigStumpW = LOG_W_BLOCK + 6, bigTrunkW = 26;
            for (let y = h + 1; y <= h + trunkH; y++) {
              const w = Math.max(bigTrunkW, bigStumpW - (y - (h + 1)));
              put(tx, y, tz, B.LOG | ((w << 2) << 8), true);
            }
            // top canopy: 7x7 base spanning 3 layers, then 5x5, 3x3, tip
            for (let ly = h + trunkH - 2; ly <= h + trunkH + 1; ly++)
              for (let oz = -3; oz <= 3; oz++)
                for (let ox = -3; ox <= 3; ox++) {
                  const rad2 = ox * ox + oz * oz;
                  if (rad2 > 10) continue;                   // rounded footprint
                  if (rad2 >= 8 && hash2(wx + ox * 31, wz + oz * 17 + ly) < 0.55) continue;
                  put(tx + ox, ly, tz + oz, B.LEAVES, false);
                }
            const cap = h + trunkH + 2;
            for (let oz = -2; oz <= 2; oz++)
              for (let ox = -2; ox <= 2; ox++) {
                const rad2 = ox * ox + oz * oz;
                if (rad2 > 5) continue;
                if (rad2 >= 4 && hash2(wx + ox * 61, wz + oz * 41 + cap) < 0.55) continue;
                put(tx + ox, cap, tz + oz, B.LEAVES, false);
              }
            for (let oz = -1; oz <= 1; oz++)
              for (let ox = -1; ox <= 1; ox++)
                if (Math.abs(ox) + Math.abs(oz) < 2) put(tx + ox, cap + 1, tz + oz, B.LEAVES, false);
            put(tx, cap + 2, tz, B.LEAVES, false);
            // 5..8 branches, angled outward from mid-upper trunk with fatter leaf blobs
            const nBranches = 5 + ((bRand(7, 11) * 4) | 0);
            for (let b = 0; b < nBranches; b++) {
              const bh = h + Math.floor(trunkH * 0.45) + Math.floor(b * 0.8);
              const angle = hash2(wx + b * 53, wz + b * 89) * Math.PI * 2;
              const dx = Math.cos(angle), dz = Math.sin(angle);
              const len = 3 + ((bRand(31 + b * 5, 37 + b * 3) * 4) | 0);   // 3..6
              // branch logs lie along their dominant horizontal axis (variant 1 = X, 2 = Z)
              const branchVar = Math.abs(dx) >= Math.abs(dz) ? 1 : 2;
              let bx = 0, bz2 = 0, by = bh;
              for (let s = 1; s <= len; s++) {
                bx = Math.round(dx * s);
                bz2 = Math.round(dz * s);
                by = bh + Math.floor(s * 0.45);
                // taper as it reaches out, same rule the small tree uses
                const bw = Math.max(LOG_W_MIN + 3, 22 - (s - 1) * 3);
                put(tx + bx, by, tz + bz2, B.LOG | ((branchVar | (bw << 2)) << 8), true);
              }
              // wider leaf blob at branch tip (radius ~2) + a smaller blob mid-branch
              for (let ly = -2; ly <= 2; ly++)
                for (let oz = -2; oz <= 2; oz++)
                  for (let ox = -2; ox <= 2; ox++) {
                    const d = Math.abs(ox) + Math.abs(oz) + Math.abs(ly);
                    if (d > 4) continue;
                    if (d === 4 && hash2(wx + ox * 71 + b, wz + oz * 83 + ly) < 0.5) continue;
                    put(tx + bx + ox, by + ly + 1, tz + bz2 + oz, B.LEAVES, false);
                  }
              // mid-branch leaf tuft (halfway along the branch)
              const midS = Math.max(1, Math.floor(len * 0.55));
              const mx = Math.round(dx * midS), mz2 = Math.round(dz * midS);
              const my = bh + Math.floor(midS * 0.45);
              for (let ly = -1; ly <= 1; ly++)
                for (let oz = -1; oz <= 1; oz++)
                  for (let ox = -1; ox <= 1; ox++)
                    if (Math.abs(ox) + Math.abs(oz) + Math.abs(ly) < 3)
                      put(tx + mx + ox, my + ly + 1, tz + mz2 + oz, B.LEAVES, false);
            }
            continue;
          }

          /* Small tree (also used for all birches). birch trunks are taller (5..10).
             Three canopy silhouettes chosen per tree so a forest is not one shape repeated:
               0 ROUND  - the classic 5x5 blob, widest in the middle
               1 TALL   - narrower and one layer higher, reads as a young/crowded tree
               2 SPREAD - 7-wide bottom layer thinning fast, the "old oak" umbrella
             Every form also grows 1-3 stub branches: a single horizontal log poking out of the
             upper trunk with a small tuft on it. That is what makes the trunk read as a tree
             rather than a pole, and it costs one extra log per branch. */
          const LOG = isSpruce ? B.SPRUCE_LOG : isBirch ? B.BIRCH_LOG : B.LOG;
          const LEAF = isSpruce ? B.SPRUCE_LEAVES : isBirch ? B.BIRCH_LEAVES : B.LEAVES;

          /* Spruce is a cone, not a ball, so it gets its own shape entirely: a straight pole with
             skirts of needles that shrink toward a point. Branch stubs are skipped — a conifer's
             limbs are short and buried in the skirt, so a bare stub sticking out looks wrong. */
          if (isSpruce) {
            const sh = 14 + ((hash2(gcx * 53 + 3, gcz * 97 + 7) * 7) | 0);         // 14..20 tall
            put(tx, h, tz, B.DIRT, true);
            /* The trunk narrows the whole way up rather than stepping from stump to a constant
               width — a real conifer is a spike, and by the crown it is barely thicker than a
               branch. 30 units at the base down to 14 at the tip. */
            const SPR_STUMP = 30, SPR_TIP = 14;
            for (let y = h + 1; y <= h + sh; y++) {
              const t = (y - (h + 1)) / Math.max(1, sh - 1);
              const w = Math.round(SPR_STUMP - (SPR_STUMP - SPR_TIP) * t);
              put(tx, y, tz, LOG | ((w << 2) << 8), true);
            }
            /* Needles: a broad heavy skirt low down thinning to a spike, and never absent at the
               top — radius is interpolated 4 -> 1 over the canopy and floored at 1, so the crown
               always carries foliage instead of ending in bare trunk. Alternate tiers pull in one
               step for the layered look, and the rim thins out as it climbs so the silhouette
               reads dense at the bottom and wispy at the top. */
            const base = h + 2, topY = h + sh, span = Math.max(1, topY - base);
            for (let ly = base; ly <= topY; ly++) {
              const t = (ly - base) / span;                                        // 0 low .. 1 high
              let rad = Math.max(1, Math.round(4 - 3.2 * t));
              if (((ly - base) % 2) === 1) rad = Math.max(1, rad - 1);
              const rimKeep = 0.85 - 0.5 * t;                                      // thinner rim up top
              for (let oz = -rad; oz <= rad; oz++)
                for (let ox = -rad; ox <= rad; ox++) {
                  const d = Math.abs(ox) + Math.abs(oz);
                  if (d > rad) continue;
                  if (d === rad && hash2(wx + ox * 31 + ly, wz + oz * 17 - ly) > rimKeep) continue;
                  put(tx + ox, ly, tz + oz, LEAF, false);
                }
            }
            for (let t2 = 1; t2 <= 2; t2++) put(tx, topY + t2, tz, LEAF, false);   // spire
            const SLIT = layerVal(B.SPRUCE_LEAVES, 1);
            for (let oz = -2; oz <= 2; oz++)
              for (let ox = -2; ox <= 2; ox++) {
                if (!ox && !oz) continue;
                if (hash2(wx + ox * 137 + 41, wz + oz * 211 - 29) > 0.3) continue;
                const lx = tx + ox, lz = tz + oz;
                if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
                put(lx, h + 1, lz, SLIT, false);
              }
            continue;
          }
          // birch grows tall and straight (7..12); oak keeps a shorter, thicker stump (5..8)
          const th = isBirch ? 7 + ((hash2(gcx * 43 + 5, gcz * 71 + 9) * 6) | 0)
                             : 5 + ((hash2(gcx * 43 + 5, gcz * 71 + 9) * 4) | 0);
          /* Per-tree dice. NOT derived from `r`: a tree only exists when r <= baseProb, and
             baseProb is as low as 0.001, so every `(r * K) | 0` truncated to 0 and each tree came
             out with identical form, branch count and branch length. These are independent
             hashes of the grid cell, still a pure function of world position. */
          const tRand = (a, b) => hash2(gcx * 37 + a, gcz * 53 + b);
          const form = (tRand(11, 23) * 3) | 0;

          /* Trunk width, and the flared stump at its foot.
             Oak carries a stump wider than a full cell (up to 76 units). That only looks right on
             open ground, so it needs 3x3 of grass/dirt under it — otherwise the flare hangs over
             a ledge. Failing the test isn't fatal: the tree still grows, just on a plain trunk.
             Birch never flares; its width tracks its height so tall ones aren't spindly. */
          const TRUNK_W_MIN = 26;                                          // 60 units, both species
          const trunkW = isBirch ? Math.max(TRUNK_W_MIN, Math.min(28, 16 + th))
                                 : TRUNK_W_MIN + ((tRand(131, 137) * 3) | 0);
          let stumpW = trunkW;
          if (!isBirch) {
            const want = LOG_W_BLOCK + 2 + ((tRand(139, 149) * 5) | 0);    // 68..76 units
            let flat = true;
            for (let oz = -1; oz <= 1 && flat; oz++)
              for (let ox = -1; ox <= 1; ox++) {
                const gx2 = tx + ox, gz2 = tz + oz;
                if (gx2 < 0 || gx2 > 15 || gz2 < 0 || gz2 > 15) continue;  // outside: trust the flatness test
                const under = data[idx(gx2, h, gz2)] & 255;
                if (under !== B.GRASS && under !== B.DIRT) { flat = false; break; }
              }
            if (flat) stumpW = want;
          }
          const wBits = (w) => (w << 2);                   // variant bits 2-7 carry the width

          put(tx, h, tz, B.DIRT, true);
          /* The flare tapers away instead of stopping dead: each cell above the stump loses one
             width index (2 units) until it reaches the trunk width. A 70-unit stump therefore
             reads 70, 68, 66 ... down to 60, which is what makes the base look grown rather than
             like a wide block with a thin pole balanced on it. */
          for (let y = h + 1; y <= h + th; y++) {
            const w = Math.max(trunkW, stumpW - (y - (h + 1)));
            put(tx, y, tz, LOG | (wBits(w) << 8), true);
          }

          /* Stub branches on the upper half of the trunk, each on its own side and each its own
             LENGTH (1..3 cells, rising as it goes out). Uniform 1-cell stubs made every tree
             look identical from a distance; varying the reach is what gives a stand its ragged,
             overlapping canopy line. */
          /* Birch and oak branch very differently, and treating them the same was what made
             birches look wrong — a fat branch a third of the way up a slender white trunk.

             BIRCH: a tall clean pole. Branches only in the top quarter, at most two, and only on
                    a trunk tall enough to have earned them.
             OAK:   branchier and shaggier, 2..4 branches spread over the upper half.

             Branch cells carry thickness 2 in variant bits 2-3, so a branch renders visibly
             thinner than the trunk it grows from instead of being another full log. */
          const isTall = th >= (isBirch ? 8 : 6);
          const nStub = isBirch ? (isTall ? 1 + ((tRand(41, 59) * 2) | 0) : 0)
                                : 2 + ((tRand(41, 59) * 3) | 0);
          const stubLow  = isBirch ? h + th - Math.max(1, Math.round(th * 0.25))   // top quarter
                                   : h + th - Math.max(2, Math.round(th * 0.5));   // upper half
          const stubSpan = Math.max(1, (h + th - 1) - stubLow);
          const STUB_DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (let s = 0; s < nStub; s++) {
            const dir = STUB_DIR[(tRand(71 + s * 13, 83 + s * 7) * 4) | 0];
            const sy = stubLow + ((tRand(97 + s * 11, 101 + s * 5) * stubSpan) | 0);
            if (sy <= h + 2) continue;                           // never down at the stump
            // birch twigs stay short; oak reaches out and rises as it goes
            const len = isBirch ? 1 + ((tRand(103 + s * 3, 107 + s * 9) * 2) | 0)
                                : 1 + ((tRand(103 + s * 3, 107 + s * 9) * 3) | 0);
            /* Walk the branch as a path of horizontal runs and vertical risers rather than one
               diagonal line of horizontal logs. The riser cells are Y-axis logs, so at every turn
               the horizontal log flares into the vertical one (logInto already does that) and the
               pair reads as an L elbow pointing the way the branch is going — which is what a
               real limb looks like where it kinks upward.

               Birch rises a cell per step, so it is elbows all the way up; oak runs out level and
               kinks once it is clear of the trunk. */
            const axisVar = dir[0] ? 1 : 2;                      // lie flat along X or Z
            let ex = tx, ez = tz, ey = sy;
            for (let k = 1; k <= len; k++) {
              ex = tx + dir[0] * k; ez = tz + dir[1] * k;
              const bw = isBirch ? 11                            // 30 units, uniform
                                 : Math.max(LOG_W_MIN + 3, trunkW - 4 - (k - 1) * 3);
              put(ex, ey, ez, LOG | ((axisVar | wBits(bw)) << 8), true);   // horizontal run
              const rise = isBirch ? 1 : (k === 1 ? 1 : 0);
              for (let u = 0; u < rise; u++) {
                ey++;
                put(ex, ey, ez, LOG | ((0 | wBits(bw)) << 8), true);       // the elbow, vertical
              }
            }
            // leaf tuft on the branch tip, sized with the branch
            const tuft = len >= 3 ? 2 : 1;
            for (let ly = 0; ly <= tuft; ly++)
              for (let oz = -tuft; oz <= tuft; oz++)
                for (let ox = -tuft; ox <= tuft; ox++)
                  if (Math.abs(ox) + Math.abs(oz) + ly <= tuft + 1)
                    put(ex + ox, ey + ly, ez + oz, LEAF, false);
          }

          const wide = form === 2 ? 3 : 2;                       // SPREAD reaches one further
          const lowTop = form === 1 ? h + th : h + th - 1;       // TALL starts its canopy higher
          for (let ly = lowTop - 1; ly <= lowTop; ly++)
            for (let oz = -wide; oz <= wide; oz++)
              for (let ox = -wide; ox <= wide; ox++) {
                if (ox === 0 && oz === 0) continue;
                const rad2 = ox * ox + oz * oz;
                if (rad2 > wide * wide + 1) continue;            // rounded, not square
                if (form === 1 && rad2 > 4) continue;            // TALL stays narrow
                if (rad2 >= wide * wide && hash2(wx + ox * 31, wz + oz * 17 + ly) < 0.5) continue;
                put(tx + ox, ly, tz + oz, LEAF, false);
              }
          const cap = lowTop + 1;                                // 3x3 cap without corners
          for (let oz = -1; oz <= 1; oz++)
            for (let ox = -1; ox <= 1; ox++)
              if (Math.abs(ox) + Math.abs(oz) < 2) put(tx + ox, cap, tz + oz, LEAF, false);
          put(tx, cap + 1, tz, LEAF, false);                     // tip
          if (form === 1) put(tx, cap + 2, tz, LEAF, false);      // TALL gets one more

          /* Fallen leaf litter around the base. Placed only where the cell below is actually
             grass inside this chunk — the canopy overhangs neighbouring columns whose height we
             have not sampled, and littering those blind would leave carpets floating on slopes. */
          const LITTER = layerVal(isBirch ? B.BIRCH_LEAVES : B.LEAVES, 1);
          for (let oz = -2; oz <= 2; oz++)
            for (let ox = -2; ox <= 2; ox++) {
              if (!ox && !oz) continue;
              if (hash2(wx + ox * 137 + 9, wz + oz * 211 - 5) > 0.3) continue;
              const lx = tx + ox, lz = tz + oz;
              if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
              if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
              put(lx, h + 1, lz, LITTER, false);
            }
        }
      }

      /* Snowy grass sides are only correct when snow is actually sitting on the block. The snow
         cap is laid before the tree pass, so any column a trunk landed in still claims a white
         rim under bare wood. Sweep it off after the trees have gone in. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi2 = (x + 2) + (z + 2) * 20, hh = H[gi2];
          if (hh < 1 || hh > 198) continue;
          const gv = data[idx(x, hh, z)];
          if ((gv & 255) !== B.GRASS || ((gv >> 8) & 255) !== V.GRASS_SNOWY) continue;
          // a snow block or a stack of snow layers (layers are the snow block's own id since 0.785)
          const snowAbove = (data[idx(x, hh + 1, z)] & 255) === B.SNOW;
          if (!snowAbove) data[idx(x, hh, z)] = B.GRASS;
        }

      /* ---- red mushrooms: cave floors + shadowed ground under leaves ---- */
      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          // cave floors: stone floor with air directly above, below surface crust
          const caveTop = Math.min(h - 4, 94);
          for (let y = 3; y < caveTop; y++) {
            if ((data[idx(x, y, z)] & 255) === B.STONE &&
                (data[idx(x, y + 1, z)] & 255) === B.AIR &&
                hash3(cx * 1171 + x, y + 3000, cz * 937 + z) < 0.002)
              data[idx(x, y + 1, z)] = hash3(cx * 1171 + x, y + 4000, cz * 937 + z) < 1 / 3
                ? B.RED_MUSHROOM : hash3(cx * 1171 + x, y + 4000, cz * 937 + z) < 2 / 3 ? B.BROWN_MUSHROOM : B.BLUE_MUSHROOM;   // thirds since 0.7691
          }
          // surface under leaves: air at h+1 with leaves within 2..5 blocks above
          if (h > WATER_LEVEL && h < 120) {
            const topBk = data[idx(x, h, z)] & 255;
            if ((topBk === B.GRASS || topBk === B.DIRT) &&
                (data[idx(x, h + 1, z)] & 255) === B.AIR) {
              let hasLeaves = false;
              for (let dy = 2; dy <= 5 && h + dy < 200; dy++) {
                if ((data[idx(x, h + dy, z)] & 255) === B.LEAVES) { hasLeaves = true; break; }
              }
              if (hasLeaves && hash3(cx * 1279 + x, h + 5000, cz * 1031 + z) < 0.0007)
                data[idx(x, h + 1, z)] = hash3(cx * 1279 + x, h + 6000, cz * 1031 + z) < 1 / 3
                  ? B.RED_MUSHROOM : hash3(cx * 1279 + x, h + 6000, cz * 1031 + z) < 2 / 3 ? B.BROWN_MUSHROOM : B.BLUE_MUSHROOM;   // thirds since 0.7691
            }
          }
        }
      }

      /* ---- fallen hollow logs (0.7842): now and then a forest chunk has a hollow log lying in the grass, 3-5
         long along X or Z, of the wood that grows there, with mushrooms springing up around it. Kept inside
         the chunk, on level ground, and cut short at the first cell that is not free (never under 3).
         0.7845: rarer, fewer mushrooms, and some start from a stump — a standing hollow log or a plain log. ---- */
      {
        const sx = (hash3(cx * 61 + 7300, 31, cz * 67 + 7300) * 16) | 0;
        const sz = (hash3(cx * 71 + 7300, 37, cz * 73 + 7300) * 16) | 0;
        const gi = (sx + 2) + (sz + 2) * 20, h = H[gi];
        const wx = cx * 16 + sx, wz = cz * 16 + sz;
        if (TREE[gi] >= 0.5 && !DES[gi] && h > WATER_LEVEL + 1 && h <= 146 &&
            !(SNO[gi] && fbm(wx * 0.004 + 2222, wz * 0.004 + 888, 2) <= 0.25) &&       // plain snow has no trees to fall
            hash3(cx * 79 + 7300, 41, cz * 83 + 7300) < 0.15) {                             // 0.35 before 0.7845
          const wood = SNO[gi] ? B.HOLLOW_SPRUCE_LOG
                     : fbm(wx * 0.004 + 1234, wz * 0.004 - 987, 2) > 0.35 ? B.HOLLOW_BIRCH_LOG : B.HOLLOW_LOG;   // birchRegion
          const alongX = hash3(cx * 89 + 7300, 43, cz * 97 + 7300) < 0.5;
          const want = 3 + ((hash3(cx * 101 + 7300, 47, cz * 103 + 7300) * 3) | 0);
          const ground = (t) => t === B.GRASS || t === B.DIRT;
          const open = (v) => (v & 255) === B.AIR || layerCount(v) > 0;                  // leaf litter or snow gives way
          const cells = [];
          for (let k = 0; k < want; k++) {
            const lx = sx + (alongX ? k : 0), lz = sz + (alongX ? 0 : k);
            if (lx > 15 || lz > 15 || H[(lx + 2) + (lz + 2) * 20] !== h) break;
            if (!ground(data[idx(lx, h, lz)] & 255) || !open(data[idx(lx, h + 1, lz)])) break;
            cells.push([lx, lz]);
          }
          if (cells.length >= 3) {
            // the first cell is sometimes the stump it fell from: 30% a standing hollow log, 20% the tree's plain log
            const stump = hash3(cx * 107 + 7300, 53, cz * 109 + 7300);
            const plainLog = wood === B.HOLLOW_SPRUCE_LOG ? B.SPRUCE_LOG : wood === B.HOLLOW_BIRCH_LOG ? B.BIRCH_LOG : B.LOG;
            cells.forEach(([lx, lz], k) => {
              data[idx(lx, h + 1, lz)] = k === 0 && stump < 0.3 ? wood
                                     : k === 0 && stump < 0.5 ? plainLog
                                     : wood | ((alongX ? 1 : 2) << 8);
            });
            const shroom = (mx, mz, salt) => {
              if (mx < 0 || mx > 15 || mz < 0 || mz > 15 || H[(mx + 2) + (mz + 2) * 20] !== h) return;
              const roll = hash3(cx * 1301 + mx, h + 7400 + salt, cz * 1307 + mz);
              if (roll >= 0.12) return;                                                   // 0.3 before 0.7845
              if (!ground(data[idx(mx, h, mz)] & 255) || !open(data[idx(mx, h + 1, mz)])) return;
              data[idx(mx, h + 1, mz)] = roll < 0.04 ? B.RED_MUSHROOM : roll < 0.08 ? B.BROWN_MUSHROOM : B.BLUE_MUSHROOM;
            };
            cells.forEach(([lx, lz], k) => { shroom(lx + (alongX ? 0 : 1), lz + (alongX ? 1 : 0), k * 2);
                                             shroom(lx - (alongX ? 0 : 1), lz - (alongX ? 1 : 0), k * 2 + 1); });
            // ...and now and then a tuft of loose fiber, 1-2 layers, in the free grass beside it (0.786)
            const fiber = (mx, mz, salt) => {
              if (mx < 0 || mx > 15 || mz < 0 || mz > 15 || H[(mx + 2) + (mz + 2) * 20] !== h) return;
              const roll = hash3(cx * 1409 + mx, h + 7600 + salt, cz * 1423 + mz);
              if (roll >= 0.1) return;                                                    // 0.2 before 0.791
              if (!ground(data[idx(mx, h, mz)] & 255) || (data[idx(mx, h + 1, mz)] & 255) !== B.AIR) return;
              data[idx(mx, h + 1, mz)] = layerVal(B.FIBER_BLOCK, roll < 0.035 ? 2 : 1);   // same 35% double share
            };
            cells.forEach(([lx, lz], k) => { fiber(lx + (alongX ? 0 : 1), lz + (alongX ? 1 : 0), k * 2);
                                             fiber(lx - (alongX ? 0 : 1), lz - (alongX ? 1 : 0), k * 2 + 1); });
            const [ax, az] = cells[0], [bx, bz] = cells[cells.length - 1];
            shroom(ax - (alongX ? 1 : 0), az - (alongX ? 0 : 1), 50);
            shroom(bx + (alongX ? 1 : 0), bz + (alongX ? 0 : 1), 51);
          }
        }
      }

      /* ---- fiber blocks (0.769): very rarely an open-plains grass block is a tuft of packed fiber
         instead. Same plains test the melons below use: low tree density, no desert, no snow. ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h <= WATER_LEVEL + 1 || h > 146 || DES[gi] || SNO[gi] || TREE[gi] >= 0.5) continue;
          if ((data[idx(x, h, z)] & 255) !== B.GRASS) continue;
          if (hash3(cx * 1709 + x, 9100, cz * 1523 + z) < 0.0002) data[idx(x, h, z)] = B.FIBER_BLOCK;   // 0.0006 before 0.791
        }

      /* ---- melons: grass surfaces in forest/plains. Plains: 1.5% per attempt, up to 5 in a
         group (r=4). Forest: 0.5% per attempt, up to 3 in a group (r=2). ---- */
      for (let ai = 0; ai < 2; ai++) {
        const mx = (hash3(cx * 47 + 1100 + ai,       19, cz * 43 + 1100 + ai    ) * 16) | 0;
        const mz = (hash3(cx * 53 + 1100 + ai * 3,   23, cz * 59 + 1100 + ai    ) * 16) | 0;
        const gi = (mx + 2) + (mz + 2) * 20;
        const h = H[gi];
        if (h <= WATER_LEVEL + 1 || h > 146 || DES[gi] || SNO[gi]) continue;
        const isPlains = TREE[gi] < 0.5;              // TREE = 1 - fPlains; low = open plains
        const chance = isPlains ? 0.015 : 0.005;
        if (hash3(cx * 71 + 1100 + ai, 77, cz * 67 + 1100 + ai) >= chance) continue;
        const clusterN = isPlains ? 1 + ((hash3(cx + 1100 + ai, 81, cz + 1100 + ai) * 4) | 0)
                                  : 1 + ((hash3(cx + 1100 + ai, 83, cz + 1100 + ai) * 2) | 0);
        const radius = isPlains ? 4 : 2;
        for (let k = 0; k < clusterN; k++) {
          const offx = (((hash3(cx * 31 + ai + k * 7,  89, cz * 29 + ai + k * 5) * (radius * 2 + 1)) | 0) - radius);
          const offz = (((hash3(cx * 37 + ai + k * 11, 97, cz * 41 + ai + k * 3) * (radius * 2 + 1)) | 0) - radius);
          const lx = mx + offx, lz = mz + offz;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
          const lgi = (lx + 2) + (lz + 2) * 20;
          const lh = H[lgi];
          if (lh <= WATER_LEVEL + 1 || lh > 146) continue;
          if ((data[idx(lx, lh, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, lh + 1, lz)] & 255) !== B.AIR) continue;
          data[idx(lx, lh + 1, lz)] = B.MELON;
        }
      }

      /* ---- pumpkins: same patch behaviour as melons, own hashes so they scatter separately ---- */
      for (let ai = 0; ai < 2; ai++) {
        const mx = (hash3(cx * 47 + 2200 + ai,       19, cz * 43 + 2200 + ai    ) * 16) | 0;
        const mz = (hash3(cx * 53 + 2200 + ai * 3,   23, cz * 59 + 2200 + ai    ) * 16) | 0;
        const gi = (mx + 2) + (mz + 2) * 20;
        const h = H[gi];
        if (h <= WATER_LEVEL + 1 || h > 146 || DES[gi] || SNO[gi]) continue;
        const isPlains = TREE[gi] < 0.5;
        const chance = isPlains ? 0.012 : 0.004;
        if (hash3(cx * 71 + 2200 + ai, 77, cz * 67 + 2200 + ai) >= chance) continue;
        const clusterN = isPlains ? 1 + ((hash3(cx + 2200 + ai, 81, cz + 2200 + ai) * 4) | 0)
                                  : 1 + ((hash3(cx + 2200 + ai, 83, cz + 2200 + ai) * 2) | 0);
        const radius = isPlains ? 4 : 2;
        for (let k = 0; k < clusterN; k++) {
          const offx = (((hash3(cx * 31 + ai + k * 7,  89, cz * 29 + ai + k * 5) * (radius * 2 + 1)) | 0) - radius);
          const offz = (((hash3(cx * 37 + ai + k * 11, 97, cz * 41 + ai + k * 3) * (radius * 2 + 1)) | 0) - radius);
          const lx = mx + offx, lz = mz + offz;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
          const lgi = (lx + 2) + (lz + 2) * 20;
          const lh = H[lgi];
          if (lh <= WATER_LEVEL + 1 || lh > 146) continue;
          if ((data[idx(lx, lh, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, lh + 1, lz)] & 255) !== B.AIR) continue;
          data[idx(lx, lh + 1, lz)] = B.PUMPKIN;
        }
      }

      /* ---- wheat: dense billboards scattered across grassy plains/forest tops (big amount) ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 100 || h > 198 || DES[gi] || SNO[gi]) continue;                       // y100..200
          if (TREE[gi] >= 0.5) continue;                                                // plains only
          if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          if (hash3(cx * 91 + lx + 3300, 61, cz * 89 + lz + 3300) >= 0.0008) continue;  // ~0.08% (80% fewer)
          data[idx(lx, h + 1, lz)] = B.WHEAT;
        }

      /* ---- flint stones (0.732): dark nodules lying loose on the turf, 0.05% of grass columns.
         Runs BEFORE the plant scatter on purpose — the plants all require air above them, so
         claiming the cell first is what stops a 22% grass roll from swallowing a 0.05% one.
         Grass-only, which already rules out desert and beach; SNO rules out the snow biome. ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 99 || h > 198 || SNO[gi]) continue;
          if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          if (hash3(cx * 73 + lx + 8100, 43, cz * 67 + lz + 8100) >= 0.002) continue;    // 0.2%
          data[idx(lx, h + 1, lz)] = B.FLINT_ROCK;
        }

      /* ---- surface plants: short grass (small amount over all forest/plains, none in
         desert/snow) + poppy / blue orchid flowers (denser in plains/meadows) ---- */
      for (let lz = 0; lz < CZ; lz++)
        for (let lx = 0; lx < CX; lx++) {
          const gi = (lx + 2) + (lz + 2) * 20;
          const h = H[gi];
          if (h < 99 || h > 198 || DES[gi] || SNO[gi]) continue;                       // y100..200; none in desert/snow
          if ((data[idx(lx, h, lz)] & 255) !== B.GRASS) continue;
          if ((data[idx(lx, h + 1, lz)] & 255) !== B.AIR) continue;
          const isPlains = TREE[gi] < 0.5;
          // meadow = flower-rich sub-region of plains (own low-freq mask)
          const wx = cx * 16 + lx, wz = cz * 16 + lz;
          const meadow = isPlains && fbm(wx * 0.006 + 6006, wz * 0.006 - 3003, 2) > 0.32;
          const r = hash3(cx * 97 + lx + 5500, 71, cz * 83 + lz + 5500);
          // flowers cut ~95%: forest tiny, plains small, meadows the main place they gather
          const flowerCh = meadow ? 0.02 : isPlains ? 0.0015 : 0.0003;
          // short grass thins with altitude (full at y100, ~1/4 at y200) but never disappears
          const alt = Math.min(1, Math.max(0, (h - 100) / 100));
          const grassCh  = 0.22 * (1 - alt * 0.75);
          // two-block tall grass: a slice of the short-grass budget, plains-heavier, needs 2 air
          const tallCh   = (isPlains ? 0.05 : 0.015) * (1 - alt * 0.75);
          /* Berry bushes are scattered thinly and land in a RANDOM growth stage, so a fresh world
             already has some ripe and some bare — the regrow timer takes over from there. */
          const berryCh = (isPlains ? 0.0018 : 0.003) * (1 - alt * 0.75);
          if (r < flowerCh) {
            data[idx(lx, h + 1, lz)] = hash3(cx * 31 + lx + 12, 19, cz * 29 + lz + 7) < 0.5 ? B.POPPY : B.ORCHID;
          } else if (r < flowerCh + berryCh) {
            /* Stage and KIND are rolled from two independent hashes, so a fresh world already has
               sprouts, bare bushes and ripe ones of both bushes — the regrow timer takes over from
               there. The stage numbers are the growth order, so the roll is just 0..3. */
            const stage = Math.min(BERRY_STAGE.GROWN, (hash3(cx * 41 + lx + 909, 37, cz * 43 + lz + 606) * 4) | 0);
            const bush = hash3(cx * 53 + lx + 4242, 29, cz * 59 + lz + 2424) < 0.5
                       ? B.REDBERRY_BUSH : B.BLUEBERRY_BUSH;
            data[idx(lx, h + 1, lz)] = bush | (stage << 8);
          } else if (r < flowerCh + berryCh + tallCh && h + 2 < CY && (data[idx(lx, h + 2, lz)] & 255) === B.AIR) {
            data[idx(lx, h + 1, lz)] = B.TALL_LOWER;
            data[idx(lx, h + 2, lz)] = B.TALL_UPPER;
          } else if (r < flowerCh + berryCh + tallCh + grassCh) {
            data[idx(lx, h + 1, lz)] = B.TALLGRASS;
          }
        }

      /* ---- canyons: rare winding ravines. A low-freq region mask gates them (deserts get a
         much higher chance); inside a region, a ridge line |noise|≈0 cuts a V-shaped gorge up
         to ~32 deep. Normal-biome canyons are 50/50 filled with water (per 128-block cell);
         desert canyons are always dry. Runs after decoration so the cut clears trees/plants.
         Skipped in flat worlds — a 32-deep gorge would punch clean through the slab. */
      if (!FLAT)
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          const h = H[gi];
          if (h <= WATER_LEVEL || h > 141) continue;             // skip oceans and high peaks
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const isDesert = DES[gi] === 1;
          const rg = fbm(wx * 0.0015 + 555, wz * 0.0015 - 333, 2);
          if (rg < (isDesert ? 0.10 : 0.30)) continue;           // region gate (deserts: far more)
          // canyon TYPE per 128-block region: 0 = crack (thin earth-crack, rare),
          // 1 = wide canyon (5-10+ across, flatter floor), 2 = long canyon (stretched along one axis)
          const rcx = Math.floor(wx / 128), rcz = Math.floor(wz / 128);
          const tr = hash2(rcx * 3 + 41, rcz * 5 - 17);
          const type = tr < 0.18 ? 0 : tr < 0.62 ? 1 : 2;
          let cn, lw, dMax;
          if (type === 0)      { cn = fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2); lw = 0.03; dMax = 30; }
          else if (type === 1) { cn = fbm(wx * 0.008 + 911, wz * 0.008 - 477, 2); lw = 0.12; dMax = 36; }
          else {                                                 // long: anisotropic noise stretches the line
            const flip = hash2(rcx * 7 + 3, rcz * 9 - 5) < 0.5;
            cn = flip ? fbm(wx * 0.0035 + 911, wz * 0.011 - 477, 2)
                      : fbm(wx * 0.011 + 911, wz * 0.0035 - 477, 2);
            lw = 0.07; dMax = 32;
          }
          if (Math.abs(cn) > lw) continue;                       // not on this region's canyon line
          const prof = 1 - Math.abs(cn) / lw;                    // 1 at centre -> 0 at rim
          const depth = Math.floor(Math.pow(prof, type === 1 ? 1.4 : 2) * dMax);   // wide: flatter floor
          if (depth < 4) continue;
          const floorY = Math.max(22, h - depth);
          const watered = !isDesert &&
            hash2(Math.floor(wx / 128) * 7 + 13, Math.floor(wz / 128) * 11 - 7) < 0.2;
          const wFill = 90;                                      // water surface inside wet canyons
          for (let y = Math.min(h + 8, 199); y >= floorY; y--) { // +8 clears trunks/leaves above the cut
            const i = idx(x, y, z);
            if ((data[i] & 255) === B.BEDROCK) break;
            data[i] = (watered && y <= wFill) ? B.WATER : B.AIR;
          }
        }

      /* ---- cactus: sparse 1-wide columns, 1-4 tall, on open desert / red-sand tops.
         Neighbouring terrain must not rise above the base so a fresh cactus never
         touches a block on its sides (matches the placement rule). ---- */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20;
          if (!DES[gi]) continue;
          const wx = cx * 16 + x, wz = cz * 16 + z;
          const chance = RED[gi] ? 0.0005 : 0.001;             // desert 0.1%, red sand 0.05%
          if (hash3(wx, 7777, wz) >= chance) continue;
          const h = H[gi];
          const top = data[idx(x, h, z)] & 255;
          if (top !== B.SAND && top !== B.RED_SAND) continue;
          if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          if (heightAt(wx + 1, wz) > h || heightAt(wx - 1, wz) > h ||
              heightAt(wx, wz + 1) > h || heightAt(wx, wz - 1) > h) continue;
          /* Saguaro: a tapering column with 0-2 arms. An arm is one horizontal cactus cell out
             from the trunk followed by a short vertical run, so it flares into the trunk exactly
             the way a tree branch does and reads as a raised hand. Arms are placed with the same
             cell writes as the trunk — the log mesher does the rest. */
          const cw = (w) => (w << 2);                          // variant bits 2-7 = width index
          const CAC_BASE = 26, CAC_TIP = 20;                   // 60 -> 48 units
          const n = 3 + ((hash3(wx, 8888, wz) * 4) | 0);       // 3..6 tall
          const putCac = (cx2, cy2, cz2, axis, w) => {
            if (cx2 < 0 || cx2 > 15 || cz2 < 0 || cz2 > 15 || cy2 < 2 || cy2 > 198) return;
            const i2 = idx(cx2, cy2, cz2);
            if ((data[i2] & 255) !== B.AIR) return;
            data[i2] = B.CACTUS | ((axis | cw(w)) << 8);
          };
          for (let k = 1; k <= n && h + k < 199; k++) {
            const t = (k - 1) / Math.max(1, n - 1);
            putCac(x, h + k, z, 0, Math.round(CAC_BASE - (CAC_BASE - CAC_TIP) * t));
          }
          /* Arms leave the trunk high up — near the crown, and often above it once their vertical
             run is added, which is what gives a saguaro its raised-hands silhouette. Branching
             from halfway down made them read as a shrub. */
          const FLOWER_CHANCE = 0.05;
          const capFlower = (fx, fy, fz, salt) => {
            if (fy >= 199 || (data[idx(fx, fy, fz)] & 255) !== B.AIR) return;
            if (fx < 0 || fx > 15 || fz < 0 || fz > 15) return;
            if (hash3(wx + salt, 3141 + salt, wz - salt) >= FLOWER_CHANCE) return;
            data[idx(fx, fy, fz)] = B.PINCUSHION;
          };
          const armCount = (hash3(wx + 5, 9999, wz + 5) * 2.4) | 0;    // 0..2
          const ARM_DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (let a = 0; a < armCount && n >= 4; a++) {
            const d = ARM_DIR[(hash3(wx + a * 7, 1234 + a, wz - a * 11) * 4) | 0];
            /* The elbow must sit BESIDE trunk, never level with the crown or above it — an arm
               that starts at the top reads as a second cactus balanced on the first rather than
               a limb. Clamping it one cell below the crown keeps it flanked by trunk; the 1-2
               cell vertical run afterwards is what raises the hand to crown height and past it. */
            const lo = h + Math.max(2, n - 3);
            const ay = Math.min(h + n - 1, lo + ((hash3(wx - a * 3, 4321 + a, wz + a * 13) * 3) | 0));
            const armAxis = d[0] ? 1 : 2;
            const ax2 = x + d[0], az2 = z + d[1];
            putCac(ax2, ay, az2, armAxis, 18);                         // 44 units, thinner than trunk
            const up = 1 + ((hash3(wx + a * 17, 555 + a, wz + a * 19) * 2) | 0);   // rises 1..2
            for (let u = 1; u <= up; u++) putCac(ax2, ay + u, az2, 0, 18);
            capFlower(ax2, ay + up + 1, az2, 17 + a * 31);             // flower on the raised hand
          }
          capFlower(x, h + n + 1, z, 3);                               // ...and on the trunk's crown
        }

      /* ---- sugar cane: ground column must be exactly one block above water level so the sand
         base sits at the shoreline and a side neighbour is water. Cane base ends up at y=h+1
         with water at y=WATER_LEVEL directly beside the sand base — the classic beach look. ---- */
      for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
        const gi = (x + 2) + (z + 2) * 20;
        const h = H[gi];
        if (h !== WATER_LEVEL + 1) continue;                            // must be exactly at shore
        const top = data[idx(x, h, z)] & 255;
        if (top !== B.SAND && top !== B.GRASS && top !== B.DIRT && top !== B.RED_SAND) continue;
        if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
        // water adjacent at exactly y = WATER_LEVEL (shoreline)
        let waterAdj = false;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nx > 15 || nz < 0 || nz > 15) continue;
          if ((data[idx(nx, WATER_LEVEL, nz)] & 255) === B.WATER) { waterAdj = true; break; }
        }
        if (!waterAdj) continue;
        const isBeach = (top === B.SAND || top === B.RED_SAND);
        const chance = isBeach ? 0.85 : 0.25;
        const wx = cx * 16 + x, wz = cz * 16 + z;
        if (hash3(wx * 11 + 3301, 4242, wz * 13 + 5501) >= chance) continue;
        const tall = 1 + Math.floor(hash3(wx, 9191, wz) * 3);           // 1..3
        // Start cane at h (replacing the top sand) so the base cell sits at water-surface elevation
        // and the plant reads as growing from the shoreline instead of on a raised ledge.
        for (let k = 0; k < tall && h + k < 199; k++) data[idx(x, h + k, z)] = B.SUGAR_CANE;
      }

      /* ---- saplings: very sparse spawn on grass in tree-rich (forest) zones. Almost all oak;
         birch is a rare drop within an already-rare roll. ---- */
      for (let z = 0; z < CZ; z++) for (let x = 0; x < CX; x++) {
        const gi = (x + 2) + (z + 2) * 20;
        if (TREE[gi] < 0.35) continue;
        const h = H[gi];
        if (h <= WATER_LEVEL) continue;
        if ((data[idx(x, h, z)] & 255) !== B.GRASS) continue;
        if ((data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
        const wx = cx * 16 + x, wz = cz * 16 + z;
        const r = hash3(wx * 19 + 4401, 8181, wz * 23 + 4501);
        if (r >= 0.00001) continue;                                     // 0.001%
        // pick oak vs birch on a separate hash so a single-value bias can't force birch every time
        const birchRoll = hash3(wx * 29 + 5501, 4747, wz * 31 + 6601);
        data[idx(x, h + 1, z)] = birchRoll < 0.1 ? B.BIRCH_SAPLING : B.OAK_SAPLING;
      }

      /* ---- loose ground layers (0.786) ----
         Desert dunes: sand, or red sand on red sand, piled 1-7 layers deep in rolling patches with bare
         ground between them. Exposed gravel carries 1-4 loose layers on top, and very rarely a thin
         scatter of gravel (1-2 layers) lies on other open ground. The last pass, so it only ever takes
         cells nothing else wanted. */
      for (let z = 0; z < CZ; z++)
        for (let x = 0; x < CX; x++) {
          const gi = (x + 2) + (z + 2) * 20, h = H[gi];
          if (h <= WATER_LEVEL || h > 197 || (data[idx(x, h + 1, z)] & 255) !== B.AIR) continue;
          const top = data[idx(x, h, z)] & 255, wx = cx * 16 + x, wz = cz * 16 + z;
          if ((top === B.SAND || top === B.RED_SAND) && DES[gi]) {
            const dune = fbm(wx * 0.035 + 811.3, wz * 0.035 - 377.9, 2) + (hash2(wx * 13 + 71, wz * 7 - 19) - 0.5) * 0.06;
            const n = Math.min(7, Math.floor((dune - 0.08) * 16));
            if (n >= 1) data[idx(x, h + 1, z)] = layerVal(top, n);
          } else if (top === B.GRAVEL) {
            const r = hash3(wx * 31 + 9100, 4101, wz * 37 - 9100);
            if (r < 0.45) data[idx(x, h + 1, z)] = layerVal(B.GRAVEL, 1 + ((r / 0.45 * 4) | 0));
          } else if (top === B.GRASS || top === B.DIRT || top === B.STONE) {
            const r = hash3(wx * 41 + 9300, 4303, wz * 43 - 9300);
            if (r < 0.0015) data[idx(x, h + 1, z)] = layerVal(B.GRAVEL, r < 0.0005 ? 2 : 1);
          }
        }
      return data.buffer;
    }

    return { genChunk, heightAt, biomeAt };
  }

  /* ---------- greedy mesher ----------
     Six directional sweeps. For each slice a 2D mask stores the raw voxel value
     (ID + variant), so only faces with identical texture/variant merge. Corner tables per
     direction keep windings CCW-outward and side textures upright & unmirrored.            */

  // Does block `a` show a face toward neighbour `b`?
  function faceVisible(a, b, P) {
    if (a === 0) return false;
    if (b === 0) return true;
    const A = P[a & 255], Bp = P[b & 255];
    if (!Bp) return true;                     // an id this build does not know: treat it as open
    if (opaqueVal(b)) return false;           // hidden behind an opaque neighbour (a chiseled one is not, 0.783)
    if (A.opaque) return true;                // opaque against transparent -> visible
    if (Bp.shapes && ((b >> 8) & 255) && shapeOfVal(b)) return true;   // glass beside a glass slab still needs its face
    if ((a & 255) === (b & 255)) return false; // same type (incl. leaf|leaf): cull inner faces —
                                               // inside a bush only the outer shell renders, and
                                               // the cutout pass is double-sided so that shell
                                               // is visible from within (big-bush feeling)
    return true;                              // different transparents (water vs glass...)
  }

  //          dir:      +Y        -Y        +X        -X        +Z        -Z
  const DIR_FACE  = [    2,        3,        0,        1,        4,        5   ]; // faces[] index
  const DIR_SHADE = [   255,      140,      178,      178,      216,      216  ]; // baked light
  const mask = new Int32Array(16 * 200);      // reused across sweeps (max plane size)
  const maskL = new Uint8Array(16 * 200);     // parallel mask of per-face block-light level

  // layers (0.785): Map(cell index -> block ids bottom to top) for this chunk's mixed layer stacks, or null
  function meshChunk(dataBuf, sxnB, sxpB, sznB, szpB, lightBuf, lxnB, lxpB, lznB, lzpB, layers) {
    const data = new Uint32Array(dataBuf);
    const sxn = new Uint32Array(sxnB), sxp = new Uint32Array(sxpB);
    const szn = new Uint32Array(sznB), szp = new Uint32Array(szpB);
    const light = new Uint8Array(lightBuf);   // this chunk's block-light (flood-filled main-thread)
    const lxn = new Uint8Array(lxnB), lxp = new Uint8Array(lxpB);
    const lzn = new Uint8Array(lznB), lzp = new Uint8Array(lzpB);
    const P = PROPS;

    // neighbour-aware voxel read (y out of world: below = stone so bottom faces cull, above = air)
    function gb(x, y, z) {
      if (y < 0) return B.STONE;
      if (y > 199) return 0;
      if (x < 0)  return sxn[z + y * 16];
      if (x > 15) return sxp[z + y * 16];
      if (z < 0)  return szn[x + y * 16];
      if (z > 15) return szp[x + y * 16];
      return data[x + (z << 4) + (y << 8)];
    }
    // neighbour-aware light read (a face's light = light of the transparent cell it faces).
    // Byte is PACKED: low nibble = block light (glow), high nibble = sky light.
    function gl(x, y, z) {
      if (y > 199) return 0xF0;               // open sky above the world
      if (y < 0) return 0;
      if (x < 0)  return lxn[z + y * 16];
      if (x > 15) return lxp[z + y * 16];
      if (z < 0)  return lzn[x + y * 16];
      if (z > 15) return lzp[x + y * 16];
      return light[x + (z << 4) + (y << 8)];
    }

    // one growable buffer set per render pass
    const passes = [null, null, null, null].map(() => ({ pos: [], uv: [], tile: [], shade: [], lite: [], index: [], v: 0 }));
    let minY = 200, maxY = 0;

    function quad(pass, c0, c1, c2, c3, u0, u1, u2, u3, tile, shade, lite) {
      const g = passes[pass], base = g.v;
      g.pos.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], c3[0], c3[1], c3[2]);
      g.uv.push(u0[0], u0[1], u1[0], u1[1], u2[0], u2[1], u3[0], u3[1]);
      g.tile.push(tile, tile, tile, tile);
      g.shade.push(shade, shade, shade, shade);
      g.lite.push(lite, lite, lite, lite);
      g.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      g.v += 4;
      const lo = Math.min(c0[1], c2[1]), hi = Math.max(c0[1], c2[1]);
      if (lo < minY) minY = lo;
      if (hi > maxY) maxY = hi;
    }
    function quadV(pass, c0, c1, c2, c3, u0, u1, u2, u3, tile, s0, s1, s2, s3, lite) {
      const g = passes[pass], base = g.v;
      g.pos.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], c3[0], c3[1], c3[2]);
      g.uv.push(u0[0], u0[1], u1[0], u1[1], u2[0], u2[1], u3[0], u3[1]);
      g.tile.push(tile, tile, tile, tile);
      g.shade.push(s0, s1, s2, s3);
      g.lite.push(lite, lite, lite, lite);
      g.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      g.v += 4;
      const lo = Math.min(c0[1], c2[1]), hi = Math.max(c0[1], c2[1]);
      if (lo < minY) minY = lo;
      if (hi > maxY) maxY = hi;
    }

    // sweep config per direction: normal axis d, sign s, mask axes (ua=u, va=v), plane dims
    const CFG = [
      { d: 1, s: +1, ua: 0, va: 2, us: 16, vs: 16  },   // +Y
      { d: 1, s: -1, ua: 0, va: 2, us: 16, vs: 16  },   // -Y
      { d: 0, s: +1, ua: 2, va: 1, us: 16, vs: 200 },   // +X
      { d: 0, s: -1, ua: 2, va: 1, us: 16, vs: 200 },   // -X
      { d: 2, s: +1, ua: 0, va: 1, us: 16, vs: 200 },   // +Z
      { d: 2, s: -1, ua: 0, va: 1, us: 16, vs: 200 },   // -Z
    ];
    const dims = [16, 200, 16];
    const pos = [0, 0, 0], npos = [0, 0, 0];

    // highest non-air layer in this chunk — everything above is open sky with no faces, so the
    // sweeps (and the per-model loops below) skip it. Huge win now the world is tall: a flat
    // chunk tops out ~y66 and never scans the 130+ empty layers above.
    let topY = 0;
    for (let y = dims[1] - 1; y >= 0; y--) {
      const base = y << 8; let has = false;
      for (let i = 0; i < 256; i++) if (data[base + i] !== 0) { has = true; break; }
      if (has) { topY = y; break; }
    }
    const yCap = Math.min(dims[1], topY + 2);   // +1 layer of air above the top block keeps top faces

    for (let dir = 0; dir < 6; dir++) {
      const { d, s, ua, va, us, vs } = CFG[dir];
      const faceIdx = DIR_FACE[dir], shade = DIR_SHADE[dir];
      const nMax = d === 1 ? Math.min(dims[d], yCap) : dims[d];   // cap the vertical extent
      const vsE  = va === 1 ? Math.min(vs, yCap) : vs;

      for (let n = 0; n < nMax; n++) {
        // ---- build visibility mask for this slice ----
        let any = false;
        for (let v = 0; v < vsE; v++) {
          for (let u = 0; u < us; u++) {
            pos[d] = n; pos[ua] = u; pos[va] = v;
            const a = data[pos[0] + (pos[2] << 4) + (pos[1] << 8)];
            let m = 0, ml = 0;
            if (a !== 0 && P[a & 255] && P[a & 255].model === 'cube' && (a & 255) !== B.WATER && (a & 255) !== B.LAVA
                && !(((a >> 8) & 255) && P[a & 255].shapes && shapeOfVal(a))) {   // a chiseled cube emits with the models below (0.783)   // non-cube models emit separately; water/lava handled by emitWater/emitLava
              npos[0] = pos[0]; npos[1] = pos[1]; npos[2] = pos[2]; npos[d] += s;
              if (faceVisible(a, gb(npos[0], npos[1], npos[2]), P)) {
                m = a; any = true;
                ml = gl(npos[0], npos[1], npos[2]);   // face lit by the transparent cell it faces
                // a faint glow of its own (ores, 0.765), so it can be spotted in a pitch-black cave
                const sg = P[a & 255].selfGlow;
                if (sg && (ml & 15) < sg) ml = (ml & 0xF0) | sg;
              }
            }
            mask[u + v * us] = m;
            maskL[u + v * us] = ml;
          }
        }
        if (!any) continue;

        // ---- greedy rectangle expansion (faces merge only when tile AND light match) ----
        for (let v = 0; v < vsE; v++) {
          for (let u = 0; u < us;) {
            const val = mask[u + v * us], lv = maskL[u + v * us];
            if (!val) { u++; continue; }
            let w = 1;
            while (u + w < us && mask[u + w + v * us] === val && maskL[u + w + v * us] === lv) w++;
            let h = 1;
            outer: while (v + h < vsE) {
              for (let k = 0; k < w; k++)
                if (mask[u + k + (v + h) * us] !== val || maskL[u + k + (v + h) * us] !== lv) break outer;
              h++;
            }
            emit(dir, n, u, v, w, h, val, lv);
            for (let dv = 0; dv < h; dv++)
              for (let k = 0; k < w; k++) mask[u + k + (v + dv) * us] = 0;
            u += w;
          }
        }
      }

      function emit(dir, n, u0, v0, w, h, val, lv) {
        const id = val & 255, prop = PROPS[id];
        // MODEL dispatch — only 'cube' exists today; non-cube models (slabs, stairs,
        // torches, doors + rotation variants) would branch here with their own emitters.
        if (prop.model !== 'cube') return;
        let tile = prop.faces[faceIdx];
        const varb = (val >> 8) & 255;
        // grass "snowy" variant: snow-covered sides (top stays grass, bottom stays dirt).
        // driven by the variant byte, set wherever a snow block sits on grass.
        if (id === B.GRASS && varb === V.GRASS_SNOWY && faceIdx !== 2 && faceIdx !== 3)
          tile = T.GRASS_SNOW_SIDE;
        // TNT lit-blink variant: swap every face to the white snow tile for a visible flash pulse
        if (id === B.TNT && (varb & 1)) tile = T.TNT_LIT;
        // lying log: ring texture on the faces along the log's axis (1 = X, 2 = Z)
        if (id === B.LOG && varb)
          tile = (varb === 1 ? (faceIdx === 0 || faceIdx === 1) : (faceIdx === 4 || faceIdx === 5))
            ? T.LOG_TOP : T.LOG;
        // rot:'side' blocks: front tile sits on the variant's facing; lit furnace swaps it
        if (id === B.FURNACE) {
          const front = SIDE_FACE[varb & 3];
          tile = (faceIdx === 2 || faceIdx === 3) ? T.FURNACE_TOP
               : faceIdx === front ? ((varb & V.FURNACE_ON) ? T.FURNACE_FRONT_ON : T.FURNACE_FRONT)
               : T.FURNACE_SIDE;
        }
        if (id === B.CRAFTING_BENCH) {
          const front = SIDE_FACE[varb & 3];
          tile = faceIdx === 2 ? T.CRAFT_TOP : faceIdx === 3 ? T.PLANKS
               : faceIdx === front ? T.CRAFT_FRONT : T.CRAFT_SIDE;
        }
        const pass = prop.pass;
        let wc = n + (s > 0 ? 1 : 0);        // face plane coordinate along axis d
        // water surface sits slightly below the block top (classic look)
        if (dir === 0 && id === B.WATER) wc -= 0.12;
        const u1 = u0 + w, v1 = v0 + h;
        switch (dir) {
          case 0: quad(pass, [u0,wc,v0],[u0,wc,v1],[u1,wc,v1],[u1,wc,v0], [0,0],[0,h],[w,h],[w,0], tile, shade, lv); break;
          case 1: quad(pass, [u0,wc,v0],[u1,wc,v0],[u1,wc,v1],[u0,wc,v1], [0,0],[w,0],[w,h],[0,h], tile, shade, lv); break;
          case 2: quad(pass, [wc,v0,u0],[wc,v1,u0],[wc,v1,u1],[wc,v0,u1], [w,0],[w,h],[0,h],[0,0], tile, shade, lv); break;
          case 3: quad(pass, [wc,v0,u0],[wc,v0,u1],[wc,v1,u1],[wc,v1,u0], [0,0],[w,0],[w,h],[0,h], tile, shade, lv); break;
          case 4: quad(pass, [u0,v0,wc],[u1,v0,wc],[u1,v1,wc],[u0,v1,wc], [0,0],[w,0],[w,h],[0,h], tile, shade, lv); break;
          case 5: quad(pass, [u0,v0,wc],[u0,v1,wc],[u1,v1,wc],[u1,v0,wc], [w,0],[w,h],[0,h],[0,0], tile, shade, lv); break;
        }
      }
    }

    // ---- non-cube models (slab): emitted per-block with bespoke geometry ----
    // Chisel shapes (slab halves, stairs) come from shapeBoxesAt since 0.783; below, the older notes on
    // doubles). Each face's UVs come from the box extents so half faces sample the matching half
    // of the texture. Faces flush with the cell border cull against opaque neighbours.
    // f = 6-tile faces array [+X,-X,+Y(top),-Y(bottom),+Z,-Z] so slabs get real top/bottom textures
    /* `own` (wall plates, 0.7651): a face that sits INSIDE the cell reads the cell's own light, not the
       neighbour's. A glow vine's front face faces the cell beyond it, and in a one-block gap that cell
       is rock with no light of its own, so the vine rendered dark right beside its own glow. */
    // sw (0.7842): bitmask by face index (+X,-X,top,bottom,+Z,-Z) of faces whose texture turns a quarter,
    // so the bark of a lying hollow log runs along it instead of across
    function emitBoxFaces(x, y, z, b, f, own, sw = 0) {
      const x0 = x+b[0], y0 = y+b[1], z0 = z+b[2], x1 = x+b[3], y1 = y+b[4], z1 = z+b[5];
      const op = (xx, yy, zz) => opaqueVal(gb(xx, yy, zz));
      const L = own ? gl(x, y, z) : -1;
      const lit = (inner, xx, yy, zz) => (inner && L >= 0 ? L : gl(xx, yy, zz));
      const T4 = (k, a, c, d, e) => ((sw >> k) & 1) ? [[a[1],a[0]], [c[1],c[0]], [d[1],d[0]], [e[1],e[0]]] : [a, c, d, e];
      if (b[4] < 1 || !op(x, y+1, z))            // top
        quad(0, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],
             ...T4(2, [b[0],b[2]],[b[0],b[5]],[b[3],b[5]],[b[3],b[2]]), f[2], 255, lit(b[4] < 1, x, y+1, z));
      if (b[1] > 0 || !op(x, y-1, z))            // bottom
        quad(0, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],
             ...T4(3, [b[0],b[2]],[b[3],b[2]],[b[3],b[5]],[b[0],b[5]]), f[3], 140, lit(b[1] > 0, x, y-1, z));
      if (b[3] < 1 || !op(x+1, y, z))            // +X
        quad(0, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],
             ...T4(0, [1-b[2],b[1]],[1-b[2],b[4]],[1-b[5],b[4]],[1-b[5],b[1]]), f[0], 178, lit(b[3] < 1, x+1, y, z));
      if (b[0] > 0 || !op(x-1, y, z))            // -X
        quad(0, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],
             ...T4(1, [b[2],b[1]],[b[5],b[1]],[b[5],b[4]],[b[2],b[4]]), f[1], 178, lit(b[0] > 0, x-1, y, z));
      if (b[5] < 1 || !op(x, y, z+1))            // +Z
        quad(0, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
             ...T4(4, [b[0],b[1]],[b[3],b[1]],[b[3],b[4]],[b[0],b[4]]), f[4], 216, lit(b[5] < 1, x, y, z+1));
      if (b[2] > 0 || !op(x, y, z-1))            // -Z
        quad(0, [x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],
             ...T4(5, [1-b[0],b[1]],[1-b[0],b[4]],[1-b[3],b[4]],[1-b[3],b[1]]), f[5], 216, lit(b[2] > 0, x, y, z-1));
    }
    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)], vid = val & 255;
          if (!PROPS[vid]) continue;                           // an id this build does not know
          const lc = layerCount(val);                          // a layer stack (0.785)
          const shapeBoxes = lc ? null : shapeBoxesAt(gb, x, y, z, val);   // a chiseled slab or stairs (0.783)
          if (lc) {
            /* One box per RUN of the same block rather than one per layer: a 6-deep snow drift is one box,
               and only a real change of block costs another. A mixed stack reads its list; if that is
               missing it draws as its top block all the way down rather than not at all. */
            const ids = layerMixed(val) && layers ? layers.get(x + (z << 4) + (y << 8)) : null;
            const at = (i) => (ids && i < ids.length ? ids[i] : vid);
            for (let i = 0; i < lc;) {
              const b = at(i);
              let j = i + 1;
              while (j < lc && at(j) === b) j++;
              if (PROPS[b]) emitBoxFaces(x, y, z, [0, i / LAYER_MAX, 0, 1, j / LAYER_MAX, 1], PROPS[b].faces);
              i = j;
            }
          }
          else if (shapeBoxes)
            for (const bx of shapeBoxes) emitBoxFaces(x, y, z, bx, PROPS[vid].faces);
          else if (PROPS[vid].model === 'hollow')      // a hollow log (0.7842): bark shell and its filling, lit from inside
            for (const [bx, f, sw] of hollowParts(val)) emitBoxFaces(x, y, z, bx, f, true, sw);
          else if (PROPS[vid].model === 'carpet' || PROPS[vid].model === 'wall') {   // a wall plate is an upright carpet (0.765)
            const va = (val >> 8) & 255;
            const boxes = PROPS[vid].boxesByVar[va] || PROPS[vid].boxesByVar[0];
            const own = PROPS[vid].model === 'wall';     // lit by its own cell (0.7651)
            for (let bi = 0; bi < boxes.length; bi++)
              emitBoxFaces(x, y, z, boxes[bi], PROPS[vid].faces, own);
          }
          else if (PROPS[vid].model === 'voxel') {
            // a voxel model (0.77): every box in its own material, lit from its own cell like a wall plate
            // variant 1 leaves out the animated part, variant 2 is that part alone (0.772, the grinding pestle)
            const vp = PROPS[vid], va = (val >> 8) & 255;
            for (const bx of vp.voxBoxes) {
              if ((va === 1 && bx[6] === vp.animMat) || (va === 2 && bx[6] !== vp.animMat)) continue;
              emitBoxFaces(x, y, z, bx, vp.matFaces[bx[6]] || vp.faces, true);
            }
          }
        }

    // ---- non-cube: cross/billboard (plants) ----
    // Two diagonal quads, each emitted front + back (double-sided)
    /* Torch (0.7451): a real stick rather than a flat billboard, so it can LEAN on a wall. The
       stick is the torch texture's own 8-texel column (28..35) and its bottom 40 rows, so every
       side shows stick and flame — the same UV scheme emitBoxFaces uses, face for face. Variant
       0 stands upright; 1-4 hang on a wall and lean away from it (+X, -X, +Z, -Z). A wall torch
       is the floor stick slid against the wall, raised, and SHEARED outward along its height: a
       shear keeps every face planar, as a rotation would, for a fraction of the arithmetic. */
    const TORCH_DIRS = [null, [1, 0], [-1, 0], [0, 1], [0, -1]];
    const TORCH_LEAN = 0.41;                       // tan(~22 degrees): the classic wall-torch lean
    // how far a wall torch's foot slides toward its wall: the stick's centre on the wall plane, half of it buried (0.7531)
    const TORCH_WALL = 0.5;
    const TORCH_BOX = [28 / 64, 0, 28 / 64, 36 / 64, 40 / 64, 36 / 64];
    function emitTorch(x, y, z, varb) {
      const d = TORCH_DIRS[varb & 7] || null;
      const nx = d ? d[0] : 0, nz = d ? d[1] : 0;
      const T3 = (px, py, pz) => {
        if (!d) return [px, py, pz];
        const ly = py - y;                         // height up the stick, 0..0.625
        return [px - nx * TORCH_WALL + nx * TORCH_LEAN * ly, py + 0.18, pz - nz * TORCH_WALL + nz * TORCH_LEAN * ly];
      };
      /* The cap samples the flame's top 2x2 (texture rows 6-7, v 0.5-0.625) and the foot the end of
         the stick (rows 14-15). Both used to take the box's own XZ footprint as UVs, which lands mid
         sprite: half flame, half brown stick across the top of every torch (0.7523). */
      const b = TORCH_BOX, tile = PROPS[B.TORCH].faces[0], lite = gl(x, y, z);
      const x0 = x+b[0], y0 = y+b[1], z0 = z+b[2], x1 = x+b[3], y1 = y+b[4], z1 = z+b[5];
      quad(1, T3(x0,y1,z0),T3(x0,y1,z1),T3(x1,y1,z1),T3(x1,y1,z0),
           [b[0],0.5],[b[0],0.625],[b[3],0.625],[b[3],0.5], tile, 255, lite);          // top
      quad(1, T3(x0,y0,z0),T3(x1,y0,z0),T3(x1,y0,z1),T3(x0,y0,z1),
           [b[0],0],[b[3],0],[b[3],0.125],[b[0],0.125], tile, 140, lite);          // bottom
      quad(1, T3(x1,y0,z0),T3(x1,y1,z0),T3(x1,y1,z1),T3(x1,y0,z1),
           [1-b[2],b[1]],[1-b[2],b[4]],[1-b[5],b[4]],[1-b[5],b[1]], tile, 178, lite);  // +X
      quad(1, T3(x0,y0,z0),T3(x0,y0,z1),T3(x0,y1,z1),T3(x0,y1,z0),
           [b[2],b[1]],[b[5],b[1]],[b[5],b[4]],[b[2],b[4]], tile, 178, lite);          // -X
      quad(1, T3(x0,y0,z1),T3(x1,y0,z1),T3(x1,y1,z1),T3(x0,y1,z1),
           [b[0],b[1]],[b[3],b[1]],[b[3],b[4]],[b[0],b[4]], tile, 216, lite);          // +Z
      quad(1, T3(x0,y0,z0),T3(x0,y1,z0),T3(x1,y1,z0),T3(x1,y0,z0),
           [1-b[0],b[1]],[1-b[0],b[4]],[1-b[3],b[4]],[1-b[3],b[1]], tile, 216, lite);  // -Z
    }
    function emitCross(x, y, z, blockId, varb) {
      // sulfur tip: variant 1 = flipped/down orientation, swap tile to the down-tip texture
      let tile = PROPS[blockId].faces[0];
      if (blockId === B.SULFUR_UP_TIP && (varb & 1)) tile = T.SULFUR_DOWN_TIP;
      // per-variant billboard texture (berry bush growth stages)
      const tv = PROPS[blockId].tilesByVar;
      if (tv && tv[varb] != null) tile = tv[varb];
      /* Lit by its OWN cell as well as the one above (0.7521). The cell above alone reads as 0
         wherever a plant grows under a ceiling, so a mushroom in a low tunnel took the darkness of
         the rock over it even beside a torch. Per nibble: sky and torchlight each take the brighter. */
      const la = gl(x, y + 1, z), lo = gl(x, y, z);
      const lite = (Math.max(la >> 4, lo >> 4) << 4) | Math.max(la & 15, lo & 15);
      const sh = 210;
      quad(1,[x,y,z+1],[x+1,y,z],[x+1,y+1,z],[x,y+1,z+1], [0,0],[1,0],[1,1],[0,1],tile,sh,lite);
      quad(1,[x,y+1,z+1],[x+1,y+1,z],[x+1,y,z],[x,y,z+1], [0,1],[1,1],[1,0],[0,0],tile,sh,lite);
      quad(1,[x+1,y,z+1],[x,y,z],[x,y+1,z],[x+1,y+1,z+1], [0,0],[1,0],[1,1],[0,1],tile,sh,lite);
      quad(1,[x+1,y+1,z+1],[x,y+1,z],[x,y,z],[x+1,y,z+1], [0,1],[1,1],[1,0],[0,0],tile,sh,lite);
    }
    for (let y = 1; y < Math.min(199, yCap); y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          const bid = val & 255;
          if (PROPS[bid] && PROPS[bid].model === 'cross') {
            if (bid === B.TORCH) emitTorch(x, y, z, (val >> 8) & 255);   // a stick, not a billboard
            else emitCross(x, y, z, bid, (val >> 8) & 255);
          }
        }

    // ---- non-cube: cactus — full-height column, side faces inset 1/16 (thin look) ----
    // cactus is drawn by the log pass below (model:'log'), so it needs no emitter of its own

    // ---- logs: inset column (like cactus) on the two axes perpendicular to the trunk axis;
    // reuses emitBoxFaces so end-cap faces still cull against opaque/same neighbours ----
    /* A log's box comes straight from its width index. Two joint problems have to be solved on
       top of that, both caused by neighbouring logs having DIFFERENT widths:

       1. A branch butts into the side of a trunk. The branch spans its whole cell along its own
          axis, so it reaches the shared boundary — but the trunk's wood starts inset from that
          boundary, leaving a hole. Fix: the trunk grows the face on that side out to the cell
          edge, but ONLY toward a log whose axis runs INTO it. Expanding toward any log at all
          would also weld two parallel trunks standing side by side into one slab.

       2. A wide cell sits above a narrow one (stump under trunk, or a cut notch). The narrow
          log's end cap must still be drawn or you see straight into the hollow; the wide one's
          cap is what would show through. Fix: cull an end cap only against a same-axis log at
          least as wide as this one. That is also what draws the ring where a trunk steps down. */
    /* `family` separates the two things that use the log model — wood and cactus — so a cactus
       standing beside a trunk never flares into it or culls its cap against it. Undefined means
       wood, so every existing log entry keeps working untouched. */
    const logAt = (nx, ny, nz, fam) => {
      const v = gb(nx, ny, nz);
      const p = P[v & 255];
      if (!p || p.model !== 'log') return null;
      if ((p.family || 'wood') !== fam) return null;
      return { axis: (v >> 8) & 3, w: logWidthOf((v >> 8) & 255) };
    };
    /* A neighbour running INTO this cell along `axis`, thick enough to be worth meeting. A twig
       narrower than LOG_JOIN_MIN just pokes out of the bark — flaring the whole trunk face to
       greet it made the trunk bulge for something a few units across. */
    const LOG_JOIN_MIN = 14;                              // 36 units
    const logInto = (nx, ny, nz, axis, fam) => {
      const n = logAt(nx, ny, nz, fam);
      return !!n && n.axis === axis && n.w >= LOG_JOIN_MIN;
    };
    function emitLog(x, y, z, val) {
      const id = val & 255, variant = (val >> 8) & 255, va = variant & 3;
      const fam = PROPS[id].family || 'wood';
      const pss = PROPS[id].pass;              // wood is opaque(0), cactus is cutout(1)
      const myW = logWidthOf(variant);
      const b = logCutBox(va, myW);
      let flared = false;                                 // did a branch pull a face out to the edge?
      if (va !== 1) {                                     // X faces are inset unless this IS an X log
        if (logInto(x - 1, y, z, 1, fam)) { b[0] = 0; flared = true; }
        if (logInto(x + 1, y, z, 1, fam)) { b[3] = 1; flared = true; }
      }
      if (va !== 0) {                                     // Y faces
        if (logInto(x, y - 1, z, 0, fam)) { b[1] = 0; flared = true; }
        if (logInto(x, y + 1, z, 0, fam)) { b[4] = 1; flared = true; }
      }
      if (va !== 2) {                                     // Z faces
        if (logInto(x, y, z - 1, 2, fam)) { b[2] = 0; flared = true; }
        if (logInto(x, y, z + 1, 2, fam)) { b[5] = 1; flared = true; }
      }
      const F = PROPS[id].faces, side = F[0], top = F[2];
      const rf = va === 1 ? [top, top, side, side, side, side]      // X-axis: caps on ±X
               : va === 2 ? [side, side, side, side, top, top]      // Z-axis: caps on ±Z
               :            [side, side, top, top, side, side];     // Y-axis: caps on ±Y
      const x0 = x+b[0], y0 = y+b[1], z0 = z+b[2], x1 = x+b[3], y1 = y+b[4], z1 = z+b[5];
      /* An end cap is culled only against a same-axis log at least as wide as this cell — the
         narrower of two stacked logs must keep its cap or you see into the hollow.

         `flared` overrides that. A cell that pulled a face out to meet a branch is wider than
         the width it has stored, so the neighbour above compares against a stale number, culls,
         and leaves the collar open at the top — the horizontal slit where a branch meets the
         trunk. A flared cell always draws both of its axis caps. */
      const capped = (nx, ny, nz) => {
        if (opaqueVal(gb(nx, ny, nz))) return true;
        if (flared) return false;
        const n = logAt(nx, ny, nz, fam);
        return !!n && n.axis === va && n.w >= myW;        // continuous trunk, no narrower than us
      };
      if (!(va === 0 && capped(x, y+1, z)))         // +Y
        quad(pss, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0], [b[0],b[2]],[b[0],b[5]],[b[3],b[5]],[b[3],b[2]], rf[2], 255, gl(x, y+1, z));
      if (!(va === 0 && capped(x, y-1, z)))         // -Y
        quad(pss, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], [b[0],b[2]],[b[3],b[2]],[b[3],b[5]],[b[0],b[5]], rf[3], 140, gl(x, y-1, z));
      if (!(va === 1 && capped(x+1, y, z)))         // +X
        quad(pss, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1], [1-b[2],b[1]],[1-b[2],b[4]],[1-b[5],b[4]],[1-b[5],b[1]], rf[0], 178, gl(x+1, y, z));
      if (!(va === 1 && capped(x-1, y, z)))         // -X
        quad(pss, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], [b[2],b[1]],[b[5],b[1]],[b[5],b[4]],[b[2],b[4]], rf[1], 178, gl(x-1, y, z));
      if (!(va === 2 && capped(x, y, z+1)))         // +Z
        quad(pss, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], [b[0],b[1]],[b[3],b[1]],[b[3],b[4]],[b[0],b[4]], rf[4], 216, gl(x, y, z+1));
      if (!(va === 2 && capped(x, y, z-1)))         // -Z
        quad(pss, [x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0], [1-b[0],b[1]],[1-b[0],b[4]],[1-b[3],b[4]],[1-b[3],b[1]], rf[5], 216, gl(x, y, z-1));
    }
    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          if (PROPS[val & 255].model === 'log') emitLog(x, y, z, val);
        }

    // ---- per-block water: level-based top height, no greedy merge ----
    // variant byte = level: 0 = source (full), 1-7 = flowing ((8-level)/8 height)
    function emitWater(x, y, z, val) {
      const level = (val >> 8) & 7;
      const frac  = (8 - level) / 9;          // source≈0.889, level7≈0.111
      const x0 = x, x1 = x + 1, y0 = y, z0 = z, z1 = z + 1;
      const tile = T.WATER;
      /* Water light needs two corrections that plain neighbour-sampling gets wrong.

         SIDE faces read the light of the cell they face. Against a shore that cell is sand —
         opaque, so its stored light is 0 — which made shallow water at the water's edge read
         almost black, exactly where it should be at its brightest. Taking the brighter of the
         neighbour and the water cell itself fixes it without affecting open water, where the
         neighbour is another water cell and already the brighter of the two.

         TOP faces read the AIR above the surface, which is open sky at 15 no matter how deep
         the water is — so a 40-block ocean lit identically to a puddle. The surface is now
         darkened by how much water sits UNDER it, which is what actually reads as depth. */
      const maxLite = (a, b) =>
        (Math.max(a >> 4, b >> 4) << 4) | Math.max(a & 15, b & 15);
      const DEPTH_MAX = 7;                    // past this the surface stops getting darker
      function topLite() {
        let d = 0;
        while (d < DEPTH_MAX && (gb(x, y - 1 - d, z) & 255) === B.WATER) d++;
        const above = gl(x, y + 1, z);
        // scale rather than subtract: at night the sky nibble is already low and a flat -7
        // would clamp every deep surface to pitch black
        const sky = Math.round((above >> 4) * (1 - 0.62 * (d / DEPTH_MAX)));
        return (sky << 4) | (above & 15);
      }
      /* A surface source uses topLite() for its whole ring — top quad and all four side quads —
         so the depth shading stays continuous around the waterline instead of the top face
         reading dark over deep water while the side faces beside it read bright. Submerged and
         flowing cells keep the neighbour-max value, which is what rescues shore water from the
         opaque sand's zero light. */
      const openTop = (gb(x, y + 1, z) & 255) !== B.WATER;
      const surfLite = (level === 0 && openTop) ? topLite() : null;
      const sideLite = (nx, ny, nz) =>
        surfLite !== null ? surfLite : maxLite(gl(nx, ny, nz), gl(x, y, z));
      // top: shade 255=source (waves), 240=flowing (no waves)
      if (openTop)
        quad(2, [x0,y+frac,z0],[x0,y+frac,z1],[x1,y+frac,z1],[x1,y+frac,z0], [0,0],[0,1],[1,1],[1,0], tile, level === 0 ? 255 : 240, surfLite !== null ? surfLite : topLite());
      // bottom: only if below is not water/opaque
      const belowId = gb(x, y - 1, z) & 255;
      if (belowId !== B.WATER && !(P[belowId] && P[belowId].opaque))
        quad(2, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], [0,0],[1,0],[1,1],[0,1], tile, 140, sideLite(x, y - 1, z));
      // shade 253 marks "waving surface vertex" → only source blocks wave; flowing stays static
      const topS = level === 0 ? 253 : 0;    // 0 = fall through to base shade below
      // +X: vertex order [BL,TL,TR,BR] → top=v1,v2
      const bxpRaw = gb(x + 1, y, z); const bxpId = bxpRaw & 255;
      if (bxpId !== B.WATER) {
        if (!(P[bxpId] && P[bxpId].opaque))
          quadV(2, [x1,y0,z0],[x1,y+frac,z0],[x1,y+frac,z1],[x1,y0,z1], [1,0],[1,frac],[0,frac],[0,0], tile, 178,topS||178,topS||178,178, sideLite(x + 1, y, z));
      } else { const nf = (8 - ((bxpRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(2, [x1,y+nf,z0],[x1,y+frac,z0],[x1,y+frac,z1],[x1,y+nf,z1], [1,nf],[1,frac],[0,frac],[0,nf], tile, 178,topS||178,topS||178,178, sideLite(x + 1, y, z));
      }
      // -X: vertex order [BL,BR,TR,TL] → top=v2,v3
      const bxnRaw = gb(x - 1, y, z); const bxnId = bxnRaw & 255;
      if (bxnId !== B.WATER) {
        if (!(P[bxnId] && P[bxnId].opaque))
          quadV(2, [x0,y0,z0],[x0,y0,z1],[x0,y+frac,z1],[x0,y+frac,z0], [0,0],[1,0],[1,frac],[0,frac], tile, 178,178,topS||178,topS||178, sideLite(x - 1, y, z));
      } else { const nf = (8 - ((bxnRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(2, [x0,y+nf,z0],[x0,y+nf,z1],[x0,y+frac,z1],[x0,y+frac,z0], [0,nf],[1,nf],[1,frac],[0,frac], tile, 178,178,topS||178,topS||178, sideLite(x - 1, y, z));
      }
      // +Z: vertex order [BL,BR,TR,TL] → top=v2,v3
      const bzpRaw = gb(x, y, z + 1); const bzpId = bzpRaw & 255;
      if (bzpId !== B.WATER) {
        if (!(P[bzpId] && P[bzpId].opaque))
          quadV(2, [x0,y0,z1],[x1,y0,z1],[x1,y+frac,z1],[x0,y+frac,z1], [0,0],[1,0],[1,frac],[0,frac], tile, 216,216,topS||216,topS||216, sideLite(x, y, z + 1));
      } else { const nf = (8 - ((bzpRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(2, [x0,y+nf,z1],[x1,y+nf,z1],[x1,y+frac,z1],[x0,y+frac,z1], [0,nf],[1,nf],[1,frac],[0,frac], tile, 216,216,topS||216,topS||216, sideLite(x, y, z + 1));
      }
      // -Z: vertex order [BL,TL,TR,BR] → top=v1,v2
      const bznRaw = gb(x, y, z - 1); const bznId = bznRaw & 255;
      if (bznId !== B.WATER) {
        if (!(P[bznId] && P[bznId].opaque))
          quadV(2, [x0,y0,z0],[x0,y+frac,z0],[x1,y+frac,z0],[x1,y0,z0], [1,0],[1,frac],[0,frac],[0,0], tile, 216,topS||216,topS||216,216, sideLite(x, y, z - 1));
      } else { const nf = (8 - ((bznRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(2, [x0,y+nf,z0],[x0,y+frac,z0],[x1,y+frac,z0],[x1,y+nf,z0], [1,nf],[1,frac],[0,frac],[0,nf], tile, 216,topS||216,topS||216,216, sideLite(x, y, z - 1));
      }
    }
    // ---- per-block lava: same as water (pass 3, opaque, slower waves) ----
    function emitLava(x, y, z, val) {
      const level = (val >> 8) & 7;
      const frac  = (8 - level) / 9;
      const x0 = x, x1 = x + 1, y0 = y, z0 = z, z1 = z + 1;
      const tile = T.LAVA;
      const lite = 255;   // emissive: always full brightness
      if ((gb(x, y + 1, z) & 255) !== B.LAVA)
        quad(3, [x0,y+frac,z0],[x0,y+frac,z1],[x1,y+frac,z1],[x1,y+frac,z0], [0,0],[0,1],[1,1],[1,0], tile, level === 0 ? 255 : 240, lite);
      const belowId = gb(x, y - 1, z) & 255;
      if (belowId !== B.LAVA && !(P[belowId] && P[belowId].opaque))
        quad(3, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], [0,0],[1,0],[1,1],[0,1], tile, 140, lite);
      const topS = level === 0 ? 253 : 0;
      const bxpRaw = gb(x + 1, y, z); const bxpId = bxpRaw & 255;
      if (bxpId !== B.LAVA) {
        if (!(P[bxpId] && P[bxpId].opaque))
          quadV(3, [x1,y0,z0],[x1,y+frac,z0],[x1,y+frac,z1],[x1,y0,z1], [1,0],[1,frac],[0,frac],[0,0], tile, 178,topS||178,topS||178,178, lite);
      } else { const nf = (8 - ((bxpRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(3, [x1,y+nf,z0],[x1,y+frac,z0],[x1,y+frac,z1],[x1,y+nf,z1], [1,nf],[1,frac],[0,frac],[0,nf], tile, 178,topS||178,topS||178,178, lite);
      }
      const bxnRaw = gb(x - 1, y, z); const bxnId = bxnRaw & 255;
      if (bxnId !== B.LAVA) {
        if (!(P[bxnId] && P[bxnId].opaque))
          quadV(3, [x0,y0,z0],[x0,y0,z1],[x0,y+frac,z1],[x0,y+frac,z0], [0,0],[1,0],[1,frac],[0,frac], tile, 178,178,topS||178,topS||178, lite);
      } else { const nf = (8 - ((bxnRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(3, [x0,y+nf,z0],[x0,y+nf,z1],[x0,y+frac,z1],[x0,y+frac,z0], [0,nf],[1,nf],[1,frac],[0,frac], tile, 178,178,topS||178,topS||178, lite);
      }
      const bzpRaw = gb(x, y, z + 1); const bzpId = bzpRaw & 255;
      if (bzpId !== B.LAVA) {
        if (!(P[bzpId] && P[bzpId].opaque))
          quadV(3, [x0,y0,z1],[x1,y0,z1],[x1,y+frac,z1],[x0,y+frac,z1], [0,0],[1,0],[1,frac],[0,frac], tile, 216,216,topS||216,topS||216, lite);
      } else { const nf = (8 - ((bzpRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(3, [x0,y+nf,z1],[x1,y+nf,z1],[x1,y+frac,z1],[x0,y+frac,z1], [0,nf],[1,nf],[1,frac],[0,nf], tile, 216,216,topS||216,topS||216, lite);
      }
      const bznRaw = gb(x, y, z - 1); const bznId = bznRaw & 255;
      if (bznId !== B.LAVA) {
        if (!(P[bznId] && P[bznId].opaque))
          quadV(3, [x0,y0,z0],[x0,y+frac,z0],[x1,y+frac,z0],[x1,y0,z0], [1,0],[1,frac],[0,frac],[0,0], tile, 216,topS||216,topS||216,216, lite);
      } else { const nf = (8 - ((bznRaw >> 8) & 7)) / 9;
        if (frac > nf + 0.01)
          quadV(3, [x0,y+nf,z0],[x0,y+frac,z0],[x1,y+frac,z0],[x1,y+nf,z0], [1,nf],[1,frac],[0,frac],[0,nf], tile, 216,topS||216,topS||216,216, lite);
      }
    }

    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          if ((val & 255) === B.WATER) emitWater(x, y, z, val);
          else if ((val & 255) === B.LAVA) emitLava(x, y, z, val);
        }

    // pack into typed arrays (transferable)
    const out = passes.map(g => g.v === 0 ? null : ({
      pos:   new Float32Array(g.pos),
      uv:    new Float32Array(g.uv),
      tile:  new Uint8Array(g.tile),
      shade: new Uint8Array(g.shade),
      lite:  new Uint8Array(g.lite),
      index: new Uint32Array(g.index),
    }));
    return { passes: out, minY: Math.min(minY, maxY), maxY: Math.max(maxY, 2) };
  }

  return { B, T, V, PROPS, SHAPE_SLAB, SHAPE_STAIRS, SHAPE_PANE, SHAPE_FENCE, SHAPE_COVER, SHAPE_WALL,
           SHAPE_MASK, ROT_MASK, shapeOfVal,
           HOLLOW_FILLS, opaqueVal, shapeBoxesAt, stairBoxesAt, makeGen, meshChunk, idx,
           logWidthOf, logWidthPx, LOG_W_MIN, LOG_W_MAX, LOG_W_NORMAL, LOG_W_BLOCK,
           SHAPE_LAYER, SHAPE_LAYER_MIX, LAYER_MAX, layerCount, layerMixed, layerVal, solidVal,
           BERRY_STAGE, berryStage, isBerryBush };
}

/* ---------- worker entry point (stringified into the blob together with VOXEL_CORE) ---------- */
function WORKER_MAIN() {
  let gen = null;
  self.onmessage = (e) => {
    const m = e.data;
    try {
      if (m.type === 'init') {
        gen = CORE.makeGen(m.seed, m.terrainType);
      } else if (m.type === 'gen') {
        const buf = gen.genChunk(m.cx, m.cz);
        self.postMessage({ type: 'gen', cx: m.cx, cz: m.cz, data: buf }, [buf]);
      } else if (m.type === 'mesh') {
        const r = CORE.meshChunk(m.data, m.sxn, m.sxp, m.szn, m.szp, m.light, m.lxn, m.lxp, m.lzn, m.lzp, m.layers);
        const transfers = [];
        for (const p of r.passes) if (p) transfers.push(p.pos.buffer, p.uv.buffer, p.tile.buffer, p.shade.buffer, p.lite.buffer, p.index.buffer);
        self.postMessage({ type: 'mesh', cx: m.cx, cz: m.cz, rev: m.rev, passes: r.passes, minY: r.minY, maxY: r.maxY }, transfers);
      }
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.stack || err) });
    }
  };
}

const CORE = VOXEL_CORE();
const { B, V, PROPS, SHAPE_SLAB, SHAPE_STAIRS, SHAPE_PANE, SHAPE_FENCE, SHAPE_COVER, SHAPE_WALL,
        SHAPE_MASK, ROT_MASK, HOLLOW_FILLS, logWidthOf, LOG_W_MIN, LOG_W_NORMAL } = CORE;
/* Slabs and stairs had ids of their own until 0.783 ([base, stairs?] per old id, 37 was the retired cactus
   slab). Saved edits, inventories and prefabs holding one are converted here into the shape variant of
   the full block. A double slab becomes the full block; a mixed double keeps its own half. */
const LEGACY_SHAPE = {
  12: [B.PLANKS, 0], 28: [B.PLANKS, 1], 29: [B.COBBLE, 0], 31: [B.BRICKS, 0], 32: [B.BRICKS, 1],
  35: [B.STONE_BRICK, 0], 36: [B.STONE, 0], 37: [0, 0], 38: [B.GLASS, 0],
  113: [B.STONE, 1], 114: [B.COBBLE, 1], 115: [B.BIRCH_PLANKS, 0], 116: [B.BIRCH_PLANKS, 1],
  117: [B.SPRUCE_PLANKS, 0], 118: [B.SPRUCE_PLANKS, 1], 119: [B.STONE_BRICK, 1], 120: [B.GLASS, 1],
  121: [B.SANDSTONE, 0], 122: [B.SANDSTONE, 1], 123: [B.RED_SANDSTONE, 0], 124: [B.RED_SANDSTONE, 1],
};
function migrateLegacyVal(v) {
  const m = typeof v === 'number' ? LEGACY_SHAPE[v & 255] : null;
  if (!m) return v;
  if (!m[0]) return 0;
  const va = (v >> 8) & 255;
  if (m[1]) return m[0] | ((SHAPE_STAIRS + (va & 7)) << 8);
  if (va < 6) return m[0] | ((SHAPE_SLAB + va) << 8);
  if (va < 16) return m[0];
  return m[0] | ((SHAPE_SLAB + ((va - 16) & 7)) << 8);
}
/* Carpets were blocks of their own until 0.785: 81 the mixed stack (3 bits a layer: 1 snow, 2 oak, 3 birch,
   4 spruce litter), 58/71/72/77 the older single ones (variant = layers - 1). Now they are layer stacks of
   the real block. Returns null for anything else, or [value, ids] — ids only for a stack that mixes. */
const _LEGACY_LAYER_MAT = [0, B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES];
const _LEGACY_LAYER_ID = { 58: B.SNOW, 71: B.LEAVES, 72: B.BIRCH_LEAVES, 77: B.SPRUCE_LEAVES };
function migrateLegacyLayers(v) {
  if (typeof v !== 'number') return null;
  const id = v & 255;
  if (_LEGACY_LAYER_ID[id]) return [CORE.layerVal(_LEGACY_LAYER_ID[id], ((v >> 8) & 255) + 1), null];
  if (id !== 81) return null;
  const ids = [];
  for (let i = 0; i < 8; i++) { const m = (v >>> (8 + i * 3)) & 7; if (!m) break; ids.push(_LEGACY_LAYER_MAT[m] || B.SNOW); }
  if (!ids.length) return [0, null];
  const mixed = ids.some(b => b !== ids[0]);
  return [CORE.layerVal(ids[ids.length - 1], ids.length, mixed), mixed ? ids : null];
}
// an old slab or stairs item in a slot: the full block it was made from (null for the cactus slab)
const legacyItemId = (id) => (typeof id === 'number' && id < 256 && LEGACY_SHAPE[id] ? (LEGACY_SHAPE[id][0] || null) : id);
const { SHAPE_LAYER, LAYER_MAX, BERRY_STAGE, berryStage, isBerryBush } = CORE;

// Items (IDs >= 256) — separate registry from blocks
const ITEM = { STICK: 256, COAL: 257, COAL_CHUNK: 258, RAW_IRON: 259, DIAMOND: 260, APPLE: 261,
               FLINT: 262, CLAY_BALL: 263, SNOWBALL: 264, BOWL: 265, MUSHROOM_STEW: 266, GLASS_SHARD: 267,
               IRON_INGOT: 268, IRON_NUGGET: 269, MELON_SLICE: 270,
               IRON_SHOVEL: 271, IRON_PICKAXE: 272, IRON_HATCHET: 273,
               FLINT_SHOVEL: 274, FLINT_PICKAXE: 275, FLINT_HATCHET: 276,
               STONE_SHOVEL: 277, STONE_PICKAXE: 278, STONE_HATCHET: 279,
               DIAMOND_SHOVEL: 280, DIAMOND_PICKAXE: 281, DIAMOND_HATCHET: 282,
               BUCKET: 283, WATER_BUCKET: 284, WHEAT: 285, PUMPKIN_PIE: 286,
               FLINT_HOE: 287, STONE_HOE: 288, IRON_HOE: 289, DIAMOND_HOE: 290,
               LAVA_BUCKET: 291, SULFUR: 292, CHARCOAL: 293, GUNPOWDER: 294, SUGAR_CANE: 295,
               SUGAR: 296, PAPER: 297, GOLDEN_PICKAXE: 298, GOLDEN_HATCHET: 299, GOLDEN_SHOVEL: 300,
               GOLDEN_HOE: 301, FLOUR: 302, BOOK: 303, RAW_COPPER: 304, COPPER_INGOT: 305, COPPER_NUGGET: 306,
               RAW_TIN: 307, TIN_INGOT: 308, TIN_NUGGET: 309, RAW_GOLD: 310, GOLD_INGOT: 311, GOLD_NUGGET: 312,
               GLOW_DUST: 313, BRICK: 314, GOLDEN_APPLE: 315, BREAD: 316, FLINT_SWORD: 317, STONE_SWORD: 318,
               IRON_SWORD: 319, GOLDEN_SWORD: 320, DIAMOND_SWORD: 321, STRING: 322, IRON_SHEARS: 323, FEATHER: 324,
               MUTTON: 325, COOKED_MUTTON: 326,
               LEATHER_HELMET: 327, LEATHER_CHESTPLATE: 328, LEATHER_LEGGINGS: 329, LEATHER_BOOTS: 330,
               IRON_HELMET: 331, IRON_CHESTPLATE: 332, IRON_LEGGINGS: 333, IRON_BOOTS: 334,
               GOLDEN_HELMET: 335, GOLDEN_CHESTPLATE: 336, GOLDEN_LEGGINGS: 337, GOLDEN_BOOTS: 338,
               DIAMOND_HELMET: 339, DIAMOND_CHESTPLATE: 340, DIAMOND_LEGGINGS: 341, DIAMOND_BOOTS: 342,
               IRON_GLOVES: 343, BELT: 344, BARK: 345, FIBER: 346, CLOTH: 347, BERRIES: 348,
               ROTTEN_FLESH: 349,
               LEATHER: 350, BEEF: 351, COOKED_BEEF: 352, SADDLE: 353, LEATHER_GLOVES: 354,
               // BERRIES (348) stays the RED berry so existing stashes keep their contents
               BLUE_BERRIES: 355,
               BOW: 356, ARROW: 357, BONE: 358, SHIELD: 359, BACKPACK: 360,
               COOKED_PUMPKIN_PIE: 361, GLOW_CRYSTAL: 362,
               EMERALD: 363, RUBY: 364, SAPPHIRE: 365,     // 0.766
               CHARCOAL_CHUNK: 366, MILK_BUCKET: 367,      // 0.767
               TOPAZ: 368,
               IRON_POWDER: 369, TIN_POWDER: 370, COPPER_POWDER: 371, GOLD_POWDER: 372,   // 0.773
               BRONZE_POWDER: 373, STEEL_POWDER: 374,
               // bronze (0.774): the tier between iron and diamond
               BRONZE_INGOT: 375, BRONZE_NUGGET: 376, BRONZE_SWORD: 377, BRONZE_SHOVEL: 378,
               BRONZE_PICKAXE: 379, BRONZE_HATCHET: 380, BRONZE_HOE: 381,
               ASHES: 382,     // 0.775
               CHISEL: 383,    // 0.78
               HAMMER: 384,    // 0.788
               // the pig (0.789) and what comes off one
               PORK: 385, COOKED_PORK: 386, FAT: 387 };                            // 0.769   // PUMPKIN_PIE (286) is the raw pie since 0.761
const ITEM_PROPS = {
  [ITEM.STICK]:         { name: 'Stick',         stack: 99, icon: 'stick', desc: 'Used as crafting ingredient or fuel for 0.25 smelt' },
  [ITEM.BARK]:          { name: 'Bark',          stack: 99, icon: 'bark', desc: 'Used as fuel for 0.75 smelt' },
  [ITEM.FLINT]:         { name: 'Flint',         stack: 99, icon: 'flint', desc: 'Used as crafting ingredient for flint tools' },
  // from glow vines, with any tool (0.765); five make a glowcrystal block
  [ITEM.GLOW_CRYSTAL]:  { name: 'Glow crystal',  stack: 99, icon: 'glow_crystals', desc: 'Used as crafting ingredient' },
  // gems (0.766): 1-2 from their ores with an iron pickaxe or better
  [ITEM.EMERALD]:       { name: 'Emerald',       stack: 99, icon: 'emerald',  desc: 'A rare gem from mountain rock' },
  [ITEM.RUBY]:          { name: 'Ruby',          stack: 99, icon: 'ruby',     desc: 'A rare gem from deep caves' },
  [ITEM.SAPPHIRE]:      { name: 'Sapphire',      stack: 99, icon: 'sapphire', desc: 'A rare gem found under the hills' },
  [ITEM.TOPAZ]:         { name: 'Topaz',         stack: 99, icon: 'topaz',    desc: 'A rare gem from the middle depths' },   // 0.769
  // metal powders (0.773): a mortar grinds one raw ore into two, and each smelts into an ingot
  [ITEM.IRON_POWDER]:   { name: 'Iron powder',   stack: 99, icon: 'iron_powder',   desc: 'Can be smelted in furnace into iron ingot' },
  [ITEM.TIN_POWDER]:    { name: 'Tin powder',    stack: 99, icon: 'tin_powder',    desc: 'Can be smelted in furnace into tin ingot' },
  [ITEM.COPPER_POWDER]: { name: 'Copper powder', stack: 99, icon: 'copper_powder', desc: 'Can be smelted in furnace into copper ingot' },
  [ITEM.GOLD_POWDER]:   { name: 'Gold powder',   stack: 99, icon: 'gold_powder',   desc: 'Can be smelted in furnace into gold ingot' },
  // not made or used by anything yet: reserved for bronze and steel (0.773)
  [ITEM.BRONZE_POWDER]: { name: 'Bronze powder', stack: 99, icon: 'bronze_powder', desc: 'Can be smelted in furnace into bronze ingot' },   // 0.774
  [ITEM.STEEL_POWDER]:  { name: 'Steel powder',  stack: 99, icon: 'steel_powder',  desc: 'Can be smelted in furnace into steel ingot' },
  // burnt fuel leaves ashes in the furnace's fourth slot (0.775)
  [ITEM.ASHES]:         { name: 'Ashes',         stack: 99, icon: 'ashes',         desc: 'Used as crafting ingredient, left in a furnace by burnt fuel' },
  // worn in the Others slot; picks a block shape from a radial (0.78, 43-chisel.js) — shaping itself comes later
  [ITEM.CHISEL]:        { name: 'Chisel',        stack: 1,  icon: 'chisel', equip: 'accessories', chisel: true, durability: 300,   // 200 until 0.7845
                          desc: 'Wear it in the Others slot.' },
  /* The hammer (0.788) replaced the chisel outright in 0.789: same radial, same one-point-per-block
     wear, 400 durability. The chisel keeps its entry below so worlds saved with one still load. */
  [ITEM.HAMMER]:        { name: 'Hammer',        stack: 1,  icon: 'hammer', equip: 'accessories', chisel: true, durability: 500,
                          desc: 'Wear it in the Others slot. Hold Q (hold B on a gamepad) to pick a block shape' },
  // bronze metal (0.774): copper and tin powder ground together, smelted into ingots
  [ITEM.BRONZE_INGOT]:  { name: 'Bronze ingot',  stack: 99, icon: 'bronze_ingot',  desc: 'Used as crafting ingredient' },
  [ITEM.BRONZE_NUGGET]: { name: 'Bronze nugget', stack: 99, icon: 'bronze_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.CLAY_BALL]:     { name: 'Clay ball',     stack: 99, icon: 'clay_ball', desc: 'Used as crafting ingredient' },
  [ITEM.BOWL]:          { name: 'Bowl',          stack: 30, icon: 'bowl', desc: 'Used to fill with some food' },
  [ITEM.GLASS_SHARD]:   { name: 'Glass shard',   stack: 99, icon: 'glass_shard', desc: 'Used as crafting ingredient' },
  [ITEM.SULFUR]:        { name: 'Sulfur',        stack: 99, icon: 'sulfur', desc: 'Used as crafting ingredient' },
  [ITEM.CHARCOAL]:      { name: 'Charcoal',      stack: 99, icon: 'charcoal', desc: 'Used as crafting ingredient' },
  [ITEM.GUNPOWDER]:     { name: 'Gunpowder',     stack: 99, icon: 'gunpowder', desc: 'Used as crafting ingredient' },
  [ITEM.SUGAR]:         { name: 'Sugar',         stack: 99, icon: 'sugar', desc: 'Used as crafting ingredient' },
  [ITEM.PAPER]:         { name: 'Paper',         stack: 99, icon: 'paper', desc: 'Used as crafting ingredient' },
  [ITEM.FLOUR]:         { name: 'Flour',         stack: 99, icon: 'flour', desc: 'Used as crafting ingredient' },
  [ITEM.BRICK]:         { name: 'Brick',         stack: 99, icon: 'brick', desc: 'Used as crafting ingredient' },
  [ITEM.GLOW_DUST]:     { name: 'Glow dust',     stack: 99, icon: 'glow_dust', desc: 'Used as crafting ingredient' },
  [ITEM.STRING]:        { name: 'String',        stack: 99, icon: 'string', desc: 'Used as crafting ingredient' },
  [ITEM.FEATHER]:       { name: 'Feather',       stack: 99, icon: 'feather', desc: 'Used as crafting ingredient' },
  [ITEM.FIBER]:         { name: 'Fiber',         stack: 99, icon: 'fiber', desc: 'Used as crafting ingredient' },
  [ITEM.CLOTH]:         { name: 'Cloth',         stack: 99, icon: 'cloth', desc: 'Used as crafting ingredient' },
  [ITEM.LEATHER]:       { name: 'Leather',       stack: 99, icon: 'leather', desc: 'Used as crafting ingredient' },
  [ITEM.BONE]:          { name: 'Bone',          stack: 99, icon: 'bone', desc: 'Used as crafting ingredient' },
  /* ---- ranged (0.735) ----
     A bow is not a `tool` and not a weapon you swing: `ranged` is the marker 38-ranged.js reads,
     and it names the family so a crossbow or a firearm can join later without touching anything
     here. `ammo` marks what a ranged weapon consumes; the damage lives on the AMMO, since which
     arrow you loose is what decides how hard it lands. */
  [ITEM.BOW]:           { name: 'Bow',           stack: 1,  icon: 'bow', ranged: 'bow', damage: 1, attackSpeed: 1.0, durability: 160,
                          desc: 'Hold right click to draw, release to loose an arrow' },
  [ITEM.ARROW]:         { name: 'Arrow',         stack: 99, icon: 'arrow', ammo: 'arrow', desc: 'Ammunition for bows' },
  // 0.745: worn in the OFFHAND equipment slot; `shield` is what 40-shield.js keys off
  [ITEM.SHIELD]:        { name: 'Shield',        stack: 1,  icon: 'shield', equip: 'offhand', shield: true, durability: 336,
                          desc: 'Equip in the offhand. Hold right click to raise it: stops attacks and arrows from the front' },
// ores
  [ITEM.COAL]:          { name: 'Coal',          stack: 99, icon: 'coal', desc: 'Used as fuel for 5 smelts' },
  [ITEM.COAL_CHUNK]:    { name: 'Coal chunk',    stack: 99, icon: 'coal_chunk', desc: 'Used as fuel for 1 smelt' },
  // 0.767: charcoal splits the same way coal does — 8 chunks to a charcoal, half a smelt each
  [ITEM.CHARCOAL_CHUNK]: { name: 'Charcoal chunk', stack: 99, icon: 'charcoal_chunk', desc: 'Used as fuel for 0.8 of a smelt' },
  [ITEM.RAW_IRON]:      { name: 'Raw iron',      stack: 99, icon: 'raw_iron', desc: 'Can be smelted in furnace into iron ingot' },
  [ITEM.IRON_INGOT]:    { name: 'Iron ingot',    stack: 99, icon: 'iron_ingot', desc: 'Used as crafting ingredient' },
  [ITEM.IRON_NUGGET]:   { name: 'Iron nugget',   stack: 99, icon: 'iron_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.RAW_COPPER]:    { name: 'Raw copper',    stack: 99, icon: 'raw_copper', desc: 'Can be smelted in furnace into copper ingot' },
  [ITEM.COPPER_INGOT]:  { name: 'Copper ingot',  stack: 99, icon: 'copper_ingot', desc: 'Used as crafting ingredient' },
  [ITEM.COPPER_NUGGET]: { name: 'Copper nugget', stack: 99, icon: 'copper_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.RAW_TIN]:       { name: 'Raw tin',       stack: 99, icon: 'raw_tin', desc: 'Can be smelted in furnace into tin ingot' },
  [ITEM.TIN_INGOT]:     { name: 'Tin ingot',     stack: 99, icon: 'tin_ingot', desc: 'Used as crafting ingredient' },
  [ITEM.TIN_NUGGET]:    { name: 'Tin nugget',    stack: 99, icon: 'tin_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.RAW_GOLD]:      { name: 'Raw gold',      stack: 99, icon: 'raw_gold', desc: 'Can be smelted in furnace into gold ingot' },
  [ITEM.GOLD_INGOT]:    { name: 'Gold ingot',    stack: 99, icon: 'gold_ingot', desc: 'Used as crafting ingredient' },
  [ITEM.GOLD_NUGGET]:   { name: 'Gold nugget',   stack: 99, icon: 'gold_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.DIAMOND]:       { name: 'Diamond',       stack: 99, icon: 'diamond', desc: 'Used as crafting ingredient' },
  // tools: stack 1, own durability (breaks at 0), toolSpeed = mining-time divisor on matching
  // blocks. tier: 0 = bare hand, 1 wooden, 2 stone, 3 iron, 4 steel, 5 diamond — gates drops (MINE_REQ).
  [ITEM.FLINT_SWORD]:   { name: 'Flint sword',    stack: 1, icon: 'flint_sword',   tool: 'sword',   tier: 1, toolSpeed: 1,    damage: 4,   attackSpeed: 1.8,   durability: 20, desc: '' },
  [ITEM.FLINT_SHOVEL]:  { name: 'Flint shovel',   stack: 1, icon: 'flint_shovel',  tool: 'shovel',  tier: 1, toolSpeed: 2,    damage: 2,   attackSpeed: 1.0,   durability: 40, desc: '' },
  [ITEM.FLINT_PICKAXE]: { name: 'Flint pickaxe',  stack: 1, icon: 'flint_pickaxe', tool: 'pick',    tier: 1, toolSpeed: 2,    damage: 3,   attackSpeed: 1.0,   durability: 40, desc: '' },
  [ITEM.FLINT_HATCHET]: { name: 'Flint hatchet',  stack: 1, icon: 'flint_hatchet', tool: 'hatchet', tier: 1, toolSpeed: 2,    damage: 5,   attackSpeed: 0.8,   durability: 40, desc: '' },
  [ITEM.FLINT_HOE]:     { name: 'Flint hoe',      stack: 1, icon: 'flint_hoe',     tool: 'hoe',     tier: 1, toolSpeed: 2,    damage: 3,   attackSpeed: 1.2,   durability: 30, desc: '' },
  [ITEM.STONE_SWORD]:    { name: 'Stone sword',     stack: 1, icon: 'stone_sword',    tool: 'sword',   tier: 2, toolSpeed: 2,    damage: 5,   attackSpeed: 1.7,   durability: 50, desc: '' },
  [ITEM.STONE_SHOVEL]:   { name: 'Stone shovel',    stack: 1, icon: 'stone_shovel',   tool: 'shovel',  tier: 2, toolSpeed: 4,    damage: 3,   attackSpeed: 0.8,   durability: 100, desc: '' },
  [ITEM.STONE_PICKAXE]:  { name: 'Stone pickaxe',   stack: 1, icon: 'stone_pickaxe',  tool: 'pick',    tier: 2, toolSpeed: 4,    damage: 4,   attackSpeed: 0.8,   durability: 100, desc: '' },
  [ITEM.STONE_HATCHET]:  { name: 'Stone hatchet',   stack: 1, icon: 'stone_hatchet',  tool: 'hatchet', tier: 2, toolSpeed: 4,    damage: 6,   attackSpeed: 0.6,   durability: 100, desc: '' },
  [ITEM.STONE_HOE]:      { name: 'Stone hoe',       stack: 1, icon: 'stone_hoe',      tool: 'hoe',     tier: 2, toolSpeed: 4,    damage: 4,   attackSpeed: 1.1,   durability: 80, desc: '' },
  [ITEM.IRON_SHEARS]:    { name: 'Iron shears',     stack: 1, icon: 'iron_shears',    tool: 'shears',  tier: 3, toolSpeed: 6,    damage: 3,   attackSpeed: 1.2,   durability: 150, desc: '' },
  [ITEM.IRON_SWORD]:     { name: 'Iron sword',      stack: 1, icon: 'iron_sword',     tool: 'sword',   tier: 3, toolSpeed: 3,    damage: 6,   attackSpeed: 1.9,   durability: 150, desc: '' },
  [ITEM.IRON_SHOVEL]:    { name: 'Iron shovel',     stack: 1, icon: 'iron_shovel',    tool: 'shovel',  tier: 3, toolSpeed: 6,    damage: 4,   attackSpeed: 1.1,   durability: 300, desc: '' },
  [ITEM.IRON_PICKAXE]:   { name: 'Iron pickaxe',    stack: 1, icon: 'iron_pickaxe',   tool: 'pick',    tier: 3, toolSpeed: 6,    damage: 5,   attackSpeed: 1.1,   durability: 300, desc: '' },
  [ITEM.IRON_HATCHET]:   { name: 'Iron hatchet',    stack: 1, icon: 'iron_hatchet',   tool: 'hatchet', tier: 3, toolSpeed: 6,    damage: 7,   attackSpeed: 0.8,   durability: 300, desc: '' },
  [ITEM.IRON_HOE]:       { name: 'Iron hoe',        stack: 1, icon: 'iron_hoe',       tool: 'hoe',     tier: 3, toolSpeed: 6,    damage: 5,   attackSpeed: 1.2,   durability: 200, desc: '' },
  [ITEM.GOLDEN_SWORD]:   { name: 'Golden sword',    stack: 1, icon: 'golden_sword',   tool: 'sword',   tier: 3, toolSpeed: 8,    damage: 5,   attackSpeed: 2.8,   durability: 30, desc: '' },
  [ITEM.GOLDEN_SHOVEL]:  { name: 'Golden shovel',   stack: 1, icon: 'golden_shovel',  tool: 'shovel',  tier: 3, toolSpeed: 14,   damage: 3,   attackSpeed: 1.6,   durability: 60, desc: '' },
  [ITEM.GOLDEN_PICKAXE]: { name: 'Golden pickaxe',  stack: 1, icon: 'golden_pickaxe', tool: 'pick',    tier: 3, toolSpeed: 14,   damage: 4,   attackSpeed: 1.6,   durability: 60, desc: '' },
  [ITEM.GOLDEN_HATCHET]: { name: 'Golden hatchet',  stack: 1, icon: 'golden_hatchet', tool: 'hatchet', tier: 3, toolSpeed: 14,   damage: 5,   attackSpeed: 1.4,   durability: 60, desc: '' },
  [ITEM.GOLDEN_HOE]:     { name: 'Golden hoe',      stack: 1, icon: 'golden_hoe',     tool: 'hoe',     tier: 3, toolSpeed: 14,   damage: 3,   attackSpeed: 2.4,   durability: 45, desc: '' },
  // bronze tools (0.774): tier 4, halfway between iron and diamond in every stat; the gem ores need one
  [ITEM.BRONZE_SWORD]:   { name: 'Bronze sword',    stack: 1, icon: 'bronze_sword',   tool: 'sword',   tier: 4, toolSpeed: 4,    damage: 6.5, attackSpeed: 1.95,  durability: 300, desc: '' },
  [ITEM.BRONZE_SHOVEL]:  { name: 'Bronze shovel',   stack: 1, icon: 'bronze_shovel',  tool: 'shovel',  tier: 4, toolSpeed: 8,    damage: 3,   attackSpeed: 1.15,  durability: 600, desc: '' },
  [ITEM.BRONZE_PICKAXE]: { name: 'Bronze pickaxe',  stack: 1, icon: 'bronze_pickaxe', tool: 'pick',    tier: 4, toolSpeed: 8,    damage: 3.5, attackSpeed: 1.15,  durability: 600, desc: '' },
  [ITEM.BRONZE_HATCHET]: { name: 'Bronze hatchet',  stack: 1, icon: 'bronze_hatchet', tool: 'hatchet', tier: 4, toolSpeed: 8,    damage: 7.5, attackSpeed: 0.85,  durability: 600, desc: '' },
  [ITEM.BRONZE_HOE]:     { name: 'Bronze hoe',      stack: 1, icon: 'bronze_hoe',     tool: 'hoe',     tier: 4, toolSpeed: 8,    damage: 3.5, attackSpeed: 1.25,  durability: 450, desc: '' },
  [ITEM.DIAMOND_SWORD]:  { name: 'Diamond sword',   stack: 1, icon: 'diamond_sword',  tool: 'sword',   tier: 5, toolSpeed: 5,    damage: 7,   attackSpeed: 2.0,   durability: 500, desc: '' },
  [ITEM.DIAMOND_SHOVEL]: { name: 'Diamond shovel',  stack: 1, icon: 'diamond_shovel', tool: 'shovel',  tier: 5, toolSpeed: 10,   damage: 2,   attackSpeed: 1.2,   durability: 1000, desc: '' },
  [ITEM.DIAMOND_PICKAXE]:{ name: 'Diamond pickaxe', stack: 1, icon: 'diamond_pickaxe',tool: 'pick',    tier: 5, toolSpeed: 10,   damage: 2,   attackSpeed: 1.2,   durability: 1000, desc: '' },
  [ITEM.DIAMOND_HATCHET]:{ name: 'Diamond hatchet', stack: 1, icon: 'diamond_hatchet',tool: 'hatchet', tier: 5, toolSpeed: 10,   damage: 8,   attackSpeed: 0.9,   durability: 1000, desc: '' },
  [ITEM.DIAMOND_HOE]:    { name: 'Diamond hoe',     stack: 1, icon: 'diamond_hoe',    tool: 'hoe',     tier: 5, toolSpeed: 10,   damage: 2,   attackSpeed: 1.3,   durability: 750, desc: '' },
// Useable
  [ITEM.BUCKET]:        { name: 'Bucket',        stack: 20, icon: 'bucket', desc: 'Used to fill with fluid, even with cow\'s milk (female cow)' },
  // 0.767: from a cow (bucket in hand, right-click). Drinking it clears every running effect and hands the bucket back
  [ITEM.MILK_BUCKET]:   { name: 'Milk bucket',   stack: 1, icon: 'milk_bucket', food: 4, foodSat: 6, foodSatFull: 3,
                          eatTime: 1.6, drink: true, foodClearEffects: true, foodReturn: 283, spoil: 300, desc: 'Drink it to remove all active effects' },
  [ITEM.WATER_BUCKET]:  { name: 'Water Bucket',  stack: 1,  icon: 'water_bucket', desc: '' },
  [ITEM.LAVA_BUCKET]:   { name: 'Lava Bucket',   stack: 1,  icon: 'lava_bucket', desc: '' },
  [ITEM.SNOWBALL]:      { name: 'Snowball',      stack: 30, icon: 'snowball', throwable: true, desc: 'Can be thrown to knock back friends or enemies' },
  // craftable, but nothing rides yet — it is gear waiting for a mount
  [ITEM.SADDLE]:        { name: 'Saddle',        stack: 1,  icon: 'saddle', desc: 'Use it on a tamed animal to ride it' },
 //plants
  [ITEM.SUGAR_CANE]:    { name: 'Sugar cane',    stack: 99, icon: 'sugarcane', desc: 'Can be turned into sugar in a mortar' },
  [ITEM.WHEAT]:         { name: 'Wheat',         stack: 99, icon: 'wheat', desc: 'Can be turned into flour in a mortar' },
// Consumables
  [ITEM.APPLE]:         { name: 'Apple',          stack: 99, icon: 'apple',         foodSatFull: 3, food: 5,  foodSat: 8,  eatTime: 1.5, spoil: 1800, desc: '' },
  [ITEM.MELON_SLICE]:   { name: 'Melon slice',    stack: 40, icon: 'melon_slice',   foodSatFull: 1, food: 1,  foodSat: 2,  eatTime: 0.7, spoil: 1200, desc: '' },
  // two colours, identical to eat — which bush you found is flavour, not a stat choice
  [ITEM.BERRIES]:       { name: 'Red berries',    stack: 60, icon: 'redberries',    foodSatFull: 0, food: 1,  foodSat: 1,  eatTime: 0.5, spoil: 600, desc: '' },
  [ITEM.BLUE_BERRIES]:  { name: 'Blue berries',   stack: 60, icon: 'blueberries',   foodSatFull: 0, food: 1,  foodSat: 1,  eatTime: 0.5, spoil: 600, desc: '' },
  // 0.761: the crafted pie is RAW now (same id, so saves keep it) and a furnace bakes it
  [ITEM.PUMPKIN_PIE]:   { name: 'Raw pumpkin pie', stack: 10, icon: 'pumpkin_pie',  foodSatFull: 3, food: 6,  foodSat: 6,  eatTime: 4, foodEffect: 'nausea', foodEffectChance: 0.5, spoil: 3600, desc: '' },
  [ITEM.COOKED_PUMPKIN_PIE]: { name: 'Pumpkin pie', stack: 10, icon: 'cooked_pumpkin_pie', foodSatFull: 7, food: 12, foodSat: 14, eatTime: 4, foodHeal: 3, foodEffect: 'spicyPumpkin', spoil: 7200, desc: '' },
  [ITEM.MUSHROOM_STEW]: { name: 'Mushroom stew',  stack: 20, icon: 'mushroom_stew', foodSatFull: 5, food: 9,  foodSat: 12, eatTime: 2.5, foodReturn: 265, foodHeal: 1, spoil: 3600, desc: '' },
  [ITEM.BREAD]:         { name: 'Bread',          stack: 99, icon: 'bread',         foodSatFull: 4, food: 6,  foodSat: 8,  eatTime: 1.7, spoil: 14400, desc: '' },
  [ITEM.GOLDEN_APPLE]:  { name: 'Golden apple',   stack: 30, icon: 'golden_apple',  foodSatFull: 8, food: 5,  foodSat: 15,  eatTime: 2.0, foodHeal: 2, foodEffect: 'rapidRegen', desc: '' },
  [ITEM.MUTTON]:        { name: 'Mutton',         stack: 99, icon: 'mutton',        foodSatFull: 1, food: 2,  foodSat: 3,  eatTime: 1.8, foodEffect: 'nausea', foodEffectChance: 0.5, spoil: 1800, desc: '' },
  [ITEM.COOKED_MUTTON]: { name: 'Cooked mutton',  stack: 99, icon: 'cooked_mutton', foodSatFull: 4, food: 6,  foodSat: 7,  eatTime: 2.0, spoil: 14400, desc: '' },
  // beef is the best meat in the game once cooked, which is what makes hunting cows worth it
  [ITEM.BEEF]:          { name: 'Raw beef',       stack: 99, icon: 'beef',          foodSatFull: 1, food: 3,  foodSat: 4,  eatTime: 1.9, foodEffect: 'nausea', foodEffectChance: 0.5, spoil: 2000, desc: '' },
  [ITEM.COOKED_BEEF]:   { name: 'Steak',          stack: 99, icon: 'cooked_beef',   foodSatFull: 5, food: 8,  foodSat: 10, eatTime: 2.2, spoil: 28800, desc: '' },
  [ITEM.ROTTEN_FLESH]:  { name: 'Rotten flesh',   stack: 99, icon: 'rotten_flesh',  foodSatFull: 0, food: 2,  foodSat: 0,  eatTime: 1.3, foodEffect: 'nausea', foodEffectChance: 0.9, spoil: 7200, desc: 'Edible, but barely' },
  // pork (0.789): a shade under beef cooked, and it spoils faster than any other meat raw
  [ITEM.PORK]:          { name: 'Raw pork',       stack: 99, icon: 'pork',          foodSatFull: 1, food: 3,  foodSat: 4,  eatTime: 1.9, foodEffect: 'nausea', foodEffectChance: 0.6, spoil: 2600, desc: '' },
  [ITEM.COOKED_PORK]:   { name: 'Cooked pork',    stack: 99, icon: 'cooked_pork',   foodSatFull: 4, food: 7,  foodSat: 9,  eatTime: 2.1, spoil: 22400, desc: '' },
  // rendered off a pig. Not food — it is fuel and a crafting ingredient, so it never spoils
  [ITEM.FAT]:           { name: 'Fat',            stack: 99, icon: 'fat',           desc: 'Burns well for 1.5 smelt. Used as crafting ingredient' },
// Armor. `equip` names the equipment slot the piece goes into; `armor` is its point value.
// 20 armor points = a full 10-icon bar. `armorMat` picks both the armor-bar sprite theme and the
// overlay sheet on the preview (<mat>_tophalf.png / <mat>_downhalf.png).
// Optional stat modifiers, all additive across worn pieces:
//   moveSpeed   fraction of walk speed, e.g. -0.025 = the 2.5% slow each iron plate costs
//   strength    flat bonus damage added to whatever the held weapon deals
//   atkSpeed    fraction added to the attack-speed multiplier
  /* Leather is the insulating tier: every piece traps heat, which is 8% cold resistance and a 5%
     heat PENALTY each. The boots are the one piece that helps you move (+0.5%). */
  [ITEM.LEATHER_HELMET]:     { name: 'Leather cap',        stack: 1, icon: 'leather_helmet',     equip: 'helmet',     armor: 1, tier: 1, durability: 55,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, desc: '' },
  [ITEM.LEATHER_CHESTPLATE]: { name: 'Leather tunic',      stack: 1, icon: 'leather_chestplate', equip: 'chestplate', armor: 3, tier: 1, durability: 80,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, desc: '' },
  [ITEM.LEATHER_LEGGINGS]:   { name: 'Leather trousers',   stack: 1, icon: 'leather_leggings',   equip: 'leggings',   armor: 2, tier: 1, durability: 75,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, desc: '' },
  [ITEM.LEATHER_BOOTS]:      { name: 'Leather boots',      stack: 1, icon: 'leather_boots',      equip: 'boots',      armor: 1, tier: 1, durability: 65,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, moveSpeed: 0.005, desc: '' },
  [ITEM.LEATHER_GLOVES]:     { name: 'Leather gloves',     stack: 1, icon: 'leather_gloves',     equip: 'gloves',     armor: 1, tier: 1, durability: 50,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, strength: 0.25, desc: '' },
  [ITEM.IRON_HELMET]:        { name: 'Iron helmet',        stack: 1, icon: 'iron_helmet',        equip: 'helmet',     armor: 2, tier: 3, durability: 165, armorMat: 'iron',    moveSpeed: -0.01, desc: '' },
  [ITEM.IRON_CHESTPLATE]:    { name: 'Iron chestplate',    stack: 1, icon: 'iron_chestplate',    equip: 'chestplate', armor: 6, tier: 3, durability: 240, armorMat: 'iron',    moveSpeed: -0.03, desc: '' },
  [ITEM.IRON_LEGGINGS]:      { name: 'Iron leggings',      stack: 1, icon: 'iron_leggings',      equip: 'leggings',   armor: 5, tier: 3, durability: 225, armorMat: 'iron',    moveSpeed: -0.025, desc: '' },
  [ITEM.IRON_BOOTS]:         { name: 'Iron boots',         stack: 1, icon: 'iron_boots',         equip: 'boots',      armor: 2, tier: 3, durability: 195, armorMat: 'iron',    moveSpeed: -0.01, desc: '' },
  // gloves have no preview overlay sheet yet — the preview only draws the four body pieces
  [ITEM.IRON_GLOVES]:        { name: 'Iron gloves',        stack: 1, icon: 'iron_gloves',        equip: 'gloves',     armor: 1, tier: 3, durability: 150, armorMat: 'iron',    moveSpeed: -0.005, strength: 0.75, desc: '' },
  [ITEM.GOLDEN_HELMET]:      { name: 'Golden helmet',      stack: 1, icon: 'golden_helmet',      equip: 'helmet',     armor: 2, tier: 3, durability: 77,  armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_CHESTPLATE]:  { name: 'Golden chestplate',  stack: 1, icon: 'golden_chestplate',  equip: 'chestplate', armor: 5, tier: 3, durability: 112, armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_LEGGINGS]:    { name: 'Golden leggings',    stack: 1, icon: 'golden_leggings',    equip: 'leggings',   armor: 3, tier: 3, durability: 105, armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_BOOTS]:       { name: 'Golden boots',       stack: 1, icon: 'golden_boots',       equip: 'boots',      armor: 2, tier: 3, durability: 91,  armorMat: 'golden',  desc: '' },
  [ITEM.DIAMOND_HELMET]:     { name: 'Diamond helmet',     stack: 1, icon: 'diamond_helmet',     equip: 'helmet',     armor: 3, tier: 5, durability: 363, armorMat: 'diamond', desc: '' },
  [ITEM.DIAMOND_CHESTPLATE]: { name: 'Diamond chestplate', stack: 1, icon: 'diamond_chestplate', equip: 'chestplate', armor: 8, tier: 5, durability: 528, armorMat: 'diamond', desc: '' },
  [ITEM.DIAMOND_LEGGINGS]:   { name: 'Diamond leggings',   stack: 1, icon: 'diamond_leggings',   equip: 'leggings',   armor: 6, tier: 5, durability: 495, armorMat: 'diamond', desc: '' },
  [ITEM.DIAMOND_BOOTS]:      { name: 'Diamond boots',      stack: 1, icon: 'diamond_boots',      equip: 'boots',      armor: 3, tier: 5, durability: 429, armorMat: 'diamond', desc: '' },
  // `beltSlots` opens that many quick-access slots above the equipment panel while worn
  [ITEM.BELT]:               { name: 'Belt',               stack: 1, icon: 'belt',               equip: 'belt',       beltSlots: 5, hotbarSlots: 1, desc: 'Worn on the belt. Adds special slots and 1 hotbar slot' },
  // ...and `packSlots` opens that many carrying slots under the main grid (41-backpack.js)
  [ITEM.BACKPACK]:           { name: 'Backpack',           stack: 1, icon: 'backpack',           equip: 'back',       packSlots: 16,
                               desc: 'Worn on the back. Adds two more rows of carrying space' },
};

// blocks that only DROP when broken with the right tool type at (or above) a tier.
// Not listed = always drops. Block still breaks either way, just yields nothing.
const MINE_REQ = {
  [B.STONE]:       { tool: 'pick', tier: 1 },
  [B.COBBLE]:      { tool: 'pick', tier: 1 },
  [B.STONE_BRICK]: { tool: 'pick', tier: 1 },
  [B.BRICKS]:      { tool: 'pick', tier: 1 },
  [B.FURNACE]:     { tool: 'pick', tier: 1 },
  [B.COAL_ORE]:    { tool: 'pick', tier: 1 },
  [B.COPPER_ORE]:  { tool: 'pick', tier: 1 },
  [B.IRON_ORE]:    { tool: 'pick', tier: 2 },
  [B.TIN_ORE]:     { tool: 'pick', tier: 2 },
  [B.GOLD_ORE]:    { tool: 'pick', tier: 3 },
  // diamond and every gem need a bronze pickaxe (tier 4) or better since 0.774
  [B.DIAMOND_ORE]: { tool: 'pick', tier: 4 },
  [B.EMERALD_ORE]: { tool: 'pick', tier: 4 },
  [B.RUBY_ORE]:    { tool: 'pick', tier: 4 },
  [B.SAPPHIRE_ORE]:{ tool: 'pick', tier: 4 },
  [B.COBWEB]:      { tool: 'sword', tier: 0 },      // any sword cuts the string out; anything else just tears it
  [B.OBSIDIAN]: { tool: 'pick', tier: 5 },          // still diamond only now that bronze is tier 4 (0.774)
  [B.SNOW]:        { tool: 'shovel', tier: 1 },
  [B.SULFUR_BLOCK]:    { tool: 'pick', tier: 2 },
  [B.SULFUR_DOWN_TIP]: { tool: 'pick', tier: 2 },
  [B.SULFUR_UP_TIP]:   { tool: 'pick', tier: 2 },
  [B.MARBLE]:      { tool: 'pick', tier: 1 },
  [B.GRANITE]:     { tool: 'pick', tier: 1 },
  [B.LIMESTONE]:   { tool: 'pick', tier: 1 },
  // glow vine: any tool at all harvests its crystals; a bare hand just tears it down (0.765)
  [B.GLOW_VINE]:   { tool: 'any', tier: 0 },
};
// storage blocks (0.768): any pickaxe takes one back up; also on the pickaxe's list and in creative
const STORAGE_BLOCK_IDS = [B.COAL_BLOCK, B.CHARCOAL_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.TIN_BLOCK, B.COPPER_BLOCK,
  B.DIAMOND_BLOCK, B.EMERALD_BLOCK, B.RUBY_BLOCK, B.SAPPHIRE_BLOCK,
  B.RAW_IRON_BLOCK, B.RAW_GOLD_BLOCK, B.RAW_TIN_BLOCK, B.RAW_COPPER_BLOCK, B.TOPAZ_BLOCK];
for (const id of STORAGE_BLOCK_IDS) MINE_REQ[id] = { tool: 'pick', tier: 1 };
// 0.769: topaz ore needs iron like the other gems; sandstone any pickaxe
MINE_REQ[B.TOPAZ_ORE] = { tool: 'pick', tier: 4 };   // bronze, like the other gems (0.774)
MINE_REQ[B.SANDSTONE] = MINE_REQ[B.RED_SANDSTONE] = { tool: 'pick', tier: 1 };
// does the held item satisfy the block's drop requirement? (hand = tier 0, no tool type)
function mineDropAllowed(heldId, blockId) {
  const req = MINE_REQ[blockId];
  if (!req) return true;
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  return !!(p && p.tool && (req.tool === 'any' || p.tool === req.tool) && (p.tier || 0) >= req.tier);
}

// which blocks each tool class speeds up (material families, incl. their slab/stair forms)
const TOOL_BLOCKS = {
  shovel: new Set([B.SAND, B.RED_SAND, B.DIRT, B.GRASS, B.SNOW, B.CLAY, B.GRAVEL,]),
  pick:   new Set([B.STONE, B.COBBLE, B.COAL_ORE, B.IRON_ORE, B.DIAMOND_ORE, B.BRICKS, B.STONE_BRICK,
                   B.FURNACE, B.GRASS,
                   B.MARBLE, B.GRANITE, B.LIMESTONE, B.GLASS,
                   B.SULFUR_BLOCK, B.SULFUR_DOWN_TIP, B.SULFUR_UP_TIP, B.TIN_ORE, B.COPPER_ORE, B.GOLD_ORE,
                   B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, ...STORAGE_BLOCK_IDS,
                   B.TOPAZ_ORE, B.SANDSTONE, B.RED_SANDSTONE]),
  hatchet: new Set([B.LOG, B.PLANKS, B.BIRCH_LOG, B.BIRCH_PLANKS, B.STRIPPED_LOG, B.STRIPPED_BIRCH_LOG, B.SPRUCE_LOG, B.STRIPPED_SPRUCE_LOG, B.SPRUCE_PLANKS,
                    B.MELON, B.PUMPKIN, B.CRAFTING_BENCH, B.DOOR, B.CACTUS]),
  hoe:    new Set([B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.HAY]),
  // shears are the wool tool; they also snip plant matter cleanly
  shears: new Set([B.WOOL, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.TALLGRASS, B.TALL_LOWER, B.TALL_UPPER,
                   B.POPPY, B.ORCHID, B.SUGAR_CANE]),
  // a blade cuts soft, fibrous things fast — plants, leaves, melons, cane and webbing-like props
  sword:  new Set([B.COBWEB, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.HAY, B.MELON, B.PUMPKIN, B.SUGAR_CANE,
                   B.TALLGRASS, B.TALL_LOWER, B.TALL_UPPER, B.POPPY, B.ORCHID,
                   B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING, B.PINCUSHION, B.RED_MUSHROOM, B.BROWN_MUSHROOM, B.BLUE_MUSHROOM, B.CACTUS]),
};
/* Hollow logs (0.7842): cut with a hatchet like any log. HOLLOW_FILL_OF is what can be packed into one
   (block id -> fill index in its variant); an UPRIGHT one full of dirt or grass takes what grass takes, and
   one full of sand takes a cactus. */
for (const id of [B.HOLLOW_LOG, B.HOLLOW_BIRCH_LOG, B.HOLLOW_SPRUCE_LOG]) TOOL_BLOCKS.hatchet.add(id);
const HOLLOW_FILL_OF = {};
HOLLOW_FILLS.forEach((id, i) => { if (id) HOLLOW_FILL_OF[id] = i; });
const isHollowLog = (v) => PROPS[v & 255]?.model === 'hollow';
const hollowFillOf = (v) => (isHollowLog(v) ? HOLLOW_FILLS[(v >> 10) & 7] || 0 : 0);
const potSoil = (v) => { const f = hollowFillOf(v); return ((v >> 8) & 3) === 0 && (f === B.DIRT || f === B.GRASS); };
const potSand = (v) => { const f = hollowFillOf(v); return ((v >> 8) & 3) === 0 && (f === B.SAND || f === B.RED_SAND); };
// mining-time divisor for held item vs block: 1.5 when the right tool, 1 otherwise
function toolFactor(heldId, blockId) {
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  return (p && p.tool && TOOL_BLOCKS[p.tool] && TOOL_BLOCKS[p.tool].has(blockId)) ? p.toolSpeed : 1;
}
/* Billboards cost a tool NOTHING (0.7345): a torch, a flower, a sapling, a mushroom. You brush
   them aside — no edge touches anything, so no edge dulls. */
const isFreeBreak = (id) => { const p = PROPS[id & 255]; return !!(p && p.model === 'cross'); };
// ...and the ground layers — leaf litter, snow, any layer stack — are swept, not dug. They still cost the
// ordinary point of wear, they just never count as the WRONG tool for the job. Takes a VALUE (0.785).
const isLayerBlock = (v) => {
  const p = PROPS[v & 255];
  return !!(p && (p.model === 'carpet' || CORE.layerCount(v)));
};

/* Using the WRONG tool on a block (0.7344) — a pickaxe on dirt. Costs double wear and pays no
   experience, so a tool is something you pick for the job rather than one blunt instrument.

   True only when some tool class actually CLAIMS the block and what you are holding is not one of
   them. Two cases deliberately excluded: bare hands (nothing to blunt, and hands are not a wrong
   choice), and blocks no class claims at all — glass, wool, a torch have no right tool, so there
   is nothing to get wrong about them. */
function isWrongTool(heldId, blockId) {
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  if (!p || !p.tool) return false;
  const id = blockId & 255;
  // 0.7345: a billboard or a ground layer is a brush-aside, not a dig — nothing to do wrong
  if (isFreeBreak(id) || isLayerBlock(blockId)) return false;
  let claimed = false;
  for (const cls in TOOL_BLOCKS) {
    if (!TOOL_BLOCKS[cls].has(id)) continue;
    if (cls === p.tool) return false;               // the held tool is one of this block's own
    claimed = true;
  }
  return claimed;
}
/* Bare hands break FOLIAGE and nothing else (0.7341). Carpets, billboards and leaves come away by
   hand; every solid block needs a tool in hand before the crack even starts. That is what makes
   the flint tier a real gate rather than a convenience — and it is why the flint recipes cost no
   wood, since a log is on the far side of this rule. */
const LEAF_BLOCKS = new Set([B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);
/* Loose blocks (0.786): they fall, land as a pile of 8 walk-through layers (pouring into a pile below), and
   a layer of one breaks away to nothing. */
const LOOSE_LAYER_BLOCKS = new Set([B.SAND, B.RED_SAND, B.GRAVEL, B.FIBER_BLOCK]);
/* FURNITURE comes apart by hand too (0.7442). A bench, a chest, a bed and a hay bale are things
   you built or stacked, not ground you dig — needing an axe to move your own bed was a chore, and
   the flint gate is about the WORLD, not your furniture. They also pay no XP (see XP_BLOCK in
   35-leveling.js), so hand-breaking them is housekeeping and never a grind. */
const HAND_BREAK_BLOCKS = new Set([B.CRAFTING_BENCH, B.CHEST, B.BED, B.HAY, B.FIBER_BLOCK, B.LADDER,   // + fiber block, ladder (0.769)
                                   B.MORTAR]);                                                         // + mortar (0.77)
// takes a VALUE since 0.785: a stack of snow, leaves or sand comes away by hand, a stone layer does not
function handBreakable(id) {
  const p = PROPS[id & 255];
  if (!p) return false;
  return p.model === 'cross' || p.model === 'carpet' || (p.layerStack && CORE.layerCount(id) > 0) || p.model === 'wall'
      || LEAF_BLOCKS.has(id & 255) || HAND_BREAK_BLOCKS.has(id & 255);
}
// does what is in hand count as a tool at all? (any tool class — pick, shovel, hatchet, hoe, ...)
const isToolItem = (id) => !!(id != null && id >= 256 && ITEM_PROPS[id] && ITEM_PROPS[id].tool);

// Block drop table: block ID -> drop block ID (null = nothing, undefined = drop self)
const BLOCK_DROP = {
  [B.GRASS]: B.DIRT,
  [B.STONE]: B.COBBLE,
};

// Returns [{id, count}, ...] (empty array = no drops). isNatural=true uses lower leaf-decay probability.
function blockDrop(blockId, isNatural = false) {
  // a flint stone is never mined by hand (noTarget), but an explosion can still take one out —
  // and when it does it should hand over the same flint a pickup would
  if (blockId === B.FLINT_ROCK) return [{ id: ITEM.FLINT, count: 1 }];
  if (blockId === B.LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.SPRUCE_LEAVES) {
    const drops = [];
    /* 2% since 0.7343. Leaves are the ONLY stick source a player can reach before their first
       tool (0.7341 put logs behind the tool gate), so 0.9% made the opening tool a grind through
       whole canopies. Player-PLACED leaves stay far lower on purpose: replanting a leaf block to
       re-break it must never be a better rate than finding a tree. */
    // doubled in 0.7443 (was 0.05 / 0.012) — the ratio between the two is what must hold
    // Canopy Forager (0.79, 45-skills.js) scales all three rolls. Absent in a worker, where it reads 1
    const lm = typeof skillLeafMul === 'function' ? skillLeafMul() : 1;
    const stickChance = (isNatural ? 0.10 : 0.024) * lm;
    if (Math.random() < stickChance)
      drops.push({ id: ITEM.STICK, count: Math.floor(Math.random() * 3) + 1 });
    const appleChance = (isNatural ? 0.002 : 0.0005) * lm;
    if (Math.random() < appleChance)
      drops.push({ id: ITEM.APPLE, count: 1 });
    // saplings from decayed/mined leaves: 2% natural, 0.1% player-broken. Matches the leaf type.
    const sapChance = (isNatural ? 0.02 : 0.001) * lm;
    if (Math.random() < sapChance)
      drops.push({ id: blockId === B.BIRCH_LEAVES ? B.BIRCH_SAPLING
                     : blockId === B.SPRUCE_LEAVES ? B.SPRUCE_SAPLING : B.OAK_SAPLING, count: 1 });
    return drops;
  }
  if (blockId === B.COAL_ORE)    return [
    { id: ITEM.COAL,       count: 2 + Math.floor(Math.random() * 3) },
    { id: ITEM.COAL_CHUNK, count: 3 + Math.floor(Math.random() * 5) },
  ];
  if (blockId === B.IRON_ORE)    return [{ id: ITEM.RAW_IRON, count: 1 + Math.floor(Math.random() * 4) }];
  if (blockId === B.COPPER_ORE)    return [{ id: ITEM.RAW_COPPER, count: 1 + Math.floor(Math.random() * 6) }];
  if (blockId === B.TIN_ORE)    return [{ id: ITEM.RAW_TIN, count: 1 + Math.floor(Math.random() * 5) }];
  if (blockId === B.GOLD_ORE)    return [{ id: ITEM.RAW_GOLD, count: 1 + Math.floor(Math.random() * 3) }];
  if (blockId === B.DIAMOND_ORE) return [{ id: ITEM.DIAMOND,  count: 1 + Math.floor(Math.random() * 2) }];
  if (blockId === B.GLOW_VINE) return [{ id: ITEM.GLOW_CRYSTAL, count: 1 + Math.floor(Math.random() * 2) }];   // 0.765
  // 0.766: a cobweb is string; gem ores give 1-2 gems (the pickaxe gate is MINE_REQ)
  if (blockId === B.COBWEB)       return [{ id: ITEM.STRING,   count: 1 + Math.floor(Math.random() * 3) }];
  if (blockId === B.EMERALD_ORE)  return [{ id: ITEM.EMERALD,  count: 1 + Math.floor(Math.random() * 2) }];
  if (blockId === B.RUBY_ORE)     return [{ id: ITEM.RUBY,     count: 1 + Math.floor(Math.random() * 2) }];
  if (blockId === B.SAPPHIRE_ORE) return [{ id: ITEM.SAPPHIRE, count: 1 + Math.floor(Math.random() * 2) }];
  if (blockId === B.TOPAZ_ORE)    return [{ id: ITEM.TOPAZ,    count: 1 + Math.floor(Math.random() * 2) }];   // 0.769
  if (blockId === B.GRAVEL) {
    if (Math.random() < 0.05) return [{ id: ITEM.FLINT, count: 1 }];   
    return [{ id: B.GRAVEL, count: 1 }];
  }
  if (blockId === B.MELON) return [{ id: ITEM.MELON_SLICE, count: 2 + Math.floor(Math.random() * 5) }];
  if (blockId === B.WHEAT) return [{ id: ITEM.WHEAT, count: 1 + Math.floor(Math.random() * 2) }];
  // grass and berry bushes drop nothing when destroyed — bush pickup is the only way to work them
  if (blockId === B.TALLGRASS || blockId === B.TALL_LOWER || blockId === B.TALL_UPPER ||
      isBerryBush(blockId)) return [];
  if (blockId === B.GLASS) return [{ id: ITEM.GLASS_SHARD, count: 2 + Math.floor(Math.random() * 3) }];
  if (blockId === B.CLAY)  return [{ id: ITEM.CLAY_BALL, count: 5 }];   // 5, what the block costs (0.769)
  if (blockId === B.SNOW)  return [{ id: ITEM.SNOWBALL,  count: 2 + Math.floor(Math.random() * 3) }];
  if (blockId === B.SUGAR_CANE) return [{ id: ITEM.SUGAR_CANE, count: 1 }];
  if (blockId === B.OAK_SAPLING || blockId === B.BIRCH_SAPLING || blockId === B.SPRUCE_SAPLING)
    return [{ id: blockId, count: 1 }];
  if (blockId === B.SULFUR_DOWN_TIP || blockId === B.SULFUR_UP_TIP) {
    // legacy DOWN_TIP still drops sulfur so terrain-generated tips work; both variants of the
    // canonical SULFUR_UP_TIP block also drop sulfur only (never the tip back)
    const n = Math.floor(Math.random() * 3);   // 0..2
    return n > 0 ? [{ id: ITEM.SULFUR, count: n }] : [];
  }
  const override = BLOCK_DROP[blockId];
  if (override === undefined) return [{ id: blockId, count: 1 }];
  if (override === null)      return [];
  return [{ id: override, count: 1 }];
}
