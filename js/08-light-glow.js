'use strict';
/* voxiGrof — block light: glowstone flood-fill */

/* ================================================================================================
   BLOCK LIGHT — flood-fill from glowstone, respecting opaque walls. Light levels 0..15 live in a
   per-chunk Uint8 array; the mesher bakes each face's level from the transparent cell it faces.
   Propagation runs on the main thread (glowstones are rare, player-placed, tracked in glowLights),
   crossing chunk borders via getBlock/getLightWorld, and marks touched chunks dirty to re-mesh.
   ================================================================================================ */
function chunkLightArr(c) { return c.light || (c.light = new Uint8Array(CHUNK_X * CHUNK_Y * CHUNK_Z)); }
/* Light COLOUR (0.834): a cell's byte is its level (bits 0-4, up to the 20 of a glow dust block) and LIGHT_COLD_BIT when
   that level came from a cold source (`coldLight` in PROPS: crystal torch, glowcrystal block, glow vine). The flood
   carries it, the brightest light wins a cell and its colour with it; the mesh packing (11) hands it to the shader. */
const LIGHT_LEVEL_MASK = 31, LIGHT_COLD_BIT = 0x80;
const lightColdOf = (val) => (PROPS[val & 255]?.coldLight ? LIGHT_COLD_BIT : 0);
function getLightWorld(x, y, z) {
  if (y < 0 || y > 199) return 0;
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!c || !c.light) return 0;
  /* A light brighter than 15 (the glowcrystal block's 18) reaches further, but every reader works in 0..15: capped
     here, since 16-18 used to spill into the sky nibble and come out BLACK next to the light (0.8094). */
  return Math.min(15, c.light[(x & 15) + ((z & 15) << 4) + (y << 8)] & LIGHT_LEVEL_MASK);
}
// is the block light at (x, y, z) a cold (blue) one? (0.834)
function lightColdWorld(x, y, z) {
  if (y < 0 || y > 199) return false;
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  return !!(c && c.light && (c.light[(x & 15) + ((z & 15) << 4) + (y << 8)] & LIGHT_COLD_BIT));
}
function setLightWorld(x, y, z, val) {
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  if (!c || !c.data) return;
  chunkLightArr(c)[(x & 15) + ((z & 15) << 4) + (y << 8)] = val;
}
const LIGHT_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
/* How far any light can reach (0.8094): the brightest emitter, not GLOW_LEVEL — the glowcrystal block's 18 lit
   cells past the 14-block box relight() clears, and they kept stale light when it was broken. */
const LIGHT_REACH = Math.max(GLOW_LEVEL, ...Array.from(PROPS, p => (p && p.light) || 0));   // Array.from: PROPS has gaps
// effective light emission of a raw voxel value — variant-aware (lit furnace glows, unlit doesn't)
const FURNACE_GLOW = 5;
/* Which block IDs can ever emit. Used as a cheap pre-filter in front of blockLightOf on the
   full-chunk scan at load — see the note there. The furnace is included unconditionally because
   whether it glows depends on its variant, which this table cannot see. */
const EMITTER_ID = new Uint8Array(256);
for (let id = 0; id < 256; id++) if (PROPS[id] && (PROPS[id].light > 0 || PROPS[id].lightByVar)) EMITTER_ID[id] = 1;
EMITTER_ID[B.FURNACE] = 1;

function blockLightOf(val) {
  const id = val & 255;
  if (id === B.FURNACE) return ((val >> 8) & V.FURNACE_ON) ? FURNACE_GLOW : 0;   // lit bit (facing bits below it)
  const p = PROPS[id];
  if (p?.lightByVar) return p.lightByVar[(val >> 8) & 7] || 0;   // by stage: the yellow berry bush as it ripens (0.827)
  return p?.light || 0;
}
// per-position emission: read the block's own light level (torch 10, glowstone 14, furnace 5...)
const glowLevelAt = (gx, gy, gz) => blockLightOf(getBlock(gx, gy, gz)) || GLOW_LEVEL;
// a placed emitter as a flood source, [x, y, z, level, colour bit] (the colour 0.834)
const glowSrcAt = (gx, gy, gz) => {
  const v = getBlock(gx, gy, gz);
  return [gx, gy, gz, blockLightOf(v) || GLOW_LEVEL, lightColdOf(v)];
};

