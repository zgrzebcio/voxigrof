'use strict';
/* player/effects.js: effects. EFFECT_DEFS, the effects a state brings (cold, hot, wet, underwater...), timed effects
   from food and bosses, and the effect bar. */

/* ======================================== effects ======================================== */
// active timed effects — nothing produces them yet, but the panel already lists them
const PLAYER_EFFECTS = [];
/* Everything currently affecting the player, permanent set bonuses first. PLAYER_EFFECTS is still
   the home for genuine TIMED effects; nothing produces one yet. */
function activeEffects() {
  const out = [];
  // cold or hot first, then sneaking and climbing: they last as long as the state does
  for (const s of stateEffects()) {
    const d = EFFECT_DEFS[s.id];
    out.push({ name: d.name, time: Infinity, good: d.good, desc: s.desc || d.desc, lasts: d.lasts });
  }
  const b = armorSetBonus();
  if (b) out.push({ name: b.name, time: Infinity, good: b.good, desc: b.desc });
  /* boss boost (entities/frozen-king.js): for good, through death too. Listed here with what it gives; not on the effect
     bar by the hotbar, which is for what comes and goes */
  if (typeof bossBoostLevel === 'function' && bossBoostLevel() > 0) {
    const lv = bossBoostLevel(), d = EFFECT_DEFS.bossBoost;
    out.push({ name: `${d.name} ${lv}`, time: Infinity, good: true, lasts: d.lasts,
               desc: `XP +${Math.round((bossXpMul() - 1) * 100)}% (x${bossXpMul().toFixed(1)}) on everything you earn. ` +
                     `Level ${lv} of ${BOSS_BOOST_MAX}, one for each kind of boss defeated: ${bossBoostNames().join(', ')}.` });
  }
  for (const e of PLAYER_EFFECTS) out.push(e);
  for (const e of player.effects || []) {
    const d = EFFECT_DEFS[e.id];
    // an aura's effect (the Frozen King's curse) has no clock to read: it says what keeps it instead
    if (d) out.push({ name: d.name, time: d.aura ? Infinity : Math.ceil(e.left), good: d.good, desc: d.desc, lasts: d.lasts });
  }
  return out;
}
/* Timed effects. They live on the player, so every split-screen seat has its own list; `left` is
   seconds remaining. A food with `foodEffect` starts one, and eating another restarts the clock rather
   than stacking a second copy. */
