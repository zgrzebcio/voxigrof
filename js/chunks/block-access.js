'use strict';
/* chunks/block-access.js: reading and writing the world. getBlock, a cell's boxes for collision and the crosshair,
   and setBlock with everything a change sets off (light, fluids, neighbours, snow and grass, meshes). */

/* ---------------------------------- world block access ---------------------------------- */
function getBlock(x, y, z) {
  if (y < 0 || y > WORLD_TOP) return 0;
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!c || !c.data) return 0;
  return c.data[(x & 15) + ((z & 15) << 4) + (y << 8)];
}
// by value: a stack of snow, leaves or sand is its block's id but not solid
const isSolid = (x, y, z) => CORE.solidVal(getBlock(x, y, z));
// a grass BLOCK (snowy or not) — not a grass cover, which grass spread, snow and grazing must leave alone
const _plainGrass = (v) => (v & 255) === B.GRASS && !CORE.shapeOfVal(v);
const FULL_BOX = [[0, 0, 0, 1, 1, 1]];
// collision sub-boxes of the block at (x,y,z) in world coords, or null if non-solid
function blockBoxes(x, y, z) {
  const val = getBlock(x, y, z);
  const prop = PROPS[val & 255];
  if (!prop || !prop.solid) return null;
  // chiseled shapes: corners included, and a fence's taller collision set
  { const sb = CORE.shapeBoxesAt(getBlock, x, y, z, val, true); if (sb) return sb; }
  if (prop.boxesOf) return prop.boxesOf(val);      // variant too wide to index (layered carpet)
  if (prop.boxesByVar) { const b = prop.boxesByVar[(val >> 8) & 255]; if (b) return b; }
  // loose ground gave underfoot (a whole sand, gravel or snow block stopped your feet 30% down into it). Sand and
  // gravel stand full height since 0.8444, snow since 0.8445: SINK_BLOCKS is empty, and kept for a block that should sink
  if (SINK_BLOCKS.size && SINK_BLOCKS.has(val)) return SINK_BOX;
  return prop.boxes || FULL_BOX;
}
const SINK_BOX = [[0, 0, 0, 1, 0.7, 1]];
// sand and gravel stand full height again (they were here too); snow as well
const SINK_BLOCKS = new Set();   // by value: whole blocks only
// raycast / selection / crack box list for the block at (x,y,z) — same corner logic, honouring
// rayBoxesByVar (doors) where present. Returns falsy for full cubes so callers fall back to 1×1×1.
function rayBoxesAt(x, y, z) {
  const val = getBlock(x, y, z), prop = PROPS[val & 255];
  if (!prop) return null;
  { const sb = CORE.shapeBoxesAt(getBlock, x, y, z, val); if (sb) return sb; }
  if (CORE.slabMixed(val)) return CORE.slabMixBoxes(val);   // its two halves, so the crosshair knows which
  if (prop.boxesOf) return prop.boxesOf(val);
  const bvr = prop.rayBoxesByVar || prop.boxesByVar;
  return bvr ? (bvr[(val >> 8) & 255] || prop.boxes) : prop.boxes;
}

let editRushing = false;   // true while a player edit runs: marks its re-meshes for grouped apply
/* true while fluids/fluids.js writes what the fluid simulation decided: setBlock's fluid hooks keep quiet (the
   simulation queued what follows itself), and its re-meshes are not a player's, so they never jump the queue */
