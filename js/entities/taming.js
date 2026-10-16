'use strict';
/* entities/taming.js: taming and tamed animals. TAMEABLE, a horse's stances, petting, milking a cow, using an animal
   (feed, saddle, mount), riding, and the ride that tames.
   Its panels are ui/animals.js. */

/* voxiGrof — taming, riding, and naming what you tamed

   Written as a SYSTEM, not as horse code. A tameable animal is a row in TAMEABLE keyed by its
   entity kind: what food starts it, how long it takes, what the reward is. Wolves, camels or
   anything else join by adding a row and a spawn function — the interaction, the ride, the
   progress bar, the boost and the naming all come for free.

   The flow, for a horse:
     1. sneak up holding a golden apple and use it   -> it accepts you (`loved`), apple is eaten
     2. use it again                                 -> you climb on and it bolts
     3. stay on                                      -> the taming bar fills
     4. bar full                                     -> tamed, small permanent stat boost, and you
                                                        are put down to give it a name
     5. use a saddle on it                           -> tack fitted; from then on you steer it
   Sneak dismounts at any point. Getting thrown off (dismounting early) costs part of the boost
   that completing it would have given, so sitting through the whole ride is worth something. */

const TAMEABLE = {
  horse: {
    label: 'horse',
    food: [ITEM.GOLDEN_APPLE],       // what makes it accept you
    consumeFood: true,
    tameTime: 16,                    // seconds in the saddle to fill the bar
    buckPenalty: 0.25,               // share of the final boost lost per early dismount
    needsSaddle: true,               // ...before a tamed one can actually be steered
    boost: { hp: 20, speed: 0.08, jump: 0.08 },   // health x5 since 0.823
    statLine: (e) => `health ${Math.ceil(e.hp)}/${e.stats.maxHp} · speed ${e.stats.speed.toFixed(2)}` +
                     ` · jump ${e.stats.jump.toFixed(2)} · hunger ${Math.round(entHunger(e))}/${ENT_HUNGER_MAX}` +
                     ` · thirst ${Math.round(entThirst(e))}/${ENT_THIRST_MAX}`,   // 0.823
    /* What a TAMED one eats from your hand, and how much each refills. The golden apple
       is on the list too — it tames a wild horse, and it is also the best meal you can give. */
    feed: { [ITEM.APPLE]: 20, [ITEM.WHEAT]: 15, [ITEM.SUGAR]: 10, [ITEM.GOLDEN_APPLE]: 60, [B.HAY]: 80 },   // x5
  },
};
const tameProps = (e) => (e && TAMEABLE[e.kind]) || null;
const isTameable = (e) => !!tameProps(e);

/* ---- a tamed horse's stance ----
   Sneak + use on a tamed horse takes the next of these (tryTameInteract); `wander` is what every horse does left
   alone. It follows the player whose word it was (`ownerId`, their profile; houndOwner in entities/hellhound.js finds
   them), at a walk near and a run when left behind; it does not come to them from out of range as a hound does.
   Told to lie it lies down (the pose is in _updateGrazer, entities/grazers.js); told to wait it stands. A rider overrides all of it,
   and a blow still sends it bolting. */
const HORSE_STANCES = ['lie', 'wait', 'wander', 'follow'];
const HORSE_FOLLOW_NEAR = 3.5, HORSE_FOLLOW_FAR = 7, HORSE_FOLLOW_RUN_AT = 14;
// the speed it wants this step, its heading set; from _updateGrazer's heading, for any stance but 'wander'
function horseStanceMove(e, dt) {
  e.state = 'stay';                              // not 'idle': an idle horse puts its head down to graze
  if (e.stance !== 'follow') return 0;
  const p = typeof houndOwner === 'function' ? houndOwner(e) : null;
  if (!p || p.dead || !p.spawned) return 0;
  const dx = p.pos.x - e.x, dz = p.pos.z - e.z, d = Math.hypot(dx, dz);
  if (d > HORSE_FOLLOW_FAR || (e._following && d > HORSE_FOLLOW_NEAR)) {
    e._following = true;
    e.yaw = Math.atan2(dx, dz);
    return (d > HORSE_FOLLOW_RUN_AT ? HORSE_FOLLOW_RUN : HORSE_FOLLOW_SPEED) * horseSpeedStat(e);
  }
  e._following = false;
  return 0;
}
/* Whom a horse turns its head to, or null. With no rider and not bolting: whoever just petted it; else the
   nearest player when it is theirs to mind — tamed or won over, and not head-down grazing (a horse left to wander
   still grazes when it stands) — or when that player holds something it eats. */
