'use strict';
/* player/wrench.js: the wrench (ITEM.WRENCH, items/useables.js; art Items/Useables/wrench.png), creative only for now, like a
   debug stick. Right-click with it (place-block.js hands it the click before anything else):
     a fence or a wall, standing alone or lying on a slab or stairs (blocks/rails.js)
       a side             that side's arm on or off, toward whatever is there (another block, look or shape too). From then
                          on its joins are the ones set by hand (JOIN_MANUAL, the arms in JOIN_ARMS_SHIFT: shapes/shapes.js).
                          The one beside it on that side follows: one that joins by itself takes it or lets it go by its own
                          rule (joinTakes, shapes/boxes.js: let go, it looks for a step up or down instead), one set by hand
                          too has its arm back set the same
       a wall's top       it turns: toward the next side of its cell, then back to the middle (WALL_BACK)
       sneaking           its joins are read from its neighbours again
     stairs               on their top or bottom, turned upside down; on a side, a quarter round; sneaking, their corner set
                          by hand: straight, inner left, inner right, outer left, outer right, then read from the neighbours
                          again (STAIR_FORCE_SHIFT)
     a slope              on its slant or its flat face, turned upside down; on its back or an end, a quarter round; sneaking,
                          a quarter round wherever it is clicked (the sides of one in a row are hidden)
     a ladder             its whole column a quarter round, to the next side something holds it on (blocks/ladders.js);
                          sneaking, the one clicked alone; two in a corner turn together, to the next corner
     anything that turns  to its next way: a torch round the blocks it can stand or hang on, a single chest, a furnace, a
                          bench and every block turned to face you, a log's, a cactus' or a pillar's axis, a slab's side, a
                          pane, a standing or hanging sign, a gate's line
   A door, a bed, a double chest and the rest stay as they are. */

const { WALL_BACK, JOIN_MANUAL, JOIN_ARMS_SHIFT, STAIR_FORCE_SHIFT } = BLOCKS;
const WRENCH_TURN = [2, 3, 1, 0];          // a facing (0 +Z, 1 -Z, 2 +X, 3 -X) -> the next a quarter round: +Z +X -Z -X
const WRENCH_STAIR_NAMES = ['as their neighbours make them', 'straight', 'an inner corner, left', 'an inner corner, right',
                            'an outer corner, left', 'an outer corner, right'];
const _wrenchVa = (v, va) => ((v & ~0xFF00) | ((va & 255) << 8)) >>> 0;   // the value with another variant byte

function useWrench(hit) {
  if (!player.canFly) { feedWarn('The wrench works in creative only, for now'); return; }
  const rail = !!hit.over && hit.bi === RAIL_OVER_BI;
  if (hit.over && !rail) return;
  const x = hit.x, y = hit.y, z = hit.z, v = rail ? railOverAt(x, y, z) : getBlock(x, y, z);
  if (!(v & 255)) return;
  const s = CORE.shapeOfVal(v);
  let nv;
  if (s === 'fence' || s === 'wall') nv = _wrenchJoin(hit, v, s, x, y, z);
  else if (s === 'stairs' && player.sneaking) {
    const f = (((v >>> STAIR_FORCE_SHIFT) & 7) + 1) % WRENCH_STAIR_NAMES.length;
    nv = ((v & ~(7 << STAIR_FORCE_SHIFT)) | (f << STAIR_FORCE_SHIFT)) >>> 0;
    feedInfo(`Stairs: ${WRENCH_STAIR_NAMES[f]}`);
  }
  else if (s === 'stairs' && hit.ny) nv = _wrenchVa(v, ((v >> 8) & 255) ^ 4);   // a top or bottom face: upside down
  else if (s === 'slope' && !player.sneaking && _wrenchSlant(hit, v)) nv = _wrenchVa(v, ((v >> 8) & 255) ^ 4);
  else nv = _wrenchTurn(v, x, y, z);
  if (nv === 'mixed') { feedWarn('The wrench does not turn a corner of two different blocks'); return; }
  if (nv == null && s === 'ladder') { feedWarn('Nothing would hold this ladder on another side'); return; }
  if (nv == null) { feedWarn(`The wrench does not turn ${(PROPS[v & 255]?.name || 'this').toLowerCase()}`); return; }
  if (nv === v) return;
  _wrenchPut(x, y, z, nv, rail);
  if (isChestId(v & 255)) rebuildChestMesh(x, y, z);       // its model faces the new way
  playBlockSound(v & 255, 'place', x, y, z);
}
const _wrenchPut = (x, y, z, v, rail) => { if (rail) setRailOver(x, y, z, v); else setBlock(x, y, z, v); };
/* a slope's slant or its flat face clicked? The crosshair meets its steps (shapes/boxes.js): their tops and bottoms, and the
   risers, which face down the slope (STAIR_DIR of its facing, upright or hung); its back and ends are the rest */
