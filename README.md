# voxiGrof

A voxel survival sandbox that runs in the browser: plain JavaScript and three.js, no build step.
Current build: **alpha 0.792**.

Create a profile, press **Play**, and create a world. Untick **structures** on
the create screen for a world without villages and dungeons.

- [Controls](#controls)
- [Your first steps](#your-first-steps)
- [Levels and skills](#levels-and-skills)
- [Crafting](#crafting)
- [Smelting](#smelting)
- [Ores](#ores)
- [Food and spoiling](#food-and-spoiling)
- [Animals and mobs](#animals-and-mobs)
- [Block shapes](#block-shapes)
- [Rare and special materials](#rare-and-special-materials)
- [Handy recipes](#handy-recipes)

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | `W` `A` `S` `D` | Left stick |
| Look | Mouse | Right stick |
| Jump / swim up | `Space` | A |
| Fly (creative) | Double-tap `Space` | Double-tap A |
| Sneak / descend | `Shift` | X |
| Sprint (toggle) | `Ctrl` | L3 (left stick click) |
| Break / attack | Left mouse | Right trigger |
| Place / use / eat / draw bow / raise shield | Right mouse (hold) | Left trigger |
| Pick up grass, bushes, flint pebbles | Hold `E` | Hold Y |
| Work a bench or mortar | Hold `E` (tap to take) | Hold Y (tap to take) |
| Inventory | `Tab` | B (tap) |
| Skill tree | `K` | Skill tree tab on top of the right-hand panel |
| Hotbar | `1`–`8` or mouse wheel | LB / RB |
| Drop one / drop stack | `Y` / `Shift+Y` | D-pad Down / X + D-pad Down |
| Shape wheel (hammer worn) | Hold `Q`, aim with the mouse, let go | Hold B, aim with the right stick, let go |
| Pick a variant (hammer in Neck) | Hold `R` + mouse wheel | Hold D-pad Right + LB / RB |
| Turn the shape wheel's page | Mouse wheel | LB / RB |
| Pause menu | `Esc` | Start |
| Fullscreen | `F1` | Back / Share |
| Camera view | `F2` | D-pad Left |
| Debug text | `F3` | D-pad Up |

In the inventory: `Shift+click` quick-moves a stack, `Shift+right click` wears gear, middle click
sorts, and clicking outside the panels throws what you are carrying. On a pad the sticks move a
cursor: A picks up and puts down, Y quick-moves, D-pad Down drops, and LB/RB flip the recipe tabs.

## Your first steps

Bare hands only break plants, leaves and furniture. Everything solid needs a tool, so the start
of the game is about making your first flint tools.

1. **Fiber.** Hold `E` on short grass, tall grass, wheat and berry bushes. Foraging needs both hands, so your offhand must be empty. Each pick has a chance to
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
7. **Furnace.** 12 cobblestone, crafted at the bench. Put fuel in the bottom slot and something to smelt
   in the top one.

**Starter quests** in the top-right corner walk you through these steps one at a time, from your first
fiber to one of every gem. Each shows what to get and how, and pays XP when it is done.

Health stops regenerating for 5 seconds after any hit (2 with Rapid regen) and while you are poisoned.
Milk goes off in 10 minutes and leaves the bucket, meat leaves rotten flesh, and a pumpkin is food that
keeps 4 hours and can no longer be planted.

A crafting bench or mortar needs its top clear: with a block or plant standing on it, it will not open,
and an order on it cannot be worked or taken. A craft you are part way through is kept when you let go,
walk away or leave the world.

Dropped items stay where they fall, even when you walk away and the area unloads. Their time only runs
while you are near: everything you carried lies 20 minutes after you die, what you throw down 10,
anything else 5.

Watch your hunger and air. Starving and drowning hurt, and drowning hurts more with every hit.
Zombies and skeletons come out at night and burn up at sunrise. Food you carry also goes off in
time — see [Food and spoiling](#food-and-spoiling).

## Levels and skills

Breaking naturally-generated blocks, smelting, crafting and killing pay experience. Breaking a
block you placed yourself pays nothing, so a stack of dirt is not an XP loop. Nothing is lost on
death: your level is a record of what you have done.

A kill pays a base for what the creature is **plus its level** (every creature rolls a level of
1–50): animals 20, villagers 30, monsters 40. A level-1 cow is 21, a level-50 zombie is 90.

Each level costs three times the last — 30, 90, 270, 810 — up to level 50, so a level is meant to be an
achievement rather than something that ticks over.

**Every level is one skill point.** Spending points does not spend levels. Open the tree with `K`,
or with the **Skill tree** tab on top of the right-hand panel, which shows how many points are free. With a furnace, chest or structure block open, the same tabs switch that panel to **Equipment** and back.
Pick a category tab, then click a skill **twice** — the first click arms it, the second learns it,
because there is no way to unlearn one.

| Survival | Cost | Needs | Effect |
|---|---|---|---|
| Thick Skin | 1 | — | +10% damage reduction |
| Grass Weaver | 1 | — | 30% better chance of fiber from grass, wheat and bushes |
| Slow Burner | 1 | Thick Skin | Hunger and oxygen drain 5% slower |
| Canopy Forager | 1 | Grass Weaver | 30% better chance of sticks, saplings and apples from leaves |
| Timber Shaker | 2 | Canopy Forager | Every swing that cuts a log shakes the tree: each leaf on it has a 2% chance to fall and drop its loot |

| Crafting | Cost | Needs | Effect |
|---|---|---|---|
| Nimble Fingers | 1 | — | +10% crafting speed |
| Walk and Work | 1 | Nimble Fingers | Crafting slows your walk 25% less |
| Fine Work | 1 | Nimble Fingers | Tools and gear you craft from now on are Well made: 10% chance a use costs no durability |
| Spare Parts | 1 | Nimble Fingers | 5% chance an ammo craft gives 1 extra |
| Mender | 2 | Fine Work + Walk and Work | Worn-out gear breaks instead of vanishing, and can be repaired |

| Exploring | Cost | Needs | Effect |
|---|---|---|---|
| Treasure Nose | 1 | — | 25% chance a loot chest holds one extra item |
| Prospector | 1 | — | +1 of the ore from every ore block you mine |
| Weathered | 2 | — | +10% cold and heat resistance |
| Pack Rat | 1 | Treasure Nose | Block stacks hold 10 more |
| Hazard Hide | 1 | Prospector + Treasure Nose + Weathered | 30% less damage from falls, lava and cactus |

| Husbandry | Cost | Needs | Effect |
|---|---|---|---|
| Butcher | 1 | — | +1 of each drop from animals you kill |
| Preserver | 1 | — | Food you carry spoils 10% slower |
| Lingering | 1 | Preserver | Food and potion effects last 25% longer |
| Gentle Hand | 2 | Butcher | Taming is 10% faster |
| Saddler | 2 | Gentle Hand | The saddle recipe costs 20% less |

**Mender's repairs.** A tool or piece of armor worn to zero stays in its slot, marked broken, and
does nothing — a broken pickaxe mines like a bare hand. Drag it onto the recipe list or the
crafting queue to repair it for **half its recipe**, rounded up, in half the craft time. Anything
made with flint can be mended anywhere; everything else needs a crafting bench. The cost and where
it can be done are written in the item's tooltip.

## Crafting

Crafting takes time. Every recipe has a craft time, and the ingredients are taken the moment you
commit to it.

- **From the inventory:** clicking a recipe adds one craft to your crafting queue under the recipe
  list. The queue has 6 slots and each slot is one craft; `Shift+click` fills every empty slot you
  can afford, and holding `Ctrl` (pad **X**) while clicking counts a batch out on the cursor — let go to
  order them all, right click to drop it. The queue keeps working while the inventory is closed — it shows faintly in the hotbar
  row, just left of the offhand slot — but you walk slower and cannot sprint until it is done. Click
  a queued slot to cancel it, or **Cancel all**; unfinished crafts give their ingredients back.
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

## Smelting

The book button in the furnace's corner lists every smelt with its time, fuel and XP.

| Put in | Get out | Time |
|---|---|---|
| Raw iron / gold / copper / tin | Iron / gold / copper / tin ingot | 9 s |
| Iron / gold / copper / tin powder | Ingot | 7 s |
| Bronze powder | Bronze ingot | 8 s |
| Raw mutton / raw beef | Cooked mutton / steak | 9 s |
| Raw pork | Cooked pork | 7 s |
| Raw pumpkin pie | Pumpkin pie | 15 s |
| Flour | Bread | 7 s |
| Rotten flesh | Leather | 7 s |
| Sand | Glass | 5 s |
| Cobblestone | Stone | 5 s |
| Clay ball | Brick | 5 s |
| Log | Charcoal | 4 s |

XP from smelting waits in the furnace and goes to whoever takes the output.

Fuel burns in **fuel points of 5 seconds each**, so how many smelts one item covers depends on what
you are smelting: a coal chunk (1 point, 5 s) is exactly one cobblestone but only half a raw ore.

| Fuel | Points | Fuel | Points |
|---|---|---|---|
| Lava bucket | 99 | Charcoal chunk | 0.8 |
| Block of coal | 50 | Plank / bark | 0.75 |
| Block of charcoal | 40 | Sapling | 0.5 |
| Coal | 5 | Stick | 0.25 |
| Charcoal | 4 | | |
| Fat | 1.5 | | |
| Coal chunk | 1 | | |

One coal or charcoal splits into 5 chunks, and 5 chunks make it back. Every 8 fuel points burnt
(two charcoal) leave one ash in the slot under the output; each ash gives 1 XP when you take it.
Lava leaves no ash.

## Ores

Sea level is y = 99. Use `F3` to see your coordinates. Each ore can appear anywhere in its range,
but is most common in its best band.

| Ore | Best depth (y) | Found between (y) | Pickaxe needed | Drops |
|---|---|---|---|---|
| Coal | 60–90 | 35–180 | Flint | 2–4 coal and 3–7 coal chunks |
| Copper | 70–80 | 20–85 | Flint | 1–6 raw copper |
| Iron | 50–65 | 15–130 | Stone | 1–4 raw iron |
| Tin | 40–45 | 10–70 | Stone | 1–5 raw tin |
| Gold | 20–30 | 5–40 | Iron | 1–3 raw gold |
| Diamond | 15–20 | 2–30 | Bronze | 1–2 diamonds |
| Ruby | 43–47 | 30–70 | Bronze | 1–2 rubies |
| Topaz | 78–82 | 60–100 | Bronze | 1–2 topaz |
| Sapphire | 93–97 | 80–130 | Bronze | 1–2 sapphires |
| Emerald | 150–160 | 120–200 (mountains) | Bronze | 1–2 emeralds |

Pickaxe tiers go flint, stone, iron (gold is the same tier), bronze, then diamond. Every gem ore and
diamond need bronze or better; obsidian needs diamond. Mining an ore with too weak a pickaxe gives
nothing. Iron, copper, tin, gold, diamond and the gem ores glow faintly, so they are easier to spot
in the dark. **Prospector** adds one more of the ore to every ore block you break.

**Gems grow as clusters.** Diamond, ruby, topaz, sapphire and emerald are not buried in the rock: they
grow, rarely, as crystal clusters on cave floors, ceilings and walls in their depth range, on a bed of the rock they grow from (stone, granite, marble or limestone; their own ore stone on anything else) (emerald also on
open mountain rock). Break the block a cluster grows from and the cluster drops as an item, not as gems,
so you still need a bronze pickaxe. A cluster item can be placed on any face.

Marble, granite and limestone come as big patches in stone — granite below y 60, marble and
limestone in the middle depths — and any pickaxe takes them.

## Food and spoiling

Food goes off while you **carry** it. Every food has a shelf life, and the bar under its icon is how
much of it is left; the tooltip gives the time in minutes and seconds. At zero, one item of the stack
is lost — the feed says "spoiled" — and the clock starts again on the next one, so a stack rots one
at a time.

**Yellow berries are poisonous.** Yellow berry bushes grow among the red and blue ones, a little
rarer. Their berries fill you like the others, but eating one poisons you for 10 seconds: you lose
half a health point a second, and your health does not regenerate meanwhile, down to your last half heart but never past it. Running effects show as small slots right of the hotbar, with the seconds left.

- **Chests do not tick.** Anything in storage keeps, and comes back out with the time it went in.
- Stacking two lots of the same food takes the **shorter** clock, so fresh meat never refreshes old.
- Cooking resets the clock, and cooked food keeps far longer than raw.
- **Preserver** slows spoiling by 10%.

| Keeps longest | | Goes off soonest | |
|---|---|---|---|
| Steak | 8 h | Milk bucket | 5 min |
| Cooked pork | 6 h 13 min | Berries | 10 min |
| Bread / cooked mutton | 4 h | Melon slice | 20 min |
| Rotten flesh / pumpkin pie | 2 h | Apple / mutton | 30 min |
| Mushroom stew / raw pie | 1 h | Raw beef / raw pork | 33–43 min |

The golden apple never spoils.

## Animals and mobs

- **Sheep** drop raw mutton, and wool and string while woolly. Wool makes beds, string makes bows.
- **Cows** drop raw beef and leather. Leather makes the first armor set and the backpack. Use an
  empty bucket on a female cow for milk; each cow refills after 10 minutes.
- **Pigs** live in plains, forest, birch forest and swamp, in groups of up to three. They drop 1–3
  raw pork and 0–2 fat; fat burns in a furnace. Their coats vary — pink, spotted, hampshire, duroc,
  berkshire and tamworth.
- **Horses** can be tamed, then ridden with a saddle.
- **Zombies** drop rotten flesh, which a furnace turns into leather, and pick up what they find.
- **Skeletons** drop bones and arrows.
- **Villagers** go about their business, and **monsters hunt them as well as you**. A villager
  stands and fights any monster that comes near it, and they are evenly matched one-on-one.
  Anything killed by another creature leaves **nothing at all** — no loot, no XP — so leading a
  zombie into a village is not a way to farm either side.
- **Butcher** adds one of each drop to any animal you kill yourself.

## Block shapes

Craft a **hammer** and wear it in the Others slot of the equipment panel, then hold `Q` (or B on a
gamepad) to open a wheel of block shapes. The shape you pick shows right of the hotbar, and blocks
that take it show as that shape in your inventory and in your hand. Each placement uses the block
and 1 point of the hammer's durability; breaking it gives the block back. In creative the wheel
works without a hammer.

The wheel has two pages — turn them with the mouse wheel or a bumper:

- **Simple:** block, slab, vertical slab, stairs, pane, fence, carpet, wall. Slope and bars are
  named but still in development.
- **Advanced:** cover, with nine slots waiting.

| Shape | Blocks that take it |
|---|---|
| Slab, vertical slab, stairs | Stone, cobblestone, all planks, bricks, stone brick, glass, both sandstones |
| Pane (a thin plate through the middle) | Wool, glass, all planks, stone, cobblestone, bricks |
| Fence (a post that joins its neighbours, too tall to jump) | All planks, bricks, iron block, copper block |
| Carpet (a layer 1/8 thick) | Wool, all planks, stone, cobblestone, glass, iron and gold block — plus the stacking set below |
| Cover (a 1/8 plate you walk straight through) | Dirt, grass, stone, cobblestone, all planks, stone brick, bricks, granite, marble, limestone, both sandstones |
| Wall (solid, thin, a full block tall) | Cobblestone, stone brick, bricks, iron, copper and gold block, granite, marble, limestone, wool, both sandstones |

Two slabs of the same block in one space become the full block again. Snow, leaves, sand, red sand,
gravel and fiber block stack up to 8 carpet layers in one space, in any mix, and you walk through
them; snow cover and leaf litter in the world are these same layers. Breaking takes the top layer:
snow gives a snowball with a shovel, leaves drop what leaves drop, sand, gravel and fiber give
nothing, anything else gives its block back.

A cover placed over a hole becomes a lid flush with the ground; in a doorway (walls both sides) it
sits flush with the wall on your side; anywhere else it lies against the face you clicked. Mobs
fall through it too.

The **chisel** can be crafted again at the bench: worn in the Neck slot it unlocks block variants, and in
the Others slot it picks shapes like the hammer. One already in a save
still works.

**Variants.** With a hammer worn in the Neck slot, five slots above the health bar show the other
looks of the block in your hand, drawn in the picked shape, the plain block in the middle. Hold `R`
and scroll, or hold D-pad Right and press LB / RB, to step through them. The
pick changes every one of that block you carry (no separate stacks), is not saved, and a variant
breaks back into the plain block. Stone: brick, mossy brick, cracked brick. Cobblestone: mossy.
Sulfur block, granite, marble, limestone: brick. Variants take the same shapes as stone brick.
Mortar and pestle: a granite, marble or limestone bowl. Gem clusters: a stone, granite, marble or limestone bed.

## Rare and special materials

- **Sulfur.** Found in caves as yellow sulfur blocks, often with small sulfur tips growing off them.
  Look 5–10 blocks below lava pools, where they come in clusters; single blocks also appear in cave
  walls between y 30 and 80, most often around y 48–50. You need a stone pickaxe. Breaking a tip
  gives 0–2 sulfur.
- **Gunpowder.** At the mortar: 1 charcoal, 2 sulfur, 1 flint and 1 ash make 2 gunpowder. 7 gunpowder
  and 10 sand make TNT.
- **Glow dust.** 1 stone, 1 flint and 1 coal. 4 glow dust make a glowstone block, a light source.
- **Glow vines and glow crystals.** Glowing vines hang down cave walls and light the tunnels; you can
  climb them (walk into the vine or hold jump to go up, sneak to hold still). Breaking one with any
  tool gives 1–2 glow crystals; by hand it just comes down. 5 glow crystals make a glowcrystal block
  at the crafting bench, the brightest light in the game.
- **Cobwebs.** Strung in cave corners, on floors, walls and ceilings. Walking into one slows you
  down by 80% (leather armor helps only half as much there). Cut one with a sword for 1–3 string.
- **Storage blocks.** At the crafting bench, 10 coal, charcoal, iron/gold/tin/copper ingots, diamonds,
  emeralds, rubies, sapphires or raw iron/gold/tin/copper press into one block, and a block breaks back
  into 10. Coal and charcoal blocks burn in a furnace as long as the ten they were made from.
- **Sandstone.** 5 sand make sandstone and 5 red sand make red sandstone at the crafting bench.
- **Fiber block.** 10 fiber pressed into a block (and back), breakable by hand. Loose fiber tufts grow
  beside fallen hollow logs, and very rarely a plains grass block turns out to be one.
- **Hollow logs.** Fallen hollow oak, birch and spruce logs lie in forests, often with mushrooms around
  them; cut one with a hatchet to take it. Placed standing up and filled with dirt or grass (right click
  it with the block), it works as a planter for saplings, flowers and grass; filled with sand, for a
  cactus. Breaking it gives back the log and what was inside. Laid down and filled with dirt or grass,
  it slowly grows mushrooms on top: brown on oak, red on birch, blue on spruce. A hollow log makes 3
  planks, like a log.
- **Falling blocks.** Sand, red sand, gravel and fiber blocks fall when nothing is under them and land
  as a loose pile of 8 layers you can walk through. Deserts have dunes of 1–7 layers, exposed gravel has
  loose gravel on top, and gravel rarely lies scattered on other ground.
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
  your metal. Steel powder exists for a future update.
- **Clay.** Found on the bottom of lakes and seas. A clay block breaks into 4 clay balls, which smelt
  into bricks.
- **Glass shards.** Breaking glass gives 2–4 shards; 4 shards craft back into a glass block.

## Handy recipes

| Item | Ingredients | Where |
|---|---|---|
| Torch ×4 | 1 coal or charcoal, 1 stick, 1 fiber | Inventory |
| Crafting bench | 5 planks, 5 fiber | Inventory |
| Furnace | 12 cobblestone | Bench |
| Chest | 10 planks, 1 iron ingot, 10 fiber | Bench |
| Bed | 4 wool, 4 planks, 5 cloth, 10 fiber | Bench |
| Bow | 10 string, 5 sticks, 12 fiber | Bench |
| Arrows ×2 | 1 flint, 2 sticks, 6 fiber | Inventory |
| Backpack | 14 leather, 10 cloth, 8 fiber, 6 copper nuggets | Bench |
| Hammer | 1 iron block, 8 copper nuggets, 4 sticks, 2 fiber blocks, 10 string | Bench |

**Cloth** is spun from 20 fiber at the bench and goes into beds, backpacks and metal tools. A
**backpack** adds two more rows of carrying space, a **belt** five quick slots.

Sleeping in a bed skips the night and sets your respawn point. Hold `Shift` in the crafting list to
craft as many as you can afford in one click.
