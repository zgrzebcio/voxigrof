'use strict';
/* voxiGrof — the vitals HUD, the hazards that hurt you, and dying

   What the bars ARE and how they rise and fall (food, thirst, stamina, energy, oxygen, temperature...) is
   54-stats-effects.js since 0.82. This file draws them, runs the outside hazards (falls, cactus, lava, fire),
   soaks hits with armor, and handles death and respawn. */

/* ---------------------------------- survival vitals HUD ----------------------------------
   0.82: every bar is out of 100 and five icons long, and the strip follows the design sketch:
     left of the centre   health, armor over it
     right of the centre  food, thirst over it
     the centre           the temperature dial just over the level number, stamina over it, oxygen over
                          that — stamina and oxygen only while they are not full
     far left and right   vegetables and energy, protein and fruit: only while the inventory is open
   With the inventory open every bar shows, and hovering one gives its numbers (vitalsTipAt).
   An icon is its dark silhouette (<bar>_bg), then its picture filled sideways from its row's outer end as far as
   that icon's fifth of the bar goes (0.8245; up from the bottom before), then the white outline (<bar>_overlay)
   for the over-stat, 10 an icon, filled the same way.
   The canvas is drawn at VIT_RES bitmap pixels per CSS pixel and shown at its CSS size (style.css). */
var vitalsEl = document.getElementById('vitals');
var vctx = vitalsEl.getContext('2d');

const LAVA_FIRE_S = 10;                      // seconds you stay alight after touching lava (0.8195)
const VIT_W = 780, VIT_H = 76, VIT_RES = 2;  // the strip's CSS size (matches #vitals), and its supersampling
const VIT_ICONS = 5;
/* One row a bar: its left edge from the strip's centre and its top from the strip's top (CSS px), the icon
   size, the end it fills from (the outer one, so both sides drain toward the middle), and `inv` for the
   bars only an open inventory shows. */
const VIT_LAYOUT = [
  { key: 'hp',      x: -235, top: 52, size: 24, from: 'left' },
  { key: 'armor',   x: -235, top: 24, size: 24, from: 'left' },
  { key: 'food',    x:  111, top: 52, size: 24, from: 'right' },
  { key: 'thirst',  x:  111, top: 24, size: 24, from: 'right' },
  { key: 'veg',     x: -385, top: 52, size: 24, from: 'left',  inv: true },
  { key: 'energy',  x: -385, top: 24, size: 24, from: 'left',  inv: true },
  { key: 'protein', x:  261, top: 52, size: 24, from: 'right', inv: true },
  { key: 'fruit',   x:  261, top: 24, size: 24, from: 'right', inv: true },
  { key: 'stamina', x:  -52, top: 25, size: 20, from: 'left' },
  { key: 'air',     x:  -52, top: 3,  size: 20, from: 'left' },
];
const VIT_TEMP = { x: -15, top: 46, size: 30 };        // the temperature dial
// the armor bar's pictures per armorMat; gold has its own, diamond borrows steel's, cloth its own (items 0.824)
const ARMOR_HUD_ART = { leather: 'leather', iron: 'iron', golden: 'gold', diamond: 'steel', cloth: 'fibre_cloth' };
// a quarter of an armor icon at a time: the bottom-left block, the whole left half, the bottom-right, the right half
const ARMOR_PART_ART = ['left_25', 'left_50', 'right_25', 'right_50'];

function _vitRowShown(r, inv) {
  if (inv) return true;
  if (r.inv) return false;
  if (r.key === 'armor') return playerArmorPoints() > 0;
  // ...and while it is being used, which may be only over-stamina going (0.828; hidden then before)
  if (r.key === 'stamina') return player.stamina < MAX_STAMINA - 0.05 || player._stamShowT > 0;
  if (r.key === 'air') return !!player._eyeUnder || player.air < MAX_AIR - 0.05;
  return true;
}
/* `img` at (x, y) size s, showing only `frac` of it measured over the columns it actually paints: a horizontal
   progress bar (0.8245; it filled from the bottom before), from its left side, or its right with `fromRight`
   so each icon fills the same way as its row. */
function _drawFill(g, img, cols, x, y, s, frac, fromRight) {
  if (!img || !(frac > 0)) return;
  if (frac >= 1) { g.drawImage(img, x, y, s, s); return; }
  const [l, r] = cols || [0, img.width], k = s / img.width;
  if (fromRight) {
    const cut = r - (r - l) * frac;
    g.drawImage(img, cut, 0, img.width - cut, img.height, x + cut * k, y, (img.width - cut) * k, s);
  } else {
    const cut = l + (r - l) * frac;
    g.drawImage(img, 0, 0, cut, img.height, x, y, cut * k, s);
  }
}
function _paintBarRow(g, r) {
  const p = player, max = r.key === 'hp' ? playerMaxHP(p) : VITAL_MAX[r.key], per = max / VIT_ICONS, s = r.size;   // Thick Skin's 110 (0.828)
  const v = p[r.key] ?? max, ok = OVER_KEY[r.key], over = ok ? (p[ok] || 0) : 0, overPer = MAX_OVER / VIT_ICONS;
  const bg = GUI_IMG[r.key + 'Bg'], fill = GUI_IMG[r.key], ovr = GUI_IMG[r.key + 'Over'];
  for (let j = 0; j < VIT_ICONS; j++) {
    const i = r.from === 'left' ? j : VIT_ICONS - 1 - j;          // which fifth of the bar this icon holds
    const x = r.x + j * (s + 1), y = r.top;
    const frac = Math.max(0, Math.min(1, (v - i * per) / per));
    if (bg) g.drawImage(bg, x, y, s, s);
    // a bubble on its way out bursts, as the old row did
    if (r.key === 'air' && frac > 0 && frac < 1 && GUI_IMG.airBurst) g.drawImage(GUI_IMG.airBurst, x, y, s, s);
    else _drawFill(g, fill, GUI_FILL[r.key], x, y, s, frac, r.from === 'right');
    if (ok) _drawFill(g, ovr, GUI_FILL[r.key + 'Over'], x, y, s, Math.max(0, Math.min(1, (over - i * overPer) / overPer)), r.from === 'right');
  }
}
/* Armor is MIXED (0.731): the pieces inside one icon can be different materials. Each icon holds four
   quarters (playerArmorPointMats, 31-equipment.js); four of one material draw its whole picture, otherwise
   each half is drawn first and its lower quarter over it when a different piece filled that one. */
