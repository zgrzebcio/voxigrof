# voxiGrof — notes for Claude

A voxel survival game in the browser: plain JavaScript and three.js, with no build step. `index.html`
loads `js/NN-*.js` as ordinary scripts in number order, so they all share globals.

## Rules
- **Save credits.** Do not play-test in the browser unless the user asks. At most, do a quick
  syntax check. Keep reports short: what changed, where, and anything open.
- **"answer only"** means answer the question. Do not change code.
- **Versions.** The user names the version (e.g. "0.793"). Bump `alpha X` in `index.html`. If
  `css/style.css` changed, also bump its `?v=` in `index.html`. Tag new code comments with the
  version, e.g. `(0.793)`, as the existing code does.
- **Textures.** Never overwrite an existing texture. Keep the old one as `old_<name>.png`. Only draw
  a texture when asked to. When a block texture changes, bump `GAME_VERSION` in `00-config.js`.
  It keys the cached atlas, so without the bump players keep seeing the old texture.
- **PowerShell variables ignore case.** `$h` and `$H` are the same variable, and `R` is an alias
  (Invoke-History), so don't name a helper function `R`.
- **Questions.** Ask when a design choice is really unclear (the user welcomes it). Otherwise make
  a sensible choice and say so in the report.
- **Test data.** Port 8407 holds the user's real profile and worlds. Never clear it. Test on the
  fresh ports 8408/8409 (`.claude/launch.json`, `.claude/serve.ps1`). Those files are ignored by
  git, so recreate them if they are missing.
- **Shell.** The Bash tool here has no coreutils (`ls`, `grep`, `tail` fail). Use PowerShell or the
  Grep/Glob/Read tools.
- **README.md.** Update it only when a player-facing feature changes, and keep it short.

## Code facts
- **Cells.** A cell is a Uint32: bits 0-7 hold the block id and bits 8-15 hold the variant (shape,
  rotation, log width, water level...).
- **Chisel shapes** are VARIANTS of the full block, never new ids: slab, stairs, pane, fence,
  carpet/layer, cover, wall. `SHAPE_BLOCKS` in 58-blocks lists which blocks support each shape.
- **Stacked layers.** Mixed carpet/layer stacks live in `LAYER_STACKS` (11-chunks.js), a sparse map
  per chunk.
- **The worker core.** `VOXEL_CORE` in 02-voxel-core.js is turned into a string and run inside the
  mesh/worldgen worker. It must not touch main-thread globals. Export through its `return {...}`,
  then destructure from `CORE` on the main thread.
