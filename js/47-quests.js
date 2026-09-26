'use strict';
/* voxiGrof — starter quests (0.798)

   A short chain that walks a new player through the first steps of README's "Your first steps": fiber,
   sticks, flint, the first tools, wood, a bench, stone, a furnace, iron. One quest at a time, shown in the
   top-right corner under the version, with its progress and its reward. Finishing one pays its XP and
   moves to the next; after the last the box goes away.

   Kept simple on purpose: a quest is "have N of these in your inventory", checked a few times a second
   against the hotbar, the grid, a worn backpack and the equipment. That way it does not matter HOW you
   got the thing — picked, crafted, smelted, looted — and nothing else in the game needs a hook. Only the
   index of the current quest is saved, per player, beside the skills; survival only. */

/* Each quest is a list of requirements, all to be carried at once: `items` (any of them count) and how
   many are needed. One requirement per thing, so "every stone tool" is five of them, one each.
   The chain was rewritten in 0.799 (berries, stone tools, bucket and milk, the mortar, pie, bronze, gems);
   a save's quest number from 0.798 simply lands on whatever sits at that place now. */
const _req = (items, need = 1) => ({ items: Array.isArray(items) ? items : [items], need });
// a requirement that counts anything matching a test rather than a fixed list (0.7992)
const _reqAny = (test, need, label) => ({ test, need, label });
const QUESTS = [
  { name: 'Gather fiber',           hint: 'Hold E on grass, wheat or bushes',        reqs: [_req(ITEM.FIBER, 5)],  xp: 10 },
  { name: 'Find sticks',            hint: 'Break leaves',                            reqs: [_req(ITEM.STICK, 3)],  xp: 10 },
  { name: 'Pick up flint',          hint: 'Hold E on a flint pebble, or dig gravel', reqs: [_req(ITEM.FLINT, 4)],  xp: 10 },   // 4, the hatchet's worth (0.8095)
  { name: 'Gather food',            hint: 'Berries, apples, meat — anything edible counts',
    reqs: [_reqAny((id) => (id >= 256 ? ITEM_PROPS[id]?.food : 0) > 0 || id === ITEM.CANTALOUPE_SLICE, 15, 'food')], xp: 15 },
  // the flint pickaxe left the chain in 0.8095: it breaks stone but keeps none
  { name: 'Craft a flint hatchet',  hint: 'Open the inventory (Tab) and craft it. It cuts logs', reqs: [_req(ITEM.FLINT_HATCHET)], xp: 15 },
  { name: 'Chop wood',              hint: 'Use the hatchet on a tree',
    reqs: [_req([B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.STRIPPED_LOG, B.STRIPPED_BIRCH_LOG, B.STRIPPED_SPRUCE_LOG], 4)], xp: 15 },
  { name: 'Make planks',            hint: 'A log makes 3 planks',                    reqs: [_req([B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS], 10)], xp: 10 },
  { name: 'Build a crafting bench', hint: '5 planks and 5 fiber',                    reqs: [_req(B.CRAFTING_BENCH)], xp: 20 },
  /* The way into the stone age (0.8095): a flint pickaxe keeps no stone, so the first five come from stone
     pebbles (five make a stone at the bench) — enough for a stone pickaxe, which then mines the rest. */
  { name: 'Stone for a pickaxe',    hint: 'Hold E on stone pebbles; 5 make a stone at the bench',
    reqs: [_req([B.STONE, B.COBBLE], 5)], xp: 15 },
  { name: 'Craft a stone pickaxe',  hint: '5 stone, 3 sticks and 10 fiber, at the bench', reqs: [_req(ITEM.STONE_PICKAXE)], xp: 20 },
  { name: 'Mine stone',             hint: 'Only a stone pickaxe or better keeps what it breaks',
    reqs: [_req([B.STONE, B.COBBLE], 10)], xp: 15 },
  { name: 'Stone tools',            hint: 'Hatchet, shovel, hoe and sword, at the bench',
    reqs: [ITEM.STONE_HATCHET, ITEM.STONE_SHOVEL, ITEM.STONE_HOE, ITEM.STONE_SWORD].map(id => _req(id)), xp: 30 },
  { name: 'Build a furnace',        hint: '12 cobblestone, at the bench',            reqs: [_req(B.FURNACE)], xp: 25 },
  { name: 'Smelt iron',             hint: 'Raw iron in the furnace, fuel under it',  reqs: [_req(ITEM.IRON_INGOT)], xp: 30 },
  { name: 'Make a bucket',          hint: 'It takes 3 iron ingots',                  reqs: [_req(ITEM.BUCKET)], xp: 20 },
  { name: 'Get milk',               hint: 'Use the bucket on a cow. It keeps 10 minutes', reqs: [_req(ITEM.MILK_BUCKET)], xp: 20 },
  { name: 'Leather and cloth',      hint: 'Leather comes off cows, cloth is woven from fiber',
    reqs: [_req(ITEM.LEATHER, 10), _req(ITEM.CLOTH, 10)], xp: 30 },
  { name: 'Build a mortar',         hint: '20 granite, a bone, 2 flint and a fiber block', reqs: [_req(B.MORTAR)], xp: 30 },
  { name: 'Wheat and flour',        hint: 'Grind 3 wheat into each flour in the mortar', reqs: [_req(ITEM.WHEAT, 5), _req(ITEM.FLOUR, 3)], xp: 25 },
  { name: 'Bake a pumpkin pie',     hint: 'Craft the pie, then bake it in the furnace',
    reqs: [_req([ITEM.PUMPKIN_PIE, ITEM.COOKED_PUMPKIN_PIE])], xp: 30 },
  { name: 'Get a backpack',         hint: 'Leather and cloth, at the bench. Worn on the back', reqs: [_req(ITEM.BACKPACK)], xp: 40 },
  { name: 'Golden apple and saddle', hint: 'Gold for the apple, leather for the saddle',
    reqs: [_req(ITEM.GOLDEN_APPLE), _req(ITEM.SADDLE)], xp: 60 },
  { name: 'Craft a bronze pickaxe', hint: 'Copper and tin powder smelt into bronze', reqs: [_req(ITEM.BRONZE_PICKAXE)], xp: 50 },
  { name: 'Every gem',              hint: 'Gem clusters grow in caves. You need a bronze pickaxe',
    reqs: [ITEM.DIAMOND, ITEM.EMERALD, ITEM.RUBY, ITEM.SAPPHIRE, ITEM.TOPAZ].map(id => _req(id)), xp: 100 },
];

