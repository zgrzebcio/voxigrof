'use strict';
/* blocks/pressure-plates.js: the pressure plate on the page. What presses it, going down and coming up, what it sets off
   beside it and under it, the floor it needs, and the save of the plates held down.

   THE SHAPE is SHAPE_PLATE (shapes/shapes.js: PLATE_BOX, and PLATE_PRESSED in the variant's low bit, which the mesher draws
   sunk like any shape), taken by the blocks in SHAPE_BLOCKS.plate (shapes/shape-blocks.js), picked on the hammer's Advanced
   page (shapes/chisel.js) and put down by player/place-block.js on a block's whole top (plateFloorAt). Nothing collides
   with it (solidVal is false): what stands on it stands on the block under it, its feet in the plate's cell.

   WHO PRESSES ONE (platePressedBy, by its block): planks anything (players, creatures, dropped items); stone, cobblestone,
   the four rocks and the sandstones players and creatures; the iron, gold, copper and tin blocks and obsidian players
   only. updatePressurePlates (simTick) looks under every player, creature and drop each tick: a plate with something on
   it goes down, and comes up PLATE_HOLD_S after the last thing leaves it.

   WHAT IT SETS OFF: PLATE_TARGETS, by name { test(v), on(x, y, z, v), off(x, y, z) }, for the four cells beside the plate,
   the one under it, and the one under the block it lies on (PLATE_REACH); one on a stair's step or a slab also the four
   beside one level up (PLATE_REACH_STEP: a door at the top of the stairs). `on` returns the cell it keeps held (to let go of when the plate comes up), or null. TNT is lit; a
   door that is not locked opens, and shuts again when the plate comes up, unless another plate still down holds it or
   its other half of a double door. A new block a plate sets off is one entry there.

   PLATES "x,y,z" -> { x, y, z, left, held: [[target, x, y, z], ...] }: the plates down now, saved as `plates`
   (16-worlds.js), so one saved down comes up after a load when nothing is on it, and lets go of what it held.

   A PLATE IN ANOTHER BLOCK'S CELL: put on a bottom slab, a stair's lower step, a carpet or layer, or among a plant, it lies
   in THAT block's cell, so the cell's value stays the slab's (or the plant's) and the plate lives beside it: PLATE_OVER
   "cx,cz" -> Map(cell index -> plate value), the same value a plate standing alone has (its block, its look, pressed or
   not), so it is still a block of what it is made of: pressed by the same bodies, broken with the same tool, the same
   drop. Where it lies and its boxes: plateOverBoxes (shapes/boxes.js, shared with the mesher, which draws it from the
   map the mesh job carries). Saved as `plateOver` (16-worlds.js). The crosshair finds it (raycastVoxel, player/movement.js:
   `over`, bi PLATE_OVER_BI) and breaking takes it alone (breakPlateOver). A cell holding one takes nothing else (place-block.js);
   what holds it gone, it lies on the floor left as a plate of its own, or comes off (plateChanged, _plateOverOff).
   BURIED (PLATE_BURIED in its variant): a carpet of a walk-through layer block (sand, snow, leaves, gravel...) put on a
   plate standing alone covers it (tryBuryPlate): the cell becomes that layer and the plate goes beside it, on the floor,
   hidden — not drawn, the crosshair passes it — and still pressed, the feet sinking through the layers to it. More such
   layers pile on; dug away to nothing, it stands alone again. A trap under the sand. */

