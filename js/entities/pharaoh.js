'use strict';
/* entities/pharaoh.js: the Dead Pharaoh, the summer boss. Its numbers (PH), its model in two moods, its great pyramid's
   prefab, its curses and its fight. Where its pyramid stands and placing it: entities/boss-lair.js (PYRAMID_LAIR).

   THE DEAD PHARAOH: a king of the desert dead, wrapped in old linen, dried dark skin at the face and the hands, the
   striped gold-and-blue headdress of the old kings with the cobra on its brow, a broad collar of gold, blue, turquoise
   and red, a gold false beard, and its arms crossed over its chest holding the crook and the flail. Built of boxes in
   plain colours, as the Frozen King is (entities/frozen-king.js): no texture sheet.

   TWO MOODS. Calm: pale linen, brown skin, eyes a dim amber. ENRAGED from PH.ENRAGE of its health (half) on, for good:
   the linen and the skin go dark, the eyes burn red with a glow round them, and it leans in. setPharaohMood recolours
   the same model (each material keeps its two colours: `calm`, `rage`).

   THE FIGHT (below "the fight"): it stands on its pyramid's bedrock and turns to whom it fights. Every PH.CURSE_EVERY s
   the SUMMER CURSE grows a stack on every player near (mining, heat resistance, damage reduction, no TNT); every
   PH.ATTACK_CD s it throws a cursed scroll, dashes at you and walks back, or calls four mummies up out of the floor. At
   half its health it rises in a storm of sand and comes down enraged: the PHARAOH'S CURSE fills every eye near with sand
   for 10 s, it and its mummies hit 20% harder, and its golden wand flies round it now and then. Killed: the boss boost,
   its mummies to dust, both curses lifted, its pyramid empty for good. No loot of its own yet.
   Placed by its pyramid (entities/boss-lair.js); with F3 open, Shift+F8 summons one in front of you (pharaohDebugSummon,
   17-input.js). A boss like the king: ENTITIES, kind 'pharaoh', `e.boss`; updateBoss and bossTakeHit hand it here
   (BOSS_OWN, entities/frozen-king.js), its scrolls and wand are BOSS_FX with their own `tick`, never saved
   (entities/save.js). */

const PH = {
  HP: 2400, BOX: [0.5, 2.65],                    // health; hit box: radius, height (its `box` in the creature table, below)
  ENRAGE: 0.5,                                   // enraged at this share of its health, and stays so
  SEE: 32, LOSE: 48, TURN: 2.2,                  // notices a player within SEE, forgets them past LOSE; turns this fast (rad/s)
  LEAN: 0.14,                                    // how far it leans in, enraged (radians)
  ATTACK_CD: 3.2,                                // seconds between two abilities of any kind
  // the summer curse: a stack every CURSE_EVERY s on each player within CURSE_R, up to CURSE_MAX; it holds CURSE_HOLD s after
  // a pulse, then one stack falls every CURSE_FADE s
  CURSE_R: 32, CURSE_EVERY: 5, CURSE_MAX: 20, CURSE_HOLD: 5.5, CURSE_FADE: 5,
  // its mummies: MUMMIES at a time round it, MUMMY_R out; not while MUMMY_MAX of its own still walk
  MUMMY_CD: 26, MUMMIES: 4, MUMMY_R: 2.4, MUMMY_MAX: 8,
  // the dash: a wind-up, then at you, a hit and a shove; then it walks back to where it set off, slowly
  DASH_CD: 11, DASH_MIN: 4, DASH_MAX: 18, DASH_WIND: 0.6, DASH_SPEED: 17, DASH_HIT: 30, DASH_KNOCK: 2.2, DASH_HOP: 6, RETURN_SPEED: 1.3,
  // the cursed scroll: a sheet of old papyrus thrown at you (three in a fan once enraged)
  SCROLL_SPEED: 13, SCROLL_HIT: 22, SCROLL_LIFE: 4, SCROLL_R: 0.4, SCROLL_FAN: 0.22,
  // half its health gone: it rises in a storm of sand (RAGE_S), and from then on it and its mummies hit RAGE_DMG as hard,
  // and the pharaoh's curse fills the eyes of every player within CURSE_R with sand for BLIND_S
  RAGE_S: 2.8, RAGE_LIFT: 1.1, RAGE_DMG: 1.2, RAGE_SHOVE_R: 6, BLIND_S: 10,
  // enraged: the golden wand, flying round it for WAND_S, WAND_LEN long, WAND_W wide and high, spinning; a hit and a small shove
  WAND_CD: 16, WAND_S: 10, WAND_LEN: 4, WAND_W: 0.5, WAND_ORBIT: 2.8, WAND_ORBIT_SPEED: 1.5, WAND_SPIN: 4.2, WAND_Y: 1.1,
  WAND_HIT: 16, WAND_KNOCK: 0.7, WAND_EVERY: 0.7,
  // how often each is picked when ready
  W_SCROLL: 5, W_DASH: 3, W_MUMMIES: 2, W_WAND: 2.5,
  CREDIT_R: 64,                                  // players this close when it dies get the boss boost
};

