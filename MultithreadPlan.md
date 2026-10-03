# Multithreading and fixed-tick plan

Written for 0.8322. Nothing here is built yet. Use this plan when the user asks for multithreading or a frame-rate
independent game, and read the "Open questions" first.

## Goals

1. **The game runs at the same speed at any FPS.** Vitals, stats, effects, spoiling, growth, furnaces, drops,
   mobs, fire, weather on the ground, ice, the world clock: a real second is a real second at 10 fps or 144 fps.
   Only drawing, input feel and visuals follow the frame rate.
2. **Heavy work leaves the main thread.** Chunk finishing, lighting and season scans should not drop frames.

## How it works today (found in the code)

- **The dt cap.** `frame()` in 22-main-loop.js does `dt = Math.min(0.05, realDt)`. Below 20 fps the whole game runs
  in slow motion: at 10 fps the clock, vitals, furnaces, mobs and growth all run at half speed. This is the main
  reason low FPS "makes the game run different".
- **Order inside one frame:**
  - `pollInputCapture`, `updatePauseRespawn`
  - world updates while not on the title: felling, litter, snow melt, berries, `updateSeasons` (wheat, mushrooms,
    cane, weather on the ground, ice), grass grow, structure placing, falling leaves, storms
  - per seat, `useSlot(i); tickPlayer(dt)`: input, movement, mining, eating, `updateVitals` → `tickStats`,
    `tickSpoilage`, quests, hand
  - `runWorldTick`: chunk streaming, `processGenFinish` and `applyMeshResults` (with a time deadline), then the
    simulation (falling blocks, drops, projectiles, leaf decay, arrows, fluids, entities, TNT, saplings, grass
    spread, hollow-log mushrooms, furnaces, doors, bed, chests, bench displays, particles), then the equipment
    preview and `updateDayNight(dt)`, which moves the world clock
- **Four timing styles are mixed:**
  - plain `dt` (most systems)
  - 1-second accumulators: spoiling `SPOIL_STEP`, weather ground `WXG_TICK`, ice melt, cane, mushrooms, wheat, melt
  - `performance.now()`: 21 uses in 13 files. Some are only visual (fog easing in 52, the crackle watchdog in 26);
    each gameplay use must be checked.
  - per-frame budgets: `SEASON_SCANS_PER_FRAME`, `SEASON_OPS_PER_FRAME`, `FX_SPAWN_BUDGET`, the genFinish and mesh
    counts and deadlines
- **Workers today** (10-workers.js): 2-4 Workers built from `BIOME_CORE` + `VOXEL_CORE` + `WORKER_MAIN` (a blob
  URL). They take `gen` and `mesh` jobs, with transferable buffers both ways. `mainGen` is a main-thread twin for
  `biomeAt`, `climateAt` and `heightAt`.
- **Still on the main thread:** all lighting (08/09: `relight`, `reskyAround`, `seedSkyForChunk`,
  `relightForChunk`); the finish pass per chunk (the 102,400-cell emitter scan, `iceDressChunk`, structures, mob
  rolls); the season pass (a full 65k-cell scan per chunk in `_seasonChunk` and `_shroomChunk`); entity AI;
  particle collision.
- **No shared memory.** `.claude/serve.ps1` sends no COOP/COEP headers, so `crossOriginIsolated` is false and
  SharedArrayBuffer cannot be used. three.js loads from cdn.jsdelivr.net through an import map, so COEP would also
  need that CDN to send CORP/CORS, or three.js to be copied into the repo.
- **Split screen** works by swapping globals (`useSlot`, `PSTATE`, `SWAP_KEYS` in 36). Player code reads `player`,
  `HOTBAR`, `invSlots`… as globals. That makes moving player simulation into a worker very costly; keep player
  simulation on the main thread.

## Part A: fixed simulation tick (do first, no threads needed)

This is the biggest correctness win, and it does not depend on workers.

**Design**

- `SIM_HZ` (20 suggested), `SIM_DT = 1 / SIM_HZ`. In `frame()`:
  ```js
  simAcc += Math.min(realDt, SIM_MAX_FRAME);          // e.g. 0.5 s: past that, catch up in bulk (below)
  let steps = 0;
  while (simAcc >= SIM_DT && steps < SIM_MAX_STEPS) { simTick(SIM_DT); simAcc -= SIM_DT; steps++; }
  const alpha = simAcc / SIM_DT;                       // for interpolating what is drawn
  ```
