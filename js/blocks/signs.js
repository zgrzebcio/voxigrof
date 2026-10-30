'use strict';
/* blocks/signs.js: the sign on the page. Its words: drawn on its board in the world, written in the sign editor, kept with
   the world. And what holds one up.

   THE SHAPE is SHAPE_SIGN (shapes/shapes.js: facing in the variant's bits 0-1, how it is put up in bits 2-3, SIGN_STAND /
   SIGN_WALL / SIGN_HANG; its boxes SIGN_BOX in shapes/boxes.js, drawn by the mesher in its block's art), taken by the blocks
   in SHAPE_BLOCKS.sign (planks, stone, cobblestone, the four rocks, the iron block), picked on the hammer's Advanced page
   (shapes/chisel.js) and put up by player/place-block.js (the variant from where you click, player/placing.js; it needs
   signSupported). Nothing collides with it.

   THE WORDS: SIGN_TEXTS "x,y,z" -> { x, y, z, lines, mesh, ... }, SIGN_LINES lines, each as long as fits the board in
   SIGN_FONT (signLineFits). updateSigns (every frame, a few times a second) keeps a plane with the words in front of each
   written sign whose land is in, lit by the light there. The editor (openSignEditor: a new sign at once, a written one
   on use) shows the board at SIGN_UI_SCALE with the same font, so a line takes no more than the board does. Saved as
   `signs` (16-worlds.js).

   HELD UP by the block under it (standing), behind it (on a wall) or over it (hanging): that block gone, the sign comes
   down as its block (signChanged, setBlock's hook in chunks/block-access.js). */

const SIGN_LINES = 4;
const SIGN_CANVAS_W = 256, SIGN_CANVAS_H = 128;   // the board's face, 16 x 8 sixteenths, at 16 canvas pixels a sixteenth
const SIGN_PAD_X = 8, SIGN_LINE_H = 28;           // room left at each end of a line, a line's height
const SIGN_TOP = (SIGN_CANVAS_H - SIGN_LINES * SIGN_LINE_H) / 2;
const SIGN_TEXT_W = SIGN_CANVAS_W - 2 * SIGN_PAD_X;
const SIGN_FONT_PX = 21;
const signFont = (px) => `bold ${px}px Consolas, "Courier New", monospace`;
const SIGN_UI_SCALE = 2;                          // the editor's board: this many screen pixels a canvas pixel (less on a narrow screen)
const SIGN_INK = '#000000';                       // the words, black on every sign
const SIGN_DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];   // the way a sign faces, by facing; the wall it is on lies the other way
const SIGN_TEXTS = new Map();
const _signKey = (x, y, z) => x + ',' + y + ',' + z;
const isSignVal = (v) => CORE.shapeOfVal(v) === 'sign';

// does a line fit on the board, measured in the board's own font
const _signMeasure = document.createElement('canvas').getContext('2d');
function signLineFits(text) {
  _signMeasure.font = signFont(SIGN_FONT_PX);
  return _signMeasure.measureText(text).width <= SIGN_TEXT_W;
}
const _signInk = () => SIGN_INK;

/* ---- what holds it up ---- */
function signSupported(x, y, z, v) {
  const va = (v >> 8) & 255, mount = (va >> 2) & 3, [dx, dz] = SIGN_DIRS[va & 3];
  if (mount === SIGN_STAND) return CORE.solidVal(getBlock(x, y - 1, z));
  if (mount === SIGN_HANG) return CORE.solidVal(getBlock(x, y + 1, z));
  return CORE.solidVal(getBlock(x - dx, y, z - dz));
}
const _SIGN_NEAR = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
// setBlock's hook: a sign gone takes its words with it; a block gone lets down the signs that were put up on it
function signChanged(x, y, z, oldVal, val) {
  if (isSignVal(oldVal) && !isSignVal(val)) _signForget(_signKey(x, y, z));
  if (CORE.solidVal(val)) return;
  for (const [dx, dy, dz] of _SIGN_NEAR) {
    const sx = x + dx, sy = y + dy, sz = z + dz, sv = getBlock(sx, sy, sz);
    if (!isSignVal(sv) || signSupported(sx, sy, sz, sv)) continue;
    setBlock(sx, sy, sz, B.AIR);
    if (!player.canFly) for (const d of blockDrop(sv)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, sx, sy, sz);
  }
}

