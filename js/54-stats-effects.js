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
const MAX_HP = 100, MAX_FOOD = 100, MAX_THIRST = 100, MAX_STAMINA = 100, MAX_ENERGY = 100,
      MAX_NUTRIENT = 100, MAX_AIR = 100;
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
const playerMaxHP = (p = player) => MAX_HP;

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
const STAMINA_SPRINT_PER_S = 7;             // a full bar sprints about 14 s
const STAMINA_JUMP         = 5;             // a jump; 60% of it out of a sprint, which carries you
const STAMINA_CLIMB_PER_S  = 15;            // hands on a bare wall (12-player.js)
const STAMINA_REGEN_PER_S  = 12;
const STAMINA_REST_WAIT    = 1;             // seconds after the last use before it starts coming back
const STAMINA_SNEAK_MUL    = 1.2;           // sneaking gets it back 20% faster
const STAMINA_BACK         = 20;            // run dry, you are tired until it is back to this
const STAMINA_FOOD_COST = 0.03, STAMINA_THIRST_COST = 0.04;   // per point regained: a full bar is 3 food, 4 thirst
// energy: 50 min from full, two and a half days without sleep (DAY_LEN is 20 min); sleep fills it (0.821)
const ENERGY_IDLE_PER_S  = 1 / 30;
const ENERGY_PER_STAMINA = 0.04;            // per point of stamina used
const ENERGY_PER_HP      = 0.1;             // per point of health lost
// fruit, vegetables, protein: 35 min from full (40 in 0.82); nothing uses them yet
const NUTRIENT_PER_S = 1 / 21;
// oxygen: 15 s of breath; drowning gets worse with each hit (0.7573)
const AIR_DRAIN_S = 15, AIR_WARN = 30;
const DROWN_DMG_BASE = 10, DROWN_DMG_STEP = 5;
const AIR_REGEN_EMPTY = 30, AIR_REGEN_FULL = 6;   // points a second back when empty, easing to this near full

/* What each food gives besides food itself. 0.821 follows the folders its picture sits in
   (textures/Items/Consumables/<Fruits|Vege|Protein|Others>): fruit gives fruit, vegetables vegetables, meat and
   fish protein, and "Others" (bread, cantaloupe, rotten flesh) none of the three; juicy food gives thirst too.
   Merged into the item's (or, for a grilled mushroom, the block's) props, so tooltips read it as well. */
