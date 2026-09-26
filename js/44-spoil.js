'use strict';
/* voxiGrof — food spoilage (0.789)

   Every food carries a freshness clock. `spoil` in its ITEM_PROPS is how many seconds one is good
   for; a slot holding it carries `fresh`, the seconds the stack has left, and that drains by one a
   second for as long as you are carrying it. At zero ONE item is lost — the feed says "spoiled" —
   and the clock restarts for the next one in the stack, so a stack of eight rots one at a time
   rather than vanishing all at once.

   Freshness lives in its own slot field rather than in `dur`. `dur` means "a worn tool" everywhere
   in the codebase, and a dozen places refuse to stack anything that has one — putting the clock
   there would have stopped food stacking at all. `fresh` is invisible to every one of those checks,
   so food stacks exactly as it always did; the only rule added is the one below.

   MERGING: two stacks that come together take the SMALLER clock, so you can never refresh old meat
   by piling new meat on top of it. Where a merge has no clock to offer — a furnace handing over
   something it has just cooked, a crafting bench, a fresh drop — the incoming item is brand new by
   definition, the minimum is the destination's own clock, and that site needs no code at all.

   Spoilage was a cost of CARRYING food only; since 0.8098 food in a chest spoils at the same rate.

   SALT (0.8098): carried salt, or salt in the same chest, makes food last 50% longer (its clock runs at 2/3
   speed). It is used up, one every SALT_USE_S of salting, but only while there is food to salt — with no food
   beside it, it keeps. */
const SALT_LIFE = 1.5, SALT_USE_S = 1200;   // food lasts 1.5x as long; one salt per 20 minutes of it

// blocks can carry a clock too since 0.7992 (the pumpkin)
const spoilMax = (id) => (id == null ? 0 : ((id >= 256 ? ITEM_PROPS[id]?.spoil : PROPS[id]?.spoil) || 0));
const isPerishable = (id) => spoilMax(id) > 0;
// the clock a slot is on right now, full if it somehow has none (an older save, a hand-made slot)
const slotFresh = (s) => (s && s.fresh != null) ? s.fresh : spoilMax(s && s.id);
/* How many clock-seconds one real second takes off carried food: 0.9 with Preserver (0.7911), so the
   clock itself keeps its meaning — the bar still reads fresh/max — and only runs down slower. */
const spoilRate = () => (typeof hasSkill === 'function' && hasSkill('preserver')) ? 0.9 : 1;

/* Merging n items into `dst`. Call this INSTEAD of `dst.count += n` wherever the incoming items
   come from another slot — a drop, a drag, a sort, a quick-move — and pass that slot's clock. */
function stackInto(dst, n, srcFresh) {
  dst.count += n;
  if (!isPerishable(dst.id)) return dst;
  const a = slotFresh(dst), b = srcFresh == null ? spoilMax(dst.id) : srcFresh;
  dst.fresh = Math.min(a, b);
  return dst;
}

/* ---- the tick ----
   One whole second at a time, so the clock a player reads counts down in steps they can follow and
   a laggy frame cannot eat two seconds at once. */
let _spoilAcc = 0;
const SPOIL_STEP = 1;

/* Drain one second off everything carried. A slot whose clock merely MOVED needs a repaint and
   nothing more; only a slot that actually lost an item is worth a write to storage. */
