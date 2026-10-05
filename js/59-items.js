'use strict';
/* voxiGrof — items (0.8377): everything with an id of 256 and up, moved out of 02-voxel-core.js. ITEM (the ids) and
   ITEM_PROPS (name, stack, icon, tool, armor, food, durability, desc...), and the passes over them that follow (tool
   wear, meat that rots into rotten flesh). Main thread only: the worker never needs an item. It loads right AFTER
   02-voxel-core.js (index.html), as it reads B there; nothing in 02 reads ITEM until the game runs. Blocks (ids under
   256) are 58-blocks.js. */

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
               PORK: 385, COOKED_PORK: 386, FAT: 387,
               BLACKBERRIES: 388,                    // YELLOW_BERRIES until 0.827, when the real yellow came
               // fish (0.805, 28-entities.js): what each of the four drops, and its cooked form
               COD: 389, COOKED_COD: 390, SALMON: 391, COOKED_SALMON: 392,
               PIKE: 393, COOKED_PIKE: 394, CATFISH: 395, COOKED_CATFISH: 396,
               CANTALOUPE_SLICE: 397,                                            // 0.8091
               STONE_PEBBLE: 398,                                                // 0.8095
               SALT: 399,
              COMPRESSED_ROTTEN_FLESH: 400,
              CLOTH_HELMET: 401, CLOTH_CHESTPLATE: 402, CLOTH_LEGGINGS: 403, CLOTH_BOOTS: 404, CLOTH_GLOVES: 405,
              YELLOW_BERRIES: 406, WHITE_BERRIES: 407,
              BUILD_WAND: 408,                     // 0.8371, creative's building wand (13-actions.js wandBuild)
              BREAK_WAND: 409 };                   // 0.8374, and its breaking wand (wandBreak)   // 0.827   // 0.824                                   // 0.821                                                      // 0.8097                                             // 0.7947                            // 0.769   // PUMPKIN_PIE (286) is the raw pie since 0.761
