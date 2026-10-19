'use strict';
/* blocks/crafting-bench.js: the crafting bench and the mortar. An order placed on a station, working it with E,
   cancelling it, its floating tag and model, saving. */

/* ---------------------------------- the crafting bench ---------------------------------- */
const BENCHES = new Map();           // "x,y,z" -> { ri, units, done, t, sprite, canvas, dirty }
var activeBench = null;              // the bench whose recipe list this seat has open
const benchKey = (x, y, z) => x + ',' + y + ',' + z;
const _benchHasOrder = (b) => !!(b && (b.units.length || b.done));
function benchBusy(x, y, z) { return _benchHasOrder(BENCHES.get(benchKey(x, y, z))); }
/* Which recipe list each station opens. A mortar works exactly like a bench — one order floating
   over it, hold E to work it, tap E to take, hold the right button to cancel — only its list differs. */
const STATION_MODE = { [B.CRAFTING_BENCH]: 'advanced', [B.MORTAR]: 'mortar' };
PROPS.forEach((p, id) => { if (p && p.mortar) STATION_MODE[id] = 'mortar'; });   // its granite, marble and limestone variants
const isStation = (id) => STATION_MODE[id & 255] != null;
/* A station needs its top clear: any block or plant standing on a bench or a mortar stops it —
   it will not open, its order cannot be worked or taken, and one open in front of you closes the moment
   something is put (or falls) on it. */
const stationCovered = (x, y, z) => (getBlock(x, y + 1, z) & 255) !== B.AIR;
const STATION_COVERED_MSG = 'Clear the top of it first';
function openBench(x, y, z, mode = 'advanced') {
  if (stationCovered(x, y, z)) { feedWarn(STATION_COVERED_MSG); return; }
  activeBench = benchKey(x, y, z); toggleInventory(true, mode);
}

// a recipe chosen at a bench: one craft (or as many as affordable with Shift) goes on its order
function benchOrder(r, all, n = 1) {
  const key = activeBench;
  if (craftSpeed() <= 0) { feedWarn(_cantCraftMsg); return; }
  const ri = recipeIndex(r);
  let b = BENCHES.get(key);
  if (_benchHasOrder(b) && b.ri !== ri) {
    const cur = recipeAt(b.ri);
    feedWarn(`This bench is busy${cur ? ' with ' + idName(cur.out[0]) : ''}`);
    return;
  }
  const units = [];
  for (let k = 0, want = all ? maxCrafts(r) : n; k < want; k++) {
    const u = _takeIngredients(r);
    if (!u) break;
    units.push(u);
  }
  if (!units.length) { feedWarn('Missing ingredients'); return; }
  if (!b || b.ri !== ri) {
    if (b) _benchClear(key);
    b = { ri, units: [], done: 0, t: 0, sprite: null, canvas: null, dirty: true };
    BENCHES.set(key, b);
  }
  b.units.push(...units);
  b.dirty = true;
  toggleInventory(false);            // back to the bench itself: the order is worked there
  refreshSlotsUI();
}
// a recipe row's button: the bench's order when one is open, the personal queue otherwise
function onRecipeClick(r, all, n = 1) {
  if (craftMode !== 'basic' && activeBench) benchOrder(r, all, n);
  else queueCraft(r, all, n);
}

/* ---- how useful a recipe is ----
   The number the recipe list sorts by, lowest first. Stations top the list because everything else is
   made at one; then the things you wear and carry; then tools and weapons, ordered bow, steel, bronze,
   iron, stone, flint by the start of their icon's name (a hoe sits just under its own set); then armor, iron before leather; then
   ingredients and food; and last the blocks you build and decorate with, with pressed ore blocks below
   them — they are storage, not something you need at hand. */
