'use strict';
/* biomes/gen-savanna.js: the Savanna's termite hills, put down by the tree loop (woods/gen-tree-loop.js) in the cells
   it leaves without an acacia.
   A part of genChunk's body (worldgen/gen-chunk.js). The hill is one block id, B.TERMITE_HILL, whose variant says
   which cell of which hill it is (blocks/torch-blocks.js); the page draws it and keeps its termites
   (blocks/termite-hill.js). */

corePart('gen.chunk', function () {
      /* A termite hill (rev 28): small (one cell) or, one time in three where the ground is near level, big (2 x 2 wide and 3 tall,
         its north-west foot cell the hill's own place). Variant 0 a small one; 1 + dx + dz * 2 + dy * 4 a cell of a big
         one, dx dz dy its place from the foot cell. Plants are not grown yet here (worldgen/ground-plants.js comes
         after), so its cells are still air, and the plants then keep off them. */
      const HILL_CHANCE = 0.035, HILL_BIG = 0.35;     // about one hill in three chunks; a third of them big
      function termiteHill(tx, tz, wx, wz, h, gcx, gcz) {
        let big = hash2(gcx * 47 + 9, gcz * 43 - 21) < HILL_BIG;
        const low = [];                                              // its columns a block under the foot's: filled up
        if (big)
          for (const [ox, oz] of [[1, 0], [0, 1], [1, 1]]) {
            const tn = terrainInfo(wx + ox, wz + oz);
            // on near-level ground (a block up or down), all four columns dry; else a small one stands there
            if (Math.abs(tn.h - h) > 1 || tn.h < tn.wl + 1) { big = false; break; }
            if (tn.h < h) low.push([ox, oz]);
          }
        if (!big) { put(tx, h + 1, tz, B.TERMITE_HILL, true); return; }
        for (const [ox, oz] of low) put(tx + ox, h, tz + oz, B.DIRT, true);   // a full block under every foot
        for (let dy = 0; dy < 3; dy++)
          for (let dz = 0; dz < 2; dz++)
            for (let dx = 0; dx < 2; dx++) put(tx + dx, h + 1 + dy, tz + dz, B.TERMITE_HILL | ((1 + dx + dz * 2 + dy * 4) << 8), true);
      }
      /* The big Savanna's hills (rev 30, SAV2): 60% fewer than the tree loop's, and apart. At most one in each HILL_CELL
         square of the world, somewhere in its middle (HILL_EDGE from its sides), so two stand at least 13 blocks apart;
         never within 4 of an acacia's trunk (the tree loop's own rolls, read again). Called after the tree loop. */
      const HILL_CELL = 32, HILL_EDGE = 6, HILL_CELL_CHANCE = 0.57;
      function termiteHillPass() {
        for (let hz = Math.floor((cz * 16 - 2) / HILL_CELL); hz <= Math.floor((cz * 16 + 17) / HILL_CELL); hz++)
          for (let hx = Math.floor((cx * 16 - 2) / HILL_CELL); hx <= Math.floor((cx * 16 + 17) / HILL_CELL); hx++) {
            if (hash2(hx * 173 + 41, hz * 151 - 37) >= HILL_CELL_CHANCE) continue;
            const span = HILL_CELL - 2 * HILL_EDGE;
            const wx = hx * HILL_CELL + HILL_EDGE + ((hash2(hx * 29 - 3, hz * 31 + 7) * span) | 0);
            const wz = hz * HILL_CELL + HILL_EDGE + ((hash2(hx * 37 + 11, hz * 43 - 5) * span) | 0);
            if (wx < cx * 16 - 2 || wx > cx * 16 + 15 || wz < cz * 16 - 2 || wz > cz * 16 + 15) continue;
            const ti = terrainInfo(wx, wz), h = ti.h;
            if (!(ti.fSav > 0.5) || h <= WATER_LEVEL + 1 || h < ti.wl + 1 || h > CY - 14) continue;
            let tree = false;
            for (let gz = Math.floor((wz - 7) / 5); gz <= Math.floor((wz + 7) / 5) && !tree; gz++)
              for (let gx = Math.floor((wx - 7) / 5); gx <= Math.floor((wx + 7) / 5); gx++) {
                const r = hash2(gx, gz);
                if (r >= 0.09) continue;
                const tx2 = gx * 5 + 1 + (((r * 977) | 0) % 3), tz2 = gz * 5 + 1 + (((r * 7919) | 0) % 3);
                if (Math.abs(tx2 - wx) <= 4 && Math.abs(tz2 - wz) <= 4) { tree = true; break; }
              }
            if (tree) continue;
            termiteHill(wx - cx * 16, wz - cz * 16, wx, wz, h, hx * 7 + 3, hz * 7 - 3);
          }
      }
});
