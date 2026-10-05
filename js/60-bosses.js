'use strict';
/* voxiGrof — bosses (0.839)

   THE FROZEN KING, the first boss. Once a man, long ago; now a gaunt shape of blue-white frost and grey metal that
   floats a little above the ground, a frozen golden crown on its head, light-blue glowing eyes, a blue shield in its
   left hand. Not placed anywhere yet (its snow castle is still being built): with F3 open, F8 summons one in front of
   you, in any mode (bossDebugSummon). Not saved with the world: the castle will place it.

   It is a creature like the others (ENTITIES, kind 'frozen_king', `e.boss`), so a sword, an arrow, the name tag and
   the hit test all reach it; updateEntities hands it to updateBoss instead of the creature AI (28), and
   damageEntity hands its hits to bossTakeHit. Its fireballs, ice spikes, carpets and beams are BOSS_FX, stepped in
   simTick (updateBossFx) and drawn between ticks like dropped items (_tickPoses, 22).

   Every FK.ATTACK_CD seconds it picks what to do, by weight, from what is ready: the cold fireball (always ready,
   by far the most likely), ice spikes from above, a flight round you that leaves burning snow under you, and below
   half health five homing beams. Its shield goes up for SHIELD_UP_S and down for SHIELD_DOWN_S on its own clock.

   Killing it gives every player near (survival) a level of BOSS BOOST, once per kind of boss, at most 5: +20% XP a
   level (bossXpMul, read by addXP in 35). It is kept in the player's feats (35), so death and milk never take it.
   The last starter quest (47) is to kill it: 2000 XP, paid after the boost lands, so the boost already counts. */

const FK = {
  HP: 2000, SHIELD: 200, KNOCK_MUL: 0.5,         // health, shield points, 50% less knockback ("50 toughness")
  BOX: [0.55, 2.75],                             // hit box: radius, height (ENT_BOX, 28)
  HOVER: 0.45, BOB: 0.08,                        // floats this far over the ground, bobbing this much
  SPEED: 2.4, NEAR: 5, FAR: 11,                  // keeps between NEAR and FAR blocks from its target
  // with nobody to fight it wanders (0.83912): spots within WANDER_R of where it was placed, at 40% of its speed,
  // resting 2-6 s at each
  WANDER_R: 10, WANDER_SPEED: 0.4, WANDER_REST_MIN: 2, WANDER_REST_MAX: 6, WANDER_GIVE_UP: 12,
  SEE: 32, LOSE: 48,                             // notices a player within SEE, forgets them past LOSE
  ATTACK_CD: 5,                                  // seconds between two attacks of any kind
  // the cold fireball: straight at where you stood, 40 on the hit, and you burn for 50 more (5 a second, 10 s)
  BALL_SPEED: 16, BALL_HIT: 40, BALL_FIRE_S: 10, BALL_LIFE: 4, BALL_R: 0.45,
  // the shield: up 10 s, down 10 s; broken at 0, it comes back 20 s after its last hit, full over 60 s
  SHIELD_UP_S: 10, SHIELD_DOWN_S: 10, SHIELD_REGEN_WAIT: 20, SHIELD_REGEN_S: 60, SHIELD_FRONT: 0.5,   // cos 60°
  // ice spikes: 3-5 hang over and round you, shake, fall; 100 and a big shove, then 5 s of less jump and regen
  SPIKES_CD: 45, SPIKES_MIN: 3, SPIKES_MAX: 5, SPIKE_SPREAD: 3.5, SPIKE_UP: 12, SPIKE_OPEN_SKY: 9,
  SPIKE_HIT: 100, SPIKE_KNOCK: 2.6, SPIKE_HOP: 7, SPIKE_DAZE_S: 5, SPIKE_WAIT_MIN: 0.7, SPIKE_WAIT_MAX: 1.8,
  // the flight: it circles you up high and leaves 4-8 burning snow carpets under you; each lasts 8 s,
  // sets you alight and takes 2 every 0.1 s you stand on it
  FLY_CD: 30, FLY_S: 4.5, FLY_R: 6, FLY_UP: 5, CARPETS_MIN: 4, CARPETS_MAX: 8, CARPET_S: 8, CARPET_R: 0.95,
  CARPET_HIT: 2, CARPET_EVERY: 0.1, CARPET_FIRE_S: 3,
  // under half health: five beams that home in on you, 100 each
  BEAMS_CD: 40, BEAMS: 5, BEAM_HIT: 100, BEAM_SPEED: 11, BEAM_TURN: 2.4, BEAM_LIFE: 7,
  // the curse: close to it you cannot mine and the cold gets in 30% more; renewed every 0.1 s, so milk only
  // helps once you are out of reach
  CURSE_R: 12, CURSE_EVERY: 0.1, CURSE_HOLD: 0.6,
  // how often each is picked when ready (the stronger, the rarer)
  W_BALL: 6, W_SPIKES: 2, W_FLY: 2, W_BEAMS: 1.5,
  CREDIT_R: 64,                                  // players this close when it dies get the boss boost
};
const BOSS_BOOST_MAX = 5, BOSS_BOOST_STEP = 0.2;
ENT_BOX.frozen_king = FK.BOX;                    // its size for hits and arrows (entR/entH, 28)
const BOSS_BAR_R = 48;                           // its health bar shows within this many blocks

/* ---- effects (54's EFFECT_DEFS): read by the stats as any effect is ---- */
/* `aura` (0.83913): kept up by the king, not timed, so the bar shows this label and the Effects list its `lasts` */
EFFECT_DEFS.frozenCurse = { name: 'Frozen curse', good: false, icon: '👑', miningSpeed: -1, coldResist: -0.3, aura: 'near',
  desc: 'Mining speed -100%: you cannot mine. Cold resistance -30%.',
  lasts: `Lasts while you are within ${FK.CURSE_R} blocks of the Frozen King. Milk lifts it, but he puts it back at once while you are near him.` };
EFFECT_DEFS.iceDaze = { name: 'Ice daze', time: FK.SPIKE_DAZE_S, good: false, icon: '🧊', jumpStrength: -0.3, regen: -0.2,
  desc: 'Jump height -30%. Regen -20%.',                                   // read like the curse's (0.83914)
  lasts: `${FK.SPIKE_DAZE_S} s from the hit of the Frozen King's ice spike. Milk lifts it.` };
EFFECT_DEFS.bossBoost = { name: 'Boss boost', good: true, icon: '🏆',
  lasts: 'For good: every kind of boss you defeat adds a level (up to 5). Death and milk do not take it.' };

/* ---- boss boost ---- */
function _bossFeats(p) {
  if (!p) return null;
  return p._feats || (p._feats = restoreFeats(null));
}
const bossKilledBy = (p, kind) => { const f = p && p._feats; return !!(f && f.bosses && f.bosses.has(kind)); };
const bossBoostLevel = (p = player) => { const f = p && p._feats; return f && f.bosses ? Math.min(BOSS_BOOST_MAX, f.bosses.size) : 0; };
const bossXpMul = (p = player) => 1 + BOSS_BOOST_STEP * bossBoostLevel(p);
// the bosses this player has beaten, by name (the boost's line in Effects, 54; 0.83915)
const BOSS_NAMES = { frozen_king: 'Frozen King' };
const bossBoostNames = (p = player) => { const f = p && p._feats; return f && f.bosses ? [...f.bosses].map(k => BOSS_NAMES[k] || k) : []; };
// a boss of this kind defeated: one more level, the first time only (applied before the quest's XP is paid)
function _grantBossBoost(p, kind, name) {
  const f = _bossFeats(p);
  if (!f || f.bosses.has(kind)) return false;
  f.bosses.add(kind);
  withPlayer(p, () => {
    if (typeof feedInfo === 'function') feedInfo(`${name} defeated! Boss boost ${bossBoostLevel(p)}: XP x${bossXpMul(p).toFixed(1)}`);
    if (typeof fxLevelUp === 'function') fxLevelUp(p);
  });
  return true;
}

