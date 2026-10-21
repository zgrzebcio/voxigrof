'use strict';
/* woods/saplings.js: saplings growing into trees. The clock, and the trees built by the page. The palm (_growPalm), the
   acacia (_growAcacia), the spruce's usual cone (_growCone) and the rime spire (_growRimeSpire) are the page's own copies of
   the generator's shapes (woods/gen-*.js; change both). The oak (_growOak), the birch (_growBirch) and the spruce's four
   other kinds (_growSpruce) grow from saplings only: the world's own trees stay as the generator makes them. Which wood
   grows which is its `grow` in the woods table (woods/woods.js). */

/* ---- saplings: grow into full trees after 7-14 in-game days ----
   Placed saplings register in SAPLINGS with a target worldDay. Each frame we compare current
   worldDay against the target; when reached, replace the sapling with a small tree. Growth is
   transient (Map lives in memory only) — saplings placed before a world reload keep sitting as
   saplings forever. Acceptable for a first pass. */
const SAPLINGS = new Map();     // "x,y,z" -> { type, need (days of growing), grown, last (world clock) }
/* Since 0.81 a sapling counts days of GROWING rather than waiting for a date: the season speeds it up
   (spring 1.3x), slows it (autumn 0.7x) or stops it (winter), seasonGrowth() in seasons/calendar.js. */
function armSapling(x, y, z, type) {
  // ...and who planted it, paid when it grows (armSapling runs in the planter's own tick)
  SAPLINGS.set(x + ',' + y + ',' + z, { type, need: 7 + Math.floor(Math.random() * 8), grown: 0, last: worldClockDays(),
                                       owner: typeof player !== 'undefined' ? player : null });
}
function _putSoft(x, y, z, id) {
  if (y < 0 || y > WORLD_TOP) return;
  const cur = getBlock(x, y, z) & 255;
  if (_isLeaf(cur) || cur === B.AIR) setBlock(x, y, z, id);
}
/* A palm from its sapling: the slim leaning trunk and the crown of four fronds on hidden ribs the world generator
   builds (palmTree/palmCrown in chunks/voxel-core.js), a little shorter */
function _growPalm(x, y, z) {
  const th = 6 + Math.floor(Math.random() * 4), a = Math.random() * Math.PI * 2, lean = 0.6 + Math.random() * 1.4;
  const ca = Math.cos(a), sa = Math.sin(a), W0 = 20, W1 = 14, RIB_W = 4;
  let px = 0, pz = 0;
  for (let k = 0; k < th; k++) {
    const t = k / Math.max(1, th - 1), c = t * t * lean;
    const nx = Math.round(ca * c), nz = Math.round(sa * c), val = B.PALM_LOG | ((Math.round(W0 - (W0 - W1) * t) << 2) << 8);
    if (k > 0 && (nx !== px || nz !== pz)) {
      _putSoft(x + nx, y + k - 1, z + nz, val);
      if (nx !== px && nz !== pz) _putSoft(x + nx, y + k - 1, z + pz, val);
    }
    if (k === 0) setBlock(x, y, z, val); else _putSoft(x + nx, y + k, z + nz, val);
    px = nx; pz = nz;
  }
  const cx = x + px, cy = y + th - 1, cz = z + pz;
  _putSoft(cx, cy + 1, cz, B.PALM_LEAVES);
  for (const [dx, dz, ex, ez] of [[1, 0, 1, 1], [-1, 0, -1, 1], [0, 1, -1, -1], [0, -1, 1, -1]]) {
    const axis = dx ? 1 : 2;
    for (let s = 1; s <= 2; s++) { _putSoft(cx + dx * s, cy, cz + dz * s, B.PALM_LOG | ((axis | (RIB_W << 2)) << 8)); _putSoft(cx + dx * s, cy + 1, cz + dz * s, B.PALM_LEAVES); }
    const L = 3 + Math.floor(Math.random() * 3);
    for (const [u, v] of [[3, 0], [4, 0], [4, -1], [5, -1], [5, -2]].slice(0, L)) _putSoft(cx + dx * u, cy + v, cz + dz * u, B.PALM_LEAVES);
    if (Math.random() < 0.6) {
      _putSoft(cx + ex, cy + 1, cz + ez, B.PALM_LEAVES); _putSoft(cx + ex * 2, cy, cz + ez, B.PALM_LEAVES); _putSoft(cx + ex * 2, cy, cz + ez * 2, B.PALM_LEAVES);
    }
  }
}
/* An acacia from its sapling: the generator's tree (acaciaTree, woods/gen-acacia.js), a short trunk forking into one or
   two slanted limbs, each under a flat crown */
