'use strict';
/* voxiGrof — torches and glow blocks that burn out (0.834)

   A placed fire torch burns 5-10 minutes, a crystal torch 15-30, a glow dust or glowcrystal block 30-60. Then the torch
   is an unlit torch and the block its spent, grey self (02). The time runs on the world's clock, so a night slept
   through burns them too. It is drawn at random when the light is placed (the setBlock hook, 11) or when it is first
   seen (the emitter scan of a loading chunk, 11): a torch from an older save or in a structure starts its time then.
   BURNS keeps every due time and is saved with the world, so breaking and placing a light again never resets it — a
   lit torch broken comes back unlit anyway (blockDrop, 50).

   Rain puts a fire torch under the open sky out a little at a time. A torch in a hand burns while it is held: one
   torch of the stack at a time, handed back unlit when it goes out. Right-click a placed unlit torch with flint to
   light it, or with a glow crystal to make it a crystal torch.

   0.8373: the burning runs at the world's random tick (burnRate): at 5, a new world's default, the times above; at 10
   twice as fast; at 0 nothing burns out or is put out by rain, placed or held. The lights keep their own clock for it
   (_burnNow: the world's seconds, run at that rate, saved with them). A light placed in creative never burns out:
   its due time is BURN_NEVER. */
const BURN_S = {                                       // [shortest, longest] life in world seconds
  [B.TORCH]:             [300, 600],
  [B.CRYSTAL_TORCH]:     [900, 1800],
  [B.GLOWSTONE]:         [1800, 3600],
  [B.GLOWCRYSTAL_BLOCK]: [1800, 3600],
};
const BURNT_AS = { [B.TORCH]: B.TORCH_UNLIT, [B.CRYSTAL_TORCH]: B.TORCH_UNLIT,
                   [B.GLOWSTONE]: B.GLOWSTONE_SPENT, [B.GLOWCRYSTAL_BLOCK]: B.GLOWCRYSTAL_SPENT };
// rain on a fire torch under the open sky: the chance a second it goes out at full rain (a minute or so in a downpour)
const RAIN_DOUSE_PER_S = 1 / 60, RAIN_DOUSE_MIN = 0.15;
const BURN_TICK = 1;                                   // seconds between looks at the placed lights
const BURN_OUTS_PER_TICK = 8;                          // a world opened after long away goes dark a few at a time
const TORCH_STRIKE_FAIL = 0.25, FLINT_WEAR = 0.5, CRYSTAL_WEAR = 0.25;   // relighting (tryLightTorch)

const BURNS = new Map();                               // "x,y,z" -> [x, y, z, burn-clock second it goes out]
const BURN_NEVER = -1;                                  // the due time of a light placed in creative (0.8373)
const BURN_TICK_REF = 5;                                // the random tick the times above are for (0.8373)
// how fast the lights burn: the world's random tick against BURN_TICK_REF (0 = not at all)
const burnRate = () => Math.max(0, (typeof randomTickSpeed === 'number' ? randomTickSpeed : BURN_TICK_REF) / BURN_TICK_REF);
/* The lights' own clock (0.8373): the world's seconds (a night slept through counts) run at burnRate. `_burnSync`: set
   it to the world's clock at its next reading (a new world, or a save from before it, whose due times are the world's) */
let _burnClock = 0, _burnWorldAt = null, _burnSync = true;
function _burnNow() {
  const w = worldClockDays() * DAY_LEN;
  if (_burnSync) { _burnClock = w; _burnSync = false; }
  else if (_burnWorldAt != null && w > _burnWorldAt) _burnClock += (w - _burnWorldAt) * burnRate();
  _burnWorldAt = w;
  return _burnClock;
}
const _burnKey = (x, y, z) => x + ',' + y + ',' + z;
const _burnLife = (id) => { const r = BURN_S[id]; return r[0] + Math.random() * (r[1] - r[0]); };
// a light being put down by a player in creative (0.8373): it never burns out
const _creativePlacing = () => typeof _placingByPlayer !== 'undefined' && _placingByPlayer
                              && typeof player !== 'undefined' && !!player && player.canFly;