/* Virtual held-light sources — one slot per split-screen player (0.72), each null or
   [x, y, z, level]. Every consumer treats them exactly like placed emitters; the only reason they
   are not in `glowLights` is that they move every block step and are diffed rather than added. */
// held-light sources: slots 0-3 the split-screen players, 4-7 villagers' torches (0.8242, NPC_LIGHT_SLOT0 in 28-entities.js)
const _plyGlows = new Array(8).fill(null);
const _plyGlowSources = (out) => { for (const g of _plyGlows) if (g) out.push(g); return out; };

/* Perf gate: only light sources inside the SIMULATION radius propagate. Far sources are skipped —
   no BFS, no chunk dirtying — and their chunks keep whatever light they last computed.

   This used to be `viewDist >> 1`, an ad-hoc ring unrelated to anything else, and it was quietly
   wrong in both directions: at render distance 32 it flooded light across 16 chunks of terrain
   nobody was near, and at render distance 8 it was only 4 chunks, so a structure stamped 5 chunks
   out had its torches registered as emitters and then never lit — the unlit supply crate. Tying
   it to simDist() makes lighting agree with every other simulated system, and the sim-wake pass
   (22-main-loop.js) re-lights each chunk as it enters the radius, so nothing stays dark. */
function _lightSrcActive(sx, sz) {
  return inSimRangeChunk(Math.floor(sx / 16), Math.floor(sz / 16));
}

// BFS-relax light from a source; level defaults to GLOW_LEVEL for placed glowstone.
// Skips unloaded chunks entirely — without a visited mark there the flood revisits cells
// endlessly (queue blowup = the save-load lag near placed lights); relightForChunk pours
// light into those chunks once they load, so nothing is missed.
function propagateLight(gx, gy, gz, level = GLOW_LEVEL) {
  propagateLightMany([[gx, gy, gz, level]]);
}
/* Every source in ONE flood (0.8196). Relighting beside a lava lake meant thousands of sources, and flooding them
   one by one visited the same cells thousands of times: one relight took 300 ms. Here each source seeds a bucket
   by level, the buckets are worked from the brightest down, and a cell is only ever lit at its highest level, so
   each cell is expanded once however many sources reach it. `srcs`: [[x, y, z, level, colour bit], ...]. The colour
   (0.834, LIGHT_COLD_BIT) rides along with each cell, so a cell takes the colour of the brightest light reaching it. */
function propagateLightMany(srcs) {
  if (!srcs.length) return;
  const B = [];                          // B[lv]: flat x,y,z,colour of cells whose light leaves them at lv
  let top = 0;
  for (const s of srcs) {
    const lv = s[3] + 1;                 // seed one above so neighbours get the source's level
    (B[lv] || (B[lv] = [])).push(s[0], s[1], s[2], s[4] || 0);
    if (lv > top) top = lv;
  }
  let ccx = 1e9, ccz = 1e9, cData = null, cLight = null;   // cached chunk arrays
  for (let lv = top; lv >= 2; lv--) {
    const q = B[lv];
    if (!q) continue;
    const nl = lv - 1;
    for (let h = 0; h < q.length; h += 4) {
      const x = q[h], y = q[h + 1], z = q[h + 2], cb = q[h + 3];
      for (const d of LIGHT_DIRS) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (ny < 0 || ny > 199) continue;
        const kx = Math.floor(nx / 16), kz = Math.floor(nz / 16);
        if (kx !== ccx || kz !== ccz) {
          ccx = kx; ccz = kz;
          const c = getChunk(kx, kz);
          cData = c && c.data ? c.data : null;
          cLight = cData ? chunkLightArr(c) : null;
        }
        if (!cData) continue;             // unloaded: relightForChunk handles it on load
        const i = (nx & 15) + ((nz & 15) << 4) + (ny << 8);
        if (CORE.opaqueVal(cData[i])) continue;       // by value: chiseled shapes let light through (0.783)
        if ((cLight[i] & LIGHT_LEVEL_MASK) >= nl) continue;
        cLight[i] = nl | cb;
        const out = nl - CORE.lightDim(cData[i]);     // passes on less out of a shaped cell (0.819)
        if (out >= 2) (B[out] || (B[out] = [])).push(nx, ny, nz, cb);
      }
    }
    B[lv] = null;
  }
}
// zero block light in a box, a chunk's row at a time (0.8196; was one lookup per cell). No light array: already dark.
function _clearLightBox(x0, y0, z0, x1, y1, z1) {
  for (let cz = Math.floor(z0 / 16); cz <= Math.floor(z1 / 16); cz++)
    for (let cx = Math.floor(x0 / 16); cx <= Math.floor(x1 / 16); cx++) {
      const c = getChunk(cx, cz);
      if (!c || !c.data || !c.light) continue;
      const L = c.light;
      const lx0 = Math.max(0, x0 - cx * 16), lx1 = Math.min(15, x1 - cx * 16);
      const lz0 = Math.max(0, z0 - cz * 16), lz1 = Math.min(15, z1 - cz * 16);
      for (let y = y0; y <= y1; y++)
        for (let lz = lz0; lz <= lz1; lz++) { const base = (lz << 4) + (y << 8); L.fill(0, base + lx0, base + lx1 + 1); }
    }
}

