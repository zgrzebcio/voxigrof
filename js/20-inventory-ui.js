'use strict';
/* voxiGrof — inventory grid UI, drag & drop, radial picker */

var invEl = document.getElementById('inv');
var invWrapEl = document.getElementById('invWrap');
var invOpen = false;

/* Every seat owns a CLONE of #invWrap, parked in its own viewport (0.728), so
   `document.getElementById` would hand player one's panel back to all four of them. Panel lookups
   go through here instead: scoped to whichever player's inventory is currently installed. */
const invPanel = (id) => (invWrapEl ? invWrapEl.querySelector('#' + id) : null);
/* The pane's HUD scale. Slot geometry shrinks with the viewport, but the cursor lives in unscaled
   screen pixels — so pad speed and the magnet radii have to shrink with it, or a quarter-screen
   panel feels twice as twitchy as a full-screen one. 1 in single player. */
const invScale = () => {
  const st = (typeof PSTATE !== 'undefined') && PSTATE[activePlayerSlot()];
  return (st && st.hudScale) || 1;
};

// Slot: null (empty) OR `{id, count}`. `slotInner` renders the 3D icon and a stack-count badge
// when count > 1. Future non-block items would branch on an item table for their flat icon.
const slotArr = (r) => r === 'hot' ? HOTBAR
  : r === 'fur' ? ((activeFurnace && FURNACES.get(activeFurnace)) || mkFurnace()).slots
  : r === 'equip' ? equipSlots
  : r === 'belt'  ? beltSlots
  : r === 'chest'  ? ((activeChest  && CHESTS.get(activeChest))  || mkChest()).slots
  : r === 'chest2' ? ((activeChest2 && CHESTS.get(activeChest2)) || mkChest()).slots
  : r === 'inv2' ? invSlots2
  : invSlots;
/* Tools render a durability bar (hidden while still full, MC-style): green -> red as it wears.
   Food renders the same bar off its spoilage clock (0.789, 44-spoil.js): fresh/max, green -> red.
   Unlike a tool's, the food bar is shown from the moment you pick the food up (0.7891) — an unused
   tool has nothing to report, but a full clock is exactly what you want to see on food. */
const _durBarHTML = (pct) =>
  `<span class="dur"><i style="width:${Math.max(4, pct * 100)}%;background:hsl(${(pct * 120) | 0},75%,45%)"></i></span>`;
const slotDurBar = (s) => {
  const maxD = s.dur != null && s.id >= 256 ? ITEM_PROPS[s.id]?.durability : null;
  if (maxD) return s.dur >= maxD ? '' : _durBarHTML(s.dur / maxD);
  const maxF = typeof spoilMax === 'function' ? spoilMax(s.id) : 0;
  if (!maxF) return '';
  const f = s.fresh == null ? maxF : s.fresh;        // no clock yet (an older save) reads as full
  return _durBarHTML(Math.min(1, Math.max(0, f) / maxF));
};
/* An empty src would resolve to the page itself and paint a broken-image glyph, so a slot whose
   icon is not drawable yet renders with no <img> at all. renderBlockIcon only returns '' while a
   block's mesh art is still loading, and the hotbar is rebuilt once it lands (see 23-boot.js). */
const slotInner = (s) => {
  if (s == null) return '';
  // a block the chisel would shape shows as that shape while it is picked (0.782)
  const src = typeof chiselSlotIcon === 'function' ? chiselSlotIcon(s.id) : renderBlockIcon(s.id);
  return (src ? `<img class="i3d" src="${src}" alt="">` : '') +
         (s.count > 1 ? `<span class="cnt">${s.count}</span>` : '') + slotDurBar(s) +
         (s.dur === 0 ? '<span class="brk"></span>' : '');    // broken, kept by Mender (0.79)
};

function buildInventory() {
  // hide both side panels first; the right one is rebuilt below
  const cpEl = invPanel('craftPanel');
  if (cpEl) cpEl.style.display = 'none';
  const fpEl = invPanel('furnacePanel');
  if (fpEl) fpEl.style.display = 'none';
  const chpEl = invPanel('chestPanel');
  if (chpEl) chpEl.style.display = 'none';
  const eqpEl = invPanel('equipPanel');
  if (eqpEl) eqpEl.style.display = 'none';
  const stpEl = invPanel('structPanel');
  if (stpEl) stpEl.style.display = 'none';

  invEl.innerHTML =
    '<div class="title">Inventory</div>' +
    '<div class="hint">drag: hold <b>LMB</b>/<b>A</b> &middot; quick-move: <b>Shift+LMB</b>/<b>Y</b> &middot; swap gear: <b>Shift+RMB</b> &middot; drop: <b>Y</b>/<b>Shift+Y</b> &middot; sort: <b>MMB</b> &middot; close: <b>Tab</b>/<b>B</b></div>';
  /* One N×INV_COLS grid bound to a slot array + region; DOM order == slot index (slot 0 =
     bottom-left, the CSS reverses the rows). `count` renders only the first N slots of the array
     — the backpack opens part of invSlots2, and an unrendered slot is one nothing can be dragged
     into. Only trailing cells are ever dropped, so the DOM-order-to-index mapping still holds. */
  const mkGrid = (arr, region, count) => {
    const n = count == null ? arr.length : Math.min(count, arr.length);
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.dataset.region = region;
    const rows = Math.ceil(n / INV_COLS);         // row count follows the array, not a fixed 3
    for (let row = 0; row < rows; row++) {        // row 0 renders at the bottom
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      for (let col = 0; col < INV_COLS; col++) {
        const i = row * INV_COLS + col;
        if (i >= n) break;
        const div = document.createElement('div');
        div.className = 'slot';
        div.innerHTML = slotInner(arr[i]);
        rowEl.appendChild(div);
      }
      grid.appendChild(rowEl);
    }
    return grid;
  };
  // Creative: the overflow palette sits ABOVE the main grid inside a fixed-height scroller, so
  // adding rows to it grows the scroll range instead of the panel.
  if (player.canFly) {
    const scroller = document.createElement('div');
    scroller.className = 'invScroll';
    scroller.appendChild(mkGrid(invSlots2, 'inv2'));
    invEl.appendChild(scroller);
    /* Open pinned to the BOTTOM of the palette, so the first rows you see are the ones sitting
       against the main grid. Done twice: once now, and again after layout settles — while the
       panel is still display:none the scroll height is 0 and the first assignment is a no-op. */
    const _toBottom = () => { scroller.scrollTop = scroller.scrollHeight; };
    _toBottom();
    requestAnimationFrame(_toBottom);
  } else {
    /* Survival: a worn backpack opens the very same second grid, two rows of it, sitting above
       the main one (41-backpack.js). No pack means no grid at all — and with nothing rendered
       there is nothing the cursor can drag into. */
    const cap = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
    if (cap > 0) {
      const label = document.createElement('div');
      label.className = 'ctitle packHead';
      label.textContent = ITEM_PROPS[backpackItemId()]?.name || 'Backpack';
      // with a chest open, Pull all is the chest's; otherwise the pack gets its own beside its name
      if (!activeChest) label.appendChild(invButton('Pull all', 'Take everything out of your backpack', pullAll));
      invEl.appendChild(label);
      invEl.appendChild(mkGrid(invSlots2, 'inv2', cap));
    }
  }
  invEl.appendChild(mkGrid(invSlots, 'inv'));
  // survival: sort / transfer all / pull all / quick stack, under the slots (0.755)
  if (!player.canFly) invEl.appendChild(_invActionBar());
  // survival: crafting list on the left, plus the furnace GUI on the right when one is open
  if (!player.canFly) buildCraftPanel();
  if (activeFurnace) buildFurnacePanel();
  if (activeChest) buildChestPanel();
  // equipment shares the right-hand column with the furnace and chest GUIs, so it yields to them
  if (activeStructBlock) buildStructPanel();
  // equipment yields the right-hand column to whichever GUI is open there
  else if (!activeFurnace && !activeChest) buildEquipPanel();
  // the skill tree, when it is up, replaces every panel above (0.79, 45-skills.js)
  if (typeof syncSkillView === 'function') syncSkillView();
  alignInvWrap();
}
/* The inventory grid sits straight above the hotbar (0.7575). The wings either side are different
   widths — crafting on the left is wider than equipment, a chest or a furnace on the right is different
   again — so centring the whole row pushed the grid off to one side. The row is slid until the grid's
   centre matches the hotbar's, but never so far that a wing leaves its viewport. Rects are on-screen
   pixels; the split-screen HUD is scaled, so the offset is divided back into CSS pixels. */
