'use strict';
/* player/stat-getters.js: the stats that come from gear, skills and effects (strength, toughness, speed, resistances),
   and their tooltips. */

/* ===================================== stat getters ===================================== */
// flat bonus damage added on top of the held weapon (iron gloves = +0.75)
function playerStrength() { return _equipSum('strength') - SICK_PROTEIN_STR * sickness('protein'); }   // protein sickness
// 0..1 fraction of incoming knockback cancelled (iron set = 0.20)
/* Toughness: knockback resistance as a stat. 0% by default, 100% means you are never knocked
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
                          + _effectSum('moveSpeed')     // food effects
                          - exhaustedSlow()              // out of stamina
                          - TIRED_SLOW * tiredness()     // low on energy
                          - SICK_SLOW * (sickness('protein') + sickness('fruit')));   // sick
};
function playerMoveSpeedPct() { return Math.round(playerMoveSpeedMul() * 100); }
/* Jump strength: a multiplier on jump HEIGHT. No gear grants it yet, but it has its own stat line
   and the jump already reads it, so an item only needs a `jumpStrength` field (0.10 = +10%). */
const playerJumpMul = () => Math.max(0.25, 1 + _equipSum('jumpStrength') + _effectSum('jumpStrength')   // effects too: the ice daze
  - WET_JUMP * wetness());   // wet, by how soaked
function playerJumpPct() { return Math.round(playerJumpMul() * 100); }
/* Crafting speed: 1 = 100%, the rate every recipe's timeToCraft is written for; 2 crafts twice as
   fast; 0 means you cannot craft at all. Gear adds a `craftSpeed` field (0.25 = +25%). Never negative. */
const playerCraftSpeedMul = () => Math.max(0, 1 + _equipSum('craftSpeed') + _effectSum('craftSpeed')
  + ((typeof hasSkill === 'function' && hasSkill('nimble')) ? 0.1 : 0)   // Nimble Fingers   // + food effects
  - SICK_FRUIT_CRAFT * sickness('fruit'));                                // fruit sickness
function playerCraftSpeedPct() { return Math.round(playerCraftSpeedMul() * 100); }
// multiplier on swing rate — >1 swings faster, so it DIVIDES the cooldown
// gear, a running effect's `atkSpeed` (Tiger fury, entities/tiger.js), protein sickness
const playerAtkSpeedMul = () => Math.max(0.25, 1 + _equipSum('atkSpeed') + _effectSum('atkSpeed') - SICK_PROTEIN_ATK * sickness('protein'));
/* Environmental resistances. No item grants either yet and nothing reads them for damage
   — they are stat lines the panel reserves, so the gear that will carry them has somewhere to
   show up. Summed as a fraction (0.15 = 15% resisted) and clamped to 100%. */
// gear plus Weathered's 10%: the one total both the stat panel and anything that reads it use
const _resSum = (field) => _equipSum(field) + ((typeof hasSkill === 'function' && hasSkill('weathered')) ? 0.1 : 0)
  + _effectSum(field)                                          // effects too: the Frozen King's curse -30% cold
  + (field === 'coldResist' && typeof otterScarfCold === 'function' ? otterScarfCold() : 0)   // an otter round the neck (entities/otter.js)
  - (field === 'coldResist' ? WET_COLD_RES * wetness() : 0);   // wet: up to half the cold resistance gone (by % 0.8324)
const _resPct = (field) => Math.round(Math.min(1, Math.max(-1, _resSum(field))) * 100);
function playerColdResist() { return _resPct('coldResist'); }
function playerHeatResist() { return _resPct('heatResist'); }

/* Tooltips for the Stats and Effects lines, shown by the inventory cursor — mouse or pad —
   through nearestElement in ui/inventory-cursor.js. Keyed by the line's label as the panel prints it. */
const STAT_TIPS = {
  'defense':         'Protection from the armor you wear, out of 100. Every point takes 0.8% off the damage you take, up to 80%.',
  'damage reduced':  'How much of each hit is stopped: 0.8% per armor point up to 80%.',   // Thick Skin's 10% went in 0.8446
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
  'item pickup range': 'How far away things lying on the ground are picked up. A tamed meerkat on your shoulder adds 10% to 30%, by its level and its taming.',
  'foraging reach':  'How far round you E reaches grass, bushes, flint and pebbles. A tamed meerkat on your shoulder adds 10% to 30%, by its level and its taming.',
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
