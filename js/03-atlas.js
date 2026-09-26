'use strict';
/* voxiGrof — block textures: one texture ARRAY, a 128px layer per tile (64px LOW) (0.809) */


/* ================================================================================================
   THE TEXTURE ARRAY (0.809). Every block tile is a layer of its own in one sampler2DArray, instead of a
   cell of a 2D sheet. What that buys:
   - ROOM. The tile index is a Uint16 now (it was a Uint8, 256 at most), and a GPU holds 2048 layers or
     more (WebGL2 promises 256; real desktop and phone GPUs say 2048), so a few hundred tiles is fine.
   - NO GUTTERS. A layer wraps on its own (REPEAT), so the mip chain never bleeds into a neighbour and
     greedy quads repeat with plain hardware wrapping. The 2D sheet spent more than half its texels on
     wrapped copies: 256 tiles now take ~22 MB with mips where the sheet took ~48 MB.
   The mesher and every UV are unchanged: a face still names its tile, and UVs are in tile units.
   Older 64px art is stretched 2x with NEAREST, so it looks exactly as it did. */
const ART_PX = 128;                               // the size every block tile is normalised to (0.808)
const OAK_LEAF_TINT = 'rgb(104,158,64)';          // the grey oak leaf art, multiplied by this leaf green (0.809)
const BIRCH_LEAF_TINT = 'rgb(128,167,85)';        // birch's paler, yellower green (0.8093)
/* ================================================================================================ */

/* ---- texture quality (0.752; array 0.809) ----
   HIGH: 128px layers. LOW: every tile halved to 64px, a quarter of the memory; LOW also switches off
   anisotropic filtering (one of the most expensive per-pixel costs a phone GPU pays) and renders block
   icons at half size (05-icons.js).

   'auto' picks LOW on a touch-first device or on one reporting 4 GB of memory or less. The menu can pin
   either tier. Only the layer size in pixels changes, so the shader, the mesher and every UV are untouched. */
const TEX_Q_KEY = 'vg_texq';
function detectLowTextures() {
  try {
    if (matchMedia('(pointer: coarse)').matches) return true;
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;        // Chromium only
  } catch {}                                                  // renderer not up yet: say HIGH
  return false;
}
function texQuality() {
  let pref = null;
  try { pref = localStorage.getItem(TEX_Q_KEY); } catch {}
  if (pref === 'high' || pref === 'low') return pref;
  return detectLowTextures() ? 'low' : 'high';
}
const atlasTilePx = () => texQuality() === 'low' ? ART_PX / 2 : ART_PX;   // one layer's side (0.809)

/* LOW tier: one tile at half size. Done by hand rather than with canvas smoothing, which is not a
   box filter in every browser and, worse, blends the transparent gaps of a cutout tile into its
   colour — grass and flowers would grow dark fringes. Each 2×2 block becomes one texel: the colour
   is the alpha-weighted mean of the texels actually present, and a tile whose alpha is strictly
   on/off (leaves, plants, torches) stays strictly on/off, covered where two of the four are.
   Glass and anything else genuinely translucent keeps its averaged alpha. */
function _halfTile(img) {
  const F = ART_PX, H = F / 2;                        // 128 -> 64 (0.808)
  const full = document.createElement('canvas');
  full.width = full.height = F;
  const fg = full.getContext('2d', { willReadFrequently: true });
  fg.imageSmoothingEnabled = false;
  fg.drawImage(img, 0, 0, F, F);                      // the same stretch the HIGH tier applies
  const s = fg.getImageData(0, 0, F, F).data;
  let binary = true;
  for (let i = 3; i < s.length; i += 4) if (s[i] !== 0 && s[i] !== 255) { binary = false; break; }
  const half = document.createElement('canvas');
  half.width = half.height = H;
  const hg = half.getContext('2d');
  const out = hg.createImageData(H, H), d = out.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < H; x++) {
      let r = 0, g = 0, b = 0, a = 0, on = 0;
      for (let k = 0; k < 4; k++) {
        const i = ((y * 2 + (k >> 1)) * F + x * 2 + (k & 1)) * 4, w = s[i + 3];
        r += s[i] * w; g += s[i + 1] * w; b += s[i + 2] * w; a += w;
        if (w === 255) on++;
      }
      const o = (y * H + x) * 4;
      if (a > 0) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; }
      d[o + 3] = binary ? (on >= 2 ? 255 : 0) : a / 4;
    }
  hg.putImageData(out, 0, 0);
  return half;
}

