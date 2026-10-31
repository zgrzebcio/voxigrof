# voxiGrof

A voxel survival sandbox that runs in the browser: plain JavaScript and three.js, no build step.
Current build: **alpha 0.85397**.

Create a profile, press **Play**, and create a world. Untick **structures** on
the create screen for a world without villages and dungeons.

A village (0.8242) has at least three houses of three kinds and a well for every four houses, the first in its
square. Every door opens onto a gravel path 2-3 wide that winds round the buildings to the square, crossing water
on a plank bridge where it must. Deserts have their own villages (0.82422): sandstone houses, mostly the big
ones, grass paths, and no loose sand drifted over the yards. Villages stand on the plains and in forests, deep ones too,
and since 0.84882 in spruce forests (deep ones too) and on the cold plains, where they are built of spruce: logs, planks,
doors, chests and beds (the crafting bench is the dark one).

**0.8485.** **Carrots** grow wild in small patches on the mild plains and the flowery meadows (not the warm or the cold
ones; new worlds). Like wheat they grow through stages; hold E on a ripe one for a carrot (Lucky Hands: one more, 20% of
the time) and its top stays to grow again. Eaten: 5 food and 25 vegetables (5 when your vegetables are full), in 1.1 s;
a carrot keeps 3 hours. A horse's food: carrot 60, apple 40, sugar 20. A jam sandwich keeps 4 hours. Creative has the
carrot plant at any stage on the variant bar.

**0.8484.** The **lock pick** (at the bench: 2 seashells, 6 iron ingots, a leather, a charcoal): hold the right button on
any locked chest, a sealed one or one a player locked, twice as long as a key. Half the time it opens (a seal picked stays
open; a player's lock stays locked); else try again. It breaks 10% of the time on a wooden chest, 30% on a metal one.
**Jam sandwich** (in the pocket list: 5 berries of any kind, black and white too, and a bread make 2): 25 food (10
over-food when full), 10 fruit, 5 stamina. A tamed meerkat eats from your hand (use): chitin fills 80 of its hunger, any
meat raw or cooked 50; no fish.

**0.848303.** Sealed metal chests now lie in caves only, between height 1 and 200, where the 3x3 round them is open
(newly explored land; the ones already placed stay).

**0.848302.** Horses, hellhounds, otters and meerkats get hungry half as fast (riding a horse too).

**0.848301.** The Stats list shows **item pickup range** and **foraging reach**. A worn otter or meerkat is listed among
your effects with what it gives. A meerkat on the shoulder gives 10% more reach, 0.3% more a level and up to 5% more
by its taming (30% at the most).

**Meerkats and tumbleweeds (0.8483).** **Meerkats** live in bands of 2-4 on the edge of the desert, where the sand meets
other land. They stand up on their hind legs keeping watch, forage, eat termites, and run from players (a crouching one
only up close) and from monsters. Now and then one fetches something lying near its burrow (or what a tumbleweed caught)
and buries it under a layer of sand: break that sand to get it back. **Taming**: crouch with a chitin plate in hand and
press **E** on one: 1 plate at low level, up to 5 at level 50 (4 with Gentle Hand), one every 20 s. After each it runs
off and comes back to the same spot 10-15 s later: stay crouched where you are. Standing up while it is within 12 blocks
scares it and costs 3-10% effectiveness (more the nearer you stood). Tamed: use for its stance (follow, stay standing up,
lie down, find items: it fetches what lies around its spot and brings it there), sneak + use to sit it on your shoulder
(items and foraging reach 10-30% further, by its level and taming; one pet worn at a time, so an otter round your neck comes down for it), E pets
it. **Tumbleweeds** roll over the deserts, the Savanna and the Dryland with the wind; hit one to see what it caught
(usually nothing; chitin, string, sticks, fiber, a feather, a leather strip, very rarely fur). Fire burns one up at
once, and it sets fire to where it rolls. Dropped items look 20% bigger and breathe a faint white mote, easy to spot in
tall grass. An otter rests 5 s between catches.

**0.84829.** Helmets (leather cap, iron, bronze, steel, gold) leave the face open: a brow over it. Only a shield rests
low in the off hand; a torch is carried where it was. Use a raw fish on an otter (right button, as before; E still pets): it
eats it (cod 30, pike 50, salmon 70, catfish 90 of its hunger), sitting up chewing. Bronze tools and armor take twice the bronze; bronze
tools also a chitin plate, bronze armor but the helmet 1-2 fur. Polar bears drop fur (90% one, 30% a second; Butcher
adds). Bronze armor lasts 520, steel 900. The Mender's and Dismantle's drop zones show again while you carry gear.

**0.84828.** Rain (and snow) sounds die away underground: quieter the more ground is over you, silent under 24 blocks
of it, and never heard below height 50.

**0.84827.** The marks of a world you left (death marks, your waypoint, an animal being tamed, your animals' name
tags) no longer hang over the title screen or the next world while it loads; each world shows only its own. The mark
over an animal being tamed gives its sex and level.

**0.84826.** The chest's window is as tall as its chest (never taller than the equipment's). The leather belt gives 2
hotbar slots only: its row of five empty belt slots is gone until there is gear for them.

**0.84825.** Smaller chests: a wooden chest holds 2 rows (a double 5), a metal one 4 (a double 9). What no longer fits
moves to a free slot or falls out at the chest when it is next opened. The chest's window no longer scrolls.

**0.84824.** **F** swaps what your hand holds with the off hand, as in Minecraft (the off hand takes a shield or a
torch; an empty hand takes back what is there). A resting shield sits lower still.

**0.84823.** A shield in either hand rests lower, in the bottom corner, turned the other way, out of the middle of the
view.

**0.84822.** No horde at nightfall: monsters come up one at a time, at most one every 6 seconds anywhere (3 under a blood
moon), and how many may be out grows from a quarter to the whole over the first 3 minutes of the night.

**0.84821.** New worlds: ores higher up. Coal mostly at 100-120 (most of all 110, up to 180), iron mostly around 90
(up to 156), copper around 70 (up to 120), tin around 50 (up to 90). Where the land is lower, they lie in the top of its
rock instead. Gold stays deep (20-30).

**0.8482.** **U** sets a waypoint: name the spot you stand on (your base), and a mark shows it on your screen with its
distance, as the death mark does; U again moves or removes it. One each, per player and world. Creative's hotbar has 12
slots (keys `-` and `=` for the last two). Monsters: 20% fewer, and they come up at least 40 blocks from every player.
Otters are rarer still, and they eat with a softer, higher sound.

**0.84811.** A fish held in your hands takes 50% longer to wriggle free. While you tame a hellhound or an otter, a
mark on your screen shows where it is, how far the taming is and how far away. Your tamed animals' names hang over them
like a player's, seen through walls and from far, on your screen only, so a lost one can be found. The otter's voice is
lower; it eats and walks with the usual sounds. 40% fewer otters in new land.

**0.8481.** A shut wild clam fills with sand a step at a time; full, hold the right button to take the sand (it fills
again): a sand farm. New worlds: clams at least 5 blocks apart. A fish out of water has 35 s of air, then slowly
suffocates (in your hands too: one that dies there is its raw fish). Fish dart away from a player jumping into the
water near them, from otters, and as soon as they are back in the water after being stranded. An otter worn round the
neck gives 10% cold resistance, 0.2% more a level and up to 5% more by its taming. The seashell block has a front and a
back.

**Clams and otters (0.848).** **Clams** lie on warm sea floors (height 93 and under, new worlds). Hold the right button
on one to open it: a fifth hold sand, where a **pearl** slowly grows while the clam is shut (an empty wild clam takes in
sand while shut); hold the button again to take a pearl out. Broken, a clam drops itself and loses what was in it. Put
down again it opens at a touch and grows nothing, but keeps one thing for you: right click puts in one of what you
hold, right click again takes it back, sneak + right click shuts it; food in it spoils as in a chest.
Hold the right button half a second on a **fish** to take it alive in both hands (the hotbar stays put while you hold
it); it wriggles until it gets free, the prompt says how much is left, and right click lets it go. On land a fish lies
on its side and flops toward the nearest water.
**Otters** live in twos and threes in the water by deep beaches and on big lakes and rivers; they are very fast
swimmers and all flee together when one is hit (an otter drops **fur**). Tame one by giving it live fish with **E**:
an otter up to level 25 takes fish levels worth 50 (one fish of level 50), above that 100; a catfish counts half
again, Gentle Hand a fifth more, and a fish of a lower level than the otter costs effectiveness. Tamed, right click
picks its stance (follow, stay, lie down, catch fish, find pearls: worked from where it stands when the stance takes
hold, bringing fish or the pearls of wild clams back there); raw fish feeds it; E pets it; sneak + right click puts it
round your neck as a warm scarf (cold resistance), and sneak + right click with an empty hand sets it down.
Fish: 20% more schools, bigger, each species in its own water (pike and cod in lakes and rivers, cod and salmon in the
sea, mostly salmon in the deep sea), schools of different fish apart.

