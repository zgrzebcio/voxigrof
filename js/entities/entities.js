'use strict';
/* entities/entities.js: the list of creatures (ENTITIES) and what they share. Sizes and speeds, names and levels,
   free fall (_entFallStep), hunger and thirst, full health (entMaxHp), a head turned to a player, removing one.
   What is one KIND's own (its numbers, save, drops, where it lives) is its entry in the creature table: mobs.js,
   filled by one file per creature beside this: sheep, cow, pig, horse, polar-bear, fish, night-mobs (zombie,
   skeleton), villager, hellhound, frozen-king. What moves them: grazers.js (animals), update.js (villagers and
   monsters), tick.js (the fixed tick). Also: physics.js, combat.js, loot.js, held-items.js, spawning.js, save.js,
   taming.js. */

/* ================================ NPC entities ================================ */
const ENTITIES = [];
// no population cap since 0.71 — density comes from the per-chunk spawn roll instead
const ENT_R = 0.3, ENT_H = 1.8;
const ENT_HP = 100;                      // every health, hunger and damage here is x5 since 0.823 (out of 100, like the player)
const ENT_SPEED = 2.2, ENT_CHASE_SPEED = 4.0;
/* a mob's jump clears ENT_JUMP_H blocks (1.2), and the speed that takes is worked out from it. It was a flat
   7.6, which is 1.11 blocks on paper and was 0.93 at the fixed tick's 20 steps a second (see the gravity steps:
   _entFallStep), so since 0.838 nothing but a horse, which steps up, got onto a ledge one block high. */
const ENT_GRAVITY = 26, ENT_JUMP_H = 1.2, ENT_JUMP = Math.sqrt(2 * ENT_GRAVITY * ENT_JUMP_H);
/* One step of free fall: the new speed, and the height moved at the speed half way through the step, so a
   jump or a fall is the same at any step length. (Speed first and then the whole step at the new speed came up 16%
   short of a jump at 20 steps a second.) Returns the new y; e.vy is updated. */
function _entFallStep(e, dt) {
  const v0 = e.vy;
  e.vy = Math.max(-34, v0 - ENT_GRAVITY * dt);
  return e.y + (v0 + e.vy) * 0.5 * dt;
}
const ENT_ATTACK_DMG = 15, ENT_ATTACK_CD = 1.0, ENT_ATTACK_RANGE = 2.2;
/* Melee reach, measured the way the PLAYER's is: edge to edge, not centre to centre. A player hits
   an entity up to 4 blocks out (pickEntity), so an NPC, being a player-shaped fighter, gets almost that,
   and a monster half of it. The old flat 2.2 centre-to-centre gave a zombie about 1.6 blocks of real
   reach, and an NPC no more than a zombie. */
const PLAYER_MELEE_REACH = 4.0;
const NPC_MELEE_REACH = PLAYER_MELEE_REACH * 0.9, MONSTER_MELEE_REACH = PLAYER_MELEE_REACH * 0.5;
const entAttackRange = (e, tp) =>
  (mobOf(e).reach || MONSTER_MELEE_REACH) + entR(e) + ((tp && tp.R) || 0.3);   // `reach`: the creature table
const ENT_AGGRO_TIME = 12, ENT_AGGRO_RANGE = 18;
// nothing despawns for distance any more — far mobs freeze instead (see updateEntities)
/* NPC NAMES (split by gender in 0.757). NPCs are the player-shaped bots, and each one takes a
   random name from the list matching the gender it rolled. Add as many as you like, one per line.
   Animals show their species ("Cow", "Horse") and monsters their kind ("Zombie"); neither uses these. */
const ENT_NAMES_M = [
  'Alden', 'Bram', 'Elric', 'Garrick', 'Ivo',
  'Lorn', 'Odo', 'Tobin', 'Wendel', 'Corvin',
];
const ENT_NAMES_F = [
  'Cora', 'Dagny', 'Fenna', 'Hilde', 'Juna',
  'Maren', 'Rhosyn', 'Sela', 'Tamsin', 'Wren',
];
const ENT_NAMES = [...ENT_NAMES_M, ...ENT_NAMES_F];
const _npcName = (g) => { const l = g === 'F' ? ENT_NAMES_F : ENT_NAMES_M; return l[Math.floor(Math.random() * l.length)]; };
/* Every entity rolls a LEVEL at spawn, 1 to 50 like a horse, and every one but a monster a GENDER. Both
   show on its hover label and are saved with it. The level is a label for now: no stat reads it. */
