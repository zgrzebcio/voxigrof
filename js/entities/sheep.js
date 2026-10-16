'use strict';
/* entities/sheep.js: the sheep. Its model and fleece, its numbers, spawning one, shearing.
   It moves by entities/grazers.js. */

/* ================================ sheep ================================
   Separate skin (textures/Entity/Farms/sheep.png) painted BARE — the fleece is not part of it.
   Wool is drawn as two oversized boxes wrapped around the body and head, textured from the
   wool block tile, so shearing/regrowing is just a visibility + scale change on those boxes. */
const _sheepTex = new THREE.TextureLoader().load('textures/Entity/Farms/sheep.png');
_sheepTex.colorSpace = THREE.SRGBColorSpace;
_sheepTex.magFilter = THREE.NearestFilter;
_sheepTex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
_sheepTex.generateMipmaps = true;
function _newSheepMat() {
  return new THREE.MeshBasicMaterial({ map: _sheepTex, transparent: true, alphaTest: 0.5 });
}
// wool material reuses the block atlas source image; built lazily because IMAGES is only
// populated once buildAtlas() has resolved
let _woolTex = null;
function _newWoolMat() {
  if (!_woolTex && IMAGES && IMAGES.wool) {
    _woolTex = new THREE.Texture(IMAGES.wool);
    _woolTex.colorSpace = THREE.SRGBColorSpace;
    _woolTex.magFilter = THREE.NearestFilter;
    _woolTex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
    _woolTex.generateMipmaps = true;
    _woolTex.needsUpdate = true;
  }
  return new THREE.MeshBasicMaterial({ map: _woolTex || null, color: _woolTex ? 0xffffff : 0xf2f2f2 });
}

function _sheepPart(mat, w, h, d, u, v) {
  const geo = new THREE.BoxGeometry(w * PX, h * PX, d * PX);
  _skinUV(geo, w, h, d, u, v);
  return new THREE.Mesh(geo, mat);
}
function _sheepLeg(mat, u, v) {
  const g = new THREE.Group();
  const m = _sheepPart(mat, 4, 12, 4, u, v);
  m.position.y = -6 * PX;                       // pivots at the hip
  g.add(m);
  return g;
}
/* Body is 8w x 6h x 16d and faces +Z like the humanoids.

   The sheet (textures/Entity/Farms/sheep.png) is 128x128 since 0.743 — twice the old resolution — and
   it now carries the FLEECE as well as the bare animal. Regions, in the 64-space units _skinUV
   works in (painted at 2x):
     fleece body 10x8x17 at (0,0)     shorn body 8x6x16 at (0,25)
     head        6x6x6   at (0,47)    leg        4x12x4 at (24,47)   (one region, all four legs)
     fleece cap  7x5x5   at (40,47)
   The fleece boxes draw from that same sheet through their OWN material, and that material is
   the only one that carries a tint (see setSheepWoolColor) — so the wool can be any colour while
   the face, legs and shorn skin stay exactly as painted. The old sheet is kept as old_sheep.png. */
const SHEEP_WOOL_COLORS = {
  white: 0xffffff, cream: 0xf0e6cf, grey: 0x9d9a95, brown: 0x7a5a3e, black: 0x3a3634,
};
function _newSheepWoolMat() {
  const m = new THREE.MeshBasicMaterial({ map: _sheepTex, transparent: true, alphaTest: 0.5 });
  m.userData.tint = new THREE.Color(0xffffff);
  return m;
}
/* The future-colours hook: a named colour from SHEEP_WOOL_COLORS or any hex. Lighting multiplies
   into it every frame through shadeHumanoid, so this is the whole job. */
