'use strict';
/* ui/animals.js: animals on screen. The name over the one you look at, the prompt under the crosshair, your tamed
   animals' names seen from far, the mark over one you are taming, the taming bar, the riding panel, and the naming
   window. */

// the entity this player is looking at, within label reach and in plain sight, or null
function _hoverEntity() {
  if (!playing || menuScene || invOpen || player.riding || player.dead) return null;
  const ent = pickEntity(ENT_LABEL_REACH);
  if (!ent) return null;
  const ex = player.pos.x, ey = player.pos.y + player.EYE, ez = player.pos.z;
  return hasLineOfSight(ex, ey, ez, ent.x, ent.y + entH(ent) * 0.6, ent.z) ? ent : null;
}
/* The name over an entity's head. While you look at one, "{F|M} {name} {level} lvl" floats above
   it like a player's name tag, only outlined instead of on a dark plate, so it never reads as another
   player. It replaces the crosshair label of 0.756, which fought the bush-pickup prompt for the same
   spot. One sprite per player, kept on the player object and moved to whatever that player looks at. */
/* an animal's size follows its name ("F Cow 1.12x 12 lvl"), and a second, smaller line under it says what
   it has for you: a cow's milk (ready, or how long until it is) and a sheep's wool (ready, or growing back). */
// `sized`: the kinds that roll a size, in the creature table (entities/mobs.js)
const entitySizeText = (ent) => (mobOf(ent).sized && ent.size > 0) ? ` ${(+ent.size).toFixed(2)}x` : '';
const _mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function entitySubText(ent) {
  if (ent.kind === 'cow' && ent.gender === 'F') return ent.milkCd > 0 ? `milk in ${_mmss(ent.milkCd)}` : 'milk is ready';
  if (ent.kind === 'sheep') return ent.woolly ? 'wool is ready' : `growing wool (${_mmss(ent.woolLeft || 0)})`;
  if (ent.kind === 'horse' && ent.tame && ent.stance && ent.stance !== 'wander') return ent.stance;   // what it was told
  const sub = mobOf(ent).subText;                // its own (the creature table): a hound's taming, an otter's stance
  return sub ? sub(ent) : '';
}
const entityHeadText = (ent) =>
  `${ent.gender ? ent.gender + ' ' : ''}${ent.name}${entitySizeText(ent)}${ent.level != null ? ' ' + ent.level + ' lvl' : ''}`;
// the outlined label over an entity, with its smaller second line when it has one
const ENT_TAG_SUB_FONT = "600 32px 'Segoe UI', system-ui, sans-serif";
function _entTagTexture(head, sub) {
  if (!sub) return _nameTagTexture(head, false);
  const pad = 14, fs = 44, fs2 = 32;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = NAME_TAG_FONT; const w1 = probe.measureText(head).width;
  probe.font = ENT_TAG_SUB_FONT; const w2 = probe.measureText(sub).width;
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.ceil(Math.max(w1, w2)) + pad * 2); c.height = fs + fs2 + pad * 2;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.8)';
  const line = (text, font, y, col) => { g.font = font; g.strokeText(text, c.width / 2, y); g.fillStyle = col; g.fillText(text, c.width / 2, y); };
  line(head, NAME_TAG_FONT, pad / 2 + fs / 2 + 1, '#ffffff');
  line(sub, ENT_TAG_SUB_FONT, pad + fs + fs2 / 2 + 1, '#d8e8c8');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return { tex: t, aspect: c.width / c.height, lines: 2 };
}
function updateEntityHoverTag() {
  const ent = _hoverEntity();
  player._hoverEnt = ent;               // its pet tag gives way to this one (petTagsFor)
  let s = player._hoverTag;
  if (!ent) { if (s) s.visible = false; return; }
  if (!s) {
    s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    s.renderOrder = 10;               // after the world, so it reads on top like a player's tag
    s.layers.set(1);                  // the no-shadow layer the name tags use
    scene.add(s);
    player._hoverTag = s;
  }
  const head = entityHeadText(ent), sub = entitySubText(ent), text = head + '|' + sub;
  if (s.userData.text !== text) {
    const { tex, aspect, lines } = _entTagTexture(head, sub);
    s.material.map?.dispose();
    s.material.map = tex;
    s.material.needsUpdate = true;
    s.userData.text = text;
    const h = lines === 2 ? NAME_TAG_H * 104 / 58 : NAME_TAG_H;   // the canvas is that much taller with two lines
    s.scale.set(h * aspect, h, 1);
  }
  s.position.set(ent.x, ent.y + entH(ent) + 0.35 + (s.scale.y - NAME_TAG_H) / 2, ent.z);   // a two-line tag sits higher
  s.visible = true;
}
function tameablePrompt() {
  if (!playing || menuScene || invOpen || player.riding) return null;
  const ent = pickEntity(ENT_INTERACT_REACH);    // crosshair reach: close range only
  if (ent && mobOf(ent).prompt) return mobOf(ent).prompt(ent);   // its own lines (the creature table): the hellhound, the otter
  const tp = tameProps(ent);
  if (!tp) return null;
  const head = entityHead(ent);
  let sub;
  // a tamed one: its numbers, then what it was told and what you can do with it
  if (ent.tame) sub = tp.statLine(ent) + (ent.saddled ? '' : ' · needs a saddle')
    + `</span><br><span style="opacity:.8;font-size:.9em">stance: <b>${ent.stance || 'wander'}</b> (sneak + use) · ${_petHint()}`;
  else if (ent.loved) {
    const pct = Math.round((ent.tameProg || 0) * 100);
    sub = `(use to climb on${pct ? ` · tamed ${pct}%` : ''})`;
  } else sub = `(tamable with ${ITEM_PROPS[tp.food[0]].name})`;
  return `${head}<br><span style="opacity:.8;font-size:.9em">${sub}</span>`;
}

