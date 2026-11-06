'use strict';
/* js/entities/parrot.js: the parrot. Its numbers, its model and every pose, how it flies (its own `step` in the creature
   table: updateEntities hands it to updateParrot), taming it with cookies, its stances, sitting it on the left shoulder
   and what it gives there (hiding, danger sense), where it lives, and its save.

   WILD it lives in the Jungle (PARROT_BIOMES), two or three about a home tree. It sits on leaves and logs and every so
   often flies to another perch within PARROT.perchR of its home (birdFindPerch). It is shy: a player standing within
   PARROT.seeR (crouching: PARROT.seeSneakR) makes it fly off to a perch away from them, unless they hold a cookie: then it
   comes down and hovers in front of them, waiting for it. A monster, a tiger or a wild hound within PARROT.dangerR, or a
   blow, sends it off too.

   FLYING, perching (on leaves too) and finding a perch are every bird's (entities/birds.js): its mind (_prThink) gives a
   plan each step and birdStep moves it by PARROT's turn and climb.

   TAMING (parrotE, from tickPlayer). E with a COOKIE in hand on a wild one: it eats it and then flies round you for
   PARROT.circleS seconds (PARROT.circleGentle with Gentle Hand). Then it comes down in front of your face and waits:
   E with an EMPTY hand pets it, and within PARROT.petWindow seconds E with a cookie gives the next. Missed, it flies off
   (-PARROT.missLoss effectiveness) and comes back after PARROT.awayS to circle you again. It needs 1 cookie at the
   lowest level up to PARROT.needMax at level 50. A raw cookie does nothing. A taming is given up after PARROT.forget
   seconds without a cookie, or when the tamer goes further than PARROT.leaveR.

   TAMED. Use: the next stance after PARROT.stanceWait: follow (flies after you, sits down beside you when you stand
   still) · stay (sits where it is). Use with a cookie: it eats it. Sneak + use: onto your LEFT shoulder (parrotPutOn; one
   creature worn at a time: an otter round the neck or a meerkat on the shoulder comes down for it, and the other way
   round). Sneak + use with an empty hand at nothing sets it down. E pets it (entities/taming.js).

   ON THE SHOULDER, two effects (stateEffects, player/effects.js). HIDING: every hostile creature sees you, and every shy
   one flees from you, from less far by parrotHide(p): 20% + 0.2% a level + up to 5% by its taming (35% at the most). The
   sight ranges ask hideSightMul(p): zombies and skeletons (entities/update.js, entities/combat.js), the tiger
   (entities/tiger.js), the polar bear (entities/grazers.js), the meerkat (entities/meerkat.js), fish (entities/fish.js)
   and wild parrots. DANGER SENSE: a zombie or skeleton within PARROT.alertR makes it mimic that monster every few
   seconds, sooner and louder the nearer it is (_prAlertTick, from parrotWorldTick).

   Its model is js/models/parrot.js (made from textures/Entity/Tamable/parrot.json, perched with its wings folded: bones
   body, head, wing_left, wing_right, tail, legs) and its sheet textures/Entity/Tamable/parrot.png; flying is the same
   model tipped forward with the wings out (parrotPose). Its sounds are in Sound/Mobs/Parrot. All numbers are in PARROT. */
const PARROT = {
  hp: 20, boostHp: 15,
  fly: 4.2, flyFast: 7.5,                 // flying somewhere, and fleeing or catching up
  climb: 3.2, turn: 5,                    // the most it rises or sinks a second; how fast it turns (radians a second)
  fleeTime: 6, fleeTogether: 10,          // a blow sends every wild parrot within this many blocks off, for this long
  home: 14, perchR: 10,                   // a wild one keeps this near its home tree; a new perch within this of it
  perchEvery: [8, 22],                    // seconds on a perch before it flies to another
  seeR: 10, seeSneakR: 4,                 // a player standing, and one crouching, seen this far: it flies off
  dangerR: 10,                            // ...a monster, a tiger or a wild hound this near
  // taming
  needMax: 3,                             // cookies for one of level 50; fewer for a lower level, at least one
  circleS: 30, circleGentle: 20,          // seconds it flies round its tamer after a cookie (Gentle Hand)
  circleR: 3.2, circleUp: 2.6,            // the ring: how far out, how high over the tamer's feet
  petWindow: 3,                           // seconds after a pet for the next cookie
  missLoss: 0.05,                         // effectiveness a window missed costs
  awayS: 6, awayR: 14,                    // ...and it flies this far off, for this long, before it circles again
  forget: 300, leaveR: 48,                // a taming given up: this long with no cookie, or its tamer this far off
  // tamed
  stanceWait: 2, followNear: 3, followFar: 7, teleport: 32,
  cookieMeal: 40,                         // what a cookie from the hand fills (out of ENT_HUNGER_MAX)
  // on the shoulder. Hiding: hostile creatures see you and shy ones flee from you this much less far (0.20 = 20%),
  // this much more a level (+10% at level 50), and up to this much more by its taming's effectiveness: 35% at the most
  hideBase: 0.20, hideLvl: 0.002, hideEff: 0.05,
  // danger sense: a zombie or a skeleton this near is mimicked every so often (from the far end to right by you) this loud
  alertR: 24, alertEvery: [7, 2.5], alertGain: [0.15, 1],
  eatS: 1.2,
  // where it lives
  chunkChance: 0.05, flockMin: 2, flockMax: 3, apart: 48,
};
const PARROT_BIOMES = { 'Jungle': 1, 'Deep Jungle': 1, 'Jungle Hills': 0.6 };
const PARROT_STANCES = ['follow', 'stay'];
const PARROT_STANCE_TEXT = { follow: 'follow', stay: 'stay' };
const _prStanceText = (s) => PARROT_STANCE_TEXT[s] || s;
const _prRand = (r) => r[0] + Math.random() * (r[1] - r[0]);

