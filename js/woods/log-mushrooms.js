'use strict';
/* woods/log-mushrooms.js: mushrooms growing on a lying hollow log packed with dirt. */

/* ---- mushrooms on hollow logs: a LYING hollow log packed with dirt or grass now and then sprouts a
   mushroom on top, of the kind its wood grows — oak brown, birch red, spruce blue. Hollow logs are rare, so
   rather than probing random cells this scans one loaded chunk's data per step, walking the 7x7 chunks
   around the player; each chunk comes round about every 100 s at normal tick speed. ---- */
// hollow log -> the mushroom it grows: each wood's `shroom` in the woods table (woods/woods.js); a wood with none grows none
const HOLLOW_SHROOM = {};
for (const w of woodList()) if (w.hollow != null && w.shroom != null) HOLLOW_SHROOM[w.hollow] = w.shroom;
const HOLLOW_SHROOM_CHANCE = 0.15;              // per log, per visit of its chunk: roughly one every 10 minutes
const HOLLOW_SIDE_SHROOM_CHANCE = 0.03;         // autumn, per log cell, per visit: a few round each log at a time
let _shroomTimer = 0, _shroomStep = 0;
function processHollowMushrooms(dt) {
  if (menuScene || !player.spawned) return;
  _shroomTimer += dt;
  const interval = 2.0 / tickFactor();
  if (_shroomTimer < interval) return;
  _shroomTimer -= interval;
  const k = _shroomStep++ % 49;
  const cx = Math.floor(player.pos.x / 16) + (k % 7) - 3, cz = Math.floor(player.pos.z / 16) + ((k / 7) | 0) - 3;
  const c = getChunk(cx, cz);
  if (!c || !c.data || !inSimRangeChunk(cx, cz)) return;
  const d = c.data;
  const autumn = seasonsOn() && gameDate().season === 2;
  for (let i = 0; i < d.length - 256; i++) {
    const v = d[i];
    let shroom = HOLLOW_SHROOM[v & 255];
    // an oak log grows brown, black, white or yellow, as brown grows in the wild
    if (shroom === B.BROWN_MUSHROOM) shroom = shroomOak();
    if (!shroom || !((v >> 8) & 3)) continue;                            // standing up: a planter, not a rotting log
    const x = cx * 16 + (i & 15), y = i >> 8, z = cz * 16 + ((i >> 4) & 15);
    /* Autumn: mushrooms come up on the ground beside a fallen hollow log, whatever it holds — the best
       place in the woods to find them. One side at random, on grass or dirt with air over it. */
    if (autumn && Math.random() < HOLLOW_SIDE_SHROOM_CHANCE) {
      const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][(Math.random() * 4) | 0];
      const g = getBlock(x + dx, y - 1, z + dz) & 255;
      if ((g === B.GRASS || g === B.DIRT) && (getBlock(x + dx, y, z + dz) & 255) === B.AIR) sproutShroom(x + dx, y, z + dz, shroom);
    }
    const fill = hollowFillOf(v);
    if ((fill !== B.DIRT && fill !== B.GRASS) || (d[i + 256] & 255) !== B.AIR) continue;
    if (Math.random() >= HOLLOW_SHROOM_CHANCE * seasonGrowth()) continue;   // by season: spring to autumn
    sproutShroom(x, y + 1, z, shroom);                                    // a sprout that grows
  }
}
