'use strict';
/* blocks/gates.js: gates. A gate is the Gate shape of a fence's or a wall's block (SHAPE_GATE, shapes/shapes.js: GATE_AXIS_Z
   the way its line runs, GATE_OPEN, GATE_SWING_POS the side it opened to, GATE_WALL made of a wall, as tall as one); its boxes
   are gateBoxes (shapes/boxes.js). Fences and walls join it like one of their own, on a diagonal too, never up or down a step.

   MADE: sneak + right-click a fence or a wall with no block in the hand (makeGate). It keeps its block and look, and lies
   along the line of the fences or walls beside it, else across the way you look. Not undone by hand: break it (it gives its
   block back, as the fence or wall did) and put the fence or wall down again.
   USED: right-click opens or shuts it (toggleGate), swung away from you; alone it opens as two halves from the middle, one of
   a pair (another gate of its block beside it along its line) swings as one panel with the other. A pressure plate opens it
   and holds it like a door (PLATE_TARGETS.gate, blocks/pressure-plates.js).
   DRAWN on the page, as a door is: the mesher leaves its cell empty (chunks/mesher-models.js), and each panel here swings
   round its hinge (GATES, updateGates). Its boxes for the crosshair and for walking into are still gateBoxes'. */

const { SHAPE_GATE, GATE_AXIS_Z, GATE_OPEN, GATE_SWING_POS, GATE_WALL } = BLOCKS;
const isGateVal = (v) => CORE.shapeOfVal(v) === 'gate';
const gateOpen = (v) => (((v >> 8) & 255) & GATE_OPEN) !== 0;

// the other gate of a pair: a gate of its block, the same way, beside it along its line; a gate alone (or between two) has none
function gatePartner(x, y, z, v) {
  const alongZ = (((v >> 8) & 255) & GATE_AXIS_Z) !== 0, out = [];
  for (const k of [1, -1]) {
    const nx = alongZ ? x : x + k, nz = alongZ ? z + k : z, n = getBlock(nx, y, nz);
    if ((n & 255) === (v & 255) && isGateVal(n) && ((((n >> 8) & 255) & GATE_AXIS_Z) !== 0) === alongZ) out.push([nx, nz, k]);
  }
  return out.length === 1 ? out[0] : null;
}

// a fence or a wall made a gate, along its line (the ones of its block beside it), else across the way you look
function makeGate(x, y, z, v, fam) {
  const id = v & 255, joined = (dx, dz) => BLOCKS.joinsAs(getBlock(x + dx, y, z + dz), id, fam);
  const alongX = joined(1, 0) || joined(-1, 0), alongZ = joined(0, 1) || joined(0, -1);
  const lookZ = Math.abs(player.pos.x - (x + 0.5)) > Math.abs(player.pos.z - (z + 0.5));   // you stand off its X side: it runs along Z
  const axisZ = alongX !== alongZ ? alongZ : lookZ;
  const va = SHAPE_GATE | (axisZ ? GATE_AXIS_Z : 0) | (fam === 'wall' ? GATE_WALL : 0);
  setBlock(x, y, z, ((v & 0x00FF00FF) | (va << 8)) >>> 0);     // its block and look; any joins set by hand go
  playBlockSound(id, 'place', x, y, z);
}

// open or shut it, and the other of its pair; opening, it swings away from where you stand
function toggleGate(x, y, z) {
  const v = getBlock(x, y, z);
  if (!isGateVal(v)) return;
  const va = (v >> 8) & 255, opening = !(va & GATE_OPEN);
  const across = (va & GATE_AXIS_Z) ? player.pos.x - (x + 0.5) : player.pos.z - (z + 0.5);
  const bits = opening ? GATE_OPEN | (across < 0 ? GATE_SWING_POS : 0) : 0;
  const p = gatePartner(x, y, z, v);
  for (const [cx, cz] of p ? [[x, z], p] : [[x, z]]) {
    const cv = getBlock(cx, y, cz), cva = ((cv >> 8) & 255) & ~(GATE_OPEN | GATE_SWING_POS);
    setBlock(cx, y, cz, ((cv & ~0xFF00) | ((cva | bits) << 8)) >>> 0);
  }
  playSound(opening ? 'doorOpen' : 'doorClose', { gain: 0.6, pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 } });
}

/* ---- the swinging mesh ----
   GATES "x,y,z" -> { x, y, z, group, pivots: [{ p, h0 }], sig, lit }. Built from its cell once its chunk is there, and again
   when its block, look, line or pair changes (sig); in the world's shader, lit by its cell (a drop's material and light,
   _dropMat in 15-drops.js). Laid out along X (gateBoxes' layout) inside a frame turned a quarter for a gate along Z, each
   panel in a pivot at its hinge on the line's middle. */