/* ---------------------------------- the model ---------------------------------- */
const _prSrc = () => boxModel('parrot', 'textures/Entity/Tamable/parrot.png');
_prSrc();                                   // its sheet fetched from the start
/* An empty root at once, its bones put in the first frame the model is in (_prDress, buildBoxRig): body at the feet,
   head, wings, tail and legs on it; `beak` at the beak's tip, where a cookie it eats is held. */
function buildParrot() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const m = { root, mat, mats: [mat], tint: new THREE.Color(1, 1, 1), body: null, beak: null, held: null };
  _prDress(m);
  return m;
}
function _prDress(m) {
  if (m.body) return true;
  const src = _prSrc();
  if (!src.ready) return false;
  m.mat.map = src.tex; m.mat.needsUpdate = true;
  const { bones } = buildBoxRig(src, m.root, m.mat);
  m.body = bones.body; m.head = bones.head; m.tail = bones.tail;
  m.wingL = bones.wing_left; m.wingR = bones.wing_right; m.legL = bones.leg_left; m.legR = bones.leg_right;
  m.bodyY = m.body.position.y;
  m.beak = new THREE.Group();
  m.beak.position.set(0, 0.8 / 16, 2.6 / 16);   // the beak's tip (8, 6.8, 4.4), from the head's pivot, turned half round
  m.head.add(m.beak);
  return true;
}
// what it holds in its beak: a cookie it eats, or nothing
function _prHeldModel(m, id) {
  const key = id == null ? null : id;
  if (m.held === key) return;
  m.held = key;
  while (m.beak.children.length) m.beak.remove(m.beak.children[0]);
  if (key == null) return;
  for (const { p, geo, mat, node } of buildDropGeom(key)) {
    const o = node || new THREE.Mesh(geo, mat || MATERIALS[p]);
    o.scale.setScalar(0.16);
    m.beak.add(o);
  }
}
/* Posed once a step, after it has moved. Flying (`flyK` eases in and out) it tips forward by its speed, its head turned
   back up by as much, its wings beating out to the sides (the left wing's bone is on +x once turned, so it opens with +z),
   faster climbing and barely gliding down, its legs tucked back. Perched it sits up, looking about with a bob of the
   head; eating, its head goes down to the cookie in its beak; petted, it sways with its wings half out. */
function parrotPose(e, m, dt, spd) {
  const k = Math.min(1, dt * 8), now = performance.now() / 1000;
  e.flyK = (e.flyK || 0) + ((e.flying ? 1 : 0) - (e.flyK || 0)) * k;
  const f = e.flyK, B = m.body, H = m.head, eat = e._eatT > 0, pet = e._petT > 0;
  const lean = f * (0.2 + 0.9 * Math.min(1, spd / PARROT.flyFast));
  B.position.y = m.bodyY;
  B.rotation.set(lean, 0, 0);
  H.rotation.set(-lean * 0.9, 0, 0);
  e.flap = (e.flap || 0) + dt * (e.flying ? (e.vyF > 0.3 ? 24 : e.vyF < -0.6 ? 9 : 17) : 0);
  const beat = e.flying ? (e.vyF < -0.6 ? 0.2 : 0.8) : 0;
  const spread = f * (1.15 + Math.sin(e.flap) * beat);
  m.wingL.rotation.set(0, 0, spread);
  m.wingR.rotation.set(0, 0, -spread);
  m.legL.rotation.set(f * 0.9, 0, 0);
  m.legR.rotation.set(f * 0.9, 0, 0);
  m.tail.rotation.set(-0.25 * f, 0, 0);
  if (eat) H.rotation.x += 0.45 + Math.sin(now * 14) * 0.12;
  else if (pet) {
    B.rotation.z = Math.sin(now * 6) * 0.12;
    H.rotation.x -= 0.3;
    if (!e.flying) { const w = 0.35 + Math.sin(now * 20) * 0.25; m.wingL.rotation.z = w; m.wingR.rotation.z = -w; }
  } else if (!e.flying) {
    H.rotation.y = Math.sin(now * 0.8 + e.hx) * 0.7;
    H.rotation.x += Math.max(0, Math.sin(now * 2.3 + e.hz)) * 0.15;
  }
  const lookP = e._lookT > 0 && e._lookAt ? e._lookAt : e._watch;
  if (lookP) H.rotation.y = _entHeadTurn(e, lookP, dt, m.root.rotation.y);
  _prHeldModel(m, eat ? ITEM.COOKIE : null);
}

/* ---------------------------------- making one ---------------------------------- */
/* What one parrot is made of: its model and what only a parrot has. summon('parrot', x, y, z, opts) writes the rest
   (entities/mobs.js). `opts`: size, name, hunger, and what its taming got to (tame, taming, eff, ownerId, stance, stats,
   spot). */
function makeParrot(opts) {
  const size = _animalSize(opts);
  const stats = opts.stats && opts.stats.maxHp > 0 ? opts.stats : null;
  return {
    model: buildParrot(), scale: size,
    own: {
      size, stats, name: opts.name || 'Parrot',
      hunger: opts.hunger >= 0 ? Math.min(ENT_HUNGER_MAX, +opts.hunger) : ENT_HUNGER_MAX * (0.5 + Math.random() * 0.5),
      tame: !!opts.tame, taming: opts.taming || null,
      eff: opts.eff > 0 ? +opts.eff : null,
      owner: null, ownerId: opts.ownerId != null ? opts.ownerId : null,
      stance: PARROT_STANCES.includes(opts.stance) ? opts.stance : 'follow',
      stanceNext: null, stanceT: 0,
      spot: opts.spot || null,
      flying: false, flyK: 0, flap: 0, vyF: 0,
      _goal: null, _fleeGoal: null, _perchT: _prRand(PARROT.perchEvery), _airT: 0, _stuckT: 0, _eatT: 0,
      _side: (Math.random() - 0.5) * 1.2,   // where before a player it hovers, turned off straight ahead (a flock spreads out)
      sayT: 4 + Math.random() * 12,
    },
  };
}

