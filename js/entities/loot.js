'use strict';
/* entities/loot.js: what a creature leaves when it dies, by blade or by fire. WHAT each kind leaves is its `loot`
   and `burnt` in the creature table (entities/mobs.js, written in the creature's own file); this file is how it
   is dropped. The counts roll from LOOT (50-loottable.js). */

function _entDropLoot(ent, byPlayer = false) {
  const bx = Math.floor(ent.x), by = Math.floor(ent.y + 0.5), bz = Math.floor(ent.z);
  const def = mobOf(ent);
  if (!def.loot) return;
  /* Butcher: an animal the player killed has a 20% chance of one more of its FIRST drop (the meat, a horse's
     leather), which is why a kind's `loot` drops that one through `first` and the rest through `pop`. */
  const butcher = byPlayer && isAnimal(ent) && typeof hasSkill === 'function' && hasSkill('butcher');
  const pop = (id, n) => {
    for (let i = 0; i < n; i++)
      spawnDrop(id, bx, by, bz, {
        x: (Math.random() - 0.5) * 3.5, y: 2.4 + Math.random() * 1.6, z: (Math.random() - 0.5) * 3.5,
      }, 0.6);
  };
  const first = (id, table) => pop(id, rollLoot(table) + lootBonus(butcher));
  def.loot(ent, pop, first, byPlayer);
}

/* Burnt to death (lightning's fire, 53-storms.js): a kind with `burnt` (sheep, cow, pig, fish) leaves its meat
   already cooked and nothing else, no wool, leather or fat. Any other animal leaves nothing (a horse its saddle);
   anything that is not an animal drops as it would. No experience. */
function _entBurnDeath(ent) {
  // burnt by a hound's bite or by a player's fire: it leaves fire, and counts for a hound's taming
  if (ent._fireBy && typeof fireKillBy === 'function') fireKillBy(ent, ent._fireBy);
  if (!player.canFly) {
    const def = mobOf(ent);
    const burnt = def.burnt ? def.burnt(ent) : null;     // [raw item, LOOT list]
    if (burnt) {
      const raw = burnt[0];
      const cooked = (typeof SMELT_RECIPES !== 'undefined' && SMELT_RECIPES.find(r => r.in === raw)?.out) || raw;
      const n = rollLoot(burnt[1]);
      for (let i = 0; i < n; i++)
        spawnDrop(cooked, Math.floor(ent.x), Math.floor(ent.y + 0.5), Math.floor(ent.z),
                  { x: (Math.random() - 0.5) * 3, y: 2.4 + Math.random() * 1.4, z: (Math.random() - 0.5) * 3 }, 0.6);
    } else if (!isAnimal(ent)) _entDropLoot(ent);
    if (ent.kind === 'horse' && ent.saddled) spawnDrop(ITEM.SADDLE, Math.floor(ent.x), Math.floor(ent.y + 0.5), Math.floor(ent.z));   // tack survives
  }
  if (typeof fxDeath === 'function') fxDeath(ent.x, ent.y, ent.z, entH(ent));
  const i = ENTITIES.indexOf(ent);
  if (i >= 0) _removeEntity(i);
}