/* ---- the words on the board, in the world ---- */
function _signPaint(s) {
  const g = s.canvas.getContext('2d');
  g.clearRect(0, 0, SIGN_CANVAS_W, SIGN_CANVAS_H);
  g.font = signFont(SIGN_FONT_PX);
  g.fillStyle = s.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  s.lines.forEach((t, i) => { if (t) g.fillText(t, SIGN_CANVAS_W / 2, SIGN_TOP + SIGN_LINE_H * (i + 0.5)); });
  s.tex.needsUpdate = true;
  s.painted = s.lines.join('\n') + s.ink;
}
// a plane over the board's face, just in front of it, turned the way the sign faces
function _signBuild(s, v) {
  if (!s.mesh) {
    s.canvas = document.createElement('canvas');
    s.canvas.width = SIGN_CANVAS_W; s.canvas.height = SIGN_CANVAS_H;
    s.tex = new THREE.CanvasTexture(s.canvas);
    s.tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, alphaTest: 0.05, depthWrite: false,
                                              polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    s.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), mat);
    scene.add(s.mesh);
  }
  const va = (v >> 8) & 255, f = va & 3, mount = (va >> 2) & 3;
  const front = SIGN_FRONT[mount] / 16 + 0.003, my = SIGN_MID_Y[mount] / 16;
  const { x, y, z } = s;
  if (f === 0) { s.mesh.position.set(x + 0.5, y + my, z + front); s.mesh.rotation.set(0, 0, 0); }
  else if (f === 1) { s.mesh.position.set(x + 0.5, y + my, z + 1 - front); s.mesh.rotation.set(0, Math.PI, 0); }
  else if (f === 2) { s.mesh.position.set(x + front, y + my, z + 0.5); s.mesh.rotation.set(0, Math.PI / 2, 0); }
  else { s.mesh.position.set(x + 1 - front, y + my, z + 0.5); s.mesh.rotation.set(0, -Math.PI / 2, 0); }
  freezeModel(s.mesh);                                 // still until the sign is turned or changed (06-renderer.js)
  s.val = v;
  s.ink = _signInk(v);
}
function _signForget(k) {
  const s = SIGN_TEXTS.get(k);
  if (!s) return;
  if (s.mesh) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); s.tex.dispose(); }
  SIGN_TEXTS.delete(k);
}
function clearSigns() { for (const k of [...SIGN_TEXTS.keys()]) _signForget(k); }

// once a frame, a few times a second: each written sign whose land is in has its words up, lit as its cell is
let _signT = 0;
function updateSigns(dt) {
  if (menuScene) { for (const s of SIGN_TEXTS.values()) if (s.mesh) s.mesh.visible = false; return; }
  if ((_signT -= dt) > 0) return;
  _signT = 0.25;
  for (const [k, s] of [...SIGN_TEXTS]) {
    const c = getChunk(Math.floor(s.x / 16), Math.floor(s.z / 16));
    if (!c || !c.data) { if (s.mesh) s.mesh.visible = false; continue; }
    const v = getBlock(s.x, s.y, s.z);
    if (!isSignVal(v)) { _signForget(k); continue; }
    if (!s.mesh || s.val !== v) _signBuild(s, v);
    if (s.painted !== s.lines.join('\n') + s.ink) _signPaint(s);
    s.mesh.visible = true;
    s.mesh.material.color.setScalar(_lightAt(s.x + 0.5, s.y + 0.5, s.z + 0.5));
  }
}

/* ---- the editor ----
   Built from script like the waypoint dialog (ui/waypoints.js): the pointer lock is let go, the game runs on, every key and
   click in it stops there. The board is drawn as the sign's block at SIGN_UI_SCALE, each line an input in the board's font
   at that scale; a letter that would run past the board is refused. Enter: the next line (on the last, done). Escape: the
   words as they were. */
