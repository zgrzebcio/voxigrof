'use strict';
/* ui/hud.js: the HUD. Fullscreen, the F3 toggle, the prompt under the crosshair, the progress ring, the hotbar. */

/* ================================================================================================
   HUD — fps, coords, selected block, hotbar, radial picker.
   ================================================================================================ */
var hudEl = document.getElementById('hud');
var blocknameEl = document.getElementById('blockname');
/* toast() moved to ui/feed.js in 0.751. It used to write a single line into a #toast element,
   which meant one message at a time and nothing at all about what you were carrying; it now pushes
   a row into the item feed at the top of the screen. Callers are unchanged. */

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() =>
    toast('fullscreen blocked — press F1 (gamepad presses don’t count as a user gesture)'));
}

/* ---- debug read-out ----
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
/* ---- the progress ring ----
   A ring round the crosshair that fills as anything you HOLD for runs its course: eating and drinking, milking a cow,
   working a bench's order (E held) and cancelling one (the right button held). Mining has its cracks and is not on
   it. One per pane like the crosshair (36-splitscreen.js); it is a conic gradient cut to a ring in style.css, and only
   its --p changes here, in hundredths, so a held frame costs nothing. */
var progRingEl = document.getElementById('progRing');
function interactProgress() {
  if (player.dead || menuScene || !playing) return 0;
  if (player._milkProg > 0) return player._milkProg;
  if (player._unsealProg > 0) return player._unsealProg;                // a sealed chest's key turning
  if (player._fillProg > 0) return player._fillProg;                    // a bottle filling at water
  if (player._eatProg > 0) return player._eatProg;                      // a meal or a drink
  if (player._drawProg > 0) return Math.min(1, player._drawProg);       // a bow being drawn
  if (typeof BENCH_CANCEL_HOLD !== 'undefined' && player._benchRmbT > BENCH_TAP_TIME && !player._benchRmbDone)
    return Math.min(1, player._benchRmbT / BENCH_CANCEL_HOLD);          // the right button held on a busy bench
  if (player._benchWork && typeof BENCHES !== 'undefined') {
    const b = BENCHES.get(player._benchWork), r = b && typeof recipeAt === 'function' ? recipeAt(b.ri) : null;
    if (r && r.timeToCraft > 0) return Math.min(1, b.t / r.timeToCraft);
  }
  return 0;
}
function updateProgressRing() {
  if (!progRingEl) return;
  const p = Math.round(Math.max(0, Math.min(1, interactProgress())) * 100);
  if (progRingEl._p === p) return;
  progRingEl._p = p;
  progRingEl.style.display = p > 0 ? 'block' : 'none';
  if (p > 0) progRingEl.style.setProperty('--p', (p / 100).toFixed(2));
}
// North face button: Y on an Xbox pad, Triangle on a PlayStation one
function padNorthLabel() {
  const g = typeof getPad === 'function' ? getPad() : null;
  const id = (g && g.id || '').toLowerCase();
  return /dualshock|dualsense|playstation|\bps[45]\b/.test(id) ? '△' : 'Y';
}
var _interactShown = '';
function updateInteractPrompt() {
  // the name over whatever entity you are looking at (entities/taming.js): its own spot, never the prompt's
  if (typeof updateEntityHoverTag === 'function') updateEntityHoverTag();
  // a crafting bench with an order on it says how far along it is and what E does
  if (typeof benchPrompt === 'function') {
    const a = benchPrompt();
    if (a) {
      if (a !== _interactShown) { interactEl.innerHTML = a; _interactShown = a; }
      interactEl.style.opacity = '1';
      return;
    }
  }
  /* An animal you can do something with speaks first: a tameable one under the crosshair
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
  // water under the crosshair with an empty hand (0.82, player/stats.js): it takes E before the bushes do
  const drink = typeof drinkPrompt === 'function' ? drinkPrompt() : '';
  if (drink) {
    if (drink !== _interactShown) { interactEl.innerHTML = drink; _interactShown = drink; }
    interactEl.style.opacity = '1';
    return;
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
  blocknameEl.textContent = itemDisplayName(id, HOTBAR[hotbarSel]?.dur);   // with durability
  blocknameEl.style.opacity = '1';
  clearTimeout(blocknameTimer);
  blocknameTimer = setTimeout(() => { blocknameEl.style.opacity = '0'; }, 1100);
}
function buildHotbar() {                         // rebuilt on any slot change -> must not flash
  hotbarEl.innerHTML = '';
  hotbarEl._offKey = undefined;                  // the offhand slot went with the clear
  hotbarEl._chiselKey = undefined;               // ...and the chisel's shape slot and radial
  // the bar's own slots and the ones a worn belt opens (hotbarLen, player/equipment.js); the tenth is key 0
  const n = typeof hotbarLen === 'function' ? hotbarLen() : HOTBAR.length;
  if (hotbarSel >= n) hotbarSel = n - 1;
  for (let i = 0; i < n; i++) {
    const div = document.createElement('div');
    div.className = 'slot' + (i === hotbarSel ? ' sel' : '') + (i >= HOTBAR_SLOTS ? ' beltHot' : '');
    div.innerHTML = `<span class="key">${(i + 1) % 10}</span>` + slotInner(HOTBAR[i]);
    hotbarEl.appendChild(div);
  }
  syncOffhandSlot();
}
function updateHotbar() {
  hotbarSlotEls().forEach((el, i) => el.classList.toggle('sel', i === hotbarSel));
  flashBlockName();
}
/* The offhand, shown just left of the hotbar and only while something is in it. It lives
   INSIDE #hotbar so it follows the bar in every layout and split-screen pane, absolutely placed so it
   never widens the bar. It is not a hotbar slot: no number, never selected, never a drag target, which
   is why everything that counts hotbar slots by index goes through hotbarSlotEls. Called every frame
   from updateVitals; it only touches the DOM when what it would show has changed. */
function hotbarSlotEls() { return hotbarEl.querySelectorAll(':scope > .slot:not(.offSlot):not(.chiselSlot)'); }
function syncOffhandSlot() {
  if (!hotbarEl) return;
  const s = typeof offhandSlot === 'function' ? offhandSlot() : null;
  const key = s ? `${s.id}:${s.count}:${s.dur ?? ''}:${s.fresh ?? ''}:${renderBlockIcon(s.id) ? 1 : 0}` : '';
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
