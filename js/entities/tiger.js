'use strict';
/* js/entities/tiger.js: the tiger, the Jungle's lone hunter. Its numbers, its model and poses, its own step (`step` in
   the creature table: updateEntities hands it to updateTiger), feeding it raw meat, where it lives and its save.

   WILD, ALONE. One lives about a home in the Jungle (TIGER_BIOMES) and never goes further from it than TIGER.leash: it
   gives up a chase there and walks back, so it keeps to the jungle it was born in. It sees a player within TIGER.seeR
   (TIGER.seeSneakR crouching), stalks low and slow to TIGER.pounceR, then charges and bites. Hungry (hunger under
   TIGER.hungry of the most) it hunts any creature within TIGER.huntR as well: an animal, a monster, a villager, somebody's
   pet (not a fish, an insect, a boss nor another tiger). What it kills drops what it would for a player (_entDropLoot), and
   it eats a piece of the raw meat there (TIGER_MEAT); it eats raw meat lying near when hungry too.

   RAW MEAT IN YOUR HAND (main hand, TIGER_MEAT): it does not strike. It comes up close (TIGER.baitNear) and watches you.
   The use button with it on the tiger feeds it (tryTigerInteract), once in TIGER.feedCd for each tiger: it eats, leaves
   the one who fed it alone for TIGER.peace (`tigerBond` on them, its icon on the effect bar), and gives them `tigerFury`
   (attack speed, TIGER.furyS). Too soon, it will not take it, but meat in hand still keeps it from striking.

   A BLOW sets it on whoever struck (a player: e._struckBy and aggroT from damageEntity, entities/combat.js; a creature:
   e._hurtBy, `fightsBack` in the creature table): fed or not, meat in hand or not, it fights back until aggroT runs out
   or the chase passes its leash.

   Its model is js/models/tiger.js (made from textures/Entity/Animals/tiger.json: bones body, head, four legs, tail), its
   sheet textures/Entity/Animals/tiger.png, its sounds Sound/Mobs/Tiger. All numbers are in TIGER. */
const TIGER = {
  hp: 180, dmg: 30, dmgMob: 40, atkCd: 1.1, reach: 0.6,   // its bite on a player, on a creature; the gap it bites across
  scale: 1.25,                            // the model is built smaller than a tiger is
  walk: 1.3, prowl: 2.0, run: 6.4,        // strolling, stalking low, charging (a sprinting player is 6.9)
  seeR: 18, seeSneakR: 7,                 // a player seen standing, and crouching
  pounceR: 7,                             // from this near a stalk turns into a charge
  huntR: 16, hungry: 0.6, meal: 55,       // creatures hunted within this when its hunger is under this share; a meat fills
  meatR: 8,                               // raw meat lying this near is eaten when hungry, or after a kill
  leash: 40,                              // the most it goes from home: past it, a chase is given up and it walks back
  aggro: 25,                              // seconds a blow keeps it after whoever struck it
  baitNear: 2.6,                          // meat in hand: it comes this near, and watches
  feedCd: 600, peace: 120, furyS: 20,     // a meal taken from the hand every 10 min; 2 min of peace; 20 s of fury
  chunkChance: 0.015, apart: 192,         // a new jungle chunk's chance of one; never this near another
};
const TIGER_BIOMES = { 'Jungle': 1, 'Deep Jungle': 1, 'Jungle Hills': 0.6 };
// the raw meat it eats and takes from the hand
const TIGER_MEAT = new Set([ITEM.MUTTON, ITEM.BEEF, ITEM.PORK]);

/* ---------------------------------- its effects on the one who fed it ---------------------------------- */
EFFECT_DEFS.tigerFury = { name: 'Tiger fury', time: TIGER.furyS, good: true, atkSpeed: 0.3, img: 'Animals/tiger_fury.png',
  desc: 'Attack speed +30%: a tiger took meat from your hand.' };
EFFECT_DEFS.tigerBond = { name: 'Tiger bond', time: TIGER.peace, good: true, img: 'Animals/tiger_bond.png',
  desc: 'The tiger you fed leaves you alone while it lasts, unless you strike it.' };

