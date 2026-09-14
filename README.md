# voxiGrof

A voxel survival sandbox that runs in the browser: plain JavaScript and three.js, no build step.

Create a profile, press **Play**, and create a world. Untick **structures** on
the create screen for a world without villages and dungeons.

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | `W` `A` `S` `D` | Left stick |
| Jump / swim up | `Space` | A |
| Sneak | `Shift` | |
| Sprint (toggle) | `Ctrl` | |
| Break / attack | Left mouse | Right trigger |
| Place / use / eat / draw bow / raise shield | Right mouse (hold) | Left trigger |
| Pick up grass, bushes, flint pebbles | Hold `E` | Y |
| Inventory | `Tab` | B |
| Hotbar | `1`–`8` or mouse wheel | |
| Drop one / drop stack | `Y` / `Shift+Y` | |
| Pause menu | `Esc` or `tab` | Start |
| Fullscreen / camera view / debug text | `F1` / `F2` / `F3` | |

In the inventory: `Shift+click` quick-moves a stack, `Shift+right click` wears gear, middle click
sorts, and clicking outside the panels throws what you are carrying.

## Your first steps

Bare hands only break plants, leaves and furniture. Everything solid needs a tool, so the start
of the game is about making your first flint tools.

1. **Fiber.** Hold `E` on short grass, tall grass, wheat and berry bushes. Each pick has a chance to
   give fiber (grass 15%, wheat and ripe bushes 20%, bare bushes 30%). Fiber goes into every early
   recipe, so gather plenty.
2. **Sticks.** Break leaves. About 2% of broken leaves drop sticks, and leaves that decay on their own
   after a tree is cut drop them far more often (10%). Leaves can also drop saplings and, rarely,
   apples.
3. **Flint.** Small flint pebbles lie on the ground; hold `E` on one to pick it up. Gravel also
   drops flint 5% of the time.
4. **Flint tools.** Open the inventory (`Tab`) and craft a flint pickaxe (5 flint, 3 sticks,
   10 fiber) and a flint hatchet (4 flint, 3 sticks, 10 fiber).
5. **Wood.** With the hatchet, chop logs. A log makes 3 planks, a plank makes 3 sticks.
6. **Crafting bench.** 5 planks and 5 fiber. Right click it to open the full recipe list: stone and
   metal tools, armor, the furnace, chests, beds and more.
7. **Furnace.** 12 stone, crafted at the bench. Put fuel in the bottom slot and something to smelt
   in the top one.

Watch your hunger and air. Starving and drowning hurt, and drowning hurts more with every hit.
Zombies and skeletons come out at night and burn up at sunrise.

## Crafting

Crafting takes time. Every recipe has a craft time, and the ingredients are taken the moment you
commit to it.

- **From the inventory:** clicking a recipe adds one craft to your crafting queue under the recipe
  list. The queue has 6 slots and each slot is one craft; `Shift+click` fills every empty slot you
  can afford. The queue keeps working while the
  inventory is closed (it shows faintly in the bottom-left corner), but you walk slower and cannot
  sprint until it is done. Click a queued slot to cancel it, or **Cancel all**; unfinished crafts
  give their ingredients back.
- **At a crafting bench:** pick a recipe and the bench takes the ingredients. The order floats over
  the bench with its icon, amount and progress bar. **Hold `E`** at the bench to craft (you cannot
  move while you do; letting go or getting hit loses the item in progress). **Tap `E`** to take what
  is finished. **Hold right click** on the bench to cancel the order, which drops everything on the
  floor. A bench works one recipe at a time; picking the same recipe again adds to its amount.
- **With a chest open** (both halves of a double chest), crafting from the inventory also uses what is
  in the chest. Your own inventory is used first. If your inventory is full when a craft finishes, the
  item goes into the open chest instead of onto the floor. The feed shows both ("used from chest",
  "crafted to chest").
- **Crafting speed** is shown in the equipment stats. 100% is normal, 200% is twice as fast, and 0%
  means you cannot craft.

## Ores

Sea level is y = 99. Use `F3` to see your coordinates. Each ore can appear anywhere in its range,
but is most common in its best band.

| Ore | Best depth (y) | Found between (y) | Pickaxe needed | Drops |
|---|---|---|---|---|
| Coal | 60–90 | 35–180 | Flint | Coal and coal chunks |
| Copper | 70–80 | 20–85 | Flint | Raw copper |
| Iron | 50–65 | 15–130 | Stone | Raw iron |
| Tin | 40–45 | 10–70 | Stone | Raw tin |
| Gold | 20–30 | 5–40 | Iron | Raw gold |
| Diamond | 15–20 | 2–30 | Bronze | Diamond |
| Ruby | 43–47 | 30–70 | Bronze | 1–2 rubies |
| Sapphire | 93–97 | 80–130 | Bronze | 1–2 sapphires |
| Emerald | 150–160 | 120–200 (mountains) | Bronze | 1–2 emeralds |

Pickaxe tiers go flint, stone, iron (gold is the same tier), bronze, then diamond. Diamond and every gem ore need bronze or better. Mining an ore
with too weak a pickaxe gives nothing.

## Smelting

The book button in the furnace's corner lists every smelt with its time, fuel and XP.

| Put in | Get out | Time |
|---|---|---|
| Raw iron / gold / copper / tin | Iron / gold / copper / tin ingot | 8 s |
| Iron / gold / copper / tin / bronze powder | Ingot | 6 s |
| Sand | Glass | 5 s |
| Cobblestone | Stone | 5 s |
| Log | Charcoal | 5 s |
| Clay ball | Brick | 5 s |
| Flour | Bread | 5 s |
| Raw mutton / raw beef / raw pumpkin pie | Cooked mutton / steak / pumpkin pie | 5 s |
| Rotten flesh | Leather | 5 s |

