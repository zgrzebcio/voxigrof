# voxiGrof

A voxel survival sandbox that runs in the browser: plain JavaScript and three.js, no build step.
Current build: **alpha 0.8242**.

Create a profile, press **Play**, and create a world. Untick **structures** on
the create screen for a world without villages and dungeons.

A village (0.8242) has at least three houses of three kinds and a well for every four houses, the first in its
square. Every door opens onto a gravel path 2-3 wide that winds round the buildings to the square, crossing water
on a plank bridge where it must. Deserts have their own villages (0.82422): sandstone houses, mostly the big
ones, grass paths, and no loose sand drifted over the yards.

**Ice Spikes and polar bears (0.835).** New worlds have an Ice Spikes biome in the snow: a floor of snow and packed ice
with spikes of packed ice standing out of it, a few of them huge, and icebergs in the snow's seas. Packed ice is only
mined, and never melts. Polar bears live on the snow's shores, its sea ice and the Ice Spikes, 2-5 together: 250
health, and they hunt you within 16 blocks at three quarters of your sprint, 40 damage a bite; a hit only makes them
angrier. Get 30 blocks away and they give up and walk back. They drop leather and fat.
Since 0.8351 the snow's lakes and rivers (and a little past its edge) stay frozen, its sea is ice with open water in it,
and newer worlds have Snowy Hills and some big, high icebergs.
Worlds made since 0.8353 have oceans three times as big (and a third as many), and rivers that flow: each rises from a
spring inland as a brook, widens on its way downhill, passes through any lake it fills, and runs into the sea; one with no
way out ends in a lake.
The world is 250 blocks tall since 0.8354 (200 before): you can build up to y 249, and new worlds have higher land and
mountains reaching toward y 240.
Shores (0.8356, new worlds): about half the coast is a sand beach of ragged width, most of the rest turf right down to the
water, some gravel, and here and there a rocky coast standing up out of the sea; a snowy beach lies under a layer of snow.
Sugar cane grows by the water on sand of any colour, grass, dirt and gravel (and can be planted on them), a fifth more often.
New worlds since 0.83547 have small and medium hills, steep crags and cliffs with bare stone on their faces, more rocky
coasts, sea beaches up to 10 wide with their sand or gravel running on under the shallow water, and no tiny puddles.
New worlds since 0.83548: rivers and lakes lie at their own height (lakes in the hills and mountains, rivers stepping down
to the sea with small falls), uneven lake and river beds, smoother hills in some places and long ones in others, and
underground rooms, tunnels, cave mouths on hill sides, stone arches and overhanging cliffs.
New worlds since 0.835481: every river runs out of a lake and down into another lake or the sea in gentle 1-block steps,
lakes come bigger and longer, shores and banks are gentler and the sea gets deeper sooner off the shore. Water steps no
longer show gaps, and deep rivers and lakes are less dark (all worlds).
0.83549: river water visibly flows downstream and falls flow down (all worlds). New worlds also have broad flat-topped
mountains, valleys through the mountains with lakes and rivers in them, real waterfalls where a river drops, and new
spruce forms (giants, small ones, and ones with a heavy crown).
0.835491: water darkens smoothly with depth, waterfalls stay light and roll over their edge, steep rivers and falls flow
faster, and rivers and lakes take a stronger warm or cold colour (all worlds). Polar bears are very rare; gourds and wild
wheat a fifth commoner. New worlds: waters at different heights are kept apart by ridges (no more walls of water), gentler
lake shores, half the plains (with twice the trees), a few oaks high on the mountains, and 'Hills' biomes (Plains Hills,
Forest Hills...) where hills rise; Mountains start at 150.
0.835492: ripples run downhill on rivers, and the water surface no longer shows bright greenish lines.
0.836: new biome Coldest Deep Snow, the frozen heart of the Deep Snow (new worlds). It is -60°C there, which kills fast
without warm gear, fire or shelter. Frozen rime trees grow there (rime log, rime planks, rime leaves; no sapling yet),
wind-combed snow drifts lie between them, and ice shapes stand everywhere: giant ribcages, arches, rings, fins, twisted
spires, frozen waves, tusks, ice trees, crystals and penitentes. The air sparkles with ice. Deep Snow is now about -22°C.
0.837: blizzards are brutal: you see about 3 blocks, the snow swirls thick around you and it is 25°C colder. Rain drops
run down your view, water streams off it when you come up, snow sticks and slowly melts, close lightning flashes it and
fire licks up from its bottom. Mushrooms 30% more: brown and black under any tree, red under birch, blue under spruce,
yellow under oak, white in clearings beside trees. Animals 30% more (not polar bears). New worlds can switch off day and
night, weather, clouds, animals and monsters. The world list shows the version a world was made in. The Coldest Deep
Snow is now two biomes: the Coldest Deep Snow Forest (rime trees and ice shapes, half as many as before) and the open,
gently rolling Coldest Deep Snow. Distant ice and glass no longer draw faces along chunk edges.
0.8371: creative has a building wand (a purple stick). Right-click a block's face and every same block joined to it
across that face gets one more layer laid on it, with the same look, shape and turn: a wall grows thicker or taller in
one click, a floor rises a layer. Up to 256 blocks at once.
0.8373: torches and glow blocks placed in creative never burn out. How fast lights burn out follows the world's random
tick: 5 (the default) as before, 10 twice as fast, 0 never (rain does not put torches out either). A random tick of 0
can now really be set.
0.8374: a breaking wand (a red stick) in creative: right-click takes away the clicked block and every same block joined
to it across that face. Both wands now outline what they will build or break, as one shape seen through other blocks,
and blocks touching corner to corner count as joined too (a gap still parts them).
0.8378: the world runs at the same speed at any frame rate: the day clock, furnaces, growth, saplings, grass, leaf
decay and the rest step 20 times a real second. Below 20 fps the game no longer runs in slow motion (only below 10 for
movement and creatures). A minimized game still waits for you.
0.8379: hunger, thirst, stamina, energy, oxygen, body temperature, effects, held torches and food spoiling now also run
20 times a real second, the same at any frame rate. In split screen each player's food now spoils at the right speed.
0.838: creatures move at the same speed at any frame rate too, drawn smoothly between steps.
0.8381-0.8383: less stutter while exploring: the worker threads now find a new chunk's lights, light its sky, and find
what the seasons change in it, so the game itself does far less of that work.
0.8384: autosaving no longer makes the game hitch (a worker writes the save). Dropped items, thrown snowballs and arrows
move at the same speed at any frame rate, drawn smoothly.
0.8385: dropped items stack. Items of the same kind lying close together join into one drop (a big stack shows a few
copies), and a broken chest, a death or a felled tree drops one stack per slot instead of a cloud of single items.
Walking over a stack picks up as much as fits. Fewer drops on the ground means smoother frames.
0.83851: F3 also shows where each frame's time goes (the costliest parts in ms, and the worst frame). Block reads are
faster (the game remembers the chunks it just looked in).
0.83852: new Options > Video "Render scale" (100/85/75/50%): fewer pixels drawn, much faster on a weak graphics card or
a hi-DPI / 4K screen. Calm creatures far from you think less often, creatures out of view are not animated, chunks
reuse their memory when you build or dig, and dropped items cost less to draw.
0.839: the first boss, the Frozen King (2000 health, a 200-point shield). He floats, throws cold fireballs that set
you alight, raises his shield (it turns arrows and takes your blows from the front), drops ice spikes from above,
flies round you leaving burning snow, and below half health sends homing beams. Close to him you cannot mine. Beating
him gives Boss boost (+20% XP, kept for good, one level per kind of boss, up to 5) and finishes the last quest (2000
XP). He has no castle yet: F8 (with F3 open) summons him for testing.
0.8391: burning in the Frozen King's cold fire, the flames on your view are blue (0.83911: and the flames on your body).
0.8394: the snow castle's chests hold the best loot in the game: plenty of mushroom stew, raw meat and fish, bronze,
iron and gold, nuggets of every metal, glow crystal, rime planks, cloth and leather; now and then a leather armour piece
(it keeps the cold out), a golden apple, a saddle or a backpack, and in about one chest in nine a single gem. Opening
one pays three times the XP.
0.8393: the Frozen King's snow castle stands in the open Coldest Deep Snow (not its Forest), very rare: never two within
4000 blocks, in worlds made since 0.837. He waits in its hall; killed, he never returns. The last quest's crown marker
points to the nearest castle, even one you have never been near. Its lights never burn out.
0.8392: a rime wood chest: pick "rime" for the chest on the variant bar (R).
0.83914: a running crafting queue shows as the Crafting effect (slower walk, lower jump, no sprinting, the time left);
milk does not lift it and it ends with the last craft. The Frozen curse and Ice daze say what they do in Effects.
0.8387: fixed: since 0.8382 a world froze right after it loaded (no moving, no clicking): the mushroom pass of the
seasons stopped every frame. Also fixed: leaves that fell in autumn could not grow back in spring. And: a browser
whose storage had filled up could not create or start a world; the copies saved when the page closes now move into the
bigger world database at start, and a full storage no longer stops a world from starting.
0.8386: new Options > Video "Leaves": fast draws leaf blocks solid (much faster in forests). Far land is drawn in big
pieces once it settles (fewer draw calls). Torch and glowstone light is worked out on its own thread, and new chunks
cost the game less: the worker threads now share the world's memory (the first visit reloads the page once to turn
this on; it works on GitHub Pages).
0.8375: the wand outline is thicker and pulses. The building wand only grows the layer across open space from the block
you click (never past a filled spot, nothing if the clicked block is covered), and each wand acts once per click.

