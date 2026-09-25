'use strict';
/* voxiGrof — menu dialogs and the menu's gamepad cursor (0.7991)

   TWO THINGS LIVE HERE.

   uiConfirm: the game's own yes/no window. It replaces the browser's confirm(), which a gamepad cannot
   answer at all and which drops the page out of fullscreen on some browsers. Same shape as the menu
   panels, so the pad cursor below works on it like anything else.

   The menu cursor: a pad pointer for the title, world, profile and pause screens, which were mouse-only.
   The left stick moves it, A presses what is under it (a button, a checkbox, a dropdown), the D-pad steps
   between controls or changes the one under the cursor, the right stick scrolls a long list, and B goes
   back. It is driven from pollGamepad (17-input.js) while the overlay is up. */

/* ---------------------------------- the yes/no window ---------------------------------- */
const uiAskEl = document.createElement('div');
uiAskEl.id = 'uiAsk';
uiAskEl.innerHTML =
  '<div class="askBox">' +
    '<div class="askTitle"></div><div class="askText"></div>' +
    '<div class="askBtns"><button class="askYes danger"></button><button class="askNo grey">Cancel</button></div>' +
  '</div>';
document.body.appendChild(uiAskEl);
var _uiAskOnYes = null;
const uiAskOpen = () => uiAskEl.style.display === 'flex';
function uiConfirm(title, text, onYes, yesLabel = 'Delete') {
  uiAskEl.querySelector('.askTitle').textContent = title;
  uiAskEl.querySelector('.askText').textContent = text || '';
  const yes = uiAskEl.querySelector('.askYes');
  yes.textContent = yesLabel;
  _uiAskOnYes = onYes;
  uiAskEl.style.display = 'flex';
}
function uiAskClose(run) {
  if (!uiAskOpen()) return;
  uiAskEl.style.display = 'none';
  const fn = _uiAskOnYes;
  _uiAskOnYes = null;
  if (run && typeof fn === 'function') fn();
}
uiAskEl.querySelector('.askYes').addEventListener('click', () => uiAskClose(true));
uiAskEl.querySelector('.askNo').addEventListener('click', () => uiAskClose(false));
uiAskEl.addEventListener('mousedown', (e) => { if (e.target === uiAskEl) uiAskClose(false); });
document.addEventListener('keydown', (e) => {
  if (!uiAskOpen()) return;
  if (e.code === 'Escape') { e.preventDefault(); uiAskClose(false); }
  else if (e.code === 'Enter') { e.preventDefault(); uiAskClose(true); }
}, true);

/* ---------------------------------- settings groups (0.801) ----------------------------------
   The title and pause screens show their settings one group at a time — Gameplay, Video, Audio,
   Controls — picked by the tabs above them. The last group opened is remembered on this device. */
function showOptGroup(g) {
  for (const t of document.querySelectorAll('#menuExtras .optTab')) t.classList.toggle('on', t.dataset.g === g);
  for (const el of document.querySelectorAll('#menuExtras .optGroup')) el.style.display = el.dataset.g === g ? '' : 'none';
  // the Keyboard / Gamepad row keeps its space on every tab, so the menu never changes height (0.8031)
  const kt = document.querySelector('#menuExtras .keyTabs');
  if (kt) kt.style.visibility = g === 'controls' ? '' : 'hidden';
  try { localStorage.setItem('vg_optTab', g); } catch {}
}
for (const t of document.querySelectorAll('#menuExtras .optTab'))
  t.addEventListener('click', (e) => { e.stopPropagation(); showOptGroup(t.dataset.g); });
showOptGroup((() => { try { return localStorage.getItem('vg_optTab') || 'info'; } catch { return 'info'; } })());
// the key list: keyboard or gamepad, opened on whichever was used last each time the menu shows (0.802)
function showKeyList(k) {
  for (const t of document.querySelectorAll('#menuExtras .keyTab')) t.classList.toggle('on', t.dataset.k === k);
  for (const el of document.querySelectorAll('#menuExtras .keyList')) el.style.display = el.dataset.k === k ? '' : 'none';
}
for (const t of document.querySelectorAll('#menuExtras .keyTab'))
  t.addEventListener('click', (e) => { e.stopPropagation(); showKeyList(t.dataset.k); });
showKeyList('kbd');
new MutationObserver(() => {
  if (overlay.style.display !== 'none') showKeyList(typeof lastInputDevice !== 'undefined' && lastInputDevice === 'pad' ? 'pad' : 'kbd');
}).observe(overlay, { attributes: true, attributeFilter: ['style'] });
// the pause screen's own fullscreen button, beside Resume (the title screen's sits beside Play)
document.getElementById('fsBtn2')?.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });

/* ---------------------------------- the menu's pad cursor ---------------------------------- */
const mcurEl = document.createElement('div');
mcurEl.id = 'mcursor';
document.body.appendChild(mcurEl);
var menuCursor = { x: innerWidth / 2, y: innerHeight / 2, on: false };
var _mHover = null;
const MENU_CURSOR_SPEED = 900;             // px a second at full stick
// every control a pad can work, in the order they are laid out
const MENU_PICKABLE = 'button, select, input, .wrow';
const menuPadOpen = () => uiAskOpen() || (typeof playing !== 'undefined' && !playing &&
                                          typeof overlay !== 'undefined' && overlay && overlay.style.display !== 'none');
