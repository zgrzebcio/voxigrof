'use strict';
/* blocks/wild-plants.js: the wild plants: desert scrub, bush, fern and tall fern, clover, thornweed, frost grass. Crossed quads like
   the grass, walked through, picked with E (WILD_PICK in player/foraging.js says what each gives; broken any other way, nothing).
   The bush, the ferns and the clover are grey art tinted the grass's colour when the atlas is built, with a pale blue cold tile and a pale warm
   one each for the climate (TINTED_PLANT_TILES in 03-atlas.js, TINTED in chunks/voxel-shared.js). Thornweed hurts (_thornweedTick,
   player/hazards.js). Only the clover goes with the seasons (SEASON_PLANTS, seasons/seasons.js). Where they grow: the WILDPLANTS pass in
   worldgen/ground-plants.js. What each may stand on when put down: player/place-block.js.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  PROPS[B.DESERT_SCRUB]    = { name:'Desert scrub', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,0.6,0.9]], faces:[T.DESERT_SCRUB],
                               desc: 'Grows in deserts and the Dryland. Pick it for sticks' };
  PROPS[B.BUSH]            = { name:'Bush', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.05,0,0.05,0.95,0.9,0.95]], faces:[T.BUSH_PLANT],
                               desc: 'Pick it for sticks and fiber' };
  PROPS[B.FERN]            = { name:'Fern', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,0.75,0.9]], faces:[T.FERN],
                               desc: 'Most at home in the cold' };
  PROPS[B.TALL_FERN_LOWER] = { name:'Tall fern', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, noInv:true, stack:79, hardness:0, type:'grass', boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.BIG_FERN_BOT], desc: '' };
  PROPS[B.TALL_FERN_UPPER] = { name:'Tall fern', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',noInv:true, stack:79, hardness:0, type:'grass', boxes:[[0.05,0,0.05,0.95,1,0.95]], faces:[T.BIG_FERN_TOP], desc: '' };
  PROPS[B.CLOVER]          = { name:'Clover', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.15,0,0.15,0.85,0.6,0.85]], faces:[T.CLOVER],
                               desc: 'A rare find on mild grass' };
  PROPS[B.THORNWEED]       = { name:'Thornweed', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.15,0,0.15,0.85,0.7,0.85]], faces:[T.THORNWEED],
                               desc: 'Grows on the cold plains and in spruce forests. Its thorns tear whoever walks through it' };
  PROPS[B.FROST_GRASS]     = { name:'Frost grass', solid:false,opaque:false,raycast:true, noTarget:true, pass:1, model:'cross',topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.1,0,0.1,0.9,0.85,0.9]], faces:[T.FROST_GRASS],
                               desc: 'Grows only in the deepest snow' };
});