var questEl = document.getElementById('quest');   // one per split-screen pane (36-splitscreen.js)
const QUEST_CHECK_S = 0.25;

// how many of these ids the current player carries, gear included
function _questCount(req) {
  const want = req.items ? new Set(req.items) : null;
  const hit = want ? (id) => want.has(id) : req.test;
  let n = 0;
  const add = (s) => { if (s && hit(s.id)) n += s.count || 1; };
  for (const s of HOTBAR) add(s);
  for (const s of invSlots) add(s);
  const packN = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
  for (let i = 0; i < packN; i++) add(invSlots2[i]);
  if (typeof equipSlots !== 'undefined') for (const s of equipSlots) add(s);
  return n;
}
const questIndex = () => (player.questIdx | 0);

/* Per frame, per seat (the main loop, beside the other HUD syncs): every QUEST_CHECK_S it checks the
   current quest, pays and advances when it is done, and redraws the box when what it shows changed. */
function updateQuests(dt) {
  if (!questEl) return;
  const on = !player.canFly && !player.dead && player.spawned && typeof playing !== 'undefined' && playing
             && !menuScene && questIndex() < QUESTS.length;
  if (!on) { if (questEl._key !== '') { questEl.style.display = 'none'; questEl._key = ''; } return; }
  player._questT = (player._questT || 0) - dt;
  if (player._questT > 0 && questEl._key) return;
  player._questT = QUEST_CHECK_S;
  const q = QUESTS[questIndex()];
  // progress is summed over the requirements, each capped at its own need (0.799)
  const need = q.reqs.reduce((n, r) => n + r.need, 0);
  const have = q.reqs.reduce((n, r) => n + Math.min(r.need, _questCount(r)), 0);
  if (have >= need) {
    player.questIdx = questIndex() + 1;
    if (typeof addXP === 'function') addXP(q.xp);
    // a gold row like a level-up, and the feed's own chime cooldown keeps it to one ring (0.7992)
    if (typeof feedQuest === 'function') feedQuest(q.name, q.xp);
    questEl._key = null;                               // draw the next one straight away
    player._questT = 0;
    return;
  }
  const key = questIndex() + ':' + have;
  if (questEl._key === key) return;
  questEl._key = key;
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  questEl.innerHTML =
    `<div class="qHead">Quest ${questIndex() + 1}/${QUESTS.length} <span class="qXp">+${q.xp} XP</span></div>` +
    `<div class="qName">${esc(q.name)} <b>${have}/${need}</b></div>` +
    `<div class="qHint">${esc(q.hint)}</div>`;
  questEl.style.display = 'block';
}

// saved in each player's record beside the skills (16-worlds.js for player one, 36-splitscreen.js for the rest)
const serializeQuests = (p) => (p && p.questIdx) | 0;
const restoreQuests = (v) => Math.max(0, Math.min(QUESTS.length, (+v) | 0));
