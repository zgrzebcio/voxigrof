'use strict';
/* ui/screen-effects.js: what a player's state puts on the screen. The red flash of a hit, the heat blur and mirages,
   and the marks pointing at where they died. */

/* ---- hurt feedback: red vignette (strength scales with damage) + camera kick ---- */
var camShake = { t: 0, dur: 0.25, amp: 0 };
/* The red damage vignette is per player: it is created here but PLACED by 36-splitscreen.js,
   inside the owning player's HUD pane, so only the player who got hit sees red. */
var hurtEl = document.createElement('div');
hurtEl.id = 'hurtOverlay';
var _hurtA = 0;
function hurtFlash(lost) {
  _hurtA = Math.min(0.9, 0.3 + lost * 0.09);
  camShake.t = camShake.dur;
  camShake.amp = Math.min(0.06, 0.015 + lost * 0.007);
  hurtEl.style.opacity = _hurtA.toFixed(3);
}

/* HEATSTROKE ON THE VIEW. From 40% the world blurs, more as it climbs (heatstrokeBlur, temperature/heat.js),
   under a faint orange edge; the HUD stays sharp over it. Per player like the hurt vignette: 36-splitscreen.js puts
   it first in the player's pane, under the rest of the HUD. */
var heatBlurEl = document.createElement('div');
heatBlurEl.id = 'heatBlur';
function _syncHeatBlur() {
  const px = Math.round(heatstrokeBlur(player) * (typeof skillSightMul === 'function' ? skillSightMul() : 1) * 4) / 4;   // Clear Eyes
  if (heatBlurEl._px === px) return;
  heatBlurEl._px = px;
  heatBlurEl.style.display = px > 0 ? 'block' : 'none';
  const f = px > 0 ? `blur(${px}px)` : '';
  heatBlurEl.style.backdropFilter = f;
  heatBlurEl.style.webkitBackdropFilter = f;
  heatBlurEl.style.setProperty('--hs', (px / HS_BLUR_MAX).toFixed(2));
}
/* MIRAGES. From HS_MIRAGE_AT heatstroke, by day, pools of water that are not there shimmer on open ground
   12-26 blocks ahead, on sand most of all. Each fades in, and fades away as you come within MIRAGE_NEAR of it, walk
   far from it, or the heatstroke eases. Each player sees only their own (showMiragesFor, from renderAllViews in
   36-splitscreen.js); they cast no shadow (layer 1). */
