'use strict';
/* chunks/stream.js: the stream of chunks. Queueing mesh jobs, pacing generation by the clock (pump), finishing a
   generated chunk (light, ice, creatures, structures), the workers' answers, and putting finished meshes on screen. */

// may c be meshed: its four neighbours are there AND lit. A mesh reads the light of the cells just across each
// border, and a neighbour not lit yet has none to read (the sky flood leaves it alone until then: propagateSky, 09);
// finishChunkGen asks again for every neighbour of the chunk it has just lit.
function neighborsReady(c) {
  const n1 = getChunk(c.cx - 1, c.cz), n2 = getChunk(c.cx + 1, c.cz);
  const n3 = getChunk(c.cx, c.cz - 1), n4 = getChunk(c.cx, c.cz + 1);
  return n1 && n1.lit && n2 && n2.lit && n3 && n3.lit && n4 && n4.lit;
}

/* `lit` gates meshing on the chunk's own lighting pass having run. Without it there is a race:
   a neighbour's finishChunkGen queues this chunk for meshing while its own sky seeding is still
   sitting in genFinishQueue, and an edit beside it may already have made its c.sky array with only
   a few columns filled (reskyAround). The mesh worker only treats a MISSING c.sky as "assume open
   sky": a present-but-unseeded one bakes as zero, and the chunk comes out pitch black with nothing
   left to re-mesh it. */
/* The queue is kept in nearest-first order by INSERTING each entry at its place, instead of
   pushing and re-sorting the whole thing afterwards. finishChunkGen used to call meshQueue.sort()
   on every single chunk arrival, and while streaming that queue holds hundreds of entries — an
   O(n log n) pass per arriving chunk, dozens of times a second, to absorb at most five new items.
   A binary search costs log n comparisons and one splice. */
function _insertMeshJob(job) {
  let lo = 0, hi = meshQueue.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (meshQueue[mid].d2 <= job.d2) lo = mid + 1; else hi = mid;
  }
  meshQueue.splice(lo, 0, job);
}
function tryQueueMesh(c, d2, front) {
  if (!c.data || !c.lit || c.queuedMesh || c.meshing || !neighborsReady(c)) return;
  c.queuedMesh = true;
  if (front) meshQueue.unshift({ cx: c.cx, cz: c.cz, d2: 0 });   // edits jump the queue
  else _insertMeshJob({ cx: c.cx, cz: c.cz, d2 });
}

/* Cached generated terrain is a raw voxel buffer, and 0.69 widened a voxel from 16 to 32 bits.
   A pre-0.69 cache reinterpreted as uint32 would be garbage, so the key changed with the format
   and the old entries are simply never read again.

   The key is also the ONLY way a generator change reaches a world someone has already visited:
   a chunk is generated once and then read back from this cache forever, which is why the tall
   grass added in 0.6855 never appeared in an existing save. Bump it whenever worldgen starts
   emitting something new that old worlds should get. Regenerating is safe — same seed, same
   terrain — and player edits are stored separately and replayed on top. */
/* Bumped whenever worldgen changes, so cached terrain is thrown away and made again: 0.785 layer stacks,
   0.786 dunes and gravel, 0.7945 gem clusters, 0.7947 yellow berries, 0.7948 caverns carve every rock,
   0.799 fewer flowers/mushrooms/gravel/hollow logs, 0.7992 leaf drifts. */
const TERRAIN_KEY = 'terrain8354:';   // 0.8354 the world 250 tall (a cached 200-tall buffer must never be read)     // 0.8273 wild wheat in six stages   //   // 0.8272 berry bushes 20% more   // 0.8271 dirt patches on cave floors, yellow berry bushes on them   // 0.827 berry bushes by place (five kinds), yellow ones in caves, six stages   // 0.826 wild wheat in any stage and twice as common, 25% more berry bushes   // 0.8193 salt crust and cactus much rarer   // 0.819 half the flowers and mushrooms   // 0.8141 salt crust 80% rarer   // 0.8097 salt crust as a layer   // 0.809 dolomite, 0.8091 salt/cantaloupe/mushrooms, 0.8095 stone pebbles
// extract a neighbour's 16x128 border plane (block data OR block light) for cross-chunk work
// (ZERO_LIGHT, the stand-in for an unlit neighbour, went in 0.83941: the workers pack the light since 0.8386)
function edgeSlice(d, side, Ctor) {
  const s = new Ctor(16 * CHUNK_Y);
  for (let y = 0; y < CHUNK_Y; y++) {
    const yo = y << 8, so = y << 4;
    for (let i = 0; i < 16; i++) {
      if (side === 0) s[i + so] = d[15 + (i << 4) + yo];        // west nb: x=15 plane [z,y]
      else if (side === 1) s[i + so] = d[0 + (i << 4) + yo];    // east nb: x=0
      else if (side === 2) s[i + so] = d[i + (15 << 4) + yo];   // north nb: z=15 plane [x,y]
      else s[i + so] = d[i + yo];                               // south nb: z=0
    }
  }
  return s;
}

