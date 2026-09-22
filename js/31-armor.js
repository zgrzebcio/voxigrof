'use strict';
/* voxiGrof — equipment: armor slots, the equipment panel, and the live player preview.

   Layout follows the design sketch: two columns of five slots flanking a player preview, with a
   stats readout underneath.
     left  column: helmet, necklace, chestplate, leggings, boots
     right column: back, belt, gloves, accessories, offhand
   Necklace and accessories are still placeholders, reserved so the layout and save format do not
   have to change when their items exist; every other slot has something that goes in it.

   Armor uses Minecraft-style points: 20 points = the full 10-icon bar above the hearts, and
   incoming damage is reduced proportionally (see armorDamageMultiplier). */

const EQUIP_SLOTS = [
  { key: 'helmet',      label: 'Helmet',      col: 'l', accepts: 'helmet'     },
  { key: 'necklace',    label: 'Necklace',    col: 'l', accepts: 'necklace'   },   // for now the hammer, which unlocks variants (0.794)
  { key: 'chestplate',  label: 'Chestplate',  col: 'l', accepts: 'chestplate' },
  { key: 'leggings',    label: 'Leggings',    col: 'l', accepts: 'leggings'   },
  { key: 'boots',       label: 'Boots',       col: 'l', accepts: 'boots'      },
  { key: 'back',        label: 'Back',        col: 'r', accepts: 'back'       },   // backpacks (0.75)
  { key: 'belt',        label: 'Belt',        col: 'r', accepts: 'belt'       },
  { key: 'gloves',      label: 'Gloves',      col: 'r', accepts: 'gloves'     },
  { key: 'accessories', label: 'Accessories', col: 'r', accepts: 'accessories' },  // "Others": the chisel (0.78)
  { key: 'offhand',     label: 'Offhand',     col: 'r', accepts: 'offhand'    },   // shields (0.745)
];
// blocks the OFFHAND slot takes besides shields (0.7451): carried, lit, and placed from there
const OFFHAND_BLOCKS = new Set([B.TORCH]);
const EQUIP_INDEX = {};
EQUIP_SLOTS.forEach((s, i) => { EQUIP_INDEX[s.key] = i; });

// live array, indexed to match EQUIP_SLOTS. Swapped out with the inventory on mode change.
var equipSlots = new Array(EQUIP_SLOTS.length).fill(null);

/* Belt: wearing one opens a row of quick-access slots above the equipment panel, sized by the
   belt's own `beltSlots`. They are reserved for utility gear (lantern, spyglass, map, compass,
   clock) — items tagged `beltItem: true`. None exist yet, so the row renders as placeholders. */
const BELT_MAX = 5;
var beltSlots = new Array(BELT_MAX).fill(null);
// how many belt slots are currently usable (0 = no belt worn)
function beltCapacity() {
  const s = equipSlots[EQUIP_INDEX.belt];
  const n = s && ITEM_PROPS[s.id]?.beltSlots;
  return Math.min(BELT_MAX, n || 0);
}
const beltAccepts = (i, id) =>
  i < beltCapacity() && id != null && id >= 256 && !!ITEM_PROPS[id]?.beltItem;

/* Called after any equipment change. Slots beyond the current capacity (belt removed, or
   swapped for a smaller one) spill back into the player's grids, dropping on the floor rather
   than vanishing if there is no room. */
function syncBeltCapacity() {
  const cap = beltCapacity();
  for (let i = cap; i < beltSlots.length; i++) {
    const s = beltSlots[i];
    if (!s) continue;
    beltSlots[i] = null;
    for (let n = 0; n < s.count; n++)
      if (!tryPickup(s.id, s.dur ?? null, 'unpacked', slotMeta(s)))
        spawnDrop(s.id, Math.floor(player.pos.x), Math.floor(player.pos.y + 0.5), Math.floor(player.pos.z),
                  undefined, undefined, s.dur ?? null, slotMeta(s));
  }
}

// does this item belong in that slot? placeholders accept nothing
function equipAccepts(slotIdx, id) {
  const want = EQUIP_SLOTS[slotIdx] && EQUIP_SLOTS[slotIdx].accepts;
  if (want === 'offhand' && id != null && OFFHAND_BLOCKS.has(id)) return true;   // a torch
  if (!want || id == null || id < 256) return false;
  // no necklace exists yet: the neck holds a hammer or chisel for the time being, which unlocks block variants (0.794)
  if (want === 'necklace') return typeof CHISEL_TOOLS !== 'undefined' && CHISEL_TOOLS.includes(id);
  return ITEM_PROPS[id]?.equip === want;
}

/* ---------------------------------- stats ---------------------------------- */
function playerArmorPoints() {
  let n = 0;
  for (const s of equipSlots) if (s && !slotBroken(s) && ITEM_PROPS[s.id]?.armor) n += ITEM_PROPS[s.id].armor;
  return Math.min(20, n);
}
/* The armor bar is MIXED (0.731). It used to pick ONE sprite set for the whole row — the
   highest-value piece won — so an iron chestplate over leather trousers drew a row of solid iron.
   One icon is worth two points, and the two points inside it can come from DIFFERENT materials:
   that is exactly the case the left-half / right-half sprites exist for. So the bar is driven by
   a flat list of one entry PER POINT, in a fixed equipment order, rather than by a single
   "which material wins" answer.
   Capped at 20 to match playerArmorPoints, so the list and the total can never disagree. */
