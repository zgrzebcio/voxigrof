'use strict';
/* entities/pig.js: the pig. Its model and coats, its numbers, spawning one.
   It moves by entities/grazers.js. */

/* ================================ pig ================================
   The cow's two-tone scheme again, and for the same reason: one rig, two white 128x128 sheets,
   two tints, so a breed is two hex values rather than a new sheet.
     textures/Entity/Farms/pig_body.png   the hide — white, with the eyes, snout, inner ear, belly and
                                    trotters shaded in, all of them dark multipliers so they stay
                                    readable under a pink tint and under a black one
     textures/Entity/Farms/pig_spots.png  white, and its ALPHA is the patch mask
   Region layout (64-space units, painted at 2x):
     body  10w x 9h x 16d at (0, 0)     head 8x8x8 at (0, 27)
     leg   4w x 8h x 4d   at (34, 27)   ear  3x3x1 at (34, 41)   snout 4x3x2 at (44, 41)
   Both sheets come out of toolsrc/pig-tex.js, which also holds the part OFFSETS the patch mask is
   evaluated against. Move a box here and the offsets move there too, or the patches stop running
   across the seams — same standing rule as the cow. */
const PIG_COATS = {
  pink:       { body: 0xe8a79c, spot: 0xe8a79c },   // a plain pink pig: both tints the same
  spotted:    { body: 0xe8a79c, spot: 0x3c3532 },   // pink with dark patches
  hampshire:  { body: 0x2c2724, spot: 0xe2ded6 },
  duroc:      { body: 0x9c4a24, spot: 0x8a3f1d },
  berkshire:  { body: 0x332d2a, spot: 0x4a423e },
  tamworth:   { body: 0xc06a35, spot: 0xcf7c45 },
};
const PIG_VARIANTS = Object.keys(PIG_COATS);
const PIG_COAT_POOL = ['pink', 'pink', 'pink', 'spotted', 'spotted', 'hampshire', 'duroc', 'tamworth', 'berkshire'];
const _pigBodyTex = _nearestTex('textures/Entity/Farms/pig_body.png');
const _pigSpotTex = _nearestTex('textures/Entity/Farms/pig_spots.png');
// the cow's material, pointed at the pig's sheets — see _newCowMat for what the three added lines do
function _newPigMat(bodyHex, spotHex) {
  const m = new THREE.MeshBasicMaterial({ map: _pigBodyTex, transparent: true, alphaTest: 0.5 });
  m.userData.bodyTint = new THREE.Color(bodyHex).convertSRGBToLinear();
  m.userData.spotTint = new THREE.Color(spotHex).convertSRGBToLinear();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.spotMap  = { value: _pigSpotTex };
    sh.uniforms.bodyTint = { value: m.userData.bodyTint };
    sh.uniforms.spotTint = { value: m.userData.spotTint };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D spotMap;\nuniform vec3 bodyTint;\nuniform vec3 spotTint;')
      .replace('#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.rgb *= mix( bodyTint, spotTint, texture2D( spotMap, vMapUv ).a );');
  };
  m.customProgramCacheKey = () => 'pig-two-tone';    // every pig shares one compiled program
  return m;
}
// recolour a live pig; either argument may be omitted to keep that half as it is
function setPigColors(e, bodyHex, spotHex) {
  const u = e && e.model && e.model.mat && e.model.mat.userData;
  if (!u || !u.bodyTint) return;
  if (bodyHex != null) { u.bodyTint.set(bodyHex).convertSRGBToLinear(); e.bodyTint = bodyHex; }
  if (spotHex != null) { u.spotTint.set(spotHex).convertSRGBToLinear(); e.spotTint = spotHex; }
}
function _pigLeg(mat) {
  const g = new THREE.Group();
  const m = _part(mat, 4, 8, 4, 34, 27);
  m.position.y = -4 * PX;                       // pivots at the hip, same as the sheep and the cow
  g.add(m);
  return g;
}
function buildPig(bodyHex = PIG_COATS.pink.body, spotHex = PIG_COATS.pink.spot) {
  const root = new THREE.Group();
  const mat = _newPigMat(bodyHex, spotHex);
  const body = _part(mat, 10, 9, 16, 0, 0);
  body.position.set(0, 12.5 * PX, 0);
  /* The head is a pivot group so the snout and the ears dip with it. The ears are the reason a pig
     reads as a pig at twenty paces, so they are large, splayed well out to the sides and tipped
     forward over the eyes rather than standing up like a cow's horns. Their region and the snout's
     are sized in toolsrc/pig-tex.js; the two have to agree. */
  const head = new THREE.Group();
  head.position.set(0, 13.5 * PX, 11.5 * PX);
  const skull = _part(mat, 8, 8, 8, 0, 27);
  const snout = _part(mat, 5, 4, 3, 46, 41); snout.position.set(0, -2 * PX, 5.5 * PX);
  const earL = _part(mat, 4, 5, 1, 34, 41);
  earL.position.set( 3.2 * PX, 5 * PX, -1 * PX);
  earL.rotation.set(-0.55, 0, -0.42);
  const earR = _part(mat, 4, 5, 1, 34, 41);
  earR.position.set(-3.2 * PX, 5 * PX, -1 * PX);
  earR.rotation.set(-0.55, 0, 0.42);
  head.add(skull, snout, earL, earR);
  const legFL = _pigLeg(mat); legFL.position.set(-3 * PX, 8 * PX,  5 * PX);
  const legFR = _pigLeg(mat); legFR.position.set( 3 * PX, 8 * PX,  5 * PX);
  const legBL = _pigLeg(mat); legBL.position.set(-3 * PX, 8 * PX, -5 * PX);
  const legBR = _pigLeg(mat); legBR.position.set( 3 * PX, 8 * PX, -5 * PX);
  root.add(body, head, legFL, legFR, legBL, legBR);
  return { root, head, body, ears: [earL, earR], legs: [legFL, legFR, legBL, legBR], mat, mats: [mat] };
}