function alignInvWrap() {
  if (!invWrapEl || !invEl || invWrapEl.style.display === 'none') return;
  invWrapEl.style.transform = 'translateX(-50%)';
  const a = invEl.getBoundingClientRect(), h = hotbarEl.getBoundingClientRect();
  if (!a.width || !h.width) return;
  const s = invScale();
  let dx = (h.left + h.width / 2) - (a.left + a.width / 2);
  let lo = Infinity, hi = -Infinity;
  for (const c of invWrapEl.children) {
    const r = c.getBoundingClientRect();
    if (!r.width) continue;
    lo = Math.min(lo, r.left); hi = Math.max(hi, r.right);
  }
  const pane = invWrapEl.closest('.hudPane');
  const v = pane ? pane.getBoundingClientRect() : { left: 0, right: innerWidth };
  if (hi + dx > v.right - 8) dx = v.right - 8 - hi;
  if (lo + dx < v.left + 8) dx = v.left + 8 - lo;
  invWrapEl.style.transform = `translateX(calc(-50% + ${(dx / s).toFixed(1)}px))`;
}
function refreshSlotsUI() { buildHotbar(); buildInventory(); saveAll(); }

/* ---- virtual cursor + drag ghost (one shared cursor for mouse & gamepad) ---- */
var vcurEl = document.createElement('div');  vcurEl.id = 'vcursor';  document.body.appendChild(vcurEl);
var vdragEl = document.createElement('div'); vdragEl.id = 'vdrag';   document.body.appendChild(vdragEl);
var ctipEl  = document.createElement('div'); ctipEl.id  = 'ctip';    document.body.appendChild(ctipEl);
var invCursor = { x: innerWidth / 2, y: innerHeight / 2, mode: 'mouse' };
var dragFrom = null, dragHeld = null;           // {region,i} being dragged + the block id in hand

// slot geometry is coordinate-based (getBoundingClientRect), so the pointer-events:none hotbar
// row is a valid drag target too — hotbar and grid behave as one connected slot space.
function slotDescriptors() {
  const out = [];
  const hs = hotbarSlotEls();                  // never the offhand slot parked beside them
  for (let i = 0; i < hs.length; i++) out.push({ region: 'hot', i, el: hs[i] });
  for (const g of invEl.querySelectorAll('.grid')) {   // one entry per grid; region from data-region
    const region = g.dataset.region, gs = g.querySelectorAll('.slot');
    for (let i = 0; i < gs.length; i++) out.push({ region, i, el: gs[i] });   // DOM order == slot index
  }
  const fp = invPanel('furnacePanel');
  if (fp && fp.style.display !== 'none')
    for (const el of fp.querySelectorAll('.slot')) out.push({ region: 'fur', i: +el.dataset.fi, el });
  const eqp = invPanel('equipPanel');
  if (eqp && eqp.style.display !== 'none') {
    for (const el of eqp.querySelectorAll('.slot.eq')) out.push({ region: 'equip', i: +el.dataset.eq, el });
    for (const el of eqp.querySelectorAll('.slot.belt')) out.push({ region: 'belt', i: +el.dataset.belt, el });
  }
  const chp = invPanel('chestPanel');
  if (chp && chp.style.display !== 'none')
    for (const g of chp.querySelectorAll('.grid')) {        // 'chest' and, for a double, 'chest2'
      const region = g.dataset.region, gs = g.querySelectorAll('.slot');
      for (let i = 0; i < gs.length; i++) out.push({ region, i, el: gs[i] });
    }
  return out;
}
function slotAtPoint(x, y) {
  for (const d of slotDescriptors()) {
    const r = d.el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return d;
  }
  return null;
}
function nearestSlot(x, y) {
  let best = null, bd = 1e9;
  for (const d of slotDescriptors()) {
    const r = d.el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, dist = Math.hypot(x - cx, y - cy);
    if (dist < bd) { bd = dist; best = { region: d.region, i: d.i, el: d.el, cx, cy, dist }; }
  }
  return best;
}
function hoveredSlot() {                         // slot under the cursor, else the nearest if close
  return slotAtPoint(invCursor.x, invCursor.y) || (() => {
    const n = nearestSlot(invCursor.x, invCursor.y); return n && n.dist < 34 ? n : null;
  })();
}

/* ---- item tooltip ----
   One fixed-width panel: name, then the (author-supplied) description, then a stat block that
   depends on what the thing is. Tools list wear + combat + mining numbers, food lists what it
   restores. Blocks and plain materials show just the name and description. */
const _tipNum = (n) => Number.isInteger(n) ? String(n) : (+n).toFixed(2).replace(/\.?0+$/, '');
const _tipEsc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
/* m:ss, because a spoil time is read as a countdown rather than as a number of seconds. Anything
   under a minute stays in plain seconds, where "45s" is quicker to read than "0:45". */
