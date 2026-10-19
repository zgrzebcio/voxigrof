'use strict';
/* blocks/falling.js: blocks that fall. Sand, gravel and the like wake when what holds them goes, fall as moving
   blocks, land, pile into layers, and wake their neighbours. */

/* ---- gravity blocks (sand, gravel) ---- */
const fallingBlocks = new Map();   // "x,y,z" -> full block VALUE (id + variant)
// a cell a falling block drops into: empty, or a billboard it simply crushes on the way through
const _fallOpen = (id) => id === B.AIR || PROPS[id]?.model === 'cross';
// Carpets fall too — snow and leaf litter both need ground under them, and digging out that
// ground used to leave a sheet of snow hanging in the air. Since 0.785 that is any stack of layers you
// wade through (snow, leaves, sand, gravel, fiber); solid layers (stone, planks, ...) stay put. By VALUE.
/* Whole blocks that fall like sand but land as themselves, not as a pile of layers: the hay bale. By VALUE, so a
   shaped one (a hay slab or stairs) and its thatch look stay where they are put. */
const FALL_WHOLE_BLOCKS = new Set([B.HAY]);
const _fallsUnderGravity = (v) => {
  const id = v & 255;
  if (CORE.layerCount(v)) return !!PROPS[id]?.layerStack;
  return LOOSE_LAYER_BLOCKS.has(v) || FALL_WHOLE_BLOCKS.has(v) || PROPS[id]?.model === 'carpet';   // a whole sand, gravel or fiber block
};
function scheduleFall(x, y, z) {
  if (y < 1 || y > WORLD_TOP) return;
  const val = getBlock(x, y, z);
  if (!_fallsUnderGravity(val)) return;
  // billboards don't hold up a falling block — they get crushed, so they count as empty here
  // ...and a stack resting on a stack that takes it is queued too: processFalling pours it in
  const below = getBlock(x, y - 1, z);
  if (!_fallOpen(below & 255) && !(CORE.layerCount(val) && canStackLayer(below, val & 255))) return;
  fallingBlocks.set(`${x},${y},${z}`, val);        // keep the variant: carpets carry layer count
}
/* 0.8444. Gravity blocks only ever fell when something beside them was edited, so sand or gravel the world made over a
   cave hung there for good, and held you up. Two more things wake them now:
     - your feet: the loose blocks you stand on look under themselves every frame (_fallUnderFeet, from tickPlayer);
     - a neighbour going: the four cells beside a block that falls look too (_fallWakeBeside), so a hanging roof
       comes down along its whole length, a few blocks a tick, instead of one block out of the middle. */
function _fallWakeBeside(x, y, z) {
  scheduleFall(x + 1, y, z); scheduleFall(x - 1, y, z); scheduleFall(x, y, z + 1); scheduleFall(x, y, z - 1);
}
function _fallUnderFeet() {
  const p = player.pos, r = player.R, y = Math.floor(p.y - 0.01);
  const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) scheduleFall(x, y, z);
}
let _fallTimer = 0;
/* A single fall is TWO setBlocks, and clearing an opaque block re-floods sky light through the
   column — measured at ~4ms apiece for gravel. The old budget of 192 meant a tick could cost
   most of a second, so it is deliberately small now: a big collapse comes down over a couple of
   seconds instead of freezing the frame. */
const FALL_MAX_PER_TICK = 24;
const FALL_MAX_BEHIND = 8;                // ...while land is waiting near a player (streamBehind, chunks/stream.js): falls give way to it
/* ...and the queue is not allowed to clog. An entry that is out of simulation range is stepped
   over rather than acted on, but stepping over it still costs a scan, so the walk is bounded:
   past FALL_SCAN_LIMIT entries we stop looking this tick and pick up from the front next time.
   Entries that are simply stale (block already gone, or something solid slid in underneath) are
   DELETED on sight — leaving them is what let a few hundred dead keys sit at the head of the map
   and starve every live one behind them. */
