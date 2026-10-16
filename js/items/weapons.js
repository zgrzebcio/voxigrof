'use strict';
/* items/weapons.js: weapons: swords, the bow and its arrows, the shield.
   A group of the item table (items/items.js says what each field of an entry is for, and holds every item's id). */
defineItems('weapons', {
  /* ---- ranged ----
     A bow is not a `tool` and not a weapon you swing: `ranged` is the marker 38-ranged.js reads,
     and it names the family so a crossbow or a firearm can join later without touching anything
     here. `ammo` marks what a ranged weapon consumes; the damage lives on the AMMO, since which
     arrow you loose is what decides how hard it lands. */
  // the basic bow (id BOW): the first of the bows, the others have art waiting
  [ITEM.BOW]:           { name: 'Basic bow',     stack: 1,  icon: 'basic_bow', ranged: 'bow', damage: 5, attackSpeed: 1.0, durability: 160,
                          desc: 'Hold right click to draw, release to loose an arrow' },
  [ITEM.ARROW]:         { name: 'Arrow',         stack: 79, icon: 'arrow', ammo: 'arrow', desc: 'Ammunition for bows' },
  // worn in the OFFHAND equipment slot; `shield` is what 40-shield.js keys off. `wear`: the pictures of the one you
  // hold, <wear>_front and <wear>_back (WORN_TEXTURES, 01-textures-data.js); `icon` is only its picture in a slot
  [ITEM.SHIELD]:        { name: 'Shield',        stack: 1,  icon: 'shield', wear: 'shield', equip: 'offhand', shield: true, durability: 336,
                          desc: 'Equip in the offhand. Hold right click to raise it: stops attacks and arrows from the front' },
  // swords: a `tool` like the rest of their material's set (items/tools.js), quick on what a blade cuts (TOOL_BLOCKS.sword)
  [ITEM.FLINT_SWORD]:   { name: 'Flint sword',    stack: 1, icon: 'flint_sword',   tool: 'sword',   tier: 1, toolSpeed: 1,    damage: 20,   attackSpeed: 1.8,   durability: 20, desc: '' },
  [ITEM.STONE_SWORD]:    { name: 'Stone sword',     stack: 1, icon: 'stone_sword',    tool: 'sword',   tier: 2, toolSpeed: 2,    damage: 25,   attackSpeed: 1.7,   durability: 50, desc: '' },
  [ITEM.IRON_SWORD]:     { name: 'Iron sword',      stack: 1, icon: 'iron_sword',     tool: 'sword',   tier: 3, toolSpeed: 3,    damage: 30,   attackSpeed: 1.9,   durability: 150, desc: '' },
  [ITEM.GOLDEN_SWORD]:   { name: 'Golden sword',    stack: 1, icon: 'golden_sword',   tool: 'sword',   tier: 3, toolSpeed: 8,    damage: 25,   attackSpeed: 2.8,   durability: 30, desc: '' },
  [ITEM.BRONZE_SWORD]:   { name: 'Bronze sword',    stack: 1, icon: 'bronze_sword',   tool: 'sword',   tier: 4, toolSpeed: 4,    damage: 32.5, attackSpeed: 1.95,  durability: 300, desc: '' },
  // the steel sword took the diamond sword's place, numbers and id
  [ITEM.STEEL_SWORD]:    { name: 'Steel sword',     stack: 1, icon: 'steel_sword',    tool: 'sword',   tier: 5, toolSpeed: 5,    damage: 35,   attackSpeed: 2.0,   durability: 500, desc: '' },
});
