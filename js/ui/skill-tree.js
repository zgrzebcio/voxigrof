'use strict';
/* ui/skill-tree.js: the skill tree on screen (K). Its layout, the view, holding to learn, tooltips. */

/* ---------------------------------- layout ----------------------------------
   Row = depth: 0 for a skill with no requirements, otherwise one below the deepest skill it needs.
   Within a row, roots keep their order from SKILLS; every deeper skill is placed at the average
   column of the skills it needs (barycentre), which keeps the connecting lines short and uncrossed.
   A second, upward pass then centres each skill over the skills that need it, so one skill that opens
   three sits over the middle of them rather than over the first, and a last downward pass re-centres
   the skills that need several. Every pass keeps a full column between neighbours in a row. */
const SK_NODE_W = 128, SK_NODE_H = 52, SK_COL_W = 146, SK_ROW_H = 88, SK_PAD = 14;
function skillLayout(cat) {
  const list = SKILLS.filter(s => s.cat === cat);
  const depth = {};
  const depthOf = (s) => {
    if (depth[s.id] != null) return depth[s.id];
    depth[s.id] = 0;                                   // guards a cycle in bad data from recursing forever
    const ds = s.req.map(r => SKILL_BY_ID[r]).filter(r => r && r.cat === cat).map(depthOf);
    return (depth[s.id] = ds.length ? 1 + Math.max(...ds) : 0);
  };
  list.forEach(depthOf);
  const rows = [];
  for (const s of list) (rows[depth[s.id]] || (rows[depth[s.id]] = [])).push(s);
  const col = {};
  /* Lay one row out at the wanted columns, never closer than one column apart. Skills whose wanted
     columns collide are merged into a block that is CENTRED on the average of their wants — so three
     skills that all want to sit under the same parent spread either side of it, not off to its right. */
  const place = (row, want) => {
    const order = row.map((s, i) => i).sort((a, b) => want[a] - want[b] || a - b);
    const blocks = [];
    for (const i of order) {
      blocks.push({ ids: [i], sum: want[i] });
      while (blocks.length > 1) {
        const p = blocks[blocks.length - 2], q = blocks[blocks.length - 1];
        const pEnd = p.sum / p.ids.length + (p.ids.length - 1) / 2;
        const qStart = q.sum / q.ids.length - (q.ids.length - 1) / 2;
        if (qStart - pEnd >= 1) break;
        p.ids.push(...q.ids); p.sum += q.sum; blocks.pop();
      }
    }
    for (const bl of blocks) {
      const start = bl.sum / bl.ids.length - (bl.ids.length - 1) / 2;
      bl.ids.forEach((i, k) => { col[row[i].id] = start + k; });
    }
  };
  const mean = (ids) => ids.reduce((a, id) => a + col[id], 0) / ids.length;
  // down: each skill under the middle of what it requires
  const down = () => rows.forEach((row, r) => {
    if (r === 0) return;
    place(row, row.map(s => { const ps = s.req.filter(id => col[id] != null); return ps.length ? mean(ps) : 0; }));
  });
  rows[0].forEach((s, i) => { col[s.id] = i; });
  down();
  // up: each skill over the middle of what it opens (a skill that opens nothing stays put)
  const kids = {};
  for (const s of list) for (const r of s.req) (kids[r] || (kids[r] = [])).push(s.id);
  for (let r = rows.length - 2; r >= 0; r--)
    place(rows[r], rows[r].map(s => kids[s.id] ? mean(kids[s.id]) : col[s.id]));
  // ...and down once more, since moving a parent moved the middle a skill with several should sit under
  down();
  // shift so the leftmost column is 0, then centre every row's block under the widest
  const minC = Math.min(...Object.values(col));
  for (const id in col) col[id] -= minC;
  const cols = Math.max(...Object.values(col)) + 1;
  const width = SK_PAD * 2 + (cols - 1) * SK_COL_W + SK_NODE_W;
  const height = SK_PAD * 2 + (rows.length - 1) * SK_ROW_H + SK_NODE_H;
  const pos = {};
  for (const s of list) pos[s.id] = { x: SK_PAD + col[s.id] * SK_COL_W, y: SK_PAD + depth[s.id] * SK_ROW_H };
  return { list, pos, width, height };
}