const GATES = new Map(), _gateSwing = new Set();
const GATE_SWING_SPEED = 9;                      // radians a second, as a door
let _gatePassT = 0;
const _gateKey = (x, y, z) => x + ',' + y + ',' + z;
// setBlock's hook (chunks/block-access.js): a gate made, opened or shut starts at once; one gone takes its mesh
function gateChanged(x, y, z, oldVal, val) {
  const k = _gateKey(x, y, z);
  if (!isGateVal(val)) { removeGateMesh(k); return; }
  if (!GATES.has(k)) GATES.set(k, { x, y, z, group: null, pivots: [], sig: '', lit: 0xF0 });
  _gateSwing.add(k);
  _gatePassT = 0;                                // looked over at once: a pair's other gate built again now, not later
}
// a world loading: every gate in its edits, built as its land comes in
function registerGate(x, y, z) {
  const k = _gateKey(x, y, z);
  if (!GATES.has(k)) GATES.set(k, { x, y, z, group: null, pivots: [], sig: '', lit: 0xF0 });
}
function _gateUnbuild(gt) {
  if (!gt.group) return;
  scene.remove(gt.group);
  gt.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  gt.group = null; gt.pivots = [];
}
function removeGateMesh(k) {
  const gt = GATES.get(k);
  if (gt) _gateUnbuild(gt);
  GATES.delete(k);
  _gateSwing.delete(k);
}
function clearGates() { for (const k of [...GATES.keys()]) removeGateMesh(k); }

