'use strict';
/* blocks/looks.js: VARIANT_BLOCKS, the looks the variant bar picks between (stone -> brick, mossy, polished...). A
   look is its own block id that behaves like its default.
   A part of BLOCK_CORE (blocks/blocks.js). The bar itself is blocks/variants.js. */

corePart('blocks', function () {
  /* VARIANT BLOCKS: the looks the variant bar picks between (blocks/variants.js). Each is a block of its
     own, hidden from the inventory: in hand it is always its base block with the variant picked, and broken it
     drops that base block. Each is built from the block it plays like (hardness, sound, tool), so one more is
     one line here plus its line in BLOCK_VARIANTS. [id, plays like, name, tile] */
  const VARIANT_BLOCKS = [
    [B.MOSSY_STONE_BRICK,   B.STONE_BRICK,  'Stone (mossy brick)',   T.MOSSY_STONE_BRICK],
    [B.CRACKED_STONE_BRICK, B.STONE_BRICK,  'Stone (cracked brick)', T.CRACKED_STONE_BRICK],
    [B.MOSSY_COBBLE,        B.COBBLE,       'Cobblestone (mossy)',   T.MOSSY_COBBLE],
    [B.SULFUR_BRICKS,       B.SULFUR_BLOCK, 'Sulfur block (brick)',  T.SULFUR_BRICKS],
    [B.GRANITE_BRICKS,      B.GRANITE,      'Granite (brick)',       T.GRANITE_BRICKS],
    [B.MARBLE_BRICKS,       B.MARBLE,       'Marble (brick)',        T.MARBLE_BRICKS],
    [B.LIMESTONE_BRICKS,    B.LIMESTONE,    'Limestone (brick)',     T.LIMESTONE_BRICKS],
    // dolomite's looks, and the mossy brick and polished look of every rock
    [B.DOLOMITE_BRICKS,        B.DOLOMITE,  'Dolomite (brick)',        T.DOLOMITE_BRICKS],
    [B.MOSSY_DOLOMITE_BRICKS,  B.DOLOMITE,  'Dolomite (mossy brick)',  T.MOSSY_DOLOMITE_BRICKS],
    [B.POLISHED_DOLOMITE,      B.DOLOMITE,  'Dolomite (polished)',     T.POLISHED_DOLOMITE],
    [B.MOSSY_GRANITE_BRICKS,   B.GRANITE,   'Granite (mossy brick)',   T.MOSSY_GRANITE_BRICKS],
    [B.MOSSY_MARBLE_BRICKS,    B.MARBLE,    'Marble (mossy brick)',    T.MOSSY_MARBLE_BRICKS],
    [B.MOSSY_LIMESTONE_BRICKS, B.LIMESTONE, 'Limestone (mossy brick)', T.MOSSY_LIMESTONE_BRICKS],
    [B.POLISHED_GRANITE,       B.GRANITE,   'Granite (polished)',      T.POLISHED_GRANITE],
    [B.POLISHED_MARBLE,        B.MARBLE,    'Marble (polished)',       T.POLISHED_MARBLE],
    [B.POLISHED_LIMESTONE,     B.LIMESTONE, 'Limestone (polished)',    T.POLISHED_LIMESTONE],
    // polished stone, adobe brick, and four looks of glass
    [B.POLISHED_STONE,         B.STONE,     'Stone (polished)',        T.POLISHED_STONE],
    [B.ADOBE_BRICK,            B.ADOBE,     'Adobe (brick)',           T.ADOBE_BRICK],
    [B.DARK_GLASS,             B.GLASS,     'Glass (dark)',            T.DARK_GLASS],
    [B.GREENHOUSE_GLASS,       B.GLASS,     'Glass (greenhouse)',      T.GREENHOUSE_GLASS],
    [B.GLASS_BRICKS,           B.GLASS,     'Glass (brick)',           T.GLASS_BRICKS],
    [B.DARK_GLASS_BRICKS,      B.GLASS,     'Glass (dark brick)',      T.DARK_GLASS_BRICKS],
    [B.TERRACOTTA_BRICKS,      B.BRICKS,    'Terracotta (brick)',      T.TERRACOTTA_BRICKS],   // 0.8093
    /* ice and snow bricks; the snow-ice brick is a look of both (on both bars, 46) and breaks back into snow. The
       brick ones are solid to see through, unlike ice. The bone block's brick has no axis. */
    [B.ICE_BRICKS,             B.ICE,       'Ice (brick)',             T.ICE_BRICKS,      { opaque: true, pass: 0 }],
    [B.SNOW_BRICKS,            B.SNOW,      'Snow (brick)',            T.SNOW_BRICKS],
    [B.SNOW_ICE_BRICKS,        B.SNOW,      'Snow-ice bricks',         T.SNOW_ICE_BRICKS],
    [B.BONE_BRICKS,            B.BONE_BLOCK, 'Bone block (brick)',     T.BONE_BRICKS,     { pillar: false }],
    // band and pillar: own tops; a pillar turns to the face it is placed on, like a log
    ...[[B.STONE, 'Stone', 'STONE'], [B.GRANITE, 'Granite', 'GRANITE'], [B.MARBLE, 'Marble', 'MARBLE'],
        [B.LIMESTONE, 'Limestone', 'LIMESTONE'], [B.DOLOMITE, 'Dolomite', 'DOLOMITE']].flatMap(([rock, nm, K], r) => [
      [B[K + '_BAND'],   rock, nm + ' (band)',   DECOR_T[r][0],
        { faces: [DECOR_T[r][0], DECOR_T[r][0], DECOR_T[r][1], DECOR_T[r][1], DECOR_T[r][0], DECOR_T[r][0]] }],
      [B[K + '_PILLAR'], rock, nm + ' (pillar)', DECOR_T[r][2],
        { pillar: true, rot: 'all', faces: [DECOR_T[r][2], DECOR_T[r][2], DECOR_T[r][3], DECOR_T[r][3], DECOR_T[r][2], DECOR_T[r][2]] }]]),
    // the mortar's bowl carved from another rock: only the bowl material changes, powder and pestle stay
    [B.GRANITE_MORTAR,   B.MORTAR, 'Mortar and pestle (granite)',   T.GRANITE,   { matFaces: { ...MORTAR_FACES, 1: Array(6).fill(T.GRANITE) } }],
    [B.MARBLE_MORTAR,    B.MORTAR, 'Mortar and pestle (marble)',    T.MARBLE,    { matFaces: { ...MORTAR_FACES, 1: Array(6).fill(T.MARBLE) } }],
    [B.LIMESTONE_MORTAR, B.MORTAR, 'Mortar and pestle (limestone)', T.LIMESTONE, { matFaces: { ...MORTAR_FACES, 1: Array(6).fill(T.LIMESTONE) } }],
    [B.DOLOMITE_MORTAR,  B.MORTAR, 'Mortar and pestle (dolomite)',  T.DOLOMITE,  { matFaces: { ...MORTAR_FACES, 1: Array(6).fill(T.DOLOMITE) } }],   // 0.822
    // brick and polished looks of every sandstone
    [B.SANDSTONE_BRICKS,        B.SANDSTONE,      'Sandstone (brick)',          T.SANDSTONE_BRICKS],
    [B.POLISHED_SANDSTONE,      B.SANDSTONE,      'Sandstone (polished)',       T.POLISHED_SANDSTONE],
    [B.RED_SANDSTONE_BRICKS,    B.RED_SANDSTONE,  'Red sandstone (brick)',      T.RED_SANDSTONE_BRICKS],
    [B.POLISHED_RED_SANDSTONE,  B.RED_SANDSTONE,  'Red sandstone (polished)',   T.POLISHED_RED_SANDSTONE],
    [B.PINK_SANDSTONE_BRICKS,   B.PINK_SANDSTONE, 'Pink sandstone (brick)',     T.PINK_SANDSTONE_BRICKS],
    [B.POLISHED_PINK_SANDSTONE, B.PINK_SANDSTONE, 'Pink sandstone (polished)',  T.POLISHED_PINK_SANDSTONE],
    /* a gem cluster on a bed of plain stone instead of its ore; mined, it still gives its gems.
       Retired from the variant bar in 0.7948, when the bed moved into the cluster's own variant bits
       (CLUSTER_BEDS): kept only so a cluster placed in 0.7947 still draws and drops right */
    [B.DIAMOND_CLUSTER_STONE,  B.DIAMOND_ORE,  'Diamond cluster (stone)',  T.DIAMOND_BLOCK,  { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
    [B.EMERALD_CLUSTER_STONE,  B.EMERALD_ORE,  'Emerald cluster (stone)',  T.EMERALD_BLOCK,  { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
    [B.RUBY_CLUSTER_STONE,     B.RUBY_ORE,     'Ruby cluster (stone)',     T.RUBY_BLOCK,     { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
    [B.SAPPHIRE_CLUSTER_STONE, B.SAPPHIRE_ORE, 'Sapphire cluster (stone)', T.SAPPHIRE_BLOCK, { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
    [B.TOPAZ_CLUSTER_STONE,    B.TOPAZ_ORE,    'Topaz cluster (stone)',    T.TOPAZ_BLOCK,    { bedFaces: Array(6).fill(T.STONE), dropsAsBase: true }],
  ];
  for (const [id, like, name, tile, extra] of VARIANT_BLOCKS)
    PROPS[id] = { ...PROPS[like], name, noInv: true, faces: [tile, tile, tile, tile, tile, tile], desc: '', ...extra };
  // the door and the ladder are switched off: no recipe, not in creative. Placed ones still work
  PROPS[B.LADDER].noInv = true;
  // the old oak door: a door is a hammer shape of its material now; this id stays only so old saves convert (02)
  PROPS[B.DOOR].noInv = true;
  // the door is back in the creative palette, for building prefabs; its recipe stays removed (player/crafting.js)
  // every brick variant takes what stone brick takes; mossy cobblestone what cobblestone takes
  const _BRICK_VARIANTS = [B.MOSSY_STONE_BRICK, B.CRACKED_STONE_BRICK, B.SULFUR_BRICKS,
                           B.GRANITE_BRICKS, B.MARBLE_BRICKS, B.LIMESTONE_BRICKS,
                           B.DOLOMITE_BRICKS, B.MOSSY_DOLOMITE_BRICKS, B.POLISHED_DOLOMITE,          // 0.809
                           B.MOSSY_GRANITE_BRICKS, B.MOSSY_MARBLE_BRICKS, B.MOSSY_LIMESTONE_BRICKS,
                           B.POLISHED_GRANITE, B.POLISHED_MARBLE, B.POLISHED_LIMESTONE,
                           B.POLISHED_STONE, B.ADOBE, B.ADOBE_BRICK,                                   // 0.8091
                           B.TERRACOTTA_BRICKS, B.STONE_BAND, B.STONE_PILLAR, B.GRANITE_BAND, B.GRANITE_PILLAR,   // 0.8093
                           B.MARBLE_BAND, B.MARBLE_PILLAR, B.LIMESTONE_BAND, B.LIMESTONE_PILLAR, B.DOLOMITE_BAND, B.DOLOMITE_PILLAR,
                           B.PINK_SANDSTONE, B.SANDSTONE_BRICKS, B.POLISHED_SANDSTONE, B.RED_SANDSTONE_BRICKS,   // 0.822
                           B.POLISHED_RED_SANDSTONE, B.PINK_SANDSTONE_BRICKS, B.POLISHED_PINK_SANDSTONE];
  // the glass looks take what glass takes
  const _GLASS_VARIANTS = [B.DARK_GLASS, B.GREENHOUSE_GLASS, B.GLASS_BRICKS, B.DARK_GLASS_BRICKS];
  const _ALL_PLANKS = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.RIME_PLANKS, B.PALM_PLANKS, B.ACACIA_PLANKS];   // rime 0.836; palm 0.84
});
