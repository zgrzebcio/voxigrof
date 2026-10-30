'use strict';
/* entities/otter.js: the otter. Its numbers, its model and every pose, its own step (body 'otter': updateEntities hands it
   to updateOtter), taming it with live fish, its stances, wearing it round the neck, where it lives, and its save.

   WILD it keeps to the water it was born by (deep beaches, big lakes and rivers), swimming, floating on its back, now and
   then out on the bank sitting up. It is shy: a blow sends every wild otter within OTTER.fleeTogether off at once
   (`fleeTogether` in the creature table, entities/combat.js), into the water and away, very fast there.

   TAMING. A live fish held in both hands (player/fish-hold.js), given with E (otterGiveFish, from tickPlayer). Each fish
   counts its level (a catfish OTTER.catfish times; with the giver's Gentle Hand OTTER.gentle times), and the otter is
   tamed when they add up to OTTER.needLow for an otter of level OTTER.lowTo or under, OTTER.needHigh above that (one
   fish of level 50, or two). A fish of a lower level than the otter costs effectiveness (up to OTTER.lowCost for the
   lowest), which scales the health a tamed one gains (OTTER.boostHp) and part of the warmth it gives worn (scarfColdEff;
   its level gives the rest, scarfColdLvl).

   TAMED. Use: the next stance, taking hold OTTER.stanceWait after the last press: follow · stay · lie · fish · pearls.
   'fish' and 'pearls' are worked from the spot where the stance took hold (`spot`): it hunts the fish within
   OTTER.huntR of it, kills one, carries it there in its mouth and leaves it as a raw fish; or it takes the pearls grown in
   the wild clams there (clamPearlsNear, blocks/clam.js) and leaves them. It does that only while it is in the simulated
   land, as everything a creature does. Use with a raw fish in hand (any otter not someone else's, when it is hungry):
   it eats it, sitting up chewing (_otterFeed; OTTER_FOOD by kind). E: a pat (entities/taming.js), and it rolls onto
   its back for it. Sneak + use: it goes round your neck (otterPutOn): out of the world, kept whole on the
   player as `_wornOtter`, drawn on the body's shoulders (poseOtterScarf), and warming (otterScarfCold, read by the cold
   resistance in player/stat-getters.js). Sneak + use with an empty hand, aiming at no creature: it is set down again
   (otterTakeOff); dying sets it down where you fell. Saved worn, it is a row of the world's creatures where its owner
   stands (entities/save.js) and goes back round their neck when they come (otterWorldTick).

   Its model is js/models/otter.js (a box model facing -Z, read by entities/box-models.js; its sheet
   textures/Entity/Tamable/otter.png): bones body,
   head, tail and four legs, each leg here swinging from its top. Its sounds are its entry's `sounds`: its voice and its cry
   (Sound/Mobs/Otter) pitched well down, the eating sound, and plain footsteps. All numbers are in OTTER. */
const OTTER = {
  hp: 50, scale: 0.95,
  walk: 1.5, run: 4.4,                    // on land: a stroll, a bounding run
  swim: 2.6, dash: 7.5,                   // in water: paddling about, and very fast when it flees
  hunt: 6.5,                              // ...and after a fish (faster than one fleeing it: entities/fish.js) or to a clam
  fleeTime: 6, fleeTogether: 20,          // a blow sends every wild otter within this many blocks off, for this long
  home: 12,                               // a wild one keeps this near the water it was born by
  float: 0.3,                             // how deep its feet hang under the surface when it floats
  air: 24,                                // seconds it holds its breath under water
  // taming
  needLow: 50, needHigh: 100, lowTo: 25,  // the fish levels it takes: an otter of level 25 or under, and over
  catfish: 1.5, gentle: 1.2,              // a catfish counts its level this many times; any fish this many with Gentle Hand
  lowCost: 0.3,                           // effectiveness a fish of a lower level takes, at the most (level 1 to the top level)
  boostHp: 30,                            // health a perfect taming adds
  liveMeal: 40,                           // hunger a live fish given to a tamed one fills
  eatS: 2.4, chewEvery: 0.6,              // fed a fish from the hand: how long it sits eating it, and a chew's sound this often
  // tamed
  stanceWait: 2,                          // seconds before a new stance takes hold
  followNear: 3, followFar: 7, teleport: 30,
  huntR: 16,                              // fishing and pearl hunting: how far from its spot it goes
  huntRest: [5, 5],                       // seconds between one catch and looking for the next
  huntGiveUp: 25,                         // ...and how long it goes after one before it gives up
  reach: 0.7,                             // a bite, edge to edge
  // worn round the neck: cold resistance (0.10 = 10%), this much more a level (+10% at level 50), and up to this much more
  // by its effectiveness
  scarfCold: 0.10, scarfColdLvl: 0.002, scarfColdEff: 0.05,
  // where it lives
  chunkChance: 0.015, packMin: 2, packMax: 3, apart: 80,
  bigWater: 0.55,                         // a lake or river big enough: this share of the samples round it water
};
// what one eats from the hand (the use button, _otterFeed), and how much each fills (out of ENT_HUNGER_MAX)
const OTTER_FOOD = { [ITEM.COD]: 30, [ITEM.PIKE]: 50, [ITEM.SALMON]: 70, [ITEM.CATFISH]: 90 };
const OTTER_STANCES = ['follow', 'stay', 'lie', 'fish', 'pearls'];
const OTTER_STANCE_TEXT = { follow: 'follow', stay: 'stay', lie: 'lie down', fish: 'catch fish', pearls: 'find pearls' };
const _otterStanceText = (s) => OTTER_STANCE_TEXT[s] || s;

/* ---------------------------------- the model ---------------------------------- */
const _otterSrc = () => boxModel('otter', 'textures/Entity/Tamable/otter.png');
_otterSrc();                                  // its sheet fetched from the start
/* An empty root at once, its parts put in the first frame the model is in (_otterDress): a body group at its bone's
   pivot carrying the head, the tail and the four legs, each leg pivoted at its top; and `mouth`, under the snout, where a
   catch is carried. The file faces -Z and the game's creatures +Z: its geometry is turned half round (boxModelGeometry). */