// recompute block light in a bounded box around a change, then re-mesh the chunks it touches.
// x2, y2, z2 (0.8193): the far corner of a whole area of changes, relit once for all of them
function relight(x, y, z, x2 = x, y2 = y, z2 = z) {
  const R = LIGHT_REACH;
  const near = [];
  const bx0 = Math.min(x, x2), bx1 = Math.max(x, x2), by0 = Math.min(y, y2), by1 = Math.max(y, y2), bz0 = Math.min(z, z2), bz1 = Math.max(z, z2);
  const cxm = (bx0 + bx1) >> 1, czm = (bz0 + bz1) >> 1, ext = Math.max(bx1 - bx0, bz1 - bz0);
  forEachGlowNear(cxm, czm, 2 * R + ext, (gx, gy, gz) => {
    if (gx < bx0 - 2 * R || gx > bx1 + 2 * R || gy < by0 - 2 * R || gy > by1 + 2 * R || gz < bz0 - 2 * R || gz > bz1 + 2 * R) return;
    if (!_lightSrcActive(gx, gz)) return;
    near.push(glowSrcAt(gx, gy, gz));
  });
  for (const g of _plyGlows) {
    if (!g) continue;
    if (g[0] >= bx0 - 2 * R && g[0] <= bx1 + 2 * R && g[1] >= by0 - 2 * R && g[1] <= by1 + 2 * R && g[2] >= bz0 - 2 * R && g[2] <= bz1 + 2 * R) near.push(g);
  }
  let x0 = bx0 - R, x1 = bx1 + R, y0 = by0 - R, y1 = by1 + R, z0 = bz0 - R, z1 = bz1 + R;
  for (const g of near) { x0 = Math.min(x0, g[0]-R); x1 = Math.max(x1, g[0]+R); y0 = Math.min(y0, g[1]-R); y1 = Math.max(y1, g[1]+R); z0 = Math.min(z0, g[2]-R); z1 = Math.max(z1, g[2]+R); }
  y0 = Math.max(0, y0); y1 = Math.min(199, y1);
  _clearLightBox(x0, y0, z0, x1, y1, z1);
  propagateLightMany(near);                // all of them in one flood (0.8196)
  for (let ccz = Math.floor(z0/16); ccz <= Math.floor(z1/16); ccz++)
    for (let ccx = Math.floor(x0/16); ccx <= Math.floor(x1/16); ccx++) {
      const c = getChunk(ccx, ccz); if (c && c.data) markDirty(c);
    }
}