/* ---- the model ---- */
const _bossMat = (hex, opts = {}) => {
  const m = new THREE.MeshBasicMaterial({ color: hex, ...opts });
  m.userData.tint = new THREE.Color(hex);        // shadeHumanoid multiplies the light into this (28)
  return m;
};
const _bossGlow = (hex, opts = {}) => new THREE.MeshBasicMaterial({ color: hex, ...opts });   // lit by itself
function _bbox(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), mat);
  m.position.set(x * PX, y * PX, z * PX);
  return m;
}
function buildFrozenKing() {
  const frost = _bossMat(0xdcecf7), skin = _bossMat(0xc9e2f2), metal = _bossMat(0x7f8a96), dark = _bossMat(0x5c6672);
  const gold = _bossMat(0xd8b24c), rime = _bossMat(0xeef8ff);
  const ice = _bossMat(0x9fd3f0, { transparent: true, opacity: 0.78 });
  const shieldMat = _bossMat(0x3b86d8), rim = _bossMat(0xa8dcff), cape = _bossMat(0x51657a);
  const eye = _bossGlow(0x9cf0ff), gem = _bossGlow(0x7fe0ff);
  const root = new THREE.Group();
  const core = new THREE.Group();                // everything that floats and bobs
  root.add(core);
  // no legs any more: a frozen metal robe tapering into hanging ice
  core.add(_bbox(metal, 11, 6, 8, 0, 17, 0), _bbox(frost, 9, 6, 7, 0, 11, 0), _bbox(ice, 7, 6, 6, 0, 5, 0));
  core.add(_bbox(dark, 12, 1, 9, 0, 20.5, 0));   // a belt of dark iron
  const shards = [];
  for (const [x, z, h, rz] of [[-3, 2, 8, 0.12], [3, 2, 6, -0.1], [-3.5, -2, 7, -0.08], [3.5, -2, 9, 0.1], [0, 3, 5, 0], [0, -3, 7, 0.05]]) {
    const s = new THREE.Group();
    s.position.set(x * PX, 4 * PX, z * PX);
    const m = _bbox(ice, 1.6, h, 1.6, 0, -h / 2, 0);
    s.add(m);
    s.rotation.z = rz;
    core.add(s);
    shards.push(s);
  }
  // the body: a chest of frost under grey plate, an ice heart, a ragged cape
  const torso = new THREE.Group();
  torso.position.y = 21 * PX;
  core.add(torso);
  torso.add(_bbox(frost, 12, 12, 7, 0, 6, 0));
  torso.add(_bbox(metal, 10, 8, 1, 0, 7, 3.9), _bbox(dark, 12, 2, 7.6, 0, 1, 0));
  torso.add(_bbox(gem, 2.4, 2.4, 1, 0, 7.5, 4.6));
  torso.add(_bbox(cape, 11, 17, 0.8, 0, 3, -4));
  for (const s of [-1, 1]) {
    torso.add(_bbox(dark, 6, 4, 8.4, s * 8, 11, 0), _bbox(rime, 6, 1, 8.4, s * 8, 13.4, 0));   // pauldrons, frosted
    torso.add(_bbox(ice, 1.2, 3, 1.2, s * 10.4, 14.5, 2.6), _bbox(ice, 1.2, 2.2, 1.2, s * 10.4, 14, -2.6));   // icicle spikes on them
  }
  // the head: long and gaunt, a beard of icicles, the crown
  const head = new THREE.Group();
  head.position.y = 13 * PX;
  torso.add(head);
  head.add(_bbox(skin, 3.5, 2, 3.5, 0, 0.5, 0));                       // neck
  head.add(_bbox(skin, 7, 9, 7, 0, 6, 0));
  head.add(_bbox(frost, 7.4, 2, 7.4, 0, 9.6, 0));                      // a cap of frost
  for (const x of [-1.7, 1.7]) head.add(_bbox(eye, 1.7, 1, 0.6, x, 6.6, 3.7));
  head.add(_bbox(dark, 5, 1, 0.5, 0, 7.8, 3.7));                       // a hard brow over the eyes
  for (const [x, h] of [[-2, 3], [-0.7, 4.2], [0.7, 3.6], [2, 2.6]]) head.add(_bbox(ice, 1, h, 1, x, 1.5 - h / 2 + 1, 3.3));
  const crown = new THREE.Group();
  crown.position.y = 11 * PX;
  head.add(crown);
  crown.add(_bbox(gold, 8, 1.6, 1, 0, 0, 3.6), _bbox(gold, 8, 1.6, 1, 0, 0, -3.6), _bbox(gold, 1, 1.6, 8, 3.6, 0, 0), _bbox(gold, 1, 1.6, 8, -3.6, 0, 0));
  for (const [x, z, h] of [[-3.6, 3.6, 3], [3.6, 3.6, 3], [-3.6, -3.6, 3], [3.6, -3.6, 3], [0, 3.6, 4.2], [0, -3.6, 3], [3.6, 0, 3.4], [-3.6, 0, 3.4]]) {
    crown.add(_bbox(gold, 1, h, 1, x, h / 2 + 0.6, z), _bbox(rime, 1.2, 0.8, 1.2, x, h + 0.8, z));   // its points, frost on each
  }
  crown.add(_bbox(gem, 1.6, 1.6, 0.6, 0, 0.2, 4.2));                  // an ice stone in front
  crown.add(_bbox(ice, 2, 0.8, 1.2, -2, -1, 3.8), _bbox(ice, 1.2, 0.8, 1.2, 2.4, -0.9, -3.9));   // ice grown over it
  // long arms: frost above, grey gauntlets below, icy claws; the left one carries the shield
  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 8 * PX, 10 * PX, 0);
    g.add(_bbox(frost, 3, 9, 3, 0, -4.5, 0), _bbox(metal, 4, 8, 4, 0, -12.5, 0), _bbox(dark, 4.4, 1.2, 4.4, 0, -9, 0));
    for (const x of [-1, 0, 1]) g.add(_bbox(ice, 0.8, 2.4, 0.8, x, -17.6, 1));
    torso.add(g);
    return g;
  };
  const armR = arm(-1), armL = arm(1);
  // the shield, hung on the left hand: blue, a pale rim, a silver boss with an ice stone in it
  const shield = new THREE.Group();
  shield.position.set(0, -13 * PX, 3 * PX);
  shield.add(_bbox(shieldMat, 12, 16, 1.2, 0, 0, 0));
  shield.add(_bbox(rim, 13, 1.2, 1.6, 0, 7.6, 0), _bbox(rim, 13, 1.2, 1.6, 0, -7.6, 0), _bbox(rim, 1.2, 16, 1.6, 6.2, 0, 0), _bbox(rim, 1.2, 16, 1.6, -6.2, 0, 0));
  shield.add(_bbox(metal, 4, 4, 1.4, 0, 0, 0.6), _bbox(gem, 2, 2, 0.6, 0, 0, 1.4));
  armL.add(shield);
  // a cold glow in the casting (right) hand
  const orb = _bbox(gem, 2.2, 2.2, 2.2, 0, -18, 1.5);
  orb.visible = false;
  armR.add(orb);
  const mats = [frost, skin, metal, dark, gold, rime, ice, shieldMat, rim, cape];
  return { root, core, torso, head, crown, armR, armL, shield, orb, shards, eye, gem, mats };
}

/* ---- spawn ---- */
function spawnFrozenKing(x, y, z) {
  const m = buildFrozenKing();
  m.root.position.set(x, y, z);
  scene.add(m.root);
  const e = {
    model: m, x, y, z, vy: 0, yaw: 0, hp: FK.HP, maxHp: FK.HP,
    kind: 'frozen_king', boss: 'frozen_king', name: 'Frozen King',
    inventory: [], hx: x, hz: z, hurtT: 0, flailT: 0, kx: 0, kz: 0, onGround: false, active: true, state: 'idle',
    shield: FK.SHIELD, shieldState: 'up', shieldT: FK.SHIELD_UP_S, shieldIdle: FK.SHIELD_REGEN_WAIT,
    atkCd: 2.5, cdSpikes: 12, cdFly: 18, cdBeams: 0, castT: 0, fly: null, curseT: 0, t: Math.random() * 10,
    target: null, strafe: 1, strafeT: 3,
  };
  ENTITIES.push(e);
  return e;
}
// F8 with F3 open (17-input): one in front of you, on the ground (0.839, until the castle places it)
function bossDebugSummon() {
  if (!currentWorld || menuScene || !player.spawned) return;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const x = player.pos.x + fx * 7, z = player.pos.z + fz * 7;
  let y = Math.floor(player.pos.y) + 4;
  while (y > 1 && !isSolid(Math.floor(x), y - 1, Math.floor(z))) y--;
  // up until its whole body is clear (a slope beside the spot must not hold half of it)
  _useBox({ kind: 'frozen_king' });
  while (y < WORLD_TOP - 3 && _entBlocked(x, y + FK.HOVER, z)) y++;
  _useBox(null);
  const e = spawnFrozenKing(x, y + FK.HOVER, z);
  e.yaw = Math.atan2(player.pos.x - x, player.pos.z - z);
  if (typeof fxPuff === 'function') fxPuff(x, y + 1.3, z, [0.75, 0.9, 1], 24, 2);
  if (typeof feedInfo === 'function') feedInfo('The Frozen King rises');
  playSound('thunder', { gain: 0.6, rate: 0.8, pos: { x, y: y + 1, z } });
}