**Igloos (0.833)** stand now and then in the snow (not the cold plains): a snow-brick dome with a furnace, a crafting
bench, a hay bale, a crystal torch and a chest of cold-country things (ice, snowballs, fish, berries, bread, paper, clay, copper nuggets...).
**Loot chests** always hold at least 3 different things, and pay twice their XP (a desert village's three times, an igloo's
four) since 0.833.

**Torches burn out (0.834).** A fire torch (coal, stick, fiber and 2 flint make 4) lights 15 and burns 5-10 minutes,
placed or held; rain puts one under the open sky out. A crystal torch (1 glow crystal, 2 fiber, 1 stick make 5) gives a
cold blue light of 12, melts nothing, works under water and burns 15-30 minutes. A spent torch is an unlit torch:
right-click a placed one with flint to light it (1 strike in 4 fails, the flint wears away half the time) or with a glow
crystal to make a crystal torch (the crystal is used up 1 time in 4). Broken, a lit fire torch comes back unlit, a
crystal torch half the time crystal, half unlit, and an unlit one gives a stick 1 time in 4. Glow dust blocks (the old
glowstone) and glowcrystal blocks go dark and grey after 30-60 minutes: a lit one breaks into half its makings, a spent
one into nothing. Glowcrystal blocks and glow vines light blue too.

