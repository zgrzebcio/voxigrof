'use strict';
/* js/entities/chicken.js: the chicken: hen, rooster and chick. Its numbers, its models and pose, its own `step` (updateEntities
   hands it to updateChicken), a hen's laying and sitting, where it lives, and its save. The egg on the ground is blocks/egg.js.

   WILD, never tamed, in flocks on grass in the cold, the mild and the warm land (CHICKEN_BIOMES). It walks about and pecks at
   the ground; a blow sends it and the ones near it running with their wings beating (`_entBolt`, fleeTogether). It falls
   slowly, beating its wings, and no fall hurts it.

   A HEN (gender F, grown) LAYS every CHICKEN.layEvery seconds where she stands, when no egg within CHICKEN.eggR has another
   hen on it and fewer than CHICKEN.eggsMax lie free there; till then her clock waits at 0. She sits on what she laid, and
   walks to any free egg within CHICKEN.eggR. Sitting is what hatches one (`sat` and `need`, blocks/egg.js); a
   fright or water gets her up and the egg keeps what it had. With CHICKEN.crowdMax chickens within CHICKEN.crowdR she sits
   on nothing: the eggs stay eggs and the flock stops growing. No rooster is needed: he is a look and a voice.

   A CHICK hatches, F or M, its mother's colour, at CHICKEN.chickSize of its size and grows to full over CHICKEN.growS. Until
   then it lays nothing and its death pays nothing: no meat, no feather, no XP (`xp`, mobPaysKill in entities/mobs.js).

   Models js/models/chicken.js (from textures/Entity/Farms/chicken_female.json and chicken_male.json: bones body, head,
   wing_left, wing_right, leg_left, leg_right). The hen's sheet chicken_female.png is grey, multiplied by her tint
   (CHICKEN_TINTS, its feathers average 0.29 linear, so a pale hen's tint is above 1), with chicken_female_overlay.png over it
   untinted (comb, beak, eyes, legs); the rooster's chicken_male.png has its own colours. Sounds in Sound/Mobs/Chicken. All
   numbers are in CHICKEN. */
const CHICKEN = {
  hp: 20, chickHp: 5, scale: 0.8,         // the model is drawn this big at size 1
  sizeRoll: [0.85, 1.15],                 // grown size, narrower than other animals': a hen must cover her egg
  walk: 1.1, run: 4.2, fleeTime: 5, fleeTogether: 8,
  homeR: 20,                              // it walks back past this from its home
  flutterFall: 3.5,                       // it falls no faster than this, wings beating
  // a hen: an egg this often; eggs looked for within this (and this far up or down) every so often
  layEvery: 1200, eggR: 8, eggUp: 3, lookEvery: 3,
  eggsMax: 3,                             // no more laid with this many free eggs near
  crowdMax: 12, crowdR: 16,               // this many chickens this near: she sits on nothing
  walkToEggS: 30, eggRest: 30,            // a walk to an egg given up after this; after one, or a hatching, no egg for this long
  sitDrop: 3.5, legLen: 4.5,              // sitting: the body down this many 16ths, on legs this long
  // a chick
  chickSize: 0.5, growS: 1200,
  sayHen: [8, 24], sayRooster: [25, 70], sayChick: [5, 14],   // seconds between its voice
  // where it lives
  chunkChance: 0.025, flockMin: 2, flockMax: 5,
};
// the cold land, the mild and the warm; deep and hills kinds count too (_biomeWeight)
const CHICKEN_BIOMES = { 'Plains': 1, 'Warm Plains': 1, 'Forest': 0.6, 'Birch Forest': 0.6, 'Savanna': 0.6, 'Cold Plains': 0.7, 'Spruce Forest': 0.4 };
// a hen's feathers over the grey sheet: white, buff, brown, black, the sheet's own grey
const CHICKEN_TINTS = [[2.8, 2.7, 2.4], [2.4, 1.36, 0.42], [0.92, 0.37, 0.12], [0.16, 0.14, 0.14], [1, 1, 1]];
const _chickName = (gender, growT) => (growT > 0 ? 'Chick' : gender === 'M' ? 'Rooster' : 'Hen');

