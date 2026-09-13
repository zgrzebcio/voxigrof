'use strict';
/* voxiGrof — taming, riding, and naming what you tamed

   Written as a SYSTEM, not as horse code. A tameable animal is a row in TAMEABLE keyed by its
   entity kind: what food starts it, how long it takes, what the reward is. Wolves, camels or
   anything else join by adding a row and a spawn function — the interaction, the ride, the
   progress bar, the boost and the naming all come for free.

   The flow, for a horse:
     1. sneak up holding a golden apple and use it   -> it accepts you (`loved`), apple is eaten
     2. use it again                                 -> you climb on and it bolts
     3. stay on                                      -> the taming bar fills
     4. bar full                                     -> tamed, small permanent stat boost, and you
                                                        are put down to give it a name
     5. use a saddle on it                           -> tack fitted; from then on you steer it
   Sneak dismounts at any point. Getting thrown off (dismounting early) costs part of the boost
   that completing it would have given, so sitting through the whole ride is worth something. */

const TAMEABLE = {
  horse: {
    label: 'horse',
    food: [ITEM.GOLDEN_APPLE],       // what makes it accept you
    consumeFood: true,
    tameTime: 16,                    // seconds in the saddle to fill the bar
    buckPenalty: 0.25,               // share of the final boost lost per early dismount
    needsSaddle: true,               // ...before a tamed one can actually be steered
    boost: { hp: 4, speed: 0.08, jump: 0.08 },
    statLine: (e) => `health ${Math.ceil(e.hp)}/${e.stats.maxHp} · speed ${e.stats.speed.toFixed(2)}` +
                     ` · jump ${e.stats.jump.toFixed(2)} · hunger ${Math.round(entHunger(e))}/${ENT_HUNGER_MAX}`,
    /* What a TAMED one eats from your hand, and how much each refills (0.742). The golden apple
       is on the list too — it tames a wild horse, and it is also the best meal you can give. */
    feed: { [ITEM.APPLE]: 4, [ITEM.WHEAT]: 3, [ITEM.SUGAR]: 2, [ITEM.GOLDEN_APPLE]: 12, [B.HAY]: 16 },
  },
};
const tameProps = (e) => (e && TAMEABLE[e.kind]) || null;
const isTameable = (e) => !!tameProps(e);

var _mountCd = 0;                    // short debounce so one click cannot mount and dismount

/* ---- milking (0.767) ----
   An empty bucket used on a cow fills with milk. Each cow then needs COW_MILK_COOLDOWN seconds before it
   can be milked again — counted down in updateEntities and kept in the save. */
const COW_MILK_COOLDOWN = 600;       // 10 minutes
function tryMilkCow() {
  if (!playing || menuScene || invOpen || player.dead || player.riding) return false;
  if (act && act.place) return false;            // fresh presses only
  const slot = HOTBAR[hotbarSel];
  if (slotId(slot) !== ITEM.BUCKET) return false;
  const cow = pickEntity(4.0);
  if (!cow || cow.kind !== 'cow') return false;
  // only a female gives milk (0.768)
  if (cow.gender !== 'F') { feedInfo('Only a female cow can be milked'); return true; }
  if (cow.milkCd > 0) {
    const m = Math.ceil(cow.milkCd / 60);
    feedInfo(`This cow was milked recently: try again in ${m} min`);
    return true;
  }
  cow.milkCd = COW_MILK_COOLDOWN;
  slot.count--;
  if (slot.count <= 0) HOTBAR[hotbarSel] = mkSlot(ITEM.MILK_BUCKET, 1);   // the last bucket becomes the milk
  else if (!tryPickup(ITEM.MILK_BUCKET, null, 'milked')) throwFromPlayer(ITEM.MILK_BUCKET, 1);
  if (slot.count <= 0 && typeof feedItem === 'function') feedItem(ITEM.MILK_BUCKET, 1, 'milked');
  saveHotbar(); buildHotbar(); updateHotbar();
  playSound('fillWater', { gain: 0.8, rate: 1.1, pos: { x: cow.x, y: cow.y + 1, z: cow.z } });
  return true;
}

/* ---------------------------------- the interaction ----------------------------------
   Called from _doPlace before anything else looks at blocks, so using an animal always beats
   placing a block behind it. Returns true when it handled the click. */