function buildOtter() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const m = { root, mat, mats: [mat], tint: new THREE.Color(1, 1, 1), body: null, head: null, tail: null, legs: [], mouth: null };
  _otterDress(m);
  return m;
}
function _otterDress(m) {
  if (m.body) return true;
  const src = _otterSrc();
  if (!src.ready) return false;
  m.mat.map = src.tex; m.mat.needsUpdate = true;
  const json = src.json, els = json.elements || [];
  const pivot = (name) => (json.bones.find(b => b.name === name) || { pivot: [8, 0, 8] }).pivot;
  const at = (p, pp) => new THREE.Vector3(-(p[0] - pp[0]) / 16, (p[1] - pp[1]) / 16, -(p[2] - pp[2]) / 16);   // turned half round
  const part = (p, pp, list, parent) => {
    const g = new THREE.Group();
    g.position.copy(at(p, pp));
    if (list.length) g.add(new THREE.Mesh(boxModelGeometry(src, list, p, true), m.mat));
    parent.add(g);
    return g;
  };
  const bodyP = pivot('body'), of = (bone) => els.filter(e => e.bone === bone);
  m.body = part(bodyP, [8, 0, 8], of('body'), m.root);
  m.bodyY = m.body.position.y;
  m.head = part(pivot('head'), bodyP, of('head'), m.body);
  m.tail = part(pivot('tail'), bodyP, of('tail'), m.body);
  for (const e of els.filter(e => /^leg_/.test(e.bone || ''))) {
    const top = [(e.from[0] + e.to[0]) / 2, e.to[1], (e.from[2] + e.to[2]) / 2];
    m.legs.push({ g: part(top, bodyP, [e], m.body), front: /_f/.test(e.bone), left: /l$/.test(e.bone) });
  }
  m.mouth = new THREE.Group();
  m.mouth.position.copy(at([8, 3.2, -2.8], pivot('head')));
  m.head.add(m.mouth);
  return true;
}
// what it carries in its mouth: a fish of a species (limp, across its jaws), a pearl, or nothing
function _otterCarryModel(m, what) {
  const key = what || '';
  if (m._carryKey === key) return;
  m._carryKey = key;
  while (m.mouth.children.length) m.mouth.remove(m.mouth.children[0]);
  m.mats = [m.mat];
  if (!what) return;
  if (what === 'pearl') {
    for (const { p, geo, mat, node } of buildDropGeom(ITEM.PEARL)) {
      const o = node || new THREE.Mesh(geo, mat || MATERIALS[p]);
      o.scale.setScalar(0.18); o.position.y = -0.03;
      m.mouth.add(o);
    }
    return;
  }
  const sp = FISH[what] ? what : 'cod', f = buildFish(sp);
  f.root.scale.setScalar(FISH[sp].len * 0.55);
  f.root.rotation.y = Math.PI / 2;
  f.swim.rotation.z = Math.PI / 2 * 0.85;
  f.tail.rotation.y = 0.3;
  m.mouth.add(f.root);
  m.mats.push(f.mat);                          // lit with the otter (shadeTinted)
}
/* Posed once a step, after it has moved. In water it paddles, the hind legs kicking and the tail sculling; fast, its legs
   fold back and it porpoises; resting, it floats on its back, paws on its chest. On land it bounds: the front paws
   together, then the hind ones, its back arching between, a little hop each stride. It sits up on its haunches, lies down,
   and rolls onto its back for a pat. `backK`, `sitK`, `lieK` ease those in and out. */
function otterPose(e, m, dt, spd, inWater, fast) {
  const k = Math.min(1, dt * 5), now = performance.now() / 1000;
  const pet = e._petT > 0, eating = e._eatT > 0;
  // eating, it sits up on land and floats on its back in water, the fish in its paws at its mouth
  const onBack = (inWater && (e.state === 'float' || e.state === 'lie' || eating) && !e._carry) || (!inWater && pet) ? 1 : 0;
  const sit = !inWater && !pet && (e.state === 'sit' || eating) && spd < 0.3 ? 1 : 0;
  const lie = !inWater && !pet && e.state === 'lie' && spd < 0.3 ? 1 : 0;
  e.backK = (e.backK || 0) + (onBack - (e.backK || 0)) * k;
  e.sitK = (e.sitK || 0) + (sit - (e.sitK || 0)) * k;
  e.lieK = (e.lieK || 0) + (lie - (e.lieK || 0)) * k;
  const B = m.body, Hd = m.head, T = m.tail, p = e.walk;
  B.position.y = m.bodyY; B.rotation.set(0, 0, 0); Hd.rotation.set(0, 0, 0); T.rotation.set(0, 0, 0);
  if (inWater) {
    const sw = Math.min(1, spd / OTTER.swim);
    for (const l of m.legs) {
      const ph = p * 1.6 + (l.front ? 0 : Math.PI) + (l.left ? 0 : Math.PI * 0.5);
      l.g.rotation.x = fast ? (l.front ? 1.1 : 1.35) + Math.sin(ph) * 0.15 : (l.front ? 0.5 : 0.9) + Math.sin(ph) * (0.25 + 0.4 * sw);
    }
    T.rotation.y = fast ? 0 : Math.sin(p * 1.3) * (0.2 + 0.35 * sw);
    T.rotation.x = fast ? Math.sin(p * 2.2 + 1) * 0.35 : -0.05;
    B.rotation.x = (fast ? Math.sin(p * 2.2) * 0.12 : 0) - Math.max(-0.6, Math.min(0.6, (e.swimVy || 0) * 0.35));   // nose up as it rises
    B.rotation.y = fast ? 0 : -Math.sin(p * 1.3) * 0.06 * sw;
    B.position.y += Math.sin(now * 2.1 + e.hx) * 0.4 * PX * (1 - sw);                // bobbing where it floats
    Hd.rotation.x = -0.25;                                                             // its head up out of the water
  } else {
    const run = Math.min(1, spd / OTTER.run), s = Math.sin(p);
    B.position.y += Math.abs(s) * 1.4 * PX * run;
    B.rotation.x = -s * 0.2 * run;
    for (const l of m.legs) l.g.rotation.x = (l.front ? s : Math.sin(p + Math.PI * 0.85)) * 0.95 * run;
    T.rotation.x = 0.1 + Math.sin(p + 1.2) * 0.3 * run;
    T.rotation.y = Math.sin(now * 1.7) * 0.12 * (1 - run);
    Hd.rotation.x = s * 0.15 * run;
  }
  // sitting up on its haunches, front paws to its chest, its head kept level
  if (e.sitK > 0.01) {
    const s = e.sitK;
    B.rotation.x -= 0.95 * s; B.position.y += 1.5 * PX * s;
    Hd.rotation.x += 0.95 * s;
    for (const l of m.legs) l.g.rotation.x = l.g.rotation.x * (1 - s) + (l.front ? -0.4 : 0.95) * s;
    T.rotation.x += 0.9 * s;
  }
  // lying down: its belly on the ground, the paws out
  if (e.lieK > 0.01) {
    const s = e.lieK;
    B.position.y -= 1.6 * PX * s;
    for (const l of m.legs) l.g.rotation.x = l.g.rotation.x * (1 - s) + (l.front ? -1.3 : 1.3) * s;
    Hd.rotation.x += 0.2 * s;
  }
  // on its back: floating, or rolled over for a pat (its paws pedalling for it)
  if (e.backK > 0.01) {
    const s = e.backK;
    B.rotation.z = Math.PI * s;
    B.position.y += 2.6 * PX * s;
    for (const l of m.legs) l.g.rotation.x = l.g.rotation.x * (1 - s) + ((l.front ? -0.7 : 0.4) + (pet ? Math.sin(now * 11 + (l.left ? 0 : 2)) * 0.35 : 0)) * s;
    Hd.rotation.x -= 0.45 * s;
    T.rotation.x -= 0.2 * s;
  }
  // its head to whom it minds: whoever just petted it, a player holding a live fish, its owner when it has no work
  const lookP = e._lookT > 0 && e._lookAt ? e._lookAt
              : e._watch || (e.tame && !e._target && !e._carry ? houndOwner(e) : null);
  Hd.rotation.y = _entHeadTurn(e, lookP, dt, m.root.rotation.y) * (1 - e.backK);
  if (e.atkAnimT > 0) Hd.rotation.x += Math.sin(e.atkAnimT / 0.3 * Math.PI) * 0.6;   // a bite: the head snaps down
  if (eating) {                                     // chewing: the head nods quickly, the front paws up holding the fish
    Hd.rotation.x += 0.25 + Math.sin(now * 14) * 0.14;
    for (const l of m.legs) if (l.front) l.g.rotation.x = -1.0 + Math.sin(now * 14 + 1) * 0.08;
  }
  _otterCarryModel(m, e._carry || (eating ? e._eatFish : null));
}