/* ---------------------------------- the model ---------------------------------- */
const _henSrc = () => boxModel('chicken_female', 'textures/Entity/Farms/chicken_female.png');
const _roosterSrc = () => boxModel('chicken_male', 'textures/Entity/Farms/chicken_male.png');
_henSrc(); _roosterSrc();                   // their sheets fetched from the start
const _henOverTex = new THREE.TextureLoader().load('textures/Entity/Farms/chicken_female_overlay.png');
_henOverTex.colorSpace = THREE.SRGBColorSpace;
_henOverTex.magFilter = THREE.NearestFilter;
_henOverTex.minFilter = THREE.NearestMipmapLinearFilter;
/* An empty root at once, its bones put in the first frame the model is in (_chickDress, buildBoxRig). A hen's every mesh gets
   a twin on the overlay sheet (same boxes, drawn over it); shadeTinted lights the overlay without the tint (`satMat`). */
function buildChicken(gender = 'F', tint = 0) {
  const root = new THREE.Group(), hen = gender !== 'M';
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const over = hen ? new THREE.MeshBasicMaterial({ map: _henOverTex, transparent: true, alphaTest: 0.5,
                                                   polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }) : null;
  const t = hen ? (CHICKEN_TINTS[tint] || CHICKEN_TINTS[0]) : [1, 1, 1];
  const m = { root, mat, mats: [mat], satMat: over, tint: new THREE.Color(t[0], t[1], t[2]), hen, body: null };
  _chickDress(m);
  return m;
}
function _chickDress(m) {
  if (m.body) return true;
  const src = m.hen ? _henSrc() : _roosterSrc();
  if (!src.ready) return false;
  m.mat.map = src.tex; m.mat.needsUpdate = true;
  const { bones } = buildBoxRig(src, m.root, m.mat);
  if (m.hen) {
    const feathers = [];
    m.root.traverse(o => { if (o.isMesh && o.material === m.mat) feathers.push(o); });
    for (const o of feathers) { const twin = new THREE.Mesh(o.geometry, m.satMat); twin.renderOrder = 1; o.parent.add(twin); }
  }
  m.body = bones.body; m.head = bones.head; m.wingL = bones.wing_left; m.wingR = bones.wing_right;
  m.legL = bones.leg_left; m.legR = bones.leg_right;
  m.bodyY = m.body.position.y; m.headZ = m.head.position.z;
  return true;
}
/* Posed once a step. Walking its legs swing and its head bobs forward and back; pecking its head goes down; running it leans
   forward, wings beating, as it does falling or struck. Sitting its body comes down and its legs shrink up under it, their
   feet staying on the ground. */
function chickenPose(e, m, dt, spd) {
  const now = performance.now() / 1000, body = m.body, head = m.head, run = e.fleeT > 0;
  e.sitK += ((e._sitting && !run ? 1 : 0) - e.sitK) * Math.min(1, dt * 5);
  e.leanK += ((run ? 0.4 : 0) - e.leanK) * Math.min(1, dt * 8);
  const swing = Math.min(spd / 2.2, 1) * 0.85 * (1 - e.sitK), s = Math.sin(e.walk);
  body.rotation.x = e.leanK;
  body.position.y = m.bodyY + (Math.abs(s) * swing * 0.4 - e.sitK * CHICKEN.sitDrop) * PX;
  m.legL.rotation.x = s * swing - e.leanK;
  m.legR.rotation.x = -s * swing - e.leanK;
  m.legL.scale.y = m.legR.scale.y = 1 - e.sitK * CHICKEN.sitDrop / CHICKEN.legLen;
  const peck = e.state === 'peck' && !e._sitting && !run && spd < 0.1;
  e.peckK += ((peck ? 1 : 0) - e.peckK) * Math.min(1, dt * 10);
  head.position.z = m.headZ + Math.sin(e.walk * 2) * swing * 0.7 * PX;
  head.rotation.x = -e.leanK + e.peckK * (1 + Math.sin(now * 13 + e.hx) * 0.3);
  // standing or sitting it looks about with quick turns of the head
  if (!(now < e._lookAtT)) { e._lookAtT = now + 0.5 + Math.random() * 2; e._lookTo = spd < 0.3 && !peck ? (Math.random() * 2 - 1) * 1.1 : 0; }
  e._hy += (e._lookTo - e._hy) * Math.min(1, dt * 14);
  head.rotation.y = e._hy;
  const beat = run || e.flailT > 0 || !e.onGround;
  e.flapK += ((beat ? 1 : 0) - e.flapK) * Math.min(1, dt * 8);
  if (beat) e.flap += dt * 28;
  const spread = e.flapK * (0.8 + Math.sin(e.flap) * 0.55);
  m.wingL.rotation.z = spread;              // the left wing's bone is on +x once turned: it opens with +z
  m.wingR.rotation.z = -spread;
}