/* ---- the model ---- */
// a material with its calm and its enraged colour; shadeHumanoid lights `userData.tint` (entities/rig.js)
const _phMat = (calm, rage = calm, opts) => {
  const m = new THREE.MeshBasicMaterial({ color: calm, ...opts });
  m.userData.tint = new THREE.Color(calm);
  m.userData.calm = new THREE.Color(calm);
  m.userData.rage = new THREE.Color(rage);
  return m;
};
function _phBox(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), mat);
  m.position.set(x * PX, y * PX, z * PX);
  return m;
}
// a limb or a body wrapped in linen: bands `step` high from y0 to y1, two tones in turn, a band a little proud now and then
function _phWrap(g, mats, w, d, y0, y1, x, z, step = 2) {
  for (let y = y0, k = 0; y < y1 - 0.01; y += step, k++) {
    const h = Math.min(step, y1 - y), proud = k % 3 === 1 ? 0.35 : 0;
    g.add(_phBox(mats[k & 1], w + proud, h, d + proud, x, y + h / 2, z));
  }
}
// stripes across: boxes 1 high, gold and blue in turn (the headdress, the crook, the beard)
function _phStripes(g, a, b, w, h, d, x, y0, z, step = 1) {
  for (let y = y0, k = 0; y < y0 + h - 0.01; y += step, k++) g.add(_phBox(k & 1 ? b : a, w, Math.min(step, y0 + h - y), d, x, y + Math.min(step, y0 + h - y) / 2, z));
}
const _UP = new THREE.Vector3(0, 1, 0);
function buildPharaoh() {
  const wrapA = _phMat(0xbca97f, 0x5f4f36), wrapB = _phMat(0x9c895f, 0x463a26), linen = _phMat(0xd8ccae, 0x7d715a);
  const skin = _phMat(0x6e5034, 0x2a1b11), skinDark = _phMat(0x45311f, 0x150d08), socket = _phMat(0x140d08, 0x0a0604);
  const gold = _phMat(0xd8b13a, 0xb88f25), lapis = _phMat(0x2448a0, 0x1a3478), turq = _phMat(0x2aa89c, 0x1f7f76), red = _phMat(0xb0402a, 0x8f2b1c);
  const eye = new THREE.MeshBasicMaterial({ color: 0xc9a14a });                       // lit by itself
  const halo = new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.4, depthWrite: false });
  const wraps = [wrapA, wrapB];
  const root = new THREE.Group();
  // legs, wrapped, on dark bandaged feet
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    _phWrap(leg, s < 0 ? wraps : [wrapB, wrapA], 4, 4, 1, 17, s * 2.3, 0);
    leg.add(_phBox(skinDark, 4.2, 1, 5, s * 2.3, 0.5, 0.5));
    root.add(leg);
  }
  // the kilt of white linen, its gold belt, a striped apron hanging in front
  root.add(_phBox(linen, 10, 7, 6, 0, 17.5, 0), _phBox(gold, 10.6, 1.2, 6.6, 0, 21, 0));
  for (let k = 0; k < 4; k++) root.add(_phBox(k & 1 ? lapis : gold, 0.8, 6, 0.4, -1.2 + k * 0.8, 17.6, 3.15));
  // the body: wrapped, a broad collar of gold, blue, turquoise and red over the chest and the shoulders
  const torso = new THREE.Group();
  torso.position.y = 21.5 * PX;
  root.add(torso);
  _phWrap(torso, wraps, 9, 5, 0, 13, 0, 0);
  const collar = [[11.2, gold], [10.6, lapis], [9.8, turq], [9, gold], [8, red], [6.6, gold]];
  collar.forEach(([w, m], k) => torso.add(_phBox(m, w, 1, 5.8 - k * 0.1, 0, 12.5 - k, 0)));
  // the arms: wrapped, crossed over the chest, the crook in the right hand and the flail in the left
  const arm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 6.2 * PX, 12.5 * PX, 0);
    sh.rotation.x = -0.12;
    _phWrap(sh, wraps, 3.4, 3.4, -8, 0, 0, 0);
    sh.add(_phBox(gold, 3.9, 1, 3.9, 0, -1.2, 0));                       // an armband of gold
    const fore = new THREE.Group();
    fore.position.y = -8 * PX;
    // to the far shoulder, in front of the chest; the left over the right
    fore.quaternion.setFromUnitVectors(_UP, new THREE.Vector3(-side * 6.4, 6.6, side < 0 ? 3.6 : 4.3).normalize());
    _phWrap(fore, [wrapB, wrapA], 3, 3, 0, 7.5, 0, 0, 1.5);
    fore.add(_phBox(gold, 3.5, 1, 3.5, 0, 6.6, 0));                       // a bracelet
    const hand = new THREE.Group();
    hand.position.y = 8.6 * PX;
    hand.add(_phBox(skin, 2.8, 2.4, 2.8, 0, 0, 0));
    fore.add(hand);
    // what it holds stands as the world does, whichever way the forearm turns
    const held = new THREE.Group();
    held.quaternion.copy(fore.quaternion).invert();
    hand.add(held);
    sh.add(fore);
    torso.add(sh);
    return { sh, fore, hand, held };
  };
  const armR = arm(-1), armL = arm(1);
  // the crook: a staff striped gold and blue, down across the body from the right hand, a hook over the shoulder
  const crook = new THREE.Group();
  crook.rotation.z = -0.45;
  _phStripes(crook, gold, lapis, 1.3, 15, 1.3, 0, -11, 0, 1.5);
  crook.add(_phBox(gold, 1.3, 2.6, 1.3, 0, 5.3, 0), _phBox(lapis, 3, 1.3, 1.3, -1.1, 6.6, 0), _phBox(gold, 1.3, 2, 1.3, -2.4, 5.6, 0));
  armR.held.add(crook);
  // the flail: a short handle, three strings of beads falling from its top
  const flail = new THREE.Group();
  flail.rotation.z = 0.45;
  _phStripes(flail, gold, lapis, 1.3, 6, 1.3, 0, -2, 0, 1.5);
  for (const dx of [-0.9, 0, 0.9])
    for (let k = 0; k < 5; k++) flail.add(_phBox([gold, lapis, red][k % 3], 1, 1, 1, dx * 1.2 + 1.1 + dx * 0.5 * k / 4, 3.6 - k * 1.1, 0));
  armL.held.add(flail);
  // the head: dried dark skin, sunken cheeks, deep sockets with the eyes in them, a gold false beard striped blue
  const head = new THREE.Group();
  head.position.y = 13 * PX;
  torso.add(head);
  _phWrap(head, wraps, 3.6, 3.6, 0, 2, 0, 0, 1);                         // the neck, wrapped
  head.add(_phBox(skin, 7, 8, 7, 0, 6, 0));
  for (const s of [-1, 1]) {
    head.add(_phBox(skinDark, 1.4, 1.8, 0.4, s * 2.4, 4.6, 3.55));      // a sunken cheek
    head.add(_phBox(socket, 2.2, 1.5, 0.4, s * 1.6, 6.9, 3.56));        // the socket
  }
  const eyes = [], halos = [];
  for (const s of [-1, 1]) {
    const e = _phBox(eye, 1.2, 0.7, 0.4, s * 1.6, 6.9, 3.62);
    head.add(e); eyes.push(e);
    const h = _phBox(halo, 3.2, 2.4, 0.3, s * 1.6, 6.9, 3.85);
    h.visible = false;
    head.add(h); halos.push(h);
  }
  head.add(_phBox(skin, 1, 1.8, 0.7, 0, 5.4, 3.75));                     // the nose
  head.add(_phBox(socket, 2.6, 0.5, 0.3, 0, 3.4, 3.56));                 // the mouth
  _phStripes(head, gold, lapis, 1.4, 3.6, 1.2, 0, -1.6, 3.2, 0.9);       // the beard, under the chin
  // the headdress (nemes): a gold band over the brow, a striped cap, striped flaps down past the jaw and over the
  // shoulders in front, a striped fall behind, a braid down the back
  const nemes = new THREE.Group();
  head.add(nemes);
  nemes.add(_phBox(gold, 7.6, 1, 7.6, 0, 8.4, 0));
  _phStripes(nemes, gold, lapis, 7.8, 2.2, 7.8, 0, 8.9, 0, 0.75);
  nemes.add(_phBox(gold, 6.6, 0.6, 6.6, 0, 11.3, 0));
  for (const s of [-1, 1]) {
    _phStripes(nemes, gold, lapis, 1, 6, 6.6, s * 4, 3.4, -0.3, 1);       // over the temples and the ears
    _phStripes(nemes, gold, lapis, 2.6, 8.2, 1.3, s * 3.7, -4.6, 3.1, 1); // the flaps in front of the shoulders
  }
  _phStripes(nemes, gold, lapis, 8.4, 9, 1.4, 0, 1, -4.1, 1);            // the fall behind
  nemes.add(_phBox(gold, 1.6, 5, 1.6, 0, -1.4, -4.6));                  // the braid
  // the cobra on its brow, its hood and a red stone
  nemes.add(_phBox(gold, 0.9, 2.4, 0.9, 0, 9.6, 4.2), _phBox(gold, 1.8, 1.4, 0.6, 0, 11, 4.3), _phBox(red, 0.6, 0.6, 0.3, 0, 11, 4.65));
  const mats = [wrapA, wrapB, linen, skin, skinDark, socket, gold, lapis, turq, red];
  return { root, torso, head, armR, armL, crook, flail, eyes, halos, eye, halo, mats };
}

