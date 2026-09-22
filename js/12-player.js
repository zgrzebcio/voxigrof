'use strict';
/* voxiGrof — player state, AABB collision, movement, voxel raycast */

/* ================================================================================================
   PLAYER — creative fly (no gravity), AABB collision vs solid blocks, voxel-DDA targeting.
   ================================================================================================ */
/* THE ACTIVE player, swapped per viewport by 36-splitscreen.js — see the note on `camera`.
   Everything downstream still reads a single `player`; split screen just changes which one it is
   for the duration of that player's tick and render pass. */
var player = {
  pos: new THREE.Vector3(8.5, 96, 8.5),     // feet position
  yaw: -0.6, pitch: -0.3,
  speed: 12, fastMul: 2.2, walkSpeed: 5.6,
  R: 0.3, H: 1.8, EYE: 1.62,
  flying: true, vy: 0, lastJumpTap: 0,
  fast: false,                              // sprint is a toggle (Ctrl / L3), auto-released
  canFly: true,                             // false in survival mode
  hp: 20, food: 20, saturation: 0,          // 10 hearts / 10 drumsticks; saturation = gold-outlined buffer
  air: 10,                                  // oxygen bubbles — drains underwater, drowning at 0
  fallStart: null, prevOnGround: true,      // fall-height tracker + jump edge detection
  spawned: false,
  spawnPos: null,                           // first-spawn point — respawn target after death
  sneaking: false,
};
/* Every player currently in the world, in join order; entry 0 is player one and is what `player`
   points at outside any split-screen context swap. World systems that used to steer by "the
   player" — mob AI, item pickup, body separation — ask nearestPlayerTo() instead, so with one
   player they behave exactly as before and with four they follow whoever is closest. */
const PLAYERS = [player];
function nearestPlayerTo(x, z) {
  if (PLAYERS.length === 1) return PLAYERS[0];
  let best = null, bd = Infinity;
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead) continue;
    const dx = p.pos.x - x, dz = p.pos.z - z, d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = p; }
  }
  return best || PLAYERS[0];            // everyone dead: still need a body to measure against
}
const anyPlayerSpawned = () => PLAYERS.some(p => p.spawned);
/* The probabilistic world sweeps (litter rot, snow melt, berry regrowth) scatter a fixed number
   of samples around "the player" every few seconds. With several players the honest thing is to
   rotate: pick one at random per pass, so the per-frame cost stays flat and everyone's
   surroundings get covered over time — the sampling was already random. */
function sweepOriginPlayer() {
  let n = 0, pick = null;
  for (const p of PLAYERS) if (p.spawned && Math.random() < 1 / ++n) pick = p;   // reservoir of 1
  return pick;
}

const MAX_HP = 20, MAX_FOOD = 20, MAX_SATURATION = 20, MAX_AIR = 10;
/* One player's health ceiling (0.79). Thick Skin raised it by 10% until 0.791, when it became damage
   reduction instead (armorDamageMultiplier); nothing raises it now, but everything that caps or refills
   health already asks here, and the hearts row already draws past ten, for whatever does next. */
const playerMaxHP = (p = player) => MAX_HP;
// food economy — baseline is passive (very slow); activity + regen speed it up
const FOOD_IDLE_PER_S      = 1 / 150;       // 150s per food point when standing still
const FOOD_SPRINT_MULT     = 2.8;           // sprinting drains 2.8x idle rate (-30% from 4)
const FOOD_JUMP_COST       = 0.105;         // per jump (-30% from 0.15)
const FOOD_REGEN_COST_PER_S = 1 / 4;        // regen costs 1 food per 4s while healing
const REGEN_FOOD_MIN       = 12;            // regen kicks in above this food (per user)
const REGEN_FAST_FOOD      = 18;            // above this the regen is 2x fast (per user)
const REGEN_HP_PER_S       = 0.5;           // slow tier rate; 2x above REGEN_FAST_FOOD
// how long healing waits after a hit (0.7992), and the shorter wait while Rapid regen runs
const REGEN_HIT_WAIT = 5, REGEN_HIT_WAIT_FAST = 2;
const STARVE_HP_PER_S      = 0.25;          // HP drain when food is 0
const DROWN_DMG_BASE = 2, DROWN_DMG_STEP = 1;    // first drowning hit, and what each further one adds (0.7573)
const AIR_REGEN_EMPTY = 3, AIR_REGEN_FULL = 0.6; // bubbles/s refilled when empty, easing down to this near full (0.7573)

