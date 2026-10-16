'use strict';
/* ui/inventory.js: the inventory window. Its tabs, building the grids, keeping it placed on screen.
   The rest: inventory-cursor.js, tooltips.js, inventory-transfer.js, inventory-buttons.js, inventory-open.js, and the
   panels (craft-panel.js, furnace-panel.js, chest-panel.js, equip-panel.js, skill-tree.js). */

var invEl = document.getElementById('inv');
var invWrapEl = document.getElementById('invWrap');
var invOpen = false;

/* Every seat owns a CLONE of #invWrap, parked in its own viewport, so
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
   Food renders the same bar off its spoilage clock (44-spoil.js): fresh/max, green -> red.
   Unlike a tool's, the food bar is shown from the moment you pick the food up — an unused
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
  // a block the chisel would shape shows as that shape while it is picked
  const src = typeof chiselSlotIcon === 'function' ? chiselSlotIcon(s.id) : renderBlockIcon(s.id);
  return (src ? `<img class="i3d" src="${src}" alt="">` : '') +
         (s.count > 1 ? `<span class="cnt">${s.count}</span>` : '') + slotDurBar(s) +
         (s.dur === 0 ? '<span class="brk"></span>' : '');    // broken, kept by Mender
};

/* ---- right-panel tabs ----
   The right-hand column shows ONE panel: the open furnace, chest or structure block, or the equipment.
   A row of tabs on top of it switches between them while the inventory stays open: the station's own
   panel, Equipment, and the Skill tree (which, as before, takes over the whole window and has the same
   tabs to come back by). Closing the inventory forgets the pick, so a chest always opens on the chest.
   Only what is ON SCREEN takes part: a hidden chest is no quick-move target, a hidden furnace takes no
   fuel, and gear is only worn from the grids while Equipment shows. */
const invStation = () => activeStructBlock ? 'struct' : activeFurnace ? 'furnace' : activeChest ? 'chest' : null;
function invRightTab() {
  const st = invStation();
  return !st ? 'equip' : (player._invTab === 'equip' && !player.canFly) ? 'equip' : st;
}
const _STATION_TAB = { furnace: 'Furnace', chest: 'Chest', struct: 'Structure' };
// the tab row for the top of a panel, `current` lit; null when there would be only one tab
function invTabsEl(current) {
  const tabs = [], st = invStation();
  if (st) tabs.push([st, st === 'chest' ? chestTabName() : _STATION_TAB[st]]);   // "Large Iron Chest" (blocks/chest.js)
  if (!player.canFly) tabs.push(['equip', 'Equipment']);
  const free = !player.canFly && typeof skillPointsFree === 'function' ? skillPointsFree() : 0;
  if (!player.canFly && typeof openSkillTree === 'function') tabs.push(['skills', free ? `Skill tree (${free})` : 'Skill tree']);
  if (tabs.length < 2) return null;
  const row = document.createElement('div');
  row.className = 'invTabs';
  for (const [key, label] of tabs) {
    const b = document.createElement('button');
    b.className = 'invTab' + (key === current ? ' on' : '') + (key === 'skills' && free ? ' hasPts' : '');
    b.dataset.tab = key;
    b.textContent = label;
    b.addEventListener('click', () => { if (!dragHeld) pickInvTab(key); });
    row.appendChild(b);
  }
  return row;
}
function pickInvTab(key) {
  if (key === 'skills') { if (!player._skillView) openSkillTree(); return; }
  player._invTab = key === 'equip' ? 'equip' : null;
  if (player._skillView) closeSkillTree(); else buildInventory();
}
// D-pad Left / Right step through the tabs, the bumpers being the crafting categories'
function cycleInvTab(dir) {
  const row = invTabsEl(player._skillView ? 'skills' : invRightTab());
  if (!row) return;
  const keys = [...row.children].map(b => b.dataset.tab);
  const i = Math.max(0, keys.indexOf(player._skillView ? 'skills' : invRightTab()));
  pickInvTab(keys[(i + dir + keys.length) % keys.length]);
}
/* While the skill tree is up every other panel stays hidden: a panel's builder asks this first, hides itself
   and builds nothing if so. They are all built again when the tree closes (closeSkillTree rebuilds the inventory). */
function invPanelHeld(panel) {
  if (typeof skillViewOn !== 'function' || !skillViewOn()) return false;
  if (panel) panel.style.display = 'none';
  return true;
}
// put the tab row on top of a right-hand panel
function addInvTabs(panel, current) {
  const t = invTabsEl(current);
  if (t) panel.insertBefore(t, panel.firstChild);
}

function buildInventory() {
  // hide both side panels first; the right one is rebuilt below
  /* ...but not a panel that is coming straight back with a scrolling list in it: the crafting list in
     survival, the furnace with its book. Hidden even for this one pass, a list lets go of where it was scrolled to. */
  const cpEl = invPanel('craftPanel');
  if (cpEl && player.canFly) cpEl.style.display = 'none';
  const fpEl = invPanel('furnacePanel');
  if (fpEl && invRightTab() !== 'furnace') fpEl.style.display = 'none';
  const chpEl = invPanel('chestPanel');
  if (chpEl) chpEl.style.display = 'none';
  const eqpEl = invPanel('equipPanel');
  if (eqpEl) eqpEl.style.display = 'none';
  const stpEl = invPanel('structPanel');
  if (stpEl) stpEl.style.display = 'none';

  // a rebuild while open (every drag and drop) keeps the creative palette where it was scrolled
  const oldScroll = invOpen ? invEl.querySelector('.invScroll') : null;
  const keepScroll = oldScroll ? oldScroll.scrollTop : null;
  invEl.innerHTML =
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
    const _toBottom = () => { scroller.scrollTop = keepScroll ?? scroller.scrollHeight; };
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
      // no Pull all of its own any more: the pack is only more room in your inventory, not a store beside it
      invEl.appendChild(label);
      invEl.appendChild(mkGrid(invSlots2, 'inv2', cap));
    }
  }
  invEl.appendChild(mkGrid(invSlots, 'inv'));
  // survival: sort / transfer all / pull all / quick stack, under the slots
  if (!player.canFly) invEl.appendChild(_invActionBar());
  // survival: crafting list on the left, plus the furnace GUI on the right when one is open
  if (!player.canFly) buildCraftPanel();
  // the right-hand column: whichever tab is picked — the open station's GUI, or the equipment
  const rt = invRightTab();
  if (rt === 'furnace') buildFurnacePanel();
  else if (rt === 'chest') buildChestPanel();
  else if (rt === 'struct') buildStructPanel();
  else buildEquipPanel();
  // the skill tree, when it is up, replaces every panel above (0.79, player/skills.js)
  if (typeof syncSkillView === 'function') syncSkillView();
  alignInvWrap();
}
/* The inventory grid sits straight above the hotbar. The wings either side are different
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