let _sgWrap = null, _sgBoard = null, _sgInputs = [], _sgAt = null, _sgScale = SIGN_UI_SCALE;
function signDialogOpen() { return !!(_sgWrap && _sgWrap.style.display === 'flex'); }
function _ensureSignDialog() {
  if (_sgWrap) return;
  const wrap = document.createElement('div');
  wrap.id = 'signPanel';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:22;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:12px;background:#0009;font:14px ui-monospace,monospace;color:#dfe';
  const title = document.createElement('div');
  title.textContent = 'write on the sign';
  title.style.cssText = 'font-size:16px';
  const board = document.createElement('div');
  board.style.cssText = 'position:relative;box-shadow:0 8px 30px #000a;image-rendering:pixelated;' +
    'background-repeat:no-repeat;background-position:center;border-radius:2px';
  for (let i = 0; i < SIGN_LINES; i++) {
    const input = document.createElement('input');
    input.spellcheck = false;
    input.maxLength = 64;
    input.style.cssText = 'position:absolute;box-sizing:border-box;padding:0;margin:0;border:0;outline:none;' +
      'background:transparent;text-align:center';
    input.addEventListener('focus', () => { input.style.background = 'rgba(255,255,255,.18)'; });
    input.addEventListener('blur', () => { input.style.background = 'transparent'; });
    input._ok = '';
    // a letter that would run past the board is refused: the line goes back to what it was
    input.addEventListener('input', () => {
      if (signLineFits(input.value)) { input._ok = input.value; return; }
      const at = Math.max(0, (input.selectionStart || 0) - (input.value.length - input._ok.length));
      input.value = input._ok;
      input.setSelectionRange(at, at);
    });
    input.addEventListener('keydown', (x) => {
      if (x.code === 'Enter' || x.code === 'NumpadEnter' || x.code === 'ArrowDown') {
        x.preventDefault();
        if (i < SIGN_LINES - 1) _sgInputs[i + 1].focus();
        else if (x.code !== 'ArrowDown') _closeSignDialog(true);
      }
      if (x.code === 'ArrowUp' && i > 0) { x.preventDefault(); _sgInputs[i - 1].focus(); }
      if (x.code === 'Escape') { x.preventDefault(); _closeSignDialog(false); }
    });
    board.appendChild(input);
    _sgInputs.push(input);
  }
  const hint = document.createElement('div');
  hint.textContent = `${SIGN_LINES} lines, as much as fits the board · Enter: next line · Esc: leave it as it was`;
  hint.style.cssText = 'color:#9ab;font-size:12px';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:center';
  const btn = (text, bg, fn) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `background:${bg};color:#eff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font:13px ui-monospace,monospace`;
    b.onclick = fn;
    row.appendChild(b);
  };
  btn('Done', '#3f7a2a', () => _closeSignDialog(true));
  btn('Cancel', '#3a3f52', () => _closeSignDialog(false));
  wrap.appendChild(title); wrap.appendChild(board); wrap.appendChild(hint); wrap.appendChild(row);
  document.body.appendChild(wrap);
  for (const ev of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click'])
    wrap.addEventListener(ev, (x) => x.stopPropagation());
  _sgWrap = wrap; _sgBoard = board;
}
// the board and its lines at the editor's scale, in the art and ink of the sign's block
function _signDialogLayout(v) {
  const S = _sgScale = Math.max(1, Math.min(SIGN_UI_SCALE, (window.innerWidth - 40) / SIGN_CANVAS_W));
  const W = SIGN_CANVAS_W * S, H = SIGN_CANVAS_H * S;
  _sgBoard.style.width = W + 'px';
  _sgBoard.style.height = H + 'px';
  const art = IMAGES[ATLAS_TILES[facesOfVal(matKey(v))?.[4]]];
  _sgBoard.style.backgroundColor = '#6b5233';
  _sgBoard.style.backgroundImage = art && art.src ? `url("${art.src}")` : 'none';
  _sgBoard.style.backgroundSize = `${W}px ${W}px`;            // the block's face is as wide as the board
  const ink = _signInk(v);
  _sgInputs.forEach((input, i) => {
    input.style.left = SIGN_PAD_X * S + 'px';
    input.style.top = (SIGN_TOP + SIGN_LINE_H * i) * S + 'px';
    input.style.width = SIGN_TEXT_W * S + 'px';
    input.style.height = SIGN_LINE_H * S + 'px';
    input.style.font = signFont(SIGN_FONT_PX * S);
    input.style.color = ink;
    input.style.caretColor = ink;
  });
}
// a new sign as it is put up, or a sign used: for the player whose hand it was
function openSignEditor(x, y, z) {
  const v = getBlock(x, y, z);
  if (!isSignVal(v) || signDialogOpen() || !currentWorld || menuScene) return;
  _ensureSignDialog();
  _sgAt = { x, y, z };
  _signDialogLayout(v);
  const s = SIGN_TEXTS.get(_signKey(x, y, z));
  _sgInputs.forEach((input, i) => { input.value = input._ok = (s && s.lines[i]) || ''; });
  _sgWrap.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => { const first = _sgInputs.find(i => !i.value) || _sgInputs[0]; first.focus(); }, 30);
}
function _closeSignDialog(keep) {
  const at = _sgAt;
  _sgAt = null;
  if (_sgWrap) _sgWrap.style.display = 'none';
  if (at && keep && isSignVal(getBlock(at.x, at.y, at.z))) {
    const lines = _sgInputs.map(i => i._ok.replace(/\s+$/, ''));
    const k = _signKey(at.x, at.y, at.z);
    if (lines.every(t => !t)) _signForget(k);
    else {
      const s = SIGN_TEXTS.get(k);
      if (s) s.lines = lines; else SIGN_TEXTS.set(k, { x: at.x, y: at.y, z: at.z, lines });
      _signT = 0;                                                  // up at the next frame
    }
  }
  if (typeof keys === 'object') for (const kk in keys) keys[kk] = false;   // nothing left held down
  if (typeof tryPointerLock === 'function') { lockTries = 0; tryPointerLock(); }
}