/* ---------------------------------- making one ---------------------------------- */
// its size now: a chick's grows from CHICKEN.chickSize of its full size to all of it
const _chickSizeNow = (full, growT) => (growT > 0 ? full * (CHICKEN.chickSize + (1 - CHICKEN.chickSize) * (1 - growT / CHICKEN.growS)) : full);
/* What one is made of. `opts`: size (its full size), tint, chick (just hatched), growT, layT (from the save). */
function makeChicken(opts, gender) {
  const full = _animalSize({ size: opts.size > 0 ? opts.size : birdRand(CHICKEN.sizeRoll) });
  const growT = opts.growT > 0 ? +opts.growT : opts.chick ? CHICKEN.growS : 0;
  const tint = Number.isInteger(opts.tint) && CHICKEN_TINTS[opts.tint] ? opts.tint : Math.floor(Math.random() * CHICKEN_TINTS.length);
  const size = _chickSizeNow(full, growT);
  return {
    model: buildChicken(gender, tint), scale: size * CHICKEN.scale,
    own: {
      size, sizeFull: full, growT, tint, name: _chickName(gender, growT),
      // a wild hen is somewhere in her clock, a new one starts it
      layT: opts.layT >= 0 ? +opts.layT : CHICKEN.layEvery * (growT > 0 ? 1 : Math.random()),
      _egg: null, _sitting: false, _eggWalkT: 0, _eggCd: 0, _henLookT: Math.random() * CHICKEN.lookEvery,
      sitK: 0, leanK: 0, peckK: 0, flapK: 0, flap: 0, _hy: 0, _lookTo: 0, _lookAtT: 0,
      sayT: 2 + Math.random() * 10,
    },
  };
}

