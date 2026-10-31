'use strict';
/* woods/vines.js: the jungle's vines. B.VINE (blocks/glow-and-storage.js) is a thin plate against what it hangs on, like the
   glow vine: its variant bits 0-1 the side that is on (0 -Z, 1 +Z, 2 -X, 3 +X), bit 2 (WALL_PAIR) a second one on the other
   wall of a corner (tryWallPair, blocks/ladders.js). Its look 1 (blocks/looks.js) is the half-cut vine: shears stopped it,
   and it never grows again.
   - Where: the world generator hangs strands on the giant jungle trees from biomeRev 45 (woods/jungle-trees.js: down the
     2x2 trunk's sides and from the edges of its leaves); a giant grown from a sapling gets them too. A player puts one on
     the side of a solid block, as the glow vine (player/place-block.js).
   - What holds one: what is behind it (anything solid, a log, leaves) or a vine right over it. With neither it falls off
     as a vine (vineChanged, from setBlock in chunks/block-access.js), so a strand cut through drops what hung on it.
   - Growing: a strand's lowest cell, its TIP, grows a cell down about every VINE_GROW_DAYS while the season lets things
     grow (seasonGrowth: not in winter), into air with air under that too (it stops a block over the ground), never
     longer than VINE_MAX. Tips are found by looking down random columns round player one (as the cocoa's spots,
     woods/cocoa.js) and as a vine is put down or grows; kept in VINE_TIPS, stepped from updateSeasonGrowth
     (seasons/seasons.js). The clocks are not saved.
   - Shears: the use button on a vine cuts it there (tryCutVine, from _doPlace): that cell turns half cut and everything
     hanging under it falls off as vines, for one point of wear. Broken by anything a vine gives itself (blockDrop). */

const VINE_GROW_DAYS = 0.15;               // in-game days a cell, more or less (a day is DAY_LEN seconds)
const VINE_MAX = 24;                       // the longest a strand grows (counted up from its tip)
const VINE_LOOK_S = 2, VINE_LOOK_COLS = 48, VINE_LOOK_R = 32;   // every VINE_LOOK_S, this many columns this far round
const VINE_CUT = 1;                        // the half-cut look's number
const VINE_TIPS = new Map();               // "x,y,z" -> seconds to the tip's next cell
const VINE_TO_WALL = [[0, -1], [0, 1], [-1, 0], [1, 0]];   // variant -> the way to what it hangs on
let _vineLookT = 0, _vineT = 0;
const _vineKey = (x, y, z) => x + ',' + y + ',' + z;
const _vineLife = () => VINE_GROW_DAYS * (0.7 + Math.random() * 0.6) * _dayLen();
const isVineVal = (v) => (v & 255) === B.VINE;
// a cell with a vine in it: its own, or one of a corner's two (the other a ladder or a vine: blocks/ladders.js)
const _hasVine = (v) => wallParts(v).some(isVineVal);
// a cell a vine can hang on: anything solid, a log of any width, leaves
function _vineHolds(v) {
  const id = v & 255;
  return id !== B.AIR && id !== B.VINE && (CORE.solidVal(v) || LEAF_BLOCKS.has(id) || PROPS[id]?.model === 'log');
}
const _vineWallHolds = (x, y, z, w) => _vineHolds(getBlock(x + VINE_TO_WALL[w][0], y, z + VINE_TO_WALL[w][1]));
// is the vine `p` (one alone, or a corner's one, as a value alone) held at (x, y, z)? By its wall, or a vine over it
const _vinePartHeld = (x, y, z, p) => _vineWallHolds(x, y, z, (p >> 8) & 3) || _hasVine(getBlock(x, y + 1, z));
/* the vines of the cell (x, y, z) that nothing holds come off, each alone (a corner's other one stays, a ladder beside one
   too); true when one did */
