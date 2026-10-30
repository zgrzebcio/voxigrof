/* js/ui/waypoints.js — a player's own waypoints: a named spot (their base) shown on their own screen, as the death mark is.
   U opens the dialog (17-input.js): set one where you stand with a name, or take it away. Each player keeps up to
   WAYPOINTS_MAX (one for now: the list is ready for more when maps come). `player._waypoints` [{ name, x, y, z }] is saved
   with the player (16-worlds.js, `_serializeSlot` in 36-splitscreen.js) and read back in player/tick.js and
   applyExtraPlayerRestore. The marks are drawn per seat from tickPlayer (syncWaypointMarks), in the seat's pane. */
const WAYPOINTS_MAX = 1;
const WAYPOINT_NAME_MAX = 20;
const WAYPOINT_NEAR = 4;                // closer than this (standing in the base) its mark hides
const WAYPOINT_EDGE = 28;               // off screen it waits this far in from the pane's edge

/* ---------------------------------- the marks ----------------------------------
   Placed as the death mark is (ui/screen-effects.js): over the spot, or at the edge of the view on the side to turn to
   when it is off screen or behind. Hidden with the HUD (Backspace), while dead, and on the title screen. */
const _wpV = new THREE.Vector3();
function syncWaypointMarks() {
  const st = typeof PSTATE !== 'undefined' ? PSTATE[activePlayerSlot()] : null;
  if (!st || !st.pane) return;
  let box = st.pane._wpMarks;
  if (!box) {
    box = document.createElement('div');
    box.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3';
    st.pane.appendChild(box);
    st.pane._wpMarks = box;
  }
  const p = player, list = p._waypoints || [];
  const show = !menuScene && playing && p.spawned && !p.dead && currentWorld && !hudHidden;
  const boxShown = show ? '' : 'none';                  // setHudVisible hides the box itself on the title screen
  if (box.style.display !== boxShown) box.style.display = boxShown;
  while (box.children.length < list.length) {
    const c = document.createElement('div');
    c.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-50%);color:#fff4d6;white-space:nowrap;' +
      'font:600 13px system-ui,sans-serif;text-shadow:0 1px 3px #000;background:rgba(70,50,10,.5);' +
      'border:1px solid rgba(240,200,110,.8);border-radius:6px;padding:2px 7px';
    box.appendChild(c);
  }
  const W = st.pane.clientWidth, H = st.pane.clientHeight;
  if (show && list.length) camera.updateMatrixWorld();
  for (let i = 0; i < box.children.length; i++) {
    const c = box.children[i], w = list[i];
    const d = w ? Math.hypot(w.x + 0.5 - p.pos.x, w.y - p.pos.y, w.z + 0.5 - p.pos.z) : 0;
    if (!w || !show || !W || !H || d < WAYPOINT_NEAR) { if (c.style.display !== 'none') c.style.display = 'none'; continue; }
    _wpV.set(w.x + 0.5, w.y + 1.6, w.z + 0.5).applyMatrix4(camera.matrixWorldInverse);
    const behind = _wpV.z > 0;
    _wpV.applyMatrix4(camera.projectionMatrix);
    let sx = _wpV.x, sy = _wpV.y;
    if (behind) { sx = -sx; sy = -sy; }
    let x = (sx * 0.5 + 0.5) * W, y = (0.5 - sy * 0.5) * H;
    const hx = W / 2 - WAYPOINT_EDGE, hy = H / 2 - WAYPOINT_EDGE, dx = x - W / 2, dy = y - H / 2;
    const out = behind || Math.abs(dx) > hx || Math.abs(dy) > hy;
    if (out) {
      const k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
      x = W / 2 + dx * k; y = H / 2 + dy * k;
    }
    const txt = `⚑ ${w.name} · ${Math.round(d)} m`;
    if (c._txt !== txt) { c._txt = txt; c.textContent = txt; }
    c.style.display = 'block';
    c.style.opacity = out ? '0.8' : '1';
    c.style.left = x.toFixed(1) + 'px';
    c.style.top = y.toFixed(1) + 'px';
  }
}

/* ---------------------------------- the dialog ----------------------------------
   Built from script like the naming dialog (ui/animals.js). The pointer lock is let go so the field can be typed into,
   and the game does not pause for it (the pointerlockchange handler in 17-input.js asks textDialogOpen). Every key and
   click that lands in it stops there. Enter sets the waypoint here, Escape closes. */
let _wpWrap = null, _wpInput = null, _wpNow = null, _wpRemove = null, _wpFor = null;
function waypointDialogOpen() { return !!(_wpWrap && _wpWrap.style.display === 'flex'); }
// a dialog with a text field is up: the game keeps running and keeps its keys out of it
const textDialogOpen = () => waypointDialogOpen() || (typeof nameDialogOpen === 'function' && nameDialogOpen())
  || (typeof signDialogOpen === 'function' && signDialogOpen());                   // the sign editor (blocks/signs.js)
