'use strict';
/* entities/mobs.js: THE CREATURE TABLE. One entry per kind of creature, and the questions the game asks of it.

     summon(kind, x, y, z, opts)   puts a creature in the world and returns it
     buildEntity(kind, look)       builds only its model (no creature, nothing added to the world)
     mobOf(e)                      the entry of a creature

   Each creature's own file adds its entry with defineMob, at its end (sheep.js, cow.js, pig.js, horse.js,
   polar-bear.js, fish.js, night-mobs.js, villager.js, hellhound.js, frozen-king.js, termite.js, otter.js, tumbleweed.js,
   meerkat.js, tiger.js). A creature's numbers, what the
   save keeps of it, what it drops and where it lives are all in that one entry: the files named below read them
   from here, so none of them lists the kinds itself.

   WHAT AN ENTRY HOLDS (a creature leaves out what it does not have)

     who it is
       name       what it is called
       group      'animal', 'monster', 'villager', 'fish' or 'boss': who a world made without animals or without
                  monsters leaves out, whose meat the Butcher skill adds to, what a hound's kill counts as
       body       what moves it: 'grazer' (four legs, entities/grazers.js), 'fish' (entities/fish.js), 'humanoid'
                  (entities/update.js), 'insect' (entities/termite.js), 'otter' (entities/otter.js) or 'boss'
                  (entities/frozen-king.js)
       step       (e, dt, tp, i) => its own step, taken instead of any body's (updateEntities hands it over after the
                  shared bookkeeping; `tp` the nearest player, `i` its place in ENTITIES): the meerkat, the tumbleweed.
                  A new kind with a step of its own needs no line in updateEntities
       night      true: it comes with the dark, burns at dawn and is never saved (zombie, skeleton)
       unsaved    true: never saved, something else brings it back (a termite hill its termites)

     its numbers
       hp         full health. Or `maxHp: (e) =>` when each one has its own (a horse's is rolled, a tamed hound's
                  is raised by its taming, a fish's is its species'). Read by entMaxHp (entities/entities.js)
       box        [radius, height] of its body at size 1 (entR / entH, entities/physics.js). Not given: a villager's
       sizeOf     (e) => what multiplies the box when that is more than its own `size` (a fish: its species' length)
       sized      true: each one rolls a size, shown after its name
       walk       strolling speed, blocks a second
       flee       a grazer's bolting speed, before FLEE_SPEED_MUL (entities/grazers.js)
       fleeTime   seconds it bolts after a blow (entities/combat.js). Not given: it does not bolt
       hungerMul  how fast its hunger drains (entities/update.js; a ridden horse's too, entities/grazers.js): 0.5 = half as
                  fast, the kinds that can be tamed (horse, hellhound, otter, meerkat). Not given: 1
       fleeTogether  blocks: a blow sends every wild one of its kind within that many off with it (the otter)
       passive    true: a blow never sets it on the player, it bolts as a grazer does (one whose body is its own)
       fightsBack true: a creature's blow sets it on that creature (`_hurtBy`, entities/combat.js), as a player's sets it
                  on the player (`_struckBy`, aggroT): the tiger
       aggro      seconds a player's blow keeps it on that player (aggroT, damageEntity); missing = ENT_AGGRO_TIME
       xp         0: killing it pays nothing and is not told as a kill (a tumbleweed). Not given: mobKillXP
       book       false: no creature to write into the creature book (player/creature-book.js; the tumbleweed)
       chase      a humanoid's speed after its target (entities/update.js)
       reach      how far its blow reaches, edge to edge. Not given: MONSTER_MELEE_REACH (entAttackRange)
       fallSafe   blocks of fall it shrugs off. Not given: ENT_FALL_SAFE (entities/physics.js)
       foot       the print it leaves: 'hoof', 'small' or 'paw'. Not given: a boot's (49-particles.js)

     making one (summon, below, is the one spawn body: it writes what every creature shares)
       make       (opts, gender) => what one of this kind is made of: { model, scale, own, ready }.
                  `model` its built model; `scale` the model's size (not given: as built); `own` the fields
                  only this kind has, or its own value for a shared one (a name, a full inventory); `ready`
                  (e) => a last touch once the creature exists. `opts` is what the caller of summon gave: for
                  every kind hp, hx, hz (its home) and level, for a gendered one gender, and the kind's own
                  (size, a coat, a species, a tamed one's stats...)
       gendered   true: each one is F or M, rolled if not given
       spawn      (x, y, z, opts) => only for a kind NOT made the shared way (the boss has its own)
       build      (look) => its model alone; `look` names what it looks like when it has a choice:
                  cow and pig { coat } or { body, spot } (two tints), horse { coat }, fish { species }

     where it lives (entities/spawning.js; one of the two, or neither for a kind no new chunk rolls for)
       herd       { chance, min, max, biomes, wet }: the common rule. `chance` a new chunk (x ANIMAL_SPAWN_MUL),
                  `min`-`max` together on one spot of grass, `biomes` its weights by biome name, `wet` = water
                  within that many blocks. A herd never starts near a herd of another kind
       roll       (cx, cz) => its own rule for a new chunk, when the common one does not fit

     in the save (entities/save.js; a kind with no `load` is not saved as itself)
       save       (e) => the object on the end of its save row: everything that is its own. Add fields freely,
                  never rename one: old saves are read by these names
       cols       (e) => [a, b]: the two old places in the row from before that object existed (a sheep's
                  fleece, a cow's or pig's coat). A new creature does not need it
       load       (s) => the creature made again. `s`: x, y, z, hp, name, hx, hz (checked: a bad hp or name is
                  undefined), inv, woolly, variant (as they were written), d (the `save` object, {} if none)

     somebody's (a tamed one)
       spared     true: its owner's swing passes it by (player/combat.js)
       prompt     (e) => the lines under the crosshair within reach, HTML (ui/animals.js tameablePrompt). Not given: the
                  tameable table's (entities/taming.js), or nothing
       subText    (e) => the second line of the name over it (ui/animals.js entitySubText)

     its voice
       sounds     { say, hurt, eat, step }: each { key, rate, gain, vary }, a sound key (32-sound.js) and how fast it plays,
                  which pitches it (mobSound below); `gain` scales how loud (1), `vary` how far the rate wanders each time
                  (0.1 = 5% either way). `hurt` plays on a blow, `say` on a pat and now and then, `step` instead of the
                  block's footstep (entityStepSound). Not given: no voice, the block's footsteps

     what it leaves (entities/loot.js)
       loot       (e, pop, first, byPlayer) => drops what it leaves when it dies. pop(id, n) drops n;
                  first(id, lootList) rolls a LOOT list and adds the Butcher's bonus. Not given: nothing
       burnt      (e) => [raw item, LOOT list]: burnt to death it leaves that, cooked, and nothing else

   Loaded before every creature file, so they can call defineMob while they load. That also means an entry is
   read while ITS file loads: it may name what that file or an earlier one declares, and anything later (LOOT,
   the spawning helpers) only inside a function.

   From the console:  summon('hellhound', player.pos.x + 3, player.pos.y, player.pos.z) */
