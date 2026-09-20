'use strict';
/* voxiGrof — list-based crafting system (survival only)

   Recipes are a flat list: ingredients on the left, one craft button with the output on
   the right. The inventory (Tab) shows the BASIC list (pocket crafting); right-clicking a crafting
   bench opens the ADVANCED list (basic + bench-only recipes). No grid patterns — having the
   ingredients anywhere in hotbar+inventory is enough. Crafting takes time since 0.76: see the
   CRAFTING TAKES TIME section below for the personal queue and the bench. */

/* recipe: { in: [[id, count], ...], out: [id, count], timeToCraft: seconds, xpToGive: xp }
   timeToCraft is at 100% crafting speed; xpToGive is paid as each craft finishes (0.76). Both were
   first filled from recipe size and the old leveling table, and are meant to be tuned here.
   An ingredient id may also be an ARRAY of interchangeable ids — a variant group. Any mix of
   them satisfies the requirement (4 oak + 5 birch planks crafts a bench), and the row's icon
   cycles through the group every CRAFT_VARIANT_MS so you can see what else is accepted. */
const V_PLANKS = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, ];
const V_LOG    = [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG];
// a hollow log saws into planks like the log it was (0.7843)
const V_OLOG   = [B.LOG, B.STRIPPED_LOG, B.HOLLOW_LOG];
const V_BLOG   = [B.BIRCH_LOG, B.STRIPPED_BIRCH_LOG, B.HOLLOW_BIRCH_LOG];
const V_SLOG   = [B.SPRUCE_LOG, B.STRIPPED_SPRUCE_LOG, B.HOLLOW_SPRUCE_LOG];
const V_STONE  = [B.COBBLE, B.STONE, B.MARBLE, B.LIMESTONE, B.GRANITE];          // anything that takes cobble takes stone too
const V_COAL   = [ITEM.COAL, ITEM.CHARCOAL];

// leather gear is riveted, not forged: any soft-metal nugget does the job
const V_NUGGET = [ITEM.IRON_NUGGET, ITEM.TIN_NUGGET, ITEM.COPPER_NUGGET];