/* ---- being hit ---- */
// is a blow or a shot from (fromX, fromZ) stopped by its raised shield?
function bossDeflects(e, fromX, fromZ) {
  if (!e || !e.boss || e.shieldState !== 'up' || e.shield <= 0 || e.fly) return false;
  const dx = fromX - e.x, dz = fromZ - e.z, d = Math.hypot(dx, dz) || 1;
  return (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / d > FK.SHIELD_FRONT;
}
// a player's blow or arrow (damageEntity, 28): the shield first, from the front; returns true if it died
function bossTakeHit(e, dmg, src) {
  if (!e || e.hp <= 0) return e ? e.hp <= 0 : false;
  const sx = src ? src.x : player.pos.x, sz = src ? src.z : player.pos.z;
  if (!e.target && !player.canFly) e.target = player;              // a hit wakes it
  if (bossDeflects(e, sx, sz)) {
    e.shield -= dmg;
    e.shieldIdle = 0;
    e._noKnock = true;                                               // the shield takes the shove too
    playSound('hit', { gain: 0.8, rate: 0.55, pos: { x: e.x, y: e.y + 1.5, z: e.z } });
    if (typeof fxPuff === 'function') fxPuff(e.x + Math.sin(e.yaw) * 0.8, e.y + 1.4, e.z + Math.cos(e.yaw) * 0.8, [0.6, 0.85, 1], 5, 0.7);
    if (e.shield <= 0) {                                             // broken: down until it has grown back whole
      e.shield = 0;
      e.shieldState = 'broken';
      playSound('glass', { gain: 1, rate: 0.7, pos: { x: e.x, y: e.y + 1.5, z: e.z } });
      if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 1.5, e.z, [0.55, 0.8, 1], 18, 1.6);
      if (typeof feedInfo === 'function') feedInfo("The Frozen King's shield shatters");
    }
    return false;
  }
  e.hp -= dmg;
  e.hurtT = 0.25;
  if (typeof _fxEntHurt === 'function') _fxEntHurt(e, dmg);
  if (e.hp <= 0) { _bossDie(e); return true; }
  return false;
}
function _bossDie(e) {
  e.hp = 0;
  playSound('death', { gain: 1, rate: 0.6, pos: { x: e.x, y: e.y + 1, z: e.z } });
  playSound('glass', { gain: 1, rate: 0.5, pos: { x: e.x, y: e.y + 1, z: e.z } });
  if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 1.3, e.z, [0.8, 0.92, 1], 30, 2.2);
  if (typeof fxDeath === 'function') fxDeath(e.x, e.y, e.z, FK.BOX[1]);
  // its spells die with it
  for (let i = BOSS_FX.length - 1; i >= 0; i--) if (BOSS_FX[i].owner === e) _bossFxRemove(i);
  // its castle stays empty for good (0.8393)
  if (e.lairKey && typeof BOSS_LAIRS !== 'undefined') { const l = BOSS_LAIRS.get(e.lairKey); if (l) l.defeated = true; }
  for (const p of PLAYERS) {
    if (p.canFly || !p.spawned) continue;
    if (Math.hypot(p.pos.x - e.x, p.pos.z - e.z) > FK.CREDIT_R) continue;
    _grantBossBoost(p, e.boss, e.name);
    const list = p.effects;                                          // the curse lifts at once
    if (list) { const k = list.findIndex(x => x.id === 'frozenCurse'); if (k >= 0) list.splice(k, 1); }
  }
  const i = ENTITIES.indexOf(e);
  if (i >= 0) _removeEntity(i);
}

/* ---- the brain (from updateEntities, every tick) ---- */
function _bossTarget(e) {
  let best = null, bd = Infinity;
  const keep = e.target && PLAYERS.includes(e.target) ? e.target : null;
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    const d = Math.hypot(p.pos.x - e.x, p.pos.y - e.y, p.pos.z - e.z);
    if (p === keep && d <= FK.LOSE) return p;                        // keeps whom it is fighting
    if (d <= FK.SEE && d < bd) { bd = d; best = p; }
  }
  return best;
}
// the ground under (x, z) from y down: the top of the first solid block, or null within `reach`
function _bossGround(x, y, z, reach = 12) {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let yy = Math.floor(y); yy >= Math.max(0, Math.floor(y) - reach); yy--) if (isSolid(bx, yy, bz)) return yy + 1;
  return null;
}
function _bossMoveTo(e, nx, ny, nz) {
  _useBox(e);
  if (_entBlocked(e.x, e.y, e.z)) {                                  // wedged in something: it drifts up and out through it
    e.x = nx; e.z = nz; e.y = Math.max(ny, e.y + 0.06);
    _useBox(null);
    return;
  }
  if (!_entBlocked(nx, e.y, e.z)) e.x = nx;
  else if (!_entBlocked(nx, e.y + 1, e.z)) { e.x = nx; e.y += 1; }
  if (!_entBlocked(e.x, e.y, nz)) e.z = nz;
  else if (!_entBlocked(e.x, e.y + 1, nz)) { e.z = nz; e.y += 1; }
  if (!_entBlocked(e.x, ny, e.z)) e.y = ny;
  _useBox(null);
}
function updateBoss(e, dt) {
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
  e.cdSpikes -= dt; e.cdFly -= dt; e.cdBeams -= dt;
  const tp = e.target = _bossTarget(e);
  _bossShieldTick(e, dt);
  _bossCurseTick(e, dt);
  // knockback, halved; none when the shield took the blow
  if (e._noKnock) { e.kx = e.kz = 0; e._noKnock = false; }
  if (e.kx || e.kz) {
    _bossMoveTo(e, e.x + e.kx * FK.KNOCK_MUL * dt, e.y, e.z + e.kz * FK.KNOCK_MUL * dt);
    const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt);
    e.kx *= k; e.kz *= k;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
  }
  if (e.fly) _bossFlyTick(e, dt, tp);
  else _bossWalkTick(e, dt, tp);
  // face whoever it fights
  if (tp) {
    const want = Math.atan2(tp.pos.x - e.x, tp.pos.z - e.z);
    let d = want - e.yaw; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    e.yaw += Math.max(-4 * dt, Math.min(4 * dt, d));
  }
  // its turn to act
  if (tp && !e.fly) {
    e.atkCd -= dt;
    if (e.atkCd <= 0) { e.atkCd = FK.ATTACK_CD; _bossAct(e, tp); }
  }
  _bossPose(e, dt, tp);
}
function _bossWalkTick(e, dt, tp) {
  const g = _bossGround(e.x, e.y + 1, e.z, 14);
  const hoverY = g != null ? g + FK.HOVER : e.y - 2 * dt;            // nothing under it: it sinks slowly
  let nx = e.x, nz = e.z;
  if (tp) {
    const dx = tp.pos.x - e.x, dz = tp.pos.z - e.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    let along = 0;
    if (d > FK.FAR) along = 1; else if (d < FK.NEAR) along = -0.7;
    if ((e.strafeT -= dt) <= 0) { e.strafeT = 2.5 + Math.random() * 3; e.strafe = Math.random() < 0.5 ? -1 : 1; }
    const side = along === 1 ? 0 : 0.45 * e.strafe;
    nx += (ux * along - uz * side) * FK.SPEED * dt;
    nz += (uz * along + ux * side) * FK.SPEED * dt;
  } else {
    /* Nobody to fight (0.83912): it wanders its ground, a spot at a time within WANDER_R of where it was placed,
       slowly, resting a while at each. A spot it cannot reach (a wall) is given up after WANDER_GIVE_UP seconds. */
    if (!e.wander || e.wander.rest > 0) {
      if (e.wander) e.wander.rest -= dt;
      else e.wander = { rest: 0 };
      if (e.wander.rest <= 0) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * FK.WANDER_R;
        e.wander = { x: e.hx + Math.cos(a) * r, z: e.hz + Math.sin(a) * r, rest: 0, t: 0 };
      }
    } else {
      const w = e.wander, dx = w.x - e.x, dz = w.z - e.z, d = Math.hypot(dx, dz);
      w.t += dt;
      if (d < 0.6 || w.t > FK.WANDER_GIVE_UP) w.rest = FK.WANDER_REST_MIN + Math.random() * (FK.WANDER_REST_MAX - FK.WANDER_REST_MIN);
      else {
        nx += dx / d * FK.SPEED * FK.WANDER_SPEED * dt;
        nz += dz / d * FK.SPEED * FK.WANDER_SPEED * dt;
        // it looks where it goes
        const want = Math.atan2(dx, dz);
        let t = want - e.yaw; t -= Math.round(t / (Math.PI * 2)) * Math.PI * 2;
        e.yaw += Math.max(-2 * dt, Math.min(2 * dt, t));
      }
    }
  }
  _bossMoveTo(e, nx, e.y + (hoverY - e.y) * Math.min(1, 3 * dt), nz);
}

/* ---- the shield's clock ---- */
function _bossShieldTick(e, dt) {
  e.shieldIdle += dt;
  if (e.shieldState === 'broken') {
    if (e.shieldIdle >= FK.SHIELD_REGEN_WAIT) e.shield = Math.min(FK.SHIELD, e.shield + FK.SHIELD / FK.SHIELD_REGEN_S * dt);
    if (e.shield >= FK.SHIELD) { e.shieldState = 'up'; e.shieldT = FK.SHIELD_UP_S; }
    return;
  }
  // a dented shield mends the same way, from 20 s after its last hit
  if (e.shield < FK.SHIELD && e.shieldIdle >= FK.SHIELD_REGEN_WAIT) e.shield = Math.min(FK.SHIELD, e.shield + FK.SHIELD / FK.SHIELD_REGEN_S * dt);
  if ((e.shieldT -= dt) <= 0) {
    e.shieldState = e.shieldState === 'up' ? 'down' : 'up';
    e.shieldT = e.shieldState === 'up' ? FK.SHIELD_UP_S : FK.SHIELD_DOWN_S;
  }
}

