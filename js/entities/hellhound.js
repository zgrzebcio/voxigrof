'use strict';
/* entities/hellhound.js: the hellhound. */

/* voxiGrof — the hellhound

   A dog of magma that lives in the Deep Desert. Wild, it hunts any player it sees, and its bite sets what it bit
   alight. It is a creature like the rest (ENTITIES, kind 'hellhound') and walks the grazer's legs (_updateGrazer,
   entities/entities.js), which asks this file four things each step:
     houndThink   where it goes and how fast, whom it bites
     houndHazard  what it will not step into (water and long drops; lava is a floor to it)
     houndBody    its needs: lava and fire feed and heal it, water and rain wear it down, a dropped fire is eaten
     houndPose    its gait, the bite, sitting, lying, the glow that never goes dark

   TAMING. While a player holds a lava mushroom a wild one leaves them alone; given the mushroom (use), the taming
   starts and the hound is that player's for one game day awake (HOUND.tameS; the clock stops while it sleeps). In that
   day it wants kills: 7 animals, or 4 monsters, or 3 villagers (shares of each add up: 4 animals and 2 monsters is 107%;
   with the tamer's Gentle Hand a kill counts HOUND.gentle). Two kinds of kill count:
     the hound's own (its bite, or the fire its bite left)                   a poor one: it costs effectiveness
     the player's, made WITH FIRE (a torch's blow, or fire that player set)  a good one: it costs nothing
   It goes for whatever its player strikes, as in the 'attack' behaviour. Effectiveness starts at 100% and
   only goes down: each kill the hound makes itself takes its share of HOUND.ownKillCost (an animal 7%, a monster
   13%, a villager 17%), and what the hound is hurt meanwhile takes HOUND.hurtCost for a whole bar. It scales the
   health and damage a tamed hound gains (HOUND.boostHp / boostDmg). The day run out, it turns on the player and
   never takes a mushroom again.
   A kill by a hound, or by a player with fire, leaves 1 fire (LOOT.fireKill): a hound that is not whole eats one it
   finds (full health while being tamed; a spell of healing once tamed).

   TAMED. Use: the next behaviour, taking hold HOUND.modeWait seconds after the last press. Sneak + use: the next
   stance, at once. Use with food it has room for: it eats.
     behaviours  passive (never fights) · defense (what struck you or it) · aggressive (anything within HOUND.aggroR,
                 too) · attack (what you strike, too)
     stances     follow (left HOUND.teleport behind, it comes to you) · sit · lie · wait (stands where it is)
   Out of 'follow' it never leaves its spot: it only bites what comes within reach.

   SLEEP. At night every hound lies down and sleeps (`e._sleep`, the lie pose): a wild one wakes for a player within
   HOUND.wakeR or a blow, somebody's for a fight or for its owner walking off past HOUND.followFar. Asleep, or told to
   lie, its fire slowly comes back (HOUND.sleepFire); in the cold it burns faster (HOUND.cold*, houndBody). */

const HOUND = {
  hp: 150, food: 120, fire: 100,          // health, food, and its "water", which is fire
  dmg: 40, atkCd: 1.1, fireS: 4,          // a bite, and how long it leaves what it bit burning
  walk: 1.9, trot: 4.6, run: 6.6,         // strolling, keeping up with its owner, hunting
  sees: 16, givesUp: 30, aggroTime: 20,   // a wild one: how near it notices a player, how far it follows, how long a blow keeps it on you
  scale: 1.1,
  // taming
  tameS: DAY_LEN,                         // one game day (20 minutes) of it awake: its clock stops while it sleeps
  needAnimals: 7, needMonsters: 4, needNpcs: 3,
  gentle: 1.2,                            // what one kill counts for with the tamer's Gentle Hand (player/skills.js)
  ownKillCost: 0.5,                       // effectiveness lost if every kill of the taming is the hound's own (each kill its share of it)
  hurtCost: 0.5,                          // effectiveness lost for a whole health bar taken while being tamed
  boostHp: 50, boostDmg: 10,              // what a perfect taming adds
  creditR: 48,                            // a player's fire kill counts for their hounds within this
  // tamed
  modeWait: 2,                            // seconds before a new behaviour takes hold
  aggroR: 8,                              // 'aggressive': anything within this
  targetR: 24, targetS: 12,               // how far, and for how long, what was struck stays its target
  followNear: 3, followFar: 8, teleport: 26,
  // needs
  lavaHeal: 10,                           // health a second standing in lava
  regenS: 8, regenHps: 6,                 // a fire eaten, once tamed: this long, this much a second
  fireFill: 12,                           // "water" a second in lava, or beside lava or a fire
  sleepFire: 0.15,                        // ...and a second asleep (at night, or told to lie): slowly
  coldFrom: 5, coldTo: -25, coldBurn: 2,  // below coldFrom °C its fire burns faster, up to 1 + coldBurn times as fast at coldTo
  wakeR: 5,                               // a wild one asleep notices a player only this near
  wetGrace: 5, wetEvery: 2, wetDmg: 5,    // seconds in water or rain before it hurts, then this much every so often
  pickR: 1.5, seekR: 10,                  // a dropped fire: eaten within pickR, walked to from seekR
  glow: 0.5,                              // how bright it is in the dark at the least
  // where it lives
  chunkChance: 0.0042, packMin: 1, packMax: 1, packApart: 120,   // alone, far apart (0.006, 1-2, 48 before 0.8471)
};
// what it eats from the hand and what each fills (food); fire and the lava mushroom feed its fire too
const HOUND_FOOD = { [B.LAVA_MUSHROOM]: 50, [ITEM.FIRE]: 80, [ITEM.COAL]: 20, [ITEM.CHARCOAL]: 10 };
const HOUND_FIRE_FROM = { [B.LAVA_MUSHROOM]: 25, [ITEM.FIRE]: 50 };
const HOUND_MODES = ['passive', 'defense', 'aggressive', 'attack'];
const HOUND_STANCES = ['follow', 'sit', 'lie', 'wait'];
const HOUND_BIOMES = { 'Deep Desert': 1, 'Deep Red Desert': 1, 'Deep Red Desert Flat': 1 };
const houndDmg = (e) => (e.stats && e.stats.dmg) || HOUND.dmg;
// its fire is not out: the bite still sets alight. Only one of somebody's can run out (a wild one feeds itself)
const houndLit = (e) => !(e.tame || e.taming) || entThirst(e) > 0;

