'use strict';
/* entities/save.js: creatures in the save. One row each; a row's order is fixed. WHAT is kept of each kind is its
   `save`, `cols` and `load` in the creature table (entities/mobs.js, written in the creature's own file); this
   file writes and reads the part every creature shares.

   A ROW:  [x, y, z, yaw, hp, name, inventory, homeX, homeZ, kind, woolly, variant, extra, 5]
     0-8    shared by all: where it is and faces, its health, its name, what it carries, its home
     9      its kind (a row without one is from before there were kinds: a villager)
     10-11  two old places from before `extra` existed: a sheep's fleece (1/0), a cow's or pig's coat name
     12     the kind's own object (its `save`), or 0. A new field goes in there, never in a new place
     13     5: health and hunger are out of 100 (a row without it is from when they were out of 20) */

/* ---- persistence ----
   EVERY entity is written, not just the ones in render distance. A chunk rolls its
   population once and only once, so an unsaved mob is a mob that never comes back — the whole
   point of the new scheme is that the flock you found is still there tomorrow. Frozen entities
   in unloaded chunks are saved exactly like active ones. */
function serializeEntities() {
  const out = [];
  for (const e of ENTITIES) {
    const def = mobOf(e);
    if (def.night) continue;          // night spawns: dawn is their despawn, never persisted
    if (e.boss) continue;             // a boss is placed by its castle, never saved
    const cols = def.cols ? def.cols(e) : null;
    out.push([
      +e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2),
      +e.yaw.toFixed(3), Math.max(0, +e.hp.toFixed(1)),
      e.name, e.inventory.map(s => [s.id, s.count]),
      +e.hx.toFixed(1), +e.hz.toFixed(1),
      e.kind, cols ? cols[0] : 0, cols ? cols[1] : 0,
      def.save ? def.save(e) : 0,
      5,                                        // health and hunger out of 100 (restoreEntities)
    ]);
  }
  return out;
}
function restoreEntities(list) {
  if (!Array.isArray(list)) return;
  for (const r of list) {
    if (!Array.isArray(r) || r.length < 5) continue;
    let [x, y, z, yaw, hp, name, inv, hx, hz, kind, woolly, variant, extra] = r;
    // a row with no 5 on its end: its health, a horse's rolled ceiling and hunger were out of 20
    if (r[13] !== 5) {
      if (typeof hp === 'number') hp *= 5;
      if (extra && typeof extra === 'object') {
        if (extra.st && extra.st.maxHp > 0) extra = { ...extra, st: { ...extra.st, maxHp: extra.st.maxHp * 5 } };
        if (typeof extra.h === 'number') extra = { ...extra, h: extra.h * 5 };
      }
    }
    if (![x, y, z].every(v => typeof v === 'number' && isFinite(v))) continue;
    // a kind this game does not save as itself (none at all, a night mob, one that is gone) comes back a villager
    const def = MOBS[kind] && MOBS[kind].load ? MOBS[kind] : MOBS.npc;
    const e = def.load({
      x, y, z,
      hp: typeof hp === 'number' && hp > 0 ? hp : undefined,      // undefined: the kind's full health
      name: typeof name === 'string' ? name : undefined,
      hx: typeof hx === 'number' ? hx : x,
      hz: typeof hz === 'number' ? hz : z,
      inv, woolly, variant,
      d: (extra && typeof extra === 'object') ? extra : {},
    });
    if (typeof yaw === 'number') e.yaw = yaw;
  }
}
