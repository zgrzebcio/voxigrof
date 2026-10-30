'use strict';
/* blocks/furnace.js: the furnace. SMELT_RECIPES, fuel, smelting over time (also while away), ash, its crackle. */

/* voxiGrof — furnace: per-block smelting state, tick, and GUI panel

   State lives in FURNACES ("x,y,z" -> record), persisted inside the world save.
   slots: [0]=fuel, [1]=input, [2]=output, [3]=ashes.
   every smelt carries its own time and XP (SMELT_RECIPES). Fuel is counted in FUEL POINTS, one
   point burning FUEL_POINT_SEC seconds (a coal chunk is one point); a fuel item is lit only when a smelt
   can start, but once lit it burns down to zero regardless. XP is not paid when an item finishes: the
   furnace banks it and pays whoever takes the output. Every ASH_FUEL points of fuel that burn away leave
   one ash in slot 3, worth ASH_XP when taken. The block's front face swaps to the burning texture
   (variant V.FURNACE_ON) and the fire crackles on a loop for as long as fuel is burning. */

const FURNACES = new Map();                 // "x,y,z" -> {slots, burn, burnMax, progress, lit, ash, xp, ashy}
var activeFurnace = null;                   // key of the furnace whose GUI is open (null = none)

/* The smelting book. time: seconds per item, xp: per item (x SMELT_XP_MUL, below), banked until the output is taken.
   Raw ore takes 9 s, ground powder 7 s, and the rest 4-15 s a piece. cat is the book tab. */
const SMELT_RECIPES = [
  { in: ITEM.RAW_IRON,      out: ITEM.IRON_INGOT,    time: 9, xp: 10, cat: 'metals' },
  { in: ITEM.RAW_COPPER,    out: ITEM.COPPER_INGOT,  time: 9, xp: 8, cat: 'metals' },
  { in: ITEM.RAW_TIN,       out: ITEM.TIN_INGOT,     time: 9, xp: 8, cat: 'metals' },
  { in: ITEM.RAW_GOLD,      out: ITEM.GOLD_INGOT,    time: 9, xp: 12, cat: 'metals' },
  // ground ore smelts one to one: a mortar doubles the ingots, so each one pays less
  { in: ITEM.IRON_POWDER,   out: ITEM.IRON_INGOT,    time: 7, xp: 4, cat: 'metals' },
  { in: ITEM.COPPER_POWDER, out: ITEM.COPPER_INGOT,  time: 7, xp: 3, cat: 'metals' },
  { in: ITEM.TIN_POWDER,    out: ITEM.TIN_INGOT,     time: 7, xp: 3, cat: 'metals' },
  { in: ITEM.GOLD_POWDER,   out: ITEM.GOLD_INGOT,    time: 7, xp: 5, cat: 'metals' },
  { in: ITEM.BRONZE_POWDER, out: ITEM.BRONZE_INGOT,  time: 8, xp: 15, cat: 'metals' },   // 0.774
  { in: B.SAND,             out: B.GLASS,            time: 5, xp: 2, cat: 'blocks' },
  { in: B.PINK_SAND,        out: B.GLASS,            time: 5, xp: 2, cat: 'blocks' },   // 0.822
  { in: B.COBBLE,           out: B.STONE,            time: 5, xp: 2, cat: 'blocks' },
  // every wood's log burns to charcoal, in its own time (`charcoalS` in the woods table, woods/woods.js; 4 s if none)
  ...woodList().filter(w => w.log != null).map(w => ({ in: w.log, out: ITEM.CHARCOAL, time: w.charcoalS || 4, xp: 2, cat: 'materials' })),
  { in: ITEM.CLAY_BALL,     out: ITEM.BRICK,         time: 5, xp: 2, cat: 'materials' },
  // cured hide: the second leather source, beside cows — gives zombie drops a use
  { in: ITEM.COMPRESSED_ROTTEN_FLESH,  out: ITEM.LEATHER,       time: 7, xp: 5, cat: 'materials' },
  { in: ITEM.FLOUR,         out: ITEM.BREAD,         time: 7, xp: 10, cat: 'food' },
  { in: ITEM.MUTTON,        out: ITEM.COOKED_MUTTON, time: 9, xp: 20, cat: 'food' },
  { in: ITEM.BEEF,          out: ITEM.COOKED_BEEF,   time: 9, xp: 20, cat: 'food' },
  { in: ITEM.PORK,          out: ITEM.COOKED_PORK,   time: 7, xp: 15, cat: 'food' },        // 0.789
  { in: ITEM.COD,           out: ITEM.COOKED_COD,     time: 5, xp: 10, cat: 'food' },       // fish, 0.805
  { in: ITEM.SALMON,        out: ITEM.COOKED_SALMON,  time: 5, xp: 10, cat: 'food' },
  { in: ITEM.PIKE,          out: ITEM.COOKED_PIKE,    time: 6, xp: 10, cat: 'food' },
  { in: ITEM.CATFISH,       out: ITEM.COOKED_CATFISH, time: 6, xp: 10, cat: 'food' },
  { in: ITEM.PUMPKIN_PIE,   out: ITEM.COOKED_PUMPKIN_PIE, time: 15, xp: 30, cat: 'food' },   // bake the raw pie
  // grilled mushrooms: every kind but the lava one
  { in: B.RED_MUSHROOM,        out: B.GRILLED_RED_MUSHROOM,    time: 4, xp: 5, cat: 'food' },
  { in: B.BROWN_MUSHROOM,      out: B.GRILLED_BROWN_MUSHROOM,  time: 4, xp: 5, cat: 'food' },
  { in: B.BLUE_MUSHROOM,       out: B.GRILLED_BLUE_MUSHROOM,   time: 4, xp: 5, cat: 'food' },
  { in: B.BLACK_MUSHROOM,      out: B.GRILLED_BLACK_MUSHROOM,  time: 4, xp: 5, cat: 'food' },
  { in: B.WHITE_TALL_MUSHROOM, out: B.GRILLED_WHITE_MUSHROOM,  time: 4, xp: 5, cat: 'food' },
  { in: B.YELLOW_MUSHROOM,     out: B.GRILLED_YELLOW_MUSHROOM, time: 4, xp: 5, cat: 'food' },
];
// smelting pays half as much again — but what paid 1 still pays 1 (it was 1.5)
const SMELT_XP_MUL = 2;
for (const r of SMELT_RECIPES) if (r.xp >= 2) r.xp *= SMELT_XP_MUL;
const SMELT = {};                                              // input id -> recipe
for (const r of SMELT_RECIPES) SMELT[r.in] = r;