/* ---- its moods ---- */
// calm or enraged: every material to its colour for it, the eyes and their glow
function setPharaohMood(e, rage) {
  e.enraged = !!rage;
  const m = e.model;
  for (const mat of m.mats) mat.userData.tint.copy(rage ? mat.userData.rage : mat.userData.calm);
  for (const h of m.halos) h.visible = !!rage;
}

/* ---- spawn ---- */
function spawnPharaoh(x, y, z) {
  const m = buildPharaoh();
  m.root.position.set(x, y, z);
  scene.add(m.root);
  const e = {
    model: m, x, y, z, vy: 0, yaw: 0, hp: PH.HP, maxHp: PH.HP,
    kind: 'pharaoh', boss: 'pharaoh', name: 'Dead Pharaoh',
    inventory: [], hx: x, hz: z, hurtT: 0, flailT: 0, kx: 0, kz: 0, onGround: true, active: true, state: 'idle',
    enraged: false, t: Math.random() * 10, target: null,
    atkCd: 2.5, cdDash: 6, cdMummies: 8, cdWand: 0, curseT: 1, castT: 0, raiseT: 0, lift: 0,
    rageT: 0, dash: null, back: null, mummies: [],
  };
  ENTITIES.push(e);
  return e;
}
// Shift+F8 with F3 open (17-input.js): one in front of you, on the ground (until its pyramid places it)
function pharaohDebugSummon() {
  if (!currentWorld || menuScene || !player.spawned) return;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const x = player.pos.x + fx * 6, z = player.pos.z + fz * 6;
  let y = Math.floor(player.pos.y) + 4;
  while (y > 1 && !isSolid(Math.floor(x), y - 1, Math.floor(z))) y--;
  _useBox({ kind: 'pharaoh' });
  while (y < WORLD_TOP - 3 && _entBlocked(x, y, z)) y++;
  _useBox(null);
  const e = spawnPharaoh(x, y, z);
  e.yaw = Math.atan2(player.pos.x - x, player.pos.z - z);
  if (typeof fxPuff === 'function') fxPuff(x, y + 1.3, z, [0.85, 0.75, 0.5], 24, 2);
  if (typeof feedInfo === 'function') feedInfo('The Dead Pharaoh wakes');
  playSound('thunder', { gain: 0.5, rate: 0.7, pos: { x, y: y + 1, z } });
  return e;
}

/* ---- its great pyramid: structures/warm/big_pyramid.json ----
   The user's build, saved from a structure block as it grows, with stand-ins put right wherever it is laid (as the snow
   castle's markers are, entities/boss-lair.js), so the file can be saved again as it is built:
     gravel            sand, whole or in layers (the same layers: a gravel carpet is a sand carpet)
     grass plants      a carpet of red sand (a tall grass's upper half goes)
     bedrock           where the Dead Pharaoh stands: air, kept as `boss` [x, y, z] in the prefab
   Laid on the Deep Red Desert Flat by PYRAMID_LAIR (entities/boss-lair.js), which lays what pharaohPyramidPrefab() gives. */
const PH_PYRAMID = { PREFAB: 'big_pyramid' };
const _PH_GRASS = new Set([B.SHORT_GRASS, B.TALLGRASS, B.TALL_LOWER]);
let _phPyramidCache = null;
// { prefab, boss }: the prefab put right and its boss's cell, built once from the loaded prefab; null while it is not in
function pharaohPyramidPrefab() {
  const src = typeof STRUCTURES !== 'undefined' ? STRUCTURES.get(PH_PYRAMID.PREFAB) : null;
  if (!src || !Array.isArray(src.blocks)) return null;
  if (_phPyramidCache && _phPyramidCache.src === src) return _phPyramidCache;
  let boss = null;
  const blocks = [];
  for (const b of src.blocks) {
    if (!Array.isArray(b) || b.length < 4) continue;
    let [x, y, z, id, v = 0] = b;
    if (id === B.BEDROCK) { boss = [x, y, z]; continue; }                    // where it stands
    if (id === B.TALL_UPPER) continue;                                       // a tall grass's top: its foot is the carpet
    if (id === B.GRAVEL) id = B.SAND;                                        // its layers, if any, kept
    else if (_PH_GRASS.has(id)) { id = B.RED_SAND; v = SHAPE_LAYER; }       // one layer of red sand
    blocks.push(b.length > 5 ? [x, y, z, id, v, b[5]] : [x, y, z, id, v]);  // its look kept (blocks/looks.js)
  }
  _phPyramidCache = { src, prefab: { ...src, blocks, boss }, boss };
  return _phPyramidCache;
}

