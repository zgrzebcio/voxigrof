'use strict';
/* shapes/shape-blocks.js: SHAPE_BLOCKS, which blocks take which shape, and VARIANT_FAMILIES (every look of a block
   takes its default's shapes).
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* A look (brick, polished, carved... blocks/looks.js) is its base block in the cell, so it takes its base's shapes:
     only real ids are listed here. The four rocks take slabs, stairs, panes, covers and walls; the three sandstones
     panes too; glowstone and the glowcrystal block slabs and panes; obsidian slabs, stairs, panes and walls; wool slabs
     and stairs; stone and the tin block walls. Adobe and terracotta lost the cover, the iron and gold blocks the
     carpet, the iron block the fence. */
  const _ROCKS = [B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE];
  const _SANDSTONES = [B.SANDSTONE, B.RED_SANDSTONE, B.PINK_SANDSTONE];
  const _GLOWS = [B.GLOWSTONE, B.GLOWCRYSTAL_BLOCK, B.GLOWSTONE_SPENT, B.GLOWCRYSTAL_SPENT];   // spent: a shape burns out as itself
  const _NO_COVER = new Set([B.ADOBE, B.BRICKS]);
  /* hay takes slabs, stairs and carpets (thatch roofs, a straw floor); the copper block slabs, stairs and panes;
     the iron, gold and tin blocks slabs and panes; dirt slabs and stairs; the snow block slabs, stairs and walls; obsidian
     walls; the coal, charcoal and gem blocks slabs. A shaped snow block is built, not fallen: it does not melt. */
  const _METALS = [B.IRON_BLOCK, B.GOLD_BLOCK, B.TIN_BLOCK, B.COPPER_BLOCK];
  const _GEM_COAL = [B.COAL_BLOCK, B.CHARCOAL_BLOCK, B.DIAMOND_BLOCK, B.EMERALD_BLOCK, B.RUBY_BLOCK, B.SAPPHIRE_BLOCK, B.TOPAZ_BLOCK];
  const SHAPE_BLOCKS = {
    slab:   [B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS, B.GLASS, ..._SANDSTONES, B.ADOBE,
             ..._ROCKS, ..._GLOWS, B.OBSIDIAN, B.WOOL, B.SULFUR_BLOCK,
             B.HAY, ..._METALS, B.DIRT, B.SANDY_DIRT, B.SNOW, ..._GEM_COAL, B.ICE],                          // ice takes snow's, for the snow-ice brick both share
    stairs: [B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS, B.GLASS, ..._SANDSTONES, B.ADOBE,
             ..._ROCKS, B.OBSIDIAN, B.WOOL, B.SULFUR_BLOCK,
             B.HAY, B.COPPER_BLOCK, B.DIRT, B.SANDY_DIRT, B.SNOW, B.ICE],
    pane:   [B.WOOL, B.GLASS, ..._ALL_PLANKS, B.STONE, B.COBBLE, B.BRICKS,
             ..._ROCKS, ..._SANDSTONES, ..._GLOWS, B.OBSIDIAN, B.SULFUR_BLOCK,
             ..._METALS],
    fence:  [..._ALL_PLANKS, B.BRICKS, B.COPPER_BLOCK],
    layer:  [B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.PALM_LEAVES, B.ACACIA_LEAVES, B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL,
             B.FIBER_BLOCK, B.SALT_CRUST, B.ASH, B.BONE_ASH_BLOCK,
             B.WOOL, ..._ALL_PLANKS, B.STONE, B.COBBLE,
             B.HAY, B.ICE],
    cover:  [B.DIRT, B.GRASS, B.STONE, B.COBBLE, ..._ALL_PLANKS, B.BRICKS,
             ..._ROCKS, ..._SANDSTONES, B.ADOBE].filter(b => !_NO_COVER.has(b)),                // adobe, terracotta off
    door:   [..._ALL_PLANKS, B.IRON_BLOCK, B.COPPER_BLOCK, B.TIN_BLOCK, B.ADOBE, B.GLASS],          // their looks follow
    wall:   [B.COBBLE, B.BRICKS, B.IRON_BLOCK, B.COPPER_BLOCK, B.GOLD_BLOCK,
             ..._ROCKS, B.WOOL, ..._SANDSTONES, B.ADOBE,
             B.STONE, B.TIN_BLOCK, B.SULFUR_BLOCK,
             B.OBSIDIAN, B.SNOW, B.ICE],
  };
  const LAYER_STACKING = [B.SNOW, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.RIME_LEAVES, B.PALM_LEAVES, B.ACACIA_LEAVES, B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL, B.FIBER_BLOCK, B.SALT_CRUST, B.ASH, B.BONE_ASH_BLOCK];   // salt 0.8097, ash 0.8191
  for (const fam in SHAPE_BLOCKS)
    for (const b of SHAPE_BLOCKS[fam]) (PROPS[b].shapes || (PROPS[b].shapes = {}))[fam] = true;
  /* THE LOOKS THAT ARE STILL IDS TAKE THEIR DEFAULT'S SHAPES. One list per block, its default first, then those looks
     (blocks/looks.js VARIANT_BLOCKS; blocks/variants.js checks the bar agrees). Looks in the cell's bits need nothing:
     they are their base block. */
  const VARIANT_FAMILIES = [
    [B.ICE, B.ICE_BRICKS], [B.SNOW, B.SNOW_BRICKS],
    [B.HAY, B.THATCH],
  ];
  for (const [base, ...looks] of VARIANT_FAMILIES)
    for (const id of looks) {
      if (PROPS[base].shapes) PROPS[id].shapes = { ...PROPS[base].shapes };
      else delete PROPS[id].shapes;
    }});