const PLATE_HOLD_S = 1;                  // seconds a plate stays down after the last thing leaves it
const PLATE_FEET = 0.3;                  // feet this high over the floor of the plate's cell still press it
// beside it, under it, and under the block it lies on (TNT or a door below the floor: the plate's press goes through it)
const PLATE_REACH = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, -2, 0]];
// ...and a plate lying on a slab, a step or a carpet in that block's own cell: beside it, and under the block it lies on
const PLATE_REACH_ON = PLATE_REACH.slice(0, 5);
// ...and one half a block up, on a stair's lower step or a slab: the cells beside one level up too, where the steps lead
// (a door at the top of the stairs)
const PLATE_REACH_STEP = PLATE_REACH_ON.concat([[1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]);
const PLATES = new Map();
const _plateKey = (x, y, z) => x + ',' + y + ',' + z;
const isPlateVal = (v) => CORE.shapeOfVal(v) === 'plate';

// who presses a plate of this value: 'all' (players, creatures and drops), 'bodies' (players and creatures), 'players'
let _platePressers = null;
function platePressedBy(v) {
  if (!_platePressers) {
    _platePressers = new Map();
    for (const id of woodBlocks('planks')) _platePressers.set(id, 'all');
    for (const id of [B.IRON_BLOCK, B.GOLD_BLOCK, B.COPPER_BLOCK, B.TIN_BLOCK, B.OBSIDIAN]) _platePressers.set(id, 'players');
  }
  return _platePressers.get(v & 255) || 'bodies';                   // stone, cobblestone, the rocks, the sandstones
}

// does the cell at (x, y, z) give a plate a whole top to lie on: solid, a box of it reaching its top over the middle
function plateFloorAt(x, y, z) {
  if (!CORE.solidVal(getBlock(x, y, z))) return false;
  const boxes = blockBoxes(x, y, z);
  return !!boxes && boxes.some(b => b[4] >= 0.999 && b[0] <= 0.5 && b[3] >= 0.5 && b[2] <= 0.5 && b[5] >= 0.5);
}

/* does the block a plate lies on fill its cell down to the one under it, all over: only then does the press go through it
   (a top slab or a vertical slab leaves a gap under it, and TNT or a door beyond that gap is not set off) */
function _plateThrough(x, y, z) {
  if (!CORE.solidVal(getBlock(x, y, z))) return false;
  const boxes = blockBoxes(x, y, z);
  return !!boxes && boxes.some(b => b[1] <= 0.001 && b[0] <= 0.001 && b[2] <= 0.001 && b[3] >= 0.999 && b[5] >= 0.999);
}

/* ---- a plate in another block's cell (the header above) ---- */
const PLATE_OVER = new Map();
let _plateOverN = 0;                     // how many there are: a ray or a tick looks for one only when there is one
const PLATE_OVER_BI = 9;                 // a ray's `bi` when it hit such a plate (a mixed slab's halves are 0 and 1)
const _plateCellI = (x, y, z) => (x & 15) + ((z & 15) << 4) + (y << 8);
// the plate lying in the cell (x, y, z), or 0
function plateOverAt(x, y, z) {
  if (!_plateOverN) return 0;
  const m = PLATE_OVER.get(Math.floor(x / 16) + ',' + Math.floor(z / 16));
  return m ? (m.get(_plateCellI(x, y, z)) || 0) : 0;
}
// put one there (v a plate value), change it, or take it away (v 0); its chunk is meshed again
function setPlateOver(x, y, z, v) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16), ck = cx + ',' + cz, i = _plateCellI(x, y, z);
  let m = PLATE_OVER.get(ck);
  const had = !!(m && m.has(i));
  const was = had ? m.get(i) : 0;
  if (v) { if (!m) PLATE_OVER.set(ck, m = new Map()); m.set(i, v >>> 0); }
  else if (had) { m.delete(i); if (!m.size) PLATE_OVER.delete(ck); }
  else return;
  if (had !== !!v) {
    _plateOverN += v ? 1 : -1;
    const n = PLATE_CELLS.get(ck);                       // the chunk's count of plates (_plateCount), once read
    if (n !== undefined) PLATE_CELLS.set(ck, Math.max(0, n + (v ? 1 : -1)));
  }
  if (!(_plateBuried(was) && _plateBuried(v))) markDirty(getChunk(cx, cz));   // a buried one pressed or let up: nothing drawn
}
const _plateBuried = (v) => !!v && !!((v >> 8) & PLATE_BURIED);
// its boxes where it lies (shapes/boxes.js), or null
function plateOverBoxesAt(x, y, z) {
  const ov = plateOverAt(x, y, z);
  return ov ? BLOCKS.plateOverBoxes(getBlock, x, y, z, getBlock(x, y, z), ov) : null;
}
// does what holds it still hold it: the block in its cell takes a plate, and under a plant there is still a whole top
function _plateOverHeld(x, y, z, host, ov) {
  const bx = BLOCKS.plateOverBoxes(getBlock, x, y, z, host, ov);
  return !!bx && (bx[0][1] > 0 || plateFloorAt(x, y - 1, z));
}
// what held it is gone: on the floor left under an empty cell it lies on as a plate of its own (a plant picked, a slab
// broken), else it comes off as itself
function _plateOverOff(x, y, z, ov, val) {
  setPlateOver(x, y, z, 0);
  ov = (ov & ~(PLATE_BURIED << 8)) >>> 0;                // dug out from under its layers it stands alone, seen again
  if (!val && plateFloorAt(x, y - 1, z)) { setBlock(x, y, z, ov); return; }   // a plate down stays down (PLATES keeps it)
  const k = _plateKey(x, y, z), pl = PLATES.get(k);
  if (pl) { PLATES.delete(k); _plateRelease(pl, false); }
  if (!player.canFly) for (const d of blockDrop(ov)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
}
// broken by a player or a blast: what it held lets go; `drops` its block back; `quiet` when the caller made the sound
function breakPlateOver(x, y, z, drops, quiet) {
  const ov = plateOverAt(x, y, z);
  if (!ov) return;
  setPlateOver(x, y, z, 0);
  const k = _plateKey(x, y, z), pl = PLATES.get(k);
  if (pl) { PLATES.delete(k); _plateRelease(pl, false); }
  if (!quiet) {
    playBlockSound(ov & 255, 'break', x, y, z);
    if (typeof fxBreak === 'function') fxBreak(x, y, z, ov);
  }
  if (drops) for (const d of blockDrop(ov, false)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y, z);
}
/* A plate put down IN the cell of what it will lie on (place-block.js, a plate shape in hand; mat its block | look << 16):
   the top of a carpet, a bottom slab or a stair's lower step clicked (not the stair's upper step: a plate there goes in
   the cell above, as on any whole top), or a plant: the one aimed at (creative), or the one in front of the face clicked.
   `mat` may carry NEED_PAID (blocks/variants.js): the plate keeps it and gives its need back when broken.
   'placed', 'taken' (a plate lies there already), or null: no such place, the usual placing goes on. */
function tryPlateOver(hit, mat) {
  const pv = ((mat & 0xFF00FF) | (mat & NEED_PAID) | (SHAPE_PLATE << 8)) >>> 0;
  let x = hit.x, y = hit.y, z = hit.z, bx = null;
  if (!hit.over && hit.ny === 1) {
    bx = BLOCKS.plateOverBoxes(getBlock, x, y, z, getBlock(x, y, z), pv);
    const at = camera.position.y + _dir.y * hit.t - y;        // how high in the cell the ray met the top it clicked
    if (bx && !(bx[0][1] > 0 && Math.abs(at - bx[0][1]) < 0.05)) bx = null;
  }
  if (!bx) {
    if (hit.over || !isNoTargetPlant(hit.id)) { x += hit.nx; y += hit.ny; z += hit.nz; }
    const host = getBlock(x, y, z);
    bx = host ? BLOCKS.plateOverBoxes(getBlock, x, y, z, host, pv) : null;
    if (!bx || (bx[0][1] === 0 && !plateFloorAt(x, y - 1, z))) return null;
  }
  if (plateOverAt(x, y, z) || isPlateVal(getBlock(x, y, z)) || coversAt(x, y, z) || railOverAt(x, y, z)) return 'taken';   // covers or a rail there too
  setPlateOver(x, y, z, pv);
  playBlockSound(pv & 255, 'place', x, y, z);
  return 'placed';
}
/* A carpet of a walk-through layer block (`id`, its look `look`) put on a plate standing alone (the plate clicked): the
   cell becomes one layer of it and the plate lies buried under it (the header above). true when it did. */
function tryBuryPlate(hit, id, look) {
  if (hit.over || !PROPS[id]?.layerStack) return false;
  const { x, y, z } = hit, pv = getBlock(x, y, z);
  if (!isPlateVal(pv) || coversAt(x, y, z)) return false;   // (a cell covers lie in takes no plate beside them)
  setPlateOver(x, y, z, (pv | (PLATE_BURIED << 8)) >>> 0);   // first: setBlock's hook then finds it held, and a plate
  setBlock(x, y, z, (id | (SHAPE_LAYER << 8) | (look << 16)) >>> 0);   // down stays down
  return true;
}
/* A prefab's plates lying in other blocks' cells (`plates`: [dx, dy, dz, id, variant, look?], captureStructure in
   34-structures.js), laid once its blocks are down; one whose block is not there to hold it is left out. `swap`: the
   block swaps it was laid with (a red sand pyramid's red sandstone plates). */
function applyStructurePlates(prefab, ox, oy, oz, swap = null) {
  if (!prefab || !Array.isArray(prefab.plates)) return;
  for (const p of prefab.plates) {
    if (!Array.isArray(p) || p.length < 5 || !p.slice(0, 5).every(Number.isInteger)) continue;
    const [dx, dy, dz, id0, variant, look = 0] = p, x = ox + dx, y = oy + dy, z = oz + dz;
    const id = swap && swap[id0] != null ? swap[id0] | 0 : id0;
    const pv = (id | ((variant & 255 & ~PLATE_PRESSED) << 8) | ((look & 255) << 16)) >>> 0, host = getBlock(x, y, z);
    if (!PROPS[id] || !isPlateVal(pv) || !host || plateOverAt(x, y, z) || !_plateOverHeld(x, y, z, host, pv)) continue;
    setPlateOver(x, y, z, pv);
  }
}
// the plate in the cell, lying in another block's or standing alone, or 0; and writing it back where it is
function _plateValAt(x, y, z) {
  const ov = plateOverAt(x, y, z);
  if (ov) return ov;
  const v = getBlock(x, y, z);
  return isPlateVal(v) ? v : 0;
}
function _plateWrite(x, y, z, v) { if (plateOverAt(x, y, z)) setPlateOver(x, y, z, v); else setBlock(x, y, z, v); }

/* ---- what a plate sets off ---- */
const PLATE_TARGETS = {
  // TNT in its reach is lit (blocks/tnt.js: armTNT makes the sound); nothing to let go of
  tnt: {
    test: (v) => (v & 255) === B.TNT,
    on(x, y, z) {
      if (!isTNTFuseActive(x, y, z)) armTNT(x, y, z);
      return null;
    },
  },
  // a door opens (both halves of a double, toggleDoor in blocks/doors.js) and is held; a locked one stays shut
  door: {
    test: (v) => isDoorAt(v),
    on(x, y, z, v) {
      const by = ((v >> 8) & 8) ? y - 1 : y;
      if (DOOR_LOCKS.has(_plateKey(x, by, z))) return null;
      if (!(doorDv(getBlock(x, by, z)) & 4)) toggleDoor(x, by, z);
      return [x, by, z];
    },
    off(x, y, z) {
      const v = getBlock(x, y, z);
      if (isDoorAt(v) && (doorDv(v) & 4)) toggleDoor(x, y, z);
    },
  },
  // a gate opens (both of a pair, toggleGate in blocks/gates.js) and is held
  gate: {
    test: (v) => isGateVal(v),
    on(x, y, z, v) {
      if (!gateOpen(v)) toggleGate(x, y, z);
      return [x, y, z];
    },
    off(x, y, z) {
      const v = getBlock(x, y, z);
      if (isGateVal(v) && gateOpen(v)) toggleGate(x, y, z);
    },
  },
};
// is a door (or the other half of its double) held by a plate down other than `pl`
function _plateDoorHeld(pl, x, y, z) {
  const cells = [[x, z]], v = getBlock(x, y, z);
  if (isDoorAt(v)) {
    const dv = doorDv(v), p = doorPartnerCell(x, y, z, dv & 3, dv & DOOR_HINGE_R);
    if (p) cells.push([p.x, p.z]);
  }
  for (const o of PLATES.values()) {
    if (o === pl) continue;
    for (const h of o.held) if (h[0] === 'door' && h[2] === y && cells.some(([cx, cz]) => cx === h[1] && cz === h[3])) return true;
  }
  return false;
}

/* ---- down and up ---- */
// its click, in its block's sound: higher going down
function _plateClick(v, x, y, z, down) {
  if (_plateBuried(v)) return;                        // a trap under the sand gives itself away by no sound
  const key = BLOCK_TYPE_SOUND[PROPS[v & 255]?.type] || DEFAULT_BLOCK_SOUND;
  playSound(key, { gain: 0.35, rate: down ? 1.6 : 1.3, pos: { x: x + 0.5, y: y + 0.1, z: z + 0.5 } });
}
function _platePress(x, y, z) {
  const v = _plateValAt(x, y, z);
  _plateWrite(x, y, z, (v | (PLATE_PRESSED << 8)) >>> 0);
  const pl = { x, y, z, left: PLATE_HOLD_S, held: [] };
  PLATES.set(_plateKey(x, y, z), pl);
  _plateClick(v, x, y, z, true);
  const ob = plateOverBoxesAt(x, y, z), onIts = !!ob && ob[0][1] > 0;   // lying on a block in its own cell
  const onStep = !!ob && ob[0][1] >= 0.5;                               // ...half a block up: a step, a slab
  for (const [dx, dy, dz] of onStep ? PLATE_REACH_STEP : onIts ? PLATE_REACH_ON : PLATE_REACH) {
    if (dy === -2 && !_plateThrough(x, y - 1, z)) continue;   // the block under it leaves a gap: the press stops there
    const tx = x + dx, ty = y + dy, tz = z + dz, tv = getBlock(tx, ty, tz);
    for (const name in PLATE_TARGETS) {
      const t = PLATE_TARGETS[name];
      if (!t.test(tv)) continue;
      const h = t.on(tx, ty, tz, tv);
      if (h) pl.held.push([name, h[0], h[1], h[2]]);
    }
  }
}
// `up`: the plate is still there and comes up (else it was broken); what it held lets go
function _plateRelease(pl, up) {
  if (up) {
    const v = _plateValAt(pl.x, pl.y, pl.z);
    _plateWrite(pl.x, pl.y, pl.z, (v & ~(PLATE_PRESSED << 8)) >>> 0);
    _plateClick(v, pl.x, pl.y, pl.z, false);
  }
  for (const [name, hx, hy, hz] of pl.held) {
    const t = PLATE_TARGETS[name];
    if (!t || !t.off) continue;
    if (name === 'door' && _plateDoorHeld(pl, hx, hy, hz)) continue;
    t.off(hx, hy, hz);
  }
}

/* ---- once a tick (simTick): what stands on a plate ---- */
// the plates a body's feet are on: (x, z) its middle, y its feet, r its half width; `who` 'player', 'mob' or 'drop'
function _platesUnder(x, y, z, r, who, out) {
  const cy = Math.floor(y + 0.02);
  const low = y - cy <= PLATE_FEET;          // feet low in their cell: on a plate standing on its floor
  if (!low && !_plateOverN) return;
  for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++)
    for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) {
      let v = getBlock(cx, cy, cz), b = BLOCKS.PLATE_BOX[0][0], top = cy;
      // ...or on one lying in another block's cell, on what holds it: its box (half a step's), the height it lies at
      const ov = _plateOverN ? plateOverAt(cx, cy, cz) : 0;
      if (ov) {
        const bx = BLOCKS.plateOverBoxes(getBlock, cx, cy, cz, v, ov);
        if (!bx) continue;
        v = ov; b = bx[0]; top = cy + b[1];
        if (y - top > PLATE_FEET) continue;      // (lower: sunk into a snow or leaf layer under it, which is walked through)
      } else if (!low || !isPlateVal(v)) continue;
      // the plate itself, a sixteenth in from each edge of its cell
      if (x + r < cx + b[0] || x - r > cx + b[3] || z + r < cz + b[2] || z - r > cz + b[5]) continue;
      const by = platePressedBy(v);
      if ((who === 'drop' && by !== 'all') || (who === 'mob' && by === 'players')) continue;
      out.add(_plateKey(cx, cy, cz));
    }
}
/* WHERE PLATES ARE, by chunk (PLATE_CELLS "cx,cz" -> how many), so a tick looks under a body only when its chunk has one.
   Plates are never made by the world's generator: every one was put by setBlock, so every one is in its chunk's saved
   edits (editStore). A chunk's count is read from its edits the first time it is asked for (_plateCount), and kept by
   setBlock's hook after (plateChanged). A new world: restorePlates starts it over. */