/* ---------------------------------- the model ----------------------------------
   Sheet textures/Entity/Tamable/hellhound.png, 128x128, painted by toolsrc/hellhound-tex.ps1. Regions in the 64-space units
   _skinUV works in (painted at 2x):
     body  7w x 7h x 14d at (0, 0)     mane 8x8x5 at (0, 22)     skull 6x6x5 at (28, 22)
     snout 3x3x4 at (0, 36)            ear  2x3x1 at (16, 36)    leg   3x9x3 at (24, 36)    tail 2x2x8 at (38, 36)
   The trunk (body, mane, head, tail) hangs off a group pivoted at the hind hips, so sitting tips the whole of it back
   on its haunches; the legs stay on the root and are placed per pose (houndPose). */
const _houndTex = _nearestTex('textures/Entity/Tamable/hellhound.png');
function _houndLeg(mat) {
  const g = new THREE.Group();
  const m = _part(mat, 3, 9, 3, 24, 36);
  m.position.y = -4.5 * PX;                       // pivots at the hip
  g.add(m);
  return g;
}
function buildHellhound() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: _houndTex, transparent: true, alphaTest: 0.5 });
  const trunk = new THREE.Group();
  trunk.position.set(0, 9 * PX, -5 * PX);         // the hind hips
  const body = _part(mat, 7, 7, 14, 0, 0);    body.position.set(0, 3 * PX, 5 * PX);
  const mane = _part(mat, 8, 8, 5, 0, 22);    mane.position.set(0, 3.5 * PX, 10 * PX);
  // the head rides a pivot at the front of the shoulders: skull, snout and ears dip and lunge together
  const head = new THREE.Group();
  head.position.set(0, 5 * PX, 12.5 * PX);
  const skull = _part(mat, 6, 6, 5, 28, 22);  skull.position.set(0, 0.5 * PX, 2.5 * PX);
  const snout = _part(mat, 3, 3, 4, 0, 36);   snout.position.set(0, -0.5 * PX, 7 * PX);
  const earL = _part(mat, 2, 3, 1, 16, 36);   earL.position.set( 2 * PX, 4.5 * PX, 1 * PX);
  const earR = _part(mat, 2, 3, 1, 16, 36);   earR.position.set(-2 * PX, 4.5 * PX, 1 * PX);
  head.add(skull, snout, earL, earR);
  const tail = new THREE.Group();
  tail.position.set(0, 5.5 * PX, -2 * PX);
  const tailM = _part(mat, 2, 2, 8, 38, 36);  tailM.position.set(0, 0, -4 * PX);
  tail.add(tailM);
  trunk.add(body, mane, head, tail);
  const legFL = _houndLeg(mat); legFL.position.set(-2 * PX, 9 * PX,  5 * PX);
  const legFR = _houndLeg(mat); legFR.position.set( 2 * PX, 9 * PX,  5 * PX);
  const legBL = _houndLeg(mat); legBL.position.set(-2 * PX, 9 * PX, -5 * PX);
  const legBR = _houndLeg(mat); legBR.position.set( 2 * PX, 9 * PX, -5 * PX);
  root.add(trunk, legFL, legFR, legBL, legBR);
  return { root, trunk, head, snout, body, tail, legs: [legFL, legFR, legBL, legBR], mat, mats: [mat] };
}
const HOUND_SNOUT_Y = -0.5;                       // the snout's place on the head (16ths): chewing works it up and down from here
const HOUND_EAT_AT = [0, -0.8, 2.2];              // what it eats, held in the tip of the snout (16ths, the snout's own)
/* Posed once a step, after it has moved. `e._rest` ('sit' / 'lie', from houndThink) eases the two rest poses in:
   sitting, the trunk tips back onto the haunches and the hind legs fold forward under it; lying, the trunk comes
   down on its belly with all four legs stretched forward. */
function houndPose(e, m, dt, swing) {
  const k = Math.min(1, dt * 6);
  e.sitK = (e.sitK || 0) + ((e._rest === 'sit' ? 1 : 0) - (e.sitK || 0)) * k;
  e.lieK = (e.lieK || 0) + ((e._rest === 'lie' ? 1 : 0) - (e.lieK || 0)) * k;
  const s = e.sitK, l = e.lieK, up = 1 - Math.max(s, l);
  // eating (houndEat): the food in its mouth, chewing aloud (entEatStep, entities/entities.js)
  const eating = entEatStep(e, dt, m.snout, HOUND_EAT_AT, 0.85);
  // the head: up on the hunt, down to sniff when idle, a lunge down and forward with each bite, down to its food
  const dipTo = e.atkAnimT > 0 ? 0.7 : eating ? 0.45 : e._hunt ? -0.12 : e._sleep ? 0.55 : e._rest === 'lie' ? 0.3 : e._rest === 'sit' ? -0.3
              : e.state === 'idle' ? 0.25 : 0.05;
  e.headDip = (e.headDip || 0) + (dipTo - (e.headDip || 0)) * Math.min(1, dt * (e.atkAnimT > 0 ? 14 : 4));
  animateQuadruped(m, e.walk, swing * up, e.headDip);
  // chewing: the snout (its jaw) works up and down and the head nods with it
  const now = performance.now() / 1000;
  if (eating) m.head.rotation.x += Math.sin(now * 13) * 0.06;
  if (m.snout) m.snout.position.y = (HOUND_SNOUT_Y + (eating ? Math.sin(now * 13) * 0.45 - 0.25 : 0)) * PX;
  /* its head to the side, toward a player it minds (_entHeadTurn in entities/entities.js): whoever just petted it; its owner
     when it is somebody's and not on the hunt; the one whose mushroom keeps a wild one standing (`_watch`) */
  const lookP = e._lookT > 0 && e._lookAt ? e._lookAt
              : e._hunt ? null : (e.tame || e.taming) ? houndOwner(e) : e._watch || null;
  m.head.rotation.y = _entHeadTurn(e, lookP, dt, m.root.rotation.y);
  m.trunk.position.y = (9 - 5.2 * s - 7.5 * l) * PX;
  m.trunk.rotation.x = -0.55 * s;
  const [fl, fr, bl, br] = m.legs;
  for (const leg of [fl, fr]) {
    leg.position.y = (9 - 7.5 * l) * PX;
    leg.position.z = (5 - 1.47 * s) * PX;
    leg.rotation.x = leg.rotation.x * up - 1.5 * l;
  }
  for (const leg of [bl, br]) {
    leg.position.y = (9 - 5.2 * s - 7.5 * l) * PX;
    leg.rotation.x = leg.rotation.x * up - 1.25 * s - 1.5 * l;
  }
  m.tail.rotation.x = 0.4 - 0.4 * l;
  // the tail: with its stride; a slow wag at rest when it is somebody's; a fast one for a while after a pat
  m.tail.rotation.y = Math.sin(e.walk * 0.7) * 0.2
    + (e._petT > 0 ? Math.sin(performance.now() / 70) * 0.45
       : up < 0.5 && (e.tame || e.taming) && !e._sleep ? Math.sin(performance.now() / 160) * 0.25 : 0);
  // asleep: a Z now and then over its head
  if (e._sleep && m.root.visible && typeof _fxZ === 'function' && Math.random() < dt * 0.4) _fxZ(e.x, e.y + 0.9, e.z);
  // it is fire: never darker than its own glow, which sinks as its fire runs low
  const glow = HOUND.glow * (0.6 + 0.4 * ((e.tame || e.taming) ? Math.min(1, entThirst(e) / HOUND.fire) : 1));
  const b = Math.max(glow, _lightAt(e.x, e.y + 0.8, e.z));
  if (e.hurtT > 0) m.mat.color.setRGB(_HURT_COL.r * b, _HURT_COL.g * b, _HURT_COL.b * b);
  else m.mat.color.setScalar(b);
  // a lick of flame off its back now and then, while it is on show
  if (m.root.visible && houndLit(e) && typeof _fxFlame === 'function' && Math.random() < dt * 2.5)
    _fxFlame(e.x + (Math.random() - 0.5) * 0.5, e.y + 0.7 + Math.random() * 0.3, e.z + (Math.random() - 0.5) * 0.5, 0.4, 0.1);
}

