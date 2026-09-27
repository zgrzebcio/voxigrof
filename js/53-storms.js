'use strict';
/* voxiGrof — storms (0.819): lightning, fire, hail, and the aurora's switch.

   LIGHTNING  strikes land every LIGHTNING_MIN_S..MAX_S seconds of a full storm (less often at a storm's edge),
              within LIGHTNING_REACH of the player in the thick of it, on the highest thing in that column. Now
              and then one goes for a player or a creature standing out in the open. A direct hit does
              LIGHTNING_DMG, one close by LIGHTNING_NEAR_DMG, and both set it on fire. Each strike draws a bolt,
              lights up the sky for a moment (skyFlash, 07-sky.js), burns on the ground for a few seconds, and
              is heard: the crack close up, thunder further off, arriving later the further away it fell.
   FIRE       there is no fire block, so fire is flames on whatever burns: a player (19-vitals.js), a creature
              (below), the ground under a strike. Water puts it out. An animal that burns to death leaves its
              meat cooked and nothing else (_entBurnDeath, 28-entities.js); a woolly sheep burns twice as fast
              until its fleece has burnt off.
   HAIL       a third of storms (hailAt, 51-seasons.js): ice falls round each player, and someone out in the
              open without a helmet is hit for 1 health every few seconds.
   AURORA     clear nights over the big snow biomes, most nights but not all (the dome shader in 07-sky.js). */

const LIGHTNING_MIN_S = 4, LIGHTNING_MAX_S = 16;   // seconds between strikes in a full storm
const LIGHTNING_REACH = 96;                          // blocks from the player a strike may land
const LIGHTNING_AIM_PLAYER = 0.06, LIGHTNING_AIM_ENTITY = 0.12;   // shares of strikes that go for someone in the open
const LIGHTNING_HIT_R = 1.6, LIGHTNING_NEAR_R = 3.5;
const LIGHTNING_DMG = 10, LIGHTNING_NEAR_DMG = 4, LIGHTNING_FIRE_S = 6;   // 6 s alight since 0.8195 (5 before)
const ENT_FIRE_DPS = 1.5;                            // a creature on fire; a woolly sheep takes twice this
const SHEEP_WOOL_BURN_S = 1.5;                       // until its fleece is gone
const THUNDER_SPEED = 250;                           // blocks a second the thunder travels (a bit quicker than sound)
const HAIL_HIT_S = [2, 4.5];                         // seconds between hail hits on a bare head, at full hail

const _open = (x, y, z) => getSkyWorld(Math.floor(x), Math.floor(y), Math.floor(z)) >= 15;
const _stormAt = (x, z) => weatherAt(x, z).mix.storm || 0;

/* ---------------------------------- the bolt ---------------------------------- */
/* A jagged line from the cloud base to the strike, as two crossed ribbons so it reads from any side, with a
   branch or two. It flickers: on, off, on again, then gone. */
