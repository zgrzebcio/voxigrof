'use strict';
/* voxiGrof — texture paths (block PNGs in /textures/Blocks/, item PNGs in /textures/Items/) */

const TEXTURES = {
  grass_block_top:  'textures/Blocks/Natures/Ground/grass_block_top.png',
  grass_block_side: 'textures/Blocks/Natures/Ground/grass_block_side.png',
  dirt:             'textures/Blocks/Natures/Ground/dirt.png',
  sandy_dirt:       'textures/Blocks/Natures/Ground/sandy_dirt.png',
  stone:            'textures/Blocks/Natures/Underground/stone.png',
  sand:             'textures/Blocks/Natures/Sands/sand_top.png',                // top and bottom; sides below
  sand_side:        'textures/Blocks/Natures/Sands/sand_side.png',               // 0.8091
  red_sand_side:    'textures/Blocks/Natures/Sands/red_sand_side.png',           // 0.8091
  bedrock:          'textures/Blocks/Natures/Underground/bedrock.png',
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
  snow:             'textures/Blocks/Natures/Winter/snow.png',   // Winter folder since 0.8321
  ice:              'textures/Blocks/Natures/Winter/ice.png',    // 0.8321
  packed_ice:       'textures/Blocks/Natures/Winter/packed_ice.png',   // 0.835
  // ice and snow bricks, the snow-ice brick; the bone block and its brick
  ice_bricks:       'textures/Blocks/Decorations/Winter/ice_bricks.png',
  snow_bricks:      'textures/Blocks/Decorations/Winter/snow_bricks.png',
  snow_ice_bricks:  'textures/Blocks/Decorations/Winter/snow_ice_bricks.png',
  bone_block_side:  'textures/Blocks/Natures/bone_block_side.png',
  bone_block_top:   'textures/Blocks/Natures/bone_block_top.png',
  bone_bricks:      'textures/Blocks/Decorations/bone/bone_bricks.png',
  grass_block_snow: 'textures/Blocks/Natures/grass_block_snow.png',
  cobblestone:      'textures/Blocks/Decorations/Cobblestone/cobblestone.png',
  coal_ore:         'textures/Blocks/Ores/coal_ore.png',
  iron_ore:         'textures/Blocks/Ores/iron_ore.png',
  diamond_ore:      'textures/Blocks/Ores/diamond_ore.png',
  // gem ores and the cave cobweb (ruby/sapphire recoloured from emerald)
  emerald_ore:      'textures/Blocks/Ores/emerald_ore.png',
  ruby_ore:         'textures/Blocks/Ores/ruby_ore.png',
  sapphire_ore:     'textures/Blocks/Ores/sapphire_ore.png',
  // storage blocks; ruby and sapphire recoloured from emerald
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
  // topaz (recoloured from emerald), sandstones, the fiber block and the ladder
  topaz_ore:            'textures/Blocks/Ores/topaz_ore.png',
  topaz_block:          'textures/Blocks/Ores/topaz_block.png',
  sandstone_top:        'textures/Blocks/Decorations/Sandstone/sandstone.png',
  sandstone:            'textures/Blocks/Decorations/Sandstone/sandstone.png',
  sandstone_bottom:     'textures/Blocks/Decorations/Sandstone/sandstone.png',
  red_sandstone_top:    'textures/Blocks/Decorations/Sandstone/red_sandstone.png',
  red_sandstone:        'textures/Blocks/Decorations/Sandstone/red_sandstone.png',
  red_sandstone_bottom: 'textures/Blocks/Decorations/Sandstone/red_sandstone.png',
  // pink sand and its sandstone, and the brick and polished looks of all three
  pink_sand:               'textures/Blocks/Natures/Sands/pink_sand_top.png',
  pink_sand_side:          'textures/Blocks/Natures/Sands/pink_sand_side.png',
  glassy_sand:             'textures/Blocks/Natures/Sands/glassy_sand.png',        // lightning-struck sand
  glassy_red_sand:         'textures/Blocks/Natures/Sands/glassy_red_sand.png',    // ...red and pink
  glassy_pink_sand:        'textures/Blocks/Natures/Sands/glassy_pink_sand.png',
  pink_sandstone:          'textures/Blocks/Decorations/Sandstone/pink_sandstone.png',
  sandstone_bricks:        'textures/Blocks/Decorations/Sandstone/sandstone_bricks.png',
  polished_sandstone:      'textures/Blocks/Decorations/Sandstone/polished_sandstone.png',
  red_sandstone_bricks:    'textures/Blocks/Decorations/Sandstone/red_sandstone_bricks.png',
  polished_red_sandstone:  'textures/Blocks/Decorations/Sandstone/polished_red_sandstone.png',
  pink_sandstone_bricks:   'textures/Blocks/Decorations/Sandstone/pink_sandstone_bricks.png',
  polished_pink_sandstone: 'textures/Blocks/Decorations/Sandstone/polished_pink_sandstone.png',
  fiber_block:          'textures/Blocks/Natures/fibre_block.png',
  ladder:               'textures/Blocks/Interactables/ladder.png',
  cobweb:           'textures/Billboards/cobweb/cobweb.png',
  cobweb_tangled:   'textures/Billboards/cobweb/cobweb_tangled.png',
  cobweb_corner:    'textures/Billboards/cobweb/cobweb_corner.png',
  gravel:           'textures/Blocks/Natures/Ground/gravel.png',
  // red_mushroom, blue_mushroom, brown_mushroom: cut from their sheets since 0.821 (CROP_TILES, below)
  crafting_bench_top:   'textures/Blocks/Interactables/Crafting_station/crafting_station_top.png',
  crafting_bench_front: 'textures/Blocks/Interactables/Crafting_station/crafting_station_front.png',
  crafting_bench_side:  'textures/Blocks/Interactables/Crafting_station/crafting_station_side.png',
  // the old torch's tile (T.TORCH) is no longer drawn by anything: its art went in 0.8341, so it shows the fire torch
  torch:                'textures/Blocks/Interactables/Torch/torch_fire.png',
  // the fire torch (the old torch's place), the unlit torch, the crystal torch, at 128px (own folder 0.8341)
  torch_fire:           'textures/Blocks/Interactables/Torch/torch_fire.png',
  torch_unlit:          'textures/Blocks/Interactables/Torch/torch_unlit.png',
  torch_crystal:        'textures/Blocks/Interactables/Torch/torch_crystal.png',
  furnace_front:        'textures/Blocks/Interactables/Furnace/furnace_front.png',
  furnace_front_on:     'textures/Blocks/Interactables/Furnace/furnace_front_lit.png',
  furnace_side:         'textures/Blocks/Interactables/Furnace/furnace_side.png',
  furnace_top:          'textures/Blocks/Interactables/Furnace/furnace_bottom.png',
  furnace_top_open:     'textures/Blocks/Interactables/Furnace/furnace_top.png',   // the chimney on top; furnace_top is the underside
  red_sand:             'textures/Blocks/Natures/Sands/red_sand_top.png',
  // the cactus side and top carry their spikes, laid on at atlas build (COMPOSITE_TILES below)
  cactus_side_base:     'textures/Blocks/Plants/cactus_side.png',
  cactus_top_base:      'textures/Blocks/Plants/cactus_top.png',
  cactus_spikes_side:   'textures/Blocks/Plants/Overlays/cactus_spikes_side.png',
  cactus_spikes_top:    'textures/Blocks/Plants/Overlays/cactus_spikes_top.png',
  cactus_bottom:        'textures/Blocks/Plants/cactus_bottom.png',
  oak_door:             'textures/Blocks/Interactables/Oak_door.png',   // not in the atlas — used by the door mesh + icon
  // bed: also outside the atlas, sampled directly by the bed mesh in blocks/bed.js
  // one grey sheet per part, each tinted on its own (frame by its wood, the bedding by colour); layout in 29
  bed_frame:            'textures/Blocks/Interactables/Bed/bed_frame.png',
  bed_blanket:          'textures/Blocks/Interactables/Bed/bed_blanket.png',
  bed_sheet:            'textures/Blocks/Interactables/Bed/bed_sheet.png',
  bed_pillow:           'textures/Blocks/Interactables/Bed/bed_pillow.png',
  // chest: also outside the atlas, sampled directly by the chest mesh in blocks/chest.js. Four sheets since 0.843 (17
  // files before): the grey wood and its metal fittings, each for a single chest and for the two halves of a double;
  // the layouts are CHEST_SHEET in blocks/chest.js
  chest_wood:           'textures/Blocks/Interactables/Chest/chest_wood.png',
  chest_metal:          'textures/Blocks/Interactables/Chest/chest_metal.png',
  chest_wood_double:    'textures/Blocks/Interactables/Chest/chest_wood_double.png',
  chest_metal_double:   'textures/Blocks/Interactables/Chest/chest_metal_double.png',
  melon_top:            'textures/Blocks/Plants/watermelon_top.png',
  melon_side:           'textures/Blocks/Plants/watermelon_side.png',
  bricks:               'textures/Blocks/Decorations/Clay/terracotta.png',
  stone_brick:          'textures/Blocks/Decorations/Stone/stone_bricks.png',
  // variant looks; the granite, marble and limestone bricks were made from stone_bricks' layout
  mossy_stone_brick:    'textures/Blocks/Decorations/Stone/mossy_stone_bricks.png',
  cracked_stone_brick:  'textures/Blocks/Decorations/Stone/stone_bricks.png',
  mossy_cobblestone:    'textures/Blocks/Decorations/Cobblestone/mossy_cobblestone.png',
  sulfur_bricks:        'textures/Blocks/Decorations/Sulfur/sulfur_bricks.png',
  granite_bricks:       'textures/Blocks/Decorations/Granite/granite_bricks.png',
  marble_bricks:        'textures/Blocks/Decorations/Marble/marble_bricks.png',
  limestone_bricks:     'textures/Blocks/Decorations/Limestone/limestone_bricks.png',
  birch_log:            'textures/Blocks/Woods/birch/birch_log_side.png',
  birch_log_top:        'textures/Blocks/Woods/birch/birch_log_top.png',
  birch_planks:         'textures/Blocks/Woods/birch/birch_planks.png',
  birch_leaves:         'textures/Blocks/Woods/birch/birch_leaves.png',
  grass:                'textures/Billboards/Plants/Grass/grass.png',
  short_grass:          'textures/Billboards/Plants/Grass/short_grass.png',          // the smallest grass plant
  wheat_full:           'textures/Billboards/Plants/Wheat/wheat_stage6.png',   // the ripe wheat is stage 6 since 0.8273 (wheat_full.png before)
  wool:                 'textures/Blocks/Decorations/Wool/wool.png',
  pumpkin_top:          'textures/Blocks/Plants/pumpkin_top.png',
  pumpkin_side:         'textures/Blocks/Plants/pumpkin_side.png',
  // carved with shears, lit with a torch
  carved_pumpkin_front: 'textures/Blocks/Plants/carved_pumpkin_front.png',
  carved_pumpkin_top:   'textures/Blocks/Plants/carved_pumpkin_top.png',
  jack_o_lantern_front: 'textures/Blocks/Plants/jack_o_lantern_front.png',
  hay_top:              'textures/Blocks/Plants/hay_bale_top.png',
  hay_side:             'textures/Blocks/Plants/hay_bale_side.png',
  marble:               'textures/Blocks/Natures/Underground/marble.png',
  granite:              'textures/Blocks/Natures/Underground/granite.png',
  limestone:            'textures/Blocks/Natures/Underground/limestone.png',
  poppy:                'textures/Billboards/Plants/Flowers/poppy.png',
  orchid:               'textures/Billboards/Plants/Flowers/blue_orchid.png',
  tallgrass:            'textures/Billboards/Plants/Grass/tall_grass.png',
  tin_ore:              'textures/Blocks/Ores/tin_ore.png',
  copper_ore:           'textures/Blocks/Ores/copper_ore.png',
  gold_ore:             'textures/Blocks/Ores/gold_ore.png',
  lava:                 'textures/Blocks/Natures/fluids/lava_still.png',
  obsidian:             'textures/Blocks/Natures/obsidian.png',
  tnt_top:              'textures/Blocks/Interactables/tnt_top.png',
  tnt_side:             'textures/Blocks/Interactables/tnt_side.png',
  tnt_bottom:           'textures/Blocks/Interactables/tnt_bottom.png',
  sulfur_block:         'textures/Blocks/Natures/Underground/sulfur_block.png',
  sulfur_down_tip:      'textures/Billboards/sulfur_down_tip.png',
  sulfur_up_tip:        'textures/Billboards/sulfur_up_tip.png',
  sugar_cane:           'textures/Billboards/Plants/Sugar_cane/sugar_cane_stage5.png',   // grown, alone
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
  // rime wood: the Coldest Deep Snow's frozen trees
  rime_log:                 'textures/Blocks/Woods/rimewood/rimewood_log_side.png',
  rime_log_top:             'textures/Blocks/Woods/rimewood/rimewood_log_top.png',
  stripped_rime_log:        'textures/Blocks/Woods/rimewood/rimewood_stripped_log_side.png',
  stripped_rime_log_top:    'textures/Blocks/Woods/rimewood/rimewood_stripped_log_top.png',
  rime_planks:              'textures/Blocks/Woods/rimewood/rimewood_planks.png',
  rime_leaves:              'textures/Blocks/Woods/rimewood/rimewood_leaves.png',
  // palm wood: the oases' and warm shores' tree
  palm_log:                 'textures/Blocks/Woods/palm/palm_log_side.png',
  palm_log_top:             'textures/Blocks/Woods/palm/palm_log_top.png',
  stripped_palm_log:        'textures/Blocks/Woods/palm/palm_stripped_log_side.png',
  stripped_palm_log_top:    'textures/Blocks/Woods/palm/palm_stripped_log_top.png',
  palm_planks:              'textures/Blocks/Woods/palm/palm_planks.png',
  palm_leaves:              'textures/Blocks/Woods/palm/palm_leaves.png',
  palm_sapling:             'textures/Billboards/Plants/Saplings/palm_sapling.png',
  // acacia wood: the Savanna's tree
  acacia_log:               'textures/Blocks/Woods/acacia/acacia_log_side.png',
  acacia_log_top:           'textures/Blocks/Woods/acacia/acacia_log_top.png',
  stripped_acacia_log:      'textures/Blocks/Woods/acacia/acacia_stripped_log_side.png',
  stripped_acacia_log_top:  'textures/Blocks/Woods/acacia/acacia_stripped_log_top.png',
  acacia_planks:            'textures/Blocks/Woods/acacia/acacia_planks.png',
  acacia_leaves:            'textures/Blocks/Woods/acacia/acacia_leaves.png',
  acacia_sapling:           'textures/Billboards/Plants/Saplings/acacia_sapling.png',
  cherry_sapling:           'textures/Billboards/Plants/Saplings/cherry_sapling.png',   // no tile: tinted blue into the rime sapling (03-atlas.js)
  // jungle wood: the Jungle's trees (its leaves grey art, tinted in 03-atlas.js)
  jungle_log:               'textures/Blocks/Woods/jungle/jungle_log_side.png',
  jungle_log_top:           'textures/Blocks/Woods/jungle/jungle_log_top.png',
  stripped_jungle_log:      'textures/Blocks/Woods/jungle/jungle_stripped_log_side.png',
  stripped_jungle_log_top:  'textures/Blocks/Woods/jungle/jungle_stripped_log_top.png',
  jungle_planks:            'textures/Blocks/Woods/jungle/jungle_planks.png',
  jungle_leaves:            'textures/Blocks/Woods/jungle/jungle_leaves.png',
  jungle_sapling:           'textures/Billboards/Plants/Saplings/jungle_sapling.png',
  // the desert's dry plants; the tall one is one 2-tall sprite, split in 03-atlas.js like the tall grass
  dry_grass:                'textures/Billboards/Plants/Warm/short_dry_grass.png',
  dry_tall_grass:           'textures/Billboards/Plants/Warm/dry_tall_grass.png',
  dry_bush:                 'textures/Billboards/Plants/Warm/dry_bush.png',
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
  // the flint pebble's model art (its boxes: blocks/plants.js); the seashell's beside it
  flint_rock:               'textures/Blocks/Models/flint_pebble/flint_pebble_side.png',
  flint_rock_top:           'textures/Blocks/Models/flint_pebble/flint_pebble_top.png',
  seashell_side:            'textures/Blocks/Models/seashell/seashell_side.png',
  seashell_top:             'textures/Blocks/Models/seashell/seashell_top.png',
  coconut_side:             'textures/Blocks/Plants/coconut_block_side.png',   // its green look is built from these (03-atlas.js)
  coconut_top:              'textures/Blocks/Plants/coconut_block_top.png',
  cocoa_side:               'textures/Blocks/Plants/cocoa_block_side.png',     // its green look is built from these too
  cocoa_top:                'textures/Blocks/Plants/cocoa_block_top.png',
  seashell_block_side:      'textures/Blocks/Decorations/Seashell/big_seashell_side.png',
  seashell_block_top:       'textures/Blocks/Decorations/Seashell/big_seashell_top.png',
  seashell_block_front:     'textures/Blocks/Decorations/Seashell/big_seashell_front.png',   // its front and its back
  // dolomite and the mossy and polished rocks
  dolomite:                 'textures/Blocks/Natures/Underground/dolomite.png',
  dolomite_bricks:          'textures/Blocks/Decorations/Dolomite/dolomite_bricks.png',
  mossy_dolomite_bricks:    'textures/Blocks/Decorations/Dolomite/mossy_dolomite_bricks.png',
  polished_dolomite:        'textures/Blocks/Decorations/Dolomite/polished_dolomite.png',
  mossy_granite_bricks:     'textures/Blocks/Decorations/Granite/mossy_granite_bricks.png',
  mossy_marble_bricks:      'textures/Blocks/Decorations/Marble/mossy_marble_bricks.png',
  mossy_limestone_bricks:   'textures/Blocks/Decorations/Limestone/mossy_limestone_bricks.png',
  polished_granite:         'textures/Blocks/Decorations/Granite/polished_granite.png',
  polished_marble:          'textures/Blocks/Decorations/Marble/polished_marble.png',
  polished_limestone:       'textures/Blocks/Decorations/Limestone/polished_limestone.png',
  // the stone furnace's chimney and the oak bench's underside
  chimney_side:             'textures/Blocks/Interactables/Furnace/chimney_side.png',
  chimney_top:              'textures/Blocks/Interactables/Furnace/chimney_top.png',
  crafting_bench_bottom:    'textures/Blocks/Interactables/Crafting_station/crafting_station_bottom.png',
};
/* A furnace per rock and a crafting bench per wood. The first entry of each list is the block's
   own look, already above; the others are built from their folders. 03-atlas.js adds them to the atlas
   in this order, and T in blocks/blocks.js numbers them the same way. */