/* ---- the curse round it ---- */
function _bossCurseTick(e, dt) {
  if ((e.curseT -= dt) > 0) return;
  e.curseT = FK.CURSE_EVERY;
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    if (Math.hypot(p.pos.x - e.x, p.pos.y - e.y, p.pos.z - e.z) > FK.CURSE_R) continue;
    _bossPutEffect(p, 'frozenCurse', FK.CURSE_HOLD,
                   'The Frozen King\'s curse: you cannot mine near him, and the cold bites harder');
  }
}
// an effect on a player straight into their list (no panel rebuild every 0.1 s); `warn` once as it lands
function _bossPutEffect(p, id, time, warn) {
  const list = p.effects || (p.effects = []);
  const had = list.find(x => x.id === id);
  if (had) { had.left = Math.max(had.left, time); return; }
  list.push({ id, left: time });
  withPlayer(p, () => {
    if (warn && typeof feedWarn === 'function') feedWarn(warn);
    // an open inventory lists it at once (0.83913): the Effects list is only redrawn when something changes
    if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
  });
}

/* ---- choosing what to do ---- */
function _bossAct(e, tp) {
  const sees = typeof hasLineOfSight !== 'function' || hasLineOfSight(e.x, e.y + 2.1, e.z, tp.pos.x, tp.pos.y + 1.2, tp.pos.z);
  const pool = [];
  if (sees) pool.push(['ball', FK.W_BALL]);
  if (e.cdSpikes <= 0) pool.push(['spikes', FK.W_SPIKES]);
  if (e.cdFly <= 0) pool.push(['fly', FK.W_FLY]);
  if (e.hp < e.maxHp * 0.5 && e.cdBeams <= 0) pool.push(['beams', FK.W_BEAMS]);
  if (!pool.length) { e.atkCd = 1; return; }                         // nothing to do from here: look again soon
  let r = Math.random() * pool.reduce((s, a) => s + a[1], 0), pick = pool[0][0];
  for (const [k, w] of pool) { if ((r -= w) <= 0) { pick = k; break; } }
  if (pick === 'ball') _bossFireball(e, tp);
  else if (pick === 'spikes') { e.cdSpikes = FK.SPIKES_CD; _bossSpikes(e, tp); }
  else if (pick === 'fly') { e.cdFly = FK.FLY_CD; _bossStartFly(e, tp); }
  else { e.cdBeams = FK.BEAMS_CD; _bossBeams(e, tp); }
}

/* ==================================== its spells: BOSS_FX ==================================== */
const BOSS_FX = [];
function _bossFxRemove(i) {
  const f = BOSS_FX[i];
  scene.remove(f.group);
  BOSS_FX.splice(i, 1);
}
function clearBossFx() { while (BOSS_FX.length) _bossFxRemove(BOSS_FX.length - 1); }
// a blue flame, like the torch's but cold
function _bossFlame(x, y, z, life = 0.5, size = 0.16) {
  if (typeof _fxSprite !== 'function' || typeof _R === 'undefined' || !_R.FLAME) return;
  const i = _fxSprite(_R.FLAME, x, y, z, life, size, size * 0.3);
  if (i < 0) return;
  FX.sprites.color(i, 0.45 + Math.random() * 0.2, 0.8 + Math.random() * 0.15, 1);
  FX.sprites.vy[i] = 0.3 + Math.random() * 0.3; FX.sprites.fade[i] = 0.5;
}
const _BOSS_GEO = {};
const _bossGeo = (k, make) => _BOSS_GEO[k] || (_BOSS_GEO[k] = make());
const _BOSS_FXMAT = {
  ball: new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.85 }),
  ballCore: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  spike: new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.88 }),
  carpet: new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  beam: new THREE.MeshBasicMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.9 }),
};
// hurt a player: the shove (resisted as any hit is) and a hop; `blockFrom` lets a raised shield stop it
function _bossHurt(p, dmg, cause, kx = 0, kz = 0, hop = 0, blockFrom = null) {
  if (!p || p.dead || p.canFly || !p.spawned) return false;
  if (blockFrom && typeof shieldBlock === 'function' && shieldBlock(p, blockFrom.x, blockFrom.z, dmg)) {
    playSound('hit', { gain: 0.7, rate: 0.8, pos: { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z } });
    return false;
  }
  p.hp -= dmg;
  p._dmgCause = cause;
  const kb = 1 - (typeof playerKnockbackResist === 'function' ? withPlayer(p, playerKnockbackResist) : 0);
  if (kx || kz) { const kick = playerKick(p); kick.x = kx * kb; kick.z = kz * kb; }
  if (hop && !p.flying) p.vy = hop * kb;
  return true;
}
const _bossSetFire = (p, s) => {
  if (!(p.fireT > 0)) playSound('fireIgnite', { gain: 0.8, pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z } });
  p.fireT = Math.max(p.fireT || 0, s);
  p._fireCold = true;                            // cold fire: the lens burns blue (0.8391, 57-camera-filter.js)
};
// which player (if any) a point is inside of, with `pad` round them
function _bossPlayerAt(x, y, z, pad) {
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    const r = (p.R || 0.3) + pad;
    if (Math.abs(x - p.pos.x) > r || Math.abs(z - p.pos.z) > r) continue;
    if (y < p.pos.y - pad || y > p.pos.y + (p.H || 1.8) + pad) continue;
    return p;
  }
  return null;
}
// the right hand's place in the world (where spells leave from); its chest when the hand is in a wall
const _bossChest = (e) => ({ x: e.x, y: e.y + 2.1, z: e.z });
function _bossHand(e) {
  const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
  const h = { x: e.x - c * 0.55 + s * 0.6, y: e.y + 1.9, z: e.z + s * 0.55 + c * 0.6 };
  return isSolid(Math.floor(h.x), Math.floor(h.y), Math.floor(h.z)) ? _bossChest(e) : h;
}

/* ---- the cold fireball ---- */
function _bossFireball(e, tp) {
  e.castT = 0.6;
  const h = _bossHand(e);
  const tx = tp.pos.x, ty = tp.pos.y + 1.0, tz = tp.pos.z;
  const dx = tx - h.x, dy = ty - h.y, dz = tz - h.z, d = Math.hypot(dx, dy, dz) || 1;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(_bossGeo('ball', () => new THREE.SphereGeometry(0.32, 10, 8)), _BOSS_FXMAT.ball));
  group.add(new THREE.Mesh(_bossGeo('ballCore', () => new THREE.SphereGeometry(0.16, 8, 6)), _BOSS_FXMAT.ballCore));
  group.position.set(h.x, h.y, h.z);
  scene.add(group);
  BOSS_FX.push({ type: 'ball', owner: e, group, vx: dx / d * FK.BALL_SPEED, vy: dy / d * FK.BALL_SPEED, vz: dz / d * FK.BALL_SPEED, age: 0 });
  playSound('snowball', { gain: 0.9, rate: 0.55, pos: h });
}
function _ballTick(f, dt) {
  f.age += dt;
  const pos = f.group.position;
  const steps = Math.max(1, Math.ceil(FK.BALL_SPEED * dt / 0.25)), sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    const nx = pos.x + f.vx * sdt, ny = pos.y + f.vy * sdt, nz = pos.z + f.vz * sdt;
    const p = _bossPlayerAt(nx, ny, nz, FK.BALL_R);
    if (p) {
      if (_bossHurt(p, FK.BALL_HIT, 'was burned by the Frozen King', f.vx * 0.25, f.vz * 0.25, 0, { x: pos.x - f.vx, z: pos.z - f.vz })) _bossSetFire(p, FK.BALL_FIRE_S);
      _bossBurst(nx, ny, nz);
      return false;
    }
    if (isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { _bossBurst(pos.x, pos.y, pos.z); return false; }
    pos.set(nx, ny, nz);
  }
  f.group.rotation.y += 8 * dt;
  if (Math.random() < 0.9) _bossFlame(pos.x + (Math.random() - 0.5) * 0.3, pos.y + (Math.random() - 0.5) * 0.3, pos.z + (Math.random() - 0.5) * 0.3, 0.4, 0.2);
  return f.age < FK.BALL_LIFE;
}
function _bossBurst(x, y, z) {
  if (typeof fxPuff === 'function') fxPuff(x, y, z, [0.6, 0.85, 1], 10, 1);
  for (let k = 0; k < 6; k++) _bossFlame(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.8, 0.6, 0.22);
  playSound('fireOff', { gain: 0.7, rate: 0.8, pos: { x, y, z } });
}

