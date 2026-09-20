'use strict';
/* voxiGrof — furnace: per-block smelting state, tick, and GUI panel

   State lives in FURNACES ("x,y,z" -> record), persisted inside the world save.
   slots: [0]=fuel, [1]=input, [2]=output, [3]=ashes (0.775).
   0.775: every smelt carries its own time and XP (SMELT_RECIPES). Fuel is counted in FUEL POINTS, one
   point burning FUEL_POINT_SEC seconds (a coal chunk is one point); a fuel item is lit only when a smelt
   can start, but once lit it burns down to zero regardless. XP is not paid when an item finishes: the
   furnace banks it and pays whoever takes the output. Every ASH_FUEL points of fuel that burn away leave
   one ash in slot 3, worth ASH_XP when taken. The block's front face swaps to the burning texture
   (variant V.FURNACE_ON) and the fire crackles on a loop for as long as fuel is burning. */

const FURNACES = new Map();                 // "x,y,z" -> {slots, burn, burnMax, progress, lit, ash, xp, ashy}
var activeFurnace = null;                   // key of the furnace whose GUI is open (null = none)

/* The smelting book (0.775). time: seconds per item, xp: per item, banked until the output is taken.
   Raw ore takes 9 s, ground powder 7 s, and the rest 4-15 s a piece. cat is the book tab. */
const SMELT_RECIPES = [
  { in: ITEM.RAW_IRON,      out: ITEM.IRON_INGOT,    time: 9, xp: 5, cat: 'metals' },
  { in: ITEM.RAW_COPPER,    out: ITEM.COPPER_INGOT,  time: 9, xp: 4, cat: 'metals' },
  { in: ITEM.RAW_TIN,       out: ITEM.TIN_INGOT,     time: 9, xp: 4, cat: 'metals' },
  { in: ITEM.RAW_GOLD,      out: ITEM.GOLD_INGOT,    time: 9, xp: 6, cat: 'metals' },
  // ground ore smelts one to one (0.773): a mortar doubles the ingots, so each one pays less
  { in: ITEM.IRON_POWDER,   out: ITEM.IRON_INGOT,    time: 7, xp: 3, cat: 'metals' },
  { in: ITEM.COPPER_POWDER, out: ITEM.COPPER_INGOT,  time: 7, xp: 2, cat: 'metals' },
  { in: ITEM.TIN_POWDER,    out: ITEM.TIN_INGOT,     time: 7, xp: 2, cat: 'metals' },
  { in: ITEM.GOLD_POWDER,   out: ITEM.GOLD_INGOT,    time: 7, xp: 4, cat: 'metals' },
  { in: ITEM.BRONZE_POWDER, out: ITEM.BRONZE_INGOT,  time: 8, xp: 8, cat: 'metals' },   // 0.774
  { in: B.SAND,             out: B.GLASS,            time: 5, xp: 1, cat: 'blocks' },
  { in: B.COBBLE,           out: B.STONE,            time: 5, xp: 1, cat: 'blocks' },
  { in: B.LOG,              out: ITEM.CHARCOAL,      time: 4, xp: 2, cat: 'materials' },
  { in: B.BIRCH_LOG,        out: ITEM.CHARCOAL,      time: 4, xp: 2, cat: 'materials' },
  { in: B.SPRUCE_LOG,       out: ITEM.CHARCOAL,      time: 4, xp: 2, cat: 'materials' },
  { in: ITEM.CLAY_BALL,     out: ITEM.BRICK,         time: 5, xp: 1, cat: 'materials' },
  // cured hide (0.7444): the second leather source, beside cows — gives zombie drops a use
  { in: ITEM.ROTTEN_FLESH,  out: ITEM.LEATHER,       time: 7, xp: 1, cat: 'materials' },
  { in: ITEM.FLOUR,         out: ITEM.BREAD,         time: 7, xp: 4, cat: 'food' },
  { in: ITEM.MUTTON,        out: ITEM.COOKED_MUTTON, time: 9, xp: 6, cat: 'food' },
  { in: ITEM.BEEF,          out: ITEM.COOKED_BEEF,   time: 9, xp: 6, cat: 'food' },
  { in: ITEM.PORK,          out: ITEM.COOKED_PORK,   time: 7, xp: 3, cat: 'food' },        // 0.789
  { in: ITEM.PUMPKIN_PIE,   out: ITEM.COOKED_PUMPKIN_PIE, time: 15, xp: 10, cat: 'food' },   // bake the raw pie (0.761)
];
const SMELT = {};                                              // input id -> recipe
for (const r of SMELT_RECIPES) SMELT[r.in] = r;

