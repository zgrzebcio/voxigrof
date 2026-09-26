'use strict';
/* voxiGrof — texture paths (block PNGs in /textures/Blocks/, item PNGs in /textures/Items/) */

const TEXTURES = {
  grass_block_top:  'textures/Blocks/Natures/grass_block_top.png',
  grass_block_side: 'textures/Blocks/Natures/grass_block_side.png',
  dirt:             'textures/Blocks/Natures/dirt.png',
  stone:            'textures/Blocks/Natures/stone.png',
  sand:             'textures/Blocks/Natures/sand_top.png',                // top and bottom; sides below (0.8091)
  sand_side:        'textures/Blocks/Natures/sand_side.png',               // 0.8091
  red_sand_side:    'textures/Blocks/Natures/red_sand_side.png',           // 0.8091
  bedrock:          'textures/Blocks/Natures/bedrock.png',
  oak_log:          'textures/Blocks/Woods/oak/oak_log_side.png',
  oak_log_top:      'textures/Blocks/Woods/oak/oak_log_top.png',
  oak_planks:       'textures/Blocks/Woods/oak/oak_planks.png',
  oak_leaves:       'textures/Blocks/Woods/oak/oak_leaves.png',
  glass:            'textures/Blocks/Decorations/Glass/glass.png',
  water:            'textures/Blocks/Natures/fluids/water_still.png',
  glowstone:        'textures/Blocks/Natures/glowstone.png',
  glow_vine:        'textures/Blocks/Plants/glow_vine.png',            // 0.765
  glowcrystal:      'textures/Blocks/Natures/glow_crystal_block.png',   // 0.765; renamed 0.808
  clay:             'textures/Blocks/Natures/clay.png',
  snow:             'textures/Blocks/Natures/snow.png',
  grass_block_snow: 'textures/Blocks/Natures/grass_block_snow.png',
  cobblestone:      'textures/Blocks/Decorations/cobblestone.png',
  coal_ore:         'textures/Blocks/Ores/coal_ore.png',
  iron_ore:         'textures/Blocks/Ores/iron_ore.png',
  diamond_ore:      'textures/Blocks/Ores/diamond_ore.png',
  // 0.766: gem ores and the cave cobweb (ruby/sapphire recoloured from emerald)
  emerald_ore:      'textures/Blocks/Ores/emerald_ore.png',
  ruby_ore:         'textures/Blocks/Ores/ruby_ore.png',
  sapphire_ore:     'textures/Blocks/Ores/sapphire_ore.png',
  // storage blocks (0.768); ruby and sapphire recoloured from emerald
  coal_block:       'textures/Blocks/Ores/coal_block.png',
  charcoal_block:   'textures/Blocks/Ores/charcoal_block.png',
  iron_block:       'textures/Blocks/Ores/iron_block.png',
  gold_block:       'textures/Blocks/Ores/gold_block.png',
  tin_block:        'textures/Blocks/Ores/tin_block.png',
  copper_block:     'textures/Blocks/Ores/copper_block.png',
  diamond_block:    'textures/Blocks/Ores/diamond_block.png',
  emerald_block:    'textures/Blocks/Ores/emerald_block.png',
  ruby_block:       'textures/Blocks/Ores/ruby_block.png',
  sapphire_block:   'textures/Blocks/Ores/sapphire_block.png',
  raw_iron_block:   'textures/Blocks/Ores/raw_iron_block.png',
  raw_gold_block:   'textures/Blocks/Ores/raw_gold_block.png',
  raw_tin_block:    'textures/Blocks/Ores/raw_tin_block.png',
  raw_copper_block: 'textures/Blocks/Ores/raw_copper_block.png',
  // 0.769: topaz (recoloured from emerald), sandstones, the fiber block and the ladder
  topaz_ore:            'textures/Blocks/Ores/topaz_ore.png',
  topaz_block:          'textures/Blocks/Ores/topaz_block.png',
  sandstone_top:        'textures/Blocks/Decorations/Sandstone/sandstone.png',
  sandstone:            'textures/Blocks/Decorations/Sandstone/sandstone.png',
  sandstone_bottom:     'textures/Blocks/Decorations/Sandstone/sandstone.png',
  red_sandstone_top:    'textures/Blocks/Decorations/Sandstone/red_sandstone.png',
  red_sandstone:        'textures/Blocks/Decorations/Sandstone/red_sandstone.png',
  red_sandstone_bottom: 'textures/Blocks/Decorations/Sandstone/red_sandstone.png',
  fiber_block:          'textures/Blocks/Natures/fibre_block.png',
  ladder:               'textures/Blocks/Interactables/ladder.png',
  cobweb:           'textures/Billboards/cobweb.png',
  gravel:           'textures/Blocks/Natures/gravel.png',
  red_mushroom:     'textures/Billboards/Plants/Mushrooms/red_mushroom.png',
  blue_mushroom:    'textures/Billboards/Plants/Mushrooms/blue_mushroom.png',   // 0.7691
  brown_mushroom:   'textures/Billboards/Plants/Mushrooms/brown_mushroom.png',
  crafting_bench_top:   'textures/Blocks/Interactables/Crafting_station/crafting_station_top.png',
  crafting_bench_front: 'textures/Blocks/Interactables/Crafting_station/crafting_station_front.png',
  crafting_bench_side:  'textures/Blocks/Interactables/Crafting_station/crafting_station_side.png',
  torch:                'textures/Billboards/torch.png',
  furnace_front:        'textures/Blocks/Interactables/Furnace/furnace_front.png',
  furnace_front_on:     'textures/Blocks/Interactables/Furnace/furnace_front_lit.png',
  furnace_side:         'textures/Blocks/Interactables/Furnace/furnace_side.png',
  furnace_top:          'textures/Blocks/Interactables/Furnace/furnace_bottom.png',
  furnace_top_open:     'textures/Blocks/Interactables/Furnace/furnace_top.png',   // the chimney on top (0.801); furnace_top is the underside (0.808)
  red_sand:             'textures/Blocks/Natures/red_sand_top.png',
  cactus_side:          'textures/Blocks/Plants/cactus_side.png',
  cactus_top:           'textures/Blocks/Plants/cactus_top.png',
  cactus_bottom:        'textures/Blocks/Plants/cactus_bottom.png',
  oak_door:             'textures/Blocks/Interactables/Oak_door.png',   // not in the atlas — used by the door mesh + icon
  // bed: also outside the atlas, sampled directly by the bed mesh in 29-bed.js
  bed_top:              'textures/Blocks/Interactables/white_bed_top.png',    // 128x64, spans both halves
  bed_long:             'textures/Blocks/Interactables/white_bed_front.png',  // 128x64, the long side
  bed_end:              'textures/Blocks/Interactables/white_bed_side.png',   // 64x64, head/foot cap
  bed_leg:              'textures/Blocks/Interactables/bed_leg.png',
  bed_down:             'textures/Blocks/Interactables/bed_down.png',         // underside of the legs
  // chest: also outside the atlas, sampled directly by the chest mesh in 30-chest.js
  chest_top:            'textures/Blocks/Interactables/Chest/chest_top.png',
  chest_bottom:         'textures/Blocks/Interactables/Chest/chest_bottom.png',
  chest_side:           'textures/Blocks/Interactables/Chest/chest_side.png',
  chest_front:          'textures/Blocks/Interactables/Chest/chest_front.png',
  melon_top:            'textures/Blocks/Plants/watermelon_top.png',
  melon_side:           'textures/Blocks/Plants/watermelon_side.png',
  bricks:               'textures/Blocks/Decorations/Clay/terracotta.png',
  stone_brick:          'textures/Blocks/Decorations/Stone/stone_bricks.png',
  // variant looks (0.7941); the granite, marble and limestone bricks were made from stone_bricks' layout
  mossy_stone_brick:    'textures/Blocks/Decorations/Stone/mossy_stone_bricks.png',
  cracked_stone_brick:  'textures/Blocks/Decorations/Stone/stone_bricks.png',
  mossy_cobblestone:    'textures/Blocks/Decorations/mossy_cobblestone.png',
  sulfur_bricks:        'textures/Blocks/Decorations/sulfur_bricks.png',
  granite_bricks:       'textures/Blocks/Decorations/Granite/granite_bricks.png',
  marble_bricks:        'textures/Blocks/Decorations/Marble/marble_bricks.png',
  limestone_bricks:     'textures/Blocks/Decorations/Limestone/limestone_bricks.png',
  birch_log:            'textures/Blocks/Woods/birch/birch_log_side.png',
  birch_log_top:        'textures/Blocks/Woods/birch/birch_log_top.png',
  birch_planks:         'textures/Blocks/Woods/birch/birch_planks.png',
  birch_leaves:         'textures/Blocks/Woods/birch/birch_leaves.png',
  grass:                'textures/Billboards/Plants/short_grass.png',
  wheat_full:           'textures/Billboards/Plants/Wheat/wheat_full.png',
  wool:                 'textures/Blocks/Natures/wool.png',
  pumpkin_top:          'textures/Blocks/Plants/pumpkin_top.png',
  pumpkin_side:         'textures/Blocks/Plants/pumpkin_side.png',
  hay_top:              'textures/Blocks/Plants/hay_bale_top.png',
  hay_side:             'textures/Blocks/Plants/hay_bale_side.png',
  marble:               'textures/Blocks/Natures/marble.png',
  granite:              'textures/Blocks/Natures/granite.png',
  limestone:            'textures/Blocks/Natures/limestone.png',
  poppy:                'textures/Billboards/Plants/Flowers/poppy.png',
  orchid:               'textures/Billboards/Plants/Flowers/blue_orchid.png',
  tallgrass:            'textures/Billboards/Plants/tall_grass.png',
  tin_ore:              'textures/Blocks/Ores/tin_ore.png',
  copper_ore:           'textures/Blocks/Ores/copper_ore.png',
  gold_ore:             'textures/Blocks/Ores/gold_ore.png',
  lava:                 'textures/Blocks/Natures/fluids/lava_still.png',
  obsidian:             'textures/Blocks/Natures/obsidian.png',
  tnt_top:              'textures/Blocks/Interactables/tnt_top.png',
  tnt_side:             'textures/Blocks/Interactables/tnt_side.png',
  tnt_bottom:           'textures/Blocks/Interactables/tnt_bottom.png',
  sulfur_block:         'textures/Blocks/Natures/sulfur_block.png',
  sulfur_down_tip:      'textures/Billboards/sulfur_down_tip.png',
  sulfur_up_tip:        'textures/Billboards/sulfur_up_tip.png',
  sugar_cane:           'textures/Billboards/Plants/sugar_cane.png',
  oak_sapling:          'textures/Billboards/Plants/Saplings/oak_sapling.png',
  birch_sapling:        'textures/Billboards/Plants/Saplings/birch_sapling.png',
  stripped_oak_log:         'textures/Blocks/Woods/oak/oak_stripped_log_side.png',
  stripped_oak_log_top:     'textures/Blocks/Woods/oak/oak_stripped_log_top.png',
  stripped_birch_log:       'textures/Blocks/Woods/birch/birch_stripped_log_side.png',
  stripped_birch_log_top:   'textures/Blocks/Woods/birch/birch_stripped_log_top.png',
  spruce_log:               'textures/Blocks/Woods/spruce/spruce_log_side.png',
  spruce_log_top:           'textures/Blocks/Woods/spruce/spruce_log_top.png',
  spruce_planks:            'textures/Blocks/Woods/spruce/spruce_planks.png',
  spruce_leaves:            'textures/Blocks/Woods/spruce/spruce_leaves.png',
  spruce_sapling:           'textures/Billboards/Plants/Saplings/spruce_sapling.png',
  stripped_spruce_log:      'textures/Blocks/Woods/spruce/spruce_stripped_log_side.png',
  stripped_spruce_log_top:  'textures/Blocks/Woods/spruce/spruce_stripped_log_top.png',
  pincushions:              'textures/Billboards/Plants/Flowers/pincushions.png',
  structure_block:          'textures/Blocks/Interactables/Structure_block.png',
  /* Berry bush: FOUR growth stages and two fruit colours, all one block driven by its variant
     byte. Small and empty carry no fruit, so red and blue share those two sheets; only the ripe
     stage differs. Art moved into its own folder in 0.733. */
  berry_bush_small:         'textures/Billboards/Plants/Berry_bush/berry_bush_small.png',
  berry_bush_empty:         'textures/Billboards/Plants/Berry_bush/empty_berry_bush_.png',
  berry_bush_fruitling:     'textures/Billboards/Plants/Berry_bush/fruitling_berry_bush_.png',
  berry_bush_red:           'textures/Billboards/Plants/Berry_bush/redberry_bush.png',
  berry_bush_blue:          'textures/Billboards/Plants/Berry_bush/blueberry_bush.png',
  berry_bush_yellow:        'textures/Billboards/Plants/Berry_bush/blackberry_bush.png',   // 0.7947, from the red one
  // flint stone (0.732) — PLACEHOLDER art: blackstone, which was already in the repo and unused.
  // Swap both of these for a real flint texture when one exists; nothing else has to change.
  flint_rock:               'textures/Blocks/Natures/blackstone_side.png',
  flint_rock_top:           'textures/Blocks/Natures/blackstone_top.png',
  // dolomite and the mossy and polished rocks (0.809)
  dolomite:                 'textures/Blocks/Natures/dolomite.png',
  dolomite_bricks:          'textures/Blocks/Decorations/Dolomite/dolomite_bricks.png',
  mossy_dolomite_bricks:    'textures/Blocks/Decorations/Dolomite/mossy_dolomite_bricks.png',
  polished_dolomite:        'textures/Blocks/Decorations/Dolomite/polished_dolomite.png',
  mossy_granite_bricks:     'textures/Blocks/Decorations/Granite/mossy_granite_bricks.png',
  mossy_marble_bricks:      'textures/Blocks/Decorations/Marble/mossy_marble_bricks.png',
  mossy_limestone_bricks:   'textures/Blocks/Decorations/Limestone/mossy_limestone_bricks.png',
  polished_granite:         'textures/Blocks/Decorations/Granite/polished_granite.png',
  polished_marble:          'textures/Blocks/Decorations/Marble/polished_marble.png',
  polished_limestone:       'textures/Blocks/Decorations/Limestone/polished_limestone.png',
  // the stone furnace's chimney and the oak bench's underside (0.809)
  chimney_side:             'textures/Blocks/Interactables/Furnace/chimney_side.png',
  chimney_top:              'textures/Blocks/Interactables/Furnace/chimney_top.png',
  crafting_bench_bottom:    'textures/Blocks/Interactables/Crafting_station/crafting_station_bottom.png',
  // the chest's metal fittings, laid over the tinted wood, and the two halves of a double chest (0.809)
  chest_top_metal:          'textures/Blocks/Interactables/Chest/chest_top_metal.png',
  chest_front_metal:        'textures/Blocks/Interactables/Chest/chest_front_metal.png',
  chest_side_metal:         'textures/Blocks/Interactables/Chest/chest_side_metal.png',
};
/* A furnace per rock and a crafting bench per wood (0.809). The first entry of each list is the block's
   own look, already above; the others are built from their folders. 03-atlas.js adds them to the atlas
   in this order, and T in 02-voxel-core.js numbers them the same way. */