const BOLTS = [];
const _boltMat = new THREE.MeshBasicMaterial({ color: 0xe8eeff, transparent: true, opacity: 1, depthWrite: false,
                                               blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
// ...and a wide faint glow round it, so the bolt reads as a thick burning line from far off (0.8197)
const _boltGlowMat = new THREE.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.22, depthWrite: false,
                                                   blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
const BOLT_W = 0.34, BOLT_GLOW_W = 1.3, BOLT_BRANCH_W = 0.17;   // half widths, blocks (0.14 and 0.07 before 0.8197)
function _boltGeometry(pts, w) {
  const pos = [], idx = [];
  const ribbon = (ax, az) => {
    const base = pos.length / 3;
    for (const [x, y, z] of pts) pos.push(x - ax * w, y, z - az * w, x + ax * w, y, z + az * w);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  ribbon(1, 0); ribbon(0, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
function _boltPath(x0, y0, z0, x1, y1, z1, steps, jag) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps, j = i === 0 || i === steps ? 0 : jag;
    pts.push([x0 + (x1 - x0) * k + (Math.random() - 0.5) * j, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k + (Math.random() - 0.5) * j]);
  }
  return pts;
}
function _spawnBolt(x, y, z) {
  const top = Math.min(198, Math.max(y + 40, CLOUD_Y0));
  const main = _boltPath(x + (Math.random() - 0.5) * 8, top, z + (Math.random() - 0.5) * 8, x, y, z, 14, 2.6);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(_boltGeometry(main, BOLT_W), _boltMat));
  group.add(new THREE.Mesh(_boltGeometry(main, BOLT_GLOW_W), _boltGlowMat));
  for (let b = 0, n = 1 + (Math.random() < 0.6); b < n; b++) {        // a branch off the upper half
    const from = main[2 + ((Math.random() * 5) | 0)];
    const end = [from[0] + (Math.random() - 0.5) * 14, from[1] - 8 - Math.random() * 14, from[2] + (Math.random() - 0.5) * 14];
    const path = _boltPath(from[0], from[1], from[2], end[0], end[1], end[2], 6, 1.6);
    group.add(new THREE.Mesh(_boltGeometry(path, BOLT_BRANCH_W), _boltMat));
    group.add(new THREE.Mesh(_boltGeometry(path, BOLT_BRANCH_W * 3), _boltGlowMat));
  }
  group.traverse(o => { o.layers.set(1); o.frustumCulled = false; });   // with the sky: no shadows
  scene.add(group);
  BOLTS.push({ group, t: 0 });
}
function _updateBolts(dt) {
  for (let i = BOLTS.length - 1; i >= 0; i--) {
    const b = BOLTS[i];
    b.t += dt;
    b.group.visible = b.t < 0.08 || (b.t > 0.13 && b.t < 0.3);        // flash, dark, flash again
    if (b.t < 0.35) continue;
    scene.remove(b.group);
    b.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    BOLTS.splice(i, 1);
  }
  skyFlash = Math.max(0, skyFlash - dt * 3.2);
}

/* ---------------------------------- fire ---------------------------------- */
// flames licking up a body: called every frame it burns, throttled here
function fxOnFire(x, y, z, h, dt) {
  if (typeof _fxFlame !== 'function' || Math.random() > dt * 22) return;
  for (let k = 0; k < 2; k++)
    _fxFlame(x + (Math.random() - 0.5) * 0.7, y + Math.random() * h * 0.9, z + (Math.random() - 0.5) * 0.7, 0.5, 0.2);
  if (Math.random() < 0.3 && typeof _fxSmoke === 'function') _fxSmoke(x, y + h, z, 0.25, 1, 0.6);
}
// the ground where a strike landed burns a little while
const GROUND_FIRES = [];
function _updateGroundFires(dt) {
  for (let i = GROUND_FIRES.length - 1; i >= 0; i--) {
    const f = GROUND_FIRES[i];
    f.t -= dt;
    if (f.t <= 0) { GROUND_FIRES.splice(i, 1); continue; }
    fxOnFire(f.x, f.y, f.z, 0.6 * Math.min(1, f.t), dt);
  }
}
// creatures on fire: hurt, a sheep's fleece burns off, water puts it out, death by fire leaves cooked meat
function _updateEntityFire(dt) {
  if (typeof ENTITIES === 'undefined') return;
  for (let i = ENTITIES.length - 1; i >= 0; i--) {
    const e = ENTITIES[i];
    if (!(e.fireT > 0) || e.active === false) continue;
    const wet = (getBlock(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z)) & 255) === B.WATER;
    if (wet) { e.fireT = 0; e.burnT = 0; _fireSound('fireOff', e.x, e.y, e.z); continue; }
    e.fireT -= dt;
    e.burnT = e.fireT > 0 ? 0.2 : 0;                  // a burning villager or monster flickers orange (0.8191)
    let dps = ENT_FIRE_DPS;
    if (e.kind === 'sheep' && e.woolly) {
      dps *= 2;
      e._woolBurn = (e._woolBurn || 0) + dt;
      if (e._woolBurn >= SHEEP_WOOL_BURN_S) { e.woolly = false; e.woolGrow = 0; e.regrowing = false; e._woolBurn = 0; }
    }
    e.hp -= dps * dt;
    e.hurtT = Math.max(e.hurtT || 0, 0.05);
    if (typeof isGrazer === 'function' && isGrazer(e)) e.fleeT = Math.max(e.fleeT || 0, 1);   // it runs, burning
    fxOnFire(e.x, e.y, e.z, typeof entH === 'function' ? entH(e) : 1, dt);
    if (e.hp <= 0) _entBurnDeath(e);
  }
}

/* ---------------------------------- a strike ---------------------------------- */
// the highest thing in a column that lightning would hit (anything but air and small plants), or -1 if not loaded
function _strikeTop(x, z) {
  for (let y = 199; y > 0; y--) {
    const v = getBlock(x, y, z);
    if (!v || PROPS[v & 255]?.model === 'cross') continue;
    return y;
  }
  return -1;
}
const _thunders = [];                        // sounds on their way: { t: seconds left, d: distance }
function strikeLightning(x, y, z) {
  _spawnBolt(x, y, z);
  skyFlash = 1;
  GROUND_FIRES.push({ x, y, z, t: 3 });
  // what it struck catches, if it burns: a tree, leaves, grass (0.8191)
  { const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if (_BURN.has(getBlock(bx, by - 1, bz) & 255)) igniteAt(bx, by, bz); }
  // players: a direct hit or a near one, and on fire either way
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z), dy = p.pos.y - y;
    if (d > LIGHTNING_NEAR_R || dy < -2 || dy > 4) continue;
    p.hp -= d <= LIGHTNING_HIT_R ? LIGHTNING_DMG : LIGHTNING_NEAR_DMG;
    p._dmgCause = 'was struck by lightning';
    if (!(p.fireT > 0)) _fireSound('fireIgnite', p.pos.x, p.pos.y, p.pos.z);
    p.fireT = Math.max(p.fireT || 0, LIGHTNING_FIRE_S);
  }
  // creatures the same
  if (typeof ENTITIES !== 'undefined')
    for (const e of [...ENTITIES]) {
      if (e.active === false || !(e.hp > 0)) continue;
      const d = Math.hypot(e.x - x, e.z - z), dy = e.y - y;
      if (d > LIGHTNING_NEAR_R || dy < -2 || dy > 4) continue;
      e.hp -= d <= LIGHTNING_HIT_R ? LIGHTNING_DMG : LIGHTNING_NEAR_DMG;
      if (!(e.fireT > 0)) _fireSound('fireIgnite', e.x, e.y, e.z);
      e.fireT = Math.max(e.fireT || 0, LIGHTNING_FIRE_S);
      e.hurtT = 0.25;
      if (e.hp <= 0) _entBurnDeath(e);
    }
  // heard from the nearest player: the crack at once when close, the thunder after its trip
  let d = Infinity;
  for (const p of PLAYERS) if (p.spawned) d = Math.min(d, Math.hypot(p.pos.x - x, p.pos.y - y, p.pos.z - z));
  if (d < 40 && typeof playSound === 'function') playSound('lightningImpact', { gain: 1.4 * (1 - d / 60) });
  _thunders.push({ t: d / THUNDER_SPEED, d });
}
function _updateThunder(dt) {
  for (let i = _thunders.length - 1; i >= 0; i--) {
    const th = _thunders[i];
    th.t -= dt;
    if (th.t > 0) continue;
    _thunders.splice(i, 1);
    if (typeof playSound !== 'function') continue;
    const d = th.d;
    if (d < 60) playSound('thunder', { gain: 1.2 * (1 - d / 120) });
    else playSound(Math.random() < 0.5 ? 'thunderFar' : 'thunderLong', { gain: Math.max(0.15, 0.9 * (1 - d / 220)) });
  }
}
let _strikeT = 6;
function _updateLightning(dt, live) {
  // the player deepest in a storm draws the lightning
  let best = 0, bp = null;
  for (const p of live) { const s = _stormAt(p.pos.x, p.pos.z); if (s > best) { best = s; bp = p; } }
  if (best < 0.25) { _strikeT = Math.max(_strikeT, 3); return; }
  _strikeT -= dt * best;
  if (_strikeT > 0) return;
  _strikeT = LIGHTNING_MIN_S + Math.random() * (LIGHTNING_MAX_S - LIGHTNING_MIN_S);
  let tx = null, tz = null;
  const r = Math.random();
  if (r < LIGHTNING_AIM_PLAYER && !bp.canFly && _open(bp.pos.x, bp.pos.y + 1.8, bp.pos.z)) { tx = bp.pos.x; tz = bp.pos.z; }
  else if (r < LIGHTNING_AIM_PLAYER + LIGHTNING_AIM_ENTITY && typeof ENTITIES !== 'undefined') {
    const near = ENTITIES.filter(e => e.active !== false && Math.hypot(e.x - bp.pos.x, e.z - bp.pos.z) < 48 && _open(e.x, e.y + 1.5, e.z));
    if (near.length) { const e = near[(Math.random() * near.length) | 0]; tx = e.x; tz = e.z; }
  }
  if (tx == null) {
    const a = Math.random() * Math.PI * 2, rr = 12 + Math.random() * (LIGHTNING_REACH - 12);
    tx = bp.pos.x + Math.cos(a) * rr; tz = bp.pos.z + Math.sin(a) * rr;
  }
  if (_stormAt(tx, tz) < 0.2) return;                    // lightning only falls where the storm is
  const bx = Math.floor(tx), bz = Math.floor(tz), top = _strikeTop(bx, bz);
  if (top < 0) return;
  strikeLightning(tx, top + 1, tz);
}