function dispatchMesh(worker, c) {
  const nw = getChunk(c.cx - 1, c.cz), ne = getChunk(c.cx + 1, c.cz);
  const nn = getChunk(c.cx, c.cz - 1), ns = getChunk(c.cx, c.cz + 1);
  c.meshing = true; c.queuedMesh = false; c.dirty = false; c.rev++;
  c.meshOut = (c.meshOut | 0) + 1;            // jobs out for this chunk: a player's edit may send one over another
  c.meshSentAt = performance.now();
  c.lod = chunkLod(chunkDist2ToPlayers(c.cx, c.cz), c.lod | 0);   // its level of detail
  /* 0.8386: the worker packs the light itself (block light low nibble, capped at 15, its cold bit
     at 8; sky high nibble: `packLight` in WORKER_MAIN), which was a 102,400-cell loop here for every mesh job. With
     shared memory the chunk and its four neighbours go as they are (`self`, `nb`), and the worker copies what it needs;
     without, the chunk's three arrays are copied here and the neighbours' border planes cut out. */
  const msg = { type: 'mesh', cx: c.cx, cz: c.cz, rev: c.rev,
                layers: LAYER_STACKS.get(key(c.cx, c.cz)) || null,            // mixed layer stacks
                lod: c.lod,
                rush: !!c.editRush };                                         // a player's edit: the worker takes it next
  if (SHARED_OK && c.data.buffer instanceof SharedArrayBuffer) {
    const arrs = (n) => ({ data: n.data, light: n.light || null, sky: n.sky || null });
    msg.shared = true;
    msg.self = arrs(c);
    msg.nb = [arrs(nw), arrs(ne), arrs(nn), arrs(ns)];        // sides 0-3: west, east, north, south
    worker.postMessage(msg);
    return;
  }
  const own = { data: c.data.slice(), light: c.light ? c.light.slice() : null, sky: c.sky ? c.sky.slice() : null };
  const edge = (n, side) => ({ data: edgeSlice(n.data, side, Uint32Array),
                               light: n.light ? edgeSlice(n.light, side, Uint8Array) : null,
                               sky: n.sky ? edgeSlice(n.sky, side, Uint8Array) : null });
  msg.self = own;
  msg.nb = [edge(nw, 0), edge(ne, 1), edge(nn, 2), edge(ns, 3)];
  const tr = [];
  for (const o of [own, ...msg.nb]) for (const a of [o.data, o.light, o.sky]) if (a) tr.push(a.buffer);
  worker.postMessage(msg, tr);
}

/* ---- generation throttle ----
   Generation is the single most expensive thing this game does, and pump() used to feed it as
   hard as the worker pool would take: every worker filled to two jobs, continuously, for as long
   as the queue had anything in it. Flying across terrain therefore pinned every core for minutes
   at a time — the fan noise and the battery drain you noticed.

   Two dials shape it:

     max — how many generation jobs may be in flight at once
     gap — minimum milliseconds between handing out two of them

   They are driven by the DISTANCE of the next chunk waiting, not by how many are waiting.

   Keying them to queue LENGTH was the obvious reading of "slower when there is more to do", and
   it does not work: at render distance 16 the queue legitimately holds 800 chunks, so the deepest
   throttle latched permanently and generation never caught up. Measured coverage was 6-24% of the
   render radius — a steady 165fps spent drawing an empty world, which is not a performance win,
   it is a broken render distance.

   Distance is the honest signal. A hole four chunks away is one you are looking at, so it is
   worth full speed; the far horizon can arrive at a leisurely pace nobody will notice. The result
   still removes the thing that actually heats the machine — every core pinned on generation for
   minutes at a stretch — because past the near ring the gap caps throughput to a steady rate
   instead of letting it saturate. It just converges while doing so.

   Meshing is never throttled: it is the cheap half, and it is what you actually see appear.
   The world-loading screen is exempt — the player is waiting on exactly this work. */