const FURNACE_ROCKS = ['stone', 'granite', 'marble', 'limestone', 'dolomite'];
const FURNACE_PARTS = ['front', 'front_lit', 'side', 'top', 'bottom', 'chimney_side', 'chimney_top'];
const furnaceTileName = (rock, part) => `furnace_${rock}_${part}`;
for (const r of FURNACE_ROCKS.slice(1))
  for (const p of FURNACE_PARTS)
    TEXTURES[furnaceTileName(r, p)] = `textures/Blocks/Interactables/Furnace/${r}/` +
      (p.startsWith('chimney_') ? `chimney_${r}_${p.slice(8)}` : `furnace_${r}_${p}`) + '.png';
// polished stone, adobe, the glass looks, salt crust, cantaloupe
Object.assign(TEXTURES, {
  polished_stone:    'textures/Blocks/Decorations/Stone/polished_stone.png',
  adobe:             'textures/Blocks/Decorations/Clay/adobe.png',
  adobe_brick:       'textures/Blocks/Decorations/Clay/adobe_brick.png',
  dark_glass:        'textures/Blocks/Decorations/Glass/dark_glass.png',
  greenhouse_glass:  'textures/Blocks/Decorations/Glass/greenhouse_glass.png',
  glass_bricks:      'textures/Blocks/Decorations/Glass/glass_bricks.png',
  dark_glass_bricks: 'textures/Blocks/Decorations/Glass/dark_glass_bricks.png',
  salt_crust:        'textures/Blocks/Natures/salt_crust.png',
  ash_block:         'textures/Blocks/Natures/ash_block.png',                // 0.8191
  cantaloupe_side:   'textures/Blocks/Plants/cantaloupe_side.png',
  cantaloupe_top:    'textures/Blocks/Plants/cantaloupe_top.png',
  cantaloupe_bottom: 'textures/Blocks/Plants/cantaloupe_bottom.png',
});
/* Mushrooms are box models since 0.8091 (one sheet per kind since 0.821, MUSHROOM_KINDS below). Their art is
   drawn at 8 texels per model pixel, so a cap side is 80x32: 03-atlas.js lays these at their own size in the
   corner of a layer (MUSHROOM_NATIVE) rather than stretching them, and the mesher maps them 1:1. */