/* ---------------------------------- making one ---------------------------------- */
/* What one otter is made of: its model and what only an otter has. summon('otter', x, y, z, opts) writes the rest
   (entities/mobs.js). `opts`: size, name, hunger, and what its taming got to (tame, taming, eff, ownerId, stance, stats, spot). */
function makeOtter(opts) {
  const size = _animalSize(opts);
  const stats = opts.stats && opts.stats.maxHp > 0 ? opts.stats : null;
  return {
    model: buildOtter(), scale: OTTER.scale * size,
    own: {
      size, stats, name: opts.name || 'Otter',
      hunger: opts.hunger >= 0 ? Math.min(ENT_HUNGER_MAX, +opts.hunger) : ENT_HUNGER_MAX,
      tame: !!opts.tame,
      taming: opts.taming || null,              // { pts, lost, gh, n }: fish levels given, effectiveness lost, Gentle Hand, fish
      eff: opts.eff > 0 ? +opts.eff : null,     // the effectiveness it was tamed at
      owner: null,                              // the player, found from ownerId when wanted (houndOwner, entities/hellhound.js)
      ownerId: opts.ownerId != null ? opts.ownerId : null,
      stance: OTTER_STANCES.includes(opts.stance) ? opts.stance : 'follow',
      stanceNext: null, stanceT: 0,
      spot: opts.spot || null,                  // where its 'fish' or 'pearls' stance took hold
      _carry: null, _huntT: 0, _target: null, _seekT: 0, _diveT: 0,
      airT: OTTER.air, sayT: 4 + Math.random() * 10,
    },
  };
}

/* ---------------------------------- its step ----------------------------------
   updateEntities hands it here after the shared bookkeeping (timers, healing, `tp` the nearest player). It thinks
   (_otterThink: a heading, a speed, and in water how deep to go), moves (water is no hazard to it: it dives in from a
   bank and climbs out onto one), floats at the surface or dives, breathes, then is posed. True when it died. */
const _OTTER_TIMERS = ['fleeT', 'flailT', 'turnCd', '_lookT', '_petT', 'atkAnimT'];   // counted down each step
function updateOtter(e, dt, tp, i) {
  const m = e.model;
  if (!_otterDress(m)) { m.root.position.set(e.x, e.y, e.z); return false; }
  for (const t of _OTTER_TIMERS) if (e[t] > 0) e[t] -= dt;
  if (e.stanceNext) {                         // a stance pressed for, after its wait; worked from here
    e.stanceT -= dt;
    if (e.stanceT <= 0) {
      e.stance = e.stanceNext; e.stanceNext = null;
      e.spot = { x: e.x, y: e.y, z: e.z }; e._target = null; e._huntT = 0; e._following = false;
      _otterTell(e, `${e.name}: ${_otterStanceText(e.stance)}`);
    }
  }
  const bx = Math.floor(e.x), bz = Math.floor(e.z);
  const inWater = isWaterVal(getBlock(bx, Math.floor(e.y + 0.25), bz));
  const surface = inWater ? _otterSurface(e) : null;
  const plan = _otterThink(e, dt, tp, inWater, surface);
  // eating a fish from the hand (_otterFeed): it keeps still, chewing, a chew's sound every OTTER.chewEvery
  const eating = e._eatT > 0;
  if (eating) {
    e._chewT = (e._chewT || 0) - dt;
    if (e._chewT <= 0) { e._chewT = OTTER.chewEvery; mobSound(e, 'eat', 0.6); }
    if ((e._eatT -= dt) <= 0) e._eatFish = null;
  }
  /* ---- across ---- */
  let moved = 0;
  const stunned = (e.kx !== 0 || e.kz !== 0) && !(e.fleeT > 0);
  e.wantMove = plan.speed > 0 && !stunned && !eating;
  if (e.wantMove) {
    const sp = plan.speed * (inWater ? 1 : boxDragMul(e.x, e.y, e.z, _boxR, _boxH));
    const sx = Math.sin(e.yaw) * sp * dt, sz = Math.cos(e.yaw) * sp * dt;
    const bad = (nx, nz) => _entBlocked(nx, e.y, nz) || (!inWater && _otterHazard(nx, e.y, nz));
    let blocked = false;
    if (!bad(e.x + sx, e.z)) { e.x += sx; moved += Math.abs(sx); } else blocked = true;
    if (!bad(e.x, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else blocked = true;
    if (blocked) {
      const climbY = _stepUpTarget(e, e.x + sx, e.z + sz);
      if (inWater && climbY !== null && plan.depth == null) { e.y = climbY; e.x += sx; e.z += sz; e.vy = 1.5; e.jumpCd = 0.3; }   // out onto the bank
      else if (!inWater && e.onGround && e.jumpCd <= 0 && climbY !== null) { e.vy = ENT_JUMP; e.jumpCd = 0.5; e.onGround = false; }
      // a wall in the way: it turns aside; going AT something it keeps at it a while first, then gives that up too
      else if (e.turnCd <= 0 && (!plan.aimed || (e._bumpT = (e._bumpT || 0) + dt) > 1.5)) {
        e.yaw += (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random()); e.turnCd = 0.4;
        if (plan.aimed) { e._bumpT = 0; e.wanderT = 0; }
      }
    } else e._bumpT = 0;
  }
  if (e.kx || e.kz) {                         // a blow's knockback, spent
    const kdx = e.kx * dt, kdz = e.kz * dt;
    if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
    if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
    const kk = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= kk; e.kz *= kk;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
  }
  if (inWater && waterFlowVec(bx, Math.floor(e.y + 0.25), bz, _flowV)) {   // a current carries it a little
    const fdx = _flowV.x * 0.9 * dt, fdz = _flowV.z * 0.9 * dt;
    if (!_entBlocked(e.x + fdx, e.y, e.z)) e.x += fdx;
    if (!_entBlocked(e.x, e.y, e.z + fdz)) e.z += fdz;
  }
  /* ---- up and down: in water to the surface (or down to what it is after), on land gravity ---- */
  const wasGround = e.onGround;
  if (inWater) {
    const want = plan.depth != null ? plan.depth : surface - OTTER.float;
    const step = (plan.depth != null ? 2.5 : 1.6) * dt;
    let ny = e.y + Math.max(-step, Math.min(step, want - e.y));
    if (_entBlocked(e.x, ny, e.z)) ny = e.y;                // the bed under it, a roof over it
    e.swimVy = (ny - e.y) / Math.max(dt, 1e-4);
    e.y = ny; e.vy = 0; e.onGround = false; e.peakY = null;
  } else {
    e.swimVy = 0;
    if (e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z)) { e.y = Math.floor(e.y - 0.02) + 1; e.vy = 0; e.onGround = true; }
    else {
      const ny = _entFallStep(e, dt);
      if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; } e.vy = 0; }
      else { e.y = ny; e.onGround = false; }
    }
    if (_entFallDamage(e, i, wasGround, false)) return true;
  }
  /* ---- breath, lava, cactus: its head under only below the surface (floating, it is out over it) ---- */
  const headY = e.y + entH(e) * 0.85;
  if (isWaterVal(getBlock(bx, Math.floor(headY), bz)) && !(surface != null && headY >= surface - 0.05)) {
    e.airT -= dt;
    if (e.airT <= 0) {
      e.airT = 1; e.hurtT = 0.25; e.hp -= ENT_DROWN_DMG;
      if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return true; }
    }
  } else e.airT = OTTER.air;
  if (e.hazCd > 0) e.hazCd -= dt;
  const feetId = getBlock(bx, Math.floor(e.y + 0.1), bz) & 255;
  if (feetId === B.LAVA) e.fireT = Math.max(e.fireT || 0, LAVA_FIRE_S);
  if (e.hazCd <= 0 && (feetId === B.LAVA || feetId === B.CACTUS)) {
    e.hazCd = ENT_HAZARD_CD; e.hurtT = 0.25; e.hp -= feetId === B.LAVA ? ENT_LAVA_DMG : ENT_CACTUS_DMG;
    if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return true; }
  }
  /* ---- its voice now and then, when someone is near to hear it ---- */
  e.sayT -= dt;
  if (e.sayT <= 0) {
    e.sayT = 8 + Math.random() * 14;
    if (Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) < 16) mobSound(e, 'say', 0.45);
  }
  /* ---- pose ---- */
  const spd = moved / Math.max(dt, 1e-4);
  if (!inWater) entityStepSound(e, dt, spd);
  e.walk += (inWater ? 1.2 + spd * 1.1 : (spd > 0.05 ? Math.min(spd, 7) * 2.2 + 2 : 0)) * dt;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  otterPose(e, m, dt, spd, inWater, !!plan.fast);
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, 0.3);
  return false;
}
// the top of the water over it: up from its middle to the last water cell, and a little under that cell's top
function _otterSurface(e) {
  const x = Math.floor(e.x), z = Math.floor(e.z);
  let y = Math.floor(e.y + 0.25);
  while (y < WORLD_TOP && isWaterVal(getBlock(x, y + 1, z))) y++;
  return y + 0.88;
}
// what it will not walk into on land: lava, cactus, and a drop that would hurt, unless water is at its foot
function _otterHazard(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  for (let dy = 0; dy <= 1; dy++) {
    const id = getBlock(fx, Math.floor(y + dy), fz) & 255;
    if (id === B.LAVA || id === B.CACTUS) return true;
  }
  let d = 0;
  while (d <= ENT_LEDGE_MAX && fy - 1 - d >= 0) {
    const bv = getBlock(fx, fy - 1 - d, fz);
    if (isWaterVal(bv) || CORE.solidVal(bv)) return false;
    if ((bv & 255) === B.LAVA) return true;
    d++;
  }
  return d > ENT_LEDGE_MAX;
}
/* The nearest cell round it that is water (`wet` true) or a dry floor to stand on beside water (false): { x, z } within
   `r`, or null. Looked for again every 1.5 s. */