/* ==================================== the fight ==================================== */
/* ---- its two curses (EFFECT_DEFS, player/effects.js: read by the stats as any effect is) ---- */
/* THE SUMMER CURSE, in stacks (an entry's `stacks`: _effectSum counts its numbers once a stack). Every CURSE_EVERY s while it is
   simulated, each player within CURSE_R gets one more, up to CURSE_MAX; away from it one falls every CURSE_FADE s
   (`stackFade`, tickPlayerEffects). Each: mining speed -10% (none at all from 10), heat resistance -2%, damage reduction -1%
   (armorDamageMultiplier, player/equipment.js); and no TNT goes down (`noTnt`, player/place-block.js). */
EFFECT_DEFS.summerCurse = { name: 'Summer curse', good: false, img: 'Curse/summer_curse.png', icon: '☀️', stackFade: PH.CURSE_FADE,
  miningSpeed: -0.1, heatResist: -0.02, damageReduction: -0.01, noTnt: true,        // each stack
  desc: 'Each stack: mining speed -10%, heat resistance -2%, damage reduction -1%. TNT cannot be put down.',
  stackDesc: (n) => `${n} of ${PH.CURSE_MAX}: mining speed -${Math.min(100, n * 10)}%${n >= 10 ? ' (you cannot mine)' : ''}, ` +
                    `heat resistance -${n * 2}%, damage reduction -${n}%. TNT cannot be put down.`,
  lasts: `A stack every ${PH.CURSE_EVERY} s within ${PH.CURSE_R} blocks of the Dead Pharaoh, up to ${PH.CURSE_MAX}; away from him one ` +
         `falls every ${PH.CURSE_FADE} s. All gone when he dies.` };
/* THE PHARAOH'S CURSE, from its rage: sand whirls round the eyes (`sandBlind`: the fog in 52-clouds.js applyMist, the grains
   fxCurseSand below) for BLIND_S. */
EFFECT_DEFS.pharaohCurse = { name: "Pharaoh's curse", time: PH.BLIND_S, good: false, img: 'Debuff/blindness.png', icon: '🏜️', sandBlind: true,
  desc: 'Sand whirls round your eyes: you see only a few blocks.',
  lasts: `${PH.BLIND_S} s from the Dead Pharaoh's rage. Milk lifts it.` };
function _phCursePulse(e) {
  let any = false;
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    if (Math.hypot(p.pos.x - e.x, p.pos.y - e.y, p.pos.z - e.z) > PH.CURSE_R) continue;
    const list = p.effects || (p.effects = []), had = list.find(x => x.id === 'summerCurse');
    if (had) { had.stacks = Math.min(PH.CURSE_MAX, (had.stacks || 1) + 1); had.left = Math.max(had.left, PH.CURSE_HOLD); }
    else list.push({ id: 'summerCurse', left: PH.CURSE_HOLD, stacks: 1 });
    withPlayer(p, () => {
      if (!had && typeof feedWarn === 'function') feedWarn('The summer curse is on you: it grows while you are near the Dead Pharaoh');
      if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
    });
    any = true;
  }
  if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 0.3, e.z, _PH_SAND, any ? 14 : 6, 2.2);   // hot sand breathed out round it
}
const _PH_SAND = [0.86, 0.7, 0.42], _PH_RED = [0.6, 0.12, 0.06];
// what its blows take: more once enraged, and its mummies' as well
const _phMul = (e) => e.enraged ? PH.RAGE_DMG : 1;
// the sand round a cursed player's eyes, a whirl (49-particles.js, for every player each frame)
function fxCurseSand(p, dt) {
  if (!p.effects || !p.effects.some(x => x.id === 'pharaohCurse') || typeof _fxDust !== 'function') return;
  const ey = p.pos.y + (p.EYE || 1.62);
  p._fxCurseAcc = Math.min(30, (p._fxCurseAcc || 0) + 90 * (typeof _fxScale === 'number' ? _fxScale : 1) * dt);
  while (p._fxCurseAcc >= 1) {
    p._fxCurseAcc -= 1;
    const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.2;
    const x = p.pos.x + Math.cos(a) * r, y = ey + (Math.random() - 0.5) * 2.4, z = p.pos.z + Math.sin(a) * r;
    if (getBlock(Math.floor(x), Math.floor(y), Math.floor(z))) continue;
    const i = _fxDust(x, y, z, _PH_SAND, _fxLight(x, y, z), 0.6 + Math.random() * 0.6, 0.05 + Math.random() * 0.06);
    if (i < 0) break;
    const S = FX.sprites, sp = 3 + Math.random() * 2;          // round the eyes
    S.vx[i] = -Math.sin(a) * sp; S.vz[i] = Math.cos(a) * sp; S.vy[i] = (Math.random() - 0.5) * 0.8;
    S.grav[i] = 0.1; S.drag[i] = 0; S.flags[i] = FX_FADEIN;
  }
}

/* ---- being hit (bossTakeHit hands it here) ---- */
function pharaohTakeHit(e, dmg) {
  if (!e || e.hp <= 0) return e ? e.hp <= 0 : false;
  if (!e.target && !player.canFly) e.target = player;
  e.hp -= dmg;
  e.hurtT = 0.25;
  if (typeof _fxEntHurt === 'function') _fxEntHurt(e, dmg);
  if (e.hp <= 0) { _pharaohDie(e); return true; }
  _pharaohRageCheck(e);
  return false;
}
// half its health gone: it rises in its storm of sand (_phRageTick), and stays enraged
function _pharaohRageCheck(e) {
  if (e.enraged || e.rageT > 0 || e.hp > e.maxHp * PH.ENRAGE) return;
  e.rageT = PH.RAGE_S;
  e.dash = null;
  playSound('thunder', { gain: 0.7, rate: 0.5, pos: { x: e.x, y: e.y + 2, z: e.z } });
  if (typeof feedInfo === 'function') feedInfo('The Dead Pharaoh rises in a storm of sand');
}
function _pharaohDie(e) {
  e.hp = 0;
  playSound('death', { gain: 1, rate: 0.55, pos: { x: e.x, y: e.y + 1, z: e.z } });
  if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 1.3, e.z, [0.85, 0.75, 0.5], 30, 2.2);
  if (typeof fxDeath === 'function') fxDeath(e.x, e.y, e.z, PH.BOX[1]);
  for (let i = BOSS_FX.length - 1; i >= 0; i--) if (BOSS_FX[i].owner === e) _bossFxRemove(i);   // its wand and scrolls
  for (const m of e.mummies) {                                         // its mummies fall to dust with it
    const i = ENTITIES.indexOf(m);
    if (i < 0) continue;
    if (typeof fxPuff === 'function') fxPuff(m.x, m.y + 1, m.z, _PH_SAND, 14, 1.2);
    _removeEntity(i);
  }
  if (e.lairKey && typeof BOSS_LAIRS !== 'undefined') { const l = BOSS_LAIRS.get(e.lairKey); if (l) l.defeated = true; }   // its pyramid stays empty
  for (const p of PLAYERS) {
    if (!p.spawned || Math.hypot(p.pos.x - e.x, p.pos.z - e.z) > PH.CREDIT_R) continue;
    if (!p.canFly) _grantBossBoost(p, e.boss, e.name);
    const list = p.effects;                                            // both curses lift at once
    if (list) for (let k = list.length - 1; k >= 0; k--) if (list[k].id === 'summerCurse' || list[k].id === 'pharaohCurse') list.splice(k, 1);
  }
  if (typeof feedInfo === 'function') feedInfo('The Dead Pharaoh falls to dust');
  const i = ENTITIES.indexOf(e);
  if (i >= 0) _removeEntity(i);
}