/* ---------------------------------- its step ---------------------------------- */
const _CHICK_TIMERS = ['fleeT', 'flailT', 'turnCd', '_eggCd'];
// where it does not stroll: lava, a cactus, water at its feet or under them, more than four blocks down
function _chickHazard(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z), v = getBlock(fx, fy, fz), id = v & 255;
  if (id === B.LAVA || id === B.CACTUS || isWaterVal(v)) return true;
  for (let d = 1; d <= 4; d++) {
    const b = getBlock(fx, fy - d, fz);
    if (isWaterVal(b) || (b & 255) === B.LAVA) return true;
    if (CORE.solidVal(b)) return false;
  }
  return true;
}
function updateChicken(e, dt, tp, i) {
  const m = e.model;
  if (!_chickDress(m)) { m.root.position.set(e.x, e.y, e.z); return; }
  for (const t of _CHICK_TIMERS) if (e[t] > 0) e[t] -= dt;
  if (e.growT > 0) {                        // a chick growing: its box follows `size` (entR, entH)
    e.growT = Math.max(0, e.growT - dt);
    e.size = _chickSizeNow(e.sizeFull, e.growT);
    m.root.scale.setScalar(e.size * CHICKEN.scale);
    if (e.growT === 0) e.name = _chickName(e.gender, 0);
  } else if (e.gender === 'F' && e.layT > 0) e.layT -= dt;
  const inWater = isWaterVal(getBlock(Math.floor(e.x), Math.floor(e.y + 0.2), Math.floor(e.z)));
  const speed = _chickThink(e, dt, tp, inWater);
  /* ---- across ---- */
  let moved = 0;
  const stunned = (e.kx !== 0 || e.kz !== 0) && !(e.fleeT > 0);
  e.wantMove = speed > 0 && !stunned;
  if (e.wantMove) {
    const sp = speed * boxDragMul(e.x, e.y, e.z, _boxR, _boxH);
    const sx = Math.sin(e.yaw) * sp * dt, sz = Math.cos(e.yaw) * sp * dt;
    // running from a blow it goes through water and over ledges, only what burns or pricks stops it
    const bad = (nx, nz) => _entBlocked(nx, e.y, nz) || (e.fleeT > 0 ? _entHazard(nx, e.y, nz) : !inWater && _chickHazard(nx, e.y, nz));
    let blocked = false;
    if (!bad(e.x + sx, e.z)) { e.x += sx; moved += Math.abs(sx); } else blocked = true;
    if (!bad(e.x, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else blocked = true;
    if (blocked) {
      const climbY = _stepUpTarget(e, e.x + sx, e.z + sz);
      if (inWater && climbY !== null) { e.y = climbY; e.x += sx; e.z += sz; e.vy = 1.5; e.onGround = false; e.jumpCd = 0.3; }   // out onto the bank
      else if (e.onGround && e.jumpCd <= 0 && climbY !== null) { e.vy = ENT_JUMP; e.jumpCd = 0.5; e.onGround = false; }
      else if (e.turnCd <= 0) { e.yaw += (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random()); e.turnCd = 0.4; }
    }
  }
  if (e.kx || e.kz) {                       // a blow's knockback, spent
    const kdx = e.kx * dt, kdz = e.kz * dt;
    if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
    if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
    const kk = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= kk; e.kz *= kk;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
  }
  /* ---- up and down: in water it paddles up, on land it falls, slowly ---- */
  const wasGround = e.onGround;
  if (inWater) { e.vy = 1.2; e.y += e.vy * dt; e.onGround = false; e.peakY = null; if (_entBlocked(e.x, e.y, e.z)) e.y -= e.vy * dt; }
  else {
    if (e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z)) { e.y = Math.floor(e.y - 0.02) + 1; e.vy = 0; e.onGround = true; }
    else {
      const ny = _entFallStep(e, dt);
      if (e.vy < -CHICKEN.flutterFall) e.vy = -CHICKEN.flutterFall;
      if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; } e.vy = 0; }
      else { e.y = ny; e.onGround = false; }
    }
    if (_entFallDamage(e, i, wasGround, false)) return;
  }
  if (e.hazCd > 0) e.hazCd -= dt;
  const feetId = getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255;
  if (feetId === B.LAVA) e.fireT = Math.max(e.fireT || 0, LAVA_FIRE_S);
  if (e.hazCd <= 0 && (feetId === B.LAVA || feetId === B.CACTUS)) {
    e.hazCd = ENT_HAZARD_CD; e.hurtT = 0.25; e.hp -= feetId === B.LAVA ? ENT_LAVA_DMG : ENT_CACTUS_DMG;
    if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return; }
  }
  /* ---- its voice now and then, when someone is near to hear it ---- */
  e.sayT -= dt;
  if (e.sayT <= 0) {
    const chick = e.growT > 0, rooster = e.gender === 'M';
    e.sayT = birdRand(chick ? CHICKEN.sayChick : rooster ? CHICKEN.sayRooster : CHICKEN.sayHen);
    if (Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) < 20) mobSound(e, chick ? 'sayChick' : rooster ? 'sayM' : 'say', 0.4);
  }
  /* ---- pose ---- */
  const spd = moved / Math.max(dt, 1e-4);
  entityStepSound(e, dt, spd);
  e.walk += (spd > 0.05 ? Math.min(spd, 6) * 5 + 2 : 0) * dt;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  chickenPose(e, m, dt, spd);
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, 0.3);
}

/* ---------------------------------- its mind ----------------------------------
   Returns how fast it goes this step, its heading set: running from a blow, out of water, a hen's eggs, then its stroll. */