const RECIPES_BASIC = [
  { in: [[V_OLOG, 1]],                                                       out: [B.PLANKS, 3], timeToCraft: 1.2, xpToGive: 2 },
  { in: [[V_BLOG, 1]],                                                       out: [B.BIRCH_PLANKS, 3], timeToCraft: 1.2, xpToGive: 2 },
  { in: [[V_SLOG, 1]],                                                       out: [B.SPRUCE_PLANKS, 3], timeToCraft: 1.2, xpToGive: 2 },
  { in: [[V_PLANKS, 1]],                                                     out: [ITEM.STICK, 3], timeToCraft: 0.5, xpToGive: 1 },
  { in: [[ITEM.SNOWBALL, 5]],                                                out: [B.SNOW, 1], timeToCraft: 1, xpToGive: 1 },
  { in: [[ITEM.WHEAT, 10]],                                                  out: [B.HAY, 1], timeToCraft: 3, xpToGive: 1 },   // 10 like every block version (0.768)
  { in: [[ITEM.CLAY_BALL, 5]],                                               out: [B.CLAY, 1], timeToCraft: 1.5, xpToGive: 1 },
  { in: [[ITEM.COAL, 1]],                                                    out: [ITEM.COAL_CHUNK, 5], timeToCraft: 1.5, xpToGive: 1 },       // 5 since 0.7691
  { in: [[ITEM.CHARCOAL, 1]],                                                out: [ITEM.CHARCOAL_CHUNK, 4], timeToCraft: 1, xpToGive: 1 },   // 0.767
  { in: [[V_PLANKS, 5], [ITEM.FIBER, 5]],                                    out: [B.CRAFTING_BENCH, 1], timeToCraft: 3, xpToGive: 5 },
  { in: [[ITEM.BOWL, 1], [B.RED_MUSHROOM, 1], [B.BROWN_MUSHROOM, 1], [B.BLUE_MUSHROOM, 1]], out: [ITEM.MUSHROOM_STEW, 1], timeToCraft: 5, xpToGive: 20 },   // + blue (0.7691)
  { in: [[V_COAL, 1], [ITEM.STICK, 1], [ITEM.FIBER, 1]],                  out: [B.TORCH, 4], timeToCraft: 1.5, xpToGive: 1 },
  { in: [[ITEM.GLASS_SHARD, 5]],                                             out: [B.GLASS, 1], timeToCraft: 2, xpToGive: 2 },
  { in: [[ITEM.SUGAR_CANE, 1]],                                              out: [ITEM.SUGAR, 2], station: 'mortar', timeToCraft: 3, xpToGive: 2 },
  { in: [[B.STONE, 1]],                                                      out: [B.STONE_BRICK, 1], timeToCraft: 1, xpToGive: 1 },
  { in: [[ITEM.BRICK, 5]],                                                   out: [B.BRICKS, 1], timeToCraft: 1, xpToGive: 3 },
  { in: [[ITEM.STRING, 5]],                                                  out: [B.WOOL, 1], timeToCraft: 1, xpToGive: 3 },
  { in: [[ITEM.FLINT, 3], [ITEM.STICK, 2], [ITEM.FIBER, 8]],                 out: [ITEM.FLINT_SWORD, 1], timeToCraft: 4, xpToGive: 8 },
  { in: [[ITEM.FLINT, 2], [ITEM.STICK, 3], [ITEM.FIBER, 8]],                 out: [ITEM.FLINT_SHOVEL, 1], timeToCraft: 4, xpToGive: 8 },
  { in: [[ITEM.FLINT, 5], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                 out: [ITEM.FLINT_PICKAXE, 1], timeToCraft: 5, xpToGive: 8 },
  { in: [[ITEM.FLINT, 4], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                 out: [ITEM.FLINT_HATCHET, 1], timeToCraft: 5, xpToGive: 8 },
  { in: [[ITEM.FLINT, 2], [ITEM.STICK, 3], [ITEM.FIBER, 8]],                 out: [ITEM.FLINT_HOE, 1], timeToCraft: 4, xpToGive: 8 },
  { in: [[ITEM.FLINT, 1], [ITEM.STICK, 2], [ITEM.FIBER, 6]],                 out: [ITEM.ARROW, 2], timeToCraft: 3, xpToGive: 5 },
];
const RECIPES_ADVANCED = [
  { in: [[ITEM.COAL_CHUNK, 5]],                                              out: [ITEM.COAL, 1], timeToCraft: 2.5, xpToGive: 1 },       // 5 since 0.7691
  { in: [[ITEM.CHARCOAL_CHUNK, 4]],                                          out: [ITEM.CHARCOAL, 1], timeToCraft: 2.5, xpToGive: 1 },   // 0.767
  { in: [[B.STONE, 1], [ITEM.FLINT, 1], [V_COAL, 1]],                     out: [ITEM.GLOW_DUST, 1], station: 'mortar', timeToCraft: 6, xpToGive: 20 },
  // dust packs back into the block it came from, so a light source is craftable rather than found
  { in: [[ITEM.GLOW_DUST, 5]],                                               out: [B.GLOWSTONE, 1], timeToCraft: 1, xpToGive: 2 },
  { in: [[ITEM.GLOW_CRYSTAL, 5]],                                            out: [B.GLOWCRYSTAL_BLOCK, 1], timeToCraft: 2, xpToGive: 4 },   // 0.765
  { in: [[V_PLANKS, 3]],                                                     out: [ITEM.BOWL, 4], timeToCraft: 1, xpToGive: 2 },
  { in: [[V_STONE, 12]],                                                     out: [B.FURNACE, 1], timeToCraft: 10, xpToGive: 25 },
  { in: [[ITEM.IRON_INGOT, 1]],                                              out: [ITEM.IRON_NUGGET, 10], timeToCraft: 2, xpToGive: 1 },
  { in: [[ITEM.IRON_NUGGET, 10]],                                             out: [ITEM.IRON_INGOT, 1], timeToCraft: 3, xpToGive: 1 },
  { in: [[ITEM.GOLD_INGOT, 1]],                                              out: [ITEM.GOLD_NUGGET, 10], timeToCraft: 2, xpToGive: 1 },
  { in: [[ITEM.GOLD_NUGGET, 10]],                                             out: [ITEM.GOLD_INGOT, 1], timeToCraft: 3, xpToGive: 1 },
  { in: [[ITEM.TIN_INGOT, 1]],                                               out: [ITEM.TIN_NUGGET, 10], timeToCraft: 2, xpToGive: 1 },
  { in: [[ITEM.TIN_NUGGET, 10]],                                              out: [ITEM.TIN_INGOT, 1], timeToCraft: 3, xpToGive: 1 },
  { in: [[ITEM.COPPER_INGOT, 1]],                                            out: [ITEM.COPPER_NUGGET, 10], timeToCraft: 2, xpToGive: 1 },
  { in: [[ITEM.COPPER_NUGGET, 10]],                                           out: [ITEM.COPPER_INGOT, 1], timeToCraft: 3, xpToGive: 1 },
  { in: [[ITEM.FIBER, 20]],                                                  out: [ITEM.CLOTH, 1], timeToCraft: 6, xpToGive: 10 },
  { in: [[V_PLANKS, 10], [ITEM.IRON_INGOT, 1], [ITEM.FIBER, 10]],            out: [B.CHEST, 1], timeToCraft: 6, xpToGive: 25 },
  { in: [[B.WOOL, 4], [V_PLANKS, 4], [ITEM.CLOTH, 5], [ITEM.FIBER, 10]],     out: [B.BED, 1], timeToCraft: 14, xpToGive: 60 },
  { in: [[V_PLANKS, 8], [ITEM.IRON_INGOT, 1], [ITEM.FIBER, 4]],              out: [B.DOOR, 1], timeToCraft: 4, xpToGive: 20 },
  { in: [[ITEM.DIAMOND, 3], [ITEM.STICK, 2], [ITEM.CLOTH, 2]],               out: [ITEM.DIAMOND_SWORD, 1], timeToCraft: 2.5, xpToGive: 80 },
  { in: [[ITEM.DIAMOND, 1], [ITEM.STICK, 3], [ITEM.CLOTH, 2]],               out: [ITEM.DIAMOND_SHOVEL, 1], timeToCraft: 2, xpToGive: 80 },
  { in: [[ITEM.DIAMOND, 5], [ITEM.STICK, 3], [ITEM.CLOTH, 2]],               out: [ITEM.DIAMOND_PICKAXE, 1], timeToCraft: 3, xpToGive: 80 },
  { in: [[ITEM.DIAMOND, 4], [ITEM.STICK, 3], [ITEM.CLOTH, 2]],               out: [ITEM.DIAMOND_HATCHET, 1], timeToCraft: 3, xpToGive: 80 },
  { in: [[ITEM.DIAMOND, 2], [ITEM.STICK, 3], [ITEM.CLOTH, 2]],               out: [ITEM.DIAMOND_HOE, 1], timeToCraft: 2.5, xpToGive: 80 },
  { in: [[ITEM.GOLD_INGOT, 3], [ITEM.STICK, 2], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_SWORD, 1], timeToCraft: 3, xpToGive: 60 },
  { in: [[ITEM.GOLD_INGOT, 1], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_SHOVEL, 1], timeToCraft: 3, xpToGive: 60 },
  { in: [[ITEM.GOLD_INGOT, 5], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_PICKAXE, 1], timeToCraft: 4, xpToGive: 60 },
  { in: [[ITEM.GOLD_INGOT, 4], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_HATCHET, 1], timeToCraft: 3.5, xpToGive: 60 },
  { in: [[ITEM.GOLD_INGOT, 2], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.GOLDEN_HOE, 1], timeToCraft: 3, xpToGive: 45 },
  { in: [[ITEM.IRON_INGOT, 3], [ITEM.STICK, 2], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_SWORD, 1], timeToCraft: 3, xpToGive: 45 },
  { in: [[ITEM.IRON_INGOT, 1], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_SHOVEL, 1], timeToCraft: 3, xpToGive: 45 },
  { in: [[ITEM.IRON_INGOT, 5], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_PICKAXE, 1], timeToCraft: 4, xpToGive: 45 },
  { in: [[ITEM.IRON_INGOT, 4], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_HATCHET, 1], timeToCraft: 3.5, xpToGive: 45 },
  { in: [[ITEM.IRON_INGOT, 2], [ITEM.STICK, 3], [ITEM.CLOTH, 1]],            out: [ITEM.IRON_HOE, 1], timeToCraft: 3, xpToGive: 45 },
  { in: [[ITEM.IRON_INGOT, 2], [ITEM.FIBER, 5]],                             out: [ITEM.IRON_SHEARS, 1], timeToCraft: 2.5, xpToGive: 35 },
  { in: [[ITEM.STRING, 10], [ITEM.STICK, 5], [ITEM.FIBER, 12]],              out: [ITEM.BOW, 1], timeToCraft: 7, xpToGive: 25 },
  { in: [[ITEM.IRON_INGOT, 5], [V_PLANKS, 10], [ITEM.FIBER, 20], [ITEM.CLOTH, 1]], out: [ITEM.SHIELD, 1], timeToCraft: 12, xpToGive: 70 },
  { in: [[V_STONE, 3], [ITEM.STICK, 2], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_SWORD, 1], timeToCraft: 3, xpToGive: 15 },
  { in: [[V_STONE, 1], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_SHOVEL, 1], timeToCraft: 3, xpToGive: 15 },
  { in: [[V_STONE, 5], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_PICKAXE, 1], timeToCraft: 4.5, xpToGive: 15 },
  { in: [[V_STONE, 4], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_HATCHET, 1], timeToCraft: 4, xpToGive: 15 },
  { in: [[V_STONE, 2], [ITEM.STICK, 3], [ITEM.FIBER, 10]],                    out: [ITEM.STONE_HOE, 1], timeToCraft: 3, xpToGive: 15 },
  { in: [[ITEM.IRON_INGOT, 3]],                                              out: [ITEM.BUCKET, 1], timeToCraft: 5, xpToGive: 25 },
  { in: [[ITEM.WHEAT, 3]],                                                   out: [ITEM.FLOUR, 1], station: 'mortar', timeToCraft: 2.5, xpToGive: 8 },
  { in: [[ITEM.FLOUR, 3], [B.PUMPKIN, 1]],                                   out: [ITEM.PUMPKIN_PIE, 1], timeToCraft: 8, xpToGive: 40 },
  { in: [[ITEM.CHARCOAL, 1], [ITEM.SULFUR, 2], [ITEM.FLINT, 1], [ITEM.ASHES, 1]], out: [ITEM.GUNPOWDER, 2], station: 'mortar', timeToCraft: 4.5, xpToGive: 10 },
  { in: [[ITEM.GUNPOWDER, 7], [B.SAND, 10]],                                 out: [B.TNT, 1], timeToCraft: 10, xpToGive: 30 },
  { in: [[ITEM.SUGAR_CANE, 3]],                                              out: [ITEM.PAPER, 1], timeToCraft: 2, xpToGive: 5 },
  { in: [[ITEM.GOLD_INGOT, 10], [ITEM.APPLE, 1]],                            out: [ITEM.GOLDEN_APPLE, 1], timeToCraft: 7, xpToGive: 100 },
  { in: [[ITEM.LEATHER, 2], [ITEM.FIBER, 8],  [V_NUGGET, 1]],                out: [ITEM.LEATHER_GLOVES, 1], timeToCraft: 4, xpToGive: 20 },
  { in: [[ITEM.LEATHER, 3], [ITEM.FIBER, 10], [V_NUGGET, 1]],                out: [ITEM.LEATHER_BOOTS, 1], timeToCraft: 5, xpToGive: 30 },
  { in: [[ITEM.LEATHER, 4], [ITEM.FIBER, 12], [V_NUGGET, 1]],                out: [ITEM.LEATHER_HELMET, 1], timeToCraft: 6, xpToGive: 40 },
  { in: [[ITEM.LEATHER, 5], [ITEM.FIBER, 15], [V_NUGGET, 2]],                out: [ITEM.LEATHER_LEGGINGS, 1], timeToCraft: 7, xpToGive: 50 },
  { in: [[ITEM.LEATHER, 7], [ITEM.FIBER, 18], [V_NUGGET, 2]],                out: [ITEM.LEATHER_CHESTPLATE, 1], timeToCraft: 8.5, xpToGive: 60 },
  { in: [[ITEM.FIBER, 20], [ITEM.LEATHER, 5], [ITEM.IRON_INGOT, 2], [ITEM.IRON_NUGGET, 5]], out: [ITEM.SADDLE, 1], timeToCraft: 10, xpToGive: 120 },
  { in: [[ITEM.LEATHER, 14], [ITEM.CLOTH, 10], [ITEM.FIBER, 8], [ITEM.COPPER_NUGGET, 6]], out: [ITEM.BACKPACK, 1], timeToCraft: 15, xpToGive: 150 },
  { in: [[ITEM.IRON_INGOT, 6],  [ITEM.FIBER, 4], [ITEM.CLOTH, 1]],           out: [ITEM.IRON_GLOVES, 1], timeToCraft: 8, xpToGive: 45 },
  { in: [[ITEM.IRON_INGOT, 8],  [ITEM.FIBER, 5], [ITEM.CLOTH, 1]],           out: [ITEM.IRON_BOOTS, 1], timeToCraft: 9, xpToGive: 65 },
  { in: [[ITEM.IRON_INGOT, 10], [ITEM.FIBER, 6], [ITEM.CLOTH, 1]],           out: [ITEM.IRON_HELMET, 1], timeToCraft: 10, xpToGive: 85 },
  { in: [[ITEM.IRON_INGOT, 14], [ITEM.FIBER, 7], [ITEM.CLOTH, 2]],           out: [ITEM.IRON_LEGGINGS, 1], timeToCraft: 11, xpToGive: 115 },
  { in: [[ITEM.IRON_INGOT, 18], [ITEM.FIBER, 8], [ITEM.CLOTH, 3]],           out: [ITEM.IRON_CHESTPLATE, 1], timeToCraft: 12, xpToGive: 135 },
];
/* Storage blocks (0.768): ten of a material into one block in 2s at the bench, and the block back into
   ten. Appended to the end of the list so every recipe index a save already holds stays where it was. */
for (const [mat, block] of [
  [ITEM.COAL, B.COAL_BLOCK], [ITEM.CHARCOAL, B.CHARCOAL_BLOCK], [ITEM.IRON_INGOT, B.IRON_BLOCK],
  [ITEM.GOLD_INGOT, B.GOLD_BLOCK], [ITEM.TIN_INGOT, B.TIN_BLOCK], [ITEM.COPPER_INGOT, B.COPPER_BLOCK],
  [ITEM.DIAMOND, B.DIAMOND_BLOCK], [ITEM.EMERALD, B.EMERALD_BLOCK], [ITEM.RUBY, B.RUBY_BLOCK],
  [ITEM.SAPPHIRE, B.SAPPHIRE_BLOCK], [ITEM.RAW_IRON, B.RAW_IRON_BLOCK], [ITEM.RAW_GOLD, B.RAW_GOLD_BLOCK],
  [ITEM.RAW_TIN, B.RAW_TIN_BLOCK], [ITEM.RAW_COPPER, B.RAW_COPPER_BLOCK],
  [ITEM.TOPAZ, B.TOPAZ_BLOCK],                                                                    // 0.769
])
  RECIPES_ADVANCED.push({ in: [[mat, 10]], out: [block, 1], timeToCraft: 2, xpToGive: 2 },
                        { in: [[block, 1]], out: [mat, 10], timeToCraft: 1, xpToGive: 1 });
/* 0.769, also appended so saved recipe indices hold: sandstone from 5 sand of its colour, fiber pressed into
   a block of 10 (and back), and a ladder from 10 sticks. */
RECIPES_ADVANCED.push(
  { in: [[B.SAND, 5]],        out: [B.SANDSTONE, 1],     timeToCraft: 3,   xpToGive: 1 },
  { in: [[B.RED_SAND, 5]],    out: [B.RED_SANDSTONE, 1], timeToCraft: 3,   xpToGive: 1 },
  { in: [[ITEM.FIBER, 10]],   out: [B.FIBER_BLOCK, 1],   timeToCraft: 2,   xpToGive: 1 },
  { in: [[B.FIBER_BLOCK, 1]], out: [ITEM.FIBER, 10],     timeToCraft: 1,   xpToGive: 1 },
  { in: [[ITEM.STICK, 10]],   out: [B.LADDER, 1],        timeToCraft: 3, xpToGive: 5 },
  // mortar and pestle (0.77; carved from granite with a bone pestle since 0.771)
  { in: [[B.GRANITE, 20], [ITEM.BONE, 1], [ITEM.FLINT, 2], [B.FIBER_BLOCK, 1]], out: [B.MORTAR, 1], timeToCraft: 10, xpToGive: 90 },
  /* 0.773, at the mortar: grinding doubles ore. A raw ore gives 2 powder; a raw ore block (ten ores) gives
     20 and takes ten times as long. Each powder smelts into one ingot (26-furnace.js). */
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
  { in: [[ITEM.COPPER_POWDER, 2], [ITEM.TIN_POWDER, 1]], out: [ITEM.BRONZE_POWDER, 2], station: 'mortar', timeToCraft: 3, xpToGive: 5 },
  { in: [[ITEM.BRONZE_INGOT, 1]],    out: [ITEM.BRONZE_NUGGET, 10], timeToCraft: 2,   xpToGive: 1 },
  { in: [[ITEM.BRONZE_NUGGET, 10]],  out: [ITEM.BRONZE_INGOT, 1],   timeToCraft: 3,   xpToGive: 1 },
  { in: [[ITEM.BRONZE_INGOT, 3], [ITEM.STICK, 2], [ITEM.CLOTH, 1]], out: [ITEM.BRONZE_SWORD, 1],   timeToCraft: 4.5, xpToGive: 60 },
  { in: [[ITEM.BRONZE_INGOT, 1], [ITEM.STICK, 3], [ITEM.CLOTH, 1]], out: [ITEM.BRONZE_SHOVEL, 1],  timeToCraft: 4.5, xpToGive: 60 },
  { in: [[ITEM.BRONZE_INGOT, 5], [ITEM.STICK, 3], [ITEM.CLOTH, 1]], out: [ITEM.BRONZE_PICKAXE, 1], timeToCraft: 5.5, xpToGive: 70 },
  { in: [[ITEM.BRONZE_INGOT, 4], [ITEM.STICK, 3], [ITEM.CLOTH, 1]], out: [ITEM.BRONZE_HATCHET, 1], timeToCraft: 6,   xpToGive: 80 },
  { in: [[ITEM.BRONZE_INGOT, 2], [ITEM.STICK, 3], [ITEM.CLOTH, 1]], out: [ITEM.BRONZE_HOE, 1],     timeToCraft: 4.5, xpToGive: 60 },
  /* The chisel (0.78): worn in the Others slot, picked a block shape (43-chisel.js). RETIRED in
     0.789 — the hammer below took the job over. Left in place, `removed`, so the recipe indices a
     save holds still line up and one flag brings it back. */
  { in: [[B.IRON_BLOCK, 5], [ITEM.COPPER_NUGGET, 4], [ITEM.STICK, 2], [B.FIBER_BLOCK, 1], [ITEM.STRING, 5]],
    out: [ITEM.CHISEL, 1], timeToCraft: 10, xpToGive: 150, removed: true },
  // the hammer (0.788): the shape tool, and since 0.789 the only one
  { in: [[B.IRON_BLOCK, 1], [ITEM.COPPER_NUGGET, 8], [ITEM.STICK, 4], [B.FIBER_BLOCK, 2], [ITEM.STRING, 10]],
    out: [ITEM.HAMMER, 1], timeToCraft: 15, xpToGive: 200 },
);

// which list is shown: 'basic' (E / pocket) or 'advanced' (crafting bench = basic + advanced)
var craftMode = 'basic';
/* Recipes for a disabled block (slabs, stairs — see DISABLED_BLOCKS in 13-actions.js) stay in the
   lists above rather than being deleted, so re-enabling one is a single-line change. They are
   filtered out here, which is the only place the UI ever reads the recipes from, so a hidden
   recipe cannot be crafted by any path. */
const _recipeEnabled = (r) => !r.removed && isObtainable(r.out[0]);
/* At the bench the flint tools sink to the END of the list (0.7574): they are the starter set, and
   with basic recipes first they used to sit above every stone, iron and diamond tool. The pocket
   list (E) keeps them where they were. */
const _isFlintTool = (r) => r.out[0] >= 256 && !!ITEM_PROPS[r.out[0]]?.tool && r.in.some(([id]) => id === ITEM.FLINT);
/* Stations (0.771): a recipe tagged `station: 'mortar'` (the powders: glow dust, gunpowder, flour) is
   ground at a mortar and pestle and nowhere else. It stays where it is in RECIPES_ADVANCED, so every
   recipe index a save holds still points at the same recipe; the lists are simply filtered. */
// ...and since 0.772 a station can take a basic recipe too (sugar): it leaves the pocket list as well
const craftRecipes = () =>
  (craftMode === 'mortar' ? [...RECIPES_BASIC, ...RECIPES_ADVANCED].filter(r => r.station === 'mortar')
   : craftMode === 'advanced'
    ? [...RECIPES_BASIC.filter(r => !r.station && !_isFlintTool(r)), ...RECIPES_ADVANCED.filter(r => !r.station),
       ...RECIPES_BASIC.filter(r => !r.station && _isFlintTool(r))]
    : RECIPES_BASIC.filter(r => !r.station)).filter(_recipeEnabled);
const idName = (id) => id >= 256 ? ITEM_PROPS[id].name : PROPS[id].name;

// an ingredient entry is either a bare id or a variant group; normalise to a list
const ingIds = (id) => Array.isArray(id) ? id : [id];
/* Total count of an id across hotbar + inventory + a worn backpack. The pack counts because a bag
   you cannot craft out of is a bag you have to unpack first — see _takeIngredients, which drains
   it last so the slots you can see empty before the ones on your back. */
function backpackGrid() {
  const n = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
  return n > 0 ? invSlots2.slice(0, n) : [];
}
function invCount(id) {
  let n = 0;
  const ids = ingIds(id);
  for (const s of HOTBAR)   if (s && ids.includes(s.id)) n += s.count;
  for (const s of invSlots) if (s && ids.includes(s.id)) n += s.count;
  for (const s of backpackGrid()) if (s && ids.includes(s.id)) n += s.count;
  for (const g of _openChestGrids()) for (const s of g) if (s && ids.includes(s.id)) n += s.count;
  return n;
}
/* An open chest is a second store for crafting (0.779), both halves of a double one: ingredients come
   out of your bags first and only the rest out of the chest, and something crafted or handed back that
   finds your bags full goes into the chest before it would be thrown on the floor. */
function _openChestGrids() {
  const out = [];
  if (typeof activeChest === 'undefined' || !activeChest) return out;
  for (const k of [activeChest, activeChest2]) { const c = k && CHESTS.get(k); if (c) out.push(c.slots); }
  return out;
}
function _putInOpenChest(id, meta = null) {
  const grids = _openChestGrids(), cap = stackSize(id);
  for (const g of grids) for (const s of g) if (s && s.id === id && s.dur == null && s.count < cap) { stackInto(s, 1, meta && meta.fresh); return true; }
  for (const g of grids) for (let i = 0; i < g.length; i++) if (!g[i]) { g[i] = applyMeta(mkSlot(id, 1), meta); return true; }
  return false;
}
/* What a recipe costs THIS player (0.79). Saddler takes 20% off the saddle, rounded, never below one
   of anything; every other recipe costs what it says. Everything that counts or takes ingredients
   reads this rather than r.in, so the list, the badges and the bags always agree. */
function recipeIn(r) {
  if (r.out[0] === ITEM.SADDLE && typeof hasSkill === 'function' && hasSkill('saddler'))
    return r.in.map(([id, n]) => [id, Math.max(1, Math.round(n * 0.8))]);
  return r.in;
}
const canCraft = (r) => recipeIn(r).every(([id, n]) => invCount(id) >= n);

/* ================================================================================================
   CRAFTING TAKES TIME (0.76)
   ------------------------------------------------------------------------------------------------
   Every recipe carries `timeToCraft` (seconds at 100% crafting speed) and `xpToGive` (paid as each
   craft finishes). Committing to a craft takes its ingredients out of your bags straight away, and
   cancelling gives back everything that was not made yet.

   POCKET (the inventory's list): a personal queue of CRAFT_QUEUE_MAX slots under the recipes. Every
   slot is ONE craft (0.761): a click queues one, Shift+click fills as many empty slots as you can
   afford, so five is the most ever waiting. The front slot works on its own, inventory open or closed — closed, the
   row shows on the HUD at half opacity — and while it runs you walk slower and cannot sprint.
   Clicking a queued slot cancels it; Cancel all empties the queue.

   BENCH: not a queue. A bench holds ONE order — one recipe, any amount — floating over it where it
   can be read from every side. Choosing a recipe at the bench takes the ingredients and closes the
   inventory. Hold E at the bench to work it; every other control is locked while you do, and
   letting go or taking a hit loses the item in progress (never the order). A tap of E takes what is
   finished. Holding the right button on the bench cancels the order and drops all of it, made and
   unmade, on the floor. A plain tap of the right button still opens the bench.

   Crafting speed (31-armor.js) scales both: 200% is twice as fast, 0% cannot craft at all.
   ================================================================================================ */
const CRAFT_QUEUE_MAX = 6;                   // 5 until 0.778; the slimmer rows left room for a sixth slot
const CRAFT_MOVE_MUL = 0.6;          // walking speed while your personal queue runs
// Walk and Work (0.79): the slowdown (1 - CRAFT_MOVE_MUL) is a quarter smaller — 60% walking becomes 70%
const craftMoveMul = () => (typeof hasSkill === 'function' && hasSkill('walkWork'))
  ? 1 - (1 - CRAFT_MOVE_MUL) * 0.75 : CRAFT_MOVE_MUL;
const BENCH_TAP_TIME = 0.25;         // a right-button press shorter than this opens a busy bench
const BENCH_CANCEL_HOLD = 0.8;       // held this long, it cancels the bench's order

// one index space over both lists, so a saved queue or bench order can name its recipe
const recipeIndex = (r) => {
  const i = RECIPES_BASIC.indexOf(r);
  return i >= 0 ? i : RECIPES_BASIC.length + RECIPES_ADVANCED.indexOf(r);
};
const recipeAt = (i) => {
  const r = i < RECIPES_BASIC.length ? RECIPES_BASIC[i] : RECIPES_ADVANCED[i - RECIPES_BASIC.length];
  return r && !r.removed ? r : null;               // a removed recipe refunds like a missing one (0.783)
};
const craftSpeed = () => (typeof playerCraftSpeedMul === 'function' ? playerCraftSpeedMul() : 1);
const _cantCraftMsg = 'You cannot craft: crafting speed is 0%';

// how many times this recipe could be crafted from what you are carrying (Shift fills to this)
function maxCrafts(r) {
  let m = Infinity;
  for (const [id, n] of recipeIn(r)) m = Math.min(m, Math.floor(invCount(id) / n));
  return Number.isFinite(m) ? m : 0;
}

/* Take ONE craft's ingredients out of the bags: main grid first, then the hotbar, then the backpack.
   Returns exactly what was taken as [[id, count], ...] — a variant group can drain several ids — so
   a refund hands back those same items. null when the craft is not affordable. */
function _takeIngredients(r) {
  if (!canCraft(r)) return null;
  const packN = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
  const taken = new Map(), fromChest = new Map();
  const grids = [[invSlots, invSlots.length], [HOTBAR, HOTBAR.length], [invSlots2, packN]];
  const chests = _openChestGrids();                     // after every bag, so the inventory has priority (0.779)
  for (const g of chests) grids.push([g, g.length]);
  for (const [id, need] of recipeIn(r)) {
    let n = need;
    const ids = ingIds(id);
    for (const [arr, len] of grids)
      for (let i = 0; i < len && n > 0; i++) {
        const s = arr[i];
        if (!s || !ids.includes(s.id)) continue;
        const t = Math.min(s.count, n);
        s.count -= t; n -= t;
        taken.set(s.id, (taken.get(s.id) || 0) + t);
        if (chests.includes(arr)) fromChest.set(s.id, (fromChest.get(s.id) || 0) + t);
        if (s.count <= 0) arr[i] = null;
      }
  }
  // what the chest gave shows in the feed; your own bags stay quiet as before
  if (typeof feedItem === 'function') for (const [id, c] of fromChest) feedItem(id, -c, 'used from chest');
  return [...taken];
}
const _validId = (id) => typeof id === 'number' && !!(id >= 256 ? ITEM_PROPS[id] : PROPS[id]);
const _validUnit = (u) => Array.isArray(u) && u.every(p => Array.isArray(p) && _validId(p[0]) && p[1] > 0);

/* Hand items to this player. Something you can wear goes straight into its empty slot, a torch tops
   up the offhand (tryPickup), the rest fills the bags, and whatever does not fit is thrown at your
   feet rather than lost. `equip` is off for refunds: ingredients coming back are never worn. */
// `meta`: extras each item is handed over with — Well made off a Fine Work craft, a repaired tool's own (0.79)
function _giveItems(id, count, reason, equip, meta = null) {
  for (let k = 0; k < count; k++) {
    const eq = equip && typeof autoEquipSlot === 'function' ? autoEquipSlot(id) : -1;
    if (eq >= 0) {
      equipSlots[eq] = applyMeta(mkSlot(id, 1), meta);
      saveEquip();
      if (typeof feedItem === 'function') feedItem(id, 1, reason);
      continue;
    }
    if (tryPickup(id, null, reason, meta)) continue;
    if (_putInOpenChest(id, meta)) {                               // bags full, chest open: into the chest (0.779)
      if (typeof feedItem === 'function') feedItem(id, 1, reason + ' to chest');
      continue;
    }
    throwFromPlayer(id, 1, null, meta);
    if (typeof feedItem === 'function') feedItem(id, 1, 'no room: dropped');
  }
}

/* ---------------------------------- the personal queue ---------------------------------- */
// entries: { ri: recipe index, t: seconds into the front craft, units: [ingredients of one craft, ...] }
const craftQueue = () => player.craftQueue || (player.craftQueue = []);
// read by the frame loop: a running queue slows you down and stops sprinting
const playerIsCrafting = () => !player.canFly && !player.dead
  && !!(player.craftQueue && player.craftQueue.length) && craftSpeed() > 0;

function queueCraft(r, all) {
  if (player.canFly) return;
  if (craftSpeed() <= 0) { feedWarn(_cantCraftMsg); return; }
  const q = craftQueue(), ri = recipeIndex(r);
  const room = CRAFT_QUEUE_MAX - q.length;
  if (room <= 0) { feedWarn('Crafting queue is full'); return; }
  // one craft per slot: Shift fills the empty slots, as far as the ingredients go
  let added = 0;
  for (let want = all ? room : 1; added < want; added++) {
    const u = _takeIngredients(r);
    if (!u) break;
    q.push({ ri, t: 0, units: [u] });
  }
  if (!added) { feedWarn('Missing ingredients'); return; }
  refreshSlotsUI();
}
const _refundEntry = (e) => {
  for (const u of e.units) for (const [id, c] of u) _giveItems(id, c, 'returned', false);
  // a cancelled repair hands the tool back still broken, extras intact
  if (e.rep) {
    const maxD = ITEM_PROPS[e.rep.id]?.durability;
    if (!tryPickup(e.rep.id, maxD ? 0 : null, 'returned', e.rep.meta))
      throwFromPlayer(e.rep.id, 1, maxD ? 0 : null, e.rep.meta);
  }
};
function cancelQueueSlot(i) {
  const q = craftQueue(), e = q[i];
  if (!e) return;
  q.splice(i, 1);
  _refundEntry(e);
  refreshSlotsUI();
}
function cancelCraftQueue() {
  const q = craftQueue();
  if (!q.length) return;
  for (const e of q.splice(0)) _refundEntry(e);
  refreshSlotsUI();
}

// once per frame per seat: advance the front slot, then keep both views of the queue current
function updateCraftQueue(dt) {
  const q = player.craftQueue;
  if (q && q.length && !player.canFly && !player.dead && !worldJoining()) {
    const e = q[0], r = e.rep ? null : recipeAt(e.ri);
    if (e.rep) {                                       // a repair (Mender, 0.79): the tool comes back whole
      if (craftSpeed() > 0) {
        e.t += dt * craftSpeed();
        if (e.t >= repairTime(e.rep.id)) {
          q.shift();
          _giveItems(e.rep.id, 1, 'repaired', false, e.rep.meta);
          refreshSlotsUI();
        }
      }
    } else if (!r) {                                   // a recipe that no longer exists: give it all back
      q.shift(); _refundEntry(e); refreshSlotsUI();
    } else if (craftSpeed() > 0) {
      e.t += dt * craftSpeed();
      if (e.t >= r.timeToCraft) {
        e.t = 0;
        e.units.shift();
        if (!e.units.length) q.shift();
        // Fine Work stamps what it makes; Spare Parts may add one to an ammo craft (0.79)
        _giveItems(r.out[0], r.out[1] + skillSpareParts(r.out[0], 1), 'crafted', true, skillCraftMeta(r.out[0]));
        addXP(r.xpToGive || 0);
        refreshSlotsUI();
      }
    }
  }
  _syncQueueHud();
  _syncQueueBars();
}

function _queueSlotHtml(e) {
  if (e && e.rep)                                    // a repair: the tool itself, marked as being mended
    return `<img class="i3d" src="${renderBlockIcon(e.rep.id)}" alt=""><b class="cqRep">&#9874;</b>` +
           '<span class="cqBar"><i></i></span>';
  const r = e && recipeAt(e.ri);
  if (!r) return '';
  const n = e.units.length * r.out[1];
  return `<img class="i3d" src="${renderBlockIcon(r.out[0])}" alt="">` + (n > 1 ? `<b>${n}</b>` : '') +
         '<span class="cqBar"><i></i></span>';
}
// the queue row built under the recipe list; rebuilt with the panel, so no state of its own
function _queuePanel() {
  const q = craftQueue();
  const wrap = document.createElement('div');
  wrap.className = 'cqPanel';
  let slots = '';
  for (let i = 0; i < CRAFT_QUEUE_MAX; i++) {
    const r = q[i] && recipeAt(q[i].ri), rep = q[i] && q[i].rep;
    slots += `<div class="slot cqSlot${r || rep ? '' : ' empty'}" data-cq="${i}"` +
             (rep ? ` title="Click to cancel repairing ${idName(rep.id)}"`
                  : r ? ` title="Click to cancel ${idName(r.out[0])}"` : '') + `>${_queueSlotHtml(q[i])}</div>`;
  }
  wrap.innerHTML = `<div class="cqHead"><span class="ctitle">Queue</span>` +
    `<button class="cqCancel"${q.length ? '' : ' disabled'}>Cancel all</button></div><div class="cqRow">${slots}</div>`;
  wrap.querySelector('.cqCancel').addEventListener('click', () => { if (!dragHeld) cancelCraftQueue(); });
  for (const el of wrap.querySelectorAll('.cqSlot:not(.empty)'))
    el.addEventListener('click', () => { if (!dragHeld) cancelQueueSlot(+el.dataset.cq); });
  return wrap;
}
// the same row on the HUD, half see-through, while the inventory is closed and something is queued
function _syncQueueHud() {
  const q = player.craftQueue;
  const show = !!(q && q.length) && playing && !invOpen && !menuScene && !player.canFly && !player.dead;
  let el = player._cqHud;
  if (!show) { if (el) el.style.display = 'none'; return; }
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'cqHud';
    // in this seat's hotbar, beside the offhand slot (0.791; the pane's bottom-left corner before)
    (hotbarEl || document.body).appendChild(el);
    player._cqHud = el;
  }
  // step past the offhand slot when there is one: 9px gap + the 50px slot + 9px gap
  const right = hotbarEl && hotbarEl.querySelector(':scope > .offSlot') ? 'calc(100% + 68px)' : 'calc(100% + 9px)';
  if (el.style.right !== right) el.style.right = right;
  const sig = q.map(e => (e.rep ? 'r' + e.rep.id : e.ri) + ':' + e.units.length).join(',');
  if (el._sig !== sig) { el._sig = sig; el.innerHTML = q.map(e => `<div class="slot">${_queueSlotHtml(e)}</div>`).join(''); }
  el.style.display = 'flex';
}
// only the front slot is ever in progress, so only its bar moves
function _syncQueueBars() {
  const e = player.craftQueue && player.craftQueue[0];
  const total = !e ? 0 : e.rep ? repairTime(e.rep.id) : (recipeAt(e.ri)?.timeToCraft || 0);
  const w = total ? Math.min(100, e.t / total * 100).toFixed(1) + '%' : '0%';
  const a = invOpen ? invPanel('craftPanel')?.querySelector('.cqSlot[data-cq="0"] .cqBar i') : null;
  if (a) a.style.width = w;
  const h = player._cqHud;
  const b = h && h.style.display !== 'none' ? h.querySelector('.cqBar i') : null;
  if (b) b.style.width = w;
}

// saved with the player: the queue holds ingredients already taken out of their bags
const serializeCraftQueue = (p) => ((p && p.craftQueue) || []).map(e =>
  e.rep ? [e.ri, +e.t.toFixed(2), e.units, [e.rep.id, e.rep.meta || null]] : [e.ri, +e.t.toFixed(2), e.units]);
function restoreCraftQueue(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const rec of list) {
    if (!Array.isArray(rec) || !Array.isArray(rec[2])) continue;
    const units = rec[2].filter(_validUnit);
    // a repair carries the tool it is mending (0.79); an id that no longer exists drops the entry
    const rp = Array.isArray(rec[3]) && ITEM_PROPS[rec[3][0]]?.durability ? rec[3] : null;
    if (rp) out.push({ ri: -1, t: +rec[1] || 0, units, rep: { id: rp[0], meta: rp[1] && typeof rp[1] === 'object' ? rp[1] : null } });
    else if (units.length) out.push({ ri: +rec[0] || 0, t: +rec[1] || 0, units });
    if (out.length >= CRAFT_QUEUE_MAX) break;
  }
  return out;
}
// death: what the queue was holding falls with everything else you carried
function dropCraftQueueAt(x, y, z) {
  for (const e of player.craftQueue || []) {
    if (e.rep)                                       // a tool being repaired falls as it went in: broken
      spawnDrop(e.rep.id, x, y, z, { x: (Math.random() - 0.5) * 5, y: 2 + Math.random() * 3, z: (Math.random() - 0.5) * 5 }, 2,
                ITEM_PROPS[e.rep.id]?.durability ? 0 : null, e.rep.meta);
    for (const u of e.units)
      for (const [id, c] of u)
        for (let n = 0; n < c; n++)
          spawnDrop(id, x, y, z, { x: (Math.random() - 0.5) * 5, y: 2 + Math.random() * 3, z: (Math.random() - 0.5) * 5 }, 2);
  }
  player.craftQueue = [];
}

