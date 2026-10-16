'use strict';
/* chunks/chunks.js: the chunk table. The loaded chunks and their saved edits, the list of light sources, getChunk
   (answered from a small table: any change to `chunks` must call _chunkCacheClear), ensureChunk, level of detail by
   distance, the load and unload queues, and a chunk mesh's geometry (refilled in place).
   The rest of the chunk pipeline: stream.js (generate, mesh, apply), block-access.js (getBlock, setBlock),
   far-regions.js, fades.js, layer-stacks.js, dirty.js, sim-wake.js. The worker side: voxel-core.js, worker.js. */

/* ================================================================================================
   CHUNK MANAGER
   ================================================================================================ */
const chunks = new Map();      // "cx,cz" -> chunk record
const editStore = new Map();   // "cx,cz" -> Map(voxelIndex -> value): edits survive unload/reload
/* ---- light sources ----
   `glowLights` is the flat set of every emitter in loaded space. It used to be queried by scanning
   the WHOLE set and `split(',')`-ing each key — from setBlock (via glowNear), from relight, and
   once per chunk load. In a world with lava that set holds thousands of entries, so every block
   edit and every chunk arrival was doing thousands of string splits. That was the single largest
   contributor to the chunk-streaming stutter.

   `glowByChunk` indexes the same data by chunk column and stores decoded coordinates, so a query
   visits only the 3x3 chunks a light could possibly reach from and never parses a string. Both
   structures are maintained together — always go through glowAdd / glowDel / glowClear. */
const glowLights = new Set();  // "x,y,z" of every active emitter
const glowByChunk = new Map(); // "cx,cz" -> Map("x,y,z" -> [x, y, z])

const _glowChunkKey = (x, z) => Math.floor(x / 16) + ',' + Math.floor(z / 16);
function glowAdd(x, y, z) {
  const k = x + ',' + y + ',' + z;
  if (glowLights.has(k)) return;
  glowLights.add(k);
  const ck = _glowChunkKey(x, z);
  let m = glowByChunk.get(ck);
  if (!m) glowByChunk.set(ck, m = new Map());
  m.set(k, [x, y, z]);
}
function glowDel(x, y, z) {
  const k = x + ',' + y + ',' + z;
  if (!glowLights.delete(k)) return;
  const ck = _glowChunkKey(x, z);
  const m = glowByChunk.get(ck);
  if (m) { m.delete(k); if (!m.size) glowByChunk.delete(ck); }
}
function glowClear() { glowLights.clear(); glowByChunk.clear(); }

/* Visit every emitter whose column lies within `r` blocks of (x, z). Callers still do their own
   Y and exact-distance tests; this only narrows the candidate set. */
function forEachGlowNear(x, z, r, fn) {
  const cx0 = Math.floor((x - r) / 16), cx1 = Math.floor((x + r) / 16);
  const cz0 = Math.floor((z - r) / 16), cz1 = Math.floor((z + r) / 16);
  for (let cz = cz0; cz <= cz1; cz++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const m = glowByChunk.get(cx + ',' + cz);
      if (!m) continue;
      for (const p of m.values()) if (fn(p[0], p[1], p[2]) === false) return;
    }
}
const genQueue = [];           // {cx, cz, d2}
const meshQueue = [];
const meshResults = [];        // finished meshes waiting for capped main-thread upload
const key = (cx, cz) => cx + ',' + cz;
const CHUNK_AREA = CHUNK_X * CHUNK_Z;

/* The chunk table (CHUNK_CACHE). getBlock, getLightWorld, getSkyWorld and the rest all
   come through getChunk, thousands of times a frame, and each call built a "cx,cz" string and searched `chunks`. An 8x8
   table by the low 3 bits of cx and cz keeps the last chunk found (or not found) per slot, so reads around one place
   cost two compares. EVERY change to `chunks` (set, delete, clear) must call `_chunkCacheClear()`. */
const _ccX = new Int32Array(64).fill(0x7fffffff), _ccZ = new Int32Array(64), _ccC = new Array(64).fill(undefined);
function _chunkCacheClear() { _ccX.fill(0x7fffffff); _ccC.fill(undefined); }
function getChunk(cx, cz) {
  if (!CHUNK_CACHE) return chunks.get(key(cx, cz));
  const i = (cx & 7) | ((cz & 7) << 3);
  if (_ccX[i] === cx && _ccZ[i] === cz) return _ccC[i];
  const c = chunks.get(key(cx, cz));
  _ccX[i] = cx; _ccZ[i] = cz; _ccC[i] = c;
  return c;
}
function ensureChunk(cx, cz) {
  let c = getChunk(cx, cz);
  if (!c) {
    c = { cx, cz, data: null, light: null, generating: false, meshing: false, queuedMesh: false,
          dirty: false, lit: false, rev: 0, meshes: [null, null, null] };
    chunks.set(key(cx, cz), c);
    _chunkCacheClear();                     // it was remembered as missing
  }
  return c;
}

