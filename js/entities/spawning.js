'use strict';
/* entities/spawning.js: who lives where. A chunk rolls for its creatures once, the first time it is made; night mobs
   roll every time one arrives after dark. Villagers' torch lights are here too.
   Each kind's own rule (how often, how many, which biomes) is its `herd` or `roll` in the creature table
   (entities/mobs.js, written in the creature's own file); this file is the turn-taking and the shared helpers. */

/* ---- spawning ----
   Mobs are part of the TERRAIN, not a running population meter. A chunk rolls for its inhabitants
   exactly once, the first time it is ever generated, and that roll is recorded in `_entChunks`
   and saved with the world — so walking back into a chunk never re-populates it. Nothing spawns
   near the player on a timer any more, and nothing despawns for being far away: the mobs you
   left in a field are the mobs you find when you come back.

   The cost of a permanent population is paid by FREEZING it. An entity whose chunk is not loaded
   is skipped entirely by the update loop and its model is hidden — it holds its position and its
   state, and costs nothing per frame beyond the array slot. See updateEntities. */
const _entChunks = new Set();            // "cx,cz" of every chunk that has already rolled
const NPC_TORCH_CHANCE = 0.5;            // villagers who light a torch as night falls
const _npcTorchPos = new THREE.Vector3();
/* ...and the torch lights the world round its villager, as one in a player's hand does: a glow source that
   walks with it (updatePlayerLight, 08-light-glow.js), in the slots after the players' four. Every move relights a box
   round it, so only the NPC_LIGHT_MAX nearest torch-bearers within NPC_LIGHT_DIST of a player carry one, a light
   follows only once its villager is NPC_LIGHT_STEP blocks on, and at most one light changes a frame. */
const NPC_LIGHT_SLOT0 = 4, NPC_LIGHT_MAX = 4, NPC_LIGHT_DIST = 40, NPC_LIGHT_STEP = 2;
const NPC_TORCH_LIGHT = PROPS[B.TORCH].handLight || 8;   // as bright as a torch in a hand
const _npcLights = new Array(NPC_LIGHT_MAX).fill(null);  // slot k -> the villager whose torch it is
function updateNpcTorchLights() {
  const want = [];
  for (const e of ENTITIES) {
    if (e.kind !== 'npc' || !e.torchL || !(e.hp > 0) || e.active === false) continue;
    let d = Infinity;
    for (const p of PLAYERS) if (p.spawned) d = Math.min(d, Math.hypot(p.pos.x - e.x, p.pos.z - e.z));
    if (d <= NPC_LIGHT_DIST) want.push([d, e]);
  }
  want.sort((a, b) => a[0] - b[0]);
  const keep = new Set(want.slice(0, NPC_LIGHT_MAX).map(w => w[1]));
  // a torch put out, a villager gone, walked off or outdone by a nearer one: its light goes (one a frame)
  for (let k = 0; k < NPC_LIGHT_MAX; k++)
    if (_npcLights[k] && !keep.has(_npcLights[k])) {
      _npcLights[k] = null;
      updatePlayerLight(NPC_LIGHT_SLOT0 + k, 0, 0, 0, 0);
      return;
    }
  for (const e of keep)
    if (!_npcLights.includes(e)) { const k = _npcLights.indexOf(null); if (k < 0) break; _npcLights[k] = e; e._litAt = null; }
  // the one light furthest behind its villager moves up, if it is a step or more behind (a new one first)
  let best = -1, far = -1;
  for (let k = 0; k < NPC_LIGHT_MAX; k++) {
    const e = _npcLights[k];
    if (!e) continue;
    const L = e._litAt, d = L ? Math.max(Math.abs(L[0] - e.x), Math.abs(L[1] - e.y), Math.abs(L[2] - e.z)) : 1e9;
    if ((!L || d >= NPC_LIGHT_STEP) && d > far) { far = d; best = k; }
  }
  if (best < 0) return;
  const e = _npcLights[best], x = Math.floor(e.x), z = Math.floor(e.z);
  // the hand's cell, or the body's if the hand is in a block (a low roof): a light inside a block gives none
  let y = Math.floor(e.y + 1.2);
  if (CORE.opaqueVal(getBlock(x, y, z))) y = Math.floor(e.y + 0.5);
  e._litAt = [e.x, e.y, e.z];
  updatePlayerLight(NPC_LIGHT_SLOT0 + best, x, y, z, NPC_TORCH_LIGHT);
}