/* ---------------------------------- the model ---------------------------------- */
const _tgSrc = () => boxModel('tiger', 'textures/Entity/Animals/tiger.png');
_tgSrc();                                   // its sheet fetched from the start
// an empty root at once, its bones put in the first frame the model is in (_tgDress, buildBoxRig)
function buildTiger() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const m = { root, mat, mats: [mat], tint: new THREE.Color(1, 1, 1), body: null };
  _tgDress(m);
  return m;
}
function _tgDress(m) {
  if (m.body) return true;
  const src = _tgSrc();
  if (!src.ready) return false;
  m.mat.map = src.tex; m.mat.needsUpdate = true;
  const { bones } = buildBoxRig(src, m.root, m.mat);
  m.body = bones.body; m.head = bones.head; m.tail = bones.tail;
  m.legs = [bones.leg_front_left, bones.leg_front_right, bones.leg_back_left, bones.leg_back_right];
  m.bodyY = m.body.position.y;
  return true;
}
/* Posed once a step. Walking, the legs trot in pairs across; charging, they reach further and the body bounds; stalking,
   it creeps low, head down and forward; a bite throws the head and the forepaws at what it bites; eating, the head goes
   down to the meat and the jaw works (entEatStep). The tail swings slowly, faster when it hunts. */
const TG_MOUTH = [0, -1.5, 8.5];            // the muzzle's tip in the head's 16ths (turned half round)
function tigerPose(e, m, dt, spd) {
  const k = Math.min(1, dt * 6), now = performance.now() / 1000, st = e.state;
  const low = st === 'stalk' ? 1 : 0, eat = e._eatT > 0;
  e.lowK = (e.lowK || 0) + (low - (e.lowK || 0)) * k;
  const run = Math.min(1, spd / TIGER.run), s = Math.sin(e.walk), amp = 0.35 + 0.55 * run;
  const [fl, fr, bl, br] = m.legs;
  fl.rotation.set(s * amp, 0, 0); br.rotation.set(s * amp, 0, 0);
  fr.rotation.set(-s * amp, 0, 0); bl.rotation.set(-s * amp, 0, 0);
  const B = m.body, H = m.head;
  B.position.y = m.bodyY + Math.abs(Math.cos(e.walk)) * 1.2 * PX * run - 2.2 * PX * e.lowK;
  B.rotation.set(0, 0, 0);
  H.rotation.set(0.25 * e.lowK, 0, 0);
  for (const l of m.legs) l.rotation.x -= 0.25 * e.lowK;          // the legs fold under it as it creeps
  if (e.atkAnimT > 0) {                                           // the bite: head and forepaws thrown forward
    const a = Math.sin(Math.min(1, 1 - e.atkAnimT / 0.35) * Math.PI);
    H.rotation.x += 0.45 * a; fl.rotation.x = fr.rotation.x = -0.9 * a;
  }
  if (eat) H.rotation.x += 0.75 + Math.sin(now * 11) * 0.08;      // down at the meat, chewing
  else if (st === 'watch' || st === 'idle' || st === 'stalk') H.rotation.y = _entHeadTurn(e, e._lookP || null, dt, m.root.rotation.y);
  else e.headYaw = (e.headYaw || 0) * (1 - k);
  m.tail.rotation.set(-0.1 * e.lowK, Math.sin(now * (st === 'stalk' || st === 'run' ? 6 : 1.6)) * 0.35, 0);
  entEatStep(e, dt, H, TG_MOUTH, 0.8);
}

/* ---------------------------------- making one ---------------------------------- */
// what one tiger is made of: summon('tiger', x, y, z, opts) writes the rest (entities/mobs.js). `opts`: size, hunger, fedCd
function makeTiger(opts) {
  const size = _animalSize(opts);
  return {
    model: buildTiger(), scale: TIGER.scale * size,
    own: {
      size,
      hunger: opts.hunger >= 0 ? Math.min(ENT_HUNGER_MAX, +opts.hunger) : ENT_HUNGER_MAX * (0.4 + Math.random() * 0.6),
      _fedCd: opts.fedCd > 0 ? +opts.fedCd : 0,   // seconds until it takes meat from a hand again
      _peace: new Map(),                          // whom it leaves alone, and for how long: player key -> seconds
      _target: null, _seekT: 0, _chaseT: 0, _mealT: 0, sayT: 6 + Math.random() * 14,
    },
  };
}