const _RANK_STATION = new Set([B.CRAFTING_BENCH, B.FURNACE, B.MORTAR, B.CHEST, B.BED, B.TORCH, B.CRYSTAL_TORCH, B.LADDER, B.DOOR]);
const _RANK_TOOL_MAT = { steel: 1, bronze: 2, iron: 3, golden: 4, stone: 5, flint: 6 };
function recipeRank(r) {
  const id = r.out && r.out[0];
  if (id == null) return 60;
  if (id < 256) {
    if (_RANK_STATION.has(id)) return 0;
    if (typeof STORAGE_BLOCK_IDS !== 'undefined' && STORAGE_BLOCK_IDS.includes(id)) return 80;   // pressed ore
    return 70;                                                        // ordinary building and decoration blocks
  }
  const p = ITEM_PROPS[id];
  if (!p) return 60;
  if (p.packSlots || p.beltSlots || p.shield || p.chisel) return 5;   // backpack, belt, shield, hammer: carried gear
  if (p.ranged) return 10;                                            // the bow tops the tools
  if (p.tool) {
    const mat = Object.keys(_RANK_TOOL_MAT).find(m => p.icon && p.icon.startsWith(m));
    return 11 + (_RANK_TOOL_MAT[mat] || 7) + (p.tool === 'hoe' ? 0.5 : 0);
  }
  if (p.armor) return 30 + (p.armorMat === 'iron' ? 0 : p.armorMat === 'leather' ? 1 : p.armorMat === 'cloth' ? 1.5 : 0.5);   // cloth 0.824
  if (p.food) return 50;
  return 40;                                                          // ingredients: ingots, string, paper...
}

function _aimedBench() {
  if (!playing || invOpen || menuScene || player.canFly || player.dead || player.riding) return null;
  const hit = currentRay();
  return hit && isStation(hit.id) ? hit : null;          // a bench or a mortar
}
/* Once per frame per seat, from the frame loop. `eHeld` is E (or the pad's North button); `rmbHeld` is
   the raw right button, read even while the bench has the controls locked. */
function updateBenchWork(dt, eHeld, rmbHeld) {
  // the recipe list of a station that has just been covered closes
  if (invOpen && activeBench) {
    const [ax, ay, az] = activeBench.split(',').map(Number);
    if (stationCovered(ax, ay, az)) { toggleInventory(false); feedWarn(STATION_COVERED_MSG); }
  }
  const hit = _aimedBench();
  const key = hit ? benchKey(hit.x, hit.y, hit.z) : null;
  const b = key ? BENCHES.get(key) : null;
  const r = b ? recipeAt(b.ri) : null;
  const covered = !!hit && stationCovered(hit.x, hit.y, hit.z);   // nothing is worked or taken under a block
  player._benchAim = !!hit;
  // a mortar saved mid-grind comes back without its pestle drawn: put it back the moment it is looked at
  if (hit && PROPS[hit.id & 255]?.mortar && !(b && b.pestle) && ((getBlock(hit.x, hit.y, hit.z) >> 8) & 255))
    setBlock(hit.x, hit.y, hit.z, matKey(getBlock(hit.x, hit.y, hit.z)));   // its look (a granite bowl) kept
  const eDown = eHeld && !player._benchE;
  player._benchE = eHeld;
  if (!eHeld) player._benchNeedRelease = false;

  if (covered && eDown && _benchHasOrder(b)) feedWarn(STATION_COVERED_MSG);
  // a tap of E takes whatever is finished
  if (b && eDown && b.done > 0 && !covered) {
    if (r) _giveItems(r.out[0], r.out[1] * b.done + skillSpareParts(r.out[0], b.done), 'crafted', true,
                      skillCraftMeta(r.out[0]));   // Fine Work, Spare Parts
    b.done = 0; b.dirty = true;
    if (!b.units.length) _benchClear(key);
    refreshSlotsUI();
  }
  // holding E works the order, one craft at a time
  const wants = !!(r && b.units.length && eHeld && !player._benchNeedRelease && !covered);
  if (wants && craftSpeed() <= 0 && eDown) feedWarn(_cantCraftMsg);
  if (!(wants && craftSpeed() > 0)) player._benchHoldT = 0;   // the work stopped: Precise Focus starts over
  if (wants && craftSpeed() > 0) {
    player._benchWork = key;
    player._benchHoldT = (player._benchHoldT || 0) + dt;
    // the speed it is worked at right now: the crafting speed stat, times Precise Focus; shown on its tag
    const sp = craftSpeed() * benchFocusMul(), spPc = Math.round(sp * 100);
    if (spPc !== b.speedPc) { b.speedPc = spPc; b.dirty = true; }
    b.t += dt * sp;
    if (b.t >= r.timeToCraft) {
      b.t = 0;
      b.units.shift();
      b.done++;
      addXP(r.xpToGive || 0);
      if (typeof fxCraftPuff === 'function') fxCraftPuff(hit.x + 0.5, hit.y + 1.05, hit.z + 0.5, r.out[0]);   // one made
      b.dirty = true;
      // the last of the order made while you held E: the feed says so (put back in 0.8443, it was lost to a save)
      // ...in a gold row of its own with its own chime since 0.8444 (feedCraft, ui/feed.js)
      if (!b.units.length) {
        const msg = `Crafting done: ${r.out[1] * b.done} ${idName(r.out[0])} ready, tap E to take`;
        if (typeof feedCraft === 'function') feedCraft(msg); else if (typeof feedInfo === 'function') feedInfo(msg);
      }
    }
    const step = Math.floor(b.t / r.timeToCraft * 40);   // redraw the floating bar in 40 steps, not every frame
    if (step !== b._step) { b._step = step; b.dirty = true; }
  } else if (player._benchWork) {
    interruptBenchWork(false);                           // let go, looked away, or nothing left to make
  }

  // the right button on a busy bench: a short tap opens it, a long hold cancels its order
  if (_benchHasOrder(b) && rmbHeld) {
    if (player._benchRmbKey !== key) { player._benchRmbKey = key; player._benchRmbT = 0; player._benchRmbDone = false; }
    player._benchRmbT = (player._benchRmbT || 0) + dt;
    if (player._benchRmbT >= BENCH_CANCEL_HOLD && !player._benchRmbDone) {
      player._benchRmbDone = true;
      cancelBench(key);
    }
  } else if (!rmbHeld) {
    const t = player._benchRmbT || 0;
    if (t > 0 && t < BENCH_TAP_TIME && !player._benchRmbDone && hit && player._benchRmbKey === key) openBench(hit.x, hit.y, hit.z, STATION_MODE[hit.id & 255]);
    player._benchRmbT = 0; player._benchRmbDone = false; player._benchRmbKey = null;
  }
}
/* Stop working a bench. The craft in progress is lost — the order, and what is already finished, are
   not. After a HIT (`needRelease`) E has to be let go before it counts again, so a mob cannot be
   out-crafted by simply holding the key through the blow. Called from player/hazards.js on damage. */
