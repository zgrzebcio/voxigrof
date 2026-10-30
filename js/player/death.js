'use strict';
/* player/death.js: the death screen, respawning, and the pause menu's Respawn. */

/* ---- death screen ----
   `deathEl` and friends are per-player pane elements, swapped with the rest of the HUD, so a
   player dying in split screen darkens only their own quarter of the screen. The pointer lock is
   released only when the player who died is the one holding the mouse (player one). */
var deathEl = null, deathCauseEl = null, deathStatsEl = null;
/* Respawn from the pause menu: a way out when stuck. Keep the mouse or the pad cursor on it for
   GIVE_UP_HOLD_S to arm it, then click: player one dies on the spot, everything dropped as any death, and the
   button cools down for GIVE_UP_COOLDOWN_S (on the player, saved in `vit.gu`, ticked in tickStats). */
const GIVE_UP_HOLD_S = 1, GIVE_UP_COOLDOWN_S = 20 * 60;   // hold 2 s until 0.8291
const giveUpBtn = document.getElementById('giveUpBtn');
let _giveUpHold = 0, _giveUpTxt = '';
function updatePauseRespawn(dt) {
  if (!giveUpBtn) return;
  const p = PLAYERS[0];
  const show = !playing && menuScreen === 'pause' && !!currentWorld && !!p && !p.dead && !p.canFly;
  const disp = show ? '' : 'none';
  if (giveUpBtn.style.display !== disp) giveUpBtn.style.display = disp;   // once a frame: written only when it changes
  if (!show) { _giveUpHold = 0; return; }
  const cd = p._giveUpCd || 0;
  const over = giveUpBtn.matches(':hover') || (typeof _mHover !== 'undefined' && _mHover === giveUpBtn);
  _giveUpHold = cd <= 0 && over ? Math.min(GIVE_UP_HOLD_S, _giveUpHold + dt) : 0;
  const armed = _giveUpHold >= GIVE_UP_HOLD_S;
  giveUpBtn.classList.toggle('cool', cd > 0);
  giveUpBtn.classList.toggle('armed', armed);
  giveUpBtn.style.setProperty('--hold', (100 * _giveUpHold / GIVE_UP_HOLD_S).toFixed(1) + '%');
  // two lines: a small one saying what to do, and a big "Respawn"
  const left = Math.ceil(cd), mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const txt = cd > 0 ? `ready in ${mmss}` : armed ? 'click to' : over ? 'keep holding' : 'hover to';
  if (txt !== _giveUpTxt) giveUpBtn.innerHTML = `<small>${_giveUpTxt = txt}</small><span>Respawn</span>`;
}
if (giveUpBtn) giveUpBtn.addEventListener('click', () => {
  const p = PLAYERS[0];
  if (!p || p.dead || p.canFly || (p._giveUpCd || 0) > 0 || _giveUpHold < GIVE_UP_HOLD_S) return;
  p._giveUp = true;                              // updateVitals kills on the next frame, the death screen follows
  p._giveUpCd = GIVE_UP_COOLDOWN_S;
  _giveUpHold = 0;
  setPlaying(true);
});

function showDeathScreen(cause) {
  if (!deathEl) return;
  if (deathCauseEl) deathCauseEl.textContent = 'You ' + cause;
  const t = Math.floor(player.aliveT || 0);
  const tStr = t >= 60 ? `${Math.floor(t / 60)}m ${t % 60}s` : `${t}s`;
  if (deathStatsEl) deathStatsEl.textContent = `Survived ${tStr} · Day ${(player._deathDay ?? worldDay) + 1}`;
  deathEl.style.display = 'flex';
  if (player === PLAYERS[0] && document.pointerLockElement) document.exitPointerLock();
}
/* Back from a death: health, stamina and oxygen full, every other bar — food, thirst, energy, fruit,
   vegetables, protein — at 75% (half before), and no over-stats. Only here: a new world and a first spawn still start full. */
const RESPAWN_BAR_SHARE = 0.75,   /* 75% since 0.833 (half until): a bar and its over-stat run to 150 */ RESPAWN_FULL = new Set(['stamina']);
function respawnPlayer() {
  fillVitals(player, false);                     // every bar full, no over-stats...
  for (const k in OVER_KEY) if (!RESPAWN_FULL.has(k)) player[k] = VITAL_MAX[k] * RESPAWN_BAR_SHARE;   // ...then the half
  player._hpLast = player.hp;                    // a respawn is not a heal — don't diff across it
  player.effects = [];
  if (player.sleepingAt) leaveBed(player);     // never respawn still flagged as in a bed
  player.vy = 0; player.fallStart = null; player._kbT = 0; player._dmgCause = null; player.aliveT = 0; player._deathDay = null;
  // the bed slept in comes first (it was asked last: the world's spawn was always found, so the bed was never used)
  const s = bedRespawnSpot(player) || findValidSpawn();
  if (s) {
    player.pos.set(s.x, s.y, s.z);
    if (!player.spawnPos) player.spawnPos = player.pos.clone();
    if (!player.homeSpawn) player.homeSpawn = player.pos.clone();
  } else if (player.spawnPos) {
    player.pos.copy(player.spawnPos);
  } else {
    const sy = surfaceY(Math.floor(player.pos.x), Math.floor(player.pos.z));
    player.pos.y = Math.max(sy + 2, WATER_Y + 3);
  }
  player.dead = false;
  if (deathEl) deathEl.style.display = 'none';
  if (deathEl && deathEl.parentElement) deathEl.parentElement.classList.remove('dying');   // 0.801
  paintVitals();
  // only player one owns the mouse, so only their respawn re-grabs the pointer lock
  if (playing && player === PLAYERS[0]) { lockTries = 0; tryPointerLock(); }
}
