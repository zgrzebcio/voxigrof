'use strict';
/* fluids/fluids.js: water and lava flowing. The fluid thread, which chunks it knows, touching a cell to wake it, and
   writing the changes the rules ask for. The rules are fluids/rules.js; how fluids are drawn is fluids/mesher-fluids.js. */

/* voxiGrof — fluids flowing: water and lava spread, fall and dry on a schedule. The rules are one simulation,
   makeFluidSim in chunks/voxel-core.js; this file runs it and writes what it decides.

   WHERE IT RUNS. With shared memory (SHARED_OK) the simulation is a thread of its own, a worker of the pool's kind
   (fluidThreadStart) reading every finished chunk's cells where they lie: registered as a chunk is finished
   (fluidRegister, from finishChunkGen in chunks/stream.js; it looks the chunk over for loose fluid there, the world's own water
   too), forgotten on unload. Each sim tick (simTick, 22) with nothing of its last answer left to write, updateFluids
   sends it the time, the tick speed, the players' chunks and the touches the game made since (a block broken or placed
   beside a fluid, a bucket: queueWaterAt and the rest below). Without shared memory the same simulation runs here, its
   chunk look-overs FLUID_SCAN_LAYERS layers a tick.

   WRITING. An answer is a list of changes [x, y, z, was, now]. They go in through setBlock, FLUID_WRITE_MAX a tick at
   most and no longer than FLUID_WRITE_MS, each only while its cell still holds `was` (the player may have built there
   meanwhile: then that cell is looked at again). setBlock's own fluid hooks keep quiet while it does (fluidApplying,
   11), as the simulation queued what follows, and its re-meshes are not a player's rushed ones. A plant in the way
   washes off with its drops; light is redone once per area, only where lava came or went or a cell turned to rock.
   The next step is asked for only once a list is all written, so the simulation always reads what is in the world,
   and a big flood slows down rather than piling up work.

   F3 shows a line for it (fluidDebugLine): where it runs, the cells queued and those waiting out of the sim range,
   cells looked at and blocks written a second, and the time it takes: the step (in the thread, or here) and the
   writing here. */

const FLUID_WRITE_MAX = 400, FLUID_WRITE_MS = 2.5;      // per sim tick
const FLUID_BEHIND_SHARE = 0.25;                        // ...and this much of both while new land is waiting (streamBehind)
const FLUID_SCAN_LAYERS = 32;                           // without the thread: layers of a chunk looked over a tick
let _fluidW = null, _fluidSim = null, _fluidBusy = false, _fluidClock = 0, _fluidGen = 0, _fluidTickN = 0;
let _fluidBatch = null, _fluidAt = 0;                   // an answer being written, and how far
let _fluidTouch = [];                                   // the game's touches since the last step: x, y, z, mode
const _fluidScanQ = [];                                 // without the thread: [cx, cz, next layer]
const _fluidStat = { cells: 0, written: 0, rejected: 0, stepMs: 0, writeMs: 0, steps: 0, queued: 0, parked: 0, t0: 0, line: '' };

function fluidThreadStart() {
  if (_fluidW || !FLUID_FLOW || !SHARED_OK || typeof workerURL === 'undefined') return;
  _fluidW = new Worker(workerURL);
  _fluidW.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'error') { console.error('[fluid worker]', m.message); _fluidBusy = false; return; }
    if (m.type === 'fdone') { _fluidBusy = false; _fluidTook(m); }
  };
  _fluidW.postMessage({ type: 'freset' });
}
// without the thread: the world as the simulation sees it (-1 where a chunk is not loaded and finished)
const _fluidGet = (x, y, z) => {
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  return c && c.data && c.lit ? c.data[(x & 15) + ((z & 15) << 4) + (y << 8)] : -1;
};
const _fluidMainSim = () => _fluidSim || (_fluidSim = CORE.makeFluidSim(_fluidGet));

