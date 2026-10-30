'use strict';
/* js/entities/tumbleweed.js: the tumbleweed. A ball of dry stems that the wind rolls over the dry land (the deserts, the
   Savanna, the Dryland), bouncing, hopping up a block, turning off a wall. A creature of the creature table with a step
   of its own (`step`, entities/mobs.js), never saved: they come and go with the wind (updateTumbleweeds, from the main
   loop, puts new ones round the players and lets far ones go).

   A blow of anything breaks it: most of the time it held nothing, else one thing caught in it (rollTumbleweed: chitin,
   string, a stick, fiber, a feather, a leather strip, very rarely fur). Fire takes it at once: it burns for
   TUMBLE.burnS, setting fire to where it rolls, and is gone. Water soaks it apart. A meerkat looking for things searches
   one (entities/meerkat.js) and it falls apart.

   Its picture is the billboard textures/Billboards/Plants/Warm/tumbleweed.png on crossed planes; all numbers in TUMBLE. */
const TUMBLE = {
  r: 0.4,                                 // its radius at size 1, blocks
  windK: 0.3,                             // of the wind's own speed it rolls at
  calm: 6,                                // km/h: under this no new one comes, and those about slow to a stop
  hopEvery: [0.6, 1.6], hop: 2.6,         // a bounce now and then while it rolls, this fast up
  life: [150, 260],                       // seconds it rolls before it goes (only out of sight)
  burnS: 1,                               // seconds it burns before it is gone
  // round the players: at most this many, a new one tried every `every` s, `near`-`far` blocks from a player
  max: 6, every: 5, near: 18, far: 44,
};
const TUMBLE_BIOMES = new Set(['Desert', 'Desert Hills', 'Red Sand', 'Red Sand Hills', 'Deep Desert', 'Deep Red Desert', 'Deep Red Desert Flat', 'Savanna', 'Dryland']);
/* What one held, rolled when it breaks or a meerkat searches it: [item, chance, min, max]; no line hit = nothing. The
   chances add up to 0.45: more than half hold nothing. */
const TUMBLE_LOOT = [
  [ITEM.STICK, 0.10, 1, 2], [ITEM.FIBER, 0.10, 1, 3], [ITEM.CHITIN_PLATE, 0.07, 1, 1], [ITEM.STRING, 0.07, 1, 1],
  [ITEM.FEATHER, 0.05, 1, 1], [ITEM.LEATHER_STRIP, 0.05, 1, 1], [ITEM.FUR, 0.01, 1, 1],
];
function rollTumbleweed() {
  let r = Math.random();
  for (const [id, ch, lo, hi] of TUMBLE_LOOT) {
    if (r < ch) return { id, n: lo + Math.floor(Math.random() * (hi - lo + 1)) };
    r -= ch;
  }
  return null;
}

/* ---------------------------------- the model ---------------------------------- */
let _tumbleTex = null;
function _tumbleTexture() {
  if (_tumbleTex) return _tumbleTex;
  const t = _tumbleTex = new THREE.TextureLoader().load('textures/Billboards/Plants/Warm/tumbleweed.png');
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}
let _tumbleGeo = null;
// five planes through its middle, each the picture: three square to each other and two across, so it is round from anywhere
function _tumbleGeometry() {
  if (_tumbleGeo) return _tumbleGeo;
  const parts = [];
  const plane = (rx, ry) => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(rx); g.rotateY(ry); parts.push(g); };
  plane(0, 0); plane(0, Math.PI / 2); plane(Math.PI / 2, 0); plane(0, Math.PI / 4); plane(0, -Math.PI / 4);
  const pos = [], uv = [], idx = [];
  for (const g of parts) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array);
    for (const k of g.index.array) idx.push(base + k);
    g.dispose();
  }
  _tumbleGeo = new THREE.BufferGeometry();
  _tumbleGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  _tumbleGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  _tumbleGeo.setIndex(idx);
  return _tumbleGeo;
}
function buildTumbleweed() {
  const root = new THREE.Group(), ball = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: _tumbleTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(_tumbleGeometry(), mat);
  mesh.scale.setScalar(TUMBLE.r * 2);
  ball.add(mesh);
  ball.position.y = TUMBLE.r;
  root.add(ball);
  return { root, ball, mat, mats: [mat], tint: new THREE.Color(1, 1, 1) };
}
function makeTumbleweed(opts) {
  const size = opts.size > 0 ? +opts.size : 0.75 + Math.random() * 0.4;
  return {
    model: buildTumbleweed(), scale: size,
    own: { size, level: null, vx: 0, vz: 0, rollA: 0, burnT: 0, windT: 0, wvx: 0, wvz: 0,
           hopT: _tumbleRand(TUMBLE.hopEvery), lifeT: _tumbleRand(TUMBLE.life) },
  };
}
const _tumbleRand = (r) => r[0] + Math.random() * (r[1] - r[0]);