/* ---------------------------------- hail ---------------------------------- */
function _updateHail(dt) {
  // per seat: the ice falls round whoever is in it, and hurts a bare head out in the open
  forEachPlayerSlot(() => {
    if (!player.spawned || player.dead) return;
    // none above the clouds it falls from (0.8197)
    const h = player.pos.y > CLOUD_Y0 + CLOUD_H ? 0 : hailAt(player.pos.x, player.pos.z);
    if (h < 0.3) { player._hailWarned = false; return; }
    const p = player.pos;
    // falling ice, thinned by the particle setting; bits land and lie a moment
    if (typeof _fxBit === 'function' && typeof _fxScale !== 'undefined' && _fxScale > 0) {
      let n = h * 70 * dt * _fxScale;
      while (n > 0) {
        if (n < 1 && Math.random() > n) break;
        n--;
        const x = p.x + (Math.random() - 0.5) * 22, z = p.z + (Math.random() - 0.5) * 22, y = p.y + 9 + Math.random() * 5;
        const i = _fxBit(B.SNOW, x, y, z, 1.4, 0.07, 1);
        if (i < 0) break;
        FX.bits.vy[i] = -16; FX.bits.grav[i] = 18; FX.bits.drag[i] = 0.05;
        FX.bits.flags[i] = FX_COLLIDE;
      }
    }
    if (player.canFly || !_open(p.x, p.y + 1.8, p.z)) return;
    player._hailT = (player._hailT ?? 1) - dt * h;
    if (player._hailT > 0) return;
    player._hailT = HAIL_HIT_S[0] + Math.random() * (HAIL_HIT_S[1] - HAIL_HIT_S[0]);
    const helm = typeof equipSlots !== 'undefined' && typeof EQUIP_INDEX !== 'undefined' ? equipSlots[EQUIP_INDEX.helmet] : null;
    if (helm) { if (typeof playSound === 'function') playSound('stone', { gain: 0.15, rate: 1.8 }); return; }
    player.hp = Math.max(0, player.hp - 1);
    player._dmgCause = 'was battered by hail';
    if (!player._hailWarned && typeof feedWarn === 'function') { player._hailWarned = true; feedWarn('Hail: get under cover or wear a helmet'); }
  });
}