const FUEL_POINT_SEC = 5;                                      // one fuel point = 5 s of fire = one coal chunk (0.775)
const FUEL_SMELTS = {                                          // fuel id -> fuel points
  // 0.7691: coal burns 5 and splits into 5 chunks of 1; charcoal still burns 4, so its 5 chunks are 0.8 each
  [ITEM.COAL]: 5, [ITEM.COAL_CHUNK]: 1, [ITEM.CHARCOAL]: 4, [ITEM.CHARCOAL_CHUNK]: 0.8, [B.PLANKS]: 0.75, [ITEM.STICK]: 0.25,
  // a storage block burns as the ten it was made from (0.768)
  [B.COAL_BLOCK]: 50, [B.CHARCOAL_BLOCK]: 40,
  // the first-tier tools are knapped stone and fiber since 0.7341, so they no longer burn
  [B.OAK_SAPLING]: 0.5,[B.BIRCH_SAPLING]: 0.5,[B.SPRUCE_SAPLING]: 0.5, [ITEM.LAVA_BUCKET]: 99, [ITEM.BARK]: 0.75,
  [ITEM.FAT]: 1.5,                                             // rendered pig fat (0.789): better than a plank, worse than charcoal
};
const ASH_SLOT = 3;
const ASH_FUEL = 8;                                            // fuel points burnt per ash: two charcoal (0.775)
const ASH_XP = 1;                                              // per ash taken
const NO_ASH_FUEL = new Set([ITEM.LAVA_BUCKET]);               // lava burns clean

const furnaceKey = (x, y, z) => x + ',' + y + ',' + z;
const mkFurnace = () => ({ slots: [null, null, null, null], burn: 0, burnMax: 1, progress: 0, lit: false,
                           ash: 0, xp: 0, ashy: true });

function openFurnace(x, y, z) {
  const k = furnaceKey(x, y, z);
  if (!FURNACES.has(k)) FURNACES.set(k, mkFurnace());
  activeFurnace = k;
  toggleInventory(true);
}

// block was broken (or replaced): spill contents, forget state, close the GUI if it was open
function furnaceBroken(x, y, z) {
  const k = furnaceKey(x, y, z);
  const f = FURNACES.get(k);
  if (!f) return;
  FURNACES.delete(k);
  if (!player.canFly)
    for (const s of f.slots) if (s) for (let n = 0; n < s.count; n++) spawnDrop(s.id, x, y, z);
  if (activeFurnace === k) { activeFurnace = null; if (invOpen) toggleInventory(false); }
}

/* XP for taking n items out of furnace slot i, called BEFORE they leave the slot (0.775). The output
   pays its share of what the furnace banked (all of it when the whole stack goes); ashes pay per ash. */
function furnaceTakeXP(i, n) {
  const f = activeFurnace && FURNACES.get(activeFurnace);
  if (!f || !(n > 0)) return;
  if (i === ASH_SLOT) { addXP(n * ASH_XP); return; }
  if (i !== 2 || !f.xp) return;
  const count = f.slots[2] ? f.slots[2].count : 0;
  const give = n >= count ? f.xp : Math.floor(f.xp * n / count);
  f.xp -= give;
  addXP(give);
}

// burnt fuel fills the ash meter; a full meter drops one ash into its slot, or waits there while it is full
function _furnaceAsh(k, f, points) {
  f.ash = Math.min(ASH_FUEL, f.ash + points);
  if (f.ash < ASH_FUEL - 1e-6) return;
  const a = f.slots[ASH_SLOT];
  if (a && a.count >= stackSize(ITEM.ASHES)) return;
  if (a) a.count++; else f.slots[ASH_SLOT] = mkSlot(ITEM.ASHES, 1);
  f.ash = Math.max(0, f.ash - ASH_FUEL);
  _refreshFurnaceSlots(k);
}

