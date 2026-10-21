'use strict';
/* entities/fish.js: fish. The four species, their model, spawning, schools, and how one swims. */

/* ================================ fish ================================
   Four species living in water: cod < salmon < pike < catfish, by size and health. Passive — a hit
   sends one darting away — and each drops one of its own raw fish. They have a level like every
   creature but no gender. On land they flop about and slowly suffocate.

   One sheet per species (textures/Entity/Fish/<species>.png, 128x128, the 64-unit layout at 2x), all on
   the same box layout, painted by toolsrc/fish-tex.ps1 (PowerShell; it refuses to overwrite a sheet):
     body     4w x 6h x 12d at (0, 0)     head   4x5x4 at (0, 20)     tail  1x6x5 at (20, 20)
     dorsal   1x3x6 at (34, 0)            pectoral fin 3x1x2 at (34, 12)
     whisker  1x1x4 at (34, 18)  (drawn on the catfish's sheet only)
   A species' shape is the same boxes STRETCHED (`body`/`head` scales below): a pike long and thin,
   a catfish wide-headed and flat. `len` is its overall size; each fish then rolls its own size. */
const FISH = {
  cod:     { name: 'Cod',     hp: 20, item: ITEM.COD,     len: 0.55, body: [1, 1, 1],        head: [1, 1, 1],        speed: 1.6, flee: 4.2, weight: 40 },
  salmon:  { name: 'Salmon',  hp: 25, item: ITEM.SALMON,  len: 0.68, body: [0.9, 0.95, 1.2], head: [0.9, 0.9, 1.1],  speed: 1.9, flee: 4.8, weight: 30 },
  pike:    { name: 'Pike',    hp: 35, item: ITEM.PIKE,    len: 0.85, body: [0.8, 0.8, 1.5],  head: [0.85, 0.75, 1.5], speed: 1.8, flee: 5.2, weight: 20 },
  catfish: { name: 'Catfish', hp: 40, item: ITEM.CATFISH, len: 1.0,  body: [1.25, 0.85, 1.1], head: [1.5, 0.8, 1.1], speed: 1.2, flee: 3.8, weight: 10, whiskers: true, bottom: true },
};
const FISH_SPECIES = Object.keys(FISH);
const FISH_FLEE_TIME = 4;
const FISH_DRY_GRACE = 4, FISH_DRY_EVERY = 1.5;   // seconds out of water before it starts to suffocate, then per point
const _fishTex = {};
for (const s of FISH_SPECIES) _fishTex[s] = _nearestTex('textures/Entity/Fish/' + s + '.png');
function buildFish(species) {
  const sp = FISH[species] || FISH.cod;
  const mat = new THREE.MeshBasicMaterial({ map: _fishTex[species] || _fishTex.cod, transparent: true, alphaTest: 0.5,
                                            side: THREE.DoubleSide });
  const root = new THREE.Group();
  // `swim` carries the whole fish: it pitches with the dive and rolls onto its side when stranded
  const swim = new THREE.Group();
  swim.position.y = 3 * PX * sp.body[1];
  const body = _part(mat, 4, 6, 12, 0, 0);
  body.scale.set(...sp.body);
  const head = _part(mat, 4, 5, 4, 0, 20);
  head.scale.set(...sp.head);
  head.position.set(0, -0.3 * PX, (6 * sp.body[2] + 2 * sp.head[2]) * PX);
  const tail = new THREE.Group();                       // wags from where it joins the body
  tail.position.z = -6 * sp.body[2] * PX;
  const fin = _part(mat, 1, 6, 5, 20, 20);
  fin.position.z = -2.5 * PX;
  fin.scale.y = Math.max(0.8, sp.body[1]);
  tail.add(fin);
  const dorsal = _part(mat, 1, 3, 6, 34, 0);
  // a pike carries its dorsal fin far back, by the tail, the others mid-back
  dorsal.position.set(0, (3 * sp.body[1] + 1.4) * PX, (species === 'pike' ? -3.2 : 0.5) * sp.body[2] * PX);
  const finL = _part(mat, 3, 1, 2, 34, 12), finR = _part(mat, 3, 1, 2, 34, 12);
  finL.position.set( (2 * sp.body[0] + 1.2) * PX, -1.6 * PX * sp.body[1], 3.5 * sp.body[2] * PX);
  finR.position.set(-(2 * sp.body[0] + 1.2) * PX, -1.6 * PX * sp.body[1], 3.5 * sp.body[2] * PX);
  finL.rotation.z = -0.45; finR.rotation.z = 0.45;
  swim.add(body, head, tail, dorsal, finL, finR);
  if (sp.whiskers) {                                    // a catfish's barbels, from the corners of its mouth
    for (const sx of [1, -1]) {
      const w = _part(mat, 1, 1, 4, 34, 18);
      w.position.set(sx * 2.2 * sp.head[0] * PX, -1.6 * PX, head.position.z + 2.5 * PX);
      w.rotation.set(0.35, sx * 0.55, 0);
      swim.add(w);
    }
  }
  root.add(swim);
  return { root, swim, tail, fins: [finL, finR], mat, mats: [mat], tint: new THREE.Color(1, 1, 1) };
}
// a fish's box: its species' length times its own roll, flatter than it is long
const fishLen = (e) => (FISH[e.species] || FISH.cod).len * (e.size || 1);
/* What one fish is made of: its model and what only a fish has. summon('fish', x, y, z, opts) writes the rest
   (entities/mobs.js). `opts`: species (rolled if not one of FISH), size. A fish has a level but no gender. */
