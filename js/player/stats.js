'use strict';
/* player/stats.js: a player's numbers. The vitals and their caps, what food gives (FOOD_NUTRITION), gaining and
   draining a stat, saving, and tickStats: stamina, hunger, thirst, energy, wetness, oxygen.
   Temperature is temperature/; effects are player/effects.js; the getters equipment and skills feed are
   player/stat-getters.js; the bars on screen are ui/vitals-hud.js. */

/* voxiGrof — player stats and effects

   Everything a player's numbers are, and how they rise and fall, lives here. The HUD that draws them, the
   outside hazards (falls, cactus, lava, fire), the armor soak and dying stay in player/hazards.js; the equipment
   panel that lists the stat getters is player/equipment.js.

   VITALS. Health, food, thirst, stamina, energy, fruit, vegetables, protein and oxygen all run 0..100.
   Health and food were out of 20 (ten hearts) until 0.82: VITAL_K is that step, and every hit and heal is
   written in the new scale. Food, thirst, energy, fruit, vegetables and protein each carry an OVER-STAT of up
   to MAX_OVER on top of the bar: a buffer that drains first, 1.5 times as fast (3 until 0.8441) — what food's saturation
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
const MAX_HP = 100, MAX_FOOD = 100, MAX_THIRST = 100, MAX_STAMINA = 200, MAX_ENERGY = 100,   // stamina and oxygen 200
      MAX_NUTRIENT = 100, MAX_AIR = 200;
const MAX_OVER = 50;                                 // every over-stat's ceiling
const MAX_SATURATION = MAX_OVER;                     // food's over-stat, under its old name
// 3x until 0.8441: healing alone emptied over-food in about 13 s
const OVER_DRAIN_MUL = 1.5;                          // an over-stat drains 1.5x as fast as its bar would
// over-food from eating: half of what a food's `foodSat` / `foodSatFull` says (22 updateEating, and the tooltip)
const OVER_FOOD_GAIN = 0.5;
// the player field each bar keeps its over-stat in
const OVER_KEY = { food: 'saturation', thirst: 'thirstO', energy: 'energyO', fruit: 'fruitO', veg: 'vegO', protein: 'proteinO',
                   stamina: 'staminaO' };   // stamina's since 0.821
const VITAL_MAX = { hp: MAX_HP, food: MAX_FOOD, thirst: MAX_THIRST, stamina: MAX_STAMINA, energy: MAX_ENERGY,
                    fruit: MAX_NUTRIENT, veg: MAX_NUTRIENT, protein: MAX_NUTRIENT, air: MAX_AIR };
/* One player's health ceiling. Thick Skin raised it by 10% until 0.791, when it became damage
   reduction instead (armorDamageMultiplier); nothing raises it now, but everything that caps or refills
   health already asks here. */
// ...and Thick Skin's +10 since 0.828 (player/skills.js)
const THICK_SKIN_HP = 10;
const playerMaxHP = (p = player) => MAX_HP + ((typeof hasSkill === 'function' && hasSkill('thickSkin', p)) ? THICK_SKIN_HP : 0);