function updateFurnaces(dt) {
  _crackleTick = performance.now();
  const burning = new Set();
  for (const [k, f] of FURNACES) {
    const p = k.split(','), x = +p[0], y = +p[1], z = +p[2];
    if ((getBlock(x, y, z) & 255) !== B.FURNACE) continue;   // chunk unloaded (0) — tick pauses
    const inn = f.slots[1], out = f.slots[2];
    const rec = inn ? SMELT[inn.id] : undefined;
    // output rule: result must fit — empty slot, or same id with room
    const canSmelt = !!rec && (!out || (out.id === rec.out && out.count < stackSize(rec.out)));
    // ignite only when a smelt can start — but once lit, fuel burns down to zero regardless
    if (f.burn <= 0 && canSmelt) {
      const fuel = f.slots[0];
      const n = fuel ? FUEL_SMELTS[fuel.id] : 0;
      if (n) {
        f.ashy = !NO_ASH_FUEL.has(fuel.id);
        fuel.count--;
        if (fuel.count <= 0) f.slots[0] = null;
        f.burn = f.burnMax = n * FUEL_POINT_SEC;
        _refreshFurnaceSlots(k);
      }
    }
    const lit = f.burn > 0;
    if (lit) {
      const used = Math.min(dt, f.burn);
      f.burn -= used;
      if (f.ashy) _furnaceAsh(k, f, used / FUEL_POINT_SEC);
    }
    if (lit && canSmelt) {
      f.progress += dt / rec.time;
      if (f.progress >= 1) {
        f.progress = 0;
        inn.count--;
        if (inn.count <= 0) f.slots[1] = null;
        if (out) out.count++; else f.slots[2] = mkSlot(rec.out, 1);
        f.xp += rec.xp;
        _refreshFurnaceSlots(k);
      }
    } else f.progress = 0;
    if (lit !== f.lit) {                                     // swap the front face + light on/off
      f.lit = lit;
      const facing = (getBlock(x, y, z) >> 8) & 3;           // keep the rotation bits
      setBlock(x, y, z, B.FURNACE | ((facing | (lit ? V.FURNACE_ON : 0)) << 8));
    }
    if (lit) { _furnaceCrackle(k, x, y, z); burning.add(k); }
  }
  _stopCrackles(burning);
  _updateFurnaceBars();
}

/* ---- the fire's crackle (0.775) ----
   One looping <audio> per burning furnace, its volume following the nearest player. It used to fire
   once on ignition; now it runs until the fuel is gone. A watchdog silences every loop when the tick
   stops coming (paused game, back to the menu), since nothing else would. */
const CRACKLE_RANGE = 16;
const _crackles = new Map();                // furnace key -> looping Audio
let _crackleTick = 0;
function _furnaceCrackle(k, x, y, z) {
  let vol = 0;
  if (_soundReady && !sfxMuted) {
    let d = Infinity;
    for (const pl of (typeof PLAYERS !== 'undefined' ? PLAYERS : [player])) {
      if (!pl.spawned && pl !== player) continue;
      d = Math.min(d, Math.hypot(x + 0.5 - pl.pos.x, y + 0.5 - pl.pos.y, z + 0.5 - pl.pos.z));
    }
    vol = Math.max(0, 1 - d / CRACKLE_RANGE) * 0.7 * SOUND_MASTER;
  }
  let a = _crackles.get(k);
  if (vol <= 0) { if (a && !a.paused) a.pause(); return; }
  if (!a) { a = new Audio(SOUND_FILES.furnaceOn); a.loop = true; _crackles.set(k, a); }
  a.volume = Math.min(1, vol);
  if (a.paused) a.play().catch(() => {});
}
function _stopCrackles(keep) {
  for (const [k, a] of _crackles)
    if (!keep || !keep.has(k)) { a.pause(); _crackles.delete(k); }
}
setInterval(() => { if (_crackles.size && performance.now() - _crackleTick > 300) _stopCrackles(null); }, 250);

