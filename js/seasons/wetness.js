'use strict';
/* seasons/wetness.js: wet ground, only to look at (nothing about a block changes). Three kinds of it:
   - the rain: open ground darkens the longer it rains and dries again after (WET_UP_S, WET_DRY_S), by how wet it is
     where each player stands (p._wetRain); the shader takes it where an eye is (wetRainHere -> uWet, set per eye in
     applyEyeVolumeFog, 22-main-loop.js; a face the sky reaches darkens: 04-materials.js);
   - beside water: a block next to water is always wet, baked into its faces by the mesher (wetBeside, chunks/mesher-cubes.js);
   - the wet map: the waves' wash up a beach (seasons/waves.js calls wetMark) and the steps of a player still dripping
     after the water or the rain, with a small puddle now and then (FX.puddles, 49-particles.js). WET_N columns a side
     round player one, each its wetness and the top of the wet block; marks dry over WET_MAP_DRY_S (uWetMap, uWetBox).
   What darkens: the tiles in CORE.WET_TILE (chunks/voxel-shared.js), not rock, not a light. Updated from frame()
   (22-main-loop.js). */

const WET_UP_S = 40, WET_DRY_S = 150;        // seconds of full rain to soak open ground, and for it to dry after
const WET_N = 128;                            // the wet map: columns a side, round player one
const WET_MAP_DRY_S = 45;                     // a full mark dries in about this long
const WET_TICK = 0.25;                        // how often the map dries and is sent to the shader
const DRIP_S = 14;                            // a player drips this long after leaving the water or the rain
const DRIP_STEP = 0.9;                        // blocks walked between two wet steps (standing, the drip comes slower)
const DRIP_PUDDLE = 0.35;                     // the chance a wet step leaves a puddle, while the drip is fresh

const _wetBytes = new Uint8Array(WET_N * WET_N * 2);   // per column: how wet (0..255), the wet block's top y
const _wetLeft = new Float32Array(WET_N * WET_N);      // ...its wetness as a number, to dry smoothly
const wetMapTex = new THREE.DataTexture(_wetBytes, WET_N, WET_N, THREE.RGFormat, THREE.UnsignedByteType);
wetMapTex.magFilter = wetMapTex.minFilter = THREE.NearestFilter;
wetMapTex.generateMipmaps = false;
wetMapTex.unpackAlignment = 1;
wetMapTex.needsUpdate = true;
sharedUniforms.uWetMap.value = wetMapTex;
let _wetX0 = 0, _wetZ0 = 0, _wetAny = false, _wetDirty = false, _wetT = 0, _wetWorld = null;

function _wetClear() {
  _wetBytes.fill(0); _wetLeft.fill(0);
  _wetAny = false; _wetDirty = true;
}
/* Column (x, z) wet to `amount` (0..1), the wet block's top at `top` (a whole y). A column wet at another height
   starts again from this one. */
function wetMark(x, z, top, amount) {
  const i = Math.floor(x) - _wetX0, j = Math.floor(z) - _wetZ0;
  if (i < 0 || j < 0 || i >= WET_N || j >= WET_N || top < 1 || top > 255) return;
  const k = i + j * WET_N;
  if (_wetBytes[k * 2 + 1] !== top) { _wetLeft[k] = 0; _wetBytes[k * 2 + 1] = top; }
  if (amount <= _wetLeft[k]) return;
  _wetLeft[k] = Math.min(1, amount);
  _wetBytes[k * 2] = Math.round(_wetLeft[k] * 255);
  _wetAny = _wetDirty = true;
}
// the map follows player one: moved by whole columns when they stray a quarter of it from its middle
function _wetFollow(px, pz) {
  const nx = Math.floor(px) - WET_N / 2, nz = Math.floor(pz) - WET_N / 2;
  const dx = nx - _wetX0, dz = nz - _wetZ0;
  if (Math.abs(dx) < WET_N / 4 && Math.abs(dz) < WET_N / 4) return;
  if (Math.abs(dx) >= WET_N || Math.abs(dz) >= WET_N || !_wetAny) { _wetX0 = nx; _wetZ0 = nz; _wetClear(); return; }
  const bytes = _wetBytes.slice(), left = _wetLeft.slice();
  _wetBytes.fill(0); _wetLeft.fill(0);
  for (let j = 0; j < WET_N; j++) {
    const oj = j + dz;
    if (oj < 0 || oj >= WET_N) continue;
    for (let i = 0; i < WET_N; i++) {
      const oi = i + dx;
      if (oi < 0 || oi >= WET_N) continue;
      const k = i + j * WET_N, o = oi + oj * WET_N;
      _wetLeft[k] = left[o]; _wetBytes[k * 2] = bytes[o * 2]; _wetBytes[k * 2 + 1] = bytes[o * 2 + 1];
    }
  }
  _wetX0 = nx; _wetZ0 = nz; _wetDirty = true;
}

/* A player still wet from the water or the rain: every DRIP_STEP walked (or a while standing) the block under their
   feet takes a wet mark, and while the drip is fresh now and then a small puddle; it thins out over DRIP_S. */
