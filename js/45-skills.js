'use strict';
/* voxiGrof — skills (0.79)

   POINTS
   ------
   Every level is one skill point. Spending points does NOT spend levels: a level is still a permanent
   record of what you have done (see 35-leveling.js), and the points are simply what those levels have
   bought. Free points = level - the cost of everything already learned. There is no respec.

   THE TREES
   ---------
   SKILLS below is the whole design: one entry per skill, with the category it belongs to, its cost
   and the skills it requires. The trees are NOT laid out by hand — skillLayout() derives each one
   from the `req` links alone: a skill sits one row below the deepest thing it needs, and the rows are
   ordered to keep the connecting lines from crossing. Adding a skill is one entry here, nothing else.

   STATE
   -----
   `player.skills` is a Set of learned ids, on the per-seat player object, so every split-screen seat
   has its own tree exactly as it has its own inventory. It is saved in that player's record beside the
   crafting queue. What each skill DOES lives at the gameplay site it changes, behind hasSkill(id) —
   grep for the id to find it.

   THE VIEW
   --------
   The equipment panel has a Skill tree button; K opens the inventory straight onto the tree. While the
   tree is shown it replaces every other panel in the inventory window, and Back (or K again, or
   closing the inventory) returns. Learning takes two clicks on the same skill — the first arms it,
   the second learns it — since a point spent is spent for good. */

const SKILL_CATS = [
  { key: 'survival',  name: 'Survival' },
  { key: 'crafting',  name: 'Crafting' },
  { key: 'exploring', name: 'Exploring' },
  { key: 'husbandry', name: 'Husbandry' },
];

const SKILLS = [
  // ---- survival ----
  { id: 'thickSkin',   cat: 'survival', name: 'Thick Skin',     cost: 1, req: [],
    desc: '+10% damage reduction' },                                   // was +10% health until 0.791
  { id: 'grassWeaver', cat: 'survival', name: 'Grass Weaver',   cost: 1, req: [],
    desc: '30% better chance of fiber from grass, wheat and bushes' },
  { id: 'slowBurner',  cat: 'survival', name: 'Slow Burner',    cost: 1, req: ['thickSkin'],
    desc: 'Hunger and oxygen drain 5% slower' },                       // oxygen too since 0.7911
  { id: 'canopy',      cat: 'survival', name: 'Canopy Forager', cost: 1, req: ['grassWeaver'],
    desc: '30% better chance of sticks, saplings and apples from leaves' },
  { id: 'timberShake', cat: 'survival', name: 'Timber Shaker',  cost: 2, req: ['canopy'],
    desc: 'Each log you cut shakes the tree: every leaf on it has a 2% chance to fall and drop its loot' },
  // ---- crafting ----
  { id: 'nimble',      cat: 'crafting', name: 'Nimble Fingers', cost: 1, req: [],
    desc: '+10% crafting speed' },
  { id: 'walkWork',    cat: 'crafting', name: 'Walk and Work',  cost: 1, req: ['nimble'],
    desc: 'Crafting slows your walk 25% less' },
  { id: 'fineWork',    cat: 'crafting', name: 'Fine Work',      cost: 1, req: ['nimble'],
    desc: 'Tools and gear you craft from now on are Well made: 10% chance a use costs no durability' },
  { id: 'spareParts',  cat: 'crafting', name: 'Spare Parts',    cost: 1, req: ['nimble'],
    desc: '5% chance an ammo craft gives 1 extra' },
  { id: 'mender',      cat: 'crafting', name: 'Mender',         cost: 2, req: ['fineWork', 'walkWork'],
    desc: 'Worn-out tools and gear break instead of vanishing. Drag a broken one onto the crafting list or queue to repair it for half its recipe (flint anywhere, the rest at a bench)' },
  // ---- exploring ----
  { id: 'treasureNose', cat: 'exploring', name: 'Treasure Nose', cost: 1, req: [],
    desc: '25% chance a loot chest holds one extra item' },
  { id: 'prospector',   cat: 'exploring', name: 'Prospector',    cost: 1, req: [],
    desc: '+1 of the ore from every ore block you mine' },
  { id: 'weathered',    cat: 'exploring', name: 'Weathered',     cost: 2, req: [],
    desc: '+10% cold and heat resistance' },
  { id: 'packRat',      cat: 'exploring', name: 'Pack Rat',      cost: 1, req: ['treasureNose'],
    desc: 'Block stacks hold 10 more' },
  { id: 'hazardHide',   cat: 'exploring', name: 'Hazard Hide',   cost: 1, req: ['prospector', 'treasureNose', 'weathered'],
    desc: '30% less damage from falls, lava and cactus' },   // explosions and temperature once they hurt (0.791)
  // ---- husbandry ----
  { id: 'butcher',     cat: 'husbandry', name: 'Butcher',        cost: 1, req: [],
    desc: '+1 of each drop from animals you kill' },
  { id: 'preserver',   cat: 'husbandry', name: 'Preserver',      cost: 1, req: [],
    desc: 'Food you carry spoils 10% slower' },                        // 0.7911
  { id: 'lingering',   cat: 'husbandry', name: 'Lingering',      cost: 1, req: ['preserver'],   // after Preserver since 0.7911
    desc: 'Food and potion effects last 25% longer' },
  { id: 'gentleHand',  cat: 'husbandry', name: 'Gentle Hand',    cost: 2, req: ['butcher'],
    desc: 'Taming horses and other tameable animals is 10% faster' },
  { id: 'saddler',     cat: 'husbandry', name: 'Saddler',        cost: 2, req: ['gentleHand'],
    desc: 'The saddle recipe costs 20% less' },
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));