const FALL_SCAN_LIMIT = 512;
/* BLOCKS IN THE AIR. A whole block (sand, gravel) used to step down one cell a tick, and every step was two
   setBlocks that each changed a column's opacity, so each re-flooded sky light (~4ms): a sand column collapsing
   cost hundreds of those and froze the game. Now it leaves its cell once, falls as a moving block, and lands once,
   and the lighting of a whole tick's worth of those edits is redone once per area (_litEdits). Past
   FALL_BLOCKS_MAX in the air, or away from every player, a block drops straight to where it would land. Layer
   stacks (snow, litter, loose piles) are see-through, cost no relight, and still step down cell by cell. */
const FALL_BLOCKS = [];                 // { group, val, x, z, y (its bottom), vy }
const FALL_BLOCKS_MAX = 64;
const FALL_G = 32, FALL_VMAX = 40;
/* Block edits with lighting held back, then relit once per 16x16 area they touched: one sky rebuild over the area
   (reskyAround's box form) and, where a light is near, one block-light rebuild. */
function _litEdits(cells, fn) {
  const prev = structBulkLight;
  structBulkLight = true;
  try { fn(); } finally { structBulkLight = prev; }
  if (prev || !cells.length) return;
  const areas = new Map();
  for (const [x, y, z] of cells) {
    const k = (x >> 4) + ',' + (z >> 4);
    let a = areas.get(k);
    if (!a) areas.set(k, a = { x0: x, x1: x, y0: y, y1: y, z0: z, z1: z, glow: false });
    a.x0 = Math.min(a.x0, x); a.x1 = Math.max(a.x1, x); a.y0 = Math.min(a.y0, y); a.y1 = Math.max(a.y1, y);
    a.z0 = Math.min(a.z0, z); a.z1 = Math.max(a.z1, z);
    if (!a.glow && glowNear(x, y, z)) a.glow = true;
  }
  for (const a of areas.values()) {
    reskyAround(a.x0, 0, a.z0, a.x1, a.z1);
    if (a.glow) relight(a.x0, a.y0, a.z0, a.x1, a.y1, a.z1);
  }
}
// where a block dropped from (x, y, z) comes to rest: the lowest open cell it can reach
function _landingY(x, y, z) {
  let c = y;
  while (c > 1 && _fallOpen(getBlock(x, c - 1, z) & 255)) c--;
  return c;
}
/* A whole sand, gravel or fiber block lands as a loose pile of 8 walk-through layers, pouring into a stack below
   that takes it; a falling stack pours the same way. */