/* ---------------------------------- its step ---------------------------------- */
const _PR_TIMERS = ['fleeT', 'flailT', 'turnCd', '_lookT', '_petT', 'atkAnimT', '_eatT'];
function updateParrot(e, dt, tp, i) {
  const m = e.model;
  if (!_prDress(m)) { m.root.position.set(e.x, e.y, e.z); return false; }
  for (const t of _PR_TIMERS) if (e[t] > 0) e[t] -= dt;
  if (e.stanceNext) {                       // a stance pressed for, after its wait
    e.stanceT -= dt;
    if (e.stanceT <= 0) {
      e.stance = e.stanceNext; e.stanceNext = null;
      e.spot = { x: e.x, y: e.y, z: e.z }; e._goal = null;
      _prTell(e, `${e.name}: ${_prStanceText(e.stance)}`);
    }
  }
  if (e.taming) _prTamingTick(e, dt);
  if (!(e.fleeT > 0)) e._fleeGoal = null;
  const plan = _prThink(e, dt, tp);
  const spd = birdStep(e, dt, plan, i, PARROT);      // flying, landing, sitting (entities/birds.js)
  if (spd < 0) return true;
  /* ---- its voice now and then, when someone is near to hear it ---- */
  e.sayT -= dt;
  if (e.sayT <= 0) {
    e.sayT = 6 + Math.random() * 12;
    if (Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) < 16) mobSound(e, 'say', 0.45);
  }
  /* ---- pose ---- */
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  parrotPose(e, m, dt, spd);
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, 0.3);
  return false;
}
const _prTell = (e, msg, warn) => { const p = houndOwner(e); if (p && typeof _houndTell === 'function') _houndTell(p, msg, warn); };

/* ---------------------------------- its mind ----------------------------------
   Returns { to, speed, land, face }: the point it flies to this step (null: it stays sitting, or hovers), how fast,
   whether it lands there, and who it turns to while it hovers. */
function _prThink(e, dt, tp) {
  const plan = { to: null, speed: PARROT.fly, land: false, face: null };
  e._watch = null;
  if (e._eatT > 0) return plan;             // eating where it is, perched or hovering
  if (e.fleeT > 0) return _prFlee(e, plan);
  if (e.tame) return _prOwned(e, dt, plan);
  if (e.taming) return _prBeingTamed(e, dt, plan);
  return _prWild(e, dt, plan);
}
// away from what frightened it: a perch out of its reach (or a point in the air), flat out; there, it waits out its fright
function _prFlee(e, plan) {
  if (!e._fleeGoal) {
    const from = e._fleeFrom || { x: e.x - 1, z: e.z };
    let ax = e.x - from.x, az = e.z - from.z;
    const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    const cx = e.x + ax * PARROT.perchR, cz = e.z + az * PARROT.perchR;
    e._fleeGoal = birdFindPerch(cx, e.y + 2, cz, 5, { from }) || { x: cx, y: e.y + 4, z: cz, air: true };
  }
  const g = e._fleeGoal;
  if (g.done) return plan;
  plan.to = g; plan.speed = PARROT.flyFast; plan.land = !g.air;
  return plan;
}
// what makes a wild one fly off: a player it sees (hideSightMul), a monster, a tiger or a wild hound near; null if nothing.
// A player with a cookie in hand is watched instead (e._watch)
function _prThreat(e) {
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly || Math.abs(p.pos.y - e.y) > 10) continue;
    if (e.taming && houndOwner(e) === p) continue;
    const d = Math.hypot(p.pos.x - e.x, p.pos.z - e.z);
    if (_prHeldBy(p) === ITEM.COOKIE) { if (d < PARROT.seeR) e._watch = p; continue; }
    if (d < (p.sneaking ? PARROT.seeSneakR : PARROT.seeR) * hideSightMul(p)) return { x: p.pos.x, z: p.pos.z };
  }
  const r = PARROT.dangerR;
  for (const o of ENTITIES) {
    if (o === e || !(isNightMob(o) || o.kind === 'tiger' || (o.kind === 'hellhound' && !o.tame))) continue;
    if (Math.abs(o.x - e.x) < r && Math.abs(o.z - e.z) < r && Math.abs(o.y - e.y) < 8 && Math.hypot(o.x - e.x, o.z - e.z) < r)
      return { x: o.x, z: o.z };
  }
  return null;
}
const _prHeldBy = (p) => (typeof withPlayer === 'function' ? withPlayer(p, () => slotId(HOTBAR[hotbarSel])) : slotId(HOTBAR[hotbarSel]));
/* A wild one about its home tree: sitting a while, then off to another perch near home; away from what it sees. */
function _prWild(e, dt, plan) {
  const threat = _prThreat(e);
  if (threat) {
    e.fleeT = PARROT.fleeTime; e._fleeFrom = threat; e._fleeGoal = null; e._goal = null;
    mobSound(e, 'say', 0.5);
    return _prFlee(e, plan);
  }
  if (e._watch) {                           // a player near with a cookie: it comes down and hovers before them, waiting
    const p = e._watch, a = p.yaw + e._side;
    plan.to = { x: p.pos.x - Math.sin(a) * 1.8, y: p.pos.y + 1.2, z: p.pos.z - Math.cos(a) * 1.8 };
    plan.face = p; e._goal = null;
    return plan;
  }
  if (e._goal && e._goal.done) e._goal = null;
  if (!e.flying && !e._goal) {
    e._perchT -= dt;
    if (e._perchT > 0) return plan;
  }
  if (!e._goal)
    e._goal = birdFindPerch(e.hx, e.y, e.hz, PARROT.perchR)
      || { x: e.hx + (Math.random() - 0.5) * 6, y: e.y + 2 + Math.random() * 2, z: e.hz + (Math.random() - 0.5) * 6, air: true };
  plan.to = e._goal; plan.land = !e._goal.air;
  return plan;
}

