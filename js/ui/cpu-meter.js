'use strict';
/* js/ui/cpu-meter.js: the processor meter on the F3 screen. How much of a second the page spends working (its frames,
   and its handling of the workers' answers) and how much each worker does, as a share of one core.

   Counted only while F3 is shown (`_perfOn`, fluids/current.js; the parts' timings are 22-main-loop.js'): the page's
   frames by _perfFrameEnd, the answers by the workers' onmessage handlers (10-workers.js, the light thread in
   08-light-glow.js, the fluid thread in fluids/fluids.js), each worker's own time by the `bz` its messages carry
   (chunks/worker.js). The line is made once a second by _perfFrameStart. cpuMeterSnapshot gives the running totals,
   for measuring a scene over a longer time (plans/CpuPlan.md, P0). */

const CPU_METER = {
  frameMs: 0, msgMs: 0, frames: 0,       // the page: in frame(), in the workers' answers, frames counted
  parts: new Map(),                      // perfLap's parts, summed (they are per second in _perfAcc)
  workers: new Map(),                    // label -> the busy total its last message carried
  kinds: new Map(),                      // label -> its busy totals by kind of job (gen, mesh, lbox...)
  last: null, lastT: 0, line: '',
};
const cpuNoteFrame = (ms) => { CPU_METER.frameMs += ms; CPU_METER.frames++; };
const cpuNoteMsg = (ms) => { CPU_METER.msgMs += ms; };
const cpuNotePart = (name, ms) => { CPU_METER.parts.set(name, (CPU_METER.parts.get(name) || 0) + ms); };
// a worker's message: its running busy totals, all and by kind of job (chunks/worker.js), kept under its label
function cpuNoteWorker(label, bz, bzk) {
  if (typeof bz === 'number') CPU_METER.workers.set(label, bz);
  if (bzk && typeof bzk === 'object') CPU_METER.kinds.set(label, bzk);
}
// the running totals now
function cpuMeterSnapshot() {
  const kinds = new Map();
  for (const [k, v] of CPU_METER.kinds) kinds.set(k, { ...v });
  return { t: performance.now(), frameMs: CPU_METER.frameMs, msgMs: CPU_METER.msgMs, frames: CPU_METER.frames,
           parts: new Map(CPU_METER.parts), workers: new Map(CPU_METER.workers), kinds };
}
// what was done between two snapshots, as shares of one core (0..1) and ms a frame; `kinds`: the workers' time by job kind, summed
function cpuMeterDiff(a, b) {
  const span = Math.max(1, b.t - a.t), frames = Math.max(1, b.frames - a.frames);
  const workers = {};
  for (const [k, v] of b.workers) workers[k] = (v - (a.workers.get(k) || 0)) / span;
  const kinds = {};
  for (const [w, by] of b.kinds) {
    const was = a.kinds.get(w) || {};
    for (const [k, v] of Object.entries(by)) kinds[k] = (kinds[k] || 0) + (v - (was[k] || 0)) / span;
  }
  const parts = {};
  for (const [k, v] of b.parts) parts[k] = (v - (a.parts.get(k) || 0)) / frames;
  return { seconds: span / 1000, fps: (b.frames - a.frames) / (span / 1000),
           frames: (b.frameMs - a.frameMs) / span, answers: (b.msgMs - a.msgMs) / span,
           frameMs: (b.frameMs - a.frameMs) / frames, workers, kinds, parts };
}
// once a second, from _perfFrameStart: the line for the F3 screen
function cpuMeterRoll() {
  const now = cpuMeterSnapshot(), prev = CPU_METER.last;
  CPU_METER.last = now;
  if (!prev) return (CPU_METER.line = '');
  const d = cpuMeterDiff(prev, now), pc = (x) => Math.round(x * 100);
  const pool = Object.keys(d.workers).filter(k => k[0] === 'w').sort().map(k => pc(d.workers[k]));
  const side = ['light', 'fluid'].filter(k => k in d.workers).map(k => `${k} ${pc(d.workers[k])}%`);
  CPU_METER.line = `cpu: page ${pc(d.frames + d.answers)}% (frames ${pc(d.frames)}%, answers ${pc(d.answers)}%)` +
    (pool.length ? ` &middot; workers ${pool.join(' ')}%` : '') + (side.length ? ` &middot; ${side.join(' &middot; ')}` : '');
  return CPU_METER.line;
}
