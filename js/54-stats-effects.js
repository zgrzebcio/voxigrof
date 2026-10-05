'use strict';
/* voxiGrof — player stats and effects (0.82)

   Everything a player's numbers are, and how they rise and fall, lives here. The HUD that draws them, the
   outside hazards (falls, cactus, lava, fire), the armor soak and dying stay in 19-vitals.js; the equipment
   panel that lists the stat getters is 31-equipment.js.

   VITALS. Health, food, thirst, stamina, energy, fruit, vegetables, protein and oxygen all run 0..100.
   Health and food were out of 20 (ten hearts) until 0.82: VITAL_K is that step, and every hit and heal is
   written in the new scale. Food, thirst, energy, fruit, vegetables and protein each carry an OVER-STAT of up
   to MAX_OVER on top of the bar: a buffer that drains first, three times as fast — what food's saturation
   always was (food's keeps the name `saturation`, so saves and callers still read it).
     - Sprinting, jumping and climbing a wall use STAMINA, not food. It comes back while you rest (20% faster
       sneaking; not while mining, sprinting, in the air or climbing), and that is paid in food and thirst.
       Run it dry and you cannot sprint, jump or climb until it is back to STAMINA_BACK.
     - Health heals while food and thirst are both high enough, and costs both.
     - Thirst drops over time and hurts at 0 like hunger. Drink by looking at water with an empty hand and
       holding E (updateDrinking), or from juicy food (FOOD_NUTRITION).
     - Energy drops over time, faster when stamina is used or you get hurt; a night in bed fills it.
     - Fruit, vegetables and protein only drop over time and come from food, for now.
     - TEMPERATURE, in °C, follows the season, the hour, the biome, height, weather, shelter, water and heat
       around you (ambientTemp). Nothing reads it yet but the HUD.

   STAT GETTERS. Move speed, strength, jump, crafting and attack speed, toughness and the resistances, summed
   from gear, set bonuses, effects and skills, with the Stats panel's tooltips (STAT_TIPS).

   EFFECTS. Timed effects from food (EFFECT_DEFS), the effect bar beside the hotbar and their tooltips.
   (The stat getters and effects were in 31-armor.js until 0.82.) */

/* ======================================= vitals ======================================= */
const VITAL_K = 5;                                   // health and food were out of 20 until 0.82
const MAX_HP = 100, MAX_FOOD = 100, MAX_THIRST = 100, MAX_STAMINA = 200, MAX_ENERGY = 100,   // stamina and oxygen 200 (0.831)
      MAX_NUTRIENT = 100, MAX_AIR = 200;
const MAX_OVER = 50;                                 // every over-stat's ceiling
const MAX_SATURATION = MAX_OVER;                     // food's over-stat, under its old name
const OVER_DRAIN_MUL = 3;                            // an over-stat drains 3x as fast as its bar would
// the player field each bar keeps its over-stat in
const OVER_KEY = { food: 'saturation', thirst: 'thirstO', energy: 'energyO', fruit: 'fruitO', veg: 'vegO', protein: 'proteinO',
                   stamina: 'staminaO' };   // stamina's since 0.821
const VITAL_MAX = { hp: MAX_HP, food: MAX_FOOD, thirst: MAX_THIRST, stamina: MAX_STAMINA, energy: MAX_ENERGY,
                    fruit: MAX_NUTRIENT, veg: MAX_NUTRIENT, protein: MAX_NUTRIENT, air: MAX_AIR };
/* One player's health ceiling (0.79). Thick Skin raised it by 10% until 0.791, when it became damage
   reduction instead (armorDamageMultiplier); nothing raises it now, but everything that caps or refills
   health already asks here. */
// ...and Thick Skin's +10 since 0.828 (45-skills.js)
const THICK_SKIN_HP = 10;
const playerMaxHP = (p = player) => MAX_HP + ((typeof hasSkill === 'function' && hasSkill('thickSkin', p)) ? THICK_SKIN_HP : 0);

// food: a slow idle drain, and healing costs it (sprinting and jumping moved to stamina in 0.82)
// the drain times are from a full bar to empty; an over-stat on top lasts longer still (0.821)
const FOOD_IDLE_PER_S       = 1 / 24;       // 40 min from full standing still (50 in 0.82; 1/150 of 20 before)
const FOOD_REGEN_COST_PER_S = 1.25;         // while health is coming back
const REGEN_FOOD_MIN        = 30;           // health heals above this much food (60 in 0.82)...
const REGEN_FAST_FOOD       = 90;           // ...twice as fast above this...
const REGEN_THIRST_MIN      = 20;           // ...and only above this much thirst (0.82; 30 until 0.821)
const REGEN_HP_PER_S        = 2.5;          // the slow rate
// how long healing waits after a hit (0.7992), and the shorter wait while Rapid regen runs
const REGEN_HIT_WAIT = 5, REGEN_HIT_WAIT_FAST = 2;
// an empty food or thirst bar hurts in hits, big enough to flash and sound (0.7572)
const EMPTY_HIT = 5, EMPTY_HIT_EVERY_S = 4;
const HUNGRY_WARN = 40, THIRSTY_WARN = 40;  // the feed warns once as a bar drops under these (0.756)
// thirst: a little faster than food; healing costs some of it too
const THIRST_IDLE_PER_S       = 1 / 12;     // 20 min from full (30 in 0.82)
const THIRST_REGEN_COST_PER_S = 0.6;
// stamina
const STAMINA_SPRINT_PER_S = 7;             // a full bar sprints about 23 s (x1.25 of 200, 0.831; 14 s before)
const STAMINA_JUMP         = 4.25;          // a jump; 60% of it out of a sprint, which carries you (5 until 0.8291)
// swimming (0.8291), off the bottom: up (a jump in the water) a lot, swimming along a little, treading water a trickle
const STAMINA_SWIM_UP_PER_S = 10, STAMINA_SWIM_PER_S = 1.5, STAMINA_TREAD_PER_S = 0.5;
const STAMINA_CLIMB_PER_S  = 15;            // hands on a bare wall (12-player.js)
const STAMINA_REGEN_PER_S  = 12;
/* 0.831: the bar is 200, and everything that spends it spends a quarter more (sprint, jumps, climbing, swimming, a
   sandstorm). Mining costs a little too: about 1 point every 200 frames at 60 fps (MINING_STAMINA_PER_S). */
const STAMINA_USE_MUL = 1.25, MINING_STAMINA_PER_S = 0.3;
const STAMINA_REST_WAIT    = 3;             // seconds after the last use before it starts coming back (1 until 0.826)
const STAMINA_REST_WAIT_TIRED = 5;          // ...and when that use left you exhausted (0.826)
const STAMINA_SNEAK_MUL    = 1.2;           // sneaking gets it back 20% faster
const STAMINA_BACK         = 20;            // run dry, you are tired until it is back to this
const STAMINA_FOOD_COST = 0.03, STAMINA_THIRST_COST = 0.06;   // per point regained: a full bar (200 since 0.831) is 6 food, 12 thirst (thirst 0.04 until 0.829)
/* 0.829: regen speeds up the longer you rest and the more is missing. 0.8321: after RAMP_DELAY seconds of it, it
   ramps over the next STAMINA_RAMP_S to STAMINA_RAMP_MAX (+50%); oxygen over AIR_RAMP_S to AIR_RAMP_MAX (+100%).
   What is missing adds up to 40% more from empty, easing to none when full (it slowed to 60% near full until 0.8321).
   A stamina ramp only starts over when stamina is spent, not when you are merely off the ground a moment. */
const REGEN_RAMP_DELAY = 2;
const STAMINA_RAMP_S = 6, STAMINA_RAMP_MAX = 1.5;
const STAMINA_EMPTY_MUL = 1.4, STAMINA_FULL_MUL = 1;
const AIR_RAMP_S = 4, AIR_RAMP_MAX = 2;
const regenRamp = (t, span, max) => 1 + (max - 1) * Math.max(0, Math.min(1, (t - REGEN_RAMP_DELAY) / span));
// energy: 75 min from full (50 until 0.831), almost four days without sleep (DAY_LEN is 20 min); sleep fills it (0.821)
const ENERGY_IDLE_PER_S  = 1 / 45;
const ENERGY_PER_STAMINA = 0.025;           // per point of stamina used (0.04 until 0.831)
const ENERGY_PER_HP      = 0.07;            // per point of health lost (0.1 until 0.831)
/* TIRED (0.832): at TIRED_AT energy or less (20%) you are tired, the more so the emptier it gets (tiredness 0..1, from
   20 down to 0): regen up to TIRED_REGEN less (health, and energy from food), every bar's depletion up to
   TIRED_DEPLETION more, and you move up to TIRED_SLOW slower. A night in bed fills energy whatever the regen. */
const TIRED_AT = 20, TIRED_REGEN = 0.7, TIRED_DEPLETION = 0.4, TIRED_SLOW = 0.25;   // regen 0.9 until 0.8323
const tiredness = (p = player) => (!p || p.canFly || p.dead) ? 0
  : Math.max(0, Math.min(1, (TIRED_AT - (p.energy ?? MAX_ENERGY)) / TIRED_AT));
// fruit, vegetables, protein: 70 min from full (35 until 0.8323, 40 in 0.82)
const NUTRIENT_PER_S = 1 / 42;
/* SICKNESS (0.8323): protein or fruit at SICK_AT (20) or less makes you sick, the more so the emptier (0..1 from 20 down
   to 0). Each: regen up to 20% less, every bar's depletion up to 10% more, move speed up to 5% less, and at 0 a health
   every 5 s (SICK_HP_PER_S). Protein's also takes up to 30% attack speed and 10 strength; fruit's drains thirst up to
   30% faster and takes up to 30% crafting speed. Vegetables have one defined (sight and mining speed up to 25% less)
   but it is off (VEG_SICK_ON): there is too little vegetable food yet. */
const SICK_AT = 20, SICK_REGEN = 0.2, SICK_DEPLETION = 0.1, SICK_SLOW = 0.05, SICK_HP_PER_S = 0.2;
const SICK_PROTEIN_ATK = 0.3, SICK_PROTEIN_STR = 10, SICK_FRUIT_THIRST = 0.3, SICK_FRUIT_CRAFT = 0.3;
const VEG_SICK_ON = false, SICK_VEG_SIGHT = 0.25, SICK_VEG_MINING = 0.25;
const sickness = (key, p = player) => (!p || p.canFly || p.dead || (key === 'veg' && !VEG_SICK_ON)) ? 0
  : Math.max(0, Math.min(1, (SICK_AT - (p[key] ?? MAX_NUTRIENT)) / SICK_AT));
const _sickAll = (p = player) => sickness('protein', p) + sickness('fruit', p) + sickness('veg', p);
/* WET (0.8323; how it builds since 0.8324). Rain, falling snow or water first soak you from 0 to 100% (p._wetP: water
   in 5 s, rain at WET_RAIN_PCT a second by how hard it falls, snow half that); only then does staying in it add to how
   long you stay wet, up to WET_MAX seconds (WET_MIN at least). Out of it, that time runs down first (a second a second,
   faster near heat or with a warm body: _dryBoost), and then the % dries off at WET_DRY_PCT a second the same way.
   Everything wet does scales with the %: up to 5% less jump strength, 20% shorter effects, 50% less cold resistance.
   Kept in a save (vit.wet, vit.wp). */
const WET_MIN = 5, WET_MAX = 300, WET_WATER_PER_S = 10, WET_RAIN_PER_S = 3, WET_SNOW_PER_S = 1.5;
const WET_WATER_PCT = 0.2, WET_RAIN_PCT = 0.05, WET_SNOW_PCT = 0.025, WET_DRY_PCT = 0.02;   // per second, 0..1 (0.8324)
const WET_JUMP = 0.05, WET_EFFECT_TIME = 0.2, WET_COLD_RES = 0.5;
const playerWet = (p = player) => !!p && !p.canFly && (p._wetP || 0) > 0;
const wetness = (p = player) => (!p || p.canFly) ? 0 : Math.max(0, Math.min(1, p._wetP || 0));   // 0..1, scales the effects (0.8324)
// oxygen: 24 s of breath (0.831: a 200 bar spent a quarter faster than the old 100 in 15 s); drowning gets worse with each hit (0.7573)
const AIR_DRAIN_PER_S = 100 / 15 * 1.25, AIR_WARN = 40;
const DROWN_DMG_BASE = 10, DROWN_DMG_STEP = 5;
const AIR_REGEN_EMPTY = 30, AIR_REGEN_FULL = 6;   // points a second back when empty, easing to this near full

/* What each food gives besides food itself. 0.821 follows the folders its picture sits in
   (textures/Items/Consumables/<Fruits|Vege|Protein|Others>): fruit gives fruit, vegetables vegetables, meat and
   fish protein, and "Others" (bread, cantaloupe, rotten flesh) none of the three; juicy food gives thirst too.
   Merged into the item's (or, for a grilled mushroom, the block's) props, so tooltips read it as well. */
