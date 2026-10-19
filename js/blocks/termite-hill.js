'use strict';
/* blocks/termite-hill.js: the Savanna's termite hills on the page. Their models, the hills known in the loaded land,
   breaking one, and the termites each keeps.

   THE BLOCK is B.TERMITE_HILL (blocks/torch-blocks.js: its variant says which cell of which hill), made by the world
   (biomes/gen-savanna.js). The mesher draws nothing of it: here each hill is one copy of its model, small or big
   (textures/Blocks/Models/termite_hill/*.json, read by entities/box-models.js), drawn as instances of one mesh per
   kind, lit by the light over it.

   FINDING THEM. The worker lists a hill's cells with the light sources (`pageModel`), so finishChunkGen
   (chunks/stream.js) hands its foot cell to termiteHillSeen as the chunk comes in; setBlock's hook
   (chunks/block-access.js) calls termiteHillChanged when a cell of one is broken or put down. A hill whose chunk is
   let go is forgotten, its termites with it, and found again when the chunk comes back.

   ITS TERMITES (entities/termite.js) are never saved: a hill in the simulated land keeps HILL_KEEP of them (small 2,
   big 4), a new one out of it every HILL_SPAWN_S while it has fewer. Broken, it lets out 1-3 (small) or 3-6 (big)
   at once, angry, and its own go angry too: a hit termite angers its hill (`angryT`), and its soldiers come for
   the player. What a broken hill gives is its block drop (50-loottable.js), once for the whole hill. */
const HILL_MODELS = {
  small: { json: 'textures/Blocks/Models/termite_hill/termite_hill_small.json', png: 'textures/Blocks/Models/termite_hill/termite_hill_small.png', top: 1 },
  big:   { json: 'textures/Blocks/Models/termite_hill/termite_hill.json',       png: 'textures/Blocks/Models/termite_hill/termite_hill.png',       top: 3 },
};
const HILL_KEEP = { small: 2, big: 4 };        // termites a hill keeps about it
const HILL_BURST = { small: [1, 3], big: [3, 6] };   // how many come out when it is broken
const HILL_SPAWN_S = [25, 45];                 // seconds between new termites while a hill has fewer than it keeps
const HILL_SOLDIERS = 0.3;                     // the share of soldiers among them
const HILL_ANGRY_S = 25;                       // how long a hill stays angry after one of its own was hit
const HILL_PASS_S = 0.5;                       // how often the hills are looked over (chunks gone, termites, which are drawn)
const HILLS = new Map();                       // "x,y,z" of a hill's foot cell -> { x, y, z, kind, spawnT, angryT }
const _hillKey = (x, y, z) => x + ',' + y + ',' + z;
// [dx, dy, dz] of a big hill's cell from its foot cell, by its variant (1..12); a small one's is 0
const _hillCellOf = (va) => { const k = va - 1; return [k & 1, k >> 2, (k >> 1) & 1]; };

/* ---- drawing: one instanced mesh per kind ---- */
const _hillDraw = {};                          // kind -> { mesh, cap }
let _hillDirty = true, _hillPassT = 0, _hillLightT = 0;
for (const k of Object.keys(HILL_MODELS)) boxModel(HILL_MODELS[k].json, HILL_MODELS[k].png);   // fetched from the start
const _hillMat4 = new THREE.Matrix4(), _hillCol = new THREE.Color();
function _hillMesh(kind, need) {
  const m = boxModel(HILL_MODELS[kind].json, HILL_MODELS[kind].png);
  if (!m.ready) return null;
  let d = _hillDraw[kind];
  if (d && d.cap >= need) return d;
  const cap = Math.max(16, need * 2);
  const geo = d ? d.mesh.geometry : boxModelGeometry(m, m.json.elements || []);
  if (d) { scene.remove(d.mesh); d.mesh.material.dispose(); d.mesh.dispose(); }   // the geometry is kept: it moves over
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: m.tex, alphaTest: 0.5 }), cap);
  mesh.frustumCulled = false;                  // its instances are all over the land
  mesh.count = 0;
  scene.add(mesh);
  return (_hillDraw[kind] = { mesh, cap });
}
// which hills are drawn (the ones within the full-detail radius, as creatures), and where
function _hillRebuild() {
  _hillDirty = false;
  const lists = { small: [], big: [] };
  for (const h of HILLS.values()) {
    const cx = Math.floor(h.x / 16), cz = Math.floor(h.z / 16);
    if (chunkDist2ToPlayers(cx, cz) <= viewDist * viewDist) lists[h.kind].push(h);
  }
  for (const kind of Object.keys(lists)) {
    const list = lists[kind], d = _hillMesh(kind, list.length);
    if (!d) { if (list.length) _hillDirty = true; continue; }   // its model is not in yet: again next pass
    for (let i = 0; i < list.length; i++) {
      d.mesh.setMatrixAt(i, _hillMat4.makeTranslation(list[i].x, list[i].y, list[i].z));
      list[i].inst = i;
    }
    d.mesh.count = list.length;
    d.mesh.instanceMatrix.needsUpdate = true;
    d.list = list;
  }
  _hillLightT = 0;
}
// each drawn hill lit by the light just over it, as a creature is (_lightAt, entities/rig.js)
function _hillRelight() {
  for (const d of Object.values(_hillDraw)) {
    if (!d.list || !d.list.length) continue;
    for (const h of d.list) {
      const b = _lightAt(h.x + 0.5, h.y + HILL_MODELS[h.kind].top + 0.2, h.z + 0.5);
      d.mesh.setColorAt(h.inst, _hillCol.setScalar(b));
    }
    if (d.mesh.instanceColor) d.mesh.instanceColor.needsUpdate = true;
  }
}

