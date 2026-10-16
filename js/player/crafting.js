'use strict';
/* player/crafting.js: crafting by hand. Counting and taking ingredients (chests near count too), and the personal
   queue that crafts over time. */

/* Total count of an id across hotbar + inventory + a worn backpack. The pack counts because a bag
   you cannot craft out of is a bag you have to unpack first — see _takeIngredients, which drains
   it last so the slots you can see empty before the ones on your back. */
function backpackGrid() {
  const n = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
  return n > 0 ? invSlots2.slice(0, n) : [];
}
function invCount(id) {
  let n = 0;
  const ids = ingIds(id);
  for (const s of HOTBAR)   if (s && ids.includes(s.id)) n += s.count;
  for (const s of invSlots) if (s && ids.includes(s.id)) n += s.count;
  for (const s of backpackGrid()) if (s && ids.includes(s.id)) n += s.count;
  for (const g of _openChestGrids()) for (const s of g) if (s && ids.includes(s.id)) n += s.count;
  return n;
}
/* An open chest is a second store for crafting, both halves of a double one: ingredients come
   out of your bags first and only the rest out of the chest, and something crafted or handed back that
   finds your bags full goes into the chest before it would be thrown on the floor. */
function _openChestGrids() {
  const out = [];
  if (typeof activeChest === 'undefined' || !activeChest) return out;
  for (const k of [activeChest, activeChest2]) { const c = k && CHESTS.get(k); if (c) out.push(c.slots); }
  return out;
}
function _putInOpenChest(id, meta = null) {
  const grids = _openChestGrids(), cap = stackSize(id);
  for (const g of grids) for (const s of g) if (s && s.id === id && s.dur == null && s.count < cap) { stackInto(s, 1, meta && meta.fresh); return true; }
  for (const g of grids) for (let i = 0; i < g.length; i++) if (!g[i]) { g[i] = applyMeta(mkSlot(id, 1), meta); return true; }
  return false;
}
/* What a recipe costs THIS player. Saddler takes 20% off the saddle, rounded, never below one
   of anything; every other recipe costs what it says. Everything that counts or takes ingredients
   reads this rather than r.in, so the list, the badges and the bags always agree. */
function recipeIn(r) {
  if (r.out[0] === ITEM.SADDLE && typeof hasSkill === 'function' && hasSkill('saddler'))
    return r.in.map(([id, n]) => [id, Math.max(1, Math.round(n * 0.8))]);
  return r.in;
}
const canCraft = (r) => recipeIn(r).every(([id, n]) => invCount(id) >= n);

/* ================================================================================================
   CRAFTING TAKES TIME
   ------------------------------------------------------------------------------------------------
   Every recipe carries `timeToCraft` (seconds at 100% crafting speed) and `xpToGive` (paid as each
   craft finishes). Committing to a craft takes its ingredients out of your bags straight away, and
   cancelling gives back everything that was not made yet.

   POCKET (the inventory's list): a personal queue of CRAFT_QUEUE_MAX slots under the recipes. Every
   slot is ONE craft: a click queues one, Shift+click fills as many empty slots as you can
   afford, so five is the most ever waiting. The front slot works on its own, inventory open or closed — closed, the
   row shows on the HUD at half opacity — and while it runs you walk slower and cannot sprint.
   Clicking a queued slot cancels it; Cancel all empties the queue.

   BENCH: not a queue. A bench holds ONE order — one recipe, any amount — floating over it where it
   can be read from every side. Choosing a recipe at the bench takes the ingredients and closes the
   inventory. Hold E at the bench to work it; every other control is locked while you do, and
   letting go or taking a hit loses the item in progress (never the order). A tap of E takes what is
   finished. Holding the right button on the bench cancels the order and drops all of it, made and
   unmade, on the floor. A plain tap of the right button still opens the bench.

   Crafting speed (player/stats.js) scales both: 200% is twice as fast, 0% cannot craft at all.
   ================================================================================================ */
