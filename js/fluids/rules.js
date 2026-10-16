'use strict';
/* fluids/rules.js: the rules every fluid flows by, as ONE simulation: makeFluidSim(get). It only reads cells and
   returns the changes to make; fluids/fluids.js runs it (in a thread of its own with shared memory) and writes them.
   WHICH fluids there are, and each one's numbers, is the fluids table (FLUID, fluids/kinds.js, filled by water.js
   and lava.js): nothing here names a fluid.
   A part of VOXEL_CORE (chunks/voxel-core.js), glued in after the table and its entries. */

corePart('voxel', function () {
  /* ================================================================================================
     FLUIDS flowing, a cell at a time on a schedule. One simulation, run in the fluid thread
     (WORKER_MAIN below, reading the chunks' cells in shared memory) or, without shared memory, on the main thread
     (fluids/fluids.js). It only READS the world through `get` (-1: a chunk not loaded, taken as rock) and hands back what it
     would change, [x, y, z, was, now] each, which the main thread writes through setBlock while the cell is still `was`.
     A fluid cell's variant: bits 0-2 its level (0 a source, full; 1-7 flowing, thinner each), 3-6 the way it runs (1-8,
     an eighth turn each from +x, what the flow art follows: emitWater), 7 a river's fast stretch.
       - A source never moves and never dries. Flowing fluid is FED: by its own kind above it (it is falling), or by a
         neighbour beside it that stands on a floor and spreads no thinner than it; unfed it dries, and that runs on.
       - It falls first: into air or a plant (washed away), or onto flowing fluid of its kind, which falls too. Falling
         fluid is never a source; it spreads again from where it lands, at its fluid's `step` (water 1, lava 2).
       - With a floor under it, it spreads beside it a `step` thinner, as far as its `max`; where some of
         those cells have a drop under them, only into those.
       - Two fluids meet as their entries' `meets` say (water and lava: flowing water turns to stone; a lava source to
         obsidian; flowing lava turns water to cobble).
     Finite: nothing ever makes a new source. */
  const FL_SLOT = 0.05;                                       // the schedule's grain: one sim tick (s)
  const FL_OFF = 2097152, FL_SPAN = 4194304;                  // a cell's key: x and z in -2^21 .. 2^21, y 0..255
  const flKey = (x, y, z) => ((x + FL_OFF) * FL_SPAN + (z + FL_OFF)) * 256 + y;
  const flChunkKey = (cx, cz) => (cx + 131072) * 262144 + (cz + 131072);
  const FL_DX = [1, -1, 0, 0], FL_DZ = [0, 0, 1, -1], FL_FD = [1, 5, 3, 7];   // +x -x +z -z, and each one's way (fd)
  const FL_NX = [1, -1, 0, 0, 0, 0], FL_NY = [0, 0, 1, -1, 0, 0], FL_NZ = [0, 0, 0, 0, 1, -1];
  function makeFluidSim(get) {
    const due = new Map();                  // cell key -> the slot it is due in (the earliest asked)
    const slots = new Map();                // slot -> cell keys
    const parked = new Map();               // chunk key -> cell keys waiting outside the sim range
    let parkedN = 0, nowSlot = 0, factor = 1, steps = 0;
    const ov = new Map(), was = new Map();  // this step's writes, and what those cells held before it
    const rd = (x, y, z) => {
      if (y < 0) return -1;                 // under the world: rock
      if (y > CY - 1) return 0;
      if (ov.size) { const v = ov.get(flKey(x, y, z)); if (v !== undefined) return v; }
      return get(x, y, z);
    };
    const wr = (x, y, z, v) => { const k = flKey(x, y, z); if (!was.has(k)) was.set(k, get(x, y, z)); ov.set(k, v); };
    const lvl = (v) => (v >> 8) & 7;
    const isF = (v, f) => v >= 0 && (v & 255) === f;
    const isFluid = (v) => v >= 0 && FLUID_IS[v & 255] === 1;       // any fluid in the table
    // does fluid f do something where it touches what is in cell value v (its entry's `meets` names that fluid)
    const meetsV = (f, v) => v >= 0 && FLUID[f].meets !== undefined && FLUID[f].meets[v & 255] !== undefined;
    // room for a fluid: air, or a plant it washes away
    const open = (v) => v >= 0 && ((v & 255) === B.AIR || (!!PROPS[v & 255] && PROPS[v & 255].model === 'cross'));
    // can fluid f at (x, y, z) go down: air or a plant under it, or its own kind flowing
    const canDrop = (x, y, z, f) => { if (y <= 0) return false; const b = rd(x, y - 1, z); return open(b) || (isF(b, f) && lvl(b) > 0); };
    // the level f at (x, y, z) spreads beside it at, or 99 where it does not (no floor, or as thin as it goes)
    const outLevel = (x, y, z, v, f) => {
      if (canDrop(x, y, z, f)) return 99;
      const n = (isF(rd(x, y + 1, z), f) ? 0 : lvl(v)) + FLUID[f].step;
      return n <= FLUID[f].max ? n : 99;
    };
    const slotIn = (delay) => nowSlot + Math.max(1, Math.round(delay / factor / FL_SLOT));
    function queueKey(k, s) {
      const d = due.get(k);
      if (d !== undefined && d <= s) return;
      due.set(k, s);
      let a = slots.get(s);
      if (!a) slots.set(s, a = []);
      a.push(k);
    }
    // a cell, when it holds a fluid, due in `delay` s (its own step when not given)
    function queue(x, y, z, delay) {
      const v = rd(x, y, z);
      if (!isFluid(v)) return;
      queueKey(flKey(x, y, z), slotIn(delay == null ? FLUID[v & 255].delay : delay));
    }
    // the fluid cells round one, at their step or (dry) at their drying pace
    function queueAround(x, y, z, dry) {
      for (let d = 0; d < 6; d++) {
        const ax = x + FL_NX[d], ay = y + FL_NY[d], az = z + FL_NZ[d], v = rd(ax, ay, az);
        if (isFluid(v)) queueKey(flKey(ax, ay, az), slotIn(dry ? FLUID[v & 255].dry : FLUID[v & 255].delay));
      }
    }
    // from the game: 0 the cell itself, 1 the cells round it, 2 the cells round it drying (a source taken away)
    function touch(x, y, z, mode) {
      if (mode === 0) queue(x, y, z);
      else queueAround(x, y, z, mode === 2);
    }
    // a fluid cell that may move: any flowing one, or a source with room under or beside it, or a fluid it meets touching it
    function loose(x, y, z, v) {
      if (lvl(v) > 0) return true;
      const f = v & 255;
      if (y > 0) { const b = rd(x, y - 1, z); if (open(b) || (isF(b, f) && lvl(b) > 0) || meetsV(f, b)) return true; }
      if (meetsV(f, rd(x, y + 1, z))) return true;
      for (let d = 0; d < 4; d++) { const n = rd(x + FL_DX[d], y, z + FL_DZ[d]); if (open(n) || meetsV(f, n)) return true; }
      return false;
    }
    /* A chunk arriving: every loose fluid cell in it is queued (the world's own water too: a lake over a cave, a fall's
       curtain), from y0 to y1; with `edges` also the cells of the four chunks beside it along the shared sides, which
       could not see across before. Returns how many it queued. */
    function scanChunk(cx, cz, y0 = 0, y1 = CY - 1, edges = true) {
      const x0 = cx * 16, z0 = cz * 16;
      let n = 0;
      const look = (x, y, z) => { const v = rd(x, y, z); if (isFluid(v) && loose(x, y, z, v)) { queue(x, y, z); n++; } };
      for (let y = y0; y <= y1; y++)
        for (let z = 0; z < 16; z++)
          for (let x = 0; x < 16; x++) { const v = get(x0 + x, y, z0 + z); if (isFluid(v) && loose(x0 + x, y, z0 + z, v)) { queue(x0 + x, y, z0 + z); n++; } }
      if (edges)
        for (let y = 0; y < CY; y++)
          for (let k = 0; k < 16; k++) { look(x0 - 1, y, z0 + k); look(x0 + 16, y, z0 + k); look(x0 + k, y, z0 - 1); look(x0 + k, y, z0 + 16); }
      return n;
    }
    // a chunk let go: what waited in it is dropped (it is looked over again when it comes back)
    function forget(cx, cz) {
      const ck = flChunkKey(cx, cz), p = parked.get(ck);
      if (p) { parkedN -= p.length; parked.delete(ck); }
    }
    function clear() { due.clear(); slots.clear(); parked.clear(); parkedN = 0; }
    // one cell's turn
    function cell(x, y, z) {
      const v = rd(x, y, z);
      if (!isFluid(v)) return;
      const f = v & 255, c = FLUID[f];
      let L = lvl(v);
      /* Two fluids meet. For each cell round this one that holds a fluid this one's `meets` names:
           this cell becomes a block (`flowing` when it flows, `source` when it is one), and its turn is over; or,
           flowing with no block to become, it turns that neighbour into one (`turns`) and goes on.
         Water and lava: flowing water -> stone, a lava source -> obsidian, flowing lava turns the water to
         cobblestone, and a still water source waits for the lava's own turn. */
      if (c.meets !== undefined) for (let d = 0; d < 6; d++) {
        const ax = x + FL_NX[d], ay = y + FL_NY[d], az = z + FL_NZ[d], nv = rd(ax, ay, az);
        const m = nv >= 0 ? c.meets[nv & 255] : undefined;
        if (m === undefined) continue;
        const becomes = L > 0 ? m.flowing : m.source;
        if (becomes != null) { wr(x, y, z, becomes); queueAround(x, y, z, true); return; }
        if (L > 0 && m.turns != null) { wr(ax, ay, az, m.turns); queueAround(ax, ay, az, true); }
      }
      // flowing: fed, and how thin
      if (L > 0) {
        let want = 99, from = -1;
        if (isF(rd(x, y + 1, z), f)) want = c.step;               // falling
        else for (let d = 0; d < 4; d++) {
          const nx = x + FL_DX[d], nz = z + FL_DZ[d], nv = rd(nx, y, nz);
          if (!isF(nv, f)) continue;
          const o = outLevel(nx, y, nz, nv, f);
          if (o < want) { want = o; from = d; }
        }
        if (want > c.max) { wr(x, y, z, B.AIR); queueAround(x, y, z, true); return; }
        if (want !== L) {
          // it runs away from the side feeding it (that side's way turned round); a falling cell has no way
          wr(x, y, z, f | (want << 8) | ((from >= 0 ? FL_FD[from ^ 1] : 0) << 11));
          queueAround(x, y, z, false);
          L = want;
        }
      }
      // down first
      if (canDrop(x, y, z, f)) {
        const fall = f | (c.step << 8);
        if (rd(x, y - 1, z) !== fall) { wr(x, y - 1, z, fall); queue(x, y - 1, z); }
        // what it spread beside it may have lost its feed now: they look again
        for (let d = 0; d < 4; d++) {
          const nx = x + FL_DX[d], nz = z + FL_DZ[d], nv = rd(nx, y, nz);
          if (isF(nv, f) && lvl(nv) > 0) queue(nx, y, nz, c.dry);
        }
        return;
      }
      // then beside it
      const out = (isF(rd(x, y + 1, z), f) ? 0 : L) + c.step;
      if (out > c.max) return;
      let holed = false;
      const cand = [];
      for (let d = 0; d < 4; d++) {
        const nx = x + FL_DX[d], nz = z + FL_DZ[d], nv = rd(nx, y, nz);
        if (open(nv)) {
          const h = canDrop(nx, y, nz, f);
          if (h && !holed) { holed = true; cand.length = 0; }
          if (h || !holed) cand.push(d);
        } else if (isF(nv, f) && lvl(nv) > out) queue(nx, y, nz);   // a thinner one beside it fills up on its turn
      }
      for (const d of cand) {
        const nx = x + FL_DX[d], nz = z + FL_DZ[d];
        wr(nx, y, nz, f | (out << 8) | (FL_FD[d] << 11));
        queue(nx, y, nz);
      }
    }
    /* One step at sim time `now` (s): first the game's touches since the last ([x, y, z, mode] x n, see touch), then every
       cell due by now, up to `maxCells` cells or `maxChanges` changes (the rest next step); `speed` the world's tick speed
       factor; `inRange(cx, cz)` whether a chunk is in the sim range (a cell out of it waits, parked, and goes on when a
       player comes back near). Returns the changes, [x, y, z, was, now] x n. */
    function step(now, speed, inRange, touches = null, maxCells = 4000, maxChanges = 1500) {
      const t0 = performance.now();
      factor = speed > 0 ? speed : 1;
      nowSlot = Math.floor(now / FL_SLOT);
      ov.clear(); was.clear();
      if (touches) for (let i = 0; i + 3 < touches.length; i += 4) touch(touches[i], touches[i + 1], touches[i + 2], touches[i + 3]);
      if ((++steps & 7) === 0 && parkedN)                       // parked chunks a player came back to
        for (const [ck, keys] of parked) {
          const cx = Math.floor(ck / 262144) - 131072, cz = ck % 262144 - 131072;
          if (!inRange(cx, cz)) continue;
          for (const k of keys) queueKey(k, nowSlot);
          parkedN -= keys.length;
          parked.delete(ck);
        }
      const ready = [];
      for (const s of slots.keys()) if (s <= nowSlot) ready.push(s);
      ready.sort((a, b) => a - b);
      let n = 0, full = false, rcx = 1e9, rcz = 1e9, rin = false;
      for (const s of ready) {
        const list = slots.get(s);
        slots.delete(s);
        for (let i = 0; i < list.length; i++) {
          const k = list[i];
          if (due.get(k) !== s) continue;                         // asked again earlier, and done then
          if (full) { due.delete(k); queueKey(k, nowSlot + 1); continue; }
          due.delete(k);
          const y = k % 256, t = (k - y) / 256, zz = t % FL_SPAN, z = zz - FL_OFF, x = (t - zz) / FL_SPAN - FL_OFF;
          const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
          if (cx !== rcx || cz !== rcz) { rcx = cx; rcz = cz; rin = inRange(cx, cz); }
          if (!rin) {
            if (get(x, y, z) < 0) continue;                       // not even loaded: looked over again when it comes
            const ck = flChunkKey(cx, cz);
            let p = parked.get(ck);
            if (!p) parked.set(ck, p = []);
            p.push(k); parkedN++;
            continue;
          }
          cell(x, y, z);
          if (++n >= maxCells || ov.size >= maxChanges) full = true;
        }
      }
      const out = [];
      for (const [k, v] of ov) {
        const w = was.get(k);
        if (w === v || w < 0) continue;                           // no change, or into a chunk not loaded
        const y = k % 256, t = (k - y) / 256, zz = t % FL_SPAN;
        out.push((t - zz) / FL_SPAN - FL_OFF, y, zz - FL_OFF, w, v);
      }
      ov.clear(); was.clear();
      return { changes: new Float64Array(out), cells: n, ms: performance.now() - t0 };
    }
    const stats = () => ({ queued: due.size, parked: parkedN });
    return { queue, queueAround, touch, scanChunk, forget, clear, step, stats };
  }
});
