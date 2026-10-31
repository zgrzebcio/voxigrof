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
const GAME_VERSION = '0.8538';   // the golden gauntlets' and the book's item pictures   // 0.8527: cracked looks: adobe, obsidian, each sandstone and its brick (T 498-505)   // 0.8526: dirt coarse and frozen; mossy sulfur, thatch, red and pink sandstone brick, every planks' mossy brick (T 485-497)   // 0.8525: more mossy looks: adobe, terracotta roof, cobblestone brick, sandstone brick, dirt (T 480-484)   // 0.852: the jungle's vine and its half-cut look (T 478-479)   // 0.8517: the bone block's polished look (T 477)   // 0.8516: every planks' brick look (T 470-476)   // 0.8515: looks: adobe circle, terracotta soot brick, carved bone, carved sulfur, carved thatch, thatch brick (T 464-469); the bone bricks' and thatch's pictures moved   // 0.8511: the sulfur bricks' picture moved (Decorations/Sulfur)   // 0.851: the wrench's picture   // 0.85: jungle wood, its sapling and the cocoa pod (T 453-463); cocoa beans' and powder's pictures   // 0.8485: the carrot's growth stages (T 446-452)   // 0.8484: the lock pick's and the jam sandwich's pictures   // 0.8481: the seashell block's front and back, its art moved to Decorations/Seashell   // 0.848: the pearl's and the fur's pictures   // 0.84778: new wheat art, berry stages 4-5 redrawn and the ripe seventh   // 0.84774: the rime sapling (the cherry sapling's art in blue)   // 0.84762: the bone ash block (the ash block's art in white)   // 0.8476: the seashell block, the cobweb's three looks (moved to Billboards/cobweb)   // 0.8475: the coconut: its block art (and its green look), the coconut and half coconut   // 0.8472: the flint pebble's model art, the seashell   // 0.84701: a one-block sandy band   // 0.847: sandy dirt   // 0.84692: snow, ice and glassy sand looks in a cell's bits   // 0.84691: looks in a cell's bits: every look's icon is drawn anew   // 0.8469: carved looks, terracotta roof, thatch, obsidian brick; cobblestone art moved   // 0.8465: the leather strip   // 0.8463: the bronze armor's pictures   // 0.8461: the acacia sapling, the short grass, the acacia chest's colour   // 0.846: acacia wood, the Savanna's golden grass, the chitin plate   // 0.8455: the chest art in four sheets, the metal chest   // 0.8411: the Dryland's pale grass and dry leaves   // 0.84: palm wood, palm sapling, dry grass, tall dry grass, dry bush   // 0.836: rime wood tiles   // 0.835492: water art's lines softened   // 0.835491: fast flow and fall water tiles   // 0.835: packed ice   // 0.8342: bed in four tinted part sheets   // 0.8341: torch glow overlays, torches in their own folder   // 0.834: fire, unlit and crystal torches, spent glow blocks   // 0.833: ice, snow and bone bricks, bone block   // 0.8321: ice, snow moved to Winter   // 0.829: sugar cane stages and column pieces   // 0.8273: ripe wheat from wheat_stage6   // 0.827: every berry bush's own six stages   // 0.8241: glassy sands   // 0.823: warm and cold grass   // 0.822: pink sand, sandstone looks   // 0.821: one sheet per mushroom, yellow and grilled mushrooms   // 0.8191: ash block   // 0.81: wheat growth stages
// blackberry bush art
// blackberries icon, pumpkin pie art
// item textures moved (containers, powders, raw ores)
// glow masks for light sources
// textures moved, animated fluids, built grass sides and gem ores, band/pillar
// mushroom models, trees moved, sand sides, adobe, glass looks, salt, cantaloupe
// texture array, furnace/bench/chest variants, dolomite
// earlier bumps: 0.808: 128px art, moved furnace/bench/chest   // 0.807: stripped log files renamed   // 0.804: the blinking TNT's own top   // 0.801: the furnace's open top   // 0.7943 brick textures; 0.7945/0.7946 gem clusters; 0.7947 yellow berries: cached art must go
const CHUNK_X = 16, CHUNK_Y = 250, CHUNK_Z = 16;   // 250 tall since 0.8354 (200 before; CY in 02 must match)
const WORLD_TOP = CHUNK_Y - 1;            // the highest y a block can be at
const WATER_Y = 99;                       // top water surface fills up to this y
const DEFAULT_VIEW_DIST = 10;             // in chunks (radius)
let   viewDist = clampi(parseInt(localStorage.getItem('vg_dist')) || DEFAULT_VIEW_DIST, 8, 32);
/* ---- two chunk radii ----
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
/* Water and lava flow: OFF for now, it lagged too much. Fluids stay exactly where they are put: a bucket
   places one still block, breaking beside water opens no flow, and nothing is queued (queueWaterAt / queueLavaAt,
   22-main-loop.js). True brings the old flow back.
   back on, rebuilt: its own thread with shared memory, finite (falling water is never a source), the world's own
   loose water flows too (fluids/fluids.js, the rules makeFluidSim in fluids/rules.js). False stills every fluid again. */
