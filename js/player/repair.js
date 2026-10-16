'use strict';
/* player/repair.js: repairing and dismantling gear by dropping it on the zones beside the inventory. */

/* ---------------------------------- repairs (Mender) and dismantling ----------------------------------
   Carry a piece of gear in the inventory and two drop zones slide in beside the panels:

     REPAIR (Mender), under the crafting panel. Any worn item: it goes into the personal queue and comes
       back whole. The cost is its recipe scaled by how worn it is — half the recipe at 0 durability, less
       the more is left (each ingredient rounded up) — and half the craft time. Anything made with flint can
       be mended anywhere; everything else only while a crafting bench is open.
     DISMANTLE (Dismantle), under the equipment panel. Tools, weapons, armor, shields and bows break down
       into half their recipe, scaled by the durability left, rounded down. A broken one gives nothing.

   Hovering a zone says what it would cost or give. Letting go on one asks first, in the middle of the
   screen (uiConfirm, ui/menus.js); the item stays on the cursor until you answer. */
function repairRecipeFor(id) {
  const all = [...RECIPES_BASIC, ...RECIPES_ADVANCED].filter(r => r && r.out[0] === id);
  return all.find(r => !r.removed) || all[0] || null;    // a retired recipe (the chisel) still prices a repair
}
const _wornFrac = (id, dur) => { const m = ITEM_PROPS[id]?.durability; return m ? Math.max(0, Math.min(1, 1 - (dur ?? m) / m)) : 0; };
// what a repair costs: half the recipe at 0 durability, scaled down by what is left (`dur` omitted: broken)
const repairCost = (id, dur = 0) => {
  const r = repairRecipeFor(id), w = _wornFrac(id, dur);
  return r && w > 0 ? r.in.map(([i, n]) => [i, Math.max(1, Math.ceil(n / 2 * w))]) : null;
};
// what dismantling gives: half the recipe, scaled by the durability left, rounded down
const dismantleYield = (id, dur) => {
  const r = repairRecipeFor(id), m = ITEM_PROPS[id]?.durability;
  if (!r || !m) return null;
  const left = Math.max(0, Math.min(1, (dur ?? m) / m));
  return r.in.map(([i, n]) => [ingIds(i)[0], Math.floor(n / 2 * left)]).filter(([, n]) => n > 0);
};
const repairNeedsBench = (id) => { const r = repairRecipeFor(id); return !(r && r.in.some(([i]) => ingIds(i).includes(ITEM.FLINT))); };
const repairTime = (id) => Math.max(1, (repairRecipeFor(id)?.timeToCraft || 2) / 2);
const _atBench = () => craftMode === 'advanced' && !!activeBench;
// "3 Flint, 2 Stick, 5 Fiber" — a variant group reads as its first member with "(any)"
const _costText = (list) => (list || [])
  .map(([i, n]) => { const ids = ingIds(i); return `${n} ${idName(ids[0])}${ids.length > 1 ? ' (any)' : ''}`; }).join(', ');
const repairCostText = (id, dur = 0) => _costText(repairCost(id, dur));
const dismantleText = (id, dur) => _costText(dismantleYield(id, dur));

const canRepair = (s) => !!s && !player.canFly && hasSkill('mender') && !!ITEM_PROPS[s.id]?.durability
  && (s.dur ?? ITEM_PROPS[s.id].durability) < ITEM_PROPS[s.id].durability && !!repairRecipeFor(s.id);
const canDismantle = (s) => !!s && !player.canFly && hasSkill('dismantle') && !!ITEM_PROPS[s.id]?.durability && !!repairRecipeFor(s.id);

// the two zones, one pair per seat (each seat has its own inventory wrapper)
const _zonesOf = new WeakMap();
function _zones() {
  const host = typeof invWrapEl !== 'undefined' && invWrapEl ? invWrapEl : document.body;
  let z = _zonesOf.get(host);
  if (!z) {
    const mk = (cls) => { const el = document.createElement('div'); el.className = 'dropZone ' + cls;
      el.innerHTML = '<div class="dzTitle"></div><div class="dzText"></div>'; host.appendChild(el); return el; };
    z = { repair: mk('dzRepair'), dismantle: mk('dzDismantle') };
    _zonesOf.set(host, z);
  }
  return z;
}
const _visibleRect = (el) => { if (!el || el.style.display === 'none') return null; const r = el.getBoundingClientRect(); return r.width > 0 ? r : null; };
const _inRect = (r, x, y) => !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
function _placeZone(el, under, on) {
  el.classList.toggle('on', on);
  if (!on || !under) return;
  const h = 62, top = Math.min(under.bottom + 8, innerHeight - h - 8);
  el.style.left = under.left + 'px'; el.style.top = top + 'px'; el.style.width = under.width + 'px';
}
// the right-hand panel the dismantle zone hangs under: equipment, or whatever station has taken its place
const _rightPanel = () => ['equipPanel', 'chestPanel', 'furnacePanel', 'structPanel']
  .map(id => _visibleRect(invPanel(id))).find(r => r) || null;
