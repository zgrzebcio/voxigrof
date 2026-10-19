'use strict';
/* shapes/shape-blocks.js: SHAPE_BLOCKS, which blocks take which shape, and VARIANT_FAMILIES (every look of a block
   takes its default's shapes).
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* the four rocks and every look of them (brick, mossy brick, polished, band, pillar) take slabs, stairs and
     panes; every look of the three sandstones takes panes; glowstone and the glowcrystal block slabs and panes;
     obsidian slabs, stairs and panes; wool slabs and stairs; stone and the tin block walls. Adobe and terracotta lost
     the cover, the iron and gold blocks the carpet, the iron block the fence. */
  const _ROCKS = [B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE];
  const _ROCK_LOOKS = [B.GRANITE_BRICKS, B.MOSSY_GRANITE_BRICKS, B.POLISHED_GRANITE, B.GRANITE_BAND, B.GRANITE_PILLAR,
                       B.MARBLE_BRICKS, B.MOSSY_MARBLE_BRICKS, B.POLISHED_MARBLE, B.MARBLE_BAND, B.MARBLE_PILLAR,
                       B.LIMESTONE_BRICKS, B.MOSSY_LIMESTONE_BRICKS, B.POLISHED_LIMESTONE, B.LIMESTONE_BAND, B.LIMESTONE_PILLAR,
                       B.DOLOMITE_BRICKS, B.MOSSY_DOLOMITE_BRICKS, B.POLISHED_DOLOMITE, B.DOLOMITE_BAND, B.DOLOMITE_PILLAR];
  const _SANDSTONES = [B.SANDSTONE, B.RED_SANDSTONE, B.PINK_SANDSTONE, B.SANDSTONE_BRICKS, B.POLISHED_SANDSTONE,
                       B.RED_SANDSTONE_BRICKS, B.POLISHED_RED_SANDSTONE, B.PINK_SANDSTONE_BRICKS, B.POLISHED_PINK_SANDSTONE];
  const _GLOWS = [B.GLOWSTONE, B.GLOWCRYSTAL_BLOCK, B.GLOWSTONE_SPENT, B.GLOWCRYSTAL_SPENT];   // spent: a shape burns out as itself
  const _NO_COVER = new Set([B.ADOBE, B.ADOBE_BRICK, B.BRICKS, B.TERRACOTTA_BRICKS]);
  /* hay takes slabs, stairs and carpets (thatch roofs, a straw floor); the copper block slabs, stairs and panes;
     the iron, gold and tin blocks slabs and panes; dirt slabs and stairs; the snow block slabs, stairs and walls; obsidian
     walls; the coal, charcoal and gem blocks slabs. A shaped snow block is built, not fallen: it does not melt. */
  const _METALS = [B.IRON_BLOCK, B.GOLD_BLOCK, B.TIN_BLOCK, B.COPPER_BLOCK];
  const _GEM_COAL = [B.COAL_BLOCK, B.CHARCOAL_BLOCK, B.DIAMOND_BLOCK, B.EMERALD_BLOCK, B.RUBY_BLOCK, B.SAPPHIRE_BLOCK, B.TOPAZ_BLOCK];
  const SHAPE_BLOCKS = {
    slab:   [B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS, B.STONE_BRICK, B.GLASS, B.SANDSTONE, B.RED_SANDSTONE,
             ..._BRICK_VARIANTS, B.MOSSY_COBBLE, ..._GLASS_VARIANTS,
             ..._ROCKS, ..._GLOWS, B.OBSIDIAN, B.WOOL, B.SULFUR_BLOCK,                         // 0.8261; sulfur 0.8264
             B.HAY, ..._METALS, B.DIRT, B.SNOW, ..._GEM_COAL, B.ICE],                          // 0.8265; ice 0.833 (it takes snow's, for the snow-ice brick both share)
    stairs: [B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS, B.STONE_BRICK, B.GLASS, B.SANDSTONE, B.RED_SANDSTONE,
             ..._BRICK_VARIANTS, B.MOSSY_COBBLE, ..._GLASS_VARIANTS,
             ..._ROCKS, B.OBSIDIAN, B.WOOL, B.SULFUR_BLOCK,                                    // 0.8261; sulfur 0.8264
             B.HAY, B.COPPER_BLOCK, B.DIRT, B.SNOW, B.ICE],                                    // 0.8265; ice 0.833
    pane:   [B.WOOL, B.GLASS, ..._ALL_PLANKS, B.STONE, B.COBBLE, B.BRICKS, B.MOSSY_COBBLE, ..._GLASS_VARIANTS,   // 0.784
             ..._ROCKS, ..._ROCK_LOOKS, ..._SANDSTONES, ..._GLOWS, B.OBSIDIAN, B.SULFUR_BLOCK,    // 0.8261; sulfur 0.8264
             ..._METALS],                                                                      // 0.8265
    fence:  [..._ALL_PLANKS, B.BRICKS, B.COPPER_BLOCK],                                       // 0.784; iron off 0.8261
    layer:  [B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.PALM_LEAVES, B.ACACIA_LEAVES, B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL,   // pink 0.822; rime 0.836; palm 0.84
             B.FIBER_BLOCK, B.SALT_CRUST, B.ASH,   // 0.785; salt 0.8097; ash 0.8191
             B.WOOL, ..._ALL_PLANKS, B.STONE, B.COBBLE, B.MOSSY_COBBLE,                        // iron and gold off 0.8261, glass 0.8263
             B.HAY, B.ICE],                                                                    // 0.8265; ice 0.833
    cover:  [B.DIRT, B.GRASS, B.STONE, B.COBBLE, ..._ALL_PLANKS, B.STONE_BRICK, B.BRICKS,              // 0.787
             B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE, B.SANDSTONE, B.RED_SANDSTONE, ..._BRICK_VARIANTS, B.MOSSY_COBBLE]
             .filter(b => !_NO_COVER.has(b)),                                                  // adobe, terracotta off 0.8261
    door:   [..._ALL_PLANKS, B.IRON_BLOCK, B.COPPER_BLOCK, B.TIN_BLOCK, B.ADOBE, B.GLASS],          // 0.842; their looks follow
    wall:   [B.COBBLE, B.STONE_BRICK, B.BRICKS, B.IRON_BLOCK, B.COPPER_BLOCK, B.GOLD_BLOCK,          // 0.787
             B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE, B.WOOL, B.SANDSTONE, B.RED_SANDSTONE, ..._BRICK_VARIANTS, B.MOSSY_COBBLE,
             B.STONE, B.TIN_BLOCK, B.SULFUR_BLOCK,                                             // 0.8261; sulfur 0.8264
             B.OBSIDIAN, B.SNOW, B.ICE],                                                       // 0.8265; ice 0.833
  };
  const LAYER_STACKING = [B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.PALM_LEAVES, B.ACACIA_LEAVES, B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL, B.FIBER_BLOCK, B.SALT_CRUST, B.ASH];   // salt 0.8097, ash 0.8191
  for (const fam in SHAPE_BLOCKS)
    for (const b of SHAPE_BLOCKS[fam]) (PROPS[b].shapes || (PROPS[b].shapes = {}))[fam] = true;
  /* EVERY LOOK OF A BLOCK TAKES THE SAME SHAPES: its default's. One list per block, its default first,
     then the looks the variant bar lays it as (BLOCK_VARIANTS, blocks/variants.js, which checks the two agree), so a
     brick or a polished look can never take a shape its plain block does not, or miss one it does. */
  const VARIANT_FAMILIES = [
    [B.STONE, B.STONE_BRICK, B.MOSSY_STONE_BRICK, B.CRACKED_STONE_BRICK, B.POLISHED_STONE, B.STONE_BAND, B.STONE_PILLAR],
    [B.COBBLE, B.MOSSY_COBBLE],
    [B.GLASS, ..._GLASS_VARIANTS],
    [B.ADOBE, B.ADOBE_BRICK],
    [B.BRICKS, B.TERRACOTTA_BRICKS],
    [B.SULFUR_BLOCK, B.SULFUR_BRICKS],
    ...['GRANITE', 'MARBLE', 'LIMESTONE', 'DOLOMITE'].map(K =>
      [B[K], B[K + '_BRICKS'], B['MOSSY_' + K + '_BRICKS'], B['POLISHED_' + K], B[K + '_BAND'], B[K + '_PILLAR']]),
    ...['', 'RED_', 'PINK_'].map(K => [B[K + 'SANDSTONE'], B[K + 'SANDSTONE_BRICKS'], B['POLISHED_' + K + 'SANDSTONE']]),
    [B.GLASSY_SAND, B.GLASSY_RED_SAND, B.GLASSY_PINK_SAND],
    [B.MORTAR, B.GRANITE_MORTAR, B.MARBLE_MORTAR, B.LIMESTONE_MORTAR, B.DOLOMITE_MORTAR],
    [B.ICE, B.ICE_BRICKS], [B.SNOW, B.SNOW_BRICKS, B.SNOW_ICE_BRICKS], [B.BONE_BLOCK, B.BONE_BRICKS],   // 0.833
  ];
  for (const [base, ...looks] of VARIANT_FAMILIES)
    for (const id of looks) {
      if (PROPS[base].shapes) PROPS[id].shapes = { ...PROPS[base].shapes };
      else delete PROPS[id].shapes;
    }
});
