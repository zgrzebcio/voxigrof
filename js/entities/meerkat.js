'use strict';
/* js/entities/meerkat.js: the meerkat. Its numbers, its model and every pose, its own step (`step` in the creature table:
   updateEntities hands it to updateMeerkat), taming it with chitin, its stances, sitting it on the shoulder, the things a
   wild one hides under sand, where it lives, and its save.

   WILD it lives in a band of 2-4 at a burrow (hx hz) on the edge of the desert, where the sand meets other land. It
   stands up on its hind legs keeping watch, forages head down, runs on all fours. It eats termites it finds (hungry, it
   goes after one within MEERKAT.huntR). Now and then it fetches something lying near its burrow (a drop, or what a
   tumbleweed caught, entities/tumbleweed.js), carries it home in its mouth and buries it: a sand layer put on the ground
   with the thing under it (MEERKAT_STASH; breaking that sand gives it back, meerkatStashChanged from setBlock). It is
   shy: a player standing within MEERKAT.seeR is seen (a crouching one only within MEERKAT.seeSneakR, and one crouching
   with chitin in hand is watched, never run from), a monster or a wild hound within MEERKAT.dangerR, and it runs.

   TAMING. Crouched, chitin in hand, E on it (meerkatGiveChitin, from tickPlayer): it takes the plate and eats it. It needs
   1 plate at the lowest level up to MEERKAT.needMax at level 50 (MEERKAT.needMaxGentle with Gentle Hand), one every
   MEERKAT.feedCd seconds. After each it runs off MEERKAT.awayR and comes back to the spot it was first fed on
   MEERKAT.away seconds later: the tamer only has to stay crouched there. Standing up while it is within MEERKAT.scareR
   scares it: it runs, and the taming loses MEERKAT.scareLoss of effectiveness, the most when the tamer stood right by
   it. Effectiveness gives a tamed one more health (MEERKAT.boostHp). A taming left MEERKAT.forget seconds is given up.

   TAMED. Use: the next stance after MEERKAT.stanceWait: follow · stay (standing up) · lie down · find items. 'find'
   works from where the stance took hold (`spot`): it fetches anything lying within MEERKAT.findR of it, or searches a
   tumbleweed, brings what it got to the spot and leaves it there, then rests MEERKAT.findRest. Use with food in hand
   (MEERKAT_FOOD: chitin, any meat raw or cooked): it sits up and eats it. Sneak + use: it goes up
   on your shoulder (meerkatPutOn; one creature worn at a time, an otter round the neck comes down for it and the other
   way round): items are picked up and plants foraged from further, 10% + 0.3% a level + up to 5% by its taming
   (meerkatReachBonus; wornReachMul, read by 15-drops.js and player/foraging.js; a line of the effects list,
   player/effects.js). Sneak + use with an empty hand at nothing sets it down. E pets it.

   Its model is js/models/meerkat.js (made from textures/Entity/Tamable/meerkat.json: it stands up, bones body, head,
   arms, legs, tail) and its sheet textures/Entity/Tamable/meerkat.png; on all fours is the same model with its body
   tipped forward (meerkatPose). Its sounds are in Sound/Mobs/Meerkat. All numbers are in MEERKAT. */
const MEERKAT = {
  hp: 30, boostHp: 20,
  walk: 1.6, run: 5.6,                    // strolling, and running for it
  fleeTime: 5, fleeTogether: 16,          // a blow sends every wild meerkat within this many blocks off, for this long
  home: 9,                                // a wild one keeps this near its burrow
  seeR: 14, seeSneakR: 3,                 // a player standing, and one crouching, seen this far: it runs
  dangerR: 12,                            // ...a monster or a wild hound this near
  // taming
  needMax: 5, needMaxGentle: 4,           // chitin plates for one of level 50; fewer for a lower level, at least one
  feedCd: 20,                             // seconds between two plates
  away: [10, 15], awayR: 14,              // after a plate it runs this far off and is back at its spot after this long
  scareR: 12,                             // the tamer standing up while it is this near scares it
  scareLoss: [0.03, 0.10],                // ...costing this much effectiveness: the more the nearer the tamer stood
  scareRun: 10,                           // seconds it stays off after a scare before coming back
  forget: 300,                            // seconds without a plate: the taming is given up
  // tamed
  stanceWait: 2, followNear: 2.5, followFar: 6, teleport: 30,
  findR: 16, findRest: 5, findGiveUp: 25, // 'find items': how far from its spot, the rest between finds, giving one up
  // on the shoulder: item pickup and foraging reach this much further (0.10 = 10%), this much more a level (+15% at level
  // 50), and up to this much more by its taming's effectiveness: 30% at the most
  reachBase: 0.10, reachLvl: 0.003, reachEff: 0.05,
  // wild
  huntR: 10, hungry: 0.6, meal: 30,       // termites within this when its hunger is under this share; what one fills
  stashEvery: [40, 90], stashR: 12,       // a look for something to bury every so often, within this of its burrow
  eatS: 1.6, digS: 1.4,
  // where it lives
  chunkChance: 0.06, packMin: 2, packMax: 4, apart: 72, edgeR: 22,
};
const MEERKAT_DESERT = new Set(['Desert', 'Desert Hills', 'Red Sand', 'Red Sand Hills']);
const MEERKAT_BIOMES = { 'Desert': 1, 'Desert Hills': 1, 'Red Sand': 1, 'Red Sand Hills': 1 };
// what a tamed one eats from the hand (the use button), and how much each fills (out of ENT_HUNGER_MAX): chitin, and any meat
// raw or cooked; no fish
const MEERKAT_FOOD = { [ITEM.CHITIN_PLATE]: 80, [ITEM.MUTTON]: 50, [ITEM.COOKED_MUTTON]: 50, [ITEM.BEEF]: 50, [ITEM.COOKED_BEEF]: 50,
                       [ITEM.PORK]: 50, [ITEM.COOKED_PORK]: 50 };
const MEERKAT_STANCES = ['follow', 'stay', 'lie', 'find'];
const MEERKAT_STANCE_TEXT = { follow: 'follow', stay: 'stay (standing up)', lie: 'lie down', find: 'find items' };
const _mkStanceText = (s) => MEERKAT_STANCE_TEXT[s] || s;
const _mkRand = (r) => r[0] + Math.random() * (r[1] - r[0]);

/* ---------------------------------- the model ---------------------------------- */
const _mkSrc = () => boxModel('meerkat', 'textures/Entity/Tamable/meerkat.png');
_mkSrc();                                   // its sheet fetched from the start
/* An empty root at once, its bones put in the first frame the model is in (_mkDress, buildBoxRig): body at the hips,
   head, arms, legs and tail on it; `mouth` at the snout's tip, where what it carries is held. */