function _otterSeek(e, dt, wet, r = 10) {
  e._seekT = (e._seekT || 0) - dt;
  if (e._seekT > 0 && e._seekWet === wet) return e._seekAt || null;
  e._seekT = 1.5; e._seekWet = wet;
  const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
  let best = null, bd = Infinity;
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dz * dz;
      if (d >= bd || d > r * r) continue;
      for (let dy = 1; dy >= -3; dy--) {
        const v = getBlock(bx + dx, by + dy, bz + dz);
        if (wet ? isWaterVal(v) : (!isWaterVal(v) && !CORE.solidVal(v) && CORE.solidVal(getBlock(bx + dx, by + dy - 1, bz + dz))
                                     && !isWaterVal(getBlock(bx + dx, by + dy + 1, bz + dz)))) {
          best = { x: bx + dx + 0.5, z: bz + dz + 0.5 }; bd = d; break;
        }
      }
    }
  return (e._seekAt = best);
}
const _otterTell = (e, msg) => { const p = houndOwner(e); if (p && typeof _houndTell === 'function') _houndTell(p, msg); };
const _otterRand = (r) => r[0] + Math.random() * (r[1] - r[0]);

/* ---------------------------------- its mind ----------------------------------
   Returns { speed, depth, fast, aimed }: how fast it goes this step (its heading set), in water the height its feet go to
   (null: float at the surface), whether it swims fast (the pose), whether it is going AT something (it does not turn
   aside at a wall). e.state names what it is doing, for the pose: 'float', 'swim', 'sit', 'lie', 'walk'... */
function _otterThink(e, dt, tp, inWater, surface) {
  const plan = { speed: 0, depth: null, fast: false, aimed: false };
  e._watch = null;
  if (e.fleeT > 0) {
    // away from what struck it, into the water if it is near, and very fast there, a little under the surface
    const from = e._fleeFrom || { x: tp.pos.x, z: tp.pos.z };
    let ang = Math.atan2(e.x - from.x, e.z - from.z);
    if (!inWater) {
      const w = _otterSeek(e, dt, true, 8);
      if (w) { const wa = Math.atan2(w.x - e.x, w.z - e.z); if (Math.cos(wa - ang) > -0.3) ang = wa; }
    }
    if (e.turnCd <= 0) { e.yaw = ang + (Math.random() - 0.5) * 0.6; e.turnCd = 0.35; }
    plan.speed = inWater ? OTTER.dash : OTTER.run;
    plan.fast = inWater;
    if (inWater) plan.depth = surface - 1.3;
    e.state = 'flee';
    return plan;
  }
  if (e.tame) return _otterOwned(e, dt, inWater, surface, plan);
  return _otterWild(e, dt, tp, inWater, surface, plan);
}
/* A wild one about its water: swimming, floating on its back, now and then ashore sitting up or walking the bank, back
   toward home (its birth water, hx hz) once past OTTER.home. A player near with a live fish in their hands: it stops and
   watches them. */