/* ---------------------------------- taming: cookies, given with E ---------------------------------- */
// cookies it takes: by its level, 1 up to PARROT.needMax at level 50
const parrotNeed = (e) => Math.max(1, Math.ceil((e.level || 1) / ENT_LEVEL_MAX * PARROT.needMax));
const parrotEff = (e) => e.taming ? Math.max(0.1, Math.min(1, 1 - (e.taming.lost || 0))) : (e.eff > 0 ? e.eff : 1);
const _prCircleS = (t) => t.gh ? PARROT.circleGentle : PARROT.circleS;
/* From tickPlayer: E on a parrot that is not tame. A wild one takes a cookie (the first of its taming); one being tamed
   is petted with an empty hand once it has come down to you, and takes the next cookie in the window after. True while
   one is under the crosshair and E is about it, so E is the parrot's and not the bushes'. */
function parrotE(held) {
  const fresh = held && !player._prEDown;
  player._prEDown = !!held;
  if (!held || player.riding || player._heldFish) return false;
  const e = pickEntity(ENT_INTERACT_REACH);
  if (!e || e.kind !== 'parrot' || e.tame) return false;
  const slot = HOTBAR[hotbarSel], id = slotId(slot), t = e.taming;
  if (!t && id !== ITEM.COOKIE && id !== ITEM.RAW_COOKIE) return false;   // a wild one: E is its own only with a cookie in hand
  if (!fresh) return true;
  if (id === ITEM.RAW_COOKIE) { toast('A parrot does not take raw dough: bake the cookie first'); return true; }
  const owner = houndOwner(e);
  if (t && owner && owner !== player) { toast(`${e.name} is being tamed by someone else`); return true; }
  if (!t) {
    if (e.fleeT > 0) return true;
    const gh = typeof hasSkill === 'function' && hasSkill('gentleHand') ? 1 : 0;   // Gentle Hand: a shorter wait
    e.taming = { n: 0, lost: 0, gh, phase: 'circle', t: 0, idle: 0, ang: null, away: null };
    e.owner = player; e.ownerId = player.profileId || null;
    e._goal = null; e._watch = null;
    _prGiveCookie(e, slot);
    return true;
  }
  if (t.phase === 'circle') { toast(`Not yet: it flies round you ${Math.ceil(Math.max(0, t.t))} s more`); return true; }
  if (t.phase === 'away') { toast('It flew off: it comes back to circle you again'); return true; }
  if (t.phase === 'wait') {
    if (slot) { toast('Pet it first: E with an empty hand'); return true; }
    t.phase = 'window'; t.t = PARROT.petWindow;
    e._petT = 1.2; e._lookAt = player; e._lookT = 2;
    if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 0.4, e.z, 3);
    mobSound(e, 'say', 0.6);
    handPickSwing = true;
    toast(`Now a cookie: E with a cookie in hand within ${PARROT.petWindow} s`);
    return true;
  }
  if (id === ITEM.COOKIE) _prGiveCookie(e, slot);   // the window after a pet
  return true;
}
function _prGiveCookie(e, slot) {
  const t = e.taming;
  if (!player.canFly) { slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null; saveHotbar(); buildHotbar(); updateHotbar(); }
  t.n++; t.idle = 0;
  e._eatT = PARROT.eatS; e._lookAt = player; e._lookT = PARROT.eatS;
  mobSound(e, 'eat', 0.7);
  if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 0.4, e.z, 2);
  handPickSwing = true;
  const need = parrotNeed(e);
  if (t.n >= need) { _prTameDone(e); return; }
  t.phase = 'circle'; t.t = _prCircleS(t); t.ang = null;
  toast(`Taming the parrot: ${t.n}/${need} cookies · it flies round you for ${t.t} s, then pet it (E, empty hand) and give the next within ${PARROT.petWindow} s`);
}
/* Each step of one being tamed: the clocks (they wait while it eats), the phase it is in running out, a taming left too
   long or a tamer gone too far (given up). Phases: 'circle' round the tamer -> 'wait' in front of them to be petted ->
   'window' for the next cookie after a pet; a missed window -> 'away' -> 'circle' again. */
function _prTamingTick(e, dt) {
  const t = e.taming, p = houndOwner(e);
  t.idle += dt;
  const giveUp = (why) => {
    _prTell(e, why, true);
    e.taming = null; e.owner = null; e.ownerId = null; e._goal = null; e.hx = e.x; e.hz = e.z;
  };
  if (t.idle > PARROT.forget) return giveUp('The parrot lost interest: its taming is given up');
  if (p && p.spawned && !p.dead && Math.hypot(p.pos.x - e.x, p.pos.z - e.z) > PARROT.leaveR) return giveUp('You left the parrot behind: its taming is given up');
  if (e._eatT > 0 || t.phase === 'wait') return;
  t.t -= dt;
  if (t.t > 0) return;
  if (t.phase === 'circle') {
    t.phase = 'wait'; t.t = 0;
    mobSound(e, 'say', 0.7);
    _prTell(e, `The parrot comes down to you: pet it (E with an empty hand), then give it a cookie within ${PARROT.petWindow} s`);
  } else if (t.phase === 'window') {           // no cookie in time
    t.lost += PARROT.missLoss; t.phase = 'away'; t.t = PARROT.awayS; t.away = null;
    mobSound(e, 'hurt', 0.4);
    _prTell(e, `No cookie in time: the parrot flew off. -${Math.round(PARROT.missLoss * 100)}% effectiveness (${Math.round(parrotEff(e) * 100)}%); it comes back to circle you again`, true);
  } else if (t.phase === 'away') { t.phase = 'circle'; t.t = _prCircleS(t); t.ang = null; }
}
/* One being tamed: round its tamer in a ring PARROT.circleR out and PARROT.circleUp over their feet, then hovering in
   front of their face to be petted; after a miss off PARROT.awayR from them. Its tamer away: it lives as a wild one. */
