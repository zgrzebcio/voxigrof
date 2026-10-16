'use strict';
/* entities/cow.js: the cow. Its two-tone model and coats, its numbers, spawning one.
   It moves by entities/grazers.js; milking is entities/taming.js. */

/* ================================ cow ================================
   TWO-TONE since 0.744: one rig, two white 128x128 sheets, two tints.
     textures/Entity/Farms/cow_body.png   the hide — white, with all shading and every feature (eyes,
                                    muzzle, hooves, udder) baked in
     textures/Entity/Farms/cow_spots.png  white, and its ALPHA is the patch mask
   The material mixes the two tints by that mask and multiplies the hide over the result, so a
   cow of any colours is just two hex values and the dark features stay dark under both. The
   spots are evaluated in 3D against the box each texel belongs to, so a patch runs over an edge
   and carries on onto the next face. Region layout (64-space units, painted at 2x):
     body  10w x 10h x 16d at (0, 0)      head 7x7x7 at (0, 27)
     leg   4w x 12h x 4d   at (29, 27)    horn 2x2x2 at (46, 27)
   Anything that moves those numbers has to move them in the generator too, or the spots stop
   lining up across the box seams. The old single-colour sheets (cow_brown/cow_white) are no
   longer read, and are left on disk untouched. */
/* Named coats are just tint pairs. 'brown' and 'white' are the two pre-0.744 variant names —
   kept so every saved cow comes back as the cow it was. */
const COW_COATS = {
  holstein: { body: 0xf4f1ea, spot: 0x2a2725 },
  ayrshire: { body: 0xf4f1ea, spot: 0x8e4a26 },
  hereford: { body: 0x8a4424, spot: 0xf2ede4 },
  jersey:   { body: 0xba8653, spot: 0x9a6a3e },
  angus:    { body: 0x2e2a28, spot: 0x2e2a28 },
  brown:    { body: 0x7b4d2e, spot: 0xf0ebe1 },
  white:    { body: 0xf4f1ea, spot: 0x2a2725 },
};
const COW_VARIANTS = Object.keys(COW_COATS);
const COW_COAT_POOL = ['holstein', 'holstein', 'ayrshire', 'hereford', 'hereford', 'jersey', 'angus'];
function _nearestTex(url) {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
  t.generateMipmaps = true;
  return t;
}
const _cowBodyTex = _nearestTex('textures/Entity/Farms/cow_body.png');
const _cowSpotTex = _nearestTex('textures/Entity/Farms/cow_spots.png');
/* A plain MeshBasicMaterial with three lines of shader added: the spot sheet's alpha picks
   between the two tints, and that is multiplied into the hide the stock map pass already
   sampled. Lighting still arrives through material.color exactly as for every other mob (see
   shadeHumanoid), so the cow needs no shading code of its own. The tint Colors are shared BY
   REFERENCE with the uniforms, so recolouring a live cow is a .set() on userData. */
function _newCowMat(bodyHex, spotHex) {
  const m = new THREE.MeshBasicMaterial({ map: _cowBodyTex, transparent: true, alphaTest: 0.5 });
  m.userData.bodyTint = new THREE.Color(bodyHex).convertSRGBToLinear();
  m.userData.spotTint = new THREE.Color(spotHex).convertSRGBToLinear();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.spotMap  = { value: _cowSpotTex };
    sh.uniforms.bodyTint = { value: m.userData.bodyTint };
    sh.uniforms.spotTint = { value: m.userData.spotTint };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D spotMap;\nuniform vec3 bodyTint;\nuniform vec3 spotTint;')
      .replace('#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.rgb *= mix( bodyTint, spotTint, texture2D( spotMap, vMapUv ).a );');
  };
  m.customProgramCacheKey = () => 'cow-two-tone';     // every cow shares one compiled program
  return m;
}
// recolour a live cow; either argument may be omitted to keep that half as it is
function setCowColors(e, bodyHex, spotHex) {
  const u = e && e.model && e.model.mat && e.model.mat.userData;
  if (!u || !u.bodyTint) return;
  if (bodyHex != null) { u.bodyTint.set(bodyHex).convertSRGBToLinear(); e.bodyTint = bodyHex; }
  if (spotHex != null) { u.spotTint.set(spotHex).convertSRGBToLinear(); e.spotTint = spotHex; }
}
function _cowLeg(mat) {
  const g = new THREE.Group();
  const m = _part(mat, 4, 12, 4, 29, 27);
  m.position.y = -6 * PX;                       // pivots at the hip, same as the sheep
  g.add(m);
  return g;
}
function buildCow(bodyHex = COW_COATS.holstein.body, spotHex = COW_COATS.holstein.spot) {
  const root = new THREE.Group();
  const mat = _newCowMat(bodyHex, spotHex);
  const body = _part(mat, 10, 10, 16, 0, 0);
  body.position.set(0, 17 * PX, 0);
  const head = new THREE.Group();               // horns ride with the head, so it gets a pivot
  head.position.set(0, 20 * PX, 11.5 * PX);
  const skull = _part(mat, 7, 7, 7, 0, 27);
  const hornR = _part(mat, 2, 2, 2, 46, 27); hornR.position.set(-4 * PX, 3 * PX, -1 * PX);
  const hornL = _part(mat, 2, 2, 2, 46, 27); hornL.position.set( 4 * PX, 3 * PX, -1 * PX);
  head.add(skull, hornR, hornL);
  const legFL = _cowLeg(mat); legFL.position.set(-3.5 * PX, 12 * PX,  5 * PX);
  const legFR = _cowLeg(mat); legFR.position.set( 3.5 * PX, 12 * PX,  5 * PX);
  const legBL = _cowLeg(mat); legBL.position.set(-3.5 * PX, 12 * PX, -5 * PX);
  const legBR = _cowLeg(mat); legBR.position.set( 3.5 * PX, 12 * PX, -5 * PX);
  root.add(body, head, legFL, legFR, legBL, legBR);
  return { root, head, body, legs: [legFL, legFR, legBL, legBR], mat, mats: [mat] };
}