function _wrenchSlant(hit, v) {
  if (hit.ny) return true;
  const d = BLOCKS.STAIR_DIR[(v >> 8) & 3];
  return hit.nx === d[0] && hit.nz === d[1];
}
/* A ladder's next side, a quarter round (WRENCH_TURN turns a ladder's back the same way: -Z -X +Z +X, its sides being 0 -Z,
   1 +Z, 2 -X, 3 +X): the next one that leaves its column held (blocks/ladders.js), else null. The rest of the column (all of
   it but the one clicked, which useWrench writes; not while sneaking) is turned here. */
function _wrenchLadder(v, x, y, z) {
  const [lo, hi] = _ladderColumn(x, y, z), from = player.sneaking ? y : lo, to = player.sneaking ? y : hi;
  // a corner of two different blocks (blocks/ladders.js) is left as it is, and a column with one in what would turn
  for (let yy = from; yy <= to; yy++) if (wallMateOf(ladderValAt(x, yy, z))) return 'mixed';
  const ends = isSolid(x, lo - 1, z) || isSolid(x, hi + 1, z), cur = ladderSideOf(v);
  for (let side = WRENCH_TURN[cur]; side !== cur; side = WRENCH_TURN[side]) {
    let held = ends;
    for (let yy = lo; yy <= hi && !held; yy++) {
      const cva = (ladderValAt(x, yy, z) >> 8) & 255;      // a corner's two turn together
      held = _ladderBacked(x, yy, z, wallSides(yy >= from && yy <= to ? (cva & ~3) | side : cva));
    }
    if (!held) continue;
    // half turned, the column may hold by nothing for a moment: it is asked once whole, when useWrench writes the one clicked
    _ladderDropping = true;
    try {
      for (let yy = from; yy <= to; yy++) {
        if (yy === y) continue;
        const cv = ladderValAt(x, yy, z), nv = _wrenchVa(cv, (((cv >> 8) & 255) & ~3) | side);
        _wrenchPut(x, yy, z, nv, !hasLadder(getBlock(x, yy, z)));   // one lying in a slab's cell stays there
      }
    } finally { _ladderDropping = false; }
    return _wrenchVa(v, (((v >> 8) & 255) & ~3) | side);
  }
  return null;
}

/* What a fence or a wall becomes: a side's arm on or off (and the arm back of one set by hand beside it), a wall turned on
   its top, or its joins its neighbours' again */