const PLATE_CELLS = new Map();
function _plateCount(cx, cz) {
  const ck = cx + ',' + cz;
  let n = PLATE_CELLS.get(ck);
  if (n !== undefined) return n;
  n = 0;
  const edits = editStore.get(ck);
  if (edits) for (const v of edits.values()) if (isPlateVal(v)) n++;
  n += PLATE_OVER.get(ck)?.size || 0;                   // ...and those lying in other blocks' cells
  PLATE_CELLS.set(ck, n);
  return n;
}
// any plate in the chunks a body of half width r at (x, z) stands over
function _platesNear(x, z, r) {
  const cx0 = Math.floor((x - r) / 16), cx1 = Math.floor((x + r) / 16), cz0 = Math.floor((z - r) / 16), cz1 = Math.floor((z + r) / 16);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) if (_plateCount(cx, cz)) return true;
  return false;
}
const _platesDown = new Set();
function updatePressurePlates(dt) {
  if (menuScene || !currentWorld) return;
  const down = _platesDown;
  down.clear();
  for (const p of PLAYERS) if (p.spawned && !p.dead && _platesNear(p.pos.x, p.pos.z, p.R)) _platesUnder(p.pos.x, p.pos.y, p.pos.z, p.R, 'player', down);
  for (const e of ENTITIES) {
    if (e.active === false) continue;
    const r = entR(e);
    if (_platesNear(e.x, e.z, r)) _platesUnder(e.x, e.y, e.z, r, 'mob', down);
  }
  for (const d of DROPS) {
    const g = d.group.position;
    if (_platesNear(g.x, g.z, DROP_HALF)) _platesUnder(g.x, g.y - DROP_HALF - DROP_REST_LIFT, g.z, DROP_HALF, 'drop', down);
  }
  for (const k of down) {
    const pl = PLATES.get(k);
    if (pl) { pl.left = PLATE_HOLD_S; continue; }
    const [x, y, z] = k.split(',').map(Number);
    _platePress(x, y, z);
  }
  for (const [k, pl] of [...PLATES]) {
    if (down.has(k)) continue;
    const c = getChunk(Math.floor(pl.x / 16), Math.floor(pl.z / 16));
    if (!c || !c.data) continue;                                     // its land is not in: it waits as it is
    if (!_plateValAt(pl.x, pl.y, pl.z)) { PLATES.delete(k); _plateRelease(pl, false); continue; }
    if ((pl.left -= dt) > 0) continue;
    PLATES.delete(k);
    _plateRelease(pl, true);
  }
}

