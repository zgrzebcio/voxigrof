'use strict';
/* voxiGrof — day/night sky, sun & moon, shadow mapping */

/* ================================================================================================
   DAY/NIGHT SKY — a gradient dome, a round sun, the moon in its phase and the stars orbit the
   player on a slightly south-tilted celestial wheel (rise east, set west); see "the sky (0.817)".
   They render with depth-test on but no fog, so terrain silhouettes occlude them naturally.

   SHADOWS — hand-rolled shadow mapping (our chunk shader is custom, so three.js lights
   don't apply): every frame the world is depth-rendered from the sun/moon into two small
   maps — solid blocks (full-strength shadows) and leaves/glass (low-intensity shadows) —
   selected via object layers: 0 = solid chunks, 2 = cutout chunks, 3 = water, 1 = no-shadow
   extras (sky, selection box). ~6 texels per block keeps them chunky-but-soft: voxel-friendly.
   ================================================================================================ */
const DAY_LEN = 1200;                       // seconds per full day/night cycle (20 min)
let worldTime = 1 / 24;                     // 0 = sunrise, .25 = noon, .5 = sunset, .75 = midnight; 1/24 = 07:00
let worldDay = 0;                           // increments each full day cycle
let shadowR = parseInt(localStorage.getItem('vg_shadow'));
if (isNaN(shadowR)) shadowR = 110;          // shadow render distance in blocks (0 = off)

camera.layers.enable(1); camera.layers.enable(2); camera.layers.enable(3);

/* ---------- the sky (0.817) ----------
   The DOME is a shader on a box round the eye, drawn first and behind everything: the fog colour at the horizon
   rising to the zenith colour, the sun's halo and the sunset glow (skyHaze, 04), grey under an overcast sky, and
   the Milky Way at night. On it ride a round SUN, the MOON with its phase (lit from the real sun direction, on
   its own orbit: new beside the sun, full opposite it), twinkling STARS of different colours and brightness, and
   now and then a SHOOTING STAR. A small LENS FLARE follows the sun while no block or cloud is in the way.
   All of it is a handful of draws: the dome's pixels, one point cloud, four quads and a line. */
/* THE SUN'S PATH BY SEASON (0.818). The wheel is tilted by the world's latitude (SKY_LAT, about 40 degrees
   north; 0.12 before), and the sun sits off its middle by the season's declination, up to 23.4 degrees:
   north of it in summer (up early, down late, high at noon), south of it in winter. So a July day runs about
   04:35 to 19:25 and a January one about 07:25 to 16:35, with a noon sun of 73 and 27 degrees. The clock is
   untouched (06:00 is still worldTime 0); sunTimes() gives the day's sunrise and sunset, and everything that
   asks whether it is night (mobs, beds, fireflies) goes by those. The moon runs opposite the sun's
   declination when full, beside it when new. */