// food: a slow idle drain, and healing costs it (sprinting and jumping moved to stamina in 0.82)
// the drain times are from a full bar to empty; an over-stat on top lasts longer still
const FOOD_IDLE_PER_S       = 1 / 24;       // 40 min from full standing still (50 in 0.82; 1/150 of 20 before)
const FOOD_REGEN_COST_PER_S = 1.25;         // while health is coming back
const REGEN_FOOD_MIN        = 30;           // health heals above this much food (60 in 0.82)...
const REGEN_FAST_FOOD       = 90;           // ...twice as fast above this...
const REGEN_THIRST_MIN      = 20;           // ...and only above this much thirst (0.82; 30 until 0.821)
const REGEN_HP_PER_S        = 2.5;          // the slow rate
// how long healing waits after a hit, and the shorter wait while Rapid regen runs
const REGEN_HIT_WAIT = 5, REGEN_HIT_WAIT_FAST = 2;
// an empty food or thirst bar hurts in hits, big enough to flash and sound
const EMPTY_HIT = 5, EMPTY_HIT_EVERY_S = 4;
const HUNGRY_WARN = 40, THIRSTY_WARN = 40;  // the feed warns once as a bar drops under these
// thirst: a little faster than food; healing costs some of it too
const THIRST_IDLE_PER_S       = 1 / 12;     // 20 min from full (30 in 0.82)
const THIRST_REGEN_COST_PER_S = 0.6;
// stamina
const STAMINA_SPRINT_PER_S = 7;             // a full bar sprints about 23 s (x1.25 of 200, 0.831; 14 s before)
const STAMINA_JUMP         = 4.25;          // a jump; 60% of it out of a sprint, which carries you (5 until 0.8291)
// swimming, off the bottom: up (a jump in the water) a lot, swimming along a little, treading water a trickle
const STAMINA_SWIM_UP_PER_S = 10, STAMINA_SWIM_PER_S = 1.5, STAMINA_TREAD_PER_S = 0.5;
const STAMINA_CLIMB_PER_S  = 15;            // hands on a bare wall (player/movement.js)
const STAMINA_REGEN_PER_S  = 12;
/* the bar is 200, and everything that spends it spends a quarter more (sprint, jumps, climbing, swimming, a
   sandstorm). Mining costs a little too: about 1 point every 200 frames at 60 fps (MINING_STAMINA_PER_S). */
const STAMINA_USE_MUL = 1.25, MINING_STAMINA_PER_S = 0.3;
const STAMINA_REST_WAIT    = 3;             // seconds after the last use before it starts coming back (1 until 0.826)
const STAMINA_REST_WAIT_TIRED = 5;          // ...and when that use left you exhausted
const STAMINA_SNEAK_MUL    = 1.2;           // sneaking gets it back 20% faster
const STAMINA_BACK         = 20;            // run dry, you are tired until it is back to this
const STAMINA_FOOD_COST = 0.03, STAMINA_THIRST_COST = 0.06;   // per point regained: a full bar (200 since 0.831) is 6 food, 12 thirst (thirst 0.04 until 0.829)
/* regen speeds up the longer you rest and the more is missing. after RAMP_DELAY seconds of it, it
   ramps over the next STAMINA_RAMP_S to STAMINA_RAMP_MAX (+50%); oxygen over AIR_RAMP_S to AIR_RAMP_MAX (+100%).
   What is missing adds up to 40% more from empty, easing to none when full (it slowed to 60% near full until 0.8321).
   A stamina ramp only starts over when stamina is spent, not when you are merely off the ground a moment. */
const REGEN_RAMP_DELAY = 2;
const STAMINA_RAMP_S = 6, STAMINA_RAMP_MAX = 1.5;
const STAMINA_EMPTY_MUL = 1.4, STAMINA_FULL_MUL = 1;
const AIR_RAMP_S = 4, AIR_RAMP_MAX = 2;
const regenRamp = (t, span, max) => 1 + (max - 1) * Math.max(0, Math.min(1, (t - REGEN_RAMP_DELAY) / span));
// energy: 75 min from full (50 until 0.831), almost four days without sleep (DAY_LEN is 20 min); sleep fills it
// every energy cost halved: 150 min from full standing, half for stamina used and health lost
const ENERGY_IDLE_PER_S  = 1 / 90;          // 1/45 until 0.8441
const ENERGY_PER_STAMINA = 0.0125;          // per point of stamina used (0.04 until 0.831, 0.025 until 0.8441)
const ENERGY_PER_HP      = 0.035;           // per point of health lost (0.1 until 0.831, 0.07 until 0.8441)
/* TIRED: at TIRED_AT energy or less (20%) you are tired, the more so the emptier it gets (tiredness 0..1, from
   20 down to 0): regen up to TIRED_REGEN less (health, and energy from food), every bar's depletion up to
   TIRED_DEPLETION more, and you move up to TIRED_SLOW slower. A night in bed fills energy whatever the regen. */
const TIRED_AT = 20, TIRED_REGEN = 0.7, TIRED_DEPLETION = 0.4, TIRED_SLOW = 0.25;   // regen 0.9 until 0.8323
const tiredness = (p = player) => (!p || p.canFly || p.dead) ? 0
  : Math.max(0, Math.min(1, (TIRED_AT - (p.energy ?? MAX_ENERGY)) / TIRED_AT));
