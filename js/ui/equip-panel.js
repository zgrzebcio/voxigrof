'use strict';
/* ui/equip-panel.js: the equipment panel of the inventory. */

/* ---------------------------------- panel ---------------------------------- */
const TOOL_SLOT_NAMES = ['Map', 'Spyglass', 'Compass', 'Lantern', 'Clock'];
// the Stats lines' tooltips (STAT_TIPS, _tagStatRows) and the effect tooltips live in player/stat-getters.js
// the word under an empty slot: whole words, shortened only where the full label cannot fit
const EQUIP_TAG = { helmet: 'Helmet', necklace: 'Neck', chestplate: 'Chest', leggings: 'Legs', boots: 'Boots',
                    back: 'Back', belt: 'Belt', gloves: 'Gloves', accessories: 'Others', offhand: 'Offhand' };
// size follows length: 6 letters or fewer 10px, 7 letters 9px, 8 or more 8px
const _eqTag = (t) => `<span class="eqTag${t.length >= 8 ? ' l8' : t.length === 7 ? ' l7' : ''}">${t}</span>`;
function buildEquipPanel() {
  const panel = invPanel('equipPanel');
  if (!panel) return;
  // Creative has no gear: loadEquipForMode already hands it an empty throwaway array, so leaving
  // the panel hidden is enough to disable armor entirely — slotDescriptors only registers equip
  // and belt slots while the panel is visible, so there is nothing to drag into.
  /* The right-hand column belongs to whichever GUI is open. buildInventory already skipped
     this panel for a furnace, chest or structure block, but its direct callers did not: armour
     wearing down from a hit, a shield blocking, a torch placed from the offhand. So taking a blow
     with a chest open popped the equipment panel up over the chest. */
  // ...and since 0.795 a tab can put it back over them: it shows exactly when the Equipment tab is the one up
  if (player.canFly || invRightTab() !== 'equip') { panel.style.display = 'none'; return; }
  /* ...and never over the skill tree. Its direct callers (an effect starting or ending, armour wearing, food
     spoiling in the offhand) rebuilt it while the tree was up, and it stood there over the tree until the next full
     rebuild. The same guard is on the other panels' builders (invPanelHeld, ui/inventory.js). */
  if (invPanelHeld(panel)) return;
  panel.style.display = 'flex';
  const cell = (s, i) => {
    const item = equipSlots[i];
    const ph = s.accepts ? '' : ' ph';
    return `<div class="slot eq${ph}" data-eq="${i}" data-name="${s.label}">${slotInner(item)}` +
           (item ? '' : _eqTag(EQUIP_TAG[s.key] || s.label)) + '</div>';
  };
  let left = '', right = '';
  EQUIP_SLOTS.forEach((s, i) => { (s.col === 'l' ? (left += cell(s, i)) : (right += cell(s, i))); });
  /* Every stat reads to one decimal: a percentage as "100.0%", a flat number as "0.0". A line is
     green when it is better than the default and orange when worse — for hunger depletion, lower is better. */
  const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const pct = (mul) => f1(mul * 100) + '%';
  const tone = (v, base, higherIsGood = true) => {
    const d = Math.round((v - base) * 1000);
    return !d ? '' : (d > 0) === higherIsGood ? ' good' : ' bad';
  };
  const row = (label, value, cls = '') => `<div class="stRow${cls}"><span>${label}</span><b>${value}</b></div>`;
  const pts = playerArmorPoints(), red = 1 - armorDamageMultiplier();
  const spd = playerMoveSpeedMul(), str = playerStrength(), atk = playerAtkSpeedMul();
  const cold = Math.min(1, Math.max(-1, _resSum('coldResist'))), heat = Math.min(1, Math.max(-1, _resSum('heatResist')));
  const jmp = playerJumpMul(), cft = playerCraftSpeedMul(), tough = playerToughness();
  const dep = typeof playerDepletionMul === 'function' ? playerDepletionMul() : 1;   // one line for every bar since 0.828
  const hazard = 1 - (typeof skillHazardMul === 'function' ? skillHazardMul() : 1);
  const hs = typeof playerHeatstrokeResist === 'function' ? playerHeatstrokeResist() : 0;
  const sight = 1 - (typeof playerSightMul === 'function' ? playerSightMul() : 1);   // Clear Eyes; vegetable sickness
  const mine = typeof playerMiningSpeedMul === 'function' ? playerMiningSpeedMul() : 1;   // 0.8323
  // regen (Rapid regen, tiredness), how fast carried food spoils (Preserver, salt), how long effects last (Lingering)
  const regen = typeof playerRegenMul === 'function' ? playerRegenMul() : 1;
  const spoil = typeof playerSpoilMul === 'function' ? playerSpoilMul() : 1;
  const effT = typeof playerEffectTimeMul === 'function' ? playerEffectTimeMul() : 1;
  let stats =
    row('defense', f1(pts)) +
    row('damage reduced', pct(red)) +
    row('move speed', pct(spd), tone(spd, 1)) +
    row('strength', (str > 0 ? '+' : '') + f1(str), tone(str, 0)) +
    row('attack speed', pct(atk), tone(atk, 1)) +
    row('toughness', pct(tough), tone(tough, 0)) +
    row('cold resistance', pct(cold), tone(cold, 0)) +
    row('heat resistance', pct(heat), tone(heat, 0)) +
    row('jump strength', pct(jmp), tone(jmp, 1)) +
    row('crafting speed', pct(cft), tone(cft, 1)) +
    row('mining speed', pct(mine), tone(mine, 1)) +                          // 0.8323
    row('stats depletion', pct(dep), tone(dep, 1, false)) +                  // hunger and oxygen depletion until 0.828
    row('regen', pct(regen), tone(regen, 1)) +                               // 0.832
    row('hazard reduction', pct(hazard), tone(hazard, 0)) +                   // 0.7911
    row('heatstroke resistance', pct(hs), tone(hs, 0)) +                      // the reserved line
    row('visibility reduction', pct(sight), tone(sight, 0)) +                 // 0.8291
    row('spoil speed', pct(spoil), tone(spoil, 1, false)) +                   // 0.832
    row('effect duration', pct(effT), tone(effT, 1)) +                        // 0.832
    '<div class="stRow slotFree"><span>&mdash;</span><b></b></div>';          // an empty line kept for a stat to come
  // the stats get the room; effects are a short strip under them
  stats = '<div class="stGrid">' + _tagStatRows(stats) + '</div>';   // hoverable, with a tooltip each
  const eff = activeEffects();
  stats += '<div class="ctitle stTitle">Effects</div><div class="effList">' + (eff.length
    ? eff.map((e, i) =>
        // data-eff: its index in activeEffects(), read back by the tooltip; no time column since 0.8323 —
        // the effect bar by the hotbar shows each one's time
        `<div class="stRow eff${e.good === false ? ' bad' : ''}" data-eff="${i}"><span>${e.name}</span></div>`).join('')
    : '<div class="stRow none"><span>no active effects</span></div>') + '</div>';
  // belt row: only present while a belt is worn, sized by that belt's slot count
  const cap = beltCapacity();
  let beltRow = '';
  if (cap > 0) {
    let cells = '';
    for (let i = 0; i < cap; i++)
      cells += `<div class="slot belt" data-belt="${i}" data-name="Belt slot">${slotInner(beltSlots[i])}</div>`;
    beltRow = `<div id="beltRow">${cells}</div>`;
  }
  panel.innerHTML =                                  // no "Equipment" title since 0.796: its tab says so
    beltRow +
    '<div id="equipBody">' +
      `<div class="eqCol">${left}</div>` +
      '<div id="equipPreview"></div>' +
      `<div class="eqCol">${right}</div>` +
    '</div>' +
    // reserved tool slots: placeholders only, not in equipSlots and not drag targets
    '<div id="toolRow">' + TOOL_SLOT_NAMES.map(n =>
      `<div class="slot tool" data-name="${n} (not in the game yet)">${_eqTag(n)}</div>`).join('') +
    '</div>' +
    '<div class="ctitle stTitle">Stats</div>' +
    `<div id="equipStats">${stats}</div>`;
  // the tabs on top: the open station if any, Equipment, and the Skill tree, which used to be a button here
  addInvTabs(panel, 'equip');
  if (_pvRenderer) {                                 // re-attach the existing canvas after rebuild
    invPanel('equipPreview').appendChild(_pvRenderer.domElement);
    _pvArmorKey = '';                                // force an overlay refresh
  } else _pvInit();
}
