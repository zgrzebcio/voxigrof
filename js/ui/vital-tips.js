'use strict';
/* ui/vital-tips.js: the tooltips of the vitals bars: a bar's value, and everything changing it right now. */

/* ---- the HUD's tooltips ----
   Hovering a bar with the inventory open (player/hazards.js finds which): its value out of its max, its over-stat,
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
    rows = row('now', `${n(p[key] ?? 0)} / ${key === 'hp' ? playerMaxHP(p) : VITAL_MAX[key]}`);   // Thick Skin's 110
    if (OVER_KEY[key]) rows += row('over', `${n(p[OVER_KEY[key]] || 0)} / ${MAX_OVER}`);
  }
  // ...and what is moving it right now, and from where
  for (const [from, what] of vitalModifiers(key)) rows += row(from, what);
  return `<div class="tipName">${inf[0]}</div><div class="tipStats">${rows}</div><div class="tipDesc">${inf[1]}</div>`;
}
/* What changes a bar right now, as [source, effect] rows for its tooltip: skills, the stats depletion, effects,
   the temperature, heatstroke, a sandstorm, exhaustion. Only what is in force is listed. */
const _VITAL_DRAINS = new Set(['food', 'thirst', 'stamina', 'air', 'energy', 'fruit', 'veg', 'protein']);
function vitalModifiers(key) {
  const p = player, out = [], pct = (m) => Math.round(Math.abs(m - 1) * 100) + '%';
  const way = (m) => `drains ${pct(m)} ${m < 1 ? 'slower' : 'faster'}`;
  const dep = playerDepletionMul(), st = tempStress(p), hs = p.heatstroke || 0, hsm = heatstrokeMuls(hs);
  const stName = st ? EFFECT_DEFS[st.kind].name : '';
  if (key === 'hp') {
    if (hasSkill('thickSkin')) out.push(['Thick Skin', `+${THICK_SKIN_HP} health`]);   // health only since 0.8446
    const rm = playerRegenMul();
    if (Math.abs(rm - 1) > 0.005) out.push(['regen', `heals at ${Math.round(rm * 100)}%`]);   // the regen stat
    if (playerHasEffect('poisonDps')) out.push(['Poison', 'no healing, loses health']);
    if (st && st.dps > 0) out.push([stName, `-${st.dps.toFixed(1)} a second`]);
    if (hsm.dps > 0) out.push(['Heatstroke', `-${hsm.dps.toFixed(1)} a second`]);
    if (p._exhaustT >= EXHAUST_HURT_AFTER) out.push(['Exhausted', `-${EXHAUST_HURT_DPS} a second`]);
  }
  if (_VITAL_DRAINS.has(key) && Math.abs(dep - 1) > 0.005)
    out.push([hasSkill('slowBurner') && !tiredness(p) ? 'Slow Burner' : 'stats depletion', way(dep)]);   // tired counts in it
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
