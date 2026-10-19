'use strict';
/* player/leveling.js: experience and levels. What each source is worth, the ledger of blocks a player placed (they
   pay nothing when broken), saving, the XP bar and its popups. */

/* voxiGrof — experience & levels (0.7)

   WHAT COUNTS
   -----------
   Experience comes from doing things to the WORLD, never from rearranging your own build.
   Breaking a naturally-generated block pays; breaking a block you placed yourself pays nothing,
   and placing one never pays at all. Without that rule a stack of dirt is an infinite XP loop:
   place, break, place, break. `playerPlaced` (below) is the ledger that makes the distinction.

   NO ORBS
   -------
   There is no floating orb entity. A gain applies to the total the instant it is earned, which
   also means there is nothing to lose on death: `playerXP` is untouched when you die, and the
   respawn keeps the level you had. Levels are a permanent record of what you have done, and are
   here to be spent on skill points later — nothing consumes them yet.

   THE CURVE
   ---------
   Each level costs 2.5 TIMES the last (three times before): 30, 75, 188, 469, ... Deliberately steep — a level
   is meant to be an achievement worth a skill point, not a thing you tick over every few minutes. The total is what is
   saved, so a world from before simply reads as the level its points make on this curve. */

var playerXP = 0;                  // total experience points earned this world, never spent
var playerLevel = 0;               // derived from playerXP; cached so the HUD needn't recompute
var playerXPInLevel = 0, playerXPNeeded = 30;  // progress within the current level

const XP_LEVEL_BASE = 30, XP_LEVEL_MUL = 2;   // 40 until 0.7992; x3 a level until 0.8443
const XP_LEVEL_MAX = 50;                      // the last level there is
// points needed to go from `lvl` to `lvl + 1`: 30, 75, 188, 469, ... (whole points)
function xpToNext(lvl) { return Math.round(XP_LEVEL_BASE * Math.pow(XP_LEVEL_MUL, lvl)); }
// recompute level + in-level progress from the running total
function _recalcLevel() {
  let lvl = 0, rest = playerXP;
  for (;;) {
    if (lvl >= XP_LEVEL_MAX) { rest = 0; break; }      // level 50 is the top
    const need = xpToNext(lvl);
    if (rest < need) break;
    rest -= need; lvl++;
  }
  const leveled = lvl > playerLevel;
  playerLevel = lvl;
  playerXPInLevel = rest;
  playerXPNeeded = xpToNext(lvl);
  return leveled;
}

/* The one entry point. Silently ignored in creative — a build mode has nothing to earn. why is what it was
   for, shown in the feed (feedXP, ui/feed.js); quests, feats and level-ups leave it out, having rows of their own. */
function addXP(n, why) {
  if (!(n > 0)) return;
  if (typeof player !== 'undefined' && player.canFly) return;
  // boss boost (entities/frozen-king.js): +20% a level on everything earned
  const gain = Math.round(n * (typeof bossXpMul === 'function' ? bossXpMul() : 1));
  if (why && gain > 0 && typeof feedXP === 'function') feedXP(gain, why);
  playerXP += gain;
  // the last few gains and what for, shown under the XP bar's tooltip (xpTipHTML)
  if (gain > 0) { _xpRecent.unshift({ n: gain, why: why || 'experience' }); if (_xpRecent.length > XP_RECENT_N) _xpRecent.length = XP_RECENT_N; }
  const leveled = _recalcLevel();
  xpBarDirty = true;
  _queueXPPop(gain);
  if (leveled) {
    if (typeof playSound === 'function') playSound('levelUp', { gain: 0.8 });
    if (typeof feedLevel === 'function') feedLevel(playerLevel);        // gold row in the feed
    if (typeof fxLevelUp === 'function') fxLevelUp(player);             // a golden spiral round you (0.8)
    _xpFlash = 0.7;
  }
}
// world load / reset
function setXP(total) {
  playerXP = Math.max(0, Math.floor(+total || 0));
  playerLevel = 0;
  _recalcLevel();
  xpBarDirty = true;
}
function resetXP() { setXP(0); }

/* ---- what each source is worth ----
   A plain block is a single point; anything that took a tool, a fight or a furnace pays more.
   Ores are far and away the best rate — they are the reason to go down, and the only source that
   makes the ×3 curve climbable at any speed. */
