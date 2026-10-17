# voxiGrof — notes for Claude

A voxel survival game in the browser: plain JavaScript and three.js, with no build step. `index.html`
loads about 200 ordinary scripts, so they all share one scope. THE ORDER OF THE SCRIPT TAGS IS THE LOAD ORDER.

## How the files are laid out (since the split after 0.8451)
- **Folders by thing** in `js/`: `player/`, `entities/`, `items/`, `blocks/`, `shapes/`, `ui/`, `chunks/`,
  `worldgen/`, `biomes/`, `woods/`, `fluids/`, `seasons/`, `temperature/`. Files in folders have no number.
  The old flat files that were not split keep their number in `js/` (config, atlas, sky, light, workers, drops,
  worlds, input, structures, split screen...). Every file starts with a comment saying what it holds.
- **A new file needs a `<script defer>` tag in `index.html`**, placed after everything it uses WHILE LOADING
  (code outside functions) and before whatever uses it while loading. Then run
  `powershell -ExecutionPolicy Bypass -File toolsrc\check-scripts.ps1` (tags against files, brackets, names
  declared twice, the cores' parts, load order). `toolsrc` is ignored by git: recreate the script if it is gone.
- **The three worker cores are built from parts** (`js/core-parts.js` explains it; read it before touching
  them). `BIOME_CORE` (built in `biomes/biomes.js`), `BLOCK_CORE` (`blocks/blocks.js`) and `VOXEL_CORE`
  (`chunks/voxel-core.js`) run on the page AND as text in the workers. A file hands over a part with
  `corePart('name', function () {...})`; only the text inside the braces is used, glued in load order, and a
  block comment reading `@include name` pastes the parts of that name in. So a part file is NOT a function of
  its own: it uses the names of the function it is pasted into, it cannot touch the page (player, scene,
  THREE, DOM), and the order of a core's script tags is the order of its code. World generation draws its
  random numbers in a fixed order: moving such a line changes what a seed gives.
- **Creatures: the creature table** (`MOBS`, `entities/mobs.js`; its header lists every field). Each creature's
  file ends with its `defineMob(kind, {...})`: name, `group`, `body`, numbers (`hp` or `maxHp(e)`, `box`, `walk`,
  `flee`, `fleeTime`, `chase`, `reach`, `fallSafe`, `foot`, `sized`), `make` / `gendered` / `build`, where it
  lives (`herd` or `roll`), the save (`save`, `cols`, `load`) and drops (`loot`, `burnt`). Read it with
  `mobOf(e)`; `isGrazer`, `isFish`, `isNightMob`, `isAnimal`, `entMaxHp`, `entR` / `entH` all answer from it. NEVER
  add a per-kind list or an `e.kind === ...` chain for something the table can hold: add a field. An entry is read
  while its own file loads, so outside a function it may only name what that file or an earlier one declares
  (`LOOT` loads later: use it inside `loot` / `burnt` only). A new creature: its file, its tag in `index.html`, one
  entry; if no rule fits where it lives, give it a `roll` (it then rolls after the kinds in `CHUNK_ROLL_FIRST`,
  entities/spawning.js).
  **`summon(kind, x, y, z, opts)` is the ONE spawn body** (0.8453): it writes what every creature shares (place,
  timers, home, level, gender, health) and lays the kind's `make(opts, gender)` -> `{ model, scale, own, ready }`
  over it. There are no `spawnSheep`-style functions any more (only the boss keeps its own `spawn`); to change
  what one kind starts with, change its `make`. `buildEntity(kind, look)` gives the model alone.
- **Woods: the woods table** (`WOODS`, `woods/woods.js`; its header lists every field and who reads it), one file
  per wood beside it (`oak.js`, `birch.js`, `spruce.js`, `rime.js`, `palm.js`, `dry-bush.js`: their order in
  `index.html` is the order of every list). An entry: its blocks (`log`, `stripped`, `hollow`, `planks`, `leaves`,
  `sapling`), `tree`, `seasonal`, `apples`, `shroom`, `charcoalS`, `burn`, `xp`, `saplingOn`, `grow`. NEVER write
  a list of the woods' blocks by hand on the page: use `woodBlocks('planks')`, `woodBlocks('leaves', isTreeWood)`,
  `woodLogs('oak')`, `woodOf(id)`, `isSapling(id)`, `woodList()`. It is page only: the worker cores keep their own
  lists (a wood's PROPS, `_ALL_PLANKS` in blocks/looks.js, the leaf layers in shapes/shape-blocks.js, the trees in
  woods/gen-*.js), and a planks recipe is still appended by hand (its place is in the saves).
- **Worn art** (0.8453). An item's `wear` (items/items.js) names what is seen on a body, apart from armor: a
  belt's and a backpack's `<wear>_torso_overlay` laid on the torso (`WORN_TEXTURES` in 01-textures-data.js,
  `TORSO_OVERLAY` in player/armor-model.js: both pictures are the FRONT of the torso), a shield's `<wear>_front`
  and `<wear>_back` (40-shield.js), a backpack's model and sheet `Backpacks/<wear>.json` + `.png` (41-backpack.js:
  the JSON's boxes, turned half round because its body faces -Z and the game's +Z). Armor pictures by material:
  `EQUIP_MATS` (armorMat -> folder and file name, capitals as on disk).
- **Items: the item table** (0.8454). `items/items.js` holds every id (`ITEM`: an id is in the saves, never
  change one) and what each field of an entry is for; `ITEM_PROPS` is filled by one file per group, each one
  `defineItems('group', {...})`: `materials.js`, `tools.js`, `weapons.js`, `equipment.js`, `food.js`,
  `containers.js`, `useables.js`; `finish.js`, LAST, runs the passes over the whole table (tool wear x1.2, a
  hoe's and armor's wear, what food rots into). A new item: its id at the end of `ITEM`, its entry in its group's
  file, its picture in `ITEM_TEXTURES`. STEEL took the diamond tools' and armor's place, same numbers, SAME IDS
  (`ITEM.STEEL_PICKAXE` is 281): tier 5, the only pickaxe for obsidian. It has no recipe yet (as diamond had none).
- **Fluids: the fluids table** (0.8454). `FLUID` in `fluids/kinds.js`, one entry file per fluid (`water.js`,
  `lava.js`: `defineFluid(B.X, { name, step, max, delay, dry, meets })`), all parts of VOXEL_CORE, so page AND
  workers. `fluids/rules.js` (`makeFluidSim`) names no fluid: it reads the table, `meets` included (what two
  fluids do where they touch). The page reads it as `CORE.FLUID`. A new fluid is NOT only an entry: the header
  of kinds.js lists the four things (its block, its entry, how it is drawn, what the page does with it; the page
  still asks for `B.WATER` / `B.LAVA` by name in many places).