/* ---- pigs: the third passive grazer ----
   Smaller and softer than a cow, quicker to panic, and the only source of fat. They favour the
   wetter, wooded biomes rather than the open plains the cattle hold. */
const PIG_HP = 45;
const PIG_SPEED = 1.9, PIG_FLEE_SPEED = 5.0;
const PIG_FLEE_TIME = 7;
/* mild and wet — no swamp yet, so the plains round ponds and lakes: a pig's spot needs water close by (PIG_WET).
   'Beach' is there for the grassy banks of a pond, which read as beach. */
const PIG_BIOMES = { 'Plains': 1, 'Beach': 1, 'Forest': 0.4, 'Birch Forest': 0.4 };
const PIG_WET = 6;                       // water within this many blocks of the spot
const PIG_CHUNK_CHANCE = 0.02;           // more tries than the others get, since most spots are too far from water
const PIG_HERD_MIN = 1, PIG_HERD_MAX = 3;

/* What one pig is made of: its model and what only a pig has. summon('pig', x, y, z, opts) writes the rest
   (entities/mobs.js). `opts`: variant (a coat's name), bodyTint, spotTint, size. */
function makePig(opts) {
  // as the cow: the coat is rolled once and persisted, so a sounder stays the sounder you found
  const variant = PIG_COATS[opts.variant] ? opts.variant
                : PIG_COAT_POOL[Math.floor(Math.random() * PIG_COAT_POOL.length)];
  const coat = PIG_COATS[variant];
  const size = _animalSize(opts);
  return {
    model: buildPig(opts.bodyTint != null ? opts.bodyTint : coat.body,
                    opts.spotTint != null ? opts.spotTint : coat.spot),
    scale: PIG_SCALE * size,
    own: {
      variant, size,
      bodyTint: opts.bodyTint != null ? opts.bodyTint : null,   // only custom overrides are kept;
      spotTint: opts.spotTint != null ? opts.spotTint : null,   // null means "whatever the coat says"
    },
  };
}

/* Its entry in the creature table (entities/mobs.js says what each line is for).
   `box`: fitted to the model, 1.15 tall (its back is at 1.0, its ears at 1.2). The radius stays 0.3, the body's
   half width and what a pig has always had: a wider one would put every pig that stands against a fence inside
   it, and the wake-up audit (entities/update.js) removes what it finds inside a block. */
defineMob('pig', {
  name: 'Pig', group: 'animal', body: 'grazer',
  hp: PIG_HP, box: [0.3, 1.15], sized: true, foot: 'small',
  walk: PIG_SPEED, flee: PIG_FLEE_SPEED, fleeTime: PIG_FLEE_TIME,
  make: makePig, gendered: true,
  // a pig's look: a named coat (PIG_COATS), or its two tints
  build: (look) => { const c = PIG_COATS[look.coat] || PIG_COATS.pink; return buildPig(look.body != null ? look.body : c.body, look.spot != null ? look.spot : c.spot); },
  herd: { chance: PIG_CHUNK_CHANCE, min: PIG_HERD_MIN, max: PIG_HERD_MAX, biomes: PIG_BIOMES, wet: PIG_WET },
  // the save: its size, its own two tints if it was given any, gender and level
  save: (e) => ({ sz: e.size, bt: e.bodyTint, st: e.spotTint, g: e.gender, lv: e.level }),
  cols: (e) => [0, e.variant],                         // its coat's name, in the row's old place for it
  load: (s) => summon('pig', s.x, s.y, s.z, {
    hp: s.hp, variant: s.variant,                      // makePig rolls a coat again if it does not know this one
    size: s.d.sz, gender: s.d.g, level: s.d.lv,
    bodyTint: s.d.bt != null ? s.d.bt : undefined, spotTint: s.d.st != null ? s.d.st : undefined,
    hx: s.hx, hz: s.hz,
  }),
  loot: (e, pop, first) => { first(ITEM.PORK, LOOT.meat); pop(ITEM.FAT, rollLoot(LOOT.fat)); },
  burnt: () => [ITEM.PORK, LOOT.meat],
});