/* ---------------------------------- its step ---------------------------------- */
function updateTumbleweed(e, dt, tp, i) {
  const m = e.model, R = TUMBLE.r * (e.size || 1);
  const bx = Math.floor(e.x), by = Math.floor(e.y + 0.2), bz = Math.floor(e.z);
  const gone = (fx) => { if (fx) _fxEntGone(e, fx === 'burnt'); _removeEntity(i); return true; };
  // water soaks it apart; far from every player, or its time up out of sight, it rolls off for good
  if (isWaterVal(getBlock(bx, by, bz))) return gone('soaked');
  const pd = tp ? Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) : Infinity;
  e.lifeT -= dt;
  if (pd > simDist() * 16 + 16 || (e.lifeT <= 0 && pd > 24)) return gone(null);
  // fire: a fire or lava where it is or under it, or a burning blow, and it is alight; alight, it lights where it rolls
  const here = getBlock(bx, by, bz) & 255, under = getBlock(bx, by - 1, bz) & 255;
  if (!(e.burnT > 0) && (here === B.FIRE || here === B.LAVA || under === B.LAVA || under === B.FIRE || e.fireT > 0)) {
    e.burnT = TUMBLE.burnS;
    if (typeof playSound === 'function') playSound('fireIgnite', { gain: 0.6, pos: { x: e.x, y: e.y + R, z: e.z } });
  }
  if (e.burnT > 0) {
    if (typeof igniteAt === 'function' && (getBlock(bx, by, bz) & 255) !== B.FIRE) igniteAt(bx, by, bz);
    if (typeof fxPuff === 'function' && Math.random() < dt * 12) fxPuff(e.x, e.y + R, e.z, [1, 0.55, 0.15], 2, 0.6);
    e.burnT -= dt;
    if (e.burnT <= 0) return gone('burnt');
  }
  // the wind, looked at once a second: its way, and how hard (in the open; under a roof barely)
  e.windT -= dt;
  if (e.windT <= 0) {
    e.windT = 1;
    const w = typeof weatherAt === 'function' ? weatherAt(e.x, e.z, e.y) : { speed: 0, dir: 0 };
    const roofed = typeof getSkyWorld === 'function' && getSkyWorld(bx, by, bz) < 12;
    const v = w.speed < TUMBLE.calm || roofed ? 0 : w.speed / 3.6 * TUMBLE.windK;
    const [wx, wz] = windVector(w.dir);
    e.wvx = wx * v; e.wvz = wz * v;
  }
  const k = Math.min(1, dt * (e.onGround ? 1.2 : 0.4));
  e.vx += (e.wvx - e.vx) * k; e.vz += (e.wvz - e.vz) * k;
  if (e.kx || e.kz) { e.vx += e.kx * 0.4; e.vz += e.kz * 0.4; e.kx = e.kz = 0; }   // a blow that did not break it sends it off
  // across: a wall turns it back a little, or it hops up the step when it can
  let moved = 0;
  const sx = e.vx * dt, sz = e.vz * dt;
  if (!_entBlocked(e.x + sx, e.y, e.z)) { e.x += sx; moved += Math.abs(sx); }
  else if (e.onGround && _stepUpTarget(e, e.x + sx, e.z) !== null) e.vy = Math.max(e.vy, 5);
  else e.vx *= -0.4;
  if (!_entBlocked(e.x, e.y, e.z + sz)) { e.z += sz; moved += Math.abs(sz); }
  else if (e.onGround && _stepUpTarget(e, e.x, e.z + sz) !== null) e.vy = Math.max(e.vy, 5);
  else e.vz *= -0.4;
  // up and down, and a bounce now and then while it rolls
  const spd = Math.hypot(e.vx, e.vz);
  if (e.onGround) {
    e.hopT -= dt * Math.min(1, spd / 1.5);
    if (e.hopT <= 0 && spd > 0.6) { e.hopT = _tumbleRand(TUMBLE.hopEvery); e.vy = TUMBLE.hop * (0.6 + Math.random() * 0.6); }
  }
  if (e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z)) { e.y = Math.floor(e.y - 0.02) + 1; e.vy = 0; e.onGround = true; }
  else {
    const ny = _entFallStep(e, dt);
    if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; } e.vy = 0; }
    else { e.y = ny; e.onGround = false; }
  }
  // drawn: turned to where it goes, rolling over by the way it went
  if (spd > 0.05) e.yaw = Math.atan2(e.vx, e.vz);
  e.rollA += moved / Math.max(0.1, R);
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  m.ball.rotation.x = e.rollA;
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, R);
  return false;
}