/* ---- built tiles ----
   Some tiles are no longer one file but a base with an overlay laid on it, made when the atlas is built
   (03-atlas.js): the grass side is dirt with the grass fringe tinted the grass colour (or white for the
   snowy side), and a gem ore is stone with its gems. [base, overlay, tint]: tint 'grass' is the grass colour
   (GRASS_RGB in 03-atlas.js), 'snow' turns the fringe white, null lays the overlay as it is. */
Object.assign(TEXTURES, {
  grass_side_base:    'textures/Blocks/Natures/Ground/grass_block_side.png',
  grass_side_overlay: 'textures/Blocks/Natures/Overlays/grass_side_overlay.png',
});
const COMPOSITE_TILES = {
  grass_block_side: ['grass_side_base', 'grass_side_overlay', 'grass'],
  grass_block_snow: ['grass_side_base', 'grass_side_overlay', 'snow'],
  cactus_side: ['cactus_side_base', 'cactus_spikes_side', null],   // spikes
  cactus_top:  ['cactus_top_base',  'cactus_spikes_top',  null],
};
for (const gem of ['diamond', 'emerald', 'ruby', 'sapphire', 'topaz']) {
  TEXTURES[gem + '_ore_overlay'] = `textures/Blocks/Ores/Overlays/${gem}_ore_overlay.png`;
  COMPOSITE_TILES[gem + '_ore'] = ['stone', gem + '_ore_overlay', null];
}
for (const k in COMPOSITE_TILES) delete TEXTURES[k];   // built, not fetched
/* ---- animated tiles ----
   A vertical strip of square frames (textures/Blocks/Natures/fluids/*.json gives the timing). Frame 0 is the
   tile's own layer; the rest go on the end of the texture array and a lookup texture swaps them in
   (03-atlas.js, 04-materials.js). Any tile can be animated by listing it here. */