const _playerHolds = (p) => (typeof withPlayer === 'function' ? withPlayer(p, () => slotId(HOTBAR[hotbarSel])) : slotId(HOTBAR[hotbarSel]));
function horseLooksAt(e, tp) {
  if (e.rider || e.fleeT > 0) return null;
  if (e._lookT > 0 && e._lookAt) return e._lookAt;
  if (!tp || tp.dead) return null;
  const dx = tp.pos.x - e.x, dz = tp.pos.z - e.z;
  if (dx * dx + dz * dz > ENT_LOOK_R * ENT_LOOK_R) return null;
  const mine = e.tame || e.loved;
  if (mine && (e.state !== 'idle' || (e.stance && e.stance !== 'wander'))) return tp;
  const held = _playerHolds(tp), tpr = TAMEABLE.horse;
  return held != null && (tpr.food.includes(held) || (mine && tpr.feed[held] > 0)) ? tp : null;
}
/* ---- petting ----
   E (pad North) pressed on an animal you tamed: hearts, and it turns its head to you for a while. While you look at
   one E is the animal's, so it does not pick the grass at your feet (updatePetting's answer, 22-main-loop.js). */
const PET_CD = 0.8, PET_LOOK_S = 4;
function petTarget() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return null;
  const ent = pickEntity(ENT_INTERACT_REACH);
  return ent && ent.tame && !ent.rider && !ent.boss ? ent : null;
}
function updatePetting(dt, held) {
  const p = player;
  if (p._petCd > 0) p._petCd -= dt;
  const fresh = held && !p._petHeld;
  p._petHeld = !!held;
  if (!held) return false;
  const ent = petTarget();
  if (!ent) return false;
  if (fresh && !(p._petCd > 0)) {
    p._petCd = PET_CD;
    ent._lookAt = p; ent._lookT = PET_LOOK_S; ent._petT = 1.5;
    if (typeof fxTamed === 'function') fxTamed(ent.x, ent.y + entH(ent) * 0.9, ent.z, 3);
    playSound('wool', { gain: 0.45, rate: 1.35, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
    if (typeof handPlaceSwing !== 'undefined') handPlaceSwing = true;
    feedInfo(`You pet ${ent.name}`);
  }
  return true;
}
const _petHint = () => `(<b>${typeof lastInputDevice !== 'undefined' && lastInputDevice === 'pad' ? padNorthLabel() : 'E'}</b>) pet`;

var _mountCd = 0;                    // short debounce so one click cannot mount and dismount

/* ---- milking ----
   An empty bucket used on a cow fills with milk. Each cow then needs COW_MILK_COOLDOWN seconds before it
   can be milked again — counted down in updateEntities and kept in the save. */
const COW_MILK_COOLDOWN = 600;       // 10 minutes
function tryMilkCow() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return false;
  if (act && act.place) return false;            // fresh presses only
  const slot = HOTBAR[hotbarSel];
  if (slotId(slot) !== ITEM.BUCKET) return false;
  const cow = pickEntity(4.0);
  if (!cow || cow.kind !== 'cow') return false;
  // only a female gives milk
  if (cow.gender !== 'F') { feedInfo('Only a female cow can be milked'); return true; }
  if (cow.milkCd > 0) {
    const m = Math.ceil(cow.milkCd / 60);
    feedInfo(`This cow was milked recently: try again in ${m} min`);
    return true;
  }
  /* milking takes MILK_TIME of the right button held. The press only starts it; updateMilking (once a frame,
     from tickPlayer) carries it through or drops it. */
  if (!player._milk)
    player._milk = { cow, t: 0, sel: hotbarSel, hp: cow.hp, px: player.pos.x, py: player.pos.y, pz: player.pos.z, cx: cow.x, cz: cow.z };
  cow._milkHold = MILK_HOLD_S;
  return true;
}
/* The hold. While it runs you stand still (tickPlayer treats it as it does working a bench: no walking, no
   looking away) and so does the cow (_updateGrazer, entities/grazers.js: `_milkHold`). Anything that moves either of you ends it — a
   shove, a current, a fall, the cow struck — as does letting the button go, changing the held slot, or the cow's
   health dropping. `held` is the RAW right button: the controls are locked while it runs. Returns 0..1. */
const MILK_TIME = 2, MILK_MOVE_MAX = 0.3, MILK_HOLD_S = 0.3;
function updateMilking(dt, held) {
  /* `_milkLatch`: the button was still down when the hold ended, done or dropped. Until it is let go it counts for
     nothing else (tickPlayer's wantPlace), or the full bucket now in your hand would be drunk on the spot. */
  if (!held) player._milkLatch = false;
  const m = player._milk;
  if (!m) { player._milkProg = 0; return 0; }
  player._milkLatch = !!held;
  const cow = m.cow, slot = HOTBAR[hotbarSel];
  const here = typeof ENTITIES === 'undefined' || !Array.isArray(ENTITIES) || ENTITIES.includes(cow);
  const ok = held && playing && !invOpen && !menuScene && !player.dead && !player.riding
    && hotbarSel === m.sel && slotId(slot) === ITEM.BUCKET
    && here && cow.hp > 0 && cow.hp >= m.hp && !(cow.milkCd > 0)
    && Math.hypot(player.pos.x - m.px, player.pos.z - m.pz) <= MILK_MOVE_MAX && Math.abs(player.pos.y - m.py) <= 0.5
    && Math.hypot(cow.x - m.cx, cow.z - m.cz) <= MILK_MOVE_MAX;
  if (!ok) {
    player._milk = null; player._milkProg = 0;
    if (m.t > 0.2 && typeof feedInfo === 'function') feedInfo('Milking interrupted');
    return 0;
  }
  m.t += dt;
  cow._milkHold = MILK_HOLD_S;                       // refreshed every frame: it stands for as long as you hold
  if (m.t < MILK_TIME) { player._milkProg = m.t / MILK_TIME; return player._milkProg; }
  player._milk = null; player._milkProg = 0;
  cow.milkCd = COW_MILK_COOLDOWN;
  slot.count--;
  if (slot.count <= 0) HOTBAR[hotbarSel] = mkSlot(ITEM.MILK_BUCKET, 1);   // the last bucket becomes the milk
  else if (!tryPickup(ITEM.MILK_BUCKET, null, 'milked')) throwFromPlayer(ITEM.MILK_BUCKET, 1);
  if (slot.count <= 0 && typeof feedItem === 'function') feedItem(ITEM.MILK_BUCKET, 1, 'milked');
  saveHotbar(); buildHotbar(); updateHotbar();
  playSound('fillWater', { gain: 0.8, rate: 1.1, pos: { x: cow.x, y: cow.y + 1, z: cow.z } });
  addXP(XP_MILK, 'milking');                                    // 0.8283; 100 since 0.8446
  return 1;
}

/* ---------------------------------- the interaction ----------------------------------
   Called from _doPlace before anything else looks at blocks, so using an animal always beats
   placing a block behind it. Returns true when it handled the click. */
function tryTameInteract() {
  if (!playing || menuScene || invOpen || player.dead) return false;
  if (typeof nameDialogOpen === 'function' && nameDialogOpen()) return false;
  if (act && act.place) return false;            // fresh presses only — never the auto-repeat
  if (_mountCd > 0) return false;
  if (player.riding) return false;               // already up there; sneak to get down
  const ent = pickEntity(4.0);
  const tp = tameProps(ent);
  if (!tp) return false;
  const slot = HOTBAR[hotbarSel];
  const held = slotId(slot);

  /* Feeding comes before mounting: holding food at a hungry tamed animal means "eat this", not
     "let me on". A full one ignores the food and you climb on as usual, so a stack of wheat in
     your hand never locks you out of your own horse. */
  const meal = ent.tame && tp.feed ? tp.feed[held] : 0;
  if (meal > 0 && entHunger(ent) < ENT_HUNGER_MAX - 0.5) {
    ent.hunger = Math.min(ENT_HUNGER_MAX, entHunger(ent) + meal);
    if (!player.canFly) {
      slot.count--;
      if (slot.count <= 0) HOTBAR[hotbarSel] = null;
      saveHotbar(); buildHotbar(); updateHotbar();
    }
    playSound('chew', { gain: 0.8, rate: 1.0, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
    toast(`${ent.name} ate — hunger ${Math.round(ent.hunger)}/${ENT_HUNGER_MAX}`);
    return true;
  }

  // tack: a tamed animal takes a saddle from a plain use
  if (ent.tame && held === ITEM.SADDLE && !ent.saddled) {
    ent.saddled = true;
    if (ent.model && ent.model.saddle) ent.model.saddle.visible = true;
    if (!player.canFly) {
      slot.count--;
      if (slot.count <= 0) HOTBAR[hotbarSel] = null;
      saveHotbar(); buildHotbar(); updateHotbar();
    }
    playSound('wool', { gain: 0.7, rate: 0.9, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
    toast(`saddled ${ent.name}`);
    return true;
  }

  if (!ent.tame) {
    if (!ent.loved) {
      /* The two conditions are reported separately on purpose: "it ignores you" when you are
         standing up is a different problem from "it wants a golden apple", and a player who is
         told the wrong one gives up on the whole idea. */
      if (!player.sneaking) { toast(`sneak up on the ${tp.label} to approach it`); return true; }
      if (!tp.food.includes(held)) { toast(`it will only take a ${ITEM_PROPS[tp.food[0]].name.toLowerCase()}`); return true; }
      if (!player.canFly && tp.consumeFood) {
        slot.count--;
        if (slot.count <= 0) HOTBAR[hotbarSel] = null;
        saveHotbar(); buildHotbar(); updateHotbar();
      }
      ent.loved = true;
      ent.fleeT = 0;
      if (typeof fxTamed === 'function') fxTamed(ent.x, ent.y + 1.2, ent.z, 3);   // a few hearts: it likes you
      playSound('chew', { gain: 0.8, rate: 1.0, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
      toast(`the ${tp.label} lets you close — use it again to climb on`);
      return true;
    }
    mountRider(player, ent);
    return true;
  }
  // sneak + use on a tamed one: its next stance, and it is this player's word it keeps
  if (player.sneaking && ent.kind === 'horse') {
    ent.stance = HORSE_STANCES[(HORSE_STANCES.indexOf(ent.stance || 'wander') + 1) % HORSE_STANCES.length];
    ent.owner = player; ent.ownerId = player.profileId || null;
    ent._following = false; ent.wanderT = 0;
    toast(`${ent.name}: ${ent.stance}`);
    return true;
  }
  mountRider(player, ent);
  return true;
}

/* What the crosshair says about the animal you are looking at. Returns HTML for the interact
   prompt, or null when there is nothing to say. Read once a frame by ui/hud.js. */
/* Two rows. The first is the animal's identity and never changes shape:
     "{F|M} {name} {level} lvl"
   The second is whatever the next step with it is — how to tame it while wild, how far along
   the taming is once it has accepted you, and its stats once it is yours. */
const _esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Hover label for EVERY entity, not just tameable ones: "{F|M} {name} {level} lvl" (a monster has
   no gender), readable out to twice the reach you need to interact with it. Needs a clear line of sight,
   so names never show through walls. The taming row below still only appears within interaction reach,
   where you could actually act on it. */
const ENT_INTERACT_REACH = 4.0, ENT_LABEL_REACH = ENT_INTERACT_REACH * 2;
// the name is player-typed once tamed, so it is escaped before it goes into innerHTML
const entityHead = (ent) =>
  `${ent.gender || ''} <b>${_esc(ent.name)}</b>${typeof entitySizeText === 'function' ? entitySizeText(ent) : ''} ${ent.level != null ? ent.level + ' lvl' : ''}`.trim();   // size 0.8324

/* ---------------------------------- mounting ---------------------------------- */
function mountRider(p, e) {
  if (e.rider && e.rider !== p) { toast(`someone is already riding ${e.name}`); return false; }
  const tp = tameProps(e);
  p.riding = e; e.rider = p;
  p.flying = false; p.vy = 0; p.sneaking = false;
  p._rideFwd = 0; p._rideJump = false;
  e.fleeT = 0; e.state = 'idle'; e.bolt = 0;
  _mountCd = 0.5;
  if (e.tame) toast(tp && tp.needsSaddle && !e.saddled
    ? `riding ${e.name} — it needs a saddle before it will steer`
    : `riding ${e.name}`);
  else toast('hold on — sneak to let go');
  return true;
}
/* `silent` is for the paths that are not the player letting go: the animal died, the world was
   unloaded. Those must not count as being thrown off. */
function dismountRider(p, silent) {
  const e = p && p.riding;
  if (!e) return;
  p.riding = null; e.rider = null;
  p._rideFwd = 0; p._rideJump = false;
  _mountCd = 0.5;
  // step off to the animal's side, and never into a wall
  const sx = Math.sin(e.yaw + Math.PI / 2), sz = Math.cos(e.yaw + Math.PI / 2);
  const cand = [[e.x + sx * 1.1, e.z + sz * 1.1], [e.x - sx * 1.1, e.z - sz * 1.1], [e.x, e.z]];
  for (const [cx, cz] of cand) {
    if (!isSolid(Math.floor(cx), Math.floor(e.y), Math.floor(cz)) &&
        !isSolid(Math.floor(cx), Math.floor(e.y + 1), Math.floor(cz))) {
      p.pos.set(cx, e.y, cz);
      break;
    }
  }
  p.vy = 0;
  if (!silent && !e.tame && (e.tameProg || 0) > 0) {
    e.bucked = (e.bucked | 0) + 1;                // costs part of the boost taming would have given
    toast(`you let go of the ${(tameProps(e) || {}).label || 'animal'} — it will trust you a little less`);
  }
  hideTameBar();
}

/* ---------------------------------- progress ----------------------------------
   One call per frame from the main loop, inside the active player's context. */
function updateTaming(dt) {
  if (_mountCd > 0) _mountCd -= dt;
  const e = player.riding;
  if (!e) { hideTameBar(); hideRidePanel(); return; }
  if (!ENTITIES.includes(e)) { dismountRider(player, true); return; }   // it died under you
  updateRidePanel(e);
  const tp = tameProps(e);
  if (!tp || e.tame) { hideTameBar(); return; }
  const pace = (typeof hasSkill === 'function' && hasSkill('gentleHand')) ? 1.1 : 1;   // Gentle Hand
  e.tameProg = Math.min(1, (e.tameProg || 0) + dt * pace / tp.tameTime);
  showTameBar(e, tp);
  if (e.tameProg >= 1) finishTaming(e, tp);
}

function finishTaming(e, tp) {
  e.tame = true;
  e.loved = false;
  e.tameProg = 1;
  /* The reward, once per animal. Every dismount along the way has already been counted, and each
     one shaves a quarter off what is granted here — a horse you rode out in one go is measurably
     better than one you kept falling off. */
  if (!e.boosted) {
    e.boosted = true;
    const keep = Math.max(0, 1 - (e.bucked | 0) * tp.buckPenalty);
    if (e.stats) {
      e.stats.maxHp = Math.round(e.stats.maxHp + tp.boost.hp * keep);
      e.stats.speed = +(e.stats.speed + tp.boost.speed * keep).toFixed(3);
      e.stats.jump  = +(e.stats.jump  + tp.boost.jump  * keep).toFixed(3);
      e.hp = e.stats.maxHp;
    }
  }
  playSound('chestOpen', { gain: 0.7, rate: 1.4, pos: { x: e.x, y: e.y + 1, z: e.z } });
  if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 1.2, e.z);   // hearts and sparkles
  dismountRider(player, true);
  toast(`tamed the ${tp.label}!`);
  addXP(XP_TAME + XP_TAME_PER_LEVEL * (e.level | 0), 'taming');   // 60 and two a level (10 and one since 0.8283)
  openNameDialog(e, tp);
}