// double-tap jump (Space / gamepad A) toggles flying, Minecraft-creative style
function jumpTap() {
  if (!player.canFly) return;               // survival: flying disabled entirely
  const now = performance.now();
  if (now - player.lastJumpTap < 300) {
    player.flying = !player.flying;
    player.vy = 0;
    player.lastJumpTap = 0;
  } else player.lastJumpTap = now;
}

// standing on ground within 6cm below the feet? (box-aware: a slab's top counts)
function ground1(x, y, z, feetY) {
  const boxes = blockBoxes(x, y, z);
  if (!boxes) return false;
  for (const b of boxes) if (Math.abs((y + b[4]) - feetY) < 0.08) return true;   // a box top near the feet
  return false;
}
// ...and the cell below that too: a fence's collision stands 1.5 tall, so its top sits in the cell above (0.7841)
const ground2 = (x, y, z, feetY) => ground1(x, y, z, feetY) || ground1(x, y - 1, z, feetY);
function onGround() {
  const p = player.pos, R = player.R - 0.02, y = Math.floor(p.y - 0.06);
  if (y < -1) return false;
  return ground2(Math.floor(p.x - R), y, Math.floor(p.z - R), p.y) ||
         ground2(Math.floor(p.x + R), y, Math.floor(p.z - R), p.y) ||
         ground2(Math.floor(p.x - R), y, Math.floor(p.z + R), p.y) ||
         ground2(Math.floor(p.x + R), y, Math.floor(p.z + R), p.y);
}
function onGroundAt(px, py, pz) {
  const R = player.R - 0.02, y = Math.floor(py - 0.06);
  if (y < -1) return false;
  return ground2(Math.floor(px - R), y, Math.floor(pz - R), py) ||
         ground2(Math.floor(px + R), y, Math.floor(pz - R), py) ||
         ground2(Math.floor(px - R), y, Math.floor(pz + R), py) ||
         ground2(Math.floor(px + R), y, Math.floor(pz + R), py);
}

/* Soft-ground drag (0.695, per-layer since 0.696). Leaves, leaf litter and snow carpets are all
   walk-through, so the only thing that makes them matter is the slowdown, and it scales with how
   deep the stack is: -10% per snow layer (a full 8-layer drift = -80%), -5% per leaf layer (a
   whole leaf block = -40%). Worst overlapping cell wins, checked feet-to-head over the body box. */