function _tipTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return s < 60 ? s + 's' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function itemTooltipHTML(id, dur, fresh, wm) {
  if (id == null) return '';
  const isItem = id >= 256;
  const p = isItem ? ITEM_PROPS[id] : PROPS[id];
  if (!p) return '';
  let html = `<div class="tipName">${_tipEsc(p.name || '')}</div>`;   // wear is a stat row here, not in the name (0.7591)
  if (p.desc) html += `<div class="tipDesc">${_tipEsc(p.desc)}</div>`;
  /* Set bonus (0.731). Written once per MATERIAL in ARMOR_SET_BONUS rather than copied into five
     `desc` strings, so the wording can never drift between the helmet and the boots. Gloves are
     not part of the set, so they simply do not carry the line (0.732). */
  /* What an item DOES, one block per trigger (0.7592):
         On {condition}:
             {effect, or No effect}
     A worn piece always says what wearing it does, even when that is nothing, so an empty line reads
     as "checked" rather than "forgotten". */
  const conds = [];                                   // [condition, effect, '' | 'bad' | 'none']
  if (p.equip) {
    if (p.equip !== 'gloves' && p.armorMat && typeof ARMOR_SET_BONUS !== 'undefined') {
      const b = ARMOR_SET_BONUS[p.armorMat];
      if (b) conds.push(['full set', b.desc.replace(/^Full set:\s*/i, ''), b.good ? '' : 'bad']);
    }
    if (p.shield) conds.push(['raise', 'Slows you down, cannot sprint', 'bad']);
    conds.push(['worn', p.packSlots ? `+${p.packSlots} backpack slots`
                      : p.beltSlots ? `+${p.beltSlots} belt slots`
                      : p.chisel ? 'Hold Q (hold B on a gamepad) to pick a block shape' : 'No effect',   // 0.78
                (p.packSlots || p.beltSlots || p.chisel) ? '' : 'none']);
  }
  if (p.ammo) conds.push(['hit', 'No effect', 'none']);
  if (p.foodClearEffects) conds.push(['drink', 'Removes all active effects', '']);   // milk (0.767)
  const ed = p.foodEffect && typeof EFFECT_DEFS !== 'undefined' ? EFFECT_DEFS[p.foodEffect] : null;
  if (ed) {
    const ch = p.foodEffectChance;                    // a chance effect says how likely it is (0.761)
    const what = `${ed.name} (${ed.time}s)`;          // "50% chance to Nausea (10s)" (0.7611)
    conds.push(['eat', ch != null && ch < 1 ? `${Math.round(ch * 100)}% chance to ${what}` : what, ed.good ? '' : 'bad']);
  }
  for (const [c, eff, cls] of conds)
    html += `<div class="tipCond"><div class="tcName">On ${c}:</div>` +
            `<div class="tcEff${cls ? ' ' + cls : ''}">${_tipEsc(eff)}</div></div>`;
  const rows = [];
  // weapons read like tools: a bow lists durability, damage and attack speed too (0.7593)
  if (p.tool || p.ranged) {
    const maxD = p.durability;
    if (maxD) rows.push(['durability', `${dur != null ? dur : maxD}/${maxD}`]);
    if (p.damage != null) rows.push(['damage', _tipNum(p.damage)]);
    /* A bow's shot (0.767): what an arrow does from the weakest release that still fires up to a full
       draw, by the same formula fireRanged uses (strength from gear is added on top of both). */
    if (p.ranged && typeof rangedProps === 'function' && typeof ammoProps === 'function') {
      const rp = rangedProps(id), ap = rp && ammoProps(ammoIdsFor(rp)[0]);
      if (ap) {
        const shot = (draw) => ap.damage * (0.35 + 0.65 * draw) * (rp.dmgMul || 1);
        rows.push(['shot damage', `${shot(rp.minDraw || 0).toFixed(1)}–${shot(1).toFixed(1)}`]);
      }
    }
    if (p.attackSpeed != null) rows.push(['attack speed', _tipNum(p.attackSpeed)]);
    if (p.toolSpeed != null) rows.push(['mine speed', _tipNum(p.toolSpeed)]);
  }
  if (p.equip) {
    const maxD = p.durability;
    if (maxD) rows.push(['durability', `${dur != null ? dur : maxD}/${maxD}`]);
    if (p.armor != null) rows.push(['defense', _tipNum(p.armor)]);   // called defense since 0.7612
    // stat modifiers only listed when the piece actually carries them
    if (p.strength) rows.push(['strength', (p.strength > 0 ? '+' : '') + _tipNum(p.strength)]);
    if (p.moveSpeed) rows.push(['move speed', (p.moveSpeed > 0 ? '+' : '') + _tipNum(p.moveSpeed * 100) + '%']);
    if (p.atkSpeed) rows.push(['attack speed', (p.atkSpeed > 0 ? '+' : '') + _tipNum(p.atkSpeed * 100) + '%']);
    if (p.coldResist) rows.push(['cold resistance', (p.coldResist > 0 ? '+' : '') + _tipNum(p.coldResist * 100) + '%']);
    if (p.heatResist) rows.push(['heat resistance', (p.heatResist > 0 ? '+' : '') + _tipNum(p.heatResist * 100) + '%']);
  }
  /* Mender (0.79): anything that wears says what a repair costs and where it can be done — cost in the
     tooltip, where you look before you drag it over. Broken says so; Well made (Fine Work) says so. */
  if (p.durability) {
    if (wm) rows.push(['quality', 'Well made']);
    if (dur === 0) rows.push(['status', 'Broken']);
    const cost = typeof hasSkill === 'function' && hasSkill('mender') && typeof repairCostText === 'function'
      ? repairCostText(id) : '';
    if (cost) {
      rows.push(['repair cost', _tipEsc(cost)]);
      rows.push(['repair at', repairNeedsBench(id) ? 'crafting bench' : 'anywhere']);
    }
  }
  if (p.food != null) {
    rows.push(['food', _tipNum(p.food)]);
    if (p.foodSat != null) rows.push(['sat', _tipNum(p.foodSat)]);
    if (p.foodSatFull != null) rows.push(['satAtFull', _tipNum(p.foodSatFull)]);
    if (p.foodHeal) rows.push(['health', '+' + _tipNum(p.foodHeal)]);          // 0.758
    rows.push(['consume time', _tipNum(p.eatTime ?? EAT_TIME) + 's']);
    /* How long this food has left before one of it spoils, against how long it keeps from fresh
       (0.7891). A recipe icon has no instance behind it, so it shows the full shelf life. */
    const maxF = typeof spoilMax === 'function' ? spoilMax(id) : 0;
    // in real seconds: Preserver stretches both (0.7911)
    const rate = typeof spoilRate === 'function' ? spoilRate() : 1;
    if (maxF) rows.push(['spoils in', `${_tipTime((fresh != null ? fresh : maxF) / rate)} / ${_tipTime(maxF / rate)}`]);
  }
  if (rows.length) {
    html += '<div class="tipStats">';
    for (const [k, v] of rows) html += `<div class="tipRow"><span>${k}</span><b>${v}</b></div>`;
    html += '</div>';
  }
  return html;
}
/* The name that pops up over the hotbar (0.759). A tool, bow or shield in the main hand carries its wear,
   "Stone pickaxe (87/100)"; anything else is just its name, and the tooltip keeps the plain name (0.7591).
   `dur` null means never used. */
function itemDisplayName(id, dur) {
  const p = id >= 256 ? ITEM_PROPS[id] : PROPS[id];
  if (!p) return '';
  const max = (p.tool || p.ranged || p.shield || p.chisel) ? p.durability : 0;
  if (max && dur === 0) return `${p.name} (broken)`;         // kept by Mender, waiting for repair (0.79)
  return max ? `${p.name} (${dur != null ? dur : max}/${max})` : (p.name || '');
}
// place the panel near the cursor but always fully on screen
function showTooltip(html) {
  ctipEl.innerHTML = html;
  ctipEl.style.display = 'block';
  const r = ctipEl.getBoundingClientRect();
  let x = invCursor.x + 16, y = invCursor.y + 18;
  if (x + r.width > window.innerWidth - 6) x = invCursor.x - r.width - 12;
  if (y + r.height > window.innerHeight - 6) y = invCursor.y - r.height - 12;
  ctipEl.style.left = Math.max(6, x) + 'px';
  ctipEl.style.top = Math.max(6, y) + 'px';
}