- [Controls](#controls)
- [Your first steps](#your-first-steps)
- [Levels and skills](#levels-and-skills)
- [Crafting](#crafting)
- [Smelting](#smelting)
- [Ores](#ores)
- [Food and spoiling](#food-and-spoiling)
- [Animals and mobs](#animals-and-mobs)
- [Block shapes](#block-shapes)
- [Block variants](#block-variants)
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
| Pick up grass, bushes, flint and stone pebbles | Hold `E` | Hold Y |
| Work a bench or mortar | Hold `E` (tap to take) | Hold Y (tap to take) |
| Inventory | `Tab` | B (tap) |
| Skill tree | `K` | Back / Share (tap), or its tab on the right-hand panel |
| Hotbar | `1`–`8` or mouse wheel | LB / RB |
| Drop one / drop stack | `Y` / `Shift+Y` | D-pad Down / X + D-pad Down |
| Shape wheel (hammer worn) | Hold `Q`, aim with the mouse, let go | Hold B, aim with the right stick, let go |
| Pick a variant (chisel in Neck) | Hold `R` + mouse wheel; tap `R` twice for the plain block | Hold D-pad Right + LB / RB; tap D-pad Right twice for the plain block |
| Turn the shape wheel's page | Mouse wheel | LB / RB |
| Pause menu | `Esc` | Start |
| Fullscreen | `F1` | — |
| Camera view | `F2` | D-pad Left |
| Debug text | `F3` | D-pad Up |
| Hide the whole HUD | `Backspace` | Hold Back / Share (1 s) |
| Climb a wall (up to 3 blocks, costs stamina) | Hold `Space` + `W` facing it | Hold A + stick forward |

In the inventory: `Shift+click` quick-moves a stack, `Shift+right click` wears gear, middle click (R3 on a pad)
sorts (in creative it puts the palette back as new and empties the hotbar), and clicking outside the panels throws what you are carrying. On a pad the sticks move a
cursor: A picks up and puts down, Y quick-moves, D-pad Down drops, and LB/RB flip the recipe tabs.

## Your first steps

Bare hands only break plants, leaves and furniture. Everything solid needs a tool, so the start
of the game is about making your first flint tools. The exceptions (0.8244): sand, gravel and snow come away by
hand a layer at a time, and glass and glassy sand whole, all at half the speed of a flint tool. A shovel takes a
whole block, or a whole drift of layers, at once. Feet sink 30% into a full block of sand, gravel or snow, and a
snow block falls like sand. Snow outside snow biomes melts slowly, a layer at a time, when the air there is over
5°C; above the snowline the air is 0°C or colder.

1. **Fiber.** Hold `E` on short grass, tall grass, wheat and berry bushes. Foraging needs both hands, so your offhand must be empty. Each pick has a chance to
   give fiber (grass 15%, wheat 5% a growth stage, a berry bush 7% plus 7% a growth stage). Fiber goes into every early
   recipe, so gather plenty.
2. **Sticks.** Break leaves. Leaves drop sticks (a 21% chance of one, rarely up to four), a sapling
   5% of the time and an apple 1%. Torn off by bare hand, every chance is halved.
3. **Flint.** Small flint pebbles lie on the ground; hold `E` on one to pick it up. Gravel also
   drops flint 5% of the time.
4. **Flint hatchet.** Open the inventory (`Tab`) and craft a flint hatchet (4 flint, 3 sticks, 10 fiber).
5. **Wood.** With the hatchet, chop logs. A log makes 3 planks, a plank makes 3 sticks.
6. **Crafting bench.** 5 planks and 5 fiber. Right click it to open the full recipe list: stone and
   metal tools, armor, the furnace, chests, beds and more.
7. **Stone.** A flint pickaxe breaks natural rock (stone, granite, marble, limestone, dolomite) but keeps
   only a stone pebble (a second one 25% of the time); a stone pickaxe or better keeps the block. Crafted blocks (cobblestone, sandstone, terracotta, furnace) it keeps. Pick up **stone pebbles** from the ground
   (hold `E`) instead; 5 make a cobblestone at the bench. 5 cobblestone make a stone pickaxe.
8. **Furnace.** 12 cobblestone, crafted at the bench. Put fuel in the bottom slot and something to smelt
   in the top one.

**Starter quests** in the top-right corner walk you through these steps one at a time, from your first
fiber to one of every gem. Each shows what to get and how, and pays XP when it is done.

Health stops regenerating for 5 seconds after any hit (2 with Rapid regen) and while you are poisoned.
Milk goes off in 10 minutes and leaves the bucket, meat leaves rotten flesh, and a pumpkin is food that
keeps 4 hours and can no longer be planted.

A crafting bench or mortar needs its top clear: with a block or plant standing on it, it will not open,
and an order on it cannot be worked or taken. A furnace's top is its chimney: covered, it stops smelting
but the lit fuel keeps burning away. A column of up to 6 walls of any rock (stone, cobblestone, granite, marble,
limestone, dolomite, any look) on a furnace makes its chimney taller: the cap and the smoke move to its top, and
that top must be clear. A bench's or mortar's floating order shows through walls within 8 blocks, and hides farther
off. A craft you are part way through is kept when you let go,
walk away or leave the world.

**Fish.** Cod, salmon, pike and catfish swim in water at least two blocks deep, from the small cod
(4 health) to the big catfish (8), which keeps to the bottom. Each has a level and its own size, flees
when hit, flops and suffocates on land, and drops one raw fish of its kind. Cook them in the furnace.

**Wall climbing.** In survival you can climb a bare wall up to 3 blocks, enough to get out of a pit. It
uses a lot of stamina and both hands, so you can't mine or place while climbing. Ladders show the same
climbing arms but cost nothing extra. Sprint only works forward and never while sneaking.

**Sound.** The Audio tab has master, music and sound-effects volume sliders. Music starts at 50%.

**Drops are chances (0.806).** Every drop is a sure part plus extra chances: iron and gold give 1, and
another 60% of the time; copper and tin 1, then 70% and 40%; a gem ore 1, then 40%; a ripe berry bush 1, then
75% and 35%; meat 1, then 40% and 5%; a fish always exactly 1; rotten flesh and bones 1, and 2 more a third of
the time. Leather, fat and a sheep's string may not come at all.

**Particles.** Blocks burst into bits when broken and chip while you mine, furnaces smoke, lava pops
embers, falling into water splashes, hearts show hits (red) and healing (green), and soft ground (sand,
snow, dirt, gravel, clay) keeps your footprints for a few seconds. The menu's **particles** setting
(all / fewer / off) turns them down on slow devices. Also: waterfall foam, pool bubbles and dripping
after a swim, embers from a furnace that is firing something, fireflies at night, butterflies by
flowers, leaves falling from trees, arrow trails, shield sparks, TNT fuse sparks and blast smoke, puffs
for a finished craft, an opened chest, and mobs appearing or leaving, and bubbles for running effects
(green bad, blue good).

Dropped items stay where they fall, even when you walk away and the area unloads. Their time only runs
while you are near: everything you carried lies 20 minutes after you die, what you throw down 10,
anything else 5.

**Vitals (0.82).** Every bar is out of 100 (stamina and oxygen 200 since 0.831), five icons each: health and armor left of the hotbar, food and
thirst right, the temperature dial in the middle with stamina and oxygen over it (those two only while not
full, or stamina while it is being used). With the inventory open you also see energy, vegetables, fruit and protein, and
hovering a bar shows its numbers and everything changing it right now (skills, effects, temperature, heatstroke). Food, thirst, stamina, energy, fruit, vegetables and protein can go past full into an
**over-stat** (up to 50, the white outline) that is used up first; you start (and respawn) with every one
full. From full, food lasts 40 minutes, thirst 20, energy 75 (almost four days without
sleep) and fruit, vegetables and protein 70 (35 until 0.8323). Health heals while food is above 30 and thirst above 20; the food and thirst it costs follow how fast it heals (0.8323).
Eating takes 20% longer than it used to.
- **Stamina** pays for sprinting, jumping, wall climbing and swimming (swimming up a lot, along a little, treading water a trickle; no rest off the bottom). Since 0.831 everything that uses it uses a quarter more, and mining takes a little (about 1 point every 3 s). It comes back 3 s after you last used it (5 s once exhausted; 20% faster
  sneaking), faster the longer you rest (after 2 s, up to +50% over the next 6 s, 0.8321) and the emptier it is, using food and thirst (more thirst since 0.829). Oxygen lasts 24 s under water and comes back faster the longer you breathe (after 2 s, up to double over the next 4 s) and by your regen. Empty, you are **Exhausted** until it is back to 20: no sprint, jump or climb,
  20% slower (40% in a full sandstorm), and after 10 s of it you lose 0.3 health a second.
- **Thirst** drops over time and hurts at 0. Look at water with an empty hand and hold `E` to drink to
  full; berries, melons, apples, cantaloupe, milk and stew help too.
- **Energy** drops over time, faster when you use stamina or get hurt (all of it slower since 0.831). A night in bed fills it, and costs a little food (10), thirst (15), fruit, vegetables and protein (4 each), never taking one under 10 (0.8321). At 20 or less you are **Tired** (0.832), the more so the emptier it gets: down to 0 your regen falls by up to 70% (never under 0), every bar drains up to 40% faster and you move up to 25% slower.
- **Fruit, vegetables, protein** drop over time and come from food. At 20 or less protein or fruit makes you **sick** (0.8323), more so the emptier: regen up to 20% less, every bar drains up to 10% faster, you move up to 5% slower, and at 0 you lose a health every 5 s. Protein sickness also takes up to 30% attack speed and 10 strength; fruit sickness drains thirst up to 30% faster and slows crafting up to 30%. (Vegetable sickness is planned: sight and mining speed.)
- **Wet (0.8323).** Rain, falling snow or water first soaks you from 0 to 100% (water in 5 s, rain slower, snow slower still); only then does staying in it keep you wet longer, 5 s up to 5 min (0.8324). Out of it that time runs down, then the % dries off, faster near a torch, a fire, lava, a lit furnace, in a desert or with a warm body. By how soaked you are: jump up to 5% lower, good effects up to 20% shorter, cold resistance up to 50% less.
- **Stats** (the Equipment tab) list everything that changes you, each with a tooltip. Since 0.832 also **regen** (how
  fast health heals and breath comes back and how much energy and healing food gives), **spoil speed** (Preserver, salt) and **effect
  duration** (Lingering: 125%, good effects only), with **visibility reduction** (Clear Eyes) since 0.8291 and a free line kept for a stat to come.
- **Temperature** follows the season, the hour, the biome, height, weather, water and fire nearby. Under
  10°C you are **Chilly** and under -5°C **Cold** (food and protein drain faster); over 30°C **Warm** and over
  45°C **Hot** (thirst and fruit do). Cold and Hot also drain health slowly, faster the further past the line
  (0.3 a second at it, up to 1.5). Cold and heat resistance from gear take their share off all of it (leather
  +8% cold each piece, cloth +8% heat and -3% cold). All show in the effects, as do **Sneaking** and **Climbing**.
  Sneak needs a fresh press after opening or closing the inventory, but if you are crouched as it opens you stay
  Your temperature follows a big change faster than a small one, and resistance slows the turn toward cold or
  heat. Fire torches and glow dust blocks warm you a little, placed or held; the glowcrystal block, glow vines and the
  crystal torch cool you a little.
  Desert nights are cold: near 0°C in spring, -10°C in winter. Caves are cold, about 4°C near the surface, a little warmer the deeper you go (up to 14°C). A held torch goes out under water and is put
  away until you surface. The bars fill sideways.
- **Heatstroke (0.825)** builds while your body is over 35°C in a sunny or clear day's sun under open sky: 0 to
  100% in 4 minutes in a desert at midday, slower when cooler, half as fast outside deserts. It goes down in shade or
  at night, faster under a roof, fastest in water. From 20% thirst and fruit drain faster, 30% food, vegetables and
  protein too, 40% your sight blurs, 50% energy drains fast and stamina barely comes back, 70% you lose health,
  90% you see mirages, and at 100% you die. A hat (cloth bandana or leather cap) slows it 25% and lets you get 5°C
  hotter first; the full cloth set slows it 40% more.

**Water and lava (0.8245)** do not flow for now: a bucket places one still block, and digging beside water
opens nothing.

**Creatures (0.823)** are on the same 100 scale: their health, hunger and every damage number (weapons and
mobs alike) are 5 times what they were. They also get thirsty now, though nothing drinks yet.

Starving, thirst and drowning hurt, and drowning hurts more with every hit.
Zombies and skeletons come out at night and burn up at sunrise. Food you carry also goes off in
time — see [Food and spoiling](#food-and-spoiling).

## Levels and skills

Breaking naturally-generated blocks, smelting, crafting and killing pay experience. The rarer sources say so in a green feed row
(+44 XP iron ore, +62 XP taming, +6 XP loot chest...); everyday digging, foraging, crafting and smelting do not. Breaking a
block you placed yourself pays nothing, so a stack of dirt is not an XP loop. Foraging pays 1, plus 1 for every
berry, wheat, melon slice, flint or pebble it gives; a pumpkin 4, carving one 4 and lighting it 1; a mushroom 1 more
for every 0.2x of its size and 2 more fully grown. Built blocks (cobblestone, planks, sandstone, adobe, terracotta, hay)
pay nothing, so a village is no XP mine; sulfur tips 4, glow vines 5, cobwebs 3, salt (each layer), clay and hollow
logs 2. Every 30 s out in a storm, hail, a sandstorm or with your body Cold or Hot pays 1. Taming pays 60 plus 2 a
level (0.831), shearing and milking 5, a repair 2 per tier of the tool (2-10), a sapling you planted growing 3 (oak),
4 (birch) or 5 (spruce). Found once: each biome the first time you stand in it, more for every one found before it (10 for the first up to 1000 for the last of 27, 0.833), the top (y 199) and bottom (y 2)
of the world 20 each. A night lived through with more than half of it outside pays 5, a blood moon 30. Glassy sand pays 5,
quests 2.25 times what they paid before 0.8281, and since 0.831 ores twice as much (diamond and every gem ore 150 since 0.832), smelting 1.5x (what paid 1 still pays 1) and every craft worth more than 1 XP 1.25x. Nothing is lost on
death: your level is a record of what you have done.

A kill (0.831) pays 20 to 50 by how much health the creature has at most (a cod 20, a villager 38, a horse up
to 50) **plus its level** (every creature rolls a level of 1–50); a monster (zombie, skeleton) a flat 60 plus its level
(0.832). A level-1 cod is 21, a level-50 zombie 110.

Each level costs three times the last — 30, 90, 270, 810 — up to level 50, so a level is meant to be an
achievement rather than something that ticks over.

**Every level is one skill point.** Spending points does not spend levels. Open the tree with `K`,
or with the **Skill tree** tab on top of the right-hand panel, which shows how many points are free. With a furnace, chest or structure block open, the same tabs switch that panel to **Equipment** and back.
Pick a category tab, then **hold** a skill for half a second (mouse button, or A on a gamepad) to
learn it. A bar fills across it while you hold, and there is no way to unlearn one.

| Survival | Cost | Needs | Effect |
|---|---|---|---|
| Thick Skin | 1 | — | +10 health and +10% damage reduction |
| Grass Weaver | 1 | — | 30% better chance of fiber from grass, wheat and bushes |
| Slow Burner | 1 | Thick Skin | Every bar drains 5% slower: food, thirst, stamina, oxygen, energy, fruit, vegetables, protein (the stats depletion) |
| Climber | 1 | Slow Burner | Climb a bare wall one block higher, for 30% less stamina |
| Canopy Forager | 1 | Grass Weaver | 30% better chance of sticks, saplings and apples from leaves |
| Timber Shaker | 2 | Canopy Forager | Every swing that cuts a log shakes the tree: each leaf on it has a 2% chance to fall and drop its loot |

| Crafting | Cost | Needs | Effect |
|---|---|---|---|
| Nimble Fingers | 1 | — | +10% crafting speed |
| Walk and Work | 1 | Nimble Fingers | Crafting slows your walk 25% less |
| Fine Work | 1 | Nimble Fingers | Tools and gear you craft from now on are Well made: 10% chance a use costs no durability |
| Spare Parts | 1 | Nimble Fingers | 5% chance an ammo craft gives 1 extra |
| Mender | 2 | Fine Work + Walk and Work | Worn-out gear breaks instead of vanishing. Carry worn gear onto the **Repair** zone under the crafting panel: half its recipe when broken, less the less worn it is |
| Dismantle | 2 | Mender | Carry a tool, weapon or armor onto the **Dismantle** zone under the equipment panel: you get half its recipe back, less the more worn it is |

| Exploring | Cost | Needs | Effect |
|---|---|---|---|
| Treasure Nose | 1 | — | 25% chance a loot chest holds one extra item |
| Prospector | 1 | — | 20% chance of one more ore from every ore block you mine |
| Weathered | 2 | — | +10% cold and heat resistance |
| Pack Rat | 1 | Treasure Nose | Block stacks hold 10 more |
| Hazard Hide | 1 | Prospector + Treasure Nose + Weathered | 30% less damage from falls, lava and cactus |
| Clear Eyes | 1 | Hazard Hide | Fog, sandstorms, murky water, heatstroke blur, nausea sway and the shake of a hit cloud or move your view 30% less |

| Husbandry | Cost | Needs | Effect |
|---|---|---|---|
| Butcher | 1 | — | 20% chance of one more meat (or leather) from animals you kill |
| Preserver | 1 | — | Food you carry spoils 10% slower |
| Lingering | 1 | Preserver | Good food and potion effects last 25% longer |
| Gentle Hand | 2 | Butcher | Taming is 10% faster |
| Saddler | 2 | Gentle Hand | The saddle recipe costs 20% less |
| Lucky Hands | 1 | — | 20% chance of one more flint, stone pebble or berry when you forage |

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

The smelting book above the furnace (always open since 0.832) lists every smelt with its time, fuel and XP. Furnaces smelt on the world's clock: a night slept through, they keep burning and smelting through it (0.8321).

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
| Any mushroom but lava | Grilled mushroom (food) | 4 s |
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
| Coal | 60–90 | 35–180 | Stone | 1–3 coal and 2–5 coal chunks |
| Copper | 70–80 | 20–85 | Stone | 1–3 raw copper |
| Iron | 50–65 | 15–130 | Stone | 1–2 raw iron |
| Tin | 40–45 | 10–70 | Stone | 1–3 raw tin |
| Gold | 20–30 | 5–40 | Iron | 1–2 raw gold |
| Diamond | 15–20 | 2–30 | Bronze | 1–2 diamonds |
| Ruby | 43–47 | 30–70 | Bronze | 1–2 rubies |
| Topaz | 78–82 | 60–100 | Bronze | 1–2 topaz |
| Sapphire | 93–97 | 80–130 | Bronze | 1–2 sapphires |
| Emerald | 150–160 | 120–200 (mountains) | Bronze | 1–2 emeralds |

Pickaxe tiers go flint, stone, iron (gold is the same tier), bronze, then diamond. Every gem ore and
diamond need bronze or better; obsidian needs diamond. Mining an ore with too weak a pickaxe gives
nothing. Iron, copper, tin, gold, diamond and the gem ores glow faintly, so they are easier to spot
in the dark. **Prospector** gives a 20% chance of one more of the ore from every ore block you break.

**Gems grow as clusters.** Diamond, ruby, topaz, sapphire and emerald are not buried in the rock: they
grow, rarely, as crystal clusters on cave floors, ceilings and walls in their depth range, on a bed of the rock they grow from (stone, granite, marble or limestone; their own ore stone on anything else) (emerald also on
open mountain rock). Break the block a cluster grows from and the cluster drops as an item, not as gems,
so you still need a bronze pickaxe. A cluster item can be placed on any face.

Marble, granite, limestone and dolomite come as big patches in stone — granite below y 60, marble and
limestone in the middle depths, dolomite a little higher (y 40–130) — and a stone pickaxe or better takes them.

## Food and spoiling

Food goes off while you **carry** it. Every food has a shelf life, and the bar under its icon is how
much of it is left; the tooltip gives the time in minutes and seconds. At zero, one item of the stack
is lost — the feed says "spoiled" — and the clock starts again on the next one, so a stack rots one
at a time.

**Berry bushes (0.827)** come in five kinds, each growing through six stages in its own look (sprout, small, bush,
bare, green fruit, ripe); a picked one drops back to bare and fruits again. Every berry fills you the same, plus:
- **Red:** heals 2. Grows in forests, most of all high on the mountains.
- **Blue:** 1.5x the thirst. Grows rarely, by forest lakes and shores.
- **Black (blackberries):** poisonous. Grows in dark, cold forests like the spruce.
- **Yellow:** 1.5x the food. Grows rarely in the darkest forests and on the dirt patches of cave floors; it glows a little with green fruit and
  more when ripe.
- **White:** takes 5 thirst but washes a second off every bad effect with a time (poison, nausea). Grows in birch woods.

With the chisel worn (or in creative) a berry bush or wheat can be laid at any growth stage from the variant bar: ripe is
the default, and the stages follow from the slot right of it.

If you die, a mark on your screen shows where: how far it is and how long your dropped things still lie there. It
waits at the edge of the view when the spot is behind you, and goes when you reach it.

**Blackberries are poisonous.** Their berries fill you like the others, but eating one poisons you for 5 seconds: you lose
2.5 health a second, and your health does not regenerate meanwhile, down to your last 5 but never past it. Running effects show as small slots right of the hotbar, with the seconds left.

- **Chests do not tick.** Anything in storage keeps, and comes back out with the time it went in.
- Stacking two lots of the same food takes the **shorter** clock, so fresh meat never refreshes old.
- Cooking resets the clock, and cooked food keeps far longer than raw.
- **Preserver** slows spoiling by 10%, salt in use by 25% (0.8321); both together 65% of the usual speed (the **spoil speed** stat). A food's "spoils in" clock counts down at that speed.

| Keeps longest | | Goes off soonest | |
|---|---|---|---|
| Steak | 8 h | Milk bucket | 5 min |
| Cooked pork | 6 h 13 min | Berries | 10 min |
| Bread / cooked mutton | 4 h | Melon slice | 20 min |
| Rotten flesh / pumpkin pie | 2 h | Apple / mutton | 30 min |
| Mushroom stew / raw pie | 1 h | Raw beef / raw pork | 33–43 min |

The golden apple never spoils. It gives 15 energy (0.832) and 20 s of **Rapid regen**: regen +50% (it doubled until 0.832).

## Animals and mobs

- **Sheep** like the cold: spruce forests and mountains, in flocks of 3–5. They drop raw mutton, and wool and
  string while woolly. Wool makes beds, string makes bows. A shorn sheep grows its wool back in 30 min, 5 min sooner for every patch of grass it eats (0.8324).
- **Looking at an animal** shows its size by its name (0.8324), and under it a cow's milk (ready, or the time left) or a sheep's wool (ready, or growing back with the time left).
- **Cows** graze flat plains and cold plains in herds of 2–4. They drop raw beef and leather. Leather makes the first armor set and the backpack. Use an
  empty bucket on a female cow for milk; each cow refills after 10 minutes.
- **Pigs** live by ponds and lakes in plains and forests, in groups of up to three. They drop 1–3
  raw pork and up to 2 fat; fat burns in a furnace. Their coats vary — pink, spotted, hampshire, duroc,
  berkshire and tamworth.
- **Horses** (mild plains and forests, 1–4 together) can be tamed, then ridden with a saddle.
- Herds of different animals start at least 40 blocks apart (0.8241), and animals and players are as dark as the
  ground around them at night.
- **Zombies** drop rotten flesh, which a furnace turns into leather, and pick up what they find. At the bench,
  5 rotten flesh press into compressed rotten flesh, which a bench works into leather in 20 s (5 XP).
- **Skeletons** drop bones and arrows.
- **Villagers** walk the plains and above all the beaches, alone or in pairs. They go about their business, and **monsters hunt them as well as you**. A villager
  stands and fights any monster that comes near it, and they are evenly matched one-on-one.
  Anything killed by another creature leaves **nothing at all** — no loot, no XP — so leading a
  zombie into a village is not a way to farm either side. A villager carrying a torch at night lights the ground
  round it (0.8242). In water every creature is darker, as the water is.
- **Butcher** gives a 20% chance of one more meat (a horse: leather) from any animal you kill yourself.

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
| Slab, vertical slab, stairs | Stone, cobblestone, all planks, terracotta, stone brick, glass, the sandstones, granite, marble, limestone, dolomite, obsidian, wool, sulfur block, hay bale, copper block, dirt, snow block; slabs only: glow dust block, glowcrystal block, the iron, gold, tin, coal, charcoal and gem blocks |
| Pane (a thin plate through the middle) | Wool, glass, all planks, stone, cobblestone, terracotta, granite, marble, limestone, dolomite (every look), the sandstones (every look), glow dust block, glowcrystal block, obsidian, sulfur block, the iron, gold, tin and copper blocks |
| Fence (a post that joins its neighbours, too tall to jump) | All planks, terracotta, copper block |
| Carpet (a layer 1/8 thick) | Wool, all planks, stone, cobblestone, hay bale — plus the stacking set below |
| Cover (a 1/8 plate you walk straight through) | Dirt, grass, stone, cobblestone, all planks, stone brick, granite, marble, limestone, dolomite, the sandstones (not adobe or terracotta) |
| Wall (solid, thin, a full block tall) | Stone, cobblestone, stone brick, terracotta, iron, copper, gold and tin block, granite, marble, limestone, wool, the sandstones, sulfur block, obsidian, snow block |

Glass shapes are see-through like the full block (0.8261), and since 0.8263 glass shows through other glass from every side. Every look of a block (brick, polished, mossy...) takes exactly the shapes its plain block takes (0.8263).

Two slabs of the same block in one space become the full block again; two slabs of different blocks share the space as a mixed slab, each in its own look (0.8263), and breaking one leaves the other. Glass and glow dust blocks mix too (0.8264): a glass half stays see-through, and a glowing half still lights the area. Snow, leaves, sand, red sand,
gravel and fiber block stack up to 8 carpet layers in one space, in any mix, and you walk through
them; snow cover and leaf litter in the world are these same layers. Breaking takes the top layer:
snow gives a snowball with a shovel, leaves drop what leaves drop, sand, gravel and fiber give
nothing, anything else gives its block back.

A cover placed over a hole becomes a lid flush with the ground; in a doorway (walls both sides) it
sits flush with the wall on your side; anywhere else it lies against the face you clicked. Mobs
fall through it too.

## Block variants

The **chisel** (bench: 5 iron ingots, 4 copper nuggets, 2 sticks, 1 fiber block, 5 string) is worn in the
Neck slot and unlocks block variants. Since 0.803 only the hammer cuts shapes and only the chisel picks variants.

With a chisel worn in the Neck slot, seven slots above the health bar show the other
looks of the block in your hand, drawn in the picked shape, the plain block in the middle (4th) slot. Hold `R`
and scroll, or hold D-pad Right and press LB / RB, to step through them. Tap `R` or D-pad Right twice to
go back to the plain block. The
pick changes every one of that block you carry (no separate stacks), is not saved, and a variant
breaks back into the plain block. Stone: brick, mossy brick, polished, band, pillar. Cobblestone: mossy.
Sulfur block: brick. Granite, marble, limestone, dolomite: brick, mossy brick, polished, band, pillar (a pillar lies along the face you place it on, like a log). Terracotta (the old bricks block): brick. Variants take the
same shapes as stone brick. Glass: dark, greenhouse, brick, dark brick. Adobe: brick.
Mortar and pestle: a granite, marble or limestone bowl. Gem clusters: a stone, granite, marble, limestone or dolomite bed.
Furnace: granite, marble, limestone or dolomite. Crafting bench: birch, acacia, cherry or dark wood.
Chest: birch or spruce (only two chests of the same wood join into a double chest).
Bed (0.8342): an oak, birch or spruce frame; a new look, half a block tall on four legs.

## Seasons and weather

**Biomes (0.823, new worlds).** Every land biome is half as big again, and there is more land and less deep
ocean. Forests have **deep** patches (deep forest, deep birch forest, deep spruce forest) with about twice the
trees, more big oaks and taller trees. The chilly band beside the snow grows a **spruce forest**, and cold plains
have the odd spruce. Plains and oceans are warm or cold by the climate, and the grass is paler and drier in warm
places and darker in cold ones (all worlds). Since 0.8231 the colours blend smoothly, and water is tinted too: deep
blue in the cold, a little cyan in the warm. Spruce forest trees (new worlds) stand on a bare stem 4-8 blocks high.

**Climate ladder (0.8232, new worlds).** Every land biome has a temperature level, and the land only steps one level
at a time, so a forest never borders a desert or the snow:
deep snow -3 · snow, snow forest -2 · cold plains, spruce forest -1 · plains, forest 0 · warm plains 1 · desert 2 ·
red sand 3. Deep snow is treeless and mostly solid snow. In a new world (0.833) every biome is twice as big again. The level also sets how warm the air feels: a snow biome is about -10°C all year (0.8323), deep snow colder, and falling snow or a blizzard colder still.

**What grows where (0.8233).** Pumpkins in the cold (cold plains, spruce forest), watermelons in the warm plains,
rare cantaloupes and wild wheat patches (4+, twice as many since 0.826, in any growth stage) on mild plains and meadows, sugar cane in stands on warm and hot shores (planted cane starts as a sprout; a stand with water by its foot grows a block taller at a time, up to 5),
berry bushes in forests only (25% more since 0.826, 20% more again in 0.8272). Picking wheat gives a fiber 5% per growth stage, 35% ripe; wheat grows through six stages to ripe. The odd oak grows among the spruces; salt crust is a bit commoner by the sea.

A month is 7 days and a new world starts on 1 April. Spring (March-May) makes plants grow 30% faster,
summer as normal, autumn 30% slower, and in winter (December-February) nothing grows. Through autumn oak and
birch leaves fall to the ground (spruce keeps its needles) and grass, flowers, berry bushes, wheat
and gourds wither; by winter the trees are bare. In spring the leaves grow back where they were, and each
plant that withered has a 50% chance to return (and a small chance to seed one beside it). Caves are not
touched. Wheat now grows through stages and gives wheat only when ripe. Days follow the seasons: about 04:35 to
19:25 with a high sun in June, 07:25 to 16:35 with a low one in December; night mobs and beds go by the real
sunset and sunrise. Above the snowline (about y 176 in summer, down to about y 134 in winter) open ground keeps
a cover of snow, except on about one mountain in ten, which stays bare. A world can be created with seasons off: it stays on 1 July for good (summer weather and
growth, long days).

The world is split into weather regions (16x16 chunks), each with its own weather lasting 6-24 hours, blending smoothly into its neighbours near the edges (the debug screen shows a neighbouring weather that is blending in, e.g. "sunny (storm 30%)"): clear,
sunny, cloudy, windy (a **sandstorm** in deserts: sand-coloured murk that closes in over 30-60 s to a few blocks of sight, flying sand, you walk up to 45% slower and lose stamina; a roof or a cave stops it, the cloth set takes 40% off), rainy (snowy in snow biomes, and 95% of the time everywhere but deserts in winter), darky, storm, foggy or **blizzard** (0.83: cold biomes, the colder the more often, most in winter; rare elsewhere and only in winter: driven snow, a white-out a few blocks deep, strong wind, bitter cold).
**Rain and snow (0.83)** fall where you see the sky: light to heavy rain (more, faster drops and a grey haze the harder it rains) leaves puddles on the ground and rings on water, and washes snow, ash and salt carpets away a layer at a time. Falling snow (a white haze) lays snow carpets on open ground, up to 3 layers (6 in a blizzard). Snow carpets now melt everywhere: in the cold very slowly, never while snow is still falling (snow blocks in the cold and the snowline's cover keep). Dry sandy shores by the sea slowly grow a salt crust.
**Ice (0.8321)** covers the open water of every snow biome all year, and in winter the surface of lakes and seas everywhere
but deserts freezes over through the first weeks (only the top block: there is water under it). In spring it thaws again,
by day only. Ice is see-through; breaking ice that froze from water (a flint pickaxe is enough) leaves water, and drops nothing. Ice a player or a structure put down breaks into nothing and leaves no water, and only ice that was water thaws (0.833). Ice takes slab, stairs, carpet and wall shapes, and with the chisel it lays as **ice bricks** or **snow-ice bricks**; snow lays as **snow bricks** or snow-ice bricks too (0.833). Heat melts it in
about 8 s: a torch within 1 block (placed, or held by you standing that close), a lit furnace within 3, fire 5, lava 9.
Clear, sunny and cloudy skies are the usual weather; the rest are rare and follow the season: spring brings rain, fog
and dark skies, summer is sunniest with the most storms, autumn has rain, dark skies, storms and the most hail,
and winter is cloudy with snow (0.8241). Clouds
float at y 175-182 as blocks you can fly through: few on clear and sunny days, most of the sky when cloudy, a
dark sheet in darky and storm weather. They drift with the wind (at a tenth of its speed) and shade the ground
a little; under dark clouds the sunlight is 75% weaker. Foggy weather closes the view to about 8 blocks. A lighter
fog (about 40 blocks) comes on a quarter of mornings from 3 to 6 o'clock (not in deserts), and after half of all
rains and storms for about 2.5 hours; one rain or storm in ten leaves a rainbow for about 2.5 hours, opposite the
sun. The sky fades from a pale horizon to a deeper blue overhead, glows round the sun and along the horizon at
sunrise and sunset, and turns grey under heavy cloud. At night there are twinkling stars, the Milky Way and the
odd shooting star. The moon goes through its phases once a month (new on the 1st, full on the 4th) and rises
later each day; moonlit nights are brighter than moonless ones. Looking towards the sun gives a small lens flare
unless a block or a cloud is in the way. Storms bring lightning: it strikes the highest thing around, and a hit does heavy damage and sets you (or a
creature) on fire until it burns out or you reach water; an animal that burns to death leaves cooked meat, and a
woolly sheep burns faster until its fleece is gone. Some storms also bring hail (most in autumn, none in winter), which hurts anyone out
in the open without a helmet. On clear nights over the big snow biomes the aurora shows in the northern sky.
Clouds are near black at night. Lightning can set trees, leaves and grass alight: fire lights up its surroundings,
spreads through a tree's crown and through logs, planks and leaves, eating its way on as each block burns away,
more than along the grass (and much less in the rain), burns logs to ash and grass
to dirt with a carpet of ash, and water puts it out. An ash carpet gives ashes half the time; an ash block stands like any block, while its carpets are walk-through, fall, and mix with other layers. Around a full or new
moon the sea's tides run wider (it drops at low water twice a day) and its waves are bigger, and a full moon brings
half as many monsters again; moonlit nights are a little lighter. Half the villagers carry a torch at night, and a torch swung at a creature sets it on fire for 1.5 seconds (lightning: 6, lava: 10, and lava sets you alight too). About every 15-21 days (never in the first 7) a blood moon rises on the first night that is clear, sunny, cloudy or darky: a red moon and a red night, and twice the monsters. The debug screen (F3) shows the date, moon phase and today's sunrise and sunset, the weather (with any mist or rainbow), what comes next and the wind. Wind
bends grass and leaves, and from 25 km/h the wind speeds you up walking with it and slows you against it (a gentle push: under 3% at 30 km/h, at most 7%); standing still, it pushes you along gently, but never off an edge while you sneak, and never in creative. Under 10 km/h is a light breeze, about 30 a windy day, over 60 very strong (storms). It blows 30% harder over the ocean and harder up high (+5 km/h at y 100, +9 at y 150) and does not reach you indoors or right behind a wall. The debug wind line shows where it is heading in the next hour: > rising, < falling, = steady.

## Rare and special materials

- **Mushrooms.** Red, brown, blue, black, white and yellow mushrooms grow on cave floors and in shade under
  leaves; black, white and yellow grow where brown does. Lava mushrooms grow on cave floors next to lava and
  glow a little. They cannot be planted in survival. **Autumn is mushroom time:** forests grow new ones (brown,
  black, white and yellow under oaks, red among birches, blue among spruces), most of all beside fallen hollow
  logs. A new mushroom comes up small and grows to its own size over about 15 minutes of daylight (not at
  night); under 40% grown it cannot be picked, and the pickup prompt shows its size now (e.g. 0.33x). Each Out in the open a grown mushroom lasts about 30
  minutes and then rots away, and winter clears them all; cave and lava mushrooms stay. A furnace grills any
  but the lava one into food. Mushroom stew takes a bowl and one brown, black, yellow and white mushroom.
- **Cantaloupe.** A gourd like the watermelon, found in patches on grassland. Gather it and it comes apart
  into cantaloupe slices you can eat.
- **Carved pumpkin and jack o'lantern (0.824).** Right-click a pumpkin with shears to carve a face in it, turned
  toward you; right-click it with a torch to light it. Both can be placed, and they never spoil. A plain pumpkin
  still cannot be placed in survival.
- **Glassy sand (0.824).** Lightning fuses any sand it strikes, plus a short root under it, into glassy sand of
  its own colour (red and pink since 0.8241), and since 0.826 the sand round the strike in a small patch. It gives 0–2 glass
+
+  and broken it still gives shards, not sand. A block's tooltip lists its variants, the default first.
- **Cloth armor (0.824).** Bandana, tunic, trousers, boots and gloves from cloth and fiber at the bench (boots and
  gloves also take 2 sticks and a leather). Light armor, but each piece is 8% heat resistance. The full set is 40%
  resistance to sandstorms and heatstroke (0.825).
- **Salt crust.** A thin white crust on beach sand at the water's edge. It piles and mixes in layers like sand and slows you 3% a layer. A shovel breaks it: 70% chance of salt, 10% of a second. Salt carried with food, or kept in a chest with food, makes that food spoil 25% slower (0.8321; it lasted 1.5x as long before 0.832; your own salt in use shows as the **Salted** effect with its time left), a salt is used the moment it has food to keep (salt put in beside food, or food beside salt) and keeps that inventory's food for 20 minutes, then the next goes in (none while there is no food). Food in chests spoils like carried food, and a chest out of range catches up when you come back (its salt spent first).
- **Adobe.** 1 clay block and 5 wheat make 4 adobe at the crafting bench.

- **Sulfur.** Found in caves as yellow sulfur blocks, often with small sulfur tips growing off them.
  Look 5–10 blocks below lava pools, where they come in clusters; single blocks also appear in cave
  walls between y 30 and 80, most often around y 48–50. You need a stone pickaxe. Breaking a tip
  gives 0–2 sulfur.
- **Gunpowder.** At the mortar: 1 charcoal, 2 sulfur, 1 flint and 1 ash make 2 gunpowder. 7 gunpowder
  and 10 sand make TNT.
- **Glow dust.** 1 stone, 1 flint and 1 coal. 5 glow dust make a glow dust block, a light source.
- **Glow vines and glow crystals.** Glowing vines hang down cave walls and light the tunnels; you can
  climb them (walk into the vine or hold jump to go up, sneak to hold still). Breaking one with any
  tool gives 1–2 glow crystals; by hand it just comes down. 5 glow crystals make a glowcrystal block
  at the crafting bench, the brightest light in the game.
- **Cobwebs.** Strung in cave corners, on floors, walls and ceilings. Walking into one slows you
  down by 80% (leather armor helps only half as much there). Cut one with a sword for 1–3 string. Cobwebs always hang on a floor, wall or ceiling.
- **Storage blocks.** At the crafting bench, 10 coal, charcoal, iron/gold/tin/copper ingots, diamonds,
  emeralds, rubies, sapphires or raw iron/gold/tin/copper press into one block, and a block breaks back
  into 10. Coal and charcoal blocks burn in a furnace as long as the ten they were made from. Ten bones make a **bone block**
  (and back), a pillar that turns to the face it is put on, with a bone brick look (0.833).
- **Sandstone.** 5 sand make sandstone, 5 red sand red sandstone and 5 pink sand pink sandstone at the
  crafting bench; each has a brick and a polished look on the variant bar. Pink sand lies on some warm beaches
  near deserts (new worlds).
- **Fiber block.** 10 fiber pressed into a block (and back), breakable by hand. Loose fiber tufts grow
  beside fallen hollow logs, and very rarely a plains grass block turns out to be one.
- **Hollow logs.** Fallen hollow oak, birch and spruce logs lie in forests, often with mushrooms around
  them; cut one with a hatchet to take it. Placed standing up and filled with dirt or grass (right click
  it with the block), it works as a planter for saplings, flowers and grass; filled with sand, for a
  cactus. Breaking it gives back the log and what was inside. Laid down and filled with dirt or grass,
  it slowly grows mushrooms on top from spring to autumn: brown (or black, white or yellow) on oak, red on birch, blue on spruce. A hollow log makes 3
  planks, like a log.
- **Falling blocks.** Sand, red sand, gravel and fiber blocks fall when nothing is under them and land
  as a loose pile of 8 layers you can walk through. Deserts have dunes of 1–7 layers, exposed gravel has
  loose gravel on top, and gravel rarely lies scattered on other ground.
- **Ladder and door.** Switched off for now: no recipe and not in creative. Ones already placed still work.
- **Block recipes.** Snow, clay, glass, terracotta (from brick items), wool and the glow dust block take 5 of their material; hay bales,
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
| Fire torch ×4 | 1 coal or charcoal, 1 stick, 1 fiber, 2 flint | Inventory |
| Crystal torch ×5 | 1 glow crystal, 2 fiber, 1 stick | Inventory |
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

After a death you come back with full health, stamina and oxygen, but food, thirst, energy, fruit, vegetables and protein at 75% (0.833; half in 0.8324). Sleeping in a bed sets your respawn point and, once everyone is in bed, runs the night past as a 10 s time-lapse to sunrise (0.8323; getting up stops it). Stuck? The pause menu's **Respawn** (keep the cursor on it 1 s, then click) kills you on the spot, once every 20 minutes. Hold `Shift` in the crafting list to
craft as many as you can afford in one click.

**Chests** hold 3 rows; a double chest 7 (0.829, 5 and 10 before; anything past that falls out when you open it).
