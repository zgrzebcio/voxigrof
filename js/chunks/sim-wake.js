'use strict';
/* chunks/sim-wake.js: waking the world round a player. Land that comes into simulation range is scanned in slices
   for what should already be happening there (falling blocks, leaves to decay). */

/* ---- simulation wake-up ----
   Fluids and gravity blocks are EVENT driven: a cell only ever moves because something queued it,
   and the only things that queue are setBlock and a neighbour's own tick. Terrain straight out of
   the generator has never been queued by anything — which is why a generated lava pool sat inert
   until an unrelated edit nearby happened to poke it (the light update that seemed to trigger it
   was incidental; ANY setBlock would have done), and why a snow carpet whose support a cave had
   eaten hung in the air.

   So the simulation radius seeds it. A chunk entering the radius is scanned once and every cell
   that could plausibly move is handed to the right queue; normal per-cell scheduling takes over
   from there.

   PERFORMANCE. The scan is 64 000 cells (250 tall since 0.8354) per chunk, far too much for one frame, so it is a
   RESUMABLE CURSOR: `_wake` holds the chunk and the y-layer reached, and each frame spends a
   fixed cell budget wherever it left off. Three things keep the per-cell cost near zero:
     - the id is classified by one Uint8Array lookup, so stone/dirt/air reject immediately;
     - neighbour reads go straight to the chunk's own array, using getBlock only on the four
       border columns;
     - settled sea water is never queued at all (see _WAKE_KIND).
   A full radius-6 region wakes in a few seconds, spread evenly, with no visible hitch. */
const _simWoken = new Set();              // "cx,cz" already scanned this session
let _wake = null;                         // resumable cursor: { cx, cz, d, y }
const WAKE_CELLS_PER_FRAME = 20000;       // ~2.5 frames per chunk at 60fps
/* 0 = never moves on its own, 2 = falls under gravity. One lookup replaces a chain of comparisons
   on the hot path, and the table is what makes a 20k-cell slice cost ~0.1ms.

   Only CARPETS are woken — snow and leaf litter, which is the "flying snow" case the seeding
   exists to fix. It is cheap (a carpet is not opaque, so removing one costs no sky relight) and
   self-limiting: the carpet falls once, lands, and is done.

   Two things are deliberately NOT woken:

   - Sand and gravel. The world is full of gravel lying over cave roofs; collapsing all of it the
     moment a chunk enters the radius cost ~4ms per block in sky relighting and rearranged terrain
     nobody asked to have rearranged.

   - Fluids. Waking generated lava does not make it settle into place — it makes it OSCILLATE.
     A woken cell flows outward, the new flowing cell fails the "still fed" test on its next tick
     and dries back, which re-seeds the neighbour that spawned it, and round it goes. Measured at
     ~30 lava writes and ~30 air writes a second forever, with the queue pinned at ~180 and never
     draining. Lava emits light 15, so every one of those writes re-floods light across several
     chunks: ~900 chunk re-meshes a second and roughly half the frame rate, while standing still.
     The oscillation is a fault in the fluid tick's feed rules, not in the seeding, and fixing it
     belongs to that code — see the note at the end of this response.

   Either kind still behaves exactly as it always has once you disturb it yourself: setBlock
   queues the neighbours, and the normal per-cell scheduling takes over. */
// 3 = falls only while it is a layer stack: a full sand block or leaf block is not woken
const _WAKE_KIND = new Uint8Array(256);
{
  for (let id = 0; id < 256; id++) {
    if (PROPS[id]?.model === 'carpet') _WAKE_KIND[id] = 2;
    if (PROPS[id]?.layerStack) _WAKE_KIND[id] = 3;
  }
}
function clearSimWake() { _simWoken.clear(); _wake = null; _wakeIdle = false; }
// a chunk that just (re)arrived must be scanned again, whatever it did last time
function simWakeInvalidate(cx, cz) {
  _simWoken.delete(cx + ',' + cz);
  _wakeIdle = false;                                               // there is work again
  if (_wake && _wake.cx === cx && _wake.cz === cz) _wake = null;   // cursor's array is stale
}

/* Once every chunk in range is seeded, the ring search below finds nothing — but it still walks
   the whole radius to prove it, every single frame, forever. `_wakeIdle` latches that result and
   is cleared by the only two things that can invalidate it: crossing a chunk border, and a chunk
   arriving (simWakeInvalidate). Standing still therefore costs nothing at all. */
