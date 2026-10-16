'use strict';
/* chunks/fades.js: chunks fading in when they arrive and out when they leave. */

/* ---- chunks fade in and out ----
   A chunk no longer pops into view: when its first meshes arrive it is drawn in a fine dither that fills in over
   CHUNK_FADE_IN_S (uFade in 04-materials.js), and when it drops out of range its meshes thin out over
   CHUNK_FADE_OUT_S before they are thrown away. A fading mesh borrows a material of its own (pooled, sharing every
   other uniform) and gives it back when done; a remesh mid-fade carries the fade on from where it was. */
const CHUNK_FADE_IN_S = 0.6, CHUNK_FADE_OUT_S = 0.45;
const FADING = [];                          // { mesh, p, mat, t, dur, out }
const _fadeMatPool = [[], [], [], [], []];
function _fadeMat(p) {
  const pooled = _fadeMatPool[p].pop();
  if (pooled) return pooled;
  const m = MATERIALS[p].clone();
  m.uniforms = { ...sharedUniforms, uFade: { value: 0 } };
  return m;
}
function _fadeStart(mesh, p, out, t0 = 0) {
  const mat = _fadeMat(p);
  mat.uniforms.uFade.value = out ? 1 : Math.min(1, t0 / CHUNK_FADE_IN_S);
  mesh.material = mat;
  FADING.push({ mesh, p, mat, t: t0, dur: out ? CHUNK_FADE_OUT_S : CHUNK_FADE_IN_S, out });
}
function _fadeDrop(mesh) {
  const i = FADING.findIndex(f => f.mesh === mesh);
  if (i < 0) return;
  const f = FADING[i];
  FADING.splice(i, 1);
  _fadeMatPool[f.p].push(f.mat);
}
function updateChunkFades(dt) {
  for (let i = FADING.length - 1; i >= 0; i--) {
    const f = FADING[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    f.mat.uniforms.uFade.value = f.out ? 1 - k : k;
    if (k < 1) continue;
    FADING.splice(i, 1);
    if (f.out) { scene.remove(f.mesh); f.mesh.geometry.dispose(); }
    else f.mesh.material = MATERIALS[f.p];
    _fadeMatPool[f.p].push(f.mat);
  }
}
// a chunk leaving the drawn range: its meshes fade out on their own, and it will fade in again if it comes back
function retireChunkMeshes(c) {
  if (c.meshes.some(Boolean)) _regionTouch(c);   // shown again on its own before it fades
  for (let i = 0; i < 5; i++) {
    const m = c.meshes[i];
    if (!m) continue;
    _fadeDrop(m);
    _fadeStart(m, i, true);
    c.meshes[i] = null;
  }
  c.shownAt = null;
}
// a world swap: whatever is still fading out goes at once
function clearChunkFades() {
  for (const f of FADING) {
    if (f.out) { scene.remove(f.mesh); f.mesh.geometry.dispose(); } else f.mesh.material = MATERIALS[f.p];
    _fadeMatPool[f.p].push(f.mat);
  }
  FADING.length = 0;
}