/* Changing tier from the menu rebuilds the sheet in place — no reload. Materials cloned earlier
   (a held block, a dropped item) keep a reference to the previous sheet until they are rebuilt;
   that is harmless, because UVs are fractions and both sheets carry identical art. Queued, so
   flicking the select back and forth cannot race two builds onto the same uniform. */
let _texSwitch = Promise.resolve();
function applyTexQuality(pref) {
  try {
    if (pref === 'high' || pref === 'low') localStorage.setItem(TEX_Q_KEY, pref);
    else localStorage.removeItem(TEX_Q_KEY);
  } catch {}
  _texSwitch = _texSwitch.then(async () => {
    const old = sharedUniforms.map.value;
    if (!old || !old.image || old.image.width === atlasTilePx()) return;   // already right
    const tex = await buildAtlas();
    tex.anisotropy = Math.min(tex.anisotropy, renderer.capabilities.getMaxAnisotropy());
    sharedUniforms.map.value = tex;
    if (old !== tex) old.dispose();
  }).catch(() => {});
  return _texSwitch;
}
const ATLAS_TILES = ['grass_block_top', 'grass_block_side', 'dirt', 'stone', 'sand', 'bedrock',
                     'oak_log', 'oak_log_top', 'oak_planks', 'oak_leaves', 'glass', 'water', 'glowstone',
                     'clay', 'snow', 'grass_block_snow', 'cobblestone',
                     'coal_ore', 'iron_ore', 'diamond_ore', 'gravel', 'red_mushroom', 'brown_mushroom',
                     'crafting_bench_top', 'crafting_bench_front', 'crafting_bench_side', 'torch',
                     'furnace_front', 'furnace_front_on', 'furnace_side', 'furnace_top',
                     'red_sand', 'cactus_side', 'cactus_top', 'cactus_bottom', 'bricks', 'melon_top', 'melon_side' 
                     ,'stone_brick', 'wool', 'pumpkin_top', 'pumpkin_side', 'wheat_full'
                     ,'birch_log', 'birch_log_top', 'birch_planks', 'birch_leaves'
                     ,'hay_top', 'hay_side', 'marble', 'granite', 'limestone'
                     ,'grass', 'poppy', 'orchid', 'tallgrass_bottom', 'tallgrass_top', 'lava'
                     ,'tin_ore', 'gold_ore', 'copper_ore'
                     ,'obsidian', 'tnt_top', 'tnt_side', 'tnt_bottom'
                     ,'sulfur_block', 'sulfur_down_tip', 'sulfur_up_tip'
                     ,'tnt_lit'
                     ,'oak_sapling', 'birch_sapling', 'sugar_cane'
                     ,'stripped_oak_log', 'stripped_oak_log_top'
                     ,'stripped_birch_log', 'stripped_birch_log_top'
                     ,'spruce_log', 'spruce_log_top', 'spruce_planks', 'spruce_leaves'
                     ,'spruce_sapling'
                     ,'stripped_spruce_log', 'stripped_spruce_log_top'
                     ,'pincushions', 'structure_block'
                     ,'berry_bush_empty', 'berry_bush_fruitling', 'berry_bush_red'
                     ,'flint_rock', 'flint_rock_top'
                     ,'berry_bush_blue', 'berry_bush_small'
                     ,'glow_vine', 'glowcrystal'                   // 0.765
                     ,'cobweb', 'emerald_ore', 'ruby_ore', 'sapphire_ore'     // 0.766
                     ,'coal_block', 'charcoal_block', 'iron_block', 'gold_block', 'tin_block', 'copper_block'   // 0.768
                     ,'diamond_block', 'emerald_block', 'ruby_block', 'sapphire_block'
                     ,'raw_iron_block', 'raw_gold_block', 'raw_tin_block', 'raw_copper_block'
                     ,'topaz_ore', 'topaz_block', 'sandstone_top', 'sandstone', 'sandstone_bottom'   // 0.769
                     ,'red_sandstone_top', 'red_sandstone', 'red_sandstone_bottom', 'fiber_block', 'ladder'
                     ,'blue_mushroom'                                 // 0.7691
                     ,'mossy_stone_brick', 'cracked_stone_brick', 'mossy_cobblestone', 'sulfur_bricks'   // variants, 0.7941
                     ,'granite_bricks', 'marble_bricks', 'limestone_bricks'
                     ,'berry_bush_yellow'                             // 0.7947
                     ,'furnace_top_open'                              // 0.801
                     ,'tnt_top_lit'                                   // made below from tnt_top (0.804)
                     // 0.809: dolomite, the mossy and polished rocks, the stone furnace's chimney
                     ,'dolomite', 'dolomite_bricks', 'mossy_dolomite_bricks', 'polished_dolomite'
                     ,'mossy_granite_bricks', 'mossy_marble_bricks', 'mossy_limestone_bricks'
                     ,'polished_granite', 'polished_marble', 'polished_limestone'
                     ,'chimney_side', 'chimney_top'
                     // a furnace per rock, and a bench per wood (0.809); the order must match T in 02-voxel-core.js
                     ,...FURNACE_ROCKS.slice(1).flatMap(r => FURNACE_PARTS.map(p => furnaceTileName(r, p)))
                     ,'crafting_bench_bottom'
                     ,...BENCH_WOODS.slice(1).flatMap(w => BENCH_PARTS.map(p => benchTileName(w, p)))
                     // 0.8091: sand sides, polished stone, adobe, the glass looks, salt crust, cantaloupe
                     ,'sand_side', 'red_sand_side', 'polished_stone', 'adobe', 'adobe_brick'
                     ,'dark_glass', 'greenhouse_glass', 'glass_bricks', 'dark_glass_bricks', 'salt_crust'
                     ,'cantaloupe_side', 'cantaloupe_top', 'cantaloupe_bottom'
                     // the mushroom models, five sheets per kind (0.8091)
                     ,...MUSHROOM_KINDS.flatMap(k => MUSHROOM_PARTS.map(p => mushroomTileName(k, p)))
                     // 0.8093: flowing water and lava, terracotta brick, band and pillar for every rock
                     ,'water_flow', 'lava_flow', 'terracotta_bricks'
                     ,...DECOR_ROCKS.flatMap(r => DECOR_PARTS.map(p => `${r}_${p}`))];