const ARMOR_BAR_ORDER = ['helmet', 'chestplate', 'leggings', 'boots', 'gloves'];
const _matName = (m) => m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Iron';
function playerArmorPointMats() {
  const out = [];
  for (const key of ARMOR_BAR_ORDER) {
    const s = equipSlots[EQUIP_INDEX[key]];
    const p = s && !slotBroken(s) && ITEM_PROPS[s.id];
    if (!p || !p.armor) continue;
    const mat = _matName(p.armorMat);
    for (let i = 0; i < p.armor && out.length < 20; i++) out.push(mat);
  }
  return out;
}
// cheap change-detector for the HUD: repaint the bar when the MIX changes, not just the total
const armorBarSignature = () => playerArmorPointMats().join(',');
// Minecraft's rule: each point cuts 4% of incoming damage, capped at 80%.
/* The share of a hit that gets through. Armor soaks 4% a point up to 80%; Thick Skin (0.791) adds
   10% on top of whatever the armor gives, so the most anything can soak is 90%. */
function armorDamageMultiplier() {
  const skin = (typeof hasSkill === 'function' && hasSkill('thickSkin')) ? 0.1 : 0;
  return 1 - Math.min(0.9, Math.min(0.8, playerArmorPoints() * 0.04) + skin);
}
/* Armour wear follows the blow (0.756): every worn piece loses three quarters of the damage taken,
   rounded, and never less than 2. It used to lose a flat 1 however hard the hit, so a set lasted ages. */
const armorWearFor = (hit) => Math.max(2, Math.round(hit * 0.75));
// durability charged to every worn piece on a damaging hit
function damageArmorDurability(hit = 1) {
  let changed = false;
  for (let i = 0; i < equipSlots.length; i++) {
    const s = equipSlots[i];
    if (!s || s.dur == null) continue;
    // a shield wears only when it actually STOPS something (40-shield.js) — never from a hit
    // it did not take, and certainly not from a fall
    if (ITEM_PROPS[s.id]?.shield) continue;
    if (s.dur <= 0) continue;                     // broken and kept (Mender): nothing left to wear
    if (wearSlot(s, armorWearFor(hit)) === 'gone') equipSlots[i] = null;
    changed = true;
  }
  if (changed) { saveEquip(); if (invOpen) buildEquipPanel(); }
}
/* Worn-gear stat totals. Every modifier is additive across pieces, so a full iron set (helmet,
   chest, legs, boots, gloves) stacks five -2.5% penalties into -12.5% move speed. */
function _equipSum(field) {
  let n = 0;
  for (const s of equipSlots) {
    const v = s && !slotBroken(s) && ITEM_PROPS[s.id]?.[field];
    if (typeof v === 'number') n += v;
  }
  return n;
}
// flat bonus damage added on top of the held weapon (iron gloves = +0.75)
function playerStrength() { return _equipSum('strength'); }

/* ---------------------------------- set bonuses (0.731) ----------------------------------
   Wear all FOUR body pieces of one material and the set does something the pieces alone do not.
   Gloves are deliberately excluded from the test: they are the cheap fifth piece, and letting
   them gate the bonus would mean the bonus vanished the moment a pair broke.

   A bonus is permanent while the set is on — it is not a timer — so it reports `time: Infinity`
   and the panel prints an infinity sign instead of a countdown. Taking a piece off, or wearing
   one out, drops the set and the effect with it, because nothing is stored: it is recomputed from
   what is equipped every time it is asked for. */
const ARMOR_SET_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
const ARMOR_SET_BONUS = {
  // toughness is knockback resistance in percent, 100% = never knocked back (0.7612)
  iron:    { name: 'Toughness', toughness: 0.20, good: true,
             desc: 'Full set: +20% toughness' },
  /* Leather does NOT slow you down — it blunts the slowdown the GROUND inflicts. Wading through
     leaf litter and deep snow costs 30% less than it does barefoot, which is what soft boots are
     actually for. It is a multiplier on the penalty, not on your speed. */
  leather: { name: 'Slowness resistance',  terrainDrag: 0.30, good: true,
             desc: 'Full set: leaf and snow slowdown 30% weaker' },
};
// the material every body piece shares, or null if the set is incomplete or mismatched
function playerArmorSet() {
  let mat = null;
  for (const key of ARMOR_SET_SLOTS) {
    const s = equipSlots[EQUIP_INDEX[key]];
    const m = s && !slotBroken(s) && ITEM_PROPS[s.id]?.armorMat;
    if (!m) return null;
    if (mat === null) mat = m;
    else if (m !== mat) return null;
  }
  return mat;
}
const armorSetBonus = () => ARMOR_SET_BONUS[playerArmorSet()] || null;
// 0..1 fraction of incoming knockback cancelled (iron set = 0.20)
/* Toughness (0.7612): knockback resistance as a stat. 0% by default, 100% means you are never knocked
   back. Gear adds a `toughness` field (0.10 = +10%); the iron set bonus adds 20%. */
function playerToughness() {
  const b = armorSetBonus();
  return _equipSum('toughness') + (b && b.toughness ? b.toughness : 0);
}
// 0..1 fraction of knockback cancelled — the mobs and arrows read this
function playerKnockbackResist() { return Math.min(1, Math.max(0, playerToughness())); }
// 0..1 fraction of the terrain slowdown cancelled (leather set = 0.30)
function playerTerrainDragResist() {
  const b = armorSetBonus();
  return b && b.terrainDrag ? Math.min(1, b.terrainDrag) : 0;
}
/* Everything currently affecting the player, permanent set bonuses first. PLAYER_EFFECTS is still
   the home for genuine TIMED effects; nothing produces one yet. */