function _paintArmorRow(g, r) {
  const mats = playerArmorPointMats(), s = r.size;
  const art = (m, part) => GUI_IMG['armor_' + (ARMOR_HUD_ART[m] || 'iron') + (part ? '_' + part : '')];
  for (let j = 0; j < VIT_ICONS; j++) {
    const x = r.x + j * (s + 1), y = r.top;
    const put = (img) => { if (img) g.drawImage(img, x, y, s, s); };
    put(GUI_IMG.armorBg);
    const q = mats.slice(j * 4, j * 4 + 4);
    if (!q.length) continue;
    if (q.length === 4 && q.every(m => m === q[0])) { put(art(q[0])); continue; }
    if (q[1]) put(art(q[1], 'left_50'));
    if (q[0] && q[0] !== q[1]) put(art(q[0], 'left_25'));
    if (q[3]) put(art(q[3], 'right_50'));
    if (q[2] && q[2] !== q[3]) put(art(q[2], 'right_25'));
  }
}
/* The temperature dial: the strip runs -40°C (top) to 80°C (bottom), 20°C in its middle, and the round window
   shows a square of it centred on the temperature, which is where the frame's two arrows point. Past either
   end the window runs off the strip and shows the dark face. */
function _paintTemp(g) {
  const { x, top: y, size: s } = VIT_TEMP, k = s / 128;
  const t = Math.max(-40, Math.min(80, typeof player.temp === 'number' ? player.temp : 20));
  if (GUI_IMG.temp_bg) g.drawImage(GUI_IMG.temp_bg, x, y, s, s);
  const strip = GUI_IMG.temp_strip;
  if (strip) {
    const half = strip.width / 2, cy = (t + 40) / 120 * strip.height;
    const s0 = Math.max(0, cy - half), s1 = Math.min(strip.height, cy + half), dk = 96 * k / strip.width;
    g.save();
    g.beginPath(); g.arc(x + 64 * k, y + 64 * k, 48 * k, 0, Math.PI * 2); g.clip();
    if (s1 > s0) g.drawImage(strip, 0, s0, strip.width, s1 - s0, x + 16 * k, y + 16 * k + (s0 - (cy - half)) * dk, 96 * k, (s1 - s0) * dk);
    g.restore();
  }
  if (GUI_IMG.temp_frame) g.drawImage(GUI_IMG.temp_frame, x, y, s, s);
}
function paintVitals() {
  const W = VIT_W * VIT_RES, H = VIT_H * VIT_RES;
  if (vitalsEl.width !== W || vitalsEl.height !== H) { vitalsEl.width = W; vitalsEl.height = H; }
  const g = vctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;                    // 128px art drawn at 24: smooth, not nearest
  g.imageSmoothingQuality = 'high';
  g.setTransform(VIT_RES, 0, 0, VIT_RES, VIT_W / 2 * VIT_RES, 0);   // CSS px from here on, x from the centre
  const inv = !!invOpen, hits = [];
  for (const r of VIT_LAYOUT) {
    if (!_vitRowShown(r, inv)) continue;
    if (r.key === 'armor') _paintArmorRow(g, r); else _paintBarRow(g, r);
    hits.push({ key: r.key, x: r.x, y: r.top, w: VIT_ICONS * (r.size + 1) - 1, h: r.size });
  }
  _paintTemp(g);
  hits.push({ key: 'temp', x: VIT_TEMP.x, y: VIT_TEMP.top, w: VIT_TEMP.size, h: VIT_TEMP.size });
  g.setTransform(1, 0, 0, 1, 0, 0);
  vitalsEl._hits = hits;                             // per pane: each seat hovers its own strip
}
// the tooltip for whichever bar is under the inventory cursor, or '' (20-inventory-ui.js, 0.82)
function vitalsTipAt(cx, cy) {
  if (!vitalsShown || !invOpen || !vitalsEl._hits) return '';
  const r = vitalsEl.getBoundingClientRect();
  if (!r.width || !r.height) return '';
  const x = (cx - r.left) / r.width * VIT_W - VIT_W / 2, y = (cy - r.top) / r.height * VIT_H;
  for (const h of vitalsEl._hits)
    if (x >= h.x - 2 && x <= h.x + h.w + 2 && y >= h.y - 2 && y <= h.y + h.h + 2) return vitalTipHTML(h.key);
  return '';
}
// what the strip shows, rounded to what can be seen: it repaints only when this changes
const VIT_KEYS = ['hp', 'food', 'saturation', 'thirst', 'thirstO', 'stamina', 'staminaO', 'energy', 'energyO',
                  'fruit', 'fruitO', 'veg', 'vegO', 'protein', 'proteinO', 'air', 'temp'];
