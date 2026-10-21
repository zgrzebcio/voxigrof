'use strict';
/* woods/coconuts.js: coconuts on the palms. Where one can hang (a spot: open air under a palm log, a frond's rib, with
   the trunk beside it, so the cells right under the crown), how one sprouts there (COCO_SPROUT a second), how it grows (its
   stage in variant bits 0-2, one every COCO_STAGE_DAYS: ripe after about three in-game days; small and green until then, the
   block in blocks/plants.js), and how it comes down: a ripe one lets go by itself (COCO_FALL a sim tick), and any one whose
   log is taken (coconutLostHold, from setBlock in chunks/block-access.js). It falls as a block (dropBlockFrom,
   blocks/falling.js), hurting who it lands on, and on the ground a ripe one cracks into COCO_HALVES half coconuts and a green
   one goes to pieces (coconutLanded). A palm cut down drops each of its coconuts now and then (coconutsOffFelled, from
   woods/felling.js); a hatchet takes a ripe one whole (50-loottable.js). The prompt over one says how far it has grown
   (coconutPrompt, ui/hud.js).
   Like the wheat (seasons/growth.js): spots and coconuts are found by looking down random columns round player one, kept in
   COCO_SPOTS and COCO_GROW, and stepped from updateSeasonGrowth (seasons/seasons.js); the clocks are not saved. */

const COCO_STAGE_DAYS = 0.6;               // in-game days a stage: five of them from a sprout to ripe, about three days
const COCO_SPROUT = 0.001;                 // a free spot's chance a second to sprout a coconut
const COCO_FALL = 0.0001;                  // a ripe one's chance a sim tick (SIM_HZ a second) to let go
const COCO_HALVES = 2;                     // what a ripe one leaves when it cracks on the ground
const COCO_FELL_MIN = 0.01, COCO_FELL_MAX = 0.1;   // the chance a felled palm's coconut drops whole: a sprout .. ripe
const COCO_LOOK_S = 2, COCO_LOOK_COLS = 24, COCO_LOOK_R = 32;   // every COCO_LOOK_S, this many columns this far round
const COCO_SPOTS = new Map();              // "x,y,z" -> true: a place a coconut can hang (empty or not)
const COCO_GROW = new Map();               // "x,y,z" -> seconds to a growing coconut's next stage
let _cocoLookT = 0, _cocoT = 0;
const _cocoKey = (x, y, z) => x + ',' + y + ',' + z;
const _isPalmLog = (v) => (v & 255) === B.PALM_LOG;
const _cocoStage = (v) => (v >> 8) & 7;
const _cocoRipe = (v) => _cocoStage(v) >= PROPS[B.COCONUT].ripeStage;
const _cocoLife = () => COCO_STAGE_DAYS * (0.8 + Math.random() * 0.4) * _dayLen();
// can a coconut hang at (x, y, z): a palm log over it, the trunk beside it
function _cocoSpotOK(x, y, z) {
  if (!_isPalmLog(getBlock(x, y + 1, z))) return false;
  return _isPalmLog(getBlock(x + 1, y, z)) || _isPalmLog(getBlock(x - 1, y, z)) || _isPalmLog(getBlock(x, y, z + 1)) || _isPalmLog(getBlock(x, y, z - 1));
}
// one column looked down from yTop: the first palm log under the fronds, and what is under it
function _cocoLookColumn(x, z, yTop, yBot) {
  for (let y = yTop; y > yBot; y--) {
    const id = getBlock(x, y, z) & 255;
    if (id === B.AIR || id === B.PALM_LEAVES) continue;
    if (id !== B.PALM_LOG) return;                                // the ground, or another tree: no crown in this column
    const below = getBlock(x, y - 1, z), k = _cocoKey(x, y - 1, z);
    if ((below & 255) === B.COCONUT) {
      COCO_SPOTS.set(k, true);
      if (!COCO_GROW.has(k) && !_cocoRipe(below)) COCO_GROW.set(k, _cocoLife());
    } else if ((below & 255) === B.AIR && _cocoSpotOK(x, y - 1, z)) COCO_SPOTS.set(k, true);
    return;
  }
}
function updateCoconuts(dt) {
  const sp = typeof sweepOriginPlayer === 'function' ? sweepOriginPlayer() : null;
  if (!sp) return;
  if ((_cocoLookT += dt) >= COCO_LOOK_S) {
    _cocoLookT = 0;
    const px = Math.floor(sp.pos.x), py = Math.floor(sp.pos.y), pz = Math.floor(sp.pos.z);
    for (let n = 0; n < COCO_LOOK_COLS; n++)
      _cocoLookColumn(px + ((Math.random() * COCO_LOOK_R * 2) | 0) - COCO_LOOK_R, pz + ((Math.random() * COCO_LOOK_R * 2) | 0) - COCO_LOOK_R, py + 40, py - 24);
  }
  if ((_cocoT += dt) < 1) return;
  const secs = _cocoT * (typeof tickFactor === 'function' ? tickFactor() : 1);
  _cocoT = 0;
  const grow = seasonGrowth(), step = secs * grow;                // winter: nothing grows or sprouts
  const sproutP = grow > 0 ? 1 - Math.pow(1 - COCO_SPROUT, secs) : 0;
  const fallP = 1 - Math.pow(1 - COCO_FALL, secs * SIM_HZ);
  for (const k of [...COCO_SPOTS.keys()]) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) {
      // far behind player one: forgotten (found again when they come back)
      if (Math.abs(x - sp.pos.x) > 256 || Math.abs(z - sp.pos.z) > 256) { COCO_SPOTS.delete(k); COCO_GROW.delete(k); }
      continue;
    }
    const v = getBlock(x, y, z), id = v & 255;
    if (id === B.COCONUT) {
      if (!_isPalmLog(getBlock(x, y + 1, z))) { COCO_GROW.delete(k); dropBlockFrom(x, y, z, v); continue; }   // nothing holds it
      if (_cocoRipe(v)) {
        COCO_GROW.delete(k);
        if (Math.random() < fallP) dropBlockFrom(x, y, z, v);
        continue;
      }
      const left = (COCO_GROW.get(k) ?? _cocoLife()) - step;
      if (left > 0) { COCO_GROW.set(k, left); continue; }
      setBlock(x, y, z, B.COCONUT | ((_cocoStage(v) + 1) << 8));
      COCO_GROW.set(k, _cocoLife());
    } else if (id === B.AIR) {
      COCO_GROW.delete(k);
      if (!_cocoSpotOK(x, y, z)) { COCO_SPOTS.delete(k); continue; }
      if (Math.random() < sproutP) { setBlock(x, y, z, B.COCONUT); COCO_GROW.set(k, _cocoLife()); }
    } else { COCO_SPOTS.delete(k); COCO_GROW.delete(k); }      // something else took the spot
  }
}

