'use strict';
/* seasons/growth.js: things that grow. Wheat by stage, mushrooms (and their autumn), sugar cane. */

/* ---- wheat growth: variants 1..6 are stages 0..5, 0 is ripe (its art is wheat_stage6 since 0.8273; 1..7 before). Same adoption sweep and pause
   outside the simulation radius as the berry bushes (woods/felling.js), each stage on its own clock. ---- */
const wheatGrow = new Map();
const WHEAT_STAGE_LIFE = 0.35, WHEAT_STAGE_JITTER = 0.3;    // in-game days per stage
const _wheatLife = () => (WHEAT_STAGE_LIFE + Math.random() * WHEAT_STAGE_JITTER) * _dayLen();
let _wheatTimer = 0, _wheatSweep = 0;
// a ripe wheat picked (harvestAtPlayer in player/foraging.js): the plant stays, cut back to its first stage, and grows again
function wheatRegrow(x, y, z) {
  setBlock(x, y, z, B.WHEAT | (1 << 8));
  wheatGrow.set(x + ',' + y + ',' + z, _wheatLife());
}
function updateWheatGrow(dt) {
  _wheatSweep += dt;
  if (_wheatSweep >= 5) {
    _wheatSweep = 0;
    const sp = sweepOriginPlayer();
    if (sp) for (let n = 0; n < 20; n++) {
      const x = Math.floor(sp.pos.x) + (Math.random() * 48 | 0) - 24, z = Math.floor(sp.pos.z) + (Math.random() * 48 | 0) - 24;
      const y = Math.floor(sp.pos.y) + (Math.random() * 12 | 0) - 6;
      const v = getBlock(x, y, z);
      if ((v & 255) === B.WHEAT && ((v >> 8) & 7)) { const k = x + ',' + y + ',' + z; if (!wheatGrow.has(k)) wheatGrow.set(k, _wheatLife()); }
    }
  }
  _wheatTimer += dt;
  if (_wheatTimer < 1) return;
  const step = _wheatTimer * (typeof tickFactor === 'function' ? tickFactor() : 1) * seasonGrowth();
  _wheatTimer = 0;
  if (!step) return;                                            // winter: nothing grows
  for (const [k, t] of wheatGrow) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) continue;
    const v = getBlock(x, y, z), st = (v >> 8) & 7;
    if ((v & 255) !== B.WHEAT || !st) { wheatGrow.delete(k); continue; }
    const left = t - step;
    if (left > 0) { wheatGrow.set(k, left); continue; }
    const next = st >= 6 ? 0 : st + 1;                           // past stage 5 it is ripe (6 until 0.8273)
    setBlock(x, y, z, B.WHEAT | (next << 8));
    if (next) wheatGrow.set(k, _wheatLife()); else wheatGrow.delete(k);
  }
}
/* ---- mushrooms grow ----
   A mushroom's variant: bits 0-2 the size it grows to (1..7 = 0.5x..1.5x; 0 = one from the world generator or from
   before, grown, sized by where it stands), bits 3-7 how many of SHROOM_STEPS steps it still has to grow — the
   mesher draws it at the share it has (emitShroom, chunks/voxel-core.js). New ones come up as sprouts (sproutShroom):
     - in autumn on the forest floor, a few a chunk (_shroomAutumn), and more beside a fallen hollow log;
     - on top of a hollow log packed with dirt or grass, spring to autumn (both processHollowMushrooms, woods/log-mushrooms.js).
   They grow by day only, SHROOM_GROW_S from sprout to full. Under the open sky (not in a cave, and never the lava
   kind) a grown one lasts SHROOM_LIFE_S and is gone, and in winter they all go, a few at a time. Under 40% grown a
   mushroom cannot be picked (shroomTooSmall; it gave nothing before 0.826), and the prompt says how big it is. The clocks are not saved: a chunk's mushrooms are
   picked up again on its next hourly season pass (_shroomChunk), which restarts a grown one's time. */
const SHROOM_STEPS = 31, SHROOM_GROW_S = 900, SHROOM_LIFE_S = 1800;
const SHROOM_WILD = new Set([B.RED_MUSHROOM, B.BROWN_MUSHROOM, B.BLUE_MUSHROOM, B.BLACK_MUSHROOM,
                             B.WHITE_TALL_MUSHROOM, B.YELLOW_MUSHROOM]);      // not the lava one
