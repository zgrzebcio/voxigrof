'use strict';
/* voxiGrof — shared shader (VSH/FSH), uniforms, three materials */

/* ================================================================================================
   MATERIALS — one shared shader for all three passes. The `tile` vertex attribute selects
   the texture-array layer (0.809); UVs are in tile units and the layer wraps them in hardware.
   ================================================================================================ */
THREE.ColorManagement.enabled = false;   // raw sRGB passthrough — pixels match the source art

const SKY = new THREE.Color(0x8fc8ee);
const sharedUniforms = {
  map:        { value: null },
  fogColor:   { value: SKY.clone() },
  fogNear:    { value: 80 },
  fogFar:     { value: 150 },
  // day/night lighting + shadow mapping (defaults sum to 1.0 so block icons render neutral)
  uShadowMat:  { value: new THREE.Matrix4() },
  tShadS:      { value: null },              // depth map: solid blocks (full shadows)
  tShadL:      { value: null },              // depth map: leaves/glass (soft, low intensity)
  uAmbient:    { value: 0.30 },
  uDirect:     { value: 0.70 },
  uLeafShadow: { value: 0.45 },              // how much direct light a leaf shadow removes
  uShadowOn:   { value: 0 },
  uLightColor: { value: new THREE.Color(1, 1, 1) },
  uGlowColor:  { value: new THREE.Color(1.0, 0.82, 0.45) },   // warm glowstone block-light tint
  uTime:       { value: 0 },
  uTileLayer:  { value: TILE_LAYER },          // tile -> texture-array layer: an animated tile's current frame (0.8093)
  // the wind where the player stands (0.81, 51-seasons.js): which way it blows, and its ground speed in km/h (0.812)
  uWindDir:    { value: new THREE.Vector2(0, 0) },
  uWindSpeed:  { value: 0 },
  /* Per-tile colour multiplier. The spruce needle art is nearly white, so rather than authoring a
     second PNG the tile is tinted at draw time. One slot is enough today; if a second tinted tile
     ever appears, promote these to small uniform arrays and loop. */
  uTintTile:   { value: -1 },
  // packed light byte forced onto every vertex, or -1 for "use the baked one" (0.7521: drops)
  uLightOverride: { value: -1 },
  uTintColor:  { value: new THREE.Color(0.42, 0.66, 0.46) },   // cold blue-green conifer
  // the cloud layer (0.815, 52-clouds.js): its shape noise, the weather over it, how far it has drifted,
  // and the way to the sun or moon, so the ground under a cloud gets its shade. Off for icons and hands.
  uCloudOn:    { value: 0 },
  uCloudNoise: { value: null },
  uCloudWx:    { value: null },
  uCloudBox:   { value: new THREE.Vector3(0, 0, 256) },   // the weather texture's first region x, z, and a region's size in blocks
  uCloudOff:   { value: new THREE.Vector2(0, 0) },
  uCloudSun:   { value: new THREE.Vector3(0, 1, 0) },
  // the sky's haze (0.817, 07-sky.js): the sun's halo and the sunset glow, which the fog takes on too so the far
  // land melts into the sky round the sun; uHaze 0 in water, lava. uSkyFog: how far the sky itself is fogged over.
  uSunDir:     { value: new THREE.Vector3(1, 0, 0) },
  uSunHalo:    { value: new THREE.Color(0, 0, 0) },
  uDuskCol:    { value: new THREE.Color(0, 0, 0) },
  uHaze:       { value: 1 },
  uSkyFog:     { value: 0 },
  // the moon's pull on the sea (0.8191, 07-sky.js): how far the sea surface stands below full height now, and how big its waves are
  uTide:       { value: 0 },
  uWaveMul:    { value: 1 },
  // how much of a chunk is showing, 0..1: a chunk fades in when it arrives and out when it leaves (0.8195, 11-chunks.js).
  // Always 1 here; a fading chunk's meshes carry a material of their own with their own value.
  uFade:       { value: 1 },
  // the water's warm and cold colour as a multiple of its usual one (0.8231, WATER_TINT in 03-atlas.js)
  uWaterWarm:  { value: new THREE.Vector3(...WATER_TINT.warm.map((v, i) => v / WATER_TINT.base[i])) },
  uWaterCold:  { value: new THREE.Vector3(...WATER_TINT.cold.map((v, i) => v / WATER_TINT.base[i])) },
};
/* The haze of the sky in a direction (0.817): added to the fog colour, so it is the same on the sky dome, the
   clouds and the fogged land. A soft halo round the sun, and near the horizon a sunset glow, strongest on the
   sun's side. */
