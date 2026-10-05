'use strict';
/* voxiGrof — the camera filter (0.837): what lands on the lens of each player's eye, drawn on a canvas over that
   player's view (one per split-screen pane, under its HUD):
     RAIN   drops land while it rains on you (open sky over your head), sit a moment, then run down the glass
     WATER  coming up out of water the lens is wet all over: a sheen that clears and a crowd of drops running off
     SNOW   flakes stick where they land and melt away slowly, never running; a blizzard packs them on and frosts the
            edges of the view
     FLASH  lightning close by whites the view out for a moment, more the nearer it struck (cameraFilterLightning)
     FIRE   on fire, flames lick up from the bottom of the view
   Under water nothing sits on the lens. The canvas is hidden whenever there is nothing on it. Sizes are shares of the
   view's height, so a split-screen quarter looks the same as a whole window. */
const CF_RES = 0.5;                                   // canvas pixels per CSS pixel: soft is fine, and cheap
const CF_RAIN_PER_S = 7, CF_SNOW_PER_S = 4, CF_BLIZ_PER_S = 26, CF_SPLASH_DROPS = 46;
const CF_MAX_DROPS = 140, CF_MAX_FLAKES = 320;
const CF_SNOW_LIFE = [7, 15];                         // seconds a flake takes to melt off
const CF_FLASH_R = 48, CF_FLASH_MAX = 0.6;            // how near a strike flashes the lens, and how white at most
const CF_FROST_IN_S = 18, CF_FROST_OUT_S = 10;        // a blizzard's frost creeping in round the edges, and going

// the sprites, drawn once: a drop (a dark rim, a clear middle, a glint), a soft flake and a six-armed crystal
function _cfSprite(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  return c;
}
const _cfDrop = _cfSprite(64, (g, s) => {
  const r = s / 2;
  const rim = g.createRadialGradient(r, r * 1.08, r * 0.2, r, r, r);
  rim.addColorStop(0, 'rgba(210,225,240,0.10)');
  rim.addColorStop(0.7, 'rgba(170,190,210,0.18)');
  rim.addColorStop(0.92, 'rgba(25,35,50,0.38)');
  rim.addColorStop(1, 'rgba(25,35,50,0)');
  g.fillStyle = rim; g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.fill();
  const hi = g.createRadialGradient(r * 0.68, r * 0.62, 0, r * 0.68, r * 0.62, r * 0.32);
  hi.addColorStop(0, 'rgba(255,255,255,0.85)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi; g.beginPath(); g.arc(r * 0.68, r * 0.62, r * 0.32, 0, Math.PI * 2); g.fill();
});
const _cfFlake = _cfSprite(32, (g, s) => {
  const r = s / 2, f = g.createRadialGradient(r, r, 0, r, r, r);
  f.addColorStop(0, 'rgba(255,255,255,0.95)');
  f.addColorStop(0.45, 'rgba(240,246,255,0.7)');
  f.addColorStop(1, 'rgba(230,240,255,0)');
  g.fillStyle = f; g.fillRect(0, 0, s, s);
});
const _cfStar = _cfSprite(48, (g, s) => {
  const r = s / 2;
  g.strokeStyle = 'rgba(245,250,255,0.9)'; g.lineWidth = 2.2; g.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, ex = r + Math.cos(a) * r * 0.9, ey = r + Math.sin(a) * r * 0.9;
    g.beginPath(); g.moveTo(r, r); g.lineTo(ex, ey); g.stroke();
    // two little barbs on each arm
    const bx = r + Math.cos(a) * r * 0.55, by = r + Math.sin(a) * r * 0.55;
    for (const t of [-0.6, 0.6]) {
      g.beginPath(); g.moveTo(bx, by);
      g.lineTo(bx + Math.cos(a + t) * r * 0.25, by + Math.sin(a + t) * r * 0.25); g.stroke();
    }
  }
  const c = g.createRadialGradient(r, r, 0, r, r, r * 0.3);
  c.addColorStop(0, 'rgba(255,255,255,0.9)'); c.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = c; g.fillRect(0, 0, s, s);
});