- **A long stall** (a hidden tab, a hitch over `SIM_MAX_FRAME`) uses a bulk catch-up for slow systems, the way
  `furnaceCatchUp` (26) and the chest spoil clock (44) already work. Ticks are never run one by one for minutes.
- **Per frame (render rate):**
  - input polling, mouse look and camera
  - visual easing: fog, clouds, sky colours, rainbow
  - particles update, HUD painting, hand animation, sound volumes
  - chunk streaming, gen finish and mesh upload (keep their real-time deadlines)
  - equipment preview
- **Per tick (fixed rate):**
  - player vitals (`updateVitals` / `tickStats`), effects, spoiling, eating and drinking timers, mining progress
  - entities (AI and physics), drops, arrows and projectiles, falling blocks, fluids, TNT, fire
  - furnaces, saplings, grass spread, leaf decay, the season pass and growth, weather on the ground, ice
  - the world clock: the `worldTime` advance moves out of `updateDayNight`; the sky only draws from it
- **Player movement (needs a decision, see Q2).** Either keep it per frame with the real dt (cap raised to about
  0.1), or move it into the tick and interpolate the camera.
- **Interpolation.** Entities and drops keep their previous and current positions; models are placed at the lerp
  by `alpha`. Without this, mobs judder at high FPS.
- **Input edges.** Presses are caught per frame and consumed per tick as "pressed since the last tick" flags: jump,
  attack, use, toggles. Today `edge()` and the `prevOnGround` / `jumped` checks in `tickStats` assume one tick per
  frame.
- **Budgets.** Per-frame gameplay budgets (`SEASON_*_PER_FRAME`, the FX spawn budget) become per tick, rescaled.
- **Gameplay must not read `performance.now()`.** Use a sim clock (`simTime += SIM_DT` in `simTick`); visuals may
  keep the real clock.
- **Split screen.** `simTick` loops the seats with `useSlot` exactly as `frame()` does now.
- **Flag.** `SIM_FIXED` in 00-config, so the old per-frame path can be switched back while testing.

**How to verify (only when the user asks for a play-test):**

- Debug overlay (F3): sim Hz, ticks this frame, `simAcc`.
- Use the existing `fpsLimit` setting at 15, 30, 60 and 144. Each of these must take the same real time at every
  setting:
  - draining a full stamina bar while sprinting
  - one furnace smelt
  - one in-game day
  - food spoiling one item
  - a sapling growing
- Port 8408/8409 only.

## Part B: workers (multithreading)

**Two ways to share work:**

- **B-copy (no shared memory).** Job messages with copied or transferred buffers. The main thread stays the owner
  of the world. Works on any host. Recommended first.
- **B-shared (SharedArrayBuffer).** Chunk data in shared buffers, so workers read the world without copies.
  - Needs COOP/COEP headers on every host, and three.js self-hosted or CORP-enabled.
  - Writes stay on the main thread; workers read only, and a chunk version number guards stale results.
  - Later, only if the user's hosting allows it (Q4).

**A full simulation worker** (the world and entities owned by a worker, the main thread only draws) is not
recommended. It is a near rewrite, because of the global-swapping split screen.

**Candidates, best gain for the least risk first:**

| # | Job | Today | Plan | Risk |
|---|---|---|---|---|
| 1 | Chunk finish scans: emitter scan, `iceDressChunk`, title `seasonDressChunk` | main, per arriving chunk | done in the gen worker, which returns the emitter list and the dressed data. Edits are applied on main after; dress must still follow edits (send edits with the gen job, or re-check only edited columns on main) | low |
| 2 | Chunk light: `seedSkyForChunk`, `relightForChunk` | main BFS | worker computes the chunk's own sky and block light at gen time; main only fixes the borders with neighbours | medium |
| 3 | Season pass scans: `_seasonChunk`, `_shroomChunk`, `_iceChunk`, `_snowlineChunk` | main, a 65k-cell loop per chunk-hour | worker gets the chunk data (copy) + date + seed and returns a list of changes; main applies them as setBlocks within the per-tick budget | low-medium (about 400 KB copied per chunk; fine at a few chunks a second) |
| 4 | Village planning (`_planVillage` Dijkstra, 34) | main | worker | low |
| 5 | Save: `JSON.stringify` of a world, compression | main | worker (structured clone in, string or blob out) | low |
| 6 | Entity AI targeting and pathing (28) | main | needs world reads: B-shared, or a small cached height/solid map sent per region | high |
| 7 | Particle physics (49) | main | worker with B-shared, or keep (already cheap after the `_fxBlock` cache) | low priority |
| 8 | Meshing | worker | already threaded: tune the worker count (`WORKER_COUNT` = 2-4 now), priorities, LOD | — |