/* ---------------------------------- somebody's animals, from far ----------------------------------
   PET TAGS. A tamed animal's name hangs over it as a player's does (the plate, seen through the world, held legible at range
   by the same rule as _scaleNameTagFor), but only in its owner's view, so a lost horse, hound or otter can be found from
   afar. One with no owner on record (a horse tamed before owners were kept) shows to every player. It gives way while
   the animal is the one under the crosshair (the hover tag says its name then). Kept once a frame (updatePetTags,
   22-main-loop.js), shown per view (petTagsFor, 36-splitscreen.js). */
const PET_TAGS = new Map();             // the animal -> its sprite
const PET_TAG_LIFT = 0.45;              // over its head
// which animals have a tag is worked out every LIST_PASS_S (a walk over every creature); where each tag is, every frame
const _petWant = new Set();
let _petPassT = 0;
function updatePetTags(dt) {
  if ((_petPassT -= dt) <= 0 || (!playing && _petWant.size)) {
    _petPassT = LIST_PASS_S;
    _petWant.clear();
    if (!menuScene && playing) for (const e of ENTITIES) if (e.tame && e.hp > 0 && e.model.root.parent) _petWant.add(e);
  }
  for (const [e, s] of PET_TAGS)
    if (!_petWant.has(e) || !(e.hp > 0) || !e.model.root.parent) { scene.remove(s); s.material.map?.dispose(); s.material.dispose(); PET_TAGS.delete(e); _petWant.delete(e); }
  for (const e of _petWant) {
    let s = PET_TAGS.get(e);
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      s.renderOrder = 10;               // after the world, so it reads on top like a player's tag
      s.layers.set(1);                  // the no-shadow layer the name tags use
      scene.add(s);
      PET_TAGS.set(e, s);
    }
    if (s.userData.name !== e.name) {
      const { tex, aspect } = _nameTagTexture(e.name);
      s.material.map?.dispose(); s.material.map = tex; s.material.needsUpdate = true;
      s.userData.name = e.name; s.userData.baseW = NAME_TAG_H * aspect; s.userData.baseH = NAME_TAG_H;
    }
    const r = e.model.root.position;    // where it is drawn, between its ticks
    s.position.set(r.x, r.y + entH(e) + PET_TAG_LIFT, r.z);
  }
}
/* every tag taken down: a world left for the title screen or another world (quitToMenu, loadWorld). updatePetTags only
   runs while a world does, so without this the last world's tags hung over the title screen and the next world's loading */