const SKY_GLSL = /* glsl */`
  uniform vec3 uSunDir, uSunHalo, uDuskCol;
  uniform float uHaze;
  vec3 skyHaze(vec3 d) {
    float mu = max(dot(d, uSunDir), 0.0);
    vec2 hz = normalize(d.xz + vec2(1e-4)), sz = normalize(uSunDir.xz + vec2(1e-4));
    float side = max(dot(hz, sz), 0.0);
    return (uSunHalo * (0.22 * pow(mu, 5.0) + 0.55 * pow(mu, 48.0))
          + uDuskCol * exp(-abs(d.y) * 5.0) * (0.2 + 0.8 * side * side)) * uHaze;
  }`;
const GLOW_LEVEL = 14;   // glowstone emission (light reaches this many blocks through open air)

/* ---- clouds (0.815) ----
   One layer of block clouds from CLOUD_Y0, up to CLOUD_H blocks thick. Its shape is a tiling noise texture
   (CLOUD_N cells a side, a cell a block), read in CLOUD SPACE — world minus uCloudOff, so the whole layer
   drifts with the wind. How much of it is cloud comes from the weather under it: uCloudWx holds, per weather
   region, the noise level a cell must reach to be cloud (r), how dark the cloud is (g) and its cover (b).
   The same functions draw the clouds (52-clouds.js) and shade the ground beneath them (FSH below). */
const CLOUD_Y0 = 175, CLOUD_H = 7, CLOUD_N = 256, CLOUD_WX_N = 8;   // 4 tall until 0.816
const CLOUD_SHADE = 0.2;     // light a white cloud takes; a dark one takes 75%
const CLOUD_GLSL = /* glsl */`
  uniform float uCloudOn;
  uniform highp sampler2D uCloudNoise;
  uniform highp sampler2D uCloudWx;
  uniform vec3 uCloudBox;
  uniform vec2 uCloudOff;
  uniform vec3 uCloudSun;
  const float CLOUD_Y0 = ${CLOUD_Y0}.0, CLOUD_H = ${CLOUD_H}.0, CLOUD_N = ${CLOUD_N}.0;
  // the weather's cloud at a world xz: (level, dark, cover), eased between region centres like weatherAt
  vec3 cloudWx(vec2 w) {
    vec2 u = clamp(w / uCloudBox.z - 0.5 - uCloudBox.xy, vec2(0.0), vec2(${CLOUD_WX_N - 1}.0 - 0.001));
    vec2 i0 = floor(u), f = u - i0;
    f = f * f * (3.0 - 2.0 * f);
    ivec2 a = ivec2(i0), b = min(a + 1, ivec2(${CLOUD_WX_N - 1}));
    vec3 c00 = texelFetch(uCloudWx, a, 0).rgb, c10 = texelFetch(uCloudWx, ivec2(b.x, a.y), 0).rgb;
    vec3 c01 = texelFetch(uCloudWx, ivec2(a.x, b.y), 0).rgb, c11 = texelFetch(uCloudWx, b, 0).rgb;
    return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
  }
  // the shape noise at a cloud-space xz: exactly one cell's value at its centre, eased in between
  float cloudN(vec2 p) {
    return 0.7 * textureLod(uCloudNoise, p / CLOUD_N, 0.0).r + 0.3 * textureLod(uCloudNoise, p / (4.0 * CLOUD_N), 0.0).r;
  }
  // how much of the sun (or moon) reaches a world point past the clouds, 1 = all of it
  float cloudShade(vec3 wp) {
    if (uCloudOn < 0.5 || wp.y >= CLOUD_Y0) return 1.0;
    vec2 at = wp.xz + uCloudSun.xz / max(uCloudSun.y, 0.2) * (CLOUD_Y0 - wp.y);   // up the ray to the light
    vec3 wx = cloudWx(at);
    float cov = smoothstep(wx.x - 0.03, wx.x + 0.01, cloudN(at - uCloudOff));
    return 1.0 - cov * mix(${CLOUD_SHADE}, 0.75, wx.y);
  }`;