const FOOD_NUTRITION = {
  [ITEM.APPLE]:            { fruit: 25, thirst: 8 },
  [ITEM.GOLDEN_APPLE]:     { fruit: 30, thirst: 5 },
  [ITEM.MELON_SLICE]:      { fruit: 10, thirst: 15 },
  [ITEM.CANTALOUPE_SLICE]: { thirst: 12, fruit: 5, veg: 5 },    // a little of both (0.822)
  [ITEM.BERRIES]:          { fruit: 6, thirst: 5 },
  [ITEM.BLUE_BERRIES]:     { fruit: 6, thirst: 5 },
  [ITEM.YELLOW_BERRIES]:   { fruit: 6, thirst: 5 },
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
const NUTRITION_KEYS = ['thirst', 'fruit', 'veg', 'protein'];

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
}
// what a food does to the new bars (from updateEating, 22-main-loop.js)
function eatNutrition(p, f) {
  for (const k of NUTRITION_KEYS) if (f[k]) gainStat(p, k, f[k]);
}
// a night in bed (29-bed.js): energy filled, the rest spilling into over-energy; nobody wakes up starving
function wakeRested(p) {
  p.food = Math.max(p.food, 30);
  p.thirst = Math.max(p.thirst ?? MAX_THIRST, 30);
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
  const r = { air: +(p.air ?? MAX_AIR).toFixed(1), stamina: +(p.stamina ?? MAX_STAMINA).toFixed(1) };
  for (const k in OVER_KEY) if (k !== 'food') {
    r[k] = +(p[k] ?? VITAL_MAX[k]).toFixed(2);
    r[OVER_KEY[k]] = +(p[OVER_KEY[k]] || 0).toFixed(2);
  }
  return r;
}
function restoreVitals(p, rec) {
  rec = rec || {};
  const v = rec.vit && typeof rec.vit === 'object' ? rec.vit : null, k = v ? 1 : VITAL_K;
  const num = (x) => typeof x === 'number' && isFinite(x);
  const food = rec.food ?? rec.hunger;
  p.hp = num(rec.hp) ? Math.min(MAX_HP, rec.hp * k) : MAX_HP;
  p.food = num(food) ? Math.min(MAX_FOOD, food * k) : MAX_FOOD;
  p.saturation = num(rec.saturation) ? Math.min(MAX_SATURATION, rec.saturation * k) : MAX_SATURATION;
  const o = v || {};
  p.air = num(o.air) ? Math.min(MAX_AIR, o.air) : MAX_AIR;
  p.stamina = num(o.stamina) ? Math.min(MAX_STAMINA, o.stamina) : MAX_STAMINA;
  p._tired = false;
  for (const key in OVER_KEY) if (key !== 'food') {
    p[key] = num(o[key]) ? Math.min(VITAL_MAX[key], o[key]) : VITAL_MAX[key];
    p[OVER_KEY[key]] = num(o[OVER_KEY[key]]) ? Math.min(MAX_OVER, o[OVER_KEY[key]]) : 0;
  }
  p.temp = null;
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
  if (p._wallClimbing) used += STAMINA_CLIMB_PER_S * dt;
  if (p.stamina == null) p.stamina = MAX_STAMINA;
  if (used > 0) {
    drainStat(p, 'stamina', used);                 // over-stamina first (0.821)
    p._stamRestT = STAMINA_REST_WAIT;
    if (p.stamina <= 0) p._tired = true;
    drainStat(p, 'energy', used * ENERGY_PER_STAMINA);
  } else {
    p._stamRestT = Math.max(0, (p._stamRestT || 0) - dt);
    const busy = (typeof mining !== 'undefined' && mining.active) || (!grounded && !inWater);
    if (!busy && p._stamRestT <= 0 && p.stamina < MAX_STAMINA) {
      const fed = p.food > 0 && p.thirst > 0;       // on an empty stomach or throat it still comes, at half
      const rate = STAMINA_REGEN_PER_S * (p.sneaking ? STAMINA_SNEAK_MUL : 1) * (fed ? 1 : 0.5);
      const gain = Math.min(MAX_STAMINA - p.stamina, rate * dt);
      p.stamina += gain;
      if (fed) { foodCost += gain * STAMINA_FOOD_COST; thirstCost += gain * STAMINA_THIRST_COST; }
    }
  }
  if (p._tired && p.stamina >= STAMINA_BACK) p._tired = false;

  /* Health: heals above REGEN_FOOD_MIN food (twice as fast above REGEN_FAST_FOOD) and REGEN_THIRST_MIN thirst,
     costing both; Rapid regen doubles it. Not while poisoned (0.797), and not for a few seconds after ANY hit
     (0.7992) so a fight cannot be out-healed — five normally, two with Rapid regen running. */
  const poisoned = playerHasEffect('poisonDps');
  if (p._regenWaitT > 0) p._regenWaitT = Math.max(0, p._regenWaitT - dt);
  if (!poisoned && !(p._regenWaitT > 0) && p.hp < playerMaxHP() && p.food > REGEN_FOOD_MIN && p.thirst > REGEN_THIRST_MIN) {
    const rate = REGEN_HP_PER_S * (p.food > REGEN_FAST_FOOD ? 2 : 1) * playerRegenMul();
    const before = p.hp;
    p.hp = Math.min(playerMaxHP(), p.hp + rate * dt);
    if (typeof fxHealTick === 'function') fxHealTick(p, p.hp - before);   // a green heart per 5 healed
    foodCost += FOOD_REGEN_COST_PER_S * dt;
    thirstCost += THIRST_REGEN_COST_PER_S * dt;
  }

  /* the bars drain; nausea doubles food's (0.761); cold speeds food and protein, heat thirst and fruit (0.822; chilly,
     cold, warm, hot 0.823) */
  const st = tempStress(p), cold = stressIsCold(st) ? st.mul : 1, hot = st && !stressIsCold(st) ? st.mul : 1;
  if ((st && st.kind) !== p._stressKind) {                        // it came or went: the Effects list shows it
    p._stressKind = st && st.kind;
    if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
  }
  drainStat(p, 'food', foodCost * playerHungerMul() * cold);
  drainStat(p, 'thirst', thirstCost * hot);
  drainStat(p, 'energy', ENERGY_IDLE_PER_S * dt);
  drainStat(p, 'fruit', NUTRIENT_PER_S * dt * hot);
  drainStat(p, 'veg', NUTRIENT_PER_S * dt);
  drainStat(p, 'protein', NUTRIENT_PER_S * dt * cold);
  if (!p.canFly) {
    _warnLow(p, 'food', '_warnFood', HUNGRY_WARN, `Hungry: under ${HUNGRY_WARN} food left, eat something`);
    _warnLow(p, 'thirst', '_warnThirst', THIRSTY_WARN, `Thirsty: under ${THIRSTY_WARN} thirst left, drink something`);
  }
  _emptyHits(p, dt, 'food', '_starveT', 'starved to death', 'Starving: losing health, eat something');
  _emptyHits(p, dt, 'thirst', '_thirstT', 'died of thirst', 'Dehydrated: losing health, drink something');
  // cold and hot also hurt (0.823): TEMP_HURT every TEMP_HURT_EVERY_S while they last
  const hurts = st && EFFECT_DEFS[st.kind].hurts;
  if (hurts) {
    p._tempHurtT = (p._tempHurtT || 0) + dt;
    if (p._tempHurtT >= TEMP_HURT_EVERY_S) {
      p._tempHurtT = 0;
      p.hp = Math.max(0, p.hp - TEMP_HURT);
      p._dmgCause = hurts;
      if (typeof feedCrit === 'function')
        feedCrit(st.kind === 'cold' ? 'Freezing: losing health, find warmth' : 'Overheating: losing health, find shade or water');
    }
  } else p._tempHurtT = 0;

  _tickOxygen(dt);
  _tickTemperature(dt);
}