function _prBeingTamed(e, dt, plan) {
  const t = e.taming, p = houndOwner(e);
  if (!p || p.dead || !p.spawned) return _prWild(e, dt, plan);
  e._lookAt = p; e._lookT = 0.3;
  if (t.phase === 'away') {
    if (!t.away) {
      let ax = e.x - p.pos.x, az = e.z - p.pos.z;
      const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      t.away = { x: p.pos.x + ax * PARROT.awayR, y: p.pos.y + 5, z: p.pos.z + az * PARROT.awayR, air: true };
    }
    plan.to = t.away; plan.speed = PARROT.flyFast;
    return plan;
  }
  if (t.phase === 'circle') {
    if (t.ang == null) t.ang = Math.atan2(e.x - p.pos.x, e.z - p.pos.z);
    t.ang += dt * PARROT.fly * 0.85 / PARROT.circleR;
    const a = t.ang + 0.5;                    // a point a little ahead on the ring: it flies round, never across
    plan.to = { x: p.pos.x + Math.sin(a) * PARROT.circleR, y: p.pos.y + PARROT.circleUp + Math.sin(t.ang * 2) * 0.35,
                z: p.pos.z + Math.cos(a) * PARROT.circleR };
    return plan;
  }
  // waiting to be petted, and the window after: in front of the tamer's face, turned to them
  plan.to = { x: p.pos.x - Math.sin(p.yaw) * 1.7, y: p.pos.y + 1.2, z: p.pos.z - Math.cos(p.yaw) * 1.7 };
  plan.face = p;
  return plan;
}
const PARROT_NAME_TP = { label: 'parrot', statLine: (e) => parrotStatLine(e) };
function _prTameDone(e) {
  const eff = parrotEff(e);
  e.tame = true; e.taming = null; e.eff = +eff.toFixed(2);
  e.stance = 'follow'; e.stanceNext = null; e.spot = null; e._goal = null;
  e.stats = { maxHp: Math.round(PARROT.hp + PARROT.boostHp * eff) };
  e.hp = e.stats.maxHp;
  playSound('chestOpen', { gain: 0.6, rate: 1.7, pos: { x: e.x, y: e.y + 0.5, z: e.z } });
  if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 0.5, e.z);
  toast(`tamed the parrot! effectiveness ${Math.round(eff * 100)}%`);
  addXP(XP_TAME + XP_TAME_PER_LEVEL * (e.level | 0), 'taming');
  if (typeof openNameDialog === 'function') openNameDialog(e, PARROT_NAME_TP);
}

/* ---------------------------------- one of somebody's ----------------------------------
   'stay': down on a perch where it is and sitting there. 'follow': over its owner's left shoulder while they move or
   are further than PARROT.followNear; once they stand still, down on a perch beside them, watching them, until they
   are PARROT.followFar off. */
function _prOwned(e, dt, plan) {
  const owner = houndOwner(e);
  if (e.stance === 'stay' || !owner || owner.dead || !owner.spawned) {
    if (!e.flying) return plan;
    if (!e._goal || (e._goal.air && e._goal.done))
      e._goal = birdFindPerch(e.x, e.y, e.z, 3) || { x: e.x, y: e.y, z: e.z, air: true };
    if (!e._goal.done) { plan.to = e._goal; plan.land = !e._goal.air; }
    return plan;
  }
  const dx = owner.pos.x - e.x, dz = owner.pos.z - e.z, dy = owner.pos.y - e.y, d = Math.hypot(dx, dz);
  const moving = (owner._movingH || 0) > 0;
  if (!e.flying) {
    if (d < PARROT.followFar && Math.abs(dy) < 4) { e._watch = owner; return plan; }
    e._goal = null;                          // left behind: up and after them
  }
  if (d > PARROT.followNear || moving || Math.abs(dy) > 3) {
    e._goal = null;
    // over the left shoulder and a little behind (a player looks down -Z: right is (cos yaw, -sin yaw))
    const rx = Math.cos(owner.yaw), rz = -Math.sin(owner.yaw), fx = -Math.sin(owner.yaw), fz = -Math.cos(owner.yaw);
    plan.to = { x: owner.pos.x - rx * 1.3 - fx * 0.9, y: owner.pos.y + 2.2, z: owner.pos.z - rz * 1.3 - fz * 0.9 };
    plan.speed = d > 10 ? PARROT.flyFast : PARROT.fly * 1.2;
    return plan;
  }
  if (!e._goal) e._goal = birdFindPerch(owner.pos.x, owner.pos.y + 1, owner.pos.z, 2.5, { avoid: owner.pos }) || { x: e.x, y: e.y, z: e.z, air: true };
  if (!e._goal.done) { plan.to = e._goal; plan.land = !e._goal.air; }
  return plan;
}

/* ---------------------------------- the right button on one ----------------------------------
   From _doPlace, after the meerkat's. True when the click was the parrot's. */
