'use strict';
/* items/containers.js: what carries something: the bucket empty and full, the glass bottle, the bowl.
   A group of the item table (items/items.js says what each field of an entry is for, and holds every item's id). */
defineItems('containers', {
  [ITEM.BOWL]:          { name: 'Bowl',          stack: 20, icon: 'bowl', desc: 'Used to fill with some food' },
  [ITEM.BUCKET]:        { name: 'Bucket',        stack: 10, icon: 'bucket', desc: 'Used to fill with fluid, even with cow\'s milk (female cow)' },
  // from a cow (bucket in hand, right-click). Drinking it clears every running effect and hands the bucket back
  [ITEM.MILK_BUCKET]:   { name: 'Milk bucket',   stack: 1, icon: 'milk_bucket', food: 10, foodSat: 10, foodSatFull: 5,   // a little food
                          // 10 minutes, and what is left when it turns is the bucket back
                          eatTime: 1.92, drink: true, foodClearEffects: true, foodReturn: 283, spoil: 600, spoilInto: 283,
                          desc: 'Drink it to remove all active effects. Goes off in 10 minutes, leaving the bucket' },
  [ITEM.WATER_BUCKET]:  { name: 'Water Bucket',  stack: 1,  icon: 'water_bucket', desc: '' },
  /* a glass bottle (4 glass at the bench) fills at any water: the right button held on it for half a second
     (updateBottleFill, player/drinking.js). Drinking the water gives 25 thirst and the bottle back. `drink` with no
     `food` is still something you consume (foodPropsOf). */
  [ITEM.GLASS_BOTTLE]:  { name: 'Glass bottle',  stack: 20, icon: 'glass_bottle', desc: 'Hold the right button on water for half a second to fill it' },
  [ITEM.WATER_BOTTLE]:  { name: 'Bottle of water', stack: 10, icon: 'water_bottle',
                          eatTime: 1.4, drink: true, foodReturn: 415, desc: 'Drink it for 25 water. The bottle comes back' },
  [ITEM.LAVA_BUCKET]:   { name: 'Lava Bucket',   stack: 1,  icon: 'lava_bucket', desc: '' },
});