const DRAG_PER_SNOW = 0.10, DRAG_PER_LEAF = 0.05, DRAG_FLOOR = 0.2;
const LEAF_DRAG_IDS = new Set([B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);
// slowdown per layer of each block you wade through (0.785: sand, gravel and fiber stacks join snow and leaves)
const DRAG_PER_LAYER = { [B.SNOW]: DRAG_PER_SNOW, [B.LEAVES]: DRAG_PER_LEAF, [B.BIRCH_LEAVES]: DRAG_PER_LEAF,
                         [B.SPRUCE_LEAVES]: DRAG_PER_LEAF, [B.SAND]: 0.06, [B.RED_SAND]: 0.06, [B.GRAVEL]: 0.05,
                         [B.FIBER_BLOCK]: 0.04 };
// speed multiplier this cell imposes, given how far the feet sit above the cell floor
function _cellDrag(val, feetOff, x, y, z) {
  const id = val & 255, n = CORE.layerCount(val);
  if (!n) {
    // a leaf block is a full cell of foliage: the whole LAYER_MAX worth of leaf layers
    if (LEAF_DRAG_IDS.has(id)) return Math.max(DRAG_FLOOR, 1 - DRAG_PER_LEAF * LAYER_MAX);
    if (id === B.COBWEB) return COBWEB_DRAG;           // caught in a web (0.766)
    return 1;
  }
  // a solid layer is a floor, not a drift; and above a thin stack's top the feet are clear of it
  if (!PROPS[id].layerStack || feetOff >= n / LAYER_MAX) return 1;
  let drag = 0;
  for (const b of layerIdsAt(x, y, z, val)) drag += DRAG_PER_LAYER[b] || 0;
  return Math.max(DRAG_FLOOR, 1 - drag);
}
// worst drag over an axis-aligned body box (feet at cy, half-width R, height H). Mobs use it too.
function boxDragMul(cx, cy, cz, R, H) {
  let mul = 1;
  const maxY = Math.floor(cy + H);
  for (let y = Math.floor(cy); y <= maxY; y++) {
    const feetOff = Math.max(0, cy - y);
    for (let z = Math.floor(cz - R); z <= Math.floor(cz + R); z++)
      for (let x = Math.floor(cx - R); x <= Math.floor(cx + R); x++) {
        const m = _cellDrag(getBlock(x, y, z), feetOff, x, y, z);
        if (m < mul) mul = m;
      }
  }
  return mul;
}
function terrainSpeedMul() {
  const p = player.pos;
  const raw = boxDragMul(p.x, p.y, p.z, player.R - 0.02, player.H);
  /* A full leather set blunts the PENALTY, not the speed (0.732): a 40% leaf slowdown becomes 28%
     rather than the player simply moving faster everywhere. Written this way so a resistance of 1
     would remove the slowdown entirely and never overshoot into a speed boost. */
  let r = typeof playerTerrainDragResist === 'function' ? playerTerrainDragResist() : 0;
  // a web is not ground: leather boots help only half as much against it (0.766)
  if (r > 0 && playerInCobweb()) r *= COBWEB_RESIST_MUL;
  return r > 0 ? 1 - (1 - raw) * (1 - r) : raw;
}

/* Snow saps a jump (0.7575): -4% jump strength for every snow layer the feet are standing in, the
   deepest cell under the body counting. Leaf litter does not. */
const JUMP_PER_SNOW = 0.04;
function snowJumpMul() {
  const p = player.pos, R = player.R - 0.02, y = Math.floor(p.y + 0.01);
  let most = 0;
  for (let z = Math.floor(p.z - R); z <= Math.floor(p.z + R); z++)
    for (let x = Math.floor(p.x - R); x <= Math.floor(p.x + R); x++) {
      const val = getBlock(x, y, z);
      let n = 0;
      if (CORE.layerCount(val)) for (const b of layerIdsAt(x, y, z, val)) if (b === B.SNOW) n++;
      if (n > most) most = n;
    }
  return Math.max(0, 1 - JUMP_PER_SNOW * most);
}

/* Climbing (0.765). A player whose body overlaps a climbable block (glow vine) climbs: forward or jump
   goes up, sneak holds still, and otherwise they slide down slowly instead of falling. */
/* Cobweb (0.766): walking speed x0.2 (80% slower), falls and jumps are held back too (22-main-loop.js),
   and the leather set's ground-drag resistance works at half strength inside one. */
const COBWEB_DRAG = 0.2, COBWEB_RESIST_MUL = 0.5, COBWEB_VY_MAX = 2.0;
function playerInCobweb() {
  const p = player.pos, R = player.R - 0.02;
  for (let y = Math.floor(p.y); y <= Math.floor(p.y + player.H); y++)
    for (let z = Math.floor(p.z - R); z <= Math.floor(p.z + R); z++)
      for (let x = Math.floor(p.x - R); x <= Math.floor(p.x + R); x++)
        if ((getBlock(x, y, z) & 255) === B.COBWEB) return true;
  return false;
}
const CLIMB_SPEED = 2.6, CLIMB_SLIDE = 1.8;
const CLIMB_LOOK_BONUS = 0.25;           // looking straight up/down: +25% climb/slide speed (0.7652)
function playerOnClimbable() {
  const p = player.pos, R = player.R - 0.02;
  for (let y = Math.floor(p.y); y <= Math.floor(p.y + 1.2); y++)
    for (let z = Math.floor(p.z - R); z <= Math.floor(p.z + R); z++)
      for (let x = Math.floor(p.x - R); x <= Math.floor(p.x + R); x++)
        if (PROPS[getBlock(x, y, z) & 255]?.climbable) return true;
  return false;
}

function collideAxis(axis, delta) {
  if (delta === 0) return;
  const p = player.pos, R = player.R, H = player.H, EPS = 0.001;
  p.setComponent(axis, p.getComponent(axis) + delta);
  const minX = Math.floor(p.x - R), maxX = Math.floor(p.x + R);
  // one cell lower than the feet too: a fence's collision reaches 1.5 up into the cell above it (0.7841)
  const minY = Math.floor(p.y) - 1, maxY = Math.floor(p.y + H);
  const minZ = Math.floor(p.z - R), maxZ = Math.floor(p.z + R);
  for (let y = minY; y <= maxY; y++)
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++) {
        const boxes = blockBoxes(x, y, z);
        if (!boxes) continue;
        for (const b of boxes) {
          // sub-box world extents. Resolve the moving axis only when the player AABB actually
          // penetrates the box on ALL THREE axes — including the moving one. Checking only the
          // other two lets a player standing BESIDE a sub-box (same cell, different sub-region,
          // e.g. off the empty half of a vertical slab) get clamped to the box face and teleport.
          const X0 = x+b[0], Y0 = y+b[1], Z0 = z+b[2], X1 = x+b[3], Y1 = y+b[4], Z1 = z+b[5];
          if (!(p.x-R < X1 && p.x+R > X0 && p.y < Y1 && p.y+H > Y0 && p.z-R < Z1 && p.z+R > Z0)) continue;
          if (axis === 0)      p.x = delta > 0 ? Math.min(p.x, X0 - R - EPS) : Math.max(p.x, X1 + R + EPS);
          else if (axis === 1) p.y = delta > 0 ? Math.min(p.y, Y0 - H - EPS) : Math.max(p.y, Y1 + EPS);
          else                 p.z = delta > 0 ? Math.min(p.z, Z0 - R - EPS) : Math.max(p.z, Z1 + R + EPS);
        }
      }
}
function movePlayer(dx, dy, dz) {
  const STEP = 0.55;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.25));
  for (let i = 0; i < steps; i++) {
    const sdx = dx / steps, sdz = dz / steps, sdy = dy / steps;
    const ox = player.pos.x, oy = player.pos.y, oz = player.pos.z;
    collideAxis(0, sdx);
    collideAxis(2, sdz);
    const ax = player.pos.x, az = player.pos.z;
    // step-up: grounded, not jumping, horizontally blocked → try climbing over ledge
    if ((sdx * sdx + sdz * sdz) > 1e-12 && sdy <= 0 && onGround()) {
      const errX = ax - ox - sdx, errZ = az - oz - sdz;
      const err2 = errX * errX + errZ * errZ;
      if (err2 > (sdx * sdx + sdz * sdz) * 0.01) {
        player.pos.set(ox, oy, oz);
        collideAxis(1, STEP);
        if (player.pos.y - oy > 0.01) {
          collideAxis(0, sdx);
          collideAxis(2, sdz);
          const bx = player.pos.x, bz = player.pos.z;
          const eX2 = bx - ox - sdx, eZ2 = bz - oz - sdz;
          if (eX2 * eX2 + eZ2 * eZ2 < err2 - 0.0001) {
            // step-up reduced collision error — keep lifted position
          } else {
            player.pos.set(ax, oy, az);
          }
        } else {
          player.pos.set(ax, oy, az);
        }
      }
    }
    collideAxis(1, sdy);
  }
}

