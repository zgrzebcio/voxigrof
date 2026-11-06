'use strict';
/* js/blocks/egg.js: eggs on the ground. The block B.EGG (its boxes and art: blocks/plants.js) comes only from a hen laying: the
   egg item (ITEM.EGG) is what one gives when taken up, and is not placed. Who lays and who sits is entities/chicken.js.

   EGGS "x,y,z" -> { x, y, z, sat, need, hen }: every egg the page knows of. `sat` = the seconds hens have sat on it so far: it
   hatches at `need` (EGG_HATCH_S, plus up to EGG_HATCH_LATE rolled for each egg) and keeps what it has when a hen gets up.
   `hen` = the hen on it or walking to it (not saved: she finds it again). setBlock tells this file of an egg put down or gone
   (eggChanged), a chunk coming in of the ones in it (PROPS `pageSeen`, eggSeen). Saved as `eggs`: only the ones sat on, the
   others are found again as their chunks come in.

   Picked up with E (player/foraging.js), broken with one blow (no hardness), carried off by flowing water (`washes`,
   fluids/fluids.js), popped off when the floor under it goes (setBlock): each gives the egg item (blockDrop, 50-loottable.js). */
const EGG_HATCH_S = 600, EGG_HATCH_LATE = 120;   // seconds of sitting that hatch one: at least this, plus up to this
const EGGS = new Map();
const _eggKey = (x, y, z) => x + ',' + y + ',' + z;
function _eggAdd(x, y, z, sat = 0, need = EGG_HATCH_S + Math.random() * EGG_HATCH_LATE) {
  const g = { x, y, z, sat, need, hen: null };
  EGGS.set(_eggKey(x, y, z), g);
  return g;
}
// setBlock's hook: a cell that holds an egg now, or held one
function eggChanged(x, y, z, isEgg) {
  const k = _eggKey(x, y, z);
  if (!isEgg) EGGS.delete(k);
  else if (!EGGS.has(k)) _eggAdd(x, y, z);
}
// an egg in a chunk coming in (pageModelSeen, chunks/stream.js)
function eggSeen(x, y, z) { if (!EGGS.has(_eggKey(x, y, z))) _eggAdd(x, y, z); }
// the hen on it or on her way to it, if she is still about; null when it is free
const eggHen = (g) => (g.hen && g.hen.hp > 0 && g.hen._egg === g && ENTITIES.includes(g.hen) ? g.hen : null);

/* ---- the save ---- */
function clearEggs() { EGGS.clear(); }
const serializeEggs = () => [...EGGS.values()].filter(g => g.sat > 0).map(g => [g.x, g.y, g.z, Math.round(g.sat), Math.round(g.need)]);
function restoreEggs(rows) {
  if (Array.isArray(rows)) for (const r of rows) if (Array.isArray(r) && r.length >= 5) _eggAdd(r[0], r[1], r[2], r[3], r[4]);
}

// what the crosshair says about an egg hens have started on (ui/hud.js); '' otherwise, so E's own prompt shows
function eggPrompt() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return '';
  const hit = currentRay();
  if (!hit || hit.id !== B.EGG) return '';
  const g = EGGS.get(_eggKey(hit.x, hit.y, hit.z));
  return g && g.sat > 0 ? `<b>Egg</b> · ${Math.min(99, Math.floor(g.sat / g.need * 100))}% hatched` : '';
}