let fluidApplying = false;
// set by 34-structures.js around bulk stamping; see the lighting note inside setBlock
let structBulkLight = false;
function setBlock(x, y, z, val) {
  if (y < 0 || y > WORLD_TOP) return;
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  const c = getChunk(cx, cz);
  if (!c || !c.data) return;
  editRushing = !fluidApplying;                        // a fluid's flowing is no player edit
  const lx = x & 15, lz = z & 15;
  const i = lx + (lz << 4) + (y << 8);
  if (c.data[i] === val) return;
  const oldVal = c.data[i], oldId = oldVal & 255, newId = val & 255;
  c.data[i] = val;
  // a mixed layer stack's list goes the moment its cell stops being one (setLayerStack writes a new list first)
  // ...and a mixed slab's the same way
  if (CORE.sideListed(oldVal) && !CORE.sideListed(val)) LAYER_STACKS.get(key(cx, cz))?.delete(i);
  const oldLit = blockLightOf(oldVal) > 0, newLit = blockLightOf(val) > 0;
  if (oldLit && !newLit) glowDel(x, y, z);
  if (newLit && !oldLit) glowAdd(x, y, z);
  // heat appearing melts ice in its reach; ice placed beside heat melts (seasons/seasons.js)
  if (newLit && !oldLit && typeof iceHeatPlaced === 'function') iceHeatPlaced(x, y, z, val);
  if (newId === B.ICE && oldId !== B.ICE && typeof iceQueueIfHot === 'function') iceQueueIfHot(x, y, z);
  // a torch or glow block placed starts burning; one taken away is forgotten (blocks/torches.js)
  if (typeof burnPlaced === 'function') burnPlaced(x, y, z, oldVal, val);
  // leveling ledger: remember cells the player placed into, forget them when they are cleared
  if (typeof notePlacedCell === 'function') notePlacedCell(x, y, z, newId);
  let edits = editStore.get(key(cx, cz));
  if (!edits) editStore.set(key(cx, cz), edits = new Map());
  edits.set(i, val);
  markDirty(c);
  // faces on the border also live in the neighbour's mesh
  if (lx === 0)  markDirty(getChunk(cx - 1, cz));
  if (lx === 15) markDirty(getChunk(cx + 1, cz));
  if (lz === 0)  markDirty(getChunk(cx, cz - 1));
  if (lz === 15) markDirty(getChunk(cx, cz + 1));
  /* Lighting is by far the most expensive part of a setBlock: a single opacity change kicks off a
     sky-light BFS, and carving a dungeon room is a couple of hundred of them back to back. While
     a structure is being stamped the flag below suppresses the per-cell work, and 34-structures.js
     re-lights each affected chunk ONCE when the job finishes. Everything else in setBlock still
     runs, so the world data and the edit store stay correct either way. */
  if (!structBulkLight) {
    // re-flood block light if this change is/was a light source or sits within reach of one
    // (oldLit matters: a removed source is already out of glowLights, so glowNear misses it)
    /* Light only stops at opaque cells, so an edit that keeps the opacity (a leaf, a log, a plant or
       litter going to air) cannot change it. Relighting those anyway near a torch — even one
       in the hand — was a 37-block box per cell: the tree-felling spike. */
    // ...nor a change in how much a shaped cell holds back (a slab placed or taken)
    const opaqueChanged = CORE.opaqueVal(oldVal) !== CORE.opaqueVal(val) || CORE.lightDim(oldVal) !== CORE.lightDim(val);
    if (oldLit || newLit || (opaqueChanged && glowNear(x, y, z))) relight(x, y, z);
    // sky light changes on ANY opacity edit (dig opens daylight in, place casts shade)
    if (opaqueChanged) reskyAround(x, y, z);   // by value: chiseling a block opens it
  }
  // snow-on-grass: the grass directly under a snow block wears snowy sides (variant), and reverts
  // to plain grass when the snow is removed. Recursive setBlock is safe (grass fires no snow hook).
  // A stack of snow layers is the snow block's own id, so it counts; a stack topped with leaves does not.
  const _snowy = (v) => (v & 255) === B.SNOW;
  if (_snowy(val) && !_snowy(oldVal) && getBlock(x, y - 1, z) === B.GRASS)
    setBlock(x, y - 1, z, B.GRASS | (V.GRASS_SNOWY << 8));
  if (_snowy(oldVal) && !_snowy(val)) {
    const below = getBlock(x, y - 1, z);
    if ((below & 255) === B.GRASS && ((below >> 8) & 255) === V.GRASS_SNOWY) setBlock(x, y - 1, z, B.GRASS);
  }
  // fluid contact reactions: placing water next to lava (or vice versa) must trigger the
  // opposite fluid's own tick queue so the transmute rules (obsidian/stone/cobble) fire.
  if (newId === B.WATER) queueLavaAround(x, y, z);
  if (newId === B.LAVA)  queueWaterAround(x, y, z);
  // any block change ripples nearby fluids: cleared cells let them fill, placed cells might cut
  // off flow. Cheap because queueWaterAt/queueLavaAt no-op unless neighbour is actually fluid.
  if (newId !== B.WATER && newId !== B.LAVA) {
    queueWaterAround(x, y, z);
    queueLavaAround(x, y, z);
  }
  // fluid on top of grass block wears it back to dirt (any level, water or lava)
  if ((newId === B.WATER || newId === B.LAVA) && y > 0 && _plainGrass(getBlock(x, y - 1, z)))
    setBlock(x, y - 1, z, B.DIRT);
  // water source destroyed (replaced by anything non-water): dry every flowing cell it fed
  // (the level is bits 0-2; 3-6 are a river's way, 0.844 reads & 7, 15 took a river's top for flowing)
  if (oldId === B.WATER && ((oldVal >> 8) & 7) === 0 && newId !== B.WATER) dryWaterFrom(x, y, z);
  // same rule for lava sources
  if (oldId === B.LAVA && ((oldVal >> 8) & 7) === 0 && newId !== B.LAVA) dryLavaFrom(x, y, z);
  // furnace removed/replaced: spill its contents and drop the state
  if (oldId === B.FURNACE && newId !== B.FURNACE) furnaceBroken(x, y, z);
  // door half removed: take the other half + the animated mesh with it
  // a door is a shape of its material since 0.842; a new one's mesh comes up as its bottom half is set
  if (BLOCKS.isDoorVal(oldVal) && !BLOCKS.isDoorVal(val)) doorBroken(x, y, z, oldVal);
  else if (BLOCKS.isDoorVal(val) && !((val >> 8) & 8)) registerDoor(x, y, z, val);
  // bed half removed: take the other half + the mesh with it
  if (oldId === B.BED && newId !== B.BED) bedBroken(x, y, z, oldVal);
  // a termite hill's cell broken (the whole hill goes, its termites come out) or one put down (blocks/termite-hill.js)
  if ((oldId === B.TERMITE_HILL || newId === B.TERMITE_HILL) && typeof termiteHillChanged === 'function') termiteHillChanged(x, y, z, oldVal, val);
  // ...and one standing on this cell needs a full block under it, or it breaks
  if (y < WORLD_TOP && typeof termiteHillFloor === 'function' && !termiteHillFloor(val) && (getBlock(x, y + 1, z) & 255) === B.TERMITE_HILL) termiteHillUnder(x, y, z, val);
  // chest removed/replaced: spill its contents and drop the mesh
  if (isChestId(oldId) && newId !== oldId) chestBroken(x, y, z, oldVal);   // wooden or metal
  // crafting bench removed: its order (finished and unfinished) spills on the floor
  if (oldId === B.CRAFTING_BENCH && newId !== B.CRAFTING_BENCH) benchBroken(x, y, z);
  if (PROPS[oldId]?.mortar && newId !== oldId) benchBroken(x, y, z);          // a mortar's order spills too (any variant 0.7945)
  // structure block gone: forget its size/name settings and drop its outline
  if (oldId === B.STRUCTURE_BLOCK && newId !== B.STRUCTURE_BLOCK) structBlockBroken(x, y, z);
  // placing a solid block against a cactus's side snaps the cactus off (column chain-breaks up).
  // Cactus is exempt from its own rule — arms attach side-on to the trunk.
  if (CORE.solidVal(val) && newId !== B.CACTUS)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if ((getBlock(nx, y, nz) & 255) === B.CACTUS) {
        setBlock(nx, y, nz, B.AIR);
        if (!player.canFly)
          for (const d of blockDrop(B.CACTUS)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, nx, y, nz);
      }
    }
  // tall grass: breaking the UPPER half removes the lower half too (whole plant goes)
  if (newId === B.AIR && oldId === B.TALL_UPPER && (getBlock(x, y - 1, z) & 255) === B.TALL_LOWER)
    setBlock(x, y - 1, z, B.AIR);
  if (newId === B.AIR && oldId === B.DRY_TALL_UPPER && (getBlock(x, y - 1, z) & 255) === B.DRY_TALL_LOWER)   // the dry one
    setBlock(x, y - 1, z, B.AIR);
  /* Door / bed support: both need solid ground under them, so digging out any ONE of the cells
     they stand on drops the whole thing. Each block's own break hook then takes its other half,
     so only the cell directly above has to be handled here. Guarded on the new block not being
     solid, otherwise swapping dirt for stone under a door would demolish it. */
  if (!CORE.solidVal(val) && y + 1 <= WORLD_TOP) {
    const upVal = getBlock(x, y + 1, z), upId = upVal & 255;
    const isDoorBottom = BLOCKS.isDoorVal(upVal) && !((upVal >> 8) & 8);   // a door of any material
    if (isDoorBottom || upId === B.BED) {
      setBlock(x, y + 1, z, B.AIR);
      if (!player.canFly)
        for (const d of isDoorBottom ? doorDropOf(upVal) : blockDrop(upId)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y + 1, z);
    }
  }
  /* Wall torches hang off the SIDE of a block. When that block goes, any torch mounted on
     it falls: a torch at (x+dx, z+dz) whose variant points that same way is leaning away from
     exactly this block. */
  if (newId === B.AIR)
    for (const [dx, dz, tv] of [[1, 0, 1], [-1, 0, 2], [0, 1, 3], [0, -1, 4]]) {
      const nv = getBlock(x + dx, y, z + dz);
      if (!PROPS[nv & 255]?.torch || ((nv >> 8) & 7) !== tv) continue;   // any torch
      setBlock(x + dx, y, z + dz, B.AIR);
      if (!player.canFly)
        for (const d of blockDrop(nv & 255)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x + dx, y, z + dz);
    }
  /* A glow vine clings to the block behind it: take that block away and the vine comes down with
     it. Nothing harvested it, so it drops nothing. [dx, dz, the variant of a vine whose wall is this cell] */
  if (newId === B.AIR)
    for (const [dx, dz, vv] of [[1, 0, 2], [-1, 0, 3], [0, 1, 0], [0, -1, 1]]) {
      const nv = getBlock(x + dx, y, z + dz);
      if (PROPS[nv & 255]?.model !== 'wall' || ((nv >> 8) & 3) !== vv) continue;
      setBlock(x + dx, y, z + dz, B.AIR);
      // a ladder is something you built: it drops back as a ladder. A vine just falls apart.
      if ((nv & 255) === B.LADDER && !player.canFly) spawnDrop(B.LADDER, x + dx, y, z + dz);
    }
  // billboard support: breaking the block under a cross-model block (torch, mushroom) pops it off
  if (newId === B.AIR && y + 1 <= WORLD_TOP) {
    const aboveVal = getBlock(x, y + 1, z), above = aboveVal & 255;
    // ...unless it is a WALL torch, whose support is the wall behind it, not the floor
    const wallTorch = !!PROPS[above]?.torch && ((aboveVal >> 8) & 7) !== 0;
    // a cobweb needs no floor under it
    if ((PROPS[above]?.model === 'cross' && !wallTorch && above !== B.COBWEB) || above === B.CACTUS) {   // cactus columns chain-break upward
      setBlock(x, y + 1, z, B.AIR);
      if (!player.canFly)
        for (const d of blockDrop(above)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y + 1, z);
    }
  }
  /* A cactus arm hangs off the SIDE of its trunk, so the upward chain-break above never reached
     it — cutting the trunk out left arms floating. When a cactus goes, take any neighbouring cell
     that is a cactus lying horizontally (variant axis 1 or 2, i.e. an arm root rather than another
     column). Removing that root re-enters this hook, and the upward rule carries the rest of the
     arm with it. */
  if (oldId === B.CACTUS && newId !== B.CACTUS)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const nv = getBlock(nx, y, nz);
      if ((nv & 255) !== B.CACTUS || (((nv >> 8) & 3) === 0)) continue;   // vertical = its own trunk
      setBlock(nx, y, nz, B.AIR);
      if (!player.canFly)
        for (const d of blockDrop(B.CACTUS)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, nx, y, nz);
    }
  // sulfur down-tip hangs from the block ABOVE — pop it when that ceiling block is destroyed
  if (newId === B.AIR && y > 0) {
    const bVal = getBlock(x, y - 1, z);
    if ((bVal & 255) === B.SULFUR_UP_TIP && ((bVal >> 8) & 1)) {
      setBlock(x, y - 1, z, B.AIR);
      if (!player.canFly)
        for (const d of blockDrop(B.SULFUR_UP_TIP)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y - 1, z);
    }
  }
  /* A gem cluster grows out of the block behind it: take that block away and the cluster comes off
     as an ITEM, not as gems — so breaking the stone behind it with a poor pickaxe cannot skip the tier a
     cluster needs. It sits at this cell + CLUSTER_DIRS[o], pointing along that same direction. */
  if (newId === B.AIR)
    for (let o = 0; o < 6; o++) {
      const [dx, dy, dz] = CORE.CLUSTER_DIRS[o];
      const nv = getBlock(x + dx, y + dy, z + dz);
      if (PROPS[nv & 255]?.model !== 'cluster' || ((nv >> 8) & 7) !== o) continue;
      setBlock(x + dx, y + dy, z + dz, B.AIR);
      if (!player.canFly) spawnDrop(nv & 255, x + dx, y + dy, z + dz);   // whatever its bed, the gem's own cluster item
    }
  // gravity: clear below a gravity block → it falls; gravity block placed above air → also falls
  if (newId === B.AIR && y + 1 <= WORLD_TOP) scheduleFall(x, y + 1, z);
  // a stack of snow, leaves, sand, gravel or fiber falls too
  // ...and a stack that comes to rest on a stack with room for it pours down into it (ash from a burnt tree,
  // or any stack stepping down, stopped a cell short and stood on top as a stack of its own)
  if ((LOOSE_LAYER_BLOCKS.has(newId) || FALL_WHOLE_BLOCKS.has(val)                                 // + a hay bale, whole
       || (PROPS[newId]?.layerStack && CORE.layerCount(val)))                                     // fiber falls since 0.786
      && y > 0) {
    const below = getBlock(x, y - 1, z);
    if ((below & 255) === B.AIR || (CORE.layerCount(val) && canStackLayer(below, newId))) scheduleFall(x, y, z);
  }
  /* a player's edit: its re-mesh goes to a worker now, not when a worker next answers or the frame comes round.
     Only while a player is digging or building (notePlayerEdit, from tickPlayer): the world's own changes (growth,
     seasons, a structure going up) come many to a chunk, and are better meshed once after the lot. */
  const rushed = editRushing;
  editRushing = false;
  if (rushed && !structBulkLight && meshQueue.length && performance.now() - _playerEditAt < PLAYER_EDIT_MS) pump();
}
let _playerEditAt = -1e9;
const PLAYER_EDIT_MS = 40;
function notePlayerEdit() { _playerEditAt = performance.now(); }