/* a legal surface spot inside this chunk, or null. Chunk-local — nothing to do with the player.
   `biomes`: a kind's weights, 0..1 by the FULL biome name (Warm / Cold kept; a Deep forest counts as its forest,
   _biomeWeight): how likely a roll that lands there is to stand. Not listed: never. `wet`: water within that many
   blocks (pigs). The leash (ENT_HOME_RANGE) keeps a creature roughly in that region afterwards. */
function _findChunkSpot(cx, cz, biomes, wet = 0) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = cx * 16 + Math.floor(Math.random() * 16) + 0.5;
    const z = cz * 16 + Math.floor(Math.random() * 16) + 0.5;
    if (biomes && Math.random() >= _biomeWeight(biomes, mainGen.biomeAt(Math.floor(x), Math.floor(z)))) continue;
    const gy = surfaceY(Math.floor(x), Math.floor(z));
    const top = getBlock(Math.floor(x), gy, Math.floor(z)) & 255;
    if (top === B.AIR || top === B.WATER || top === B.LAVA || top === B.CACTUS) continue;
    const y = gy + 1;
    if (_entBlocked(x, y, z) || _entHazard(x, y, z)) continue;
    if (!_entSpawnRoom(x, y, z)) continue;             // needs a 2x2x2 pocket, not just a body gap
    if (wet && !_waterNear(Math.floor(x), gy, Math.floor(z), wet)) continue;
    return { x, y, z, top };
  }
  return null;
}
// a biome's weight in a kind's list; a deep forest counts as its forest, but deep snow and deep oceans are their own
function _biomeWeight(biomes, name) {
  if (biomes[name] != null) return biomes[name];
  const base = /^Deep (Snow|.*Ocean)/.test(name) ? name : name.replace(/^Deep /, '');
  if (biomes[base] != null) return biomes[base];
  return biomes[base.replace(/^((?:Birch |Spruce )?Forest|Plains) Hills$/, '$1')] || 0;   // a forest's or the plains' hills
}
// open water at about the spot's height within r blocks (a pond, a lake, a river), sampled on a grid
function _waterNear(x, y, z, r) {
  for (let dz = -r; dz <= r; dz += 2)
    for (let dx = -r; dx <= r; dx += 2)
      for (let dy = -2; dy <= 1; dy++)
        if ((getBlock(x + dx, y + dy, z + dz) & 255) === B.WATER) return true;
  return false;
}
/* WHO ROLLS FOR A NEW CHUNK, AND IN WHAT ORDER. Every kind in the creature table (entities/mobs.js) that has a
   `herd` (the common rule, _rollHerd below) or a `roll` of its own takes one turn. The kinds named here go first,
   in this order; a kind added later rolls after them, in the order its file loads. The order is kept on purpose:
   a herd does not start near a herd of another kind, so whoever rolls first gets the field. */
const CHUNK_ROLL_FIRST = ['npc', 'hellhound', 'sheep', 'cow', 'pig', 'horse', 'fish', 'polar_bear'];
let _chunkRollDefs = null;               // the entries in rolling order, worked out at the first new chunk
function _chunkRolls() {
  if (!_chunkRollDefs)
    _chunkRollDefs = [...CHUNK_ROLL_FIRST, ...Object.keys(MOBS).filter(k => !CHUNK_ROLL_FIRST.includes(k))]
      .map(k => MOBS[k]).filter(d => d && (d.herd || d.roll));
  return _chunkRollDefs;
}
/* a world can be made without animals or without monsters (the create menu's checkboxes, saved as `animals` /
   `monsters`, missing = on): its chunks do not roll for those groups. Fish go with the animals; villagers always roll. */
