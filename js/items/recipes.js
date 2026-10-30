'use strict';
/* items/recipes.js: the recipes. A recipe's place in these lists is in the saves: only ever add at the end. */

/* voxiGrof — list-based crafting system (survival only)

   Recipes are a flat list: ingredients on the left, one craft button with the output on
   the right. The inventory (Tab) shows the BASIC list (pocket crafting); right-clicking a crafting
   bench opens the ADVANCED list (basic + bench-only recipes). No grid patterns — having the
   ingredients anywhere in hotbar+inventory is enough. Crafting takes time since 0.76: see the
   CRAFTING TAKES TIME section below for the personal queue and the bench. */

/* recipe: { in: [[id, count], ...], out: [id, count], timeToCraft: seconds, xpToGive: xp }
   timeToCraft is at 100% crafting speed; xpToGive is paid as each craft finishes. Both were
   first filled from recipe size and the old leveling table, and are meant to be tuned here.
   An ingredient id may also be an ARRAY of interchangeable ids — a variant group. Any mix of
   them satisfies the requirement (4 oak + 5 birch planks crafts a bench), and the row's icon
   cycles through the group every CRAFT_VARIANT_MS so you can see what else is accepted. */
/* The wood groups come from the woods table (woods/woods.js): any planks, any log, and each wood's log in every
   form it has (log, stripped, hollow: a hollow log saws into planks like the log it was). A NEW WOOD still needs
   its own planks recipe, appended by hand at the END of RECIPES_ADVANCED with `basic: true, after:` (as rime's and
   palm's are): a recipe's place in its list is in the saves. */
const V_PLANKS = woodBlocks('planks');
const V_LOG    = woodBlocks('log');
const V_OLOG   = woodLogs('oak');
const V_BLOG   = woodLogs('birch');
const V_SLOG   = woodLogs('spruce');
const V_RLOG   = woodLogs('rime');
const V_PLOG   = woodLogs('palm');
const V_ALOG   = woodLogs('acacia');
const V_JLOG   = woodLogs('jungle');
const V_STONE  = [B.COBBLE, B.STONE, B.MARBLE, B.LIMESTONE, B.GRANITE, B.DOLOMITE];   // dolomite 0.809          // anything that takes cobble takes stone too
const V_COAL   = [ITEM.COAL, ITEM.CHARCOAL];
const V_BERRIES = [ITEM.BERRIES, ITEM.BLUE_BERRIES, ITEM.BLACKBERRIES, ITEM.YELLOW_BERRIES, ITEM.WHITE_BERRIES];   // any berry, mixed
const V_BONE   = [ITEM.BONE, ITEM.SEASHELL];   // a seashell is bone enough: the mortar grinds it to bone ash, ten press into a bone block

// leather gear is riveted, not forged: any soft-metal nugget does the job
const V_NUGGET = [ITEM.IRON_NUGGET, ITEM.TIN_NUGGET, ITEM.COPPER_NUGGET];
// ...and a key's bit any metal at all
const V_ANY_NUGGET = [ITEM.IRON_NUGGET, ITEM.TIN_NUGGET, ITEM.COPPER_NUGGET, ITEM.GOLD_NUGGET, ITEM.BRONZE_NUGGET];