// the palm log at (x, y + 1, z) is gone: a coconut under it falls (from setBlock, chunks/block-access.js)
function coconutLostHold(x, y, z) {
  const v = getBlock(x, y, z);
  if ((v & 255) !== B.COCONUT) return;
  COCO_GROW.delete(_cocoKey(x, y, z));
  dropBlockFrom(x, y, z, v);
}
// a falling coconut has come down at (x, y, z) (blocks/falling.js): a ripe one cracks into halves, a green one into nothing
function coconutLanded(x, y, z, val) {
  if (typeof fxBreak === 'function') fxBreak(x, y, z, val);
  if (typeof playBlockSound === 'function') playBlockSound(B.MELON, 'break', x, y, z);
  if (_cocoRipe(val) && !player.canFly) spawnDrop(ITEM.HALF_COCONUT, x, y, z, null, undefined, null, null, 0, COCO_HALVES);
}
/* A palm cut down (fellTreeFrom, woods/felling.js, with its logs): each coconut hanging off it drops whole now and then, more
   the more it has grown (COCO_FELL_MIN .. COCO_FELL_MAX), twice that with Timber Shaker (the skill that brings a cut tree's
   leaves down); the rest are lost with the tree. */
function coconutsOffFelled(logs) {
  const seen = new Set(), mul = typeof hasSkill === 'function' && hasSkill('timberShake') ? 2 : 1;
  for (const l of logs)
    for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      const x = l.x + dx, y = l.y + dy, z = l.z + dz, k = _cocoKey(x, y, z);
      if (seen.has(k)) continue;
      seen.add(k);
      const v = getBlock(x, y, z);
      if ((v & 255) !== B.COCONUT) continue;
      COCO_GROW.delete(k);
      setBlock(x, y, z, B.AIR);
      const share = Math.min(1, _cocoStage(v) / PROPS[B.COCONUT].ripeStage);
      if (!player.canFly && Math.random() < (COCO_FELL_MIN + (COCO_FELL_MAX - COCO_FELL_MIN) * share) * mul) spawnDrop(ITEM.COCONUT, x, y, z);
    }
}
// the line under the crosshair over a coconut: how far it has grown, and what takes it (ui/hud.js)
function coconutPrompt() {
  const hit = typeof currentRay === 'function' ? currentRay() : null;
  if (!hit || hit.id !== B.COCONUT) return '';
  const v = getBlock(hit.x, hit.y, hit.z);
  if (_cocoRipe(v)) return 'Coconut, ripe: a hatchet takes it';
  return `Green coconut, ${Math.round(_cocoStage(v) / PROPS[B.COCONUT].ripeStage * 100)}% grown`;
}