const worldHasAnimals = () => !(typeof currentWorld !== 'undefined' && currentWorld && currentWorld.animals === false);
const worldHasMonsters = () => !(typeof currentWorld !== 'undefined' && currentWorld && currentWorld.monsters === false);
const _worldTakes = (def) => def.group === 'monster' ? worldHasMonsters()
                           : (def.group === 'animal' || def.group === 'fish') ? worldHasAnimals() : true;
/* Called once per chunk from chunks/chunks.js, right after its terrain and structures land. */
function trySpawnEntitiesInChunk(cx, cz) {
  if (menuScene || !currentWorld) return;
  const k = cx + ',' + cz;
  if (_entChunks.has(k)) return;
  _entChunks.add(k);
  for (const def of _chunkRolls()) {
    if (!_worldTakes(def)) continue;
    if (def.herd) _rollHerd(cx, cz, def); else def.roll(cx, cz);
  }
}
// a herd's and a school's chance is this much more than its entry says; the polar bear's and the hound's is not
const ANIMAL_SPAWN_MUL = 1.3;
/* the night's monsters, 30% more: the chunk roll, the cap on how many are about and how soon the next comes up, all by it */
const MONSTER_SPAWN_MUL = 1.3;

/* Herds of different animals keep apart: a new herd never starts within HERD_APART blocks of an animal of
   another kind, so a field holds sheep or cows or pigs rather than all of them in one heap. */
const HERD_APART = 40;
function _otherHerdNear(x, z, kind) {
  for (const e of ENTITIES)
    if (e.kind !== kind && isGrazer(e) && Math.abs(e.x - x) < HERD_APART && Math.abs(e.z - z) < HERD_APART
        && Math.hypot(e.x - x, e.z - z) < HERD_APART) return true;
  return false;
}
/* One grazer group, by its kind's `herd` in the creature table: { chance, min, max, biomes, wet }. They only
   appear on grass, and they arrive clustered on a single vetted spot rather than scattered across the chunk —
   which is what makes a field read as a field. */
function _rollHerd(cx, cz, def) {
  const h = def.herd;
  if (Math.random() >= h.chance * ANIMAL_SPAWN_MUL) return;
  const s = _findChunkSpot(cx, cz, h.biomes, h.wet || 0);
  if (!s || s.top !== B.GRASS || _otherHerdNear(s.x, s.z, def.kind)) return;
  const n = h.min + Math.floor(Math.random() * (h.max - h.min + 1));
  for (let i = 0; i < n; i++) {
    const sx = s.x + (Math.random() * 4 - 2), sz = s.z + (Math.random() * 4 - 2);
    // a scattered member that lands somewhere cramped falls back to the anchor spot, which
    // already passed the full room test
    if (_entBlocked(sx, s.y, sz) || _entHazard(sx, s.y, sz) || !_entSpawnRoom(sx, s.y, sz))
      { summon(def.kind, s.x, s.y, s.z); continue; }
    summon(def.kind, sx, s.y, sz);
  }
}
/* Night mobs, rolled on EVERY chunk-gen finish rather than once per chunk for ever: a chunk that
   was empty at noon is a candidate again after dusk. Called from finishChunkGen alongside the
   permanent population roll, so a freshly generated chunk and an old one being streamed back in
   are treated identically — which is exactly what "loading old ones" has to mean here, since a
   chunk you walk away from is regenerated from the seed when you return. And the land already loaded rolls too:
   all of it in the simulated range as night falls, then a few of its chunks now and then (updateNightMobs below).
   Never within ZOMBIE_SPAWN_MIN_DIST of a player; the cap on how many are about is what keeps a night from flooding. */