/* ---------------------------------- repairs (Mender, 0.79) ----------------------------------
   A tool or piece of gear worn to 0 stays broken in its slot. Drag it onto the recipe list or the
   queue and it goes into the personal queue as a repair: half its recipe's ingredients (rounded up),
   taken at once like any craft, and half its craft time. Anything made with flint — the starter
   tools — can be mended anywhere; everything else only while a crafting bench is open. Cancelling
   hands the ingredients back and the tool back broken, exactly as it went in. */
function repairRecipeFor(id) {
  const all = [...RECIPES_BASIC, ...RECIPES_ADVANCED].filter(r => r && r.out[0] === id);
  return all.find(r => !r.removed) || all[0] || null;    // a retired recipe (the chisel) still prices a repair
}
const repairCost = (id) => { const r = repairRecipeFor(id); return r ? r.in.map(([i, n]) => [i, Math.ceil(n / 2)]) : null; };
const repairNeedsBench = (id) => { const r = repairRecipeFor(id); return !(r && r.in.some(([i]) => ingIds(i).includes(ITEM.FLINT))); };
const repairTime = (id) => Math.max(1, (repairRecipeFor(id)?.timeToCraft || 2) / 2);
const _atBench = () => craftMode === 'advanced' && !!activeBench;
// "3 Flint, 2 Stick, 5 Fiber" — a variant group reads as its first member with "(any)"
const repairCostText = (id) => (repairCost(id) || [])
  .map(([i, n]) => { const ids = ingIds(i); return `${n} ${idName(ids[0])}${ids.length > 1 ? ' (any)' : ''}`; }).join(', ');