const CRAFT_QUEUE_MAX = 6;                   // 5 until 0.778; the slimmer rows left room for a sixth slot
const CRAFT_MOVE_MUL = 0.6;          // walking speed while your personal queue runs
const CRAFT_JUMP_MUL = 0.5;          // ...and jump strength (no jumping at all before)
// the slowdown (1 - CRAFT_MOVE_MUL) is a quarter smaller — 60% walking becomes 70% — with Work Fingers (the skill id
// `nimble`; Walk and Work, `walkWork`, gave it from 0.79 until 0.8447, when that skill became Precise Focus)
const craftMoveMul = () => (typeof hasSkill === 'function' && hasSkill('nimble'))
  ? 1 - (1 - CRAFT_MOVE_MUL) * 0.75 : CRAFT_MOVE_MUL;
/* Precise Focus (the skill id `walkWork`): working a station WITHOUT letting go gets faster. The hold is
   timed on the player (`_benchHoldT`, updateBenchWork: any break in the work starts it over); nothing for the first
   FOCUS_FROM seconds, then the crafting speed rises evenly to FOCUS_MAX more at FOCUS_FULL.
   the pocket queue too, on a clock of its own (`_queueFocusT`, updateCraftQueue): it counts while the queue
   runs and starts over when the queue is empty or cannot run. */
const FOCUS_FROM = 4, FOCUS_FULL = 14, FOCUS_MAX = 0.5;
const focusMul = (t) => (typeof hasSkill === 'function' && hasSkill('walkWork'))
  ? 1 + FOCUS_MAX * Math.max(0, Math.min(1, ((t || 0) - FOCUS_FROM) / (FOCUS_FULL - FOCUS_FROM))) : 1;
const benchFocusMul = () => focusMul(player._benchHoldT);
const queueFocusMul = () => focusMul(player._queueFocusT);
const BENCH_TAP_TIME = 0.25;         // a right-button press shorter than this opens a busy bench
const BENCH_CANCEL_HOLD = 0.8;       // held this long, it cancels the bench's order

// one index space over both lists, so a saved queue or bench order can name its recipe
const recipeIndex = (r) => {
  const i = RECIPES_BASIC.indexOf(r);
  return i >= 0 ? i : RECIPES_BASIC.length + RECIPES_ADVANCED.indexOf(r);
};
const recipeAt = (i) => {
  const r = i < RECIPES_BASIC.length ? RECIPES_BASIC[i] : RECIPES_ADVANCED[i - RECIPES_BASIC.length];
  return r && !r.removed ? r : null;               // a removed recipe refunds like a missing one
};
const craftSpeed = () => (typeof playerCraftSpeedMul === 'function' ? playerCraftSpeedMul() : 1);
const _cantCraftMsg = 'You cannot craft: crafting speed is 0%';

// how many times this recipe could be crafted from what you are carrying (Shift fills to this)
function maxCrafts(r) {
  let m = Infinity;
  for (const [id, n] of recipeIn(r)) m = Math.min(m, Math.floor(invCount(id) / n));
  return Number.isFinite(m) ? m : 0;
}

/* Take ONE craft's ingredients out of the bags: main grid first, then the hotbar, then the backpack.
   Returns exactly what was taken as [[id, count], ...] — a variant group can drain several ids — so
   a refund hands back those same items. null when the craft is not affordable. */
function _takeIngredients(r) {
  if (!canCraft(r)) return null;
  const packN = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
  const taken = new Map(), fromChest = new Map();
  const grids = [[invSlots, invSlots.length], [HOTBAR, HOTBAR.length], [invSlots2, packN]];
  const chests = _openChestGrids();                     // after every bag, so the inventory has priority
  for (const g of chests) grids.push([g, g.length]);
  for (const [id, need] of recipeIn(r)) {
    let n = need;
    const ids = ingIds(id);
    for (const [arr, len] of grids)
      for (let i = 0; i < len && n > 0; i++) {
        const s = arr[i];
        if (!s || !ids.includes(s.id)) continue;
        const t = Math.min(s.count, n);
        s.count -= t; n -= t;
        taken.set(s.id, (taken.get(s.id) || 0) + t);
        if (chests.includes(arr)) fromChest.set(s.id, (fromChest.get(s.id) || 0) + t);
        if (s.count <= 0) arr[i] = null;
      }
  }
  // what the chest gave shows in the feed; your own bags stay quiet as before
  if (typeof feedItem === 'function') for (const [id, c] of fromChest) feedItem(id, -c, 'used from chest');
  return [...taken];
}
const _validId = (id) => typeof id === 'number' && !!(id >= 256 ? ITEM_PROPS[id] : PROPS[id]);
const _validUnit = (u) => Array.isArray(u) && u.every(p => Array.isArray(p) && _validId(p[0]) && p[1] > 0);