/* ---------------------------------- spawning ---------------------------------- */
/* What one hellhound is made of: its model and what only a hound has. summon('hellhound', x, y, z, opts) writes
   the rest (entities/mobs.js). `opts`: size, name, hunger, thirst, and what its taming got to (tame, taming,
   noTame, eff, ownerId, mode, stance, stats). */
function makeHellhound(opts) {
  const size = _animalSize(opts);
  // a tamed one keeps what its taming gave it (stats); a wild one stands on the plain numbers
  const stats = opts.stats && opts.stats.maxHp > 0 ? opts.stats : null;
  return {
    model: buildHellhound(), scale: HOUND.scale * size,
    own: {
      size, stats,
      hunger: opts.hunger >= 0 ? Math.min(HOUND.food, +opts.hunger) : HOUND.food,
      thirst: opts.thirst >= 0 ? Math.min(HOUND.fire, +opts.thirst) : HOUND.fire,
      name: opts.name || 'Hellhound',
      tame: !!opts.tame,                        // fully tamed
      taming: opts.taming || null,              // { left, a, m, n, lost, hurt, gh } while its day of kills runs
      noTame: !!opts.noTame,                    // a taming ran out: it takes no mushroom again
      eff: opts.eff > 0 ? +opts.eff : null,     // the effectiveness it was tamed at
      owner: null,                              // the player, found from ownerId when wanted (houndOwner)
      ownerId: opts.ownerId != null ? opts.ownerId : null,
      mode: HOUND_MODES.includes(opts.mode) ? opts.mode : 'defense',
      stance: HOUND_STANCES.includes(opts.stance) ? opts.stance : 'follow',
      modeNext: null, modeT: 0,                 // the behaviour pressed for, and the wait left before it holds
      wetT: 0, wetHit: 0, regenBoost: 0, pickCd: 0,
    },
  };
}
/* Called once per new chunk (trySpawnEntitiesInChunk): one at a time (packMin..packMax), in the Deep Desert and its red
   half, never within packApart of another. */
function rollHellhounds(cx, cz) {
  if (Math.random() >= HOUND.chunkChance) return;
  const s = _findChunkSpot(cx, cz, HOUND_BIOMES);
  if (!s) return;
  for (const e of ENTITIES)
    if (e.kind === 'hellhound' && Math.abs(e.x - s.x) < HOUND.packApart && Math.abs(e.z - s.z) < HOUND.packApart) return;
  for (let n = _ri(HOUND.packMin, HOUND.packMax); n > 0; n--) {
    const sx = s.x + (Math.random() * 4 - 2), sz = s.z + (Math.random() * 4 - 2);
    const ok = !_entBlocked(sx, s.y, sz) && !_entHazard(sx, s.y, sz) && _entSpawnRoom(sx, s.y, sz);
    summon('hellhound', ok ? sx : s.x, s.y, ok ? sz : s.z);
  }
}

/* ---------------------------------- whose it is ----------------------------------
   A hound belongs to a PROFILE (ownerId, saved); `owner` is that profile's player while they are in the world. With
   its owner away (a split-screen partner who has not joined) a hound waits where it is. */
function houndOwner(e) {
  if (e.owner && PLAYERS.includes(e.owner)) return e.owner;
  e.owner = null;
  if (!e.tame && !e.taming) return null;
  for (const p of PLAYERS) if ((p.profileId || null) === (e.ownerId || null)) { e.owner = p; break; }
  return e.owner;
}
// what a player has in the hand, asked from outside their own tick
const _houndHeldBy = (p) => (typeof withPlayer === 'function' ? withPlayer(p, () => slotId(HOTBAR[hotbarSel])) : slotId(HOTBAR[hotbarSel]));
// a line in that player's feed
function _houndTell(p, msg, warn) {
  if (typeof feedInfo !== 'function') return;
  if (p && typeof withPlayer === 'function') withPlayer(p, () => feedInfo(msg, warn)); else feedInfo(msg, warn);
}
const _houndFx = (e, n) => { if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 1.0, e.z, n); };

/* ---------------------------------- its mind ----------------------------------
   Returns the speed it wants this step, having turned to face where it is going. `e._bold` = it is after something
   and goes off a ledge or through water for it; `e._rest` = the rest pose it holds (houndPose); `e._sleep` = it is asleep
   (the lie pose, its fire coming back, a taming's clock stopped). */
