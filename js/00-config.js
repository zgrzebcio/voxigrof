'use strict';
/* voxiGrof — shared constants + persisted settings (loads first) */

/* The game was voxiCraft until 0.7593, and every stored key carried a vc_ prefix; it is vg_ now. Runs
   before anything below reads storage. Each key is copied, and only then is the old one removed; a key
   too big to copy while the old one still takes space is swapped instead (removed, written, and put
   back if the write still fails), so nothing is ever lost. A vg_ key that already exists is newer and
   wins. Worlds kept in IndexedDB are copied across in 16-worlds.js. */
(() => {
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('vc_')) old.push(k);
    }
    for (const k of old) {
      const nk = 'vg_' + k.slice(3), v = localStorage.getItem(k);
      try {
        if (localStorage.getItem(nk) == null) {
          try { localStorage.setItem(nk, v); }
          catch { localStorage.removeItem(k); try { localStorage.setItem(nk, v); } catch { localStorage.setItem(k, v); continue; } }
        }
        localStorage.removeItem(k);
      } catch {}
    }
  } catch {}
})();

function clampi(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ---------------------------------- configuration ---------------------------------- */
/* Stamped onto worlds at create + each load, and it also KEYS THE ASSET CACHES (see 03-atlas.js),
   so bumping it discards a stale stitched atlas — which is how 0.7291's darkened-blocks fix
   reaches anyone who already has one cached. */
const GAME_VERSION = '0.836';     // 0.836: rime wood tiles   // 0.835492: water art's lines softened   // 0.835491: fast flow and fall water tiles   // 0.835: packed ice   // 0.8342: bed in four tinted part sheets   // 0.8341: torch glow overlays, torches in their own folder   // 0.834: fire, unlit and crystal torches, spent glow blocks   // 0.833: ice, snow and bone bricks, bone block   // 0.8321: ice, snow moved to Winter   // 0.829: sugar cane stages and column pieces   // 0.8273: ripe wheat from wheat_stage6   // 0.827: every berry bush's own six stages   // 0.8241: glassy sands   // 0.823: warm and cold grass   // 0.822: pink sand, sandstone looks   // 0.821: one sheet per mushroom, yellow and grilled mushrooms   // 0.8191: ash block   // 0.81: wheat growth stages
// 0.80991: blackberry bush art
// 0.8099: blackberries icon, pumpkin pie art
// 0.8098: item textures moved (containers, powders, raw ores)
// 0.8094: glow masks for light sources
// 0.8093: textures moved, animated fluids, built grass sides and gem ores, band/pillar
// 0.8091: mushroom models, trees moved, sand sides, adobe, glass looks, salt, cantaloupe
// 0.809: texture array, furnace/bench/chest variants, dolomite
// earlier bumps: 0.808: 128px art, moved furnace/bench/chest   // 0.807: stripped log files renamed   // 0.804: the blinking TNT's own top   // 0.801: the furnace's open top   // 0.7943 brick textures; 0.7945/0.7946 gem clusters; 0.7947 yellow berries: cached art must go
const CHUNK_X = 16, CHUNK_Y = 250, CHUNK_Z = 16;   // 250 tall since 0.8354 (200 before; CY in 02 must match)
const WORLD_TOP = CHUNK_Y - 1;            // the highest y a block can be at (0.8354)
const WATER_Y = 99;                       // top water surface fills up to this y
const DEFAULT_VIEW_DIST = 10;             // in chunks (radius)
let   viewDist = clampi(parseInt(localStorage.getItem('vg_dist')) || DEFAULT_VIEW_DIST, 8, 32);
/* ---- two chunk radii (0.712) ----
   `viewDist` is the GENERATION/render radius: how far chunks are built, meshed and drawn. It is
   a graphics setting and people push it high.

   `simDist` is the SIMULATION radius, and it is deliberately much smaller and capped. Only
   chunks inside it tick: entity AI, fluid flow, gravity blocks, falling leaves, litter rot, snow
   melt, berry regrowth. Everything outside is drawn but frozen — a pause, never a cancellation:
   queued work stays queued and resumes the moment the player comes back within range.

   This is what stops render distance from being a simulation-cost multiplier. At dist 32 the old
   code was flowing water and stepping mobs across ~4000 chunks; now it is ~110 whatever the
   render distance says. */
const SIM_DIST_MIN = 2, SIM_DIST_MAX = 16;
const DEFAULT_SIM_DIST = 6;
/* Water and lava flow (0.8245): OFF for now, it lagged too much. Fluids stay exactly where they are put: a bucket
   places one still block, breaking beside water opens no flow, and nothing is queued (queueWaterAt / queueLavaAt,
   22-main-loop.js). True brings the old flow back. */
const FLUID_FLOW = false;
/* The fixed simulation tick (0.8378, MultithreadPlan.md part A1). The world's clockwork — the day clock, furnaces,
   saplings, grass spreading and growing, berries, wheat, mushrooms, cane, the weather on the ground, ice melting,
   lights burning out, leaf decay, snow melt, litter, fluids, TNT — steps SIM_HZ times a real second whatever the frame
   rate (simTick, 22-main-loop.js), so it runs at the same speed at 15 fps or 144. The players (movement, vitals),
   creatures, drops and everything drawn still step once a frame on the frame's time, now capped at FRAME_DT_MAX
   (0.05 before: under 20 fps all of it ran in slow motion; now only under 10). A gap over SIM_MAX_FRAME (a hidden tab, a
   long hitch) is dropped, not caught up: the world waits while you are away. SIM_FIXED false: all of it once a frame,
   as before 0.8378. */
const SIM_FIXED = true, SIM_HZ = 20, SIM_DT = 1 / SIM_HZ, SIM_MAX_FRAME = 0.5, SIM_MAX_STEPS = 10, FRAME_DT_MAX = 0.1;
/* Work handed to the worker threads (MultithreadPlan.md part B). SEASON_WORKER_SCAN (0.8382): a chunk's hourly season
   pass gets its list of cells worth a look from a worker instead of walking all of the chunk (51-seasons.js).
   LIGHT_WORKER (0.8383): a new chunk's own sky light is worked out in the worker as it is made (09-light-sky.js). */
const SEASON_WORKER_SCAN = true, LIGHT_WORKER = true;
/* SAVE_WORKER (0.8384): an autosave hands the world to a worker of its own, which puts it in the same shape and writes
   it to IndexedDB (16-worlds.js); the player's edits go across as flat number arrays, cheap to hand over. */
const SAVE_WORKER = true;
/* CHUNK_CACHE (0.83851, MultithreadPlan C2): getChunk remembers the chunks it found in a small table (11-chunks.js), so a
   block, light or sky read no longer builds a "cx,cz" string and searches the chunk Map every time. */
const CHUNK_CACHE = true;
/* 0.83852 (MultithreadPlan C3, C6): CREATURE_FAR_SLOW: a calm creature over ENT_FAR_R blocks from every player thinks every
   4th tick (28); MESH_REUSE: a remeshed chunk's new data is written into its old buffers when it fits (11). */
const CREATURE_FAR_SLOW = true, MESH_REUSE = true;
/* 0.8386 (MultithreadPlan C8-C10).
   SHARED_MEMORY (C10): when the page is cross-origin isolated (coi-sw.js gives GitHub Pages and serve.ps1 the headers),
   a chunk's cells, sky and block light live in SharedArrayBuffers: the workers read them where they are, nothing is
   copied for a mesh job, a season scan or a light job. SHARED_OK says whether it is really on this time.
   LIGHT_THREAD (C9, needs SHARED_OK): block light floods (an edit, a held torch, a chunk arriving near a light) run in a
   light worker of their own (08), the main thread only gathers the sources and remeshes what changed.
   FAR_REGIONS (C8): settled far chunks (level of detail 2) are drawn 4x4 to a mesh (11), far fewer draw calls. */
const SHARED_MEMORY = true, LIGHT_THREAD = true, FAR_REGIONS = true;
const SHARED_OK = SHARED_MEMORY && !!globalThis.crossOriginIsolated && typeof SharedArrayBuffer === 'function';
// a new typed array, in shared memory when it is on
function newSharedArr(Ctor, n) { return SHARED_OK ? new Ctor(new SharedArrayBuffer(n * Ctor.BYTES_PER_ELEMENT)) : new Ctor(n); }
// the same cells moved into shared memory when it is on (one copy), else the array itself
function shareArr(a) {
  if (!SHARED_OK || !a || a.buffer instanceof SharedArrayBuffer) return a;
  const s = newSharedArr(a.constructor, a.length);
  s.set(a);
  return s;
}
let   simRadius = clampi(parseInt(localStorage.getItem('vg_sim')) || DEFAULT_SIM_DIST,
                         SIM_DIST_MIN, SIM_DIST_MAX);
/* Never larger than the render distance — simulating chunks that do not exist is meaningless,
   so lowering render distance quietly clamps the effective simulation radius with it. */
const simDist = () => Math.max(SIM_DIST_MIN, Math.min(simRadius, viewDist));
/* ---- the far ring (0.8193) ----
   FAR_RING more chunks are always built and drawn past the render distance, cheaply: at the lowest level of
   detail (a 2x2x2 downsample, no small things), with no creatures shown and no simulation, and the fog pushed out
   over them. The world reads as reaching further than the full-detail radius the machine is set to carry.
   The title backdrop has it too since 0.8194. `drawDist()` is how far chunks are drawn; `viewDist` stays the full-detail setting. */
const FAR_RING = 4;
const drawDist = () => viewDist + FAR_RING;
/* ---- split screen (0.72) ----
   Every radius in the game is measured from "the player". With up to four of them on one screen
   the honest question is always "how far is the NEAREST player", so that is what this answers.
   `PLAYER_CHUNKS` holds one [cx, cz] pair per active player and is rewritten by 36-splitscreen.js
   as they move; entry 0 is player one and mirrors playerCX/playerCZ, which is why single player
   behaves exactly as it did before. */
const PLAYER_CHUNKS = [[1e9, 1e9]];
function chunkDist2ToPlayers(cx, cz) {
  let best = Infinity;
  for (let i = 0; i < PLAYER_CHUNKS.length; i++) {
    const p = PLAYER_CHUNKS[i];
    const dx = cx - p[0], dz = cz - p[1], d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}
// chunk-space range test. playerCX/CZ live in 11-chunks.js and are read at call time.
function inSimRangeChunk(cx, cz) {
  const r = simDist();
  return chunkDist2ToPlayers(cx, cz) <= r * r;
}
const inSimRange = (x, z) => inSimRangeChunk(Math.floor(x / 16), Math.floor(z / 16));
/* How split screen divides the window: 'h' stacks the views (a horizontal dividing line, player
   one on top), 'v' puts them side by side. Only two- and three-player layouts can honour it —
   four is a 2x2 grid whichever way you slice it. */
let   splitDir = localStorage.getItem('vg_splitdir') === 'v' ? 'v' : 'h';
let   fpsLimit = clampi(parseInt(localStorage.getItem('vg_fps')) || 0, 0, 240);   // 0 = uncapped
let   sens = clampi(parseInt(localStorage.getItem('vg_sens')) || 100, 10, 400) / 100;  // look sensitivity
let   rafHz = 120;                          // display refresh rate, measured at boot