const MIRAGE_MAX = 3, MIRAGE_NEAR = 7, MIRAGE_FAR = 40;
const _MIRAGE_SAND = new Set([B.SAND, B.RED_SAND, B.PINK_SAND]);
const _mirageGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const _MIRAGE_VS = `varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const _MIRAGE_FS = `uniform float uTime, uA; uniform vec3 uSky; varying vec2 vUv;
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float edge = smoothstep(1.0, 0.35, length(q));
    float w = 0.5 + 0.5 * sin(uTime * 2.3 + q.x * 9.0 + sin(q.y * 6.0 + uTime * 1.7) * 1.5);
    vec3 col = mix(uSky, vec3(0.5, 0.72, 0.95), 0.4) * (0.9 + 0.2 * w);
    gl_FragColor = vec4(col, edge * uA * (0.5 + 0.3 * w));
  }`;
// a spot on open ground ahead of `p` ([x, y, z] of the pool's middle), or null
function _mirageSpot(p) {
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (let tries = 0; tries < 6; tries++) {
    const ang = (Math.random() - 0.5) * 1.2, d = 12 + Math.random() * 14, c = Math.cos(ang), s = Math.sin(ang);
    const x = Math.floor(p.pos.x + (fx * c - fz * s) * d), z = Math.floor(p.pos.z + (fx * s + fz * c) * d);
    for (let y = Math.floor(p.pos.y) + 6; y > p.pos.y - 12; y--) {
      const v = getBlock(x, y, z), id = v & 255;
      if (id === B.WATER || id === B.LAVA) break;
      if (!v || !CORE.solidVal(v)) continue;
      if (getSkyWorld(x, y + 1, z) < 15 || (!_MIRAGE_SAND.has(id) && Math.random() < 0.6)) break;
      return [x + 0.5, y + 1.03, z + 0.5];
    }
  }
  return null;
}
function _updateMirages(dt) {
  const p = player;
  const on = !p.canFly && !p.dead && (p.heatstroke || 0) >= HS_MIRAGE_AT && (typeof _skyDayF !== 'number' || _skyDayF > 0.3);
  let M = p._mirages;
  if (!M) {
    if (!on) return;
    M = p._mirages = { group: new THREE.Group(), pools: [], t: 1 };
    scene.add(M.group);
  }
  M.t -= dt;
  if (on && M.pools.length < MIRAGE_MAX && M.t <= 0) {
    M.t = 1.5 + Math.random() * 3;
    const s = _mirageSpot(p);
    if (s) {
      const mat = new THREE.ShaderMaterial({ vertexShader: _MIRAGE_VS, fragmentShader: _MIRAGE_FS, transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uA: { value: 0 }, uSky: { value: new THREE.Color() } } });
      const mesh = new THREE.Mesh(_mirageGeo, mat);
      mesh.layers.set(1);
      mesh.renderOrder = 2;
      mesh.position.set(s[0], s[1], s[2]);
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.scale.set(3 + Math.random() * 3, 1, 2 + Math.random() * 2);
      M.group.add(mesh);
      M.pools.push({ mesh, a: 0, x: s[0], z: s[2], seed: Math.random() * 10, going: false });
    }
  }
  const time = performance.now() / 1000;
  for (let i = M.pools.length - 1; i >= 0; i--) {
    const q = M.pools[i], d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
    q.going = q.going || !on || d < MIRAGE_NEAR || d > MIRAGE_FAR;
    q.a = q.going ? q.a - dt / 1.2 : Math.min(1, q.a + dt / 2.5);
    if (q.going && q.a <= 0) { M.group.remove(q.mesh); q.mesh.material.dispose(); M.pools.splice(i, 1); continue; }
    const u = q.mesh.material.uniforms;
    u.uA.value = q.a; u.uTime.value = time + q.seed;
    u.uSky.value.copy(typeof _skyFogColor !== 'undefined' ? _skyFogColor : sharedUniforms.fogColor.value);
  }
}
// only the viewing player's mirages are drawn in their view
function showMiragesFor(who) {
  for (const p of PLAYERS) if (p._mirages) p._mirages.group.visible = p === who;
}

/* THE DEATH MARK. Where a player last died, on their own screen: a skull over the spot with how far it is
   and how long the things they dropped there still lie. Off screen or behind them it waits at the edge of the view,
   on the side to turn to. It goes when they come within DEATH_MARK_TOUCH of it, or when the time runs out; that
   clock only runs while the spot is simulated, as the drops' own does (15-drops.js). Saved with the player.
   Per player like the hurt vignette: 36-splitscreen.js puts it in the player's pane, outside the HUD's scaling. */
/* the last DEATH_MARKS_MAX deaths each keep a mark (`player._deathMarks`, oldest first), every one with its own
   clock: dying again starts the new one's and leaves the others' running. `deathMarkEl` is their holder now, a mark
   (`.dm`) made in it for each. */
const DEATH_MARK_TOUCH = 2, DEATH_MARK_EDGE = 28, DEATH_MARKS_MAX = 5;
var deathMarkEl = document.createElement('div');
deathMarkEl.id = 'deathMark';
const _dmV = new THREE.Vector3();
function _syncDeathMark(dt) {
  const p = player, el = deathMarkEl, list = p._deathMarks;
  if (!el) return;
  const hide = () => { if (el.style.display !== 'none') el.style.display = 'none'; };
  if (!list || !list.length) return hide();
  // every clock runs while its own spot is simulated, as its drops' does; a mark goes when reached or run out
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (typeof inSimRange === 'function' && inSimRange(m.x, m.z)) m.left -= dt;
    m._d = Math.hypot(p.pos.x - (m.x + 0.5), p.pos.y - m.y, p.pos.z - (m.z + 0.5));
    if (m.left <= 0 || (!p.dead && p.spawned && m._d < DEATH_MARK_TOUCH)) list.splice(i, 1);
  }
  if (!list.length || p.dead || !p.spawned || p.canFly || menuScene || !el.parentElement) return hide();
  const W = el.parentElement.clientWidth, H = el.parentElement.clientHeight;
  if (!W || !H) return hide();
  camera.updateMatrixWorld();
  while (el.children.length < list.length) { const c = document.createElement('div'); c.className = 'dm'; el.appendChild(c); }
  for (let i = 0; i < el.children.length; i++) {
    const c = el.children[i], m = list[i];
    if (!m) { if (c.style.display !== 'none') c.style.display = 'none'; continue; }
    _dmV.set(m.x + 0.5, m.y + 1.2, m.z + 0.5).applyMatrix4(camera.matrixWorldInverse);
    const behind = _dmV.z > 0;
    _dmV.applyMatrix4(camera.projectionMatrix);
    let sx = _dmV.x, sy = _dmV.y;
    if (behind) { sx = -sx; sy = -sy; }
    let x = (sx * 0.5 + 0.5) * W, y = (0.5 - sy * 0.5) * H;
    // off screen or behind: slide it in along the line from the middle to the edge
    const hx = W / 2 - DEATH_MARK_EDGE, hy = H / 2 - DEATH_MARK_EDGE, dx = x - W / 2, dy = y - H / 2;
    const out = behind || Math.abs(dx) > hx || Math.abs(dy) > hy;
    if (out) {
      const k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
      x = W / 2 + dx * k; y = H / 2 + dy * k;
    }
    const s = Math.max(0, Math.ceil(m.left)), txt = `☠ ${Math.round(m._d)} m · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (c._txt !== txt) { c._txt = txt; c.textContent = txt; }
    c.style.display = 'block';
    c.style.left = x.toFixed(1) + 'px';
    c.style.top = y.toFixed(1) + 'px';
    c.classList.toggle('edge', out);
    c.classList.toggle('old', i < list.length - 1);     // the latest stands out a little
  }
  el.style.display = 'block';
}
// the saved marks as a list (16-worlds.js, 36-splitscreen.js); a save from before 0.8442 holds the one mark it had
const _okDeathMark = (r) => r && [r.x, r.y, r.z, r.left].every(n => typeof n === 'number' && isFinite(n)) && r.left > 0;
const restoreDeathMark = (r) => (Array.isArray(r) ? r : [r]).filter(_okDeathMark).slice(-DEATH_MARKS_MAX)
  .map(m => ({ x: m.x, y: m.y, z: m.z, left: m.left }));
const serializeDeathMark = (p) => (p._deathMarks || []).map(m => ({ x: m.x, y: m.y, z: m.z, left: Math.round(m.left) }));
