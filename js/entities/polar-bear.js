'use strict';
/* entities/polar-bear.js: the polar bear. Its model, its numbers, spawning one, and where groups of them live.
   It moves by entities/grazers.js, where it hunts. */

/* ================================ polar bear ================================
   The first animal that hunts you. It walks the grazer's legs (_updateGrazer) but never flees: anyone in survival
   within POLAR_BEAR_SEES is chased at a sprint and bitten, and a hit only makes it angrier. Long and low, the head
   carried forward on a long neck. It lives on the shores of the snow and in the Ice Spikes, in groups of 2-5.
   Sheet textures/Entity/Animals/polar_bear.png, 128x128, regions in 64-space units painted at 2x:
     body 11w x 10h x 20d at (0, 0)    neck 6x6x6 at (0, 31)    skull 7x7x6 at (25, 31)    snout 4x3x4 at (0, 44)
     leg  5w x 8h x 5d    at (17, 44)  ear  2x2x1 at (38, 44)   tail  3x3x2 at (45, 44)                           */
const POLAR_BEAR_HP = 250;
const POLAR_BEAR_SPEED = 1.2;            // a quarter slower since 0.8351 (1.6)
const POLAR_BEAR_CHASE_SPEED = 6.7;      // three quarters of a sprinting player (5.6 x 1.6, 22-main-loop.js; 8.9 in 0.835)
const POLAR_BEAR_FLEE_SPEED = 5.2;       // only one that is burning runs (53-storms.js): a blow never makes a bear bolt
const POLAR_BEAR_DMG = 40, POLAR_BEAR_ATTACK_CD = 1.2;
const POLAR_BEAR_SEES = 16;              // a player this near is hunted (24 in 0.835)
const POLAR_BEAR_GIVES_UP = 30;          // ...and let go past this, hit or not, to walk back to where it was
const POLAR_BEAR_AGGRO_TIME = 20;        // seconds a hit keeps it on you from further than it sees, up to POLAR_BEAR_GIVES_UP
const POLAR_BEAR_SCALE = 1.15;           // a bear is bigger than the box units it is built from
const _polarBearTex = _nearestTex('textures/Entity/Animals/polar_bear.png');
function _bearLeg(mat) {
  const g = new THREE.Group();
  const m = _part(mat, 5, 8, 5, 17, 44);
  m.position.y = -4 * PX;                       // pivots at the hip
  g.add(m);
  return g;
}
function buildPolarBear() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: _polarBearTex, transparent: true, alphaTest: 0.5 });
  const body = _part(mat, 11, 10, 20, 0, 0);
  body.position.set(0, 12 * PX, 0);              // its belly a unit down over the tops of the legs
  // the head rides a pivot at the front of the shoulders: neck, skull, snout and ears dip and lunge together
  const head = new THREE.Group();
  head.position.set(0, 13 * PX, 9 * PX);
  const neck = _part(mat, 6, 6, 6, 0, 31);   neck.position.set(0, 0, 3 * PX);
  const skull = _part(mat, 7, 7, 6, 25, 31); skull.position.set(0, -0.5 * PX, 8 * PX);
  const snout = _part(mat, 4, 3, 4, 0, 44);  snout.position.set(0, -2 * PX, 13 * PX);
  const earL = _part(mat, 2, 2, 1, 38, 44);  earL.position.set( 2.5 * PX, 3.5 * PX, 7 * PX);
  const earR = _part(mat, 2, 2, 1, 38, 44);  earR.position.set(-2.5 * PX, 3.5 * PX, 7 * PX);
  head.add(neck, skull, snout, earL, earR);
  const tail = _part(mat, 3, 3, 2, 45, 44);  tail.position.set(0, 14 * PX, -10.5 * PX);
  const legFL = _bearLeg(mat); legFL.position.set(-3 * PX, 8 * PX,  7 * PX);
  const legFR = _bearLeg(mat); legFR.position.set( 3 * PX, 8 * PX,  7 * PX);
  const legBL = _bearLeg(mat); legBL.position.set(-3 * PX, 8 * PX, -7 * PX);
  const legBR = _bearLeg(mat); legBR.position.set( 3 * PX, 8 * PX, -7 * PX);
  root.add(body, head, tail, legFL, legFR, legBL, legBR);
  return { root, head, body, tail, legs: [legFL, legFR, legBL, legBR], mat, mats: [mat] };
}