const MOBS = {};
function defineMob(kind, def) { def.kind = kind; MOBS[kind] = def; return def; }
function _mobDef(kind, what) {
  const def = MOBS[kind];
  if (!def) throw new Error(what + ': there is no creature kind "' + kind + '" (kinds: ' + Object.keys(MOBS).join(', ') + ')');
  return def;
}
/* THE ONE SPAWN BODY. Puts a creature of `kind` at x, y, z and returns it. What every creature shares is written
   here, once: where it is, its timers at rest, its home, its level (and gender), its health. What is one kind's
   own comes from its entry's `make` and is laid over that, so a kind may also replace a shared field (a fish's
   name is its species', a villager carries things). */
function summon(kind, x, y, z, opts = {}) {
  const def = _mobDef(kind, 'summon');
  if (def.spawn) return def.spawn(x, y, z, opts);            // made its own way (the boss)
  const gender = def.gendered ? _rollGender(opts.gender) : null;
  const made = def.make(opts, gender);
  const m = made.model;
  if (made.scale) m.root.scale.setScalar(made.scale);
  m.root.position.set(x, y, z);
  scene.add(m.root);
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2, onGround: false,
    hp: 0,                                                   // set below, once its own fields say what full is
    state: 'wander', wanderT: 0, walk: 0,
    // timers, all at rest: hurt flash and flailing, bolting, anger, the beat before fighting back, its blow
    hurtT: 0, flailT: 0, fleeT: 0, aggroT: 0, thinkT: 0, atkCd: 0, atkAnimT: 0,
    jumpCd: 0, turnCd: 0, escapeT: 0, hazCd: 0, airT: ENT_AIR_MAX,
    kx: 0, kz: 0,                                            // knockback still to spend
    hx: opts.hx != null ? opts.hx : x,                       // home: the middle of its leash, kept in the save
    hz: opts.hz != null ? opts.hz : z,
    inventory: [],
    kind, name: def.name,
    level: _rollLevel(opts.level),
  };
  if (def.gendered) ent.gender = gender;
  Object.assign(ent, made.own);
  ent.hp = opts.hp != null ? opts.hp : entMaxHp(ent);
  ENTITIES.push(ent);
  if (made.ready) made.ready(ent);
  return ent;
}
function buildEntity(kind, look = {}) { return _mobDef(kind, 'buildEntity').build(look); }

/* A creature's entry. Anything that is not a known kind reads as a villager, the plain humanoid, which is what
   the old per-kind lists fell back to (a bare { kind } handed to entR, a player handed to isGrazer). */
const mobOf = (e) => MOBS[e.kind] || MOBS.npc;
// the same questions the game always asked, answered from the table
const isGrazer   = (e) => mobOf(e).body === 'grazer';   // sheep, cow, pig, horse, polar bear, hellhound: _updateGrazer
const isFish     = (e) => mobOf(e).body === 'fish';
const isNightMob = (e) => mobOf(e).night === true;       // zombie, skeleton
const isAnimal   = (e) => mobOf(e).group === 'animal';   // sheep, cow, pig, horse, polar bear
// "killed a polar bear": the line a kill's XP is paid under
const mobKillText = (e) => 'killed a ' + mobOf(e).name.toLowerCase();
// one of a creature's own sounds (its entry's `sounds`), at it, pitched by its rate; false when its kind has none
function mobSound(e, what, gain = 0.7) {
  const s = mobOf(e).sounds, snd = s && s[what];
  if (!snd) return false;
  const vary = snd.vary ?? 0.1;
  playSound(snd.key, { gain: gain * (snd.gain ?? 1), rate: (snd.rate || 1) * (1 - vary / 2 + Math.random() * vary), pitch: true,
                       pos: { x: e.x, y: e.y + 0.5, z: e.z } });
  return true;
}