const ITEM_PROPS = {
  [ITEM.STICK]:         { name: 'Stick',         stack: 99, icon: 'stick', desc: 'Used as crafting ingredient or fuel for 0.25 smelt' },
  [ITEM.BUILD_WAND]:    { name: 'Building wand', stack: 1, icon: 'build_wand',    // 0.8371
                          desc: 'Creative only. Right-click a block: every same block joined to it across that face gets one more layer on it, the same look, shape and turn' },
  [ITEM.BREAK_WAND]:    { name: 'Breaking wand', stack: 1, icon: 'break_wand',    // 0.8374
                          desc: 'Creative only. Right-click a block: it and every same block joined to it across that face are taken away' },
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
  [ITEM.CHISEL]:        { name: 'Chisel',        stack: 1,  icon: 'chisel', equip: 'necklace', chisel: true, durability: 300,   // 200 until 0.7845; neck only (0.803)
                          desc: 'Wear it in the Neck slot to lay blocks as their variants: hold R and scroll (hold D-pad Right and a bumper on a gamepad). Cutting shapes is the hammer' },   // craftable again (0.799)
  /* The hammer (0.788) replaced the chisel outright in 0.789: same radial, same one-point-per-block
     wear, 400 durability. The chisel keeps its entry below so worlds saved with one still load. */
  [ITEM.HAMMER]:        { name: 'Hammer',        stack: 1,  icon: 'hammer', equip: 'accessories', chisel: true, durability: 500,
                          desc: 'Wear it in the Others slot to cut blocks into shapes: hold Q (hold B on a gamepad) to pick one. Variants are the chisel' },
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
  [ITEM.BOW]:           { name: 'Bow',           stack: 1,  icon: 'bow', ranged: 'bow', damage: 5, attackSpeed: 1.0, durability: 160,
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
  [ITEM.FLINT_SWORD]:   { name: 'Flint sword',    stack: 1, icon: 'flint_sword',   tool: 'sword',   tier: 1, toolSpeed: 1,    damage: 20,   attackSpeed: 1.8,   durability: 20, desc: '' },
  [ITEM.FLINT_SHOVEL]:  { name: 'Flint shovel',   stack: 1, icon: 'flint_shovel',  tool: 'shovel',  tier: 1, toolSpeed: 2,    damage: 10,   attackSpeed: 1.0,   durability: 40, desc: '' },
  [ITEM.FLINT_PICKAXE]: { name: 'Flint pickaxe',  stack: 1, icon: 'flint_pickaxe', tool: 'pick',    tier: 1, toolSpeed: 2,    damage: 15,   attackSpeed: 1.0,   durability: 40, desc: '' },
  [ITEM.FLINT_HATCHET]: { name: 'Flint hatchet',  stack: 1, icon: 'flint_hatchet', tool: 'hatchet', tier: 1, toolSpeed: 2,    damage: 25,   attackSpeed: 0.8,   durability: 40, desc: '' },
  [ITEM.FLINT_HOE]:     { name: 'Flint hoe',      stack: 1, icon: 'flint_hoe',     tool: 'hoe',     tier: 1, toolSpeed: 2,    damage: 15,   attackSpeed: 1.2,   durability: 30, desc: '' },
  [ITEM.STONE_SWORD]:    { name: 'Stone sword',     stack: 1, icon: 'stone_sword',    tool: 'sword',   tier: 2, toolSpeed: 2,    damage: 25,   attackSpeed: 1.7,   durability: 50, desc: '' },
  [ITEM.STONE_SHOVEL]:   { name: 'Stone shovel',    stack: 1, icon: 'stone_shovel',   tool: 'shovel',  tier: 2, toolSpeed: 4,    damage: 15,   attackSpeed: 0.8,   durability: 100, desc: '' },
  [ITEM.STONE_PICKAXE]:  { name: 'Stone pickaxe',   stack: 1, icon: 'stone_pickaxe',  tool: 'pick',    tier: 2, toolSpeed: 4,    damage: 20,   attackSpeed: 0.8,   durability: 100, desc: '' },
  [ITEM.STONE_HATCHET]:  { name: 'Stone hatchet',   stack: 1, icon: 'stone_hatchet',  tool: 'hatchet', tier: 2, toolSpeed: 4,    damage: 30,   attackSpeed: 0.6,   durability: 100, desc: '' },
  [ITEM.STONE_HOE]:      { name: 'Stone hoe',       stack: 1, icon: 'stone_hoe',      tool: 'hoe',     tier: 2, toolSpeed: 4,    damage: 20,   attackSpeed: 1.1,   durability: 80, desc: '' },
  [ITEM.IRON_SHEARS]:    { name: 'Iron shears',     stack: 1, icon: 'iron_shears',    tool: 'shears',  tier: 3, toolSpeed: 6,    damage: 15,   attackSpeed: 1.2,   durability: 150, desc: '' },
  [ITEM.IRON_SWORD]:     { name: 'Iron sword',      stack: 1, icon: 'iron_sword',     tool: 'sword',   tier: 3, toolSpeed: 3,    damage: 30,   attackSpeed: 1.9,   durability: 150, desc: '' },
  [ITEM.IRON_SHOVEL]:    { name: 'Iron shovel',     stack: 1, icon: 'iron_shovel',    tool: 'shovel',  tier: 3, toolSpeed: 6,    damage: 20,   attackSpeed: 1.1,   durability: 300, desc: '' },
  [ITEM.IRON_PICKAXE]:   { name: 'Iron pickaxe',    stack: 1, icon: 'iron_pickaxe',   tool: 'pick',    tier: 3, toolSpeed: 6,    damage: 25,   attackSpeed: 1.1,   durability: 300, desc: '' },
  [ITEM.IRON_HATCHET]:   { name: 'Iron hatchet',    stack: 1, icon: 'iron_hatchet',   tool: 'hatchet', tier: 3, toolSpeed: 6,    damage: 35,   attackSpeed: 0.8,   durability: 300, desc: '' },
  [ITEM.IRON_HOE]:       { name: 'Iron hoe',        stack: 1, icon: 'iron_hoe',       tool: 'hoe',     tier: 3, toolSpeed: 6,    damage: 25,   attackSpeed: 1.2,   durability: 200, desc: '' },
  [ITEM.GOLDEN_SWORD]:   { name: 'Golden sword',    stack: 1, icon: 'golden_sword',   tool: 'sword',   tier: 3, toolSpeed: 8,    damage: 25,   attackSpeed: 2.8,   durability: 30, desc: '' },
  [ITEM.GOLDEN_SHOVEL]:  { name: 'Golden shovel',   stack: 1, icon: 'golden_shovel',  tool: 'shovel',  tier: 3, toolSpeed: 14,   damage: 15,   attackSpeed: 1.6,   durability: 60, desc: '' },
  [ITEM.GOLDEN_PICKAXE]: { name: 'Golden pickaxe',  stack: 1, icon: 'golden_pickaxe', tool: 'pick',    tier: 3, toolSpeed: 14,   damage: 20,   attackSpeed: 1.6,   durability: 60, desc: '' },
  [ITEM.GOLDEN_HATCHET]: { name: 'Golden hatchet',  stack: 1, icon: 'golden_hatchet', tool: 'hatchet', tier: 3, toolSpeed: 14,   damage: 25,   attackSpeed: 1.4,   durability: 60, desc: '' },
  [ITEM.GOLDEN_HOE]:     { name: 'Golden hoe',      stack: 1, icon: 'golden_hoe',     tool: 'hoe',     tier: 3, toolSpeed: 14,   damage: 15,   attackSpeed: 2.4,   durability: 45, desc: '' },
  // bronze tools (0.774): tier 4, halfway between iron and diamond in every stat; the gem ores need one
  [ITEM.BRONZE_SWORD]:   { name: 'Bronze sword',    stack: 1, icon: 'bronze_sword',   tool: 'sword',   tier: 4, toolSpeed: 4,    damage: 32.5, attackSpeed: 1.95,  durability: 300, desc: '' },
  [ITEM.BRONZE_SHOVEL]:  { name: 'Bronze shovel',   stack: 1, icon: 'bronze_shovel',  tool: 'shovel',  tier: 4, toolSpeed: 8,    damage: 15,   attackSpeed: 1.15,  durability: 600, desc: '' },
  [ITEM.BRONZE_PICKAXE]: { name: 'Bronze pickaxe',  stack: 1, icon: 'bronze_pickaxe', tool: 'pick',    tier: 4, toolSpeed: 8,    damage: 17.5, attackSpeed: 1.15,  durability: 600, desc: '' },
  [ITEM.BRONZE_HATCHET]: { name: 'Bronze hatchet',  stack: 1, icon: 'bronze_hatchet', tool: 'hatchet', tier: 4, toolSpeed: 8,    damage: 37.5, attackSpeed: 0.85,  durability: 600, desc: '' },
  [ITEM.BRONZE_HOE]:     { name: 'Bronze hoe',      stack: 1, icon: 'bronze_hoe',     tool: 'hoe',     tier: 4, toolSpeed: 8,    damage: 17.5, attackSpeed: 1.25,  durability: 450, desc: '' },
  [ITEM.DIAMOND_SWORD]:  { name: 'Diamond sword',   stack: 1, icon: 'diamond_sword',  tool: 'sword',   tier: 5, toolSpeed: 5,    damage: 35,   attackSpeed: 2.0,   durability: 500, desc: '' },
  [ITEM.DIAMOND_SHOVEL]: { name: 'Diamond shovel',  stack: 1, icon: 'diamond_shovel', tool: 'shovel',  tier: 5, toolSpeed: 10,   damage: 10,   attackSpeed: 1.2,   durability: 1000, desc: '' },
  [ITEM.DIAMOND_PICKAXE]:{ name: 'Diamond pickaxe', stack: 1, icon: 'diamond_pickaxe',tool: 'pick',    tier: 5, toolSpeed: 10,   damage: 10,   attackSpeed: 1.2,   durability: 1000, desc: '' },
  [ITEM.DIAMOND_HATCHET]:{ name: 'Diamond hatchet', stack: 1, icon: 'diamond_hatchet',tool: 'hatchet', tier: 5, toolSpeed: 10,   damage: 40,   attackSpeed: 0.9,   durability: 1000, desc: '' },
  [ITEM.DIAMOND_HOE]:    { name: 'Diamond hoe',     stack: 1, icon: 'diamond_hoe',    tool: 'hoe',     tier: 5, toolSpeed: 10,   damage: 10,   attackSpeed: 1.3,   durability: 750, desc: '' },
// Useable
  [ITEM.BUCKET]:        { name: 'Bucket',        stack: 20, icon: 'bucket', desc: 'Used to fill with fluid, even with cow\'s milk (female cow)' },
  // 0.767: from a cow (bucket in hand, right-click). Drinking it clears every running effect and hands the bucket back
  [ITEM.MILK_BUCKET]:   { name: 'Milk bucket',   stack: 1, icon: 'milk_bucket', food: 10, foodSat: 10, foodSatFull: 5,   // a little food (0.822)
                          // 10 minutes, and what is left when it turns is the bucket back (0.7992)
                          eatTime: 1.92, drink: true, foodClearEffects: true, foodReturn: 283, spoil: 600, spoilInto: 283,
                          desc: 'Drink it to remove all active effects. Goes off in 10 minutes, leaving the bucket' },
  [ITEM.WATER_BUCKET]:  { name: 'Water Bucket',  stack: 1,  icon: 'water_bucket', desc: '' },
  [ITEM.LAVA_BUCKET]:   { name: 'Lava Bucket',   stack: 1,  icon: 'lava_bucket', desc: '' },
  [ITEM.SNOWBALL]:      { name: 'Snowball',      stack: 30, icon: 'snowball', throwable: true, desc: 'Can be thrown to knock back friends or enemies' },
  // craftable, but nothing rides yet — it is gear waiting for a mount
  [ITEM.SADDLE]:        { name: 'Saddle',        stack: 1,  icon: 'saddle', desc: 'Use it on a tamed animal to ride it' },
 //plants
  [ITEM.SUGAR_CANE]:    { name: 'Sugar cane',    stack: 99, icon: 'sugarcane', desc: 'Can be turned into sugar in a mortar' },
  [ITEM.WHEAT]:         { name: 'Wheat',         stack: 99, icon: 'wheat', desc: 'Can be turned into flour in a mortar' },
// Consumables. food, foodSat (over-food), foodSatFull and foodHeal are out of 100 since 0.82 (x5; they were out of 20);
// what each also gives in thirst, fruit, vegetables and protein is FOOD_NUTRITION in 54-stats-effects.js.
// Every eatTime is 20% longer since 0.821.
  [ITEM.APPLE]:         { name: 'Apple',          stack: 99, icon: 'apple',         foodSatFull: 15, food: 25,  foodSat: 40,  eatTime: 1.8, spoil: 3600, desc: '' },   // an hour since 0.7992
  [ITEM.MELON_SLICE]:   { name: 'Melon slice',    stack: 40, icon: 'melon_slice',   foodSatFull: 5, food: 5,  foodSat: 10,  eatTime: 0.84, spoil: 1200, desc: '' },
  // its own picture since 0.8098
  [ITEM.SALT]: { name: 'Salt', stack: 60, icon: 'salt_dust', desc: 'Scraped from salt crust' },   // 0.8097
  [ITEM.STONE_PEBBLE]: { name: 'Stone pebble', stack: 60, icon: 'stone_pebble', desc: 'Five make a cobblestone block' },   // 0.8095; cobblestone 0.826
  [ITEM.CANTALOUPE_SLICE]: { name: 'Cantaloupe slice', stack: 40, icon: 'cantaloupe_slice', foodSatFull: 5, food: 5, foodSat: 10, eatTime: 0.84, spoil: 1200, desc: '' },
  // two colours, identical to eat — which bush you found is flavour, not a stat choice
  /* Berries (0.827): all fill you the same, and each kind adds its own. Red heals a little, blue quenches 1.5x the
     thirst (FOOD_NUTRITION, 54-stats-effects.js), black is poisonous, yellow fills 1.5x the food, white takes thirst
     but washes a second off every bad effect running (foodCleanse, 22-main-loop.js). */
  [ITEM.BERRIES]:       { name: 'Red berries',    stack: 60, icon: 'redberries',    foodSatFull: 0, food: 5,  foodSat: 5,  eatTime: 0.6, spoil: 600, foodHeal: 2, desc: '' },
  [ITEM.BLUE_BERRIES]:  { name: 'Blue berries',   stack: 60, icon: 'blueberries',   foodSatFull: 0, food: 5,  foodSat: 5,  eatTime: 0.6, spoil: 600, desc: '' },
  // blackberries (0.7947 as the yellow ones): they fill you like the others, but they are poisonous (EFFECT_DEFS.poison)
  [ITEM.BLACKBERRIES]:  { name: 'Blackberries',   stack: 60, icon: 'blackberries',  foodSatFull: 0, food: 5,  foodSat: 5,  eatTime: 0.6, spoil: 600,
                          foodEffect: 'poison', foodEffectTime: 5, desc: 'Poisonous' },   // 5 s, not poison's 10 (0.8291)
  [ITEM.YELLOW_BERRIES]: { name: 'Yellow berries', stack: 60, icon: 'yellowberries', foodSatFull: 0, food: 7.5, foodSat: 5, eatTime: 0.6, spoil: 600, desc: '' },
  [ITEM.WHITE_BERRIES]: { name: 'White berries',  stack: 60, icon: 'whiteberries',  foodSatFull: 0, food: 5,  foodSat: 5,  eatTime: 0.6, spoil: 600, foodCleanse: 1,
                          desc: 'Takes a little thirst, but washes a second off every bad effect with a time' },
  // 0.761: the crafted pie is RAW now (same id, so saves keep it) and a furnace bakes it
  [ITEM.PUMPKIN_PIE]:   { name: 'Raw pumpkin pie', stack: 10, icon: 'pumpkin_pie',  foodSatFull: 15, food: 30,  foodSat: 30,  eatTime: 4.8, foodEffect: 'nausea', foodEffectChance: 0.5, spoil: 3600, desc: '' },
  [ITEM.COOKED_PUMPKIN_PIE]: { name: 'Pumpkin pie', stack: 10, icon: 'cooked_pumpkin_pie', foodSatFull: 35, food: 60, foodSat: 70, eatTime: 4.8, foodHeal: 15, foodEffect: 'spicyPumpkin', spoil: 7200, desc: '' },
  [ITEM.MUSHROOM_STEW]: { name: 'Mushroom stew',  stack: 20, icon: 'mushroom_stew', foodSatFull: 25, food: 45,  foodSat: 60, eatTime: 3, foodReturn: 265, foodHeal: 5, spoil: 3600, desc: '' },
  [ITEM.BREAD]:         { name: 'Bread',          stack: 99, icon: 'bread',         foodSatFull: 20, food: 30,  foodSat: 40,  eatTime: 2.04, spoil: 14400, desc: '' },
  [ITEM.GOLDEN_APPLE]:  { name: 'Golden apple',   stack: 30, icon: 'golden_apple',  foodSatFull: 40, food: 25,  foodSat: 75,  eatTime: 2.4, foodHeal: 10, foodEffect: 'rapidRegen', desc: '' },
  [ITEM.MUTTON]:        { name: 'Mutton',         stack: 99, icon: 'mutton',        foodSatFull: 5, food: 10,  foodSat: 15,  eatTime: 2.16, foodEffect: 'nausea', foodEffectChance: 0.5, spoil: 1800, desc: '' },
  [ITEM.COOKED_MUTTON]: { name: 'Cooked mutton',  stack: 99, icon: 'cooked_mutton', foodSatFull: 20, food: 30,  foodSat: 35,  eatTime: 2.4, spoil: 14400, desc: '' },
  // beef is the best meat in the game once cooked, which is what makes hunting cows worth it
  [ITEM.BEEF]:          { name: 'Raw beef',       stack: 99, icon: 'beef',          foodSatFull: 5, food: 15,  foodSat: 20,  eatTime: 2.28, foodEffect: 'nausea', foodEffectChance: 0.5, spoil: 2000, desc: '' },
  [ITEM.COOKED_BEEF]:   { name: 'Steak',          stack: 99, icon: 'cooked_beef',   foodSatFull: 25, food: 40,  foodSat: 50, eatTime: 2.64, spoil: 28800, desc: '' },
  [ITEM.ROTTEN_FLESH]:  { name: 'Rotten flesh',   stack: 99, icon: 'rotten_flesh',  foodSatFull: 0, food: 10,  foodSat: 0,  eatTime: 1.56, foodEffect: 'nausea', foodEffectChance: 0.9, spoil: 7200, desc: 'Edible, but barely' },
  // 0.821: five rotten flesh pressed into one, which a bench works into leather (25-crafting.js)
  [ITEM.COMPRESSED_ROTTEN_FLESH]: { name: 'Compressed rotten flesh', stack: 60, icon: 'compressed_rotten_flesh', desc: 'Five rotten flesh pressed together. A bench works it into leather' },
  // pork (0.789): a shade under beef cooked, and it spoils faster than any other meat raw
  [ITEM.PORK]:          { name: 'Raw pork',       stack: 99, icon: 'pork',          foodSatFull: 5, food: 15,  foodSat: 20,  eatTime: 2.28, foodEffect: 'nausea', foodEffectChance: 0.6, spoil: 2600, desc: '' },
  [ITEM.COOKED_PORK]:   { name: 'Cooked pork',    stack: 99, icon: 'cooked_pork',   foodSatFull: 20, food: 35,  foodSat: 45,  eatTime: 2.52, spoil: 22400, desc: '' },
  // fish (0.805): lighter than meat and quicker to eat; the bigger the fish, the more it fills. Raw may turn the stomach
  [ITEM.COD]:            { name: 'Raw cod',        stack: 99, icon: 'cod',            foodSatFull: 5, food: 10, foodSat: 10, eatTime: 1.68, foodEffect: 'nausea', foodEffectChance: 0.4, spoil: 1800, desc: '' },
  [ITEM.COOKED_COD]:     { name: 'Cooked cod',     stack: 99, icon: 'cooked_cod',     foodSatFull: 15, food: 25, foodSat: 30, eatTime: 1.92, spoil: 14400, desc: '' },
  [ITEM.SALMON]:         { name: 'Raw salmon',     stack: 99, icon: 'salmon',         foodSatFull: 5, food: 10, foodSat: 15, eatTime: 1.8, foodEffect: 'nausea', foodEffectChance: 0.4, spoil: 1800, desc: '' },
  [ITEM.COOKED_SALMON]:  { name: 'Cooked salmon',  stack: 99, icon: 'cooked_salmon',  foodSatFull: 15, food: 30, foodSat: 35, eatTime: 2.04, spoil: 14400, desc: '' },
  [ITEM.PIKE]:           { name: 'Raw pike',       stack: 99, icon: 'pike',           foodSatFull: 5, food: 15, foodSat: 15, eatTime: 1.92, foodEffect: 'nausea', foodEffectChance: 0.4, spoil: 1800, desc: '' },
  [ITEM.COOKED_PIKE]:    { name: 'Cooked pike',    stack: 99, icon: 'cooked_pike',    foodSatFull: 20, food: 30, foodSat: 40, eatTime: 2.16, spoil: 14400, desc: '' },
  [ITEM.CATFISH]:        { name: 'Raw catfish',    stack: 99, icon: 'catfish',        foodSatFull: 5, food: 15, foodSat: 20, eatTime: 2.04, foodEffect: 'nausea', foodEffectChance: 0.4, spoil: 1800, desc: '' },
  [ITEM.COOKED_CATFISH]: { name: 'Cooked catfish', stack: 99, icon: 'cooked_catfish', foodSatFull: 20, food: 35, foodSat: 45, eatTime: 2.28, spoil: 14400, desc: '' },
  // rendered off a pig. Not food — it is fuel and a crafting ingredient, so it never spoils
  [ITEM.FAT]:           { name: 'Fat',            stack: 99, icon: 'fat',           desc: 'Burns well for 1.5 smelt. Used as crafting ingredient' },
// Armor. `equip` names the equipment slot the piece goes into; `armor` is its point value.
// 100 armor points = the full 5-icon bar, 5 points a quarter icon (x5 in 0.82, it was out of 20). `armorMat`
// picks both the armor-bar sprite theme and the body overlay on the preview (<mat>/<mat>_<part>.png, 0.82).
// Optional stat modifiers, all additive across worn pieces:
//   moveSpeed   fraction of walk speed, e.g. -0.025 = the 2.5% slow each iron plate costs
//   strength    flat bonus damage added to whatever the held weapon deals
//   atkSpeed    fraction added to the attack-speed multiplier
  /* Leather is the insulating tier: every piece traps heat, which is 8% cold resistance and a 5%
     heat PENALTY each. The boots are the one piece that helps you move (+0.5%). */
  [ITEM.LEATHER_HELMET]:     { name: 'Leather cap',        stack: 1, icon: 'leather_helmet',     equip: 'helmet',     armor: 5, tier: 1, durability: 55,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, heatstrokeResist: 0.25, heatstrokeTrigger: 5, desc: '' },
  [ITEM.LEATHER_CHESTPLATE]: { name: 'Leather tunic',      stack: 1, icon: 'leather_chestplate', equip: 'chestplate', armor: 15, tier: 1, durability: 80,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, desc: '' },
  [ITEM.LEATHER_LEGGINGS]:   { name: 'Leather trousers',   stack: 1, icon: 'leather_leggings',   equip: 'leggings',   armor: 10, tier: 1, durability: 75,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, desc: '' },
  [ITEM.LEATHER_BOOTS]:      { name: 'Leather boots',      stack: 1, icon: 'leather_boots',      equip: 'boots',      armor: 5, tier: 1, durability: 65,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, moveSpeed: 0.005, desc: '' },
  [ITEM.LEATHER_GLOVES]:     { name: 'Leather gloves',     stack: 1, icon: 'leather_gloves',     equip: 'gloves',     armor: 5, tier: 1, durability: 50,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, strength: 1.25, desc: '' },
  [ITEM.IRON_HELMET]:        { name: 'Iron helmet',        stack: 1, icon: 'iron_helmet',        equip: 'helmet',     armor: 10, tier: 3, durability: 165, armorMat: 'iron',    moveSpeed: -0.01, desc: '' },
  [ITEM.IRON_CHESTPLATE]:    { name: 'Iron chestplate',    stack: 1, icon: 'iron_chestplate',    equip: 'chestplate', armor: 30, tier: 3, durability: 240, armorMat: 'iron',    moveSpeed: -0.03, desc: '' },
  [ITEM.IRON_LEGGINGS]:      { name: 'Iron leggings',      stack: 1, icon: 'iron_leggings',      equip: 'leggings',   armor: 25, tier: 3, durability: 225, armorMat: 'iron',    moveSpeed: -0.025, desc: '' },
  [ITEM.IRON_BOOTS]:         { name: 'Iron boots',         stack: 1, icon: 'iron_boots',         equip: 'boots',      armor: 10, tier: 3, durability: 195, armorMat: 'iron',    moveSpeed: -0.01, desc: '' },
  // gloves have no preview overlay sheet yet — the preview only draws the four body pieces
  [ITEM.IRON_GLOVES]:        { name: 'Iron gloves',        stack: 1, icon: 'iron_gloves',        equip: 'gloves',     armor: 5, tier: 3, durability: 150, armorMat: 'iron',    moveSpeed: -0.005, strength: 3.75, desc: '' },
  [ITEM.GOLDEN_HELMET]:      { name: 'Golden helmet',      stack: 1, icon: 'golden_helmet',      equip: 'helmet',     armor: 10, tier: 3, durability: 77,  armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_CHESTPLATE]:  { name: 'Golden chestplate',  stack: 1, icon: 'golden_chestplate',  equip: 'chestplate', armor: 25, tier: 3, durability: 112, armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_LEGGINGS]:    { name: 'Golden leggings',    stack: 1, icon: 'golden_leggings',    equip: 'leggings',   armor: 15, tier: 3, durability: 105, armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_BOOTS]:       { name: 'Golden boots',       stack: 1, icon: 'golden_boots',       equip: 'boots',      armor: 10, tier: 3, durability: 91,  armorMat: 'golden',  desc: '' },
  [ITEM.DIAMOND_HELMET]:     { name: 'Diamond helmet',     stack: 1, icon: 'diamond_helmet',     equip: 'helmet',     armor: 15, tier: 5, durability: 363, armorMat: 'diamond', desc: '' },
  [ITEM.DIAMOND_CHESTPLATE]: { name: 'Diamond chestplate', stack: 1, icon: 'diamond_chestplate', equip: 'chestplate', armor: 40, tier: 5, durability: 528, armorMat: 'diamond', desc: '' },
  [ITEM.DIAMOND_LEGGINGS]:   { name: 'Diamond leggings',   stack: 1, icon: 'diamond_leggings',   equip: 'leggings',   armor: 30, tier: 5, durability: 495, armorMat: 'diamond', desc: '' },
  [ITEM.DIAMOND_BOOTS]:      { name: 'Diamond boots',      stack: 1, icon: 'diamond_boots',      equip: 'boots',      armor: 15, tier: 5, durability: 429, armorMat: 'diamond', desc: '' },
  /* Cloth (0.824) is the light, cool tier: little armor, but each piece is 8% heat resistance, and the full set
     guards against sandstorms and heatstroke (ARMOR_SET_BONUS, 31-equipment.js). A hat on — the bandana or the
     leather cap — shades the head (0.825): heatstroke comes 25% slower and only 5°C hotter (heatstrokeResist,
     heatstrokeTrigger; 54-stats-effects.js). */
  [ITEM.CLOTH_HELMET]:       { name: 'Cloth bandana',      stack: 1, icon: 'cloth_helmet',       equip: 'helmet',     armor: 5, tier: 1, durability: 40,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, heatstrokeResist: 0.25, heatstrokeTrigger: 5, desc: '' },
  [ITEM.CLOTH_CHESTPLATE]:   { name: 'Cloth tunic',        stack: 1, icon: 'cloth_chestplate',   equip: 'chestplate', armor: 10, tier: 1, durability: 60,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, desc: '' },
  [ITEM.CLOTH_LEGGINGS]:     { name: 'Cloth trousers',     stack: 1, icon: 'cloth_leggings',     equip: 'leggings',   armor: 5, tier: 1, durability: 55,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, desc: '' },
  [ITEM.CLOTH_BOOTS]:        { name: 'Cloth boots',        stack: 1, icon: 'cloth_boots',        equip: 'boots',      armor: 5, tier: 1, durability: 45,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, desc: '' },
  [ITEM.CLOTH_GLOVES]:       { name: 'Cloth gloves',       stack: 1, icon: 'cloth_gloves',       equip: 'gloves',     armor: 5, tier: 1, durability: 35,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, desc: '' },
  // `beltSlots` opens that many quick-access slots above the equipment panel while worn
  [ITEM.BELT]:               { name: 'Belt',               stack: 1, icon: 'belt',               equip: 'belt',       beltSlots: 5, hotbarSlots: 1, desc: 'Worn on the belt. Adds special slots and 1 hotbar slot' },
  // ...and `packSlots` opens that many carrying slots under the main grid (41-backpack.js)
  [ITEM.BACKPACK]:           { name: 'Backpack',           stack: 1, icon: 'backpack',           equip: 'back',       packSlots: 16,
                               desc: 'Worn on the back. Adds two more rows of carrying space' },
};

/* ---- tool wear (0.7992) ----
   A hoe used to wear out a quarter faster than the rest of its set for no reason anyone could name, so
   each one now lasts exactly as long as its own pickaxe. Then every tool and weapon — not armor, and not
   the hammer or chisel, whose wear is one point per shaped block — gained 20%. Written as a pass over the
   table rather than 30 edited numbers, so the ratios between materials stay where they were. */
for (const [hoe, pick] of [[ITEM.FLINT_HOE, ITEM.FLINT_PICKAXE], [ITEM.STONE_HOE, ITEM.STONE_PICKAXE],
                           [ITEM.IRON_HOE, ITEM.IRON_PICKAXE], [ITEM.GOLDEN_HOE, ITEM.GOLDEN_PICKAXE],
                           [ITEM.BRONZE_HOE, ITEM.BRONZE_PICKAXE], [ITEM.DIAMOND_HOE, ITEM.DIAMOND_PICKAXE]])
  if (ITEM_PROPS[hoe] && ITEM_PROPS[pick]) ITEM_PROPS[hoe].durability = ITEM_PROPS[pick].durability;
const TOOL_DURABILITY_MUL = 1.2;
for (const p of Object.values(ITEM_PROPS))
  if (p && p.durability && (p.tool || p.ranged || p.shield)) p.durability = Math.round(p.durability * TOOL_DURABILITY_MUL);
// every meat leaves rotten flesh behind when it turns, cooked or raw (0.7992)
for (const id of [ITEM.MUTTON, ITEM.COOKED_MUTTON, ITEM.BEEF, ITEM.COOKED_BEEF, ITEM.PORK, ITEM.COOKED_PORK,
                  ITEM.COD, ITEM.COOKED_COD, ITEM.SALMON, ITEM.COOKED_SALMON,          // fish too (0.805)
                  ITEM.PIKE, ITEM.COOKED_PIKE, ITEM.CATFISH, ITEM.COOKED_CATFISH])
  if (ITEM_PROPS[id]) ITEM_PROPS[id].spoilInto = ITEM.ROTTEN_FLESH;
