'use strict';
/* chunks/dirty.js: asking for a re-mesh. markDirty (a player's edit goes ahead of everything), remeshAllChunks,
   and whether a glow source is near. */

// is any glowstone within light range of (x,y,z)? (so opaque edits there re-shadow correctly)
// is any light close enough to reach (x, y, z)? LIGHT_REACH, the brightest emitter's reach
function glowNear(x, y, z) {
  let hit = false;
  forEachGlowNear(x, z, LIGHT_REACH, (gx, gy, gz) => {
    if (Math.abs(gx - x) <= LIGHT_REACH && Math.abs(gy - y) <= LIGHT_REACH && Math.abs(gz - z) <= LIGHT_REACH) {
      hit = true;
      return false;                       // found one — stop walking
    }
  });
  if (hit) return true;
  for (const g of _plyGlows)
    if (g && Math.abs(g[0]-x) <= LIGHT_REACH && Math.abs(g[1]-y) <= LIGHT_REACH && Math.abs(g[2]-z) <= LIGHT_REACH) return true;
  return false;
}
// every drawn chunk meshed again, nearest first: a setting the mesher reads changed (fast leaves)
function remeshAllChunks() {
  for (const c of chunks.values()) {
    if (!c.data || !c.lit) continue;
    if (c.meshing) { c.dirty = true; continue; }
    if (c.meshes.some(Boolean)) tryQueueMesh(c, chunkDist2ToPlayers(c.cx, c.cz));
  }
  pump();
}
/* 0.8447, a player's edit seen at once (with pump's fast lane and the worker's):
     - it does not wait for a mesh of this chunk that is ALREADY out. That one was asked for before the edit, usually
       as an ordinary job deep in a worker's queue, and the edit used to sit behind it: the block you broke stayed
       drawn, or the hole where you built showed, until it came back. Now a new job goes out over it (`meshOut` counts
       the jobs out; the old one's answer is a stale revision and is dropped);
     - what follows the edit on this chunk for EDIT_FOLLOW_MS — the light coming back from its thread, a neighbour's
       border — is the same edit still settling, and is rushed the same way. */
const EDIT_FOLLOW_MS = 1500;
function markDirty(c) {
  if (!c || !c.data) return;
  const now = performance.now(), byPlayer = editRushing && now - _playerEditAt < PLAYER_EDIT_MS;
  if (byPlayer) c.editAt = now;
  if (editRushing || now - (c.editAt || -1e9) < EDIT_FOLLOW_MS) c.editRush = true;   // applied grouped with its siblings
  if (c.meshing) {
    c.dirty = true;
    // the edit itself goes out at once; its follow-ups only over a job that has been out a while (an old, slow one)
    if (c.editRush && (byPlayer || now - (c.meshSentAt || 0) > RUSH_OVER_MS)) _rushOver(c);
  } else tryQueueMesh(c, 0, true);
}
const RUSH_OVER_MS = 120;
// queue a rushed mesh of a chunk that is still meshing: pump's fast lane sends it over the job already out
function _rushOver(c) {
  if (!c.lit || c.queuedMesh || !neighborsReady(c)) return;
  c.queuedMesh = true;
  meshQueue.unshift({ cx: c.cx, cz: c.cz, d2: 0 });
}
