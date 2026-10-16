'use strict';
/* chunks/mesher-finish.js: meshChunk's end. Every non-cube cell is handed to its emitter, then the passes are packed
   into the arrays the page builds meshes from.
   The last part of meshChunk's body (chunks/mesher.js). */

corePart('mesh.chunk', function () {
    for (let y = 0; y < yCap; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const val = data[x + (z << 4) + (y << 8)];
          if ((val & 255) === B.WATER) emitWater(x, y, z, val);
          else if ((val & 255) === B.LAVA) emitLava(x, y, z, val);
        }

    // pack into typed arrays (transferable)
    const out = passes.map(g => g.v === 0 ? null : ({
      pos:   new Float32Array(g.pos),
      uv:    new Float32Array(g.uv),
      tile:  new Uint16Array(g.tile),        // a texture-array layer: past 255 since 0.809
      shade: new Uint8Array(g.shade),
      lite:  new Uint16Array(g.lite),        // bit 8 the light's colour
      clim:  new Int8Array(g.clim),          // the climate colour, -127 cold .. 127 warm
      dark:  g.dark.length ? (() => { const a = new Uint8Array(g.v); a.set(g.dark.slice(0, g.v)); return a; })() : null,   // 0.835492
      index: new Uint32Array(g.index),
    }));
    return { passes: out, minY: Math.min(minY, maxY), maxY: Math.max(maxY, 2) };
});
