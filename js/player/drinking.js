'use strict';
/* player/drinking.js: drinking from water with E, and filling a glass bottle. */

/* ---- drinking ----
   Crosshair on water within DRINK_REACH, main hand empty, not already full: hold E (pad North) for DRINK_TIME
   and you drink to full. The arm lifts as for eating (the progress rides on _eatProg, 22-main-loop.js), water
   drips, and the feed says how much went down. */
const DRINK_TIME = 1.1, DRINK_REACH = 2;   // reach halved in 0.8445 (4): you bend to the water, you do not drink from across the bank
const _drinkDir = new THREE.Vector3();
// water (still or running) on the crosshair's line within `reach`, nothing solid before it
function _waterOnRay(reach) {
  const p = player;
  camera.getWorldDirection(_drinkDir);
  const ox = p.pos.x, oy = p.pos.y + p.EYE, oz = p.pos.z;
  for (let t = 0.05; t <= reach; t += 0.1) {
    const v = getBlock(Math.floor(ox + _drinkDir.x * t), Math.floor(oy + _drinkDir.y * t), Math.floor(oz + _drinkDir.z * t));
    if ((v & 255) === B.WATER) return true;
    if (CORE.solidVal(v)) return false;              // a wall between you and it
  }
  return false;
}
function _waterAimed() {
  const p = player;
  if (!playing || invOpen || menuScene || p.dead || p.canFly || p.riding || p.sleepingAt || HOTBAR[hotbarSel]) return false;
  return _waterOnRay(DRINK_REACH);
}
/* ---- filling a glass bottle ----
   A glass bottle in the hand, the crosshair on water within BOTTLE_REACH, the right button held BOTTLE_FILL_TIME: one
   bottle of the stack comes back full (the water stays where it is), and holding on fills the next. Returns 0..1 for
   the progress ring. When the last bottle fills in the hand the button is latched (`_milkLatch`, entities/taming.js), or
   the same press would start drinking it. */
const BOTTLE_FILL_TIME = 0.5, BOTTLE_REACH = 4;
function updateBottleFill(dt, held) {
  const p = player, slot = HOTBAR[hotbarSel];
  const can = held && playing && !invOpen && !menuScene && !p.dead && !p.riding && !p.sleepingAt
    && slot && slot.id === ITEM.GLASS_BOTTLE && _waterOnRay(BOTTLE_REACH);
  if (!can) { p._fillT = 0; return 0; }
  p._fillT = (p._fillT || 0) + dt;
  if (p._fillT < BOTTLE_FILL_TIME) return p._fillT / BOTTLE_FILL_TIME;
  p._fillT = 0;
  if (p.canFly) {                                    // creative: the stack is not used up
    if (!tryPickup(ITEM.WATER_BOTTLE, null, 'filled')) throwFromPlayer(ITEM.WATER_BOTTLE, 1);
  } else {
    slot.count--;
    if (slot.count <= 0) {                           // the last one becomes the full bottle, where it is held
      HOTBAR[hotbarSel] = mkSlot(ITEM.WATER_BOTTLE, 1);
      p._milkLatch = true;
      if (typeof feedItem === 'function') feedItem(ITEM.WATER_BOTTLE, 1, 'filled');
    } else if (!tryPickup(ITEM.WATER_BOTTLE, null, 'filled')) throwFromPlayer(ITEM.WATER_BOTTLE, 1);
  }
  saveHotbar(); buildHotbar(); updateHotbar();
  if (typeof playSound === 'function') playSound('fillWater', { gain: 0.7, rate: 1.25, pos: { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z } });
  return 1;
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
// the line under the crosshair while water can be drunk (ui/hud.js)
const drinkPrompt = () => player._drinkAim
  ? `(<b>${typeof lastInputDevice !== 'undefined' && lastInputDevice === 'pad' ? padNorthLabel() : 'E'}</b>) hold to drink`
  : '';