const FOOD_NUTRITION = {
  [ITEM.APPLE]:            { fruit: 25, thirst: 8 },
  [ITEM.GOLDEN_APPLE]:     { fruit: 30, thirst: 5, energy: 15 },   // energy 0.832
  [ITEM.MELON_SLICE]:      { fruit: 10, thirst: 15 },
  [ITEM.CANTALOUPE_SLICE]: { thirst: 12, fruit: 5, veg: 5 },    // a little of both (0.822)
  [ITEM.BERRIES]:          { fruit: 6, thirst: 5 },
  [ITEM.BLUE_BERRIES]:     { fruit: 6, thirst: 7.5 },          // 1.5x the thirst (0.827)
  [ITEM.BLACKBERRIES]:     { fruit: 6, thirst: 5 },
  [ITEM.YELLOW_BERRIES]:   { fruit: 6, thirst: 5 },            // 0.827
  [ITEM.WHITE_BERRIES]:    { fruit: 6, thirst: -5 },           // takes thirst (0.827)
  [ITEM.PUMPKIN_PIE]:      { veg: 20 },
  [ITEM.COOKED_PUMPKIN_PIE]: { veg: 35 },
  [ITEM.MUSHROOM_STEW]:    { veg: 30, thirst: 20 },              // four mushrooms since 0.821
  [ITEM.MILK_BUCKET]:      { thirst: 30 },                       // a container, not a food group (0.821)
  [ITEM.MUTTON]:  { protein: 10 }, [ITEM.COOKED_MUTTON]:  { protein: 25 },
  [ITEM.BEEF]:    { protein: 12 }, [ITEM.COOKED_BEEF]:    { protein: 35 },
  [ITEM.PORK]:    { protein: 12 }, [ITEM.COOKED_PORK]:    { protein: 30 },
  [ITEM.COD]:     { protein: 8 },  [ITEM.COOKED_COD]:     { protein: 20 },
  [ITEM.SALMON]:  { protein: 10 }, [ITEM.COOKED_SALMON]:  { protein: 22 },
  [ITEM.PIKE]:    { protein: 10 }, [ITEM.COOKED_PIKE]:    { protein: 22 },
  [ITEM.CATFISH]: { protein: 12 }, [ITEM.COOKED_CATFISH]: { protein: 25 },
};
// grilled mushrooms (0.821, blocks): vegetables, like the stew
for (const id of [B.GRILLED_RED_MUSHROOM, B.GRILLED_BROWN_MUSHROOM, B.GRILLED_BLUE_MUSHROOM, B.GRILLED_BLACK_MUSHROOM,
                  B.GRILLED_WHITE_MUSHROOM, B.GRILLED_YELLOW_MUSHROOM]) FOOD_NUTRITION[id] = { veg: 8 };
for (const id in FOOD_NUTRITION) {
  const p = id >= 256 ? ITEM_PROPS[id] : PROPS[id];
  if (p) Object.assign(p, FOOD_NUTRITION[id]);
}
// a food's props, an item's or a block's (the grilled mushrooms, 0.821); null for anything not eaten
const foodPropsOf = (id) => {
  if (id == null) return null;
  const p = id >= 256 ? ITEM_PROPS[id] : PROPS[id];
  return p && p.food > 0 ? p : null;
};
const NUTRITION_KEYS = ['thirst', 'fruit', 'veg', 'protein', 'energy'];   // energy 0.832 (the golden apple)

/* ---- bars and over-stats ---- */
// adds to a bar; whatever does not fit spills into its over-stat
function gainStat(p, key, amt) {
  if (!(amt > 0)) return;
  const max = VITAL_MAX[key], cur = p[key] ?? max, room = Math.max(0, max - cur);
  p[key] = Math.min(max, cur + amt);
  const ok = OVER_KEY[key];
  if (ok && amt > room) p[ok] = Math.min(MAX_OVER, (p[ok] || 0) + amt - room);
}
// takes from a bar, over-stat first at OVER_DRAIN_MUL times the cost
function drainStat(p, key, amt) {
  if (!(amt > 0)) return;
  const ok = OVER_KEY[key];
  if (ok && p[ok] > 0) {
    const cost = amt * OVER_DRAIN_MUL;
    if (p[ok] >= cost) { p[ok] -= cost; return; }
    amt -= p[ok] / OVER_DRAIN_MUL;
    p[ok] = 0;
  }
  p[key] = Math.max(0, (p[key] ?? 0) - amt);
}
/* Every bar full. `over` true (a new world, a respawn) also fills every over-stat (0.821; thirst's too since
   0.822); false leaves them empty (a switch from creative). */
function fillVitals(p, over = true) {
  p.hp = playerMaxHP(p); p.air = MAX_AIR; p._tired = false;
  for (const k in OVER_KEY) { p[k] = VITAL_MAX[k]; p[OVER_KEY[k]] = over ? MAX_OVER : 0; }
  p.temp = null;                                     // found again from where they stand
  p.heatstroke = 0; p._sandFelt = 0; p._hsStep = 0;  // 0.825
  p._night = null;                                   // a death starts the night's count over (0.8283)
  p._wetT = 0; p._wetP = 0;                         // dry again (0.8323; the % 0.8324)
}
// what a food does to the new bars (from updateEating, 22-main-loop.js)
function eatNutrition(p, f) {
  for (const k of NUTRITION_KEYS) {
    // energy from food is a regen: the regen stat scales it (0.832)
    const amt = k === 'energy' && f[k] > 0 ? f[k] * playerRegenMul() : f[k];
    if (amt > 0) gainStat(p, k, amt); else if (amt < 0) drainStat(p, k, -amt);   // white berries (0.827)
  }
}
/* What a white berry does (0.827): every BAD timed effect running (poison, nausea) loses `s` seconds; one that runs
   out goes. Not burning (0.8272; it did in 0.8271). */
function cleanseEffects(p, s) {
  if (!(s > 0)) return;
  const list = p.effects;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i--)
    if (EFFECT_DEFS[list[i].id]?.good === false && (list[i].left -= s) <= 0) list.splice(i, 1);
  if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
}
/* A night in bed (29-bed.js): energy filled, the rest spilling into over-energy, and a little health. 0.8321: the night
   costs a little of the other bars (SLEEP_COST, over-stats first), never taking one under SLEEP_FLOOR — and no longer
   tops food and thirst up to 30 for free. */
const SLEEP_COST = { food: 10, thirst: 15, fruit: 4, veg: 4, protein: 4 }, SLEEP_FLOOR = 10;   // fruit, veg, protein halved (0.8323)
function wakeRested(p) {
  for (const k in SLEEP_COST) {
    const over = p[OVER_KEY[k]] || 0, room = Math.max(0, (p[k] ?? VITAL_MAX[k]) - SLEEP_FLOOR) + over / OVER_DRAIN_MUL;
    drainStat(p, k, Math.min(SLEEP_COST[k], room));
  }
  if (p.hp > 0) p.hp = Math.min(playerMaxHP(p), p.hp + 4 * VITAL_K);
  gainStat(p, 'energy', MAX_ENERGY);
}
// a hit takes some energy with it (from the armor soak, 19-vitals.js)
function statsOnHit(p, lost) { drainStat(p, 'energy', lost * ENERGY_PER_HP); }
// out of stamina: no sprint, jump or wall climb until it is back to STAMINA_BACK (22-main-loop.js, 12-player.js)
const playerTired = (p = player) => !p.canFly && !!p._tired;

/* ---- saving ----
   hp, food and saturation stay where saves always had them; the rest ride in `vit`, whose presence also says
   the three are out of 100. A save from before 0.82 has none, and its three are multiplied up. */
function serializeVitals(p) {
  const r = { air: +(p.air ?? MAX_AIR).toFixed(1), stamina: +(p.stamina ?? MAX_STAMINA).toFixed(1), s2: 1 };   // s2: out of 200 (0.831)
  for (const k in OVER_KEY) if (k !== 'food') {
    r[k] = +(p[k] ?? VITAL_MAX[k]).toFixed(2);
    r[OVER_KEY[k]] = +(p[OVER_KEY[k]] || 0).toFixed(2);
  }
  if (p.heatstroke > 0) r.hs = +p.heatstroke.toFixed(1);   // 0.825
  if (p._giveUpCd > 0) r.gu = Math.ceil(p._giveUpCd);      // the pause menu's Respawn cooldown (0.829)
  if (p._wetT > 0) r.wet = Math.ceil(p._wetT);             // 0.8323
  if (p._wetP > 0) r.wp = +p._wetP.toFixed(3);             // how soaked, 0..1 (0.8324)
  const tb = typeof serializeHeldBurn === 'function' ? serializeHeldBurn(p) : null;
  if (tb) r.tb = tb;                                        // the held torches' time left (0.834)
  return r;
}
function restoreVitals(p, rec) {
  rec = rec || {};
  const v = rec.vit && typeof rec.vit === 'object' ? rec.vit : null, k = v ? 1 : VITAL_K;
  const num = (x) => typeof x === 'number' && isFinite(x);
  const food = rec.food ?? rec.hunger;
  p.hp = num(rec.hp) ? Math.min(MAX_HP + THICK_SKIN_HP, rec.hp * k) : MAX_HP;   // skills may load after this (0.828)
  p.food = num(food) ? Math.min(MAX_FOOD, food * k) : MAX_FOOD;
  p.saturation = num(rec.saturation) ? Math.min(MAX_SATURATION, rec.saturation * k) : MAX_SATURATION;
  const o = v || {};
  // stamina and oxygen are out of 200 since 0.831 (`s2` marks it): an older save's are doubled
  const s2 = o.s2 ? 1 : 2;
  p.air = num(o.air) ? Math.min(MAX_AIR, o.air * s2) : MAX_AIR;
  p.stamina = num(o.stamina) ? Math.min(MAX_STAMINA, o.stamina * s2) : MAX_STAMINA;
  p._tired = false;
  for (const key in OVER_KEY) if (key !== 'food') {
    p[key] = num(o[key]) ? Math.min(VITAL_MAX[key], o[key] * (key === 'stamina' ? s2 : 1)) : VITAL_MAX[key];
    p[OVER_KEY[key]] = num(o[OVER_KEY[key]]) ? Math.min(MAX_OVER, o[OVER_KEY[key]]) : 0;
  }
  p.temp = null;
  p.heatstroke = num(o.hs) ? Math.max(0, Math.min(99, o.hs)) : 0; p._sandFelt = 0; p._hsStep = 0;   // 0.825
  p._giveUpCd = num(o.gu) ? Math.max(0, Math.min(GIVE_UP_COOLDOWN_S, o.gu)) : 0; p._giveUp = false;   // 0.829
  p._wetT = num(o.wet) ? Math.max(0, Math.min(WET_MAX, o.wet)) : 0;                                   // 0.8323
  p._wetP = num(o.wp) ? Math.max(0, Math.min(1, o.wp)) : (p._wetT > 0 ? 1 : 0);                      // 0.8324
  if (typeof restoreHeldBurn === 'function') restoreHeldBurn(p, o.tb);                                // 0.834
}

/* ---- the tick ----
   Once a frame per seat, from updateVitals (19-vitals.js), survival only: effects, stamina, healing, the bars
   draining, empty-bar hits, oxygen and drowning, temperature. */