function _menuControls() {
  const root = uiAskOpen() ? uiAskEl : overlay;
  return [...root.querySelectorAll(MENU_PICKABLE)].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.disabled;
  });
}
function _menuSetHover(el) {
  if (_mHover === el) return;
  if (_mHover) _mHover.classList.remove('padhover');
  _mHover = el;
  if (_mHover) _mHover.classList.add('padhover');
}
function _menuAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest(MENU_PICKABLE) : null;
}
// A on whatever is under the cursor: press it, tick it, or step a dropdown along
function _menuPress(el) {
  if (!el) return;
  if (el.tagName === 'SELECT') { _menuStep(el, 1); return; }
  if (el.tagName === 'INPUT') {
    if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); }
    else if (el.type === 'range') { /* a slider moves with D-pad Left / Right */ }
    else el.focus();                        // a text or number field: hand it the keyboard
    return;
  }
  el.click();
}
// D-pad left/right on a dropdown or a number field
function _menuStep(el, dir) {
  if (!el) return;
  if (el.tagName === 'SELECT' && el.options.length) {
    el.selectedIndex = (el.selectedIndex + dir + el.options.length) % el.options.length;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.tagName === 'INPUT' && (el.type === 'number' || el.type === 'range')) {   // a volume slider too (0.804)
    const step = +el.step || 1, lo = el.min === '' ? -Infinity : +el.min, hi = el.max === '' ? Infinity : +el.max;
    el.value = String(Math.max(lo, Math.min(hi, (+el.value || 0) + step * dir)));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.tagName === 'INPUT' && el.type === 'checkbox') {
    el.checked = dir > 0;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
// snap to the next control in layout order, so a pad can reach everything without aiming
function _menuJump(dir) {
  const list = _menuControls();
  if (!list.length) return;
  const i = _mHover ? list.indexOf(_mHover) : -1;
  const next = list[(i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length)];
  const r = next.getBoundingClientRect();
  menuCursor.x = r.left + r.width / 2;
  menuCursor.y = r.top + r.height / 2;
  next.scrollIntoView({ block: 'nearest' });
  _menuSetHover(next);
}
// the scrolling box the cursor is inside, if any (the world list, the create settings)
function _menuScrollable(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement)
    if (n.scrollHeight > n.clientHeight + 4 && getComputedStyle(n).overflowY !== 'visible') return n;
  return null;
}
// the first visible scrolling box of the current screen (0.803)
function _menuFirstScrollable() {
  const root = uiAskOpen() ? uiAskEl : overlay;
  for (const n of root.querySelectorAll('.wlist, #createOpts, .optPanel, .splitList'))
    if (n.offsetParent && n.scrollHeight > n.clientHeight + 4) return n;
  return null;
}
/* Called every frame from pollGamepad while the menu is up. Returns true when it took the pad, so the
   rest of that handler leaves the buttons alone. */
function updateMenuPad(dt, btn, edge, g) {
  if (!menuPadOpen()) {
    if (menuCursor.on) { menuCursor.on = false; mcurEl.style.display = 'none'; _menuSetHover(null); }
    return false;
  }
  const ax = padAxis(g.axes[0] || 0), ay = padAxis(g.axes[1] || 0);
  if (ax || ay) {
    menuCursor.x = Math.max(4, Math.min(innerWidth - 4, menuCursor.x + ax * MENU_CURSOR_SPEED * dt));
    menuCursor.y = Math.max(4, Math.min(innerHeight - 4, menuCursor.y + ay * MENU_CURSOR_SPEED * dt));
    menuCursor.on = true;
  }
  // LB / RB step through the settings tabs (0.8031)
  if (!uiAskOpen() && (edge(4) || edge(5))) {
    const tabs = [...document.querySelectorAll('#menuExtras .optTab')].filter(t => t.offsetParent);
    if (tabs.length) {
      const i = Math.max(0, tabs.findIndex(t => t.classList.contains('on')));
      showOptGroup(tabs[(i + (edge(5) ? 1 : -1) + tabs.length) % tabs.length].dataset.g);
    }
  }
  if (btn(0) || btn(1) || edge(12) || edge(13) || edge(14) || edge(15)) menuCursor.on = true;
  /* The right stick scrolls a long list (0.803: works without the cursor too): the box under the cursor,
     else the first scrolling box on screen — the settings panel, the worlds, the create settings. */
  const sy = padAxis(g.axes[3] || 0);
  if (sy) {
    const at = menuCursor.on ? document.elementFromPoint(menuCursor.x, menuCursor.y) : null;
    const box = (at && _menuScrollable(at)) || _menuFirstScrollable();
    if (box) box.scrollTop += sy * 900 * dt;
  }
  if (!menuCursor.on) return true;
  mcurEl.style.display = 'block';
  mcurEl.style.left = menuCursor.x + 'px';
  mcurEl.style.top = menuCursor.y + 'px';
  _menuSetHover(_menuAt(menuCursor.x, menuCursor.y));

  if (edge(13)) _menuJump(1);                       // D-pad down / up: step through the controls
  if (edge(12)) _menuJump(-1);
  if (edge(15)) _menuStep(_mHover, 1);              // ...left / right: change the one under the cursor
  if (edge(14)) _menuStep(_mHover, -1);
  if (edge(0)) _menuPress(_mHover);                 // A
  if (edge(1)) {                                    // B: cancel the question, else the screen's Back
    if (uiAskOpen()) uiAskClose(false);
    else {
      const back = [...overlay.querySelectorAll('button.grey, #resumeBtn')]
        .find(el => el.offsetParent && /back|resume/i.test(el.textContent));
      if (back) back.click();
    }
  }
  return true;
}
// the mouse takes over again the moment it moves
addEventListener('mousemove', () => {
  if (!menuCursor.on) return;
  menuCursor.on = false;
  mcurEl.style.display = 'none';
  _menuSetHover(null);
});
