'use strict';
/* chunks/far-regions.js: far regions. Distant chunks' meshes merged into a few big ones to cut draw calls. Code that
   changes c.meshes outside the usual paths must call _regionTouch first. */

/* ---- far regions (FAR_REGIONS) ----
   Every drawn chunk is up to five draw calls, and most of a big render distance is the far, half-resolution (level of
   detail 2) ring: hundreds of chunks. A region is FAR_REGION x FAR_REGION chunks; once at least FAR_REGION_MIN of its
   chunks are far ones whose meshes have not changed for FAR_REGION_SETTLE seconds (so never mid-fade, never while the
   land is still arriving), their meshes are copied into one mesh per pass and the chunks' own are hidden. Anything that
   touches a member's meshes (a remesh, a level-of-detail step, fading out, unloading) first takes the region apart
   (its own meshes shown again) and it is tried again once things settle. Building waits for a quiet moment and stays
   within FAR_REGION_MS a frame, so arriving land is never slowed by it. */
const FAR_REGION = 4, FAR_REGION_MIN = 4, FAR_REGION_SETTLE = 2.5, FAR_REGION_MS = 2;
const _regions = new Map();                 // "rx,rz" -> { meshes: [5], parts: [chunk...] }
const _regionDue = new Map();               // "rx,rz" -> seconds (performance clock) when to try it
const _regionKeyOf = (c) => Math.floor(c.cx / FAR_REGION) + ',' + Math.floor(c.cz / FAR_REGION);
// a chunk's meshes are about to change: its region (if built) comes apart, and is tried again later
function _regionTouch(c) {
  if (!FAR_REGIONS) return;
  const k = _regionKeyOf(c), r = _regions.get(k);
  if (r && r.parts.includes(c)) _regionDissolve(k, r);
  _regionDue.set(k, performance.now() / 1000 + FAR_REGION_SETTLE);
}
function _regionDissolve(k, r) {
  for (const c of r.parts) for (const m of c.meshes) if (m) m.visible = true;
  for (const m of r.meshes) if (m) { scene.remove(m); m.geometry.dispose(); }
  _regions.delete(k);
}
function farRegionsClear() {
  for (const [k, r] of [..._regions]) _regionDissolve(k, r);
  _regionDue.clear();
}
function updateFarRegions() {
  if (!FAR_REGIONS || !_regionDue.size || menuScene) return;
  // only in a quiet moment: while land is arriving or chunks are waiting to mesh, that comes first
  if (genFinishQueue.length > 2 || meshResults.length > 4) return;
  const t0 = performance.now(), now = t0 / 1000;
  for (const [k, due] of _regionDue) {
    if (performance.now() - t0 > FAR_REGION_MS) break;
    if (due > now) continue;
    _regionDue.delete(k);
    if (_regions.has(k)) continue;
    const later = _regionBuild(k, now);
    if (later) _regionDue.set(k, later);
  }
}
// build region k if enough of it is settled and far; returns a time to try again, or 0
function _regionBuild(k, now) {
  const [rx, rz] = k.split(',').map(Number);
  const parts = [];
  let wait = 0;
  for (let dz = 0; dz < FAR_REGION; dz++)
    for (let dx = 0; dx < FAR_REGION; dx++) {
      const c = getChunk(rx * FAR_REGION + dx, rz * FAR_REGION + dz);
      if (!c || !c.data || c.lod !== 2 || c.meshing || c.queuedMesh || !c.meshes.some(Boolean)) continue;
      const ready = Math.max((c._meshAt || 0), (c.shownAt || 0) + CHUNK_FADE_IN_S) + FAR_REGION_SETTLE;
      if (ready > now) { wait = Math.max(wait, ready); continue; }
      if (c.meshes.some((m) => m && FADING.some((f) => f.mesh === m))) { wait = Math.max(wait, now + 1); continue; }
      parts.push(c);
    }
  if (parts.length < FAR_REGION_MIN) return wait;
  const ox = rx * FAR_REGION * 16, oz = rz * FAR_REGION * 16;
  let minY = 1e9, maxY = -1e9;
  for (const c of parts) { minY = Math.min(minY, c._minY ?? 0); maxY = Math.max(maxY, c._maxY ?? WORLD_TOP); }
  const half = FAR_REGION * 8;
  const sphere = new THREE.Sphere(new THREE.Vector3(half, (minY + maxY) / 2, half),
                                  Math.sqrt(2 * half * half + Math.pow((maxY - minY) / 2 + 1, 2)) + 1);
  const meshes = [null, null, null, null, null];
  for (let p = 0; p < 5; p++) {
    const srcs = [];
    let nv = 0, ni = 0, dark = false;
    for (const c of parts) {
      const g = c.meshes[p] && c.meshes[p].geometry;
      if (!g || !g.index) continue;
      const v = g.userData.nv != null ? g.userData.nv : g.attributes.position.count;
      const i = Math.min(g.index.count, g.drawRange.count);
      if (!v || !i) continue;
      srcs.push({ c, g, v, i });
      nv += v; ni += i;
      if (g.attributes.dark) dark = true;
    }
    if (!srcs.length) continue;
    const g0 = srcs[0].g.attributes;
    const out = {
      position: new Float32Array(nv * 3), uv: new Float32Array(nv * 2), tile: new g0.tile.array.constructor(nv),
      shade: new g0.shade.array.constructor(nv), blockLight: new g0.blockLight.array.constructor(nv),
      clim: new g0.clim.array.constructor(nv), dark: dark ? new Uint8Array(nv) : null,
    };
    const index = new Uint32Array(ni);
    let vb = 0, ib = 0;
    for (const { c, g, v, i } of srcs) {
      const A = g.attributes, px = c.cx * 16 - ox, pz = c.cz * 16 - oz;
      const P = out.position;
      P.set(A.position.array.subarray(0, v * 3), vb * 3);
      for (let q = vb * 3, e = (vb + v) * 3; q < e; q += 3) { P[q] += px; P[q + 2] += pz; }
      out.uv.set(A.uv.array.subarray(0, v * 2), vb * 2);
      for (const n of ['tile', 'shade', 'blockLight', 'clim']) out[n].set(A[n].array.subarray(0, v), vb);
      if (dark && A.dark) out.dark.set(A.dark.array.subarray(0, v), vb);
      const src = g.index.array;
      for (let q = 0; q < i; q++) index[ib + q] = src[q] + vb;
      vb += v; ib += i;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out.position, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2));
    geo.setAttribute('tile', new THREE.BufferAttribute(out.tile, 1, false));
    geo.setAttribute('shade', new THREE.BufferAttribute(out.shade, 1, true));
    geo.setAttribute('blockLight', new THREE.BufferAttribute(out.blockLight, 1, false));
    geo.setAttribute('clim', new THREE.BufferAttribute(out.clim, 1, true));
    if (out.dark) geo.setAttribute('dark', new THREE.BufferAttribute(out.dark, 1, true));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.boundingSphere = sphere.clone();
    const mesh = new THREE.Mesh(geo, MATERIALS[p]);
    mesh.renderOrder = p;
    mesh.layers.set(p === 0 ? 0 : p === 1 || p === 4 ? 2 : 3);   // as a chunk's (applyOneMesh)
    mesh.position.set(ox, 0, oz);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    meshes[p] = mesh;
  }
  for (const c of parts) for (const m of c.meshes) if (m) m.visible = false;
  _regions.set(k, { meshes, parts });
  return 0;
}