function _vitalsKey() {
  let k = (invOpen ? 'I' : '') + (player._eyeUnder ? 'U' : '') + (player._stamShowT > 0 ? 'S' : '') + playerMaxHP() + '|' + armorBarSignature();
  for (const key of VIT_KEYS) k += ',' + Math.round((player[key] || 0) * 2);
  return k;
}
var vitalsDirty = true, vitalsShown = false;

// GUI sprite textures — loaded async on world entry; vitalsDirty set per load to force a repaint
const GUI_IMG = {};
const GUI_FILL = {};                         // each picture's painted columns [left, right), for filling by width (0.8245)
let ensureVitalsSprites = () => {};
{
  const ART = 'textures/Gui/Vitals/', _p = {};
  // a bar's three pictures (0.82): silhouette, picture, over-stat outline
  const bar = (key, dir, base) => {
    _p[key + 'Bg'] = `${ART}${dir}/${base}_bg.png`;
    _p[key] = `${ART}${dir}/${base}.png`;
    _p[key + 'Over'] = `${ART}${dir}/${base}_overlay.png`;
  };
  bar('hp', 'Heart', 'health'); bar('food', 'Food', 'food'); bar('thirst', 'Thirst', 'thirst');
  bar('stamina', 'Stamina', 'stamina'); bar('energy', 'Energy', 'energy'); bar('air', 'Oxygen', 'oxygen');
  bar('fruit', 'Fruit', 'fruit'); bar('veg', 'Vegetables', 'vegetables'); bar('protein', 'Protein', 'protein');
  _p.airBurst = ART + 'Oxygen/air_bursting.png';
  _p.armorBg = ART + 'Armor/armor_bg.png';
  for (const m of new Set(Object.values(ARMOR_HUD_ART))) {
    _p['armor_' + m] = `${ART}Armor/armor_${m}.png`;
    for (const q of ARMOR_PART_ART) _p[`armor_${m}_${q}`] = `${ART}Armor/armor_${m}_${q}.png`;
  }
  for (const n of ['bg', 'frame', 'strip']) _p['temp_' + n] = `${ART}temperature/temperature_${n}.png`;
  // the columns a picture actually paints, so a fill of 10% is 10% of the heart and not of the empty margin
  const paintedCols = (img) => {
    try {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let left = -1, right = -1;
      for (let x = 0; x < c.width; x++)
        for (let y = 0; y < c.height; y++)
          if (d[(y * c.width + x) * 4 + 3] > 8) { if (left < 0) left = x; right = x; break; }
      return left < 0 ? null : [left, right + 1];
    } catch { return null; }
  };
  /* Requested on world load, not at boot (0.7147): only survival ever draws the strip, and on a slow static
     server each request is a slot in the browser's six-per-origin queue that a block texture could use. */
  ensureVitalsSprites = function () {
    ensureVitalsSprites = () => {};              // once
    let pending = Object.keys(_p).length;
    for (const [k, src] of Object.entries(_p)) {
      const img = new Image();
      const done = () => { if (--pending <= 0) { vitalsSpritesReady = true; vitalsDirty = true; } };
      img.onload = () => { GUI_IMG[k] = img; GUI_FILL[k] = paintedCols(img); vitalsDirty = true; done(); };
      img.onerror = done;                    // a missing file must not block the bar forever
      img.src = src;
    }
  };
}
/* The bar waits for its art: hidden until the sprites land, or until a second has passed, after which a
   partly drawn strip is better than none. */
let vitalsSpritesReady = false;
let _vitalsWaitT = 0;
/* Per frame, survival only. The bars themselves move in tickStats (54-stats-effects.js); this runs the
   outside hazards, soaks the frame's damage with armor, and handles dying. Every hit is out of 100 health
   since 0.82 (VITAL_K times what it was). */
