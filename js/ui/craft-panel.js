'use strict';
/* ui/craft-panel.js: the crafting list in the inventory. Categories, counting out a batch, the list itself. */

function _craftTimeHtml(r) {
  const spd = craftSpeed();
  const t = spd > 0 ? _fmtCraftTime(r.timeToCraft / spd) : '—';
  return '<span class="ctime"><svg viewBox="0 0 16 10" width="12" height="8" aria-hidden="true">' +   // smaller since 0.7771
         '<path d="M1 5h11M8.5 1.5 12.5 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.8" ' +
         `stroke-linecap="round" stroke-linejoin="round"/></svg><small>${t}</small></span>`;
}
const _craftBadge = (n, m) => (craftShift || craftCtrl) ? `<b>${n}×(${m})</b>` : (n > 1 ? `<b>${n}</b>` : '');
var craftShift = false;
/* Ctrl held: the same counts Shift shows — how many you could make — less what the batch you are
   counting out already claims, so the number goes down as you click. */
var craftCtrl = false;
function _craftCtrlRefresh() {
  const panel = invOpen && !player.canFly ? invPanel('craftPanel') : null;
  if (craftCtrl && panel && panel.style.display !== 'none') buildCraftPanel();
}
function _setCraftCtrl(on) {
  if (craftCtrl === on) return;
  craftCtrl = on;
  const panel = invOpen && !player.canFly ? invPanel('craftPanel') : null;
  if (panel && panel.style.display !== 'none') buildCraftPanel();
}
addEventListener('keydown', (e) => { if (e.key === 'Control') _setCraftCtrl(true); });
addEventListener('keyup',   (e) => { if (e.key === 'Control') _setCraftCtrl(false); });
addEventListener('blur', () => _setCraftCtrl(false));
function _setCraftShift(on) {
  if (craftShift === on) return;
  craftShift = on;
  const panel = invOpen && !player.canFly ? invPanel('craftPanel') : null;
  if (panel && panel.style.display !== 'none') buildCraftPanel();
}
addEventListener('keydown', (e) => { if (e.key === 'Shift') _setCraftShift(true); });
addEventListener('keyup',   (e) => { if (e.key === 'Shift') _setCraftShift(false); });
addEventListener('blur', () => _setCraftShift(false));

/* ---- counting out a batch ----
   Hold Ctrl (X on a pad) and click a recipe over and over: the count rides on the cursor instead of
   going straight onto the queue. Let Ctrl go and that many are ordered at once. Right click, or closing
   the inventory, drops the count and nothing is spent — the ingredients are only taken on the commit. */
var craftPick = null;                       // { r, n } while counting
const _craftPickEl = document.createElement('div');
_craftPickEl.id = 'craftPick';
document.body.appendChild(_craftPickEl);
function _craftPickPaint() {
  if (!craftPick) { _craftPickEl.style.display = 'none'; return; }
  const src = renderBlockIcon(craftPick.r.out[0]);
  _craftPickEl.innerHTML = (src ? `<img src="${src}" alt="">` : '') + `<b>${craftPick.n}</b>`;
  _craftPickEl.style.display = 'flex';
  _craftPickEl.style.left = (invCursor ? invCursor.x : innerWidth / 2) + 'px';
  _craftPickEl.style.top = (invCursor ? invCursor.y : innerHeight / 2) + 'px';
}
// one more on the batch counted out on the cursor; `half` (Ctrl+Shift): half of all there is room and stuff for, at once
function craftPickAdd(r, half = false) {
  if (craftPick && craftPick.r !== r) craftPickCancel();
  const cap = (craftMode !== 'basic' && activeBench) ? maxCrafts(r)
            : Math.min(maxCrafts(r), CRAFT_QUEUE_MAX - craftQueue().length);
  if (cap <= 0) { feedWarn(craftPick ? 'No room for more' : 'Missing ingredients'); return; }
  craftPick = { r, n: Math.min(cap, (craftPick ? craftPick.n : 0) + (half ? Math.max(1, Math.ceil(cap / 2)) : 1)) };
  _craftPickPaint();
  _craftCtrlRefresh();
}
function craftPickCancel() { const had = !!craftPick; craftPick = null; _craftPickPaint(); if (had) _craftCtrlRefresh(); }
function craftPickCommit() {
  const p = craftPick;
  craftPickCancel();
  if (!p) return;
  /* ONE order of p.n. It used to be p.n single clicks — and the first one at a bench closed the
     list, so every craft after it fell into the pocket queue instead of stacking on the station. */
  onRecipeClick(p.r, false, p.n);
  _craftCtrlRefresh();
}
const craftPickOn = () => !!craftPick;
const craftPickFollow = () => { if (craftPick) _craftPickPaint(); };   // the pad cursor moves it too
addEventListener('contextmenu', (e) => { if (craftPick) { e.preventDefault(); craftPickCancel(); } });
addEventListener('keyup', (e) => { if (e.key === 'Control' && craftPick) craftPickCommit(); });
addEventListener('blur', () => craftPickCancel());
addEventListener('mousemove', () => { if (craftPick) _craftPickPaint(); });