XP from smelting waits in the furnace and goes to whoever takes the output.

Fuel burns in fuel points of 5 seconds each: a coal chunk is 1, coal 5, charcoal 4, a charcoal chunk 0.8,
a plank 0.75. One coal or charcoal splits into 5 chunks, and 5 chunks make it back. A lava bucket burns
for a very long time. Every 8 fuel points burnt (two charcoal) leave one ash in the slot under the
output; each ash gives 1 XP when you take it. Lava leaves no ash.

## Rare and special materials

- **Sulfur.** Found in caves as yellow sulfur blocks, often with small sulfur tips growing off them.
  Look 5–10 blocks below lava pools, where they come in clusters; single blocks also appear in cave
  walls between y 30 and 80, most often around y 48–50. You need a stone pickaxe. Breaking a tip
  gives 0–2 sulfur.
- **Gunpowder.** 1 charcoal, 2 sulfur and 1 flint make 2 gunpowder. 7 gunpowder and 10 sand make
  TNT.
- **Glow dust.** 1 stone, 1 flint and 1 coal. 4 glow dust make a glowstone block, a light source.
- **Glow vines and glow crystals.** Glowing vines hang down cave walls and light the tunnels; you can
  climb them (walk into the vine or hold jump to go up, sneak to hold still). Breaking one with any
  tool gives 1–2 glow crystals; by hand it just comes down. 5 glow crystals make a glowcrystal block
  at the crafting bench, the brightest light in the game. Iron, copper, tin, gold and diamond ore
  also glow faintly, so they are easier to spot in the dark.
- **Cobwebs.** Strung in cave corners, on floors, walls and ceilings. Walking into one slows you
  down by 80% (leather armor helps only half as much there). Cut one with a sword for 1–3 string.
- **Gems.** Emerald, ruby and sapphire ore glow faintly like diamond ore and need a bronze pickaxe;
  each gives 1–2 gems (see the ore table for where they are).
- **Storage blocks.** At the crafting bench, 10 coal, charcoal, iron/gold/tin/copper ingots, diamonds,
  emeralds, rubies, sapphires or raw iron/gold/tin/copper press into one block, and a block breaks back
  into 10. Coal and charcoal blocks burn in a furnace as long as the ten they were made from.
- **Topaz.** An orange-yellow gem between y 60 and 100 (most common at 78–82); bronze pickaxe, 1–2 topaz.
- **Sandstone.** 5 sand make sandstone and 5 red sand make red sandstone at the crafting bench.
- **Fiber block.** 10 fiber pressed into a block (and back), breakable by hand. Very rarely a plains
  grass block turns out to be one.
- **Ladder.** 10 sticks at the crafting bench. Place it on a wall and climb it like a glow vine; if the
  wall is broken the ladder drops.
- **Block recipes.** Snow, clay, glass, bricks, wool and glowstone take 5 of their material; hay bales,
  storage blocks and nuggets-to-ingot take 10.
- **Mortar and pestle.** 20 granite, 1 bone, 2 flint and 1 fiber block at the crafting bench; breaks by
  hand. It works like a crafting bench (pick a recipe, hold `E` to grind, tap `E` to take) but only
  makes powders: glow dust, gunpowder, flour and sugar are made here and nowhere else. The pestle
  circles the bowl while you grind.
- **Bronze.** At the mortar, 2 copper powder and 1 tin powder make 2 bronze powder, which smelts into
  bronze ingots (10 bronze nuggets make an ingot). Bronze tools sit between iron and diamond, and a
  bronze pickaxe is needed for diamond and gem ores.
- **Metal powder.** At the mortar, 1 raw iron, tin, copper or gold grinds into 2 powder (a raw ore
  block gives 20, but takes ten times as long). Each powder smelts into one ingot, so grinding doubles
  your metal. Bronze and steel powder exist for a future update.
- **Milk.** Use an empty bucket on a female cow. Each cow refills after 10 minutes. Drinking milk removes
  every active effect.
- **Clay.** Found on the bottom of lakes and seas. A clay block breaks into 4 clay balls, which smelt
  into bricks.
- **Glass shards.** Breaking glass gives 2–4 shards; 4 shards craft back into a glass block.

## Animals and mobs

- **Sheep** drop wool, string and raw mutton. Wool makes beds, string makes bows.
- **Cows** drop leather and raw beef. Leather makes the first armor set and the backpack.
- **Zombies** drop rotten flesh, which a furnace turns into leather.
- **Skeletons** drop bones and arrows.
- **Horses** can be tamed with a golden apple, then ridden with a saddle.
- **Cloth** is spun from 10 fiber at the bench and goes into beds, backpacks and metal tools.

## Handy recipes

| Item | Ingredients | Where |
|---|---|---|
| Torch ×4 | 1 coal or charcoal, 1 stick, 1 fiber | Inventory |
| Crafting bench | 5 planks, 5 fiber | Inventory |
| Furnace | 12 stone | Bench |
| Chest | 10 planks, 1 iron ingot, 10 fiber | Bench |
| Bed | 4 wool, 4 planks, 5 cloth, 10 fiber | Bench |
| Bow | 10 string, 5 sticks, 12 fiber | Bench |
| Arrows ×2 | 1 flint, 2 sticks, 6 fiber | Inventory |
| Backpack | 14 leather, 10 cloth, 8 fiber, 6 copper nuggets | Bench |

Sleeping in a bed skips the night and sets your respawn point. Hold `Shift` in the crafting list to
craft as many as you can afford in one click.
