'use strict';
/* items/items.js: THE ITEM TABLE. Every item's id (ITEM), and the table that says what each one is (ITEM_PROPS).
   Items are everything with an id of 256 and up; blocks (ids under 256) are blocks/blocks.js.

   ITEM holds every id in one list, here. AN ID IS IN THE SAVES: never change one, never give a number to
   something else. (The steel tools and armor have the ids the diamond ones had: they took their place.)

   ITEM_PROPS is filled by one file per group of items, which load right after this one:
     materials.js    what things are made of (ores, ingots, fiber, gems, coal, wheat...)
     tools.js        shovels, pickaxes, hatchets, hoes, shears, the chisel, the hammer, the wands
     weapons.js      swords, the bow and arrows, the shield
     equipment.js    armor, the belt, the backpack
     food.js         everything eaten
     containers.js   the bucket, the glass bottle, the bowl
     useables.js     keys, the snowball, the saddle, fire
   and finish.js, last, runs the passes over the whole table (tool wear, armor wear, what food rots into).
   A NEW ITEM: its id at the end of ITEM, its entry in the group file it belongs to, its picture's name in
   ITEM_TEXTURES (01-textures-data.js). A new group: a file that calls defineItems, its tag in index.html
   between this file and finish.js.

   WHAT AN ENTRY HOLDS (an item leaves out what it does not have)
     name, desc      what the tooltip shows
     icon            its picture: a name in ITEM_TEXTURES
     stack           how many fit in a slot (79 for most, 1 for tools and gear)
     group           which file it came from: defineItems writes it
     durability      uses before it breaks (a tool, a weapon, armor, the chisel and hammer)
   a tool or a weapon
     tool            'shovel', 'pick', 'hatchet', 'hoe', 'sword', 'shears': which blocks it is quick on
                     (TOOL_BLOCKS, blocks/mining-rules.js)
     tier            0 bare hand, 1 flint, 2 stone, 3 iron and gold, 4 bronze, 5 steel: what it may mine (MINE_REQ)
     toolSpeed       how many times faster it mines its blocks
     damage, attackSpeed
     ranged, ammo    a bow ('bow') and what it shoots ('arrow'): 38-ranged.js
     shield          true: raised with the right button (40-shield.js)
   something worn
     equip           the equipment slot it goes in: 'helmet', 'chestplate', 'leggings', 'boots', 'gloves',
                     'belt', 'back', 'necklace', 'accessories', 'offhand' (player/equipment.js)
     armor           its armor points (100 = the full bar); armorMat: its material, which picks its pictures on
                     the body and on the armor bar (EQUIP_MATS in 01-textures-data.js, ARMOR_HUD_ART in ui/vitals-hud.js)
     moveSpeed, strength, atkSpeed, coldResist, heatResist, heatstrokeResist, heatstrokeTrigger
                     what wearing it changes, added up over every piece (player/stat-getters.js)
     beltSlots, hotbarSlots, packSlots, chisel
                     a belt's quick slots, a backpack's carrying slots, the chisel's and hammer's work
     wear            the name of what is seen on the body apart from armor (WORN_TEXTURES, 01-textures-data.js)
   something eaten or drunk (player/stats.js foodPropsOf, player/eating.js)
     food, foodSat, foodSatFull, foodHeal    what it gives, out of 100
     eatTime         seconds to eat it; drink: true = it is drunk
     foodEffect, foodEffectChance, foodEffectTime, foodCleanse, foodClearEffects
     foodReturn      the item handed back (a bowl, a bucket, a bottle)
     spoil           seconds until it goes off; spoilInto: what is left then (44-spoil.js)
   and a few of its own: key (a door's or chest's key), throwable, ...

   Main thread only: the workers never need an item. It loads right after the block ids exist (index.html). */

