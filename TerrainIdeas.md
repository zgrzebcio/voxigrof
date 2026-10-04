# Terrain & water ideas (to come back to)

Real-world land and water shapes the game does not have yet (listed after 0.835493). Only the shape of the land and
water, no blocks or items. ★ = fits the game best. Generator notes point at where each would plug in (55-biomes.js,
02-voxel-core.js genChunk), so a later session can start from here.

## Planned as biomes (in FutureRoadmap.md)

- ★ **Swamp** — roadmap item 116, v0.87 (with mangrove trees, mud). Terrain side: flat wet lowland, many shallow pools
  with bits of land between, water at its own level (rev 15+ `wl`), slow winding rivers through it, mostly in warm
  lowlands. Could be a biome flag in terrainInfo that flattens `h` toward `wl` and lets many small placed lakes
  (`_lakeDef`) overlap at ONE level (equal levels never need a divide).
- ★ **Volcano** — roadmap item 124, v0.89 (with blackstone, quartz). Terrain side: a cone mountain with a crater, or a
  wide collapsed caldera, sometimes a crater lake (a placed lake at the crater floor) or lava inside. A point-placed
  feature like `_lakeDef` (one per big cell, rare), adding a cone to `h` and cutting the crater.

## Water

- ★ **Rivers joining rivers** — streams merge into a bigger river that widens downstream. Today rivers only join lakes
  (`_lakeRiver`); a trace would end on another river's segment and hand its flow on (the receiver's width grows).
- ★ **Deltas** — a river splits into several channels just before the sea, sandy islands between.
- ★ **Bends and oxbow lakes** — big lowland rivers loop widely; a cut-off bend becomes a curved lake beside the river.
- **Fjords** — long narrow deep sea inlets between steep cliffs, on cold mountain coasts.
- **Lagoons and sandbars** — a long sand strip off the coast with calm shallow water behind it.
- **Islands** — small islands off the coast, island chains in the open sea (the seabed relief is clamped under water now).
- **Rapids** — shallow rocky stretches in steep rivers, rocks breaking the surface.
- **River islands** — a wide river splitting round an island.
- **Springs** — water coming out of a cliff or hillside, a stream's start.
- **Underground water** — rivers and lakes inside caves; flooded sinkholes (cenotes).
- **Mudflats** — wide, very flat, shallow shores.

## Land

- ★ **Mesas and buttes** — flat-topped, steep-sided lone hills in the desert, eroded badlands between them.
- ★ **Sinkholes** — round pits in the ground, some opening into caves.
- ★ **Glaciers** — ice filling high snowy valleys, flowing down from the peaks (the rev 17 mountain valleys, `_valley`).
- **Floodplains and river terraces** — wide flat land along big rivers; shelves stepping up the valley sides.
- **Mountain passes** — a low saddle between two peaks.
- **Scree slopes** — loose rubble heaped at the foot of cliffs.
- **Sea stacks and sea caves** — rock pillars and arches off rocky coasts (rev 13 `cliffAt`), caves in coastal cliffs.
- **Slot canyons** — very deep, very narrow cracks in desert rock.
- **Real dunes** — dune ridges and crescent dunes in deserts, not only round hills.
- **Lava tubes** — long round tunnels, a cave form of an old lava flow (could come with the volcano).

## Suggested order

Rivers joining rivers, deltas, swamp (v0.87), volcano (v0.89), mesas, sinkholes.

## Reminders for whoever builds these

- Terrain changes need a new `biomeRev` (17-input.js, CLAUDE.md list) so old worlds' new chunks still match.
- Water at different heights must never touch unless it is one river's fall: use the rev 18 groups (`g`/`up`/`dn`,
  `_kin`) and divides, and check with the scratchpad-style leak test (water beside air over dry ground = 0).