function _growAcacia(x, y, z) {
  const LOG = (w) => B.ACACIA_LOG | ((w << 2) << 8), TRUNK_W = 22, LIMB_W = 17;
  const th = 3 + Math.floor(Math.random() * 3);
  setBlock(x, y, z, LOG(TRUNK_W));                         // the trunk starts at the sapling's cell
  for (let k = 1; k < th; k++) _putSoft(x, y + k, z, LOG(TRUNK_W));
  const top = y + th - 1, limbs = Math.random() < 0.4 ? 1 : 2, a0 = Math.random() * Math.PI * 2;
  for (let l = 0; l < limbs; l++) {
    const a = a0 + l * (Math.PI + (Math.random() - 0.5) * 1.2), ca = Math.cos(a), sa = Math.sin(a);
    const len = 2 + Math.floor(Math.random() * 3);
    let px = 0, pz = 0, ly = top;
    for (let s = 1; s <= len; s++) {
      const nx = Math.round(ca * s * 1.1), nz = Math.round(sa * s * 1.1);
      _putSoft(x + nx, ly, z + nz, LOG(LIMB_W));
      if (nx !== px && nz !== pz) _putSoft(x + nx, ly, z + pz, LOG(LIMB_W));
      ly++;
      _putSoft(x + nx, ly, z + nz, LOG(LIMB_W));
      px = nx; pz = nz;
    }
    const ex = x + px, ez = z + pz;
    for (let oz = -3; oz <= 3; oz++)
      for (let ox = -3; ox <= 3; ox++) {
        const d2 = ox * ox + oz * oz;
        if (d2 > 10 || (d2 >= 8 && Math.random() < 0.45)) continue;
        _putSoft(ex + ox, ly + 1, ez + oz, B.ACACIA_LEAVES);
      }
    for (let oz = -2; oz <= 2; oz++)
      for (let ox = -2; ox <= 2; ox++) {
        const d2 = ox * ox + oz * oz;
        if (d2 > 4 || (d2 >= 4 && Math.random() < 0.5)) continue;
        _putSoft(ex + ox, ly + 2, ez + oz, B.ACACIA_LEAVES);
      }
  }
}
/* The tree a sapling grows into is its wood's `grow` in the woods table (woods/woods.js): the round tree below for
   oak and birch, the cone for spruce, the palm above. `species` is the sapling's block id. */
function _growTree(x, y, z, species) {
  (woodOf(species) || WOODS.oak).grow(x, y, z);
}
// a cone like the generated spruces, not the round oak blob: tapering spike, heavy skirt low, always tipped.
// `wood`: whose log and leaves it is built of (its entry in the woods table)
function _growCone(x, y, z, wood) {
  const LOG = wood.log, LEAF = wood.leaves;
  const sh = 13 + Math.floor(Math.random() * 7);     // 13..19
  const SPR_STUMP = 30, SPR_TIP = 14;
  for (let k = 0; k < sh; k++) {
    const t = k / Math.max(1, sh - 1);
    const w = Math.round(SPR_STUMP - (SPR_STUMP - SPR_TIP) * t);
    const val = LOG | ((w << 2) << 8);
    if (k === 0) setBlock(x, y, z, val); else _putSoft(x, y + k, z, val);
  }
  const base = y + 2, topY = y + sh - 1, span = Math.max(1, topY - base);
  for (let ly = base; ly <= topY; ly++) {
    const t = (ly - base) / span;
    let rad = Math.max(1, Math.round(4 - 3.2 * t));
    if (((ly - base) % 2) === 1) rad = Math.max(1, rad - 1);
    const rimKeep = 0.85 - 0.5 * t;
    for (let oz = -rad; oz <= rad; oz++)
      for (let ox = -rad; ox <= rad; ox++) {
        const d = Math.abs(ox) + Math.abs(oz);
        if (d > rad || (d === rad && Math.random() > rimKeep)) continue;
        _putSoft(x + ox, ly, z + oz, LEAF);
      }
  }
  for (let t = 1; t <= 2; t++) _putSoft(x, topY + t, z, LEAF);
}
/* ---- the newer trees, grown from saplings only (the world's own trees are woods/gen-*.js and stay as they are) ----
   Their limbs are walked a cell at a time, a run along X or Z lying that way and a rise standing upright, so every turn is
   an elbow the log mesher joins (chunks/mesher-logs.js). Every leaf stays within the leaves' reach of wood
   (isLeavesConnected, woods/leaf-decay.js: five leaves). */