const FURNACE_ROCKS = ['stone', 'granite', 'marble', 'limestone', 'dolomite'];
const FURNACE_PARTS = ['front', 'front_lit', 'side', 'top', 'bottom', 'chimney_side', 'chimney_top'];
const furnaceTileName = (rock, part) => `furnace_${rock}_${part}`;
for (const r of FURNACE_ROCKS.slice(1))
  for (const p of FURNACE_PARTS)
    TEXTURES[furnaceTileName(r, p)] = `textures/Blocks/Interactables/Furnace/${r}/` +
      (p.startsWith('chimney_') ? `chimney_${r}_${p.slice(8)}` : `furnace_${r}_${p}`) + '.png';
// 0.8091: polished stone, adobe, the glass looks, salt crust, cantaloupe
Object.assign(TEXTURES, {
  polished_stone:    'textures/Blocks/Decorations/Stone/polished_stone.png',
  adobe:             'textures/Blocks/Decorations/Clay/adobe.png',
  adobe_brick:       'textures/Blocks/Decorations/Clay/adobe_brick.png',
  dark_glass:        'textures/Blocks/Decorations/Glass/dark_glass.png',
  greenhouse_glass:  'textures/Blocks/Decorations/Glass/greenhouse_glass.png',
  glass_bricks:      'textures/Blocks/Decorations/Glass/glass_bricks.png',
  dark_glass_bricks: 'textures/Blocks/Decorations/Glass/dark_glass_bricks.png',
  salt_crust:        'textures/Blocks/Natures/salt_crust.png',
  cantaloupe_side:   'textures/Blocks/Plants/cantaloupe_side.png',
  cantaloupe_top:    'textures/Blocks/Plants/cantaloupe_top.png',
  cantaloupe_bottom: 'textures/Blocks/Plants/cantaloupe_bottom.png',
});
/* Mushrooms are box models since 0.8091 (textures/Blocks/mushrooms/<kind>/<kind>_mushroom.json). Their art is
   drawn at 8 texels per model pixel, so a cap side is 80x32: 03-atlas.js lays these at their own size in the
   corner of a layer (MUSHROOM_NATIVE) rather than stretching them, and the mesher maps them 1:1. */