**0.84777.** Sugar cane can be placed on sugar cane. A coconut put on top of a block sits on it and stays; hung under one it hangs.

**0.84775.** The palm has a hollow log. Sugar cane stacks on sugar cane by hand as high as you like (it still grows to 5 by itself). A coconut with nothing solid over it falls, in creative too, where it leaves nothing.

**0.84774.** Rime leaves drop a rime sapling: plant it on snow, dirt or grass, it grows in any season into a slender spire of rime. Saplings grow new trees: an oak forking into limbs under clusters of leaves, a tall slender birch with a narrow airy crown, and a spruce that comes up as one of five (the usual cone, very tall, a narrow pole, a twin top, or wide and old). The world's own trees are unchanged.

**0.84773.** Creative: a bone ash block used on a sapling gives it 4 days of growing (2-4 uses grow the tree).

**0.84772.** A chest opens under water. Creative shows nothing on the lens. The coconut is in the creative palette beside the gourds.

**0.84771.** A block standing in water lets its water run out into an open space beside or under it, and stays wet. Water that runs out beside the world's own still water, with still water on two sides and a floor under it, settles into still water: a block dug out under a lake's surface fills back with still water. A bucket's water and lava stay finite.

**0.8477.** Blocks that are not whole keep still water round them: a slab, stairs, wall, fence, pane, cover, door or carpet (one that does not fall), a chest, a ladder, a crystal or unlit torch, a gem cluster or a hollow log put into still water stands in it, you swim there, and breaking it leaves the water. A chest opened under water lets out bubbles. Flowing water is pushed out as before.

**0.84766.** Eating a mushroom stew or a half coconut gives the bowl back half the time, a bottle of water the bottle 95% of the time, milk always its bucket; the tooltip says what is left and how often.