function activeEffects() {
  const out = [];
  const b = armorSetBonus();
  if (b) out.push({ name: b.name, time: Infinity, good: b.good, desc: b.desc });
  for (const e of PLAYER_EFFECTS) out.push(e);
  for (const e of player.effects || []) {
    const d = EFFECT_DEFS[e.id];
    if (d) out.push({ name: d.name, time: Math.ceil(e.left), good: d.good, desc: d.desc });
  }
  return out;
}
/* Timed effects (0.758). They live on the player, so every split-screen seat has its own list; `left` is
   seconds remaining. A food with `foodEffect` starts one, and eating another restarts the clock rather
   than stacking a second copy. */
const EFFECT_DEFS = {
  // `icon`: what the effect bar beside the hotbar shows for it (0.797) — an emoji until each has a sprite
  rapidRegen:   { name: 'Rapid regen',   time: 20, good: true, regenMul: 2, icon: '💖',              // golden apple; 8s until 0.7992
                  desc: 'Health regenerates twice as fast, and food heals twice as much.' },
  // cooked pumpkin pie (0.761): +20% crafting speed and +5% move speed
  spicyPumpkin: { name: 'Spicy pumpkin', time: 10, good: true, craftSpeed: 0.20, moveSpeed: 0.05, icon: '🌶️',
                  desc: 'Crafting speed +20% and move speed +5%.' },
  // raw food, rotten flesh (0.761): hunger drains twice as fast and the view sways (22-main-loop.js)
  nausea:       { name: 'Nausea',        time: 10, good: false, hungerMul: 2, sway: true, icon: '🤢',
                  desc: 'Hunger drains twice as fast, and your view sways and drifts.' },
  /* yellow berries (0.7947): half a health point a second, 5 over the whole of it. A slow drip, so armor
     does not soak it (that needs half a point in one frame, 19-vitals.js), and it stops at 1: poison
     alone never kills you. */
  poison:       { name: 'Poison',        time: 10, good: false, poisonDps: 0.5, announce: 'You feel poisoned', icon: '☠️',
                  desc: 'You slowly lose health while it lasts. It cannot take your last half heart.' },
};
// sum of one numeric field over this player's running effects (0.761)
const _effectSum = (field) => (player.effects || []).reduce((n, e) => n + (EFFECT_DEFS[e.id]?.[field] || 0), 0);
const playerHasEffect = (field) => (player.effects || []).some(e => EFFECT_DEFS[e.id]?.[field]);
// multiplier on hunger and saturation drain: 2 while nauseous
const playerHungerMul = () => (player.effects || []).reduce((m, e) => m * (EFFECT_DEFS[e.id]?.hungerMul || 1), 1)
  * ((typeof hasSkill === 'function' && hasSkill('slowBurner')) ? 0.95 : 1);   // Slow Burner (0.79)
// how fast your breath runs out under water: 5% slower with Slow Burner (0.7911)
const playerAirMul = () => ((typeof hasSkill === 'function' && hasSkill('slowBurner')) ? 0.95 : 1);
function addPlayerEffect(id) {
  const d = EFFECT_DEFS[id];
  if (!d) return;
  const list = player.effects || (player.effects = []);
  const t = d.time * ((typeof hasSkill === 'function' && hasSkill('lingering')) ? 1.25 : 1);   // Lingering (0.79)
  const e = list.find(x => x.id === id);
  if (e) e.left = t; else list.push({ id, left: t });
  if (d.announce && typeof feedWarn === 'function') feedWarn(d.announce);   // a bad one says so as it lands (0.7947)
  if (invOpen) buildEquipPanel();
}
// counts down; the equipment panel is rebuilt only when a shown second changes or an effect ends
function tickPlayerEffects(dt) {
  const list = player.effects;
  if (!list || !list.length) return;
  let changed = false;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i], shown = Math.ceil(e.left);
    e.left -= dt;
    if (e.left <= 0) { list.splice(i, 1); changed = true; }
    else if (Math.ceil(e.left) !== shown) changed = true;
  }
  /* Poison (0.7947) drips health away, never below 1. Since 0.7992 it also LOOKS like damage: the drip
     is gathered up and, every time half a point has gone, the screen flashes red as any other hit does —
     anything else that hurts over time gets the same for free. */
  const dps = _effectSum('poisonDps');
  if (dps > 0 && !player.dead && player.hp > 1) {
    const before = player.hp;
    player.hp = Math.max(1, player.hp - dps * dt);
    player._effDmgAcc = (player._effDmgAcc || 0) + (before - player.hp);
    if (player._effDmgAcc >= 0.5) {
      if (typeof hurtFlash === 'function') hurtFlash(player._effDmgAcc);
      if (typeof playSound === 'function') playSound('hit', { gain: 0.3 });
      player._effDmgAcc = 0;
    }
    if (typeof vitalsDirty !== 'undefined') vitalsDirty = true;
  }
  if (changed && invOpen) buildEquipPanel();
}
/* THE EFFECT BAR (0.797): every running timed effect as a half-size slot right of the hotbar — its icon and
   the seconds left, green-edged when good, red when bad. Per frame, per seat, from the main loop beside the
   chisel slot; it lives INSIDE #hotbar so split screen carries it along, and buildHotbar clearing it is
   fine, this puts it back. Redrawn only when a shown second (or the list) changes. */
