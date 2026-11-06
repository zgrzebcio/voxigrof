'use strict';
/* js/entities/crow.js: the crow. Its numbers, its model and poses, its own `step` (updateEntities hands it to updateCrow),
   how a flock keeps together, where it lives, and its save. Flying, perching on leaves and finding a perch are every
   bird's: entities/birds.js.

   WILD, in flocks of CROW.flockMin-flockMax in the cold and the mild land (CROW_BIOMES: the cold plains and spruce forests,
   the plains, forests and mountains). A flock shares one home (hx hz) and does the same thing at the same time without
   talking: every CROW.epochS seconds each crow works out the flock's next doing from its home and the clock alone
   (_crowFlockPlan, a hash of both), so all of them change together. By day that is circling high over a place near home
   (each crow on its own part of the ring), coming down to the ground there to peck about, or sitting in a tree there; at
   night the whole flock roosts in the trees at home. It is shy: a player coming within CROW.seeR without crouching (a
   crouching one can walk right up to it; a parrot's hiding shortens it, hideSightMul), a tiger or a wild hound within CROW.dangerR, or a blow
   sends it up and away, and the crows near it with it (`_entBolt`, fleeTogether); it comes back when the flock's next
   doing begins.

   THE CROW OMEN. On the evening before a blood moon (bloodMoonComing, 53-storms.js: it is decided BLOOD_SIGN_S before it
   rises) every flock circles over its home crying out over and over. A player who hears CROW.omenCries of those cries
   (within CROW.omenR) gets the effect crowOmen for CROW.omenS seconds, once a blood moon: zombies and skeletons hit them
   CROW.omenSoft softer (crowOmenHitMul, entities/update.js, 38-ranged.js), and if they die with it, half of everything
   they carry that stacks is gone for good (`deathHalf`, read by player/hazards.js; crowOmenKeep). What cannot stack
   (tools, armor) is safe; an odd count rounds either way, so a single one is lost half the time.

   Its model is js/models/crow.js (from textures/Entity/Animals/crow.json: bones body, head, wing_left, wing_right; legs
   and tail on the body) and its sheet textures/Entity/Animals/crow.png. Sounds in Sound/Mobs/Crow (its wings at take-off played a little high: `fly`'s `rate`). The
   omen's picture is textures/Gui/Effects/Animals/crow_omen.png. All numbers are in CROW. */
const CROW = {
  hp: 15, scale: 0.7,                     // the model is drawn this big at size 1
  fly: 5, flyFast: 7.5, climb: 3.5, turn: 4.5,
  fleeTime: 4, fleeTogether: 14, fleeDist: 24,   // a fright: this long, the crows this near with it, flying this far off
  seeR: 12, dangerR: 8,                   // a player standing (never one crouching) and a danger this near: the flock is off
  roamR: 20,                              // the flock's places by day: within this of its home
  epochS: 14,                             // the flock changes what it does this often, all at once
  circleR: [5, 9], circleUp: [8, 14],     // circling: the ring's radius, and its height over the ground
  peckEvery: [0.8, 2.6], peckS: 0.35,     // on the ground: a peck this often, this long
  // the omen, on the evening before a blood moon: a cry this often, heard this far, this many of them bring it; it lasts
  // this long and takes this much off a monster's blow
  omenSay: [1.5, 4], omenR: 24, omenCries: 3, omenS: 120, omenSoft: 0.1,
  // where it lives
  chunkChance: 0.03, flockMin: 3, flockMax: 6, apart: 80,
};
EFFECT_DEFS.crowOmen = { name: 'Crow omen', time: CROW.omenS, good: false, img: 'Animals/crow_omen.png', icon: '🐦', deathHalf: true,
  desc: `The crows have called a blood moon for tonight. Zombies and skeletons hit you ${Math.round(CROW.omenSoft * 100)}% softer while it lasts, ` +
        'but die with it and half of everything you carry that stacks (blocks, food, materials) is gone for good.' };
// the cold land (level -1) and the mild (level 0); their deep and hills kinds count too (_biomeWeight)
const CROW_BIOMES = { 'Cold Plains': 1, 'Spruce Forest': 1, 'Plains': 0.8, 'Forest': 0.6, 'Birch Forest': 0.6, 'Mountains': 0.4 };