function buildMeerkat() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const m = { root, mat, mats: [mat], tint: new THREE.Color(1, 1, 1), body: null, mouth: null, held: null };
  _mkDress(m);
  return m;
}
function _mkDress(m) {
  if (m.body) return true;
  const src = _mkSrc();
  if (!src.ready) return false;
  m.mat.map = src.tex; m.mat.needsUpdate = true;
  const { bones } = buildBoxRig(src, m.root, m.mat);
  m.body = bones.body; m.head = bones.head; m.tail = bones.tail;
  m.armL = bones.arm_left; m.armR = bones.arm_right; m.legL = bones.leg_left; m.legR = bones.leg_right;
  m.bodyY = m.body.position.y;
  m.mouth = new THREE.Group();
  m.mouth.position.set(0, 0.6 / 16, 2.9 / 16);   // the snout's tip (8, 8.6, 5.1), from the head's pivot, turned half round
  m.head.add(m.mouth);
  return true;
}
// what it holds at its mouth: an item id (a plate it eats, a thing it carries), or nothing
function _mkHeldModel(m, id) {
  const key = id == null ? null : id;
  if (m.held === key) return;
  m.held = key;
  while (m.mouth.children.length) m.mouth.remove(m.mouth.children[0]);
  if (key == null) return;
  for (const { p, geo, mat, node } of buildDropGeom(key)) {
    const o = node || new THREE.Mesh(geo, mat || MATERIALS[p]);
    o.scale.setScalar(0.2);
    m.mouth.add(o);
  }
}
/* Posed once a step, after it has moved. Standing up (its own shape: the model stands) it keeps watch, its head turning;
   on all fours (`quadK`) the body tips forward at the hips and the head, arms and legs turn back by as much, so the arms
   are front legs; running, they reach in turn; digging, the head goes down and the paws scrape fast. It eats sitting
   up with the food in its paws at its mouth, lies flat, and for a pat sways, its head up. */
const MK_TIP = 1.3;                          // how far forward the body tips on all fours
function meerkatPose(e, m, dt, spd) {
  const k = Math.min(1, dt * 6), now = performance.now() / 1000, st = e.state;
  const eat = e._eatT > 0, dig = e._digT > 0, pet = e._petT > 0;
  const upright = eat || pet || st === 'stand' || st === 'watch' || st === 'sit';
  const quad = !upright && (spd > 0.15 || st === 'forage' || dig || st === 'walk' || st === 'run') ? 1 : 0;
  const lie = !upright && st === 'lie' ? 1 : 0;
  e.quadK = (e.quadK || 0) + ((quad || lie) - (e.quadK || 0)) * k;
  e.lieK = (e.lieK || 0) + (lie - (e.lieK || 0)) * k;
  const q = e.quadK, B = m.body, H = m.head, p = e.walk;
  B.position.y = m.bodyY; B.rotation.set(MK_TIP * q + 0.27 * e.lieK, 0, 0);
  H.rotation.set(-MK_TIP * q - 0.27 * e.lieK, 0, 0);
  // the tail turned back by as much as the body tips, so it stays out behind: flat lying down, a little up on all fours
  m.tail.rotation.set(-MK_TIP * q - 0.27 * e.lieK + 0.3 * q * (1 - e.lieK), 0, 0);
  const run = Math.min(1, spd / MEERKAT.run), s = Math.sin(p);
  const arm = -MK_TIP * q, leg = -MK_TIP * q;
  m.armL.rotation.set(arm + s * 0.8 * run, 0, 0);
  m.armR.rotation.set(arm - s * 0.8 * run, 0, 0);
  m.legL.rotation.set(leg - s * 0.8 * run, 0, 0);
  m.legR.rotation.set(leg + s * 0.8 * run, 0, 0);
  B.position.y += Math.abs(s) * 1.0 * PX * run;
  if (e.lieK > 0.01) {                      // flat on its belly: the paws out in front, the legs out behind
    const l = e.lieK;
    B.position.y -= 1.2 * PX * l;
    m.armL.rotation.x += -0.8 * l; m.armR.rotation.x += -0.8 * l;
    m.legL.rotation.x += 0.9 * l; m.legR.rotation.x += 0.9 * l;
  }
  if (dig) {                                // head down, the front paws scraping fast
    H.rotation.x += 0.5;
    m.armL.rotation.x += Math.sin(now * 22) * 0.6; m.armR.rotation.x -= Math.sin(now * 22) * 0.6;
  } else if (st === 'forage' && q > 0.5) {  // nosing about the ground
    H.rotation.x += 0.35 + Math.sin(now * 3.1 + e.hx) * 0.2;
    if (Math.sin(now * 1.7 + e.hz) > 0.4) m.armR.rotation.x += Math.sin(now * 16) * 0.4;
  }
  if (eat) {                                // sitting up, the food at its mouth in both paws, chewing
    m.armL.rotation.x = m.armR.rotation.x = -1.15 + Math.sin(now * 12) * 0.06;
    H.rotation.x += 0.2 + Math.sin(now * 12) * 0.1;
  } else if (pet) {                         // swaying, its head up into the hand
    B.rotation.z = Math.sin(now * 5) * 0.14;
    H.rotation.x -= 0.35;
    m.tail.rotation.y = Math.sin(now * 9) * 0.4;
  } else if (upright) {                     // keeping watch: the head turning about, the paws in at its chest
    m.armL.rotation.x = m.armR.rotation.x = -0.25;
    const look = e._watch ? null : Math.sin(now * 0.6 + e.hx) * 0.8;
    if (look != null) H.rotation.y = look;
  }
  const lookP = e._lookT > 0 && e._lookAt ? e._lookAt : e._watch;
  if (lookP) H.rotation.y = _entHeadTurn(e, lookP, dt, m.root.rotation.y);
  _mkHeldModel(m, eat ? e._eatItem : e._carry ? e._carry.id : null);
}

/* ---------------------------------- making one ---------------------------------- */
/* What one meerkat is made of: its model and what only a meerkat has. summon('meerkat', x, y, z, opts) writes the rest
   (entities/mobs.js). `opts`: size, name, hunger, and what its taming got to (tame, taming, eff, ownerId, stance, stats,
   spot), what it carries (carry). */
function makeMeerkat(opts) {
  const size = _animalSize(opts);
  const stats = opts.stats && opts.stats.maxHp > 0 ? opts.stats : null;
  return {
    model: buildMeerkat(), scale: size,
    own: {
      size, stats, name: opts.name || 'Meerkat',
      hunger: opts.hunger >= 0 ? Math.min(ENT_HUNGER_MAX, +opts.hunger) : ENT_HUNGER_MAX * (0.5 + Math.random() * 0.5),
      tame: !!opts.tame, taming: opts.taming || null,
      eff: opts.eff > 0 ? +opts.eff : null,
      owner: null, ownerId: opts.ownerId != null ? opts.ownerId : null,
      stance: MEERKAT_STANCES.includes(opts.stance) ? opts.stance : 'follow',
      stanceNext: null, stanceT: 0,
      spot: opts.spot || null,
      _carry: opts.carry || null, _target: null, _findT: 0, _eatT: 0, _eatItem: null, _digT: 0,
      _stashT: _mkRand(MEERKAT.stashEvery), sayT: 4 + Math.random() * 12,
    },
  };
}