function syncEffectBar() {
  if (typeof hotbarEl === 'undefined' || !hotbarEl) return;
  const list = (!player.canFly && !player.dead && player.effects) || [];
  let bar = hotbarEl.querySelector(':scope > .effBar');
  if (!list.length) { if (bar) bar.remove(); return; }
  const chisel = !!hotbarEl.querySelector(':scope > .chiselSlot');   // it sits after the chisel's slot, if that is out
  const t = (s) => s >= 60 ? Math.ceil(s / 60) + 'm' : Math.ceil(s) + 's';
  const key = (chisel ? 'c|' : '|') + list.map(e => e.id + ':' + t(e.left)).join(',');
  if (bar && bar._key === key) return;
  if (!bar) { bar = document.createElement('div'); bar.className = 'effBar'; hotbarEl.appendChild(bar); }
  bar._key = key;
  bar.classList.toggle('afterChisel', chisel);
  bar.innerHTML = list.map(e => {
    const d = EFFECT_DEFS[e.id];
    if (!d) return '';
    return `<div class="effSlot${d.good === false ? ' bad' : ' good'}" title="${d.name}">` +
           `<i>${d.icon || '✨'}</i><b>${t(e.left)}</b></div>`;
  }).join('');
}
// multiplier on health regen, and on the instant heal of a food eaten while the effect runs
const playerRegenMul = () => (player.effects || []).reduce((m, e) => m * (EFFECT_DEFS[e.id]?.regenMul || 1), 1);

// multiplier on walking speed; floored so gear can never freeze the player
const playerMoveSpeedMul = () => {
  const b = armorSetBonus();
  return Math.max(0.25, 1 + _equipSum('moveSpeed') + (b && b.moveSpeed ? b.moveSpeed : 0)
                          + (typeof _effectSum === 'function' ? _effectSum('moveSpeed') : 0));   // food effects (0.761)
};
function playerMoveSpeedPct() { return Math.round(playerMoveSpeedMul() * 100); }
/* Jump strength (0.756): a multiplier on jump HEIGHT. No gear grants it yet, but it has its own stat line
   and the jump already reads it, so an item only needs a `jumpStrength` field (0.10 = +10%). */
const playerJumpMul = () => Math.max(0.25, 1 + _equipSum('jumpStrength'));
function playerJumpPct() { return Math.round(playerJumpMul() * 100); }
/* Crafting speed (0.76): 1 = 100%, the rate every recipe's timeToCraft is written for; 2 crafts twice as
   fast; 0 means you cannot craft at all. Gear adds a `craftSpeed` field (0.25 = +25%). Never negative. */
const playerCraftSpeedMul = () => Math.max(0, 1 + _equipSum('craftSpeed') + _effectSum('craftSpeed')
  + ((typeof hasSkill === 'function' && hasSkill('nimble')) ? 0.1 : 0));   // Nimble Fingers (0.79)   // + food effects (0.761)
function playerCraftSpeedPct() { return Math.round(playerCraftSpeedMul() * 100); }
// multiplier on swing rate — >1 swings faster, so it DIVIDES the cooldown
const playerAtkSpeedMul = () => Math.max(0.25, 1 + _equipSum('atkSpeed'));
/* Environmental resistances (0.7295). No item grants either yet and nothing reads them for damage
   — they are stat lines the panel reserves, so the gear that will carry them has somewhere to
   show up. Summed as a fraction (0.15 = 15% resisted) and clamped to 100%. */
// gear plus Weathered's 10% (0.79): the one total both the stat panel and anything that reads it use
const _resSum = (field) => _equipSum(field) + ((typeof hasSkill === 'function' && hasSkill('weathered')) ? 0.1 : 0);
const _resPct = (field) => Math.round(Math.min(1, Math.max(-1, _resSum(field))) * 100);
function playerColdResist() { return _resPct('coldResist'); }
function playerHeatResist() { return _resPct('heatResist'); }
// active timed effects — nothing produces them yet, but the panel already lists them
const PLAYER_EFFECTS = [];

/* ---------------------------------- persistence ---------------------------------- */
// creative gets its own throwaway set so survival gear is never touched
var survEquip = new Array(EQUIP_SLOTS.length).fill(null);
var survBelt  = new Array(BELT_MAX).fill(null);
function saveEquip() {
  if (currentInvMode === 'survival') { survEquip = equipSlots; survBelt = beltSlots; }
}
function loadEquipForMode(mode) {
  equipSlots = mode === 'survival' ? survEquip : new Array(EQUIP_SLOTS.length).fill(null);
  beltSlots  = mode === 'survival' ? survBelt  : new Array(BELT_MAX).fill(null);
}
const _packSlots = (arr) => arr.map(s => s ? [s.id, s.count, s.dur ?? null, s.fresh ?? null, s.wm ? 1 : 0] : null);
/* Accepts BOTH shapes a save can hold (0.7521). Worn gear only ever came back from packed
   [id, count, dur] arrays — but the per-profile record, which is what every world with a profile
   actually restores from, was written with the live slot objects, so every load threw all of it
   away. And the id had to be an ITEM, so a torch in the offhand (a block) was dropped even from a
   correctly packed save. Saves already written with raw objects get their gear back. */
