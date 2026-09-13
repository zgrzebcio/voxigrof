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
const GAME_VERSION = '0.76';
const CHUNK_X = 16, CHUNK_Y = 200, CHUNK_Z = 16;
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
let   simRadius = clampi(parseInt(localStorage.getItem('vg_sim')) || DEFAULT_SIM_DIST,
                         SIM_DIST_MIN, SIM_DIST_MAX);
/* Never larger than the render distance — simulating chunks that do not exist is meaningless,
   so lowering render distance quietly clamps the effective simulation radius with it. */
const simDist = () => Math.max(SIM_DIST_MIN, Math.min(simRadius, viewDist));
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