const EFFECT_DEFS = {
  // `icon`: what the effect bar beside the hotbar shows for it — an emoji until each has a sprite
  rapidRegen:   { name: 'Rapid regen',   time: 20, good: true, regen: 0.5, icon: '💖',              // golden apple; 8s until 0.7992
                  desc: 'Regen +50%: health heals half as fast again, and food heals and gives energy half as much again.' },   // +50% since 0.832 (x2 before)
  // cooked pumpkin pie: +20% crafting speed and +5% move speed
  spicyPumpkin: { name: 'Spicy pumpkin', time: 10, good: true, craftSpeed: 0.20, moveSpeed: 0.05, icon: '🌶️',
                  desc: 'Crafting speed +20% and move speed +5%.' },
  // raw food, rotten flesh: hunger drains twice as fast and the view sways (22-main-loop.js)
  nausea:       { name: 'Nausea',        time: 10, good: false, hungerMul: 2, sway: true, icon: '🤢',
                  desc: 'Hunger drains twice as fast, and your view sways and drifts.' },
  /* yellow berries: 2.5 health a second, 25 over the whole of it (x5 in 0.82). A slow drip, so armor
     does not soak it (that needs 2.5 in one frame, player/hazards.js), and it stops at VITAL_K: poison alone
     never kills you. */
  poison:       { name: 'Poison',        time: 10, good: false, poisonDps: 0.5 * VITAL_K, announce: 'You feel poisoned', icon: '☠️',
                  desc: 'You slowly lose health while it lasts. It cannot take your last 5 health.' },
  /* the temperature's four (cold and hot alone in 0.822): not timed — they last while the temperature does
     (tempStress); listed and on the bar. `hurts`: a cold or a heat that takes health as well */
  chilly:       { name: 'Chilly', good: false, icon: '🌬️', lasts: 'Lasts while you are colder than 10°C' },
  cold:         { name: 'Cold',   good: false, icon: '🥶', lasts: 'Lasts while you are colder than -5°C', hurts: 'froze to death' },
  warm:         { name: 'Warm',   good: false, icon: '☀️', lasts: 'Lasts while you are warmer than 30°C' },
  hot:          { name: 'Hot',    good: false, icon: '🥵', lasts: 'Lasts while you are warmer than 45°C', hurts: 'died of the heat' },
  /* the sun and the desert wind: shown while they last, with how far they have got */
  heatstroke:   { name: 'Heatstroke', good: false, icon: '😵', lasts: 'Builds in hot sun. Goes down in shade or at night, faster under a roof, fastest in water' },
  sandstorm:    { name: 'Sandstorm',  good: false, icon: '🌪️', lasts: 'Lasts while the storm reaches you: a roof or a cave stops it' },
  exhausted:    { name: 'Exhausted', good: false, icon: '😫', lasts: `Lasts until your stamina is back to ${STAMINA_BACK}` },   // 0.82501
  tired:        { name: 'Tired', good: false, icon: '🥱', lasts: `Lasts while your energy is ${TIRED_AT}% or less: sleep in a bed` },   // 0.832
  // running low on a food group: shown with how much is left
  proteinSick:  { name: 'Protein sickness', good: false, icon: '🍖', lasts: `Lasts while your protein is ${SICK_AT} or less: eat meat or fish`, hurts: 'wasted away' },
  fruitSick:    { name: 'Fruit sickness',   good: false, icon: '🍎', lasts: `Lasts while your fruit is ${SICK_AT} or less: eat fruit or berries`, hurts: 'wasted away' },
  vegSick:      { name: 'Vegetable sickness', good: false, icon: '🥕', lasts: `Lasts while your vegetables are ${SICK_AT} or less` },
  wet:          { name: 'Wet', good: false, icon: '💧', lasts: 'Dries a second a second; faster near a fire, lava, a torch, in a desert or warm' },   // 0.8323
  // head under water: shown with the oxygen left
  underwater:   { name: 'Underwater', good: false, icon: '🫧', lasts: 'Lasts while your head is under water' },
  // salt among your food: shown with how long the salt in use keeps it
  salted:       { name: 'Salted', good: true, icon: '🧂', lasts: 'Lasts while the salt in use lasts; the next salt you carry goes in when it runs out' },
  /* what you are doing: shown while it lasts, like the temperature (stateEffects) */
  sneaking:     { name: 'Sneaking', good: true, icon: '🐾', lasts: 'Lasts while you sneak',
                  desc: "You do not step off an edge, and your stamina comes back 20% faster." },
  // your crafting queue running: shown, never lifted by milk nor shortened, gone when the last craft is done
  crafting:     { name: 'Crafting', good: false, icon: '🔨', lasts: 'Lasts while your crafting queue runs: it ends when the last craft is done. Milk does not lift it.' },
  climbing:     { name: 'Climbing', good: false, icon: '🧗', lasts: 'Lasts while you climb a wall',
                  desc: `Climbing a bare wall costs ${STAMINA_CLIMB_PER_S} stamina a second, and energy with it. Run dry and you let go until it is back to ${STAMINA_BACK}.` },
};
// the effects of what you are doing right now, as [{ id, desc? }]: the temperature, sneaking, climbing
function stateEffects(p = player) {
  const out = [];
  if (p.canFly || p.dead) return out;
  const st = tempStress(p);
  if (st) out.push({ id: st.kind, desc: _stressDesc(st), label: Math.round(p.temp) + '°' });
  // heatstroke and a sandstorm
  if (p.heatstroke >= 1) out.push({ id: 'heatstroke', desc: _hsDesc(p), label: Math.floor(p.heatstroke) + '%' });
  if (p._sandFelt > 0.05) out.push({ id: 'sandstorm', label: Math.round(p._sandFelt * 100) + '%',
    desc: `You walk ${Math.round(SAND_SLOW * p._sandFelt * 100)}% slower and lose ${((p._movingH > 0.001 ? SAND_STAMINA_MOVING_PER_S : SAND_STAMINA_PER_S) * p._sandFelt).toFixed(1)} stamina a second.` +
          (playerSandResist() ? ` ${Math.round(playerSandResist() * 100)}% resisted.` : '') });
  if (playerTired(p)) out.push({ id: 'exhausted', desc: `You move ${Math.round(exhaustedSlow(p) * 100)}% slower and cannot sprint, jump or climb.` +
    (p._exhaustT >= EXHAUST_HURT_AFTER ? ` You lose ${EXHAUST_HURT_DPS} health a second.`
      : ` In a sandstorm or with heatstroke, ${EXHAUST_HURT_AFTER} s of it costs health too.`) +
    (p.food > 0 && p.thirst > 0 ? '' : ' Stamina does not come back without food and water.') });   // 0.82501; 0.8444
  // low on energy
  const tr = tiredness(p);
  if (tr > 0) out.push({ id: 'tired', label: Math.round(p.energy) + '', desc: `Regen ${Math.round(TIRED_REGEN * tr * 100)}% slower, ` +
    `every bar drains ${Math.round(TIRED_DEPLETION * tr * 100)}% faster and you move ${Math.round(TIRED_SLOW * tr * 100)}% slower.` });
  // low on a food group: protein, fruit (vegetables when switched on)
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
  // wet: its time left
  // ...its time once soaked through, else how soaked it is
  if (playerWet(p)) { const w = wetness(p); out.push({ id: 'wet',
    label: p._wetT > 0 ? (p._wetT >= 60 ? Math.ceil(p._wetT / 60) + 'm' : Math.ceil(p._wetT) + 's') : Math.round(w * 100) + '%',
    desc: `Soaked ${Math.round(w * 100)}%` + (p._wetT > 0 ? ` for ${Math.ceil(p._wetT)} s more` : '') + `: jump strength ${(WET_JUMP * w * 100).toFixed(1)}% less, ` +
          `effects last ${Math.round(WET_EFFECT_TIME * w * 100)}% shorter, cold resistance ${Math.round(WET_COLD_RES * w * 100)}% less.` }); }
  // head under water: mining slowed, the oxygen left on the icon
  if (playerUnderwater(p)) out.push({ id: 'underwater', label: Math.round(p.air ?? 0) + '',
    desc: `Mining speed -${Math.round(UNDERWATER_MINING * 100)}%. Your oxygen is running down: ${Math.round(p.air ?? 0)} left.` });
  // the salt keeping your food (44-spoil.js): its time left, minutes past one
  if (p._saltT > 0) out.push({ id: 'salted', label: p._saltT >= 60 ? Math.ceil(p._saltT / 60) + 'm' : Math.ceil(p._saltT) + 's',
    desc: `Food you carry spoils ${Math.round(SALT_SLOW * 100)}% slower while it lasts (${Math.ceil(p._saltT / 60)} min).` });
  if (p.sneaking) out.push({ id: 'sneaking' });
  if (p._wallClimbing) out.push({ id: 'climbing' });
  // the crafting queue (player/crafting.js): what it costs you while it runs, and how long it still has
  if (p === player && typeof playerIsCrafting === 'function' && playerIsCrafting()) {
    const s = typeof craftQueueLeft === 'function' ? craftQueueLeft() : 0;
    out.push({ id: 'crafting', label: s >= 60 ? Math.ceil(s / 60) + 'm' : Math.ceil(s) + 's',
      desc: `Walk speed -${Math.round((1 - craftMoveMul()) * 100)}%. Jump strength -${Math.round((1 - CRAFT_JUMP_MUL) * 100)}%. No sprinting.` +
            ` ${Math.ceil(s)} s of crafting left.` });
  }
  return out;
}
/* The body's temperature (player.temp, °C) against four lines:
     under 10 chilly, under -5 cold: food and protein drain faster
     over 30 warm,    over 45 hot:   thirst and fruit drain faster
   Chilly and warm run from 1x at their line to TEMP_MILD_MAX at the next; cold and hot from there on up to
   TEMP_HARSH_MAX TEMP_HARSH_SPAN degrees further, and also drain health (TEMP_HURT_DPS...). Resistance cuts both. */