/* ---- ice spikes from above ---- */
function _bossSpikes(e, tp) {
  e.castT = 1.0;
  const n = FK.SPIKES_MIN + Math.floor(Math.random() * (FK.SPIKES_MAX - FK.SPIKES_MIN + 1));
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, r = k === 0 ? 0 : Math.random() * FK.SPIKE_SPREAD;   // the first right over you
    const x = tp.pos.x + Math.cos(a) * r, z = tp.pos.z + Math.sin(a) * r;
    const bx = Math.floor(x), bz = Math.floor(z), y0 = Math.floor(tp.pos.y) + 2;
    let top = tp.pos.y + FK.SPIKE_OPEN_SKY;                          // open sky: it forms in the air
    for (let y = y0; y <= y0 + FK.SPIKE_UP; y++) if (isSolid(bx, y, bz)) { top = y; break; }   // the ceiling over the spot
    const group = new THREE.Group();
    const cone = new THREE.Mesh(_bossGeo('spike', () => new THREE.ConeGeometry(0.32, 1.7, 6)), _BOSS_FXMAT.spike);
    cone.rotation.x = Math.PI;                                       // point down
    cone.position.y = -0.85;
    group.add(cone);
    group.position.set(x, top - 0.05, z);
    scene.add(group);
    BOSS_FX.push({ type: 'spike', owner: e, group, x, z, wait: FK.SPIKE_WAIT_MIN + Math.random() * (FK.SPIKE_WAIT_MAX - FK.SPIKE_WAIT_MIN),
                   vy: 0, hit: false });
  }
  playSound('glass', { gain: 0.6, rate: 1.4, pos: { x: tp.pos.x, y: tp.pos.y + 4, z: tp.pos.z } });
}
function _spikeTick(f, dt) {
  const pos = f.group.position;
  if (f.wait > 0) {                                                  // hanging, shaking: the warning
    f.wait -= dt;
    pos.x = f.x + (Math.random() - 0.5) * 0.06;
    pos.z = f.z + (Math.random() - 0.5) * 0.06;
    if (Math.random() < 0.3 && typeof _fxGlint === 'function' && typeof FX !== 'undefined')
      _fxGlint(FX.sprites, pos.x + (Math.random() - 0.5) * 0.4, pos.y - 0.4, pos.z + (Math.random() - 0.5) * 0.4, [0.7, 0.9, 1], 0.08);
    return true;
  }
  pos.x = f.x; pos.z = f.z;
  f.vy -= 30 * dt;
  const steps = Math.max(1, Math.ceil(Math.abs(f.vy) * dt / 0.25)), sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    const ny = pos.y + f.vy * sdt, tip = ny - 1.7;
    if (!f.hit) {
      const p = _bossPlayerAt(pos.x, tip + 0.3, pos.z, 0.35) || _bossPlayerAt(pos.x, ny - 0.8, pos.z, 0.35);
      if (p) {
        f.hit = true;
        let dx = p.pos.x - pos.x, dz = p.pos.z - pos.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); d = 1; }
        if (_bossHurt(p, FK.SPIKE_HIT, 'was impaled by an ice spike', dx / d * PLY_KNOCK * FK.SPIKE_KNOCK, dz / d * PLY_KNOCK * FK.SPIKE_KNOCK, FK.SPIKE_HOP))
          _bossPutEffect(p, 'iceDaze', FK.SPIKE_DAZE_S, 'Struck by an ice spike: you jump lower and heal slower');
        _bossShatter(pos.x, tip + 0.5, pos.z);
        return false;
      }
    }
    if (isSolid(Math.floor(pos.x), Math.floor(tip), Math.floor(pos.z)) || tip < 0) { _bossShatter(pos.x, Math.floor(tip) + 1.1, pos.z); return false; }
    pos.y = ny;
  }
  return true;
}
function _bossShatter(x, y, z) {
  if (typeof playBlockSound === 'function') playBlockSound(B.ICE, 'break', Math.floor(x), Math.floor(y), Math.floor(z));
  if (typeof fxPuff === 'function') fxPuff(x, y, z, [0.8, 0.93, 1], 12, 1.2);
  if (typeof _fxGlint === 'function' && typeof FX !== 'undefined')
    for (let k = 0; k < 8; k++) _fxGlint(FX.sprites, x + (Math.random() - 0.5), y + Math.random() * 0.6, z + (Math.random() - 0.5), [0.75, 0.92, 1], 0.1);
}

/* ---- the flight, and the burning snow it leaves ---- */
function _bossStartFly(e, tp) {
  const n = FK.CARPETS_MIN + Math.floor(Math.random() * (FK.CARPETS_MAX - FK.CARPETS_MIN + 1));
  e.fly = { t: 0, ang: Math.atan2(e.z - tp.pos.z, e.x - tp.pos.x), dir: Math.random() < 0.5 ? -1 : 1, left: n,
            every: FK.FLY_S / n, next: 0.35 };
  playSound('snowball', { gain: 0.8, rate: 0.4, pos: { x: e.x, y: e.y + 1, z: e.z } });
}
function _bossFlyTick(e, dt, tp) {
  const f = e.fly;
  f.t += dt;
  if (!tp || f.t >= FK.FLY_S) { e.fly = null; return; }
  f.ang += f.dir * (Math.PI * 2 / FK.FLY_S) * dt;                    // once round you in the flight
  const gx = tp.pos.x + Math.cos(f.ang) * FK.FLY_R, gz = tp.pos.z + Math.sin(f.ang) * FK.FLY_R;
  const gy = tp.pos.y + FK.FLY_UP;
  const k = Math.min(1, 4 * dt);
  _bossMoveTo(e, e.x + (gx - e.x) * k, e.y + (gy - e.y) * k, e.z + (gz - e.z) * k);
  if ((f.next -= dt) <= 0 && f.left > 0) {
    f.next = f.every;
    f.left--;
    _bossCarpet(e, tp);
  }
  if (Math.random() < 0.6) _bossFlame(e.x + (Math.random() - 0.5) * 0.8, e.y + 0.2, e.z + (Math.random() - 0.5) * 0.8, 0.5, 0.2);
}
function _bossCarpet(e, tp) {
  const g = _bossGround(tp.pos.x, tp.pos.y + 0.5, tp.pos.z, 8);
  if (g == null) return;
  const group = new THREE.Group();
  const disc = new THREE.Mesh(_bossGeo('carpet', () => new THREE.CircleGeometry(FK.CARPET_R, 16)), _BOSS_FXMAT.carpet);
  disc.rotation.x = -Math.PI / 2;
  group.add(disc);
  group.position.set(tp.pos.x, g + 0.04, tp.pos.z);
  scene.add(group);
  BOSS_FX.push({ type: 'carpet', owner: e, group, left: FK.CARPET_S, tick: 0 });
  if (typeof fxPuff === 'function') fxPuff(tp.pos.x, g + 0.2, tp.pos.z, [0.85, 0.95, 1], 8, 1);
  playSound('fireIgnite', { gain: 0.6, rate: 0.7, pos: { x: tp.pos.x, y: g, z: tp.pos.z } });
}
function _carpetTick(f, dt) {
  f.left -= dt;
  const pos = f.group.position;
  f.group.scale.setScalar(f.left < 0.6 ? Math.max(0.05, f.left / 0.6) : 1);   // shrinks away at the end
  if (Math.random() < 0.7) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * FK.CARPET_R;
    _bossFlame(pos.x + Math.cos(a) * r, pos.y + 0.05, pos.z + Math.sin(a) * r, 0.55, 0.18);
  }
  // standing in it: alight, and 2 every 0.1 s
  if ((f.tick -= dt) <= 0) {
    f.tick = FK.CARPET_EVERY;
    for (const p of PLAYERS) {
      if (!p.spawned || p.dead || p.canFly) continue;
      if (Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) > FK.CARPET_R + (p.R || 0.3)) continue;
      if (p.pos.y < pos.y - 0.3 || p.pos.y > pos.y + 0.7) continue;
      if (p._carpetAt === _bossClock) continue;                      // one carpet's bite a step, however many overlap
      p._carpetAt = _bossClock;
      if (_bossHurt(p, FK.CARPET_HIT, 'burned in the Frozen King\'s fire')) _bossSetFire(p, FK.CARPET_FIRE_S);
    }
  }
  return f.left > 0;
}

/* ---- the beams (under half health) ---- */
function _bossBeams(e, tp) {
  e.castT = 1.2;
  playSound('thunder', { gain: 0.5, rate: 1.6, pos: { x: e.x, y: e.y + 2, z: e.z } });
  for (let k = 0; k < FK.BEAMS; k++) {
    const a = e.yaw + (k - (FK.BEAMS - 1) / 2) * 0.6;
    let x = e.x + Math.sin(a) * 1.2, y = e.y + 2.4 + (k % 2) * 0.4, z = e.z + Math.cos(a) * 1.2;
    if (isSolid(Math.floor(x), Math.floor(y), Math.floor(z))) ({ x, y, z } = _bossChest(e));   // not out of a wall
    const group = new THREE.Group();
    const rod = new THREE.Mesh(_bossGeo('beam', () => new THREE.BoxGeometry(0.16, 0.16, 1.3)), _BOSS_FXMAT.beam);
    group.add(rod);
    group.position.set(x, y, z);
    scene.add(group);
    // out and up first, fanned, then they turn on you
    BOSS_FX.push({ type: 'beam', owner: e, group, vx: Math.sin(a) * 4, vy: 3 + Math.random() * 2, vz: Math.cos(a) * 4, age: 0, target: tp });
  }
}
function _beamTick(f, dt) {
  f.age += dt;
  const pos = f.group.position, tp = f.target;
  if (tp && !tp.dead && tp.spawned && f.age > 0.35) {
    const dx = tp.pos.x - pos.x, dy = tp.pos.y + 1.1 - pos.y, dz = tp.pos.z - pos.z, d = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(1, FK.BEAM_TURN * dt);
    f.vx += (dx / d * FK.BEAM_SPEED - f.vx) * k;
    f.vy += (dy / d * FK.BEAM_SPEED - f.vy) * k;
    f.vz += (dz / d * FK.BEAM_SPEED - f.vz) * k;
  }
  const sp = Math.hypot(f.vx, f.vy, f.vz) || 1;
  const steps = Math.max(1, Math.ceil(sp * dt / 0.25)), sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    const nx = pos.x + f.vx * sdt, ny = pos.y + f.vy * sdt, nz = pos.z + f.vz * sdt;
    const p = _bossPlayerAt(nx, ny, nz, 0.3);
    if (p) {
      _bossHurt(p, FK.BEAM_HIT, 'was pierced by the Frozen King\'s beam', f.vx / sp * PLY_KNOCK * 0.6, f.vz / sp * PLY_KNOCK * 0.6, 0,
                { x: pos.x - f.vx, z: pos.z - f.vz });
      _bossBurst(nx, ny, nz);
      return false;
    }
    if (isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { _bossBurst(pos.x, pos.y, pos.z); return false; }
    pos.set(nx, ny, nz);
  }
  f.group.lookAt(pos.x + f.vx, pos.y + f.vy, pos.z + f.vz);
  if (typeof _fxGlint === 'function' && typeof FX !== 'undefined' && Math.random() < 0.8)
    _fxGlint(FX.sprites, pos.x, pos.y, pos.z, [0.6, 0.95, 1], 0.09, 0.35);
  return f.age < FK.BEAM_LIFE;
}