/* ---------------------------------- the aurora ---------------------------------- */
// over the big snow biomes, on clear nights, three nights in four; eased in and out over a few seconds
let _auroraCur = 0;
function _updateAurora(dt) {
  const p = typeof PLAYERS !== 'undefined' && PLAYERS[0] ? PLAYERS[0] : player;
  let want = 0;
  if (p && p.pos && typeof skyDomeMat !== 'undefined') {
    const u = p.pos.x / REGION_BLOCKS - 0.5, v = p.pos.z / REGION_BLOCKS - 0.5;
    const i0 = Math.floor(u), j0 = Math.floor(v), fu = _smooth(u - i0), fv = _smooth(v - j0);
    let snow = 0;
    for (const [di, dj, w] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]])
      if (w > 0 && regionKind(i0 + di, j0 + dj) === 'snow') snow += w;
    const night = Math.floor(worldDay + worldTime + 0.25);          // one roll a night
    const clear = typeof cloudWxAt === 'function' ? 1 - cloudWxAt(p.pos.x, p.pos.z)[2] : 1;
    if (snow > 0 && sHash(night, 7, 0, 61) < 0.75) want = snow * (1 - _skyDayF) * Math.max(0, clear - 0.2) / 0.8;
  }
  _auroraCur += (want - _auroraCur) * Math.min(1, dt / 4);
  if (typeof skyDomeMat !== 'undefined') skyDomeMat.uniforms.uAurora.value = _auroraCur;
}

