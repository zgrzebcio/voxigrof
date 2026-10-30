'use strict';
/* ui/tooltips.js: an item's tooltip: its stats, what it is made into, how long it keeps. */

/* ---- item tooltip ----
   One fixed-width panel: name, then the (author-supplied) description, then a stat block that
   depends on what the thing is. Tools list wear + combat + mining numbers, food lists what it
   restores. Blocks and plain materials show just the name and description. */
const _tipNum = (n) => Number.isInteger(n) ? String(n) : (+n).toFixed(2).replace(/\.?0+$/, '');
const _tipEsc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
/* m:ss, because a spoil time is read as a countdown rather than as a number of seconds. Anything
   under a minute stays in plain seconds, where "45s" is quicker to read than "0:45". */
function _tipTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return s < 60 ? s + 's' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/* What a block can become: its variants straight from BLOCK_VARIANTS (blocks/variants.js), its shapes from what the
   block it places as takes (SHAPE_BLOCKS in 02, through PROPS.shapes), named as the chisel radial names them.
   Nothing is written per block, so a new variant or shape shows up here on its own. */
function _blockFormsHTML(id) {
  const list = (label, names) => `<div class="tipCond"><div class="tcName">${label}:</div>` +
                                 `<div class="tcEff info">${_tipEsc(names.join(', '))}</div></div>`;
  let html = '';
  const vars = typeof BLOCK_VARIANTS !== 'undefined' ? BLOCK_VARIANTS[id] : null;
  // the default leads the list: its own name where it has one (a furnace's stone), else "default"
  if (vars && vars.length)
    html += list('Variants', [(typeof VARIANT_DEFAULT_NAME !== 'undefined' && VARIANT_DEFAULT_NAME[id]) || 'default', ...vars.map(v => v.name)]);
  // what placing it takes beside itself, by variant (WHAT A PICK TAKES, blocks/variants.js)
  if (typeof VARIANT_DEFAULT_NEED !== 'undefined') {
    const dn = VARIANT_DEFAULT_NEED[id], needs = [];
    if (dn != null) needs.push(`${(VARIANT_DEFAULT_NAME[id] || 'default')}: 1 ${PROPS[dn].name.toLowerCase()}`);
    for (const v of vars || []) if (v.need != null) needs.push(`${v.name}: 1 ${PROPS[v.need].name.toLowerCase()}`);
    if (needs.length) html += list('Placing takes', needs);
  }
  const shapes = PROPS[typeof heldBlockOf === 'function' ? heldBlockOf(id) : id]?.shapes;
  if (shapes && typeof CHISEL_SHAPES !== 'undefined') {
    const names = CHISEL_SHAPES.filter(s => !s.soon && shapes[CHISEL_BLOCK_SHAPE[s.key]]).map(s => s.name.toLowerCase());
    if (names.length) html += list('Shapes', names);
  }
  return html;
}
function itemTooltipHTML(id, dur, fresh, wm, lock) {   // lock: a key's
  if (id == null) return '';
  const isItem = id >= 256;
  const p = isItem ? ITEM_PROPS[id] : PROPS[id];
  if (!p) return '';
  // a block shows its picked variant in brackets, e.g. "Stone (brick)"
  const nm = !isItem && typeof variantNameOf === 'function' ? variantNameOf(id) : p.name;
  let html = `<div class="tipName">${_tipEsc(nm || '')}</div>`;   // wear is a stat row here, not in the name
  if (p.desc) html += `<div class="tipDesc">${_tipEsc(p.desc)}</div>`;
  if (!isItem) html += _blockFormsHTML(id);
  /* Set bonus. Written once per MATERIAL in ARMOR_SET_BONUS rather than copied into five
     `desc` strings, so the wording can never drift between the helmet and the boots. Gloves are
     not part of the set, so they simply do not carry the line. */
  /* What an item DOES, one block per trigger:
         On {condition}:
             {effect, or No effect}
     A worn piece always says what wearing it does, even when that is nothing, so an empty line reads
     as "checked" rather than "forgotten". */
  const conds = [];                                   // [condition, effect, '' | 'bad' | 'none']
  if (p.equip) {
    if (p.equip !== 'gloves' && p.armorMat && typeof ARMOR_SET_BONUS !== 'undefined') {
      const b = ARMOR_SET_BONUS[p.armorMat];
      if (b) conds.push(['full set', b.desc.replace(/^Full set:\s*/i, ''), b.good ? '' : 'bad']);
    }
    if (p.shield) conds.push(['raise', 'Slows you down, cannot sprint', 'bad']);
    conds.push(['worn', p.packSlots ? `+${p.packSlots} backpack slots`
                      : p.beltSlots ? `+${p.beltSlots} belt slots`
                      : p.hotbarSlots ? `+${p.hotbarSlots} hotbar slots`                                          // the belt
                      : p.chisel ? (p.equip === 'necklace' ? 'In the Neck slot: hold R to pick a block variant'   // the chisel
                                                           : 'Hold Q (hold B on a gamepad) to pick a block shape') : 'No effect',   // 0.78
                (p.packSlots || p.beltSlots || p.hotbarSlots || p.chisel) ? '' : 'none']);
  }
  if (p.ammo) conds.push(['hit', 'No effect', 'none']);
  if (p.foodClearEffects) conds.push(['drink', 'Removes all active effects', '']);   // milk
  const ed = p.foodEffect && typeof EFFECT_DEFS !== 'undefined' ? EFFECT_DEFS[p.foodEffect] : null;
  if (ed) {
    const ch = p.foodEffectChance;                    // a chance effect says how likely it is
    const what = `${ed.name} (${p.foodEffectTime || ed.time}s)`;   // "50% chance to Nausea (10s)"; a food's own length
    conds.push(['eat', ch != null && ch < 1 ? `${Math.round(ch * 100)}% chance to ${what}` : what, ed.good ? '' : 'bad']);
  }
  for (const [c, eff, cls] of conds)
    html += `<div class="tipCond"><div class="tcName">On ${c}:</div>` +
            `<div class="tcEff${cls ? ' ' + cls : ''}">${_tipEsc(eff)}</div></div>`;
  const rows = [];
  // weapons read like tools: a bow lists durability, damage and attack speed too
  if (p.tool || p.ranged) {
    const maxD = p.durability;
    if (maxD) rows.push(['durability', `${dur != null ? dur : maxD}/${maxD}`]);
    if (p.damage != null) rows.push(['damage', _tipNum(p.damage)]);
    /* A bow's shot: what an arrow does from the weakest release that still fires up to a full
       draw, by the same formula fireRanged uses (strength from gear is added on top of both). */
    if (p.ranged && typeof rangedProps === 'function' && typeof ammoProps === 'function') {
      const rp = rangedProps(id), ap = rp && ammoProps(ammoIdsFor(rp)[0]);
      if (ap) {
        const shot = (draw) => ap.damage * (0.35 + 0.65 * draw) * (rp.dmgMul || 1);
        rows.push(['shot damage', `${shot(rp.minDraw || 0).toFixed(1)}–${shot(1).toFixed(1)}`]);
      }
    }
    if (p.attackSpeed != null) rows.push(['attack speed', _tipNum(p.attackSpeed)]);
    if (p.toolSpeed != null) rows.push(['mine speed', _tipNum(p.toolSpeed)]);
  }
  if (p.equip) {
    const maxD = p.durability;
    if (maxD) rows.push(['durability', `${dur != null ? dur : maxD}/${maxD}`]);
    if (p.armor != null) rows.push(['defense', _tipNum(p.armor)]);   // called defense since 0.7612
    // stat modifiers only listed when the piece actually carries them
    if (p.strength) rows.push(['strength', (p.strength > 0 ? '+' : '') + _tipNum(p.strength)]);
    if (p.moveSpeed) rows.push(['move speed', (p.moveSpeed > 0 ? '+' : '') + _tipNum(p.moveSpeed * 100) + '%']);
    if (p.atkSpeed) rows.push(['attack speed', (p.atkSpeed > 0 ? '+' : '') + _tipNum(p.atkSpeed * 100) + '%']);
    if (p.coldResist) rows.push(['cold resistance', (p.coldResist > 0 ? '+' : '') + _tipNum(p.coldResist * 100) + '%']);
    if (p.heatResist) rows.push(['heat resistance', (p.heatResist > 0 ? '+' : '') + _tipNum(p.heatResist * 100) + '%']);
    if (p.heatstrokeResist) rows.push(['heatstroke', _tipNum(p.heatstrokeResist * 100) + '% slower' + (p.heatstrokeTrigger ? ', ' + _tipNum(p.heatstrokeTrigger) + '°C later' : '')]);   // a hat
  }
  /* Mender: anything that wears says what a repair costs and where it can be done — cost in the
     tooltip, where you look before you drag it over. Broken says so; Well made (Fine Work) says so. */
  if (p.durability) {
    if (wm) rows.push(['quality', 'Well made']);
    if (dur === 0) rows.push(['status', 'Broken']);
    const cost = typeof hasSkill === 'function' && hasSkill('mender') && typeof repairCostText === 'function'
      ? repairCostText(id, dur) : '';   // scaled by how worn it is
    if (cost) {
      rows.push(['repair cost', _tipEsc(cost)]);
      rows.push(['repair at', repairNeedsBench(id) ? 'crafting bench' : 'anywhere']);
    }
    // Dismantle: what breaking it down would give back right now
    if (typeof hasSkill === 'function' && hasSkill('dismantle') && typeof dismantleText === 'function')
      rows.push(['dismantles to', _tipEsc(dismantleText(id, dur) || 'nothing')]);
  }
  // a key: blank, or the door it is bound to (one whose door was broken is blank again)
  if (p.key && typeof keyBoundCode === 'function') {
    const code = keyBoundCode(lock != null ? { lock } : null), at = code != null ? keyDoorPos(code) : null;
    // ...or the chest: the lock map holds both
    const what = at && typeof isChestId === 'function' && isChestId(getBlock(at[0], at[1], at[2]) & 255) ? 'a chest' : 'a door';
    rows.push(['lock', at ? `${what} at ${at[0]}, ${at[1]}, ${at[2]}` : 'blank: right-click a door or a chest to lock it']);
  }
  if (p.food != null || p.drink) {                  // a bottle of water is a drink with no food in it
    if (p.food != null) rows.push(['food', _tipNum(p.food)]);
    // saturation is food's over-stat since 0.82
    // ...shown as what eating really gives: half the table's number since 0.8443 (OVER_FOOD_GAIN, player/stats.js)
    const og = typeof OVER_FOOD_GAIN === 'number' ? OVER_FOOD_GAIN : 1;
    if (p.foodSat != null) rows.push(['over-food', _tipNum(p.foodSat * og)]);
    if (p.foodSatFull != null) rows.push(['over-food when full', _tipNum(p.foodSatFull * og)]);
    if (p.foodHeal) rows.push(['health', '+' + _tipNum(p.foodHeal)]);          // 0.758
    // what else it fills (0.82, FOOD_NUTRITION in player/stats.js)
    for (const [k, label] of [['thirst', 'thirst'], ['fruit', 'fruit'], ['veg', 'vegetables'], ['protein', 'protein'], ['energy', 'energy'], ['stamina', 'stamina']]) {   // energy 0.832
      if (p[k]) rows.push([label, (p[k] > 0 ? '+' : '') + _tipNum(p[k])]);   // white berries take thirst
      if (p[k + 'Full'] != null) rows.push([label + ' when full', '+' + _tipNum(p[k + 'Full'])]);   // a carrot's vegetables, a coconut's water
    }
    if (p.foodCleanse) rows.push(['bad effects', '-' + _tipNum(p.foodCleanse) + 's']);
    rows.push(['consume time', _tipNum(p.eatTime ?? EAT_TIME) + 's']);
    // what is handed back once it is eaten or drunk, and how often (foodReturnChance)
    if (p.foodReturn != null) {
      const rp = p.foodReturn >= 256 ? ITEM_PROPS[p.foodReturn] : PROPS[p.foodReturn], ch = p.foodReturnChance ?? 1;
      if (rp && rp.name) rows.push(['leaves', _tipEsc(rp.name) + (ch < 1 ? ' (' + Math.round(ch * 100) + '%)' : '')]);
    }
  }
  {
    /* How long this has left before one of it spoils, against how long it keeps from fresh. A recipe
       icon has no instance behind it, so it shows the full shelf life. for anything with a clock, not
       only what you can eat as it is — a pumpkin spoils too, and never said so. */
    const maxF = typeof spoilMax === 'function' ? spoilMax(id) : 0;
    /* the food's own clock: it counts down at the spoil speed, so salt and Preserver make the seconds go
       visibly slower (it was shown in real seconds, which always ticked one a second) */
    const rate = typeof spoilRate === 'function' ? spoilRate() : 1;
    if (maxF) rows.push(['spoils in', `${_tipTime(fresh != null ? fresh : maxF)} / ${_tipTime(maxF)}`]);
    if (maxF && Math.abs(rate - 1) > 0.005) rows.push(['spoil speed', Math.round(rate * 100) + '%']);
    // what one of it leaves behind when it goes off: rotten flesh, a fiber, its bucket
    if (maxF && p.spoilInto != null) {
      const ip = p.spoilInto >= 256 ? ITEM_PROPS[p.spoilInto] : PROPS[p.spoilInto];
      if (ip && ip.name) rows.push(['spoils into', _tipEsc(ip.name)]);
    }
  }
  if (rows.length) {
    html += '<div class="tipStats">';
    for (const [k, v] of rows) html += `<div class="tipRow"><span>${k}</span><b>${v}</b></div>`;
    html += '</div>';
  }
  return html;
}
/* The name that pops up over the hotbar. A tool, bow or shield in the main hand carries its wear,
   "Stone pickaxe (87/100)"; anything else is just its name, and the tooltip keeps the plain name.
   `dur` null means never used. */