let _genInflight = 0;
let _lastGenAt = 0;
/* ---- the stream under stress ----
   Everything above and in runWorldTick (22) was sized PER FRAME: one new generation job each time pump ran (it runs when
   a worker answers and once a frame, and answers that waited out a long frame all come in the same instant), two jobs a
   worker, 5 ms of finishing and uploading a frame. So the lower the frame rate fell, the less land arrived each SECOND —
   at 10 fps about a sixth of what 60 fps got — exactly when the land was already behind, and the workers sat idle
   through most of every long frame. Now the clock is what counts:
     frameMsAvg    a frame's real length, eased (frame(), 22)
     _genTokens    generation jobs the pacing has let through: `gap` ms each on the clock, however often pump runs
     in flight     as many as a frame's worth of that pacing, and a worker holds more jobs the longer the frame is
     streamBehind  land is waiting near a player (runWorldTick): background work that can wait does (the season scans
                   51, fluid writes 61), and the stream takes a bigger share of the frame (22). */
var frameMsAvg = 16.7, streamBehind = false;
let _genTokens = 1;
const STREAM_NEAR_D2 = 36;                  // "near": within 6 chunks of a player
// the stream's slice of a frame (runChunkStream, 22): its share of the frame's length, more while land is waiting; the most
// it ever takes; how far the per-frame counts may grow; and the part of the slice the mesh uploads always keep
const STREAM_SHARE = 0.2, STREAM_SHARE_BEHIND = 0.5, STREAM_MS_MAX = 45, STREAM_COUNT_MAX = 8, STREAM_UPLOAD_KEEP = 0.33;
const STREAM_MS_BEHIND = 8;                 // the least the stream takes of a frame while land is waiting (5 ms otherwise)
/* LAND FIRST. While land is waiting near a player (`streamBehind`), the chunk stream comes before everything that
   can wait, on the main thread and in the workers. Each of these gives way and takes its usual pace back the moment
   the land is in:
     the stream itself    first in the frame, a bigger slice of it, more finished and shown a frame (runChunkStream, 22)
     generation           more jobs out and less wait between them near a player (_genThrottle, below)
     the workers          a mesh before a generation, both before a season scan or a probe (jobNext, chunks/worker.js)
     the slow background  leaf litter, snow melt, the weather on the ground, grass growing and spreading, leaf decay,
                          log mushrooms: one sim tick in STREAM_BG_EVERY (simTick, 22)
     the season's scans   not at all (seasons/seasons.js)
     water and lava       a quarter of their writes, and their thread steps every other tick (fluids/fluids.js)
     falling blocks       a third as many a tick (blocks/falling.js)
     creatures            calm ones further than ENT_FAR_R_BEHIND blocks think every 4th tick (entities/tick.js)
   A new background system that writes blocks (each write is a chunk to mesh again) should read `streamBehind` too. */
const STREAM_BG_EVERY = 5;
// is land still missing near a player: a chunk within STREAM_NEAR_D2 not made yet, or made and never drawn. (A chunk
// that is drawn and only waits to be meshed AGAIN, after an edit or a flow of water, is not missing land.)
function streamLandWaiting() {
  if (genQueue.length > 0 && genQueue[0].d2 <= STREAM_NEAR_D2) return true;
  for (let i = 0; i < meshQueue.length && i < 12; i++) {
    const m = meshQueue[i];
    if (m.d2 > STREAM_NEAR_D2) break;
    const c = getChunk(m.cx, m.cz);
    if (c && c.shownAt == null) return true;
  }
  return false;
}
function _genThrottle() {
  /* The loading screen and the title panorama both get an exemption. Neither is "play": the
     player is looking straight at the work and waiting for it, and the panorama is a fixed
     5-chunk radius that is over in a moment. Throttling those was what made boot feel slow. */
  if (_loadingWorld || menuScene) return { max: 8, gap: 0 };
  const g = genQueue[0];
  const d2 = g ? g.d2 : 0;                             // squared chunk distance of the next job
  /* Inside the render distance (`viewDist`, full detail: a hole there is one you see): a chunk to make for every
     worker that may make one, and one more on its way, so none of them stands idle. A job is out for a few hundred
     ms (its cache read, its turn in the worker's queue, the making), and the old 2 or 3 at a time held the land to
     about 9 chunks a second at render 10. Beyond it, the far ring drawn at LOD 2: a steady pace, ~25 a second. */
  // (one ring further than viewDist: a chunk at the very edge is meshed only once the four round it are made and lit)
  const makers = Math.max(1, workers.length - (_editLane ? 1 : 0));
  if (d2 <= (viewDist + 1) * (viewDist + 1)) return { max: makers + 1, gap: 3 };
  return { max: 2, gap: 40 };
}
function noteGenDone() { if (_genInflight > 0) _genInflight--; }
function resetGenThrottle() { _genInflight = 0; _lastGenAt = 0; _genTokens = 1; }