/* ---- built tiles (0.8093) ----
   Some tiles are no longer one file but a base with an overlay laid on it, made when the atlas is built
   (03-atlas.js): the grass side is dirt with the grass fringe tinted the grass colour (or white for the
   snowy side), and a gem ore is stone with its gems. [base, overlay, tint]: tint 'grass' is the colour
   sampled from grass_side_item, 'snow' turns the fringe white, null lays the overlay as it is. */
Object.assign(TEXTURES, {
  grass_side_base:    'textures/Blocks/Natures/grass_block_side.png',
  grass_side_overlay: 'textures/Blocks/Natures/Overlays/grass_side_overlay.png',
  grass_side_item:    'textures/Blocks/Natures/grass_side_item.png',   // only read for the grass colour
});
const COMPOSITE_TILES = {
  grass_block_side: ['grass_side_base', 'grass_side_overlay', 'grass'],
  grass_block_snow: ['grass_side_base', 'grass_side_overlay', 'snow'],
};
for (const gem of ['diamond', 'emerald', 'ruby', 'sapphire', 'topaz']) {
  TEXTURES[gem + '_ore_overlay'] = `textures/Blocks/Ores/Overlays/${gem}_ore_overlay.png`;
  COMPOSITE_TILES[gem + '_ore'] = ['stone', gem + '_ore_overlay', null];
}
for (const k in COMPOSITE_TILES) delete TEXTURES[k];   // built, not fetched
/* ---- animated tiles (0.8093) ----
   A vertical strip of square frames (textures/Blocks/Natures/fluids/*.json gives the timing). Frame 0 is the
   tile's own layer; the rest go on the end of the texture array and a lookup texture swaps them in
   (03-atlas.js, 04-materials.js). Any tile can be animated by listing it here. */