/* Oxygen. Eyes under water drain it over AIR_DRAIN_S (5% slower with Slow Burner); at 0 you drown, each hit
   harder than the last (0.7573) until you are out. Out of the water it comes back fast when empty, easing off
   as it fills. The clocks are ON THE PLAYER (0.734): this runs once per seat. */
function _tickOxygen(dt) {
  const p = player;
  const eyeUnder = (getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + p.EYE), Math.floor(p.pos.z)) & 255) === B.WATER;
  p._eyeUnder = eyeUnder;
  if (eyeUnder && !p.flying) {
    p.air = Math.max(0, p.air - dt * (MAX_AIR / AIR_DRAIN_S) * playerAirMul());
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
    p.air = Math.min(MAX_AIR, p.air + dt * (AIR_REGEN_EMPTY + (AIR_REGEN_FULL - AIR_REGEN_EMPTY) * k));
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
const TEMP_PEAK_DAY = 6.5 * MONTH_DAYS;            // mid July, in days from 1 January
const TEMP_SNOW = -16, TEMP_HOT = 14;              // deep inside a snow biome, a desert
const TEMP_DAY_AMP = 5;                            // the day's swing either way; a desert doubles it
const TEMP_LAPSE_FROM = 110, TEMP_LAPSE = 0.12;    // colder by this a block above that height
const TEMP_CAVE = 12;
const TEMP_WEATHER = { clear: 0, sunny: 2, cloudy: -1, windy: -1, rainy: -3, darky: -2, storm: -5, foggy: -1.5 };
const TEMP_WATER = -6, TEMP_ON_FIRE = 25;
// heat right beside a source, fading with distance, summed over HEAT_R blocks around you
const HEAT_OF = new Float32Array(256);
HEAT_OF[B.LAVA] = 30; HEAT_OF[B.FIRE] = 20; HEAT_OF[B.TORCH] = 3;
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
function ambientTemp(p) {
  const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z), y = Math.floor(p.pos.y + 1);
  const d = gameDate(), dayFrac = worldTime - Math.floor(worldTime);
  const doy = d.month * MONTH_DAYS + d.day - 1 + dayFrac;
  let t = TEMP_MEAN + TEMP_SWING * Math.cos(2 * Math.PI * (doy - TEMP_PEAK_DAY) / (12 * MONTH_DAYS));
  const c = mainGen && mainGen.climateAt ? mainGen.climateAt(x, z) : { snow: 0, hot: 0, h: y };
  t += c.air != null ? c.air : TEMP_SNOW * c.snow + TEMP_HOT * c.hot;   // a ladder world: its level's air (0.8232, 55-biomes.js)
  const open = getSkyWorld(x, Math.floor(p.pos.y + p.EYE), z) / 15;   // how much sky is over you
  const w = weatherAt(p.pos.x, p.pos.z, p.pos.y);
  const overcast = !(w.type === 'clear' || w.type === 'sunny' || w.type === 'windy');
  const hour = (6 + dayFrac * 24) % 24;
  t += TEMP_DAY_AMP * (1 + c.hot) * (overcast ? 0.5 : 1) * (0.4 + 0.6 * open) * Math.cos(2 * Math.PI * (hour - 15) / 24);
  t += ((TEMP_WEATHER[w.type] || 0) - Math.max(0, w.speed - 10) * 0.1) * open;   // wind chill past 10 km/h
  t -= Math.max(0, y - TEMP_LAPSE_FROM) * TEMP_LAPSE;
  const deep = Math.max(0, Math.min(1, (c.h - y - 2) / 12)) * (1 - open);
  t += (TEMP_CAVE - t) * deep;
  if (p._inWater) t += TEMP_WATER;
  t += _heatNear(x, Math.floor(p.pos.y), z);
  if (p.fireT > 0) t += TEMP_ON_FIRE;
  return Math.max(-50, Math.min(90, t));
}
function _tickTemperature(dt) {
  const p = player;
  p._tempT = (p._tempT || 0) - dt;
  if (p._tempT <= 0 || p._tempAim == null) { p._tempT = TEMP_SAMPLE_S; p._tempAim = ambientTemp(p); }
  if (typeof p.temp !== 'number') p.temp = p._tempAim;
  p.temp += (p._tempAim - p.temp) * (1 - Math.exp(-dt / (p._inWater ? TEMP_EASE_WATER_S : TEMP_EASE_S)));
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
  stamina: ['Stamina',    'Sprinting, jumping and climbing use it. It comes back at rest, 20% faster sneaking, costing food and thirst. Run dry, you cannot sprint, jump or climb until it is back to 20.'],
  energy:  ['Energy',     'Drops over time, faster when you use stamina or get hurt. A night in bed fills it.'],
  fruit:   ['Fruit',      'Drops over time. Apples, berries and melons fill it.'],
  veg:     ['Vegetables', 'Drops over time. Pumpkin pie and mushroom stew fill it.'],
  protein: ['Protein',    'Drops over time. Meat, fish and milk fill it.'],
  air:     ['Oxygen',     'Runs out while your head is under water. At 0 you drown.'],
  temp:    ['Temperature', 'The season, the hour, the biome, height, weather, water and fire around you all move it. Under 10°C you are chilly and under -5°C cold: food and protein drain faster. Over 30°C you are warm and over 45°C hot: thirst and fruit do. Cold and hot also cost health.'],
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
    rows = row('now', `${n(p[key] ?? 0)} / ${VITAL_MAX[key]}`);
    if (OVER_KEY[key]) rows += row('over', `${n(p[OVER_KEY[key]] || 0)} / ${MAX_OVER}`);
  }
  return `<div class="tipName">${inf[0]}</div><div class="tipStats">${rows}</div><div class="tipDesc">${inf[1]}</div>`;
}

