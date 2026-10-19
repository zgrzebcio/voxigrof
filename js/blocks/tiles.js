'use strict';
/* blocks/tiles.js: every tile's number (T) and the tile sets made by rule (a furnace per rock, a bench per wood,
   mushroom parts, bands and pillars, berry stages), the variant bits (V), and the PROPS table the next parts fill.
   A tile's number must match its place in ATLAS_TILES (03-atlas.js); boot logs an error if they disagree.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* A furnace per rock and a crafting bench per wood, numbered on from 145 in the order
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
  // sand sides, polished stone, adobe, the glass looks, salt crust, cantaloupe — on from 190
  Object.assign(T, { SAND_SIDE:190, RED_SAND_SIDE:191, POLISHED_STONE:192, ADOBE:193, ADOBE_BRICK:194,
                     DARK_GLASS:195, GREENHOUSE_GLASS:196, GLASS_BRICKS:197, DARK_GLASS_BRICKS:198, SALT_CRUST:199,
                     CANTALOUPE_SIDE:200, CANTALOUPE_TOP:201, CANTALOUPE_BOTTOM:202 });
  /* The mushroom models, from 203: per kind [cap top, cap side, cap bottom, stem side, stem top], kinds
     in MUSHROOM_KINDS order (01-textures-data.js): red, brown, blue, black, lava, white tall. */
  const SHROOM_T = [];
  for (let k = 0, t = 203; k < 6; k++) {
    const set = [];
    for (let p = 0; p < 5; p++, t++) { set.push(t); T['SHROOM_' + k + '_' + p] = t; }
    SHROOM_T.push(set);
  }
  // flowing water and lava (animated like the still ones), terracotta's brick look
  Object.assign(T, { WATER_FLOW:233, LAVA_FLOW:234, TERRACOTTA_BRICKS:235 });
  /* Band and pillar for every rock, from 236: per rock [band side, band top, pillar side, pillar top],
     rocks in DECOR_ROCKS order (01-textures-data.js): stone, granite, marble, limestone, dolomite. */
  const DECOR_T = [];
  for (let r = 0, t = 236; r < 5; r++) {
    const set = [];
    for (let p = 0; p < 4; p++, t++) { set.push(t); T['DECOR_' + r + '_' + p] = t; }
    DECOR_T.push(set);
  }
  // wheat's growth stages, 256-262
  for (let s = 0; s < 7; s++) T['WHEAT_S' + s] = 256 + s;
  T.ASH = 263;                                                     // ash, what fire leaves
  /* the yellow mushroom (kind 6) and the grilled ones (7-12: red, brown, blue, black, white, yellow), from 264,
     their part tiles in MUSHROOM_KINDS order; the yellow shape has a sixth, the flare between stem and cap */
  for (let k = 6, t = 264; k < 13; k++) {
    const set = [];
    for (let p = 0, n = (k === 6 || k === 12) ? 6 : 5; p < n; p++, t++) { set.push(t); T['SHROOM_' + k + '_' + p] = t; }
    SHROOM_T.push(set);
  }
  // pink sand (top, side), pink sandstone, and the brick and polished looks of all three sandstones, from 301
  Object.assign(T, { PINK_SAND:301, PINK_SAND_SIDE:302, PINK_SANDSTONE:303, SANDSTONE_BRICKS:304, POLISHED_SANDSTONE:305,
                     RED_SANDSTONE_BRICKS:306, POLISHED_RED_SANDSTONE:307, PINK_SANDSTONE_BRICKS:308, POLISHED_PINK_SANDSTONE:309 });
  /* the grass in a warm climate (pale, dry) and a cold one (dark, cool), from 310, built at atlas build (03):
     block top, block side, tall grass bottom and top, short grass — warm then cold of each */
  Object.assign(T, { GRASS_TOP_WARM:310, GRASS_TOP_COLD:311, GRASS_SIDE_WARM:312, GRASS_SIDE_COLD:313,
                     TALL_BOT_WARM:314, TALL_BOT_COLD:315, TALL_TOP_WARM:316, TALL_TOP_COLD:317,
                     GRASS_PLANT_WARM:318, GRASS_PLANT_COLD:319 });
  // lightning-struck sand; the carved pumpkin's face and top, and the lit one's face
  Object.assign(T, { GLASSY_SAND:320, CARVED_PUMPKIN_FRONT:321, CARVED_PUMPKIN_TOP:322, JACK_O_LANTERN_FRONT:323,
                     GLASSY_RED_SAND:324, GLASSY_PINK_SAND:325 });   // 0.8241
  /* every berry bush's own six growth stages, from 326: per kind (BERRY_KINDS) stage 0 sprout .. 5 ripe,
     textures/Billboards/Plants/Berry_bush/<Kind>/<kind>_berry_stage<n>.png (BERRY_COLORS, 01-textures-data.js) */
  const BERRY_KINDS = ['RED', 'BLUE', 'BLACK', 'YELLOW', 'WHITE'], BERRY_STAGES = 6;
  // dirt patches in caves, and how often a yellow berry bush stands on their floor (genChunk)
  const CAVE_DIRT_AT = 0.3, CAVE_YELLOW_BUSH = 0.0072;   // 20% more since 0.8272 (0.006);   // ~14% of cave floor is dirt; a bush every couple of chunks
  BERRY_KINDS.forEach((k, i) => { for (let s = 0; s < BERRY_STAGES; s++) T['BERRY_' + k + '_S' + s] = 326 + i * BERRY_STAGES + s; });
  // sugar cane's growing stages 0-4 (stage 5 is T.SUGAR_CANE) and a grown column's bottom, middle and top
  Object.assign(T, { SUGAR_CANE_S0:356, SUGAR_CANE_S1:357, SUGAR_CANE_S2:358, SUGAR_CANE_S3:359, SUGAR_CANE_S4:360,
                     SUGAR_CANE_BOTTOM:361, SUGAR_CANE_MIDDLE:362, SUGAR_CANE_TOP:363 });
  T.ICE = 364;                                                     // 0.8321
  Object.assign(T, { ICE_BRICKS:365, SNOW_BRICKS:366, SNOW_ICE_BRICKS:367, BONE_BLOCK_SIDE:368, BONE_BLOCK_TOP:369, BONE_BRICKS:370 });   // 0.833
  // the three torches at 128px, and the spent glow blocks (grey copies built at atlas build, 03)
  Object.assign(T, { TORCH_FIRE:371, TORCH_UNLIT:372, TORCH_CRYSTAL:373, GLOWSTONE_SPENT:374, GLOWCRYSTAL_SPENT:375 });
  T.PACKED_ICE = 376;                                                                  // 0.835
  Object.assign(T, { WATER_FLOW_FAST:377, WATER_FALL:378 });                          // the flow art run faster, for steep water and falls
  // rime wood, the frozen trees of the Coldest Deep Snow
  Object.assign(T, { RIME_LOG:379, RIME_LOG_TOP:380, STRIPPED_RIME_LOG:381, STRIPPED_RIME_LOG_TOP:382, RIME_PLANKS:383, RIME_LEAVES:384 });
  // 0.84: palm wood and its sapling; the desert's dry grass (short, tall bottom and top) and dry bush
  Object.assign(T, { PALM_LOG:385, PALM_LOG_TOP:386, STRIPPED_PALM_LOG:387, STRIPPED_PALM_LOG_TOP:388, PALM_PLANKS:389, PALM_LEAVES:390,
                     PALM_SAPLING:391, DRY_GRASS:392, DRY_TALL_BOT:393, DRY_TALL_TOP:394, DRY_BUSH:395 });
  // the Dryland's pale grass block (top, side) and its dry leaves, all built at atlas build from the usual art (03)
  Object.assign(T, { GRASS_TOP_DRY:396, GRASS_SIDE_DRY:397, DRY_LEAVES:398 });
  // acacia wood, the Savanna's tree; the Savanna's golden grass block (top, side), built at atlas build (03)
  Object.assign(T, { ACACIA_LOG:399, ACACIA_LOG_TOP:400, STRIPPED_ACACIA_LOG:401, STRIPPED_ACACIA_LOG_TOP:402, ACACIA_PLANKS:403,
                     ACACIA_LEAVES:404, GRASS_TOP_SAV:405, GRASS_SIDE_SAV:406 });
  // the acacia's sapling; the short grass (the smallest grass plant) and its warm and cold look, built at atlas build (03)
  Object.assign(T, { ACACIA_SAPLING:407, SHORT_GRASS_PLANT:408, SHORT_GRASS_PLANT_WARM:409, SHORT_GRASS_PLANT_COLD:410 });
  /* Ice that froze from water carries ICE_FROM_WATER in its variant: only that ice breaks or melts back into water
     and thaws in spring. Ice a player or a structure put down breaks into nothing and stays. */
  const ICE_FROM_WATER = 1;
  /* A cane's variant bits 0-2: steps it still has to grow, CANE_STEPS a sprout .. 0 grown (the world's and old saves').
     A neighbour above joins the column once it has stalks (CANE_JOIN_LEFT steps left or fewer). Growth: seasons/seasons.js. */
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
              /* Berry bushes (split in two in 0.7332): TWO blocks, one per fruit, each
                 running the same four growth stages in its variant byte. Red keeps id 82 so
                 existing worlds are untouched. */
              REDBERRY_BUSH:82,
              // flint stone: a dark nodule lying on the turf, picked by hand for flint
              FLINT_ROCK:83,
              BLUEBERRY_BUSH:84,
              // glow vine hanging on cave walls, and the block its crystals make
              GLOW_VINE:85, GLOWCRYSTAL_BLOCK:86,
              // cave cobwebs and the three gem ores
              COBWEB:87, EMERALD_ORE:88, RUBY_ORE:89, SAPPHIRE_ORE:90,
              // storage blocks: ten of a material pressed into one
              COAL_BLOCK:91, CHARCOAL_BLOCK:92, IRON_BLOCK:93, GOLD_BLOCK:94, TIN_BLOCK:95, COPPER_BLOCK:96,
              DIAMOND_BLOCK:97, EMERALD_BLOCK:98, RUBY_BLOCK:99, SAPPHIRE_BLOCK:100,
              RAW_IRON_BLOCK:101, RAW_GOLD_BLOCK:102, RAW_TIN_BLOCK:103, RAW_COPPER_BLOCK:104,
              // topaz, sandstones, the fiber block and the ladder
              TOPAZ_ORE:105, TOPAZ_BLOCK:106, SANDSTONE:107, RED_SANDSTONE:108, FIBER_BLOCK:109, LADDER:110,
              BLUE_MUSHROOM:111,                                      // 0.7691
              MORTAR:112,                                             // 0.77
              // hollow logs: bark shells that hold soil or sand. 113-124 stay unused, see below
              HOLLOW_LOG:125, HOLLOW_BIRCH_LOG:126, HOLLOW_SPRUCE_LOG:127,
              // variant blocks: other looks of a block, picked on the variant bar and never an item
              MOSSY_STONE_BRICK:128, CRACKED_STONE_BRICK:129, MOSSY_COBBLE:130, SULFUR_BRICKS:131,
              GRANITE_BRICKS:132, MARBLE_BRICKS:133, LIMESTONE_BRICKS:134,
              GRANITE_MORTAR:135, MARBLE_MORTAR:136, LIMESTONE_MORTAR:137,           // 0.7945
              BLACKBERRY_BUSH:138,                                                   // 0.7947 (YELLOWBERRY_BUSH until 0.827)
              // gem clusters on a plain stone bed, a variant
              DIAMOND_CLUSTER_STONE:139, EMERALD_CLUSTER_STONE:140, RUBY_CLUSTER_STONE:141,
              SAPPHIRE_CLUSTER_STONE:142, TOPAZ_CLUSTER_STONE:143,
              // dolomite, a rock like marble and limestone, and the looks of every rock
              DOLOMITE:144, DOLOMITE_BRICKS:145, MOSSY_DOLOMITE_BRICKS:146, POLISHED_DOLOMITE:147,
              MOSSY_GRANITE_BRICKS:148, MOSSY_MARBLE_BRICKS:149, MOSSY_LIMESTONE_BRICKS:150,
              POLISHED_GRANITE:151, POLISHED_MARBLE:152, POLISHED_LIMESTONE:153,
              // polished stone, adobe, the glass looks, salt crust, cantaloupe, three more mushrooms
              POLISHED_STONE:154, ADOBE:155, ADOBE_BRICK:156,
              DARK_GLASS:157, GREENHOUSE_GLASS:158, GLASS_BRICKS:159, DARK_GLASS_BRICKS:160,
              SALT_CRUST:161, CANTALOUPE:162, BLACK_MUSHROOM:163, LAVA_MUSHROOM:164, WHITE_TALL_MUSHROOM:165,
              // terracotta's brick look; band and pillar looks of every rock
              TERRACOTTA_BRICKS:166,
              STONE_BAND:167, STONE_PILLAR:168, GRANITE_BAND:169, GRANITE_PILLAR:170, MARBLE_BAND:171,
              MARBLE_PILLAR:172, LIMESTONE_BAND:173, LIMESTONE_PILLAR:174, DOLOMITE_BAND:175, DOLOMITE_PILLAR:176,
              STONE_PEBBLE:177,                                                       // 0.8095
              ASH:178, FIRE:179,                                                      // 0.8191
              // the yellow mushroom, and the grilled mushrooms (food from a furnace, never placed)
              YELLOW_MUSHROOM:180, GRILLED_RED_MUSHROOM:181, GRILLED_BROWN_MUSHROOM:182, GRILLED_BLUE_MUSHROOM:183,
              GRILLED_BLACK_MUSHROOM:184, GRILLED_WHITE_MUSHROOM:185, GRILLED_YELLOW_MUSHROOM:186,
              // pink sand and its sandstone; brick and polished sandstone looks (variants); the dolomite mortar
              PINK_SAND:187, PINK_SANDSTONE:188, SANDSTONE_BRICKS:189, POLISHED_SANDSTONE:190, RED_SANDSTONE_BRICKS:191,
              POLISHED_RED_SANDSTONE:192, PINK_SANDSTONE_BRICKS:193, POLISHED_PINK_SANDSTONE:194, DOLOMITE_MORTAR:195,
              // sand fused by lightning; the carved pumpkin and the jack o'lantern
              GLASSY_SAND:196, CARVED_PUMPKIN:197, JACK_O_LANTERN:198,
              GLASSY_RED_SAND:199, GLASSY_PINK_SAND:200,                               // 0.8241
              YELLOWBERRY_BUSH:201, WHITEBERRY_BUSH:202,                               // the real yellow, and white
              ICE:203,                                                                 // 0.8321
              // ice and snow bricks, the snow-ice brick both share; the bone block and its brick
              ICE_BRICKS:204, SNOW_BRICKS:205, SNOW_ICE_BRICKS:206, BONE_BLOCK:207, BONE_BRICKS:208,
              // the burnt-out torch, the cold crystal torch, and the two glow blocks gone dark
              TORCH_UNLIT:209, CRYSTAL_TORCH:210, GLOWSTONE_SPENT:211, GLOWCRYSTAL_SPENT:212,
              PACKED_ICE:213,                                                          // the ice spikes' ice
              // rime wood, the Coldest Deep Snow's frozen trees (no sapling yet)
              RIME_LOG:214, STRIPPED_RIME_LOG:215, RIME_PLANKS:216, RIME_LEAVES:217, HOLLOW_RIME_LOG:218,
              // 0.84: palm wood (oases and warm shores), its sapling, and the desert's dry plants
              PALM_LOG:219, STRIPPED_PALM_LOG:220, PALM_PLANKS:221, PALM_LEAVES:222, PALM_SAPLING:223,
              DRY_GRASS:224, DRY_TALL_LOWER:225, DRY_TALL_UPPER:226, DRY_BUSH:227,
              DRY_LEAVES:228,                                                          // the Dryland's big dry bushes
              METAL_CHEST:229,                                                         // iron / copper / gold chest
              // acacia wood (the Savanna's tree, no sapling yet), and the Savanna's termite hill
              ACACIA_LOG:230, STRIPPED_ACACIA_LOG:231, ACACIA_PLANKS:232, ACACIA_LEAVES:233, HOLLOW_ACACIA_LOG:234,
              TERMITE_HILL:235,
              ACACIA_SAPLING:236,
              SHORT_GRASS:237,                                                         // the smallest grass plant (TALLGRASS is the middle one)
            };
  /* ids 12, 28, 29, 31, 32, 35-38 and 113-124 were slabs and stairs until 0.783, when shapes became variants
     of the full block (SHAPE_SLAB below). Old saves are converted by migrateLegacyVal — never reuse them. */
  /* variant byte layout:
     - grass: 1 = snowy sides
     - rot:'side' blocks (furnace, bench): bits 0-1 = facing (0:+Z 1:-Z 2:+X 3:-X);
       furnace additionally uses bit 2 (value 4) = lit
     - log (rot:'all'): 0 = Y axis, 1 = X (lying), 2 = Z (lying)
     - slab (rot:'all'): 0 bottom, 1 top(ceiling), 2..5 vertical halves (-X,+X,-Z,+Z side) */
  // GRASS_DRY: the Dryland's pale grass, its own top and sides (the mesher, chunks/mesher-cubes.js); spread passes it on (22)
  const V = { GRASS_SNOWY:1, GRASS_DRY:2, FURNACE_ON:4,
              // which rock a furnace is built of, bits 3-5 (0 stone, then FURNACE_ROCKS), and which wood a
              // bench is, bits 2-4 (0 oak, then BENCH_WOODS) — picked on the variant bar
              FURNACE_ROCK_SHIFT:3, BENCH_WOOD_SHIFT:2 };
  const SIDE_FACE = [4, 5, 0, 1];            // facing bits -> faces[] index of the front
  // a furnace's or bench's tile for one face, from its facing, lit bit and rock or wood
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
  PROPS[B.GRASS]   = { name:'Grass', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:2.0, type:'grass', faces:[T.GRASS_SIDE,T.GRASS_SIDE,T.GRASS_TOP,T.DIRT,T.GRASS_SIDE,T.GRASS_SIDE], desc: '' };
  PROPS[B.DIRT]    = { name:'Dirt', solid:true,  opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:1.8, type:'ground', faces:[T.DIRT,T.DIRT,T.DIRT,T.DIRT,T.DIRT,T.DIRT], desc: '' };
  PROPS[B.STONE]   = { name:'Stone', solid:true,  opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:8.0, type:'stone', faces:[T.STONE,T.STONE,T.STONE,T.STONE,T.STONE,T.STONE], desc: '' };
});
