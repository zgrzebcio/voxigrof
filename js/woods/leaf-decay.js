'use strict';
/* woods/leaf-decay.js: leaves with no log near them decay. */

/* ---- leaves natural decay ---- */
const leavesDecayQueue = new Set();
const DECAY_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

/* Which block ids are a tree's leaves and which are its wood, from the woods table (woods/woods.js), as two
   lookups by id (these are asked for every cell of a canopy). The dry bush's leaves are not in: they stand on the
   ground with no wood and never decay. Stripped logs count as wood: a half-chopped tree must not shed its canopy
   while you work. Hollow logs do not. */
const _LEAF_MASK = new Uint8Array(256), _LOG_MASK = new Uint8Array(256);
for (const id of woodBlocks('leaves', isTreeWood)) _LEAF_MASK[id] = 1;
for (const id of [...woodBlocks('log'), ...woodBlocks('stripped')]) _LOG_MASK[id] = 1;
const _isLeaf = (id) => _LEAF_MASK[id] === 1;
// a real leaf block, by value: leaf litter is the leaf block's own id with layers, and must never decay as canopy
const _isLeafVal = (v) => _isLeaf(v & 255) && !((v >> 8) & 255);
const _isLog  = (id) => _LOG_MASK[id] === 1;
function scheduleLeavesCheck(cx, cy, cz) {
  const R = 5;
  for (let dx = -R; dx <= R; dx++)
    for (let dy = -R; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++)
        if (_isLeafVal(getBlock(cx+dx, cy+dy, cz+dz)))
          leavesDecayQueue.add(`${cx+dx},${cy+dy},${cz+dz}`);
}

function isLeavesConnected(lx, ly, lz) {
  const visited = new Set();
  const queue = [[lx, ly, lz, 0]];
  visited.add(`${lx},${ly},${lz}`);
  while (queue.length) {
    const [x, y, z, dist] = queue.shift();
    for (const [dx, dy, dz] of DECAY_DIRS) {
      const nx = x+dx, ny = y+dy, nz = z+dz;
      const key = `${nx},${ny},${nz}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const bv = getBlock(nx, ny, nz), b = bv & 255;
      if (_isLog(b)) return true;
      if (_isLeafVal(bv) && dist < 4) queue.push([nx, ny, nz, dist + 1]);
    }
  }
  return false;
}

let leavesDecayTimer = 0;
const DECAY_INTERVAL = 0.2;      // was 0.5 — an orphaned canopy should clear while you watch
const DECAY_BATCH = 24;          // was 8
function processLeavesDecay(dt) {
  leavesDecayTimer += dt;
  if (leavesDecayTimer < DECAY_INTERVAL) return;
  leavesDecayTimer -= DECAY_INTERVAL;
  const toProcess = [];
  for (const k of leavesDecayQueue) {
    if (toProcess.length >= DECAY_BATCH) break;
    if (!_keyInSimRange(k)) continue;      // stays queued until the player is back in range
    toProcess.push(k);
  }
  for (const key of toProcess) {
    leavesDecayQueue.delete(key);
    const [x, y, z] = key.split(',').map(Number);
    const leafVal = getBlock(x, y, z), leafId = leafVal & 255;
    if (!_isLeafVal(leafVal)) continue;
    if (!isLeavesConnected(x, y, z)) {
      // base decay chance, then scaled by the world tick speed
      if (Math.random() < 0.3 * tickFactor()) {
        // decayed leaves fall the same way a felled canopy does, so they end up as litter on
        // the ground instead of evaporating in place
        setBlock(x, y, z, B.AIR);
        if (typeof fxLeafDecay === 'function') fxLeafDecay(x, y, z, leafId);   // a flutter of leaf bits (0.8)
        if (FALLING.length < MAX_FALLING) spawnFallingLeaf(leafId, x, y, z);
        else settleLeafNow(leafId, x, y, z);
        scheduleLeavesCheck(x, y, z);
      } else {
        leavesDecayQueue.add(key);
      }
    }
  }
}
