'use strict';
/* seasons/calendar.js: the calendar. The date from the world's clock, the season, and the hash the weather is rolled
   from. */

/* voxiGrof — calendar, seasons, weather and wind

   CALENDAR. A month is MONTH_DAYS in-game days and a world begins on 1 April. Seasons go by months:
   spring Mar-May, summer Jun-Aug, autumn Sep-Nov, winter Dec-Feb.

   SEASONS change the land:
   - plants grow 30% faster in spring, as normal in summer, 30% slower in autumn, and not at all in winter
     (seasonGrowth(): saplings, berry bushes, wheat, hollow-log mushrooms);
   - oak and birch leaves fall through autumn onto the ground as litter, and the last of them in winter; in
     spring each grows back where it was, a few at a time;
   - grass plants, flowers, mushrooms, berry bushes, wheat and gourds wither through autumn and are gone by
     winter. Each is remembered, and in spring has a 50% chance to come back where it was, and a 0.1% chance
     to seed one more beside it — then it is forgotten, so nothing multiplies year on year;
   - only what the sky reaches changes: a cave mushroom does not know it is winter.
   Every cell's turn is a hash of its position, compared against how far through the season the world is.
   That makes a chunk far away catch up exactly on its next visit: it simply finds the state it should be in.

   WEATHER (rain and snow on screen and on the ground since 0.83: precipAt below, _fxWeather in 49, the fog in 52).
   The world is split into WEATHER_REGION x WEATHER_REGION
   chunk regions; each runs its own weather in stretches of 6 to 24 in-game hours, drawn from a hash of the
   region and the time, weighted by season and by the region's biome. What comes next is known 12 hours
   ahead (weatherHere().next), for the clouds that will one day roll in first.

   WIND blows in every weather, harder in some. It bends grass and leaves (04-materials.js) and, when strong,
   pushes a walking player along or holds them back (22-main-loop.js). */

const MONTH_DAYS = 7, START_MONTH = 3;                  // 3 = April
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                     'October', 'November', 'December'];
const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_GROWTH = [1.3, 1, 0.7, 0];
const WEATHER_REGION = 16;                              // chunks (8 until 0.813)
const REGION_BLOCKS = WEATHER_REGION * 16;
const WEATHER_AHEAD_H = 12;

// the world clock in days (worldDay counts whole days, worldTime the part of today)
const worldClockDays = () => (typeof worldDay !== 'undefined' ? worldDay + worldTime : 0);
/* The date at a moment (in days since the world began): day of month, month, year, season, and how far
   through that season it is (0..1). */
/* A world made with seasons off (the create screen) stays on 1 July for good: summer weather, summer
   growth, July's long days, and no season sweep. Worlds from before it have no flag and keep their seasons. */
const seasonsOn = () => !(typeof currentWorld !== 'undefined' && currentWorld && currentWorld.seasons === false);
const FIXED_DAY = ((6 - START_MONTH + 12) % 12) * MONTH_DAYS;   // 1 July, in days from the world's start
function gameDate(t = worldClockDays()) {
  if (!seasonsOn()) t = FIXED_DAY + (t - Math.floor(t));
  const dayIdx = Math.floor(t);
  const monthsIn = Math.floor(dayIdx / MONTH_DAYS);
  const month = (START_MONTH + monthsIn) % 12;
  const year = 1 + Math.floor((START_MONTH + monthsIn) / 12);
  const season = [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][month];
  const firstMonth = [2, 5, 8, 11][season];               // March, June, September, December
  // days into the season: whole months since it began, plus how far into this month (fractional)
  const within = ((month - firstMonth + 12) % 12) * MONTH_DAYS + (t - monthsIn * MONTH_DAYS);
  return { day: (dayIdx % MONTH_DAYS) + 1, month, year, season, progress: Math.min(1, within / (3 * MONTH_DAYS)) };
}
const seasonGrowth = () => SEASON_GROWTH[gameDate().season];

/* ---- hashing ---- */
const _seedN = () => (typeof SEED === 'number' ? SEED : String(typeof SEED !== 'undefined' ? SEED : 0)
  .split('').reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7));
function sHash(a, b, c, d) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 217645177)
          + Math.imul(d | 0, 1103515245)) ^ _seedN();
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