/* ---- cows: the other passive grazer ----
   Same behaviour as a sheep minus the fleece — they wander, and bolt when hit. Tougher and a bit
   slower, and they carry the only source of leather in the game. */
const COW_HP = 60;
const COW_SPEED = 1.7, COW_FLEE_SPEED = 4.4;
const COW_FLEE_TIME = 6;
const COW_BIOMES = { 'Plains': 1, 'Cold Plains': 1 };      // flat land, mild to cool
const COW_CHUNK_CHANCE = 0.010;          // a herd in about 1 new chunk in 100, before the biome's weight
const COW_HERD_MIN = 2, COW_HERD_MAX = 4;

/* What one cow is made of: its model and what only a cow has. summon('cow', x, y, z, opts) writes the rest
   (entities/mobs.js). `opts`: variant (a coat's name), bodyTint, spotTint, size. */
function makeCow(opts) {
  // coat is rolled once and persisted, so a herd stays the herd you found. A named coat supplies
  // both tints; explicit hex tints (either or both) override it — any cow is two numbers.
  const variant = COW_COATS[opts.variant] ? opts.variant
                : COW_COAT_POOL[Math.floor(Math.random() * COW_COAT_POOL.length)];
  const coat = COW_COATS[variant];
  const size = _animalSize(opts);
  return {
    model: buildCow(opts.bodyTint != null ? opts.bodyTint : coat.body,
                    opts.spotTint != null ? opts.spotTint : coat.spot),
    scale: COW_SCALE * size,
    own: {
      variant, size,
      bodyTint: opts.bodyTint != null ? opts.bodyTint : null,   // only custom overrides are kept;
      spotTint: opts.spotTint != null ? opts.spotTint : null,   // null means "whatever the coat says"
    },
  };
}

// its entry in the creature table (entities/mobs.js says what each line is for)
defineMob('cow', {
  name: 'Cow', group: 'animal', body: 'grazer',
  hp: COW_HP, box: [0.46, 1.72], sized: true, foot: 'hoof',
  walk: COW_SPEED, flee: COW_FLEE_SPEED, fleeTime: COW_FLEE_TIME,
  make: makeCow, gendered: true,
  // a cow's look: a named coat (COW_COATS), or its two tints
  build: (look) => { const c = COW_COATS[look.coat] || COW_COATS.holstein; return buildCow(look.body != null ? look.body : c.body, look.spot != null ? look.spot : c.spot); },
  herd: { chance: COW_CHUNK_CHANCE, min: COW_HERD_MIN, max: COW_HERD_MAX, biomes: COW_BIOMES },
  // the save: its size, its own two tints if it was given any, gender, level, and the wait for its next milk
  save: (e) => ({ sz: e.size, bt: e.bodyTint, st: e.spotTint, g: e.gender, lv: e.level, mk: e.milkCd > 0 ? Math.round(e.milkCd) : 0 }),
  cols: (e) => [0, e.variant],                         // its coat's name, in the row's old place for it
  load: (s) => {
    const e = summon('cow', s.x, s.y, s.z, {
      hp: s.hp, variant: s.variant,                    // makeCow rolls a coat again if it does not know this one
      size: s.d.sz, gender: s.d.g, level: s.d.lv,
      bodyTint: s.d.bt != null ? s.d.bt : undefined, spotTint: s.d.st != null ? s.d.st : undefined,
      hx: s.hx, hz: s.hz,
    });
    e.milkCd = s.d.mk > 0 ? s.d.mk : 0;
    return e;
  },
  loot: (e, pop, first) => { first(ITEM.BEEF, LOOT.meat); pop(ITEM.LEATHER, rollLoot(LOOT.leather)); },
  burnt: () => [ITEM.BEEF, LOOT.meat],
});