Object.assign(TEXTURES, {
  water_flow: 'textures/Blocks/Natures/fluids/water_flow.png',
  lava_flow:  'textures/Blocks/Natures/fluids/lava_flow.png',
  // terracotta's brick look (0.8093; the old clay bricks block is terracotta now)
  terracotta_bricks: 'textures/Blocks/Decorations/Clay/terracotta_bricks.png',
});
const ANIMATED_TILES = {
  water:      { frames: 16, ms: 150 },
  water_flow: { frames: 16, ms: 150 },
  lava:       { frames: 16, ms: 220 },
  lava_flow:  { frames: 16, ms: 220 },
};
/* ---- glowing parts (0.8094) ----
   A light source's glowing pixels draw at full brightness whatever the light around them. The mask is a
   white-on-clear overlay (its alpha is the glow); 'auto' builds one from the tile's own bright, warm pixels
   for the art that has no overlay (a torch's flame, a lit furnace's fire, the lava mushroom's cap). */
Object.assign(TEXTURES, {
  glowstone_emissive:          'textures/Blocks/Natures/Overlays/glowstone_emissive.png',
  glow_crystal_block_emissive: 'textures/Blocks/Natures/Overlays/glow_crystal_block_emissive.png',
  glow_vine_emissive:          'textures/Blocks/Plants/Overlays/glow_vine_emissive.png',
});
const EMISSIVE_TILES = {
  glowstone:   'glowstone_emissive',
  glowcrystal: 'glow_crystal_block_emissive',
  glow_vine:   'glow_vine_emissive',
  torch:       'auto',
  furnace_front_on: 'auto',
  mushroom_lava_cap_top: 'auto', mushroom_lava_cap_side: 'auto',
};
for (const r of FURNACE_ROCKS.slice(1)) EMISSIVE_TILES[furnaceTileName(r, 'front_lit')] = 'auto';   // every rock's fire
// band and pillar for every rock (0.8093), in their rock's Decorations folder
const DECOR_ROCKS = ['stone', 'granite', 'marble', 'limestone', 'dolomite'];
const DECOR_PARTS = ['band_side', 'band_top', 'pillar_side', 'pillar_top'];
for (const r of DECOR_ROCKS)
  for (const p of DECOR_PARTS)
    TEXTURES[`${r}_${p}`] = `textures/Blocks/Decorations/${r[0].toUpperCase() + r.slice(1)}/${r}_${p}.png`;