let playerCX = 1e9, playerCZ = 1e9;

/* LEVEL OF DETAIL (the meshing side is in chunks/voxel-core.js). From half the render distance a chunk
   is meshed without its small things, from three quarters at half resolution. `cur` is the level it has
   now: to LOSE detail it has to be LOD_PAD past the line, so walking along a boundary does not remesh the
   same chunks back and forth; gaining detail happens at the line itself. */
const LOD_PAD = 0.75;
function chunkLod(d2, cur = 0) {
  const d = Math.sqrt(d2), a = viewDist * 0.5, b = viewDist * 0.75;   // the far ring past viewDist is always 2
  /* The title backdrop: its view distance is only 5, so the usual steps put all but the nearest few chunks
     at a level with no grass or flowers and coarse trees. It is one still view: full detail out to its view
     distance, the far ring coarse. */
  if (typeof menuScene !== 'undefined' && menuScene) return d >= viewDist ? 2 : 0;
  const past = (edge, lvl) => d >= edge + (lvl > cur ? LOD_PAD : 0);
  return past(b, 2) ? 2 : past(a, 1) ? 1 : 0;
}

// rebuild the load/mesh/unload sets — runs when the player crosses a chunk border,
// the view distance changes, or the world resets
function rebuildQueues() {
  // entry 0 IS player one; 36-splitscreen.js owns entries 1..3
  PLAYER_CHUNKS[0][0] = playerCX; PLAYER_CHUNKS[0][1] = playerCZ;
  genQueue.length = 0;
  meshQueue.length = 0;
  const R = drawDist(), RG = R + 1;         // the far ring too
  const requeue = [];                       // chunks that were awaiting a (re-)mesh
  const lodChange = [];                     // drawn chunks whose level of detail moved

  /* Distances are to the NEAREST player. With split screen the loaded set is the union of
     every player's ring, so a chunk only unloads once it is out of range of all of them — and the
     queue priority a chunk gets is whichever player is closest to it. */
  for (const [k, c] of chunks) {
    if (c.queuedMesh) { c.queuedMesh = false; requeue.push(c); }  // queue was just cleared
    const d2 = chunkDist2ToPlayers(c.cx, c.cz);
    if (d2 > (R + 2) * (R + 2)) {           // unload: dispose GPU resources, drop voxel data
      retireChunkMeshes(c);                 // ...after a short fade out
      chunks.delete(k);                     // (edits are kept in editStore)
      _chunkCacheClear();                   // 0.83851
      lightForget(c.cx, c.cz);              // 0.8386
      if (typeof fluidForget === 'function') fluidForget(c.cx, c.cz);   // 0.844
    } else if (d2 > R * R) {
      retireChunkMeshes(c);                 // data ring beyond render radius: keep data only (fading out)
    } else if ((c.meshes[0] || c.meshes[1] || c.meshes[2] || c.meshes[3]) && chunkLod(d2, c.lod | 0) !== (c.lod | 0)) {
      if (c.meshing) c.dirty = true; else lodChange.push([c, d2]);
    }
  }
  const seen = PLAYER_CHUNKS.length > 1 ? new Set() : null;   // rings overlap only in split screen
  for (const pc of PLAYER_CHUNKS) {
    for (let dz = -RG; dz <= RG; dz++) {
      for (let dx = -RG; dx <= RG; dx++) {
        if (dx * dx + dz * dz > RG * RG) continue;
        const cx = pc[0] + dx, cz = pc[1] + dz;
        if (seen) { const sk = key(cx, cz); if (seen.has(sk)) continue; seen.add(sk); }
        const d2 = chunkDist2ToPlayers(cx, cz);      // priority follows the closest player
        const c = ensureChunk(cx, cz);
        if (!c.data && !c.generating) genQueue.push({ cx, cz, d2 });
        else if (c.data && d2 <= R * R && !c.meshes[0] && !c.meshes[1] && !c.meshes[2] && !c.meshes[3]) tryQueueMesh(c, d2);
      }
    }
  }
  for (const [c, d2] of lodChange) tryQueueMesh(c, d2);   // far work, so it sorts behind what is near
  genQueue.sort((a, b) => a.d2 - b.d2);
  meshQueue.sort((a, b) => a.d2 - b.d2);
  /* What was waiting for a mesh goes back in. A player's edit still goes to the front; everything else takes its
     place by distance. (All of it used to go to the front, in no order: each time a player crossed into a new chunk,
     far chunks waiting for their first mesh were built ahead of the near ones, which stayed holes.) */
  for (const c of requeue) {
    if (!chunks.has(key(c.cx, c.cz))) continue;
    if (c.editRush) tryQueueMesh(c, 0, true);
    else tryQueueMesh(c, chunkDist2ToPlayers(c.cx, c.cz));
  }
  pump();
}