// crafting icons: get all .cing (ingredients) and .cbtn (output) with title attributes for tooltips
function getCraftingElements() {
  const out = [];
  /* the furnace's smelting book shows the same icons, read-only (0.775). Type 'book' gives them, the
     tabs and the book button their own stronger pad magnet (0.7762); rows scrolled out of the list are skipped. */
  const fp = invPanel('furnacePanel');
  if (fp && fp.style.display !== 'none') {
    for (const el of fp.querySelectorAll('.fbookBtn, #furnTabs .ctab')) out.push({ el, title: '', type: 'book' });
    _pushListIcons(out, fp.querySelector('.fbList'), '.cing', 'book');
  }
  const cp = invPanel('craftPanel');
  if (!cp || cp.style.display === 'none') return out;
  // data-id carries the real block/item so the tooltip can show the full stat panel, not just a name
  _pushListIcons(out, cp.querySelector('#craftList'), '.cing, .cbtn', 'craft');
  for (const el of cp.querySelectorAll('.cing, .cbtn'))
    if (!el.closest('#craftList')) out.push({ el, title: el.dataset.name || '', id: +el.dataset.id, type: 'craft' });
  return out;
}
/* Icons in a scrolling list (recipe list, furnace book) count only while their centre is in view, and
   carry the list's box as `clip` so a tooltip also needs the cursor inside it — a row scrolled away
   under the edge must not answer for the slot next to it (0.7763). */
function _pushListIcons(out, list, sel, type) {
  if (!list) return;
  const lr = list.getBoundingClientRect();
  for (const el of list.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(), cy = r.top + r.height / 2;
    if (!r.height || cy < lr.top || cy > lr.bottom) continue;
    out.push({ el, title: el.dataset.name || '', id: +el.dataset.id, type, clip: lr });
  }
}
const _inClip = (c) => !c || (invCursor.x >= c.left && invCursor.x <= c.right && invCursor.y >= c.top && invCursor.y <= c.bottom);

// nearest interactive element: slots or crafting icons, used for cursor magnet + tooltip
function nearestElement(x, y) {
  let best = null, bd = 1e9;
  for (const d of slotDescriptors()) {
    const r = d.el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, dist = Math.hypot(x - cx, y - cy);
    if (dist < bd) { bd = dist; best = { el: d.el, cx, cy, dist, type: 'slot' }; }
  }
  for (const d of getCraftingElements()) {
    const r = d.el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, dist = Math.hypot(x - cx, y - cy);
    if (dist < bd) { bd = dist; best = { el: d.el, cx, cy, dist, type: d.type, title: d.title, id: d.id, clip: d.clip }; }
  }
  /* Stat and effect lines in the equipment panel (0.7611). A line is wide and thin, so it is measured to
     its nearest EDGE rather than its centre: anywhere on the line counts as on it, for the mouse and
     for the pad cursor's magnet alike. */
  // the Skill tree button and, while the tree is up, its tabs and skills (0.79)
  if (typeof getSkillElements === 'function')
    for (const d of getSkillElements()) {
      const r = d.el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, dist = Math.hypot(x - cx, y - cy);
      if (dist < bd) { bd = dist; best = { el: d.el, cx, cy, dist, type: 'skill', tip: d.tip }; }
    }
  for (const d of getInfoElements()) {
    const r = d.el.getBoundingClientRect();
    const dist = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (dist < bd) { bd = dist; best = { el: d.el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, dist, type: 'info', tip: d.tip }; }
  }
  return best;
}
// the hoverable lines of the equipment panel's Stats and Effects lists, each with its tooltip builder
function getInfoElements() {
  const panel = invPanel('equipPanel');
  if (!panel || panel.style.display === 'none' || typeof statTipHTML !== 'function') return [];
  const out = [];
  for (const el of panel.querySelectorAll('.stRow[data-tip]')) out.push({ el, tip: () => statTipHTML(el.dataset.tip) });
  for (const el of panel.querySelectorAll('.stRow[data-eff]')) out.push({ el, tip: () => effectTipHTML(+el.dataset.eff) });
  return out;
}

/* ---- drag / transfer actions, shared by mouse and gamepad ---- */
// pick up from a slot into the hand. take: 'all' | 'half' | 1
function pickUp(region, i, take = 'all') {
  if (dragHeld) return;
  const arr = slotArr(region), s = arr[i];
  if (s == null) return;
  const n = Math.min(s.count, take === 'all' ? s.count : take === 'half' ? Math.ceil(s.count / 2) : 1);
  if (region === 'fur') furnaceTakeXP(i, n);        // the smelt XP goes to whoever takes it (0.775)
  dragHeld = carrySlot(s, n);
  s.count -= n;
  if (s.count <= 0) arr[i] = null;
  dragFrom = { region, i };
  if (region === 'equip') _syncWornGrids();        // belt or pack removed -> empty its slots
  refreshSlotsUI();
}
// a belt and a backpack both open slots that only exist while they are worn, so both have to give
// their contents back the instant the gear leaves the panel
function _syncWornGrids() {
  syncBeltCapacity();
  if (typeof syncBackpackCapacity === 'function') syncBackpackCapacity();
}
// place from the hand into a slot. n: 'all' | 1. Different id + full place = swap (item stays in hand).
function placeInto(region, i, n = 'all') {
  if (!dragHeld) return;
  if (region === 'fur') {
    if (i === 2 || i === ASH_SLOT) return;                   // output and ashes: take-only
    if (i === 0 && !FUEL_SMELTS[dragHeld.id]) return;        // fuel slot: coal / coal chunk only
  }
  // equipment: each slot only takes its own piece; the reserved slots take nothing yet
  if (region === 'equip' && !equipAccepts(i, dragHeld.id)) return;
  if (region === 'belt'  && !beltAccepts(i, dragHeld.id)) return;
  // the backpack's locked rows, if a cursor ever reaches past what the worn pack opened
  if (region === 'inv2' && typeof gridLen === 'function' && i >= gridLen(invSlots2)) return;
  const arr = slotArr(region), dst = arr[i];
  const want = n === 'all' ? dragHeld.count : 1;
  if (dst == null) {
    arr[i] = carrySlot(dragHeld, want);
    dragHeld.count -= want;
  } else if (dst.id === dragHeld.id && dst.count < stackSize(dst.id)) {
    // same id with room to spare: top the target stack up
    const moved = Math.min(stackSize(dst.id) - dst.count, want);
    stackInto(dst, moved, dragHeld.fresh ?? null); dragHeld.count -= moved;
  } else if (n === 'all') {                       // swap: target stack goes into the hand
    // Also the path for two of the SAME stack-1 item (tools). Merging there always moves zero,
    // so without the `dst.count < cap` guard above the click silently did nothing — you could
    // never trade a worn pickaxe for a fresh one.
    const tmp = dst; arr[i] = dragHeld; dragHeld = tmp; dragFrom = { region, i };
    // a swap changes what is worn too — trading a big pack for a small one has to trim (0.75)
    if (region === 'equip') _syncWornGrids();
    refreshSlotsUI(); return;
  }
  if (dragHeld.count <= 0) { dragHeld = null; dragFrom = null; }
  if (region === 'equip') _syncWornGrids();        // gear swapped for a smaller one -> trim
  refreshSlotsUI();
}
/* Middle-click sort: tidies just the grid under the cursor (hotbar, inventory, or an open
   chest). Stacks of the same item merge up to their cap first, then everything orders by name
   and empty slots fall to the end. Worn tools keep their own entry so wear is never averaged.
   The creative palette is deliberately excluded — it is a fixed layout, not storage. */