// boxes (in blocks, the cell's own: their art follows them as a chunk's does) as one geometry, less (ox, 0, oz)
function _gateGeom(boxes, f, ox, oz) {
  const pos = [], uv = [], tile = [], shade = [], idx = [];
  const face = (c, u, t, s) => {
    const b = pos.length / 3;
    for (const p of c) pos.push(p[0] - ox, p[1], p[2] - oz);
    for (const q of u) uv.push(q[0], q[1]);
    for (let i = 0; i < 4; i++) { tile.push(t); shade.push(s); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // the faces as emitBoxFaces draws them (chunks/mesher-models.js), none left out
  for (const u of boxes) {
    const [x0, y0, z0, x1, y1, z1] = u;
    face([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], [[u[0],u[2]],[u[3],u[2]],[u[3],u[5]],[u[0],u[5]]], f[3], 140);
    face([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]], [[1-u[2],u[1]],[1-u[2],u[4]],[1-u[5],u[4]],[1-u[5],u[1]]], f[0], 178);
    face([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], [[u[2],u[1]],[u[5],u[1]],[u[5],u[4]],[u[2],u[4]]], f[1], 178);
    face([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], [[u[0],u[1]],[u[3],u[1]],[u[3],u[4]],[u[0],u[4]]], f[4], 216);
    face([[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]], [[1-u[0],u[1]],[1-u[0],u[4]],[1-u[3],u[4]],[1-u[3],u[1]]], f[5], 216);
    face([[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]], [[u[0],u[2]],[u[0],u[5]],[u[3],u[5]],[u[3],u[2]]], f[2], 255);
  }
  const n = pos.length / 3, geo = new THREE.BufferGeometry();
  geo.setAttribute('position',   new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv',         new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('tile',       new THREE.BufferAttribute(new Uint16Array(tile), 1, false));
  geo.setAttribute('shade',      new THREE.BufferAttribute(new Uint8Array(shade), 1, true));
  geo.setAttribute('blockLight', new THREE.BufferAttribute(new Uint16Array(n), 1, false));   // the cell's, as a uniform
  geo.setAttribute('clim',       new THREE.BufferAttribute(new Int8Array(n), 1, true));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  return geo;
}
// each draw hands the shader its gate's light (packed as a cell's: sky << 4 | block, 256 a blue light)
function _gateLightHook(_r, _s, _c, _g, material) {
  const u = material.uniforms && material.uniforms.uLightOverride, lit = this.userData.gate.lit;
  if (!u || u.value === lit) return;
  u.value = lit;
  material.uniformsNeedUpdate = true;
}
// what a gate is drawn from, but how far open: its block, look, line and kind, and its pair
const _gateSig = (v, p) => (((v & 0x00FFFFFF) & ~((GATE_OPEN | GATE_SWING_POS) << 8)) >>> 0) + ':' + (p ? p[2] : 0);
// a panel's angle about its hinge: shut 0, open a quarter away to the side it swung (in the frame's own layout)
function _gateAngle(va, h0) {
  if (!(va & GATE_OPEN)) return 0;
  const s = ((va & GATE_AXIS_Z) ? -1 : 1) * ((va & GATE_SWING_POS) ? 1 : -1);   // the frame along Z mirrors the side
  return (h0 ? -1 : 1) * s * Math.PI / 2;
}
function _gateBuild(gt, v, p) {
  _gateUnbuild(gt);
  const va = (v >> 8) & 255, kind = (va & GATE_WALL) ? 'wall' : 'fence', id = v & 255;
  const pp = PROPS[id].pass, mat = _dropMat(pp === 4 ? 4 : pp === 1 ? 1 : 0), f = facesOfVal(v);
  const group = new THREE.Group(), frame = new THREE.Group();
  group.position.set(gt.x, gt.y, gt.z);
  frame.position.set(0.5, 0, 0.5);
  frame.rotation.y = (va & GATE_AXIS_Z) ? -Math.PI / 2 : 0;
  group.add(frame);
  // [a0, a1, hinged at a0] in sixteenths along the line: one of a pair a whole panel, a gate alone two halves
  for (const [a0, a1, h0] of p ? [[0, 16, p[2] > 0]] : [[0, 8, true], [8, 16, false]]) {
    const h = (h0 ? a0 : a1) / 16, pivot = new THREE.Group();
    pivot.position.set(h - 0.5, 0, 0);
    const boxes = BLOCKS._gatePanel(a0, a1, kind, a1 - a0 > 8).map(b => b.map(n => n / 16));
    const mesh = new THREE.Mesh(_gateGeom(boxes, f, h, 0.5), mat);
    mesh.userData.gate = gt;
    mesh.onBeforeRender = _gateLightHook;
    pivot.add(mesh);
    pivot.rotation.y = _gateAngle(va, h0);       // where it is now: no swing on coming into view
    frame.add(pivot);
    gt.pivots.push({ p: pivot, h0 });
  }
  scene.add(group);
  gt.group = group;
}
/* Once a frame only the gates swinging are stepped; every LIST_PASS_S each is looked over: hidden while its chunk is out,
   gone when its cell is no gate, built again when what it is drawn from changed, and its light read. */
function updateGates(dt) {
  if (!GATES.size) return;
  if ((_gatePassT -= dt) <= 0) {
    _gatePassT = LIST_PASS_S;
    for (const [k, gt] of GATES) {
      const c = getChunk(Math.floor(gt.x / 16), Math.floor(gt.z / 16));
      if (!c || !c.data) { if (gt.group) gt.group.visible = false; continue; }
      const v = getBlock(gt.x, gt.y, gt.z);
      if (!isGateVal(v)) { removeGateMesh(k); continue; }
      const p = gatePartner(gt.x, gt.y, gt.z, v), sig = _gateSig(v, p);
      if (sig !== gt.sig || !gt.group) { _gateBuild(gt, v, p); gt.sig = sig; }
      gt.group.visible = true;
      let lit = (getSkyWorld(gt.x, gt.y, gt.z) << 4) | getLightWorld(gt.x, gt.y, gt.z);
      if ((lit & 15) && lightColdWorld(gt.x, gt.y, gt.z)) lit |= 256;
      gt.lit = lit;
    }
  }
  for (const k of _gateSwing) {
    const gt = GATES.get(k);
    if (!gt || !gt.group || !_gateStep(gt, dt)) _gateSwing.delete(k);
  }
}
// one frame of its panels' swing toward the angle its cell says; false once they are there
function _gateStep(gt, dt) {
  const v = getBlock(gt.x, gt.y, gt.z);
  if (!isGateVal(v)) return false;
  const va = (v >> 8) & 255;
  let moving = false;
  for (const pv of gt.pivots) {
    const target = _gateAngle(va, pv.h0), diff = target - pv.p.rotation.y;
    if (Math.abs(diff) < 1e-4) { pv.p.rotation.y = target; continue; }
    pv.p.rotation.y += Math.max(-GATE_SWING_SPEED * dt, Math.min(GATE_SWING_SPEED * dt, diff));
    moving = true;
  }
  return moving;
}

/* The right button on a fence, a wall or a gate (place-block.js): a gate opens or shuts; sneaking with no block in hand
   (`sneakBlock` false) makes a fence or a wall a gate. True when it took the click. */
function tryUseGate(hit, sneakBlock) {
  const v = getBlock(hit.x, hit.y, hit.z), s = CORE.shapeOfVal(v);
  if (s === 'gate' && !sneakBlock) {
    if (!(act && act.place)) toggleGate(hit.x, hit.y, hit.z);   // once a press
    return true;
  }
  if ((s === 'fence' || s === 'wall') && player.sneaking && !sneakBlock) {
    if (!(act && act.place)) makeGate(hit.x, hit.y, hit.z, v, s);
    return true;
  }
  return false;
}
