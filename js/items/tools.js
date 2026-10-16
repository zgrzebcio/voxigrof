'use strict';
/* items/tools.js: tools: shovels, pickaxes, hatchets and hoes of every material, shears, the chisel and the hammer, and creative's two wands.
   A group of the item table (items/items.js says what each field of an entry is for, and holds every item's id). */
defineItems('tools', {
  [ITEM.BUILD_WAND]:    { name: 'Building wand', stack: 1, icon: 'build_wand',    // 0.8371
                          desc: 'Creative only. Right-click a block: every same block joined to it across that face gets one more layer on it, the same look, shape and turn' },
  [ITEM.BREAK_WAND]:    { name: 'Breaking wand', stack: 1, icon: 'break_wand',    // 0.8374
                          desc: 'Creative only. Right-click a block: it and every same block joined to it across that face are taken away' },
  /* The iron chisel and the iron hammer (ids CHISEL and HAMMER: the first of their kind, steel ones have art
     waiting). Both wear one point per block. The chisel, worn at the neck, lays a block as one of its variants;
     the hammer, worn in the Others slot, cuts it into a shape (shapes/chisel.js, blocks/variants.js). */
  [ITEM.CHISEL]:        { name: 'Iron chisel',   stack: 1,  icon: 'iron_chisel', equip: 'necklace', chisel: true, durability: 300,
                          desc: 'Wear it in the Neck slot to lay blocks as their variants: hold R and scroll (hold D-pad Right and a bumper on a gamepad). Cutting shapes is the iron hammer' },
  [ITEM.HAMMER]:        { name: 'Iron hammer',   stack: 1,  icon: 'iron_hammer', equip: 'accessories', chisel: true, durability: 500,
                          desc: 'Wear it in the Others slot to cut blocks into shapes: hold Q (hold B on a gamepad) to pick one. Variants are the iron chisel' },
  /* The sets, one line a tool, a material after another: flint (tier 1), stone (2), iron and gold (3), bronze (4)
     and steel (5: it took the diamond tools' place, numbers and ids, so a diamond tool in an old save is the steel
     one now). Stack 1, own durability (it breaks at 0; a hoe's is its pickaxe's and every tool's is x1.2, the passes
     in items/finish.js). `toolSpeed` divides the mining time on its own blocks; `tier` gates what drops (MINE_REQ,
     blocks/mining-rules.js: the gem ores ask for bronze, obsidian for steel). Swords are in items/weapons.js. */
  [ITEM.FLINT_SHOVEL]:  { name: 'Flint shovel',  stack: 1, icon: 'flint_shovel',  tool: 'shovel',  tier: 1, toolSpeed: 2,    damage: 10,   attackSpeed: 1.0,   durability: 40, desc: '' },
  [ITEM.FLINT_PICKAXE]: { name: 'Flint pickaxe',  stack: 1, icon: 'flint_pickaxe', tool: 'pick',    tier: 1, toolSpeed: 2,    damage: 15,   attackSpeed: 1.0,   durability: 40, desc: 'Breaks stone, but the stone drops nothing: only a pebble now and then' },   // 0.8444
  [ITEM.FLINT_HATCHET]: { name: 'Flint hatchet',  stack: 1, icon: 'flint_hatchet', tool: 'hatchet', tier: 1, toolSpeed: 2,    damage: 25,   attackSpeed: 0.8,   durability: 40, desc: '' },
  [ITEM.FLINT_HOE]:     { name: 'Flint hoe',      stack: 1, icon: 'flint_hoe',     tool: 'hoe',     tier: 1, toolSpeed: 2,    damage: 15,   attackSpeed: 1.2,   durability: 30, desc: '' },
  [ITEM.STONE_SHOVEL]:   { name: 'Stone shovel',    stack: 1, icon: 'stone_shovel',   tool: 'shovel',  tier: 2, toolSpeed: 4,    damage: 15,   attackSpeed: 0.8,   durability: 100, desc: '' },
  [ITEM.STONE_PICKAXE]:  { name: 'Stone pickaxe',   stack: 1, icon: 'stone_pickaxe',  tool: 'pick',    tier: 2, toolSpeed: 4,    damage: 20,   attackSpeed: 0.8,   durability: 100, desc: '' },
  [ITEM.STONE_HATCHET]:  { name: 'Stone hatchet',   stack: 1, icon: 'stone_hatchet',  tool: 'hatchet', tier: 2, toolSpeed: 4,    damage: 30,   attackSpeed: 0.6,   durability: 100, desc: '' },
  [ITEM.STONE_HOE]:      { name: 'Stone hoe',       stack: 1, icon: 'stone_hoe',      tool: 'hoe',     tier: 2, toolSpeed: 4,    damage: 20,   attackSpeed: 1.1,   durability: 80, desc: '' },
  [ITEM.IRON_SHEARS]:    { name: 'Iron shears',     stack: 1, icon: 'iron_shears',    tool: 'shears',  tier: 3, toolSpeed: 6,    damage: 15,   attackSpeed: 1.2,   durability: 150, desc: '' },
  [ITEM.IRON_SHOVEL]:    { name: 'Iron shovel',     stack: 1, icon: 'iron_shovel',    tool: 'shovel',  tier: 3, toolSpeed: 6,    damage: 20,   attackSpeed: 1.1,   durability: 300, desc: '' },
  [ITEM.IRON_PICKAXE]:   { name: 'Iron pickaxe',    stack: 1, icon: 'iron_pickaxe',   tool: 'pick',    tier: 3, toolSpeed: 6,    damage: 25,   attackSpeed: 1.1,   durability: 300, desc: '' },
  [ITEM.IRON_HATCHET]:   { name: 'Iron hatchet',    stack: 1, icon: 'iron_hatchet',   tool: 'hatchet', tier: 3, toolSpeed: 6,    damage: 35,   attackSpeed: 0.8,   durability: 300, desc: '' },
  [ITEM.IRON_HOE]:       { name: 'Iron hoe',        stack: 1, icon: 'iron_hoe',       tool: 'hoe',     tier: 3, toolSpeed: 6,    damage: 25,   attackSpeed: 1.2,   durability: 200, desc: '' },
  [ITEM.GOLDEN_SHOVEL]:  { name: 'Golden shovel',   stack: 1, icon: 'golden_shovel',  tool: 'shovel',  tier: 3, toolSpeed: 14,   damage: 15,   attackSpeed: 1.6,   durability: 60, desc: '' },
  [ITEM.GOLDEN_PICKAXE]: { name: 'Golden pickaxe',  stack: 1, icon: 'golden_pickaxe', tool: 'pick',    tier: 3, toolSpeed: 14,   damage: 20,   attackSpeed: 1.6,   durability: 60, desc: '' },
  [ITEM.GOLDEN_HATCHET]: { name: 'Golden hatchet',  stack: 1, icon: 'golden_hatchet', tool: 'hatchet', tier: 3, toolSpeed: 14,   damage: 25,   attackSpeed: 1.4,   durability: 60, desc: '' },
  [ITEM.GOLDEN_HOE]:     { name: 'Golden hoe',      stack: 1, icon: 'golden_hoe',     tool: 'hoe',     tier: 3, toolSpeed: 14,   damage: 15,   attackSpeed: 2.4,   durability: 45, desc: '' },
  [ITEM.BRONZE_SHOVEL]:  { name: 'Bronze shovel',   stack: 1, icon: 'bronze_shovel',  tool: 'shovel',  tier: 4, toolSpeed: 8,    damage: 15,   attackSpeed: 1.15,  durability: 600, desc: '' },
  [ITEM.BRONZE_PICKAXE]: { name: 'Bronze pickaxe',  stack: 1, icon: 'bronze_pickaxe', tool: 'pick',    tier: 4, toolSpeed: 8,    damage: 17.5, attackSpeed: 1.15,  durability: 600, desc: '' },
  [ITEM.BRONZE_HATCHET]: { name: 'Bronze hatchet',  stack: 1, icon: 'bronze_hatchet', tool: 'hatchet', tier: 4, toolSpeed: 8,    damage: 37.5, attackSpeed: 0.85,  durability: 600, desc: '' },
  [ITEM.BRONZE_HOE]:     { name: 'Bronze hoe',      stack: 1, icon: 'bronze_hoe',     tool: 'hoe',     tier: 4, toolSpeed: 8,    damage: 17.5, attackSpeed: 1.25,  durability: 450, desc: '' },
  [ITEM.STEEL_SHOVEL]:   { name: 'Steel shovel',    stack: 1, icon: 'steel_shovel',   tool: 'shovel',  tier: 5, toolSpeed: 10,   damage: 10,   attackSpeed: 1.2,   durability: 1000, desc: '' },
  [ITEM.STEEL_PICKAXE]:  { name: 'Steel pickaxe',   stack: 1, icon: 'steel_pickaxe',  tool: 'pick',    tier: 5, toolSpeed: 10,   damage: 10,   attackSpeed: 1.2,   durability: 1000, desc: '' },
  [ITEM.STEEL_HATCHET]:  { name: 'Steel hatchet',   stack: 1, icon: 'steel_hatchet',  tool: 'hatchet', tier: 5, toolSpeed: 10,   damage: 40,   attackSpeed: 0.9,   durability: 1000, desc: '' },
  [ITEM.STEEL_HOE]:      { name: 'Steel hoe',       stack: 1, icon: 'steel_hoe',      tool: 'hoe',     tier: 5, toolSpeed: 10,   damage: 10,   attackSpeed: 1.3,   durability: 750, desc: '' },
});