const _houndNight = () => typeof isDarkTime === 'function' && isDarkTime();
function houndThink(e, dt, tp, inWater) {
  if (e.aggroT > 0) e.aggroT -= dt;
  if (e.atkAnimT > 0) e.atkAnimT -= dt;
  e._bold = false; e._hunt = false; e._rest = null; e._watch = null;
  const slept = !!e._sleep;                          // asleep last step: a wild one notices less
  e._sleep = false;
  const owner = houndOwner(e);
  // while it is being tamed, every point of health it loses is held against the taming
  if (e.taming && e._hpWas != null && e.hp < e._hpWas - 0.01) e.taming.hurt = (e.taming.hurt || 0) + (e._hpWas - e.hp);
  e._hpWas = e.hp;
  // a behaviour pressed for takes hold once its wait is over
  if (e.modeNext) {
    e.modeT -= dt;
    if (e.modeT <= 0) { e.mode = e.modeNext; e.modeNext = null; e._foe = null; _houndTell(owner, `${e.name}: ${e.mode}`); }
  }
  if (!e.tame && !e.taming) return _houndWild(e, dt, tp, inWater, slept);

  const staying = e.tame && e.stance !== 'follow', night = _houndNight();
  const foe = _houndFoe(e, owner, dt);
  if (foe) {
    const dx = foe.x - e.x, dz = foe.z - e.z, d = Math.hypot(dx, dz), reach = entAttackRange(e, { R: entR(foe) });
    if (!staying || d < reach)
      return _houndGoBite(e, foe.x, foe.y, foe.z, reach, inWater, staying, () => _houndBiteMob(e, foe, dx, dz, d));
  }
  e.state = 'idle';
  if (staying) {
    if (inWater) return _houndSwimOut(e, dt);
    // asleep at night in any stance; told to lie, it lies as it sleeps (its fire comes back the same)
    e._sleep = night || e.stance === 'lie';
    e._rest = e._sleep ? 'lie' : e.stance === 'wait' ? null : e.stance;
    return 0;
  }
  // a fire lying near, when it is not whole: it goes for it (houndBody finds it and eats it)
  if (e._fireAt) {
    e.yaw = Math.atan2(e._fireAt.x - e.x, e._fireAt.z - e.z);
    return HOUND.trot;
  }
  if (!owner || owner.dead || !owner.spawned) return _houndStill(e, dt, inWater, night);   // nobody to follow: it waits
  const odx = owner.pos.x - e.x, odz = owner.pos.z - e.z, od = Math.hypot(odx, odz);
  if (od > HOUND.followFar || (e._following && od > HOUND.followNear)) {
    e._following = true;
    e.yaw = Math.atan2(odx, odz);
    return (od > HOUND.followFar ? HOUND.run : HOUND.trot) * (inWater ? 0.5 : 1);
  }
  e._following = false;
  return _houndStill(e, dt, inWater, night);         // by its owner: at night it sleeps there
}
// standing where it is: out of water first, and asleep at night
function _houndStill(e, dt, inWater, night) {
  if (inWater) return _houndSwimOut(e, dt);
  if (night) { e._sleep = true; e._rest = 'lie'; }
  return 0;
}
// out of water the grazer's way: a new heading every moment until it finds the bank
function _houndSwimOut(e, dt) {
  e.escapeT -= dt;
  if (e.escapeT <= 0) { e.escapeT = 0.8; e.yaw += 1.2; }
  return HOUND.walk * 1.5;
}
/* A wild one: a player in survival within HOUND.sees is hunted (one who struck it, from up to HOUND.givesUp), unless
   they hold a lava mushroom, which it stands and watches. Otherwise it wanders its patch like any animal, and at night
   sleeps: then (`slept`) it notices a player only within HOUND.wakeR, or one who struck it. */
function _houndWild(e, dt, tp, inWater, slept) {
  const prey = !!tp && !tp.canFly && !tp.dead;
  const dx = tp.pos.x - e.x, dz = tp.pos.z - e.z, d = Math.hypot(dx, dz);
  const near = prey && Math.abs(tp.pos.y - e.y) < 10 && (d <= (slept ? HOUND.wakeR : HOUND.sees) || (e.aggroT > 0 && d <= HOUND.givesUp));
  const soothed = near && !e.noTame && !(e.aggroT > 0) && _houndHeldBy(tp) === B.LAVA_MUSHROOM;
  // what bit it (somebody's hound, a monster it was set on) is fought back, unless a player to hunt is the nearer
  const hb = e._hurtBy;
  if (hb && performance.now() - (e._hurtByAt || 0) < HOUND.targetS * 1000 && _foeAlive(hb)) {
    const bx = hb.x - e.x, bz = hb.z - e.z, bd = Math.hypot(bx, bz);
    if (!(near && !soothed && d < bd))
      return _houndGoBite(e, hb.x, hb.y, hb.z, entAttackRange(e, { R: entR(hb) }), inWater, false, () => _houndBiteMob(e, hb, bx, bz, bd));
  }
  if (near && !soothed)
    return _houndGoBite(e, tp.pos.x, tp.pos.y, tp.pos.z, entAttackRange(e, tp), inWater, false, () => _houndBitePlayer(e, tp, dx, dz, d));
  if (e.state === 'chase') { e.state = 'wander'; e.aggroT = 0; e.wanderT = 0; }
  if (inWater) return _houndSwimOut(e, dt);
  // it stands where it is and follows the mushroom with its head (it turned its whole body before)
  if (soothed) { e._watch = tp; e.state = 'stay'; return 0; }
  if (_houndNight()) { e._sleep = true; e._rest = 'lie'; e.state = 'idle'; return 0; }
  e.wanderT -= dt;
  if (e.wanderT <= 0) {
    e.wanderT = 2 + Math.random() * 5;
    e.state = Math.random() < 0.45 ? 'idle' : 'wander';
    if (e.state === 'wander') e.yaw = Math.random() * Math.PI * 2;
  }
  const hdx = e.hx - e.x, hdz = e.hz - e.z;
  if (Math.hypot(hdx, hdz) > ENT_HOME_RANGE) { e.yaw = Math.atan2(hdx, hdz); e.state = 'wander'; }
  return e.state === 'wander' ? HOUND.walk : 0;
}
// straight at it at a run, and a bite once in reach; `staying`: it bites from where it is and does not give chase
function _houndGoBite(e, tx, ty, tz, reach, inWater, staying, bite) {
  const dx = tx - e.x, dz = tz - e.z;
  e.yaw = Math.atan2(dx, dz);
  /* `_hunt`: it is after something (its pose). `_bold`: and goes off a ledge or into water for it. Only a WILD one
     is that reckless: somebody's hound stops at a long drop and at water, or prey bolting off a cliff took
     the hound down with it. */
  e.state = 'chase'; e._hunt = true; e._bold = !staying && !(e.tame || e.taming);
  if (Math.hypot(dx, dz) < reach && Math.abs(ty - e.y) < 2) {
    if (e.atkCd <= 0) { e.atkCd = HOUND.atkCd; e.atkAnimT = ENT_ATK_ANIM; bite(); }
    return 0;
  }
  return staying ? 0 : HOUND.run * (inWater ? 0.5 : 1);
}
function _houndBitePlayer(e, tp, dx, dz, d) {
  const before = tp.hp;
  _mobStrikePlayer(e, tp, houndDmg(e), dx, dz, d);
  playSound('hit', { gain: 0.7, rate: 0.85, pos: { x: tp.pos.x, y: tp.pos.y + 1, z: tp.pos.z } });
  if (tp.hp < before && houndLit(e)) {              // a shield that stopped the bite stops the fire too
    if (!(tp.fireT > 0)) playSound('fireIgnite', { gain: 0.8, pos: { x: tp.pos.x, y: tp.pos.y, z: tp.pos.z } });
    tp.fireT = Math.max(tp.fireT || 0, HOUND.fireS);
  }
}
function _houndBiteMob(e, foe, dx, dz, d) {
  _mobHitsMob(e, foe, houndDmg(e), dx, dz, d);       // the blow, the shove, the sound; its death is the hound's kill
  if (foe.hp > 0 && houndLit(e) && foe.kind !== 'hellhound') {
    if (!(foe.fireT > 0)) playSound('fireIgnite', { gain: 0.7, pos: { x: foe.x, y: foe.y + 1, z: foe.z } });
    foe.fireT = Math.max(foe.fireT || 0, HOUND.fireS);
    foe._fireBy = e;                                 // burnt to death by this fire, it is the hound's kill still
  }
}
/* The creature a tamed (or being-tamed) hound is fighting, or null. One it has is kept while it lives and stays near;
   with none it looks again every FOE_RETHINK. A taming behaves as 'attack'. Never a boss, a fish, or anything a
   player has claimed (a tamed horse, another hound). */