function _wrenchJoin(hit, v, s, x, y, z) {
  if (player.sneaking) return (v & ~(JOIN_MANUAL | (15 << JOIN_ARMS_SHIFT))) >>> 0;
  const o = camera.position, px = o.x + _dir.x * hit.t - x - 0.5, pz = o.z + _dir.z * hit.t - z - 0.5;
  const va = (v >> 8) & 255;
  if (hit.ny === 1 && (s === 'wall' || Math.max(Math.abs(px), Math.abs(pz)) < 0.25)) {
    if (s !== 'wall') return v;
    // the middle, +Z, +X, -Z, -X, the middle again
    const f = va & 3, next = !(va & WALL_BACK) ? WALL_BACK : f === 3 ? 0 : WALL_BACK | WRENCH_TURN[f];
    return _wrenchVa(v, SHAPE_WALL | next);
  }
  // the side clicked: from its middle toward where the ray met it (0 +X, 1 -X, 2 +Z, 3 -Z)
  const d = Math.abs(px) >= Math.abs(pz) ? (px > 0 ? 0 : 1) : (pz > 0 ? 2 : 3);
  let arms = (v >>> JOIN_ARMS_SHIFT) & 15;
  if (!(v & JOIN_MANUAL)) {                              // set by hand from now on: what it joins today first
    arms = 0;
    BLOCKS.autoJoins(s, getBlock, x, y, z, v, railOverAt).forEach((on, k) => { if (k < 4 && on) arms |= 1 << k; });
  }
  arms ^= 1 << d;
  // one beside it set by hand too: its arm back this way the same, so the join holds (or goes) on both sides
  const dx = [1, -1, 0, 0][d], dz = [0, 0, 1, -1][d], back = BLOCKS.JOIN_BACK[d], on = (arms >> d) & 1;
  for (const rail of [false, true]) {
    const n = rail ? railOverAt(x + dx, y, z + dz) : getBlock(x + dx, y, z + dz);
    if (!(n & JOIN_MANUAL) || !BLOCKS.isJoinFamily(CORE.shapeOfVal(n))) continue;
    _wrenchPut(x + dx, y, z + dz, ((n & ~(1 << (JOIN_ARMS_SHIFT + back))) | (on << (JOIN_ARMS_SHIFT + back))) >>> 0, rail);
  }
  return ((v & ~(15 << JOIN_ARMS_SHIFT)) | JOIN_MANUAL | (arms << JOIN_ARMS_SHIFT)) >>> 0;
}

/* Under the crosshair while the wrench is held (ui/hud.js): what the block aimed at is set to now, in words and numbers,
   so the same can be set on another */
const WRENCH_SIDES = ['+Z', '-Z', '+X', '-X'], WRENCH_ARMS = ['+X', '-X', '+Z', '-Z'];
function wrenchPrompt() {
  if (slotId(HOTBAR[hotbarSel]) !== ITEM.WRENCH) return '';
  const hit = currentRay();
  if (!hit) return '';
  const rail = !!hit.over && hit.bi === RAIL_OVER_BI;
  if (hit.over && !rail) return '';
  const v = rail ? railOverAt(hit.x, hit.y, hit.z) : getBlock(hit.x, hit.y, hit.z);
  const p = PROPS[v & 255];
  if (!p || !(v & 255)) return '';
  const s = CORE.shapeOfVal(v), va = (v >> 8) & 255, out = [];
  if (s === 'fence' || s === 'wall') {
    if (s === 'wall') out.push(!(va & WALL_BACK) ? 'in the middle' : `toward ${WRENCH_SIDES[va & 3]} (${va & 3})`);
    if (v & JOIN_MANUAL) {
      const arms = (v >>> JOIN_ARMS_SHIFT) & 15;
      out.push(`joins set: ${WRENCH_ARMS.filter((_, k) => (arms >> k) & 1).join(' ') || 'none'} (${arms})`);
    } else out.push('joins by itself');
  } else if (s === 'stairs') {
    const f = (v >>> STAIR_FORCE_SHIFT) & 7;
    out.push(`facing ${WRENCH_SIDES[va & 3]} (${va & 3})`, (va & 4) ? 'upside down' : 'upright', `corner ${WRENCH_STAIR_NAMES[f] || f} (${f})`);
  } else if (s === 'slope') out.push(`low edge toward ${WRENCH_SIDES[va & 3]} (${va & 3})`, (va & 4) ? 'upside down' : 'upright');
  else if (s === 'ladder') out.push(`back on ${wallSides(va).map(k => ['-Z', '+Z', '-X', '+X'][k]).join(' and ')} (${va & 7})`);
  else if (s === 'slab') out.push(`side ${['bottom', 'top', '-X', '+X', '-Z', '+Z'][va & ROT_MASK]} (${va & ROT_MASK})`);
  else if (s === 'pane') out.push(`along ${(va & 1) ? 'Z' : 'X'} (${va & 1})`);
  else if (s === 'gate') out.push(`along ${(va & BLOCKS.GATE_AXIS_Z) ? 'Z' : 'X'}`, (va & BLOCKS.GATE_OPEN) ? 'open' : 'shut');
  else if (s === 'sign') out.push(`facing ${WRENCH_SIDES[va & 3]} (${va & 3})`);
  else if (s) return '';
  else if (p.torch) out.push(`${['standing', 'on -X', 'on +X', 'on -Z', 'on +Z'][va & 7] || 'standing'} (${va & 7})`);
  else if (p.model === 'log' || p.model === 'hollow' || CORE.pillarOfVal(v)) out.push(`axis ${['Y', 'X', 'Z'][va & 3] || 'Y'} (${va & 3})`);
  else if (p.rot === 'side' || isChestId(v & 255)) out.push(`facing ${WRENCH_SIDES[va & 3]} (${va & 3})`);
  else return '';
  return `<b>Wrench</b> · ${nameOfVal(v)}: ${out.join(', ')}`;
}