/* ---------------------------------- its step ---------------------------------- */
const _TG_TIMERS = ['turnCd', 'aggroT', 'atkAnimT', '_seekT', '_mealT'];
const _tgKey = (p) => p.profileId || 'seat' + PLAYERS.indexOf(p);
const _tgHeld = (p) => (typeof withPlayer === 'function' ? withPlayer(p, () => slotId(HOTBAR[hotbarSel])) : slotId(HOTBAR[hotbarSel]));
const tigerBaited = (p) => TIGER_MEAT.has(_tgHeld(p));
// a player it may go for: in the world, in survival, alive
const _tgLive = (p) => !!p && p.spawned && !p.dead && !p.canFly && PLAYERS.includes(p);
// a creature it hunts
const _tgPrey = (o, e) => o !== e && o.hp > 0 && !o._killedByMob && o.active !== false && o.kind !== 'tiger' && !o.boss
  && !isFish(o) && mobOf(o).body !== 'insect' && mobOf(o).xp !== 0 && !(o.riseT > 0);
function updateTiger(e, dt, tp, i) {
  const m = e.model;
  if (!_tgDress(m)) { m.root.position.set(e.x, e.y, e.z); return false; }
  for (const t of _TG_TIMERS) if (e[t] > 0) e[t] -= dt;
  if (e._fedCd > 0) e._fedCd -= dt;
  for (const [k, left] of e._peace) { if (left - dt <= 0) e._peace.delete(k); else e._peace.set(k, left - dt); }
  const inWater = isWaterVal(getBlock(Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z)));
  const plan = _tgThink(e, dt);
  /* ---- across ---- */
  let moved = 0;
  const stunned = (e.kx !== 0 || e.kz !== 0) && !(e.aggroT > 0);
  e.wantMove = plan.speed > 0 && !stunned && !(e._eatT > 0);
  if (e.wantMove) {
    const sp = plan.speed * boxDragMul(e.x, e.y, e.z, _boxR, _boxH);
    const sx = Math.sin(e.yaw) * sp * dt, sz = Math.cos(e.yaw) * sp * dt;
    const bad = (nx, nz) => _entBlocked(nx, e.y, nz) || (!inWater && !plan.bold && _entHazard(nx, e.y, nz));
    let blocked = false;
    if (!bad(e.x + sx, e.z)) { e.x += sx; moved += Math.abs(sx); } else blocked = true;
    if (!bad(e.x, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else blocked = true;
    if (blocked) {
      const climbY = _stepUpTarget(e, e.x + sx, e.z + sz);
      if (e.onGround && e.jumpCd <= 0 && climbY !== null) { e.vy = ENT_JUMP; e.jumpCd = 0.5; e.onGround = false; }
      else if (e.turnCd <= 0 && (!plan.aimed || (e._bumpT = (e._bumpT || 0) + dt) > 1.5)) {
        e.yaw += (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random()); e.turnCd = 0.4;
        if (plan.aimed) { e._bumpT = 0; e.wanderT = 0; }
      }
    } else e._bumpT = 0;
  }
  if (e.kx || e.kz) {                       // a blow's knockback, spent
    const kdx = e.kx * dt, kdz = e.kz * dt;
    if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
    if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
    const kk = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= kk; e.kz *= kk;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
  }
  /* ---- up and down: in water it swims up, on land gravity ---- */
  const wasGround = e.onGround;
  if (inWater) { e.vy = 1.4; e.y += e.vy * dt; e.onGround = false; e.peakY = null; if (_entBlocked(e.x, e.y, e.z)) e.y -= e.vy * dt; }
  else {
    if (e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z)) { e.y = Math.floor(e.y - 0.02) + 1; e.vy = 0; e.onGround = true; }
    else {
      const ny = _entFallStep(e, dt);
      if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; } e.vy = 0; }
      else { e.y = ny; e.onGround = false; }
    }
    if (_entFallDamage(e, i, wasGround, false)) return true;
  }
  if (e.hazCd > 0) e.hazCd -= dt;
  const feetId = getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255;
  if (feetId === B.LAVA) e.fireT = Math.max(e.fireT || 0, LAVA_FIRE_S);
  if (e.hazCd <= 0 && (feetId === B.LAVA || feetId === B.CACTUS)) {
    e.hazCd = ENT_HAZARD_CD; e.hurtT = 0.25; e.hp -= feetId === B.LAVA ? ENT_LAVA_DMG : ENT_CACTUS_DMG;
    if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return true; }
  }
  /* ---- its voice now and then, when someone is near to hear it; a growl as it charges ---- */
  e.sayT -= dt;
  if (e.sayT <= 0) {
    e.sayT = 9 + Math.random() * 18;
    if (Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) < 24) mobSound(e, 'say', 0.55);
  }
  /* ---- pose ---- */
  const spd = moved / Math.max(dt, 1e-4);
  entityStepSound(e, dt, spd);
  e.walk += (spd > 0.05 ? Math.min(spd, 8) * 2.2 + 1.5 : 0) * dt;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  tigerPose(e, m, dt, spd);
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, 0.6);
  return false;
}