function clearPetTags() {
  for (const s of PET_TAGS.values()) { scene.remove(s); s.material.map?.dispose(); s.material.dispose(); }
  PET_TAGS.clear();
  _petWant.clear();
}
// one view's pass (renderAllViews): the tags of `p`'s own animals, held legible at range for this eye; the rest hidden
function petTagsFor(p, cam) {
  const world = !menuScene && !!currentWorld && !worldJoining();
  for (const [e, s] of PET_TAGS) {
    const owner = e.ownerId == null && !e.owner ? p : houndOwner(e);
    s.visible = world && owner === p && p._hoverEnt !== e && !p.dead;
    if (!s.visible) continue;
    const k = Math.min(NAME_TAG_MAX_K, Math.max(1, cam.position.distanceTo(s.position) / NAME_TAG_FULL_D));
    s.scale.set(s.userData.baseW * k, s.userData.baseH * k, 1);
  }
}
/* TAMING MARKS. While this player is taming a hellhound or an otter (its `taming`), a mark over it on their own screen,
   placed as the death mark is (at the edge of the view, on the side to turn to, when it is off screen or behind): its
   name, sex and level, how far the taming is, how far away it is. Per seat, from tickPlayer, in the seat's pane. */
const TAME_MARK_EDGE = 28;
const _tmV = new THREE.Vector3();
function syncTamingMarks() {
  const st = typeof PSTATE !== 'undefined' ? PSTATE[activePlayerSlot()] : null;
  if (!st || !st.pane) return;
  let box = st.pane._tameMarks;
  if (!box) {
    box = document.createElement('div');
    box.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3';
    st.pane.appendChild(box);
    st.pane._tameMarks = box;
  }
  const p = player, list = [];
  const show = !menuScene && playing && p.spawned && !p.dead && !!currentWorld;
  if (show) for (const e of ENTITIES) if (e.taming && e.hp > 0 && houndOwner(e) === p) list.push(e);
  const boxShown = show ? '' : 'none';                  // setHudVisible hides the box itself on the title screen
  if (box.style.display !== boxShown) box.style.display = boxShown;
  while (box.children.length < list.length) {
    const c = document.createElement('div');
    c.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-50%);color:#eaffe0;white-space:nowrap;' +
      'font:600 13px system-ui,sans-serif;text-shadow:0 1px 3px #000;background:rgba(20,60,20,.5);' +
      'border:1px solid rgba(160,235,140,.75);border-radius:6px;padding:2px 7px';
    box.appendChild(c);
  }
  const W = st.pane.clientWidth, H = st.pane.clientHeight;
  if (list.length) camera.updateMatrixWorld();
  for (let i = 0; i < box.children.length; i++) {
    const c = box.children[i], e = list[i];
    if (!e || !W || !H) { if (c.style.display !== 'none') c.style.display = 'none'; continue; }
    const r = e.model.root.position, d = Math.hypot(r.x - p.pos.x, r.y - p.pos.y, r.z - p.pos.z);
    _tmV.set(r.x, r.y + entH(e) + 0.6, r.z).applyMatrix4(camera.matrixWorldInverse);
    const behind = _tmV.z > 0;
    _tmV.applyMatrix4(camera.projectionMatrix);
    let sx = _tmV.x, sy = _tmV.y;
    if (behind) { sx = -sx; sy = -sy; }
    let x = (sx * 0.5 + 0.5) * W, y = (0.5 - sy * 0.5) * H;
    const hx = W / 2 - TAME_MARK_EDGE, hy = H / 2 - TAME_MARK_EDGE, dx = x - W / 2, dy = y - H / 2;
    if (behind || Math.abs(dx) > hx || Math.abs(dy) > hy) {
      const k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
      x = W / 2 + dx * k; y = H / 2 + dy * k;
    }
    const sub = mobOf(e).subText ? mobOf(e).subText(e) : 'taming';
    // what it is: its sex and level, as the naming dialog and the ride panel give them
    const sex = e.gender === 'F' ? ' ♀' : e.gender === 'M' ? ' ♂' : '';
    const lvl = e.level != null ? ` · ${e.level} lvl` : '';
    const txt = `🐾 ${e.name}${sex}${lvl} · ${sub} · ${Math.round(d)} m`;
    if (c._txt !== txt) { c._txt = txt; c.textContent = txt; }
    c.style.display = 'block';
    c.style.left = x.toFixed(1) + 'px';
    c.style.top = y.toFixed(1) + 'px';
  }
}