function _otterWild(e, dt, tp, inWater, surface, plan) {
  if (tp && !tp.dead && tp._heldFish && Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) < 8) {
    e._watch = tp; e.state = inWater ? 'float' : 'sit';
    return plan;
  }
  const hdx = e.hx - e.x, hdz = e.hz - e.z, homeD = Math.hypot(hdx, hdz);
  e.wanderT -= dt;
  if (e.wanderT <= 0) {
    e.wanderT = 3 + Math.random() * 6;
    const r = Math.random();
    if (homeD > OTTER.home) e.state = 'home';
    else if (inWater) e.state = r < 0.35 ? 'float' : r < 0.88 ? 'swim' : 'ashore';
    else e.state = r < 0.35 ? 'sit' : r < 0.75 ? 'towater' : 'walk';
    if (e.state === 'swim' || e.state === 'walk') e.yaw = Math.random() * Math.PI * 2;
    if (e.state === 'swim' && Math.random() < 0.3) e._diveT = 1.5 + Math.random() * 2.5;   // a dive for the fun of it
  }
  switch (e.state) {
    case 'home':
      e.yaw = Math.atan2(hdx, hdz); plan.speed = inWater ? OTTER.swim : OTTER.walk * 1.5;
      if (homeD < 3) e.wanderT = 0;
      break;
    case 'swim': case 'walk':
      plan.speed = inWater ? OTTER.swim : OTTER.walk;
      if (e.state === 'walk' && inWater) e.state = 'swim';
      break;
    case 'ashore': {
      if (!inWater) { e.state = 'sit'; break; }
      const l = _otterSeek(e, dt, false, 8);
      if (!l) { e.state = 'swim'; break; }
      e.yaw = Math.atan2(l.x - e.x, l.z - e.z); plan.speed = OTTER.swim; plan.aimed = true;
      break;
    }
    case 'towater': {
      if (inWater) { e.state = 'swim'; break; }
      const w = _otterSeek(e, dt, true, 10);
      if (!w) { e.state = 'walk'; break; }
      e.yaw = Math.atan2(w.x - e.x, w.z - e.z); plan.speed = OTTER.walk * 1.6; plan.aimed = true;
      break;
    }
    default: if (inWater && e.state !== 'float') e.state = 'float';   // 'float', 'sit': it stays
  }
  if (inWater && e._diveT > 0) { e._diveT -= dt; plan.depth = surface - 2.2; }
  return plan;
}
// one of somebody's, by its stance
function _otterOwned(e, dt, inWater, surface, plan) {
  if (e.stance === 'fish' || e.stance === 'pearls') return _otterHunt(e, dt, inWater, surface, plan);
  if (e.stance === 'stay') { e.state = inWater ? 'float' : 'stand'; return plan; }
  if (e.stance === 'lie') { e.state = 'lie'; return plan; }
  const owner = houndOwner(e);
  if (!owner || owner.dead || !owner.spawned) { e.state = inWater ? 'float' : 'sit'; return plan; }
  const dx = owner.pos.x - e.x, dz = owner.pos.z - e.z, d = Math.hypot(dx, dz);
  if (d > OTTER.followFar || (e._following && d > OTTER.followNear)) {
    e._following = true; e.yaw = Math.atan2(dx, dz); plan.aimed = true;
    plan.speed = inWater ? (d > 12 ? OTTER.dash : OTTER.swim * 1.3) : (d > 12 ? OTTER.run : OTTER.walk * 1.8);
    plan.fast = inWater && d > 12;
    e.state = 'follow';
  } else { e._following = false; e.state = inWater ? 'float' : 'sit'; }
  return plan;
}
/* 'fish' and 'pearls': from its spot it goes after the nearest fish (or wild clam with a pearl) within OTTER.huntR of
   it, takes it in its mouth (a fish dies: it leaves nothing but what the otter brings back), carries it to the spot and
   leaves it there; then it rests OTTER.huntRest before the next. One it cannot reach in OTTER.huntGiveUp is let be. */
