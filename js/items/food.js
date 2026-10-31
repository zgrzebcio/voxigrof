'use strict';
/* items/food.js: what is eaten: fruit and berries, meat and fish raw and cooked, bread, pies and stew.
   A group of the item table (items/items.js says what each field of an entry is for, and holds every item's id). */
defineItems('food', {
// Consumables. food, foodSat (over-food), foodSatFull and foodHeal are out of 100 since 0.82 (x5; they were out of 20);
// what each also gives in thirst, fruit, vegetables and protein is FOOD_NUTRITION in player/stats.js.
// Every eatTime is 20% longer since 0.821.
  [ITEM.APPLE]:         { name: 'Apple',          stack: 79, icon: 'apple',         foodSatFull: 15, food: 25,  foodSat: 40,  eatTime: 1.8, spoil: 3600, desc: '' },   // an hour since 0.7992
  /* the coconut, off a palm (woods/coconuts.js): not eaten whole, it is OPENED, the right button held `open.time` with it in
     hand (player/eating.js), into `open.count` halves; a half is drunk more than eaten (its thirst, FOOD_NUTRITION) */
  [ITEM.COCONUT]:       { name: 'Coconut',        stack: 20, icon: 'coconut',
                          open: { into: ITEM.HALF_COCONUT, count: 2, time: 0.8 }, desc: 'Hold the right button to open it into two halves' },
  [ITEM.HALF_COCONUT]:  { name: 'Half coconut',   stack: 30, icon: 'coconut_half',  foodSatFull: 0, food: 2,  foodSat: 4,   eatTime: 1.2, spoil: 1800, foodReturn: ITEM.BOWL, foodReturnChance: 0.5,
                          desc: 'Drink it: 20 water, 10 when you are not thirsty, and a little fruit. Its shell may be left as a bowl' },
  [ITEM.MELON_SLICE]:   { name: 'Melon slice',    stack: 30, icon: 'melon_slice',   foodSatFull: 5, food: 5,  foodSat: 10,  eatTime: 0.84, spoil: 1200, desc: '' },
  [ITEM.CANTALOUPE_SLICE]: { name: 'Cantaloupe slice', stack: 30, icon: 'cantaloupe_slice', foodSatFull: 5, food: 5, foodSat: 10, eatTime: 0.84, spoil: 1200, desc: '' },
  // two colours, identical to eat — which bush you found is flavour, not a stat choice
  /* Berries: all fill you the same, and each kind adds its own. Red heals a little, blue quenches 1.5x the
     thirst (FOOD_NUTRITION, player/stats.js), black is poisonous, yellow fills 1.5x the food, white takes thirst
     but washes a second off every bad effect running (foodCleanse, 22-main-loop.js). */
  [ITEM.BERRIES]:       { name: 'Red berries',    stack: 50, icon: 'redberries',    foodSatFull: 0, food: 5,  foodSat: 5,  eatTime: 0.6, spoil: 600, foodHeal: 2, desc: '' },
  [ITEM.BLUE_BERRIES]:  { name: 'Blue berries',   stack: 50, icon: 'blueberries',   foodSatFull: 0, food: 5,  foodSat: 5,  eatTime: 0.6, spoil: 600, desc: '' },
  // blackberries (0.7947 as the yellow ones): they fill you like the others, but they are poisonous (EFFECT_DEFS.poison)
  [ITEM.BLACKBERRIES]:  { name: 'Blackberries',   stack: 50, icon: 'blackberries',  foodSatFull: 0, food: 5,  foodSat: 5,  eatTime: 0.6, spoil: 600,
                          foodEffect: 'poison', foodEffectTime: 5, desc: 'Poisonous' },   // 5 s, not poison's 10
  [ITEM.YELLOW_BERRIES]: { name: 'Yellow berries', stack: 50, icon: 'yellowberries', foodSatFull: 0, food: 7.5, foodSat: 5, eatTime: 0.6, spoil: 600, desc: '' },
  [ITEM.WHITE_BERRIES]: { name: 'White berries',  stack: 50, icon: 'whiteberries',  foodSatFull: 0, food: 5,  foodSat: 5,  eatTime: 0.6, spoil: 600, foodCleanse: 1,
                          desc: 'Takes a little thirst, but washes a second off every bad effect with a time' },
  /* the crafted pie is RAW now (same id, so saves keep it) and a furnace bakes it. Raw it is dough, not a meal: a little
     food and it always poisons for 5 s (as blackberries) */
  [ITEM.PUMPKIN_PIE]:   { name: 'Raw pumpkin pie', stack: 10, icon: 'pumpkin_pie',  foodSatFull: 5, food: 20,  foodSat: 10,  eatTime: 1.4, foodEffect: 'poison', foodEffectTime: 5, spoil: 3600, desc: '' },
  // baked, the slowest to eat: its Spicy pumpkin (crafting and move speed) is what it is for
  [ITEM.COOKED_PUMPKIN_PIE]: { name: 'Pumpkin pie', stack: 10, icon: 'cooked_pumpkin_pie', foodSatFull: 35, food: 60, foodSat: 70, eatTime: 4.8, foodHeal: 15, foodEffect: 'spicyPumpkin', spoil: 7200, desc: '' },
  // a dish is worth more than its parts: the stew 75 (food + over-food / 1.5), its four mushrooms grilled 48 (plans/FoodBalance.md)
  [ITEM.MUSHROOM_STEW]: { name: 'Mushroom stew',  stack: 10, icon: 'mushroom_stew', foodSatFull: 30, food: 55,  foodSat: 60, eatTime: 3, foodReturn: ITEM.BOWL, foodReturnChance: 0.5, foodHeal: 8, spoil: 3600, desc: '' },
  [ITEM.BREAD]:         { name: 'Bread',          stack: 79, icon: 'bread',         foodSatFull: 20, food: 30,  foodSat: 40,  eatTime: 2.04, spoil: 14400, desc: '' },
  // five berries of any kind on a bread make two (items/recipes.js): food, or over-food when full; fruit and stamina (FOOD_NUTRITION)
  [ITEM.JAM_SANDWICH]:  { name: 'Jam sandwich',   stack: 30, icon: 'jam_sandwich',  foodSatFull: 20, food: 25, eatTime: 2.16, spoil: 14400, desc: 'Berry jam on bread' },
  // a carrot: a snack like a melon slice and a lot of vegetables (less when they are full: FOOD_NUTRITION's vegFull); a horse's best food
  [ITEM.CARROT]:        { name: 'Carrot',         stack: 79, icon: 'carrot',        foodSatFull: 2, food: 8, foodSat: 5, eatTime: 1.0, spoil: 10800, desc: 'A horse loves it' },
  // its heal lands after its Rapid regen, so 20 heals 30
  [ITEM.GOLDEN_APPLE]:  { name: 'Golden apple',   stack: 20, icon: 'golden_apple',  foodSatFull: 40, food: 25,  foodSat: 75,  eatTime: 2.4, foodHeal: 20, foodEffect: 'rapidRegen', desc: '' },
  /* RAW meat and fish are about a quarter of cooked, and turn the stomach for 20 s (nausea: hunger x2 and the sway), meat
     60% of the time, fish half: cook it */
  [ITEM.MUTTON]:        { name: 'Mutton',         stack: 79, icon: 'mutton',        foodSatFull: 5, food: 5,  foodSat: 5,  eatTime: 2.16, foodEffect: 'nausea', foodEffectChance: 0.6, foodEffectTime: 20, spoil: 1800, desc: '' },
  [ITEM.COOKED_MUTTON]: { name: 'Cooked mutton',  stack: 79, icon: 'cooked_mutton', foodSatFull: 20, food: 30,  foodSat: 35,  eatTime: 2.4, spoil: 14400, desc: '' },
  // beef is the best meat in the game once cooked, which is what makes hunting cows worth it
  [ITEM.BEEF]:          { name: 'Raw beef',       stack: 79, icon: 'beef',          foodSatFull: 5, food: 10,  foodSat: 10,  eatTime: 2.28, foodEffect: 'nausea', foodEffectChance: 0.6, foodEffectTime: 20, spoil: 2000, desc: '' },
  [ITEM.COOKED_BEEF]:   { name: 'Steak',          stack: 79, icon: 'cooked_beef',   foodSatFull: 25, food: 40,  foodSat: 50, eatTime: 2.64, spoil: 28800, desc: '' },
  [ITEM.ROTTEN_FLESH]:  { name: 'Rotten flesh',   stack: 79, icon: 'rotten_flesh',  foodSatFull: 0, food: 10,  foodSat: 0,  eatTime: 1.56, foodEffect: 'nausea', foodEffectChance: 0.9, spoil: 7200, desc: 'Edible, but barely' },
  // pork: a shade under beef cooked, and it spoils faster than any other meat raw
  [ITEM.PORK]:          { name: 'Raw pork',       stack: 79, icon: 'pork',          foodSatFull: 5, food: 10,  foodSat: 10,  eatTime: 2.28, foodEffect: 'nausea', foodEffectChance: 0.6, foodEffectTime: 20, spoil: 2600, desc: '' },
  [ITEM.COOKED_PORK]:   { name: 'Cooked pork',    stack: 79, icon: 'cooked_pork',   foodSatFull: 20, food: 35,  foodSat: 45,  eatTime: 2.52, spoil: 22400, desc: '' },
  // fish: lighter than meat and quicker to eat; the bigger the fish, the more it fills. Raw as raw meat (above), half the time
  [ITEM.COD]:            { name: 'Raw cod',        stack: 79, icon: 'cod',            foodSatFull: 5, food: 5, foodSat: 5, eatTime: 1.68, foodEffect: 'nausea', foodEffectChance: 0.5, foodEffectTime: 20, spoil: 1800, desc: '' },
  [ITEM.COOKED_COD]:     { name: 'Cooked cod',     stack: 79, icon: 'cooked_cod',     foodSatFull: 15, food: 25, foodSat: 30, eatTime: 1.92, spoil: 14400, desc: '' },
  [ITEM.SALMON]:         { name: 'Raw salmon',     stack: 79, icon: 'salmon',         foodSatFull: 5, food: 5, foodSat: 5, eatTime: 1.8, foodEffect: 'nausea', foodEffectChance: 0.5, foodEffectTime: 20, spoil: 1800, desc: '' },
  [ITEM.COOKED_SALMON]:  { name: 'Cooked salmon',  stack: 79, icon: 'cooked_salmon',  foodSatFull: 15, food: 30, foodSat: 35, eatTime: 2.04, spoil: 14400, desc: '' },
  [ITEM.PIKE]:           { name: 'Raw pike',       stack: 79, icon: 'pike',           foodSatFull: 5, food: 10, foodSat: 5, eatTime: 1.92, foodEffect: 'nausea', foodEffectChance: 0.5, foodEffectTime: 20, spoil: 1800, desc: '' },
  [ITEM.COOKED_PIKE]:    { name: 'Cooked pike',    stack: 79, icon: 'cooked_pike',    foodSatFull: 20, food: 30, foodSat: 40, eatTime: 2.16, spoil: 14400, desc: '' },
  [ITEM.CATFISH]:        { name: 'Raw catfish',    stack: 79, icon: 'catfish',        foodSatFull: 5, food: 10, foodSat: 10, eatTime: 2.04, foodEffect: 'nausea', foodEffectChance: 0.5, foodEffectTime: 20, spoil: 1800, desc: '' },
  [ITEM.COOKED_CATFISH]: { name: 'Cooked catfish', stack: 79, icon: 'cooked_catfish', foodSatFull: 20, food: 35, foodSat: 45, eatTime: 2.28, spoil: 14400, desc: '' },
});