function itemDisplayName(id, dur) {
  const p = id >= 256 ? ITEM_PROPS[id] : PROPS[id];
  if (!p) return '';
  const max = (p.tool || p.ranged || p.shield || p.chisel) ? p.durability : 0;
  if (max && dur === 0) return `${p.name} (broken)`;         // kept by Mender, waiting for repair
  if (max) return `${p.name} (${dur != null ? dur : max}/${max})`;
  // a block shows its picked variant, "Stone (brick)"
  return (id < 256 && typeof variantNameOf === 'function' ? variantNameOf(id) : p.name) || '';
}
/* place the panel near the cursor but always fully on screen. Called every frame while something is under the cursor:
   its words are written only when they change, and it is measured (a layout of the page) only then or when it was
   hidden; the rest of the time only its place moves, and only when it does. */
function showTooltip(html) {
  if (ctipEl._html !== html) { ctipEl.innerHTML = html; ctipEl._html = html; ctipEl._size = null; }
  if (ctipEl.style.display !== 'block') { ctipEl.style.display = 'block'; ctipEl._size = null; }
  if (!ctipEl._size) { const r = ctipEl.getBoundingClientRect(); ctipEl._size = [r.width, r.height]; }
  const [w, h] = ctipEl._size;
  let x = invCursor.x + 16, y = invCursor.y + 18;
  if (x + w > window.innerWidth - 6) x = invCursor.x - w - 12;
  if (y + h > window.innerHeight - 6) y = invCursor.y - h - 12;
  const left = Math.max(6, x) + 'px', top = Math.max(6, y) + 'px';
  if (ctipEl.style.left !== left) ctipEl.style.left = left;
  if (ctipEl.style.top !== top) ctipEl.style.top = top;
}