function updateVitals(dt) {
  _vitalsWaitT += dt;
  const artReady = vitalsSpritesReady || _vitalsWaitT > 1.0;
  const survival = !player.canFly && player.spawned && artReady;
  if (survival !== vitalsShown) {
    vitalsShown = survival;
    vitalsEl.style.display = survival ? 'block' : 'none';
    vitalsDirty = true;
  }
  // hurt vignette fade-out (runs in any mode so it never sticks)
  if (_hurtA > 0) {
    _hurtA = Math.max(0, _hurtA - dt * 1.6);
    hurtEl.style.opacity = _hurtA.toFixed(3);
  }
  // heatstroke's blur and mirages (0.825): before the survival test, so creative clears them
  _syncHeatBlur();
  _updateMirages(dt);
  _syncDeathMark(dt);                            // where you last died (0.827)
  if (!survival) return;
  if (typeof flushOwedXP === 'function') flushOwedXP();   // XP earned while another seat ran (a sapling grew, 0.8283)
  if (!player.dead) player.aliveT = (player.aliveT || 0) + dt;   // survival stopwatch for the death screen
  /* The damage baseline is the HP this player had when updateVitals LAST FINISHED, not the HP it
     has on entry (0.7293).

     Mobs hit in updateEntities, which is part of the world tick and therefore runs AFTER every
     player's updateVitals. Diffing within the call could only ever see damage the call inflicted
     itself — fall, cactus, drowning, starvation — so a mob landing a blow produced no red flash,
     no camera kick, no hit sound, and (worse) skipped the armour soak entirely, since that used
     the same in-call baseline. Carrying the value across the frame boundary catches both. */
  const dmgBase = (typeof player._hpLast === 'number') ? player._hpLast : player.hp;

  // every bar: effects, stamina, healing, hunger and thirst, oxygen and drowning, temperature (0.82)
  tickStats(dt);

  /* Fall damage: track apex → landing (walking mode only); water cancels any fall.
     The landing test is `onGround()` since 0.7341, not `vy >= 0`. Velocity is a poor proxy for
     having landed: a fall that ends on a slab, a stair or any partial box can leave vy negative
     for several frames while the body settles, and the hit only registered once something else
     happened to push it back up — which is the damage that "arrived late". Standing on ground is
     unambiguous and true on the very frame you touch down. `vy > 0` still clears the fall too, so
     jumping out of a descent is not banked and charged to you on the next landing. */
  if (!player.flying) {
    if (player._inWater) player.fallStart = null;
    if (player.vy < -0.1 && player.fallStart == null) player.fallStart = player.pos.y;
    else if ((onGround() || player.vy > 0) && player.fallStart != null) {
      const fell = player.fallStart - player.pos.y;
      // hay bale fully absorbs fall damage when you land on it
      const landOn = getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.1), Math.floor(player.pos.z)) & 255;
      // half a block more slack before it counts (0.7148): the free-fall allowance is 3.5 blocks
      // and damage is measured past that, so a drop that only just exceeds it costs nothing
      if (fell > 4.0 && landOn !== B.HAY) { player.hp = Math.max(0, player.hp - (fell - 3.5) * VITAL_K * skillHazardMul()); player._dmgCause = 'fell from a high place'; }   // 5 health per block past 3.5
      player.fallStart = null;
    }
  } else player.fallStart = null;

  // cactus: any contact hurts (5 health / 0.8s) and knocks you away — small hop plus a horizontal
  // shove away from the cactus centre, applied through collision over a short burst
  if (!player.flying) {
    const p = player.pos, CR = player.R + 0.08;                // slightly expanded AABB = touch range
    let cactX = null, cactZ = null;
    const yLo = Math.floor(p.y - 0.1), yHi = Math.floor(p.y + player.H);
    outer:
    for (let yy = yLo; yy <= yHi; yy++)
      for (let xx = Math.floor(p.x - CR); xx <= Math.floor(p.x + CR); xx++)
        for (let zz = Math.floor(p.z - CR); zz <= Math.floor(p.z + CR); zz++)
          if ((getBlock(xx, yy, zz) & 255) === B.CACTUS) { cactX = xx; cactZ = zz; break outer; }
    if (cactX !== null) {
      updateVitals._cactusT = (updateVitals._cactusT || 0) - dt;
      if (updateVitals._cactusT <= 0) {
        updateVitals._cactusT = 0.8;
        player.hp = Math.max(0, player.hp - VITAL_K * skillHazardMul());   // Hazard Hide (0.79)
        player._dmgCause = 'was pricked by a cactus';
        player.vy = Math.max(player.vy, 5.5);
        let kx = p.x - (cactX + 0.5), kz = p.z - (cactZ + 0.5);
        const len = Math.hypot(kx, kz);
        if (len < 0.05) { const a = Math.random() * Math.PI * 2; kx = Math.cos(a); kz = Math.sin(a); }
        else { kx /= len; kz /= len; }
        player._kbx = kx * 10; player._kbz = kz * 10; player._kbT = 0.35;   // strong enough to beat walk speed
      }
    } else updateVitals._cactusT = 0;
  }
  // lava: 10 health per 0.5s while feet or body are inside lava
  if (!player.flying) {
    const p = player.pos;
    const feetId  = getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z)) & 255;
    const bodyId  = getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)) & 255;
    if (feetId === B.LAVA || bodyId === B.LAVA) {
      // ...and it sets you alight: you keep burning for LAVA_FIRE_S after you get out (0.8195)
      if (!player.canFly) {
        if (!(player.fireT > 0) && typeof playSound === 'function') playSound('fireIgnite', { gain: 0.8, pos: { x: p.x, y: p.y, z: p.z } });
        player.fireT = Math.max(player.fireT || 0, LAVA_FIRE_S);
      }
      updateVitals._lavaT = (updateVitals._lavaT || 0) - dt;
      if (updateVitals._lavaT <= 0) {
        updateVitals._lavaT = 0.5;
        player.hp = Math.max(0, player.hp - 2 * VITAL_K * skillHazardMul());   // Hazard Hide (0.79)
        player._dmgCause = 'burned to death';
      }
    } else updateVitals._lavaT = 0;
  }
  /* On fire (0.819, a lightning strike, 53-storms.js): 5 health a second until it burns out, or at once in water.
     The clock is on the player, since this runs once per seat. */
  if (player.fireT > 0) {
    const p = player.pos;
    const wet = (getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)) & 255) === B.WATER;
    if (wet || player.canFly || player.dead) {
      if (wet && typeof playSound === 'function') playSound('fireOff', { gain: 0.8, pos: { x: p.x, y: p.y, z: p.z } });   // 0.8191
      player.fireT = 0;
    }
    else {
      player.fireT -= dt;
      player._fireHurtT = (player._fireHurtT || 0) - dt;
      if (player._fireHurtT <= 0) {
        player._fireHurtT = 1;
        player.hp = Math.max(0, player.hp - VITAL_K * skillHazardMul());
        player._dmgCause = 'burned to death';
      }
      if (typeof fxOnFire === 'function') fxOnFire(p.x, p.y, p.z, player.H || 1.8, dt);
    }
  }
  if (player._kbT > 0) {
    player._kbT -= dt;
    collideAxis(0, player._kbx * dt);
    collideAxis(2, player._kbz * dt);
  }
  // the offhand beside the hotbar follows whatever the offhand holds, however it changed (0.7523)
  if (typeof syncOffhandSlot === 'function') syncOffhandSlot();

  /* Armor soak. Damage arrives from many places (fall, cactus, lava, drowning, mobs) as direct
     `player.hp -= n` writes, so rather than threading a helper through all of them the whole
     frame's loss is reduced here — before the death check, so armor can actually save you.
     The 2.5 floor (half an old point) keeps the slow poison drip from counting as a hit. */
  {
    const lost = dmgBase - player.hp;      // cross-frame, so a mob's blow is soaked too (0.7293)
    if (lost >= 0.5 * VITAL_K && !player.dead) {
      const mult = armorDamageMultiplier();
      if (mult < 1) player.hp = Math.min(playerMaxHP(), dmgBase - lost * mult);
      damageArmorDurability(lost / VITAL_K);   // wear follows how hard the hit was (0.756), in the old points
      statsOnHit(player, dmgBase - player.hp);  // a hit costs energy too (0.82)
      // ...and healing waits (0.7992): Rapid regen shortens the wait rather than ignoring it
      const wait = playerHasEffect('regenMul') ? REGEN_HIT_WAIT_FAST : REGEN_HIT_WAIT;
      player._regenWaitT = Math.max(player._regenWaitT || 0, wait);
      // red hearts for the hit — one per 5 health lost, hidden in your own first-person view (0.8)
      if (typeof fxHearts === 'function')
        fxHearts(player.pos.x, player.pos.y + 1.3, player.pos.z, false, (dmgBase - player.hp) / VITAL_K, fxOwner(player));
    }
  }
  // void death
  if (player.pos.y < -30) { player.hp = 0; player._dmgCause = 'fell into the void'; }
  // heatstroke at 100% (0.825, 54-stats-effects.js): no armor softens it
  if (player.heatstroke >= 100) { player.hp = 0; player._dmgCause = 'died of heatstroke'; }
  // the pause menu's Respawn (0.829): after the soak too, so armor never saves you from your own choice
  if (player._giveUp) { player._giveUp = false; player.hp = 0; player._dmgCause = 'gave up'; }
  // death: drop everything around the body, freeze input, show the death screen —
  // respawn happens when the player clicks Respawn (respawnPlayer below)
  if (player.hp <= 0 && !player.dead) {
    player.dead = true;
    player.effects = [];                         // death ends every timed effect (0.758)
    // the feed is one strip for the whole screen: it clears once nobody is left alive to read it (0.7576)
    if (typeof clearFeed === 'function' && PLAYERS.every(p => !p.spawned || p.dead)) clearFeed();
    player._deathDay = worldDay;                 // the day on the death screen, kept through a save (0.757)
    if (player.sleepingAt) leaveBed(player);     // dying in your sleep still gets you out of it
    playSound('death', { gain: 1 });
    const dx0 = Math.floor(player.pos.x), dy0 = Math.floor(player.pos.y + 0.5), dz0 = Math.floor(player.pos.z);
    /* Everything carried — worn gear included, and everything the belt and the backpack hold: a
       bag on your back is not a safe (0.75). The backpack is bounded by what the worn pack
       actually opened, so creative's block palette, which lives in that same array, is never
       touched. Read before equipSlots is emptied, since that is where the pack itself sits. */
    const packN = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
    _dropLifeOverride = DROP_LIFE_DEATH;         // everything a death spills lies 20 minutes (0.7981)
    // ...and the spot is marked on this player's screen until they get back to it or it all runs out (0.827)
    player._deathMark = { x: dx0, y: dy0, z: dz0, left: DROP_LIFE_DEATH };
    for (const [arr, len] of [[HOTBAR, HOTBAR.length], [invSlots, invSlots.length],
                              [equipSlots, equipSlots.length], [beltSlots, beltSlots.length],
                              [invSlots2, packN]])
      for (let i = 0; i < len; i++) {
        const s = arr[i];
        if (!s) continue;
        for (let n = 0; n < s.count; n++)
          spawnDrop(s.id, dx0, dy0, dz0,
            { x: (Math.random() - 0.5) * 5, y: 2 + Math.random() * 3, z: (Math.random() - 0.5) * 5 }, 2,
            s.dur ?? null, slotMeta(s));   // falls as it was: wear and extras kept, no free repair by dying (0.79)
        arr[i] = null;
      }
    // the crafting queue's ingredients were already taken from you, so they fall with the rest (0.76)
    if (typeof dropCraftQueueAt === 'function') dropCraftQueueAt(dx0, dy0, dz0);
    _dropLifeOverride = 0;
    saveAll(); buildHotbar();
    if (invOpen) toggleInventory(false);
    showDeathScreen(player._dmgCause || 'died');
  }
  if (player.dead) for (const k in keys) keys[k] = false;   // no wandering while dead
  // a death loaded from a save reopens its own screen, with the saved time, day and cause (0.757)
  if (player.dead && deathEl && deathEl.style.display !== 'flex') showDeathScreen(player._dmgCause || 'died');
  // ...and a living player never keeps one left over from another world (0.758)
  else if (!player.dead && deathEl && deathEl.style.display === 'flex') deathEl.style.display = 'none';
  // dead: this pane shows the death screen and nothing else (0.801, the .dying rules in style.css)
  if (deathEl && deathEl.parentElement) deathEl.parentElement.classList.toggle('dying', !!player.dead);
  // discrete hit this frame (fall / cactus / drown / starving — the slow poison drip stays below threshold):
  // red flash + camera kick, both scaled by how hard the hit was (in the old 20-point health, 0.82)
  const lostHp = dmgBase - player.hp;
  if (lostHp >= 0.5 * VITAL_K && !player.dead) {
    hurtFlash(lostHp / VITAL_K);
    if (typeof interruptBenchWork === 'function') interruptBenchWork();   // a hit knocks you off the bench (0.76)
    // central hook: every damage source (fall, cactus, lava, drowning, mobs) lands here
    playSound('hit', { gain: 0.9, rate: 0.95 + Math.random() * 0.1,
                       pos: { x: player.pos.x, y: player.pos.y + 1, z: player.pos.z } });
  }
  player._hpLast = player.hp;                 // baseline for whatever hurts them before next tick
  // repaint when anything the strip shows has visibly moved, the inventory opened or shut, or someone asked (0.82)
  const vk = _vitalsKey();
  if (vitalsDirty || vk !== vitalsEl._key) { vitalsEl._key = vk; paintVitals(); vitalsDirty = false; }
}