/* ---------------------------------- per frame ---------------------------------- */
function updateStorms(dt) {
  _updateBolts(dt);
  _updateThunder(dt);
  _updateGroundFires(dt);
  _updateAurora(dt);
  if (typeof menuScene !== 'undefined' && menuScene) return;
  _updateBloodMoon(dt);                      // 0.8192
  const live = PLAYERS.filter(p => p.spawned && !p.dead);
  if (!live.length) return;
  _updateEntityFire(dt);
  _updateFires(dt);                          // burning blocks (0.8191)
  _updateLightning(dt, live);
  _updateHail(dt);
}
function clearStorms() {
  for (const b of BOLTS) scene.remove(b.group);
  BOLTS.length = 0; GROUND_FIRES.length = 0; _thunders.length = 0; skyFlash = 0; _strikeT = 6;
  FIRE_CELLS.clear(); _fireWorld = null;
}

/* ================================== fire blocks (0.8191) ==================================
   A burning cell is a FIRE block (02-voxel-core.js): nothing is drawn — the flames are particles — but it lights
   its surroundings (light 13) and burns what touches it. Each cell burns through its fuel on its own clock: a log in
   about 9 s, leaves in 3.5, the grass under it in 2.5; wood leaves a little ash on the ground below (1-2 layers,
   60% of logs), grass turns to dirt with an ash carpet on it, leaves and plants just go. Fire passes on readily in
   a crown of leaves, less along wood and hardly at all through grass, and much less in the rain. Water puts it
   out. The blaze is capped (FIRE_MAX cells, FIRE_NEW_PER_TICK new ones a tick): each fire is a light source, and
   lighting is the costly part. Fires are not saved; any found in a loaded world burn out quickly. */