Object.assign(TEXTURES, {
  water_flow: 'textures/Blocks/Natures/fluids/water_flow.png',
  // the same strip played faster, a steep river's top and a fall's face
  water_flow_fast: 'textures/Blocks/Natures/fluids/water_flow.png',
  water_fall:      'textures/Blocks/Natures/fluids/water_flow.png',
  lava_flow:  'textures/Blocks/Natures/fluids/lava_flow.png',
  // terracotta's brick look (the old clay bricks block is terracotta now)
  terracotta_bricks: 'textures/Blocks/Decorations/Clay/terracotta_bricks.png',
});
/* more variant looks (blocks/looks.js): carved for every rock and sandstone, adobe, terracotta, snow, ice and
   obsidian; terracotta's roof, hay's thatch, obsidian's brick */
Object.assign(TEXTURES, {
  carved_stone:          'textures/Blocks/Decorations/Stone/carved_stone.png',
  carved_granite:        'textures/Blocks/Decorations/Granite/carved_granite.png',
  carved_marble:         'textures/Blocks/Decorations/Marble/carved_marble.png',
  carved_limestone:      'textures/Blocks/Decorations/Limestone/carved_limestone.png',
  carved_dolomite:       'textures/Blocks/Decorations/Dolomite/carved_dolomite.png',
  carved_sandstone:      'textures/Blocks/Decorations/Sandstone/carved_sandstone.png',
  carved_red_sandstone:  'textures/Blocks/Decorations/Sandstone/carved_red_sandstone.png',
  carved_pink_sandstone: 'textures/Blocks/Decorations/Sandstone/carved_pink_sandstone.png',
  carved_adobe:          'textures/Blocks/Decorations/Clay/carved_adobe.png',
  carved_terracotta:     'textures/Blocks/Decorations/Clay/carved_terracotta.png',
  terracotta_roof:       'textures/Blocks/Decorations/Clay/terracotta_roof.png',
  thatch:                'textures/Blocks/Decorations/Thatch/thatch.png',
  carved_snow:           'textures/Blocks/Decorations/Winter/carved_snow.png',
  carved_ice:            'textures/Blocks/Decorations/Winter/carved_ice.png',
  carved_obsidian:       'textures/Blocks/Decorations/Obsidian/carved_obsidian.png',
  obsidian_bricks:       'textures/Blocks/Decorations/Obsidian/obsidian_bricks.png',
  // adobe's circle, terracotta's soot brick, the bone block's and the sulfur block's carved, thatch's carved and brick
  adobe_circle:           'textures/Blocks/Decorations/Clay/adobe_circle.png',
  terracotta_soot_bricks: 'textures/Blocks/Decorations/Clay/terracotta_soot_bricks.png',
  carved_bone:            'textures/Blocks/Decorations/bone/carved_bone.png',
  carved_sulfur:          'textures/Blocks/Decorations/Sulfur/carved_sulfur.png',
  carved_thatch:          'textures/Blocks/Decorations/Thatch/carved_thatch.png',
  thatch_bricks:          'textures/Blocks/Decorations/Thatch/thatch_bricks.png',
  // every planks' brick, in the woods' folders
  oak_plank_bricks:       'textures/Blocks/Woods/oak/oak_plank_bricks.png',
  birch_plank_bricks:     'textures/Blocks/Woods/birch/birch_plank_bricks.png',
  spruce_plank_bricks:    'textures/Blocks/Woods/spruce/spruce_plank_bricks.png',
  rime_plank_bricks:      'textures/Blocks/Woods/rimewood/rimewood_plank_bricks.png',
  palm_plank_bricks:      'textures/Blocks/Woods/palm/palm_plank_bricks.png',
  acacia_plank_bricks:    'textures/Blocks/Woods/acacia/acacia_plank_bricks.png',
  jungle_plank_bricks:    'textures/Blocks/Woods/jungle/jungle_plank_bricks.png',
  // the bone block's polished
  polished_bone_block:    'textures/Blocks/Decorations/bone/polished_bone_block.png',
  // the jungle's vine (its half-cut look is built from it in 03-atlas.js)
  vine:                   'textures/Blocks/Plants/vine.png',
  // more mossy looks: adobe, terracotta's roof, cobblestone's brick, sandstone's brick, dirt
  mossy_adobe:              'textures/Blocks/Decorations/Clay/mossy_adobe.png',
  mossy_terracotta_roof:    'textures/Blocks/Decorations/Clay/mossy_terracotta_roof.png',
  mossy_cobblestone_bricks: 'textures/Blocks/Decorations/Cobblestone/mossy_cobblestone_bricks.png',
  mossy_sandstone_bricks:   'textures/Blocks/Decorations/Sandstone/mossy_sandstone_bricks.png',
  mossy_dirt:               'textures/Blocks/Natures/Ground/mossy_dirt.png',
  // dirt's coarse and frozen; mossy sulfur brick, thatch brick, red and pink sandstone brick; every planks' mossy brick
  coarse_dirt:                    'textures/Blocks/Natures/Ground/coarse_dirt.png',
  frozen_dirt:                    'textures/Blocks/Natures/Ground/frozen_dirt.png',
  mossy_sulfur_bricks:            'textures/Blocks/Decorations/Sulfur/mossy_sulfur_bricks.png',
  mossy_thatch_bricks:            'textures/Blocks/Decorations/Thatch/mossy_thatch_bricks.png',
  mossy_red_sandstone_bricks:     'textures/Blocks/Decorations/Sandstone/mossy_red_sandstone_bricks.png',
  mossy_pink_sandstone_bricks:    'textures/Blocks/Decorations/Sandstone/mossy_pink_sandstone_bricks.png',
  mossy_oak_plank_bricks:         'textures/Blocks/Woods/oak/mossy_oak_plank_bricks.png',
  mossy_birch_plank_bricks:       'textures/Blocks/Woods/birch/mossy_birch_plank_bricks.png',
  mossy_spruce_plank_bricks:      'textures/Blocks/Woods/spruce/mossy_spruce_plank_bricks.png',
  mossy_rime_plank_bricks:        'textures/Blocks/Woods/rimewood/mossy_rimewood_plank_bricks.png',
  mossy_palm_plank_bricks:        'textures/Blocks/Woods/palm/mossy_palm_plank_bricks.png',
  mossy_acacia_plank_bricks:      'textures/Blocks/Woods/acacia/mossy_acacia_plank_bricks.png',
  mossy_jungle_plank_bricks:      'textures/Blocks/Woods/jungle/mossy_jungle_plank_bricks.png',
  // cracked looks: adobe, obsidian, each sandstone and its brick
  cracked_adobe:                  'textures/Blocks/Decorations/Clay/cracked_adobe.png',
  cracked_obsidian:               'textures/Blocks/Decorations/Obsidian/cracked_obsidian.png',
  cracked_sandstone:              'textures/Blocks/Decorations/Sandstone/cracked_sandstone.png',
  cracked_red_sandstone:          'textures/Blocks/Decorations/Sandstone/cracked_red_sandstone.png',
  cracked_pink_sandstone:         'textures/Blocks/Decorations/Sandstone/cracked_pink_sandstone.png',
  cracked_sandstone_bricks:       'textures/Blocks/Decorations/Sandstone/cracked_sandstone_bricks.png',
  cracked_red_sandstone_bricks:   'textures/Blocks/Decorations/Sandstone/cracked_red_sandstone_bricks.png',
  cracked_pink_sandstone_bricks:  'textures/Blocks/Decorations/Sandstone/cracked_pink_sandstone_bricks.png',
});
// ms per frame: water a quarter of its old speed, lava a tenth (150 and 220 before)
const ANIMATED_TILES = {
  water:      { frames: 16, ms: 600 },
  water_flow: { frames: 16, ms: 600, reverse: true },   // its art runs up the strip: played backwards it falls
  water_flow_fast: { frames: 16, ms: 200, reverse: true },   // three times as fast
  water_fall:      { frames: 16, ms: 70, reverse: true },    // a fall's face, about nine times
  lava:       { frames: 16, ms: 2200 },
  lava_flow:  { frames: 16, ms: 2200, reverse: true },
};
/* ---- glowing parts ----
   A light source's glowing pixels draw at full brightness whatever the light around them. The mask is a
   white-on-clear overlay (its alpha is the glow); 'auto' builds one from the tile's own bright, warm pixels
   for the art that has no overlay (a torch's flame, a lit furnace's fire, the lava mushroom's cap). */