const XP_BLOCK_DEFAULT = 1;
const XP_FEED_FROM = 30;            // a block worth this much says so in the feed
const XP_BLOCK = {};
const XP_ORE_MUL = 3;              // 0.831
const XP_GEM_ORE = 250;            // diamond and every gem ore
{
  const set = (id, n) => { XP_BLOCK[id] = n; };
  const ore = (id, n) => set(id, n * XP_ORE_MUL);                          // every ore twice its old worth
  ore(B.COAL_ORE, 20); ore(B.IRON_ORE, 35); ore(B.COPPER_ORE, 30); ore(B.TIN_ORE, 40);
  ore(B.GOLD_ORE, 60);
  // diamond and the gems are one class since 0.832: 150 each (diamond 140, the gems 120 in 0.831)
  for (const id of [B.DIAMOND_ORE, B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, B.TOPAZ_ORE]) set(id, XP_GEM_ORE);
  set(B.SULFUR_BLOCK, 5); set(B.OBSIDIAN, 25); set(B.GLOWSTONE, 0);
  // lightning's glassy sand is rare to come across
  set(B.GLASSY_SAND, 20); set(B.GLASSY_RED_SAND, 20); set(B.GLASSY_PINK_SAND, 20);
  // scenery is free — you are not going to grind a level out of grass
  set(B.SHORT_GRASS, 0); set(B.TALLGRASS, 0); set(B.TALL_LOWER, 0); set(B.TALL_UPPER, 0);
  for (const id of woodBlocks('leaves')) set(id, 0);                   // every wood's leaves (the woods table, woods/woods.js)
  set(B.DRY_GRASS, 0); set(B.DRY_TALL_LOWER, 0); set(B.DRY_TALL_UPPER, 0); set(B.DRY_BUSH, 0);
  // a log that pays its own XP: a wood's `xp.log` in the woods table (rime 3, palm 2; the rest pay what any block pays)
  for (const w of woodList()) if (w.log != null && w.xp && w.xp.log != null) set(w.log, w.xp.log);
  set(B.STONE_BRICK, 0);
  /* Built things never grow in the wild, only in villages and by your hand (COBBLESTONE was misspelt and
     paid 1): cobblestone, planks, sandstone, adobe, terracotta and hay, every look of each. Breaking a village teaches
     nothing. */
  for (const fam of CORE.VARIANT_FAMILIES) if ([B.COBBLE, B.SANDSTONE, B.RED_SANDSTONE, B.PINK_SANDSTONE, B.ADOBE, B.BRICKS].includes(fam[0]))
    for (const id of fam) set(id, 0);
  for (const id of woodBlocks('planks')) set(id, 0);                   // every wood's planks
  // a little more for what is rare or hard to come by
  set(B.SULFUR_UP_TIP, 40); set(B.SULFUR_DOWN_TIP, 40); set(B.GLOW_VINE, 50); set(B.COBWEB, 30);
  set(B.SALT_CRUST, 20); set(B.CLAY, 30);                                // salt pays per layer too (22-main-loop.js)
  // hollow logs, the rarer the wood the more: each wood's `xp.hollow` (oak 6, birch 30, spruce 200, rime 300)
  for (const w of woodList()) if (w.hollow != null && w.xp && w.xp.hollow != null) set(w.hollow, w.xp.hollow);
  // furniture breaks by hand since 0.7442 (see HAND_BREAK_BLOCKS) — moving your own bed or
  // chest is housekeeping, so it pays nothing. Crafting them still pays: each recipe's xpToGive (player/crafting.js).
  set(B.CRAFTING_BENCH, 0); set(B.CHEST, 0); set(B.METAL_CHEST, 0);set(B.BED, 0); set(B.HAY, 0);
}
/* A kill: XP_KILL_MIN to XP_KILL_MAX by how much health the creature has at most (entMaxHp, entities/entities.js),
   from a cod's 20 to a horse's 150 — a zombie about 36, a villager 38 — plus XP_KILL_PER_LEVEL a level (1-50). Was
   a base by kind (animals 200, villagers 300, monsters 400) plus the level since 0.791. */