function makeFish(opts) {
  const species = FISH[opts.species] ? opts.species : _rollFishSpecies();
  const sp = FISH[species];
  const size = _animalSize(opts);
  return {
    model: buildFish(species), scale: sp.len * size,
    own: {
      species, size, swimVy: 0, dryT: 0,
      name: sp.name,                                    // its species' name, not "Fish"
      walk: Math.random() * 6,                          // where its tail's beat starts, so a school is not in step
    },
  };
}
function _rollFishSpecies(bottom = true) {
  let tot = 0;
  for (const s of FISH_SPECIES) if (bottom || !FISH[s].bottom) tot += FISH[s].weight;
  let r = Math.random() * tot;
  for (const s of FISH_SPECIES) {
    if (!bottom && FISH[s].bottom) continue;
    if ((r -= FISH[s].weight) < 0) return s;
  }
  return 'cod';
}

/* Fish: a small school of one species in water at least FISH_MIN_DEPTH deep, somewhere between
   the bed and a block under the surface. A catfish keeps to the bottom, and only where it is deep. */
const FISH_CHUNK_CHANCE = 0.06, FISH_SCHOOL_MIN = 1, FISH_SCHOOL_MAX = 3, FISH_MIN_DEPTH = 2;
function _rollFish(cx, cz) {
  if (Math.random() >= FISH_CHUNK_CHANCE * ANIMAL_SPAWN_MUL) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = cx * 16 + Math.floor(Math.random() * 16), z = cz * 16 + Math.floor(Math.random() * 16);
    const bed = surfaceY(x, z);
    let top = bed;
    while (top < WORLD_TOP && (getBlock(x, top + 1, z) & 255) === B.WATER) top++;
    const depth = top - bed;
    if (depth < FISH_MIN_DEPTH) continue;
    const species = _rollFishSpecies(depth >= 3);
    const n = species === 'cod' ? _ri(2, 4) : _ri(FISH_SCHOOL_MIN, FISH_SCHOOL_MAX);
    for (let k = 0; k < n; k++) {
      const fy = FISH[species].bottom ? bed + 1.1 : bed + 1.1 + Math.random() * Math.max(0, depth - 2);
      summon('fish', x + 0.5 + (Math.random() - 0.5) * 0.4, fy, z + 0.5 + (Math.random() - 0.5) * 0.4, { species });   // mid-column: wholly in water
    }
    return;
  }
}

/* Fish tick. In water it drifts on its own heading and depth, darts away from whoever is nearest
   after a hit, and keeps its whole body in water — at a wall, a bank or the surface it turns rather than
   leave. Stranded, it flops about and after FISH_DRY_GRACE seconds starts to suffocate. Returns true when
   it died and was removed. */