function disposeChunkMeshes(c) {
  _regionTouch(c);                          // 0.8386
  for (let i = 0; i < 5; i++) _disposeChunkMesh(c, i);   // five passes since 0.8263 (glass)
}
function _disposeChunkMesh(c, i) {
  if (!c.meshes[i]) return;
  _fadeDrop(c.meshes[i]);                   // a remesh mid-fade: the new meshes carry the fade on
  scene.remove(c.meshes[i]);
  c.meshes[i].geometry.dispose();           // materials/texture are shared — never disposed
  c.meshes[i] = null;
}

/* Chunk geometry reuse (MESH_REUSE). A remesh (every block edit, a light change, a level
   of detail step) threw the chunk's five geometries away and built new ones: new GPU buffers and new JS objects each
   time. Now a pass whose new data fits its old buffers is copied into them (`_meshRefill`): only the used part goes to
   the GPU and only that part is drawn (drawRange). A remesh from a player's edit (`rush`) that does not fit gets new
   buffers with room to spare (MESH_ROOM), since more edits usually follow. Much smaller data (under MESH_SHRINK of the
   room) gets new, smaller buffers instead, so a chunk going far does not keep its near-detail memory. */
const MESH_ROOM = 1.25, MESH_ROOM_ADD = 96, MESH_SHRINK = 0.4;
const _MESH_ATTRS = [['position', 'pos'], ['uv', 'uv'], ['tile', 'tile'], ['shade', 'shade'],
                     ['blockLight', 'lite'], ['clim', 'clim'], ['dark', 'dark']];
function _meshGeometry(p, room) {
  const nv = p.pos.length / 3, ni = p.index.length;
  const cv = room ? Math.ceil(nv * MESH_ROOM) + MESH_ROOM_ADD : nv;
  const ci = room ? Math.ceil(ni * MESH_ROOM) + MESH_ROOM_ADD * 2 : ni;
  const fit = (a, n) => { if (a.length === n) return a; const b = new a.constructor(n); b.set(a); return b; };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fit(p.pos, cv * 3), 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(fit(p.uv, cv * 2), 2));
  geo.setAttribute('tile',     new THREE.BufferAttribute(fit(p.tile, cv), 1, false));
  geo.setAttribute('shade',    new THREE.BufferAttribute(fit(p.shade, cv), 1, true));
  geo.setAttribute('blockLight', new THREE.BufferAttribute(fit(p.lite, cv), 1, false));
  geo.setAttribute('clim',     new THREE.BufferAttribute(fit(p.clim, cv), 1, true));   // grass and water climate colour
  if (p.dark) geo.setAttribute('dark', new THREE.BufferAttribute(fit(p.dark, cv), 1, true));   // a water surface's depth shade
  geo.setIndex(new THREE.BufferAttribute(fit(p.index, ci), 1));
  geo.setDrawRange(0, ni);
  geo.userData.nv = nv;                     // vertices in use (the far regions copy only these)
  return geo;
}
function _meshRefill(geo, p) {
  if (!MESH_REUSE) return false;
  const ix = geo.index, pa = geo.attributes.position;
  if (!ix || !pa || !!geo.attributes.dark !== !!p.dark) return false;
  const nv = p.pos.length / 3, ni = p.index.length;
  if (nv > pa.count || ni > ix.count || ni < ix.count * MESH_SHRINK) return false;
  if (ix.array.constructor !== p.index.constructor) return false;
  for (const [name, k] of _MESH_ATTRS) {
    const a = geo.attributes[name];
    if (a && (!p[k] || a.array.constructor !== p[k].constructor || p[k].length > a.array.length)) return false;
  }
  const put = (a, src) => {
    a.array.set(src);
    a.clearUpdateRanges(); a.addUpdateRange(0, src.length);   // only the used part goes to the GPU
    a.needsUpdate = true;
  };
  for (const [name, k] of _MESH_ATTRS) if (geo.attributes[name]) put(geo.attributes[name], p[k]);
  put(ix, p.index);
  geo.setDrawRange(0, ni);
  geo.userData.nv = nv;
  return true;
}