// ...a monster (a zombie, a skeleton: isNightMob) a flat XP_KILL_MONSTER plus the level
const XP_KILL_MIN = 20, XP_KILL_MAX = 50, XP_KILL_HP_LO = 20, XP_KILL_HP_HI = 75, XP_KILL_PER_LEVEL = 50, XP_KILL_MONSTER = 300;
function mobKillXP(ent) {
  if (!ent) return XP_KILL_MIN;
  if (typeof isNightMob === 'function' && isNightMob(ent)) return XP_KILL_MONSTER + XP_KILL_PER_LEVEL * Math.max(0, ent.level | 0);
  const hp = typeof entMaxHp === 'function' ? entMaxHp(ent) : XP_KILL_HP_LO;
  const f = Math.max(0, Math.min(1, (hp - XP_KILL_HP_LO) / (XP_KILL_HP_HI - XP_KILL_HP_LO)));
  return Math.round(XP_KILL_MIN + (XP_KILL_MAX - XP_KILL_MIN) * f) + XP_KILL_PER_LEVEL * Math.max(0, ent.level | 0);
}
const XP_HARVEST = 2;              // a bush pickup that actually yielded something
/* ...and since 0.8281 one more for every berry, wheat, melon or cantaloupe slice, flint and stone pebble it hands you
   (player/placing.js). A pumpkin is XP_PUMPKIN in all; a carved one or a jack o'lantern picked back up pays nothing, but
   carving a face pays XP_CARVE and putting the torch in XP_LANTERN. */
const XP_FORAGE_ITEM = 1, XP_PUMPKIN = 20, XP_CARVE = 100, XP_LANTERN = 3;
/* A mushroom pays by how big it is when picked: one more for every 0.2x of its size (shroomSizeAt,
   seasons/seasons.js), and XP_SHROOM_GROWN more when it is fully grown. Too small to pick, it pays nothing. */
const XP_SHROOM_STEP = 0.2, XP_SHROOM_GROWN = 50;
/* Weathering it: every XP_WEATHER_S out in the open through a storm, a sandstorm, hail, or a body Cold or
   Hot pays XP_WEATHER (tickStats, player/stats.js). */
const XP_WEATHER = 10, XP_WEATHER_S = 300;
/* taming an animal (XP_TAME + its level), shearing and milking, a repair (2 per tier of the tool, 2..10;
   dismantling pays nothing), a sapling you planted growing into a tree, each biome the first time you set foot in
   it, the top and the bottom of the world once each, and a night outside: more than half of it under the open sky
   and alive at dawn (a blood moon instead pays XP_BLOOD_MOON). */
const XP_TAME = 2500, XP_TAME_PER_LEVEL = 250;   // 10 and 1 a level until 0.831
const XP_SHEAR = 500, XP_MILK = 500, XP_REPAIR_PER_TIER = 2, XP_BIOME = 10, XP_WORLD_EDGE = 20;   // milk 500 since 0.8447 (5): it takes a 2 s hold now
/* A biome found: the more you have found already, the more the next one pays — XP_BIOME for the first, rising
   by the same factor each time to XP_BIOME_LAST for the last of BIOME_COUNT (biomes/biomes.js biomeAt names them: 9 kinds of
   water and shore, 18 of land). 10, 12, 15... about 100 half way, 1000 for the last. */