const FLUID_FLOW = true;
/* The fixed simulation tick. The world's clockwork — the day clock, furnaces,
   saplings, grass spreading and growing, berries, wheat, mushrooms, cane, the weather on the ground, ice melting,
   lights burning out, leaf decay, snow melt, litter, fluids, TNT — steps SIM_HZ times a real second whatever the frame
   rate (simTick, 22-main-loop.js), so it runs at the same speed at 15 fps or 144. The players (movement, vitals),
   creatures, drops and everything drawn still step once a frame on the frame's time, now capped at FRAME_DT_MAX
   (0.05 before: under 20 fps all of it ran in slow motion; now only under 10). A gap over SIM_MAX_FRAME (a hidden tab, a
   long hitch) is dropped, not caught up: the world waits while you are away. SIM_FIXED false: all of it once a frame,
   as before 0.8378. */
const SIM_FIXED = true, SIM_HZ = 20, SIM_DT = 1 / SIM_HZ, SIM_MAX_FRAME = 0.5, SIM_MAX_STEPS = 10, FRAME_DT_MAX = 0.1;
/* How often the lists of things placed in the world (doors, chests, beds, pet tags, bench tags) look over all of
   them: their land still in, their cell still them, their light. Between passes only what moves is stepped. */
const LIST_PASS_S = 0.25;
/* How dark it gets (a fifth lighter in caves and at night). SKY_FLOOR is the share of daylight a face with no
   sky light still shows (a cave, deep shade; 0.276 before, 0.24 before 0.8242): the chunk shader (04) and everything
   lit to match it (doors 27, creatures 28, beds 29, chests 30) read it here. NIGHT_LIGHTEN scales the night's ambient
   light and the moon's (07-sky.js); the day is as it was.
   half as light again as 0.8441 had it (0.414 and 1.5; 0.8442's 0.331 and 1.2 were real but too small a step to
   see: the cave floor went from 10% of daylight to 12%, and is 15% now). The two multiply in a cave at night. */
const SKY_FLOOR_0843 = 0.414, NIGHT_LIGHTEN_0843 = 1.5;
/* A cave's floor: a quarter of the way from 0.414 to full daylight (0.56), then 30% darker (CAVE_DARKEN: 0.39), so a cave
   wants a torch again. The night's light a quarter more than 0843's (1.875: its ambient 0.32, the day's is 0.368). Cloud
   shadows are half as dark (CLOUD_SHADOW_MUL, 04-materials.js). */
const CAVE_DARKEN = 0.7;
const SKY_FLOOR = (SKY_FLOOR_0843 + (1 - SKY_FLOOR_0843) * 0.25) * CAVE_DARKEN, NIGHT_LIGHTEN = NIGHT_LIGHTEN_0843 * 1.25;
/* Raw mouse for looking around (17-input.js): the pointer lock asks for the mouse's own movement, without the
   system's pointer acceleration, which made fast strokes (the ones a low frame rate draws out of you) turn further than
   slow ones. Falls back to the ordinary lock where the browser has none. false = the ordinary lock, as before.
   A setting since 0.8443: Options > Gameplay "Raw mouse input" (on unless switched off; applySettings, 17-input.js). */
