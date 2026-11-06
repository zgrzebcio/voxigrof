'use strict';
/* js/entities/owl.js: the owl. Its numbers, its model (a tinted plumage under an untinted overlay) and poses, its own
   `step` (updateEntities hands it to updateOwl), its day and night, the cocoa bean it fetches for, where it lives, and its
   save. Flying, perching on leaves and finding a perch are every bird's: entities/birds.js.

   WILD, never tamed. It lives alone in the mild land with trees (OWL_BIOMES), its home a leaf top on a tree (`home`).
   AT NIGHT it flies home and sits there, its head swivelling, hooting now and then. BY DAY it is out: it flies from tree
   to tree within OWL.roamR of home, resting on leaves a while on each (OWL.perchEvery), and comes back at dusk. It is shy:
   a player standing within OWL.seeR (crouching: OWL.seeSneakR; a parrot's hiding shortens both, hideSightMul) or a
   tiger or a wild hound within OWL.dangerR sends it off (the night's monsters do not); a player holding cocoa beans
   makes it come down and hover in front of them instead.

   THE COCOA BEAN (owlGiveBean, from tickPlayer): crouched, E with a cocoa bean on it. It eats the bean, then flies to
   leaves at least OWL.workMin (at most OWL.workMax) blocks from where it got it, lands on the top leaf of a tree and tears
   it off (the leaf is gone), as many leaves as it takes for a stick (OWL.leavesMax at most), and flies back to that spot
   and drops all the leaves gave: sticks, apples, saplings, rolled as a leaf cut with a tool, by the giver's skills (Canopy
   Forager: blockDrop under withPlayer). It finds no leaves: it brings the bean back. What it carries is saved with it and
   dropped where it dies.

   Its model is js/models/owl.js (from textures/Entity/Animals/owl.json: bones body, head, wing_left, wing_right; talons
   and tail on the body), sheet textures/Entity/Animals/owl.png in grey, multiplied by its tint (OWL_TINTS), and
   owl_overlay.png over it untinted (eyes, beak, talons). Sounds in Sound/Mobs/Owl. All numbers are in OWL. */
const OWL = {
  hp: 25, scale: 0.6,                     // the model is drawn this big at size 1 (its JSON stands 18/16 high)
  fly: 4.6, flyFast: 7, climb: 3, turn: 4,
  fleeTime: 5,
  homeR: 5,                               // its home: a leaf top within this of where it lives
  roamR: 24, perchEvery: [6, 16],         // by day: trees within this of home, resting this long on each
  seeR: 8, seeSneakR: 3, dangerR: 8,      // a player standing, crouching, and a danger this near: it flies off
  // the cocoa bean
  workMin: 10, workMax: 26,               // the leaves it takes: this far at least from where it got the bean, at most this
  leavesMax: 12,                          // it stops at the first stick, or after this many leaves
  peckS: 0.7, eatS: 1, jobMax: 120,       // tearing one leaf; eating the bean; a fetch given up (it comes back) after this
  // where it lives
  chunkChance: 0.04, apart: 56,
};
// the mild land (level 0 of the climate ladder): its forests count their deep and hills kinds (_biomeWeight)
const OWL_BIOMES = { 'Forest': 1, 'Birch Forest': 1, 'Plains': 0.6, 'Mountains': 0.5 };
// plumage tints over the grey sheet: tawny, grey, pale barn, dark
const OWL_TINTS = [[0.82, 0.63, 0.45], [0.7, 0.7, 0.68], [0.94, 0.86, 0.72], [0.54, 0.44, 0.34]];

/* ---------------------------------- the model ---------------------------------- */
const _owlSrc = () => boxModel('owl', 'textures/Entity/Animals/owl.png');
_owlSrc();                                  // its sheet fetched from the start
const _owlOverTex = new THREE.TextureLoader().load('textures/Entity/Animals/owl_overlay.png');
_owlOverTex.colorSpace = THREE.SRGBColorSpace;
_owlOverTex.magFilter = THREE.NearestFilter;
_owlOverTex.minFilter = THREE.NearestMipmapLinearFilter;
/* An empty root at once, its bones put in the first frame the model is in (_owlDress, buildBoxRig). Every mesh of the
   tinted plumage gets a twin on the overlay sheet (same boxes, drawn over it); shadeTinted lights the overlay without
   the tint (`satMat`). `beak`: where what it carries is held. */
