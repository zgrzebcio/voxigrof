'use strict';
/* voxiGrof — worker pool: gen + mesh job dispatch */

/* ================================================================================================
   WORKER POOL — gen + mesh jobs, distance-prioritised, transferable buffers both ways.
   ================================================================================================ */
// the biomes core goes first: VOXEL_CORE's makeGen calls into it (biomes/biomes.js); and the blocks, which VOXEL_CORE
// takes all its block registry from (blocks/blocks.js)
const workerSrc = `'use strict';\nconst BIOMES = (${BIOME_CORE.toString()})();\nconst BLOCKS = (${BLOCK_CORE.toString()})();\nconst CORE = (${VOXEL_CORE.toString()})();\n(${WORKER_MAIN.toString()})();`;
const workerURL = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
const WORKER_COUNT = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 2));

let SEED = (new URLSearchParams(location.search).get('seed') || '').replace(/[^a-z0-9]/gi, '')
        || Math.random().toString(36).slice(2, 10).toUpperCase();
let TERRAIN_TYPE = 'default';               // 'default' | 'flat' — chosen per world at creation
let TERRAIN_BIOMES = 1;                     // biome sizes: 1 before 0.819, 2 bigger snow and desert (makeGen)
let mainGen = CORE.makeGen(SEED, TERRAIN_TYPE);   // main-thread twin of the worker generator (HUD biome label)

const workers = [];
for (let i = 0; i < WORKER_COUNT; i++) {
  const w = new Worker(workerURL);
  w.busy = 0;                               // jobs it holds
  w.genOut = 0;                             // ...and how many of them are chunks to make, the long ones (the edit lane, chunks/stream.js)
  w.onmessage = (e) => { w.busy--; if (e.data.type === 'gen' && w.genOut > 0) w.genOut--; onWorkerMessage(e.data); pump(); };
  workers.push(w);
}
// a side job (a chunk's season scan) to the least busy worker, counted like a gen or mesh job
function postScanJob(msg, transfer) {
  let best = workers[0];
  for (const w of workers) if (w.busy < best.busy) best = w;
  best.busy++;
  best.postMessage(msg, transfer);
}
function initWorkers(seed, terrainType, biomeRev = 1) {
  // a world swap abandons whatever was in flight; the throttle's counter must not leak with it
  if (typeof resetGenThrottle === 'function') resetGenThrottle();
  // the sky light's rules, so a worker can light a new chunk the same way (LIGHT_WORKER in 00-config)
  const light = LIGHT_WORKER ? { top: WORLD_TOP, sky: SKY_LEVEL, water: WATER_ABSORB } : null;
  // how a mesh job's light packs (the workers pack it now, 02 packLight)
  const pack = { mask: LIGHT_LEVEL_MASK, cold: LIGHT_COLD_BIT, sky: SKY_LEVEL };
  for (const w of workers) w.postMessage({ type: 'init', seed, terrainType: terrainType || 'default', biomeRev, light, pack });
}
initWorkers(SEED, TERRAIN_TYPE);
lightThreadStart();                         // block light floods off the main thread, with shared memory (08)

/* Fast leaves: Options > Video "Leaves". The workers' mesher draws a whole leaf block
   solid (02 setFastLeaves): fewer faces, no see-through sorting, much less overdraw in a forest. Changing it remeshes
   every chunk. */
let fastLeaves = (() => { try { return localStorage.getItem('vg_leaves') === 'fast'; } catch { return false; } })();
function postWorkerOpts() { for (const w of workers) w.postMessage({ type: 'opts', fastLeaves }); }
postWorkerOpts();
function applyFastLeaves(on) {
  on = !!on;
  if (on === fastLeaves) return;
  fastLeaves = on;
  try { localStorage.setItem('vg_leaves', on ? 'fast' : 'fancy'); } catch {}
  postWorkerOpts();
  if (typeof remeshAllChunks === 'function') remeshAllChunks();
}