// a chunk finished (11 finishChunkGen): the simulation may read it now, and looks it over for loose fluid
function fluidRegister(c) {
  if (!FLUID_FLOW || menuScene || !c || !c.data) return;
  if (_fluidW) { if (c.data.buffer instanceof SharedArrayBuffer) _fluidW.postMessage({ type: 'freg', cx: c.cx, cz: c.cz, data: c.data }); }
  else _fluidScanQ.push([c.cx, c.cz, 0]);
}
function fluidForget(cx, cz) {
  if (_fluidW) { _fluidW.postMessage({ type: 'fforget', cx, cz }); return; }
  if (_fluidSim) _fluidSim.forget(cx, cz);
  for (let i = _fluidScanQ.length - 1; i >= 0; i--) if (_fluidScanQ[i][0] === cx && _fluidScanQ[i][1] === cz) _fluidScanQ.splice(i, 1);
}
// a world swap (21 resetWorld): everything let go; an answer still on its way is dropped (_fluidGen)
function fluidReset() {
  _fluidGen++;
  if (_fluidW) _fluidW.postMessage({ type: 'freset' });
  if (_fluidSim) _fluidSim.clear();
  _fluidBusy = false; _fluidBatch = null; _fluidAt = 0; _fluidTouch = []; _fluidScanQ.length = 0; _fluidClock = 0;
}

/* The game's touches (the names the old flow had, 0.8245 and before): a cell itself (0), the cells round it (1), or round
   it drying because a source went (2). Water and lava share them: the simulation looks at whichever is there. A touch the
   same as the one just before (setBlock asks for water and lava in a row) is not sent twice. */
let _ftX = 0, _ftY = -1, _ftZ = 0, _ftM = -1;
function _fluidTouchAt(x, y, z, mode) {
  if (!FLUID_FLOW || fluidApplying || menuScene) return;
  if (x === _ftX && y === _ftY && z === _ftZ && mode === _ftM) return;
  _ftX = x; _ftY = y; _ftZ = z; _ftM = mode;
  if (_fluidTouch.length < 400000) _fluidTouch.push(x, y, z, mode);
}
function queueWaterAt(x, y, z) { _fluidTouchAt(x, y, z, 0); }
function queueLavaAt(x, y, z) { _fluidTouchAt(x, y, z, 0); }
function queueWaterAround(x, y, z) { _fluidTouchAt(x, y, z, 1); }
function queueLavaAround(x, y, z) { _fluidTouchAt(x, y, z, 1); }
function dryWaterFrom(x, y, z) { _fluidTouchAt(x, y, z, 2); }
function dryLavaFrom(x, y, z) { _fluidTouchAt(x, y, z, 2); }

// once a sim tick (simTick, 22; perfLap 't:fluids' times it there)
function updateFluids(dt) {
  if (!FLUID_FLOW || menuScene || !currentWorld) return;
  _fluidClock += dt;
  if (_fluidBatch) _fluidWrite();
  // land waiting near a player: the simulation steps every other tick, so its thread leaves the chunk workers room
  // (its clock runs on: what was due is done at the next step)
  const giveWay = typeof streamBehind !== 'undefined' && streamBehind && (++_fluidTickN & 1) === 1;
  if (!_fluidBatch && !_fluidBusy && !giveWay) {
    const touch = new Int32Array(_fluidTouch);
    _fluidTouch = []; _ftY = -1;
    if (_fluidW) {
      const players = [];
      for (const p of PLAYER_CHUNKS) players.push(p[0], p[1]);
      const r = simDist();
      _fluidBusy = true;
      _fluidW.postMessage({ type: 'fstep', gen: _fluidGen, now: _fluidClock, speed: tickFactor(), players, r2: r * r, touch }, [touch.buffer]);
    } else {
      const sim = _fluidMainSim();
      _fluidScanSome(sim);
      const res = sim.step(_fluidClock, tickFactor(), inSimRangeChunk, touch), s = sim.stats();
      _fluidTook({ gen: _fluidGen, changes: res.changes, cells: res.cells, ms: res.ms, queued: s.queued, parked: s.parked });
    }
  }
  _fluidStatRoll();
}
/* without the thread: a chunk looked over a few layers a tick, edges with the last slice; one in the sim range first
   (nothing there moves anyway until a player comes near) */