// tiles drawn at their own size in a layer's corner, 8 texels per model pixel, not stretched (0.8091)
const MUSHROOM_NATIVE = new Set(MUSHROOM_KINDS.flatMap(k => MUSHROOM_PARTS.map(p => mushroomTileName(k, p))));
const IMAGES = {}; // name -> HTMLImageElement (also reused for hotbar / radial icons)

// glowstone uses the embedded texture if present; otherwise a procedural warm-speckle fallback
// so the game runs before the real PNG is injected (same data-URI slot, transparently replaced)
if (!TEXTURES.lava) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 16; gx++) {
    const n = Math.random();
    g.fillStyle = n < 0.07 ? '#fff8c0' : n < 0.22 ? '#ffcc00' : n < 0.55 ? '#ff7200' : n < 0.82 ? '#cc2e00' : '#881100';
    g.fillRect(gx * 4, gy * 4, 4, 4);
  }
  // brighten centre blob
  for (let k = 0; k < 12; k++) {
    g.fillStyle = '#ffaa00';
    g.fillRect((4 + (Math.random() * 8 | 0)) * 4, (4 + (Math.random() * 8 | 0)) * 4, 8, 8);
  }
  TEXTURES.lava = c.toDataURL();
}

if (!TEXTURES.glowstone) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 16; gx++) {
    const n = Math.random();
    g.fillStyle = n < 0.12 ? '#fff2c0' : n < 0.4 ? '#ffd873' : n < 0.75 ? '#e9b449' : '#c9922f';
    g.fillRect(gx * 4, gy * 4, 4, 4);
  }
  for (let k = 0; k < 9; k++) { g.fillStyle = '#fff6d0'; g.fillRect((Math.random() * 14 | 0) * 4, (Math.random() * 14 | 0) * 4, 8, 8); }
  TEXTURES.glowstone = c.toDataURL();
}

