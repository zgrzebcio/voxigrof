'use strict';
/* voxiGrof — worker pool: gen + mesh job dispatch */

/* ================================================================================================
   WORKER POOL — gen + mesh jobs, distance-prioritised, transferable buffers both ways.
   ================================================================================================ */
// the biomes core goes first: VOXEL_CORE's makeGen calls into it (biomes/biomes.js); and the blocks, which VOXEL_CORE
// takes all its block registry from (blocks/blocks.js)
const workerSrc = `'use strict';\nconst BIOMES = (${BIOME_CORE.toString()})();\nconst BLOCKS = (${BLOCK_CORE.toString()})();\nconst CORE = (${VOXEL_CORE.toString()})();\n(${WORKER_MAIN.toString()})();`;
const workerURL = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
/* the workers making and meshing chunks: all cores but two (the page, and the light and fluid threads), at most 4, and at
   most 8 on a machine of 12 cores or more, where 4 left most of it idle while land came in */
const WORKER_COUNT = (() => {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.min(cores >= 12 ? 8 : 4, Math.max(2, cores - 2));
})();

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
  w.cpuLabel = 'w' + (i + 1);               // its name on the processor meter (ui/cpu-meter.js)
  w.onmessage = (e) => {
    const t0 = _perfOn ? performance.now() : 0;
    w.busy--;
    const d = e.data, made = d.type === 'gen' || (d.type === 'error' && (d.job === 'gen' || d.job === 'prep'));   // a chunk to make, done or failed
    if (made && w.genOut > 0) w.genOut--;
    onWorkerMessage(d); pump();
    if (t0) { cpuNoteMsg(performance.now() - t0); cpuNoteWorker(w.cpuLabel, d.bz, d.bzk); }
  };
  workers.push(w);
}
/* BACKGROUND THREADS (Options > Video, saved as `vg_threads`): 'auto' (all WORKER_COUNT of them) or at most 4 or 2. The
   pool is made whole at the start and the setting only says how many of it are handed jobs (`poolWorkers`, read by the
   stream, chunks/stream.js): an idle worker costs nothing, so the setting takes effect at once, both ways. Fewer threads
   bring new land in slower with fewer cores busy, a cooler and quieter machine. The light and fluid threads are apart. */
const THREAD_CHOICES = ['auto', '4', '2'];
let threadsSetting = (() => { try { const v = localStorage.getItem('vg_threads'); return THREAD_CHOICES.includes(v) ? v : 'auto'; } catch { return 'auto'; } })();
const _poolOf = (v) => v === 'auto' ? workers : workers.slice(0, Math.min(workers.length, +v));
let poolWorkers = _poolOf(threadsSetting);
function applyThreads(v) {
  if (!THREAD_CHOICES.includes(v) || v === threadsSetting) return;
  threadsSetting = v;
  try { localStorage.setItem('vg_threads', v); } catch {}
  poolWorkers = _poolOf(v);
}
// a side job (a chunk's season scan) to the least busy worker, counted like a gen or mesh job
function postScanJob(msg, transfer) {
  let best = poolWorkers[0];
  for (const w of poolWorkers) if (w.busy < best.busy) best = w;
  best.busy++;
  msg.ep = workerEpoch;                     // the world it is for (the epoch, initWorkers below)
  best.postMessage(msg, transfer);
}
/* THE WORLD EPOCH: one more for every initWorkers. Every job to a worker (a chunk to make or read from the cache, a mesh, a
   season scan) carries the epoch it was sent in (`ep`) and the worker sends it back on the answer (chunks/worker.js);
   onWorkerMessage (chunks/stream.js) drops an answer from an older epoch. A job still queued or running when another
   world opened (or the title's backdrop was left) answered with the old land, which was put into the new world's chunk
   at the same place and stored in its terrain cache: a square column of another land standing in this one. */
let workerEpoch = 0;
/* THE WORLD THE WORKERS MAKE LAND FOR (`worldId`: a world's id, null for the title's backdrop). loadWorld sets the world it
   opens as currentWorld and then waits on the save before resetWorld comes here: in that gap the workers still made the
   backdrop's (or the last world's) land, and every chunk they answered was stored in the NEW world's terrain cache, a column
   of the backdrop standing near the spawn for good. The stream makes and stores land only while this is the world played
   (genForWorld, chunks/stream.js). */
let workerWorldId = null;
function initWorkers(seed, terrainType, biomeRev = 1, worldId = null) {
  workerEpoch++;
  workerWorldId = worldId;
  // a world swap abandons whatever was in flight; the throttle's counter must not leak with it
  if (typeof resetGenThrottle === 'function') resetGenThrottle();
  // the sky light's rules, so a worker can light a new chunk the same way (LIGHT_WORKER in 00-config)
  const light = LIGHT_WORKER ? { top: WORLD_TOP, sky: SKY_LEVEL, water: WATER_ABSORB } : null;
  // how a mesh job's light packs (the workers pack it now, 02 packLight)
  const pack = { mask: LIGHT_LEVEL_MASK, cold: LIGHT_COLD_BIT, sky: SKY_LEVEL };
  /* the column cache all of them share (worldgen/column-cache.js), new for every world: what terrainInfo gave a column,
     so the workers work each one out about once instead of once per chunk round it. Without shared memory each keeps its own */
  const cols = SHARED_OK ? new SharedArrayBuffer(16 << COLUMN_CACHE_BITS) : null;
  for (const w of workers) w.postMessage({ type: 'init', seed, terrainType: terrainType || 'default', biomeRev, light, pack, cols });
}
const COLUMN_CACHE_BITS = 18;               // 262,144 columns, 4 MB: the land of some thousand chunks
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