function interruptBenchWork(needRelease = true) {
  if (!player._benchWork) return;
  /* The craft in progress is KEPT since 0.7992: letting go of E, walking off or leaving the world pauses
     it where it stands, and it carries on from there when you come back. Only a cancelled order throws
     the progress away, along with the ingredients it hands back. */
  const b = BENCHES.get(player._benchWork);
  if (b) { b.dirty = true; b.speedPc = 0; }            // nobody at it: its tag reads 0%
  player._benchWork = false;
  if (needRelease) player._benchNeedRelease = true;
}
// everything on a bench's order, made and unmade, dropped at that bench
function _benchSpill(b, x, y, z) {
  const r = recipeAt(b.ri);
  // one stack each
  if (r && b.done > 0) spawnDrop(r.out[0], x, y, z, null, undefined, null, null, 0, r.out[1] * b.done);
  for (const u of b.units) for (const [id, c] of u) spawnDrop(id, x, y, z, null, undefined, null, null, 0, c);
}
function _benchClear(key) {
  const b = BENCHES.get(key);
  if (b && b.sprite) { scene.remove(b.sprite); b.sprite.material.map?.dispose(); b.sprite.material.dispose(); }
  if (b && b.pestle) _stopPestle(key, b);             // a mortar's pestle goes back in its bowl
  BENCHES.delete(key);
  for (const p of PLAYERS) if (p._benchWork === key) p._benchWork = false;
}
function cancelBench(key) {
  const b = BENCHES.get(key);
  if (!_benchHasOrder(b)) return;
  const [x, y, z] = key.split(',').map(Number);
  _benchSpill(b, x, y + 1, z);
  _benchClear(key);
  feedInfo('Crafting cancelled: everything dropped at the bench');
}
// the bench block went away (chunks/chunks.js): its order spills where it stood
function benchBroken(x, y, z) {
  const key = benchKey(x, y, z), b = BENCHES.get(key);
  if (!b) return;
  if (!menuScene) _benchSpill(b, x, y, z);
  _benchClear(key);
  // a seat with this bench's recipe list open loses it: activeBench is per seat, swapped with the HUD
  if (activeBench === key) activeBench = null;
  if (typeof forEachPlayerState === 'function') forEachPlayerState((g) => { if (g.activeBench === key) g.activeBench = null; });
}
function clearBenches() { for (const k of [...BENCHES.keys()]) _benchClear(k); }
function serializeBenches() {
  const out = [];
  // ...including how far the craft in progress got
  for (const [k, b] of BENCHES) if (_benchHasOrder(b)) out.push([k, b.ri, b.done, b.units, +(b.t || 0).toFixed(2)]);
  return out;
}
function restoreBenches(list) {
  if (!Array.isArray(list)) return;
  for (const rec of list) {
    if (!Array.isArray(rec) || typeof rec[0] !== 'string' || !Array.isArray(rec[3])) continue;
    const r = recipeAt(+rec[1] || 0);
    const b = { ri: +rec[1] || 0, done: Math.max(0, rec[2] | 0), units: rec[3].filter(_validUnit),
                // a save from before 0.7992 has no progress on it, which reads as a craft not yet begun
                t: Math.max(0, Math.min(r ? r.timeToCraft : 0, +rec[4] || 0)), sprite: null, canvas: null, dirty: true };
    if (_benchHasOrder(b)) BENCHES.set(rec[0], b);
  }
}

