'use strict';
/* voxiGrof — clouds (0.815)

   One layer of block clouds, y CLOUD_Y0 to CLOUD_Y0 + CLOUD_H (04-materials.js), cells a block wide. They are
   not blocks and not in the world data: nothing collides with them and nothing is meshed. The layer is drawn
   by one shader on a box around the eye: each pixel walks its ray cell by cell through the layer (a 3D DDA)
   and stops at the first cloud cell, so the clouds have real sides and you can fly in and out of them.

   SHAPE   a tiling value noise (CLOUD_N cells a side) read in cloud space, world minus uCloudOff. A cell is
           cloud where the noise reaches the weather's level, and stands 1 to CLOUD_THICK blocks tall the further
           past it the noise goes, so edges are thin and the middle is full height. A second noise lifts each
           column up or down within CLOUD_H (0.816), so neither the top nor the underside is flat.
   WEATHER each weather region (51-seasons.js) has a cover and a darkness (CLOUD_COVER, CLOUD_DARK). The cover
           is turned into a noise level through the noise's own spread (_cloudLevel), so a cover of 0.7 really
           is 70% of the sky. A change of weather fades in over CLOUD_FADE_S rather than popping.
   WIND    the whole layer drifts the way the wind blows at cloud height where player one is, at a quarter of
           its speed (a km/h is 1/3.6 blocks a second).
   SHADE   the ground under a cloud, measured up the ray to the sun or moon, loses a little light, and 75% of
           it under a dark one (cloudShade in 04).
   FOG     (0.816) foggy weather closes the view to FOG_DENSE_FAR; morning and after-rain fog (mistAt in 51) to
           FOG_LIGHT_FAR. It greys the sky and hides the sun, moon and stars (applyMist, per eye).
   RAINBOW (0.816) a ring of 42 degrees round the point opposite the sun, only above the horizon and by day. */

const CLOUD_COVER = { clear: 0.12, sunny: 0.04, cloudy: 0.7, windy: 0.35, rainy: 0.85, darky: 0.95, storm: 1, foggy: 0.6, blizzard: 1 };
const CLOUD_DARK = { rainy: 0.5, darky: 1, storm: 1, blizzard: 0.6 };   // dark clouds: darky and storm; rain is grey; a blizzard heavy grey (0.83)
const CLOUD_WIND = 0.1;                                   // share of the wind's speed the clouds drift at (0.25 until 0.818)
const CLOUD_FADE_S = 40;                                  // real seconds a change of weather takes to reach the sky
const CLOUD_STEP_H = 0.035;                               // noise past the level for each block of height
const CLOUD_THICK = 5;                                    // the most a cloud is tall; it floats up and down within CLOUD_H (0.816)
const CLOUD_STEPS = 160;                                  // cells a ray may walk before it gives up