/* ===================================== stat getters ===================================== */
// flat bonus damage added on top of the held weapon (iron gloves = +0.75)
function playerStrength() { return _equipSum('strength'); }
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
                          + _effectSum('moveSpeed'));   // food effects (0.761)
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

/* Tooltips for the Stats and Effects lines (0.7611), shown by the inventory cursor — mouse or pad —
   through nearestElement in 20-inventory-ui.js. Keyed by the line's label as the panel prints it. */
const STAT_TIPS = {
  'defense':         'Protection from the armor you wear, out of 100. Every point takes 0.8% off the damage you take, up to 80%.',
  'damage reduced':  'How much of each hit is stopped: 0.8% per armor point up to 80%, plus 10% from Thick Skin.',
  'move speed':      'How fast you walk. Heavy armor slows you down; some food effects speed you up.',
  'strength':        'Bonus damage added to every hit you land.',
  'attack speed':    'How quickly you can swing again. Above 100% the wait between swings is shorter.',
  'cold resistance': 'How much cold you shrug off. Nothing in the world is cold enough to hurt yet.',
  'heat resistance': 'How much heat you shrug off. Nothing in the world is hot enough to hurt yet.',
  'jump strength':   'How high you jump. Standing in snow lowers it.',
  'crafting speed':  'How fast your crafting runs. 200% crafts twice as fast; at 0% you cannot craft at all.',
  'toughness':       'How well you stand your ground. It takes that much off every knockback; at 100% nothing moves you.',
  'hunger depletion': 'How fast you get hungry. 200% means food and over-food drain twice as fast.',
  'oxygen depletion': 'How fast your breath runs out under water. 95% means it lasts a little longer.',
  'hazard reduction': 'How much less damage falls, lava and cactus do to you.',
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
  // cold or hot (0.822) first: it lasts as long as the temperature does
  const st = tempStress();
  if (st) {
    const d = EFFECT_DEFS[st.kind];
    out.push({ name: d.name, time: Infinity, good: false, desc: _stressDesc(st), lasts: d.lasts });
  }
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
};
/* The body's temperature (player.temp, °C) against four lines (0.823):
     under 10 chilly, under -5 cold: food and protein drain faster
     over 30 warm,    over 45 hot:   thirst and fruit drain faster
   Chilly and warm run from 1x at their line to TEMP_MILD_MAX at the next; cold and hot from there on up to
   TEMP_HARSH_MAX TEMP_HARSH_SPAN degrees further, and also take TEMP_HURT health every TEMP_HURT_EVERY_S. */