function _houndFoe(e, owner, dt) {
  const mode = e.taming ? 'attack' : e.mode;
  const dist = (f) => Math.hypot(f.x - e.x, f.z - e.z);
  const ok = (f) => f !== e && _foeAlive(f) && !f.boss && !isFish(f) && !isClaimed(f);
  if (mode === 'passive') { e._foe = null; return null; }
  if (e._foe && !(ok(e._foe) && dist(e._foe) <= HOUND.targetR + 6)) e._foe = null;
  if (e._foe) return e._foe;
  e._foeT = (e._foeT || 0) - dt;
  if (e._foeT > 0) return null;
  e._foeT = FOE_RETHINK;
  const now = performance.now(), fresh = (at) => now - (at || 0) < HOUND.targetS * 1000;
  let f = null;
  if (e._hurtBy && fresh(e._hurtByAt) && ok(e._hurtBy)) f = e._hurtBy;                       // what bit it
  if (!f && owner && owner._hitBy && fresh(owner._hitByAt) && ok(owner._hitBy)) f = owner._hitBy;   // what struck its owner
  if (!f && mode === 'attack' && owner && owner._houndTarget && fresh(owner._houndTargetAt) && ok(owner._houndTarget))
    f = owner._houndTarget;                                                                  // what its owner struck
  if (f && dist(f) > HOUND.targetR) f = null;
  if (!f && mode === 'aggressive') {
    let bd = HOUND.aggroR;
    for (const c of ENTITIES) { if (!ok(c)) continue; const d = dist(c); if (d < bd) { bd = d; f = c; } }
  }
  e._foe = f;
  return f;
}
// a player's blow on a hound (damageEntity): a wild one is set on them; one of somebody's only takes it
function houndStruckByPlayer(e, p) {
  if (e.tame || e.taming) return;
  e.aggroT = HOUND.aggroTime; e.state = 'chase';
}
// lava is no hazard to it; cactus, water and a drop that would hurt still are (the grazer's _entHazard otherwise)
function houndHazard(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  for (let dy = 0; dy <= 1; dy++) if ((getBlock(fx, Math.floor(y + dy), fz) & 255) === B.CACTUS) return true;
  if (isWaterVal(getBlock(fx, fy, fz))) return true;
  let d = 0;
  while (d <= ENT_LEDGE_MAX && fy - 1 - d >= 0) {
    const bv = getBlock(fx, fy - 1 - d, fz), bid = bv & 255;
    if (isWaterVal(bv)) return true;
    if (bid === B.LAVA || CORE.solidVal(bv)) break;
    d++;
  }
  return d > ENT_LEDGE_MAX;
}

/* ---------------------------------- its body ----------------------------------
   Once a step, after it has moved. Returns true when it died (the caller drops what it leaves and removes it). */