const _treeRand = (a, b) => a + Math.random() * (b - a);
const _treeIrand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// one of a wood's logs, `w` its width index, along `axis` (0 up, 1 X, 2 Z)
const _treeLog = (wood, w, axis = 0) => wood.log | ((axis | (Math.round(w) << 2)) << 8);
// a trunk from the sapling's cell up `th` cells, its width w(t) from the foot (t 0) to the top (t 1)
function _treeTrunk(x, y, z, wood, th, w) {
  for (let k = 0; k < th; k++) {
    const v = _treeLog(wood, w(k / Math.max(1, th - 1)));
    if (k === 0) setBlock(x, y, z, v); else _putSoft(x, y + k, z, v);
  }
}
/* A limb out of (x0, y0, z0) along the heading (dx, dz), climbing `rise` a step, `len` steps, its width w0 to w1. Each step
   moves a cell at most on each axis, a log for each move. Returns the cell it ends in. */
function _treeLimb(wood, x0, y0, z0, dx, dz, rise, len, w0, w1) {
  let fx = 0, fz = 0, fy = 0, px = x0, py = y0, pz = z0;
  for (let s = 1; s <= len; s++) {
    fx += dx; fz += dz; fy += rise;
    const w = w0 + (w1 - w0) * (s / len);
    const nx = x0 + Math.round(fx), nz = z0 + Math.round(fz), ny = y0 + Math.round(fy);
    if (nx !== px) { px = nx; _putSoft(px, py, pz, _treeLog(wood, w, 1)); }
    if (nz !== pz) { pz = nz; _putSoft(px, py, pz, _treeLog(wood, w, 2)); }
    if (ny !== py) { py = ny; _putSoft(px, py, pz, _treeLog(wood, w, 0)); }
  }
  return [px, py, pz];
}
// the leaves the tree being grown has put down, for _treePrune
const _treeLeaves = [];
function _treeLeaf(x, y, z, leaf) {
  _putSoft(x, y, z, leaf);
  if ((getBlock(x, y, z) & 255) === leaf) _treeLeaves.push(x, y, z);
}
/* The tree grown: any of its leaves that cannot reach wood (isLeavesConnected, woods/leaf-decay.js) goes at once, rather than
   rotting away over the next minutes. Every tree below ends with it. */
function _treePrune() {
  for (let i = 0; i < _treeLeaves.length; i += 3) {
    const x = _treeLeaves[i], y = _treeLeaves[i + 1], z = _treeLeaves[i + 2];
    if (_isLeaf(getBlock(x, y, z) & 255) && !isLeavesConnected(x, y, z)) setBlock(x, y, z, B.AIR);
  }
  _treeLeaves.length = 0;
}
/* a ragged ellipsoid of leaves round (cx, cy, cz), rx across and ry up and down, its outer shell thinned by `rim`; only cells
   within five steps of the wood it hangs on (a, a cell [x, y, z]) */
