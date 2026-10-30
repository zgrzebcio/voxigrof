'use strict';
/* entities/combat.js: creatures hurting and being hurt. A blow on a player, monsters against villagers, damage from
   a creature and from a player (damageEntity), and snowballs.
   The player's side (aiming, swinging) is player/combat.js. */

/* One blow on a player (the polar bear's bite): a raised shield facing it stops it, and the player is shoved back
   less by what their armour resists — the same as a humanoid monster's swing in updateEntities. */
function _mobStrikePlayer(e, tp, dmg, pdx, pdz, dist) {
  const blocked = typeof shieldBlock === 'function' && shieldBlock(tp, e.x, e.z, dmg);
  if (!blocked) {
    tp.hp -= dmg;                                // out of 100 on both sides since 0.823
    tp._dmgCause = `was slain by a ${e.name}`;
  }
  tp._hitBy = e; tp._hitByAt = performance.now();   // who struck this player last: a hound on defense goes for it
  const m = dist || 1, kick = playerKick(tp);
  const kbMul = 1 - (typeof playerKnockbackResist === 'function' ? withPlayer(tp, playerKnockbackResist) : 0);
  const kbShield = blocked ? SHIELD_KNOCK_MUL : 1;
  kick.x = pdx / m * PLY_KNOCK * kbMul * kbShield;
  kick.z = pdz / m * PLY_KNOCK * kbMul * kbShield;
  if (!blocked && !tp.flying && Math.abs(tp.vy) < 0.5) tp.vy = PLY_KNOCK_HOP * kbMul;
}

/* ---------------------------------- monsters vs villagers ----------------------------------
   Monsters hunt villagers as well as players, and villagers stand their ground: an NPC goes for any
   monster that comes near it or hits it, and a monster goes for a villager that hits it. A creature
   killed by ANOTHER creature leaves nothing — no loot, no XP, nothing it was carrying — so a zombie
   walked into a village is not a way to farm either side. */
const MONSTER_SEES_NPC = 24;          // how far a monster notices a villager (a player: ZOMBIE_CHASE_RANGE)
const NPC_DEFEND_RANGE = 12;          // how close a monster comes before a villager goes for it
const FOE_RETHINK = 0.25;             // seconds between looks for a new foe while it has none
const _isMonster = (e) => isNightMob(e);
const _foeAlive = (f) => !!f && f.hp > 0 && !f._killedByMob && f.active !== false && !(f.riseT > 0) && ENTITIES.includes(f);
/* The creature `e` is fighting this tick, or null when its business (if any) is with a player. A foe
   it already has is kept while it lives and stays near; with none, it looks again every FOE_RETHINK. */
function _entFoe(e, tp, distXZ, dt) {
  const monster = _isMonster(e);
  if (!monster && e.kind !== 'npc') return null;
  const range = monster ? MONSTER_SEES_NPC : NPC_DEFEND_RANGE;
  const dist = (f) => Math.hypot(f.x - e.x, f.z - e.z);
  // a little slack past the range, so a chase does not flicker on and off at its edge
  if (e._foe && !(_foeAlive(e._foe) && dist(e._foe) <= range + 4)) e._foe = null;
  if (!e._foe) {
    e._foeT = (e._foeT || 0) - dt;
    if (e._foeT <= 0) {
      e._foeT = FOE_RETHINK;
      let bd = range;
      for (const f of ENTITIES) {
        if (f === e || !_foeAlive(f) || (monster ? f.kind !== 'npc' : !_isMonster(f))) continue;
        const d = dist(f);
        if (d < bd) { bd = d; e._foe = f; }
      }
    }
  }
  const f = e._foe;
  if (!f) return null;
  // a monster still goes for the PLAYER when the player is the nearer of the two
  if (monster && !tp.canFly && !tp.dead && distXZ <= ZOMBIE_CHASE_RANGE && distXZ < dist(f)) return null;
  return f;
}
/* A creature hurting a creature: a monster's blow or arrow, a villager's swing. Unlike damageEntity it
   never pays the player XP, never drops loot and never turns anyone against the player — the victim
   turns on its attacker instead. Death only MARKS the body: updateEntities removes it at the top of
   its next turn, since taking an entry out of ENTITIES here would shift the one being updated. */