/* THE EDIT LANE: a player's hand on the world goes ahead of making new land. Making a chunk is the one long job
   a worker has (tens of milliseconds), and a worker in the middle of one can take nothing else until it ends, the
   re-mesh of the block a player just broke included. So while a player works on the world (notePlayerEdit,
   chunks/block-access.js: digging, building, picking with E; and EDIT_LANE_MS after) ONE worker is given no chunk
   to make. It still meshes, which is short work, and the other workers make chunks as before. Each worker counts
   the chunks it has to make (`genOut`: pump below, and the answers in 10-workers.js); the lane is a worker with
   none, kept for as long as that holds. A new kind of long job for the workers must stay out of the lane too. */
const EDIT_LANE_MS = 2500;
let _editLane = null;
/* the worker best placed to take a job: the fewest chunks to make (0 = it is not in a long job, and can start at
   once), then the fewest jobs. Only workers holding fewer than `room` jobs count, and never `skip` (null when none
   has room). */
function _bestWorker(room = Infinity, skip = null) {
  let best = null;
  for (const w of workers) {
    if (w === skip || w.busy >= room) continue;
    if (!best || w.genOut < best.genOut || (w.genOut === best.genOut && w.busy < best.busy)) best = w;
  }
  return best;
}
function _editLaneWorker(now) {
  if (_loadingWorld || menuScene || now - _playerEditAt > EDIT_LANE_MS) return (_editLane = null);
  if (!_editLane || _editLane.genOut > 0) _editLane = _bestWorker();
  return _editLane;
}

// hand queued jobs to idle workers — meshing near chunks beats generating far ones
function pump() {
  const thr = _genThrottle();
  const now = performance.now();
  /* 0.8443 (the note above _genThrottle): at 60 fps every number here is what it was — two jobs a worker, `max` in
     flight, one job a `gap`. A long frame gets a frame's worth: a worker holds up to 4 jobs, and as many generations
     may be out as the gap would have started in that time (one worker slot always left for meshing). */
  const slow = Math.max(1, frameMsAvg / 16.7);
  const depth = slow >= 3 ? 4 : slow >= 2 ? 3 : 2;
  const genMax = thr.gap > 0 ? Math.min(workers.length * depth - 1, Math.max(thr.max, Math.ceil(frameMsAvg / thr.gap)))
                             : thr.max;        // no gap = the loading screen or the title: as many as it ever took
  _genTokens = thr.gap > 0 ? Math.min(genMax, _genTokens + (now - _lastGenAt) / thr.gap) : genMax;
  _lastGenAt = now;
  /* A PLAYER'S EDIT FIRST. The re-mesh of a chunk you just dug into or built on (editRush; markDirty puts it
     at the head of the queue) used to wait for a worker with a free place, and then behind whatever that worker
     already held: under stress, several frames in which the hole or the new block was simply not drawn. It goes out
     at once now, to the worker that can start it soonest (_bestWorker: one with no chunk to make, the edit lane above),
     over the usual limit of jobs a worker may hold, and the worker takes it ahead of its other jobs (WORKER_MAIN's job
     list, chunks/worker.js). */
  const lane = _editLaneWorker(now);
  while (meshQueue.length) {
    const m = meshQueue[0], c = getChunk(m.cx, m.cz);
    if (!c || !c.editRush) break;
    meshQueue.shift();
    // ...even over a mesh of it already out (markDirty): this one is newer, that one's answer will be dropped
    if (c.data && c.queuedMesh && neighborsReady(c)) {
      const w = _bestWorker();
      w.busy++;
      dispatchMesh(w, c);
    } else c.queuedMesh = false;
  }
  /* SPREAD OVER THE WORKERS. The jobs go out one at a time, each to the worker best placed for it (_bestWorker): a
     chunk to make to the worker with the fewest chunks to make already (never the edit lane), so the chunks are made
     side by side; a mesh to the one with the fewest chunks to make too, so it does not wait behind a long job; then the
     fewest jobs. Filling one worker up to `depth` before the next had the chunks made one after another on one or two
     workers while the others stood idle. */
  for (;;) {
    const meshW = _bestWorker(depth), genW = _bestWorker(depth, lane);
    if (!meshW) return;                       // every worker holds as many jobs as it may
    // gen is allowed only while under the concurrency cap and the pacing has one to give, and a worker other than the lane has room
    const genOk = genW !== null && _genInflight < genMax && _genTokens >= 1;
    let job = null, kind = null;
    while (meshQueue.length || (genQueue.length && genOk)) {
      const m = meshQueue[0], g = genOk ? genQueue[0] : null;
      if (m && (!g || m.d2 <= g.d2 + 2)) {
        meshQueue.shift();
        const c = getChunk(m.cx, m.cz);
        if (c && c.data && c.queuedMesh && !c.meshing && neighborsReady(c)) { job = c; kind = 'mesh'; break; }
        if (c) c.queuedMesh = false;
      } else if (g) {
        genQueue.shift();
        const c = getChunk(g.cx, g.cz);
        if (c && !c.data && !c.generating) { job = c; kind = 'gen'; break; }
      }
    }
    if (!job) return;
    if (kind === 'mesh') { meshW.busy++; dispatchMesh(meshW, job); continue; }
    _genInflight++; _genTokens -= 1;
    job.generating = true;
    if (currentWorld && !menuScene) _genFromCache(job.cx, job.cz, currentWorld.id);
    else _genSend(genW, { type: 'gen', cx: job.cx, cz: job.cz });
  }
}
// a chunk to make goes to a worker, which counts it from now on (busy, genOut; its answer counts it off, 10-workers.js)
function _genSend(w, msg, transfer) { w.busy++; w.genOut++; w.postMessage(msg, transfer); }
/* WHICH CHUNKS THE TERRAIN CACHE HOLDS, known without asking it. Every chunk to make used to read the cache first, and
   flying into new land every read found nothing, after waiting its turn behind the writes of the chunks just made: a
   median 0.36 s, up to 3 s, holding a job slot all the while (8 chunks a second from 8 workers). Now one keys-only read
   when a world opens lists what it holds, and each chunk stored is added: a chunk not on the list goes straight to a
   worker. Until the list is in, every chunk is read as before. A list that missed one only costs a chunk made again,
   the same land (the cache holds the generator's output; edits are kept apart). */