**0.84765.** Thin logs that step sideways (an acacia's limbs) are joined by an elbow instead of standing apart. Hiding the HUD hides the block outline too.

**0.84763.** Food in a furnace spoils like food in a chest. Taking the input out of a furnace, or swapping it for something else, starts the smelt again from nothing.

**0.84762.** New recipes: a metal chest (a chest, an iron, gold or copper block and 5 iron ingots, at the bench), packed ice from 5 ice and back into 5 ice at the mortar, flint from 3 gravel and 5 fiber from a cactus at the mortar, and a bone ash block (5 bone ash) that falls like sand and takes the carpet shape. The pumpkin pie takes 2 sugar. Iron armor costs twice the ingots. A half coconut drunk leaves a bowl.

**0.84761.** Taming takes 40% longer (a hellhound wants 7 animals, 4 monsters or 3 villagers); Gentle Hand now speeds it 20%. Hellhounds sleep at night, tamed ones too (they wake to fight, or to follow you when you walk off); a hound being tamed does not count its day while it sleeps. Asleep or told to lie, a hound slowly gets its fire back, and cold land burns it faster. A horse takes a new stance 2 s after your last click. Wool takes 10 string, and every string recipe twice as much. Spiders crawl on cobwebs, and one sometimes runs from under a picked-up stone or flint; Options > Gameplay > Arachnophobia removes them. New worlds: a quarter more cobwebs, 30% more cave lava pools, 40% more lava mushrooms.

**0.8476.** Pebbles and seashells are smaller, and foraging is 15% faster. Seashells count as bone in the mortar (bone ash, bone meal) and in the bone block; ten of them make a seashell block at a bench, turned to face you when placed. Cobwebs come in three looks: plain, tangled, and a corner web strung where two blocks meet; walking into one covers your view with web. While the inventory is shut, stamina and oxygen sit under the crosshair. A crossed-out tool beside the crosshair warns that it is the wrong tool for that block (Options > Gameplay turns it off). Right-clicking a bench with finished work takes it out; holding the button still cancels. Butcher now also adds to zombie flesh and skeleton bones. Each loot chest you open gives 25% more chest experience than the one before. New worlds: a flatter Savanna with more tall grass and tall dry grass, and 10% more ore (not coal). Tall grass in the Savanna looks drier.

**0.8475.** Every skill costs 1 point. Coconuts grow under palm crowns, small and green at first; ripe after about three days, they may fall by themselves and crack into two halves. A hatchet takes a ripe one whole; hold the right button with a coconut to open it into two halves, and drink a half for water (less when you are not thirsty) and a little fruit. A felled palm sometimes drops its coconuts (twice as often with Timber Shaker). Falling blocks (sand, gravel, coconuts) now hurt whoever they land on, more the further they fell; Hazard Hide takes 30% off, and hay bales hurt no one.

**0.84741.** Palms on deep beaches grow only up to height 110 (none on the hills and mountains behind them) and a fifth fewer. Caves are 30% darker. New worlds: a quarter fewer caves (the same size), and the deep beaches' pink sand in smaller patches.

**0.8474.** Half as many seashells. You cannot drink while standing in water, you stand still while you drink, and water poured from a bucket can be neither drunk nor bottled. Climbing, drinking and drawing a bow put away what your hands hold. Deep water is darker and hides its bottom. The snowline sits higher (from 185 up), and warm lands keep no snow on their mountains. A river's steps and waterfalls no longer spill a sheet of water over the pool below and the bank. Ice lines along chunk borders are gone. New worlds: half the pink beaches, and a river or lake one or two blocks above the next water joins it instead of stopping a block short.

**0.8473.** Wet ground: rain darkens open ground the longer it rains, and it dries slowly after; blocks beside water are always wet, waves leave the beach wet where they break, and a player fresh out of the water or the rain leaves wet steps and small puddles. Rock and lights never darken. Rain puddles grow with the rain. Clouds have thin, see-through edges.

**0.84721.** TNT no longer goes off when put down: light it with fire, a burning torch or flint (right click), or let fire or lava reach it.

**0.8472.** Seashells lie on the sea's beaches, picked up by hand. The flint pebble has its own model and art, and the stone pebble the same shape in stone. Waves are bigger: a swell of water topped with foam that rises as it rolls in and falls in on the shore. New worlds: no Dryland or Savanna patch under 16 blocks across, and no one-block pockets of either on a mountain's flank.

**0.8471.** New worlds: the Dryland and the Savanna about half again as wide (the warm plains and the desert a little smaller), 60% fewer acacias, 90% fewer termite hills, and wild wheat thick on the warm plains (a little on the cold ones). Termite workers (four to one over soldiers) climb trunks to eat trees from the top; after three logs one goes home and rests inside its hill a while. Hellhounds are a third rarer and always alone, far apart. Butcher adds to a termite's chitin and a hellhound's fire. Picking grass leaves short grass. Holding E no longer waits between ripe berry picks. Ctrl+Shift on a recipe counts out half the most you can craft at once. A bench pays a craft's experience when you take the items.

**Deep beaches and waves (0.847, new worlds).** Warm coasts of the big oceans have long, wide beaches (16-34 blocks
of sand over gentle shallows), a one-block edge of **sandy dirt** where the sand meets the turf, and most of the palms. Every
palm grows on sandy dirt, and a palm sapling can only be planted in it. Waves roll in from the open sea and break on
the shore, bigger in storms and strong wind; they push swimmers toward the beach. Flowing water no longer leaves dry
holes when it fills a hollow, takes both halves of tall grass, and washes stone and flint pebbles away (they drop
and float off with the current).

**The Savanna (0.846, new worlds).** The hot edge of the Dryland, next to the desert: golden grass, much of it tall,
flat-topped **acacia** trees standing apart (acacia logs, planks and leaves; no sapling yet) and **termite hills**,
small or big. A hill keeps a few **termites**: workers chew the logs near it into hollow logs (a log house too), and
soldiers bite whoever comes close to the hill or hits one of its termites. Breaking a hill (a shovel is quickest) lets
1-3 termites out of a small one, 3-6 out of a big one, and gives clay bricks, dirt and wood bark. A termite drops a
**chitin plate** a quarter of the time. Horses and cows graze the Savanna too.
0.8461: an **acacia sapling** (from its leaves; it grows the flat-topped tree) and an **acacia chest** (variant bar).
Grass comes in three sizes: **short grass** (new, the smallest; half the grass of new worlds), **grass** (the old
short grass) and tall grass. Bare grass sprouts short grass, which grows into grass, then tall grass. A fiber off
short grass 6%, off grass 12% (25% before), off tall grass cut down 25%. Short grass on short grass makes grass.
0.8462 (new worlds): the Savanna is a big biome now (about four times the land, the desert a fifth smaller), with 60%
fewer termite hills, at least about 13 blocks apart. A hill stands only on full blocks: take one out from under it and
the whole hill breaks.

**0.8463.** **Bronze armor** (helmet, chestplate, leggings, boots, gauntlets), between iron and steel, at the bench:
15-30 bronze ingots, 2-10 leather, 1-4 chitin plates and 3-15 cloth by the piece, and 5 feathers for the helmet; 600 to
1100 XP. **Beds** only let you sleep in a closed house you (or a village) built: walls and a roof round the bed, no
cave or open pit. 30% more monsters at night. The mortar breaks 50% faster. The pie quest now wants 3 bread or one
baked pumpkin pie (an unbaked one no longer counts).
0.8464: a sealed chest's key is turned with the button held 0.8 s (the ring round the crosshair). A full **bronze set**
takes 35% off arrows and the Frozen King's fireballs and beams. **Bulls** grow black horns. Skills: Preserver costs 2,
Treasure Nose costs 2 and finds a key 2.5% of the time, Pack Rat needs nothing and comes before Weathered, which costs
1; Hazard Hide no longer needs Weathered; Precise Focus starts after 3 s and is full at 12 s.
0.8465: monsters come up at least 24 blocks from you, in every chunk that loads at night, all round you as night
falls and now and then through it. **Leather strips** (3 from a leather, at the bench). The **leather belt** is
crafted now (15 strips, 6 iron nuggets, 4 ashes) and opens 2 hotbar slots (keys 9 and 0). The **backpack** holds
twice as much (four rows) and takes 9 leather, 4 strips, cloth, fiber and 6 bronze nuggets. Arrows take an ash. The
quest after the pie asks for the belt; the backpack quest comes after the bronze pickaxe.
0.8466: a bare hand deals 1 damage. A sword takes no block but a cobweb.
0.8467: with the inventory open, point at the XP bar (mouse or pad cursor): your level, the XP into it and what the
next one takes, and your last 3 gains.

**Hellhounds, fire and bottles (0.845).** A **hellhound** lives in the Deep Desert, alone or in a pair: a dog of
magma, 150 health, a 40 bite that sets you alight. Fire and lava do not hurt it (lava heals it); water and rain do,
slowly. It drops 1-3 **fire**: an item (stack 30) you place to set a spot alight. Hold a **lava mushroom** and a wild
one leaves you alone; give it the mushroom and its **taming** starts. For one game day (20 minutes) it follows you
and goes for whatever you strike. It wants 5 animals, or 3 monsters, or 2 villagers killed (they add up). The
taming's effectiveness starts at 100% and only goes down (0.8451): each kill the hound makes itself takes some (an
animal 10%, a monster 17%, a villager 25%), and so does any health it loses; kills you make **with fire** (a torch's
blow, fire you set) take nothing. Effectiveness (never under 10%) sets the health (up to +50) and bite (up to +10)
it gains. A kill by a hound, or yours by fire, leaves 1 fire; a hurt hound eats one it
finds (full health while being tamed, a spell of healing after). If the day runs out, it turns on you for good.
Tamed, you name it. **Use** it: the next behaviour, taking hold after 2 seconds: passive, defense (what struck you or
it), aggressive (also anything within 8 blocks), attack (also what you strike). **Sneak + use**: the next stance:
follow (left 26 blocks behind, it comes to you), sit, lie, wait. It eats from your hand: lava mushroom 50, fire 80,
coal 20, charcoal 10 (food out of 120). Its "water" is fire (out of 100): it fills beside lava or a burning fire and
from fire it eats; at 0 its bite no longer burns and it stops healing on its own.
A **glass bottle** (4 glass, at the bench) fills at water with the right button held half a second; a bottle of
water gives 25 thirst and the bottle back. New quest after the glass: fill a bottle of water.
0.8451: **E pets** an animal you tamed. A tamed **horse** takes a stance with sneak + use: lie, wait, wander (as
before) or follow. A saddled horse now faces and runs the way you look (it went the other way, the rider sitting
backward). Horses walk half as fast when left to wander. An animal that is yours, or wants what you hold, turns its
head to you. Mobs jump 1.2 blocks, so they get up a one-block ledge again; a fall hurts them from 6 blocks (3 before),
a horse from 8. The naming window says the animal's sex and level; the riding panel is numbers only.

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
0.84, the desert update (new worlds): the **Deep Desert**, the huge hot heart of the deserts: terraced mesas shattered by
cracks, broken ridges, sandstone crags and hoodoos, and half-buried bone skeletons of every size (ribcages, serpents,
skulls, loose bones). It is 8°C hotter than the red sand and heatstroke builds 60% faster there. Rare **Oases**: a lake
in a ring of grass out in the desert, with palms and sugar cane. **Palm trees** (palm log, planks, leaves, sapling) grow
in oases and, very rarely, on warm shores' grass by the sea; a palm sapling takes grass, dirt or sand. **Dry grass, tall
dry grass and dry bushes** grow in deserts and now and then on the warm plains: dry grass gives a fiber 20% of the time (10% until 0.8441),
a dry bush 1 stick 70% and another 20%. Desert sand is 5 deep over 5 layers of sandstone. Two ruins stand in deserts to
look at: a broken colonnade and an obelisk. Desert villages are half as common, and never in the Deep Desert. A **bone
block** now breaks into bones (1, then 60% and 30% for more) and **bone ash** (90%, 50%, 10%); a bone ground at the
mortar makes 2 bone ash. Coming: a great pyramid on the Deep Red Desert Flat with the summer boss, a pharaoh.
0.841, red desert and mountains (new worlds): the Deep Desert's heart is split into two halves side by side, the **Deep
Desert** (yellow sand, sandstone) and the **Deep Red Desert** (red sand, red sandstone), both with the broken mesas,
hoodoos and skeletons. Under the red sand gold ore lies at any height, up into the hills. All high land (mountains,
hill tops, desert mesas and crags) is hollowed: a hall inside, a tunnel out to the slope (sometimes right through), a
winding shaft down to the deep caves, and tunnels between neighbouring halls. Small **mine shafts** are dug into desert
hills, mostly red ones: a framed tunnel, a ladder shaft down to a room with a side tunnel, burnt-out torches, cobwebs,
and gold in the walls in the red desert. No chests.
0.8411 (new worlds): the **Dryland**, the hot side of the warm plains beside the desert: very pale dry grass with patches
of bare earth, a lot of dry grass, tall dry grass and dry bushes with half as much green grass, no trees, big dry bushes
of pale **dry leaves** (small to about 5 across; they give only sticks and never decay), and now and then a skeleton.
0.842: **doors** are a hammer shape now (Door, on the Advanced page): hold planks of any wood, an iron, copper or tin
block, adobe or glass (or a look of one) and place a door of it. Each material has its own door look. In survival a door
takes 3 of the block and 6 of the hammer's durability (a hammer with less left must be repaired first; the radial and
the feed say so), and breaking it gives the 3 blocks back. Old oak doors in your worlds became oak plank doors.
**Keys**: a wooden key (bench: 4 planks and any metal nugget) right-clicked on an unlocked door locks it: from then on
only someone holding that key opens it, and sneak + right-click with it unlocks it again. One key, one door. A locked
door can always be broken; then its key is blank again. Iron, golden and copper keys exist but cannot be made yet.
0.843: **metal chests** (iron, copper, gold) lie about the world, sealed, in caves between height 1 and 200 where there
is room round them (since 0.848303; any height and anywhere before). Copper is the commonest, gold the rarest and richest. A key of its metal opens one and stays
in its lock; then it is an ordinary chest of 4 rows (two side by side: 9) that a pickaxe takes home, and its look is
picked on the variant bar. They cannot be crafted. Zombies and skeletons you kill sometimes drop a copper, iron or golden
key. Any chest now locks with a key like a door (both halves of a double, one key). Breaking a locked or sealed chest
gives nothing back: neither its contents nor the chest.
0.8442: **supply chests** share one spacing: every 100 to 250 blocks stands one, the wooden supply crate (unlocked until 0.8444;
the commonest) or a sealed copper, iron or gold chest. **Stacks are smaller**: items 79 (99 before), blocks 50 (60),
and the small stacks ten less (a bowl, snowball or golden apple 20, a bucket or stew 10); a stack you carried bigger is
split when you join, and what does not fit falls at your feet. Nights and caves are a fifth lighter. The Dryland's pale
grass fades in smoothly over its edge instead of in squares; the desert and the Dryland grow half as much grass, and new
worlds' Drylands hold 70% fewer skeletons. A bone block gives bones and bone ash half as often. Your last 5 deaths each
keep their marker and timer. The feed shows how many of an item you now carry: `[41] +11 Stick`. The "Get milk" quest
points at the nearest female cow.
0.8443: nights and caves are half as light again as before 0.8442. **Holding E** only takes what is ready (ripe berry
bushes, ripe wheat, grown mushrooms); a tap still takes anything. Ripe wheat picked stays as a first-stage plant and
grows again. Soft blocks broken by hand drop again (mushrooms, torches, flowers, saplings, sugar cane gave nothing).
Leather drops more often (98% one, 48% a second). Every armor piece lasts as long as its chestplate, iron armor slows
you half as much, and food gives half the over-food. A backpack is no longer a target for Transfer all, Pull all or
Quick stack (a chest is). A quest wanting different things lists each with its own count. Lists keep their place while
the inventory is open and start from the top when it opens. Chunks keep arriving at a low frame rate.
0.8444: fewer wooden supply crates (30% of the squares, 16% hold nothing) and a few more metal chests; the crate's
chest is **sealed** and a blank **wooden key** (4 planks and a nugget, never dropped) opens it, staying in its lock.
Cloud shadows are half as dark, nights and caves lighter again. Short and tall grass pale in the Dryland and a little
in warm land. You cannot forage while eating or drawing a bow. Head under water: mining 75% slower (the Underwater
effect) and a blue sheen over the view. Stamina does not come back without food and water; being exhausted costs
health only in a sandstorm or with heatstroke. Loose sand and gravel with nothing under them fall when you step on
them, and take their hanging neighbours with them. A bone block rarely gives anything. A finished station order
rings in its own gold feed row. Two new quests: coal or charcoal after the furnace, 4 glass after the milk. New
worlds: a fifth more lava ponds in warm plains and the Dryland. A block you break or place is drawn at once even
when chunks are streaming.
0.8445: a chest with a block on it does not open (another chest on top is fine; a double needs one clear half).
Rivers carry you, drops and animals downstream (fish hold their place). Ores also give 0-2 stone pebbles. Fruit,
berries, pumpkins and grilled mushrooms leave a fiber when they spoil. Snow never settles on a bench, mortar, furnace
or chest, and a snow block stands full height. You drink from 2 blocks, not 4. The temperature dial reads hot at the
top. A stack on the cursor is dropped, not lost, when the inventory shuts with no room. Palm leaves are tinted; new
worlds grow shore palms only from level +1. The cloth bandana no longer covers the face or chin. Fixed: metal,
non-oak and double chests drawn as single oak chests after loading a world.
0.8446: **milking** takes the right button held for 2 seconds, you and the cow standing still, and pays 100 XP. A
**ring round the crosshair** fills while you eat, drink, milk, work a bench or hold to cancel its order. A bed is set
down with its pillow away from you. A night outside pays 10 XP times the days you have lived; the last biome found
pays 10000. Treasure Nose: 1% of loot chests also hold a key. Thick Skin is +10 health only.
0.8447: a food's tooltip says what it spoils into. The ring fills for a bow being drawn too. A blood moon lived
through outside pays 100 XP times the days lived. A station's floating tag shows the speed it is being worked at.