/* ---- the shape noise: three octaves of tiling value noise, stretched to 0..1 ---- */
const _cloudHash = (i, k) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
function _cloudField(octaves, seed) {
  const N = CLOUD_N, v = new Float32Array(N * N);
  for (const [s, wgt] of octaves) {                                  // lattice spacing in cells, weight
    const P = N / s;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const ix = Math.floor(x / s), iz = Math.floor(z / s), ix1 = (ix + 1) % P, iz1 = (iz + 1) % P;
      let fx = x / s - ix, fz = z / s - iz;
      fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
      const a = _cloudHash(ix + iz * P, s + seed), b = _cloudHash(ix1 + iz * P, s + seed);
      const c = _cloudHash(ix + iz1 * P, s + seed), d = _cloudHash(ix1 + iz1 * P, s + seed);
      v[x + z * N] += wgt * (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz);
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
  for (let i = 0; i < v.length; i++) v[i] = (v[i] - lo) / (hi - lo);
  return v;
}
// r: the shape; g: where in the layer's height a column sits (0.816), so undersides are not flat
function _cloudNoiseBytes() {
  const shape = _cloudField([[32, 0.5], [16, 0.3], [8, 0.2]], 0), lift = _cloudField([[16, 0.6], [8, 0.4]], 1000);
  const bytes = new Uint8Array(CLOUD_N * CLOUD_N * 4);
  for (let i = 0; i < shape.length; i++) {
    bytes[i * 4] = Math.round(shape[i] * 255);
    bytes[i * 4 + 1] = Math.round(lift[i] * 255);
    bytes[i * 4 + 2] = bytes[i * 4 + 3] = 255;
  }
  return bytes;
}
const _cloudBytes = _cloudNoiseBytes();
const cloudNoiseTex = new THREE.DataTexture(_cloudBytes, CLOUD_N, CLOUD_N, THREE.RGBAFormat, THREE.UnsignedByteType);
cloudNoiseTex.wrapS = cloudNoiseTex.wrapT = THREE.RepeatWrapping;
cloudNoiseTex.magFilter = cloudNoiseTex.minFilter = THREE.LinearFilter;
cloudNoiseTex.generateMipmaps = false;
cloudNoiseTex.needsUpdate = true;

/* The noise is not spread evenly — most of it sits near the middle — so a cover is turned into a level by the
   noise's own distribution: the same mix cloudN makes in the shader, sampled at cell centres and sorted. */
const _cloudSorted = (() => {
  const N = CLOUD_N, px = (x, z) => _cloudBytes[((x & (N - 1)) + (z & (N - 1)) * N) * 4] / 255;
  const out = new Float32Array(16384);
  for (let i = 0; i < out.length; i++) {
    const cx = Math.floor(Math.random() * 4 * N), cz = Math.floor(Math.random() * 4 * N);
    const u = (cx + 0.5) / 4 - 0.5, w = (cz + 0.5) / 4 - 0.5, x0 = Math.floor(u), z0 = Math.floor(w), fx = u - x0, fz = w - z0;
    const b = (px(x0, z0) * (1 - fx) + px(x0 + 1, z0) * fx) * (1 - fz) + (px(x0, z0 + 1) * (1 - fx) + px(x0 + 1, z0 + 1) * fx) * fz;
    out[i] = 0.7 * px(cx, cz) + 0.3 * b;
  }
  return out.sort();
})();
const _cloudLevel = (cover) => cover < 0.01 ? 1 : cover > 0.97 ? 0 : _cloudSorted[Math.floor((1 - cover) * (_cloudSorted.length - 1))];

/* ---- the weather over the clouds: CLOUD_WX_N x CLOUD_WX_N regions around player one ---- */
const _cloudWxBytes = new Uint8Array(CLOUD_WX_N * CLOUD_WX_N * 4);
const cloudWxTex = new THREE.DataTexture(_cloudWxBytes, CLOUD_WX_N, CLOUD_WX_N, THREE.RGBAFormat, THREE.UnsignedByteType);
cloudWxTex.magFilter = cloudWxTex.minFilter = THREE.NearestFilter;
cloudWxTex.generateMipmaps = false;
const _cloudCur = new Map();                // "rx,rz" -> [cover, dark] as the sky shows it now, easing to the weather
let _cloudWxT = Infinity, _cloudScene = null;
function _cloudWeatherTick(dt, px, pz) {
  const H = worldClockDays() * 24, k = Math.min(1, dt / CLOUD_FADE_S);
  const rx0 = Math.floor(px / REGION_BLOCKS - 0.5) - 3, rz0 = Math.floor(pz / REGION_BLOCKS - 0.5) - 3;
  if (_cloudCur.size > 512) _cloudCur.clear();
  // a new world, or the title: its sky starts from its own weather, not the last world's storm (0.8198)
  const scene = (typeof menuScene !== 'undefined' && menuScene) ? 'title' : (typeof currentWorld !== 'undefined' && currentWorld ? currentWorld.id : '');
  if (scene !== _cloudScene) { _cloudScene = scene; _cloudCur.clear(); }
  for (let j = 0; j < CLOUD_WX_N; j++) for (let i = 0; i < CLOUD_WX_N; i++) {
    const rx = rx0 + i, rz = rz0 + j, key = rx + ',' + rz, type = _regionWeather(rx, rz, H).type;
    const tc = CLOUD_COVER[type] ?? 0.3, td = CLOUD_DARK[type] || 0;
    let c = _cloudCur.get(key);
    if (!c) _cloudCur.set(key, c = [tc, td]);                    // first seen: straight to its weather
    else { c[0] += (tc - c[0]) * k; c[1] += (td - c[1]) * k; }
    const o = (i + j * CLOUD_WX_N) * 4;
    _cloudWxBytes[o] = Math.round(_cloudLevel(c[0]) * 255);
    _cloudWxBytes[o + 1] = Math.round(c[1] * 255);
    _cloudWxBytes[o + 2] = Math.round(c[0] * 255);
    _cloudWxBytes[o + 3] = 255;
  }
  cloudWxTex.needsUpdate = true;
  sharedUniforms.uCloudBox.value.set(rx0, rz0, REGION_BLOCKS);
}
sharedUniforms.uCloudNoise.value = cloudNoiseTex;
sharedUniforms.uCloudWx.value = cloudWxTex;

/* ---- the same clouds on the CPU (0.817): the sky's overcast grey and the lens flare's clouds (07-sky.js) ---- */
// the weather's cloud at a world xz as the sky shows it now: [level, dark, cover] (cloudWx in 04)
function cloudWxAt(x, z) {
  const B = sharedUniforms.uCloudBox.value, W = CLOUD_WX_N, hi = W - 1.001;
  const u = Math.min(hi, Math.max(0, x / B.z - 0.5 - B.x)), v = Math.min(hi, Math.max(0, z / B.z - 0.5 - B.y));
  const i0 = Math.floor(u), j0 = Math.floor(v), i1 = Math.min(W - 1, i0 + 1), j1 = Math.min(W - 1, j0 + 1);
  let fu = u - i0, fv = v - j0;
  fu = fu * fu * (3 - 2 * fu); fv = fv * fv * (3 - 2 * fv);
  const at = (i, j, c) => _cloudWxBytes[(i + j * W) * 4 + c] / 255, out = [0, 0, 0];
  for (let c = 0; c < 3; c++)
    out[c] = (at(i0, j0, c) * (1 - fu) + at(i1, j0, c) * fu) * (1 - fv) + (at(i0, j1, c) * (1 - fu) + at(i1, j1, c) * fu) * fv;
  return out;
}
// the shape noise, eased like the shader's linear filter (cloudN in 04)
function _cloudNJS(px, pz) {
  const N = CLOUD_N, t = (x, z) => _cloudBytes[((x & (N - 1)) + (z & (N - 1)) * N) * 4] / 255;
  const bil = (u, w) => {
    const x0 = Math.floor(u), z0 = Math.floor(w), fx = u - x0, fz = w - z0;
    return (t(x0, z0) * (1 - fx) + t(x0 + 1, z0) * fx) * (1 - fz) + (t(x0, z0 + 1) * (1 - fx) + t(x0 + 1, z0 + 1) * fx) * fz;
  };
  return 0.7 * bil(px - 0.5, pz - 0.5) + 0.3 * bil(px / 4 - 0.5, pz / 4 - 0.5);
}
// how much cloud stands across a ray from p going d, where it crosses the middle of the layer (0..1)
function cloudCoverOnRay(p, d) {
  const mid = CLOUD_Y0 + CLOUD_H / 2;
  if (d.y <= 0.02 || p.y >= mid) return 0;
  const k = (mid - p.y) / d.y, x = p.x + d.x * k, z = p.z + d.z * k, off = sharedUniforms.uCloudOff.value;
  const lvl = cloudWxAt(x, z)[0], n = _cloudNJS(x - off.x, z - off.y);
  const s = Math.min(1, Math.max(0, (n - lvl + 0.03) / 0.04));
  return s * s * (3 - 2 * s);
}

/* ---- the layer itself: a box around the eye, every pixel of it marching its own ray ---- */
const _cloudTexLoader = new THREE.TextureLoader();
let _cloudTexReady = 0;
function _cloudTex(url) {
  const t = _cloudTexLoader.load(url, () => { if (++_cloudTexReady === 2) cloudMesh.visible = true; });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}
const CLOUD_ALPHA = 0.92;                   // clouds let 8% of what is behind them through (0.8195)
const cloudMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  side: THREE.BackSide,
  transparent: true,                        // a touch see-through (CLOUD_ALPHA); it still writes its depth
  uniforms: {
    ...sharedUniforms,                      // shared by reference: fog, day light and the cloud state stay live
    uCloudTex:  { value: _cloudTex('textures/Blocks/Natures/cloud.png') },
    uCloudDark: { value: _cloudTex('textures/Blocks/Natures/dark_cloud.png') },
    uCloudPx:   { value: 0.001 },           // world size of one screen pixel a block away, for the mip level
    uCloudLit:  { value: 1 },               // how lit the clouds are: day, or a little moonlight (0.819)
  },
  vertexShader: /* glsl */`
    out vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform mat4 projectionMatrix;
    uniform highp sampler2D uCloudTex;
    uniform highp sampler2D uCloudDark;
    uniform float uCloudPx, uCloudLit;
    uniform vec3 fogColor;
    uniform float fogNear, fogFar;
    uniform float uAmbient, uDirect;
    uniform vec3 uLightColor;
    in vec3 vWorld;
    out vec4 fragColor;
    ${CLOUD_GLSL}
    ${SKY_GLSL}
    void main() {
      vec3 ro = cameraPosition, rd = normalize(vWorld - ro);
      // clouds reach twice as far as the land's fog, so they carry on over the horizon
      float y1 = CLOUD_Y0 + CLOUD_H, far = fogFar * 2.0, t0, t1;
      if (abs(rd.y) < 1e-5) {
        if (ro.y <= CLOUD_Y0 || ro.y >= y1) discard;
        t0 = 0.0; t1 = far;
      } else {
        float ta = (CLOUD_Y0 - ro.y) / rd.y, tb = (y1 - ro.y) / rd.y;
        t0 = max(min(ta, tb), 0.0); t1 = min(max(ta, tb), far);
      }
      if (t0 >= t1) discard;
      // walk the cells from where the ray enters the layer, in cloud space
      vec3 o = ro - vec3(uCloudOff.x, 0.0, uCloudOff.y);
      float te = t0 + 1e-3;
      vec3 p = o + rd * te, cell = floor(p), st = sign(rd);
      vec3 inv = 1.0 / max(abs(rd), vec3(1e-6));
      vec3 tMax = te + mix(p - cell, cell + 1.0 - p, step(0.0, rd)) * inv;
      float t = t0, cb = 0.0, ct = 0.0;                 // this column's cloud: from cb to ct blocks up the layer
      int face = 1;                                     // entered through the layer's top or bottom
      vec2 lastC = vec2(1e9);
      vec3 wx = vec3(0.0);
      bool skip = t0 <= 0.0, hit = false;               // an eye inside a cloud looks out of it first
      for (int i = 0; i < ${CLOUD_STEPS}; i++) {
        if (cell.xz != lastC) {
          lastC = cell.xz;
          wx = cloudWx(cell.xz + 0.5 + uCloudOff);
          float n = cloudN(cell.xz + 0.5);
          if (n < wx.x) { cb = 0.0; ct = 0.0; }
          else {
            /* thicker further in, and centred in the layer give or take a block or two (0.816): the edges are
               thin wisps half way up, so the underside steps up towards them instead of lying flat */
            float k = min(${CLOUD_THICK}.0, 1.0 + floor((n - wx.x) / ${CLOUD_STEP_H}));
            float g = textureLod(uCloudNoise, (cell.xz + 0.5) / CLOUD_N, 0.0).g;
            cb = clamp(floor((CLOUD_H - k) * 0.5 + (g - 0.5) * 3.0 + 0.5), 0.0, CLOUD_H - k);
            ct = cb + k;
          }
        }
        float ly = cell.y - CLOUD_Y0;
        bool filled = ly >= cb && ly < ct;
        if (filled && !skip) { hit = true; break; }
        if (!filled) skip = false;
        if (tMax.x < tMax.y && tMax.x < tMax.z) { t = tMax.x; tMax.x += inv.x; cell.x += st.x; face = 0; }
        else if (tMax.y < tMax.z)               { t = tMax.y; tMax.y += inv.y; cell.y += st.y; face = 1; }
        else                                    { t = tMax.z; tMax.z += inv.z; cell.z += st.z; face = 2; }
        if (t > t1) break;
      }
      if (!hit) discard;
      vec3 hp = o + rd * t;                             // where the ray came into the cloud cell
      vec2 uv; float sh, facing;
      if (face == 1)      { uv = hp.xz;             sh = rd.y > 0.0 ? 0.72 : 1.0; facing = abs(rd.y); }
      else if (face == 0) { uv = vec2(hp.z, -hp.y); sh = 0.86;                    facing = abs(rd.x); }
      else                { uv = vec2(hp.x, -hp.y); sh = 0.8;                     facing = abs(rd.z); }
      float lod = clamp(log2(max(t * uCloudPx * 128.0 / max(facing, 0.15), 1.0)), 0.0, 7.0);
      vec3 col = mix(textureLod(uCloudTex, uv, lod).rgb, textureLod(uCloudDark, uv, lod).rgb, wx.y);
      col *= mix(vec3(1.0), vec3(0.5, 0.57, 0.74), wx.y);   // storm and darky clouds: darker, a cold blue-grey (0.8197)
      col *= sh * uLightColor * uCloudLit;                 // near black at night, as the sky (0.819)
      vec4 vp = viewMatrix * vec4(hp + vec3(uCloudOff.x, 0.0, uCloudOff.y), 1.0);
      fragColor = vec4(mix(col, fogColor + skyHaze(rd), smoothstep(fogNear * 2.0, far, -vp.z)), ${CLOUD_ALPHA});   // haze 0.817; see-through 0.8195
      /* its real depth, so hills and trees in front hide it; past the far plane it is still behind everything.
         Taken a few hundredths of a block nearer (0.818): a block face lying exactly on a cloud face — the layer's
         floors are whole numbers, like block tops — used to fight it and flicker; now the cloud wins. */
      vec4 cp = projectionMatrix * (viewMatrix * vec4(hp - rd * 0.03 + vec3(uCloudOff.x, 0.0, uCloudOff.y), 1.0));
      gl_FragDepth = min(cp.z / cp.w * 0.5 + 0.5, 0.99999);
    }`,
});
const cloudMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), cloudMat);
cloudMesh.visible = false;                  // until both textures are in
cloudMesh.frustumCulled = false;
cloudMesh.renderOrder = 5;                  // after the opaque land, before water and glass
cloudMesh.layers.set(1);                    // with the sky: never in the shadow maps
const _cloudVP = new THREE.Vector4();
// every viewport draws it around its own eye, sized to stay inside that camera's far plane
cloudMesh.onBeforeRender = function (r, _s, cam) {
  this.position.copy(cam.position);
  this.scale.setScalar(cam.far * 0.55);
  this.updateMatrixWorld(true);
  r.getCurrentViewport(_cloudVP);
  cloudMat.uniforms.uCloudPx.value = 2 * Math.tan((cam.fov || 75) * Math.PI / 360) / Math.max(1, _cloudVP.w);
};
scene.add(cloudMesh);