let _terrainHave = null, _terrainHaveWid = null;   // Set of "cx,cz" for world _terrainHaveWid; null while not known
let _terrainAdded = new Set();                     // stored while the list was being read
function terrainCacheIndex(wid) {
  _terrainHave = null; _terrainHaveWid = wid; _terrainAdded = new Set();
  if (!idb || !wid) return;
  try {
    const prefix = TERRAIN_KEY + wid + ':';
    const rq = idb.transaction('worlds', 'readonly').objectStore('worlds').getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿'));
    rq.onsuccess = () => {
      if (_terrainHaveWid !== wid) return;          // another world opened meanwhile
      const have = new Set(_terrainAdded);
      for (const k of rq.result || []) have.add(String(k).slice(prefix.length));
      _terrainHave = have;
    };
  } catch (e) { /* no list: every chunk is read, as before */ }
}
// a chunk just stored in the cache
function terrainCacheAdded(wid, k) {
  if (wid !== _terrainHaveWid) return;
  if (_terrainHave !== null) _terrainHave.add(k); else _terrainAdded.add(k);
}
/* A chunk to make in a world: its terrain cache is read first, and the worker is chosen only once the read is in, so
   the read (tens of ms) holds up no worker. A chunk let go meanwhile is not made, and its place among the jobs in
   flight is given back (it used to stay taken when the cache had the chunk: each such chunk left generation one job
   short for the rest of the session). A read from a world left meanwhile is dropped: the throttle was reset with it. */
function _genFromCache(cx, cz, wid) {
  // new land, which the cache does not hold: straight to a worker, no read (terrainCacheIndex below)
  if (_terrainHave !== null && _terrainHaveWid === wid && !_terrainHave.has(key(cx, cz))) {
    _genSend(_bestWorker(Infinity, _editLane) || _bestWorker(), { type: 'gen', cx, cz });
    return;
  }
  idbGet(TERRAIN_KEY + wid + ':' + key(cx, cz)).then(buf => {
    if (!currentWorld || currentWorld.id !== wid) return;
    const c = getChunk(cx, cz);
    if (!c || !c.generating) { noteGenDone(); pump(); return; }
    const cached = buf instanceof ArrayBuffer;
    // without the light settings a cached chunk is used as it is, here
    if (cached && !LIGHT_WORKER) { onWorkerMessage({ type: 'gen', cx, cz, data: buf, _fromSave: true }); pump(); return; }
    /* else it still goes by a worker, which lists its light emitters and lights its own sky; the answer comes back
       as a 'gen' marked _fromSave, so it is not cached again */
    const w = _bestWorker(Infinity, _editLane) || _bestWorker();
    if (cached) _genSend(w, { type: 'prep', cx, cz, data: buf }, [buf]);
    else _genSend(w, { type: 'gen', cx, cz });
  });
}

/* Chunks whose data has landed but whose lighting/decoration pass has not run yet. Drained a few
   per frame from the main loop so the per-chunk cost is spread instead of arriving in bursts. */
const genFinishQueue = [];

