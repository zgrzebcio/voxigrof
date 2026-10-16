'use strict';
/* voxiGrof — settings, pointer lock, keyboard/mouse/gamepad */

const modeSel = document.getElementById('modeSel');
const fpsSel = document.getElementById('fpsSel');
const distInput = document.getElementById('distInput');
const simInput  = document.getElementById('simInput');
const sensInput = document.getElementById('sensInput');
const rawMouseSel = document.getElementById('rawMouseSel');   // Options > Gameplay
const shadowSel = document.getElementById('shadowSel');
const splitDirSel = document.getElementById('splitDirSel');
let playing = false;
let lockTimer = 0, lockTries = 0;
/* Which device the player last actually used. Drives the key glyph in the on-screen interact
   prompt, so plugging in a pad mid-game relabels it without a reload. Keyboard/mouse claim it on
   real input only; pollGamepad claims it when a button or stick genuinely moves, never merely
   because a pad is connected — an idle controller must not steal the label from the keyboard. */
let lastInputDevice = 'kbd';
/* `invOpen` belongs to ui/inventory.js, which loads AFTER this file, but the document handlers below
   are live the moment this file runs. A mouse moving over the page mid-load reached `!invOpen` before it
   existed and threw a ReferenceError. Declaring it here gives it a value from the start; `var`
   may be declared twice, so the inventory file's own `var invOpen = false` still owns it. Every handler
   tests it first, so they all bail out cleanly until the inventory code has loaded. */
var invOpen = false;