/* Called with the cursor wherever a carried item was let go (mouse click-carry or pad release) that is
   not a slot. True when a broken tool was taken into the queue for repair — the caller is done then.
   False otherwise, including a refusal (with the reason on the feed), so the caller carries on. */
function tryRepairDrop(x, y) {
  const s = dragHeld;
  if (!s || !slotBroken(s) || player.canFly || typeof hasSkill !== 'function' || !hasSkill('mender')) return false;
  const cp = invPanel('craftPanel');
  if (!cp || cp.style.display === 'none') return false;
  const over = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  if (!over(cp.querySelector('#craftList')) && !over(cp.querySelector('.cqPanel'))) return false;
  const name = idName(s.id), cost = repairCost(s.id);
  if (!cost) { feedWarn(`${name} cannot be repaired`); return false; }
  if (repairNeedsBench(s.id) && !_atBench()) { feedWarn(`${name} can only be repaired at a crafting bench`); return false; }
  if (craftSpeed() <= 0) { feedWarn(_cantCraftMsg); return false; }
  if (craftQueue().length >= CRAFT_QUEUE_MAX) { feedWarn('Crafting queue is full'); return false; }
  const u = _takeIngredients({ in: cost, out: [s.id, 1] });
  if (!u) { feedWarn(`Missing materials to repair ${name}: ${repairCostText(s.id)}`); return false; }
  craftQueue().push({ ri: -1, t: 0, units: [u], rep: { id: s.id, meta: slotMeta(s) } });
  dragHeld = null; dragFrom = null;
  if (typeof feedItem === 'function') feedItem(s.id, -1, 'into repair');
  refreshSlotsUI();
  return true;
}