const _cfRnd = (a, b) => a + Math.random() * (b - a);
// this seat's filter: its canvas, first in its pane so the whole HUD draws over it
function _cfState(st) {
  if (st._cf) return st._cf;
  const c = document.createElement('canvas');
  c.className = 'camFilter';
  c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:none';
  st.pane.insertBefore(c, st.pane.firstChild);
  return st._cf = { c, g: c.getContext('2d'), drops: [], flakes: [], wet: 0, frost: 0, flash: 0, fire: 0,
                    wasUnder: false, rainAcc: 0, snowAcc: 0, t: 0, prT: 0, pr: null, open: false, shown: false };
}
function _cfAddDrop(f, w, h, run) {
  if (f.drops.length >= CF_MAX_DROPS) return;
  const r = h * _cfRnd(0.006, run ? 0.022 : 0.016);
  f.drops.push({ x: Math.random() * w, y: Math.random() * h * (run ? 1 : 0.92), r,
                 stay: run ? _cfRnd(0, 0.25) : _cfRnd(0.4, 2.5),   // how long it clings before it runs
                 vy: 0, wob: Math.random() * 6.28, a: 0, trail: [] });
}
function _cfAddFlake(f, w, h, bliz) {
  if (f.flakes.length >= CF_MAX_FLAKES) {
    if (!bliz) return;
    f.flakes.shift();                                  // a blizzard keeps piling on: the oldest melts first
  }
  const big = Math.random() < (bliz ? 0.3 : 0.18), life = _cfRnd(CF_SNOW_LIFE[0], CF_SNOW_LIFE[1]);
  f.flakes.push({ x: Math.random() * w, y: Math.random() * h, r: h * (big ? _cfRnd(0.012, 0.026) : _cfRnd(0.004, 0.011)),
                  big, rot: Math.random() * 6.28, life, max: life });
}