**Igloos (0.833)** stand now and then in the snow (not the cold plains): a snow-brick dome with a furnace, a crafting
bench, a hay bale, a crystal torch and a chest of cold-country things (ice, snowballs, fish, berries, bread, paper, clay, copper nuggets...).
**Loot chests** always hold at least 3 different things, and pay twice their XP (a desert village's three times, an igloo's
four) since 0.833.

**Torches burn out (0.834).** A fire torch (coal, stick, fiber and 2 flint make 4) lights 15 and burns 5-10 minutes,
placed or held; rain puts one under the open sky out. A crystal torch (1 glow crystal, 2 fiber, 1 stick make 5) gives a
cold blue light of 12, melts nothing, works under water and burns 15-30 minutes. A spent torch is an unlit torch:
right-click a placed one with flint to light it (1 strike in 4 fails, the flint wears away half the time) or with a glow
crystal to make a crystal torch (the crystal is used up 1 time in 4). Broken, a lit torch (fire or
crystal) comes back as an unlit torch, and an unlit one gives a stick 1 time in 4 (0.8444). Glow dust blocks (the old
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
| Hotbar | `1`–`8` (`9` `0` with a belt; creative has 12: `1`–`0`, `-`, `=`) or mouse wheel | LB / RB |
| Waypoint: name the spot you stand on (your base), or remove it; it shows on your screen with its distance | `U` | — |
| Swap the held item with the off hand (shield, torch) | `F` | — |
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

**Frame rate (0.84875).** Options > Video "Frame rate limit" starts at 60 for a new player (off = as fast as the
screen). Whatever it is set to, the title screen and an open inventory draw at most 60 frames a second, the pause menu
and a game window without focus at most 30: less heat and fan noise. Options > Video "Shadow quality" (0.84877): low
redraws the shadows a quarter as often as the sun moves (lighter on the processor), normal as before, high twice as sharp.
0.84879: "Clouds" fancy / fast / off; "Background threads" auto / 4 / 2 (fewer: new land comes slower, the machine stays
cooler and quieter); "Power saver" sets 30 fps, render 8 and simulation 3 (only lower), fewer particles, no shadows, fast
clouds and 2 threads at once, each changeable after.

## Your first steps

Bare hands only break plants, leaves and furniture. Everything solid needs a tool, so the start
of the game is about making your first flint tools. The exceptions (0.8244): sand, gravel and snow come away by
hand a layer at a time, and glass and glassy sand whole, all at half the speed of a flint tool. A shovel takes a
whole block, or a whole drift of layers, at once. Feet sink 30% into a full block of snow (sand and gravel stand
full height since 0.8444), and a snow block falls like sand. Snow outside snow biomes melts slowly, a layer at a time, when the air there is over
5°C; above the snowline the air is 0°C or colder.

1. **Fiber.** Hold `E` on short grass, tall grass, wheat and berry bushes. Foraging needs both hands, so your offhand must be empty. Each pick has a chance to
   give fiber (since 0.8441 every fiber chance is 10 points higher, never over 90%: grass 25%, dry grass 20%, wheat 10% plus
   5% a growth stage, a berry bush 17% plus 7% a growth stage, a flower 60%, a melon or pumpkin 50%). Fiber goes into every early
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
**over-stat** (up to 50, the white outline) that is used up first, at 1.5 times the bar's rate (3 times until 0.8441);
you start (and respawn) with every one full. From full, food lasts 40 minutes, thirst 20, energy 150 (75 until 0.8441;
over seven days without sleep) and fruit, vegetables and protein 70 (35 until 0.8323). Health heals while food is above 30 and thirst above 20; the food and thirst it costs follow how fast it heals (0.8323).
Eating takes 20% longer than it used to.
- **Stamina** pays for sprinting, jumping, wall climbing and swimming (swimming up a lot, along a little, treading water a trickle; no rest off the bottom). Since 0.831 everything that uses it uses a quarter more, and mining takes a little (about 1 point every 3 s). It comes back 3 s after you last used it (5 s once exhausted; 20% faster
  sneaking), faster the longer you rest (after 2 s, up to +50% over the next 6 s, 0.8321) and the emptier it is, using food and thirst (more thirst since 0.829). Oxygen lasts 24 s under water and comes back faster the longer you breathe (after 2 s, up to double over the next 4 s) and by your regen. Empty, you are **Exhausted** until it is back to 20: no sprint, jump or climb,
  20% slower (40% in a full sandstorm), and after 10 s of it you lose 0.3 health a second.
- **Thirst** drops over time and hurts at 0. Look at water with an empty hand and hold `E` to drink to
  full; berries, melons, apples, cantaloupe, milk and stew help too.
- **Energy** drops over time, faster when you use stamina or get hurt (all of it slower since 0.831, half again since 0.8441). A night in bed fills it, and costs a little food (10), thirst (15), fruit, vegetables and protein (4 each), never taking one under 10 (0.8321). At 20 or less you are **Tired** (0.832), the more so the emptier it gets: down to 0 your regen falls by up to 70% (never under 0), every bar drains up to 40% faster and you move up to 25% slower.
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
  Desert nights are cold from dusk on (0.8443): about 5°C in April, 15°C in July, -5°C in January, a few degrees less at 03:00. Caves are cold, about 4°C near the surface, a little warmer the deeper you go (up to 14°C). A held torch goes out under water and is put
  away until you surface. The bars fill sideways.
- **Heatstroke (0.825)** builds while your body is over 35°C in a sunny or clear day's sun under open sky: 0 to
  100% in 4 minutes in a desert at midday, slower when cooler, half as fast outside deserts. It goes down in shade or
  at night, faster under a roof, fastest in water. From 20% thirst and fruit drain faster, 30% food, vegetables and
  protein too, 40% your sight blurs, 50% energy drains fast and stamina barely comes back, 70% you lose health,
  90% you see mirages, and at 100% you die. A hat (cloth bandana or leather cap) slows it 25% and lets you get 5°C
  hotter first; the full cloth set slows it 40% more.

**Water and lava flow again (0.844)**, worked out in a thread of their own so the game does not stall. Water spreads
7 blocks over a floor, lava 3 and five times slower, each running with its flow animation the way it goes; both fall
first, find a drop before spreading, and dry back when what fed them is gone. Water is finite: only a bucket's or the
world's own water is a source, never water that fell or spread. The world's loose water and lava flow too once you
come near (lakes into caves under them, waterfalls, river steps). Flowing water meeting lava turns to stone, a lava
source to obsidian, flowing lava turns water to cobblestone. F3 shows what the flow costs.

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

Each level costs 2.5 times the last (0.8443; three times before) — 30, 75, 188, 469 — up to level 50, so a level is
meant to be an achievement rather than something that ticks over.

**Every level is one skill point.** Spending points does not spend levels. Open the tree with `K`,
or with the **Skill tree** tab on top of the right-hand panel, which shows how many points are free. With a furnace, chest or structure block open, the same tabs switch that panel to **Equipment** and back.
Pick a category tab, then **hold** a skill for half a second (mouse button, or A on a gamepad) to
learn it. A bar fills across it while you hold, and there is no way to unlearn one.

| Survival | Cost | Needs | Effect |
|---|---|---|---|
| Thick Skin | 1 | — | +10 health (no damage reduction since 0.8446) |
| Grass Weaver | 1 | — | 40% better chance of fiber from grass, wheat and bushes (30% until 0.8441) |
| Slow Burner | 1 | Thick Skin | Every bar drains 5% slower: food, thirst, stamina, oxygen, energy, fruit, vegetables, protein (the stats depletion) |
| Climber | 1 | Slow Burner | Climb a bare wall one block higher, for 30% less stamina |
| Canopy Forager | 1 | Grass Weaver | 30% better chance of sticks, saplings and apples from leaves |
| Timber Shaker | 2 | Canopy Forager | Every swing that cuts a log shakes the tree: each leaf on it has a 2% chance to fall and drop its loot |

| Crafting | Cost | Needs | Effect |
|---|---|---|---|
| Work Fingers | 1 | — | +10% crafting speed, and crafting slows your walk 25% less (Nimble Fingers until 0.8447) |
| Precise Focus | 1 | Work Fingers | Crafting without a break gets faster, at a station or in the pocket queue: from 4 s the crafting speed rises, to +50% at 14 s (Walk and Work until 0.8447) |
| Fine Work | 1 | Work Fingers | Tools and gear you craft from now on are Well made: 10% chance a use costs no durability |
| Spare Parts | 1 | Work Fingers | 5% chance an ammo craft gives 1 extra |
| Mender | 2 | Fine Work + Precise Focus | Worn-out gear breaks instead of vanishing. Carry worn gear onto the **Repair** zone under the crafting panel: half its recipe when broken, less the less worn it is |
| Dismantle | 2 | Mender | Carry a tool, weapon or armor onto the **Dismantle** zone under the equipment panel: you get half its recipe back, less the more worn it is |

| Exploring | Cost | Needs | Effect |
|---|---|---|---|
| Treasure Nose | 1 | — | 25% chance a loot chest holds one extra item |
| Prospector | 1 | — | 20% chance of one more ore from every ore block you mine |
| Weathered | 2 | — | +10% cold and heat resistance |
| Pack Rat | 1 | Treasure Nose | Item stacks hold 20 more (99) and block stacks 10 more (60); not the small stacks (0.8442) |
| Hazard Hide | 1 | Prospector + Treasure Nose + Weathered | 30% less damage from falls, lava and cactus |
| Clear Eyes | 1 | Hazard Hide | Fog, sandstorms, murky water, heatstroke blur, nausea sway and the shake of a hit cloud or move your view 30% less |

| Husbandry | Cost | Needs | Effect |
|---|---|---|---|
| Butcher | 1 | — | 20% chance of one more meat (or leather) from animals you kill |
| Preserver | 1 | — | Food you carry spoils 10% slower |
| Lingering | 1 | Preserver | Good food and potion effects last 25% longer |
| Gentle Hand | 2 | Butcher | Taming is 10% faster |
| Saddler | 2 | Gentle Hand | The saddle recipe costs 20% less |
| Lucky Hands | 1 | — | 20% chance of one more flint, stone pebble, berry, mushroom, wheat, melon or cantaloupe slice or pumpkin when you forage (the last five since 0.8442; not off ones you placed) |

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

Pickaxe tiers go flint, stone, iron (gold is the same tier), bronze, then steel. Every gem ore and
diamond need bronze or better; obsidian needs steel. Steel tools and armor took the place of the diamond ones
(0.8454, same strength; one you already had is steel now); there is no recipe for steel yet. Mining
an ore with too weak a pickaxe gives nothing. Iron, copper, tin, gold, diamond and the gem ores glow faintly, so they are easier to spot
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

**Berry bushes (0.827)** come in five kinds, each growing through seven stages in its own look (sprout, small, young,
bush, bare, green fruit, ripe; the young stage and new art for the last three since 0.84778); a picked one drops back to bare and
fruits again. Every berry fills you the same, plus:
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
- **Cows** graze the mild and warm plains, the Savanna and the oak forests (deep ones too) in herds of 2–4, and now and then the cold plains. They drop raw beef and leather. Leather makes the first armor set and the backpack. Use an
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

Craft an **iron hammer** and wear it in the Others slot of the equipment panel, then hold `Q` (or B on a
gamepad) to open a wheel of block shapes. The shape you pick shows right of the hotbar, and blocks
that take it show as that shape in your inventory and in your hand. Each placement uses the block
and 1 point of the hammer's durability; breaking it gives the block back. In creative the wheel
works without a hammer.

The wheel has two pages — turn them with the mouse wheel or a bumper:

- **Simple:** block, slab, vertical slab, stairs, pane, fence, slope, carpet, wall. Bars are named but still in
  development.
- **Advanced:** cover, door, pressure plate, sign, ladder, with five slots waiting.

| Shape | Blocks that take it |
|---|---|
| Slab, vertical slab, stairs | Stone, cobblestone, all planks, terracotta, stone brick, glass, the sandstones, granite, marble, limestone, dolomite, obsidian, wool, sulfur block, hay bale, copper block, dirt, snow block; slabs only: glow dust block, glowcrystal block, the iron, gold, tin, coal, charcoal and gem blocks |
| Pane (a thin plate through the middle) | Wool, glass, all planks, stone, cobblestone, terracotta, granite, marble, limestone, dolomite (every look), the sandstones (every look), glow dust block, glowcrystal block, obsidian, sulfur block, the iron, gold, tin and copper blocks |
| Fence (a post that joins its neighbours, too tall to jump) | All planks, terracotta, copper block |
| Carpet (a layer 1/8 thick) | Wool, all planks, stone, cobblestone, hay bale — plus the stacking set below |
| Cover (a 1/8 plate you walk straight through) | Dirt, grass, stone, cobblestone, all planks, stone brick, granite, marble, limestone, dolomite, the sandstones (not adobe or terracotta) |
| Wall (solid, thin, a full block tall) | Stone, cobblestone, stone brick, terracotta, iron, copper, gold and tin block, granite, marble, limestone, wool, the sandstones, sulfur block, obsidian, snow block |
| Pressure plate (a thin plate on a block's top, walked over) | All planks (pressed by players, creatures and dropped items), stone, cobblestone, granite, marble, limestone, dolomite, the sandstones (players and creatures), the iron, gold, copper and tin blocks and obsidian (players only) |

| Sign (a board you write on, walked through) | All planks, stone, cobblestone, granite, marble, limestone, dolomite, the iron block |
| Slope (a wedge; anything on it slides down) | Every block that takes stairs |
| Ladder (rails and rungs, climbed) | All planks, the iron block, stone, cobblestone, granite, marble, limestone, dolomite, the sandstones |

**Slopes and ladders (0.853).** A slope is placed like stairs, its low edge toward you, upside down from a ceiling.
Nothing stays on one: you slide down faster than you can sprint and shoot a little past its foot, creatures are carried
off it and dropped items roll off. A ladder goes on a block's side, or stands on a floor or hangs from a ceiling; ladders
stacked up and down hold each other, so one fixed to a wall can carry a long run through open air, and a run nothing
holds comes down. Clicking a ladder with a ladder puts the next one on its end (down when you look down). On a ladder
or a vine your look is held toward it; keeping still, one hand holds on and the other is free; climbing, both hands go
hand over hand; sliding down, both hold the rails. Old ladders become oak planks ladders, and mine shafts have them.
Since 0.8533 a ladder's back is a thin board you and creatures cannot walk through. In an inside corner a second ladder
(or vine, or glow vine) goes on the other wall into the same cell; each breaks on its own. Since 0.8534 the two may be different
(an oak ladder and an iron one, a ladder and a vine); a ladder also goes into the cell of a slab, stairs, a carpet or a
plant, like a fence on a slab. Ladders and glow vines in water are climbed (a jungle vine never goes in water; new worlds
have glow vines in flooded caves too), and looking down you slide two and a half times as fast. Climbing a ladder or a vine costs
stamina (half a bare wall's), holding on still a little; out of stamina you slide. Climber takes 30% off both. A ladder is wall bars: narrow,
deep posts with thin rungs through them (0.85342).

**Signs (0.8487).** Put on a floor, a sign stands on a post; on a wall it lies flat against it; on a ceiling it hangs
from two short sticks. Floor and ceiling signs turn to face you. The writing box opens when you put one up, and using
a sign opens it again (sneak to place against a sign instead): four lines, each as long as fits the board, shown at
the board's own size. A sign comes down when the block it is on is broken.

**Pressure plates (0.8486).** Stepped on, a plate goes down and sets off what is beside it, right under it, or under
the block it lies on (0.848792): TNT is lit, and a door opens (not a locked one). A second after the last thing steps
off it comes up, and the doors it opened shut again. Breaking the block under a plate knocks the plate off. TNT sounds
of cloth when put down, and makes its own sound when it is lit. Since 0.848793 a plate also goes down on a bottom slab,
on the lower step of stairs (a half plate, or a quarter by an inner corner), on a carpet or a snow or leaf layer, and
among grass, flowers and other plants, which stay. It is still a block of what it is made of (who presses it, the tool,
the drop), aimed at and broken by itself, and nothing else can be put into its cell while it lies there. The structure
block saves these plates with a prefab. Since 0.848794 a carpet of sand, snow, leaves, gravel or another layer you walk
through, put on a plate, buries it: hidden under the layer (more can be piled on), it is still pressed by feet sinking
through, and silent. Dig the layers away and it is a plate again. A plate's press goes through the block it lies on only
when that block fills its cell down to the one under it (not a top slab or a vertical slab). Sneaking with a block in
hand, the right button places it against a door instead of opening the door. Lit TNT is half as loud (0.8488).

**The pyramid (0.8488).** A sandstone pyramid stands now and then in the Desert and the Red Sand (not their hills, nor
the Deep Desert, which gets a bigger one of its own later); on red sand it is built of red sand and red sandstone.
Since 0.84881 the torches and glow blocks of every structure (villages, dungeons, the igloo, the pyramid) never burn out. In it a sealed golden chest waits
on a pedestal, ringed by pressure plates buried in the sand over TNT. A key or a lock pick works on a chest only from up
close (2.5 blocks), any chest.

**Fire poles (0.84887).** Now and then, wherever trees grow, a fire pole stands: a fence pole with a burning hay bale on
top, the bale cased in cobblestone covers, the pole of the wood of the trees around it (oak, birch, spruce, rime, acacia, palm). Its
fire never spreads and never goes out. A fire on hay saved in a prefab with the structure block is the same: it burns for
good where the prefab is built.

**The Jungle (0.85, new worlds).** Wet patches of the hot land, from the warm plains' hot side through the desert (never
the red sand or the Deep Deserts), are **Jungle**: green and hilly, thick with jungle trees and bushes; its **Deep Jungle**
has more giants, its hills and mountains are **Jungle Hills**. The **jungle trees**: **giants** on a 2x2 trunk (the four
logs drawn as one log twice the size) 18-29 tall, with buttress roots, long limbs and a wide crown; **tall** straight
ones; **small** ones; and low **bent** ones whose trunk turns hard into a limb, the crown out to the side. A jungle
sapling grows any of them, a giant where it has room (the three cells toward +X and +Z free over solid ground). A
hatchet cuts a giant's trunk as the one big log it is (0.8501): the first swing strips all four logs at that height,
then it takes 50 swings to bring the giant down, the big log narrowing with every swing (0.8502). Stripping gives bark
by the log's size: a thin branch now and then, a common trunk once, a giant's trunk about five times as much. Jungle wood has
planks, a stripped and a hollow log. Fire poles have a cover under their hay too (0.8501).
**Cocoa pods** hang high on the straight tall trees' trunks, 7 blocks over the ground or more (not the giants, not the
bent ones): green while they grow, ripe in about a day and a half. Break a ripe one for **cocoa beans** (1, half the
time 2) and a quarter of the time **fat**; a green one gives nothing. A ripe one left too long breaks off by itself; a
pod with no trunk beside it breaks; felling its tree brings every pod on it down (ripe ones give their beans). With
Timber Shaker every swing into its tree may shake a ripe pod off; green ones stay. Not plantable yet. Five beans grind
into **cocoa powder** at the mortar (4.5 s).

**0.8503.** A hay bale broken while a fire burns on it gives nothing. Fire poles are cased in cobblestone covers (new
ones; the posts keep the trees' wood). Gravel gives flint 10% of the time, a block or a layer (0.8504). A monster the sun burns to death
leaves nothing.

**0.8505.** Beds come in acacia too (the variant bar). New worlds grow two and a half times the sugar cane on shores by
the Jungle, the deserts and the Savanna.

**Fences, walls and gates (0.851).**
- **Steps:** a fence or a wall joins one a step up or down beside it with a slanted rail, and you cannot slip through.
- **Stacking:** stacked fences have no gap between them.
- **Walls:** they stand toward the far side of their cell (as you place them) and can be turned. Every kind of planks
  makes walls now.
- **Railings:** put a fence on a bottom slab or on stairs and it stands on them, in their cell; put a wall on stairs and
  it runs along their side. Stairs in a row with one in each make a railing.
- **Gates:** sneak + right-click a fence or a wall with nothing in your hand to make it a gate of the same block.
  Right-click opens and shuts it. Alone it opens from the middle; two side by side open together like double doors. A
  pressure plate opens it too. Break it to have your fence back.
- **Wrench** (creative): right-click a side of a fence or a wall to join or part it there, even to another block; its
  top to turn a wall. It turns stairs, slopes, ladders (a whole column), torches, single chests, furnaces, logs, slabs,
  panes, signs and gates. Sneak +
  right-click: a fence or a wall joins by itself again, and stairs take their next corner shape, kept for good.

**0.8511.** Gates swing open and shut like doors. Walls stand a sixteenth off the cell's edge (in stairs they no longer
flicker). A wall or fence on a step is one smooth slope from post to post. A join you set or take off with the wrench
holds on both sides: the fence beside it follows, and one that loses a join looks for a step up or down instead. The
wrench turns a wall from anywhere on its top, and stairs upside down from their top or bottom (round from a side).

**0.8512.** A fence on a slab joins the fence beside it on the floor or a block up with a half step. A step between two
fences is drawn by both, however they were placed. A wall on stairs stands on the step, as a fence does. A fence goes
into a top slab (posts under it) or a vertical slab (a half block with a fence on its face) too.

**0.8513.** Fences of any planks join each other, and walls of any stone; corner to corner they join with rails turned
45°. A wall at the top of slopes keeps its post. Holding the
wrench, the line under the crosshair says how the block you aim at is set (its facing, side, corner shape or joins, with
their numbers), so you can set another the same.

**0.8514.** A gate stays level; a fence or wall a step from it slopes the whole way down (or up) to it, with no gap. A
wall put on a wall, or against one, stands the same way. A fence joins on its sides and on its corners both: a corner is
left out only where the fence between already joins both ends.

**0.85141.** A whole block beside a corner stops a fence or wall from joining across that corner. The sloped part of a fence
or wall step can now be aimed at and collides where it is drawn. Stone, cobblestone, the rocks and the sandstones take the
fence shape.

**0.85142.** A fence or wall no longer slopes up or down a step through a whole block: one over the lower post or under
the higher one stops the slope.

**0.8515.** More block variants: adobe circle, terracotta soot brick, carved bone, carved sulfur, carved thatch and thatch
brick (thatch's two sit on the hay bale's bar).

**0.8516.** Every kind of planks has a brick variant.

**0.8517.** Polished bone block variant.

**0.852.** Vines hang on the giant jungle trees (new worlds) and grow down over time; climbable. Shears used on a vine cut
it there: it stops growing and what hangs under it comes off. Mossy variants take a vine to place; chests, benches,
beds and furnaces take planks or rock of their kind (see Variants). A metal chest is now a chest and 3 iron, copper or
gold ingots; placing it takes a block of its metal.

**0.8521.** Plates, covers and fences laid in another block's cell give back what their pick took (a mossy one's vine).