/* ---------------------------------- the view ---------------------------------- */
const skillViewOn = () => !!(typeof player !== 'undefined' && player && player._skillView && !player.canFly);

function openSkillTree() {
  if (player.canFly || player.dead) return;
  if (typeof cancelDrag === 'function') cancelDrag();
  player._skillView = true;
  player._skillArm = null;
  if (!player._skillCat) player._skillCat = SKILL_CATS[0].key;
  if (!invOpen) toggleInventory(true); else buildInventory();
  // toggleInventory centres the cursor on the (now hidden) grid: put it on the tree instead
  const sp = invPanel('skillPanel');
  if (sp) { const r = sp.getBoundingClientRect(); if (r.width) { invCursor.x = r.left + r.width / 2; invCursor.y = r.top + 60; } }
}
function closeSkillTree() {
  if (!player._skillView) return;
  player._skillView = false;
  player._skillArm = null;
  if (invOpen) buildInventory();
}

/* Called at the end of buildInventory: with the tree on, every other panel steps aside for it. The
   grid is hidden rather than emptied, so turning the tree off is a style change, not a rebuild. */
function syncSkillView() {
  const sp = invPanel('skillPanel');
  if (!sp) return;
  if (!skillViewOn()) { sp.style.display = 'none'; if (invEl) invEl.style.display = ''; return; }
  for (const id of ['craftPanel', 'furnacePanel', 'chestPanel', 'equipPanel', 'structPanel']) {
    const el = invPanel(id);
    if (el) el.style.display = 'none';
  }
  if (invEl) invEl.style.display = 'none';
  sp.style.display = 'flex';
  _renderSkillPanel(sp);
}