const FIRE_TICK = 0.25;
const FIRE_MAX = 48;
const FIRE_NEW_PER_TICK = 2;
const FIRE_LIFE_MAX = 24;                    // seconds any cell may burn, fuel or not
const FIRE_IDLE_S = 1.5;                     // how long a cell burns on with nothing left to burn
const FIRE_ASH_CHANCE = 0.6;                 // a log burnt away leaves ash below
const FIRE_PLANT_SPREAD = 0.06;              // a tick's chance to catch a plant beside a fire
// block id -> [seconds to burn away, chance a tick to pass the fire on]
const _BURN = new Map();
const _WOOD = new Set([B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.STRIPPED_LOG, B.STRIPPED_BIRCH_LOG, B.STRIPPED_SPRUCE_LOG,
                       B.HOLLOW_LOG, B.HOLLOW_BIRCH_LOG, B.HOLLOW_SPRUCE_LOG]);
for (const id of _WOOD) _BURN.set(id, [9, 0.25]);
for (const id of [B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]) _BURN.set(id, [3.5, 0.4]);
for (const id of [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS]) _BURN.set(id, [8, 0.15]);
for (const id of [B.HAY, B.WOOL, B.FIBER_BLOCK]) _BURN.set(id, [4, 0.3]);
_BURN.set(B.GRASS, [2.5, 0.04]);             // burns only from above: the blades go, the block turns to dirt
const FIRE_CELLS = new Map();                // "x,y,z" -> { x, y, z, age, idle, ash }
const _FIRE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const _isPlant = (v) => PROPS[v & 255]?.model === 'cross' && (v & 255) !== B.FIRE;
function _fireSound(key, x, y, z) {
  if (typeof playSound === 'function') playSound(key, { gain: key === 'fire' ? 0.5 : 0.8, pos: { x, y, z } });
}
// light a cell: an empty one, or one with a plant in it (burnt where it stands)
function igniteAt(x, y, z) {
  if (FIRE_CELLS.size >= FIRE_MAX) return false;
  const v = getBlock(x, y, z);
  if (v !== B.AIR && !_isPlant(v)) return false;
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!c || !c.data) return false;                           // never into a chunk that is not there
  setBlock(x, y, z, B.FIRE);
  FIRE_CELLS.set(x + ',' + y + ',' + z, { x, y, z, age: 0, idle: 0, ash: false });
  _fireSound('fireIgnite', x + 0.5, y + 0.5, z + 0.5);
  return true;
}
// ash from a log burnt away: it settles on whatever is below, 1 or 2 layers
function _dropAsh(x, y, z) {
  let ly = y;
  for (let d = 0; d < 30 && ly > 1; d++) {
    const b = getBlock(x, ly - 1, z), id = b & 255;
    if (!(id === B.AIR || id === B.FIRE || _isPlant(b) || (LEAF_BLOCKS.has(id) && !CORE.layerCount(b)))) break;
    ly--;
  }
  for (let n = 1 + (Math.random() < 0.5); n > 0; n--) if (!addLayer(x, ly, z, B.ASH)) break;
}
function _putOut(f, key, fizz) {
  FIRE_CELLS.delete(key);
  if ((getBlock(f.x, f.y, f.z) & 255) !== B.FIRE) return;
  const below = getBlock(f.x, f.y - 1, f.z);
  // burnt grass leaves a carpet of ash where the fire stood
  if (f.ash && CORE.solidVal(below)) setBlock(f.x, f.y, f.z, CORE.layerVal(B.ASH, 1));
  else setBlock(f.x, f.y, f.z, B.AIR);
  if (fizz) _fireSound('fireOff', f.x + 0.5, f.y + 0.5, f.z + 0.5);
}
let _fireTickT = 0, _fireSoundT = 0, _fireWorld = null;
function _updateFires(dt) {
  // a world just loaded: whatever fire its saved edits hold goes out soon (fires are not saved)
  if (typeof currentWorld !== 'undefined' && currentWorld !== _fireWorld) {
    _fireWorld = currentWorld;
    FIRE_CELLS.clear();
    if (typeof editStore !== 'undefined')
      for (const [ck, edits] of editStore) {
        const [cx, cz] = ck.split(',').map(Number);
        for (const [i, v] of edits) if ((v & 255) === B.FIRE)
          FIRE_CELLS.set((cx * 16 + (i & 15)) + ',' + (i >> 8) + ',' + (cz * 16 + ((i >> 4) & 15)),
                         { x: cx * 16 + (i & 15), y: i >> 8, z: cz * 16 + ((i >> 4) & 15), age: FIRE_LIFE_MAX - 1, idle: FIRE_IDLE_S, ash: false });
      }
  }
  if (!FIRE_CELLS.size) return;
  // flames every frame for the fires near someone; the crackle now and then from the nearest
  let near = null, nd = 20;
  for (const f of FIRE_CELLS.values()) {
    fxOnFire(f.x + 0.5, f.y, f.z + 0.5, 0.9, dt);
    for (const p of PLAYERS) if (p.spawned) {
      const d = Math.hypot(p.pos.x - f.x - 0.5, p.pos.y - f.y, p.pos.z - f.z - 0.5);
      if (d < nd) { nd = d; near = f; }
    }
  }
  if ((_fireSoundT -= dt) <= 0 && near) { _fireSoundT = 2.2; _fireSound('fire', near.x + 0.5, near.y + 0.5, near.z + 0.5); }
  if ((_fireTickT += dt) < FIRE_TICK) return;
  _fireTickT = 0;
  let born = 0;
  for (const [k, f] of [...FIRE_CELLS]) {
    if (typeof inSimRange === 'function' && !inSimRange(f.x, f.z)) continue;      // far fires wait
    if ((getBlock(f.x, f.y, f.z) & 255) !== B.FIRE) { FIRE_CELLS.delete(k); continue; }
    // water beside it puts it out
    if (_FIRE_DIRS.some(([dx, dy, dz]) => (getBlock(f.x + dx, f.y + dy, f.z + dz) & 255) === B.WATER)) { _putOut(f, k, true); continue; }
    f.age += FIRE_TICK;
    const w = weatherAt(f.x, f.z), wet = ((w.mix.rainy || 0) + (w.mix.storm || 0)) > 0.5 && getSkyWorld(f.x, f.y, f.z) >= 15;
    let fuel = 0;
    for (const [dx, dy, dz] of _FIRE_DIRS) {
      const nx = f.x + dx, ny = f.y + dy, nz = f.z + dz, v = getBlock(nx, ny, nz), id = v & 255;
      const b = _BURN.get(id);
      if (!b || (id === B.GRASS && dy !== -1)) continue;                          // grass burns from above only
      fuel++;
      // pass it on: into an open cell beside this fuel
      if (born < FIRE_NEW_PER_TICK && Math.random() < b[1] * (wet ? 0.4 : 1)) {
        const [ex, ey, ez] = _FIRE_DIRS[(Math.random() * 6) | 0];
        if (igniteAt(nx + ex, ny + ey, nz + ez)) born++;
      }
      // ...and burn it away once its time is up (a little different for every block)
      if (f.age < b[0] * (0.8 + 0.4 * sHash(nx, ny, nz, 71))) continue;
      if (id === B.GRASS) { setBlock(nx, ny, nz, B.DIRT); f.ash = true; continue; }
      setBlock(nx, ny, nz, B.AIR);
      if (_WOOD.has(id) && Math.random() < FIRE_ASH_CHANCE) _dropAsh(nx, ny, nz);
    }
    // a plant beside it catches now and then: grass fires creep, they do not race
    if (born < FIRE_NEW_PER_TICK) {
      const [dx, , dz] = _FIRE_DIRS[(Math.random() * 6) | 0];
      if (_isPlant(getBlock(f.x + dx, f.y, f.z + dz)) && Math.random() < FIRE_PLANT_SPREAD * (wet ? 0.4 : 1)
          && igniteAt(f.x + dx, f.y, f.z + dz)) born++;
    }
    f.idle = fuel ? 0 : f.idle + FIRE_TICK;
    if (f.idle >= FIRE_IDLE_S || f.age >= FIRE_LIFE_MAX || (wet && f.idle > 0.5)) _putOut(f, k, false);
  }
  // anyone standing in it catches fire
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly) continue;
    const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
    if ((getBlock(x, Math.floor(p.pos.y + 0.2), z) & 255) !== B.FIRE && (getBlock(x, Math.floor(p.pos.y + 1.2), z) & 255) !== B.FIRE) continue;
    if (!(p.fireT > 0)) _fireSound('fireIgnite', p.pos.x, p.pos.y, p.pos.z);
    p.fireT = Math.max(p.fireT || 0, 4);
  }
  if (typeof ENTITIES !== 'undefined')
    for (const e of ENTITIES) {
      if (e.active === false || e.fireT > 1) continue;
      if ((getBlock(Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z)) & 255) !== B.FIRE) continue;
      if (!(e.fireT > 0)) _fireSound('fireIgnite', e.x, e.y, e.z);
      e.fireT = 4;
    }
}