/* ---- per frame: drift with the wind, ease the weather in, and point the shade at the sun ---- */
function updateClouds(dt) {
  const p = typeof PLAYERS !== 'undefined' && PLAYERS[0] ? PLAYERS[0] : (typeof player !== 'undefined' ? player : null);
  if (!p || !p.pos) return;
  // a world made without clouds (0.837): no layer and no shadows from it
  const none = typeof currentWorld !== 'undefined' && !!currentWorld && currentWorld.clouds === false && !menuScene;
  cloudMesh.visible = !none && _cloudTexReady === 2;
  if (none) { sharedUniforms.uCloudOn.value = 0; return; }
  _cloudWxT += dt;
  if (_cloudWxT >= 0.25) { _cloudWeatherTick(Number.isFinite(_cloudWxT) ? _cloudWxT : 0, p.pos.x, p.pos.z); _cloudWxT = 0; }
  const w = weatherAt(p.pos.x, p.pos.z, CLOUD_Y0), [wx, wz] = windVector(w.dir), v = w.speed / 3.6 * CLOUD_WIND * dt;
  const off = sharedUniforms.uCloudOff.value, M = 4 * CLOUD_N;   // the noise repeats every 4N cells, so wrap there
  off.set(((off.x + wx * v) % M + M) % M, ((off.y + wz * v) % M + M) % M);
  // the way to the light that casts the shadows: the sun, or the moon on its own orbit since 0.817 (07-sky.js)
  sharedUniforms.uCloudSun.value.copy(skyLightDir);
  // clouds by night are all but as dark as the sky round them; a bright moon picks them out a little (0.819)
  cloudMat.uniforms.uCloudLit.value = Math.min(1, 0.035 + 0.965 * _skyDayF + 0.16 * _skyMoonGlow + 0.9 * skyFlash);   // + lightning
  sharedUniforms.uCloudOn.value = 1;
}