function _renderSkillPanel(sp) {
  const cat = player._skillCat || SKILL_CATS[0].key;
  const free = skillPointsFree(), lvl = skillPointsTotal();
  const L = skillLayout(cat);
  const tabs = SKILL_CATS.map(c => {
    const owned = SKILLS.filter(s => s.cat === c.key && hasSkill(s.id)).length;
    const all = SKILLS.filter(s => s.cat === c.key).length;
    return `<button class="skTab${c.key === cat ? ' on' : ''}" data-cat="${c.key}">${c.name} <small>${owned}/${all}</small></button>`;
  }).join('');
  // the connecting lines: from the bottom middle of each requirement to the top middle of the skill
  let lines = '';
  for (const s of L.list) for (const r of s.req) {
    const a = L.pos[r], b = L.pos[s.id];
    if (!a || !b) continue;
    const x1 = a.x + SK_NODE_W / 2, y1 = a.y + SK_NODE_H, x2 = b.x + SK_NODE_W / 2, y2 = b.y;
    const my = (y1 + y2) / 2;
    lines += `<path class="skLink${hasSkill(r) ? ' lit' : ''}" d="M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}"/>`;
  }
  const nodes = L.list.map(s => {
    const st = skillState(s.id);
    return `<div class="skNode ${st}" data-sk="${s.id}" ` +
           `style="left:${L.pos[s.id].x}px;top:${L.pos[s.id].y}px;width:${SK_NODE_W}px;height:${SK_NODE_H}px">` +
           `<b>${s.name}</b><small>${st === 'owned' ? 'learned' : st === 'ready' ? 'hold to learn' : s.cost + ' point' + (s.cost > 1 ? 's' : '')}</small></div>`;
  }).join('');
  sp.innerHTML =
    '<div class="skHead">' +
      '<div class="skTabsSlot"></div>' +                // the inventory's tabs, the way back out (was a Back button)
      '<div class="ctitle"></div>' +                    // untitled since 0.796 (its tab is lit); still the spacer
      `<div class="skPts"><b>${free}</b> point${free === 1 ? '' : 's'} free <small>level ${lvl}</small></div>` +
    '</div>' +
    `<div class="skTabs">${tabs}</div>` +
    `<div class="skTree" style="width:${L.width}px;height:${L.height}px">` +
      `<svg width="${L.width}" height="${L.height}">${lines}</svg>${nodes}` +
    '</div>' +
    '<div class="skHint">Hold a skill for half a second to learn it &middot; points come from levels, learning keeps your level &middot; <b>K</b> to close</div>';
  const invTabs = typeof invTabsEl === 'function' ? invTabsEl('skills') : null;
  if (invTabs) sp.querySelector('.skTabsSlot').replaceWith(invTabs);
  for (const el of sp.querySelectorAll('.skTab'))
    el.addEventListener('click', () => { player._skillCat = el.dataset.cat; player._skillArm = null; buildInventory(); });
  /* Learning is a HOLD (it was two clicks): press on a ready skill and keep holding for
     SKILL_HOLD_TIME. A skill that cannot be learned still says why on a plain click. */
  for (const el of sp.querySelectorAll('.skNode')) {
    el.addEventListener('mousedown', (e) => { if (e.button === 0) skillHoldStart(el.dataset.sk, 'mouse'); });
    el.addEventListener('mouseleave', () => skillHoldEnd('mouse'));
    el.addEventListener('click', () => _skillNodeClick(el.dataset.sk));
  }
}
const SKILL_HOLD_TIME = 0.5;           // seconds held on a skill to learn it (1 until 0.8291)
function skillHoldStart(id, src) {
  if (skillState(id) !== 'ready') return false;
  player._skillHold = { id, t: 0, src };
  return true;
}
function skillHoldEnd(src) {
  const h = player._skillHold;
  if (!h || (src && h.src !== src)) return;
  player._skillHold = null;
  const el = _skNodeEl(h.id);
  if (el) { el.classList.remove('holding'); el.style.removeProperty('--hold'); }
}
const _skNodeEl = (id) => { const sp = invPanel('skillPanel'); return sp ? sp.querySelector('.skNode[data-sk="' + id + '"]') : null; };
/* Per seat, per frame (22-main-loop.js): fills the held skill's bar, and learns it when full. A pad's hold
   lets go the moment its cursor leaves the skill. */
const SKILL_REMIND = 10;                  // seconds between "points to spend" reminders
function updateSkillHold(dt) {
  // unspent points nag gently on the feed, every SKILL_REMIND seconds, in gold
  // ...but not while the tree is open: the reminder on screen goes, and the count starts again when it closes
  if (invOpen && skillViewOn()) {
    player._skRemindT = SKILL_REMIND;
    if (typeof _feedRetire === 'function') _feedRetire('skillpts');
  } else if (!player.canFly && !player.dead && playing && typeof feedSkillPoints === 'function') {
    player._skRemindT = (player._skRemindT ?? 3) - dt;
    if (player._skRemindT <= 0) {
      player._skRemindT = SKILL_REMIND;
      const free = skillPointsFree();
      if (free > 0) feedSkillPoints(free);
    }
  }
  const h = player._skillHold;
  if (!h) return;
  if (!invOpen || !player._skillView || skillState(h.id) !== 'ready') { skillHoldEnd(); return; }
  if (h.src === 'pad') {
    const at = document.elementFromPoint(invCursor.x, invCursor.y);
    const node = at && at.closest ? at.closest('.skNode') : null;
    if (!node || node.dataset.sk !== h.id) { skillHoldEnd(); return; }
  }
  h.t += dt;
  const el = _skNodeEl(h.id);
  if (el) { el.classList.add('holding'); el.style.setProperty('--hold', String(Math.min(1, h.t / SKILL_HOLD_TIME))); }
  if (h.t >= SKILL_HOLD_TIME) { player._skillHold = null; learnSkill(h.id); }
}
addEventListener('mouseup', () => { if (typeof player !== 'undefined' && player) skillHoldEnd('mouse'); });
function _skillNodeClick(id) {
  const st = skillState(id);
  if (st !== 'ready') {
    player._skillArm = null;
    if (st === 'poor') feedWarn(`Not enough skill points for ${SKILL_BY_ID[id].name}`);
    else if (st === 'locked') feedWarn(`${SKILL_BY_ID[id].name} needs ${SKILL_BY_ID[id].req.filter(r => !hasSkill(r)).map(r => SKILL_BY_ID[r].name).join(', ')} first`);
    buildInventory();
    return;
  }
  // a ready skill is learned by holding it (skillHoldStart); a click alone does nothing more
}

