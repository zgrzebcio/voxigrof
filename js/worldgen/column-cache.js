'use strict';
/* worldgen/column-cache.js: the column cache. What the wet grid of genChunk needs of a column (its ground, its water's
   top, which water it is, its river's way) kept once worked out, so the next chunk asking for it does not run terrainInfo
   again. A chunk's grid is 36 x 36 columns (worldgen/terrain-columns.js) and every column lies in the grids of about five
   chunks: terrainInfo was most of what making a chunk cost.
   With shared memory the table is ONE for all the workers (10-workers.js makes it and hands it over with `init`, a new
   one for every world), so a column one worker worked out serves them all; without it, or on the page, each generator
   keeps a smaller one of its own.
   Exactness: terrainInfo is a pure function of the seed and the place, and a column is kept only when its numbers fit the
   table exactly (whole numbers 0..255), so a chunk comes out the same with the cache as without it.
   A part of makeGen's body (worldgen/make-gen.js), before gen-chunk.js which reads it (colGet, colPut). */

corePart('gen.make', function () {
    /* A slot is 4 Int32: its version, x, z, and the packed numbers (h bits 0-7, wl 8-15, which water 16-17, a river's
       18, its way 19-22). Every read and write is an Atomics one, and the version makes it safe between threads: a
       writer makes it odd while it writes (taking the slot with compareExchange, so two never write one at once) and
       even again after; a reader takes the numbers only if the version was even and the same before and after. A slot
       is overwritten by whatever column lands on it next: the table only has to hold the land being made now. */
    const COLS = new Int32Array(colBuf || new ArrayBuffer(16 << 16));   // own table: 65536 slots, 1 MB
    const COL_MASK = (COLS.length >> 2) - 1;                            // slots: a power of two
    const _colSlot = (x, z) => ((Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) & COL_MASK) << 2;
    // the packed numbers of column (x, z), or -1 when the table does not have them
    function colGet(x, z) {
      const s = _colSlot(x, z), v1 = Atomics.load(COLS, s);
      if (v1 === 0 || (v1 & 1)) return -1;
      const kx = Atomics.load(COLS, s + 1), kz = Atomics.load(COLS, s + 2), p = Atomics.load(COLS, s + 3);
      return Atomics.load(COLS, s) === v1 && kx === x && kz === z ? p : -1;
    }
    function colPut(x, z, h, wl, ww, rv, fd) {
      if (!(h >= 0 && h <= 255 && wl >= 0 && wl <= 255 && fd >= 0 && fd <= 15) ||
          !Number.isInteger(h) || !Number.isInteger(wl) || !Number.isInteger(fd)) return;   // would not come back exact
      const s = _colSlot(x, z), v = Atomics.load(COLS, s);
      if ((v & 1) || Atomics.compareExchange(COLS, s, v, v + 1) !== v) return;          // another thread is writing it
      Atomics.store(COLS, s + 1, x); Atomics.store(COLS, s + 2, z);
      Atomics.store(COLS, s + 3, h | (wl << 8) | (ww << 16) | (rv << 18) | (fd << 19));
      Atomics.store(COLS, s, v + 2);
    }
});