const _HOUND_NEAR = [[0, 0, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
function houndBody(e, dt, inWater, inLava) {
  const maxHp = entMaxHp(e);
  const bx = Math.floor(e.x), by = Math.floor(e.y + 0.3), bz = Math.floor(e.z);
  // its drink is fire: standing in lava, or with lava or a fire in its own cell or one beside it
  let hot = inLava;
  if (!hot) for (const [dx, dy, dz] of _HOUND_NEAR) {
    const id = getBlock(bx + dx, by + dy, bz + dz) & 255;
    if (id === B.LAVA || id === B.FIRE) { hot = true; break; }
  }
  if (hot) e.thirst = Math.min(HOUND.fire, entThirst(e) + HOUND.fireFill * dt);
  /* the cold burns its fire faster (on top of the slow burn every creature's thirst has, entities/update.js), by the air
     there, looked at every 2 s; asleep it comes back slowly */
  e._coldT = (e._coldT || 0) - dt;
  if (e._coldT <= 0) {
    e._coldT = 2;
    const t = typeof airTempAt === 'function' ? airTempAt(bx, by, bz).t : 20;
    e._coldK = Math.max(0, Math.min(1, (HOUND.coldFrom - t) / (HOUND.coldFrom - HOUND.coldTo)));
  }
  const fire = (e._sleep ? HOUND.sleepFire : 0) - (e._coldK || 0) * HOUND.coldBurn * ENT_THIRST_DECAY;
  if (fire) e.thirst = Math.max(0, Math.min(HOUND.fire, entThirst(e) + fire * dt));
  // healing: lava it stands in, and the spell a fire eaten leaves
  let heal = inLava ? HOUND.lavaHeal : 0;
  if (e.regenBoost > 0) { e.regenBoost -= dt; heal += HOUND.regenHps; }
  if (heal > 0 && e.hp > 0 && e.hp < maxHp) {
    e.hp = Math.min(maxHp, e.hp + heal * dt);
    e._healFx = (e._healFx || 0) + heal * dt;
    if (e._healFx >= 10) { e._healFx = 0; if (typeof fxHearts === 'function') fxHearts(e.x, e.y + 1.0, e.z, true, 2); }
  }
  if (!houndLit(e)) e._regenT = 0;                   // its fire out: it does not mend on its own (updateEntities' regen)
  // water and rain: after a while they hurt, slowly
  e._rainT = (e._rainT || 0) - dt;
  if (e._rainT <= 0) {
    e._rainT = 1;
    e._rain = !inWater && typeof precipAt === 'function' && precipAt(e.x, e.z, e.y).rain > 0.3
              && getSkyWorld(bx, Math.floor(e.y + 1), bz) >= 15;
  }
  if (inWater || e._rain) {
    e.wetT = (e.wetT || 0) + dt;
    if (e.wetT > HOUND.wetGrace) {
      e.wetHit = (e.wetHit || 0) + dt;
      if (e.wetHit >= HOUND.wetEvery) {
        e.wetHit = 0; e.hp -= HOUND.wetDmg; e.hurtT = 0.2;
        playSound('fireOff', { gain: 0.5, pos: { x: e.x, y: e.y + 0.6, z: e.z } });
        if (typeof _fxSmoke === 'function') _fxSmoke(e.x, e.y + 0.9, e.z, 0.8, 1, 0.6);
        if (e.hp <= 0) return true;
      }
    }
  } else { e.wetT = Math.max(0, (e.wetT || 0) - dt * 2); e.wetHit = 0; }
  // a fire on the ground: one of somebody's that is not whole goes to it and eats it
  if (e.tame || e.taming) {
    e.pickCd = (e.pickCd || 0) - dt;
    if (e.pickCd <= 0) { e.pickCd = 0.4; _houndLookForFire(e, maxHp); }
  }
  return false;
}
function _houndLookForFire(e, maxHp) {
  e._fireAt = null;
  if (!(e.hp < maxHp - 0.5) || typeof DROPS === 'undefined') return;
  let best = null, bi = -1, bd = HOUND.seekR * HOUND.seekR;
  for (let i = DROPS.length - 1; i >= 0; i--) {
    const d = DROPS[i];
    if (d.id !== ITEM.FIRE || d.age < d.pickupDelay) continue;
    const p = d.group.position, dx = p.x - e.x, dy = p.y - (e.y + 0.5), dz = p.z - e.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bd) { bd = d2; best = d; bi = i; }
  }
  if (!best) return;
  if (bd > HOUND.pickR * HOUND.pickR) { e._fireAt = { x: best.group.position.x, z: best.group.position.z }; return; }
  if ((best.count || 1) > 1) _dropSetCount(best, best.count - 1); else removeDrop(bi);
  houndEat(e, ITEM.FIRE);
}
/* It eats: food by HOUND_FOOD, its fire by HOUND_FIRE_FROM. A fire makes one being tamed whole at once, and starts
   a spell of healing in a tamed one. */
function houndEat(e, id) {
  e.hunger = Math.min(HOUND.food, entHunger(e) + (HOUND_FOOD[id] || 0));
  e.thirst = Math.min(HOUND.fire, entThirst(e) + (HOUND_FIRE_FROM[id] || 0));
  if (id === ITEM.FIRE) {
    if (e.taming) e.hp = entMaxHp(e); else if (e.tame) e.regenBoost = HOUND.regenS;
    if (typeof fxHearts === 'function') fxHearts(e.x, e.y + 1.0, e.z, true, 3);
  }
  playSound('chew', { gain: 0.8, rate: 0.85, pos: { x: e.x, y: e.y + 0.8, z: e.z } });
  entEatStart(e, id);                                // it stands a moment chewing it (houndPose)
}

/* ---------------------------------- kills by fire ----------------------------------
   `by`: the hound that killed it (its bite, or the fire its bite left), or the player whose fire did (a torch's
   blow, the fire that player set on it or placed under it). Called from the three places a death is decided:
   damageEntity, damageEntityByMob and _entBurnDeath (entities/entities.js). The body leaves a fire, and the kill counts
   for a taming: the hound's own for itself (poor), a player's for every hound of theirs being tamed near (good). */
const _houndKillKind = (f) => { const g = mobOf(f).group; return g === 'animal' ? 'a' : g === 'monster' ? 'm' : g === 'villager' ? 'n' : null; };
function fireKillBy(victim, by) {
  if (!victim || !by || victim._fireKilled) return;
  victim._fireKilled = true;                         // once, whichever way its death is reported
  for (let n = rollLoot(LOOT.fireKill); n > 0; n--)
    spawnDrop(ITEM.FIRE, Math.floor(victim.x), Math.floor(victim.y + 0.5), Math.floor(victim.z),
      { x: (Math.random() - 0.5) * 2.5, y: 2.4 + Math.random(), z: (Math.random() - 0.5) * 2.5 }, 0.6);
  const kind = _houndKillKind(victim);
  if (!kind) return;
  if (by.kind === 'hellhound') { if (by.taming) _houndCount(by, kind, true); return; }
  for (const h of [...ENTITIES])
    if (h.kind === 'hellhound' && h.taming && houndOwner(h) === by && Math.hypot(h.x - victim.x, h.z - victim.z) <= HOUND.creditR)
      _houndCount(h, kind, false);
}
const _houndNeed = (kind) => kind === 'a' ? HOUND.needAnimals : kind === 'm' ? HOUND.needMonsters : HOUND.needNpcs;
// how many of a kind alone would do, for this taming (`gh`: what a kill counts, HOUND.gentle with Gentle Hand)
const _houndNeedOf = (t, kind) => Math.ceil(_houndNeed(kind) / ((t && t.gh) || 1) - 1e-6);
// how far its day of kills has come, 0..1
function houndTameProg(h) {
  const t = h.taming;
  if (!t) return h.tame ? 1 : 0;
  const k = t.gh || 1;
  return Math.min(1, ((t.a | 0) / HOUND.needAnimals + (t.m | 0) / HOUND.needMonsters + (t.n | 0) / HOUND.needNpcs) * k);
}
/* What its taming is worth, 0.1..1: 100% to begin with, less what its own kills took (`lost`) and what it
   was hurt. Until 0.8451 it was the kills' average worth, so the first kill the hound made dropped it to 50% at once. */
function houndTameEff(h) {
  const t = h.taming;
  if (!t) return h.eff > 0 ? h.eff : 1;
  return Math.max(0.1, Math.min(1, 1 - (t.lost || 0) - (t.hurt || 0) / entMaxHp(h) * HOUND.hurtCost));
}
// a kill counted for its taming; `own`: the hound made it itself, which costs its share of HOUND.ownKillCost
function _houndCount(h, kind, own) {
  const t = h.taming, cost = own ? HOUND.ownKillCost * (t.gh || 1) / _houndNeed(kind) : 0;
  t[kind] = (t[kind] | 0) + 1;
  t.lost = (t.lost || 0) + cost;
  const owner = houndOwner(h);
  _houndFx(h, 2);
  if (houndTameProg(h) >= 1) { _houndTamed(h, owner); return; }
  _houndTell(owner, `Taming the hellhound: ${Math.round(houndTameProg(h) * 100)}% · ` +
    (own ? `its own kill, -${Math.round(cost * 100)}%` : 'a kill by fire') + ` · effectiveness ${Math.round(houndTameEff(h) * 100)}%`);
}
const HOUND_NAME_TP = { label: 'hellhound', statLine: (e) => houndStatLine(e) };
function _houndTamed(h, owner) {
  const eff = houndTameEff(h);
  h.tame = true; h.taming = null; h.eff = +eff.toFixed(2);
  h.mode = 'defense'; h.stance = 'follow'; h.modeNext = null; h._foe = null;
  h.stats = { maxHp: Math.round(HOUND.hp + HOUND.boostHp * eff), dmg: Math.round(HOUND.dmg + HOUND.boostDmg * eff) };
  h.hp = h.stats.maxHp;
  playSound('chestOpen', { gain: 0.7, rate: 1.4, pos: { x: h.x, y: h.y + 1, z: h.z } });
  _houndFx(h, 6);
  const tell = () => {
    toast(`tamed the hellhound! effectiveness ${Math.round(eff * 100)}%`);
    addXP(XP_TAME + XP_TAME_PER_LEVEL * (h.level | 0), 'taming');
    if (typeof openNameDialog === 'function') openNameDialog(h, HOUND_NAME_TP);
  };
  if (owner && typeof withPlayer === 'function') withPlayer(owner, tell); else tell();
}
// its day ran out: it is wild again, set on the player who failed it, and done with mushrooms
function _houndTameFailed(h, owner) {
  h.taming = null; h.noTame = true; h.owner = null; h.ownerId = null; h._foe = null;
  h.aggroT = HOUND.aggroTime; h.state = 'chase';
  _houndTell(owner, 'The hellhound waited a day for its kills: it turns on you', true);
}
// one of somebody's died (_removeEntity, entities/entities.js)
function houndLost(e) {
  _houndTell(houndOwner(e), `${e.name} is dead`, 'crit');
}

/* ---------------------------------- once a world step ----------------------------------
   For every hound of somebody's, simulating or parked far away: a taming's day counts down, and one told to follow
   that is left HOUND.teleport behind (or whose chunk went out of range) comes to its owner. */
function houndWorldTick(dt) {
  for (const e of ENTITIES) {
    if (e.kind !== 'hellhound' || !(e.tame || e.taming)) continue;
    const owner = houndOwner(e);
    if (e.taming) {
      if (!e._sleep) e.taming.left -= dt;            // its day counts only while it is awake
      if (e.taming.left <= 0) { _houndTameFailed(e, owner); continue; }
    }
    if (!owner || !owner.spawned || owner.dead) continue;
    if (e.tame && e.stance !== 'follow') continue;
    const parked = e.active === false;
    if (!parked && e._foe) continue;                 // in a fight: it finishes that first
    const dx = owner.pos.x - e.x, dz = owner.pos.z - e.z;
    if (!parked && dx * dx + dz * dz < HOUND.teleport * HOUND.teleport && Math.abs(owner.pos.y - e.y) < 24) continue;
    _houndComeTo(e, owner);
  }
}
// to a standing spot a few blocks from its owner; none found (they are in the air, or at sea), it tries again next step
function _houndComeTo(e, owner) {
  const ox = owner.pos.x, oy = Math.floor(owner.pos.y + 0.01), oz = owner.pos.z;
  let spot = null;
  _useBox(e);
  for (let k = 0; k < 16 && !spot; k++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 2.5;
    const x = Math.floor(ox + Math.sin(a) * r) + 0.5, z = Math.floor(oz + Math.cos(a) * r) + 0.5;
    for (let y = oy + 2; y >= oy - 3; y--) {
      if (!CORE.solidVal(getBlock(Math.floor(x), y - 1, Math.floor(z)))) continue;
      if ((getBlock(Math.floor(x), y, Math.floor(z)) & 255) !== B.WATER && !_entBlocked(x, y, z)) spot = { x, y, z };
      break;
    }
  }
  _useBox(null);
  if (!spot) return false;
  if (typeof fxPuff === 'function' && e.active !== false) fxPuff(e.x, e.y + 0.6, e.z, [1, 0.5, 0.15], 10, 1.2);
  e.x = spot.x; e.y = spot.y; e.z = spot.z; e.vy = 0; e.kx = 0; e.kz = 0;
  e.peakY = null; e.stuckT = 0; e._px = undefined; e._foe = null; e._fireAt = null; e._lerp = null;
  e.model.root.position.set(e.x, e.y, e.z);
  if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 0.6, e.z, [1, 0.5, 0.15], 10, 1.2);
  return true;
}