/* ---------------------------------- the model ---------------------------------- */
const _crowSrc = () => boxModel('crow', 'textures/Entity/Animals/crow.png');
_crowSrc();                                 // its sheet fetched from the start
// an empty root at once, its bones put in the first frame the model is in (_crowDress, buildBoxRig)
function buildCrow() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const m = { root, mat, mats: [mat], tint: new THREE.Color(1, 1, 1), body: null };
  _crowDress(m);
  return m;
}
function _crowDress(m) {
  if (m.body) return true;
  const src = _crowSrc();
  if (!src.ready) return false;
  m.mat.map = src.tex; m.mat.needsUpdate = true;
  const { bones } = buildBoxRig(src, m.root, m.mat);
  m.body = bones.body; m.head = bones.head; m.wingL = bones.wing_left; m.wingR = bones.wing_right;
  m.bodyY = m.body.position.y;
  return true;
}
/* Posed once a step. Flying it tips forward by its speed, wings out and beating (a glide on the way down and round a
   ring); sitting it looks about with quick turns of the head; on the ground it pecks. */
function crowPose(e, m, dt, spd) {
  const k = Math.min(1, dt * 8), now = performance.now() / 1000;
  e.flyK = (e.flyK || 0) + ((e.flying ? 1 : 0) - (e.flyK || 0)) * k;
  const f = e.flyK, B = m.body, H = m.head;
  const lean = f * (0.25 + 0.7 * Math.min(1, spd / CROW.flyFast));
  B.position.y = m.bodyY;
  B.rotation.set(lean, 0, 0);
  H.rotation.set(-lean * 0.9, 0, 0);
  e.flap = (e.flap || 0) + dt * (e.flying ? (e.vyF > 0.3 ? 22 : 15) : 0);
  const beat = e.flying ? (e.vyF < -0.5 ? 0.15 : 0.75) : 0;
  const spread = f * (1.2 + Math.sin(e.flap) * beat);
  m.wingL.rotation.set(0, 0, spread);       // the left wing's bone is on +x once turned: it opens with +z
  m.wingR.rotation.set(0, 0, -spread);
  if (!e.flying) {
    if (e._peckT > 0) H.rotation.x += 0.75;
    else {
      if (!(now < e._lookAtT)) { e._lookAtT = now + 0.4 + Math.random() * 1.6; e._lookTo = (Math.random() * 2 - 1) * 0.9; }
      e._hy = (e._hy || 0) + ((e._lookTo || 0) - (e._hy || 0)) * Math.min(1, dt * 12);
      H.rotation.y = e._hy;
    }
  }
}

/* ---------------------------------- making one ---------------------------------- */
function makeCrow(opts) {
  const size = _animalSize(opts);
  return {
    model: buildCrow(), scale: size * CROW.scale,
    own: {
      size, name: 'Crow',
      flying: false, flyK: 0, flap: 0, vyF: 0,
      _goal: null, _fleeGoal: null, _airT: 0, _stuckT: 0, _peckT: 0, _peckCd: birdRand(CROW.peckEvery),
      _side: Math.random() * Math.PI * 2,   // its part of the flock's ring
      sayT: 3 + Math.random() * 12,
    },
  };
}

/* ---------------------------------- its step ---------------------------------- */
const _CROW_TIMERS = ['fleeT', 'flailT', 'turnCd', '_lookT', '_petT', 'atkAnimT', '_peckT'];
function updateCrow(e, dt, tp, i) {
  const m = e.model;
  if (!_crowDress(m)) { m.root.position.set(e.x, e.y, e.z); return false; }
  for (const t of _CROW_TIMERS) if (e[t] > 0) e[t] -= dt;
  if (!(e.fleeT > 0)) e._fleeGoal = null;
  const plan = _crowThink(e, dt);
  const spd = birdStep(e, dt, plan, i, CROW);        // flying, landing, sitting (entities/birds.js)
  if (spd < 0) return true;
  const near = Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) < 24;
  // on the ground with the flock: pecking about, now and then a mouthful
  if (!e.flying && e._fp && e._fp.mode === 'ground' && !(e.fleeT > 0)) {
    e._peckCd -= dt;
    if (e._peckCd <= 0) {
      e._peckCd = birdRand(CROW.peckEvery); e._peckT = CROW.peckS;
      if (near && Math.random() < 0.2) mobSound(e, 'eat', 0.35);
    }
  }
  /* ---- its caw now and then (more while flying), when someone is near to hear it; over and over before a blood moon ---- */
  e.sayT -= dt;
  if (e.sayT <= 0) {
    const sign = bloodMoonComing();
    e.sayT = sign ? birdRand(CROW.omenSay) : (e.flying ? 4 : 8) + Math.random() * 12;
    if (near) mobSound(e, 'say', sign ? 0.7 : 0.5);
    if (sign) _crowOmenCry(e);
  }
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  crowPose(e, m, dt, spd);
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, 0.3);
  return false;
}

