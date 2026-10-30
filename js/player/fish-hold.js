'use strict';
/* player/fish-hold.js: a live fish in both hands. Taking one (the right button held FISH_GRAB_S on a fish), carrying it
   while it tries to wriggle free, letting it go, and how it looks: in first person between the two arms (player/hands.js
   and 40-shield.js pose the arms), on the body for everyone else (player/body.js). A fish in hand is what tames an otter:
   E on one gives it (entities/otter.js).

   WHAT IT IS. Taken, the fish leaves the world (its creature is removed) and lives on the player as `player._heldFish`:
   { species, size, level, hp, name, t, need }. `t` is how long it has wriggled and `need` how long it takes to get free:
   FISH_FREE_S by species, shorter the higher its level (FISH_FREE_LVL), and FISH_FREE_WET times as fast with your head
   under water. The prompt under the crosshair says how much is left. Let go, or free, it is summoned again in front of
   you: in water it swims off, on land it flops toward water (entities/fish.js).
   OUT OF WATER it breathes as a stranded fish does (`dry`, FISH_DRY_GRACE in entities/fish.js; your head under water gives it
   air), then suffocates slowly; one that dies in your hands is its raw fish. The prompt shows its air.
   It is saved with the world's creatures, as a fish where its holder stands (entities/save.js): a world joined again
   finds it on the ground at their feet.

   WHILE IT IS HELD both hands are full: nothing else in them shows (mainHandBusy / offHandBusy, player/hands.js), the
   hotbar does not move (hotbarLocked, 17-input.js), the left button does nothing, the right button only lets it go
   (_doPlace), E only gives it to an otter (tickPlayer). Dying lets it go. */
const FISH_GRAB_S = 0.5;                         // seconds the right button is held on a fish to take it
const FISH_GRAB_REACH = 4;
const FISH_FREE_S = { cod: 45, salmon: 36, pike: 30, catfish: 27 };   // seconds a fish of level 1 takes to wriggle free...
const FISH_FREE_LVL = 0.5;                       // ...and this share less at the highest level
const FISH_FREE_WET = 3;                         // with your head under water it slips out this many times as fast
// both hands hold a fish: the hotbar stays where it is (17-input.js)
const hotbarLocked = () => !!(player && player._heldFish);
// what keeps its own right button: food and drink, a bow, a shield, a throw, a bucket or a bottle in the hand
function _grabBlockedBy(id) {
  if (id == null) return false;
  if (foodPropsOf(id)) return true;
  if (id < 256) return false;
  const p = ITEM_PROPS[id] || {};
  return !!(p.shield || p.drink || p.ranged || p.throwable) || id === ITEM.BUCKET || id === ITEM.WATER_BUCKET
      || id === ITEM.LAVA_BUCKET || id === ITEM.GLASS_BOTTLE;
}

/* ---- taking one ---- */
// from _doPlace: the right button pressed on a fish starts the hold (updateFishGrab carries it). True: the click is the fish's
function tryGrabFish() {
  if (player._fishGrab) return true;               // a hold under way: nothing is placed behind the fish meanwhile
  if (!playing || menuScene || invOpen || player.dead || player.riding || player._heldFish) return false;
  if (act && act.place) return false;              // fresh presses only
  if (_grabBlockedBy(slotId(HOTBAR[hotbarSel]))) return false;
  const ent = pickEntity(FISH_GRAB_REACH);
  if (!ent || !isFish(ent) || !(ent.hp > 0)) return false;
  player._fishGrab = { ent, t: 0 };
  ent._grabHold = 0.3;
  return true;
}
/* The hold, once a frame per seat (tickPlayer): the button down and the crosshair on the fish, which keeps still for it
   (`_grabHold`, entities/fish.js). Returns 0..1 for the progress ring (interactProgress, ui/hud.js). */
