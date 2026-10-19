'use strict';
/* player/eating.js: throwing what is held, and eating or drinking it with the right button held. */

/* ---- throwing ---- */
// blocks whose right-click opens a GUI or actuates something; throwing must yield to them
// (a mortar of another rock is the mortar with a look: blocks/looks.js)
const THROW_BLOCKED_BY = new Set([B.CRAFTING_BENCH, B.MORTAR, B.FURNACE, B.CHEST, B.METAL_CHEST, B.DOOR, B.BED,   // metal chest 0.843
                                  B.STRUCTURE_BLOCK]);
function tryThrow() {
  if (!playing || player.canFly || invOpen || menuScene) return false;
  const slot = HOTBAR[hotbarSel];
  if (!slot || !ITEM_PROPS[slot.id]?.throwable) return false;
  /* A right-click aimed at something that OPENS must interact, not throw — otherwise a stack of
     snowballs in hand locks you out of your own furnace. doPlace() handles these same ids. */
  const aimed = currentRay();
  if (aimed && (THROW_BLOCKED_BY.has(aimed.id) || BLOCKS.isDoorVal(getBlock(aimed.x, aimed.y, aimed.z)))) return false;   // a door of any material
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  spawnProjectile(slot.id,
    player.pos.x + fwd.x * 0.3,
    player.pos.y + player.EYE - 0.1,
    player.pos.z + fwd.z * 0.3,
    fwd.x * 22, fwd.y * 22 + 1.5, fwd.z * 22
  );
  slot.count--;
  if (slot.count <= 0) HOTBAR[hotbarSel] = null;
  if (typeof feedItem === 'function') feedItem(slot.id, -1, 'thrown');
  saveHotbar(); buildHotbar();
  return true;
}

/* ---- eating ---- */
var _eatTimer = 0;
const EAT_TIME = 1.32;  // default eat duration; override per-item via eatTime in ITEM_PROPS (every one 20% longer in 0.821)
function updateEating(dt, wantPlace) {
  if (!playing || player.canFly || invOpen || menuScene) { _eatTimer = 0; return 0; }
  const slot = HOTBAR[hotbarSel];
  const id = slot ? slot.id : null;
  // an item or a block (the grilled mushrooms): foodPropsOf in player/stats.js
  const fp = foodPropsOf(id), isFood = !!fp;
  const eatDur = (fp && fp.eatTime) || EAT_TIME;
  if (wantPlace && isFood) {
    _eatTimer = Math.min(eatDur, _eatTimer + dt);
    if (typeof fxEat === 'function') fxEat(player, id, dt);   // crumbs, or milk splashing
    if (_eatTimer >= eatDur) {
      _eatTimer = 0;
      const foodAmt = fp.food || 0;
      const foodSat = (fp.foodSat || 0) * OVER_FOOD_GAIN;              // half the table's number
      if (player.food < MAX_FOOD) {
        player.food = Math.min(MAX_FOOD, player.food + foodAmt);
        player.saturation = Math.min(MAX_SATURATION, player.saturation + foodSat);
      } else {
        const fullSat = fp.foodSatFull != null ? fp.foodSatFull * OVER_FOOD_GAIN : foodSat;
        player.saturation = Math.min(MAX_SATURATION, player.saturation + fullSat);
      }
      // ...and thirst, fruit, vegetables, protein (0.82, FOOD_NUTRITION in player/stats.js)
      if (typeof eatNutrition === 'function') eatNutrition(player, fp);
      /* What the food does beyond filling you. Its effect lands FIRST, so the heal it carries is
         already boosted by it: a golden apple starts Rapid regen, then its 2 health arrive doubled as 4. */
      // milk: washes out every running effect, good or bad, before anything else lands
      if (fp.foodClearEffects && player.effects && player.effects.length) {
        player.effects = [];
        if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
      }
      // a white berry washes seconds off every bad effect running
      if (fp.foodCleanse && typeof cleanseEffects === 'function') cleanseEffects(player, fp.foodCleanse);
      const eff = fp.foodEffect;
      // some effects are only a chance: raw food and rotten flesh may or may not turn your stomach
      const effChance = fp.foodEffectChance ?? 1;
      if (eff && typeof addPlayerEffect === 'function' && Math.random() < effChance) addPlayerEffect(eff, fp.foodEffectTime);
      const heal = fp.foodHeal || 0;
      if (heal > 0) {
        const before = player.hp;
        player.hp = Math.min(playerMaxHP(), player.hp + heal * (typeof playerRegenMul === 'function' ? playerRegenMul() : 1));
        // green hearts for what the food healed, seen by everyone but you in first person (0.8)
        if (typeof fxHearts === 'function' && player.hp > before)
          fxHearts(player.pos.x, player.pos.y + 1.3, player.pos.z, true, (player.hp - before) / VITAL_K, fxOwner(player));   // one per 5 healed (per point of 20)
      }
      slot.count--;
      if (slot.count <= 0) HOTBAR[hotbarSel] = null;
      if (typeof feedItem === 'function') feedItem(id, -1, 'eaten');
      // give back container item (e.g. bowl from mushroom stew)
      const returnId = fp.foodReturn;
      if (returnId != null) {
        const cap = stackSize(returnId);
        let placed = false;
        for (let k = 0; k < hotbarLen() && !placed; k++) {
          const s = HOTBAR[k]; if (s && s.id === returnId && s.count < cap) { s.count++; placed = true; }
        }
        if (!placed) for (let k = 0; k < invSlots.length && !placed; k++) {
          const s = invSlots[k]; if (s && s.id === returnId && s.count < cap) { s.count++; placed = true; }
        }
        if (!placed) {
          const fh = HOTBAR.indexOf(null), fi = invSlots.indexOf(null);
          if (fh >= 0) HOTBAR[fh] = mkSlot(returnId, 1), placed = true;
          else if (fi >= 0) invSlots[fi] = mkSlot(returnId, 1), placed = true;
          else toast(`inventory full — ${(ITEM_PROPS[returnId]?.name || 'bowl').toLowerCase()} lost`);   // a bottle too
        }
        if (placed && typeof feedItem === 'function') feedItem(returnId, 1, 'emptied');
      }
      saveHotbar(); buildHotbar(); vitalsDirty = true;
    }
  } else {
    _eatTimer = 0;
  }
  return isFood ? _eatTimer / eatDur : 0;
}
