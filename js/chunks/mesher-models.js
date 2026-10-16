'use strict';
/* chunks/mesher-models.js: blocks that are not cubes, drawn one by one from boxes. Chimneys, mushrooms, and
   emitBoxFaces: every chisel shape, carpet and box model.
   A part of meshChunk's body (chunks/mesher.js). */

corePart('mesh.chunk', function () {
    // ---- non-cube models (slab): emitted per-block with bespoke geometry ----
    // Chisel shapes (slab halves, stairs) come from shapeBoxesAt since 0.783; below, the older notes on
    // doubles). Each face's UVs come from the box extents so half faces sample the matching half
    // of the texture. Faces flush with the cell border cull against opaque neighbours.
    // f = 6-tile faces array [+X,-X,+Y(top),-Y(bottom),+Z,-Z] so slabs get real top/bottom textures
    /* `own` (wall plates): a face that sits INSIDE the cell reads the cell's own light, not the
       neighbour's. A glow vine's front face faces the cell beyond it, and in a one-block gap that cell
       is rock with no light of its own, so the vine rendered dark right beside its own glow. */
    // sw: bitmask by face index (+X,-X,top,bottom,+Z,-Z) of faces whose texture turns a quarter,
    // so the bark of a lying hollow log runs along it instead of across
    // a furnace's chimney: a 6 x 6 x 6 px box on the cell floor, each face showing the whole texture
    function emitChimney(x, y, z, set) {
      const x0 = x + 5 / 16, x1 = x + 11 / 16, z0 = z + 5 / 16, z1 = z + 11 / 16, y0 = y, y1 = y + 6 / 16;
      const L = gl(x, y, z), side = set[5];
      quad(0, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0], [0,0],[0,1],[1,1],[1,0], set[6], 255, L);   // top
      quad(0, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1], [1,0],[1,1],[0,1],[0,0], side, 178, L);     // +X
      quad(0, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], [0,0],[1,0],[1,1],[0,1], side, 178, L);     // -X
      quad(0, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], [0,0],[1,0],[1,1],[0,1], side, 216, L);     // +Z
      quad(0, [x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0], [1,0],[1,1],[0,1],[0,0], side, 216, L);     // -Z
    }
    /* A mushroom: SHROOM_MODEL's boxes, each face on its sheet at 8 texels a model pixel. The sheet
       sits in its layer's bottom-left corner (03-atlas.js), so one model pixel is 1/16 of the layer's UV. */
    /* In the world a mushroom is 40% of its model, and each place grows its own: 0.5x to 1.5x of that,
       from a hash of where it stands, scaled about the middle of its foot. The art is squeezed with it (the UVs
       keep the model's own sizes). Icons and drops (no ox) keep the full model. */
    /* Growth (seasons/seasons.js): the variant's bits 0-2 are the size it grows to (1..7 = 0.5x..1.5x; 0 = one
       from before, or from the world generator, sized by where it stands as above) and bits 3-7 how many of 31
       steps it still has to grow (0 = grown). A sprout is drawn at the part it has grown, never under 12%. */
    const SHROOM_SCALE = 0.4, SHROOM_STEPS = 31;
    function emitShroom(x, y, z, kind, vr = 0) {
      const set = SHROOM_T[kind], L = gl(x, y, z), P = 1 / 16;
      let s = 1;
      if (ox != null) {
        const m = vr & 7, left = (vr >> 3) & 31;
        let size;
        if (m) size = 0.5 + (m - 1) / 6;
        else {
          let hh = Math.imul((ox + x) | 0, 374761393) + Math.imul(y | 0, 217645177) + Math.imul((oz + z) | 0, 668265263);
          hh = Math.imul(hh ^ (hh >>> 13), 1274126177); hh ^= hh >>> 16;
          size = 0.5 + (hh >>> 0) / 4294967296;
        }
        s = SHROOM_SCALE * size * Math.max(0.12, 1 - left / SHROOM_STEPS);
      }
      const sx = (a) => x + (8 + (a - 8) * s) * P, sz = (c) => z + (8 + (c - 8) * s) * P, sy = (b) => y + b * s * P;
      for (const [a0, b0, c0, a1, b1, c1, side, top, bot] of SHROOM_MODEL[kind]) {
        const x0 = sx(a0), x1 = sx(a1), y0 = sy(b0), y1 = sy(b1), z0 = sz(c0), z1 = sz(c1);
        const w = (a1 - a0) * P, h = (b1 - b0) * P, d = (c1 - c0) * P;
        if (side) {
          const t = set[side[0]], u0 = side[1] * P, v0 = side[2] * P;
          const U = (k) => u0 + k, V = (k) => v0 + k;
          quad(0, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1], [U(d),V(0)],[U(d),V(h)],[U(0),V(h)],[U(0),V(0)], t, 178, L);   // +X
          quad(0, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], [U(0),V(0)],[U(d),V(0)],[U(d),V(h)],[U(0),V(h)], t, 178, L);   // -X
          quad(0, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], [U(0),V(0)],[U(w),V(0)],[U(w),V(h)],[U(0),V(h)], t, 216, L);   // +Z
          quad(0, [x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0], [U(w),V(0)],[U(w),V(h)],[U(0),V(h)],[U(0),V(0)], t, 216, L);   // -Z
        }
        if (top) {
          const t = set[top[0]], u0 = top[1] * P, v0 = top[2] * P;
          quad(0, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0], [u0,v0],[u0,v0+d],[u0+w,v0+d],[u0+w,v0], t, 255, L);
        }
        if (bot) {
          const t = set[bot[0]], u0 = bot[1] * P, v0 = bot[2] * P;
          quad(0, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], [u0,v0],[u0+w,v0],[u0+w,v0+d],[u0,v0+d], t, 140, L);
        }
      }
    }
    // `u`: the box the UVs are taken from, the box itself unless a model maps its whole picture on each face
    // `ps`: the render pass, 0 unless the block is see-through (glass shapes and carpets in the cutout pass)
    /* Shapes and carpets of a see-through block (glass and its looks) go in its own pass with the full block, so they
       stay see-through (drawn in the opaque pass since shapes came in 0.783, which showed glass solid; the
       see-through pass 4 since 0.8263). Leaf and snow carpets stay where they were. */
    const _shapePass = (id) => { const p = PROPS[id].pass; return p === 4 ? 4 : p === 1 && !PROPS[id].layerStack ? 1 : 0; };
    // `skip`: faces left out, a bit each in the order below (top 1, bottom 2, +X 4, -X 8, +Z 16, -Z 32)
    function emitBoxFaces(x, y, z, b, f, own, sw = 0, glow = 0, u = b, ps = 0, skip = 0) {
      const x0 = x+b[0], y0 = y+b[1], z0 = z+b[2], x1 = x+b[3], y1 = y+b[4], z1 = z+b[5];
      const op = (xx, yy, zz) => { const nv = gb(xx, yy, zz); return opaqueVal(nv) || fastLeaf(nv); };   // fast leaves hide too
      let L = own ? gl(x, y, z) : -1;
      // a faint light of its own, as an ore's selfGlow gives its faces (gem clusters)
      if (glow && L >= 0 && (L & 15) < glow) L = (L & 0xF0) | glow;
      const lit = (inner, xx, yy, zz) => (inner && L >= 0 ? L : gl(xx, yy, zz));
      const T4 = (k, a, c, d, e) => ((sw >> k) & 1) ? [[a[1],a[0]], [c[1],c[0]], [d[1],d[0]], [e[1],e[0]]] : [a, c, d, e];
      if (!(skip & 1) && (b[4] < 1 || !op(x, y+1, z)))    // top
        quad(ps, [x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],
             ...T4(2, [u[0],u[2]],[u[0],u[5]],[u[3],u[5]],[u[3],u[2]]), f[2], 255, lit(b[4] < 1, x, y+1, z));
      if (!(skip & 2) && (b[1] > 0 || !op(x, y-1, z)))    // bottom
        quad(ps, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],
             ...T4(3, [u[0],u[2]],[u[3],u[2]],[u[3],u[5]],[u[0],u[5]]), f[3], 140, lit(b[1] > 0, x, y-1, z));
      if (!(skip & 4) && (b[3] < 1 || !op(x+1, y, z)))    // +X
        quad(ps, [x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],
             ...T4(0, [1-u[2],u[1]],[1-u[2],u[4]],[1-u[5],u[4]],[1-u[5],u[1]]), f[0], 178, lit(b[3] < 1, x+1, y, z));
      if (!(skip & 8) && (b[0] > 0 || !op(x-1, y, z)))    // -X
        quad(ps, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],
             ...T4(1, [u[2],u[1]],[u[5],u[1]],[u[5],u[4]],[u[2],u[4]]), f[1], 178, lit(b[0] > 0, x-1, y, z));
      if (!(skip & 16) && (b[5] < 1 || !op(x, y, z+1)))   // +Z
        quad(ps, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
             ...T4(4, [u[0],u[1]],[u[3],u[1]],[u[3],u[4]],[u[0],u[4]]), f[4], 216, lit(b[5] < 1, x, y, z+1));
      if (!(skip & 32) && (b[2] > 0 || !op(x, y, z-1)))   // -Z
        quad(ps, [x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],
             ...T4(5, [1-u[0],u[1]],[1-u[0],u[4]],[1-u[3],u[4]],[1-u[3],u[1]]), f[5], 216, lit(b[2] > 0, x, y, z-1));
    }
    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)], vid = val & 255;
          if (!PROPS[vid]) continue;                           // an id this build does not know
          const lc = layerCount(val);                          // a layer stack
          const shapeBoxes = lc ? null : shapeBoxesAt(gb, x, y, z, val);   // a chiseled slab or stairs
          if (shapeBoxes && shapeOfVal(val) === 'door') continue;      // a door is its own swinging mesh (blocks/doors.js)
          /* The furnace's chimney: a 6px stub standing proud of its top, drawn only — no
             hitbox, it never blocks a placement. Emitted in the cell above so the open air lights it.
             Since 0.809 it is 6px tall (furnace_*.json) in its rock's own chimney art, the whole picture
             on every face rather than a window of the furnace's. */
          // ...on top of a chimney of walls when one stands on it
          if (vid === B.FURNACE && !lod) {
            const k = chimneyHeight(gb, x, y, z);
            if (y + 1 + k < CY && !opaqueVal(gb(x, y + 1 + k, z))) emitChimney(x, y + 1 + k, z, FURNACE_T[furnaceRockOf((val >> 8) & 255)]);
          }
          // a far chunk leaves out the small models: pebbles, gourds, salt, vines, the mortar, clusters
          if (lod) { const md = PROPS[vid].model; if (md === 'carpet' || md === 'wall' || md === 'voxel' || md === 'cluster') continue; }
          if (lc) {
            /* One box per RUN of the same block rather than one per layer: a 6-deep snow drift is one box,
               and only a real change of block costs another. A mixed stack reads its list; if that is
               missing it draws as its top block all the way down rather than not at all. */
            const ids = layerMixed(val) && layers ? layers.get(x + (z << 4) + (y << 8)) : null;
            const at = (i) => (ids && i < ids.length ? ids[i] : vid);
            for (let i = 0; i < lc;) {
              const b = at(i);
              let j = i + 1;
              while (j < lc && at(j) === b) j++;
              if (PROPS[b]) { const bx = [0, i / LAYER_MAX, 0, 1, j / LAYER_MAX, 1]; emitBoxFaces(x, y, z, bx, PROPS[b].faces, false, 0, 0, bx, _shapePass(b)); }
              i = j;
            }
          }
          else if (shapeBoxes)
            for (const bx of shapeBoxes) emitBoxFaces(x, y, z, bx, PROPS[vid].faces, false, 0, 0, bx, _shapePass(vid));
          else if (slabMixed(val)) {                     // two slabs of different blocks: each half in its own art
            const ids = layers ? layers.get(x + (z << 4) + (y << 8)) : null;
            const hb = slabMixBoxes(val), ax = (((val >> 8) & ROT_MASK) & 6) >> 1;   // 0 y, 1 x, 2 z
            const two = [0, 1].map(h => ids && ids.length === 2 && PROPS[ids[h]] ? ids[h] : vid);
            /* The face where the halves meet is drawn only when the half across it can be seen through: a
               glass half shows the stone under it, but never draws its own face flat against that stone. Each half
               in its own pass, so a glass half is see-through like a glass slab. */
            const INNER = [[1, 2], [4, 8], [16, 32]][ax];          // the low half's inner face, the high half's
            for (let h = 0; h < 2; h++)
              emitBoxFaces(x, y, z, hb[h], PROPS[two[h]].faces, false, 0, 0, hb[h], _shapePass(two[h]),
                           PROPS[two[1 - h]].opaque ? INNER[h] : 0);
          }
          else if (PROPS[vid].model === 'hollow')      // a hollow log: bark shell and its filling, lit from inside
            for (const [bx, f, sw] of hollowParts(val)) emitBoxFaces(x, y, z, bx, f, true, sw);
          else if (PROPS[vid].model === 'carpet' || PROPS[vid].model === 'wall') {   // a wall plate is an upright carpet
            const va = (val >> 8) & 255;
            const boxes = PROPS[vid].boxesByVar[va] || PROPS[vid].boxesByVar[0];
            const own = PROPS[vid].model === 'wall';     // lit by its own cell
            // a carved pumpkin: its face on the side it was turned to, and the whole picture on each face
            const fv = PROPS[vid].facesByVar, fl = PROPS[vid].fullUV ? FULL_UV_BOX : undefined;
            for (let bi = 0; bi < boxes.length; bi++)
              emitBoxFaces(x, y, z, boxes[bi], fv ? fv[va & 3] : PROPS[vid].faces, own, 0, 0, fl);
          }
          else if (PROPS[vid].model === 'voxel') {
            // a voxel model: every box in its own material, lit from its own cell like a wall plate
            // variant 1 leaves out the animated part, variant 2 is that part alone (the grinding pestle)
            const vp = PROPS[vid], va = (val >> 8) & 255;
            for (const bx of vp.voxBoxes) {
              if ((va === 1 && bx[6] === vp.animMat) || (va === 2 && bx[6] !== vp.animMat)) continue;
              emitBoxFaces(x, y, z, bx, vp.matFaces[bx[6]] || vp.faces, true);
            }
          }
          else if (PROPS[vid].model === 'cluster')      // a gem cluster: crystals out of the face behind it
          {
            const va = (val >> 8) & 255, cp = PROPS[vid];
            const bed = CLUSTER_BEDS[va >> CLUSTER_BED_SHIFT] || cp.bedFaces;   // the rock it grows from
            for (const [bx, gem] of CLUSTER_BOXES[(va & 7) % 6][(va >> 3) & (CLUSTER_LAYOUTS - 1)])
              emitBoxFaces(x, y, z, bx, gem ? cp.faces : bed, true, 0, gem ? (cp.selfGlow || 0) : 0);
          }
        }
});