/* ---------------------------------- the crafting bench ---------------------------------- */
const BENCHES = new Map();           // "x,y,z" -> { ri, units, done, t, sprite, canvas, dirty }
var activeBench = null;              // the bench whose recipe list this seat has open
const benchKey = (x, y, z) => x + ',' + y + ',' + z;
const _benchHasOrder = (b) => !!(b && (b.units.length || b.done));
function benchBusy(x, y, z) { return _benchHasOrder(BENCHES.get(benchKey(x, y, z))); }
/* Which recipe list each station opens (0.771). A mortar works exactly like a bench — one order floating
   over it, hold E to work it, tap E to take, hold the right button to cancel — only its list differs. */
const STATION_MODE = { [B.CRAFTING_BENCH]: 'advanced', [B.MORTAR]: 'mortar' };
const isStation = (id) => STATION_MODE[id & 255] != null;
function openBench(x, y, z, mode = 'advanced') { activeBench = benchKey(x, y, z); toggleInventory(true, mode); }

// a recipe chosen at a bench: one craft (or as many as affordable with Shift) goes on its order
function benchOrder(r, all) {
  const key = activeBench;
  if (craftSpeed() <= 0) { feedWarn(_cantCraftMsg); return; }
  const ri = recipeIndex(r);
  let b = BENCHES.get(key);
  if (_benchHasOrder(b) && b.ri !== ri) {
    const cur = recipeAt(b.ri);
    feedWarn(`This bench is busy${cur ? ' with ' + idName(cur.out[0]) : ''}`);
    return;
  }
  const units = [];
  for (let k = 0, want = all ? maxCrafts(r) : 1; k < want; k++) {
    const u = _takeIngredients(r);
    if (!u) break;
    units.push(u);
  }
  if (!units.length) { feedWarn('Missing ingredients'); return; }
  if (!b || b.ri !== ri) {
    if (b) _benchClear(key);
    b = { ri, units: [], done: 0, t: 0, sprite: null, canvas: null, dirty: true };
    BENCHES.set(key, b);
  }
  b.units.push(...units);
  b.dirty = true;
  toggleInventory(false);            // back to the bench itself: the order is worked there
  refreshSlotsUI();
}
// a recipe row's button: the bench's order when one is open, the personal queue otherwise
function onRecipeClick(r, all) {
  if (craftMode !== 'basic' && activeBench) benchOrder(r, all);
  else queueCraft(r, all);
}