function sortRegion(region) {
  if (region === 'fur') return;                      // furnace slots are positional, not storage
  if (player.canFly && (region === 'hot' || region === 'inv' || region === 'inv2')) {
    toast('sorting is off in creative');
    return;
  }
  // middle-click matches the buttons (0.7571): the main grid and a worn backpack are one inventory,
  // and both halves of a large chest are one chest
  if (region === 'inv' || region === 'inv2') { sortPlayerInventory(); return; }
  if (region === 'chest' || region === 'chest2') { sortChest(); return; }
  const arr = slotArr(region);
  if (!arr || !arr.length) return;
  const len = gridLen(arr);                          // the backpack sorts only what it opened
  const out = [];
  for (let k = 0; k < len; k++) {
    const s = arr[k];
    if (!s) continue;
    if (s.dur != null) { out.push(carrySlot(s, s.count)); continue; }   // tool: keep its wear
    const cap = stackSize(s.id);
    let left = s.count;
    for (const o of out) {                           // top up any partial stack of the same id
      if (o.id !== s.id || o.dur != null || o.count >= cap) continue;
      const m = Math.min(cap - o.count, left);
      stackInto(o, m, s.fresh ?? null); left -= m;
      if (left <= 0) break;
    }
    while (left > 0) { const t = Math.min(cap, left); out.push(mkSlot(s.id, t)); left -= t; }
  }
  const nameOf = (s) => (s.id >= 256 ? ITEM_PROPS[s.id]?.name : PROPS[s.id]?.name) || '';
  out.sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || b.count - a.count);
  for (let i = 0; i < len; i++) arr[i] = out[i] || null;
  refreshSlotsUI();
}

// legacy pad entry points — same click-carry model
function beginDrag(region, i) { pickUp(region, i, 'all'); }
function endDrag(region, i)   { placeInto(region, i, 'all'); }
function cancelDrag() {                          // return the held item to any room in hotbar+inventory
  if (!dragHeld) return;
  const cap = stackSize(dragHeld.id);
  // never auto-return into furnace slots (output is take-only, fuel is restricted)
  for (const arr of [slotArr(dragFrom && dragFrom.region !== 'fur' ? dragFrom.region : 'hot'), HOTBAR, invSlots])
    for (let i = 0, n = gridLen(arr); i < n && dragHeld.count > 0; i++) {
      const s = arr[i];
      if (s && s.id === dragHeld.id && s.count < cap) {
        const t = Math.min(cap - s.count, dragHeld.count);
        stackInto(s, t, dragHeld.fresh ?? null); dragHeld.count -= t;
      } else if (s == null) {
        arr[i] = carrySlot(dragHeld, Math.min(cap, dragHeld.count));
        dragHeld.count -= arr[i].count;
      }
    }
  dragHeld = null; dragFrom = null;
  refreshSlotsUI();
}
/* Grid scans for the transfer helpers, all bounded by gridLen so a quick-move can never stuff
   something into a backpack row the worn pack has not opened. */
function _gridPartial(g, id, cap) {
  const n = gridLen(g);
  for (let i = 0; i < n; i++) { const o = g[i]; if (o && o.id === id && o.count < cap) return o; }
  return null;
}
function _gridEmpty(g) {
  const n = gridLen(g);
  for (let i = 0; i < n; i++) if (g[i] == null) return i;
  return -1;
}
// active-furnace push: for items that are BOTH smeltable AND fuel (e.g. logs), prefer the input
// slot first (empty or same id) and only fall through to fuel when input is blocked. Prevents
// shift-clicking a log ending up as fuel while another log is already smelting.
// Returns amount placed (0 = furnace not open, wrong item, or both slots occupied by another id).
function _pushFurnace(id, want) {
  if (!activeFurnace) return 0;
  const f = FURNACES.get(activeFurnace); if (!f) return 0;
  const isSmelt = SMELT[id] !== undefined;
  const isFuel  = FUEL_SMELTS[id] !== undefined;
  if (!isSmelt && !isFuel) return 0;
  const cap = stackSize(id);
  const tryPush = (slotIdx) => {
    const s = f.slots[slotIdx];
    if (s == null) { f.slots[slotIdx] = mkSlot(id, Math.min(cap, want)); _refreshFurnaceSlots(activeFurnace); return f.slots[slotIdx].count; }
    if (s.id === id && s.count < cap) { const m = Math.min(cap - s.count, want); s.count += m; _refreshFurnaceSlots(activeFurnace); return m; }
    return 0;
  };
  // input first if smeltable (empty or same id); then fuel if fuel-capable
  if (isSmelt) { const m = tryPush(1); if (m > 0) return m; }
  if (isFuel)  { const m = tryPush(0); if (m > 0) return m; }
  return 0;
}
// quick-move destinations, in priority order, for a given source region. The second inventory
// grid (invSlots2) only exists in the creative UI (player.canFly), so include it only then —
// otherwise a full first grid wrongly reports "full" while inv2 sits empty.
function destGrids(region) {
  // ...and in survival it exists only while a backpack is worn (0.75), sized by that pack
  const useInv2 = player.canFly || (typeof backpackCapacity === 'function' && backpackCapacity() > 0);
  // an open chest is the natural quick-move target: player grids feed it, and its own slots
  // feed back into the player
  const chestArrs = [];
  if (activeChest && CHESTS.get(activeChest)) chestArrs.push(CHESTS.get(activeChest).slots);
  if (activeChest2 && CHESTS.get(activeChest2)) chestArrs.push(CHESTS.get(activeChest2).slots);
  if (region === 'chest' || region === 'chest2')
    return useInv2 ? [HOTBAR, invSlots, invSlots2] : [HOTBAR, invSlots];
  if (chestArrs.length && (region === 'hot' || region === 'inv' || region === 'inv2'))
    return chestArrs;
  if (region === 'hot')  return useInv2 ? [invSlots, invSlots2] : [invSlots];
  if (region === 'inv')  return useInv2 ? [HOTBAR, invSlots2]   : [HOTBAR];
  if (region === 'inv2') return [HOTBAR, invSlots];
  return useInv2 ? [HOTBAR, invSlots, invSlots2] : [HOTBAR, invSlots];   // furnace output etc.
}
// move exactly 1 item to the other grids (ctrl+right-click)
function transferOne(region, i) {
  const arr = slotArr(region), s = arr[i];
  if (s == null) return;
  // furnace open: route smeltables/fuels straight to the matching furnace slot
  if (region !== 'fur' && _pushFurnace(s.id, 1) > 0) {
    s.count--; if (s.count <= 0) arr[i] = null;
    refreshSlotsUI(); return;
  }
  const cap = stackSize(s.id), dests = _destsFor(region, s.id);
  let placed = false;
  for (const g of dests) { const p = _gridPartial(g, s.id, cap); if (p) { stackInto(p, 1, s.fresh ?? null); placed = true; break; } }
  if (!placed) for (const g of dests) { const f = _gridEmpty(g); if (f >= 0) { g[f] = carrySlot(s, 1); placed = true; break; } }
  if (!placed) { toast('no space'); return; }
  if (region === 'fur') furnaceTakeXP(i, 1);
  s.count--;
  if (s.count <= 0) arr[i] = null;
  if (region === 'equip') _syncWornGrids();
  refreshSlotsUI();
}
/* ---- wearing things straight from the grids (0.7522) ----
   Shift+LMB (and Y on a pad) on something you can WEAR puts it on instead of moving it across:
   armour into its slot, a shield or a stack of torches into the offhand, and torches also top up a
   torch stack already in the offhand. It only fills an EMPTY slot, and only while the equipment
   panel is actually on screen; otherwise it falls back to the ordinary quick-move. Shift+RMB is the
   one that REPLACES what you are wearing, see swapEquip. */