/* ---- the hills known ---- */
// a hill's cell met in a chunk coming in (finishChunkGen): its foot cell makes it known
function termiteHillSeen(x, y, z, v) {
  const va = (v >> 8) & 255;
  if (va > 1) return;                          // a big hill's other cells
  const k = _hillKey(x, y, z);
  if (HILLS.has(k)) return;
  HILLS.set(k, { x, y, z, kind: va === 1 ? 'big' : 'small', spawnT: 2 + Math.random() * 6, angryT: 0 });
  _hillDirty = true;
}
let _hillBreaking = false;                     // breaking a big hill's other cells: their own hook calls keep quiet
// setBlock's hook: a hill's cell broken (the whole hill goes) or one put down
function termiteHillChanged(x, y, z, oldVal, val) {
  if (_hillBreaking) return;
  const wasHill = (oldVal & 255) === B.TERMITE_HILL, isHill = (val & 255) === B.TERMITE_HILL;
  if (isHill && !wasHill) { termiteHillSeen(x, y, z, val); return; }
  if (!wasHill || isHill) return;
  const va = (oldVal >> 8) & 255, big = va >= 1;
  const [dx, dy, dz] = big ? _hillCellOf(va) : [0, 0, 0];
  const fx = x - dx, fy = y - dy, fz = z - dz, k = _hillKey(fx, fy, fz);
  if (big) {
    _hillBreaking = true;
    try {
      for (let cy = 0; cy < 3; cy++) for (let cz = 0; cz < 2; cz++) for (let cx = 0; cx < 2; cx++) {
        const wx = fx + cx, wy = fy + cy, wz = fz + cz;
        if (wx === x && wy === y && wz === z) continue;
        const v = getBlock(wx, wy, wz);
        if ((v & 255) === B.TERMITE_HILL && ((v >> 8) & 255) === 1 + cx + cz * 2 + cy * 4) setBlock(wx, wy, wz, B.AIR);
      }
    } finally { _hillBreaking = false; }
  }
  if (typeof fxBreak === 'function') fxBreak(fx, fy, fz, B.TERMITE_HILL);
  HILLS.delete(k);
  _hillDirty = true;
  // its own termites lose their home and turn on whoever is near; more pour out of it
  for (const e of ENTITIES) if (e.hillKey === k) { e.hillKey = null; e.angryT = HILL_ANGRY_S; }
  if (typeof worldHasAnimals === 'function' && !worldHasAnimals()) return;
  const [lo, hi] = HILL_BURST[big ? 'big' : 'small'], n = lo + Math.floor(Math.random() * (hi - lo + 1));
  for (let i = 0; i < n; i++) {
    const p = _hillExit(fx, fy, fz, big);
    if (!p) break;
    const t = summon(Math.random() < 0.5 ? 'termite_soldier' : 'termite_worker', p[0], p[1], p[2], { hx: p[0], hz: p[2] });
    t.angryT = HILL_ANGRY_S;
  }
}
/* A hill stands only on full blocks (solid and opaque: no slab, glass, plant or layer). The block under one of its
   foot cells changed (setBlock's hook, chunks/block-access.js) to something else: the hill breaks as if mined there,
   its drops falling, its termites out. */