**0.8525.** More mossy variants, each taking a vine: adobe, terracotta roof, cobblestone brick, sandstone brick, and dirt
(grass does not grow over mossy dirt).

**0.8526.** Dirt also coarse and frozen. Mossy brick for the sulfur block, thatch, red and pink sandstone and every
planks (each takes a vine).

**0.8527.** Cracked variants: adobe, obsidian, and each sandstone (plain and brick).

**0.8535.** Tigers live alone in the Jungle. One stalks and charges you on sight and hunts any creature when hungry,
eating the raw meat its kill leaves. With raw meat in your hand it comes close but never strikes; give it the meat (use)
and it leaves you alone for 2 minutes (Tiger bond) and gives you Tiger fury (+30% attack speed for 20 s). It takes meat
once every 10 minutes, and a blow always turns it on you. Effects now show their own pictures on the effect bar and in
the list, also for an otter scarf, a meerkat on your shoulder, taming a hellhound or a horse, and riding; the feed and
the XP numbers use the new UI pictures.

**0.8538.** **Golden armor** can be made at the bench: crown, chestplate, leggings, boots and new gauntlets, between
leather and iron (more armor than leather, less than iron, no slow). Each piece is gold lined with leather and set with
one gem (diamond, emerald, ruby, sapphire or topaz); the crown takes 3 pearls instead. A **book** (5 paper, a leather and
a string at the bench), for the bookshelf to come. A tiger you strike stays angry 25 s.