function _warnLow(p, key, flag, below, msg) {
  if (p[key] < below && !p[flag]) { p[flag] = true; if (typeof feedWarn === 'function') feedWarn(msg); }
  else if (p[key] >= below) p[flag] = false;
}
function _emptyHits(p, dt, key, clock, cause, msg) {
  if (p[key] > 0) { p[clock] = 0; return; }
  p[clock] = (p[clock] || 0) + dt;
  if (p[clock] < EMPTY_HIT_EVERY_S) return;
  p[clock] = 0;
  p.hp = Math.max(0, p.hp - EMPTY_HIT);
  p._dmgCause = cause;
  if (typeof feedCrit === 'function') feedCrit(msg);
}
function tickStats(dt) {
  const p = player;
  // timed effects count down first, so one that runs out this frame no longer counts (0.758)
  tickPlayerEffects(dt);
  _tickHeatstroke(dt); _tickSandstorm(dt);          // 0.825
  _tickWeatherXP(p, dt);                             // 0.8282
  _tickNightXP(p, dt); _tickFeats(p, dt);            // 0.8283
  const dep = playerDepletionMul();                  // every bar's drain (Slow Burner, 0.828)
  if (p._stamShowT > 0) p._stamShowT = Math.max(0, p._stamShowT - dt);
  if (p._giveUpCd > 0) p._giveUpCd = Math.max(0, p._giveUpCd - dt);   // pause-menu Respawn cooldown (0.829, 19)
  const hsm = heatstrokeMuls(p.heatstroke || 0);
  const grounded = onGround(), inWater = !!p._inWater;
  const moving = (p._movingH || 0) > 0.001;
  const sprinting = p.fast && moving && !p.flying && (grounded || inWater);
  const jumped = p.prevOnGround && !grounded && p.vy > 0.1 && !p.flying && !inWater;
  p.prevOnGround = grounded;
  let foodCost = FOOD_IDLE_PER_S * dt, thirstCost = THIRST_IDLE_PER_S * dt;

  /* stamina: spent on the move, back at rest */
  let used = 0;
  if (sprinting) used += STAMINA_SPRINT_PER_S * dt;
  if (jumped) used += STAMINA_JUMP * (p.fast ? 0.6 : 1);
  if (inWater && !grounded && !p.flying)              // swimming: no rest in deep water (0.8291)
    used += (p._swimUp ? STAMINA_SWIM_UP_PER_S : moving ? STAMINA_SWIM_PER_S : STAMINA_TREAD_PER_S) * dt;
  if (p._wallClimbing) used += STAMINA_CLIMB_PER_S * dt * (typeof skillClimbMul === 'function' ? skillClimbMul() : 1);   // Climber (0.828)
  // a sandstorm wears you out, standing or walking (0.825)
  if (p._sandFelt > 0.05) used += (moving ? SAND_STAMINA_MOVING_PER_S : SAND_STAMINA_PER_S) * p._sandFelt * dt;
  used *= STAMINA_USE_MUL;                         // a quarter more (0.831)
  if (typeof mining !== 'undefined' && mining.active) used += MINING_STAMINA_PER_S * dt;   // mining (0.831)
  if (p.stamina == null) p.stamina = MAX_STAMINA;
  used *= dep;                                     // stats depletion (0.828)
  if (used > 0) {
    p._stamShowT = 2;                              // the bar shows while it is used, over-stamina too (0.828)
    drainStat(p, 'stamina', used);                 // over-stamina first (0.821)
    if (p.stamina <= 0) p._tired = true;
    p._stamRestT = p._tired ? STAMINA_REST_WAIT_TIRED : STAMINA_REST_WAIT;   // longer once exhausted (0.826)
    p._stamRegenT = 0;                              // the rest ramp starts over (0.829)
    drainStat(p, 'energy', used * ENERGY_PER_STAMINA);
  } else {
    p._stamRestT = Math.max(0, (p._stamRestT || 0) - dt);
    const busy = (typeof mining !== 'undefined' && mining.active) || (!grounded && !inWater);
    if (p.stamina >= MAX_STAMINA) p._stamRegenT = 0;   // a hop or a step down only pauses the ramp (0.8321)
    if (!busy && p._stamRestT <= 0 && p.stamina < MAX_STAMINA) {
      const fed = p.food > 0 && p.thirst > 0;       // on an empty stomach or throat it still comes, at half
      p._stamRegenT = (p._stamRegenT || 0) + dt;    // rest ramp (0.829)
      const ramp = regenRamp(p._stamRegenT, STAMINA_RAMP_S, STAMINA_RAMP_MAX);   // after 2 s, +50% over 6 s (0.8321)
      const left = Math.max(0, Math.min(1, p.stamina / MAX_STAMINA));
      const need = STAMINA_EMPTY_MUL + (STAMINA_FULL_MUL - STAMINA_EMPTY_MUL) * left;
      const rate = STAMINA_REGEN_PER_S * ramp * need * (p.sneaking ? STAMINA_SNEAK_MUL : 1) * (fed ? 1 : 0.5) * hsm.stamina;   // heatstroke (0.825)
      const gain = Math.min(MAX_STAMINA - p.stamina, rate * dt);
      p.stamina += gain;
      if (fed) { foodCost += gain * STAMINA_FOOD_COST; thirstCost += gain * STAMINA_THIRST_COST; }
    }
  }
  if (p._tired && p.stamina >= STAMINA_BACK) p._tired = false;
  _tickExhausted(p, dt);                            // 0.82501

  /* Health: heals above REGEN_FOOD_MIN food (twice as fast above REGEN_FAST_FOOD) and REGEN_THIRST_MIN thirst,
     costing both; the regen stat scales it (0.832; Rapid regen doubled it). Not while poisoned (0.797), and not for a few seconds after ANY hit
     (0.7992) so a fight cannot be out-healed — five normally, two with Rapid regen running. */
  const poisoned = playerHasEffect('poisonDps');
  if (p._regenWaitT > 0) p._regenWaitT = Math.max(0, p._regenWaitT - dt);
  if (!poisoned && !(p._regenWaitT > 0) && p.hp < playerMaxHP() && p.food > REGEN_FOOD_MIN && p.thirst > REGEN_THIRST_MIN) {
    const rm = playerRegenMul();
    const rate = REGEN_HP_PER_S * (p.food > REGEN_FAST_FOOD ? 2 : 1) * rm;
    const before = p.hp;
    p.hp = Math.min(playerMaxHP(), p.hp + rate * dt);
    if (typeof fxHealTick === 'function') fxHealTick(p, p.hp - before);   // a green heart per 5 healed
    // the cost follows the regen (0.8323): a health healed costs the same, so slow healing no longer eats the bars
    foodCost += FOOD_REGEN_COST_PER_S * dt * rm;
    thirstCost += THIRST_REGEN_COST_PER_S * dt * rm;
  }

  /* the bars drain; nausea doubles food's (0.761); cold speeds food and protein, heat thirst and fruit (0.822; chilly,
     cold, warm, hot 0.823) */
  const st = tempStress(p), cold = stressIsCold(st) ? st.mul : 1, hot = st && !stressIsCold(st) ? st.mul : 1;
  const stSig = stateEffects(p).map(s => s.id).join(',');            // ...and sneaking, climbing (0.8243)
  if (stSig !== p._stressKind) {                                  // it came or went: the Effects list shows it
    p._stressKind = stSig;
    if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
  }
  // ...and heatstroke (0.825): thirst and fruit from 20%, food, vegetables and protein from 30%, energy from 50%
  // ...and every bar by the stats depletion (Slow Burner: 5% slower, 0.828)
  drainStat(p, 'food', foodCost * playerHungerMul() * cold * hsm.food * dep);
  drainStat(p, 'thirst', thirstCost * hot * hsm.thirst * dep * (1 + SICK_FRUIT_THIRST * sickness('fruit', p)));   // fruit sickness (0.8323)
  drainStat(p, 'energy', ENERGY_IDLE_PER_S * dt * (1 + hsm.energy) * dep);
  drainStat(p, 'fruit', NUTRIENT_PER_S * dt * hot * hsm.thirst * dep);
  drainStat(p, 'veg', NUTRIENT_PER_S * dt * hsm.food * dep);
  drainStat(p, 'protein', NUTRIENT_PER_S * dt * cold * hsm.food * dep);
  if (!p.canFly) {
    _warnLow(p, 'food', '_warnFood', HUNGRY_WARN, `Hungry: under ${HUNGRY_WARN} food left, eat something`);
    _warnLow(p, 'thirst', '_warnThirst', THIRSTY_WARN, `Thirsty: under ${THIRSTY_WARN} thirst left, drink something`);
  }
  _emptyHits(p, dt, 'food', '_starveT', 'starved to death', 'Starving: losing health, eat something');
  _emptyHits(p, dt, 'thirst', '_thirstT', 'died of thirst', 'Dehydrated: losing health, drink something');
  /* cold and hot also hurt (0.823): a slow drain by how far past the line, less what you resist (0.8243). It shows as
     a hit each time half an old point (2.5) has gone, like poison, and the feed warns once every 20 s at most. */
  const hurts = st && EFFECT_DEFS[st.kind].hurts;
  if (hurts && st.dps > 0) {
    const before = p.hp;
    p.hp = Math.max(0, p.hp - st.dps * dt);
    p._dmgCause = hurts;
    p._tempDmgAcc = (p._tempDmgAcc || 0) + (before - p.hp);
    if (p._tempDmgAcc >= 0.5 * VITAL_K) {
      if (typeof hurtFlash === 'function') hurtFlash(p._tempDmgAcc / VITAL_K);
      p._tempDmgAcc = 0;
    }
    if ((p._tempWarnT = (p._tempWarnT || 0) - dt) <= 0 && typeof feedCrit === 'function') {
      p._tempWarnT = 20;
      feedCrit(st.kind === 'cold' ? 'Freezing: losing health, find warmth' : 'Overheating: losing health, find shade or water');
    }
  } else { p._tempDmgAcc = 0; p._tempWarnT = 0; }
  _tickSickHurt(p, dt);                              // protein or fruit at 0 (0.8323)
  _tickWet(p, dt);                                   // soaked by rain, snow or water (0.8323)

  _tickOxygen(dt);
  _tickTemperature(dt);
  // a lit torch in hand melts the ice within a block of you (0.8321, iceWarmHeld in 51), looked at twice a second
  p._iceWarmT = (p._iceWarmT || 0) - dt;
  if (p._iceWarmT <= 0) {
    p._iceWarmT = 0.5;
    const held = [HOTBAR[hotbarSel]?.id, typeof offhandItemId === 'function' ? offhandItemId() : null];
    if (held.includes(B.TORCH) && !(typeof torchDoused === 'function' && torchDoused(p)) && typeof iceWarmHeld === 'function')
      iceWarmHeld(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z));
  }
  if (typeof tickHeldBurn === 'function') tickHeldBurn(p, dt);   // a held torch burns down (0.834, 56-torches.js)
}

// protein or fruit run dry (0.8323): a slow loss of health, SICK_HP_PER_S for each, shown as hits like poison
function _tickSickHurt(p, dt) {
  if (p.canFly || p.dead) return;
  let n = 0;
  for (const k of ['protein', 'fruit']) if ((p[k] ?? MAX_NUTRIENT) <= 0) n++;
  if (!n) { p._sickDmgAcc = 0; return; }
  const before = p.hp;
  p.hp = Math.max(0, p.hp - SICK_HP_PER_S * n * dt);
  p._dmgCause = 'wasted away';
  p._sickDmgAcc = (p._sickDmgAcc || 0) + (before - p.hp);
  if (p._sickDmgAcc >= 0.5 * VITAL_K) {
    if (typeof hurtFlash === 'function') hurtFlash(p._sickDmgAcc / VITAL_K);
    p._sickDmgAcc = 0;
  }
}
/* How much faster than a second a second you dry (0.8323), on top of the 1: a torch within 2 blocks or in hand +0.1,
   fire within 3 +10, lava within 3 +20, a lit furnace within 2 +5, a desert +5, burning +10, and a warm body
   +1 for every 5°C over 15. */
const DRY_TORCH = 0.1, DRY_FIRE = 10, DRY_LAVA = 20, DRY_FURNACE = 5, DRY_DESERT = 5, DRY_BURNING = 10, DRY_PER_DEG = 0.2;
function _dryBoost(p) {
  const x = Math.floor(p.pos.x), y = Math.floor(p.pos.y), z = Math.floor(p.pos.z);
  let torch = 0, fire = 0, lava = 0, furnace = 0;
  for (let dy = -1; dy <= 2; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const v = getBlock(x + dx, y + dy, z + dz), id = v & 255, near = Math.max(Math.abs(dx), Math.abs(dz)) <= 2;
    if (id === B.TORCH && near) torch = DRY_TORCH;
    else if (id === B.FIRE) fire = DRY_FIRE;
    else if (id === B.LAVA) lava = DRY_LAVA;
    else if (id === B.FURNACE && near && blockLightOf(v) > 0) furnace = DRY_FURNACE;
  }
  const held = [HOTBAR[hotbarSel]?.id, typeof offhandItemId === 'function' ? offhandItemId() : null];
  if (held.includes(B.TORCH) && !(typeof torchDoused === 'function' && torchDoused(p))) torch = DRY_TORCH;
  const c = mainGen && mainGen.climateAt ? mainGen.climateAt(x, z) : null;
  return torch + fire + lava + furnace + DRY_DESERT * Math.min(1, c ? c.hot : 0) + (p.fireT > 0 ? DRY_BURNING : 0)
       + Math.max(0, ((typeof p.temp === 'number' ? p.temp : 20) - 15) * DRY_PER_DEG);
}
// soaked by rain or falling snow on an open head, or by water; dried by time and heat (0.8323)
function _tickWet(p, dt) {
  if (p.canFly || p.dead) { p._wetT = 0; p._wetP = 0; return; }
  p._wetSampleT = (p._wetSampleT || 0) - dt;
  if (p._wetSampleT <= 0) {                          // looked at twice a second
    p._wetSampleT = 0.5;
    const ey = p.pos.y + (p.EYE || 1.62);
    const open = getSkyWorld(Math.floor(p.pos.x), Math.floor(ey), Math.floor(p.pos.z)) >= 15;
    const pr = open && typeof precipAt === 'function' ? precipAt(p.pos.x, p.pos.z, ey) : null;
    p._wetRain = pr ? WET_RAIN_PER_S * pr.rain + WET_SNOW_PER_S * pr.snow : 0;
    p._wetRainPct = pr ? WET_RAIN_PCT * pr.rain + WET_SNOW_PCT * pr.snow : 0;   // 0.8324
    p._dryBoostV = (p._wetP || 0) > 0 ? _dryBoost(p) : 0;
  }
  const water = !!p._inWater;
  const soak = (p._wetRain || 0) + (water ? WET_WATER_PER_S : 0);
  const soakPct = (p._wetRainPct || 0) + (water ? WET_WATER_PCT : 0);
  const pct = p._wetP || 0, dry = 1 + (p._dryBoostV || 0);
  if (soakPct > 0.001) {
    if (pct < 1) {                                   // first the soaking, to 100% (0.8324)
      p._wetP = Math.min(1, pct + soakPct * dt);
      if (p._wetP >= 1) p._wetT = Math.max(p._wetT || 0, WET_MIN);
    } else p._wetT = Math.min(WET_MAX, Math.max(WET_MIN, (p._wetT || 0) + soak * dt));   // ...then the time
  } else if ((p._wetT || 0) > 0) p._wetT = Math.max(0, p._wetT - dt * dry);   // out of it: the time first...
  else if (pct > 0) p._wetP = Math.max(0, pct - WET_DRY_PCT * dt * dry);      // ...then the % dries off
}
/* MINING SPEED (0.8323), a stat: how fast you break blocks, 100% to start; effects and gear may carry `miningSpeed`,
   vegetable sickness takes up to 25% (off for now). Never under 0. */
const playerMiningSpeedMul = () => Math.max(0, 1 + _effectSum('miningSpeed') + (typeof _equipSum === 'function' ? _equipSum('miningSpeed') : 0)
  - SICK_VEG_MINING * sickness('veg'));
// how strongly fog and sand cloud your sight: Clear Eyes 30% less (0.828), vegetable sickness up to 25% more (0.8323, off)
const playerSightMul = () => (typeof skillSightMul === 'function' ? skillSightMul() : 1) * (1 + SICK_VEG_SIGHT * sickness('veg'));