const termiteHillFloor = (v) => CORE.solidVal(v) && CORE.opaqueVal(v);
function termiteHillUnder(x, y, z, val) {
  if (_hillBreaking || termiteHillFloor(val)) return;
  const above = getBlock(x, y + 1, z);
  if ((above & 255) !== B.TERMITE_HILL) return;
  const va = (above >> 8) & 255;
  if (va >= 1 && _hillCellOf(va)[1] !== 0) return;            // not a foot cell: it stands on its own hill
  if (!player.canFly) for (const d of blockDrop(B.TERMITE_HILL)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, x, y + 1, z);
  setBlock(x, y + 1, z, B.AIR);                                // the hook takes the rest of it
}
// a free place on the ground beside a hill (a tunnel's mouth), or null; the foot cell's floor is the hill's
function _hillExit(fx, fy, fz, big) {
  const w = big ? 2 : 1, ring = [];
  for (let dz = -1; dz <= w; dz++) for (let dx = -1; dx <= w; dx++)
    if (dx < 0 || dz < 0 || dx >= w || dz >= w) ring.push([fx + dx, fz + dz]);
  for (let tries = 0; tries < ring.length; tries++) {
    const [x, z] = ring[Math.floor(Math.random() * ring.length)];
    for (const y of [fy, fy + 1, fy - 1]) {
      const here = getBlock(x, y, z), under = getBlock(x, y - 1, z);
      if (!CORE.solidVal(here) && CORE.solidVal(under) && (here & 255) !== B.WATER && (here & 255) !== B.LAVA) return [x + 0.5, y, z + 0.5];
    }
  }
  return null;
}
function clearTermiteHills() {
  HILLS.clear();
  for (const d of Object.values(_hillDraw)) { d.mesh.count = 0; d.list = []; }
  _hillDirty = true;
}
// the hill a termite belongs to, or null (broken, or its chunk let go)
const termiteHillOf = (e) => (e.hillKey ? HILLS.get(e.hillKey) || null : null);

/* ---- once a frame: keep the hills, their termites and their drawing up to date ---- */
function updateTermiteHills(dt) {
  if (menuScene) return;
  _hillPassT -= dt;
  if (_hillPassT <= 0) {
    _hillPassT = HILL_PASS_S;
    // forget the hills whose chunk is gone; count each one's termites
    const count = new Map();
    for (let i = ENTITIES.length - 1; i >= 0; i--) {
      const e = ENTITIES[i];
      if (!e.termite) continue;
      if (e.hillKey && !HILLS.has(e.hillKey)) { _removeEntity(i); continue; }   // its hill's land was let go
      if (!e.hillKey && e.active === false) { _removeEntity(i); continue; }      // a homeless one out of the simulated land
      if (e.hillKey) count.set(e.hillKey, (count.get(e.hillKey) || 0) + 1);
    }
    for (const [k, h] of HILLS) {
      const c = getChunk(Math.floor(h.x / 16), Math.floor(h.z / 16));
      if (!c || !c.data || (getBlock(h.x, h.y, h.z) & 255) !== B.TERMITE_HILL) { HILLS.delete(k); _hillDirty = true; continue; }
      h._n = count.get(k) || 0;
    }
    _hillDirty = true;                         // and which are drawn, the players having moved
  }
  if (_hillDirty) _hillRebuild();
  // new termites, only while the world runs and the land near is in
  if (!worldHeld() && !streamBehind && worldHasAnimals()) {
    for (const [k, h] of HILLS) {
      if (h.angryT > 0) h.angryT -= dt;
      if (h._n == null || h._n >= HILL_KEEP[h.kind]) continue;
      if (!inSimRangeChunk(Math.floor(h.x / 16), Math.floor(h.z / 16))) continue;
      h.spawnT -= dt;
      if (h.spawnT > 0) continue;
      h.spawnT = HILL_SPAWN_S[0] + Math.random() * (HILL_SPAWN_S[1] - HILL_SPAWN_S[0]);
      const p = _hillExit(h.x, h.y, h.z, h.kind === 'big');
      if (!p) continue;
      const cx = h.x + (h.kind === 'big' ? 1 : 0.5), cz = h.z + (h.kind === 'big' ? 1 : 0.5);
      summon(Math.random() < HILL_SOLDIERS ? 'termite_soldier' : 'termite_worker', p[0], p[1], p[2], { hill: k, hx: cx, hz: cz });
      h._n++;
    }
  }
  _hillLightT -= dt;
  if (_hillLightT <= 0) { _hillLightT = 0.25; _hillRelight(); }
}