/* ---------------------------------- its mind ----------------------------------
   Returns { speed, aimed, bold }. What it is after, looked for again every 0.4 s: whoever struck it, while aggroT lasts and
   the chase stays inside its leash; a player in sight (not one it is leaving alone, nor one with meat in hand: that one
   it comes up to and watches); raw meat lying near when hungry or after a kill; a creature when hungry; else it roams
   about its home. e.state: 'idle', 'walk', 'stalk', 'run', 'watch', 'eat'. */
function _tgThink(e, dt) {
  const plan = { speed: 0, aimed: false, bold: false };
  e._lookP = null;
  if (e._eatT > 0) { e.state = 'eat'; return plan; }
  const fromHome = Math.hypot(e.x - e.hx, e.z - e.hz);
  if (e._seekT <= 0) { e._seekT = 0.4; _tgChoose(e, fromHome); }
  let t = e._target;
  if (t && fromHome > TIGER.leash + (t.angry ? 16 : 0)) { e._target = t = null; e._homeward = true; }
  if (e._homeward) {                        // past its leash: home, at a trot, before anything else
    if (fromHome < TIGER.leash * 0.5) e._homeward = false;
    else { _tgGo(e, plan, e.hx, e.hz, TIGER.prowl * 1.4); return plan; }
  }
  if (!t) return _tgRoam(e, dt, plan, fromHome);
  if (t.meat) return _tgEatDrop(e, plan, t.meat);
  const p = t.player, c = t.creature;
  const tx = p ? p.pos.x : c.x, tz = p ? p.pos.z : c.z, ty = p ? p.pos.y : c.y;
  const d = Math.hypot(tx - e.x, tz - e.z);
  if (t.bait) {                             // meat in their hand: up close, watching, no bite
    e._lookP = p;
    if (d > TIGER.baitNear) _tgGo(e, plan, tx, tz, TIGER.prowl, TIGER.baitNear);
    else { e.yaw = Math.atan2(tx - e.x, tz - e.z); e.state = 'watch'; }
    return plan;
  }
  // a stalk to a player, a charge at the end of it (at once when it is angry); a creature run down when near
  const charge = t.angry || d < (p ? TIGER.pounceR : 10);
  e._lookP = p || null;
  const reach = entR(e) + (p ? p.R : entR(c)) + TIGER.reach;
  if (d > reach - 0.15) _tgGo(e, plan, tx, tz, charge ? TIGER.run : TIGER.prowl, reach - 0.15);
  else e.yaw = Math.atan2(tx - e.x, tz - e.z);
  plan.bold = charge;
  e.state = charge ? 'run' : 'stalk';
  if (d <= reach && Math.abs(ty - e.y) < 2 && e.atkCd <= 0) _tgBite(e, t, tx - e.x, tz - e.z, d);
  return plan;
}
// what it goes for now (see _tgThink)
function _tgChoose(e, fromHome) {
  const keep = e._target;
  // whoever struck it
  const sb = e._struckBy;
  if (e.aggroT > 0 && _tgLive(sb)) { e._target = { player: sb, angry: true }; return; }
  const hb = e._hurtBy;
  if (hb && _tgPrey(hb, e) && ENTITIES.includes(hb) && Math.hypot(hb.x - e.x, hb.z - e.z) < 24) { e._target = { creature: hb, angry: true }; return; }
  e._hurtBy = null;
  // a player in sight
  let best = null, bd = Infinity;
  for (const p of PLAYERS) {
    if (!_tgLive(p) || e._peace.has(_tgKey(p))) continue;
    const d = Math.hypot(p.pos.x - e.x, p.pos.z - e.z);
    if (d > (p.sneaking ? TIGER.seeSneakR : TIGER.seeR) || Math.abs(p.pos.y - e.y) > 8 || d >= bd) continue;
    bd = d; best = p;
  }
  if (best) { e._target = { player: best, bait: tigerBaited(best) }; return; }
  // raw meat lying near, when hungry or after a kill
  const hungry = entHunger(e) < ENT_HUNGER_MAX * TIGER.hungry;
  if (hungry || e._mealT > 0) {
    let md = TIGER.meatR, meat = null;
    for (const d of DROPS) {
      if (!d.grounded || !TIGER_MEAT.has(d.id)) continue;
      const g = d.group.position;
      if (Math.abs(g.y - e.y) > 3) continue;
      const dd = Math.hypot(g.x - e.x, g.z - e.z);
      if (dd < md) { md = dd; meat = d; }
    }
    if (meat) { e._target = { meat }; return; }
  }
  // a creature, when hungry, inside its leash
  if (hungry) {
    if (keep && keep.creature && _tgPrey(keep.creature, e) && ENTITIES.includes(keep.creature)) return;
    let prey = null, pd = TIGER.huntR;
    for (const o of ENTITIES) {
      if (!_tgPrey(o, e) || Math.abs(o.y - e.y) > 6) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d < pd && Math.hypot(o.x - e.hx, o.z - e.hz) < TIGER.leash) { pd = d; prey = o; }
    }
    if (prey) { e._target = { creature: prey }; return; }
  }
  e._target = null;
}
// to a place: turned to it and going, true once there
function _tgGo(e, plan, x, z, speed, near = 0.9) {
  const dx = x - e.x, dz = z - e.z;
  if (Math.hypot(dx, dz) <= near) return true;
  e.yaw = Math.atan2(dx, dz); plan.speed = speed; plan.aimed = true;
  e.state = speed > TIGER.prowl * 1.5 ? 'run' : speed > TIGER.walk * 1.2 ? 'stalk' : 'walk';
  return false;
}
// about its home: a stroll, a stop, a look round; turned back toward home once half its leash out
function _tgRoam(e, dt, plan, fromHome) {
  e.wanderT = (e.wanderT || 0) - dt;
  if (e.wanderT <= 0) {
    e.wanderT = 3 + Math.random() * 6;
    e._stroll = Math.random() < 0.55;
    e.yaw = fromHome > TIGER.leash * 0.5 ? Math.atan2(e.hx - e.x, e.hz - e.z) + (Math.random() - 0.5) * 0.8
                                         : e.yaw + (Math.random() - 0.5) * 2.2;
  }
  if (e._stroll) { plan.speed = TIGER.walk; e.state = 'walk'; } else e.state = 'idle';
  return plan;
}
// raw meat lying there: to it, and a piece eaten
function _tgEatDrop(e, plan, d) {
  if (!DROPS.includes(d)) { e._target = null; return plan; }
  const g = d.group.position;
  if (!_tgGo(e, plan, g.x, g.z, TIGER.prowl, 0.9)) return plan;
  const id = d.id;
  if ((d.count || 1) > 1) _dropSetCount(d, d.count - 1);
  else { const i = DROPS.indexOf(d); if (i >= 0) removeDrop(i); }
  _tgEat(e, id);
  e._target = null; e._mealT = 0;
  return plan;
}
function _tgEat(e, id) {
  entEatStart(e, id);
  e.hunger = Math.min(ENT_HUNGER_MAX, entHunger(e) + TIGER.meal);
  e.hp = Math.min(entMaxHp(e), e.hp + 15);
  e.state = 'eat';
}
// its bite on what it is after (dx, dz: from it to that; d: how far)
function _tgBite(e, t, dx, dz, d) {
  e.atkCd = TIGER.atkCd; e.atkAnimT = 0.35;
  mobSound(e, 'say', 0.8);
  if (t.player) { _mobStrikePlayer(e, t.player, TIGER.dmg, dx, dz, d); return; }
  const foe = t.creature;
  _mobHitsMob(e, foe, TIGER.dmgMob, dx, dz, d);
  if (foe.hp > 0) return;
  // its kill: what the creature leaves falls (a creature's kill leaves nothing else), and it eats there
  _entDropLoot(foe);
  e._target = null; e._mealT = 10; e._seekT = 0.6;
}