function _unpackSlots(list, len) {
  const out = new Array(len).fill(null);
  if (Array.isArray(list))
    for (let i = 0; i < len && i < list.length; i++) {
      const s = list[i];
      if (!s) continue;
      const arr = Array.isArray(s);
      const id = arr ? s[0] : s.id, n = arr ? s[1] : s.count, dur = arr ? s[2] : s.dur;
      const fresh = arr ? s[3] : s.fresh, wm = arr ? s[4] : s.wm;   // 0.79
      if (typeof id !== 'number' || id <= 0 || !(id >= 256 ? ITEM_PROPS[id] : PROPS[id])) continue;
      const slot = mkSlot(id, Math.min(stackSize(id), Math.max(1, n | 0)));
      if (dur != null) slot.dur = dur;
      if (fresh != null && slot.fresh != null) slot.fresh = Math.max(0, Math.min(slot.fresh, +fresh || 0));
      if (wm && slot.dur != null) slot.wm = 1;
      out[i] = slot;
    }
  return out;
}
/* The SURVIVAL set, not whatever is live: saving while the world sat in creative packed the empty
   creative array over the real gear. In survival the two are the same array anyway. */
function serializeEquip() { return _packSlots(survEquip); }
function serializeBelt()  { return _packSlots(survBelt); }

/* ---- equipment that fills itself (0.7521) ----
   A batch of torches tops up a part-used offhand stack before it goes anywhere else, whether it
   was crafted or picked up; a freshly CRAFTED piece of gear goes straight into its slot when that
   slot is empty. Gear picked up off the floor is not auto-worn — you may not want it on. */
function offhandRoom(id, dur) {
  if (typeof player === 'undefined' || player.canFly || dur != null || id == null) return 0;
  const s = equipSlots[EQUIP_INDEX.offhand];
  return s && s.id === id && s.dur == null ? Math.max(0, stackSize(id) - s.count) : 0;
}
function offhandTopUp(id, n, fresh = null) {
  const t = Math.min(n, offhandRoom(id, null));
  if (t <= 0) return 0;
  stackInto(equipSlots[EQUIP_INDEX.offhand], t, fresh);
  saveEquip();
  if (invOpen && typeof buildInventory === 'function') buildInventory();
  return t;
}
// the equipment slot an item or block belongs in, torches included, or -1 (0.7522)
function equipSlotFor(id) {
  if (id == null) return -1;
  // an item's own slot first, so the hammer still goes to Others and only reaches the neck when dragged (0.794)
  const own = id >= 256 ? EQUIP_SLOTS.findIndex(s => s.accepts === ITEM_PROPS[id]?.equip) : -1;
  if (own >= 0) return own;
  for (let k = 0; k < EQUIP_SLOTS.length; k++) if (equipAccepts(k, id)) return k;
  return -1;
}
// the empty slot a newly made piece drops straight into, or -1
function autoEquipSlot(id) {
  if (typeof player === 'undefined' || player.canFly || id == null || id < 256) return -1;
  const want = ITEM_PROPS[id]?.equip;
  if (!want) return -1;
  const i = EQUIP_SLOTS.findIndex(s => s.accepts === want);
  return i >= 0 && !equipSlots[i] ? i : -1;
}
function restoreEquip(list, beltList) {
  survEquip = _unpackSlots(list, EQUIP_SLOTS.length);
  survBelt  = _unpackSlots(beltList, BELT_MAX);
  if (currentInvMode === 'survival') { equipSlots = survEquip; beltSlots = survBelt; }
}

/* ---------------------------------- preview ---------------------------------- */
/* A small offscreen three.js render of the player wearing whatever is equipped. Armor is drawn
   as slightly-inflated copies of the body parts, textured from the 64x32 armor-layer sheets in
   textures/Entity/equipment (<mat>_tophalf = helmet + chestplate, <mat>_downhalf = leggings +
   boots). Materials without a sheet simply show no overlay. */
const PREVIEW_W = 150, PREVIEW_H = 266;   // matches #equipPreview in style.css (0.758)
let _pvRenderer = null, _pvScene = null, _pvCam = null, _pvModel = null, _pvArmor = null;
const _pvTexCache = {};

// the armor sheets are a 64x32 layout, so V divides by 32 rather than the 64 a skin uses
function _armorUV(geo, w, h, d, u, v) {
  const uv = geo.attributes.uv;
  const put = (face, px, py, pw, ph) => {
    const u0 = px / 64, u1 = (px + pw) / 64;
    const v0 = 1 - (py + ph) / 32, v1 = 1 - py / 32;
    const o = face * 4;
    uv.setXY(o + 0, u0, v1); uv.setXY(o + 1, u1, v1);
    uv.setXY(o + 2, u0, v0); uv.setXY(o + 3, u1, v0);
  };
  put(0, u + d + w, v + d, d, h);
  put(1, u,         v + d, d, h);
  put(2, u + d,     v,     w, d);
  put(3, u + d + w, v,     w, d);
  put(4, u + d,     v + d, w, h);
  put(5, u + 2 * d + w, v + d, w, h);
  uv.needsUpdate = true;
}
function _armorTex(name) {
  if (_pvTexCache[name] !== undefined) return _pvTexCache[name];
  const img = IMAGES[name];
  if (!img) { _pvTexCache[name] = null; return null; }
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  _pvTexCache[name] = t;
  return t;
}
// one inflated overlay piece; `grow` pushes it just outside the skin so it never z-fights
function _armorPiece(tex, w, h, d, u, v, grow) {
  const geo = new THREE.BoxGeometry(w * PX + grow, h * PX + grow, d * PX + grow);
  _armorUV(geo, w, h, d, u, v);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.35,
  }));
}