/* ================================== fog and the rainbow (0.816) ================================== */
const FOG_LIGHT_FAR = 40, FOG_DENSE_FAR = 8;   // how far you see in morning / after-rain fog, and in foggy weather
const FOG_EASE_S = 8;                          // real seconds the fog takes to thicken or clear round you
/* How far out of the weather a height is (0.8197): 0 in or under the cloud layer, 1 once clear of its top, eased over
   the top few blocks. Above the clouds there is no fog, no overcast grey and no hail: a clear sky, as in real life. */
const cloudsBelow = (y) => { const t = Math.min(1, Math.max(0, (y - (CLOUD_Y0 + CLOUD_H - 2)) / 4)); return t * t * (3 - 2 * t); };
const _mistGrey = new THREE.Color(0.74, 0.77, 0.8), _mistCol = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, 1e6, 1e7);   // three's own materials follow the land's fog (22, applyEyeVolumeFog)
/* The fog where this eye stands, eased per camera so walking into a foggy region (or the weather turning) closes
   in over a few seconds. Called on the surface branch of applyEyeVolumeFog, after it set the clear-air fog. */
/* A SANDSTORM (0.825, sandstormAt in 51-seasons.js) is a murk of its sand's colour, yellow or red by the ground under
   it. Round each eye it thickens over SAND_FOG_EASE_S (most of the way in 30-60 s) down to SAND_FOG_FAR blocks of
   sight; under a roof or in a cave it thins to SAND_FOG_ROOF_FAR, so the room is clear but the storm outside is not. */