/* ---------------------------------- its step ---------------------------------- */
const _MK_TIMERS = ['fleeT', 'flailT', 'turnCd', '_lookT', '_petT', 'atkAnimT', '_eatT', '_digT'];
const _mkHazard = (x, y, z) => {
  const id = getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) & 255;
  if (id === B.LAVA || id === B.CACTUS || isWaterVal(getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))) return true;
  for (let d = 1; d <= 3; d++) if (CORE.solidVal(getBlock(Math.floor(x), Math.floor(y) - d, Math.floor(z)))) return false;
  return true;                               // more than three blocks down: it does not walk off
};
function updateMeerkat(e, dt, tp, i) {
  const m = e.model;
  if (!_mkDress(m)) { m.root.position.set(e.x, e.y, e.z); return false; }
  for (const t of _MK_TIMERS) if (e[t] > 0) e[t] -= dt;
  if (e.stanceNext) {                       // a stance pressed for, after its wait
    e.stanceT -= dt;
    if (e.stanceT <= 0) {
      e.stance = e.stanceNext; e.stanceNext = null;
      e.spot = { x: e.x, y: e.y, z: e.z }; e._target = null; e._findT = 0; e._following = false;
      _mkTell(e, `${e.name}: ${_mkStanceText(e.stance)}`);
    }
  }
  if (e.taming) _mkTamingTick(e, dt);
  if (e._digT <= 0 && e._digDone) { e._digDone = false; _mkBury(e); }   // the hole dug: the thing goes in
  const inWater = isWaterVal(getBlock(Math.floor(e.x), Math.floor(e.y + 0.2), Math.floor(e.z)));
  const plan = _mkThink(e, dt, tp, inWater);
  /* ---- across ---- */
  let moved = 0;
  const still = e._eatT > 0 || e._digT > 0;
  const stunned = (e.kx !== 0 || e.kz !== 0) && !(e.fleeT > 0);
  e.wantMove = plan.speed > 0 && !stunned && !still;
  if (e.wantMove) {
    const sp = plan.speed * boxDragMul(e.x, e.y, e.z, _boxR, _boxH);
    const sx = Math.sin(e.yaw) * sp * dt, sz = Math.cos(e.yaw) * sp * dt;
    const bad = (nx, nz) => _entBlocked(nx, e.y, nz) || (!inWater && !plan.bold && _mkHazard(nx, e.y, nz));
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
  /* ---- up and down: in water it paddles up, on land gravity ---- */
  const wasGround = e.onGround;
  if (inWater) { e.vy = 1.2; e.y += e.vy * dt; e.onGround = false; e.peakY = null; if (_entBlocked(e.x, e.y, e.z)) e.y -= e.vy * dt; }
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
    if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _mkDropCarry(e); _removeEntity(i); return true; }
  }
  /* ---- its voice now and then, when someone is near to hear it ---- */
  e.sayT -= dt;
  if (e.sayT <= 0) {
    e.sayT = 7 + Math.random() * 14;
    if (Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) < 16) mobSound(e, 'say', 0.4);
  }
  /* ---- pose ---- */
  const spd = moved / Math.max(dt, 1e-4);
  entityStepSound(e, dt, spd);
  e.walk += (spd > 0.05 ? Math.min(spd, 7) * 2.6 + 2 : 0) * dt;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  meerkatPose(e, m, dt, spd);
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, 0.3);
  return false;
}
const _mkTell = (e, msg, warn) => { const p = houndOwner(e); if (p && typeof _houndTell === 'function') _houndTell(p, msg, warn); };

/* ---------------------------------- its mind ----------------------------------
   Returns { speed, aimed, bold }: how fast it goes this step (its heading set), whether it is going AT something (it does
   not turn aside at a wall), whether it may go where it would not stroll (off a ledge, running). e.state names what it is
   doing, for the pose: 'stand' (up on its hind legs), 'watch', 'forage', 'walk', 'run', 'lie', 'sit'... */
function _mkThink(e, dt, tp, inWater) {
  const plan = { speed: 0, aimed: false, bold: false };
  e._watch = null;
  if (e.fleeT > 0) {                        // away from what frightened it, flat out
    const from = e._fleeFrom || { x: tp.pos.x, z: tp.pos.z };
    if (e.turnCd <= 0) { e.yaw = Math.atan2(e.x - from.x, e.z - from.z) + (Math.random() - 0.5) * 0.6; e.turnCd = 0.35; }
    plan.speed = MEERKAT.run; plan.bold = true; e.state = 'run';
    return plan;
  }
  if (e._eatT > 0) { e.state = 'sit'; return plan; }
  if (e._digT > 0) { e.state = 'forage'; return plan; }
  if (e.tame) return _mkOwned(e, dt, plan);
  if (e.taming) return _mkBeingTamed(e, dt, plan);
  return _mkWild(e, dt, tp, plan);
}
// to a place: turned to it and going, true once there
function _mkGo(e, plan, x, z, speed, near = 0.9) {
  const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
  if (d <= near) return true;
  e.yaw = Math.atan2(dx, dz); plan.speed = speed; plan.aimed = true;
  e.state = speed > MEERKAT.walk * 1.5 ? 'run' : 'walk';
  return false;
}
// what frightens a wild one: a player it sees, a monster or a wild hound near; null when nothing does
function _mkThreat(e) {
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    const d = Math.hypot(p.pos.x - e.x, p.pos.z - e.z);
    if (e.taming && houndOwner(e) === p) continue;   // its tamer frightens it only by standing up (_mkTamingTick)
    if (p.sneaking) {
      if (d < MEERKAT.seeSneakR && _mkHeldBy(p) !== ITEM.CHITIN_PLATE) return { x: p.pos.x, z: p.pos.z };
      if (d < MEERKAT.seeR) e._watch = p;            // seen crouching: it stands and watches
    } else if (d < MEERKAT.seeR) return { x: p.pos.x, z: p.pos.z };
  }
  for (const o of ENTITIES) {
    if (o === e || !(isNightMob(o) || (o.kind === 'hellhound' && !o.tame) || o.kind === 'polar_bear')) continue;
    if (Math.abs(o.x - e.x) < MEERKAT.dangerR && Math.abs(o.z - e.z) < MEERKAT.dangerR && Math.hypot(o.x - e.x, o.z - e.z) < MEERKAT.dangerR)
      return { x: o.x, z: o.z };
  }
  return null;
}
const _mkHeldBy = (p) => (typeof withPlayer === 'function' ? withPlayer(p, () => slotId(HOTBAR[hotbarSel])) : slotId(HOTBAR[hotbarSel]));
function _mkScare(e, from) {
  e.fleeT = MEERKAT.fleeTime; e._fleeFrom = from;
  _mkDropCarry(e);
}
/* A wild one about its burrow: watching, foraging, wandering back toward home past MEERKAT.home; after termites when
   hungry, after something to bury now and then (_mkFetch), and running from what it sees (_mkThreat). */