/* ---- every spell, a tick (simTick, 22) ---- */
let _bossClock = 0;
function updateBossFx(dt) {
  if (!BOSS_FX.length) return;
  _bossClock++;
  for (let i = BOSS_FX.length - 1; i >= 0; i--) {
    const f = BOSS_FX[i];
    const keep = f.type === 'ball' ? _ballTick(f, dt) : f.type === 'spike' ? _spikeTick(f, dt)
               : f.type === 'carpet' ? _carpetTick(f, dt) : f.type === 'beam' ? _beamTick(f, dt) : false;
    if (!keep) _bossFxRemove(i);
  }
}

/* ---- its look, each tick (drawn between ticks with every creature, 28) ---- */
function _bossPose(e, dt, tp) {
  const m = e.model;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  m.core.position.y = Math.sin(e.t * 1.7) * FK.BOB;
  m.core.rotation.x = e.fly ? 0.35 : 0;                             // leans into the flight
  for (let k = 0; k < m.shards.length; k++) m.shards[k].rotation.x = Math.sin(e.t * 1.3 + k) * 0.08;
  // the head follows its target up and down
  const look = tp ? Math.max(-0.5, Math.min(0.5, -Math.atan2(tp.pos.y + 1.4 - (e.y + 2.5), Math.max(1, Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z))))) : 0;
  m.head.rotation.x = look;
  // the casting arm comes up, the glow in its hand while it casts
  const cast = e.castT > 0;
  m.armR.rotation.x = cast ? -1.45 + look : Math.sin(e.t * 1.1) * 0.06;
  m.armR.rotation.z = cast ? 0.1 : -0.05;
  m.orb.visible = cast;
  // the shield: raised before it while up, hidden while it rests or is broken
  const up = e.shieldState === 'up' && e.shield > 0;
  m.shield.visible = up;
  m.armL.rotation.x = up ? -1.25 : Math.sin(e.t * 1.1 + 1) * 0.06;
  m.armL.rotation.z = up ? -0.35 : 0.05;
  m.shield.rotation.x = up ? 1.25 : 0;                               // held upright, facing out
  if (typeof shadeHumanoid === 'function') shadeHumanoid(m, e.x, e.y + 0.8, e.z, e.hurtT > 0, false);
  // eyes and the ice stones pulse
  const glow = 0.8 + 0.2 * Math.sin(e.t * 3);
  m.eye.color.setRGB(0.6 * glow, 0.94 * glow, 1);
  m.gem.color.setRGB(0.5 * glow, 0.88 * glow, 1);
}

/* ==================================== the snow castle: his lair (0.8393) ====================================
   structures/snow_castle.json, built by hand. It is not a lone prefab nor a settlement: there is at most one in every
   LAIR.CELL square of the world, never two within LAIR.APART blocks, and only in the open Coldest Deep Snow (not its
   Forest; new worlds, biomeRev 20). Where they stand is worked out from the seed alone, so the last quest's marker can
   point at the nearest one before its land was ever loaded:
     1. a cell's candidate spots: a grid every LAIR.STEP blocks where the open Coldest Deep Snow's own fields say yes
        (rimeOpenAt, microseconds) at the castle's middle and round its footprint, in a hashed order;
     2. each candidate in turn is checked by a worker (job 'probe': biomeAt and heightAt, milliseconds, off this thread):
        the real biome name all round, and ground within LAIR.SLOPE; the first that passes is the cell's site;
     3. a site stands only if no neighbouring cell's site lies within LAIR.APART with a lower roll.
   Once all the land under a site has loaded, the castle is queued (34's placement queue, embedded: hills cut out of
   it, pillars under it) and a lair is recorded with the world (`bossLairs`). Its markers: the furnace is the gate (air,
   and a path cut out to it), the bedrock is where the king appears (air); oak chests become rime wood, snow carpets snow
   blocks, unlit torches and spent glow crystal lit (spent glowstone is meant so and stays), and none of its lights
   ever burn out. While the lair is not defeated and its hall is simulated, a king stands in it; he is never saved, so a
   reload brings him back the same way. Once killed, never again. */
const LAIR = { PREFAB: 'snow_castle', BOSS: 'frozen_king', BIOME: 'Coldest Deep Snow',
               CELL: 4096, APART: 4000, STEP: 128, MARGIN: 8, SLOPE: 10, PROBES: 12, RING: 2, SALT: 7771, PATH: 10 };
const _lairCells = new Map();      // "gx,gz" -> { gx, gz, state: 'cands' | 'probe' | 'done', cands, k, site, rank }
const BOSS_LAIRS = new Map();      // "gx,gz" -> the saved lair: { key, kind, ox, oy, oz, bx, by, bz, placed, defeated }
const _lairProbes = new Map();     // probe id -> the cell waiting on it
let _lairProbeN = 0, _castleCache = null;

/* The castle's chests (0.8394): every one rolls this, whatever the JSON says (the file is saved again from a structure
   block now and then, and that writes the plain table). Better than any other chest: food for a long cold trip (stew
   above all: it is in four times; raw meat and fish), metal (bronze, ingots, nuggets of every kind up to 6), light
   (glow crystal and dust), what is scarce out there (rime planks; leather, which keeps the cold out, and cloth, which is
   for the heat but goes into many recipes), now and then a leather armour piece (0.83941: cloth until then, the wrong
   one for the cold), a golden apple, a saddle or a backpack, and in about one chest in nine a single gem (`once`: never
   two, 34 rollLootInto). Its chests pay LOOT_XP x CASTLE_LOOT_XP_MUL for the first open. Rolled 10,000 times: 5.4 stacks
   a chest, 1 stew, a gem in 11% (about 1.4 a castle), a leather armour piece 18%, a golden apple 4.5%. */
const _gem = (id) => ({ id, min: 1, max: 1, chance: 0.06, once: 'gem' });
const _leather = (id) => ({ id, min: 1, max: 1, chance: 0.1, once: 'armour' });
const CASTLE_LOOT = {
  name: 'snow castle', rolls: [7, 11], xp: [25, 50], minKinds: 5,
  entries: [
    _gem('DIAMOND'), _gem('EMERALD'), _gem('RUBY'), _gem('SAPPHIRE'), _gem('TOPAZ'),
    { id: 'BRONZE_INGOT', min: 1, max: 3, chance: 0.5 },
    { id: 'IRON_NUGGET', min: 1, max: 6, chance: 0.6 }, { id: 'GOLD_NUGGET', min: 1, max: 6, chance: 0.55 },
    { id: 'COPPER_NUGGET', min: 1, max: 6, chance: 0.6 }, { id: 'TIN_NUGGET', min: 1, max: 6, chance: 0.6 },
    { id: 'BRONZE_NUGGET', min: 1, max: 6, chance: 0.55 },
    { id: 'MUSHROOM_STEW', min: 1, max: 1, chance: 0.9 }, { id: 'MUSHROOM_STEW', min: 1, max: 1, chance: 0.9 },
    { id: 'MUSHROOM_STEW', min: 1, max: 1, chance: 0.9 }, { id: 'MUSHROOM_STEW', min: 1, max: 1, chance: 0.9 },
    { id: 'BEEF', min: 2, max: 5, chance: 0.6 }, { id: 'PORK', min: 2, max: 5, chance: 0.6 }, { id: 'MUTTON', min: 2, max: 5, chance: 0.6 },
    { id: 'COD', min: 2, max: 4, chance: 0.5 }, { id: 'SALMON', min: 2, max: 4, chance: 0.5 },
    { id: 'PIKE', min: 1, max: 3, chance: 0.4 }, { id: 'CATFISH', min: 1, max: 3, chance: 0.35 },
    { id: 'IRON_INGOT', min: 2, max: 5, chance: 0.45 }, { id: 'GOLD_INGOT', min: 1, max: 3, chance: 0.35 },
    { id: 'GLOW_CRYSTAL', min: 2, max: 6, chance: 0.5 }, { id: 'GLOW_DUST', min: 2, max: 5, chance: 0.35 },
    { id: 'B:RIME_PLANKS', min: 4, max: 10, chance: 0.35 },
    { id: 'CLOTH', min: 3, max: 8, chance: 0.4 }, { id: 'LEATHER', min: 2, max: 6, chance: 0.4 },
    { id: 'BREAD', min: 2, max: 4, chance: 0.45 }, { id: 'COOKED_PUMPKIN_PIE', min: 1, max: 2, chance: 0.3 },
    { id: 'ARROW', min: 6, max: 16, chance: 0.45 },
    { id: 'GOLDEN_APPLE', min: 1, max: 1, chance: 0.12 },
    _leather('LEATHER_HELMET'), _leather('LEATHER_CHESTPLATE'), _leather('LEATHER_LEGGINGS'), _leather('LEATHER_BOOTS'),
    _leather('LEATHER_GLOVES'),
    { id: 'SADDLE', min: 1, max: 1, chance: 0.06 }, { id: 'BACKPACK', min: 1, max: 1, chance: 0.04 },
  ],
};
const CASTLE_LOOT_XP_MUL = 3;