function updateFishGrab(dt, held) {
  const g = player._fishGrab;
  if (!g) return 0;
  const e = g.ent;
  const ok = held && playing && !invOpen && !player.dead && !player._heldFish && ENTITIES.includes(e) && e.hp > 0
    && pickEntity(FISH_GRAB_REACH + 0.5) === e;
  if (!ok) { player._fishGrab = null; return 0; }
  player._milkLatch = true;                        // the button still down afterward lets nothing go (tickPlayer)
  e._grabHold = 0.3;
  g.t += dt;
  if (g.t < FISH_GRAB_S) return g.t / FISH_GRAB_S;
  player._fishGrab = null;
  _takeFish(e);
  return 0;
}
function _takeFish(e) {
  const i = ENTITIES.indexOf(e);
  if (i < 0) return;
  const species = FISH[e.species] ? e.species : 'cod', level = e.level || 1;
  player._heldFish = { species, size: e.size || 1, level, hp: e.hp, name: e.name || FISH[species].name, t: 0,
                       need: FISH_FREE_S[species] * (1 - FISH_FREE_LVL * (level - 1) / (ENT_LEVEL_MAX - 1)),
                       dry: e.dryT || 0, suffT: 0,        // seconds out of water so far (it may have lain stranded)
                       jolt: 0, joltT: 0.6, anim: 0 };
  _removeEntity(i);
  playSound('swim', { gain: 0.6, rate: 1.35, pos: { x: e.x, y: e.y, z: e.z } });
  if (typeof fxSplash === 'function') fxSplash(e.x, e.y + 0.3, e.z);
  feedInfo(`You caught a ${player._heldFish.name} in your hands`);
}

/* ---- carrying it ---- */
// once a frame per seat (tickPlayer): it wriggles, bucking now and then (`jolt`, harder near the end), and in time gets free
function updateHeldFish(dt) {
  const f = player._heldFish;
  if (!f) return;
  if (player.dead) { releaseHeldFish(true); return; }
  if (!playing || menuScene) return;
  f.t += dt * (player._eyeUnder ? FISH_FREE_WET : 1);
  f.joltT -= dt;
  if (f.joltT <= 0) {
    f.joltT = 0.4 + Math.random() * 1.6 * (1 - 0.7 * Math.min(1, f.t / f.need));
    f.jolt = 1;
    if (Math.random() < 0.5) playSound('swim', { gain: 0.25, rate: 1.6 + Math.random() * 0.3, pos: { x: player.pos.x, y: player.pos.y + 1, z: player.pos.z } });
  }
  f.jolt = Math.max(0, f.jolt - dt * 3.5);
  f.anim += dt * (5 + 12 * f.jolt);
  // its air: out of the water it lasts FISH_DRY_GRACE, then it loses FISH_DRY_HP every FISH_DRY_EVERY (entities/fish.js)
  f.dry = player._eyeUnder ? 0 : f.dry + dt;
  if (f.dry > FISH_DRY_GRACE) {
    f.suffT -= dt;
    if (f.suffT <= 0) {
      f.suffT = FISH_DRY_EVERY;
      f.hp -= FISH_DRY_HP; f.jolt = 1;
      if (f.hp <= 0) { _heldFishDied(f); return; }
    }
  }
  if (f.t >= f.need) releaseHeldFish(true);
}
// it suffocated in your hands: what is left is its raw fish
function _heldFishDied(f) {
  player._heldFish = null;
  const id = (FISH[f.species] || FISH.cod).item;
  if (!player.canFly && !tryPickup(id, null, 'caught')) throwFromPlayer(id, 1);
  feedInfo(`The ${f.name} died in your hands`);
}
/* Let go (the right button, `free` false) or wriggled free (true): back into the world in front of your chest, a little
   out from you, or at your feet against a wall. Wriggled free it leaps further. Returns the fish. */
function releaseHeldFish(free) {
  const f = player._heldFish;
  if (!f) return null;
  player._heldFish = null;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);   // where the player looks, along the ground
  const y = player.pos.y + 1.0;
  let reach = 0.7;
  while (reach > 0 && isSolid(Math.floor(player.pos.x + fx * reach), Math.floor(y), Math.floor(player.pos.z + fz * reach))) reach -= 0.1;
  reach = Math.max(0, reach);
  const x = player.pos.x + fx * reach, z = player.pos.z + fz * reach;
  const e = summon('fish', x, y, z, { species: f.species, size: f.size, level: f.level, hp: f.hp, hx: x, hz: z });
  e.yaw = Math.atan2(fx, fz);
  e.vy = free ? 4 : 1.5;
  e.hopX = fx * (free ? 2.6 : 1.2); e.hopZ = fz * (free ? 2.6 : 1.2);
  e.fleeT = FISH_FLEE_TIME;
  e.dryT = f.dry;                                  // its air goes on running down where it left off
  e._fleeFrom = { x: player.pos.x, z: player.pos.z };
  playSound('swim', { gain: 0.5, rate: 1.5, pos: { x, y, z } });
  feedInfo(free ? `The ${f.name} wriggled free` : `You let the ${f.name} go`);
  return e;
}
// the fish in a player's hands as the creature it is, for the save (entities/save.js): a fish row like any other
function heldFishCreature(p) {
  const f = p._heldFish;
  return { kind: 'fish', x: p.pos.x, y: p.pos.y, z: p.pos.z, hx: p.pos.x, hz: p.pos.z, yaw: 0, hp: f.hp, name: f.name,
           inventory: [], species: f.species, size: f.size, level: f.level };
}
// the line under the crosshair while one is held (ui/hud.js): how near it is to getting free, and what the buttons do
function heldFishPrompt() {
  const f = player._heldFish;
  if (!f || !playing || menuScene || invOpen || player.dead) return '';
  const left = Math.max(0, Math.ceil((1 - f.t / f.need) * 100));
  const give = typeof otterFishHint === 'function' ? otterFishHint() : '';   // E gives it to the otter you look at
  const air = FISH_DRY_GRACE - f.dry;
  const breath = air > 0 ? `air ${Math.ceil(air)} s` : '<b style="color:#f08070">suffocating</b>';
  return `<b>${_esc(f.name)}</b> ${f.level} lvl in your hands · <b>${left}%</b> left before it wriggles free · ${breath}`
    + `<br><span style="opacity:.8;font-size:.9em">(<b>use</b>) let it go${give ? ' · ' + give : ''}</span>`;
}