const TEMP_CHILLY_AT = 10, TEMP_COLD_AT = -5, TEMP_WARM_AT = 30, TEMP_HOT_AT = 45;
const TEMP_MILD_MAX = 1.5, TEMP_HARSH_MAX = 2.5, TEMP_HARSH_SPAN = 20;
/* Cold and hot take health as a slow drain by how far past their line you are (5 every 6 s flat before):
   TEMP_HURT_DPS at the line, TEMP_HURT_DPS_PER_DEG more each degree on, up to TEMP_HURT_DPS_MAX — a second. */
const TEMP_HURT_DPS = 0.3, TEMP_HURT_DPS_PER_DEG = 0.04, TEMP_HURT_DPS_MAX = 1.5;
/* Resistance: cold resistance takes its share off everything the cold does — the faster drain and the
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
// sum of one numeric field over this player's running effects
const _effectSum = (field) => (player.effects || []).reduce((n, e) => n + (EFFECT_DEFS[e.id]?.[field] || 0), 0);
const playerHasEffect = (field) => (player.effects || []).some(e => EFFECT_DEFS[e.id]?.[field]);
// multiplier on hunger and over-food drain: 2 while nauseous
const playerHungerMul = () => (player.effects || []).reduce((m, e) => m * (EFFECT_DEFS[e.id]?.hungerMul || 1), 1);   // Slow Burner left it for the stats depletion
/* STATS DEPLETION: one multiplier on how fast EVERY bar drains — food, thirst, stamina used, oxygen, energy,
   fruit, vegetables, protein. Slow Burner takes 5% off; gear may carry a depletion field later (-0.05 = 5% slower). */