- **Land first** (0.8455, the list is in chunks/stream.js above `streamLandWaiting`). `streamBehind` = land is
  missing near a player (a chunk within 6 not made yet, or made and never drawn; finished chunks piling up).
  The chunk stream runs FIRST in the frame (`runChunkStream`, 22, before simTick) and takes a bigger slice
  while it holds; everything that can wait gives way and takes its pace back when the land is in: the slow
  background in simTick steps one tick in `STREAM_BG_EVERY` (`bg`), the season scans stop, fluids write a
  quarter and step every other tick, falling blocks a third, calm creatures past `ENT_FAR_R_BEHIND` think every
  4th tick. In a worker: a player's edit, then a mesh, then gen/prep, then scan/probe (`jobNext`,
  chunks/worker.js). A NEW background system that writes blocks must read `streamBehind` too. `rebuildQueues`
  puts waiting meshes back BY DISTANCE (only a player's edit goes to the front).
- **A player's hand before new land** (0.8456, the edit lane in chunks/stream.js above `_editLaneWorker`).
  `notePlayerEdit()` (tickPlayer: either button held, or E) marks the block changes a player makes; their re-mesh
  is a `rush`: pump sends it at once, the worker takes it before its other jobs, the page shows it on arrival. A
  worker in the middle of MAKING a chunk cannot take it, so each worker counts the chunks it has to make
  (`w.genOut`: `pump`, and the answers in 10-workers.js), a rush goes to the one with fewest (`_bestWorker`),
  and while a player works (and `EDIT_LANE_MS` after) one worker, the lane, is given no chunk to make. A new kind
  of long worker job must stay out of the lane; a new way for a player to change blocks must be covered by
  `notePlayerEdit`. 0.8457: pump hands its jobs out ONE AT A TIME, each to `_bestWorker(depth, skip)` (fewest
  chunks to make, then fewest jobs), so chunks are made side by side on every worker; never go back to filling one
  worker up to `depth` before the next (that made them one after another on one or two workers).
- **Making chunks fast** (0.8458; a worker makes a chunk 2.1x faster, land exactly the same).
  1. `genChunk` is all its parts glued into ONE function, too big for the browser to optimise: a loop written straight
     in it ran 10-40x slower. Every heavy pass is wrapped in `(() => { ... })();` (SPEED in worldgen/gen-chunk.js): a
     new pass with loops goes in one too, and what later parts read is declared outside the wrappers. (The mesher
     is not like that: wrapping its loops made it slower, it is left alone.)
  2. The column cache (worldgen/column-cache.js, `colGet` / `colPut`): the wet grid's five numbers of a column, kept,
     so terrainInfo runs about once a column instead of once per chunk round it. ONE table for all workers in shared
     memory (`cols` in the `init` message, made per world in `initWorkers`, 10-workers.js), each its own without.
     Only exact whole numbers go in. `makeGen(seed, type, rev, colBuf)`.
  3. Pacing (`_genThrottle`, chunks/stream.js): inside `viewDist` a chunk to make for every worker that may make one,
     plus one; the far ring keeps 2 at a time. A chunk's terrain-cache read comes before a worker is chosen
     (`_genFromCache`), and a chunk let go during the read gives its place back (it used to leak one for good).
  THE TRAP of 1: a name declared inside a wrapper is gone for the parts after it. `brownish` (worldgen/cave-floors.js)
  was, and every chunk with mushrooms on a fallen log failed in the worker; 244 hashed chunks never reached that line.
  Before wrapping a pass, search each name it declares at its top level in the parts after it.
  The first chunk in a new region still costs about a second in each worker: its rivers and lakes are traced
  (biomes/rivers-lakes.js, up to ~2,700 blocks round). Proving the land unchanged: hash chunks from fixed seeds before and
  after (the test page 8408 keeps 244 of them in localStorage `perf_baseline_8458`, several world kinds and revs).
- **Frames at 120 fps while land comes in** (0.8459).
  1. Shadow maps (07-sky.js, above `makeShadowRT`): drawing them is two more passes over every chunk near the players.
     They are drawn again only when something moved: the sun a `SHADOW_SUN_STEP` (4 a second high up, 8 and 16 low,
     in halvings only: a step that changed smoothly would start a new pair every frame), the players' middle out of its
     `SHADOW_SNAP` cell (~14 blocks), a player's edit (`shadowDirty`, at once), other new geometry (`shadowSoftDirty`,
     at most every `SHADOW_SOFT_MS`). A new pair is drawn over `SHADOW_SLICES` frames into the BACK pair (the scene's
     objects dealt out in turn, `_shadowSlice`) and swapped in whole with its matrix. Checked: the image is the same
     as with a pair drawn whole. The shadow camera is only placed for a pair being drawn: between pairs it is not where
     the shown pair was drawn from.
  2. The stream's counts and least slice are a 60 fps frame's share (`_slow` from 0.5, `_least`, runChunkStream in 22):
     the same land a second at any frame rate, never a whole 60 fps slice in an 8 ms frame.
  3. Workers: up to 8 on a machine of 12+ cores (`WORKER_COUNT`, 10-workers.js), 4 below.
  4. A worker's error names its job; a failed chunk to make gives its place back and is asked for again, twice at most;
     a failed mesh is counted off and asked for again (`onWorkerMessage`): before, each one left a job slot taken and a
     chunk "being made" for good.
  5. Crossing a chunk border (chunks/chunks.js above `rebuildQueues`): a STEP of one chunk (one player, the same view
     distance) only updates the queues (distances again, the new places of the load ring, the places new to the render
     distance); its walk over all the chunks (`_rqVisit`: let go, meshes let go, level of detail) is spread over the
     next frames (`_rqWalk`, `RQ_WALK_PER_FRAME`); the chunks let go go to the light and fluid threads as one list
     (`lightForgetMany`, `fluidForgetMany`). Anything else rebuilds it all. Since the queues are no longer rebuilt at
     every crossing, a chunk that drops out of them must be queued again where it drops (as the worker error does).
  6. Sim-wake (chunks/sim-wake.js) re-meshes the 3x3 round a woken chunk only when light was poured and there is no
     light thread (the thread's answer re-meshes what changed): it was nine meshes for every chunk coming into range.
  7. The terrain cache's list (`_terrainHave`, `terrainCacheIndex` from loadWorld, `terrainCacheAdded`): a chunk not
     in the cache is not read first. Reads of new land waited behind the writes of new land (median 0.36 s, up to 3 s,
     a job slot held all along): 8 chunks a second flying, 45 now.
  8. The fast generation lane reaches `viewDist + 1` (`_genThrottle`): a chunk at the edge of the render distance is
     meshed only when the four round it are made, and they were in the slow far-ring lane.
- **A new chunk's daylight** (0.8455, 09-light-sky.js). `propagateSky(q, touched, own)` floods only chunks that are
  `lit` (their own lighting pass has run, finishChunkGen) and `own`, the one being lit now. A chunk that has its
  cells but still waits in `genFinishQueue` takes NOTHING: at its own pass it pulls its lit neighbours' borders in
  (`_skyPullBorders`) and spreads its own out, and only border cells that can change something are seeded
  (`_skyCrosses`: a cell within one level of the light beside it cannot be raised). So a chunk is meshed only when
  its four neighbours are LIT (`neighborsReady`, chunks/stream.js). Before this each new chunk poured its sky into
  the open air of its waiting neighbours: 35-70 ms a chunk on the main thread, now about 1. Never let a flood into
  a chunk that is not lit, and never mesh beside one.
- **Checking in the browser pane** (only when the user asks). The pane's page is often hidden (`document.hidden`):
  the game then runs about ONE frame a second, so nothing can be judged by waiting. Drive it by hand instead:
  `runChunkStream(0.016)` in a loop until the queues are empty, `updateFluids(0.05)` for the fluids, yielding
  through a `MessageChannel` (timers are slowed too) so the workers' answers get in. Traps that look like bugs:
  water put down with plain `setBlock` never moves (the bucket also calls `queueWaterAt`), and nothing drops in
  creative (`player.canFly`). Light can be checked by numbers: across every border between two lit chunks no cell
  may be darker than the light beside it allows. To play it at 60 fps / 20 tps by hand: keep the real
  `requestAnimationFrame` in a window property first and put it back in a `finally` (a stub left behind kills the
  game's loop), and wake each frame from a small timer worker (`setInterval` posting every 16.67 ms) instead of
  spinning on MessageChannel: a spinning main thread starves the workers and every chunk number comes out wrong.
  GPU times from the pane are not to be trusted (the same render read 2.4 ms and then 58 ms minutes later): judge
  frames by the CPU time of their parts, and a GPU cost by one call between two `gl.finish()`. `renderer.render` is
  the renderer's OWN property in this three.js: wrap it by assigning and put the saved one back, never `delete` it.
- **Version numbers.** The steps after 0.845 are 0.8451 to 0.8455. They were first numbered 0.8501 to 0.8505 (the
  roadmap's 0.85 is the jungle), and the backup refs keep those names (`before-0.8504`, `at-0.8505`).
- **The grass colour** is `GRASS_RGB` at the top of 03-atlas.js: the grass block's top, the fringe on its side,
  the short grass and the tall grass are all grey art multiplied by it when the atlas is built (and by a warm, a
  cold and a dry one made from it). Change it, then bump `GAME_VERSION`.
- **Missing pictures**: `powershell -ExecutionPolicy Bypass -File toolsrc\check-textures.ps1` lists every picture
  the game asks for that is not on disk, capitals included (`-Unused`: what is on disk and used by nothing). Run
  it after moving or renaming art. A missing one is not only a blank icon: the item art is cached as one pack, and
  the pack is not stored while any picture of it fails, so every start fetches all of it again (03-atlas.js).
  The script copies the loops that build paths in the code: change both.
- **Still open from the tidy-up** (the plan files are gone; this is what was left of them). Worker code, to be
  done only in a step where a game test is allowed: one tree function per wood shared by the generator and the
  sapling (today `woods/saplings.js` copies the shapes), and a wood's blocks (PROPS, the plank and leaf lists
  in the block core) made from one entry. On the page: one `buildQuadruped` for the four-legged models, pets as
  one shared system (horse and hound: owner, follow, stances, feeding), a shared bear (art for brown and panda
  bears is waiting), a shared base for bosses before the second one. What the user has fixed in time (do not ask
  again): steel's recipe comes with steel at 0.91, milk as a fluid at 0.89, oil at 0.94.
- **Old notes**: a file number in the facts below that has no path (`(02)`, `in 54`) means the old flat file:
  02 = the voxel core (now `worldgen/`, `chunks/mesher*.js`, `fluids/rules.js`, `blocks/mining-rules.js`),
  11 = `chunks/`, 19 = `ui/vitals-hud.js` + `player/hazards.js` + `player/death.js`, 28 = `entities/`,
  33 = `woods/felling.js`, 47 = `player/quests.js`, 54 = `player/stats.js` + `player/effects.js` +
  `temperature/`, 55 = `biomes/`, 59 = `items/items.js`. Search for the name the note gives.

## Rules
- **Save credits.** Do not test in the browser unless the user asks for a test in that message. After
  edits do the static check only (`toolsrc\check-scripts.ps1`). Keep reports short: what changed, where, and
  anything open.
- **"answer only"** means answer the question. Do not change code.
- **Versions.** The user names the version (e.g. "0.793"). Bump `alpha X` in `index.html`. If
  `css/style.css` changed, also bump its `?v=` in `index.html`.
- **Comments.** A comment says what the code does NOW and why, in plain words, so that the user can find and
  follow it too. Do not tag comments with version numbers, and do not narrate what a value used to be; keep a
  line of history only when it warns of a trap someone would fall into again. A new file starts with a header
  comment: its path, what it holds, and where the rest of that thing lives.
- **Textures.** Never overwrite an existing texture. Keep the old one as `old_<name>.png`. Only draw
  a texture when asked to. When a block texture OR an item's picture changes (or moves), bump `GAME_VERSION`
  in `00-config.js`. It keys the cached atlas and the cached item art, so without the bump players keep seeing
  the old one. The user moves and renames art often: after it, run `toolsrc\check-textures.ps1` and point the
  code at the new places; never delete a picture yourself, say which ones are no longer used.
- **PowerShell variables ignore case.** `$h` and `$H` are the same variable, and `R` is an alias
  (Invoke-History), so don't name a helper function `R`. THIS HAS BITTEN: a clean-up kept its regex in `$T` and
  each file's text in `$t`, so the pattern became the file itself and 14 scripts were written back as garbage
  (0.8455; restored from the backup ref). So: name variables by what they hold (`$pattern`, `$text`), never by a
  single letter; and a script that rewrites more than one file runs FIRST as a dry run that prints what each
  changed line would become and writes nothing, then for real with a guard that skips a file whose size or line
  count moved more than the change explains.
- **Git: never commit or push.** The user commits. Asked if things are ready to commit: check, fix, report.
- **Backup before a big step.** Between commits, before a step that touches many files, save the tree as a ref: a temporary index (`$env:GIT_INDEX_FILE`), `git add -A`, `git write-tree`,
  `git commit-tree`, `git update-ref refs/backup/<name>`. It touches neither the branch nor the real index, and
  it is what the 14 files came back from. `git for-each-ref refs/backup` lists them.
- **Questions.** Ask when a design choice is really unclear (the user welcomes it). Otherwise make
  a sensible choice and say so in the report.
- **Test data.** Port 8407 holds the user's real profile and worlds. Never clear it. Test on the
  fresh ports 8408/8409 (`.claude/launch.json`, `.claude/serve.ps1`; both are in git, recreate them
  if they are missing).
- **Shell.** The Bash tool here has no coreutils (`ls`, `grep`, `tail` fail). Use PowerShell or the
  Grep/Glob/Read tools.
- **README.md.** Update it only when a player-facing feature changes, and keep it short.

## Code facts
- **Cells.** A cell is a Uint32: bits 0-7 hold the block id and bits 8-15 hold the variant (shape,
  rotation, log width, water level...).
- **Chisel shapes** are VARIANTS of the full block, never new ids: slab, stairs, pane, fence,
  carpet/layer, cover, wall. `SHAPE_BLOCKS` in shapes/shape-blocks.js lists which blocks support each shape.
- **Stacked layers.** Mixed carpet/layer stacks live in `LAYER_STACKS` (chunks/chunks.js), a sparse map
  per chunk.
- **The worker core.** `VOXEL_CORE` (built from parts in chunks/voxel-core.js, see above) is turned into a
  string and run inside the mesh/worldgen worker. It must not touch main-thread globals. Export through its
  `return {...}` (in chunks/voxel-core.js), then destructure from `CORE` on the main thread (same file).
- **Fixed tick (0.8378).** `SIM_FIXED`/`SIM_HZ` 20 (00-config): `simTick` (22) steps the
  world's clockwork (growth, furnaces, saplings, grass, leaf decay, fluids, TNT, the world clock `advanceWorldClock`)
  at a fixed rate; players, entities, drops, visuals stay per frame with dt capped at `FRAME_DT_MAX` 0.1. A new
  world-logic system with timers goes in `simTick`; anything drawn or budgeted per frame stays in frame().
  0.8379: each seat's `tickStats` and `tickSpoilage` run in simTick too (per seat, while `player._statsLive`);
  `updateVitals` (player/hazards.js) no longer calls tickStats when SIM_FIXED. 0.838: creatures too (`updateEntitiesTick`), drawn
  between ticks (`updateEntitiesFrame`); a ridden horse per frame. Anything that eases a model part from its own
  current transform is fine (the tick's pose is put back before each tick).
- **Worker jobs (0.8381-0.8383).** A `gen` reply carries `emit` (light emitter candidates)
  and `sky` (the chunk's own sky light); cached chunks go through job `prep`; season passes use job `scan`
  (`postScanJob` in 10). Flags `SEASON_WORKER_SCAN`, `LIGHT_WORKER` (00-config). Light rules must match between `skyOf`
  (WORKER_MAIN) and 09 (`propagateSky`/`seedSkyForChunk`); change both or neither.
  0.8384: autosaves go through a save worker (`SAVE_WORKER`, `SAVE_WORKER_SRC` in 16: a new top-level save field just
  works, it is cloned across; only `edits` is rebuilt there). Drops, projectiles and arrows step in simTick and are
  drawn between ticks (`_tickPoses`, 22).
- **Stacked drops (0.8385, 15-drops).** A drop record has `count`; `spawnDrop(..., life, count)` (10th arg) makes one drop
  of a stack (a thing that cannot stack, or a worn one with `dur`, falls as singles). Spilling a slot: pass `s.count`,
  never loop spawnDrop per item. Resting drops join (`_dropMerge`); change a count only through `_dropSetCount` (it
  re-dresses the 1-3 copies); pickup is `tryPickupMany` (returns how many it took). Save row field 13 = count.
- **F3 timings and chunk table (0.83851, Part C1/C2).** `perfLap(name, t)` / `perfNow()` (22) time frame and simTick parts
  while F3 is shown; wrap a new heavy system in a lap. `getChunk` (chunks/chunks.js) answers from an 8x8 table (`CHUNK_CACHE`); any
  change to the `chunks` Map MUST call `_chunkCacheClear()`, or reads see a stale or missing chunk.
- **Part C3-C6 (0.83852).** Far calm creatures step every 4th tick (`_entDue`, entities/update.js): in `updateEntities` the param is
  `dtAll` and `dt` is per creature, so new code there keeps using `dt`. Off-screen creature models are not posed per frame:
  never read a model part's transform for gameplay, use `e.x/y/z`. Render scale `applyRenderScale` (06). Chunk meshes are
  refilled in place (`_meshRefill`, chunks/chunks.js): a chunk mesh's geometry may hold more than it draws (drawRange); never read its
  arrays' full length as the mesh. Drop light is read once a tick (`_dropLitTick`, 15).
- **Part C7-C10 (0.8386).** Shared memory: `coi-sw.js` (service worker adding COOP/COEP; GitHub Pages) makes the page
  cross-origin isolated; then `c.data`, `c.sky`, `c.light` are SharedArrayBuffer-backed (`SHARED_OK`, `newSharedArr`,
  `shareArr` in 00-config). NEVER put a chunk array's `.buffer` in a postMessage transfer list or IndexedDB (a shared
  buffer throws / cannot be stored): post the view without transfer, or `.slice()` the typed array (gives a normal copy).
  New chunk arrays: allocate with `newSharedArr`. Mesh jobs carry raw arrays and the worker packs light (`meshJob` in
  WORKER_MAIN). Block light (`LIGHT_THREAD`): with shared memory every flood runs in the light worker (08 `_lightPost`),
  async: light shows a frame or two late, and the main thread must not write `c.light` itself; a chunk arriving calls
  `lightRegister`, an unload `lightForget`. Fast leaves (`FAST_LEAF_TILE` 0x8000 in a face's tile, chunks/mesher.js/04): a tile index
  must stay under 0x8000. Far regions (`_regionTouch` before changing a chunk's meshes, chunks/far-regions.js): code that changes
  `c.meshes` outside applyOneMesh/dispose/retire must call it, or a stale merged copy keeps drawing.
- **Blocks are BLOCK_CORE (0.8376)**, built in blocks/blocks.js from the parts in `blocks/`, `shapes/` and
  `woods/` (B, T, PROPS, V, tile sets, model boxes, SHAPE_*, SHAPE_BLOCKS, layer/slab-mix and value helpers). It is
  stringified into the worker like VOXEL_CORE and built before it. A NEW name declared in a part must go in the
  `return {...}` in blocks/blocks.js AND in the `const {...} = BLOCKS` at the top of chunks/voxel-shared.js (and in
  VOXEL_CORE's return, chunks/voxel-core.js, if the main thread needs it). Mutable mesher state
  (`_climAt`/`setTintSampler`, `TINTED`) is in chunks/voxel-shared.js. A headless test must build the cores in the
  order index.html loads them: core-parts.js, the biomes parts, the block parts, the voxel parts. Items are
  items/items.js (0.8377).
- **Units.** Model sizes are in 16ths of a block. Block art is 128x128 (0.808; older 64x64 art is stretched 2x with nearest). Log width is still in 64ths (geometry, not texels).
- **Block textures (0.809)** are one texture ARRAY (`DataArrayTexture`, 03-atlas), a layer per tile, not a 2D
  sheet. A face's tile index is a Uint16 layer. A new tile needs its name in `ATLAS_TILES` (03) AND its id in
  `T` (blocks/plants.js since 0.8376) at the same index; boot logs an error if they disagree. Furnace rock / bench wood tiles are
  generated from `FURNACE_ROCKS` / `BENCH_WOODS` (01) and `FURNACE_T` / `BENCH_T` (02).
- **Mushrooms (0.821):** one 256x128 sheet per kind (`MUSHROOM_KINDS`, `MUSHROOM_LAYOUT` in 01), cut into part tiles at atlas
  build (`CROP_TILES`, 03). Variant bits 0-2 = grown size, 3-7 = steps left to grow (`emitShroom` 02; growth, life and
  autumn spawning `_shroomChunk`/`updateShroomGrow` in seasons/growth.js). Grilled mushrooms are BLOCKS that are food: use `foodPropsOf` (player/stats.js).
- **Desert update (0.84, biomeRev 21 `DESERT2`):** Deep Desert = `fDeepD` (temp from `DD_FROM`, inside the red sand; mesas,
  cracks, ridges in terrainInfo; `ddAir` -> climateAt `dd` -> +`DEEP_DESERT_HEAT`, `HS_DEEP_DESERT` in temperature/heat.js); its own
  biomeBase name (no desert village). Oasis = `_oasisAt` (biomes/oasis.js, one per `OASIS_CELL` maybe; only for non-bare terrainInfo),
  `oas`; genChunk `OAS`/`DDS`, banded rock `ddStrata`, palms (`palmTree`/`palmCrown`, ribs of thin palm log keep fronds
  within leaf reach; sapling copy `_growPalm` in woods/saplings.js), dry plants pass, hoodoos and bones pass. Desert sand 5 over 5
  sandstone. Palm B 219-223, dry plants B 224-227 (`DRY_TALL_*` like the tall grass: `TALL_UPPER_OF`/`TALL_LOWER_OF` in
  13), T 385-395. Lone prefabs may set spawn `sink` and `pillar` [top, deep] (34). `ITEM.BONE_ASH` 410.
- **Red desert and mountains (0.841, biomeRev 22 `DESERT3`):** `ddRed` (biomes/terrain.js) splits the Deep Desert into it and the Deep
  Red Desert (`DDK` in genChunk, `ddStrata(y, off, kind)`); red desert gold veins at any height (ore section);
  `mtCaveOf` halls/exits/deep shafts in high land (drawn in the UPLAND carve section); `mineOf` mine shafts (dug last).
- **Dryland (0.8411, biomeRev 23 `DRYLAND`):** `fDry` (biomes/fields.js, hot side of level 1); grass variant `V.GRASS_DRY` 2 with its own
  tiles (T 396-397, built in 03, mesher `emit` in 02; spread keeps it, 22); `B.DRY_LEAVES` 228 (T 398, oak art tinted
  `DRY_LEAF_TINT`) as bushes (`dryBush` in the tree loop), in LEAF_BLOCKS (sticks) but not `_isLeaf` (no decay).
- **Doors (0.842):** a door is the SHAPE 'door' of its material (`SHAPE_DOOR` 0xA0 / `SHAPE_DOOR_R` 0xB0 = hinge, low
  nibble facing|open 4|upper 8; `SHAPE_BLOCKS.door`); use `BLOCKS.isDoorVal(v)`, never `B.DOOR` (old id, converted by
  `migrateLegacyVal`). blocks/doors.js: `doorDv`/`doorValOf`, meshes made by setBlock's hook (chunks/block-access.js) from the bottom half, looks
  drawn from the material's art (`_doorArt`; its art loaded via MESH_TEXTURES in 03), `DOOR_LOCKS` + key slot meta `lock`.
- **Chests (0.843, blocks/chest.js):** art is 4 sheets (`CHEST_SHEET`: chest_wood/_metal single, *_double halves). `B.METAL_CHEST`
  229 (bits 4-5 metal, `CHEST_METALS`; 64 `CHEST_SEALED`); use `isChestId(id)`, never `B.CHEST` alone; a chest's look is
  `chestLookOf(val)` (0-3 wood, 4+ metal). Locks share `DOOR_LOCKS` (chest cells as keys, both halves); `chestLocked` =
  sealed or keyed: broken gives nothing. Sealed chests: `trySpawnWorldChest` (from 34's per-chunk roll), loot
  `DEFAULT_LOOT.<metal>_chest`; keys from mobs `_mobDropKey` (entities/night-mobs.js). 0.8442: one spacing for every supply chest
  (`SUPPLY_CELL` 175, `supplySiteOf`): wood = the `supply_crate` prefab (no lone roll any more), else a sealed metal one.
- **0.8442.** Stacks: items 79, blocks 50 (`DEFAULT_STACK`), specials 10 less, in the registries; Pack Rat by stack size
  (`_packRatRoom`, player/inventory.js); a saved slot over its stack is kept and split on join (`restackInventory`, 15; `player._restacked`).
  Dry grass colour: per-vertex dryness from `dryAt` (biomes/queries.js) in the `dark` attribute of the opaque pass (`DRY_TILE`, `dryKey`,
  `maskD` in chunks/mesher.js; `vDry`/`uDryTiles` in 04); in a world chunk `V.GRASS_DRY` no longer picks the tile. Darkness floor
  `SKY_FLOOR` + `NIGHT_LIGHTEN` (00-config; shader and the JS that tracks it read them). biomeRev 24 `FOSSIL2`: 70% fewer
  Dryland skeletons. Death marks: `player._deathMarks` (up to 5, own timers; `#deathMark` is their holder). Feed rows
  show `[carried]` (`_feedHaveSoon`, ui/feed.js). Quest `mark: 'cow'` (47, drawn in `syncBossHud`). NEVER put a backtick or a
  `${` in a comment inside a shader template string (04), and never a `//` comment before code on the same line.
- **0.8451.** A creature's yaw 0 faces +Z, a player's looks down -Z: to turn one to where a player looks use
  `p.yaw + Math.PI` (the ridden horse did not). Free fall for creatures is `_entFallStep` (entities/entities.js): the step is taken at
  the speed half way through it, so a jump (`ENT_JUMP_H` 1.2 blocks) is the same height at any tick length; never
  write `vy -= g*dt; y += vy*dt` for one again. `ENT_FALL_SAFE` 6 / `HORSE_FALL_SAFE` 8 = falls that do not hurt;
  `ENT_LEDGE_MAX` 3 = the drop a mob walks off. A tamed horse's `stance` (`HORSE_STANCES`, `horseStanceMove`, entities/taming.js;
  the lie pose `lieK` in `_updateGrazer`), `ownerId` as the hound's. Head turned to a player: `_entHeadTurn(e, p, dt,
  bodyYaw)` (28) on the model's head pivot, who by `horseLooksAt` (entities/taming.js) / `houndPose`. Petting: `updatePetting` (entities/taming.js,
  from tickPlayer; sets `_lookAt`/`_lookT`/`_petT`). A hound's taming keeps `lost` (effectiveness its own kills took).
- **0.845, the hellhound (entities/hellhound.js).** Kind `hellhound`, a grazer (`isGrazer`): `_updateGrazer` (entities/grazers.js) asks
  `houndThink` (heading, speed, bite; sets `e._bold`, `e._rest`), `houndHazard`, `houndBody` (needs; true = died) and
  `houndPose`. All numbers in `HOUND`. `e.hunger` is out of `HOUND.food` 120 and `e.thirst` is its fire. Owner =
  `e.ownerId` (a profile id, saved) -> `houndOwner(e)`; `e.taming` {left, a, m, n, lost, hurt}, `e.tame`, `e.mode`,
  `e.stance`, `e.stats` {maxHp, dmg} (save: `houndSave` / `houndRestore`). Kills: `fireKillBy(victim, by)` (by = a
  hound or a player) from `damageEntity` (`_fireBlow` = a torch's blow), `damageEntityByMob`, `_entBurnDeath`;
  `ent._fireBy` = who lit a burning creature (cleared when the fire goes out). Hooks for a hound's targets:
  `player._houndTarget` (what the player struck), `tp._hitBy` (what struck a player), `e._hurtBy`.
  `houndWorldTick` (start of a world step in `updateEntities`) runs the taming's day and the follow teleport, parked
  hounds too. Sheet `textures/Entity/Tamable/hellhound.png` from `toolsrc/hellhound-tex.ps1` (regions listed at
  `buildHellhound`). Test one: `summon('hellhound', player.pos.x + 3, player.pos.y, player.pos.z)` in the console.
  Also 0.845: `ITEM.GLASS_BOTTLE` 415, `WATER_BOTTLE` 416 (`drink` with no `food`: `foodPropsOf` accepts it;
  `updateBottleFill`, player/drinking.js), `ITEM.FIRE` 417 (`igniteAt(x, y, z, by, keep)`: `by` = the player who lit it, kept by the
  fires it spreads to). Quests added in a later round carry `added: 2` and `QUEST_SAVE_GEN` counts the rounds (player/quests.js).
- **0.8447.** Player edits and meshing (11): a chunk may have MORE than one mesh job out (`c.meshOut`; `c.meshing` =
  any out); `markDirty` sends a player's edit over a job already out (`_rushOver`, stale answers are dropped by `rev`),
  and treats what follows on that chunk within `EDIT_FOLLOW_MS` as the same edit. Skill ids `nimble` = Work Fingers
  (+10% craft speed, walk penalty -25%: `craftMoveMul`), `walkWork` = Precise Focus (`benchFocusMul`,
  `player._benchHoldT`, stations only); a bench's `speedPc` is drawn on its tag. `spoilInto` shows in the tooltip.
- **0.8446.** Milking is a hold: `tryMilkCow` starts `player._milk`, `updateMilking(dt, rawRmb)` (entities/taming.js, from tickPlayer)
  runs it; it locks the controls like bench work (`benching` in tickPlayer, the mousemove gate in 17), freezes the cow
  (`e._milkHold`, `_updateGrazer`) and leaves `_milkLatch` until the button is let go. The progress ring: `#progRing`
  per pane, `interactProgress()` / `updateProgressRing()` (ui/hud.js): a new hold-to-do action adds its 0..1 there. A bed's
  head lies away from the player (`tryPlaceBed`); the item model is turned half round (`bedItemNode`). `ARMOR_CAP` is
  per face `[keep, vTop, vBottom]`. Night XP is `XP_NIGHT` x days lived (`aliveT`). Treasure Nose keys
  (`TREASURE_KEYS`, 34). Thick Skin is health only.
- **0.8445.** `registerChest(x, y, z, facing, val)`: pass the cell's value when the chunk may not be loaded (a world
  loading); a chest record keeps `look`/`half`/`checked`, and `updateChests` rebuilds a model that does not match its
  cell the first time the chunk is there. `chestCovered` (a block that is not a chest on top: no opening; a double
  needs one clear half). `waterFlowVec(x, y, z, out, river)` reads a river's `fd` bits first (`RIVER_PUSH`); fish
  pass `river` false. `invPanelHeld(panel)` first in every inventory panel builder (the skill tree hides them).
  `_armorPiece(..., cap)` + `ARMOR_CAP` (the cloth bandana: front strip, no underside). `NO_SNOW_ON` (seasons/weather-ground.js).
  `LOOT.orePebble`. Plant food `spoilInto` fiber (59). Palm leaves are grey art tinted `PALM_LEAF_TINT` (03).
  biomeRev 26 `PALM2`. `SINK_BLOCKS` is empty. The temperature dial is drawn mirrored (hot on top, 19).
- **0.8444.** Sealed chests: `chestSealed(val)` is true for a WOODEN chest too (bit 64; the supply crate's, sealed in
  its placement's `onDone`); what opens one is `chestSealOf(val)` (a blank `ITEM.WOODEN_KEY` for wood). `SUPPLY_KINDS`
  no longer sums to 1: a square may be empty (`supplySiteOf().kind` null). Worker jobs (gen/prep/scan/mesh/probe) run
  from a list in WORKER_MAIN (`jobQ`), a `rush` mesh first: a new job type must be added to `JOBS` there, anything
  else is answered at once. Player edits: `notePlayerEdit()` (tickPlayer) makes setBlock pump at once; pump sends
  `editRush` chunks straight to the least busy worker; a rush result is applied on arrival. Gravity blocks also wake
  from `_fallUnderFeet` and `_fallWakeBeside` (blocks/falling.js). Quests put into the chain later carry `added: true`; the saved
  place carries `QUEST_SAVE_MARK` (player/quests.js). `playerUnderwater()` / `UNDERWATER_MINING`, the `underwater` state effect
  (54), the lens sheen `f.under` (57). `feedCraft` (ui/feed.js). Grass PLANTS pale by `dark` (dryness) and `vClim` in FSH
  (`uDryPlants`, 04; `DRY_TILE` now marks the plant tiles too). `CLOUD_SHADOW_MUL` (04). biomeRev 25 `LAVA2`.
  `SINK_BLOCKS` is snow only. Exhaustion costs health only while a sandstorm or heatstroke keeps it (`_tickExhausted`).
- **0.8443.** Scrolling lists in the inventory: NEVER recreate the scrolling element on a rebuild (it loses what was
  scrolled during the frame): keep it and swap its children (`buildCraftPanel` 25; `swapHtmlKeeping(host, html, keepSel)`
  20, used by the furnace book), and do not hide a panel that is coming straight back (`buildInventory`). Lists go to
  the top on open (`resetInvListScroll`). Chunk stream paces by the clock, not the frame: `frameMsAvg`, `_genTokens`,
  worker depth in `pump` (chunks/stream.js), the slice in `runWorldTick` (22, `STREAM_*`); `streamBehind` = land waiting near a
  player: deferrable background work checks it (season scans 51, fluid writes 61). Hold-E past `BUSH_TAP_S` takes only
  ready plants (`findBushPickup(readyOnly)`, player/foraging.js); ripe wheat regrows (`wheatRegrow`, seasons/growth.js). Soft blocks (hardness 0) drop
  through the instant-break path in tickPlayer (player/tick.js). Desert night: `nightDepth` + `DESERT_NIGHT_*` (temperature/temperature.js). Armor pieces take
  their chestplate's durability (pass in 59). `OVER_FOOD_GAIN` (player/stats.js). `rawMouse` (00-config; Options > Gameplay "Raw mouse input", `vg_rawmouse`). A backpack is not a
  `_stashTarget` (ui/inventory-buttons.js). Quest lines per requirement (`_questReqName`, player/quests.js).
- **Mushrooms (0.8091)** are box models (`SHROOM_MODEL`, `emitShroom` in chunks/mesher-models.js) but keep model `'cross'` so plant
  rules still apply. Their sheets (`MUSHROOM_NATIVE`, 03) sit unstretched in a layer's corner at 8 texels a
  model pixel, and the mesher maps them 1:1 (1 model px = 1/16 UV).
- **Level of detail (0.8092):** `chunkLod` (chunks/chunks.js) gives each chunk 0/1/2 from its distance (half / three quarters of
  the render distance); `meshChunk(..., lod)` (woods/gen-tree-loop.js) drops small models at 1 and meshes a 2x2x2 downsample at 2
  (`lodDownsample`: a group is solid if any cell is, so borders never open holes).
- **Built and animated tiles (0.8093):** `COMPOSITE_TILES` (01) are made at atlas build from a base + overlay
  (grass sides, gem ores); `ANIMATED_TILES` (01) are vertical frame strips whose extra frames sit after the
  tiles, swapped in by the `TILE_LAYER` lookup texture (03, sampled in 04) that `updateTileAnimation` steps.
  Its second channel is a glow mask layer (`EMISSIVE_TILES`, 01, 0.8094): masked pixels ignore lighting.
- **Block light** can exceed 15 (glowcrystal 18) for reach, but readers cap at 15 (`getLightWorld`, mesh packing);
  relight radii use `LIGHT_REACH` (08), not `GLOW_LEVEL`.
- **Look variants in bits (0.809):** furnace rock bits 3-5, bench wood bits 2-4 (`V` in 02), chest wood
  bits 4-5 (`CHEST_WOOD_SHIFT`, blocks/chest.js). The variant bar places them through `bits` in `BLOCK_VARIANTS` (blocks/variants.js).
- **Light through shapes (0.819):** `CORE.lightDim(v)` is how many extra levels light loses LEAVING a shaped cell of an
  opaque block (slab 4, stairs 6...). Sky/block light queues carry the outgoing level; setBlock relights when it changes.
- **Biome revision (0.819):** `makeGen(seed, type, biomeRev)`; worlds keep `w.biomeRev` (missing = 1; 2 bigger snow/desert;
  3 (0.8193) fewer desert hills; 4 (0.822) pink warm beaches; 5 (0.823) bigger biomes, deep/spruce forests, fewer oceans; 6 (0.8231) tall spruce forest trees; 7 (0.8232) the climate ladder; 8 (0.833) every biome 2x (BS 1/3); 9 (0.835) the Ice Spikes biome (`iceSpikesAt` in biomes/queries.js, `SPK` and the
  spike pass at the end of genChunk, also icebergs in snow seas); 10 (0.8351) Snowy Hills (`sh` in terrainInfo) and big icebergs
  (`BIG_BERGS`); 11 (0.8353) oceans 3x bigger (`OS` on the continent and deep noise) and FLOWING rivers (`FLOW` in 55: springs
  traced downhill on `_drain` to the sea, spilling through basin lakes, `_riverAt` from bucketed segments; the noise rivers off,
  noise lakes kept as ponds); 12 (0.8354) taller land, mountains eased toward 240 (`TALL` in 55); 13 (0.8356) shores
  (`SHORES` in biomes/fields.js: `shoreKindAt` turf/sand/gravel, `cliffAt` lifted rocky coasts, `shoreWidth` ragged 1-6; genChunk and biomeAt
  share them); 14 (0.83547) hills, crags and plateau cliffs (`HILLS`, the `hl` block in terrainInfo), more and sharper rocky coasts,
  sea beaches 1-10 (genChunk: wet grid `WW` is `WG` square with a `WM` 10 margin, ponds under `POND_MIN` 9 cells filled, `steep`
  faces bare stone, `under` = a beach's sand/gravel under the shallows); 15 (0.83548) water at its own height (`UPLAND` in biomes/fields.js: river
  levels = lowest bare ground passed - 1 (`terrainInfo(x, z, bare)` skips water), basin lakes at their rim, placed lakes `_lakeAt`
  in flats/hollows/mountain shelves instead of noise ponds, `_wetKey` picks a column's water, banks raised to hold it; terrainInfo
  returns `wl` = the column's top water y, wet = h < wl; genChunk keeps `WLV`/`WLG`, `HIWET`; cleanup pass keeps lake water
  water), rough beds, smooth/long hills (`smo`/`lng`), less stone where `firm` is low, rooms/tunnels/mouths/arches (`roomOf`,
  `mouthOf` cached per generator) and overhangs in the UPLAND pass before the lava pools; 16 (0.835481) `RIV2`: rivers only
  out of lakes (`_lakeRiver` from the def's `out` rim point, into a lake at/under it or the sea, steering round higher
  lakes; steps spread back upstream, `fixed` lake points kept), bigger long lakes (`el`/`ca`/`sa`, `_lakeDist`, `_lakesNear`
  ±2 cells), sloped banks, no mouth trench, sea floor 1.3x deeper near shore, no underwater cave entrances, `keepsWater`
  guards every cave cut; 17 (0.83549) `FALLS`: flat-topped broad mountains (`mesa`), mountain valleys `_valley` (also in
  `_drain`, lakes in them lie along them), a stride dropping 3+ falls at once mid-way with a plunge `pool`; genChunk: slivers
  (small one-level patches over lower water) lowered, a lake meeting lower water (or a river beside lower water, not
  downstream: `FDG`) becomes a dry bar, waterfall curtains hang in the lower column (`curtainTop`), rock frames them and
  fills caves beside them, banks lower than water beside them are raised; spruce forms (giant/crown/small, forest 3 lower);
  18 (0.835491) `DIVIDE`: water groups (`g`/`up`/`dn` on river segments, lake `id`s, `_kin`), a column within `DIV_REACH` of a
  non-kin lower water is a dry ridge (`near` lists from `_riverAt`/`_lakeAt`); placed lakes overlapping a lower one dropped
  (`_lakeDefRaw`/`_lakeDef`); basin lakes on a `BASIN_CELL` lattice (`_basinLake`, shared); gentler lake shelf; plunge pools
  widen; genChunk: slivers cut down (not left dry), bars only lake-vs-sea, a final pass fills air beside water over dry
  ground; `ff` fast-flow bit; Mountains from 150 where `mt` >= `hlv`, else '<biome> Hills' (biomeBase/_biomeWeight strip
  it), plains halved (`PLAINS_FROM`, half the warm band), 2x plains trees, oaks to 199 on mountains;
  19 (0.836) `RIME`: Coldest Deep Snow (`fRime`/`rimeAir` in terrainInfo, the coldest heart of deep snow, ~3% of land,
  -60°C via climateAt `rime` in 54), rime trees (`rimeTree` in genChunk: ghost/skeleton/spire/bent/giant), sastrugi snow
  (`rimeWindAt`), packed-ice sheets, the rime ice pass (ribcages, arches, rings, fins, spires, waves, tusks, ice trees,
  crystals, shards, penitentes; `RI_CELL`), no canyons inside it (`RIMF`), fallen rime logs;
  20 (0.837) `RIME2`: the Coldest Deep Snow split by `rimeW` (biomes/terrain.js) into its Forest (trees and ice at half) and the open
  Coldest Deep Snow (`calm`: hills, snowy hills and mountains eased away, `rimeKeep` 0.12 trees/ice; castle land for
  0.838); `SHROOMS2`: surface mushrooms under any tree by its kind, white beside trees, 30% more (genChunk); 21 (0.84) `DESERT2`: the Deep Desert, oases, palms, dry plants, desert sandstone, hoodoos and bones; 22 (0.841) `DESERT3`: the Deep Red Desert half, mountain halls and tunnels, red desert gold, mine shafts; 23 (0.8411) `DRYLAND`: the Dryland
  — new worlds), so old worlds' new chunks still match their old ones.
- **Rime wood (0.836):** B 214-218 (log, stripped, planks, leaves, hollow), T 379-384. No sapling yet: leaves drop sticks
  only (50). Rime planks recipe is APPENDED to RECIPES_ADVANCED with `basic: true, after:` (items/recipes.js `_basicRecipes`): recipe
  indices are saved, never insert a recipe mid-list. Deep snow air about -22 (`DEEP_SNOW_CHILL`), `TEMP_FLOOR` -75 (temperature/temperature.js).
- **World switches (0.837):** `w.dayNight / weather / clouds / animals / monsters` (false = off, missing = on), set at
  creation. Day-night off: `updateDayNight` pins noon (07). Weather off: `_titleCalm` (seasons/weather.js) also true. Clouds off:
  `updateClouds` hides the layer (52). `worldHasAnimals` / `worldHasMonsters` (entities/spawning.js). Worlds stamp `APP_VERSION` (the
  alpha number, 16-worlds) as created/last version; the world list shows it and the world gen (biomeRev).
- **Building wand (0.8371):** `ITEM.BUILD_WAND` 408 (art textures/Items/Tools/build_wand.png, the stick tinted
  purple), creative palette only. `doPlace` hands it to `wandBuild` (player/wands.js): BFS over exact-value matches in the clicked
  face's plane, copies onto free cells one out (`WAND_MAX` 256, `WAND_REACH` 48), lit once via `_litEdits`.
  0.8374: `ITEM.BREAK_WAND` 409 (break_wand.png, the stick tinted red) takes the same set away (`wandBreak`); both share
  `wandCells` (8-way in the plane: corner-touching joins, a gap parts). `updateWandOutline` (per seat tick) draws one
  merged outline (`_wandOutlinePos`: outside edges only) with depthTest off; 36 shows each seat's only in its own view.
  0.8375: the edges are thin boxes (`_wandBarGeo`, `WAND_BAR`; GL lines are 1 px) pulsing (`WAND_PULSE_S`); building
  spreads only through blocks whose front cell is free (`freeFront`), none if the clicked one's is taken; a wand acts once
  per press (`holdingWand`, no hold-repeat in 22).
- **Far ice seams (0.837):** a LOD 2 chunk draws no see-through (pass 4) face across its edge unless opaque is there.
- **River flow texture (0.83549):** terrainInfo `fd` 1-8 (a river's way, rev 15+); genChunk writes it in the top water cell's
  variant bits 3-6 (`FDV`, `B.WATER | fd << 11`; water level stays bits 0-2); emitWater turns `T.WATER_FLOW` on that top so the
  art runs downstream. The flow strips' art runs UP, so `ANIMATED_TILES` water_flow/lava_flow have `reverse: true` (03).
- **Water mesh (0.835491):** `emitWater` uses `quadW` (per-corner light/shade): depth shading 0.72(1-e^-d/6) per corner
  (`_waterDepth`, a falling sheet counts as shallow), a lip's corners sink to `LIP_H` (`_lipCorner`), river tops
  `T.WATER_FLOW_FAST` when bit 7 or a lip, every side face `T.WATER_FALL` (T 377-378: the same strip at 200 / 70 ms).
  Water tint ~1.8x stronger (04), `WATER_TINT` cold/warm deeper. 0.835492: the corner depth goes in a `dark` vertex attribute
  (quadW's last args; only VSH_WATER reads it, into vShade) - NEVER blend the packed light byte between corners, the FSH
  unpacks it with floor() and draws false glow lines. River tops (row 1 .a of `TILE_LAYER`: 1 flow, 2 fast) get ripples
  running downstream in FSH, the way found from v's screen-space slope; `WATER_ART_CONTRAST` (03) 0.3.
  The mesher sees neighbours only as 4 side strips: a cell diagonal to a chunk corner reads garbage from gb. Anything that
  must agree across chunks (lip corners _lipCorner, 0.835493) must skip those (_seen) and decide chunk-corner vertices
  without them, or a slit opens at every chunk corner.
- **Water mesh (0.835481):** a water cell with water above stands full height (`fh`), so steps have no slits; a step's face
  foot waves with the lower surface (`footS`). `WATER_ABSORB` (09) 2, surface depth darkening 0.42 — all worlds.
- **World height (0.8354):** 250 tall, y 0..249. `CHUNK_Y` / `WORLD_TOP` (00-config) on the main thread, `CY` in VOXEL_CORE (chunks/voxel-core.js):
  the two must match. Never write 199/200 for the top again. Cell index is still `x + z*16 + y*256`, so saves are unchanged;
  `TERRAIN_KEY` (chunks/stream.js) was bumped so no cached 200-tall chunk is read.
- **Ice by climate (0.8351, seasons/ice.js):** `_iceKindAt(x, z, depth)` eases `mainGen.climateAt` between 8-block lattice corners (`_iceLat`,
  0.8352) with a noise-wobbled edge (snow > ~0.3: 1 land/lakes/rivers/shallows frozen, 3 open sea (depth ≥ 4) frozen bar `_iceHole`
  blobs, never melting); `climateAt().inland` = river or lake. `iceDressChunk` re-meshes neighbours whose border it froze (0.8352). Prefab field `lift` raises a group member
  (the village houses: 1); `_resnowAround` (34) re-covers dirt round a blended prefab in the snow.
- **Polar bear (0.835, entities/entities.js):** kind 'polar_bear', a grazer (`isGrazer`, `_updateGrazer` gets `tp`) that hunts: `hunting`/chase branch and
  `_mobStrikePlayer`; a hit sets `aggroT` instead of fleeing. Spawn `_rollPolarBears` (snow climate + shore, or Ice Spikes). Sheet
  polar_bear.png box-UV regions listed at `buildPolarBear`.
- **Far ring (0.8193):** `drawDist()` = `viewDist` + `FAR_RING` (4) chunks loaded and drawn at LOD 2, no creatures shown; fog and camera
  reach use drawDist. `viewDist` is still the full-detail setting.
- **Batched lighting (0.8193):** `relight`/`reskyAround` take a box (x2, y2, z2); `_litEdits` (blocks/falling.js) runs edits with light held and relights once per area.
- **Vitals (0.82).** Everything a player's numbers are lives in player/stats.js. Bars are 0..100 (stamina and oxygen 0..200 since 0.831, `vit.s2` marks it); any damage or heal
  to a player is written x `VITAL_K` (mob `dmg`, arrows, lightning, falls...). A save's `vit` record marks the 0..100 scale;
  without it `restoreVitals` multiplies hp/food/saturation up.
- **Entities (0.823)** are on the 100 scale too: mob health, hunger, thirst and every damage number (weapons, arrows, mobs)
  are x5 in the data; a saved entity row ends with 5 (older rows are scaled up in `restoreEntities`).
- **Climate colour (0.8231):** grass and water blend smoothly by climate. The mesher gives tinted tiles (`TINTED`, chunks/voxel-shared.js) a
  per-vertex `clim` attribute (-1 cold .. 1 warm, `climAt` in biomes/queries.js, set in the worker by `setTintSampler`); the fragment
  shader (04) reads row 1 of `TILE_LAYER` (03): 1 = mix toward the warm/cold tile (T 310-319), 2 = water (`WATER_TINT`).
- **Climate ladder (0.8232, biomeRev 7):** `CLIMATE_LADDER` (biomes/climate-ladder.js) gives every land biome a temperature level -3..3 (edges in the
  temperature field, the air's degrees for `ambientTemp`); terrainInfo turns the field into a smooth `lvl`, so biomes step one level at a time.
  `lvl` is reported in every world; genChunk keeps it per column (`LVL`) for what grows where (gourds, wheat, cane; 0.8233).
- **Spawn biomes (0.8233):** `*_BIOMES` in 28 are weight maps by FULL biome name (`_biomeWeight`: a Deep forest counts as its
  forest); `_findChunkSpot(cx, cz, biomes, wet)` rolls the weight, `wet` wants water near (pigs, `_waterNear`).
- **Carpet models (0.824)** may set `facesByVar` (faces per rot:'side' facing, bits 0-1) and `fullUV` (whole tile on each
  face, `FULL_UV_BOX`; `emitBoxFaces`' last arg is the UV box): the carved pumpkin / jack o'lantern.
- **Villages (0.8242, 34-structures):** `_planVillage` — houses = group members with a door (`_prefabDoor`: the door in the ring of
  blocks at its own height, doorstep = first cell outside the prefab box), wells = members without; ground from `_planGround`
  (world if loaded, else `mainGen.heightAt`); paths = Dijkstra on a village grid (footprints walls), widened by `pathWidth`, plank bridges on water.
  Prefab fields (0.82422): `entry` [x,z] path start, `sink` layers below ground, `weight` pick odds; no `group` = the group its id starts with
  (`_groupOf`); a 2-high gap in the ground-floor wall counts as a doorway. Groups: village, desert_village (grass paths, sand carpets swept).
- **Fluids (0.844):** flow is back on (`FLUID_FLOW`, 00-config). The rules are ONE simulation, `makeFluidSim(get)` in
  VOXEL_CORE (chunks/voxel-core.js): it only reads (`get`, -1 = chunk not loaded) and returns changes [x, y, z, was, now]; finite (falling
  fluid is level 1/2, never a source); levels are variant bits 0-2 (read `& 7`, never `& 15`: bits 3-6 are the way it runs,
  `fd`). fluids/fluids.js runs it in its own worker with shared memory (`fluidRegister`/`fluidForget` from 11, `fstep` each
  simTick) or here without; writes go through setBlock (CAS on `was`) under `fluidApplying` (chunks/block-access.js: fluid hooks quiet, no
  rushed remesh). `queueWaterAt`/`queueWaterAround`/`dryWaterFrom` (and lava) are touches now. F3 line `fluidDebugLine`.
  Shadows off: the chunk shader uses sky light as the shadow (`sS`, 04), so caves stay dark.
- **Heatstroke and sandstorm (0.825, temperature/heat.js):** `p.heatstroke` 0..100 (`_tickHeatstroke`, `heatstrokeMuls`, saved as `vit.hs`;
  death after the armor soak in 19); exposure sampled with temperature (`_sampleExposure`: `_hsSun`, `_roofed`, `_sandAim`).
  Sandstorm = desert region's 'windy' (`sandstormAt` 51); body `p._sandFelt`, fog per eye `_sandAround` (52), sand `_fxSandstorm` (49).
  Blur `#heatBlur` and mirages (`showMiragesFor`, per view in 36) live in ui/screen-effects.js.
- **Render passes (0.8263):** 0 opaque, 1 cutout (leaves, plants), 2 water, 3 lava, 4 glass (blended, no depth write, `matGlass`
  in 04). Shapes and carpets mesh through `emitBoxFaces(..., ps)`; `_shapePass` (chunks/mesher-models.js) keeps a glass shape in pass 4.
- **Mixed slabs (0.8263):** `SHAPE_SLAB_MIX` (0x90 + low half's rotation) on the low half's id; the two ids sit in `LAYER_STACKS` like a
  mixed carpet (`slabMixIdsAt`/`setSlabMix`/`breakSlabMixHalf` in chunks/layer-stacks.js). shapeOfVal is null, so it acts as a full block;`n  rotation bits 8 (SLAB_MIX_SEE: a glass half, not opaque) and 1 (SLAB_MIX_HIGH: the cell id is the glowing high half), 0.8264.
- **Variant shapes (0.8263):** every look takes its default's shapes (`VARIANT_FAMILIES` in shapes/shape-blocks.js; 46 logs an error if BLOCK_VARIANTS disagrees).
- **Berry bushes (0.827):** five kinds (`BERRY_BUSHES`, blocks/blocks.js; ids: black 138 = old YELLOWBERRY, yellow 201, white 202), six stages in the variant's
  low 3 bits (`BERRY_STAGE`, own art per kind `T.BERRY_<KIND>_S<n>`); kind by place in genChunk. `lightByVar` = light per variant (08 `blockLightOf`).
  Growth-stage variants (berry, wheat) use `VARIANT_DEFAULT_BITS` + `VARIANT_LINEAR` (blocks/variants.js). ITEM.BLACKBERRIES is 388 (old YELLOW_BERRIES).
- **Death mark (0.827):** `player._deathMark` {x,y,z,left}, `#deathMark` on the pane (19, 36), saved as `deathMark`. Furnace chimney:
  `chimneyHeight` (02) = rock walls on it (mesher cap, 49 smoke, 26 choke test).
- **Rain and snow (0.83):** `precipAt(x, z, y)` (seasons/weather-sky.js) = { rain, snow, blizzard } blended per region (`_regionPrecip`; snow per
  `_snowsIn`: snow region, 95% of winter). Particles `_fxWeather` + `_fxRainLand` (49, own pools `FX.weather`/`FX.puddles`,
  `FX_RAIN` flag), fog `_precipAround` in `applyMist` (52), ground `updateWeatherGround` (seasons/weather-ground.js: rain washes snow/ash/salt
  layers, snow lays layers, salt on shores). `blizzard` is a WEATHER_TYPE (`regionCold`). Cold snow layers melt x0.1 (33).
- **Ice (0.8321):** `B.ICE` 203, pass 4 like glass. New chunks freeze in their data on arrival (`iceDressChunk`, from finishChunkGen; no setBlock); later freeze/thaw on the season pass (`_iceChunk`, seasons/ice.js: top water cell only;
  snow biomes always, winter elsewhere but deserts, thaw by day). Heat melt `iceMelt` (seasons/ice.js) fed by the setBlock hook
  (`iceHeatPlaced`/`iceQueueIfHot`, 11) and a held torch (`iceWarmHeld` from tickStats). Broken ice leaves water (22) only when its variant is ICE_FROM_WATER (0.833, set by freezing); placed/structure ice breaks to nothing and never thaws.
- **Torches and burnout (0.834, blocks/torches.js):** `B.TORCH` (23) is the FIRE torch; `TORCH_UNLIT` 209, `CRYSTAL_TORCH` 210; all three
  have `PROPS.torch` (emitTorch, wall placement/support, held fattening) — check that, not `B.TORCH`, for "any torch". Fire-only rules
  (ice/snow melt, heat, dry, doused under water, sets mobs alight) still test `B.TORCH`. `BURNS` map "x,y,z" -> world-second due
  (`BURN_S`, `BURNT_AS`), fed by `burnPlaced` (setBlock hook) and `burnSeen` (finishChunkGen emitter scan), run by `updateBurns` (from
  updateSeasons), saved as world `burns`. Held: `tickHeldBurn` (from tickStats), clocks `p._torchBurn` saved as `vit.tb`. Spent glow
  blocks `GLOWSTONE_SPENT` 211 / `GLOWCRYSTAL_SPENT` 212 (grey tiles built in 03, `greyed`).
  0.8373: due times are on the lights' own clock (`_burnNow`: world seconds x `burnRate` = random tick / 5; 0 stops all
  burning and rain dousing, held too), saved as `burns: { clock, list }` (a bare list = old save on the world clock).
  Placed in creative (`_placingByPlayer` + canFly) = `BURN_NEVER` (-1), never burns. A world's tick speed 0 is kept now.
- **Bed art (0.8342, blocks/bed.js):** four grey 512x192 sheets in Interactables/Bed (`BED_PARTS`: frame, blanket, sheet, pillow), same
  layout (top | underside, then side | head | foot, 128 px a block); `bedTexture(wood, colors)` tints each part and lays them into one
  texture (frame by its planks, bedding by `BED_COLORS_DEFAULT` until dyes; `setBedLook` re-skins). Wood in variant bits 4-5
  (`BED_WOOD_SHIFT`, variant bar like the chest). Model `_bedGeometry`: mattress+rail box over 4 legs, BED_H 0.5, and a raised
  pillow box (0.8343, `BED_PILLOW_*` rects measured from bed_pillow.png: its side/head strips are moved to rows 192+ of the
  512x320 bed texture and the sheet fills their gap; its top is a pillow-only copy there too, 0.8344; those copies are filled
  solid, 0.8345, and the box is rounded in geometry instead, `BED_PILLOW_R`/`_RV`, 0.8346).
- **Light colour (0.834):** `c.light` = level (bits 0-4, `LIGHT_LEVEL_MASK`) | `LIGHT_COLD_BIT` 0x80 from `coldLight` sources (08 flood
  carries it; sources are `[x,y,z,level,coldBit]`). The mesh light is Uint16: bit 8 = cold (`LIGHT_COLD`, `litMax` in chunks/mesher.js); the
  shader (04) mixes `uGlowColor` toward `uColdGlowColor`. Icons/drops pass Uint16 light arrays too.
- **Bosses (0.839, entities/frozen-king.js).** The Frozen King is a creature (`ENTITIES`, kind `frozen_king`, `e.boss`): updateEntities
  hands it to `updateBoss`, `damageEntity(ent, dmg, src)` hands its hits to `bossTakeHit` (pass `src` {x,z}, the attacker's
  place, so its shield can tell front from back), arrows/snowballs ask `bossDeflects`; mobs, fire and lightning leave it
  alone; never saved (`serializeEntities` skips it). Spells are `BOSS_FX` (stepped in simTick, drawn by `_tickPoses`).
  All numbers in `FK`. Not placed anywhere yet: F8 with F3 open (`bossDebugSummon`). Boss boost = `p._feats.bosses`
  (player/leveling.js, saved with the feats): `bossXpMul` in addXP. Effects `frozenCurse`/`iceDaze`/`bossBoost` are added to EFFECT_DEFS
  from 60; effects may now carry `jumpStrength` and `coldResist` too (54). Last quest: a `{ boss, need }` requirement and
  `fixedXp` (47). A new boss: a kind, a builder, an `updateBoss` branch, its quest.
  0.8393 the snow castle (structures/snow_castle.json, in the manifest, spawn chance 0 so it never spawns as a lone prefab):
  `LAIR` in entities/boss-lair.js. Sites from the seed per 4096 cell: `rimeOpenAt` (biomes/queries.js, exposed by makeGen; the open Coldest Deep Snow's
  fields only, ~1 us) finds candidates, a worker job `probe` (biomeAt/heightAt, ~14 ms each - never on the main thread)
  checks them, `_lairSite` keeps one per 4000 blocks. Placed through the placement queue (`onDone` on a job, 34), saved as
  `bossLairs` (16). Markers in the prefab: FURNACE = gate (air + a cut path), BEDROCK = the king's spot (air); oak chests ->
  rime, snow layers -> snow blocks, TORCH_UNLIT/GLOWCRYSTAL_SPENT -> lit (spent glowstone stays: placed so on purpose);
  its lights get BURN_NEVER. Re-saving the castle from a structure block keeps working: the rules run on load (`_castlePrefab`).
- **localStorage is small (0.8387, 16-worlds).** About 5 MB a site. World saves live in IndexedDB; only the world
  list (`vg_worlds`) and settings live in localStorage, plus a closing-time copy `vg_world_<id>` that `lsWorldsToIdb`
  moves into IndexedDB at boot and when a write finds storage full. Never store anything big there, and wrap any new
  `localStorage.setItem` in try/catch: a QuotaExceededError thrown in a click handler stops what follows it.
- **Value-based helpers.** Ask a whole cell value what it is with `CORE.shapeOfVal`, `solidVal`,
  `opaqueVal` and `shapeBoxesAt`. Do not check the bare id.

## Where things are
Every file's first comment says what it holds; search inside the file for the name a note gives. Paths are under `js/`.

| Folder / file | What is there |
|---|---|
| `core-parts.js` | how the three worker cores are glued from part files (`corePart`, `buildCore`, `@include`) |
| **`player/`** | |
| `movement.js` | the player object, `PLAYERS`, collision (`movePlayer`), drag in snow/layers, `raycastVoxel` |
| `tick.js` | `tickPlayer`: one player's frame (input, camera, break/place, mining, eating, bow, riding) |
| `placing.js`, `place-block.js`, `breaking.js`, `wands.js` | the right button (`doPlace`, `_doPlace`, buckets, `_shapeVariantFor`), creative break, the building/breaking wands |
| `foraging.js`, `mining.js`, `eating.js`, `drinking.js` | E pickup (`findBushPickup`, `harvestAtPlayer`), cracks and the hoe, throwing and eating, drinking and the glass bottle |
| `inventory.js`, `crafting.js`, `repair.js` | slots and the creative palette, counting/taking ingredients and the personal queue, repair and dismantle zones |
| `stats.js`, `effects.js`, `stat-getters.js`, `endurance.js` | vitals and `tickStats`, `EFFECT_DEFS` and `tempStress`, stats from gear and skills, weather/night XP and exhaustion |
| `hazards.js`, `death.js`, `knockback.js`, `combat.js` | `updateVitals` (falls, lava, fire, armor soak), death screen and respawn, shoves, aiming and swinging at creatures (`tryAttackEntity`, `pickEntity`) |
| `equipment.js`, `armor-model.js`, `hands.js`, `body.js` | equipment slots and armor points, armor on models (`syncArmorOnModel`, `ARMOR_CAP`), first-person hands, own body and third-person camera |
| `leveling.js`, `skills.js`, `quests.js`, `spawn.js` | XP and levels, `SKILLS` and `hasSkill`, the quest chain, `surfaceY` and the spawn point |
| **`entities/`** | |
| `mobs.js` | the creature table: `MOBS`, `defineMob`, what an entry holds, `mobOf`, `isGrazer` / `isFish` / `isNightMob` / `isAnimal`, `summon(kind, x, y, z, opts)` (the one spawn body), `buildEntity(kind, look)` |
| `entities.js` | `ENTITIES` and the shared numbers, `_entFallStep`, hunger, `entMaxHp`, `_entHeadTurn`, removing |
| `sheep.js`, `cow.js`, `pig.js`, `horse.js`, `polar-bear.js`, `fish.js`, `night-mobs.js`, `villager.js`, `hellhound.js`, `frozen-king.js` | one creature each: its numbers, model (`buildX`), what one is made of (`makeX`), and at the end its entry in the table (save, drops, where it lives); `night-mobs.js` = zombie and skeleton; `frozen-king.js` = the boss (`FK`, `updateBoss`, `BOSS_FX`) |
| `grazers.js`, `update.js`, `tick.js` | `_updateGrazer` (animals, ridden horse, bear, hound), `updateEntities` (the loop; villagers and monsters), the fixed tick and drawing between ticks |
| `physics.js`, `combat.js`, `loot.js`, `held-items.js` | boxes (`entR` / `entH`), blocking, hazards, fall damage, bodies apart; `damageEntity` / `damageEntityByMob`; `_entDropLoot` and `_entBurnDeath` (how a kind's `loot` is dropped); what a mob holds |
| `spawning.js`, `save.js`, `rig.js` | per-chunk rolls (`trySpawnEntitiesInChunk`, `CHUNK_ROLL_FIRST`, `_rollHerd`, night mobs), `serializeEntities` / `restoreEntities` (the row's layout is in its header), the humanoid rig and `_lightAt` |
| `taming.js`, `boss-lair.js` | `TAMEABLE`, horse stances, petting, milking, mounting and the taming ride; the snow castle (`LAIR`) |
| **`items/`** | the item table: `items.js` (`ITEM`, `ITEM_PROPS`, `defineItems`, what an entry holds), one file per group (`materials.js`, `tools.js`, `weapons.js`, `equipment.js`, `food.js`, `containers.js`, `useables.js`), `finish.js` (the passes, last); `recipes.js` (`RECIPES_BASIC`, `RECIPES_ADVANCED`: add at the end only) |
| **`blocks/`** | |
| core parts: `ids.js`, `tiles.js`, `basic.js`, `glow-and-storage.js`, `gem-clusters.js`, `ladder-mortar.js`, `mushrooms.js`, `dry-plants.js`, `torch-blocks.js`, `plants.js`, `looks.js`, then `blocks.js` | BLOCK_CORE: ids `B`, tiles `T`, `PROPS`, variant bits `V`, model boxes, `VARIANT_BLOCKS`; `blocks.js` builds it and holds its return (see also `shapes/` and `woods/` parts) |
| `legacy.js`, `mining-rules.js`, `variants.js` | old save ids, `MINE_REQ` / `TOOL_BLOCKS` / hand mining / `LEAF_BLOCKS`, the variant bar (`BLOCK_VARIANTS`, `heldBlockOf`) |
| `falling.js`, `grass-spread.js`, `layer-drops.js`, `tnt.js` | gravity blocks, grass spreading, what layers give and the tick speed, TNT |
| `crafting-bench.js`, `furnace.js`, `chest.js`, `supply-chests.js`, `doors.js`, `bed.js`, `torches.js` | stations and furniture: bench orders and tags, `SMELT_RECIPES` and smelting, chests and locks, world supply chests, doors and keys, bed and sleep, burnout (`BURNS`) |
| **`shapes/`** | core parts `stairs.js`, `shapes.js` (`SHAPE_*`), `shape-blocks.js` (`SHAPE_BLOCKS`, `VARIANT_FAMILIES`), `chimney-mixed.js` (layers, mixed slabs), `boxes.js` (`shapeOfVal`, `solidVal`, `opaqueVal`, `shapeBoxesAt`, `lightDim`); and `chisel.js` (the chisel and its radial) |
| **`chunks/`** | |
| `chunks.js`, `stream.js`, `block-access.js` | the chunk table (`getChunk`, `_chunkCacheClear`), the stream (`pump`, `finishChunkGen`, `onWorkerMessage`, `applyOneMesh`), `getBlock` / `setBlock` and its hooks |
| `dirty.js`, `layer-stacks.js`, `far-regions.js`, `fades.js`, `sim-wake.js` | `markDirty` and the edit rush, `LAYER_STACKS` and mixed slabs, merged far meshes, fading, waking land in sim range |
| core parts: `voxel-shared.js`, `mesher.js`, `mesher-cubes.js`, `mesher-models.js`, `mesher-plants.js`, `mesher-logs.js`, `mesher-finish.js`, then `voxel-core.js` | the mesher (`meshChunk`, `emitBoxFaces`, `emitLog`, `lodDownsample`); `voxel-core.js` builds VOXEL_CORE, holds its return, `CORE` and the names taken out of it |
| `worker.js` | `WORKER_MAIN`: the worker's jobs (`JOBS`), the light thread, the fluid thread |
| **`worldgen/`** | core parts: `noise.js`, `make-gen.js` (`makeGen`), `gen-setup.js`, `gen-caves-plan.js` (`roomOf`, `mtCaveOf`, `mineOf`), `gen-chunk.js` (`genChunk`: lists its parts in order), `terrain-columns.js`, `underground.js`, `cave-floors.js`, `ground-plants.js`, `canyons.js`, `desert-and-shore-plants.js`, `water-finish.js` |
| **`biomes/`** | core parts of BIOME_CORE: `climate-ladder.js`, `fields.js` (rev switches), `rivers-lakes.js`, `oasis.js`, `terrain.js` (`terrainInfo`), `queries.js` (`biomeAt`, `climAt`, `dryAt`), then `biomes.js` (builds it); and genChunk's biome passes `gen-ice-spikes.js`, `gen-rime-ice.js`, `gen-deep-desert.js`, `gen-mines.js` |
| **`woods/`** | the woods table `woods.js` (`WOODS`, `defineWood`, `woodBlocks`, `woodLogs`, `woodOf`, `isSapling`, `WOOD_BURN`) and one entry file per wood: `oak.js`, `birch.js`, `spruce.js`, `rime.js`, `palm.js`, `dry-bush.js`; genChunk parts `gen-trees.js` (`put`), `gen-rime-trees.js`, `gen-palms.js`, `gen-dry-bush.js`, `gen-tree-loop.js` (oak, birch, spruce and the choice), `gen-fallen-logs.js`; block parts `wood-blocks.js`, `hollow-logs.js`; and on the page `saplings.js` (`_growTree`, `_growRound`, `_growCone`, `_growPalm`: copies of the generator's shapes), `leaf-decay.js`, `log-mushrooms.js`, `felling.js` |
| **`fluids/`** | core parts: `kinds.js` (the fluids table `FLUID`, `defineFluid`), `water.js`, `lava.js` (one entry each), `rules.js` (`makeFluidSim`), `mesher-fluids.js` (`emitWater`, `emitLava`); on the page `fluids.js` (the fluid thread, `queueWaterAt`, `_fluidWrite`), `current.js` (`waterFlowVec`) |
| **`seasons/`** | `calendar.js` (`gameDate`, `sHash`), `weather.js` (`weatherAt`, wind), `weather-sky.js` (fog `mistAt`, `sandstormAt`, `hailAt`, `precipAt`), `weather-ground.js` (snow and salt laid, `snowlineY`), `seasons.js` (the season sweep, `SEASON_MEM`), `growth.js` (wheat, mushrooms, cane), `ice.js` (freeze, thaw, `iceMelt`) |
| **`temperature/`** | `temperature.js` (`airTempAt`, `ambientTemp`, `nightDepth`), `heat.js` (heatstroke, the sandstorm on the body); what cold and heat cost is `tempStress` in `player/effects.js` |
| **`ui/`** | `hud.js` (prompt, progress ring, hotbar), `vitals-hud.js`, `vital-tips.js`, `screen-effects.js` (hurt flash, heat blur, death marks), `inventory.js` + `inventory-cursor.js` + `inventory-transfer.js` + `inventory-buttons.js` + `inventory-open.js`, `tooltips.js`, `craft-panel.js`, `furnace-panel.js`, `chest-panel.js`, `equip-panel.js`, `skill-tree.js`, `animals.js` (hover tag, taming bar, riding panel, naming), `boss-hud.js`, `feed.js`, `menus.js` |
| **root files (not split)** | |
| `00-config` | settings, constants |
| `01-textures-data` / `03-atlas` / `04-materials` | texture list, texture array build and cache, three.js materials and shaders |
| `05-icons` | inventory icons, rendered from the mesher |
| `06-renderer` / `07-sky` | scene and camera, sky, day/night. Sky: dome shader (`skyDomeMat`, haze `SKY_GLSL` in 04 shared with fog), sun, moon phase (`moonPhase`, own wheel `moonSky`), stars, meteors, lens flare (`_aimFlare`); `skyLightDir` = shadow light; sun path by season (`SKY_LAT`, `sunDeclination`), `sunTimes`/`isDarkTime` = night for mobs, beds, particles |
| `08-light-glow` / `09-light-sky` | block light, sky light |
| `10-workers` | worker pool for meshing and worldgen (builds the worker's text from the three cores and `WORKER_MAIN`) |
| `15-drops` / `16-worlds` | dropped item entities; save/load, migrations of old saves |
| `17-input` | keyboard, mouse, gamepad |
| `22-main-loop` | `frame`, `simTick`, `runWorldTick`, F3 timings (`perfLap`) and read-out |
| `23-boot` | startup |
| `32-sound` | sounds, loops |
| `34-structures` | generated structures, loot chests |
| `36-splitscreen` / `37-profiles` | split-screen seats (`SWAP_KEYS`: globals swapped by name), profiles |
| `38-ranged` / `40-shield` / `41-backpack` / `44-spoil` | bow and arrows, shield, backpack, food spoiling |
| `49-particles` | particles: pools (`FX.bits`, `FX.sprites`, `FX.decals`), `fx*` emitters, ambient sampling, `updateParticles` |
| `50-loottable` | `LOOT` roll lists (`[[count, chance], ...]`), `rollLoot`, `lootBonus` (Prospector/Butcher), `blockDrop` |
| `52-clouds` | cloud layer: raymarched in a shader (`cloudMat`), cover/dark per weather (`CLOUD_COVER`), wind drift (`updateClouds`); shared GLSL + ground shade `CLOUD_GLSL` in 04. Fog per eye (`applyMist`), rainbow (`rainbowMesh`) |
| `53-storms` | lightning (`strikeLightning`, bolts, thunder), fire on players/creatures (`fireT`), hail, aurora strength (`uAurora`). Fire blocks: `B.FIRE` tracked in `FIRE_CELLS`, `igniteAt`, burn table `_BURN`, ash `B.ASH`; the blood moon |
| `57-camera-filter` | what lands on each seat's lens, a canvas first in its pane (never assume the pane's first child is `.hudScale`): rain drops, water, snow, frost, lightning flash (`cameraFilterLightning`), fire; `updateCameraFilter` |