/* ---------------------------------- the player's hand on it ----------------------------------
   From _doPlace, ahead of everything else a right click does. Returns true when the click was the hound's. */
function tryHoundInteract() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return false;
  if (typeof nameDialogOpen === 'function' && nameDialogOpen()) return false;
  const e = pickEntity(ENT_INTERACT_REACH);
  if (!e || e.kind !== 'hellhound') return false;
  const slot = HOTBAR[hotbarSel], held = slotId(slot);
  if (!e.tame && !e.taming && held !== B.LAVA_MUSHROOM) return false;   // a wild one, and nothing it wants: the click passes on
  if (act && act.place) return true;                 // fresh presses only, never the held button's repeat
  const spend = () => {
    if (player.canFly) return;
    slot.count--;
    if (slot.count <= 0) HOTBAR[hotbarSel] = null;
    saveHotbar(); buildHotbar(); updateHotbar();
  };
  if (!e.tame && !e.taming) {
    if (e.noTame) { toast('This hellhound takes no more mushrooms'); return true; }
    spend();
    const gh = typeof hasSkill === 'function' && hasSkill('gentleHand') ? HOUND.gentle : 1;   // Gentle Hand
    e.taming = { left: HOUND.tameS, a: 0, m: 0, n: 0, lost: 0, hurt: 0, gh };
    e.owner = player; e.ownerId = player.profileId || null;
    e.aggroT = 0; e.state = 'idle'; e._foe = null; e._hpWas = e.hp;
    houndEat(e, held);
    _houndFx(e, 3);
    const t = e.taming;
    toast(`The hellhound takes the mushroom. It wants kills within a day awake: ${_houndNeedOf(t, 'a')} animals, ${_houndNeedOf(t, 'm')} monsters or ${_houndNeedOf(t, 'n')} villagers. Strike what it should hunt. Each kill it makes itself costs effectiveness; a kill you make with fire costs none`);
    return true;
  }
  if (houndOwner(e) !== player) { toast(`${e.name} answers to someone else`); return true; }
  // food first, when it has room for it (a fire also when it is hurt or its own fire is low)
  if (HOUND_FOOD[held] > 0 && (entHunger(e) < HOUND.food - 0.5
      || (held === ITEM.FIRE && (e.hp < entMaxHp(e) - 0.5 || entThirst(e) < HOUND.fire - 0.5)))) {
    spend();
    houndEat(e, held);
    toast(`${e.name} ate: food ${Math.round(entHunger(e))}/${HOUND.food} · fire ${Math.round(entThirst(e))}/${HOUND.fire}`);
    return true;
  }
  if (!e.tame) { toast(`Taming: ${houndTamingLine(e)}`); return true; }
  if (player.sneaking) {
    e.stance = HOUND_STANCES[(HOUND_STANCES.indexOf(e.stance) + 1) % HOUND_STANCES.length];
    e._following = false;
    toast(`${e.name}: ${e.stance}`);
    return true;
  }
  // the next behaviour after the one pressed for (or the one it has): it takes hold HOUND.modeWait after the last press
  const next = HOUND_MODES[(HOUND_MODES.indexOf(e.modeNext || e.mode) + 1) % HOUND_MODES.length];
  if (next === e.mode) { e.modeNext = null; toast(`${e.name}: stays ${e.mode}`); }
  else { e.modeNext = next; e.modeT = HOUND.modeWait; toast(`${e.name}: ${next} in ${HOUND.modeWait} s`); }
  return true;
}

