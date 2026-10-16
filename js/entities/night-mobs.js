'use strict';
/* entities/night-mobs.js: zombies and skeletons. Their numbers, the keys they may drop, spawning them out of the
   ground, and burning in daylight.
   They move by entities/update.js. */

/* ---- zombies: the first genuinely HOSTILE mob ----
   They are not part of the permanent per-chunk population. A chunk rolls for zombies every time
   it finishes generating — a brand new chunk or an old one being loaded back in — but only while
   it is night, so they accumulate after dusk and are gone by mid-morning. Each one claws its way
   up out of the ground on arrival, hunts anything within four chunks, and catches fire the moment
   real daylight reaches it. Nothing about them is saved: dawn is the despawn. */
const ZOMBIE_HP = 90;
const ZOMBIE_SPEED = 1.5, ZOMBIE_CHASE_SPEED = 3.1;
const ZOMBIE_DMG = 20;
/* A rare nugget: a buckle or a button off a dead traveller. One nugget, 6% of kills,
   weighted so the common metals are common and gold is the prize — a trickle of metal before you
   have mined any, never a substitute for ore. */
const ZOMBIE_NUGGET_CHANCE = 0.06;
const ZOMBIE_NUGGETS = [ITEM.COPPER_NUGGET, ITEM.COPPER_NUGGET, ITEM.COPPER_NUGGET,
                        ITEM.TIN_NUGGET, ITEM.TIN_NUGGET, ITEM.TIN_NUGGET,
                        ITEM.IRON_NUGGET, ITEM.IRON_NUGGET, ITEM.GOLD_NUGGET];
/* Keys: a zombie or a skeleton a player kills may carry the key to a sealed metal chest (blocks/chest.js); one
   roll, copper the commonest, gold the rarest, as the chests themselves are */
const MOB_KEY_ODDS = [[ITEM.COPPER_KEY, 0.02], [ITEM.IRON_KEY, 0.012], [ITEM.GOLDEN_KEY, 0.004]];
function _mobDropKey(pop, byPlayer) {
  if (!byPlayer) return;                   // not off one the sun burnt, or the lava had
  let r = Math.random();
  for (const [id, p] of MOB_KEY_ODDS) { if (r < p) { pop(id, 1); return; } r -= p; }
}
// 4 chunks. That is the lowest render distance anyone plays at, so a zombie can never notice the
// player from inside terrain the player cannot see.
const ZOMBIE_CHASE_RANGE = 64;
const ZOMBIE_RISE_TIME = 1.2;            // seconds spent climbing out of the ground
/* Spawn rate (retuned 0.7295 — the old numbers built 10-strong hordes). Three separate limits,
   because one alone was not enough: walking into fresh terrain streams in dozens of chunks in a
   couple of seconds, and every one of them used to roll independently.
     CHANCE  how often a chunk load even considers a zombie
     PACK    how many come up at that one spot (a pack of 1 now — no clusters)
     GAP     seconds between any two spawns WORLD-WIDE, which is what actually stops a wave:
             a burst of chunk loads can now only produce one zombie
     CAP     the ceiling on how many can be alive at once */
const ZOMBIE_CHUNK_CHANCE = 0.05;        // per chunk load, at night
const ZOMBIE_PACK_MIN = 1, ZOMBIE_PACK_MAX = 1;
const ZOMBIE_SPAWN_GAP = 6;              // seconds between spawns, across the whole world
const ZOMBIE_CAP = 10;                   // hard ceiling — chunk reloads must not stack up forever
// World-global, NOT per player: this throttles the world's spawner, which runs once per chunk
// load rather than once per player per frame, so it must not live in a per-seat slot.
var _zombieSpawnT = -1e9;
const ZOMBIE_BURN_GRACE = 0.7;           // seconds in the open before it catches
const ZOMBIE_BURN_DPS = 9;
const ZOMBIE_SPAWN_MIN_DIST = 14;        // never sprouts in the player's face
/* Night mobs come out this long before sunset (in days of worldTime), and daylight burns them from sunrise until
   this long before it. By the day's own sunrise and sunset since 0.818 (sunTimes, 07-sky.js): late in summer,
   early in winter. They were 0.47 and 0.45 of a fixed 06:00-18:00 day. */
