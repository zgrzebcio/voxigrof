'use strict';
/* fluids/current.js: the push of water. Which way it runs at a cell (a river's own way first), for players,
   creatures and drops. */

/* ---- water current: horizontal flow direction from the level gradient ----
   Flowing water pushes entities toward higher level numbers (downstream). Source pools
   (all level 0) produce no current. Result normalized into `out`; false = still water. */
const _flowV = { x: 0, z: 0 };
const _uwTint = new THREE.Color(0x0a2438);   // underwater murk color
/* a RIVER carries you too. A river's water is all source cells, so the gradient below found nothing in it; but
   its top cell knows which way it runs (variant bits 3-6, 1-8 round the compass from +x by eighths; bit 7 = a fast
   stretch: genChunk's FDV, and the flowing fluid writes the same bits). That way is used first, read from this cell or
   the surface up to RIVER_FLOW_UP cells over it, at RIVER_PUSH of the old push (RIVER_PUSH_FAST on a fast stretch), so
   you can still swim against an ordinary river. `river` false (fish) keeps to the gradient: they hold their place. */
const RIVER_PUSH = 0.6, RIVER_PUSH_FAST = 1.0, RIVER_FLOW_UP = 3;
function waterFlowVec(x, y, z, out, river = true) {
  out.x = 0; out.z = 0;
  const val = getBlock(x, y, z);
  if ((val & 255) !== B.WATER) return false;
  if (river)
    for (let k = 0, v = val; k <= RIVER_FLOW_UP && (v & 255) === B.WATER; k++, v = getBlock(x, y + k, z)) {
      const va = (v >> 8) & 255, fd = (va >> 3) & 15;
      if (fd < 1 || fd > 8) continue;
      const a = (fd - 1) * Math.PI / 4, s = (va & 128) ? RIVER_PUSH_FAST : RIVER_PUSH;
      out.x = Math.cos(a) * s; out.z = Math.sin(a) * s;
      return true;
    }
  const level = (val >> 8) & 7;
  let fx = 0, fz = 0;
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nb = getBlock(x + dx, y, z + dz);
    const nbId = nb & 255;
    if (nbId === B.WATER) {
      const nl = (nb >> 8) & 7;
      fx += dx * (nl - level); fz += dz * (nl - level);
    } else if (nbId === B.AIR && level < 7 && (getBlock(x + dx, y - 1, z + dz) & 255) === B.AIR) {
      fx += dx * 2; fz += dz * 2;          // waterfall edge pulls hard
    }
  }
  const m = Math.hypot(fx, fz);
  if (m < 1e-6) return false;
  out.x = fx / m; out.z = fz / m;
  return true;
}

let lastT = performance.now();
let fps = 0, fpsFrames = 0, fpsT = lastT;
let hudT = 0;
var wasMoving = false, lastFlying = player.flying;   // sprint auto-release tracking

// held-light state: track last-known position + item to detect changes
var _hlId = undefined, _hlLevel = 0, _hlX = null, _hlY = null, _hlZ = null;
var _hlRaw = 0;  // raw light value of current held item (exposed for arm glow in player/hands.js)
const _handSaveLC = new THREE.Color();  // reusable save slot for uLightColor during hand render

/* F3 timings. While any seat shows the debug read-out, frame(), simTick and runWorldTick
   time their parts with laps: `perfLap(name, t)` adds the time since t to `name` and returns now. F3 then shows the
   main thread's ms per frame (average over a second, and the worst frame), and the 8 costliest parts. With F3 hidden a
   lap is one compare. It is CPU time: the graphics card's own work shows in `render` only when the browser waits on it. */
let _perfOn = false, _perfWinT = 0, _perfFrames = 0, _perfMax = 0, _perfLine = '';
const _perfAcc = new Map();
const perfNow = () => _perfOn ? performance.now() : 0;
