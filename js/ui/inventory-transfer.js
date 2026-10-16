'use strict';
/* ui/inventory-transfer.js: moving things. Picking up and putting down, dragging, shift-moving between grids, and
   wearing gear straight from a grid. */

/* ---- drag / transfer actions, shared by mouse and gamepad ---- */
// pick up from a slot into the hand. take: 'all' | 'half' | 1
function pickUp(region, i, take = 'all') {
  if (dragHeld) return;
  const arr = slotArr(region), s = arr[i];
  if (s == null) return;
  const n = Math.min(s.count, take === 'all' ? s.count : take === 'half' ? Math.ceil(s.count / 2) : 1);
  if (region === 'fur') furnaceTakeXP(i, n);        // the smelt XP goes to whoever takes it
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
    // a swap changes what is worn too — trading a big pack for a small one has to trim
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
   The creative palette is not storage: there it lays everything out afresh instead (R3 too). */
function sortRegion(region) {
  if (region === 'fur') return;                      // furnace slots are positional, not storage
  if (player.canFly && (region === 'hot' || region === 'inv' || region === 'inv2')) {
    resetCreativeInventory();
    return;
  }
  // middle-click matches the buttons: the main grid and a worn backpack are one inventory,
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
  /* what found no room is thrown out in front of you — it used to be simply gone (the inventory shut with a
     stack on the cursor and every slot full). Creative has no drops: there it goes back to nothing, as before. */
  if (dragHeld.count > 0 && !player.canFly && typeof throwFromPlayer === 'function') {
    throwFromPlayer(dragHeld.id, dragHeld.count, dragHeld.dur ?? null, slotMeta(dragHeld));
    if (typeof feedItem === 'function') feedItem(dragHeld.id, -dragHeld.count, 'dropped');
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
  if (!activeFurnace || invRightTab() !== 'furnace') return 0;   // only while it is on screen
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
  // ...and in survival it exists only while a backpack is worn, sized by that pack
  const useInv2 = player.canFly || (typeof backpackCapacity === 'function' && backpackCapacity() > 0);
  // an open chest is the natural quick-move target: player grids feed it, and its own slots
  // feed back into the player
  const chestArrs = [];
  const chestShown = invRightTab() === 'chest';           // not while Equipment is picked over it
  if (chestShown && activeChest && CHESTS.get(activeChest)) chestArrs.push(CHESTS.get(activeChest).slots);
  if (chestShown && activeChest2 && CHESTS.get(activeChest2)) chestArrs.push(CHESTS.get(activeChest2).slots);
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
/* ---- wearing things straight from the grids ----
   Shift+LMB (and Y on a pad) on something you can WEAR puts it on instead of moving it across:
   armour into its slot, a shield or a stack of torches into the offhand, and torches also top up a
   torch stack already in the offhand. It only fills an EMPTY slot, and only while the equipment
   panel is actually on screen; otherwise it falls back to the ordinary quick-move. Shift+RMB is the
   one that REPLACES what you are wearing, see swapEquip. */
const _equipShown = () => !player.canFly && invRightTab() === 'equip';   // the Equipment tab, even over a station
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