// fruit, vegetables, protein: 70 min from full (35 until 0.8323, 40 in 0.82)
const NUTRIENT_PER_S = 1 / 42;
/* SICKNESS: protein or fruit at SICK_AT (20) or less makes you sick, the more so the emptier (0..1 from 20 down
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
/* WET (how it builds since 0.8324). Rain, falling snow or water first soak you from 0 to 100% (p._wetP: water
   in 5 s, rain at WET_RAIN_PCT a second by how hard it falls, snow half that); only then does staying in it add to how
   long you stay wet, up to WET_MAX seconds (WET_MIN at least). Out of it, that time runs down first (a second a second,
   faster near heat or with a warm body: _dryBoost), and then the % dries off at WET_DRY_PCT a second the same way.
   Everything wet does scales with the %: up to 5% less jump strength, 20% shorter effects, 50% less cold resistance.
   Kept in a save (vit.wet, vit.wp). */
const WET_MIN = 5, WET_MAX = 300, WET_WATER_PER_S = 10, WET_RAIN_PER_S = 3, WET_SNOW_PER_S = 1.5;
const WET_WATER_PCT = 0.2, WET_RAIN_PCT = 0.05, WET_SNOW_PCT = 0.025, WET_DRY_PCT = 0.02;   // per second, 0..1
const WET_JUMP = 0.05, WET_EFFECT_TIME = 0.2, WET_COLD_RES = 0.5;
const playerWet = (p = player) => !!p && !p.canFly && (p._wetP || 0) > 0;
const wetness = (p = player) => (!p || p.canFly) ? 0 : Math.max(0, Math.min(1, p._wetP || 0));   // 0..1, scales the effects
// oxygen: 24 s of breath (a 200 bar spent a quarter faster than the old 100 in 15 s); drowning gets worse with each hit
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
  [ITEM.CANTALOUPE_SLICE]: { thirst: 12, fruit: 5, veg: 5 },    // a little of both
  [ITEM.BERRIES]:          { fruit: 6, thirst: 5 },
  [ITEM.BLUE_BERRIES]:     { fruit: 6, thirst: 7.5 },          // 1.5x the thirst
  [ITEM.BLACKBERRIES]:     { fruit: 6, thirst: 5 },
  [ITEM.YELLOW_BERRIES]:   { fruit: 6, thirst: 5 },            // 0.827
  [ITEM.WHITE_BERRIES]:    { fruit: 6, thirst: -5 },           // takes thirst
  [ITEM.PUMPKIN_PIE]:      { veg: 20 },
  [ITEM.COOKED_PUMPKIN_PIE]: { veg: 35 },
  [ITEM.MUSHROOM_STEW]:    { veg: 30, thirst: 20 },              // four mushrooms since 0.821
  [ITEM.MILK_BUCKET]:      { thirst: 30 },                       // a container, not a food group
  [ITEM.WATER_BOTTLE]:     { thirst: 25 },                       // 0.845
  [ITEM.MUTTON]:  { protein: 10 }, [ITEM.COOKED_MUTTON]:  { protein: 25 },
  [ITEM.BEEF]:    { protein: 12 }, [ITEM.COOKED_BEEF]:    { protein: 35 },
  [ITEM.PORK]:    { protein: 12 }, [ITEM.COOKED_PORK]:    { protein: 30 },
  [ITEM.COD]:     { protein: 8 },  [ITEM.COOKED_COD]:     { protein: 20 },
  [ITEM.SALMON]:  { protein: 10 }, [ITEM.COOKED_SALMON]:  { protein: 22 },
  [ITEM.PIKE]:    { protein: 10 }, [ITEM.COOKED_PIKE]:    { protein: 22 },
  [ITEM.CATFISH]: { protein: 12 }, [ITEM.COOKED_CATFISH]: { protein: 25 },
};
// grilled mushrooms (blocks): vegetables, like the stew
for (const id of [B.GRILLED_RED_MUSHROOM, B.GRILLED_BROWN_MUSHROOM, B.GRILLED_BLUE_MUSHROOM, B.GRILLED_BLACK_MUSHROOM,
                  B.GRILLED_WHITE_MUSHROOM, B.GRILLED_YELLOW_MUSHROOM]) FOOD_NUTRITION[id] = { veg: 8 };