// the Backspace clean view: every HUD element goes (style.css), and 36-splitscreen.js skips the hand
var hudHidden = false;
var pauseAfterJoin = false;               // the pointer was lost during loading
function toggleHudHidden(on = !hudHidden) {
  hudHidden = on;
  document.body.classList.toggle('hudHidden', on);
}
function setPlaying(on) {
  if (on && !currentWorld) { refreshMenu(); return; }   // no world selected — stay on the title
  if (on && !playing) applySettings();      // closing the menu ALWAYS applies the settings,
  playing = on;                             // no matter how it was closed (Play/Esc/Start)
  overlay.style.display = on ? 'none' : 'flex';
  if (!on) {
    if (currentWorld) saveWorld();          // pausing also saves — cheap insurance
    refreshMenu();
    // the pause menu is for EVERYONE, so it supersedes every seat's inventory, not just this one
    forEachPlayerSlot(() => toggleInventory(false));
    clearTimeout(lockTimer);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
function tryPointerLock() {
  clearTimeout(lockTimer);
  /* Never while dead. The death screen is a menu you have to CLICK, so grabbing the
     mouse back would hide the cursor over its own buttons — which is exactly what happened when
     dying released the lock, the pause menu opened on top, and Resume took the mouse again. */
  if (!playing || (typeof player !== 'undefined' && player.dead)) return;
  if (document.pointerLockElement === canvas) return;
  if (lockTries >= 3) {
    toast('mouse look blocked here — gamepad & keys work; click the view to retry');
    return;
  }
  lockTries++;
  /* Raw mouse first (`rawMouse` in 00-config.js, a setting): `unadjustedMovement` hands over the mouse's own counts, without
     the system's pointer acceleration — with it a fast stroke turns further than the same stroke made slowly, and a low
     frame rate is exactly when strokes get fast and long. A browser without it refuses with NotSupportedError: the
     ordinary lock is asked for at once, and from then on. */
  let p = null;
  const raw = rawMouse && _rawMouseOk;
  try { p = raw ? canvas.requestPointerLock({ unadjustedMovement: true }) : canvas.requestPointerLock(); }
  catch { scheduleLockRetry(); }
  if (p && p.catch) p.catch((err) => {
    if (raw && err && err.name === 'NotSupportedError') {
      _rawMouseOk = false;
      let q = null;
      try { q = canvas.requestPointerLock(); } catch { scheduleLockRetry(); }
      if (q && q.catch) q.catch(scheduleLockRetry);
      return;
    }
    scheduleLockRetry();
  });
}
let _rawMouseOk = true;                     // false once the browser has said it has no raw mouse
// Chrome refuses re-locks for ~1.3s after ESC — wait out the cooldown and try again
function scheduleLockRetry() { lockTimer = setTimeout(tryPointerLock, 1400); }
document.addEventListener('pointerlockerror', () => { if (playing) scheduleLockRetry(); });

function applySettings() {
  // survival-created worlds can never leave survival
  if (currentWorld && currentWorld.mode === 'survival') modeSel.value = 'survival';
  // gamemode is a property of the WORLD, so it lands on every split-screen player at once
  const creative = modeSel.value !== 'survival';
  for (const p of PLAYERS) {
    const wasCreative = p.canFly;
    p.canFly = creative;                             // survival: flying disabled entirely
    if (!creative) {
      p.flying = false;
      // fresh vitals when entering survival, and skip fall-damage from the current arc
      if (wasCreative) { fillVitals(p, false); p.fallStart = null; p.vy = 0; }   // every bar
    }
  }
  // swap inventory sets when the mode changes. Survival persists via saveHotbar/saveInv (they
  // gate on currentInvMode so entering creative can never clobber survival storage).
  const newMode = modeSel.value === 'survival' ? 'survival' : 'creative';
  if (newMode !== currentInvMode) {
    // ...and each player carries their OWN stash, so the swap runs once per player context
    forEachPlayerSlot(() => {
      loadInventoryForMode(newMode);
      hotbarSel = 0;
      // MUST rebuild the DOM here — updateHotbar only re-toggles the selected-slot class and
      // would leave the previous mode's icons on screen as ghosts even though HOTBAR is empty.
      buildHotbar();
      flashBlockName();
    });
    if (invOpen) buildInventory();
  }
  if (creative) clearDrops();               // creative has no drops; wipe any survival leftovers
  fpsLimit = +fpsSel.value || 0;
  localStorage.setItem('vg_fps', fpsSel.value);
  const sv = clampi(+sensInput.value || 100, 10, 400);
  sensInput.value = sv;
  sens = sv / 100;
  localStorage.setItem('vg_sens', sv);
  /* raw mouse: the mouse is free while this menu is up, so the next lock, on the way back in, is simply asked
     for the new way. Switched on again, a browser that refused it once is asked once more. */
  const rm = rawMouseSel.value !== 'off';
  if (rm !== rawMouse) {
    rawMouse = rm;
    if (rm) _rawMouseOk = true;
    try { localStorage.setItem('vg_rawmouse', rm ? 'on' : 'off'); } catch {}
  }
  const d = clampi(+distInput.value || viewDist, 4, 32);
  distInput.value = d;
  if (d !== viewDist) { viewDist = d; applyViewDist(); rebuildQueues(); }
  // simulation radius: nothing to rebuild — every gated system reads simDist() per tick
  const sd = clampi(+simInput.value || simRadius, SIM_DIST_MIN, SIM_DIST_MAX);
  simInput.value = sd;
  if (sd !== simRadius) { simRadius = sd; localStorage.setItem('vg_sim', sd); }
  const sr = parseInt(shadowSel.value);
  if (sr !== shadowR) { shadowR = sr; applyShadowDist(); }
  applySplitDir();
}
/* Split screen membership is per-world and driven by the pause-menu roster (see 37-profiles.js).
   How the window is DIVIDED is a display preference like the others. It also applies on CHANGE,
   not only when the menu closes, so you can see the layout you picked while picking it. */
function applySplitDir() {
  const sdir = splitDirSel.value === 'v' ? 'v' : 'h';
  if (sdir === splitDir) return;
  splitDir = sdir;
  localStorage.setItem('vg_splitdir', sdir);
  relayoutSplitScreen();
}
splitDirSel.addEventListener('change', applySplitDir);
// Play: with no world saved yet there is nothing to pick, so it goes straight to creating one
document.getElementById('worldsBtn').addEventListener('click', () => refreshMenu(WORLDS.length ? 'worlds' : 'create'));
document.getElementById('newWorldBtn').addEventListener('click', () => refreshMenu('create'));
document.getElementById('worldsBackBtn').addEventListener('click', () => refreshMenu('home'));
// ...and Back from there returns home when there is still no world list to go back to
document.getElementById('createBackBtn').addEventListener('click', () => refreshMenu(WORLDS.length ? 'worlds' : 'home'));
document.getElementById('createBtn').addEventListener('click', async () => {
  const name = uniqueWorldName(worldNameIn.value);
  const seed = seedInput.value.replace(/[^a-z0-9]/gi, '')
            || Math.random().toString(36).slice(2, 10).toUpperCase();
  const w = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              name, seed, mode: newModeSel.value === 'creative' ? 'creative' : 'survival',
              // simulation speed for decay/flow/grass/burning lights; 0 is a real setting (it read as 5)
              tickSpeed: clampi(tickInput.value.trim() === '' || !isFinite(+tickInput.value) ? 5 : +tickInput.value, 0, 20),
              terrain: newTerrainSel.value === 'flat' ? 'flat' : 'default',   // fixed at creation
              // split screen is fixed at creation too: the save keeps a roster of profiles, and a
              // world that never had one should not sprout half-filled player records later
              split: !!newSplitChk.checked,
              structures: !!newStructChk.checked,   // villages and dungeons, fixed at creation
              seasons: !!newSeasonChk.checked,      // off: always 1 July, fixed at creation
              // 0.837, fixed at creation: off = always noon / a clear sky / no clouds / no animals / no monsters
              dayNight: !!newDayNightChk.checked, weather: !!newWeatherChk.checked, clouds: !!newCloudsChk.checked,
              animals: !!newAnimalsChk.checked, monsters: !!newMonstersChk.checked,
              biomeRev: 26,                         // 24: 70% fewer skeletons in the Dryland; 23: the Dryland; 22: the Deep Red Desert half, mountain halls, tunnels and deep shafts, red desert gold, desert mine shafts; 21: the Deep Desert, oases, palms, dry plants, desert sandstone, desert bones and hoodoos; 20: the Coldest Deep Snow split in two (its Forest, and flatter open snow), mushrooms by tree kind; 19: the Coldest Deep Snow, rime trees and ice shapes; 9: the Ice Spikes biome and the snow's icebergs; 10: Snowy Hills, bigger icebergs; 11: oceans 3x bigger, rivers that flow to the sea; 12: taller land, mountains to ~240; 13: shores of turf, sand, gravel and rock; 14: hills, crags, cliffs, no puddles, beaches to 10 wide; 15: rivers and lakes at their own height, rooms, tunnels, cave mouths, arches, overhangs; 16: rivers out of lakes into lakes or the sea, bigger longer lakes, gentler shores; 17: flat-topped mountains, mountain valleys, waterfalls, spruce forms; 18: divides between waters, shared basin lakes, gentler lake shores, Hills names, half the plains, mountain oaks                          // bigger snow and desert biomes, fewer desert hills, pink beaches, bigger biomes, deep and spruce forests, fewer oceans (biomes/biomes.js), tall spruce forest trees, the climate ladder, every biome twice as big; older worlds keep theirs
              createdVersion: APP_VERSION, lastVersion: APP_VERSION,   // the game's alpha number
              created: Date.now(), lastPlayed: Date.now() };
  WORLDS.unshift(w);
  persistWorlds();
  await loadWorld(w);
  worldNameIn.value = ''; seedInput.value = '';
  setPlaying(true);
  lockTries = 0;
  tryPointerLock();
});
document.getElementById('resumeBtn').addEventListener('click', () => {
  setPlaying(true);
  lockTries = 0;
  tryPointerLock();
});
/* Save and leave for the title screen. Shared by the pause menu's Quit and by the death screen's
   Back to Menu. It stops play FIRST, so nothing tries to re-grab the mouse. A dead player is
   saved DEAD: it used to respawn everyone first, which threw away how long they had survived
   and what killed them. Coming back now reopens the death screen with the same time, day and cause,
   and Respawn is pressed there. */
function quitToMenu() {
  if (playing) setPlaying(false);
  saveWorld();
  // what you were picking up a second ago is not news on the title screen
  if (typeof clearFeed === 'function') clearFeed();
  /* A dead player's death screen goes with the world. It is a pane element, not part of the
     menu, so nothing else hid it: it stayed up over the title screen and over the next world opened.
     Every seat's copy is hidden, since each pane cloned its own. The death itself is saved and the
     screen reopens when this world is loaded again. */
  for (const el of document.querySelectorAll('#deathScreen')) { el.style.display = 'none'; el.parentElement?.classList.remove('dying'); }
  toast('world saved');
  currentWorld = null;
  pendingRestore = null;
  pendingWorldRestore = null;
  setPlayerCount(1);                        // the roster belongs to the world, not to the title screen
  startMenuBackdrop();                      // back to the rotating title panorama
  refreshMenu('home');
}
document.getElementById('quitBtn').addEventListener('click', quitToMenu);
document.getElementById('fsBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
/* Volume sliders (they replaced the two mute buttons). #menuExtras hosts them, so the same three
   show on the title screen and the pause menu. Each shows its percentage beside it. */
for (const kind of ['master', 'music', 'sfx']) {
  const el = document.getElementById('vol_' + kind);
  if (!el) continue;
  const out = el.parentElement.querySelector('.volVal');
  const paint = () => { if (out) out.textContent = soundVol[kind] + '%'; };
  el.value = soundVol[kind];
  el.addEventListener('input', () => { setVolume(kind, el.value); paint(); });
  el.addEventListener('change', () => { setVolume(kind, el.value); paint(); });
  el.addEventListener('click', (e) => e.stopPropagation());
  paint();
}
canvas.addEventListener('click', () => {
  if (playing && !pointerLocked && !invOpen && !player.dead) { lockTries = 0; tryPointerLock(); }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  // a lock asked for a moment before the game was paused lands over the menu: let it go at once
  if (pointerLocked && !playing) { clearTimeout(lockTimer); document.exitPointerLock(); return; }
  if (pointerLocked) clearTimeout(lockTimer);
  else {
    for (const k in keys) keys[k] = false;
    mouseBreak = mousePlace = false;
    // ESC while mouse-locked -> pause menu. NOT when the death screen released it:
    // dying would otherwise stack the pause menu on top of the death screen.
    /* ...and never while a world is still loading: the pause menu would open over the loading
       screen. The loss is noted instead, and once the world is in the game pauses only if the window
       is still minimised or in the background (see the end of loading in 22-main-loop.js). */
    if (playing && !invOpen && !player.dead) {
      if (worldJoining()) pauseAfterJoin = true;
      else setPlaying(false);
    }
  }                                             // (inventory releases the lock on purpose)
});
document.addEventListener('mousemove', (e) => {
  // holding Q with a chisel worn: the mouse aims its shape radial instead of the camera,
  // with or without pointer lock
  if (typeof chiselMouseAim === 'function' && chiselMouseAim(e.movementX, e.movementY)) return;
  if (!pointerLocked || player.dead || worldJoining() || player._benchWork || player._milk) return;   // milking holds the view too
  if (e.movementX || e.movementY) lastInputDevice = 'kbd';
  player.yaw   -= e.movementX * 0.0022 * sens;
  player.pitch -= e.movementY * 0.0022 * sens;
  player.pitch = Math.max(-1.5697, Math.min(1.5697, player.pitch));
});
/* Typing in a text field (the structure block's name) is for the field only: the game's keys (E closes the
   inventory, Q, K, R, digits...) never see it. Escape and Enter still get through (to close, and to the fields' own
   Enter handlers). Runs first (capture). */
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'NumpadEnter' && t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|number|)$/i.test(t.type || ''))))
    e.stopImmediatePropagation();
}, true);
window.addEventListener('keyup', (e) => {
  const t = e.target;
  if (e.code !== 'Escape' && t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) e.stopImmediatePropagation();
}, true);
document.addEventListener('keydown', (e) => {
  /* Rebinding a seat: the keypress IS the answer, so it never reaches the game. Escape cancels
     rather than binding — nobody means "my input device is the escape key". */
  if (typeof inputCapture !== 'undefined' && inputCapture) {
    e.preventDefault();
    if (e.code === 'Escape') cancelInputCapture();
    else if (!e.repeat) inputCaptureKey();
    return;
  }
  keys[e.code] = true;
  lastInputDevice = 'kbd';
  if (e.code === 'F1') { e.preventDefault(); toggleFullscreen(); return; }
  if (e.code === 'F2') { e.preventDefault(); if (playing) cycleCameraView(); return; }
  if (e.code === 'F3') { e.preventDefault(); toggleDebugHud(0); return; }   // keyboard is seat one
  // F8 with F3 open: summon the Frozen King in front of you, until his castle exists (entities/frozen-king.js)
  if (e.code === 'F8') {
    e.preventDefault();
    if (!e.repeat && typeof bossDebugSummon === 'function' && !debugHudHidden(0)) bossDebugSummon();
    return;
  }
  // Backspace: hide every piece of HUD and the hand for a clean view, again to bring them back.
  // Never while typing into a field — there it is still a Backspace.
  if (e.code === 'Backspace' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') && !e.target?.isContentEditable) {
    e.preventDefault();
    if (currentWorld && !e.repeat) toggleHudHidden();
    return;
  }
  // joining a world: no key does anything until its chunks are in, fullscreen aside
  if (worldJoining()) { e.preventDefault(); return; }
  // working a crafting bench: E is the only key that still does anything
  if (player._benchWork && e.code !== 'KeyE') { e.preventDefault(); return; }
  /* Tab is the inventory key. It has to be handled BEFORE the `!playing` guard below so it also
     closes an open inventory, and it must preventDefault in both directions: left to the browser,
     Tab walks focus out of the canvas onto page chrome, and once focus lands there keystrokes
     stop reaching the game entirely. Menus keep normal Tab navigation. */
  // ...but not from the grave: this branch is deliberately ahead of the dead guard below
  if (e.code === 'Tab' && (playing || invOpen) && !player.dead) {
    e.preventDefault();
    if (!e.repeat) toggleInventory();
    return;
  }
  // block all browser defaults while game has input focus; F1 handled above, Escape handled below
  if (playing && e.code !== 'Escape') e.preventDefault();
  /* DEAD: the death screen is the only thing bound. Nothing else answers a key — no
     pause, no inventory, no hotbar, no dropping — so there is no way to act from the grave. The
     pad does the same in pollPad, and movement was already frozen in the frame loop. */
  if (playing && player.dead) { e.preventDefault(); return; }
  if (e.code === 'Backquote' && playing && currentWorld) {  // ~ opens the pause menu
    /* the inventory is NOT closed here first. Closing it while still playing asked for the mouse back, and
       that lock landed a moment later, over the pause menu: its cursor was caught and nothing could be clicked.
       setPlaying(false) closes every seat's inventory itself, after the game has stopped, so no lock is asked for. */
    setPlaying(false);
    return;
  }
  if (e.code === 'Escape') {                // inventory first, then menu toggle / panel back
    if (invOpen) toggleInventory(false);
    else if (playing && !pointerLocked) setPlaying(false);
    else if (!playing && menuScreen === 'profiles' && !needsFirstProfile())
      refreshMenu(currentWorld ? 'pause' : 'home');
    else if (!playing && !currentWorld && menuScreen === 'create') refreshMenu(WORLDS.length ? 'worlds' : 'home');
    else if (!playing && !currentWorld && menuScreen === 'worlds') refreshMenu('home');
    else if (!playing) setPlaying(true);
    return;
  }
  if (!playing) return;
  // Y with the inventory open throws from the hovered slot: one, or the whole stack with Shift
  if (e.code === 'KeyY' && invOpen) { if (!e.repeat || !e.shiftKey) dropHovered(e.shiftKey ? 'all' : 1); return; }
  if (e.code === 'KeyY' && !e.repeat && !invOpen) { dropFromHotbar(e.shiftKey ? 'stack' : 1); return; }
  // KeyE (bush pickup) is HELD, not tapped — driven from the frame loop off `keys`, not here
  if (e.code === 'Space' && !e.repeat && !invOpen) jumpTap();
  if (e.code === 'KeyR' && !e.repeat && !invOpen && typeof variantBindTap === 'function') variantBindTap();   // double tap: default
  if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat && !invOpen) player.fast = !player.fast;
  if (!invOpen && e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= HOTBAR.length) hotbarSel = n - 1, updateHotbar();
  }
  if (e.code === 'BracketLeft')  { viewDist = clampi(viewDist - 1, 4, 32); distInput.value = viewDist; applyViewDist(); rebuildQueues(); }
  if (e.code === 'BracketRight') { viewDist = clampi(viewDist + 1, 4, 32); distInput.value = viewDist; applyViewDist(); rebuildQueues(); }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
