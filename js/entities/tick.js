'use strict';
/* entities/tick.js: creatures in the fixed tick. They step 20 times a second and are drawn between their last two
   steps; far calm ones step less often; ones out of view are not posed. */

/* ---- creatures in the fixed tick ----
   A creature's AI and body step SIM_HZ times a second (updateEntitiesTick, from simTick). Its model — the root and every
   part under it: legs, arms, head, a held item — is posed by that step as before, and its pose (position, turn, scale
   of each part) is kept after each tick. Each frame the model is drawn between its last two poses by how far the next
   tick is (alpha), so it moves smoothly at any frame rate, a tick (1/20 s) behind. Before a tick the last pose is put
   back, so anything that eases from the model's own state starts from where the tick left it. A horse with a rider
   steps per frame instead (its rider's camera sits on it). */
const ENT_LERP_N = 9;                                  // per part: position, rotation, scale
function _entLerpNodes(e) {
  const out = [];
  e.model.root.traverse(o => { if (!o.userData || !o.userData.noLerp) out.push(o); });
  return out;
}
function _entLerpRead(nodes) {
  const a = new Float32Array(nodes.length * ENT_LERP_N);
  nodes.forEach((o, k) => {
    const j = k * ENT_LERP_N;
    a[j] = o.position.x; a[j + 1] = o.position.y; a[j + 2] = o.position.z;
    a[j + 3] = o.rotation.x; a[j + 4] = o.rotation.y; a[j + 5] = o.rotation.z;
    a[j + 6] = o.scale.x; a[j + 7] = o.scale.y; a[j + 8] = o.scale.z;
  });
  return a;
}
// turns the short way round
const _entLerpTurn = (a, b, t) => { let d = b - a; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2; return a + d * t; };
function _entLerpWrite(nodes, a, b, t) {
  // no closures made per part: this runs for every creature in view every frame
  for (let k = 0, j = 0; k < nodes.length; k++, j += ENT_LERP_N) {
    const o = nodes[k];
    o.position.set(a[j] + (b[j] - a[j]) * t, a[j + 1] + (b[j + 1] - a[j + 1]) * t, a[j + 2] + (b[j + 2] - a[j + 2]) * t);
    o.rotation.set(_entLerpTurn(a[j + 3], b[j + 3], t), _entLerpTurn(a[j + 4], b[j + 4], t), _entLerpTurn(a[j + 5], b[j + 5], t));
    o.scale.set(a[j + 6] + (b[j + 6] - a[j + 6]) * t, a[j + 7] + (b[j + 7] - a[j + 7]) * t, a[j + 8] + (b[j + 8] - a[j + 8]) * t);
  }
}
// before a tick: the model as the last tick left it, and that pose kept as the one to draw from
function _entLerpBegin(e) {
  const s = e._lerp;
  if (!s || !e.model) return;
  if (s.nodes.length * ENT_LERP_N === s.cur.length) _entLerpWrite(s.nodes, s.cur, s.cur, 0);
  s.prev = s.cur;
}
// after a tick: the pose it reached
function _entLerpEnd(e) {
  if (!e.model) return;
  const nodes = _entLerpNodes(e), cur = _entLerpRead(nodes), s = e._lerp;
  // a new creature, or one whose model changed shape (a held item came or went): no blend from the old pose
  const prev = s && s.cur && s.cur.length === cur.length ? s.cur : cur;
  e._lerp = { nodes, prev: s && s.prev && s.prev.length === cur.length ? s.prev : prev, cur };
}
/* Far creatures (CREATURE_FAR_SLOW). A calm creature (on the ground, not hunting, fleeing,
   hurt, burning, knocked back or rising) more than ENT_FAR_R blocks from every player thinks every ENT_FAR_EVERY-th tick,
   on its own beat (`_stg`), with the time it skipped as its dt. It is drawn between its last two steps over that many
   ticks (`_lerpSpan`/`_lerpAge`), so it still walks smoothly. Anything else steps every tick; one that stops being calm
   or comes near steps at once (the few skipped hundredths of a second are let go, so no long step is ever taken
   mid-fall or mid-shove). */