function setSheepWoolColor(e, color) {
  if (!e || !e.model || !e.model.wmat) return;
  const hex = typeof color === 'number' ? color : (SHEEP_WOOL_COLORS[color] ?? SHEEP_WOOL_COLORS.white);
  e.woolColor = typeof color === 'number' ? color : (SHEEP_WOOL_COLORS[color] != null ? color : 'white');
  // ColorManagement is off and output is sRGB-encoded, so a raw hex would render too bright
  e.model.wmat.userData.tint.set(hex).convertSRGBToLinear();
}
function buildSheep() {
  const root = new THREE.Group();
  const mat = _newSheepMat();
  const wmat = _newSheepWoolMat();
  const body = _sheepPart(mat, 8, 6, 16, 0, 25);
  body.position.set(0, 15 * PX, 0);
  const head = _sheepPart(mat, 6, 6, 6, 0, 47);
  head.position.set(0, 16 * PX, 11 * PX);
  const legFL = _sheepLeg(mat, 24, 47); legFL.position.set(-3 * PX, 12 * PX,  5 * PX);
  const legFR = _sheepLeg(mat, 24, 47); legFR.position.set( 3 * PX, 12 * PX,  5 * PX);
  const legBL = _sheepLeg(mat, 24, 47); legBL.position.set(-3 * PX, 12 * PX, -5 * PX);
  const legBR = _sheepLeg(mat, 24, 47); legBR.position.set( 3 * PX, 12 * PX, -5 * PX);
  // fleece: boxes a little larger than the parts they cover, UV-mapped to the painted curls
  const woolBody = _sheepPart(wmat, 10, 8, 17, 0, 0);
  woolBody.position.copy(body.position);
  const woolHead = _sheepPart(wmat, 7, 5, 5, 40, 47);
  woolHead.position.set(0, 18 * PX, 9 * PX);
  root.add(body, head, legFL, legFR, legBL, legBR, woolBody, woolHead);
  return { root, head, body, legs: [legFL, legFR, legBL, legBR],
           wool: [woolBody, woolHead], mat, wmat, mats: [mat, wmat] };
}
// shared by every four-legged mob: front pair alternates, back pair mirrors it
function animateQuadruped(m, phase, swing, headPitch) {
  const s = Math.sin(phase) * swing, c = Math.sin(phase + Math.PI) * swing;
  m.legs[0].rotation.x = s;  m.legs[1].rotation.x = c;   // front pair alternates
  m.legs[2].rotation.x = c;  m.legs[3].rotation.x = s;   // back pair mirrors it
  m.head.rotation.x = headPitch;
}

/* ---- sheep: passive grazers. They never attack; being hit makes them bolt. ---- */
const SHEEP_HP = 40;
const SHEEP_SPEED = 2.0, SHEEP_FLEE_SPEED = 5.2;
const FLEE_SPEED_MUL = 1.56;             // every grazer bolts faster than its FLEE_SPEED says: +30% in 0.799, +20% again in 0.7992
const SHEEP_FLEE_TIME = 6;
const SHEEP_H = 1.3;                     // shorter than a humanoid
const SHEEP_WOOL_S = 1800;               // seconds for a shorn fleece to grow back (10 s once it had eaten before)
const SHEEP_GRAZE_CUT = 300;             // ...less this for every patch of grass it eats
const SHEEP_GRAZE_CD = 5;                // how often a shorn sheep looks for grass to eat
const SHEEP_GRAZE_CHANCE = 0.25;
// sheep like the cold: spruce forest and the mountains most
const SHEEP_BIOMES = { 'Spruce Forest': 1, 'Mountains': 1, 'Cold Plains': 0.4, 'Snow Forest': 0.3, 'Forest': 0.1 };
const SHEEP_CHUNK_CHANCE = 0.012;        // a flock in about 1 new chunk in 83, before the biome's weight
const SHEEP_FLOCK_MIN = 3, SHEEP_FLOCK_MAX = 5;

/* What one sheep is made of: its model and what only a sheep has. summon('sheep', x, y, z, opts) writes the rest
   (entities/mobs.js). `opts`: woolly, woolColor, size. */