- **Fixed tick (0.8378, MultithreadPlan.md "Progress").** `SIM_FIXED`/`SIM_HZ` 20 (00-config): `simTick` (22) steps the
  world's clockwork (growth, furnaces, saplings, grass, leaf decay, fluids, TNT, the world clock `advanceWorldClock`)
  at a fixed rate; players, entities, drops, visuals stay per frame with dt capped at `FRAME_DT_MAX` 0.1. A new
  world-logic system with timers goes in `simTick`; anything drawn or budgeted per frame stays in frame().
  0.8379: each seat's `tickStats` and `tickSpoilage` run in simTick too (per seat, while `player._statsLive`);
  `updateVitals` (19) no longer calls tickStats when SIM_FIXED. 0.838: creatures too (`updateEntitiesTick`), drawn
  between ticks (`updateEntitiesFrame`); a ridden horse per frame. Anything that eases a model part from its own
  current transform is fine (the tick's pose is put back before each tick).
- **Worker jobs (0.8381-0.8383, MultithreadPlan.md B1-B3).** A `gen` reply carries `emit` (light emitter candidates)
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
  Performance plan: MultithreadPlan.md "Part C".
- **F3 timings and chunk table (0.83851, Part C1/C2).** `perfLap(name, t)` / `perfNow()` (22) time frame and simTick parts
  while F3 is shown; wrap a new heavy system in a lap. `getChunk` (11) answers from an 8x8 table (`CHUNK_CACHE`); any
  change to the `chunks` Map MUST call `_chunkCacheClear()`, or reads see a stale or missing chunk.
- **Part C3-C6 (0.83852).** Far calm creatures step every 4th tick (`_entDue`, 28): in `updateEntities` the param is
  `dtAll` and `dt` is per creature, so new code there keeps using `dt`. Off-screen creature models are not posed per frame:
  never read a model part's transform for gameplay, use `e.x/y/z`. Render scale `applyRenderScale` (06). Chunk meshes are
  refilled in place (`_meshRefill`, 11): a chunk mesh's geometry may hold more than it draws (drawRange); never read its
  arrays' full length as the mesh. Drop light is read once a tick (`_dropLitTick`, 15).
- **Part C7-C10 (0.8386).** Shared memory: `coi-sw.js` (service worker adding COOP/COEP; GitHub Pages) makes the page
  cross-origin isolated; then `c.data`, `c.sky`, `c.light` are SharedArrayBuffer-backed (`SHARED_OK`, `newSharedArr`,
  `shareArr` in 00-config). NEVER put a chunk array's `.buffer` in a postMessage transfer list or IndexedDB (a shared
  buffer throws / cannot be stored): post the view without transfer, or `.slice()` the typed array (gives a normal copy).
  New chunk arrays: allocate with `newSharedArr`. Mesh jobs carry raw arrays and the worker packs light (`meshJob` in
  WORKER_MAIN). Block light (`LIGHT_THREAD`): with shared memory every flood runs in the light worker (08 `_lightPost`),
  async: light shows a frame or two late, and the main thread must not write `c.light` itself; a chunk arriving calls
  `lightRegister`, an unload `lightForget`. Fast leaves (`FAST_LEAF_TILE` 0x8000 in a face's tile, 02/04): a tile index
  must stay under 0x8000. Far regions (`_regionTouch` before changing a chunk's meshes, 11): code that changes
  `c.meshes` outside applyOneMesh/dispose/retire must call it, or a stale merged copy keeps drawing.
- **Blocks live in 58-blocks.js (0.8376).** `BLOCK_CORE` (B, T, PROPS, V, tile sets, model boxes, SHAPE_*, SHAPE_BLOCKS,
  layer/slab-mix and value helpers) is stringified into the worker like VOXEL_CORE and loaded before 02. A NEW name
  declared there must go in its `return {...}` AND in the `const {...} = BLOCKS` at the top of VOXEL_CORE (and in
  VOXEL_CORE's return if the main thread needs it). Mutable mesher state (`_climAt`/`setTintSampler`, `TINTED`) stays
  in 02. Headless test harnesses must load 55-biomes.js, then 58-blocks.js, then VOXEL_CORE. Items are 59-items.js (0.8377).
- **Units.** Model sizes are in 16ths of a block. Block art is 128x128 (0.808; older 64x64 art is stretched 2x with nearest). Log width is still in 64ths (geometry, not texels).
- **Block textures (0.809)** are one texture ARRAY (`DataArrayTexture`, 03-atlas), a layer per tile, not a 2D
  sheet. A face's tile index is a Uint16 layer. A new tile needs its name in `ATLAS_TILES` (03) AND its id in
  `T` (58-blocks since 0.8376) at the same index; boot logs an error if they disagree. Furnace rock / bench wood tiles are
  generated from `FURNACE_ROCKS` / `BENCH_WOODS` (01) and `FURNACE_T` / `BENCH_T` (02).
- **Mushrooms (0.821):** one 256x128 sheet per kind (`MUSHROOM_KINDS`, `MUSHROOM_LAYOUT` in 01), cut into part tiles at atlas
  build (`CROP_TILES`, 03). Variant bits 0-2 = grown size, 3-7 = steps left to grow (`emitShroom` 02; growth, life and
  autumn spawning `_shroomChunk`/`updateShroomGrow` in 51). Grilled mushrooms are BLOCKS that are food: use `foodPropsOf` (54).
- **Mushrooms (0.8091)** are box models (`SHROOM_MODEL`, `emitShroom` in 02) but keep model `'cross'` so plant
  rules still apply. Their sheets (`MUSHROOM_NATIVE`, 03) sit unstretched in a layer's corner at 8 texels a
  model pixel, and the mesher maps them 1:1 (1 model px = 1/16 UV).
- **Level of detail (0.8092):** `chunkLod` (11) gives each chunk 0/1/2 from its distance (half / three quarters of
  the render distance); `meshChunk(..., lod)` (02) drops small models at 1 and meshes a 2x2x2 downsample at 2
  (`lodDownsample`: a group is solid if any cell is, so borders never open holes).
- **Built and animated tiles (0.8093):** `COMPOSITE_TILES` (01) are made at atlas build from a base + overlay
  (grass sides, gem ores); `ANIMATED_TILES` (01) are vertical frame strips whose extra frames sit after the
  tiles, swapped in by the `TILE_LAYER` lookup texture (03, sampled in 04) that `updateTileAnimation` steps.
  Its second channel is a glow mask layer (`EMISSIVE_TILES`, 01, 0.8094): masked pixels ignore lighting.
- **Block light** can exceed 15 (glowcrystal 18) for reach, but readers cap at 15 (`getLightWorld`, mesh packing);
  relight radii use `LIGHT_REACH` (08), not `GLOW_LEVEL`.
- **Look variants in bits (0.809):** furnace rock bits 3-5, bench wood bits 2-4 (`V` in 02), chest wood
  bits 4-5 (`CHEST_WOOD_SHIFT`, 30). The variant bar places them through `bits` in `BLOCK_VARIANTS` (46).
- **Light through shapes (0.819):** `CORE.lightDim(v)` is how many extra levels light loses LEAVING a shaped cell of an
  opaque block (slab 4, stairs 6...). Sky/block light queues carry the outgoing level; setBlock relights when it changes.
- **Biome revision (0.819):** `makeGen(seed, type, biomeRev)`; worlds keep `w.biomeRev` (missing = 1; 2 bigger snow/desert;
  3 (0.8193) fewer desert hills; 4 (0.822) pink warm beaches; 5 (0.823) bigger biomes, deep/spruce forests, fewer oceans; 6 (0.8231) tall spruce forest trees; 7 (0.8232) the climate ladder; 8 (0.833) every biome 2x (BS 1/3); 9 (0.835) the Ice Spikes biome (`iceSpikesAt` in 55, `SPK` and the
  spike pass at the end of genChunk, also icebergs in snow seas); 10 (0.8351) Snowy Hills (`sh` in terrainInfo) and big icebergs
  (`BIG_BERGS`); 11 (0.8353) oceans 3x bigger (`OS` on the continent and deep noise) and FLOWING rivers (`FLOW` in 55: springs
  traced downhill on `_drain` to the sea, spilling through basin lakes, `_riverAt` from bucketed segments; the noise rivers off,
  noise lakes kept as ponds); 12 (0.8354) taller land, mountains eased toward 240 (`TALL` in 55); 13 (0.8356) shores
  (`SHORES` in 55: `shoreKindAt` turf/sand/gravel, `cliffAt` lifted rocky coasts, `shoreWidth` ragged 1-6; genChunk and biomeAt
  share them); 14 (0.83547) hills, crags and plateau cliffs (`HILLS`, the `hl` block in terrainInfo), more and sharper rocky coasts,
  sea beaches 1-10 (genChunk: wet grid `WW` is `WG` square with a `WM` 10 margin, ponds under `POND_MIN` 9 cells filled, `steep`
  faces bare stone, `under` = a beach's sand/gravel under the shallows); 15 (0.83548) water at its own height (`UPLAND` in 55: river
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
  20 (0.837) `RIME2`: the Coldest Deep Snow split by `rimeW` (55) into its Forest (trees and ice at half) and the open
  Coldest Deep Snow (`calm`: hills, snowy hills and mountains eased away, `rimeKeep` 0.12 trees/ice; castle land for
  0.838); `SHROOMS2`: surface mushrooms under any tree by its kind, white beside trees, 30% more (genChunk)
  — new worlds), so old worlds' new chunks still match their old ones.
- **Rime wood (0.836):** B 214-218 (log, stripped, planks, leaves, hollow), T 379-384. No sapling yet: leaves drop sticks
  only (50). Rime planks recipe is APPENDED to RECIPES_ADVANCED with `basic: true, after:` (25 `_basicRecipes`): recipe
  indices are saved, never insert a recipe mid-list. Deep snow air about -22 (`DEEP_SNOW_CHILL`), `TEMP_FLOOR` -75 (54).
- **World switches (0.837):** `w.dayNight / weather / clouds / animals / monsters` (false = off, missing = on), set at
  creation. Day-night off: `updateDayNight` pins noon (07). Weather off: `_titleCalm` (51) also true. Clouds off:
  `updateClouds` hides the layer (52). `worldHasAnimals` / `worldHasMonsters` (28). Worlds stamp `APP_VERSION` (the
  alpha number, 16-worlds) as created/last version; the world list shows it and the world gen (biomeRev).
- **Building wand (0.8371):** `ITEM.BUILD_WAND` 408 (art textures/Items/Tools/build_wand.png, the stick tinted
  purple), creative palette only. `doPlace` hands it to `wandBuild` (13): BFS over exact-value matches in the clicked
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
- **World height (0.8354):** 250 tall, y 0..249. `CHUNK_Y` / `WORLD_TOP` (00-config) on the main thread, `CY` in VOXEL_CORE (02):
  the two must match. Never write 199/200 for the top again. Cell index is still `x + z*16 + y*256`, so saves are unchanged;
  `TERRAIN_KEY` (11) was bumped so no cached 200-tall chunk is read.
- **Ice by climate (0.8351, 51):** `_iceKindAt(x, z, depth)` eases `mainGen.climateAt` between 8-block lattice corners (`_iceLat`,
  0.8352) with a noise-wobbled edge (snow > ~0.3: 1 land/lakes/rivers/shallows frozen, 3 open sea (depth ≥ 4) frozen bar `_iceHole`
  blobs, never melting); `climateAt().inland` = river or lake. `iceDressChunk` re-meshes neighbours whose border it froze (0.8352). Prefab field `lift` raises a group member
  (the village houses: 1); `_resnowAround` (34) re-covers dirt round a blended prefab in the snow.
- **Polar bear (0.835, 28):** kind 'polar_bear', a grazer (`isGrazer`, `_updateGrazer` gets `tp`) that hunts: `hunting`/chase branch and
  `_mobStrikePlayer`; a hit sets `aggroT` instead of fleeing. Spawn `_rollPolarBears` (snow climate + shore, or Ice Spikes). Sheet
  polar_bear.png box-UV regions listed at `buildPolarBear`.
- **Far ring (0.8193):** `drawDist()` = `viewDist` + `FAR_RING` (4) chunks loaded and drawn at LOD 2, no creatures shown; fog and camera
  reach use drawDist. `viewDist` is still the full-detail setting.
- **Batched lighting (0.8193):** `relight`/`reskyAround` take a box (x2, y2, z2); `_litEdits` (22) runs edits with light held and relights once per area.
- **Vitals (0.82).** Everything a player's numbers are lives in 54-stats-effects.js. Bars are 0..100 (stamina and oxygen 0..200 since 0.831, `vit.s2` marks it); any damage or heal
  to a player is written x `VITAL_K` (mob `dmg`, arrows, lightning, falls...). A save's `vit` record marks the 0..100 scale;
  without it `restoreVitals` multiplies hp/food/saturation up.
- **Entities (0.823)** are on the 100 scale too: mob health, hunger, thirst and every damage number (weapons, arrows, mobs)
  are x5 in the data; a saved entity row ends with 5 (older rows are scaled up in `restoreEntities`).
- **Climate colour (0.8231):** grass and water blend smoothly by climate. The mesher gives tinted tiles (`TINTED`, 02) a
  per-vertex `clim` attribute (-1 cold .. 1 warm, `climAt` in 55, set in the worker by `setTintSampler`); the fragment
  shader (04) reads row 1 of `TILE_LAYER` (03): 1 = mix toward the warm/cold tile (T 310-319), 2 = water (`WATER_TINT`).
- **Climate ladder (0.8232, biomeRev 7):** `CLIMATE_LADDER` (55) gives every land biome a temperature level -3..3 (edges in the
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
- **Fluid flow is OFF (0.8245):** `FLUID_FLOW` (00-config) gates `queueWaterAt`/`queueLavaAt`/`updateFluids` (22). Shadows off:
  the chunk shader uses sky light as the shadow (`sS`, 04), so caves stay dark.
- **Heatstroke and sandstorm (0.825, 54):** `p.heatstroke` 0..100 (`_tickHeatstroke`, `heatstrokeMuls`, saved as `vit.hs`;
  death after the armor soak in 19); exposure sampled with temperature (`_sampleExposure`: `_hsSun`, `_roofed`, `_sandAim`).
  Sandstorm = desert region's 'windy' (`sandstormAt` 51); body `p._sandFelt`, fog per eye `_sandAround` (52), sand `_fxSandstorm` (49).
  Blur `#heatBlur` and mirages (`showMiragesFor`, per view in 36) live in 19.
- **Render passes (0.8263):** 0 opaque, 1 cutout (leaves, plants), 2 water, 3 lava, 4 glass (blended, no depth write, `matGlass`
  in 04). Shapes and carpets mesh through `emitBoxFaces(..., ps)`; `_shapePass` (02) keeps a glass shape in pass 4.
- **Mixed slabs (0.8263):** `SHAPE_SLAB_MIX` (0x90 + low half's rotation) on the low half's id; the two ids sit in `LAYER_STACKS` like a
  mixed carpet (`slabMixIdsAt`/`setSlabMix`/`breakSlabMixHalf` in 11). shapeOfVal is null, so it acts as a full block;`n  rotation bits 8 (SLAB_MIX_SEE: a glass half, not opaque) and 1 (SLAB_MIX_HIGH: the cell id is the glowing high half), 0.8264.
- **Variant shapes (0.8263):** every look takes its default's shapes (`VARIANT_FAMILIES` in 58-blocks; 46 logs an error if BLOCK_VARIANTS disagrees).
- **Berry bushes (0.827):** five kinds (`BERRY_BUSHES`, 58-blocks; ids: black 138 = old YELLOWBERRY, yellow 201, white 202), six stages in the variant's
  low 3 bits (`BERRY_STAGE`, own art per kind `T.BERRY_<KIND>_S<n>`); kind by place in genChunk. `lightByVar` = light per variant (08 `blockLightOf`).
  Growth-stage variants (berry, wheat) use `VARIANT_DEFAULT_BITS` + `VARIANT_LINEAR` (46). ITEM.BLACKBERRIES is 388 (old YELLOW_BERRIES).
- **Death mark (0.827):** `player._deathMark` {x,y,z,left}, `#deathMark` on the pane (19, 36), saved as `deathMark`. Furnace chimney:
  `chimneyHeight` (02) = rock walls on it (mesher cap, 49 smoke, 26 choke test).
- **Rain and snow (0.83):** `precipAt(x, z, y)` (51) = { rain, snow, blizzard } blended per region (`_regionPrecip`; snow per
  `_snowsIn`: snow region, 95% of winter). Particles `_fxWeather` + `_fxRainLand` (49, own pools `FX.weather`/`FX.puddles`,
  `FX_RAIN` flag), fog `_precipAround` in `applyMist` (52), ground `updateWeatherGround` (51: rain washes snow/ash/salt
  layers, snow lays layers, salt on shores). `blizzard` is a WEATHER_TYPE (`regionCold`). Cold snow layers melt x0.1 (33).
- **Ice (0.8321):** `B.ICE` 203, pass 4 like glass. New chunks freeze in their data on arrival (`iceDressChunk`, from finishChunkGen; no setBlock); later freeze/thaw on the season pass (`_iceChunk`, 51: top water cell only;
  snow biomes always, winter elsewhere but deserts, thaw by day). Heat melt `iceMelt` (51) fed by the setBlock hook
  (`iceHeatPlaced`/`iceQueueIfHot`, 11) and a held torch (`iceWarmHeld` from tickStats). Broken ice leaves water (22) only when its variant is ICE_FROM_WATER (0.833, set by freezing); placed/structure ice breaks to nothing and never thaws.
- **Torches and burnout (0.834, 56-torches.js):** `B.TORCH` (23) is the FIRE torch; `TORCH_UNLIT` 209, `CRYSTAL_TORCH` 210; all three
  have `PROPS.torch` (emitTorch, wall placement/support, held fattening) — check that, not `B.TORCH`, for "any torch". Fire-only rules
  (ice/snow melt, heat, dry, doused under water, sets mobs alight) still test `B.TORCH`. `BURNS` map "x,y,z" -> world-second due
  (`BURN_S`, `BURNT_AS`), fed by `burnPlaced` (setBlock hook) and `burnSeen` (finishChunkGen emitter scan), run by `updateBurns` (from
  updateSeasons), saved as world `burns`. Held: `tickHeldBurn` (from tickStats), clocks `p._torchBurn` saved as `vit.tb`. Spent glow
  blocks `GLOWSTONE_SPENT` 211 / `GLOWCRYSTAL_SPENT` 212 (grey tiles built in 03, `greyed`).
  0.8373: due times are on the lights' own clock (`_burnNow`: world seconds x `burnRate` = random tick / 5; 0 stops all
  burning and rain dousing, held too), saved as `burns: { clock, list }` (a bare list = old save on the world clock).
  Placed in creative (`_placingByPlayer` + canFly) = `BURN_NEVER` (-1), never burns. A world's tick speed 0 is kept now.
- **Bed art (0.8342, 29-bed.js):** four grey 512x192 sheets in Interactables/Bed (`BED_PARTS`: frame, blanket, sheet, pillow), same
  layout (top | underside, then side | head | foot, 128 px a block); `bedTexture(wood, colors)` tints each part and lays them into one
  texture (frame by its planks, bedding by `BED_COLORS_DEFAULT` until dyes; `setBedLook` re-skins). Wood in variant bits 4-5
  (`BED_WOOD_SHIFT`, variant bar like the chest). Model `_bedGeometry`: mattress+rail box over 4 legs, BED_H 0.5, and a raised
  pillow box (0.8343, `BED_PILLOW_*` rects measured from bed_pillow.png: its side/head strips are moved to rows 192+ of the
  512x320 bed texture and the sheet fills their gap; its top is a pillow-only copy there too, 0.8344; those copies are filled
  solid, 0.8345, and the box is rounded in geometry instead, `BED_PILLOW_R`/`_RV`, 0.8346).
- **Light colour (0.834):** `c.light` = level (bits 0-4, `LIGHT_LEVEL_MASK`) | `LIGHT_COLD_BIT` 0x80 from `coldLight` sources (08 flood
  carries it; sources are `[x,y,z,level,coldBit]`). The mesh light is Uint16: bit 8 = cold (`LIGHT_COLD`, `litMax` in 02); the
  shader (04) mixes `uGlowColor` toward `uColdGlowColor`. Icons/drops pass Uint16 light arrays too.
- **Bosses (0.839, 60-bosses.js).** The Frozen King is a creature (`ENTITIES`, kind `frozen_king`, `e.boss`): updateEntities
  hands it to `updateBoss`, `damageEntity(ent, dmg, src)` hands its hits to `bossTakeHit` (pass `src` {x,z}, the attacker's
  place, so its shield can tell front from back), arrows/snowballs ask `bossDeflects`; mobs, fire and lightning leave it
  alone; never saved (`serializeEntities` skips it). Spells are `BOSS_FX` (stepped in simTick, drawn by `_tickPoses`).
  All numbers in `FK`. Not placed anywhere yet: F8 with F3 open (`bossDebugSummon`). Boss boost = `p._feats.bosses`
  (35, saved with the feats): `bossXpMul` in addXP. Effects `frozenCurse`/`iceDaze`/`bossBoost` are added to EFFECT_DEFS
  from 60; effects may now carry `jumpStrength` and `coldResist` too (54). Last quest: a `{ boss, need }` requirement and
  `fixedXp` (47). A new boss: a kind, a builder, an `updateBoss` branch, its quest.
  0.8393 the snow castle (structures/snow_castle.json, in the manifest, spawn chance 0 so it never spawns as a lone prefab):
  `LAIR` in 60. Sites from the seed per 4096 cell: `rimeOpenAt` (55, exposed by makeGen; the open Coldest Deep Snow's
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

## Where things are (search inside the file for the name given)
| File | Feature |
|---|---|
| 00-config | settings, constants |
| 01-textures-data / 03-atlas / 04-materials | texture list, texture array build and cache, three.js materials and shaders |
| 58-blocks | (0.8376) every block: ids `B`, tiles `T`, `PROPS`, variant bits `V`, log width, model boxes, chisel shapes (`SHAPE_*`, `SHAPE_BLOCKS`, `shapeBoxesAt`), layers, mixed slabs, value helpers (`shapeOfVal`, `solidVal`, `opaqueVal`). BLOCK_CORE / `BLOCKS`, loaded before 02, shipped into the worker |
| 59-items | (0.8377) every item (ids 256+): `ITEM`, `ITEM_PROPS`, and the passes over them (tool wear, meat rotting into rotten flesh). Main thread only; loaded right after 02 (it reads `B`) |
| 02-voxel-core | tool tables (`MINE_REQ`, `TOOL_BLOCKS`), worldgen (`genChunk`), trees, mesher (`meshChunk`, `emitLog`, water); takes the block registry from `BLOCKS` |
| 05-icons | inventory icons, rendered from the mesher |
| 06-renderer / 07-sky | scene and camera, sky, day/night. Sky 0.817: dome shader (`skyDomeMat`, haze `SKY_GLSL` in 04 shared with fog), sun, moon phase (`moonPhase`, own wheel `moonSky`), stars, meteors, lens flare (`_aimFlare`); `skyLightDir` = shadow light. 0.818: sun path by season (`SKY_LAT`, `sunDeclination`), `sunTimes`/`isDarkTime` = night for mobs, beds, particles |
| 08-light-glow / 09-light-sky | block light, sky light |
| 10-workers | worker pool for meshing and worldgen |
| 11-chunks | chunk load/unload, `getBlock`/`setBlock`, layer stacks, snow/grass hooks, terrain cache |
| 12-player | movement, collision, drag in snow/layers |
| 13-actions | place and break, `_shapeVariantFor` (chisel placement), hollow-log filling |
| 14-mining / 15-drops | break progress and tools, dropped item entities |
| 16-worlds | save/load, migrations of old saves |
| 17-input / 18-hud | keyboard, mouse, gamepad, HUD |
| 19-vitals | the vitals HUD strip (`VIT_LAYOUT`, 5 icons a bar, temperature dial, hover tips `vitalsTipAt`), outside hazards (fall, cactus, lava, fire), armor soak, death |
| 20-inventory-ui | inventory window, virtual cursor, tooltips |
| 21-spawn / 23-boot | spawn point, startup |
| 22-main-loop | frame loop, grass spread, falling blocks, leaf decay, mining tick |
| 24-hands | held item in the hand |
| 25-crafting | recipes (`timeToCraft`, `xpToGive`), crafting list, queue, pulling from chests |
| 26-furnace | `SMELT_RECIPES`, fuel, ashes, smelting book |
| 27-doors / 29-bed / 30-chest | doors, bed, chests (double chest) |
| 28-entities | mobs and animals: AI, spawning, levels |
| 31-equipment / 40-shield | equipment slots, armor points (`ARMOR_QUARTER`) and wear, set bonuses, worn armor on the preview and on players in the world (`syncArmorOnModel`, per-part `EQUIP_TEXTURES`), the equipment panel; shield (31-armor.js until 0.82) |
| 32-sound | sounds, loops |
| 33-felling | tree felling, log width cuts, leaf litter |
| 34-structures | generated structures, loot chests |
| 35-leveling | XP, levels, XP bar |
| 36-splitscreen / 37-profiles | split-screen seats, profiles |
| 38-ranged / 39-taming | bow and arrows, taming and horses |
| 41-backpack / 42-feed | backpack, event feed (the messages on the side) |
| 43-chisel | chisel item, radial menu (`CHISEL_SHAPES`), shape icons |
| 44-spoil | food spoiling |
| 45-skills | `SKILLS` tree data, `hasSkill`, skill tree UI (K) |
| 46-variants | block variants (`BLOCK_VARIANTS`, stone -> brick), variant bar, R / D-pad Right, `heldBlockOf` |
| 47-quests | starter quest chain (`QUESTS`), quest box top right, `updateQuests` |
| 48-menu-ui | `uiConfirm` dialog, menu gamepad cursor (`updateMenuPad`) |
| 49-particles | particles: pools (`FX.bits`, `FX.sprites`, `FX.decals`), `fx*` emitters, ambient sampling, `updateParticles` |
| 50-loottable | `LOOT` roll lists (`[[count, chance], ...]`), `rollLoot`, `lootBonus` (Prospector/Butcher), `blockDrop` |
| 51-seasons | calendar (`gameDate`, `seasonGrowth`; `seasonsOn()` false = world fixed on 1 July, 0.818; title backdrop's random day `randomTitleDay` + `seasonDressChunk`, 0.8194), weather and wind (`weatherAt`), season sweep (`SEASON_MEM`, `_seasonChunk`), wheat growth |
| 52-clouds | cloud layer: raymarched in a shader (`cloudMat`), cover/dark per weather (`CLOUD_COVER`), wind drift (`updateClouds`); shared GLSL + ground shade `CLOUD_GLSL` in 04. Fog per eye (`applyMist`, schedule `mistAt` in 51), rainbow (`rainbowMesh`) |
| 53-storms | lightning (`strikeLightning`, bolts, thunder), fire on players/creatures (`fireT`, `_entBurnDeath` in 28), hail (`hailAt` in 51), aurora strength (`uAurora` on the sky dome). Fire blocks (0.8191): `B.FIRE` (model 'none', light 13) tracked in `FIRE_CELLS`, `igniteAt`, burn table `_BURN`, ash `B.ASH` |
| 55-biomes | the land's shape and biome names, moved out of makeGen (0.823): BIOME_CORE / BIOMES.makeBiomes (`terrainInfo`, `biomeAt`, `birchAt`, `snowForestAt`, climate colour `climAt`), `biomeBase` (Deep/Warm/Cold stripped, for biome-keyed lists). Stringified into the worker before VOXEL_CORE (10-workers) and loaded BEFORE 02 in index.html; self-contained like VOXEL_CORE |
| 56-torches | torches and glow blocks burning out (0.834): `BURNS`, `updateBurns`, rain dousing, held burn `tickHeldBurn`, relighting `tryLightTorch` (flint / glow crystal) |
| 57-camera-filter | (0.837) what lands on each seat's lens, a canvas first in its pane (so never assume the pane's first child is `.hudScale`; 36 finds it by class, 0.8372): rain drops that run, drops out of water, snow that melts, blizzard frost, lightning flash (`cameraFilterLightning`), fire; `updateCameraFilter` from the frame loop |
| 60-bosses | (0.839) bosses: the Frozen King (`FK` numbers, `buildFrozenKing`, `spawnFrozenKing`, `updateBoss`, shield `_bossShieldTick`, curse `_bossCurseTick`, attacks `_bossAct` -> fireball / spikes / fly + carpets / beams in `BOSS_FX`), boss boost (`bossXpMul`), boss bar and quest marker (`syncBossHud`), F8 summon (`bossDebugSummon`) |
| 54-stats-effects | ALL player stats and effects (0.82): vital caps (`MAX_HP`... out of 100, `VITAL_K` = 5 from the old 20), over-stats (`OVER_KEY`, `gainStat`/`drainStat`), `tickStats` (stamina, thirst, energy, nutrients, oxygen), `ambientTemp`, drinking (`updateDrinking`), `FOOD_NUTRITION`, save (`serializeVitals`/`restoreVitals`), stat getters + `STAT_TIPS`, `EFFECT_DEFS` and the effect bar |
