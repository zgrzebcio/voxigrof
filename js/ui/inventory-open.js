'use strict';
/* ui/inventory-open.js: opening and closing the inventory, keeping lists scrolled where they were, the cursor's look
   each frame, and drawing the chisel's radial menu. */

/* The crafting list and the furnace book, back at their tops: where a list was scrolled to is kept while the
   inventory is open, through every rebuild, and forgotten when it closes. Done once the panel is on screen: a hidden
   list cannot be scrolled, and some browsers hand a list its old place back when it is shown again. */
function resetInvListScroll() {
  if (typeof _craftScroll !== 'undefined') _craftScroll = 0;
  if (typeof _furnBookScroll !== 'undefined') _furnBookScroll = 0;
  for (const sel of ['#craftList', '#furnacePanel .fbList']) {
    const el = invWrapEl.querySelector(sel);
    if (el) el.scrollTop = 0;
  }
}
/* Rebuild `host` from `html`, but leave the element matching `keepSel` — a scrolling list — where it is and only swap
   what is in it. A list taken out of the page and put back as a new element starts from the top, and "put it
   back where it was" can only know where it was when the frame began: whatever the wheel scrolled since is lost, which
   at a low frame rate is most of it, so the list kept jumping back up. Kept in place, the browser never lets go of it.
   The kept element's ancestors up to `host` stay too (their classes are taken from the new html). Falls back to a plain
   innerHTML when there is no such list yet, or the new html has none, or has it somewhere else. Returns the list. */
function swapHtmlKeeping(host, html, keepSel) {
  const old = host.querySelector(keepSel);
  const t = document.createElement('template');
  t.innerHTML = html;
  const neu = t.content.querySelector(keepSel);
  const depth = (n, top) => { let d = 0; while (n && n !== top) { n = n.parentNode; d++; } return n ? d : -1; };
  if (!old || !neu || depth(old, host) !== depth(neu, t.content)) { host.innerHTML = html; return host.querySelector(keepSel); }
  old.replaceChildren(...neu.childNodes);
  for (let ko = old, kn = neu; ko !== host; ko = ko.parentNode, kn = kn.parentNode) {
    const po = ko.parentNode, pn = kn.parentNode;
    const before = [], after = [];
    let seen = false;
    for (const n of [...pn.childNodes]) { if (n === kn) seen = true; else (seen ? after : before).push(n); }
    for (const n of [...po.childNodes]) if (n !== ko) n.remove();
    for (const n of before) po.insertBefore(n, ko);
    for (const n of after) po.appendChild(n);
    if (po !== host && pn.nodeType === 1) po.className = pn.className;
  }
  return old;
}
function toggleInventory(open, mode) {
  if (open === undefined) open = !invOpen;
  if (open === invOpen && mode === undefined) return;
  if (open) { craftMode = mode || 'basic'; buildInventory(); }   // rebuild with the right recipe list
  if (open === invOpen) return;
  invOpen = open;
  _invSeq = open ? ++_invSeqNext : 0;
  /* A fresh press to sneak again. But crouched as it opens, you stay crouched: through the inventory
     and after it, until you let go of sneak or walk (_sneakKeep, 22-main-loop.js), so an open bag never walks you
     off an edge. */
  if (typeof player !== 'undefined' && player) {
    player._sneakLatch = true;
    if (open) player._sneakKeep = !!player.sneaking;
    if (!player._sneakKeep) player.sneaking = false;
  }
  invWrapEl.style.display = open ? 'flex' : 'none';
  /* The mouse (the pointer lock) is seat ONE's. Another seat's inventory leaves it alone: letting it go there paused the
     game (the lock's handler, 17-input.js, saw seat one's inventory shut and opened the pause menu), and taking it back
     on close locked seat one's cursor in the middle of seat one's own inventory. */
  const mouseSeat = activePlayerSlot() === 0;
  if (open) {
    alignInvWrap();                             // needs the panel laid out, so after display:flex
    resetInvListScroll();                       // a newly opened inventory starts every list from its top
    if (mouseSeat && document.pointerLockElement) document.exitPointerLock();   // free the cursor
    const r = invEl.getBoundingClientRect();
    invCursor.x = r.left + r.width / 2; invCursor.y = r.top + r.height / 2;
    /* Only seat ZERO owns the mouse. Every other seat is on a pad and has no OS pointer, so
       'mouse' mode there means a cursor that is never drawn and cannot be moved — the inventory
       opens and there is simply nothing on screen. This used to fall back to 'mouse' whenever
       getPad() came back empty for a moment, which is the disappearing cursor. A pad seat
       is now pinned to 'pad' whatever the pad list says at this instant. */
    invCursor.mode = (activePlayerSlot() === 0 && !getPad()) ? 'mouse' : 'pad';
  } else {
    cancelDrag();
    activeFurnace = null;                       // closing always detaches the furnace GUI
    activeBench = null;                         // ...and a crafting bench's recipe list
    chestClosedSound();                         // must run BEFORE the key is cleared
    activeChest = activeChest2 = null;          // ...and the chest, which also shuts its lid
    activeStructBlock = null;                   // structure editor closes with the inventory
    player._skillView = false;                  // ...and so does the skill tree
    player._invTab = null;                      // ...and the tab picked over a station
    if (typeof craftPickCancel === 'function') craftPickCancel();   // ...and a counted batch
    if (lastHoverEl) { lastHoverEl.classList.remove('hover'); lastHoverEl = null; }
    /* The tooltip has to be torn down HERE rather than left to the next cursor frame: since 0.72
       updateInvCursorVisual only runs while the inventory is open, so the frame that would have
       cleaned it up never comes and the panel stays stranded on screen. */
    vcurEl.style.display = vdragEl.style.display = ctipEl.style.display = 'none';
    if (playing && mouseSeat) { lockTries = 0; tryPointerLock(); }
  }
}