/* ---------------------------------- what the crosshair says ---------------------------------- */
const houndStatLine = (e) =>
  `health ${Math.ceil(e.hp)}/${entMaxHp(e)} · damage ${houndDmg(e)} · food ${Math.round(entHunger(e))}/${HOUND.food}` +
  ` · fire ${Math.round(entThirst(e))}/${HOUND.fire}` + (e._sleep ? ' · asleep' : '');
function houndTamingLine(e) {
  const t = e.taming;
  return `${Math.round(houndTameProg(e) * 100)}% · effectiveness ${Math.round(houndTameEff(e) * 100)}% · ${_mmss(t.left)} left` +
         (e._sleep ? ' (asleep: stopped)' : '') +
         ` · animals ${t.a | 0}/${_houndNeedOf(t, 'a')}, monsters ${t.m | 0}/${_houndNeedOf(t, 'm')}, villagers ${t.n | 0}/${_houndNeedOf(t, 'n')}`;
}
// the second line of the name over it, read from further away (entitySubText, ui/animals.js)
function houndSubText(e) {
  if (e.taming) return `taming ${Math.round(houndTameProg(e) * 100)}% · ${_mmss(e.taming.left)}`;
  if (e.tame) return `${e.modeNext ? e.mode + ' > ' + e.modeNext : e.mode} · ${e.stance}`;
  return '';
}
// the lines under the crosshair within reach (tameablePrompt, ui/animals.js)
function houndPrompt(e) {
  const head = entityHead(e), dim = (s) => `<span style="opacity:.8;font-size:.9em">${s}</span>`;
  if (e.taming) return `${head}<br>${dim('taming ' + houndTamingLine(e))}`;
  if (!e.tame) return `${head}<br>${dim(e.noTame ? '(takes no more mushrooms)' : `(tamable with ${PROPS[B.LAVA_MUSHROOM].name})`)}`;
  const mode = e.modeNext ? `${e.mode} > ${e.modeNext} (${Math.max(0, e.modeT).toFixed(1)} s)` : e.mode;
  const pet = typeof _petHint === 'function' ? ' · ' + _petHint() : '';        // E pets it (entities/taming.js)
  return `${head}<br>${dim(houndStatLine(e))}<br>${dim(`behaviour: <b>${mode}</b> (use) · stance: <b>${e.stance}</b> (sneak + use)${pet}`)}`;
}

/* ---------------------------------- the save ---------------------------------- */
function houndSave(e) {
  const t = e.taming;
  return {
    sz: e.size, g: e.gender, lv: e.level, h: +entHunger(e).toFixed(1), th: +entThirst(e).toFixed(1),
    t: e.tame ? 1 : 0, nt: e.noTame ? 1 : 0, o: e.ownerId || null, md: e.mode, sc: e.stance, ef: e.eff || 0,
    st: e.tame && e.stats ? e.stats : null,
    // [seconds left, animals, monsters, villagers, effectiveness lost to its own kills, 0, health lost, what a kill counts].
    // The 0: a 0.845 save kept the kills' worth and weight in places 4 and 5 (houndRestore turns those into what was lost)
    tm: t ? [Math.round(t.left), t.a | 0, t.m | 0, t.n | 0, +(t.lost || 0).toFixed(3), 0, Math.round(t.hurt || 0), t.gh || 1] : null,
  };
}
// `s`: what its save row held (the creature table's `load`, entities/mobs.js); `s.d` is what houndSave wrote
function houndRestore(s) {
  const d = s.d;
  const st = d.st && d.st.maxHp > 0 ? { maxHp: +d.st.maxHp, dmg: +d.st.dmg || HOUND.dmg } : null;
  const tm = !d.t && Array.isArray(d.tm) && d.tm[0] > 0
    ? { left: +d.tm[0], a: d.tm[1] | 0, m: d.tm[2] | 0, n: d.tm[3] | 0,
        lost: d.tm[5] > 0 ? Math.max(0, (+d.tm[5] || 0) - (+d.tm[4] || 0)) : (+d.tm[4] || 0),   // weight less worth
        hurt: +d.tm[6] || 0, gh: +d.tm[7] > 1 ? +d.tm[7] : 1 } : null;
  return summon('hellhound', s.x, s.y, s.z, {
    hp: s.hp,
    size: d.sz, gender: d.g, level: d.lv, hunger: d.h, thirst: d.th,
    tame: !!d.t, noTame: !!d.nt, ownerId: d.o, mode: d.md, stance: d.sc, eff: d.ef, stats: st, taming: tm,
    name: s.name, hx: s.hx, hz: s.hz,
  });
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in HOUND,
   which this file reads directly. No `fleeTime`: a hound does not bolt when it is hit. `flee` is never used (its
   heading and speed come from houndThink); it is there because every grazer has one. */
defineMob('hellhound', {
  name: 'Hellhound', group: 'monster', body: 'grazer', hungerMul: 0.5,
  maxHp: (e) => (e.stats && e.stats.maxHp) || HOUND.hp,   // raised by its taming
  box: [0.4, 1.05], sized: true,
  walk: HOUND.walk, flee: HOUND.run,
  make: makeHellhound, gendered: true, build: () => buildHellhound(),
  roll: rollHellhounds,                                // its own rule: packs in the Deep Desert, far apart
  save: houndSave, load: houndRestore,
  spared: true, prompt: houndPrompt, subText: houndSubText,   // its owner's swing passes it; its lines on screen
  butcher: true,                                       // the Butcher skill adds to its drop, though it is no animal
  loot: (e, pop, first) => first(ITEM.FIRE, LOOT.houndFire),   // the fire it was made of
});