const VSH = /* glsl */`
  in float tile;
  in float shade;
  in float blockLight;
  uniform float uLightOverride;
  uniform mat4 uShadowMat;
  uniform highp sampler2D uTileLayer;
  uniform vec2 uWindDir;
  uniform float uWindSpeed;
  uniform float uTime;
  uniform float uFade;                       // a chunk fading in: plants grow up with it (0.8196)
  in float clim;                             // the climate colour, -1 cold .. 1 warm (0.8231)
  out float vClim;
  out vec2 vUv;
  flat out float vTile;
  out float vShade;
  out float vDepth;
  out float vBlock;
  out vec3 vSC;
  out vec3 vWp;                              // world position, for the cloud shade (0.815)
  void main() {
    vUv = uv; vTile = tile; vShade = shade; vClim = clim;
    vBlock = uLightOverride >= 0.0 ? uLightOverride : blockLight;                      // flood-filled block-light level (0..15) for this face
    vec4 wp = modelMatrix * vec4(position, 1.0);
    /* The wind (0.81): plants bend from the foot the way it blows, leaves drift a touch. Every term is a
       function of world position and time, so two leaf blocks sharing an edge move it together. */
    /* 0.812: the bend follows the wind's SPEED, the height bonus added here per vertex (51-seasons.js
       windHeightBonus), and a faster wind shakes it faster too. */
    float sk = texelFetch(uTileLayer, ivec2(int(tile + 0.5), 0), 0).b;
    /* A chunk fading in (0.8196): its grass and flowers grow up out of the ground as it comes, a beat behind the
       land, rather than being there at once. A plant's height above its foot is uv.y (a tall plant's top half
       carries on from 1), so squashing that keeps every foot where it is and both halves joined. */
    if (uFade < 0.999 && (sk > 0.5 && sk < 1.5 || sk > 2.5)) {
      float grow = smoothstep(0.25, 1.0, uFade);
      wp.y -= (sk > 2.5 ? 1.0 + uv.y : uv.y) * (1.0 - grow);
    }
    /* 0.819: plants LEAN the way the wind blows, harder the stronger it is, and gusts roll across a field as waves
       travelling with the wind (their phase runs along the wind, not scattered per plant). Leaves are big and
       stiff: in a light wind they only stir a little every which way; a strong one leans the canopy with it.
       Every term uses the vertex's world position only (never a greedy quad's UVs), so shared corners agree. */
    if (sk > 0.5 && uWindSpeed > 0.0) {
      float hb = wp.y <= 60.0 ? 0.0 : wp.y <= 100.0 ? 5.0 * (wp.y - 60.0) / 40.0 : 5.0 + (wp.y - 100.0) * 0.08;
      float amp = min(1.6, (uWindSpeed + hb) / 40.0);
      float along = dot(wp.xz, uWindDir);
      if (sk > 1.5 && sk < 2.5) {
        float strong = smoothstep(0.35, 1.1, amp);
        vec2 stir = vec2(sin(uTime * 1.9 + wp.x * 0.9 + wp.y * 0.4), sin(uTime * 1.6 + wp.z * 0.8 + wp.y * 0.6));
        float gust = 0.55 + 0.45 * sin(uTime * (0.9 + amp * 1.5) - along * 0.15);
        wp.xz += stir * (0.012 + 0.018 * amp) * (1.0 - 0.6 * strong) + uWindDir * (0.08 * strong * gust);
      } else {
        float h = sk > 2.5 ? 1.0 + uv.y : uv.y;          // the upper half of a tall plant carries on from the lower
        float wave = 0.65 + 0.35 * sin(uTime * (1.0 + amp * 2.0) - along * 0.35);
        wp.xz += uWindDir * (amp * h * 0.2 * wave);
      }
    }
    vWp = wp.xyz;
    vSC = (uShadowMat * wp).xyz;             // position in the shadow map's [0,1] space
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FSH = /* glsl */`
  uniform highp sampler2DArray map;                 // the block textures, a layer per tile (0.809)
  uniform highp sampler2D uTileLayer;
  uniform vec3 fogColor;
  uniform float fogNear, fogFar;
  uniform highp sampler2DShadow tShadS;
  uniform highp sampler2DShadow tShadL;
  uniform float uAmbient, uDirect, uLeafShadow, uShadowOn, uFade;
  uniform vec3 uLightColor;
  uniform float uTintTile;
  uniform vec3 uTintColor;
  uniform vec3 uGlowColor;
  uniform float uTime;
  uniform vec3 uWaterWarm, uWaterCold;              // water's warm and cold colour over its usual blue (0.8231)
  in float vClim;
  in vec2 vUv;
  flat in float vTile;
  in float vShade;
  in float vDepth;
  in float vBlock;
  in vec3 vSC;
  in vec3 vWp;
  out vec4 fragColor;
  ${CLOUD_GLSL}
  ${SKY_GLSL}
  // soft 5-tap PCF: spreads the shadow edge across a few texels so the small per-update
  // sub-texel shifts of the moving sun read as a smooth gradient crawl, never a hard flicker
  // (and gives chunky, low-detail soft shadows that suit the voxel look)
  float pcf(highp sampler2DShadow s, vec2 uv, float d) {
    const float t = 1.7 / 1024.0;
    return 0.2 * (texture(s, vec3(uv, d))
      + texture(s, vec3(uv + vec2( t,  t), d)) + texture(s, vec3(uv + vec2(-t,  t), d))
      + texture(s, vec3(uv + vec2( t, -t), d)) + texture(s, vec3(uv + vec2(-t, -t), d)));
  }
  void main() {
    // one layer of the texture array per tile, wrapping on its own (0.809): UVs are in tile units, so a
    // greedy quad repeats its texture with plain hardware wrapping and the mips never see a neighbour.
    // An animated tile (water, lava, 0.8093) looks up the layer of its current frame; the rest map to themselves.
    // a chunk fading in or out is drawn in a fine dither, more of it each frame (0.8195): no sorting, no pop
    if (uFade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= uFade) discard;
    vec4 tlv = texelFetch(uTileLayer, ivec2(int(vTile + 0.5), 0), 0);
    vec2 tl = tlv.rg;                                 // .g: its glow mask's layer, or -1 (0.8094)
    vec4 tex = texture(map, vec3(vUv, tl.x));
    // an animated tile eases into its next frame (0.8193): .a is that frame's layer plus how far along it is
    if (tlv.a >= 0.0) tex = mix(tex, texture(map, vec3(vUv, floor(tlv.a))), fract(tlv.a));
    /* The climate colour (0.8231): row 1 of uTileLayer says what the tile does with it. Grass (1) mixes toward its
       warm (.g) or cold (.b) tile, water (2) toward a cyan or a deep blue. vClim is 0 on every other face. */
    if (abs(vClim) > 0.004) {
      vec4 tt = texelFetch(uTileLayer, ivec2(int(vTile + 0.5), 1), 0);
      float k = min(1.0, abs(vClim));
      if (tt.r > 1.5) tex.rgb *= mix(vec3(1.0), vClim > 0.0 ? uWaterWarm : uWaterCold, k);
      else if (tt.r > 0.5) tex = mix(tex, texture(map, vec3(vUv, vClim > 0.0 ? tt.g : tt.b)), k);
    }
    if (tex.a < 0.02) discard;
    if (uTintTile >= 0.0 && abs(vTile - uTintTile) < 0.5) tex.rgb *= uTintColor;
    // packed light byte: low nibble = flood-filled block light (glow), high nibble = sky light.
    // Sky scales the sun's contribution so caves go genuinely dark; glow is sun-independent
    // and still lights caves & night. Curves kept gentle so level-14 faces aren't blown out.
    float skyN = floor(vBlock / 16.0 + 0.001);
    float bl = (vBlock - skyN * 16.0) / 15.0;
    float sky = skyN / 15.0;
    // sun/moon shadows: soft PCF compare against the two depth maps. Without a map (shadows off, or past the
    // shadow window far from the player) the sky light stands in for it (0.8245; everything counted as lit
    // before, so turning shadows off lit every cave with the sun): open sky in the sun, a cave in the dark.
    float sS = smoothstep(0.6, 1.0, sky), sL = 1.0;
    if (uShadowOn > 0.5 && vSC.x > 0.01 && vSC.x < 0.99 && vSC.y > 0.01 && vSC.y < 0.99 && vSC.z < 0.999) {
      float d = vSC.z - 0.0003;   // constant bias; slope acne handled by polygonOffset on the maps
      sS = pcf(tShadS, vSC.xy, d);
      sL = pcf(tShadL, vSC.xy, d);
    }
    float direct = uDirect * sS * (1.0 - uLeafShadow * (1.0 - sL));
    // quadratic falloff, but off a higher floor: unlit faces now bottom out at 24% of daylight
    // instead of 12%, so shadowed sides and cave mouths stay readable rather than near-black
    // ...and 15% lighter still since 0.8242 (0.24): caves and deep shade less near-black
    float skyF = 0.276 + 0.724 * sky * sky;
    // part-linear curve: light-source edges (low levels) stay visibly bright instead of
    // quadratic-fading to black; peak slightly above the old 1.15
    vec3 block = uGlowColor * (bl * 0.45 + bl * bl * 0.85);
    // under a cloud the sky's light is less (0.815): a little for a white one, 75% for a dark one; caves never notice
    vec3 lit = tex.rgb * vShade * (uLightColor * (uAmbient + direct) * skyF * mix(1.0, cloudShade(vWp), sky) + block);
    // a light source's glowing pixels keep their own colour whatever the light around them (0.8094)
    if (tl.y >= 0.0) lit = mix(lit, tex.rgb, texture(map, vec3(vUv, tl.y)).a);
    float fog = smoothstep(fogNear, fogFar, vDepth);
    vec3 fogC = fogColor;
    if (fog > 0.0) fogC += skyHaze(normalize(vWp - cameraPosition));   // the far land takes the sky's glow (0.817)
    fragColor = vec4(mix(lit, fogC, fog), tex.a);
  }`;

// Water-specific vertex shader: sinusoidal Y-wave on top faces (shade ≈ 1.0)
const VSH_WATER = /* glsl */`
  in float tile;
  in float shade;
  in float blockLight;
  uniform float uLightOverride;
  uniform mat4 uShadowMat;
  uniform float uTime, uTide, uWaveMul;
  in float clim;
  out float vClim;
  out vec2 vUv;
  flat out float vTile;
  out float vShade;
  out float vDepth;
  out float vBlock;
  out vec3 vSC;
  out vec3 vWp;                              // world position, for the cloud shade (0.815)
  void main() {
    vUv = uv; vTile = tile; vShade = shade; vClim = clim;
    vBlock = uLightOverride >= 0.0 ? uLightOverride : blockLight;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // Waving surface vertices are marked with shade 253/255 by emitWater; every vertex of one
    // waving cell carries the SAME light byte, so top quad and side-quad top edge stay welded.
    if (shade > 0.985) {
      /* EVERY term here must be a pure function of world position and time — never of per-cell
         data such as blockLight. Adjacent water cells share their edge vertices but are drawn as
         separate quads, so a per-cell amplitude makes the two sides of a shared edge displace by
         different amounts and rips the surface open into thin transparent slits. (Depth-scaled
         amplitude did exactly that; depth still drives the surface COLOUR, which is per-cell and
         harmless.) A low-frequency swell field varies wave height across the ocean instead: it is
         smooth in world space, so both sides of any shared edge always agree. */
      float swell = 0.65 + 0.35 * sin(wp.x * 0.035 + 1.7) * cos(wp.z * 0.028 - 0.9);
      float amp = 0.085 * swell * uWaveMul;             // bigger waves round a full or new moon (0.8191)
      /* The tide (0.8191): the sea's surface (sea-level water only, so a mountain lake keeps still) sinks by uTide
         at low water. Only ever DOWN from full: raised above its cell the sheet would float over the beach. */
      if (wp.y > 99.4 && wp.y < 100.3) wp.y -= uTide;
      // three octaves at low spatial frequency: long rolling swells rather than fast ripples,
      // with a diagonal cross-wave so the pattern never looks like a plain grid
      wp.y += sin(wp.x * 0.55 + uTime * 1.5) * amp
            + cos(wp.z * 0.42 + uTime * 1.15) * amp * 0.75
            + sin((wp.x + wp.z) * 0.9 + uTime * 2.4) * amp * 0.35;
    }
    vWp = wp.xyz;
    vSC = (uShadowMat * wp).xyz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

function makeMat(opts) {
  const { vertexShader: vs, ...rest } = opts;
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: sharedUniforms,
    vertexShader: vs || VSH,
    fragmentShader: FSH,
    ...rest,
  });
}
const matOpaque = makeMat({});
const matCutout = makeMat({ transparent: true, depthWrite: true, side: THREE.DoubleSide }); // leaves, plants (glass until 0.8263)
                                              // double-sided: standing inside a bush you see the
                                              // canopy shell around you instead of x-raying out