/* ---------------------------------- where they come from ----------------------------------
   From the main loop while a world runs: every TUMBLE.every seconds, with fewer than TUMBLE.max about, one is tried
   TUMBLE.near-TUMBLE.far blocks from a player, on open dry land (TUMBLE_BIOMES) where the wind blows at TUMBLE.calm or more. */
let _tumbleT = 0;
function updateTumbleweeds(dt) {
  if (menuScene || !currentWorld || !anyPlayerSpawned() || !worldHasAnimals()) return;
  _tumbleT -= dt;
  if (_tumbleT > 0) return;
  _tumbleT = TUMBLE.every;
  let n = 0;
  for (const e of ENTITIES) if (e.kind === 'tumbleweed') n++;
  if (n >= TUMBLE.max) return;
  const live = PLAYERS.filter(p => p.spawned && !p.dead);
  if (!live.length) return;
  const p = live[(Math.random() * live.length) | 0];
  const a = Math.random() * Math.PI * 2, d = TUMBLE.near + Math.random() * (TUMBLE.far - TUMBLE.near);
  const x = Math.floor(p.pos.x + Math.sin(a) * d), z = Math.floor(p.pos.z + Math.cos(a) * d);
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!c || !c.data || !inSimRange(x, z)) return;
  if (!TUMBLE_BIOMES.has(BIOMES.biomeBase(mainGen.biomeAt(x, z)))) return;
  if (typeof weatherAt === 'function' && weatherAt(x, z).speed < TUMBLE.calm) return;
  const gy = surfaceY(x, z), top = getBlock(x, gy, z);
  if (isWaterVal(top) || (top & 255) === B.LAVA || !CORE.solidVal(top)) return;
  if (typeof getSkyWorld === 'function' && getSkyWorld(x, gy + 1, z) < 14) return;   // only under the open sky
  const e = summon('tumbleweed', x + 0.5, gy + 1, z + 0.5);
  _useBox(e);
  const stuck = _entBlocked(e.x, e.y, e.z);
  _useBox(null);
  if (stuck) { const i = ENTITIES.indexOf(e); if (i >= 0) _removeEntity(i); }
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in TUMBLE. */
defineMob('tumbleweed', {
  name: 'Tumbleweed', group: 'thing', step: updateTumbleweed, unsaved: true, passive: true, xp: 0,
  hp: 1, box: [TUMBLE.r * 0.9, TUMBLE.r * 2], sized: false,
  make: makeTumbleweed, build: () => buildTumbleweed(),
  prompt: (e) => `${_esc(e.name)}<br><span style="opacity:.8;font-size:.9em">(hit it to see what it caught)</span>`,
  loot: (e, pop) => { const got = rollTumbleweed(); if (got) pop(got.id, got.n); },
});
