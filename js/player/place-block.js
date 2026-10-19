'use strict';
/* player/place-block.js: _doPlace, one right click from start to end. Animals and stations first, then what the held
   thing does (bucket, fire, key, seed...), then the block itself: where it may stand, how it is turned, what it costs. */

function _doPlace() {
  // shears on a woolly sheep: take the fleece instead of placing anything
  if (tryShearSheep()) { handPlaceSwing = true; return; }
  /* Using an ANIMAL beats using the world behind it: feeding, mounting and saddling all come
     before any block interaction, so a horse standing in front of a chest is still a horse. */
  // a bucket at a cow milks it, ahead of filling from water behind it
  if (typeof tryMilkCow === 'function' && tryMilkCow()) { handPlaceSwing = true; return; }
  // a hellhound: the mushroom that starts its taming, its food, its behaviour and stance (entities/hellhound.js)
  if (typeof tryHoundInteract === 'function' && tryHoundInteract()) { handPlaceSwing = true; return; }
  if (typeof tryTameInteract === 'function' && tryTameInteract()) { handPlaceSwing = true; return; }
  // empty bucket: fill from open water even when nothing solid is behind it (no block hit needed)
  if (slotId(HOTBAR[hotbarSel]) === ITEM.BUCKET) { useBucket(ITEM.BUCKET, null); return; }
  const hit = currentRay();
  if (!hit) return;
  // shears carve a pumpkin, a torch lights a carved one
  if (tryCarvePumpkin(hit)) { handPlaceSwing = true; return; }
  // flint or a glow crystal lights an unlit torch (blocks/torches.js)
  if (tryLightTorch(hit)) { handPlaceSwing = true; return; }
  // survival: right-clicking a crafting bench opens the advanced recipe list instead of placing
  // a bench with an order on it opens on a TAP instead, so holding the button can cancel the order
  // ...and a mortar and pestle works the same way with its own list
  if (!player.canFly && isStation(hit.id)) { if (!benchBusy(hit.x, hit.y, hit.z)) openBench(hit.x, hit.y, hit.z, STATION_MODE[hit.id & 255]); return; }
  // survival: right-clicking a furnace opens its smelting GUI
  if (!player.canFly && hit.id === B.FURNACE) { openFurnace(hit.x, hit.y, hit.z); return; }
  // doors open/close in any mode; a key locks, opens or unlocks one (blocks/doors.js)
  if (BLOCKS.isDoorVal(getBlock(hit.x, hit.y, hit.z))) { useDoor(hit.x, hit.y, hit.z); handPlaceSwing = true; return; }
  // right-clicking a bed sleeps through the night
  if (hit.id === B.BED) { trySleep(hit.x, hit.y, hit.z); handPlaceSwing = true; return; }
  // right-clicking a chest opens its storage GUI (both halves if it is a double)
  // structure block: a build tool, so it opens in BOTH modes (unlike the chest/bench/furnace)
  if (hit.id === B.STRUCTURE_BLOCK) { openStructureBlock(hit.x, hit.y, hit.z); handPlaceSwing = true; return; }
  // survival only, same as the bench and the furnace — in creative a chest is just a block to build with
  // a key locks, opens or unlocks one, and opens a sealed metal chest (useChest in blocks/chest.js)
  if (!player.canFly && isChestId(hit.id)) { useChest(hit.x, hit.y, hit.z); handPlaceSwing = true; return; }
  // a block with a variant picked places as that variant: stone as stone brick (blocks/variants.js)
  const heldId = heldBlockOf(slotId(HOTBAR[hotbarSel]));
  // buckets: fill empty bucket from a water source, or pour a water source from a full one
  if (heldId === ITEM.BUCKET || heldId === ITEM.WATER_BUCKET || heldId === ITEM.LAVA_BUCKET) { useBucket(heldId, hit); return; }
  /* Fire in the hand: the open cell on the face you click is set alight, or the plant you click itself. It is
     the fire lightning starts (igniteAt, 53-storms.js), so it spreads and burns out the same; on bare ground it lasts
     FIRE_ITEM_S. The fire remembers who lit it (what burns to death in it is that player's kill by fire). */
  if (heldId === ITEM.FIRE) {
    if (act && act.place) return;                  // one fire a press
    const plant = PROPS[hit.id & 255]?.model === 'cross';
    const fx = plant ? hit.x : hit.x + hit.nx, fy = plant ? hit.y : hit.y + hit.ny, fz = plant ? hit.z : hit.z + hit.nz;
    if (typeof igniteAt === 'function' && igniteAt(fx, fy, fz, player, FIRE_ITEM_S)) { handPlaceSwing = true; spendHeld('placed'); }
    return;
  }
  // sulfur tip: only placeable on the top or bottom face of a sulfur block.
  // Face → variant: top face = 0 (upward tip), bottom face = 1 (downward tip).
  if (heldId === B.SULFUR_UP_TIP) {
    if (hit.id !== B.SULFUR_BLOCK) return;
    if (hit.ny !== 1 && hit.ny !== -1) return;
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    const cur = getBlock(px, py, pz) & 255;
    if (cur !== B.AIR && cur !== B.WATER) return;
    const varb = hit.ny === 1 ? 0 : 1;
    setBlock(px, py, pz, B.SULFUR_UP_TIP | (varb << 8));
    playBlockSound(B.SULFUR_UP_TIP, 'place', px, py, pz);
    handPlaceSwing = true;
    spendHeld("placed");
    return;
  }
  /* A gem cluster grows on the face you click — floor, ceiling or wall — pointing away from it,
     and only off a solid block, as it grows in a cave. */
  if (heldId != null && heldId < 256 && PROPS[heldId]?.model === 'cluster') {
    if (isNoTargetPlant(hit.id) || !isSolid(hit.x, hit.y, hit.z)) return;
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    const cur = getBlock(px, py, pz) & 255;
    if (!isPlaceableInto(cur)) return;
    const o = hit.ny === 1 ? 0 : hit.ny === -1 ? 1 : hit.nx === 1 ? 2 : hit.nx === -1 ? 3 : hit.nz === 1 ? 4 : 5;
    if (isPlantReplaceable(cur)) clearPlantAt(px, py, pz);
    // one of the four looks, on the bed picked on the variant bar
    const bed = typeof heldVariantBitsOf === 'function' ? heldVariantBitsOf(slotId(HOTBAR[hotbarSel])) : 0;
    setBlock(px, py, pz, heldId | ((o | ((Math.random() * 4 | 0) << 3) | bed) << 8));
    playBlockSound(heldId, 'place', px, py, pz);
    handPlaceSwing = true;
    spendHeld("placed");
    return;
  }
  /* Carpet layers: with the chisel's Carpet picked, a stacking block (snow, leaves, sand, gravel,
     fiber) clicked onto a stack that will take it piles on as one more layer — any mix, up to 8. Once the
     stack is full, or will not take it, the click falls through to normal placement (a new layer above). */
  const layerShape = typeof chiselShapedPlace === 'function' ? chiselShapedPlace(heldId) : null;
  if (layerShape && layerShape.key === 'carpet' && canStackLayer(getBlock(hit.x, hit.y, hit.z), heldId)
      && addLayer(hit.x, hit.y, hit.z, heldId)) {
    playBlockSound(heldId, 'place', hit.x, hit.y, hit.z);
    handPlaceSwing = true;
    spendHeld("placed");
    chiselWear();
    return;
  }
  // grass on grass -> grow a 2-block tall grass (lower + upper), if there's headroom
  // ...and dry grass on dry grass a tall dry grass
  const tallOf = heldId === B.TALLGRASS ? B.TALL_LOWER : heldId === B.DRY_GRASS ? B.DRY_TALL_LOWER : 0;
  if (tallOf && hit.id === heldId && (getBlock(hit.x, hit.y + 1, hit.z) & 255) === B.AIR) {
    setBlock(hit.x, hit.y, hit.z, tallOf);
    setBlock(hit.x, hit.y + 1, hit.z, TALL_UPPER_OF[tallOf]);
    playBlockSound(B.TALL_LOWER, 'place', hit.x, hit.y, hit.z);
    handPlaceSwing = true;
    spendHeld("placed");
    return;
  }
  // short grass on short grass -> the grass plant
  if (heldId === B.SHORT_GRASS && hit.id === B.SHORT_GRASS) {
    setBlock(hit.x, hit.y, hit.z, B.TALLGRASS);
    playBlockSound(B.TALLGRASS, 'place', hit.x, hit.y, hit.z);
    handPlaceSwing = true;
    spendHeld("placed");
    return;
  }
  // a hollow log is a planter: dirt, grass or sand in hand packs into an empty one instead of placing
  if (HOLLOW_FILL_OF[heldId] && isHollowLog(hit.id)) {
    const hv = getBlock(hit.x, hit.y, hit.z);
    if (!hollowFillOf(hv)) {
      setBlock(hit.x, hit.y, hit.z, hv | (HOLLOW_FILL_OF[heldId] << 10));
      playBlockSound(heldId, 'place', hit.x, hit.y, hit.z);
      handPlaceSwing = true;
      spendHeld("placed");
      return;
    }
  }
  /* the chisel (variants since 0.783): a shapeable block in hand goes down as the picked slab,
     vertical slab or stairs — same block id, the shape in its variant byte */
  const shaped = typeof chiselShapedPlace === 'function' ? chiselShapedPlace(heldId) : null;
  const halfFill = !!shaped && (shaped.key === 'slab' || shaped.key === 'vslab');
  // the held block as a value with its look (blocks/looks.js), for filling a half
  const heldMat = ((heldId | ((typeof heldLookOf === 'function' ? heldLookOf(slotId(HOTBAR[hotbarSel])) : 0) << 16)) >>> 0);
  // filling a half, case 1: clicked the inner flat face of a half of this very block → complete THAT cell
  if (halfFill) {
    const hv = getBlock(hit.x, hit.y, hit.z);
    if (slabHalfTakes(hv, heldMat)) {                // ...or of another that mixes with it
      const h = ((hv >> 8) & 255) & ROT_MASK, o = h >> 1, axisN = o === 0 ? hit.ny : o === 1 ? hit.nx : hit.nz;
      if (axisN === ((h & 1) ? -1 : 1) && _fillHalf(hit.x, hit.y, hit.z, heldMat)) return;
    }
  }
  /* Creative can aim at a plant now, and "place on grass" has to mean where the grass STANDS,
     not floating in the air in front of it. So a plant hit redirects the placement into its own
     cell and mows it first — which is also what a survival placement into grass already did, it
     just got there by aiming at the ground underneath. */
  const ontoPlant = isNoTargetPlant(hit.id);
  // ...and the plant's own entry face is meaningless for orientation (a cross model can be
  // entered from the side), so tell the rest of the routine it was placed on the ground.
  if (ontoPlant) { hit.nx = 0; hit.ny = 1; hit.nz = 0; }
  const px = ontoPlant ? hit.x : hit.x + hit.nx,
        py = ontoPlant ? hit.y : hit.y + hit.ny,
        pz = ontoPlant ? hit.z : hit.z + hit.nz;
  const cur = getBlock(px, py, pz) & 255;
  // The plant itself is free ground for this placement — the clearPlantAt calls further down do
  // the mowing, so a click that ends up placing nothing (empty hand, no headroom) leaves it be.
  if (!isPlaceableInto(cur) && !(ontoPlant && isNoTargetPlant(cur))) {   // only into air/water/lava/grass...
    // ...case 2: unless the target cell holds a half of the held block, which this completes
    if (halfFill) {
      const tv = getBlock(px, py, pz);
      if (slabHalfTakes(tv, heldMat) && _fillHalf(px, py, pz, heldMat)) return;
    }
    // ...or a layer stack the held block piles onto (a layer clicked from the side or below)
    if (shaped && shaped.key === 'carpet' && canStackLayer(getBlock(px, py, pz), heldId) && addLayer(px, py, pz, heldId)) {
      playBlockSound(heldId, 'place', px, py, pz);
      handPlaceSwing = true;
      spendHeld("placed");
      chiselWear();
      return;
    }
    return;
  }
  const slot = HOTBAR[hotbarSel];
  let id = heldBlockOf(slotId(slot));
  if (id == null) return;                                  // empty hotbar slot -> nothing to place
  // items that place a block when used (sugar cane item -> sugar cane block)
  if (id === ITEM.SUGAR_CANE) id = B.SUGAR_CANE;
  if (id >= 256) return;                                   // items (sticks, etc.) are not placeable
  // the look picked on the variant bar (blocks/looks.js): kept in the cell's bits 16-23; a pillar look turns like a log
  const look = typeof heldLookOf === 'function' ? heldLookOf(slotId(slot)) : 0, lookE = look ? CORE.LOOKS[id]?.[look] : null;
  // food you carry rather than build with (the pumpkin). Creative still plants them.
  // ...and mushrooms: they come up by themselves; a food among them (grilled) just gets eaten, no warning
  if ((PROPS[id].noPlace || PROPS[id].shroom != null) && !player.canFly) {
    if (!PROPS[id].food) feedWarn(`${PROPS[id].name} cannot be planted`);
    return;
  }
  // billboards (torch, mushrooms, any cross model): any face works, but the target cell
  // must sit on a solid block (matches the support-break rule in setBlock)
  // ...except a torch clicked onto the SIDE of a solid block, which hangs on that wall
  const torchWall = !!PROPS[id].torch && hit.ny === 0 && !!(hit.nx || hit.nz) && !ontoPlant
                 && isSolid(hit.x, hit.y, hit.z);
  // ...and a cobweb, which can be strung anywhere: floor, wall or ceiling
  if (!torchWall && id !== B.COBWEB && (PROPS[id].topOnly || PROPS[id].model === 'cross') && !isSolid(px, py - 1, pz)) return;
  // a glow vine only hangs on the SIDE of a solid block
  const vineWall = PROPS[id].model === 'wall';
  if (vineWall && (hit.ny !== 0 || !(hit.nx || hit.nz) || ontoPlant || !isSolid(hit.x, hit.y, hit.z))) return;
  // flowers and grass plants require a grass block underneath (not any solid — no dirt/stone/etc.)
  // ...or an upright hollow log packed with dirt or grass, the planter
  if (id === B.SHORT_GRASS || id === B.TALLGRASS || id === B.POPPY || id === B.ORCHID || id === B.TALL_LOWER) {
    const bv = getBlock(px, py - 1, pz);
    if ((bv & 255) !== B.GRASS && !potSoil(bv)) return;
  }
  // saplings require grass underneath (same rule as flowers), but for a wood whose `saplingOn` is 'sand' (the
  // palm: the woods table, woods/woods.js)
  const sandSapling = isSapling(id) && woodOf(id).saplingOn === 'sand';
  if (isSapling(id) && !sandSapling) {
    const bv = getBlock(px, py - 1, pz);
    if ((bv & 255) !== B.GRASS && !potSoil(bv)) return;                  // a planter works too
  }
  /* such a sapling and the dry plants take grass, dirt, sand or red sand (a planter of soil or sand too); not
     pink sand, that is the warm beach's */
  if (sandSapling || id === B.DRY_GRASS || id === B.DRY_BUSH || id === B.DRY_TALL_LOWER) {
    const bv = getBlock(px, py - 1, pz), b = bv & 255;
    if (CORE.layerCount(bv) || (b !== B.GRASS && b !== B.DIRT && b !== B.SAND && b !== B.RED_SAND && !potSoil(bv) && !potSand(bv))) return;
  }
  // sugar cane: on top of an existing cane (stack up to 5), OR on sand (any)/grass/dirt/gravel with an
  // adjacent water block at the same y as the ground. Reject otherwise.
  if (id === B.SUGAR_CANE) {
    const below = getBlock(px, py - 1, pz) & 255;
    const isCaneBelow = below === B.SUGAR_CANE;
    if (isCaneBelow) {
      // count column height so far (below the target cell)
      let baseY = py - 1;
      while (baseY > 0 && (getBlock(px, baseY - 1, pz) & 255) === B.SUGAR_CANE) baseY--;
      if (py - baseY >= 5) return;                                       // already 5 tall
    } else {
      if (below !== B.SAND && below !== B.RED_SAND && below !== B.PINK_SAND && below !== B.GRASS && below !== B.DIRT
          && below !== B.GRAVEL) return;
      // must have water at ground level in any of 4 side neighbors of the block BELOW
      let nearWater = false;
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        if ((getBlock(px + dx, py - 1, pz + dz) & 255) === B.WATER) { nearWater = true; break; }
      }
      if (!nearWater) return;
    }
  }
  /* Cactus: grows on sand or on itself, and still refuses to touch a foreign solid on its sides.
     Another cactus IS allowed there now — that is how an arm attaches to the trunk. Placing
     against a cactus side lays the cell horizontally so it reads as an arm rather than a stray
     floating column. */
  if (id === B.CACTUS) {
    const below = getBlock(px, py - 1, pz) & 255;
    let armAxis = -1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nv = getBlock(px + dx, py, pz + dz), nid = nv & 255;
      if (nid === B.CACTUS) { if (armAxis < 0) armAxis = dx ? 1 : 2; continue; }
      if (CORE.solidVal(nv)) return;
    }
    // ...or a hollow log packed with sand
    if (below !== B.SAND && below !== B.RED_SAND && below !== B.PINK_SAND && below !== B.CACTUS && armAxis < 0 && !potSand(getBlock(px, py - 1, pz))) return;
    if (below !== B.CACTUS && armAxis >= 0) {
      clearPlantAt(px, py, pz);
      setBlock(px, py, pz, B.CACTUS | ((armAxis | (18 << 2)) << 8));    // slimmer, lying flat
      playBlockSound(B.CACTUS, 'place', px, py, pz);
      handPlaceSwing = true;
      spendHeld("placed");
      return;
    }
  }
  // a flared stump next door already fills this cell, whatever the block data says
  if (!OVERHANG_OK.includes(id) && logOverhangsCell(px, py, pz)) return;
  // don't place a solid inside yourself (a layer you wade through is fine)
  if (PROPS[id].solid && !(shaped && ((shaped.key === 'carpet' && PROPS[id].layerStack) || shaped.key === 'cover'))) {
    const p = player.pos, R = player.R;
    if (px + 1 > p.x - R && px < p.x + R && py + 1 > p.y && py < p.y + player.H &&
        pz + 1 > p.z - R && pz < p.z + R) return;
  }
  /* door: needs headroom + floor, places both halves, spawns the animated mesh. Since 0.842 a door is the hammer's Door
     shape of the held block (planks, the iron, copper and tin blocks, adobe, glass and their looks): in survival it takes
     DOOR_COST of them from the held stack and DOOR_WEAR of the hammer's durability. An old oak door item still places,
     as an oak planks door. */
  const doorShape = shaped && shaped.key === 'door';
  if (id === B.DOOR || doorShape) {
    const mat = id === B.DOOR ? B.PLANKS : (id | (look << 16)) >>> 0;   // a door of a look: dark glass, adobe brick
    const above = getBlock(px, py + 1, pz) & 255;
    if (!isPlaceableInto(above)) return;
    if (!isSolid(px, py - 1, pz)) return;
    if (doorShape && !player.canFly) {
      if ((slot?.count || 0) < DOOR_COST) { feedWarn(`A door takes ${DOOR_COST} ${PROPS[id].name.toLowerCase()}`); return; }
      if (!hammerCanDoor()) { feedWarn(`Your hammer needs repairing: a door takes ${DOOR_WEAR} of its durability`); return; }
    }
    const ddx = player.pos.x - (px + 0.5), ddz = player.pos.z - (pz + 0.5);
    const facing = Math.abs(ddx) > Math.abs(ddz) ? (ddx > 0 ? 2 : 3) : (ddz > 0 ? 0 : 1);
    // hinge side from WHERE on the block the ray landed: left half hinges left, right half right
    const hx = camera.position.x + _dir.x * hit.t, hz = camera.position.z + _dir.z * hit.t;
    let hingeRight = doorHingeFromHit(facing, hx - px, hz - pz);
    // beside an existing same-facing door (of any material), always take the opposite hinge — that is what turns
    // the two into a double door that opens outward from the shared edge
    const dirs = (facing === 0 || facing === 1) ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    for (const [dx, dz] of dirs) {
      const nv = getBlock(px + dx, py, pz + dz);
      if (!BLOCKS.isDoorVal(nv)) continue;
      const ndv = doorDv(nv);
      if ((ndv & 3) !== facing || (ndv & 8)) continue;
      hingeRight = !(ndv & DOOR_HINGE_R);
      break;
    }
    const dv = facing | (hingeRight ? DOOR_HINGE_R : 0);
    clearPlantAt(px, py, pz);
    clearPlantAt(px, py + 1, pz);
    setBlock(px, py + 1, pz, doorValOf(mat, dv | 8));
    setBlock(px, py, pz, doorValOf(mat, dv));               // the bottom half last: its hook makes the mesh (chunks/chunks.js)
    playBlockSound(mat & 255, 'place', px, py, pz);
    handPlaceSwing = true;
    if (doorShape) { for (let n = 0; n < DOOR_COST; n++) spendHeld("placed"); chiselWear(DOOR_WEAR); }
    else spendHeld("placed");
    return;
  }
  // bed: needs two free cells on solid ground, lays foot + head and spawns the mesh
  if (id === B.BED) {
    // its frame's wood from the variant bar
    if (!tryPlaceBed(px, py, pz, typeof heldVariantBitsOf === 'function' ? heldVariantBitsOf(slotId(slot)) : 0)) return;
    playBlockSound(B.BED, 'place', px, py, pz);   // its frame set down: it was silent
    handPlaceSwing = true;
    spendHeld("placed");
    return;
  }
  // rotation variant from placement context
  let varb = 0;
  // wall torch: its variant is the clicked face's normal — the direction it leans out toward
  if (torchWall) varb = hit.nx === 1 ? 1 : hit.nx === -1 ? 2 : hit.nz === 1 ? 3 : 4;
  // glow vine: its variant is the wall BEHIND it, the opposite of the clicked face's normal
  if (vineWall) varb = hit.nz === 1 ? 0 : hit.nz === -1 ? 1 : hit.nx === 1 ? 2 : 3;
  const rot = (lookE && lookE.rot) || PROPS[id].rot;
  const type = PROPS[id].model;
  // a placed berry bush arrives RIPE, matching the icon that was in the slot — a bare sprout
  // would give no sign which of the two bushes had just been put down
  // ...or at the stage picked on the variant bar, ripe by default; wheat the same
  const growth = isBerryBush(id) || id === B.WHEAT;
  if (growth) varb = typeof variantOptions === 'function' && variantOptions(slotId(slot)) ? heldVariantBitsOf(slotId(slot))
                   : isBerryBush(id) ? BERRY_STAGE.GROWN : 0;
  if (rot === 'side') {
    // front faces the player: facing = horizontal direction from block toward player
    const ddx = player.pos.x - (px + 0.5), ddz = player.pos.z - (pz + 0.5);
    varb = Math.abs(ddx) > Math.abs(ddz) ? (ddx > 0 ? 2 : 3) : (ddz > 0 ? 0 : 1);
  } else if (rot === 'all') {
    if (id === B.LOG || isHollowLog(id) || (lookE ? lookE.pillar : PROPS[id].pillar)) varb = hit.nx ? 1 : hit.nz ? 2 : 0;   // axis = clicked face normal (hollow logs 0.7842, pillars 0.8093)
  }
  if (shaped) varb = _shapeVariantFor(shaped.key, hit, px, py, pz);   // the chisel's shape
  // a furnace's rock, a bench's or a chest's wood, picked on the variant bar
  else if (!growth && typeof heldVariantBitsOf === 'function') varb |= heldVariantBitsOf(slotId(slot));
  // sugar cane: planted as a sprout that grows (on another cane a stage on); creative puts it down grown
  const caneSprout = id === B.SUGAR_CANE && !player.canFly;
  if (caneSprout) varb = (getBlock(px, py - 1, pz) & 255) === B.SUGAR_CANE ? CANE_STEPS - 1 : CANE_STEPS;
  clearPlantAt(px, py, pz);                 // grass in the way is destroyed, not a blocker
  setBlock(px, py, pz, (id | (varb << 8) | (look << 16)) >>> 0);
  if (caneSprout && typeof queueCaneGrow === 'function') queueCaneGrow(px, py, pz);
  playBlockSound(id, 'place', px, py, pz);
  if (isChestId(id)) {                        // a metal chest too
    tryPairChest(px, py, pz, varb & 3);       // link to a lone same-facing neighbour, if any
    registerChest(px, py, pz, varb & 3);      // spawn its animated mesh
  }
  if (id === B.TNT) armTNT(px, py, pz);          // start the fuse the moment TNT is placed
  if (isSapling(id)) armSapling(px, py, pz, id);   // any wood's sapling starts its clock
  /* Only an OPAQUE block smothers the grass under it. Anything light still gets through — leaves,
     leaf litter, snow carpets, glass, a chest, every cross billboard — leaves the grass alive.
     (this used to key off the cross model alone, which killed grass under a pane of glass
     and under every carpet you laid down.) */
  if (!shaped && PROPS[id]?.opaque && _plainGrass(getBlock(px, py - 1, pz))) setBlock(px, py - 1, pz, B.DIRT);
  handPlaceSwing = true;
  spendHeld("placed");
  if (shaped) chiselWear();                                // one point of chisel wear per shaped block
}