function tryParrotInteract() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return false;
  if (typeof nameDialogOpen === 'function' && nameDialogOpen()) return false;
  const e = pickEntity(ENT_INTERACT_REACH), slot = HOTBAR[hotbarSel], id = slotId(slot);
  if (!e || e.kind !== 'parrot') {
    // sneak + use with an empty hand, aiming at no creature (nor a clam): the parrot on your shoulder flies off it
    if (player._wornParrot && player.sneaking && !slot && !e && !(act && act.place) && currentRay()?.id !== B.CLAM) {
      parrotTakeOff(player, false);
      return true;
    }
    return false;
  }
  if (!e.tame) {
    // a cookie used on one not tame yet: it is given with E
    if (id === ITEM.COOKIE || id === ITEM.RAW_COOKIE) { if (!(act && act.place)) toast('Give a parrot its cookie with E'); return true; }
    return false;
  }
  if (act && act.place) return true;                  // fresh presses only
  if (houndOwner(e) !== player) { toast(`${e.name} answers to someone else`); return true; }
  // a cookie in hand, not sneaking: it eats it
  if (id === ITEM.COOKIE && !player.sneaking) {
    if (e._eatT > 0) return true;
    if (entHunger(e) >= ENT_HUNGER_MAX - 0.5 && e.hp >= entMaxHp(e)) { toast(`${e.name} is full`); return true; }
    if (!player.canFly) { slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null; saveHotbar(); buildHotbar(); updateHotbar(); }
    e.hunger = Math.min(ENT_HUNGER_MAX, entHunger(e) + PARROT.cookieMeal);
    e.hp = Math.min(entMaxHp(e), e.hp + 5);
    e._eatT = PARROT.eatS;
    mobSound(e, 'eat', 0.7);
    toast(`${e.name} eats the cookie: hunger ${Math.round(e.hunger)}/${ENT_HUNGER_MAX}`);
    return true;
  }
  if (player.sneaking) {
    if (player._wornParrot) toast('You already have a parrot on your shoulder');
    else parrotPutOn(player, e, false);
    return true;
  }
  const now = e.stance, next = PARROT_STANCES[(PARROT_STANCES.indexOf(e.stanceNext || now) + 1) % PARROT_STANCES.length];
  if (next === now) { e.stanceNext = null; toast(`${e.name}: stays on ${_prStanceText(now)}`); }
  else { e.stanceNext = next; e.stanceT = PARROT.stanceWait; toast(`${e.name}: ${_prStanceText(next)} in ${PARROT.stanceWait} s`); }
  return true;
}

/* ---------------------------------- on the shoulder ----------------------------------
   Out of the world onto the player's LEFT shoulder, kept whole, as the meerkat on the right (entities/meerkat.js): one
   creature worn at a time, so an otter or a meerkat worn comes down for it. */
function parrotPutOn(p, e, quiet) {
  const i = ENTITIES.indexOf(e);
  if (i < 0 || p._wornParrot) return false;
  if (p._wornOtter && typeof otterTakeOff === 'function') otterTakeOff(p, false);
  if (p._wornMeerkat && typeof meerkatTakeOff === 'function') meerkatTakeOff(p, false);
  ENTITIES.splice(i, 1);
  scene.remove(e.model.root);
  e._worn = true; e._wearOn = false; e._lerp = null; e.stanceNext = null;
  e._goal = null; e._fleeGoal = null; e.flying = false;
  p._wornParrot = e;
  if (!quiet) {
    mobSound(e, 'say', 0.6);
    const tell = () => feedInfo(`${e.name} sits on your shoulder: creatures notice you from less far, and it calls out zombies and skeletons (sneak + use with an empty hand sends it off)`);
    if (typeof withPlayer === 'function') withPlayer(p, tell); else tell();
  }
  return true;
}
// off the shoulder into the air in front of them (where they fell, dying): it finds its own perch from there
function parrotTakeOff(p, dead) {
  const e = p._wornParrot;
  if (!e) return null;
  p._wornParrot = null; p._prAlert = null;
  e._worn = false;
  let x = p.pos.x, z = p.pos.z;
  const y = p.pos.y + 1.4;
  if (!dead) {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    _useBox(e);
    for (const r of [1.2, 0.8, 0.4]) if (!_entBlocked(p.pos.x + fx * r, y, p.pos.z + fz * r)) { x = p.pos.x + fx * r; z = p.pos.z + fz * r; break; }
    _useBox(null);
  }
  Object.assign(e, { x, y, z, vy: 0, kx: 0, kz: 0, hx: x, hz: z, peakY: null, onGround: false, stuckT: 0, _px: undefined,
                     flying: true, _goal: null, _airT: 0 });
  e.spot = { x, y, z };
  e.yaw = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
  e.model.root.position.set(x, y, z);
  scene.add(e.model.root);
  ENTITIES.push(e);
  mobSound(e, 'fly', 0.5);
  return e;
}
/* HIDING: how much less far creatures notice a player with one on their shoulder (0.25 = 25%), by its level and its
   taming's effectiveness; 0 without. hideSightMul: the multiplier for a sight range, 1 without */
function parrotHide(p) {
  const e = p && p._wornParrot;
  return e ? PARROT.hideBase + PARROT.hideLvl * (e.level || 1) + PARROT.hideEff * (e.eff > 0 ? e.eff : 1) : 0;
}
const hideSightMul = (p) => 1 - parrotHide(p);
/* DANGER SENSE, once a world step for each player: the nearest zombie or skeleton within PARROT.alertR (looked for twice
   a second, kept as p._prAlert { kind, d } for the effects list), mimicked every so often, sooner and louder the nearer
   it is. p._prMimicT: the call being made, for the pose on the shoulder. */