/* Once per frame per seat (22-main-loop.js): show, place and word the zones for what the cursor carries. */
function updateDropZones() {
  const z = _zones();
  const s = invOpen && !(typeof uiAskOpen === 'function' && uiAskOpen()) ? dragHeld : null;
  const x = invCursor.x, y = invCursor.y;
  const craftR = _visibleRect(invPanel('craftPanel')), rightR = _rightPanel();
  const rep = canRepair(s) && !!craftR, dis = canDismantle(s) && !!rightR;
  _placeZone(z.repair, craftR, rep);
  _placeZone(z.dismantle, rightR, dis);
  if (rep) {
    const hot = _inRect(z.repair.getBoundingClientRect(), x, y);
    z.repair.classList.toggle('hot', hot);
    z.repair.querySelector('.dzTitle').textContent = hot ? `Repair ${idName(s.id)}` : 'Drop here to repair';
    z.repair.querySelector('.dzText').textContent = hot
      ? (repairNeedsBench(s.id) && !_atBench() ? 'Only at a crafting bench' : `Costs ${repairCostText(s.id, s.dur)}`)
      : 'for part of what it takes to craft';
  }
  if (dis) {
    const hot = _inRect(z.dismantle.getBoundingClientRect(), x, y);
    z.dismantle.classList.toggle('hot', hot);
    const give = dismantleText(s.id, s.dur);
    z.dismantle.querySelector('.dzTitle').textContent = hot ? `Dismantle ${idName(s.id)}` : 'Drop here to dismantle';
    z.dismantle.querySelector('.dzText').textContent = hot ? (give ? `You get back ${give}` : 'Too worn: nothing to salvage')
                                                           : 'for half of what it was made from';
  }
}
function _repairNow(s) {
  const name = idName(s.id), cost = repairCost(s.id, s.dur);
  if (!cost) { feedWarn(`${name} cannot be repaired`); return; }
  if (repairNeedsBench(s.id) && !_atBench()) { feedWarn(`${name} can only be repaired at a crafting bench`); return; }
  if (craftSpeed() <= 0) { feedWarn(_cantCraftMsg); return; }
  if (craftQueue().length >= CRAFT_QUEUE_MAX) { feedWarn('Crafting queue is full'); return; }
  const u = _takeIngredients({ in: cost, out: [s.id, 1] });
  if (!u) { feedWarn(`Missing materials to repair ${name}: ${repairCostText(s.id, s.dur)}`); return; }
  craftQueue().push({ ri: -1, t: 0, units: [u], rep: { id: s.id, meta: slotMeta(s) } });
  if (dragHeld === s) { dragHeld = null; dragFrom = null; }
  if (typeof feedItem === 'function') feedItem(s.id, -1, 'into repair');
  refreshSlotsUI();
}
function _dismantleNow(s) {
  const give = dismantleYield(s.id, s.dur) || [];
  if (dragHeld === s) { dragHeld = null; dragFrom = null; }
  if (typeof feedItem === 'function') feedItem(s.id, -1, 'dismantled');
  for (const [id, n] of give) _giveItems(id, n, 'salvaged', false);
  refreshSlotsUI();
}
/* Called wherever a carried item is let go (mouse click-carry or pad release) that is not a slot. True
   when a drop zone took it — the item stays carried while the question is up, and nothing else happens. */
function tryRepairDrop(x, y) {
  const s = dragHeld;
  if (!s || player.canFly) return false;
  const z = _zones();
  const onRep = canRepair(s) && z.repair.classList.contains('on') && _inRect(z.repair.getBoundingClientRect(), x, y);
  const onDis = !onRep && canDismantle(s) && z.dismantle.classList.contains('on') && _inRect(z.dismantle.getBoundingClientRect(), x, y);
  if (!onRep && !onDis) return false;
  const name = idName(s.id);
  // the answer only counts for the item still on the cursor: anything else put down meanwhile cancels it
  const still = (fn) => () => { if (dragHeld === s) fn(s); };
  if (onRep) {
    if (repairNeedsBench(s.id) && !_atBench()) { feedWarn(`${name} can only be repaired at a crafting bench`); return true; }
    uiConfirm(`Repair ${name}?`, `It costs ${repairCostText(s.id, s.dur)} and goes into your crafting queue.`, still(_repairNow), 'Repair');
  } else {
    const give = dismantleText(s.id, s.dur);
    uiConfirm(`Dismantle ${name}?`, give ? `You get back ${give}. The item is gone.` : 'It is too worn: nothing comes back.',
              still(_dismantleNow), 'Dismantle');
  }
  return true;
}
