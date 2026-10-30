'use strict';
/* items/materials.js: what things are made of: sticks, fiber and cloth, ores, ingots, nuggets and powders, gems, coal, and the plants that are only ingredients (wheat, sugar cane).
   A group of the item table (items/items.js says what each field of an entry is for, and holds every item's id). */
defineItems('materials', {
  [ITEM.STICK]:         { name: 'Stick',         stack: 79, icon: 'stick', desc: 'Used as crafting ingredient or fuel for 0.25 smelt' },
  [ITEM.BARK]:          { name: 'Bark',          stack: 79, icon: 'bark', desc: 'Used as fuel for 0.75 smelt' },
  [ITEM.FLINT]:         { name: 'Flint',         stack: 79, icon: 'flint', desc: 'Used as crafting ingredient for flint tools' },
  // from glow vines, with any tool; five make a glowcrystal block
  [ITEM.GLOW_CRYSTAL]:  { name: 'Glow crystal',  stack: 79, icon: 'glow_crystals', desc: 'Used as crafting ingredient' },
  // gems: 1-2 from their ores with an iron pickaxe or better
  [ITEM.EMERALD]:       { name: 'Emerald',       stack: 79, icon: 'emerald',  desc: 'A rare gem from mountain rock' },
  [ITEM.RUBY]:          { name: 'Ruby',          stack: 79, icon: 'ruby',     desc: 'A rare gem from deep caves' },
  [ITEM.SAPPHIRE]:      { name: 'Sapphire',      stack: 79, icon: 'sapphire', desc: 'A rare gem found under the hills' },
  [ITEM.TOPAZ]:         { name: 'Topaz',         stack: 79, icon: 'topaz',    desc: 'A rare gem from the middle depths' },   // 0.769
  // metal powders: a mortar grinds one raw ore into two, and each smelts into an ingot
  [ITEM.IRON_POWDER]:   { name: 'Iron powder',   stack: 79, icon: 'iron_powder',   desc: 'Can be smelted in furnace into iron ingot' },
  [ITEM.TIN_POWDER]:    { name: 'Tin powder',    stack: 79, icon: 'tin_powder',    desc: 'Can be smelted in furnace into tin ingot' },
  [ITEM.COPPER_POWDER]: { name: 'Copper powder', stack: 79, icon: 'copper_powder', desc: 'Can be smelted in furnace into copper ingot' },
  [ITEM.GOLD_POWDER]:   { name: 'Gold powder',   stack: 79, icon: 'gold_powder',   desc: 'Can be smelted in furnace into gold ingot' },
  // not made or used by anything yet: reserved for bronze and steel
  [ITEM.BRONZE_POWDER]: { name: 'Bronze powder', stack: 79, icon: 'bronze_powder', desc: 'Can be smelted in furnace into bronze ingot' },   // 0.774
  [ITEM.STEEL_POWDER]:  { name: 'Steel powder',  stack: 79, icon: 'steel_powder',  desc: 'Can be smelted in furnace into steel ingot' },
  // burnt fuel leaves ashes in the furnace's fourth slot
  [ITEM.ASHES]:         { name: 'Ashes',         stack: 79, icon: 'ashes',         desc: 'Used as crafting ingredient, left in a furnace by burnt fuel' },
  // bronze metal: copper and tin powder ground together, smelted into ingots
  [ITEM.BRONZE_INGOT]:  { name: 'Bronze ingot',  stack: 79, icon: 'bronze_ingot',  desc: 'Used as crafting ingredient' },
  [ITEM.BRONZE_NUGGET]: { name: 'Bronze nugget', stack: 79, icon: 'bronze_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.CLAY_BALL]:     { name: 'Clay ball',     stack: 79, icon: 'clay_ball', desc: 'Used as crafting ingredient' },
  [ITEM.GLASS_SHARD]:   { name: 'Glass shard',   stack: 79, icon: 'glass_shard', desc: 'Used as crafting ingredient' },
  [ITEM.SULFUR]:        { name: 'Sulfur',        stack: 79, icon: 'sulfur', desc: 'Used as crafting ingredient' },
  [ITEM.CHARCOAL]:      { name: 'Charcoal',      stack: 79, icon: 'charcoal', desc: 'Used as crafting ingredient' },
  [ITEM.GUNPOWDER]:     { name: 'Gunpowder',     stack: 79, icon: 'gunpowder', desc: 'Used as crafting ingredient' },
  [ITEM.SUGAR]:         { name: 'Sugar',         stack: 79, icon: 'sugar', desc: 'Used as crafting ingredient' },
  [ITEM.PAPER]:         { name: 'Paper',         stack: 79, icon: 'paper', desc: 'Used as crafting ingredient' },
  [ITEM.FLOUR]:         { name: 'Flour',         stack: 79, icon: 'flour', desc: 'Used as crafting ingredient' },
  [ITEM.BRICK]:         { name: 'Brick',         stack: 79, icon: 'brick', desc: 'Used as crafting ingredient' },
  [ITEM.GLOW_DUST]:     { name: 'Glow dust',     stack: 79, icon: 'glow_dust', desc: 'Used as crafting ingredient' },
  [ITEM.STRING]:        { name: 'String',        stack: 79, icon: 'string', desc: 'Used as crafting ingredient' },
  [ITEM.FEATHER]:       { name: 'Feather',       stack: 79, icon: 'feather', desc: 'Used as crafting ingredient' },
  [ITEM.FIBER]:         { name: 'Fiber',         stack: 79, icon: 'fiber', desc: 'Used as crafting ingredient' },
  [ITEM.CLOTH]:         { name: 'Cloth',         stack: 79, icon: 'cloth', desc: 'Used as crafting ingredient' },
  [ITEM.LEATHER]:       { name: 'Leather',       stack: 79, icon: 'leather', desc: 'Used as crafting ingredient' },
  [ITEM.BONE]:          { name: 'Bone',          stack: 79, icon: 'bone', desc: 'Used as crafting ingredient' },
  [ITEM.BONE_ASH]:      { name: 'Bone ash',      stack: 79, icon: 'bone_ash', desc: 'A bone ground at the mortar makes two. Used as crafting ingredient' },   // 0.84
  [ITEM.LEATHER_STRIP]: { name: 'Leather strip', stack: 79, icon: 'leather_strip', desc: 'Three are cut from a leather at the bench. Used for belts and backpacks' },
  [ITEM.CHITIN_PLATE]:  { name: 'Chitin plate',  stack: 79, icon: 'chitin_plate', desc: 'A hard plate of a termite\'s shell, from the Savanna' },
// ores
  [ITEM.COAL]:          { name: 'Coal',          stack: 79, icon: 'coal', desc: 'Used as fuel for 5 smelts' },
  [ITEM.COAL_CHUNK]:    { name: 'Coal chunk',    stack: 79, icon: 'coal_chunk', desc: 'Used as fuel for 1 smelt' },
  // charcoal splits the same way coal does — 8 chunks to a charcoal, half a smelt each
  [ITEM.CHARCOAL_CHUNK]: { name: 'Charcoal chunk', stack: 79, icon: 'charcoal_chunk', desc: 'Used as fuel for 0.8 of a smelt' },
  [ITEM.RAW_IRON]:      { name: 'Raw iron',      stack: 79, icon: 'raw_iron', desc: 'Can be smelted in furnace into iron ingot' },
  [ITEM.IRON_INGOT]:    { name: 'Iron ingot',    stack: 79, icon: 'iron_ingot', desc: 'Used as crafting ingredient' },
  [ITEM.IRON_NUGGET]:   { name: 'Iron nugget',   stack: 79, icon: 'iron_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.RAW_COPPER]:    { name: 'Raw copper',    stack: 79, icon: 'raw_copper', desc: 'Can be smelted in furnace into copper ingot' },
  [ITEM.COPPER_INGOT]:  { name: 'Copper ingot',  stack: 79, icon: 'copper_ingot', desc: 'Used as crafting ingredient' },
  [ITEM.COPPER_NUGGET]: { name: 'Copper nugget', stack: 79, icon: 'copper_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.RAW_TIN]:       { name: 'Raw tin',       stack: 79, icon: 'raw_tin', desc: 'Can be smelted in furnace into tin ingot' },
  [ITEM.TIN_INGOT]:     { name: 'Tin ingot',     stack: 79, icon: 'tin_ingot', desc: 'Used as crafting ingredient' },
  [ITEM.TIN_NUGGET]:    { name: 'Tin nugget',    stack: 79, icon: 'tin_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.RAW_GOLD]:      { name: 'Raw gold',      stack: 79, icon: 'raw_gold', desc: 'Can be smelted in furnace into gold ingot' },
  [ITEM.GOLD_INGOT]:    { name: 'Gold ingot',    stack: 79, icon: 'gold_ingot', desc: 'Used as crafting ingredient' },
  [ITEM.GOLD_NUGGET]:   { name: 'Gold nugget',   stack: 79, icon: 'gold_nugget', desc: 'Used as crafting ingredient' },
  [ITEM.DIAMOND]:       { name: 'Diamond',       stack: 79, icon: 'diamond', desc: 'Used as crafting ingredient' },
 //plants
  [ITEM.SUGAR_CANE]:    { name: 'Sugar cane',    stack: 79, icon: 'sugarcane', desc: 'Can be turned into sugar in a mortar' },
  [ITEM.WHEAT]:         { name: 'Wheat',         stack: 79, icon: 'wheat', desc: 'Can be turned into flour in a mortar' },
  // its own picture since 0.8098
  [ITEM.SALT]: { name: 'Salt', stack: 50, icon: 'salt_dust', desc: 'Scraped from salt crust' },   // 0.8097
  [ITEM.STONE_PEBBLE]: { name: 'Stone pebble', stack: 50, icon: 'stone_pebble', desc: 'Five make a cobblestone block' },   // 0.8095; cobblestone 0.826
  [ITEM.SEASHELL]:     { name: 'Seashell', stack: 79, icon: 'seashell', desc: 'Found on the sea\'s beaches' },
  [ITEM.PEARL]:        { name: 'Pearl', stack: 79, icon: 'pearl', desc: 'Grown from sand in a clam on a warm sea floor' },
  [ITEM.FUR]:          { name: 'Fur', stack: 79, icon: 'fur', desc: 'Soft, thick fur, from otters and polar bears. Lines bronze armor' },
  // five rotten flesh pressed into one, which a bench works into leather (player/crafting.js)
  [ITEM.COMPRESSED_ROTTEN_FLESH]: { name: 'Compressed rotten flesh', stack: 50, icon: 'compressed_rotten_flesh', desc: 'Five rotten flesh pressed together. A bench works it into leather' },
  // rendered off a pig. Not food — it is fuel and a crafting ingredient, so it never spoils
  [ITEM.FAT]:           { name: 'Fat',            stack: 79, icon: 'fat',           desc: 'Burns well for 1.5 smelt. Used as crafting ingredient' },
  [ITEM.COCOA_BEANS]:   { name: 'Cocoa beans',    stack: 79, icon: 'cocoa_beans',   desc: 'From a ripe cocoa pod on a jungle trunk. Five grind into cocoa powder at the mortar' },
  [ITEM.COCOA_POWDER]:  { name: 'Cocoa powder',   stack: 79, icon: 'cocoa_powder',  desc: 'Ground from cocoa beans at the mortar. Used as crafting ingredient' },
});
