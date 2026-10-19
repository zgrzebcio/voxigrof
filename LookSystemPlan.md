# Looks in bits: plan

Status: DONE in 0.84691. Answers: snow brick, snow-ice brick, carved snow, carved ice and thatch stay ids (no
worked-block rule); ice brick stays an id; furnace/bench/chest/bed stay in the variant byte; look numbers per base;
shipped prefabs are converted on load (not rewritten). Written after 0.8469, when only block ids 254 and 255 were left.

## The idea in one paragraph

A look (granite brick, polished granite, thatch, carved ice...) stops being a block id of its own. The cell keeps the
BASE block's id (granite) and carries the look's number in bits 16-23 of the cell. Every rule that asks "is this granite"
then sees granite, which is what "variants, not new blocks" means. Only the art (and a few drawing-only fields) comes
from a look table. About 70 ids come back free once old saves and prefabs are converted.

## Bit layout of a cell (Uint32)

| bits  | holds | change |
|-------|-------|--------|
| 0-7   | block id | none |
| 8-15  | variant byte: shape, rotation, layers, fluid level, furnace rock, bench/chest/bed wood, cluster bed, growth stage | none |
| 16-23 | **look** (0 = the block's own look, 1-255 its looks) | NEW |
| 24-31 | kept free (paint/dye later, or a wider id if one is ever needed) | none |

Checked: nothing in the cell code uses bits 16-31 today (the only `<< 16` / `>> 16` are hashes, colours and the column
cache). Values stay under 2^24, so they stay positive numbers in JSON saves and in the Int32 greedy mask of the mesher.

A look's NUMBER goes into the saves, like an `ITEM` id: it is given by hand in its entry and never changed or reused.

## What a look may and may not change

A look may change only what is drawn and what its name is:
`name`, `faces` (or one `tile`), `pillar` (its side art turns with the axis bits, like the rock pillars), `matFaces`
(the mortar's bowl), and later anything else that only the mesher, icons and names read.

A look may NOT change opacity, pass, light, solidity, hardness, tool, shapes or stack: those come from the base id. That
keeps the light threads, the fluid thread, collision and the worker's culling working on the id alone.

The one look today that breaks this is **ice brick** (opaque, pass 0, while ice is see-through, pass 4). It stays a
block id of its own (see question 2).

**The "worked block" rule.** Some bases have behaviour by id that their looks do not have today: snow falls, is dug by
layer, drops snowballs, makes grass snowy and melts; hay falls; ice melts by heat and breaks into nothing; stone drops
cobble. Today the looks escape all of that because they are other ids. Proposal: a cell with a look is a worked block:
it never falls, never melts or thaws, makes no snowy grass, and breaks into its BASE block as an item (not the base's own
special drop). One helper `lookOf(v)` and a handful of guards (listed below) instead of keeping snow, hay and ice looks as
ids. (Question 1.)

## The look table (BLOCK_CORE, so page and workers share it)

`blocks/looks.js` stays a core part and becomes the look table:

```js
// defineLook(base, n, key, { name, tile | faces, pillar, matFaces, was })
defineLook(B.GRANITE, 1, 'brick',    { tile: T.GRANITE_BRICKS,    was: 127 });
defineLook(B.GRANITE, 2, 'mossy',    { tile: T.MOSSY_GRANITE_BRICKS, was: 137 });
...
```

- `LOOKS[id]` = array by look number (null where none); `LOOK_SHIFT` 16.
- Helpers (all value-based, like `shapeOfVal`): `lookOf(v)`, `withLook(v, n)`, `facesOfVal(v)` (the look's faces or
  the block's), `lookPropOf(v)` (the entry or null), `matKey(v)` = `v & 0x00FF00FF` (id and look: "the same material").
- `was` = the retired block id the look replaces; it builds the conversion table for old saves (`LOOK_OF_OLD_ID`).
- Exported through blocks/blocks.js's return, the `const {...} = BLOCKS` in chunks/voxel-shared.js, and VOXEL_CORE's
  return (chunks/voxel-core.js) for the page.

The variant bar's order stays a hand-written list per base in blocks/variants.js, but its entries become
`{ id: B.GRANITE, look: 1 }` (the name comes from the table). Looks off the bar (cracked stone brick) stay in the table
only, so placed ones still draw.

## The 69 look ids and where each goes (68 in VARIANT_BLOCKS, plus STONE_BRICK)

- **Become looks** (rock bricks, mossy, polished, carved, band, pillar, sandstones, adobe, terracotta brick/carved/roof,
  thatch, obsidian, glass x4, sulfur brick, mossy cobble, bone brick, snow brick, snow-ice brick, carved snow, carved
  ice, the 4 mortar bowls, and STONE_BRICK itself as stone's look 1).
- **Become a cluster bed** (already a bits feature): the five `*_CLUSTER_STONE` ids turn into their ore with bed 1
  (stone) in `CLUSTER_BED_SHIFT` bits.
- **Stay ids**: ICE_BRICKS (opaque, see above). GLASSY_RED_SAND and GLASSY_PINK_SAND are real blocks made by lightning
  on red and pink sand: they stay too (they are on glassy sand's bar, which can stay as an `id` option).
- **Snow-ice brick** is on both the ice and the snow bar: it becomes a look of SNOW, and the ice bar's option points to
  `{ id: B.SNOW, look: n }` (as today it places a snow-family block and breaks into snow).

## Every file to touch

**Table and helpers (worker cores)**
- `blocks/looks.js`: the table, `defineLook`, helpers; the `VARIANT_BLOCKS` loop, `_BRICK_VARIANTS`, `_GLASS_VARIANTS` go.
- `blocks/tiles.js`: the look names leave `B` (their numbers live on as `was` in the table). The tiles `T` stay.
- `blocks/blocks.js`, `chunks/voxel-shared.js`, `chunks/voxel-core.js`: export the new names.
- `shapes/shape-blocks.js`: `VARIANT_FAMILIES` shrinks to real-id families (ice/ice brick, the glassy sands); the
  `_ROCK_LOOKS` / `_GLASS_VARIANTS` entries in `SHAPE_BLOCKS` go (a look takes its base's shapes by being its base).
- `shapes/chimney-mixed.js`: `CHIMNEY_ROCKS` from the bases only; mixed slabs keep a look per half (below).

**Mesher**
- `chunks/mesher-cubes.js` `emit`: tile from `facesOfVal(val)`; `prop.pillar` from the look when it has one. The greedy
  mask already holds the whole value, so stone and polished stone never merge into one quad.
- `chunks/mesher.js` `faceVisible`: "same type, cull the face between" must compare `matKey`, not the id, or a dark
  glass beside clear glass loses the face between them.
- `chunks/mesher-models.js`: shapes, layers, mixed slabs, the mortar's `matFaces`, the cluster bed: faces from the value
  or from the half's entry.
- `chunks/mesher.js` `lodDownsample`: check it carries the whole value (it should; verify).
- `chunks/mesher-plants.js`, `mesher-logs.js`, `fluids/mesher-fluids.js`: no looks there, nothing to do.

**Mixed slabs and layer stacks (ids only today)**
- `LAYER_STACKS` lists go from `Uint8Array` to `Uint16Array`, each entry `id | look << 8`. Old saved lists are plain
  numbers under 256, so they read the same. Readers mask `& 255` for the id: `chunks/layer-stacks.js`,
  `shapes/chimney-mixed.js` (`slabMixIdsAt`, `setSlabMix`, `breakSlabMixHalf`), `chunks/mesher-models.js`,
  `blocks/falling.js` (`layerIdsAt` users, the `fill(val & 255)` there loses the look), `blocks/layer-drops.js`,
  `woods/felling.js`, `player/movement.js` (snow drag), `seasons/weather-ground.js`, `16-worlds.js` (load: `Uint16Array.from`),
  and how `meshJob` hands the lists to the worker (10-workers.js / chunks/worker.js: check the copy keeps Uint16).
- A single-material layer stack or shape keeps its look in the cell itself, no list needed.

**Placing and the variant bar (page)**
- `blocks/variants.js`: options carry `look`; new `heldLookOf(id)`; `variantBaseOf` and `_VARIANT_BASE` go (a look is
  its base already); the boot check against `VARIANT_FAMILIES` goes; `variantNameOf` reads the table.
- `player/place-block.js`: the placed value is `id | varb << 8 | look << 16`. The chisel's shape REPLACES the variant byte
  today (so a cluster bed is lost on a shaped block); the look sits apart, so "polished granite stairs" just works.
- `shapes/chisel.js` (`chiselSlotIcon`), `player/hands.js` (held model), `ui/tooltips.js`: pass the look along.
- The page's "variant" argument (renderBlockIcon, buildDropGeom, `_rebuildHeld`) becomes `v >>> 8` (byte + look):
  both already do `id | (variant << 8)`, so the look rides through; their caches key on it.

**Breaking, drops and behaviour by id (the worked-block guards)**
- `50-loottable.js` `blockDrop`: take the value (or a look argument); a look drops its base block, before every id rule
  (else polished stone gives cobble, carved ice nothing, snow brick snowballs). Callers: `player/tick.js`,
  `player/breaking.js`, `blocks/falling.js`, `blocks/tnt.js`, `53-storms.js` fire, any other `blockDrop(` caller.
- `blocks/falling.js` (`scheduleFall`, `FALL_WHOLE_BLOCKS` hay, snow): a look never falls.
- `blocks/mining-rules.js` `DIG_BY_LAYER` (snow dug a layer at a time) and its use in `player/tick.js`: not for a look.
- `chunks/block-access.js`: snowy grass under snow (`_snowy`), `iceQueueIfHot`, the cluster-stone `variantBaseOf`.
- `seasons/ice.js` (heat melt, thaw), `woods/felling.js` (`_meltKeeps`, snow melt): only look 0.
- `53-storms.js` `_BURN` (thatch = hay's numbers already; drop the THATCH line).
- `player/eating.js` `THROW_BLOCKED_BY`, `blocks/mining-rules.js` `HAND_BREAK_BLOCKS`: drop the look ids (base covers).
- `player/leveling.js` (XP by family): families of looks are one id now.
- `49-particles.js`: break crumbs from `facesOfVal(v)` (else a look crumbles in its base's art); the cluster-stone rows go.

**Code that rebuilds a value and would drop the look**
- `blocks/crafting-bench.js` 110, 307, 314 (the mortar's pestle on/off: a granite mortar would turn plain).
- `blocks/doors.js`: `doorValOf(mat, ...)`, `_doorArt(mat)`, `doorLookOf`, `doorDropOf`: a door of a look (dark glass
  door, adobe brick door) needs the material as id + look, its art keyed by both.
- `woods/felling.js` 330 (bushes, no looks: fine), `player/breaking.js` 45 (pumpkin: fine), `blocks/chest.js` (no looks).
- Any `getBlock(...) === B.X` written for a base that gains looks now misses the looked cells. Mostly that is right
  (polished stone is not "natural stone"); each hit gets a look while the work is done (a list of ~500 refs to
  STONE, SNOW, ICE, COBBLE... was made; most are worldgen, which places plain blocks only).

**Names on screen**
- Wherever a cell's name is shown (hover/crosshair name, F3, `flashBlockName`): `blockNameOf(v)` = the look's name or
  the block's. Search `PROPS[...].name` in ui/ and player/.

**Saves, worker, terrain cache, prefabs**
- Chunk arrays, the workers, the save worker, the terrain cache: Uint32 all the way, nothing to change. World
  generation never places a look id (checked), so `TERRAIN_KEY` need not move and the 244 hashed test chunks must come
  out the SAME: a free proof that the land did not change.
- `16-worlds.js` load: old look ids in `edits` and in `layers` turn into base + look (`migrateLegacyVal`, blocks/legacy.js,
  from `LOOK_OF_OLD_ID`). The world save gets a stamp (e.g. `cells: 2`): the conversion runs only on saves without it.
  That gate is what makes the freed ids safe to reuse later. The closing-time `vg_world_<id>` copy is the same format.
- `34-structures.js`: a prefab cell is `[x, y, z, id, variant]`; add an optional 6th number, the look. Stamping (586)
  builds `id | variant << 8 | look << 16`; the structure block's capture (537) writes it; load (372) converts old look
  ids through the same table and a `"cells": 2` stamp. The 14 shipped prefabs: 7 use look ids (snow castle: 11742 snow
  brick, 1408 snow-ice brick, 126 ice brick, 136 marble pillar; desert ones sandstone brick/polished, dolomite pillar;
  igloo snow brick; dungeon room stone brick). Rewrite them once with a script (dry run first, then for real with the
  size guard, per the CLAUDE.md rule), or leave them to the load-time conversion. `entities/boss-lair.js`
  (`_castlePrefab` rules) reads ids: check its snow rules against snow-brick looks.
- Inventories, chests, drops on the ground: a look id is never an item (noInv, drops are the base), so nothing to convert.
  `legacyItemId` keeps mapping STONE_BRICK to stone.
- `GAME_VERSION` bump (icons and the item art pack are cached by it).

## Order of the work (one version)

1. Backup ref. Table + helpers in BLOCK_CORE, mesher reads them (old look ids still defined: both paths draw).
2. A headless node test: build the cores as index.html does, mesh one cell of each OLD look id and of base+look, compare
   positions, tiles and passes: must be identical. And the 244 hashed chunks unchanged.
3. Variant bar and placing write base + look; breaking, drops, worked-block guards, names, icons, held model, doors,
   mortar, particles, mixed slabs / Uint16 stacks.
4. Save stamp + conversion on load; prefab 6th number + conversion; rewrite the shipped prefabs.
5. Take the look ids out of `B` and PROPS. Ids stay unused for one version; reuse them from the next one.
6. `check-scripts.ps1`, `check-textures.ps1`; a game test only when the user asks.

Size: about 35-40 files, most of them small edits. The mesher, blockDrop, the bar and the save conversion are the real
work.

## Risks

- **A rule keyed on a base id now catches its looks.** The worked-block guards cover what was found (fall, melt, snowy
  grass, layer digging, drops); anything missed shows up as a look behaving like its base (a snow brick melting, polished
  stone dropping cobble). The ~500 base-id references need a read-through, not a blind edit.
- **A value rebuilt from `& 255` drops the look** (mortar, doors found; others possible). A grep for `& 255) |`,
  `& 0xFF00` and `id | (` on the page finds them.
- **The culling between see-through looks** (glass x4) must use id + look, or faces between them vanish.
- **Uint8 -> Uint16 layer lists**: a reader left on `PROPS[b]` gets undefined for a looked entry (it draws nothing; no
  crash, since the mesher checks `PROPS[b]`).
- **Reusing freed ids too early.** Any old data not converted (a save without the stamp read by a path that skips
  `migrateLegacyVal`, an exported prefab) would show the NEW block. Hence the stamp, and no reuse in the same version.
- **Workers out of step**: the table is a core part, so page and workers are built from the same text; a look added
  only on the page would draw blank. Keep the table in the core part only.
- Saves made after this cannot be opened by an older build (it would see stone where polished stone was). Usual for
  this game, but worth knowing.

## Questions for the user

1. **Snow, hay and ice looks**: the worked-block rule (a look never falls, melts, makes snowy grass, and breaks into its
   base block), or keep snow brick, snow-ice brick, carved snow, thatch and carved ice as ids of their own (5 ids)?
   Recommended: the rule; it also covers every future look of a block with behaviour.
2. **Ice brick** is opaque while ice is see-through. Keep it an id (recommended), or let looks change opacity (the light
   and fluid threads, culling and collision would all have to read the look: much more work)?
3. **Furnace rocks, bench / chest / bed woods** already sit in the variant byte. Move them into the look field too (one
   system, frees variant bits) or leave them (recommended for now: they work, and moving them is another save conversion)?
4. **Shipped prefabs**: rewrite the 7 files once (recommended) or convert them every time they load?
5. **Look numbers**: fixed per base (granite 1 brick, 2 mossy, 3 polished...) as proposed, or one global list of look
   kinds (brick = 1 for every rock) so a "brick" look can be asked for by kind? Global kinds make "every rock's brick"
   one line, but a base's looks must then all exist in that list.
6. **Version**: which number for this step?