/* ---------------------------------- state and points ---------------------------------- */
const _skillSet = () => (player.skills instanceof Set ? player.skills : (player.skills = new Set()));
// the one question every gameplay site asks; `p` for a site that handles a seat other than the installed one
function hasSkill(id, p = (typeof player !== 'undefined' ? player : null)) {
  return !!p && p.skills instanceof Set && p.skills.has(id);
}
const skillPointsTotal = () => (typeof playerLevel === 'number' ? playerLevel : 0);
const skillPointsSpent = () => [..._skillSet()].reduce((n, id) => n + (SKILL_BY_ID[id]?.cost || 0), 0);
const skillPointsFree  = () => Math.max(0, skillPointsTotal() - skillPointsSpent());

// 'owned' | 'ready' (can learn now) | 'poor' (requirements met, not enough points) | 'locked'
function skillState(id) {
  const s = SKILL_BY_ID[id];
  if (!s) return 'locked';
  if (hasSkill(id)) return 'owned';
  // arrow, not every(hasSkill): every() passes the index as hasSkill's `p`, which made every requirement read unmet (0.793)
  if (!s.req.every(r => hasSkill(r))) return 'locked';
  return skillPointsFree() >= s.cost ? 'ready' : 'poor';
}
function learnSkill(id) {
  if (player.canFly || skillState(id) !== 'ready') return false;
  _skillSet().add(id);
  if (typeof playSound === 'function') playSound('levelUp', { gain: 0.5 });
  if (typeof feedSkill === 'function') feedSkill(SKILL_BY_ID[id].name);   // gold, like a level-up (0.7911)
  // anything that reads a skill-driven number is redrawn once: stack caps, stats, the tree itself
  if (typeof vitalsDirty !== 'undefined') vitalsDirty = true;
  if (typeof buildHotbar === 'function') buildHotbar();
  if (invOpen && typeof buildInventory === 'function') buildInventory();
  if (typeof saveAll === 'function') saveAll();
  return true;
}

// saved in each player's record (16-worlds.js for player one, 36-splitscreen.js for the rest)
const serializeSkills = (p) => [...((p && p.skills instanceof Set) ? p.skills : [])];
const restoreSkills = (list) => new Set(Array.isArray(list) ? list.filter(id => SKILL_BY_ID[id]) : []);

/* ---------------------------------- the effects ----------------------------------
   Small helpers the gameplay sites call, so each number lives here beside the skill that sets it. */