/* ---- hurt feedback: red vignette (strength scales with damage) + camera kick ---- */
var camShake = { t: 0, dur: 0.25, amp: 0 };
/* The red damage vignette is per player: it is created here but PLACED by 36-splitscreen.js,
   inside the owning player's HUD pane, so only the player who got hit sees red. */
var hurtEl = document.createElement('div');
hurtEl.id = 'hurtOverlay';
var _hurtA = 0;
function hurtFlash(lost) {
  _hurtA = Math.min(0.9, 0.3 + lost * 0.09);
  camShake.t = camShake.dur;
  camShake.amp = Math.min(0.06, 0.015 + lost * 0.007);
  hurtEl.style.opacity = _hurtA.toFixed(3);
}

/* HEATSTROKE ON THE VIEW (0.825). From 40% the world blurs, more as it climbs (heatstrokeBlur, 54-stats-effects.js),
   under a faint orange edge; the HUD stays sharp over it. Per player like the hurt vignette: 36-splitscreen.js puts
   it first in the player's pane, under the rest of the HUD. */
var heatBlurEl = document.createElement('div');
heatBlurEl.id = 'heatBlur';
function _syncHeatBlur() {
  const px = Math.round(heatstrokeBlur(player) * (typeof skillSightMul === 'function' ? skillSightMul() : 1) * 4) / 4;   // Clear Eyes (0.828)
  if (heatBlurEl._px === px) return;
  heatBlurEl._px = px;
  heatBlurEl.style.display = px > 0 ? 'block' : 'none';
  const f = px > 0 ? `blur(${px}px)` : '';
  heatBlurEl.style.backdropFilter = f;
  heatBlurEl.style.webkitBackdropFilter = f;
  heatBlurEl.style.setProperty('--hs', (px / HS_BLUR_MAX).toFixed(2));
}
/* MIRAGES (0.825). From HS_MIRAGE_AT heatstroke, by day, pools of water that are not there shimmer on open ground
   12-26 blocks ahead, on sand most of all. Each fades in, and fades away as you come within MIRAGE_NEAR of it, walk
   far from it, or the heatstroke eases. Each player sees only their own (showMiragesFor, from renderAllViews in
   36-splitscreen.js); they cast no shadow (layer 1). */