const SHROOM_OAK = [B.BROWN_MUSHROOM, B.BLACK_MUSHROOM, B.WHITE_TALL_MUSHROOM, B.YELLOW_MUSHROOM];
/* what an autumn wood grows under its trees, by its biome (read once per chunk; deep ones by their base, biomeBase):
   0.837, brown and black in every forest and the wood's own kind, yellow under oak, red under birch, blue under
   spruce; white out in the open beside trees, and very rarely on the plains' flat by a tree */
const SHROOM_FOREST_OWN = { 'Forest': B.YELLOW_MUSHROOM, 'Birch Forest': B.RED_MUSHROOM, 'Snow Forest': B.BLUE_MUSHROOM,
                            'Spruce Forest': B.BLUE_MUSHROOM };
const SHROOM_AUTUMN_TRIES = 2, SHROOM_AUTUMN_CHANCE = 0.039;  // per chunk, per hourly pass: a few standing at once (0.03 before 0.837)
const SHROOM_PLAINS_SHARE = 0.15;                             // the plains' white ones: this share of a forest's tries
const SHROOM_AUTUMN_MAX = 6;                                  // a chunk with this many out already grows no more
const shroomLeft = (vr) => ((vr || 0) >> 3) & 31;
const shroomTooSmall = (id, vr) => PROPS[id]?.shroom != null && shroomLeft(vr) > SHROOM_STEPS * 0.6;
/* How big a mushroom is right now, as the mesher draws it (emitShroom, chunks/voxel-core.js): its full size (bits 0-2,
   0.5x..1.5x; 0 = sized by a hash of where it stands) times the share it has grown, never under 12%. The pickup
   prompt shows it (findBushPickup in player/foraging.js). */
