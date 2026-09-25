'use strict';
/* voxiGrof — sound system

   HOW IT WORKS
   ------------
   Every sound is an .ogg under sound/<Folder>/<name>.ogg. Files are looked up by a short key
   ('stone', 'doorOpen', ...) so callers never spell out paths.

   Playback uses a small round-robin pool of <audio> clones per file: one Audio element can only
   play one instance at a time, so mining a row of stone would cut its own tail off. The pool
   hands out the next element each call, which lets several copies overlap.

   Every volume passes through SOUND_MASTER, so the whole game is one knob.

   BLOCK SOUNDS
   ------------
   Blocks don't name a sound file — they carry a `type` in PROPS (02-voxel-core.js): 'stone',
   'ground', 'wood', 'grass', 'glass', 'snow', 'wool', 'tnt'. BLOCK_TYPE_SOUND maps that type to
   a file, so a new block picks up the right sound just by declaring its type.

   playBlockSound(id, kind) with kind 'break' | 'place' | 'step' varies gain + playback rate off
   the one file per type, so the three actions read differently without needing three files. */

const SOUND_MASTER = 0.5;                 // global scale — all sounds are quiet by design

/* Three volume sliders (0.804; they replaced the two mute buttons), 0-100, kept in localStorage.
   Master scales everything. Effects scale every sound through SOUND_MASTER as before. Music is quieter
   by design: 100% is MUSIC_BASE, and it starts at 50%. A mute saved by an older version comes back as 0. */
const MUSIC_BASE = 0.1;
const VOL_KEYS = { master: 'vg_volMaster', music: 'vg_volMusic', sfx: 'vg_volSfx' };
const VOL_DEFAULT = { master: 100, music: 50, sfx: 100 };
const soundVol = {};
for (const k in VOL_KEYS) {
  let v = null;
  try {
    const s = localStorage.getItem(VOL_KEYS[k]);
    if (s != null) v = +s;
    else if (localStorage.getItem(k === 'music' ? 'vg_muteMusic' : 'vg_muteSfx') === '1' && k !== 'master') v = 0;
  } catch {}
  soundVol[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : VOL_DEFAULT[k];
}
const sfxGain   = () => SOUND_MASTER * soundVol.sfx / 100 * soundVol.master / 100;
const musicGain = () => MUSIC_BASE * soundVol.music / 100 * soundVol.master / 100;
function setVolume(kind, v) {
  if (!(kind in VOL_KEYS)) return;
  soundVol[kind] = Math.max(0, Math.min(100, Math.round(+v || 0)));
  try { localStorage.setItem(VOL_KEYS[kind], String(soundVol[kind])); } catch {}
  updateMusic();
}

const SOUND_FILES = {
  // blocks
  glass: 'Sound/Blocks/glass.ogg',
  grass: 'Sound/Blocks/grass.ogg',
  gravel:'Sound/Blocks/gravel.ogg',
  lava:  'Sound/Blocks/lava.ogg',
  snow:  'Sound/Blocks/snow.ogg',
  stone: 'Sound/Blocks/stone.ogg',
  tnt:   'Sound/Blocks/tnt.ogg',
  wood:  'Sound/Blocks/wood.ogg',
  wool:  'Sound/Blocks/wool.ogg',
  // interactions
  chestOpen: 'Sound/Interact/chestOpen.ogg',
  chestClose:'Sound/Interact/chestClose.ogg',
  doorOpen:  'Sound/Interact/doorOpen.ogg',
  doorClose: 'Sound/Interact/doorClose.ogg',
  explode:   'Sound/Interact/explode.ogg',
  furnaceOn: 'Sound/Interact/furanceOn.ogg',
  // effects
  chew:      'Sound/VFX/chew.ogg',
  death:     'Sound/VFX/death.ogg',
  drown:     'Sound/VFX/drown.ogg',
  fallSmall: 'Sound/VFX/fall_small.ogg',
  hit:       'Sound/VFX/hit.ogg',
  swim:      'Sound/VFX/swim.ogg',
  fillLava:  'Sound/VFX/Items/fill_lava.ogg',
  fillWater: 'Sound/VFX/Items/fill_water.ogg',
  snowball:  'Sound/VFX/Items/throw_snowball.ogg',
  toolBreak: 'Sound/VFX/Items/tool_break.ogg',
  // gui — one chime for the feed, pitched per row kind (42-feed.js, 0.7576)
  feedAlert: 'Sound/VFX/GUI/feed_alert.wav',
};

/* PROPS.type -> sound key. Anything unmapped (or a block with no type) falls back to stone. */
const BLOCK_TYPE_SOUND = {
  stone: 'stone', ground: 'gravel', wood: 'wood', grass: 'grass',
  glass: 'glass', snow: 'snow', wool: 'wool', tnt: 'tnt',
};
const DEFAULT_BLOCK_SOUND = 'stone';

/* per-action gain + pitch, applied on top of the single file each block type owns */
const SOUND_KIND = {
  break: { gain: 1.0, rate: 0.92 },
  place: { gain: 0.85, rate: 1.05 },
  step:  { gain: 0.35, rate: 1.15 },
  hit:   { gain: 0.22, rate: 1.0 },       // the repeating tick while a block is being mined
};

const POOL_SIZE = 4;
const _soundPools = new Map();            // key -> { list: Audio[], next: int }
let _soundReady = false;                  // flipped by the first user gesture

/* Browsers refuse to start audio before an interaction. Until then play() rejects; we swallow
   it rather than queueing, because a burst of stale block sounds firing at once on the first
   click sounds worse than silence. */
function _soundPool(key) {
  let pool = _soundPools.get(key);
  if (pool) return pool;
  const src = SOUND_FILES[key];
  if (!src) return null;
  const list = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const a = new Audio(src);
    a.preload = 'auto';
    list.push(a);
  }
  pool = { list, next: 0 };
  _soundPools.set(key, pool);
  return pool;
}