function finishChunkGen(c) {
  if (!c.data || !chunks.has(key(c.cx, c.cz))) return;      // unloaded while it waited
  // the title backdrop wears its random season straight from the generator (seasons/seasons.js)
  if (menuScene && typeof seasonDressChunk === 'function') seasonDressChunk(c);
  /* Register world-generated emitters (lava, natural glowstone) so they actually cast light.

     This walks all 102,400 voxels of the chunk, so what it does PER voxel dominates the pass. It
     used to call blockLightOf(), which masks the id, compares against the furnace and then walks
     a `PROPS[id]?.light` property chain — several times the cost of the test itself. EMITTER_ID
     is a flat 256-entry lookup built once at boot, so the overwhelmingly common case (air, stone,
     dirt — cells that can never emit) is one typed-array read. */
  const wx0 = c.cx * 16, wz0 = c.cz * 16, d = c.data;
  const seeEmitter = (i) => {
    const v = d[i];
    if (!EMITTER_ID[v & 255]) return;
    // a termite hill's foot cell: its model and its termites (blocks/termite-hill.js)
    if (PROPS[v & 255].pageModel) { if (!menuScene && typeof termiteHillSeen === 'function') termiteHillSeen(wx0 + (i & 15), i >> 8, wz0 + ((i >> 4) & 15), v); return; }
    if (blockLightOf(v) > 0) {
      glowAdd(wx0 + (i & 15), i >> 8, wz0 + ((i >> 4) & 15));
      // a torch or glow block seen for the first time starts burning (blocks/torches.js)
      if (!menuScene && typeof burnSeen === 'function') burnSeen(wx0 + (i & 15), i >> 8, wz0 + ((i >> 4) & 15), v & 255);
    }
  };
  /* 0.8381: the worker made the chunk and listed the cells that may give light, so only those are
     looked at, and the cells the player's edits rewrote (an edit may have put a torch where there was none). Glow and
     burn registration both ignore a cell they already have. */
  if (c._emit) {
    for (let k = 0; k < c._emit.length; k++) seeEmitter(c._emit[k]);
    const edits = editStore.get(key(c.cx, c.cz));
    if (edits) for (const i of edits.keys()) seeEmitter(i);
    c._emit = null;
  } else for (let i = 0; i < d.length; i++) seeEmitter(i);
  // its open water freezes as the season says, straight in the data before it meshes (seasons/seasons.js)
  const froze = typeof iceDressChunk === 'function' ? iceDressChunk(c) : 0;
  /* A chunk arriving fresh needs seeding again — its edits were just re-applied, and if it landed
     while outside the simulation radius the relight below declines. Clearing the woken mark is
     what guarantees the sim-wake pass revisits it (and lights it) once the player is close. */
  simWakeInvalidate(c.cx, c.cz);
  relightForChunk(c.cx, c.cz);             // pour in any nearby glowstone before this meshes
  /* daylight columns + spread into caves/overhangs. 0.8383: the worker lit the chunk's inside as
     it made it, so only what crosses its borders is done here — unless the data is no longer what the worker saw (the
     player's edits, water frozen just now, the title's season dressing): then all of it, as before. */
  if (c._skyW && LIGHT_WORKER && !menuScene && !froze && !editStore.has(key(c.cx, c.cz))) seedSkyFromWorker(c, c._skyW);
  else seedSkyForChunk(c);
  c._skyW = null;
  c.lit = true;                            // only now may it mesh — see the note on tryQueueMesh
  // structures are stamped AFTER terrain, on the main thread — see the header of 34-structures.js
  trySpawnStructureInChunk(c.cx, c.cz);
  // ...and the chunk rolls its mob population, once, the first time it ever exists
  trySpawnEntitiesInChunk(c.cx, c.cz);
  // night mobs roll on EVERY load instead, so dusk repopulates ground the player already knows
  trySpawnNightMobsInChunk(c.cx, c.cz);
  // the fluid simulation may read it now, and looks it over for water and lava that can move (fluids/fluids.js)
  if (typeof fluidRegister === 'function') fluidRegister(c);
  // this chunk (and each neighbour that was waiting on it) may be meshable now
  const R2 = drawDist() * drawDist();       // the far ring too
  for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const n = getChunk(c.cx + dx, c.cz + dz);
    if (!n || !n.data || n.meshing || n.queuedMesh) continue;
    if (!n.dirty && (n.meshes[0] || n.meshes[1] || n.meshes[2] || n.meshes[3])) continue;   // meshed, and nothing changed since (markDirty)
    const ddx = n.cx - playerCX, ddz = n.cz - playerCZ, d2 = ddx * ddx + ddz * ddz;
    if (d2 <= R2) tryQueueMesh(n, d2);
  }
  pump();                                  // tryQueueMesh inserts in order; no re-sort needed
}