function _prAlertTick(p, dt) {
  if (p._prMimicT > 0) p._prMimicT -= dt;
  if (!p._wornParrot || p.dead || !p.spawned) { p._prAlert = null; return; }
  p._prScanT = (p._prScanT || 0) - dt;
  if (p._prScanT <= 0) {
    p._prScanT = 0.5;
    let best = null, bd = PARROT.alertR;
    for (const o of ENTITIES) {
      if ((o.kind !== 'zombie' && o.kind !== 'skeleton') || !(o.hp > 0)) continue;
      const dx = o.x - p.pos.x, dz = o.z - p.pos.z;
      if (Math.abs(dx) > bd || Math.abs(dz) > bd) continue;
      const d = Math.hypot(dx, dz, o.y - p.pos.y);
      if (d < bd) { bd = d; best = o; }
    }
    p._prAlert = best ? { kind: best.kind, d: bd } : null;
  }
  p._prAlertT = (p._prAlertT || 0) - dt;
  const a = p._prAlert;
  if (!a || p._prAlertT > 0) return;
  const near = Math.max(0, 1 - a.d / PARROT.alertR), [s0, s1] = PARROT.alertEvery, [g0, g1] = PARROT.alertGain;
  p._prAlertT = s0 + (s1 - s0) * near;
  p._prMimicT = 0.8;
  playSound(a.kind === 'skeleton' ? 'parrotMimicSkeleton' : 'parrotMimicZombie',
            { gain: g0 + (g1 - g0) * near, rate: 0.95 + Math.random() * 0.1, pitch: true, pos: { x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z } });
}
/* On the body (applyCameraView, player/body.js): sitting on the left shoulder looking about; calling out a monster, its
   head up and bobbing, its wings flicking. */
function poseParrotShoulder(m, p, dt) {
  const e = p._wornParrot;
  if (!e) { if (m.parrot) m.parrot.root.visible = false; return; }
  if (!m.parrot || m.parrot._for !== e) {
    if (m.parrot) m.torso.remove(m.parrot.root);
    m.parrot = buildParrot();
    m.parrot._for = e;
    m.torso.add(m.parrot.root);
  }
  const s = m.parrot;
  if (!_prDress(s)) return;
  const t = performance.now() / 1000, cry = p._prMimicT > 0;
  s.root.visible = true;
  s.root.position.set(5 * PX, 12 * PX, 0.5 * PX);
  s.root.rotation.set(0, 0, 0);
  s.root.scale.setScalar(0.75 * (e.size || 1));
  s.body.position.y = s.bodyY + Math.sin(t * 1.5) * 0.08 * PX;
  s.body.rotation.set(0, 0, Math.sin(t * 0.8) * 0.04);
  if (cry) s.head.rotation.set(-0.35 + Math.sin(t * 18) * 0.2, 0, 0);
  else s.head.rotation.set(Math.max(0, Math.sin(t * 2.1)) * 0.12, Math.sin(t * 0.55) * 1.0, 0);
  const w = cry ? 0.25 + Math.sin(t * 22) * 0.2 : 0;
  s.wingL.rotation.set(0, 0, w); s.wingR.rotation.set(0, 0, -w);
  s.legL.rotation.set(0, 0, 0); s.legR.rotation.set(0, 0, 0);
  s.tail.rotation.set(0, 0, 0);
  _prHeldModel(s, null);
  shadeTinted(s, p.pos.x, p.pos.y + 1.4, p.pos.z, false, 0);
}

/* ---------------------------------- once a world step ----------------------------------
   For every parrot of somebody's: one saved on its owner's shoulder goes back on as they come; one told to follow that
   is left PARROT.teleport behind (or whose chunk went out of range) comes to its owner, in the air. And each player's
   danger sense. */
function parrotWorldTick(dt) {
  for (const e of [...ENTITIES]) {
    if (e.kind !== 'parrot' || !e.tame) continue;
    const owner = houndOwner(e);
    if (!owner || !owner.spawned || owner.dead) continue;
    if (e._wearOn) { if (!owner._wornParrot && !owner._wornOtter && !owner._wornMeerkat) parrotPutOn(owner, e, true); e._wearOn = false; continue; }
    if (e.stance !== 'follow') continue;
    const dx = owner.pos.x - e.x, dz = owner.pos.z - e.z;
    if (e.active !== false && dx * dx + dz * dz < PARROT.teleport * PARROT.teleport && Math.abs(owner.pos.y - e.y) < 24) continue;
    _prComeTo(e, owner);
  }
  for (const p of PLAYERS) _prAlertTick(p, dt);
}
// into the air a little over its owner, beside them; nowhere open (they are in a tunnel), it tries next step
function _prComeTo(e, owner) {
  _useBox(e);
  let spot = null;
  for (let k = 0; k < 12 && !spot; k++) {
    const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 1.5;
    const x = owner.pos.x + Math.sin(a) * r, z = owner.pos.z + Math.cos(a) * r;
    for (const up of [2.2, 1.4, 0.6]) if (!_entBlocked(x, owner.pos.y + up, z)) { spot = { x, y: owner.pos.y + up, z }; break; }
  }
  _useBox(null);
  if (!spot) return false;
  Object.assign(e, { x: spot.x, y: spot.y, z: spot.z, vy: 0, kx: 0, kz: 0, peakY: null, stuckT: 0, _px: undefined, _lerp: null,
                     flying: true, onGround: false, _goal: null });
  e.model.root.position.set(e.x, e.y, e.z);
  return true;
}

/* ---------------------------------- where it lives ----------------------------------
   Once per new chunk: now and then a flock of PARROT.flockMin-flockMax on a jungle tree (PARROT_BIOMES), never within
   PARROT.apart of another flock. */
function rollParrots(cx, cz) {
  if (Math.random() >= PARROT.chunkChance * ANIMAL_SPAWN_MUL) return;
  const s = _findChunkSpot(cx, cz, PARROT_BIOMES);
  if (!s) return;
  for (const e of ENTITIES) if (e.kind === 'parrot' && Math.abs(e.x - s.x) < PARROT.apart && Math.abs(e.z - s.z) < PARROT.apart) return;
  const home = birdFindPerch(s.x, s.y + 8, s.z, 4) || s;
  for (let n = _ri(PARROT.flockMin, PARROT.flockMax), k = 0; k < n; k++) {
    const at = k === 0 ? home : (birdFindPerch(home.x, home.y, home.z, 3) || home);
    summon('parrot', at.x, at.y, at.z, { hx: home.x, hz: home.z });
  }
}