function shroomSizeAt(x, y, z, vr) {
  const m = (vr || 0) & 7;
  let size;
  if (m) size = 0.5 + (m - 1) / 6;
  else {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 217645177) + Math.imul(z | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    size = 0.5 + (h >>> 0) / 4294967296;
  }
  return size * Math.max(0.12, 1 - shroomLeft(vr) / SHROOM_STEPS);
}
const shroomGrow = new Map();       // "x,y,z" -> seconds to its next step (growing) or until it goes (grown)
const _shroomStepS = () => SHROOM_GROW_S / SHROOM_STEPS;
// a new mushroom, just come up: a random full size, all its growing ahead of it
function sproutShroom(x, y, z, id) {
  const size = 1 + ((Math.random() * 7) | 0);
  setBlock(x, y, z, id | ((size | ((SHROOM_STEPS - 1) << 3)) << 8));
  shroomGrow.set(x + ',' + y + ',' + z, _shroomStepS());
}
// a random kind of those an oak-type place grows
const shroomOak = () => SHROOM_OAK[(Math.random() * SHROOM_OAK.length) | 0];
// one chunk on its hourly season pass: pick up its open-air mushrooms, clear some away in winter, grow some in autumn
function _shroomChunk(c) {
  const d = seasonsOn() ? gameDate() : null, season = d ? d.season : 1;
  const data = c.data, wx0 = c.cx * 16, wz0 = c.cz * 16;
  let out = 0;
  // the worker's list of the cells worth a look, or every cell
  /* the place in the list was `k`, and the body's own `const k` (the grow key below) shadowed it: every pass
     threw "Cannot access 'k' before initialization", which stopped the frame before the players were ticked */
  const cand = c._scanCand, n = cand ? cand.length : data.length;
  for (let q = 0; q < n; q++) {
    const i = cand ? cand[q] : q, v = data[i], id = v & 255;
    if (id === B.SUGAR_CANE) { _caneAdopt(wx0 + (i & 15), i >> 8, wz0 + ((i >> 4) & 15), v); continue; }   // the same scan finds cane
    if (!SHROOM_WILD.has(id) || _skyAt(c, i) === 0) continue;      // a cave's stay as they are
    const x = wx0 + (i & 15), y = i >> 8, z = wz0 + ((i >> 4) & 15);
    if (season === 3 && sHash(x, y, z, 9 + d.year * 16) < d.progress * 1.5) {   // winter takes them
      if (_seasonOps < SEASON_OPS_PER_FRAME) { _seasonOps++; setBlock(x, y, z, B.AIR); }
      continue;
    }
    out++;
    const k = x + ',' + y + ',' + z;
    if (!shroomGrow.has(k))
      shroomGrow.set(k, shroomLeft(v >> 8) ? _shroomStepS() : SHROOM_LIFE_S * (0.5 + 0.5 * Math.random()));
  }
  if (season === 2 && out < SHROOM_AUTUMN_MAX) _shroomAutumn(c);
}
// autumn: now and then a sprout on a forest chunk's floor — grass or dirt with air over it
function _shroomAutumn(c) {
  if (c._shroomBiome === undefined)
    c._shroomBiome = typeof mainGen !== 'undefined' && mainGen ? BIOMES.biomeBase(mainGen.biomeAt(c.cx * 16 + 8, c.cz * 16 + 8)) : '';
  const own = SHROOM_FOREST_OWN[c._shroomBiome], plains = c._shroomBiome === 'Plains';
  if (!own && !plains) return;
  for (let t = 0; t < SHROOM_AUTUMN_TRIES; t++) {
    if (Math.random() >= SHROOM_AUTUMN_CHANCE * (plains ? SHROOM_PLAINS_SHARE : 1) || _seasonOps >= SEASON_OPS_PER_FRAME) continue;
    const lx = (Math.random() * 16) | 0, lz = (Math.random() * 16) | 0;
    // down from the sky past air and the canopy (noting it) to the first ground
    let canopy = false;
    for (let y = WORLD_TOP - 1; y > 1; y--) {
      const i = lx + (lz << 4) + (y << 8), id = c.data[i] & 255;
      if (LEAF_BLOCKS.has(id)) { canopy = true; continue; }
      if (id === B.AIR || !CORE.solidVal(c.data[i]) || PROPS[id]?.type === 'wood') continue;
      if ((id === B.GRASS || id === B.DIRT) && (c.data[i + 256] & 255) === B.AIR) {
        let kind = null;
        if (canopy && own) { const r = Math.random(); kind = r < 0.3 ? B.BROWN_MUSHROOM : r < 0.6 ? B.BLACK_MUSHROOM : own; }
        else if (!canopy && id === B.GRASS && _shroomWoodNear(c, lx, y, lz) && (!plains || _shroomFlat(c, lx, y, lz)))
          kind = B.WHITE_TALL_MUSHROOM;
        if (kind) { _seasonOps++; sproutShroom(c.cx * 16 + lx, y + 1, c.cz * 16 + lz, kind); }
      }
      break;
    }
  }
}
// a tree's wood within 4 of a ground cell, a little over it (this chunk's own cells)
function _shroomWoodNear(c, lx, y, lz) {
  for (let dz = -4; dz <= 4; dz++)
    for (let dx = -4; dx <= 4; dx++) {
      const x = lx + dx, z = lz + dz;
      if (x < 0 || x > 15 || z < 0 || z > 15) continue;
      for (let dy = 1; dy <= 3; dy++) {
        const id = c.data[x + (z << 4) + ((y + dy) << 8)] & 255;
        if (PROPS[id]?.model === 'log' && PROPS[id].type === 'wood') return true;
      }
    }
  return false;
}
// level ground round it: solid beside it at its height with air over (the plains' white mushrooms)
function _shroomFlat(c, lx, y, lz) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = lx + dx, z = lz + dz;
    if (x < 0 || x > 15 || z < 0 || z > 15) continue;
    const i = x + (z << 4) + (y << 8);
    if (!CORE.solidVal(c.data[i]) || (c.data[i + 256] & 255) !== B.AIR) return false;
  }
  return true;
}
// once a second: the growing take a step by day, the grown under the sky run out
let _shroomTickT = 0;
function updateShroomGrow(dt) {
  _shroomTickT += dt;
  if (_shroomTickT < 1) return;
  const step = _shroomTickT * (typeof tickFactor === 'function' ? tickFactor() : 1);
  _shroomTickT = 0;
  const day = !(typeof isDarkTime === 'function' && isDarkTime());
  for (const [k, t] of shroomGrow) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) continue;                              // its clock waits while nobody is near
    const v = getBlock(x, y, z), id = v & 255;
    if (!SHROOM_WILD.has(id)) { shroomGrow.delete(k); continue; }
    const vr = (v >> 8) & 255, left = shroomLeft(vr);
    if (left) {
      if (!day) continue;                                         // growing waits for morning
      if (t - step > 0) { shroomGrow.set(k, t - step); continue; }
      setBlock(x, y, z, id | (((vr & 7) | ((left - 1) << 3)) << 8));
      shroomGrow.set(k, left > 1 ? _shroomStepS() : SHROOM_LIFE_S);
      continue;
    }
    if (getSkyWorld(x, y, z) === 0) { shroomGrow.delete(k); continue; }   // grown in the dark: it stays
    if (t - step > 0) { shroomGrow.set(k, t - step); continue; }
    setBlock(x, y, z, B.AIR);                                     // its time is up
    shroomGrow.delete(k);
  }
}
/* ---- sugar cane grows ----
   A cane's variant bits 0-2 are the steps it still has to grow (CANE_STEPS a sprout .. 0 grown; the mesher draws stage
   0-4, then a grown column's pieces). A grown cane on top of its column, with air over it and water beside the column's
   foot, puts a new shoot on itself until the column is CANE_MAX_H high. Found by each chunk's season pass (_shroomChunk's
   scan) and by planting (player/placing.js); its clock waits outside the simulation radius, and in winter. */
