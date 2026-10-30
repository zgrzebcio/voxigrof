'use strict';
/* woods/cocoa.js: cocoa pods on the jungle's straight trunks. The block is B.COCOA (blocks/plants.js): the side its trunk is
   on in variant bits 0-1, its stage in bits 2-3 (COCOA_BITS), green until ripe. Wild only: nobody plants one yet.
   - Where: beside a STRAIGHT trunk, an upright run of one-block-wide grown jungle logs (bark on or off; not a giant's
     quarter, not a placed log) at least COCOA_TRUNK_MIN tall on the ground, from COCOA_MIN_UP blocks over the ground up to
     COCOA_TOP_GAP under its top. The world generator hangs some on its tall trees (woods/jungle-trees.js, as high); here a
     new one buds on such a trunk now and then (COCOA_SPROUT a second a spot, never more than COCOA_PER_TRUNK on one), and
     every pod grows a stage each COCOA_STAGE_DAYS while the season lets things grow (seasonGrowth: not in winter).
   - How one comes off: broken by anything, ripe it gives cocoa beans (one, a second half the time) and a quarter of the
     time fat, green nothing (blockDrop, 50-loottable.js). A ripe one left on the tree breaks off by itself after about
     COCOA_OVERRIPE_DAYS and drops what it gives. One with no jungle wood on its trunk's side breaks (cocoaLostHold, from
     setBlock in chunks/block-access.js, and the step below for one found so). Its tree felled, every pod on it comes off
     (cocoaOffFelled, from fellTreeFrom). With Timber Shaker every swing into its tree may shake a RIPE one off for its
     beans (cocoaShake, from skillShakeTree, player/skills.js); a green one stays.
   Every pod is known as its chunk comes in (PROPS `pageSeen`: the worker lists it with the light sources, finishChunkGen
   hands it to cocoaSeen); spots for new ones are found by looking down random columns round player one, as the coconut's
   (woods/coconuts.js). All kept in COCOA_SPOTS and COCOA_GROW, stepped from updateSeasonGrowth (seasons/seasons.js); the
   clocks are not saved. */

const COCOA_STAGE_DAYS = 0.5;              // in-game days a stage: three from a bud to ripe, about a day and a half
const COCOA_OVERRIPE_DAYS = 2;             // a ripe one stays about this long before it breaks off by itself
const COCOA_SPROUT = 0.00004;              // a free spot's chance a second to bud a pod
const COCOA_PER_TRUNK = 4;                 // ...while its trunk holds fewer than this
const COCOA_MIN_UP = 7, COCOA_TOP_GAP = 3;      // a pod this many blocks over the ground at least; none this near its trunk's top
const COCOA_TRUNK_MIN = COCOA_MIN_UP + COCOA_TOP_GAP;   // ...so a straight trunk this tall at least
const COCOA_SHAKE = 0.15;                  // Timber Shaker: a ripe pod's chance a swing to be shaken off
const COCOA_LOOK_S = 2, COCOA_LOOK_COLS = 64, COCOA_LOOK_R = 32;   // every COCOA_LOOK_S, this many columns this far round
const COCOA_SPOTS = new Map();             // "x,y,z" -> the pod's FACE there: a place a pod can hang (empty or not)
const COCOA_GROW = new Map();              // "x,y,z" -> seconds to a growing pod's next stage
const COCOA_TO_TRUNK = [[0, 1], [0, -1], [1, 0], [-1, 0]];   // FACE -> the way to its trunk: +Z, -Z, +X, -X
let _cocoaLookT = 0, _cocoaT = 0;
const _cocoaKey = (x, y, z) => x + ',' + y + ',' + z;
const _cocoaStage = (v) => ((v >> 8) >> COCOA_BITS.STAGE_SHIFT) & COCOA_BITS.STAGE_MASK;
const _cocoaFace = (v) => (v >> 8) & COCOA_BITS.FACE;
const cocoaRipe = (v) => _cocoaStage(v) >= COCOA_BITS.RIPE;
const _cocoaVal = (face, stage) => (B.COCOA | ((face | (stage << COCOA_BITS.STAGE_SHIFT)) << 8)) >>> 0;
const _cocoaLife = () => COCOA_STAGE_DAYS * (0.8 + Math.random() * 0.4) * _dayLen();
const _isJungleWood = (v) => (v & 255) === B.JUNGLE_LOG || (v & 255) === B.STRIPPED_JUNGLE_LOG;
// a straight trunk's log: jungle wood standing upright, one block wide, grown (a placed log has no width of its own)
function _cocoaTrunkLog(v) {
  if (!_isJungleWood(v)) return false;
  const vb = (v >> 8) & 255;
  return (vb & 3) === 0 && ((vb >> 2) & 63) !== 0 && !CORE.isQuadW(logWidthOf(vb));
}
// the straight trunk through (x, y, z): [bottom, top] of its run on the ground, or null when it is no such trunk
function _cocoaTrunk(x, y, z) {
  if (!_cocoaTrunkLog(getBlock(x, y, z))) return null;
  let lo = y, hi = y;
  while (lo > 1 && _cocoaTrunkLog(getBlock(x, lo - 1, z))) lo--;
  while (hi < WORLD_TOP && _cocoaTrunkLog(getBlock(x, hi + 1, z))) hi++;
  const under = getBlock(x, lo - 1, z);
  if (!CORE.solidVal(under) || PROPS[under & 255]?.model === 'log' || hi - lo + 1 < COCOA_TRUNK_MIN) return null;
  return [lo, hi];
}
// the pod at (x, y, z) still has its trunk beside it
const _cocoaHeld = (x, y, z, v) => { const d = COCOA_TO_TRUNK[_cocoaFace(v)]; return _isJungleWood(getBlock(x + d[0], y, z + d[1])); };
// the pods on the trunk at column (tx, tz) from y0 to y1
function _cocoaOnTrunk(tx, tz, y0, y1) {
  let n = 0;
  for (let y = y0; y <= y1; y++)
    for (let f = 0; f < 4; f++) {
      const d = COCOA_TO_TRUNK[f], v = getBlock(tx - d[0], y, tz - d[1]);
      if ((v & 255) === B.COCOA && _cocoaFace(v) === f) n++;
    }
  return n;
}
/* one column looked down from yTop: the first block that is not air, leaves or a pod; if it is a straight trunk, every
   place beside it a pod may hang is a spot, and every pod there gets its clock */