/* ---------------------------------- the right button on one: raw meat from the hand ----------------------------------
   From _doPlace, after the other animals'. True when the click was the tiger's. */
function tryTigerInteract() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return false;
  const e = pickEntity(ENT_INTERACT_REACH);
  if (!e || e.kind !== 'tiger') return false;
  const slot = HOTBAR[hotbarSel], id = slotId(slot);
  if (!TIGER_MEAT.has(id)) return false;
  if (act && act.place) return true;                  // fresh presses only
  if (e.aggroT > 0 && e._struckBy === player) { toast('The tiger is too angry to take it'); return true; }
  if (e._eatT > 0) return true;
  if (e._fedCd > 0) { toast(`The tiger will not take meat again for ${Math.ceil(e._fedCd / 60)} min`); return true; }
  if (!player.canFly) { slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null; saveHotbar(); buildHotbar(); updateHotbar(); }
  _tgEat(e, id);
  e._fedCd = TIGER.feedCd;
  // the one who fed it: its fury, and its peace as long as the bond on them says (Lingering may stretch both)
  let peace = TIGER.peace;
  if (!player.canFly) {
    addPlayerEffect('tigerFury'); addPlayerEffect('tigerBond');
    const b = (player.effects || []).find(x => x.id === 'tigerBond');
    if (b) peace = b.left;
  }
  e._peace.set(_tgKey(player), peace);
  if (e._target && e._target.player === player) e._target = null;
  toast(`The tiger takes the ${idName(id).toLowerCase()}: it leaves you alone for ${Math.round(peace / 60)} min`);
  return true;
}