/* Oxygen. Eyes under water drain it at AIR_DRAIN_PER_S (5% slower with Slow Burner); at 0 you drown, each hit
   harder than the last (0.7573) until you are out. Out of the water it comes back fast when empty, easing off
   as it fills. The clocks are ON THE PLAYER (0.734): this runs once per seat. */
function _tickOxygen(dt) {
  const p = player;
  const eyeUnder = (getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + p.EYE), Math.floor(p.pos.z)) & 255) === B.WATER;
  p._eyeUnder = eyeUnder;
  if (eyeUnder && !p.flying) {
    p._airRegenT = 0;                               // 0.829
    p.air = Math.max(0, p.air - dt * AIR_DRAIN_PER_S * playerAirMul());
    // low-oxygen warning (0.756): once per dive
    if (p.air < AIR_WARN && !p._warnAir && !p.canFly) {
      p._warnAir = true;
      if (typeof feedWarn === 'function') feedWarn(`Low oxygen: under ${AIR_WARN} left, get to the surface`);
    }
    if (p.air <= 0) {
      p._drownT = (p._drownT || 0) + dt;
      if (p._drownT >= 1) {
        p._drownT -= 1;
        const hit = DROWN_DMG_BASE + (p._drownHits || 0) * DROWN_DMG_STEP;
        p._drownHits = (p._drownHits || 0) + 1;
        p.hp = Math.max(0, p.hp - hit); p._dmgCause = 'drowned';
        if (typeof feedCrit === 'function') feedCrit('Drowning: losing health, get to the surface');
      }
    }
  } else {
    const k = p.air / MAX_AIR;
    // ...and faster still the longer you breathe: after 2 s, up to x2 over AIR_RAMP_S (0.829; the wait 0.8321)
    p._airRegenT = p.air < MAX_AIR ? (p._airRegenT || 0) + dt : 0;
    const ramp = regenRamp(p._airRegenT, AIR_RAMP_S, AIR_RAMP_MAX);
    // ...and by the regen stat (0.8321): Rapid regen, tiredness
    p.air = Math.min(MAX_AIR, p.air + dt * ramp * playerRegenMul(p) * (AIR_REGEN_EMPTY + (AIR_REGEN_FULL - AIR_REGEN_EMPTY) * k));
    p._drownHits = 0;
    if (p.air >= AIR_WARN) p._warnAir = false;
    p._drownT = 0;
  }
}

/* ---- temperature ----
   What the air around you is, in °C: the season (a cosine through the year, warmest mid July), the biome (snow
   and desert, blended across their edges), the hour (warmest at 15:00), the weather and wind chill (out in the
   open only), height, deep underground (the same all year), water, and heat from lava, fire, torches and lit
   furnaces nearby. The body follows it over TEMP_EASE_S. The HUD shows -40..80; nothing else reads it yet. */
const TEMP_SAMPLE_S = 0.5, TEMP_EASE_S = 10, TEMP_EASE_WATER_S = 4;
const TEMP_MEAN = 11, TEMP_SWING = 13;             // about -2 in mid January, 24 in mid July
const SNOW_BIOME_MEAN = -10, SNOW_BIOME_SWING = 4, SNOWFALL_CHILL = 4;   // 0.8323 (airTempAt)
const DEEP_SNOW_CHILL = 1.5;                       // how much colder the deep snow is, per degree its level is past the snow's: about -22°C (0.836; 0.5, -14 before)
const RIME_MEAN = -60, RIME_SWING = 3;             // the Coldest Deep Snow (0.836)
const TEMP_FLOOR = -75;                            // the coldest the air ever reads (-50 before 0.836)
const TEMP_PEAK_DAY = 6.5 * MONTH_DAYS;            // mid July, in days from 1 January
const TEMP_SNOW = -16, TEMP_HOT = 14;              // deep inside a snow biome, a desert
const TEMP_DAY_AMP = 5;                            // the day's swing either way; a desert doubles it by day
const TEMP_DESERT_NIGHT = 3.5;                     // ...and its night falls 4.5x as far: dry air loses its heat (0.8245)
const TEMP_LAPSE_FROM = 110, TEMP_LAPSE = 0.12;    // colder by this a block above that height
/* A cave's air (0.831; a flat 12°C before): cold near the surface, TEMP_CAVE, and a little warmer the deeper under
   the ground you are, TEMP_CAVE_DEEP_PER a block past TEMP_CAVE_DEEP_FROM, up to TEMP_CAVE_DEEP_MAX more. */
const TEMP_CAVE = 4, TEMP_CAVE_DEEP_FROM = 16, TEMP_CAVE_DEEP_PER = 0.1, TEMP_CAVE_DEEP_MAX = 10;
const caveTemp = (depth) => TEMP_CAVE + Math.min(TEMP_CAVE_DEEP_MAX, Math.max(0, depth - TEMP_CAVE_DEEP_FROM) * TEMP_CAVE_DEEP_PER);
const TEMP_WEATHER = { clear: 0, sunny: 2, cloudy: -1, windy: -1, rainy: -3, darky: -2, storm: -5, foggy: -1.5, blizzard: -25 };   // blizzard 0.83; -12 before 0.837
const TEMP_WATER = -6, TEMP_ON_FIRE = 25;
// heat right beside a source, fading with distance, summed over HEAT_R blocks around you
const HEAT_OF = new Float32Array(256);
HEAT_OF[B.LAVA] = 30; HEAT_OF[B.FIRE] = 20; HEAT_OF[B.TORCH] = 3;
HEAT_OF[B.GLOWSTONE] = 2; HEAT_OF[B.GLOWCRYSTAL_BLOCK] = -2;   // a little warm, the blue crystal a little cold (0.8245)
HEAT_OF[B.GLOW_VINE] = -1.5; HEAT_OF[B.CRYSTAL_TORCH] = -1;      // the blue crystal's cold in a vine and a torch too (0.834)
const FURNACE_HEAT = 12, HEAT_R = 3, HEAT_MAX = 60;
function _heatNear(x, y, z) {
  let heat = 0;
  for (let dy = -1; dy <= 2; dy++)
    for (let dz = -HEAT_R; dz <= HEAT_R; dz++)
      for (let dx = -HEAT_R; dx <= HEAT_R; dx++) {
        const v = getBlock(x + dx, y + dy, z + dz), id = v & 255;
        const h = id === B.FURNACE ? (blockLightOf(v) > 0 ? FURNACE_HEAT : 0) : HEAT_OF[id];
        if (h) heat += h / (1 + (dx * dx + dy * dy + dz * dz) * 0.35);
      }
  return Math.min(HEAT_MAX, heat);
}
/* What you hold warms (or cools) you as if it were right beside you (0.8245): a torch, glowstone, the glowcrystal
   block. The stronger of the two hands counts, and a torch under water is out (torchDoused, 22-main-loop.js). */
function _heldHeat(p) {
  const ids = [HOTBAR[hotbarSel]?.id, typeof offhandItemId === 'function' ? offhandItemId() : null];
  let h = 0;
  for (const id of ids) {
    if (id == null || id >= 256 || !HEAT_OF[id]) continue;
    if (id === B.TORCH && typeof torchDoused === 'function' && torchDoused(p)) continue;
    if (Math.abs(HEAT_OF[id]) > Math.abs(h)) h = HEAT_OF[id];
  }
  return h;
}
/* The air at a place, °C (0.8244, out of ambientTemp so snow melt reads it too): season, biome, hour, weather and
   wind (`open` = how much sky is over it), and height. Height, since 0.8244: above the snowline the air is 0°C or
   colder, so its snow keeps; anywhere under it (a bare mountain too) height alone never takes it below
   TEMP_BARE_MIN, so snow up there can melt. `c` is the climate sample (for the caller's cave test). */
const TEMP_BARE_MIN = 5.5;
function airTempAt(x, y, z, open = 1) {
  const d = gameDate(), dayFrac = worldTime - Math.floor(worldTime);
  const doy = d.month * MONTH_DAYS + d.day - 1 + dayFrac;
  const yearCos = Math.cos(2 * Math.PI * (doy - TEMP_PEAK_DAY) / (12 * MONTH_DAYS));
  let t = TEMP_MEAN + TEMP_SWING * yearCos;
  const c = mainGen && mainGen.climateAt ? mainGen.climateAt(x, z) : { snow: 0, hot: 0, h: y };
  t += c.air != null ? c.air : TEMP_SNOW * c.snow + TEMP_HOT * c.hot;   // a ladder world: its level's air (0.8232, 55-biomes.js)
  /* SNOW BIOMES (0.8323): about -10°C the year round (SNOW_BIOME_MEAN, swinging SNOW_BIOME_SWING either way with the
     seasons; it reached 13°C on a summer noon before), deep snow about -22 (DEEP_SNOW_CHILL, 0.836; -14 before); blended
     in by how snowy the place is (a ladder level from cold plains to snow). Falling snow takes up to SNOWFALL_CHILL more,
     below. The Coldest Deep Snow (0.836) is RIME_MEAN, eased in over its edge (c.rime, 55-biomes.js). */
  const snowy = c.air != null ? Math.max(0, Math.min(1, (-c.air - 7) / 9)) : Math.min(1, c.snow || 0);
  if (snowy > 0) {
    const snowT = SNOW_BIOME_MEAN + SNOW_BIOME_SWING * yearCos + (c.air != null ? Math.min(0, c.air + 16) * DEEP_SNOW_CHILL : 0);
    t += (snowT - t) * snowy;
  }
  if (c.rime > 0) t += (RIME_MEAN + RIME_SWING * yearCos - t) * c.rime;
  const w = weatherAt(x + 0.5, z + 0.5, y);
  if (typeof precipAt === 'function') t -= SNOWFALL_CHILL * precipAt(x + 0.5, z + 0.5, y).snow * open;   // 0.8323
  const overcast = !(w.type === 'clear' || w.type === 'sunny' || w.type === 'windy');
  const hour = (6 + dayFrac * 24) % 24;
  /* A desert's night is cold (0.8245): about 0°C in spring, 15°C in July, -10°C in January at the coldest hour
     (03:00) under a clear sky. Its day stays as it was. */
  const cyc = Math.cos(2 * Math.PI * (hour - 15) / 24);
  t += TEMP_DAY_AMP * (1 + c.hot * (cyc < 0 ? TEMP_DESERT_NIGHT : 1)) * (overcast ? 0.5 : 1) * (0.4 + 0.6 * open) * cyc;
  t += ((TEMP_WEATHER[w.type] || 0) - Math.max(0, w.speed - 10) * 0.1) * open;   // wind chill past 10 km/h
  const high = t - Math.max(0, y - TEMP_LAPSE_FROM) * TEMP_LAPSE;
  if (typeof snowlineY === 'function' && y >= snowlineY(x, z)) t = Math.min(high, 0);
  else t = Math.max(high, Math.min(t, TEMP_BARE_MIN));
  return { t, c };
}
function ambientTemp(p) {
  const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z), y = Math.floor(p.pos.y + 1);
  const open = getSkyWorld(x, Math.floor(p.pos.y + p.EYE), z) / 15;   // how much sky is over you
  const a = airTempAt(x, y, z, open), c = a.c;
  let t = a.t;
  const deep = Math.max(0, Math.min(1, (c.h - y - 2) / 12)) * (1 - open);
  t += (caveTemp(c.h - y) - t) * deep;           // colder near the top, a little warmer deep down (0.831)
  if (p._inWater) t += TEMP_WATER;
  t += Math.min(HEAT_MAX, _heatNear(x, Math.floor(p.pos.y), z) + _heldHeat(p));
  if (p.fireT > 0) t += TEMP_ON_FIRE;
  return Math.max(TEMP_FLOOR, Math.min(90, t));
}
/* How fast the body follows the air (0.8245). A big gap closes faster: the ease time is cut by 1 + gap /
   TEMP_EASE_BIG (a 15° jump twice as fast, 30° three times). Resistance slows the turn toward its side: cold
   resistance while you cool toward cold air (under TEMP_COMFORT), heat resistance while you warm toward hot air,
   by 1 + res x TEMP_RESIST_EASE (30% resistance: 1.6x slower; cloth's negative cold resistance speeds it). */
const TEMP_EASE_BIG = 15, TEMP_COMFORT = 20, TEMP_RESIST_EASE = 2;
function _tempEaseMul(p) {
  const gap = p._tempAim - p.temp;
  const res = gap < 0 && p._tempAim < TEMP_COMFORT ? tempResist(true)
            : gap > 0 && p._tempAim > TEMP_COMFORT ? tempResist(false) : 0;
  return Math.max(0.5, 1 + res * TEMP_RESIST_EASE) / (1 + Math.abs(gap) / TEMP_EASE_BIG);
}
function _tickTemperature(dt) {
  const p = player;
  p._tempT = (p._tempT || 0) - dt;
  if (p._tempT <= 0 || p._tempAim == null || typeof p.temp !== 'number') {
    p._tempT = TEMP_SAMPLE_S; p._tempAim = ambientTemp(p);
    if (typeof p.temp !== 'number') p.temp = p._tempAim;
    p._tempEase = _tempEaseMul(p);
    _sampleExposure(p);                              // sun, roof, sandstorm (0.825)
  }
  const ease = (p._inWater ? TEMP_EASE_WATER_S : TEMP_EASE_S) * (p._tempEase || 1);
  p.temp += (p._tempAim - p.temp) * (1 - Math.exp(-dt / ease));
}
/* Where this seat stands, sampled with the temperature (0.825): how much sun is on it (_hsSun: a sunny or clear sky,
   by day, open sky over the head, not in water), whether it is under a roof or in a cave (_roofed), how much desert
   the ground is (_hsDesert), and the sandstorm there (_sandAim). */
