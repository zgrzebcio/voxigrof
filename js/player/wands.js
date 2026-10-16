'use strict';
/* player/wands.js: creative's building and breaking wands. The set of joined blocks a wand acts on, and its outline. */

// what a wand would do here: { cells, id, put } (build: the free cells to fill; break: the blocks to take), or null
function wandCells(hit, mode) {
  const v = getBlock(hit.x, hit.y, hit.z), id = v & 255, p = PROPS[id];
  const shapeHi = ((v >> 8) & 255) & 0xF0;                  // a mixed layer stack (0x60) or mixed slab (0x90) lives off-cell
  if (!p || WAND_SKIP.has(id) || isNoTargetPlant(id) || p.model === 'cross' || p.torch || p.topOnly
      || shapeHi === 0x60 || shapeHi === 0x90 || BLOCKS.isDoorVal(v)) return null;   // a door, two cells and a mesh
  const nx = hit.nx | 0, ny = hit.ny | 0, nz = hit.nz | 0;
  if (!nx && !ny && !nz) return null;
  const build = mode === 'build';
  const put = p.model === 'log' ? id | (((v >> 8) & 3) << 8) : v;
  const steps = _wandSteps(nx ? [[0, 1, 0], [0, 0, 1]] : ny ? [[1, 0, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0]]);
  const pr = player.pos, R = player.R, H = player.H;
  const inMe = (x, y, z) => p.solid && x + 1 > pr.x - R && x < pr.x + R && y + 1 > pr.y && y < pr.y + H && z + 1 > pr.z - R && z < pr.z + R;
  /* building: a block whose cell out front is taken (by the same block or any other) neither gets a copy nor
     passes the spread on, so the new layer only grows out from the clicked block across open front: it never jumps
     past a filled spot to land a block or two away. The clicked block's own front taken: nothing at all. */
  const freeFront = (x, y, z) => {
    const tx = x + nx, ty = y + ny, tz = z + nz;
    return ty >= 1 && ty < WORLD_TOP && isPlaceableInto(getBlock(tx, ty, tz) & 255) && !inMe(tx, ty, tz)
        && (OVERHANG_OK.includes(id) || !logOverhangsCell(tx, ty, tz));
  };
  if (build && !freeFront(hit.x, hit.y, hit.z)) return null;
  const seen = new Set([hit.x + ',' + hit.y + ',' + hit.z]), q = [[hit.x, hit.y, hit.z]], cells = [];
  for (let qi = 0; qi < q.length && cells.length < WAND_MAX; qi++) {
    const [x, y, z] = q[qi];
    cells.push(build ? [x + nx, y + ny, z + nz] : [x, y, z]);
    for (const [sx, sy, sz] of steps) {
      const x2 = x + sx, y2 = y + sy, z2 = z + sz, k = x2 + ',' + y2 + ',' + z2;
      if (seen.has(k) || Math.abs(x2 - hit.x) > WAND_REACH || Math.abs(y2 - hit.y) > WAND_REACH || Math.abs(z2 - hit.z) > WAND_REACH) continue;
      seen.add(k);
      if (getBlock(x2, y2, z2) === v && (!build || freeFront(x2, y2, z2))) q.push([x2, y2, z2]);
    }
  }
  return cells.length ? { cells, id, put } : null;
}
function wandBuild(hit) {
  if (!player.canFly) { feedWarn('The building wand works only in creative'); return; }
  const w = wandCells(hit, 'build');
  if (!w) return;
  const place = () => { for (const [x, y, z] of w.cells) { clearPlantAt(x, y, z); setBlock(x, y, z, w.put); } };
  if (typeof _litEdits === 'function') _litEdits(w.cells, place); else place();   // the light worked out once for the lot
  playBlockSound(w.id, 'place', w.cells[0][0], w.cells[0][1], w.cells[0][2]);
  handPlaceSwing = true;
  player._wandKey = null;                                   // the outline is drawn again for what is there now
}
function wandBreak(hit) {
  if (!player.canFly) { feedWarn('The breaking wand works only in creative'); return; }
  const w = wandCells(hit, 'break');
  if (!w) return;
  const take = () => { for (const [x, y, z] of w.cells) setBlock(x, y, z, B.AIR); };
  if (typeof _litEdits === 'function') _litEdits(w.cells, take); else take();
  playBlockSound(w.id, 'break', hit.x, hit.y, hit.z);
  handPlaceSwing = true;
  player._wandKey = null;
}
/* The wand's outline, per player (each seat its own; 36-splitscreen shows only the seat's own in its view):
   the outside edges of the cells it would fill or take — an edge between two cells showing the same flat face is left
   out, so a wall reads as one shape, not a grid of boxes. Drawn through everything in front (no depth test), white
   for building, red for breaking. Worked out again when the aim moves or every WAND_OUTLINE_S. */
