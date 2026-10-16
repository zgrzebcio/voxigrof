'use strict';
/* blocks/ids.js: every block's id (B). Ids are in the saves: never change or reuse one, add new ones at the end.
   First part of BLOCK_CORE (see core-parts.js; built in blocks/blocks.js). The parts after it use B. */

corePart('blocks', function () {
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
              // variant looks (blocks/variants.js)
              MOSSY_STONE_BRICK:123, CRACKED_STONE_BRICK:124, MOSSY_COBBLE:125, SULFUR_BRICKS:126,
              GRANITE_BRICKS:127, MARBLE_BRICKS:128, LIMESTONE_BRICKS:129,
              BERRY_BUSH_YELLOW:130,
              FURNACE_TOP_OPEN:131,
              TNT_TOP_LIT:132,
              // dolomite, the mossy and polished rocks, the stone furnace's chimney
              DOLOMITE:133, DOLOMITE_BRICKS:134, MOSSY_DOLOMITE_BRICKS:135, POLISHED_DOLOMITE:136,
              MOSSY_GRANITE_BRICKS:137, MOSSY_MARBLE_BRICKS:138, MOSSY_LIMESTONE_BRICKS:139,
              POLISHED_GRANITE:140, POLISHED_MARBLE:141, POLISHED_LIMESTONE:142,
              CHIMNEY_SIDE:143, CHIMNEY_TOP:144 };
});