function _mkWild(e, dt, tp, plan) {
  const threat = _mkThreat(e);
  if (threat) { _mkScare(e, threat); return _mkThink(e, 0, tp, false); }
  if (e._watch) { e.state = 'watch'; return plan; }
  if (e._carry) {                                   // home with it, then a hole for it
    if (_mkGo(e, plan, e.hx, e.hz, MEERKAT.walk * 1.8, 1.5)) _mkDigStart(e);
    return plan;
  }
  // hungry: the nearest termite within reach, caught and eaten
  if (entHunger(e) < ENT_HUNGER_MAX * MEERKAT.hungry) {
    const t = _mkTermiteNear(e);
    if (t) {
      if (_mkGo(e, plan, t.x, t.z, MEERKAT.run * 0.8, entR(t) + 0.45)) {
        t.hp = 0; t._killedByMob = true;          // taken away at its next turn (updateEntities)
        e.hunger = Math.min(ENT_HUNGER_MAX, entHunger(e) + MEERKAT.meal);
        e._eatT = MEERKAT.eatS; e._eatItem = null; mobSound(e, 'eat', 0.5);
      }
      return plan;
    }
  }
  // now and then something lying near the burrow, to fetch and bury
  e._stashT -= dt;
  if (e._target || e._stashT <= 0) {
    if (!e._target) { e._stashT = _mkRand(MEERKAT.stashEvery); e._target = _mkFindThing(e.hx, e.y, e.hz, MEERKAT.stashR); e._chaseT = 0; }
    if (e._target) { _mkFetch(e, dt, plan); return plan; }
  }
  const hdx = e.hx - e.x, hdz = e.hz - e.z, homeD = Math.hypot(hdx, hdz);
  e.wanderT -= dt;
  if (e.wanderT <= 0) {
    e.wanderT = 2 + Math.random() * 5;
    const r = Math.random();
    e.state = homeD > MEERKAT.home ? 'home' : r < 0.4 ? 'stand' : r < 0.65 ? 'forage' : 'walk';
    if (e.state === 'walk') e.yaw = Math.random() * Math.PI * 2;
  }
  if (e.state === 'home') { if (_mkGo(e, plan, e.hx, e.hz, MEERKAT.walk * 1.5, 2)) e.wanderT = 0; }
  else if (e.state === 'walk') plan.speed = MEERKAT.walk;
  return plan;
}
// the nearest termite within MEERKAT.huntR, or null
function _mkTermiteNear(e) {
  let best = null, bd = MEERKAT.huntR;
  for (const t of ENTITIES) {
    if (mobOf(t).body !== 'insect' || !(t.hp > 0) || t._killedByMob || Math.abs(t.y - e.y) > 4) continue;
    const d = Math.hypot(t.x - e.x, t.z - e.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
/* ---- fetching: a drop lying on the ground (one that came to rest a while ago), or a tumbleweed searched. What lies within
   MK_HERE of the middle it looks from is already where it is brought to (the spot, the burrow): never fetched ---- */
const MK_HERE = 2.5;
function _mkFindThing(cx, cy, cz, r) {
  let best = null, bd = r;
  for (const d of DROPS) {
    if (!d.grounded || d.age < 3 || d._mkClaim) continue;
    const g = d.group.position;
    if (Math.abs(g.y - cy) > 6) continue;
    const dd = Math.hypot(g.x - cx, g.z - cz);
    if (dd > MK_HERE && dd < bd) { bd = dd; best = { drop: d }; }
  }
  for (const t of ENTITIES) {
    if (t.kind !== 'tumbleweed' || !(t.hp > 0) || Math.abs(t.y - cy) > 6) continue;
    const dd = Math.hypot(t.x - cx, t.z - cz);
    if (dd < bd) { bd = dd; best = { weed: t }; }
  }
  if (best && best.drop) best.drop._mkClaim = true;
  return best;
}
// still there to be had?
const _mkTargetGood = (t) => t && (t.drop ? DROPS.includes(t.drop) : ENTITIES.includes(t.weed) && t.weed.hp > 0);
function _mkLetGo(e) { if (e._target && e._target.drop) e._target.drop._mkClaim = false; e._target = null; }
// after the target; reached, it is in its mouth (a drop taken whole; a tumbleweed searched, falling apart)
function _mkFetch(e, dt, plan) {
  const t = e._target;
  if (!_mkTargetGood(t)) { _mkLetGo(e); return; }
  e._chaseT = (e._chaseT || 0) + dt;
  if (e._chaseT > MEERKAT.findGiveUp) { _mkLetGo(e); e._findT = 3; return; }
  const p = t.drop ? t.drop.group.position : t.weed;
  if (!_mkGo(e, plan, p.x, p.z, MEERKAT.run * 0.7, 0.8)) return;
  if (t.drop) {
    const i = DROPS.indexOf(t.drop), d = t.drop;
    e._carry = { id: d.id, count: d.count || 1, dur: d.dur ?? null, meta: d.meta ?? null };
    if (i >= 0) removeDrop(i);
  } else {
    const w = t.weed, got = rollTumbleweed();
    if (got) e._carry = { id: got.id, count: got.n, dur: null, meta: null };
    const wi = ENTITIES.indexOf(w);
    if (wi >= 0) { _fxEntGone(w); _removeEntity(wi); }
  }
  e._target = null;
  if (e._carry) mobSound(e, 'say', 0.4);
}
// what it carries let fall where it is (a blow, a fright, its death)
function _mkDropCarry(e) {
  if (!e._carry) return;
  const c = e._carry;
  e._carry = null;
  spawnDrop(c.id, Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z), null, 0.5, c.dur, c.meta, 0, c.count);
}

/* ---------------------------------- burying: the wild one's stash ----------------------------------
   MEERKAT_STASH: "x,y,z" of a sand layer a meerkat put down -> the thing under it { id, count, dur, meta, sand }. Kept
   in the world's save (`meerkatStash`). The layer broken or replaced, the thing comes out (meerkatStashChanged, from
   setBlock in chunks/block-access.js, asked only when a sand cell changes). */
const MEERKAT_STASH = new Map();
function _mkDigStart(e) { e._digT = MEERKAT.digS; e._digDone = true; e.state = 'forage'; }
function _mkBury(e) {
  const c = e._carry;
  if (!c) return;
  for (let k = 0; k < 12; k++) {
    const x = Math.floor(e.hx + (Math.random() - 0.5) * 6), z = Math.floor(e.hz + (Math.random() - 0.5) * 6);
    const gy = surfaceY(x, z), ground = getBlock(x, gy, z), key = x + ',' + (gy + 1) + ',' + z;
    if (getBlock(x, gy + 1, z) !== B.AIR || !CORE.opaqueVal(ground) || isWaterVal(ground) || MEERKAT_STASH.has(key)) continue;
    const sand = (ground & 255) === B.RED_SAND ? B.RED_SAND : B.SAND;
    MEERKAT_STASH.set(key, { id: c.id, count: c.count, dur: c.dur, meta: c.meta, sand });
    setBlock(x, gy + 1, z, CORE.layerVal(sand, 1));
    if (typeof fxPuff === 'function') fxPuff(x + 0.5, gy + 1.1, z + 0.5, [0.86, 0.76, 0.5], 6, 0.7);
    e._carry = null;
    return;
  }
  _mkDropCarry(e);                                   // nowhere to dig: left lying at home
}
function meerkatStashChanged(x, y, z, oldVal, val) {
  const key = x + ',' + y + ',' + z, rec = MEERKAT_STASH.get(key);
  if (!rec) return;
  if ((val & 255) === rec.sand && CORE.layerCount(val) > 0) return;   // still sand over it (more of it fallen on)
  MEERKAT_STASH.delete(key);
  spawnDrop(rec.id, x, y, z, null, DEFAULT_PICKUP_DELAY, rec.dur, rec.meta, 0, rec.count);
}
const serializeMeerkatStash = () => [...MEERKAT_STASH].map(([k, r]) => [k, r.id, r.count, r.dur, r.meta, r.sand]);
function restoreMeerkatStash(list) {
  MEERKAT_STASH.clear();
  if (!Array.isArray(list)) return;
  for (const r of list)
    if (Array.isArray(r) && typeof r[0] === 'string' && Number.isInteger(r[1]) && (ITEM_PROPS[r[1]] || PROPS[r[1]]))
      MEERKAT_STASH.set(r[0], { id: r[1], count: Math.max(1, r[2] | 0), dur: r[3] ?? null, meta: r[4] ?? null, sand: r[5] === B.RED_SAND ? B.RED_SAND : B.SAND });
}

/* ---------------------------------- taming: chitin given crouching, with E ---------------------------------- */
// plates it takes: by its level, fewer with Gentle Hand (the taming's own, kept from its first plate; before that, the
// player looking at it)
const meerkatNeed = (e) => {
  const gh = e.taming ? !!e.taming.gh : (typeof hasSkill === 'function' && hasSkill('gentleHand'));
  return Math.max(1, Math.ceil((e.level || 1) / ENT_LEVEL_MAX * (gh ? MEERKAT.needMaxGentle : MEERKAT.needMax)));
};
const meerkatEff = (e) => e.taming ? Math.max(0.1, Math.min(1, 1 - (e.taming.lost || 0))) : (e.eff > 0 ? e.eff : 1);
/* From tickPlayer: E (a fresh press) crouched with a chitin plate in hand on a wild meerkat. True while one is under the
   crosshair with all that, so E is the meerkat's and not a pat's or the bushes'. */
function meerkatGiveChitin(held) {
  const fresh = held && !player._mkEDown;
  player._mkEDown = !!held;
  if (!held || !player.sneaking || player.riding || player._heldFish) return false;
  const slot = HOTBAR[hotbarSel];
  if (slotId(slot) !== ITEM.CHITIN_PLATE) return false;
  const e = pickEntity(ENT_INTERACT_REACH);
  if (!e || e.kind !== 'meerkat' || e.tame) return false;
  if (!fresh) return true;
  const owner = houndOwner(e);
  if (e.taming && owner && owner !== player) { toast(`${e.name} is being tamed by someone else`); return true; }
  if (e.fleeT > 0 || e._eatT > 0) return true;
  const t0 = e.taming;
  if (t0 && t0.cdT > 0) { toast(`Not yet: it takes the next plate in ${Math.ceil(t0.cdT)} s (stay crouched)`); return true; }
  if (!player.canFly) { slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null; saveHotbar(); buildHotbar(); updateHotbar(); }
  if (!t0) {
    const gh = typeof hasSkill === 'function' && hasSkill('gentleHand') ? 1 : 0;   // Gentle Hand: fewer plates
    e.taming = { n: 0, lost: 0, gh, cdT: 0, awayT: 0, idle: 0, scareCd: 0, spot: { x: e.x, y: e.y, z: e.z }, away: null };
    e.owner = player; e.ownerId = player.profileId || null;
  }
  const t = e.taming;
  t.n++; t.cdT = MEERKAT.feedCd; t.idle = 0;
  _mkLetGo(e); _mkDropCarry(e);
  e._eatT = MEERKAT.eatS; e._eatItem = ITEM.CHITIN_PLATE; e._lookAt = player; e._lookT = MEERKAT.eatS;
  mobSound(e, 'eat', 0.7);
  if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 0.6, e.z, 2);
  handPickSwing = true;
  const need = meerkatNeed(e);
  if (t.n >= need) { _mkTameDone(e); return true; }
  t.awayT = _mkRand(MEERKAT.away); t.away = null;   // eats, runs off, and comes back (the clock runs once it has eaten)
  toast(`Taming the meerkat: ${t.n}/${need} chitin · stay crouched, it comes back · next in ${MEERKAT.feedCd} s`);
  return true;
}
/* Each step of one being tamed: the clocks, the tamer standing up near it (a scare), a taming left too long (given up). */
function _mkTamingTick(e, dt) {
  const t = e.taming;
  if (t.cdT > 0) t.cdT -= dt;
  if (t.scareCd > 0) t.scareCd -= dt;
  t.idle += dt;
  if (t.idle > MEERKAT.forget) { _mkTell(e, `The meerkat lost interest: its taming is given up`, true); e.taming = null; e.owner = null; e.ownerId = null; return; }
  const p = houndOwner(e);
  if (!p || p.dead || !p.spawned || t.scareCd > 0) return;
  const d = Math.hypot(p.pos.x - e.x, p.pos.z - e.z);
  if (d >= MEERKAT.scareR || p.sneaking) return;
  const [lo, hi] = MEERKAT.scareLoss, loss = hi - (hi - lo) * (d / MEERKAT.scareR);
  t.lost += loss;
  t.scareCd = MEERKAT.scareRun + 2;
  t.awayT = MEERKAT.scareRun; t.away = null;
  _mkScare(e, { x: p.pos.x, z: p.pos.z });
  e.fleeT = MEERKAT.fleeTime;
  mobSound(e, 'hurt', 0.4);
  _mkTell(e, `You stood up and scared the meerkat: -${Math.round(loss * 100)}% effectiveness (${Math.round(meerkatEff(e) * 100)}%)`, true);
}
/* One being tamed between plates: off to a place MEERKAT.awayR from its spot (away from the tamer), standing there
   watching, then back to the spot when its time is up, up on its hind legs watching its tamer. */
function _mkBeingTamed(e, dt, plan) {
  const t = e.taming, p = houndOwner(e), spot = t.spot;
  if (t.awayT > 0) {
    t.awayT -= dt;
    if (!t.away) {
      const from = p ? p.pos : { x: spot.x - 1, z: spot.z };
      const a = Math.atan2(spot.x - from.x, spot.z - from.z) + (Math.random() - 0.5) * 1.2;
      t.away = { x: spot.x + Math.sin(a) * MEERKAT.awayR, z: spot.z + Math.cos(a) * MEERKAT.awayR };
    }
    if (_mkGo(e, plan, t.away.x, t.away.z, MEERKAT.run * 0.8, 1.5)) { e.state = 'stand'; e._watch = p || null; }
    return plan;
  }
  if (_mkGo(e, plan, spot.x, spot.z, MEERKAT.run * 0.6, 0.9)) { e.state = 'watch'; e._watch = p || null; }
  return plan;
}
const MEERKAT_NAME_TP = { label: 'meerkat', statLine: (e) => meerkatStatLine(e) };
function _mkTameDone(e) {
  const eff = meerkatEff(e);
  e.tame = true; e.taming = null; e.eff = +eff.toFixed(2);
  e.stance = 'follow'; e.stanceNext = null; e.spot = null;
  e.stats = { maxHp: Math.round(MEERKAT.hp + MEERKAT.boostHp * eff) };
  e.hp = e.stats.maxHp;
  playSound('chestOpen', { gain: 0.6, rate: 1.6, pos: { x: e.x, y: e.y + 0.5, z: e.z } });
  if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 0.6, e.z);
  toast(`tamed the meerkat! effectiveness ${Math.round(eff * 100)}%`);
  addXP(XP_TAME + XP_TAME_PER_LEVEL * (e.level | 0), 'taming');
  if (typeof openNameDialog === 'function') openNameDialog(e, MEERKAT_NAME_TP);
}