let _wakeIdle = false, _wakeIdleKey = '';
// the latch key must name EVERY player's chunk — one of them moving is new work
const _wakeKey = () => PLAYER_CHUNKS.map(p => p[0] + ',' + p[1]).join(';');
// pick the nearest un-woken loaded chunk inside the radius; false when there is nothing to do
function _beginNextWake() {
  const wk = _wakeKey();
  if (_wakeIdle && _wakeIdleKey === wk) return false;
  const r = simDist();
  for (let ring = 0; ring <= r; ring++)
    for (const pc of PLAYER_CHUNKS)
      for (let dz = -ring; dz <= ring; dz++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;      // ring shell only
          if (dx * dx + dz * dz > r * r) continue;
          const cx = pc[0] + dx, cz = pc[1] + dz;
          if (_simWoken.has(cx + ',' + cz)) continue;
          const c = getChunk(cx, cz);
          if (!c || !c.data) continue;                  // not streamed in yet — try again later
          _wake = { cx, cz, d: c.data, y: 1 };
          return true;
        }
  _wakeIdle = true; _wakeIdleKey = wk;
  return false;
}
// scan up to `budget` cells of the current chunk; returns how many were actually spent
function _scanWakeSlice(budget) {
  const w = _wake, d = w.d, wx0 = w.cx * 16, wz0 = w.cz * 16;
  // the chunk may have unloaded (or been rebuilt) since the cursor was opened
  const c = getChunk(w.cx, w.cz);
  if (!c || c.data !== d) { _wake = null; return budget; }
  const openAt = (lx, y, lz) => {
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && y >= 0 && y < CHUNK_Y)
      return _fallOpen(d[lx + (lz << 4) + (y << 8)] & 255);
    return _fallOpen(getBlock(wx0 + lx, y, wz0 + lz) & 255);
  };
  let used = 0;
  while (w.y < CHUNK_Y && used < budget) {
    const base = w.y << 8;
    for (let i = 0; i < 256; i++) {
      const raw = d[base + i], id = raw & 255;
      /* Emitters first. Registering is idempotent — a Set add — and it is the insurance that
         makes the re-light below actually have something to pour: a torch inside a structure
         stamped while the chunk was out of range is in the world but may never have reached
         glowLights, and unregistered emitters are exactly why those torches sat dark. */
      if (EMITTER_ID[id] && blockLightOf(raw) > 0)
        glowAdd(wx0 + (i & 15), w.y, wz0 + ((i >> 4) & 15));
      const wk = _WAKE_KIND[id];
      if (!wk || (wk === 3 && !CORE.layerCount(raw))) continue;
      const lx = i & 15, lz = (i >> 4) & 15;
      if (openAt(lx, w.y - 1, lz)) scheduleFall(wx0 + lx, w.y, wz0 + lz);
    }
    used += 256;
    w.y++;
  }
  if (w.y >= CHUNK_Y) {
    /* Chunk fully scanned: every emitter in it is registered, so pour block light in now. This is
       the step that lights a structure's torches — chunk load already tried, but at the time the
       chunk was outside the simulation radius and relightForChunk correctly declined.

       Then RE-MESH the neighbourhood, which is the part that actually makes it visible.
       propagateLight only writes into the light arrays; it marks nothing dirty, because its other
       caller (relight) marks the affected box itself and its remaining caller (chunk load) runs
       before the chunk has ever been meshed. Here the chunks are already on screen with stale
       vertex light, so without this the torch data says 15 and the picture stays black — which is
       exactly what you were looking at. A source reaches GLOW_LEVEL blocks, under one chunk, so
       the 3x3 ring around the woken chunk is the full blast radius. */
    relightForChunk(w.cx, w.cz);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = getChunk(w.cx + dx, w.cz + dz);
        if (n && n.data) markDirty(n);
      }
    _simWoken.add(w.cx + ',' + w.cz);
    _wake = null;
  }
  return used;
}
function updateSimWake() {
  if (menuScene || !player.spawned) return;
  let budget = WAKE_CELLS_PER_FRAME;
  while (budget > 0) {
    if (!_wake && !_beginNextWake()) return;       // nothing left in range to seed
    budget -= _scanWakeSlice(budget);
  }
}
