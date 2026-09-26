'use strict';
/* voxiGrof — particles (0.8; water, fireflies, butterflies, falling leaves, arrow trails, TNT, puffs 0.803)

   THREE BATCHES, THREE DRAW CALLS, WHATEVER IS ON SCREEN
   ------------------------------------------------------
     bits    block fragments, cut from the block atlas itself: breaking, mining, leaves, snow, steps.
             Alpha-tested and depth-written, so they sort against the world like tiny blocks.
     sprites everything drawn: smoke, flame, embers, hearts, sparkles, Zzz, droplets, bubbles, dust.
             A small pixel-art sheet made below at load, tinted per particle, alpha-blended.
     decals  footprints: flat quads lying on the ground, fading out after a few seconds.
   Bits and sprites are THREE.Points — one camera-facing square each, sized in world units by the
   shader — so a thousand particles are one buffer upload and one draw each, not a thousand objects.

   THE BUDGETS (phones are the constraint)
   ---------------------------------------
   - Every pool has a hard cap and never grows. Storage is struct-of-arrays in typed arrays, dead
     particles are swap-removed, and only the live range is uploaded to the GPU each frame.
   - At most FX_SPAWN_BUDGET new particles a frame, all kinds together: a TNT blast or a big splash
     can never stall a frame, it just looks a little thinner.
   - Nothing is emitted farther than FX_RANGE from the nearest player.
   - The menu's "particles" setting scales every count (all / fewer / off); a LOW texture tier (phones)
     also halves the pools and the counts.

   SPLIT SCREEN
   ------------
   The batches are in the scene once and every viewport draws them. A particle can carry an OWNER
   (a player): it is then skipped in that player's own first-person view, and still seen by everyone
   else and by the owner in third person — so your own damage hearts do not burst in your face. The
   check is one uniform set per viewport in onBeforeRender, where `player` is the seat being drawn.

   THE HOOKS, for the next person adding an effect: every emitter is an fx* function below, called from
   where the thing happens (22-main-loop for breaking, 26-furnace, 19-vitals, 28-entities, ...), each
   guarded with typeof so this file can be left out. Ambient effects (lava, dust under floating sand)
   come from _fxAmbient, which samples random cells around each player every frame — the same trick
   Minecraft uses — so their cost is fixed however much lava or sand is loaded. */

const FX_RANGE = 48;                   // blocks from the nearest player
const FX_SPAWN_BUDGET = 240;           // new particles per frame, every kind together
const FX_AMB_RADIUS = 12, FX_AMB_SAMPLES = 110;   // ambient cells sampled per frame (per 60 fps frame)
const FX_LOW = typeof atlasTilePx === 'function' && atlasTilePx() < ART_PX;   // the phone texture tier
let _fxQuality = (() => { try { return localStorage.getItem('vg_fx') || 'all'; } catch { return 'all'; } })();
let _fxScale = 1, _fxBudget = FX_SPAWN_BUDGET;
function _fxApplyQuality() {
  _fxScale = (_fxQuality === 'off' ? 0 : _fxQuality === 'fewer' ? 0.5 : 1) * (FX_LOW ? 0.6 : 1);
}
_fxApplyQuality();
// how many of `n` particles to actually make at this quality — never zero unless particles are off
const _fxN = (n) => (_fxScale <= 0 ? 0 : Math.max(1, Math.round(n * _fxScale)));
const _rnd = (a, b) => a + Math.random() * (b - a);

// per-particle behaviour bits. HANG: no gravity until `phase` seconds old (a drip gathering).
// POP: dies the moment it lands instead of lying there.
const FX_COLLIDE = 1, FX_REST = 2, FX_FADEIN = 4, FX_IN_WATER = 8, FX_DIE_IN_FLUID = 16, FX_BOUNCE = 32,
      FX_HANG = 64, FX_POP = 128, FX_FLAP = 256;   // FLAP: swaps between the two butterfly frames (0.803)

/* ---------------------------------- the sprite sheet ----------------------------------
   8x8 cells of 16 px, drawn in white and greys so the per-particle colour tints them. Pixel art to sit
   with the block textures; nearest filtering keeps it crisp. */
const FXS = { SMOKE_L: 0, SMOKE_M: 1, SMOKE_S: 2, SPARK: 3, STAR: 4, HEART: 5, Z: 6, DROP: 7,
              BUBBLE: 8, FLAME: 9, DUST: 10, BOOT: 11, HOOF: 12, EMBER: 13, BUTTERFLY: 14, BUTTERFLY2: 15 };
const _fxSheet = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const at = (cell) => [(cell % 8) * 16, ((cell / 8) | 0) * 16];
  const px = (cell, x, y, v, a = 1) => {
    const [ox, oy] = at(cell);
    const k = Math.round(v * 255);
    g.fillStyle = `rgba(${k},${k},${k},${a})`;
    g.fillRect(ox + x, oy + y, 1, 1);
  };
  // a map of rows: X white, o light grey, # dark outline, : half-transparent white
  const map = (cell, rows) => {
    const h = rows.length, w = rows[0].length, x0 = (16 - w) >> 1, y0 = (16 - h) >> 1;
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === 'X') px(cell, x0 + x, y0 + y, 1);
      else if (ch === 'o') px(cell, x0 + x, y0 + y, 0.78);
      else if (ch === '#') px(cell, x0 + x, y0 + y, 0.42);
      else if (ch === ':') px(cell, x0 + x, y0 + y, 1, 0.5);
    }));
  };
  // smoke: stepped pixel discs, a solid core and a see-through rim, with a few light flecks
  const disc = (cell, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < r - 1.6) px(cell, x, y, ((x * 7 + y * 3) % 5 === 0) ? 1 : 0.86, 0.9);
      else if (d < r) px(cell, x, y, 0.8, 0.45);
    }
  };
  disc(FXS.SMOKE_L, 7.5); disc(FXS.SMOKE_M, 5.5); disc(FXS.SMOKE_S, 3.6);
  map(FXS.SPARK, ['.X.', 'XXX', '.X.']);
  map(FXS.STAR, ['...X...', '...X...', '..XoX..', 'XXoXoXX', '..XoX..', '...X...', '...X...']);
  map(FXS.HEART, ['.##...##.', '#XX#.#oX#', '#XXX#XXo#', '#XXXXXXX#', '.#XXXXX#.', '..#XXX#..', '...#X#...', '....#....']);
  map(FXS.Z, ['XXXXXXX', 'XXXXXXX', '....XX.', '...XX..', '..XX...', '.XX....', 'XXXXXXX', 'XXXXXXX']);
  map(FXS.DROP, ['..X..', '..X..', '.XXX.', 'XXXXX', 'XXoXX', 'XXXXX', '.XXX.']);
  map(FXS.BUBBLE, ['.XXXX.', 'X...:X', 'X....X', 'X....X', 'X....X', '.XXXX.']);
  map(FXS.FLAME, ['...X...', '..XX...', '..XXX..', '.XXoX..', '.XooXX.', 'XXooXXX', 'XooooXX', 'XXooXX.', '.XXXX..']);
  map(FXS.DUST, ['XXX', 'XXX', 'XXX']);
  map(FXS.BOOT, ['.XXXX.', 'XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX', '.XXXX.', '......', '......',
                 '.XXXX.', 'XXXXXX', 'XXXXXX', 'XXXXXX', '.XXXX.']);
  map(FXS.HOOF, ['.XX..XX.', 'XXX..XXX', 'XXX..XXX', 'XXX..XXX', 'XX....XX', '.X....X.']);
  map(FXS.EMBER, ['XX', 'XX']);
  // a butterfly, wings open and wings half closed: the two frames it flaps between (0.803)
  map(FXS.BUTTERFLY,  ['XX...XX', 'XXX.XXX', 'XoX#XoX', '.XX#XX.', '.oX#Xo.', 'XX.#.XX', 'X.....X']);
  map(FXS.BUTTERFLY2, ['.X...X.', '.XX.XX.', '.oX#Xo.', '..X#X..', '..X#X..', '.X.#.X.']);
  const tex = new THREE.CanvasTexture(c);          // default colour space: raw, like the atlas
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
})();
const _FX_INSET = 0.25 / 128;                        // keeps a cell from bleeding into its neighbour
function _fxCellRect(cell) {
  const u = (cell % 8) / 8, v = 1 - (((cell / 8) | 0) + 1) / 8;
  return [u + _FX_INSET, v + _FX_INSET, 1 / 8 - 2 * _FX_INSET, 1 / 8 - 2 * _FX_INSET];
}

/* ---------------------------------- the point batches ---------------------------------- */
const _FX_VSH = `
  attribute float aSize;
  attribute vec4 aColor;
  attribute vec4 aRect;
  attribute float aOwner;
  uniform float uScale;
  uniform float uHide;
  uniform float uOnly;
  uniform float uMaxPt;
  varying vec4 vColor;
  varying vec4 vRect;
  void main() {
    // the world pools skip an owner's particle in that owner's first-person view; the hand pool (uOnly)
    // shows each seat only its own
    bool mine = abs(aOwner - uHide) < 0.5;
    if (uOnly > 0.5 ? !mine : (aOwner > 0.5 && mine)) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return;
    }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uMaxPt, aSize * uScale / max(0.05, -mv.z));
    vColor = aColor; vRect = aRect;
  }`;
const _FX_FSH = `
  #ifdef ARRAY
  uniform highp sampler2DArray map;
  #else
  uniform sampler2D map;
  #endif
  varying vec4 vColor;
  varying vec4 vRect;
  void main() {
  #ifdef ARRAY
    // a bit of a block: the whole part of the rect's u is the texture-array layer (0.809)
    float layer = floor(vRect.x);
    vec4 tex = texture(map, vec3(vec2(vRect.x - layer, vRect.y) + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * vRect.zw, layer));
  #else
    vec4 tex = texture2D(map, vRect.xy + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * vRect.zw);
  #endif
  #ifdef CUTOUT
    if (tex.a < 0.5) discard;
    gl_FragColor = vec4(tex.rgb * vColor.rgb, 1.0);
  #else
    float a = tex.a * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(tex.rgb * vColor.rgb, a);
  #endif
  }`;
const _fxVP = new THREE.Vector4();
const _fxMaxPt = (() => {
  try { const gl = renderer.getContext(); return Math.min(160, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64); }
  catch { return 64; }
})();
// which owner id a player has: its place in PLAYERS, from 1 (0 = nobody's)
const fxOwner = (p) => (typeof PLAYERS !== 'undefined' ? PLAYERS.indexOf(p) + 1 : 1);