function _treeLeafBlob(cx, cy, cz, rx, ry, leaf, a, rim = 0.35) {
  const ix = Math.ceil(rx), iy = Math.ceil(ry);
  for (let oy = -iy; oy <= iy; oy++)
    for (let oz = -ix; oz <= ix; oz++)
      for (let ox = -ix; ox <= ix; ox++) {
        const d = Math.sqrt((ox * ox + oz * oz) / (rx * rx) + (oy * oy) / (ry * ry));
        if (d > 1 || (d > 0.72 && Math.random() < rim)) continue;
        const x = cx + ox, y = cy + oy, z = cz + oz;
        if (Math.abs(x - a[0]) + Math.abs(y - a[1]) + Math.abs(z - a[2]) > 5) continue;
        _treeLeaf(x, y, z, leaf);
      }
}
// a skirt of needles on one layer round the trunk: a diamond of radius `rad` (5 at most), its rim kept at `keep` (and hung one lower at `droop`)
function _treeSkirt(cx, ly, cz, rad, keep, leaf, droop = 0) {
  rad = Math.min(5, rad);
  for (let oz = -rad; oz <= rad; oz++)
    for (let ox = -rad; ox <= rad; ox++) {
      const d = Math.abs(ox) + Math.abs(oz);
      if (d > rad || (d === rad && Math.random() > keep)) continue;
      _treeLeaf(cx + ox, ly, cz + oz, leaf);
      if (d === rad && d <= 4 && droop && Math.random() < droop) _treeLeaf(cx + ox, ly - 1, cz + oz, leaf);
    }
}
/* The OAK: a stout trunk that forks near its top into two to four limbs reaching up and out, each under its own ragged cluster
   of leaves, one more cluster over the fork between them, and a low bough or two with a tuft: a wide, uneven crown with light
   between its clusters. */
function _growOak(x, y, z, wood = WOODS.oak) {
  const th = _treeIrand(4, 6), LEAF = wood.leaves;
  _treeTrunk(x, y, z, wood, th, (t) => 28 - 4 * t);
  const top = y + th - 1, limbs = _treeIrand(2, 4), a0 = Math.random() * Math.PI * 2;
  for (let l = 0; l < limbs; l++) {
    const a = a0 + l * (Math.PI * 2 / limbs) + _treeRand(-0.5, 0.5);
    const end = _treeLimb(wood, x, top - (l % 2), z, Math.cos(a), Math.sin(a), _treeRand(0.5, 0.9), _treeIrand(2, 4), 19, 14);
    _treeLeafBlob(end[0], end[1] + 1, end[2], _treeRand(2.2, 3), _treeRand(1.6, 2.1), LEAF, end);
  }
  _treeLeafBlob(x, top + 2, z, _treeRand(2.2, 2.8), 1.8, LEAF, [x, top, z]);
  for (let b = _treeIrand(0, 2); b > 0; b--) {
    const a = Math.random() * Math.PI * 2;
    const end = _treeLimb(wood, x, y + _treeIrand(2, Math.max(2, th - 2)), z, Math.cos(a), Math.sin(a), 0.3, _treeIrand(1, 2), 15, 12);
    _treeLeafBlob(end[0], end[1] + 1, end[2], 1.4, 1, LEAF, end, 0.25);
  }
  _treePrune();
}
/* The BIRCH: a tall slender trunk, bare for about its lower half, two to four short twigs up it each with a tuft, and a narrow
   upright oval crown high up, loose and gappy so light comes through, standing a little over the trunk's top. */
function _growBirch(x, y, z, wood = WOODS.birch) {
  const th = _treeIrand(8, 12), LEAF = wood.leaves;
  _treeTrunk(x, y, z, wood, th, (t) => 20 - 6 * t);
  const top = y + th - 1, c0 = top - _treeIrand(4, 5);
  for (let n = _treeIrand(2, 4); n > 0; n--) {
    const a = Math.random() * Math.PI * 2;
    const end = _treeLimb(wood, x, _treeIrand(Math.max(y + 3, c0 - 2), top - 1), z, Math.cos(a), Math.sin(a), 0.8, _treeIrand(1, 2), 12, 10);
    _treeLeafBlob(end[0], end[1], end[2], 1.3, 1.2, LEAF, end, 0.3);
  }
  for (let ly = c0; ly <= top + 2; ly++) {
    const t = (ly - c0) / Math.max(1, top + 2 - c0);
    const r = 1.2 + 1.3 * Math.sin(Math.PI * Math.min(1, t * 1.15)), ri = Math.ceil(r);   // widest a third of the way up
    for (let oz = -ri; oz <= ri; oz++)
      for (let ox = -ri; ox <= ri; ox++) {
        const d = Math.hypot(ox, oz);
        if (d > r || (d > r - 0.8 && Math.random() < 0.4) || Math.random() < 0.08) continue;   // a ragged rim, and gaps
        _treeLeaf(x + ox, ly, z + oz, LEAF);
      }
  }
  _treePrune();
}
/* The SPRUCE, one of five at random: the usual cone (_growCone above), a very tall old one, a narrow pole, a twin top and a
   wide old one with its skirts sweeping to the ground. */