/* Hand items to this player. Something you can wear goes straight into its empty slot, a torch tops
   up the offhand (tryPickup), the rest fills the bags, and whatever does not fit is thrown at your
   feet rather than lost. `equip` is off for refunds: ingredients coming back are never worn. */
// `meta`: extras each item is handed over with — Well made off a Fine Work craft, a repaired tool's own
function _giveItems(id, count, reason, equip, meta = null) {
  for (let k = 0; k < count; k++) {
    const eq = equip && typeof autoEquipSlot === 'function' ? autoEquipSlot(id) : -1;
    if (eq >= 0) {
      equipSlots[eq] = applyMeta(mkSlot(id, 1), meta);
      saveEquip();
      if (typeof feedItem === 'function') feedItem(id, 1, reason);
      continue;
    }
    if (tryPickup(id, null, reason, meta)) continue;
    if (_putInOpenChest(id, meta)) {                               // bags full, chest open: into the chest
      if (typeof feedItem === 'function') feedItem(id, 1, reason + ' to chest');
      continue;
    }
    throwFromPlayer(id, 1, null, meta);
    if (typeof feedItem === 'function') feedItem(id, 1, 'no room: dropped');
  }
}

/* ---------------------------------- the personal queue ---------------------------------- */
// entries: { ri: recipe index, t: seconds into the front craft, units: [ingredients of one craft, ...] }
const craftQueue = () => player.craftQueue || (player.craftQueue = []);
// read by the frame loop: a running queue slows you down and stops sprinting
const playerIsCrafting = () => !player.canFly && !player.dead
  && !!(player.craftQueue && player.craftQueue.length) && craftSpeed() > 0;

// seconds the whole queue still needs at today's crafting speed (the Crafting effect's clock, 54)
function craftQueueLeft() {
  const q = player.craftQueue, spd = craftSpeed() * queueFocusMul();   // at the speed it runs right now
  if (!q || !q.length || spd <= 0) return 0;
  let s = 0;
  for (const e of q) {
    if (e.rep) { s += Math.max(0, repairTime(e.rep.id) - e.t); continue; }
    const r = recipeAt(e.ri);
    if (r) s += Math.max(0, r.timeToCraft * e.units.length - e.t);
  }
  return s / spd;
}

// n: a counted batch (Ctrl), that many at once
function queueCraft(r, all, n = 1) {
  if (player.canFly) return;
  if (craftSpeed() <= 0) { feedWarn(_cantCraftMsg); return; }
  const q = craftQueue(), ri = recipeIndex(r);
  const room = CRAFT_QUEUE_MAX - q.length;
  if (room <= 0) { feedWarn('Crafting queue is full'); return; }
  // one craft per slot: Shift fills the empty slots, as far as the ingredients go
  let added = 0;
  for (let want = all ? room : Math.min(room, n); added < want; added++) {
    const u = _takeIngredients(r);
    if (!u) break;
    q.push({ ri, t: 0, units: [u] });
  }
  if (!added) { feedWarn('Missing ingredients'); return; }
  refreshSlotsUI();
}
const _refundEntry = (e) => {
  for (const u of e.units) for (const [id, c] of u) _giveItems(id, c, 'returned', false);
  // a cancelled repair hands the tool back still broken, extras intact
  if (e.rep) {
    const maxD = ITEM_PROPS[e.rep.id]?.durability;
    if (!tryPickup(e.rep.id, maxD ? 0 : null, 'returned', e.rep.meta))
      throwFromPlayer(e.rep.id, 1, maxD ? 0 : null, e.rep.meta);
  }
};
function cancelQueueSlot(i) {
  const q = craftQueue(), e = q[i];
  if (!e) return;
  q.splice(i, 1);
  _refundEntry(e);
  refreshSlotsUI();
}
function cancelCraftQueue() {
  const q = craftQueue();
  if (!q.length) return;
  for (const e of q.splice(0)) _refundEntry(e);
  refreshSlotsUI();
}

