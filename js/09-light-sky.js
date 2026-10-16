'use strict';
/* voxiGrof — sky light: per-voxel daylight (cave darkness) */

/* ================================================================================================
   SKY LIGHT — per-voxel daylight so caves are genuinely dark. Every cell above a column's
   topmost opaque block is 15 ("open sky"); from there light BFS-spreads sideways/down with
   -1 falloff per step, crossing chunk borders. Stored per chunk in c.sky and packed into the
   HIGH nibble of the light byte at mesh time (glow keeps the low nibble).
   ================================================================================================ */
const SKY_LEVEL = 15;
/* Levels absorbed per water block. At the old 6 a column went black after two blocks, which
   crushed shallow shore water; the surface's own sense of depth now comes from the mesher
   darkening the top face by how much water is under it, so this only has to handle what's
   BELOW the surface and can be much gentler. */
const WATER_ABSORB = 2;   // 3 before 0.835481: a river or lake bed shows a few blocks deeper
function chunkSkyArr(c) { return c.sky || (c.sky = newSharedArr(Uint8Array, CHUNK_X * CHUNK_Y * CHUNK_Z)); }   // shared when it can be
function getSkyWorld(x, y, z) {
  if (y > WORLD_TOP) return SKY_LEVEL;
  if (y < 0) return 0;
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!c || !c.sky) return 0;
  return c.sky[(x & 15) + ((z & 15) << 4) + (y << 8)];
}
// BFS-spread seeded sky light; touched collects chunks whose values changed (for re-meshing).
// The queue carries the level LEAVING each cell: a shaped cell keeps what reached it but passes on less (CORE.lightDim).
/* the chunk a neighbour falls in is looked up only when it CHANGES (it used to build a string key and hit the
   chunk map for all six neighbours of every cell), and a chunk goes into `touched` once per run of cells, not per
   cell. This flood is most of what a newly generated chunk costs, and it had grown to 40-60 ms over deep water. */
/* WHICH CHUNKS TAKE THE FLOOD: one that has had its own lighting pass (`lit`, set by finishChunkGen), and `own`, the
   chunk having that pass now. A chunk that has its cells but still waits for its pass takes NOTHING: when its turn
   comes it has its own sky from the worker, pulls its lit neighbours' borders in and spreads its own out
   (_skyPullBorders, _skyCrosses), so the light arrives then all the same. Flooding it early did that work twice, and
   it was most of what a new chunk cost: some 140,000 cells poured into the open air of four waiting neighbours,
   35-70 ms a chunk on the main thread. That is also why a chunk is meshed only once its four neighbours are lit
   (neighborsReady, chunks/stream.js): until then a neighbour's border has no light to read. */
function propagateSky(q, touched, own) {
  let head = 0, ccx = 1e9, ccz = 1e9, cc = null, cData = null, lastT = null;
  while (head < q.length) {
    const x = q[head++], y = q[head++], z = q[head++], lv = q[head++];
    if (lv <= 1) continue;
    for (let k = 0; k < 6; k++) {
      const d = LIGHT_DIRS[k];
      const nx = x + d[0], ny = y + d[1], nz = z + d[2];
      if (ny < 0 || ny > WORLD_TOP) continue;
      const kx = nx >> 4, kz = nz >> 4;                // floor for whole numbers, negatives too
      if (kx !== ccx || kz !== ccz) {
        ccx = kx; ccz = kz;
        cc = getChunk(kx, kz);
        cData = cc && cc.data && (cc.lit || cc === own) ? cc.data : null;
      }
      if (!cData) continue;                            // never spread into unloaded space, or a chunk not lit yet
      const i = (nx & 15) + ((nz & 15) << 4) + (ny << 8);
      const v = cData[i];
      if (CORE.opaqueVal(v)) continue;                 // a chiseled slab or stairs lets daylight past
      // water absorbs during sideways spread too, matching the vertical step
      const nl = lv - ((v & 255) === B.WATER ? WATER_ABSORB : 1);
      if (nl <= 0) continue;
      const sky = cc.sky || chunkSkyArr(cc);           // made on the first light it takes, as before
      if (sky[i] >= nl) continue;
      sky[i] = nl;
      if (touched && cc !== lastT) { lastT = cc; touched.add(key(cc.cx, cc.cz)); }
      q.push(nx, ny, nz, nl - CORE.lightDim(v));
    }
  }
}
/* LIGHT ACROSS A NEW CHUNK'S BORDERS, both ways, as seeds for the flood. Only the cells that can change something
   are seeded: one level is the least a step costs, so a cell already within one level of the light beside it cannot
   be raised by it. Over open ground both sides of a border are full daylight and nothing is seeded at all; every
   border cell used to be (some 20,000 a chunk in a world 250 tall), each one six looks at its neighbours for nothing. */