const HS_SUN = { sunny: 1, clear: 0.8 };            // the sun's strength under each sky; any other sky has none
function _sampleExposure(p) {
  const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z), sky = getSkyWorld(x, Math.floor(p.pos.y + p.EYE), z);
  const w = weatherAt(p.pos.x, p.pos.z, p.pos.y), day = typeof _skyDayF === 'number' ? _skyDayF : 1;
  p._hsSun = sky >= 15 && !p._inWater ? (HS_SUN[w.type] || 0) * day : 0;
  p._roofed = sky < 12;
  const c = mainGen && mainGen.climateAt ? mainGen.climateAt(x, z) : null;
  p._hsDesert = c ? Math.min(1, c.hot) : 0;
  p._sandAim = typeof sandstormAt === 'function' ? sandstormAt(p.pos.x, p.pos.z) : 0;
  // a storm or hail overhead, for the weathering XP (0.8282)
  p._wxHarsh = !p._roofed && ((w.mix && (w.mix.storm || 0) >= 0.5) || (typeof hailAt === 'function' && hailAt(p.pos.x, p.pos.z) > 0.3));
}

/* ---- heatstroke (0.825) ----
   p.heatstroke, 0..100. It builds while you stand in hot sun: a sunny or clear sky, the sun up, open sky over your
   head, and a body hotter than HS_FROM °C (a hat raises that by its heatstrokeTrigger, 5). From 0 to 100 takes
   HS_FULL_S in a desert's midday sun with the body at HS_FROM + HS_REF_OVER or more; it builds faster the hotter you
   are, half as fast away from a desert, and resistance takes its share off (a hat 25%, the cloth set 40%). Anywhere
   else it goes down: slowly in shade or at night (HS_COOL_OUT_S from full), faster under a roof (HS_COOL_ROOF_S),
   fastest in water (HS_COOL_WATER_S). What it does as it climbs:
     20%  thirst and fruit drain faster           30%  food, vegetables and protein do too
     40%  the view blurs, more as it climbs        50%  energy drains fast, stamina barely comes back
     70%  a slow loss of health                    90%  mirages: water on the ground ahead (19-vitals.js)
     100% you collapse and die. */
const HS_FULL_S = 240, HS_FROM = 35, HS_REF_OVER = 13;
const HS_COOL_OUT_S = 1200, HS_COOL_ROOF_S = 600, HS_COOL_WATER_S = 300;
const HS_THIRST_AT = 20, HS_FOOD_AT = 30, HS_BLUR_AT = 40, HS_TIRED_AT = 50, HS_HURT_AT = 70, HS_MIRAGE_AT = 90;
const HS_BLUR_MAX = 6;                               // CSS px of blur at 100%
const HS_HURT_DPS = 0.2, HS_HURT_DPS_MAX = 0.8;      // health a second from 70%, rising to 100%
const HS_STEPS = [[HS_THIRST_AT, 'Heatstroke: the sun is getting to you, find shade'],
                  [HS_TIRED_AT, 'Heatstroke: you are worn out, get out of the sun'],
                  [HS_HURT_AT, 'Heatstroke: losing health, find shade, a roof or water'],
                  [HS_MIRAGE_AT, 'Heatstroke: you are seeing things, get out of the sun now']];
// what you wear against it, 0..0.9: a hat's heatstrokeResist and the cloth set's
function playerHeatstrokeResist() {
  const b = armorSetBonus();
  return Math.min(0.9, Math.max(0, _equipSum('heatstrokeResist') + ((b && b.heatstrokeResist) || 0)));
}
const heatstrokeLine = () => HS_FROM + _equipSum('heatstrokeTrigger');
// its effects at `hs`: drain multipliers, the extra energy drain (in idle drains), the stamina regen share, health a second
function heatstrokeMuls(hs) {
  const ramp = (at, lo, hi) => hs < at ? 1 : lo + (hi - lo) * (hs - at) / (100 - at);
  return {
    thirst: ramp(HS_THIRST_AT, 1.25, 2),                // thirst and fruit
    food: ramp(HS_FOOD_AT, 1.2, 1.75),                  // food, vegetables and protein
    energy: hs < HS_TIRED_AT ? 0 : 3 + 4 * (hs - HS_TIRED_AT) / (100 - HS_TIRED_AT),
    stamina: hs < HS_TIRED_AT ? 1 : 0.25,
    dps: hs < HS_HURT_AT ? 0 : HS_HURT_DPS + (HS_HURT_DPS_MAX - HS_HURT_DPS) * (hs - HS_HURT_AT) / (100 - HS_HURT_AT),
  };
}
// CSS px of blur over this seat's view (19-vitals.js)
const heatstrokeBlur = (p = player) => p.canFly || p.dead || !(p.heatstroke >= HS_BLUR_AT) ? 0
  : 0.5 + (HS_BLUR_MAX - 0.5) * (p.heatstroke - HS_BLUR_AT) / (100 - HS_BLUR_AT);
function _tickHeatstroke(dt) {
  const p = player, t = p.temp;
  let hs = p.heatstroke || 0;
  const line = heatstrokeLine();
  if (p._hsSun > 0 && typeof t === 'number' && t > line) {
    const k = Math.min(1.5, 0.25 + 0.75 * (t - line) / HS_REF_OVER);
    hs += 100 / HS_FULL_S * k * p._hsSun * (0.5 + 0.5 * (p._hsDesert || 0)) * (1 - playerHeatstrokeResist()) * dt;
  } else if (hs > 0) {
    hs -= 100 / (p._inWater ? HS_COOL_WATER_S : p._roofed ? HS_COOL_ROOF_S : HS_COOL_OUT_S) * dt;
  }
  p.heatstroke = hs = Math.max(0, Math.min(100, hs));
  // the feed says so as it passes each step; it says it again only after falling 5 under it
  let step = 0;
  for (let i = 0; i < HS_STEPS.length; i++) if (hs >= HS_STEPS[i][0]) step = i + 1;
  if (step > (p._hsStep || 0)) {
    const say = step === HS_STEPS.length ? (typeof feedCrit === 'function' && feedCrit) : (typeof feedWarn === 'function' && feedWarn);
    if (say) say(HS_STEPS[step - 1][1]);
    p._hsStep = step;
  } else if ((p._hsStep || 0) > 0 && hs < HS_STEPS[p._hsStep - 1][0] - 5) p._hsStep--;
  // at 100% you collapse: 19-vitals.js kills you AFTER the armor soak, which must not soften it
  if (hs >= 100) {
    if (!p._hsDown && typeof feedCrit === 'function') feedCrit('Heatstroke: you collapsed');
    p._hsDown = true;
    return;
  }
  p._hsDown = false;
  const dps = heatstrokeMuls(hs).dps;
  if (dps > 0) {
    const before = p.hp;
    p.hp = Math.max(0, p.hp - dps * dt);
    p._dmgCause = 'died of heatstroke';
    p._hsDmgAcc = (p._hsDmgAcc || 0) + (before - p.hp);
    if (p._hsDmgAcc >= 0.5 * VITAL_K) { if (typeof hurtFlash === 'function') hurtFlash(p._hsDmgAcc / VITAL_K); p._hsDmgAcc = 0; }
  } else p._hsDmgAcc = 0;
}
function _hsDesc(p) {
  const hs = p.heatstroke || 0, m = heatstrokeMuls(hs), pc = (x) => Math.round((x - 1) * 100) + '%';
  const out = [];
  if (hs >= HS_THIRST_AT) out.push(`thirst and fruit drain ${pc(m.thirst)} faster`);
  if (hs >= HS_FOOD_AT) out.push(`food, vegetables and protein ${pc(m.food)} faster`);
  if (hs >= HS_BLUR_AT) out.push('your sight blurs');
  if (hs >= HS_TIRED_AT) out.push('energy drains fast and stamina barely comes back');
  if (hs >= HS_HURT_AT) out.push(`you lose ${m.dps.toFixed(1)} health a second`);
  if (hs >= HS_MIRAGE_AT) out.push('you see water that is not there');
  const s = out.length ? out.join(', ') : `nothing yet: from ${HS_THIRST_AT}% thirst and fruit drain faster`;
  const res = playerHeatstrokeResist();
  return s[0].toUpperCase() + s.slice(1) + '. At 100% you collapse and die.' + (res ? ` ${Math.round(res * 100)}% resisted.` : '');
}

/* ---- a sandstorm on the body (0.825) ----
   p._sandFelt, 0..1: how much of a sandstorm (sandstormAt, 51-seasons.js) reaches you. It builds over SAND_EASE_S as
   the storm thickens round you (most of it in 30-60 s) and is gone in moments under a roof, in a cave or in water.
   It slows your walk by up to SAND_SLOW and drains stamina (more on the move), so you soon cannot sprint or jump;
   the cloth set takes 40% off it all (sandstormResist). */
const SAND_EASE_S = 15, SAND_CLEAR_S = 3, SAND_SLOW = 0.45;
const SAND_STAMINA_PER_S = 2, SAND_STAMINA_MOVING_PER_S = 5;
const playerSandResist = () => { const b = armorSetBonus(); return Math.min(0.9, (b && b.sandstormResist) || 0); };
function _tickSandstorm(dt) {
  const p = player, aim = p._roofed || p._inWater ? 0 : (p._sandAim || 0) * (1 - playerSandResist());
  const cur = p._sandFelt || 0;
  p._sandFelt = cur + (aim - cur) * (1 - Math.exp(-dt / (aim > cur ? SAND_EASE_S : SAND_CLEAR_S)));
  if (p._sandFelt < 0.005) p._sandFelt = 0;
}
/* Weathering it (0.8282): out in the open through a storm, hail, a sandstorm, or with the body Cold or Hot, every
   XP_WEATHER_S pays XP_WEATHER (35-leveling.js). The clock keeps what it had between spells, and never runs indoors. */
function _tickWeatherXP(p, dt) {
  const st = tempStress(p);
  const harsh = !p.dead && !p._roofed && (p._wxHarsh || p._sandFelt > 0.3 || (st && (st.kind === 'cold' || st.kind === 'hot')));
  if (!harsh || typeof addXP !== 'function') return;
  p._wxXpT = (p._wxXpT || 0) + dt;
  if (p._wxXpT >= XP_WEATHER_S) { p._wxXpT -= XP_WEATHER_S; addXP(XP_WEATHER, 'braving the weather'); }
}
/* A night lived through outside (0.8283): from dusk to dawn the clock counts the night and how much of it this player
   spent under the open sky; alive at dawn with more than half of it outside pays XP_NIGHT, or XP_BLOOD_MOON if it was
   a blood moon. Dying, or a night slept through, starts it over (fillVitals, the bed skips the dark). */
function _tickNightXP(p, dt) {
  if (p.dead || p.sleepingAt) { p._night = null; return; }
  const dark = typeof isDarkTime === 'function' && isDarkTime();
  if (dark) {
    const n = p._night || (p._night = { t: 0, out: 0, blood: false });
    n.t += dt; if (!p._roofed) n.out += dt;
    if (typeof isBloodMoon === 'function' && isBloodMoon()) n.blood = true;
    return;
  }
  const n = p._night;
  if (!n) return;
  p._night = null;
  if (n.t < 120 || n.out < n.t * 0.5 || typeof addXP !== 'function') return;
  const xp = n.blood ? XP_BLOOD_MOON : XP_NIGHT;
  addXP(xp);
  if (typeof feedFeat === 'function') feedFeat(n.blood ? 'Lived through the blood moon outside' : 'Lived through the night outside', xp);
}
/* Found once and for all (0.8283): each biome the first time you stand in it, the top of the world (WORLD_TOP, y 249 since 0.8354) and its
   bottom (y 2), looked at once a second. */
function _tickFeats(p, dt) {
  if (p.dead || !p.spawned) return;
  p._featT = (p._featT || 0) - dt;
  if (p._featT > 0) return;
  p._featT = 1;
  const f = p._feats || (p._feats = restoreFeats(null));
  const pay = (text, xp) => { addXP(xp); if (typeof feedFeat === 'function') feedFeat(text, xp); };
  const b = mainGen && mainGen.biomeAt ? mainGen.biomeAt(Math.floor(p.pos.x), Math.floor(p.pos.z)) : '';
  // each new one pays more than the last (0.8324, biomeXP in 35): by how many were found before it
  if (b && !f.biomes.has(b)) { const xp = biomeXP(f.biomes.size); f.biomes.add(b); pay(`Discovered ${b} (${f.biomes.size}/${BIOME_COUNT})`, xp); }
  if (!f.top && p.pos.y >= WORLD_TOP_Y) { f.top = true; pay('Reached the top of the world', XP_WORLD_EDGE); }
  if (!f.bottom && p.pos.y <= WORLD_BOTTOM_Y) { f.bottom = true; pay('Reached the bottom of the world', XP_WORLD_EDGE); }
}
// the walk's multiplier in a sandstorm (22-main-loop.js)
const playerStormMoveMul = (p = player) => p.canFly ? 1 : 1 - SAND_SLOW * (p._sandFelt || 0);

/* ---- exhausted (0.82501) ----
   Run your stamina dry and you are Exhausted until it is back to STAMINA_BACK (playerTired): EXHAUST_SLOW off your
   move speed, EXHAUST_SAND_SLOW more in a full sandstorm (by how much of it reaches you). Stay exhausted longer than
   EXHAUST_HURT_AFTER — a sandstorm keeps you there, as does heatstroke's slow stamina — and it costs health too,
   EXHAUST_HURT_DPS a second. A sprint that runs out and stops to rest never gets that far. */