// per-frame: clamp + magnet the pad cursor, position the cursor/ghost, and highlight the hover
function invBounds() {
  const a = invWrapEl.getBoundingClientRect(), b = hotbarEl.getBoundingClientRect();
  const out = { l: Math.min(a.left, b.left) - 8, r: Math.max(a.right, b.right) + 8, t: a.top - 8, bm: b.bottom + 8 };
  // ...and the vitals strip, whose side bars reach past the hotbar, so every bar can be hovered
  if (typeof vitalsEl !== 'undefined' && vitalsEl && vitalsShown) {
    const v = vitalsEl.getBoundingClientRect();
    if (v.width) { out.l = Math.min(out.l, v.left - 8); out.r = Math.max(out.r, v.right + 8); }
  }
  // the furnace book floats above the panel, outside the wrapper's box — the cursor has to reach it
  const bk = invOpen && activeFurnace ? invWrapEl.querySelector('#furnacePanel .fbook') : null;
  if (bk) {
    const c = bk.getBoundingClientRect();
    out.l = Math.min(out.l, c.left - 8); out.r = Math.max(out.r, c.right + 8); out.t = Math.min(out.t, c.top - 8);
  }
  return out;
}
var lastHoverEl = null;
var _invSeq = 0;                    // when this seat opened its inventory — see toggleInventory
// hidden, written only when it is not already (once a frame: a style set to what it is still costs the browser a parse)
const _invHide = (el) => { if (el.style.display !== 'none') el.style.display = 'none'; };
function updateInvCursorVisual(dt) {
  if (!invOpen) {
    if (lastHoverEl) { lastHoverEl.classList.remove('hover'); lastHoverEl = null; }
    _invHide(vcurEl); _invHide(vdragEl); _invHide(ctipEl);
    return;
  }
  const bnd = invBounds();
  invCursor.x = Math.max(bnd.l, Math.min(bnd.r, invCursor.x));
  invCursor.y = Math.max(bnd.t, Math.min(bnd.bm, invCursor.y));
  if (invCursor.mode === 'pad') {                // magnet snaps to nearest element, but ONLY when
    const n = nearestElement(invCursor.x, invCursor.y);   // the stick is idle — so an active push can
    // crafting icons are small, so they get a wider capture radius and a harder pull
    // and the furnace book's icons and tabs pull hardest still, so a pad lands on one exact icon
    const book = n && (n.type === 'book' || n.type === 'skill');   // skill buttons pull as hard
    // a line (a stat, an effect, the XP bar, a row of the vitals) pulls gently and only from close by, onto its nearest
    // edge: it is wide, and pulled to its middle the cursor could not pass it (LINE_BIAS, ui/inventory-cursor.js)
    const line = n && (n.type === 'info' || n.type === 'vital');
    const snapR = (book ? 150 : n && n.type === 'craft' ? 120 : line ? 28 : 80) * invScale() + (line ? LINE_BIAS : 0);
    if (n && n.dist < snapR && (pad.invStick || 0) < 0.2) {
      const k = Math.min(1, dt * (book ? 50 : n.type === 'craft' ? 30 : line ? 8 : 20));
      const r = line ? n.rect : null;
      const tx = r ? Math.max(r.left + 2, Math.min(r.right - 2, invCursor.x)) : n.cx;
      const ty = r ? Math.max(r.top + 2, Math.min(r.bottom - 2, invCursor.y)) : n.cy;
      invCursor.x += (tx - invCursor.x) * k;
      invCursor.y += (ty - invCursor.y) * k;
    }
    vcurEl.style.display = 'block';
    vcurEl.style.left = invCursor.x + 'px';
    vcurEl.style.top = invCursor.y + 'px';
    if (typeof craftPickFollow === 'function') craftPickFollow();   // a counted batch rides the cursor
  } else {
    _invHide(vcurEl);
  }
  const hov = hoveredSlot(), hovEl = hov ? hov.el : null;
  if (hovEl !== lastHoverEl) {
    if (lastHoverEl) lastHoverEl.classList.remove('hover');
    if (hovEl) hovEl.classList.add('hover');
    lastHoverEl = hovEl;
  }
  // Tooltip: full item panel over any occupied slot, name-only over crafting icons. Suppressed
  // while dragging, since the cursor is already carrying a visible stack.
  const ne = nearestElement(invCursor.x, invCursor.y);
  const tipR = (invCursor.mode === 'pad' ? 60 : 24) * invScale();
  const hovSlot = hov && slotArr(hov.region)[hov.i];
  // a stat or effect line under the cursor is lit up while its tooltip shows
  const infoEl = !dragHeld && !hovSlot && ne && ne.type === 'info' && ne.dist - LINE_BIAS < tipR ? ne.el : null;
  if (infoEl !== player._infoHoverEl) {
    if (player._infoHoverEl) player._infoHoverEl.classList.remove('tipHover');
    if (infoEl) infoEl.classList.add('tipHover');
    player._infoHoverEl = infoEl;
  }
  // a bar of the vitals above the hotbar, its value out of its max and its over-stat: first when the cursor is on the bar
  // and not on a slot itself (the hotbar's slots are near enough to count as hovered from there)
  const vt = !dragHeld && typeof vitalsTipAt === 'function' && !slotAtPoint(invCursor.x, invCursor.y) ? vitalsTipAt(invCursor.x, invCursor.y) : '';
  if (dragHeld) {
    _invHide(ctipEl);
  } else if (vt) {
    showTooltip(vt);
  } else if (hovSlot) {
    showTooltip(itemTooltipHTML(hovSlot.id, hovSlot.dur, hovSlot.fresh, hovSlot.wm, hovSlot.lock));
  } else if (ne && (ne.type === 'craft' || ne.type === 'book') && ne.dist < tipR && ne.title && _inClip(ne.clip)) {
    // recipe icons get the same full panel as a real slot (no durability — it isn't an instance)
    showTooltip(Number.isFinite(ne.id) ? itemTooltipHTML(ne.id, null, null)
                                       : `<div class="tipName">${_tipEsc(ne.title)}</div>`);
  } else if (ne && ne.type === 'skill' && ne.tip && ne.dist < tipR * 1.6) {
    showTooltip(ne.tip());                           // a skill: what it does, costs and needs
  } else if (infoEl) {
    showTooltip(ne.tip());                           // what a stat means, or what an effect is doing
  } else {
    _invHide(ctipEl);
  }
  if (dragHeld) {
    vdragEl.style.display = 'block';
    vdragEl.style.left = invCursor.x + 'px';
    vdragEl.style.top = invCursor.y + 'px';
    const dragKey = dragHeld ? `${dragHeld.id}:${dragHeld.count}` : '';
    if (vdragEl.dataset.id !== dragKey) { vdragEl.innerHTML = slotInner(dragHeld); vdragEl.dataset.id = dragKey; }
  } else {
    _invHide(vdragEl);
    if (vdragEl.dataset.id) vdragEl.dataset.id = '';
  }
}