// output-id -> category: blocks (id<256), tools (item with .tool), materials (other items)
function recipeCategory(r) {
  const oid = r.out[0];
  if (oid < 256) return 'blocks';
  const p = ITEM_PROPS[oid];
  if (p?.equip && p.equip !== 'accessories' && !p.chisel) return 'armor';   // anything worn in an equipment slot (the chisel is a tool)
  if (p?.food != null) return 'food';
  return (p?.tool || p?.ranged || p?.chisel) ? 'tools' : 'materials';   // a bow is a weapon, so it sits with the tools
}
const CRAFT_CATS = ['all', 'blocks', 'materials', 'tools', 'armor', 'food'];
var craftCat = 'all';                      // active tab; kept across rebuilds
function cycleCraftCategory(dir) {         // dir = +1 (RB) / -1 (LB); wraps
  const i = CRAFT_CATS.indexOf(craftCat);
  craftCat = CRAFT_CATS[(i + dir + CRAFT_CATS.length) % CRAFT_CATS.length];
  _craftScroll = 0;
  const panel = invPanel('craftPanel');
  if (panel) panel._scrollTop = true;        // to the top, whatever the list says it is at (buildCraftPanel)
  buildCraftPanel();
}
var _craftScroll = 0;                       // saved scroll position preserved across a panel rebuild

/* Variant cycling: rather than rebuilding the panel (which would fight the scroll position),
   a ticker rewrites the icon and tooltip of every ingredient that has a variant group. */
const CRAFT_VARIANT_MS = 2000;
let _variantPhase = 0;
setInterval(() => {
  _variantPhase++;
  const panel = invPanel('craftPanel');
  if (!panel || panel.style.display === 'none') return;
  for (const el of panel.querySelectorAll('.cing[data-ids]')) {
    const ids = el.dataset.ids.split(',').map(Number);
    const shown = ids[_variantPhase % ids.length];
    const img = el.querySelector('img');
    if (img) img.src = renderBlockIcon(shown);
    el.dataset.name = idName(shown);
  }
}, CRAFT_VARIANT_MS);