/* A COUNT is a poor budget: one chunk's finish pass can cost anything from a fraction of a
   millisecond to several, depending on how much decoration and lighting landed in it, so a fixed
   "two per frame" is either wasteful or a stutter depending on the terrain. `deadline` is the
   real limit — a timestamp this drain must not run past — with the count kept as a ceiling.
   Whatever is left simply waits for the next frame; nothing is dropped. */
function processGenFinish(maxPerFrame, deadline) {
  let n = 0;
  while (genFinishQueue.length && n < maxPerFrame) {
    finishChunkGen(genFinishQueue.shift());
    n++;
    if (deadline && n >= 1 && performance.now() > deadline) break;
  }
}

function onWorkerMessage(m) {
  if (m.type === 'error') {
    console.error('[worker]', m.message);
    /* the failed job gives back what it held, so one bad chunk leaves no job slot taken for good and no chunk waiting
       for ever, and it is asked for again: twice at most, so a fault that repeats does not go round and round (a step
       across a chunk border no longer rebuilds the queues, which used to pick such a chunk up: rebuildQueues) */
    const c = m.cx != null ? getChunk(m.cx, m.cz) : null;
    if (m.job === 'gen' || m.job === 'prep') {
      noteGenDone();
      if (c) {
        c.generating = false;
        if ((c._genErrs = (c._genErrs | 0) + 1) <= 2) {
          genQueue.push({ cx: c.cx, cz: c.cz, d2: chunkDist2ToPlayers(c.cx, c.cz) });
          genQueue.sort((a, b) => a.d2 - b.d2);
        }
      }
    } else if (m.job === 'mesh' && c) {
      c.meshOut = Math.max(0, (c.meshOut | 0) - 1); c.meshing = c.meshOut > 0;
      if ((c._meshErrs = (c._meshErrs | 0) + 1) <= 2) tryQueueMesh(c, chunkDist2ToPlayers(c.cx, c.cz));
    }
    return;
  }
  if (m.type === 'probe') { if (typeof bossLairProbe === 'function') bossLairProbe(m); return; }   // a castle site looked at
  const c = getChunk(m.cx, m.cz);
  if (m.type === 'gen') {
    noteGenDone();                           // free a slot in the generation throttle, always
    if (!c) return;                          // chunk was unloaded while generating
    c.generating = false;
    // in shared memory when it is on (C10): the mesh, scan and light workers then read it where it lies
    c.data = shareArr(new Uint32Array(m.data));
    if (typeof lightRegister === 'function') lightRegister(c);   // the light thread reads it from now on
    // the cells that may give light, found by the worker; without them (LIGHT_WORKER off and cached): a full scan
    c._emit = m.emit ? new Int32Array(m.emit) : null;
    c._skyW = m.sky ? new Uint8Array(m.sky) : null;   // and its own sky light, worked out there
    if (!m._fromSave && currentWorld && !menuScene) {
      // shared memory cannot be stored: then the worker's own buffer goes in, untouched since c.data copied it
      const wid = currentWorld.id, k = key(m.cx, m.cz);
      idbPut(TERRAIN_KEY + wid + ':' + k, c.data.buffer === m.data ? c.data.buffer.slice() : m.data)
        .then(() => terrainCacheAdded(wid, k)).catch(() => {});
    }
    const edits = editStore.get(key(m.cx, m.cz));
    if (edits) for (const [i, v] of edits) c.data[i] = v;   // re-apply player edits
    /* The voxel data is installed immediately — it is only a typed-array wrap and the edit
       replay, and neighbours need it present to know they can mesh. Everything AFTER that (the
       full-chunk emitter scan, the sky seed, glow propagation, structure rolls) is queued, so
       four workers finishing in the same frame no longer means four of those passes back to
       back. That burst was what showed up as periodic stutter while flying. */
    genFinishQueue.push(c);
  } else if (m.type === 'scan') {
    // a chunk's season pass, its cells listed by a worker (seasons/seasons.js)
    if (c && typeof seasonScanResult === 'function') seasonScanResult(c, m);
  } else if (m.type === 'mesh') {
    if (!c) return;
    c.meshOut = Math.max(0, (c.meshOut | 0) - 1);      // still meshing while another job of it is out
    c.meshing = c.meshOut > 0;
    if (m.rev === c.rev) { m.rush = !!c.editRush; meshResults.push(m); }   // stale revs are discarded
    // changed again meanwhile: mesh it again — and for an edit still settling, without waiting on an older job still out
    if (c.dirty) { if (c.meshing && c.editRush) _rushOver(c); else tryQueueMesh(c, 0, true); }
    // a player's edit is shown as soon as its mesh is back, not at the next frame's turn: the rush group only
    if (m.rush && m.rev === c.rev) applyMeshResults(0, 0);
  }
}