Object.assign(TEXTURES, {
  glowstone_emissive:          'textures/Blocks/Natures/Overlays/glowstone_emissive.png',
  glow_crystal_block_emissive: 'textures/Blocks/Natures/Overlays/glow_crystal_block_emissive.png',
  glow_vine_emissive:          'textures/Blocks/Plants/Overlays/glow_vine_emissive.png',
  jack_o_lantern_emissive:     'textures/Blocks/Plants/Overlays/jack_o_lantern_emissive.png',   // 0.824
  torch_fire_emissive:         'textures/Blocks/Interactables/Torch/Overlays/torch_fire_emissive.png',      // 0.8341
  torch_crystal_emissive:      'textures/Blocks/Interactables/Torch/Overlays/torch_crystal_emissive.png',   // 0.8341
});
const EMISSIVE_TILES = {
  glowstone:   'glowstone_emissive',
  glowcrystal: 'glow_crystal_block_emissive',
  glow_vine:   'glow_vine_emissive',
  jack_o_lantern_front: 'jack_o_lantern_emissive',   // 0.824
  torch_fire:    'torch_fire_emissive',      // the flame and its embers (overlays 0.8341; 'auto' in 0.834)
  torch_crystal: 'torch_crystal_emissive',   // the crystal ('auto_cold' in 0.834)
  furnace_front_on: 'auto',
  mushroom_lava_cap_top: 'auto', mushroom_lava_cap_side: 'auto',
};
for (const r of FURNACE_ROCKS.slice(1)) EMISSIVE_TILES[furnaceTileName(r, 'front_lit')] = 'auto';   // every rock's fire
// band and pillar for every rock, in their rock's Decorations folder
const DECOR_ROCKS = ['stone', 'granite', 'marble', 'limestone', 'dolomite'];
const DECOR_PARTS = ['band_side', 'band_top', 'pillar_side', 'pillar_top'];
for (const r of DECOR_ROCKS)
  for (const p of DECOR_PARTS)
    TEXTURES[`${r}_${p}`] = `textures/Blocks/Decorations/${r[0].toUpperCase() + r.slice(1)}/${r}_${p}.png`;
// wheat's growth stages: stage 0 sprout .. 5, and 6 is the ripe wheat (0..6 then wheat_full before)
for (let s = 0; s < 7; s++) TEXTURES['wheat_stage' + s] = `textures/Billboards/Plants/Wheat/wheat_stage${s}.png`;
// the carrot's the same way: stage 0 a sprout .. 6 ripe
for (let s = 0; s < 7; s++) TEXTURES['carrot_stage' + s] = `textures/Billboards/Plants/Carrot/carrot_stage${s}.png`;
// every berry bush's seven growth stages, in BERRY_KINDS order (blocks/tiles.js); stage 6 is ripe
const BERRY_COLORS = ['red', 'blue', 'black', 'yellow', 'white'];
for (const c of BERRY_COLORS) for (let s = 0; s < 7; s++)
  TEXTURES[`berry_${c}_stage${s}`] = `textures/Billboards/Plants/Berry_bush/${c[0].toUpperCase() + c.slice(1)}/${c}_berry_stage${s}.png`;