function _growSpruce(x, y, z, wood = WOODS.spruce) {
  const r = Math.random();
  if (r < 0.3) return _growCone(x, y, z, wood);
  if (r < 0.48) return _spruceTall(x, y, z, wood);
  if (r < 0.66) return _sprucePole(x, y, z, wood);
  if (r < 0.83) return _spruceTwin(x, y, z, wood);
  return _spruceWide(x, y, z, wood);
}
// very tall (26-34): a long bare stem, a narrow cone high up
function _spruceTall(x, y, z, wood) {
  const sh = _treeIrand(26, 34), LEAF = wood.leaves;
  _treeTrunk(x, y, z, wood, sh, (t) => 32 - 18 * t);
  const base = y + Math.round(sh * 0.4), top = y + sh - 1, span = Math.max(1, top - base);
  for (let ly = base; ly <= top; ly++) {
    const t = (ly - base) / span;
    let rad = Math.max(1, Math.round(3.2 - 2.3 * t));
    if (((ly - base) % 2) === 1) rad = Math.max(1, rad - 1);
    _treeSkirt(x, ly, z, rad, 0.85 - 0.5 * t, LEAF);
  }
  for (let k = 1; k <= 2; k++) _treeLeaf(x, top + k, z, LEAF);
  _treePrune();
}
// a narrow pole (14-20): thin and pointed, tight short skirts all the way down
function _sprucePole(x, y, z, wood) {
  const sh = _treeIrand(14, 20), LEAF = wood.leaves;
  _treeTrunk(x, y, z, wood, sh, (t) => 24 - 12 * t);
  const base = y + 2, top = y + sh - 1, span = Math.max(1, top - base);
  for (let ly = base; ly <= top; ly++) {
    const t = (ly - base) / span;
    _treeSkirt(x, ly, z, ((ly - base) % 2) === 1 || t > 0.6 ? 1 : 2, 0.9 - 0.3 * t, LEAF);
  }
  for (let k = 1; k <= 2; k++) _treeLeaf(x, top + k, z, LEAF);
  _treePrune();
}
// a twin top (16-22): the cone forks two thirds of the way up into two spires, a block either side of the trunk
function _spruceTwin(x, y, z, wood) {
  const sh = _treeIrand(16, 22), LEAF = wood.leaves, fork = y + Math.round(sh * 0.65), top = y + sh - 1;
  _treeTrunk(x, y, z, wood, fork - y + 1, (t) => 30 - 10 * t);
  const base = y + 2, span = Math.max(1, fork - base);
  for (let ly = base; ly <= fork; ly++) {
    const t = (ly - base) / span;
    let rad = Math.max(2, Math.round(4 - 2 * t));
    if (((ly - base) % 2) === 1) rad = Math.max(1, rad - 1);
    _treeSkirt(x, ly, z, rad, 0.85 - 0.3 * t, LEAF);
  }
  const alongX = Math.random() < 0.5, axis = alongX ? 1 : 2;
  for (const s of [1, -1]) {
    const sx = x + (alongX ? s : 0), sz = z + (alongX ? 0 : s);
    _putSoft(sx, fork, sz, _treeLog(wood, 18, axis));                // out of the fork...
    const n = top - fork;
    for (let k = 1; k <= n; k++) {                                 // ...and up
      const t = k / Math.max(1, n);
      _putSoft(sx, fork + k, sz, _treeLog(wood, 18 - 6 * t));
      _treeSkirt(sx, fork + k, sz, (k % 2) === 1 && t < 0.7 ? 2 : 1, 0.8 - 0.3 * t, LEAF);
    }
    for (let k = 1; k <= 2; k++) _treeLeaf(sx, top + k, sz, LEAF);
  }
  _treePrune();
}
// a wide old one (16-22): a broad stump, heavy skirts from just over the ground, their rims hanging
function _spruceWide(x, y, z, wood) {
  const sh = _treeIrand(16, 22), LEAF = wood.leaves;
  _treeTrunk(x, y, z, wood, sh, (t) => 36 - 20 * t);
  const base = y + 1, top = y + sh - 1, span = Math.max(1, top - base);
  for (let ly = base; ly <= top; ly++) {
    const t = (ly - base) / span;
    let rad = Math.max(1, Math.round(4.6 - 3.6 * t));               // 5 at its foot: the leaves' reach
    if (((ly - base) % 2) === 1) rad = Math.max(1, rad - 1);
    _treeSkirt(x, ly, z, rad, 0.9 - 0.4 * t, LEAF, t < 0.6 ? 0.5 : 0);
  }
  for (let k = 1; k <= 2; k++) _treeLeaf(x, top + k, z, LEAF);
  _treePrune();
}
/* The RIME tree from its sapling: the generator's SPIRE (woods/gen-rime-trees.js: change both), tall and slender, tight tiers
   of rime whose rims droop under the frost */
