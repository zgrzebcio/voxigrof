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
| Diamond | 15–20 | 2–30 | Iron | Diamond |

Pickaxe tiers go flint, stone, iron (gold and diamond are iron's tier or better). Mining an ore
with too weak a pickaxe gives nothing.

## Smelting

| Put in | Get out |
|---|---|
| Raw iron / gold / copper / tin | Iron / gold / copper / tin ingot |
| Sand | Glass |
| Cobblestone | Stone |
| Log | Charcoal |
| Clay ball | Brick |
| Flour | Bread |
| Raw mutton / raw beef | Cooked mutton / steak |
| Rotten flesh | Leather |

Fuel lasts: coal 8 items, charcoal 4, a coal chunk 1, a plank less than 1. A lava bucket burns
for a very long time.

## Rare and special materials

- **Sulfur.** Found in caves as yellow sulfur blocks, often with small sulfur tips growing off them.
  Look 5–10 blocks below lava pools, where they come in clusters; single blocks also appear in cave
  walls between y 30 and 80, most often around y 48–50. You need a stone pickaxe. Breaking a tip
  gives 0–2 sulfur.
- **Gunpowder.** 1 charcoal, 2 sulfur and 1 flint make 2 gunpowder. 7 gunpowder and 10 sand make
  TNT.
- **Glow dust.** 1 stone, 1 flint and 1 coal. 4 glow dust make a glowstone block, a light source.
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