function _wetDrips(p, dt) {
  if (p.dead || p.flying || p.sleepingAt) return;
  const fx = Math.floor(p.pos.x), fz = Math.floor(p.pos.z);
  const inWater = (getBlock(fx, Math.floor(p.pos.y + 0.3), fz) & 255) === B.WATER || (getBlock(fx, Math.floor(p.pos.y + 1), fz) & 255) === B.WATER;
  const inRain = (p._wetAim || 0) > 0.15 && getSkyWorld(fx, Math.floor(p.pos.y + 1.7), fz) >= 15;
  if (inWater || inRain) { p._dripT = DRIP_S; p._dripOdo = 0; p._dripX = p.pos.x; p._dripZ = p.pos.z; return; }
  if (!(p._dripT > 0)) return;
  p._dripT -= dt;
  const k = Math.max(0, p._dripT / DRIP_S);                    // 1 just out of it .. 0 dry
  p._dripOdo = (p._dripOdo || 0) + Math.hypot(p.pos.x - (p._dripX ?? p.pos.x), p.pos.z - (p._dripZ ?? p.pos.z)) + dt * 0.35;
  p._dripX = p.pos.x; p._dripZ = p.pos.z;
  if (p._dripOdo < DRIP_STEP) return;
  p._dripOdo = 0;
  const gy = Math.floor(p.pos.y - 0.06), g = getBlock(fx, gy, fz);
  if (p.pos.y - (gy + 1) > 0.1 || !PROPS[g & 255]?.opaque || CORE.shapeOfVal(g)) return;   // in the air, or not on a full block
  if ((getBlock(fx, gy + 1, fz) & 255) !== B.AIR) return;      // a carpet, snow, a plant over it
  wetMark(p.pos.x, p.pos.z, gy + 1, 0.35 + 0.5 * k);
  if (Math.random() < DRIP_PUDDLE * k && typeof FX !== 'undefined' && _fxScale > 0) {
    const x = p.pos.x + _rnd(-0.25, 0.25), z = p.pos.z + _rnd(-0.25, 0.25), L = _fxLight(x, gy + 1.3, z);
    const a = Math.random() * 6.283, w = _rnd(0.25, 0.55) * (0.5 + 0.5 * k);
    FX.puddles.add(x, gy + 1.004, z, Math.cos(a), Math.sin(a), w, w * _rnd(0.6, 0.9), FXS.PUDDLE,
                   0.42 * L, 0.5 * L, 0.62 * L, 0.32, _rnd(6, 12));
  }
}

// how wet the rain has made the ground where an eye is: the nearest player's
function wetRainHere(pos) {
  if (typeof PLAYERS === 'undefined' || (typeof menuScene !== 'undefined' && menuScene)) return 0;
  let best = null, bd = Infinity;
  for (const p of PLAYERS) {
    if (!p.spawned) continue;
    const d = (p.pos.x - pos.x) ** 2 + (p.pos.z - pos.z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best ? best._wetRain || 0 : 0;
}

/* From frame() (22-main-loop.js), but stepped at the tick rate (SIM_DT, the time since added up, `_wetAcc`): each player's
   ground soaks or dries with the rain where they stand, and drips after the water; the map follows player one, dries,
   and goes to the shader a few times a second. All of it is slow: twenty steps a second show the same. */
let _wetAcc = 0;
function updateWetness(dt) {
  const box = sharedUniforms.uWetBox.value;
  if ((typeof menuScene !== 'undefined' && menuScene) || typeof PLAYERS === 'undefined' || !PLAYERS[0]) { box.w = 0; return; }
  if ((_wetAcc += dt) < SIM_DT) return;
  dt = Math.min(_wetAcc, 0.25); _wetAcc = 0;
  const world = typeof currentWorld !== 'undefined' ? currentWorld : null;
  if (world !== _wetWorld) {                                   // another world: nothing of the last one stays wet
    _wetWorld = world; _wetClear();
    for (const p of PLAYERS) { p._wetRain = 0; p._dripT = 0; }
  }
  for (const p of PLAYERS) {
    if (!p.spawned) continue;
    if ((p._wetAimT = (p._wetAimT || 0) - dt) <= 0) {          // the rain where they stand, twice a second
      p._wetAimT = 0.5;
      const pr = typeof precipAt === 'function' ? precipAt(p.pos.x, p.pos.z, p.pos.y + 1.6) : null;
      p._wetAim = pr ? pr.rain : 0;
    }
    const aim = p._wetAim || 0, cur = p._wetRain || 0;
    p._wetRain = aim > cur ? Math.min(aim, cur + dt / WET_UP_S) : Math.max(aim, cur - dt / WET_DRY_S);
    _wetDrips(p, dt);
  }
  const p0 = PLAYERS[0];
  if (p0.spawned) _wetFollow(p0.pos.x, p0.pos.z);
  if ((_wetT += dt) >= WET_TICK) {
    if (_wetAny) {
      const d = _wetT / WET_MAP_DRY_S;
      let any = false;
      for (let k = 0; k < _wetLeft.length; k++) {
        if (_wetLeft[k] <= 0) continue;
        const v = _wetLeft[k] = Math.max(0, _wetLeft[k] - d);
        _wetBytes[k * 2] = Math.round(v * 255);
        if (v > 0) any = true;
      }
      _wetAny = any; _wetDirty = true;
    }
    _wetT = 0;
    if (_wetDirty) { wetMapTex.needsUpdate = true; _wetDirty = false; }
  }
  box.set(_wetX0, _wetZ0, WET_N, _wetAny ? 1 : 0);
}