/* ---------------------------------- one of somebody's ---------------------------------- */
function _mkOwned(e, dt, plan) {
  if (e.stance === 'find') return _mkFindStance(e, dt, plan);
  if (e.stance === 'stay') { e.state = 'stand'; return plan; }
  if (e.stance === 'lie') { e.state = 'lie'; return plan; }
  const owner = houndOwner(e);
  if (!owner || owner.dead || !owner.spawned) { e.state = 'stand'; return plan; }
  const dx = owner.pos.x - e.x, dz = owner.pos.z - e.z, d = Math.hypot(dx, dz);
  if (d > MEERKAT.followFar || (e._following && d > MEERKAT.followNear)) {
    e._following = true;
    _mkGo(e, plan, owner.pos.x, owner.pos.z, d > 10 ? MEERKAT.run : MEERKAT.walk * 2, 0);
  } else { e._following = false; e.state = 'stand'; e._watch = owner; }
  return plan;
}
/* 'find items': from its spot it fetches the nearest thing lying within MEERKAT.findR (or searches a tumbleweed),
   brings it back and leaves it at the spot, then rests MEERKAT.findRest before looking again. */
function _mkFindStance(e, dt, plan) {
  const spot = e.spot || (e.spot = { x: e.x, y: e.y, z: e.z });
  if (e._carry) {
    if (!_mkGo(e, plan, spot.x, spot.z, MEERKAT.walk * 2, 1.2)) return plan;
    _mkDropCarry(e);
    e._findT = MEERKAT.findRest;
    mobSound(e, 'say', 0.5);
    return plan;
  }
  if (e._findT > 0) { e._findT -= dt; if (_mkGo(e, plan, spot.x, spot.z, MEERKAT.walk * 1.5, 0.9)) e.state = 'stand'; return plan; }
  if (!_mkTargetGood(e._target)) {
    _mkLetGo(e);
    e._target = _mkFindThing(spot.x, spot.y, spot.z, MEERKAT.findR); e._chaseT = 0;
    if (!e._target) { e._findT = 2; return plan; }
  }
  _mkFetch(e, dt, plan);
  return plan;
}