/* ---------------------------------- the taming bar ----------------------------------
   Built from script rather than from index.html: it belongs to this system, and a feature that
   carries its own UI can be dropped into the page without editing three other files. */
let _tameWrap = null, _tameFill = null, _tameText = null;
function _ensureTameBar() {
  if (_tameWrap) return;
  const wrap = document.createElement('div');
  wrap.id = 'tameBar';
  wrap.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:132px;width:320px;' +
    'z-index:12;display:none;font:12px ui-monospace,monospace;color:#dfe;text-align:center;' +
    'pointer-events:none;text-shadow:0 1px 2px #000';
  const text = document.createElement('div');
  text.style.cssText = 'margin-bottom:4px;letter-spacing:.5px';
  const track = document.createElement('div');
  track.style.cssText = 'height:10px;border:1px solid #445;border-radius:5px;background:#0b0d16cc;overflow:hidden';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#5aa02c,#8ed14a);transition:width .08s linear';
  track.appendChild(fill);
  wrap.appendChild(text); wrap.appendChild(track);
  document.body.appendChild(wrap);
  _tameWrap = wrap; _tameFill = fill; _tameText = text;
}
function showTameBar(e, tp) {
  _ensureTameBar();
  _tameWrap.style.display = 'block';
  _tameText.textContent = `taming ${tp.label} — sneak to let go`;
  _tameFill.style.width = Math.round((e.tameProg || 0) * 100) + '%';
}
function hideTameBar() {
  if (_tameWrap) _tameWrap.style.display = 'none';
}

/* ---------------------------------- ride panel ----------------------------------
   Top-right, under the version label, only while you are on something. It reads plain entity
   fields (name, gender, level, hp, hunger, stats, saddle, taming) rather than anything
   horse-specific, so the next rideable animal shows up here without touching this code. Rebuilt
   only when the text actually changes — a DOM write every frame is not free. */
let _ridePanel = null, _ridePanelHTML = '';
function _ensureRidePanel() {
  if (_ridePanel) return;
  const el = document.createElement('div');
  el.id = 'ridePanel';
  el.style.cssText = 'position:fixed;top:34px;right:10px;z-index:11;display:none;' +   // no min-width since 0.8451 (190px): as wide as its numbers
    'padding:8px 10px;background:#0b0d16c4;border:1px solid #445;border-radius:8px;' +
    'font:12px ui-monospace,monospace;color:#dfe;line-height:1.55;pointer-events:none;' +
    'text-shadow:0 1px 2px #000';
  document.body.appendChild(el);
  _ridePanel = el;
}
// numbers only, each in its bar's old colour; the bars made the panel wide for what they said
const _rpNum = (v, max, col) => `<span style="color:${col}">${v}/${max}</span>`;
function updateRidePanel(e) {
  _ensureRidePanel();
  const st = e.stats || {};
  const maxHp = st.maxHp || Math.max(1, e.hp);
  const hunger = typeof entHunger === 'function' ? entHunger(e) : null;
  const rows = [];
  rows.push(`<b>${_esc(e.name || 'Mount')}</b> <span style="opacity:.75">${e.gender || ''}` +
            `${e.level != null ? ' · ' + e.level + ' lvl' : ''}</span>`);
  rows.push(`${e.tame ? 'tamed' : `taming ${Math.round((e.tameProg || 0) * 100)}%`}` +
            `${e.tame ? (e.saddled ? ' · saddled' : ' · no saddle') : ''}`);
  rows.push(`health ${_rpNum(Math.ceil(e.hp), maxHp, '#f0766c')}`);
  if (hunger != null)
    rows.push(`hunger ${_rpNum(Math.round(hunger), ENT_HUNGER_MAX, '#e0b060')}`);
  if (typeof entThirst === 'function' && e.thirst != null)   // 0.823
    rows.push(`thirst ${_rpNum(Math.round(entThirst(e)), ENT_THIRST_MAX, '#6cb4ec')}`);
  if (st.speed != null) rows.push(`speed  ${st.speed.toFixed(2)}`);
  if (st.jump != null)  rows.push(`jump   ${st.jump.toFixed(2)}`);
  const html = rows.join('<br>');
  if (html !== _ridePanelHTML) { _ridePanel.innerHTML = html; _ridePanelHTML = html; }
  _ridePanel.style.display = 'block';
}
function hideRidePanel() {
  if (_ridePanel && _ridePanel.style.display !== 'none') _ridePanel.style.display = 'none';
}