/* What one polar bear is made of: its model and its size, rolled like every animal's. summon('polar_bear', x, y,
   z, opts) writes the rest (entities/mobs.js). `opts`: size. */
function makePolarBear(opts) {
  const size = _animalSize(opts);
  return { model: buildPolarBear(), scale: POLAR_BEAR_SCALE * size, own: { size } };
}

/* Polar bears: 2-5 together, on the shores of the snow and anywhere in the Ice Spikes. The spot must be in the
   snow's climate (climateAt), and outside the Ice Spikes have water within POLAR_BEAR_SHORE: a beach, a frozen bay.
   Unlike the grazers' herds they stand on snow, ice or sand, not only on grass. Out on the snow's sea ice too, round
   its open water (seasons/ice.js _iceHole). */
const POLAR_BEAR_CHUNK_CHANCE = 0.00075, POLAR_BEAR_GROUP_MIN = 2, POLAR_BEAR_GROUP_MAX = 5, POLAR_BEAR_SHORE = 10;   // chance 0.015 before 0.835491: 95% rarer
const POLAR_BEAR_BIOMES = { 'Ice Spikes': 1, 'Beach': 1, 'Snow': 1, 'Deep Snow': 1, 'Coldest Deep Snow': 1, 'Coldest Deep Snow Forest': 0.5, 'Snow Forest': 0.3,   // coldest 0.836, its forest 0.837
                            'Cold Ocean': 0.8, 'Ocean': 0.8, 'Deep Cold Ocean': 0.5, 'Deep Ocean': 0.5 };   // the sea ice
function _rollPolarBears(cx, cz) {
  if (Math.random() >= POLAR_BEAR_CHUNK_CHANCE) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const s = _findChunkSpot(cx, cz, POLAR_BEAR_BIOMES);
    if (!s) return;
    const bx = Math.floor(s.x), bz = Math.floor(s.z);
    if (!((mainGen.climateAt(bx, bz).snow || 0) > 0.5)) continue;
    if (mainGen.biomeAt(bx, bz) !== 'Ice Spikes' && !_waterNear(bx, s.y - 1, bz, POLAR_BEAR_SHORE)) continue;
    if (_otherHerdNear(s.x, s.z, 'polar_bear')) return;
    for (let n = _ri(POLAR_BEAR_GROUP_MIN, POLAR_BEAR_GROUP_MAX); n > 0; n--) {
      const sx = s.x + (Math.random() * 5 - 2.5), sz = s.z + (Math.random() * 5 - 2.5);
      const ok = !_entBlocked(sx, s.y, sz) && !_entHazard(sx, s.y, sz) && _entSpawnRoom(sx, s.y, sz);
      summon('polar_bear', ok ? sx : s.x, s.y, ok ? sz : s.z);
    }
    return;
  }
}

// its entry in the creature table (entities/mobs.js says what each line is for)
// no `fleeTime`: a bear does not bolt when it is hit, it comes for you (damageEntity, entities/combat.js)
defineMob('polar_bear', {
  name: 'Polar bear', group: 'animal', body: 'grazer',
  hp: POLAR_BEAR_HP, box: [0.5, 1.15], sized: true, foot: 'paw',
  walk: POLAR_BEAR_SPEED, flee: POLAR_BEAR_FLEE_SPEED,
  make: makePolarBear, gendered: true, build: () => buildPolarBear(),
  roll: _rollPolarBears,                               // its own rule: the snow's shores and the Ice Spikes
  save: (e) => ({ sz: e.size, g: e.gender, lv: e.level }),
  load: (s) => summon('polar_bear', s.x, s.y, s.z, { hp: s.hp, size: s.d.sz, gender: s.d.g, level: s.d.lv, hx: s.hx, hz: s.hz }),
  // a thick hide and a lot of fat
  loot: (e, pop, first) => { first(ITEM.LEATHER, LOOT.bearLeather); pop(ITEM.FAT, rollLoot(LOOT.bearFat)); },
});