const MIRAGE_MAX = 3, MIRAGE_NEAR = 7, MIRAGE_FAR = 40;
const _MIRAGE_SAND = new Set([B.SAND, B.RED_SAND, B.PINK_SAND]);
const _mirageGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const _MIRAGE_VS = `varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const _MIRAGE_FS = `uniform float uTime, uA; uniform vec3 uSky; varying vec2 vUv;
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float edge = smoothstep(1.0, 0.35, length(q));
    float w = 0.5 + 0.5 * sin(uTime * 2.3 + q.x * 9.0 + sin(q.y * 6.0 + uTime * 1.7) * 1.5);
    vec3 col = mix(uSky, vec3(0.5, 0.72, 0.95), 0.4) * (0.9 + 0.2 * w);
    gl_FragColor = vec4(col, edge * uA * (0.5 + 0.3 * w));
  }`;
// a spot on open ground ahead of `p` ([x, y, z] of the pool's middle), or null
function _mirageSpot(p) {
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (let tries = 0; tries < 6; tries++) {
    const ang = (Math.random() - 0.5) * 1.2, d = 12 + Math.random() * 14, c = Math.cos(ang), s = Math.sin(ang);
    const x = Math.floor(p.pos.x + (fx * c - fz * s) * d), z = Math.floor(p.pos.z + (fx * s + fz * c) * d);
    for (let y = Math.floor(p.pos.y) + 6; y > p.pos.y - 12; y--) {
      const v = getBlock(x, y, z), id = v & 255;
      if (id === B.WATER || id === B.LAVA) break;
      if (!v || !CORE.solidVal(v)) continue;
      if (getSkyWorld(x, y + 1, z) < 15 || (!_MIRAGE_SAND.has(id) && Math.random() < 0.6)) break;
      return [x + 0.5, y + 1.03, z + 0.5];
    }
  }
  return null;
}
function _updateMirages(dt) {
  const p = player;
  const on = !p.canFly && !p.dead && (p.heatstroke || 0) >= HS_MIRAGE_AT && (typeof _skyDayF !== 'number' || _skyDayF > 0.3);
  let M = p._mirages;
  if (!M) {
    if (!on) return;
    M = p._mirages = { group: new THREE.Group(), pools: [], t: 1 };
    scene.add(M.group);
  }
  M.t -= dt;
  if (on && M.pools.length < MIRAGE_MAX && M.t <= 0) {
    M.t = 1.5 + Math.random() * 3;
    const s = _mirageSpot(p);
    if (s) {
      const mat = new THREE.ShaderMaterial({ vertexShader: _MIRAGE_VS, fragmentShader: _MIRAGE_FS, transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uA: { value: 0 }, uSky: { value: new THREE.Color() } } });
      const mesh = new THREE.Mesh(_mirageGeo, mat);
      mesh.layers.set(1);
      mesh.renderOrder = 2;
      mesh.position.set(s[0], s[1], s[2]);
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.scale.set(3 + Math.random() * 3, 1, 2 + Math.random() * 2);
      M.group.add(mesh);
      M.pools.push({ mesh, a: 0, x: s[0], z: s[2], seed: Math.random() * 10, going: false });
    }
  }
  const time = performance.now() / 1000;
  for (let i = M.pools.length - 1; i >= 0; i--) {
    const q = M.pools[i], d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
    q.going = q.going || !on || d < MIRAGE_NEAR || d > MIRAGE_FAR;
    q.a = q.going ? q.a - dt / 1.2 : Math.min(1, q.a + dt / 2.5);
    if (q.going && q.a <= 0) { M.group.remove(q.mesh); q.mesh.material.dispose(); M.pools.splice(i, 1); continue; }
    const u = q.mesh.material.uniforms;
    u.uA.value = q.a; u.uTime.value = time + q.seed;
    u.uSky.value.copy(typeof _skyFogColor !== 'undefined' ? _skyFogColor : sharedUniforms.fogColor.value);
  }
}
// only the viewing player's mirages are drawn in their view
function showMiragesFor(who) {
  for (const p of PLAYERS) if (p._mirages) p._mirages.group.visible = p === who;
}

/* THE DEATH MARK (0.827). Where a player last died, on their own screen: a skull over the spot with how far it is
   and how long the things they dropped there still lie. Off screen or behind them it waits at the edge of the view,
   on the side to turn to. It goes when they come within DEATH_MARK_TOUCH of it, or when the time runs out; that
   clock only runs while the spot is simulated, as the drops' own does (15-drops.js). Saved with the player.
   Per player like the hurt vignette: 36-splitscreen.js puts it in the player's pane, outside the HUD's scaling. */
const DEATH_MARK_TOUCH = 2, DEATH_MARK_EDGE = 28;
var deathMarkEl = document.createElement('div');
deathMarkEl.id = 'deathMark';
const _dmV = new THREE.Vector3();
function _syncDeathMark(dt) {
  const p = player, m = p._deathMark, el = deathMarkEl;
  if (!el) return;
  const hide = () => { if (el.style.display !== 'none') el.style.display = 'none'; };
  if (!m) return hide();
  if (typeof inSimRange === 'function' && inSimRange(m.x, m.z)) m.left -= dt;
  const d = Math.hypot(p.pos.x - (m.x + 0.5), p.pos.y - m.y, p.pos.z - (m.z + 0.5));
  if (m.left <= 0 || (!p.dead && p.spawned && d < DEATH_MARK_TOUCH)) { p._deathMark = null; return hide(); }
  if (p.dead || !p.spawned || p.canFly || menuScene || !el.parentElement) return hide();
  const W = el.parentElement.clientWidth, H = el.parentElement.clientHeight;
  if (!W || !H) return hide();
  camera.updateMatrixWorld();
  _dmV.set(m.x + 0.5, m.y + 1.2, m.z + 0.5).applyMatrix4(camera.matrixWorldInverse);
  const behind = _dmV.z > 0;
  _dmV.applyMatrix4(camera.projectionMatrix);
  let sx = _dmV.x, sy = _dmV.y;
  if (behind) { sx = -sx; sy = -sy; }
  let x = (sx * 0.5 + 0.5) * W, y = (0.5 - sy * 0.5) * H;
  // off screen or behind: slide it in along the line from the middle to the edge
  const hx = W / 2 - DEATH_MARK_EDGE, hy = H / 2 - DEATH_MARK_EDGE, dx = x - W / 2, dy = y - H / 2;
  const out = behind || Math.abs(dx) > hx || Math.abs(dy) > hy;
  if (out) {
    const k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
    x = W / 2 + dx * k; y = H / 2 + dy * k;
  }
  const s = Math.max(0, Math.ceil(m.left)), txt = `☠ ${Math.round(d)} m · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (el._txt !== txt) { el._txt = txt; el.textContent = txt; }
  el.style.display = 'block';
  el.style.left = x.toFixed(1) + 'px';
  el.style.top = y.toFixed(1) + 'px';
  el.classList.toggle('edge', out);
}
// a saved mark, or null (16-worlds.js, 36-splitscreen.js)
const restoreDeathMark = (r) => r && [r.x, r.y, r.z, r.left].every(n => typeof n === 'number' && isFinite(n)) && r.left > 0
  ? { x: r.x, y: r.y, z: r.z, left: r.left } : null;