function _vineSettle(x, y, z) {
  const v = getBlock(x, y, z), parts = wallParts(v);
  const off = parts.map(p => isVineVal(p) && !_vinePartHeld(x, y, z, p));
  if (!off.some(Boolean)) return false;
  if (off.every(Boolean)) _vineDrop(x, y, z, v);
  else { VINE_TIPS.delete(_vineKey(x, y, z)); wallPartOff(x, y, z, off.indexOf(true), true); }
  return true;
}
// a growing tip: an uncut vine with air under it
const _vineTip = (x, y, z, v) => isVineVal(v) && lookOf(v) !== VINE_CUT && (getBlock(x, y - 1, z) & 255) === B.AIR;
// a vine comes off: gone, a vine dropped (none in creative)
function _vineDrop(x, y, z, v) {
  VINE_TIPS.delete(_vineKey(x, y, z));
  setBlock(x, y, z, B.AIR);
  if (typeof fxBreak === 'function') fxBreak(x, y, z, v);
  if (player.canFly) return;
  for (const d of blockDrop(v)) spawnDrop(d.id, x, y, z, null, undefined, null, null, 0, d.count);
}
/* From setBlock (chunks/block-access.js), every change. A vine put down or grown: a tip if it hangs over air, and the
   one over it is no tip any more. Something that held vines gone (a log felled, a leaf decayed, a vine broken): every vine
   it held that nothing else holds falls (each one's own setBlock carries it on down the strand). */
function vineChanged(x, y, z, oldVal, val) {
  if (isVineVal(val)) {
    if (_vineTip(x, y, z, val) && !VINE_TIPS.has(_vineKey(x, y, z))) VINE_TIPS.set(_vineKey(x, y, z), _vineLife());
    VINE_TIPS.delete(_vineKey(x, y + 1, z));
    return;
  }
  if (!(_hasVine(oldVal) || _vineHolds(oldVal)) || _vineHolds(val)) return;
  VINE_TIPS.delete(_vineKey(x, y, z));
  // the vines beside it whose wall this was, each alone (a corner's other one, or its ladder, stays)
  for (let w = 0; w < 4; w++) {
    const d = VINE_TO_WALL[w], nx = x - d[0], nz = z - d[1];
    if (wallParts(getBlock(nx, y, nz)).some(p => isVineVal(p) && ((p >> 8) & 3) === w)) _vineSettle(nx, y, nz);
  }
  // ...and the ones under it it held
  if (_hasVine(getBlock(x, y - 1, z)) && _vineSettle(x, y - 1, z)) { /* the strand under it comes down cell by cell */ }
  // a cell opened under a strand: its lowest vine grows again
  else if (y < WORLD_TOP && (val & 255) === B.AIR) {
    const above = getBlock(x, y + 1, z);
    if (_vineTip(x, y + 1, z, above) && !VINE_TIPS.has(_vineKey(x, y + 1, z))) VINE_TIPS.set(_vineKey(x, y + 1, z), _vineLife());
  }
}
// one column looked down from yTop: every growing tip in it gets its clock
function _vineLookColumn(x, z, yTop, yBot) {
  for (let y = yTop; y > yBot; y--) {
    const v = getBlock(x, y, z);
    if (!isVineVal(v) || !_vineTip(x, y, z, v)) continue;
    const k = _vineKey(x, y, z);
    if (!VINE_TIPS.has(k)) VINE_TIPS.set(k, _vineLife());
  }
}
// the strand's length from (x, y, z) up, VINE_MAX at most
function _vineLength(x, y, z) {
  let n = 0;
  while (n < VINE_MAX && isVineVal(getBlock(x, y + n, z))) n++;
  return n;
}
function updateVines(dt) {
  const sp = typeof sweepOriginPlayer === 'function' ? sweepOriginPlayer() : null;
  if (!sp) return;
  if ((_vineLookT += dt) >= VINE_LOOK_S) {
    _vineLookT = 0;
    const px = Math.floor(sp.pos.x), py = Math.floor(sp.pos.y), pz = Math.floor(sp.pos.z);
    for (let n = 0; n < VINE_LOOK_COLS; n++)
      _vineLookColumn(px + ((Math.random() * VINE_LOOK_R * 2) | 0) - VINE_LOOK_R, pz + ((Math.random() * VINE_LOOK_R * 2) | 0) - VINE_LOOK_R, py + 40, py - 24);
  }
  if ((_vineT += dt) < 1) return;
  const secs = _vineT * (typeof tickFactor === 'function' ? tickFactor() : 1);
  _vineT = 0;
  const step = secs * seasonGrowth();                         // winter: nothing grows
  if (step <= 0 || (typeof streamBehind !== 'undefined' && streamBehind)) return;   // land is waiting: the clocks wait too
  for (const [k, left] of [...VINE_TIPS]) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) {
      // far behind player one: forgotten (found again when they come back)
      if (Math.abs(x - sp.pos.x) > 256 || Math.abs(z - sp.pos.z) > 256) VINE_TIPS.delete(k);
      continue;
    }
    const v = getBlock(x, y, z);
    if (!_vineTip(x, y, z, v)) { VINE_TIPS.delete(k); continue; }
    if (left - step > 0) { VINE_TIPS.set(k, left - step); continue; }
    VINE_TIPS.delete(k);
    // a block over the ground at the least, and no longer than VINE_MAX
    if (y < 2 || (getBlock(x, y - 2, z) & 255) !== B.AIR || _vineLength(x, y, z) >= VINE_MAX) continue;
    // two vines in a corner grow on as two; one beside a ladder or a glow vine alone; vineChanged makes it the tip
    const vs = wallParts(v).filter(isVineVal);
    setBlock(x, y - 1, z, (B.VINE | ((vs.length > 1 ? (v >> 8) & 7 : (vs[0] >> 8) & 3) << 8)) >>> 0);
  }
}
/* Shears on a vine (from _doPlace, player/place-block.js): the cell turns half cut and stops growing; every vine hanging
   under it in its column falls off as a vine, from the bottom up. One point of the shears' wear. */