const skillLeafMul   = () => hasSkill('canopy') ? 1.3 : 1;          // Canopy Forager: leaf loot chances
const skillFiberMul  = () => hasSkill('grassWeaver') ? 1.3 : 1;     // Grass Weaver: fiber chances
const skillHazardMul = () => hasSkill('hazardHide') ? 0.7 : 1;      // Hazard Hide: fall, cactus, fire, lava
const ORE_BLOCKS = new Set([B.COAL_ORE, B.IRON_ORE, B.COPPER_ORE, B.TIN_ORE, B.GOLD_ORE, B.DIAMOND_ORE,
                            B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, B.TOPAZ_ORE]);
// Prospector: one more of an ore's first drop. A flat +1 for now; meant to become a chance later
const skillOreBonus  = (blockId) => (ORE_BLOCKS.has(blockId) && hasSkill('prospector')) ? 1 : 0;
// Spare Parts: an ammo craft has a 5% chance of one extra, rolled once per craft
function skillSpareParts(outId, crafts) {
  if (!ITEM_PROPS[outId]?.ammo || !hasSkill('spareParts')) return 0;
  let n = 0;
  for (let i = 0; i < crafts; i++) if (Math.random() < 0.05) n++;
  return n;
}
// Fine Work: what a finished craft is stamped with — Well made, if it is something that wears
const skillCraftMeta = (outId) => (hasSkill('fineWork') && ITEM_PROPS[outId]?.durability) ? { wm: 1 } : null;

/* ONE use's worth of wear on a tool or a piece of gear (0.79). Every wear site calls this instead of
   subtracting on its own, so Well made and Mender apply everywhere at once:
     - Well made (Fine Work) shrugs a use off one time in ten
     - at zero the item BREAKS. Without Mender that is the end of it: 'gone', the caller clears the
       slot. With Mender it stays where it is at 0 durability — 'broken', useless until repaired
     - something already broken takes no further wear: 'kept'
   Returns 'kept' | 'broken' | 'gone'. */
function wearSlot(s, n = 1) {
  if (!s || s.dur == null || s.dur <= 0) return 'kept';
  if (s.wm && Math.random() < 0.1) return 'kept';
  s.dur = Math.max(0, s.dur - n);
  if (s.dur > 0) return 'kept';
  if (hasSkill('mender')) {
    if (typeof feedWarn === 'function') feedWarn(`${ITEM_PROPS[s.id]?.name || 'Tool'} broke — drag it onto the crafting list to repair`);
    return 'broken';
  }
  if (typeof feedItem === 'function') feedItem(s.id, -1, 'broke');
  return 'gone';
}

/* Timber Shaker: every swing that bites into a standing tree's log shakes it, and each leaf of that
   tree has a 2% chance to fall, dropping what a leaf that fell on its own would. "That tree" is the
   same one felling would take: its natural logs flooded from the cut, then the leaves connected to
   them. Placed logs end the flood, so a build next to a tree is never part of it. */