// the castle prefab, its marker cells taken out and its blocks put right (built once from the loaded prefab)
function _castlePrefab() {
  const src = typeof STRUCTURES !== 'undefined' ? STRUCTURES.get(LAIR.PREFAB) : null;
  if (!src || !Array.isArray(src.blocks)) return null;
  if (_castleCache && _castleCache.src === src) return _castleCache;
  // its chests roll the castle's own table (0.8394); '1' too, for the chests of a castle placed in 0.8393
  src.lootTables = { castle: CASTLE_LOOT, '1': CASTLE_LOOT };
  if (src.loot) for (const k in src.loot) src.loot[k] = 'castle';
  src.lootXpMul = CASTLE_LOOT_XP_MUL;
  let gate = null, boss = null;
  const blocks = [];
  for (const b of src.blocks) {
    if (!Array.isArray(b) || b.length < 4) continue;
    let [x, y, z, id, v = 0] = b;
    if (id === B.FURNACE) { gate = [x, y, z]; continue; }                       // the gate: left open
    if (id === B.BEDROCK) { boss = [x, y, z]; continue; }                       // where he appears
    if (id === B.CHEST && ((v >> CHEST_WOOD_SHIFT) & 3) === 0) v |= 3 << CHEST_WOOD_SHIFT;   // oak -> rime
    if (id === B.SNOW && CORE.layerCount(id | (v << 8)) > 0) v = 0;             // a snow carpet -> a snow block
    if (id === B.TORCH_UNLIT) id = B.TORCH;                                     // lit (same wall, same variant)
    if (id === B.GLOWCRYSTAL_SPENT) id = B.GLOWCRYSTAL_BLOCK;
    blocks.push([x, y, z, id, v]);
  }
  _castleCache = { src, prefab: { ...src, blocks }, gate, boss };
  return _castleCache;
}

const _lairKey = (gx, gz) => gx + ',' + gz;
function _lairCell(gx, gz) {
  const k = _lairKey(gx, gz);
  let c = _lairCells.get(k);
  if (!c) _lairCells.set(k, c = { gx, gz, state: 'cands', cands: null, k: 0, site: undefined, rank: _structHash(gx, gz, LAIR.SALT) });
  return c;
}
// 1. the candidates: open Coldest Deep Snow at the middle and round the footprint, by the fields alone
function _lairCands(c, W, L) {
  const g = mainGen, x0 = c.gx * LAIR.CELL, z0 = c.gz * LAIR.CELL, M = LAIR.MARGIN, out = [];
  for (let z = z0 + LAIR.STEP / 2; z < z0 + LAIR.CELL - L; z += LAIR.STEP)
    for (let x = x0 + LAIR.STEP / 2; x < x0 + LAIR.CELL - W; x += LAIR.STEP) {
      if (!g.rimeOpenAt(x + W / 2, z + L / 2)) continue;
      let ok = true;
      for (const [px, pz] of [[x - M, z - M], [x + W + M, z - M], [x - M, z + L + M], [x + W + M, z + L + M]])
        if (!g.rimeOpenAt(px, pz)) { ok = false; break; }
      if (ok) out.push({ x, z, r: _structHash(x >> 4, z >> 4, LAIR.SALT + 1) });
    }
  out.sort((a, b) => a.r - b.r);
  c.cands = out.slice(0, LAIR.PROBES);
  c.k = 0;
  c.state = c.cands.length ? 'probe' : 'done';
  if (!c.cands.length) c.site = null;
}
// 2. the worker's look at a candidate: the real biome everywhere round it, and its ground
const _lairPts = (x, z, W, L) => {
  const M = LAIR.MARGIN, out = [];
  for (const fz of [-M, L / 2, L + M]) for (const fx of [-M, W / 2, W + M]) out.push([Math.round(x + fx), Math.round(z + fz)]);
  return out;
};
function _lairProbe(c, W, L) {
  const cand = c.cands[c.k], id = ++_lairProbeN;
  _lairProbes.set(id, { c, cand });
  c.state = 'wait';
  if (typeof postScanJob === 'function') postScanJob({ type: 'probe', id, pts: _lairPts(cand.x, cand.z, W, L) }, []);
}
// the worker's answer (onWorkerMessage, 11)
function bossLairProbe(m) {
  const p = _lairProbes.get(m.id);
  if (!p) return;                                      // another world's, or forgotten
  _lairProbes.delete(m.id);
  const { c, cand } = p;
  const lo = Math.min(...m.heights), hi = Math.max(...m.heights);
  if (m.names.every(n => n === LAIR.BIOME) && hi - lo <= LAIR.SLOPE) {
    c.site = { x: cand.x, z: cand.z, lo, hi };
    c.state = 'done';
    return;
  }
  if (++c.k >= c.cands.length) { c.site = null; c.state = 'done'; }
  else c.state = 'probe';
}
// 3. a cell's castle, if it has one that stands: undefined while its neighbours are still being worked out
function _lairSite(gx, gz) {
  const c = _lairCells.get(_lairKey(gx, gz));
  if (!c || c.state !== 'done') return undefined;
  if (!c.site) return null;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const n = _lairCells.get(_lairKey(gx + dx, gz + dz));
    if (!n || n.state !== 'done') return undefined;
    if (n.site && n.rank < c.rank && Math.hypot(n.site.x - c.site.x, n.site.z - c.site.z) < LAIR.APART) return null;
  }
  return c.site;
}
const _lairsOn = () => !!currentWorld && !menuScene && currentWorld.structures !== false && (currentWorld.biomeRev || 1) >= 20;

/* Per frame (frame loop, 22): the cells round the player worked out a little at a time (one cell's candidates, or one
   probe, a frame), castles placed once their land is in, and each standing lair's king put in his hall. */