for (const id in FOOD_NUTRITION) {
  const p = id >= 256 ? ITEM_PROPS[id] : PROPS[id];
  if (p) Object.assign(p, FOOD_NUTRITION[id]);
}
// a food's props, an item's or a block's (the grilled mushrooms); null for anything not eaten
const foodPropsOf = (id) => {
  if (id == null) return null;
  const p = id >= 256 ? ITEM_PROPS[id] : PROPS[id];
  return p && (p.food > 0 || p.drink) ? p : null;   // a bottle of water: a drink that is no food
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
/* Every bar full. `over` true (a new world, a respawn) also fills every over-stat (thirst's too since
   0.822); false leaves them empty (a switch from creative). */
function fillVitals(p, over = true) {
  p.hp = playerMaxHP(p); p.air = MAX_AIR; p._tired = false;
  for (const k in OVER_KEY) { p[k] = VITAL_MAX[k]; p[OVER_KEY[k]] = over ? MAX_OVER : 0; }
  p.temp = null;                                     // found again from where they stand
  p.heatstroke = 0; p._sandFelt = 0; p._hsStep = 0;  // 0.825
  p._night = null;                                   // a death starts the night's count over
  p._wetT = 0; p._wetP = 0;                         // dry again (the % 0.8324)
}
// what a food does to the new bars (from updateEating, player/eating.js)
function eatNutrition(p, f) {
  for (const k of NUTRITION_KEYS) {
    // energy from food is a regen: the regen stat scales it
    const amt = k === 'energy' && f[k] > 0 ? f[k] * playerRegenMul() : f[k];
    if (amt > 0) gainStat(p, k, amt); else if (amt < 0) drainStat(p, k, -amt);   // white berries
  }
}
/* What a white berry does: every BAD timed effect running (poison, nausea) loses `s` seconds; one that runs
   out goes. Not burning (it did in 0.8271). */
function cleanseEffects(p, s) {
  if (!(s > 0)) return;
  const list = p.effects;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i--)
    if (EFFECT_DEFS[list[i].id]?.good === false && (list[i].left -= s) <= 0) list.splice(i, 1);
  if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
}
/* A night in bed (blocks/bed.js): energy filled, the rest spilling into over-energy, and a little health. the night
   costs a little of the other bars (SLEEP_COST, over-stats first), never taking one under SLEEP_FLOOR — and no longer
   tops food and thirst up to 30 for free. */
const SLEEP_COST = { food: 10, thirst: 15, fruit: 4, veg: 4, protein: 4 }, SLEEP_FLOOR = 10;   // fruit, veg, protein halved
function wakeRested(p) {
  for (const k in SLEEP_COST) {
    const over = p[OVER_KEY[k]] || 0, room = Math.max(0, (p[k] ?? VITAL_MAX[k]) - SLEEP_FLOOR) + over / OVER_DRAIN_MUL;
    drainStat(p, k, Math.min(SLEEP_COST[k], room));
  }
  if (p.hp > 0) p.hp = Math.min(playerMaxHP(p), p.hp + 4 * VITAL_K);
  gainStat(p, 'energy', MAX_ENERGY);
}
// a hit takes some energy with it (from the armor soak, player/hazards.js)
function statsOnHit(p, lost) { drainStat(p, 'energy', lost * ENERGY_PER_HP); }
// out of stamina: no sprint, jump or wall climb until it is back to STAMINA_BACK (22-main-loop.js, player/movement.js)
const playerTired = (p = player) => !p.canFly && !!p._tired;

/* ---- saving ----
   hp, food and saturation stay where saves always had them; the rest ride in `vit`, whose presence also says
   the three are out of 100. A save from before 0.82 has none, and its three are multiplied up. */