// Update one player's virtual held-light source (`slot` is the split-screen player index).
// Call when that player moves a block or changes held item. level=0 clears their light.
// cold (0.834): a cold light in the hand (the crystal torch) lights blue
function updatePlayerLight(slot, nx, ny, nz, level, cold = false) {
  const old = _plyGlows[slot];
  const now = level > 0 ? [nx, ny, nz, level, cold ? LIGHT_COLD_BIT : 0] : null;
  _plyGlows[slot] = now;
  if (!old && !now) return;

  const R = LIGHT_REACH;
  // guard: if old and new are far apart (world reset), skip old in the bounding box
  const skipOld = old && (Math.abs(old[0]-nx) > 2*R || Math.abs(old[1]-ny) > 2*R || Math.abs(old[2]-nz) > 2*R);

  const cx = now ? nx : old[0], cy = now ? ny : old[1], cz = now ? nz : old[2];
  // sources to re-propagate: placed glowLights + EVERY player's light (this one's old position is
  // not a source — it is what the clear below is for, but another player standing there is).
  const sources = [];
  forEachGlowNear(cx, cz, 2 * R, (gx, gy, gz) => {
    if (Math.abs(gx-cx)>2*R || Math.abs(gy-cy)>2*R || Math.abs(gz-cz)>2*R) return;
    if (!_lightSrcActive(gx, gz)) return;
    sources.push(glowSrcAt(gx, gy, gz));
  });
  _plyGlowSources(sources);

  // bbox: cover new position + old position so old light gets cleared
  let x0=cx-R, x1=cx+R, y0=cy-R, y1=cy+R, z0=cz-R, z1=cz+R;
  if (!skipOld && old) { x0=Math.min(x0,old[0]-R); x1=Math.max(x1,old[0]+R); y0=Math.min(y0,old[1]-R); y1=Math.max(y1,old[1]+R); z0=Math.min(z0,old[2]-R); z1=Math.max(z1,old[2]+R); }
  for (const g of sources) { x0=Math.min(x0,g[0]-R); x1=Math.max(x1,g[0]+R); y0=Math.min(y0,g[1]-R); y1=Math.max(y1,g[1]+R); z0=Math.min(z0,g[2]-R); z1=Math.max(z1,g[2]+R); }
  y0=Math.max(0,y0); y1=Math.min(199,y1);
  _clearLightBox(x0, y0, z0, x1, y1, z1);
  propagateLightMany(sources);             // 0.8196
  for (let ccz=Math.floor(z0/16);ccz<=Math.floor(z1/16);ccz++)
    for (let ccx=Math.floor(x0/16);ccx<=Math.floor(x1/16);ccx++) {
      const c=getChunk(ccx,ccz); if(c&&c.data) markDirty(c);
    }
}

// a freshly loaded chunk: pour in any glowstone within reach so it isn't dark
function relightForChunk(cx, cz) {
  // outside the simulation radius the chunk is drawn but not maintained; the sim-wake pass
  // calls this again the moment it comes back into range, so nothing is lost by skipping here
  if (!inSimRangeChunk(cx, cz)) return;
  // only emitters in the chunks this one can be reached from — not every light in the world
  const srcs = [];                         // gathered, then poured in one flood (0.8196)
  forEachGlowNear(cx * 16 + 8, cz * 16 + 8, LIGHT_REACH + 8, (gx, gy, gz) => {
    if (!_lightSrcActive(gx, gz)) return;
    const dx = Math.max(cx*16 - gx, gx - (cx*16+15), 0), dz = Math.max(cz*16 - gz, gz - (cz*16+15), 0);
    if (dx <= LIGHT_REACH && dz <= LIGHT_REACH) srcs.push(glowSrcAt(gx, gy, gz));
  });
  for (const g of _plyGlows) {
    if (!g) continue;
    const [gx, gy, gz, lv] = g;
    const dx = Math.max(cx*16 - gx, gx - (cx*16+15), 0), dz = Math.max(cz*16 - gz, gz - (cz*16+15), 0);
    if (dx <= lv && dz <= lv) srcs.push(g);                 // with its colour (0.834)
  }
  propagateLightMany(srcs);
}

// Dev test — run _dbgHeldLight() in browser console while holding a light block
window._dbgHeldLight = () => {
  const px = Math.floor(player.pos.x), py = Math.floor(player.pos.y + player.EYE), pz = Math.floor(player.pos.z);
  console.log('[held-light] _plyGlows:', _plyGlows);
  console.log('[held-light] player block:', px, py, pz);
  const rows = [];
  for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const lv = getLightWorld(px+dx, py+dy, pz+dz);
    if (lv > 0) rows.push({ dx, dy, dz, light: lv });
  }
  console.table(rows);
};