/* ---------------------------------- where it lives ----------------------------------
   Once per new chunk: now and then one tiger on jungle ground (TIGER_BIOMES), never within TIGER.apart of another. */
function rollTigers(cx, cz) {
  if (Math.random() >= TIGER.chunkChance * ANIMAL_SPAWN_MUL) return;
  const s = _findChunkSpot(cx, cz, TIGER_BIOMES);
  if (!s) return;
  for (const e of ENTITIES) if (e.kind === 'tiger' && Math.abs(e.x - s.x) < TIGER.apart && Math.abs(e.z - s.z) < TIGER.apart) return;
  if (_entBlocked(s.x, s.y, s.z) || _entHazard(s.x, s.y, s.z)) return;
  summon('tiger', s.x, s.y, s.z, { hx: s.x, hz: s.z });
}

/* ---------------------------------- what the crosshair says ---------------------------------- */
function tigerPrompt(e) {
  const head = entityHead(e), dim = (s) => `<span style="opacity:.8;font-size:.9em">${s}</span>`;
  const left = e._peace.get(_tgKey(player));
  if (left > 0) return `${head}<br>${dim(`it leaves you alone for ${Math.ceil(left)} s`)}`;
  if (!tigerBaited(player)) return `${head}<br>${dim('a hunter: raw meat in your hand keeps it from striking')}`;
  if (e._fedCd > 0) return `${head}<br>${dim(`it will not take meat again for ${Math.ceil(e._fedCd / 60)} min`)}`;
  return `${head}<br>${dim(`(<b>use</b>) give the ${_esc(idName(slotId(HOTBAR[hotbarSel])).toLowerCase())}: ` +
    `${Math.round(TIGER.peace / 60)} min of peace and Tiger fury`)}`;
}

/* ---------------------------------- the save ---------------------------------- */
const tigerSave = (e) => ({ sz: e.size, g: e.gender, lv: e.level, h: +entHunger(e).toFixed(1), fc: Math.max(0, Math.round(e._fedCd || 0)) });
const tigerRestore = (s) => summon('tiger', s.x, s.y, s.z, { hp: s.hp, size: s.d.sz, gender: s.d.g, level: s.d.lv, hunger: s.d.h,
  fedCd: s.d.fc, hx: s.hx, hz: s.hz });

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in TIGER. */
defineMob('tiger', {
  name: 'Tiger', group: 'animal', step: updateTiger, fightsBack: true, aggro: TIGER.aggro,
  hp: TIGER.hp, box: [0.55, 1.4], sized: true,
  walk: TIGER.walk, fallSafe: 8, foot: 'paw',
  // its voice played slower (deeper) and its hurt cry faster (higher): `rate` pitches it (mobSound, entities/mobs.js)
  sounds: { say: { key: 'tigerSay', rate: 0.75 }, hurt: { key: 'tigerHurt', rate: 1.3 } },
  make: makeTiger, gendered: true, build: () => buildTiger(),
  roll: rollTigers,                                    // its own rule: one alone, in the Jungle
  save: tigerSave, load: tigerRestore,
  prompt: tigerPrompt,
  // its striped pelt and a bone or two
  loot: (e, pop, first) => { first(ITEM.FUR, LOOT.tigerFur); pop(ITEM.BONE, rollLoot(LOOT.tigerBone)); },
});
