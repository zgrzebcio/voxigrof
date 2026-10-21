'use strict';
/* entities/termite.js: termites, the Savanna's insects, which live in termite hills (blocks/termite-hill.js). Two
   kinds: the WORKER eats the logs near its hill into hollow logs (any log of a wood that has a hollow one, a
   player's house too), climbing a tree's trunk to eat it from the top down; once it has eaten its fill (TERMITE.full logs)
   it goes home and stays in the hill a while (the hill's `rest`, blocks/termite-hill.js). The SOLDIER guards the hill and bites a player who comes close to it, or who has hit one of
   its hill's termites (the hill's `angryT`). Both drop a chitin plate now and then.

   Their model is a box model each (textures/Entity/Animals/termite_<kind>.json, entities/box-models.js), its legs
   swinging on their own. They are never saved (`unsaved`): the hill keeps them, and lets them out again.
   Their step is their own (updateTermite, from updateEntities: body 'insect'). All numbers in TERMITE. */
const TERMITE = {
  walk: 1.1,                     // strolling about the hill, blocks a second
  run: 2.4,                      // a soldier after a player, a worker running from one
  leash: 7,                      // how far from its hill one strolls
  guard: 5,                      // a player this close to its hill (and not much above or below) has a soldier on them
  angryReach: 16,                // ...and when its hill is angry, this close
  bite: 6,                       // a soldier's bite, out of a player's 100
  biteCd: 1.1,
  reach: 0.45,                   // edge to edge
  look: 8,                       // how far round its hill a worker looks for a log
  lookS: [5, 9],                 // seconds between its looks
  eatS: 14,                      // seconds a worker chews one log into a hollow one
  giveUpS: 20,                   // ...and to reach it, before it looks for another
  lostS: 40,                     // a termite without a hill and no player within 24 for this long goes back underground
  climb: 1.2,                    // blocks a second up or down a trunk
  treeUp: 28,                    // how high over its hill it looks for the top of a trunk
  full: 3,                       // logs a worker eats before it goes home to rest
  restS: 240,                    // ...and seconds it then stays inside its hill
};
const _termiteModel = {
  worker:  () => boxModel('textures/Entity/Animals/termite_worker.json', 'textures/Entity/Animals/termite_worker.png'),
  soldier: () => boxModel('textures/Entity/Animals/termite_soldier.json', 'textures/Entity/Animals/termite_soldier.png'),
};
_termiteModel.worker(); _termiteModel.soldier();          // fetched from the start: hills let them out at once
/* Its model: an empty root at once, the boxes put in the first frame they are ready (_termiteDress), since a hill may
   let one out before the files are in */
function buildTermite(role) {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const m = { root, mat, mats: [mat], role, rig: null, legs: [] };
  _termiteDress(m);
  return m;
}
function _termiteDress(m) {
  if (m.rig) return true;
  const src = _termiteModel[m.role]();
  if (!src.ready) return false;
  m.mat.map = src.tex; m.mat.needsUpdate = true;
  m.rig = buildBoxRig(src, m.root, m.mat, /^leg_/);
  m.head = m.rig.bones.head || null;
  m.legs = Object.entries(m.rig.parts).map(([name, g]) => ({ g, side: /_l/.test(name) ? 1 : -1, n: +name.slice(-1) || 0, y0: g.rotation.y }));
  return true;
}
function makeTermite(role) {
  return (opts) => ({ model: buildTermite(role), own: { termite: role, hillKey: opts.hill || null, angryT: 0, lookT: 1 + Math.random() * 4 } });
}

// a log a worker can eat: a log or stripped log of a wood that has a hollow log; that hollow log, lying the same way
function _termiteFood(v) {
  const id = v & 255, w = woodOf(id);
  if (!w || w.hollow == null || (id !== w.log && id !== w.stripped)) return 0;
  return (w.hollow | (((v >> 8) & 3) << 8)) >>> 0;
}
// where a termite can stand to chew the log at (x, y, z): a free cell beside it at its height or one under, on ground
function _termiteSpotBy(x, y, z) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    for (const fy of [y, y - 1]) {
      const here = getBlock(x + dx, fy, z + dz);
      if (CORE.solidVal(here) || (here & 255) === B.WATER || (here & 255) === B.LAVA) continue;
      if (CORE.solidVal(getBlock(x + dx, fy - 1, z + dz))) return [x + dx + 0.5, fy, z + dz + 0.5];
    }
  return null;
}
// a cell beside a trunk a climbing termite clings in: open, or leaves
const _termiteCling = (v) => !CORE.solidVal(v) || LEAF_BLOCKS.has(v & 255);
/* The nearest log within TERMITE.look of its hill it can get at, as { x, y, z, sx, sy, sz (where it stands), climb }, or
   null. In each column the TOPMOST log it can eat: a tree is eaten from the top of its trunk down. One standing on the
   ground beside is walked to; one higher up is climbed to, up the trunk's side (`climb`). */
