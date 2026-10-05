'use strict';
/* voxiGrof — blocks (0.8376): every block there is, moved out of VOXEL_CORE (02-voxel-core.js). Its id (B) and tiles
   (T, and the furnace / bench / mushroom / berry / band-and-pillar tile sets), its properties (PROPS: name, model,
   pass, hardness, faces...), the variant bits (V), log width, the models' boxes (clusters, mortar, mushrooms, torches,
   stairs, fences, walls, hollow logs...), the chisel shapes (SHAPE_*, SHAPE_BLOCKS, layers, mixed slabs) and the
   value-based helpers (shapeOfVal, solidVal, opaqueVal, shapeBoxesAt, layerVal...).

   BLOCK_CORE is stringified into the mesh/worldgen worker beside VOXEL_CORE (10-workers.js), so like it, it must not
   touch anything outside itself. It loads BEFORE 02-voxel-core.js (index.html), whose VOXEL_CORE takes all of it from
   BLOCKS (and hands it on in its own return, so CORE.B, CORE.PROPS... are as they were). A new block is added here.
   The items (ITEM, ITEM_PROPS) are 59-items.js (0.8377); the main-thread tool tables (TOOL_BLOCKS, LEAF_BLOCKS...) stay in 02. */
function BLOCK_CORE() {
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
              BLUE_MUSHROOM:122,
              // variant looks (0.7941, 46-variants.js)
              MOSSY_STONE_BRICK:123, CRACKED_STONE_BRICK:124, MOSSY_COBBLE:125, SULFUR_BRICKS:126,
              GRANITE_BRICKS:127, MARBLE_BRICKS:128, LIMESTONE_BRICKS:129,
              BERRY_BUSH_YELLOW:130,
              FURNACE_TOP_OPEN:131,
              TNT_TOP_LIT:132,
              // dolomite, the mossy and polished rocks, the stone furnace's chimney (0.809)
              DOLOMITE:133, DOLOMITE_BRICKS:134, MOSSY_DOLOMITE_BRICKS:135, POLISHED_DOLOMITE:136,
              MOSSY_GRANITE_BRICKS:137, MOSSY_MARBLE_BRICKS:138, MOSSY_LIMESTONE_BRICKS:139,
              POLISHED_GRANITE:140, POLISHED_MARBLE:141, POLISHED_LIMESTONE:142,
              CHIMNEY_SIDE:143, CHIMNEY_TOP:144 };
  /* A furnace per rock and a crafting bench per wood (0.809), numbered on from 145 in the order
     03-atlas.js lists them (FURNACE_ROCKS / BENCH_WOODS in 01-textures-data.js). Each set is
     [front, front lit, side, top (the chimney hole), bottom, chimney side, chimney top] for a furnace
     and [top, front, side, bottom] for a bench; set 0 is the block's own look. */
  const FURNACE_T = [[T.FURNACE_FRONT, T.FURNACE_FRONT_ON, T.FURNACE_SIDE, T.FURNACE_TOP_OPEN, T.FURNACE_TOP, T.CHIMNEY_SIDE, T.CHIMNEY_TOP]];
  const FURNACE_ROCK_N = 5, BENCH_WOOD_N = 5;
  for (let r = 1, t = 145; r < FURNACE_ROCK_N; r++) {
    const set = [];
    for (let p = 0; p < 7; p++, t++) { set.push(t); T['FURNACE_' + r + '_' + p] = t; }
    FURNACE_T.push(set);
  }
  T.CRAFT_BOTTOM = 145 + (FURNACE_ROCK_N - 1) * 7;                  // 173
  const BENCH_T = [[T.CRAFT_TOP, T.CRAFT_FRONT, T.CRAFT_SIDE, T.CRAFT_BOTTOM]];
  for (let w = 1, t = T.CRAFT_BOTTOM + 1; w < BENCH_WOOD_N; w++) {
    const set = [];
    for (let p = 0; p < 4; p++, t++) { set.push(t); T['BENCH_' + w + '_' + p] = t; }
    BENCH_T.push(set);
  }
  // 0.8091: sand sides, polished stone, adobe, the glass looks, salt crust, cantaloupe — on from 190
  Object.assign(T, { SAND_SIDE:190, RED_SAND_SIDE:191, POLISHED_STONE:192, ADOBE:193, ADOBE_BRICK:194,
                     DARK_GLASS:195, GREENHOUSE_GLASS:196, GLASS_BRICKS:197, DARK_GLASS_BRICKS:198, SALT_CRUST:199,
                     CANTALOUPE_SIDE:200, CANTALOUPE_TOP:201, CANTALOUPE_BOTTOM:202 });
  /* The mushroom models (0.8091), from 203: per kind [cap top, cap side, cap bottom, stem side, stem top], kinds
     in MUSHROOM_KINDS order (01-textures-data.js): red, brown, blue, black, lava, white tall. */
  const SHROOM_T = [];
  for (let k = 0, t = 203; k < 6; k++) {
    const set = [];
    for (let p = 0; p < 5; p++, t++) { set.push(t); T['SHROOM_' + k + '_' + p] = t; }
    SHROOM_T.push(set);
  }
  // 0.8093: flowing water and lava (animated like the still ones), terracotta's brick look
  Object.assign(T, { WATER_FLOW:233, LAVA_FLOW:234, TERRACOTTA_BRICKS:235 });
  /* Band and pillar for every rock (0.8093), from 236: per rock [band side, band top, pillar side, pillar top],
     rocks in DECOR_ROCKS order (01-textures-data.js): stone, granite, marble, limestone, dolomite. */
  const DECOR_T = [];
  for (let r = 0, t = 236; r < 5; r++) {
    const set = [];
    for (let p = 0; p < 4; p++, t++) { set.push(t); T['DECOR_' + r + '_' + p] = t; }
    DECOR_T.push(set);
  }
  // wheat's growth stages (0.81), 256-262
  for (let s = 0; s < 7; s++) T['WHEAT_S' + s] = 256 + s;
  T.ASH = 263;                                                     // ash, what fire leaves (0.8191)
  /* 0.821: the yellow mushroom (kind 6) and the grilled ones (7-12: red, brown, blue, black, white, yellow), from 264,
     their part tiles in MUSHROOM_KINDS order; the yellow shape has a sixth, the flare between stem and cap */
  for (let k = 6, t = 264; k < 13; k++) {
    const set = [];
    for (let p = 0, n = (k === 6 || k === 12) ? 6 : 5; p < n; p++, t++) { set.push(t); T['SHROOM_' + k + '_' + p] = t; }
    SHROOM_T.push(set);
  }
  // 0.822: pink sand (top, side), pink sandstone, and the brick and polished looks of all three sandstones, from 301
  Object.assign(T, { PINK_SAND:301, PINK_SAND_SIDE:302, PINK_SANDSTONE:303, SANDSTONE_BRICKS:304, POLISHED_SANDSTONE:305,
                     RED_SANDSTONE_BRICKS:306, POLISHED_RED_SANDSTONE:307, PINK_SANDSTONE_BRICKS:308, POLISHED_PINK_SANDSTONE:309 });
  /* 0.823: the grass in a warm climate (pale, dry) and a cold one (dark, cool), from 310, built at atlas build (03):
     block top, block side, tall grass bottom and top, short grass — warm then cold of each */
  Object.assign(T, { GRASS_TOP_WARM:310, GRASS_TOP_COLD:311, GRASS_SIDE_WARM:312, GRASS_SIDE_COLD:313,
                     TALL_BOT_WARM:314, TALL_BOT_COLD:315, TALL_TOP_WARM:316, TALL_TOP_COLD:317,
                     GRASS_PLANT_WARM:318, GRASS_PLANT_COLD:319 });
  // 0.824: lightning-struck sand; the carved pumpkin's face and top, and the lit one's face
  Object.assign(T, { GLASSY_SAND:320, CARVED_PUMPKIN_FRONT:321, CARVED_PUMPKIN_TOP:322, JACK_O_LANTERN_FRONT:323,
                     GLASSY_RED_SAND:324, GLASSY_PINK_SAND:325 });   // 0.8241
  /* 0.827: every berry bush's own six growth stages, from 326: per kind (BERRY_KINDS) stage 0 sprout .. 5 ripe,
     textures/Billboards/Plants/Berry_bush/<Kind>/<kind>_berry_stage<n>.png (BERRY_COLORS, 01-textures-data.js) */
  const BERRY_KINDS = ['RED', 'BLUE', 'BLACK', 'YELLOW', 'WHITE'], BERRY_STAGES = 6;
  // dirt patches in caves, and how often a yellow berry bush stands on their floor (0.8271, genChunk)
  const CAVE_DIRT_AT = 0.3, CAVE_YELLOW_BUSH = 0.0072;   // 20% more since 0.8272 (0.006);   // ~14% of cave floor is dirt; a bush every couple of chunks
  BERRY_KINDS.forEach((k, i) => { for (let s = 0; s < BERRY_STAGES; s++) T['BERRY_' + k + '_S' + s] = 326 + i * BERRY_STAGES + s; });
  // 0.829: sugar cane's growing stages 0-4 (stage 5 is T.SUGAR_CANE) and a grown column's bottom, middle and top
  Object.assign(T, { SUGAR_CANE_S0:356, SUGAR_CANE_S1:357, SUGAR_CANE_S2:358, SUGAR_CANE_S3:359, SUGAR_CANE_S4:360,
                     SUGAR_CANE_BOTTOM:361, SUGAR_CANE_MIDDLE:362, SUGAR_CANE_TOP:363 });
  T.ICE = 364;                                                     // 0.8321
  Object.assign(T, { ICE_BRICKS:365, SNOW_BRICKS:366, SNOW_ICE_BRICKS:367, BONE_BLOCK_SIDE:368, BONE_BLOCK_TOP:369, BONE_BRICKS:370 });   // 0.833
  // 0.834: the three torches at 128px, and the spent glow blocks (grey copies built at atlas build, 03)
  Object.assign(T, { TORCH_FIRE:371, TORCH_UNLIT:372, TORCH_CRYSTAL:373, GLOWSTONE_SPENT:374, GLOWCRYSTAL_SPENT:375 });
  T.PACKED_ICE = 376;                                                                  // 0.835
  Object.assign(T, { WATER_FLOW_FAST:377, WATER_FALL:378 });                          // 0.835491: the flow art run faster, for steep water and falls
  // 0.836: rime wood, the frozen trees of the Coldest Deep Snow
  Object.assign(T, { RIME_LOG:379, RIME_LOG_TOP:380, STRIPPED_RIME_LOG:381, STRIPPED_RIME_LOG_TOP:382, RIME_PLANKS:383, RIME_LEAVES:384 });
  /* Ice that froze from water (0.833) carries ICE_FROM_WATER in its variant: only that ice breaks or melts back into water
     and thaws in spring. Ice a player or a structure put down breaks into nothing and stays. */
  const ICE_FROM_WATER = 1;
  /* A cane's variant bits 0-2: steps it still has to grow, CANE_STEPS a sprout .. 0 grown (the world's and old saves').
     A neighbour above joins the column once it has stalks (CANE_JOIN_LEFT steps left or fewer). Growth: 51-seasons.js. */
  const CANE_STEPS = 5, CANE_JOIN_LEFT = 3;
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
              HOLLOW_LOG:125, HOLLOW_BIRCH_LOG:126, HOLLOW_SPRUCE_LOG:127,
              // variant blocks (0.7941): other looks of a block, picked on the variant bar and never an item
              MOSSY_STONE_BRICK:128, CRACKED_STONE_BRICK:129, MOSSY_COBBLE:130, SULFUR_BRICKS:131,
              GRANITE_BRICKS:132, MARBLE_BRICKS:133, LIMESTONE_BRICKS:134,
              GRANITE_MORTAR:135, MARBLE_MORTAR:136, LIMESTONE_MORTAR:137,           // 0.7945
              BLACKBERRY_BUSH:138,                                                   // 0.7947 (YELLOWBERRY_BUSH until 0.827)
              // gem clusters on a plain stone bed, a variant (0.7947)
              DIAMOND_CLUSTER_STONE:139, EMERALD_CLUSTER_STONE:140, RUBY_CLUSTER_STONE:141,
              SAPPHIRE_CLUSTER_STONE:142, TOPAZ_CLUSTER_STONE:143,
              // dolomite, a rock like marble and limestone, and the looks of every rock (0.809)
              DOLOMITE:144, DOLOMITE_BRICKS:145, MOSSY_DOLOMITE_BRICKS:146, POLISHED_DOLOMITE:147,
              MOSSY_GRANITE_BRICKS:148, MOSSY_MARBLE_BRICKS:149, MOSSY_LIMESTONE_BRICKS:150,
              POLISHED_GRANITE:151, POLISHED_MARBLE:152, POLISHED_LIMESTONE:153,
              // 0.8091: polished stone, adobe, the glass looks, salt crust, cantaloupe, three more mushrooms
              POLISHED_STONE:154, ADOBE:155, ADOBE_BRICK:156,
              DARK_GLASS:157, GREENHOUSE_GLASS:158, GLASS_BRICKS:159, DARK_GLASS_BRICKS:160,
              SALT_CRUST:161, CANTALOUPE:162, BLACK_MUSHROOM:163, LAVA_MUSHROOM:164, WHITE_TALL_MUSHROOM:165,
              // 0.8093: terracotta's brick look; band and pillar looks of every rock
              TERRACOTTA_BRICKS:166,
              STONE_BAND:167, STONE_PILLAR:168, GRANITE_BAND:169, GRANITE_PILLAR:170, MARBLE_BAND:171,
              MARBLE_PILLAR:172, LIMESTONE_BAND:173, LIMESTONE_PILLAR:174, DOLOMITE_BAND:175, DOLOMITE_PILLAR:176,
              STONE_PEBBLE:177,                                                       // 0.8095
              ASH:178, FIRE:179,                                                      // 0.8191
              // 0.821: the yellow mushroom, and the grilled mushrooms (food from a furnace, never placed)
              YELLOW_MUSHROOM:180, GRILLED_RED_MUSHROOM:181, GRILLED_BROWN_MUSHROOM:182, GRILLED_BLUE_MUSHROOM:183,
              GRILLED_BLACK_MUSHROOM:184, GRILLED_WHITE_MUSHROOM:185, GRILLED_YELLOW_MUSHROOM:186,
              // 0.822: pink sand and its sandstone; brick and polished sandstone looks (variants); the dolomite mortar
              PINK_SAND:187, PINK_SANDSTONE:188, SANDSTONE_BRICKS:189, POLISHED_SANDSTONE:190, RED_SANDSTONE_BRICKS:191,
              POLISHED_RED_SANDSTONE:192, PINK_SANDSTONE_BRICKS:193, POLISHED_PINK_SANDSTONE:194, DOLOMITE_MORTAR:195,
              // 0.824: sand fused by lightning; the carved pumpkin and the jack o'lantern
              GLASSY_SAND:196, CARVED_PUMPKIN:197, JACK_O_LANTERN:198,
              GLASSY_RED_SAND:199, GLASSY_PINK_SAND:200,                               // 0.8241
              YELLOWBERRY_BUSH:201, WHITEBERRY_BUSH:202,                               // 0.827: the real yellow, and white
              ICE:203,                                                                 // 0.8321
              // 0.833: ice and snow bricks, the snow-ice brick both share; the bone block and its brick
              ICE_BRICKS:204, SNOW_BRICKS:205, SNOW_ICE_BRICKS:206, BONE_BLOCK:207, BONE_BRICKS:208,
              // 0.834: the burnt-out torch, the cold crystal torch, and the two glow blocks gone dark
              TORCH_UNLIT:209, CRYSTAL_TORCH:210, GLOWSTONE_SPENT:211, GLOWCRYSTAL_SPENT:212,
              PACKED_ICE:213,                                                          // 0.835: the ice spikes' ice
              // 0.836: rime wood, the Coldest Deep Snow's frozen trees (no sapling yet)
              RIME_LOG:214, STRIPPED_RIME_LOG:215, RIME_PLANKS:216, RIME_LEAVES:217, HOLLOW_RIME_LOG:218,
            };
  /* ids 12, 28, 29, 31, 32, 35-38 and 113-124 were slabs and stairs until 0.783, when shapes became variants
     of the full block (SHAPE_SLAB below). Old saves are converted by migrateLegacyVal — never reuse them. */
  /* variant byte layout:
     - grass: 1 = snowy sides
     - rot:'side' blocks (furnace, bench): bits 0-1 = facing (0:+Z 1:-Z 2:+X 3:-X);
       furnace additionally uses bit 2 (value 4) = lit
     - log (rot:'all'): 0 = Y axis, 1 = X (lying), 2 = Z (lying)
     - slab (rot:'all'): 0 bottom, 1 top(ceiling), 2..5 vertical halves (-X,+X,-Z,+Z side) */
  const V = { GRASS_SNOWY:1, FURNACE_ON:4,
              // which rock a furnace is built of, bits 3-5 (0 stone, then FURNACE_ROCKS), and which wood a
              // bench is, bits 2-4 (0 oak, then BENCH_WOODS) — picked on the variant bar (0.809)
              FURNACE_ROCK_SHIFT:3, BENCH_WOOD_SHIFT:2 };
  const SIDE_FACE = [4, 5, 0, 1];            // facing bits -> faces[] index of the front
  // a furnace's or bench's tile for one face, from its facing, lit bit and rock or wood (0.809)
  const furnaceRockOf = (varb) => { const r = (varb >> V.FURNACE_ROCK_SHIFT) & 7; return r < FURNACE_ROCK_N ? r : 0; };
  const benchWoodOf = (varb) => { const w = (varb >> V.BENCH_WOOD_SHIFT) & 7; return w < BENCH_WOOD_N ? w : 0; };
  function furnaceTile(varb, faceIdx) {
    const s = FURNACE_T[furnaceRockOf(varb)];
    return faceIdx === 2 ? s[3] : faceIdx === 3 ? s[4]                                   // the chimney hole on top
         : faceIdx === SIDE_FACE[varb & 3] ? ((varb & V.FURNACE_ON) ? s[1] : s[0]) : s[2];
  }
  function benchTile(varb, faceIdx) {
    const s = BENCH_T[benchWoodOf(varb)];
    return faceIdx === 2 ? s[0] : faceIdx === 3 ? s[3] : faceIdx === SIDE_FACE[varb & 3] ? s[1] : s[2];
  }
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
  // how much of a wooden log's width is cut off each of its long edges when meshed (0.793): 2 of 16 pixels
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
  PROPS[B.LOG]     = { name:'Oak log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:4.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.LOG,T.LOG,T.LOG_TOP,T.LOG_TOP,T.LOG,T.LOG], desc: '' };
  PROPS[B.PLANKS]  = { name:'Oak planks', solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:4.0, type:'wood', faces:[T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS,T.PLANKS], desc: '' };
  PROPS[B.LEAVES]  = { name:'Oak leaves',     solid:false, opaque:false, raycast:true,  pass:1, model:'cube', stack:60, hardness:0.4, type:'grass', faces:[T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES,T.LEAVES], desc: '' };
  PROPS[B.BIRCH_LOG]    = { name:'Birch log',    solid:true,  opaque:false,  raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:4.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.BIRCH_LOG,T.BIRCH_LOG,T.BIRCH_LOG_TOP,T.BIRCH_LOG_TOP,T.BIRCH_LOG,T.BIRCH_LOG], desc: '' };
  PROPS[B.BIRCH_PLANKS] = { name:'Birch planks', solid:true,  opaque:true,  raycast:true, pass:0, model:'cube', stack:60, hardness:3.0, type:'wood', faces:[T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS,T.BIRCH_PLANKS], desc: '' };
  PROPS[B.BIRCH_LEAVES] = { name:'Birch leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:60, hardness:0.4, type:'grass', faces:[T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES,T.BIRCH_LEAVES], desc: '' };
  PROPS[B.SAND]    = { name:'Sand',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:1.9, type:'ground', faces:[T.SAND_SIDE,T.SAND_SIDE,T.SAND,T.SAND,T.SAND_SIDE,T.SAND_SIDE], desc: '' };   // own sides 0.8091
  // pass 4 (0.8263): the see-through pass, blended without writing depth, so glass shows through glass (04-materials.js)
  PROPS[B.GLASS]   = { name:'Glass',      solid:true,  opaque:false, raycast:true,  pass:4, model:'cube', stack:60, hardness:0.9, type:'glass', faces:[T.GLASS,T.GLASS,T.GLASS,T.GLASS,T.GLASS,T.GLASS], desc: '' };
  PROPS[B.BEDROCK] = { name:'Bedrock',    solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:Infinity, type:'stone', faces:[T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK,T.BEDROCK], desc: '' };
  PROPS[B.WATER]   = { name:'Water',      solid:false, opaque:false, raycast:false, pass:2, model:'cube', hardness:0, faces:[T.WATER,T.WATER,T.WATER,T.WATER,T.WATER,T.WATER], desc: '' };
  PROPS[B.GLOWSTONE] = { name:'Glow dust block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', light:20,handLight:10, stack:60, hardness:2.5, type:'glass', faces:[T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE,T.GLOWSTONE], desc: '' };
  // the six halves a slab shape can fill: bottom, top, -X, +X, -Z, +Z (see CHISEL SHAPES below)
  const SLAB_HALF = [[0,0,0,1,0.5,1],[0,0.5,0,1,1,1],[0,0,0,0.5,1,1],[0.5,0,0,1,1,1],[0,0,0,1,1,0.5],[0,0,0.5,1,1,1]];
  PROPS[B.CLAY]    = { name:'Clay',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:2.2, type:'ground', faces:[T.CLAY,T.CLAY,T.CLAY,T.CLAY,T.CLAY,T.CLAY], desc: '' };
  PROPS[B.SNOW]    = { name:'Snow',       solid:true,  opaque:true,  raycast:true,  pass:0, model:'cube', stack:60, hardness:1.2, type:'snow', faces:[T.SNOW,T.SNOW,T.SNOW,T.SNOW,T.SNOW,T.SNOW], desc: '' };
  /* Ice (0.8321): see-through like glass (pass 4). It covers the water of a snow biome all year and every lake in winter
     but a desert's; breaking it leaves water and drops nothing, and heat melts it (51-seasons.js). */
  PROPS[B.ICE]     = { name:'Ice',        solid:true,  opaque:false, raycast:true,  pass:4, model:'cube', stack:60, hardness:0.5, type:'glass', faces:Array(6).fill(T.ICE),
                       desc: 'Breaks into water. Melts within 1 block of a torch, 3 of a lit furnace, 5 of fire, 9 of lava' };
  // packed ice (0.835): the ice spikes' and icebergs' ice, pressed hard over the years. Solid, it never melts; mined only
  PROPS[B.PACKED_ICE] = { name:'Packed ice', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:1.5, type:'glass',
                          faces:Array(6).fill(T.PACKED_ICE), desc: 'Ice pressed hard over the years: it never melts' };
  // the bone block (0.833): pressed from ten bones; a pillar that turns to the face it is put on, its brick a look of it
  PROPS[B.BONE_BLOCK] = { name:'Bone block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2, type:'stone',
                          pillar: true, rot: 'all',
                          faces:[T.BONE_BLOCK_SIDE, T.BONE_BLOCK_SIDE, T.BONE_BLOCK_TOP, T.BONE_BLOCK_TOP, T.BONE_BLOCK_SIDE, T.BONE_BLOCK_SIDE], desc: '' };
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
  /* Rime (0.836): the frozen trees of the Coldest Deep Snow, wood hard with frost all through. Its leaves give sticks,
     never a sapling or an apple (50-loottable.js). */
  PROPS[B.RIME_LOG]          = { name:'Rime log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:5.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.RIME_LOG,T.RIME_LOG,T.RIME_LOG_TOP,T.RIME_LOG_TOP,T.RIME_LOG,T.RIME_LOG], desc: 'Frozen wood from the Coldest Deep Snow' };
  PROPS[B.STRIPPED_RIME_LOG] = { name:'Stripped rime log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:60, hardness:3.5, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_RIME_LOG,T.STRIPPED_RIME_LOG,T.STRIPPED_RIME_LOG_TOP,T.STRIPPED_RIME_LOG_TOP,T.STRIPPED_RIME_LOG,T.STRIPPED_RIME_LOG], desc: '' };
  PROPS[B.RIME_PLANKS]       = { name:'Rime planks', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:3.5, type:'wood', faces:Array(6).fill(T.RIME_PLANKS), desc: '' };
  PROPS[B.RIME_LEAVES]       = { name:'Rime leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:60, hardness:0.5, type:'grass', faces:Array(6).fill(T.RIME_LEAVES), desc: 'Needles under a crust of frost' };
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
  PROPS[B.DOLOMITE]    = { name:'Dolomite',  solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:8.0, type:'stone', faces:Array(6).fill(T.DOLOMITE), desc: '' };   // 0.809
  // adobe (0.8091): a clay block and 5 wheat make 4 at the bench; its brick is a variant
  PROPS[B.ADOBE]       = { name:'Adobe',     solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:4.0, type:'stone', faces:Array(6).fill(T.ADOBE), desc: '' };
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
  // coldLight (0.834): its light is blue, carried through the flood fill (08) to the shader (04)
  PROPS[B.GLOW_VINE] = { name:'Glow vine', solid:false, opaque:false, raycast:true, pass:1, model:'wall', climbable:true,
                         light:10, coldLight:true, stack:60, hardness:0.3, type:'grass', boxes:WALL_VAR[0], boxesByVar:WALL_VAR,
                         faces:[T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE], desc: '' };
  // five glow crystals pressed into a block: brighter than glowstone's reach, a real room light (0.765)
  PROPS[B.GLOWCRYSTAL_BLOCK] = { name:'Glowcrystal block', solid:true, opaque:true, raycast:true, pass:0, model:'cube',
                         light:18, handLight:12, coldLight:true, stack:60, hardness:2.5, type:'glass',
                         faces:[T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL], desc: '' };
  /* The glow blocks burn out (0.834, 56-torches.js): 30-60 minutes after they are placed or first seen they go dark,
     their own picture in grey. A spent one gives no light and breaks into nothing. */
  PROPS[B.GLOWSTONE_SPENT] = { name:'Spent glow dust block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60,
                         hardness:2.5, type:'glass', faces:Array(6).fill(T.GLOWSTONE_SPENT), desc: 'Burnt out: it gives no light, and breaks into nothing' };
  PROPS[B.GLOWCRYSTAL_SPENT] = { name:'Spent glowcrystal block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60,
                         hardness:2.5, type:'glass', faces:Array(6).fill(T.GLOWCRYSTAL_SPENT), desc: 'Burnt out: it gives no light, and breaks into nothing' };
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
  /* GEM CLUSTERS (0.7945). Diamond, emerald, ruby, sapphire and topaz are no longer ore blocks buried in the
     rock: each is a cluster of crystal spikes growing out of a stone face in a cave — floor, ceiling or wall —
     drawn in its gem block's texture. Same ids, so drops, tool tiers, XP and Prospector are unchanged. The
     variant byte (0-5) is the way it points: up, down, +X, -X, +Z, -Z (CLUSTER_DIRS); the block it grows from
     is the cell behind it, and when that goes the cluster drops as an item (11-chunks.js). Nothing collides
     with it. Worldgen puts them in caves (genChunk, after the sulfur). */
  const CLUSTER_DIRS = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  /* THE LOOK (0.7946; five straight spikes in 0.7945). A low uneven bed of the gem's ore rock, and six to
     eight crystal points of different heights rising out of it, each LEANING a step at a time so they
     point every which way. Four layouts, built from fixed seeds so every client draws the same; bits 3-4
     of the variant byte pick one (bits 0-2 are the direction), rolled when a cluster spawns or is placed.
     Authored pointing UP, in 16ths: [x0, y0, z0, x1, y1, z1, crystal ? 1 : 0]. */
  const CLUSTER_LAYOUTS = 4;
  function _clusterLayout(seed) {
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const out = [[2, 0, 2, 14, 1, 14, 0]];                          // the bed...
    for (let i = 0; i < 3; i++) {                                   // ...lumpy in a few places
      const w = 3 + (rnd() * 4 | 0), d = 3 + (rnd() * 4 | 0);
      const x = 1 + (rnd() * (14 - w) | 0), z = 1 + (rnd() * (14 - d) | 0);
      out.push([x, 0, z, x + w, 2, z + d, 0]);
    }
    const n = 6 + (rnd() * 3 | 0);
    for (let c = 0; c < n; c++) {
      const w = rnd() < 0.35 ? 3 : 2, h = 4 + (rnd() * 7 | 0);     // 4..10 tall
      let x = 2 + (rnd() * (12 - w) | 0), z = 2 + (rnd() * (12 - w) | 0);
      const dx = (rnd() * 3 | 0) - 1, dz = (rnd() * 3 | 0) - 1;   // which way it leans
      for (let y = 1; y < h;) {
        const top = Math.min(h, y + 2 + (rnd() * 2 | 0));
        const tip = top >= h, ww = tip ? 1 : w, o = tip ? (w - 1) >> 1 : 0;
        out.push([x + o, y, z + o, x + o + ww, top, z + o + ww, 1]);
        y = top;
        x = Math.max(0, Math.min(16 - w, x + dx));
        z = Math.max(0, Math.min(16 - w, z + dz));
      }
    }
    return out.map(b => [...b.slice(0, 6).map(v => v / 16), b[6]]);
  }
  const CLUSTER_UP = Array.from({ length: CLUSTER_LAYOUTS }, (_, i) => _clusterLayout(7 + i * 131));
  // turn a box authored pointing up to point along CLUSTER_DIRS[o]
  const _clusterTurn = (b, o) =>
      o === 1 ? [b[0], 1 - b[4], b[2], b[3], 1 - b[1], b[5]]
    : o === 2 ? [b[1], b[0], b[2], b[4], b[3], b[5]]
    : o === 3 ? [1 - b[4], b[0], b[2], 1 - b[1], b[3], b[5]]
    : o === 4 ? [b[0], b[2], b[1], b[3], b[5], b[4]]
    : o === 5 ? [b[0], b[2], 1 - b[4], b[3], b[5], 1 - b[1]]
    : b;
  // [direction][layout] -> [box, crystal?]
  const CLUSTER_BOXES = CLUSTER_DIRS.map((_, o) => CLUSTER_UP.map(lay => lay.map(b => [_clusterTurn(b, o), b[6]])));
  // the crosshair's box, indexed by the whole variant byte (direction | layout << 3 | bed << 5)
  const CLUSTER_HIT = Array.from({ length: 256 }, (_, v) =>
    [_clusterTurn([1, 0, 1, 15, 11, 15].map(n => n / 16), (v & 7) % 6)]);
  /* THE BED (0.7948): bits 5-7 of the variant byte say what rock the cluster grows from — 0 its ore's own
     speckled stone, then plain stone, granite, marble, limestone. Worldgen matches the rock it grew on;
     the variant bar picks one when you place it. Bits, not block ids, so a new rock costs no id. */
  const CLUSTER_BED_SHIFT = 5;
  const CLUSTER_BEDS = [null, T.STONE, T.GRANITE, T.MARBLE, T.LIMESTONE, T.DOLOMITE].map(t => t == null ? null : Array(6).fill(t));
  const CLUSTER_BED_OF = { [B.STONE]: 1, [B.GRANITE]: 2, [B.MARBLE]: 3, [B.LIMESTONE]: 4, [B.DOLOMITE]: 5 };   // rock id -> bed (dolomite 0.809)
  for (const [id, name, tile] of [[B.DIAMOND_ORE, 'Diamond cluster', T.DIAMOND_BLOCK], [B.EMERALD_ORE, 'Emerald cluster', T.EMERALD_BLOCK],
                                  [B.RUBY_ORE, 'Ruby cluster', T.RUBY_BLOCK], [B.SAPPHIRE_ORE, 'Sapphire cluster', T.SAPPHIRE_BLOCK],
                                  [B.TOPAZ_ORE, 'Topaz cluster', T.TOPAZ_BLOCK]])
    // crystals in the gem block's texture, the bed in the ore's own stone (0.7946)
    Object.assign(PROPS[id], { name, solid: false, opaque: false, model: 'cluster', bedFaces: PROPS[id].faces,
                               faces: [tile, tile, tile, tile, tile, tile], boxes: CLUSTER_HIT[0], boxesByVar: CLUSTER_HIT });
  // sandstone (0.769): five sand of its colour, with its own top, side and bottom faces [+X,-X,top,bottom,+Z,-Z]
  PROPS[B.SANDSTONE]     = { name:'Sandstone',     solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:4.0, type:'stone',
                             faces:[T.SANDSTONE_SIDE,T.SANDSTONE_SIDE,T.SANDSTONE_TOP,T.SANDSTONE_BOTTOM,T.SANDSTONE_SIDE,T.SANDSTONE_SIDE], desc: '' };
  PROPS[B.RED_SANDSTONE] = { name:'Red sandstone', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:4.0, type:'stone',
                             faces:[T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_TOP,T.RED_SANDSTONE_BOTTOM,T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_SIDE], desc: '' };
  // pink sand (0.822): on warm beaches, sand in every way but its colour; five make pink sandstone
  PROPS[B.PINK_SAND]      = { ...PROPS[B.SAND], name: 'Pink sand', faces: [T.PINK_SAND_SIDE,T.PINK_SAND_SIDE,T.PINK_SAND,T.PINK_SAND,T.PINK_SAND_SIDE,T.PINK_SAND_SIDE] };
  PROPS[B.PINK_SANDSTONE] = { ...PROPS[B.SANDSTONE], name: 'Pink sandstone', faces: Array(6).fill(T.PINK_SANDSTONE) };
  /* Glassy sand (0.824): sand that lightning struck, fused. It no longer falls or piles, and breaks into glass shards
     (50-loottable.js). Made by strikeLightning (53-storms.js) from any sand. */
  PROPS[B.GLASSY_SAND]    = { name:'Glassy sand', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2.4, type:'ground',
                              faces:Array(6).fill(T.GLASSY_SAND), desc: 'Sand fused by lightning. Breaks into glass shards' };
  // ...red sand and pink sand fuse into their own (0.8241)
  PROPS[B.GLASSY_RED_SAND]  = { ...PROPS[B.GLASSY_SAND], name: 'Glassy red sand',  faces: Array(6).fill(T.GLASSY_RED_SAND) };
  PROPS[B.GLASSY_PINK_SAND] = { ...PROPS[B.GLASSY_SAND], name: 'Glassy pink sand', faces: Array(6).fill(T.GLASSY_PINK_SAND) };
  // red and pink are glassy sand's variants (0.8263; each sand's own in 0.8261), so like every other look not in the palette
  for (const id of [B.GLASSY_RED_SAND, B.GLASSY_PINK_SAND]) PROPS[id].noInv = true;
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
                      stack:10, hardness:3.0, type:'stone', mortar:true,   // `mortar`: it and its variants work as one (0.7945)
                      boxes:[[0.13, 0, 0.13, 0.87, 0.71, 0.87]],   // the bowl; the pestle is not in the way
                      voxBoxes: MORTAR_BOXES, matFaces: MORTAR_FACES, animMat: 3,   // the pestle moves (0.772)
                      faces:[T.STONE,T.STONE,T.STONE,T.STONE,T.STONE,T.STONE],
                      desc: 'Keep its top clear: with a block or plant on it, it cannot be used' };   // 0.801
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
  PROPS[B.SUGAR_CANE]    = { name:'Sugar cane',    solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:64, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,1,0.9]], faces:[T.SUGAR_CANE], desc: '',
                             // by steps left to grow (0.829): 0 grown (a column's piece: emitCross), 1 stage 4 .. 5 the sprout
                             tilesByVar: [T.SUGAR_CANE, T.SUGAR_CANE_S4, T.SUGAR_CANE_S3, T.SUGAR_CANE_S2, T.SUGAR_CANE_S1, T.SUGAR_CANE_S0],
                             segTiles: [T.SUGAR_CANE_BOTTOM, T.SUGAR_CANE_MIDDLE, T.SUGAR_CANE_TOP] };
  PROPS[B.GRAVEL]      = { name:'Gravel',      solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2.5, type:'ground',  faces:[T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL,T.GRAVEL], desc: '' };
  PROPS[B.RED_MUSHROOM]  = { name:'Red mushroom',  solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:99, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.RED_MUSHROOM], desc: '' };
  // the third mushroom (0.7691): grows wherever the red and brown do, and goes into mushroom stew
  PROPS[B.BLUE_MUSHROOM] = { name:'Blue mushroom', solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:99, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.BLUE_MUSHROOM], desc: '' };
  PROPS[B.BROWN_MUSHROOM]= { name:'Brown mushroom',solid:false,opaque:false,raycast:true, pass:1, model:'cross',stack:99, hardness:0, type:'grass', boxes:[[0.3,0,0.3,0.7,0.8,0.7]], faces:[T.BROWN_MUSHROOM], desc: '' };
  /* MUSHROOMS ARE MODELS (0.8091): a stem, a cap and a crown of boxes (textures/Blocks/mushrooms/<kind>/*.json),
     drawn by emitShroom rather than as a crossed billboard. They keep model 'cross' — everything that treats a
     mushroom as a small plant (breaking free by hand, falling off its ground, the hand pose) still does.
     `shroom` is the kind: its sheets in SHROOM_T and its boxes in SHROOM_MODEL. Black and white tall grow and
     cook like brown; lava grows by lava in caves and glows a little. */
  // the model each kind is drawn with: white (5, 11) and yellow (6, 12) have their own shapes (0.821)
  const SHROOM_SHAPE = [0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 1, 2];
  const _shroom = (name, kind, extra) => ({ name, solid:false, opaque:false, raycast:true, pass:0, model:'cross', stack:99,
    // boxes fit the largest a mushroom grows in the world since 0.819 (0.6 of the model; emitShroom)
    hardness:0, type:'grass', shroom: kind,
    boxes: [[[5/16, 0, 5/16, 11/16, 7/16, 11/16], [6/16, 0, 6/16, 10/16, 10/16, 10/16], [5/16, 0, 5/16, 11/16, 6/16, 11/16]][SHROOM_SHAPE[kind]]],
    faces: Array(6).fill(SHROOM_T[kind][1]), desc: '', ...extra });
  // where each grows, for its tooltip (0.826)
  const SHROOM_WHERE = 'Grows on cave floors, in the shade under trees and beside fallen hollow logs';
  // 0.837: brown and black under every kind of tree, red under birch, blue under spruce, yellow under oak, white beside trees
  const _anyShroom = { desc: `${SHROOM_WHERE}: under every kind of tree, more in autumn, and on an oak hollow log packed with dirt.` };
  PROPS[B.RED_MUSHROOM]        = _shroom('Red mushroom', 0, { desc: `${SHROOM_WHERE}: under birch trees, more in autumn, and on a birch hollow log packed with dirt.` });
  PROPS[B.BROWN_MUSHROOM]      = _shroom('Brown mushroom', 1, _anyShroom);
  PROPS[B.BLUE_MUSHROOM]       = _shroom('Blue mushroom', 2, { desc: `${SHROOM_WHERE}: under spruce trees, more in autumn, and on a spruce hollow log packed with dirt.` });
  PROPS[B.BLACK_MUSHROOM]      = _shroom('Black mushroom', 3, _anyShroom);
  PROPS[B.LAVA_MUSHROOM]       = _shroom('Lava mushroom', 4, { light: 6, desc: 'Grows on cave floors next to lava, and glows a little.' });
  PROPS[B.WHITE_TALL_MUSHROOM] = _shroom('White mushroom', 5, { desc: 'Grows in clearings and meadows beside trees, very rarely on the plains by a tree, and on an oak hollow log packed with dirt.' });   // "white tall" until 0.821
  PROPS[B.YELLOW_MUSHROOM]     = _shroom('Yellow mushroom', 6, { desc: `${SHROOM_WHERE}: under oak trees, more in autumn, and on an oak hollow log packed with dirt.` });   // 0.821
  /* Grilled mushrooms (0.821): what a furnace makes of a mushroom (not the lava one). Food, drawn on their raw
     kind's model, never placed (`noPlace`); what they give besides food is FOOD_NUTRITION in 54-stats-effects.js. */
  // noCreative (0.822): not in the creative palette (13-actions.js), but carried and saved like any block
  const _grilled = (name, kind) => _shroom(name, kind, { noPlace: true, noCreative: true, food: 15, foodSat: 10, foodSatFull: 5,
    eatTime: 1.44, spoil: 3600, desc: '' });
  PROPS[B.GRILLED_RED_MUSHROOM]    = _grilled('Grilled red mushroom', 7);
  PROPS[B.GRILLED_BROWN_MUSHROOM]  = _grilled('Grilled brown mushroom', 8);
  PROPS[B.GRILLED_BLUE_MUSHROOM]   = _grilled('Grilled blue mushroom', 9);
  PROPS[B.GRILLED_BLACK_MUSHROOM]  = _grilled('Grilled black mushroom', 10);
  PROPS[B.GRILLED_WHITE_MUSHROOM]  = _grilled('Grilled white mushroom', 11);
  PROPS[B.GRILLED_YELLOW_MUSHROOM] = _grilled('Grilled yellow mushroom', 12);
  /* [x0,y0,z0, x1,y1,z1 in model pixels, side, top, bottom]: each face names its sheet (0-4 of the kind's set,
     -1 none) and the pixel of that sheet its bottom-left corner sits on, so the crown shows the middle of the
     cap's art at the same 8 texels a pixel rather than the whole sheet squeezed. */
  const _SHROOM_STD = [[6, 0, 6, 10, 6, 10,   [3, 0, 0], null,       [4, 0, 0]],      // stem
                       [3, 6, 3, 13, 10, 13,  [1, 0, 0], [0, 0, 0],  [2, 0, 0]],      // cap
                       [5, 10, 5, 11, 12, 11, [1, 2, 2], [0, 2, 2],  null]];          // crown
  const _SHROOM_WHITE = [[7, 0, 7, 9, 11, 9,    [3, 0, 0], null,       [4, 0, 0]],
                         [5, 11, 5, 11, 15, 11, [1, 0, 0], [0, 0, 0],  [2, 0, 0]],
                         [6, 15, 6, 10, 16, 10, [1, 1, 3], [0, 1, 1],  null]];
  // yellow (0.821, textures/Blocks/mushrooms/yellow_mushroom.json): a short stem, a flare (part 5), a wide flat cap
  const _SHROOM_YELLOW = [[6, 0, 6, 10, 4, 10,  [3, 0, 0], null,       [4, 0, 0]],
                          [5, 4, 5, 11, 6, 11,  [5, 0, 0], null,       null],
                          [3, 6, 3, 13, 9, 13,  [1, 0, 0], [0, 0, 0],  [2, 0, 0]]];
  const SHROOM_MODEL = SHROOM_SHAPE.map(s => [_SHROOM_STD, _SHROOM_WHITE, _SHROOM_YELLOW][s]);
  PROPS[B.TALLGRASS]     = { name:'Short grass',   solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',rot:'all',topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,0.9,0.9]], faces:[T.GRASS_PLANT], desc: '' };
  PROPS[B.POPPY]         = { name:'Poppy',   solid:false,opaque:false,raycast:true, pass:1, model:'cross',topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.85,0.75]], faces:[T.POPPY], desc: '' };
  PROPS[B.ORCHID]        = { name:'Blue orchid',solid:false,opaque:false,raycast:true, pass:1, model:'cross',topOnly:true, stack:99, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.85,0.75]], faces:[T.ORCHID], desc: '' };
  PROPS[B.TALL_LOWER]    = { name:'Tall grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, noInv:true, stack:99, type:'grass', hardness:0, boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.TALL_BOT], desc: '' };
  PROPS[B.TALL_UPPER]    = { name:'Tall grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',noInv:true, stack:99, hardness:0, type:'grass', boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.TALL_TOP], desc: '' };
  // faces [+X,-X,top,bottom,+Z,-Z]; front picked per variant (rot:'side') in the mesher
  PROPS[B.CRAFTING_BENCH] = { name:'Crafting bench', solid:true, opaque:true, raycast:true, pass:0, model:'cube', rot:'side', stack:30, hardness:4.5, type:'wood', faces:[T.CRAFT_SIDE,T.CRAFT_SIDE,T.CRAFT_TOP,T.PLANKS,T.CRAFT_FRONT,T.CRAFT_FRONT],
                              desc: 'Keep its top clear: with a block or plant on it, it cannot be used' };   // 0.801
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
  /* 0.834: the fire torch (the old torch, id kept), the unlit one it burns down to, and the crystal torch. `torch`: drawn
     as a stick by emitTorch, hangs on walls, held fattened in the hand. They burn out (56-torches.js): fire 5-10 minutes,
     crystal 15-30; rain puts a fire torch out. Right-click an unlit one with flint or a glow crystal to light it. */
  PROPS[B.TORCH] = { name:'Fire torch', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:99, hardness:0, light:15, handLight:8, topOnly:true, type:'wood', boxes:[[0.4,0,0.4,0.6,0.7,0.6]], rayBoxesByVar: TORCH_RAY_BOXES, faces:[T.TORCH_FIRE], torch:true,
                     desc: 'Carried in the offhand it lights your way; forage with an empty main hand. Burns out in 5-10 minutes; rain puts it out' };   // 0.7992; burns out 0.834
  PROPS[B.TORCH_UNLIT] = { name:'Unlit torch', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:99, hardness:0, topOnly:true, type:'wood', boxes:[[0.4,0,0.4,0.6,0.7,0.6]], rayBoxesByVar: TORCH_RAY_BOXES, faces:[T.TORCH_UNLIT], torch:true,
                     desc: 'Place it, then right-click it with flint to light it, or with a glow crystal for a crystal torch' };
  PROPS[B.CRYSTAL_TORCH] = { name:'Crystal torch', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:99, hardness:0, light:12, handLight:6, coldLight:true, topOnly:true, type:'wood', boxes:[[0.4,0,0.4,0.6,0.7,0.6]], rayBoxesByVar: TORCH_RAY_BOXES, faces:[T.TORCH_CRYSTAL], torch:true,
                     desc: 'A cold blue light: it melts nothing and stays lit under water and in rain. Burns out in 15-30 minutes' };
  // furnace: front picked per variant facing (rot:'side'); lit bit swaps the front tile
  // its top is a chimney since 0.801: an open hole that must stay clear (26-furnace.js)
  PROPS[B.FURNACE] = { name:'Furnace', solid:true, opaque:true, raycast:true, pass:0, model:'cube', rot:'side', stack:30, hardness:8.5, type:'stone',  faces:[T.FURNACE_SIDE,T.FURNACE_SIDE,T.FURNACE_TOP_OPEN,T.FURNACE_TOP,T.FURNACE_FRONT,T.FURNACE_SIDE],
                       desc: 'Keep its top clear: with a block on it, it stops smelting but its fuel still burns away' };
  PROPS[B.RED_SAND] = { name:'Red Sand', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:2.1, type:'ground', faces:[T.RED_SAND_SIDE,T.RED_SAND_SIDE,T.RED_SAND,T.RED_SAND,T.RED_SAND_SIDE,T.RED_SAND_SIDE], desc: '' };   // own sides 0.8091
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
                   stack:1, hardness:1.0, type:'wood', boxes:[[0, 0, 0, 1, 0.5, 1]],   // half a block, as its art (0.8342; 9/16 before)
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
  /* SIX STAGES since 0.827, each kind in its own art at every one: a sprout, a small bush, a bush, the bare bush a
     picked one drops back to, green fruit, ripe. The variant byte's low three bits; a bush saved before 0.827 (four
     stages) reads one of the first four and grows on from there. */
  const BERRY_STAGE = { SPROUT: 0, SMALL: 1, BUSH: 2, EMPTY: 3, FRUITLING: 4, GROWN: 5 };
  const berryStage = (v) => Math.min(BERRY_STAGE.GROWN, v & 7);
  const BERRY_BUSHES = [B.REDBERRY_BUSH, B.BLUEBERRY_BUSH, B.BLACKBERRY_BUSH, B.YELLOWBERRY_BUSH, B.WHITEBERRY_BUSH];
  const isBerryBush = (id) => BERRY_BUSHES.includes(id);
  const _berryBush = (name, kind, extra) => {
    const tiles = []; for (let s = 0; s < BERRY_STAGES; s++) tiles.push(T['BERRY_' + kind + '_S' + s]);
    return { name, solid:false, opaque:false, raycast:true, noTarget:true,
      pass:1, model:'cross', topOnly:true, stack:99, hardness:0, type:'grass',
      boxes:[[0.1,0,0.1,0.9,0.9,0.9]], faces:[tiles[BERRY_STAGE.GROWN]],
      tilesByVar:[...tiles, tiles[5], tiles[5]],         // indexed by stage (6 and 7 never happen: ripe)
      desc: '', ...extra };
  };
  // what each likes and gives (0.827): the berries' own effects are on the items below
  PROPS[B.REDBERRY_BUSH]    = _berryBush('Red berry bush',    'RED',   { desc: 'Grows in forests, most of all high on the mountains.' });
  PROPS[B.BLUEBERRY_BUSH]   = _berryBush('Blue berry bush',   'BLUE',  { desc: 'Grows by water: forest lakes and shores, rarely.' });
  PROPS[B.BLACKBERRY_BUSH]  = _berryBush('Blackberry bush',   'BLACK', { desc: 'Grows in dark, cold forests like the spruce. Its berries are poisonous.' });   // 0.7947 (yellow until 0.8099)
  // the yellow one glows: a little with green fruit, more when ripe (light by stage, 08-light-glow.js)
  PROPS[B.YELLOWBERRY_BUSH] = _berryBush('Yellow berry bush', 'YELLOW', { lightByVar: [0, 0, 0, 0, 3, 7, 7, 7],
                                          desc: 'Grows rarely in the darkest forests and on the dirt of caves, and glows as it ripens.' });
  PROPS[B.WHITEBERRY_BUSH]  = _berryBush('White berry bush',  'WHITE', { desc: 'Grows in light, sunny forests like the birch.' });
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
  /* Stone pebble (0.8095): the flint pebble's shape in plain stone, and the way into the stone age now that a
     flint pickaxe breaks stone without keeping any. Picked up by hand for a pebble; five press into a stone. */
  PROPS[B.STONE_PEBBLE] = { ...PROPS[B.FLINT_ROCK], name:'Stone pebble', faces: Array(6).fill(T.STONE),
                            desc: 'Pick it up by hand for a stone pebble' };
  // the clay bricks block is TERRACOTTA since 0.8093 (same id, same recipe); its brick look is a variant
  PROPS[B.BRICKS]    = { name:'Terracotta', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60, hardness:6.5, type:'stone', faces:[T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS], desc: '' };
  /* Gourds (0.7343) — 32 x 32 x 32 of this game's 64-pixel block, so half a cell across and half
     a cell tall, centred on the floor of its cell rather than filling it. They are FRUIT lying in
     a field, not masonry: you walk straight through one (`solid:false`), the crosshair passes over
     it (`noTarget:true`), and bush pickup is what gathers it — the same stoop-and-grab the berry
     bushes and flint stones use. Built on the `carpet` model, which is just "one box picked by
     variant", so the shape needs no new mesher path. */
  const GOURD_BOX = [[[16 / 64, 0, 16 / 64, 48 / 64, 32 / 64, 48 / 64]]];
  const FULL_UV_BOX = [0, 0, 0, 1, 1, 1];            // a `fullUV` model's UVs: the whole tile on every face (0.824)
  const _gourd = (name, side, top, bottom = top) => ({
    name, solid:false, opaque:false, raycast:true, noTarget:true,
    pass:0, model:'carpet', topOnly:true, stack:60, hardness:2.5, type:'wood',
    boxes:GOURD_BOX[0], boxesByVar:GOURD_BOX,
    faces:[side, side, top, bottom, side, side], desc: '',
  });
  // cantaloupe (0.8091): a third gourd, gathered and sliced like the watermelon
  PROPS[B.CANTALOUPE] = _gourd('Cantaloupe', T.CANTALOUPE_SIDE, T.CANTALOUPE_TOP, T.CANTALOUPE_BOTTOM);
  /* Salt crust (0.8091; a full block since 0.8097): a block that takes the carpet shape and piles and mixes
     like sand or snow — worldgen lays it one layer deep on beach sand at the water's edge. Broken, it gives
     salt (50-loottable.js), and each layer slows you a little (12-player.js). */
  PROPS[B.SALT_CRUST] = { name:'Salt crust', solid:true, opaque:true, raycast:true, pass:0, model:'cube',
                          stack:60, hardness:0.6, type:'ground', faces:Array(6).fill(T.SALT_CRUST), desc: '' };
  /* Ash (0.8191): what fire leaves on the ground. Piles in layers like sand and falls like it; a layer gives ashes
     half the time (50-loottable.js). */
  PROPS[B.ASH] = { name:'Ash', solid:true, opaque:true, raycast:true, pass:0, model:'cube',
                   stack:60, hardness:0.3, type:'ground', faces:Array(6).fill(T.ASH), desc: '' };
  /* Fire (0.8191): a burning cell. It draws nothing — the flames are particles (53-storms.js) — but it is a light
     source, and it is what burns its neighbours: wood, leaves, grass. Never an item. */
  PROPS[B.FIRE] = { name:'Fire', solid:false, opaque:false, raycast:false, noTarget:true, noInv:true, pass:1, model:'none',
                    stack:1, hardness:0, type:'grass', light:13, faces:Array(6).fill(T.ASH), boxes:[[0,0,0,1,1,1]], desc: '' };
  PROPS[B.MELON]    = _gourd('Watermelon', T.MELON_SIDE, T.MELON_TOP);
  PROPS[B.PUMPKIN]  = _gourd('Pumpkin', T.PUMPKIN_SIDE, T.PUMPKIN_TOP);
  /* Carved pumpkin and jack o'lantern (0.824): shears carve a pumpkin where it lies, a torch lights a carved one
     (tryCarvePumpkin, 13-actions.js). The pumpkin's own small model, its face turned to whoever placed or carved it
     (rot:'side' bits 0-1, facesByVar), and the whole picture on each face rather than its middle (fullUV). They keep:
     no spoiling, and unlike the pumpkin they are placed. */
  const _carvedFaces = (front) => [0, 1, 2, 3].map(f => {
    const fs = [T.PUMPKIN_SIDE, T.PUMPKIN_SIDE, T.CARVED_PUMPKIN_TOP, T.PUMPKIN_TOP, T.PUMPKIN_SIDE, T.PUMPKIN_SIDE];
    fs[SIDE_FACE[f]] = front;
    return fs;
  });
  const _carved = (name, front, extra) => ({ ..._gourd(name, T.PUMPKIN_SIDE, T.CARVED_PUMPKIN_TOP, T.PUMPKIN_TOP), rot:'side', fullUV:true,
    boxesByVar:[GOURD_BOX[0], GOURD_BOX[0], GOURD_BOX[0], GOURD_BOX[0]], facesByVar:_carvedFaces(front), faces:_carvedFaces(front)[0], ...extra });
  PROPS[B.CARVED_PUMPKIN] = _carved('Carved pumpkin', T.CARVED_PUMPKIN_FRONT, { desc: 'Right-click it with a torch to light it' });
  PROPS[B.JACK_O_LANTERN] = _carved("Jack o'lantern", T.JACK_O_LANTERN_FRONT, { light: 14 });
  /* Wheat grows (0.81): variant 0 is RIPE, as every wheat the world ever generated is, and 1-7 are the growing
     stages 0-6 (51-seasons.js climbs them). Only ripe wheat gives wheat when gathered. */
  PROPS[B.WHEAT]    = { name:'Wheat', solid:false, opaque:false, raycast:true, noTarget:true, pass:1, model:'cross', stack:99, hardness:0, type:'grass', boxes:[[0.15,0,0.15,0.85,0.9,0.85]], faces:[T.WHEAT],
                        tilesByVar: [T.WHEAT, T.WHEAT_S0, T.WHEAT_S1, T.WHEAT_S2, T.WHEAT_S3, T.WHEAT_S4, T.WHEAT_S5, T.WHEAT_S5], desc: '' };   // six growing stages since 0.8273 (seven before); 7 only in old saves
  PROPS[B.STONE_BRICK]    = { name:'Stone (brick)', noInv:true, solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:60,  hardness:8.5, type:'stone', faces:[T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK], desc: '' };
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
  /* VARIANT BLOCKS (0.7941): the looks the variant bar picks between (46-variants.js). Each is a block of its
     own, hidden from the inventory: in hand it is always its base block with the variant picked, and broken it
     drops that base block. Each is built from the block it plays like (hardness, sound, tool), so one more is
     one line here plus its line in BLOCK_VARIANTS. [id, plays like, name, tile] */
  const VARIANT_BLOCKS = [
    [B.MOSSY_STONE_BRICK,   B.STONE_BRICK,  'Stone (mossy brick)',   T.MOSSY_STONE_BRICK],
    [B.CRACKED_STONE_BRICK, B.STONE_BRICK,  'Stone (cracked brick)', T.CRACKED_STONE_BRICK],
    [B.MOSSY_COBBLE,        B.COBBLE,       'Cobblestone (mossy)',   T.MOSSY_COBBLE],
    [B.SULFUR_BRICKS,       B.SULFUR_BLOCK, 'Sulfur block (brick)',  T.SULFUR_BRICKS],
    [B.GRANITE_BRICKS,      B.GRANITE,      'Granite (brick)',       T.GRANITE_BRICKS],
    [B.MARBLE_BRICKS,       B.MARBLE,       'Marble (brick)',        T.MARBLE_BRICKS],
    [B.LIMESTONE_BRICKS,    B.LIMESTONE,    'Limestone (brick)',     T.LIMESTONE_BRICKS],
    // dolomite's looks, and the mossy brick and polished look of every rock (0.809)
    [B.DOLOMITE_BRICKS,        B.DOLOMITE,  'Dolomite (brick)',        T.DOLOMITE_BRICKS],
    [B.MOSSY_DOLOMITE_BRICKS,  B.DOLOMITE,  'Dolomite (mossy brick)',  T.MOSSY_DOLOMITE_BRICKS],
    [B.POLISHED_DOLOMITE,      B.DOLOMITE,  'Dolomite (polished)',     T.POLISHED_DOLOMITE],
    [B.MOSSY_GRANITE_BRICKS,   B.GRANITE,   'Granite (mossy brick)',   T.MOSSY_GRANITE_BRICKS],
    [B.MOSSY_MARBLE_BRICKS,    B.MARBLE,    'Marble (mossy brick)',    T.MOSSY_MARBLE_BRICKS],
    [B.MOSSY_LIMESTONE_BRICKS, B.LIMESTONE, 'Limestone (mossy brick)', T.MOSSY_LIMESTONE_BRICKS],
    [B.POLISHED_GRANITE,       B.GRANITE,   'Granite (polished)',      T.POLISHED_GRANITE],
    [B.POLISHED_MARBLE,        B.MARBLE,    'Marble (polished)',       T.POLISHED_MARBLE],
    [B.POLISHED_LIMESTONE,     B.LIMESTONE, 'Limestone (polished)',    T.POLISHED_LIMESTONE],
    // 0.8091: polished stone, adobe brick, and four looks of glass
    [B.POLISHED_STONE,         B.STONE,     'Stone (polished)',        T.POLISHED_STONE],
    [B.ADOBE_BRICK,            B.ADOBE,     'Adobe (brick)',           T.ADOBE_BRICK],
    [B.DARK_GLASS,             B.GLASS,     'Glass (dark)',            T.DARK_GLASS],
    [B.GREENHOUSE_GLASS,       B.GLASS,     'Glass (greenhouse)',      T.GREENHOUSE_GLASS],
    [B.GLASS_BRICKS,           B.GLASS,     'Glass (brick)',           T.GLASS_BRICKS],
    [B.DARK_GLASS_BRICKS,      B.GLASS,     'Glass (dark brick)',      T.DARK_GLASS_BRICKS],
    [B.TERRACOTTA_BRICKS,      B.BRICKS,    'Terracotta (brick)',      T.TERRACOTTA_BRICKS],   // 0.8093
    /* 0.833: ice and snow bricks; the snow-ice brick is a look of both (on both bars, 46) and breaks back into snow. The
       brick ones are solid to see through, unlike ice. The bone block's brick has no axis. */
    [B.ICE_BRICKS,             B.ICE,       'Ice (brick)',             T.ICE_BRICKS,      { opaque: true, pass: 0 }],
    [B.SNOW_BRICKS,            B.SNOW,      'Snow (brick)',            T.SNOW_BRICKS],
    [B.SNOW_ICE_BRICKS,        B.SNOW,      'Snow-ice bricks',         T.SNOW_ICE_BRICKS],
    [B.BONE_BRICKS,            B.BONE_BLOCK, 'Bone block (brick)',     T.BONE_BRICKS,     { pillar: false }],
    // band and pillar (0.8093): own tops; a pillar turns to the face it is placed on, like a log
    ...[[B.STONE, 'Stone', 'STONE'], [B.GRANITE, 'Granite', 'GRANITE'], [B.MARBLE, 'Marble', 'MARBLE'],
        [B.LIMESTONE, 'Limestone', 'LIMESTONE'], [B.DOLOMITE, 'Dolomite', 'DOLOMITE']].flatMap(([rock, nm, K], r) => [
      [B[K + '_BAND'],   rock, nm + ' (band)',   DECOR_T[r][0],
        { faces: [DECOR_T[r][0], DECOR_T[r][0], DECOR_T[r][1], DECOR_T[r][1], DECOR_T[r][0], DECOR_T[r][0]] }],
      [B[K + '_PILLAR'], rock, nm + ' (pillar)', DECOR_T[r][2],
        { pillar: true, rot: 'all', faces: [DECOR_T[r][2], DECOR_T[r][2], DECOR_T[r][3], DECOR_T[r][3], DECOR_T[r][2], DECOR_T[r][2]] }]]),
    // the mortar's bowl carved from another rock (0.7945): only the bowl material changes, powder and pestle stay
    [B.GRANITE_MORTAR,   B.MORTAR, 'Mortar and pestle (granite)',   T.GRANITE,   { matFaces: { ...MORTAR_FACES, 1: Array(6).fill(T.GRANITE) } }],
    [B.MARBLE_MORTAR,    B.MORTAR, 'Mortar and pestle (marble)',    T.MARBLE,    { matFaces: { ...MORTAR_FACES, 1: Array(6).fill(T.MARBLE) } }],
    [B.LIMESTONE_MORTAR, B.MORTAR, 'Mortar and pestle (limestone)', T.LIMESTONE, { matFaces: { ...MORTAR_FACES, 1: Array(6).fill(T.LIMESTONE) } }],
    [B.DOLOMITE_MORTAR,  B.MORTAR, 'Mortar and pestle (dolomite)',  T.DOLOMITE,  { matFaces: { ...MORTAR_FACES, 1: Array(6).fill(T.DOLOMITE) } }],   // 0.822
    // brick and polished looks of every sandstone (0.822)
    [B.SANDSTONE_BRICKS,        B.SANDSTONE,      'Sandstone (brick)',          T.SANDSTONE_BRICKS],
    [B.POLISHED_SANDSTONE,      B.SANDSTONE,      'Sandstone (polished)',       T.POLISHED_SANDSTONE],
    [B.RED_SANDSTONE_BRICKS,    B.RED_SANDSTONE,  'Red sandstone (brick)',      T.RED_SANDSTONE_BRICKS],
    [B.POLISHED_RED_SANDSTONE,  B.RED_SANDSTONE,  'Red sandstone (polished)',   T.POLISHED_RED_SANDSTONE],
    [B.PINK_SANDSTONE_BRICKS,   B.PINK_SANDSTONE, 'Pink sandstone (brick)',     T.PINK_SANDSTONE_BRICKS],
    [B.POLISHED_PINK_SANDSTONE, B.PINK_SANDSTONE, 'Pink sandstone (polished)',  T.POLISHED_PINK_SANDSTONE],
    /* a gem cluster on a bed of plain stone instead of its ore (0.7947); mined, it still gives its gems.
       Retired from the variant bar in 0.7948, when the bed moved into the cluster's own variant bits
       (CLUSTER_BEDS): kept only so a cluster placed in 0.7947 still draws and drops right */
    [B.DIAMOND_CLUSTER_STONE,  B.DIAMOND_ORE,  'Diamond cluster (stone)',  T.DIAMOND_BLOCK,  { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
    [B.EMERALD_CLUSTER_STONE,  B.EMERALD_ORE,  'Emerald cluster (stone)',  T.EMERALD_BLOCK,  { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
    [B.RUBY_CLUSTER_STONE,     B.RUBY_ORE,     'Ruby cluster (stone)',     T.RUBY_BLOCK,     { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
    [B.SAPPHIRE_CLUSTER_STONE, B.SAPPHIRE_ORE, 'Sapphire cluster (stone)', T.SAPPHIRE_BLOCK, { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
    [B.TOPAZ_CLUSTER_STONE,    B.TOPAZ_ORE,    'Topaz cluster (stone)',    T.TOPAZ_BLOCK,    { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
  ];
  for (const [id, like, name, tile, extra] of VARIANT_BLOCKS)
    PROPS[id] = { ...PROPS[like], name, noInv: true, faces: [tile, tile, tile, tile, tile, tile], desc: '', ...extra };
  // the door and the ladder are switched off (0.809): no recipe, not in creative. Placed ones still work
  PROPS[B.LADDER].noInv = true;
  // the door is back in the creative palette (0.82421), for building prefabs; its recipe stays removed (25-crafting.js)
  // every brick variant takes what stone brick takes; mossy cobblestone what cobblestone takes
  const _BRICK_VARIANTS = [B.MOSSY_STONE_BRICK, B.CRACKED_STONE_BRICK, B.SULFUR_BRICKS,
                           B.GRANITE_BRICKS, B.MARBLE_BRICKS, B.LIMESTONE_BRICKS,
                           B.DOLOMITE_BRICKS, B.MOSSY_DOLOMITE_BRICKS, B.POLISHED_DOLOMITE,          // 0.809
                           B.MOSSY_GRANITE_BRICKS, B.MOSSY_MARBLE_BRICKS, B.MOSSY_LIMESTONE_BRICKS,
                           B.POLISHED_GRANITE, B.POLISHED_MARBLE, B.POLISHED_LIMESTONE,
                           B.POLISHED_STONE, B.ADOBE, B.ADOBE_BRICK,                                   // 0.8091
                           B.TERRACOTTA_BRICKS, B.STONE_BAND, B.STONE_PILLAR, B.GRANITE_BAND, B.GRANITE_PILLAR,   // 0.8093
                           B.MARBLE_BAND, B.MARBLE_PILLAR, B.LIMESTONE_BAND, B.LIMESTONE_PILLAR, B.DOLOMITE_BAND, B.DOLOMITE_PILLAR,
                           B.PINK_SANDSTONE, B.SANDSTONE_BRICKS, B.POLISHED_SANDSTONE, B.RED_SANDSTONE_BRICKS,   // 0.822
                           B.POLISHED_RED_SANDSTONE, B.PINK_SANDSTONE_BRICKS, B.POLISHED_PINK_SANDSTONE];
  // the glass looks take what glass takes (0.8091)
  const _GLASS_VARIANTS = [B.DARK_GLASS, B.GREENHOUSE_GLASS, B.GLASS_BRICKS, B.DARK_GLASS_BRICKS];
  const _ALL_PLANKS = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.RIME_PLANKS];   // rime 0.836
  /* 0.8261: the four rocks and every look of them (brick, mossy brick, polished, band, pillar) take slabs, stairs and
     panes; every look of the three sandstones takes panes; glowstone and the glowcrystal block slabs and panes;
     obsidian slabs, stairs and panes; wool slabs and stairs; stone and the tin block walls. Adobe and terracotta lost
     the cover, the iron and gold blocks the carpet, the iron block the fence. */
  const _ROCKS = [B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE];
  const _ROCK_LOOKS = [B.GRANITE_BRICKS, B.MOSSY_GRANITE_BRICKS, B.POLISHED_GRANITE, B.GRANITE_BAND, B.GRANITE_PILLAR,
                       B.MARBLE_BRICKS, B.MOSSY_MARBLE_BRICKS, B.POLISHED_MARBLE, B.MARBLE_BAND, B.MARBLE_PILLAR,
                       B.LIMESTONE_BRICKS, B.MOSSY_LIMESTONE_BRICKS, B.POLISHED_LIMESTONE, B.LIMESTONE_BAND, B.LIMESTONE_PILLAR,
                       B.DOLOMITE_BRICKS, B.MOSSY_DOLOMITE_BRICKS, B.POLISHED_DOLOMITE, B.DOLOMITE_BAND, B.DOLOMITE_PILLAR];
  const _SANDSTONES = [B.SANDSTONE, B.RED_SANDSTONE, B.PINK_SANDSTONE, B.SANDSTONE_BRICKS, B.POLISHED_SANDSTONE,
                       B.RED_SANDSTONE_BRICKS, B.POLISHED_RED_SANDSTONE, B.PINK_SANDSTONE_BRICKS, B.POLISHED_PINK_SANDSTONE];
  const _GLOWS = [B.GLOWSTONE, B.GLOWCRYSTAL_BLOCK, B.GLOWSTONE_SPENT, B.GLOWCRYSTAL_SPENT];   // spent: a shape burns out as itself (0.834)
  const _NO_COVER = new Set([B.ADOBE, B.ADOBE_BRICK, B.BRICKS, B.TERRACOTTA_BRICKS]);
  /* 0.8265: hay takes slabs, stairs and carpets (thatch roofs, a straw floor); the copper block slabs, stairs and panes;
     the iron, gold and tin blocks slabs and panes; dirt slabs and stairs; the snow block slabs, stairs and walls; obsidian
     walls; the coal, charcoal and gem blocks slabs. A shaped snow block is built, not fallen: it does not melt. */
  const _METALS = [B.IRON_BLOCK, B.GOLD_BLOCK, B.TIN_BLOCK, B.COPPER_BLOCK];
  const _GEM_COAL = [B.COAL_BLOCK, B.CHARCOAL_BLOCK, B.DIAMOND_BLOCK, B.EMERALD_BLOCK, B.RUBY_BLOCK, B.SAPPHIRE_BLOCK, B.TOPAZ_BLOCK];
  const SHAPE_BLOCKS = {
    slab:   [B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS, B.STONE_BRICK, B.GLASS, B.SANDSTONE, B.RED_SANDSTONE,
             ..._BRICK_VARIANTS, B.MOSSY_COBBLE, ..._GLASS_VARIANTS,
             ..._ROCKS, ..._GLOWS, B.OBSIDIAN, B.WOOL, B.SULFUR_BLOCK,                         // 0.8261; sulfur 0.8264
             B.HAY, ..._METALS, B.DIRT, B.SNOW, ..._GEM_COAL, B.ICE],                          // 0.8265; ice 0.833 (it takes snow's, for the snow-ice brick both share)
    stairs: [B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS, B.STONE_BRICK, B.GLASS, B.SANDSTONE, B.RED_SANDSTONE,
             ..._BRICK_VARIANTS, B.MOSSY_COBBLE, ..._GLASS_VARIANTS,
             ..._ROCKS, B.OBSIDIAN, B.WOOL, B.SULFUR_BLOCK,                                    // 0.8261; sulfur 0.8264
             B.HAY, B.COPPER_BLOCK, B.DIRT, B.SNOW, B.ICE],                                    // 0.8265; ice 0.833
    pane:   [B.WOOL, B.GLASS, ..._ALL_PLANKS, B.STONE, B.COBBLE, B.BRICKS, B.MOSSY_COBBLE, ..._GLASS_VARIANTS,   // 0.784
             ..._ROCKS, ..._ROCK_LOOKS, ..._SANDSTONES, ..._GLOWS, B.OBSIDIAN, B.SULFUR_BLOCK,    // 0.8261; sulfur 0.8264
             ..._METALS],                                                                      // 0.8265
    fence:  [..._ALL_PLANKS, B.BRICKS, B.COPPER_BLOCK],                                       // 0.784; iron off 0.8261
    layer:  [B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL,   // pink 0.822; rime 0.836
             B.FIBER_BLOCK, B.SALT_CRUST, B.ASH,   // 0.785; salt 0.8097; ash 0.8191
             B.WOOL, ..._ALL_PLANKS, B.STONE, B.COBBLE, B.MOSSY_COBBLE,                        // iron and gold off 0.8261, glass 0.8263
             B.HAY, B.ICE],                                                                    // 0.8265; ice 0.833
    cover:  [B.DIRT, B.GRASS, B.STONE, B.COBBLE, ..._ALL_PLANKS, B.STONE_BRICK, B.BRICKS,              // 0.787
             B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE, B.SANDSTONE, B.RED_SANDSTONE, ..._BRICK_VARIANTS, B.MOSSY_COBBLE]
             .filter(b => !_NO_COVER.has(b)),                                                  // adobe, terracotta off 0.8261
    wall:   [B.COBBLE, B.STONE_BRICK, B.BRICKS, B.IRON_BLOCK, B.COPPER_BLOCK, B.GOLD_BLOCK,          // 0.787
             B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE, B.WOOL, B.SANDSTONE, B.RED_SANDSTONE, ..._BRICK_VARIANTS, B.MOSSY_COBBLE,
             B.STONE, B.TIN_BLOCK, B.SULFUR_BLOCK,                                             // 0.8261; sulfur 0.8264
             B.OBSIDIAN, B.SNOW, B.ICE],                                                       // 0.8265; ice 0.833
  };
  const LAYER_STACKING = [B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL, B.FIBER_BLOCK, B.SALT_CRUST, B.ASH];   // salt 0.8097, ash 0.8191
  for (const fam in SHAPE_BLOCKS)
    for (const b of SHAPE_BLOCKS[fam]) (PROPS[b].shapes || (PROPS[b].shapes = {}))[fam] = true;
  /* EVERY LOOK OF A BLOCK TAKES THE SAME SHAPES (0.8263): its default's. One list per block, its default first,
     then the looks the variant bar lays it as (BLOCK_VARIANTS, 46-variants.js, which checks the two agree), so a
     brick or a polished look can never take a shape its plain block does not, or miss one it does. */
  const VARIANT_FAMILIES = [
    [B.STONE, B.STONE_BRICK, B.MOSSY_STONE_BRICK, B.CRACKED_STONE_BRICK, B.POLISHED_STONE, B.STONE_BAND, B.STONE_PILLAR],
    [B.COBBLE, B.MOSSY_COBBLE],
    [B.GLASS, ..._GLASS_VARIANTS],
    [B.ADOBE, B.ADOBE_BRICK],
    [B.BRICKS, B.TERRACOTTA_BRICKS],
    [B.SULFUR_BLOCK, B.SULFUR_BRICKS],
    ...['GRANITE', 'MARBLE', 'LIMESTONE', 'DOLOMITE'].map(K =>
      [B[K], B[K + '_BRICKS'], B['MOSSY_' + K + '_BRICKS'], B['POLISHED_' + K], B[K + '_BAND'], B[K + '_PILLAR']]),
    ...['', 'RED_', 'PINK_'].map(K => [B[K + 'SANDSTONE'], B[K + 'SANDSTONE_BRICKS'], B['POLISHED_' + K + 'SANDSTONE']]),
    [B.GLASSY_SAND, B.GLASSY_RED_SAND, B.GLASSY_PINK_SAND],
    [B.MORTAR, B.GRANITE_MORTAR, B.MARBLE_MORTAR, B.LIMESTONE_MORTAR, B.DOLOMITE_MORTAR],
    [B.ICE, B.ICE_BRICKS], [B.SNOW, B.SNOW_BRICKS, B.SNOW_ICE_BRICKS], [B.BONE_BLOCK, B.BONE_BRICKS],   // 0.833
  ];
  for (const [base, ...looks] of VARIANT_FAMILIES)
    for (const id of looks) {
      if (PROPS[base].shapes) PROPS[id].shapes = { ...PROPS[base].shapes };
      else delete PROPS[id].shapes;
    }
  /* FURNACE CHIMNEYS (0.827): a single column of WALLS of any rock (stone, cobblestone, granite, marble, limestone,
     dolomite, in any of their looks) standing on a furnace is its chimney, up to CHIMNEY_MAX high. The furnace's own
     chimney cap sits on top of it, and the smoke leaves from there (fxFurnace, 49-particles.js). */
  const CHIMNEY_MAX = 6;
  const CHIMNEY_ROCKS = new Set(VARIANT_FAMILIES.filter(f => [B.STONE, B.COBBLE, B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE].includes(f[0])).flat());
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
  /* MIXED SLABS (0.8263): two halves of DIFFERENT blocks in one cell, kept the way a mixed carpet stack is. The variant
     byte is SHAPE_SLAB_MIX + the low half's rotation (0, 2 or 4: bottom, -X, -Z), and the two ids, low then high, live
     beside the chunk in the same list a mixed stack uses (LAYER_STACKS, 11-chunks.js). To everything but the mesher,
     the crosshair and breaking (both halves, 11-chunks.js) the cell is a full block: shapeOfVal says null.
     Glass and glowstone mix too since 0.8264, through the rotation's two spare bits:
       SLAB_MIX_SEE  (8)  a half is see-through (glass): the cell lets light and its neighbours' faces through
       SLAB_MIX_HIGH (1)  the cell's id is the HIGH half's block, not the low one's: the half that glows (the
                          brighter, if both do), since a cell's light comes from its id */
  const SHAPE_SLAB_MIX = 0x90, SLAB_MIX_SEE = 8, SLAB_MIX_HIGH = 1;
  const slabMixed = (v) => ((((v >> 8) & 255) & SHAPE_MASK) === SHAPE_SLAB_MIX) && !!PROPS[v & 255]?.shapes?.slab;
  // the value of a mixed slab of `low` and `high`, the low half at even rotation `rot`
  const slabMixVal = (low, rot, high = low) => {
    const pl = PROPS[low], ph = PROPS[high];
    const hi = (ph.light || 0) > (pl.light || 0);
    const bits = (rot & 6) | (!pl.opaque || !ph.opaque ? SLAB_MIX_SEE : 0) | (hi ? SLAB_MIX_HIGH : 0);
    return ((hi ? high : low) | ((SHAPE_SLAB_MIX + bits) << 8)) >>> 0;
  };
  const slabsMix = (a, b) => a !== b && [a, b].every(id => { const p = PROPS[id];
    return !!p && !!p.shapes && !!p.shapes.slab && p.solid && p.model === 'cube'; });
  // the two halves' boxes, low then high
  const slabMixBoxes = (v) => { const r = ((v >> 8) & ROT_MASK) & 6; return [SLAB_HALF[r], SLAB_HALF[r + 1]]; };
  // a value whose blocks are listed beside the chunk: a mixed carpet stack or a mixed slab
  const sideListed = (v) => layerMixed(v) || slabMixed(v);
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
    return !!p && !!p.opaque && !(((v >> 8) & 255) && p.shapes && shapeOfVal(v))
      && !(slabMixed(v) && ((v >> 8) & SLAB_MIX_SEE));                // a mixed slab with a glass half (0.8264)
  };
  /* ...but it is not nothing either (0.819): light LEAVING a shaped cell of an opaque block loses this many levels
     more than the usual one, so a slab roof shades what is under it and a stack of layers darkens by its depth.
     The cell itself keeps the light that reached it, so a slab's own top still reads as lit. Glass, leaves and
     the like are see-through as full blocks and stay so as shapes. */
  const SHAPE_DIM = { slab: 4, stairs: 6, pane: 2, fence: 1, wall: 2, cover: 2 };
  const lightDim = (v) => {
    const va = (v >> 8) & 255;
    if (!va) return 0;
    const p = PROPS[v & 255];
    if (!p || !p.opaque || !p.shapes) return 0;
    /* Layer stacks hold nothing back (0.8196; 0.819 dimmed them by depth): snow, litter, ash and sand piles change
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
    return stairBoxesAt(g, x, y, z, v);
  }

  /* HOLLOW LOGS (0.7842). A log with its heart gone: a bark shell 2/16 thick, open at both ends, lying along
     the axis in its variant like a log (bits 0-1: 0 Y, 1 X, 2 Z). Bits 2-4 index HOLLOW_FILLS, what has been
     packed inside, so an upright one works as a planter. The ends use the log's ring texture, which at the
     shell's thickness is just the bark rim; the inside walls are bark too. Walls are authored standing up
     and turned onto the axis; on a lying log the bark is turned as well, so its grain runs along the log. */
  const HOLLOW_FILLS = [0, B.DIRT, B.GRASS, B.SAND, B.RED_SAND];
  // the ±Z walls stop 2 short of each corner (0.794), leaving the square 2-pixel notch a log's edges have
  const HOLLOW_WALLS = [[2,0,0,14,16,2], [2,0,14,14,16,16], [0,0,2,2,16,14], [14,0,2,16,16,14]].map(b => b.map(n => n / 16));
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
                                            [B.HOLLOW_SPRUCE_LOG, 'Hollow spruce log', B.SPRUCE_LOG, B.STRIPPED_SPRUCE_LOG],
                                            [B.HOLLOW_RIME_LOG, 'Hollow rime log', B.RIME_LOG, B.STRIPPED_RIME_LOG]]) {   // 0.836
    PROPS[bid] = { name, solid:true, opaque:false, raycast:true, pass:0, model:'hollow', rot:'all', stack:60, hardness:3.0,
                   type:'wood', faces:PROPS[log].faces.slice(), innerTile:PROPS[stripped].faces[0],   // inside: stripped wood (0.7844)
                   boxesOf:hollowBoxes, desc:'Fill it with dirt, grass or sand to plant in it' };
    PROPS[bid].boxes = hollowBoxes(bid);
  }

  return { T, FURNACE_T, FURNACE_ROCK_N, BENCH_WOOD_N, BENCH_T, SHROOM_T, DECOR_T, BERRY_KINDS, BERRY_STAGES,
           CAVE_DIRT_AT, CAVE_YELLOW_BUSH, ICE_FROM_WATER, CANE_STEPS, CANE_JOIN_LEFT, B, V, SIDE_FACE,
           furnaceRockOf, benchWoodOf, furnaceTile, benchTile, PROPS, LOG_W_MIN, LOG_W_MAX, LOG_W_BLOCK,
           LOG_W_NORMAL, logWidthPx, logWidthOf, LOG_BEVEL, logCutBox, LOG_CUT_COLL, SLAB_HALF, WALL_T, WALL_VAR,
           CLUSTER_DIRS, CLUSTER_LAYOUTS, _clusterLayout, CLUSTER_UP, _clusterTurn, CLUSTER_BOXES, CLUSTER_HIT,
           CLUSTER_BED_SHIFT, CLUSTER_BEDS, CLUSTER_BED_OF, MORTAR_VOX, MORTAR_S, MORTAR_C, MORTAR_FACES,
           MORTAR_BOXES, SHROOM_SHAPE, _shroom, SHROOM_WHERE, _anyShroom, _grilled, _SHROOM_STD, _SHROOM_WHITE,
           _SHROOM_YELLOW, SHROOM_MODEL, TORCH_RAY_BOXES, STAIR_BOXES, STAIR_DIR, STAIR_OPP, STAIR_CCW, STAIR_CF,
           stairVarOf, stairBoxesAt, BERRY_STAGE, berryStage, BERRY_BUSHES, isBerryBush, _berryBush, FR,
           FLINT_ROCK_BOX, GOURD_BOX, FULL_UV_BOX, _gourd, _carvedFaces, _carved, SHAPE_SLAB, SHAPE_STAIRS,
           SHAPE_PANE, SHAPE_FENCE, SHAPE_MASK, ROT_MASK, SHAPE_LAYER, SHAPE_LAYER_MIX, LAYER_MAX, SHAPE_COVER,
           SHAPE_WALL, VARIANT_BLOCKS, _BRICK_VARIANTS, _GLASS_VARIANTS, _ALL_PLANKS, _ROCKS, _ROCK_LOOKS,
           _SANDSTONES, _GLOWS, _NO_COVER, _METALS, _GEM_COAL, SHAPE_BLOCKS, LAYER_STACKING, VARIANT_FAMILIES,
           CHIMNEY_MAX, CHIMNEY_ROCKS, chimneyWall, chimneyHeight, layerCount, layerMixed, layerVal,
           SHAPE_SLAB_MIX, SLAB_MIX_SEE, SLAB_MIX_HIGH, slabMixed, slabMixVal, slabsMix, slabMixBoxes, sideListed,
           LAYER_BOX, NO_BOXES, solidVal, SHAPE_FAMILY, shapeOfVal, PANE_BOX, _s16, _mirX, _mirZ, _swapXZ,
           FENCE_POST, FENCE_POST_COLL, FENCE_ARM, FENCE_DIAG, FENCE_ARM_COLL, FENCE_DIAG_COLL, FENCE_DIRS,
           _fenceArm, _joinSpec, FENCE_SPEC, WALL_SPEC, joinBoxesAt, COVER_BOX, opaqueVal, SHAPE_DIM, lightDim,
           shapeBoxesAt, HOLLOW_FILLS, HOLLOW_WALLS, HOLLOW_CORE_UP, HOLLOW_CORE_LYING, HOLLOW_SWAP, HOLLOW_INNER,
           _hollowOnAxis, _hollowParts, _hollowBoxes, hollowParts, hollowBoxes };
}
const BLOCKS = BLOCK_CORE();