// populates the permanent #craftPanel div whenever the inventory rebuilds
function buildCraftPanel() {
  const panel = invPanel('craftPanel');
  if (!panel) return;
  if (invPanelHeld(panel)) return;           // the skill tree is up: built again when it closes
  /* The list element is KEPT across rebuilds; only its rows are swapped. It used to be made anew every time
     and scrolled back to where the last scroll event had left it — which is where the list was when the frame began.
     Everything the wheel or the stick scrolled during a slow frame was thrown away with the old element, so at a low
     frame rate the list kept jumping back up. In place, the browser keeps it where it is. _craftScroll is still read
     off it (for a panel hidden and shown again, and to send it to the top: a tab picked, the inventory opened). */
  let list = null;
  for (const n of panel.children) if (n.id === 'craftList') { list = n; break; }
  if (list && !panel._scrollTop && list.clientHeight > 0) _craftScroll = list.scrollTop;
  panel._scrollTop = false;
  panel.style.display = 'flex';
  // category tabs: All has no icon (label only), the rest use a themed icon from ITEM/BLOCK
  const CATS = [
    { key: 'all',       label: 'All',       icon: null },
    { key: 'blocks',    label: 'Blocks',    icon: B.CRAFTING_BENCH },
    { key: 'materials', label: 'Materials', icon: ITEM.IRON_INGOT },
    { key: 'tools',     label: 'Tools',     icon: ITEM.IRON_PICKAXE },
    { key: 'armor',     label: 'Armor',     icon: ITEM.IRON_CHESTPLATE },
    { key: 'food',      label: 'Food',      icon: ITEM.APPLE },
  ];
  let tabsHtml = '<div id="craftTabs">';
  for (const c of CATS) {
    const sel = c.key === craftCat ? ' sel' : '';
    const inner = c.icon != null ? `<img src="${renderBlockIcon(c.icon)}" alt="">` : `<span class="tlabel">All</span>`;
    tabsHtml += `<div class="ctab${sel}" data-cat="${c.key}" title="${c.label}">${inner}</div>`;
  }
  tabsHtml += '</div>';
  // one line telling you the two modifiers the list has
  const headHtml = tabsHtml +
    '<div class="chint"><b>Shift</b> all you can afford &middot; <b>Ctrl</b> (pad <b>X</b>) click to count a batch, let go to craft &middot; <b>right click</b> (pad <b>B</b>) or closing cancels it</div>';
  if (list) {
    for (const n of [...panel.childNodes]) if (n !== list) n.remove();
    list.insertAdjacentHTML('beforebegin', headHtml);
  } else {
    panel.innerHTML = headHtml;
    list = document.createElement('div');
    list.id = 'craftList';
    panel.appendChild(list);
    const own = list;                                 // a list no longer on the page reads 0: never let that be saved
    own.addEventListener('scroll', () => { if (own.isConnected && own.clientHeight > 0) _craftScroll = own.scrollTop; });
  }
  const rows = document.createDocumentFragment();
  /* Order: what you can afford first, as before, then by how much use it is — the stations you
     build everything else at, then carried gear, then tools and weapons best material first, then armor,
     then the rest, with decoration and pressed-ore blocks at the bottom. Ties keep the table's order. */
  const recs = craftRecipes().filter(r => craftCat === 'all' || recipeCategory(r) === craftCat);
  const idxOf = new Map(recs.map((r, i) => [r, i]));
  recs.sort((a, b) => {
    const ca = canCraft(a), cb = canCraft(b);
    if (ca !== cb) return ca ? -1 : 1;
    const ra = recipeRank(a), rb = recipeRank(b);
    if (ra !== rb) return ra - rb;
    return idxOf.get(a) - idxOf.get(b);
  });
  for (const r of recs) {
    const ok = canCraft(r);
    // Shift: every count becomes craft-all — capped by the queue's empty slots when crafting from the pocket
    let m = !(craftShift || craftCtrl) ? 0 : (craftMode !== 'basic' && activeBench) ? maxCrafts(r)
            : Math.min(maxCrafts(r), CRAFT_QUEUE_MAX - craftQueue().length);
    if (craftCtrl && craftPick && craftPick.r === r) m = Math.max(0, m - craftPick.n);   // less the batch on the cursor
    const row = document.createElement('div');
    row.className = 'crow' + (ok ? '' : ' nocraft');
    let html = '';
    for (const [id, n] of recipeIn(r)) {
      const have = invCount(id) >= n;
      const ids = ingIds(id);
      // variant groups carry their whole id list so the cycler can swap icon + tooltip in place
      const shown = ids[_variantPhase % ids.length];
      const attr = ids.length > 1 ? ` data-ids="${ids.join(',')}"` : '';
      html += `<span class="cing${have ? '' : ' miss'}" data-name="${idName(shown)}" data-id="${shown}"${attr}>` +
              `<img src="${renderBlockIcon(shown)}" alt="">${_craftBadge(n, m)}</span>`;
    }
    html += _craftTimeHtml(r);                        // arrow + craft time, left of the output
    const [oid, on] = r.out;
    html += `<button class="cbtn" data-name="${idName(oid)}" data-id="${oid}">` +
            `<img src="${renderBlockIcon(oid)}" alt="">${_craftBadge(on, m)}</button>`;
    // what one craft pays, right of the output, the same way the furnace book shows it
    html += `<span class="cxp">${r.xpToGive ? `<img src="textures/Items/Useables/experience_bottle.png" alt="">${r.xpToGive}` : ''}</span>`;
    row.innerHTML = html;
    // Shift+click commits as many as you can afford (0.76: into the queue, or onto the bench's order)
    // Ctrl: count a batch out on the cursor first, and order it when Ctrl is let go; Ctrl+Shift: half of the most at once
    row._recipe = r;                                  // the pad's X+A batch reads it back off the row
    row.querySelector('.cbtn').addEventListener('click',
      (ev) => { if (ev.ctrlKey) craftPickAdd(r, ev.shiftKey); else onRecipeClick(r, ev.shiftKey); });
    rows.appendChild(row);
  }
  list.replaceChildren(rows);                // every row at once: the list is never seen empty, so it never snaps to 0
  // the personal queue sits under the list; a bench works its own single order instead
  const withQueue = !(craftMode !== 'basic' && activeBench);
  panel.classList.toggle('hasQueue', withQueue);
  if (withQueue) panel.appendChild(_queuePanel());
  // only moved when it is not already there: a new list, a panel shown again, or sent to the top
  if (Math.abs(list.scrollTop - _craftScroll) > 1) list.scrollTop = _craftScroll;
  for (const tab of panel.querySelectorAll('.ctab'))
    tab.addEventListener('click', () => { craftCat = tab.dataset.cat; _craftScroll = 0; panel._scrollTop = true; buildCraftPanel(); });
}