function _otterHunt(e, dt, inWater, surface, plan) {
  const spot = e.spot || (e.spot = { x: e.x, y: e.y, z: e.z }), fish = e.stance === 'fish';
  const toSpot = () => {
    const dx = spot.x - e.x, dz = spot.z - e.z, d = Math.hypot(dx, dz);
    if (d > 0.9) { e.yaw = Math.atan2(dx, dz); plan.speed = inWater ? OTTER.swim * 1.4 : OTTER.walk * 1.8; plan.aimed = true; }
    return d;
  };
  if (e._carry) {
    e.state = 'carry';
    if (toSpot() > 1.2) return plan;
    const id = e._carry === 'pearl' ? ITEM.PEARL : (FISH[e._carry] || FISH.cod).item;
    spawnDrop(id, Math.floor(spot.x), Math.floor(spot.y), Math.floor(spot.z), { x: 0, y: 1.5, z: 0 }, 0.5);
    e._carry = null; e._huntT = _otterRand(OTTER.huntRest);
    mobSound(e, 'say', 0.5);
    return plan;
  }
  const rest = () => { if (toSpot() <= 0.9) e.state = inWater ? 'float' : 'sit'; else e.state = 'walk'; return plan; };
  if (e._huntT > 0) { e._huntT -= dt; return rest(); }
  const t = e._target;
  const good = t && (fish ? ENTITIES.includes(t) && t.hp > 0 && !t._killedByMob && Math.hypot(t.x - spot.x, t.z - spot.z) <= OTTER.huntR + 4
                          : (getBlock(t.x, t.y, t.z) & 255) === B.CLAM && clamHasOf((getBlock(t.x, t.y, t.z) >> 8) & 255) === BLOCKS.CLAM_BITS.PEARL);
  if (!good) {
    e._target = null;
    e._lookAgainT = (e._lookAgainT || 0) - dt;
    if (e._lookAgainT > 0) return rest();
    e._lookAgainT = 1.5;
    e._target = fish ? _otterFindFish(spot) : (clamPearlsNear(spot.x, spot.y, spot.z, OTTER.huntR)[0] || null);
    e._chaseT = 0;
    if (!e._target) { e._huntT = 4; return rest(); }
  }
  const g = e._target;
  const tx = fish ? g.x : g.x + 0.5, ty = fish ? g.y : g.y, tz = fish ? g.z : g.z + 0.5;
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  e.yaw = Math.atan2(dx, dz); plan.aimed = true;
  plan.speed = inWater ? (d > 3 ? OTTER.hunt : 2.2) : OTTER.run;
  plan.fast = inWater && d > 3;
  if (inWater) plan.depth = Math.min(surface - OTTER.float, ty);
  e.state = 'hunt';
  e._chaseT += dt;
  if (e._chaseT > OTTER.huntGiveUp) { e._target = null; e._huntT = 3; return plan; }
  if (d < OTTER.reach + (fish ? entR(g) : 0.5) && Math.abs(ty - e.y) < 0.9) {
    if (fish) { g.hp = 0; g._killedByMob = true; e._carry = g.species; }   // taken away at its next turn, leaving nothing (updateEntities)
    else if (clamTakePearl(g.x, g.y, g.z)) e._carry = 'pearl';
    e._target = null; e.atkAnimT = 0.3;
    mobSound(e, 'eat', 0.5);
  }
  return plan;
}
// the nearest fish in the simulated land within OTTER.huntR of its spot, or null
function _otterFindFish(spot) {
  let best = null, bd = OTTER.huntR;
  for (const f of ENTITIES) {
    if (!isFish(f) || !(f.hp > 0) || f._killedByMob || f.active === false || Math.abs(f.y - spot.y) > 14) continue;
    const d = Math.hypot(f.x - spot.x, f.z - spot.z);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

/* ---------------------------------- taming: a live fish given with E ---------------------------------- */
const otterNeed = (e) => (e.level || 1) <= OTTER.lowTo ? OTTER.needLow : OTTER.needHigh;
const otterEff = (e) => e.taming ? Math.max(0.1, Math.min(1, 1 - (e.taming.lost || 0))) : (e.eff > 0 ? e.eff : 1);
/* From tickPlayer while a fish is held: E (a fresh press) on an otter gives it the fish. True while an otter is under the
   crosshair, so E is the otter's and not a pat's or the bushes'. */
function otterGiveFish(held) {
  const fresh = held && !player._otterEDown;
  player._otterEDown = !!held;
  if (!held || !player._heldFish || player.riding) return false;
  const e = pickEntity(ENT_INTERACT_REACH);
  if (!e || e.kind !== 'otter') return false;
  if (!fresh) return true;
  const f = player._heldFish, owner = houndOwner(e);
  if ((e.tame || e.taming) && owner && owner !== player) { toast(`${e.name} answers to someone else`); return true; }
  player._heldFish = null;
  mobSound(e, 'eat', 0.7);
  if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 0.6, e.z, 2);
  handPickSwing = true;
  if (e.tame) {                                       // one of yours: a meal
    e.hunger = Math.min(ENT_HUNGER_MAX, entHunger(e) + OTTER.liveMeal);
    e.hp = Math.min(entMaxHp(e), e.hp + 10);
    toast(`${e.name} ate the ${f.name}: hunger ${Math.round(e.hunger)}/${ENT_HUNGER_MAX}`);
    return true;
  }
  const gh = typeof hasSkill === 'function' && hasSkill('gentleHand') ? OTTER.gentle : 1;   // Gentle Hand
  if (!e.taming) { e.taming = { pts: 0, lost: 0, gh, n: 0 }; e.owner = player; e.ownerId = player.profileId || null; }
  const t = e.taming, lvl = e.level || 1;
  t.pts += f.level * (f.species === 'catfish' ? OTTER.catfish : 1) * (t.gh || 1);
  t.n = (t.n | 0) + 1;
  const cost = f.level < lvl ? OTTER.lowCost * (lvl - f.level) / Math.max(1, ENT_LEVEL_MAX - 1) : 0;
  t.lost += cost;
  e.fleeT = 0; e.state = 'sit'; e._fleeFrom = null;
  if (t.pts >= otterNeed(e)) { _otterTameDone(e); return true; }
  toast(`Taming the otter: ${otterTamingLine(e)}` + (cost ? ` · a fish below its level, -${Math.round(cost * 100)}%` : ''));
  return true;
}
/* From tryOtterInteract (the use button, a fresh press) with a fish to eat in hand (OTTER_FOOD: cod, pike, salmon,
   catfish) on an otter that is yours or no one's. It takes the fish and eats it, sitting up on land or floating on its
   back, chewing, for OTTER.eatS; its hunger fills by the fish's worth. Wild, it only eats: taming wants a live fish
   (otterGiveFish). Always true: the click was the otter's. */
const _otterFishOf = (id) => Object.keys(FISH).find(k => FISH[k].item === id) || 'cod';
function _otterFeed(e, slot) {
  const id = slotId(slot), meal = OTTER_FOOD[id];
  if (e._eatT > 0) return true;
  const owner = houndOwner(e);
  if ((e.tame || e.taming) && owner && owner !== player) { toast(`${e.name} answers to someone else`); return true; }
  if (entHunger(e) >= ENT_HUNGER_MAX - 0.5) { toast(`${e.name} is full`); return true; }
  if (!player.canFly) { slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null; saveHotbar(); buildHotbar(); updateHotbar(); }
  e.hunger = Math.min(ENT_HUNGER_MAX, entHunger(e) + meal);
  e.hp = Math.min(entMaxHp(e), e.hp + 5);
  e._eatT = OTTER.eatS; e._eatFish = _otterFishOf(id); e._chewT = 0;   // the first chew at once (updateOtter)
  e.fleeT = 0; e._fleeFrom = null;
  handPickSwing = true;
  toast(`${e.name} eats the ${idName(id).toLowerCase()}: hunger ${Math.round(e.hunger)}/${ENT_HUNGER_MAX}`);
  return true;
}
// the use button's line for a fish to eat in hand, on an otter under the crosshair (otterPrompt)
function otterFeedHint(e) {
  const id = slotId(HOTBAR[hotbarSel]);
  if (!(OTTER_FOOD[id] > 0) || player._heldFish) return '';
  return entHunger(e) >= ENT_HUNGER_MAX - 0.5 ? `${_esc(e.name)} is full` : `(<b>use</b>) feed ${_esc(idName(id).toLowerCase())}`;
}
const OTTER_NAME_TP = { label: 'otter', statLine: (e) => otterStatLine(e) };
function _otterTameDone(e) {
  const eff = otterEff(e);
  e.tame = true; e.taming = null; e.eff = +eff.toFixed(2);
  e.stance = 'follow'; e.stanceNext = null; e.spot = null;
  e.stats = { maxHp: Math.round(OTTER.hp + OTTER.boostHp * eff) };
  e.hp = e.stats.maxHp;
  playSound('chestOpen', { gain: 0.6, rate: 1.5, pos: { x: e.x, y: e.y + 0.5, z: e.z } });
  if (typeof fxTamed === 'function') fxTamed(e.x, e.y + 0.6, e.z);
  toast(`tamed the otter! effectiveness ${Math.round(eff * 100)}%`);
  addXP(XP_TAME + XP_TAME_PER_LEVEL * (e.level | 0), 'taming');
  if (typeof openNameDialog === 'function') openNameDialog(e, OTTER_NAME_TP);
}

/* ---------------------------------- the right button on one ----------------------------------
   From _doPlace, ahead of everything else a right click does. True when the click was the otter's. */
function tryOtterInteract() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return false;
  if (typeof nameDialogOpen === 'function' && nameDialogOpen()) return false;
  const e = pickEntity(ENT_INTERACT_REACH), slot = HOTBAR[hotbarSel];
  if (!e || e.kind !== 'otter') {
    // sneak + use with an empty hand, aiming at no creature (nor a clam, which that shuts): the otter round your neck is set down
    if (player._wornOtter && player.sneaking && !slot && !e && !(act && act.place) && currentRay()?.id !== B.CLAM) {
      otterTakeOff(player, false);
      return true;
    }
    return false;
  }
  // a fish to eat in hand: it is fed, tame or wild (_otterFeed above); fresh presses only
  if (OTTER_FOOD[slotId(slot)] > 0 && !player._heldFish) return (act && act.place) ? true : _otterFeed(e, slot);
  if (!e.tame) return false;                          // a wild one: E gives it a live fish; the click passes on
  if (act && act.place) return true;                  // fresh presses only, never the held button's repeat
  if (houndOwner(e) !== player) { toast(`${e.name} answers to someone else`); return true; }
  if (player.sneaking) {
    if (player._wornOtter) toast('You already have an otter round your neck');
    else otterPutOn(player, e, false);
    return true;
  }
  // the next stance after the one pressed for (or the one it has), taking hold OTTER.stanceWait after the last press
  const now = e.stance, next = OTTER_STANCES[(OTTER_STANCES.indexOf(e.stanceNext || now) + 1) % OTTER_STANCES.length];
  if (next === now) { e.stanceNext = null; toast(`${e.name}: stays on ${_otterStanceText(now)}`); }
  else { e.stanceNext = next; e.stanceT = OTTER.stanceWait; toast(`${e.name}: ${_otterStanceText(next)} in ${OTTER.stanceWait} s`); }
  return true;
}