function tickSpoilage(dt) {
  if (typeof player === 'undefined' || !player || player.dead) return;
  if (player.canFly) return;                    // creative: nothing rots
  if (typeof currentWorld !== 'undefined' && !currentWorld) return;
  _spoilAcc += dt;
  if (_spoilAcc < SPOIL_STEP) return;
  const steps = Math.floor(_spoilAcc / SPOIL_STEP);
  _spoilAcc -= steps * SPOIL_STEP;

  let hotPaint = false, invPaint = false, offPaint = false;
  let hotLost = false, invLost = false, offLost = false;
  // what the lost items leave behind (0.7992): milk turns into its bucket, meat into rotten flesh.
  // Collected and handed over AFTER the sweep, so a pickup cannot write into a slot being drained.
  const leftovers = [];
  // returns 0 = not food, 1 = clock moved, 2 = an item was lost
  // salt in the pack: food carried alongside it lasts 50% longer, and it is used up while it works (0.8098)
  let rate = spoilRate();
  if (_carries(isPerishable) && _carries((id) => id === ITEM.SALT)) {
    rate /= SALT_LIFE;
    player._saltT = (player._saltT || 0) + steps;
    if (player._saltT >= SALT_USE_S) {
      player._saltT -= SALT_USE_S;
      if (_takeCarried(ITEM.SALT)) { if (typeof feedItem === 'function') feedItem(ITEM.SALT, -1, 'used'); hotLost = invLost = true; }
    }
  }
  const drain = (slot, onEmpty) => {
    if (!slot || !isPerishable(slot.id)) return 0;
    const max = spoilMax(slot.id);
    let f = slotFresh(slot) - steps * rate, lost = 0;
    while (f <= 0 && slot.count - lost > 0) { lost++; f += max; }
    slot.fresh = Math.max(0, f);
    if (!lost) return 1;
    slot.count -= lost;
    const into = (slot.id >= 256 ? ITEM_PROPS[slot.id] : PROPS[slot.id])?.spoilInto;
    if (into != null) for (let k = 0; k < lost; k++) leftovers.push(into);
    if (typeof feedItem === 'function') feedItem(slot.id, -lost, 'spoiled');
    if (slot.count <= 0) onEmpty();
    return 2;
  };

  if (typeof HOTBAR !== 'undefined')
    for (let i = 0; i < HOTBAR.length; i++) {
      const r = drain(HOTBAR[i], () => { HOTBAR[i] = null; });
      if (r) hotPaint = true;
      if (r === 2) hotLost = true;
    }
  if (typeof invSlots !== 'undefined')
    for (let i = 0; i < invSlots.length; i++) {
      const r = drain(invSlots[i], () => { invSlots[i] = null; });
      if (r) invPaint = true;
      if (r === 2) invLost = true;
    }
  if (typeof invSlots2 !== 'undefined') {
    const n = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
    for (let i = 0; i < n; i++) {
      const r = drain(invSlots2[i], () => { invSlots2[i] = null; });
      if (r) invPaint = true;
      if (r === 2) invLost = true;
    }
  }
  if (typeof equipSlots !== 'undefined' && typeof EQUIP_INDEX !== 'undefined') {
    const i = EQUIP_INDEX.offhand;
    const r = drain(equipSlots[i], () => { equipSlots[i] = null; });
    if (r) offPaint = true;
    if (r === 2) offLost = true;
  }

  // what the spoiled food left behind goes into your hands, or on the floor if there is no room (0.7992)
  for (const id of leftovers) {
    if (typeof tryPickup === 'function' && tryPickup(id, null, 'left over')) continue;
    if (typeof spawnDrop === 'function' && typeof player !== 'undefined')
      spawnDrop(id, Math.floor(player.pos.x), Math.floor(player.pos.y + 0.5), Math.floor(player.pos.z));
  }
  // chests once per frame, whoever's seat this is (0.8098)
  if (typeof PLAYERS === 'undefined' || PLAYERS.indexOf(player) <= 0) _tickChestSpoil();
  if (hotLost && typeof saveHotbar === 'function') saveHotbar();
  if (invLost && typeof saveInv === 'function') saveInv();
  if (offLost && typeof saveEquip === 'function') saveEquip();
  if (hotPaint && typeof buildHotbar === 'function') buildHotbar();
  if ((invPaint || offPaint) && typeof invOpen !== 'undefined' && invOpen) {
    if (typeof buildInventory === 'function') buildInventory();
    if (offPaint && typeof buildEquipPanel === 'function') buildEquipPanel();
  }
}