const SAND_FOG_FAR = 3.5, SAND_FOG_ROOF_FAR = 18, SAND_FOG_EASE_S = 15, SAND_FOG_CLEAR_S = 8;
const _sandYellow = new THREE.Color(0.86, 0.71, 0.45), _sandRed = new THREE.Color(0.74, 0.4, 0.22), _sandCol = new THREE.Color();
function _sandAround(st, cam, now, dts) {
  if (st.sandT == null || now - st.sandT > 500) {      // sampled twice a second
    st.sandT = now;
    const x = cam.position.x, z = cam.position.z;
    st.sandAim = typeof sandstormAt === 'function' ? sandstormAt(x, z) : 0;
    if (st.sandAim > 0) st.sandRed = sandstormRedAt(x, z);
    st.sandInAim = getSkyWorld(Math.floor(x), Math.floor(cam.position.y), Math.floor(z)) < 12 ? 1 : 0;
    if (st.sand == null) { st.sand = st.sandAim; st.sandIn = st.sandInAim; }
  }
  st.sand += (st.sandAim - st.sand) * (1 - Math.exp(-dts / (st.sandAim > st.sand ? SAND_FOG_EASE_S : SAND_FOG_CLEAR_S)));
  st.sandIn += (st.sandInAim - st.sandIn) * (1 - Math.exp(-dts / 1.2));
  if (st.sand < 0.003) st.sand = 0;
}
/* RAIN AND SNOW FOG (0.83, precipAt in 51-seasons.js): a light grey haze in the rain, thicker the harder it falls
   (RAIN_FOG_FAR at its heaviest), a whiter one in falling snow (SNOW_FOG_FAR), and a blizzard's white-out
   (BLIZZARD_FOG_FAR; BLIZZARD_ROOF_FAR under a roof). Eased per eye like the sand. */