/* ---- how it looks ---- */
// a fish's model for a hand, built again only when the species changes; lit like what is round its holder
function _fishHoldModel(holder, species) {
  if (holder.fishHold && holder.fishHold.species === species) return holder.fishHold;
  if (holder.fishHold) holder.fishHold.root.parent?.remove(holder.fishHold.root);
  const m = buildFish(species);
  m.species = species;
  return (holder.fishHold = m);
}
// the fish's wriggle and buck, the same in either view
function _fishHoldPose(m, f) {
  const a = f.anim, j = f.jolt;
  m.tail.rotation.y = Math.sin(a * 1.3) * (0.45 + 0.4 * j);
  m.swim.rotation.y = -Math.sin(a * 1.3) * 0.15 * (1 + j);
  m.swim.rotation.z = Math.sin(a * 2.1) * 0.35 * j;
  m.swim.rotation.x = Math.sin(a * 0.9) * 0.12 + 0.25 * j * Math.sin(a * 3);
  m.fins[0].rotation.y = 0.3 + Math.sin(a * 2) * 0.35;
  m.fins[1].rotation.y = -0.3 - Math.sin(a * 2) * 0.35;
}
/* First person (from updateHands, player/hands.js, in this seat's hand rig): the fish across the bottom of the view, held
   still in the view's own space whatever the arm's bob, with both arms brought in to it. Returns true while one is held. */
const FP_FISH_AT = [0.02, -0.66, -1.55], FP_FISH_SCALE = 0.85;
function heldFishFirstPerson() {
  const f = player._heldFish, ud = handRoot.userData;
  if (!f) { if (ud.fishHold) ud.fishHold.root.visible = false; return false; }
  const m = _fishHoldModel(ud, f.species);
  if (m.root.parent !== handRoot) handRoot.add(m.root);
  m.root.visible = true;
  m.root.position.set(FP_FISH_AT[0] - handRoot.position.x, FP_FISH_AT[1] - handRoot.position.y + 0.03 * f.jolt * Math.sin(f.anim * 4),
                      FP_FISH_AT[2] - handRoot.position.z);
  m.root.rotation.set(0.15, Math.PI / 2 + 0.25, 0);                   // across the view, its head to the right, a little toward you
  m.root.scale.setScalar((FISH[f.species] || FISH.cod).len * f.size * FP_FISH_SCALE);
  _fishHoldPose(m, f);
  m.mat.color.setScalar(_lightAt(player.pos.x, player.pos.y + 1, player.pos.z));
  return true;
}
/* On the body (from applyCameraView, player/body.js, for this seat's own model): held out in front of the chest in both
   hands, its arms raised and turned in to it. */
function poseHeldFishOnBody(m, p) {
  const f = p._heldFish;
  if (!f) { if (m.fishHold) m.fishHold.root.visible = false; return; }
  const fm = _fishHoldModel(m, f.species);
  if (fm.root.parent !== m.torso) m.torso.add(fm.root);
  fm.root.visible = true;
  fm.root.position.set(0, 7 * PX, 7 * PX);
  fm.root.rotation.set(0, Math.PI / 2, 0);
  fm.root.scale.setScalar((FISH[f.species] || FISH.cod).len * f.size);
  _fishHoldPose(fm, f);
  fm.mat.color.setScalar(_lightAt(p.pos.x, p.pos.y + 1, p.pos.z));
  const shake = 0.08 * f.jolt * Math.sin(f.anim * 4);
  m.armR.rotation.set(-1.05 + shake, 0, 0.42);
  m.armL.rotation.set(-1.05 - shake, 0, -0.42);
}