const _equipShown = () => !player.canFly && !activeFurnace && !activeChest && !activeStructBlock;
const _isPlayerGrid = (region) => region === 'hot' || region === 'inv' || region === 'inv2';
function _quickEquip(region, i) {
  if (!_equipShown() || !_isPlayerGrid(region)) return false;
  const arr = slotArr(region), s = arr[i];
  if (!s) return false;
  const room = offhandRoom(s.id, s.dur ?? null);
  if (room > 0) {
    const t = Math.min(room, s.count);
    stackInto(equipSlots[EQUIP_INDEX.offhand], t, s.fresh ?? null);
    s.count -= t;
    if (s.count <= 0) arr[i] = null;
  } else {
    const k = equipSlotFor(s.id);
    if (k < 0 || equipSlots[k]) return false;
    equipSlots[k] = s;
    arr[i] = null;
  }
  saveEquip(); _syncWornGrids(); refreshSlotsUI();
  return true;
}
/* Shift+RMB: wear it, trading places with whatever that slot already holds; the old piece lands in
   the slot the new one came from. An empty slot is simply filled. */
function swapEquip(region, i) {
  if (!_equipShown() || !_isPlayerGrid(region)) return false;
  const arr = slotArr(region), s = arr[i];
  if (!s) return false;
  const k = equipSlotFor(s.id);
  if (k < 0) return false;
  const worn = equipSlots[k];
  equipSlots[k] = s;
  arr[i] = worn || null;
  saveEquip(); _syncWornGrids(); refreshSlotsUI();
  return true;
}
// a backpack being taken off must not be quick-moved into the very grid it is about to close
function _destsFor(region, id) {
  const d = destGrids(region);
  return region === 'equip' && isBackpackId(id) ? d.filter(g => g !== invSlots2) : d;
}

/* ---- inventory buttons: sort, transfer all, pull all, quick stack (0.755) ----
   A row under the slots. SORT merges stacks and orders the main grid and a worn backpack by name, as
   one list; the hotbar is left exactly as you set it. The other three move stacks between you and a
   TARGET: an open chest (both halves of a double one) against your main grid and backpack, or, with
   no chest open, a worn backpack against the main grid. With neither they are greyed out.
     Transfer all  everything from your side into the target (never the hotbar)
     Pull all      everything out of the target: main grid, then backpack, then hotbar
     Quick stack   only what the target already holds some of
   Moves top up partial stacks before taking empty slots, keep tool wear, and respect the backpack's
   locked rows through gridLen. */
function _stashTarget() {
  if (player.canFly) return null;
  const packN = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
  if (activeChest && CHESTS.get(activeChest)) {
    const grids = [CHESTS.get(activeChest).slots];
    if (activeChest2 && CHESTS.get(activeChest2)) grids.push(CHESTS.get(activeChest2).slots);
    return { kind: 'chest', grids, mine: packN > 0 ? [invSlots, invSlots2] : [invSlots] };
  }
  if (packN > 0) return { kind: 'pack', grids: [invSlots2], mine: [invSlots] };
  return null;
}
// one stack into a list of grids: partial stacks first, then empty slots. Returns how many are left.
function _moveStack(s, grids) {
  const cap = stackSize(s.id);
  let left = s.count;
  if (s.dur == null)
    for (const g of grids)
      for (let i = 0, n = gridLen(g); i < n && left > 0; i++) {
        const o = g[i];
        if (o && o.id === s.id && o.dur == null && o.count < cap) {
          const t = Math.min(cap - o.count, left);
          stackInto(o, t, s.fresh ?? null); left -= t;
        }
      }
  for (const g of grids)
    for (let i = 0, n = gridLen(g); i < n && left > 0; i++)
      if (g[i] == null) { const t = Math.min(cap, left); g[i] = carrySlot(s, t); left -= t; }
  return left;
}
function _moveAll(from, to, only) {
  let moved = 0;
  for (const g of from)
    for (let i = 0, n = gridLen(g); i < n; i++) {
      const s = g[i];
      if (!s || (only && !only(s))) continue;
      const left = _moveStack(s, to);
      moved += s.count - left;
      if (left <= 0) g[i] = null; else s.count = left;
    }
  return moved;
}
const _slotName = (s) => (s.id >= 256 ? ITEM_PROPS[s.id]?.name : PROPS[s.id]?.name) || '';
/* One sort for every storage (0.7571): merge partial stacks, order by name, and deal the result back
   across the given grids in order, so several grids sort as ONE list. The main grid with a worn backpack,
   the hotbar on its own, and both halves of a large chest all go through here. Worn tools keep their own
   slot and wear; the backpack's locked rows are respected through gridLen. */