/* ---- carried slots and chests (0.8098) ---- */
// every slot the player carries food in: hotbar, grid, a worn backpack, the offhand
function _carriedSlots() {
  const out = [];
  if (typeof HOTBAR !== 'undefined') for (let i = 0; i < HOTBAR.length; i++) out.push([HOTBAR, i]);
  if (typeof invSlots !== 'undefined') for (let i = 0; i < invSlots.length; i++) out.push([invSlots, i]);
  if (typeof invSlots2 !== 'undefined') {
    const n = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
    for (let i = 0; i < n; i++) out.push([invSlots2, i]);
  }
  if (typeof equipSlots !== 'undefined' && typeof EQUIP_INDEX !== 'undefined') out.push([equipSlots, EQUIP_INDEX.offhand]);
  return out;
}
const _carries = (test) => _carriedSlots().some(([a, i]) => a[i] && test(a[i].id));
function _takeCarried(id) {
  for (const [a, i] of _carriedSlots()) {
    const s = a[i];
    if (!s || s.id !== id) continue;
    if (--s.count <= 0) a[i] = null;
    return true;
  }
  return false;
}
/* Food in a chest spoils at the carried rate; salt in the same chest stretches it 50% and is used one per
   SALT_USE_S. Only chests inside the simulation radius tick — but a chest keeps the WORLD CLOCK time it was
   last ticked (spoilT), so one that was out of range catches up the moment it is back (0.8099): the salt
   there is spent first, one per 20 minutes for as long as it lasts, and the food then loses that salted
   time at 2/3 speed and the rest at full speed. Two hours with enough salt cost the food 80 minutes. */
const spoilClock = () => (typeof worldDay !== 'undefined' ? worldDay + worldTime : 0) * (typeof DAY_LEN !== 'undefined' ? DAY_LEN : 1200);
function _tickChestSpoil() {
  if (typeof CHESTS === 'undefined') return;
  const now = spoilClock();
  for (const [k, c] of CHESTS) {
    if (!c.slots) continue;
    if (c.spoilT == null || c.spoilT > now) { c.spoilT = now; continue; }   // a new chest, or a clock set back
    const [x, y, z] = k.split(',').map(Number);
    if (typeof inSimRangeChunk === 'function' && !inSimRangeChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
    const elapsed = Math.floor(now - c.spoilT);
    if (elapsed < 1) continue;
    c.spoilT += elapsed;
    const sl = c.slots;
    if (!sl.some(s => s && isPerishable(s.id))) continue;               // no food: time passes, salt keeps
    let changed = false;
    // the salt first: how much of the elapsed time it covered, and how many it took to do it
    let salted = 0;
    const saltHeld = sl.reduce((n, s) => n + (s && s.id === ITEM.SALT ? s.count : 0), 0);
    if (saltHeld > 0) {
      const saltT = c.saltT || 0;
      salted = Math.min(elapsed, saltHeld * SALT_USE_S - saltT);
      let used = Math.floor((saltT + salted) / SALT_USE_S);
      c.saltT = salted < elapsed ? 0 : (saltT + salted) % SALT_USE_S;
      for (let i = 0; i < sl.length && used > 0; i++) {
        const s = sl[i];
        if (!s || s.id !== ITEM.SALT) continue;
        const take = Math.min(used, s.count);
        s.count -= take; used -= take;
        if (s.count <= 0) sl[i] = null;
        changed = true;
      }
    }
    const drain = salted / SALT_LIFE + (elapsed - salted);              // seconds off the food's clocks
    const leftovers = [];
    for (let i = 0; i < sl.length; i++) {
      const s = sl[i];
      if (!s || !isPerishable(s.id)) continue;
      const max = spoilMax(s.id);
      let f = slotFresh(s) - drain, lost = 0;
      while (f <= 0 && s.count - lost > 0) { lost++; f += max; }
      s.fresh = Math.max(0, f);
      if (!lost) continue;
      s.count -= lost;
      const into = (s.id >= 256 ? ITEM_PROPS[s.id] : PROPS[s.id])?.spoilInto;
      if (into != null) for (let n = 0; n < lost; n++) leftovers.push(into);
      if (s.count <= 0) sl[i] = null;
      changed = true;
    }
    // what spoiled food leaves (a bucket, rotten flesh) stays in the chest, or drops beside it when full
    for (const id of leftovers) {
      const same = sl.find(s => s && s.id === id && s.count < ((id >= 256 ? ITEM_PROPS[id] : PROPS[id])?.stack || 60) && !s.dur);
      if (same) { same.count++; continue; }
      const free = sl.indexOf(null);
      if (free >= 0) sl[free] = mkSlot(id, 1);
      else if (typeof spawnDrop === 'function') spawnDrop(id, x, y + 1, z);
    }
    if (changed && typeof invOpen !== 'undefined' && invOpen && (activeChest === k || activeChest2 === k)
        && typeof buildChestPanel === 'function') buildChestPanel();
  }
}