function _pvInit() {
  if (_pvRenderer) return true;
  const host = invPanel('equipPreview');
  if (!host) return false;
  _pvRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  _pvRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  _pvRenderer.setSize(PREVIEW_W, PREVIEW_H);
  host.appendChild(_pvRenderer.domElement);
  _pvScene = new THREE.Scene();
  _pvCam = new THREE.PerspectiveCamera(30, PREVIEW_W / PREVIEW_H, 0.1, 20);
  _pvCam.position.set(0, 1.0, 4.2);
  _pvCam.lookAt(0, 0.95, 0);
  _pvModel = buildHumanoid();                       // same builder the world entities use
  // model's front is +Z and the camera sits at +Z looking back, so yaw 0 already faces us —
  // the extra PI turned its back to the camera
  _pvModel.root.rotation.y = 0;
  for (const m of _pvModel.mats) m.color.setScalar(1);
  _pvScene.add(_pvModel.root);
  _pvArmor = new THREE.Group();
  _pvModel.root.add(_pvArmor);
  return true;
}

// rebuild the overlay meshes from what is currently equipped
let _pvArmorKey = '';
function _pvSyncArmor() {
  const key = equipSlots.map(s => s ? s.id : 0).join(',');
  if (key === _pvArmorKey) return;
  _pvArmorKey = key;
  // detach old pieces (limb-parented ones live on the limb groups, not _pvArmor)
  for (const g of [_pvArmor, _pvModel.armR, _pvModel.armL, _pvModel.legR, _pvModel.legL])
    for (let i = g.children.length - 1; i >= 0; i--)
      if (g.children[i].userData.armor) { g.children[i].geometry.dispose(); g.remove(g.children[i]); }

  const matOf = (slot) => {
    const s = equipSlots[EQUIP_INDEX[slot]];
    return s ? ITEM_PROPS[s.id]?.armorMat : null;
  };
  const add = (parent, mesh, pos) => {
    mesh.userData.armor = true;
    mesh.position.set(pos[0], pos[1], pos[2]);
    parent.add(mesh);
  };
  const G1 = 0.030, G2 = 0.055;                     // helmet/legs sit closer than the torso layer

  // helmet — head box from the TOP sheet, head region (0,0)
  const helm = matOf('helmet');
  const helmTex = helm && _armorTex(helm + '_tophalf');
  if (helmTex) add(_pvArmor, _armorPiece(helmTex, 8, 8, 8, 0, 0, G2), [0, 28 * PX, 0]);

  // chestplate — torso (16,16) plus both arms (40,16), from the TOP sheet
  const chest = matOf('chestplate');
  const chestTex = chest && _armorTex(chest + '_tophalf');
  if (chestTex) {
    add(_pvArmor, _armorPiece(chestTex, 8, 12, 4, 16, 16, G1), [0, 18 * PX, 0]);
    add(_pvModel.armR, _armorPiece(chestTex, 4, 12, 4, 40, 16, G1), [0, -6 * PX, 0]);
    add(_pvModel.armL, _armorPiece(chestTex, 4, 12, 4, 40, 16, G1), [0, -6 * PX, 0]);
  }
  // leggings — torso + legs from the DOWN sheet, hugged tight to the body
  const legs = matOf('leggings');
  const legsTex = legs && _armorTex(legs + '_downhalf');
  if (legsTex) {
    add(_pvArmor, _armorPiece(legsTex, 8, 12, 4, 16, 16, 0.012), [0, 18 * PX, 0]);
    add(_pvModel.legR, _armorPiece(legsTex, 4, 12, 4, 0, 16, 0.012), [0, -6 * PX, 0]);
    add(_pvModel.legL, _armorPiece(legsTex, 4, 12, 4, 0, 16, 0.012), [0, -6 * PX, 0]);
  }
  // boots — lower legs from the DOWN sheet
  const boots = matOf('boots');
  const bootsTex = boots && _armorTex(boots + '_downhalf');
  if (bootsTex) {
    add(_pvModel.legR, _armorPiece(bootsTex, 4, 12, 4, 0, 16, G2), [0, -6 * PX, 0]);
    add(_pvModel.legL, _armorPiece(bootsTex, 4, 12, 4, 0, 16, G2), [0, -6 * PX, 0]);
  }
  /* Gloves (0.731) — the pair had stats and a recipe but nothing to look at. There is no glove
     region on either sheet, so they borrow the BOTTOM five pixels of the chestplate's arm
     (40,16): on the armour layer that is the cuff, which is exactly what a gauntlet looks like.
     v is 16 + (12 - 5) so the sub-box samples the wrist end, and 4 + 5 = 9 keeps it inside the
     sheet's 32-pixel height. Grown to G2 so it sits outside a chestplate sleeve rather than
     fighting it for depth. */
  /* Backpack (0.75) — not an overlay at all but a box of its own, so it is built by
     41-backpack.js and simply dropped in here. Its node is positioned for the TORSO group, which
     sits 12 pixels up; _pvArmor hangs off the root instead, so that offset is added back. */
  const packSlot = equipSlots[EQUIP_INDEX.back];
  if (packSlot && typeof buildBackpackNode === 'function' && ITEM_PROPS[packSlot.id]?.packSlots) {
    const n = buildBackpackNode();
    add(_pvArmor, n, [n.position.x, n.position.y + 12 * PX, n.position.z]);
  }

  const gloves = matOf('gloves');
  const glovesTex = gloves && _armorTex(gloves + '_tophalf');
  if (glovesTex) {
    const cuffY = -(12 - 5 / 2) * PX;               // bottom of a 12-long arm that pivots at the top
    add(_pvModel.armR, _armorPiece(glovesTex, 4, 5, 4, 40, 23, G2), [0, cuffY, 0]);
    add(_pvModel.armL, _armorPiece(glovesTex, 4, 5, 4, 40, 23, G2), [0, cuffY, 0]);
  }
}

