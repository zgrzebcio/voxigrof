'use strict';
/* player/endurance.js: experience for enduring (bad weather, a night outside, feats), and exhaustion. */

/* Weathering it: out in the open through a storm, hail, a sandstorm, or with the body Cold or Hot, every
   XP_WEATHER_S pays XP_WEATHER (player/leveling.js). The clock keeps what it had between spells, and never runs indoors. */
function _tickWeatherXP(p, dt) {
  const st = tempStress(p);
  const harsh = !p.dead && !p._roofed && (p._wxHarsh || p._sandFelt > 0.3 || (st && (st.kind === 'cold' || st.kind === 'hot')));
  if (!harsh || typeof addXP !== 'function') return;
  p._wxXpT = (p._wxXpT || 0) + dt;
  if (p._wxXpT >= XP_WEATHER_S) { p._wxXpT -= XP_WEATHER_S; addXP(XP_WEATHER, 'braving the weather'); }
}
/* A night lived through outside: from dusk to dawn the clock counts the night and how much of it this player
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
  /* times the days this life has lasted (the death screen's clock, aliveT, in whole days, 1 at least), so the
     tenth night you live through pays ten times the first. A death starts the count over. */
  const days = Math.max(1, Math.round((p.aliveT || 0) / (typeof DAY_LEN !== 'undefined' && DAY_LEN > 0 ? DAY_LEN : 1200)));
  const xp = (n.blood ? XP_BLOOD_MOON : XP_NIGHT) * days;
  addXP(xp);
  if (typeof feedFeat === 'function') feedFeat(n.blood ? 'Lived through the blood moon outside' : 'Lived through the night outside', xp);
}
/* Found once and for all: each biome the first time you stand in it, the top of the world (WORLD_TOP, y 249 since 0.8354) and its
   bottom (y 2), looked at once a second. */
function _tickFeats(p, dt) {
  if (p.dead || !p.spawned) return;
  p._featT = (p._featT || 0) - dt;
  if (p._featT > 0) return;
  p._featT = 1;
  const f = p._feats || (p._feats = restoreFeats(null));
  const pay = (text, xp, icon) => { addXP(xp); if (typeof feedFeat === 'function') feedFeat(text, xp, icon); };
  const b = mainGen && mainGen.biomeAt ? mainGen.biomeAt(Math.floor(p.pos.x), Math.floor(p.pos.z)) : '';
  // each new one pays more than the last (biomeXP in player/leveling.js): by how many were found before it; its own picture
  if (b && !f.biomes.has(b)) { const xp = biomeXP(f.biomes.size); f.biomes.add(b); pay(`Discovered ${b} (${f.biomes.size}/${BIOME_COUNT})`, xp, 'biomeDiscover'); }
  if (!f.top && p.pos.y >= WORLD_TOP_Y) { f.top = true; pay('Reached the top of the world', XP_WORLD_EDGE); }
  if (!f.bottom && p.pos.y <= WORLD_BOTTOM_Y) { f.bottom = true; pay('Reached the bottom of the world', XP_WORLD_EDGE); }
}
// the walk's multiplier in a sandstorm (22-main-loop.js)
const playerStormMoveMul = (p = player) => p.canFly ? 1 : 1 - SAND_SLOW * (p._sandFelt || 0);

/* ---- exhausted ----
   Run your stamina dry and you are Exhausted until it is back to STAMINA_BACK (playerTired): EXHAUST_SLOW off your
   move speed, EXHAUST_SAND_SLOW more in a full sandstorm (by how much of it reaches you). Stay exhausted longer than
   EXHAUST_HURT_AFTER — a sandstorm keeps you there, as does heatstroke's slow stamina — and it costs health too,
   EXHAUST_HURT_DPS a second. A sprint that runs out and stops to rest never gets that far. */
const EXHAUST_SLOW = 0.2, EXHAUST_SAND_SLOW = 0.2, EXHAUST_HURT_DPS = 0.3;
const EXHAUST_HURT_AFTER = 10;   // 5 until 0.826, when the rest before stamina comes back grew to 5 s once exhausted
const exhaustedSlow = (p = player) => playerTired(p) ? EXHAUST_SLOW + EXHAUST_SAND_SLOW * Math.min(1, p._sandFelt || 0) : 0;
/* the health it costs is for what KEEPS you exhausted against your will — a sandstorm on you, or heatstroke
   slowing your stamina — as the note above always said. Plain exertion (a jump, a sprint, a swim, a climb that ran
   you dry), or an empty stomach that stops your stamina coming back, only leaves you slow: its clock does not run. */
function _tickExhausted(p, dt) {
  const kept = (p._sandFelt || 0) > 0.05 || (p.heatstroke || 0) >= 1;
  if (!playerTired(p) || p.dead || !kept) { p._exhaustT = 0; p._exhaustAcc = 0; return; }
  p._exhaustT = (p._exhaustT || 0) + dt;
  if (p._exhaustT < EXHAUST_HURT_AFTER) return;
  if (p._exhaustT - dt < EXHAUST_HURT_AFTER && typeof feedCrit === 'function') feedCrit('Exhausted: losing health, stop and rest under a roof');
  const before = p.hp;
  p.hp = Math.max(0, p.hp - EXHAUST_HURT_DPS * dt);
  p._dmgCause = 'died of exhaustion';
  p._exhaustAcc = (p._exhaustAcc || 0) + (before - p.hp);
  if (p._exhaustAcc >= 0.5 * VITAL_K) { if (typeof hurtFlash === 'function') hurtFlash(p._exhaustAcc / VITAL_K); p._exhaustAcc = 0; }
}