const ZOMBIE_NIGHT_EARLY = 0.03;
const ZOMBIE_BURN_STOPS = 0.05;
const isNightForMobs = () => isDarkTime(worldTime, ZOMBIE_NIGHT_EARLY);
const isBurningDaylight = () => !isDarkTime(worldTime, ZOMBIE_BURN_STOPS);

/* ---- skeletons: the ranged night mob ----
   Everything a zombie is — spawned by the night, clawed up out of the ground, burnt by the
   morning, never saved — except it fights at a distance. Each one is armed ONCE at spawn and
   keeps that loadout for its whole short life:
     50%  a bow and a handful of arrows: it backs off to its shooting range and looses at you
     30%  a flint sword (this game's wooden tier): a plain, slightly quicker zombie
     20%  nothing at all: bare bones, weakest of the three
   The arm roll is what makes a night interesting — you can hear one is a shooter before you
   see it, because the ones that close on you are the ones that cannot shoot. */
const SKEL_HP = 70;
const SKEL_SPEED = 1.7, SKEL_CHASE_SPEED = 3.3;
const SKEL_CHASE_RANGE = 64;             // same hunting radius as a zombie
const SKEL_ARM_BOW = 0.50, SKEL_ARM_SWORD = 0.30;   // the remaining 0.20 is bare-handed
const SKEL_ARROWS_MIN = 2, SKEL_ARROWS_MAX = 7;     // a bow skeleton's quiver
const SKEL_DMG_SWORD = 20, SKEL_DMG_HANDS = 10;
const SKEL_ARROW_DMG = 20;
const SKEL_SHOOT_RANGE = 22;             // starts shooting inside this
const SKEL_KEEP_DIST = 5;                // ...and backs away if you get closer than this
const SKEL_DRAW_TIME = 1.1;              // seconds at full draw before it looses
const SKEL_SHOOT_CD = 1.4;               // recovery between shots
const SKEL_ARROW_SPEED = 30;
// Loot. The bow drop is deliberately a lottery ticket — 0.001%, i.e. one skeleton in a hundred
// thousand — and what falls is a nearly-spent bow, not a fresh one.
const SKEL_BONE_MIN = 1, SKEL_BONE_MAX = 3;
const SKEL_ARROW_DROP_MIN = 1, SKEL_ARROW_DROP_MAX = 2;
const SKEL_BOW_DROP_CHANCE = 0.00001;    // 0.001%
const SKEL_BOW_DROP_DUR_MIN = 10, SKEL_BOW_DROP_DUR_MAX = 30;
// share of night spawns that come up as skeletons rather than zombies
const SKEL_SPAWN_SHARE = 0.45;

/* A night mob starts fully underground and `riseT` lifts it into place: the MODEL is sunk, not the creature, which
   stands on solid ground the whole time. Until its first step draws it, the model waits a body's height down. */
const _sinkModel = (e) => e.model.root.position.set(e.x, e.y - ENT_H, e.z);
/* What one zombie is made of: its model and what only a zombie has. summon('zombie', x, y, z) writes the rest
   (entities/mobs.js). */
function makeZombie() {
  return {
    model: buildHumanoid(_newZombieMat()),
    own: { riseT: ZOMBIE_RISE_TIME, burnT: 0, sunT: 0, dmg: ZOMBIE_DMG },
    ready: _sinkModel,
  };
}

/* What one skeleton is made of. It rises out of the ground exactly like a zombie; what differs is the loadout
   rolled here, once, and never again. */
function makeSkeleton() {
  const roll = Math.random();
  const arm = roll < SKEL_ARM_BOW ? 'bow'
            : roll < SKEL_ARM_BOW + SKEL_ARM_SWORD ? 'sword' : 'hands';
  return {
    model: buildHumanoid(_newSkeletonMat()),
    own: {
      riseT: ZOMBIE_RISE_TIME, burnT: 0, sunT: 0,
      arm,
      ammo: arm === 'bow' ? _ri(SKEL_ARROWS_MIN, SKEL_ARROWS_MAX) : 0,
      ammoId: ITEM.ARROW,                       // which ammunition this one carries (multi-ammo ready)
      drawT: 0, shootCd: 0,                     // bow draw progress and the recovery between shots
      dmg: arm === 'sword' ? SKEL_DMG_SWORD : SKEL_DMG_HANDS,
    },
    ready: _sinkModel,
  };
}