function loadImage(name, url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { IMAGES[name] = img; res(img); };
    img.onerror = rej;
    img.src = url || TEXTURES[name];
  });
}

/* ================================================================================================
   IN-WORLD ART — item sprites, armour sheets, and the block art that is NOT in the atlas
   ================================================================================================

   None of this is needed to draw the title panorama, so 0.7146 stopped loading it at boot; the
   first frame no longer waited on a pile of files the menu never touches. The cost landed on world
   ENTRY instead — around a hundred separate PNG requests — which is the five to ten seconds of
   invisible items and blank icons after joining.

   Two changes fix that (0.724), the same two the atlas already uses:

   1. It is CACHED. Every image is stored, once, as a PNG blob inside a single IndexedDB record,
      so later boots do one read instead of a hundred round trips. The key carries GAME_VERSION and
      the number of images, so adding or changing art misses the cache and refetches.

   2. It is STARTED AT BOOT, in the background, the moment the atlas is ready — while the player is
      still looking at the title screen. Entering a world then usually finds it already done. It is
      still awaited before icons are drawn, because an icon is a rasterised snapshot: taken early,
      it is a blank square for the rest of the session.

   MESH_TEXTURES is the part that has to be here rather than in the atlas: the door panel, the bed,
   the chest and the sheep's fleece own their own three.js meshes and sample IMAGES directly.
   buildAtlas loads all of TEXTURES on its stitching path, so they used to come along for free —
   but the atlas cache short-circuits that loop, so from the second boot onward nothing fetched
   them, `new THREE.Texture(undefined)` produced a blank map, and those meshes rendered BLACK. */
const MESH_TEXTURES = ['oak_door',
                       'bed_top', 'bed_long', 'bed_end', 'bed_leg', 'bed_down',
                       ...Object.keys(TEXTURES).filter(n => n.startsWith('chest_')),   // wood, metal, double halves (0.809)
                       'wool', 'oak_planks', 'birch_planks', 'spruce_planks'];         // planks: a chest's wood colour (0.809)
// name -> url for everything in this group; MESH_TEXTURES resolve through TEXTURES like block art
const _gameArtSources = () => ({
  ...ITEM_TEXTURES, ...EQUIP_TEXTURES,
  ...Object.fromEntries(MESH_TEXTURES.map(n => [n, TEXTURES[n]])),
});

/* Decoded images are kept as CANVASES, never as ImageBitmaps: three.js treats a bitmap source
   differently on upload (notably flipY), and the atlas cache learned that the hard way. */
function _bitmapToCanvas(bmp) {
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(bmp, 0, 0);
  bmp.close?.();
  return c;
}
async function _loadCachedArt(names) {
  try {
    await idbReady;
    const rec = await idbGet(_artCacheKey(names));
    if (!rec || typeof rec !== 'object') return false;
    // an incomplete pack is not worth patching up — refetch the lot rather than half-load
    for (const n of names) if (!(rec[n] instanceof Blob)) return false;
    // same colour-management trap as the atlas cache above — decode the stored bytes verbatim
    await Promise.all(names.map(async (n) => {
      IMAGES[n] = _bitmapToCanvas(await createImageBitmap(rec[n], { colorSpaceConversion: 'none' }));
    }));
    return true;
  } catch { return false; }              // any failure at all: silently fetch from source
}
function _cacheArt(names) {
  const rec = {};
  Promise.all(names.map(n => new Promise((res) => {
    const img = IMAGES[n];
    if (!img) return res();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    try { c.toBlob(b => { if (b) rec[n] = b; res(); }, 'image/png'); } catch { res(); }
  }))).then(() => {
    if (Object.keys(rec).length === names.length) idbPut(_artCacheKey(names), rec).catch(() => {});
  });
}
const _artCacheKey = (names) => 'art:' + GAME_VERSION + ':' + names.length;

