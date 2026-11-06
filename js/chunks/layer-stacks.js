'use strict';
/* chunks/layer-stacks.js: cells that hold more than one thing. Stacks of mixed carpets and layers, and mixed slabs,
   kept in a sparse map per chunk (LAYER_STACKS). */

/* ---- layer stacks ----
   Carpets are a shape now: a cell of layers is its TOP block's id with the layer count in the variant. A
   stack that mixes blocks keeps its list here, beside the chunk — so the world array stays 32 bits a cell
   and only mixed stacks cost anything, a few bytes each. setBlock drops an entry the moment its cell stops
   being a mixed stack; the list is saved with the world and handed to the mesher with its chunk. */
/* "cx,cz" -> Map(cell index -> Uint16Array of ENTRIES, bottom to top). An entry is id | look << 8 (stackEntry,
   blocks/looks.js): a stack of stone and polished stone layers, a mixed slab of granite brick on stone. A list saved
   before 0.84691 holds plain ids, which are entries already. Read an entry's block with `& 255`. */
const LAYER_STACKS = new Map();
const _cellIndex = (x, y, z) => (x & 15) + ((z & 15) << 4) + (y << 8);
// the blocks of a layer stack as entries (id | look << 8), bottom to top, or null when the cell is not one
// ...a carpet lying among a plant counts: what melts, rots or is washed off works on it as on any stack
function layerIdsAt(x, y, z, v = getBlock(x, y, z)) {
  const n = CORE.layerCount(v);
  if (!n) { const k = CORE.carpetCount(v); return k ? new Array(k).fill(CORE.carpetId(v)) : null; }
  if (CORE.layerMixed(v)) {
    const ids = LAYER_STACKS.get(key(Math.floor(x / 16), Math.floor(z / 16)))?.get(_cellIndex(x, y, z));
    if (ids && ids.length === n) return Array.from(ids);
  }
  return new Array(n).fill(stackEntry(v));
}
// write a whole stack of entries, bottom to top. Nothing left is air; one block all the way needs no list.
// In a plant's cell it lies among the plant while it can (below); what cannot buries the plant.
function setLayerStack(x, y, z, ids) {
  if (y < 0 || y > WORLD_TOP) return;
  ids = ids.slice(0, LAYER_MAX);
  const here = getBlock(x, y, z);
  if (carpetFits(x, y, z, here)) {
    if (!ids.length) { setBlockBare(x, y, z, CORE.withCarpet(here, 0, 0)); return; }
    if (ids.length <= CORE.CARPET_MAX && ids.every(b => b === ids[0]) && !(ids[0] >> 8) && PROPS[ids[0] & 255]?.layerStack) {
      setBlockBare(x, y, z, CORE.withCarpet(here, ids[0], ids.length));
      return;
    }
    crushBillboard(x, y, z);
  }
  if (!ids.length) { setBlock(x, y, z, B.AIR); return; }
  const mixed = ids.some(b => b !== ids[0]);
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  if (mixed) {
    let m = LAYER_STACKS.get(key(cx, cz));
    if (!m) LAYER_STACKS.set(key(cx, cz), m = new Map());
    m.set(_cellIndex(x, y, z), Uint16Array.from(ids));
  }
  const top = ids[ids.length - 1];
  const val = withLook(CORE.layerVal(top & 255, ids.length, mixed), top >> 8);   // the top block, its look in the cell too
  if (getBlock(x, y, z) === val) { markDirty(getChunk(cx, cz)); return; }   // same top and height, new order below
  setBlock(x, y, z, val);
}
// can a layer of block `id` (an id or an entry) pile onto this cell? Only stacking blocks, onto a stacking stack under 8 deep.
function canStackLayer(v, id) {
  const n = CORE.layerCount(v);
  return n > 0 && n < LAYER_MAX && !!PROPS[id & 255]?.layerStack && !!PROPS[v & 255]?.layerStack;
}
// push one layer of block `id`: onto a stack that takes it, or as a new 1-layer stack in an empty cell
function addLayer(x, y, z, id) {
  const v = getBlock(x, y, z);
  // ...or among a plant, of the kind already lying there: the world's own carpets bury no plant by being another kind
  if (carpetFits(x, y, z, v) && PROPS[id & 255]?.layerStack) {
    if (CORE.carpetCount(v) && CORE.carpetId(v) !== (id & 255)) return false;
    setLayerStack(x, y, z, [...(layerIdsAt(x, y, z, v) || []), id]);
    return true;
  }
  if (!CORE.layerCount(v)) {
    if (!isPlaceableInto(v & 255)) return false;
    setBlock(x, y, z, CORE.layerVal(id, 1));
    return true;
  }
  if (!canStackLayer(v, id)) return false;
  setLayerStack(x, y, z, [...layerIdsAt(x, y, z, v), id]);
  return true;
}
// take out layer i (0 = bottom); the layers above settle down one (a rotted leaf, a melted snow layer)
function removeLayerAt(x, y, z, i) {
  const ids = layerIdsAt(x, y, z);
  if (!ids || i < 0 || i >= ids.length) return;
  ids.splice(i, 1);
  setLayerStack(x, y, z, ids);
}
/* MIXED SLABS (SHAPE_SLAB_MIX in 02): a cell with two halves of different blocks keeps them, low half first,
   in the same side list as a mixed stack. */