/* ================================== the blood moon (0.8192) ==================================
   A night event, like a weather of its own: the moon rises red and full, the night sky and its light turn red, and
   twice the monsters come out. One is due BLOOD_GAP days after the last — the first on day 7 to 20, never in the
   first 7 days — so two are always at least 15 days apart. When one is due it comes the first night that falls clear,
   sunny, cloudy or darky where player one stands (never in rain, a storm, fog or high wind): it can slip a night or
   two, but it always comes. Decided once a night, at dusk; the night of the last one is saved with the world. */
const BLOOD_FIRST = [7, 20], BLOOD_GAP = [15, 21];            // days
const BLOOD_WEATHER = new Set(['clear', 'sunny', 'cloudy', 'darky']);
let bloodMoonLast = -1, _bloodChecked = null;
function restoreBloodMoon(v) { bloodMoonLast = typeof v === 'number' ? v : -1; _bloodChecked = null; skyBlood = 0; }
// the night a moment belongs to: the day whose evening it began on (the day count turns over at 06:00)
const _nightIndex = () => (worldTime >= 0.25 ? worldDay : worldDay - 1);
function bloodMoonDue() {
  const r = (a, lo, hi) => lo + Math.floor(sHash(a, 2, 3, 81) * (hi - lo + 1));
  return bloodMoonLast < 0 ? r(-1, BLOOD_FIRST[0], BLOOD_FIRST[1]) : bloodMoonLast + r(bloodMoonLast, BLOOD_GAP[0], BLOOD_GAP[1]);
}
const isBloodMoon = () => bloodMoonLast >= 0 && _nightIndex() === bloodMoonLast && isDarkTime(worldTime, 0.02);
function _updateBloodMoon(dt) {
  const night = _nightIndex();
  if (isDarkTime(worldTime, 0.02) && _bloodChecked !== night) {
    _bloodChecked = night;
    const p = PLAYERS[0] || player, w = p && p.pos ? weatherAt(p.pos.x, p.pos.z) : null;
    if (night >= BLOOD_FIRST[0] && night !== bloodMoonLast && night >= bloodMoonDue() && w && BLOOD_WEATHER.has(w.type)) {
      bloodMoonLast = night;
      if (typeof feedWarn === 'function') feedWarn('A blood moon rises: the dead walk in numbers tonight');
      if (typeof playSound === 'function') playSound('thunderLong', { gain: 0.45, rate: 0.8 });
    }
  }
  // the sky turns over a few seconds (07-sky.js reads skyBlood)
  skyBlood += ((isBloodMoon() ? 1 : 0) - skyBlood) * Math.min(1, dt / 5);
}