function buildOwl(tint = 0) {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
  const over = new THREE.MeshBasicMaterial({ map: _owlOverTex, transparent: true, alphaTest: 0.5,
                                             polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const t = OWL_TINTS[tint] || OWL_TINTS[0];
  const m = { root, mat, mats: [mat], satMat: over, tint: new THREE.Color(t[0], t[1], t[2]), body: null, beak: null, held: null };
  _owlDress(m);
  return m;
}
function _owlDress(m) {
  if (m.body) return true;
  const src = _owlSrc();
  if (!src.ready) return false;
  m.mat.map = src.tex; m.mat.needsUpdate = true;
  const { bones } = buildBoxRig(src, m.root, m.mat);
  const plumage = [];
  m.root.traverse(o => { if (o.isMesh && o.material === m.mat) plumage.push(o); });
  for (const o of plumage) { const twin = new THREE.Mesh(o.geometry, m.satMat); twin.renderOrder = 1; o.parent.add(twin); }
  m.body = bones.body; m.head = bones.head; m.wingL = bones.wing_left; m.wingR = bones.wing_right;
  m.bodyY = m.body.position.y;
  m.beak = new THREE.Group();
  m.beak.position.set(0, 2 / 16, 4.6 / 16);   // in front of the beak (8, 12, 3.4), from the head's pivot, turned half round
  m.head.add(m.beak);
  return true;
}
// what it holds in its beak: the bean it eats, the first thing it brings back, or nothing
function _owlHeldModel(m, id) {
  const key = id == null ? null : id;
  if (m.held === key) return;
  m.held = key;
  while (m.beak.children.length) m.beak.remove(m.beak.children[0]);
  if (key == null) return;
  for (const { p, geo, mat, node } of buildDropGeom(key)) {
    const o = node || new THREE.Mesh(geo, mat || MATERIALS[p]);
    o.scale.setScalar(0.2);
    m.beak.add(o);
  }
}
/* Posed once a step. Flying it tips forward by its speed, its wings out in slow beats, gliding with them still on the way
   down. Sitting, its head swivels far round and back as an owl's does; tearing at a leaf or eating, its head goes down. */
function owlPose(e, m, dt, spd) {
  const k = Math.min(1, dt * 7), now = performance.now() / 1000;
  e.flyK = (e.flyK || 0) + ((e.flying ? 1 : 0) - (e.flyK || 0)) * k;
  const f = e.flyK, B = m.body, H = m.head;
  const lean = f * (0.35 + 0.6 * Math.min(1, spd / OWL.flyFast));
  B.position.y = m.bodyY;
  B.rotation.set(lean, 0, 0);
  H.rotation.set(-lean * 0.9, 0, 0);
  e.flap = (e.flap || 0) + dt * (e.flying ? (e.vyF > 0.3 ? 14 : 9) : 0);
  const beat = e.flying ? (e.vyF < -0.4 ? 0.1 : 0.7) : 0;
  const spread = f * (1.3 + Math.sin(e.flap) * beat);
  m.wingL.rotation.set(0, 0, spread);       // the left wing's bone is on +x once turned: it opens with +z
  m.wingR.rotation.set(0, 0, -spread);
  if (e._peckT > 0 && e.job && e.job.phase === 'peck') H.rotation.x += 0.6 + Math.sin(now * 24) * 0.25;
  else if (e._eatT > 0) H.rotation.x += 0.5 + Math.sin(now * 12) * 0.12;
  else if (!e.flying) {
    if (!(now < e._swT)) { e._swT = now + 1.5 + Math.random() * 3; e._swTo = (Math.random() * 2 - 1) * 2.2; }
    e._swY = (e._swY || 0) + ((e._swTo || 0) - (e._swY || 0)) * Math.min(1, dt * 4);
    H.rotation.y = e._swY;
    B.position.y += Math.sin(now * 1.3 + e.hx) * 0.1 * PX;
  }
  const lookP = e._lookT > 0 && e._lookAt ? e._lookAt : e._watch;
  if (lookP) H.rotation.y = _entHeadTurn(e, lookP, dt, m.root.rotation.y);
  const carried = e.job && e.job.phase === 'back' && e.job.got.length ? e.job.got[0].id : null;
  _owlHeldModel(m, e._eatT > 0 ? ITEM.COCOA_BEANS : carried);
}

/* ---------------------------------- making one ---------------------------------- */
/* What one owl is made of. `opts`: size, tint, home (its home perch), job (a fetch it was on). */
function makeOwl(opts) {
  const size = _animalSize(opts);
  const tint = Number.isInteger(opts.tint) && OWL_TINTS[opts.tint] ? opts.tint : Math.floor(Math.random() * OWL_TINTS.length);
  return {
    model: buildOwl(tint), scale: size * OWL.scale,
    own: {
      size, tint, name: 'Owl',
      home: opts.home || null, job: opts.job || null,
      flying: false, flyK: 0, flap: 0, vyF: 0,
      _goal: null, _fleeGoal: null, _perchT: birdRand(OWL.perchEvery), _airT: 0, _stuckT: 0, _eatT: 0, _peckT: 0, _homeT: 0,
      _side: (Math.random() - 0.5) * 1.2,   // where before a player it hovers, turned off straight ahead
      sayT: 4 + Math.random() * 10,
    },
  };
}

/* ---------------------------------- its step ---------------------------------- */
const _OWL_TIMERS = ['fleeT', 'flailT', 'turnCd', '_lookT', '_petT', 'atkAnimT', '_eatT', '_homeT'];
function updateOwl(e, dt, tp, i) {
  const m = e.model;
  if (!_owlDress(m)) { m.root.position.set(e.x, e.y, e.z); return false; }
  for (const t of _OWL_TIMERS) if (e[t] > 0) e[t] -= dt;
  if (!(e.fleeT > 0)) e._fleeGoal = null;
  if (e.job) _owlJobTick(e, dt);
  const plan = _owlThink(e, dt);
  const spd = birdStep(e, dt, plan, i, OWL);         // flying, landing, sitting (entities/birds.js)
  if (spd < 0) return true;
  /* ---- its hoot: often at night, seldom by day, when someone is near to hear it ---- */
  e.sayT -= dt;
  if (e.sayT <= 0) {
    const night = isDarkTime();
    e.sayT = night ? 5 + Math.random() * 10 : 18 + Math.random() * 25;
    if (Math.hypot(tp.pos.x - e.x, tp.pos.z - e.z) < 24) mobSound(e, 'say', night ? 0.6 : 0.35);
  }
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  owlPose(e, m, dt, spd);
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0, 0.4);
  return false;
}

/* ---------------------------------- its mind ----------------------------------
   Returns a bird's plan { to, speed, land, face } (entities/birds.js). Order: eating, fleeing, a fetch, what frightens it,
   a player with cocoa beans, then night (home) or day (out). */
function _owlThink(e, dt) {
  const plan = { to: null, speed: OWL.fly, land: false, face: null };
  e._watch = null;
  if (e._eatT > 0) return plan;             // eating the bean where it is
  if (e.fleeT > 0) return _owlFlee(e, plan);
  if (e.job) return _owlWork(e, plan);
  const threat = _owlThreat(e);
  if (threat) {
    e.fleeT = OWL.fleeTime; e._fleeFrom = threat; e._fleeGoal = null; e._goal = null;
    return _owlFlee(e, plan);
  }
  if (e._watch) {                           // a player near with cocoa beans: it comes down and hovers before them
    const p = e._watch, a = p.yaw + e._side;
    plan.to = { x: p.pos.x - Math.sin(a) * 1.8, y: p.pos.y + 1.2, z: p.pos.z - Math.cos(a) * 1.8 };
    plan.face = p; e._goal = null;
    return plan;
  }
  return isDarkTime() ? _owlNight(e, plan) : _owlDay(e, dt, plan);
}
function _owlFlee(e, plan) {
  if (!e._fleeGoal) {
    const from = e._fleeFrom || { x: e.x - 1, z: e.z };
    let ax = e.x - from.x, az = e.z - from.z;
    const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    const cx = e.x + ax * 10, cz = e.z + az * 10;
    e._fleeGoal = birdFindPerch(cx, e.y + 2, cz, 5, { from, leaves: 'only' }) || { x: cx, y: e.y + 4, z: cz, air: true };
  }
  const g = e._fleeGoal;
  if (g.done) return plan;
  plan.to = g; plan.speed = OWL.flyFast; plan.land = !g.air;
  return plan;
}
/* what frightens it, as a wild parrot (entities/parrot.js), but not the night's monsters (it shares the night with them,
   high in its tree): null when nothing does; a player holding cocoa beans is watched */
function _owlThreat(e) {
  for (const p of PLAYERS) {
    if (!p.spawned || p.dead || p.canFly || Math.abs(p.pos.y - e.y) > 10) continue;
    const d = Math.hypot(p.pos.x - e.x, p.pos.z - e.z);
    if (_owlHeldBy(p) === ITEM.COCOA_BEANS) { if (d < OWL.seeR + 2) e._watch = p; continue; }
    if (d < (p.sneaking ? OWL.seeSneakR : OWL.seeR) * hideSightMul(p)) return { x: p.pos.x, z: p.pos.z };
  }
  const r = OWL.dangerR;
  for (const o of ENTITIES) {
    if (o === e || !(o.kind === 'tiger' || (o.kind === 'hellhound' && !o.tame))) continue;
    if (Math.abs(o.x - e.x) < r && Math.abs(o.z - e.z) < r && Math.abs(o.y - e.y) < 8 && Math.hypot(o.x - e.x, o.z - e.z) < r)
      return { x: o.x, z: o.z };
  }
  return null;
}
const _owlHeldBy = (p) => (typeof withPlayer === 'function' ? withPlayer(p, () => slotId(HOTBAR[hotbarSel])) : slotId(HOTBAR[hotbarSel]));
// its home perch: still a leaf top, else a new one found within OWL.homeR of where it lives (looked for every 3 s at most)
function _owlHome(e) {
  const h = e.home;
  if (h && birdLeafVal(getBlock(Math.floor(h.x), h.y - 1, Math.floor(h.z))) && !_entBlocked(h.x, h.y, h.z)) return h;
  if (e._homeT > 0) return null;
  e._homeT = 3;
  const n = birdFindPerch(e.hx, h ? h.y : e.y, e.hz, OWL.homeR, { leaves: 'only', tries: 20 });
  if (n) e.home = n;
  return n;
}
// night: home, and sitting there
function _owlNight(e, plan) {
  if (e._goal && (!e._goal.home || (e._goal.done && e.flying))) e._goal = null;   // a day's perch, or knocked off its home
  if (!e._goal) {
    // no leaf left at home: the night on any perch near
    const h = _owlHome(e) || (e.flying && e._homeT > 2.9 ? birdFindPerch(e.x, e.y, e.z, 4) : null);
    if (h) e._goal = { x: h.x, y: h.y, z: h.z, home: true };
  }
  if (!e._goal || e._goal.done) return plan;
  plan.to = e._goal; plan.land = true;
  return plan;
}
// day: out among the trees round home, resting on each a while
function _owlDay(e, dt, plan) {
  if (e._goal && (e._goal.home || e._goal.done)) e._goal = null;
  if (!e.flying && !e._goal) { e._perchT -= dt; if (e._perchT > 0) return plan; }
  if (!e._goal) {
    const cx = e.hx + (Math.random() * 2 - 1) * OWL.roamR * 0.7, cz = e.hz + (Math.random() * 2 - 1) * OWL.roamR * 0.7;
    const y = e.home ? e.home.y : e.y;
    e._goal = birdFindPerch(cx, y, cz, 6, { leaves: 'only' }) || { x: cx, y: y + 2 + Math.random() * 4, z: cz, air: true };
  }
  plan.to = e._goal; plan.land = !e._goal.air;
  return plan;
}

/* ---------------------------------- the cocoa bean: fetching from the leaves ----------------------------------
   e.job = { sx, sy, sz (where it got the bean), by (the giver, while in the world), byId, got [{ id, count }], n (leaves
   taken), t, phase, last (the last leaf) }. Phases: 'seek' (to the top leaf of a tree OWL.workMin..workMax from the spot)
   -> 'peck' (on it, OWL.peckS) -> 'seek' again until a stick or OWL.leavesMax -> 'back' (to the spot, everything dropped
   there: _owlDeliver). */
// From tickPlayer: E crouched with a cocoa bean on an owl. True while one is under the crosshair with all that.
function owlGiveBean(held) {
  const fresh = held && !player._owlEDown;
  player._owlEDown = !!held;
  if (!held || !player.sneaking || player.riding || player._heldFish) return false;
  const slot = HOTBAR[hotbarSel];
  if (slotId(slot) !== ITEM.COCOA_BEANS) return false;
  const e = pickEntity(ENT_INTERACT_REACH);
  if (!e || e.kind !== 'owl') return false;
  if (!fresh) return true;
  if (e.job) { toast('The owl is already fetching'); return true; }
  if (e.fleeT > 0 || e._eatT > 0) return true;
  if (!player.canFly) { slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null; saveHotbar(); buildHotbar(); updateHotbar(); }
  e.job = { sx: e.x, sy: e.y, sz: e.z, by: player, byId: player.profileId || null, got: [], n: 0, t: 0, phase: 'seek', last: null };
  e._eatT = OWL.eatS; e._goal = null; e._lookAt = player; e._lookT = OWL.eatS;
  mobSound(e, 'eat', 0.7);
  handPickSwing = true;
  toast(`The owl takes the bean: it flies to the trees (${OWL.workMin} blocks off at least) and brings what the leaves give back here`);
  return true;
}
// the player who gave the bean, if they are in the world
function _owlGiver(j) {
  if (j.by && PLAYERS.includes(j.by)) return j.by;
  j.by = PLAYERS.find(p => (p.profileId || null) === j.byId) || null;
  return j.by;
}
function _owlJobTick(e, dt) {
  const j = e.job;
  j.t += dt;
  if (j.phase !== 'back' && j.t > OWL.jobMax) { j.phase = 'back'; e._goal = null; }
  if (j.phase !== 'peck') return;
  if (e.flying) { j.phase = 'seek'; return; }   // knocked off its leaf: another one
  if (e._peckT > 0) e._peckT -= dt;
  if (e._peckT > 0 || streamBehind) return;     // land still coming in near a player waits first (chunks/stream.js)
  _owlTakeLeaf(e, j);
}
function _owlWork(e, plan) {
  const j = e.job;
  if (j.phase === 'peck') return plan;      // on its leaf, tearing at it
  if (j.phase === 'back') {
    if (!e._goal || !e._goal.back) e._goal = { x: j.sx, y: j.sy, z: j.sz, air: true, back: true };
    if (e._goal.done) { _owlDeliver(e); return plan; }
    plan.to = e._goal; plan.speed = OWL.flyFast;
    return plan;
  }
  if (e._goal && e._goal.leaf && e._goal.done) { j.phase = 'peck'; e._peckT = OWL.peckS; return plan; }
  if (!e._goal || !e._goal.leaf) {
    const L = _owlFindLeaf(e, j);
    if (!L) { j.phase = 'back'; e._goal = null; return _owlWork(e, plan); }
    e._goal = { x: L.x + 0.5, y: L.y + 1, z: L.z + 0.5, leaf: L };
  }
  plan.to = e._goal; plan.land = true;
  return plan;
}
/* The leaf it goes for next: the top leaf of a tree's column (a whole tree leaf, _isLeafVal, open air over it) between
   OWL.workMin and OWL.workMax from the spot, the nearest to the owl of those it looks at: first round the last leaf it
   took, then anywhere in that ring. { x, y, z } of the leaf block, or null. */
function _owlFindLeaf(e, j) {
  let best = null, bd = Infinity;
  const tryCol = (x, z, cy) => {
    const d0 = Math.hypot(x + 0.5 - j.sx, z + 0.5 - j.sz);
    if (d0 < OWL.workMin || d0 > OWL.workMax) return;
    let open = false;
    for (let y = Math.floor(cy) + 20, lo = Math.max(1, Math.floor(cy) - 16); y >= lo; y--) {
      const v = getBlock(x, y, z);
      if ((v & 255) === B.AIR) { open = true; continue; }
      if (!open) continue;
      if (_isLeafVal(v)) {
        const d = Math.hypot(x + 0.5 - e.x, y - e.y, z + 0.5 - e.z);
        if (d < bd) { bd = d; best = { x, y, z }; }
      }
      return;
    }
  };
  if (j.last) for (let k = 0; k < 14; k++) tryCol(j.last.x + Math.round((Math.random() * 2 - 1) * 3), j.last.z + Math.round((Math.random() * 2 - 1) * 3), j.last.y);
  if (!best)
    for (let k = 0; k < 48; k++) {
      const a = Math.random() * Math.PI * 2, r = OWL.workMin + Math.random() * (OWL.workMax - OWL.workMin);
      tryCol(Math.floor(j.sx + Math.sin(a) * r), Math.floor(j.sz + Math.cos(a) * r), j.sy);
    }
  return best;
}
// the leaf under it torn off: gone, its drops kept (rolled as a leaf cut with a tool, by the giver's skills)
function _owlTakeLeaf(e, j) {
  const L = e._goal && e._goal.leaf;
  e._goal = null; j.phase = 'seek';
  if (!L) return;
  const v = getBlock(L.x, L.y, L.z);
  if (!_isLeafVal(v)) return;               // gone meanwhile: another one
  setBlock(L.x, L.y, L.z, B.AIR);
  if (typeof fxBreak === 'function') fxBreak(L.x, L.y, L.z, v);
  playBlockSound(v & 255, 'break', L.x, L.y, L.z);
  const by = _owlGiver(j);
  const drops = by && typeof withPlayer === 'function' ? withPlayer(by, () => blockDrop(v, true)) : blockDrop(v, true);
  for (const d of drops) {
    if (!(d.count > 0)) continue;
    const g = j.got.find(x => x.id === d.id);
    if (g) g.count += d.count; else j.got.push({ id: d.id, count: d.count });
  }
  j.n++; j.last = L;
  if (j.got.some(g => g.id === ITEM.STICK) || j.n >= OWL.leavesMax) j.phase = 'back';
}
// back at the spot: everything it got let fall there (the bean again when it found no leaves), and a line to the giver
function _owlDeliver(e) {
  const j = e.job;
  e.job = null; e._goal = null;
  if (!j.n) j.got.push({ id: ITEM.COCOA_BEANS, count: 1 });
  const x = Math.floor(j.sx), y = Math.floor(j.sy), z = Math.floor(j.sz);
  for (const g of j.got) spawnDrop(g.id, x, y, z, null, 0.5, null, null, 0, g.count);
  mobSound(e, 'say', 0.6);
  const by = _owlGiver(j);
  if (!by) return;
  const what = j.got.map(g => `${g.count} ${idName(g.id).toLowerCase()}`).join(', ');
  const msg = !j.n ? 'The owl found no leaves near enough: it brought your bean back'
            : j.got.length ? `The owl brought ${what} from ${j.n} lea${j.n > 1 ? 'ves' : 'f'}` : `The owl tore ${j.n} leaves and found nothing`;
  if (typeof withPlayer === 'function') withPlayer(by, () => feedInfo(msg)); else feedInfo(msg);
}

/* ---------------------------------- where it lives ----------------------------------
   Once per new chunk: now and then one owl on a tree in the mild land (OWL_BIOMES), its home the leaf top found there;
   no tree near the spot, no owl. Never within OWL.apart of another. */
function rollOwls(cx, cz) {
  if (Math.random() >= OWL.chunkChance * ANIMAL_SPAWN_MUL) return;
  const s = _findChunkSpot(cx, cz, OWL_BIOMES);
  if (!s) return;
  for (const e of ENTITIES) if (e.kind === 'owl' && Math.abs(e.x - s.x) < OWL.apart && Math.abs(e.z - s.z) < OWL.apart) return;
  const home = birdFindPerch(s.x, s.y + 10, s.z, 6, { leaves: 'only', tries: 24 });
  if (!home) return;
  summon('owl', home.x, home.y, home.z, { hx: home.x, hz: home.z, home });
}

/* ---------------------------------- what the crosshair says ---------------------------------- */
function _owlJobText(e) {
  const j = e.job, sticks = (j.got.find(g => g.id === ITEM.STICK) || {}).count || 0;
  return j.phase === 'back' ? `bringing it back · ${j.n} lea${j.n === 1 ? 'f' : 'ves'}` : `fetching · ${j.n} lea${j.n === 1 ? 'f' : 'ves'}, ${sticks} stick${sticks === 1 ? '' : 's'}`;
}
const owlSubText = (e) => e.job ? _owlJobText(e) : '';
function owlPrompt(e) {
  const head = entityHead(e), dim = (s) => `<span style="opacity:.8;font-size:.9em">${s}</span>`;
  if (e.job) return `${head}<br>${dim(_owlJobText(e))}`;
  return `${head}<br>${dim(`(crouch + <b>E</b> with a cocoa bean: it tears leaves ${OWL.workMin}+ blocks away until a stick and brings what they give back here)`)}`;
}

/* ---------------------------------- the save ---------------------------------- */
function owlSave(e) {
  const j = e.job, h = e.home;
  return {
    sz: e.size, g: e.gender, lv: e.level, tn: e.tint,
    hm: h ? [+h.x.toFixed(2), h.y | 0, +h.z.toFixed(2)] : null,
    // a fetch under way: its spot, leaves taken, the giver, what it got [id, count, ...]
    jb: j ? [+j.sx.toFixed(2), +j.sy.toFixed(2), +j.sz.toFixed(2), j.n | 0, j.byId || null, j.got.flatMap(g => [g.id, g.count])] : null,
  };
}
function owlRestore(s) {
  const d = s.d;
  const home = Array.isArray(d.hm) && d.hm.length === 3 ? { x: +d.hm[0], y: d.hm[1] | 0, z: +d.hm[2] } : null;
  let job = null;
  if (Array.isArray(d.jb) && d.jb.length >= 6) {
    const got = [];
    const g = Array.isArray(d.jb[5]) ? d.jb[5] : [];
    for (let k = 0; k + 1 < g.length; k += 2)
      if (Number.isInteger(g[k]) && (ITEM_PROPS[g[k]] || PROPS[g[k]]) && g[k + 1] > 0) got.push({ id: g[k], count: g[k + 1] | 0 });
    job = { sx: +d.jb[0], sy: +d.jb[1], sz: +d.jb[2], n: d.jb[3] | 0, byId: d.jb[4], by: null, got, t: 0, last: null,
            phase: got.some(x => x.id === ITEM.STICK) || (d.jb[3] | 0) >= OWL.leavesMax ? 'back' : 'seek' };
  }
  return summon('owl', s.x, s.y, s.z, { hp: s.hp, size: d.sz, gender: d.g, level: d.lv, tint: d.tn, home, job, hx: s.hx, hz: s.hz });
}

/* Its entry in the creature table (entities/mobs.js says what each line is for). Its other numbers stay in OWL. */
defineMob('owl', {
  name: 'Owl', group: 'animal', step: updateOwl, passive: true,
  hp: OWL.hp, box: [0.22, 0.68], sized: true,
  walk: 1, flee: OWL.flyFast, fleeTime: OWL.fleeTime,
  fallSafe: 99, foot: 'small',                         // it flies: a fall never hurts it
  // a silent flier: no wing sound; its soft step when it lands
  sounds: { say: { key: 'owlSay' }, hurt: { key: 'owlHurt' }, eat: { key: 'owlEat', gain: 0.8 }, land: { key: 'owlWalk', gain: 0.6 } },
  make: makeOwl, gendered: true, build: (look) => buildOwl(look && look.tint),
  roll: rollOwls,                                      // its own rule: one alone on a tree in the mild land
  save: owlSave, load: owlRestore,
  prompt: owlPrompt, subText: owlSubText,
  // feathers, and what it was bringing back
  loot: (e, pop, first) => { first(ITEM.FEATHER, LOOT.owlFeather); if (e.job) for (const g of e.job.got) pop(g.id, g.count); },
});
