'use strict';
/* woods/hollow-logs.js: hollow logs. A bark shell open at both ends: its walls, what can fill it, its boxes.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* HOLLOW LOGS. A log with its heart gone: a bark shell 2/16 thick, open at both ends, lying along
     the axis in its variant like a log (bits 0-1: 0 Y, 1 X, 2 Z). Bits 2-4 index HOLLOW_FILLS, what has been
     packed inside, so an upright one works as a planter. The ends use the log's ring texture, which at the
     shell's thickness is just the bark rim; the inside walls are bark too. Walls are authored standing up
     and turned onto the axis; on a lying log the bark is turned as well, so its grain runs along the log. */
  const HOLLOW_FILLS = [0, B.DIRT, B.GRASS, B.SAND, B.RED_SAND];
  // the ±Z walls stop 2 short of each corner, leaving the square 2-pixel notch a log's edges have
  const HOLLOW_WALLS = [[2,0,0,14,16,2], [2,0,14,14,16,16], [0,0,2,2,16,14], [14,0,2,16,16,14]].map(b => b.map(n => n / 16));
  const HOLLOW_CORE_UP = [2,0,2,14,15,14].map(n => n / 16);      // soil sits just under the rim
  const HOLLOW_CORE_LYING = [2,0,2,14,16,14].map(n => n / 16);   // ...and runs out to both ends lying down
  const HOLLOW_SWAP = [0, (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5), (1 << 0) | (1 << 1)];   // faces whose UVs turn, per axis
  // the face of each wall that looks INTO the log, per axis — those show stripped wood
  const HOLLOW_INNER = [[4, 5, 0, 1], [4, 5, 2, 3], [2, 3, 0, 1]];
  const _hollowOnAxis = (b, axis) => axis === 1 ? [b[1], b[0], b[2], b[4], b[3], b[5]]
                                   : axis === 2 ? [b[0], b[2], b[1], b[3], b[5], b[4]] : b;
  const _hollowParts = new Map(), _hollowBoxes = new Map();
  // [box, six tiles, UV-turn mask] for each part of a hollow log value: four walls, then its filling
  function hollowParts(v) {
    const key = v & 0xFFFF;
    let out = _hollowParts.get(key);
    if (out) return out;
    const va = (v >> 8) & 255, axis = Math.min(2, va & 3), fill = HOLLOW_FILLS[(va >> 2) & 7] || 0;
    const S = PROPS[v & 255].faces[0], E = PROPS[v & 255].faces[2];
    const f = axis === 0 ? [S, S, E, E, S, S] : axis === 1 ? [E, E, S, S, S, S] : [S, S, S, S, E, E];
    const inner = PROPS[v & 255].innerTile;
    out = HOLLOW_WALLS.map((b, w) => {
      const fw = f.slice();
      fw[HOLLOW_INNER[axis][w]] = inner;
      return [_hollowOnAxis(b, axis), fw, HOLLOW_SWAP[axis]];
    });
    if (fill) out.push([_hollowOnAxis(axis ? HOLLOW_CORE_LYING : HOLLOW_CORE_UP, axis), PROPS[fill].faces, 0]);
    _hollowParts.set(key, out);
    return out;
  }
  function hollowBoxes(v) {
    const key = v & 0xFFFF;
    let b = _hollowBoxes.get(key);
    if (!b) _hollowBoxes.set(key, b = hollowParts(v).map(q => q[0]));
    return b;
  }
  for (const [bid, name, log, stripped] of [[B.HOLLOW_LOG, 'Hollow oak log', B.LOG, B.STRIPPED_LOG],
                                            [B.HOLLOW_BIRCH_LOG, 'Hollow birch log', B.BIRCH_LOG, B.STRIPPED_BIRCH_LOG],
                                            [B.HOLLOW_SPRUCE_LOG, 'Hollow spruce log', B.SPRUCE_LOG, B.STRIPPED_SPRUCE_LOG],
                                            [B.HOLLOW_RIME_LOG, 'Hollow rime log', B.RIME_LOG, B.STRIPPED_RIME_LOG],      // 0.836
                                            [B.HOLLOW_ACACIA_LOG, 'Hollow acacia log', B.ACACIA_LOG, B.STRIPPED_ACACIA_LOG],
                                            [B.HOLLOW_PALM_LOG, 'Hollow palm log', B.PALM_LOG, B.STRIPPED_PALM_LOG],
                                            [B.HOLLOW_JUNGLE_LOG, 'Hollow jungle log', B.JUNGLE_LOG, B.STRIPPED_JUNGLE_LOG]]) {
    PROPS[bid] = { name, solid:true, opaque:false, raycast:true, pass:0, model:'hollow', rot:'all', stack:50, hardness:3.0,
                   type:'wood', faces:PROPS[log].faces.slice(), innerTile:PROPS[stripped].faces[0],   // inside: stripped wood
                   boxesOf:hollowBoxes, desc:'Fill it with dirt, grass or sand to plant in it' };
    PROPS[bid].boxes = hollowBoxes(bid);
  }
});