const TEMP_CHILLY_AT = 10, TEMP_COLD_AT = -5, TEMP_WARM_AT = 30, TEMP_HOT_AT = 45;
const TEMP_MILD_MAX = 1.5, TEMP_HARSH_MAX = 2.5, TEMP_HARSH_SPAN = 20;
const TEMP_HURT = 5, TEMP_HURT_EVERY_S = 6;
function tempStress(p = player) {
  const t = p.temp;
  if (typeof t !== 'number' || p.canFly || p.dead) return null;
  const mild = (past, span) => 1 + Math.min(1, past / span) * (TEMP_MILD_MAX - 1);
  const harsh = (past) => TEMP_MILD_MAX + Math.min(1, past / TEMP_HARSH_SPAN) * (TEMP_HARSH_MAX - TEMP_MILD_MAX);
  if (t < TEMP_COLD_AT) return { kind: 'cold', mul: harsh(TEMP_COLD_AT - t) };
  if (t < TEMP_CHILLY_AT) return { kind: 'chilly', mul: mild(TEMP_CHILLY_AT - t, TEMP_CHILLY_AT - TEMP_COLD_AT) };
  if (t > TEMP_HOT_AT) return { kind: 'hot', mul: harsh(t - TEMP_HOT_AT) };
  if (t > TEMP_WARM_AT) return { kind: 'warm', mul: mild(t - TEMP_WARM_AT, TEMP_HOT_AT - TEMP_WARM_AT) };
  return null;
}
const stressIsCold = (st) => !!st && (st.kind === 'chilly' || st.kind === 'cold');
const _stressDesc = (st) => (stressIsCold(st) ? 'Food and protein' : 'Thirst and fruit') +
  ` drain ${Math.round((st.mul - 1) * 100)}% faster` + (EFFECT_DEFS[st.kind].hurts ? `, and you lose ${TEMP_HURT} health every ${TEMP_HURT_EVERY_S} s` : '') +
  ` (${Math.round(player.temp)}°C).`;
// sum of one numeric field over this player's running effects (0.761)
const _effectSum = (field) => (player.effects || []).reduce((n, e) => n + (EFFECT_DEFS[e.id]?.[field] || 0), 0);
const playerHasEffect = (field) => (player.effects || []).some(e => EFFECT_DEFS[e.id]?.[field]);
// multiplier on hunger and over-food drain: 2 while nauseous
const playerHungerMul = () => (player.effects || []).reduce((m, e) => m * (EFFECT_DEFS[e.id]?.hungerMul || 1), 1)
  * ((typeof hasSkill === 'function' && hasSkill('slowBurner')) ? 0.95 : 1);   // Slow Burner (0.79)
// how fast your breath runs out under water: 5% slower with Slow Burner (0.7911)
const playerAirMul = () => ((typeof hasSkill === 'function' && hasSkill('slowBurner')) ? 0.95 : 1);
// multiplier on health regen, and on the instant heal of a food eaten while the effect runs
const playerRegenMul = () => (player.effects || []).reduce((m, e) => m * (EFFECT_DEFS[e.id]?.regenMul || 1), 1);
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
  const list = ((!player.canFly && !player.dead && player.effects) || []).map(e => ({ id: e.id, label: t(e.left) }));
  // cold or hot (0.822) first, showing the temperature instead of a clock
  const st = tempStress();
  if (st) list.unshift({ id: st.kind, label: Math.round(player.temp) + '°' });
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
    return `<div class="effSlot${d.good === false ? ' bad' : ' good'}" title="${d.name}">` +
           `<i>${d.icon || '✨'}</i><b>${e.label}</b></div>`;
  }).join('');
}
function effectTipHTML(i) {
  const e = activeEffects()[i];
  if (!e) return '';
  const cls = e.good === false ? ' bad' : '';
  const left = e.time === Infinity ? (e.lasts || 'Lasts while the full set is worn') : `${e.time}s left`;   // cold, hot: their own (0.822)
  return `<div class="tipName">${e.name}</div>` + (e.desc ? `<div class="tipSet${cls}">${e.desc}</div>` : '') +
         `<div class="tipDesc">${left}</div>`;
}