/* ---- each tick (updateBoss hands it here) ---- */
/* It stands where it was put (`hx`, `hz`: its pyramid's bedrock), turned to whom it fights: keeps them while within LOSE,
   else the nearest within SEE (not a creative player). Every ATTACK_CD seconds it picks what to do, by weight, from what is
   ready: a cursed scroll (always, while it sees you), the dash, its mummies, and once enraged the golden wand. After a dash it
   walks back to where it set off, slowly. */
function _pharaohTarget(e) {
  let best = null, bd = Infinity;
  const keep = e.target && PLAYERS.includes(e.target) ? e.target : null;
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    const d = Math.hypot(p.pos.x - e.x, p.pos.y - e.y, p.pos.z - e.z);
    if (p === keep && d <= PH.LOSE) return p;
    if (d <= PH.SEE && d < bd) { bd = d; best = p; }
  }
  return best;
}
function updatePharaoh(e, dt) {
  const m = e.model;
  const ecx = Math.floor(e.x / 16), ecz = Math.floor(e.z / 16), ch = getChunk(ecx, ecz);
  const loaded = !!(ch && ch.data);
  const shown = loaded && chunkDist2ToPlayers(ecx, ecz) <= viewDist * viewDist;
  if (m.root.visible !== shown) m.root.visible = shown;
  if (!loaded || !inSimRangeChunk(ecx, ecz)) { e.active = false; return; }
  e.active = true;
  e.t += dt;
  if (e.hurtT > 0) e.hurtT -= dt;
  if (e.castT > 0) e.castT -= dt;
  if (e.raiseT > 0) e.raiseT -= dt;
  e.cdDash -= dt; e.cdMummies -= dt; e.cdWand -= dt;
  e.kx = e.kz = 0;                                                     // it does not budge
  _pharaohRageCheck(e);                                                // (its health may be set from elsewhere)
  const tp = e.target = _pharaohTarget(e);
  if ((e.curseT -= dt) <= 0) { e.curseT = PH.CURSE_EVERY; _phCursePulse(e); }   // the summer curse
  if (e.rageT > 0) _phRageTick(e, dt);
  else if (e.dash) _phDashTick(e, dt);
  else {
    if (e.back) _phBackTick(e, dt);
    if (tp) {
      const want = Math.atan2(tp.pos.x - e.x, tp.pos.z - e.z);
      let d = want - e.yaw; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      e.yaw += Math.max(-PH.TURN * dt, Math.min(PH.TURN * dt, d));
      if ((e.atkCd -= dt) <= 0) { e.atkCd = PH.ATTACK_CD; _pharaohAct(e, tp); }
    }
  }
  _phSettle(e, dt);
  _pharaohPose(e, tp);
}
// on its floor (lifted by its rage); nothing under it, it sinks
function _phSettle(e, dt) {
  const g = _bossGround(e.x, e.y + 1.2 - e.lift, e.z, 10);
  const want = (g != null ? g : e.y - e.lift - 4 * dt) + e.lift;
  e.y += (want - e.y) * Math.min(1, 10 * dt);
}

/* ---- choosing what to do ---- */
function _pharaohAct(e, tp) {
  const sees = typeof hasLineOfSight !== 'function' || hasLineOfSight(e.x, e.y + 2.2, e.z, tp.pos.x, tp.pos.y + 1.2, tp.pos.z);
  const d = Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z);
  e.mummies = e.mummies.filter(m => m.hp > 0 && ENTITIES.includes(m));
  const pool = [];
  if (sees) pool.push(['scroll', PH.W_SCROLL]);
  if (sees && !e.back && e.cdDash <= 0 && d >= PH.DASH_MIN && d <= PH.DASH_MAX && Math.abs(tp.pos.y - e.y) < 3) pool.push(['dash', PH.W_DASH]);
  if (e.cdMummies <= 0 && e.mummies.length < PH.MUMMY_MAX) pool.push(['mummies', PH.W_MUMMIES]);
  if (e.enraged && e.cdWand <= 0 && !BOSS_FX.some(f => f.owner === e && f.type === 'wand')) pool.push(['wand', PH.W_WAND]);
  if (!pool.length) { e.atkCd = 1; return; }                         // nothing to do from here: look again soon
  let r = Math.random() * pool.reduce((s, a) => s + a[1], 0), pick = pool[0][0];
  for (const [k, w] of pool) { if ((r -= w) <= 0) { pick = k; break; } }
  if (pick === 'scroll') _phScrolls(e, tp);
  else if (pick === 'dash') { e.cdDash = PH.DASH_CD; _phDashStart(e, tp); }
  else if (pick === 'mummies') { e.cdMummies = PH.MUMMY_CD; _phMummies(e); }
  else { e.cdWand = PH.WAND_CD + PH.WAND_S; _phWand(e); }
}
// where its right hand (the crook) throws from: before its chest, or its chest when that is in a wall
function _phHand(e) {
  const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
  const h = { x: e.x + s * 0.6 - c * 0.35, y: e.y + 2.1, z: e.z + c * 0.6 + s * 0.35 };
  return isSolid(Math.floor(h.x), Math.floor(h.y), Math.floor(h.z)) ? { x: e.x, y: e.y + 2.0, z: e.z } : h;
}
const _PH_FXMAT = {
  sheet: new THREE.MeshBasicMaterial({ color: 0xe9dcb4, side: THREE.DoubleSide }),
  roll: new THREE.MeshBasicMaterial({ color: 0xc4a46c }),
  ink: new THREE.MeshBasicMaterial({ color: 0x4a301a }),
  gold: new THREE.MeshBasicMaterial({ color: 0xe6bd3e }),
  goldDark: new THREE.MeshBasicMaterial({ color: 0xa47c1c }),
  lapis: new THREE.MeshBasicMaterial({ color: 0x2448a0 }),
};