/* play a sound by key. opts: { gain, rate, pos } — pos is a THREE.Vector3-ish {x,y,z} that
   attenuates with distance from the player. */
function playSound(key, opts) {
  if (!_soundReady || sfxGain() <= 0) return;
  const pool = _soundPool(key);
  if (!pool) return;
  const o = opts || {};
  let vol = (o.gain != null ? o.gain : 1) * sfxGain();          // master x effects slider (0.804)
  /* One pair of speakers, up to four listeners: attenuate from whichever player is CLOSEST, so
     a sound next to player three is still heard even while player one is a mile away (0.72). */
  if (o.pos && typeof PLAYERS !== 'undefined') {
    let d = Infinity;
    for (const p of PLAYERS) {
      if (!p.spawned) continue;
      const dx = o.pos.x - p.pos.x, dy = o.pos.y - p.pos.y, dz = o.pos.z - p.pos.z;
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dd < d) d = dd;
    }
    if (d > 24) return;                              // out of earshot — skip the decode entirely
    vol *= 1 - d / 24;
  }
  if (vol <= 0) return;
  const a = pool.list[pool.next];
  pool.next = (pool.next + 1) % pool.list.length;
  a.currentTime = 0;
  a.volume = Math.max(0, Math.min(1, vol));
  a.playbackRate = o.rate != null ? o.rate : 1;
  // browsers keep pitch when the rate changes; `pitch: true` lets the rate move the pitch instead
  if ('preservesPitch' in a) a.preservesPitch = !o.pitch;
  a.play().catch(() => {});                          // autoplay still blocked, or file missing
}

/* sound key for a block id (variant bits tolerated) */
function blockSoundKey(id) {
  const p = PROPS[id & 255];
  if (!p) return DEFAULT_BLOCK_SOUND;
  if (p.pass === 3) return 'lava';                   // fluids have no `type`
  return BLOCK_TYPE_SOUND[p.type] || DEFAULT_BLOCK_SOUND;
}

/* the one call the game uses: kind is 'break' | 'place' | 'step' */
function playBlockSound(id, kind, x, y, z) {
  const k = SOUND_KIND[kind] || SOUND_KIND.break;
  const pos = x != null ? { x: x + 0.5, y: y + 0.5, z: z + 0.5 } : null;
  playSound(blockSoundKey(id), { gain: k.gain, rate: k.rate * (0.95 + Math.random() * 0.1), pos });
  // every placement makes this sound, so this is where a placed block kicks up its bits (0.801)
  if (kind === 'place' && x != null && typeof fxPlace === 'function') fxPlace(x, y, z, getBlock(x, y, z));
}