/* ---------------------------------- the flock's doing ----------------------------------
   The same for every crow of a flock (the same home) in the same CROW.epochS: a hash of its home and the clock's
   epoch, so no crow needs to ask another. { ep, mode ('circle' | 'ground' | 'tree'), cx, cy, cz, r }: before a blood moon
   circling over home; at night 'tree' at home; by day circling over a place near home 40%, on the ground there 35%, in a
   tree there 25%. Kept per crow for its epoch (_fp). */
function _crowHash(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function _crowFlockPlan(e) {
  const ep = Math.floor(performance.now() / 1000 / CROW.epochS);
  if (e._fp && e._fp.ep === ep) return e._fp;
  const hx = Math.floor(e.hx), hz = Math.floor(e.hz), h = (k) => _crowHash(hx, hz, ep * 8 + k);
  const sign = bloodMoonComing(), night = isDarkTime(), r0 = h(0);
  const mode = sign ? 'circle' : night ? 'tree' : r0 < 0.4 ? 'circle' : r0 < 0.75 ? 'ground' : 'tree';
  const a = h(1) * Math.PI * 2, d = sign || night ? h(2) * 4 : h(2) * CROW.roamR;
  const cx = e.hx + Math.sin(a) * d, cz = e.hz + Math.cos(a) * d;
  const gy = surfaceY(Math.floor(cx), Math.floor(cz));
  const [u0, u1] = CROW.circleUp, [r0c, r1c] = CROW.circleR;
  e._fp = { ep, mode, cx, cz, cy: mode === 'circle' ? gy + u0 + h(3) * (u1 - u0) : gy + 1, r: r0c + h(4) * (r1c - r0c) };
  e._goal = null;
  return e._fp;
}

/* ---------------------------------- its mind ----------------------------------
   Returns a bird's plan { to, speed, land, face } (entities/birds.js): fleeing, then what frightens it, then the
   flock's doing. */
function _crowThink(e, dt) {
  const plan = { to: null, speed: CROW.fly, land: false, face: null };
  if (e.fleeT > 0) return _crowFlee(e, plan);
  const threat = _crowThreat(e);
  if (threat) {
    _entBolt(e, threat.x, threat.z);         // it and every crow near it (fleeTogether, entities/combat.js)
    e._fleeGoal = null; e._goal = null;
    mobSound(e, 'say', 0.7);
    return _crowFlee(e, plan);
  }
  const p = _crowFlockPlan(e);
  if (p.mode === 'circle') {                 // round the ring, each on its own part of it, rising and falling a little
    e._ang = (e._ang ?? e._side) + dt * CROW.fly * 0.8 / p.r;
    const a = e._ang + 0.5;
    plan.to = { x: p.cx + Math.sin(a) * p.r, y: p.cy + Math.sin(e._ang * 1.3 + e._side) * 1.2, z: p.cz + Math.cos(a) * p.r };
    return plan;
  }
  // down on the ground (looked through the trees) or into a tree there, each on its own spot near the flock's
  if (!e._goal) e._goal = birdFindPerch(p.cx, p.cy, p.cz, 4, { leaves: p.mode === 'tree' ? 'only' : 'never' })
    || { x: p.cx + Math.sin(e._side) * 2, y: p.cy + 3, z: p.cz + Math.cos(e._side) * 2, air: true };
  if (e._goal.done) return plan;
  plan.to = e._goal; plan.land = !e._goal.air;
  return plan;
}
// up and away from what frightened it, CROW.fleeDist off and higher, flat out
function _crowFlee(e, plan) {
  if (!e._fleeGoal) {
    const from = e._fleeFrom || { x: e.x - 1, z: e.z };
    let ax = e.x - from.x, az = e.z - from.z;
    const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    e._fleeGoal = { x: e.x + ax * CROW.fleeDist, y: e.y + 6 + Math.random() * 4, z: e.z + az * CROW.fleeDist, air: true };
  }
  if (e._fleeGoal.done) return plan;
  plan.to = e._fleeGoal; plan.speed = CROW.flyFast;
  return plan;
}
// what frightens it: a player coming near standing up (hideSightMul), a tiger or a wild hound near; null when nothing does
function _crowThreat(e) {
  for (const p of PLAYERS) {
    // crouching, a player can walk right up to it
    if (!p.spawned || p.dead || p.canFly || p.sneaking || Math.abs(p.pos.y - e.y) > 12) continue;
    if (Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < CROW.seeR * hideSightMul(p)) return { x: p.pos.x, z: p.pos.z };
  }
  const r = CROW.dangerR;
  for (const o of ENTITIES) {
    if (o === e || !(o.kind === 'tiger' || (o.kind === 'hellhound' && !o.tame))) continue;
    if (Math.abs(o.x - e.x) < r && Math.abs(o.z - e.z) < r && Math.abs(o.y - e.y) < 8 && Math.hypot(o.x - e.x, o.z - e.z) < r)
      return { x: o.x, z: o.z };
  }
  return null;
}

/* ---------------------------------- the omen ---------------------------------- */
// one cry before a blood moon: counted for each player in earshot; the one that makes CROW.omenCries brings the omen, once a moon
function _crowOmenCry(e) {
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly || Math.hypot(p.pos.x - e.x, p.pos.y - e.y, p.pos.z - e.z) >= CROW.omenR) continue;
    if (p._omenMoon !== bloodMoonLast) { p._omenMoon = bloodMoonLast; p._omenCries = 0; }
    if (++p._omenCries !== CROW.omenCries) continue;
    withPlayer(p, () => { addPlayerEffect('crowOmen'); feedWarn('The crows cry out over you: a blood moon rises tonight'); });
  }
}
// what a monster's blow is multiplied by for this player
const crowOmenHitMul = (p) => (p.effects || []).some(x => x.id === 'crowOmen') ? 1 - CROW.omenSoft : 1;
// dying with the omen: how many of `count` stay, half of what stacks (_dropStacks, 15-drops.js), an odd one either way
function crowOmenKeep(id, count, dur = null) {
  if (!_dropStacks(id, dur)) return count;
  return Math.floor(count / 2) + (count % 2 && Math.random() < 0.5 ? 1 : 0);
}