const XP_BIOME_LAST = 100000, BIOME_COUNT = 40;   // 10000 for the last since 0.8446 (1000): 10, 12, 14... about 316 half way   // 40 the Savanna   // 39 the Dryland   // 38 the Deep Red Desert   // 37 the Deep Desert and the Oasis   // 35 the Coldest Deep Snow Forest   // 500 in 0.8324; 28 with the Ice Spikes, 29 the Snowy Hills; 33 the plains' and forests' Hills; 34 the Coldest Deep Snow
const biomeXP = (found) => Math.round(XP_BIOME * Math.pow(XP_BIOME_LAST / XP_BIOME, Math.min(1, found / (BIOME_COUNT - 1))));
// sapling id -> XP when it grows: each wood's `xp.sapling` in the woods table (oak 30, birch 40, spruce 50, palm 100)
const XP_SAPLING = {};
for (const w of woodList()) if (w.sapling != null && w.xp && w.xp.sapling != null) XP_SAPLING[w.sapling] = w.xp.sapling;
// a night outside pays XP_NIGHT (10 since 0.8446, 5 before) times the days you have lived, the blood moon's the same way
const XP_NIGHT = 10, XP_BLOOD_MOON = 100, WORLD_TOP_Y = WORLD_TOP, WORLD_BOTTOM_Y = 2;   // the blood moon 100 a day lived since 0.8447 (30)
// XP for a player who may not be the seat running right now (a sapling they planted grew); paid on their next tick
function grantXP(p, n, why) {
  if (!p || !(n > 0)) return;
  if (typeof player !== 'undefined' && p === player) { addXP(n, why); return; }
  const owed = p._xpOwed || (p._xpOwed = {});
  owed[why || ''] = (owed[why || ''] || 0) + n;
}
function flushOwedXP() {
  const owed = player._xpOwed;
  if (!owed) return;
  player._xpOwed = null;
  for (const why in owed) addXP(owed[why], why || undefined);
}
// what a player has found once and for all: the biomes, the top and the bottom. Saved with the player.
// ...and the bosses beaten, by kind (entities/frozen-king.js): each one a level of boss boost
const restoreFeats = (r) => ({ biomes: new Set(r && Array.isArray(r.biomes) ? r.biomes.filter(b => typeof b === 'string') : []),
                               top: !!(r && r.top), bottom: !!(r && r.bottom),
                               bosses: new Set(r && Array.isArray(r.bosses) ? r.bosses.filter(b => typeof b === 'string') : []) });
const serializeFeats = (p) => p._feats ? { biomes: [...p._feats.biomes], top: p._feats.top, bottom: p._feats.bottom,
                                           bosses: [...(p._feats.bosses || [])] } : null;
// smelting XP lives on each furnace recipe since 0.775 (SMELT_RECIPES, blocks/furnace.js), paid on taking the output

/* Crafting XP moved out of here in 0.76: every recipe carries its own `xpToGive` next to its
   `timeToCraft` (player/crafting.js), so what a craft pays is written where the recipe is. */

/* Loot chests pay by TABLE, not by what happened to roll out of it — the reward is for finding
   and opening the thing. A table declares its own `xp: [min, max]` (supply crate = 4..10); one
   without the field falls back to this range. Paid once, on the first open, alongside the roll. */
const XP_LOOT_DEFAULT = [3, 8];
function awardLootXP(table, mul = 100) {   // mul: the chest's multiplier (lootXpMul in 34)
  const r = table && Array.isArray(table.xp) ? table.xp : XP_LOOT_DEFAULT;
  const lo = Math.max(0, r[0] | 0), hi = Math.max(lo, r[1] | 0);
  addXP((lo + Math.floor(Math.random() * (hi - lo + 1))) * mul, 'loot chest');
}

/* ---- the player-placed ledger ----
   Keys are "x,y,z". A cell goes in when the player places into it and comes out the moment that
   block is broken (or overwritten), so the set only ever holds standing player work. Falling
   sand/gravel and blocks pushed around by fluids are not tracked — the ledger is about intent,
   and those cases are too marginal to be worth an XP exploit. */
const playerPlaced = new Set();
let _placingByPlayer = false;      // set around a place action; setBlock reads it
const pkey = (x, y, z) => x + ',' + y + ',' + z;
// wrap a placement so every setBlock it performs is credited to the player
function withPlayerPlacement(fn) {
  const prev = _placingByPlayer;
  _placingByPlayer = true;
  try { return fn(); } finally { _placingByPlayer = prev; }
}
function notePlacedCell(x, y, z, newId) {
  if (newId === B.AIR) playerPlaced.delete(pkey(x, y, z));
  else if (_placingByPlayer) playerPlaced.add(pkey(x, y, z));
}
// true when this cell is the player's own work — and clears it, since it is being broken now
function takePlayerPlaced(x, y, z) {
  const k = pkey(x, y, z);
  if (!playerPlaced.has(k)) return false;
  playerPlaced.delete(k);
  return true;
}
/* Award for breaking a block. Player-placed cells pay nothing AND lose their mark, so the
   dirt-tower loop nets exactly zero however many times it is run. */
function awardBlockXP(x, y, z, id) {
  if (takePlayerPlaced(x, y, z)) return;
  const n = XP_BLOCK[id] != null ? XP_BLOCK[id] : XP_BLOCK_DEFAULT;
  // the feed names only a rare find: an ore, a gem, glassy sand, a glow vine — not every block of dirt
  addXP(n, n >= XP_FEED_FROM ? (PROPS[id]?.name || '').toLowerCase() : undefined);
}