function trySpawnNightMobsInChunk(cx, cz) {
  if (menuScene || !currentWorld || !anyPlayerSpawned()) return;
  if (!worldHasMonsters()) return;                     // a world made without monsters
  if (!isNightForMobs()) return;
  /* The moon: a full moon brings half as many again, a new moon a quarter fewer — the chunk roll and
     the cap both scale with how much of it is lit. */
  const blood = typeof isBloodMoon === 'function' && isBloodMoon();   // a blood moon: twice again, twice as often
  const moonMul = (0.75 + 0.75 * (typeof moonLit === 'function' ? moonLit() : 0.5)) * (blood ? 2 : 1);
  const cap = Math.round(ZOMBIE_CAP * moonMul * MONSTER_SPAWN_MUL);
  if (Math.random() >= ZOMBIE_CHUNK_CHANCE * moonMul * MONSTER_SPAWN_MUL) return;
  let live = 0;
  // one population, two species: the cap, the cooldown and the chunk roll are shared, so adding
  // skeletons made the night more varied rather than twice as crowded
  for (const e of ENTITIES) if (isNightMob(e)) live++;
  if (live >= cap) return;
  const s = _findChunkSpot(cx, cz, null);              // any biome — night is night everywhere
  if (!s) return;
  // "in the player's face" means ANY player's face in split screen
  for (const p of PLAYERS) {
    const dx = s.x - p.pos.x, dz = s.z - p.pos.z;
    if (dx * dx + dz * dz < ZOMBIE_SPAWN_MIN_DIST * ZOMBIE_SPAWN_MIN_DIST) return;
  }
  if (!inSimRangeChunk(cx, cz)) return;               // out of the simulated land it would only stand there
  const n = Math.min(cap - live, _ri(ZOMBIE_PACK_MIN, ZOMBIE_PACK_MAX));
  for (let i = 0; i < n; i++) {
    const kind = Math.random() < SKEL_SPAWN_SHARE ? 'skeleton' : 'zombie';
    const ox = Math.random() * 3 - 1.5, oz = Math.random() * 3 - 1.5;
    const zx = s.x + ox, zz = s.z + oz;
    if (_entBlocked(zx, s.y, zz) || _entHazard(zx, s.y, zz) || !_entSpawnRoom(zx, s.y, zz))
      { summon(kind, s.x, s.y, s.z); continue; }       // fall back to the vetted anchor spot
    summon(kind, zx, s.y, zz);
  }
  if (n > 0 && typeof fxPuff === 'function') fxPuff(s.x, s.y + 0.8, s.z, [0.22, 0.2, 0.26], 14, 1.6);   // they rise out of a dark puff
}

/* The land already loaded at night (from the main loop, while the world runs): as night falls (or a world is joined
   at night) every loaded chunk in the simulated range rolls once, NIGHT_SWEEP_PER_FRAME a frame; after that
   NIGHT_TRICKLE_N of them every NIGHT_TRICKLE_S, so the night stays peopled where the player stays. */
const NIGHT_SWEEP_PER_FRAME = 4, NIGHT_TRICKLE_S = 8, NIGHT_TRICKLE_N = 3;
let _nightWas = false, _nightSweep = [], _nightTrickleT = 0;
function updateNightMobs(dt) {
  if (menuScene || !currentWorld || !anyPlayerSpawned() || !worldHasMonsters()) return;
  const night = isNightForMobs();
  if (night && !_nightWas) {
    _nightSweep = [];
    for (const c of chunks.values()) if (c.data && c.lit && inSimRangeChunk(c.cx, c.cz)) _nightSweep.push([c.cx, c.cz]);
    for (let i = _nightSweep.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [_nightSweep[i], _nightSweep[j]] = [_nightSweep[j], _nightSweep[i]]; }
  }
  _nightWas = night;
  if (!night) { _nightSweep.length = 0; return; }
  for (let k = 0; k < NIGHT_SWEEP_PER_FRAME && _nightSweep.length; k++) { const [cx, cz] = _nightSweep.pop(); trySpawnNightMobsInChunk(cx, cz); }
  _nightTrickleT -= dt;
  if (_nightTrickleT > 0 || _nightSweep.length) return;
  _nightTrickleT = NIGHT_TRICKLE_S;
  const near = [];
  for (const c of chunks.values()) if (c.data && c.lit && inSimRangeChunk(c.cx, c.cz)) near.push(c);
  for (let k = 0; k < NIGHT_TRICKLE_N && near.length; k++) {
    const c = near.splice((Math.random() * near.length) | 0, 1)[0];
    trySpawnNightMobsInChunk(c.cx, c.cz);
  }
}

function serializeEntChunks() { return [..._entChunks]; }
function restoreEntChunks(list) {
  _entChunks.clear();
  if (Array.isArray(list)) for (const k of list) if (typeof k === 'string') _entChunks.add(k);
}
