'use strict';
/* ui/vitals-hud.js: the vitals strip on screen. Its layout (five icons a bar), painting each row, the temperature
   dial, and which bar the cursor is over.
   What the bars ARE and how they move: player/stats.js. */

/* voxiGrof — the vitals HUD, the hazards that hurt you, and dying

   What the bars ARE and how they rise and fall (food, thirst, stamina, energy, oxygen, temperature...) is
   player/stats.js since 0.82. This file draws them, runs the outside hazards (falls, cactus, lava, fire),
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
   that icon's fifth of the bar goes (up from the bottom before), then the white outline (<bar>_overlay)
   for the over-stat, 10 an icon, filled the same way.
   The canvas is drawn at VIT_RES bitmap pixels per CSS pixel and shown at its CSS size (style.css). */
var vitalsEl = document.getElementById('vitals');
var vctx = vitalsEl.getContext('2d');
// stamina and oxygen while the inventory is shut: their own canvas under the interact prompt (#vitalsNear, style.css)
var vitalsNearEl = document.getElementById('vitalsNear');
var vnctx = vitalsNearEl.getContext('2d');

const LAVA_FIRE_S = 10;                      // seconds you stay alight after touching lava
const VIT_W = 780, VIT_H = 76, VIT_RES = 2;  // the strip's CSS size (matches #vitals), and its supersampling
const VIT_ICONS = 5;
const VIT_NEAR_W = 110, VIT_NEAR_H = 44;     // #vitalsNear's CSS size: two rows of 20 px icons
/* One row a bar: its left edge from the strip's centre and its top from the strip's top (CSS px), the icon
   size, the end it fills from (the outer one, so both sides drain toward the middle), and `inv` for the
   bars only an open inventory shows, `near` for the ones drawn under the crosshair while it is shut. */
const VIT_LAYOUT = [
  { key: 'hp',      x: -235, top: 52, size: 24, from: 'left' },
  { key: 'armor',   x: -235, top: 24, size: 24, from: 'left' },
  { key: 'food',    x:  111, top: 52, size: 24, from: 'right' },
  { key: 'thirst',  x:  111, top: 24, size: 24, from: 'right' },
  { key: 'veg',     x: -385, top: 52, size: 24, from: 'left',  inv: true },
  { key: 'energy',  x: -385, top: 24, size: 24, from: 'left',  inv: true },
  { key: 'protein', x:  261, top: 52, size: 24, from: 'right', inv: true },
  { key: 'fruit',   x:  261, top: 24, size: 24, from: 'right', inv: true },
  { key: 'stamina', x:  -52, top: 25, size: 20, from: 'left', near: true },
  { key: 'air',     x:  -52, top: 3,  size: 20, from: 'left', near: true },
];
const VIT_TEMP = { x: -15, top: 46, size: 30 };        // the temperature dial
// the armor bar's pictures per armorMat (an armor item's material, items/equipment.js): Armor/armor_<this>.png
const ARMOR_HUD_ART = { leather: 'leather', iron: 'iron', golden: 'gold', steel: 'steel', cloth: 'fibre_cloth', bronze: 'bronze' };
// a quarter of an armor icon at a time: the bottom-left block, the whole left half, the bottom-right, the right half
const ARMOR_PART_ART = ['left_25', 'left_50', 'right_25', 'right_50'];

function _vitRowShown(r, inv) {
  if (inv) return true;
  if (r.inv) return false;
  if (r.key === 'armor') return playerArmorPoints() > 0;
  // ...and while it is being used, which may be only over-stamina going (hidden then before)
  if (r.key === 'stamina') return player.stamina < MAX_STAMINA - 0.05 || player._stamShowT > 0;
  if (r.key === 'air') return !!player._eyeUnder || player.air < MAX_AIR - 0.05;
  return true;
}
/* `img` at (x, y) size s, showing only `frac` of it measured over the columns it actually paints: a horizontal
   progress bar (it filled from the bottom before), from its left side, or its right with `fromRight`
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
  const p = player, max = r.key === 'hp' ? playerMaxHP(p) : VITAL_MAX[r.key], per = max / VIT_ICONS, s = r.size;   // Thick Skin's 110
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
/* Armor is MIXED: the pieces inside one icon can be different materials. Each icon holds four
   quarters (playerArmorPointMats, player/equipment.js); four of one material draw its whole picture, otherwise
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
    /* shown upside down, HOT on top and cold below. The strip's art still runs cold to hot downward; it is
       drawn mirrored about the middle of the window, where the temperature sits and the arrows point. */
    g.translate(0, 2 * (y + 64 * k)); g.scale(1, -1);
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
  const inv = !!invOpen, hits = [], near = [];
  for (const r of VIT_LAYOUT) {
    if (!_vitRowShown(r, inv)) continue;
    if (r.near && !inv) { near.push(r); continue; }
    if (r.key === 'armor') _paintArmorRow(g, r); else _paintBarRow(g, r);
    hits.push({ key: r.key, x: r.x, y: r.top, w: VIT_ICONS * (r.size + 1) - 1, h: r.size });
  }
  _paintTemp(g);
  hits.push({ key: 'temp', x: VIT_TEMP.x, y: VIT_TEMP.top, w: VIT_TEMP.size, h: VIT_TEMP.size });
  g.setTransform(1, 0, 0, 1, 0, 0);
  vitalsEl._hits = hits;                             // per pane: each seat hovers its own strip
  _paintNearVitals(vitalsShown ? near : []);
}
/* The rows that sit under the crosshair while the inventory is shut, stacked from the top in the strip's order
   (oxygen over stamina), each centred; the canvas is hidden when none is shown. */
function _paintNearVitals(rows) {
  const el = vitalsNearEl, g = vnctx, W = VIT_NEAR_W * VIT_RES, H = VIT_NEAR_H * VIT_RES;
  if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  el.style.display = rows.length ? 'block' : 'none';
  if (!rows.length) return;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.setTransform(VIT_RES, 0, 0, VIT_RES, 0, 0);
  let top = 1;
  for (const r of rows.slice().sort((a, b) => a.top - b.top)) {
    _paintBarRow(g, { ...r, x: (VIT_NEAR_W - (VIT_ICONS * (r.size + 1) - 1)) / 2, top });
    top += r.size + 2;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
// the tooltip for whichever bar is under the inventory cursor, or '' (ui/inventory.js, 0.82)
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
const GUI_FILL = {};                         // each picture's painted columns [left, right), for filling by width
let ensureVitalsSprites = () => {};
{
  const ART = 'textures/Gui/Vitals/', _p = {};
  // a bar's three pictures: silhouette, picture, over-stat outline
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
  /* Requested on world load, not at boot: only survival ever draws the strip, and on a slow static
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