function _aimedBench() {
  if (!playing || invOpen || menuScene || player.canFly || player.dead || player.riding) return null;
  const hit = currentRay();
  return hit && isStation(hit.id) ? hit : null;          // a bench or a mortar (0.771)
}
/* Once per frame per seat, from the frame loop. `eHeld` is E (or the pad's North button); `rmbHeld` is
   the raw right button, read even while the bench has the controls locked. */
function updateBenchWork(dt, eHeld, rmbHeld) {
  const hit = _aimedBench();
  const key = hit ? benchKey(hit.x, hit.y, hit.z) : null;
  const b = key ? BENCHES.get(key) : null;
  const r = b ? recipeAt(b.ri) : null;
  player._benchAim = !!hit;
  // a mortar saved mid-grind comes back without its pestle drawn: put it back the moment it is looked at (0.772)
  if (hit && (hit.id & 255) === B.MORTAR && !(b && b.pestle) && ((getBlock(hit.x, hit.y, hit.z) >> 8) & 255))
    setBlock(hit.x, hit.y, hit.z, B.MORTAR);
  const eDown = eHeld && !player._benchE;
  player._benchE = eHeld;
  if (!eHeld) player._benchNeedRelease = false;

  // a tap of E takes whatever is finished
  if (b && eDown && b.done > 0) {
    if (r) _giveItems(r.out[0], r.out[1] * b.done + skillSpareParts(r.out[0], b.done), 'crafted', true,
                      skillCraftMeta(r.out[0]));   // Fine Work, Spare Parts (0.79)
    b.done = 0; b.dirty = true;
    if (!b.units.length) _benchClear(key);
    refreshSlotsUI();
  }
  // holding E works the order, one craft at a time
  const wants = !!(r && b.units.length && eHeld && !player._benchNeedRelease);
  if (wants && craftSpeed() <= 0 && eDown) feedWarn(_cantCraftMsg);
  if (wants && craftSpeed() > 0) {
    player._benchWork = key;
    b.t += dt * craftSpeed();
    if (b.t >= r.timeToCraft) {
      b.t = 0;
      b.units.shift();
      b.done++;
      addXP(r.xpToGive || 0);
      b.dirty = true;
    }
    const step = Math.floor(b.t / r.timeToCraft * 40);   // redraw the floating bar in 40 steps, not every frame
    if (step !== b._step) { b._step = step; b.dirty = true; }
  } else if (player._benchWork) {
    interruptBenchWork(false);                           // let go, looked away, or nothing left to make
  }

  // the right button on a busy bench: a short tap opens it, a long hold cancels its order
  if (_benchHasOrder(b) && rmbHeld) {
    if (player._benchRmbKey !== key) { player._benchRmbKey = key; player._benchRmbT = 0; player._benchRmbDone = false; }
    player._benchRmbT = (player._benchRmbT || 0) + dt;
    if (player._benchRmbT >= BENCH_CANCEL_HOLD && !player._benchRmbDone) {
      player._benchRmbDone = true;
      cancelBench(key);
    }
  } else if (!rmbHeld) {
    const t = player._benchRmbT || 0;
    if (t > 0 && t < BENCH_TAP_TIME && !player._benchRmbDone && hit && player._benchRmbKey === key) openBench(hit.x, hit.y, hit.z, STATION_MODE[hit.id & 255]);
    player._benchRmbT = 0; player._benchRmbDone = false; player._benchRmbKey = null;
  }
}
/* Stop working a bench. The craft in progress is lost — the order, and what is already finished, are
   not. After a HIT (`needRelease`) E has to be let go before it counts again, so a mob cannot be
   out-crafted by simply holding the key through the blow. Called from 19-vitals.js on damage. */