**Rules for any worker code**

- Self-contained like `VOXEL_CORE`: no main-thread globals. Build it as another stringified core, or extend
  `WORKER_MAIN` with new job types.
- Send plain data only, never live `player`, entity or chunk objects. Results carry the chunk revision; drop them if
  stale.
- Hash-based systems (`sHash`, `hash3`) give the same answer in a worker when given the seed.
- Saves stay compatible. Every step gets a version, a flag in 00-config (e.g. `WORKER_LIGHT`) and a before/after
  FPS measurement.

## Audit list: look for these before coding

- `Math.min(0.05` and other dt caps.
- `performance.now()` / `Date.now()` in gameplay code (21 uses of `performance.now()` across 13 files today).
- `_PER_FRAME` constants and per-frame counters.
- Per-frame edge detection: `edge(`, `prevOnGround`, `jumped`, `wantPlace`, placement and mining repeat timers.
- `_hpLast` damage diffing in `updateVitals` (19): it must diff per tick, not per frame.
- DOM or HUD work inside sim functions (`paintVitals`, `buildEquipPanel`, the feed) runs extra times when one frame
  holds several ticks. Mark it dirty in the tick and paint once per frame.
- Sounds and particles fired inside the sim: check footsteps and hit sounds don't double on multi-tick frames.
- `setInterval` / `setTimeout` used for gameplay.
- Systems paused by `inSimRange` or by an unloaded chunk: decide what catch-up they get (as furnaces and chests have
  now).
- Anything reading `worldTime` and expecting it to move only in `updateDayNight`.

## Phases (each its own version)

1. **A1.** Sim clock + accumulator + `simTick` wrapper around the existing world updates, flag `SIM_FIXED`. Nothing
   else changes.
2. **A2.** Move the player vitals, spoiling and eating timers into the tick; input edges become tick flags.
3. **A3.** Interpolate entity and drop models; decide player movement (Q2).
4. **A4.** Bulk catch-up for long stalls (world clock, furnaces, growth), the way `furnaceCatchUp` works.
5. **B1.** Chunk finish scans into the gen worker.
6. **B2.** Season pass into a worker (change lists).
7. **B3.** Chunk lighting in the worker.
8. **Later.** Village planning and save serialization in a worker; consider B-shared if hosting allows.

**Done means:** the fpsLimit test in Part A matches at every setting, no frame over about 20 ms while flying across
new terrain on the user's PC, and saves from before still load.

## Open questions for the user (ask before starting)

1. **Tick rate.** 20 Hz (Minecraft-like, cheapest), 30, or 60?
2. **Player movement.** Keep it per frame (smoothest, already uses dt) or move it into the fixed tick with an
   interpolated camera?
3. **A minimized tab or a huge freeze.** Should the world catch up at full speed when you come back (bulk
   catch-up), or pause while the tab is hidden (as it effectively does now, since requestAnimationFrame stops)?
4. **Hosting.** Is the game only run locally through `serve.ps1`, or also hosted somewhere? Can that host send
   COOP/COEP headers? Is it fine to copy three.js into the repo instead of the CDN? (This is only needed for
   shared memory, B-shared.)
5. **Weakest device.** A phone? This decides the worker count and the per-tick budgets.
6. **Order.** Part A first (game speed independent of FPS), then the workers (smoother FPS)? Or the reverse?
7. **Mob jitter.** Is it acceptable for mobs to move at the tick rate with interpolation (a small visual delay of
   one tick)?