function _fishWet(e, x, y, z) {
  const R = entR(e), H = entH(e);
  for (const yy of [y + 0.02, y + H - 0.02])
    for (const dx of [-R, R]) for (const dz of [-R, R])
      if ((getBlock(Math.floor(x + dx), Math.floor(yy), Math.floor(z + dz)) & 255) !== B.WATER) return false;
  return true;
}
function _updateFish(e, dt, tp, i) {
  const sp = FISH[e.species] || FISH.cod;
  const H = entH(e);
  const inWater = isWaterVal(getBlock(Math.floor(e.x), Math.floor(e.y + H * 0.5), Math.floor(e.z)));
  if (e.fleeT > 0) e.fleeT -= dt;
  if (e.flailT > 0) e.flailT -= dt;
  if (e.turnCd > 0) e.turnCd -= dt;
  let speed = 0;
  if (inWater) {
    e.dryT = 0; e.onGround = false; e.vy = 0;
    if (e.fleeT > 0) {
      // away from the nearest player, jinking a little
      if (e.turnCd <= 0) {
        e.yaw = Math.atan2(e.x - tp.pos.x, e.z - tp.pos.z) + (Math.random() - 0.5) * 0.8;
        e.swimVy = (Math.random() - 0.5) * 1.2; e.turnCd = 0.4;
      }
      speed = sp.flee;
    } else {
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 1.5 + Math.random() * 3.5;
        e.state = Math.random() < 0.25 ? 'idle' : 'wander';
        e.yaw += (Math.random() - 0.5) * 2.2;
        e.swimVy = sp.bottom ? -0.25 : (Math.random() - 0.5) * 0.7;
        const hdx = e.hx - e.x, hdz = e.hz - e.z;             // a short leash: a school stays a school
        if (Math.hypot(hdx, hdz) > 48) e.yaw = Math.atan2(hdx, hdz);
      }
      speed = e.state === 'idle' ? sp.speed * 0.15 : sp.speed;
    }
    const sx = Math.sin(e.yaw) * speed * dt, sz = Math.cos(e.yaw) * speed * dt;
    if (_fishWet(e, e.x + sx, e.y, e.z + sz)) { e.x += sx; e.z += sz; }
    else if (e.turnCd <= 0) { e.yaw += Math.PI * (0.6 + Math.random() * 0.8); e.turnCd = 0.35; }
    // up and down: it never breaks the surface, and bounces gently off the bed
    const ny = e.y + e.swimVy * dt;
    if (_fishWet(e, e.x, ny, e.z)) e.y = ny; else e.swimVy = -e.swimVy * 0.5;
    if (e.kx || e.kz) {                                     // a hit's knockback, spent in the water
      const kdx = e.kx * dt, kdz = e.kz * dt;
      if (_fishWet(e, e.x + kdx, e.y, e.z + kdz)) { e.x += kdx; e.z += kdz; }
      const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
    }
    if (waterFlowVec(Math.floor(e.x), Math.floor(e.y + H * 0.5), Math.floor(e.z), _flowV, false)) {   // not a river's own run: a fish holds its place in it
      const fdx = _flowV.x * 1.2 * dt, fdz = _flowV.z * 1.2 * dt;
      if (_fishWet(e, e.x + fdx, e.y, e.z + fdz)) { e.x += fdx; e.z += fdz; }
    }
    e.walk += (1.5 + speed * 1.6) * dt;
  } else {
    // stranded: it falls, flops, and slowly suffocates
    e.vy = Math.max(-34, e.vy - ENT_GRAVITY * dt);
    const ny = e.y + e.vy * dt;
    if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; } e.vy = 0; }
    else { e.y = ny; e.onGround = false; }
    if (e.onGround && e.jumpCd <= 0) {
      e.jumpCd = 0.5 + Math.random() * 0.9;
      e.vy = 3 + Math.random() * 2;
      e.yaw += (Math.random() - 0.5) * 2;
      e.kx = Math.sin(e.yaw) * 1.4; e.kz = Math.cos(e.yaw) * 1.4;
    }
    if (e.kx || e.kz) {
      const kdx = e.kx * dt, kdz = e.kz * dt;
      if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
      if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
      const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
    }
    e.dryT = (e.dryT || 0) + dt;
    if (e.dryT > FISH_DRY_GRACE) {
      e.hazCd -= dt;
      if (e.hazCd <= 0) {
        e.hazCd = FISH_DRY_EVERY;
        e.hp -= 5; e.hurtT = 0.25;                     // out of 100
        if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return true; }
      }
    }
    e.walk += 12 * dt;
  }
  // lava is lava
  if ((getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255) === B.LAVA) {
    if (!player.canFly) _entDropLoot(e);
    _removeEntity(i); return true;
  }
  /* ---- visuals: the tail beats faster the faster it swims, the body counter-sways, it pitches with
     the dive, and stranded it lies on its side thrashing ---- */
  const m = e.model;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  const beat = Math.sin(e.walk * 3);
  const wag = inWater ? beat * (0.25 + Math.min(0.35, speed * 0.07)) : beat * 0.7;
  m.tail.rotation.y = wag;
  m.swim.rotation.y = -wag * 0.25;
  m.swim.rotation.x = inWater ? -Math.max(-0.5, Math.min(0.5, e.swimVy * 0.5)) : 0;
  m.swim.rotation.z = inWater ? 0 : Math.PI / 2 * 0.92;
  m.swim.position.y = (inWater ? 3 * sp.body[1] : 2 * sp.body[0] * sp.head[0]) * PX;
  m.fins[0].rotation.y = 0.3 + Math.sin(e.walk * 2) * 0.25;
  m.fins[1].rotation.y = -0.3 - Math.sin(e.walk * 2) * 0.25;
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, entH(e) * 0.5);   // lit at its middle, in the water
  return false;
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). One kind for all four species:
   what differs between them (health, speeds, the fish it drops) is in FISH, read through `e.species`. */
defineMob('fish', {
  name: 'Fish', group: 'fish', body: 'fish',
  maxHp: (e) => (FISH[e.species] || FISH.cod).hp,
  box: [0.3, 0.42], sizeOf: fishLen, sized: true,      // a short squat column round its middle, by its length
  fleeTime: FISH_FLEE_TIME,
  make: makeFish, build: (look) => buildFish(FISH[look.species] ? look.species : 'cod'),
  roll: _rollFish,                                     // its own rule: a school in water deep enough
  save: (e) => ({ sp: e.species, sz: e.size, lv: e.level }),
  load: (s) => summon('fish', s.x, s.y, s.z, { species: s.d.sp, size: s.d.sz, level: s.d.lv, hp: s.hp, hx: s.hx, hz: s.hz }),
  // one of its own, raw: always one, no skill adds to it
  loot: (e, pop) => pop((FISH[e.species] || FISH.cod).item, rollLoot(LOOT.fish)),
  burnt: (e) => [(FISH[e.species] || FISH.cod).item, LOOT.fish],
});
