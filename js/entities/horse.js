'use strict';
/* entities/horse.js: the horse. Its numbers, its model and saddle, spawning one with rolled stats.
   It moves by entities/grazers.js; taming, riding and stances are entities/taming.js. */

/* ---- horses ----
   The first entity with STATS: health, speed and jump strength are rolled per horse at spawn and
   carried for its whole life, so two horses in the same herd are genuinely different animals and
   finding a good one is worth doing. They are also the first TAMEABLE entity — the taming ride,
   the progress bar, the naming and the saddle all live in entities/taming.js, which is written to take
   any future tameable, not just this one.

   The hide is painted WHITE on purpose (textures/Entity/Tamable/horse.png, 128x128, twice the resolution
   of the older mobs): every coat colour is that one sheet multiplied by a per-horse tint, so a
   new colour is a hex value rather than a new texture. */
const _horseTex = new THREE.TextureLoader().load('textures/Entity/Tamable/horse.png');
_horseTex.colorSpace = THREE.SRGBColorSpace;
_horseTex.magFilter = THREE.NearestFilter;
_horseTex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
_horseTex.generateMipmaps = true;
function _newHorseMat() {
  return new THREE.MeshBasicMaterial({ map: _horseTex, transparent: true, alphaTest: 0.5 });
}
// coat -> tint multiplied into the white hide. Ordinary colours are common, the striking ones rare.
const HORSE_COATS = {
  chestnut: 0xa9663a, bay: 0x7d4a26, dun: 0xc4a274, grey: 0xa9a49b,
  black: 0x3d3733, white: 0xf3f0ea, palomino: 0xdcb267,
};
const HORSE_COAT_POOL = ['chestnut', 'chestnut', 'bay', 'bay', 'dun', 'grey', 'grey',
                         'black', 'white', 'palomino'];
const HORSE_HP_MIN = 75, HORSE_HP_MAX = 150;
const HORSE_SPEED_MIN = 0.80, HORSE_SPEED_MAX = 1.30;   // multipliers on the two speeds below
const HORSE_JUMP_MIN = 0.75, HORSE_JUMP_MAX = 1.35;
// ~1.9x the 0.74 values: a horse is the fastest thing in the world, not a brisk cow
const HORSE_WALK_SPEED = 2.3;            // grazing around a field (halved in 0.8451: 4.6)
const HORSE_FOLLOW_SPEED = 4.6, HORSE_FOLLOW_RUN = 9.5;   // keeping up with the player it follows, near and far
const HORSE_FLEE_SPEED = 11.4;
const HORSE_BOLT_SPEED = 12.5;           // what an untamed one does with you on its back
const HORSE_RIDE_SPEED = 14.0;           // driven, at speed stat 1.0
const HORSE_RIDE_JUMP = 9.6;             // driven jump impulse, at jump stat 1.0
const HORSE_FLEE_TIME = 7;
const HORSE_SEAT_Y = 1.61;               // where the rider sits above the feet (bigger horse)
// open country: this world has no savanna, and horses have no business in snow or desert
const HORSE_BIOMES = { 'Plains': 1, 'Forest': 0.5, 'Birch Forest': 0.5, 'Savanna': 1 };   // mild; and the Savanna's open grass
/* 0.01% per chunk: a herd in about 1 chunk roll in 10,000, before the biome weight (0.08% in 0.8234,
   0.0001% — one in a MILLION — from 0.7441). */
const HORSE_CHUNK_CHANCE = 0.0001;
const HORSE_HERD_MIN = 1, HORSE_HERD_MAX = 4;   // 1-4
const HORSE_SCALE = 1.5;                 // a horse is bigger than the box units it is built from (1.25 until 0.7442)
const HORSE_STEP_UP = 1.05;              // tallest ledge it walks up without jumping (one block)
const HORSE_FALL_SAFE = 8;               // blocks of fall a horse shrugs off (the others: ENT_FALL_SAFE, entities/physics.js)

function _horseLeg(mat) {
  const g = new THREE.Group();
  const m = _part(mat, 3, 12, 3, 0, 41);
  m.position.y = -6 * PX;                        // pivots at the shoulder/hip
  g.add(m);
  return g;
}
/* Saddle: a box strapped over the barrel, textured from the saddle ITEM art that already ships
   with the game (textures/Items/Useables/saddle.png) rather than from the horse sheet — so the
   saddle you crafted and the saddle on the horse are literally the same picture. Built lazily,
   because IMAGES is only populated once the deferred game art has landed. */