function _sortGrids(grids) {
  const pool = [];
  for (const g of grids)
    for (let i = 0, n = gridLen(g); i < n; i++) if (g[i]) { pool.push(g[i]); g[i] = null; }
  const merged = [];
  for (const s of pool) {
    if (s.dur != null) { merged.push(s); continue; }          // a worn tool keeps its own slot
    const cap = stackSize(s.id);
    let left = s.count;
    for (const o of merged) {
      if (o.id !== s.id || o.dur != null || o.count >= cap) continue;
      const t = Math.min(cap - o.count, left);
      stackInto(o, t, s.fresh ?? null); left -= t;
      if (left <= 0) break;
    }
    while (left > 0) { const t = Math.min(cap, left); merged.push(mkSlot(s.id, t)); left -= t; }
  }
  merged.sort((a, b) => _slotName(a).localeCompare(_slotName(b)) || b.count - a.count);
  let k = 0;
  for (const g of grids)
    for (let i = 0, n = gridLen(g); i < n; i++) g[i] = merged[k++] || null;
  refreshSlotsUI();
}
function sortPlayerInventory() {
  if (player.canFly) { toast('sorting is off in creative'); return; }
  _sortGrids(typeof backpackCapacity === 'function' && backpackCapacity() > 0 ? [invSlots, invSlots2] : [invSlots]);
}
function sortHotbar() {
  if (player.canFly) { toast('sorting is off in creative'); return; }
  _sortGrids([HOTBAR]);
}
function sortChest() {
  const a = activeChest && CHESTS.get(activeChest);
  if (!a) return;
  const b = activeChest2 && CHESTS.get(activeChest2);
  _sortGrids(b ? [a.slots, b.slots] : [a.slots]);
}
// a standalone inventory button, for panels that build their own row (the chest's Sort)
function invButton(label, title, fn, enabled = true) {
  const b = document.createElement('button');
  b.className = 'invBtn';
  b.textContent = label;
  b.title = title;
  b.disabled = !enabled;
  b.addEventListener('click', () => { if (!dragHeld) fn(); });
  return b;
}
function _stashRun(fn, emptyMsg) {
  const t = _stashTarget();
  if (!t || dragHeld) return;
  const moved = fn(t);
  if (!moved) toast(emptyMsg || (t.kind === 'chest' ? 'nothing to move, or the chest is full' : 'nothing to move, or no room'));
  refreshSlotsUI();
}
const transferAll = () => _stashRun(t => _moveAll(t.mine, t.grids));
const pullAll     = () => _stashRun(t => _moveAll(t.grids, [...t.mine, HOTBAR]), 'nothing to take, or your inventory is full');
/* The reverse quick stack (0.7575), on the chest's own row: take out only what you already carry some
   of, topping up those stacks first. */
function quickStackToMe() {
  _stashRun(t => {
    const mine = [...t.mine, HOTBAR], have = new Set();
    for (const g of mine) for (let i = 0, n = gridLen(g); i < n; i++) if (g[i]) have.add(g[i].id);
    return _moveAll(t.grids, mine, s => have.has(s.id));
  }, 'nothing you carry is in there, or your inventory is full');
}
function quickStack() {
  _stashRun(t => {
    const have = new Set();
    for (const g of t.grids) for (const s of g) if (s) have.add(s.id);
    return _moveAll(t.mine, t.grids, s => have.has(s.id));
  });
}
function _invActionBar() {
  const bar = document.createElement('div');
  bar.className = 'invActions';
  const t = _stashTarget();
  const where = t ? (t.kind === 'chest' ? 'the chest' : 'your backpack') : null;
  const off = 'Open a chest, or wear a backpack';
  const mk = (label, title, fn, enabled) => {
    const b = document.createElement('button');
    b.className = 'invBtn';
    b.textContent = label;
    b.title = title;
    b.disabled = !enabled;
    b.addEventListener('click', () => { if (!dragHeld) fn(); });
    bar.appendChild(b);
  };
  mk('Sort A-Z', 'Merge stacks and sort your inventory and backpack by name. The hotbar stays as it is.', sortPlayerInventory, true);
  mk('Sort hotbar', 'Merge stacks and sort the hotbar by name', sortHotbar, true);
  mk('Transfer all', where ? `Move everything from your inventory into ${where}` : off, transferAll, !!t);
  // Pull all lives with the storage it empties (0.7575): the chest's row, or the backpack's heading
  mk('Quick stack', where ? `Move only the items ${where} already holds some of` : off, quickStack, !!t);
  return bar;
}

/* ---- Y: throw from the slot under the cursor (0.7523) ----
   One item, or with Shift (X + D-pad Down on a pad) the whole stack. Hovering nothing while carrying a
   stack throws from the carried stack instead. Creative has no drops. */
function dropHovered(n = 1) {
  if (player.canFly) return false;
  const hov = hoveredSlot();
  if (!hov) return dragHeld ? dropHeldStack(n) : false;
  const arr = slotArr(hov.region), s = arr[hov.i];
  if (!s) return false;
  const k = n === 'all' ? s.count : 1;
  throwFromPlayer(s.id, k, s.dur ?? null, slotMeta(s));
  if (typeof feedItem === 'function') feedItem(s.id, -k, 'dropped');
  s.count -= k;
  if (s.count <= 0) arr[hov.i] = null;
  if (hov.region === 'equip') _syncWornGrids();   // a dropped pack or belt gives its contents back
  refreshSlotsUI();
  return true;
}


/* ---- throwing what the cursor carries (0.7522) ----
   Carrying a stack and clicking away from every panel throws it into the world: LMB the whole
   stack, RMB a single one. Creative has no drops, so there it just goes back where it came from. */
function _pointOnInvUI(x, y) {
  const els = [invEl, invPanel('craftPanel'), invPanel('furnacePanel'), invPanel('chestPanel'),
               invPanel('equipPanel'), invPanel('structPanel'), hotbarEl];
  for (const el of els) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}
function dropHeldStack(n = 'all') {
  if (!dragHeld) return false;
  if (player.canFly) { cancelDrag(); return true; }
  const k = n === 'all' ? dragHeld.count : 1;
  const id = dragHeld.id, dur = dragHeld.dur ?? null;
  throwFromPlayer(id, k, dur, slotMeta(dragHeld));
  if (typeof feedItem === 'function') feedItem(id, -k, 'dropped');
  dragHeld.count -= k;
  if (dragHeld.count <= 0) { dragHeld = null; dragFrom = null; }
  refreshSlotsUI();
  return true;
}

function instantTransfer(region, i) {           // shove the whole stack across the other grids
  const arr = slotArr(region), s = arr[i];
  if (s == null) return;
  if (_quickEquip(region, i)) return;                // gear goes on rather than across (0.7522)
  const cap = stackSize(s.id), dests = _destsFor(region, s.id);
  let remaining = s.count;
  if (region !== 'fur') {                        // furnace priority: dump smeltable/fuel into its slot first
    const moved = _pushFurnace(s.id, remaining);
    remaining -= moved;
    if (remaining === 0) { arr[i] = null; refreshSlotsUI(); return; }
  }
  // merge into partial stacks of the same id first, across every destination grid
  for (const g of dests)
    for (let k = 0, n = gridLen(g); k < n && remaining > 0; k++) {
      const o = g[k];
      if (o && o.id === s.id && o.count < cap) {
        const moved = Math.min(cap - o.count, remaining);
        stackInto(o, moved, s.fresh ?? null); remaining -= moved;
      }
    }
  // then land the leftover in the first empty slot found across the grids
  if (remaining > 0) {
    let landed = false;
    for (const g of dests) { const f = _gridEmpty(g); if (f >= 0) { g[f] = carrySlot(s, remaining); remaining = 0; landed = true; break; } }
    if (!landed) {
      if (region === 'fur') furnaceTakeXP(i, s.count - remaining);
      s.count = remaining; refreshSlotsUI(); toast('no space'); return;
    }
  }
  if (region === 'fur') furnaceTakeXP(i, s.count);
  arr[i] = null;
  if (region === 'equip') _syncWornGrids();         // a pack or belt taken off gives its contents back
  refreshSlotsUI();
}

/* Each player has their own inventory panel in their own viewport (0.728), so several people can
   be rummaging at once and nobody is locked out. Only the PAUSE menu is still one shared thing
   over the middle of the screen — that one really is for everybody. */