function _cocoaLookColumn(x, z, yTop, yBot) {
  for (let y = yTop; y > yBot; y--) {
    const v = getBlock(x, y, z), id = v & 255;
    if (id === B.AIR || id === B.JUNGLE_LEAVES || id === B.COCOA) continue;
    const run = _cocoaTrunk(x, y, z);
    if (!run) return;
    for (let py = run[0] + COCOA_MIN_UP - 1; py <= run[1] - COCOA_TOP_GAP; py++)   // run[0] is the first log, a block over the ground
      for (let f = 0; f < 4; f++) {
        const d = COCOA_TO_TRUNK[f], px = x - d[0], pz = z - d[1], pv = getBlock(px, py, pz), k = _cocoaKey(px, py, pz);
        if ((pv & 255) === B.COCOA && _cocoaFace(pv) === f) {
          COCOA_SPOTS.set(k, f);
          if (!COCOA_GROW.has(k) && !cocoaRipe(pv)) COCOA_GROW.set(k, _cocoaLife());
        } else if ((pv & 255) === B.AIR) COCOA_SPOTS.set(k, f);
      }
    return;
  }
}
// a pod comes off: gone, with what it gives (ripe: beans and maybe fat; green: nothing; in creative nothing)
function _cocoaBreak(x, y, z, v) {
  COCOA_GROW.delete(_cocoaKey(x, y, z));
  setBlock(x, y, z, B.AIR);
  if (typeof fxBreak === 'function') fxBreak(x, y, z, v);
  if (typeof playBlockSound === 'function') playBlockSound(B.COCOA, 'break', x, y, z);
  if (player.canFly) return;
  for (const d of blockDrop(v)) spawnDrop(d.id, x, y, z, null, undefined, null, null, 0, d.count);
}
function updateCocoa(dt) {
  const sp = typeof sweepOriginPlayer === 'function' ? sweepOriginPlayer() : null;
  if (!sp) return;
  if ((_cocoaLookT += dt) >= COCOA_LOOK_S) {
    _cocoaLookT = 0;
    const px = Math.floor(sp.pos.x), py = Math.floor(sp.pos.y), pz = Math.floor(sp.pos.z);
    for (let n = 0; n < COCOA_LOOK_COLS; n++)
      _cocoaLookColumn(px + ((Math.random() * COCOA_LOOK_R * 2) | 0) - COCOA_LOOK_R, pz + ((Math.random() * COCOA_LOOK_R * 2) | 0) - COCOA_LOOK_R, py + 40, py - 24);
  }
  if ((_cocoaT += dt) < 1) return;
  const secs = _cocoaT * (typeof tickFactor === 'function' ? tickFactor() : 1);
  _cocoaT = 0;
  const grow = seasonGrowth(), step = secs * grow;                // winter: nothing grows or buds
  const sproutP = grow > 0 ? 1 - Math.pow(1 - COCOA_SPROUT, secs) : 0;
  const overP = 1 - Math.exp(-secs / (COCOA_OVERRIPE_DAYS * _dayLen()));
  for (const [k, f] of [...COCOA_SPOTS]) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) {
      // far behind player one: forgotten (found again when they come back)
      if (Math.abs(x - sp.pos.x) > 256 || Math.abs(z - sp.pos.z) > 256) { COCOA_SPOTS.delete(k); COCOA_GROW.delete(k); }
      continue;
    }
    const v = getBlock(x, y, z), id = v & 255, d = COCOA_TO_TRUNK[f];
    if (id === B.COCOA) {
      if (!_cocoaHeld(x, y, z, v)) { _cocoaBreak(x, y, z, v); continue; }
      if (cocoaRipe(v)) {
        COCOA_GROW.delete(k);
        if (Math.random() < overP) _cocoaBreak(x, y, z, v);        // left too long: it breaks off
        continue;
      }
      const left = (COCOA_GROW.get(k) ?? _cocoaLife()) - step;
      if (left > 0) { COCOA_GROW.set(k, left); continue; }
      setBlock(x, y, z, _cocoaVal(_cocoaFace(v), _cocoaStage(v) + 1));
      COCOA_GROW.set(k, _cocoaLife());
    } else if (id === B.AIR) {
      COCOA_GROW.delete(k);
      if (!_cocoaTrunkLog(getBlock(x + d[0], y, z + d[1]))) { COCOA_SPOTS.delete(k); continue; }
      if (Math.random() >= sproutP) continue;
      const run = _cocoaTrunk(x + d[0], y, z + d[1]);             // still a straight trunk, and room on it
      if (!run || y > run[1] - COCOA_TOP_GAP || y < run[0] + COCOA_MIN_UP - 1
          || _cocoaOnTrunk(x + d[0], z + d[1], run[0], run[1]) >= COCOA_PER_TRUNK) continue;
      setBlock(x, y, z, _cocoaVal(f, 0));
      COCOA_GROW.set(k, _cocoaLife());
    } else { COCOA_SPOTS.delete(k); COCOA_GROW.delete(k); }      // something else took the spot
  }
}
// the jungle wood at (x, y, z) has gone (from setBlock, chunks/block-access.js): a pod hanging on it breaks off
function cocoaLostHold(x, y, z) {
  for (let f = 0; f < 4; f++) {
    const d = COCOA_TO_TRUNK[f], px = x - d[0], pz = z - d[1], v = getBlock(px, y, pz);
    if ((v & 255) === B.COCOA && _cocoaFace(v) === f) _cocoaBreak(px, y, pz, v);
  }
}
// the pods hanging on the logs at [x, y, z] (each pod facing its log): fn(px, py, pz, v)
function _cocoaOnLogs(logs, fn) {
  for (const l of logs) {
    const lx = l.x ?? l[0], ly = l.y ?? l[1], lz = l.z ?? l[2];
    if (!_isJungleWood(getBlock(lx, ly, lz))) continue;
    for (let f = 0; f < 4; f++) {
      const d = COCOA_TO_TRUNK[f], px = lx - d[0], pz = lz - d[1], v = getBlock(px, ly, pz);
      if ((v & 255) === B.COCOA && _cocoaFace(v) === f) fn(px, ly, pz, v);
    }
  }
}
// Timber Shaker (skillShakeTree, player/skills.js): the tree's logs shaken, each RIPE pod on them may come off for its beans
function cocoaShake(logs) {
  _cocoaOnLogs(logs, (px, py, pz, v) => { if (cocoaRipe(v) && Math.random() < COCOA_SHAKE) _cocoaBreak(px, py, pz, v); });
}
// a tree felled (fellTreeFrom, woods/felling.js, before its logs go): every pod on it comes off, a ripe one with its beans
function cocoaOffFelled(logs) {
  _cocoaOnLogs(logs, (px, py, pz, v) => _cocoaBreak(px, py, pz, v));
}
// a pod in a chunk coming in (finishChunkGen, chunks/stream.js): known from now on, to grow, and to break with no trunk
function cocoaSeen(x, y, z, v) {
  const k = _cocoaKey(x, y, z);
  COCOA_SPOTS.set(k, _cocoaFace(v));
  if (!COCOA_GROW.has(k) && !cocoaRipe(v)) COCOA_GROW.set(k, _cocoaLife());
}
// the line under the crosshair over a pod in survival: how far it has grown (ui/hud.js)
function cocoaPrompt() {
  if (player.canFly) return '';
  const hit = typeof currentRay === 'function' ? currentRay() : null;
  if (!hit || hit.id !== B.COCOA) return '';
  const v = getBlock(hit.x, hit.y, hit.z);
  if (cocoaRipe(v)) return 'Cocoa pod, ripe: break it for cocoa beans';
  return `Green cocoa pod, ${Math.round(_cocoaStage(v) / COCOA_BITS.RIPE * 100)}% grown: it gives nothing yet`;
}