// the sky arrays of c's four neighbours that are lit, [west, east, north, south]; null where there is none yet
function _skyLitSides(c) {
  const side = (dx, dz) => { const n = getChunk(c.cx + dx, c.cz + dz); return n && n.data && n.lit && n.sky ? n.sky : null; };
  return [side(-1, 0), side(1, 0), side(0, -1), side(0, 1)];
}
// can light leaving c's border cell (lx, y, lz) at level v raise the cell beside it in a lit neighbour?
function _skyCrosses(sides, lx, lz, y, v) {
  const yo = y << 8, need = v - 1;
  return (lx === 0 && sides[0] !== null && sides[0][15 + (lz << 4) + yo] < need) ||
         (lx === 15 && sides[1] !== null && sides[1][(lz << 4) + yo] < need) ||
         (lz === 0 && sides[2] !== null && sides[2][lx + 240 + yo] < need) ||
         (lz === 15 && sides[3] !== null && sides[3][lx + yo] < need);
}
// the other way: the lit neighbours' border cells whose light can raise c's cell beside them (their own floods
// stopped at this chunk while it was not there, or not lit)
function _skyPullBorders(c, q) {
  const sky = c.sky;
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const n = getChunk(c.cx + dx, c.cz + dz);
    if (!n || !n.data || !n.lit || !n.sky) continue;
    const nSky = n.sky, nData = n.data, nwx0 = n.cx * 16, nwz0 = n.cz * 16;
    for (let i = 0; i < 16; i++) {
      // the neighbour's border column and c's column beside it
      const nlx = dx === -1 ? 15 : dx === 1 ? 0 : i, nlz = dz === -1 ? 15 : dz === 1 ? 0 : i;
      const nCol = nlx + (nlz << 4), cCol = (dx === -1 ? 0 : dx === 1 ? 15 : i) + ((dz === -1 ? 0 : dz === 1 ? 15 : i) << 4);
      for (let y = 0; y < CHUNK_Y; y++) {
        const yo = y << 8, s = nSky[nCol + yo];
        if (s <= 1) continue;
        const v = s - CORE.lightDim(nData[nCol + yo]);
        if (v > 1 && sky[cCol + yo] < v - 1) q.push(nwx0 + nlx, y, nwz0 + nlz, v);
      }
    }
  }
}
// column scan: first opaque block from the top (matches worker data layout)
function skyColumnTop(data, lx, lz) {
  const li = lx + (lz << 4);
  for (let y = WORLD_TOP; y >= 0; y--) if (CORE.opaqueVal(data[li + (y << 8)])) return y;
  return -1;
}
// freshly generated chunk: seed open-sky columns, then spread into relief/caves and pull
// light in across borders from already-lit neighbours
function seedSkyForChunk(c) {
  const sky = chunkSkyArr(c);
  const data = c.data;
  const tops = new Int16Array(256);
  for (let lz = 0; lz < 16; lz++)
    for (let lx = 0; lx < 16; lx++) {
      const top = skyColumnTop(data, lx, lz);
      tops[lx + lz * 16] = top;
      const li = lx + (lz << 4);
      // descend from open sky; each water block absorbs WATER_ABSORB levels, so deep water
      // columns go dark and the seabed under them is barely lit (surface stays bright)
      let lv = SKY_LEVEL;
      for (let y = WORLD_TOP; y >= top + 1; y--) {
        const i = li + (y << 8);
        sky[i] = lv;
        if ((data[i] & 255) === B.WATER) lv = Math.max(0, lv - WATER_ABSORB);
        else lv = Math.max(0, lv - CORE.lightDim(data[i]));   // a slab roof shades the column under it
      }
    }
  const q = [];
  const wx0 = c.cx * 16, wz0 = c.cz * 16;
  // seed the "relief band" of each column: open cells below a taller column beside it in this chunk; and of a
  // border column, the cells above that band whose light can cross into a lit neighbour (_skyCrosses)
  const sides = _skyLitSides(c);
  for (let lz = 0; lz < 16; lz++)
    for (let lx = 0; lx < 16; lx++) {
      const top = tops[lx + lz * 16], border = lx === 0 || lx === 15 || lz === 0 || lz === 15;
      let hi = top;
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = lx + dx, nz = lz + dz;
        if (nx >= 0 && nx <= 15 && nz >= 0 && nz <= 15) hi = Math.max(hi, tops[nx + nz * 16]);
      }
      // seed with the STORED (water-attenuated) value, not raw 15 — otherwise border
      // columns re-flood deep water with full daylight and erase the depth darkness
      for (let y = top + 1, yMax = border ? WORLD_TOP : Math.min(WORLD_TOP, hi); y <= yMax; y++) {
        const ci = lx + (lz << 4) + (y << 8), v = sky[ci] - CORE.lightDim(data[ci]);
        if (v > 1 && (y <= hi || _skyCrosses(sides, lx, lz, y, v))) q.push(wx0 + lx, y, wz0 + lz, v);
      }
    }
  _skyPullBorders(c, q);
  const touched = new Set();
  propagateSky(q, touched, c);
  touched.delete(key(c.cx, c.cz));            // self meshes later anyway
  for (const k of touched) { const t = chunks.get(k); if (t) markDirty(t); }
}
/* A new chunk the worker already lit inside (skyOf in WORKER_MAIN, chunks/worker.js): its own sky is
   that, raised wherever light the neighbours spread in earlier already reached further; then the light crossing its
   borders both ways — its edge cells spread out into the neighbours, theirs in — through the one flood. The flood only
   ever raises, so this ends where seedSkyForChunk would. */