let _saddleTex = null;
function _newSaddleMat() {
  if (!_saddleTex && typeof IMAGES !== 'undefined' && IMAGES.saddle) {
    _saddleTex = new THREE.Texture(IMAGES.saddle);
    _saddleTex.colorSpace = THREE.SRGBColorSpace;
    _saddleTex.magFilter = THREE.NearestFilter;
    _saddleTex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
    _saddleTex.generateMipmaps = true;
    _saddleTex.needsUpdate = true;
  }
  return new THREE.MeshBasicMaterial({ map: _saddleTex || null,
                                       color: _saddleTex ? 0xffffff : 0x6b4526,
                                       transparent: true, alphaTest: 0.4 });
}
function buildHorse(coat = 'chestnut') {
  const root = new THREE.Group();
  root.scale.setScalar(HORSE_SCALE);
  const mat = _newHorseMat();
  /* the barrel is 1.5x longer (21 deep, was 14) — it read as a pony. The sheet was
     re-laid out to fit it; regions (64-space units):
       body 8x8x21 (0,0)   head 4x4x6 (0,29)   muzzle 3x3x3 (20,29)   ear 1x2x1 (32,29)
       neck 4x8x4 (36,29)  tail 2x9x2 (52,29)  leg 3x12x3 (0,41)      mane 1x6x10 (12,41) */
  const body = _part(mat, 8, 8, 21, 0, 0);
  body.position.set(0, 16 * PX, 0);
  // NECK: the pivot the whole head assembly hangs off, so lowering it to graze swings head,
  // muzzle, ears and mane together the way a real neck does.
  const neck = new THREE.Group();
  neck.position.set(0, 19 * PX, 9 * PX);           // at the front of the longer barrel
  const neckMesh = _part(mat, 4, 8, 4, 36, 29);
  neckMesh.position.y = 4 * PX;
  const head = _part(mat, 4, 4, 6, 0, 29);
  head.position.set(0, 8.5 * PX, 1.5 * PX);
  const muzzle = _part(mat, 3, 3, 3, 20, 29);
  muzzle.position.set(0, 7.4 * PX, 5.0 * PX);
  const earR = _part(mat, 1, 2, 1, 32, 29); earR.position.set(-1.4 * PX, 11.0 * PX, 0.4 * PX);
  const earL = _part(mat, 1, 2, 1, 32, 29); earL.position.set( 1.4 * PX, 11.0 * PX, 0.4 * PX);
  const mane = _part(mat, 1, 6, 10, 12, 41);
  mane.rotation.x = Math.PI / 2;                 // the long axis runs UP the neck, not across it
  mane.position.set(0, 5.5 * PX, -2.2 * PX);
  neck.add(neckMesh, head, muzzle, earR, earL, mane);
  neck.rotation.x = HORSE_NECK_REST;
  const tail = new THREE.Group();
  tail.position.set(0, 20 * PX, -10.5 * PX);       // the back of the longer barrel
  const tailMesh = _part(mat, 2, 9, 2, 52, 29);
  tailMesh.position.y = -4.5 * PX;
  tail.add(tailMesh);
  // the mesh hangs BELOW its pivot, so positive tips the end backward; -0.35 tucked it under the belly
  tail.rotation.x = 0.35;
  // legs spread to the ends of the longer barrel: shoulders and hips, not the middle
  const legFL = _horseLeg(mat); legFL.position.set(-3.2 * PX, 12 * PX,  8 * PX);
  const legFR = _horseLeg(mat); legFR.position.set( 3.2 * PX, 12 * PX,  8 * PX);
  const legBL = _horseLeg(mat); legBL.position.set(-3.2 * PX, 12 * PX, -8 * PX);
  const legBR = _horseLeg(mat); legBR.position.set( 3.2 * PX, 12 * PX, -8 * PX);
  // saddle, hidden until one is fitted
  const satMat = _newSaddleMat();
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(9 * PX, 3 * PX, 9 * PX), satMat);
  saddle.position.set(0, 20.6 * PX, 1.5 * PX);
  saddle.visible = false;
  root.add(body, neck, tail, legFL, legFR, legBL, legBR, saddle);
  return { root, head: neck, body, tail, saddle, satMat,
           legs: [legFL, legFR, legBL, legBR],
           mat, mats: [mat],
           // linearised: with ColorManagement off, a raw hex renders ~50% too bright
           tint: new THREE.Color(HORSE_COATS[coat] || HORSE_COATS.chestnut).convertSRGBToLinear() };
}
/* SIGN MATTERS (fixed 0.7441). The neck mesh sits ABOVE its pivot and the model faces +Z, so a
   POSITIVE rotation.x tips the top of the neck forward; the old -0.62 leaned it back, which is
   why every walking or running horse stared at the sky. */
const HORSE_NECK_REST = 0.45;            // carried forward, muzzle a little below level
const HORSE_NECK_GRAZE = 1.85;           // ...and swung right down to the grass
const HORSE_LIE_DROP = 10.5;             // how far its body comes down to lie: the 12 of its legs, less their thickness

/* What one horse is made of: its model and what only a horse has. summon('horse', x, y, z, opts) writes the rest
   (entities/mobs.js). `opts`: coat, tint, size, stats, name, hunger, thirst, and what its taming got to (tame,
   loved, tameProg, bucked, saddled, boosted, stance, ownerId). */