const RECIPES_BASIC = [
  { in: [[V_OLOG, 1]],                                                       out: [B.PLANKS, 3], timeToCraft: 1.2, xpToGive: 5 },
  { in: [[V_BLOG, 1]],                                                       out: [B.BIRCH_PLANKS, 3], timeToCraft: 1.2, xpToGive: 5 },
  { in: [[V_SLOG, 1]],                                                       out: [B.SPRUCE_PLANKS, 3], timeToCraft: 1.2, xpToGive: 5 },
  { in: [[V_PLANKS, 1]],                                                     out: [ITEM.STICK, 3], timeToCraft: 0.5, xpToGive: 2 },
  { in: [[ITEM.SNOWBALL, 5]],                                                out: [B.SNOW, 1], timeToCraft: 1.5, xpToGive: 1 },
  { in: [[ITEM.WHEAT, 10]],                                                  out: [B.HAY, 1], timeToCraft: 1.5, xpToGive: 1 },   // 10 like every block version
  { in: [[ITEM.CLAY_BALL, 5]],                                               out: [B.CLAY, 1], timeToCraft: 1.5, xpToGive: 1 },
  { in: [[ITEM.COAL, 1]],                                                    out: [ITEM.COAL_CHUNK, 5], timeToCraft: 1.5, xpToGive: 1 },       // 5 since 0.7691
  { in: [[ITEM.CHARCOAL, 1]],                                                out: [ITEM.CHARCOAL_CHUNK, 4], timeToCraft: 1, xpToGive: 1 },   // 0.767
  { in: [[V_PLANKS, 10], [ITEM.FIBER, 10]],                                    out: [B.CRAFTING_BENCH, 1], timeToCraft: 2.5, xpToGive: 10 },
  // brown, black, yellow and white, one of each and no stand-ins (red and blue left it); same place, so saved queues keep it
  { in: [[ITEM.BOWL, 1], [B.BROWN_MUSHROOM, 1], [B.BLACK_MUSHROOM, 1], [B.YELLOW_MUSHROOM, 1], [B.WHITE_TALL_MUSHROOM, 1]], out: [ITEM.MUSHROOM_STEW, 1], timeToCraft: 5, xpToGive: 40 },
  { in: [[V_COAL, 1], [ITEM.STICK, 1], [ITEM.FIBER, 1], [ITEM.FLINT, 2]],  out: [B.TORCH, 4], timeToCraft: 1.5, xpToGive: 1 },   // the flint lights it
  { in: [[ITEM.GLASS_SHARD, 5]],                                             out: [B.GLASS, 1], timeToCraft: 2, xpToGive: 2 },
  { in: [[ITEM.SUGAR_CANE, 1]],                                              out: [ITEM.SUGAR, 2], station: 'mortar', timeToCraft: 3, xpToGive: 10 },
  { in: [[ITEM.BRICK, 5]],                                                   out: [B.BRICKS, 1], timeToCraft: 2, xpToGive: 5 },
  { in: [[ITEM.STRING, 10]],                                                 out: [B.WOOL, 1], timeToCraft: 1.5, xpToGive: 2 },
  { in: [[ITEM.FLINT, 3], [ITEM.STICK, 2], [ITEM.FIBER, 8]],                 out: [ITEM.FLINT_SWORD, 1], timeToCraft: 4, xpToGive: 15 },
  { in: [[ITEM.FLINT, 2], [ITEM.STICK, 3], [ITEM.FIBER, 8]],                 out: [ITEM.FLINT_SHOVEL, 1], timeToCraft: 4, xpToGive: 15 },
  { in: [[ITEM.FLINT, 5], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                 out: [ITEM.FLINT_PICKAXE, 1], timeToCraft: 5, xpToGive: 15 },
  { in: [[ITEM.FLINT, 4], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                 out: [ITEM.FLINT_HATCHET, 1], timeToCraft: 5, xpToGive: 15 },
  { in: [[ITEM.FLINT, 2], [ITEM.STICK, 3], [ITEM.FIBER, 8]],                 out: [ITEM.FLINT_HOE, 1], timeToCraft: 4, xpToGive: 15 },
  { in: [[ITEM.FLINT, 1], [ITEM.STICK, 2], [ITEM.FIBER, 6], [ITEM.ASHES, 1]], out: [ITEM.ARROW, 2], timeToCraft: 2.5, xpToGive: 8 },
  // the cold crystal torch: twice the fire torch's time, last so saved queues keep their places
  { in: [[ITEM.GLOW_CRYSTAL, 1], [ITEM.FIBER, 2], [ITEM.STICK, 1]],          out: [B.CRYSTAL_TORCH, 5], timeToCraft: 3.5, xpToGive: 5 },
];
const RECIPES_ADVANCED = [
  { in: [[ITEM.COAL_CHUNK, 5]],                                              out: [ITEM.COAL, 1], timeToCraft: 2, xpToGive: 1 },       // 5 since 0.7691
  { in: [[ITEM.CHARCOAL_CHUNK, 4]],                                          out: [ITEM.CHARCOAL, 1], timeToCraft: 2, xpToGive: 1 },   // 0.767
  { in: [[B.STONE, 1], [ITEM.FLINT, 1], [V_COAL, 1]],                     out: [ITEM.GLOW_DUST, 1], station: 'mortar', timeToCraft: 5, xpToGive: 25 },
  { in: [[ITEM.GLOW_DUST, 5]],                                               out: [B.GLOWSTONE, 1], timeToCraft: 1.5, xpToGive: 3 },
  { in: [[ITEM.GLOW_CRYSTAL, 5]],                                            out: [B.GLOWCRYSTAL_BLOCK, 1], timeToCraft: 2, xpToGive: 4 },   // 0.765
  { in: [[V_PLANKS, 3]],                                                     out: [ITEM.BOWL, 1], timeToCraft: 1.5, xpToGive: 5 },
  { in: [[V_STONE, 12]],                                                     out: [B.FURNACE, 1], timeToCraft: 10, xpToGive: 40 },
  { in: [[ITEM.IRON_INGOT, 1]],                                              out: [ITEM.IRON_NUGGET, 10], timeToCraft: 2, xpToGive: 1 },
  { in: [[ITEM.IRON_NUGGET, 10]],                                             out: [ITEM.IRON_INGOT, 1], timeToCraft: 3, xpToGive: 1 },
  { in: [[ITEM.GOLD_INGOT, 1]],                                              out: [ITEM.GOLD_NUGGET, 10], timeToCraft: 2, xpToGive: 1 },
  { in: [[ITEM.GOLD_NUGGET, 10]],                                             out: [ITEM.GOLD_INGOT, 1], timeToCraft: 3, xpToGive: 1 },
  { in: [[ITEM.TIN_INGOT, 1]],                                               out: [ITEM.TIN_NUGGET, 10], timeToCraft: 2, xpToGive: 1 },
  { in: [[ITEM.TIN_NUGGET, 10]],                                              out: [ITEM.TIN_INGOT, 1], timeToCraft: 3, xpToGive: 1 },
  { in: [[ITEM.COPPER_INGOT, 1]],                                            out: [ITEM.COPPER_NUGGET, 10], timeToCraft: 2, xpToGive: 1 },
  { in: [[ITEM.COPPER_NUGGET, 10]],                                           out: [ITEM.COPPER_INGOT, 1], timeToCraft: 3, xpToGive: 1 },
  { in: [[ITEM.FIBER, 20]],                                                  out: [ITEM.CLOTH, 1], timeToCraft: 4, xpToGive: 20 },
  { in: [[V_PLANKS, 10], [ITEM.IRON_INGOT, 1], [ITEM.FIBER, 10]],            out: [B.CHEST, 1], timeToCraft: 6, xpToGive: 40 },
  { in: [[B.WOOL, 4], [V_PLANKS, 4], [ITEM.CLOTH, 5], [ITEM.FIBER, 10]],     out: [B.BED, 1], timeToCraft: 12, xpToGive: 100 },
  // bronze tools: a termite's chitin plate each besides the bronze
  { in: [[ITEM.BRONZE_INGOT, 6],  [ITEM.STICK, 2], [ITEM.CLOTH, 1], [ITEM.CHITIN_PLATE, 1]], out: [ITEM.BRONZE_SWORD, 1],   timeToCraft: 5.5, xpToGive: 350 },
  { in: [[ITEM.BRONZE_INGOT, 2],  [ITEM.STICK, 3], [ITEM.CLOTH, 1], [ITEM.CHITIN_PLATE, 1]], out: [ITEM.BRONZE_SHOVEL, 1],  timeToCraft: 5, xpToGive: 350 },
  { in: [[ITEM.BRONZE_INGOT, 10], [ITEM.STICK, 3], [ITEM.CLOTH, 1], [ITEM.CHITIN_PLATE, 1]], out: [ITEM.BRONZE_PICKAXE, 1], timeToCraft: 6.5, xpToGive: 350 },
  { in: [[ITEM.BRONZE_INGOT, 8],  [ITEM.STICK, 3], [ITEM.CLOTH, 1], [ITEM.CHITIN_PLATE, 1]], out: [ITEM.BRONZE_HATCHET, 1], timeToCraft: 6,   xpToGive: 350 },
  { in: [[ITEM.BRONZE_INGOT, 4],  [ITEM.STICK, 3], [ITEM.CLOTH, 1], [ITEM.CHITIN_PLATE, 1]], out: [ITEM.BRONZE_HOE, 1],     timeToCraft: 5.5, xpToGive: 350 },
  { in: [[ITEM.GOLD_INGOT, 3], [ITEM.STICK, 2], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_SWORD, 1], timeToCraft: 3, xpToGive: 120 },
  { in: [[ITEM.GOLD_INGOT, 1], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_SHOVEL, 1], timeToCraft: 3, xpToGive: 120 },
  { in: [[ITEM.GOLD_INGOT, 5], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_PICKAXE, 1], timeToCraft: 4, xpToGive: 120 },
  { in: [[ITEM.GOLD_INGOT, 4], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_HATCHET, 1], timeToCraft: 3.5, xpToGive: 120 },
  { in: [[ITEM.GOLD_INGOT, 2], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_HOE, 1], timeToCraft: 3, xpToGive: 120 },
  { in: [[ITEM.IRON_INGOT, 3], [ITEM.STICK, 2], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_SWORD, 1], timeToCraft: 3, xpToGive: 75 },
  { in: [[ITEM.IRON_INGOT, 1], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_SHOVEL, 1], timeToCraft: 3, xpToGive: 75 },
  { in: [[ITEM.IRON_INGOT, 5], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_PICKAXE, 1], timeToCraft: 4, xpToGive: 75 },
  { in: [[ITEM.IRON_INGOT, 4], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_HATCHET, 1], timeToCraft: 3.5, xpToGive: 75 },
  { in: [[ITEM.IRON_INGOT, 2], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_HOE, 1], timeToCraft: 3, xpToGive: 75 },
  { in: [[ITEM.IRON_INGOT, 2], [ITEM.FIBER, 5]],                             out: [ITEM.IRON_SHEARS, 1], timeToCraft: 2.5, xpToGive: 55 },
  { in: [[ITEM.STRING, 20], [ITEM.STICK, 5], [ITEM.FIBER, 12]],              out: [ITEM.BOW, 1], timeToCraft: 7, xpToGive: 100 },
  { in: [[ITEM.IRON_INGOT, 5], [V_PLANKS, 10], [ITEM.FIBER, 20], [ITEM.CLOTH, 1]], out: [ITEM.SHIELD, 1], timeToCraft: 12, xpToGive: 70 },
  { in: [[V_STONE, 3], [ITEM.STICK, 2], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_SWORD, 1], timeToCraft: 3, xpToGive: 30 },
  { in: [[V_STONE, 1], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_SHOVEL, 1], timeToCraft: 3, xpToGive: 30 },
  { in: [[V_STONE, 5], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_PICKAXE, 1], timeToCraft: 4.5, xpToGive: 30 },
  { in: [[V_STONE, 4], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_HATCHET, 1], timeToCraft: 4, xpToGive: 30 },
  { in: [[V_STONE, 2], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_HOE, 1], timeToCraft: 3, xpToGive: 30 },
  { in: [[ITEM.IRON_INGOT, 3]],                                              out: [ITEM.BUCKET, 1], timeToCraft: 5, xpToGive: 50 },
  { in: [[ITEM.WHEAT, 3]],                                                   out: [ITEM.FLOUR, 1], station: 'mortar', timeToCraft: 2, xpToGive: 15 },
  { in: [[ITEM.FLOUR, 3], [B.PUMPKIN, 1], [ITEM.SUGAR, 2]],                 out: [ITEM.PUMPKIN_PIE, 1], timeToCraft: 8, xpToGive: 70 },
  { in: [[ITEM.CHARCOAL, 1], [ITEM.SULFUR, 2], [ITEM.FLINT, 1], [ITEM.ASHES, 1]], out: [ITEM.GUNPOWDER, 2], station: 'mortar', timeToCraft: 4.5, xpToGive: 20 },
  { in: [[ITEM.GUNPOWDER, 7], [B.SAND, 10]],                                 out: [B.TNT, 1], timeToCraft: 10, xpToGive: 5 },
  { in: [[ITEM.BARK, 4]],                                                    out: [ITEM.PAPER, 1], timeToCraft: 2.5, xpToGive: 15 },
  { in: [[ITEM.GOLD_INGOT, 10], [ITEM.APPLE, 1]],                            out: [ITEM.GOLDEN_APPLE, 1], timeToCraft: 10, xpToGive: 250 },
  { in: [[ITEM.LEATHER, 2], [ITEM.FIBER, 8],  [V_NUGGET, 1]],                out: [ITEM.LEATHER_GLOVES, 1], timeToCraft: 5, xpToGive: 90 },
  { in: [[ITEM.LEATHER, 3], [ITEM.FIBER, 10], [V_NUGGET, 1]],                out: [ITEM.LEATHER_BOOTS, 1], timeToCraft: 6, xpToGive: 100 },
  { in: [[ITEM.LEATHER, 4], [ITEM.FIBER, 12], [V_NUGGET, 1]],                out: [ITEM.LEATHER_HELMET, 1], timeToCraft: 7, xpToGive: 110 },
  { in: [[ITEM.LEATHER, 5], [ITEM.FIBER, 15], [V_NUGGET, 2]],                out: [ITEM.LEATHER_LEGGINGS, 1], timeToCraft: 8, xpToGive: 120 },
  { in: [[ITEM.LEATHER, 7], [ITEM.FIBER, 18], [V_NUGGET, 2]],                out: [ITEM.LEATHER_CHESTPLATE, 1], timeToCraft: 9, xpToGive: 130 },
  { in: [[ITEM.FIBER, 20], [ITEM.LEATHER, 5], [ITEM.IRON_INGOT, 2], [ITEM.IRON_NUGGET, 5]], out: [ITEM.SADDLE, 1], timeToCraft: 10, xpToGive: 200 },
  { in: [[ITEM.LEATHER, 9], [ITEM.LEATHER_STRIP, 4], [ITEM.CLOTH, 10], [ITEM.FIBER, 8], [ITEM.BRONZE_NUGGET, 6]], out: [ITEM.BACKPACK, 1], timeToCraft: 15, xpToGive: 350 },
  { in: [[ITEM.IRON_INGOT, 12], [ITEM.FIBER, 4], [ITEM.CLOTH, 1]],           out: [ITEM.IRON_GLOVES, 1], timeToCraft: 8, xpToGive: 140 },
  { in: [[ITEM.IRON_INGOT, 16], [ITEM.FIBER, 5], [ITEM.CLOTH, 1]],           out: [ITEM.IRON_BOOTS, 1], timeToCraft: 9, xpToGive: 150 },
  { in: [[ITEM.IRON_INGOT, 20], [ITEM.FIBER, 6], [ITEM.CLOTH, 1]],           out: [ITEM.IRON_HELMET, 1], timeToCraft: 10, xpToGive: 160 },
  { in: [[ITEM.IRON_INGOT, 28], [ITEM.FIBER, 7], [ITEM.CLOTH, 2]],           out: [ITEM.IRON_LEGGINGS, 1], timeToCraft: 11, xpToGive: 170 },
  { in: [[ITEM.IRON_INGOT, 36], [ITEM.FIBER, 8], [ITEM.CLOTH, 3]],           out: [ITEM.IRON_CHESTPLATE, 1], timeToCraft: 12, xpToGive: 180 },
];
/* Storage blocks: ten of a material into one block in 2s at the bench, and the block back into
   ten. Appended to the end of the list so every recipe index a save already holds stays where it was. */
for (const [mat, block] of [
  [ITEM.COAL, B.COAL_BLOCK], [ITEM.CHARCOAL, B.CHARCOAL_BLOCK], [ITEM.IRON_INGOT, B.IRON_BLOCK],
  [ITEM.GOLD_INGOT, B.GOLD_BLOCK], [ITEM.TIN_INGOT, B.TIN_BLOCK], [ITEM.COPPER_INGOT, B.COPPER_BLOCK],
  [ITEM.DIAMOND, B.DIAMOND_BLOCK], [ITEM.EMERALD, B.EMERALD_BLOCK], [ITEM.RUBY, B.RUBY_BLOCK],
  [ITEM.SAPPHIRE, B.SAPPHIRE_BLOCK], [ITEM.RAW_IRON, B.RAW_IRON_BLOCK], [ITEM.RAW_GOLD, B.RAW_GOLD_BLOCK],
  [ITEM.RAW_TIN, B.RAW_TIN_BLOCK], [ITEM.RAW_COPPER, B.RAW_COPPER_BLOCK],
  [ITEM.TOPAZ, B.TOPAZ_BLOCK],                                                                    // 0.769
])
  RECIPES_ADVANCED.push({ in: [[mat, 10]], out: [block, 1], timeToCraft: 3, xpToGive: 1 },
                        { in: [[block, 1]], out: [mat, 10], timeToCraft: 2, xpToGive: 1 });
/* 0.769, also appended so saved recipe indices hold: sandstone from 5 sand of its colour, fiber pressed into
   a block of 10 (and back), and a ladder from 10 sticks. */
RECIPES_ADVANCED.push(
  { in: [[B.SAND, 5]],        out: [B.SANDSTONE, 1],     timeToCraft: 3,   xpToGive: 1 },   // back in 0.8442
  { in: [[B.RED_SAND, 5]],    out: [B.RED_SANDSTONE, 1], timeToCraft: 3,   xpToGive: 1 },
  { in: [[ITEM.FIBER, 10]],   out: [B.FIBER_BLOCK, 1],   timeToCraft: 2,   xpToGive: 1 },
  { in: [[B.FIBER_BLOCK, 1]], out: [ITEM.FIBER, 10],     timeToCraft: 1,   xpToGive: 1 },
  // mortar and pestle (0.77; carved from granite with a bone pestle since 0.771)
  // any stone carves a mortar since 0.7992; which rock the bowl LOOKS like is a variant you pick (blocks/variants.js)
  { in: [[V_STONE, 20], [V_BONE, 1], [ITEM.FLINT, 2], [B.FIBER_BLOCK, 1]], out: [B.MORTAR, 1], timeToCraft: 10, xpToGive: 150 },
  /* 0.773, at the mortar: grinding doubles ore. A raw ore gives 2 powder; a raw ore block (ten ores) gives
     20 and takes ten times as long. Each powder smelts into one ingot (blocks/furnace.js). */
  { in: [[ITEM.RAW_IRON, 1]],        out: [ITEM.IRON_POWDER, 2],    station: 'mortar', timeToCraft: 2,  xpToGive: 2 },
  { in: [[B.RAW_IRON_BLOCK, 1]],     out: [ITEM.IRON_POWDER, 20],   station: 'mortar', timeToCraft: 20, xpToGive: 20 },
  { in: [[ITEM.RAW_TIN, 1]],         out: [ITEM.TIN_POWDER, 2],     station: 'mortar', timeToCraft: 2,  xpToGive: 2 },
  { in: [[B.RAW_TIN_BLOCK, 1]],      out: [ITEM.TIN_POWDER, 20],    station: 'mortar', timeToCraft: 20, xpToGive: 20 },
  { in: [[ITEM.RAW_COPPER, 1]],      out: [ITEM.COPPER_POWDER, 2],  station: 'mortar', timeToCraft: 2,  xpToGive: 2 },
  { in: [[B.RAW_COPPER_BLOCK, 1]],   out: [ITEM.COPPER_POWDER, 20], station: 'mortar', timeToCraft: 20, xpToGive: 20 },
  { in: [[ITEM.RAW_GOLD, 1]],        out: [ITEM.GOLD_POWDER, 2],    station: 'mortar', timeToCraft: 2,  xpToGive: 2 },
  { in: [[B.RAW_GOLD_BLOCK, 1]],     out: [ITEM.GOLD_POWDER, 20],   station: 'mortar', timeToCraft: 20, xpToGive: 20 },
  /* 0.774, bronze: 2 copper powder and 1 tin powder ground together make 2 bronze powder, which smelts into
     bronze ingots. Nuggets and ingots trade 10 to 1 like the other metals; the tools sit between iron and
     diamond, and a bronze pickaxe is what the diamond and gem ores need. */
  { in: [[ITEM.COPPER_POWDER, 2], [ITEM.TIN_POWDER, 1]], out: [ITEM.BRONZE_POWDER, 2], station: 'mortar', timeToCraft: 3, xpToGive: 10 },
  { in: [[ITEM.BRONZE_INGOT, 1]],    out: [ITEM.BRONZE_NUGGET, 10], timeToCraft: 2,   xpToGive: 1 },
  { in: [[ITEM.BRONZE_NUGGET, 10]],  out: [ITEM.BRONZE_INGOT, 1],   timeToCraft: 3,   xpToGive: 1 },

  /* The chisel: worn in the Others slot, picked a block shape (shapes/chisel.js). Retired in 0.789 when
     the hammer below took that job, and made again since 0.799: worn in the Neck slot it unlocks block
     variants (blocks/variants.js). Five iron ingots, not blocks, since 0.803, when shaping became the hammer's alone. */
  { in: [[ITEM.IRON_INGOT, 5], [ITEM.COPPER_NUGGET, 4], [ITEM.STICK, 2], [B.FIBER_BLOCK, 1], [ITEM.STRING, 10]],
    out: [ITEM.CHISEL, 1], timeToCraft: 10, xpToGive: 300 },
  // the hammer: the shape tool, and since 0.789 the only one
  { in: [[B.IRON_BLOCK, 1], [ITEM.COPPER_NUGGET, 8], [ITEM.STICK, 4], [B.FIBER_BLOCK, 2], [ITEM.STRING, 20]],
    out: [ITEM.HAMMER, 1], timeToCraft: 15, xpToGive: 500 },
  // adobe: a clay block bound with straw; appended so saved recipe indices hold
  { in: [[B.CLAY, 1], [ITEM.WHEAT, 5]], out: [B.ADOBE, 4], timeToCraft: 4, xpToGive: 25 },
  // five stone pebbles press into a stone block: the first stone a flint pickaxe cannot give you
  // ...a cobblestone since 0.826: loose stones packed together, not smooth stone
  { in: [[ITEM.STONE_PEBBLE, 5]], out: [B.COBBLE, 1], timeToCraft: 2, xpToGive: 3 },
  // rotten flesh pressed five into one, and that worked slowly into leather for a little XP
  { in: [[ITEM.ROTTEN_FLESH, 5]],             out: [ITEM.COMPRESSED_ROTTEN_FLESH, 1], timeToCraft: 3,  xpToGive: 1 },
  { in: [[B.PINK_SAND, 5]],   out: [B.PINK_SANDSTONE, 1], timeToCraft: 3,   xpToGive: 1 },   // 0.822
  // cloth armor: a lot of cloth and fiber; the boots and gloves take 2 sticks and a leather as well
  { in: [[ITEM.CLOTH, 3], [ITEM.FIBER, 10]],                                  out: [ITEM.CLOTH_HELMET, 1],     timeToCraft: 4, xpToGive: 60 },
  { in: [[ITEM.CLOTH, 5], [ITEM.FIBER, 16]],                                  out: [ITEM.CLOTH_CHESTPLATE, 1], timeToCraft: 5, xpToGive: 60 },
  { in: [[ITEM.CLOTH, 4], [ITEM.FIBER, 14]],                                  out: [ITEM.CLOTH_LEGGINGS, 1],   timeToCraft: 4.5, xpToGive: 60 },
  { in: [[ITEM.CLOTH, 2], [ITEM.FIBER, 8], [ITEM.STICK, 2], [ITEM.LEATHER, 1]], out: [ITEM.CLOTH_BOOTS, 1],      timeToCraft: 4, xpToGive: 60 },
  { in: [[ITEM.CLOTH, 2], [ITEM.FIBER, 8], [ITEM.STICK, 2], [ITEM.LEATHER, 1]], out: [ITEM.CLOTH_GLOVES, 1],     timeToCraft: 3.5, xpToGive: 60 },
  // the bone block: ten bones pressed into one, like the storage blocks, and back
  { in: [[V_BONE, 10]],       out: [B.BONE_BLOCK, 1], timeToCraft: 2, xpToGive: 1 },
  { in: [[B.BONE_BLOCK, 1]],  out: [ITEM.BONE, 10],   timeToCraft: 1.5, xpToGive: 1 },
  /* rime planks: appended so saved recipe indices hold; `basic` shows it in the pocket list as well as at the
     bench, like the other planks */
  { in: [[V_RLOG, 1]],        out: [B.RIME_PLANKS, 3], timeToCraft: 1.5, xpToGive: 3, basic: true, after: B.SPRUCE_PLANKS },
  // 0.84, appended for the saved indices like the rime planks: palm planks, and bone ash ground at the mortar
  { in: [[V_PLOG, 1]],        out: [B.PALM_PLANKS, 3], timeToCraft: 1.2, xpToGive: 2, basic: true, after: B.RIME_PLANKS },
  { in: [[V_BONE, 1]],        out: [ITEM.BONE_ASH, 2], station: 'mortar', timeToCraft: 2.5, xpToGive: 3 },
  // a wooden key, at the bench: 4 planks of any wood and a nugget of any metal for its bit
  { in: [[V_PLANKS, 4], [V_ANY_NUGGET, 1]], out: [ITEM.WOODEN_KEY, 1], timeToCraft: 3, xpToGive: 10 },
  // a glass bottle from 4 glass, at the bench (appended: recipe indices are saved)
  { in: [[B.GLASS, 4]],       out: [ITEM.GLASS_BOTTLE, 1], timeToCraft: 3, xpToGive: 10 },
  // acacia planks, appended for the saved indices like the palm's, listed after them
  { in: [[V_ALOG, 1]],        out: [B.ACACIA_PLANKS, 3], timeToCraft: 1.2, xpToGive: 2, basic: true, after: B.PALM_PLANKS },
  /* bronze armor, at the bench: bronze, leather, the termites' chitin and cloth by the piece's size, feathers for the
     helmet's crest, fur (otters, polar bears) lining every piece but the helmet. XP as written is x CRAFT_XP_MUL below:
     600 the gauntlets .. 1100 the chestplate */
  { in: [[ITEM.BRONZE_INGOT, 30], [ITEM.LEATHER, 2],  [ITEM.CHITIN_PLATE, 1], [ITEM.CLOTH, 3],  [ITEM.FUR, 1]], out: [ITEM.BRONZE_GLOVES, 1],     timeToCraft: 14, xpToGive: 400 },
  { in: [[ITEM.BRONZE_INGOT, 36], [ITEM.LEATHER, 4],  [ITEM.CHITIN_PLATE, 2], [ITEM.CLOTH, 6],  [ITEM.FUR, 1]], out: [ITEM.BRONZE_BOOTS, 1],      timeToCraft: 15, xpToGive: 467 },
  { in: [[ITEM.BRONZE_INGOT, 42], [ITEM.LEATHER, 5],  [ITEM.CHITIN_PLATE, 2], [ITEM.CLOTH, 8], [ITEM.FEATHER, 5]], out: [ITEM.BRONZE_HELMET, 1], timeToCraft: 16, xpToGive: 533 },
  { in: [[ITEM.BRONZE_INGOT, 52], [ITEM.LEATHER, 8],  [ITEM.CHITIN_PLATE, 3], [ITEM.CLOTH, 12], [ITEM.FUR, 2]], out: [ITEM.BRONZE_LEGGINGS, 1],   timeToCraft: 17, xpToGive: 633 },
  { in: [[ITEM.BRONZE_INGOT, 60], [ITEM.LEATHER, 10], [ITEM.CHITIN_PLATE, 4], [ITEM.CLOTH, 15], [ITEM.FUR, 2]], out: [ITEM.BRONZE_CHESTPLATE, 1], timeToCraft: 18, xpToGive: 733 },
  // leather cut into strips, and the leather belt made of them (appended: recipe indices are saved)
  { in: [[ITEM.LEATHER, 1]],      out: [ITEM.LEATHER_STRIP, 3], timeToCraft: 2, xpToGive: 3 },
  { in: [[ITEM.LEATHER_STRIP, 15], [ITEM.IRON_NUGGET, 6], [ITEM.ASHES, 4]], out: [ITEM.BELT, 1], timeToCraft: 10, xpToGive: 200 },
  { in: [[ITEM.SEASHELL, 10]],    out: [B.SEASHELL_BLOCK, 1], timeToCraft: 2, xpToGive: 2 },   // ten seashells into a block
  // packed ice: ground back into five ice at the mortar, and five ice pressed into one at the bench
  { in: [[B.PACKED_ICE, 1]],      out: [B.ICE, 5],         station: 'mortar', timeToCraft: 3, xpToGive: 3 },
  { in: [[B.ICE, 5]],             out: [B.PACKED_ICE, 1],  timeToCraft: 3, xpToGive: 3 },
  /* a metal chest: a chest and three ingots, iron, copper or gold (any mix). Its metal is picked on the variant bar like a
     wooden chest's wood, and placing it takes a block of that metal (blocks/variants.js); one crafted is never sealed */
  { in: [[B.CHEST, 1], [[ITEM.IRON_INGOT, ITEM.COPPER_INGOT, ITEM.GOLD_INGOT], 3]], out: [B.METAL_CHEST, 1], timeToCraft: 8, xpToGive: 60 },
  // at the mortar: gravel sifted for its flint, a cactus crushed into fiber
  { in: [[B.GRAVEL, 3]],          out: [ITEM.FLINT, 1],    station: 'mortar', timeToCraft: 2.5, xpToGive: 2 },
  { in: [[B.CACTUS, 1]],          out: [ITEM.FIBER, 5],    station: 'mortar', timeToCraft: 2, xpToGive: 2 },
  // the bone ash block: five bone ash pressed into one, and back
  { in: [[ITEM.BONE_ASH, 10]],     out: [B.BONE_ASH_BLOCK, 1], timeToCraft: 2, xpToGive: 1 },
  // the lock pick, at the bench (blocks/chest.js); jam sandwiches, five berries of any kind and a bread make two, in the pocket list
  { in: [[ITEM.SEASHELL, 2], [ITEM.IRON_INGOT, 6], [ITEM.LEATHER, 1], [ITEM.CHARCOAL, 1]], out: [ITEM.LOCK_PICK, 1], timeToCraft: 4.2, xpToGive: 40 },
  { in: [[V_BERRIES, 5], [ITEM.BREAD, 1]], out: [ITEM.JAM_SANDWICH, 2], timeToCraft: 2, xpToGive: 6, basic: true, after: ITEM.MUSHROOM_STEW },
  // jungle planks, after the acacia's in the pocket list; five cocoa beans ground into cocoa powder at the mortar
  { in: [[V_JLOG, 1]],            out: [B.JUNGLE_PLANKS, 3], timeToCraft: 1.2, xpToGive: 2, basic: true, after: B.ACACIA_PLANKS },
  { in: [[ITEM.COCOA_BEANS, 5]],  out: [ITEM.COCOA_POWDER, 1], station: 'mortar', timeToCraft: 4.5, xpToGive: 5 },
);
// every recipe worth more than 1 XP pays a quarter more (rounded); the 1s stay 1
const CRAFT_XP_MUL = 1.5;
for (const r of [...RECIPES_BASIC, ...RECIPES_ADVANCED]) if (r.xpToGive > 1) r.xpToGive = Math.round(r.xpToGive * CRAFT_XP_MUL);

// which list is shown: 'basic' (E / pocket) or 'advanced' (crafting bench = basic + advanced)
var craftMode = 'basic';
/* Recipes for a disabled block (slabs, stairs — see DISABLED_BLOCKS in player/inventory.js) stay in the
   lists above rather than being deleted, so re-enabling one is a single-line change. They are
   filtered out here, which is the only place the UI ever reads the recipes from, so a hidden
   recipe cannot be crafted by any path. */
const _recipeEnabled = (r) => !r.removed && isObtainable(r.out[0]);
/* At the bench the flint tools sink to the END of the list: they are the starter set, and
   with basic recipes first they used to sit above every stone, iron and diamond tool. The pocket
   list (E) keeps them where they were. */
const _isFlintTool = (r) => r.out[0] >= 256 && !!ITEM_PROPS[r.out[0]]?.tool && r.in.some(([id]) => id === ITEM.FLINT);
/* Stations: a recipe tagged `station: 'mortar'` (the powders: glow dust, gunpowder, flour) is
   ground at a mortar and pestle and nowhere else. It stays where it is in RECIPES_ADVANCED, so every
   recipe index a save holds still points at the same recipe; the lists are simply filtered. */
// ...and since 0.772 a station can take a basic recipe too (sugar): it leaves the pocket list as well
/* a recipe appended to RECIPES_ADVANCED (for its saved index) with `basic` is listed with the basic ones, just
   after the basic recipe making its `after` (rime planks after spruce planks) */
const _basicRecipes = () => {
  const out = RECIPES_BASIC.slice();
  for (const r of RECIPES_ADVANCED) if (r.basic) {
    const i = out.findIndex(b => b.out[0] === r.after);
    out.splice(i >= 0 ? i + 1 : out.length, 0, r);
  }
  return out;
};
const craftRecipes = () =>
  (craftMode === 'mortar' ? [...RECIPES_BASIC, ...RECIPES_ADVANCED].filter(r => r.station === 'mortar')
   : craftMode === 'advanced'
    ? [..._basicRecipes().filter(r => !r.station && !_isFlintTool(r)), ...RECIPES_ADVANCED.filter(r => !r.station && !r.basic),
       ...RECIPES_BASIC.filter(r => !r.station && _isFlintTool(r))]
    : _basicRecipes().filter(r => !r.station)).filter(_recipeEnabled);
const idName = (id) => id >= 256 ? ITEM_PROPS[id].name : PROPS[id].name;

// an ingredient entry is either a bare id or a variant group; normalise to a list
const ingIds = (id) => Array.isArray(id) ? id : [id];
