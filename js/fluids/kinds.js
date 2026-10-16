'use strict';
/* fluids/kinds.js: THE FLUIDS TABLE. One entry per fluid; the rules they all flow by (fluids/rules.js) read it,
   so the rules name no fluid themselves.
   A part of VOXEL_CORE (chunks/voxel-core.js): it runs on the page AND as text in the workers, where the fluid
   thread lives. So an entry holds only block ids and numbers, nothing from the page.

   Each fluid's own file adds its entry with defineFluid: water.js, lava.js. Their script tags sit between this
   file's and fluids/rules.js'.

   WHAT AN ENTRY HOLDS
     name     what it is called
     step     how much thinner it gets each block it spreads (water 1, lava 2). A fluid cell's level is 0 at a
              source and goes up as it thins
     max      the thinnest level it reaches: with `step` that is how far it runs on flat ground
              (water 7 blocks, lava 3)
     delay    seconds between two turns of one cell: how fast it flows
     dry      seconds before a cell that is no longer fed dries up
     meets    what happens where it touches ANOTHER fluid, by that fluid's block id:
                flowing   the block a FLOWING cell of this fluid becomes
                source    the block a SOURCE of this fluid becomes
                turns     the block a flowing cell of this fluid turns the other fluid's cells beside it into
              Leave one out and that case does nothing. Two fluids with no entry for each other pass side by
              side untouched.

   A NEW FLUID (milk, oil...) is more than an entry. The list, so nothing is forgotten:
     1. its block: an id (blocks/ids.js), its tiles (blocks/tiles.js, 01-textures-data.js) and its PROPS, like
        water's in blocks/basic.js: not solid, no raycast, a see-through pass
     2. its entry here: a file like water.js, with its tag in index.html before fluids/rules.js. From then on it
        flows, falls, dries and meets the others
     3. how it is drawn: emitWater / emitLava in fluids/mesher-fluids.js are still one function per fluid
     4. what it does to a player and to the world, which the page still asks of water and lava by name: swimming
        and drowning, buckets, fire and ice, the current. Search the code for B.WATER and B.LAVA

   The page reads the table as CORE.FLUID (the return in chunks/voxel-core.js). */

corePart('voxel', function () {
  const FLUID = {};                                 // block id -> its entry
  const FLUID_IS = new Uint8Array(256);             // block id -> 1 when it is a fluid: asked for every cell of a chunk
  function defineFluid(id, def) {
    def.id = id;
    FLUID[id] = def;
    FLUID_IS[id] = 1;
    return def;
  }
});