/* ---------------------------------- where it lives ----------------------------------
   Once per new chunk: now and then a flock of CROW.flockMin-flockMax on open ground in the cold or the mild land
   (CROW_BIOMES), all with that spot as home; never within CROW.apart of another flock. */
function rollCrows(cx, cz) {
  if (Math.random() >= CROW.chunkChance * ANIMAL_SPAWN_MUL) return;
  const s = _findChunkSpot(cx, cz, CROW_BIOMES);
  if (!s) return;
  for (const e of ENTITIES) if (e.kind === 'crow' && Math.abs(e.x - s.x) < CROW.apart && Math.abs(e.z - s.z) < CROW.apart) return;
  for (let n = _ri(CROW.flockMin, CROW.flockMax); n > 0; n--) {
    const at = birdFindPerch(s.x, s.y, s.z, 3, { leaves: 'never' }) || s;
    summon('crow', at.x, at.y, at.z, { hx: s.x, hz: s.z });
  }
}

/* ---------------------------------- the save: its size, sex and level (its home is the row's) ---------------------------------- */
const crowSave = (e) => ({ sz: e.size, g: e.gender, lv: e.level });
const crowRestore = (s) => summon('crow', s.x, s.y, s.z, { hp: s.hp, size: s.d.sz, gender: s.d.g, level: s.d.lv, hx: s.hx, hz: s.hz });

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in CROW. */
defineMob('crow', {
  name: 'Crow', group: 'animal', step: updateCrow, passive: true,
  hp: CROW.hp, box: [0.2, 0.4], sized: true,
  walk: 1, flee: CROW.flyFast, fleeTime: CROW.fleeTime, fleeTogether: CROW.fleeTogether,
  fallSafe: 99, foot: 'small',                         // it flies: a fall never hurts it
  sounds: { say: { key: 'crowSay' }, hurt: { key: 'crowHurt' }, eat: { key: 'crowEat', gain: 0.8 }, fly: { key: 'crowFly', rate: 1.2 } },
  make: makeCrow, gendered: true, build: () => buildCrow(),
  roll: rollCrows,                                     // its own rule: flocks in the cold and the mild land
  save: crowSave, load: crowRestore,
  loot: (e, pop, first) => first(ITEM.FEATHER, LOOT.crowFeather),
});