// ctrl+wheel is the browser page-zoom gesture; swallow it so scrolling near the game never
// rescales the whole page. Needs passive:false or preventDefault is ignored.
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });
document.addEventListener('wheel', (e) => {
  if (!playing || invOpen || player.dead || worldJoining() || player._benchWork) return;
  /* While the shape radial is open the wheel turns ITS pages and the hotbar stays put —
     the ring covers the hotbar anyway, so scrolling the selection under it is invisible work. */
  if (typeof chiselWheel === 'function' && chiselWheel(e.deltaY)) return;
  if (typeof variantWheel === 'function' && variantWheel(e.deltaY)) return;   // R held: the variant bar
  hotbarSel =(hotbarSel + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length;
  updateHotbar();
});
// suppress the browser context menu everywhere while in-game (incl. fullscreen + inventory UI)
document.addEventListener('contextmenu', (e) => {
  if (playing || document.fullscreenElement) e.preventDefault();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// unified break/place hold-to-repeat (mouse buttons and gamepad triggers feed the same state)
var act = { break: false, place: false, lastBreak: 0, lastPlace: 0, padPick: false };
var mouseBreak = false, mousePlace = false;
document.addEventListener('mousedown', (e) => {
  // attacking or using while the chisel radial is open closes it, picking nothing — lock or no lock
  if (typeof chiselMouseAim === 'function' && chiselMouseAim(0, 0)) {
    if (e.button === 0 || e.button === 2) _asKeyboardSeat(() => closeChiselRadial(false));
    return;
  }
  if (!pointerLocked || worldJoining()) return;
  lastInputDevice = 'kbd';
  if (e.button === 0) mouseBreak = true;
  if (e.button === 2) mousePlace = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseBreak = false;
  if (e.button === 2) mousePlace = false;
});

/* The mouse belongs to SEAT ZERO and nobody else. These are document handlers, so they
   write into whichever seat is installed when the event fires — normally slot 0, since the frame
   loop reinstalls it, but nothing in the handler itself said so. Without the guard a mouse event
   landing on a pad seat flips its cursor to 'mouse' mode, which hides it. */
const mouseOwnsInput = () => typeof activePlayerSlot !== 'function' || activePlayerSlot() === 0;
// inventory mouse drag & drop — coordinate-based (works over the pointer-events:none hotbar)
document.addEventListener('mousemove', (e) => {
  if (!invOpen || !mouseOwnsInput()) return;
  invCursor.mode = 'mouse'; invCursor.x = e.clientX; invCursor.y = e.clientY;
});
// click-carry model (no hold needed):
//   LMB          pick up all / place all       Ctrl+LMB   pick up 1
//   RMB          pick up half / place 1        Ctrl+RMB   move 1 to the other grid
//   Shift+LMB    quick-move; keep held down and sweep over slots to move them all.
//                Gear you can wear goes ON instead, into its slot if that slot is empty
//   Shift+RMB    wear it, swapping with whatever that slot already holds
//   carrying something, click off every panel: LMB throws the stack, RMB throws one
let shiftSweep = false;
document.addEventListener('mousedown', (e) => {
  if (!invOpen || !mouseOwnsInput() || (e.button !== 0 && e.button !== 2)) return;
  if (typeof uiAskOpen === 'function' && uiAskOpen()) return;   // answering a question never throws what you carry
  invCursor.mode = 'mouse'; invCursor.x = e.clientX; invCursor.y = e.clientY;
  const s = slotAtPoint(e.clientX, e.clientY);
  if (!s) {
    // gear let go on the Repair or Dismantle zone asks first (Mender / Dismantle)
    if (dragHeld && e.button === 0 && typeof tryRepairDrop === 'function' && tryRepairDrop(e.clientX, e.clientY)) {
      e.preventDefault(); return;
    }
    if (dragHeld && !_pointOnInvUI(e.clientX, e.clientY)) {
      e.preventDefault();
      dropHeldStack(e.button === 0 ? 'all' : 1);
    }
    return;
  }
  e.preventDefault();
  if (e.button === 0) {
    if (e.shiftKey && !dragHeld) { instantTransfer(s.region, s.i); shiftSweep = true; return; }
    if (dragHeld) placeInto(s.region, s.i, 'all');
    else pickUp(s.region, s.i, e.ctrlKey ? 1 : 'all');
  } else {
    if (e.shiftKey && !dragHeld) { swapEquip(s.region, s.i); return; }
    if (e.ctrlKey && !dragHeld) { transferOne(s.region, s.i); return; }
    if (dragHeld) placeInto(s.region, s.i, 1);
    else pickUp(s.region, s.i, 'half');
  }
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) shiftSweep = false; });
// middle-click sorts whichever grid the cursor is over (hotbar / inventory / chest)
document.addEventListener('mousedown', (e) => {
  if (!invOpen || e.button !== 1 || dragHeld) return;
  e.preventDefault();                                // also kills the browser autoscroll cursor
  const s = slotAtPoint(e.clientX, e.clientY);
  if (s) sortRegion(s.region);
});
document.addEventListener('auxclick', (e) => { if (invOpen && e.button === 1) e.preventDefault(); });
document.addEventListener('mousemove', (e) => {   // shift+LMB sweep: quick-move everything hovered
  if (!invOpen || !shiftSweep || !e.shiftKey) return;
  const s = slotAtPoint(e.clientX, e.clientY);
  if (s) instantTransfer(s.region, s.i);
});

/* ---------- gamepad ---------- */
var pad = {
  deadzone: 0.16, lookX: 0, lookY: 0,       // smoothed look
  prev: [], radialOpen: false, radialSel: -1,
};
function padAxis(v) {
  const s = Math.abs(v) < pad.deadzone ? 0 : (Math.abs(v) - pad.deadzone) / (1 - pad.deadzone) * Math.sign(v);
  return s * Math.abs(s);                   // quadratic response for fine aiming
}
/* The pad belonging to whichever player is currently installed. Solo, that is simply the first
   connected pad (unchanged behaviour); in split screen player one keeps keyboard and mouse and
   the pads go to players two upward in connection order — see padForSlot in 36-splitscreen.js. */
function getPad() {
  if (typeof padForSlot === 'function') return padForSlot(activePlayerSlot());
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of pads) if (g && g.connected) return g;
  return null;
}
// inventory gamepad control: left stick drives the virtual cursor; A drags (hold), Y quick-moves
function invGamepad(g, dt, btn, edge) {
  const mx = padAxis(g.axes[0] || 0), my = padAxis(g.axes[1] || 0);
  pad.invStick = Math.hypot(mx, my);              // fed to the magnet so it yields while moving
  if (pad.invStick > 0.001) {
    invCursor.mode = 'pad';
    const cs = invScale();                 // a quarter-screen panel gets a quarter-speed cursor
    invCursor.x += mx * 900 * cs * dt;
    invCursor.y += my * 900 * cs * dt;
  }
  /* Right stick scrolls whichever list is under it: the crafting recipes in survival, the
     creative block palette in creative. Both are open at once for nobody, so a straight
     either/or is enough — and the palette had no pad scroll at all before 0.704. */
  const ry = padAxis(g.axes[3] || 0);
  if (Math.abs(ry) > 0.01) {
    // ...and the furnace book's list while it is open
    // ...and first of all whatever scrolling box sits under the cursor: the skill tree, a chest
    let list = null;
    for (let n = document.elementFromPoint(invCursor.x, invCursor.y); n && n !== document.body; n = n.parentElement)
      if (n.scrollHeight > n.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(n).overflowY)) { list = n; break; }
    list = list || invPanel('craftList') || (activeFurnace && invWrapEl.querySelector('#furnacePanel .fbList'))
              || document.querySelector('#inv .invScroll');
    if (list) list.scrollTop += ry * 700 * dt;
  }
  const hov = hoveredSlot();
  if (edge(0) && hov) beginDrag(hov.region, hov.i);              // A press = pick up
  if (edge(0) && !hov) {                                         // A on a craft button = craft
    const el = document.elementFromPoint(invCursor.x, invCursor.y);
    // craft or inventory buttons, the furnace book and its tabs
    // ...and the skill tree's tabs and skills
    const b = el && el.closest ? el.closest('.cbtn, .invBtn, .cqSlot, .fbookBtn, #furnTabs .ctab, .skTab, .skNode') : null;
    // X held on a recipe counts a batch out on the cursor instead of ordering one; letting X go orders it
    const row = b && b.classList.contains('cbtn') ? b.closest('.crow') : null;
    if (row && row._recipe && btn(2) && typeof craftPickAdd === 'function') { pad.xCombo = true; craftPickAdd(row._recipe); }
    // a ready skill is held to learn; anything else is a press
    else if (b && b.classList.contains('skNode') && typeof skillHoldStart === 'function' && skillHoldStart(b.dataset.sk, 'pad')) {}
    else if (b) b.click();
  }
  if (pad.prev[2] && !btn(2) && typeof craftPickOn === 'function' && craftPickOn()) { pad.xCombo = true; craftPickCommit(); }
  if (pad.prev[0] && !btn(0) && typeof skillHoldEnd === 'function') skillHoldEnd('pad');   // A let go early
  if (pad.prev[0] && !btn(0) && dragHeld) {                      // A release = drop
    if (hov) endDrag(hov.region, hov.i);
    else if (!(typeof tryRepairDrop === 'function' && tryRepairDrop(invCursor.x, invCursor.y))) cancelDrag();   // repair
  }
  if (edge(3) && hov) instantTransfer(hov.region, hov.i);       // Y = quick-move
  // R3: the middle-click twin — sorts the grid under the cursor; in creative, lays the palette out afresh
  if (edge(11) && hov && !dragHeld) sortRegion(hov.region);
  // D-pad Left / Right: the inventory's tabs (Equipment, Skill tree, the station)
  if (edge(14) && typeof cycleInvTab === 'function') cycleInvTab(-1);
  if (edge(15) && typeof cycleInvTab === 'function') cycleInvTab(1);
  /* D-pad Down throws from the hovered slot, one at a time; with X held, the whole stack. X tapped on
     its own is the RMB twin: take half, or put one down from what the cursor carries. "Tapped" means
     released with no D-pad Down in between, so the combo never also takes half. */
  if (edge(2)) pad.xCombo = false;
  if (edge(13)) { if (btn(2)) pad.xCombo = true; dropHovered(btn(2) ? 'all' : 1); }
  if (pad.prev[2] && !btn(2) && !pad.xCombo && hov) {
    if (dragHeld) placeInto(hov.region, hov.i, 1); else pickUp(hov.region, hov.i, 'half');
  }
  // LB (4) / RB (5) cycle crafting-category tabs while inventory panel is open
  if (invPanel('craftTabs')) {
    if (edge(4)) cycleCraftCategory(-1);
    if (edge(5)) cycleCraftCategory(+1);
  } else if (invPanel('furnTabs')) {               // ...or the furnace book's tabs
    if (edge(4)) cycleFurnBookCategory(-1);
    if (edge(5)) cycleFurnBookCategory(+1);
  }
}
function pollGamepad(dt) {
  const g = getPad();
  if (!g) {                                 // disconnected: release held pad actions
    pad.radialOpen = false;
    act.padBreak = act.padPlace = act.padPick = false;
    radialEl.style.display = 'none';
    return { mx: 0, mz: 0, up: false, dn: false };
  }
  const btn = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
  const val = (i) => (g.buttons[i] ? g.buttons[i].value : 0);
  const edge = (i) => btn(i) && !pad.prev[i];
  /* While a seat is being rebound, the button press IS the answer — it must not also open a menu
     or swing a pickaxe. `prev` is still updated so releasing it afterwards can't fire a stale edge. */
  if (typeof inputCapture !== 'undefined' && inputCapture) {
    pad.prev = g.buttons.map(b => b.pressed);
    act.padBreak = act.padPlace = act.padPick = false;
    return { mx: 0, mz: 0, up: false, dn: false };
  }
  // real pad activity (not just "a pad is plugged in") takes over the prompt's key glyph
  if (g.buttons.some(b => b.pressed || b.value > 0.5) ||
      g.axes.some(a => Math.abs(a) > 0.35)) lastInputDevice = 'pad';

  // working a crafting bench: only North (the E of a pad) still answers, so it can keep working
  if (player._benchWork) {
    pad.prev = g.buttons.map(b => b.pressed);
    act.padBreak = act.padPlace = false;
    act.padPick = btn(3);
    return { mx: 0, mz: 0, up: false, dn: false };
  }
  // joining a world: every pad input is swallowed until its chunks are in
  if (worldJoining()) {
    pad.prev = g.buttons.map(b => b.pressed);
    act.padBreak = act.padPlace = act.padPick = false;
    return { mx: 0, mz: 0, up: false, dn: false };
  }
  // death screen: A respawns, every other pad input is swallowed
  if (player.dead) {
    if (edge(0)) respawnPlayer();
    pad.prev = g.buttons.map(b => b.pressed);
    act.padBreak = act.padPlace = act.padPick = false;
    return { mx: 0, mz: 0, up: false, dn: false };
  }

  /* The MENU owns the pad while it is up (ui/menus.js): the left stick drives its cursor, A
     presses, the D-pad steps, B goes back and the right stick scrolls. Only Start still closes it, so
     none of the in-world binds below (debug text, camera, dropping an item) fire behind the menu. */
  if (typeof updateMenuPad === 'function' && (!playing || (typeof uiAskOpen === 'function' && uiAskOpen()))) {
    const took = updateMenuPad(dt, btn, edge, g);
    if (edge(9) && !(typeof uiAskOpen === 'function' && uiAskOpen())) setPlaying(!playing);
    if (took) {
      pad.prev = g.buttons.map(b => b.pressed);
      pad.radialOpen = false;
      act.padBreak = act.padPlace = act.padPick = false;
      radialEl.style.display = 'none';
      return { mx: 0, mz: 0, up: false, dn: false };
    }
  }
  // Start (9) toggles the menu (or closes the inventory); B (1) inventory
  if (edge(9)) { if (invOpen) toggleInventory(false); else setPlaying(!playing); }
  /* Back / Share (8), 0.803: a tap opens or closes the skill tree (K's twin); held about a second it
     hides or shows the whole HUD (Backspace's twin). It no longer toggles fullscreen. */
  if (edge(8)) { pad.backArmed = true; pad.backHeld = 0; }
  if (pad.backArmed && btn(8)) {
    pad.backHeld += dt;
    if (pad.backHeld >= 1) { pad.backArmed = false; toggleHudHidden(); }
  } else if (pad.backArmed) {
    pad.backArmed = false;
    if (playing && !player.dead && !player.canFly && typeof openSkillTree === 'function') {
      if (invOpen && player._skillView) toggleInventory(false); else openSkillTree();
    }
  }
  if (edge(12)) toggleDebugHud(activePlayerSlot());   // D-pad Up hides this seat's debug text
  if (edge(14) && playing && !invOpen) cycleCameraView();         // D-pad Left cycles perspective (F2's twin)
  player._variantHold = btn(15);                      // D-pad Right HELD: the bumpers step the variant bar
  if (edge(15) && playing && !invOpen && typeof variantBindTap === 'function') variantBindTap();   // double tap: default
  /* D-pad Down drops one of the held item — the pad's twin of Y. Deliberately no stack modifier:
     every button that could serve as one already means something while playing (the triggers mine
     and place, the bumpers cycle the hotbar), and a mis-modified drop throws away a whole stack. */
  if (edge(13) && playing && !invOpen) dropFromHotbar(1);
  /* B (East) is the "back out of this" button: it closes the pause menu if that is what is in
     front of you, and otherwise opens or closes the inventory. setPlaying declines when there is
     no world loaded, so on the title screen it does nothing. */
  /* ...unless a chisel is worn: then B opens the inventory on a TAP, and held past CHISEL_HOLD it
     opens the shape radial instead, picking on release. Only a press that began here counts, so the B
     that just closed the inventory cannot reopen it when let go. */
  if (playing && !invOpen && chiselEquipped()) {
    if (edge(1)) { pad.bArmed = true; pad.bHeld = 0; }
    if (pad.bArmed && btn(1)) {
      pad.bHeld += dt;
      if (pad.bHeld >= CHISEL_HOLD) openChiselRadial();
    } else if (pad.bArmed) {
      pad.bArmed = false;
      if (chiselRadialOpen()) closeChiselRadial(true); else toggleInventory();
    }
  } else {
    pad.bArmed = false;
    // B with a batch being counted out cancels the batch, not the inventory
    if (edge(1) && invOpen && typeof craftPickOn === 'function' && craftPickOn()) craftPickCancel();
    else if (edge(1)) { if (!playing) setPlaying(true); else toggleInventory(); }
  }
  if (invOpen) {                                   // inventory owns the pad: virtual cursor only
    invGamepad(g, dt, btn, edge);
    pad.prev = g.buttons.map(b => b.pressed);
    pad.radialOpen = false;
    act.padBreak = act.padPlace = act.padPick = false;
    radialEl.style.display = 'none';
    return { mx: 0, mz: 0, up: false, dn: false };
  }
  if (!playing) {
    pad.prev = g.buttons.map(b => b.pressed);
    pad.radialOpen = false;
    act.padBreak = act.padPlace = act.padPick = false;
    radialEl.style.display = 'none';
    return { mx: 0, mz: 0, up: false, dn: false };
  }

  /* North (3) is bush pickup, the pad twin of E. It used to hold open a radial hotbar picker;
     that never got finished or maintained and the bumpers already cycle the hotbar, so the radial
     is retired. `pad.radialOpen` stays pinned false — the trigger handling below still reads it. */
  act.padPick = btn(3);                          // held, like the keyboard bind
  // the chisel's shape radial borrows the flag: looking and the triggers pause while it is open
  pad.radialOpen = chiselRadialOpen();
  if (pad.radialOpen && (val(6) > 0.5 || val(7) > 0.5)) {
    /* a trigger (attack / use) closes it, picking nothing. The held B is disarmed so it cannot
       reopen the radial, and that trigger press does nothing else until it is let go. */
    closeChiselRadial(false);
    pad.bArmed = false; pad.radialOpen = false; pad.trigBlock = true;
  } else if (pad.radialOpen) {
    const sx = padAxis(g.axes[2] || 0), sy = padAxis(g.axes[3] || 0);
    if (Math.hypot(sx, sy) > 0.4) chiselAim(sx, sy, true);
  }
  if (pad.trigBlock && val(6) <= 0.5 && val(7) <= 0.5) pad.trigBlock = false;
  radialEl.style.display = 'none';

  // look (right stick) — smoothed, disabled while the radial is open
  if (!pad.radialOpen) {
    const tx = padAxis(g.axes[2] || 0), ty = padAxis(g.axes[3] || 0);
    const k = Math.min(1, dt * 14);
    pad.lookX += (tx - pad.lookX) * k;
    pad.lookY += (ty - pad.lookY) * k;
    player.yaw   -= pad.lookX * 3.2 * sens * dt;
    player.pitch -= pad.lookY * 2.4 * sens * dt;
    player.pitch = Math.max(-1.5697, Math.min(1.5697, player.pitch));
  }

  /* Bumpers cycle the hotbar — but while the shape radial is open they turn its pages instead
, matching what the wheel does for mouse and keyboard. */
  // ...and with D-pad Right held they step the variant bar instead
  if (edge(4)) { if (!(player._variantHold && stepHeldVariant(-1)) && !chiselRadialPage(-1)) { hotbarSel = (hotbarSel + HOTBAR.length - 1) % HOTBAR.length; updateHotbar(); } }
  if (edge(5)) { if (!(player._variantHold && stepHeldVariant(1))  && !chiselRadialPage(1))  { hotbarSel = (hotbarSel + 1) % HOTBAR.length; updateHotbar(); } }

  // double-tap A toggles flying (same rule as double-tap Space); L3 toggles sprint
  if (edge(0)) jumpTap();
  if (edge(10)) player.fast = !player.fast;

  // triggers: RT (7) break, LT (6) place — merged into the shared action state below
  act.padBreak = !pad.radialOpen && !pad.trigBlock && val(7) > 0.5;
  act.padPlace = !pad.radialOpen && !pad.trigBlock && val(6) > 0.5;

  const out = {
    mx: padAxis(g.axes[0] || 0),
    mz: padAxis(g.axes[1] || 0),
    up: btn(0),                              // South / A
    dn: btn(2),                              // West / X — descend & sneak
  };
  pad.prev = g.buttons.map(b => b.pressed);
  return out;
}

