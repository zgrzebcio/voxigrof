'use strict';
/* voxiGrof — renderer / scene / camera / view distance */

/* ================================================================================================
   RENDERER / SCENE
   ================================================================================================ */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
/* Render scale (0.83852, MultithreadPlan C4): Options > Video "Render scale" draws the world at 100/85/75/50 % of the
   screen's pixels and stretches it to fit. The screen's own density is capped at 2: a hi-DPI or 4K screen drew up to 4x
   the pixels of 1080p, the biggest cost on a weak graphics card. Stars (07, uPx) follow it; particles read the viewport. */
let renderScale = clampi(parseInt(localStorage.getItem('vg_scale')) || 100, 25, 100);
const renderPixelRatio = () => Math.min(window.devicePixelRatio || 1, 2) * renderScale / 100;
function applyRenderScale(pct) {
  renderScale = clampi(parseInt(pct) || 100, 25, 100);
  try { localStorage.setItem('vg_scale', renderScale); } catch {}
  renderer.setPixelRatio(renderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (typeof starMat !== 'undefined') starMat.uniforms.uPx.value = renderPixelRatio();
}
renderer.setPixelRatio(renderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(SKY);

const scene = new THREE.Scene();
/* `camera` is the ACTIVE camera, not the only one. Split screen gives every player its own
   PerspectiveCamera and swaps this binding around each player's tick and render pass, so all the
   code written against a single camera keeps working untouched. `var` (not const/let) on purpose:
   the swapper in 36-splitscreen.js addresses these globals by name through globalThis, which only
   sees var/function bindings — lexical top-level declarations are invisible there. */
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';
// every camera ever handed out, so resize/view-distance changes reach all of them
const CAMERAS = [camera];
function newPlayerCamera() {
  const c = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, camera.near, camera.far);
  c.rotation.order = 'YXZ';
  /* Copy the VISIBILITY MASK from player one (0.725). Chunk geometry is split across render
     layers so the shadow pass can treat it differently — 0 solid, 2 cutout (leaves, glass and
     every billboard), 3 water and lava — and the sky dome, selection box and crack overlay sit on
     layer 1. 07-sky.js enables those three on `camera` once at load, which only ever reached the
     camera that existed at the time. A camera made later starts on three.js's default mask of
     layer 0 alone, so players two and up saw opaque blocks in an empty void: no leaves, no grass,
     no water, no sky. Inheriting the mask keeps one source of truth for what a player can see. */
  c.layers.mask = CAMERAS[0].layers.mask;
  CAMERAS.push(c);
  return c;
}

window.addEventListener('resize', () => {
  renderer.setPixelRatio(renderPixelRatio());   // the window may have moved to a screen of another density (0.83852)
  renderer.setSize(window.innerWidth, window.innerHeight);
  // aspect is per-viewport in split screen; the layout pass owns it
  if (typeof relayoutSplitScreen === 'function') relayoutSplitScreen();
  else for (const c of CAMERAS) { c.aspect = window.innerWidth / window.innerHeight; c.updateProjectionMatrix(); }
});

function applyViewDist(persist = true) {
  const far = drawDist() * 16;              // the fog reaches over the far ring (0.8193)
  sharedUniforms.fogNear.value = far * 0.55;
  sharedUniforms.fogFar.value  = far * 0.98;
  for (const c of CAMERAS) { c.far = far + 96; c.updateProjectionMatrix(); }
  if (persist) localStorage.setItem('vg_dist', viewDist);   // menu backdrop passes false
}