const ENT_FAR_R = 32, ENT_FAR_EVERY = 4;
// while land is waiting near a player (streamBehind, chunks/stream.js) "far" starts this near: creatures give way to it
const ENT_FAR_R_BEHIND = 12;
let _entTickN = 0;
function _entCalm(e) {
  return e.onGround && !e.vy && !isFish(e) && e.state !== 'chase' && e.state !== 'return'
    && !(e.aggroT > 0) && !(e.fleeT > 0) && !(e.hurtT > 0) && !(e.fireT > 0) && !(e.burnT > 0) && !(e.riseT > 0)
    && !e.kx && !e.kz;
}
function _entDue(e, dt) {
  e._stepDt = dt; e._span = 1;
  let far = false;
  if (CREATURE_FAR_SLOW && _entCalm(e)) {
    const tp = nearestPlayerTo(e.x, e.z), dx = tp.pos.x - e.x, dz = tp.pos.z - e.z;
    const r = streamBehind ? ENT_FAR_R_BEHIND : ENT_FAR_R;
    far = dx * dx + dz * dz > r * r;
  }
  if (!far) { e._owed = 0; return true; }
  if (e._stg == null) e._stg = (Math.random() * ENT_FAR_EVERY) | 0;
  e._owed = (e._owed || 0) + dt;
  if ((_entTickN + e._stg) % ENT_FAR_EVERY) return false;
  e._stepDt = e._owed; e._span = Math.max(1, Math.round(e._owed / dt)); e._owed = 0;
  return true;
}
const _entIsDue = (e) => !!e._due;
function updateEntitiesTick(dt) {
  if (!playing || menuScene || !anyPlayerSpawned()) return;
  _entTickN++;
  for (const e of ENTITIES) {
    e._due = !e.rider && _entDue(e, dt);
    if (e._due) _entLerpBegin(e);
  }
  updateEntities(dt, _entIsDue, false);
  for (const e of ENTITIES) {
    if (e.rider) continue;
    // stepped (or new since the last tick): its pose kept; skipped: one tick further along its long blend
    if (e._due || !e._lerp) { _entLerpEnd(e); e._lerpAge = 0; e._lerpSpan = e._due ? e._span : 1; }
    else e._lerpAge = (e._lerpAge || 0) + 1;
  }
}
/* Off screen (C3): a creature outside every seat's view (a margin of ENT_VIEW_PAD blocks round its middle) is
   not posed this frame; its pose is written again the frame it comes into view. With shadows on, one inside the shadow
   distance is still posed, since its shadow can fall into view. */
const ENT_VIEW_PAD = 3;
const _entFrustums = [], _entPV = new THREE.Matrix4(), _entSphere = new THREE.Sphere(new THREE.Vector3(), ENT_VIEW_PAD);
function _entViewFrustums() {
  let n = 0;
  for (let i = 0; i < PSTATE.length; i++) {
    const cam = i === activePlayerSlot() ? camera : PSTATE[i].g && PSTATE[i].g.camera;
    if (!cam) continue;
    cam.updateMatrixWorld();
    _entPV.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    (_entFrustums[n] || (_entFrustums[n] = new THREE.Frustum())).setFromProjectionMatrix(_entPV);
    n++;
  }
  return n;
}
function _entInView(e, nf) {
  if (!nf) return true;
  _entSphere.center.set(e.x, e.y + 0.9, e.z);
  for (let k = 0; k < nf; k++) if (_entFrustums[k].intersectsSphere(_entSphere)) return true;
  if (shadowR > 0) {                                  // its shadow may still show
    const tp = nearestPlayerTo(e.x, e.z), dx = tp.pos.x - e.x, dz = tp.pos.z - e.z;
    if (dx * dx + dz * dz <= shadowR * shadowR) return true;
  }
  return false;
}
// each frame: the ridden horse steps (and the frame's own jobs), every other creature is drawn between its ticks
function updateEntitiesFrame(dt, alpha) {
  if (!playing || menuScene || !anyPlayerSpawned()) return;
  updateEntities(dt, (e) => !!e.rider, true);
  const t = Math.max(0, Math.min(1, alpha));
  const nf = CREATURE_FAR_SLOW ? _entViewFrustums() : 0;
  for (const e of ENTITIES) {
    if (e.rider) { e._lerp = null; continue; }        // stepped this frame; a fresh pose once it is let go
    const s = e._lerp;
    if (!s || !e.model || !e.model.root.visible || s.nodes.length * ENT_LERP_N !== s.cur.length) continue;
    if (!_entInView(e, nf)) continue;
    // a far creature's step covers several ticks: drawn along it over as many
    const span = e._lerpSpan || 1;
    _entLerpWrite(s.nodes, s.prev, s.cur, span > 1 ? Math.min(1, ((e._lerpAge || 0) + t) / span) : t);
  }
}