const ENT_LEVEL_MIN = 1, ENT_LEVEL_MAX = 50;
const _rollLevel = (v) => (v >= ENT_LEVEL_MIN && v <= ENT_LEVEL_MAX ? v | 0 : _ri(ENT_LEVEL_MIN, ENT_LEVEL_MAX));
const _rollGender = (v) => (v === 'F' || v === 'M' ? v : (Math.random() < 0.5 ? 'F' : 'M'));
const ENT_THINK_TIME = 0.3;              // beat between being provoked and starting to fight back
const ENT_KNOCK = 0.5, ENT_KNOCK_HOP = 6.2;
const ENT_KNOCK_DECAY = 7.0;             // how fast the knockback velocity bleeds off
const ENT_ATK_ANIM = 0.35;               // arm-swing window when a mob lands a hit
const ENT_FLAIL_TIME = 0.6;              // arms/legs thrash for this long after taking damage
const ENT_PUSH = 3.2;                    // separation force between overlapping bodies
const PLY_KNOCK = 6.5, PLY_KNOCK_HOP = 4.2, PLY_KNOCK_DECAY = 6.0;
const ENT_HAZARD_CD = 0.5;               // seconds between lava / cactus ticks
const ENT_LAVA_DMG = 20, ENT_CACTUS_DMG = 5, ENT_DROWN_DMG = 10;
const ENT_AIR_MAX = 12;                  // seconds underwater before drowning starts
const ENT_HOME_RANGE = 200;              // never wanders further than this from its spawn point
const ENT_STUCK_TIME = 12;               // seconds of "walking" without moving before a mob is written off

// Guaranteed loot — every NPC always leaves this behind, independent of its inventory.
const ENT_LOOT = [{ id: () => ITEM.FEATHER, min: 1, max: 3 },{ id: () => ITEM.BREAD, min: 1, max: 3 }];
// Pool the random carried inventory is rolled from: only things obtainable in survival.
const ENT_CARRY_POOL = [
  { id: () => B.COBBLE,           min: 2, max: 7  },
  { id: () => B.PLANKS,           min: 1, max: 5  },
  { id: () => B.DIRT,             min: 2, max: 9  },
  { id: () => B.TORCH,            min: 1, max: 4  },
  { id: () => B.SAND,             min: 1, max: 5  },
  { id: () => ITEM.COAL,          min: 1, max: 3  },
  { id: () => ITEM.COAL_CHUNK,    min: 1, max: 5  },
  { id: () => ITEM.IRON_INGOT,    min: 1, max: 2  },
  { id: () => ITEM.APPLE,         min: 1, max: 2  },
  { id: () => ITEM.GLOW_DUST,     min: 1, max: 2  },
  { id: () => ITEM.STICK,         min: 1, max: 4  },
  // no tools or weapons: every one of those is earned at a bench, never looted off a body
];
const _ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ---- hunger ----
   EVERY entity carries a hunger meter and it drains for all of them — slowly, and only while
   the entity is simulating (a frozen mob out past sim range is not burning anything). Only the
   horse reacts to it so far: it grazes to refill it, heals while it is well fed, tires under a
   rider, and runs and jumps worse when it is running on empty. Everyone else just has the number
   ticking down, so the next animal to care about food only has to read it. */
const ENT_HUNGER_MAX = 100;
const ENT_HUNGER_DECAY = 1 / 18;         // points per second: full to empty in about half an hour
/* Thirst: every entity has it too, full to empty in about half an hour while it simulates. Nothing drinks and
   nothing reads it yet. */
const ENT_THIRST_MAX = 100, ENT_THIRST_DECAY = 1 / 18;
const entThirst = (e) => (e.thirst != null ? e.thirst : ENT_THIRST_MAX);
/* Health regen for every entity: after ENT_REGEN_DELAY seconds without taking damage, and only while
   it has some hunger left, an entity heals 1 point every ENT_REGEN_EVERY seconds, spending a little hunger
   on each. The horse keeps its own slower fed-above-half rule, now behind the same no-damage delay. */
const ENT_REGEN_DELAY = 5, ENT_REGEN_EVERY = 2, ENT_REGEN_COST = 1.25, ENT_REGEN_HP = 5;
// full health, from the creature table (entities/mobs.js): the kind's `hp`, or its `maxHp(e)` when each one has its own
function entMaxHp(e) { const d = mobOf(e); return d.maxHp ? d.maxHp(e) : d.hp; }
const HORSE_RIDE_HUNGER = 3;             // carrying a rider at speed burns this many times faster
const HORSE_GRAZE_RATE = 3;            // points per second while cropping grass
const HORSE_REGEN_EVERY = 4;             // seconds per point of health while well fed...
const HORSE_REGEN_ABOVE = 0.5;           // ...which means above half full
const HORSE_REGEN_COST = 2.5;            // hunger spent on each point healed
const HORSE_HUNGRY_BELOW = 0.25;         // under a quarter, it is running on empty:
const HORSE_HUNGRY_MUL = 0.75;           // ridden speed and jump both drop to three quarters
const entHunger = (e) => (e.hunger != null ? e.hunger : ENT_HUNGER_MAX);
const horseFedMul = (e) => entHunger(e) < ENT_HUNGER_MAX * HORSE_HUNGRY_BELOW ? HORSE_HUNGRY_MUL : 1;
/* Identity shown on hover: a sex and a level, rolled at spawn and persisted like the
   stats. The level is a label for now — it does not feed the stats. */