/* The order over a bench: the output's icon, how many are still to make, a green count of what is ready
   to take, and the progress of the one being made. A sprite, so it faces you from every side. Drawn
   to its own small canvas and only redrawn when something on it changed. */
const BENCH_TAG_W = 128, BENCH_TAG_H = 150;
const _benchIcons = new Map();       // item id -> loaded Image of its 3D icon
function _benchIcon(id) {
  let im = _benchIcons.get(id);
  if (!im) {
    const src = renderBlockIcon(id);
    if (!src) return null;
    im = new Image();
    im.src = src;
    _benchIcons.set(id, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
function _drawBenchTag(b) {
  const r = recipeAt(b.ri);
  const W = BENCH_TAG_W, H = BENCH_TAG_H;
  if (!b.canvas) { b.canvas = document.createElement('canvas'); b.canvas.width = W; b.canvas.height = H; }
  const g = b.canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(12,14,24,0.8)';
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 2;
  g.beginPath();
  if (g.roundRect) g.roundRect(3, 3, W - 6, H - 6, 12); else g.rect(3, 3, W - 6, H - 6);
  g.fill(); g.stroke();
  const icon = r && _benchIcon(r.out[0]);
  if (icon) g.drawImage(icon, 26, 10, 76, 76);
  else if (r) b.dirty = true;                          // icon still loading: try again next frame
  const per = r ? r.out[1] : 1;
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = '700 22px system-ui, sans-serif';
  g.fillText(b.units.length ? `×${b.units.length * per}` : 'done', W / 2, 110);
  if (b.done) {
    g.fillStyle = '#9ee07f';
    g.font = '700 16px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText(`${b.done * per} ready`, W - 12, 26);
  }
  // how fast it is being worked: the crafting speed, Precise Focus included; 0% with nobody at it
  if (b.units.length) {
    const pc = b.speedPc || 0;
    g.fillStyle = pc > 100 ? '#ffd76a' : pc <= 0 ? '#8f9bb0' : pc < 100 ? '#f0a070' : '#cfd8e6';
    g.font = '700 15px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(`${pc}%`, 12, 109);
  }
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(16, 124, W - 32, 12);
  const pct = r && b.units.length ? Math.min(1, b.t / r.timeToCraft) : (b.done ? 1 : 0);
  g.fillStyle = '#7ee63a';
  g.fillRect(16, 124, (W - 32) * pct, 12);
}
// once per frame for the world: make, redraw and retire the floating orders
/* The pestle at work. While someone holds E at a mortar its pestle leaves the chunk mesh — the block
   switches to variant 1, drawn without it — and a loose copy (variant 2, the pestle alone, built the way a
   dropped block is and lit by its cell the same way) circles the bowl with a small bob, as a pestle is
   ground round. Letting go, finishing, cancelling or breaking the mortar puts the block back as it was. */
const PESTLE_SPEED = 3.2;                               // radians per second round the bowl
function _startPestle(key, b) {
  const [x, y, z] = key.split(',').map(Number);
  const g = new THREE.Group();
  for (const { p, geo } of buildDropGeom(B.MORTAR, 2)) {
    const m = new THREE.Mesh(geo, _dropMat(p));
    m.onBeforeRender = _dropLightHook;
    m.renderOrder = p;
    g.add(m);
  }
  g.position.set(x + 0.5, y + 0.5, z + 0.5);           // drop geometry is centred on its cell
  scene.add(g);
  b.pestle = g;
  setBlock(x, y, z, (matKey(getBlock(x, y, z)) | (1 << 8)) >>> 0);   // keeps its look: a granite mortar stays granite
}
function _stopPestle(key, b) {
  scene.remove(b.pestle);
  b.pestle = null;
  const [x, y, z] = key.split(',').map(Number);
  const v = getBlock(x, y, z);
  if (PROPS[v & 255]?.mortar) setBlock(x, y, z, matKey(v));
}
function _animatePestle(key, b) {
  const working = PLAYERS.some(p => p._benchWork === key);
  if (working && !b.pestle) {
    const [x, y, z] = key.split(',').map(Number);
    if (PROPS[getBlock(x, y, z) & 255]?.mortar) _startPestle(key, b);
  } else if (!working && b.pestle) _stopPestle(key, b);
  if (!b.pestle) return;
  const t = performance.now() / 1000, y0 = +key.split(',')[1];
  b.pestle.rotation.y = t * PESTLE_SPEED;
  b.pestle.position.y = y0 + 0.5 + Math.abs(Math.sin(t * PESTLE_SPEED * 2)) * 0.02;
  // a little powder of what is being ground (0.8, 49-particles.js)
  if (typeof fxGrind === 'function') {
    const dt = Math.min(0.1, t - (b._fxLast || t)); b._fxLast = t;
    fxGrind(b, b.pestle.position.x, y0 + 0.5, b.pestle.position.z, dt);
  }
}
/* The order tag over a bench or mortar shows through walls, but only to someone within BENCH_TAG_NEAR of it;
   farther off it is hidden. */
const BENCH_TAG_NEAR = 8;
function updateBenchDisplays() {
  for (const [key, b] of BENCHES) {
    if (!_benchHasOrder(b)) { _benchClear(key); continue; }
    _animatePestle(key, b);                              // only a mortar being worked does anything
    if (!b.sprite) {
      _drawBenchTag(b);
      const tex = new THREE.CanvasTexture(b.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));   // through walls
      s.renderOrder = 10;
      s.layers.set(1);                                 // the no-shadow layer the name tags use
      const [x, y, z] = key.split(',').map(Number);
      s.position.set(x + 0.5, y + 1.6, z + 0.5);
      s.scale.set(0.7, 0.7 * BENCH_TAG_H / BENCH_TAG_W, 1);
      scene.add(s);
      b.sprite = s;
      b.dirty = false;
      continue;
    }
    if (b.dirty) { b.dirty = false; _drawBenchTag(b); b.sprite.material.map.needsUpdate = true; }
    const sp = b.sprite.position;
    b.sprite.visible = PLAYERS.some(p => p.spawned && !p.dead && Math.hypot(p.pos.x - sp.x, p.pos.y + 1 - sp.y, p.pos.z - sp.z) < BENCH_TAG_NEAR);
  }
}
// what the crosshair says while you look at a bench with an order on it (ui/hud.js)
function benchPrompt() {
  const hit = _aimedBench();
  const b = hit && BENCHES.get(benchKey(hit.x, hit.y, hit.z));
  if (!_benchHasOrder(b)) return null;
  const r = recipeAt(b.ri), per = r ? r.out[1] : 1;
  const pad = lastInputDevice === 'pad';
  const E = pad ? padNorthLabel() : 'E', RMB = pad ? 'LT' : 'RMB';
  const rows = [];
  if (b.units.length) rows.push(`(Hold <b>${E}</b>) craft ${r ? idName(r.out[0]) : 'unknown recipe'} · ${b.units.length * per} left`);
  if (b.done) rows.push(`(<b>${E}</b>) take ${b.done * per}`);
  rows.push(`(Hold <b>${RMB}</b>) cancel`);
  return rows.join('<br>');
}
/* The small arrow between a recipe's ingredients and its output, with how long ONE craft takes under
   it. The time is already divided by your crafting speed, so it is the wait you will get. */
const _fmtCraftTime = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${+s.toFixed(1)}s`);