/* sugar cane: stages 0 sprout .. 4 growing ('sugar_cane' above is stage 5, grown and alone), and the
   three pieces of a grown column: bottom, middle, top */
const CANE_PIECES = ['stage0', 'stage1', 'stage2', 'stage3', 'stage4', 'bottom', 'middle', 'top'];
for (const p of CANE_PIECES) TEXTURES['sugar_cane_' + p] = `textures/Billboards/Plants/Sugar_cane/sugar_cane_${p}.png`;
/* Mushrooms: ONE sheet per kind, textures/Blocks/mushrooms/<kind>_mushroom.png (256x128 at 8 texels a
   model pixel; yellow_mushroom.json shows how a sheet maps onto the model). At atlas build each sheet is cut
   into the part tiles the mesher has always used (CROP_TILES, 03-atlas.js), each at its own size in a layer's
   corner. A kind's index is its `shroom` in chunks/voxel-core.js and its set in SHROOM_T there; the first six keep
   their tiles where they were, the rest go on the end. The grilled ones are furnace food on their raw kind's
   model. 'white_tall' is the white mushroom (renamed 0.821; its tiles keep the name). */
const MUSHROOM_KINDS = ['red', 'brown', 'blue', 'black', 'lava', 'white_tall', 'yellow',
                        'grilled_red', 'grilled_brown', 'grilled_blue', 'grilled_black', 'grilled_white', 'grilled_yellow'];
const MUSHROOM_FILE = { white_tall: 'white_mushroom' };   // anything else is <kind>_mushroom.png
// where each part lies on a sheet, [x, y, w, h] in its pixels, for the three shapes of sheet
const MUSHROOM_LAYOUT = {
  std:    { cap_top: [0, 0, 80, 80], cap_side: [0, 80, 80, 32], cap_bottom: [80, 0, 80, 80],
            stem_side: [160, 0, 32, 48], stem_top: [192, 0, 32, 32] },
  white:  { cap_top: [0, 0, 48, 48], cap_side: [0, 80, 48, 32], cap_bottom: [80, 0, 48, 48],
            stem_side: [160, 0, 16, 88], stem_top: [192, 0, 16, 16] },
  // the yellow one has a flare between stem and cap, and its stem's `stem_top` is the underside
  yellow: { cap_top: [0, 0, 80, 80], cap_side: [0, 80, 80, 24], cap_bottom: [80, 0, 80, 80],
            stem_side: [160, 0, 32, 32], stem_top: [192, 0, 32, 32], flare_side: [192, 40, 48, 16] },
};
const mushroomLayoutOf = (kind) => /white/.test(kind) ? 'white' : /yellow/.test(kind) ? 'yellow' : 'std';
const mushroomPartsOf = (kind) => Object.keys(MUSHROOM_LAYOUT[mushroomLayoutOf(kind)]);
const mushroomTileName = (kind, part) => `mushroom_${kind}_${part}`;
// tile name -> [sheet texture, x, y, w, h]: cut out at atlas build, never fetched themselves (03-atlas.js)
const CROP_TILES = {};
for (const k of MUSHROOM_KINDS) {
  const sheet = 'mushroom_sheet_' + k, lay = MUSHROOM_LAYOUT[mushroomLayoutOf(k)];
  TEXTURES[sheet] = `textures/Blocks/mushrooms/${MUSHROOM_FILE[k] || k + '_mushroom'}.png`;
  for (const p of mushroomPartsOf(k)) CROP_TILES[mushroomTileName(k, p)] = [sheet, ...lay[p]];
}
// the old flat mushroom tiles (T.RED_MUSHROOM...): the cap side, as they always showed
for (const k of ['red', 'blue', 'brown']) CROP_TILES[k + '_mushroom'] = ['mushroom_sheet_' + k, ...MUSHROOM_LAYOUT.std.cap_side];
const BENCH_WOODS = ['oak', 'birch', 'acacia', 'cherry', 'dark'];
const BENCH_PARTS = ['top', 'front', 'side', 'bottom'];
const benchTileName = (wood, part) => `crafting_station_${wood}_${part}`;
for (const w of BENCH_WOODS.slice(1))
  for (const p of BENCH_PARTS)
    TEXTURES[benchTileName(w, p)] = `textures/Blocks/Interactables/Crafting_station/${benchTileName(w, p)}.png`;