const MUSHROOM_KINDS = ['red', 'brown', 'blue', 'black', 'lava', 'white_tall'];
const MUSHROOM_PARTS = ['cap_top', 'cap_side', 'cap_bottom', 'stem_side', 'stem_top'];
const mushroomTileName = (kind, part) => `mushroom_${kind}_${part}`;
for (const k of MUSHROOM_KINDS)
  for (const p of MUSHROOM_PARTS) TEXTURES[mushroomTileName(k, p)] = `textures/Blocks/mushrooms/${k}/${p}.png`;
const BENCH_WOODS = ['oak', 'birch', 'acacia', 'cherry', 'dark'];
const BENCH_PARTS = ['top', 'front', 'side', 'bottom'];
const benchTileName = (wood, part) => `crafting_station_${wood}_${part}`;
for (const w of BENCH_WOODS.slice(1))
  for (const p of BENCH_PARTS)
    TEXTURES[benchTileName(w, p)] = `textures/Blocks/Interactables/Crafting_station/${benchTileName(w, p)}.png`;
for (const part of ['top', 'front', 'bottom'])
  for (const side of ['left', 'right']) {
    TEXTURES[`chest_double_${part}_${side}`] = `textures/Blocks/Interactables/Chest/chest_double_${part}_${side}.png`;
    if (part !== 'bottom')
      TEXTURES[`chest_double_${part}_${side}_metal`] = `textures/Blocks/Interactables/Chest/chest_double_${part}_${side}_metal.png`;
  }