/* ---- GUI ---- */
// layout:  [input] [progress→] [output]
//          [flame]             [ash meter]
//          [fuel]              [ashes]
// with the smelting book toggled by the button in the corner
function buildFurnacePanel() {
  const panel = invPanel('furnacePanel');
  if (!panel) return;
  const f = activeFurnace && FURNACES.get(activeFurnace);
  if (!f) { panel.style.display = 'none'; return; }
  panel.style.display = 'flex';
  const bar = (cls) =>
    `<div class="fbar ${cls}"><img class="fbase" src="textures/Gui/Interactables/Lit_progress.png" alt="">` +
    `<div class="ffill"><img src="textures/Gui/Interactables/Lit_progress.png" alt=""></div></div>`;
  panel.innerHTML =
    `<div class="ctitle">Furnace</div>` +
    `<button class="fbookBtn${furnBookOpen ? ' sel' : ''}" title="Smelting book">` +
      `<img src="textures/Items/Materials/book.png" alt=""></button>` +
    `<div id="furnGrid">` +
      `<div class="fcol">` +
        `<div class="slot" data-fi="1">${slotInner(f.slots[1])}</div>` +
        bar('ffuel') +
        `<div class="slot" data-fi="0">${slotInner(f.slots[0])}</div>` +
      `</div>` +
      bar('fprog rot') +
      `<div class="fcol fout">` +
        `<div class="slot" data-fi="2">${slotInner(f.slots[2])}</div>` +
        `<div class="fash" title="Ashes"><span><i></i></span></div>` +
        `<div class="slot" data-fi="3">${slotInner(f.slots[ASH_SLOT])}</div>` +
      `</div>` +
    `</div>` +
    (furnBookOpen ? _furnBookHtml() : '');
  panel.classList.toggle('bookOpen', furnBookOpen);         // squares the top corners where the book joins (0.7761)
  panel.querySelector('.fbookBtn').addEventListener('click', () => { furnBookOpen = !furnBookOpen; buildFurnacePanel(); });
  for (const tab of panel.querySelectorAll('#furnTabs .ctab'))
    tab.addEventListener('click', () => { furnBookCat = tab.dataset.cat; _furnBookScroll = 0; buildFurnacePanel(); });
  const list = panel.querySelector('.fbList');
  if (list) {
    /* the book floats above the panel (0.776) so the slots never move; shrink the list when the panel
       sits too close to the top of the screen for the full height */
    const room = panel.getBoundingClientRect().top - 12 - (panel.querySelector('.fbook').offsetHeight - list.offsetHeight) - 6;
    list.style.height = Math.max(120, Math.min(320, room)) + 'px';
    list.scrollTop = _furnBookScroll;
    list.addEventListener('scroll', () => { _furnBookScroll = list.scrollTop; });
  }
  _updateFurnaceBars();
}

/* ---- smelting book (0.775) ----
   Read-only rows in the crafting list's look: input, time and fuel, arrow, output, XP. Tabs pick a
   category; All shows every category under its own heading, fuel last. */