/* ---- setBlock's hook (chunks/block-access.js) ---- */
function plateChanged(x, y, z, oldVal, val) {
  // the count of plates in its chunk (one already read, _plateCount); pressed or let up it stays a plate
  const was = isPlateVal(oldVal), is = isPlateVal(val);
  if (was !== is) {
    const ck = Math.floor(x / 16) + ',' + Math.floor(z / 16), n = PLATE_CELLS.get(ck);
    if (n !== undefined) PLATE_CELLS.set(ck, Math.max(0, n + (is ? 1 : -1)));
  }
  // a plate down broken or changed into something else: what it held lets go (not one buried just now: it is still there)
  if (PLATES.size && isPlateVal(oldVal) && !isPlateVal(val) && !plateOverAt(x, y, z)) {
    const k = _plateKey(x, y, z), pl = PLATES.get(k);
    if (pl) { PLATES.delete(k); _plateRelease(pl, false); }
  }
  // the block under a plate has no whole top any more: the plate comes off, as itself
  if (y < WORLD_TOP) {
    const pv = getBlock(x, y + 1, z);
    if (isPlateVal(pv) && !plateFloorAt(x, y, z)) {
      setBlock(x, y + 1, z, B.AIR);
      if (!player.canFly) for (const d of blockDrop(pv)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y + 1, z);
    }
  }
  if (!_plateOverN) return;
  // a plate lying in this cell: the block holding it went or turned into one that holds none
  const ov = plateOverAt(x, y, z);
  if (ov && !_plateOverHeld(x, y, z, val, ov)) _plateOverOff(x, y, z, ov, val);
  // ...one lying among a plant over this cell: its floor has no whole top any more
  if (y < WORLD_TOP) {
    const up = plateOverAt(x, y + 1, z), hv = up ? getBlock(x, y + 1, z) : 0;
    if (up && !_plateOverHeld(x, y + 1, z, hv, up)) _plateOverOff(x, y + 1, z, up, hv);
  }
  // ...one on a stair's step beside: stairs turning a corner change the part of the step left free
  if (CORE.shapeOfVal(oldVal) === 'stairs' || CORE.shapeOfVal(val) === 'stairs')
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const sv = plateOverAt(x + dx, y, z + dz), hv = sv ? getBlock(x + dx, y, z + dz) : 0;
      if (sv && !_plateOverHeld(x + dx, y, z + dz, hv, sv)) _plateOverOff(x + dx, y, z + dz, sv, hv);
    }
}

