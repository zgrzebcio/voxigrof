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
  carpet/layer, cover, wall. `SHAPE_BLOCKS` in 02 lists which blocks support each shape.
- **Stacked layers.** Mixed carpet/layer stacks live in `LAYER_STACKS` (11-chunks.js), a sparse map
  per chunk.
- **The worker core.** `VOXEL_CORE` in 02-voxel-core.js is turned into a string and run inside the
  mesh/worldgen worker. It must not touch main-thread globals. Export through its `return {...}`,
  then destructure from `CORE` on the main thread.
- **Units.** Model sizes are in 16ths of a block. Block art is 128x128 (0.808; older 64x64 art is stretched 2x with nearest). Log width is still in 64ths (geometry, not texels).
- **Block textures (0.809)** are one texture ARRAY (`DataArrayTexture`, 03-atlas), a layer per tile, not a 2D
  sheet. A face's tile index is a Uint16 layer. A new tile needs its name in `ATLAS_TILES` (03) AND its id in
  `T` (02) at the same index; boot logs an error if they disagree. Furnace rock / bench wood tiles are
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
  it), plains halved (`PLAINS_FROM`, half the warm band), 2x plains trees, oaks to 199 on mountains
  — new worlds), so old worlds' new chunks still match their old ones.
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
- **Variant shapes (0.8263):** every look takes its default's shapes (`VARIANT_FAMILIES` in 02; 46 logs an error if BLOCK_VARIANTS disagrees).
- **Berry bushes (0.827):** five kinds (`BERRY_BUSHES`, 02; ids: black 138 = old YELLOWBERRY, yellow 201, white 202), six stages in the variant's
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
- **Value-based helpers.** Ask a whole cell value what it is with `CORE.shapeOfVal`, `solidVal`,
  `opaqueVal` and `shapeBoxesAt`. Do not check the bare id.

## Where things are (search inside the file for the name given)
| File | Feature |
|---|---|
| 00-config | settings, constants |
| 01-textures-data / 03-atlas / 04-materials | texture list, texture array build and cache, three.js materials and shaders |
| 02-voxel-core | block ids `B`, `PROPS`, items, shapes (`SHAPE_*`, `shapeBoxesAt`), worldgen (`genChunk`), trees, mesher (`meshChunk`, `emitLog`, water) |
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
| 54-stats-effects | ALL player stats and effects (0.82): vital caps (`MAX_HP`... out of 100, `VITAL_K` = 5 from the old 20), over-stats (`OVER_KEY`, `gainStat`/`drainStat`), `tickStats` (stamina, thirst, energy, nutrients, oxygen), `ambientTemp`, drinking (`updateDrinking`), `FOOD_NUTRITION`, save (`serializeVitals`/`restoreVitals`), stat getters + `STAT_TIPS`, `EFFECT_DEFS` and the effect bar |