const EXHAUST_SLOW = 0.2, EXHAUST_SAND_SLOW = 0.2, EXHAUST_HURT_DPS = 0.3;
const EXHAUST_HURT_AFTER = 10;   // 5 until 0.826, when the rest before stamina comes back grew to 5 s once exhausted
const exhaustedSlow = (p = player) => playerTired(p) ? EXHAUST_SLOW + EXHAUST_SAND_SLOW * Math.min(1, p._sandFelt || 0) : 0;
function _tickExhausted(p, dt) {
  if (!playerTired(p) || p.dead) { p._exhaustT = 0; p._exhaustAcc = 0; return; }
  p._exhaustT = (p._exhaustT || 0) + dt;
  if (p._exhaustT < EXHAUST_HURT_AFTER) return;
  if (p._exhaustT - dt < EXHAUST_HURT_AFTER && typeof feedCrit === 'function') feedCrit('Exhausted: losing health, stop and rest under a roof');
  const before = p.hp;
  p.hp = Math.max(0, p.hp - EXHAUST_HURT_DPS * dt);
  p._dmgCause = 'died of exhaustion';
  p._exhaustAcc = (p._exhaustAcc || 0) + (before - p.hp);
  if (p._exhaustAcc >= 0.5 * VITAL_K) { if (typeof hurtFlash === 'function') hurtFlash(p._exhaustAcc / VITAL_K); p._exhaustAcc = 0; }
}

/* ---- drinking ----
   Crosshair on water within DRINK_REACH, main hand empty, not already full: hold E (pad North) for DRINK_TIME
   and you drink to full. The arm lifts as for eating (the progress rides on _eatProg, 22-main-loop.js), water
   drips, and the feed says how much went down. */
const DRINK_TIME = 1.1, DRINK_REACH = 4;
const _drinkDir = new THREE.Vector3();
function _waterAimed() {
  const p = player;
  if (!playing || invOpen || menuScene || p.dead || p.canFly || p.riding || p.sleepingAt || HOTBAR[hotbarSel]) return false;
  camera.getWorldDirection(_drinkDir);
  const ox = p.pos.x, oy = p.pos.y + p.EYE, oz = p.pos.z;
  for (let t = 0.05; t <= DRINK_REACH; t += 0.1) {
    const v = getBlock(Math.floor(ox + _drinkDir.x * t), Math.floor(oy + _drinkDir.y * t), Math.floor(oz + _drinkDir.z * t));
    if ((v & 255) === B.WATER) return true;
    if (CORE.solidVal(v)) return false;              // a wall between you and it
  }
  return false;
}
// returns how far through a drink this seat is, 0..1
function updateDrinking(dt, held) {
  const p = player;
  p._drinkAim = !p.canFly && (p.thirst ?? MAX_THIRST) < MAX_THIRST - 0.5 && _waterAimed();
  if (!p._drinkAim || !held) { p._drinkT = 0; return 0; }
  p._drinkT = (p._drinkT || 0) + dt;
  if (typeof fxEat === 'function') fxEat(p, null, dt, true);
  if (p._drinkT < DRINK_TIME) return p._drinkT / DRINK_TIME;
  p._drinkT = 0;
  const got = Math.round(MAX_THIRST - p.thirst);
  p.thirst = MAX_THIRST;
  if (got > 0 && typeof feedInfo === 'function') feedInfo(`Drank ${got} water`);
  return 1;
}
// the line under the crosshair while water can be drunk (18-hud.js)
const drinkPrompt = () => player._drinkAim
  ? `(<b>${typeof lastInputDevice !== 'undefined' && lastInputDevice === 'pad' ? padNorthLabel() : 'E'}</b>) hold to drink`
  : '';

/* ---- the HUD's tooltips ----
   Hovering a bar with the inventory open (19-vitals.js finds which): its value out of its max, its over-stat,
   and what moves it. */
const VITAL_INFO = {
  hp:      ['Health',     'Heals over time while food is above 30 and thirst above 20, using both. At 0 you die.'],
  armor:   ['Armor',      'From the armor you wear. Each point stops 0.8% of every hit, up to 80%.'],
  food:    ['Food',       'Drops slowly, and pays for healing and for stamina coming back. At 0 you starve.'],
  thirst:  ['Thirst',     'Drops over time, and pays for healing and stamina. Look at water with an empty hand and hold E to drink. At 0 you lose health.'],
  stamina: ['Stamina',    'Sprinting, jumping, climbing and swimming use it (swimming up a lot, treading water a little). It comes back 3 s after you last used it, faster the longer you rest and the emptier it is, 20% faster sneaking, costing food and thirst. Run dry and you are exhausted: it waits 5 s, and you cannot sprint, jump or climb until it is back to 20.'],
  energy:  ['Energy',     'Drops over time, faster when you use stamina or get hurt. A night in bed fills it.'],
  fruit:   ['Fruit',      'Drops over time. Apples, berries and melons fill it.'],
  veg:     ['Vegetables', 'Drops over time. Pumpkin pie and mushroom stew fill it.'],
  protein: ['Protein',    'Drops over time. Meat, fish and milk fill it.'],
  air:     ['Oxygen',     'Runs out while your head is under water. At 0 you drown.'],
  temp:    ['Temperature', 'The season, the hour, the biome, height, weather, water and fire around you all move it. Under 10°C you are chilly and under -5°C cold: food and protein drain faster. Over 30°C you are warm and over 45°C hot: thirst and fruit do. Cold and hot also cost health. Over 35°C in a sunny or clear day\'s sun you build up heatstroke.'],
};
function vitalTipHTML(key) {
  const inf = VITAL_INFO[key];
  if (!inf) return '';
  const p = player, n = (v) => Math.round(v);
  const row = (k, v) => `<div class="tipRow"><span>${k}</span><b>${v}</b></div>`;
  let rows;
  if (key === 'temp') rows = row('now', `${n(p.temp ?? 20)}°C`) + row('scale', '-40°C to 80°C');
  else if (key === 'armor') rows = row('now', `${n(playerArmorPoints())} / ${MAX_ARMOR}`);
  else {
    rows = row('now', `${n(p[key] ?? 0)} / ${key === 'hp' ? playerMaxHP(p) : VITAL_MAX[key]}`);   // Thick Skin's 110 (0.828)
    if (OVER_KEY[key]) rows += row('over', `${n(p[OVER_KEY[key]] || 0)} / ${MAX_OVER}`);
  }
  // ...and what is moving it right now, and from where (0.828)
  for (const [from, what] of vitalModifiers(key)) rows += row(from, what);
  return `<div class="tipName">${inf[0]}</div><div class="tipStats">${rows}</div><div class="tipDesc">${inf[1]}</div>`;
}
/* What changes a bar right now, as [source, effect] rows for its tooltip (0.828): skills, the stats depletion, effects,
   the temperature, heatstroke, a sandstorm, exhaustion. Only what is in force is listed. */
const _VITAL_DRAINS = new Set(['food', 'thirst', 'stamina', 'air', 'energy', 'fruit', 'veg', 'protein']);
function vitalModifiers(key) {
  const p = player, out = [], pct = (m) => Math.round(Math.abs(m - 1) * 100) + '%';
  const way = (m) => `drains ${pct(m)} ${m < 1 ? 'slower' : 'faster'}`;
  const dep = playerDepletionMul(), st = tempStress(p), hs = p.heatstroke || 0, hsm = heatstrokeMuls(hs);
  const stName = st ? EFFECT_DEFS[st.kind].name : '';
  if (key === 'hp') {
    if (hasSkill('thickSkin')) out.push(['Thick Skin', `+${THICK_SKIN_HP} health, 10% less damage`]);
    const rm = playerRegenMul();
    if (Math.abs(rm - 1) > 0.005) out.push(['regen', `heals at ${Math.round(rm * 100)}%`]);   // the regen stat (0.832)
    if (playerHasEffect('poisonDps')) out.push(['Poison', 'no healing, loses health']);
    if (st && st.dps > 0) out.push([stName, `-${st.dps.toFixed(1)} a second`]);
    if (hsm.dps > 0) out.push(['Heatstroke', `-${hsm.dps.toFixed(1)} a second`]);
    if (p._exhaustT >= EXHAUST_HURT_AFTER) out.push(['Exhausted', `-${EXHAUST_HURT_DPS} a second`]);
  }
  if (_VITAL_DRAINS.has(key) && Math.abs(dep - 1) > 0.005)
    out.push([hasSkill('slowBurner') && !tiredness(p) ? 'Slow Burner' : 'stats depletion', way(dep)]);   // tired counts in it (0.832)
  if (key === 'energy' && tiredness(p) > 0) out.push(['Tired', `at ${TIRED_AT} or less: regen, drain and speed suffer`]);   // 0.832
  if (key === 'food' && playerHungerMul() !== 1) out.push(['Nausea', `drains ${playerHungerMul()}x as fast`]);
  if (st && st.mul > 1.005) {
    const cold = stressIsCold(st);
    if ((cold && (key === 'food' || key === 'protein')) || (!cold && (key === 'thirst' || key === 'fruit'))) out.push([stName, way(st.mul)]);
  }
  if ((key === 'thirst' || key === 'fruit') && hsm.thirst > 1) out.push(['Heatstroke', way(hsm.thirst)]);
  if ((key === 'food' || key === 'veg' || key === 'protein') && hsm.food > 1) out.push(['Heatstroke', way(hsm.food)]);
  if (key === 'energy' && hsm.energy > 0) out.push(['Heatstroke', way(1 + hsm.energy)]);
  if (key === 'stamina') {
    if (hasSkill('climber')) out.push(['Climber', 'climbing uses 30% less']);
    if (hsm.stamina < 1) out.push(['Heatstroke', `comes back ${pct(hsm.stamina)} slower`]);
    if (p._sandFelt > 0.05) out.push(['Sandstorm', `-${((p._movingH > 0.001 ? SAND_STAMINA_MOVING_PER_S : SAND_STAMINA_PER_S) * p._sandFelt * STAMINA_USE_MUL).toFixed(1)} a second`]);
    if (p._inWater && !onGround() && !p.flying)                  // 0.8291
      out.push(['Swimming', `-${+((p._swimUp ? STAMINA_SWIM_UP_PER_S : p._movingH > 0.001 ? STAMINA_SWIM_PER_S : STAMINA_TREAD_PER_S) * STAMINA_USE_MUL).toFixed(2)} a second, no rest`]);
    if (playerTired(p)) out.push(['Exhausted', `until back to ${STAMINA_BACK}`]);
  }
  return out;
}

/* ===================================== stat getters ===================================== */
// flat bonus damage added on top of the held weapon (iron gloves = +0.75)
function playerStrength() { return _equipSum('strength') - SICK_PROTEIN_STR * sickness('protein'); }   // protein sickness (0.8323)
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
// multiplier on walking speed; floored so gear can never freeze the player
const playerMoveSpeedMul = () => {
  const b = armorSetBonus();
  return Math.max(0.25, 1 + _equipSum('moveSpeed') + (b && b.moveSpeed ? b.moveSpeed : 0)
                          + _effectSum('moveSpeed')     // food effects (0.761)
                          - exhaustedSlow()              // out of stamina (0.82501)
                          - TIRED_SLOW * tiredness()     // low on energy (0.832)
                          - SICK_SLOW * (sickness('protein') + sickness('fruit')));   // sick (0.8323)
};
function playerMoveSpeedPct() { return Math.round(playerMoveSpeedMul() * 100); }
/* Jump strength (0.756): a multiplier on jump HEIGHT. No gear grants it yet, but it has its own stat line
   and the jump already reads it, so an item only needs a `jumpStrength` field (0.10 = +10%). */
const playerJumpMul = () => Math.max(0.25, 1 + _equipSum('jumpStrength') + _effectSum('jumpStrength')   // effects too: the ice daze (0.839)
  - WET_JUMP * wetness());   // wet, by how soaked (0.8323; 0.8324)
function playerJumpPct() { return Math.round(playerJumpMul() * 100); }
/* Crafting speed (0.76): 1 = 100%, the rate every recipe's timeToCraft is written for; 2 crafts twice as
   fast; 0 means you cannot craft at all. Gear adds a `craftSpeed` field (0.25 = +25%). Never negative. */
const playerCraftSpeedMul = () => Math.max(0, 1 + _equipSum('craftSpeed') + _effectSum('craftSpeed')
  + ((typeof hasSkill === 'function' && hasSkill('nimble')) ? 0.1 : 0)   // Nimble Fingers (0.79)   // + food effects (0.761)
  - SICK_FRUIT_CRAFT * sickness('fruit'));                                // fruit sickness (0.8323)
function playerCraftSpeedPct() { return Math.round(playerCraftSpeedMul() * 100); }
// multiplier on swing rate — >1 swings faster, so it DIVIDES the cooldown
const playerAtkSpeedMul = () => Math.max(0.25, 1 + _equipSum('atkSpeed') - SICK_PROTEIN_ATK * sickness('protein'));   // protein sickness (0.8323)
/* Environmental resistances (0.7295). No item grants either yet and nothing reads them for damage
   — they are stat lines the panel reserves, so the gear that will carry them has somewhere to
   show up. Summed as a fraction (0.15 = 15% resisted) and clamped to 100%. */
// gear plus Weathered's 10% (0.79): the one total both the stat panel and anything that reads it use
const _resSum = (field) => _equipSum(field) + ((typeof hasSkill === 'function' && hasSkill('weathered')) ? 0.1 : 0)
  + _effectSum(field)                                          // effects too: the Frozen King's curse -30% cold (0.839)
  - (field === 'coldResist' ? WET_COLD_RES * wetness() : 0);   // wet: up to half the cold resistance gone (0.8323; by % 0.8324)