/* Sunlight kills. The test is SKY light at head height, not the day/night shading — standing in
   a doorway, under leaves, in a cave or one block into an overhang all read as shade, which is
   what makes hiding spots meaningful. Water puts the fire out too. A short grace period stops a
   zombie flickering alight every time it crosses a one-block gap in a roof.
   Returns true if it burned to death (the caller must remove it immediately). */

function _zombieBurnTick(e, dt) {
  const hx = Math.floor(e.x), hz = Math.floor(e.z);
  const wet = (getBlock(hx, Math.floor(e.y + 0.4), hz) & 255) === B.WATER;
  const lit = isBurningDaylight() && !wet && getSkyWorld(hx, Math.floor(e.y + 1.5), hz) >= 15;
  if (!lit) {
    e.sunT = 0;
    if (e.burnT > 0) e.burnT = Math.max(0, e.burnT - dt * 2);
    return false;
  }
  e.sunT += dt;
  if (e.sunT < ZOMBIE_BURN_GRACE) return false;
  e.burnT = 0.5;
  e.hp -= ZOMBIE_BURN_DPS * dt;
  if (e.hp > 0) return false;
  if (!player.canFly) _entDropLoot(e);       // no XP: the sun did it, not the player
  return true;
}

/* Their entries in the creature table (entities/mobs.js says what each line is for). `night` is what makes them
   night mobs (isNightMob): they have no `herd`, `roll`, `save` or `load`, because the night brings them
   (trySpawnNightMobsInChunk, entities/spawning.js) and the dawn takes them. */
defineMob('zombie', {
  name: 'Zombie', group: 'monster', body: 'humanoid', night: true,
  hp: ZOMBIE_HP, walk: ZOMBIE_SPEED, chase: ZOMBIE_CHASE_SPEED,
  make: makeZombie, build: () => buildHumanoid(_newZombieMat()),
  // rotten flesh, now and then a nugget, a chest's key off one a player killed, and whatever it had picked up
  loot: (e, pop, first, byPlayer) => {
    pop(ITEM.ROTTEN_FLESH, rollLoot(LOOT.monster));
    if (Math.random() < ZOMBIE_NUGGET_CHANCE)
      pop(ZOMBIE_NUGGETS[Math.floor(Math.random() * ZOMBIE_NUGGETS.length)], 1);
    _mobDropKey(pop, byPlayer);
    _mobDropHeld(e);
  },
});
defineMob('skeleton', {
  name: 'Skeleton', group: 'monster', body: 'humanoid', night: true,
  hp: SKEL_HP, walk: SKEL_SPEED, chase: SKEL_CHASE_SPEED,
  make: makeSkeleton, build: () => buildHumanoid(_newSkeletonMat()),
  // bones, some of the arrows it carried, a chest's key off one a player killed
  loot: (e, pop, first, byPlayer) => {
    pop(ITEM.BONE, rollLoot(LOOT.monster));
    pop(e.ammoId != null ? e.ammoId : ITEM.ARROW, rollLoot(LOOT.arrows));
    _mobDropKey(pop, byPlayer);
    /* The bow itself, once in a hundred thousand kills, and worn nearly through when it does
       come — it is a trophy off a corpse, not a shortcut past the crafting bench. */
    if (e.arm === 'bow' && Math.random() < SKEL_BOW_DROP_CHANCE) {
      const dur = _ri(SKEL_BOW_DROP_DUR_MIN, SKEL_BOW_DROP_DUR_MAX);
      spawnDrop(ITEM.BOW, Math.floor(e.x), Math.floor(e.y + 0.5), Math.floor(e.z),
        { x: (Math.random() - 0.5) * 2, y: 2.6, z: (Math.random() - 0.5) * 2 }, 0.6, dur);
      toast('the skeleton dropped its bow');
    }
  },
});
