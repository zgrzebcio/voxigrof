'use strict';
/* ui/inventory-cursor.js: what the cursor can land on. Slots, recipe icons and info elements, the one under a point,
   and the nearest one for the gamepad's snapping cursor. */

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
  // a slot scrolled out of its box (a large metal chest, the creative palette) is no target: its rect lies over the tabs
  return out.filter(d => !_slotClipped(d.el));
}
function _slotClipped(el) {
  const box = el.closest && el.closest('.chestScroll, .invScroll');
  if (!box) return false;
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect(), cy = (r.top + r.bottom) / 2;
  return cy < b.top || cy > b.bottom;
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

// crafting icons: get all .cing (ingredients) and .cbtn (output) with title attributes for tooltips
function getCraftingElements() {
  const out = [];
  /* the furnace's smelting book shows the same icons, read-only. Type 'book' gives them, the
     tabs and the book button their own stronger pad magnet; rows scrolled out of the list are skipped. */
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
   under the edge must not answer for the slot next to it. */
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
  /* Stat and effect lines in the equipment panel. A line is wide and thin, so it is measured to
     its nearest EDGE rather than its centre: anywhere on the line counts as on it, for the mouse and
     for the pad cursor's magnet alike. */
  // the Skill tree button and, while the tree is up, its tabs and skills
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