function _termiteFindLog(e, hill) {
  const hx = Math.floor(e.hx), hz = Math.floor(e.hz), hy = hill ? hill.y : Math.floor(e.y), R = TERMITE.look;
  let best = null, bestD = Infinity;
  for (let z = hz - R; z <= hz + R; z++)
    for (let x = hx - R; x <= hx + R; x++) {
      let y = hy + TERMITE.treeUp;
      while (y >= hy - 2 && !_termiteFood(getBlock(x, y, z))) y--;
      if (y < hy - 2) continue;
      const d = (x + 0.5 - e.x) ** 2 + (z + 0.5 - e.z) ** 2;
      if (d >= bestD) continue;
      const s = _termiteSpotBy(x, y, z);
      if (s) { best = { x, y, z, sx: s[0], sy: s[1], sz: s[2], climb: false }; bestD = d; continue; }
      // up a trunk: a side of it to cling in at the log's height
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!_termiteCling(getBlock(x + dx, y, z + dz))) continue;
        best = { x, y, z, sx: x + dx + 0.5, sy: y, sz: z + dz + 0.5, climb: true }; bestD = d;
        break;
      }
    }
  return best;
}

/* ONE TERMITE'S STEP (updateEntities hands it here after the shared bookkeeping: timers, healing, `tp` the nearest
   player). Returns true when it is gone. */