const TAME_LEVEL_MIN = 1, TAME_LEVEL_MAX = 50;
const horseSpeedStat = (e) => (e.stats && e.stats.speed) || 1;
const horseJumpStat  = (e) => (e.stats && e.stats.jump) || 1;
/* Anything a player has fed, ridden, part-tamed or tamed is CLAIMED, and a claimed animal is
   never quietly removed — not by the stuck watchdog, not by the wake-up audit. Losing a horse you
   spent golden apples on because it wedged itself in a fence is not an acceptable outcome. */
const isClaimed = (e) => !!(e.tame || e.loved || (e.tameProg || 0) > 0 || e.rider || e.taming);   // a hound being tamed too

/* An animal's head turned to the side, toward a player. `p`: whom it looks at, or null to look ahead;
   `bodyYaw`: the way its body is drawn facing. The turn is eased, never more than ENT_LOOK_MAX either way, and a
   player further round than ENT_LOOK_BEHIND (behind it) is not strained after: it looks ahead again. Returns the
   head's yaw for the model (its head or neck pivot's rotation.y); kept on the entity as `headYaw`. */
const ENT_LOOK_MAX = 1.0, ENT_LOOK_BEHIND = 2.3, ENT_LOOK_R = 8;
function _entHeadTurn(e, p, dt, bodyYaw) {
  let want = 0;
  if (p && p.pos && !p.dead) {
    const dx = p.pos.x - e.x, dz = p.pos.z - e.z;
    if (dx * dx + dz * dz < ENT_LOOK_R * ENT_LOOK_R) {
      let a = Math.atan2(dx, dz) - bodyYaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));                 // the short way round, -pi..pi
      if (Math.abs(a) < ENT_LOOK_BEHIND) want = Math.max(-ENT_LOOK_MAX, Math.min(ENT_LOOK_MAX, a));
    }
  }
  e.headYaw = (e.headYaw || 0) + (want - (e.headYaw || 0)) * Math.min(1, dt * 5);
  return e.headYaw;
}
/* A tinted animal cannot use shadeHumanoid: that bakes plain brightness into the material, which
   would wash every coat back to white. Same lighting, multiplied by the coat instead. */
// `sy`: how far above its feet it is lit from — a fish at its own body, not the air over the water
function shadeTinted(m, x, y, z, hurt, sy = 0.8) {
  const b = _lightAt(x, y + sy, z);
  for (const mat of (m.mats || [m.mat])) {
    if (!mat) continue;
    if (hurt) mat.color.setRGB(_HURT_COL.r * b, _HURT_COL.g * b, _HURT_COL.b * b);
    else mat.color.setRGB(m.tint.r * b, m.tint.g * b, m.tint.b * b);
  }
  if (m.satMat) m.satMat.color.setScalar(hurt ? 1 : b);     // tack is not part of the coat
}

/* ---- size ----
   Every farm animal is rolled a size at spawn, 0.7x to 1.3x, so a herd is a crowd of individuals
   rather than one model stamped out. `opts.size` takes any positive number — the range only
   bounds the natural roll. The HITBOX scales with it too (a kind's `box` in the creature table, entR /
   entH): a 1.3x cow is a 1.3x obstacle, and a big horse may not fit a door its foal walks through. */
const ANIMAL_SIZE_MIN = 0.7, ANIMAL_SIZE_MAX = 1.3;
/* What "normal size" (size 1.0) means per species, applied UNDER the per-animal roll:
   the roll makes individuals, this sets the breed. A sheep is a little smaller than the box units
   it is built from, a cow a little bigger. The horse's equivalent is HORSE_SCALE. Each kind's `box`
   in the creature table is sized to match these, so collision follows what you see. */
const SHEEP_SCALE = 0.98, COW_SCALE = 1.15, PIG_SCALE = 0.95;      // sheep 0.85 -> 0.98, 15% bigger
function _animalSize(opts) {
  const s = +opts.size;
  if (s > 0) return Math.min(ANIMAL_SIZE_MAX, Math.max(ANIMAL_SIZE_MIN, s));   // saved or asked-for sizes too
  return +(ANIMAL_SIZE_MIN + Math.random() * (ANIMAL_SIZE_MAX - ANIMAL_SIZE_MIN)).toFixed(3);
}

// a creature leaving the world without dying: a puff where it stood, smoky if the sun took it
function _fxEntGone(e, burnt = false) {
  if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 0.8, e.z, burnt ? [0.3, 0.28, 0.27] : [0.85, 0.85, 0.88], 12, 1.4);
}
function _removeEntity(i) {
  const e = ENTITIES[i];
  // never leave a rider welded to an animal that no longer exists
  if (e && e.rider && typeof dismountRider === 'function') dismountRider(e.rider, true);
  // somebody's hound that died is told to its owner (entities/hellhound.js)
  if (e && e.kind === 'hellhound' && (e.tame || e.taming) && e.hp <= 0 && typeof houndLost === 'function') houndLost(e);
  scene.remove(e.model.root);
  ENTITIES.splice(i, 1);
}
function clearEntities() {
  while (ENTITIES.length) _removeEntity(ENTITIES.length - 1);
  if (typeof _nightWas !== 'undefined') _nightWas = false;   // a world joined at night has its loaded land roll again (updateNightMobs)
}
