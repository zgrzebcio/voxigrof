'use strict';
/* blocks/plants.js: plants and small things on the ground. Cactus, berry bushes and their six stages, flint and
   stone pebbles, gourds and the carved pumpkin, salt crust, ash, fire, wheat; and the structure block.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  // cactus: own model — side faces inset 1/16 so the column reads thin; touching it hurts (19-vitals)
  /* Cactus runs on the LOG model. It gains an axis and a width index for free, which is what lets
     a saguaro put out arms: the arm is a horizontal cactus cell that flares into the trunk exactly
     the way a branch does. `family` keeps it from welding itself to actual wood if the two ever
     end up adjacent. No stripping and no leaves — those live in 33-felling, which only knows about
     the wood ids. */
  PROPS[B.CACTUS] = { name:'Cactus', solid:true, opaque:false, raycast:true, pass:1, model:'log', rot:'all', family:'cactus', stack:50, hardness:1.4, type:'grass', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.CACTUS_SIDE,T.CACTUS_SIDE,T.CACTUS_TOP,T.CACTUS_BOTTOM,T.CACTUS_SIDE,T.CACTUS_SIDE], desc: '' };
  /* Build tool, not a material: it has no recipe, so it only ever reaches a player through the
     creative palette. Left fully solid so a capture volume can be lined up against it. */
  PROPS[B.STRUCTURE_BLOCK] = { name:'Structure block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:1, hardness:1.0, type:'stone', faces:[T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK,T.STRUCTURE_BLOCK], desc: '' };
  /* Berry bushes — TWO separate blocks, red and blue, rather than one block with a
     colour bit. They share the first three stages of art (a sprout and a bare bush look the same
     whatever they will fruit into) and differ only at ripe, which is exactly how the art is
     drawn, so the split costs one block id and removes the bit-packing entirely.

     Cross billboards, `noTarget` like the grass, so the crosshair passes through and the ONLY way
     to work one is bush pickup: a ripe bush hands over its berries and drops back to empty, then
     regrows on its own. The variant byte is now nothing but the STAGE, and the stage numbers are
     the growth order, so advancing is stage + 1.

     Red keeps block id 82, so an existing world's bushes stay bushes. They do each shift down one
     stage once (0.7331 renumbering), which the regrow timer undoes on its own. */
  /* SIX STAGES since 0.827, each kind in its own art at every one: a sprout, a small bush, a bush, the bare bush a
     picked one drops back to, green fruit, ripe. The variant byte's low three bits; a bush saved before 0.827 (four
     stages) reads one of the first four and grows on from there. */
  const BERRY_STAGE = { SPROUT: 0, SMALL: 1, BUSH: 2, EMPTY: 3, FRUITLING: 4, GROWN: 5 };
  const berryStage = (v) => Math.min(BERRY_STAGE.GROWN, v & 7);
  const BERRY_BUSHES = [B.REDBERRY_BUSH, B.BLUEBERRY_BUSH, B.BLACKBERRY_BUSH, B.YELLOWBERRY_BUSH, B.WHITEBERRY_BUSH];
  const isBerryBush = (id) => BERRY_BUSHES.includes(id);
  const _berryBush = (name, kind, extra) => {
    const tiles = []; for (let s = 0; s < BERRY_STAGES; s++) tiles.push(T['BERRY_' + kind + '_S' + s]);
    return { name, solid:false, opaque:false, raycast:true, noTarget:true,
      pass:1, model:'cross', topOnly:true, stack:79, hardness:0, type:'grass',
      boxes:[[0.1,0,0.1,0.9,0.9,0.9]], faces:[tiles[BERRY_STAGE.GROWN]],
      tilesByVar:[...tiles, tiles[5], tiles[5]],         // indexed by stage (6 and 7 never happen: ripe)
      desc: '', ...extra };
  };
  // what each likes and gives: the berries' own effects are on the items below
  PROPS[B.REDBERRY_BUSH]    = _berryBush('Red berry bush',    'RED',   { desc: 'Grows in forests, most of all high on the mountains.' });
  PROPS[B.BLUEBERRY_BUSH]   = _berryBush('Blue berry bush',   'BLUE',  { desc: 'Grows by water: forest lakes and shores, rarely.' });
  PROPS[B.BLACKBERRY_BUSH]  = _berryBush('Blackberry bush',   'BLACK', { desc: 'Grows in dark, cold forests like the spruce. Its berries are poisonous.' });   // 0.7947 (yellow until 0.8099)
  // the yellow one glows: a little with green fruit, more when ripe (light by stage, 08-light-glow.js)
  PROPS[B.YELLOWBERRY_BUSH] = _berryBush('Yellow berry bush', 'YELLOW', { lightByVar: [0, 0, 0, 0, 3, 7, 7, 7],
                                          desc: 'Grows rarely in the darkest forests and on the dirt of caves, and glows as it ripens.' });
  PROPS[B.WHITEBERRY_BUSH]  = _berryBush('White berry bush',  'WHITE', { desc: 'Grows in light, sunny forests like the birch.' });
  PROPS[B.PINCUSHION] = { name:'Pincushion', solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.7,0.75]], faces:[T.PINCUSHION], desc: '' };
  /* Flint stone — a dark nodule lying on the turf. Built on the `carpet` model, which is
     just "one flat box, chosen by variant", so it renders as a low slab rather than a full cube;
     it has a single variant because nothing about it stacks. `noTarget` puts it in the same class
     as the grass and the berry bush: the crosshair passes straight through and BUSH PICKUP is how
     you take it, which is what makes it a stoop-and-grab rather than something you mine. */
  /* 16 x 8 x 16 of this game's 64-pixel block, i.e. a quarter of a cell wide and an
     eighth of one tall — a pebble sitting in the middle of its cell, not a slab covering it.
     0.733 shipped this eight times too big by reading the pixel sizes against a 16-unit block;
     voxiGrof's unit is 64, so every pixel dimension here divides by 64.
     One entry, because the variant byte means nothing here; the array shape is only what the
     carpet model expects. */
  const FR = 1 / 64;
  const FLINT_ROCK_BOX = [[[24 * FR, 0, 24 * FR, 40 * FR, 8 * FR, 40 * FR]]];
  PROPS[B.FLINT_ROCK] = { name:'Flint pebble', solid:false, opaque:false, raycast:true, noTarget:true,
                          pass:0, model:'carpet', topOnly:true, stack:50, hardness:0.4, type:'stone',
                          boxes:FLINT_ROCK_BOX[0], boxesByVar:FLINT_ROCK_BOX,
                          faces:[T.FLINT_ROCK, T.FLINT_ROCK, T.FLINT_ROCK_TOP, T.FLINT_ROCK_TOP,
                                 T.FLINT_ROCK, T.FLINT_ROCK],
                          desc: 'Pick it up by hand for flint' };
  /* Stone pebble: the flint pebble's shape in plain stone, and the way into the stone age now that a
     flint pickaxe breaks stone without keeping any. Picked up by hand for a pebble; five press into a stone. */
  PROPS[B.STONE_PEBBLE] = { ...PROPS[B.FLINT_ROCK], name:'Stone pebble', faces: Array(6).fill(T.STONE),
                            desc: 'Pick it up by hand for a stone pebble' };
  // the clay bricks block is TERRACOTTA since 0.8093 (same id, same recipe); its brick look is a variant
  PROPS[B.BRICKS]    = { name:'Terracotta', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:6.5, type:'stone', faces:[T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS,T.BRICKS], desc: '' };
  /* Gourds — 32 x 32 x 32 of this game's 64-pixel block, so half a cell across and half
     a cell tall, centred on the floor of its cell rather than filling it. They are FRUIT lying in
     a field, not masonry: you walk straight through one (`solid:false`), the crosshair passes over
     it (`noTarget:true`), and bush pickup is what gathers it — the same stoop-and-grab the berry
     bushes and flint stones use. Built on the `carpet` model, which is just "one box picked by
     variant", so the shape needs no new mesher path. */
  const GOURD_BOX = [[[16 / 64, 0, 16 / 64, 48 / 64, 32 / 64, 48 / 64]]];
  const FULL_UV_BOX = [0, 0, 0, 1, 1, 1];            // a `fullUV` model's UVs: the whole tile on every face
  const _gourd = (name, side, top, bottom = top) => ({
    name, solid:false, opaque:false, raycast:true, noTarget:true,
    pass:0, model:'carpet', topOnly:true, stack:50, hardness:2.5, type:'wood',
    boxes:GOURD_BOX[0], boxesByVar:GOURD_BOX,
    faces:[side, side, top, bottom, side, side], desc: '',
  });
  // cantaloupe: a third gourd, gathered and sliced like the watermelon
  PROPS[B.CANTALOUPE] = _gourd('Cantaloupe', T.CANTALOUPE_SIDE, T.CANTALOUPE_TOP, T.CANTALOUPE_BOTTOM);
  /* Salt crust (a full block since 0.8097): a block that takes the carpet shape and piles and mixes
     like sand or snow — worldgen lays it one layer deep on beach sand at the water's edge. Broken, it gives
     salt (50-loottable.js), and each layer slows you a little (player/movement.js). */
  PROPS[B.SALT_CRUST] = { name:'Salt crust', solid:true, opaque:true, raycast:true, pass:0, model:'cube',
                          stack:50, hardness:0.6, type:'ground', faces:Array(6).fill(T.SALT_CRUST), desc: '' };
  /* Ash: what fire leaves on the ground. Piles in layers like sand and falls like it; a layer gives ashes
     half the time (50-loottable.js). */
  PROPS[B.ASH] = { name:'Ash', solid:true, opaque:true, raycast:true, pass:0, model:'cube',
                   stack:50, hardness:0.3, type:'ground', faces:Array(6).fill(T.ASH), desc: '' };
  /* Fire: a burning cell. It draws nothing — the flames are particles (53-storms.js) — but it is a light
     source, and it is what burns its neighbours: wood, leaves, grass. Never an item. */
  PROPS[B.FIRE] = { name:'Fire', solid:false, opaque:false, raycast:false, noTarget:true, noInv:true, pass:1, model:'none',
                    stack:1, hardness:0, type:'grass', light:13, faces:Array(6).fill(T.ASH), boxes:[[0,0,0,1,1,1]], desc: '' };
  PROPS[B.MELON]    = _gourd('Watermelon', T.MELON_SIDE, T.MELON_TOP);
  PROPS[B.PUMPKIN]  = _gourd('Pumpkin', T.PUMPKIN_SIDE, T.PUMPKIN_TOP);
  /* Carved pumpkin and jack o'lantern: shears carve a pumpkin where it lies, a torch lights a carved one
     (tryCarvePumpkin, player/breaking.js). The pumpkin's own small model, its face turned to whoever placed or carved it
     (rot:'side' bits 0-1, facesByVar), and the whole picture on each face rather than its middle (fullUV). They keep:
     no spoiling, and unlike the pumpkin they are placed. */
  const _carvedFaces = (front) => [0, 1, 2, 3].map(f => {
    const fs = [T.PUMPKIN_SIDE, T.PUMPKIN_SIDE, T.CARVED_PUMPKIN_TOP, T.PUMPKIN_TOP, T.PUMPKIN_SIDE, T.PUMPKIN_SIDE];
    fs[SIDE_FACE[f]] = front;
    return fs;
  });
  const _carved = (name, front, extra) => ({ ..._gourd(name, T.PUMPKIN_SIDE, T.CARVED_PUMPKIN_TOP, T.PUMPKIN_TOP), rot:'side', fullUV:true,
    boxesByVar:[GOURD_BOX[0], GOURD_BOX[0], GOURD_BOX[0], GOURD_BOX[0]], facesByVar:_carvedFaces(front), faces:_carvedFaces(front)[0], ...extra });
  PROPS[B.CARVED_PUMPKIN] = _carved('Carved pumpkin', T.CARVED_PUMPKIN_FRONT, { desc: 'Right-click it with a torch to light it' });
  PROPS[B.JACK_O_LANTERN] = _carved("Jack o'lantern", T.JACK_O_LANTERN_FRONT, { light: 14 });
  /* Wheat grows: variant 0 is RIPE, as every wheat the world ever generated is, and 1-7 are the growing
     stages 0-6 (seasons/seasons.js climbs them). Only ripe wheat gives wheat when gathered. */
  PROPS[B.WHEAT]    = { name:'Wheat', solid:false, opaque:false, raycast:true, noTarget:true, pass:1, model:'cross', stack:79, hardness:0, type:'grass', boxes:[[0.15,0,0.15,0.85,0.9,0.85]], faces:[T.WHEAT],
                        tilesByVar: [T.WHEAT, T.WHEAT_S0, T.WHEAT_S1, T.WHEAT_S2, T.WHEAT_S3, T.WHEAT_S4, T.WHEAT_S5, T.WHEAT_S5], desc: '' };   // six growing stages since 0.8273 (seven before); 7 only in old saves
  PROPS[B.STONE_BRICK]    = { name:'Stone (brick)', noInv:true, solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50,  hardness:8.5, type:'stone', faces:[T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK,T.STONE_BRICK], desc: '' };
  PROPS[B.WOOL]    = { name:'Wool', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:2.5, type:'wool', faces:[T.WOOL,T.WOOL,T.WOOL,T.WOOL,T.WOOL,T.WOOL], desc: '' };
  PROPS[B.HAY]     = { name:'Hay bale', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:1.0, type:'grass', faces:[T.HAY_SIDE,T.HAY_SIDE,T.HAY_TOP,T.HAY_TOP,T.HAY_SIDE,T.HAY_SIDE], desc: '' };
});