function updateTermite(e, dt, tp, i) {
  const m = e.model, hill = termiteHillOf(e);
  if (!_termiteDress(m)) { m.root.position.set(e.x, e.y, e.z); return false; }
  const pdx = tp.pos.x - e.x, pdz = tp.pos.z - e.z, pdy = tp.pos.y - e.y, pdist = Math.hypot(pdx, pdz);
  const huntable = !tp.canFly && !tp.dead;
  // a blow (damageEntity sets aggroT on a creature that is not a grazer): the hill is angry, the termite too
  if (e.aggroT > 0) { if (hill) hill.angryT = HILL_ANGRY_S; e.angryT = Math.max(e.angryT, e.aggroT); e.aggroT = 0; e.state = 'wander'; }
  if (e.angryT > 0) e.angryT -= dt;
  const angry = e.angryT > 0 || (hill && hill.angryT > 0);
  // home: the middle of its hill; a lost one strolls where it is and in time goes back underground
  if (hill) { e.hx = hill.x + (hill.kind === 'big' ? 1 : 0.5); e.hz = hill.z + (hill.kind === 'big' ? 1 : 0.5); e.lostT = 0; }
  else {
    e.lostT = (e.lostT || 0) + (pdist > 24 ? dt : 0);
    if (e.lostT > TERMITE.lostS) { _removeEntity(i); return true; }
  }
  const hdx = e.hx - e.x, hdz = e.hz - e.z, homeD = Math.hypot(hdx, hdz);
  const tdHill = Math.hypot(tp.pos.x - e.hx, tp.pos.z - e.hz);

  let speed = 0, chew = false, cling = false;
  if (e.termite === 'soldier') {
    /* a soldier: on a player near its hill, or anywhere near when its hill is angry (or it is, without a hill) */
    const near = hill ? tdHill <= TERMITE.guard && Math.abs(tp.pos.y - hill.y) < 4 : false;
    const hunt = huntable && (near || (angry && (hill ? tdHill : pdist) <= TERMITE.angryReach));
    if (hunt) {
      e.yaw = Math.atan2(pdx, pdz); speed = TERMITE.run;
      const reach = TERMITE.reach + entR(e) + (tp.R || 0.3);
      if (pdist < reach && Math.abs(pdy) < 1.2) {
        speed = 0;
        if (e.atkCd <= 0) { e.atkCd = TERMITE.biteCd; e.atkAnimT = 0.25; _mobStrikePlayer(e, tp, TERMITE.bite, pdx, pdz, pdist); }
      }
    } else speed = _termiteStroll(e, dt, homeD, hdx, hdz);
  } else {
    /* a worker: away from a player that hit it; else to a log near its hill, chewing it hollow; else about the hill */
    if (e.down) {                                    // climbing back down a trunk, to the ground
      cling = true;
      if (_entBlocked(e.x, e.y - 0.05, e.z)) { e.down = false; cling = false; }
      else e.y = Math.max(Math.floor(e.y - 0.05), e.y - TERMITE.climb * dt);
    }
    else if (angry && huntable && pdist < 8) { e.yaw = Math.atan2(-pdx, -pdz); speed = TERMITE.run; e.food = null; }
    else if ((e.ate || 0) >= TERMITE.full) {         // full: home, and into the hill to rest
      if (!hill || homeD < 0.9) { if (hill) termiteHillRest(hill); _removeEntity(i); return true; }
      e.yaw = Math.atan2(hdx, hdz); speed = TERMITE.walk;
    }
    else if (e.food) {
      const f = e.food, v = getBlock(f.x, f.y, f.z), hollow = _termiteFood(v);
      e.foodT = (e.foodT || 0) + dt;
      if (!hollow || e.foodT > TERMITE.giveUpS + (e.eatT || 0) + (f.climb ? 30 / TERMITE.climb : 0)) {
        if (f.climb && !_entBlocked(e.x, e.y - 0.05, e.z)) e.down = true;   // up a trunk still: down first
        e.food = null; e.eatT = 0;
      }
      else {
        const sdx = f.sx - e.x, sdz = f.sz - e.z, sd = Math.hypot(sdx, sdz);
        if (sd > 0.35) { e.yaw = Math.atan2(sdx, sdz); speed = TERMITE.walk; }
        else if (f.climb && e.y < f.y - 0.02) {      // up the trunk's side
          cling = true; e.yaw = Math.atan2(f.x + 0.5 - e.x, f.z + 0.5 - e.z);
          e.y = Math.min(f.y, e.y + TERMITE.climb * dt);
        }
        else {
          cling = f.climb;
          e.yaw = Math.atan2(f.x + 0.5 - e.x, f.z + 0.5 - e.z);
          chew = true;
          e.eatT = (e.eatT || 0) + dt;
          e.chipT = (e.chipT || 0) - dt;
          if (e.chipT <= 0 && typeof fxHit === 'function') { e.chipT = 0.35; fxHit(f.x, f.y, f.z, v, Math.sign(e.x - f.x - 0.5), 0, Math.sign(e.z - f.z - 0.5)); }
          if (e.eatT >= TERMITE.eatS) {
            setBlock(f.x, f.y, f.z, hollow); e.food = null; e.eatT = 0; e.lookT = 2;
            e.ate = (e.ate || 0) + 1;
            if (f.climb) e.down = true;                  // back down the trunk
          }
        }
      }
    } else {
      e.lookT -= dt;
      if (e.lookT <= 0) {
        e.lookT = TERMITE.lookS[0] + Math.random() * (TERMITE.lookS[1] - TERMITE.lookS[0]);
        const f = _termiteFindLog(e, hill);
        if (f) { e.food = f; e.foodT = 0; e.eatT = 0; }
      }
      if (!e.food) speed = _termiteStroll(e, dt, homeD, hdx, hdz);
    }
  }
  return _termiteMove(e, dt, speed, chew, i, cling);
}
// about its home: a stroll and a pause by turns, back toward the hill once past the leash. Its speed.
function _termiteStroll(e, dt, homeD, hdx, hdz) {
  e.wanderT -= dt;
  if (e.wanderT <= 0) {
    e.wanderT = 1.5 + Math.random() * 3;
    e.state = Math.random() < 0.4 ? 'idle' : 'wander';
    if (e.state === 'wander') e.yaw = homeD > TERMITE.leash ? Math.atan2(hdx, hdz) : Math.random() * Math.PI * 2;
  }
  return e.state === 'wander' ? TERMITE.walk : 0;
}
// walking (a hop over a block's step), falling (not while it clings to a trunk), water and lava, then the pose. True when it died.
function _termiteMove(e, dt, speed, chew, i, cling = false) {
  let moved = 0;
  const stunned = e.kx !== 0 || e.kz !== 0;
  e.wantMove = speed > 0 && !stunned;
  if (speed > 0 && !stunned) {
    const sx = Math.sin(e.yaw) * speed * dt, sz = Math.cos(e.yaw) * speed * dt;
    let blocked = false;
    if (!_entBlocked(e.x + sx, e.y, e.z) && !_entHazard(e.x + sx, e.y, e.z)) { e.x += sx; moved += Math.abs(sx); } else blocked = true;
    if (!_entBlocked(e.x, e.y, e.z + sz) && !_entHazard(e.x, e.y, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else blocked = true;
    if (blocked && e.onGround && e.jumpCd <= 0 && !_entBlocked(e.x + sx, e.y + 1, e.z + sz)) { e.vy = ENT_JUMP; e.jumpCd = 0.6; e.onGround = false; }
    else if (blocked && e.turnCd <= 0 && e.state !== 'chase') { e.yaw = Math.random() * Math.PI * 2; e.turnCd = 0.6; }
  }
  if (e.turnCd > 0) e.turnCd -= dt;
  if (e.kx || e.kz) {                                       // a blow's knockback, spent
    const kdx = e.kx * dt, kdz = e.kz * dt;
    if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
    if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
    const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= k; e.kz *= k;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
  }
  const wasGround = e.onGround;
  if (cling) { e.vy = 0; e.onGround = true; }
  else if (e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z)) { e.y = Math.floor(e.y - 0.02) + 1; e.vy = 0; e.onGround = true; }
  else {
    const ny = _entFallStep(e, dt);
    if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; } e.vy = 0; }
    else { e.y = ny; e.onGround = false; }
  }
  if (_entFallDamage(e, i, wasGround, false)) return true;
  // lava burns it away; water drowns it, a little a second
  const at = getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255;
  if (e.hazCd > 0) e.hazCd -= dt;
  if ((at === B.LAVA || at === B.WATER) && e.hazCd <= 0) {
    e.hazCd = 1; e.hurtT = 0.25;
    e.hp -= at === B.LAVA ? 100 : 5;
    if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return true; }
  }
  /* the pose: its legs swing in two sets of three, the head nods as it chews or bites */
  const m = e.model;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  const spd = moved / Math.max(dt, 1e-4);
  e.walk += (chew ? 4 : Math.min(spd, 4) * 9) * dt;
  for (const l of m.legs) {
    const set = (l.n + (l.side > 0 ? 0 : 1)) % 2 ? 1 : -1;
    l.g.rotation.y = l.y0 + (spd > 0.05 || e.flailT > 0 ? Math.sin(e.walk) * 0.45 * set : 0);
  }
  if (m.head) m.head.rotation.x = chew ? Math.sin(e.walk * 2.5) * 0.18 : e.atkAnimT > 0 ? -0.35 * Math.sin((e.atkAnimT / 0.25) * Math.PI) : 0;
  if (e.atkAnimT > 0) e.atkAnimT -= dt;
  if (e.flailT > 0) e.flailT -= dt;
  const b = _lightAt(e.x, e.y + 0.3, e.z);
  if (e.hurtT > 0) m.mat.color.setRGB(_HURT_COL.r * b, _HURT_COL.g * b, _HURT_COL.b * b); else m.mat.color.setScalar(b);
  return false;
}

/* Their entries in the creature table (entities/mobs.js says what each line is for). */
const _termiteLoot = (e, pop, first) => first(ITEM.CHITIN_PLATE, LOOT.chitin);   // the Butcher skill adds to it
defineMob('termite_worker', {
  name: 'Termite worker', group: 'animal', body: 'insect', unsaved: true,
  hp: 12, box: [0.3, 0.3], walk: TERMITE.walk, fallSafe: 10,
  make: makeTermite('worker'), build: () => buildTermite('worker'),
  loot: _termiteLoot,
});
defineMob('termite_soldier', {
  name: 'Termite soldier', group: 'animal', body: 'insect', unsaved: true,
  hp: 24, box: [0.3, 0.32], walk: TERMITE.walk, chase: TERMITE.run, reach: TERMITE.reach, fallSafe: 10,
  make: makeTermite('soldier'), build: () => buildTermite('soldier'),
  loot: _termiteLoot,
});
