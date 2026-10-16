'use strict';
/* entities/villager.js: the villager. What one carries, and spawning one.
   It moves by entities/update.js. */

function _rollInventory() {
  const inv = [];
  const n = _ri(1, 4);
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const e = ENT_CARRY_POOL[Math.floor(Math.random() * ENT_CARRY_POOL.length)];
    const id = e.id();
    if (id == null || used.has(id)) continue;      // no duplicate stacks in one pack
    used.add(id);
    inv.push({ id, count: _ri(e.min, e.max) });
  }
  return inv;
}

/* What one villager is made of: its model, a name to go with its gender and what it carries. summon('npc', x, y,
   z, opts) writes the rest (entities/mobs.js). `opts`: name, inventory. */
function makeVillager(opts, gender) {
  return {
    model: buildHumanoid(),
    own: {
      name: opts.name || _npcName(gender),
      inventory: opts.inventory || _rollInventory(),
    },
  };
}

/* Where villagers live: the plains of every climate, and most of all the beaches (a biome's weight is how likely
   a roll that lands there is to stand, by its full name; not listed: never). In ones and twos. */
const ENT_BIOMES = { 'Beach': 1, 'Plains': 0.45, 'Warm Plains': 0.45, 'Cold Plains': 0.45 };
const ENT_CHUNK_CHANCE = 0.0075;         // a wanderer in about 1 new chunk in 133
const ENT_GROUP_MIN = 1, ENT_GROUP_MAX = 2;
function _rollVillagers(cx, cz) {
  if (Math.random() >= ENT_CHUNK_CHANCE) return;
  const s = _findChunkSpot(cx, cz, ENT_BIOMES);
  if (!s) return;
  // 1-2 together; a second one that would land somewhere cramped takes the vetted spot too
  for (let i = _ri(ENT_GROUP_MIN, ENT_GROUP_MAX); i > 0; i--) {
    const sx = i > 1 ? s.x + Math.random() * 3 - 1.5 : s.x, sz = i > 1 ? s.z + Math.random() * 3 - 1.5 : s.z;
    const ok = !_entBlocked(sx, s.y, sz) && !_entHazard(sx, s.y, sz) && _entSpawnRoom(sx, s.y, sz);
    summon('npc', ok ? sx : s.x, s.y, ok ? sz : s.z);
  }
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). The kind is 'npc'. It is also
   what anything that is not a known kind is read as (mobOf), and what a save row with no kind comes back as. */
defineMob('npc', {
  name: 'Villager', group: 'villager', body: 'humanoid',
  hp: ENT_HP, walk: ENT_SPEED, chase: ENT_CHASE_SPEED, reach: NPC_MELEE_REACH,
  make: makeVillager, gendered: true, build: () => buildHumanoid(),
  roll: _rollVillagers,
  save: (e) => ({ g: e.gender, lv: e.level }),         // its name and what it carries are in the row itself
  load: (s) => summon('npc', s.x, s.y, s.z, {
    hp: s.hp, name: s.name,
    // what it carried, less anything this version of the game no longer has
    inventory: Array.isArray(s.inv)
      ? s.inv.filter(i => Array.isArray(i) && i.length === 2 && (PROPS[i[0]] || ITEM_PROPS[i[0]]))
             .map(i => ({ id: i[0], count: Math.max(1, i[1] | 0) }))
      : [],
    gender: s.d.g, level: s.d.lv, hx: s.hx, hz: s.hz,
  }),
  // what every villager leaves (ENT_LOOT), and everything it was carrying
  loot: (e, pop) => {
    for (const l of ENT_LOOT) { const id = l.id(); if (id != null) pop(id, rollLoot(LOOT.villager)); }
    for (const s of e.inventory) pop(s.id, s.count);
  },
});