/* ---------------------------------- the right button on one ----------------------------------
   From _doPlace, after the otter's. True when the click was the meerkat's. */
function tryMeerkatInteract() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return false;
  if (typeof nameDialogOpen === 'function' && nameDialogOpen()) return false;
  const e = pickEntity(ENT_INTERACT_REACH), slot = HOTBAR[hotbarSel];
  if (!e || e.kind !== 'meerkat') {
    // sneak + use with an empty hand, aiming at no creature (nor a clam): the meerkat on your shoulder is set down
    if (player._wornMeerkat && player.sneaking && !slot && !e && !(act && act.place) && currentRay()?.id !== B.CLAM) {
      meerkatTakeOff(player, false);
      return true;
    }
    return false;
  }
  if (!e.tame) return false;                          // a wild one: chitin given crouching with E; the click passes on
  if (act && act.place) return true;                  // fresh presses only
  if (houndOwner(e) !== player) { toast(`${e.name} answers to someone else`); return true; }
  // food in hand (MEERKAT_FOOD), not sneaking: it sits up and eats it
  const id = slotId(slot), meal = MEERKAT_FOOD[id];
  if (meal > 0 && !player.sneaking) {
    if (e._eatT > 0) return true;
    if (entHunger(e) >= ENT_HUNGER_MAX - 0.5) { toast(`${e.name} is full`); return true; }
    if (!player.canFly) { slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null; saveHotbar(); buildHotbar(); updateHotbar(); }
    e.hunger = Math.min(ENT_HUNGER_MAX, entHunger(e) + meal);
    e.hp = Math.min(entMaxHp(e), e.hp + 5);
    e._eatT = MEERKAT.eatS; e._eatItem = id;
    mobSound(e, 'eat', 0.7);
    toast(`${e.name} eats the ${idName(id).toLowerCase()}: hunger ${Math.round(e.hunger)}/${ENT_HUNGER_MAX}`);
    return true;
  }
  if (player.sneaking) {
    if (player._wornMeerkat) toast('You already have a meerkat on your shoulder');
    else meerkatPutOn(player, e, false);
    return true;
  }
  const now = e.stance, next = MEERKAT_STANCES[(MEERKAT_STANCES.indexOf(e.stanceNext || now) + 1) % MEERKAT_STANCES.length];
  if (next === now) { e.stanceNext = null; toast(`${e.name}: stays on ${_mkStanceText(now)}`); }
  else { e.stanceNext = next; e.stanceT = MEERKAT.stanceWait; toast(`${e.name}: ${_mkStanceText(next)} in ${MEERKAT.stanceWait} s`); }
  return true;
}