const WAND_OUTLINE_S = 0.3;
const _WAND_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function _wandOutlinePos(cells) {
  const S = new Set(cells.map(c => c[0] + ',' + c[1] + ',' + c[2]));
  const has = (x, y, z) => S.has(x + ',' + y + ',' + z);
  const seg = new Set(), pos = [];
  const add = (a, b) => {
    const k1 = a.join() + '|' + b.join(), k2 = b.join() + '|' + a.join();
    if (seg.has(k1) || seg.has(k2)) return;
    seg.add(k1); pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  };
  for (const [x, y, z] of cells)
    for (const [nx, ny, nz] of _WAND_N) {
      if (has(x + nx, y + ny, z + nz)) continue;            // this face is inside the lot
      const ax = nx ? [[0, 1, 0], [0, 0, 1]] : ny ? [[1, 0, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0]];
      for (const [u, w] of [[ax[0], ax[1]], [ax[1], ax[0]]])
        for (const s of [1, -1]) {
          // across this edge the next cell shows the same flat face: one patch, no line
          const mx = x + u[0] * s, my = y + u[1] * s, mz = z + u[2] * s;
          if (has(mx, my, mz) && !has(mx + nx, my + ny, mz + nz)) continue;
          const cx = x + 0.5 + (nx + u[0] * s) * 0.5, cy = y + 0.5 + (ny + u[1] * s) * 0.5, cz = z + 0.5 + (nz + u[2] * s) * 0.5;
          add([cx - w[0] * 0.5, cy - w[1] * 0.5, cz - w[2] * 0.5], [cx + w[0] * 0.5, cy + w[1] * 0.5, cz + w[2] * 0.5]);
        }
    }
  return pos;
}
/* Thick and pulsing: a GL line is one pixel whatever it is asked, so each edge is a thin square bar
   WAND_BAR across (a box round the segment), and the whole outline breathes, brightness and see-through, once every
   WAND_PULSE_S. */
const WAND_BAR = 0.035, WAND_PULSE_S = 1.1;
const WAND_COL = { build: [1, 1, 1], break: [1, 0.25, 0.25] };
// the bars of an outline's segments, as triangles: every segment is axis-aligned, so its box is min..max grown by t
function _wandBarGeo(pos, t) {
  const n = pos.length / 6, P = new Float32Array(n * 24), I = new Uint32Array(n * 36);
  const F = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
  for (let s = 0; s < n; s++) {
    const o = s * 6;
    const x0 = Math.min(pos[o], pos[o + 3]) - t, x1 = Math.max(pos[o], pos[o + 3]) + t;
    const y0 = Math.min(pos[o + 1], pos[o + 4]) - t, y1 = Math.max(pos[o + 1], pos[o + 4]) + t;
    const z0 = Math.min(pos[o + 2], pos[o + 5]) - t, z1 = Math.max(pos[o + 2], pos[o + 5]) + t;
    for (let c = 0; c < 8; c++) {                           // corner c: bit 2 x, bit 1 y, bit 0 z
      P[s * 24 + c * 3] = c & 4 ? x1 : x0; P[s * 24 + c * 3 + 1] = c & 2 ? y1 : y0; P[s * 24 + c * 3 + 2] = c & 1 ? z1 : z0;
    }
    for (let k = 0; k < 36; k++) I[s * 36 + k] = s * 8 + F[k];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}
function _wandLines(p) {
  if (p._wandLines) return p._wandLines;
  const L = new THREE.Mesh(new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false,
                                  side: THREE.DoubleSide, fog: false }));
  L.renderOrder = 999; L.frustumCulled = false; L.visible = false;
  L.layers.set(1);                                          // never in the shadow maps
  scene.add(L);
  return p._wandLines = L;
}
// once a frame per seat, from its tick (22-main-loop.js), with what it is aiming at
function updateWandOutline(hit) {
  const p = player, held = slotId(HOTBAR[hotbarSel]);
  const mode = held === ITEM.BUILD_WAND ? 'build' : held === ITEM.BREAK_WAND ? 'break' : null;
  if (!mode || !p.canFly || !hit) { p._wandShow = false; p._wandKey = null; return; }
  const key = mode + ':' + hit.x + ',' + hit.y + ',' + hit.z + ':' + hit.nx + ',' + hit.ny + ',' + hit.nz, now = performance.now();
  const L = _wandLines(p);
  // the pulse, every frame: brightness and see-through rising and falling together
  const k = 0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 2 / WAND_PULSE_S), c = WAND_COL[mode], b = 0.6 + 0.4 * k;
  L.material.color.setRGB(c[0] * b, c[1] * b, c[2] * b);
  L.material.opacity = 0.45 + 0.5 * k;
  if (key === p._wandKey && now < (p._wandAt || 0)) return;
  p._wandKey = key; p._wandAt = now + WAND_OUTLINE_S * 1000;
  const w = wandCells(hit, mode);
  p._wandShow = !!w;
  if (!w) return;
  L.geometry.dispose();
  L.geometry = _wandBarGeo(_wandOutlinePos(w.cells), WAND_BAR);
}
// a wand in the hand acts once a press, never again while the button is held (22-main-loop.js)
const holdingWand = () => { const id = slotId(HOTBAR[hotbarSel]); return id === ITEM.BUILD_WAND || id === ITEM.BREAK_WAND; };
