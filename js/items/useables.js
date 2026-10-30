'use strict';
/* items/useables.js: what is used on the world: keys, the snowball, the saddle, fire.
   A group of the item table (items/items.js says what each field of an entry is for, and holds every item's id). */
defineItems('useables', {
  /* Keys: `key` is what blocks/doors.js keys off; a slot's `lock` is the door it is bound to. One key, one door:
     right-click an unlocked door with a blank key to lock it, its key opens it (in hand), sneak + right-click with it
     unlocks it. Breaking the door leaves its key blank. Iron, golden and copper keys have no recipe yet.
     chests lock the same way (blocks/chest.js useChest); the metal keys drop off monsters, and each opens a sealed
     chest of its metal found in the world, staying in its lock. */
  [ITEM.WOODEN_KEY]:    { name: 'Wooden key',    stack: 1, icon: 'wooden_key', key: true,
                          desc: 'Opens a sealed wooden supply chest, and stays in its lock (a blank key only). Or right-click a door or a chest to lock it: only this key opens it then (hold it). Sneak + right-click to unlock' },   // sealed chests 0.8444
  [ITEM.IRON_KEY]:      { name: 'Iron key',      stack: 1, icon: 'iron_key', key: true, desc: 'Opens a sealed iron chest, and stays in its lock. Also locks a door or a chest like the wooden key' },
  [ITEM.GOLDEN_KEY]:    { name: 'Golden key',    stack: 1, icon: 'golden_key', key: true, desc: 'Opens a sealed gold chest, and stays in its lock. Also locks a door or a chest like the wooden key' },
  [ITEM.COPPER_KEY]:    { name: 'Copper key',    stack: 1, icon: 'copper_key', key: true, desc: 'Opens a sealed copper chest, and stays in its lock. Also locks a door or a chest like the wooden key' },
  // works any locked chest open with the right button held (blocks/chest.js: PICK_* and _pickDone)
  [ITEM.LOCK_PICK]:     { name: 'Lock pick',     stack: 1, icon: 'lockpick',
                          desc: 'Hold the right button on a locked chest, sealed or a player\'s: half the time it opens. It may break, more often on a metal chest' },
  // fire in the hand. Placed, it sets that spot alight (igniteAt, 53-storms.js); a hellhound eats it
  [ITEM.FIRE]:          { name: 'Fire',          stack: 30, icon: 'fire', desc: 'Place it to set a fire. A hellhound eats it' },
  [ITEM.SNOWBALL]:      { name: 'Snowball',      stack: 20, icon: 'snowball', throwable: true, desc: 'Can be thrown to knock back friends or enemies' },
  // put on a tamed horse to steer it (entities/taming.js); it comes back when the horse dies
  [ITEM.SADDLE]:        { name: 'Saddle',        stack: 1,  icon: 'saddle', desc: 'Use it on a tamed animal to ride it' },
  // creative's debug stick (player/wrench.js)
  [ITEM.WRENCH]:        { name: 'Wrench',        stack: 1,  icon: 'wrench',
                          desc: 'Creative only. Right-click a side of a fence or a wall to join or part it there, a wall\'s top to turn it; stairs\' top or bottom to turn them upside down, their side to turn them round; anything else that turns, to turn it. Sneak: a fence or wall joins by itself again, stairs take their next corner' },
});