function tryCutVine(hit) {
  if (!hit || hit.id !== B.VINE || hit.over) return false;
  const held = heldUseId();
  if (held == null || held < 256 || ITEM_PROPS[held]?.tool !== 'shears') return false;
  if (act && act.place) return true;                          // one cut a press
  const { x, y, z } = hit, v = getBlock(x, y, z);
  if (!isVineVal(v)) return false;                            // a vine beside a ladder in its cell: the plain one only
  if (lookOf(v) === VINE_CUT) return true;
  let bottom = y;
  while (bottom > 0 && isVineVal(getBlock(x, bottom - 1, z))) bottom--;
  for (let yy = bottom; yy < y; yy++) _vineDrop(x, yy, z, getBlock(x, yy, z));
  VINE_TIPS.delete(_vineKey(x, y, z));
  setBlock(x, y, z, withLook(v, VINE_CUT));
  playBlockSound(B.VINE, 'break', x, y, z);
  const slot = HOTBAR[hotbarSel];
  if (!player.canFly && slot && slot.dur != null) {
    if (wearSlot(slot) === 'gone') HOTBAR[hotbarSel] = null;
    saveHotbar(); buildHotbar(); updateHotbar();
  }
  return true;
}
// the line under the crosshair over a growing vine, shears in hand (ui/hud.js)
function vinePrompt() {
  const hit = typeof currentRay === 'function' ? currentRay() : null;
  if (!hit || hit.id !== B.VINE || hit.over) return '';
  const held = heldUseId();
  if (held == null || held < 256 || ITEM_PROPS[held]?.tool !== 'shears') return '';
  return lookOf(getBlock(hit.x, hit.y, hit.z)) === VINE_CUT ? 'Vine, cut: it grows no more'
                                                            : 'Use: cut the vine here (it stops growing, what hangs under it comes off)';
}