const SKY_LAT = 0.7;                        // radians: the wheel leans south by this much
const TIDE_MIN = 0.15, TIDE_MAX = 0.4;      // blocks the sea drops at low water: neap and spring tides (0.8191)
const SUN_DECL_MAX = 23.44 * Math.PI / 180;
const LUNAR_DAYS = 7;                       // one moon a month (MONTH_DAYS, 51): new on the 1st, full on the 4th
const _skyVS = /* glsl */`
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// the dome: horizon (= the fog colour) to zenith, the haze, the Milky Way; fogged over by uSkyFog
const skyDomeMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, side: THREE.BackSide, depthWrite: false, depthTest: false,
  uniforms: { ...sharedUniforms, uZenith: { value: new THREE.Color() }, uStarVis: { value: 0 }, uSkyInv: { value: new THREE.Matrix3() },
              uAurora: { value: 0 } },   // 0.819: the northern lights, 0..1 (53-storms.js)
  vertexShader: /* glsl */`
    out vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 fogColor, uZenith;
    uniform float uSkyFog, uStarVis, uAurora, uTime;
    uniform mat3 uSkyInv;
    uniform highp sampler2D uCloudNoise;
    ${SKY_GLSL}
    in vec3 vWorld;
    out vec4 fragColor;
    void main() {
      vec3 d = normalize(vWorld - cameraPosition);
      vec3 col = mix(fogColor, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.5)) + skyHaze(d);
      if (uStarVis > 0.01) {
        // the Milky Way: a band round the celestial sphere, turning with the stars, clumped by the cloud noise
        vec3 c = uSkyInv * d;
        float band = exp(-pow(dot(c, vec3(0.30, 0.52, 0.80)) / 0.17, 2.0));
        if (band > 0.02) {
          vec2 uv = vec2(atan(c.z, c.x) / 3.14159 * 3.0, asin(clamp(c.y, -1.0, 1.0)) / 1.5708 * 2.0);
          float n = textureLod(uCloudNoise, uv, 0.0).r * 0.6 + textureLod(uCloudNoise, uv * 3.0, 0.0).r * 0.4;
          col += vec3(0.5, 0.55, 0.7) * band * smoothstep(0.35, 0.9, n) * uStarVis * 0.07 * smoothstep(-0.05, 0.3, d.y);
        }
      }
      /* The aurora (0.819): curtains low in the northern sky (-z), a green hem that brightens sharply and fades
         upward into violet, rippling along and drawn in fine vertical rays by the cloud noise. */
      if (uAurora > 0.01 && d.y > 0.02) {
        float az = atan(d.x, -d.z), el = asin(clamp(d.y, 0.0, 1.0));
        float hem = 0.3 + 0.07 * sin(az * 3.0 + uTime * 0.07) + 0.04 * sin(az * 7.0 - uTime * 0.11);
        float up = el - hem;
        float curtain = smoothstep(-0.03, 0.0, up) * exp(-max(up, 0.0) / 0.16);
        float rays = textureLod(uCloudNoise, vec2(az * 2.5 + uTime * 0.004, 0.37), 0.0).r;
        rays = 0.35 + 0.65 * smoothstep(0.3, 0.8, rays) * (0.7 + 0.3 * sin(az * 90.0 + uTime * 0.6));
        float north = smoothstep(-0.1, 0.5, -d.z);
        vec3 ac = mix(vec3(0.15, 0.95, 0.45), vec3(0.55, 0.25, 0.85), smoothstep(0.0, 0.3, up));
        col += ac * curtain * rays * north * uAurora * 0.45;
      }
      fragColor = vec4(mix(col, fogColor, uSkyFog), 1.0);
    }`,
});
const skyDome = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), skyDomeMat);
skyDome.frustumCulled = false;
skyDome.renderOrder = -10;                  // first of all; it writes no depth, so everything draws over it
skyDome.onBeforeRender = function (_r, _s, cam) {
  this.position.copy(cam.position);
  this.scale.setScalar(cam.far * 0.5);
  this.updateMatrixWorld(true);
};

// the sun: a round disc with a soft glow, whiter in the middle, reddening low down (added onto the sky)
const sunMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uCol: { value: new THREE.Color(1, 0.96, 0.86) }, uVis: { value: 1 } },
  vertexShader: _skyVS,
  fragmentShader: /* glsl */`
    uniform vec3 uCol;
    uniform float uVis;
    in vec2 vUv;
    out vec4 fragColor;
    void main() {
      float r = length(vUv * 2.0 - 1.0);
      float disc = 1.0 - smoothstep(0.24, 0.28, r);
      float a = (disc + exp(-r * r * 14.0) * 0.45 * (1.0 - disc)) * uVis;
      if (a < 0.004) discard;
      fragColor = vec4(mix(uCol, vec3(1.0), disc * 0.5) * a, 1.0);
    }`,
});
// the moon's face: grey with darker seas and a scatter of craters, drawn once
function _moonTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#d8d8d2'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(120,122,128,0.45)';
  for (const [x, y, r] of [[24, 22, 11], [36, 28, 8], [20, 38, 7], [40, 42, 6], [30, 36, 5]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  for (let i = 0; i < 26; i++) {
    const x = 8 + rnd() * 48, y = 8 + rnd() * 48, r = 1 + rnd() * 3;
    g.fillStyle = 'rgba(90,90,95,0.5)'; g.beginPath(); g.arc(x + 0.5, y + 0.5, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(245,245,240,0.6)'; g.beginPath(); g.arc(x - 0.3, y - 0.3, r * 0.6, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}
// the moon: its face lit from where the sun really is, so the phase and its tilt come out on their own
const moonMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTex: { value: _moonTexture() }, uSunDir: sharedUniforms.uSunDir, uVis: { value: 0 }, uBlood: { value: 0 } },
  vertexShader: /* glsl */`
    out vec2 vUv;
    out vec3 vR, vU, vF;
    void main() {
      vUv = uv;
      mat3 m = mat3(modelMatrix);
      vR = normalize(m[0]); vU = normalize(m[1]); vF = normalize(m[2]);   // the quad faces the eye: F points back at it
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uTex;
    uniform vec3 uSunDir;
    uniform float uVis, uBlood;
    in vec2 vUv;
    in vec3 vR, vU, vF;
    out vec4 fragColor;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r2 = dot(p, p);
      if (r2 > 1.0) discard;
      vec3 n = normalize(p.x * vR + p.y * vU + sqrt(1.0 - r2) * vF);   // a point on the ball
      float lit = mix(smoothstep(-0.04, 0.1, dot(n, uSunDir)), 1.0, uBlood);   // a blood moon shows full (0.8192)
      float edge = 1.0 - smoothstep(0.92, 1.0, sqrt(r2));
      vec3 col = texture(uTex, vUv).rgb;
      col = mix(col, col * vec3(1.25, 0.32, 0.2), uBlood);
      fragColor = vec4(col * (lit + 0.035) * edge * uVis, 1.0);   // 0.035: earthshine
    }`,
});
const sunMesh  = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), sunMat);
const moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), moonMat);
sunMesh.position.set(100, 0, 0);            // each wheel's rotation carries them round; off its middle by season (0.818)
moonMesh.position.set(100, 0, 0);

// the stars: faint ones by the hundred, a few bright; white, blue-white, yellow and orange; more along the Milky Way
const STAR_N = 1800, STAR_BAND_N = 500;
const starGeo = new THREE.BufferGeometry();
{
  const n = STAR_N + STAR_BAND_N, pts = new Float32Array(n * 3), size = new Float32Array(n), bright = new Float32Array(n), col = new Float32Array(n * 3);
  const band = new THREE.Vector3(0.30, 0.52, 0.80).normalize(), v = new THREE.Vector3();
  const TINTS = [[0.15, [0.75, 0.85, 1]], [0.7, [1, 1, 1]], [0.9, [1, 0.92, 0.78]], [1, [1, 0.78, 0.6]]];
  for (let i = 0; i < n; i++) {
    const z = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
    v.set(rr * Math.cos(ph), rr * Math.sin(ph), z);
    if (i >= STAR_N) v.addScaledVector(band, -v.dot(band) * 0.88).normalize();   // pulled in towards the band
    pts[i * 3] = v.x * 100; pts[i * 3 + 1] = v.y * 100; pts[i * 3 + 2] = v.z * 100;
    const b = i >= STAR_N ? 0.15 + 0.3 * Math.random() : 0.18 + 0.82 * Math.pow(Math.random(), 3);
    bright[i] = b; size[i] = 1.2 + 2.4 * b * b;
    const r = Math.random(), tint = TINTS.find(t => r <= t[0])[1];
    col[i * 3] = tint[0]; col[i * 3 + 1] = tint[1]; col[i * 3 + 2] = tint[2];
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  starGeo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
}
const starMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uVis: { value: 0 }, uTime: sharedUniforms.uTime, uPx: { value: Math.min(window.devicePixelRatio, 2) } },
  vertexShader: /* glsl */`
    in float aSize;
    in float aBright;
    in vec3 aCol;
    uniform float uVis, uTime, uPx;
    out vec3 vC;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      float up = normalize(w.xyz - cameraPosition).y;
      // thinner down by the horizon, and a twinkle, quicker for the bright ones
      float a = aBright * uVis * smoothstep(-0.02, 0.25, up)
              * (0.78 + 0.22 * sin(uTime * (1.5 + 3.0 * aBright) + position.x * 1.7 + position.z * 2.3));
      vC = aCol * a;
      gl_PointSize = aSize * uPx;
      gl_Position = a < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;   // off screen by day
    }`,
  fragmentShader: /* glsl */`
    in vec3 vC;
    out vec4 fragColor;
    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      fragColor = vec4(vC * max(0.0, 1.0 - dot(c, c)), 1.0);
    }`,
});
const stars = new THREE.Points(starGeo, starMat);

// a shooting star: one line, head bright, tail fading
const meteorGeo = new THREE.BufferGeometry();
meteorGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
meteorGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 1]), 1));
const meteorMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uA: { value: 0 } },
  vertexShader: /* glsl */`
    in float aT;
    out float vT;
    void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uA;
    in float vT;
    out vec4 fragColor;
    void main() { fragColor = vec4(vec3(1.0, 0.97, 0.9) * (1.0 - vT) * uA, 1.0); }`,
});
const meteor = new THREE.LineSegments(meteorGeo, meteorMat);
meteor.frustumCulled = false;
meteor.visible = false;

// the lens flare: quads placed straight in screen space along the line from the sun through the middle
// [where on that line (1 = on the sun, 0 = the middle), size (share of the screen's height), colour, strength]
const FLARE = [[1, 0.2, [1, 0.9, 0.72], 0.3], [0.55, 0.035, [1, 0.8, 0.5], 0.22], [0.25, 0.022, [0.7, 1, 0.7], 0.18],
               [-0.2, 0.05, [0.6, 0.8, 1], 0.16], [-0.55, 0.03, [1, 0.7, 0.9], 0.14], [-0.9, 0.075, [0.7, 0.8, 1], 0.1]];
const FLARE_STRENGTH = 0.9;
const flareGeo = new THREE.BufferGeometry();
{
  const corner = [], k = [], size = [], col = [], idx = [];
  FLARE.forEach(([fk, fs, fc, fa], i) => {
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      corner.push(cx, cy, 0); k.push(fk); size.push(fs); col.push(fc[0] * fa, fc[1] * fa, fc[2] * fa);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  flareGeo.setAttribute('position', new THREE.Float32BufferAttribute(corner, 3));
  flareGeo.setAttribute('aK', new THREE.Float32BufferAttribute(k, 1));
  flareGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  flareGeo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  flareGeo.setIndex(idx);
}
const flareMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  uniforms: { uSunNdc: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uFlare: { value: 0 } },
  vertexShader: /* glsl */`
    in float aK;
    in float aSize;
    in vec3 aCol;
    uniform vec2 uSunNdc;
    uniform float uAspect, uFlare;
    out vec2 vC;
    out vec3 vCol;
    out float vGlare;
    void main() {
      vC = position.xy; vCol = aCol * uFlare; vGlare = aK > 0.99 ? 1.0 : 0.0;
      gl_Position = vec4(uSunNdc * aK + position.xy * aSize * vec2(1.0 / uAspect, 1.0) * 2.0, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    in vec2 vC;
    in vec3 vCol;
    in float vGlare;
    out vec4 fragColor;
    void main() {
      float r = length(vC);
      // the glare on the sun is a soft blur; a ghost is a faint disc, a little brighter at its rim
      float f = vGlare > 0.5 ? exp(-r * r * 5.0) : (1.0 - smoothstep(0.8, 1.0, r)) * (0.5 + 0.5 * r);
      fragColor = vec4(vCol * f, 1.0);
    }`,
});
const flareMesh = new THREE.Mesh(flareGeo, flareMat);
flareMesh.frustumCulled = false;
flareMesh.renderOrder = 999;                // on top of everything in the view
flareMesh.visible = false;

const sky = new THREE.Group();              // the sun and the stars, on the sun's wheel
const moonSky = new THREE.Group();          // the moon, on its own (it slips back a lap a lunar month)
sky.add(sunMesh, stars);
moonSky.add(moonMesh);
sunMesh.renderOrder = moonMesh.renderOrder = -2;
stars.renderOrder = -3;
for (const o of [sky, moonSky, skyDome, meteor, flareMesh]) { o.traverse(c => c.layers.set(1)); scene.add(o); }   // sky never casts shadows

/* ---------- shadow rig ---------- */
const SHADOW_SIZE = 1024;
function makeShadowRT() {
  const dt = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE);
  dt.compareFunction = THREE.LessCompare;   // sampler2DShadow + linear filter = hardware PCF
  dt.minFilter = dt.magFilter = THREE.LinearFilter;
  return new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthTexture: dt });
}
const rtShadowS = makeShadowRT(), rtShadowL = makeShadowRT();
sharedUniforms.tShadS.value = rtShadowS.depthTexture;
sharedUniforms.tShadL.value = rtShadowL.depthTexture;
renderer.setRenderTarget(rtShadowS); renderer.clear();  // prime: everything lit until first pass
renderer.setRenderTarget(rtShadowL); renderer.clear();
renderer.setRenderTarget(null);

const shadowCam = new THREE.OrthographicCamera(-110, 110, 110, -110, 1, 560);
function applyShadowDist() {
  shadowCam.left = -Math.max(shadowR, 1); shadowCam.right = Math.max(shadowR, 1);
  shadowCam.top = Math.max(shadowR, 1);   shadowCam.bottom = -Math.max(shadowR, 1);
  shadowCam.updateProjectionMatrix();
  shadowDirty = true;
  localStorage.setItem('vg_shadow', shadowR);
}
// slope-scaled offset while drawing the maps kills the "crawling stripes" acne on faces
// that are near-parallel to low morning/evening sun
const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: 2.5, polygonOffsetUnits: 6 });
let shadowDirty = true;                     // world changed since the maps were rendered
let shadowKey = 1e9, shadowTX = 1e9, shadowTY = 1e9;
const BIAS_MAT = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const _sv = new THREE.Vector3(), _sr = new THREE.Vector3(), _su = new THREE.Vector3();
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), _c4 = new THREE.Color();
/* Sky colours (0.817): a plainer blue by day, a near-black night with only a little blue, a warm horizon at
   dusk. HORIZON is also the fog colour; the sunset glow and the sun's halo come on top (skyHaze, 04). */
const DAY_ZENITH = new THREE.Color(0.33, 0.52, 0.82), DAY_HORIZON = new THREE.Color(0.7, 0.79, 0.88);
const NIGHT_ZENITH = new THREE.Color(0.008, 0.011, 0.022), NIGHT_HORIZON = new THREE.Color(0.03, 0.038, 0.06);
const DUSK_ZENITH = new THREE.Color(0.24, 0.26, 0.44), DUSK_HORIZON = new THREE.Color(0.86, 0.62, 0.48);
const MOON_SKY = new THREE.Color(0.03, 0.042, 0.07);           // what a full moon high up adds to the night sky
const OVERCAST = new THREE.Color(0.6, 0.63, 0.67);             // a sky under full cloud, by day
const SUN_HALO = new THREE.Color(1, 0.92, 0.75), DUSK_HALO = new THREE.Color(1, 0.62, 0.32), DUSK_GLOW = new THREE.Color(0.95, 0.42, 0.14);
const SUN_COL = new THREE.Color(1, 0.96, 0.86), SUN_LOW = new THREE.Color(1, 0.55, 0.25);
const DAY_LIGHT = new THREE.Color(1, 1, 1), NIGHT_LIGHT = new THREE.Color(0.62, 0.68, 0.86), DUSK_LIGHT = new THREE.Color(1, 0.74, 0.52);   // night less blue (0.817)
const smoothstepJS = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };

const _sf = new THREE.Vector3(), _sd = new THREE.Vector3();
const _shadowMid = new THREE.Vector3();
function _shadowCenter() {
  if (typeof PLAYERS === 'undefined' || PLAYERS.length < 2) return player.pos;
  _shadowMid.set(0, 0, 0);
  let n = 0;
  for (const p of PLAYERS) if (p.spawned) { _shadowMid.add(p.pos); n++; }
  return n ? _shadowMid.multiplyScalar(1 / n) : player.pos;
}
function renderShadowMaps(dir, key) {
  _sd.copy(dir);                            // defensive copy: callers pass shared temps
  // establish the light's basis independent of the player (rotation only depends on dir)
  shadowCam.up.set(0, 0, 1);                // never parallel to the tilted sun path
  shadowCam.position.copy(_sd).multiplyScalar(250);
  shadowCam.lookAt(0, 0, 0);
  shadowCam.updateMatrixWorld(true);
  _sr.setFromMatrixColumn(shadowCam.matrixWorld, 0);   // light-space right
  _su.setFromMatrixColumn(shadowCam.matrixWorld, 1);   // light-space up
  _sf.setFromMatrixColumn(shadowCam.matrixWorld, 2);   // light-space forward

  // snap the window centre to whole texels IN THE LIGHT'S FIXED BASIS — the world-to-map
  // alignment then never shifts sub-texel as the player moves, so edges don't shimmer
  /* One shadow map serves every split-screen viewport, so it is centred on the MIDPOINT of the
     players rather than on any one of them (0.72). Solo that is exactly the old behaviour; with
     players spread further apart than `shadowR` the outermost ones simply fall outside the map,
     which is the same graceful degradation distance already causes in single player. */
  const p = _shadowCenter();
  const texel = (Math.max(shadowR, 1) * 2) / SHADOW_SIZE;
  const tx = Math.round(p.dot(_sr) / texel) * texel;
  const ty = Math.round(p.dot(_su) / texel) * texel;
  if (!shadowDirty && key === shadowKey && tx === shadowTX && ty === shadowTY) return;
  shadowDirty = false; shadowKey = key; shadowTX = tx; shadowTY = ty;

  _sv.copy(_sr).multiplyScalar(tx).addScaledVector(_su, ty).addScaledVector(_sf, p.dot(_sf));
  shadowCam.position.copy(_sv).addScaledVector(_sd, 250);
  shadowCam.lookAt(_sv.x, _sv.y, _sv.z);
  shadowCam.updateMatrixWorld(true);
  sharedUniforms.uShadowMat.value.copy(BIAS_MAT)
    .multiply(shadowCam.projectionMatrix)
    .multiply(shadowCam.matrixWorldInverse);

  scene.overrideMaterial = depthMat;
  shadowCam.layers.set(0);                  // solid chunks -> full shadows
  renderer.setRenderTarget(rtShadowS);
  renderer.clear();
  renderer.render(scene, shadowCam);
  shadowCam.layers.set(2);                  // leaves/glass -> low-intensity shadows
  renderer.setRenderTarget(rtShadowL);
  renderer.clear();
  renderer.render(scene, shadowCam);
  scene.overrideMaterial = null;
  renderer.setRenderTarget(null);
}

// where the sun and the moon are (unit vectors from the eye), and which of them the shadows come from (0.817)
const sunDirW = new THREE.Vector3(1, 0, 0), moonDirW = new THREE.Vector3(-1, 0, 0), skyLightDir = new THREE.Vector3(0, 1, 0);
/* A point on the tilted wheel at angle a (the sun's is worldTime * 2 PI) and declination dec: the sky groups'
   own rotation (SKY_LAT about x, then a about z) applied to (cos dec, 0, -sin dec), worked out. */
const _skyDir = (v, a, dec) => {
  const cd = Math.cos(dec), sd = Math.sin(dec), cl = Math.cos(SKY_LAT), sl = Math.sin(SKY_LAT);
  return v.set(cd * Math.cos(a), cd * Math.sin(a) * cl + sd * sl, cd * Math.sin(a) * sl - sd * cl);
};
// the sun's declination on a day (radians): + in summer, - in winter, from the calendar (51); 1 July's with seasons off
function sunDeclination(t = worldDay + worldTime) {
  if (typeof gameDate !== 'function') return 0;
  const d = gameDate(t), yf = (d.month * MONTH_DAYS + d.day - 1 + (t - Math.floor(t))) / (12 * MONTH_DAYS);
  return SUN_DECL_MAX * Math.sin(2 * Math.PI * (yf - 0.22));   // 0.22 of the year: the March equinox
}
/* Today's sunrise and sunset as worldTime (0.818): rise is before 0 in summer (06:00 is 0), set = 0.5 - rise.
   Worked out once a day. isDarkTime: is it night at t, counting `early` before sunset as night already. */
let _sunTimesKey = null, _sunTimes = { rise: 0, set: 0.5 };
function sunTimes() {
  const key = worldDay + (typeof seasonsOn === 'function' && !seasonsOn() ? 'f' : '');
  if (key !== _sunTimesKey) {
    _sunTimesKey = key;
    const x = Math.max(-1, Math.min(1, -Math.tan(sunDeclination(worldDay + 0.25)) * Math.tan(SKY_LAT)));
    const rise = Math.asin(x) / (2 * Math.PI);
    _sunTimes = { rise, set: 0.5 - rise };
  }
  return _sunTimes;
}
function isDarkTime(t = worldTime, early = 0) {
  const { rise, set } = sunTimes(), u = t > 0.75 ? t - 1 : t;   // u: -0.25 (00:00) .. 0.75
  return u >= set - early || u < rise;
}
// the moon's phase, 0 new .. 0.5 full .. 1 new again, how much of it is lit, and what that is called
const moonPhase = () => (((worldDay + worldTime) / LUNAR_DAYS) % 1 + 1) % 1;
const moonLit = (p = moonPhase()) => (1 - Math.cos(p * Math.PI * 2)) / 2;
const MOON_PHASE_NAMES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon',
                          'waning gibbous', 'last quarter', 'waning crescent'];
const moonPhaseName = (p = moonPhase()) => MOON_PHASE_NAMES[Math.round(p * 8) % 8];

/* The sky dome is drawn around whichever eye is rendering, so in split screen it has to be
   re-seated for every viewport — otherwise players standing far apart would see the sun hanging
   off to one side. Rotation and brightness are world state and stay in updateDayNight.
   The lens flare is worked out here too, per eye (0.817); updateDayNight's own call skips it. */
function alignSkyTo(cam, flare = true) {
  const s = cam.far * 0.008;                             // children sit at radius 100
  for (const g of [sky, moonSky, meteor]) { g.position.copy(cam.position); g.scale.setScalar(s); }
  sunMesh.lookAt(cam.position);
  moonMesh.lookAt(cam.position);
  if (flare) _aimFlare(cam);
}
/* ---- the lens flare (0.817): only while the sun is in view and nothing stands in front of it ---- */
const _fv = new THREE.Vector3(), _fd = new THREE.Vector3();
let _flareRaw = 0;
// how much of the sun a block hides from here: 1 behind anything solid, a leaf takes a share
function _sunBlocked(p, d) {
  let x = p.x, y = p.y, z = p.z, leaf = 0;
  for (let i = 0; i < 128 && y < 200; i++) {
    x += d.x * 0.75; y += d.y * 0.75; z += d.z * 0.75;
    const v = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    if (!v) continue;
    if (CORE.opaqueVal(v) || CORE.solidVal(v)) return 1;
    if (typeof LEAF_BLOCKS !== 'undefined' && LEAF_BLOCKS.has(v & 255) && (leaf += 0.35) >= 1) return 1;
  }
  return leaf;
}
function _aimFlare(cam) {
  _fv.copy(sunDirW).multiplyScalar(cam.far * 0.5).add(cam.position).project(cam);
  cam.getWorldDirection(_fd);
  const facing = _fd.dot(sunDirW);
  let f = 0;
  if (facing > 0.3 && _fv.z < 1) {
    const edge = 1 - smoothstepJS(0.85, 1.25, Math.max(Math.abs(_fv.x), Math.abs(_fv.y)));
    f = FLARE_STRENGTH * edge * smoothstepJS(0.3, 0.95, facing) * smoothstepJS(-0.02, 0.08, sunDirW.y);
    if (f > 0.003) f *= (1 - _sunBlocked(cam.position, sunDirW))
                     * (1 - (typeof cloudCoverOnRay === 'function' ? cloudCoverOnRay(cam.position, sunDirW) : 0));
  }
  _flareRaw = f;
  flareMat.uniforms.uSunNdc.value.set(_fv.x, _fv.y);
  flareMat.uniforms.uAspect.value = cam.aspect || 1;
}
/* Clean per-frame lighting values, captured before any viewport applies its own water or lava
   murk on top. Each render pass restores from these rather than from whatever the previous
   viewport left in the uniforms. */
const _skyFogColor = new THREE.Color();
let _skyAmbient = 0, _skyDirect = 0;
// ...and how much day it is, and how clear the sun, moon and stars are, before any fog hides them (0.816)
let _skyDayF = 1, _skySunO = 1, _skyMoonO = 0, _skyStarO = 0, _skyMoonGlow = 0;   // moon glow: how moonlit the night is (0.819)
// a lightning flash, 1 at the strike and fading (53-storms.js sets it): lights the sky and the land for a moment (0.819)
let skyFlash = 0;
// the blood moon, 0..1 (53-storms.js sets it, 0.8192): a red moon, full whatever its phase, a red night sky and light
let skyBlood = 0;
const BLOOD_HORIZON = new THREE.Color(0.2, 0.035, 0.03), BLOOD_ZENITH = new THREE.Color(0.07, 0.01, 0.012), BLOOD_LIGHT = new THREE.Color(1, 0.42, 0.36);
const FLASH_COL = new THREE.Color(0.78, 0.83, 1);
// k: how much of the sky shows through this eye's fog, 0..1 (the flare goes with the sun)
function skyVisibility(k) {
  sunMat.uniforms.uVis.value = _skySunO * k;
  moonMat.uniforms.uVis.value = _skyMoonO * k;
  moonMat.uniforms.uBlood.value = skyBlood;
  starMat.uniforms.uVis.value = _skyStarO * k;
  skyDomeMat.uniforms.uStarVis.value = _skyStarO * k;
  meteor.visible = _meteor.t < _meteor.dur && k > 0.05;
  const fl = _flareRaw * k;
  flareMat.uniforms.uFlare.value = fl;
  flareMesh.visible = fl > 0.003;
}

/* ---- shooting stars (0.817): one at a time, every 20 to 70 seconds of a clear night ---- */
const _meteor = { t: 1, dur: 0, wait: 30, a: new THREE.Vector3(), b: new THREE.Vector3() };
const _mh = new THREE.Vector3(), _mt = new THREE.Vector3();
function _updateMeteor(dt, vis) {
  const m = _meteor;
  if (m.t < m.dur) {
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    _mh.copy(m.a).addScaledVector(m.b, 0.3 * k).normalize().multiplyScalar(100);                 // head
    _mt.copy(m.a).addScaledVector(m.b, 0.3 * Math.max(0, k - 0.35)).normalize().multiplyScalar(100);   // tail
    const pos = meteorGeo.attributes.position;
    pos.setXYZ(0, _mh.x, _mh.y, _mh.z); pos.setXYZ(1, _mt.x, _mt.y, _mt.z);
    pos.needsUpdate = true;
    meteorMat.uniforms.uA.value = Math.sin(Math.PI * k) * vis;
    return;
  }
  if (vis < 0.4 || (m.wait -= dt) > 0) return;
  m.wait = 20 + Math.random() * 50;
  const az = Math.random() * Math.PI * 2, el = 0.35 + Math.random() * 0.7;
  m.a.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  m.b.set(Math.random() - 0.5, -0.4 - Math.random() * 0.5, Math.random() - 0.5);   // mostly across and down
  m.b.addScaledVector(m.a, -m.b.dot(m.a)).normalize();
  m.t = 0; m.dur = 0.5 + Math.random() * 0.5;
}

const _skyRot = new THREE.Matrix4();
function updateDayNight(dt) {
  const _prevTime = worldTime;
  worldTime = (worldTime + dt / DAY_LEN) % 1;
  if (worldTime < _prevTime) worldDay++;
  const a = worldTime * Math.PI * 2, ph = moonPhase(), lit = moonLit(ph), am = a - ph * Math.PI * 2;
  // the season moves the sun off the wheel's middle, and a full moon the other way (0.818)
  const dec = sunDeclination(), decM = dec * Math.cos(ph * Math.PI * 2);
  sky.rotation.set(SKY_LAT, 0, a);                     // tilt south + spin east->west
  moonSky.rotation.set(SKY_LAT, 0, am);                // the moon trails the sun by its phase (0.817)
  sunMesh.position.set(100 * Math.cos(dec), 0, -100 * Math.sin(dec));
  moonMesh.position.set(100 * Math.cos(decM), 0, -100 * Math.sin(decM));
  _skyDir(sunDirW, a, dec); _skyDir(moonDirW, am, decM);
  /* The tides (0.8191): high water twice a day, when the moon is overhead and when it is underfoot, low between.
     Round a new or full moon the range is widest and the waves biggest (spring tides), at the quarters least. */
  const spring = Math.abs(Math.cos(ph * Math.PI * 2));
  sharedUniforms.uTide.value = (TIDE_MIN + (TIDE_MAX - TIDE_MIN) * spring) * (1 - Math.cos(2 * (am - Math.PI / 2))) / 2;
  sharedUniforms.uWaveMul.value = 0.85 + 0.5 * spring;
  alignSkyTo(camera, false);
  const sunElev = sunDirW.y, moonElev = moonDirW.y;

  const dayF  = smoothstepJS(-0.06, 0.16, sunElev);
  const duskF = Math.exp(-Math.pow(sunElev / 0.12, 2));
  const moonGlow = smoothstepJS(-0.02, 0.25, moonElev) * lit * (1 - dayF);   // a bright moon up lightens the night
  // cloud cover where player one is (52-clouds.js): a grey sky, no sunset glow, a hidden halo
  const p1 = typeof PLAYERS !== 'undefined' && PLAYERS[0] ? PLAYERS[0] : (typeof player !== 'undefined' ? player : null);
  const cw = typeof cloudWxAt === 'function' && p1 && p1.pos ? cloudWxAt(p1.pos.x, p1.pos.z) : null;
  // ...unless player one is up above the clouds, where the sky is clear (0.8197)
  const above = typeof cloudsBelow === 'function' && p1 && p1.pos ? cloudsBelow(p1.pos.y) : 0;
  const cover = cw ? cw[2] * (1 - above) : 0, dark = cw ? cw[1] * (1 - above) : 0, clearSky = 1 - cover * 0.85;
  _c4.copy(OVERCAST).multiplyScalar((0.12 + 0.88 * dayF) * (1 - 0.45 * dark));
  // the horizon, which is also the fog colour, and the zenith
  _c1.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, dayF).lerp(DUSK_HORIZON, duskF * 0.35).add(_c2.copy(MOON_SKY).multiplyScalar(moonGlow)).lerp(_c4, cover * 0.7);
  _c3.copy(NIGHT_ZENITH).lerp(DAY_ZENITH, dayF).lerp(DUSK_ZENITH, duskF * 0.4).add(_c2.copy(MOON_SKY).multiplyScalar(moonGlow * 0.6)).lerp(_c4, cover * 0.85);
  if (skyBlood > 0.001) {                             // the blood moon's red night (0.8192)
    const k = skyBlood * (1 - dayF);
    _c1.lerp(BLOOD_HORIZON, k * 0.75); _c3.lerp(BLOOD_ZENITH, k * 0.6);
  }
  if (skyFlash > 0) { _c1.lerp(FLASH_COL, skyFlash * 0.6); _c3.lerp(FLASH_COL, skyFlash * 0.5); }
  sharedUniforms.fogColor.value.copy(_c1);
  renderer.setClearColor(_c1);
  skyDomeMat.uniforms.uZenith.value.copy(_c3);
  // the haze: the sun's halo, reddening low down, and the sunset glow along the horizon
  sharedUniforms.uSunDir.value.copy(sunDirW);
  const sunUp = smoothstepJS(-0.05, 0.05, sunElev);
  sharedUniforms.uSunHalo.value.copy(SUN_HALO).lerp(DUSK_HALO, duskF).multiplyScalar(0.9 * sunUp * clearSky);
  sharedUniforms.uDuskCol.value.copy(DUSK_GLOW).multiplyScalar(duskF * 0.55 * clearSky);
  sunMat.uniforms.uCol.value.copy(SUN_COL).lerp(SUN_LOW, duskF);
  _skyRot.makeRotationFromEuler(sky.rotation);
  skyDomeMat.uniforms.uSkyInv.value.setFromMatrix4(_skyRot).transpose();   // world -> the stars' own frame

  _c2.copy(NIGHT_LIGHT).lerp(DAY_LIGHT, dayF).lerp(DUSK_LIGHT, duskF * 0.45);
  if (skyBlood > 0.001) _c2.lerp(BLOOD_LIGHT, skyBlood * (1 - dayF) * 0.7);   // red light under a blood moon (0.8192)
  sharedUniforms.uLightColor.value.copy(_c2);
  // 0.8242: 0.048 of the sun moved into the day's ambient below (shadows 15% lighter), so sunlit faces stay as they were
  const sunI  = 0.692 * smoothstepJS(0.0, 0.22, sunElev);   // day peak ~0.98 total: no overexposure
  // moonlight follows the phase (0.817): a full moon as bright as before, a new moon a fifth of it
  const moonI = 0.12 * (0.2 + 0.8 * lit) * smoothstepJS(0.0, 0.22, moonElev);
  // a moonlit night is lighter all round, by the phase (0.8191): up to +0.08 under a full moon high up
  sharedUniforms.uAmbient.value = 0.17 + 0.198 * dayF + 0.08 * moonGlow + 0.75 * skyFlash;   // day 0.32 -> 0.368 (0.8242); night unchanged   // ambient floor: how dark cast shadows get; + a flash
  sharedUniforms.uDirect.value  = Math.max(sunI, moonI);
  _skySunO  = Math.min(1, Math.max(0, (sunElev + 0.10) * 8));
  _skyMoonO = Math.min(1, Math.max(0, (moonElev + 0.10) * 8)) * (0.35 + 0.65 * (1 - dayF));   // pale by day
  _skyStarO = (1 - dayF) * 0.95 * (1 - 0.4 * moonGlow) * (1 - 0.5 * skyBlood);                                        // a full moon drowns the faint ones
  _updateMeteor(dt, _skyStarO * clearSky);

  const useSun = sunI >= moonI;
  skyLightDir.copy(useSun ? sunDirW : moonDirW);
  if (shadowR > 0 && Math.max(sunI, moonI) > 0.02) {
    // near real-time: the shadow sun steps ~0.015° (~20/s). The soft PCF filter blurs each
    // step's sub-texel edge shift into a smooth crawl, so even at this rate there's no flicker
    // — shadows track the sun almost continuously (verify FPS holds; it's the pricier setting)
    const STEP = Math.PI / 12000;
    const qa = Math.floor((useSun ? a : am) / STEP) * STEP;   // the moon on its own wheel since 0.817
    _skyDir(_sv, qa, useSun ? dec : decM);
    renderShadowMaps(_sv, qa + (useSun ? 0 : 7));
    sharedUniforms.uShadowOn.value = 1;
  } else {
    sharedUniforms.uShadowOn.value = 0;
  }
  // snapshot the clean values for the per-viewport fog pass
  _skyFogColor.copy(sharedUniforms.fogColor.value);
  _skyAmbient = sharedUniforms.uAmbient.value;
  _skyDirect  = sharedUniforms.uDirect.value;
  _skyDayF = dayF; _skyMoonGlow = moonGlow;
  skyVisibility(1);
}