// the two blocks of a mixed slab as entries (id | look << 8), low then high, or null when the cell is not one
function slabMixIdsAt(x, y, z, v = getBlock(x, y, z)) {
  if (!CORE.slabMixed(v)) return null;
  const ids = LAYER_STACKS.get(key(Math.floor(x / 16), Math.floor(z / 16)))?.get(_cellIndex(x, y, z));
  return ids && ids.length === 2 ? [ids[0], ids[1]] : [stackEntry(v), stackEntry(v)];
}
// make a cell a mixed slab of two entries: `low` in the half at even rotation `rot` (0 bottom, 2 -X, 4 -Z), `high` opposite
function setSlabMix(x, y, z, low, high, rot) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  let m = LAYER_STACKS.get(key(cx, cz));
  if (!m) LAYER_STACKS.set(key(cx, cz), m = new Map());
  m.set(_cellIndex(x, y, z), Uint16Array.of(low, high));
  const val = CORE.slabMixVal(low, rot, high);      // a glass half, or a glowing one, marked in its bits
  if (getBlock(x, y, z) === val) { markDirty(getChunk(cx, cz)); return; }
  setBlock(x, y, z, val);
}
// break half `h` (0 low, 1 high) of a mixed slab: the other stays as a slab of its own. Returns the broken half's entry.
function breakSlabMixHalf(x, y, z, h, v = getBlock(x, y, z)) {
  const ids = slabMixIdsAt(x, y, z, v);
  if (!ids) return null;
  const rot = ((v >> 8) & CORE.ROT_MASK) & 6, keep = h ? 0 : 1;
  setBlock(x, y, z, withLook((ids[keep] & 255) | ((SHAPE_SLAB + rot + keep) << 8), ids[keep] >> 8));
  return ids[h];
}
// breaking a stack takes its TOP layer only: which block that was (an entry), and how to take it off
function layerBreakInfo(x, y, z, v = getBlock(x, y, z)) {
  if (!CORE.layerCount(v)) return null;             // (a carpet among a plant is aimed at by itself: breakCarpetOver)
  const ids = layerIdsAt(x, y, z, v);
  const layerId = ids.pop() & 255;                  // the block; a look of it drops the block too
  return { layerId, apply: () => setLayerStack(x, y, z, ids) };
}

/* ---- a falling carpet over a plant, a torch, a pebble, a seashell, an egg or a gourd ----
   What it may cover is carpetHost, the bits are shapes/chimney-mixed.js' (carpetCount, carpetId, withCarpet), so the mesher, the
   saves and a prefab carry one with no list of its own. "The plant" below means whatever it covers. layerIdsAt and setLayerStack
   above read and write it like a stack, and that is all that melting, rot, rain and laying more need; `addLayer` too. It takes no
   plate, cover or rail, and those take no cell holding one (carpetFits, shapes/boxes.js). Setting it down: tryCarpetAmongPlant
   (place-block.js), a stack stepping down (processFalling, blocks/falling.js), snowfall (_laySnow, seasons/weather-ground.js),
   leaves (_layLitter, woods/felling.js).
   ONE RULE, in setBlock (carpetValue, as the water of a block standing in it): the plant turning into another (it grew, it was
   picked, a torch burnt out) keeps the carpet; the plant gone leaves the carpet as a stack of its own, falling if it must; anything
   else written over it ends it. setBlockBare writes with no such care: this file, a structure stamped, a blast, a pebble falling.
   AIMED AT by itself, `over`, bi CARPET_OVER_BI (overValAt, overBoxesAt, breakOverAt in blocks/covers.js), and dragging at feet
   as a stack does (_cellDrag, player/movement.js). */