// red hearts over a hurt creature, one per two points of damage (0.8, 49-particles.js)
const _fxEntHurt = (ent, dmg) => {
  if (typeof fxHearts === 'function') fxHearts(ent.x, ent.y + entH(ent) * 0.85, ent.z, false, dmg / 5);   // one heart per 5 dealt (per point 0.8031)
  // the killing blow: crit stars and a white puff
  if (ent.hp <= 0 && typeof fxDeath === 'function') fxDeath(ent.x, ent.y, ent.z, entH(ent));
};
/* A blow on a creature that bolts: it runs for its kind's `fleeTime`, away from where the blow came from; and a kind with
   `fleeTogether` (the otter) sends every wild one of its kind that near off with it. */
function _entBolt(ent, fromX, fromZ) {
  const def = mobOf(ent), t = def.fleeTime || 0;
  ent.fleeT = t; ent._fleeFrom = { x: fromX, z: fromZ };
  if (!def.fleeTogether || !t) return;
  const r = def.fleeTogether;
  for (const o of ENTITIES)
    if (o !== ent && o.kind === ent.kind && !o.tame && Math.abs(o.x - ent.x) < r && Math.abs(o.z - ent.z) < r && Math.hypot(o.x - ent.x, o.z - ent.z) < r) {
      o.fleeT = t; o._fleeFrom = { x: fromX, z: fromZ };
    }
}
function damageEntityByMob(ent, dmg, by) {
  if (!ent || ent.hp <= 0 || ent._killedByMob) return false;
  if (ent.boss) return false;                    // a boss is the players' fight
  ent.hp -= dmg;
  _fxEntHurt(ent, dmg);
  mobSound(ent, 'hurt');                         // its own cry, when it has one (the creature table's `sounds`)
  ent.hurtT = 0.25;
  ent.flailT = ENT_FLAIL_TIME;
  if (ent.kind === 'polar_bear') { /* a bear stands its ground */ }
  else if (ent.kind === 'hellhound') { if (by && by !== ent) { ent._hurtBy = by; ent._hurtByAt = performance.now(); } }   // it turns on what bit it
  else if (isGrazer(ent) || isFish(ent) || mobOf(ent).passive) _entBolt(ent, by ? by.x : ent.x, by ? by.z : ent.z);   // the rest bolt, for their kind's `fleeTime`
  // a monster or a villager fights back at a hellhound that bit it, as they do at each other
  else if (by && by !== ent && by.hp > 0 &&
           ((_isMonster(ent) && by.kind === 'npc') || (ent.kind === 'npc' && _isMonster(by)) || by.kind === 'hellhound')) {
    ent._foe = by;
    if (ent.state !== 'chase') ent.thinkT = ENT_THINK_TIME;   // the same beat of surprise a player's hit gets
  }
  if (ent.hp <= 0) {
    ent._killedByMob = true;
    if (by && by.kind === 'hellhound' && typeof fireKillBy === 'function') fireKillBy(ent, by);   // a hound's kill leaves fire
    return true;
  }
  return false;
}
// one swing of one creature at another: the blow, the shove, the sound
function _mobHitsMob(att, foe, dmg, dx, dz, dist) {
  const died = damageEntityByMob(foe, dmg, att);
  playSound('hit', { gain: 0.6, rate: 1.0 + Math.random() * 0.1, pos: { x: foe.x, y: foe.y + 1, z: foe.z } });
  if (died) return;
  const m = dist || 1;
  foe.kx = dx / m * ENT_KNOCK * 12;
  foe.kz = dz / m * ENT_KNOCK * 12;
  if (_entBlocked(foe.x, foe.y - 0.02, foe.z)) foe.vy = ENT_KNOCK_HOP;
}
// what an archer aims at when its target is a creature: mobShoot reads a player's pos and eye height
const _entAimTarget = (f) => ({ pos: { x: f.x, y: f.y, z: f.z }, EYE: 1.62 });

