'use strict';
/* seasons/waves.js: waves on the sea. A crest starts out on open water near a player, rolls in toward the nearest
   shore, rising as it nears it, and breaks there in spray with a wash of sound; while it passes it pushes whoever
   swims in it (and creatures and dropped things) toward the beach. Crests come at random sizes, bigger and more often
   in a storm or a strong wind, and now and then one far bigger than the rest.
   Each crest is a swell of water topped with foam: a strip of WAVE_SEG pieces along it and the rows of WAVE_ROWS across
   it, every crest in ONE mesh and one draw (_waveMesh, filled 20 times a second), plus a little foam blown off its top and the
   spray where it breaks from the particle pools (FX.sprites, 49-particles.js). The push goes through waterFlowVec
   (fluids/current.js, wavePush below); the sound is the swim sound pitched down (32-sound.js); updated from frame()
   (22-main-loop.js). The sea's level is the generator's (mainGen.seaLevel). */

const WAVE_MAX = 12;                      // crests at once, round every player together
const WAVE_EVERY = [0.9, 2.6];            // seconds between new crests near a player in calm weather (a storm: about half)
const WAVE_REACH = 34;                    // how far from a player a crest may start
const WAVE_SHORE = [6, 26];               // the shore it rolls to lies this far ahead of where it starts...
const WAVE_OPEN = 10;                     // ...with open water this far behind it: the sea, not a pond
const WAVE_SPEED = [2.0, 3.4];            // blocks a second
const WAVE_BIG = 0.08, WAVE_BIG_MUL = 2.4;   // the odd crest far bigger than the rest
const WAVE_PUSH = 1.1;                    // the push of a size-1 crest, in the current's units (waterFlowVec)
const WAVE_BAND = 1.8;                    // how deep (along its way) a crest pushes
const WAVE_BREAK_S = 0.7;                 // a crest that reached the shore falls in this long
const WAVE_SEG = 12;                      // a crest's mesh: this many pieces along it...
/* ...and these rows across it, back to front: [where along its way (x its length), height (x its height), how opaque,
   how much foam (0 the sea's colour, 1 white)]. The two feet lie under the water's top, so the swell rises out of it. */
const WAVE_ROWS = [[-1.0, -0.06, 0, 0], [-0.45, 0.5, 0.45, 0.25], [0, 1, 0.92, 1], [0.2, 0.62, 0.75, 1], [0.42, -0.06, 0, 1]];
const WAVE_SEA_RGB = [0.5, 0.74, 0.84], WAVE_FOAM_RGB = [0.95, 0.97, 1.0];
const WAVES = [];                         // { x, z (the crest's middle), dx, dz (its way), half, size, speed, left, total, age, brk, vis }
const _waveDirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];

const _seaY = () => (typeof mainGen !== 'undefined' && mainGen && mainGen.seaLevel) || 99;
// open sea at a column: water at the sea's level with air over it
const _seaAt = (x, z, Y) => (getBlock(x, Y, z) & 255) === B.WATER && (getBlock(x, Y + 1, z) & 255) === B.AIR;

/* How rough the sea is near (x, z): 1 calm, more in a storm, a rain, a strong wind */
function _waveRough(x, z) {
  if (typeof weatherAt !== 'function') return 1;
  const w = weatherAt(x, z), m = w.mix || {};
  return 1 + 1.2 * (m.storm || 0) + 0.5 * (m.windy || 0) + 0.25 * (m.rainy || 0) + Math.max(0, (w.speed - 15) / 40);
}

/* the crests' mesh, made on first use: positions and colours written at each step of the waves (20 a second, SIM_DT), the
   triangles fixed. Between steps the shader slides each crest on along its way: every vertex carries its crest's speed
   (aVel, blocks a second in x and z) and uSince is the time since the step, so the buffers go to the card 20 times a
   second, not every frame. */
