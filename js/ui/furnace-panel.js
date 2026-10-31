'use strict';
/* ui/furnace-panel.js: the furnace's window and its smelting book. */

/* ---- GUI ---- */
// layout:  [input] [progress→] [output]
//          [flame]             [ash meter]
//          [fuel]              [ashes]
// with the smelting book always open above it (a button in the corner toggled it before)
function buildFurnacePanel() {
  const panel = invPanel('furnacePanel');
  if (!panel) return;
  const f = activeFurnace && FURNACES.get(activeFurnace);
  if (!f || invRightTab() !== 'furnace') { panel.style.display = 'none'; return; }   // or another tab is up
  if (invPanelHeld(panel)) return;                                                    // the skill tree is up
  const bar = (cls) =>
    `<div class="fbar ${cls}"><img class="fbase" src="textures/Gui/Interactables/Lit_progress.png" alt="">` +
    `<div class="ffill"><img src="textures/Gui/Interactables/Lit_progress.png" alt=""></div></div>`;
  /* The book's list is kept in place through a rebuild, only what is in it swapped (swapHtmlKeeping in
     ui/inventory.js): made anew it was scrolled back to where the frame had begun, and at a low frame rate jumped
     back up under the wheel. Where it is now is read off it first, while it is still on screen. */
  const oldList = panel.querySelector('.fbList');
  if (oldList && !panel._scrollTop && oldList.clientHeight > 0) _furnBookScroll = oldList.scrollTop;
  panel._scrollTop = false;
  panel.style.display = 'flex';
  const html =                                              // untitled since 0.796: the Furnace tab names it
    `<div id="furnGrid">` +
      `<div class="fcol">` +
        `<div class="slot" data-fi="1">${slotInner(f.slots[1])}</div>` +
        bar('ffuel') +
        `<div class="slot" data-fi="0">${slotInner(f.slots[0])}</div>` +
      `</div>` +
      bar('fprog rot') +
      `<div class="fcol fout">` +
        `<div class="slot" data-fi="2">${slotInner(f.slots[2])}</div>` +
        `<div class="fash" title="Ashes"><span><i></i></span></div>` +
        `<div class="slot" data-fi="3">${slotInner(f.slots[ASH_SLOT])}</div>` +
      `</div>` +
    `</div>` +
    (furnBookOpen ? _furnBookHtml() : '') +
    // a covered chimney says so, since otherwise it just looks broken
    (f.choked ? '<div class="fChoked">Top covered — nothing smelts, fuel still burns</div>' : '');
  const list = swapHtmlKeeping(panel, html, '.fbList');
  // Furnace / Equipment / Skill tree — on the very top: over the book while it is open
  addInvTabs(panel.querySelector('.fbook') || panel, 'furnace');
  panel.classList.toggle('bookOpen', furnBookOpen);         // squares the top corners where the book joins
  for (const tab of panel.querySelectorAll('#furnTabs .ctab'))
    tab.addEventListener('click', () => { furnBookCat = tab.dataset.cat; _furnBookScroll = 0; panel._scrollTop = true; buildFurnacePanel(); });
  if (list) {
    if (Math.abs(list.scrollTop - _furnBookScroll) > 1) list.scrollTop = _furnBookScroll;
    if (list !== oldList)                                   // a new list: its own listener, never saving a 0 read off the page
      list.addEventListener('scroll', () => { if (list.isConnected && list.clientHeight > 0) _furnBookScroll = list.scrollTop; });
    _sizeFurnBook(panel);
    /* ...and again once the frame has laid out. Opening a furnace with the book already open builds
       this panel before the inventory is shown and slid into place, so the first measurement read a panel
       that was not where it would be, found no room above it and squeezed the list to its minimum. */
    requestAnimationFrame(() => _sizeFurnBook(panel));
  }
  _updateFurnaceBars();
}
/* The book floats above the panel so the slots never move; its list shrinks when the panel sits too
   close to the top of the screen for the full height. */
function _sizeFurnBook(panel) {
  const book = panel.querySelector('.fbook'), list = panel.querySelector('.fbList');
  if (!book || !list || !panel.isConnected || panel.style.display === 'none') return;
  const top = panel.getBoundingClientRect().top;
  if (!top) return;                                          // not laid out yet: the next frame sizes it
  const room = top - 12 - (book.offsetHeight - list.offsetHeight) - 6;
  const h = Math.max(120, Math.min(320, room)) + 'px';
  if (list.style.height !== h) list.style.height = h;
  if (Math.abs(list.scrollTop - _furnBookScroll) > 1) list.scrollTop = _furnBookScroll;   // only when it is not there
}

/* ---- smelting book ----
   Read-only rows in the crafting list's look: input, time and fuel, arrow, output, XP. Tabs pick a
   category; All shows every category under its own heading, fuel last. */