function updateBossLairs() {
  if (!_lairsOn() || typeof mainGen === 'undefined' || !mainGen.rimeOpenAt) return;
  const cp = _castlePrefab();
  if (!cp) return;
  const [W, H, L] = cp.prefab.size;
  const p = PLAYERS[0] && PLAYERS[0].spawned ? PLAYERS[0] : player;
  const pgx = Math.floor(p.pos.x / LAIR.CELL), pgz = Math.floor(p.pos.z / LAIR.CELL);
  // the work: nearest cells first, one step a frame
  let worked = false;
  for (let r = 0; r <= LAIR.RING && !worked; r++)
    for (let dz = -r; dz <= r && !worked; dz++) for (let dx = -r; dx <= r && !worked; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const c = _lairCell(pgx + dx, pgz + dz);
      if (c.state === 'cands') { _lairCands(c, W, L); worked = true; }
      else if (c.state === 'probe') { _lairProbe(c, W, L); worked = true; }
    }
  // castles whose land is all in: placed
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const gx = pgx + dx, gz = pgz + dz, key = _lairKey(gx, gz);
    const lair = BOSS_LAIRS.get(key);
    if (lair && (lair.placed || lair._queued)) continue;
    const s = lair ? { x: lair.ox, z: lair.oz } : _lairSite(gx, gz);
    if (!s) continue;
    if (Math.hypot(s.x + W / 2 - p.pos.x, s.z + L / 2 - p.pos.z) > drawDist() * 16) continue;
    if (!_footprintReady(s.x - LAIR.PATH, s.z - LAIR.PATH, W + 2 * LAIR.PATH, L + 2 * LAIR.PATH)) continue;
    _placeCastle(key, lair || { key, kind: LAIR.BOSS, ox: s.x, oy: s.lo + 1, oz: s.z, placed: false, defeated: false }, cp, W, H, L);
  }
  // his hall: a king in every standing lair close enough to be simulated
  for (const lair of BOSS_LAIRS.values()) {
    if (!lair.placed || lair.defeated || lair.bx == null) continue;
    if (ENTITIES.some(e => e.boss && e.lairKey === lair.key)) continue;
    const cx = Math.floor(lair.bx / 16), cz = Math.floor(lair.bz / 16), ch = getChunk(cx, cz);
    if (!ch || !ch.data || !inSimRangeChunk(cx, cz)) continue;
    const e = spawnFrozenKing(lair.bx + 0.5, lair.by, lair.bz + 0.5);
    e.lairKey = lair.key;
    e.yaw = Math.PI;                                   // facing the gate (the castle's front is at -Z)
  }
}
function _placeCastle(key, lair, cp, W, H, L) {
  lair._queued = true;
  if (cp.boss) { lair.bx = lair.ox + cp.boss[0]; lair.by = lair.oy + cp.boss[1]; lair.bz = lair.oz + cp.boss[2]; }
  BOSS_LAIRS.set(key, lair);
  queuePlacement({ kind: 'prefab', prefab: cp.prefab, ox: lair.ox, oy: lair.oy, oz: lair.oz, w: W, h: H, l: L,
                   blend: true, blendOpts: { top: B.SNOW, deep: B.STONE },
                   onDone: () => _castleDone(lair, cp) });
}
// the castle stands: its lights kept lit for good, the way to its gate cut through the snow, the lair marked
function _castleDone(lair, cp) {
  if (typeof BURNS !== 'undefined' && typeof BURN_S !== 'undefined')
    for (const b of cp.prefab.blocks) {
      if (!BURN_S[b[3]]) continue;
      const x = lair.ox + b[0], y = lair.oy + b[1], z = lair.oz + b[2];
      BURNS.set(x + ',' + y + ',' + z, [x, y, z, BURN_NEVER]);
    }
  if (cp.gate) {
    const gx = lair.ox + cp.gate[0], fy = lair.oy + cp.gate[1] - 1, gz = lair.oz + cp.gate[2];
    _bulkWrite(gx - 2, gz - LAIR.PATH - 1, 5, LAIR.PATH + 2, () => {
      for (let d = 1; d <= LAIR.PATH + 1; d++) {
        const z = gz - d;
        for (let x = gx - 1; x <= gx + 1; x++) {
          if (!isSolid(x, fy, z)) setBlock(x, fy, z, B.SNOW);               // something to walk on, level with the gate
          for (let y = fy + 1; y <= fy + 4; y++) if ((getBlock(x, y, z) & 255) !== B.AIR) setBlock(x, y, z, B.AIR);
        }
      }
    });
  }
  lair.placed = true;
  lair._queued = false;
}
// the castle a player should head for: the nearest standing lair not yet defeated, or the nearest site worked out
function _nearestCastle(p) {
  let best = null, bd = Infinity;
  const cp = _castlePrefab();
  if (!cp) return null;
  const [W, H, L] = cp.prefab.size;
  const consider = (x, y, z) => { const d = Math.hypot(x - p.pos.x, z - p.pos.z); if (d < bd) { bd = d; best = { x, y, z, d }; } };
  for (const lair of BOSS_LAIRS.values())
    if (!lair.defeated) consider(lair.ox + W / 2, lair.oy + H, lair.oz + L / 2);
  for (const c of _lairCells.values()) {
    if (BOSS_LAIRS.has(_lairKey(c.gx, c.gz))) continue;
    const s = _lairSite(c.gx, c.gz);
    if (s) consider(s.x + W / 2, s.hi + H, s.z + L / 2);
  }
  return best;
}
// saved with the world (16): where each castle stands and whether its king is dead
function serializeBossLairs() {
  return [...BOSS_LAIRS.values()].map(l => ({ key: l.key, kind: l.kind, ox: l.ox, oy: l.oy, oz: l.oz, bx: l.bx, by: l.by, bz: l.bz,
                                              placed: !!l.placed, defeated: !!l.defeated }));
}
function restoreBossLairs(list) {
  BOSS_LAIRS.clear(); _lairCells.clear(); _lairProbes.clear(); _castleCache = null;
  if (!Array.isArray(list)) return;
  for (const l of list) {
    if (!l || typeof l.key !== 'string' || ![l.ox, l.oy, l.oz].every(Number.isFinite)) continue;
    BOSS_LAIRS.set(l.key, { key: l.key, kind: l.kind || LAIR.BOSS, ox: l.ox, oy: l.oy, oz: l.oz, bx: l.bx, by: l.by, bz: l.bz,
                            placed: !!l.placed, defeated: !!l.defeated });
  }
}

/* ==================================== on screen ==================================== */
/* Per frame, per seat (tickPlayer, 22): its health and shield bar along the top of the view while one is within
   BOSS_BAR_R, and the last quest's marker over the nearest Frozen King, placed like the death mark (19). Both live
   on the seat's pane, outside the HUD's scaling, styled here. */
const _bmV = new THREE.Vector3();
function _bossUiOf(pane) {
  if (pane._bossUi) return pane._bossUi;
  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);width:min(460px,62%);display:none;' +
    'pointer-events:none;z-index:4;font:600 13px system-ui,sans-serif;color:#e4f6ff;text-align:center;text-shadow:0 1px 3px #000';
  bar.innerHTML = '<div class="bbName" style="margin-bottom:3px;letter-spacing:.5px"></div>' +
    '<div style="height:11px;background:rgba(0,0,0,.55);border:1px solid rgba(170,225,255,.7);border-radius:3px;overflow:hidden">' +
      '<div class="bbHp" style="height:100%;width:100%;background:linear-gradient(#ff7a6e,#a52c2c)"></div></div>' +
    '<div style="height:6px;margin-top:2px;background:rgba(0,0,0,.5);border-radius:2px;overflow:hidden">' +
      '<div class="bbSh" style="height:100%;width:100%;background:linear-gradient(#cdefff,#4aa6e6)"></div></div>';
  const mark = document.createElement('div');
  mark.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-50%);pointer-events:none;z-index:3;color:#eaf8ff;' +
    'font:600 13px system-ui,sans-serif;white-space:nowrap;text-shadow:0 1px 3px #000;background:rgba(10,40,70,.5);' +
    'border:1px solid rgba(140,215,255,.75);border-radius:6px;padding:2px 7px';
  pane.appendChild(bar); pane.appendChild(mark);
  return (pane._bossUi = { bar, mark, name: bar.querySelector('.bbName'), hp: bar.querySelector('.bbHp'), sh: bar.querySelector('.bbSh') });
}
function syncBossHud() {
  const st = typeof PSTATE !== 'undefined' ? PSTATE[activePlayerSlot()] : null;
  if (!st || !st.pane) return;
  const ui = _bossUiOf(st.pane);
  const p = player, live = !menuScene && p.spawned && !p.dead && currentWorld;
  let near = null, nd = Infinity;
  if (live) for (const e of ENTITIES) {
    if (!e.boss || e.hp <= 0) continue;
    const d = Math.hypot(e.x - p.pos.x, e.y - p.pos.y, e.z - p.pos.z);
    if (d < nd) { nd = d; near = e; }
  }
  // the bar
  const showBar = !!near && nd <= BOSS_BAR_R;
  if (showBar) {
    if (ui.name._t !== near.name) { ui.name._t = near.name; ui.name.textContent = near.name; }
    ui.hp.style.width = (100 * Math.max(0, near.hp) / near.maxHp).toFixed(1) + '%';
    ui.sh.style.width = (100 * Math.max(0, near.shield) / FK.SHIELD).toFixed(1) + '%';
    ui.sh.style.opacity = near.shieldState === 'broken' ? '0.45' : '1';
  }
  if ((ui.bar.style.display !== 'none') !== showBar) ui.bar.style.display = showBar ? 'block' : 'none';
  // the quest's marker: only while the last quest is the one you are on
  const q = typeof QUESTS !== 'undefined' ? QUESTS[questIndex()] : null;
  const onQuest = live && !p.canFly && q && q.reqs.some(r => r.boss === 'frozen_king');
  /* where it points (0.8393): a king within sight of the bar, else the nearest castle still standing or worked out from
     the seed (even land never loaded), else a king summoned anywhere */
  let mark = null;
  if (onQuest) {
    const castle = _nearestCastle(p);
    if (near && (nd <= BOSS_BAR_R || !castle || nd < castle.d)) mark = { x: near.x, y: near.y + FK.BOX[1] + 0.6, z: near.z, d: nd, txt: near.name };
    else if (castle) mark = { x: castle.x, y: castle.y, z: castle.z, d: castle.d, txt: "Frozen King's castle" };
  }
  const el = ui.mark;
  if (!mark) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
  const W = st.pane.clientWidth, H = st.pane.clientHeight;
  if (!W || !H) return;
  camera.updateMatrixWorld();
  _bmV.set(mark.x, mark.y, mark.z).applyMatrix4(camera.matrixWorldInverse);
  const behind = _bmV.z > 0;
  _bmV.applyMatrix4(camera.projectionMatrix);
  let sx = _bmV.x, sy = _bmV.y;
  if (behind) { sx = -sx; sy = -sy; }
  let x = (sx * 0.5 + 0.5) * W, y = (0.5 - sy * 0.5) * H;
  const E = 28, hx = W / 2 - E, hy = H / 2 - E, dx = x - W / 2, dy = y - H / 2;
  if (behind || Math.abs(dx) > hx || Math.abs(dy) > hy) {
    const k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
    x = W / 2 + dx * k; y = H / 2 + dy * k;
  }
  const txt = `👑 ${mark.txt} · ${Math.round(mark.d)} m`;
  if (el._txt !== txt) { el._txt = txt; el.textContent = txt; }
  el.style.display = 'block';
  el.style.left = x.toFixed(1) + 'px';
  el.style.top = y.toFixed(1) + 'px';
}