const serializeDeathMark = (p) => p._deathMark ? { x: p._deathMark.x, y: p._deathMark.y, z: p._deathMark.z, left: Math.round(p._deathMark.left) } : null;

/* ---- death screen ----
   `deathEl` and friends are per-player pane elements, swapped with the rest of the HUD, so a
   player dying in split screen darkens only their own quarter of the screen. The pointer lock is
   released only when the player who died is the one holding the mouse (player one). */
var deathEl = null, deathCauseEl = null, deathStatsEl = null;
/* Respawn from the pause menu (0.829): a way out when stuck. Keep the mouse or the pad cursor on it for
   GIVE_UP_HOLD_S to arm it, then click: player one dies on the spot, everything dropped as any death, and the
   button cools down for GIVE_UP_COOLDOWN_S (on the player, saved in `vit.gu`, ticked in tickStats). */
const GIVE_UP_HOLD_S = 1, GIVE_UP_COOLDOWN_S = 20 * 60;   // hold 2 s until 0.8291
const giveUpBtn = document.getElementById('giveUpBtn');
let _giveUpHold = 0, _giveUpTxt = '';
function updatePauseRespawn(dt) {
  if (!giveUpBtn) return;
  const p = PLAYERS[0];
  const show = !playing && menuScreen === 'pause' && !!currentWorld && !!p && !p.dead && !p.canFly;
  giveUpBtn.style.display = show ? '' : 'none';
  if (!show) { _giveUpHold = 0; return; }
  const cd = p._giveUpCd || 0;
  const over = giveUpBtn.matches(':hover') || (typeof _mHover !== 'undefined' && _mHover === giveUpBtn);
  _giveUpHold = cd <= 0 && over ? Math.min(GIVE_UP_HOLD_S, _giveUpHold + dt) : 0;
  const armed = _giveUpHold >= GIVE_UP_HOLD_S;
  giveUpBtn.classList.toggle('cool', cd > 0);
  giveUpBtn.classList.toggle('armed', armed);
  giveUpBtn.style.setProperty('--hold', (100 * _giveUpHold / GIVE_UP_HOLD_S).toFixed(1) + '%');
  // two lines (0.8291): a small one saying what to do, and a big "Respawn"
  const left = Math.ceil(cd), mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const txt = cd > 0 ? `ready in ${mmss}` : armed ? 'click to' : over ? 'keep holding' : 'hover to';
  if (txt !== _giveUpTxt) giveUpBtn.innerHTML = `<small>${_giveUpTxt = txt}</small><span>Respawn</span>`;
}
if (giveUpBtn) giveUpBtn.addEventListener('click', () => {
  const p = PLAYERS[0];
  if (!p || p.dead || p.canFly || (p._giveUpCd || 0) > 0 || _giveUpHold < GIVE_UP_HOLD_S) return;
  p._giveUp = true;                              // updateVitals kills on the next frame, the death screen follows
  p._giveUpCd = GIVE_UP_COOLDOWN_S;
  _giveUpHold = 0;
  setPlaying(true);
});