// ray vs axis-aligned box (slab method); returns the entry hit {t,nx,ny,nz} or null
function rayBox(o, d, X0, Y0, Z0, X1, Y1, Z1) {
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z], L = [X0, Y0, Z0], H = [X1, Y1, Z1];
  let tmin = -Infinity, tmax = Infinity, axis = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(D[i]) < 1e-9) { if (O[i] < L[i] || O[i] > H[i]) return null; continue; }
    let t1 = (L[i] - O[i]) / D[i], t2 = (H[i] - O[i]) / D[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) { tmin = t1; axis = i; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0 || tmax < 0) return null;
  const n = [0, 0, 0]; n[axis] = D[axis] > 0 ? -1 : 1;   // entry face normal opposes the ray
  return { t: tmin, nx: n[0], ny: n[1], nz: n[2] };
}

/* 0.7295 — plants are targetable again, but only in creative. Bush pickup is the survival way to
   gather grass/wheat/berries, and it needs the crosshair to pass straight through them; creative
   has no bush pickup at all, so there the ray must stop on a plant or grass could not be removed
   by hand. Reads `player.canFly` (the creative flag) live, per ray. */
const _plantsTargetable = () => !!(typeof player !== 'undefined' && player && player.canFly);

// Amanatides & Woo voxel traversal; skips non-raycastable blocks (water can never be targeted).
// For non-cube models (slabs) it refines the cell hit against the real sub-boxes, so aiming
// through a slab's empty upper half passes through instead of falsely targeting the cell.
function raycastVoxel(origin, dir, maxDist) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
  const dtX = Math.abs(1 / dir.x), dtY = Math.abs(1 / dir.y), dtZ = Math.abs(1 / dir.z);
  let tX = dir.x !== 0 ? Math.abs(((stepX > 0 ? x + 1 : x) - origin.x) / dir.x) : Infinity;
  let tY = dir.y !== 0 ? Math.abs(((stepY > 0 ? y + 1 : y) - origin.y) / dir.y) : Infinity;
  let tZ = dir.z !== 0 ? Math.abs(((stepZ > 0 ? z + 1 : z) - origin.z) / dir.z) : Infinity;
  let nx = 0, ny = 0, nz = 0;
  let tEnter = 0;                     // distance along the ray at which we entered the current cell
  for (let i = 0; i < 256; i++) {
    const b = getBlock(x, y, z), id = b & 255, prop = PROPS[id];
    /* `noTarget` blocks are see-through to the crosshair in SURVIVAL: the ray passes straight
       on, because bush pickup is what gathers them. Kept separate from `raycast:false` because
       that flag also drops a block from the creative palette (13-actions builds PLACEABLE from
       it) — grass still has to be placeable, it just must never be what a survival player is
       aiming at. In creative the ray does stop on them (see _plantsTargetable). */
    // ...and a held hoe stops on GRASS too, so it can be aimed at a field to cut it (0.757)
    if (b !== 0 && prop.raycast && (!prop.noTarget || _plantsTargetable() ||
        (typeof hoeTargetsPlant === 'function' && hoeTargetsPlant(id)))) {
      const boxes = rayBoxesAt(x, y, z);                     // neighbour-aware (stair corners) box list
      if (!boxes) return { x, y, z, nx, ny, nz, id, t: tEnter };   // full cube: cell hit is the face hit
      let best = null, bestI = 0;                            // slab etc: refine against sub-boxes
      for (let bi = 0; bi < boxes.length; bi++) {
        const bb = boxes[bi];
        const hit = rayBox(origin, dir, x+bb[0], y+bb[1], z+bb[2], x+bb[3], y+bb[4], z+bb[5]);
        if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) { best = hit; bestI = bi; }
      }
      if (best) return { x, y, z, nx: best.nx, ny: best.ny, nz: best.nz, id, bi: bestI, t: best.t };
      // no box hit in this cell -> keep traversing
    }
    if (tX < tY && tX < tZ) { if (tX > maxDist) return null; tEnter = tX; x += stepX; tX += dtX; nx = -stepX; ny = 0; nz = 0; }
    else if (tY < tZ)       { if (tY > maxDist) return null; tEnter = tY; y += stepY; tY += dtY; nx = 0; ny = -stepY; nz = 0; }
    else                    { if (tZ > maxDist) return null; tEnter = tZ; z += stepZ; tZ += dtZ; nx = 0; ny = 0; nz = -stepZ; }
  }
  return null;
}