// a blizzard closes in to about 3 blocks (7 before 0.837), 14 under a roof (18)
const RAIN_FOG_FAR = 60, SNOW_FOG_FAR = 36, BLIZZARD_FOG_FAR = 3.2, BLIZZARD_ROOF_FAR = 14, PRECIP_FOG_EASE_S = 6;
const _rainGrey = new THREE.Color(0.5, 0.55, 0.62), _snowWhite = new THREE.Color(0.84, 0.87, 0.92), _wxCol = new THREE.Color();
function _precipAround(st, cam, now, dts) {
  if (st.wxT == null || now - st.wxT > 500) {          // sampled twice a second
    st.wxT = now;
    const pr = typeof precipAt === 'function' ? precipAt(cam.position.x, cam.position.z, cam.position.y) : { rain: 0, snow: 0, blizzard: 0 };
    st.rainAim = pr.rain; st.snowAim = pr.snow; st.blizAim = pr.blizzard;
    if (st.rain == null) { st.rain = st.rainAim; st.snow = st.snowAim; st.bliz = st.blizAim; }
  }
  const k = 1 - Math.exp(-dts / PRECIP_FOG_EASE_S);
  st.rain += (st.rainAim - st.rain) * k; st.snow += (st.snowAim - st.snow) * k; st.bliz += (st.blizAim - st.bliz) * k;
}
function applyMist(cam) {
  const m = mistAt(cam.position.x, cam.position.z), now = performance.now();
  let st = cam.userData.mist;
  if (!st) st = cam.userData.mist = { dense: m.dense, light: m.light, bow: m.bow, t: now };
  const dts = Math.min(1, (now - st.t) / 1000), k = 1 - Math.exp(-dts / FOG_EASE_S);
  st.t = now;
  st.dense += (m.dense - st.dense) * k; st.light += (m.light - st.light) * k; st.bow += (m.bow - st.bow) * k;
  _sandAround(st, cam, now, dts);
  _precipAround(st, cam, now, dts);                       // 0.83
  // above the cloud layer the air is clear, whatever the weather below (0.8197)
  // ...and Clear Eyes takes 30% off fog and sand alike (0.828, 45-skills.js)
  const sm = typeof playerSightMul === 'function' ? playerSightMul() : 1;   // vegetable sickness too (0.8323)
  const sky = 1 - cloudsBelow(cam.position.y), clear = sky * sm, dense = st.dense * clear, light = st.light * clear, sand = st.sand * clear;
  // under a roof the rain and snow are outside: a third of their haze (a blizzard's has its own roof distance)
  const roof = 1 - 0.65 * st.sandIn, rain = st.rain * clear * roof, snow = st.snow * clear * roof, bliz = st.bliz * clear;
  const U = sharedUniforms, baseFar = U.fogFar.value, ratio = U.fogNear.value / baseFar;
  let far = Math.min(baseFar, baseFar + (FOG_LIGHT_FAR - baseFar) * light);
  far += (Math.min(far, FOG_DENSE_FAR) - far) * dense;
  far += (Math.min(far, SAND_FOG_FAR + (SAND_FOG_ROOF_FAR - SAND_FOG_FAR) * st.sandIn) - far) * sand;   // 0.825
  far += (Math.min(far, RAIN_FOG_FAR) - far) * rain;                                                     // 0.83
  far += (Math.min(far, SNOW_FOG_FAR) - far) * snow;
  far += (Math.min(far, BLIZZARD_FOG_FAR + (BLIZZARD_ROOF_FAR - BLIZZARD_FOG_FAR) * st.sandIn) - far) * bliz;
  U.fogFar.value = far;
  U.fogNear.value = far * (ratio + (0.1 - ratio) * light) * (1 - dense) * (1 - sand)   // thick fog starts at the eye
                  * Math.max(0, 1 - 0.3 * rain - 0.4 * snow - 0.95 * bliz);
  const a = Math.max(dense, light);
  _mistCol.copy(_mistGrey).multiplyScalar(0.2 + 0.8 * _skyDayF);
  U.fogColor.value.lerp(_mistCol, a * 0.85);
  if (sand > 0) {
    _sandCol.copy(_sandYellow).lerp(_sandRed, st.sandRed || 0).multiplyScalar(0.2 + 0.8 * _skyDayF);
    U.fogColor.value.lerp(_sandCol, Math.min(1, sand * 1.15));
  }
  if (rain > 0.01) U.fogColor.value.lerp(_wxCol.copy(_rainGrey).multiplyScalar(0.2 + 0.8 * _skyDayF), rain * 0.6);
  const white = Math.min(1, snow * 0.7 + bliz);
  if (white > 0.01) U.fogColor.value.lerp(_wxCol.copy(_snowWhite).multiplyScalar(0.18 + 0.82 * _skyDayF), white);
  U.uDirect.value *= (1 - 0.5 * a) * (1 - 0.6 * sand) * (1 - 0.35 * rain) * (1 - 0.3 * snow) * (1 - 0.85 * bliz);   // the sun comes through soft (a blizzard all but hides it, 0.837)
  const wx = 0.3 * rain + 0.4 * snow + bliz;
  skyVisibility(Math.max(0, 1 - dense - 0.6 * light - sand - wx));
  // the sky dome greys over with it, all the way in thick fog, and the sun's glow fades (0.817)
  U.uSkyFog.value = Math.min(1, dense + 0.6 * light + sand + wx);
  U.uHaze.value = (1 - 0.8 * a) * (1 - 0.8 * sand) * Math.max(0, 1 - 0.8 * wx);
  const bow = st.bow * _skyDayF * sky * (1 - sand) * Math.max(0, 1 - 2 * (rain + snow));   // no rainbow while it still falls
  rainbowMat.uniforms.uBow.value = bow;
  rainbowMesh.visible = bow > 0.01;
}