const CARPET_OVER_BI = 18;               // a ray's `bi` on one (a rail 17, a doorway's fill 16, covers 10-15, a plate 9)
let _carpetBare = false;
function carpetValue(oldVal, val) {
  if (_carpetBare || !(oldVal >>> 29)) return val;
  const n = CORE.carpetCount(oldVal);
  if (!n) return val;
  if ((val & 255) === B.AIR) return CORE.layerVal(CORE.carpetId(oldVal), n);
  return CORE.carpetHost(val) && !CORE.carpetCount(val) ? CORE.withCarpet(val, CORE.carpetId(oldVal), n) : val;
}
function setBlockBare(x, y, z, v) {
  _carpetBare = true;
  try { setBlock(x, y, z, v); } finally { _carpetBare = false; }
}
// can a carpet lie in this cell's plant?
const carpetFits = (x, y, z, v = getBlock(x, y, z)) => CORE.carpetHost(v) && !plateOverAt(x, y, z) && !coversAt(x, y, z) && !railOverAt(x, y, z);
// the carpet in a plant's cell, as a stack's value and its box
function carpetOverVal(x, y, z) {
  const v = getBlock(x, y, z), n = CORE.carpetCount(v);
  return n ? CORE.layerVal(CORE.carpetId(v), n) : 0;
}
function carpetOverBoxes(x, y, z) {
  const n = CORE.carpetCount(getBlock(x, y, z));
  return n ? [[0, 0, 0, 1, n / LAYER_MAX, 1]] : null;
}
/* A player's click: a falling carpet held, on a plant or on the carpet among one, or on what a plant stands on or beside: one
   more layer in that plant's cell. A tall plant's upper half means its foot. False: not such a click, the usual placing goes on. */
function tryCarpetAmongPlant(hit, id) {
  if (!PROPS[id & 255]?.layerStack) return false;
  let { x, y, z } = hit;
  const aimed = getBlock(x, y, z);
  if (hit.over ? hit.bi !== CARPET_OVER_BI : !(CORE.carpetHost(aimed) || TALL_LOWER_OF[aimed & 255])) { x += hit.nx; y += hit.ny; z += hit.nz; }
  if (hit.over && hit.bi !== CARPET_OVER_BI) return false;
  let v = getBlock(x, y, z);
  if (TALL_LOWER_OF[v & 255]) { y--; v = getBlock(x, y, z); }
  if (!carpetFits(x, y, z, v)) return false;
  const under = getBlock(x, y - 1, z);
  if (isWaterVal(under) || _fallOpen(under & 255)) return false;   // nothing to lie on
  setLayerStack(x, y, z, [...(layerIdsAt(x, y, z, v) || []), id]);
  return true;
}
// a blow on one: its top layer, a shovel all of it, as on a stack
function breakCarpetOver(x, y, z, drops, quiet) {
  const ids = layerIdsAt(x, y, z);
  if (!ids) return;
  const all = ITEM_PROPS[heldUseId()]?.tool === 'shovel', top = ids[ids.length - 1] & 255;
  if (!quiet) {
    playBlockSound(top, 'break', x, y, z);
    if (typeof fxBreak === 'function') fxBreak(x, y, z, CORE.layerVal(top, ids.length));
  }
  setLayerStack(x, y, z, all ? [] : ids.slice(0, -1));
  if (drops) { if (all) _dropStackLayers(ids, x, y, z); else _dropLayer(top, x, y, z); }
}
// layers broken by no hand (washed off with their plant, come down on water): each what digging it by hand gives; snow just melts
function layersBreak(ids, x, y, z) {
  if (player.canFly) return;
  for (const L of ids) if ((L & 255) !== B.SNOW) _dropLayer(L & 255, x, y, z);
}