function serializeXP() { return { xp: playerXP, placed: [...playerPlaced] }; }
function restoreXP(rec) {
  playerPlaced.clear();
  if (!rec) { resetXP(); return; }
  setXP(rec.xp);
  if (Array.isArray(rec.placed)) for (const k of rec.placed) playerPlaced.add(k);
}

/* ---- HUD bar ----
   Minecraft's placement (a strip above the hotbar, level number centred on it) but a plain
   smooth bar rather than the segmented notch sprite — a light-green fill on a dark track. */
var xpBarEl = document.getElementById('xpBar');
var xpFillEl = document.getElementById('xpFill');
var xpLevelEl = document.getElementById('xpLevel');
var xpPopsEl = document.getElementById('xpPops');
var xpBarDirty = true;
var _xpFlash = 0;                  // seconds of level-up glow left
var _xpRecent = [];                // the last XP_RECENT_N gains, newest first: { n, why } (per seat, 36-splitscreen.js)
const XP_RECENT_N = 3;
/* The XP bar's tooltip, shown when the cursor (the mouse or the pad's) is on the bar with the inventory open
   (getInfoElements, ui/inventory-cursor.js): the level, the XP into it and what the next takes, and the last gains. */
function xpTipHTML() {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let h = `<div class="tipName">Level ${playerLevel}</div>`
        + `<div class="tipDesc">${Math.floor(playerXPInLevel)} / ${playerXPNeeded} XP to level ${playerLevel + 1}</div>`
        + `<div class="tipDesc">${Math.floor(playerXP)} XP in all</div>`;
  if (_xpRecent.length) {
    h += `<div class="tipDesc" style="margin-top:4px;opacity:.8">Last earned:</div>`;
    for (const r of _xpRecent) h += `<div class="tipDesc">+${r.n} ${esc(r.why)}</div>`;
  }
  return h;
}

/* ---- gain popups ----
   A "+N" that drifts up off the RIGHT end of the bar and fades. Every gain gets its OWN number:
   two "+3"s in a row read as two picks, which is the honest thing to show — they are not summed
   into a "+6" that hides how it was earned.

   Separate numbers only work if they do not land on top of each other, so each new popup is
   dealt the next slot in a rotating ladder: a fixed vertical step per slot, alternating a few
   pixels left and right. Consecutive gains stagger up the ladder and stay individually legible
   even when they arrive in the same second. */
const XP_POP_SLOTS = 5;            // rungs before the ladder wraps
const XP_POP_STEP = 15;            // px of vertical separation per rung
var _popSlot = 0;
function _queueXPPop(n) {
  if (!xpPopsEl || n <= 0) return;
  const el = document.createElement('div');
  el.className = 'xpPop';
  el.textContent = '+' + n;
  el.style.setProperty('--dy0', (_popSlot * XP_POP_STEP) + 'px');
  el.style.setProperty('--dx', ((_popSlot % 2) ? 7 : -3) + 'px');
  _popSlot = (_popSlot + 1) % XP_POP_SLOTS;
  xpPopsEl.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function updateXPBar(dt) {
  if (!xpBarEl) return;
  const show = typeof currentInvMode !== 'undefined' && currentInvMode === 'survival'
               && typeof playing !== 'undefined' && playing && !menuScene;
  if (_xpFlash > 0) { _xpFlash = Math.max(0, _xpFlash - (dt || 0)); xpBarDirty = true; }
  if (xpBarEl._shown !== show) {
    xpBarEl.style.display = show ? 'block' : 'none';
    if (xpPopsEl) xpPopsEl.style.display = show ? 'block' : 'none';
    xpBarEl._shown = show;
  }
  if (!show || !xpBarDirty) return;
  xpBarDirty = false;
  const frac = playerXPNeeded > 0 ? Math.max(0, Math.min(1, playerXPInLevel / playerXPNeeded)) : 0;
  xpFillEl.style.width = (frac * 100).toFixed(2) + '%';
  xpLevelEl.textContent = playerLevel > 0 ? String(playerLevel) : '';
  xpBarEl.classList.toggle('flash', _xpFlash > 0);
}