/* ---- the cursed scroll: a sheet of papyrus rolled at both ends, thrown at you, fluttering ---- */
function _phScrollMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(_bossGeo('phSheet', () => new THREE.BoxGeometry(0.5, 0.02, 0.38)), _PH_FXMAT.sheet));
  for (const s of [-1, 1]) {
    const roll = new THREE.Mesh(_bossGeo('phRoll', () => new THREE.CylinderGeometry(0.05, 0.05, 0.54, 8)), _PH_FXMAT.roll);
    roll.rotation.z = Math.PI / 2;
    roll.position.z = s * 0.2;
    g.add(roll);
  }
  for (const z of [-0.09, -0.03, 0.03, 0.09]) {                      // lines of old writing
    const line = new THREE.Mesh(_bossGeo('phInk', () => new THREE.BoxGeometry(0.32, 0.024, 0.02)), _PH_FXMAT.ink);
    line.position.set((Math.random() - 0.5) * 0.06, 0.001, z);
    g.add(line);
  }
  return g;
}
function _phScrolls(e, tp) {
  e.castT = 0.55;
  const h = _phHand(e), n = e.enraged ? 3 : 1;
  const dx = tp.pos.x - h.x, dz = tp.pos.z - h.z, dy = tp.pos.y + 1.1 - h.y;
  const base = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1);
  for (let k = 0; k < n; k++) {
    const a = base + (k - (n - 1) / 2) * PH.SCROLL_FAN, cp = Math.cos(pitch) * PH.SCROLL_SPEED;
    const group = _phScrollMesh();
    group.position.set(h.x, h.y, h.z);
    scene.add(group);
    BOSS_FX.push({ type: 'scroll', owner: e, group, vx: Math.sin(a) * cp, vy: Math.sin(pitch) * PH.SCROLL_SPEED, vz: Math.cos(a) * cp,
                   age: 0, mul: _phMul(e), tick: _phScrollTick });
  }
  playSound('snowball', { gain: 0.7, rate: 1.35, pos: h });
}
function _phScrollTick(f, dt) {
  f.age += dt;
  const pos = f.group.position;
  const steps = Math.max(1, Math.ceil(PH.SCROLL_SPEED * dt / 0.25)), sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    const nx = pos.x + f.vx * sdt, ny = pos.y + f.vy * sdt, nz = pos.z + f.vz * sdt;
    const p = _bossPlayerAt(nx, ny, nz, PH.SCROLL_R);
    if (p) {
      _bossHurt(p, PH.SCROLL_HIT * f.mul, 'was cut by a cursed scroll', f.vx * 0.12, f.vz * 0.12, 0, { x: pos.x - f.vx, z: pos.z - f.vz }, true);
      _phScrollTear(nx, ny, nz);
      return false;
    }
    if (isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { _phScrollTear(pos.x, pos.y, pos.z); return false; }
    pos.set(nx, ny, nz);
  }
  f.group.rotation.y += 9 * dt;                                        // it spins and flutters
  f.group.rotation.x = Math.sin(f.age * 11) * 0.5;
  return f.age < PH.SCROLL_LIFE;
}
function _phScrollTear(x, y, z) {
  if (typeof fxPuff === 'function') fxPuff(x, y, z, [0.92, 0.86, 0.7], 9, 0.8);
  playSound('hit', { gain: 0.5, rate: 1.5, pos: { x, y, z } });
}

/* ---- the dash: a wind-up, at you, a hit; then back to where it set off, slowly ---- */
function _phDashStart(e, tp) {
  e.dash = { phase: 'wind', t: PH.DASH_WIND, fromX: e.x, fromZ: e.z, ux: 0, uz: 0, len: 0, went: 0, hit: false };
  e.back = null;
  playSound('thunder', { gain: 0.3, rate: 1.8, pos: { x: e.x, y: e.y + 1, z: e.z } });
}
function _phDashTick(e, dt) {
  const d = e.dash;
  if (d.phase === 'wind') {                                           // crouched, sand kicked up at its feet
    if (Math.random() < 0.6 && typeof fxPuff === 'function') fxPuff(e.x + (Math.random() - 0.5), e.y + 0.1, e.z + (Math.random() - 0.5), _PH_SAND, 2, 0.6);
    if ((d.t -= dt) > 0) return;
    const tp = e.target;
    if (!tp) { e.dash = null; return; }
    const dx = tp.pos.x - e.x, dz = tp.pos.z - e.z, dist = Math.hypot(dx, dz) || 1;   // at where you are now
    d.ux = dx / dist; d.uz = dz / dist; d.len = Math.min(PH.DASH_MAX + 2, dist + 1.5);
    d.phase = 'go';
    e.yaw = Math.atan2(d.ux, d.uz);
    playSound('snowball', { gain: 0.8, rate: 0.6, pos: { x: e.x, y: e.y + 1, z: e.z } });
    return;
  }
  const step = PH.DASH_SPEED * dt, n = Math.max(1, Math.ceil(step / 0.3)), s = step / n;
  for (let k = 0; k < n; k++) {
    const ox = e.x, oz = e.z;
    _bossMoveTo(e, e.x + d.ux * s, e.y, e.z + d.uz * s);
    d.went += s;
    for (const p of PLAYERS) {                                        // whoever it runs into
      if (d.hit || !p.spawned || p.dead || p.canFly) continue;
      if (Math.hypot(p.pos.x - e.x, p.pos.z - e.z) > (p.R || 0.3) + PH.BOX[0] + 0.25) continue;
      if (p.pos.y > e.y + PH.BOX[1] || p.pos.y + (p.H || 1.8) < e.y) continue;
      d.hit = true;
      _bossHurt(p, PH.DASH_HIT * _phMul(e), 'was trampled by the Dead Pharaoh', d.ux * PLY_KNOCK * PH.DASH_KNOCK,
                d.uz * PLY_KNOCK * PH.DASH_KNOCK, PH.DASH_HOP, { x: e.x, z: e.z });
      if (typeof fxPuff === 'function') fxPuff(p.pos.x, p.pos.y + 1, p.pos.z, _PH_SAND, 16, 1.4);
      playSound('hit', { gain: 1, rate: 0.6, pos: { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z } });
    }
    if (d.hit || Math.hypot(e.x - ox, e.z - oz) < s * 0.3 || d.went >= d.len) {   // struck, a wall, or as far as it goes
      e.dash = null;
      e.back = { x: d.fromX, z: d.fromZ, t: 0 };
      return;
    }
  }
  if (typeof fxPuff === 'function') fxPuff(e.x - d.ux * 0.6, e.y + 0.2, e.z - d.uz * 0.6, _PH_SAND, 3, 0.7);   // its trail
}
function _phBackTick(e, dt) {
  const b = e.back, dx = b.x - e.x, dz = b.z - e.z, d = Math.hypot(dx, dz);
  b.t += dt;
  if (d < 0.25 || b.t > 30) { e.back = null; return; }                // home, or given up (something in the way)
  const s = Math.min(d, PH.RETURN_SPEED * dt);
  _bossMoveTo(e, e.x + dx / d * s, e.y, e.z + dz / d * s);
}