// a light seen as its chunk loads: it keeps the time it already has, or draws one (finishChunkGen, 11)
function burnSeen(x, y, z, id) {
  if (!BURN_S[id]) return;
  const k = _burnKey(x, y, z);
  if (!BURNS.has(k)) BURNS.set(k, [x, y, z, _burnNow() + _burnLife(id)]);
}
// the setBlock hook (11): a light placed draws a fresh time (none in creative), one taken away is forgotten
function burnPlaced(x, y, z, oldVal, val) {
  const id = val & 255, oid = oldVal & 255;
  if (!BURN_S[id] && !BURN_S[oid]) return;
  const k = _burnKey(x, y, z);
  if (!BURN_S[id]) { BURNS.delete(k); return; }
  if (_creativePlacing()) { BURNS.set(k, [x, y, z, BURN_NEVER]); return; }
  if (id !== oid || !BURNS.has(k)) BURNS.set(k, [x, y, z, _burnNow() + _burnLife(id)]);
}

// the light at (x, y, z) goes out: a torch unlit (on the same wall), a glow block spent (its shape kept)
function burnOut(x, y, z, v = getBlock(x, y, z)) {
  const id = v & 255;
  if (BURNT_AS[id] == null) return;
  const mix = slabMixIdsAt(x, y, z, v);                // a mixed slab: each glowing half goes dark
  if (mix) setSlabMix(x, y, z, BURNT_AS[mix[0]] ?? mix[0], BURNT_AS[mix[1]] ?? mix[1], ((v >> 8) & CORE.ROT_MASK) & 6);
  else setBlock(x, y, z, ((v & ~255) | BURNT_AS[id]) >>> 0);
  if (id === B.TORCH && typeof _fxSmoke === 'function') _fxSmoke(x + 0.5, y + 0.75, z + 0.5, 0.45, 1, 0.35);
}

// is it raining on this spot hard enough, and does this look put a fire torch out? (`step`: seconds since the last look)
function _rainDouses(x, y, z, step) {
  if (typeof precipAt !== 'function') return false;
  const r = precipAt(x + 0.5, z + 0.5, y).rain;
  return r >= RAIN_DOUSE_MIN && Math.random() < r * RAIN_DOUSE_PER_S * step;
}

// once a second, from updateSeasons (51): the lights whose time has come, and fire torches out in the rain
let _burnT = 0;
function updateBurns(dt) {
  _burnT += dt;
  if (_burnT < BURN_TICK) return;
  const step = Math.min(5, _burnT);
  _burnT = 0;
  const now = _burnNow(), rate = burnRate();            // the clock read every look, so it keeps up with the world
  if (!BURNS.size || rate <= 0) return;                 // random tick 0: nothing burns out (0.8373)
  let outs = 0;
  for (const [k, e] of BURNS) {
    if (outs >= BURN_OUTS_PER_TICK) break;
    if (e[3] < 0) continue;                             // placed in creative: burns for ever (0.8373)
    const x = e[0], y = e[1], z = e[2];
    const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
    if (!c || !c.data || !c.lit) continue;             // waits for its chunk
    const v = getBlock(x, y, z), id = v & 255;
    if (!BURN_S[id]) { BURNS.delete(k); continue; }    // gone some way the hook did not see
    const rained = id === B.TORCH && getSkyWorld(x, y, z) >= 15 && _rainDouses(x, y, z, step * rate);
    if (now >= e[3] || rained) { burnOut(x, y, z, v); outs++; }
  }
}

/* A torch in a hand (0.834). Each player keeps a clock per kind (p._torchBurn: id -> seconds left on the torch being
   held); when it runs out one torch of the held stack is spent and comes back unlit, and the next starts a fresh clock.
   Rain on an open head puts a fire torch out the same way; under water a fire torch is put away, and does not burn.
   From tickStats (54), so HOTBAR and the offhand are this player's. */