function _chickThink(e, dt, tp, inWater) {
  if (e.fleeT > 0) {
    _chickOffEgg(e);
    const from = e._fleeFrom || { x: tp.pos.x, z: tp.pos.z };
    if (e.turnCd <= 0) { e.yaw = Math.atan2(e.x - from.x, e.z - from.z) + (Math.random() - 0.5) * 0.8; e.turnCd = 0.4; }
    return CHICKEN.run;
  }
  if (inWater) {
    _chickOffEgg(e);
    e.escapeT -= dt;
    if (e.escapeT <= 0) { e.escapeT = 0.8; e.yaw += 1.2; }
    return CHICKEN.walk;
  }
  if (e.gender === 'F' && !(e.growT > 0)) {
    const sp = _chickHen(e, dt);
    if (sp != null) return sp;
  }
  e.wanderT -= dt;
  if (e.wanderT <= 0) {
    e.wanderT = 1.5 + Math.random() * 4;
    const r = Math.random();
    e.state = r < 0.35 ? 'idle' : r < 0.65 ? 'peck' : 'wander';
    if (e.state === 'wander') e.yaw = Math.random() * Math.PI * 2;
  }
  const hdx = e.hx - e.x, hdz = e.hz - e.z;
  if (Math.hypot(hdx, hdz) > CHICKEN.homeR) { e.yaw = Math.atan2(hdx, hdz); e.state = 'wander'; }
  return e.state === 'wander' ? CHICKEN.walk : 0;
}
function _chickOffEgg(e) {
  if (e._egg && e._egg.hen === e) e._egg.hen = null;
  e._egg = null; e._sitting = false;
}
function _chickOnEgg(e, g) { e._egg = g; g.hen = e; e._sitting = false; e._eggWalkT = 0; }
/* What a grown hen is doing about eggs. Returns her speed when that is what she is at (her heading set), null when she is free
   to stroll. */
function _chickHen(e, dt) {
  const g = e._egg;
  if (g) {
    if (EGGS.get(_eggKey(g.x, g.y, g.z)) !== g) _chickOffEgg(e);   // taken, broken, washed off
    else if (e._sitting) {
      e.x = g.x + 0.5; e.z = g.z + 0.5;
      g.sat += dt;
      if (g.sat >= g.need && !streamBehind) _chickHatch(e, g);     // land first: its cell's re-mesh can wait
      return 0;
    } else {
      const dx = g.x + 0.5 - e.x, dz = g.z + 0.5 - e.z, d = Math.hypot(dx, dz);
      if (d <= 0.15 && e.onGround && Math.abs(e.y - g.y) < 0.6) {
        e._sitting = true; e.x = g.x + 0.5; e.z = g.z + 0.5;
        mobSound(e, 'say', 0.35);
        return 0;
      }
      e._eggWalkT += dt;
      if (e._eggWalkT > CHICKEN.walkToEggS) { _chickOffEgg(e); e._eggCd = CHICKEN.eggRest; return null; }
      e.yaw = Math.atan2(dx, dz);
      return Math.min(CHICKEN.walk, d / Math.max(dt, 1e-3));       // never past it, whatever the step's length
    }
  }
  e._henLookT -= dt;
  if (e._henLookT > 0) return null;
  e._henLookT = CHICKEN.lookEvery * (0.7 + Math.random() * 0.6);
  const near = _eggsNear(e), crowded = _chickCrowded(e);
  if (near.free && !crowded && !(e._eggCd > 0)) { _chickOnEgg(e, near.free); return 0; }
  if (e.layT <= 0 && !near.other && near.freeN < CHICKEN.eggsMax && e.onGround && !streamBehind) {
    const laid = _chickLay(e);
    if (laid && !crowded) { _chickOnEgg(e, laid); e._sitting = true; return 0; }
  }
  return null;
}
// the eggs round a hen: { free: the nearest with no hen, freeN: how many are free, other: one has another hen }
function _eggsNear(e) {
  const out = { free: null, freeN: 0, other: false }, r2 = CHICKEN.eggR * CHICKEN.eggR;
  let best = Infinity;
  for (const [k, g] of EGGS) {
    const dx = g.x + 0.5 - e.x, dz = g.z + 0.5 - e.z, d = dx * dx + dz * dz;
    if (d > r2 || Math.abs(g.y - e.y) > CHICKEN.eggUp) continue;
    if ((getBlock(g.x, g.y, g.z) & 255) !== B.EGG) { EGGS.delete(k); continue; }   // written over some other way
    const hen = eggHen(g);
    if (hen && hen !== e) { out.other = true; continue; }
    out.freeN++;
    if (d < best) { best = d; out.free = g; }
  }
  return out;
}
function _chickCrowded(e) {
  const r = CHICKEN.crowdR;
  let n = 0;
  for (const o of ENTITIES)
    if (o.kind === 'chicken' && Math.abs(o.x - e.x) < r && Math.abs(o.z - e.z) < r && ++n >= CHICKEN.crowdMax) return true;
  return false;
}
// an egg where she stands (a grass plant there is mown): its record, or null where one cannot lie
function _chickLay(e) {
  const x = Math.floor(e.x), y = Math.floor(e.y + 0.01), z = Math.floor(e.z), here = getBlock(x, y, z), id = here & 255;
  if ((id !== B.AIR && !isPlantReplaceable(id)) || CORE.carpetCount(here) || !isSolid(x, y - 1, z)
      || plateOverAt(x, y, z) || coversAt(x, y, z) || railOverAt(x, y, z)) return null;
  clearPlantAt(x, y, z);
  setBlock(x, y, z, B.EGG);
  e.layT = CHICKEN.layEvery;
  playBlockSound(B.EGG, 'place', x, y, z);
  mobSound(e, 'say', 0.6);
  return EGGS.get(_eggKey(x, y, z)) || null;
}
// the egg comes apart and a chick stands there, its mother's colour, its home where it hatched
function _chickHatch(e, g) {
  const { x, y, z } = g;
  playBlockSound(B.EGG, 'break', x, y, z);
  if (typeof fxBreak === 'function') fxBreak(x, y, z, getBlock(x, y, z));
  setBlock(x, y, z, B.AIR);
  _chickOffEgg(e);
  e._eggCd = CHICKEN.eggRest;
  const c = summon('chicken', x + 0.5, y, z + 0.5, { chick: true, tint: e.tint, hx: x + 0.5, hz: z + 0.5 });
  mobSound(c, 'sayChick', 0.6);
}

