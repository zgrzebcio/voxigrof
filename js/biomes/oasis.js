'use strict';
/* biomes/oasis.js: the oases. One per OASIS_CELL square, maybe: a small lake ringed with grass in the desert.
   A part of makeBiomes' body (biomes/biomes.js). */

corePart('biomes.make', function () {
    /* Oases (0.84, biomeRev 21): one OASIS_CELL square in OASIS_CHANCE may hold one, tried at up to four spots, kept only
       out in the open desert (not the Deep Desert), where the ground round it lies within 8 and no river runs near. A
       lake about `r` across the radius (ragged) in a ring of grass out to `R`; the land is eased flat to it over 14 more.
       The water's top is the ground's level `g`, the grass a block over it. A pure function of its cell, like a lake. */
    const OASIS_CELL = 448, OASIS_CHANCE = 0.4, _oases = new Map();
    function _oasisDef(gx, gz) {
      const key = gx + ',' + gz;
      if (_oases.has(key)) return _oases.get(key);
      let def = null;
      if (_rh(gx, gz, 101) < OASIS_CHANCE)
        for (let k = 0; k < 4 && !def; k++) {
          const x = (gx + 0.2 + 0.6 * _rh(gx, gz, 102 + k)) * OASIS_CELL, z = (gz + 0.2 + 0.6 * _rh(gx, gz, 106 + k)) * OASIS_CELL;
          const c = terrainInfo(x, z, true);
          if (c.fDesert < 0.9 || (c.fDeepD || 0) > 0.2 || c.h < WATER_LEVEL + 4) continue;
          const r = 5 + 8 * _rh(gx, gz, 110 + k), R = r + 6 + 6 * _rh(gx, gz, 114 + k);
          let lo = 1e9, hi = -1e9, ok = true;
          for (let a = 0; a < 12 && ok; a++) {
            const t = terrainInfo(x + Math.cos(a * Math.PI / 6) * R, z + Math.sin(a * Math.PI / 6) * R, true);
            if (t.fDesert < 0.7) ok = false;
            lo = Math.min(lo, t.h); hi = Math.max(hi, t.h);
          }
          if (!ok || hi - lo > 8) continue;
          if (FLOW) { const rv = _riverAt(x, z); if (rv && rv.edge < R + 40) continue; }
          def = { x, z, r, R, g: Math.round(Math.min(c.h, (lo + hi) / 2)), d: 2 + 3 * _rh(gx, gz, 118 + k) };
        }
      _oases.set(key, def);
      return def;
    }
    // the oasis whose land reaches here (its ring and the eased edge round it), or null; a spot lies 89+ in from its cell's edge
    function _oasisAt(x, z) {
      if (!DESERT2) return null;
      const O = _oasisDef(Math.floor(x / OASIS_CELL), Math.floor(z / OASIS_CELL));
      return O && Math.hypot(x - O.x, z - O.z) < O.R * 1.2 + 16 ? O : null;
    }
    // biome-scale noise at two thirds the frequency: 1.5x as big (rev 5); at a third: 3x the old, twice rev 5's (rev 8)
    const BS = BIGGER ? 1 / 3 : REV5 ? 1 / 1.5 : 1;
});