/* ---------------------------------- round the neck ---------------------------------- */
// out of the world onto the player, kept whole (its numbers, its taming, its name); `quiet`: put back on after a load
function otterPutOn(p, e, quiet) {
  const i = ENTITIES.indexOf(e);
  if (i < 0 || p._wornOtter) return false;
  // one creature worn at a time: a meerkat on the shoulder comes down for it (entities/meerkat.js)
  if (p._wornMeerkat && typeof meerkatTakeOff === 'function') meerkatTakeOff(p, false);
  ENTITIES.splice(i, 1);
  scene.remove(e.model.root);
  e._worn = true; e._wearOn = false;
  e._target = null; e._lerp = null; e.stanceNext = null;
  p._wornOtter = e;
  if (!quiet) {
    mobSound(e, 'say', 0.6);
    const tell = () => feedInfo(`${e.name} curls round your neck: warmer in the cold (sneak + use with an empty hand sets it down)`);
    if (typeof withPlayer === 'function') withPlayer(p, tell); else tell();
  }
  return true;
}
// back into the world in front of them (at their feet against a wall, or where they fell); its spot is there now
function otterTakeOff(p, dead) {
  const e = p._wornOtter;
  if (!e) return null;
  p._wornOtter = null;
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
// the cold resistance an otter worn by the player in hand (`player`) gives, by its level and how well it was tamed: read by
// _resSum (player/stat-getters.js)
function otterScarfCold() {
  const e = player && player._wornOtter;
  return e ? OTTER.scarfCold + OTTER.scarfColdLvl * (e.level || 1) + OTTER.scarfColdEff * (e.eff > 0 ? e.eff : 1) : 0;
}
/* On the body (from applyCameraView, player/body.js, for this seat's own model): lying across the back of the shoulders, its
   head over the left one looking ahead, its tail down over the right one to the front, breathing, looking about. */
function poseOtterScarf(m, p, dt) {
  const e = p._wornOtter;
  if (!e) { if (m.scarf) m.scarf.root.visible = false; return; }
  if (!m.scarf || m.scarf._for !== e) {
    if (m.scarf) m.torso.remove(m.scarf.root);
    m.scarf = buildOtter();
    m.scarf._for = e;
    m.torso.add(m.scarf.root);
  }
  const s = m.scarf;
  if (!_otterDress(s)) return;
  const t = performance.now() / 1000;
  s.root.visible = true;
  s.root.position.set(0, 10.5 * PX, -5.5 * PX);
  s.root.rotation.set(0, Math.PI / 2, 0);
  s.root.scale.setScalar(0.8 * (e.size || 1));
  s.body.position.y = s.bodyY + Math.sin(t * 1.6) * 0.15 * PX;
  s.body.rotation.set(0, 0, 0);
  // turned to look ahead first, then the dip; the tail down first, then turned to the front
  s.head.rotation.order = 'YXZ'; s.head.rotation.set(0.35 + Math.sin(t * 0.7) * 0.08, -Math.PI / 2 + Math.sin(t * 0.43) * 0.35, 0);
  s.tail.rotation.order = 'YXZ'; s.tail.rotation.set(-1.0, Math.PI / 2 * 0.85 + Math.sin(t * 1.1) * 0.12, 0);
  for (const l of s.legs) l.g.rotation.set(l.front ? -0.25 : 0.25, 0, 0);
  _otterCarryModel(s, null);
  shadeTinted(s, p.pos.x, p.pos.y + 1.2, p.pos.z, false, 0);
}

/* ---------------------------------- once a world step ----------------------------------
   For every otter of somebody's, simulating or parked: one saved round its owner's neck goes back on as they come; one told
   to follow that is left OTTER.teleport behind (or whose chunk went out of range) comes to its owner. */
function otterWorldTick(dt) {
  for (const e of [...ENTITIES]) {
    if (e.kind !== 'otter' || !e.tame) continue;
    const owner = houndOwner(e);
    if (!owner || !owner.spawned || owner.dead) continue;
    if (e._wearOn) { if (!owner._wornOtter && !owner._wornMeerkat) otterPutOn(owner, e, true); e._wearOn = false; continue; }
    if (e.stance !== 'follow') continue;
    const dx = owner.pos.x - e.x, dz = owner.pos.z - e.z;
    if (e.active !== false && dx * dx + dz * dz < OTTER.teleport * OTTER.teleport && Math.abs(owner.pos.y - e.y) < 24) continue;
    _otterComeTo(e, owner);
  }
}
// to a spot a few blocks from its owner, standing or in water; none found (they are in the air), it tries next step
function _otterComeTo(e, owner) {
  const ox = owner.pos.x, oy = Math.floor(owner.pos.y + 0.01), oz = owner.pos.z;
  let spot = null;
  _useBox(e);
  for (let k = 0; k < 16 && !spot; k++) {
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 2;
    const x = Math.floor(ox + Math.sin(a) * r) + 0.5, z = Math.floor(oz + Math.cos(a) * r) + 0.5;
    for (let y = oy + 2; y >= oy - 3; y--) {
      const here = getBlock(Math.floor(x), y, Math.floor(z));
      if (!isWaterVal(here) && !CORE.solidVal(getBlock(Math.floor(x), y - 1, Math.floor(z)))) continue;
      if (!_entBlocked(x, y, z)) spot = { x, y, z };
      break;
    }
  }
  _useBox(null);
  if (!spot) return false;
  Object.assign(e, { x: spot.x, y: spot.y, z: spot.z, vy: 0, kx: 0, kz: 0, peakY: null, stuckT: 0, _px: undefined, _lerp: null });
  e.model.root.position.set(e.x, e.y, e.z);
  if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 0.4, e.z, [0.6, 0.5, 0.4], 8, 1);
  return true;
}

/* ---------------------------------- where it lives ----------------------------------
   Once per new chunk (trySpawnEntitiesInChunk): now and then a pair or three in the water by a shore, where the land is a
   Deep Beach, or on a lake or river big enough (OTTER.bigWater of the water round it); never within OTTER.apart of another. */