let _gameArtPromise = null;
// how much of the art has landed, for the loading screen's percentage (0.804)
var gameArtTotal = 0, gameArtDone = 0;
function ensureGameArt() {
  if (_gameArtPromise) return _gameArtPromise;
  const src = _gameArtSources();
  const names = Object.keys(src);
  gameArtTotal = names.length; gameArtDone = 0;
  _gameArtPromise = (async () => {
    if (await _loadCachedArt(names)) { gameArtDone = gameArtTotal; return; }   // no network at all
    await Promise.all(names.map(n => loadImage(n, src[n]).catch(() => {}).finally(() => { gameArtDone++; })));
    _cacheArt(names);          // async, off the critical path — next boot skips every fetch above
  })();
  return _gameArtPromise;
}

/* ---- atlas cache (0.7147; raw layers 0.809) ----
   The atlas is stitched from a few hundred individual PNGs, and every one of them is its own HTTP
   request. Measured cold on the dev server (0.7147): 162 requests finishing ~94ms apart, 15.2 SECONDS
   before the first frame could draw. No amount of JS scheduling helps with that — the fix is to stop
   making the requests.

   So the finished layers are stored in IndexedDB and reloaded whole on later boots: one read instead of
   hundreds of fetches. Since 0.809 they are stored as the raw RGBA bytes the GPU takes, not as a PNG, so
   there is no decode (and no colour-management or flipY trap) on the way back. The key carries
   GAME_VERSION, the tile count and the layer size, so any change to the textures or the list misses the
   cache and rebuilds from source — a stale atlas would be a far worse bug than a slow boot. */
/* Where each animated tile's extra frames sit (0.8093): frame 0 is the tile's own layer, frames 1.. go on
   the end of the array in ANIMATED_TILES order. Fixed by the lists alone, so a cached array matches it. */
const ATLAS_ANIM = [];
let ATLAS_LAYERS = ATLAS_TILES.length;
for (const [name, a] of Object.entries(ANIMATED_TILES)) {
  const tile = ATLAS_TILES.indexOf(name);
  if (tile < 0) continue;
  ATLAS_ANIM.push({ tile, name, first: ATLAS_LAYERS, frames: a.frames, ms: a.ms });
  ATLAS_LAYERS += a.frames - 1;
}
// ...and after them each glowing tile's mask, one layer each (0.8094; EMISSIVE_TILES in 01)
const ATLAS_EMISSIVE = [];
for (const [name, src] of Object.entries(EMISSIVE_TILES)) {
  const tile = ATLAS_TILES.indexOf(name);
  if (tile < 0) continue;
  ATLAS_EMISSIVE.push({ tile, name, src, layer: ATLAS_LAYERS++ });
}
const atlasCacheKey = (px = atlasTilePx()) =>   // the tier is part of the key
  'atlasA:' + GAME_VERSION + ':' + ATLAS_LAYERS + ':' + px;