const matWater  = makeMat({ transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: VSH_WATER }); // water with wave
// Lava: opaque fluid with slow surface wave; always emissive (lite=255 hardcoded in emitLava)
const VSH_LAVA = /* glsl */`
  in float tile;
  in float shade;
  in float blockLight;
  uniform float uLightOverride;
  uniform mat4 uShadowMat;
  uniform float uTime;
  out float vClim;
  out vec2 vUv;
  flat out float vTile;
  out float vShade;
  out float vDepth;
  out float vBlock;
  out vec3 vSC;
  out vec3 vWp;                              // world position, for the cloud shade (0.815)
  void main() {
    vUv = uv; vTile = tile; vShade = shade; vClim = 0.0;
    vBlock = uLightOverride >= 0.0 ? uLightOverride : blockLight;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    if (shade > 0.985) {
      wp.y += sin(wp.x * 0.55 + uTime * 0.45) * 0.045
            + cos(wp.z * 0.45 + uTime * 0.35) * 0.03;
    }
    vWp = wp.xyz;
    vSC = (uShadowMat * wp).xyz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const matLava = makeMat({ vertexShader: VSH_LAVA });
/* Glass (0.8263): its own pass, blended WITHOUT writing depth and drawn after everything else in its chunk. In the cutout
   pass the first glass face drawn hid every glass face behind it, so glass seen through other glass went missing
   from some sides. Blending in any order costs nothing that shows on art this clear. */
const matGlass  = makeMat({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
const MATERIALS = [matOpaque, matCutout, matWater, matLava, matGlass];
// spruce needles ship almost white; tint the tile instead of shipping a second sheet
sharedUniforms.uTintTile.value = CORE.T.SPRUCE_LEAVES;