const ITEM_TEXTURES = {
  stick:       'textures/Items/Materials/stick.png',
  build_wand:  'textures/Items/Tools/build_wand.png',      // the stick tinted purple
  wrench:      'textures/Items/Useables/wrench.png',       // creative's debug stick (player/wrench.js)
  break_wand:  'textures/Items/Tools/break_wand.png',      // the stick tinted red
  bark:        'textures/Items/Materials/bark.png',
  coal:        'textures/Items/Ores/coal.png',
  coal_chunk:  'textures/Items/Ores/coal_chunk.png',
  charcoal_chunk: 'textures/Items/Materials/charcoal_chunk.png',   // 0.767
  milk_bucket: 'textures/Items/Container/bucket_milk.png',      // 0.767; Container since 0.821
  raw_iron:    'textures/Items/Ores/iron_ore.png',
  raw_gold:    'textures/Items/Ores/gold_ore.png',
  raw_tin:     'textures/Items/Ores/tin_ore.png',
  raw_copper:  'textures/Items/Ores/copper_ore.png',
  diamond:     'textures/Items/Ores/diamond.png',
  emerald:     'textures/Items/Ores/emerald.png',        // 0.766
  ruby:        'textures/Items/Ores/ruby.png',
  sapphire:    'textures/Items/Ores/sapphire.png',
  topaz:       'textures/Items/Ores/topaz.png',          // 0.769
  // metal powders ground in the mortar, recoloured from ashes.png
  iron_powder:   'textures/Items/Ores/iron_powder.png',
  tin_powder:    'textures/Items/Ores/tin_powder.png',
  copper_powder: 'textures/Items/Ores/copper_powder.png',
  gold_powder:   'textures/Items/Ores/gold_powder.png',
  bronze_powder: 'textures/Items/Ores/bronze_powder.png',
  steel_powder:  'textures/Items/Ores/steel_powder.png',
  ashes:         'textures/Items/Materials/ash.png',             // 0.775, from the furnace
  iron_chisel:   'textures/Items/Tools/iron_chisel.png',
  iron_hammer:   'textures/Items/Tools/iron_hammer.png',
  bronze_nugget: 'textures/Items/Ores/bronze_nugget.png',          // 0.774
  bronze_ingot:  'textures/Items/Ores/bronze_ingot.png',           // 0.774, recoloured from the iron ingot
  apple:       'textures/Items/Consumables/Fruits/apple.png',
  flint:       'textures/Items/Materials/flint.png',
  stone_pebble: 'textures/Items/Materials/stone_pebble.png',     // 0.8095
  seashell:     'textures/Items/Materials/seashell.png',
  pearl:        'textures/Items/Materials/pearl.png',
  fur:          'textures/Items/Materials/fur.png',
  coconut:      'textures/Items/Consumables/Fruits/coconut.png',
  coconut_half: 'textures/Items/Consumables/Fruits/coconut_half.png',
  cantaloupe_slice: 'textures/Items/Consumables/Others/cantaloupe_slice.png',   // 0.8098
  salt_dust:    'textures/Items/Materials/salt_dust.png',        // 0.8097
  clay_ball:   'textures/Items/Materials/clay_ball.png',
  snowball:      'textures/Items/Useables/snowball.png',
  bowl:          'textures/Items/Container/wooden_bowl.png',
  mushroom_stew: 'textures/Items/Consumables/Vege/mushroom_stew.png',
  glass_shard:   'textures/Items/Materials/glass_shard.png',
  iron_ingot:    'textures/Items/Ores/iron_ingot.png',
  gold_ingot:    'textures/Items/Ores/gold_ingot.png',
  tin_ingot:     'textures/Items/Ores/tin_ingot.png',
  copper_ingot:  'textures/Items/Ores/copper_ingot.png',
  iron_nugget:   'textures/Items/Ores/iron_nugget.png',
  gold_nugget:   'textures/Items/Ores/gold_nugget.png',
  copper_nugget: 'textures/Items/Ores/copper_nugget.png',
  tin_nugget:    'textures/Items/Ores/tin_nugget.png',
  melon_slice:   'textures/Items/Consumables/Fruits/melon_slice.png',
  redberries:    'textures/Items/Consumables/Fruits/redberries.png',
  blueberries:   'textures/Items/Consumables/Fruits/blueberries.png',
  blackberries:  'textures/Items/Consumables/Fruits/blackberries.png',    // 0.7947 ('yellowberries' until 0.827)
  yellowberries: 'textures/Items/Consumables/Fruits/yellowberries.png',   // the real yellow
  whiteberries:  'textures/Items/Consumables/Fruits/whiteberries.png',    // 0.827
  brick:         'textures/Items/Materials/brick.png',
  potato:        'textures/Items/Plants/potato.png',
  potato_bake:   'textures/Items/Consumables/Vege/baked_potato.png',
  bucket:        'textures/Items/Container/iron_bucket.png',
  water_bucket:  'textures/Items/Container/bucket_normal_water.png',
  lava_bucket:   'textures/Items/Container/bucket_lava.png',
  glass_bottle:  'textures/Items/Container/glass_bottle.png',            // 0.845
  water_bottle:  'textures/Items/Container/bottle_normal_water.png',     // 0.845
  fire:          'textures/Items/Useables/fire.png',                     // 0.845
  carrot:        'textures/Items/Consumables/Vege/carrot.png',
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
  // bronze tools, recoloured from the stone ones
  bronze_shovel:   'textures/Items/Tools/bronze_shovel.png',
  bronze_pickaxe:  'textures/Items/Tools/bronze_pickaxe.png',
  bronze_hatchet:  'textures/Items/Tools/bronze_hatchet.png',
  bronze_hoe:      'textures/Items/Tools/bronze_hoe.png',
  golden_pickaxe:  'textures/Items/Tools/golden_pickaxe.png',
  golden_hatchet:  'textures/Items/Tools/golden_hatchet.png',
  golden_shovel:   'textures/Items/Tools/golden_shovel.png',
  golden_hoe:      'textures/Items/Tools/golden_hoe.png',
  steel_shovel:    'textures/Items/Tools/steel_shovel.png',
  steel_pickaxe:   'textures/Items/Tools/steel_pickaxe.png',
  steel_hatchet:   'textures/Items/Tools/steel_hatchet.png',
  steel_hoe:       'textures/Items/Tools/steel_hoe.png',
  pumpkin_pie:     'textures/Items/Consumables/Vege/raw_pumpkin_pie.png',      // the raw pie since 0.761
  cooked_pumpkin_pie: 'textures/Items/Consumables/Vege/cooked_pumpkin_pie.png',
  gunpowder:       'textures/Items/Materials/gunpowder.png',
  charcoal:        'textures/Items/Materials/charcoal.png',
  sulfur:          'textures/Items/Materials/sulfur.png',
  sugarcane:       'textures/Items/Plants/sugar_cane.png',   // its own item art again
  sugar:           'textures/Items/Materials/sugar.png',
  paper:           'textures/Items/Materials/paper.png',
  book:            'textures/Items/Materials/book.png',
  flour:           'textures/Items/Materials/flour.png',
  bread:           'textures/Items/Consumables/Others/bread.png',
  golden_apple:    'textures/Items/Consumables/Fruits/golden_apple.png',
  glow_dust:       'textures/Items/Materials/glow_dust.png',
  glow_crystals:   'textures/Items/Materials/glow_crystals.png',      // 0.765
  flint_sword:     'textures/Items/Weapons/flint_sword.png',
  stone_sword:     'textures/Items/Weapons/stone_sword.png',
  bronze_sword:    'textures/Items/Weapons/bronze_sword.png',        // 0.774
  iron_sword:      'textures/Items/Weapons/iron_sword.png',
  golden_sword:    'textures/Items/Weapons/golden_sword.png',
  steel_sword:     'textures/Items/Weapons/steel_sword.png',
  basic_bow:       'textures/Items/Weapons/basic_bow.png',
  shield:          'textures/Items/Weapons/shield.png',        // the item's icon; the one you hold is WORN_TEXTURES' shield
  arrow:           'textures/Items/Weapons/arrow.png',
  bone:            'textures/Items/Materials/bone.png',
  bone_ash:        'textures/Items/Materials/bone_ash.png',               // 0.84
  chitin_plate:    'textures/Items/Materials/chitin_shell.png',
  leather_strip:   'textures/Items/Materials/hide_strip.png',           // a termite's
  wooden_key:      'textures/Items/Useables/wooden_key.png',              // keys
  iron_key:        'textures/Items/Useables/iron_key.png',
  golden_key:      'textures/Items/Useables/golden_key.png',
  copper_key:      'textures/Items/Useables/copper_key.png',
  lockpick:        'textures/Items/Useables/lockpick.png',
  jam_sandwich:    'textures/Items/Consumables/Fruits/jam_sandwich.png',
  string:          'textures/Items/Materials/string.png',
  fiber:           'textures/Items/Materials/fiber.png',
  cloth:           'textures/Items/Materials/cloth.png',
  iron_shears:     'textures/Items/Tools/iron_shears.png',
  feather:         'textures/Items/Materials/feather.png',
  mutton:          'textures/Items/Consumables/Protein/mutton.png',
  rotten_flesh:    'textures/Items/Consumables/Others/rotten_flesh.png',
  compressed_rotten_flesh: 'textures/Items/Materials/compressed_rotten_flesh.png',   // 0.821
  cooked_mutton:   'textures/Items/Consumables/Protein/cooked_mutton.png',
  leather:         'textures/Items/Materials/leather.png',
  beef:            'textures/Items/Consumables/Protein/beef.png',
  cooked_beef:     'textures/Items/Consumables/Protein/cooked_beef.png',
  pork:            'textures/Items/Consumables/Protein/pork.png',            // 0.789
  cooked_pork:     'textures/Items/Consumables/Protein/cooked_pork.png',     // 0.789
  cod:             'textures/Items/Consumables/Protein/cod.png',             // fish, 0.805
  cooked_cod:      'textures/Items/Consumables/Protein/cooked_cod.png',
  salmon:          'textures/Items/Consumables/Protein/salmon.png',
  cooked_salmon:   'textures/Items/Consumables/Protein/cooked_salmon.png',   // Protein since 0.822
  pike:            'textures/Items/Consumables/Protein/pike.png',
  cooked_pike:     'textures/Items/Consumables/Protein/cooked_pike.png',
  catfish:         'textures/Items/Consumables/Protein/catfish.png',
  cooked_catfish:  'textures/Items/Consumables/Protein/cooked_catfish.png',
  fat:             'textures/Items/Materials/fat.png',               // 0.789
  cocoa_beans:     'textures/Items/Plants/cocoa_beans.png',
  cocoa_powder:    'textures/Items/Materials/cocoa_powder.png',
  saddle:          'textures/Items/Useables/saddle.png',
  // armor in a folder per material, with its own names for the pieces
  leather_helmet:     'textures/Items/Equipments/Leather/leather_cap.png',
  leather_chestplate: 'textures/Items/Equipments/Leather/leather_tunic.png',
  leather_leggings:   'textures/Items/Equipments/Leather/leather_trousers.png',
  leather_boots:      'textures/Items/Equipments/Leather/leather_boots.png',
  leather_gloves:     'textures/Items/Equipments/Leather/leather_gloves.png',
  iron_helmet:        'textures/Items/Equipments/Iron/iron_helmet.png',
  iron_chestplate:    'textures/Items/Equipments/Iron/iron_chestplate.png',
  iron_leggings:      'textures/Items/Equipments/Iron/iron_leggings.png',
  iron_boots:         'textures/Items/Equipments/Iron/iron_boots.png',
  iron_gloves:        'textures/Items/Equipments/Iron/iron_gauntlets.png',
  cloth_helmet:       'textures/Items/Equipments/Cloth/cloth_bandana.png',
  cloth_chestplate:   'textures/Items/Equipments/Cloth/cloth_tunic.png',
  cloth_leggings:     'textures/Items/Equipments/Cloth/cloth_trousers.png',
  cloth_boots:        'textures/Items/Equipments/Cloth/cloth_boots.png',
  cloth_gloves:       'textures/Items/Equipments/Cloth/cloth_gloves.png',
  leather_belt:       'textures/Items/Equipments/Belts/leather_belt.png',
  leather_backpack:   'textures/Items/Equipments/Backpacks/leather_backpack.png',
  golden_helmet:      'textures/Items/Equipments/Golden/gold_helmet.png',
  golden_chestplate:  'textures/Items/Equipments/Golden/gold_chestplate.png',
  golden_leggings:    'textures/Items/Equipments/Golden/gold_leggings.png',
  golden_boots:       'textures/Items/Equipments/Golden/gold_boots.png',
  golden_gloves:      'textures/Items/Equipments/Golden/gold_gauntlets.png',
  steel_helmet:       'textures/Items/Equipments/Steel/steel_helmet.png',
  steel_chestplate:   'textures/Items/Equipments/Steel/steel_chestplate.png',
  steel_leggings:     'textures/Items/Equipments/Steel/steel_leggings.png',
  steel_boots:        'textures/Items/Equipments/Steel/steel_boots.png',
  bronze_helmet:      'textures/Items/Equipments/Bronze/bronze_helmet.png',
  bronze_chestplate:  'textures/Items/Equipments/Bronze/bronze_chestplate.png',
  bronze_leggings:    'textures/Items/Equipments/Bronze/bronze_leggings.png',
  bronze_boots:       'textures/Items/Equipments/Bronze/bronze_boots.png',
  bronze_gloves:      'textures/Items/Equipments/Bronze/bronze_gauntlets.png',
};