let rawMouse = (() => { try { return localStorage.getItem('vg_rawmouse') !== 'off'; } catch { return true; } })();
// the wrong-tool hint beside the crosshair (ui/hud.js updateWrongToolHint; Options > Gameplay, vg_wrongtool)
let wrongToolHint = (() => { try { return localStorage.getItem('vg_wrongtool') !== 'off'; } catch { return true; } })();
// Arachnophobia: no spiders on cobwebs or from under pebbles (49-particles.js; Options > Gameplay, vg_arachno)
let arachnophobia = (() => { try { return localStorage.getItem('vg_arachno') === 'on'; } catch { return false; } })();
/* Work handed to the worker threads. SEASON_WORKER_SCAN: a chunk's hourly season
   pass gets its list of cells worth a look from a worker instead of walking all of the chunk (seasons/seasons.js).
   LIGHT_WORKER: a new chunk's own sky light is worked out in the worker as it is made (09-light-sky.js). */
const SEASON_WORKER_SCAN = true, LIGHT_WORKER = true;
/* SAVE_WORKER: an autosave hands the world to a worker of its own, which puts it in the same shape and writes
   it to IndexedDB (16-worlds.js); the player's edits go across as flat number arrays, cheap to hand over. */
const SAVE_WORKER = true;
/* CHUNK_CACHE: getChunk remembers the chunks it found in a small table (chunks/chunks.js), so a
   block, light or sky read no longer builds a "cx,cz" string and searches the chunk Map every time. */
const CHUNK_CACHE = true;
/* CREATURE_FAR_SLOW: a calm creature over ENT_FAR_R blocks from every player thinks every
   4th tick (28); MESH_REUSE: a remeshed chunk's new data is written into its old buffers when it fits (11). */
const CREATURE_FAR_SLOW = true, MESH_REUSE = true;
/* 0.8386.
   SHARED_MEMORY (C10): when the page is cross-origin isolated (coi-sw.js gives GitHub Pages and serve.ps1 the headers),
   a chunk's cells, sky and block light live in SharedArrayBuffers: the workers read them where they are, nothing is
   copied for a mesh job, a season scan or a light job. SHARED_OK says whether it is really on this time.
   LIGHT_THREAD (C9, needs SHARED_OK): block light floods (an edit, a held torch, a chunk arriving near a light) run in a
   light worker of their own (08), the main thread only gathers the sources and remeshes what changed.
   FAR_REGIONS (C8): settled far chunks (level of detail 2) are drawn 4x4 to a mesh (chunks/chunks.js), far fewer draw calls. */
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
/* ---- the far ring ----
   FAR_RING more chunks are always built and drawn past the render distance, cheaply: at the lowest level of
   detail (a 2x2x2 downsample, no small things), with no creatures shown and no simulation, and the fog pushed out
   over them. The world reads as reaching further than the full-detail radius the machine is set to carry.
   The title backdrop has it too since 0.8194. `drawDist()` is how far chunks are drawn; `viewDist` stays the full-detail setting. */
const FAR_RING = 4;
const drawDist = () => viewDist + FAR_RING;
/* ---- split screen ----
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
// chunk-space range test. playerCX/CZ live in chunks/chunks.js and are read at call time.
function inSimRangeChunk(cx, cz) {
  const r = simDist();
  return chunkDist2ToPlayers(cx, cz) <= r * r;
}
const inSimRange = (x, z) => inSimRangeChunk(Math.floor(x / 16), Math.floor(z / 16));
/* How split screen divides the window: 'h' stacks the views (a horizontal dividing line, player
   one on top), 'v' puts them side by side. Only two- and three-player layouts can honour it —
   four is a 2x2 grid whichever way you slice it. */
let   splitDir = localStorage.getItem('vg_splitdir') === 'v' ? 'v' : 'h';
/* The frame cap, 0 = as fast as the screen. A player who never chose one starts at 60: a 120-144 Hz screen drawn at its
   full rate heats the machine for little. The title, the pause menu, an open inventory and a window without focus are
   capped lower still (frameCap, 22-main-loop.js). */
let   fpsLimit = (() => { const s = localStorage.getItem('vg_fps'); return s == null ? 60 : clampi(parseInt(s) || 0, 0, 240); })();
let   sens = clampi(parseInt(localStorage.getItem('vg_sens')) || 100, 10, 400) / 100;  // look sensitivity
let   rafHz = 120;                          // display refresh rate, measured at boot