const SLOW_BURNER_MUL = 0.95;
const playerDepletionMul = () => Math.max(0.25, ((typeof hasSkill === 'function' && hasSkill('slowBurner')) ? SLOW_BURNER_MUL : 1)
  + (typeof _equipSum === 'function' ? _equipSum('depletion') : 0)) * (1 + TIRED_DEPLETION * tiredness())   // tired
  * (1 + SICK_DEPLETION * (sickness('protein') + sickness('fruit')));   // sick
// how fast your breath runs out under water: 5% slower with Slow Burner
const playerAirMul = () => playerDepletionMul();   // the stats depletion since 0.828
/* REGEN, a stat: how fast health heals and how much energy food gives, and the instant heal of a food eaten
   while it runs. 100%, plus each running effect's `regen` (Rapid regen +50%; it doubled until 0.832), times what
   tiredness leaves (up to 90% less). */
const playerRegenMul = (p = player) => Math.max(0, 1 + (p.effects || []).reduce((n, e) => n + (EFFECT_DEFS[e.id]?.regen || 0), 0)
                                     - SICK_REGEN * (sickness('protein', p) + sickness('fruit', p)))   // sick
                                     * (1 - TIRED_REGEN * tiredness(p));                                // never under 0
/* EFFECT DURATION, a stat: how long a food's or a potion's GOOD effect lasts, 125% with Lingering,
   Rapid regen included. Bad ones (poison, nausea) keep their own length since 0.8321. */
const playerEffectTimeMul = () => Math.max(0, 1 + ((typeof hasSkill === 'function' && hasSkill('lingering')) ? 0.25 : 0)
  - WET_EFFECT_TIME * wetness());   // wet: up to 20% less, by how soaked
function addPlayerEffect(id, time) {   // time: a food's own length for it (foodEffectTime), else the effect's
  const d = EFFECT_DEFS[id];
  if (!d) return;
  const list = player.effects || (player.effects = []);
  const t = (time || d.time) * (d.good ? playerEffectTimeMul() : 1);   // Lingering: good effects only
  const e = list.find(x => x.id === id);
  if (e) e.left = t; else list.push({ id, left: t });
  if (d.announce && typeof feedWarn === 'function') feedWarn(d.announce);   // a bad one says so as it lands
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
  /* Poison drips health away, never below VITAL_K. Since 0.7992 it also LOOKS like damage: the drip
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
/* THE EFFECT BAR: every running timed effect as a half-size slot right of the hotbar — its icon and
   the seconds left, green-edged when good, red when bad. Per frame, per seat, from the main loop beside the
   chisel slot; it lives INSIDE #hotbar so split screen carries it along, and buildHotbar clearing it is
   fine, this puts it back. Redrawn only when a shown second (or the list) changes. */
function syncEffectBar() {
  if (typeof hotbarEl === 'undefined' || !hotbarEl) return;
  const t = (s) => s >= 60 ? Math.ceil(s / 60) + 'm' : Math.ceil(s) + 's';
  // an aura's effect shows what it is, not a clock that never runs down
  const list = ((!player.canFly && !player.dead && player.effects) || []).map(e => ({ id: e.id, label: EFFECT_DEFS[e.id]?.aura ? EFFECT_DEFS[e.id].aura : t(e.left) }));
  // cold or hot first, showing the temperature instead of a clock; sneaking and climbing too
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
    // its name and what it does on hover (the name alone before)
    const tip = (d.name + (d.desc ? ': ' + d.desc : d.lasts ? ': ' + d.lasts : '')).replace(/"/g, '&quot;');
    return `<div class="effSlot${d.good === false ? ' bad' : ' good'}" title="${tip}">` +
           `<i>${d.icon || '✨'}</i><b>${e.label}</b></div>`;
  }).join('');
}
function effectTipHTML(i) {
  const e = activeEffects()[i];
  if (!e) return '';
  const cls = e.good === false ? ' bad' : '';
  // a timed one with its own `lasts` says where it comes from too (the ice daze)
  const left = e.time === Infinity ? (e.lasts || 'Lasts while the full set is worn') : `${e.time}s left` + (e.lasts ? `. ${e.lasts}` : '');   // cold, hot: their own
  return `<div class="tipName">${e.name}</div>` + (e.desc ? `<div class="tipSet${cls}">${e.desc}</div>` : '') +
         `<div class="tipDesc">${left}</div>`;
}