**0.8539.** **The creature book**: use a book on a creature not yet in your book to write it in, for 5000 XP plus 100
for every kind already written (the book is used up; each fish species and the mummy count apart). Books are also found
in loot chests (1 in 4). Kills pay 25% less XP. The full golden set gives +10% XP, and golden armor takes bones too.
Village beds have pale blankets in many colours; they are someone else's: you may sleep in one but it is never your
respawn point, and broken it gives one wool. Your own beds are as before. At a bench or a mortar both hands put away what
they hold and work (in third person too). Drops on the ground give more motes, rising higher, fading as their time runs out.

**0.85391.** In new worlds sugar cane grows as in Minecraft: on sand, grass, dirt or gravel level with the water beside it
(sea, rivers, lakes, oases), standing on top of it, never sunk in a hole by the shore. 0.85392: hold the right button with
a hatchet on a log with bark (a tree's or one you placed) to strip it where it stands: one bark, sometimes two.
0.85393, food: the mushroom stew fills more (55, 35 vegetables, heals 8) and a grilled mushroom less (10, 5 vegetables);
raw meat and fish give about a quarter of cooked and turn your stomach for 20 s (meat 60%, fish 50%); a raw pumpkin pie
gives little and always poisons for 5 s; the golden apple heals 20 (30 with its Rapid regen); a carrot fills a little more.
Fixed: the bowl, bucket or bottle a food or drink gives back no longer vanishes into a hidden slot when your inventory is
full: it goes into your hand when that emptied, else into your inventory, else it drops at your feet.
0.85394: fixed squares of the title screen's land standing in a world near its spawn (stored while the world was opening);
every world's land cache is made again once, and old caches are cleared from the browser's storage.
0.85395: writing a creature into the book takes the use button held 1 s on it (the ring fills). Cows live on the mild and
warm plains and in oak forests, deep ones too (no more on the cold plains or the Savanna).
0.85396: cows graze the Savanna as often as the warm plains again, and the cold plains rarely.
0.85397: tigers are about half as common and live farther apart.

**0.853.** Two new hammer shapes: the slope (you slide down it) and the ladder (planks, iron block, stones). Climbing
ladders and vines: the look is held toward them, and the hands hold on, climb or slide smoothly (see Shapes). 0.8531: the body
climbs too in third person and in split screen, facing the ladder, the head turned to where you look.

**0.8491.** A new quest before the last one: **defeat the Dead Pharaoh** (7500 XP). Both boss quests show a crown
marker on the nearest boss of their kind or its lair (pyramid or castle). In a world made before the pyramids (or with
structures off) the quest passes by itself and still pays. Each boss kind beaten is a stack of **boss boost**, +20% XP
each (one boss x1.2, both x1.4).

**The Dead Pharaoh (0.849), the summer boss.** His **great pyramid** stands, rarely, on the Deep Red Desert Flat (new
worlds), and he waits inside it. Near him (32 blocks) the **summer curse** grows a stack every 5 seconds, up to 20: each
takes 10% off your mining speed (from 10 stacks you cannot mine at all), 2% off your heat resistance and 1% off your
damage reduction, and while it is on you no TNT goes down. Away from him one stack falls every 5 seconds; all of them go
when he dies. He throws **cursed scrolls**, **dashes** at you and shoves you back (then walks slowly back to his place),
and calls up **four mummies** at a time out of the floor, mummies the sun does not burn. At half his health he **rises in
a storm of sand** and comes down enraged: the **pharaoh's curse** fills your eyes with sand for 10 seconds (you see a few
blocks), he and his mummies hit 20% harder, he throws three scrolls at once, and now and then his **golden wand** flies
round him, spinning: it hits and pushes you away. Killed, he gives a level of boss boost, his mummies fall to dust and
both curses lift; his pyramid stays empty. With F3 open, Shift+F8 still calls one in front of you.