function _settlePile(x, y, z, val) {
  const top = CORE.layerCount(val) ? layerIdsAt(x, y, z, val) : new Array(LAYER_MAX).fill(stackEntry(val));
  if (!top) return;
  const below = getBlock(x, y - 1, z);
  if (canStackLayer(below, top[0])) {
    const bottom = layerIdsAt(x, y - 1, z, below), room = LAYER_MAX - bottom.length;
    setLayerStack(x, y - 1, z, bottom.concat(top.slice(0, room)));
    setLayerStack(x, y, z, top.slice(room));
  } else if (!CORE.layerCount(val)) setLayerStack(x, y, z, top);   // a whole block settles into its pile
}
function _landBlocks(list) {
  _litEdits(list, () => {
    for (const [x, y0, z, val] of list) {
      let y = y0;
      for (let k = 0; k < 4 && y < WORLD_TOP && !_fallOpen(getBlock(x, y, z) & 255); k++) y++;   // something moved into the spot
      if (!_fallOpen(getBlock(x, y, z) & 255)) {                    // nowhere to go: it breaks
        if (!player.canFly) for (const d of blockDrop(val)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
        continue;
      }
      crushBillboard(x, y, z);
      setBlock(x, y, z, val);
      if (LOOSE_LAYER_BLOCKS.has(val)) _settlePile(x, y, z, val);
    }
  });
}
function _spawnFallBlock(x, y, z, val) {
  const passes = buildDropGeom(val & 255, val >>> 8);   // the variant byte and the look
  if (!passes.length) return false;
  const group = new THREE.Group();
  for (const { p, geo, mat, node } of passes) group.add(node || new THREE.Mesh(geo, mat || MATERIALS[p]));
  group.traverse(o => o.layers.set(1));          // drawn, but kept out of the shadow maps
  group.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(group);
  FALL_BLOCKS.push({ group, val, x, z, y, vy: 0 });
  return true;
}
function _updateFallBlocks(dt) {
  if (!FALL_BLOCKS.length) return;
  const landed = [];
  for (let i = FALL_BLOCKS.length - 1; i >= 0; i--) {
    const f = FALL_BLOCKS[i];
    if (!inSimRange(f.x, f.z)) continue;                             // frozen out of range, like the queue
    f.vy = Math.max(-FALL_VMAX, f.vy - FALL_G * dt);
    const ny = f.y + f.vy * dt;
    // the first whole cell it reaches this frame that has no room under it is where it stops
    let land = null;
    for (let c = Math.floor(f.y); c >= Math.ceil(ny); c--)
      if (c <= 1 || !_fallOpen(getBlock(f.x, c - 1, f.z) & 255)) { land = c; break; }
    if (land == null) { f.y = ny; f.group.position.y = ny + 0.5; continue; }
    landed.push([f.x, Math.max(1, land), f.z, f.val]);
    scene.remove(f.group);
    FALL_BLOCKS.splice(i, 1);
  }
  if (landed.length) _landBlocks(landed);
}
function clearFallBlocks() {
  for (const f of FALL_BLOCKS) scene.remove(f.group);
  FALL_BLOCKS.length = 0;
  fallingBlocks.clear();
}
function processFalling(dt) {
  _updateFallBlocks(dt);
  _fallTimer += dt;
  if (_fallTimer < 0.08) return;
  _fallTimer -= 0.08;
  const todo = [], starts = [], settle = [];
  const most = typeof streamBehind !== 'undefined' && streamBehind ? FALL_MAX_BEHIND : FALL_MAX_PER_TICK;
  let scanned = 0;
  for (const [k, val] of fallingBlocks) {         // deleting during iteration is safe on a Map
    if (todo.length + starts.length >= most || ++scanned > FALL_SCAN_LIMIT) break;
    const [x, y, z] = k.split(',').map(Number);
    if (!inSimRange(x, z)) continue;              // frozen out of range — keep it queued
    if (getBlock(x, y, z) !== val) { fallingBlocks.delete(k); continue; }        // stale
    const below = getBlock(x, y - 1, z);
    if (!_fallOpen(below & 255)) {                // landed
      fallingBlocks.delete(k);
      /* ...a falling stack pours down into a stack below that takes it, and a whole sand, gravel
         or fiber block lands as a loose pile of 8 walk-through layers, pouring in the same way */
      if (CORE.layerCount(val) ? canStackLayer(below, val & 255) : LOOSE_LAYER_BLOCKS.has(val)) settle.push([x, y, z, val]);
      continue;
    }
    fallingBlocks.delete(k);
    // a see-through stack steps down a cell; a whole block takes to the air
    if (CORE.layerCount(val) || !CORE.opaqueVal(val)) todo.push([x, y, z, val]);
    else starts.push([x, y, z, val]);
  }
  for (const [x, y, z, val] of todo) {
    // a mixed stack carries its list of blocks down with it
    const ids = CORE.layerMixed(val) ? layerIdsAt(x, y, z, val) : null;
    crushBillboard(x, y - 1, z);                 // torch/flower in the way is destroyed + dropped
    setBlock(x, y, z, B.AIR);
    if (ids) setLayerStack(x, y - 1, z, ids);
    else setBlock(x, y - 1, z, val);             // variant travels with it
    _fallWakeBeside(x, y, z);                    // 0.8444
  }
  if (starts.length) {
    const now = [];
    _litEdits(starts, () => {
      for (const [x, y, z, val] of starts) {
        setBlock(x, y, z, B.AIR);
        const seen = typeof _fxNear !== 'function' || _fxNear(x + 0.5, y + 0.5, z + 0.5);
        if (!(seen && FALL_BLOCKS.length < FALL_BLOCKS_MAX && _spawnFallBlock(x, y, z, val))) now.push([x, _landingY(x, y, z), z, val]);
        _fallWakeBeside(x, y, z);                // its neighbours may hang over the same hole
      }
    });
    if (now.length) _landBlocks(now);
  }
  if (settle.length) _litEdits(settle, () => { for (const [x, y, z, val] of settle) _settlePile(x, y, z, val); });
}