/* ---- the save: the plates down, and the plates lying in other blocks' cells ---- */
const serializePlates = () => [...PLATES.values()].map(p => [p.x, p.y, p.z, +p.left.toFixed(2), p.held]);
function serializePlateOver() {
  const out = [];
  for (const [ck, m] of PLATE_OVER) {
    const [cx, cz] = ck.split(',').map(Number);
    for (const [i, v] of m) out.push([cx * 16 + (i & 15), i >> 8, cz * 16 + ((i >> 4) & 15), v]);
  }
  return out;
}
// as a world loads (its chunks are not in yet: nothing to mesh again)
function restorePlateOver(list) {
  PLATE_OVER.clear();
  _plateOverN = 0;
  if (!Array.isArray(list)) return;
  for (const r of list) {
    if (!Array.isArray(r) || !r.slice(0, 4).every(Number.isInteger) || !isPlateVal(r[3] >>> 0)) continue;
    const ck = Math.floor(r[0] / 16) + ',' + Math.floor(r[2] / 16), i = _plateCellI(r[0], r[1], r[2]);
    let m = PLATE_OVER.get(ck);
    if (!m) PLATE_OVER.set(ck, m = new Map());
    if (!m.has(i)) _plateOverN++;
    m.set(i, r[3] >>> 0);
  }
}
function restorePlates(list) {
  PLATES.clear();
  PLATE_CELLS.clear();                                   // another world's edits: counted again as they are asked for
  if (!Array.isArray(list)) return;
  for (const r of list) {
    if (!Array.isArray(r) || !Number.isInteger(r[0]) || !Number.isInteger(r[1]) || !Number.isInteger(r[2])) continue;
    const held = Array.isArray(r[4]) ? r[4].filter(h => Array.isArray(h) && PLATE_TARGETS[h[0]] && h.slice(1, 4).every(Number.isInteger)) : [];
    PLATES.set(_plateKey(r[0], r[1], r[2]), { x: r[0], y: r[1], z: r[2], left: +r[3] > 0 ? +r[3] : PLATE_HOLD_S, held });
  }
}