/* ---- footsteps ----
   Driven from the main loop: accumulate horizontal distance while grounded and fire a step from
   the block actually under the feet every STEP_DIST metres. Distance-based (not time-based) so
   sneaking and sprinting space out correctly without extra state. */
const STEP_DIST = 2.1;

/* The accumulator lives ON THE PLAYER (0.729), the same way entities carry their own.

   It used to be three module-level variables, but updateFootsteps runs once per player per frame —
   so with split screen `_stepLastX/Z` was overwritten by whoever ticked last, and the "distance
   walked" each call measured was really the distance BETWEEN two players. Standing perfectly still
   a couple of blocks apart therefore fired footsteps continuously, and the further apart they
   stood the faster they ran. */
function updateFootsteps(grounded) {
  const p = player.pos;
  const dx = p.x - (player._stepLastX ?? p.x), dz = p.z - (player._stepLastZ ?? p.z);
  player._stepLastX = p.x; player._stepLastZ = p.z;
  if (typeof fxWalk === 'function') fxWalk(player, grounded, dx, dz);   // footprints and kicked-up bits (0.8)
  if (!grounded || player.flying) { player._stepAccum = 0; return; }
  player._stepAccum = (player._stepAccum || 0) + Math.sqrt(dx * dx + dz * dz);
  if (player._stepAccum < STEP_DIST) return;
  player._stepAccum = 0;
  // the block whose top the feet rest on — one cell below, since p.y sits at that surface
  const bx = Math.floor(p.x), bz = Math.floor(p.z);
  let id = getBlock(bx, Math.floor(p.y - 0.06), bz) & 255;
  if (id === B.AIR) id = getBlock(bx, Math.floor(p.y) - 1, bz) & 255;   // slab/carpet tops
  if (id === B.AIR) return;
  playBlockSound(id, 'step');
}

/* ---- entity footsteps ----
   Same distance-accumulator idea as the player's, but per-entity (the counter lives on the
   entity) and range-gated: a herd wandering across the world would otherwise burn a getBlock
   and a pool lookup each, every step, for sounds nobody can hear. */
const ENT_STEP_DIST  = 1.9;
const ENT_STEP_RANGE = 16;

function entityStepSound(e, dt, spd) {
  if (!e.onGround || spd < 0.6) { e._stepAccum = 0; return; }
  const lp = nearestPlayerTo(e.x, e.z);                    // audible near ANY player (0.72)
  const dx = e.x - lp.pos.x, dy = e.y - lp.pos.y, dz = e.z - lp.pos.z;
  if (dx * dx + dy * dy + dz * dz > ENT_STEP_RANGE * ENT_STEP_RANGE) { e._stepAccum = 0; return; }
  if (typeof fxEntityWalk === 'function') fxEntityWalk(e, dt, spd);   // prints by the size of its feet (0.8)
  e._stepAccum = (e._stepAccum || 0) + spd * dt;
  if (e._stepAccum < ENT_STEP_DIST) return;
  e._stepAccum = 0;
  const id = getBlock(Math.floor(e.x), Math.floor(e.y - 0.06), Math.floor(e.z)) & 255;
  if (id === B.AIR) return;
  const k = SOUND_KIND.step;
  playSound(blockSoundKey(id), {
    gain: k.gain, rate: k.rate * (0.95 + Math.random() * 0.1), pos: { x: e.x, y: e.y, z: e.z },
  });
}

/* ---- background music ----
   Menu-only: the title panorama has it, gameplay is silent. `menuScene` is the authority, so
   the track also returns when you quit a world back to the menu. Pausing mid-game does NOT
   bring it back — menuScene stays false while a world is loaded. */
const _bgm = new Audio('sound/Music/sneaky.wav');
_bgm.loop = true;
_bgm.volume = musicGain();

function updateMusic() {
  const wantMusic = _soundReady && musicGain() > 0 && (typeof menuScene === 'undefined' || menuScene);
  _bgm.volume = Math.min(1, musicGain());                    // follows the sliders live (0.804)
  if (wantMusic) { if (_bgm.paused) _bgm.play().catch(() => {}); }
  else if (!_bgm.paused) _bgm.pause();
}

/* unlock audio on the first gesture — browsers block playback until then */
{
  const unlock = () => {
    _soundReady = true;
    updateMusic();
    removeEventListener('pointerdown', unlock);
    removeEventListener('keydown', unlock);
  };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
}
