'use strict';
/* ui/boss-hud.js: the boss bar and the quest marker. */

/* ==================================== on screen ==================================== */
/* Per frame, per seat (tickPlayer, player/tick.js): its health and shield bar along the top of the view while one is within
   BOSS_BAR_R, and the last quest's marker over the nearest Frozen King, placed like the death mark (19). Both live
   on the seat's pane, outside the HUD's scaling, styled here. */
const _bmV = new THREE.Vector3();
function _bossUiOf(pane) {
  if (pane._bossUi) return pane._bossUi;
  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);width:min(460px,62%);display:none;' +
    'pointer-events:none;z-index:4;font:600 13px system-ui,sans-serif;color:#e4f6ff;text-align:center;text-shadow:0 1px 3px #000';
  bar.innerHTML = '<div class="bbName" style="margin-bottom:3px;letter-spacing:.5px"></div>' +
    '<div style="height:11px;background:rgba(0,0,0,.55);border:1px solid rgba(170,225,255,.7);border-radius:3px;overflow:hidden">' +
      '<div class="bbHp" style="height:100%;width:100%;background:linear-gradient(#ff7a6e,#a52c2c)"></div></div>' +
    '<div style="height:6px;margin-top:2px;background:rgba(0,0,0,.5);border-radius:2px;overflow:hidden">' +
      '<div class="bbSh" style="height:100%;width:100%;background:linear-gradient(#cdefff,#4aa6e6)"></div></div>';
  const mark = document.createElement('div');
  mark.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-50%);pointer-events:none;z-index:3;color:#eaf8ff;' +
    'font:600 13px system-ui,sans-serif;white-space:nowrap;text-shadow:0 1px 3px #000;background:rgba(10,40,70,.5);' +
    'border:1px solid rgba(140,215,255,.75);border-radius:6px;padding:2px 7px';
  pane.appendChild(bar); pane.appendChild(mark);
  return (pane._bossUi = { bar, mark, name: bar.querySelector('.bbName'), hp: bar.querySelector('.bbHp'), sh: bar.querySelector('.bbSh') });
}
function syncBossHud() {
  const st = typeof PSTATE !== 'undefined' ? PSTATE[activePlayerSlot()] : null;
  if (!st || !st.pane) return;
  const ui = _bossUiOf(st.pane);
  const p = player, live = !menuScene && p.spawned && !p.dead && currentWorld;
  let near = null, nd = Infinity;
  if (live) for (const e of ENTITIES) {
    if (!e.boss || e.hp <= 0) continue;
    const d = Math.hypot(e.x - p.pos.x, e.y - p.pos.y, e.z - p.pos.z);
    if (d < nd) { nd = d; near = e; }
  }
  // the bar
  const showBar = !!near && nd <= BOSS_BAR_R;
  if (showBar) {
    if (ui.name._t !== near.name) { ui.name._t = near.name; ui.name.textContent = near.name; }
    ui.hp.style.width = (100 * Math.max(0, near.hp) / near.maxHp).toFixed(1) + '%';
    ui.sh.style.width = (100 * Math.max(0, near.shield) / FK.SHIELD).toFixed(1) + '%';
    ui.sh.style.opacity = near.shieldState === 'broken' ? '0.45' : '1';
  }
  if ((ui.bar.style.display !== 'none') !== showBar) ui.bar.style.display = showBar ? 'block' : 'none';
  // the quest's marker: only while the last quest is the one you are on
  const q = typeof QUESTS !== 'undefined' ? QUESTS[questIndex()] : null;
  const onQuest = live && !p.canFly && q && q.reqs.some(r => r.boss === 'frozen_king');
  /* where it points: a king within sight of the bar, else the nearest castle still standing or worked out from
     the seed (even land never loaded), else a king summoned anywhere */
  let mark = null;
  if (onQuest) {
    const castle = _nearestCastle(p);
    if (near && (nd <= BOSS_BAR_R || !castle || nd < castle.d)) mark = { x: near.x, y: near.y + FK.BOX[1] + 0.6, z: near.z, d: nd, txt: near.name };
    else if (castle) mark = { x: castle.x, y: castle.y, z: castle.z, d: castle.d, txt: "Frozen King's castle" };
  }
  /* The milk quest's marker (`mark: 'cow'` in QUESTS): the nearest female cow there is, one whose milk is ready
     before one still waiting. Only cows the game is carrying, so none shows until some are near enough to exist. */
  if (!mark && live && !p.canFly && q && q.mark === 'cow') {
    let cow = null, cd = Infinity;
    for (const e of ENTITIES) {
      if (e.kind !== 'cow' || e.gender !== 'F' || e.hp <= 0) continue;
      const d = Math.hypot(e.x - p.pos.x, e.y - p.pos.y, e.z - p.pos.z) + (e.milkCd > 0 ? 1e4 : 0);
      if (d < cd) { cd = d; cow = e; }
    }
    if (cow) mark = { x: cow.x, y: cow.y + 1.9, z: cow.z, d: cd % 1e4, icon: '🐄',
                      txt: cow.milkCd > 0 ? 'Cow (milk not ready)' : 'Cow to milk' };
  }
  const el = ui.mark;
  if (!mark) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
  const W = st.pane.clientWidth, H = st.pane.clientHeight;
  if (!W || !H) return;
  camera.updateMatrixWorld();
  _bmV.set(mark.x, mark.y, mark.z).applyMatrix4(camera.matrixWorldInverse);
  const behind = _bmV.z > 0;
  _bmV.applyMatrix4(camera.projectionMatrix);
  let sx = _bmV.x, sy = _bmV.y;
  if (behind) { sx = -sx; sy = -sy; }
  let x = (sx * 0.5 + 0.5) * W, y = (0.5 - sy * 0.5) * H;
  const E = 28, hx = W / 2 - E, hy = H / 2 - E, dx = x - W / 2, dy = y - H / 2;
  if (behind || Math.abs(dx) > hx || Math.abs(dy) > hy) {
    const k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
    x = W / 2 + dx * k; y = H / 2 + dy * k;
  }
  const txt = `${mark.icon || '👑'} ${mark.txt} · ${Math.round(mark.d)} m`;
  if (el._txt !== txt) { el._txt = txt; el.textContent = txt; }
  el.style.display = 'block';
  el.style.left = x.toFixed(1) + 'px';
  el.style.top = y.toFixed(1) + 'px';
}
