'use strict';
/* blocks/looks.js: the LOOKS of a block (stone -> brick, mossy, polished, carved...), picked on the variant bar and kept
   in the cell's bits 16-23, and the few looks that are still block ids of their own (VARIANT_BLOCKS).
   A part of BLOCK_CORE (blocks/blocks.js), so the page and the workers draw from the same table. The bar itself is
   blocks/variants.js; old saves and prefabs are converted through LOOK_OF_OLD_ID (blocks/legacy.js). */

corePart('blocks', function () {
  /* A LOOK is another picture of the same block. The cell keeps the BASE block's id (granite) and carries the look's
     number in bits 16-23, so everything that asks "is this granite" (hardness, tool, drops, shapes, light, opacity,
     collision) sees granite. Only what is drawn and the name come from the look:
       name     shown on the crosshair, the bar and the tooltip
       faces    six tiles [+X, -X, top, bottom, +Z, -Z]
       pillar   its side art turns with the axis bits, like a log (rot 'all': placed along the clicked face)
       matFaces a model's materials (the mortar's bowl)
     A look may NOT change opacity, pass, light or anything else a worker's light or fluid thread reads.
     A look's NUMBER is in the saves: given here by hand, never changed or reused. `was` is the block id the look had
     before 0.84691, when every look was a block of its own; it builds LOOK_OF_OLD_ID for old saves and prefabs. */
  const LOOK_SHIFT = 16, LOOK_MASK = 0xFF0000;
  const LOOKS = [];                         // base id -> [, look 1, look 2, ...]
  const LOOK_OF_OLD_ID = {};                // retired block id -> the value it is now (base | look << 16)
  function defineLook(base, n, key, name, tile, extra) {
    const faces = Array.isArray(tile) ? tile : [tile, tile, tile, tile, tile, tile];
    const e = Object.assign({ n, base, key, name, faces }, extra || {});
    (LOOKS[base] || (LOOKS[base] = []))[n] = e;
    if (e.was != null) LOOK_OF_OLD_ID[e.was] = (base | (n << LOOK_SHIFT)) >>> 0;
    return e;
  }
  // a cell value's look: its number, the value with another, its entry (null for the block's own look)
  const lookOf = (v) => (v >>> LOOK_SHIFT) & 255;
  const withLook = (v, n) => ((v & ~LOOK_MASK) | ((n & 255) << LOOK_SHIFT)) >>> 0;
  const lookEntryOf = (v) => { const n = (v >>> LOOK_SHIFT) & 255, L = n ? LOOKS[v & 255] : null; return (L && L[n]) || null; };
  // what is drawn: the look's faces or the block's own; a pillar or not; the name
  const facesOfVal = (v) => { const e = lookEntryOf(v); return e ? e.faces : PROPS[v & 255].faces; };
  const pillarOfVal = (v) => { const e = lookEntryOf(v); return e ? !!e.pillar : !!(PROPS[v & 255] && PROPS[v & 255].pillar); };
  const nameOfVal = (v) => { const e = lookEntryOf(v); return e ? e.name : (PROPS[v & 255] ? PROPS[v & 255].name : ''); };
  // the material of a cell, id and look without the variant byte: "the same block" when two of these are equal
  const matKey = (v) => (v & 0xFF00FF) >>> 0;
  /* The side lists (LAYER_STACKS: a mixed stack of layers, a mixed slab's two halves) hold one 16-bit ENTRY per block:
     id | look << 8. A list saved before 0.84691 holds ids alone, which read the same. */
  const stackEntry = (v) => (v & 255) | (((v >>> LOOK_SHIFT) & 255) << 8);
  const stackVal = (e) => ((e & 255) | (((e >> 8) & 255) << LOOK_SHIFT)) >>> 0;

  // ---- the table: per base, its looks in the order they were added; numbers fixed for good ----
  // stone (the old stone brick, 34, is stone's look 1)
  defineLook(B.STONE, 1, 'brick',       'Stone (brick)',         T.STONE_BRICK,         { was: 34 });
  defineLook(B.STONE, 2, 'mossy brick', 'Stone (mossy brick)',   T.MOSSY_STONE_BRICK,   { was: 128 });
  defineLook(B.STONE, 3, 'cracked brick', 'Stone (cracked brick)', T.CRACKED_STONE_BRICK, { was: 129 });   // off the bar: placed ones stay
  defineLook(B.STONE, 4, 'polished',    'Stone (polished)',      T.POLISHED_STONE,      { was: 154 });
  // every rock: brick, mossy brick, polished, band, pillar, carved. Band and pillar have their own tops; a pillar turns
  // to the face it is placed on, like a log
  const _ROCK_LOOK_IDS = {   // the ids these had: brick, mossy, polished, band, pillar, carved
    STONE: [null, null, null, 167, 168, 238], GRANITE: [132, 148, 151, 169, 170, 239], MARBLE: [133, 149, 152, 171, 172, 240],
    LIMESTONE: [134, 150, 153, 173, 174, 241], DOLOMITE: [145, 146, 147, 175, 176, 242] };
  [['STONE', 'Stone'], ['GRANITE', 'Granite'], ['MARBLE', 'Marble'], ['LIMESTONE', 'Limestone'], ['DOLOMITE', 'Dolomite']].forEach(([K, nm], r) => {
    const base = B[K], was = _ROCK_LOOK_IDS[K], D = DECOR_T[r];
    if (K !== 'STONE') {
      defineLook(base, 1, 'brick',       nm + ' (brick)',       T[K + '_BRICKS'],          { was: was[0] });
      defineLook(base, 2, 'mossy brick', nm + ' (mossy brick)', T['MOSSY_' + K + '_BRICKS'], { was: was[1] });
      defineLook(base, 3, 'polished',    nm + ' (polished)',    T['POLISHED_' + K],         { was: was[2] });
    }
    const o = K === 'STONE' ? 1 : 0;          // stone's run on after its four above: band 5, pillar 6, carved 7
    defineLook(base, 4 + o, 'band',   nm + ' (band)',   [D[0], D[0], D[1], D[1], D[0], D[0]], { was: was[3] });
    defineLook(base, 5 + o, 'pillar', nm + ' (pillar)', [D[2], D[2], D[3], D[3], D[2], D[2]], { was: was[4], pillar: true, rot: 'all' });
    defineLook(base, 6 + o, 'carved', nm + ' (carved)', T['CARVED_' + K],                     { was: was[5] });
  });
  defineLook(B.COBBLE, 1, 'mossy', 'Cobblestone (mossy)', T.MOSSY_COBBLE, { was: 130 });
  defineLook(B.SULFUR_BLOCK, 1, 'brick', 'Sulfur block (brick)', T.SULFUR_BRICKS, { was: 131 });
  // the mortar's bowl carved from another rock: only the bowl material changes, powder and pestle stay
  [[B.GRANITE, 'granite', 135], [B.MARBLE, 'marble', 136], [B.LIMESTONE, 'limestone', 137], [B.DOLOMITE, 'dolomite', 195]].forEach(([rock, nm, was], i) =>
    defineLook(B.MORTAR, i + 1, nm, `Mortar and pestle (${nm})`, PROPS[rock].faces[0],
               { was, matFaces: Object.assign({}, MORTAR_FACES, { 1: PROPS[rock].faces.slice() }) }));
  // glass: dark, greenhouse, brick, dark brick (see-through like glass: a look never changes that)
  defineLook(B.GLASS, 1, 'dark',       'Glass (dark)',       T.DARK_GLASS,        { was: 157 });
  defineLook(B.GLASS, 2, 'greenhouse', 'Glass (greenhouse)', T.GREENHOUSE_GLASS,  { was: 158 });
  defineLook(B.GLASS, 3, 'brick',      'Glass (brick)',      T.GLASS_BRICKS,      { was: 159 });
  defineLook(B.GLASS, 4, 'dark brick', 'Glass (dark brick)', T.DARK_GLASS_BRICKS, { was: 160 });
  // adobe, terracotta (B.BRICKS, the old clay bricks block)
  defineLook(B.ADOBE, 1, 'brick',  'Adobe (brick)',  T.ADOBE_BRICK,  { was: 156 });
  defineLook(B.ADOBE, 2, 'carved', 'Adobe (carved)', T.CARVED_ADOBE, { was: 246 });
  defineLook(B.BRICKS, 1, 'brick',  'Terracotta (brick)',  T.TERRACOTTA_BRICKS, { was: 166 });
  defineLook(B.BRICKS, 2, 'carved', 'Terracotta (carved)', T.CARVED_TERRACOTTA, { was: 247 });
  defineLook(B.BRICKS, 3, 'roof',   'Terracotta (roof)',   T.TERRACOTTA_ROOF,   { was: 248 });
  // the three sandstones: brick, polished, carved
  [['', 'Sandstone', [189, 190, 243]], ['RED_', 'Red sandstone', [191, 192, 244]], ['PINK_', 'Pink sandstone', [193, 194, 245]]]
    .forEach(([K, nm, was]) => {
      const base = B[K + 'SANDSTONE'];
      defineLook(base, 1, 'brick',    nm + ' (brick)',    T[K + 'SANDSTONE_BRICKS'],    { was: was[0] });
      defineLook(base, 2, 'polished', nm + ' (polished)', T['POLISHED_' + K + 'SANDSTONE'], { was: was[1] });
      defineLook(base, 3, 'carved',   nm + ' (carved)',   T['CARVED_' + K + 'SANDSTONE'],   { was: was[2] });
    });
  // the bone block's brick has no axis
  defineLook(B.BONE_BLOCK, 1, 'brick', 'Bone block (brick)', T.BONE_BRICKS, { was: 208, pillar: false });
  defineLook(B.OBSIDIAN, 1, 'carved', 'Obsidian (carved)', T.CARVED_OBSIDIAN, { was: 252 });
  defineLook(B.OBSIDIAN, 2, 'brick',  'Obsidian (brick)',  T.OBSIDIAN_BRICKS, { was: 253 });
  /* the gem clusters on a plain stone bed (0.7947) are the cluster with bed 1 (stone) in its variant bits now; a
     placed one's direction and layout are kept */
  [[139, B.DIAMOND_ORE], [140, B.EMERALD_ORE], [141, B.RUBY_ORE], [142, B.SAPPHIRE_ORE], [143, B.TOPAZ_ORE]]
    .forEach(([was, ore]) => { LOOK_OF_OLD_ID[was] = (ore | ((1 << CLUSTER_BED_SHIFT) << 8)) >>> 0; });

  /* VARIANT BLOCKS: the looks that are still block ids of their own, because they behave unlike their base (snow falls
     and melts, hay falls, ice is see-through and melts; their looks do none of that). Each is hidden from the
     inventory: in hand it is its base block with the look picked, and broken it drops that base block. Each is built
     from the block it plays like (hardness, sound, tool). [id, plays like, name, tile, extra] */
  const VARIANT_BLOCKS = [
    // ice and snow bricks; the snow-ice brick is a look of both (on both bars) and breaks back into snow. The ice
    // brick is solid to see through, unlike ice; carved ice stays see-through
    [B.ICE_BRICKS,      B.ICE,  'Ice (brick)',     T.ICE_BRICKS,      { opaque: true, pass: 0 }],
    [B.SNOW_BRICKS,     B.SNOW, 'Snow (brick)',    T.SNOW_BRICKS],
    [B.SNOW_ICE_BRICKS, B.SNOW, 'Snow-ice bricks', T.SNOW_ICE_BRICKS],
    [B.CARVED_SNOW,     B.SNOW, 'Snow (carved)',   T.CARVED_SNOW],
    [B.CARVED_ICE,      B.ICE,  'Ice (carved)',    T.CARVED_ICE],
    // hay's thatch: the same tile all round, and it does not fall like the bale
    [B.THATCH,          B.HAY,  'Hay bale (thatch)', T.THATCH],
  ];
  for (const [id, like, name, tile, extra] of VARIANT_BLOCKS)
    PROPS[id] = { ...PROPS[like], name, noInv: true, faces: [tile, tile, tile, tile, tile, tile], desc: '', ...extra };
  // the door and the ladder are switched off: no recipe, not in creative. Placed ones still work
  PROPS[B.LADDER].noInv = true;
  // the old oak door: a door is a hammer shape of its material now; this id stays only so old saves convert (02)
  PROPS[B.DOOR].noInv = true;
  const _ALL_PLANKS = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.RIME_PLANKS, B.PALM_PLANKS, B.ACACIA_PLANKS];   // rime 0.836; palm 0.84
});