// once per frame per seat: advance the front slot, then keep both views of the queue current
function updateCraftQueue(dt) {
  const q = player.craftQueue;
  const running = !!(q && q.length && !player.canFly && !player.dead && !worldJoining() && craftSpeed() > 0);
  // Precise Focus: the longer the queue has run without a stop, the faster it goes (queueFocusMul)
  player._queueFocusT = running ? (player._queueFocusT || 0) + dt : 0;
  const qSpeed = craftSpeed() * queueFocusMul();
  if (q && q.length && !player.canFly && !player.dead && !worldJoining()) {
    const e = q[0], r = e.rep ? null : recipeAt(e.ri);
    if (e.rep) {                                       // a repair (Mender, 0.79): the tool comes back whole
      if (craftSpeed() > 0) {
        e.t += dt * qSpeed;
        if (e.t >= repairTime(e.rep.id)) {
          q.shift();
          _giveItems(e.rep.id, 1, 'repaired', false, e.rep.meta);
          // 2 a tier of the tool, 2..10; dismantling pays nothing
          addXP(Math.min(10, Math.max(2, XP_REPAIR_PER_TIER * Math.round(ITEM_PROPS[e.rep.id]?.tier || 1))), 'repairing');
          refreshSlotsUI();
        }
      }
    } else if (!r) {                                   // a recipe that no longer exists: give it all back
      q.shift(); _refundEntry(e); refreshSlotsUI();
    } else if (craftSpeed() > 0) {
      e.t += dt * qSpeed;
      if (e.t >= r.timeToCraft) {
        e.t = 0;
        e.units.shift();
        if (!e.units.length) q.shift();
        // Fine Work stamps what it makes; Spare Parts may add one to an ammo craft
        _giveItems(r.out[0], r.out[1] + skillSpareParts(r.out[0], 1), 'crafted', true, skillCraftMeta(r.out[0]));
        addXP(r.xpToGive || 0);
        // a puff of what was made, just in front of you
        if (typeof fxCraftPuff === 'function') fxCraftPuff(player.pos.x - Math.sin(player.yaw) * 0.6, player.pos.y + 1.1, player.pos.z - Math.cos(player.yaw) * 0.6, r.out[0]);
        refreshSlotsUI();
      }
    }
  }
  _syncQueueHud();
  _syncQueueBars();
}