let _pvSpin = 0;
function updateEquipPreview(dt) {
  if (!invOpen || !_pvRenderer) return;
  /* One WebGL renderer, one canvas, and up to four inventories open at once (0.728) — so make
     sure the canvas is actually parented into THIS seat's preview box before drawing this seat's
     armour into it. The caller picks a single owner per frame, so this settles immediately rather
     than tugging the canvas back and forth. */
  const host = invPanel('equipPreview');
  if (!host) return;
  if (_pvRenderer.domElement.parentNode !== host) {
    host.appendChild(_pvRenderer.domElement);
    _pvArmorKey = '';                                // different player: force an overlay refresh
  }
  _pvSyncArmor();
  _pvSpin += dt * 0.5;
  _pvModel.root.rotation.y = Math.sin(_pvSpin) * 0.45;   // gentle turntable around front-on
  _pvRenderer.render(_pvScene, _pvCam);
}

/* ---------------------------------- panel ---------------------------------- */
const TOOL_SLOT_NAMES = ['Map', 'Spyglass', 'Compass', 'Lantern', 'Clock'];
/* Tooltips for the Stats and Effects lines (0.7611), shown by the inventory cursor — mouse or pad —
   through nearestElement in 20-inventory-ui.js. Keyed by the line's label as the panel prints it. */
const STAT_TIPS = {
  'defense':         'Protection from the armor you wear. Every point takes 4% off the damage you take, up to 80%.',
  'damage reduced':  'How much of each hit is stopped: 4% per armor point up to 80%, plus 10% from Thick Skin.',
  'move speed':      'How fast you walk. Heavy armor slows you down; some food effects speed you up.',
  'strength':        'Bonus damage added to every hit you land.',
  'attack speed':    'How quickly you can swing again. Above 100% the wait between swings is shorter.',
  'cold resistance': 'How much cold you shrug off. Nothing in the world is cold enough to hurt yet.',
  'heat resistance': 'How much heat you shrug off. Nothing in the world is hot enough to hurt yet.',
  'jump strength':   'How high you jump. Standing in snow lowers it.',
  'crafting speed':  'How fast your crafting runs. 200% crafts twice as fast; at 0% you cannot craft at all.',
  'toughness':       'How well you stand your ground. It takes that much off every knockback; at 100% nothing moves you.',
  'hunger depletion': 'How fast you get hungry. 200% means food and saturation drain twice as fast.',
  'oxygen depletion': 'How fast your breath runs out under water. 95% means it lasts a little longer.',
  'hazard reduction': 'How much less damage falls, lava and cactus do to you.',
};
const _tipTitle = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function statTipHTML(key) {
  const d = STAT_TIPS[key];
  return d ? `<div class="tipName">${_tipTitle(key)}</div><div class="tipDesc">${d}</div>` : '';
}
function effectTipHTML(i) {
  const e = activeEffects()[i];
  if (!e) return '';
  const cls = e.good === false ? ' bad' : '';
  const left = e.time === Infinity ? 'Lasts while the full set is worn' : `${e.time}s left`;
  return `<div class="tipName">${e.name}</div>` + (e.desc ? `<div class="tipSet${cls}">${e.desc}</div>` : '') +
         `<div class="tipDesc">${left}</div>`;
}
// marks every stat line the tooltips know, by its printed label
const _tagStatRows = (html) => html.replace(/<div class="stRow([^"]*)"><span>([^<]+)<\/span>/g,
  (m, cls, label) => (STAT_TIPS[label] ? `<div class="stRow${cls}" data-tip="${label}"><span>${label}</span>` : m));
// the word under an empty slot (0.758): whole words, shortened only where the full label cannot fit
const EQUIP_TAG = { helmet: 'Helmet', necklace: 'Neck', chestplate: 'Chest', leggings: 'Legs', boots: 'Boots',
                    back: 'Back', belt: 'Belt', gloves: 'Gloves', accessories: 'Others', offhand: 'Offhand' };
