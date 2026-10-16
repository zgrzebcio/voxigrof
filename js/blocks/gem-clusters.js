'use strict';
/* blocks/gem-clusters.js: gem clusters. Their look (a bed of rock with spikes of the gem), the rock they grow from
   (variant bits), their boxes for drawing and for the crosshair.
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* GEM CLUSTERS. Diamond, emerald, ruby, sapphire and topaz are no longer ore blocks buried in the
     rock: each is a cluster of crystal spikes growing out of a stone face in a cave — floor, ceiling or wall —
     drawn in its gem block's texture. Same ids, so drops, tool tiers, XP and Prospector are unchanged. The
     variant byte (0-5) is the way it points: up, down, +X, -X, +Z, -Z (CLUSTER_DIRS); the block it grows from
     is the cell behind it, and when that goes the cluster drops as an item (chunks/chunks.js). Nothing collides
     with it. Worldgen puts them in caves (genChunk, after the sulfur). */
  const CLUSTER_DIRS = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  /* THE LOOK (five straight spikes in 0.7945). A low uneven bed of the gem's ore rock, and six to
     eight crystal points of different heights rising out of it, each LEANING a step at a time so they
     point every which way. Four layouts, built from fixed seeds so every client draws the same; bits 3-4
     of the variant byte pick one (bits 0-2 are the direction), rolled when a cluster spawns or is placed.
     Authored pointing UP, in 16ths: [x0, y0, z0, x1, y1, z1, crystal ? 1 : 0]. */
  const CLUSTER_LAYOUTS = 4;
  function _clusterLayout(seed) {
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const out = [[2, 0, 2, 14, 1, 14, 0]];                          // the bed...
    for (let i = 0; i < 3; i++) {                                   // ...lumpy in a few places
      const w = 3 + (rnd() * 4 | 0), d = 3 + (rnd() * 4 | 0);
      const x = 1 + (rnd() * (14 - w) | 0), z = 1 + (rnd() * (14 - d) | 0);
      out.push([x, 0, z, x + w, 2, z + d, 0]);
    }
    const n = 6 + (rnd() * 3 | 0);
    for (let c = 0; c < n; c++) {
      const w = rnd() < 0.35 ? 3 : 2, h = 4 + (rnd() * 7 | 0);     // 4..10 tall
      let x = 2 + (rnd() * (12 - w) | 0), z = 2 + (rnd() * (12 - w) | 0);
      const dx = (rnd() * 3 | 0) - 1, dz = (rnd() * 3 | 0) - 1;   // which way it leans
      for (let y = 1; y < h;) {
        const top = Math.min(h, y + 2 + (rnd() * 2 | 0));
        const tip = top >= h, ww = tip ? 1 : w, o = tip ? (w - 1) >> 1 : 0;
        out.push([x + o, y, z + o, x + o + ww, top, z + o + ww, 1]);
        y = top;
        x = Math.max(0, Math.min(16 - w, x + dx));
        z = Math.max(0, Math.min(16 - w, z + dz));
      }
    }
    return out.map(b => [...b.slice(0, 6).map(v => v / 16), b[6]]);
  }
  const CLUSTER_UP = Array.from({ length: CLUSTER_LAYOUTS }, (_, i) => _clusterLayout(7 + i * 131));
  // turn a box authored pointing up to point along CLUSTER_DIRS[o]
  const _clusterTurn = (b, o) =>
      o === 1 ? [b[0], 1 - b[4], b[2], b[3], 1 - b[1], b[5]]
    : o === 2 ? [b[1], b[0], b[2], b[4], b[3], b[5]]
    : o === 3 ? [1 - b[4], b[0], b[2], 1 - b[1], b[3], b[5]]
    : o === 4 ? [b[0], b[2], b[1], b[3], b[5], b[4]]
    : o === 5 ? [b[0], b[2], 1 - b[4], b[3], b[5], 1 - b[1]]
    : b;
  // [direction][layout] -> [box, crystal?]
  const CLUSTER_BOXES = CLUSTER_DIRS.map((_, o) => CLUSTER_UP.map(lay => lay.map(b => [_clusterTurn(b, o), b[6]])));
  // the crosshair's box, indexed by the whole variant byte (direction | layout << 3 | bed << 5)
  const CLUSTER_HIT = Array.from({ length: 256 }, (_, v) =>
    [_clusterTurn([1, 0, 1, 15, 11, 15].map(n => n / 16), (v & 7) % 6)]);
  /* THE BED: bits 5-7 of the variant byte say what rock the cluster grows from — 0 its ore's own
     speckled stone, then plain stone, granite, marble, limestone. Worldgen matches the rock it grew on;
     the variant bar picks one when you place it. Bits, not block ids, so a new rock costs no id. */
  const CLUSTER_BED_SHIFT = 5;
  const CLUSTER_BEDS = [null, T.STONE, T.GRANITE, T.MARBLE, T.LIMESTONE, T.DOLOMITE].map(t => t == null ? null : Array(6).fill(t));
  const CLUSTER_BED_OF = { [B.STONE]: 1, [B.GRANITE]: 2, [B.MARBLE]: 3, [B.LIMESTONE]: 4, [B.DOLOMITE]: 5 };   // rock id -> bed (dolomite 0.809)
  for (const [id, name, tile] of [[B.DIAMOND_ORE, 'Diamond cluster', T.DIAMOND_BLOCK], [B.EMERALD_ORE, 'Emerald cluster', T.EMERALD_BLOCK],
                                  [B.RUBY_ORE, 'Ruby cluster', T.RUBY_BLOCK], [B.SAPPHIRE_ORE, 'Sapphire cluster', T.SAPPHIRE_BLOCK],
                                  [B.TOPAZ_ORE, 'Topaz cluster', T.TOPAZ_BLOCK]])
    // crystals in the gem block's texture, the bed in the ore's own stone
    Object.assign(PROPS[id], { name, solid: false, opaque: false, model: 'cluster', bedFaces: PROPS[id].faces,
                               faces: [tile, tile, tile, tile, tile, tile], boxes: CLUSTER_HIT[0], boxesByVar: CLUSTER_HIT });
  // sandstone: five sand of its colour, with its own top, side and bottom faces [+X,-X,top,bottom,+Z,-Z]
  PROPS[B.SANDSTONE]     = { name:'Sandstone',     solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:4.0, type:'stone',
                             faces:[T.SANDSTONE_SIDE,T.SANDSTONE_SIDE,T.SANDSTONE_TOP,T.SANDSTONE_BOTTOM,T.SANDSTONE_SIDE,T.SANDSTONE_SIDE], desc: '' };
  PROPS[B.RED_SANDSTONE] = { name:'Red sandstone', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:4.0, type:'stone',
                             faces:[T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_TOP,T.RED_SANDSTONE_BOTTOM,T.RED_SANDSTONE_SIDE,T.RED_SANDSTONE_SIDE], desc: '' };
  // pink sand: on warm beaches, sand in every way but its colour; five make pink sandstone
  PROPS[B.PINK_SAND]      = { ...PROPS[B.SAND], name: 'Pink sand', faces: [T.PINK_SAND_SIDE,T.PINK_SAND_SIDE,T.PINK_SAND,T.PINK_SAND,T.PINK_SAND_SIDE,T.PINK_SAND_SIDE] };
  PROPS[B.PINK_SANDSTONE] = { ...PROPS[B.SANDSTONE], name: 'Pink sandstone', faces: Array(6).fill(T.PINK_SANDSTONE) };
});