function serializeVitals(p) {
  const r = { air: +(p.air ?? MAX_AIR).toFixed(1), stamina: +(p.stamina ?? MAX_STAMINA).toFixed(1), s2: 1 };   // s2: out of 200
  for (const k in OVER_KEY) if (k !== 'food') {
    r[k] = +(p[k] ?? VITAL_MAX[k]).toFixed(2);
    r[OVER_KEY[k]] = +(p[OVER_KEY[k]] || 0).toFixed(2);
  }
  if (p.heatstroke > 0) r.hs = +p.heatstroke.toFixed(1);   // 0.825
  if (p._giveUpCd > 0) r.gu = Math.ceil(p._giveUpCd);      // the pause menu's Respawn cooldown
  if (p._wetT > 0) r.wet = Math.ceil(p._wetT);             // 0.8323
  if (p._wetP > 0) r.wp = +p._wetP.toFixed(3);             // how soaked, 0..1
  const tb = typeof serializeHeldBurn === 'function' ? serializeHeldBurn(p) : null;
  if (tb) r.tb = tb;                                        // the held torches' time left
  return r;
}
function restoreVitals(p, rec) {
  rec = rec || {};
  const v = rec.vit && typeof rec.vit === 'object' ? rec.vit : null, k = v ? 1 : VITAL_K;
  const num = (x) => typeof x === 'number' && isFinite(x);
  const food = rec.food ?? rec.hunger;
  p.hp = num(rec.hp) ? Math.min(MAX_HP + THICK_SKIN_HP, rec.hp * k) : MAX_HP;   // skills may load after this
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
   Once a frame per seat, from updateVitals (player/hazards.js), survival only: effects, stamina, healing, the bars
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
  // timed effects count down first, so one that runs out this frame no longer counts
  tickPlayerEffects(dt);
  _tickHeatstroke(dt); _tickSandstorm(dt);          // 0.825
  _tickWeatherXP(p, dt);                             // 0.8282
  _tickNightXP(p, dt); _tickFeats(p, dt);            // 0.8283
  const dep = playerDepletionMul();                  // every bar's drain (Slow Burner)
  if (p._stamShowT > 0) p._stamShowT = Math.max(0, p._stamShowT - dt);
  if (p._giveUpCd > 0) p._giveUpCd = Math.max(0, p._giveUpCd - dt);   // pause-menu Respawn cooldown (19)
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
  if (inWater && !grounded && !p.flying)              // swimming: no rest in deep water
    used += (p._swimUp ? STAMINA_SWIM_UP_PER_S : moving ? STAMINA_SWIM_PER_S : STAMINA_TREAD_PER_S) * dt;
  if (p._wallClimbing) used += STAMINA_CLIMB_PER_S * dt * (typeof skillClimbMul === 'function' ? skillClimbMul() : 1);   // Climber
  // a sandstorm wears you out, standing or walking
  if (p._sandFelt > 0.05) used += (moving ? SAND_STAMINA_MOVING_PER_S : SAND_STAMINA_PER_S) * p._sandFelt * dt;
  used *= STAMINA_USE_MUL;                         // a quarter more
  if (typeof mining !== 'undefined' && mining.active) used += MINING_STAMINA_PER_S * dt;   // mining
  if (p.stamina == null) p.stamina = MAX_STAMINA;
  used *= dep;                                     // stats depletion
  if (used > 0) {
    p._stamShowT = 2;                              // the bar shows while it is used, over-stamina too
    drainStat(p, 'stamina', used);                 // over-stamina first
    if (p.stamina <= 0) p._tired = true;
    p._stamRestT = p._tired ? STAMINA_REST_WAIT_TIRED : STAMINA_REST_WAIT;   // longer once exhausted
    p._stamRegenT = 0;                              // the rest ramp starts over
    drainStat(p, 'energy', used * ENERGY_PER_STAMINA);
  } else {
    p._stamRestT = Math.max(0, (p._stamRestT || 0) - dt);
    const busy = (typeof mining !== 'undefined' && mining.active) || (!grounded && !inWater);
    if (p.stamina >= MAX_STAMINA) p._stamRegenT = 0;   // a hop or a step down only pauses the ramp
    // on an empty stomach or throat it does not come back at all (at half speed before), as health does not
    const fed = p.food > 0 && p.thirst > 0;
    if (!busy && fed && p._stamRestT <= 0 && p.stamina < MAX_STAMINA) {
      p._stamRegenT = (p._stamRegenT || 0) + dt;    // rest ramp
      const ramp = regenRamp(p._stamRegenT, STAMINA_RAMP_S, STAMINA_RAMP_MAX);   // after 2 s, +50% over 6 s
      const left = Math.max(0, Math.min(1, p.stamina / MAX_STAMINA));
      const need = STAMINA_EMPTY_MUL + (STAMINA_FULL_MUL - STAMINA_EMPTY_MUL) * left;
      const rate = STAMINA_REGEN_PER_S * ramp * need * (p.sneaking ? STAMINA_SNEAK_MUL : 1) * hsm.stamina;   // heatstroke
      const gain = Math.min(MAX_STAMINA - p.stamina, rate * dt);
      p.stamina += gain;
      foodCost += gain * STAMINA_FOOD_COST; thirstCost += gain * STAMINA_THIRST_COST;
    }
  }
  if (p._tired && p.stamina >= STAMINA_BACK) p._tired = false;
  _tickExhausted(p, dt);                            // 0.82501

  /* Health: heals above REGEN_FOOD_MIN food (twice as fast above REGEN_FAST_FOOD) and REGEN_THIRST_MIN thirst,
     costing both; the regen stat scales it (Rapid regen doubled it). Not while poisoned, and not for a few seconds after ANY hit
 so a fight cannot be out-healed — five normally, two with Rapid regen running. */
  const poisoned = playerHasEffect('poisonDps');
  if (p._regenWaitT > 0) p._regenWaitT = Math.max(0, p._regenWaitT - dt);
  if (!poisoned && !(p._regenWaitT > 0) && p.hp < playerMaxHP() && p.food > REGEN_FOOD_MIN && p.thirst > REGEN_THIRST_MIN) {
    const rm = playerRegenMul();
    const rate = REGEN_HP_PER_S * (p.food > REGEN_FAST_FOOD ? 2 : 1) * rm;
    const before = p.hp;
    p.hp = Math.min(playerMaxHP(), p.hp + rate * dt);
    if (typeof fxHealTick === 'function') fxHealTick(p, p.hp - before);   // a green heart per 5 healed
    // the cost follows the regen: a health healed costs the same, so slow healing no longer eats the bars
    foodCost += FOOD_REGEN_COST_PER_S * dt * rm;
    thirstCost += THIRST_REGEN_COST_PER_S * dt * rm;
  }

  /* the bars drain; nausea doubles food's; cold speeds food and protein, heat thirst and fruit (chilly,
     cold, warm, hot 0.823) */
  const st = tempStress(p), cold = stressIsCold(st) ? st.mul : 1, hot = st && !stressIsCold(st) ? st.mul : 1;
  const stSig = stateEffects(p).map(s => s.id).join(',');            // ...and sneaking, climbing
  if (stSig !== p._stressKind) {                                  // it came or went: the Effects list shows it
    p._stressKind = stSig;
    if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
  }
  // ...and heatstroke: thirst and fruit from 20%, food, vegetables and protein from 30%, energy from 50%
  // ...and every bar by the stats depletion (Slow Burner: 5% slower)
  drainStat(p, 'food', foodCost * playerHungerMul() * cold * hsm.food * dep);
  drainStat(p, 'thirst', thirstCost * hot * hsm.thirst * dep * (1 + SICK_FRUIT_THIRST * sickness('fruit', p)));   // fruit sickness
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
  /* cold and hot also hurt: a slow drain by how far past the line, less what you resist. It shows as
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
  _tickSickHurt(p, dt);                              // protein or fruit at 0
  _tickWet(p, dt);                                   // soaked by rain, snow or water

  _tickOxygen(dt);
  _tickTemperature(dt);
  // a lit torch in hand melts the ice within a block of you (iceWarmHeld in seasons/ice.js), looked at twice a second
  p._iceWarmT = (p._iceWarmT || 0) - dt;
  if (p._iceWarmT <= 0) {
    p._iceWarmT = 0.5;
    const held = [HOTBAR[hotbarSel]?.id, typeof offhandItemId === 'function' ? offhandItemId() : null];
    if (held.includes(B.TORCH) && !(typeof torchDoused === 'function' && torchDoused(p)) && typeof iceWarmHeld === 'function')
      iceWarmHeld(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z));
  }
  if (typeof tickHeldBurn === 'function') tickHeldBurn(p, dt);   // a held torch burns down (blocks/torches.js)
}

// protein or fruit run dry: a slow loss of health, SICK_HP_PER_S for each, shown as hits like poison
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
/* How much faster than a second a second you dry, on top of the 1: a torch within 2 blocks or in hand +0.1,
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
// soaked by rain or falling snow on an open head, or by water; dried by time and heat
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
    if (pct < 1) {                                   // first the soaking, to 100%
      p._wetP = Math.min(1, pct + soakPct * dt);
      if (p._wetP >= 1) p._wetT = Math.max(p._wetT || 0, WET_MIN);
    } else p._wetT = Math.min(WET_MAX, Math.max(WET_MIN, (p._wetT || 0) + soak * dt));   // ...then the time
  } else if ((p._wetT || 0) > 0) p._wetT = Math.max(0, p._wetT - dt * dry);   // out of it: the time first...
  else if (pct > 0) p._wetP = Math.max(0, pct - WET_DRY_PCT * dt * dry);      // ...then the % dries off
}
/* MINING SPEED, a stat: how fast you break blocks, 100% to start; effects and gear may carry `miningSpeed`,
   vegetable sickness takes up to 25% (off for now). Never under 0. */
const playerMiningSpeedMul = () => Math.max(0, 1 + _effectSum('miningSpeed') + (typeof _equipSum === 'function' ? _equipSum('miningSpeed') : 0)
  - SICK_VEG_MINING * sickness('veg')) * (playerUnderwater() ? 1 - UNDERWATER_MINING : 1);
/* UNDER WATER: with your head under (the same test as the oxygen, _tickOxygen) you break blocks
   UNDERWATER_MINING slower. Shown as the Underwater effect while it lasts (stateEffects) and in the mining speed stat. */
const UNDERWATER_MINING = 0.75;
const playerUnderwater = (p = player) => !!p._eyeUnder && !p.flying && !p.canFly && !p.dead;
// how strongly fog and sand cloud your sight: Clear Eyes 30% less, vegetable sickness up to 25% more (off)
const playerSightMul = () => (typeof skillSightMul === 'function' ? skillSightMul() : 1) * (1 + SICK_VEG_SIGHT * sickness('veg'));

/* Oxygen. Eyes under water drain it at AIR_DRAIN_PER_S (5% slower with Slow Burner); at 0 you drown, each hit
   harder than the last until you are out. Out of the water it comes back fast when empty, easing off
   as it fills. The clocks are ON THE PLAYER: this runs once per seat. */
function _tickOxygen(dt) {
  const p = player;
  const eyeUnder = (getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + p.EYE), Math.floor(p.pos.z)) & 255) === B.WATER;
  p._eyeUnder = eyeUnder;
  if (eyeUnder && !p.flying) {
    p._airRegenT = 0;                               // 0.829
    p.air = Math.max(0, p.air - dt * AIR_DRAIN_PER_S * playerAirMul());
    // low-oxygen warning: once per dive
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
    // ...and faster still the longer you breathe: after 2 s, up to x2 over AIR_RAMP_S (the wait 0.8321)
    p._airRegenT = p.air < MAX_AIR ? (p._airRegenT || 0) + dt : 0;
    const ramp = regenRamp(p._airRegenT, AIR_RAMP_S, AIR_RAMP_MAX);
    // ...and by the regen stat: Rapid regen, tiredness
    p.air = Math.min(MAX_AIR, p.air + dt * ramp * playerRegenMul(p) * (AIR_REGEN_EMPTY + (AIR_REGEN_FULL - AIR_REGEN_EMPTY) * k));
    p._drownHits = 0;
    if (p.air >= AIR_WARN) p._warnAir = false;
    p._drownT = 0;
  }
}