function makeSheep(opts) {
  const size = _animalSize(opts);
  const woolly = opts.woolly !== undefined ? opts.woolly : true;
  return {
    model: buildSheep(), scale: SHEEP_SCALE * size,
    own: {
      woolly,                                   // fleece present -> shearable, drops wool
      woolColor: opts.woolColor != null ? opts.woolColor : 'white',   // tint on the fleece only
      size,
      woolGrow: woolly ? 1 : 0,                 // 0..1 regrow animation
      regrowing: !woolly,
      woolLeft: woolly ? 0 : SHEEP_WOOL_S,      // seconds until the fleece is back
      grazeCd: SHEEP_GRAZE_CD,
    },
    ready: (e) => setSheepWoolColor(e, e.woolColor),
  };
}

/* Right-clicking a woolly sheep with shears takes the fleece: drops wool (LOOT.shearWool), leaves the sheep
   shorn so it starts looking for grass to eat. Called from doPlace before block placement. */
function tryShearSheep() {
  const held = heldUseId();
  if (held == null || held < 256 || ITEM_PROPS[held]?.tool !== 'shears') return false;
  const ent = pickEntity();
  if (!ent || ent.kind !== 'sheep' || !ent.woolly) return false;
  ent.woolly = false;
  ent.woolGrow = 0;
  ent.regrowing = true;
  ent.woolLeft = SHEEP_WOOL_S;                  // 0.8324
  ent.grazeCd = SHEEP_GRAZE_CD;
  const bx = Math.floor(ent.x), by = Math.floor(ent.y + 0.5), bz = Math.floor(ent.z);
  const n = rollLoot(LOOT.shearWool);           // 50-loottable.js
  for (let i = 0; i < n; i++)
    spawnDrop(B.WOOL, bx, by, bz, {
      x: (Math.random() - 0.5) * 2.5, y: 2.2 + Math.random(), z: (Math.random() - 0.5) * 2.5,
    }, 0.5);
  addXP(XP_SHEAR, 'shearing');                                   // 0.8283
  const slot = HOTBAR[hotbarSel];
  if (!player.canFly && slot && slot.dur != null) {
    if (wearSlot(slot) === 'gone') HOTBAR[hotbarSel] = null;
    saveHotbar(); buildHotbar(); updateHotbar();
  }
  return true;
}

// its entry in the creature table (entities/mobs.js says what each line is for)
defineMob('sheep', {
  name: 'Sheep', group: 'animal', body: 'grazer',
  hp: SHEEP_HP, box: [0.345, 1.265], sized: true, foot: 'small',
  walk: SHEEP_SPEED, flee: SHEEP_FLEE_SPEED, fleeTime: SHEEP_FLEE_TIME,
  make: makeSheep, gendered: true, build: () => buildSheep(),
  herd: { chance: SHEEP_CHUNK_CHANCE, min: SHEEP_FLOCK_MIN, max: SHEEP_FLOCK_MAX, biomes: SHEEP_BIOMES },
  // the save: its fleece's colour, its size, gender and level, and how long a shorn fleece still has to grow
  save: (e) => ({ wc: e.woolColor, sz: e.size, g: e.gender, lv: e.level, wl: e.woolly ? 0 : Math.round(e.woolLeft || 0) }),
  cols: (e) => [e.woolly ? 1 : 0, 0],                 // fleece on or off, in the row's old place for it
  load: (s) => {
    const e = summon('sheep', s.x, s.y, s.z, {
      hp: s.hp, woolly: !!s.woolly,
      woolColor: s.d.wc != null ? s.d.wc : undefined,   // a save from before colours: white
      size: s.d.sz, gender: s.d.g, level: s.d.lv, hx: s.hx, hz: s.hz,
    });
    if (!e.woolly) e.woolLeft = s.d.wl >= 0 ? s.d.wl : SHEEP_WOOL_S;
    return e;
  },
  // mutton, and from one still in its fleece a block of wool and some string
  loot: (e, pop, first) => {
    first(ITEM.MUTTON, LOOT.meat);
    if (e.woolly) { pop(B.WOOL, 1); pop(ITEM.STRING, rollLoot(LOOT.woolString)); }
  },
  burnt: () => [ITEM.MUTTON, LOOT.meat],
});