// size follows length (0.7592): 6 letters or fewer 10px, 7 letters 9px, 8 or more 8px
const _eqTag = (t) => `<span class="eqTag${t.length >= 8 ? ' l8' : t.length === 7 ? ' l7' : ''}">${t}</span>`;
function buildEquipPanel() {
  const panel = invPanel('equipPanel');
  if (!panel) return;
  // Creative has no gear: loadEquipForMode already hands it an empty throwaway array, so leaving
  // the panel hidden is enough to disable armor entirely — slotDescriptors only registers equip
  // and belt slots while the panel is visible, so there is nothing to drag into.
  /* The right-hand column belongs to whichever GUI is open (0.7522). buildInventory already skipped
     this panel for a furnace, chest or structure block, but its direct callers did not: armour
     wearing down from a hit, a shield blocking, a torch placed from the offhand. So taking a blow
     with a chest open popped the equipment panel up over the chest. */
  // ...and since 0.795 a tab can put it back over them: it shows exactly when the Equipment tab is the one up
  if (player.canFly || invRightTab() !== 'equip') { panel.style.display = 'none'; return; }
  panel.style.display = 'flex';
  const cell = (s, i) => {
    const item = equipSlots[i];
    const ph = s.accepts ? '' : ' ph';
    return `<div class="slot eq${ph}" data-eq="${i}" data-name="${s.label}">${slotInner(item)}` +
           (item ? '' : _eqTag(EQUIP_TAG[s.key] || s.label)) + '</div>';
  };
  let left = '', right = '';
  EQUIP_SLOTS.forEach((s, i) => { (s.col === 'l' ? (left += cell(s, i)) : (right += cell(s, i))); });
  /* Every stat reads to one decimal (0.7612): a percentage as "100.0%", a flat number as "0.0". A line is
     green when it is better than the default and orange when worse — for hunger depletion, lower is better. */
  const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const pct = (mul) => f1(mul * 100) + '%';
  const tone = (v, base, higherIsGood = true) => {
    const d = Math.round((v - base) * 1000);
    return !d ? '' : (d > 0) === higherIsGood ? ' good' : ' bad';
  };
  const row = (label, value, cls = '') => `<div class="stRow${cls}"><span>${label}</span><b>${value}</b></div>`;
  const pts = playerArmorPoints(), red = 1 - armorDamageMultiplier();
  const spd = playerMoveSpeedMul(), str = playerStrength(), atk = playerAtkSpeedMul();
  const cold = Math.min(1, Math.max(-1, _resSum('coldResist'))), heat = Math.min(1, Math.max(-1, _resSum('heatResist')));
  const jmp = playerJumpMul(), cft = playerCraftSpeedMul(), tough = playerToughness();
  const hunger = typeof playerHungerMul === 'function' ? playerHungerMul() : 1;
  const air = playerAirMul();
  const hazard = 1 - (typeof skillHazardMul === 'function' ? skillHazardMul() : 1);
  let stats =
    row('defense', f1(pts)) +
    row('damage reduced', pct(red)) +
    row('move speed', pct(spd), tone(spd, 1)) +
    row('strength', (str > 0 ? '+' : '') + f1(str), tone(str, 0)) +
    row('attack speed', pct(atk), tone(atk, 1)) +
    row('toughness', pct(tough), tone(tough, 0)) +
    row('cold resistance', pct(cold), tone(cold, 0)) +
    row('heat resistance', pct(heat), tone(heat, 0)) +
    row('jump strength', pct(jmp), tone(jmp, 1)) +
    row('crafting speed', pct(cft), tone(cft, 1)) +
    row('hunger depletion', pct(hunger), tone(hunger, 1, false)) +
    row('oxygen depletion', pct(air), tone(air, 1, false)) +                  // 0.7911
    row('hazard reduction', pct(hazard), tone(hazard, 0)) +                   // 0.7911
    '<div class="stRow slotFree"><span>&mdash;</span><b>&mdash;</b></div>';   // reserved for the next stat
  // the stats get the room; effects are a short strip under them (0.7612)
  stats = '<div class="stGrid">' + _tagStatRows(stats) + '</div>';   // hoverable, with a tooltip each (0.7611)
  const eff = activeEffects();
  stats += '<div class="ctitle stTitle">Effects</div><div class="effList">' + (eff.length
    ? eff.map((e, i) => {
        // a set bonus lasts as long as the set is worn, so it shows an infinity sign, not a clock
        const t = (e.time === Infinity) ? '&infin;' : e.time + 's';
        // data-eff: its index in activeEffects(), read back by the tooltip (0.7611)
        return `<div class="stRow eff${e.good === false ? ' bad' : ''}" data-eff="${i}"><span>${e.name}</span><b>${t}</b></div>`;
      }).join('')
    : '<div class="stRow none"><span>no active effects</span></div>') + '</div>';
  // belt row: only present while a belt is worn, sized by that belt's slot count
  const cap = beltCapacity();
  let beltRow = '';
  if (cap > 0) {
    let cells = '';
    for (let i = 0; i < cap; i++)
      cells += `<div class="slot belt" data-belt="${i}" data-name="Belt slot">${slotInner(beltSlots[i])}</div>`;
    beltRow = `<div id="beltRow">${cells}</div>`;
  }
  panel.innerHTML =                                  // no "Equipment" title since 0.796: its tab says so
    beltRow +
    '<div id="equipBody">' +
      `<div class="eqCol">${left}</div>` +
      '<div id="equipPreview"></div>' +
      `<div class="eqCol">${right}</div>` +
    '</div>' +
    // reserved tool slots (0.7576): placeholders only, not in equipSlots and not drag targets
    '<div id="toolRow">' + TOOL_SLOT_NAMES.map(n =>
      `<div class="slot tool" data-name="${n} (not in the game yet)">${_eqTag(n)}</div>`).join('') +
    '</div>' +
    '<div class="ctitle stTitle">Stats</div>' +
    `<div id="equipStats">${stats}</div>`;
  // the tabs on top (0.795): the open station if any, Equipment, and the Skill tree, which used to be a button here
  addInvTabs(panel, 'equip');
  if (_pvRenderer) {                                 // re-attach the existing canvas after rebuild
    invPanel('equipPreview').appendChild(_pvRenderer.domElement);
    _pvArmorKey = '';                                // force an overlay refresh
  } else _pvInit();
}