const _resPct = (field) => Math.round(Math.min(1, Math.max(-1, _resSum(field))) * 100);
function playerColdResist() { return _resPct('coldResist'); }
function playerHeatResist() { return _resPct('heatResist'); }

/* Tooltips for the Stats and Effects lines (0.7611), shown by the inventory cursor — mouse or pad —
   through nearestElement in 20-inventory-ui.js. Keyed by the line's label as the panel prints it. */
const STAT_TIPS = {
  'defense':         'Protection from the armor you wear, out of 100. Every point takes 0.8% off the damage you take, up to 80%.',
  'damage reduced':  'How much of each hit is stopped: 0.8% per armor point up to 80%, plus 10% from Thick Skin.',
  'move speed':      'How fast you walk. Heavy armor slows you down; some food effects speed you up.',
  'strength':        'Bonus damage added to every hit you land.',
  'attack speed':    'How quickly you can swing again. Above 100% the wait between swings is shorter.',
  'cold resistance': 'How much of the cold you shrug off: you cool down more slowly in cold air, and it takes its share off the faster food and protein drain of being chilly or cold, and off the health the cold costs. Below 0% the cold bites harder. Being wet takes 50% off it.',
  'heatstroke resistance': 'How much slower heatstroke builds in hot sun: 25% for a hat (bandana or leather cap, which also lets you get 5°C hotter before it starts), 40% for the full cloth set.',
  'heat resistance': 'How much of the heat you shrug off: you heat up more slowly in hot air, and it takes its share off the faster thirst and fruit drain of being warm or hot, and off the health the heat costs. Below 0% the heat bites harder.',
  'jump strength':   'How high you jump. Standing in snow lowers it.',
  'crafting speed':  'How fast your crafting runs. 200% crafts twice as fast; at 0% you cannot craft at all.',
  'toughness':       'How well you stand your ground. It takes that much off every knockback; at 100% nothing moves you.',
  'hunger depletion': 'How fast you get hungry. 200% means food and over-food drain twice as fast.',
  'oxygen depletion': 'How fast your breath runs out under water. 95% means it lasts a little longer.',
  'stats depletion': 'How fast every bar drains: food, thirst, stamina, oxygen, energy, fruit, vegetables and protein. Slow Burner makes it 95%.',   // 0.828
  'hazard reduction': 'How much less damage falls, lava and cactus do to you.',
  'regen':           'How fast your health heals and your breath comes back, and how much energy and healing food gives you. Rapid regen adds 50%; being tired (energy 20 or less) takes up to 70% off, protein or fruit sickness up to 20% each. Never under 0%.',   // 0.832; oxygen 0.8321; 0.8323
  'mining speed':    'How fast you break blocks with any tool or your hand. Vegetable sickness will take up to 25% off.',   // 0.8323
  'spoil speed':     'How fast the food you carry spoils. Preserver takes 10% off, salt in use 25% (both: 65%). Lower is better.',   // 0.832; salt 25% since 0.8321
  'effect duration': 'How long the good effects of food and potions last, Rapid regen too. Lingering makes it 125%; being wet takes 20% off. Bad effects keep their own length.',   // 0.832
  'visibility reduction': 'How much weaker everything that clouds or shakes your sight is: fog, a sandstorm, murky water, heatstroke\'s blur, nausea\'s sway and the jolt of a hit. Clear Eyes gives 30%.',   // 0.8291
};
const _tipTitle = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function statTipHTML(key) {
  const d = STAT_TIPS[key];
  return d ? `<div class="tipName">${_tipTitle(key)}</div><div class="tipDesc">${d}</div>` : '';
}
// marks every stat line the tooltips know, by its printed label
const _tagStatRows = (html) => html.replace(/<div class="stRow([^"]*)"><span>([^<]+)<\/span>/g,
  (m, cls, label) => (STAT_TIPS[label] ? `<div class="stRow${cls}" data-tip="${label}"><span>${label}</span>` : m));

/* ======================================== effects ======================================== */
// active timed effects — nothing produces them yet, but the panel already lists them
const PLAYER_EFFECTS = [];
/* Everything currently affecting the player, permanent set bonuses first. PLAYER_EFFECTS is still
   the home for genuine TIMED effects; nothing produces one yet. */
function activeEffects() {
  const out = [];
  // cold or hot (0.822) first, then sneaking and climbing (0.8243): they last as long as the state does
  for (const s of stateEffects()) {
    const d = EFFECT_DEFS[s.id];
    out.push({ name: d.name, time: Infinity, good: d.good, desc: s.desc || d.desc, lasts: d.lasts });
  }
  const b = armorSetBonus();
  if (b) out.push({ name: b.name, time: Infinity, good: b.good, desc: b.desc });
  /* boss boost (0.839, 60-bosses.js): for good, through death too. Listed here with what it gives; not on the effect
     bar by the hotbar (0.83915), which is for what comes and goes */
  if (typeof bossBoostLevel === 'function' && bossBoostLevel() > 0) {
    const lv = bossBoostLevel(), d = EFFECT_DEFS.bossBoost;
    out.push({ name: `${d.name} ${lv}`, time: Infinity, good: true, lasts: d.lasts,
               desc: `XP +${Math.round((bossXpMul() - 1) * 100)}% (x${bossXpMul().toFixed(1)}) on everything you earn. ` +
                     `Level ${lv} of ${BOSS_BOOST_MAX}, one for each kind of boss defeated: ${bossBoostNames().join(', ')}.` });
  }
  for (const e of PLAYER_EFFECTS) out.push(e);
  for (const e of player.effects || []) {
    const d = EFFECT_DEFS[e.id];
    // an aura's effect (0.83913, the Frozen King's curse) has no clock to read: it says what keeps it instead
    if (d) out.push({ name: d.name, time: d.aura ? Infinity : Math.ceil(e.left), good: d.good, desc: d.desc, lasts: d.lasts });
  }
  return out;
}
/* Timed effects (0.758). They live on the player, so every split-screen seat has its own list; `left` is
   seconds remaining. A food with `foodEffect` starts one, and eating another restarts the clock rather
   than stacking a second copy. */
const EFFECT_DEFS = {
  // `icon`: what the effect bar beside the hotbar shows for it (0.797) — an emoji until each has a sprite
  rapidRegen:   { name: 'Rapid regen',   time: 20, good: true, regen: 0.5, icon: '💖',              // golden apple; 8s until 0.7992
                  desc: 'Regen +50%: health heals half as fast again, and food heals and gives energy half as much again.' },   // +50% since 0.832 (x2 before)
  // cooked pumpkin pie (0.761): +20% crafting speed and +5% move speed
  spicyPumpkin: { name: 'Spicy pumpkin', time: 10, good: true, craftSpeed: 0.20, moveSpeed: 0.05, icon: '🌶️',
                  desc: 'Crafting speed +20% and move speed +5%.' },
  // raw food, rotten flesh (0.761): hunger drains twice as fast and the view sways (22-main-loop.js)
  nausea:       { name: 'Nausea',        time: 10, good: false, hungerMul: 2, sway: true, icon: '🤢',
                  desc: 'Hunger drains twice as fast, and your view sways and drifts.' },
  /* yellow berries (0.7947): 2.5 health a second, 25 over the whole of it (x5 in 0.82). A slow drip, so armor
     does not soak it (that needs 2.5 in one frame, 19-vitals.js), and it stops at VITAL_K: poison alone
     never kills you. */
  poison:       { name: 'Poison',        time: 10, good: false, poisonDps: 0.5 * VITAL_K, announce: 'You feel poisoned', icon: '☠️',
                  desc: 'You slowly lose health while it lasts. It cannot take your last 5 health.' },
  /* the temperature's four (0.823; cold and hot alone in 0.822): not timed — they last while the temperature does
     (tempStress); listed and on the bar. `hurts`: a cold or a heat that takes health as well */
  chilly:       { name: 'Chilly', good: false, icon: '🌬️', lasts: 'Lasts while you are colder than 10°C' },
  cold:         { name: 'Cold',   good: false, icon: '🥶', lasts: 'Lasts while you are colder than -5°C', hurts: 'froze to death' },
  warm:         { name: 'Warm',   good: false, icon: '☀️', lasts: 'Lasts while you are warmer than 30°C' },
  hot:          { name: 'Hot',    good: false, icon: '🥵', lasts: 'Lasts while you are warmer than 45°C', hurts: 'died of the heat' },
  /* the sun and the desert wind (0.825): shown while they last, with how far they have got */
  heatstroke:   { name: 'Heatstroke', good: false, icon: '😵', lasts: 'Builds in hot sun. Goes down in shade or at night, faster under a roof, fastest in water' },
  sandstorm:    { name: 'Sandstorm',  good: false, icon: '🌪️', lasts: 'Lasts while the storm reaches you: a roof or a cave stops it' },
  exhausted:    { name: 'Exhausted', good: false, icon: '😫', lasts: `Lasts until your stamina is back to ${STAMINA_BACK}` },   // 0.82501
  tired:        { name: 'Tired', good: false, icon: '🥱', lasts: `Lasts while your energy is ${TIRED_AT}% or less: sleep in a bed` },   // 0.832
  // running low on a food group (0.8323): shown with how much is left
  proteinSick:  { name: 'Protein sickness', good: false, icon: '🍖', lasts: `Lasts while your protein is ${SICK_AT} or less: eat meat or fish`, hurts: 'wasted away' },
  fruitSick:    { name: 'Fruit sickness',   good: false, icon: '🍎', lasts: `Lasts while your fruit is ${SICK_AT} or less: eat fruit or berries`, hurts: 'wasted away' },
  vegSick:      { name: 'Vegetable sickness', good: false, icon: '🥕', lasts: `Lasts while your vegetables are ${SICK_AT} or less` },
  wet:          { name: 'Wet', good: false, icon: '💧', lasts: 'Dries a second a second; faster near a fire, lava, a torch, in a desert or warm' },   // 0.8323
  // salt among your food (0.832): shown with how long the salt in use keeps it
  salted:       { name: 'Salted', good: true, icon: '🧂', lasts: 'Lasts while the salt in use lasts; the next salt you carry goes in when it runs out' },
  /* what you are doing (0.8243): shown while it lasts, like the temperature (stateEffects) */
  sneaking:     { name: 'Sneaking', good: true, icon: '🐾', lasts: 'Lasts while you sneak',
                  desc: "You do not step off an edge, and your stamina comes back 20% faster." },
  // your crafting queue running (0.83914): shown, never lifted by milk nor shortened, gone when the last craft is done
  crafting:     { name: 'Crafting', good: false, icon: '🔨', lasts: 'Lasts while your crafting queue runs: it ends when the last craft is done. Milk does not lift it.' },
  climbing:     { name: 'Climbing', good: false, icon: '🧗', lasts: 'Lasts while you climb a wall',
                  desc: `Climbing a bare wall costs ${STAMINA_CLIMB_PER_S} stamina a second, and energy with it. Run dry and you let go until it is back to ${STAMINA_BACK}.` },
};
// the effects of what you are doing right now (0.8243), as [{ id, desc? }]: the temperature, sneaking, climbing
function stateEffects(p = player) {
  const out = [];
  if (p.canFly || p.dead) return out;
  const st = tempStress(p);
  if (st) out.push({ id: st.kind, desc: _stressDesc(st), label: Math.round(p.temp) + '°' });
  // heatstroke and a sandstorm (0.825)
  if (p.heatstroke >= 1) out.push({ id: 'heatstroke', desc: _hsDesc(p), label: Math.floor(p.heatstroke) + '%' });
  if (p._sandFelt > 0.05) out.push({ id: 'sandstorm', label: Math.round(p._sandFelt * 100) + '%',
    desc: `You walk ${Math.round(SAND_SLOW * p._sandFelt * 100)}% slower and lose ${((p._movingH > 0.001 ? SAND_STAMINA_MOVING_PER_S : SAND_STAMINA_PER_S) * p._sandFelt).toFixed(1)} stamina a second.` +
          (playerSandResist() ? ` ${Math.round(playerSandResist() * 100)}% resisted.` : '') });
  if (playerTired(p)) out.push({ id: 'exhausted', desc: `You move ${Math.round(exhaustedSlow(p) * 100)}% slower and cannot sprint, jump or climb.` +
    (p._exhaustT >= EXHAUST_HURT_AFTER ? ` You lose ${EXHAUST_HURT_DPS} health a second.` : ` After ${EXHAUST_HURT_AFTER} s of it you lose health too.`) });   // 0.82501
  // low on energy (0.832)
  const tr = tiredness(p);
  if (tr > 0) out.push({ id: 'tired', label: Math.round(p.energy) + '', desc: `Regen ${Math.round(TIRED_REGEN * tr * 100)}% slower, ` +
    `every bar drains ${Math.round(TIRED_DEPLETION * tr * 100)}% faster and you move ${Math.round(TIRED_SLOW * tr * 100)}% slower.` });
  // low on a food group (0.8323): protein, fruit (vegetables when switched on)
  const sickLine = (k, name) => {
    const f = sickness(k, p);
    return `${name}: regen ${Math.round(SICK_REGEN * f * 100)}% less, every bar drains ${Math.round(SICK_DEPLETION * f * 100)}% faster, ` +
           `you move ${Math.round(SICK_SLOW * f * 100)}% slower` + ((p[k] ?? 1) <= 0 ? `, and you lose ${SICK_HP_PER_S} health a second` : '');
  };
  if (sickness('protein', p) > 0) out.push({ id: 'proteinSick', label: Math.round(p.protein) + '',
    desc: sickLine('protein', 'Low protein') + `; attack speed ${Math.round(SICK_PROTEIN_ATK * sickness('protein', p) * 100)}% less and ${Math.round(SICK_PROTEIN_STR * sickness('protein', p))} strength less.` });
  if (sickness('fruit', p) > 0) out.push({ id: 'fruitSick', label: Math.round(p.fruit) + '',
    desc: sickLine('fruit', 'Low fruit') + `; thirst drains ${Math.round(SICK_FRUIT_THIRST * sickness('fruit', p) * 100)}% faster and crafting is ${Math.round(SICK_FRUIT_CRAFT * sickness('fruit', p) * 100)}% slower.` });
  if (sickness('veg', p) > 0) out.push({ id: 'vegSick', label: Math.round(p.veg) + '',
    desc: `Low vegetables: fog and sand cloud your sight ${Math.round(SICK_VEG_SIGHT * sickness('veg', p) * 100)}% more, and you mine ${Math.round(SICK_VEG_MINING * sickness('veg', p) * 100)}% slower.` });
  // wet (0.8323): its time left
  // ...its time once soaked through, else how soaked it is (0.8324)
  if (playerWet(p)) { const w = wetness(p); out.push({ id: 'wet',
    label: p._wetT > 0 ? (p._wetT >= 60 ? Math.ceil(p._wetT / 60) + 'm' : Math.ceil(p._wetT) + 's') : Math.round(w * 100) + '%',
    desc: `Soaked ${Math.round(w * 100)}%` + (p._wetT > 0 ? ` for ${Math.ceil(p._wetT)} s more` : '') + `: jump strength ${(WET_JUMP * w * 100).toFixed(1)}% less, ` +
          `effects last ${Math.round(WET_EFFECT_TIME * w * 100)}% shorter, cold resistance ${Math.round(WET_COLD_RES * w * 100)}% less.` }); }
  // the salt keeping your food (0.832, 44-spoil.js): its time left, minutes past one
  if (p._saltT > 0) out.push({ id: 'salted', label: p._saltT >= 60 ? Math.ceil(p._saltT / 60) + 'm' : Math.ceil(p._saltT) + 's',
    desc: `Food you carry spoils ${Math.round(SALT_SLOW * 100)}% slower while it lasts (${Math.ceil(p._saltT / 60)} min).` });
  if (p.sneaking) out.push({ id: 'sneaking' });
  if (p._wallClimbing) out.push({ id: 'climbing' });
  // the crafting queue (0.83914, 25-crafting.js): what it costs you while it runs, and how long it still has
  if (p === player && typeof playerIsCrafting === 'function' && playerIsCrafting()) {
    const s = typeof craftQueueLeft === 'function' ? craftQueueLeft() : 0;
    out.push({ id: 'crafting', label: s >= 60 ? Math.ceil(s / 60) + 'm' : Math.ceil(s) + 's',
      desc: `Walk speed -${Math.round((1 - craftMoveMul()) * 100)}%. Jump strength -${Math.round((1 - CRAFT_JUMP_MUL) * 100)}%. No sprinting.` +
            ` ${Math.ceil(s)} s of crafting left.` });
  }
  return out;
}
/* The body's temperature (player.temp, °C) against four lines (0.823):
     under 10 chilly, under -5 cold: food and protein drain faster
     over 30 warm,    over 45 hot:   thirst and fruit drain faster
   Chilly and warm run from 1x at their line to TEMP_MILD_MAX at the next; cold and hot from there on up to
   TEMP_HARSH_MAX TEMP_HARSH_SPAN degrees further, and also drain health (TEMP_HURT_DPS..., 0.8243). Resistance cuts both. */