/* ---- a prefab's signs (34-structures.js: captureStructure keeps `signs` [dx, dy, dz, lines], laid after its blocks) ---- */
function structureSignsIn(v) {
  const out = [];
  for (const s of SIGN_TEXTS.values())
    if (s.x >= v.x0 && s.x < v.x0 + v.w && s.y >= v.y0 && s.y < v.y0 + v.h && s.z >= v.z0 && s.z < v.z0 + v.l)
      out.push([s.x - v.x0, s.y - v.y0, s.z - v.z0, s.lines.slice()]);
  return out;
}
function applyStructureSigns(prefab, ox, oy, oz) {
  if (!prefab || !Array.isArray(prefab.signs)) return;
  for (const r of prefab.signs) {
    if (!Array.isArray(r) || !r.slice(0, 3).every(Number.isInteger) || !Array.isArray(r[3])) continue;
    const x = ox + r[0], y = oy + r[1], z = oz + r[2];
    if (!isSignVal(getBlock(x, y, z))) continue;                  // its sign is not there (a block the build lacks)
    const lines = Array.from({ length: SIGN_LINES }, (_, i) => typeof r[3][i] === 'string' ? r[3][i] : '');
    if (lines.some(t => t)) SIGN_TEXTS.set(_signKey(x, y, z), { x, y, z, lines });
  }
  _signT = 0;                                                      // the boards up at the next frame
}

/* ---- the save: the written signs ---- */
const serializeSigns = () => [...SIGN_TEXTS.values()].map(s => [s.x, s.y, s.z, s.lines]);
function restoreSigns(list) {
  clearSigns();
  if (!Array.isArray(list)) return;
  for (const r of list) {
    if (!Array.isArray(r) || !Number.isInteger(r[0]) || !Number.isInteger(r[1]) || !Number.isInteger(r[2]) || !Array.isArray(r[3])) continue;
    const lines = Array.from({ length: SIGN_LINES }, (_, i) => typeof r[3][i] === 'string' ? r[3][i] : '');
    if (lines.some(t => t)) SIGN_TEXTS.set(_signKey(r[0], r[1], r[2]), { x: r[0], y: r[1], z: r[2], lines });
  }
}