const FUEL_POINT_SEC = 5;                                      // one fuel point = 5 s of fire = one coal chunk
const FUEL_SMELTS = {                                          // fuel id -> fuel points
  // coal burns 5 and splits into 5 chunks of 1; charcoal still burns 4, so its 5 chunks are 0.8 each
  [ITEM.COAL]: 5, [ITEM.COAL_CHUNK]: 1, [ITEM.CHARCOAL]: 4, [ITEM.CHARCOAL_CHUNK]: 0.8, [B.PLANKS]: 0.75, [ITEM.STICK]: 0.25,
  // a storage block burns as the ten it was made from
  [B.COAL_BLOCK]: 50, [B.CHARCOAL_BLOCK]: 40,
  // the first-tier tools are knapped stone and fiber since 0.7341, so they no longer burn
  [ITEM.LAVA_BUCKET]: 99, [ITEM.BARK]: 0.75,
  [ITEM.FAT]: 1.5,                                             // rendered pig fat: better than a plank, worse than charcoal
};
for (const id of woodBlocks('sapling')) FUEL_SMELTS[id] = 0.5;   // every wood's sapling (the woods table)
const ASH_SLOT = 3;
const ASH_FUEL = 8;                                            // fuel points burnt per ash: two charcoal
const ASH_XP = 1;                                              // per ash taken
const NO_ASH_FUEL = new Set([ITEM.LAVA_BUCKET]);               // lava burns clean

const furnaceKey = (x, y, z) => x + ',' + y + ',' + z;
/* inId: what the input held when the smelt last ran (updateFurnaces resets the smelt when it changes); spoilT: the world
   clock its food last spoiled to (44-spoil.js) */
const mkFurnace = () => ({ slots: [null, null, null, null], burn: 0, burnMax: 1, progress: 0, lit: false,
                           ash: 0, xp: 0, ashy: true, inId: null, spoilT: null });

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
    for (const s of f.slots) if (s) spawnDrop(s.id, x, y, z, null, undefined, null, null, 0, s.count);   // one stack a slot
  if (activeFurnace === k) { activeFurnace = null; if (invOpen) toggleInventory(false); }
}