/* Order of opening, so the single armour-preview renderer can follow the player who opened LAST
   and hand itself back to whoever is still in their inventory when that player closes. A plain
   counter: bigger means more recent. `_invSeq` is per seat (swapped); the counter is not. */
let _invSeqNext = 0;
function toggleInventory(open, mode) {
  if (open === undefined) open = !invOpen;
  if (open === invOpen && mode === undefined) return;
  if (open) { craftMode = mode || 'basic'; buildInventory(); }   // rebuild with the right recipe list
  if (open === invOpen) return;
  invOpen = open;
  _invSeq = open ? ++_invSeqNext : 0;
  invWrapEl.style.display = open ? 'flex' : 'none';
  if (open) {
    alignInvWrap();                             // needs the panel laid out, so after display:flex
    if (document.pointerLockElement) document.exitPointerLock();   // free the cursor
    const r = invEl.getBoundingClientRect();
    invCursor.x = r.left + r.width / 2; invCursor.y = r.top + r.height / 2;
    /* Only seat ZERO owns the mouse. Every other seat is on a pad and has no OS pointer, so
       'mouse' mode there means a cursor that is never drawn and cannot be moved — the inventory
       opens and there is simply nothing on screen. This used to fall back to 'mouse' whenever
       getPad() came back empty for a moment, which is the disappearing cursor (0.734). A pad seat
       is now pinned to 'pad' whatever the pad list says at this instant. */
    invCursor.mode = (activePlayerSlot() === 0 && !getPad()) ? 'mouse' : 'pad';
  } else {
    cancelDrag();
    activeFurnace = null;                       // closing always detaches the furnace GUI
    activeBench = null;                         // ...and a crafting bench's recipe list (0.76)
    chestClosedSound();                         // must run BEFORE the key is cleared
    activeChest = activeChest2 = null;          // ...and the chest, which also shuts its lid
    activeStructBlock = null;                   // structure editor closes with the inventory
    player._skillView = false;                  // ...and so does the skill tree (0.79)
    if (lastHoverEl) { lastHoverEl.classList.remove('hover'); lastHoverEl = null; }
    /* The tooltip has to be torn down HERE rather than left to the next cursor frame: since 0.72
       updateInvCursorVisual only runs while the inventory is open, so the frame that would have
       cleaned it up never comes and the panel stays stranded on screen. */
    vcurEl.style.display = vdragEl.style.display = ctipEl.style.display = 'none';
    if (playing) { lockTries = 0; tryPointerLock(); }
  }
}

// per-frame: clamp + magnet the pad cursor, position the cursor/ghost, and highlight the hover
function invBounds() {
  const a = invWrapEl.getBoundingClientRect(), b = hotbarEl.getBoundingClientRect();
  const out = { l: Math.min(a.left, b.left) - 8, r: Math.max(a.right, b.right) + 8, t: a.top - 8, bm: b.bottom + 8 };
  // the furnace book floats above the panel, outside the wrapper's box — the cursor has to reach it (0.7762)
  const bk = invOpen && activeFurnace ? invWrapEl.querySelector('#furnacePanel .fbook') : null;
  if (bk) {
    const c = bk.getBoundingClientRect();
    out.l = Math.min(out.l, c.left - 8); out.r = Math.max(out.r, c.right + 8); out.t = Math.min(out.t, c.top - 8);
  }
  return out;
}
var lastHoverEl = null;
var _invSeq = 0;                    // when this seat opened its inventory — see toggleInventory
function updateInvCursorVisual(dt) {
  if (!invOpen) {
    if (lastHoverEl) { lastHoverEl.classList.remove('hover'); lastHoverEl = null; }
    vcurEl.style.display = vdragEl.style.display = ctipEl.style.display = 'none';
    return;
  }
  const bnd = invBounds();
  invCursor.x = Math.max(bnd.l, Math.min(bnd.r, invCursor.x));
  invCursor.y = Math.max(bnd.t, Math.min(bnd.bm, invCursor.y));
  if (invCursor.mode === 'pad') {                // magnet snaps to nearest element, but ONLY when
    const n = nearestElement(invCursor.x, invCursor.y);   // the stick is idle — so an active push can
    // crafting icons are small, so they get a wider capture radius and a harder pull
    // and the furnace book's icons and tabs pull hardest still, so a pad lands on one exact icon (0.7762)
    const book = n && (n.type === 'book' || n.type === 'skill');   // skill buttons pull as hard (0.79)
    const snapR = (book ? 150 : n && n.type === 'craft' ? 120 : 80) * invScale();
    if (n && n.dist < snapR && (pad.invStick || 0) < 0.2) {
      const k = Math.min(1, dt * (book ? 50 : n.type === 'craft' ? 30 : 20));
      invCursor.x += (n.cx - invCursor.x) * k;
      invCursor.y += (n.cy - invCursor.y) * k;
    }
    vcurEl.style.display = 'block';
    vcurEl.style.left = invCursor.x + 'px';
    vcurEl.style.top = invCursor.y + 'px';
  } else {
    vcurEl.style.display = 'none';
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
  // a stat or effect line under the cursor is lit up while its tooltip shows (0.7611)
  const infoEl = !dragHeld && !hovSlot && ne && ne.type === 'info' && ne.dist < tipR ? ne.el : null;
  if (infoEl !== player._infoHoverEl) {
    if (player._infoHoverEl) player._infoHoverEl.classList.remove('tipHover');
    if (infoEl) infoEl.classList.add('tipHover');
    player._infoHoverEl = infoEl;
  }
  if (dragHeld) {
    ctipEl.style.display = 'none';
  } else if (hovSlot) {
    showTooltip(itemTooltipHTML(hovSlot.id, hovSlot.dur, hovSlot.fresh, hovSlot.wm));
  } else if (ne && (ne.type === 'craft' || ne.type === 'book') && ne.dist < tipR && ne.title && _inClip(ne.clip)) {
    // recipe icons get the same full panel as a real slot (no durability — it isn't an instance)
    showTooltip(Number.isFinite(ne.id) ? itemTooltipHTML(ne.id, null, null)
                                       : `<div class="tipName">${_tipEsc(ne.title)}</div>`);
  } else if (ne && ne.type === 'skill' && ne.tip && ne.dist < tipR * 1.6) {
    showTooltip(ne.tip());                           // a skill: what it does, costs and needs (0.79)
  } else if (infoEl) {
    showTooltip(ne.tip());                           // what a stat means, or what an effect is doing
  } else {
    ctipEl.style.display = 'none';
  }
  if (dragHeld) {
    vdragEl.style.display = 'block';
    vdragEl.style.left = invCursor.x + 'px';
    vdragEl.style.top = invCursor.y + 'px';
    const dragKey = dragHeld ? `${dragHeld.id}:${dragHeld.count}` : '';
    if (vdragEl.dataset.id !== dragKey) { vdragEl.innerHTML = slotInner(dragHeld); vdragEl.dataset.id = dragKey; }
  } else {
    vdragEl.style.display = 'none';
    vdragEl.dataset.id = '';
  }
}

function drawRadial() {
  const c = radialCtx, S = 360, cx = S / 2, cy = S / 2, n = HOTBAR.length;
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