function _queueSlotHtml(e) {
  if (e && e.rep)                                    // a repair: the tool itself, marked as being mended
    return `<img class="i3d" src="${renderBlockIcon(e.rep.id)}" alt=""><b class="cqRep">&#9874;</b>` +
           '<span class="cqBar"><i></i></span>';
  const r = e && recipeAt(e.ri);
  if (!r) return '';
  const n = e.units.length * r.out[1];
  return `<img class="i3d" src="${renderBlockIcon(r.out[0])}" alt="">` + (n > 1 ? `<b>${n}</b>` : '') +
         '<span class="cqBar"><i></i></span>';
}
// the queue row built under the recipe list; rebuilt with the panel, so no state of its own
function _queuePanel() {
  const q = craftQueue();
  const wrap = document.createElement('div');
  wrap.className = 'cqPanel';
  let slots = '';
  for (let i = 0; i < CRAFT_QUEUE_MAX; i++) {
    const r = q[i] && recipeAt(q[i].ri), rep = q[i] && q[i].rep;
    slots += `<div class="slot cqSlot${r || rep ? '' : ' empty'}" data-cq="${i}"` +
             (rep ? ` title="Click to cancel repairing ${idName(rep.id)}"`
                  : r ? ` title="Click to cancel ${idName(r.out[0])}"` : '') + `>${_queueSlotHtml(q[i])}</div>`;
  }
  wrap.innerHTML = `<div class="cqHead"><span class="ctitle">Queue</span>` +
    `<button class="cqCancel"${q.length ? '' : ' disabled'}>Cancel all</button></div><div class="cqRow">${slots}</div>`;
  wrap.querySelector('.cqCancel').addEventListener('click', () => { if (!dragHeld) cancelCraftQueue(); });
  for (const el of wrap.querySelectorAll('.cqSlot:not(.empty)'))
    el.addEventListener('click', () => { if (!dragHeld) cancelQueueSlot(+el.dataset.cq); });
  return wrap;
}
// the same row on the HUD, half see-through, while the inventory is closed and something is queued
function _syncQueueHud() {
  const q = player.craftQueue;
  const show = !!(q && q.length) && playing && !invOpen && !menuScene && !player.canFly && !player.dead;
  let el = player._cqHud;
  if (!show) { if (el) el.style.display = 'none'; return; }
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'cqHud';
    // in this seat's hotbar, beside the offhand slot (the pane's bottom-left corner before)
    (hotbarEl || document.body).appendChild(el);
    player._cqHud = el;
  }
  // step past the offhand slot when there is one: 9px gap + the 50px slot + 9px gap
  const right = hotbarEl && hotbarEl.querySelector(':scope > .offSlot') ? 'calc(100% + 68px)' : 'calc(100% + 9px)';
  if (el.style.right !== right) el.style.right = right;
  const sig = q.map(e => (e.rep ? 'r' + e.rep.id : e.ri) + ':' + e.units.length).join(',');
  if (el._sig !== sig) { el._sig = sig; el.innerHTML = q.map(e => `<div class="slot">${_queueSlotHtml(e)}</div>`).join(''); }
  el.style.display = 'flex';
}
// only the front slot is ever in progress, so only its bar moves
function _syncQueueBars() {
  const e = player.craftQueue && player.craftQueue[0];
  const total = !e ? 0 : e.rep ? repairTime(e.rep.id) : (recipeAt(e.ri)?.timeToCraft || 0);
  const w = total ? Math.min(100, e.t / total * 100).toFixed(1) + '%' : '0%';
  const a = invOpen ? invPanel('craftPanel')?.querySelector('.cqSlot[data-cq="0"] .cqBar i') : null;
  if (a) a.style.width = w;
  const h = player._cqHud;
  const b = h && h.style.display !== 'none' ? h.querySelector('.cqBar i') : null;
  if (b) b.style.width = w;
}

// saved with the player: the queue holds ingredients already taken out of their bags
const serializeCraftQueue = (p) => ((p && p.craftQueue) || []).map(e =>
  e.rep ? [e.ri, +e.t.toFixed(2), e.units, [e.rep.id, e.rep.meta || null]] : [e.ri, +e.t.toFixed(2), e.units]);
function restoreCraftQueue(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const rec of list) {
    if (!Array.isArray(rec) || !Array.isArray(rec[2])) continue;
    const units = rec[2].filter(_validUnit);
    // a repair carries the tool it is mending; an id that no longer exists drops the entry
    const rp = Array.isArray(rec[3]) && ITEM_PROPS[rec[3][0]]?.durability ? rec[3] : null;
    if (rp) out.push({ ri: -1, t: +rec[1] || 0, units, rep: { id: rp[0], meta: rp[1] && typeof rp[1] === 'object' ? rp[1] : null } });
    else if (units.length) out.push({ ri: +rec[0] || 0, t: +rec[1] || 0, units });
    if (out.length >= CRAFT_QUEUE_MAX) break;
  }
  return out;
}
// death: what the queue was holding falls with everything else you carried
function dropCraftQueueAt(x, y, z) {
  for (const e of player.craftQueue || []) {
    if (e.rep)                                       // a tool being repaired falls as it went in: broken
      spawnDrop(e.rep.id, x, y, z, { x: (Math.random() - 0.5) * 5, y: 2 + Math.random() * 3, z: (Math.random() - 0.5) * 5 }, 2,
                ITEM_PROPS[e.rep.id]?.durability ? 0 : null, e.rep.meta);
    for (const u of e.units)
      for (const [id, c] of u)                       // one stack each
        spawnDrop(id, x, y, z, { x: (Math.random() - 0.5) * 5, y: 2 + Math.random() * 3, z: (Math.random() - 0.5) * 5 }, 2, null, null, 0, c);
  }
  player.craftQueue = [];
}