/* ---- its mummies: MUMMIES rise out of the floor round it, sun-proof, and fight for it ---- */
function _phMummies(e) {
  e.raiseT = 1.1;
  playSound('thunder', { gain: 0.45, rate: 1.25, pos: { x: e.x, y: e.y + 2, z: e.z } });
  const a0 = Math.random() * Math.PI * 2;
  for (let k = 0; k < PH.MUMMIES; k++) {
    const a = a0 + k * Math.PI * 2 / PH.MUMMIES;
    const x = e.x + Math.cos(a) * PH.MUMMY_R, z = e.z + Math.sin(a) * PH.MUMMY_R;
    const g = _bossGround(x, e.y + 2, z, 6);
    if (g == null) continue;
    _useBox({ kind: 'zombie' });
    const blocked = _entBlocked(x, g, z);
    _useBox(null);
    if (blocked) continue;
    const m = summon('zombie', x, g, z);                               // it climbs up out of the floor as any zombie rises
    if (!m.mummy) _zombieMummify(m);
    m.sunProof = true;
    m.pharaohOf = e;
    m.dmg = ZOMBIE_DMG * _phMul(e);
    e.mummies.push(m);
    if (typeof fxPuff === 'function') fxPuff(x, g + 0.2, z, _PH_SAND, 12, 1.1);
  }
}

/* ---- the golden wand (enraged): it flies round the pharaoh, spinning, for WAND_S ---- */
function _phWandMesh() {
  const g = new THREE.Group(), L = PH.WAND_LEN, W = PH.WAND_W;
  g.add(new THREE.Mesh(_bossGeo('phWand', () => new THREE.BoxGeometry(L, W, W)), _PH_FXMAT.gold));
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(_bossGeo('phWandCap', () => new THREE.BoxGeometry(0.3, W * 1.3, W * 1.3)), _PH_FXMAT.goldDark);
    cap.position.x = s * (L / 2 - 0.15);
    g.add(cap);
    const ring = new THREE.Mesh(_bossGeo('phWandRing', () => new THREE.BoxGeometry(0.12, W * 1.12, W * 1.12)), _PH_FXMAT.goldDark);
    ring.position.x = s * 1;
    g.add(ring);
  }
  g.add(new THREE.Mesh(_bossGeo('phWandBand', () => new THREE.BoxGeometry(0.42, W * 1.1, W * 1.1)), _PH_FXMAT.lapis));
  return g;
}
function _phWand(e) {
  e.castT = 0.9;
  const group = _phWandMesh();
  group.scale.setScalar(0.05);
  scene.add(group);
  BOSS_FX.push({ type: 'wand', owner: e, group, age: 0, ang: Math.atan2(Math.cos(e.yaw), Math.sin(e.yaw)), spin: 0,
                 mul: _phMul(e), hitAt: new Map(), tick: _phWandTick });
  playSound('glass', { gain: 0.6, rate: 0.6, pos: { x: e.x, y: e.y + 2, z: e.z } });
}
function _phWandTick(f, dt) {
  const e = f.owner;
  if (!ENTITIES.includes(e) || e.hp <= 0) return false;
  f.age += dt;
  f.ang += PH.WAND_ORBIT_SPEED * dt;
  f.spin += PH.WAND_SPIN * dt;
  const k = Math.min(1, f.age / 0.5, (PH.WAND_S - f.age) / 0.5);    // it grows in, and shrinks away at the end
  if (k <= 0) return false;
  const cx = e.x + Math.cos(f.ang) * PH.WAND_ORBIT, cz = e.z + Math.sin(f.ang) * PH.WAND_ORBIT;
  const cy = e.y + PH.WAND_Y + Math.sin(f.age * 3) * 0.15;
  f.group.position.set(cx, cy, cz);
  f.group.rotation.y = f.spin;
  f.group.scale.setScalar(Math.max(0.05, k));
  // its reach: its length along the spin (three turns +X to (cos, 0, -sin)), its width round that
  const half = PH.WAND_LEN / 2 * k, ux = Math.cos(f.spin), uz = -Math.sin(f.spin);
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    if (p.pos.y > cy + PH.WAND_W / 2 || p.pos.y + (p.H || 1.8) < cy - PH.WAND_W / 2) continue;
    const rx = p.pos.x - cx, rz = p.pos.z - cz, t = Math.max(-half, Math.min(half, rx * ux + rz * uz));
    if (Math.hypot(rx - ux * t, rz - uz * t) > PH.WAND_W / 2 + (p.R || 0.3)) continue;
    if (f.age - (f.hitAt.get(p) ?? -1e9) < PH.WAND_EVERY) continue;
    f.hitAt.set(p, f.age);
    const ox = p.pos.x - e.x, oz = p.pos.z - e.z, od = Math.hypot(ox, oz) || 1;   // shoved a little, away from the pharaoh
    _bossHurt(p, PH.WAND_HIT * f.mul, "was struck by the Dead Pharaoh's wand", ox / od * PLY_KNOCK * PH.WAND_KNOCK,
              oz / od * PLY_KNOCK * PH.WAND_KNOCK, 2.5);
    playSound('hit', { gain: 0.8, rate: 1.2, pos: { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z } });
  }
  if (typeof _fxGlint === 'function' && typeof FX !== 'undefined' && Math.random() < 0.6) {
    const s = Math.random() < 0.5 ? -1 : 1;
    _fxGlint(FX.sprites, cx + ux * half * s, cy, cz + uz * half * s, [1, 0.85, 0.3], 0.1);
  }
  return f.age < PH.WAND_S;
}