function tryTameInteract() {
  if (!playing || menuScene || invOpen || player.dead) return false;
  if (typeof nameDialogOpen === 'function' && nameDialogOpen()) return false;
  if (act && act.place) return false;            // fresh presses only — never the auto-repeat
  if (_mountCd > 0) return false;
  if (player.riding) return false;               // already up there; sneak to get down
  const ent = pickEntity(4.0);
  const tp = tameProps(ent);
  if (!tp) return false;
  const slot = HOTBAR[hotbarSel];
  const held = slotId(slot);

  /* Feeding comes before mounting: holding food at a hungry tamed animal means "eat this", not
     "let me on". A full one ignores the food and you climb on as usual, so a stack of wheat in
     your hand never locks you out of your own horse. */
  const meal = ent.tame && tp.feed ? tp.feed[held] : 0;
  if (meal > 0 && entHunger(ent) < ENT_HUNGER_MAX - 0.5) {
    ent.hunger = Math.min(ENT_HUNGER_MAX, entHunger(ent) + meal);
    if (!player.canFly) {
      slot.count--;
      if (slot.count <= 0) HOTBAR[hotbarSel] = null;
      saveHotbar(); buildHotbar(); updateHotbar();
    }
    playSound('chew', { gain: 0.8, rate: 1.0, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
    toast(`${ent.name} ate — hunger ${Math.round(ent.hunger)}/${ENT_HUNGER_MAX}`);
    return true;
  }

  // tack: a tamed animal takes a saddle from a plain use
  if (ent.tame && held === ITEM.SADDLE && !ent.saddled) {
    ent.saddled = true;
    if (ent.model && ent.model.saddle) ent.model.saddle.visible = true;
    if (!player.canFly) {
      slot.count--;
      if (slot.count <= 0) HOTBAR[hotbarSel] = null;
      saveHotbar(); buildHotbar(); updateHotbar();
    }
    playSound('wool', { gain: 0.7, rate: 0.9, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
    toast(`saddled ${ent.name}`);
    return true;
  }

  if (!ent.tame) {
    if (!ent.loved) {
      /* The two conditions are reported separately on purpose: "it ignores you" when you are
         standing up is a different problem from "it wants a golden apple", and a player who is
         told the wrong one gives up on the whole idea. */
      if (!player.sneaking) { toast(`sneak up on the ${tp.label} to approach it`); return true; }
      if (!tp.food.includes(held)) { toast(`it will only take a ${ITEM_PROPS[tp.food[0]].name.toLowerCase()}`); return true; }
      if (!player.canFly && tp.consumeFood) {
        slot.count--;
        if (slot.count <= 0) HOTBAR[hotbarSel] = null;
        saveHotbar(); buildHotbar(); updateHotbar();
      }
      ent.loved = true;
      ent.fleeT = 0;
      playSound('chew', { gain: 0.8, rate: 1.0, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
      toast(`the ${tp.label} lets you close — use it again to climb on`);
      return true;
    }
    mountRider(player, ent);
    return true;
  }
  mountRider(player, ent);
  return true;
}

/* What the crosshair says about the animal you are looking at. Returns HTML for the interact
   prompt, or null when there is nothing to say. Read once a frame by 18-hud.js. */
/* Two rows (0.741). The first is the animal's identity and never changes shape:
     "{F|M} {name} {level} lvl"
   The second is whatever the next step with it is — how to tame it while wild, how far along
   the taming is once it has accepted you, and its stats once it is yours. */
const _esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Hover label for EVERY entity (0.756), not just tameable ones: "{F|M} {name} {level} lvl" (a monster has
   no gender), readable out to twice the reach you need to interact with it. Needs a clear line of sight,
   so names never show through walls. The taming row below still only appears within interaction reach,
   where you could actually act on it. */
const ENT_INTERACT_REACH = 4.0, ENT_LABEL_REACH = ENT_INTERACT_REACH * 2;
// the name is player-typed once tamed, so it is escaped before it goes into innerHTML
const entityHead = (ent) =>
  `${ent.gender || ''} <b>${_esc(ent.name)}</b> ${ent.level != null ? ent.level + ' lvl' : ''}`.trim();
// the entity this player is looking at, within label reach and in plain sight, or null
function _hoverEntity() {
  if (!playing || menuScene || invOpen || player.riding || player.dead) return null;
  const ent = pickEntity(ENT_LABEL_REACH);
  if (!ent) return null;
  const ex = player.pos.x, ey = player.pos.y + player.EYE, ez = player.pos.z;
  return hasLineOfSight(ex, ey, ez, ent.x, ent.y + entH(ent) * 0.6, ent.z) ? ent : null;
}
/* The name over an entity's head (0.757). While you look at one, "{F|M} {name} {level} lvl" floats above
   it like a player's name tag, only outlined instead of on a dark plate, so it never reads as another
   player. It replaces the crosshair label of 0.756, which fought the bush-pickup prompt for the same
   spot. One sprite per player, kept on the player object and moved to whatever that player looks at. */
const entityHeadText = (ent) =>
  `${ent.gender ? ent.gender + ' ' : ''}${ent.name}${ent.level != null ? ' ' + ent.level + ' lvl' : ''}`;
function updateEntityHoverTag() {
  const ent = _hoverEntity();
  let s = player._hoverTag;
  if (!ent) { if (s) s.visible = false; return; }
  if (!s) {
    s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    s.renderOrder = 10;               // after the world, so it reads on top like a player's tag
    s.layers.set(1);                  // the no-shadow layer the name tags use
    scene.add(s);
    player._hoverTag = s;
  }
  const text = entityHeadText(ent);
  if (s.userData.text !== text) {
    const { tex, aspect } = _nameTagTexture(text, false);
    s.material.map?.dispose();
    s.material.map = tex;
    s.material.needsUpdate = true;
    s.userData.text = text;
    s.scale.set(NAME_TAG_H * aspect, NAME_TAG_H, 1);
  }
  s.position.set(ent.x, ent.y + entH(ent) + 0.35, ent.z);
  s.visible = true;
}
function tameablePrompt() {
  if (!playing || menuScene || invOpen || player.riding) return null;
  const ent = pickEntity(ENT_INTERACT_REACH);    // crosshair reach: close range only
  const tp = tameProps(ent);
  if (!tp) return null;
  const head = entityHead(ent);
  let sub;
  if (ent.tame) sub = tp.statLine(ent) + (ent.saddled ? '' : ' · needs a saddle');
  else if (ent.loved) {
    const pct = Math.round((ent.tameProg || 0) * 100);
    sub = `(use to climb on${pct ? ` · tamed ${pct}%` : ''})`;
  } else sub = `(tamable with ${ITEM_PROPS[tp.food[0]].name})`;
  return `${head}<br><span style="opacity:.8;font-size:.9em">${sub}</span>`;
}

/* ---------------------------------- mounting ---------------------------------- */
function mountRider(p, e) {
  if (e.rider && e.rider !== p) { toast(`someone is already riding ${e.name}`); return false; }
  const tp = tameProps(e);
  p.riding = e; e.rider = p;
  p.flying = false; p.vy = 0; p.sneaking = false;
  p._rideFwd = 0; p._rideJump = false;
  e.fleeT = 0; e.state = 'idle'; e.bolt = 0;
  _mountCd = 0.5;
  if (e.tame) toast(tp && tp.needsSaddle && !e.saddled
    ? `riding ${e.name} — it needs a saddle before it will steer`
    : `riding ${e.name}`);
  else toast('hold on — sneak to let go');
  return true;
}
/* `silent` is for the paths that are not the player letting go: the animal died, the world was
   unloaded. Those must not count as being thrown off. */
function dismountRider(p, silent) {
  const e = p && p.riding;
  if (!e) return;
  p.riding = null; e.rider = null;
  p._rideFwd = 0; p._rideJump = false;
  _mountCd = 0.5;
  // step off to the animal's side, and never into a wall
  const sx = Math.sin(e.yaw + Math.PI / 2), sz = Math.cos(e.yaw + Math.PI / 2);
  const cand = [[e.x + sx * 1.1, e.z + sz * 1.1], [e.x - sx * 1.1, e.z - sz * 1.1], [e.x, e.z]];
  for (const [cx, cz] of cand) {
    if (!isSolid(Math.floor(cx), Math.floor(e.y), Math.floor(cz)) &&
        !isSolid(Math.floor(cx), Math.floor(e.y + 1), Math.floor(cz))) {
      p.pos.set(cx, e.y, cz);
      break;
    }
  }
  p.vy = 0;
  if (!silent && !e.tame && (e.tameProg || 0) > 0) {
    e.bucked = (e.bucked | 0) + 1;                // costs part of the boost taming would have given
    toast(`you let go of the ${(tameProps(e) || {}).label || 'animal'} — it will trust you a little less`);
  }
  hideTameBar();
}

/* ---------------------------------- progress ----------------------------------
   One call per frame from the main loop, inside the active player's context. */
function updateTaming(dt) {
  if (_mountCd > 0) _mountCd -= dt;
  const e = player.riding;
  if (!e) { hideTameBar(); hideRidePanel(); return; }
  if (!ENTITIES.includes(e)) { dismountRider(player, true); return; }   // it died under you
  updateRidePanel(e);
  const tp = tameProps(e);
  if (!tp || e.tame) { hideTameBar(); return; }
  e.tameProg = Math.min(1, (e.tameProg || 0) + dt / tp.tameTime);
  showTameBar(e, tp);
  if (e.tameProg >= 1) finishTaming(e, tp);
}

function finishTaming(e, tp) {
  e.tame = true;
  e.loved = false;
  e.tameProg = 1;
  /* The reward, once per animal. Every dismount along the way has already been counted, and each
     one shaves a quarter off what is granted here — a horse you rode out in one go is measurably
     better than one you kept falling off. */
  if (!e.boosted) {
    e.boosted = true;
    const keep = Math.max(0, 1 - (e.bucked | 0) * tp.buckPenalty);
    if (e.stats) {
      e.stats.maxHp = Math.round(e.stats.maxHp + tp.boost.hp * keep);
      e.stats.speed = +(e.stats.speed + tp.boost.speed * keep).toFixed(3);
      e.stats.jump  = +(e.stats.jump  + tp.boost.jump  * keep).toFixed(3);
      e.hp = e.stats.maxHp;
    }
  }
  playSound('chestOpen', { gain: 0.7, rate: 1.4, pos: { x: e.x, y: e.y + 1, z: e.z } });
  dismountRider(player, true);
  toast(`tamed the ${tp.label}!`);
  openNameDialog(e, tp);
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

/* ---------------------------------- ride panel (0.743) ----------------------------------
   Top-right, under the version label, only while you are on something. It reads plain entity
   fields (name, gender, level, hp, hunger, stats, saddle, taming) rather than anything
   horse-specific, so the next rideable animal shows up here without touching this code. Rebuilt
   only when the text actually changes — a DOM write every frame is not free. */
let _ridePanel = null, _ridePanelHTML = '';
function _ensureRidePanel() {
  if (_ridePanel) return;
  const el = document.createElement('div');
  el.id = 'ridePanel';
  el.style.cssText = 'position:fixed;top:34px;right:10px;z-index:11;display:none;min-width:190px;' +
    'padding:8px 10px;background:#0b0d16c4;border:1px solid #445;border-radius:8px;' +
    'font:12px ui-monospace,monospace;color:#dfe;line-height:1.55;pointer-events:none;' +
    'text-shadow:0 1px 2px #000';
  document.body.appendChild(el);
  _ridePanel = el;
}
function _rpBar(v, max, col) {
  const pct = Math.max(0, Math.min(100, Math.round(v / Math.max(1e-6, max) * 100)));
  return `<span style="display:inline-block;width:70px;height:7px;vertical-align:middle;` +
    `background:#1c2030;border-radius:4px;overflow:hidden;margin-right:6px">` +
    `<span style="display:block;height:100%;width:${pct}%;background:${col}"></span></span>`;
}
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
  rows.push(`health ${_rpBar(e.hp, maxHp, '#d0463c')}${Math.ceil(e.hp)}/${maxHp}`);
  if (hunger != null)
    rows.push(`hunger ${_rpBar(hunger, ENT_HUNGER_MAX, '#c9953b')}${Math.round(hunger)}/${ENT_HUNGER_MAX}`);
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
let _nameWrap = null, _nameInput = null, _nameSub = null, _nameTarget = null;
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
  box.appendChild(title); box.appendChild(sub); box.appendChild(input); box.appendChild(row);
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
  _nameWrap = wrap; _nameInput = input; _nameSub = sub;
}
function openNameDialog(e, tp) {
  _ensureNameDialog();
  _nameTarget = e;
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