// `src`: where the blow or shot came from, {x, z}, for a boss's shield (entities/frozen-king.js); the player when not given
function damageEntity(ent, dmg, src = null) {
  if (ent._killedByMob) return false;          // already dead at another creature's hands
  if (ent.boss && typeof bossTakeHit === 'function') return bossTakeHit(ent, dmg, src);
  ent.hp -= dmg;
  _fxEntHurt(ent, dmg);
  mobSound(ent, 'hurt');                         // its own cry, when it has one (the creature table's `sounds`)
  ent.hurtT = 0.25;
  ent.flailT = ENT_FLAIL_TIME;                   // limbs thrash on impact even while standing
  /* what this player struck last is what their hound goes for (houndThink, entities/hellhound.js); and a kill made
     with fire (a torch's blow, or the fire this player set on it still burning) leaves fire and counts for a taming */
  if (ent.kind !== 'hellhound' || !ent.owner) { player._houndTarget = ent; player._houndTargetAt = performance.now(); }
  if (ent.hp <= 0 && !player.canFly && typeof fireKillBy === 'function' && (_fireBlow || (ent.fireT > 0 && ent._fireBy === player)))
    fireKillBy(ent, player);
  // Grazers are passive: they bolt rather than retaliate. So are fish, and the kinds marked `passive` (the otter)
  if (isGrazer(ent) || isFish(ent) || mobOf(ent).passive) {
    // a polar bear does not bolt: the hit sets it on you, however far you run
    if (ent.kind === 'polar_bear') {
      if (!player.canFly) {
        if (ent.state !== 'chase' && ent.state !== 'return') { ent.retX = ent.x; ent.retZ = ent.z; }   // where it goes back to
        ent.aggroT = POLAR_BEAR_AGGRO_TIME; ent.state = 'chase';
      }
    }
    // a hellhound neither: a wild one is set on you, one of yours only takes the blow
    else if (ent.kind === 'hellhound') { if (!player.canFly && typeof houndStruckByPlayer === 'function') houndStruckByPlayer(ent, player); }
    else if (!player.canFly) _entBolt(ent, src ? src.x : player.pos.x, src ? src.z : player.pos.z);   // its kind's `fleeTime` (the creature table)
    if (ent.hp <= 0) {
      // killed by the player; a kind whose `xp` is 0 (a tumbleweed) pays nothing and is not told as a kill
      if (!player.canFly) { _entDropLoot(ent, true); if (mobOf(ent).xp !== 0) addXP(mobKillXP(ent), mobKillText(ent)); }
      const i = ENTITIES.indexOf(ent);
      if (i >= 0) _removeEntity(i);
      return true;
    }
    return false;
  }
  // Creative is a build mode: mobs never turn hostile and never leave loot behind.
  if (!player.canFly) {
    ent.aggroT = ENT_AGGRO_TIME;               // neutral until provoked — this is the provocation
    if (ent.state !== 'chase') ent.thinkT = ENT_THINK_TIME;   // beat of confusion before it reacts
    ent.state = 'chase';
  }
  if (ent.hp <= 0) {
    if (!player.canFly) { _entDropLoot(ent, true); addXP(mobKillXP(ent), mobKillText(ent)); }   // the player's kill: a key may drop
    const i = ENTITIES.indexOf(ent);
    if (i >= 0) _removeEntity(i);
    return true;
  }
  return false;
}

/* ---- snowballs ----
   A thrown snowball is a shove, not an attack: it staggers whatever it lands on and pushes it
   along the flight direction, but deals no damage and deliberately touches NEITHER `aggroT`/
   `state` (hostiles stay neutral) NOR `fleeT` (sheep don't bolt). Pelting a cow is harmless fun. */
function projectileHitEntity(x, y, z) {
  for (const e of ENTITIES) {
    if (e.hp <= 0) continue;
    const er = entR(e);
    if (Math.abs(x - e.x) > er + 0.2 || Math.abs(z - e.z) > er + 0.2) continue;
    if (y < e.y - 0.1 || y > e.y + entH(e)) continue;
    return e;
  }
  return null;
}
function entitySnowballHit(ent, vx, vy, vz) {
  // a boss's raised shield turns it away
  if (ent.boss && typeof bossDeflects === 'function' && bossDeflects(ent, ent.x - vx, ent.z - vz)) return;
  ent.hurtT = 0.25;                              // the white flash, so the hit reads
  ent.flailT = ENT_FLAIL_TIME;
  const m = Math.hypot(vx, vz) || 1;
  ent.kx = vx / m * ENT_KNOCK * 7;               // lighter than a melee hit
  ent.kz = vz / m * ENT_KNOCK * 7;
  if (_entBlocked(ent.x, ent.y - 0.02, ent.z)) ent.vy = ENT_KNOCK_HOP * 0.5;
  playSound('hit', { gain: 0.5, rate: 1.3 + Math.random() * 0.1, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
}