function interruptBenchWork(needRelease = true) {
  if (!player._benchWork) return;
  const b = BENCHES.get(player._benchWork);
  if (b) { b.t = 0; b._step = 0; b.dirty = true; }
  player._benchWork = false;
  if (needRelease) player._benchNeedRelease = true;
}
// everything on a bench's order, made and unmade, dropped at that bench
function _benchSpill(b, x, y, z) {
  const r = recipeAt(b.ri);
  if (r) for (let n = 0; n < r.out[1] * b.done; n++) spawnDrop(r.out[0], x, y, z);
  for (const u of b.units) for (const [id, c] of u) for (let n = 0; n < c; n++) spawnDrop(id, x, y, z);
}
function _benchClear(key) {
  const b = BENCHES.get(key);
  if (b && b.sprite) { scene.remove(b.sprite); b.sprite.material.map?.dispose(); b.sprite.material.dispose(); }
  if (b && b.pestle) _stopPestle(key, b);             // a mortar's pestle goes back in its bowl (0.772)
  BENCHES.delete(key);
  for (const p of PLAYERS) if (p._benchWork === key) p._benchWork = false;
}
function cancelBench(key) {
  const b = BENCHES.get(key);
  if (!_benchHasOrder(b)) return;
  const [x, y, z] = key.split(',').map(Number);
  _benchSpill(b, x, y + 1, z);
  _benchClear(key);
  feedInfo('Crafting cancelled: everything dropped at the bench');
}
// the bench block went away (11-chunks.js): its order spills where it stood
function benchBroken(x, y, z) {
  const key = benchKey(x, y, z), b = BENCHES.get(key);
  if (!b) return;
  if (!menuScene) _benchSpill(b, x, y, z);
  _benchClear(key);
  // a seat with this bench's recipe list open loses it: activeBench is per seat, swapped with the HUD
  if (activeBench === key) activeBench = null;
  if (typeof forEachPlayerState === 'function') forEachPlayerState((g) => { if (g.activeBench === key) g.activeBench = null; });
}
function clearBenches() { for (const k of [...BENCHES.keys()]) _benchClear(k); }
function serializeBenches() {
  const out = [];
  for (const [k, b] of BENCHES) if (_benchHasOrder(b)) out.push([k, b.ri, b.done, b.units]);
  return out;
}
function restoreBenches(list) {
  if (!Array.isArray(list)) return;
  for (const rec of list) {
    if (!Array.isArray(rec) || typeof rec[0] !== 'string' || !Array.isArray(rec[3])) continue;
    const b = { ri: +rec[1] || 0, done: Math.max(0, rec[2] | 0), units: rec[3].filter(_validUnit),
                t: 0, sprite: null, canvas: null, dirty: true };
    if (_benchHasOrder(b)) BENCHES.set(rec[0], b);
  }
}

/* The order over a bench: the output's icon, how many are still to make, a green count of what is ready
   to take, and the progress of the one being made. A sprite, so it faces you from every side. Drawn
   to its own small canvas and only redrawn when something on it changed. */
