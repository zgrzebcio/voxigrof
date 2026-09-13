'use strict';
/* voxiGrof — hud, hotbar DOM */

/* ================================================================================================
   HUD — fps, coords, selected block, hotbar, radial picker.
   ================================================================================================ */
var hudEl = document.getElementById('hud');
var blocknameEl = document.getElementById('blockname');
/* toast() moved to 42-feed.js in 0.751. It used to write a single line into a #toast element,
   which meant one message at a time and nothing at all about what you were carrying; it now pushes
   a row into the item feed at the top of the screen. Callers are unchanged. */

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() =>
    toast('fullscreen blocked — press F1 (gamepad presses don’t count as a user gesture)'));
}

/* ---- debug read-out (0.723) ----
   F3, or Back/Share on a pad, hides the corner text. It is PER SEAT: in split screen one player
   wanting a clean view should not strip the coordinates off everyone else's quarter. The choice is
   remembered per seat number, which is the useful default — whoever sits down there next gets the
   same view they left. */
let hudTextHidden = (() => {
  try { const a = JSON.parse(localStorage.getItem('vg_hudoff')); return Array.isArray(a) ? a : []; }
  catch { return []; }
})();
function toggleDebugHud(slot = (typeof activePlayerSlot === 'function' ? activePlayerSlot() : 0)) {
  hudTextHidden[slot] = !hudTextHidden[slot];
  localStorage.setItem('vg_hudoff', JSON.stringify(hudTextHidden));
  const el = PSTATE[slot] && PSTATE[slot].g.hudEl;
  if (el) { el.style.display = hudTextHidden[slot] ? 'none' : ''; if (!hudTextHidden[slot]) hudT = 1e9; }
}
const debugHudHidden = (slot) => !!hudTextHidden[slot];
var hotbarEl = document.getElementById('hotbar');
const radialEl = document.getElementById('radial');
const radialCtx = radialEl.getContext('2d');

/* ---- interact prompt under the crosshair ----
   Shown only while a bush pickup is actually available, and labelled with the key on whichever
   device you last touched — swap from keyboard to pad mid-game and the glyph follows on the next
   frame. `lastInputDevice` is maintained in 17-input.js. */
var interactEl = document.getElementById('interact');
// North face button: Y on an Xbox pad, Triangle on a PlayStation one
function padNorthLabel() {
  const g = typeof getPad === 'function' ? getPad() : null;
  const id = (g && g.id || '').toLowerCase();
  return /dualshock|dualsense|playstation|\bps[45]\b/.test(id) ? '△' : 'Y';
}
var _interactShown = '';
function updateInteractPrompt() {
  // the name over whatever entity you are looking at (39-taming.js, 0.757): its own spot, never the prompt's
  if (typeof updateEntityHoverTag === 'function') updateEntityHoverTag();
  /* An animal you can do something with speaks first (0.74): a tameable one under the crosshair
     reports what it is, what it is called and what the next step with it would be, because a
     horse you have named is not "a horse" any more and the taming flow is invisible otherwise. */
  if (typeof tameablePrompt === 'function') {
    const a = tameablePrompt();
    if (a) {
      if (a !== _interactShown) { interactEl.innerHTML = a; _interactShown = a; }
      interactEl.style.opacity = '1';
      return;
    }
  }
  const t = typeof findBushPickup === 'function' ? findBushPickup() : null;
  if (!t) {
    if (_interactShown) { interactEl.style.opacity = '0'; _interactShown = ''; }
    return;
  }
  const keyLabel = lastInputDevice === 'pad' ? padNorthLabel() : 'E';
  const txt = `(<b>${keyLabel}</b>) to pickup ${t.name}`;
  if (txt !== _interactShown) { interactEl.innerHTML = txt; _interactShown = txt; }
  interactEl.style.opacity = '1';
}

// block name pops in above the hotbar on selection, then fades out
var blocknameTimer = 0;
function flashBlockName() {
  const id = slotId(HOTBAR[hotbarSel]);
  if (id == null) { blocknameEl.style.opacity = '0'; return; }
  blocknameEl.textContent = itemDisplayName(id, HOTBAR[hotbarSel]?.dur);   // with durability (0.759)
  blocknameEl.style.opacity = '1';
  clearTimeout(blocknameTimer);
  blocknameTimer = setTimeout(() => { blocknameEl.style.opacity = '0'; }, 1100);
}
function buildHotbar() {                         // rebuilt on any slot change -> must not flash
  hotbarEl.innerHTML = '';
  hotbarEl._offKey = undefined;                  // the offhand slot went with the clear
  HOTBAR.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'slot' + (i === hotbarSel ? ' sel' : '');
    div.innerHTML = `<span class="key">${i + 1}</span>` + slotInner(s);
    hotbarEl.appendChild(div);
  });
  syncOffhandSlot();
}
function updateHotbar() {
  hotbarSlotEls().forEach((el, i) => el.classList.toggle('sel', i === hotbarSel));
  flashBlockName();
}
/* The offhand, shown just left of the hotbar and only while something is in it (0.7523). It lives
   INSIDE #hotbar so it follows the bar in every layout and split-screen pane, absolutely placed so it
   never widens the bar. It is not a hotbar slot: no number, never selected, never a drag target, which
   is why everything that counts hotbar slots by index goes through hotbarSlotEls. Called every frame
   from updateVitals; it only touches the DOM when what it would show has changed. */
function hotbarSlotEls() { return hotbarEl.querySelectorAll(':scope > .slot:not(.offSlot)'); }
function syncOffhandSlot() {
  if (!hotbarEl) return;
  const s = typeof offhandSlot === 'function' ? offhandSlot() : null;
  const key = s ? `${s.id}:${s.count}:${s.dur ?? ''}:${renderBlockIcon(s.id) ? 1 : 0}` : '';
  if (key === hotbarEl._offKey) return;
  hotbarEl._offKey = key;
  let el = hotbarEl.querySelector(':scope > .offSlot');
  if (!s) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'slot offSlot'; hotbarEl.appendChild(el); }
  el.innerHTML = slotInner(s);
}

/* ---------------------------------- inventory (3x9) ----------------------------------
   Slot 0 is the BOTTOM-LEFT corner, filling rightward then upward (the grid container is
   column-reversed). Blocks fill in registry order; empty slots await future items, which
   will use flat 2D icons via `{ item, icon2d }` entries.                                  */
