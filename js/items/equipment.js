'use strict';
/* items/equipment.js: what is worn: armor of every material, the belt and the backpack.
   A group of the item table (items/items.js says what each field of an entry is for, and holds every item's id). */
defineItems('equipment', {
// Armor. `equip` names the equipment slot the piece goes into; `armor` is its point value.
// 100 armor points = the full 5-icon bar, 5 points a quarter icon (x5 in 0.82, it was out of 20). `armorMat`
// picks both the armor-bar sprite theme and the body overlay on the preview (<mat>/<mat>_<part>.png, 0.82).
// Optional stat modifiers, all additive across worn pieces:
//   moveSpeed   fraction of walk speed, e.g. -0.015 = the 1.5% slow an iron chestplate costs (iron's halved in 0.8443)
// every piece of a material lasts as long as that material's CHESTPLATE (the pass under the table copies it),
// so only the chestplate's `durability` counts; the other pieces' numbers are what they were before.
//   strength    flat bonus damage added to whatever the held weapon deals
//   atkSpeed    fraction added to the attack-speed multiplier
  /* Leather is the insulating tier: every piece traps heat, which is 8% cold resistance and a 5%
     heat PENALTY each. The boots are the one piece that helps you move (+0.5%). */
  [ITEM.LEATHER_HELMET]:     { name: 'Leather cap',        stack: 1, icon: 'leather_helmet',     equip: 'helmet',     armor: 5, tier: 1, durability: 55,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, heatstrokeResist: 0.25, heatstrokeTrigger: 5, desc: '' },
  [ITEM.LEATHER_CHESTPLATE]: { name: 'Leather tunic',      stack: 1, icon: 'leather_chestplate', equip: 'chestplate', armor: 15, tier: 1, durability: 80,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, desc: '' },
  [ITEM.LEATHER_LEGGINGS]:   { name: 'Leather trousers',   stack: 1, icon: 'leather_leggings',   equip: 'leggings',   armor: 10, tier: 1, durability: 75,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, desc: '' },
  [ITEM.LEATHER_BOOTS]:      { name: 'Leather boots',      stack: 1, icon: 'leather_boots',      equip: 'boots',      armor: 5, tier: 1, durability: 65,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, moveSpeed: 0.005, desc: '' },
  [ITEM.LEATHER_GLOVES]:     { name: 'Leather gloves',     stack: 1, icon: 'leather_gloves',     equip: 'gloves',     armor: 5, tier: 1, durability: 50,  armorMat: 'leather', coldResist: 0.08, heatResist: -0.05, strength: 1.25, desc: '' },
  [ITEM.IRON_HELMET]:        { name: 'Iron helmet',        stack: 1, icon: 'iron_helmet',        equip: 'helmet',     armor: 10, tier: 3, durability: 165, armorMat: 'iron',    moveSpeed: -0.005, desc: '' },
  [ITEM.IRON_CHESTPLATE]:    { name: 'Iron chestplate',    stack: 1, icon: 'iron_chestplate',    equip: 'chestplate', armor: 30, tier: 3, durability: 240, armorMat: 'iron',    moveSpeed: -0.015, desc: '' },
  [ITEM.IRON_LEGGINGS]:      { name: 'Iron leggings',      stack: 1, icon: 'iron_leggings',      equip: 'leggings',   armor: 25, tier: 3, durability: 225, armorMat: 'iron',    moveSpeed: -0.0125, desc: '' },
  [ITEM.IRON_BOOTS]:         { name: 'Iron boots',         stack: 1, icon: 'iron_boots',         equip: 'boots',      armor: 10, tier: 3, durability: 195, armorMat: 'iron',    moveSpeed: -0.005, desc: '' },
  // gloves have no preview overlay sheet yet — the preview only draws the four body pieces
  [ITEM.IRON_GLOVES]:        { name: 'Iron gloves',        stack: 1, icon: 'iron_gloves',        equip: 'gloves',     armor: 5, tier: 3, durability: 150, armorMat: 'iron',    moveSpeed: -0.0025, strength: 3.75, desc: '' },
  /* Gold is the middle tier, between leather and iron: more armor than leather, less than iron, and no slow at all.
     Each piece but the crown is set with a gem, the crown with pearls (items/recipes.js). */
  [ITEM.GOLDEN_HELMET]:      { name: 'Golden crown',       stack: 1, icon: 'golden_helmet',      equip: 'helmet',     armor: 8, tier: 2, durability: 120, armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_CHESTPLATE]:  { name: 'Golden chestplate',  stack: 1, icon: 'golden_chestplate',  equip: 'chestplate', armor: 22, tier: 2, durability: 160, armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_LEGGINGS]:    { name: 'Golden leggings',    stack: 1, icon: 'golden_leggings',    equip: 'leggings',   armor: 18, tier: 2, durability: 150, armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_BOOTS]:       { name: 'Golden boots',       stack: 1, icon: 'golden_boots',       equip: 'boots',      armor: 8, tier: 2, durability: 130, armorMat: 'golden',  desc: '' },
  [ITEM.GOLDEN_GLOVES]:      { name: 'Golden gauntlets',   stack: 1, icon: 'golden_gloves',      equip: 'gloves',     armor: 5, tier: 2, durability: 100, armorMat: 'golden',  strength: 2.5, desc: '' },
  /* Bronze armor: between iron and steel, made with leather, cloth and the termites' chitin (items/recipes.js). Half
     the slow of iron's, the gauntlets a harder blow. */
  [ITEM.BRONZE_HELMET]:      { name: 'Bronze helmet',      stack: 1, icon: 'bronze_helmet',      equip: 'helmet',     armor: 12, tier: 4, durability: 520, armorMat: 'bronze',  moveSpeed: -0.0025, desc: '' },
  [ITEM.BRONZE_CHESTPLATE]:  { name: 'Bronze chestplate',  stack: 1, icon: 'bronze_chestplate',  equip: 'chestplate', armor: 35, tier: 4, durability: 520, armorMat: 'bronze',  moveSpeed: -0.0075, desc: '' },
  [ITEM.BRONZE_LEGGINGS]:    { name: 'Bronze leggings',    stack: 1, icon: 'bronze_leggings',    equip: 'leggings',   armor: 27, tier: 4, durability: 520, armorMat: 'bronze',  moveSpeed: -0.006, desc: '' },
  [ITEM.BRONZE_BOOTS]:       { name: 'Bronze boots',       stack: 1, icon: 'bronze_boots',       equip: 'boots',      armor: 12, tier: 4, durability: 520, armorMat: 'bronze',  moveSpeed: -0.0025, desc: '' },
  [ITEM.BRONZE_GLOVES]:      { name: 'Bronze gauntlets',   stack: 1, icon: 'bronze_gloves',      equip: 'gloves',     armor: 5, tier: 4, durability: 520, armorMat: 'bronze',  moveSpeed: -0.00125, strength: 5, desc: '' },
  // steel armor: the strongest. It took the diamond armor's place, numbers and ids
  [ITEM.STEEL_HELMET]:       { name: 'Steel helmet',       stack: 1, icon: 'steel_helmet',       equip: 'helmet',     armor: 15, tier: 5, durability: 900, armorMat: 'steel',   desc: '' },
  [ITEM.STEEL_CHESTPLATE]:   { name: 'Steel chestplate',   stack: 1, icon: 'steel_chestplate',   equip: 'chestplate', armor: 40, tier: 5, durability: 900, armorMat: 'steel',   desc: '' },
  [ITEM.STEEL_LEGGINGS]:     { name: 'Steel leggings',     stack: 1, icon: 'steel_leggings',     equip: 'leggings',   armor: 30, tier: 5, durability: 900, armorMat: 'steel',   desc: '' },
  [ITEM.STEEL_BOOTS]:        { name: 'Steel boots',        stack: 1, icon: 'steel_boots',        equip: 'boots',      armor: 15, tier: 5, durability: 900, armorMat: 'steel',   desc: '' },
  /* Cloth is the light, cool tier: little armor, but each piece is 8% heat resistance, and the full set
     guards against sandstorms and heatstroke (ARMOR_SET_BONUS, player/equipment.js). A hat on — the bandana or the
     leather cap — shades the head: heatstroke comes 25% slower and only 5°C hotter (heatstrokeResist,
     heatstrokeTrigger; player/stats.js). */
  [ITEM.CLOTH_HELMET]:       { name: 'Cloth bandana',      stack: 1, icon: 'cloth_helmet',       equip: 'helmet',     armor: 5, tier: 1, durability: 40,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, heatstrokeResist: 0.25, heatstrokeTrigger: 5, desc: '' },
  [ITEM.CLOTH_CHESTPLATE]:   { name: 'Cloth tunic',        stack: 1, icon: 'cloth_chestplate',   equip: 'chestplate', armor: 10, tier: 1, durability: 60,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, desc: '' },
  [ITEM.CLOTH_LEGGINGS]:     { name: 'Cloth trousers',     stack: 1, icon: 'cloth_leggings',     equip: 'leggings',   armor: 5, tier: 1, durability: 55,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, desc: '' },
  [ITEM.CLOTH_BOOTS]:        { name: 'Cloth boots',        stack: 1, icon: 'cloth_boots',        equip: 'boots',      armor: 5, tier: 1, durability: 45,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, desc: '' },
  [ITEM.CLOTH_GLOVES]:       { name: 'Cloth gloves',       stack: 1, icon: 'cloth_gloves',       equip: 'gloves',     armor: 5, tier: 1, durability: 35,  armorMat: 'cloth', heatResist: 0.08, coldResist: -0.03, desc: '' },
  /* The leather belt and the leather backpack (ids BELT and BACKPACK: the first of their kind, others have art
     waiting). `hotbarSlots` opens that many more hotbar slots while worn (hotbarLen, player/equipment.js). `beltSlots`
     would open that many quick-access slots above the equipment panel (for utility gear; none exists yet, so the leather
     belt has none for now); `packSlots`
     opens that many carrying slots under the main grid (41-backpack.js). `wear` names what is seen on the body:
     <wear>_torso_overlay laid on the torso (WORN_TEXTURES, 01-textures-data.js; player/armor-model.js), and for a
     backpack its model (js/models/backpacks.js) and sheet, textures/Entity/equipment/Backpacks/<wear>.png (41-backpack.js). */
  [ITEM.BELT]:               { name: 'Leather belt',       stack: 1, icon: 'leather_belt',       wear: 'leather_belt',     equip: 'belt', hotbarSlots: 2, desc: 'Worn on the belt. Adds 2 hotbar slots (keys 9 and 0)' },
  [ITEM.BACKPACK]:           { name: 'Leather backpack',   stack: 1, icon: 'leather_backpack',   wear: 'leather_backpack', equip: 'back', packSlots: 32,
                               desc: 'Worn on the back. Adds four more rows of carrying space' },
});