const BENCH_TAG_W = 128, BENCH_TAG_H = 150;
const _benchIcons = new Map();       // item id -> loaded Image of its 3D icon
function _benchIcon(id) {
  let im = _benchIcons.get(id);
  if (!im) {
    const src = renderBlockIcon(id);
    if (!src) return null;
    im = new Image();
    im.src = src;
    _benchIcons.set(id, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
function _drawBenchTag(b) {
  const r = recipeAt(b.ri);
  const W = BENCH_TAG_W, H = BENCH_TAG_H;
  if (!b.canvas) { b.canvas = document.createElement('canvas'); b.canvas.width = W; b.canvas.height = H; }
  const g = b.canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(12,14,24,0.8)';
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 2;
  g.beginPath();
  if (g.roundRect) g.roundRect(3, 3, W - 6, H - 6, 12); else g.rect(3, 3, W - 6, H - 6);
  g.fill(); g.stroke();
  const icon = r && _benchIcon(r.out[0]);
  if (icon) g.drawImage(icon, 26, 10, 76, 76);
  else if (r) b.dirty = true;                          // icon still loading: try again next frame
  const per = r ? r.out[1] : 1;
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = '700 22px system-ui, sans-serif';
  g.fillText(b.units.length ? `×${b.units.length * per}` : 'done', W / 2, 110);
  if (b.done) {
    g.fillStyle = '#9ee07f';
    g.font = '700 16px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText(`${b.done * per} ready`, W - 12, 26);
  }
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(16, 124, W - 32, 12);
  const pct = r && b.units.length ? Math.min(1, b.t / r.timeToCraft) : (b.done ? 1 : 0);
  g.fillStyle = '#7ee63a';
  g.fillRect(16, 124, (W - 32) * pct, 12);
}
// once per frame for the world: make, redraw and retire the floating orders
/* The pestle at work (0.772). While someone holds E at a mortar its pestle leaves the chunk mesh — the block
   switches to variant 1, drawn without it — and a loose copy (variant 2, the pestle alone, built the way a
   dropped block is and lit by its cell the same way) circles the bowl with a small bob, as a pestle is
   ground round. Letting go, finishing, cancelling or breaking the mortar puts the block back as it was. */
const PESTLE_SPEED = 3.2;                               // radians per second round the bowl
function _startPestle(key, b) {
  const [x, y, z] = key.split(',').map(Number);
  const g = new THREE.Group();
  for (const { p, geo } of buildDropGeom(B.MORTAR, 2)) {
    const m = new THREE.Mesh(geo, _dropMat(p));
    m.onBeforeRender = _dropLightHook;
    m.renderOrder = p;
    g.add(m);
  }
  g.position.set(x + 0.5, y + 0.5, z + 0.5);           // drop geometry is centred on its cell
  scene.add(g);
  b.pestle = g;
  setBlock(x, y, z, B.MORTAR | (1 << 8));
}
function _stopPestle(key, b) {
  scene.remove(b.pestle);
  b.pestle = null;
  const [x, y, z] = key.split(',').map(Number);
  if ((getBlock(x, y, z) & 255) === B.MORTAR) setBlock(x, y, z, B.MORTAR);
}
function _animatePestle(key, b) {
  const working = PLAYERS.some(p => p._benchWork === key);
  if (working && !b.pestle) {
    const [x, y, z] = key.split(',').map(Number);
    if ((getBlock(x, y, z) & 255) === B.MORTAR) _startPestle(key, b);
  } else if (!working && b.pestle) _stopPestle(key, b);
  if (!b.pestle) return;
  const t = performance.now() / 1000, y0 = +key.split(',')[1];
  b.pestle.rotation.y = t * PESTLE_SPEED;
  b.pestle.position.y = y0 + 0.5 + Math.abs(Math.sin(t * PESTLE_SPEED * 2)) * 0.02;
}
function updateBenchDisplays() {
  for (const [key, b] of BENCHES) {
    if (!_benchHasOrder(b)) { _benchClear(key); continue; }
    _animatePestle(key, b);                              // only a mortar being worked does anything (0.772)
    if (!b.sprite) {
      _drawBenchTag(b);
      const tex = new THREE.CanvasTexture(b.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.renderOrder = 10;
      s.layers.set(1);                                 // the no-shadow layer the name tags use
      const [x, y, z] = key.split(',').map(Number);
      s.position.set(x + 0.5, y + 1.6, z + 0.5);
      s.scale.set(0.7, 0.7 * BENCH_TAG_H / BENCH_TAG_W, 1);
      scene.add(s);
      b.sprite = s;
      b.dirty = false;
      continue;
    }
    if (b.dirty) { b.dirty = false; _drawBenchTag(b); b.sprite.material.map.needsUpdate = true; }
  }
}
// what the crosshair says while you look at a bench with an order on it (18-hud.js)
function benchPrompt() {
  const hit = _aimedBench();
  const b = hit && BENCHES.get(benchKey(hit.x, hit.y, hit.z));
  if (!_benchHasOrder(b)) return null;
  const r = recipeAt(b.ri), per = r ? r.out[1] : 1;
  const pad = lastInputDevice === 'pad';
  const E = pad ? padNorthLabel() : 'E', RMB = pad ? 'LT' : 'RMB';
  const rows = [];
  if (b.units.length) rows.push(`(Hold <b>${E}</b>) craft ${r ? idName(r.out[0]) : 'unknown recipe'} · ${b.units.length * per} left`);
  if (b.done) rows.push(`(<b>${E}</b>) take ${b.done * per}`);
  rows.push(`(Hold <b>${RMB}</b>) cancel`);
  return rows.join('<br>');
}
/* The small arrow between a recipe's ingredients and its output, with how long ONE craft takes under
   it (0.7601). The time is already divided by your crafting speed, so it is the wait you will get. */
const _fmtCraftTime = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${+s.toFixed(1)}s`);
function _craftTimeHtml(r) {
  const spd = craftSpeed();
  const t = spd > 0 ? _fmtCraftTime(r.timeToCraft / spd) : '—';
  return '<span class="ctime"><svg viewBox="0 0 16 10" width="12" height="8" aria-hidden="true">' +   // smaller since 0.7771
         '<path d="M1 5h11M8.5 1.5 12.5 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.8" ' +
         `stroke-linecap="round" stroke-linejoin="round"/></svg><small>${t}</small></span>`;
}
const _craftBadge = (n, m) => craftShift ? `<b>${n}×(${m})</b>` : (n > 1 ? `<b>${n}</b>` : '');
var craftShift = false;
function _setCraftShift(on) {
  if (craftShift === on) return;
  craftShift = on;
  const panel = invOpen && !player.canFly ? invPanel('craftPanel') : null;
  if (panel && panel.style.display !== 'none') buildCraftPanel();
}
addEventListener('keydown', (e) => { if (e.key === 'Shift') _setCraftShift(true); });
addEventListener('keyup',   (e) => { if (e.key === 'Shift') _setCraftShift(false); });
addEventListener('blur', () => _setCraftShift(false));

// output-id -> category: blocks (id<256), tools (item with .tool), materials (other items)
function recipeCategory(r) {
  const oid = r.out[0];
  if (oid < 256) return 'blocks';
  const p = ITEM_PROPS[oid];
  if (p?.equip && p.equip !== 'accessories') return 'armor';   // anything worn in an equipment slot (the chisel is a tool)
  if (p?.food != null) return 'food';
  return (p?.tool || p?.ranged || p?.chisel) ? 'tools' : 'materials';   // a bow is a weapon, so it sits with the tools (0.7593)
}
const CRAFT_CATS = ['all', 'blocks', 'materials', 'tools', 'armor', 'food'];
var craftCat = 'all';                      // active tab; kept across rebuilds
function cycleCraftCategory(dir) {         // dir = +1 (RB) / -1 (LB); wraps
  const i = CRAFT_CATS.indexOf(craftCat);
  craftCat = CRAFT_CATS[(i + dir + CRAFT_CATS.length) % CRAFT_CATS.length];
  _craftScroll = 0;
  buildCraftPanel();
}
var _craftScroll = 0;                       // saved scroll position preserved across a panel rebuild

/* Variant cycling: rather than rebuilding the panel (which would fight the scroll position),
   a ticker rewrites the icon and tooltip of every ingredient that has a variant group. */
const CRAFT_VARIANT_MS = 2000;
let _variantPhase = 0;
setInterval(() => {
  _variantPhase++;
  const panel = invPanel('craftPanel');
  if (!panel || panel.style.display === 'none') return;
  for (const el of panel.querySelectorAll('.cing[data-ids]')) {
    const ids = el.dataset.ids.split(',').map(Number);
    const shown = ids[_variantPhase % ids.length];
    const img = el.querySelector('img');
    if (img) img.src = renderBlockIcon(shown);
    el.dataset.name = idName(shown);
  }
}, CRAFT_VARIANT_MS);

// populates the permanent #craftPanel div whenever the inventory rebuilds
function buildCraftPanel() {
  const panel = invPanel('craftPanel');
  if (!panel) return;
  panel.style.display = 'flex';
  // category tabs: All has no icon (label only), the rest use a themed icon from ITEM/BLOCK
  const CATS = [
    { key: 'all',       label: 'All',       icon: null },
    { key: 'blocks',    label: 'Blocks',    icon: B.CRAFTING_BENCH },
    { key: 'materials', label: 'Materials', icon: ITEM.IRON_INGOT },
    { key: 'tools',     label: 'Tools',     icon: ITEM.IRON_PICKAXE },
    { key: 'armor',     label: 'Armor',     icon: ITEM.IRON_CHESTPLATE },
    { key: 'food',      label: 'Food',      icon: ITEM.APPLE },
  ];
  let tabsHtml = '<div id="craftTabs">';
  for (const c of CATS) {
    const sel = c.key === craftCat ? ' sel' : '';
    const inner = c.icon != null ? `<img src="${renderBlockIcon(c.icon)}" alt="">` : `<span class="tlabel">All</span>`;
    tabsHtml += `<div class="ctab${sel}" data-cat="${c.key}" title="${c.label}">${inner}</div>`;
  }
  tabsHtml += '</div>';
  panel.innerHTML = `<div class="ctitle">${craftMode === 'mortar' ? 'Mortar and Pestle' : craftMode === 'advanced' ? 'Crafting Bench' : 'Crafting'}</div>` + tabsHtml;
  const list = document.createElement('div');
  list.id = 'craftList';
  // filter by category, then sort so craftable rows float to the top (stable within each group)
  const recs = craftRecipes().filter(r => craftCat === 'all' || recipeCategory(r) === craftCat);
  const idxOf = new Map(recs.map((r, i) => [r, i]));
  recs.sort((a, b) => {
    const ca = canCraft(a), cb = canCraft(b);
    if (ca !== cb) return ca ? -1 : 1;
    return idxOf.get(a) - idxOf.get(b);
  });
  for (const r of recs) {
    const ok = canCraft(r);
    // Shift: every count becomes craft-all — capped by the queue's empty slots when crafting from the pocket (0.761)
    const m = !craftShift ? 0 : (craftMode !== 'basic' && activeBench) ? maxCrafts(r)
            : Math.min(maxCrafts(r), CRAFT_QUEUE_MAX - craftQueue().length);
    const row = document.createElement('div');
    row.className = 'crow' + (ok ? '' : ' nocraft');
    let html = '';
    for (const [id, n] of recipeIn(r)) {
      const have = invCount(id) >= n;
      const ids = ingIds(id);
      // variant groups carry their whole id list so the cycler can swap icon + tooltip in place
      const shown = ids[_variantPhase % ids.length];
      const attr = ids.length > 1 ? ` data-ids="${ids.join(',')}"` : '';
      html += `<span class="cing${have ? '' : ' miss'}" data-name="${idName(shown)}" data-id="${shown}"${attr}>` +
              `<img src="${renderBlockIcon(shown)}" alt="">${_craftBadge(n, m)}</span>`;
    }
    html += _craftTimeHtml(r);                        // arrow + craft time, left of the output (0.7601)
    const [oid, on] = r.out;
    html += `<button class="cbtn" data-name="${idName(oid)}" data-id="${oid}">` +
            `<img src="${renderBlockIcon(oid)}" alt="">${_craftBadge(on, m)}</button>`;
    // what one craft pays, right of the output, the same way the furnace book shows it (0.777)
    html += `<span class="cxp">${r.xpToGive ? `<img src="textures/Items/Useables/experience_bottle.png" alt="">${r.xpToGive}` : ''}</span>`;
    row.innerHTML = html;
    // Shift+click commits as many as you can afford (0.76: into the queue, or onto the bench's order)
    row.querySelector('.cbtn').addEventListener('click', (ev) => onRecipeClick(r, ev.shiftKey));
    list.appendChild(row);
  }
  panel.appendChild(list);
  // the personal queue sits under the list; a bench works its own single order instead (0.76)
  const withQueue = !(craftMode !== 'basic' && activeBench);
  panel.classList.toggle('hasQueue', withQueue);
  if (withQueue) panel.appendChild(_queuePanel());
  list.scrollTop = _craftScroll;             // restore scroll position after any rebuild
  list.addEventListener('scroll', () => { _craftScroll = list.scrollTop; });
  for (const tab of panel.querySelectorAll('.ctab'))
    tab.addEventListener('click', () => { craftCat = tab.dataset.cat; _craftScroll = 0; buildCraftPanel(); });
}