// the hover panel for a skill: what it does, what it costs, what it needs, and where you stand
function skillTipHTML(id) {
  const s = SKILL_BY_ID[id];
  if (!s) return '';
  const st = skillState(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let html = `<div class="tipName">${esc(s.name)}</div><div class="tipDesc">${esc(s.desc)}</div><div class="tipStats">`;
  html += `<div class="tipRow"><span>cost</span><b>${s.cost} point${s.cost > 1 ? 's' : ''}</b></div>`;
  for (const r of s.req)
    html += `<div class="tipRow"><span>requires</span><b class="${hasSkill(r) ? 'skOk' : 'skNo'}">${hasSkill(r) ? '&#10003;' : '&#10007;'} ${esc(SKILL_BY_ID[r]?.name || r)}</b></div>`;
  const line = { owned: 'Learned', ready: 'Hold for half a second to learn', poor: `Needs ${s.cost - skillPointsFree()} more point${s.cost - skillPointsFree() > 1 ? 's' : ''}`,
                 locked: 'Learn what it requires first' }[st];
  html += `<div class="tipRow"><span>status</span><b>${line}</b></div></div>`;
  return html;
}

/* The pad cursor's targets: the Skill tree button on the equipment panel, and — while the tree
   is up — its tabs, Back and every skill. nearestElement feeds these to the magnet and the tooltip. */
function getSkillElements() {
  if (typeof invOpen === 'undefined' || !invOpen) return [];
  const out = [];
  // the inventory's tabs on whichever right-hand panel is up (they replaced the Skill tree button)
  for (const id of ['equipPanel', 'furnacePanel', 'chestPanel', 'structPanel']) {
    const p = invPanel(id);
    if (p && p.style.display !== 'none') for (const el of p.querySelectorAll('.invTab')) out.push({ el, type: 'skill', tip: null });
  }
  const sp = invPanel('skillPanel');
  if (sp && sp.style.display !== 'none') {
    for (const el of sp.querySelectorAll('.invTab, .skTab')) out.push({ el, type: 'skill', tip: null });
    for (const el of sp.querySelectorAll('.skNode')) out.push({ el, type: 'skill', tip: () => skillTipHTML(el.dataset.sk) });
  }
  return out;
}

// the button on the equipment panel, with the free points on it so a new point is noticed
function skillOpenButton() {
  const free = skillPointsFree();
  const b = invButton(free ? `Skill tree (${free})` : 'Skill tree', 'Spend skill points (K)', openSkillTree);
  b.classList.add('skOpenBtn');
  if (free) b.classList.add('hasPts');
  return b;
}

/* K: open the inventory straight on the tree, or close it again. Seat one's keyboard, like Q. */
document.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyK' || e.repeat) return;
  if (typeof inputCapture !== 'undefined' && inputCapture) return;
  const run = () => {
    if (!playing || player.dead || player.canFly || worldJoining()) return;
    if (invOpen && player._skillView) { toggleInventory(false); return; }
    openSkillTree();
  };
  if (typeof withSlot === 'function' && typeof PSTATE !== 'undefined' && PSTATE.length > 1) withSlot(0, run); else run();
});
