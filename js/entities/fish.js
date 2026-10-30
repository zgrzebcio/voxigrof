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
/* Out of water (stranded, or in a player's hands: player/fish-hold.js) a fish has FISH_DRY_GRACE seconds of air, then
   loses FISH_DRY_HP every FISH_DRY_EVERY until it dies: slowly */
const FISH_DRY_GRACE = 35, FISH_DRY_EVERY = 3, FISH_DRY_HP = 5;
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

/* Fish: a school of one species in water at least FISH_MIN_DEPTH deep, somewhere between the bed and a block under the
   surface. Which species lives in which water is FISH_WATERS: in fresh water (a river, a lake, an oasis's pool) pike and
   cod, and catfish on the bottom where it is deep; in the sea cod and salmon; in the deep sea mostly salmon. A school
   keeps FISH_APART from a school of another species, so a reach of water is the pike's or the cod's. FISH_SCHOOL: how
   many swim together, spread over a few blocks round where they start. */
const FISH_WATERS = {
  fresh: { pike: 45, cod: 35, catfish: 20 },
  sea:   { cod: 55, salmon: 45 },
  deep:  { salmon: 75, cod: 25 },
};
const FISH_SCHOOL = { cod: [3, 6], salmon: [2, 5], pike: [2, 4], catfish: [1, 3] };
const FISH_CHUNK_CHANCE = 0.072, FISH_MIN_DEPTH = 2, FISH_APART = 24, FISH_SPREAD = 1.6;
const _fishWaterOf = (biome) => (biome === 'River' || biome === 'Lake' || biome === 'Oasis') ? 'fresh'
                              : /^Deep .*Ocean$/.test(biome) ? 'deep' : 'sea';
// a species for that water, by its weights; a bottom fish only where it is deep
function _rollFishIn(water, deep) {
  const w = FISH_WATERS[water];
  let tot = 0;
  for (const s in w) if (deep || !FISH[s].bottom) tot += w[s];
  let r = Math.random() * tot;
  for (const s in w) {
    if (!deep && FISH[s].bottom) continue;
    if ((r -= w[s]) < 0) return s;
  }
  return 'cod';
}
function _otherSchoolNear(x, z, species) {
  for (const e of ENTITIES)
    if (isFish(e) && e.species !== species && Math.abs(e.x - x) < FISH_APART && Math.abs(e.z - z) < FISH_APART
        && Math.hypot(e.x - x, e.z - z) < FISH_APART) return true;
  return false;
}
// the top of the water over a column's bed (a block standing in water counts as water), or the bed when it is dry
function _fishWaterTop(x, z, bed) {
  let top = bed;
  while (top < WORLD_TOP && isWaterVal(getBlock(x, top + 1, z))) top++;
  return top;
}
function _rollFish(cx, cz) {
  if (Math.random() >= FISH_CHUNK_CHANCE * ANIMAL_SPAWN_MUL) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = cx * 16 + Math.floor(Math.random() * 16), z = cz * 16 + Math.floor(Math.random() * 16);
    const bed = surfaceY(x, z), depth = _fishWaterTop(x, z, bed) - bed;
    if (depth < FISH_MIN_DEPTH) continue;
    const species = _rollFishIn(_fishWaterOf(mainGen.biomeAt(x, z)), depth >= 3);
    if (_otherSchoolNear(x + 0.5, z + 0.5, species)) continue;
    const [lo, hi] = FISH_SCHOOL[species];
    for (let k = _ri(lo, hi); k > 0; k--) {
      // spread round the spot, each over water as deep; one that finds none starts on the spot itself
      let sx = x, sz = z, sbed = bed, sdepth = depth;
      const ox = x + Math.round((Math.random() * 2 - 1) * FISH_SPREAD), oz = z + Math.round((Math.random() * 2 - 1) * FISH_SPREAD);
      const obed = surfaceY(ox, oz), odepth = _fishWaterTop(ox, oz, obed) - obed;
      if (odepth >= FISH_MIN_DEPTH) { sx = ox; sz = oz; sbed = obed; sdepth = odepth; }
      const fy = FISH[species].bottom ? sbed + 1.1 : sbed + 1.1 + Math.random() * Math.max(0, sdepth - 2);
      summon('fish', sx + 0.5 + (Math.random() - 0.5) * 0.4, fy, sz + 0.5 + (Math.random() - 0.5) * 0.4, { species });   // mid-column: wholly in water
    }
    return;
  }
}