var furnBookOpen = true, furnBookCat = 'all', _furnBookScroll = 0;   // always open since 0.832 (its button is gone)
const FURN_BOOK_CATS = [
  { key: 'all',       label: 'All',       icon: null },
  { key: 'metals',    label: 'Metals',    icon: ITEM.IRON_INGOT },
  { key: 'blocks',    label: 'Blocks',    icon: B.GLASS },
  { key: 'materials', label: 'Materials', icon: ITEM.CHARCOAL },
  { key: 'food',      label: 'Food',      icon: ITEM.BREAD },
  { key: 'fuel',      label: 'Fuel',      icon: ITEM.COAL },
];
function cycleFurnBookCategory(dir) {
  const i = FURN_BOOK_CATS.findIndex(c => c.key === furnBookCat);
  furnBookCat = FURN_BOOK_CATS[(i + dir + FURN_BOOK_CATS.length) % FURN_BOOK_CATS.length].key;
  _furnBookScroll = 0;
  const panel = invPanel('furnacePanel');
  if (panel) panel._scrollTop = true;        // to the top, whatever the list says it is at
  buildFurnacePanel();
}
function _furnBookHtml() {
  const num = (v) => +v.toFixed(2);
  // icons only since 0.776 — the name is in the hover tooltip
  const item = (id, badge, out) =>
    `<span class="cing${out ? ' out' : ''}" data-name="${idName(id)}" data-id="${id}">` +
    `<img src="${renderBlockIcon(id)}" alt="">${badge ? `<b>${badge}</b>` : ''}</span>`;
  const time = (sec, sub) => `<span class="fbTime"><b>${_fmtCraftTime(sec)}</b><small>${sub}</small></span>`;
  const arrow = '<svg class="fbArrow" viewBox="0 0 16 10" width="16" height="10" aria-hidden="true">' +
    '<path d="M1 5h11M8.5 1.5 12.5 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // the experience picture (textures/Gui/Effects/UI, as the feed's)
  const xp = (n) => `<span class="fbXp">${n ? `<img src="textures/Gui/Effects/UI/experience.png" alt="">${num(n)}` : ''}</span>`;
  const rows = (cat) => {
    let h = '';
    if (cat === 'fuel')
      for (const id in FUEL_SMELTS) {
        const pts = FUEL_SMELTS[id], ash = NO_ASH_FUEL.has(+id) ? 0 : pts / ASH_FUEL;
        h += `<div class="crow fbRow">${item(+id)}${time(pts * FUEL_POINT_SEC, `${num(pts)} fuel`)}${arrow}` +
             (ash ? item(ITEM.ASHES, num(ash), true) : '<span class="fbNone" title="no ash">—</span>') +
             xp(ash * ASH_XP) + '</div>';
      }
    else
      for (const r of SMELT_RECIPES) if (r.cat === cat)
        h += `<div class="crow fbRow">${item(r.in)}${time(r.time, `≈${num(r.time / FUEL_POINT_SEC)} fuel`)}${arrow}` +
             item(r.out, null, true) + xp(r.xp) + '</div>';
    return h;
  };
  let h = '<div class="fbook"><div id="furnTabs">';
  for (const c of FURN_BOOK_CATS)
    h += `<div class="ctab${c.key === furnBookCat ? ' sel' : ''}" data-cat="${c.key}" title="${c.label}">` +
         (c.icon != null ? `<img src="${renderBlockIcon(c.icon)}" alt="">` : '<span class="tlabel">All</span>') + '</div>';
  h += '</div><div class="fbList">';
  if (furnBookCat === 'all')
    for (const c of FURN_BOOK_CATS.slice(1)) h += `<div class="fbHead">${c.label}</div>` + rows(c.key);
  else h += rows(furnBookCat);
  return h + `</div><div class="fbHint">1 fuel = ${FUEL_POINT_SEC}s of fire, a coal chunk · every ${ASH_FUEL} fuel burnt leaves 1 ash</div></div>`;
}

// refresh only the furnace slots in place (does not disturb the drag ghost)
function _refreshFurnaceSlots(k) {
  if (!invOpen || activeFurnace !== k) return;
  const panel = invPanel('furnacePanel');
  const f = FURNACES.get(k);
  if (!panel || !f) return;
  for (const el of panel.querySelectorAll('.slot'))
    el.innerHTML = slotInner(f.slots[+el.dataset.fi]);
}

// per-frame: fuel bar drains top-to-bottom, progress bar (rotated 90°) fills left-to-right, ash meter fills
function _updateFurnaceBars() {
  if (!invOpen || !activeFurnace) return;
  const panel = invPanel('furnacePanel');
  const f = FURNACES.get(activeFurnace);
  if (!panel || !f || panel.style.display === 'none') return;
  const fuelFill = panel.querySelector('.ffuel .ffill');
  const progFill = panel.querySelector('.fprog .ffill');
  const ashFill = panel.querySelector('.fash i');
  if (fuelFill) fuelFill.style.height = Math.round((f.burn / f.burnMax) * 100) + '%';
  if (progFill) progFill.style.height = Math.round(f.progress * 100) + '%';
  if (ashFill) ashFill.style.width = Math.round((f.ash / ASH_FUEL) * 100) + '%';
}