const _WAVE_COLS = WAVE_SEG + 1, _WAVE_VERTS = _WAVE_COLS * WAVE_ROWS.length, _WAVE_TRIS = WAVE_SEG * (WAVE_ROWS.length - 1) * 6;
let _waveMesh = null, _wavePos = null, _waveCol = null, _waveVel = null, _waveAcc = 0;
function _waveMeshMake() {
  _wavePos = new Float32Array(WAVE_MAX * _WAVE_VERTS * 3);
  _waveCol = new Float32Array(WAVE_MAX * _WAVE_VERTS * 4);
  _waveVel = new Float32Array(WAVE_MAX * _WAVE_VERTS * 2);
  const idx = new Uint16Array(WAVE_MAX * _WAVE_TRIS);
  let o = 0;
  for (let w = 0; w < WAVE_MAX; w++)
    for (let r = 0; r < WAVE_ROWS.length - 1; r++)
      for (let c = 0; c < WAVE_SEG; c++) {
        const a = w * _WAVE_VERTS + r * _WAVE_COLS + c, b = a + _WAVE_COLS;
        idx.set([a, b, a + 1, a + 1, b, b + 1], o); o += 6;
      }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(_wavePos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(_waveCol, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aVel', new THREE.BufferAttribute(_waveVel, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSince: { value: 0 } },
    vertexShader: `attribute vec4 aColor; attribute vec2 aVel; uniform float uSince; varying vec4 vColor;
      void main() {
        vColor = aColor;
        vec3 p = position + vec3(aVel.x, 0.0, aVel.y) * uSince;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying vec4 vColor;
      void main() { if (vColor.a < 0.01) discard; gl_FragColor = vColor; }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  _waveMesh = new THREE.Mesh(geo, mat);
  _waveMesh.frustumCulled = false;
  _waveMesh.layers.set(1);                         // the no-shadow layer every camera draws
  _waveMesh.renderOrder = 6;                       // over the water
  scene.add(_waveMesh);
}

// one new crest near player p, if open sea with a shore ahead lies within reach
function _waveSpawn(p, Y) {
  for (let tries = 0; tries < 4; tries++) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (WAVE_REACH - 6);
    const x = Math.floor(p.pos.x + Math.cos(a) * r), z = Math.floor(p.pos.z + Math.sin(a) * r);
    if (!_seaAt(x, z, Y)) continue;
    // the nearest shore among eight ways, with open water behind
    let best = null, bestD = 1e9;
    for (const [dx, dz] of _waveDirs) {
      let d = 0;
      for (let s = 1; s <= WAVE_SHORE[1]; s++)
        if (!_seaAt(Math.floor(x + 0.5 + dx * s), Math.floor(z + 0.5 + dz * s), Y)) { d = s; break; }
      if (!d || d < WAVE_SHORE[0] || d >= bestD) continue;
      let open = true;
      for (let s = 1; s <= WAVE_OPEN && open; s += 3) open = _seaAt(Math.floor(x + 0.5 - dx * s), Math.floor(z + 0.5 - dz * s), Y);
      if (open) { best = [dx, dz]; bestD = d; }
    }
    if (!best) continue;
    const rough = _waveRough(x, z), big = Math.random() < WAVE_BIG ? WAVE_BIG_MUL : 1;
    const jit = (Math.random() - 0.5) * 0.5, c = Math.cos(jit), s = Math.sin(jit);   // a little off the eight ways
    const dx = best[0] * c - best[1] * s, dz = best[0] * s + best[1] * c;
    const size = (0.5 + Math.random() * 0.5) * rough * big;
    const speed = WAVE_SPEED[0] + Math.random() * (WAVE_SPEED[1] - WAVE_SPEED[0]);
    const w = { x: x + 0.5, z: z + 0.5, dx, dz, half: (4 + Math.random() * 6) * Math.min(2.5, 0.8 + size * 0.6),
                size, speed, left: bestD / speed + 2, total: bestD / speed, age: 0, brk: 0, vis: new Float32Array(_WAVE_COLS) };
    for (let k = 0; k < _WAVE_COLS; k++) w.vis[k] = _waveColSea(w, k, Y) ? 1 : 0;
    WAVES.push(w);
    return;
  }
}

// is the sea under piece-edge k of crest w (just ahead of its top)?
function _waveColSea(w, k, Y) {
  const t = (k / WAVE_SEG * 2 - 1) * w.half;
  return _seaAt(Math.floor(w.x - w.dz * t + w.dx * 0.4), Math.floor(w.z + w.dx * t + w.dz * 0.4), Y);
}
// a crest's height and length now: it rises as it rolls in, and falls in once it breaks
const _waveH = (w) => (0.2 + 0.34 * w.size) * (1 + 0.7 * Math.min(1, w.age / Math.max(0.1, w.total)))
                      * (w.brk ? w.brk / WAVE_BREAK_S : 1);
const _waveLen = (w) => 1.1 + 0.9 * w.size;

// foam blown off a crest's top, moving with it; `burst` the spray where it breaks
function _waveFoam(w, Y, dt, burst) {
  if (typeof FX === 'undefined' || _fxScale <= 0 || !_fxNear(w.x, Y, w.z)) return;
  const L = _fxLight(w.x, Y + 1.5, w.z), H = _waveH(w);
  const n = burst ? _fxN(14 + 20 * w.size) : _fxN(Math.max(1, w.half * 2 * dt * 5 * Math.min(2, w.size + 0.4)));
  const px = -w.dz, pz = w.dx, S = FX.sprites;
  for (let k = 0; k < n; k++) {
    const t = (Math.random() * 2 - 1) * w.half, x = w.x + px * t, z = w.z + pz * t;
    if (!_seaAt(Math.floor(x), Math.floor(z), Y) && !burst) continue;
    const y = Y + 0.86 + (burst ? 0.3 : H * (0.7 + 0.3 * Math.random()));
    const i = _fxSprite(Math.random() < 0.5 ? _R.SMOKE_S : _R.DUST, x, y, z, burst ? _rnd(0.6, 1.1) : _rnd(0.3, 0.55),
                        0.08 + 0.08 * Math.min(2, w.size), 0.04);
    if (i < 0) return;
    S.color(i, 0.9 * L, 0.95 * L, L, 0.85);
    const up = burst ? _rnd(1.8, 4) * Math.min(2.4, 0.6 + w.size) : _rnd(0.2, 0.7) * w.size;
    S.vx[i] = w.dx * (burst ? 1.4 : w.speed) + (Math.random() - 0.5) * (burst ? 2.4 : 0.3);
    S.vz[i] = w.dz * (burst ? 1.4 : w.speed) + (Math.random() - 0.5) * (burst ? 2.4 : 0.3);
    S.vy[i] = up; S.grav[i] = burst ? 9 : 3; S.drag[i] = 0.6; S.fade[i] = 0.5;
    S.flags[i] = burst ? FX_DIE_IN_FLUID : 0;
  }
}

// the top of the ground a breaking crest washes over at (x, z): a whole y, or -1 for a wall, a cliff or more water
function _waveTop(x, z, Y) {
  for (let y = Y + 3; y >= Y - 1; y--) {
    const v = getBlock(x, y, z), id = v & 255;
    if (id === B.WATER) return -1;
    if (CORE.solidVal(v)) return y === Y + 3 ? -1 : y + 1;
  }
  return -1;
}
/* The beach a breaking crest runs up, wet for a while (wetMark, seasons/wetness.js): along all of it, the first few dry
   columns past the water, more for a bigger crest. */
function _waveWash(w, Y) {
  if (typeof wetMark !== 'function') return;
  const reach = 2 + Math.round(1.5 * Math.min(2, w.size)), px = -w.dz, pz = w.dx;
  for (let t = -w.half; t <= w.half; t += 0.7) {
    let land = 0;
    for (let s = 0; s <= reach + 3 && land < reach; s++) {
      const x = Math.floor(w.x + px * t + w.dx * s), z = Math.floor(w.z + pz * t + w.dz * s);
      if (_seaAt(x, z, Y)) continue;                // still the sea
      const top = _waveTop(x, z, Y);
      if (top < 0) break;
      wetMark(x, z, top, 1 - 0.15 * land);
      land++;
    }
  }
}
// a crest breaking on the shore: spray all along it, the beach it washes over wet, and the wash of it near a player
function _waveBreak(w, Y) {
  _waveFoam(w, Y, 0, true);
  _waveWash(w, Y);
  if (typeof playSound === 'function')
    playSound('swim', { gain: Math.min(0.9, 0.25 + 0.3 * w.size), rate: 0.5 + Math.random() * 0.15, pitch: true,
                        pos: { x: w.x, y: Y + 1, z: w.z } });
}

// crest w's swell into the mesh as crest number n: its pieces along it, its rows across it
function _waveDraw(w, n, Y, dt) {
  const H = _waveH(w), Ln = _waveLen(w), L = typeof _fxLight === 'function' ? _fxLight(w.x, Y + 1.5, w.z) : 1;
  const fadeIn = Math.min(1, w.age / 1.2) * (w.brk ? w.brk / WAVE_BREAK_S : 1);
  const lip = w.brk ? (1 - w.brk / WAVE_BREAK_S) * 0.8 : 0;     // a breaking crest's top runs on ahead
  const px = -w.dz, pz = w.dx, base = Y + 0.86, ease = Math.min(1, dt * 5);
  let vp = n * _WAVE_VERTS * 3, vc = n * _WAVE_VERTS * 4;
  // how fast it rolls on until the next step (a breaking crest is slowed): the shader moves it by that (_waveMeshMake)
  const sp = w.speed * (w.brk ? 0.3 : 1), vx = w.dx * sp, vz = w.dz * sp;
  for (let k = n * _WAVE_VERTS * 2, e = k + _WAVE_VERTS * 2; k < e; k += 2) { _waveVel[k] = vx; _waveVel[k + 1] = vz; }
  for (let r = 0; r < WAVE_ROWS.length; r++) {
    const [along, hk, ak, foam] = WAVE_ROWS[r];
    const a = along * Ln + (r === 2 || r === 3 ? lip : 0);
    const cr = (WAVE_SEA_RGB[0] + (WAVE_FOAM_RGB[0] - WAVE_SEA_RGB[0]) * foam) * L;
    const cg = (WAVE_SEA_RGB[1] + (WAVE_FOAM_RGB[1] - WAVE_SEA_RGB[1]) * foam) * L;
    const cb = (WAVE_SEA_RGB[2] + (WAVE_FOAM_RGB[2] - WAVE_SEA_RGB[2]) * foam) * L;
    for (let k = 0; k < _WAVE_COLS; k++) {
      if (r === 0) w.vis[k] += ((_waveColSea(w, k, Y) ? 1 : 0) - w.vis[k]) * ease;   // the shore ends it gently
      const t = k / WAVE_SEG, across = (t * 2 - 1) * w.half;
      const e = Math.sqrt(Math.sin(Math.PI * t)) * w.vis[k];                       // its two ends taper away
      _wavePos[vp++] = w.x + px * across + w.dx * a;
      _wavePos[vp++] = base + hk * H * e;
      _wavePos[vp++] = w.z + pz * across + w.dz * a;
      _waveCol[vc++] = cr; _waveCol[vc++] = cg; _waveCol[vc++] = cb;
      _waveCol[vc++] = ak * e * fadeIn;
    }
  }
}

/* Per frame, from frame() (22-main-loop.js): the waves step SIM_DT at a time, as many steps as the time since holds (at
   most 3: a longer gap is dropped), and between steps only the time since the last goes to the shader (_waveMeshMake). */
function updateWaves(dt) {
  if ((typeof menuScene !== 'undefined' && menuScene) || typeof PLAYERS === 'undefined') {
    WAVES.length = 0;
    if (_waveMesh) _waveMesh.visible = false;
    return;
  }
  _waveAcc += dt;
  let n = 0;
  while (_waveAcc >= SIM_DT && n < 3) { _waveStep(SIM_DT); _waveAcc -= SIM_DT; n++; }
  if (n === 3) _waveAcc = Math.min(_waveAcc, SIM_DT);
  if (n) _waveUpload(n * SIM_DT);
  if (_waveMesh) _waveMesh.material.uniforms.uSince.value = _waveAcc;
}
// one step: new crests near each player on their own clock, every crest moved on, its foam blown, and the ones that
// reached the shore broken and let fall in
function _waveStep(dt) {
  const Y = _seaY();
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || Math.abs(p.pos.y - Y) > 40) continue;
    p._waveT = (p._waveT ?? Math.random() * 2) - dt * _waveRough(p.pos.x, p.pos.z);
    if (p._waveT > 0) continue;
    p._waveT = WAVE_EVERY[0] + Math.random() * (WAVE_EVERY[1] - WAVE_EVERY[0]);
    if (WAVES.length < WAVE_MAX) _waveSpawn(p, Y);
  }
  for (let i = WAVES.length - 1; i >= 0; i--) {
    const w = WAVES[i];
    w.age += dt;
    if (w.brk) {                                   // falling in on the shore, slowed
      w.x += w.dx * w.speed * 0.3 * dt; w.z += w.dz * w.speed * 0.3 * dt;
      if ((w.brk -= dt) <= 0) WAVES.splice(i, 1);
      continue;
    }
    w.x += w.dx * w.speed * dt; w.z += w.dz * w.speed * dt; w.left -= dt;
    const ahead = !_seaAt(Math.floor(w.x + w.dx * 1.2), Math.floor(w.z + w.dz * 1.2), Y);
    if (ahead) { _waveBreak(w, Y); w.brk = WAVE_BREAK_S; continue; }
    if (w.left <= 0) { WAVES.splice(i, 1); continue; }
    _waveFoam(w, Y, dt, false);
  }
}
// the crests as they stand after the steps (dt: the time the steps took, for the shore's easing) to the card
function _waveUpload(dt) {
  if (!WAVES.length) { if (_waveMesh) _waveMesh.visible = false; return; }
  if (!_waveMesh) { if (typeof THREE === 'undefined' || typeof scene === 'undefined') return; _waveMeshMake(); }
  const Y = _seaY();
  for (let n = 0; n < WAVES.length; n++) _waveDraw(WAVES[n], n, Y, dt);
  const g = _waveMesh.geometry, ap = g.attributes.position, ac = g.attributes.aColor, av = g.attributes.aVel;
  ap.clearUpdateRanges(); ap.addUpdateRange(0, WAVES.length * _WAVE_VERTS * 3); ap.needsUpdate = true;
  ac.clearUpdateRanges(); ac.addUpdateRange(0, WAVES.length * _WAVE_VERTS * 4); ac.needsUpdate = true;
  av.clearUpdateRanges(); av.addUpdateRange(0, WAVES.length * _WAVE_VERTS * 2); av.needsUpdate = true;
  g.setDrawRange(0, WAVES.length * _WAVE_TRIS);
  _waveMesh.visible = true;
}

/* The crests' push at a water cell, added into `out` (waterFlowVec's vector): toward the shore, strongest at the crest's
   front and with its size. True when any crest pushes here. A crest falling in on the shore pushes no more. */
function wavePush(x, y, z, out) {
  if (!WAVES.length) return false;
  const Y = _seaY();
  if (y < Y - 2 || y > Y + 1) return false;
  let any = false;
  for (const w of WAVES) {
    if (w.brk) continue;
    const rx = x + 0.5 - w.x, rz = z + 0.5 - w.z;
    const along = rx * w.dx + rz * w.dz, across = rx * -w.dz + rz * w.dx;
    if (Math.abs(along) > WAVE_BAND || Math.abs(across) > w.half) continue;
    const k = (1 - Math.abs(along) / WAVE_BAND) * w.size * WAVE_PUSH;
    out.x += w.dx * k; out.z += w.dz * k;
    any = true;
  }
  return any;
}
