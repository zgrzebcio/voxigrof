'use strict';
/* blocks/mushrooms.js: mushrooms as models (stem, cap, crown, by kind and size) and the grilled mushrooms.
   A part of BLOCK_CORE (blocks/blocks.js). Their growth is seasons/growth.js; the mesher's side is emitShroom. */

corePart('blocks', function () {
  /* MUSHROOMS ARE MODELS: a stem, a cap and a crown of boxes (textures/Blocks/mushrooms/<kind>/*.json),
     drawn by emitShroom rather than as a crossed billboard. They keep model 'cross' — everything that treats a
     mushroom as a small plant (breaking free by hand, falling off its ground, the hand pose) still does.
     `shroom` is the kind: its sheets in SHROOM_T and its boxes in SHROOM_MODEL. Black and white tall grow and
     cook like brown; lava grows by lava in caves and glows a little. */
  // the model each kind is drawn with: white (5, 11) and yellow (6, 12) have their own shapes
  const SHROOM_SHAPE = [0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 1, 2];
  const _shroom = (name, kind, extra) => ({ name, solid:false, opaque:false, raycast:true, pass:0, model:'cross', stack:79,
    // boxes fit the largest a mushroom grows in the world since 0.819 (0.6 of the model; emitShroom)
    hardness:0, type:'grass', shroom: kind,
    boxes: [[[5/16, 0, 5/16, 11/16, 7/16, 11/16], [6/16, 0, 6/16, 10/16, 10/16, 10/16], [5/16, 0, 5/16, 11/16, 6/16, 11/16]][SHROOM_SHAPE[kind]]],
    faces: Array(6).fill(SHROOM_T[kind][1]), desc: '', ...extra });
  // where each grows, for its tooltip
  const SHROOM_WHERE = 'Grows on cave floors, in the shade under trees and beside fallen hollow logs';
  // brown and black under every kind of tree, red under birch, blue under spruce, yellow under oak, white beside trees
  const _anyShroom = { desc: `${SHROOM_WHERE}: under every kind of tree, more in autumn, and on an oak hollow log packed with dirt.` };
  PROPS[B.RED_MUSHROOM]        = _shroom('Red mushroom', 0, { desc: `${SHROOM_WHERE}: under birch trees, more in autumn, and on a birch hollow log packed with dirt.` });
  PROPS[B.BROWN_MUSHROOM]      = _shroom('Brown mushroom', 1, _anyShroom);
  PROPS[B.BLUE_MUSHROOM]       = _shroom('Blue mushroom', 2, { desc: `${SHROOM_WHERE}: under spruce trees, more in autumn, and on a spruce hollow log packed with dirt.` });
  PROPS[B.BLACK_MUSHROOM]      = _shroom('Black mushroom', 3, _anyShroom);
  PROPS[B.LAVA_MUSHROOM]       = _shroom('Lava mushroom', 4, { light: 6, desc: 'Grows on cave floors next to lava, and glows a little.' });
  PROPS[B.WHITE_TALL_MUSHROOM] = _shroom('White mushroom', 5, { desc: 'Grows in clearings and meadows beside trees, very rarely on the plains by a tree, and on an oak hollow log packed with dirt.' });   // "white tall" until 0.821
  PROPS[B.YELLOW_MUSHROOM]     = _shroom('Yellow mushroom', 6, { desc: `${SHROOM_WHERE}: under oak trees, more in autumn, and on an oak hollow log packed with dirt.` });   // 0.821
  /* Grilled mushrooms: what a furnace makes of a mushroom (not the lava one). Food, drawn on their raw
     kind's model, never placed (`noPlace`); what they give besides food is FOOD_NUTRITION in player/stats.js. */
  // noCreative: not in the creative palette (player/placing.js), but carried and saved like any block
  // a snack: four of them are worth less than the stew they make (plans/FoodBalance.md)
  const _grilled = (name, kind) => _shroom(name, kind, { noPlace: true, noCreative: true, food: 10, foodSat: 6, foodSatFull: 3,
    eatTime: 1.2, spoil: 3600, desc: '' });
  PROPS[B.GRILLED_RED_MUSHROOM]    = _grilled('Grilled red mushroom', 7);
  PROPS[B.GRILLED_BROWN_MUSHROOM]  = _grilled('Grilled brown mushroom', 8);
  PROPS[B.GRILLED_BLUE_MUSHROOM]   = _grilled('Grilled blue mushroom', 9);
  PROPS[B.GRILLED_BLACK_MUSHROOM]  = _grilled('Grilled black mushroom', 10);
  PROPS[B.GRILLED_WHITE_MUSHROOM]  = _grilled('Grilled white mushroom', 11);
  PROPS[B.GRILLED_YELLOW_MUSHROOM] = _grilled('Grilled yellow mushroom', 12);
  /* [x0,y0,z0, x1,y1,z1 in model pixels, side, top, bottom]: each face names its sheet (0-4 of the kind's set,
     -1 none) and the pixel of that sheet its bottom-left corner sits on, so the crown shows the middle of the
     cap's art at the same 8 texels a pixel rather than the whole sheet squeezed. */
  const _SHROOM_STD = [[6, 0, 6, 10, 6, 10,   [3, 0, 0], null,       [4, 0, 0]],      // stem
                       [3, 6, 3, 13, 10, 13,  [1, 0, 0], [0, 0, 0],  [2, 0, 0]],      // cap
                       [5, 10, 5, 11, 12, 11, [1, 2, 2], [0, 2, 2],  null]];          // crown
  const _SHROOM_WHITE = [[7, 0, 7, 9, 11, 9,    [3, 0, 0], null,       [4, 0, 0]],
                         [5, 11, 5, 11, 15, 11, [1, 0, 0], [0, 0, 0],  [2, 0, 0]],
                         [6, 15, 6, 10, 16, 10, [1, 1, 3], [0, 1, 1],  null]];
  // yellow (textures/Blocks/mushrooms/yellow_mushroom.json): a short stem, a flare (part 5), a wide flat cap
  const _SHROOM_YELLOW = [[6, 0, 6, 10, 4, 10,  [3, 0, 0], null,       [4, 0, 0]],
                          [5, 4, 5, 11, 6, 11,  [5, 0, 0], null,       null],
                          [3, 6, 3, 13, 9, 13,  [1, 0, 0], [0, 0, 0],  [2, 0, 0]]];
  const SHROOM_MODEL = SHROOM_SHAPE.map(s => [_SHROOM_STD, _SHROOM_WHITE, _SHROOM_YELLOW][s]);
  /* The grass plants, smallest first: short grass, grass (TALLGRASS, the old "short grass" id), tall grass (two cells) */
  PROPS[B.SHORT_GRASS]   = { name:'Short grass',   solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',rot:'all',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.15,0,0.15,0.85,0.5,0.85]], faces:[T.SHORT_GRASS_PLANT], desc: '' };
  PROPS[B.TALLGRASS]     = { name:'Grass',         solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',rot:'all',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,0.9,0.9]], faces:[T.GRASS_PLANT], desc: '' };
  PROPS[B.POPPY]         = { name:'Poppy',   solid:false,opaque:false,raycast:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.85,0.75]], faces:[T.POPPY], desc: '' };
  PROPS[B.ORCHID]        = { name:'Blue orchid',solid:false,opaque:false,raycast:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.85,0.75]], faces:[T.ORCHID], desc: '' };
  PROPS[B.TALL_LOWER]    = { name:'Tall grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, noInv:true, stack:79, type:'grass', hardness:0, boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.TALL_BOT], desc: '' };
  PROPS[B.TALL_UPPER]    = { name:'Tall grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',noInv:true, stack:79, hardness:0, type:'grass', boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.TALL_TOP], desc: '' };
});
