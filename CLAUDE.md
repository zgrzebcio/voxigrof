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
  declared twice, the cores' parts, load order, a core using a page name, names taken out of a core that its return
  lacks, names declared nowhere). The work is in `toolsrc\check-scripts.js` (node; `node toolsrc\check-scripts.js <folder>`
  checks another folder, its own test). `toolsrc` is ignored by git: recreate the scripts if they are gone.
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
  per wood beside it (`oak.js`, `birch.js`, `spruce.js`, `rime.js`, `palm.js`, `dry-bush.js`, `acacia.js`, `jungle.js`: their order in
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
- **Looks in a cell's bits** (0.84691, `blocks/looks.js`, BLOCK_CORE). A look (granite brick, polished stone, carved...)
  is its BASE block's id with the look's number in bits 16-23 (`defineLook(base, n, key, name, tile, { was, pillar,
  rot, matFaces })`; numbers are in the saves, never change one). Ask a value with `lookOf`, `withLook`,
  `lookEntryOf`, `facesOfVal`, `nameOfVal`, `matKey` (id + look: "the same block"). A look changes only art, name,
  pillar and a model's materials: never opacity, light or behaviour. The side lists (`LAYER_STACKS`: mixed stacks,
  mixed slabs) hold Uint16 ENTRIES `id | look << 8` (`stackEntry` / `stackVal`): read an entry's block with `& 255`.
  A broken look gives its block (`blockDrop` takes a value). The bar's options are `{ id, look }` (`heldLookOf`).
  Looks that behave unlike their base stay ids (`VARIANT_BLOCKS`: ice brick, snow brick, snow-ice brick, carved snow
  and ice, thatch). The ids the looks had (`LOOK_OF_OLD_ID`) are converted on load only in worlds and prefabs without
  the `cells: 2` stamp (`migrateLookVal`, blocks/legacy.js); a value rebuilt from `& 255` loses its look (use `matKey`).
- **Deep beaches, sandy dirt, waves** (0.847, biomeRev 31 `DBEACH`). terrainInfo `db` (warm, a slow pick noise, the
  abyss noise `deepN` = a big ocean, no cliff) and `dbd` (blocks past the beach's inner edge, from the continent noise and
  its slope): the beach's shape (DB_* in biomes/fields.js), the label 'Deep Beach', genChunk's sand / sandy dirt band
  (`DBC`/`DBD`, worldgen/terrain-columns.js) and its palms (`DB_PALMS`/`SHORE_PALMS`, woods/gen-palms.js). `B.SANDY_DIRT`
  254 (T 427): under every palm (palmTree), the palm sapling's only ground (`saplingOn: 'sandy_dirt'`). Waves:
  seasons/waves.js (`WAVES`, `updateWaves` from frame(), `wavePush` read by `waterFlowVec`), sea level `mainGen.seaLevel`.
  Fluids: `open()` takes PROPS `washes` (flint, stone pebble; fluids.js `_fluidWashed` drops it, and a tall plant's
  other half); over its own fallen water a cell also fills `gap`s beside it and feeds (fluids/rules.js `overOwn`,
  `queueOver`): no dry holes in a filled hollow. Test the rules headless (build the cores, makeFluidSim over genChunk data).
- **0.8472.** `B.SEASHELL` 255 (T 428-429, `ITEM.SEASHELL` 425): a carpet-model prop like the flint pebble (blocks/plants.js; boxes from
  the model JSON in 16ths, `_m16`; `partFaces` = art per box, read by the carpet model in chunks/mesher-models.js), laid on sea beaches
  near the wet grid's ocean (`WW` 1, worldgen/desert-and-shore-plants.js), foraged like a pebble. Waves (seasons/waves.js): every crest
  is a swell in ONE mesh (`_waveMesh`, `WAVE_SEG` x `WAVE_ROWS`, filled per frame), breaking ones fall in over `WAVE_BREAK_S`.
  biomeRev 33 `DRY4` (biomes/fields.js): `_dryBand` (biomes/terrain.js) gives terrainInfo and dryAt the Dryland/Savanna wobble eased by
  its curvature and the Dryland's start moved by its slope (`DRY_MIN` 16 blocks); biomeAt reads the mean height (`_meanH`) near 150
  for Mountains and calls a Savanna/Dryland pocket among mountains Mountains (`_mountainPocket`).
- **Wet ground (0.8473), only to look at.** What darkens: `WET_TILE` (chunks/voxel-shared.js, in VOXEL_CORE's return; row 2 of
  `TILE_LAYER`, 03-atlas.js): not rock (type 'stone'), not a light, nothing of pass 2+. Rain: `p._wetRain` per player
  (seasons/wetness.js), set per eye as `uWet` in `applyEyeVolumeFog` (22), darkens faces the sky reaches (FSH, 04). Beside
  water: baked by the mesher (`wetBeside`, `WETC`, `MD_WET` in maskD so wet faces merge only with wet ones, `SHORE_WET_SHADE`
  on the face's shade; chunks/mesher-cubes.js, mesher.js). The wet map (`uWetMap`/`uWetBox`, `wetMark(x, z, top, amount)`):
  WET_N columns round player one, each its wetness and the wet block's top y; the waves' wash (`_waveWash`) and a player's
  drips (`_wetDrips`, puddles in `FX.puddles`). `uWet` and `uWetBox.w` are 0 for icons (05), the hand pass (22) and the
  carried-block copies (player/body.js): a new world-space look must be zeroed in those three too. Clouds (52): a ray gathers
  up to `CLOUD_HITS` cells front to back, a cloud's edge `CLOUD_EDGE_A` as opaque as its heart (`cloudCellCol`).
- **0.8474.** A re-mesh asked for while a neighbour is not in yet is REMEMBERED (`c.dirty`, markDirty in chunks/dirty.js) and
  finishChunkGen's loop meshes a dirty neighbour even with a mesh: dropped, the chunk kept its old mesh (ice lines on chunk
  borders). Fluids: a cell lying on its own kind spreads only into a `gap` or a `poolHole` (fluids/rules.js): generated river
  steps and curtains stay still. Bucket water: `PLACED_WATER` (player/drinking.js, saved as `placedWater`, grown by
  `placedWaterChanged` from fluid writes) is not drunk or bottled. `mainHandBusy` / `offHandBusy` (player/hands.js) put held
  things away while climbing, drinking, drawing. Water's depth shade rides in VSH_WATER's `vDry` NEGATIVE: FSH makes deep water
  opaque. Snowline 185-212 and lifted in warm land (`_snowWarmLift`, seasons/weather-ground.js). biomeRev 34: `PINK_FROM`
  (worldgen/gen-setup.js), `DIV_JOIN` (biomes/fields.js: no divide ridge between waters 2 or less apart).