var furnBookOpen = false, furnBookCat = 'all', _furnBookScroll = 0;
const FURN_BOOK_CATS = [
  { key: 'all',       label: 'All',       icon: null },
  { key: 'metals',    label: 'Metals',    icon: ITEM.IRON_INGOT },
  { key: 'blocks',    label: 'Blocks',    icon: B.GLASS },
  { key: 'materials', label: 'Materials', icon: ITEM.CHARCOAL },
  { key: 'food',      label: 'Food',      icon: ITEM.BREAD },
  { key: 'fuel',      label: 'Fuel',      icon: ITEM.COAL },
];
function cycleFurnBookCategory(dir) {
  const i = FURN_BOOK_CATS.findIndex(c => c.key === furnBookCat);
  furnBookCat = FURN_BOOK_CATS[(i + dir + FURN_BOOK_CATS.length) % FURN_BOOK_CATS.length].key;
  _furnBookScroll = 0;
  buildFurnacePanel();
}
function _furnBookHtml() {
  const num = (v) => +v.toFixed(2);
  // icons only since 0.776 — the name is in the hover tooltip
  const item = (id, badge, out) =>
    `<span class="cing${out ? ' out' : ''}" data-name="${idName(id)}" data-id="${id}">` +
    `<img src="${renderBlockIcon(id)}" alt="">${badge ? `<b>${badge}</b>` : ''}</span>`;
  const time = (sec, sub) => `<span class="fbTime"><b>${_fmtCraftTime(sec)}</b><small>${sub}</small></span>`;
  const arrow = '<svg class="fbArrow" viewBox="0 0 16 10" width="16" height="10" aria-hidden="true">' +
    '<path d="M1 5h11M8.5 1.5 12.5 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const xp = (n) => `<span class="fbXp">${n ? `<img src="textures/Items/Useables/experience_bottle.png" alt="">${num(n)}` : ''}</span>`;
  const rows = (cat) => {
    let h = '';
    if (cat === 'fuel')
      for (const id in FUEL_SMELTS) {
        const pts = FUEL_SMELTS[id], ash = NO_ASH_FUEL.has(+id) ? 0 : pts / ASH_FUEL;
        h += `<div class="crow fbRow">${item(+id)}${time(pts * FUEL_POINT_SEC, `${num(pts)} fuel`)}${arrow}` +
             (ash ? item(ITEM.ASHES, num(ash), true) : '<span class="fbNone" title="no ash">—</span>') +
             xp(ash * ASH_XP) + '</div>';
      }
    else
      for (const r of SMELT_RECIPES) if (r.cat === cat)
        h += `<div class="crow fbRow">${item(r.in)}${time(r.time, `≈${num(r.time / FUEL_POINT_SEC)} fuel`)}${arrow}` +
             item(r.out, null, true) + xp(r.xp) + '</div>';
    return h;
  };
  let h = '<div class="fbook"><div id="furnTabs">';
  for (const c of FURN_BOOK_CATS)
    h += `<div class="ctab${c.key === furnBookCat ? ' sel' : ''}" data-cat="${c.key}" title="${c.label}">` +
         (c.icon != null ? `<img src="${renderBlockIcon(c.icon)}" alt="">` : '<span class="tlabel">All</span>') + '</div>';
  h += '</div><div class="fbList">';
  if (furnBookCat === 'all')
    for (const c of FURN_BOOK_CATS.slice(1)) h += `<div class="fbHead">${c.label}</div>` + rows(c.key);
  else h += rows(furnBookCat);
  return h + `</div><div class="fbHint">1 fuel = ${FUEL_POINT_SEC}s of fire, a coal chunk · every ${ASH_FUEL} fuel burnt leaves 1 ash</div></div>`;
}

// refresh only the furnace slots in place (does not disturb the drag ghost)
function _refreshFurnaceSlots(k) {
  if (!invOpen || activeFurnace !== k) return;
  const panel = invPanel('furnacePanel');
  const f = FURNACES.get(k);
  if (!panel || !f) return;
  for (const el of panel.querySelectorAll('.slot'))
    el.innerHTML = slotInner(f.slots[+el.dataset.fi]);
}

// per-frame: fuel bar drains top-to-bottom, progress bar (rotated 90°) fills left-to-right, ash meter fills
function _updateFurnaceBars() {
  if (!invOpen || !activeFurnace) return;
  const panel = invPanel('furnacePanel');
  const f = FURNACES.get(activeFurnace);
  if (!panel || !f || panel.style.display === 'none') return;
  const fuelFill = panel.querySelector('.ffuel .ffill');
  const progFill = panel.querySelector('.fprog .ffill');
  const ashFill = panel.querySelector('.fash i');
  if (fuelFill) fuelFill.style.height = Math.round((f.burn / f.burnMax) * 100) + '%';
  if (progFill) progFill.style.height = Math.round(f.progress * 100) + '%';
  if (ashFill) ashFill.style.width = Math.round((f.ash / ASH_FUEL) * 100) + '%';
}