function showDeathScreen(cause) {
  if (!deathEl) return;
  if (deathCauseEl) deathCauseEl.textContent = 'You ' + cause;
  const t = Math.floor(player.aliveT || 0);
  const tStr = t >= 60 ? `${Math.floor(t / 60)}m ${t % 60}s` : `${t}s`;
  if (deathStatsEl) deathStatsEl.textContent = `Survived ${tStr} · Day ${(player._deathDay ?? worldDay) + 1}`;
  deathEl.style.display = 'flex';
  if (player === PLAYERS[0] && document.pointerLockElement) document.exitPointerLock();
}
function respawnPlayer() {
  fillVitals(player);                            // every bar full, over-stats too but thirst's (0.821)
  player._hpLast = player.hp;                    // a respawn is not a heal — don't diff across it
  player.effects = [];
  if (player.sleepingAt) leaveBed(player);     // never respawn still flagged as in a bed
  player.vy = 0; player.fallStart = null; player._kbT = 0; player._dmgCause = null; player.aliveT = 0; player._deathDay = null;
  const s = findValidSpawn();
  if (s) {
    player.pos.set(s.x, s.y, s.z);
    if (!player.spawnPos) player.spawnPos = player.pos.clone();
    if (!player.homeSpawn) player.homeSpawn = player.pos.clone();
  } else if (player.spawnPos) {
    player.pos.copy(player.spawnPos);
  } else {
    const sy = surfaceY(Math.floor(player.pos.x), Math.floor(player.pos.z));
    player.pos.y = Math.max(sy + 2, WATER_Y + 3);
  }
  player.dead = false;
  if (deathEl) deathEl.style.display = 'none';
  if (deathEl && deathEl.parentElement) deathEl.parentElement.classList.remove('dying');   // 0.801
  paintVitals();
  // only player one owns the mouse, so only their respawn re-grabs the pointer lock
  if (playing && player === PLAYERS[0]) { lockTries = 0; tryPointerLock(); }
}