**0.84883.** Zombies that rise in the deserts are **mummies**, wrapped in old linen. The summer boss, the **Dead
Pharaoh**, has its look: calm, and enraged from half its health (dark skin, red burning eyes); it does not fight yet
(with F3 open, Shift+F8 calls one). **Middle mouse button**: the block you aim at into your hand: its hotbar slot if it
has one, else (creative) a stack of it, or (survival) the stack you carry moved to the hotbar. **Ctrl + middle button**:
only for a block in your hotbar, picked with the look and the chisel shape of the one you aim at (survival: looks need
the chisel worn, shapes the hammer). TNT blasts 30% wider. Fire on a hay bale smokes; lit in creative, or laid by a
structure, it burns for good without spreading or burning the hay. The structure block's frame marks its middle in
orange.

**0.84884.** New worlds: the **Deep Red Desert Flat**, wide open plains of red sand inside the Deep Red Desert (patches
about 150-250 blocks across, a quarter of it): no tables, ridges, hoodoos or bones, only the desert's low roll. The
summer boss's great pyramid will stand there. The structure block now saves what the signs in it say. Closing or
reloading the page with a world open asks first whether to leave when it has changed since its last save.

Glass shapes are see-through like the full block (0.8261), and since 0.8263 glass shows through other glass from every side. Every look of a block (brick, polished, mossy...) takes exactly the shapes its plain block takes (0.8263).