/* XP for taking n items out of furnace slot i, called BEFORE they leave the slot. The output
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

const PROGRESS_COOL_SEC = 20;    // seconds an unfuelled smelt takes to slide back to nothing
/* Smelting runs on the world's clock: a night slept through (blocks/bed.js) hands its skipped seconds here, and
   every loaded furnace burns and smelts through them in one-second steps, quietly — no crackle, smoke or bar redraw. */
const FURNACE_CATCHUP_MAX = DAY_LEN;
function furnaceCatchUp(sec) {
  for (let t = Math.min(FURNACE_CATCHUP_MAX, sec); t > 0; t -= 1) updateFurnaces(Math.min(1, t), true);
}
function updateFurnaces(dt, quiet = false) {
  if (!quiet) _crackleTick = performance.now();
  const burning = new Set();
  for (const [k, f] of FURNACES) {
    const p = k.split(','), x = +p[0], y = +p[1], z = +p[2];
    if ((getBlock(x, y, z) & 255) !== B.FURNACE) continue;   // chunk unloaded (0) — tick pauses
    const inn = f.slots[1], out = f.slots[2];
    // the input taken out or swapped for something else: the smelt starts again from nothing (`inId`: what it was on)
    const inId = inn ? inn.id : null;
    if (inId !== f.inId) { f.progress = 0; f.inId = inId; }
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
    /* Its top is a chimney: with a block on it the fire has no draught — nothing smelts, but the
       fuel that is lit keeps burning away, and a new piece still catches when there is something to smelt. */
    // ...a chimney of walls on it carries the draught up, so it is the top of that which must be open
    const choked = typeof stationCovered === 'function' && stationCovered(x, y + CORE.chimneyHeight(getBlock, x, y, z), z);
    f.choked = choked;
    if (lit && canSmelt && !choked) {
      f.progress += dt / rec.time;
      if (f.progress >= 1) {
        f.progress = 0;
        inn.count--;
        if (inn.count <= 0) f.slots[1] = null;
        if (out) out.count++; else f.slots[2] = mkSlot(rec.out, 1);
        f.xp += rec.xp;
        _refreshFurnaceSlots(k);
      }
    } else if (f.progress > 0) {
      /* The smelt cools off instead of snapping back to zero: out of fuel, choked, or the output full, it slides
         back over PROGRESS_COOL_SEC — long enough to feed the fire another coal and carry on from close to where
         it was. (The input taken away resets it at once, above.) */
      f.progress = Math.max(0, f.progress - dt / PROGRESS_COOL_SEC);
    }
    if (lit !== f.lit) {                                     // swap the front face + light on/off
      f.lit = lit;
      const fv = getBlock(x, y, z), keep = ((fv >> 8) & 255) & ~V.FURNACE_ON;   // the rotation and the rock
      // ...and its high bits (what it took to place: NEED_PAID, blocks/variants.js)
      setBlock(x, y, z, ((fv & ~0xFFFF) | B.FURNACE | ((keep | (lit ? V.FURNACE_ON : 0)) << 8)) >>> 0);
    }
    if (quiet) continue;                                     // a night's catch-up: no sound, no smoke
    if (lit) { _furnaceCrackle(k, x, y, z); burning.add(k); }
    // smoke from the top, a flicker at the mouth (0.8, 49-particles.js)
    if (lit && !choked && typeof fxFurnace === 'function') fxFurnace(f, x, y, z, (getBlock(x, y, z) >> 8) & 3, dt);
  }
  if (quiet) return;
  _stopCrackles(burning);
  _updateFurnaceBars();
}

/* ---- the fire's crackle ----
   One looping <audio> per burning furnace, its volume following the nearest player. It used to fire
   once on ignition; now it runs until the fuel is gone. A watchdog silences every loop when the tick
   stops coming (paused game, back to the menu), since nothing else would. */
const CRACKLE_RANGE = 16;
const _crackles = new Map();                // furnace key -> looping Audio
let _crackleTick = 0;
function _furnaceCrackle(k, x, y, z) {
  let vol = 0;
  if (_soundReady && sfxGain() > 0) {
    let d = Infinity;
    for (const pl of (typeof PLAYERS !== 'undefined' ? PLAYERS : [player])) {
      if (!pl.spawned && pl !== player) continue;
      d = Math.min(d, Math.hypot(x + 0.5 - pl.pos.x, y + 0.5 - pl.pos.y, z + 0.5 - pl.pos.z));
    }
    vol = Math.max(0, 1 - d / CRACKLE_RANGE) * 0.7 * sfxGain();   // the sliders
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
