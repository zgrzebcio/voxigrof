'use strict';
/* biomes/climate-ladder.js: the climate ladder. Which biomes sit on which temperature level (-3 coldest .. 3 hottest),
   the level a temperature falls on (climateLevel) and the air's degrees there (climateAir).
   First part of BIOME_CORE (see core-parts.js; built in biomes/biomes.js). */

corePart('biomes', function () {
  /* The climate ladder (biomeRev 7), coldest first: the biomes of each temperature level, `to` the value of the
     temperature field (about -1..1) where the next level begins, `air` what the level adds to the air's temperature in
     degrees (ambientTemp, temperature/temperature.js). The temperature field is smooth, so the land steps through the levels
     one at a time. `biomes` is for reading only: which biome a level grows is decided in terrainInfo and biomeAt below.
     The edges share the land out about 8 / 17 / 15 / 20 / 15 / 17 / 8 % (spawn is pulled to level 0). */
  const CLIMATE_LADDER = [
    { lvl: -3, to: -0.51, air: -24, biomes: 'Deep Snow, Coldest Deep Snow (0.836, its coldest heart) and its Forest (0.837)' },
    { lvl: -2, to: -0.27, air: -16, biomes: 'Snow, Snow Forest, Snowy Mountains, Ice Spikes (0.835), Snowy Hills (0.8351)' },
    { lvl: -1, to: -0.10, air: -7,  biomes: 'Cold Plains, Spruce Forest' },
    { lvl:  0, to:  0.10, air: 0,   biomes: 'Plains, Forest, Birch Forest, Mountains' },
    { lvl:  1, to:  0.27, air: 6,   biomes: 'Warm Plains, Dryland (0.8411, its hot side by the desert)' },
    { lvl:  2, to:  0.51, air: 14,  biomes: 'Desert, Desert Hills' },
    { lvl:  3,            air: 20,  biomes: 'Red Sand, Red Sand Hills, Deep Desert (0.84, its hottest heart) and Deep Red Desert (0.841, the other half of it), its open Flat (0.84884); an Oasis now and then in a desert' },
  ];
  const LADDER_LO = CLIMATE_LADDER[0].lvl, LADDER_HI = CLIMATE_LADDER[CLIMATE_LADDER.length - 1].lvl;
  // the temperature field as a smooth level: a level's own band runs from lvl - 0.5 to lvl + 0.5
  function climateLevel(temp) {
    const E = [];
    for (let i = 0; i < CLIMATE_LADDER.length - 1; i++) E.push(CLIMATE_LADDER[i].to);
    let i = 0;
    while (i < E.length && temp >= E[i]) i++;
    // the two outer levels are as wide as their neighbours
    const lo = i > 0 ? E[i - 1] : 2 * E[0] - E[1], hi = i < E.length ? E[i] : 2 * E[E.length - 1] - E[E.length - 2];
    const L = LADDER_LO + i - 0.5 + (temp - lo) / (hi - lo);
    return Math.max(LADDER_LO - 0.5, Math.min(LADDER_HI + 0.5, L));
  }
  // what the level adds to the air, eased between the levels' own values
  function climateAir(L) {
    const k = Math.max(LADDER_LO, Math.min(LADDER_HI - 1, Math.floor(L))), f = Math.max(0, Math.min(1, L - k));
    const a = CLIMATE_LADDER[k - LADDER_LO].air, b = CLIMATE_LADDER[k + 1 - LADDER_LO].air;
    return a + (b - a) * f;
  }
});