function drawRadial() {
  const c = radialCtx, S = 360, cx = S / 2, cy = S / 2, n = hotbarLen();
  const step = (Math.PI * 2) / n;
  c.clearRect(0, 0, S, S);
  c.imageSmoothingEnabled = true;   // 3D icons are supersampled — smooth downscale
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step - step / 2 + 0.02;
    const a1 = a0 + step - 0.04;
    c.beginPath();
    c.arc(cx, cy, 168, a0, a1);
    c.arc(cx, cy, 62, a1, a0, true);
    c.closePath();
    c.fillStyle = i === pad.radialSel ? 'rgba(255,255,255,0.32)' : 'rgba(12,14,22,0.78)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.stroke();
    const am = -Math.PI / 2 + i * step, r = 115;
    const hid = slotId(HOTBAR[i]);
    const img = hid != null ? ICON_IMG[hid + ':0'] : null;
    if (img && img.complete) c.drawImage(img, cx + Math.cos(am) * r - 18, cy + Math.sin(am) * r - 18, 36, 36);
    // stack-count badge (bottom-right of the icon disc)
    const cnt = slotCount(HOTBAR[i]);
    if (cnt > 1) {
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
      c.font = 'bold 14px sans-serif'; c.textAlign = 'right';
      const tx = cx + Math.cos(am) * r + 18, ty = cy + Math.sin(am) * r + 16;
      c.strokeText(cnt, tx, ty); c.fillText(cnt, tx, ty);
    }
  }
  c.fillStyle = '#fff';
  c.font = 'bold 14px sans-serif';
  c.textAlign = 'center';
  const selId = slotId(HOTBAR[pad.radialSel >= 0 ? pad.radialSel : hotbarSel]);
  c.fillText(selId == null ? 'Empty' : PROPS[selId].name, cx, cy + 5);
}