// the rainbow: a flat ring facing the eye, 40 to 42.5 degrees round the point opposite the sun
const RAINBOW_IN = Math.tan(40 * Math.PI / 180), RAINBOW_OUT = Math.tan(42.5 * Math.PI / 180);
const rainbowMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uBow: { value: 0 } },
  vertexShader: /* glsl */`
    out vec2 vP;
    out float vUp;
    void main() {
      vP = position.xy;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vUp = w.y - cameraPosition.y;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform float uBow;
    in vec2 vP;
    in float vUp;
    out vec4 fragColor;
    void main() {
      if (vUp < 0.0) discard;                                        // never below the horizon
      float t = (length(vP) - ${RAINBOW_IN.toFixed(4)}) / ${(RAINBOW_OUT - RAINBOW_IN).toFixed(4)};   // 0 violet inside .. 1 red outside
      if (t < 0.0 || t > 1.0) discard;
      float h = (1.0 - t) * 0.78;                                    // hue: red outside, round to violet
      vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      fragColor = vec4(c, sin(3.14159 * t) * 0.42 * uBow);
    }`,
});
const rainbowMesh = new THREE.Mesh(new THREE.RingGeometry(RAINBOW_IN, RAINBOW_OUT, 160, 1), rainbowMat);
rainbowMesh.visible = false;
rainbowMesh.frustumCulled = false;
rainbowMesh.renderOrder = -1;               // over the sun and stars, under everything else
rainbowMesh.layers.set(1);                  // with the sky: never in the shadow maps
const _bowDir = new THREE.Vector3();
rainbowMesh.onBeforeRender = function (_r, _s, cam) {
  // the point opposite the sun, held no lower than 24 degrees under the horizon so a high sun still shows an arc
  const sx = sunDirW.x, sy = sunDirW.y, sz = sunDirW.z;   // the sun's real path, seasons and all (07-sky.js, 0.818)
  const hl = Math.hypot(sx, sz) || 1, e = Math.max(-Math.asin(Math.max(-1, Math.min(1, sy))), -0.42);
  _bowDir.set(-sx / hl * Math.cos(e), Math.sin(e), -sz / hl * Math.cos(e));
  const R = cam.far * 0.7;
  this.position.copy(cam.position).addScaledVector(_bowDir, R);
  this.scale.setScalar(R);
  this.lookAt(cam.position);
  this.updateMatrixWorld(true);
};
scene.add(rainbowMesh);