function makeHorse(opts) {
  const coat = HORSE_COATS[opts.coat] ? opts.coat
             : HORSE_COAT_POOL[Math.floor(Math.random() * HORSE_COAT_POOL.length)];
  const m = buildHorse(coat);
  const size = _animalSize(opts);
  if (opts.tint != null) m.tint.set(opts.tint).convertSRGBToLinear();   // any hex over the coat
  m.saddle.visible = !!opts.saddled;
  /* Stats are rolled ONCE and then persisted. maxHp is kept alongside hp because taming grants a
     permanent boost and the bar has to know what full looks like afterwards. */
  const stats = opts.stats || {
    maxHp: _ri(HORSE_HP_MIN, HORSE_HP_MAX),
    speed: +(HORSE_SPEED_MIN + Math.random() * (HORSE_SPEED_MAX - HORSE_SPEED_MIN)).toFixed(3),
    jump:  +(HORSE_JUMP_MIN + Math.random() * (HORSE_JUMP_MAX - HORSE_JUMP_MIN)).toFixed(3),
  };
  return {
    model: m, scale: HORSE_SCALE * size,     // size multiplies the horse's own scale-up
    own: {
      coat, stats, size,
      tintHex: opts.tint != null ? opts.tint : null,   // custom coat colour, when one was given
      name: opts.name || 'Horse',
      stepOff: 0,                              // visual lag after a step-assist climb, eased to 0
      hunger: opts.hunger >= 0 && opts.hunger <= ENT_HUNGER_MAX ? +opts.hunger : ENT_HUNGER_MAX,
      thirst: opts.thirst >= 0 && opts.thirst <= ENT_THIRST_MAX ? +opts.thirst : ENT_THIRST_MAX,
      regenT: 0,
      tame: !!opts.tame,                       // fully tamed
      loved: !!opts.loved,                     // fed a golden apple: will let you climb on
      tameProg: opts.tameProg || 0,            // 0..1, filled by riding it
      bucked: opts.bucked || 0,                // early dismounts, each one costs some of the boost
      saddled: !!opts.saddled,
      boosted: !!opts.boosted,                 // stats already had the taming bonus applied
      rider: null, bolt: 0,
      // what a tamed one was told to do (entities/taming.js HORSE_STANCES), and whose word it was (a profile id)
      stance: typeof HORSE_STANCES !== 'undefined' && HORSE_STANCES.includes(opts.stance) ? opts.stance : 'wander',
      owner: null, ownerId: opts.ownerId != null ? opts.ownerId : null,
    },
  };
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). `walk` and `flee` are for a
   speed stat of 1.0: _updateGrazer multiplies them by the horse's own (horseSpeedStat). */
defineMob('horse', {
  name: 'Horse', group: 'animal', body: 'grazer',
  maxHp: (e) => (e.stats && e.stats.maxHp) || HORSE_HP_MAX,   // rolled per horse, raised by taming
  box: [0.45, 2.28], sized: true, foot: 'hoof', fallSafe: HORSE_FALL_SAFE,
  walk: HORSE_WALK_SPEED, flee: HORSE_FLEE_SPEED, fleeTime: HORSE_FLEE_TIME,
  make: makeHorse, gendered: true, build: (look) => buildHorse(HORSE_COATS[look.coat] ? look.coat : 'chestnut'),
  herd: { chance: HORSE_CHUNK_CHANCE, min: HORSE_HERD_MIN, max: HORSE_HERD_MAX, biomes: HORSE_BIOMES },
  /* The save. A horse's IDENTITY has to survive a reload: its coat and rolled stats, how far its taming got, its
     saddle, hunger and thirst, its stance and whose word that was (the name you gave it is in the row itself). */
  save: (e) => ({
    c: e.coat, st: e.stats, t: e.tame ? 1 : 0, l: e.loved ? 1 : 0,
    p: +(e.tameProg || 0).toFixed(3), b: e.bucked | 0,
    s: e.saddled ? 1 : 0, bo: e.boosted ? 1 : 0,
    g: e.gender, lv: e.level, h: +entHunger(e).toFixed(2), th: +entThirst(e).toFixed(2),
    sz: e.size, tn: e.tintHex,
    sc: e.stance, o: e.ownerId || null,
  }),
  load: (s) => {
    const d = s.d;
    const st = (d.st && typeof d.st === 'object' && d.st.maxHp > 0) ? d.st : null;
    return summon('horse', s.x, s.y, s.z, {
      hp: s.hp != null ? s.hp : (st ? st.maxHp : HORSE_HP_MAX),
      coat: d.c, stats: st,
      tame: !!d.t, loved: !!d.l, tameProg: +d.p || 0, bucked: d.b | 0,
      saddled: !!d.s, boosted: !!d.bo,
      gender: d.g, level: d.lv,              // a save without them: rolled fresh
      hunger: d.h, thirst: d.th,             // ...and one without these starts it well fed
      size: d.sz, tint: d.tn,
      stance: d.sc, ownerId: d.o,
      name: s.name, hx: s.hx, hz: s.hz,
    });
  },
  // leather, and its saddle: tack always comes back, whatever happened to the horse
  loot: (e, pop, first) => { first(ITEM.LEATHER, LOOT.leather); if (e.saddled) pop(ITEM.SADDLE, 1); },
});