/* ---------------------------------- on the shoulder ----------------------------------
   Out of the world onto the player, kept whole, as the otter round the neck (entities/otter.js): one creature worn at a
   time, so an otter worn comes down for it. */
function meerkatPutOn(p, e, quiet) {
  const i = ENTITIES.indexOf(e);
  if (i < 0 || p._wornMeerkat) return false;
  if (p._wornOtter && typeof otterTakeOff === 'function') otterTakeOff(p, false);
  ENTITIES.splice(i, 1);
  scene.remove(e.model.root);
  _mkLetGo(e); _mkDropCarry(e);
  e._worn = true; e._wearOn = false; e._lerp = null; e.stanceNext = null;
  p._wornMeerkat = e;
  if (!quiet) {
    mobSound(e, 'say', 0.6);
    const tell = () => feedInfo(`${e.name} climbs onto your shoulder: things come to you from further (sneak + use with an empty hand sets it down)`);
    if (typeof withPlayer === 'function') withPlayer(p, tell); else tell();
  }
  return true;
}
function meerkatTakeOff(p, dead) {
  const e = p._wornMeerkat;
  if (!e) return null;
  p._wornMeerkat = null;
  e._worn = false;
  let x = p.pos.x, z = p.pos.z;
  const y = p.pos.y + 0.1;
  if (!dead) {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    _useBox(e);
    for (const r of [1.2, 0.8, 0.4]) if (!_entBlocked(p.pos.x + fx * r, y, p.pos.z + fz * r)) { x = p.pos.x + fx * r; z = p.pos.z + fz * r; break; }
    _useBox(null);
  }
  Object.assign(e, { x, y, z, vy: 0, kx: 0, kz: 0, hx: x, hz: z, peakY: null, onGround: false, stuckT: 0, _px: undefined });
  e.spot = { x, y, z };
  e.yaw = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
  e.model.root.position.set(x, y, z);
  scene.add(e.model.root);
  ENTITIES.push(e);
  mobSound(e, 'say', 0.5);
  return e;
}
/* how much further a player picks up and forages with one on their shoulder (0.25 = 25% further), by its level and its
   taming's effectiveness; 0 without. wornReachMul: the multiplier, read by 15-drops.js and player/foraging.js */
function meerkatReachBonus(p) {
  const e = p && p._wornMeerkat;
  return e ? MEERKAT.reachBase + MEERKAT.reachLvl * (e.level || 1) + MEERKAT.reachEff * (e.eff > 0 ? e.eff : 1) : 0;
}
const wornReachMul = (p) => 1 + meerkatReachBonus(p);
/* On the body (applyCameraView, player/body.js): standing up on the right shoulder, looking about. */
function poseMeerkatShoulder(m, p, dt) {
  const e = p._wornMeerkat;
  if (!e) { if (m.meerkat) m.meerkat.root.visible = false; return; }
  if (!m.meerkat || m.meerkat._for !== e) {
    if (m.meerkat) m.torso.remove(m.meerkat.root);
    m.meerkat = buildMeerkat();
    m.meerkat._for = e;
    m.torso.add(m.meerkat.root);
  }
  const s = m.meerkat;
  if (!_mkDress(s)) return;
  const t = performance.now() / 1000;
  s.root.visible = true;
  s.root.position.set(-5 * PX, 12 * PX, 0.5 * PX);
  s.root.rotation.set(0, 0, 0);
  s.root.scale.setScalar(0.6 * (e.size || 1));
  s.body.position.y = s.bodyY + Math.sin(t * 1.8) * 0.1 * PX;
  s.body.rotation.set(0, 0, Math.sin(t * 0.9) * 0.05);
  s.head.rotation.set(0, Math.sin(t * 0.5) * 0.9, 0);
  for (const a of [s.armL, s.armR]) a.rotation.set(-0.25, 0, 0);
  for (const l of [s.legL, s.legR]) l.rotation.set(0, 0, 0);
  s.tail.rotation.set(0.3, 0, 0);
  _mkHeldModel(s, null);
  shadeTinted(s, p.pos.x, p.pos.y + 1.4, p.pos.z, false, 0);
}

/* ---------------------------------- once a world step ----------------------------------
   For every meerkat of somebody's: one saved on its owner's shoulder goes back on as they come; one told to follow that
   is left MEERKAT.teleport behind (or whose chunk went out of range) comes to its owner. */
function meerkatWorldTick(dt) {
  for (const e of [...ENTITIES]) {
    if (e.kind !== 'meerkat' || !e.tame) continue;
    const owner = houndOwner(e);
    if (!owner || !owner.spawned || owner.dead) continue;
    if (e._wearOn) { if (!owner._wornMeerkat && !owner._wornOtter) meerkatPutOn(owner, e, true); e._wearOn = false; continue; }
    if (e.stance !== 'follow') continue;
    const dx = owner.pos.x - e.x, dz = owner.pos.z - e.z;
    if (e.active !== false && dx * dx + dz * dz < MEERKAT.teleport * MEERKAT.teleport && Math.abs(owner.pos.y - e.y) < 24) continue;
    if (typeof _otterComeTo === 'function') _otterComeTo(e, owner);   // the same "a spot by its owner" the otter uses
  }
}

/* ---------------------------------- where it lives ----------------------------------
   Once per new chunk: now and then a band of MEERKAT.packMin-packMax at a burrow on desert sand (MEERKAT_BIOMES) with other
   land within MEERKAT.edgeR (the edge of the desert); never within MEERKAT.apart of another band. */
function rollMeerkats(cx, cz) {
  if (Math.random() >= MEERKAT.chunkChance * ANIMAL_SPAWN_MUL) return;
  const s = _findChunkSpot(cx, cz, MEERKAT_BIOMES);
  if (!s) return;
  let edge = false;
  for (let k = 0; k < 8 && !edge; k++) {
    const a = k * Math.PI / 4;
    const b = BIOMES.biomeBase(mainGen.biomeAt(Math.floor(s.x + Math.sin(a) * MEERKAT.edgeR), Math.floor(s.z + Math.cos(a) * MEERKAT.edgeR)));
    if (!MEERKAT_DESERT.has(b) && !/Ocean|Beach|River|Lake/.test(b)) edge = true;
  }
  if (!edge) return;
  for (const e of ENTITIES) if (e.kind === 'meerkat' && Math.abs(e.x - s.x) < MEERKAT.apart && Math.abs(e.z - s.z) < MEERKAT.apart) return;
  for (let n = _ri(MEERKAT.packMin, MEERKAT.packMax); n > 0; n--) {
    const x = s.x + (Math.random() - 0.5) * 3, z = s.z + (Math.random() - 0.5) * 3;
    const ok = !_entBlocked(x, s.y, z) && !_entHazard(x, s.y, z);
    summon('meerkat', ok ? x : s.x, s.y, ok ? z : s.z, { hx: s.x, hz: s.z });
  }
}