const SHAKE_CHANCE = 0.02, SHAKE_MAX_LOGS = 64, SHAKE_MAX_LEAVES = 900;
function skillShakeTree(x, y, z) {
  if (!hasSkill('timberShake') || player.canFly) return;
  const logs = [], seen = new Set([x + ',' + y + ',' + z]), stack = [[x, y, z]];
  while (stack.length && logs.length < SHAKE_MAX_LOGS) {
    const [cx, cy, cz] = stack.pop();
    logs.push([cx, cy, cz]);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const nx = cx + dx, ny = cy + dy, nz = cz + dz, k = nx + ',' + ny + ',' + nz;
      if (seen.has(k)) continue;
      seen.add(k);
      const v = getBlock(nx, ny, nz);
      if (isAnyLog(v & 255) && !isPlacedLog(v)) stack.push([nx, ny, nz]);
    }
  }
  /* The leaf flood keeps its OWN visited set: the log flood above marks every neighbour of every log
     as seen, leaves included, and sharing that set would hide exactly the leaves touching the trunk. */
  const leaves = [], lq = [], leafSeen = new Set();
  const tryLeaf = (nx, ny, nz) => {
    const k = nx + ',' + ny + ',' + nz;
    if (leafSeen.has(k)) return;
    leafSeen.add(k);
    const v = getBlock(nx, ny, nz);
    if (_isLeafVal(v)) { leaves.push([nx, ny, nz, v & 255]); lq.push([nx, ny, nz]); }
  };
  const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [lx, ly, lz] of logs) for (const [dx, dy, dz] of D6) tryLeaf(lx + dx, ly + dy, lz + dz);
  while (lq.length && leaves.length < SHAKE_MAX_LEAVES) {
    const [cx, cy, cz] = lq.pop();
    for (const [dx, dy, dz] of D6) tryLeaf(cx + dx, cy + dy, cz + dz);
  }
  let fell = null;
  for (const [lx, ly, lz, id] of leaves) {
    if (Math.random() >= SHAKE_CHANCE) continue;
    setBlock(lx, ly, lz, B.AIR);
    for (const d of blockDrop(id, true)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, lx, ly, lz);
    fell = fell || [lx, ly, lz, id];
  }
  if (fell && typeof playBlockSound === 'function') playBlockSound(fell[3], 'break', fell[0], fell[1], fell[2]);
}

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
    const st = skillState(s.id), armed = player._skillArm === s.id && st === 'ready';
    return `<div class="skNode ${st}${armed ? ' armed' : ''}" data-sk="${s.id}" ` +
           `style="left:${L.pos[s.id].x}px;top:${L.pos[s.id].y}px;width:${SK_NODE_W}px;height:${SK_NODE_H}px">` +
           `<b>${s.name}</b><small>${armed ? 'click again to learn' : st === 'owned' ? 'learned' : s.cost + ' point' + (s.cost > 1 ? 's' : '')}</small></div>`;
  }).join('');
  sp.innerHTML =
    '<div class="skHead">' +
      '<div class="skTabsSlot"></div>' +                // the inventory's tabs, the way back out (0.795; was a Back button)
      '<div class="ctitle"></div>' +                    // untitled since 0.796 (its tab is lit); still the spacer
      `<div class="skPts"><b>${free}</b> point${free === 1 ? '' : 's'} free <small>level ${lvl}</small></div>` +
    '</div>' +
    `<div class="skTabs">${tabs}</div>` +
    `<div class="skTree" style="width:${L.width}px;height:${L.height}px">` +
      `<svg width="${L.width}" height="${L.height}">${lines}</svg>${nodes}` +
    '</div>' +
    '<div class="skHint">Click a skill twice to learn it &middot; points come from levels, learning keeps your level &middot; <b>K</b> to close</div>';
  const invTabs = typeof invTabsEl === 'function' ? invTabsEl('skills') : null;
  if (invTabs) sp.querySelector('.skTabsSlot').replaceWith(invTabs);
  for (const el of sp.querySelectorAll('.skTab'))
    el.addEventListener('click', () => { player._skillCat = el.dataset.cat; player._skillArm = null; buildInventory(); });
  for (const el of sp.querySelectorAll('.skNode'))
    el.addEventListener('click', () => _skillNodeClick(el.dataset.sk));
}
function _skillNodeClick(id) {
  const st = skillState(id);
  if (st !== 'ready') {
    player._skillArm = null;
    if (st === 'poor') feedWarn(`Not enough skill points for ${SKILL_BY_ID[id].name}`);
    else if (st === 'locked') feedWarn(`${SKILL_BY_ID[id].name} needs ${SKILL_BY_ID[id].req.filter(r => !hasSkill(r)).map(r => SKILL_BY_ID[r].name).join(', ')} first`);
    buildInventory();
    return;
  }
  if (player._skillArm === id) { player._skillArm = null; learnSkill(id); return; }
  player._skillArm = id;
  buildInventory();
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
  const line = { owned: 'Learned', ready: 'Click twice to learn', poor: `Needs ${s.cost - skillPointsFree()} more point${s.cost - skillPointsFree() > 1 ? 's' : ''}`,
                 locked: 'Learn what it requires first' }[st];
  html += `<div class="tipRow"><span>status</span><b>${line}</b></div></div>`;
  return html;
}

/* The pad cursor's targets (0.79): the Skill tree button on the equipment panel, and — while the tree
   is up — its tabs, Back and every skill. nearestElement feeds these to the magnet and the tooltip. */
function getSkillElements() {
  if (typeof invOpen === 'undefined' || !invOpen) return [];
  const out = [];
  // the inventory's tabs on whichever right-hand panel is up (0.795; they replaced the Skill tree button)
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