/* ---------------------------------- naming ----------------------------------
   Opens once, the moment an animal is tamed. The pointer lock is released so the field can
   actually be typed into, and every key that lands in the input is stopped there — otherwise
   naming a horse "Wanda" would walk you into a lake. */
let _nameWrap = null, _nameInput = null, _nameSub = null, _nameTarget = null, _nameTitle = null, _nameWho = null;
function nameDialogOpen() { return !!(_nameWrap && _nameWrap.style.display === 'flex'); }
function _ensureNameDialog() {
  if (_nameWrap) return;
  const wrap = document.createElement('div');
  wrap.id = 'namePanel';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:22;display:none;align-items:center;' +
    'justify-content:center;background:#0009;font:14px ui-monospace,monospace;color:#dfe';
  const box = document.createElement('div');
  box.style.cssText = 'background:#141826;border:1px solid #445;border-radius:10px;padding:18px 20px;' +
    'min-width:320px;text-align:center;box-shadow:0 8px 30px #000a';
  const title = document.createElement('div');
  title.textContent = 'name your animal';
  title.style.cssText = 'font-size:16px;margin-bottom:6px';
  // what it is: its sex and level, so the name can suit it
  const who = document.createElement('div');
  who.style.cssText = 'color:#cfe3b8;font-size:13px;margin-bottom:6px';
  const sub = document.createElement('div');
  sub.style.cssText = 'color:#9ab;font-size:12px;margin-bottom:12px';
  const input = document.createElement('input');
  input.maxLength = 20;
  input.spellcheck = false;
  input.placeholder = 'name';
  input.style.cssText = 'width:100%;box-sizing:border-box;background:#0b0d16;color:#dfe;border:1px solid #445;' +
    'border-radius:6px;padding:8px 10px;font:14px ui-monospace,monospace;margin-bottom:12px';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:center';
  const ok = document.createElement('button');
  ok.textContent = 'Name it';
  ok.style.cssText = 'background:#3f7a2a;color:#eff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font:13px ui-monospace,monospace';
  const skip = document.createElement('button');
  skip.textContent = 'Skip';
  skip.style.cssText = 'background:#3a3f52;color:#dfe;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font:13px ui-monospace,monospace';
  row.appendChild(ok); row.appendChild(skip);
  box.appendChild(title); box.appendChild(who); box.appendChild(sub); box.appendChild(input); box.appendChild(row);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
  // keystrokes and clicks stop here: the game's document-level handlers must never see them
  for (const ev of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click'])
    wrap.addEventListener(ev, (x) => x.stopPropagation());
  input.addEventListener('keydown', (x) => {
    if (x.code === 'Enter') { x.preventDefault(); _commitName(input.value); }
    if (x.code === 'Escape') { x.preventDefault(); _commitName(null); }
  });
  ok.onclick = () => _commitName(input.value);
  skip.onclick = () => _commitName(null);
  _nameWrap = wrap; _nameInput = input; _nameSub = sub; _nameTitle = title; _nameWho = who;
}
function openNameDialog(e, tp) {
  _ensureNameDialog();
  _nameTarget = e;
  const label = (tp && tp.label) || 'animal';
  _nameTitle.textContent = `name your ${label}`;
  _nameWho.textContent = `${e.gender === 'F' ? 'Female' : e.gender === 'M' ? 'Male' : ''} ${label}`.trim()
    + (e.level != null ? ` · ${e.level} lvl` : '');
  _nameSub.textContent = tp && tp.statLine ? tp.statLine(e) : '';
  _nameInput.value = '';
  _nameWrap.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => _nameInput.focus(), 30);
}
function _commitName(value) {
  const e = _nameTarget;
  _nameTarget = null;
  if (_nameWrap) _nameWrap.style.display = 'none';
  if (e) {
    const n = (value || '').trim().slice(0, 20);
    if (n) { e.name = n; toast(`named ${n}`); }
  }
  if (typeof keys === 'object') for (const k in keys) keys[k] = false;   // nothing left held down
  if (typeof tryPointerLock === 'function') { lockTries = 0; tryPointerLock(); }
}