class FxPool {
  /* `target` is the scene it draws in; `onlyOwner` makes it the first-person hand pool (0.801): drawn
     with the hand, in the hand scene's space, and each seat sees only the particles it owns. */
  constructor(max, cutout, mapFn, target = scene, onlyOwner = false, array = false) {
    this.max = max; this.n = 0; this.staticDirty = false;
    const F = (k) => new Float32Array(max * k);
    this.x = F(1); this.y = F(1); this.z = F(1); this.vx = F(1); this.vy = F(1); this.vz = F(1);
    this.age = F(1); this.life = F(1); this.s0 = F(1); this.s1 = F(1); this.grav = F(1); this.drag = F(1);
    this.r = F(1); this.g = F(1); this.b = F(1); this.a = F(1); this.fade = F(1); this.sway = F(1); this.phase = F(1);
    this.flags = new Uint16Array(max);
    this.pos = F(3); this.col = F(4); this.rect = F(4); this.size = F(1); this.own = F(1);
    // every one-per-particle array, for the swap in kill() — listed once, never rebuilt
    this._one = [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.age, this.life, this.s0, this.s1,
                 this.grav, this.drag, this.r, this.g, this.b, this.a, this.fade, this.sway, this.phase,
                 this.flags, this.own, this.size];
    const geo = new THREE.BufferGeometry();
    const attr = (arr, k) => { const a = new THREE.BufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); return a; };
    geo.setAttribute('position', this.aPos = attr(this.pos, 3));
    geo.setAttribute('aColor', this.aCol = attr(this.col, 4));
    geo.setAttribute('aRect', this.aRect = attr(this.rect, 4));
    geo.setAttribute('aSize', this.aSize = attr(this.size, 1));
    geo.setAttribute('aOwner', this.aOwn = attr(this.own, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: mapFn() }, uScale: { value: 600 }, uHide: { value: 0 },
                  uOnly: { value: onlyOwner ? 1 : 0 }, uMaxPt: { value: _fxMaxPt } },
      vertexShader: _FX_VSH, fragmentShader: _FX_FSH,
      defines: { ...(cutout ? { CUTOUT: 1 } : {}), ...(array ? { ARRAY: 1 } : {}) },   // ARRAY: samples the block textures (0.809)
      transparent: !cutout, depthWrite: !!cutout,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.layers.set(1);                       // the no-shadow layer every camera draws
    this.points.renderOrder = cutout ? 0 : 6;
    this.points.onBeforeRender = (r, s, cam) => {
      const u = this.mat.uniforms;
      u.map.value = mapFn();                         // the atlas is swapped when texture quality changes
      r.getCurrentViewport(_fxVP);
      u.uScale.value = _fxVP.w / (2 * Math.tan(cam.fov * Math.PI / 360));
      const me = typeof player !== 'undefined' && player ? fxOwner(player) : 0;
      u.uHide.value = onlyOwner ? me : (me && !player._bodyVisibleToSelf ? me : 0);
    };
    target.add(this.points);
  }
  /* A new particle at (x, y, z) living `life` seconds, with every other field reset; the caller sets
     what it needs straight into the arrays. -1 when the pool or this frame's budget is spent. */
  add(x, y, z, life) {
    if (this.n >= this.max || _fxBudget <= 0) return -1;
    _fxBudget--;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.age[i] = 0; this.life[i] = life;
    this.s0[i] = this.s1[i] = 0.1; this.grav[i] = 0; this.drag[i] = 0;
    this.r[i] = this.g[i] = this.b[i] = 1; this.a[i] = 1; this.fade[i] = 0.3;
    this.sway[i] = 0; this.phase[i] = Math.random() * 6.283; this.flags[i] = 0;
    this.own[i] = 0;
    this.staticDirty = true;
    return i;
  }
  setRect(i, u, v, du, dv) { const o = i * 4; this.rect[o] = u; this.rect[o + 1] = v; this.rect[o + 2] = du; this.rect[o + 3] = dv; }
  color(i, r, g, b, a = 1) { this.r[i] = r; this.g[i] = g; this.b[i] = b; this.a[i] = a; }
  // swap-remove: the last particle takes this one's place
  kill(i) {
    const j = --this.n;
    if (i !== j) {
      const A = this._one;
      for (let k = 0; k < A.length; k++) A[k][i] = A[k][j];
      const o = i * 4, p = j * 4;
      this.rect[o] = this.rect[p]; this.rect[o + 1] = this.rect[p + 1]; this.rect[o + 2] = this.rect[p + 2]; this.rect[o + 3] = this.rect[p + 3];
    }
    this.staticDirty = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      const age = (this.age[i] += dt), life = this.life[i];
      if (age >= life) { this.kill(i); continue; }
      let f = this.flags[i];
      let vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
      let x = this.x[i], y = this.y[i], z = this.z[i];
      if (!(f & FX_REST)) {
        if (!(f & FX_HANG) || age >= this.phase[i]) vy -= this.grav[i] * dt;
        const d = this.drag[i];
        if (d) { const k = Math.max(0, 1 - d * dt); vx *= k; vy *= k; vz *= k; }
        let nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
        const sw = this.sway[i];
        if (sw) { const p = this.phase[i] + age * 2.4; nx += Math.cos(p) * sw * dt; nz += Math.sin(p * 0.8) * sw * dt; }
        if (f & FX_COLLIDE) {
          const bx = Math.floor(nx), bz = Math.floor(nz);
          if (vy < 0 && _fxSolid(bx, Math.floor(ny - 0.03), bz)) {
            if (f & FX_POP) { this.kill(i); continue; }
            ny = Math.floor(ny - 0.03) + 1.03;
            if ((f & FX_BOUNCE) && vy < -2) vy *= -0.3;
            else { vy = 0; f |= FX_REST; this.flags[i] = f; }
            vx *= 0.4; vz *= 0.4;
          } else if (_fxSolid(bx, Math.floor(ny), bz)) { nx = x; nz = z; vx = vz = 0; }
        }
        if (f & (FX_IN_WATER | FX_DIE_IN_FLUID)) {
          const inW = _fxFluidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz));
          if (((f & FX_IN_WATER) && !inW) || ((f & FX_DIE_IN_FLUID) && inW && vy < 0)) { this.kill(i); continue; }
        }
        x = nx; y = ny; z = nz;
        this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      }
      const t = age / life;
      const o3 = i * 3, o4 = i * 4;
      this.pos[o3] = x; this.pos[o3 + 1] = y; this.pos[o3 + 2] = z;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      if (f & FX_FLAP) {
        const r = ((age * 9 + this.phase[i]) | 0) & 1 ? _R.BUTTERFLY2 : _R.BUTTERFLY;
        if (this.rect[o4] !== r[0]) { this.rect.set(r, o4); this.staticDirty = true; }
      }
      let al = this.a[i];
      const fo = this.fade[i];
      if (fo > 0 && t > 1 - fo) al *= (1 - t) / fo;
      if ((f & FX_FADEIN) && t < 0.12) al *= t / 0.12;
      this.col[o4] = this.r[i]; this.col[o4 + 1] = this.g[i]; this.col[o4 + 2] = this.b[i]; this.col[o4 + 3] = al;
      i++;
    }
    const n = this.n;
    this.geo.setDrawRange(0, n);
    if (!n) return;
    const up = (a, k) => { a.clearUpdateRanges(); a.addUpdateRange(0, n * k); a.needsUpdate = true; };
    up(this.aPos, 3); up(this.aCol, 4); up(this.aSize, 1);
    if (this.staticDirty) { up(this.aRect, 4); up(this.aOwn, 1); this.staticDirty = false; }
  }
}

