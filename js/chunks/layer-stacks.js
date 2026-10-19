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
function layerIdsAt(x, y, z, v = getBlock(x, y, z)) {
  const n = CORE.layerCount(v);
  if (!n) return null;
  if (CORE.layerMixed(v)) {
    const ids = LAYER_STACKS.get(key(Math.floor(x / 16), Math.floor(z / 16)))?.get(_cellIndex(x, y, z));
    if (ids && ids.length === n) return Array.from(ids);
  }
  return new Array(n).fill(stackEntry(v));
}
// write a whole stack of entries, bottom to top. Nothing left is air; one block all the way needs no list.
function setLayerStack(x, y, z, ids) {
  if (y < 0 || y > WORLD_TOP) return;
  ids = ids.slice(0, LAYER_MAX);
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
  const ids = layerIdsAt(x, y, z, v);
  if (!ids) return null;
  const layerId = ids.pop() & 255;                  // the block; a look of it drops the block too
  return { layerId, apply: () => setLayerStack(x, y, z, ids) };
}