/* Fish tick. In water it drifts on its own heading and depth, darts away after a hit, and keeps its whole body in water —
   at a wall, a bank or the surface it turns rather than leave. It also darts off (_fishScare) from a player splashing into
   the water near it (`_splashAt`, set in tickPlayer), from an otter close by, and the moment it is back in the water after
   being stranded; it flees from where the fright came from (`_fleeFrom`), or else from the nearest player. Stranded, it
   lies on its side and flops toward the nearest water it can see (_fishWaterNear), a hop at a time, and after
   FISH_DRY_GRACE seconds starts to suffocate. A player taking it in hand holds it still (`_grabHold`,
   player/fish-hold.js). Returns true when it died and was removed. */
const FISH_SPLASH_R = 8, FISH_SPLASH_MS = 600;     // a player landing in the water this near, this lately, frightens it
const FISH_OTTER_R = 4.5;                          // ...and an otter this near
// whether something frightens a fish in the water now (looked at four times a second): it then flees from it
function _fishScare(e, dt) {
  e._scareT = (e._scareT || 0) - dt;
  if (e._scareT > 0) return;
  e._scareT = 0.25;
  const now = performance.now();
  let from = null;
  for (const p of PLAYERS)
    if (p._splashAt && now - p._splashAt < FISH_SPLASH_MS && Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < FISH_SPLASH_R) { from = p.pos; break; }
  if (!from)
    for (const o of ENTITIES)
      if (o.kind === 'otter' && o.active !== false && Math.abs(o.x - e.x) < FISH_OTTER_R && Math.abs(o.z - e.z) < FISH_OTTER_R
          && Math.abs(o.y - e.y) < 3 && Math.hypot(o.x - e.x, o.z - e.z) < FISH_OTTER_R) { from = o; break; }
  if (from) _fishFlee(e, from.x, from.z);
}
const _fishFlee = (e, x, z) => { e.fleeT = FISH_FLEE_TIME; e._fleeFrom = { x, z }; e.turnCd = 0; };
const FISH_SEEK_R = 6, FISH_SEEK_S = 1.2;          // how far a stranded fish looks for water, and how often
const FISH_HOP_SPEED = 2.4, FISH_HOP_VY = 4.2;     // a flop toward it: across, and up
// the nearest water a stranded fish can flop to: a cell's middle { x, y, z } within FISH_SEEK_R, a little under it or one
// over, or null. Looked for again every FISH_SEEK_S.
function _fishWaterNear(e, dt) {
  e._seekT = (e._seekT || 0) - dt;
  if (e._seekT > 0) return e._seekAt || null;
  e._seekT = FISH_SEEK_S;
  const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
  let best = null, bd = Infinity;
  for (let dz = -FISH_SEEK_R; dz <= FISH_SEEK_R; dz++)
    for (let dx = -FISH_SEEK_R; dx <= FISH_SEEK_R; dx++) {
      const d = dx * dx + dz * dz;
      if (d >= bd || d > FISH_SEEK_R * FISH_SEEK_R) continue;
      for (let dy = 1; dy >= -3; dy--)
        if (isWaterVal(getBlock(bx + dx, by + dy, bz + dz))) { best = { x: bx + dx + 0.5, y: by + dy, z: bz + dz + 0.5 }; bd = d; break; }
    }
  return (e._seekAt = best);
}
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
  const grabbed = e._grabHold > 0;                     // a player's hands closing on it: it stays where it is
  if (grabbed) e._grabHold -= dt;
  let speed = 0;
  if (inWater) {
    if (e._stranded) { e._stranded = false; if (!grabbed) _fishFlee(e, tp.pos.x, tp.pos.z); }   // back in the water: off it goes
    e.dryT = 0; e.onGround = false; e.vy = 0; e.hopX = e.hopZ = 0;
    if (!grabbed && !(e.fleeT > 0)) _fishScare(e, dt);
    if (!(e.fleeT > 0)) e._fleeFrom = null;
    if (grabbed) { e.swimVy = 0; e.state = 'idle'; }
    else if (e.fleeT > 0) {
      // away from what frightened it (else the nearest player), jinking a little
      if (e.turnCd <= 0) {
        const from = e._fleeFrom || tp.pos;
        e.yaw = Math.atan2(e.x - from.x, e.z - from.z) + (Math.random() - 0.5) * 0.8;
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
    if (grabbed) { /* held still */ }
    else if (_fishWet(e, e.x + sx, e.y, e.z + sz)) { e.x += sx; e.z += sz; }
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
    // stranded: it falls, flops toward water a hop at a time (sideways across the air, landing where it lands), and
    // slowly suffocates
    e._stranded = true;
    const ny = _entFallStep(e, dt);
    if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; e.hopX = e.hopZ = 0; } e.vy = 0; }
    else { e.y = ny; e.onGround = false; }
    if (e.onGround && e.jumpCd <= 0 && !grabbed) {
      e.jumpCd = 0.45 + Math.random() * 0.6;
      const w = _fishWaterNear(e, FISH_SEEK_S);
      if (w) e.yaw = Math.atan2(w.x - e.x, w.z - e.z) + (Math.random() - 0.5) * 0.3;
      else e.yaw += (Math.random() - 0.5) * 2;
      const hs = w ? FISH_HOP_SPEED : FISH_HOP_SPEED * 0.5;
      e.vy = FISH_HOP_VY + Math.random() * 1.2 + (w && w.y > e.y ? 2.5 : 0);   // a bank a block up takes a higher hop
      e.hopX = Math.sin(e.yaw) * hs; e.hopZ = Math.cos(e.yaw) * hs;
      e.onGround = false;
    }
    if (!e.onGround && (e.hopX || e.hopZ)) {
      const hx = e.hopX * dt, hz = e.hopZ * dt;
      if (!_entBlocked(e.x + hx, e.y, e.z)) e.x += hx; else e.hopX = 0;
      if (!_entBlocked(e.x, e.y, e.z + hz)) e.z += hz; else e.hopZ = 0;
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
        e.hp -= FISH_DRY_HP; e.hurtT = 0.25;           // out of 100
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
     the dive; stranded it rolls onto its side (eased, `rollK`), thrashing, and in a hop it bends nose up as it rises and
     nose down as it falls ---- */
  const m = e.model;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  e.rollK = (e.rollK || 0) + ((inWater ? 0 : 1) - (e.rollK || 0)) * Math.min(1, dt * 7);
  const beat = Math.sin(e.walk * 3), hop = !inWater && !e.onGround;
  const wag = inWater ? beat * (0.25 + Math.min(0.35, speed * 0.07)) : beat * (hop ? 0.95 : 0.7);
  m.tail.rotation.y = wag;
  m.swim.rotation.y = -wag * 0.25;
  m.swim.rotation.x = inWater ? -Math.max(-0.5, Math.min(0.5, e.swimVy * 0.5)) : hop ? -Math.max(-0.7, Math.min(0.7, e.vy * 0.12)) : 0;
  m.swim.rotation.z = Math.PI / 2 * 0.92 * e.rollK;
  m.swim.position.y = (3 * sp.body[1] + (2 * sp.body[0] * sp.head[0] - 3 * sp.body[1]) * e.rollK) * PX;
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