/* Armor on a body (the equipment preview, and every player in the world): one picture per material and body
   part, laid over every face of that part's box: <mat>_head (helmet), _torso and _arm (chestplate), _hand
   (gloves), _leg (leggings), _foot (boots). A material is the `armorMat` of its items (items/items.js); its
   pictures are textures/Entity/equipment/<folder>/<file name>_<part>.png. The folder and file names are written
   exactly as they are on disk: the web server tells `Golden` from `golden`. */
const EQUIP_MATS = { iron: ['iron', 'iron'], leather: ['leather', 'leather'], cloth: ['cloth', 'cloth'],
                     golden: ['Golden', 'gold'], steel: ['Steel', 'steel'], bronze: ['Bronze', 'bronze'] };   // armorMat -> [folder, file name]
const EQUIP_PARTS = ['head', 'torso', 'arm', 'hand', 'leg', 'foot'];
const EQUIP_TEXTURES = {};
for (const m in EQUIP_MATS) for (const p of EQUIP_PARTS)
  EQUIP_TEXTURES[m + '_' + p] = `textures/Entity/equipment/${EQUIP_MATS[m][0]}/${EQUIP_MATS[m][1]}_${p}.png`;
/* What is worn that is not armor (an item's `wear` in items/items.js names it): a belt's and a backpack's straps
   are one picture laid on the torso, `<wear>_torso_overlay`; a shield in the hand is `<wear>_front` with
   `<wear>_back` on the side you hold. They load with the armor pictures. The backpack's own sheet (Backpacks/<wear>.png)
   is loaded by 41-backpack.js when one is first worn; its model is js/models/backpacks.js. */
const WORN_TEXTURES = {
  leather_belt_torso_overlay:     'textures/Entity/equipment/Belts/leather_belt_torso_overlay.png',
  leather_backpack_torso_overlay: 'textures/Entity/equipment/Backpacks/leather_backpack_torso_overlay.png',
  shield_front:                   'textures/Entity/equipment/Shield/shield_front.png',
  shield_back:                    'textures/Entity/equipment/Shield/shield_back.png',
};
Object.assign(EQUIP_TEXTURES, WORN_TEXTURES);