/* Once a frame, after the views are drawn (22-main-loop.js): every seat's lens. */
function updateCameraFilter(dt) {
  if (typeof PSTATE === 'undefined') return;
  const title = typeof menuScene !== 'undefined' && !!menuScene;
  for (const st of PSTATE) if (st && st.pane && st.player) _cfStep(_cfState(st), st.player, st.pane, title ? -1 : dt);
}
function _cfStep(f, p, pane, dt) {
  const g = f.g;
  if (dt < 0 || !p.spawned || p.dead || (typeof _fxScale === 'number' && _fxScale <= 0)) {
    // the title, a dead seat or the particles off: nothing on the lens
    if (f.shown) { f.c.style.display = 'none'; f.shown = false; }
    f.drops.length = 0; f.flakes.length = 0; f.wet = f.frost = f.flash = f.fire = f.cold = 0;
    return;
  }
  const w = Math.max(1, Math.round(pane.clientWidth * CF_RES)), h = Math.max(1, Math.round(pane.clientHeight * CF_RES));
  if (f.c.width !== w || f.c.height !== h) { f.c.width = w; f.c.height = h; }
  f.t += dt;
  const under = !!p._eyeUnder, ey = p.pos.y + (p.EYE || 1.62);
  // the weather at the eye, twice a second: what falls, and whether the sky is open over the head
  f.prT -= dt;
  if (f.prT <= 0) {
    f.prT = 0.5;
    f.pr = typeof precipAt === 'function' ? precipAt(p.pos.x, p.pos.z, ey) : null;
    f.open = typeof getSkyWorld === 'function' && getSkyWorld(Math.floor(p.pos.x), Math.floor(ey) + 1, Math.floor(p.pos.z)) >= 14;
  }
  const pr = f.pr || { rain: 0, snow: 0, blizzard: 0 };
  if (under) {
    f.drops.length = 0; f.flakes.length = 0; f.wet = 0;
  } else {
    if (f.wasUnder) {                                  // just came up: the whole lens streams
      f.wet = 1;
      for (let i = 0; i < CF_SPLASH_DROPS; i++) _cfAddDrop(f, w, h, true);
    }
    if (f.open && pr.rain > 0.03) {
      f.rainAcc += CF_RAIN_PER_S * pr.rain * dt;
      while (f.rainAcc >= 1) { f.rainAcc -= 1; _cfAddDrop(f, w, h, false); }
    } else f.rainAcc = 0;
    if (f.open && pr.snow > 0.03) {
      f.snowAcc += (CF_SNOW_PER_S * pr.snow + CF_BLIZ_PER_S * pr.blizzard) * dt;
      while (f.snowAcc >= 1) { f.snowAcc -= 1; _cfAddFlake(f, w, h, pr.blizzard > 0.3); }
    } else f.snowAcc = 0;
  }
  f.wasUnder = under;
  // a blizzard's frost round the edges, creeping in and slowly going
  const frostAim = !under && f.open ? pr.blizzard : 0;
  f.frost += (frostAim - f.frost) * (1 - Math.exp(-dt / (frostAim > f.frost ? CF_FROST_IN_S : CF_FROST_OUT_S)));
  f.fire += ((p.fireT > 0 && !under ? 1 : 0) - f.fire) * (1 - Math.exp(-dt / (p.fireT > 0 ? 0.25 : 0.7)));
  // cold fire (0.8391, the Frozen King's: p._fireCold, 60-bosses.js) burns blue; the mark goes with the fire
  if (!(p.fireT > 0)) p._fireCold = false;
  f.cold = (f.cold || 0) + ((p._fireCold ? 1 : 0) - (f.cold || 0)) * (1 - Math.exp(-dt / 0.3));
  f.flash = Math.max(0, f.flash - dt * 2.6);
  f.wet = Math.max(0, f.wet - dt / 1.8);
  // the drops: cling, then run down faster and faster, wandering a little, leaving a thin wet trail
  for (let i = f.drops.length - 1; i >= 0; i--) {
    const d = f.drops[i];
    d.a = Math.min(1, d.a + dt * 6);
    if (d.stay > 0) { d.stay -= dt; d.r *= 1 + dt * 0.04; continue; }
    d.vy = Math.min(h * 0.55, d.vy + h * _cfRnd(0.25, 0.5) * dt);
    d.trail.push(d.x, d.y);
    if (d.trail.length > 24) d.trail.splice(0, 2);
    d.y += d.vy * dt;
    d.x += Math.sin(f.t * 3 + d.wob) * h * 0.01 * dt;
    if (d.y - d.r > h) f.drops.splice(i, 1);
  }
  for (let i = f.flakes.length - 1; i >= 0; i--) if ((f.flakes[i].life -= dt) <= 0) f.flakes.splice(i, 1);
  const any = f.drops.length || f.flakes.length || f.wet > 0.01 || f.frost > 0.01 || f.flash > 0.01 || f.fire > 0.01;
  if (!any) { if (f.shown) { g.clearRect(0, 0, w, h); f.c.style.display = 'none'; f.shown = false; } return; }
  if (!f.shown) { f.c.style.display = 'block'; f.shown = true; }
  g.clearRect(0, 0, w, h);
  // the wet lens just out of the water
  if (f.wet > 0.01) {
    const s = g.createLinearGradient(0, 0, 0, h);
    s.addColorStop(0, `rgba(170,200,225,${(0.1 * f.wet).toFixed(3)})`);
    s.addColorStop(1, `rgba(120,160,200,${(0.3 * f.wet).toFixed(3)})`);
    g.fillStyle = s; g.fillRect(0, 0, w, h);
  }
  // frost creeping in from the edges
  if (f.frost > 0.01) {
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * (0.62 - 0.3 * f.frost), w / 2, h / 2, Math.hypot(w, h) * 0.55);
    v.addColorStop(0, 'rgba(235,245,255,0)');
    v.addColorStop(1, `rgba(235,245,255,${(0.85 * f.frost).toFixed(3)})`);
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  }
  // snow on the lens, melting
  for (const k of f.flakes) {
    g.globalAlpha = Math.min(1, (k.life / k.max) * 1.6) * 0.9;
    const s = k.r * 2;
    if (k.big) {
      g.save(); g.translate(k.x, k.y); g.rotate(k.rot);
      g.drawImage(_cfStar, -k.r, -k.r, s, s); g.restore();
    } else g.drawImage(_cfFlake, k.x - k.r, k.y - k.r, s, s);
  }
  // rain on the lens: the trails, then the drops
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(200,220,240,0.16)';
  for (const d of f.drops) {
    if (d.trail.length < 4) continue;
    g.lineWidth = Math.max(1, d.r * 0.5);
    g.beginPath(); g.moveTo(d.trail[0], d.trail[1]);
    for (let j = 2; j < d.trail.length; j += 2) g.lineTo(d.trail[j], d.trail[j + 1]);
    g.lineTo(d.x, d.y); g.stroke();
  }
  for (const d of f.drops) {
    g.globalAlpha = d.a;
    const sy = d.stay > 0 ? 1 : 1.25;                 // a running drop pulls long
    g.drawImage(_cfDrop, d.x - d.r, d.y - d.r * sy, d.r * 2, d.r * 2 * sy);
  }
  g.globalAlpha = 1;
  // on fire: an orange glow and flames licking up from the bottom; cold fire the same in blue (0.8391)
  if (f.fire > 0.01) {
    const k = Math.max(0, Math.min(1, f.cold || 0));
    const mix = (warm, cold) => warm.map((v, i) => Math.round(v + (cold[i] - v) * k)).join(',');
    const cGlow = mix([255, 110, 20], [80, 165, 255]), cTip = mix([255, 230, 120], [215, 240, 255]);
    const cMid = mix([255, 120, 25], [90, 175, 255]), cEnd = mix([200, 40, 10], [40, 90, 210]);
    const a = f.fire, base = g.createLinearGradient(0, h, 0, h * 0.45);
    base.addColorStop(0, `rgba(${cGlow},${(0.55 * a).toFixed(3)})`);
    base.addColorStop(1, `rgba(${cGlow},0)`);
    g.fillStyle = base; g.fillRect(0, h * 0.45, w, h * 0.55);
    const n = 9, step = w / (n - 1);
    for (let i = 0; i < n; i++) {
      const x = i * step + Math.sin(f.t * 2.3 + i * 1.7) * step * 0.25;
      const fh = h * a * (0.16 + 0.12 * Math.sin(f.t * 7.1 + i * 2.3) + 0.08 * Math.sin(f.t * 13.3 + i * 0.9));
      const fw = step * 0.55, sway = Math.sin(f.t * 5 + i) * fw * 0.35;
      const fl = g.createLinearGradient(0, h, 0, h - fh);
      fl.addColorStop(0, `rgba(${cTip},${(0.75 * a).toFixed(3)})`);
      fl.addColorStop(0.45, `rgba(${cMid},${(0.6 * a).toFixed(3)})`);
      fl.addColorStop(1, `rgba(${cEnd},0)`);
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(x - fw, h);
      g.quadraticCurveTo(x - fw * 0.5 + sway, h - fh * 0.55, x + sway * 1.6, h - fh);
      g.quadraticCurveTo(x + fw * 0.5 + sway, h - fh * 0.55, x + fw, h);
      g.closePath(); g.fill();
    }
  }
  // lightning close by
  if (f.flash > 0.01) { g.fillStyle = `rgba(255,255,255,${f.flash.toFixed(3)})`; g.fillRect(0, 0, w, h); }
}
/* A strike at (x, y, z) (strikeLightning, 53-storms.js): every seat near it gets a flash on its lens, less with a roof
   over it or under water */
function cameraFilterLightning(x, y, z) {
  if (typeof PSTATE === 'undefined') return;
  for (const st of PSTATE) {
    const p = st && st.player;
    if (!p || !st.pane || !p.spawned || p.dead) continue;
    const d = Math.hypot(p.pos.x - x, p.pos.y - y, p.pos.z - z);
    if (d >= CF_FLASH_R) continue;
    const f = _cfState(st), k = Math.pow(1 - d / CF_FLASH_R, 1.5) * (p._eyeUnder ? 0.2 : f.open ? 1 : 0.4);
    f.flash = Math.max(f.flash, CF_FLASH_MAX * k);
  }
}