/* ---------------------------------- what its name tag says ---------------------------------- */
function chickenSubText(e) {
  if (e.growT > 0) return `grown in ${_mmss(e.growT)}`;
  if (e.gender !== 'F') return '';
  if (e._sitting && e._egg) return `on an egg, ${Math.min(99, Math.floor(e._egg.sat / e._egg.need * 100))}%`;
  return e.layT > 0 ? `egg in ${_mmss(e.layT)}` : 'ready to lay';
}

/* ---------------------------------- the save: its full size, sex, level, colour, clocks (its home is the row's) ---------------------------------- */
const chickenSave = (e) => ({ sz: e.sizeFull, g: e.gender, lv: e.level, t: e.tint, lt: Math.round(e.layT), gt: Math.round(e.growT) });
const chickenRestore = (s) => summon('chicken', s.x, s.y, s.z, { hp: s.hp, size: s.d.sz, gender: s.d.g, level: s.d.lv, tint: s.d.t, layT: s.d.lt, growT: s.d.gt, hx: s.hx, hz: s.hz });

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in CHICKEN. */
defineMob('chicken', {
  name: 'Chicken', group: 'animal', step: updateChicken, passive: true,
  maxHp: (e) => (e.growT > 0 ? CHICKEN.chickHp : CHICKEN.hp),
  box: [0.2, 0.65], sized: true,
  walk: CHICKEN.walk, flee: CHICKEN.run, fleeTime: CHICKEN.fleeTime, fleeTogether: CHICKEN.fleeTogether,
  fallSafe: 99, foot: 'small',                         // it flutters down: a fall never hurts it
  xp: (e) => (e.growT > 0 ? 0 : undefined),            // a chick not grown pays nothing
  // `say` a hen's, `sayM` a rooster's, `sayChick` the hen's played high
  sounds: { say: { key: 'chickenSayF' }, sayM: { key: 'chickenSayM' }, sayChick: { key: 'chickenSayF', rate: 1.6, gain: 0.7 },
            hurt: { key: 'chickenHurt' }, step: { key: 'chickenWalk', gain: 0.8 } },
  make: makeChicken, gendered: true, build: (look) => buildChicken(look.gender, look.tint),
  herd: { chance: CHICKEN.chunkChance, min: CHICKEN.flockMin, max: CHICKEN.flockMax, biomes: CHICKEN_BIOMES },
  save: chickenSave, load: chickenRestore,
  subText: chickenSubText,
  // the Butcher's bonus on the meat and on the feather; a chick leaves nothing
  loot: (e, pop, first) => { if (e.growT > 0) return; first(ITEM.CHICKEN, LOOT.chicken); first(ITEM.FEATHER, LOOT.chickenFeather); },
  burnt: (e) => (e.growT > 0 ? null : [ITEM.CHICKEN, LOOT.chicken]),
});
