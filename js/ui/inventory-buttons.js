'use strict';
/* ui/inventory-buttons.js: the inventory's buttons (sort, move all, quick stack) and throwing things out of it. */

/* ---- inventory buttons: sort, transfer all, pull all, quick stack ----
   A row under the slots. SORT merges stacks and orders the main grid and a worn backpack by name, as
   one list; the hotbar is left exactly as you set it. The other three move stacks between you and a
   TARGET: an open chest (both halves of a double one) against your main grid and backpack. With no chest
   open they are greyed out. (Until 0.8443 a worn backpack was a target too, against the main grid; it is only
   more room in your inventory, so nothing is transferred into it or pulled out of it any more.)
     Transfer all  everything from your side into the target (never the hotbar)
     Pull all      everything out of the target: main grid, then backpack, then hotbar
     Quick stack   only what the target already holds some of
   Moves top up partial stacks before taking empty slots, keep tool wear, and respect the backpack's
   locked rows through gridLen. */
function _stashTarget() {
  if (player.canFly) return null;
  const packN = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
  if (invRightTab() === 'chest' && activeChest && CHESTS.get(activeChest)) {   // shown, not just open
    const grids = [CHESTS.get(activeChest).slots];
    if (activeChest2 && CHESTS.get(activeChest2)) grids.push(CHESTS.get(activeChest2).slots);
    return { kind: 'chest', grids, mine: packN > 0 ? [invSlots, invSlots2] : [invSlots] };
  }
  return null;                                // a backpack alone is no target
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
/* One sort for every storage: merge partial stacks, order by name, and deal the result back
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
/* Creative: middle-click or R3 over the palette or the hotbar puts everything back the way a new world
   has it — the palette in its own order, the hotbar empty. Filled in place: a seat's arrays stay its own. */
function resetCreativeInventory() {
  const d = _defaultCreativeInventory();
  for (const [dst, src] of [[HOTBAR, d.hot], [invSlots, d.inv], [invSlots2, d.inv2]]) {
    dst.length = src.length;
    for (let i = 0; i < src.length; i++) dst[i] = src[i];
  }
  refreshSlotsUI();
  toast('creative inventory reset');
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
/* The reverse quick stack, on the chest's own row: take out only what you already carry some
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
  const where = t ? 'the chest' : null;
  const off = 'Open a chest';
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
  // Pull all lives with the storage it empties: the chest's row, or the backpack's heading
  mk('Quick stack', where ? `Move only the items ${where} already holds some of` : off, quickStack, !!t);
  return bar;
}

/* ---- Y: throw from the slot under the cursor ----
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


/* ---- throwing what the cursor carries ----
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
  if (_quickEquip(region, i)) return;                // gear goes on rather than across
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

/* Each player has their own inventory panel in their own viewport, so several people can
   be rummaging at once and nobody is locked out. Only the PAUSE menu is still one shared thing
   over the middle of the screen — that one really is for everybody. */
/* Order of opening, so the single armour-preview renderer can follow the player who opened LAST
   and hand itself back to whoever is still in their inventory when that player closes. A plain
   counter: bigger means more recent. `_invSeq` is per seat (swapped); the counter is not. */
let _invSeqNext = 0;