- **0.84741.** Deep beach palms only to `DB_PALM_TOP` 110 (woods/gen-palms.js; above it the tree loop goes on to the land's own trees).
  `SKY_FLOOR` x `CAVE_DARKEN` 0.7 (00-config.js). biomeRev 35 `REV35` (worldgen/gen-setup.js): `CAVE_GATE` (a slow field, `caveK` in
  worldgen/underground.js, takes the noise caves out of a quarter of the land), `ROOM_SHARE` 0.6 (gen-caves-plan.js), deep-beach pink on
  `DB_PINK_F` / `DB_PINK_UP`. Measured over 60 chunks a seed: cave air 71-77% of rev 34's.
- **0.8475.** Every skill costs 1. Coconut: `B.COCONUT` 238 (a retired look's id), T 430-433 (the green ones built in 03, `COCONUT_YOUNG_TINT`),
  a carpet-model block (blocks/plants.js: stage in variant bits 0-2, `ripeStage` 5, `boxesByVar`/`facesByVar` by stage: the carpet model
  reads `facesByVar` by `va & (length - 1)`, 4 by facing or 8 by stage), `hangs` (never falls by gravity). woods/coconuts.js: spots under a
  palm log beside the trunk, sprout / grow / ripe-fall from updateSeasonGrowth, `coconutLostHold` (setBlock, a palm log gone),
  `coconutLanded` (falling.js), `coconutsOffFelled` (fellTreeFrom), `coconutPrompt` (ui/hud.js). Items `ITEM.COCONUT` 426 (`open`: held
  right button, player/eating.js), `ITEM.HALF_COCONUT` 427 (FOOD_NUTRITION `thirstFull`: thirst when already full). Falling blocks hurt:
  `_fallBlockHits` / `fallBlockHurt` (blocks/falling.js; PROPS `fallHurt` weight, hay 0), `dropBlockFrom(x, y, z, val)` lets a block go.
- **0.8476.** `B.SEASHELL_BLOCK` 239 (a retired look's id, T 434-435): PROPS `rotTop` turns its top and bottom art by the facing
  (`emit`, chunks/mesher-cubes.js). `V_BONE` (items/recipes.js): bone or seashell. Pebble and shell boxes `_m16s` (`PROP_SMALL` 0.7,
  blocks/plants.js). Cobweb looks 1 tangled, 2 corner (`emitCobweb`, chunks/mesher-plants.js: a sheet across the first edge in `WEB_EDGES`
  with two opaque blocks, else a plain cross); the lens web `f.web` (57). `#vitalsNear` (ui/vitals-hud.js, rows with `near`: stamina and
  oxygen under the prompt while the inventory is shut, placed by `updateInteractPrompt`); `#wrongTool` (`updateWrongToolHint`, ui/hud.js;
  `wrongToolHint`, `vg_wrongtool`): both per pane (HUD_PANE_IDS, SWAP_KEYS). Loot chest XP x (1 + 0.25 x chests opened), `_feats.lootChests`
  (saved as `loot`). Bench: E or a right tap takes finished work (`takeDone`). biomeRev 36 `REV36` (worldgen/gen-setup.js): `ORE_MORE_K`
  1.1 for the ores but coal (extra tries after a row's own, so old veins stay), `SAV_TALL` / `SAV_DRY_TALL`, `SAV_FLAT` (biomes/fields.js).
- **0.84761.** Hellhound sleep: `e._sleep` (set each step by houndThink: night `isDarkTime`, or the lie stance; a wild one
  asleep sees only `HOUND.wakeR`), stops a taming's `left` (houndWorldTick); fire `HOUND.sleepFire` asleep, cold burn
  `HOUND.coldFrom/coldTo/coldBurn` from `airTempAt` (houndBody). Taming needs 7/4/3, `taming.gh` = what a kill counts
  (`HOUND.gentle` with Gentle Hand, saved as `tm[7]`; `_houndNeedOf`). Horse `tameTime` 22.4, Gentle Hand 1.2; a horse's stance
  waits `HORSE_STANCE_WAIT` (`stanceNext`, `horseStanceTick`, entities/taming.js). Spiders: `FX.spiders` (`FxCrawlers`,
  49-particles.js; `fxWebSpider` from _fxAmbient, `fxSpiderFlee` from foraging, `PEBBLE_SPIDER_CHANCE`), `arachnophobia`
  (00-config, `vg_arachno`). `WEB_EDGES` / `webCornerEdge` moved to blocks/looks.js (BLOCK_CORE; mesher and spiders share it).
  biomeRev 37 `REV37` (worldgen/gen-setup.js): `WEB_CH`, `LAVA_POOL_CH`, `LAVA_SHROOM_CH`.
- **0.84762.** `B.BONE_ASH_BLOCK` 240 (a retired look's id; T 438 built in 03-atlas.js from the ash block's art, `whitened`): loose like sand
  (LOOSE_LAYER_BLOCKS, SHAPE_BLOCKS.layer, LAYER_STACKING). New recipes appended (packed ice <-> ice, the metal chest, gravel -> flint and cactus ->
  fiber at the mortar, bone ash block <-> bone ash); iron armor's ingots doubled; half coconut `foodReturn: ITEM.BOWL`.
- **0.8477, waterlogging.** A cell's bit 24 `WATERLOGGED` = the block also stands in still water (blocks/waterlog.js, BLOCK_CORE: `isWaterlogged`,
  `isWaterVal` = water or a wet block, `canWaterlog`: not-whole shapes, a carpet that does not fall, clusters, hollow logs, PROPS `waterlog`).
  ONE rule, in setBlock: `waterlogValue(oldVal, val)` (fluids/waterlog.js): put into still water (source) it keeps it, a wet block turning
  into another waterloggable value keeps it, taken away it leaves `B.WATER`, the bit is stripped anywhere else (wand copies). The mesher
  draws a wet cell's water as a still source (`gw` in fluids/mesher-fluids.js, mesher-finish.js); the flow never enters one (`open`,
  fluids/rules.js). 0.84771: the flow reads a wet cell as a still water source (`asFluid` in `rd`, rules.js) and `wr`
  refuses to write one, so it spills out and stays; the page settles flowing water with natural still water on 2+ sides and a floor (`_settleWater`,
  fluids/fluids.js, applied to the sim's writes; PLACED_WATER and lava excluded). Test it all headless: `node toolsrc\test-waterlog.js`
  (24 checks, exit 1 on a failure; it reads waterlogValue and _settleWater out of their files). Ask `isWaterVal(getBlock(...))`, not `& 255 === B.WATER`, where a body is in water
  (player tick, eye, torch doused, fog, creatures). Sky light does not dim through a wet cell.
- **0.84778.** Berry bushes in SEVEN stages (`BERRY_STAGE` in blocks/plants.js: SPROUT 0, SMALL 1, YOUNG 2 new, BUSH 3, EMPTY 4, FRUITLING 5,
  GROWN 6). Tiles: stages 0-5 keep T 326 + kind x 6 + stage, each kind's stage 6 is T 440-444 (blocks/tiles.js, 03-atlas.js end). Saves:
  stamp `cells: 4` (16-worlds.js, prefabs in 34-structures.js); without it `migrateBerryVal` (blocks/legacy.js) moves stage 2+ one up.
  `TERRAIN_KEY` bumped (cached chunks held the old numbers). The variant bar names all six below ripe (blocks/variants.js).
- **0.84774.** `B.RIME_SAPLING` 241 (a retired look's id; T 439 built in 03-atlas.js from `cherry_sapling`, a TEXTURES source with no tile,
  `recolored` with `RIME_SAPLING_TINT`). Woods table: `saplingOn: 'cold'` (snow, dirt or grass, player/place-block.js), `hardy` (grows in winter).
  Sapling trees only (woods/saplings.js; world generation untouched): `_growOak`, `_growBirch`, `_growSpruce` (cone or `_spruceTall` / `_sprucePole` /
  `_spruceTwin` / `_spruceWide`), `_growRimeSpire` (a copy of gen-rime-trees.js' SPIRE). Built with `_treeTrunk`, `_treeLimb` (a cell per axis move, so
  every turn is a mesher elbow), `_treeLeafBlob` (within 5 of its wood), `_treeSkirt`; each ends with `_treePrune` (drops leaves
  isLeavesConnected cannot reach). Page names are one scope: `_limb` was taken (the humanoid rig), hence the `_tree` prefix.
- **0.84765.** Log corners (chunks/mesher-logs.js, emitLog's 3rd joint rule): two same-axis wood logs side by side, one ending at +axis and the
  other at -axis, each draw an arm to the shared face (`joins`) and cut their open end back to its band (`clipHi`/`clipLo`); mesh only, all worlds.
  `hudHidden` hides `selBox` and the wand lines (36-splitscreen.js).
- **0.84763.** Furnace food spoils: `_tickFurnaceSpoil` (44-spoil.js, beside `_tickChestSpoil`; both drain through `_spoilSlots`), the furnace's
  `spoilT` saved as furnace row field 8. The smelt resets when the input's id changes or it empties (`f.inId`, updateFurnaces).
- **0.848, clams, fish in hand, otters.** `B.CLAM` 243 (a retired look's id): a page-drawn block like the termite hill (`pageModel`;
  chunks/stream.js `pageModelSeen` dispatches by id), `waterlog`, variant byte `CLAM_BITS` (BLOCK_CORE, blocks/torch-blocks.js; page
  `BLOCKS.CLAM_BITS`): facing, OPEN, HAS (none/sand/pearl/item), PLACED. blocks/clam.js: instanced bottom + lid from the box model
  (box-models.js reads uv past 16 as 8-px units), `CLAM_ITEMS` (saved `clams`, spoil `_tickClamSpoil`), holds `updateClamHold`,
  `clamTick` (simTick: sand and pearls, wild only). biomeRev 38 `REV38`: clams on warm sea floors (desert-and-shore-plants.js).
  player/fish-hold.js: `player._heldFish` (a fish taken out of the world; `hotbarLocked`, `mainHandBusy`/`offHandBusy`, `FISH_ARM`),
  saved as a fish row at the holder (`heldFishCreature`, entities/save.js `_entSaveRow`). entities/otter.js: body 'otter'
  (`updateOtter`), taming by E with a held fish (`otterGiveFish`), `player._wornOtter` = the otter ENTITY taken out of ENTITIES
  (saved as a row with `wn`, put back on by `otterWorldTick`), `otterScarfCold` in `_resSum`. New creature-table fields: `passive`,
  `fleeTogether` (`_entBolt`, entities/combat.js), `spared`, `prompt`, `subText`, `sounds` (`mobSound`, mobs.js). Fish live by water kind
  (`FISH_WATERS`, entities/fish.js) and flop toward water on land. Items `ITEM.PEARL` 428, `ITEM.FUR` 429.
- **0.8481.** Box models are SCRIPTS: `js/models/*.js`, `defineBoxModel(name, {...})` made from the user's JSON by
  `node toolsrc\json-to-model.js` (a model JSON in textures/ is only how one is handed over: convert it, never fetch it);
  `boxModel(name, png)` and 41-backpack.js read `BOX_MODEL_DATA`. Clam sand fills in steps (`CLAM_BITS.SAND_SHIFT`, bits 6-7) and
  full sand can be taken (a sand farm, wild clams only); the item node's lid sits at its hinge (`_clamHingeOff`). biomeRev 39 `REV39`:
  clams `CLAM_APART` 5 (a hashed rank). Fish: `FISH_DRY_GRACE` 35 s of air (held ones too, `dry` in player/fish-hold.js), fright
  `_fishScare` (a player's `_splashAt`, otters) and `_fleeFrom`. PROPS `frontBack` [front, back] tiles on a rot:'side' cube
  (chunks/mesher-cubes.js; the seashell block, T 445). Otter scarf cold 10% + 0.2% a level + 5% x effectiveness.
- **0.84811.** ui/animals.js: `PET_TAGS` (a tamed animal's name as a plate through the world, `updatePetTags` once a frame,
  `petTagsFor(p, cam)` per view from renderAllViews: only its owner's, by `houndOwner`; no owner on record = everyone) and
  `syncTamingMarks` (per seat: a screen mark over each animal this player is taming, `e.taming`). finishTaming now records the
  horse's `ownerId`. Held fish free in 45/36/30/27 s; otter `sounds` say/hurt at rate 0.6, eat 'chew', no step (block footsteps).
- **0.8482.** ui/waypoints.js: `player._waypoints` [{ name, x, y, z }] (`WAYPOINTS_MAX` 1, a list for the maps), U opens
  `openWaypointDialog` (17-input.js), marks per seat `syncWaypointMarks` (tickPlayer), saved as player record `waypoints`
  (16-worlds.js, `_serializeSlot`; restored in player/tick.js and applyExtraPlayerRestore). `textDialogOpen()` (the
  waypoint's or the naming dialog): pointerlockchange no longer pauses for them. Hotbar: `HOTBAR_MAX` 12 (every hotbar
  array), `HOTBAR_BELT_MAX` 10 = survival's most; `hotbarLen()` is 12 in creative; keys `HOTBAR_KEY_CODES` /
  `HOTBAR_KEY_LABELS` (player/inventory.js); `migrateStash` keeps hotbars of 8, 10 and 12 in place. Creature `sounds` entries
  take `gain` and `vary` (mobSound). `MONSTER_SPAWN_MUL` 1.04, `ZOMBIE_SPAWN_MIN_DIST` 40 (brought in for a sim range under 3).
- **0.84821.** biomeRev 40 `REV40` (worldgen/gen-setup.js): `ORE_HIGH` (worldgen/underground.js) raises coal (best 100-120, top 180),
  iron (82-98, 156), copper (65-75, 120), tin (47-53, 90); a raised ore's best band peaks in its middle (mean of two hashes),
  and a try that starts out of the rock restarts in the top `HIGH_DROP` 12 blocks of the rock under it. Measured over
  3 seeds x 64 chunks against rev 39: coal x1.10-1.14, iron x1.03-1.07, copper x1.01-1.08, tin x0.95-1.01.
- **0.84822.** Night monsters fill in slowly (entities/spawning.js): `_nightCap()` grows from `NIGHT_RAMP_FROM` 0.25 to the whole
  over `NIGHT_RAMP_S` 180 s of the night (`_nightT`), one spawn anywhere at most every `NIGHT_SPAWN_GAP` 6 s (`_nightGapT`, half
  under a blood moon), and the dusk sweep only pops chunks while a spawn is allowed (it waits for room).
- **0.84823-0.84824.** First-person shield: `OFF_REST` / `OFF_RAISE` (40-shield.js) are the ONE pose for both hands (the main hand
  mirrors them in updateHands); the shield turns `PI + angle` (outer edge near, inner edge away) and rests low, under the crosshair.
  F = `swapOffhand()` (40-shield.js): the selected hotbar slot and the offhand change places when the offhand accepts it.
- **0.84825.** Chests: `CHEST_ROWS` 2, `CHEST_ROWS_METAL` 4 (doubles 2+1+2, 4+1+4; blocks/chest.js; fitChestSlots moves or drops
  what no longer fits on the next open). `#chestPanel` as tall as its chest, `max-height` = `#equipPanel`'s 614px; no scroller
  (ui/chest-panel.js). 0.84826: the leather belt has no `beltSlots` (its row of empty quick slots is gone until belt gear
  exists), only `hotbarSlots` 2; the tooltip's "worn" line reads `hotbarSlots`.
- **0.84827.** Screen marks kept by in-world code (`_syncDeathMark` from updateVitals, `syncWaypointMarks` / `syncTamingMarks` from
  tickPlayer) are hidden whole by `setHudVisible` (16-worlds.js: the title screen and the start of loadWorld) and shown again by
  their own sync (the waypoint and taming boxes set their own display). loadWorld empties `_waypoints` and `_deathMarks` before
  its awaits; `clearPetTags()` (ui/animals.js, from quitToMenu and loadWorld) takes the name-tag sprites down, and `petTagsFor`
  hides them outside a running world. Taming mark text: name, sex, level, taming, distance. The user counts the death mark
  as a waypoint.
- **0.84828.** Weather sound underground (32-sound.js `_wxMuffle`): under a roof `WX_ROOF_MUFFLE` x (1 - ground over the eye /
  `WX_DEPTH_SILENT` 24; the column's topmost opaque block, scanned twice a second), and x a fade to 0 at `WX_SILENT_Y` 50
  (`WX_SILENT_FADE` 8 above it). Not `mainGen.heightAt` on the page: it can cost milliseconds.
- **0.84829.** Helmets but the cloth cap: `HELMET_OPEN_FACE` (player/armor-model.js: the front a brow `HELM_BROW` 0.375 showing the
  picture's lowest rows, no underside). Off hand: only a shield uses `OFF_REST`/`OFF_RAISE`; a torch or a bare hand `OFF_HOLD`
  (40-shield.js). Otter: the use button with an `OTTER_FOOD` fish item = `_otterFeed` (from tryOtterInteract, tame or wild; `_eatT`,
  `_eatFish`, chewing in otterPose and updateOtter); E stays the pat (the user's choice). `LOOT.bearFur` through
  `first` (Butcher). Repair/dismantle drop zones live on the BODY (player/repair.js): inside `#invWrap`, whose transform makes
  it the containing block of fixed children, they were placed off the screen.
- **0.8483, meerkats and tumbleweeds.** Creature table field `step` (e, dt, tp, i): a kind's own step, taken in updateEntities
  after the shared bookkeeping (no new body line needed); `xp: 0` = a kill pays nothing (combat.js). entities/tumbleweed.js
  (`TUMBLE`, `unsaved`, `updateTumbleweeds` from the main loop puts them round players on dry land in wind, `weatherAt`;
  `rollTumbleweed` the loot, also searched by meerkats; fire: `igniteAt` where it rolls, gone after `TUMBLE.burnS`). Art: the
  billboard textures/Billboards/Plants/Warm/tumbleweed.png on five crossed planes. entities/meerkat.js (`MEERKAT`): model
  js/models/meerkat.js (upright; on all fours = body bone tipped `MK_TIP` with head/arms/legs turned back, meerkatPose),
  taming `meerkatGiveChitin` (tickPlayer, crouched E with `ITEM.CHITIN_PLATE`; `_mkTamingTick` the scare: tamer not
  sneaking within `scareR`), shoulder `player._wornMeerkat` (one worn creature: otterPutOn / meerkatPutOn take the other
  off; saved as a creature row with `wn`), `wornReachMul(p)` read by `dropPickupR` (15-drops.js) and findBushPickup. Wild
  stash `MEERKAT_STASH` "x,y,z" -> item under a sand layer, saved as `meerkatStash`, released by `meerkatStashChanged`
  (setBlock hook when a sand / red sand cell changes). Drops: `DROP_LOOK` 1.2 (drawn only), `_fxDropMotes` (49-particles.js).
  OTTER.huntRest 5 s.
- **0.848301.** `meerkatReachBonus(p)` = `MEERKAT.reachBase` 0.10 + `reachLvl` 0.003 x level + `reachEff` 0.05 x effectiveness
  (wornReachMul = 1 + it). Stats rows 'item pickup range' / 'foraging reach' (ui/equip-panel.js, tips in STAT_TIPS). A worn otter /
  meerkat is a line of `activeEffects()` (player/effects.js) saying what it gives; not on the effect bar.
- **0.8485, carrots.** `B.CARROT` 244 (a retired look's id; T 446-452 `CARROT_S0..6`, art Billboards/Plants/Carrot), a crop like
  wheat: variant 0 ripe, 1-6 stages. `CROP_BLOCKS` / `cropGrow` / `cropRegrow(x, y, z, id)` / `updateCropGrow` (seasons/growth.js,
  were wheat's); SEASON_PLANTS; the variant bar loop over both crops (blocks/variants.js); picking in foraging.js (one carrot,
  `LOOT.carrot` [[1, 1]], Lucky Hands' extra); blockDrop gives nothing for a growing one. `ITEM.CARROT` 432 (food.js;
  FOOD_NUTRITION veg + `vegFull`: eatNutrition now reads `<bar>Full` for every bar). Horse feed carrot 60, apple 40, sugar 20
  (TAMEABLE, entities/taming.js). biomeRev 41 `REV41`: wild patches (worldgen/ground-plants.js, after the wheat). GAME_VERSION 0.8485.
- **0.84851.** Eating: `entEatStart(e, id)` / `entEatStep(e, dt, mouth, at, rate)` (entities/entities.js). A horse fed (tryTameInteract,
  the golden apple too) or a hellhound eating (`houndEat`) stands `ENT_EAT_S` with the food built as a drop in its mouth (`m.muzzle`
  `HORSE_EAT_AT`, `m.snout` `HOUND_EAT_AT`, shrinking), the jaw part working (`HORSE_MUZZLE_Y`, `HOUND_SNOUT_Y`), chew.ogg every
  `ENT_EAT_CHEW`, crumbs `fxMouthCrumbs` (49). The player chews every `EAT_CHEW_S` (player/eating.js; not a drink); the meerkat
  keeps its own eat sound (`meerkatEat`). Sapling clocks are saved (`saplings`: `serializeSaplings` / `restoreSaplings`, woods/saplings.js) and
  wait while the 3x3 chunks round one are not in. `SKILL_REMIND` 60.
- **0.8486, pressure plates.** A chisel shape: `SHAPE_PLATE` 0xC0 (shapes/shapes.js; low bit `PLATE_PRESSED` = drawn sunk, `PLATE_BOX`),
  family 'plate' (boxes.js: no collision; chimney-mixed.js `solidVal` false), `SHAPE_BLOCKS.plate` (planks, stone, cobble, the rocks,
  sandstones, the metal blocks, obsidian), hammer Advanced page (chisel.js), placed on a whole top (`plateFloorAt`, place-block.js).
  blocks/pressure-plates.js: `platePressedBy` (planks 'all', metals and obsidian 'players', the rest 'bodies'), `updatePressurePlates`
  (simTick: players, ENTITIES, DROPS), `PLATE_HOLD_S` 1, `PLATE_TARGETS` by name { test, on, off } for the 4 cells beside and the one
  under (TNT `armTNT`; an unlocked door `toggleDoor`, held and shut on release unless another plate holds it or its double's half),
  `plateChanged` (setBlock hook: a plate down broken lets go; no floor, it comes off), saved as `plates`.
- **0.8487, signs.** A chisel shape: `SHAPE_SIGN` 0xD0 | facing (bits 0-1) | mount << 2 (`SIGN_STAND` / `SIGN_WALL` / `SIGN_HANG`;
  shapes/shapes.js, `SIGN_FRONT` / `SIGN_MID_Y`), `SIGN_BOX[mount][facing]` (boxes.js, authored +Z and turned), no collision, `solidVal`
  false; `SHAPE_BLOCKS.sign` (planks, stone, cobble, the rocks, iron block); placing.js picks the mount from the clicked face.
  blocks/signs.js: `SIGN_TEXTS` (saved `signs`), `updateSigns` (a CanvasTexture plane over each written board), `signSupported` /
  `signChanged` (setBlock hook), the editor `openSignEditor` (on placing; use on a sign, sneak places), `signLineFits` (4 lines, each
  measured in `signFont` against the board), `signDialogOpen` in `textDialogOpen` (ui/waypoints.js).
- **0.84872, the processor meter** (plans/CpuPlan.md P0, with the measured scenes). F3's first line: the page's and each
  worker's share of a core (ui/cpu-meter.js: `cpuNoteFrame` from _perfFrameEnd, `cpuNotePart` from perfLap, `cpuNoteMsg` /
  `cpuNoteWorker` from the onmessage handlers in 10-workers.js, 08-light-glow.js and fluids/fluids.js). Each worker counts its
  own time in `handle` and puts the running totals `bz` (all) and `bzk` (by job kind) on every message it sends
  (chunks/worker.js: `self.postMessage` is wrapped there). `cpuMeterSnapshot()` / `cpuMeterDiff(a, b)` measure from the console.
  Found: lava settling relights 64-chunk boxes and the light answer re-meshes all of them (CpuPlan.md section L).
- **0.84873, saves by chunk** (CpuPlan.md E). setBlock adds the chunk to `SAVE_DIRTY` (16-worlds.js); the save worker keeps the
  last save's edits (`held` in SAVE_WORKER_SRC) and takes only the changed chunks (`all` false, an empty chunk = none left);
  `_saveWorkerHas` = the world it holds whole (null after loadWorld, a failed save or a save written on the page: the next one
  sends all). Anything new that writes `editStore` other than setBlock must add to SAVE_DIRTY or set `_saveWorkerHas = null`.
  `_captureThumb` encodes a 640x360 copy. Castle sites: `lairCells` saved (`serializeLairCells` / `restoreLairCells`,
  entities/boss-lair.js), one probe out at a time (`LAIR_PROBE_WAIT_MS`).
- **0.84874, light boxes** (CpuPlan.md L). `_fluidWrite` relights only where lava came or went or a cell turned opaque (not a
  lava level change). With the light thread, `relight` / `updatePlayerLight` send the change + `LIGHT_REACH` as the box and the
  sources in it AND in the ring of cells round it (`_lightBoxNear`, 08: a source beside the box gives its own level, its cell's
  light one less); the thread lets the light round the box flow in (`lightEdgeSeeds`, chunks/worker.js), writes back only cells
  that changed and names only their chunks (+ the one across a border cell, `touchCell`); `_lightThreadAnswer` marks only
  `m.touched`. The box must stay >= the brightest level round the change (LIGHT_REACH = the brightest PROPS light). The path
  without the thread is unchanged. Check light by numbers: every open cell = the most any neighbour gives (a source its level,
  a lit open cell its light - lightDim - 1 when that leaves >= 2).
- **0.84875, frame caps** (CpuPlan.md A). `fpsLimit` starts at 60 when `vg_fps` was never saved (00-config.js). `frameCap()`
  (22-main-loop.js) = the limit, lowered: title `MENU_FPS` 60, pause menu `PAUSED_FPS` 30 (still drawn: land streams in), every
  seat in its inventory `INV_FPS` 60, window without focus (`_winFocused`, focus/blur events) `UNFOCUSED_FPS` 30. `_frameTurn`
  deals frames from a running clock `_frameDue` (a cap that does not divide the screen's rate still averages right); F3 shows
  `_frameCapNow`. To measure without the caps from the console: `frameCap = () => fpsLimit` (put the function back after).
- **0.84876, less per frame** (CpuPlan.md B1-B3). The SCENE IS STILL (`scene.matrixAutoUpdate` false, 06-renderer.js) and its
  `updateMatrixWorld` skips hidden top-level models and frozen ones: `freezeModel(root)` (every part off auto) for a model
  that stays put. A frozen model is moved BY HAND: change its root, then `root.updateMatrix()`; an inner part (a chest's
  lid): `part.updateMatrix()` and `root.matrixWorldNeedsUpdate = true`. Frozen: door groups, chest groups, beds, sign
  boards. A new model added to the scene with auto matrices just works; never read a hidden model's matrixWorld (use
  getWorldPosition, which works it out). Lists: `LIST_PASS_S` 0.25 (00-config.js): doors (`_doorSwing`, woken by
  registerDoor from setBlock), chests (`_chestLids`, `_chestPass`), beds (`_bedPass` / `_bedSleep`), pet tags (`_petWant`),
  bench tags' nearness. Per-frame DOM writes are guarded (written only when they change): a new one must be too;
  `showTooltip` (ui/tooltips.js) rebuilds and measures only when its html changes.
- **0.84877, B4-B7 and C** (CpuPlan.md). A chest is ONE material on `chestAtlas(look, half)` (blocks/chest.js: the six face
  pictures CHEST_PARTS on a 3 x 2 atlas with padded tiles, `chestAtlasUV(i, u, v)`, the inside's shade CHEST_INNER_SHADE on
  the vertex colour): 2 draw calls; a door box 2 groups (doorPanelGeom). Three draws a call per geometry GROUP, not per
  material: a new model keeps its groups few. Shadow quality `SHADOW_Q` low/normal/high (07-sky.js, `shadowQ`, `vg_shadowq`,
  Options `shadowQSel`). Waves step at SIM_DT (`_waveStep`, `_waveUpload`) and the shader moves crests between (`aVel`,
  `uSince`); wet ground steps at SIM_DT. `FxDecals.live`; the lens sizes from `st.view`. `CellClocks` (chunks/chunks.js):
  cropGrow, berryGrow, shroomGrow, caneGrow, snowMelt, litterRot (Map calls + `forEachInSim`). updateSaplings(dt) once a
  second. `PLATE_CELLS` / `_plateCount` (blocks/pressure-plates.js: plates counted by chunk from editStore and setBlock's
  hook; a plate made any other way than setBlock must count itself). `_fluidWantsStep` (fluids/fluids.js). Measuring in
  the pane: `eval(await (await fetch('/toolsrc/browser-helpers.js')).text())` gives `__drive`, `__scene`, `__newWorld`,
  `__domAudit` (toolsrc is not in git; the 8408 page may have no profile: `createProfile('Tester')`).
- **0.84878, split screen fixes.** The pointer lock is SEAT ONE's: toggleInventory lets it go and takes it back only for
  seat 0 (another seat's did, and the lock handler paused the game). Pad A presses the button under the cursor before a
  slot merely near (`.invTab` included: the Skill tree tab); a pad cursor over a tab gets a tooltip (`padSouthLabel`,
  ui/hud.js). Lines (stats, effects, the XP bar) and the vitals rows (`vitalRects`, type 'vital') count `LINE_BIAS` further
  in nearestElement and their magnet only pulls onto the nearest edge, gently (ui/inventory-cursor.js, inventory-open.js);
  the vitals tooltip comes before a near slot's. The feed is per pane (`feedEl` in SWAP_KEYS, 'feed' in HUD_PANE_IDS,
  rows per feed `_FEED_HOSTS`): a message goes to the installed seat, world messages to seat one. Respawn: the bed first
  (`bedRespawnSpot`, blocks/bed.js), then findValidSpawn.
- **0.84879, D and F** (CpuPlan.md). `poolWorkers` (10-workers.js) = the workers handed jobs, by `threadsSetting` (Options
  "Background threads", `applyThreads`): the stream (`_bestWorker`, `_genThrottle`, `pump`) and `postScanJob` use it, never
  `workers` (that is the whole pool, for init and options messages). `_genThrottle` caps the edge rings at
  `EDGE_WALK_MAX` while `streamSpeed()` < `STREAM_FAST_BPS` (`_streamSpeedTick` from runChunkStream). Clouds
  `cloudsSetting` / `applyClouds` (52-clouds.js: `CLOUD_STEPS_N` / `CLOUD_HITS_N` defines, `CLOUD_Q`). `applyPowerSaver`
  (23-boot.js) sets the form and calls applySettings. In a world the render distance is at least 8 (00-config clamps it);
  the title's 5 is the backdrop's own.
- **0.848791.** The see-through pass (4: ice, glass) blends with no depth write, so faces draw in BUFFER ORDER: the cube
  sweeps write -Y, the sides, +Y last (`SWEEP_ORDER`, chunks/mesher-cubes.js) and `emitBoxFaces` its top last
  (mesher-models.js). Tops first laid a frozen sea's bottoms over its tops inside a chunk, but not across a border (the
  farther chunk is drawn first): a pale band on every chunk border. Never put a pass-4 top before its bottom again.
- **0.848792.** `PLATE_REACH` (blocks/pressure-plates.js) also holds [0, -2, 0]: TNT or a door under the block a plate
  lies on is set off. PROPS `placeSound` (a sound key, read by playBlockSound when kind is 'place'): TNT 'wool'.
  `armTNT` plays TNT's own sound for every way of lighting it.
- **0.848793, a plate in another block's cell** (for the pyramid boss's traps). `PLATE_OVER` "cx,cz" -> Map(cell index ->
  plate value) (blocks/pressure-plates.js; header there): on a bottom slab, upright stairs' lower step, a layer 1-7, or among
  a plant (model 'cross', not solid; needs `plateFloorAt` under it). Where it lies: `plateOverBoxes(g, x, y, z, host, plate)`
  (shapes/boxes.js, BLOCK_CORE: page `BLOCKS.plateOverBoxes`, mesher). The mesh job carries the chunk's map (`plates`, the
  last arg of meshChunk; drawn at the end of mesher-models.js, not at lod 2). `plateOverAt` / `setPlateOver` (never write the
  map by hand: the count `_plateOverN`, PLATE_CELLS and the re-mesh ride on it). The ray returns `over: true`, `bi`
  `PLATE_OVER_BI` (player/movement.js); selection, mining (tick.js, `overV`) and creative break (breaking.js) take the plate
  alone (`breakPlateOver`); a blast takes it (tnt.js). Placing: `tryPlateOver` first in _doPlace; a cell holding one takes no
  other placing (place-block.js `overHit` and the target check). Its holder changed (plateChanged): `_plateOverHeld`, else
  `_plateOverOff` (an emptied cell over a floor: it becomes an ordinary plate; else it drops). Saved `plateOver` (16-worlds.js);
  prefabs `plates` (captureStructure, `applyStructurePlates`). Pressing reads its box and height (`_platesUnder`); one on a
  slab, step or layer reaches `PLATE_REACH_ON` (beside, and under its holder). A new place for an overlay is a branch of
  plateOverBoxes.
- **0.848794.** `PLATE_BURIED` (variant bit 1 of a plate, shapes/shapes.js; page global from CORE): an overlay plate under a
  walk-through layer stack (`layerStack`) laid on a plate standing alone (`tryBuryPlate`, before the carpet stack in
  _doPlace; more such layers pile on it). On the floor (plateOverBoxes), not drawn (mesher-models.js), not aimed at (the ray
  skips it), pressed as feet sink through; `_plateOverOff` clears the bit when it stands alone again. The press through
  the block under a plate ([0, -2, 0]) needs that block to fill its cell's whole bottom (`_plateThrough`: no top or vertical
  slab gap). Sneaking with a block in hand on a door places (`sneakBlock`, place-block.js).
- **0.8488, the pyramid.** Prefabs live in `structures/warm/`, `cold/`, `temperate/` (the climate they are built for;
  dungeons and the supply crate in temperate/); the manifest lists them by that path, a new prefab goes in one of them.
  `warm/pyramid.json` (the user's build; spawn in Desert, Desert Hills, Red Sand, Red Sand Hills, not the deep deserts).
  A lone prefab's `spawn.replace` { biome base name: { id: id } } swaps blocks where it is laid (`_spawnSwap`; its pillar
  and its plates too: `_pillarOpts`, applyStructurePlates' `swap`). One wider than 14 is `_spawnWide` (34-structures.js):
  queued with `site`, its ground read when its whole footprint is in, its chunks marked in `_structPlaced` (`claimed`,
  taken back if its anchor chunk goes first). Buried plates make no click (`_plateClick`). `TNT_LIT_GAIN` 0.425.
  `CHEST_UNSEAL_REACH` 2.5 (feet to the chest's cell) for every key and lock pick on a chest, at the start too
  (`_chestKeyFar`, useChest): the pyramid's ring of plates cannot be reached over.
- **0.84881.** Every light a structure lays (any prefab, through stampStructureSlice) gets `BURN_NEVER` there, saved with
  BURNS (the castle's own loop went). The pyramid only in Desert and Red Sand (no hills).
- **0.84882.** `_swapFor(replace, x, z, full)` (34-structures.js) reads a lone prefab's `spawn.replace` AND a group's
  `replace`: one map for everywhere, or maps by biome (values are objects), the FULL name first ("Cold Plains") then its
  base (biomeBase: "Deep Spruce Forest" -> "Spruce Forest"). A swap's `"wood"` re-woods chests, beds and crafting
  benches in their variant bits (`_swapWood`; the bench has no spruce art: `STRUCT_BENCH_WOOD` spruce -> dark). The village
  group: biomes Plains, Forest, Spruce Forest (base names: Deep Forest, the warm and cold plains, the hills included),
  spruce on the Cold Plains and in spruce forests (manifest).
- **0.84883, the Dead Pharaoh (the summer boss, model only so far).** entities/pharaoh.js (header there): coloured boxes
  like the king's; `PH`; two moods on ONE model (`setPharaohMood`: each `_phMat` keeps `calm` / `rage` colours in
  userData, the eyes and their `halos`), enraged for good at `PH.ENRAGE` 0.5 of its health. Stands, turns to the nearest
  player, takes hits, dies; no attacks, no walking, no boost, no loot yet. Debug: F3 + Shift+F8 (`pharaohDebugSummon`).
  A second boss rides the king's hooks through `BOSS_OWN[e.boss]` { update, hit } (entities/frozen-king.js: updateBoss and
  bossTakeHit hand over first); `BOSS_NAMES.pharaoh`; the boss bar hides the shield row for a boss without `shield`.
  Mummies: a zombie risen in a desert (`MUMMY_BIOMES`, full names) wears `_newMummyMat` (entities/rig.js;
  textures/Entity/Zombie/mummy.png, 128x128, drawn by toolsrc/mummy-tex.js), `e.mummy`; a zombie in all else.
  The middle button: `pickBlock(copy)` (player/inventory.js, from 17-input.js): the aimed block's slot picked, else
  creative a stack into an empty / the held slot, survival the carried stack moved there; Ctrl only for a block already in
  the hotbar, and copies its look (variant bar: `_variantPicks`, needs the chisel in survival) and chisel shape
  (`player.chiselShape`, needs the hammer). TNT_RADIUS 5.2 (explodeAt loops over Math.ceil(R)). Fire: `FIRE_ETERNAL`
  variant bit (53-storms.js): a fire on hay lit in creative or laid by a structure (`fireStamped`, from
  stampStructureSlice) never spreads, burns or dies (water and the hay gone end it), kept in the edits and found again
  on load; every hay fire smokes (`HAY_SMOKE_PER_S`). The structure block's outline has orange middle loops (x and z halved).
- **0.84884.** biomeRev 42 `RDFLAT` (biomes/fields.js): the Deep Red Desert Flat, `rdf` in terrainInfo (a noise at RDF_F
  between RDF_LO and RDF_HI, times ddRed): the Deep Desert's tables, cracks, ridges and rough skin AND the rev-14 hills,
  crags and cliffs eased by (1 - rdf); biomeAt names it over 0.5; biomeBase keeps the name; no hoodoos or bones in it
  (gen-deep-desert.js); hellhounds, mummies and tumbleweeds take it; BIOME_COUNT 41. Measured headless over 6 x 6 km and 3
  seeds: 25-33% of the Deep Red Desert, patches about 130-200 blocks across, the flattest 60 x 60 square inside one 2-7
  blocks from top to bottom. The summer boss's great pyramid (the user's 60 x 40 x 60 build) goes there: its placement is
  not written yet. Prefabs keep sign text (`signs`: structureSignsIn / applyStructureSigns, blocks/signs.js). Leaving the
  page: `worldUnsaved()` (16-worlds.js, WORLD_UNSAVED_MS after `worldSavedAt`) makes the beforeunload handler (23-boot.js)
  ask, after it has written the closing-time copy.
- **0.84885, covers in another block's cell** (like Applied Energistics' facades; header of blocks/covers.js). `COVER_OVER`
  "cx,cz" -> Map(cell index -> [six cover values, 0 where none]): up to one a side (bottom, top, -X, +X, -Z, +Z = the cover's
  rotation) in a cell whose block is not whole. `coverOverBoxes(g, x, y, z, host, covers)` (shapes/boxes.js, BLOCK_CORE;
  page `BLOCKS.*`, the mesher) = boxes per side: `coverHostBoxes` (what may hold them and what they keep clear of; null =
  no host: whole blocks, fluids, fire, doors, beds, logs), each side COVER_T thick, thinned to COVER_THIN by a box that
  near (a chest), cut round a nearer one (`_coverSide`, `_coverFree`), the cell's covers clear of each other in side
  order; under COVER_MIN_AREA of its face left = no room. `setCoverOver` (never write the map by hand), `coversAt`,
  `coverAt`. Ray: `over`, bi `COVER_OVER_BI` + side; `overValAt` / `overBoxesAt` / `breakOverAt(x, y, z, bi, ...)` answer
  for plates too (tick.js, breaking.js, pickBlock). Placing `tryCoverOver` (place-block.js, after the plate's). setBlock's
  hook `coverChanged` runs LAST in setBlock (it may setBlock again): emptied, the first cover becomes the cell's block;
  no room any more, a cover drops; fences, walls, stairs beside re-checked. A cell takes a plate or covers, not both.
  Mesh job `covers` (meshChunk's last arg). Saved `coverOver`; prefabs `covers` (structureCoversIn,
  applyStructureCovers). chestCovered: a top cover in the chest's cell shuts it; it and `stationCovered`
  (blocks/crafting-bench.js, the furnace's chimney too) ignore a torch on top.
- **0.84886, the doorway trap** (header above `DOOR_FILL` in blocks/doors.js). A door's top half opening (`doorFillChanged`,
  setBlock's hook, after coverChanged) wakes the cell over it; a WHOLE falling block (`_fallsWhole`: opaque, not a layer
  stack: sand, red sand, gravel, hay) treats an open door's cell with no fill and no body in it as open (`_fallOpenFor`,
  `doorTakesFall`; every fall check in blocks/falling.js goes through it) and lands there as `DOOR_FILL` "cx,cz" -> Map(cell
  index -> value), whole, not a pile. Drawn in the room the panel leaves (`doorFillBoxes`, shapes/boxes.js; mesh job
  `fills`, meshChunk's last arg), collides as FULL_BOX (blockBoxes), ray bi `DOOR_FILL_BI` 16 (overValAt / overBoxesAt /
  breakOverAt in blocks/covers.js), `breakDoorFill` (the fill over it drops in, what is over the door falls again). Jammed:
  `useDoor` refuses (`doorJammed`, a double's partner too); a plate still toggles it (the panel swings through the fill).
  The door gone, the fill becomes its cell's block. Saved `doorFill`. A door shape held or in a slot is the door itself:
  CHISEL_ICON_VAR.door = SHAPE_DOOR, renderBlockIcon's door branch, buildDropGeom -> `doorItemNode` (blocks/doors.js).
  Planned, not built: a -100% mining effect in the pyramid boss area (no digging back out).
  0.848861: a plate lying half a block up (a stair's lower step, a slab: `onStep` in _platePress) reaches
  `PLATE_REACH_STEP` = PLATE_REACH_ON + the four cells beside one level up (the user's red sandstone stairs up to a door).
  0.848864: you open a door standing IN its cell (the shut panel lies along one side): the fall comes at once and
  `doorFillLand` (blocks/doors.js, from _landBlocks) shoves whoever is in the landing cell out through the doorway to
  their side (a wait for them to step out read as broken to the user). Sand put on a door already open falls in
  (doorFillChanged); a FULL pile of sand or gravel (8 layers of one block, `_fullPile`) falls in as its block whole
  (`_asWhole`, processFalling); a queued block whose door shut again stays whole (never made a pile). Tested in the pane
  (8408), the game running: sand, red sand, gravel, hay, from in front and from inside the cell, sand on an open door, a
  full pile, the stairs with half plates up to a double door, breaking the bottom fill.
- **0.84887, the fire pole** (structures/temperate/fire_pole.json, in the manifest): a lone surface prefab 3 x 5 x 3, three oak planks
  fence posts, a hay bale cased in four cobblestone covers (15; base covers in the cells beside it, against it, and one
  under it in the top post's cell), an eternal fire
  on the hay (variant 1; fireStamped makes any structure fire on hay eternal anyway). Wherever there are trees: spawn
  biomes are BASE names (Plains, Forest, Birch Forest, Spruce Forest, Snow Forest, Coldest Deep Snow Forest, Mountains,
  Savanna, Beach = the Deep Beach too, Oasis), `spawn.replace` swaps oak planks (5) for that biome's planks (spruce on the
  Cold Plains and in spruce and snow forests, birch, rime, acacia, palm on beaches and oases). Chance 0.006, apart 160.
  Saved structure fires: tested in the pane (0.848865) — captured with the eternal bit, stamped through the queue as
  eternal, alive with the hay after 10 game minutes.
- **0.84888, the great pyramid's file** (structures/warm/big_pyramid.json, the user's build, 60 x 20 x 60, in the manifest,
  spawn chance 0: it is not a lone prefab). Built with stand-ins put right when it is laid, like the castle's markers, so
  the user can keep saving it from a structure block: `pharaohPyramidPrefab()` (entities/pharaoh.js, `PH_PYRAMID`) gives
  { prefab, boss }: gravel -> sand (layers kept), every grass plant -> one layer of red sand (a tall grass's top dropped),
  bedrock -> air, its cell the Dead Pharaoh's spot (`boss`, [30, 10, 30] today).
- **0.849, the Dead Pharaoh's fight and its pyramid** (built as "0.8489"; the backup ref keeps that name, `before-0.8489`) (headers of entities/pharaoh.js and entities/boss-lair.js).
  Lairs are ONE machinery for every kind: `LAIR_KINDS` [LAIR (the castle), PYRAMID_LAIR], each { CELL, APART, STEP, MARGIN,
  SLOPE, PROBES, RING, SALT, BIOME, BOSS, PATH, PRE (key prefix: the castle's '' keeps old saves), REV (biomeRev it needs),
  open(g, x, z), prefab(), blend, done(lair, cp), spawn(lair) }; cells carry `K`; `_lairKindOf(lair)` by its boss kind;
  saved lairCells rows get a 4th field PRE for a kind not the castle. The pyramid: Deep Red Desert Flat, biomeRev 42,
  `rdfOpenAt` (biomes/queries.js, on the generator: the flat by fields alone, as rimeOpenAt), embedded on red sand / red
  sandstone, the pharaoh at its bedrock. Effects may be in STACKS: an entry's `stacks` multiplies its def's numbers in
  `_effectSum`; def `stackFade` (one stack lost each time its clock runs out, tickPlayerEffects), `stackDesc(n)`; the bar
  shows xN. New effect fields: `damageReduction` (armorDamageMultiplier, player/equipment.js; may go under 0, and
  hazards.js applies a multiplier over 1 too), `noTnt` (place-block.js), `sandBlind` (fog `st.curse` / CURSE_FOG_FAR in
  52-clouds.js applyMist; grains `fxCurseSand` from 49-particles.js). `summerCurse` (pulse `_phCursePulse` every
  PH.CURSE_EVERY within PH.CURSE_R, while simulated), `pharaohCurse` (BLIND_S from the rage). Abilities (`_pharaohAct`,
  PH.W_*): scroll (`_phScrolls`), dash (`e.dash` wind/go, then `e.back` walks home at RETURN_SPEED), mummies (`summon('zombie')`
  + `_zombieMummify`, `sunProof` read by _zombieBurnTick, `pharaohOf`, `dmg` x RAGE_DMG), wand (enraged; orbit + spin, hit by
  distance to its segment). The rage (`e.rageT`, `_phRageTick`): lift, colours lerped calm -> rage, the curse and the shove
  on landing. BOSS_FX entries may bring their own `tick` (updateBossFx, frozen-king.js). Death: lair `defeated`, boss boost,
  mummies to dust, curses lifted. No loot yet.
  0.8491: quest 'Defeat the Dead Pharaoh' before the king's (`added: 4`, QUEST_SAVE_GEN 4, fixedXp 7500). The boss quests'
  marker (ui/boss-hud.js) reads the quest's `boss` req: the nearest live boss of that kind, else `_nearestLair(p, K)`
  (entities/boss-lair.js, K from `lairKindOfBoss`; text K.HOME). `bossLairsInWorld(boss)` false (biomeRev under K.REV, or
  structures off): updateQuests passes the quest by itself and pays its XP. Boss boost shown as stacks (+20% each, additive).
- **0.85, the Jungle** (biomeRev 43 `JUNGLE`, biomes/fields.js). `fJungle` in terrainInfo (`_jungleF`, biomes/terrain.js: a
  slow wet field at JUNGLE_F, on the levels from JUNGLE_LVL, faded out before the temperature JUNGLE_HOT, so never in the red
  sand or the Deep Deserts) scales fPlains, fDesert, fRedL, fSav and fDry down: hills and mountains come back. biomeAt
  'Jungle' / 'Deep Jungle' (deepF) / 'Jungle Hills' (biomeBase -> 'Jungle'); dryAt 0 there, climAt eased to JUNGLE_CLIM;
  BIOME_COUNT 44. Jungle wood: B 245-248, 250-251 (log, stripped, planks, leaves, sapling, hollow; retired looks' ids), T
  453-459, leaves grey art tinted `JUNGLE_LEAF_TINT` (03), woods/jungle.js. Its TREES are ONE function for the generator
  and the page: `jungleTree(kind, put, rnd, o)` (woods/jungle-trees.js, a top-level VOXEL_CORE part: `CORE.jungleTree`,
  `JUNGLE_TREE`, `jungleKindOf`); generator `jungleCell` (woods/gen-jungle.js, from the tree loop), sapling `_growJungle`
  (woods/saplings.js). Every write stays within 8 of the trunk (the tree loop's margin) and every leaf within
  isLeavesConnected's reach (headless test checks both). A 2x2 trunk is four QUARTERS: log width index `LOG_W_QUAD` 60 + q
  (blocks/basic.js, `isQuadW`; logWidthPx 64 = a full cell, collision full), drawn as one log scaled x2 by `emitQuadLog`
  (chunks/mesher-logs.js: uv from the big log, faces between quarters left out, the outer corner notched).
  0.8501: a quarter's width index is `quadW(q, level)` (60-63 level 0, each level the four below, down to 44: `quadOf`,
  `quadLevel`, `quadExtent` = QUAD_WIDTHS[level] / 128 of its cell out from the big log's middle line; logCutBox and
  emitQuadLog follow it). `_chopQuad` (woods/felling.js): a hatchet strips the four quarters at that height together, then
  takes them a level in a swing, held at the last until cutSwingsFor, then fellTreeFrom. The fire pole's prefab has a
  `covers` entry: a cover under its hay, in the top post's cell.
  0.8502: `_chopQuad` takes QUAD_FELL_SWINGS 50 after the strip; the swings are kept IN THE CELLS, bits 25-30
  (`LOG_CUT_SHIFT`, `logCutOf`, blocks/basic.js: nothing else uses those bits), and the mesher draws `quadReach(val)` (128
  units less QUAD_CUT_UNITS a swing), so every swing shows; the width index's level (collision) follows every
  QUAD_LEVEL_SWINGS, never narrower than drawn. A value rebuilt from id and variant drops the cut (fine: only these quarters
  carry one). Bark: `_barkDrops(x, y, z, units)` (woods/felling.js) rolls LOOT.bark (units / BARK_UNITS 56)^2 times. Cocoa: pods only COCOA_MIN_UP 7 over the ground (generator JUNGLE_COCOA_UP, woods/jungle-trees.js);
  PROPS `pageSeen` (a new flag: the worker lists the block with the emitters, EMITTER_ID too, finishChunkGen's
  pageModelSeen hands it on: `cocoaSeen` registers every pod, so one with no trunk breaks in updateCocoa); felling calls
  `cocoaOffFelled(logs)` (all pods off, ripe ones drop); `cocoaShake` takes only ripe ones. Cocoa: `B.COCOA` 252 (blocks/plants.js, `COCOA_BITS`: FACE bits 0-1 = the side its
  trunk is on, STAGE bits 2-3, RIPE 3; T 460-463, green built in 03 `COCOA_YOUNG_TINT`), `noInv`, `hangs`. woods/cocoa.js:
  straight trunks only (`_cocoaTrunk`: grown 1-wide upright jungle logs, COCOA_TRUNK_MIN), budding, growth, overripe
  break, `cocoaLostHold` (setBlock), `cocoaShake` (skillShakeTree), `cocoaPrompt` (ui/hud.js). Drops `LOOT.cocoaBeans` /
  `cocoaFat` (blockDrop). `ITEM.COCOA_BEANS` 433, `COCOA_POWDER` 434 (mortar, 5 beans, 4.5 s). GAME_VERSION 0.85.
- **0.8503.** Hay or thatch broken (player/tick.js) with a fire on any side (`onFireAt`, `BURNT_NO_DROP`, 53-storms.js) gives
  nothing. `GRAVEL_FLINT_CHANCE` 0.1 (50-loottable.js; 0.8504) for a gravel block and a gravel layer (_dropLayer). A monster the sun kills
  (`_zombieBurnTick`, entities/night-mobs.js) drops nothing. Fire pole covers are cobblestone.
- **0.8505.** `BED_WOODS` (blocks/bed.js) oak, birch, spruce, acacia: the bed's two wood bits are FULL (a fifth wood needs a
  high bit, as the chest's `CHEST_WOOD_HIGH`). ICON_MESH_ART (05-icons.js, loads before bed.js) lists the planks by hand.
  biomeRev 44 `REV44` (worldgen/gen-setup.js): sugar cane's seed chance x `CANE_HOT_MUL` 2.5 on a shore with the Jungle, a
  desert (DES or RED) or the Savanna within 2 columns; genChunk's new grid `JNG` (worldgen/terrain-columns.js).
- **0.851, fences, walls, gates, the wrench** (headers of shapes/shapes.js, blocks/rails.js, blocks/gates.js, player/wrench.js).
  joinBoxesAt (shapes/boxes.js) takes `rl` (a lookup of the fences/walls lying in other cells) and `joinsAs` (gates join as
  their fence or wall); `FENCE_POST_TALL` under a fence/wall/gate. Steps: `joinSlopesAt` -> [d, dy] (never gates, never a
  stack), drawn slanted by `emitSlantBox`/`emitSlopes` (chunks/mesher-models.js; `quad` takes any corners), collide as a
  straight arm. Walls: low nibble 0 the old middle, 1 the pose, `WALL_BACK | facing` moved `WALL_BACK_PX` (`_wallBack`).
  Gate `SHAPE_GATE` 0xE0 (`GATE_AXIS_Z`, `GATE_OPEN`, `GATE_SWING_POS`, `GATE_WALL`; `gateBoxes`; SHAPE_BLOCKS.gate = fence +
  wall blocks); `tryUseGate`/`makeGate`/`toggleGate`, PLATE_TARGETS.gate. Cell bits 25-29: `JOIN_MANUAL` + arms
  (`JOIN_ARMS_SHIFT`) on fences/walls, `STAIR_FORCE_SHIFT` (stairBoxesAt) on stairs; prefabs keep bits 25-30 as a block's 7th
  number. RAIL_OVER (blocks/rails.js, bi `RAIL_OVER_BI` 17): a fence on a bottom slab / upright stairs (`RAIL_LIFT` 0.5), a wall
  in upright stairs (`railHostOk`, `railOverBoxes`); mesh job `rails` = this chunk's and the ring round it (`railsForMesh`,
  key (x+1)+(z+1)*18+y*324); blockBoxes adds them (`_blockBoxes` is the cell's own); saved `railOver`, prefabs `rails`,
  hook `railChanged`. `ITEM.WRENCH` 435 (`useWrench`, first in _doPlace; creative only). Planks take walls.
  0.8511: gates are drawn on the page like doors (GATES, `updateGates`, `gateChanged` from setBlock, `registerGate` from the
  edits on load; the mesher skips them; panels from `_gatePanel` in pivots, the world shader through `_dropMat` and a light
  hook). Joins: `joinTakes` / `autoJoins` (a JOIN_MANUAL neighbour joins only by its own arm back, so the wrench's join holds
  both ways; a refused side looks for a step), steps from the post's middle (spec.slope 8..16), a wall a step runs through
  has no post. `WALL_BACK_PX` 2 (no faces lying on a stair's). Wrench: a wall's top anywhere
  turns it; stairs' top/bottom flips, a side turns.
  0.8512: `joinLinks(family, g, x, y, z, v, rl, lift)` -> { j, steps } is THE join rule (joinBoxesAt and joinSlopesAt ask it):
  heights by `_joinCell` (a rail's `railLift(host, rail)`), a level neighbour standing higher/lower = a half step, a step pair
  decided the same from both ends (the cell over/under is the other's level: joinTakes with JOIN_BACK). Rails: a fence in
  any slab (a top or vertical one from the floor, lift 0, boxes kept RAIL_EPS inside, collision no higher than the cell),
  walls in stairs at RAIL_LIFT like fences.
  0.8513: `joinsAs` ignores the block (any fence joins any fence, any wall any wall; `gateFamily`); corner joins are drawn
  as 45-degree rails (`joinDiagsAt`, `DIAG_RAILS`, `emitDiagRails`/`emitDiags` in chunks/mesher-models.js; joinBoxesAt keeps
  only their collision boxes, so the crosshair passes them); a wall loses its post only where steps go opposite ways;
  `wrenchPrompt` (player/wrench.js, from _interactText in ui/hud.js).
  0.8514: gates stay level (no tilt); a step toward a gate is drawn whole by the fence/wall (`whole`: dy x2 in joinLinks).
  A corner join is left out only when `_cornerOut`: a cell between joined by BOTH ends (asked the same from both, so
  both draw it or neither). A wall placed on or against a wall takes its low nibble (_shapeVariantFor).
  0.85141: `_cornerOut` also leaves a corner out when a WHOLE block (`_wholeBlock`: model 'cube', solid or leaves, unshaped)
  stands in either cell between. Steps and corners have crosshair boxes: `joinPickBoxes` (shapes/boxes.js: `_stepBoxes`
  PICK_STEPS along a slope, reaching under/over the cell; `_diagBoxes`), added by rayBoxesAt (`joinPickAt`,
  chunks/block-access.js) and railBoxesAt when not coll. raycastVoxel takes a fence/wall/rail cell's boxes only inside the
  cell (`tOut`) and asks the cells over and under for what reaches in (`_joinReachHit`, player/movement.js). joinBoxesAt's
  collision adds `_stepBoxes` too. `wallShift(family, v)` (emitDiags uses it). Fences: stone, cobble, rocks, sandstones.
  0.85142: joinLinks' step loop skips a step when `_wholeBlock` stands in a cell between (over the lower one or under the
  higher one; the same two cells from both ends). Natural ground counts too: a fence up a grass hill does not slope.
- **0.8515, more looks** (blocks/looks.js, T 464-469): adobe 3 circle, terracotta (B.BRICKS) 4 soot brick, bone block 2 carved,
  sulfur block 2 carved, and looks on the thatch id (a VARIANT_BLOCKS id, like the snow brick's): 1 carved, 2 brick, on hay's bar.
  `toolsrc\check-textures.ps1` is gone from toolsrc (not recreated).
  0.8516: every planks look 1 brick (T 470-476, art `<wood>_plank_bricks.png` in its Woods folder; defined after `_ALL_PLANKS`
  in looks.js, which a part must not use before it is declared); the bar gets it from `woodBlocks('planks')` (variants.js).
  0.8517: bone block look 3 polished (T 477, Decorations/bone/polished_bone_block.png, no axis).
- **0.852, vines and what a pick takes.** `B.VINE` 253 (a retired look's id; T 478, `vine_cut` 479 built in 03 by `halfCut`), a
  'wall' plate like the glow vine (blocks/glow-and-storage.js), look 1 = half cut (the 'wall'/'carpet' mesher branch now reads
  `facesOfVal`). woods/vines.js: held by what is behind it (solid, log, leaves) or a vine over it, else it falls as a vine
  (`vineChanged`, setBlock's hook; the generic glow-vine rule skips it); tips (`VINE_TIPS`, found by column looks and the hook) grow
  a cell down every `VINE_GROW_DAYS` to a block over the ground, `VINE_MAX` long, from updateSeasonGrowth; `tryCutVine` (shears,
  _doPlace) cuts and drops the strand under it; `vinePrompt`. Generator: giants only, `o.vines` in jungleTree (`_jVines`: trunk
  sides and canopy edges, a strand stops where `put` returns false: gen-trees.js' `put` and the sapling's now answer true when
  written), biomeRev 45 `VINES` (worldgen/gen-setup.js); a grown giant sapling gets them. Variant costs (header WHAT A PICK
  TAKES in blocks/variants.js): option `need`, `VARIANT_DEFAULT_NEED` (with the chisel off too), `heldNeedOf`; _doPlace refuses
  without it and sets `_placeNeed`, spendHeld('placed') takes it (player/breaking.js); a cell that paid carries `NEED_PAID` (bit
  31; main path, the bed, and since 0.8521 plates, covers and rails in another block's cell: `paidMat` in _doPlace, kept by
  tryPlateOver / coverValOf / tryRailOver; a slab's second half still takes it and gives nothing back), `paidNeedOf`
  read by blockDrop (50-loottable.js, now a wrapper of `_blockDropOwn`). Rebuilding a value from id + variant byte drops bit 31:
  tryPairChest / unpairChestNeighbour and the furnace's fire keep `& ~0xFFFF` now. Bar: `.vNeed` icons under the slots
  (css). Metal chest recipe: chest + 3 of iron/copper/gold ingots (any mix).
  0.8525: mossy looks (T 480-484): adobe 4, terracotta (B.BRICKS) 5 mossy roof, cobblestone 2 mossy brick, sandstone 4 mossy
  brick (the plain sandstone only), dirt 1 (its first look and bar; grass-spread.js takes only a bare `B.DIRT` value, so
  grass never covers it). Each takes a vine through the /mossy/ name rule in variants.js.
  0.8526 (T 485-497): dirt 2 coarse, 3 frozen (looks only); mossy brick: sulfur 3, thatch 3 (on hay's bar), red and pink
  sandstone 4, every planks 2 (`MOSSY_<WOOD>_PLANK_BRICKS`). paidNeedOf searches the bar of `_VARIANT_BASE[id]` when the
  cell's id has none (thatch's looks sit on hay's bar), so a mossy thatch gives its vine back.
  0.8527 (T 498-505): cracked looks, no need: adobe 5, obsidian 3, each sandstone 5 cracked and 6 cracked brick (their bars
  full). `cracked_slate.png` waits for a slate block; stone's look 3 'cracked brick' stays off the bar (no art of its own).
- **0.853, slopes and ladders** (headers of blocks/ladders.js, blocks/slopes.js). Both share the last shape nibble 0xF0, told
  apart by `SLOPE_BIT` 8 (shapeOfVal; mask `SHAPE_MASK | SLOPE_BIT` where a nibble test must tell them apart):
  `SHAPE_LADDER` 0xF0 | side its back is on (0 -Z, 1 +Z, 2 -X, 3 +X, as the glow vine), `SHAPE_SLOPE` 0xF8 | stairs' facing
  (low edge toward STAIR_DIR) | 4 upside down. No high nibble is left for a new shape. Ladder: `LADDER_BOX` (rails 1.5 px,
  rungs 2 x 2.5 px standing out), no collision, solidVal false, crosshair one board `LADDER_PICK` (rayBoxesAt), climbable
  (playerOnClimbable sets `player._climbSide`); a COLUMN is held by a solid block behind any of it, under its bottom or over
  its top (`ladderColumnHeld`, `ladderCanStand` when placing, `ladderChanged` setBlock hook drops a whole unheld column),
  `tryExtendLadder` (a ladder clicked with one). Slope: boxes are steps (`SLOPE_BOX` 8 for the ray, `SLOPE_COLL` 16 to stand
  on), drawn as a wedge by `emitSlope` (chunks/mesher-models.js: laid out facing 0, TURNED never mirrored, upside down
  corners reversed); `slopeDownOf(v)`. Sliding: `playerSlopeSlide` (`player._slide`, SLOPE_MAX past a sprint; a landing's
  fall still counts), `entSlopeSlide` (entities/update.js), drops roll off (15-drops.js). SHAPE_BLOCKS.slope = stairs' blocks.
  The old ladder block B.LADDER 121 is gone from play: migrateLegacyVal turns it into an oak planks ladder (121 no longer
  reads as the pre-0.783 sandstone slab, which turned every saved ladder into a slab), legacyItemId 121 -> planks, mine
  shafts write `B.PLANKS | SHAPE_LADDER` (TERRAIN_KEY 'terrain853:'), out of the creative palette; at LOD 2 a ladder is
  left out (`_lodRank`). Climbing (player/tick.js): `_climbAnim` (up or sliding: both hands busy), `_climbHold` (still off
  the ground: the left hand holds, offHandBusy), eased weights `_climbUpW` / `_climbSlideW` / `_climbHoldW` read by
  player/hands.js and 40-shield.js; `clampClimbLook(dt, moving)` (player/movement.js) pulls the yaw back toward
  `_CLIMB_FACE[side]` past CLIMB_LOOK_HOLD (CLIMB_LOOK_MOVE while moving). Hammer radial: slope on Simple (`wedge` preview
  built in chiselShapeIcon), ladder on Advanced.
  0.8531: the body climbs too (player/body.js `poseBodyClimb`, laid over animateHumanoid by the same three weights; its beat
  is the first-person hands' `_climbT`). The body turns to `player._climbFace` (tick.js: the climbable's `_CLIMB_FACE`, or the
  yaw on a wall climb, kept after letting go so the turn back eases) and the head turns back on it to the look (head order
  'YXZ', `head.rotation.y` = -climbTurn).
  0.8532: the wrench (player/wrench.js) turns slopes like stairs (`_wrenchSlant`: slant, risers or flat face = upside down,
  back or ends = a quarter round; sneaking always turns) and ladders (`_wrenchLadder`: the whole column, sneaking the one
  clicked, to the next side that leaves the column held; WRENCH_TURN is the same quarter for a ladder's sides).
  0.8533: a ladder collides as a thin board at its back (`LADDER_COLL`, LADDER_COLL_T 3/16; `_entBlocked` tests it for
  creatures, entities/physics.js; `ground1` counts a ladder board's top only under the body; `_ladderShove` puts a body
  out in front when one is put down on it). CORNERS: variant bit 2 `WALL_PAIR` (blocks/glow-and-storage.js, BLOCK_CORE:
  `WALL_NEXT`, `wallSides(va)`, `wallPairVar(a, b)`, `wallClip`) = a second ladder, vine or glow vine on the side a quarter
  round, in one cell (WALL_VAR 4-7, LADDER_BOX/PICK/COLL 4-7 from `_ladderSet`: the second's rungs/plate cut back to the
  first's front). Page (blocks/ladders.js): `wallPaired`, `wallSingle(v, k)`, `ladderSidesOf`, `tryWallPair` (place-block.js,
  when the target cell holds one of the same block); mining and creative break take the one aimed at (bi), blockDrop of a
  corner is two; vines (`_vineWalls`) and glow vines lose only the plate whose wall went; `_climbSideOf` picks the wall
  faced. Test headless: scratchpad err-0.8533.js (not in the repo).
  0.8534: a CORNER OF TWO DIFFERENT BLOCKS (shapes/boxes.js, header above WALL_MATES): the cell is one plate block; bits 25-29
  `WALL_MATE_SHIFT` = the other's index in `WALL_MATES` (vine, glow vine, every ladder block; IN THE SAVES, append only;
  0 = the same block), bit 30 `WALL_MATE_FIRST` = the other is on the first side; the other is always plain (the one with a
  look is the cell's own; two with looks refused; else a glow vine, for its light, else the one already there).
  `wallPairParts(v)` -> the two as values alone, `wallPairBoxes(v, kind)` (0 drawn, 1 pick, 2 collision), `wallMateOf`,
  `isWallPlateVal`; the mesher's `emitWallPair` (mesher-models.js); page `wallParts` / `wallPartOff` / `ladderValAt` /
  `hasLadder` / `ladderBoardsAt` (blocks/ladders.js). The ray's `id` on a corner is the part aimed at. Vines go by plate
  (`_vineSettle`, woods/vines.js: a plate is held by its wall or a vine over the cell), glow vines too (block-access.js).
  LADDERS IN ANOTHER BLOCK'S CELL ride RAIL_OVER (blocks/rails.js): `railHostOk` takes a ladder in a slab, stairs, a layer or
  a plant (cross, not solid), `railOverBoxes` gives LADDER_BOX (railBoxesAt on the page LADDER_PICK / LADDER_COLL), lift 0,
  `_joinCell` ignores it; `tryLadderOver` (after tryExtendLadder in _doPlace), setRailOver calls `ladderChanged`, columns
  and climbing see it through `ladderValAt`. Wall bars (0.85342): posts `RAIL_W` 1.5 to the front, deep to the side (0.5 to `LADDER_DEPTH` 3.5, 0.85343), rungs `RUNG_T` 1 square dowels through the posts' sides at mid depth (`_rungZ`) and 1 past them; board 3.5; a corner's second ladder cut back whole, its corner post left out (_ladderSet drops a box cut to nothing; `_LADDER_HALVES` splits by the authored count).
  Climbing works in water (onClimb no longer needs dry; glow vines take water, blocks/waterlog.js; the jungle's vine never: place-block.js and tryWallPair refuse it in water; biomeRev 46 `GLOW_WET`, worldgen/gen-setup.js: generated glow vines hang into still cave water too, WATERLOGGED, worldgen/underground.js); looking down
  slides x(1 + `CLIMB_LOOK_DOWN` 0.5), the whole of it from `CLIMB_DOWN_FULL` 0.45 of the way down (about 40 degrees; blended
  over the whole pitch it was hardly felt; x2.5 since 0.85344, CLIMB_LOOK_DOWN 1.5: the user felt x5 and chose this). Test headless: scratchpad err-0.8534.js.
  0.85344: ladders and vines cost stamina: `player._ladderUse` (tick.js: 2 going up, 1 holding on off the ground, 0 sliding)
  read by tickStats, `STAMINA_LADDER_PER_S` half the wall's, `STAMINA_LADDER_HOLD_PER_S` 1.5, both x skillClimbMul (Climber); out
  of stamina (playerTired) the climb and the hold give way to the slide.
- **0.8535, the tiger and effect pictures** (header of entities/tiger.js). Kind `tiger`, a `step` creature (updateTiger), model
  js/models/tiger.js (from textures/Entity/Animals/tiger.json; the JSON may go), sheet tiger.png, sounds tigerSay / tigerHurt.
  One alone in the Jungle (`rollTigers`, TIGER_BIOMES, TIGER.apart), held to TIGER.leash from home (`_homeward`). Stalks then
  charges players in sight (`_tgChoose` every 0.4 s: whoever struck it, a player in sight, raw meat lying near, a creature
  when hungry); its kill drops the victim's loot (`_entDropLoot`, unlike other creature kills) and it eats a raw meat there
  (`_tgEatDrop`, TIGER_MEAT mutton/beef/pork). Raw meat in a player's main hand (`tigerBaited`): it comes TIGER.baitNear
  close and watches, never bites. `tryTigerInteract` (place-block.js): feeds it once in TIGER.feedCd (`_fedCd`, saved `fc`),
  `_peace` map by `_tgKey(p)` for the bond's time; effects `tigerFury` (`atkSpeed` 0.3, read by playerAtkSpeedMul in
  stat-getters.js through `_effectSum`) and `tigerBond`. Fighting back: damageEntity sets `ent._struckBy = player` (aggroT
  as for any non-grazer), creature table field `fightsBack` sets `_hurtBy` in damageEntityByMob. Effect pictures: EFFECT_DEFS `img` (a path under `EFFECT_ICON_DIR` textures/Gui/Effects/), `effectIconHTML(d, cls)`
  on the bar (`.effImg`) and in the panel (`.effIco`); states added to `stateEffects` with their own `name`/`desc`:
  otterScarf, meerkatShoulder (moved out of activeEffects), houndTaming, horseTaming, riding. Feed (ui/feed.js): UI
  pictures `_feedImg` (experience for XP/level/quest/feat/skill points, unlocked for a skill, repair for a station's order,
  alert for warnings, locked/unlocked/treasure by an info line's words, `_feedInfoIcon`); the XP pop carries experience.png.
  The art folder names change: after a rename, check every `img` against textures/Gui/Effects (the curses were renamed
  to `<season>_curse.png` during this step).
- **0.8536, the world epoch** (10-workers.js above `workerEpoch`). A job still queued or running in a worker when another world
  opened (or the title's backdrop was left) answered with the old world's land, which onWorkerMessage put into the new world's
  chunk at the same place AND stored in its terrain cache: square columns of another land standing in a world, for good.
  `workerEpoch` goes up in initWorkers; gen, prep (`_genSend`), mesh (dispatchMesh) and scan (postScanJob) jobs carry it as
  `ep`, the worker sends it back on every answer (`_ep` in chunks/worker.js's postMessage wrapper), and onWorkerMessage drops
  an answer from an older epoch. TERRAIN_KEY 'terrain8536:' throws away every cache that may hold such a chunk. A new kind of
  worker job whose answer touches a chunk must carry `ep` too.
- **0.8537.** A jungle giant's 2x2 trunk takes `QUAD_FELL_SWINGS` 100 cut swings after the bark (about half the ~200 logs it
  drops; woods/felling.js). The cells keep CUT STEPS of `QUAD_SWINGS_PER_STEP` 2 swings (bits 25-30 hold 63 at most), the
  odd swing between steps in `_QUAD_ODD` (by the height's first quarter, not saved); QUAD_LEVEL_SWINGS 20; drawn as before,
  QUAD_CUT_UNITS a step. The Crafting effect's picture is UI/repair.png.
  0.85371: feed pictures level_up (feedLevel, feedSkillPoints) and biomeDiscover (feedFeat's 3rd arg `icon`, a biome found in
  _tickFeats); the crafting list and the furnace book show XP with UI/experience.png. A stone furnace takes 1 cobblestone
  (VARIANT_DEFAULT_NEED); a tooltip says what the pick in hand takes as "On place: Requires 1 ..." (heldNeedOf, ui/tooltips.js).
- **0.8538.** Golden armor, the middle tier (tier 2, armor 8/22/18/8 + gauntlets 5, chestplate durability 160, no slow, no set
  bonus yet): `ITEM.GOLDEN_GLOVES` 436 (icon gold_gauntlets.png), recipes appended (gold + leather + one of `V_GEMS`, the crown
  "Golden crown" gold + 3 pearls + cloth). The bench lists armor by `_RANK_ARMOR_MAT` (blocks/crafting-bench.js: steel, bronze,
  iron, golden, leather, cloth). `ITEM.BOOK` 303 got its entry (materials.js) and recipe (5 paper, leather, string): no use yet,
  it waits for the bookshelf (no art) and, after 0.9, a book of creatures met. Creature-table field `aggro` (seconds a
  player's blow keeps it on them, damageEntity; tiger TIGER.aggro 25).
- **0.8539.** The creature book (player/creature-book.js): `tryBookInteract` (first in _doPlace), `bookPrompt` (_interactText),
  feats `mobs` (restoreFeats / serializeFeats, keys `bookKeyOf`: kind, 'fish:<species>', 'zombie:mummy'), XP_BOOK_MOB 5000 +
  XP_BOOK_STEP 100 a kind written before; creature-table `book: false` (tumbleweed). `XP_KILL_MUL` 0.75 (mobKillXP).
  `LOOT_BOOK_CHANCE` 0.25 in fillPendingLoot (every loot chest, whatever its table). Golden set `xpBonus` 0.10 (addXP);
  golden recipes take bones. Beds: variant bit 6 `BED_FOREIGN` on every bed a structure lays (stampStructureSlice):
  `isForeignBed`, blanket from `BED_PALE_BLANKETS` by a hash of the foot (`bedColorsOf`, set by registerBed and _bedPass),
  no respawn point (trySleep), drops one wool (_blockDropOwn). Older worlds' village beds have no bit: they stay ordinary.
  Station work: `_benchWork` makes mainHandBusy/offHandBusy; `_benchW` / `_benchT` (eased at the top of updateHands) pose
  both first-person arms (`BENCH_ARM`, `BENCH_BEAT`; 40-shield.js mirrors it) and the body (`poseBodyWork`); a mortar grinds
  (`benchWorkIsMortar`). Drop motes (49-particles.js `_fxDropMotes`): DROP_MOTE_RATE 2.6, rise ~1 block, all scaled by the time
  left (`DROP_MOTE_LOW` at the end). The food balance plan: plans/FoodBalance.md (table maker `node toolsrc\food-table.js`).
- **0.85391.** biomeRev 47 `CANE2` (worldgen/gen-setup.js): sugar cane on a sand/grass/dirt/gravel column whose top `h` equals a
  side neighbour's water top (`H[n] < WLV[n] && WLV[n] === h`, and water there in the chunk's cells), any water but an oasis's
  (its own pass, worldgen/ground-plants.js, same rule), standing from h + 1 (desert-and-shore-plants.js). Revs under 47 keep the
  old rule (a column at WATER_LEVEL + 1, the cane taking its top block: the hole by the shore). Checked headless over 3 seeds
  (scratchpad test-0.85391.js): every rev 47 stand on soil with flush water, none sunk, rev 46 unchanged.
  0.85392: stripping by hand (woods/felling.js `tryStripLog` from _doPlace, `updateStripHold` from tickPlayer, `_stripProg` on the
  ring): hatchet + right button held STRIP_HOLD_S 0.8 on a live log (placed ones too), `LOOT.barkStrip` [[1,1],[1,0.2]] a cell,
  a 2x2 quarter strips its four (`_quadParts`, shared with _chopQuad), hatchet wear 1. An active shield takes the button; an
  offhand torch does not (`_aimsToStrip` in placing.js keeps the main hand).
  0.85393: the food numbers before the rework (plans/FoodBalance.md, its tables; items/food.js, FOOD_NUTRITION, blocks/mushrooms.js
  `_grilled`). Raw food's nausea time is `foodEffectTime` per item. The user decided: the sandwich (stamina), the pie (its buff,
  4.8 s), berries (fruit 6, 10 min), white and red berries, rotten flesh spoiling all stay; the rest waits for the 0.857 rework.
  Also 0.85393: a food's `foodReturn` (bowl, bucket, bottle) goes into the emptied hand, else tryPickup, else thrown at your
  feet (updateEating, player/eating.js). It took `HOTBAR.indexOf(null)`, which found the hidden slots past hotbarLen(): the item
  vanished until an equipment change (syncBeltCapacity) spilled it. Anything that fills a hotbar slot counts to hotbarLen().
- **0.85394, the world the workers make land for** (10-workers.js above `workerWorldId`). loadWorld sets currentWorld and then
  awaits the save BEFORE resetWorld re-inits the workers: in that gap the stream still made the title backdrop's (or the last
  world's) land with the same epoch, and onWorkerMessage stored it in the NEW world's terrain cache: backdrop columns near the
  spawn, for good. Now initWorkers(seed, type, rev, worldId) keeps `workerWorldId` (resetWorld's 4th arg: loadWorld passes
  w.id, the backdrop null); `genForWorld()` (chunks/stream.js) = it is the world shown; pump makes no chunk and
  onWorkerMessage stores none unless it holds; updateBossLairs waits too. TERRAIN_KEY 'terrain85394:'; `terrainCachePurgeOld`
  (16-worlds.js, 8 s after the database opens) deletes every 'terrain…' key of an older TERRAIN_KEY (each bump used to leave
  them all, 256 KB a chunk). Anything new that sends land work to the workers checks genForWorld().
- **0.85395.** The creature book is a hold: tryBookInteract starts `player._bookHold`, `updateBookHold` (tickPlayer, `_bookProg`
  on the ring) writes after BOOK_HOLD_S 1 with the crosshair kept on it (`_bookWrite`). COW_BIOMES (0.85396): Plains, Warm
  Plains, Savanna, Forest 1 (Deep Forest and the hills through _biomeWeight), Cold Plains 0.2.
  0.85397: tigers `TIGER.chunkChance` 0.015, `TIGER.apart` 192 (entities/tiger.js).
- **0.8484.** `ITEM.LOCK_PICK` 430 (useables.js; blocks/chest.js: useChest starts `player._unseal` with `pick`, updateChestUnseal
  takes `PICK_TIME_MUL` x as long, `_pickDone` rolls `PICK_OPEN` and `PICK_BREAK_WOOD` / `PICK_BREAK_METAL`; a seal picked is
  removed, a player's lock stays). `ITEM.JAM_SANDWICH` 431 (food.js; FOOD_NUTRITION fruit + `stamina`, now one of
  NUTRITION_KEYS and the tooltip's rows). Recipes appended to RECIPES_ADVANCED (the sandwich `basic: true` after the stew),
  `V_BERRIES`. `MEERKAT_FOOD` (use on a tamed one, tryMeerkatInteract). GAME_VERSION 0.8484.
- **0.848303.** Sealed metal chests (`_spawnSealedChest`, blocks/supply-chests.js) only in caves: under the column's first opaque
  block, `WORLD_CHEST_Y_LO`..`HI` (1..200), the 3x3 at its height and the cell over it air; columns kept a block inside the chunk;
  `WORLD_CHEST_TRIES` 24.
- **0.848302.** Creature table `hungerMul` (update.js's drain and a ridden horse's): 0.5 for horse, hellhound, otter, meerkat.
- **Version numbers (the user's rule).** Small changes, fixes and QoL go as sub-steps of the version being worked on (0.8482 ->
  0.84821, 0.84822...). A new step (0.8483) is for a new feature; a message naming one for a small fix is a slip: use the next
  sub-step and say so in the report. A big feature may take a whole step: the summer boss is 0.849 (asked as "0.839", a
  typo), its tweaks 0.8491, 0.8492... A number one digit off a step above the current one means that step.
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
  again): steel's recipe comes with steel at 0.903 (alloy smelter), milk as a fluid at 0.857, oil at 0.96
  (FutureRoadmap.md is the plan).
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
  `chestLookOf(val)` (0-7 wood, `CHEST_METAL_LOOK` 8+ metal: at 4 the acacia chest drew as iron, 0.848841). Locks share `DOOR_LOCKS` (chest cells as keys, both halves); `chestLocked` =
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
- **Far see-through seams (0.837, 0.84731):** a LOD 2 chunk draws a see-through face (leaves, glass, ice; water's sides in
  emitWater) across its edge only off a REAL cell of that block (`seeEdge`, `data0` = the cells before `lodDownsample`), and no water
  side against water there: its grown groups drew faces in the open along every far chunk's edge.
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
  0.8393 the snow castle (structures/cold/snow_castle.json, in the manifest, spawn chance 0 so it never spawns as a lone prefab):
  `LAIR` in entities/boss-lair.js. Sites from the seed per 4096 cell: `rimeOpenAt` (biomes/queries.js, exposed by makeGen; the open Coldest Deep Snow's
  fields only, ~1 us) finds candidates, a worker job `probe` (biomeAt/heightAt, ~14 ms each - never on the main thread)
  checks them, `_lairSite` keeps one per 4000 blocks. Placed through the placement queue (`onDone` on a job, 34), saved as
  `bossLairs` (16). Markers in the prefab: FURNACE = gate (air + a cut path), BEDROCK = the king's spot (air); oak chests ->
  rime, snow layers -> snow blocks, TORCH_UNLIT/GLOWCRYSTAL_SPENT -> lit (spent glowstone stays: placed so on purpose);
  its lights get BURN_NEVER. Re-saving the castle from a structure block keeps working: the rules run on load (`_castlePrefab`).
- **The Savanna (0.846, biomeRev 28 `SAVANNA`).** `fSav` (biomes/terrain.js, SAV_FROM/SAV_TO in biomes/fields.js) on
  the Dryland's own wobble, so it always lies on the desert's side of it; `fDry` is cut by it. genChunk `SAV` grid.
  The grass colour: `dryAt` (biomes/queries.js) is now 0 green .. `DRY_PALE` (0.8, BIOMES.DRY_PALE, biomes/biomes.js)
  the Dryland's pale .. 1 the Savanna's gold; the shader (04, `uDryPale`, `uSavTiles`) splits it; old worlds look the
  same (their dryness is scaled by DRY_PALE). Tiles T 405-406 built from `SAVANNA_GRASS_RGB` (03).
  Acacia wood (B 230-234, T 399-404, woods/acacia.js, tree woods/gen-acacia.js; no sapling: the art for one waits).
  **Termite hills**: `B.TERMITE_HILL` 235, variant 0 small, 1 + dx + dz*2 + dy*4 a big one's cell (2x2x3, foot cell
  variant 1); made by biomes/gen-savanna.js from the tree loop. PROPS `pageModel: true` = a block the page draws: the
  worker lists it with the light sources (`EMIT`), `EMITTER_ID` (08) too, and finishChunkGen hands it to
  `termiteHillSeen`; setBlock's hook `termiteHillChanged` (breaking any cell takes the whole hill). blocks/termite-hill.js:
  `HILLS`, one InstancedMesh per kind, termites kept per hill. Box models from JSON: entities/box-models.js
  (`boxModel`, `boxModelGeometry`, `buildBoxRig`; uv in 16ths with `texture_size`, else in 8-texel units).
  **Termites** (entities/termite.js, `TERMITE`): kinds `termite_worker` / `termite_soldier`, body `'insect'`
  (updateEntities hands them to `updateTermite`), `unsaved: true` (a new table field: serializeEntities skips it). A
  blow sets `aggroT` (damageEntity's humanoid path); updateTermite turns it into the hill's `angryT`.
  0.8461: acacia sapling (B 236, T 407, `_growAcacia` in woods/saplings.js copies gen-acacia.js). Chest woods: 5 now,
  acacia's third bit is variant bit 7 (`CHEST_WOOD_HIGH`): read and write a chest's wood ONLY through `chestWoodOf` /
  `chestWoodBits` (blocks/chest.js). Grass plants by size: `B.SHORT_GRASS` 237 (T 408-410, its warm and cold built in
  03 by the `_warm`/`_cold` name rule), `B.TALLGRASS` 49 = "Grass" (the middle one), tall grass. biomeRev 29
  `SHORTGRASS` (worldgen/gen-setup.js): half the grass plants short. Fiber per pick by size: GRASS_FIBER_PICK and
  SHORT_GRASS_FIBER_PICK (player/foraging.js, final chances: FIBER_BONUS is taken off before the roll adds it).
  0.8462, biomeRev 30 `SAV2` (biomes/fields.js): the Savanna from SAV2_FROM and the desert from `DESERT_LVL` 1.75
  (1.5 before; dryAt's fade reads it too): Savanna ~8% of a world, desert ~17%. Its hills come from `termiteHillPass`
  (biomes/gen-savanna.js, after the tree loop): one at most per HILL_CELL 32 square, HILL_EDGE in, none by an acacia
  trunk (it reads the tree loop's rolls again); revs 28-29 keep the tree loop's hills. A hill needs a full block
  (`termiteHillFloor`: solid and opaque) under each foot cell: setBlock calls `termiteHillUnder`, which breaks it.
- **0.8463.** Bronze armor: ITEM 419-423 (`armorMat: 'bronze'`, tier 4; EQUIP_MATS / ARMOR_HUD_ART know it), recipes
  appended to RECIPES_ADVANCED. Sleeping: `bedRoomCheck` (blocks/bed.js) floods the air over the bed (BED_ROOM_MAX
  cells, else 'open') and wants BED_BUILT_SHARE of the solid blocks round it to be cells in `editStore` (put there by a
  player or a structure; a natural cave is not). Night monsters x `MONSTER_SPAWN_MUL` (entities/spawning.js: chance,
  cap and gap). A quest requirement may carry `weight: (id) => n` (one item counts n, player/quests.js).
  0.8464: a sealed chest opens through `player._unseal` / `updateChestUnseal` (blocks/chest.js, from tickPlayer; ring via
  `_unsealProg` in interactProgress; holds `_milkLatch`). Set bonus `projectileResist` (bronze) read by
  `playerProjectileMul(p)` (player/equipment.js): arrows (_arrowHitsPlayer, 38) and `_bossHurt(..., proj)`. A bull
  (cow gender 'M') is built with `_bullHorn` boxes (entities/cow.js).
  0.8465: the hotbar: every HOTBAR array holds `HOTBAR_MAX` (10, player/inventory.js), `hotbarLen()` (player/equipment.js)
  = HOTBAR_SLOTS + the belt's `hotbarSlots`: select, fill and draw only that many (`gridLen(HOTBAR)` too);
  syncBeltCapacity empties the slots past it. `migrateStash` keeps slots in place for a stash of today's shape. Night
  monsters: no world-wide gap any more; chunk rolls only in sim range, ZOMBIE_SPAWN_MIN_DIST 24, `updateNightMobs`
  (entities/spawning.js: the dusk sweep and the trickle). ITEM.LEATHER_STRIP 424. Quests round 3 (`added: 3`,
  QUEST_SAVE_GEN 3): the backpack after the bronze pickaxe.
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
| `termite.js`, `box-models.js` | the termites (`TERMITE`, `updateTermite`); box models by name (`boxModel`, `BOX_MODEL_DATA`), their data in `js/models/*.js` |
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