function _fluidScanSome(sim) {
  let at = -1;
  for (let i = 0; i < _fluidScanQ.length && at < 0; i++) if (inSimRangeChunk(_fluidScanQ[i][0], _fluidScanQ[i][1])) at = i;
  if (at < 0) return;
  const q = _fluidScanQ[at];
  if (!getChunk(q[0], q[1])?.lit) { _fluidScanQ.splice(at, 1); return; }
  const y1 = Math.min(WORLD_TOP, q[2] + FLUID_SCAN_LAYERS - 1), last = y1 >= WORLD_TOP;
  sim.scanChunk(q[0], q[1], q[2], y1, last);
  if (last) _fluidScanQ.splice(at, 1); else q[2] = y1 + 1;
}
function _fluidTook(m) {
  if (m.gen !== _fluidGen) return;                      // asked before a world swap
  const st = _fluidStat;
  st.cells += m.cells; st.stepMs += m.ms; st.steps++;
  st.queued = m.queued; st.parked = m.parked;
  if (m.changes && m.changes.length) { _fluidBatch = m.changes; _fluidAt = 0; }
}
function _fluidWrite() {
  const b = _fluidBatch, t0 = performance.now(), areas = new Map();
  let n = 0;
  // land waiting near a player (streamBehind in chunks/chunks.js): the fluid's writes, each a chunk to mesh again, take less
  const lim = typeof streamBehind !== 'undefined' && streamBehind ? FLUID_BEHIND_SHARE : 1;
  const prevBulk = structBulkLight;
  fluidApplying = true;
  structBulkLight = true;                                // light once per area below, not once a cell
  try {
    while (_fluidAt < b.length && n < FLUID_WRITE_MAX * lim) {
      const x = b[_fluidAt], y = b[_fluidAt + 1], z = b[_fluidAt + 2], was = b[_fluidAt + 3], now = b[_fluidAt + 4];
      _fluidAt += 5; n++;
      if (getBlock(x, y, z) !== was) {                   // built over meanwhile: it looks again
        _fluidStat.rejected++;
        _fluidTouch.push(x, y, z, 0, x, y, z, 1);
        continue;
      }
      const wid = was & 255, nid = now & 255, fl = nid === B.WATER || nid === B.LAVA;
      if (fl && wid !== B.AIR && PROPS[wid]?.model === 'cross') _breakBillboard(x, y, z, wid);   // washed off, drops and all
      setBlock(x, y, z, now);
      _fluidStat.written++;
      // light to redo: lava's own where it came or went, sky where a cell turned to rock (water and air change none)
      const glow = wid === B.LAVA || nid === B.LAVA, sky = CORE.opaqueVal(was) !== CORE.opaqueVal(now);
      if (glow || sky) {
        const k = (x >> 4) + ',' + (z >> 4);
        let a = areas.get(k);
        if (!a) areas.set(k, a = { x0: x, x1: x, y0: y, y1: y, z0: z, z1: z, glow: false, sky: false });
        a.x0 = Math.min(a.x0, x); a.x1 = Math.max(a.x1, x); a.y0 = Math.min(a.y0, y); a.y1 = Math.max(a.y1, y);
        a.z0 = Math.min(a.z0, z); a.z1 = Math.max(a.z1, z);
        if (glow) a.glow = true;
        if (sky) a.sky = true;
      }
      if ((n & 31) === 0 && performance.now() - t0 > FLUID_WRITE_MS * lim) break;
    }
  } finally { fluidApplying = false; structBulkLight = prevBulk; }
  if (!prevBulk)
    for (const a of areas.values()) {
      if (a.sky) reskyAround(a.x0, 0, a.z0, a.x1, a.z1);
      if (a.glow || (a.sky && glowNear(a.x0, a.y0, a.z0))) relight(a.x0, a.y0, a.z0, a.x1, a.y1, a.z1);
    }
  if (_fluidAt >= b.length) { _fluidBatch = null; _fluidAt = 0; }
  _fluidStat.writeMs += performance.now() - t0;
}

// F3 (paintDebugHud, 22): the last second's figures, rolled once a second
function _fluidStatRoll() {
  const st = _fluidStat, now = performance.now();
  if (!st.t0) st.t0 = now;
  const span = (now - st.t0) / 1000;
  if (span < 1) return;
  const left = _fluidBatch ? (_fluidBatch.length - _fluidAt) / 5 : 0;
  st.line = `fluids ${_fluidW ? 'thread' : 'main'} &middot; queued ${st.queued} (out of range ${st.parked}) &middot; ` +
    `${Math.round(st.cells / span)} cells/s &middot; ${Math.round(st.written / span)} writes/s` +
    (st.rejected ? ` (${st.rejected} built over)` : '') + (left ? ` &middot; ${left} to write` : '') + '<br>' +
    `fluid step ${(st.stepMs / Math.max(1, st.steps)).toFixed(2)} ms ${_fluidW ? 'in its thread' : 'here'} x${Math.round(st.steps / span)}/s` +
    ` &middot; writing ${(st.writeMs / span).toFixed(1)} ms/s here`;
  st.cells = st.written = st.rejected = st.stepMs = st.writeMs = st.steps = 0;
  st.t0 = now;
}
const fluidDebugLine = () => (FLUID_FLOW && !menuScene ? _fluidStat.line : '');

fluidThreadStart();