function _growRimeSpire(x, y, z) {
  const sh = _treeIrand(13, 21), base = y + 2, top = y + sh - 1;
  _treeTrunk(x, y, z, WOODS.rime, sh, (t) => 26 - 12 * t);
  for (let ly = base; ly <= top; ly++) {
    const t = (ly - base) / Math.max(1, top - base), tier = (ly - base) % 3;
    const rad = Math.max(1, Math.round(2.6 - 1.8 * t)) - (tier === 2 ? 1 : 0);
    if (rad >= 1) _treeSkirt(x, ly, z, rad, 0.8, B.RIME_LEAVES, tier === 0 ? 0.6 : 0);
  }
  for (let k = 1; k <= 2; k++) _treeLeaf(x, top + k, z, B.RIME_LEAVES);
  _treePrune();
}
/* Creative: a bone ash block used on a sapling (player/place-block.js) gives it BONE_ASH_DAYS of growing at once, to watch a tree
   come up without waiting: two to four of them and it grows on the spot. A sapling not on the clock (one the world grew, or one
   from before a reload) is put on it first. Survival has no fertiliser yet: bone ash is for the farming update. */
const BONE_ASH_DAYS = 4;
function feedSapling(x, y, z) {
  const id = getBlock(x, y, z) & 255;
  if (!isSapling(id)) return false;
  const k = x + ',' + y + ',' + z;
  if (!SAPLINGS.has(k)) armSapling(x, y, z, id);
  const r = SAPLINGS.get(k);
  r.grown += BONE_ASH_DAYS;
  if (typeof fxPuff === 'function') fxPuff(x + 0.5, y + 0.4, z + 0.5, [0.95, 0.93, 0.85], 8, 0.8);
  if (r.grown >= r.need) { SAPLINGS.delete(k); _growTree(x, y, z, id); toast('The sapling grows into a tree'); }
  else toast(`Sapling: ${Math.floor(r.grown)} of ${r.need} days grown`);
  return true;
}
function updateSaplings() {
  if (SAPLINGS.size === 0) return;
  const stale = [];
  for (const [k, r] of SAPLINGS) {
    const p = k.split(','), x = +p[0], y = +p[1], z = +p[2];
    const cur = getBlock(x, y, z) & 255;
    if (cur !== r.type) { stale.push(k); continue; }               // broken / replaced
    const now = worldClockDays();
    // a hardy wood (rime) grows in winter too, at its full pace
    r.grown += Math.max(0, now - r.last) * (woodOf(r.type)?.hardy ? 1 : seasonGrowth());
    r.last = now;
    if (r.grown >= r.need) {
      stale.push(k);
      _growTree(x, y, z, r.type);
      if (r.owner) grantXP(r.owner, XP_SAPLING[r.type] || 0, 'a sapling grew');   // each wood's `xp.sapling` (the woods table)
    }
  }
  for (const k of stale) SAPLINGS.delete(k);
}