function seedSkyFromWorker(c, sky) {
  // a sky it already has: an edit beside it rewrote some of its columns while it waited (reskyAround). Then every
  // border cell is seeded, as light raised that way may still have to spread inside the chunk too
  let raised = false;
  if (c.sky) for (let i = 0; i < sky.length; i++) if (c.sky[i] > sky[i]) { sky[i] = c.sky[i]; raised = true; }
  c.sky = sky = shareArr(sky);              // into shared memory when it is on, for the mesh workers
  const data = c.data, q = [], wx0 = c.cx * 16, wz0 = c.cz * 16;
  const sides = _skyLitSides(c);
  for (let lz = 0; lz < 16; lz++)
    for (let lx = 0; lx < 16; lx++) {
      if (lx > 0 && lx < 15 && lz > 0 && lz < 15) continue;     // the edge columns only
      for (let y = 0; y <= WORLD_TOP; y++) {
        const ci = lx + (lz << 4) + (y << 8);
        if (sky[ci] <= 1) continue;
        const v = sky[ci] - CORE.lightDim(data[ci]);
        if (v > 1 && (raised || _skyCrosses(sides, lx, lz, y, v))) q.push(wx0 + lx, y, wz0 + lz, v);
      }
    }
  _skyPullBorders(c, q);                    // and the lit neighbours' borders in, as seedSkyForChunk does
  const touched = new Set();
  propagateSky(q, touched, c);
  touched.delete(key(c.cx, c.cz));
  for (const k of touched) { const t = chunks.get(k); if (t) markDirty(t); }
}
// after a block edit: rebuild sky in a box around the change (straight-down reseed per column,
// then BFS from in-box relief + light pulled through the box walls), re-mesh changed chunks.
// x2, z2: the far corner of a whole area of changes, so a batch of edits costs one rebuild, not one each
function reskyAround(x, y, z, x2 = x, z2 = z) {
  const R = SKY_LEVEL;
  const x0 = Math.min(x, x2) - R, x1 = Math.max(x, x2) + R, z0 = Math.min(z, z2) - R, z1 = Math.max(z, z2) + R;
  const W = x1 - x0 + 1, D = z1 - z0 + 1;
  const tops = new Int16Array(W * D).fill(-2);          // -2 = column not loaded
  const touched = new Set();
  for (let zz = z0; zz <= z1; zz++)
    for (let xx = x0; xx <= x1; xx++) {
      const c = getChunk(Math.floor(xx / 16), Math.floor(zz / 16));
      if (!c || !c.data) continue;
      const lx = xx & 15, lz = zz & 15, li = lx + (lz << 4);
      const top = skyColumnTop(c.data, lx, lz);
      tops[(xx - x0) + (zz - z0) * W] = top;
      const sky = chunkSkyArr(c);
      let changed = false;
      // same water attenuation as seedSkyForChunk
      let lv = SKY_LEVEL;
      for (let yy = WORLD_TOP; yy >= 0; yy--) {
        const i = li + (yy << 8);
        let v = 0;
        if (yy > top) { v = lv; lv = Math.max(0, lv - ((c.data[i] & 255) === B.WATER ? WATER_ABSORB : CORE.lightDim(c.data[i]))); }
        if (sky[i] !== v) { sky[i] = v; changed = true; }
      }
      if (changed) touched.add(key(c.cx, c.cz));
    }
  const q = [];
  for (let zz = z0; zz <= z1; zz++)
    for (let xx = x0; xx <= x1; xx++) {
      const top = tops[(xx - x0) + (zz - z0) * W];
      if (top === -2) continue;
      // relief band inside the box; box-edge columns also pull outside light through the wall
      let hi = top;
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = xx + dx, nz = zz + dz;
        const nt = (nx < x0 || nx > x1 || nz < z0 || nz > z1)
          ? -1 : tops[(nx - x0) + (nz - z0) * W];
        hi = Math.max(hi, nt === -2 ? -1 : nt);
      }
      for (let yy = top + 1, yMax = Math.min(WORLD_TOP, hi); yy <= yMax; yy++) {
        const v = getSkyWorld(xx, yy, zz) - CORE.lightDim(getBlock(xx, yy, zz));   // stored, water-attenuated value, less what it holds back
        if (v > 1) q.push(xx, yy, zz, v);
      }
      const onWall = xx === x0 || xx === x1 || zz === z0 || zz === z1;
      if (onWall)
        for (let yy = 0; yy <= Math.min(WORLD_TOP, top === -1 ? WORLD_TOP : top + 1); yy++) {
          const ox = xx === x0 ? xx - 1 : xx === x1 ? xx + 1 : xx;
          const oz = zz === z0 ? zz - 1 : zz === z1 ? zz + 1 : zz;
          const v = getSkyWorld(ox, yy, oz) - CORE.lightDim(getBlock(ox, yy, oz));
          if (v > 1) q.push(ox, yy, oz, v);
        }
    }
  propagateSky(q, touched);
  for (const k of touched) { const t = chunks.get(k); if (t) markDirty(t); }
}