function _atlasTexFrom(data, px) {
  const tex = new THREE.DataArrayTexture(data, px, px, ATLAS_LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;       // each layer wraps on its own: no gutters (0.809)
  tex.generateMipmaps = true;
  tex.unpackAlignment = 4;
  tex.anisotropy = px < ART_PX ? 1 : 4;               // LOW tier: no anisotropic filtering
  tex.needsUpdate = true;
  return tex;
}
async function _loadCachedAtlas() {
  try {
    await idbReady;
    const blob = await idbGet(atlasCacheKey());
    if (!(blob instanceof Blob)) return null;
    const px = atlasTilePx();
    if (blob.size !== px * px * 4 * ATLAS_LAYERS) return null;   // stored by the other tier, or broken
    return _atlasTexFrom(new Uint8Array(await blob.arrayBuffer()), px);
  } catch { return null; }                 // any failure at all: silently rebuild from source
}
function _cacheAtlas(data, px) {
  try { idbPut(atlasCacheKey(px), new Blob([data])).catch(() => {}); } catch {}
}
/* A GPU names how many layers one array may hold. WebGL2 only promises 256; desktops and phones say 2048.
   Past it the upload fails, so say so plainly rather than draw nothing (0.809). */
function _checkLayerLimit() {
  try {
    const gl = renderer.getContext(), max = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
    if (ATLAS_LAYERS > max)
      console.error(`voxiGrof: ${ATLAS_LAYERS} texture layers, but this GPU holds ${max}`);
  } catch {}
}
// the tile list and T in 02-voxel-core.js must agree, or every face after a gap samples its neighbour (0.809)
function _checkTileOrder() {
  const T = CORE.T;
  const top = Math.max(...Object.values(T));
  if (top !== ATLAS_TILES.length - 1)
    console.error(`voxiGrof: T ends at ${top} but ATLAS_TILES has ${ATLAS_TILES.length} tiles`);
}

/* ---- the tile -> layer lookup (0.8093; glow 0.8094) ----
   Two floats per tile: the layer the shader samples for it, and the layer of its glow mask (-1: none).
   Every tile maps to itself except an animated one, which steps through its frames. It is a tiny
   texture, rewritten only when a frame changes. */
const TILE_LAYER = (() => {
  const d = new Float32Array(ATLAS_TILES.length * 2);
  for (let i = 0; i < ATLAS_TILES.length; i++) { d[i * 2] = i; d[i * 2 + 1] = -1; }
  for (const e of ATLAS_EMISSIVE) d[e.tile * 2 + 1] = e.layer;
  const t = new THREE.DataTexture(d, ATLAS_TILES.length, 1, THREE.RGFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
// per frame from the main loop: each animated tile on the frame its clock says
function updateTileAnimation(nowMs) {
  const d = TILE_LAYER.image.data;
  let changed = false;
  for (const a of ATLAS_ANIM) {
    const f = Math.floor(nowMs / a.ms) % a.frames;
    const layer = f === 0 ? a.tile : a.first + f - 1;
    if (d[a.tile * 2] !== layer) { d[a.tile * 2] = layer; changed = true; }
  }
  if (changed) TILE_LAYER.needsUpdate = true;
}

// a canvas copy of `img` laid over `base`, the overlay tinted: the grass side and the gem ores (0.8093)
function _composite(base, over, tint, grassTint) {
  const S = Math.max(base.width, over.width);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  const o = document.createElement('canvas'); o.width = o.height = S;
  const og = o.getContext('2d', { willReadFrequently: true });
  og.imageSmoothingEnabled = false;
  og.drawImage(over, 0, 0, S, S);
  if (tint) {
    const id = og.getImageData(0, 0, S, S), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 765;              // the fringe's own light and dark
      if (tint === 'snow') { const v = 205 + l * 50; d[i] = v; d[i + 1] = v; d[i + 2] = Math.min(255, v + 6); }
      else { d[i] = grassTint[0] * l * 1.25; d[i + 1] = grassTint[1] * l * 1.25; d[i + 2] = grassTint[2] * l * 1.25; }
    }
    og.putImageData(id, 0, 0);
  }
  g.drawImage(base, 0, 0, S, S);
  g.drawImage(o, 0, 0);
  return c;
}
// frame k of an animated strip, as its own square canvas
function _frameOf(img, k) {
  const w = img.width, c = document.createElement('canvas');
  c.width = c.height = w;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, k * w, w, w, 0, 0, w, w);
  return c;
}

async function buildAtlas() {
  _checkLayerLimit();
  _checkTileOrder();
  const cached = await _loadCachedAtlas();
  if (cached) return cached;                                         // no network at all
  /* A missing file used to reject the whole Promise.all and the game never got past loading (0.808).
     Now it becomes a magenta checker, it is named in the console, and the sheet is not cached, so the
     real file is picked up as soon as it exists. */
  const missing = [];
  await Promise.all(Object.keys(TEXTURES).map(n => loadImage(n).catch(() => {
    missing.push(TEXTURES[n]);
    IMAGES[n] = _missingTile();
  })));                                                              // block tiles only
  if (missing.length) console.warn('voxiGrof: missing textures, drawn as a checker:\n  ' + missing.join('\n  '));

  // tall_grass.png is one 2-tall sprite (e.g. 60x120): split it into a top and bottom half so
  // each of the two stacked blocks samples the correct portion instead of the whole squished image
  if (IMAGES.tallgrass) {
    const src = IMAGES.tallgrass, hw = src.width, hh = src.height / 2;
    for (const [name, sy] of [['tallgrass_bottom', hh], ['tallgrass_top', 0]]) {
      const c = document.createElement('canvas'); c.width = hw; c.height = hh;
      c.getContext('2d').drawImage(src, 0, sy, hw, hh, 0, 0, hw, hh);
      IMAGES[name] = c;
    }
  }
  // TNT lit: tnt_side texture with a 50% white overlay so the blink still reveals the pattern
  if (IMAGES.tnt_side) {
    const src = IMAGES.tnt_side;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalAlpha = 0.5;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    IMAGES.tnt_lit = c;
  }
  // ...and the same flash over its top, so a blinking TNT keeps its fuse face (0.804)
  if (IMAGES.tnt_top) {
    const src = IMAGES.tnt_top;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalAlpha = 0.5;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    IMAGES.tnt_top_lit = c;
  }

  // sample the grass colour from the coloured rim of the grass side's item picture (the block's side is
  // plain dirt with a grey fringe since 0.8093), so the tinted top and the fringe match it exactly
  const probe = document.createElement('canvas');
  probe.width = probe.height = 64;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(IMAGES.grass_side_item || IMAGES.grass_side_base, 0, 0, 64, 64);   // any art size onto the 64 probe (0.808)
  const px = pctx.getImageData(0, 0, 64, 16).data;
  let r = 0, g = 0, b = 0, cnt = 0;
  for (let i = 0; i < px.length; i += 4)
    if (px[i + 1] > px[i] + 8 && px[i + 1] > px[i + 2] + 8) { r += px[i]; g += px[i + 1]; b += px[i + 2]; cnt++; }
  const grassRGB = cnt ? [r / cnt, g / cnt, b / cnt] : [110, 190, 74];
  const tint = `rgb(${grassRGB[0] | 0},${grassRGB[1] | 0},${grassRGB[2] | 0})`;

  // the built tiles: a base with an overlay on it (01-textures-data.js, 0.8093)
  for (const [name, [baseN, overN, tn]] of Object.entries(COMPOSITE_TILES))
    if (IMAGES[baseN] && IMAGES[overN]) IMAGES[name] = _composite(IMAGES[baseN], IMAGES[overN], tn, grassRGB);

  /* tall_grass.png ships grayscale, so it reads as white in the world. Tint it on the source image, where
     one multiply and one alpha restore do it. The oak leaves are grey art too since 0.809, and the birch
     leaves since 0.8093, and take their own leaf greens the same way. */
  for (const [name, col] of [['tallgrass_bottom', tint], ['tallgrass_top', tint], ['oak_leaves', OAK_LEAF_TINT],
                             ['birch_leaves', BIRCH_LEAF_TINT]]) {
    const src = IMAGES[name];
    if (!src) continue;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g2 = c.getContext('2d');
    g2.imageSmoothingEnabled = false;
    g2.drawImage(src, 0, 0);
    g2.globalCompositeOperation = 'multiply';          // keeps the blade shading, colours it
    g2.fillStyle = col;
    g2.fillRect(0, 0, c.width, c.height);
    g2.globalCompositeOperation = 'destination-in';    // the fill also painted the gaps — undo that
    g2.drawImage(src, 0, 0);
    IMAGES[name] = c;
  }

  /* One layer at a time through a scratch canvas, then its rows copied into the array BOTTOM-UP: a
     DataArrayTexture is not flipped on upload the way a canvas texture was, and the mesher's UVs have
     v = 1 at the top of the picture (0.809). */
  const S = atlasTilePx(), LAYER = S * S * 4, ROW = S * 4;
  const data = new Uint8Array(LAYER * ATLAS_LAYERS);
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = S;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const isWater = (n) => n === 'water' || n === 'water_flow';
  const drawLayer = (layer, name, img) => {
    ctx.clearRect(0, 0, S, S);
    // per-block alpha baked into the atlas: water and leaves translucent but mostly opaque
    ctx.globalAlpha = isWater(name) ? 0.65 : name === 'oak_leaves' ? 0.9 : 1.0;
    ctx.drawImage(S >= ART_PX ? img : _halfTile(img), 0, 0, S, S);   // 64px art is stretched with NEAREST
    /* A model sheet (a mushroom's, 0.8091) goes at its own size in the bottom-left corner, where the mesher's
       UVs start; the stretched copy under it stays round it, so the mips at its edge keep its colours. */
    if (MUSHROOM_NATIVE.has(name) && IMAGES[name]) {
      const w = img.width * S / ART_PX, h = img.height * S / ART_PX;
      ctx.clearRect(0, S - h, w, h);
      ctx.drawImage(img, 0, S - h, w, h);
    }
    ctx.globalAlpha = 1;
    if (isWater(name)) {                                  // deep-blue dark overlay: more saturated, less transparent
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#0c1e2f';
      ctx.fillRect(0, 0, S, S);
      ctx.globalAlpha = 1;
    }
    if (name === 'grass_block_top') {                     // opaque tile: multiply tint (rich)
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'source-over';
    }
    const px2 = ctx.getImageData(0, 0, S, S).data, base = layer * LAYER;
    for (let y = 0; y < S; y++) data.set(px2.subarray(y * ROW, y * ROW + ROW), base + (S - 1 - y) * ROW);
  };
  ATLAS_TILES.forEach((name, i) => {
    const img = IMAGES[name] || _missingTile();
    drawLayer(i, name, ANIMATED_TILES[name] && img.height > img.width ? _frameOf(img, 0) : img);
  });
  // the rest of every animation's frames, on the end (0.8093)
  for (const a of ATLAS_ANIM) {
    const img = IMAGES[a.name];
    for (let k = 1; k < a.frames; k++)
      drawLayer(a.first + k - 1, a.name, img && img.height >= img.width * (k + 1) ? _frameOf(img, k) : (img || _missingTile()));
  }

  /* The glow masks (0.8094): white where the tile glows, clear elsewhere — the shader reads only the alpha. An
     overlay is laid in like any tile; 'auto' takes the tile's finished layer and keeps its bright warm pixels
     (a flame, a fire, an ember-orange cap), so it lines up even with a mushroom's corner-placed sheet. */
  for (const e of ATLAS_EMISSIVE) {
    const out = e.layer * LAYER;
    if (e.src === 'auto') {
      const src = e.tile * LAYER;
      for (let k = 0; k < LAYER; k += 4) {
        const r = data[src + k], g2 = data[src + k + 1], b2 = data[src + k + 2], a = data[src + k + 3];
        const glow = a > 127 && Math.max(r, g2, b2) >= 190 && r >= b2 + 50;
        data[out + k] = data[out + k + 1] = data[out + k + 2] = 255;
        data[out + k + 3] = glow ? 255 : 0;
      }
    } else {
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(IMAGES[e.src] || _missingTile(), 0, 0, S, S);
      const px3 = ctx.getImageData(0, 0, S, S).data;
      for (let y = 0; y < S; y++) data.set(px3.subarray(y * ROW, y * ROW + ROW), out + (S - 1 - y) * ROW);
    }
  }

  if (!missing.length) _cacheAtlas(data, S);   // async, off the critical path — next boot skips every fetch above
  return _atlasTexFrom(data, S);
}
// the stand-in for a texture file that is not there (0.808)
function _missingTile() {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) & 1 ? '#000' : '#f0f'; g.fillRect(x * 8, y * 8, 8, 8); }
  return c;
}

