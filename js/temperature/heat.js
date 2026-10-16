'use strict';
/* temperature/heat.js: what heat does. Heatstroke building in the sun, and a sandstorm on the body.
   What cold and heat cost every second is tempStress, in player/effects.js. */

/* ---- heatstroke ----
   p.heatstroke, 0..100. It builds while you stand in hot sun: a sunny or clear sky, the sun up, open sky over your
   head, and a body hotter than HS_FROM °C (a hat raises that by its heatstrokeTrigger, 5). From 0 to 100 takes
   HS_FULL_S in a desert's midday sun with the body at HS_FROM + HS_REF_OVER or more; it builds faster the hotter you
   are, half as fast away from a desert, and resistance takes its share off (a hat 25%, the cloth set 40%). Anywhere
   else it goes down: slowly in shade or at night (HS_COOL_OUT_S from full), faster under a roof (HS_COOL_ROOF_S),
   fastest in water (HS_COOL_WATER_S). What it does as it climbs:
     20%  thirst and fruit drain faster           30%  food, vegetables and protein do too
     40%  the view blurs, more as it climbs        50%  energy drains fast, stamina barely comes back
     70%  a slow loss of health                    90%  mirages: water on the ground ahead (player/hazards.js)
     100% you collapse and die. */
const HS_FULL_S = 240, HS_FROM = 35, HS_REF_OVER = 13;
const HS_DEEP_DESERT = 0.6;                          // it builds 60% faster again in the Deep Desert's sun
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
// CSS px of blur over this seat's view (player/hazards.js)
const heatstrokeBlur = (p = player) => p.canFly || p.dead || !(p.heatstroke >= HS_BLUR_AT) ? 0
  : 0.5 + (HS_BLUR_MAX - 0.5) * (p.heatstroke - HS_BLUR_AT) / (100 - HS_BLUR_AT);
function _tickHeatstroke(dt) {
  const p = player, t = p.temp;
  let hs = p.heatstroke || 0;
  const line = heatstrokeLine();
  if (p._hsSun > 0 && typeof t === 'number' && t > line) {
    const k = Math.min(1.5, 0.25 + 0.75 * (t - line) / HS_REF_OVER);
    hs += 100 / HS_FULL_S * k * p._hsSun * (0.5 + 0.5 * (p._hsDesert || 0)) * (1 + HS_DEEP_DESERT * (p._hsDeep || 0))
        * (1 - playerHeatstrokeResist()) * dt;
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
  // at 100% you collapse: player/hazards.js kills you AFTER the armor soak, which must not soften it
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

/* ---- a sandstorm on the body ----
   p._sandFelt, 0..1: how much of a sandstorm (sandstormAt, seasons/weather-sky.js) reaches you. It builds over SAND_EASE_S as
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