function _ensureWaypointDialog() {
  if (_wpWrap) return;
  const wrap = document.createElement('div');
  wrap.id = 'waypointPanel';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:22;display:none;align-items:center;' +
    'justify-content:center;background:#0009;font:14px ui-monospace,monospace;color:#dfe';
  const box = document.createElement('div');
  box.style.cssText = 'background:#141826;border:1px solid #445;border-radius:10px;padding:18px 20px;' +
    'min-width:320px;text-align:center;box-shadow:0 8px 30px #000a';
  const title = document.createElement('div');
  title.textContent = 'waypoint';
  title.style.cssText = 'font-size:16px;margin-bottom:6px';
  const now = document.createElement('div');
  now.style.cssText = 'color:#e8d6a8;font-size:13px;margin-bottom:12px';
  const input = document.createElement('input');
  input.maxLength = WAYPOINT_NAME_MAX;
  input.spellcheck = false;
  input.placeholder = 'name';
  input.style.cssText = 'width:100%;box-sizing:border-box;background:#0b0d16;color:#dfe;border:1px solid #445;' +
    'border-radius:6px;padding:8px 10px;font:14px ui-monospace,monospace;margin-bottom:12px';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:center';
  const btn = (text, bg) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `background:${bg};color:#eff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font:13px ui-monospace,monospace`;
    row.appendChild(b);
    return b;
  };
  const set = btn('Set here', '#3f7a2a');
  const remove = btn('Remove', '#7a3a2a');
  const cancel = btn('Cancel', '#3a3f52');
  box.appendChild(title); box.appendChild(now); box.appendChild(input); box.appendChild(row);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
  for (const ev of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click'])
    wrap.addEventListener(ev, (x) => x.stopPropagation());
  input.addEventListener('keydown', (x) => {
    if (x.code === 'Enter' || x.code === 'NumpadEnter') { x.preventDefault(); _closeWaypointDialog('set'); }
    if (x.code === 'Escape') { x.preventDefault(); _closeWaypointDialog(null); }
  });
  set.onclick = () => _closeWaypointDialog('set');
  remove.onclick = () => _closeWaypointDialog('remove');
  cancel.onclick = () => _closeWaypointDialog(null);
  _wpWrap = wrap; _wpInput = input; _wpNow = now; _wpRemove = remove;
}
// U (17-input.js): for the player whose keys these are
function openWaypointDialog(p) {
  if (!p || !p.spawned || p.dead || !currentWorld || menuScene) return;
  _ensureWaypointDialog();
  _wpFor = p;
  const w = (p._waypoints || [])[0];
  _wpNow.textContent = w
    ? `${w.name} · ${Math.round(Math.hypot(w.x + 0.5 - p.pos.x, w.y - p.pos.y, w.z + 0.5 - p.pos.z))} m away (x ${w.x}, z ${w.z})`
    : 'none set: name this spot';
  _wpRemove.style.display = w ? '' : 'none';
  _wpInput.value = w ? w.name : 'Base';
  _wpWrap.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => { _wpInput.focus(); _wpInput.select(); }, 30);
}
function _closeWaypointDialog(what) {
  const p = _wpFor;
  _wpFor = null;
  if (_wpWrap) _wpWrap.style.display = 'none';
  if (p && what === 'set') {
    const name = (_wpInput.value || '').trim().slice(0, WAYPOINT_NAME_MAX) || 'Base';
    const list = p._waypoints || (p._waypoints = []);
    list.push({ name, x: Math.floor(p.pos.x), y: Math.floor(p.pos.y), z: Math.floor(p.pos.z) });
    while (list.length > WAYPOINTS_MAX) list.shift();          // the oldest gives way
    toast(`waypoint ${name} set`);
  } else if (p && what === 'remove' && p._waypoints && p._waypoints.length) {
    toast(`waypoint ${p._waypoints[0].name} removed`);
    p._waypoints.shift();
  }
  if (typeof keys === 'object') for (const k in keys) keys[k] = false;   // nothing left held down
  if (typeof tryPointerLock === 'function') { lockTries = 0; tryPointerLock(); }
}

/* ---------------------------------- saving ---------------------------------- */
const serializeWaypoints = (p) => (p._waypoints || []).map(w => ({ name: w.name, x: w.x, y: w.y, z: w.z }));
const restoreWaypoints = (list) => (Array.isArray(list) ? list : [])
  .filter(w => w && typeof w.name === 'string' && [w.x, w.y, w.z].every(n => Number.isInteger(n)))
  .slice(-WAYPOINTS_MAX)
  .map(w => ({ name: w.name.slice(0, WAYPOINT_NAME_MAX) || 'Base', x: w.x, y: w.y, z: w.z }));