const _otterFresh = (b) => b === 'River' || b === 'Lake';
function rollOtters(cx, cz) {
  if (Math.random() >= OTTER.chunkChance * ANIMAL_SPAWN_MUL) return;
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = cx * 16 + Math.floor(Math.random() * 16), z = cz * 16 + Math.floor(Math.random() * 16);
    const bed = surfaceY(x, z);
    let top = bed;
    while (top < WORLD_TOP && isWaterVal(getBlock(x, top + 1, z))) top++;
    if (top === bed) continue;                                   // dry
    // a shore: dry ground within three blocks, at the water's height or above
    let shore = null;
    for (let k = 0; k < 8 && !shore; k++) {
      const a = k * Math.PI / 4, sx = Math.round(x + Math.sin(a) * 3), sz = Math.round(z + Math.cos(a) * 3);
      const ch = getChunk(Math.floor(sx / 16), Math.floor(sz / 16));
      if (!ch || !ch.data) continue;                             // land not in yet reads as air
      const sy = surfaceY(sx, sz);
      if (sy >= top && !isWaterVal(getBlock(sx, sy, sz))) shore = { x: sx, z: sz };
    }
    if (!shore) continue;
    const here = mainGen.biomeAt(x, z);
    if (_otterFresh(here)) {
      let wet = 0, n = 0;
      for (let dz = -9; dz <= 9; dz += 3) for (let dx = -9; dx <= 9; dx += 3) { n++; if (_otterFresh(mainGen.biomeAt(x + dx, z + dz))) wet++; }
      if (wet / n < OTTER.bigWater) continue;
    } else if (mainGen.biomeAt(shore.x, shore.z) !== 'Deep Beach') continue;
    for (const e of ENTITIES) if (e.kind === 'otter' && Math.abs(e.x - x) < OTTER.apart && Math.abs(e.z - z) < OTTER.apart) return;
    for (let n = _ri(OTTER.packMin, OTTER.packMax); n > 0; n--) {
      const ox = x + 0.5 + (Math.random() - 0.5) * 1.5, oz = z + 0.5 + (Math.random() - 0.5) * 1.5;
      const ok = isWaterVal(getBlock(Math.floor(ox), top, Math.floor(oz)));
      summon('otter', ok ? ox : x + 0.5, top + 1 - OTTER.float - 0.1, ok ? oz : z + 0.5, { hx: x + 0.5, hz: z + 0.5 });
    }
    return;
  }
}

/* ---------------------------------- what the crosshair says ---------------------------------- */
const otterStatLine = (e) => `health ${Math.ceil(e.hp)}/${entMaxHp(e)} · hunger ${Math.round(entHunger(e))}/${ENT_HUNGER_MAX}`
  + ` · effectiveness ${Math.round(otterEff(e) * 100)}%`;
function otterTamingLine(e) {
  const t = e.taming, need = otterNeed(e);
  return `${Math.round(Math.min(1, t.pts / need) * 100)}% · fish levels ${Math.round(t.pts)}/${need} · effectiveness ${Math.round(otterEff(e) * 100)}%`;
}
// the second line of the name over it (entitySubText, ui/animals.js)
function otterSubText(e) {
  if (e.taming) return `taming ${Math.round(Math.min(1, e.taming.pts / otterNeed(e)) * 100)}%`;
  if (e.tame) return (e.stanceNext ? _otterStanceText(e.stance) + ' > ' + _otterStanceText(e.stanceNext) : _otterStanceText(e.stance)) + (e._carry ? ' · carrying' : '');
  return '';
}
// the lines under the crosshair within reach (tameablePrompt, ui/animals.js)
function otterPrompt(e) {
  const head = entityHead(e), dim = (s) => `<span style="opacity:.8;font-size:.9em">${s}</span>`;
  const feed = otterFeedHint(e), feedLine = feed ? `<br>${feed}` : '';   // a fish to eat in hand: E is for that
  if (e.taming) return `${head}<br>${dim('taming ' + otterTamingLine(e) + ' · give it live fish with <b>E</b>')}${feedLine}`;
  if (!e.tame) return `${head}<br>${dim(`(tamable: fish levels worth ${otterNeed(e)}, given live with <b>E</b>)`)}${feedLine}`;
  const st = e.stanceNext ? `${_otterStanceText(e.stance)} > ${_otterStanceText(e.stanceNext)} (${Math.max(0, e.stanceT).toFixed(1)} s)` : _otterStanceText(e.stance);
  const pet = typeof _petHint === 'function' ? ' · ' + _petHint() : '';
  return `${head}<br>${dim(otterStatLine(e))}<br>${dim(`stance: <b>${st}</b> (use) · round your neck (sneak + use)${pet}`)}${feedLine}`;
}
// E's part of the prompt for a fish in hand while an otter is under the crosshair (player/fish-hold.js)
function otterFishHint() {
  const e = pickEntity(ENT_INTERACT_REACH);
  return e && e.kind === 'otter' ? `(<b>E</b>) give it to ${_esc(e.name)}` : '';
}

/* ---------------------------------- the save ---------------------------------- */
function otterSave(e) {
  const t = e.taming;
  return {
    sz: e.size, g: e.gender, lv: e.level, h: +entHunger(e).toFixed(1),
    t: e.tame ? 1 : 0, o: e.ownerId || null, sc: e.stance, ef: e.eff || 0, st: e.tame && e.stats ? e.stats : null,
    sp: e.spot ? [+e.spot.x.toFixed(2), +e.spot.y.toFixed(2), +e.spot.z.toFixed(2)] : null,
    tm: t ? [+(t.pts || 0).toFixed(1), +(t.lost || 0).toFixed(3), t.gh || 1, t.n | 0] : null,   // fish levels, effectiveness lost, Gentle Hand, fish
    wn: e._worn ? 1 : 0,                                                                           // round its owner's neck
  };
}
function otterRestore(s) {
  const d = s.d;
  const st = d.st && d.st.maxHp > 0 ? { maxHp: +d.st.maxHp } : null;
  const tm = !d.t && Array.isArray(d.tm) ? { pts: +d.tm[0] || 0, lost: +d.tm[1] || 0, gh: +d.tm[2] > 1 ? +d.tm[2] : 1, n: d.tm[3] | 0 } : null;
  const sp = Array.isArray(d.sp) && d.sp.length === 3 ? { x: +d.sp[0], y: +d.sp[1], z: +d.sp[2] } : null;
  const e = summon('otter', s.x, s.y, s.z, {
    hp: s.hp, size: d.sz, gender: d.g, level: d.lv, hunger: d.h,
    tame: !!d.t, ownerId: d.o, stance: d.sc, eff: d.ef, stats: st, taming: tm, spot: sp,
    name: s.name, hx: s.hx, hz: s.hz,
  });
  if (d.wn && d.t) e._wearOn = true;                // otterWorldTick puts it back round their neck
  return e;
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in OTTER. */
defineMob('otter', {
  name: 'Otter', group: 'animal', body: 'otter', passive: true, spared: true, hungerMul: 0.5,
  maxHp: (e) => (e.stats && e.stats.maxHp) || OTTER.hp,   // raised by its taming
  box: [0.3, 0.45], sized: true,
  walk: OTTER.walk, flee: OTTER.run, fleeTime: OTTER.fleeTime, fleeTogether: OTTER.fleeTogether,
  fallSafe: 8, foot: 'paw',
  // its own voice, pitched well down; it eats with the eating sound and walks with plain footsteps (no `step`)
  sounds: { say: { key: 'otterSay', rate: 0.6 }, hurt: { key: 'otterHurt', rate: 0.6 }, eat: { key: 'chew', rate: 1.3, gain: 0.6, vary: 0.2 } },   // eating: higher, softer, a little wobble
  make: makeOtter, gendered: true, build: () => buildOtter(),
  roll: rollOtters,                                    // its own rule: by deep beaches and big fresh water
  save: otterSave, load: otterRestore,
  prompt: otterPrompt, subText: otterSubText,
  loot: (e, pop, first) => first(ITEM.FUR, LOOT.otterFur),
});