// Items (IDs >= 256) — separate registry from blocks
const ITEM = { STICK: 256, COAL: 257, COAL_CHUNK: 258, RAW_IRON: 259, DIAMOND: 260, APPLE: 261,
               FLINT: 262, CLAY_BALL: 263, SNOWBALL: 264, BOWL: 265, MUSHROOM_STEW: 266, GLASS_SHARD: 267,
               IRON_INGOT: 268, IRON_NUGGET: 269, MELON_SLICE: 270,
               IRON_SHOVEL: 271, IRON_PICKAXE: 272, IRON_HATCHET: 273,
               FLINT_SHOVEL: 274, FLINT_PICKAXE: 275, FLINT_HATCHET: 276,
               STONE_SHOVEL: 277, STONE_PICKAXE: 278, STONE_HATCHET: 279,
               STEEL_SHOVEL: 280, STEEL_PICKAXE: 281, STEEL_HATCHET: 282,
               BUCKET: 283, WATER_BUCKET: 284, WHEAT: 285, PUMPKIN_PIE: 286,
               FLINT_HOE: 287, STONE_HOE: 288, IRON_HOE: 289, STEEL_HOE: 290,
               LAVA_BUCKET: 291, SULFUR: 292, CHARCOAL: 293, GUNPOWDER: 294, SUGAR_CANE: 295,
               SUGAR: 296, PAPER: 297, GOLDEN_PICKAXE: 298, GOLDEN_HATCHET: 299, GOLDEN_SHOVEL: 300,
               GOLDEN_HOE: 301, FLOUR: 302, BOOK: 303, RAW_COPPER: 304, COPPER_INGOT: 305, COPPER_NUGGET: 306,
               RAW_TIN: 307, TIN_INGOT: 308, TIN_NUGGET: 309, RAW_GOLD: 310, GOLD_INGOT: 311, GOLD_NUGGET: 312,
               GLOW_DUST: 313, BRICK: 314, GOLDEN_APPLE: 315, BREAD: 316, FLINT_SWORD: 317, STONE_SWORD: 318,
               IRON_SWORD: 319, GOLDEN_SWORD: 320, STEEL_SWORD: 321, STRING: 322, IRON_SHEARS: 323, FEATHER: 324,
               MUTTON: 325, COOKED_MUTTON: 326,
               LEATHER_HELMET: 327, LEATHER_CHESTPLATE: 328, LEATHER_LEGGINGS: 329, LEATHER_BOOTS: 330,
               IRON_HELMET: 331, IRON_CHESTPLATE: 332, IRON_LEGGINGS: 333, IRON_BOOTS: 334,
               GOLDEN_HELMET: 335, GOLDEN_CHESTPLATE: 336, GOLDEN_LEGGINGS: 337, GOLDEN_BOOTS: 338,
               STEEL_HELMET: 339, STEEL_CHESTPLATE: 340, STEEL_LEGGINGS: 341, STEEL_BOOTS: 342,
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
               // bronze: the tier between iron and diamond
               BRONZE_INGOT: 375, BRONZE_NUGGET: 376, BRONZE_SWORD: 377, BRONZE_SHOVEL: 378,
               BRONZE_PICKAXE: 379, BRONZE_HATCHET: 380, BRONZE_HOE: 381,
               ASHES: 382,     // 0.775
               CHISEL: 383,    // 0.78
               HAMMER: 384,    // 0.788
               // the pig and what comes off one
               PORK: 385, COOKED_PORK: 386, FAT: 387,
               BLACKBERRIES: 388,                    // YELLOW_BERRIES until 0.827, when the real yellow came
               // fish (entities/entities.js): what each of the four drops, and its cooked form
               COD: 389, COOKED_COD: 390, SALMON: 391, COOKED_SALMON: 392,
               PIKE: 393, COOKED_PIKE: 394, CATFISH: 395, COOKED_CATFISH: 396,
               CANTALOUPE_SLICE: 397,                                            // 0.8091
               STONE_PEBBLE: 398,                                                // 0.8095
               SALT: 399,
              COMPRESSED_ROTTEN_FLESH: 400,
              CLOTH_HELMET: 401, CLOTH_CHESTPLATE: 402, CLOTH_LEGGINGS: 403, CLOTH_BOOTS: 404, CLOTH_GLOVES: 405,
              YELLOW_BERRIES: 406, WHITE_BERRIES: 407,
              BUILD_WAND: 408,                     // 0.8371, creative's building wand (player/wands.js wandBuild)
              BREAK_WAND: 409,                     // 0.8374, and its breaking wand (wandBreak)
              BONE_ASH: 410,                       // 0.84: ground from bones at the mortar, or out of a broken bone block
              // keys that lock a door (blocks/doors.js); only the wooden one is made yet, the rest wait for their use
              WOODEN_KEY: 411, IRON_KEY: 412, GOLDEN_KEY: 413, COPPER_KEY: 414,
              // a glass bottle and the water it carries; fire you can hold (what a hellhound leaves and eats)
              GLASS_BOTTLE: 415, WATER_BOTTLE: 416, FIRE: 417,
              CHITIN_PLATE: 418,                   // a termite's shell plate (entities/termite.js)
              // bronze armor, between iron and steel: chitin and feathers in it (items/equipment.js)
              BRONZE_HELMET: 419, BRONZE_CHESTPLATE: 420, BRONZE_LEGGINGS: 421, BRONZE_BOOTS: 422, BRONZE_GLOVES: 423,
              LEATHER_STRIP: 424 };                // cut from leather at the bench: belts and backpacks   // 0.827   // 0.824                                   // 0.821                                                      // 0.8097                                             // 0.7947                            // 0.769   // PUMPKIN_PIE (286) is the raw pie since 0.761

const ITEM_PROPS = {};
// a group file's items into the table; each entry remembers its group
function defineItems(group, props) {
  for (const id in props) { props[id].group = group; ITEM_PROPS[id] = props[id]; }
}