// upload at most a few freshly meshed chunks per frame so the main thread never hitches.
// EDIT-triggered results ("rush") are grouped: when a dig at a chunk border re-meshes two
// chunks, applying them on different frames shows a see-through hole for a frame — so a rush
// result waits (a few frames max) until no adjacent rush re-mesh is still in flight, then all
// pending rush results apply together in the same frame, ignoring the per-frame cap.
function applyMeshResults(maxPerFrame, deadline) {
  let n = 0;
  let rushWaiting = false;
  for (const m of meshResults) {
    if (!m.rush) continue;
    m.waited = (m.waited || 0) + 1;
    if (m.waited >= 8) continue;                       // safety valve: never hold forever
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nb = getChunk(m.cx + dx, m.cz + dz);
      if (nb && nb.editRush && (nb.meshing || nb.queuedMesh)) { rushWaiting = true; break; }
    }
    if (rushWaiting) break;
  }
  if (!rushWaiting) {
    for (let i = meshResults.length - 1; i >= 0; i--) {
      if (!meshResults[i].rush) continue;
      const m = meshResults.splice(i, 1)[0];
      if (applyOneMesh(m)) n++;
    }
  }
  let qi = 0;
  while (qi < meshResults.length && n < maxPerFrame) {
    const m = meshResults[qi];
    if (m.rush) { qi++; continue; }                    // held for the grouped apply above
    meshResults.splice(qi, 1);
    if (applyOneMesh(m)) n++;
    // a geometry upload is a GPU-side allocation and its cost varies wildly with chunk content;
    // stop at the frame's deadline rather than trusting the count. The rest wait one frame.
    if (deadline && performance.now() > deadline) break;
  }
  /* new or changed geometry the shadow maps can see must reach them: a player's edit at once, everything else (new land,
     water flowing, sand falling) at the maps' own pace, at most every SHADOW_SOFT_MS (07-sky.js) */
  if (_shadowTouched) {
    if (_shadowUrgent) shadowDirty = true; else shadowSoftDirty = true;
    _shadowTouched = _shadowUrgent = false;
  }
}
let _shadowTouched = false, _shadowUrgent = false;
function applyOneMesh(m) {
  {
    const c = getChunk(m.cx, m.cz);
    if (!c || m.rev !== c.rev) return false;
    { const r = shadowR / 16 + 2; if (chunkDist2ToPlayers(m.cx, m.cz) <= r * r) { _shadowTouched = true; if (m.rush) _shadowUrgent = true; } }   // inside the shadow maps
    // still a rush while a follow-up of the same edit waits its turn (markDirty's EDIT_FOLLOW_MS)
    c.editRush = !!c.queuedMesh && performance.now() - (c.editAt || -1e9) < EDIT_FOLLOW_MS;
    _regionTouch(c);                        // its far region (if built) comes apart first
    if (!MESH_REUSE) disposeChunkMeshes(c);
    // first shown now, or still fading in from its first showing: the new meshes fade on from there
    const nowS = performance.now() / 1000;
    c._meshAt = nowS; c._minY = m.minY; c._maxY = m.maxY;   // for the far regions
    if (c.shownAt == null) c.shownAt = nowS;
    const fadeAge = nowS - c.shownAt;
    const midY = (m.minY + m.maxY) / 2;
    const sphere = new THREE.Sphere(new THREE.Vector3(8, midY, 8),
                                    Math.sqrt(128 + Math.pow((m.maxY - m.minY) / 2 + 1, 2)) + 1);
    for (let i = 0; i < 5; i++) {
      const p = m.passes[i], old = c.meshes[i];
      // the pass already drawn and the new one fits its buffers: rewritten in place, mesh and fade kept
      if (old && p && _meshRefill(old.geometry, p)) { old.geometry.boundingSphere.copy(sphere); continue; }
      if (old) _disposeChunkMesh(c, i);
      if (!p) continue;
      const geo = _meshGeometry(p, MESH_REUSE && m.rush);   // a player's edit: spare room for the next one
      geo.boundingSphere = sphere.clone();                  // manual: skip costly compute
      const mesh = new THREE.Mesh(geo, MATERIALS[i]);
      mesh.renderOrder = i;                                 // opaque -> cutout -> water -> lava -> glass
      mesh.layers.set(i === 0 ? 0 : i === 1 || i === 4 ? 2 : 3);   // shadow casters: 0 full, 2 weak (leaves, glass); water/lava: layer 3
      mesh.position.set(m.cx * 16, 0, m.cz * 16);
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;                        // static geometry
      scene.add(mesh);
      c.meshes[i] = mesh;
      if (fadeAge < CHUNK_FADE_IN_S) _fadeStart(mesh, i, false, fadeAge);
    }
    return true;
  }
}