const CANE_MAX_H = 5;
const CANE_STEP_LIFE = 0.15, CANE_STEP_JITTER = 0.1;   // in-game days a step: a new block about every 20 minutes
const caneGrow = new Map();
const _caneLife = () => (CANE_STEP_LIFE + Math.random() * CANE_STEP_JITTER) * _dayLen();
function queueCaneGrow(x, y, z) { caneGrow.set(x + ',' + y + ',' + z, _caneLife()); }
// can this grown cane put a shoot on top: the column's top, under CANE_MAX_H, air above, water beside its foot
function _caneCanRise(x, y, z) {
  if (y + 1 >= WORLD_TOP || (getBlock(x, y + 1, z) & 255) !== B.AIR) return false;
  let foot = y;
  while (foot > 1 && (getBlock(x, foot - 1, z) & 255) === B.SUGAR_CANE) foot--;
  if (y - foot + 1 >= CANE_MAX_H) return false;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    for (const yy of [foot, foot - 1]) if ((getBlock(x + dx, yy, z + dz) & 255) === B.WATER) return true;
  return false;
}
// the season pass meets a cane: keep a clock on it if it is still growing, or could grow taller
function _caneAdopt(x, y, z, v) {
  const k = x + ',' + y + ',' + z;
  if (!caneGrow.has(k) && (((v >> 8) & 7) || _caneCanRise(x, y, z))) caneGrow.set(k, _caneLife());
}
let _caneTickT = 0;
function updateCaneGrow(dt) {
  _caneTickT += dt;
  if (_caneTickT < 1) return;
  const step = _caneTickT * (typeof tickFactor === 'function' ? tickFactor() : 1) * seasonGrowth();
  _caneTickT = 0;
  if (!step) return;                                             // winter: nothing grows
  for (const [k, t] of caneGrow) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) continue;
    const v = getBlock(x, y, z);
    if ((v & 255) !== B.SUGAR_CANE) { caneGrow.delete(k); continue; }
    if (t - step > 0) { caneGrow.set(k, t - step); continue; }
    const left = (v >> 8) & 7;
    if (left) {                                                  // a stage on
      setBlock(x, y, z, B.SUGAR_CANE | ((((v >> 8) & ~7) | (left - 1)) << 8));
      if (left > 1 || _caneCanRise(x, y, z)) caneGrow.set(k, _caneLife()); else caneGrow.delete(k);
      continue;
    }
    caneGrow.delete(k);
    if (_caneCanRise(x, y, z)) {                                 // grown: a new shoot on top, past the seedling
      setBlock(x, y + 1, z, B.SUGAR_CANE | ((CANE_STEPS - 1) << 8));
      queueCaneGrow(x, y + 1, z);
    }
  }
}