function tickHeldBurn(p, dt) {
  if (p.canFly || p.dead) return;
  p._heldBurnAcc = (p._heldBurnAcc || 0) + dt;
  if (p._heldBurnAcc < 0.5) return;
  const step = Math.min(5, p._heldBurnAcc) * burnRate();   // at the world's random tick (0.8373)
  p._heldBurnAcc = 0;
  if (step <= 0) return;
  const main = HOTBAR[hotbarSel], off = typeof offhandSlot === 'function' ? offhandSlot() : null;
  const t = p._torchBurn || (p._torchBurn = {});
  for (const id of [B.TORCH, B.CRYSTAL_TORCH]) {
    const hand = main && main.id === id ? 'main' : off && off.id === id ? 'off' : null;
    if (!hand) continue;
    if (id === B.TORCH && typeof torchDoused === 'function' && torchDoused(p)) continue;
    if (!(t[id] > 0)) t[id] = _burnLife(id);
    t[id] -= step;
    const rained = id === B.TORCH && !p._roofed && _rainDouses(p.pos.x, p.pos.y + 1, p.pos.z, step);
    if (t[id] <= 0 || rained) { t[id] = 0; _spendHeldTorch(p, id, hand); }
  }
}
function _spendHeldTorch(p, id, hand) {
  const slot = hand === 'main' ? HOTBAR[hotbarSel] : offhandSlot();
  if (!slot) return;
  slot.count--;
  if (hand === 'main') {
    if (slot.count <= 0) HOTBAR[hotbarSel] = null;
    saveHotbar(); buildHotbar(); updateHotbar();
  } else {
    if (slot.count <= 0) equipSlots[EQUIP_INDEX.offhand] = null;
    saveEquip();
    if (invOpen && typeof buildEquipPanel === 'function') buildEquipPanel();
  }
  if (typeof feedItem === 'function') feedItem(id, -1, 'burnt out');
  if (!tryPickup(B.TORCH_UNLIT, null, 'burnt out'))
    spawnDrop(B.TORCH_UNLIT, Math.floor(p.pos.x), Math.floor(p.pos.y + 1), Math.floor(p.pos.z));
}
const serializeHeldBurn = (p) => {
  const out = {};
  for (const k in p._torchBurn || {}) if (p._torchBurn[k] > 0) out[k] = Math.ceil(p._torchBurn[k]);
  return Object.keys(out).length ? out : null;
};
function restoreHeldBurn(p, rec) {
  p._torchBurn = {};
  if (rec && typeof rec === 'object')
    for (const k in rec) if (BURN_S[k] && typeof rec[k] === 'number' && rec[k] > 0) p._torchBurn[k] = Math.min(BURN_S[k][1], rec[k]);
}

/* Lighting a placed unlit torch (0.834), from the right-click (13): flint strikes a spark — one strike in four does not
   catch, and half of them wear the flint away — and a glow crystal makes it a crystal torch, used up one time in four.
   It keeps the wall it hangs on, and starts a fresh time. */
function lightTorchTargets(id) {
  if (id !== B.TORCH_UNLIT) return false;
  const held = heldUseId();
  return held === ITEM.FLINT || held === ITEM.GLOW_CRYSTAL;
}
const _TORCH_TIP_DIR = [null, [1, 0], [-1, 0], [0, 1], [0, -1]];
function tryLightTorch(hit) {
  if (!hit || !lightTorchTargets(hit.id)) return false;
  const { x, y, z } = hit, v = getBlock(x, y, z), keep = v & 0xFF00, held = heldUseId();
  if (held === ITEM.FLINT) {
    if (Math.random() >= TORCH_STRIKE_FAIL) {
      setBlock(x, y, z, B.TORCH | keep);
      playBlockSound(B.TORCH, 'place', x, y, z);
    } else {
      playBlockSound(B.FLINT_ROCK, 'hit', x, y, z);
      // a few sparks off the tip that did not take (the tip as in _fxTorches, 49)
      const d = _TORCH_TIP_DIR[(v >> 8) & 7];
      const tx = x + 0.5 - (d ? d[0] * 0.24 : 0), ty = y + (d ? 0.84 : 0.66), tz = z + 0.5 - (d ? d[1] * 0.24 : 0);
      if (typeof _fxEmber === 'function')
        for (let i = 0; i < 4; i++) _fxEmber(tx, ty, tz, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8);
    }
    if (Math.random() < FLINT_WEAR) spendHeld('used');
  } else {
    setBlock(x, y, z, B.CRYSTAL_TORCH | keep);
    playBlockSound(B.GLOWCRYSTAL_BLOCK, 'place', x, y, z);
    if (Math.random() < CRYSTAL_WEAR) spendHeld('used');
  }
  return true;
}

// the world save (16): the lights' clock and every light's due time on it (0.8373; before, a bare list on the world's clock)
const serializeBurns = () => ({ clock: Math.round(_burnNow()), list: [...BURNS.values()].map(e => [e[0], e[1], e[2], Math.round(e[3])]) });
function restoreBurns(rec) {
  BURNS.clear();
  _burnT = 0;
  _burnWorldAt = null;
  const own = rec && !Array.isArray(rec) && typeof rec.clock === 'number' && isFinite(rec.clock);
  _burnSync = !own;                                    // an older save's times are the world's: the clock starts there
  _burnClock = own ? rec.clock : 0;
  const list = own ? rec.list : rec;
  if (!Array.isArray(list)) return;
  for (const e of list)
    if (Array.isArray(e) && e.length === 4 && e.every(n => typeof n === 'number' && isFinite(n)))
      BURNS.set(_burnKey(e[0], e[1], e[2]), [e[0], e[1], e[2], e[3]]);
}