// anything else that turns, to its next way; null when it does not
function _wrenchTurn(v, x, y, z) {
  const id = v & 255, p = PROPS[id], va = (v >> 8) & 255, s = CORE.shapeOfVal(v);
  if (!p) return null;
  if (s === 'stairs' || s === 'slope') return _wrenchVa(v, (va & ~3) | WRENCH_TURN[va & 3]);   // upside down kept
  if (s === 'ladder') return _wrenchLadder(v, x, y, z);
  if (s === 'slab') return _wrenchVa(v, SHAPE_SLAB + (((va & ROT_MASK) + 1) % 6));
  if (s === 'pane') return _wrenchVa(v, SHAPE_PANE + ((va & 1) ^ 1));
  if (s === 'gate') return _wrenchVa(v, va ^ BLOCKS.GATE_AXIS_Z);
  if (s === 'sign') return ((va >> 2) & 3) === SIGN_WALL ? null : _wrenchVa(v, (va & ~3) | WRENCH_TURN[va & 3]);
  if (s) return null;                                    // a door, a cover, a plate, a layer stack...
  if (p.torch) return _wrenchTorch(v, x, y, z);
  if (isChestId(id)) return (va & CHEST_PAIRED) ? null : _wrenchVa(v, (va & ~3) | WRENCH_TURN[va & 3]);
  if (p.model === 'log' || p.model === 'hollow' || CORE.pillarOfVal(v)) {
    if (p.model === 'log' && CORE.isQuadW(logWidthOf(va))) return null;                // a giant's quarter stays with the rest
    return _wrenchVa(v, (va & ~3) | (((va & 3) + 1) % 3));
  }
  if (p.rot === 'side' && id !== B.BED && p.model !== 'door' && p.model !== 'ladder') return _wrenchVa(v, (va & ~3) | WRENCH_TURN[va & 3]);
  return null;
}
// a torch: round the ways it can be held, standing (0) or on the block at -X, +X, -Z, +Z (1-4)
function _wrenchTorch(v, x, y, z) {
  const va = (v >> 8) & 255, cur = va & 7;
  const holds = [isSolid(x, y - 1, z), isSolid(x - 1, y, z), isSolid(x + 1, y, z), isSolid(x, y, z - 1), isSolid(x, y, z + 1)];
  for (let k = 1; k <= 5; k++) {
    const n = (cur + k) % 5;
    if (holds[n]) return _wrenchVa(v, (va & ~7) | n);
  }
  return null;
}