const TEMP_CHILLY_AT = 10, TEMP_COLD_AT = -5, TEMP_WARM_AT = 30, TEMP_HOT_AT = 45;
const TEMP_MILD_MAX = 1.5, TEMP_HARSH_MAX = 2.5, TEMP_HARSH_SPAN = 20;
/* Cold and hot take health as a slow drain by how far past their line you are (0.8243; 5 every 6 s flat before):
   TEMP_HURT_DPS at the line, TEMP_HURT_DPS_PER_DEG more each degree on, up to TEMP_HURT_DPS_MAX — a second. */
const TEMP_HURT_DPS = 0.3, TEMP_HURT_DPS_PER_DEG = 0.04, TEMP_HURT_DPS_MAX = 1.5;
/* Resistance (0.8243): cold resistance takes its share off everything the cold does — the faster drain and the
   health it costs — and heat resistance off the heat's. Negative resistance (leather in the heat, cloth in the
   cold) adds to it. `res` is -1..1. */
const tempResist = (cold) => Math.min(1, Math.max(-1, _resSum(cold ? 'coldResist' : 'heatResist')));
function tempStress(p = player) {
  const t = p.temp;
  if (typeof t !== 'number' || p.canFly || p.dead) return null;
  const mild = (past, span) => 1 + Math.min(1, past / span) * (TEMP_MILD_MAX - 1);
  const harsh = (past) => TEMP_MILD_MAX + Math.min(1, past / TEMP_HARSH_SPAN) * (TEMP_HARSH_MAX - TEMP_MILD_MAX);
  let st = null;
  if (t < TEMP_COLD_AT) st = { kind: 'cold', mul: harsh(TEMP_COLD_AT - t), past: TEMP_COLD_AT - t };
  else if (t < TEMP_CHILLY_AT) st = { kind: 'chilly', mul: mild(TEMP_CHILLY_AT - t, TEMP_CHILLY_AT - TEMP_COLD_AT) };
  else if (t > TEMP_HOT_AT) st = { kind: 'hot', mul: harsh(t - TEMP_HOT_AT), past: t - TEMP_HOT_AT };
  else if (t > TEMP_WARM_AT) st = { kind: 'warm', mul: mild(t - TEMP_WARM_AT, TEMP_HOT_AT - TEMP_WARM_AT) };
  if (!st) return null;
  st.res = tempResist(stressIsCold(st));
  st.mul = 1 + (st.mul - 1) * (1 - st.res);
  st.dps = st.past != null ? Math.min(TEMP_HURT_DPS_MAX, TEMP_HURT_DPS + st.past * TEMP_HURT_DPS_PER_DEG) * (1 - st.res) : 0;
  return st;
}
const stressIsCold = (st) => !!st && (st.kind === 'chilly' || st.kind === 'cold');
const _stressDesc = (st) => (stressIsCold(st) ? 'Food and protein' : 'Thirst and fruit') +
  ` drain ${Math.round((st.mul - 1) * 100)}% faster` + (st.dps > 0 ? `, and you lose ${st.dps.toFixed(1)} health a second` : '') +
  ` (${Math.round(player.temp)}°C` + (st.res ? `, ${Math.round(st.res * 100)}% resisted` : '') + ').';
// sum of one numeric field over this player's running effects (0.761)
const _effectSum = (field) => (player.effects || []).reduce((n, e) => n + (EFFECT_DEFS[e.id]?.[field] || 0), 0);
const playerHasEffect = (field) => (player.effects || []).some(e => EFFECT_DEFS[e.id]?.[field]);
// multiplier on hunger and over-food drain: 2 while nauseous
const playerHungerMul = () => (player.effects || []).reduce((m, e) => m * (EFFECT_DEFS[e.id]?.hungerMul || 1), 1);   // Slow Burner left it for the stats depletion (0.828)
/* STATS DEPLETION (0.828): one multiplier on how fast EVERY bar drains — food, thirst, stamina used, oxygen, energy,
   fruit, vegetables, protein. Slow Burner takes 5% off; gear may carry a depletion field later (-0.05 = 5% slower). */
const SLOW_BURNER_MUL = 0.95;
const playerDepletionMul = () => Math.max(0.25, ((typeof hasSkill === 'function' && hasSkill('slowBurner')) ? SLOW_BURNER_MUL : 1)
  + (typeof _equipSum === 'function' ? _equipSum('depletion') : 0)) * (1 + TIRED_DEPLETION * tiredness())   // tired (0.832)
  * (1 + SICK_DEPLETION * (sickness('protein') + sickness('fruit')));   // sick (0.8323)
// how fast your breath runs out under water: 5% slower with Slow Burner (0.7911)
const playerAirMul = () => playerDepletionMul();   // the stats depletion since 0.828
/* REGEN (0.832), a stat: how fast health heals and how much energy food gives, and the instant heal of a food eaten
   while it runs. 100%, plus each running effect's `regen` (Rapid regen +50%; it doubled until 0.832), times what
   tiredness leaves (up to 90% less). */
const playerRegenMul = (p = player) => Math.max(0, 1 + (p.effects || []).reduce((n, e) => n + (EFFECT_DEFS[e.id]?.regen || 0), 0)
                                     - SICK_REGEN * (sickness('protein', p) + sickness('fruit', p)))   // sick (0.8323)
                                     * (1 - TIRED_REGEN * tiredness(p));                                // never under 0 (0.8323)
/* EFFECT DURATION (0.832), a stat: how long a food's or a potion's GOOD effect lasts, 125% with Lingering (0.79),
   Rapid regen included. Bad ones (poison, nausea) keep their own length since 0.8321. */
const playerEffectTimeMul = () => Math.max(0, 1 + ((typeof hasSkill === 'function' && hasSkill('lingering')) ? 0.25 : 0)
  - WET_EFFECT_TIME * wetness());   // wet: up to 20% less, by how soaked (0.8323; 0.8324)
function addPlayerEffect(id, time) {   // time: a food's own length for it (foodEffectTime, 0.8291), else the effect's
  const d = EFFECT_DEFS[id];
  if (!d) return;
  const list = player.effects || (player.effects = []);
  const t = (time || d.time) * (d.good ? playerEffectTimeMul() : 1);   // Lingering (0.79): good effects only (0.8321)
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
  /* Poison (0.7947) drips health away, never below VITAL_K. Since 0.7992 it also LOOKS like damage: the drip
     is gathered up and, every time half an old point (2.5) has gone, the screen flashes red as any other hit
     does — anything else that hurts over time gets the same for free. */
  const dps = _effectSum('poisonDps');
  if (dps > 0 && !player.dead && player.hp > VITAL_K) {
    const before = player.hp;
    player.hp = Math.max(VITAL_K, player.hp - dps * dt);
    player._effDmgAcc = (player._effDmgAcc || 0) + (before - player.hp);
    if (player._effDmgAcc >= 0.5 * VITAL_K) {
      if (typeof hurtFlash === 'function') hurtFlash(player._effDmgAcc / VITAL_K);
      if (typeof fxHearts === 'function') fxHearts(player.pos.x, player.pos.y + 1.3, player.pos.z, false, 1, fxOwner(player));   // 0.8
      if (typeof playSound === 'function') playSound('hit', { gain: 0.3 });
      player._effDmgAcc = 0;
    }
  }
  if (changed && invOpen) buildEquipPanel();
}
/* THE EFFECT BAR (0.797): every running timed effect as a half-size slot right of the hotbar — its icon and
   the seconds left, green-edged when good, red when bad. Per frame, per seat, from the main loop beside the
   chisel slot; it lives INSIDE #hotbar so split screen carries it along, and buildHotbar clearing it is
   fine, this puts it back. Redrawn only when a shown second (or the list) changes. */
function syncEffectBar() {
  if (typeof hotbarEl === 'undefined' || !hotbarEl) return;
  const t = (s) => s >= 60 ? Math.ceil(s / 60) + 'm' : Math.ceil(s) + 's';
  // an aura's effect shows what it is, not a clock that never runs down (0.83913)
  const list = ((!player.canFly && !player.dead && player.effects) || []).map(e => ({ id: e.id, label: EFFECT_DEFS[e.id]?.aura ? EFFECT_DEFS[e.id].aura : t(e.left) }));
  // cold or hot (0.822) first, showing the temperature instead of a clock; sneaking and climbing too (0.8243)
  list.unshift(...stateEffects().map(s => ({ id: s.id, label: s.label || '' })));
  let bar = hotbarEl.querySelector(':scope > .effBar');
  if (!list.length) { if (bar) bar.remove(); return; }
  const chisel = !!hotbarEl.querySelector(':scope > .chiselSlot');   // it sits after the chisel's slot, if that is out
  const key = (chisel ? 'c|' : '|') + list.map(e => e.id + ':' + e.label).join(',');
  if (bar && bar._key === key) return;
  if (!bar) { bar = document.createElement('div'); bar.className = 'effBar'; hotbarEl.appendChild(bar); }
  bar._key = key;
  bar.classList.toggle('afterChisel', chisel);
  bar.innerHTML = list.map(e => {
    const d = EFFECT_DEFS[e.id];
    if (!d) return '';
    // its name and what it does on hover (0.83913: the name alone before)
    const tip = (d.name + (d.desc ? ': ' + d.desc : d.lasts ? ': ' + d.lasts : '')).replace(/"/g, '&quot;');
    return `<div class="effSlot${d.good === false ? ' bad' : ' good'}" title="${tip}">` +
           `<i>${d.icon || '✨'}</i><b>${e.label}</b></div>`;
  }).join('');
}
function effectTipHTML(i) {
  const e = activeEffects()[i];
  if (!e) return '';
  const cls = e.good === false ? ' bad' : '';
  // a timed one with its own `lasts` says where it comes from too (0.83914: the ice daze)
  const left = e.time === Infinity ? (e.lasts || 'Lasts while the full set is worn') : `${e.time}s left` + (e.lasts ? `. ${e.lasts}` : '');   // cold, hot: their own (0.822)
  return `<div class="tipName">${e.name}</div>` + (e.desc ? `<div class="tipSet${cls}">${e.desc}</div>` : '') +
         `<div class="tipDesc">${left}</div>`;
}
