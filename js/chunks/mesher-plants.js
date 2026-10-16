'use strict';
/* chunks/mesher-plants.js: torches and cross billboards (grass, flowers, saplings, bushes).
   A part of meshChunk's body (chunks/mesher.js). */

corePart('mesh.chunk', function () {
    // ---- non-cube: cross/billboard (plants) ----
    // Two diagonal quads, each emitted front + back (double-sided)
    /* Torch: a real stick rather than a flat billboard, so it can LEAN on a wall. The
       stick is the torch texture's own 8-texel column (28..35) and its bottom 40 rows, so every
       side shows stick and flame — the same UV scheme emitBoxFaces uses, face for face. Variant
       0 stands upright; 1-4 hang on a wall and lean away from it (+X, -X, +Z, -Z). A wall torch
       is the floor stick slid against the wall, raised, and SHEARED outward along its height: a
       shear keeps every face planar, as a rotation would, for a fraction of the arithmetic. */
    const TORCH_DIRS = [null, [1, 0], [-1, 0], [0, 1], [0, -1]];
    const TORCH_LEAN = 0.41;                       // tan(~22 degrees): the classic wall-torch lean
    // how far a wall torch's foot slides toward its wall: the stick's centre on the wall plane, half of it buried
    const TORCH_WALL = 0.5;
    const TORCH_BOX = [28 / 64, 0, 28 / 64, 36 / 64, 40 / 64, 36 / 64];
    function emitTorch(x, y, z, varb, id = B.TORCH) {   // id: which torch, for its picture
      const d = TORCH_DIRS[varb & 7] || null;
      const nx = d ? d[0] : 0, nz = d ? d[1] : 0;
      const T3 = (px, py, pz) => {
        if (!d) return [px, py, pz];
        const ly = py - y;                         // height up the stick, 0..0.625
        return [px - nx * TORCH_WALL + nx * TORCH_LEAN * ly, py + 0.18, pz - nz * TORCH_WALL + nz * TORCH_LEAN * ly];
      };
      /* The cap samples the flame's top 2x2 (texture rows 6-7, v 0.5-0.625) and the foot the end of
         the stick (rows 14-15). Both used to take the box's own XZ footprint as UVs, which lands mid
         sprite: half flame, half brown stick across the top of every torch. */
      const b = TORCH_BOX, tile = PROPS[id].faces[0], lite = gl(x, y, z);
      const x0 = x+b[0], y0 = y+b[1], z0 = z+b[2], x1 = x+b[3], y1 = y+b[4], z1 = z+b[5];
      quad(1, T3(x0,y1,z0),T3(x0,y1,z1),T3(x1,y1,z1),T3(x1,y1,z0),
           [b[0],0.5],[b[0],0.625],[b[3],0.625],[b[3],0.5], tile, 255, lite);          // top
      quad(1, T3(x0,y0,z0),T3(x1,y0,z0),T3(x1,y0,z1),T3(x0,y0,z1),
           [b[0],0],[b[3],0],[b[3],0.125],[b[0],0.125], tile, 140, lite);          // bottom
      quad(1, T3(x1,y0,z0),T3(x1,y1,z0),T3(x1,y1,z1),T3(x1,y0,z1),
           [1-b[2],b[1]],[1-b[2],b[4]],[1-b[5],b[4]],[1-b[5],b[1]], tile, 178, lite);  // +X
      quad(1, T3(x0,y0,z0),T3(x0,y0,z1),T3(x0,y1,z1),T3(x0,y1,z0),
           [b[2],b[1]],[b[5],b[1]],[b[5],b[4]],[b[2],b[4]], tile, 178, lite);          // -X
      quad(1, T3(x0,y0,z1),T3(x1,y0,z1),T3(x1,y1,z1),T3(x0,y1,z1),
           [b[0],b[1]],[b[3],b[1]],[b[3],b[4]],[b[0],b[4]], tile, 216, lite);          // +Z
      quad(1, T3(x0,y0,z0),T3(x0,y1,z0),T3(x1,y1,z0),T3(x1,y0,z0),
           [1-b[0],b[1]],[1-b[0],b[4]],[1-b[3],b[4]],[1-b[3],b[1]], tile, 216, lite);  // -Z
    }
    function emitCross(x, y, z, blockId, varb) {
      // sulfur tip: variant 1 = flipped/down orientation, swap tile to the down-tip texture
      let tile = PROPS[blockId].faces[0];
      if (blockId === B.SULFUR_UP_TIP && (varb & 1)) tile = T.SULFUR_DOWN_TIP;
      // per-variant billboard texture (berry bush growth stages)
      const tv = PROPS[blockId].tilesByVar;
      if (tv && tv[varb] != null) tile = tv[varb];
      /* sugar cane: a grown cell in a column draws its bottom, middle or top piece; alone it stays whole.
         A cane above joins once it has stalks, so a fresh sprout on top does not cut the crown off under it. */
      if (blockId === B.SUGAR_CANE && !(varb & 7)) {
        const va = gb(x, y + 1, z);
        const up = (va & 255) === B.SUGAR_CANE && ((va >> 8) & 7) <= CANE_JOIN_LEFT;
        const dn = (gb(x, y - 1, z) & 255) === B.SUGAR_CANE;
        if (up || dn) tile = up && dn ? T.SUGAR_CANE_MIDDLE : up ? T.SUGAR_CANE_BOTTOM : T.SUGAR_CANE_TOP;
      }
      /* Lit by its OWN cell as well as the one above. The cell above alone reads as 0
         wherever a plant grows under a ceiling, so a mushroom in a low tunnel took the darkness of
         the rock over it even beside a torch. Per nibble: sky and torchlight each take the brighter. */
      const la = gl(x, y + 1, z), lo = gl(x, y, z);
      const lite = litMax(la, lo);
      const sh = 210;
      quad(1,[x,y,z+1],[x+1,y,z],[x+1,y+1,z],[x,y+1,z+1], [0,0],[1,0],[1,1],[0,1],tile,sh,lite);
      quad(1,[x,y+1,z+1],[x+1,y+1,z],[x+1,y,z],[x,y,z+1], [0,1],[1,1],[1,0],[0,0],tile,sh,lite);
      quad(1,[x+1,y,z+1],[x,y,z],[x,y+1,z],[x+1,y+1,z+1], [0,0],[1,0],[1,1],[0,1],tile,sh,lite);
      quad(1,[x+1,y+1,z+1],[x,y+1,z],[x,y,z],[x+1,y,z+1], [0,1],[1,1],[1,0],[0,0],tile,sh,lite);
    }
    for (let y = 1; y < Math.min(CY - 1, yCap); y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          const bid = val & 255;
          if (!lod && PROPS[bid] && PROPS[bid].model === 'cross') {   // a far chunk draws no plants or torches
            if (PROPS[bid].torch) emitTorch(x, y, z, (val >> 8) & 255, bid);   // a stick, not a billboard (every torch)
            else if (PROPS[bid].shroom != null) emitShroom(x, y, z, PROPS[bid].shroom, (val >> 8) & 255);   // a model, grown so far
            else emitCross(x, y, z, bid, (val >> 8) & 255);
          }
        }
});