const ITEM_TEXTURES = {
  stick:       'textures/Items/Materials/stick.png',
  bark:        'textures/Items/Materials/bark.png',
  coal:        'textures/Items/Ores/coal.png',
  coal_chunk:  'textures/Items/Ores/coal_chunk.png',
  charcoal_chunk: 'textures/Items/Materials/charcoal_chunk.png',   // 0.767
  milk_bucket: 'textures/Items/Consumables/milk_bucket.png',      // 0.767
  raw_iron:    'textures/Items/Ores/iron_ore.png',
  raw_gold:    'textures/Items/Ores/gold_ore.png',
  raw_tin:     'textures/Items/Ores/tin_ore.png',
  raw_copper:  'textures/Items/Ores/copper_ore.png',
  diamond:     'textures/Items/Ores/diamond.png',
  emerald:     'textures/Items/Ores/emerald.png',        // 0.766
  ruby:        'textures/Items/Ores/ruby.png',
  sapphire:    'textures/Items/Ores/sapphire.png',
  topaz:       'textures/Items/Ores/topaz.png',          // 0.769
  // metal powders ground in the mortar (0.773), recoloured from ashes.png
  iron_powder:   'textures/Items/Ores/iron_powder.png',
  tin_powder:    'textures/Items/Ores/tin_powder.png',
  copper_powder: 'textures/Items/Ores/copper_powder.png',
  gold_powder:   'textures/Items/Ores/gold_powder.png',
  bronze_powder: 'textures/Items/Ores/bronze_powder.png',
  steel_powder:  'textures/Items/Ores/steel_powder.png',
  ashes:         'textures/Items/Materials/ash.png',             // 0.775, from the furnace
  chisel:        'textures/Items/Tools/chisel.png',                // 0.78
  hammer:        'textures/Items/Tools/hammer.png',                // 0.788
  bronze_nugget: 'textures/Items/Ores/bronze_nugget.png',          // 0.774
  bronze_ingot:  'textures/Items/Ores/bronze_ingot.png',           // 0.774, recoloured from the iron ingot
  apple:       'textures/Items/Consumables/apple.png',
  flint:       'textures/Items/Materials/flint.png',
  stone_pebble: 'textures/Items/Materials/stone_pebble.png',     // 0.8095
  cantaloupe_slice: 'textures/Items/Consumables/cantaloupe_slice.png',   // 0.8098
  salt_dust:    'textures/Items/Materials/salt_dust.png',        // 0.8097
  clay_ball:   'textures/Items/Materials/clay_ball.png',
  snowball:      'textures/Items/Useables/snowball.png',
  bowl:          'textures/Items/Container/wooden_bowl.png',
  mushroom_stew: 'textures/Items/Consumables/mushroom_stew.png',
  glass_shard:   'textures/Items/Materials/glass_shard.png',
  iron_ingot:    'textures/Items/Ores/iron_ingot.png',
  gold_ingot:    'textures/Items/Ores/gold_ingot.png',
  tin_ingot:     'textures/Items/Ores/tin_ingot.png',
  copper_ingot:  'textures/Items/Ores/copper_ingot.png',
  iron_nugget:   'textures/Items/Ores/iron_nugget.png',
  gold_nugget:   'textures/Items/Ores/gold_nugget.png',
  copper_nugget: 'textures/Items/Ores/copper_nugget.png',
  tin_nugget:    'textures/Items/Ores/tin_nugget.png',
  melon_slice:   'textures/Items/Consumables/melon_slice.png',
  redberries:    'textures/Items/Consumables/redberries.png',
  blueberries:   'textures/Items/Consumables/blueberries.png',
  yellowberries: 'textures/Items/Consumables/blackberries.png',    // 0.7947; blackberries since 0.8099
  brick:         'textures/Items/Materials/brick.png',
  potato:        'textures/Items/Plants/potato.png',
  potato_bake:   'textures/Items/Consumables/baked_potato.png',
  arrow:         'textures/Items/Useables/arrow.png',
  bucket:        'textures/Items/Container/iron_bucket.png',
  water_bucket:  'textures/Items/Container/bucket_normal_water.png',
  lava_bucket:   'textures/Items/Container/bucket_lava.png',
  carrot:        'textures/Items/Consumables/carrot.png',
  wheat:         'textures/Items/Plants/wheat.png',
  iron_shovel:   'textures/Items/Tools/iron_shovel.png',
  iron_pickaxe:  'textures/Items/Tools/iron_pickaxe.png',
  iron_hatchet:  'textures/Items/Tools/iron_hatchet.png',
  iron_hoe:        'textures/Items/Tools/iron_hoe.png',
  flint_shovel:   'textures/Items/Tools/flint_shovel.png',
  flint_pickaxe:  'textures/Items/Tools/flint_pickaxe.png',
  flint_hatchet:  'textures/Items/Tools/flint_hatchet.png',
  flint_hoe:      'textures/Items/Tools/flint_hoe.png',
  stone_shovel:    'textures/Items/Tools/stone_shovel.png',
  stone_pickaxe:   'textures/Items/Tools/stone_pickaxe.png',
  stone_hatchet:   'textures/Items/Tools/stone_hatchet.png',
  stone_hoe:       'textures/Items/Tools/stone_hoe.png',
  // bronze tools (0.774), recoloured from the stone ones
  bronze_shovel:   'textures/Items/Tools/bronze_shovel.png',
  bronze_pickaxe:  'textures/Items/Tools/bronze_pickaxe.png',
  bronze_hatchet:  'textures/Items/Tools/bronze_hatchet.png',
  bronze_hoe:      'textures/Items/Tools/bronze_hoe.png',
  golden_pickaxe:  'textures/Items/Tools/golden_pickaxe.png',
  golden_hatchet:  'textures/Items/Tools/golden_hatchet.png',
  golden_shovel:   'textures/Items/Tools/golden_shovel.png',
  golden_hoe:      'textures/Items/Tools/golden_hoe.png',
  diamond_shovel:  'textures/Items/Tools/diamond_shovel.png',
  diamond_pickaxe: 'textures/Items/Tools/diamond_pickaxe.png',
  diamond_hatchet: 'textures/Items/Tools/diamond_hatchet.png',
  diamond_hoe:     'textures/Items/Tools/diamond_hoe.png',
  pumpkin_pie:     'textures/Items/Consumables/raw_pumpkin_pie.png',      // the raw pie since 0.761
  cooked_pumpkin_pie: 'textures/Items/Consumables/cooked_pumpkin_pie.png',
  gunpowder:       'textures/Items/Materials/gunpowder.png',
  charcoal:        'textures/Items/Materials/charcoal.png',
  sulfur:          'textures/Items/Materials/sulfur.png',
  sugarcane:       'textures/Items/Plants/sugarcane.png',
  sugar:           'textures/Items/Materials/sugar.png',
  paper:           'textures/Items/Materials/paper.png',
  book:            'textures/Items/Materials/book.png',
  flour:           'textures/Items/Materials/flour.png',
  bread:           'textures/Items/Consumables/bread.png',
  golden_apple:    'textures/Items/Consumables/golden_apple.png',
  glow_dust:       'textures/Items/Materials/glow_dust.png',
  glow_crystals:   'textures/Items/Materials/glow_crystals.png',      // 0.765
  flint_sword:     'textures/Items/Weapons/flint_sword.png',
  stone_sword:     'textures/Items/Weapons/stone_sword.png',
  bronze_sword:    'textures/Items/Weapons/bronze_sword.png',        // 0.774
  iron_sword:      'textures/Items/Weapons/iron_sword.png',
  golden_sword:    'textures/Items/Weapons/golden_sword.png',
  diamond_sword:   'textures/Items/Weapons/diamond_sword.png',
  bow:             'textures/Items/Weapons/bow.png',
  shield:          'textures/Items/Weapons/shield.png',
  shield_back:     'textures/Items/Weapons/shield_back.png',   // the held side, drawn on the in-hand model
  arrow:           'textures/Items/Weapons/arrow.png',
  bone:            'textures/Items/Materials/bone.png',
  string:          'textures/Items/Materials/string.png',
  fiber:           'textures/Items/Materials/fiber.png',
  cloth:           'textures/Items/Materials/cloth.png',
  iron_shears:     'textures/Items/Tools/iron_shears.png',
  feather:         'textures/Items/Materials/feather.png',
  mutton:          'textures/Items/Consumables/mutton.png',
  rotten_flesh:    'textures/Items/Materials/rotten_flesh.png',
  cooked_mutton:   'textures/Items/Consumables/cooked_mutton.png',
  leather:         'textures/Items/Materials/leather.png',
  beef:            'textures/Items/Consumables/beef.png',
  cooked_beef:     'textures/Items/Consumables/cooked_beef.png',
  pork:            'textures/Items/Consumables/pork.png',            // 0.789
  cooked_pork:     'textures/Items/Consumables/cooked_pork.png',     // 0.789
  cod:             'textures/Items/Consumables/cod.png',             // fish, 0.805
  cooked_cod:      'textures/Items/Consumables/cooked_cod.png',
  salmon:          'textures/Items/Consumables/salmon.png',
  cooked_salmon:   'textures/Items/Consumables/cooked_salmon.png',
  pike:            'textures/Items/Consumables/pike.png',
  cooked_pike:     'textures/Items/Consumables/cooked_pike.png',
  catfish:         'textures/Items/Consumables/catfish.png',
  cooked_catfish:  'textures/Items/Consumables/cooked_catfish.png',
  fat:             'textures/Items/Materials/fat.png',               // 0.789
  saddle:          'textures/Items/Useables/saddle.png',
  leather_helmet:     'textures/Items/Equipments/leather_helmet.png',
  leather_chestplate: 'textures/Items/Equipments/leather_chestplate.png',
  leather_leggings:   'textures/Items/Equipments/leather_leggings.png',
  leather_boots:      'textures/Items/Equipments/leather_boots.png',
  leather_gloves:     'textures/Items/Equipments/leather_gloves.png',
  iron_helmet:        'textures/Items/Equipments/iron_helmet.png',
  iron_chestplate:    'textures/Items/Equipments/iron_chestplate.png',
  iron_leggings:      'textures/Items/Equipments/iron_leggings.png',
  iron_boots:         'textures/Items/Equipments/iron_boots.png',
  iron_gloves:        'textures/Items/Equipments/iron_gloves.png',
  belt:               'textures/Items/Equipments/belt.png',
  backpack:           'textures/Items/Equipments/backpack.png',
  golden_helmet:      'textures/Items/Equipments/golden_helmet.png',
  golden_chestplate:  'textures/Items/Equipments/golden_chestplate.png',
  golden_leggings:    'textures/Items/Equipments/golden_leggings.png',
  golden_boots:       'textures/Items/Equipments/golden_boots.png',
  diamond_helmet:     'textures/Items/Equipments/diamond_helmet.png',
  diamond_chestplate: 'textures/Items/Equipments/diamond_chestplate.png',
  diamond_leggings:   'textures/Items/Equipments/diamond_leggings.png',
  diamond_boots:      'textures/Items/Equipments/diamond_boots.png',
};

/* Armor overlay sheets drawn on the equipment preview. 64x32 skin-layer layout (at 4x here):
   <mat>_tophalf = helmet + chestplate, <mat>_downhalf = leggings + boots. */
const EQUIP_TEXTURES = {
  iron_tophalf:     'textures/Entity/equipment/iron_tophalf.png',
  iron_downhalf:    'textures/Entity/equipment/iron_downhalf.png',
  leather_tophalf:  'textures/Entity/equipment/leather_tophalf.png',
  leather_downhalf: 'textures/Entity/equipment/leather_downhalf.png',
};
