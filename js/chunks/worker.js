'use strict';
/* chunks/worker.js: WORKER_MAIN, what a worker runs. It answers jobs: gen (a chunk's blocks, with its sky light and
   light sources), prep, scan (season passes), mesh, probe; and it is the light thread and the fluid thread when asked.
   Not a core part: one function, turned into text beside the cores (10-workers.js). A new job type goes in JOBS here. */

/* ---------- worker entry point (stringified into the blob together with VOXEL_CORE) ---------- */
function WORKER_MAIN() {
  let gen = null;
  /* The cells that may give light: a block with light of its own, light by its variant,
     or the furnace. Found here as a chunk is made, so the main thread's finish pass (finishChunkGen, chunks/stream.js) checks only
     these instead of walking all of the chunk's cells. Same test as EMITTER_ID (08). */
  const EMIT = new Uint8Array(256);
  for (let id = 0; id < 256; id++) { const p = CORE.PROPS[id]; if (p && (p.light > 0 || p.lightByVar)) EMIT[id] = 1; }
  EMIT[CORE.B.FURNACE] = 1;
  const emittersOf = (d) => {
    let n = 0;
    for (let i = 0; i < d.length; i++) if (EMIT[d[i] & 255]) n++;
    const out = new Int32Array(n);
    for (let i = 0, k = 0; i < d.length; i++) if (EMIT[d[i] & 255]) out[k++] = i;
    return out;
  };
  /* A new chunk's own sky light: the same rules as seedSkyForChunk and propagateSky
     (09-light-sky.js) — open sky straight down each column, water taking `water` a block, a shaped block its lightDim,
     then spread sideways and down from the relief between columns — but only inside the chunk. The main thread adds
     what comes across its borders (seedSkyFromWorker). `L` = { top, sky, water } from init (WORLD_TOP, SKY_LEVEL,
     WATER_ABSORB), so the two sides never disagree. */
  let L = null;
  const skyOf = (d) => {
    const top = L.top, WAT = CORE.B.WATER, sky = new Uint8Array(d.length), tops = new Int16Array(256);
    for (let col = 0; col < 256; col++) {
      let t = -1;
      for (let y = top; y >= 0; y--) if (CORE.opaqueVal(d[col + (y << 8)])) { t = y; break; }
      tops[col] = t;
      let lv = L.sky;
      for (let y = top; y >= t + 1; y--) {
        const i = col + (y << 8);
        sky[i] = lv;
        lv = (d[i] & 255) === WAT ? Math.max(0, lv - L.water) : Math.max(0, lv - CORE.lightDim(d[i]));
      }
    }
    const q = [];
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        const t = tops[lx + lz * 16];
        let hi = t;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = lx + dx, nz = lz + dz;
          if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16) hi = Math.max(hi, tops[nx + nz * 16]);
        }
        for (let y = t + 1, yMax = Math.min(top, hi); y <= yMax; y++) {
          const ci = lx + (lz << 4) + (y << 8), v = sky[ci] - CORE.lightDim(d[ci]);
          if (v > 1) q.push(lx, y, lz, v);
        }
      }
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let h = 0; h < q.length;) {
      const x = q[h++], y = q[h++], z = q[h++], lv = q[h++];
      if (lv <= 1) continue;
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || ny < 0 || ny > top) continue;
        const i = nx + (nz << 4) + (ny << 8), v = d[i];
        if (CORE.opaqueVal(v)) continue;
        const nl = lv - ((v & 255) === WAT ? L.water : 1);
        if (nl <= 0 || sky[i] >= nl) continue;
        sky[i] = nl;
        q.push(nx, ny, nz, nl - CORE.lightDim(v));
      }
    }
    return sky;
  };
  /* ---- a mesh job's light ----
     The main thread used to pack every cell's light into the mesher's 16 bits before posting. Now the job brings the
     raw arrays (its own, and either the four neighbours' whole arrays in shared memory or their border planes) and this
     packs them: block light (0..31, capped 15) low nibble with its cold bit moved to 8, sky light the high nibble; a
     chunk with no sky array yet reads as open sky, one with no block light as dark. `PK` from init (LIGHT_LEVEL_MASK,
     LIGHT_COLD_BIT, SKY_LEVEL), so the two sides never disagree. */
  let PK = { mask: 31, cold: 0x80, sky: 15 };
  const edgeOf = (d, side, Ctor) => {        // a neighbour's plane against this chunk, as edgeSlice (chunks/stream.js) cuts it
    const cy = d.length >> 8, s = new Ctor(16 * cy);
    for (let y = 0; y < cy; y++) {
      const yo = y << 8, so = y << 4;
      for (let i = 0; i < 16; i++) {
        if (side === 0) s[i + so] = d[15 + (i << 4) + yo];        // west: its x = 15
        else if (side === 1) s[i + so] = d[(i << 4) + yo];        // east: x = 0
        else if (side === 2) s[i + so] = d[i + (15 << 4) + yo];   // north: z = 15
        else s[i + so] = d[i + yo];                               // south: z = 0
      }
    }
    return s;
  };
  const packLight = (glow, sky, n) => {
    const out = new Uint16Array(n), M = PK.mask, C = PK.cold, S = PK.sky << 4;
    for (let i = 0; i < n; i++) {
      const g = glow ? glow[i] : 0;
      out[i] = (g ? Math.min(15, g & M) | ((g & C) << 1) : 0) | (sky ? sky[i] << 4 : S);
    }
    return out;
  };
  const meshJob = (m) => {
    const S = m.self, N = m.nb, n = S.data.length;
    // shared: a still copy of the cells (the main thread may edit on while this meshes); else the copy that came
    const data = m.shared ? S.data.slice() : S.data;
    const light = packLight(S.light, S.sky, n);
    const sx = [], lx = [];
    for (let k = 0; k < 4; k++) {
      const nb = N[k];
      if (m.shared) {
        sx[k] = edgeOf(nb.data, k, Uint32Array);
        lx[k] = packLight(nb.light ? edgeOf(nb.light, k, Uint8Array) : null, nb.sky ? edgeOf(nb.sky, k, Uint8Array) : null, sx[k].length);
      } else {
        sx[k] = nb.data;
        lx[k] = packLight(nb.light, nb.sky, nb.data.length);
      }
    }
    return CORE.meshChunk(data.buffer, sx[0].buffer, sx[1].buffer, sx[2].buffer, sx[3].buffer,
                          light.buffer, lx[0].buffer, lx[1].buffer, lx[2].buffer, lx[3].buffer, m.layers, m.lod | 0,
                          m.cx * 16, m.cz * 16);   // lod 0.8092; world origin for per-place sizes
  };

  /* ---- the light thread (LIGHT_THREAD with shared memory) ----
     One worker of the pool's kind is started as the light thread (08 lightThreadStart). The main thread registers each
     loaded chunk's cells (`lreg`, shared) and forgets it on unload; the floods it used to run itself come here as jobs,
     in order: `lbox` clears a box and floods its sources into it (an edit, a held light moving), `ladd` only floods
     (a chunk arriving near lights). Same rules as propagateLightMany (08): bucketed by level, brightest first, a cell lit
     only at its highest level, opaque cells stop it, shaped cells pass on less (lightDim), the cold bit rides along.
     A box is worked out in a scratch array and written back at the end, so a mesh read meanwhile never sees it cleared.
     A chunk with no block light array gets one here (in shared memory) the first time light is written into it; it goes
     back with the answer, which also lists the chunks whose light changed. */
  const LREG = new Map();                    // "cx,cz" -> { data, light, lid }
  let LTOP = 249;
  const LDX = [1, -1, 0, 0, 0, 0], LDY = [0, 0, 1, -1, 0, 0], LDZ = [0, 0, 0, 0, 1, -1];
  const lightFlood = (srcs, box, scratch, made, touched) => {
    const M = PK.mask, Bk = [];
    let top = 0;
    for (const s of srcs) {
      const lv = s[3] + 1;
      (Bk[lv] || (Bk[lv] = [])).push(s[0], s[1], s[2], s[4] || 0);
      if (lv > top) top = lv;
    }
    const W = box ? box.x1 - box.x0 + 1 : 0, WD = box ? W * (box.z1 - box.z0 + 1) : 0;
    let ccx = 1e9, ccz = 1e9, ent = null;
    for (let lv = top; lv >= 2; lv--) {
      const q = Bk[lv];
      if (!q) continue;
      const nl = lv - 1;
      for (let h = 0; h < q.length; h += 4) {
        const x = q[h], y = q[h + 1], z = q[h + 2], cb = q[h + 3];
        for (let d = 0; d < 6; d++) {
          const nx = x + LDX[d], ny = y + LDY[d], nz = z + LDZ[d];
          if (ny < 0 || ny > LTOP) continue;
          const kx = Math.floor(nx / 16), kz = Math.floor(nz / 16);
          if (kx !== ccx || kz !== ccz) { ccx = kx; ccz = kz; ent = LREG.get(kx + ',' + kz) || null; }
          if (!ent) continue;                // not loaded: lit when it arrives
          const i = (nx & 15) + ((nz & 15) << 4) + (ny << 8), v = ent.data[i];
          if (CORE.opaqueVal(v)) continue;
          const inBox = box && nx >= box.x0 && nx <= box.x1 && ny >= box.y0 && ny <= box.y1 && nz >= box.z0 && nz <= box.z1;
          const si = inBox ? (nx - box.x0) + (nz - box.z0) * W + (ny - box.y0) * WD : -1;
          const cur = inBox ? scratch[si] : ent.light ? ent.light[i] : 0;
          if ((cur & M) >= nl) continue;
          if (inBox) scratch[si] = nl | cb;
          else {
            if (!ent.light) { ent.light = new Uint8Array(new SharedArrayBuffer(ent.data.length)); made.push(ent); }
            ent.light[i] = nl | cb;
            touched.add(ccx + ',' + ccz);
          }
          const out = nl - CORE.lightDim(v);
          if (out >= 2) (Bk[out] || (Bk[out] = [])).push(nx, ny, nz, cb);
        }
      }
      Bk[lv] = null;
    }
  };
  // a worked-out box back into the chunks' light (only chunks that have light, or now get some)
  const lightBoxBack = (box, scratch, made, touched) => {
    const W = box.x1 - box.x0 + 1, WD = W * (box.z1 - box.z0 + 1);
    for (let cz = Math.floor(box.z0 / 16); cz <= Math.floor(box.z1 / 16); cz++)
      for (let cx = Math.floor(box.x0 / 16); cx <= Math.floor(box.x1 / 16); cx++) {
        const ent = LREG.get(cx + ',' + cz);
        if (!ent) continue;
        const lx0 = Math.max(0, box.x0 - cx * 16), lx1 = Math.min(15, box.x1 - cx * 16);
        const lz0 = Math.max(0, box.z0 - cz * 16), lz1 = Math.min(15, box.z1 - cz * 16);
        const len = lx1 - lx0 + 1, sx0 = cx * 16 + lx0 - box.x0;
        if (!ent.light) {                    // dark before: only worth an array if light lands in it now
          let any = false;
          for (let y = box.y0; y <= box.y1 && !any; y++)
            for (let lz = lz0; lz <= lz1 && !any; lz++) {
              const si = sx0 + (cz * 16 + lz - box.z0) * W + (y - box.y0) * WD;
              for (let k = 0; k < len; k++) if (scratch[si + k]) { any = true; break; }
            }
          if (!any) continue;
          ent.light = new Uint8Array(new SharedArrayBuffer(ent.data.length));
          made.push(ent);
        }
        const L = ent.light;
        for (let y = box.y0; y <= box.y1; y++)
          for (let lz = lz0; lz <= lz1; lz++) {
            const si = sx0 + (cz * 16 + lz - box.z0) * W + (y - box.y0) * WD;
            L.set(scratch.subarray(si, si + len), lx0 + (lz << 4) + (y << 8));
          }
        touched.add(cx + ',' + cz);
      }
  };
  const lightJob = (m) => {
    const made = [], touched = new Set();
    if (m.type === 'lbox') {
      const b = m.box, scratch = new Uint8Array((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1));
      lightFlood(m.srcs, b, scratch, made, touched);
      lightBoxBack(b, scratch, made, touched);
    } else lightFlood(m.srcs, null, null, made, touched);
    self.postMessage({ type: 'lit', id: m.id, touched: [...touched],
                       made: made.map((e) => ({ key: e.key, lid: e.lid, light: e.light })) });
  };

  /* ---- the fluid thread (with shared memory; fluids/fluids.js starts it) ----
     The main thread registers each chunk as it is finished (`freg`, its cells in shared memory, looked over for loose
     fluid) and forgets it on unload; every sim tick with nothing of the last answer left to write it sends `fstep`: the
     time, the tick speed, where the players are and the game's touches since. The answer is the changes to write. The
     simulation never writes the world: what it reads is always what the main thread has written. */
  const FREG = new Map();                    // flChunkKey -> the chunk's cells
  let fsim = null, fcx = 1e9, fcz = 1e9, fent = null;
  const fget = (x, y, z) => {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    if (cx !== fcx || cz !== fcz) { fcx = cx; fcz = cz; fent = FREG.get(CORE.flChunkKey(cx, cz)) || null; }
    return fent ? fent[(x & 15) + ((z & 15) << 4) + (y << 8)] : -1;
  };
  const fluidMsg = (m) => {
    if (m.type === 'freset') { FREG.clear(); fcx = 1e9; fsim = CORE.makeFluidSim(fget); return; }
    if (!fsim) fsim = CORE.makeFluidSim(fget);
    if (m.type === 'freg') {
      FREG.set(CORE.flChunkKey(m.cx, m.cz), m.data); fcx = 1e9;
      fsim.scanChunk(m.cx, m.cz);
    } else if (m.type === 'fforget') {
      // the chunks let go at one crossing come as one list [cx, cz, cx, cz...] (fluidForgetMany); one as cx, cz
      const list = m.list || [m.cx, m.cz];
      for (let i = 0; i + 1 < list.length; i += 2) { FREG.delete(CORE.flChunkKey(list[i], list[i + 1])); fsim.forget(list[i], list[i + 1]); }
      fcx = 1e9;
    } else if (m.type === 'fstep') {
      const P = m.players, r2 = m.r2;
      const inRange = (cx, cz) => { for (let i = 0; i < P.length; i += 2) { const dx = cx - P[i], dz = cz - P[i + 1]; if (dx * dx + dz * dz <= r2) return true; } return false; };
      const r = fsim.step(m.now, m.speed, inRange, m.touch);
      const s = fsim.stats();
      self.postMessage({ type: 'fdone', gen: m.gen, changes: r.changes, cells: r.cells, ms: r.ms, queued: s.queued, parked: s.parked }, [r.changes.buffer]);
    }
  };

  // a made (or cached) chunk back to the main thread with its light emitters and, with the light settings, its own sky
  const sendChunk = (cx, cz, buf, fromSave) => {
    const d = new Uint32Array(buf), emit = emittersOf(d), sky = L ? skyOf(d) : null;
    const msg = { type: 'gen', cx, cz, data: buf, emit: emit.buffer, _fromSave: !!fromSave }, tr = [buf, emit.buffer];
    if (sky) { msg.sky = sky.buffer; tr.push(sky.buffer); }
    self.postMessage(msg, tr);
  };
  /* A PLAYER'S EDIT JUMPS THE QUEUE. A worker took its messages strictly in order, so the re-mesh of a chunk
     you had just dug into waited behind every generation job already handed over — several of them when the frame
     rate is low and the queues are kept deep — and for that long the hole or the new block was not drawn. Jobs (gen,
     prep, scan, mesh, probe) are now kept in a list here and run one at a time with the event loop let through in
     between, so a mesh job marked `rush` that arrives while another job runs is taken next, ahead of the rest. It
     never passes a message that is not a job (init, opts...): those keep their place in line. A worker that gets no
     jobs (the light thread, the fluid thread) answers every message at once, as before.
     LAND FIRST. After a player's edit, the order is: a mesh (a chunk that is made and only waits to be seen), then
     a chunk to make (gen, prep), and last the jobs that can wait: a season's scan, a castle site's probe. Within
     each kind, first come first served (the page sends them nearest first). */
  const JOBS = { gen: 1, prep: 1, scan: 1, mesh: 1, probe: 1 };
  const jobQ = [];
  let jobKick = null, jobBusy = false;
  const jobNext = () => {
    let rush = -1, mesh = -1, make = -1;
    for (let i = 0; i < jobQ.length && JOBS[jobQ[i].type]; i++) {
      const t = jobQ[i].type;
      if (t === 'mesh') { if (jobQ[i].rush) { rush = i; break; } if (mesh < 0) mesh = i; }
      else if (make < 0 && (t === 'gen' || t === 'prep')) make = i;
    }
    const at = rush >= 0 ? rush : mesh >= 0 ? mesh : make >= 0 ? make : 0;
    handle(jobQ.splice(at, 1)[0]);
    if (jobQ.length) jobKick(); else jobBusy = false;
  };
  if (typeof MessageChannel === 'function') {
    const ch = new MessageChannel();
    ch.port1.onmessage = jobNext;
    jobKick = () => ch.port2.postMessage(0);
  } else jobKick = () => setTimeout(jobNext, 0);
  self.onmessage = (e) => {
    const m = e.data;
    if (!jobQ.length && !JOBS[m.type]) { handle(m); return; }
    jobQ.push(m);
    if (!jobBusy) { jobBusy = true; jobKick(); }
  };
  const handle = (m) => {
    try {
      if (m.type === 'init') {
        gen = CORE.makeGen(m.seed, m.terrainType, m.biomeRev | 0 || 1, m.cols || null);   // biome sizes by world; the shared column cache
        CORE.setTintSampler(gen.climAt, gen.dryAt);                        // the grass and water climate colour, the Dryland's dry grass
        L = m.light || null;                                               // 0.8383
        if (m.pack) PK = m.pack;                                           // how light packs for the mesher
      } else if (m.type === 'opts') {
        CORE.setFastLeaves(!!m.fastLeaves);                                // Options > Video
      } else if (m.type === 'lreg') {                                      // the light thread
        const k = m.cx + ',' + m.cz;
        LREG.set(k, { key: k, lid: m.lid, data: m.data, light: m.light || null });
      } else if (m.type === 'lforget') {
        const list = m.list || [m.cx, m.cz];                             // many at once from lightForgetMany
        for (let i = 0; i + 1 < list.length; i += 2) LREG.delete(list[i] + ',' + list[i + 1]);
      } else if (m.type === 'lreset') {
        LREG.clear();
        if (m.top) LTOP = m.top;
        if (m.pack) PK = m.pack;
      } else if (m.type === 'lbox' || m.type === 'ladd') {
        lightJob(m);
      } else if (m.type === 'freset' || m.type === 'freg' || m.type === 'fforget' || m.type === 'fstep') {
        fluidMsg(m);                                                       // the fluid thread
      } else if (m.type === 'probe') {
        // a few places' biome and ground (the snow castle's sites, entities/frozen-king.js): milliseconds each, so not on the game's thread
        const names = [], heights = [];
        for (const [x, z] of m.pts) { names.push(gen.biomeAt(x, z)); heights.push(gen.heightAt(x, z)); }
        self.postMessage({ type: 'probe', id: m.id, names, heights });
      } else if (m.type === 'gen') {
        sendChunk(m.cx, m.cz, gen.genChunk(m.cx, m.cz), false);
      } else if (m.type === 'prep') {
        sendChunk(m.cx, m.cz, m.data, true);                               // a chunk from the terrain cache
      } else if (m.type === 'scan') {
        // a chunk's season pass: the cells whose id is wanted, as indices
        const d = new Uint32Array(m.data), want = m.want;
        let n = 0;
        for (let i = 0; i < d.length; i++) if (want[d[i] & 255]) n++;
        const out = new Int32Array(n);
        for (let i = 0, k = 0; i < d.length; i++) if (want[d[i] & 255]) out[k++] = i;
        self.postMessage({ type: 'scan', cx: m.cx, cz: m.cz, cand: out.buffer }, [out.buffer]);
      } else if (m.type === 'mesh') {
        const r = meshJob(m);                                              // packs its own light
        const transfers = [];
        for (const p of r.passes) if (p) { transfers.push(p.pos.buffer, p.uv.buffer, p.tile.buffer, p.shade.buffer, p.lite.buffer, p.clim.buffer, p.index.buffer); if (p.dark) transfers.push(p.dark.buffer); }
        self.postMessage({ type: 'mesh', cx: m.cx, cz: m.cz, rev: m.rev, passes: r.passes, minY: r.minY, maxY: r.maxY }, transfers);
      }
    } catch (err) {
      // which job failed, so the page can give back what that job held (onWorkerMessage, chunks/stream.js)
      self.postMessage({ type: 'error', message: String(err && err.stack || err), job: m && m.type, cx: m && m.cx, cz: m && m.cz });
    }
  };
}