/* ---- the rage: it rises in a storm of sand, turning dark as it goes; landing, it curses every eye near ---- */
function _phRageTick(e, dt) {
  const t = PH.RAGE_S - e.rageT, k = Math.min(1, t / PH.RAGE_S);    // seconds in, and how far through
  e.rageT -= dt;
  e.lift = PH.RAGE_LIFT * Math.min(1, t / 0.8, Math.max(0, e.rageT) / 0.5);   // up, held, and down
  if (typeof fxPuff === 'function')                                    // the storm: sand spiralling up round it
    for (let n = 0; n < 3; n++) {
      const a = e.t * 6 + n * Math.PI * 2 / 3, r = 1.1 + 0.5 * Math.sin(e.t * 3 + n), y = e.y - e.lift + ((e.t * 1.7 + n / 3) % 1) * 3.2;
      fxPuff(e.x + Math.cos(a) * r, y, e.z + Math.sin(a) * r, _PH_SAND, 1, 0.35);
    }
  if (!e.enraged) {                                                    // its colours darken as it rises
    for (const mat of e.model.mats) mat.userData.tint.copy(mat.userData.calm).lerp(mat.userData.rage, k);
    if (k >= 0.55) {                                                   // ...and the rage takes it, with a flash
      setPharaohMood(e, true);
      if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 2.2, e.z, _PH_RED, 24, 1.6);
      playSound('thunder', { gain: 0.8, rate: 0.55, pos: { x: e.x, y: e.y + 2, z: e.z } });
    }
  }
  if (e.rageT > 0) return;
  // it lands: the blast of sand, the pharaoh's curse, its mummies' strength
  e.rageT = 0; e.lift = 0;
  if (!e.enraged) setPharaohMood(e, true);
  if (typeof fxPuff === 'function') { fxPuff(e.x, e.y + 0.4, e.z, _PH_SAND, 40, 3.5); fxPuff(e.x, e.y + 1.5, e.z, _PH_RED, 16, 2); }
  playSound('thunder', { gain: 1, rate: 0.45, pos: { x: e.x, y: e.y + 1, z: e.z } });
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    const dx = p.pos.x - e.x, dz = p.pos.z - e.z, d = Math.hypot(dx, dz);
    if (Math.hypot(d, p.pos.y - e.y) > PH.CURSE_R) continue;
    _bossPutEffect(p, 'pharaohCurse', PH.BLIND_S, "The Pharaoh's curse: sand fills your eyes");
    if (d < PH.RAGE_SHOVE_R) _bossHurt(p, 0, 'was thrown down by the Dead Pharaoh', dx / (d || 1) * PLY_KNOCK, dz / (d || 1) * PLY_KNOCK, 4);
  }
  for (const m of e.mummies) if (m.hp > 0) m.dmg = ZOMBIE_DMG * PH.RAGE_DMG;
  e.cdWand = 1.5;
  e.atkCd = 1.2;
  if (typeof feedInfo === 'function') feedInfo('The Dead Pharaoh rages: he and his mummies strike harder');
}

// its look: breathing, the head on its target, leaning in and trembling when enraged, the eyes pulsing; the arms by what it
// does (crossed at rest, the right one up to throw, both up to call its mummies, spread wide in its storm)
function _pharaohPose(e, tp) {
  const m = e.model, r = e.enraged, rage = e.rageT > 0;
  const wind = !!e.dash && e.dash.phase === 'wind', going = !!e.dash && e.dash.phase === 'go';
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  m.torso.rotation.x = rage ? -0.25 : wind ? 0.5 : going ? 0.38 : (r ? PH.LEAN : 0) + Math.sin(e.t * 1.2) * 0.015;
  m.torso.rotation.z = r && !rage ? Math.sin(e.t * 23) * 0.006 : 0;
  const look = tp ? Math.max(-0.5, Math.min(0.5, -Math.atan2(tp.pos.y + 1.5 - (e.y + 2.3), Math.max(1, Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z))))) : 0;
  m.head.rotation.x = rage ? -0.45 : look - (r ? PH.LEAN * 0.6 : 0);
  const L = m.armL.sh, R = m.armR.sh;
  if (rage) { L.rotation.set(-0.3, 0, 1.25); R.rotation.set(-0.3, 0, -1.25); }
  else if (e.raiseT > 0) { L.rotation.set(-2.6, 0, 0.35); R.rotation.set(-2.6, 0, -0.35); }
  else { L.rotation.set(-0.12, 0, 0); R.rotation.set(e.castT > 0 ? -2.3 : -0.12, 0, 0); }
  if (typeof shadeHumanoid === 'function') shadeHumanoid(m, e.x, e.y + 0.8, e.z, e.hurtT > 0, false);
  const g = r ? 0.8 + 0.2 * Math.sin(e.t * 6) : 0.75 + 0.1 * Math.sin(e.t * 1.6);
  if (r) m.eye.color.setRGB(1 * g, 0.16 * g, 0.08 * g); else m.eye.color.setRGB(0.79 * g, 0.63 * g, 0.29 * g);
  if (r) m.halo.opacity = (rage ? 0.5 : 0.28) + 0.18 * Math.sin(e.t * 6);
}

BOSS_OWN.pharaoh = { update: updatePharaoh, hit: pharaohTakeHit };
BOSS_NAMES.pharaoh = 'Dead Pharaoh';

/* Its entry in the creature table (entities/mobs.js says what each line is for). A boss: no chunk rolls for it, never
   saved; its pyramid will place it. */
defineMob('pharaoh', {
  name: 'Dead Pharaoh', group: 'boss', body: 'boss',
  hp: PH.HP, box: PH.BOX,                        // its size for hits and arrows (entR / entH, entities/physics.js)
  spawn: (x, y, z) => spawnPharaoh(x, y, z), build: () => buildPharaoh(),
});