/* ---------------------------------- what the crosshair says ---------------------------------- */
const parrotStatLine = (e) => `health ${Math.ceil(e.hp)}/${entMaxHp(e)} · hunger ${Math.round(entHunger(e))}/${ENT_HUNGER_MAX}` +
  ` · effectiveness ${Math.round(parrotEff(e) * 100)}%`;
function _prPhaseText(e) {
  const t = e.taming;
  return t.phase === 'circle' ? `circling you · ${Math.ceil(Math.max(0, t.t))} s`
       : t.phase === 'wait' ? 'waiting to be petted'
       : t.phase === 'window' ? `a cookie now · ${Math.ceil(Math.max(0, t.t))} s`
       : 'flew off · coming back';
}
function parrotSubText(e) {
  if (e.taming) return `taming ${e.taming.n}/${parrotNeed(e)} · ${_prPhaseText(e)}`;
  if (e.tame) return e.stanceNext ? _prStanceText(e.stance) + ' > ' + _prStanceText(e.stanceNext) : _prStanceText(e.stance);
  return '';
}
function parrotPrompt(e) {
  const head = entityHead(e), dim = (s) => `<span style="opacity:.8;font-size:.9em">${s}</span>`;
  const need = parrotNeed(e);
  if (e.taming) {
    const t = e.taming;
    const what = t.phase === 'wait' ? 'pet it: <b>E</b> with an empty hand'
               : t.phase === 'window' ? `give a cookie: <b>E</b> with a cookie · ${Math.ceil(Math.max(0, t.t))} s`
               : _prPhaseText(e);
    return `${head}<br>${dim(`taming ${t.n}/${need} cookie${need > 1 ? 's' : ''} · effectiveness ${Math.round(parrotEff(e) * 100)}% · ${what}`)}`;
  }
  if (!e.tame) return `${head}<br>${dim(`(tamable: ${need} cookie${need > 1 ? 's' : ''} with <b>E</b>; between them it circles you, then pet it and give the next within ${PARROT.petWindow} s)`)}`;
  const st = e.stanceNext ? `${_prStanceText(e.stance)} > ${_prStanceText(e.stanceNext)} (${Math.max(0, e.stanceT).toFixed(1)} s)` : _prStanceText(e.stance);
  const pet = typeof _petHint === 'function' ? ' · ' + _petHint() : '';
  const feed = slotId(HOTBAR[hotbarSel]) === ITEM.COOKIE ? '<br>' + (entHunger(e) >= ENT_HUNGER_MAX - 0.5 && e.hp >= entMaxHp(e)
    ? `${_esc(e.name)} is full` : '(<b>use</b>) feed the cookie') : '';
  return `${head}<br>${dim(parrotStatLine(e))}<br>${dim(`stance: <b>${st}</b> (use) · on your shoulder (sneak + use)${pet}`)}${feed}`;
}

/* ---------------------------------- the save ---------------------------------- */
function parrotSave(e) {
  const t = e.taming;
  return {
    sz: e.size, g: e.gender, lv: e.level, h: +entHunger(e).toFixed(1),
    t: e.tame ? 1 : 0, o: e.ownerId || null, sc: e.stance, ef: e.eff || 0, st: e.tame && e.stats ? e.stats : null,
    sp: e.spot ? [+e.spot.x.toFixed(2), +e.spot.y.toFixed(2), +e.spot.z.toFixed(2)] : null,
    tm: t ? [t.n | 0, +(t.lost || 0).toFixed(3), t.gh ? 1 : 0] : null,   // a taming starts its circling again on load
    wn: e._worn ? 1 : 0,                                                  // on its owner's shoulder
  };
}
function parrotRestore(s) {
  const d = s.d;
  const st = d.st && d.st.maxHp > 0 ? { maxHp: +d.st.maxHp } : null;
  const tm = !d.t && Array.isArray(d.tm) && d.tm.length >= 3
    ? { n: d.tm[0] | 0, lost: +d.tm[1] || 0, gh: d.tm[2] ? 1 : 0, phase: 'circle', t: d.tm[2] ? PARROT.circleGentle : PARROT.circleS,
        idle: 0, ang: null, away: null } : null;
  const sp = Array.isArray(d.sp) && d.sp.length === 3 ? { x: +d.sp[0], y: +d.sp[1], z: +d.sp[2] } : null;
  const e = summon('parrot', s.x, s.y, s.z, {
    hp: s.hp, size: d.sz, gender: d.g, level: d.lv, hunger: d.h,
    tame: !!d.t, ownerId: d.o, stance: d.sc, eff: d.ef, stats: st, taming: tm, spot: sp,
    name: s.name, hx: s.hx, hz: s.hz,
  });
  if (d.wn && d.t) e._wearOn = true;                // parrotWorldTick puts it back on their shoulder
  return e;
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in PARROT. */
defineMob('parrot', {
  name: 'Parrot', group: 'animal', step: updateParrot, passive: true, spared: true, hungerMul: 0.5,
  maxHp: (e) => (e.stats && e.stats.maxHp) || PARROT.hp,   // raised by its taming
  box: [0.25, 0.55], sized: true,
  walk: 1, flee: PARROT.flyFast, fleeTime: PARROT.fleeTime, fleeTogether: PARROT.fleeTogether,
  fallSafe: 99, foot: 'small',                         // it flies: a fall never hurts it
  sounds: { say: { key: 'parrotSay' }, hurt: { key: 'parrotHurt' }, eat: { key: 'parrotEat', gain: 0.8 }, fly: { key: 'parrotFly', gain: 0.7 } },
  make: makeParrot, gendered: true, build: () => buildParrot(),
  roll: rollParrots,                                   // its own rule: flocks on jungle trees
  save: parrotSave, load: parrotRestore,
  prompt: parrotPrompt, subText: parrotSubText,
  loot: (e, pop, first) => first(ITEM.FEATHER, LOOT.parrotFeather),
});