/* ---------------------------------- what the crosshair says ---------------------------------- */
const meerkatStatLine = (e) => `health ${Math.ceil(e.hp)}/${entMaxHp(e)} · hunger ${Math.round(entHunger(e))}/${ENT_HUNGER_MAX}` +
  ` · effectiveness ${Math.round(meerkatEff(e) * 100)}%`;
function meerkatSubText(e) {
  if (e.taming) return `taming ${e.taming.n}/${meerkatNeed(e)}${e.taming.cdT > 0 ? ` · ${Math.ceil(e.taming.cdT)} s` : ''}`;
  if (e.tame) return (e.stanceNext ? _mkStanceText(e.stance) + ' > ' + _mkStanceText(e.stanceNext) : _mkStanceText(e.stance)) + (e._carry ? ' · carrying' : '');
  return '';
}
function meerkatPrompt(e) {
  const head = entityHead(e), dim = (s) => `<span style="opacity:.8;font-size:.9em">${s}</span>`;
  const need = meerkatNeed(e);
  if (e.taming) {
    const t = e.taming;
    return `${head}<br>${dim(`taming ${t.n}/${need} chitin · effectiveness ${Math.round(meerkatEff(e) * 100)}%` +
      (t.cdT > 0 ? ` · next plate in ${Math.ceil(t.cdT)} s` : ' · give a plate: <b>crouch + E</b>') + ' · stay crouched')}`;
  }
  if (!e.tame) return `${head}<br>${dim(`(tamable: ${need} chitin plate${need > 1 ? 's' : ''}, given crouched with <b>E</b>, ${MEERKAT.feedCd} s apart)`)}`;
  const st = e.stanceNext ? `${_mkStanceText(e.stance)} > ${_mkStanceText(e.stanceNext)} (${Math.max(0, e.stanceT).toFixed(1)} s)` : _mkStanceText(e.stance);
  const pet = typeof _petHint === 'function' ? ' · ' + _petHint() : '';
  // food in hand: the use button feeds it (tryMeerkatInteract)
  const fid = slotId(HOTBAR[hotbarSel]);
  const feed = MEERKAT_FOOD[fid] > 0 ? '<br>' + (entHunger(e) >= ENT_HUNGER_MAX - 0.5 ? `${_esc(e.name)} is full`
                                                 : `(<b>use</b>) feed ${_esc(idName(fid).toLowerCase())}`) : '';
  return `${head}<br>${dim(meerkatStatLine(e))}<br>${dim(`stance: <b>${st}</b> (use) · on your shoulder (sneak + use)${pet}`)}${feed}`;
}

/* ---------------------------------- the save ---------------------------------- */
function meerkatSave(e) {
  const t = e.taming;
  return {
    sz: e.size, g: e.gender, lv: e.level, h: +entHunger(e).toFixed(1),
    t: e.tame ? 1 : 0, o: e.ownerId || null, sc: e.stance, ef: e.eff || 0, st: e.tame && e.stats ? e.stats : null,
    sp: e.spot ? [+e.spot.x.toFixed(2), +e.spot.y.toFixed(2), +e.spot.z.toFixed(2)] : null,
    tm: t ? [t.n | 0, +(t.lost || 0).toFixed(3), t.gh ? 1 : 0, +t.spot.x.toFixed(2), +t.spot.y.toFixed(2), +t.spot.z.toFixed(2)] : null,
    cr: e._carry ? [e._carry.id, e._carry.count, e._carry.dur, e._carry.meta] : null,   // what it carries in its mouth
    wn: e._worn ? 1 : 0,                                                                     // on its owner's shoulder
  };
}
function meerkatRestore(s) {
  const d = s.d;
  const st = d.st && d.st.maxHp > 0 ? { maxHp: +d.st.maxHp } : null;
  const tm = !d.t && Array.isArray(d.tm) && d.tm.length >= 6
    ? { n: d.tm[0] | 0, lost: +d.tm[1] || 0, gh: d.tm[2] ? 1 : 0, cdT: 0, awayT: 0, idle: 0, scareCd: 0, away: null,
        spot: { x: +d.tm[3], y: +d.tm[4], z: +d.tm[5] } } : null;
  const sp = Array.isArray(d.sp) && d.sp.length === 3 ? { x: +d.sp[0], y: +d.sp[1], z: +d.sp[2] } : null;
  const cr = Array.isArray(d.cr) && Number.isInteger(d.cr[0]) && (ITEM_PROPS[d.cr[0]] || PROPS[d.cr[0]])
    ? { id: d.cr[0], count: Math.max(1, d.cr[1] | 0), dur: d.cr[2] ?? null, meta: d.cr[3] ?? null } : null;
  const e = summon('meerkat', s.x, s.y, s.z, {
    hp: s.hp, size: d.sz, gender: d.g, level: d.lv, hunger: d.h,
    tame: !!d.t, ownerId: d.o, stance: d.sc, eff: d.ef, stats: st, taming: tm, spot: sp, carry: cr,
    name: s.name, hx: s.hx, hz: s.hz,
  });
  if (d.wn && d.t) e._wearOn = true;                // meerkatWorldTick puts it back on their shoulder
  return e;
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in MEERKAT. */
defineMob('meerkat', {
  name: 'Meerkat', group: 'animal', step: updateMeerkat, passive: true, spared: true, hungerMul: 0.5,
  maxHp: (e) => (e.stats && e.stats.maxHp) || MEERKAT.hp,   // raised by its taming
  box: [0.2, 0.62], sized: true,
  walk: MEERKAT.walk, flee: MEERKAT.run, fleeTime: MEERKAT.fleeTime, fleeTogether: MEERKAT.fleeTogether,
  fallSafe: 6, foot: 'paw',
  sounds: { say: { key: 'meerkatSay' }, hurt: { key: 'meerkatHurt' }, eat: { key: 'meerkatEat', gain: 0.8 } },
  make: makeMeerkat, gendered: true, build: () => buildMeerkat(),
  roll: rollMeerkats,                                  // its own rule: bands on the desert's edge
  save: meerkatSave, load: meerkatRestore,
  prompt: meerkatPrompt, subText: meerkatSubText,
});