/* ---------------------------------- footprints ---------------------------------- */
const _FX_DECAL_VSH = `
  attribute vec4 aColor;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() { vUv = uv; vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const _FX_DECAL_FSH = `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    if (vColor.a < 0.01 || texture2D(map, vUv).a < 0.5) discard;
    gl_FragColor = vColor;
  }`;
class FxDecals {
  constructor(max) {
    this.max = max; this.head = 0; this.live = 0;
    this.age = new Float32Array(max).fill(1e9); this.life = new Float32Array(max).fill(1);
    this.base = new Float32Array(max * 4);
    this.pos = new Float32Array(max * 12); this.uv = new Float32Array(max * 8); this.col = new Float32Array(max * 16);
    const idx = new Uint16Array(max * 6);
    for (let q = 0; q < max; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', this.aUv = new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: _fxSheet } }, vertexShader: _FX_DECAL_VSH, fragmentShader: _FX_DECAL_FSH,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1);
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  // a print at (x, y, z) facing (fx, fz), `w` wide and `l` long, in colour rgba
  add(x, y, z, fx, fz, w, l, cell, r, g, b, a, life) {
    const q = this.head; this.head = (this.head + 1) % this.max;
    const sx = -fz, sz = fx, hw = w / 2, hl = l / 2;
    const P = this.pos, o = q * 12;
    const put = (k, u, v) => { P[o + k * 3] = x + sx * u + fx * v; P[o + k * 3 + 1] = y; P[o + k * 3 + 2] = z + sz * u + fz * v; };
    put(0, -hw, -hl); put(1, hw, -hl); put(2, hw, hl); put(3, -hw, hl);
    const [u0, v0, du, dv] = _fxCellRect(cell), U = this.uv, ou = q * 8;
    U[ou] = u0; U[ou + 1] = v0; U[ou + 2] = u0 + du; U[ou + 3] = v0;
    U[ou + 4] = u0 + du; U[ou + 5] = v0 + dv; U[ou + 6] = u0; U[ou + 7] = v0 + dv;
    this.base.set([r, g, b, a], q * 4);
    this.age[q] = 0; this.life[q] = life;
    this.aPos.needsUpdate = true; this.aUv.needsUpdate = true;
  }
  clear() { this.age.fill(1e9); this.col.fill(0); this.aCol.needsUpdate = true; }
  update(dt) {
    let any = false;
    for (let q = 0; q < this.max; q++) {
      if (this.age[q] >= 1e8) continue;
      const age = (this.age[q] += dt), life = this.life[q];
      let a = 0;
      if (age < life) { const t = age / life; a = this.base[q * 4 + 3] * (t < 0.55 ? 1 : (1 - t) / 0.45); }
      else this.age[q] = 1e9;
      const o = q * 16;
      for (let k = 0; k < 4; k++) {
        this.col[o + k * 4] = this.base[q * 4]; this.col[o + k * 4 + 1] = this.base[q * 4 + 1];
        this.col[o + k * 4 + 2] = this.base[q * 4 + 2]; this.col[o + k * 4 + 3] = a;
      }
      any = true;
    }
    if (any) this.aCol.needsUpdate = true;
  }
}

/* ---------------------------------- the pools ---------------------------------- */
const FX = {
  bits:    new FxPool(FX_LOW ? 500 : 1200, true, () => sharedUniforms.map.value, scene, false, true),
  sprites: new FxPool(FX_LOW ? 700 : 1600, false, () => _fxSheet),
  decals:  new FxDecals(FX_LOW ? 64 : 160),
  // what the first-person hand holds: a torch's flame, a gem's glint, crumbs while eating (0.801)
  hand:    new FxPool(FX_LOW ? 80 : 160, false, () => _fxSheet, handScene, true),
};

/* ---------------------------------- helpers ---------------------------------- */
function _fxSolid(x, y, z) {
  const v = getBlock(x, y, z);
  return v !== 0 && (CORE.solidVal(v) || !!PROPS[v & 255]?.opaque);
}
function _fxFluidAt(x, y, z) {
  const id = getBlock(x, y, z) & 255;
  return id === B.WATER || id === B.LAVA;
}
function _fxNear(x, y, z) {
  if (typeof nearestPlayerTo !== 'function') return true;
  const p = nearestPlayerTo(x, z);
  if (!p) return false;
  const dx = p.pos.x - x, dy = p.pos.y - y, dz = p.pos.z - z;
  return dx * dx + dy * dy + dz * dz < FX_RANGE * FX_RANGE;
}
// light at a point, the way the world shader lights a face (28-entities.js)
const _fxLight = (x, y, z) => (typeof _lightAt === 'function' ? _lightAt(x, y, z) : 1);
// a random square, `frac` of its side, out of the visible centre of an atlas tile, onto particle i
function _fxTileRect(pool, i, tile, frac) {
  // u carries the layer in its whole part: the square sits inside [0,1) of layer `tile` (0.809)
  const s = Math.min(0.999, frac);
  pool.setRect(i, tile + Math.random() * (1 - s), Math.random() * (1 - s), s, s);
}
// a grass top is stored grey and tinted in the shader; a bit of it is tinted the same way
function _fxTileTint(tile) {
  const u = sharedUniforms;
  return (u.uTintTile && u.uTintTile.value >= 0 && Math.abs(tile - u.uTintTile.value) < 0.5) ? u.uTintColor.value : null;
}
/* The average colour of a block or item, for dust (mortar powder, dust under floating sand). Read once
   from its texture into an 8x8 canvas and cached; grey until the art has loaded. */
const _fxColors = new Map();
const _fxColCanvas = document.createElement('canvas');
_fxColCanvas.width = _fxColCanvas.height = 8;
function _fxColorOf(id) {
  if (_fxColors.has(id)) return _fxColors.get(id);
  let img = null;
  if (id < 256) { const t = PROPS[id]?.faces?.[0]; if (t != null) img = IMAGES[ATLAS_TILES[t]]; }
  else img = IMAGES[ITEM_PROPS[id]?.icon];
  if (!img) return [0.7, 0.7, 0.7];
  let out = [0.7, 0.7, 0.7];
  try {
    const g = _fxColCanvas.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, 8, 8);
    g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let r = 0, gg = 0, b = 0, w = 0;
    for (let k = 0; k < d.length; k += 4) { const a = d[k + 3] / 255; r += d[k] * a; gg += d[k + 1] * a; b += d[k + 2] * a; w += a; }
    if (w > 0) out = [r / w / 255, gg / w / 255, b / w / 255];
  } catch { /* a tainted or not-yet-decoded image: keep the grey */ }
  _fxColors.set(id, out);
  return out;
}

/* ---------------------------------- block bits ---------------------------------- */
// one fragment of `id` at (x, y, z), `frac` of a tile across, lit `L`
function _fxBit(id, x, y, z, life, size, L, frac = 0.25) {
  const p = PROPS[id];
  if (!p || !p.faces || !p.faces.length) return -1;
  const i = FX.bits.add(x, y, z, life);
  if (i < 0) return -1;
  const tile = p.faces[(Math.random() * p.faces.length) | 0];
  _fxTileRect(FX.bits, i, tile, p.model === 'cross' ? 0.4 : frac);
  const t = _fxTileTint(tile), k = L * _rnd(0.82, 1);
  FX.bits.color(i, (t ? t.r : 1) * k, (t ? t.g : 1) * k, (t ? t.b : 1) * k);
  FX.bits.s0[i] = size; FX.bits.s1[i] = size * 0.35;
  FX.bits.fade[i] = 0;
  return i;
}
/* A block broken: a burst of its own texture, thrown out of the cell (0.8). Plants give fewer. */
function fxBreak(x, y, z, val) {
  if (_fxScale <= 0 || !_fxNear(x + 0.5, y + 0.5, z + 0.5)) return;
  const id = val & 255, p = PROPS[id];
  if (!p || !p.faces) return;
  const L = _fxLight(x + 0.5, y + 0.5, z + 0.5);
  if (_fxPlantBurst(x, y, z, val, L)) return;   // grass, wheat, a bush: its colours, as when foraged (0.804)
  const n = _fxN(p.model === 'cross' ? 8 : 18);
  for (let k = 0; k < n; k++) {
    const px = x + _rnd(0.12, 0.88), py = y + _rnd(0.12, 0.88), pz = z + _rnd(0.12, 0.88);
    const i = _fxBit(id, px, py, pz, _rnd(0.5, 1.1), _rnd(0.08, 0.14), L);
    if (i < 0) return;
    FX.bits.vx[i] = (px - x - 0.5) * 3.2 + _rnd(-0.4, 0.4);
    FX.bits.vy[i] = _rnd(1.5, 3.8);
    FX.bits.vz[i] = (pz - z - 0.5) * 3.2 + _rnd(-0.4, 0.4);
    FX.bits.grav[i] = 16; FX.bits.drag[i] = 0.4;
    FX.bits.flags[i] = FX_COLLIDE;
  }
}
/* A swing that bites into a block while mining: a couple of chips off the face you hit (0.8). */
function fxHit(x, y, z, val, nx = 0, ny = 1, nz = 0) {
  if (_fxScale <= 0 || !_fxNear(x + 0.5, y + 0.5, z + 0.5)) return;
  const id = val & 255;
  const L = _fxLight(x + 0.5 + nx, y + 0.5 + ny, z + 0.5 + nz);
  for (let k = 0, n = _fxN(3); k < n; k++) {
    // a point on the hit face: the normal axis at the face, the other two anywhere across it
    const px = x + (nx ? (nx > 0 ? 1.03 : -0.03) : _rnd(0.15, 0.85));
    const py = y + (ny ? (ny > 0 ? 1.03 : -0.03) : _rnd(0.15, 0.85));
    const pz = z + (nz ? (nz > 0 ? 1.03 : -0.03) : _rnd(0.15, 0.85));
    const i = _fxBit(id, px, py, pz, _rnd(0.35, 0.6), _rnd(0.06, 0.09), L);
    if (i < 0) return;
    FX.bits.vx[i] = nx * 1.3 + _rnd(-0.7, 0.7);
    FX.bits.vy[i] = ny * 1.3 + _rnd(0.4, 1.6);
    FX.bits.vz[i] = nz * 1.3 + _rnd(-0.7, 0.7);
    FX.bits.grav[i] = 14; FX.bits.flags[i] = FX_COLLIDE;
  }
}
/* A leaf that decayed: a few leaf bits flutter down with it (0.8). */
function fxLeafDecay(x, y, z, id) {
  if (_fxScale <= 0 || !_fxNear(x + 0.5, y + 0.5, z + 0.5)) return;
  const L = _fxLight(x + 0.5, y + 0.5, z + 0.5);
  for (let k = 0, n = _fxN(5); k < n; k++) {
    const i = _fxBit(id, x + _rnd(0.1, 0.9), y + _rnd(0.1, 0.9), z + _rnd(0.1, 0.9), _rnd(2, 3.4), _rnd(0.09, 0.12), L, 0.3);
    if (i < 0) return;
    FX.bits.vy[i] = _rnd(-0.2, 0.3);
    FX.bits.grav[i] = 1.6; FX.bits.drag[i] = 1.4; FX.bits.sway[i] = _rnd(0.5, 1.1);
    FX.bits.s1[i] = FX.bits.s0[i] * 0.8;
    FX.bits.flags[i] = FX_COLLIDE;
  }
}
/* A snow layer that melted: a few flakes and drips (0.8). */
function fxSnowMelt(x, y, z) {
  if (_fxScale <= 0 || !_fxNear(x + 0.5, y + 0.5, z + 0.5)) return;
  const L = _fxLight(x + 0.5, y + 0.5, z + 0.5);
  for (let k = 0, n = _fxN(3); k < n; k++) {
    const i = _fxBit(B.SNOW, x + _rnd(0.1, 0.9), y + _rnd(0.05, 0.3), z + _rnd(0.1, 0.9), _rnd(0.8, 1.3), 0.07, L);
    if (i < 0) break;
    FX.bits.vy[i] = _rnd(0.3, 0.8); FX.bits.grav[i] = 3; FX.bits.drag[i] = 1; FX.bits.sway[i] = 0.3;
  }
  for (let k = 0, n = _fxN(2); k < n; k++) _fxDrop(x + _rnd(0.1, 0.9), y + 0.15, z + _rnd(0.1, 0.9), 0, _rnd(0.5, 1), 0, L, 0.6);
}

/* ---------------------------------- sprites ---------------------------------- */
const _R_SMOKE = [_fxCellRect(FXS.SMOKE_L), _fxCellRect(FXS.SMOKE_M), _fxCellRect(FXS.SMOKE_S)];
const _R = {};
for (const k in FXS) _R[k] = _fxCellRect(FXS[k]);
function _fxSprite(cell, x, y, z, life, s0, s1) {
  const i = FX.sprites.add(x, y, z, life);
  if (i < 0) return -1;
  FX.sprites.setRect(i, cell[0], cell[1], cell[2], cell[3]);
  FX.sprites.s0[i] = s0; FX.sprites.s1[i] = s1;
  return i;
}
function _fxSmoke(x, y, z, grey, L, big = 1) {
  const i = _fxSprite(_R_SMOKE[(Math.random() * 2) | 0], x, y, z, _rnd(2.2, 3.4), 0.27 * big, 0.85 * big);   // bigger (0.804)
  if (i < 0) return;
  const S = FX.sprites, k = grey * L;
  S.color(i, k, k, k * 1.02, 0.7);
  S.vx[i] = _rnd(-0.12, 0.12); S.vy[i] = _rnd(0.55, 0.85); S.vz[i] = _rnd(-0.12, 0.12);
  S.grav[i] = -0.12; S.drag[i] = 0.35; S.fade[i] = 0.6; S.flags[i] = FX_FADEIN;
}
function _fxFlame(x, y, z, life = 0.45, size = 0.14) {
  const i = _fxSprite(_R.FLAME, x, y, z, life, size, size * 0.3);
  if (i < 0) return;
  FX.sprites.color(i, 1, _rnd(0.62, 0.82), 0.3);
  FX.sprites.vy[i] = _rnd(0.2, 0.45); FX.sprites.fade[i] = 0.5;
}
function _fxEmber(x, y, z, vx, vy, vz) {
  const i = _fxSprite(_R.EMBER, x, y, z, _rnd(0.9, 1.7), _rnd(0.06, 0.08), 0.025);
  if (i < 0) return;
  const S = FX.sprites;
  S.color(i, 1, _rnd(0.55, 0.85), _rnd(0.1, 0.25));
  S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;
  S.grav[i] = 9; S.drag[i] = 0.25; S.fade[i] = 0.3; S.flags[i] = FX_COLLIDE;
}
function _fxDrop(x, y, z, vx, vy, vz, L, life = 0.9, lava = false) {
  const i = _fxSprite(_R.DROP, x, y, z, life, 0.07, 0.05);
  if (i < 0) return;
  const S = FX.sprites;
  if (lava) S.color(i, 1, 0.55, 0.15, 1);
  else S.color(i, 0.62 * L, 0.78 * L, 1 * L, 0.9);
  S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;
  S.grav[i] = 16; S.drag[i] = 0.3; S.fade[i] = 0.2;
  S.flags[i] = FX_COLLIDE | FX_DIE_IN_FLUID;
}
function _fxDust(x, y, z, rgb, L, life, size) {
  const i = _fxSprite(_R.DUST, x, y, z, life, size, size * 0.7);
  if (i < 0) return -1;
  FX.sprites.color(i, rgb[0] * L, rgb[1] * L, rgb[2] * L, 1);
  FX.sprites.fade[i] = 0.35;
  return i;
}

/* A lit furnace smokes from its top and flickers at its mouth (0.8). Throttled per furnace. */
const _FX_FRONT = [[0, 1], [0, -1], [1, 0], [-1, 0]];   // facing bits -> the front face's direction
function fxFurnace(f, x, y, z, facing, dt) {
  f._fxT = (f._fxT || 0) - dt;
  if (f._fxT > 0 || _fxScale <= 0) return;
  f._fxT = _rnd(0.3, 0.5) / Math.max(0.3, _fxScale);
  if (!_fxNear(x + 0.5, y + 1, z + 0.5)) return;
  // out of the chimney (0.8041)
  _fxSmoke(x + _rnd(0.4, 0.6), y + 1.3, z + _rnd(0.4, 0.6), 0.6, _fxLight(x + 0.5, y + 1.5, z + 0.5));
  // something in the input slot is being fired: embers jump out of the open top (0.803)
  if (f.slots && f.slots[1] && Math.random() < 0.7)
    for (let k = 0, n = 1 + (Math.random() < 0.4); k < n; k++)
      _fxEmber(x + _rnd(0.4, 0.6), y + 1.27, z + _rnd(0.4, 0.6), _rnd(-0.5, 0.5), _rnd(1.8, 3), _rnd(-0.5, 0.5));
  if (Math.random() < 0.55) {
    const [fx, fz] = _FX_FRONT[facing & 3] || _FX_FRONT[0];
    const side = _rnd(-0.25, 0.25);
    _fxFlame(x + 0.5 + fx * 0.53 + fz * side, y + _rnd(0.2, 0.4), z + 0.5 + fz * 0.53 + fx * side, 0.4, 0.12);
  }
}
/* Hearts: red for a hit, green for healing (0.8). `owner` hides them in that player's own first person. */
/* `amt` is the health lost or gained (0.8031): one heart per point, up to 14, spread and thrown wider the
   bigger it was, so a heavy hit reads as heavy and a nibble of healing as one small heart. */
function fxHearts(x, y, z, heal, amt = 1, owner = 0) {
  if (_fxScale <= 0 || !_fxNear(x, y, z) || !(amt > 0)) return;
  const c = Math.min(14, _fxN(Math.max(1, Math.round(amt)))), wide = 0.25 + Math.min(0.35, c * 0.03);
  for (let k = 0; k < c; k++) {
    const i = _fxSprite(_R.HEART, x + _rnd(-wide, wide), y + _rnd(0, 0.3 + wide * 0.5), z + _rnd(-wide, wide), _rnd(1, 1.3), 0.2, 0.18);
    if (i < 0) return;
    const S = FX.sprites;
    if (heal) S.color(i, 0.35, 0.95, 0.38); else S.color(i, 0.92, 0.14, 0.14);
    S.vx[i] = _rnd(-0.35, 0.35); S.vy[i] = _rnd(0.9, 1.4); S.vz[i] = _rnd(-0.35, 0.35);
    S.drag[i] = 1.6; S.fade[i] = 0.35; S.own[i] = owner;
  }
}
// healing arrives a sliver at a time: one green heart per 2 health gained (one heart on the bar)
function fxHealTick(p, amount) {
  if (!(amount > 0) || !p) return;
  p._fxHeal = (p._fxHeal || 0) + amount;
  while (p._fxHeal >= 1) {                // one per point healed (0.8031; was one per 2)
    p._fxHeal -= 1;
    fxHearts(p.pos.x, p.pos.y + 1.3, p.pos.z, true, 1, fxOwner(p));
  }
}
/* Level up: a golden spiral climbs around you, and stars burst over your head (0.8). */
function fxLevelUp(p) {
  if (_fxScale <= 0 || !p) return;
  const S = FX.sprites, n = _fxN(26);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 3, r = 0.8;
    const i = _fxSprite(k % 3 ? _R.SPARK : _R.STAR, p.pos.x + Math.cos(a) * r, p.pos.y + 0.1 + (k / n) * 1.6,
                        p.pos.z + Math.sin(a) * r, _rnd(1.1, 1.6), 0.14, 0.04);
    if (i < 0) return;
    if (k % 2) S.color(i, 1, 0.86, 0.3); else S.color(i, 0.7, 1, 0.4);
    S.vx[i] = -Math.sin(a) * 0.7; S.vy[i] = _rnd(0.7, 1.1); S.vz[i] = Math.cos(a) * 0.7;
    S.grav[i] = -0.4; S.drag[i] = 0.6; S.fade[i] = 0.4;
  }
  for (let k = 0, m = _fxN(8); k < m; k++) {
    const a = (k / m) * Math.PI * 2;
    const i = _fxSprite(_R.STAR, p.pos.x, p.pos.y + 2.1, p.pos.z, _rnd(0.8, 1.1), 0.18, 0.05);
    if (i < 0) return;
    S.color(i, 1, 0.92, 0.45);
    S.vx[i] = Math.cos(a) * 1.8; S.vy[i] = _rnd(1.2, 2); S.vz[i] = Math.sin(a) * 1.8;
    S.grav[i] = 4; S.drag[i] = 1.2; S.fade[i] = 0.4;
  }
}
/* A mortar being worked puffs a little powder of what it is grinding (0.8). */
function fxGrind(b, cx, cy, cz, dt) {
  b._fxT = (b._fxT || 0) - dt;
  if (b._fxT > 0 || _fxScale <= 0) return;
  b._fxT = 0.12 / Math.max(0.3, _fxScale);
  if (!_fxNear(cx, cy, cz)) return;
  const id = b.units && b.units[0] && b.units[0][0] && b.units[0][0][0];
  const rgb = id != null ? _fxColorOf(id) : [0.8, 0.8, 0.75], L = _fxLight(cx, cy + 0.3, cz);
  for (let k = 0; k < 2; k++) {
    const i = _fxDust(cx + _rnd(-0.12, 0.12), cy + 0.12, cz + _rnd(-0.12, 0.12), rgb, L, _rnd(0.5, 0.9), _rnd(0.045, 0.065));
    if (i < 0) return;
    const S = FX.sprites;
    S.vx[i] = _rnd(-0.45, 0.45); S.vy[i] = _rnd(0.7, 1.3); S.vz[i] = _rnd(-0.45, 0.45);
    S.grav[i] = 6; S.flags[i] = FX_COLLIDE;
  }
}
/* Falling into water or lava: a splash, bigger the harder you land (0.8). */
function fxSplash(x, ySurf, z, strength, lava = false) {
  if (_fxScale <= 0 || !_fxNear(x, ySurf, z)) return;
  const L = lava ? 1 : _fxLight(x, ySurf + 0.5, z);
  const n = _fxN(6 + 22 * strength);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * 6.283, r = _rnd(0.1, 0.45), sp = _rnd(0.8, 2.2);
    _fxDrop(x + Math.cos(a) * r, ySurf + 0.05, z + Math.sin(a) * r,
            Math.cos(a) * sp, _rnd(1.5, 3) + 3.5 * strength, Math.sin(a) * sp, L, _rnd(0.7, 1.1), lava);
  }
  // a ring of foam (or, on lava, embers) spreading on the surface
  for (let k = 0, m = _fxN(8); k < m; k++) {
    const a = (k / m) * 6.283;
    if (lava) { _fxEmber(x, ySurf + 0.05, z, Math.cos(a) * 1.5, _rnd(1.5, 3), Math.sin(a) * 1.5); continue; }
    const i = _fxDust(x + Math.cos(a) * 0.3, ySurf + 0.03, z + Math.sin(a) * 0.3, [0.9, 0.95, 1], L, 0.6, 0.08);
    if (i < 0) return;
    FX.sprites.vx[i] = Math.cos(a) * 1.4; FX.sprites.vz[i] = Math.sin(a) * 1.4;
    FX.sprites.drag[i] = 3; FX.sprites.s1[i] = 0.12; FX.sprites.a[i] = 0.8;
  }
}
function _fxBubble(x, y, z) {
  const i = _fxSprite(_R.BUBBLE, x, y, z, _rnd(1.8, 2.8), 0.08, 0.1);
  if (i < 0) return;
  const S = FX.sprites;
  S.color(i, 0.82, 0.92, 1, 0.9);
  S.vx[i] = _rnd(-0.15, 0.15); S.vy[i] = _rnd(0.7, 1.2); S.vz[i] = _rnd(-0.15, 0.15);
  S.grav[i] = -0.6; S.drag[i] = 0.9; S.sway[i] = 0.35; S.fade[i] = 0.2;
  S.flags[i] = FX_IN_WATER;
}
function _fxZ(x, y, z) {
  const i = _fxSprite(_R.Z, x, y, z, 2.4, 0.13, 0.3);
  if (i < 0) return;
  const S = FX.sprites;
  S.color(i, 0.95, 0.97, 1);
  S.vx[i] = _rnd(0.1, 0.22); S.vy[i] = _rnd(0.3, 0.45); S.vz[i] = _rnd(-0.08, 0.12);
  S.sway[i] = 0.15; S.fade[i] = 0.4; S.flags[i] = FX_FADEIN;
}

/* ---------------------------------- footsteps ----------------------------------
   Prints on soft ground, sized by the foot that made them, and a puff of the ground kicked up: every
   print on soft ground, every step at a sprint on anything (0.8). A print lasts a few seconds. */
const FX_FEET = {
  boot:  { cell: FXS.BOOT, w: 0.17, l: 0.3,  spread: 0.12, stride: 0.75 },
  hoof:  { cell: FXS.HOOF, w: 0.22, l: 0.17, spread: 0.17, stride: 0.62 },
  small: { cell: FXS.HOOF, w: 0.14, l: 0.11, spread: 0.1,  stride: 0.45 },
};
const FX_FOOT_OF = { cow: 'hoof', horse: 'hoof', sheep: 'small', pig: 'small' };   // everything else walks in boots
// the grounds that take a print: [r, g, b, alpha] of the print on it
const FX_SOFT = {
  [B.SAND]: [0.6, 0.5, 0.34, 0.42], [B.RED_SAND]: [0.52, 0.26, 0.15, 0.42], [B.SNOW]: [0.6, 0.67, 0.8, 0.55],
  [B.DIRT]: [0.2, 0.14, 0.1, 0.34], [B.GRAVEL]: [0.24, 0.23, 0.22, 0.3], [B.CLAY]: [0.34, 0.36, 0.41, 0.32],
};
const FX_PRINT_LIFE = 7;
function _fxStep(x, y, z, fx, fz, foot, left, run, scale = 1) {
  const bx = Math.floor(x), bz = Math.floor(z);
  let v = getBlock(bx, Math.floor(y - 0.06), bz);
  if (!(v & 255)) v = getBlock(bx, Math.floor(y) - 1, bz);
  const id = v & 255;
  if (!id || id === B.WATER || id === B.LAVA) return;
  const soft = FX_SOFT[id];
  const off = (left ? 1 : -1) * foot.spread * scale;
  const px = x - fz * off, pz = z + fx * off;
  const L = _fxLight(px, y + 0.3, pz);
  if (soft && _fxScale > 0) FX.decals.add(px, y + 0.006, pz, fx, fz, foot.w * scale, foot.l * scale, foot.cell,
                                         soft[0] * L, soft[1] * L, soft[2] * L, soft[3], FX_PRINT_LIFE);
  if (!(soft || run)) return;
  for (let k = 0, n = _fxN(run ? 3 : 1); k < n; k++) {
    const i = _fxBit(id, px + _rnd(-0.08, 0.08), y + 0.04, pz + _rnd(-0.08, 0.08), _rnd(0.3, 0.55), _rnd(0.05, 0.07), L);
    if (i < 0) return;
    FX.bits.vx[i] = -fx * _rnd(0.6, 1.4) + _rnd(-0.3, 0.3); FX.bits.vy[i] = _rnd(0.8, 1.6);
    FX.bits.vz[i] = -fz * _rnd(0.6, 1.4) + _rnd(-0.3, 0.3);
    FX.bits.grav[i] = 12; FX.bits.flags[i] = FX_COLLIDE;
  }
}
/* The player's feet, from updateFootsteps (32-sound.js), which already knows the frame's walk. */
function fxWalk(p, grounded, dx, dz) {
  if (!grounded || p.flying || p.dead || p.sleepingAt || p.riding) { p._fxStride = 0; return; }
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-4 || d > 2) return;
  const foot = FX_FEET.boot;
  p._fxStride = (p._fxStride || 0) + d;
  if (p._fxStride < foot.stride) return;
  p._fxStride = 0;
  p._fxFoot = !p._fxFoot;
  if (!_fxNear(p.pos.x, p.pos.y, p.pos.z)) return;
  _fxStep(p.pos.x, p.pos.y, p.pos.z, dx / d, dz / d, foot, p._fxFoot, !!p.fast && !p.sneaking);
}
/* A creature's feet, from entityStepSound (32-sound.js) — already range-gated to the players. */
function fxEntityWalk(e, dt, spd) {
  if (!e.onGround || spd < 0.4 || e.rider) { e._fxStride = 0; return; }
  const foot = FX_FEET[FX_FOOT_OF[e.kind] || 'boot'], sc = e.size || 1;
  e._fxStride = (e._fxStride || 0) + spd * dt;
  if (e._fxStride < foot.stride * sc) return;
  e._fxStride = 0;
  e._fxFoot = !e._fxFoot;
  _fxStep(e.x, e.y, e.z, Math.sin(e.yaw), Math.cos(e.yaw), foot, e._fxFoot, spd > 3.5, sc);
}

/* ---------------------------------- 0.801 ---------------------------------- */
const _fxV = new THREE.Vector3();
// a gem's glint colour, for the gem itself, its cluster (any bed) and a plain-stone cluster
const _FX_GEM = {};
for (const [col, ...ids] of [
  [[0.6, 1, 1],      ITEM.DIAMOND,  B.DIAMOND_ORE,  B.DIAMOND_CLUSTER_STONE],
  [[0.45, 1, 0.55],  ITEM.EMERALD,  B.EMERALD_ORE,  B.EMERALD_CLUSTER_STONE],
  [[1, 0.4, 0.45],   ITEM.RUBY,     B.RUBY_ORE,     B.RUBY_CLUSTER_STONE],
  [[0.5, 0.65, 1],   ITEM.SAPPHIRE, B.SAPPHIRE_ORE, B.SAPPHIRE_CLUSTER_STONE],
  [[1, 0.82, 0.4],   ITEM.TOPAZ,    B.TOPAZ_ORE,    B.TOPAZ_CLUSTER_STONE],
]) for (const id of ids) if (id != null) _FX_GEM[id] = col;
function _fxGlint(pool, x, y, z, col, size, life = 0.55) {
  const i = pool.add(x, y, z, life);
  if (i < 0) return -1;
  const r = Math.random() < 0.5 ? _R.STAR : _R.SPARK;
  pool.setRect(i, r[0], r[1], r[2], r[3]);
  pool.color(i, col[0], col[1], col[2], 0.95);
  pool.s0[i] = size; pool.s1[i] = 0; pool.fade[i] = 0.2; pool.flags[i] = FX_FADEIN;
  return i;
}
/* What the first-person hand holds (from updateHands, per seat): a torch burns with a tiny flame and
   the odd spark, a gem or gem cluster glints now and then. Drawn in the hand scene so it rides with
   the hand; very small and faint by design. */
function _fxHeldOne(dt, grp, id, own, key, tipY) {
  if (id == null || !grp || !grp.parent) return;
  const torch = id === B.TORCH, gem = _FX_GEM[id];
  if (!torch && !gem) return;
  const k = '_fxHeldT' + key;
  player[k] = (player[k] || 0) - dt;
  if (player[k] > 0) return;
  player[k] = torch ? 0.1 / Math.max(0.4, _fxScale) : 0.5;
  grp.updateWorldMatrix(true, false);
  const H = FX.hand;
  if (torch) {
    _fxV.set(_rnd(-0.02, 0.02), tipY, _rnd(-0.02, 0.02)); grp.localToWorld(_fxV);
    let i = H.add(_fxV.x, _fxV.y, _fxV.z, _rnd(0.25, 0.4));
    if (i < 0) return;
    H.setRect(i, _R.FLAME[0], _R.FLAME[1], _R.FLAME[2], _R.FLAME[3]);
    H.color(i, 1, _rnd(0.65, 0.85), 0.35, 0.85);
    H.s0[i] = 0.05; H.s1[i] = 0.015; H.vy[i] = _rnd(0.08, 0.16); H.fade[i] = 0.5; H.own[i] = own;
    if (Math.random() < 0.25) {
      i = H.add(_fxV.x, _fxV.y + 0.02, _fxV.z, _rnd(0.4, 0.7));
      if (i < 0) return;
      H.setRect(i, _R.EMBER[0], _R.EMBER[1], _R.EMBER[2], _R.EMBER[3]);
      H.color(i, 1, _rnd(0.6, 0.85), 0.2);
      H.s0[i] = 0.014; H.s1[i] = 0.004; H.vx[i] = _rnd(-0.06, 0.06); H.vy[i] = _rnd(0.15, 0.3); H.fade[i] = 0.4; H.own[i] = own;
    }
  } else if (id < 256) {
    /* a held gem CLUSTER (0.804): a solid model, so a glint inside it was hidden by its own faces. It
       sparkles on its surface instead, a little proud of it, a bit more often than a loose gem */
    player[k] = 0.3;
    const ax = (Math.random() * 3) | 0, s = Math.random() < 0.5 ? -1 : 1;
    const c = [_rnd(-0.42, 0.42), _rnd(-0.42, 0.42), _rnd(-0.42, 0.42)];
    c[ax] = s * 0.56;
    _fxV.set(c[0], c[1], c[2]); grp.localToWorld(_fxV);
    const i = _fxGlint(H, _fxV.x, _fxV.y, _fxV.z, gem, 0.05);
    if (i >= 0) H.own[i] = own;
  } else {
    _fxV.set(_rnd(-0.3, 0.3), _rnd(-0.25, 0.35), _rnd(-0.05, 0.05)); grp.localToWorld(_fxV);
    const i = _fxGlint(H, _fxV.x, _fxV.y, _fxV.z, gem, 0.045);
    if (i >= 0) H.own[i] = own;
  }
}
function fxHeldTick(dt, held, id, off) {
  if (_fxScale <= 0 || typeof player === 'undefined' || !player) return;
  const own = fxOwner(player);
  // a torch in the main hand sits on a lifted cross-model group (24-hands.js); its tip is ~0.47 up
  _fxHeldOne(dt, held, id, own, 'm', 0.47);
  if (off && off.root.visible) _fxHeldOne(dt, off.held, off.heldId, own, 'o', 0.13);
}
/* Eating or drinking (from updateEating, while the eat timer runs): crumbs of the food's own colour
   fall from it in your hand, and — for everyone else — from your mouth. Milk splashes white. */
function fxEat(p, id, dt) {
  if (_fxScale <= 0) return;
  p._fxEatT = (p._fxEatT || 0) - dt;
  if (p._fxEatT > 0) return;
  p._fxEatT = 0.16;
  const drink = !!ITEM_PROPS[id]?.drink;
  const rgb = drink ? [0.95, 0.96, 1] : _fxColorOf(id), own = fxOwner(p);
  // in the hand (first person)
  if (typeof heldGroup !== 'undefined' && heldGroup && heldGroup.parent) {
    heldGroup.updateWorldMatrix(true, false);
    for (let k = 0; k < 2; k++) {
      _fxV.set(_rnd(-0.2, 0.2), _rnd(0.1, 0.35), _rnd(-0.1, 0.1)); heldGroup.localToWorld(_fxV);
      const i = FX.hand.add(_fxV.x, _fxV.y, _fxV.z, _rnd(0.35, 0.55));
      if (i < 0) break;
      const H = FX.hand, r = drink ? _R.DROP : _R.DUST;
      H.setRect(i, r[0], r[1], r[2], r[3]); H.color(i, rgb[0], rgb[1], rgb[2], 1);
      H.s0[i] = H.s1[i] = drink ? 0.03 : 0.025;
      H.vx[i] = _rnd(-0.25, 0.25); H.vy[i] = _rnd(0.1, 0.4); H.grav[i] = 3; H.fade[i] = 0.3; H.own[i] = own;
    }
  }
  // at the mouth, in the world (hidden in your own first-person view)
  const cp = Math.cos(p.pitch || 0);
  const mx = p.pos.x - Math.sin(p.yaw || 0) * cp * 0.35, my = p.pos.y + (p.EYE || 1.62) - 0.2, mz = p.pos.z - Math.cos(p.yaw || 0) * cp * 0.35;
  const L = _fxLight(mx, my, mz);
  for (let k = 0; k < 2; k++) {
    const i = _fxDust(mx, my, mz, rgb, L, _rnd(0.4, 0.7), 0.045);
    if (i < 0) return;
    FX.sprites.vx[i] = _rnd(-0.5, 0.5); FX.sprites.vy[i] = _rnd(0.2, 0.8); FX.sprites.vz[i] = _rnd(-0.5, 0.5);
    FX.sprites.grav[i] = 9; FX.sprites.flags[i] = FX_COLLIDE; FX.sprites.own[i] = own;
  }
}
/* A block placed: a few bits of it knocked loose around its foot (0.801). */
function fxPlace(x, y, z, val) {
  if (_fxScale <= 0 || !_fxNear(x + 0.5, y + 0.5, z + 0.5)) return;
  const id = val & 255;
  if (!PROPS[id] || !PROPS[id].faces) return;
  /* The light the bits land in, not the light inside the block just placed: that cell is solid now and
     reads as pitch dark, which drew every placed bit black (0.809). The brightest open side wins. */
  let L = 0;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
    L = Math.max(L, _fxLight(x + 0.5 + dx, y + 0.5 + dy, z + 0.5 + dz));
  for (let k = 0, n = _fxN(6); k < n; k++) {
    const a = Math.random() * 6.283;
    const i = _fxBit(id, x + 0.5 + Math.cos(a) * 0.55, y + 0.05, z + 0.5 + Math.sin(a) * 0.55, _rnd(0.3, 0.5), _rnd(0.05, 0.08), L);
    if (i < 0) return;
    FX.bits.vx[i] = Math.cos(a) * _rnd(0.5, 1.2); FX.bits.vy[i] = _rnd(0.8, 1.6); FX.bits.vz[i] = Math.sin(a) * _rnd(0.5, 1.2);
    FX.bits.grav[i] = 12; FX.bits.flags[i] = FX_COLLIDE;
  }
}
/* Foraging (bush pickup): a handful of bits of the plant pulled — grass, wheat, a berry bush, a
   flint pebble, a melon (0.801). */
/* 0.803: plants throw bits of their own colour rather than their texture — grass green, wheat straw
   yellow, a berry bush its berries when ripe and dark leaf green when bare. */
const _FX_BERRY_COL = {};
_FX_BERRY_COL[B.REDBERRY_BUSH] = [0.82, 0.12, 0.16];
_FX_BERRY_COL[B.BLUEBERRY_BUSH] = [0.25, 0.36, 0.88];
_FX_BERRY_COL[B.YELLOWBERRY_BUSH] = [0.25, 0.12, 0.3];   // blackberries (0.80991)
const _FX_LEAF_DARK = [0.2, 0.38, 0.14], _FX_WHEAT = [0.88, 0.76, 0.36];
function _fxGrassCol() {
  const t = sharedUniforms.uTintColor && sharedUniforms.uTintColor.value;
  return t ? [t.r, t.g, t.b] : [0.36, 0.62, 0.24];
}
function _fxPlantBits(x, y, z, rgb, n, L) {
  for (let k = 0; k < n; k++) {
    const s = _rnd(0.04, 0.065);
    const i = _fxDust(x + _rnd(0.25, 0.75), y + _rnd(0.1, 0.6), z + _rnd(0.25, 0.75), rgb, L * _rnd(0.8, 1.05), _rnd(0.5, 0.9), s);
    if (i < 0) return;
    const S = FX.sprites;
    S.vx[i] = _rnd(-1, 1); S.vy[i] = _rnd(1.2, 2.6); S.vz[i] = _rnd(-1, 1);
    S.grav[i] = 11; S.drag[i] = 0.6; S.flags[i] = FX_COLLIDE; S.fade[i] = 0.3;
  }
}
/* A plant's coloured bits, for foraging it AND for breaking it with a hoe, a sword or a creative hand
   (0.804). False when `val` is not one of these plants. */
function _fxPlantBurst(x, y, z, val, L) {
  const id = val & 255;
  if (id === B.TALLGRASS || id === B.TALL_LOWER || id === B.TALL_UPPER) { _fxPlantBits(x, y, z, _fxGrassCol(), _fxN(8), L); return true; }
  if (id === B.WHEAT) { _fxPlantBits(x, y, z, _FX_WHEAT, _fxN(8), L); return true; }
  if (_FX_BERRY_COL[id]) {
    const ripe = typeof berryStage === 'function' && berryStage((val >> 8) & 255) === BERRY_STAGE.GROWN;
    if (ripe) _fxPlantBits(x, y, z, _FX_BERRY_COL[id], _fxN(6), L);
    _fxPlantBits(x, y, z, _FX_LEAF_DARK, _fxN(ripe ? 3 : 7), L);
    return true;
  }
  return false;
}
function fxForage(x, y, z, val) {
  if (_fxScale <= 0 || !_fxNear(x + 0.5, y + 0.5, z + 0.5)) return;
  const id = val & 255;
  const L = _fxLight(x + 0.5, y + 0.5, z + 0.5);
  if (_fxPlantBurst(x, y, z, val, L)) return;
  for (let k = 0, n = _fxN(7); k < n; k++) {
    const i = _fxBit(id, x + _rnd(0.25, 0.75), y + _rnd(0.1, 0.6), z + _rnd(0.25, 0.75), _rnd(0.4, 0.8), _rnd(0.07, 0.1), L);
    if (i < 0) return;
    FX.bits.vx[i] = _rnd(-1, 1); FX.bits.vy[i] = _rnd(1.2, 2.6); FX.bits.vz[i] = _rnd(-1, 1);
    FX.bits.grav[i] = 13; FX.bits.flags[i] = FX_COLLIDE;
  }
}
/* A creature killed: crit stars fly out of it and it goes up in a white puff (0.801). */
function fxDeath(x, y, z, h = 1) {
  if (_fxScale <= 0 || !_fxNear(x, y, z)) return;
  const S = FX.sprites, L = _fxLight(x, y + h * 0.5, z);
  for (let k = 0, n = _fxN(10); k < n; k++) {
    const a = Math.random() * 6.283;
    const i = _fxSprite(_R.STAR, x, y + h * _rnd(0.4, 0.9), z, _rnd(0.5, 0.8), 0.16, 0.04);
    if (i < 0) break;
    S.color(i, 1, _rnd(0.85, 1), 0.55);
    S.vx[i] = Math.cos(a) * _rnd(1.5, 3); S.vy[i] = _rnd(1, 2.5); S.vz[i] = Math.sin(a) * _rnd(1.5, 3);
    S.grav[i] = 6; S.drag[i] = 1.5; S.fade[i] = 0.4;
  }
  for (let k = 0, n = _fxN(8); k < n; k++) {
    const i = _fxSprite(_R_SMOKE[1 + ((Math.random() * 2) | 0)], x + _rnd(-0.4, 0.4), y + h * _rnd(0.1, 0.9),
                        z + _rnd(-0.4, 0.4), _rnd(0.7, 1.1), 0.2, 0.45);
    if (i < 0) break;
    S.color(i, 0.92 * L + 0.08, 0.92 * L + 0.08, 0.95 * L + 0.05, 0.85);
    S.vx[i] = _rnd(-0.5, 0.5); S.vy[i] = _rnd(0.3, 0.9); S.vz[i] = _rnd(-0.5, 0.5);
    S.drag[i] = 2; S.fade[i] = 0.6;
  }
}
/* Placed torches near each player burn: a small flame at the tip, now and then a spark or a wisp of
   smoke. The emitters come from the light index (forEachGlowNear), not from a scan (0.801). */
const _FX_TORCH_DIR = [null, [1, 0], [-1, 0], [0, 1], [0, -1]];
function _fxTorches(dt, live) {
  if (typeof forEachGlowNear !== 'function') return;
  const k = 1 / live;
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead) continue;
    const py = p.pos.y;
    forEachGlowNear(p.pos.x, p.pos.z, 20, (x, y, z) => {
      if (Math.abs(y - py) > 16) return;
      const v = getBlock(x, y, z);
      if ((v & 255) !== B.TORCH) return;
      const d = _FX_TORCH_DIR[(v >> 8) & 7];
      // the tip: an upright stick is 40/64 tall; a wall one leans in from its wall (see emitTorch in 02)
      const tx = x + 0.5 - (d ? d[0] * 0.24 : 0), ty = y + (d ? 0.84 : 0.66), tz = z + 0.5 - (d ? d[1] * 0.24 : 0);
      const r = Math.random();
      if (r < dt * 2.4 * k) _fxFlame(tx + _rnd(-0.02, 0.02), ty, tz + _rnd(-0.02, 0.02), 0.35, 0.09);
      else if (r < dt * 3.1 * k) _fxEmber(tx, ty + 0.03, tz, _rnd(-0.2, 0.2), _rnd(0.6, 1.2), _rnd(-0.2, 0.2));
      else if (r < dt * 3.5 * k) _fxSmoke(tx, ty + 0.1, tz, 0.45, 1, 0.35);
    });
  }
}
// a gem lying on the ground catches the light now and then
function _fxDroppedGems(dt) {
  if (typeof DROPS === 'undefined') return;
  for (const d of DROPS) {
    const col = _FX_GEM[d.id];
    if (!col || Math.random() > dt * 1.4) continue;
    const g = d.group.position;
    if (!d.group.visible || !_fxNear(g.x, g.y, g.z)) continue;
    _fxGlint(FX.sprites, g.x + _rnd(-0.15, 0.15), g.y + _rnd(-0.1, 0.2), g.z + _rnd(-0.15, 0.15), col, 0.07);
  }
}

/* ---------------------------------- 0.803 ---------------------------------- */
/* A soft puff of smoke in a colour: a chest lid, a creature appearing or leaving, a craft done. */
function fxPuff(x, y, z, rgb, n = 8, spread = 1) {
  if (_fxScale <= 0 || !_fxNear(x, y, z)) return;
  const S = FX.sprites, L = _fxLight(x, y, z) * 0.85 + 0.15;
  for (let k = 0, c = _fxN(n); k < c; k++) {
    const a = Math.random() * 6.283, r = _rnd(0.05, 0.3) * spread;
    const i = _fxSprite(_R_SMOKE[1 + ((Math.random() * 2) | 0)], x + Math.cos(a) * r, y + _rnd(-0.2, 0.2) * spread,
                        z + Math.sin(a) * r, _rnd(0.6, 1), 0.14 * spread, 0.36 * spread);
    if (i < 0) return;
    S.color(i, rgb[0] * L, rgb[1] * L, rgb[2] * L, 0.8);
    S.vx[i] = Math.cos(a) * _rnd(0.4, 1) * spread; S.vy[i] = _rnd(0.2, 0.7); S.vz[i] = Math.sin(a) * _rnd(0.4, 1) * spread;
    S.drag[i] = 2.4; S.fade[i] = 0.6;
  }
}
// a craft finished: a puff the colour of what was made, and a twinkle or two
function fxCraftPuff(x, y, z, id) {
  if (_fxScale <= 0 || !_fxNear(x, y, z)) return;
  fxPuff(x, y, z, _fxColorOf(id), 6, 0.8);
  for (let k = 0, n = _fxN(3); k < n; k++)
    _fxGlint(FX.sprites, x + _rnd(-0.3, 0.3), y + _rnd(0, 0.3), z + _rnd(-0.3, 0.3), [1, 0.95, 0.75], 0.1, 0.5);
}
// a creature won over: pink hearts and a few stars
function fxTamed(x, y, z, n = 6) {
  if (_fxScale <= 0 || !_fxNear(x, y, z)) return;
  const S = FX.sprites;
  for (let k = 0, c = _fxN(n); k < c; k++) {
    const i = _fxSprite(_R.HEART, x + _rnd(-0.4, 0.4), y + _rnd(0, 0.4), z + _rnd(-0.4, 0.4), _rnd(1.1, 1.5), 0.2, 0.18);
    if (i < 0) return;
    S.color(i, 1, 0.45, 0.7);
    S.vx[i] = _rnd(-0.3, 0.3); S.vy[i] = _rnd(0.8, 1.3); S.vz[i] = _rnd(-0.3, 0.3); S.drag[i] = 1.6; S.fade[i] = 0.35;
  }
  if (n > 3) for (let k = 0, c = _fxN(5); k < c; k++)
    _fxGlint(S, x + _rnd(-0.5, 0.5), y + _rnd(-0.2, 0.5), z + _rnd(-0.5, 0.5), [1, 0.9, 0.5], 0.12, 0.7);
}
/* A hit stopped by a shield: splinters of wood and a few sparks off its face, toward the attacker. */
function fxShieldHit(tp, fromX, fromZ) {
  if (_fxScale <= 0 || !tp) return;
  const dx = fromX - tp.pos.x, dz = fromZ - tp.pos.z, d = Math.hypot(dx, dz) || 1;
  const nx = dx / d, nz = dz / d;
  const x = tp.pos.x + nx * 0.55, y = tp.pos.y + 1.1, z = tp.pos.z + nz * 0.55;
  if (!_fxNear(x, y, z)) return;
  const L = _fxLight(x, y, z);
  for (let k = 0, n = _fxN(6); k < n; k++) {
    const i = _fxBit(B.PLANKS, x + _rnd(-0.2, 0.2), y + _rnd(-0.25, 0.25), z + _rnd(-0.2, 0.2), _rnd(0.4, 0.7), _rnd(0.05, 0.08), L);
    if (i < 0) break;
    FX.bits.vx[i] = nx * _rnd(1, 2.4) + _rnd(-0.6, 0.6); FX.bits.vy[i] = _rnd(0.8, 2);
    FX.bits.vz[i] = nz * _rnd(1, 2.4) + _rnd(-0.6, 0.6);
    FX.bits.grav[i] = 14; FX.bits.flags[i] = FX_COLLIDE;
  }
  for (let k = 0, n = _fxN(5); k < n; k++) {
    const i = _fxSprite(_R.SPARK, x, y + _rnd(-0.15, 0.15), z, _rnd(0.2, 0.35), 0.07, 0.02);
    if (i < 0) break;
    FX.sprites.color(i, 1, _rnd(0.8, 0.95), 0.55);
    FX.sprites.vx[i] = nx * _rnd(2, 4) + _rnd(-1.5, 1.5); FX.sprites.vy[i] = _rnd(0.5, 2.5); FX.sprites.vz[i] = nz * _rnd(2, 4) + _rnd(-1.5, 1.5);
    FX.sprites.grav[i] = 10; FX.sprites.fade[i] = 0.4;
  }
}
/* An arrow in flight leaves a short fading trail (from updateArrows, 38-ranged.js). */
function fxArrowTrail(a, dt) {
  if (_fxScale <= 0) return;
  a._fxT = (a._fxT || 0) - dt;
  if (a._fxT > 0) return;
  a._fxT = 0.025 / Math.max(0.4, _fxScale);
  if (a.vx * a.vx + a.vy * a.vy + a.vz * a.vz < 25) return;          // slowed to a drop: no trail
  const p = a.group.position;
  if (!_fxNear(p.x, p.y, p.z)) return;
  const L = _fxLight(p.x, p.y, p.z) * 0.7 + 0.3;
  const i = _fxDust(p.x, p.y, p.z, [0.92, 0.92, 0.95], L, _rnd(0.3, 0.45), 0.05);
  if (i < 0) return;
  FX.sprites.a[i] = 0.55; FX.sprites.s1[i] = 0.01; FX.sprites.fade[i] = 0.9;
}
/* Armed TNT: sparks spit off the fuse on top, faster as it runs down. */
function fxTntFuse(r, x, y, z, dt) {
  if (_fxScale <= 0) return;
  r._fxT = (r._fxT || 0) - dt;
  if (r._fxT > 0) return;
  r._fxT = Math.max(0.03, 0.02 + r.t * 0.03) / Math.max(0.4, _fxScale);
  if (!_fxNear(x + 0.5, y + 1, z + 0.5)) return;
  const i = _fxSprite(_R.SPARK, x + 0.5, y + 1.08, z + 0.5, _rnd(0.3, 0.5), 0.15, 0.04);   // bigger (0.804)
  if (i >= 0) {
    FX.sprites.color(i, 1, _rnd(0.75, 0.95), 0.4);
    FX.sprites.vx[i] = _rnd(-1.2, 1.2); FX.sprites.vy[i] = _rnd(1.5, 3); FX.sprites.vz[i] = _rnd(-1.2, 1.2);
    FX.sprites.grav[i] = 9; FX.sprites.fade[i] = 0.4;
  }
  if (Math.random() < 0.3) _fxSmoke(x + 0.5, y + 1.1, z + 0.5, 0.5, _fxLight(x + 0.5, y + 1.5, z + 0.5), 0.4);
}
/* The blast: a ball of smoke, a flash of flame and embers thrown out. */
function fxExplode(x, y, z, R) {
  if (_fxScale <= 0 || !_fxNear(x, y, z)) return;
  const S = FX.sprites;
  for (let k = 0, n = _fxN(22); k < n; k++) {
    const a = Math.random() * 6.283, b = _rnd(-0.6, 1.2), sp = _rnd(1, 3.2);
    const i = _fxSprite(_R_SMOKE[(Math.random() * 2) | 0], x, y, z, _rnd(1.2, 2.2), 0.5, 1.4);
    if (i < 0) break;
    const g = _rnd(0.25, 0.5);
    S.color(i, g, g, g, 0.85);
    S.vx[i] = Math.cos(a) * sp; S.vy[i] = b * sp * 0.6 + 0.6; S.vz[i] = Math.sin(a) * sp;
    S.drag[i] = 1.8; S.grav[i] = -0.3; S.fade[i] = 0.6;
  }
  for (let k = 0, n = _fxN(10); k < n; k++) _fxFlame(x + _rnd(-R, R) * 0.4, y + _rnd(-0.5, 1), z + _rnd(-R, R) * 0.4, _rnd(0.3, 0.5), 0.4);
  for (let k = 0, n = _fxN(18); k < n; k++) {
    const a = Math.random() * 6.283, sp = _rnd(3, 7);
    _fxEmber(x, y, z, Math.cos(a) * sp, _rnd(2, 6), Math.sin(a) * sp);
  }
}
/* Running effects show on the body: green bubbles for a bad one (poison, nausea), blue for a good one. */
function _fxEffects(p, dt) {
  const list = p.effects;
  if (!list || !list.length || typeof EFFECT_DEFS === 'undefined') return;
  p._fxEffT = (p._fxEffT || 0) - dt;
  if (p._fxEffT > 0) return;
  p._fxEffT = 0.3 / Math.max(0.4, _fxScale);
  let good = false, bad = false;
  for (const e of list) { const d = EFFECT_DEFS[e.id]; if (d) { if (d.good) good = true; else bad = true; } }
  const own = fxOwner(p), S = FX.sprites;
  for (const col of [bad && [0.45, 0.95, 0.35], good && [0.45, 0.7, 1]]) {
    if (!col) continue;
    const a = Math.random() * 6.283;
    const i = _fxSprite(_R.BUBBLE, p.pos.x + Math.cos(a) * 0.35, p.pos.y + _rnd(0.2, 1.5), p.pos.z + Math.sin(a) * 0.35,
                        _rnd(0.9, 1.4), 0.09, 0.12);
    if (i < 0) return;
    S.color(i, col[0], col[1], col[2], 0.85);
    S.vy[i] = _rnd(0.35, 0.7); S.sway[i] = 0.3; S.fade[i] = 0.4; S.flags[i] = FX_FADEIN; S.own[i] = own;
  }
}
// what a butterfly can be: orange, white, pale blue, yellow
const _FX_BUTTERFLY = [[1, 0.6, 0.2], [0.95, 0.95, 0.92], [0.55, 0.75, 1], [1, 0.9, 0.3]];
let _FX_FLOWERS = null;
function _fxIsFlower(id) {
  if (!_FX_FLOWERS) {
    _FX_FLOWERS = new Set();
    for (const k of ['POPPY', 'ORCHID', 'PINCUSHION', 'DANDELION', 'TULIP', 'CORNFLOWER', 'DAISY', 'LILY'])
      if (B[k] != null) _FX_FLOWERS.add(B[k]);
  }
  return _FX_FLOWERS.has(id);
}
const _fxNight = () => typeof worldTime !== 'undefined' && worldTime > 0.53 && worldTime < 0.97;
const _fxDay = () => typeof worldTime !== 'undefined' && worldTime > 0.03 && worldTime < 0.45;

/* ---------------------------------- per frame ---------------------------------- */
// the top of the fluid a body stands in: where a splash sits
function _fxSurface(x, y, z) {
  const bx = Math.floor(x), bz = Math.floor(z);
  let by = Math.floor(y);
  for (let k = 0; k < 3; k++) {
    const up = getBlock(bx, by + 1, bz) & 255;
    if (up !== B.WATER && up !== B.LAVA) break;
    by++;
  }
  const lvl = (getBlock(bx, by, bz) >> 8) & 7;
  return by + (8 - lvl) / 9;
}
// fluid in, splash out, bubbles while under: for one body
function _fxBodyInFluid(o, x, y, z, vy, dt, headY) {
  const id = getBlock(Math.floor(x), Math.floor(y + 0.1), Math.floor(z)) & 255;
  const fluid = id === B.WATER ? 1 : id === B.LAVA ? 2 : 0;
  const was = o._fxFluid || 0;
  const fallV = Math.min(vy, o._fxVy ?? vy);
  o._fxVy = vy;
  o._fxFluid = fluid;
  if (fluid && !was && fallV < -2.5) fxSplash(x, _fxSurface(x, y, z), z, Math.min(1, -fallV / 16), fluid === 2);
  // out of the water: the body drips for a couple of seconds (0.803)
  if (was === 1 && !fluid) o._fxWetT = 2.5;
  if (!fluid && o._fxWetT > 0) {
    o._fxWetT -= dt;
    if (Math.random() < dt * 14 * _fxScale * Math.min(1, o._fxWetT)) {
      const h = headY - y;
      _fxDrop(x + _rnd(-0.3, 0.3), y + _rnd(0.2, h), z + _rnd(-0.3, 0.3), 0, _rnd(-0.5, 0), 0, _fxLight(x, y + 1, z), 0.8);
    }
  }
  if (!fluid || fluid === 2) return;
  o._fxSwimT = (o._fxSwimT || 0) - dt;
  if (o._fxSwimT > 0) return;
  o._fxSwimT = 0.14;
  const headId = getBlock(Math.floor(x), Math.floor(headY), Math.floor(z)) & 255;
  if (headId === B.WATER) {                                        // under: a bubble now and then
    if (Math.random() < 0.3) _fxBubble(x + _rnd(-0.15, 0.15), headY, z + _rnd(-0.15, 0.15));
  } else {                                                         // at the surface: a ripple of drops when moving
    const mx = x - (o._fxLX ?? x), mz = z - (o._fxLZ ?? z);
    o._fxLX = x; o._fxLZ = z;
    if (mx * mx + mz * mz > 0.01) {
      const s = _fxSurface(x, y, z), L = _fxLight(x, s + 0.5, z);
      _fxDrop(x + _rnd(-0.3, 0.3), s + 0.02, z + _rnd(-0.3, 0.3), _rnd(-0.6, 0.6), _rnd(1, 2), _rnd(-0.6, 0.6), L, 0.5);
    }
  }
}
/* Water, from the ambient sampler (0.803): foam and spray where a falling column lands, and now and then
   a bubble rising off the bottom of a pool. */
const _FX_SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function _fxAmbWater(x, y, z, v) {
  const upId = getBlock(x, y + 1, z) & 255;
  if (upId === B.WATER) {
    // a falling column: water above, open air beside it, and it lands here on ground or a pool
    let open = false;
    for (const [dx, dz] of _FX_SIDES) if ((getBlock(x + dx, y + 1, z + dz) & 255) === B.AIR) { open = true; break; }
    if (!open) {
      // or the foot of it, where the column meets the pool it feeds
      if ((getBlock(x, y + 2, z) & 255) !== B.WATER) return;
      for (const [dx, dz] of _FX_SIDES) if ((getBlock(x + dx, y + 2, z + dz) & 255) === B.AIR) { open = true; break; }
      if (!open) return _fxAmbBubble(x, y, z);
    }
    const dn = getBlock(x, y - 1, z) & 255;
    if (dn === B.WATER || dn === B.AIR) {
      // mid-column: only the cell just above a pool's surface counts
      if (dn === B.AIR) return;
      let pool = true;
      for (const [dx, dz] of _FX_SIDES) if ((getBlock(x + dx, y - 1, z + dz) & 255) !== B.WATER) { pool = false; break; }
      if (!pool) return;
    }
    if (Math.random() > 0.6) return;
    const L = _fxLight(x + 0.5, y + 1, z + 0.5);
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * 6.283, sp = _rnd(0.6, 1.6);
      _fxDrop(x + 0.5 + Math.cos(a) * 0.4, y + 0.9, z + 0.5 + Math.sin(a) * 0.4, Math.cos(a) * sp, _rnd(1.5, 3), Math.sin(a) * sp, L, 0.7);
    }
    const i = _fxDust(x + _rnd(0.1, 0.9), y + 0.95, z + _rnd(0.1, 0.9), [0.92, 0.96, 1], L, _rnd(0.6, 1), 0.12);
    if (i >= 0) { const S = FX.sprites; S.a[i] = 0.55; S.vy[i] = _rnd(0.2, 0.5); S.s1[i] = 0.3; S.drag[i] = 1.5; S.fade[i] = 0.7; }
    return;
  }
  _fxAmbBubble(x, y, z);
}
// a bubble off the bottom of a pool, rising until it reaches the air
function _fxAmbBubble(x, y, z) {
  if (Math.random() > 0.04 || !_fxSolid(x, y - 1, z) || (getBlock(x, y + 1, z) & 255) !== B.WATER) return;
  _fxBubble(x + _rnd(0.2, 0.8), y + 0.1, z + _rnd(0.2, 0.8));
}
/* Ambient effects, Minecraft's way: a fixed number of random cells around each player each frame. A
   lava surface pops embers and flickers; a sand or gravel block hanging over air sheds dust (0.8). */
function _fxAmbient(dt) {
  const night = _fxNight(), day = _fxDay();
  let live = 0;
  for (const p of PLAYERS) if (p.spawned && !p.dead) live++;
  if (!live) return;
  const per = Math.min(220, Math.round(FX_AMB_SAMPLES * _fxScale * Math.min(3, dt * 60) / live));
  const D = FX_AMB_RADIUS * 2 + 1;
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead) continue;
    const cx = Math.floor(p.pos.x) - FX_AMB_RADIUS, cy = Math.floor(p.pos.y) - FX_AMB_RADIUS, cz = Math.floor(p.pos.z) - FX_AMB_RADIUS;
    for (let s = 0; s < per; s++) {
      const x = cx + ((Math.random() * D) | 0), y = cy + ((Math.random() * D) | 0), z = cz + ((Math.random() * D) | 0);
      const v = getBlock(x, y, z);
      if (!v) continue;
      const id = v & 255;
      if (id === B.LAVA) {
        if ((getBlock(x, y + 1, z) & 255) !== B.AIR) continue;
        const top = y + (8 - ((v >> 8) & 7)) / 9, r = Math.random();
        if (r < 0.3) _fxEmber(x + _rnd(0.2, 0.8), top, z + _rnd(0.2, 0.8), _rnd(-0.6, 0.6), _rnd(2.5, 4.5), _rnd(-0.6, 0.6));
        else if (r < 0.45) _fxFlame(x + _rnd(0.2, 0.8), top + 0.05, z + _rnd(0.2, 0.8), 0.5, 0.17);
        else if (r < 0.5) _fxSmoke(x + 0.5, top + 0.1, z + 0.5, 0.28, 1, 0.8);
      } else if (id === B.WATER) {
        _fxAmbWater(x, y, z, v);                                     // 0.803
      } else if (LEAF_BLOCKS.has(id)) {
        // a leaf lets go now and then and flutters down, in its own tree's colour (0.803)
        if (Math.random() > 0.06 || CORE.shapeOfVal(v) || (getBlock(x, y - 1, z) & 255) !== B.AIR) continue;
        const i = _fxBit(id, x + _rnd(0.1, 0.9), y - 0.05, z + _rnd(0.1, 0.9), _rnd(3.5, 5.5), _rnd(0.09, 0.12),
                         _fxLight(x + 0.5, y - 0.5, z + 0.5), 0.3);
        if (i < 0) continue;
        FX.bits.grav[i] = 1.2; FX.bits.drag[i] = 1.6; FX.bits.sway[i] = _rnd(0.6, 1.2);
        FX.bits.s1[i] = FX.bits.s0[i] * 0.8; FX.bits.flags[i] = FX_COLLIDE;
      } else if (night && (id === B.GRASS || id === B.TALLGRASS || _fxIsFlower(id))) {
        // fireflies over the grass at night (0.803)
        if (Math.random() > 0.02) continue;
        const up = id === B.GRASS ? 1 : 0;
        if (up && (getBlock(x, y + 1, z) & 255) !== B.AIR && (getBlock(x, y + 1, z) & 255) !== B.TALLGRASS) continue;
        const i = _fxSprite(_R.EMBER, x + _rnd(0, 1), y + up + _rnd(0.3, 1.4), z + _rnd(0, 1), _rnd(3, 5), 0.05, 0.05);
        if (i < 0) continue;
        const S = FX.sprites;
        S.color(i, 0.8, 1, 0.35, 1);
        S.vx[i] = _rnd(-0.2, 0.2); S.vy[i] = _rnd(-0.05, 0.12); S.vz[i] = _rnd(-0.2, 0.2);
        S.sway[i] = _rnd(0.3, 0.7); S.fade[i] = 0.45; S.flags[i] = FX_FADEIN;
      } else if (day && _fxIsFlower(id)) {
        // a butterfly about the flowers by day (0.803)
        if (Math.random() > 0.08) continue;
        const i = _fxSprite(_R.BUTTERFLY, x + 0.5, y + _rnd(0.5, 1.2), z + 0.5, _rnd(5, 8), 0.14, 0.14);
        if (i < 0) continue;
        const S = FX.sprites, c = _FX_BUTTERFLY[(Math.random() * _FX_BUTTERFLY.length) | 0];
        const L = _fxLight(x + 0.5, y + 1, z + 0.5);
        S.color(i, c[0] * L, c[1] * L, c[2] * L, 1);
        S.vx[i] = _rnd(-0.3, 0.3); S.vy[i] = _rnd(-0.06, 0.1); S.vz[i] = _rnd(-0.3, 0.3);
        S.sway[i] = _rnd(1, 1.6); S.fade[i] = 0.2; S.flags[i] = FX_FADEIN | FX_FLAP;
      } else if (_FX_GEM[id] && PROPS[id]?.model === 'cluster') {
        // a gem cluster glints (0.801)
        _fxGlint(FX.sprites, x + _rnd(0.15, 0.85), y + _rnd(0.1, 0.7), z + _rnd(0.15, 0.85), _FX_GEM[id], 0.08);
      } else if (PROPS[id]?.opaque && _fxFluidAt(x, y + 1, z) && (getBlock(x, y - 1, z) & 255) === B.AIR) {
        // a ceiling with water or lava sitting on it drips (0.801): the drop gathers, then falls
        if (Math.random() > 0.35) continue;
        const lava = (getBlock(x, y + 1, z) & 255) === B.LAVA;
        const i = _fxSprite(_R.DROP, x + _rnd(0.15, 0.85), y - 0.04, z + _rnd(0.15, 0.85), 3, 0.06, 0.06);
        if (i < 0) continue;
        const S = FX.sprites, L = lava ? 1 : _fxLight(x + 0.5, y - 0.5, z + 0.5);
        if (lava) S.color(i, 1, 0.5, 0.12, 1); else S.color(i, 0.55 * L, 0.72 * L, 1 * L, 0.9);
        S.phase[i] = _rnd(0.5, 1.1); S.grav[i] = 14; S.fade[i] = 0.05;
        S.flags[i] = FX_HANG | FX_COLLIDE | FX_POP | FX_DIE_IN_FLUID;
      } else if (typeof _fallsUnderGravity === 'function' && _fallsUnderGravity(v)
                 && (getBlock(x, y - 1, z) & 255) === B.AIR) {
        const L = _fxLight(x + 0.5, y - 0.5, z + 0.5);
        const i = _fxDust(x + _rnd(0.1, 0.9), y - 0.03, z + _rnd(0.1, 0.9), _fxColorOf(id), L, _rnd(2.4, 3.4), 0.045);
        if (i < 0) continue;
        FX.sprites.vy[i] = -0.2; FX.sprites.grav[i] = 1.3; FX.sprites.drag[i] = 0.8; FX.sprites.flags[i] = FX_COLLIDE;
      }
    }
  }
}
function updateParticles(dt) {
  if (typeof menuScene !== 'undefined' && menuScene) return;
  _fxBudget = FX_SPAWN_BUDGET;
  if (_fxScale > 0) {
    _fxAmbient(dt);
    let live = 0;
    for (const p of PLAYERS) if (p.spawned && !p.dead) live++;
    if (live) _fxTorches(dt, live);           // 0.801
    _fxDroppedGems(dt);                       // 0.801
    for (const p of PLAYERS) {
      if (!p.spawned || p.dead) continue;
      // asleep: a slow trail of Zzz from the pillow
      if (p.sleepingAt) {
        p._fxZT = (p._fxZT || 0) - dt;
        if (p._fxZT <= 0) { p._fxZT = 1.1; _fxZ(p.pos.x, p.pos.y + 0.7, p.pos.z); }
      }
      if (!p.flying) _fxBodyInFluid(p, p.pos.x, p.pos.y, p.pos.z, p.vy || 0, dt, p.pos.y + (p.EYE || 1.62));
      _fxEffects(p, dt);                      // 0.803
    }
    // creatures near a player splash too
    if (typeof ENTITIES !== 'undefined')
      for (const e of ENTITIES) {
        if (e.active === false || e.kind === 'fish') continue;   // a fish lives underwater: no bubble stream (0.805)
        const np = nearestPlayerTo(e.x, e.z);
        const dx = e.x - np.pos.x, dz = e.z - np.pos.z;
        if (dx * dx + dz * dz > 24 * 24) continue;
        _fxBodyInFluid(e, e.x, e.y, e.z, e.vy || 0, dt, e.y + (typeof entH === 'function' ? entH(e) * 0.85 : 1.5));
      }
  }
  FX.bits.update(dt);
  FX.sprites.update(dt);
  FX.decals.update(dt);
  FX.hand.update(dt);
}
function fxClear() { FX.bits.clear(); FX.sprites.clear(); FX.decals.clear(); FX.hand.clear(); }

/* ---------------------------------- the setting ---------------------------------- */
const fxSel = document.getElementById('fxSel');
if (fxSel) {
  fxSel.value = _fxQuality;
  fxSel.addEventListener('change', () => {
    _fxQuality = fxSel.value;
    try { localStorage.setItem('vg_fx', _fxQuality); } catch {}
    _fxApplyQuality();
    if (_fxScale <= 0) fxClear();
  });
}
