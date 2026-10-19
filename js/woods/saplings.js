'use strict';
/* woods/saplings.js: saplings growing into trees. The clock, and the trees built by the page: _growRound (oak,
   birch), _growCone (spruce), _growPalm. They are the page's own copies of the generator's shapes
   (woods/gen-tree-loop.js and woods/gen-palms.js; change both). Which wood grows which is its `grow` in the woods
   table (woods/woods.js). */

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
// the small round tree: a short trunk under a blob of leaves. `wood`: whose log and leaves it is built of
function _growRound(x, y, z, wood) {
  const LOG = wood.log, LEAF = wood.leaves;
  const h = 4 + Math.floor(Math.random() * 3);         // 4..6
  setBlock(x, y, z, LOG);                              // trunk starts at sapling cell (overwrites it)
  for (let k = 1; k < h; k++) _putSoft(x, y + k, z, LOG);
  // canopy: 3x3x3 blob centered near top, with rounded corners
  const top = y + h;
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dz === 0 && dy < 1) continue;   // don't overwrite trunk mid-canopy
        const r = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
        if (r > 3) continue;
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;   // clip corners
        _putSoft(x + dx, top + dy, z + dz, LEAF);
      }
  _putSoft(x, top + 2, z, LEAF);
}
function updateSaplings() {
  if (SAPLINGS.size === 0) return;
  const stale = [];
  for (const [k, r] of SAPLINGS) {
    const p = k.split(','), x = +p[0], y = +p[1], z = +p[2];
    const cur = getBlock(x, y, z) & 255;
    if (cur !== r.type) { stale.push(k); continue; }               // broken / replaced
    const now = worldClockDays();
    r.grown += Math.max(0, now - r.last) * seasonGrowth();
    r.last = now;
    if (r.grown >= r.need) {
      stale.push(k);
      _growTree(x, y, z, r.type);
      if (r.owner) grantXP(r.owner, XP_SAPLING[r.type] || 0, 'a sapling grew');   // each wood's `xp.sapling` (the woods table)
    }
  }
  for (const k of stale) SAPLINGS.delete(k);
}
