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
function chunkSkyArr(c) { return c.sky || (c.sky = newSharedArr(Uint8Array, CHUNK_X * CHUNK_Y * CHUNK_Z)); }   // shared when it can be (0.8386)
function getSkyWorld(x, y, z) {
  if (y > WORLD_TOP) return SKY_LEVEL;
  if (y < 0) return 0;
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!c || !c.sky) return 0;
  return c.sky[(x & 15) + ((z & 15) << 4) + (y << 8)];
}
// BFS-spread seeded sky light; touched collects chunks whose values changed (for re-meshing).
// The queue carries the level LEAVING each cell (0.819): a shaped cell keeps what reached it but passes on less (CORE.lightDim).
/* 0.8196: the chunk a neighbour falls in is looked up only when it CHANGES (it used to build a string key and hit the
   chunk map for all six neighbours of every cell), and a chunk goes into `touched` once per run of cells, not per
   cell. This flood is most of what a newly generated chunk costs, and it had grown to 40-60 ms over deep water. */
function propagateSky(q, touched) {
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
        cData = cc && cc.data ? cc.data : null;
      }
      if (!cData) continue;                            // never spread into unloaded space
      const i = (nx & 15) + ((nz & 15) << 4) + (ny << 8);
      const v = cData[i];
      if (CORE.opaqueVal(v)) continue;                 // a chiseled slab or stairs lets daylight past (0.783)
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
        else lv = Math.max(0, lv - CORE.lightDim(data[i]));   // a slab roof shades the column under it (0.819)
      }
    }
  const q = [];
  const wx0 = c.cx * 16, wz0 = c.cz * 16;
  // seed the "relief band" of each column: open cells below a taller neighbouring column
  // (border columns treat outside as max height so light always reaches across chunks)
  for (let lz = 0; lz < 16; lz++)
    for (let lx = 0; lx < 16; lx++) {
      const top = tops[lx + lz * 16];
      let hi = top;
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = lx + dx, nz = lz + dz;
        hi = Math.max(hi, (nx < 0 || nx > 15 || nz < 0 || nz > 15) ? WORLD_TOP : tops[nx + nz * 16]);
      }
      // seed with the STORED (water-attenuated) value, not raw 15 — otherwise border
      // columns re-flood deep water with full daylight and erase the depth darkness
      for (let y = top + 1, yMax = Math.min(WORLD_TOP, hi); y <= yMax; y++) {
        const ci = lx + (lz << 4) + (y << 8), v = sky[ci] - CORE.lightDim(data[ci]);
        if (v > 1) q.push(wx0 + lx, y, wz0 + lz, v);
      }
    }
  // pull lit neighbour borders in (their earlier BFS stopped at this then-unloaded chunk)
  for (const [dx, dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const n = getChunk(c.cx + dx, c.cz + dz);
    if (!n || !n.sky) continue;
    const side = dx === -1 ? 0 : dx === 1 ? 1 : dz === -1 ? 2 : 3;
    const plane = edgeSlice(n.sky, side, Uint8Array);
    for (let y = 0; y < CHUNK_Y; y++)
      for (let i = 0; i < 16; i++) {
        const v = plane[i + (y << 4)];
        if (v <= 1) continue;
        const wx = dx === -1 ? wx0 - 1 : dx === 1 ? wx0 + 16 : wx0 + i;
        const wz = dz === -1 ? wz0 - 1 : dz === 1 ? wz0 + 16 : wz0 + i;
        // the neighbour's own cell: what it holds back leaving it (0.819), read straight from its data
        const nlx = dx === -1 ? 15 : dx === 1 ? 0 : i, nlz = dz === -1 ? 15 : dz === 1 ? 0 : i;
        q.push(wx, y, wz, v - CORE.lightDim(n.data[nlx + (nlz << 4) + (y << 8)]));
      }
  }
  const touched = new Set();
  propagateSky(q, touched);
  touched.delete(key(c.cx, c.cz));            // self meshes later anyway
  for (const k of touched) { const t = chunks.get(k); if (t) markDirty(t); }
}
/* A new chunk the worker already lit inside (0.8383, MultithreadPlan.md B3; skyOf in WORKER_MAIN, 02): its own sky is
   that, raised wherever light the neighbours spread in earlier already reached further; then the light crossing its
   borders both ways — its edge cells spread out into the neighbours, theirs in — through the one flood. The flood only
   ever raises, so this ends where seedSkyForChunk would. */
function seedSkyFromWorker(c, sky) {
  if (c.sky) for (let i = 0; i < sky.length; i++) if (c.sky[i] > sky[i]) sky[i] = c.sky[i];
  c.sky = sky = shareArr(sky);              // into shared memory when it is on, for the mesh workers (0.8386)
  const data = c.data, q = [], wx0 = c.cx * 16, wz0 = c.cz * 16;
  for (let lz = 0; lz < 16; lz++)
    for (let lx = 0; lx < 16; lx++) {
      if (lx > 0 && lx < 15 && lz > 0 && lz < 15) continue;     // the edge columns only
      for (let y = 0; y <= WORLD_TOP; y++) {
        const ci = lx + (lz << 4) + (y << 8);
        if (sky[ci] <= 1) continue;
        const v = sky[ci] - CORE.lightDim(data[ci]);
        if (v > 1) q.push(wx0 + lx, y, wz0 + lz, v);
      }
    }
  // pull lit neighbour borders in (their earlier floods stopped at this then-unloaded chunk), as seedSkyForChunk does
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const n = getChunk(c.cx + dx, c.cz + dz);
    if (!n || !n.sky || !n.data) continue;
    const side = dx === -1 ? 0 : dx === 1 ? 1 : dz === -1 ? 2 : 3;
    const plane = edgeSlice(n.sky, side, Uint8Array);
    for (let y = 0; y < CHUNK_Y; y++)
      for (let i = 0; i < 16; i++) {
        const v = plane[i + (y << 4)];
        if (v <= 1) continue;
        const wx = dx === -1 ? wx0 - 1 : dx === 1 ? wx0 + 16 : wx0 + i;
        const wz = dz === -1 ? wz0 - 1 : dz === 1 ? wz0 + 16 : wz0 + i;
        const nlx = dx === -1 ? 15 : dx === 1 ? 0 : i, nlz = dz === -1 ? 15 : dz === 1 ? 0 : i;
        q.push(wx, y, wz, v - CORE.lightDim(n.data[nlx + (nlz << 4) + (y << 8)]));
      }
  }
  const touched = new Set();
  propagateSky(q, touched);
  touched.delete(key(c.cx, c.cz));
  for (const k of touched) { const t = chunks.get(k); if (t) markDirty(t); }
}
// after a block edit: rebuild sky in a box around the change (straight-down reseed per column,
// then BFS from in-box relief + light pulled through the box walls), re-mesh changed chunks.
// x2, z2 (0.8193): the far corner of a whole area of changes, so a batch of edits costs one rebuild, not one each
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