Two slabs of the same block in one space become the full block again; two slabs of different blocks share the space as a mixed slab, each in its own look (0.8263), and breaking one leaves the other. Glass and glow dust blocks mix too (0.8264): a glass half stays see-through, and a glowing half still lights the area. Snow, leaves, sand, red sand,
gravel and fiber block stack up to 8 carpet layers in one space, in any mix, and you walk through
them; snow cover and leaf litter in the world are these same layers. Breaking takes the top layer:
snow gives a snowball with a shovel, leaves drop what leaves drop, sand, gravel and fiber give
nothing, anything else gives its block back.

A cover placed over a hole becomes a lid flush with the ground; in a doorway (walls both sides) it
sits flush with the wall on your side; anywhere else it lies against the face you clicked. Mobs
fall through it too.

**Covers on other blocks (0.84885)**, like facades in Applied Energistics. A cover can also go into the cell of a
block that is not a whole one (a slab, stairs, a fence, a wall, a pane, a carpet or layer, a chest, a sign, a plant, a
torch, another cover), one on each of the cell's six sides, so a fence or a chest boxed in by six looks like a whole
block. Each one is cut to the room it has: it sits on a slab or a carpet, fills the free part beside a stair's step,
leaves a hole for a fence post's tip, and over a chest it is half as thin. Click a face inside the cell (a fence post, the
top of a slab, a chest's front) and the cover goes on that side of it; click a cover's broad face near one of its edges
to put the next one on that edge's side. A cover keeps its own block: broken by itself, it drops that block. Break what
holds the covers and one of them takes the cell. A chest does not open from the side a cover lies in front of, and not at all
with a cover over its lid. A torch on top no longer counts as covering a chest, a bench, a mortar or a furnace's chimney.
The structure block saves these covers with a prefab.

**The doorway trap (0.84886).** Sand, red sand, gravel or a hay bale resting on a door falls the moment the door opens,
down past the open panel, and stays in the doorway as a whole block: the way is shut. A door something has fallen into
cannot be opened or shut by hand any more (a pressure plate still swings it). Break the block to free the doorway; what
was piled over the door falls in again. Someone standing in the doorway is pushed out of it to their own side as the
block comes down. Sand put on a door already open falls in too, and so does a full pile of sand. A plate on a stair's lower step or on a slab also opens a door one level up beside it (the
top of the stairs). A door picked on the hammer
shows as a door in your hand and in its slot.

## Block variants

The **iron chisel** (bench: 5 iron ingots, 4 copper nuggets, 2 sticks, 1 fiber block, 5 string) is worn in the
Neck slot and unlocks block variants. Since 0.803 only the hammer cuts shapes and only the chisel picks variants.

With a chisel worn in the Neck slot, seven slots above the health bar show the other
looks of the block in your hand, drawn in the picked shape, the plain block in the middle (4th) slot. Hold `R`
and scroll, or hold D-pad Right and press LB / RB, to step through them. Tap `R` or D-pad Right twice to
go back to the plain block. The
pick changes every one of that block you carry (no separate stacks), is not saved, and a variant
breaks back into the plain block. Stone: brick, mossy brick, polished, band, pillar, carved. Cobblestone: mossy, mossy brick.
Dirt: mossy, coarse, frozen.
Sulfur block: brick, carved, mossy brick. Bone block: brick, carved, polished. Granite, marble, limestone, dolomite: brick, mossy brick, polished, band, pillar, carved (a pillar lies along the face you place it on, like a log). Terracotta (the old bricks block): brick, carved, roof, soot brick, mossy roof. Variants take the
same shapes as their plain block. Glass: dark, greenhouse, brick, dark brick. Adobe: brick, carved, circle, mossy, cracked. Each sandstone: brick,
polished, carved, mossy brick, cracked, cracked brick. Snow and ice: brick, snow-ice brick, carved. Obsidian: carved, brick, cracked. Hay bale: thatch, carved thatch, thatch brick, mossy thatch brick. Every planks: brick, mossy brick.
A hay bale falls like sand since 0.8469 and lands whole; thatch and its looks, and hay slabs and stairs, stay where they are put.
Mortar and pestle: a granite, marble or limestone bowl. Gem clusters: a stone, granite, marble, limestone or dolomite bed.
Furnace: granite, marble, limestone or dolomite. Crafting bench: birch, acacia, cherry or dark wood.
Chest: birch or spruce (only two chests of the same wood join into a double chest).
Bed (0.8342): an oak, birch or spruce frame; a new look, half a block tall on four legs.
Since 0.852 some picks take one more thing as they go down, shown under their slot on the bar (dim when you have
none) and in the tooltip, and give it back when broken: every mossy look a vine; a chest, a crafting bench or a bed
(the oak one too) 1 planks of its wood; a furnace (stone too) 1 block of its rock; a metal chest a block of its metal.
Creative takes nothing. Blocks found in the world give nothing extra back. Since 0.8521 a mossy plate, cover or
fence laid in another block's cell gives its vine back too.

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
red sand 3, with the Deep Desert at its hottest heart (0.84). Deep snow is treeless and mostly solid snow. In a new world (0.833) every biome is twice as big again. The level also sets how warm the air feels: a snow biome is about -10°C all year (0.8323), deep snow colder, and falling snow or a blizzard colder still.

**What grows where (0.8233).** Pumpkins in the cold (cold plains, spruce forest), watermelons in the warm plains,
rare cantaloupes and wild wheat patches (4+, twice as many since 0.826, in any growth stage) on mild plains and meadows, sugar cane in stands on warm and hot shores (planted cane starts as a sprout; a stand with water by its foot grows a block taller at a time, up to 5),
berry bushes in forests only (25% more since 0.826, 20% more again in 0.8272; found ripe 20% more often since 0.8441). Picking wheat gives a fiber 10% plus 5% per growth stage, 45% ripe (0.8441); wheat grows through six stages to ripe. The odd oak grows among the spruces; salt crust is a bit commoner by the sea.

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
  (and back), a pillar that turns to the face it is put on, with a bone brick look (0.833). Broken, it gives bones and bone
  ash, not itself (0.84).
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
- **Ladder.** A hammer shape since 0.853, like doors since 0.842 (see above).
- **Block recipes.** Snow, clay, glass, terracotta (from brick items), wool and the glow dust block take 5 of their material; hay bales,
  storage blocks and nuggets-to-ingot take 10.
- **Mortar and pestle.** 20 granite, 1 bone, 2 flint and 1 fiber block at the crafting bench; breaks by
  hand. It works like a crafting bench (pick a recipe, hold `E` to grind, tap `E` to take) but only
  makes powders: glow dust, gunpowder, flour and sugar are made here and nowhere else. The pestle
  circles the bowl while you grind.
- **Bronze.** At the mortar, 2 copper powder and 1 tin powder make 2 bronze powder, which smelts into
  bronze ingots (10 bronze nuggets make an ingot). Bronze tools sit between iron and steel, and a
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
| Basic bow | 10 string, 5 sticks, 12 fiber | Bench |
| Arrows ×2 | 1 flint, 2 sticks, 6 fiber | Inventory |
| Leather backpack | 14 leather, 10 cloth, 8 fiber, 6 copper nuggets | Bench |
| Iron hammer | 1 iron block, 8 copper nuggets, 4 sticks, 2 fiber blocks, 10 string | Bench |

**Cloth** is spun from 20 fiber at the bench and goes into beds, backpacks and metal tools. A
**leather backpack** adds four more rows of carrying space, a **leather belt** two hotbar slots. Both show on
your body: the pack on your back with its straps over the chest, the belt round your waist.

After a death you come back with full health, stamina and oxygen, but food, thirst, energy, fruit, vegetables and protein at 75% (0.833; half in 0.8324). Sleeping in a bed sets your respawn point and, once everyone is in bed, runs the night past as a 10 s time-lapse to sunrise (0.8323; getting up stops it). Stuck? The pause menu's **Respawn** (keep the cursor on it 1 s, then click) kills you on the spot, once every 20 minutes. Hold `Shift` in the crafting list to
craft as many as you can afford in one click.

**Chests** hold 2 rows; a double chest 5. A metal chest 4, a double 9 (0.84825; anything past that falls out when you
open it). The chest's window fits its chest, never taller than the equipment's, and never scrolls.
