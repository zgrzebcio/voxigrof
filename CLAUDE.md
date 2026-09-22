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
- **Units.** Model sizes are in 16ths of a block. Textures are 64x64. Log width is in 64ths.
- **Value-based helpers.** Ask a whole cell value what it is with `CORE.shapeOfVal`, `solidVal`,
  `opaqueVal` and `shapeBoxesAt`. Do not check the bare id.

## Where things are (search inside the file for the name given)
| File | Feature |
|---|---|
| 00-config | settings, constants |
| 01-textures-data / 03-atlas / 04-materials | texture list, atlas packing, three.js materials and shaders |
| 02-voxel-core | block ids `B`, `PROPS`, items, shapes (`SHAPE_*`, `shapeBoxesAt`), worldgen (`genChunk`), trees, mesher (`meshChunk`, `emitLog`, water) |
| 05-icons | inventory icons, rendered from the mesher |
| 06-renderer / 07-sky | scene and camera, sky, day/night |
| 08-light-glow / 09-light-sky | block light, sky light |
| 10-workers | worker pool for meshing and worldgen |
| 11-chunks | chunk load/unload, `getBlock`/`setBlock`, layer stacks, snow/grass hooks, terrain cache |
| 12-player | movement, collision, drag in snow/layers |
| 13-actions | place and break, `_shapeVariantFor` (chisel placement), hollow-log filling |
| 14-mining / 15-drops | break progress and tools, dropped item entities |
| 16-worlds | save/load, migrations of old saves |
| 17-input / 18-hud | keyboard, mouse, gamepad, HUD |
| 19-vitals | health, hunger, oxygen, temperature |
| 20-inventory-ui | inventory window, virtual cursor, tooltips |
| 21-spawn / 23-boot | spawn point, startup |
| 22-main-loop | frame loop, grass spread, falling blocks, leaf decay, mining tick |
| 24-hands | held item in the hand |
| 25-crafting | recipes (`timeToCraft`, `xpToGive`), crafting list, queue, pulling from chests |
| 26-furnace | `SMELT_RECIPES`, fuel, ashes, smelting book |
| 27-doors / 29-bed / 30-chest | doors, bed, chests (double chest) |
| 28-entities | mobs and animals: AI, spawning, levels |
| 31-armor / 40-shield | armor, shield |
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
| css/style.css | all UI styling |
