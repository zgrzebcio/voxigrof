'use strict';
/* voxiGrof — humanoid entities + third-person camera

   The player and the wandering NPCs share one model builder: a Minecraft-layout 64x64 skin
   (textures/Entity/player.png) mapped onto six boxes with per-face UVs. Limbs hang off pivot
   groups so a single walk phase drives the swing.

   NPCs are NEUTRAL: they wander until something hurts them, then they chase and hit back.
   Each carries a small randomly-rolled survival inventory that spills on death, on top of a
   guaranteed loot entry. */

/* ================================ skin + model ================================ */
const SKIN_PX = 64;                                  // skin is 64x64
const MODEL_PX = 32;                                 // model is 32px tall (head 8 + body 12 + legs 12)
const PX = 1.8 / MODEL_PX;                           // world units per skin pixel (player.H = 1.8)

const _skinTex = new THREE.TextureLoader().load('textures/Entity/player.png');
_skinTex.colorSpace = THREE.SRGBColorSpace;
_skinTex.magFilter = THREE.NearestFilter;
_skinTex.minFilter = THREE.NearestFilter;
_skinTex.generateMipmaps = false;
// Every humanoid owns its material so it can be lit (and hurt-flashed) independently. The skin
// is a MeshBasicMaterial — it never sees the world shader's lighting — so brightness is baked
// into the material colour each frame from the sky/block light at the entity's own cell.
function _newSkinMat() {
  return new THREE.MeshBasicMaterial({ map: _skinTex, transparent: true, alphaTest: 0.5 });
}
const _HURT_COL = new THREE.Color(0xff6a6a).convertSRGBToLinear();
const _BURN_COL = new THREE.Color(0xff8a2a).convertSRGBToLinear();   // sunlight scorch on a zombie
/* Zombie skin (textures/Entity/zombie.png): the player sheet with every skin tone pushed to
   green and the eye pixels blacked out, so the rig, UVs and animation are shared unchanged. */
const _zombieTex = new THREE.TextureLoader().load('textures/Entity/zombie.png');
_zombieTex.colorSpace = THREE.SRGBColorSpace;
_zombieTex.magFilter = THREE.NearestFilter;
_zombieTex.minFilter = THREE.NearestFilter;
_zombieTex.generateMipmaps = false;
function _newZombieMat() {
  return new THREE.MeshBasicMaterial({ map: _zombieTex, transparent: true, alphaTest: 0.5 });
}
/* Skeleton skin (textures/Entity/skeleton.png): the same six-box layout at DOUBLE the zombie's
   resolution — a 128x128 sheet instead of 64x64 — because a skull, a ribcage and a jaw full of
   teeth need pixels the zombie's flat green never did. The UV math is proportional (regions are
   fractions of the sheet), so the rig, _skinUV and every animation work unchanged; only the
   texture is finer. */
const _skeletonTex = new THREE.TextureLoader().load('textures/Entity/skeleton.png');
_skeletonTex.colorSpace = THREE.SRGBColorSpace;
_skeletonTex.magFilter = THREE.NearestFilter;
_skeletonTex.minFilter = THREE.NearestFilter;
_skeletonTex.generateMipmaps = false;
function _newSkeletonMat() {
  return new THREE.MeshBasicMaterial({ map: _skeletonTex, transparent: true, alphaTest: 0.5 });
}
// light at a cell -> 0..1 brightness, matching the world shader's day/night response
function _lightAt(x, y, z) {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const sky = getSkyWorld(bx, by, bz) / 15;
  const blk = getLightWorld(bx, by, bz) / 15;
  const amb = sharedUniforms.uAmbient.value, dir = sharedUniforms.uDirect.value;
  const daylight = (amb + dir * sky) * sky;
  return Math.min(1, Math.max(0.24, Math.max(daylight, blk * 0.95)));   // floor tracks skyF
}

/* Write the six MC skin regions into a BoxGeometry's uv attribute.
   Box faces come in the order [+X, -X, +Y, -Y, +Z, -Z]. The model faces +Z, so +Z is the
   character's front and its right hand sits on -X — that is why -X takes the skin's "right"
   region and +X takes "left". Region layout for a w x h x d part based at (u,v):
     right (u, v+d)  top (u+d, v)  left (u+d+w, v+d)  bottom (u+d+w, v)
     front (u+d, v+d)  back (u+2d+w, v+d)                                        */
function _skinUV(geo, w, h, d, u, v) {
  const uv = geo.attributes.uv;
  const put = (face, px, py, pw, ph) => {
    const u0 = px / SKIN_PX, u1 = (px + pw) / SKIN_PX;
    const v0 = 1 - (py + ph) / SKIN_PX, v1 = 1 - py / SKIN_PX;
    const o = face * 4;
    uv.setXY(o + 0, u0, v1); uv.setXY(o + 1, u1, v1);
    uv.setXY(o + 2, u0, v0); uv.setXY(o + 3, u1, v0);
  };
  put(0, u + d + w, v + d, d, h);          // +X = character's left side
  put(1, u,         v + d, d, h);          // -X = character's right side
  put(2, u + d,     v,     w, d);          // +Y top
  put(3, u + d + w, v,     w, d);          // -Y bottom
  put(4, u + d,     v + d, w, h);          // +Z front
  put(5, u + 2 * d + w, v + d, w, h);      // -Z back
  uv.needsUpdate = true;
}
function _part(mat, w, h, d, u, v) {
  const geo = new THREE.BoxGeometry(w * PX, h * PX, d * PX);
  _skinUV(geo, w, h, d, u, v);
  return new THREE.Mesh(geo, mat);
}
// A limb pivots at its TOP, so the mesh is pushed half its length below the pivot group.
function _limb(mat, w, h, d, u, v) {
  const g = new THREE.Group();
  const m = _part(mat, w, h, d, u, v);
  m.position.y = -h * PX / 2;
  g.add(m);
  return g;
}

// Full humanoid. Returns the root group plus the pieces the animator needs.
// `mat` lets a variant (the zombie) reuse the exact same rig with a different skin sheet.
/* The head, chest and arms hang off a TORSO group pivoted at the hips (0.726) rather than
   directly off the root, so leaning the upper body — sneaking — carries the head and both arms
   with it while the legs stay planted. Everything the animators address by name (m.head, m.armR,
   …) is unchanged; only the parenting and the local Y offsets moved. */
function buildHumanoid(mat = _newSkinMat()) {
  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 12 * PX;                         // hip height: the lean pivot
  const head = _part(mat, 8, 8, 8, 0, 0);
  head.position.y = 16 * PX;                          // 12 body + 4 (half head), above the hips
  const body = _part(mat, 8, 12, 4, 16, 16);
  body.position.y = 6 * PX;
  const armR = _limb(mat, 4, 12, 4, 40, 16);          // character's right = -X
  armR.position.set(-6 * PX, 12 * PX, 0);
  const armL = _limb(mat, 4, 12, 4, 32, 48);
  armL.position.set(6 * PX, 12 * PX, 0);
  const legR = _limb(mat, 4, 12, 4, 0, 16);
  legR.position.set(-2 * PX, 12 * PX, 0);
  const legL = _limb(mat, 4, 12, 4, 16, 48);
  legL.position.set(2 * PX, 12 * PX, 0);
  torso.add(head, body, armR, armL);
  root.add(torso, legR, legL);
  return { root, torso, head, body, armR, armL, legR, legL, mat, mats: [mat] };
}

/* Walk cycle + head aim, shared by the local player model and every NPC.
   `atk` (0..1) overlays a downward chopping swing on the right arm.
   `opts` carries the poses only players strike (see poseSelfModel):
     lean  radians the torso tips forward — sneaking
     eat   0..1 raises the held hand to the mouth with a nibble
     hold  true when carrying something, so the arm presents it instead of hanging      */
function animateHumanoid(m, phase, swing, pitch, atk = 0, opts) {
  const s = Math.sin(phase) * swing;
  const c = Math.sin(phase + Math.PI) * swing;
  m.armR.rotation.x = s;  m.armL.rotation.x = c;
  m.legR.rotation.x = c;  m.legL.rotation.x = s;
  const lean = (opts && opts.lean) || 0;
  if (m.torso) m.torso.rotation.x = lean;
  // the head aims in WORLD terms, so a leaning torso has to be subtracted back out of it
  m.head.rotation.x = pitch - lean;
  m.armR.rotation.z = 0;
  m.armL.rotation.z = 0;
  m.armR.rotation.y = 0;                                 // only the bow draw yaws an arm
  m.armL.rotation.y = 0;
  if (atk > 0) {
    // arm winds up over the first third of the window, then chops through
    const t = 1 - atk;                                   // 0 at swing start -> 1 at the end
    m.armR.rotation.x = -2.5 + Math.sin(Math.min(1, t * 1.4) * Math.PI) * 2.2;
    m.armR.rotation.z = -0.25 * atk;
  }
  if (opts) {
    if (opts.eat > 0) {
      // both the raise and the nibble live on the right arm; the wobble sells the chewing
      const r = Math.min(1, opts.eat * 5);               // fully raised in the first fifth
      m.armR.rotation.x = -1.35 * r + Math.sin(opts.eat * 34) * 0.12 * r;
      m.armR.rotation.z = 0.45 * r;
      m.head.rotation.x = pitch - lean + 0.18 * r;       // chin dips toward the food
    } else if (opts.hold && atk <= 0) {
      // carrying something: the arm holds it out in front rather than swinging at the hip
      m.armR.rotation.x -= 1.05 + pitch * 0.45;
      m.armR.rotation.z = -0.18;
    }
    // ...and the LEFT arm, for something carried in the offhand that is not a shield: a torch (0.7531)
    if (opts.holdL) {
      m.armL.rotation.x -= 1.05 + pitch * 0.45;
      m.armL.rotation.z = 0.18;
    }
    // sneaking tucks the arms in slightly, the way a crouch does
    if (lean > 0.01) { m.armR.rotation.z -= 0.10; m.armL.rotation.z += 0.10; }
  }
  /* Drawing a bow (0.735). `draw` is 0..1 — the bow arm comes up straight along the line of
     sight first, then the string hand hauls back past the jaw as the draw fills. Shared by the
     player's own body and by every mob that can shoot, so a skeleton at full draw and a player
     at full draw are the same silhouette. */
  const drw = (opts && opts.draw) || 0;
  if (drw > 0) {
    const r = Math.min(1, drw * 3);                   // arms are up well before the string is back
    /* The RIGHT arm is the bow arm — it holds the weapon, and every held-item rig in the game
       (the player's _selfHeld, a mob's heldGrp, the first-person hand) hangs off armR, so the
       bow ends up in the hand that is actually presenting it. */
    m.armR.rotation.x = (-Math.PI / 2 + pitch - lean) * r;
    m.armR.rotation.z = -0.26 * r;
    // the left is the string hand: alongside the bow at first, hauled back to the cheek at full draw
    m.armL.rotation.x = (-Math.PI / 2 + pitch - lean) * r + 0.30 * drw;
    m.armL.rotation.z = (0.28 + 0.5 * drw) * r;
    m.armL.rotation.y = -0.35 * drw;
  }
  /* Blocking (0.745). The LEFT arm comes up in front of the chest and in across the body, carrying
     the offhand shield (40-shield.js poseBodyOffhand) between the body and whatever it faces.
     Negative z swings the left hand inward — the same convention the zombie pose uses. */
  const blk = (opts && opts.block) || 0;
  if (blk > 0) {
    m.armL.rotation.x = m.armL.rotation.x * (1 - blk) + (-1.2 + pitch * 0.5 - lean) * blk;
    m.armL.rotation.z = -0.55 * blk;
    m.armL.rotation.y = 0;
  }
  // ...and the RIGHT arm, for a shield in the main hand (0.7451); positive z swings it inward
  const blkR = (opts && opts.blockR) || 0;
  if (blkR > 0) {
    m.armR.rotation.x = m.armR.rotation.x * (1 - blkR) + (-1.2 + pitch * 0.5 - lean) * blkR;
    m.armR.rotation.z = 0.55 * blkR;
    m.armR.rotation.y = 0;
  }
}
// Bake world lighting (and the hurt / burning flash) into this model's own material(s).
// `burn` is the daylight scorch: an orange wash that flickers so it reads as fire, not damage.
function shadeHumanoid(m, x, y, z, hurt, burn) {
  const b = _lightAt(x, y + 1.0, z);          // sample around chest height
  const f = burn ? 0.8 + Math.random() * 0.45 : 0;
  for (const mat of (m.mats || [m.mat])) {
    if (!mat) continue;
    if (hurt) mat.color.setRGB(_HURT_COL.r * b, _HURT_COL.g * b, _HURT_COL.b * b);
    else if (burn) mat.color.setRGB(_BURN_COL.r * f, _BURN_COL.g * f, _BURN_COL.b * f);
    /* A material may carry its own tint in userData (0.743) — the sheep's fleece does, so one
       white sheet can be any colour of wool. Lighting is multiplied INTO the tint, never
       written over it, or every dyed sheep would wash back to white the first frame it moved. */
    else if (mat.userData && mat.userData.tint) {
      const t = mat.userData.tint;
      mat.color.setRGB(t.r * b, t.g * b, t.b * b);
    }
    else mat.color.setScalar(b);
  }
}

/* ================================ sheep ================================
   Separate skin (textures/Entity/sheep.png) painted BARE — the fleece is not part of it.
   Wool is drawn as two oversized boxes wrapped around the body and head, textured from the
   wool block tile, so shearing/regrowing is just a visibility + scale change on those boxes. */
const _sheepTex = new THREE.TextureLoader().load('textures/Entity/sheep.png');
_sheepTex.colorSpace = THREE.SRGBColorSpace;
_sheepTex.magFilter = THREE.NearestFilter;
_sheepTex.minFilter = THREE.NearestFilter;
_sheepTex.generateMipmaps = false;
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
    _woolTex.minFilter = THREE.NearestFilter;
    _woolTex.generateMipmaps = false;
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

   The sheet (textures/Entity/sheep.png) is 128x128 since 0.743 — twice the old resolution — and
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

/* ================================ cow ================================
   TWO-TONE since 0.744: one rig, two white 128x128 sheets, two tints.
     textures/Entity/cow_body.png   the hide — white, with all shading and every feature (eyes,
                                    muzzle, hooves, udder) baked in
     textures/Entity/cow_spots.png  white, and its ALPHA is the patch mask
   The material mixes the two tints by that mask and multiplies the hide over the result, so a
   cow of any colours is just two hex values and the dark features stay dark under both. The
   spots are evaluated in 3D against the box each texel belongs to, so a patch runs over an edge
   and carries on onto the next face. Region layout (64-space units, painted at 2x):
     body  10w x 10h x 16d at (0, 0)      head 7x7x7 at (0, 27)
     leg   4w x 12h x 4d   at (29, 27)    horn 2x2x2 at (46, 27)
   Anything that moves those numbers has to move them in the generator too, or the spots stop
   lining up across the box seams. The old single-colour sheets (cow_brown/cow_white) are no
   longer read, and are left on disk untouched. */
/* Named coats are just tint pairs. 'brown' and 'white' are the two pre-0.744 variant names —
   kept so every saved cow comes back as the cow it was. */
const COW_COATS = {
  holstein: { body: 0xf4f1ea, spot: 0x2a2725 },
  ayrshire: { body: 0xf4f1ea, spot: 0x8e4a26 },
  hereford: { body: 0x8a4424, spot: 0xf2ede4 },
  jersey:   { body: 0xba8653, spot: 0x9a6a3e },
  angus:    { body: 0x2e2a28, spot: 0x2e2a28 },
  brown:    { body: 0x7b4d2e, spot: 0xf0ebe1 },
  white:    { body: 0xf4f1ea, spot: 0x2a2725 },
};
const COW_VARIANTS = Object.keys(COW_COATS);
const COW_COAT_POOL = ['holstein', 'holstein', 'ayrshire', 'hereford', 'hereford', 'jersey', 'angus'];
function _nearestTex(url) {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
const _cowBodyTex = _nearestTex('textures/Entity/cow_body.png');
const _cowSpotTex = _nearestTex('textures/Entity/cow_spots.png');
/* A plain MeshBasicMaterial with three lines of shader added: the spot sheet's alpha picks
   between the two tints, and that is multiplied into the hide the stock map pass already
   sampled. Lighting still arrives through material.color exactly as for every other mob (see
   shadeHumanoid), so the cow needs no shading code of its own. The tint Colors are shared BY
   REFERENCE with the uniforms, so recolouring a live cow is a .set() on userData. */
function _newCowMat(bodyHex, spotHex) {
  const m = new THREE.MeshBasicMaterial({ map: _cowBodyTex, transparent: true, alphaTest: 0.5 });
  m.userData.bodyTint = new THREE.Color(bodyHex).convertSRGBToLinear();
  m.userData.spotTint = new THREE.Color(spotHex).convertSRGBToLinear();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.spotMap  = { value: _cowSpotTex };
    sh.uniforms.bodyTint = { value: m.userData.bodyTint };
    sh.uniforms.spotTint = { value: m.userData.spotTint };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D spotMap;\nuniform vec3 bodyTint;\nuniform vec3 spotTint;')
      .replace('#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.rgb *= mix( bodyTint, spotTint, texture2D( spotMap, vMapUv ).a );');
  };
  m.customProgramCacheKey = () => 'cow-two-tone';     // every cow shares one compiled program
  return m;
}
// recolour a live cow; either argument may be omitted to keep that half as it is
function setCowColors(e, bodyHex, spotHex) {
  const u = e && e.model && e.model.mat && e.model.mat.userData;
  if (!u || !u.bodyTint) return;
  if (bodyHex != null) { u.bodyTint.set(bodyHex).convertSRGBToLinear(); e.bodyTint = bodyHex; }
  if (spotHex != null) { u.spotTint.set(spotHex).convertSRGBToLinear(); e.spotTint = spotHex; }
}
function _cowLeg(mat) {
  const g = new THREE.Group();
  const m = _part(mat, 4, 12, 4, 29, 27);
  m.position.y = -6 * PX;                       // pivots at the hip, same as the sheep
  g.add(m);
  return g;
}
function buildCow(bodyHex = COW_COATS.holstein.body, spotHex = COW_COATS.holstein.spot) {
  const root = new THREE.Group();
  const mat = _newCowMat(bodyHex, spotHex);
  const body = _part(mat, 10, 10, 16, 0, 0);
  body.position.set(0, 17 * PX, 0);
  const head = new THREE.Group();               // horns ride with the head, so it gets a pivot
  head.position.set(0, 20 * PX, 11.5 * PX);
  const skull = _part(mat, 7, 7, 7, 0, 27);
  const hornR = _part(mat, 2, 2, 2, 46, 27); hornR.position.set(-4 * PX, 3 * PX, -1 * PX);
  const hornL = _part(mat, 2, 2, 2, 46, 27); hornL.position.set( 4 * PX, 3 * PX, -1 * PX);
  head.add(skull, hornR, hornL);
  const legFL = _cowLeg(mat); legFL.position.set(-3.5 * PX, 12 * PX,  5 * PX);
  const legFR = _cowLeg(mat); legFR.position.set( 3.5 * PX, 12 * PX,  5 * PX);
  const legBL = _cowLeg(mat); legBL.position.set(-3.5 * PX, 12 * PX, -5 * PX);
  const legBR = _cowLeg(mat); legBR.position.set( 3.5 * PX, 12 * PX, -5 * PX);
  root.add(body, head, legFL, legFR, legBL, legBR);
  return { root, head, body, legs: [legFL, legFR, legBL, legBR], mat, mats: [mat] };
}

/* ================================ pig (0.789) ================================
   The cow's two-tone scheme again, and for the same reason: one rig, two white 128x128 sheets,
   two tints, so a breed is two hex values rather than a new sheet.
     textures/Entity/pig_body.png   the hide — white, with the eyes, snout, inner ear, belly and
                                    trotters shaded in, all of them dark multipliers so they stay
                                    readable under a pink tint and under a black one
     textures/Entity/pig_spots.png  white, and its ALPHA is the patch mask
   Region layout (64-space units, painted at 2x):
     body  10w x 9h x 16d at (0, 0)     head 8x8x8 at (0, 27)
     leg   4w x 8h x 4d   at (34, 27)   ear  3x3x1 at (34, 41)   snout 4x3x2 at (44, 41)
   Both sheets come out of toolsrc/pig-tex.js, which also holds the part OFFSETS the patch mask is
   evaluated against. Move a box here and the offsets move there too, or the patches stop running
   across the seams — same standing rule as the cow. */
const PIG_COATS = {
  pink:       { body: 0xe8a79c, spot: 0xe8a79c },   // a plain pink pig: both tints the same
  spotted:    { body: 0xe8a79c, spot: 0x3c3532 },   // pink with dark patches
  hampshire:  { body: 0x2c2724, spot: 0xe2ded6 },
  duroc:      { body: 0x9c4a24, spot: 0x8a3f1d },
  berkshire:  { body: 0x332d2a, spot: 0x4a423e },
  tamworth:   { body: 0xc06a35, spot: 0xcf7c45 },
};
const PIG_VARIANTS = Object.keys(PIG_COATS);
const PIG_COAT_POOL = ['pink', 'pink', 'pink', 'spotted', 'spotted', 'hampshire', 'duroc', 'tamworth', 'berkshire'];
const _pigBodyTex = _nearestTex('textures/Entity/pig_body.png');
const _pigSpotTex = _nearestTex('textures/Entity/pig_spots.png');
// the cow's material, pointed at the pig's sheets — see _newCowMat for what the three added lines do
function _newPigMat(bodyHex, spotHex) {
  const m = new THREE.MeshBasicMaterial({ map: _pigBodyTex, transparent: true, alphaTest: 0.5 });
  m.userData.bodyTint = new THREE.Color(bodyHex).convertSRGBToLinear();
  m.userData.spotTint = new THREE.Color(spotHex).convertSRGBToLinear();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.spotMap  = { value: _pigSpotTex };
    sh.uniforms.bodyTint = { value: m.userData.bodyTint };
    sh.uniforms.spotTint = { value: m.userData.spotTint };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D spotMap;\nuniform vec3 bodyTint;\nuniform vec3 spotTint;')
      .replace('#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.rgb *= mix( bodyTint, spotTint, texture2D( spotMap, vMapUv ).a );');
  };
  m.customProgramCacheKey = () => 'pig-two-tone';    // every pig shares one compiled program
  return m;
}
// recolour a live pig; either argument may be omitted to keep that half as it is
function setPigColors(e, bodyHex, spotHex) {
  const u = e && e.model && e.model.mat && e.model.mat.userData;
  if (!u || !u.bodyTint) return;
  if (bodyHex != null) { u.bodyTint.set(bodyHex).convertSRGBToLinear(); e.bodyTint = bodyHex; }
  if (spotHex != null) { u.spotTint.set(spotHex).convertSRGBToLinear(); e.spotTint = spotHex; }
}
function _pigLeg(mat) {
  const g = new THREE.Group();
  const m = _part(mat, 4, 8, 4, 34, 27);
  m.position.y = -4 * PX;                       // pivots at the hip, same as the sheep and the cow
  g.add(m);
  return g;
}
function buildPig(bodyHex = PIG_COATS.pink.body, spotHex = PIG_COATS.pink.spot) {
  const root = new THREE.Group();
  const mat = _newPigMat(bodyHex, spotHex);
  const body = _part(mat, 10, 9, 16, 0, 0);
  body.position.set(0, 12.5 * PX, 0);
  /* The head is a pivot group so the snout and the ears dip with it. The ears are the reason a pig
     reads as a pig at twenty paces, so they are large, splayed well out to the sides and tipped
     forward over the eyes rather than standing up like a cow's horns. Their region and the snout's
     are sized in toolsrc/pig-tex.js; the two have to agree. */
  const head = new THREE.Group();
  head.position.set(0, 13.5 * PX, 11.5 * PX);
  const skull = _part(mat, 8, 8, 8, 0, 27);
  const snout = _part(mat, 5, 4, 3, 46, 41); snout.position.set(0, -2 * PX, 5.5 * PX);
  const earL = _part(mat, 4, 5, 1, 34, 41);
  earL.position.set( 3.2 * PX, 5 * PX, -1 * PX);
  earL.rotation.set(-0.55, 0, -0.42);
  const earR = _part(mat, 4, 5, 1, 34, 41);
  earR.position.set(-3.2 * PX, 5 * PX, -1 * PX);
  earR.rotation.set(-0.55, 0, 0.42);
  head.add(skull, snout, earL, earR);
  const legFL = _pigLeg(mat); legFL.position.set(-3 * PX, 8 * PX,  5 * PX);
  const legFR = _pigLeg(mat); legFR.position.set( 3 * PX, 8 * PX,  5 * PX);
  const legBL = _pigLeg(mat); legBL.position.set(-3 * PX, 8 * PX, -5 * PX);
  const legBR = _pigLeg(mat); legBR.position.set( 3 * PX, 8 * PX, -5 * PX);
  root.add(body, head, legFL, legFR, legBL, legBR);
  return { root, head, body, ears: [earL, earR], legs: [legFL, legFR, legBL, legBR], mat, mats: [mat] };
}

/* ================================ fish (0.805) ================================
   Four species living in water: cod < salmon < pike < catfish, by size and health. Passive — a hit
   sends one darting away — and each drops one of its own raw fish. They have a level like every
   creature but no gender. On land they flop about and slowly suffocate.

   One sheet per species (textures/Entity/<species>.png, 128x128, the 64-unit layout at 2x), all on
   the same box layout, painted by toolsrc/fish-tex.ps1 (PowerShell; it refuses to overwrite a sheet):
     body     4w x 6h x 12d at (0, 0)     head   4x5x4 at (0, 20)     tail  1x6x5 at (20, 20)
     dorsal   1x3x6 at (34, 0)            pectoral fin 3x1x2 at (34, 12)
     whisker  1x1x4 at (34, 18)  (drawn on the catfish's sheet only)
   A species' shape is the same boxes STRETCHED (`body`/`head` scales below): a pike long and thin,
   a catfish wide-headed and flat. `len` is its overall size; each fish then rolls its own size. */
const FISH = {
  cod:     { name: 'Cod',     hp: 4, item: ITEM.COD,     len: 0.55, body: [1, 1, 1],        head: [1, 1, 1],        speed: 1.6, flee: 4.2, weight: 40 },
  salmon:  { name: 'Salmon',  hp: 5, item: ITEM.SALMON,  len: 0.68, body: [0.9, 0.95, 1.2], head: [0.9, 0.9, 1.1],  speed: 1.9, flee: 4.8, weight: 30 },
  pike:    { name: 'Pike',    hp: 7, item: ITEM.PIKE,    len: 0.85, body: [0.8, 0.8, 1.5],  head: [0.85, 0.75, 1.5], speed: 1.8, flee: 5.2, weight: 20 },
  catfish: { name: 'Catfish', hp: 8, item: ITEM.CATFISH, len: 1.0,  body: [1.25, 0.85, 1.1], head: [1.5, 0.8, 1.1], speed: 1.2, flee: 3.8, weight: 10, whiskers: true, bottom: true },
};
const FISH_SPECIES = Object.keys(FISH);
const FISH_FLEE_TIME = 4;
const FISH_DRY_GRACE = 4, FISH_DRY_EVERY = 1.5;   // seconds out of water before it starts to suffocate, then per point
const _fishTex = {};
for (const s of FISH_SPECIES) _fishTex[s] = _nearestTex('textures/Entity/' + s + '.png');
function buildFish(species) {
  const sp = FISH[species] || FISH.cod;
  const mat = new THREE.MeshBasicMaterial({ map: _fishTex[species] || _fishTex.cod, transparent: true, alphaTest: 0.5,
                                            side: THREE.DoubleSide });
  const root = new THREE.Group();
  // `swim` carries the whole fish: it pitches with the dive and rolls onto its side when stranded
  const swim = new THREE.Group();
  swim.position.y = 3 * PX * sp.body[1];
  const body = _part(mat, 4, 6, 12, 0, 0);
  body.scale.set(...sp.body);
  const head = _part(mat, 4, 5, 4, 0, 20);
  head.scale.set(...sp.head);
  head.position.set(0, -0.3 * PX, (6 * sp.body[2] + 2 * sp.head[2]) * PX);
  const tail = new THREE.Group();                       // wags from where it joins the body
  tail.position.z = -6 * sp.body[2] * PX;
  const fin = _part(mat, 1, 6, 5, 20, 20);
  fin.position.z = -2.5 * PX;
  fin.scale.y = Math.max(0.8, sp.body[1]);
  tail.add(fin);
  const dorsal = _part(mat, 1, 3, 6, 34, 0);
  // a pike carries its dorsal fin far back, by the tail, the others mid-back
  dorsal.position.set(0, (3 * sp.body[1] + 1.4) * PX, (species === 'pike' ? -3.2 : 0.5) * sp.body[2] * PX);
  const finL = _part(mat, 3, 1, 2, 34, 12), finR = _part(mat, 3, 1, 2, 34, 12);
  finL.position.set( (2 * sp.body[0] + 1.2) * PX, -1.6 * PX * sp.body[1], 3.5 * sp.body[2] * PX);
  finR.position.set(-(2 * sp.body[0] + 1.2) * PX, -1.6 * PX * sp.body[1], 3.5 * sp.body[2] * PX);
  finL.rotation.z = -0.45; finR.rotation.z = 0.45;
  swim.add(body, head, tail, dorsal, finL, finR);
  if (sp.whiskers) {                                    // a catfish's barbels, from the corners of its mouth
    for (const sx of [1, -1]) {
      const w = _part(mat, 1, 1, 4, 34, 18);
      w.position.set(sx * 2.2 * sp.head[0] * PX, -1.6 * PX, head.position.z + 2.5 * PX);
      w.rotation.set(0.35, sx * 0.55, 0);
      swim.add(w);
    }
  }
  root.add(swim);
  return { root, swim, tail, fins: [finL, finR], mat, mats: [mat], tint: new THREE.Color(1, 1, 1) };
}
// a fish's box: its species' length times its own roll, flatter than it is long
const fishLen = (e) => (FISH[e.species] || FISH.cod).len * (e.size || 1);
const isFish = (e) => e.kind === 'fish';
function spawnFish(x, y, z, opts = {}) {
  const species = FISH[opts.species] ? opts.species : _rollFishSpecies();
  const sp = FISH[species];
  const size = _animalSize(opts);
  const m = buildFish(species);
  m.root.scale.setScalar(sp.len * size);
  m.root.position.set(x, y, z);
  scene.add(m.root);
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
    hp: opts.hp != null ? opts.hp : sp.hp, onGround: false,
    state: 'wander', wanderT: 0, walk: Math.random() * 6, hurtT: 0,
    fleeT: 0, jumpCd: 0, kx: 0, kz: 0, hazCd: 0, airT: ENT_AIR_MAX,
    escapeT: 0, turnCd: 0, flailT: 0,
    species, size, swimVy: 0, dryT: 0,
    hx: opts.hx != null ? opts.hx : x,
    hz: opts.hz != null ? opts.hz : z,
    inventory: [],
    kind: 'fish',
    name: sp.name,
    level: _rollLevel(opts.level),                      // a level, but no gender
  };
  ENTITIES.push(ent);
  return ent;
}
function _rollFishSpecies(bottom = true) {
  let tot = 0;
  for (const s of FISH_SPECIES) if (bottom || !FISH[s].bottom) tot += FISH[s].weight;
  let r = Math.random() * tot;
  for (const s of FISH_SPECIES) {
    if (!bottom && FISH[s].bottom) continue;
    if ((r -= FISH[s].weight) < 0) return s;
  }
  return 'cod';
}

/* ================================ third-person view ================================ */
// 0 = first person, 1 = over the shoulder, 2 = looking back at the face
var camView = 0;
var _selfModel = buildHumanoid();
_selfModel.root.visible = false;
scene.add(_selfModel.root);
var _selfPhase = 0, _selfPrevX = 0, _selfPrevZ = 0;
var _selfCrouch = 0;                 // 0..1 eased sneak amount, drives the torso lean
var _selfLie = 0;                    // 0..1 eased "in bed" amount, tips the model onto its back

/* Held item in the third-person right hand. Reuses the drop geometry (same meshes the
   first-person hand uses) parented to the arm pivot so it swings with the walk cycle. */
/* Held blocks use the world voxel shader, which reads the live day/night uniforms — in a hand
   that made the item almost black at night. These clones freeze their own uniform set at
   full-bright with shadows and fog off, so a carried block stays readable like the
   first-person one does. Cloned lazily so the atlas texture is already assigned. */
const _brightMats = [];
function _brightMat(p) {
  if (_brightMats[p]) return _brightMats[p];
  const m = MATERIALS[p].clone();                 // ShaderMaterial.clone deep-copies uniforms
  m.uniforms.uAmbient.value = 1.0;
  m.uniforms.uDirect.value = 0.0;
  m.uniforms.uShadowOn.value = 0.0;
  m.uniforms.uLightColor.value.set(1, 1, 1);
  if (m.uniforms.fogNear) m.uniforms.fogNear.value = 1e6;
  if (m.uniforms.fogFar) m.uniforms.fogFar.value = 1e7;
  _brightMats[p] = m;
  return m;
}

var _selfHeld = new THREE.Group();
_selfModel.armR.add(_selfHeld);
var _selfHeldId = undefined;
function _syncSelfHeld() {
  const id = slotId(HOTBAR[hotbarSel]);
  if (id === _selfHeldId) return;
  _selfHeldId = id;
  setHeldOnArm(_selfHeld, id);   // the shared humanoid pose — mobs use the very same one
}

function cycleCameraView() {
  camView = (camView + 1) % 3;
  toast(camView === 0 ? 'First person' : camView === 1 ? 'Third person' : 'Third person (front)');
}

// March out from the eye until a solid block is hit, so the camera never ends up inside terrain.
function _camPullback(ox, oy, oz, dx, dy, dz, want) {
  for (let t = 0.25; t <= want; t += 0.15) {
    if (isSolid(Math.floor(ox + dx * t), Math.floor(oy + dy * t), Math.floor(oz + dz * t)))
      return Math.max(0, t - 0.3);
  }
  return want;
}

/* Called from the frame loop right after the first-person camera transform is set.

   The body is now POSED UNCONDITIONALLY (0.72), not only in third person. In split screen every
   other player has to see this one walking around, and that means the model must be animated and
   lit whether or not its owner is looking at it. Who actually sees it is decided per render pass:
   36-splitscreen.js hides a player's own body in their own viewport when they are in first
   person, and shows it in everyone else's. */
/* How far through an arm swing this player is, as the `atk` value animateHumanoid wants: 1 at the
   start of the stroke, falling to 0 as it lands.

   This reads the SAME state the first-person hand does (24-hands.js) rather than tracking its own,
   so the body and the arm you are holding always agree. `_swingT` is set to 0 by every action that
   should look like a swing — breaking, a landed placement, a bush pickup — and mining drives a
   continuous chop off the accumulated dig time instead. Both are per-player swapped globals, so
   each seat animates from its own actions. One frame behind the hand, which nobody can see. */
function selfSwingPhase() {
  if (!playing || menuScene) return 0;
  const HAND_SWING_PERIOD = 0.32;                       // must match updateHands
  if (!player.canFly && mining.active)
    return 1 - (mining.elapsed % HAND_SWING_PERIOD) / HAND_SWING_PERIOD;
  return _swingT >= 0 ? 1 - _swingT : 0;
}

function applyCameraView(dt) {
  const alive = !menuScene && player.spawned;
  _selfModel.root.visible = alive;
  player._bodyVisibleToSelf = alive && camView !== 0;
  if (alive) {
    const dx = player.pos.x - _selfPrevX, dz = player.pos.z - _selfPrevZ;
    const spd = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    _selfPhase += Math.min(spd, 9) * dt * 2.2;
    const swing = Math.min(spd / 5.5, 1) * 0.72;
    /* Sneaking: ease the lean in and out rather than snapping, and drop the whole body with it —
       the first-person eye already dips from 1.62 to 1.42, so the model has to follow or the two
       views disagree about how tall this player currently is. */
    _selfCrouch += ((player.sneaking ? 1 : 0) - _selfCrouch) * Math.min(1, dt * 12);
    /* Lying in a bed (0.7294): the whole model is tipped onto its back and dropped to mattress
       height, so from another player's viewport you can see who is actually asleep. Eased, so
       climbing in and getting up read as movements rather than a snap. */
    _selfLie += ((player.sleepingAt ? 1 : 0) - _selfLie) * Math.min(1, dt * 9);
    const lie = _selfLie;
    _selfModel.root.position.set(player.pos.x,
      player.pos.y - 0.14 * _selfCrouch * (1 - lie) - 0.72 * lie, player.pos.z);
    _selfModel.root.rotation.y = player.yaw + Math.PI;   // model faces +Z, yaw 0 looks -Z
    _selfModel.root.rotation.x = -Math.PI / 2 * lie;     // onto its back, feet toward the foot end
    _syncSelfHeld();
    animateHumanoid(_selfModel, _selfPhase, swing * (1 - lie), -player.pitch * 0.6 * (1 - lie),
                    selfSwingPhase() * (1 - lie), {
      lean: 0.5 * _selfCrouch * (1 - lie),
      eat: player._eatProg || 0,
      hold: _selfHeldId != null,
      // an offhand torch is carried out in front on the left, as the right arm carries its item (0.7531)
      holdL: typeof offhandItemId === 'function' && offhandItemId() != null && !isShieldId(offhandItemId()),
      // everyone else sees this player draw, and how far back the string is (38-ranged.js)
      draw: (player._drawProg || 0) * (1 - lie),
      // a raised shield, in whichever hand holds it (40-shield.js)
      block:  (player._shieldHand === 'off'  ? (player._shieldUp || 0) : 0) * (1 - lie),
      blockR: (player._shieldHand === 'main' ? (player._shieldUp || 0) : 0) * (1 - lie),
    });
    // the arrow on this player's string, shown to everyone else at the same draw as their own view
    poseModelNock(_selfModel, typeof rangedNocked === 'function' ? rangedNocked() : null,
                  (player._drawProg || 0) * (1 - lie));
    // whatever the offhand holds on the left arm, and a main-hand shield's raise, seen by everyone
    if (typeof poseBodyOffhand === 'function') {
      poseBodyOffhand(_selfModel, offhandItemId(),
                      (player._shieldHand === 'off' ? (player._shieldUp || 0) : 0) * (1 - lie));
      poseMainShield(_selfHeld, _selfHeldId,
                     (player._shieldHand === 'main' ? (player._shieldUp || 0) : 0) * (1 - lie));
    }
    // a worn backpack, riding on the torso so it leans with a sneak (41-backpack.js)
    if (typeof poseBodyBack === 'function') poseBodyBack(_selfModel, backpackItemId());
    // arms tucked in at the sides while asleep, rather than hanging as if standing
    if (lie > 0.01) {
      _selfModel.armR.rotation.x *= (1 - lie); _selfModel.armL.rotation.x *= (1 - lie);
      _selfModel.armR.rotation.z = 0.12 * lie;  _selfModel.armL.rotation.z = -0.12 * lie;
      _selfModel.legR.rotation.x *= (1 - lie);  _selfModel.legL.rotation.x *= (1 - lie);
    }
    shadeHumanoid(_selfModel, player.pos.x, player.pos.y, player.pos.z, false);
    /* Name tag: normally drawn through the world so you can find each other, but crouching hides
       it behind blocks AND dims it — sneaking is how you stop advertising your position. The
       depth test is a hard switch on the input; the dimming follows the eased crouch so it fades
       with the pose rather than snapping. */
    const tag = _selfModel.nameTag;
    if (tag) {
      tag.material.depthTest = !!player.sneaking;
      tag.material.color.setScalar(1 - 0.5 * _selfCrouch);   // darker, not more transparent
    }
  }
  _selfPrevX = player.pos.x; _selfPrevZ = player.pos.z;
  if (camView === 0) return;

  const eye = camera.position;
  // camera-space backward vector, then pulled to whichever side this view wants
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  const sign = camView === 1 ? 1 : -1;
  const d = _camPullback(eye.x, eye.y, eye.z, back.x * sign, back.y * sign, back.z * sign, 3.6);
  eye.set(eye.x + back.x * sign * d, eye.y + back.y * sign * d, eye.z + back.z * sign * d);
  if (camView === 2) camera.rotation.set(-player.pitch, player.yaw + Math.PI, 0);
}

/* ================================ NPC entities ================================ */
const ENTITIES = [];
// no population cap since 0.71 — density comes from the per-chunk spawn roll instead
const ENT_R = 0.3, ENT_H = 1.8;
const ENT_HP = 20;
const ENT_SPEED = 2.2, ENT_CHASE_SPEED = 4.0;
const ENT_GRAVITY = 26, ENT_JUMP = 7.6;
const ENT_ATTACK_DMG = 3, ENT_ATTACK_CD = 1.0, ENT_ATTACK_RANGE = 2.2;
/* Melee reach (0.756), measured the way the PLAYER's is: edge to edge, not centre to centre. A player hits
   an entity up to 4 blocks out (pickEntity), so an NPC, being a player-shaped fighter, gets almost that,
   and a monster half of it. The old flat 2.2 centre-to-centre gave a zombie about 1.6 blocks of real
   reach, and an NPC no more than a zombie. */
const PLAYER_MELEE_REACH = 4.0;
const NPC_MELEE_REACH = PLAYER_MELEE_REACH * 0.9, MONSTER_MELEE_REACH = PLAYER_MELEE_REACH * 0.5;
const entAttackRange = (e, tp) =>
  (e.kind === 'npc' ? NPC_MELEE_REACH : MONSTER_MELEE_REACH) + entR(e) + ((tp && tp.R) || 0.3);
const ENT_AGGRO_TIME = 12, ENT_AGGRO_RANGE = 18;
// nothing despawns for distance any more — far mobs freeze instead (see updateEntities)
/* NPC NAMES (0.756, split by gender in 0.757). NPCs are the player-shaped bots, and each one takes a
   random name from the list matching the gender it rolled. Add as many as you like, one per line.
   Animals show their species ("Cow", "Horse") and monsters their kind ("Zombie"); neither uses these. */
const ENT_NAMES_M = [
  'Alden', 'Bram', 'Elric', 'Garrick', 'Ivo',
  'Lorn', 'Odo', 'Tobin', 'Wendel', 'Corvin',
];
const ENT_NAMES_F = [
  'Cora', 'Dagny', 'Fenna', 'Hilde', 'Juna',
  'Maren', 'Rhosyn', 'Sela', 'Tamsin', 'Wren',
];
const ENT_NAMES = [...ENT_NAMES_M, ...ENT_NAMES_F];
const _npcName = (g) => { const l = g === 'F' ? ENT_NAMES_F : ENT_NAMES_M; return l[Math.floor(Math.random() * l.length)]; };
/* Every entity rolls a LEVEL at spawn, 1 to 50 like a horse, and every one but a monster a GENDER. Both
   show on its hover label and are saved with it (0.756). The level is a label for now: no stat reads it. */
const ENT_LEVEL_MIN = 1, ENT_LEVEL_MAX = 50;
const _rollLevel = (v) => (v >= ENT_LEVEL_MIN && v <= ENT_LEVEL_MAX ? v | 0 : _ri(ENT_LEVEL_MIN, ENT_LEVEL_MAX));
const _rollGender = (v) => (v === 'F' || v === 'M' ? v : (Math.random() < 0.5 ? 'F' : 'M'));
const ENT_THINK_TIME = 0.3;              // beat between being provoked and starting to fight back
const ENT_KNOCK = 0.5, ENT_KNOCK_HOP = 6.2;
const ENT_KNOCK_DECAY = 7.0;             // how fast the knockback velocity bleeds off
const ENT_ATK_ANIM = 0.35;               // arm-swing window when a mob lands a hit
const ENT_FLAIL_TIME = 0.6;              // arms/legs thrash for this long after taking damage
const ENT_PUSH = 3.2;                    // separation force between overlapping bodies
const PLY_KNOCK = 6.5, PLY_KNOCK_HOP = 4.2, PLY_KNOCK_DECAY = 6.0;
const ENT_HAZARD_CD = 0.5;               // seconds between lava / cactus ticks
const ENT_LAVA_DMG = 4, ENT_CACTUS_DMG = 1, ENT_DROWN_DMG = 2;
const ENT_AIR_MAX = 12;                  // seconds underwater before drowning starts
const ENT_HOME_RANGE = 200;              // never wanders further than this from its spawn point
const ENT_STUCK_TIME = 12;               // seconds of "walking" without moving before a mob is written off
// Only these biomes support a spawn; the leash keeps them roughly in that region afterwards.
const ENT_BIOMES = new Set(['Plains', 'Forest', 'Birch Forest']);

// Guaranteed loot — every NPC always leaves this behind, independent of its inventory.
const ENT_LOOT = [{ id: () => ITEM.FEATHER, min: 1, max: 3 },{ id: () => ITEM.BREAD, min: 1, max: 3 }];
// Pool the random carried inventory is rolled from: only things obtainable in survival.
const ENT_CARRY_POOL = [
  { id: () => B.COBBLE,           min: 2, max: 7  },
  { id: () => B.PLANKS,           min: 1, max: 5  },
  { id: () => B.DIRT,             min: 2, max: 9  },
  { id: () => B.TORCH,            min: 1, max: 4  },
  { id: () => B.SAND,             min: 1, max: 5  },
  { id: () => ITEM.COAL,          min: 1, max: 3  },
  { id: () => ITEM.COAL_CHUNK,    min: 1, max: 5  },
  { id: () => ITEM.IRON_INGOT,    min: 1, max: 2  },
  { id: () => ITEM.APPLE,         min: 1, max: 2  },
  { id: () => ITEM.GLOW_DUST,     min: 1, max: 2  },
  { id: () => ITEM.STICK,         min: 1, max: 4  },
  // no tools or weapons (0.7443): every one of those is earned at a bench, never looted off a body
];
const _ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ---- sheep: passive grazers. They never attack; being hit makes them bolt. ---- */
const SHEEP_HP = 8;
const SHEEP_SPEED = 2.0, SHEEP_FLEE_SPEED = 5.2;
const FLEE_SPEED_MUL = 1.56;             // every grazer bolts faster than its FLEE_SPEED says: +30% in 0.799, +20% again in 0.7992
const SHEEP_FLEE_TIME = 6;
const SHEEP_H = 1.3;                     // shorter than a humanoid
const SHEEP_REGROW = 10;                 // seconds for the fleece to grow back once it starts
const SHEEP_GRAZE_CD = 5;                // how often a shorn sheep looks for grass to eat
const SHEEP_GRAZE_CHANCE = 0.25;
const SHEEP_BIOMES = new Set(['Plains', 'Forest', 'Birch Forest']);

/* ---- cows (0.73): the other passive grazer ----
   Same behaviour as a sheep minus the fleece — they wander, and bolt when hit. Tougher and a bit
   slower, and they carry the only source of leather in the game. */
const COW_HP = 12;
const COW_SPEED = 1.7, COW_FLEE_SPEED = 4.4;
const COW_FLEE_TIME = 6;
const COW_BIOMES = new Set(['Plains', 'Forest', 'Birch Forest']);
/* ---- pigs (0.789): the third passive grazer ----
   Smaller and softer than a cow, quicker to panic, and the only source of fat. They favour the
   wetter, wooded biomes rather than the open plains the cattle hold. */
const PIG_HP = 9;
const PIG_SPEED = 1.9, PIG_FLEE_SPEED = 5.0;
const PIG_FLEE_TIME = 7;
const PIG_BIOMES = new Set(['Plains', 'Forest', 'Birch Forest', 'Swamp']);
/* ---- horses (0.74) ----
   The first entity with STATS: health, speed and jump strength are rolled per horse at spawn and
   carried for its whole life, so two horses in the same herd are genuinely different animals and
   finding a good one is worth doing. They are also the first TAMEABLE entity — the taming ride,
   the progress bar, the naming and the saddle all live in 39-taming.js, which is written to take
   any future tameable, not just this one.

   The hide is painted WHITE on purpose (textures/Entity/horse.png, 128x128, twice the resolution
   of the older mobs): every coat colour is that one sheet multiplied by a per-horse tint, so a
   new colour is a hex value rather than a new texture. */
const _horseTex = new THREE.TextureLoader().load('textures/Entity/horse.png');
_horseTex.colorSpace = THREE.SRGBColorSpace;
_horseTex.magFilter = THREE.NearestFilter;
_horseTex.minFilter = THREE.NearestFilter;
_horseTex.generateMipmaps = false;
function _newHorseMat() {
  return new THREE.MeshBasicMaterial({ map: _horseTex, transparent: true, alphaTest: 0.5 });
}
// coat -> tint multiplied into the white hide. Ordinary colours are common, the striking ones rare.
const HORSE_COATS = {
  chestnut: 0xa9663a, bay: 0x7d4a26, dun: 0xc4a274, grey: 0xa9a49b,
  black: 0x3d3733, white: 0xf3f0ea, palomino: 0xdcb267,
};
const HORSE_COAT_POOL = ['chestnut', 'chestnut', 'bay', 'bay', 'dun', 'grey', 'grey',
                         'black', 'white', 'palomino'];
const HORSE_HP_MIN = 15, HORSE_HP_MAX = 30;
const HORSE_SPEED_MIN = 0.80, HORSE_SPEED_MAX = 1.30;   // multipliers on the two speeds below
const HORSE_JUMP_MIN = 0.75, HORSE_JUMP_MAX = 1.35;
// ~1.9x the 0.74 values (0.7441): a horse is the fastest thing in the world, not a brisk cow
const HORSE_WALK_SPEED = 4.6;            // grazing around a field
const HORSE_FLEE_SPEED = 11.4;
const HORSE_BOLT_SPEED = 12.5;           // what an untamed one does with you on its back
const HORSE_RIDE_SPEED = 14.0;           // driven, at speed stat 1.0
const HORSE_RIDE_JUMP = 9.6;             // driven jump impulse, at jump stat 1.0
const HORSE_FLEE_TIME = 7;
const HORSE_SEAT_Y = 1.61;               // where the rider sits above the feet (0.7442: bigger horse)
// open country: this world has no savanna, and horses have no business in snow or desert
const HORSE_BIOMES = new Set(['Plains', 'Forest', 'Birch Forest']);
/* 0.0001% per chunk (0.7441) — one herd in a MILLION chunk rolls, so in practice a wild horse
   is something you may never come across. Deliberate: the number asked for, kept in one place
   so it is one edit to change. Herds are small too. */
const HORSE_CHUNK_CHANCE = 0.000001;
const HORSE_HERD_MIN = 1, HORSE_HERD_MAX = 2;
const HORSE_SCALE = 1.5;                 // a horse is bigger than the box units it is built from (1.25 until 0.7442)
const HORSE_STEP_UP = 1.05;              // tallest ledge it walks up without jumping (one block)
/* ---- hunger (0.742) ----
   EVERY entity carries a hunger meter and it drains for all of them — slowly, and only while
   the entity is simulating (a frozen mob out past sim range is not burning anything). Only the
   horse reacts to it so far: it grazes to refill it, heals while it is well fed, tires under a
   rider, and runs and jumps worse when it is running on empty. Everyone else just has the number
   ticking down, so the next animal to care about food only has to read it. */
const ENT_HUNGER_MAX = 20;
const ENT_HUNGER_DECAY = 1 / 90;         // points per second: full to empty in about half an hour
/* Health regen for every entity (0.757): after ENT_REGEN_DELAY seconds without taking damage, and only while
   it has some hunger left, an entity heals 1 point every ENT_REGEN_EVERY seconds, spending a little hunger
   on each. The horse keeps its own slower fed-above-half rule, now behind the same no-damage delay. */
const ENT_REGEN_DELAY = 5, ENT_REGEN_EVERY = 2, ENT_REGEN_COST = 0.25;
function entMaxHp(e) {
  switch (e.kind) {
    case 'horse':    return (e.stats && e.stats.maxHp) || HORSE_HP_MAX;
    case 'sheep':    return SHEEP_HP;
    case 'cow':      return COW_HP;
    case 'pig':      return PIG_HP;
    case 'zombie':   return ZOMBIE_HP;
    case 'skeleton': return SKEL_HP;
    case 'fish':     return (FISH[e.species] || FISH.cod).hp;   // 0.805
    default:         return ENT_HP;
  }
}
const HORSE_RIDE_HUNGER = 3;             // carrying a rider at speed burns this many times faster
const HORSE_GRAZE_RATE = 0.6;            // points per second while cropping grass
const HORSE_REGEN_EVERY = 4;             // seconds per point of health while well fed...
const HORSE_REGEN_ABOVE = 0.5;           // ...which means above half full
const HORSE_REGEN_COST = 0.5;            // hunger spent on each point healed
const HORSE_HUNGRY_BELOW = 0.25;         // under a quarter, it is running on empty:
const HORSE_HUNGRY_MUL = 0.75;           // ridden speed and jump both drop to three quarters
const entHunger = (e) => (e.hunger != null ? e.hunger : ENT_HUNGER_MAX);
const horseFedMul = (e) => entHunger(e) < ENT_HUNGER_MAX * HORSE_HUNGRY_BELOW ? HORSE_HUNGRY_MUL : 1;
/* Identity shown on hover (0.741): a sex and a level, rolled at spawn and persisted like the
   stats. The level is a label for now — it does not feed the stats. */
const TAME_LEVEL_MIN = 1, TAME_LEVEL_MAX = 50;
const horseSpeedStat = (e) => (e.stats && e.stats.speed) || 1;
const horseJumpStat  = (e) => (e.stats && e.stats.jump) || 1;
/* Anything a player has fed, ridden, part-tamed or tamed is CLAIMED, and a claimed animal is
   never quietly removed — not by the stuck watchdog, not by the wake-up audit. Losing a horse you
   spent golden apples on because it wedged itself in a fence is not an acceptable outcome. */
const isClaimed = (e) => !!(e.tame || e.loved || (e.tameProg || 0) > 0 || e.rider);

function _horseLeg(mat) {
  const g = new THREE.Group();
  const m = _part(mat, 3, 12, 3, 0, 41);
  m.position.y = -6 * PX;                        // pivots at the shoulder/hip
  g.add(m);
  return g;
}
/* Saddle: a box strapped over the barrel, textured from the saddle ITEM art that already ships
   with the game (textures/Items/Useables/saddle.png) rather than from the horse sheet — so the
   saddle you crafted and the saddle on the horse are literally the same picture. Built lazily,
   because IMAGES is only populated once the deferred game art has landed. */
let _saddleTex = null;
function _newSaddleMat() {
  if (!_saddleTex && typeof IMAGES !== 'undefined' && IMAGES.saddle) {
    _saddleTex = new THREE.Texture(IMAGES.saddle);
    _saddleTex.colorSpace = THREE.SRGBColorSpace;
    _saddleTex.magFilter = THREE.NearestFilter;
    _saddleTex.minFilter = THREE.NearestFilter;
    _saddleTex.generateMipmaps = false;
    _saddleTex.needsUpdate = true;
  }
  return new THREE.MeshBasicMaterial({ map: _saddleTex || null,
                                       color: _saddleTex ? 0xffffff : 0x6b4526,
                                       transparent: true, alphaTest: 0.4 });
}
function buildHorse(coat = 'chestnut') {
  const root = new THREE.Group();
  root.scale.setScalar(HORSE_SCALE);
  const mat = _newHorseMat();
  /* 0.7441: the barrel is 1.5x longer (21 deep, was 14) — it read as a pony. The sheet was
     re-laid out to fit it; regions (64-space units):
       body 8x8x21 (0,0)   head 4x4x6 (0,29)   muzzle 3x3x3 (20,29)   ear 1x2x1 (32,29)
       neck 4x8x4 (36,29)  tail 2x9x2 (52,29)  leg 3x12x3 (0,41)      mane 1x6x10 (12,41) */
  const body = _part(mat, 8, 8, 21, 0, 0);
  body.position.set(0, 16 * PX, 0);
  // NECK: the pivot the whole head assembly hangs off, so lowering it to graze swings head,
  // muzzle, ears and mane together the way a real neck does.
  const neck = new THREE.Group();
  neck.position.set(0, 19 * PX, 9 * PX);           // at the front of the longer barrel
  const neckMesh = _part(mat, 4, 8, 4, 36, 29);
  neckMesh.position.y = 4 * PX;
  const head = _part(mat, 4, 4, 6, 0, 29);
  head.position.set(0, 8.5 * PX, 1.5 * PX);
  const muzzle = _part(mat, 3, 3, 3, 20, 29);
  muzzle.position.set(0, 7.4 * PX, 5.0 * PX);
  const earR = _part(mat, 1, 2, 1, 32, 29); earR.position.set(-1.4 * PX, 11.0 * PX, 0.4 * PX);
  const earL = _part(mat, 1, 2, 1, 32, 29); earL.position.set( 1.4 * PX, 11.0 * PX, 0.4 * PX);
  const mane = _part(mat, 1, 6, 10, 12, 41);
  mane.rotation.x = Math.PI / 2;                 // the long axis runs UP the neck, not across it
  mane.position.set(0, 5.5 * PX, -2.2 * PX);
  neck.add(neckMesh, head, muzzle, earR, earL, mane);
  neck.rotation.x = HORSE_NECK_REST;
  const tail = new THREE.Group();
  tail.position.set(0, 20 * PX, -10.5 * PX);       // the back of the longer barrel
  const tailMesh = _part(mat, 2, 9, 2, 52, 29);
  tailMesh.position.y = -4.5 * PX;
  tail.add(tailMesh);
  // the mesh hangs BELOW its pivot, so positive tips the end backward; -0.35 tucked it under the belly
  tail.rotation.x = 0.35;
  // legs spread to the ends of the longer barrel: shoulders and hips, not the middle
  const legFL = _horseLeg(mat); legFL.position.set(-3.2 * PX, 12 * PX,  8 * PX);
  const legFR = _horseLeg(mat); legFR.position.set( 3.2 * PX, 12 * PX,  8 * PX);
  const legBL = _horseLeg(mat); legBL.position.set(-3.2 * PX, 12 * PX, -8 * PX);
  const legBR = _horseLeg(mat); legBR.position.set( 3.2 * PX, 12 * PX, -8 * PX);
  // saddle, hidden until one is fitted
  const satMat = _newSaddleMat();
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(9 * PX, 3 * PX, 9 * PX), satMat);
  saddle.position.set(0, 20.6 * PX, 1.5 * PX);
  saddle.visible = false;
  root.add(body, neck, tail, legFL, legFR, legBL, legBR, saddle);
  return { root, head: neck, body, tail, saddle, satMat,
           legs: [legFL, legFR, legBL, legBR],
           mat, mats: [mat],
           // linearised: with ColorManagement off, a raw hex renders ~50% too bright
           tint: new THREE.Color(HORSE_COATS[coat] || HORSE_COATS.chestnut).convertSRGBToLinear() };
}
/* SIGN MATTERS (fixed 0.7441). The neck mesh sits ABOVE its pivot and the model faces +Z, so a
   POSITIVE rotation.x tips the top of the neck forward; the old -0.62 leaned it back, which is
   why every walking or running horse stared at the sky. */
const HORSE_NECK_REST = 0.45;            // carried forward, muzzle a little below level
const HORSE_NECK_GRAZE = 1.85;           // ...and swung right down to the grass
/* A tinted animal cannot use shadeHumanoid: that bakes plain brightness into the material, which
   would wash every coat back to white. Same lighting, multiplied by the coat instead. */
function shadeTinted(m, x, y, z, hurt) {
  const b = _lightAt(x, y + 0.8, z);
  for (const mat of (m.mats || [m.mat])) {
    if (!mat) continue;
    if (hurt) mat.color.setRGB(_HURT_COL.r * b, _HURT_COL.g * b, _HURT_COL.b * b);
    else mat.color.setRGB(m.tint.r * b, m.tint.g * b, m.tint.b * b);
  }
  if (m.satMat) m.satMat.color.setScalar(hurt ? 1 : b);     // tack is not part of the coat
}

function spawnHorse(x, y, z, opts = {}) {
  const coat = HORSE_COATS[opts.coat] ? opts.coat
             : HORSE_COAT_POOL[Math.floor(Math.random() * HORSE_COAT_POOL.length)];
  const m = buildHorse(coat);
  const size = _animalSize(opts);
  m.root.scale.setScalar(HORSE_SCALE * size);       // size multiplies the horse's own scale-up
  if (opts.tint != null) m.tint.set(opts.tint).convertSRGBToLinear();   // any hex over the coat
  m.root.position.set(x, y, z);
  scene.add(m.root);
  /* Stats are rolled ONCE and then persisted. maxHp is kept alongside hp because taming grants a
     permanent boost and the bar has to know what full looks like afterwards. */
  const stats = opts.stats || {
    maxHp: _ri(HORSE_HP_MIN, HORSE_HP_MAX),
    speed: +(HORSE_SPEED_MIN + Math.random() * (HORSE_SPEED_MAX - HORSE_SPEED_MIN)).toFixed(3),
    jump:  +(HORSE_JUMP_MIN + Math.random() * (HORSE_JUMP_MAX - HORSE_JUMP_MIN)).toFixed(3),
  };
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
    hp: opts.hp != null ? opts.hp : stats.maxHp, onGround: false,
    state: 'wander', wanderT: 0, walk: 0, hurtT: 0,
    fleeT: 0, jumpCd: 0, kx: 0, kz: 0, hazCd: 0, airT: ENT_AIR_MAX,
    escapeT: 0, turnCd: 0, flailT: 0,
    hx: opts.hx != null ? opts.hx : x,
    hz: opts.hz != null ? opts.hz : z,
    inventory: [],
    kind: 'horse',
    coat, stats, size,
    tintHex: opts.tint != null ? opts.tint : null,   // custom coat colour, when one was given
    name: opts.name || 'Horse',
    gender: opts.gender === 'F' || opts.gender === 'M' ? opts.gender : (Math.random() < 0.5 ? 'F' : 'M'),
    level: opts.level >= TAME_LEVEL_MIN && opts.level <= TAME_LEVEL_MAX
         ? opts.level | 0 : _ri(TAME_LEVEL_MIN, TAME_LEVEL_MAX),
    stepOff: 0,                              // visual lag after a step-assist climb, eased to 0
    hunger: opts.hunger >= 0 && opts.hunger <= ENT_HUNGER_MAX ? +opts.hunger : ENT_HUNGER_MAX,
    regenT: 0,
    tame: !!opts.tame,                       // fully tamed
    loved: !!opts.loved,                     // fed a golden apple: will let you climb on
    tameProg: opts.tameProg || 0,            // 0..1, filled by riding it
    bucked: opts.bucked || 0,                // early dismounts, each one costs some of the boost
    saddled: !!opts.saddled,
    boosted: !!opts.boosted,                 // stats already had the taming bonus applied
    rider: null, bolt: 0,
  };
  m.saddle.visible = ent.saddled;
  ENTITIES.push(ent);
  return ent;
}

// one grazer is a sheep, a cow or a horse: they all run through _updateGrazer, and all bolt when hit
const isGrazer = (e) => e.kind === 'sheep' || e.kind === 'cow' || e.kind === 'pig' || e.kind === 'horse';

/* ---- zombies (0.715): the first genuinely HOSTILE mob ----
   They are not part of the permanent per-chunk population. A chunk rolls for zombies every time
   it finishes generating — a brand new chunk or an old one being loaded back in — but only while
   it is night, so they accumulate after dusk and are gone by mid-morning. Each one claws its way
   up out of the ground on arrival, hunts anything within four chunks, and catches fire the moment
   real daylight reaches it. Nothing about them is saved: dawn is the despawn. */
const ZOMBIE_HP = 18;
const ZOMBIE_SPEED = 1.5, ZOMBIE_CHASE_SPEED = 3.1;
const ZOMBIE_DMG = 4;
/* A rare nugget (0.7444): a buckle or a button off a dead traveller. One nugget, 6% of kills,
   weighted so the common metals are common and gold is the prize — a trickle of metal before you
   have mined any, never a substitute for ore. */
const ZOMBIE_NUGGET_CHANCE = 0.06;
const ZOMBIE_NUGGETS = [ITEM.COPPER_NUGGET, ITEM.COPPER_NUGGET, ITEM.COPPER_NUGGET,
                        ITEM.TIN_NUGGET, ITEM.TIN_NUGGET, ITEM.TIN_NUGGET,
                        ITEM.IRON_NUGGET, ITEM.IRON_NUGGET, ITEM.GOLD_NUGGET];
// 4 chunks. That is the lowest render distance anyone plays at, so a zombie can never notice the
// player from inside terrain the player cannot see.
const ZOMBIE_CHASE_RANGE = 64;
const ZOMBIE_RISE_TIME = 1.2;            // seconds spent climbing out of the ground
/* Spawn rate (retuned 0.7295 — the old numbers built 10-strong hordes). Three separate limits,
   because one alone was not enough: walking into fresh terrain streams in dozens of chunks in a
   couple of seconds, and every one of them used to roll independently.
     CHANCE  how often a chunk load even considers a zombie
     PACK    how many come up at that one spot (a pack of 1 now — no clusters)
     GAP     seconds between any two spawns WORLD-WIDE, which is what actually stops a wave:
             a burst of chunk loads can now only produce one zombie
     CAP     the ceiling on how many can be alive at once */
const ZOMBIE_CHUNK_CHANCE = 0.05;        // per chunk load, at night
const ZOMBIE_PACK_MIN = 1, ZOMBIE_PACK_MAX = 1;
const ZOMBIE_SPAWN_GAP = 6;              // seconds between spawns, across the whole world
const ZOMBIE_CAP = 10;                   // hard ceiling — chunk reloads must not stack up forever
// World-global, NOT per player: this throttles the world's spawner, which runs once per chunk
// load rather than once per player per frame, so it must not live in a per-seat slot.
var _zombieSpawnT = -1e9;
const ZOMBIE_BURN_GRACE = 0.7;           // seconds in the open before it catches
const ZOMBIE_BURN_DPS = 1.8;
const ZOMBIE_SPAWN_MIN_DIST = 14;        // never sprouts in the player's face
const ZOMBIE_NIGHT_FROM = 0.47;          // worldTime: 0 sunrise, .5 sunset, .75 midnight
const ZOMBIE_DAY_UNTIL = 0.45;           // ...and this is when the sun is high enough to burn
const isNightForMobs = () => worldTime >= ZOMBIE_NIGHT_FROM;
const isBurningDaylight = () => worldTime < ZOMBIE_DAY_UNTIL;

/* ---- skeletons (0.735): the ranged night mob ----
   Everything a zombie is — spawned by the night, clawed up out of the ground, burnt by the
   morning, never saved — except it fights at a distance. Each one is armed ONCE at spawn and
   keeps that loadout for its whole short life:
     50%  a bow and a handful of arrows: it backs off to its shooting range and looses at you
     30%  a flint sword (this game's wooden tier): a plain, slightly quicker zombie
     20%  nothing at all: bare bones, weakest of the three
   The arm roll is what makes a night interesting — you can hear one is a shooter before you
   see it, because the ones that close on you are the ones that cannot shoot. */
const SKEL_HP = 14;
const SKEL_SPEED = 1.7, SKEL_CHASE_SPEED = 3.3;
const SKEL_CHASE_RANGE = 64;             // same hunting radius as a zombie
const SKEL_ARM_BOW = 0.50, SKEL_ARM_SWORD = 0.30;   // the remaining 0.20 is bare-handed
const SKEL_ARROWS_MIN = 2, SKEL_ARROWS_MAX = 7;     // a bow skeleton's quiver
const SKEL_DMG_SWORD = 4, SKEL_DMG_HANDS = 2;
const SKEL_ARROW_DMG = 4;
const SKEL_SHOOT_RANGE = 22;             // starts shooting inside this
const SKEL_KEEP_DIST = 5;                // ...and backs away if you get closer than this
const SKEL_DRAW_TIME = 1.1;              // seconds at full draw before it looses
const SKEL_SHOOT_CD = 1.4;               // recovery between shots
const SKEL_ARROW_SPEED = 30;
// Loot. The bow drop is deliberately a lottery ticket — 0.001%, i.e. one skeleton in a hundred
// thousand — and what falls is a nearly-spent bow, not a fresh one.
const SKEL_BONE_MIN = 1, SKEL_BONE_MAX = 3;
const SKEL_ARROW_DROP_MIN = 1, SKEL_ARROW_DROP_MAX = 2;
const SKEL_BOW_DROP_CHANCE = 0.00001;    // 0.001%
const SKEL_BOW_DROP_DUR_MIN = 10, SKEL_BOW_DROP_DUR_MAX = 30;
// share of night spawns that come up as skeletons rather than zombies
const SKEL_SPAWN_SHARE = 0.45;
const isNightMob = (e) => e.kind === 'zombie' || e.kind === 'skeleton';

function _rollInventory() {
  const inv = [];
  const n = _ri(1, 4);
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const e = ENT_CARRY_POOL[Math.floor(Math.random() * ENT_CARRY_POOL.length)];
    const id = e.id();
    if (id == null || used.has(id)) continue;      // no duplicate stacks in one pack
    used.add(id);
    inv.push({ id, count: _ri(e.min, e.max) });
  }
  return inv;
}

function spawnEntity(x, y, z, opts = {}) {
  const gender = _rollGender(opts.gender);            // rolled first: the name depends on it (0.757)
  const m = buildHumanoid();
  m.root.position.set(x, y, z);
  scene.add(m.root);
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
    hp: opts.hp != null ? opts.hp : ENT_HP, onGround: false,
    state: 'wander', wanderT: 0, walk: 0, hurtT: 0,
    aggroT: 0, atkCd: 0, jumpCd: 0, thinkT: 0,
    kx: 0, kz: 0, hazCd: 0, airT: ENT_AIR_MAX, escapeT: 0, turnCd: 0,
    atkAnimT: 0, flailT: 0,
    hx: opts.hx != null ? opts.hx : x,        // home anchor — the leash centre, persisted
    hz: opts.hz != null ? opts.hz : z,
    name: opts.name || _npcName(gender),
    inventory: opts.inventory || _rollInventory(),
    gender, level: _rollLevel(opts.level),
    kind: 'npc',
  };
  ENTITIES.push(ent);
  return ent;
}

/* ---- size (0.744) ----
   Every farm animal is rolled a size at spawn, 0.7x to 1.3x, so a herd is a crowd of individuals
   rather than one model stamped out. `opts.size` takes any positive number — the range only
   bounds the natural roll. Since 0.7441 the HITBOX scales with it too (see ENT_BOX / entR /
   entH): a 1.3x cow is a 1.3x obstacle, and a big horse may not fit a door its foal walks through. */
const ANIMAL_SIZE_MIN = 0.7, ANIMAL_SIZE_MAX = 1.3;
/* What "normal size" (size 1.0) means per species (0.7442), applied UNDER the per-animal roll:
   the roll makes individuals, this sets the breed. A sheep is a little smaller than the box units
   it is built from, a cow a little bigger. The horse's equivalent is HORSE_SCALE. ENT_BOX's
   hitbox bases are sized to match these, so collision follows what you see. */
const SHEEP_SCALE = 0.98, COW_SCALE = 1.15, PIG_SCALE = 0.95;      // sheep 0.85 -> 0.98, 15% bigger (0.7572)
function _animalSize(opts) {
  const s = +opts.size;
  if (s > 0) return Math.min(ANIMAL_SIZE_MAX, Math.max(ANIMAL_SIZE_MIN, s));   // saved or asked-for sizes too (0.757)
  return +(ANIMAL_SIZE_MIN + Math.random() * (ANIMAL_SIZE_MAX - ANIMAL_SIZE_MIN)).toFixed(3);
}

function spawnSheep(x, y, z, opts = {}) {
  const m = buildSheep();
  const size = _animalSize(opts);
  m.root.scale.setScalar(SHEEP_SCALE * size);
  m.root.position.set(x, y, z);
  scene.add(m.root);
  const woolly = opts.woolly !== undefined ? opts.woolly : true;
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
    hp: opts.hp != null ? opts.hp : SHEEP_HP, onGround: false,
    state: 'wander', wanderT: 0, walk: 0, hurtT: 0,
    fleeT: 0, jumpCd: 0, kx: 0, kz: 0, hazCd: 0, airT: ENT_AIR_MAX,
    escapeT: 0, turnCd: 0, flailT: 0,
    woolly,                                   // fleece present -> shearable, drops wool
    woolColor: opts.woolColor != null ? opts.woolColor : 'white',   // tint on the fleece only
    size,
    woolGrow: woolly ? 1 : 0,                 // 0..1 regrow animation
    regrowing: false,
    grazeCd: SHEEP_GRAZE_CD,
    hx: opts.hx != null ? opts.hx : x,
    hz: opts.hz != null ? opts.hz : z,
    inventory: [],
    kind: 'sheep',
    name: 'Sheep',
    gender: _rollGender(opts.gender), level: _rollLevel(opts.level),
  };
  setSheepWoolColor(ent, ent.woolColor);
  ENTITIES.push(ent);
  return ent;
}

function spawnCow(x, y, z, opts = {}) {
  // coat is rolled once and persisted, so a herd stays the herd you found. A named coat supplies
  // both tints; explicit hex tints (either or both) override it — any cow is two numbers.
  const variant = COW_COATS[opts.variant] ? opts.variant
                : COW_COAT_POOL[Math.floor(Math.random() * COW_COAT_POOL.length)];
  const coat = COW_COATS[variant];
  const size = _animalSize(opts);
  const m = buildCow(opts.bodyTint != null ? opts.bodyTint : coat.body,
                     opts.spotTint != null ? opts.spotTint : coat.spot);
  m.root.scale.setScalar(COW_SCALE * size);
  m.root.position.set(x, y, z);
  scene.add(m.root);
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
    hp: opts.hp != null ? opts.hp : COW_HP, onGround: false,
    state: 'wander', wanderT: 0, walk: 0, hurtT: 0,
    fleeT: 0, jumpCd: 0, kx: 0, kz: 0, hazCd: 0, airT: ENT_AIR_MAX,
    escapeT: 0, turnCd: 0, flailT: 0,
    variant, size,
    bodyTint: opts.bodyTint != null ? opts.bodyTint : null,   // only custom overrides are kept;
    spotTint: opts.spotTint != null ? opts.spotTint : null,   // null means "whatever the coat says"
    hx: opts.hx != null ? opts.hx : x,
    hz: opts.hz != null ? opts.hz : z,
    inventory: [],
    kind: 'cow',
    name: 'Cow',
    gender: _rollGender(opts.gender), level: _rollLevel(opts.level),
  };
  ENTITIES.push(ent);
  return ent;
}

function spawnPig(x, y, z, opts = {}) {
  // as the cow: the coat is rolled once and persisted, so a sounder stays the sounder you found
  const variant = PIG_COATS[opts.variant] ? opts.variant
                : PIG_COAT_POOL[Math.floor(Math.random() * PIG_COAT_POOL.length)];
  const coat = PIG_COATS[variant];
  const size = _animalSize(opts);
  const m = buildPig(opts.bodyTint != null ? opts.bodyTint : coat.body,
                     opts.spotTint != null ? opts.spotTint : coat.spot);
  m.root.scale.setScalar(PIG_SCALE * size);
  m.root.position.set(x, y, z);
  scene.add(m.root);
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
    hp: opts.hp != null ? opts.hp : PIG_HP, onGround: false,
    state: 'wander', wanderT: 0, walk: 0, hurtT: 0,
    fleeT: 0, jumpCd: 0, kx: 0, kz: 0, hazCd: 0, airT: ENT_AIR_MAX,
    escapeT: 0, turnCd: 0, flailT: 0,
    variant, size,
    bodyTint: opts.bodyTint != null ? opts.bodyTint : null,   // only custom overrides are kept;
    spotTint: opts.spotTint != null ? opts.spotTint : null,   // null means "whatever the coat says"
    hx: opts.hx != null ? opts.hx : x,
    hz: opts.hz != null ? opts.hz : z,
    inventory: [],
    kind: 'pig',
    name: 'Pig',
    gender: _rollGender(opts.gender), level: _rollLevel(opts.level),
  };
  ENTITIES.push(ent);
  return ent;
}

/* A zombie starts fully underground and `riseT` lifts it into place — the model is offset, not
   the collision position, so it is already standing on solid ground the whole time. */
function spawnZombie(x, y, z) {
  const m = buildHumanoid(_newZombieMat());
  m.root.position.set(x, y - ENT_H, z);
  scene.add(m.root);
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
    hp: ZOMBIE_HP, onGround: false,
    state: 'wander', wanderT: 0, walk: 0, hurtT: 0,
    aggroT: 0, atkCd: 0, jumpCd: 0, thinkT: 0,
    kx: 0, kz: 0, hazCd: 0, airT: ENT_AIR_MAX, escapeT: 0, turnCd: 0,
    atkAnimT: 0, flailT: 0,
    riseT: ZOMBIE_RISE_TIME, burnT: 0, sunT: 0,
    hx: x, hz: z,
    name: 'Zombie', inventory: [], kind: 'zombie', dmg: ZOMBIE_DMG, level: _rollLevel(),
  };
  ENTITIES.push(ent);
  return ent;
}

/* ---- what a mob is carrying, in its own hand ----
   Same idea as the player's third-person _selfHeld: the item's drop sprite parented to the right
   arm so it swings with the limb. `_brightMat` keeps a held BLOCK readable at night; item sprites
   carry their own materials. A second, hidden group holds the nocked arrow, which the bow-armed
   skeleton reveals while it draws. */
/* ONE hold pose for every humanoid (0.7353). The player's own third-person hand, a zombie's fist
   and a skeleton's bow arm are the SAME rig hanging off the same armR, so an item has to sit in
   the same place, at the same size, whoever is carrying it — a zombie holding your sword must
   look exactly like you holding it. Both _syncSelfHeld and setMobHeld route through here, and
   nothing is allowed its own private numbers any more. */
function setHeldOnArm(grp, id) {
  while (grp.children.length) grp.remove(grp.children[0]);
  if (id == null) return;
  // a shield in a hand is its own model, hung off the outside of the forearm (0.7451); blocking
  // re-poses it every frame (poseMainShield in 40-shield.js)
  if (id >= 256 && ITEM_PROPS[id]?.shield && typeof buildShieldNode === 'function') {
    const n = buildShieldNode(id); n.scale.setScalar(1.24);   // doubled in 0.757
    grp.add(n);
    grp.scale.setScalar(1);
    grp.position.set(-2.3 * PX, -7 * PX, 0);
    grp.rotation.set(0, -Math.PI / 2, 0);
    return;
  }
  const isItem  = id >= 256;
  const isBow   = isItem && !!ITEM_PROPS[id]?.ranged;
  const isTool  = isItem && (!!ITEM_PROPS[id]?.tool || isBow);
  const isCross = !isItem && PROPS[id]?.model === 'cross';
  // Sit the object at the fist and tip it FORWARD (out of the chest) so the pose reads as
  // actually gripping it, rather than having it grow out of the arm.
  /* Where it sits (0.7531, 0.7532). A tool's handle corner is gripped at 1.5px and its blade runs forward
     out of the hand. Flat things (item sprites and plants) stand UP out of the fist (0.7532): they used to
     lie along the arm, which with the arm raised to hold them put them flat on top of the fist. Their lower
     part now sits in the fist and the rest rises clear of it. A block sits in front of the fist. A torch is
     held three times the size of a plant so it reads at a distance, and fattened like the first-person one. */
  const isTorch = id === B.TORCH;
  const upright = isCross || (isItem && !isTool);
  grp.position.set(0, (upright ? -10.3 : -11.5) * PX, (isTool ? 1.5 : upright ? 2.0 : 4.4) * PX);
  grp.scale.setScalar(isTool ? 0.42 : isTorch ? 0.63 : isItem ? 0.42 * 0.70 : 0.42 * 0.50);
  if (isBow) _poseHeldBow(grp);                       // a bow has its own axes — see below
  /* A tool's blade points FORWARD out of the fist (0.7531). It used to run back UP the arm (Rx -0.30,
     Ry PI), which buried most of the sprite inside the arm box: from the front, all that showed was a
     couple of dark pixels poking through the fist. Rx(1.835) swings the handle-to-tip diagonal (+Y after
     Rz) out ahead of the hand, so with the arm raised to hold it the blade points forward and up at about
     45 degrees; Ry(-PI/2) stands the sprite in a vertical plane that faces out to the side. */
  else if (isTool) grp.rotation.set(1.835, -Math.PI / 2, Math.PI / 4);
  /* Upright (0.7532): Rx(1.05) cancels the holding arm's own 1.05 lift, so the item's up is the WORLD's up;
     Ry turns a sprite edge-on to the body so its face shows from the side, as a tool's does. */
  else if (upright) grp.rotation.set(1.05, isItem ? -Math.PI / 2 : 0.4, 0);
  else grp.rotation.set(-0.35, 0.4, 0);               // a block
  let target = grp;
  if (isTool && !isBow) {
    // a tool's handle is its sprite's lower-left corner: slide that corner onto the fist
    const g = new THREE.Group();
    g.position.set(0.42, 0.42, 0);
    grp.add(g);
    target = g;
  } else if (isTorch) {
    // the lower third of the stick in the fist, flame up, thickened like the first-person torch (0.7532)
    const g = new THREE.Group();
    g.position.y = 0.32;
    g.scale.set(HELD_TORCH_THICK, 1, HELD_TORCH_THICK);
    g.rotation.y = Math.PI / 4;
    grp.add(g);
    target = g;
  } else if (isCross) {
    const g = new THREE.Group();
    g.position.y = 0.35;
    grp.add(g);
    target = g;
  }
  for (const { p, geo, mat: mo, node } of buildDropGeom(id))
    target.add(node || new THREE.Mesh(geo, mo || _brightMat(p)));
}
function setMobHeld(e, id) {
  const m = e.model;
  if (!m || m._heldId === id) return;
  m._heldId = id;
  if (!m.heldGrp) { m.heldGrp = new THREE.Group(); m.armR.add(m.heldGrp); }
  setHeldOnArm(m.heldGrp, id);
}

/* ---- mobs pick things up (0.7353) ----
   A zombie that walks over a dropped item takes it, and if that item is something you would hit
   with, it hits with it: the weapon's own damage is ADDED to the mob's bare-handed damage, so
   the sword you died holding makes the thing that killed you worse. One item only — a mob with
   full hands walks past everything — and whatever it took falls back out when it dies, so your
   gear is always recoverable rather than deleted by a passing corpse.

   Deliberately the same reach and the same pickup grace a player gets, so you cannot lose a
   stack to a mob standing where it landed before you have had a chance to grab it yourself. */
const MOB_PICKUP_R = 1.5;
const MOB_PICKUP_CD = 0.6;               // seconds between looks; this is not a vacuum
function mobPickupDamage(id) {
  return (id != null && id >= 256) ? (ITEM_PROPS[id]?.damage || 0) : 0;
}
function _mobTryPickup(e, baseDmg) {
  if (e.heldItem != null) return;                       // already carrying something
  for (let i = DROPS.length - 1; i >= 0; i--) {
    const d = DROPS[i];
    if (d.age < d.pickupDelay) continue;                // same grace a player has to respect
    const p = d.group.position;
    const dx = p.x - e.x, dy = p.y - (e.y + ENT_H * 0.5), dz = p.z - e.z;
    if (dx * dx + dy * dy + dz * dz > MOB_PICKUP_R * MOB_PICKUP_R) continue;
    e.heldItem = d.id;
    e.heldDur = d.dur != null ? d.dur : null;
    e.heldMeta = d.meta || null;             // 0.79
    const bonus = mobPickupDamage(d.id);
    if (bonus > 0) e.dmg = baseDmg + bonus;
    setMobHeld(e, d.id);
    playSound('hit', { gain: 0.3, rate: 1.6, pos: { x: e.x, y: e.y + 1, z: e.z } });
    removeDrop(i);
    return;
  }
}
// whatever a mob was carrying falls where it stood — on death, and on the dawn sweep too
function _mobDropHeld(e) {
  if (e.heldItem == null) return;
  spawnDrop(e.heldItem, Math.floor(e.x), Math.floor(e.y + 0.5), Math.floor(e.z),
    { x: (Math.random() - 0.5) * 2, y: 2.4, z: (Math.random() - 0.5) * 2 }, 0.6, e.heldDur ?? null, e.heldMeta || null);
  e.heldItem = null; e.heldDur = null; e.heldMeta = null;
}
/* A bow in a raised arm, oriented the way one is actually held (0.7353). The tool rotation lays
   an item ALONG the arm, which is right for a sword and wrong for a bow: it left the skeleton's
   bow lying flat and back-to-front.

   When an arm is raised to aim (rotation.x = -90°) its local axes read: -Y is world forward
   (down the arm, where the shot goes), +Z is world up, ±X is sideways. A bow wants its limbs
   world-VERTICAL and its arc pointing forward with the string toward the archer, so the sprite's
   axes have to land as: chord -> +Z, bulge -> -Y. Rz(45°) first puts the icon's diagonal chord on
   +Y and its bulge on +X; the basis below is the rotation that carries those onto (0,0,1) and
   (0,-1,0). Same geometry as HELD_POSE.bow in 24-hands.js, expressed in arm space. */
const _BOW_BASIS = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0),
                                new THREE.Vector3(0, 0, 1),
                                new THREE.Vector3(-1, 0, 0)));
const _BOW_ROLL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);
function _poseHeldBow(grp) {
  grp.quaternion.copy(_BOW_BASIS).multiply(_BOW_ROLL);    // roll first, then the basis
  grp.position.set(0, -12.5 * PX, 1.5 * PX);
}
/* The arrow a shooter has on the string. Parented to the BOW arm (armR, the one holding the
   weapon) and pointed down the arm, so it tracks the bow rather than the hand hauling the string. */
function setModelNock(m, id) {
  if (!m) return;
  if (!m.nockGrp) {
    m.nockGrp = new THREE.Group();
    m.nockGrp.visible = false;
    m.armR.add(m.nockGrp);
  }
  if (m._nockId !== id) {
    m._nockId = id;
    while (m.nockGrp.children.length) m.nockGrp.remove(m.nockGrp.children[0]);
    if (id != null) {
      const inner = new THREE.Group();
      inner.scale.setScalar(0.40);
      // the sprite's tip runs along its own (1,1,0) diagonal; swing that onto the arm's forward
      inner.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 0).normalize(),
                                          new THREE.Vector3(0, -1, 0));
      for (const { p, geo, mat: mo, node } of buildDropGeom(id))
        inner.add(node || new THREE.Mesh(geo, mo || _brightMat(p)));
      m.nockGrp.add(inner);
    }
  }
}
/* Show/hide the nocked round and slide it back with the draw. One call covers a mob and a
   player body alike — same rig, same arm, same motion. */
function poseModelNock(m, id, drawP) {
  if (!m) return;
  if (drawP <= 0 && !m.nockGrp) return;              // never built one, nothing to hide
  setModelNock(m, id);
  if (!m.nockGrp) return;
  m.nockGrp.visible = drawP > 0 && id != null;
  m.nockGrp.position.set(0, (-13.5 + 3.0 * drawP) * PX, 1.5 * PX);
}

/* A skeleton rises out of the ground exactly like a zombie; what differs is the loadout rolled
   here, once, and never again. */
function spawnSkeleton(x, y, z) {
  const m = buildHumanoid(_newSkeletonMat());
  m.root.position.set(x, y - ENT_H, z);
  scene.add(m.root);
  const roll = Math.random();
  const arm = roll < SKEL_ARM_BOW ? 'bow'
            : roll < SKEL_ARM_BOW + SKEL_ARM_SWORD ? 'sword' : 'hands';
  const ent = {
    model: m, x, y, z, vy: 0, yaw: Math.random() * Math.PI * 2,
    hp: SKEL_HP, onGround: false,
    state: 'wander', wanderT: 0, walk: 0, hurtT: 0,
    aggroT: 0, atkCd: 0, jumpCd: 0, thinkT: 0,
    kx: 0, kz: 0, hazCd: 0, airT: ENT_AIR_MAX, escapeT: 0, turnCd: 0,
    atkAnimT: 0, flailT: 0,
    riseT: ZOMBIE_RISE_TIME, burnT: 0, sunT: 0,
    hx: x, hz: z,
    name: 'Skeleton', inventory: [], kind: 'skeleton', level: _rollLevel(),
    arm,
    ammo: arm === 'bow' ? _ri(SKEL_ARROWS_MIN, SKEL_ARROWS_MAX) : 0,
    ammoId: ITEM.ARROW,                       // which ammunition this one carries (multi-ammo ready)
    drawT: 0, shootCd: 0,                     // bow draw progress and the recovery between shots
    dmg: arm === 'sword' ? SKEL_DMG_SWORD : SKEL_DMG_HANDS,
  };
  ENTITIES.push(ent);
  return ent;
}

// a creature leaving the world without dying: a puff where it stood, smoky if the sun took it (0.803)
function _fxEntGone(e, burnt = false) {
  if (typeof fxPuff === 'function') fxPuff(e.x, e.y + 0.8, e.z, burnt ? [0.3, 0.28, 0.27] : [0.85, 0.85, 0.88], 12, 1.4);
}
function _removeEntity(i) {
  const e = ENTITIES[i];
  // never leave a rider welded to an animal that no longer exists
  if (e && e.rider && typeof dismountRider === 'function') dismountRider(e.rider, true);
  scene.remove(e.model.root);
  ENTITIES.splice(i, 1);
}
function clearEntities() {
  while (ENTITIES.length) _removeEntity(ENTITIES.length - 1);
  _zombieSpawnT = -1e9;                   // a new world starts with the spawn cooldown clear
}

/* ---- per-entity hitboxes (0.7441) ----
   A body's box is its KIND's base size times its own `size`. Humanoids keep the old shared
   ENT_R/ENT_H; the animals get bases that match their models (a sheep was a 1.8-tall column).
   The horse's radius is wider than its barrel because a square column is all this collision
   has, and the body is long — 0.45 keeps its head and rump out of most walls while an ordinary
   one still fits a one-wide gap.

   _entBlocked takes no entity (it has dozens of callers, spawn checks included), so the box it
   tests is a small piece of state: updateEntities installs each mob's box before ticking it and
   restores the default afterwards. Everything outside that loop sees the plain humanoid box. */
/* 0.7442 re-sized with the breed scales: sheep x0.85, cow x1.15, horse x1.2 in HEIGHT only — its
   radius stays 0.45 so an ordinary-sized horse still fits a one-wide gap (0.54 would not). */
const ENT_BOX = { sheep: [0.345, 1.265], cow: [0.46, 1.72], horse: [0.45, 2.28] };
// a fish (0.805): a short squat column round its middle, scaled by its species and its own size
const entR = (e) => e.kind === 'fish' ? 0.3 * fishLen(e) : (ENT_BOX[e.kind] ? ENT_BOX[e.kind][0] : ENT_R) * (e.size || 1);
const entH = (e) => e.kind === 'fish' ? 0.42 * fishLen(e) : (ENT_BOX[e.kind] ? ENT_BOX[e.kind][1] : ENT_H) * (e.size || 1);
let _boxR = ENT_R, _boxH = ENT_H;
function _useBox(e) { _boxR = e ? entR(e) : ENT_R; _boxH = e ? entH(e) : ENT_H; }

// AABB test against solid voxels for a candidate position, using the installed box (_useBox)
function _entBlocked(x, y, z) {
  const x0 = Math.floor(x - _boxR), x1 = Math.floor(x + _boxR);
  const z0 = Math.floor(z - _boxR), z1 = Math.floor(z + _boxR);
  // NO epsilon on the bottom edge. A +0.02 lift meant a mob resting exactly on a block top
  // tested the AIR cell it stands in rather than the floor, so gravity pulled it ~0.02 down
  // every frame until the check finally caught and snapped it back — a permanent shake, and
  // onGround stayed false, which also killed the knockback hop.
  const y0 = Math.floor(y), y1 = Math.floor(y + _boxH - 0.02);
  for (let yy = y0; yy <= y1; yy++)
    for (let zz = z0; zz <= z1; zz++)
      for (let xx = x0; xx <= x1; xx++)
        if (isSolid(xx, yy, zz)) return true;
  return false;
}

/* Lowest Y at or above the feet where the body actually FITS at (nx,nz), or null.
   The old climb test just probed `e.y + 1`, which fails at a shoreline: a mob floating at
   y≈99.4 probes 100.4, and floor(100.4) IS the solid shore block, so the step never looked
   possible and it bobbed against the bank forever. Probing candidate STANDING heights instead
   finds y=101 (on top of the shore) correctly. */
function _stepUpTarget(e, nx, nz, maxRise = 1.7) {
  const base = Math.floor(e.y);
  for (let k = 1; k <= 2; k++) {
    const ty = base + k;
    if (ty - e.y > maxRise) break;
    if (!_entBlocked(nx, ty, nz)) return ty;
  }
  return null;
}

// Cells a mob refuses to walk into. Lava and cactus hurt; deep-ish water is avoided so they
// don't wander out to sea and drown. Checked against the two cells the body occupies.
function _entHazard(x, y, z) {
  for (let dy = 0; dy <= 1; dy++) {
    const id = getBlock(Math.floor(x), Math.floor(y + dy), Math.floor(z)) & 255;
    if (id === B.LAVA || id === B.CACTUS) return true;
  }
  const fx = Math.floor(x), fz = Math.floor(z), fy = Math.floor(y);
  // a step that would drop the feet into water counts as a hazard too
  if ((getBlock(fx, fy, fz) & 255) === B.WATER) return true;
  /* ...and so does a ledge: probe downward for a floor and refuse the step if the drop would
     hurt. WATER FOUND ON THE WAY DOWN IS ALSO A HAZARD (0.711) — it used to count as a floor,
     on the reasoning that falling into a pond is survivable. That is exactly how mobs kept
     ending up in the sea: standing on a bank, the cell straight ahead is air (the water surface
     is a block lower), so the step looked clean and they walked straight off into it. Now the
     shoreline reads as a wall and they turn along it instead. */
  let d = 0;
  while (d <= ENT_FALL_SAFE && fy - 1 - d >= 0) {
    const bv = getBlock(fx, fy - 1 - d, fz), bid = bv & 255;
    if (bid === B.WATER) return true;
    if (CORE.solidVal(bv)) break;                // a drift of snow or leaves is not a floor (0.785)
    d++;
  }
  return d > ENT_FALL_SAFE;
}
/* A spawn needs real ROOM, not just a body-sized gap: a 2x2x2 block of open cells. Without this
   a mob could be placed into a one-block-high cave mouth or a crevice and be sealed in the
   instant it settled — the body AABB is only 0.6 wide, so it fitted where nothing could move. */
function _entSpawnRoom(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  for (let dy = 0; dy <= 1; dy++)
    for (let dz = 0; dz <= 1; dz++)
      for (let dx = 0; dx <= 1; dx++) {
        const v = getBlock(fx + dx, fy + dy, fz + dz), id = v & 255;
        if (CORE.solidVal(v) || id === B.WATER || id === B.LAVA) return false;
      }
  return true;
}

/* Fall damage, mirroring the player's rule. Tracks the highest point reached while airborne
   rather than integrating vy, so a mob knocked upward off a cliff is measured from the apex.
   Returns true if the entity died and was removed — the caller must return immediately, since
   ENTITIES has been spliced under it. */
const ENT_FALL_SAFE = 3;              // blocks of free fall a mob shrugs off
function _entFallDamage(e, i, wasGround, inWater) {
  if (inWater) { e.peakY = null; return false; }
  if (!e.onGround) {
    e.peakY = (e.peakY == null) ? e.y : Math.max(e.peakY, e.y);
    return false;
  }
  const peak = e.peakY;
  e.peakY = null;
  if (wasGround || peak == null) return false;
  const drop = peak - e.y;
  if (drop <= ENT_FALL_SAFE) return false;
  e.hurtT = 0.25;
  e.hp -= Math.round(drop - ENT_FALL_SAFE);
  if (e.hp > 0) return false;
  if (!player.canFly) _entDropLoot(e);
  _removeEntity(i);
  return true;
}

const ANIMAL_KINDS = new Set(['sheep', 'cow', 'pig', 'horse']);
function _entDropLoot(ent, byPlayer = false) {
  const bx = Math.floor(ent.x), by = Math.floor(ent.y + 0.5), bz = Math.floor(ent.z);
  /* Every count rolls from LOOT (50-loottable.js, 0.806). Butcher (0.79; a chance since 0.806): an animal
     the player killed has a 20% chance of one more of its FIRST drop — the meat, a horse's leather. */
  const butcher = byPlayer && ANIMAL_KINDS.has(ent.kind) && typeof hasSkill === 'function' && hasSkill('butcher');
  const pop = (id, n) => {
    for (let i = 0; i < n; i++)
      spawnDrop(id, bx, by, bz, {
        x: (Math.random() - 0.5) * 3.5, y: 2.4 + Math.random() * 1.6, z: (Math.random() - 0.5) * 3.5,
      }, 0.6);
  };
  const first = (id, table) => pop(id, rollLoot(table) + lootBonus(butcher));
  if (ent.kind === 'sheep') {
    first(ITEM.MUTTON, LOOT.meat);
    if (ent.woolly) { pop(B.WOOL, 1); pop(ITEM.STRING, rollLoot(LOOT.woolString)); }
    return;
  }
  if (ent.kind === 'cow') {
    first(ITEM.BEEF, LOOT.meat);
    pop(ITEM.LEATHER, rollLoot(LOOT.leather));
    return;
  }
  if (ent.kind === 'pig') {
    first(ITEM.PORK, LOOT.meat);
    pop(ITEM.FAT, rollLoot(LOOT.fat));
    return;
  }
  if (ent.kind === 'fish') {                   // one of its own, raw (0.805) — always one, no skill adds to it
    pop((FISH[ent.species] || FISH.cod).item, rollLoot(LOOT.fish));
    return;
  }
  if (ent.kind === 'horse') {
    first(ITEM.LEATHER, LOOT.leather);
    if (ent.saddled) pop(ITEM.SADDLE, 1);      // tack always comes back, whatever happened to it
    return;
  }
  if (ent.kind === 'zombie') {
    pop(ITEM.ROTTEN_FLESH, rollLoot(LOOT.monster));
    if (Math.random() < ZOMBIE_NUGGET_CHANCE)
      pop(ZOMBIE_NUGGETS[Math.floor(Math.random() * ZOMBIE_NUGGETS.length)], 1);
    _mobDropHeld(ent);                         // and anything it picked up off the ground
    return;
  }
  if (ent.kind === 'skeleton') {
    pop(ITEM.BONE, rollLoot(LOOT.monster));
    pop(ent.ammoId != null ? ent.ammoId : ITEM.ARROW, rollLoot(LOOT.arrows));
    /* The bow itself, once in a hundred thousand kills, and worn nearly through when it does
       come — it is a trophy off a corpse, not a shortcut past the crafting bench. */
    if (ent.arm === 'bow' && Math.random() < SKEL_BOW_DROP_CHANCE) {
      const dur = _ri(SKEL_BOW_DROP_DUR_MIN, SKEL_BOW_DROP_DUR_MAX);
      spawnDrop(ITEM.BOW, bx, by, bz,
        { x: (Math.random() - 0.5) * 2, y: 2.6, z: (Math.random() - 0.5) * 2 }, 0.6, dur);
      toast('the skeleton dropped its bow');
    }
    return;
  }
  for (const l of ENT_LOOT) { const id = l.id(); if (id != null) pop(id, rollLoot(LOOT.villager)); }
  for (const s of ent.inventory) pop(s.id, s.count);
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
  ent.regrowing = false;
  ent.grazeCd = SHEEP_GRAZE_CD;
  const bx = Math.floor(ent.x), by = Math.floor(ent.y + 0.5), bz = Math.floor(ent.z);
  const n = rollLoot(LOOT.shearWool);           // 50-loottable.js (0.806)
  for (let i = 0; i < n; i++)
    spawnDrop(B.WOOL, bx, by, bz, {
      x: (Math.random() - 0.5) * 2.5, y: 2.2 + Math.random(), z: (Math.random() - 0.5) * 2.5,
    }, 0.5);
  const slot = HOTBAR[hotbarSel];
  if (!player.canFly && slot && slot.dur != null) {
    if (wearSlot(slot) === 'gone') HOTBAR[hotbarSel] = null;
    saveHotbar(); buildHotbar(); updateHotbar();
  }
  return true;
}

/* ---------------------------------- monsters vs villagers (0.7912) ----------------------------------
   Monsters hunt villagers as well as players, and villagers stand their ground: an NPC goes for any
   monster that comes near it or hits it, and a monster goes for a villager that hits it. A creature
   killed by ANOTHER creature leaves nothing — no loot, no XP, nothing it was carrying — so a zombie
   walked into a village is not a way to farm either side. */
const MONSTER_SEES_NPC = 24;          // how far a monster notices a villager (a player: ZOMBIE_CHASE_RANGE)
const NPC_DEFEND_RANGE = 12;          // how close a monster comes before a villager goes for it
const FOE_RETHINK = 0.25;             // seconds between looks for a new foe while it has none
const _isMonster = (e) => isNightMob(e);
const _foeAlive = (f) => !!f && f.hp > 0 && !f._killedByMob && f.active !== false && !(f.riseT > 0) && ENTITIES.includes(f);
/* The creature `e` is fighting this tick, or null when its business (if any) is with a player. A foe
   it already has is kept while it lives and stays near; with none, it looks again every FOE_RETHINK. */
function _entFoe(e, tp, distXZ, dt) {
  const monster = _isMonster(e);
  if (!monster && e.kind !== 'npc') return null;
  const range = monster ? MONSTER_SEES_NPC : NPC_DEFEND_RANGE;
  const dist = (f) => Math.hypot(f.x - e.x, f.z - e.z);
  // a little slack past the range, so a chase does not flicker on and off at its edge
  if (e._foe && !(_foeAlive(e._foe) && dist(e._foe) <= range + 4)) e._foe = null;
  if (!e._foe) {
    e._foeT = (e._foeT || 0) - dt;
    if (e._foeT <= 0) {
      e._foeT = FOE_RETHINK;
      let bd = range;
      for (const f of ENTITIES) {
        if (f === e || !_foeAlive(f) || (monster ? f.kind !== 'npc' : !_isMonster(f))) continue;
        const d = dist(f);
        if (d < bd) { bd = d; e._foe = f; }
      }
    }
  }
  const f = e._foe;
  if (!f) return null;
  // a monster still goes for the PLAYER when the player is the nearer of the two
  if (monster && !tp.canFly && !tp.dead && distXZ <= ZOMBIE_CHASE_RANGE && distXZ < dist(f)) return null;
  return f;
}
/* A creature hurting a creature: a monster's blow or arrow, a villager's swing. Unlike damageEntity it
   never pays the player XP, never drops loot and never turns anyone against the player — the victim
   turns on its attacker instead. Death only MARKS the body: updateEntities removes it at the top of
   its next turn, since taking an entry out of ENTITIES here would shift the one being updated. */
// red hearts over a hurt creature, one per two points of damage (0.8, 49-particles.js)
const _fxEntHurt = (ent, dmg) => {
  if (typeof fxHearts === 'function') fxHearts(ent.x, ent.y + entH(ent) * 0.85, ent.z, false, dmg);   // one heart per point dealt (0.8031)
  // the killing blow: crit stars and a white puff (0.801)
  if (ent.hp <= 0 && typeof fxDeath === 'function') fxDeath(ent.x, ent.y, ent.z, entH(ent));
};
function damageEntityByMob(ent, dmg, by) {
  if (!ent || ent.hp <= 0 || ent._killedByMob) return false;
  ent.hp -= dmg;
  _fxEntHurt(ent, dmg);
  ent.hurtT = 0.25;
  ent.flailT = ENT_FLAIL_TIME;
  if (isFish(ent)) ent.fleeT = FISH_FLEE_TIME;                  // 0.805
  else if (isGrazer(ent)) ent.fleeT = ent.kind === 'cow' ? COW_FLEE_TIME : ent.kind === 'pig' ? PIG_FLEE_TIME : SHEEP_FLEE_TIME;
  else if (by && by !== ent && by.hp > 0 &&
           ((_isMonster(ent) && by.kind === 'npc') || (ent.kind === 'npc' && _isMonster(by)))) {
    ent._foe = by;
    if (ent.state !== 'chase') ent.thinkT = ENT_THINK_TIME;   // the same beat of surprise a player's hit gets
  }
  if (ent.hp <= 0) { ent._killedByMob = true; return true; }
  return false;
}
// one swing of one creature at another: the blow, the shove, the sound
function _mobHitsMob(att, foe, dmg, dx, dz, dist) {
  const died = damageEntityByMob(foe, dmg, att);
  playSound('hit', { gain: 0.6, rate: 1.0 + Math.random() * 0.1, pos: { x: foe.x, y: foe.y + 1, z: foe.z } });
  if (died) return;
  const m = dist || 1;
  foe.kx = dx / m * ENT_KNOCK * 12;
  foe.kz = dz / m * ENT_KNOCK * 12;
  if (_entBlocked(foe.x, foe.y - 0.02, foe.z)) foe.vy = ENT_KNOCK_HOP;
}
// what an archer aims at when its target is a creature: mobShoot reads a player's pos and eye height
const _entAimTarget = (f) => ({ pos: { x: f.x, y: f.y, z: f.z }, EYE: 1.62 });

function damageEntity(ent, dmg) {
  if (ent._killedByMob) return false;          // already dead at another creature's hands (0.7912)
  ent.hp -= dmg;
  _fxEntHurt(ent, dmg);
  ent.hurtT = 0.25;
  ent.flailT = ENT_FLAIL_TIME;                   // limbs thrash on impact even while standing
  // Grazers are passive: they bolt rather than retaliate. So are fish (0.805)
  if (isGrazer(ent) || isFish(ent)) {
    if (!player.canFly) ent.fleeT = isFish(ent) ? FISH_FLEE_TIME : ent.kind === 'cow' ? COW_FLEE_TIME
                                  : ent.kind === 'pig' ? PIG_FLEE_TIME : SHEEP_FLEE_TIME;
    if (ent.hp <= 0) {
      if (!player.canFly) { _entDropLoot(ent, true); addXP(mobKillXP(ent)); }   // killed by the player
      const i = ENTITIES.indexOf(ent);
      if (i >= 0) _removeEntity(i);
      return true;
    }
    return false;
  }
  // Creative is a build mode: mobs never turn hostile and never leave loot behind.
  if (!player.canFly) {
    ent.aggroT = ENT_AGGRO_TIME;               // neutral until provoked — this is the provocation
    if (ent.state !== 'chase') ent.thinkT = ENT_THINK_TIME;   // beat of confusion before it reacts
    ent.state = 'chase';
  }
  if (ent.hp <= 0) {
    if (!player.canFly) { _entDropLoot(ent); addXP(mobKillXP(ent)); }
    const i = ENTITIES.indexOf(ent);
    if (i >= 0) _removeEntity(i);
    return true;
  }
  return false;
}

/* Ray from the camera against every entity's AABB — used by the attack hook so hitting a mob
   takes priority over mining the block behind it. Returns the nearest entity within reach. */
const _atkDir = new THREE.Vector3();
const _atkOrigin = new THREE.Vector3();
const _blockDir = new THREE.Vector3();
function pickEntityHit(maxDist = 4.0) {
  camera.getWorldDirection(_atkDir);
  if (camView === 2) _atkDir.negate();     // front view: the camera looks back at the player
  // Always swing from the EYE, never from camera.position — in third person the camera has been
  // pulled several blocks backwards, which put most of the reach behind the player and made
  // hits (and therefore knockback) silently miss.
  _atkOrigin.set(player.pos.x, player.pos.y + player.EYE, player.pos.z);
  const o = _atkOrigin;
  let best = null, bestT = Infinity;
  for (const e of ENTITIES) {
    // the animal under you is never the thing you are swinging at — its box now grows with it,
    // and aiming down from the saddle would otherwise land every blow on your own horse
    if (e.rider === player) continue;
    // slab test against the entity box
    const er = entR(e), eh = entH(e);          // its own size: a foal is a smaller target
    const bx0 = e.x - er, bx1 = e.x + er;
    const by0 = e.y,      by1 = e.y + eh;
    const bz0 = e.z - er, bz1 = e.z + er;
    let t0 = 0, t1 = maxDist, ok = true;
    for (const [ro, rd, b0, b1] of [[o.x, _atkDir.x, bx0, bx1],
                                    [o.y, _atkDir.y, by0, by1],
                                    [o.z, _atkDir.z, bz0, bz1]]) {
      if (Math.abs(rd) < 1e-6) { if (ro < b0 || ro > b1) { ok = false; break; } continue; }
      let ta = (b0 - ro) / rd, tb = (b1 - ro) / rd;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < bestT) { bestT = t0; best = e; }
  }
  return best ? { ent: best, t: bestT } : null;
}
function pickEntity(maxDist = 4.0) {
  const h = pickEntityHit(maxDist);
  return h ? h.ent : null;
}

/* Blocks you can reach a mob through: billboards (tall grass, flowers, saplings) and leaves.
   Standing in a bush must not make the bush eat your swing. Glass and other cutout blocks are
   deliberately excluded — they're solid to a fist. */
function _swingPassable(id) {
  const p = PROPS[id & 255];
  if (!p) return false;
  return p.model === 'cross' || (id & 255) === B.LEAVES || (id & 255) === B.BIRCH_LEAVES;
}

/* Does the aimed entity take priority over the aimed block?
   `hit.t` is measured from camera.position (which in third person sits metres behind the head)
   while entity picking starts at the eye, so the block distance is re-measured from the eye
   before the two are compared. */
function entityBeatsBlock(entHit, hit) {
  if (!entHit) return false;
  if (!hit || hit.t == null) return true;
  if (_swingPassable(hit.id)) return true;
  camera.getWorldDirection(_blockDir);        // NOT _atkDir — that one is flipped in front view
  const hx = camera.position.x + _blockDir.x * hit.t;
  const hy = camera.position.y + _blockDir.y * hit.t;
  const hz = camera.position.z + _blockDir.z * hit.t;
  const dx = hx - _atkOrigin.x, dy = hy - _atkOrigin.y, dz = hz - _atkOrigin.z;
  return entHit.t <= Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/* Attack pacing. A bare hand needs HAND_ATTACK_TIME between swings; a weapon's attackSpeed is a
   multiplier that shortens that (attackSpeed 2 = twice as fast). Swapping what you're holding
   re-arms the full hand delay, so you can't scroll onto a fast sword and hit instantly. */
const HAND_ATTACK_TIME = 0.5;
const FIST_ATTACK_TIME = 1.2;                   // bare hand, or anything that is not a tool (0.756)
const HAND_DAMAGE = 1;
var _atkCooldown = 0;
var _lastHeldForAtk;
function attackCooldownFor(id) {
  const p = id != null && id >= 256 ? ITEM_PROPS[id] : null;
  /* A bare fist, or anything that is not a tool or weapon (a block, food), punches every 1.2s (0.756).
     Tools and weapons start from that same hand time and apply their own attackSpeed to it (0.7591):
     a stone pickaxe at 0.8 swings every 1.5s, an iron sword at 1.9 every ~0.63s. Worn gear speeds
     either one up. */
  const gear = typeof playerAtkSpeedMul === 'function' ? playerAtkSpeedMul() : 1;
  if (!p || !(p.tool || p.ranged)) return FIST_ATTACK_TIME / gear;   // a bow paces like a weapon (0.7593)
  const spd = p.attackSpeed > 0 ? p.attackSpeed : 1;
  return FIST_ATTACK_TIME / (spd * gear);
}
function attackDamageFor(id) {
  const p = id != null && id >= 256 ? ITEM_PROPS[id] : null;
  const base = p && p.damage > 0 ? p.damage : HAND_DAMAGE;
  // strength from equipment is flat bonus damage (diamond sword 7 + iron gloves 0.75 = 7.75)
  return base + (typeof playerStrength === 'function' ? playerStrength() : 0);
}
/* ---- snowballs (0.6962) ----
   A thrown snowball is a shove, not an attack: it staggers whatever it lands on and pushes it
   along the flight direction, but deals no damage and deliberately touches NEITHER `aggroT`/
   `state` (hostiles stay neutral) NOR `fleeT` (sheep don't bolt). Pelting a cow is harmless fun. */
function projectileHitEntity(x, y, z) {
  for (const e of ENTITIES) {
    if (e.hp <= 0) continue;
    const er = entR(e);
    if (Math.abs(x - e.x) > er + 0.2 || Math.abs(z - e.z) > er + 0.2) continue;
    if (y < e.y - 0.1 || y > e.y + entH(e)) continue;
    return e;
  }
  return null;
}
function entitySnowballHit(ent, vx, vy, vz) {
  ent.hurtT = 0.25;                              // the white flash, so the hit reads
  ent.flailT = ENT_FLAIL_TIME;
  const m = Math.hypot(vx, vz) || 1;
  ent.kx = vx / m * ENT_KNOCK * 7;               // lighter than a melee hit
  ent.kz = vz / m * ENT_KNOCK * 7;
  if (_entBlocked(ent.x, ent.y - 0.02, ent.z)) ent.vy = ENT_KNOCK_HOP * 0.5;
  playSound('hit', { gain: 0.5, rate: 1.3 + Math.random() * 0.1, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
}
function tryAttackEntity(ent) {
  if (_atkCooldown > 0) return false;
  if (!ent) ent = pickEntity();
  if (!ent) return false;
  const held = heldUseId();                  // a broken weapon hits like a fist (0.79)
  playSound('hit', { gain: 0.9, rate: 0.95 + Math.random() * 0.1, pos: { x: ent.x, y: ent.y + 1, z: ent.z } });
  _atkCooldown = attackCooldownFor(held);
  const died = damageEntity(ent, attackDamageFor(held));
  // Knockback: push along player -> entity. When the two overlap that vector is ~zero and
  // normalising it produced a random direction (the occasional "pulled toward me" hit), so fall
  // back to the aim direction, which is always outward.
  if (!died) {
    let dx = ent.x - player.pos.x, dz = ent.z - player.pos.z;
    let m = Math.hypot(dx, dz);
    if (m < 0.2) { dx = _atkDir.x; dz = _atkDir.z; m = Math.hypot(dx, dz) || 1; }
    // stored as a velocity that decays over the next few frames — moving the position directly
    // read as a teleport
    ent.kx = dx / m * ENT_KNOCK * 12;
    ent.kz = dz / m * ENT_KNOCK * 12;
    // test the floor directly rather than trusting the onGround flag from the previous tick
    if (_entBlocked(ent.x, ent.y - 0.02, ent.z)) ent.vy = ENT_KNOCK_HOP;
  }
  // tools wear from swinging at mobs, same as breaking a block
  const slot = HOTBAR[hotbarSel];
  if (!player.canFly && slot && slot.dur != null) {
    if (wearSlot(slot) === 'gone') HOTBAR[hotbarSel] = null;
    saveHotbar(); buildHotbar(); updateHotbar();
  }
  return true;
}

/* ---- persistence ----
   EVERY entity is written (0.71), not just the ones in render distance. A chunk rolls its
   population once and only once, so an unsaved mob is a mob that never comes back — the whole
   point of the new scheme is that the flock you found is still there tomorrow. Frozen entities
   in unloaded chunks are saved exactly like active ones. */
function serializeEntities() {
  const out = [];
  for (const e of ENTITIES) {
    if (isNightMob(e)) continue;      // night spawns: dawn is their despawn, never persisted
    out.push([
      +e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2),
      +e.yaw.toFixed(3), Math.max(0, +e.hp.toFixed(1)),
      e.name, e.inventory.map(s => [s.id, s.count]),
      +e.hx.toFixed(1), +e.hz.toFixed(1),
      e.kind, e.kind === 'sheep' ? (e.woolly ? 1 : 0) : 0,
      e.kind === 'cow' || e.kind === 'pig' ? e.variant : 0,   // appended (0.73): older rows simply lack it
      /* Appended (0.74). A horse is the first entity whose IDENTITY has to survive a reload —
         its rolled stats, how far you got taming it, its saddle and the name you gave it. It
         rides along as one object on the end of the row, so every older save still parses. */
      e.kind === 'horse' ? {
        c: e.coat, st: e.stats, t: e.tame ? 1 : 0, l: e.loved ? 1 : 0,
        p: +(e.tameProg || 0).toFixed(3), b: e.bucked | 0,
        s: e.saddled ? 1 : 0, bo: e.boosted ? 1 : 0,
        g: e.gender, lv: e.level, h: +entHunger(e).toFixed(2),
        sz: e.size, tn: e.tintHex,
      } : e.kind === 'sheep' ? { wc: e.woolColor, sz: e.size, g: e.gender, lv: e.level }             // 0.743 fleece, 0.744 size
        : e.kind === 'cow'   ? { sz: e.size, bt: e.bodyTint, st: e.spotTint, g: e.gender, lv: e.level,  // 0.744 size + tints
                                 mk: e.milkCd > 0 ? Math.round(e.milkCd) : 0 }                        // 0.767 milk cooldown
        : e.kind === 'pig'   ? { sz: e.size, bt: e.bodyTint, st: e.spotTint, g: e.gender, lv: e.level }  // 0.789
        : e.kind === 'npc' ? { g: e.gender, lv: e.level }                    // 0.756 identity
        : e.kind === 'fish' ? { sp: e.species, sz: e.size, lv: e.level }    // 0.805
        : 0,
    ]);
  }
  return out;
}
function restoreEntities(list) {
  if (!Array.isArray(list)) return;
  for (const r of list) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const [x, y, z, yaw, hp, name, inv, hx, hz, kind, woolly, variant, extra] = r;
    if (![x, y, z].every(v => typeof v === 'number' && isFinite(v))) continue;
    if (kind === 'horse') {
      const d = (extra && typeof extra === 'object') ? extra : {};
      const st = (d.st && typeof d.st === 'object' && d.st.maxHp > 0) ? d.st : null;
      const h = spawnHorse(x, y, z, {
        hp: typeof hp === 'number' && hp > 0 ? hp : (st ? st.maxHp : HORSE_HP_MAX),
        coat: d.c, stats: st,
        tame: !!d.t, loved: !!d.l, tameProg: +d.p || 0, bucked: d.b | 0,
        saddled: !!d.s, boosted: !!d.bo,
        gender: d.g, level: d.lv,              // older saves lack both: spawnHorse rolls fresh
        hunger: d.h,                           // ...and start a horse without one well fed
        size: d.sz, tint: d.tn,                // no size saved -> rolled fresh, like the rest
        name: typeof name === 'string' ? name : 'Horse',
        hx: typeof hx === 'number' ? hx : x,
        hz: typeof hz === 'number' ? hz : z,
      });
      if (typeof yaw === 'number') h.yaw = yaw;
      continue;
    }
    if (kind === 'cow') {
      const c = spawnCow(x, y, z, {
        hp: typeof hp === 'number' && hp > 0 ? hp : COW_HP,
        variant,                               // spawnCow re-rolls anything it does not recognise
        size: extra && extra.sz,
        gender: extra && extra.g, level: extra && extra.lv,
        bodyTint: extra && extra.bt != null ? extra.bt : undefined,
        spotTint: extra && extra.st != null ? extra.st : undefined,
        hx: typeof hx === 'number' ? hx : x,
        hz: typeof hz === 'number' ? hz : z,
      });
      if (typeof yaw === 'number') c.yaw = yaw;
      c.milkCd = extra && extra.mk > 0 ? extra.mk : 0;
      continue;
    }
    if (kind === 'pig') {                      // 0.789
      const p = spawnPig(x, y, z, {
        hp: typeof hp === 'number' && hp > 0 ? hp : PIG_HP,
        variant,                               // spawnPig re-rolls anything it does not recognise
        size: extra && extra.sz,
        gender: extra && extra.g, level: extra && extra.lv,
        bodyTint: extra && extra.bt != null ? extra.bt : undefined,
        spotTint: extra && extra.st != null ? extra.st : undefined,
        hx: typeof hx === 'number' ? hx : x,
        hz: typeof hz === 'number' ? hz : z,
      });
      if (typeof yaw === 'number') p.yaw = yaw;
      continue;
    }
    if (kind === 'fish') {                     // 0.805
      const d = (extra && typeof extra === 'object') ? extra : {};
      const fsh = spawnFish(x, y, z, {
        species: d.sp, size: d.sz, level: d.lv,
        hp: typeof hp === 'number' && hp > 0 ? hp : undefined,
        hx: typeof hx === 'number' ? hx : x,
        hz: typeof hz === 'number' ? hz : z,
      });
      if (typeof yaw === 'number') fsh.yaw = yaw;
      continue;
    }
    if (kind === 'sheep') {                    // saves written before sheep existed have no kind
      const s = spawnSheep(x, y, z, {
        hp: typeof hp === 'number' && hp > 0 ? hp : SHEEP_HP,
        woolly: !!woolly,
        woolColor: extra && extra.wc != null ? extra.wc : undefined,   // older saves: white
        size: extra && extra.sz,
        gender: extra && extra.g, level: extra && extra.lv,
        hx: typeof hx === 'number' ? hx : x,
        hz: typeof hz === 'number' ? hz : z,
      });
      if (typeof yaw === 'number') s.yaw = yaw;
      continue;
    }
    const inventory = Array.isArray(inv)
      ? inv.filter(s => Array.isArray(s) && s.length === 2 && (PROPS[s[0]] || ITEM_PROPS[s[0]]))
           .map(s => ({ id: s[0], count: Math.max(1, s[1] | 0) }))
      : [];
    const ent = spawnEntity(x, y, z, {
      hp: typeof hp === 'number' && hp > 0 ? hp : ENT_HP,
      name: typeof name === 'string' ? name : undefined,
      inventory,
      gender: extra && extra.g, level: extra && extra.lv,
      hx: typeof hx === 'number' ? hx : x,
      hz: typeof hz === 'number' ? hz : z,
    });
    if (typeof yaw === 'number') ent.yaw = yaw;
  }
}

/* ---- spawning (0.71) ----
   Mobs are part of the TERRAIN, not a running population meter. A chunk rolls for its inhabitants
   exactly once, the first time it is ever generated, and that roll is recorded in `_entChunks`
   and saved with the world — so walking back into a chunk never re-populates it. Nothing spawns
   near the player on a timer any more, and nothing despawns for being far away: the mobs you
   left in a field are the mobs you find when you come back.

   The cost of a permanent population is paid by FREEZING it. An entity whose chunk is not loaded
   is skipped entirely by the update loop and its model is hidden — it holds its position and its
   state, and costs nothing per frame beyond the array slot. See updateEntities. */
const _entChunks = new Set();            // "cx,cz" of every chunk that has already rolled
const ENT_CHUNK_CHANCE = 0.030;          // a wanderer in ~1 chunk in 33
const SHEEP_CHUNK_CHANCE = 0.028;        // a flock in ~1 chunk in 36 — sheep were far too common
const SHEEP_FLOCK_MIN = 1, SHEEP_FLOCK_MAX = 3;
const COW_CHUNK_CHANCE = 0.010;          // a herd in ~1 chunk in 100 (0.7341: was 1 in 45)
const COW_HERD_MIN = 1, COW_HERD_MAX = 2;
const PIG_CHUNK_CHANCE = 0.012;          // 0.789: a shade commoner than cattle, and in bigger groups
const PIG_HERD_MIN = 1, PIG_HERD_MAX = 3;

// a legal surface spot inside this chunk, or null. Chunk-local — nothing to do with the player.
function _findChunkSpot(cx, cz, biomes) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = cx * 16 + Math.floor(Math.random() * 16) + 0.5;
    const z = cz * 16 + Math.floor(Math.random() * 16) + 0.5;
    if (biomes && !biomes.has(mainGen.biomeAt(Math.floor(x), Math.floor(z)))) continue;
    const gy = surfaceY(Math.floor(x), Math.floor(z));
    const top = getBlock(Math.floor(x), gy, Math.floor(z)) & 255;
    if (top === B.AIR || top === B.WATER || top === B.LAVA || top === B.CACTUS) continue;
    const y = gy + 1;
    if (_entBlocked(x, y, z) || _entHazard(x, y, z)) continue;
    if (!_entSpawnRoom(x, y, z)) continue;             // needs a 2x2x2 pocket, not just a body gap
    return { x, y, z, top };
  }
  return null;
}
/* Called once per chunk from 11-chunks.js, right after its terrain and structures land. */
function trySpawnEntitiesInChunk(cx, cz) {
  if (menuScene || !currentWorld) return;
  const k = cx + ',' + cz;
  if (_entChunks.has(k)) return;
  _entChunks.add(k);
  if (Math.random() < ENT_CHUNK_CHANCE) {
    const s = _findChunkSpot(cx, cz, ENT_BIOMES);
    if (s) spawnEntity(s.x, s.y, s.z);
  }
  _rollHerd(cx, cz, SHEEP_CHUNK_CHANCE, SHEEP_BIOMES, SHEEP_FLOCK_MIN, SHEEP_FLOCK_MAX, spawnSheep);
  _rollHerd(cx, cz, COW_CHUNK_CHANCE,   COW_BIOMES,   COW_HERD_MIN,   COW_HERD_MAX,   spawnCow);
  _rollHerd(cx, cz, PIG_CHUNK_CHANCE,   PIG_BIOMES,   PIG_HERD_MIN,   PIG_HERD_MAX,   spawnPig);
  _rollHerd(cx, cz, HORSE_CHUNK_CHANCE, HORSE_BIOMES, HORSE_HERD_MIN, HORSE_HERD_MAX, spawnHorse);
  _rollFish(cx, cz);                                                   // 0.805
}
/* Fish (0.805): a small school of one species in water at least FISH_MIN_DEPTH deep, somewhere between
   the bed and a block under the surface. A catfish keeps to the bottom, and only where it is deep. */
const FISH_CHUNK_CHANCE = 0.06, FISH_SCHOOL_MIN = 1, FISH_SCHOOL_MAX = 3, FISH_MIN_DEPTH = 2;
function _rollFish(cx, cz) {
  if (Math.random() >= FISH_CHUNK_CHANCE) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = cx * 16 + Math.floor(Math.random() * 16), z = cz * 16 + Math.floor(Math.random() * 16);
    const bed = surfaceY(x, z);
    let top = bed;
    while (top < 199 && (getBlock(x, top + 1, z) & 255) === B.WATER) top++;
    const depth = top - bed;
    if (depth < FISH_MIN_DEPTH) continue;
    const species = _rollFishSpecies(depth >= 3);
    const n = species === 'cod' ? _ri(2, 4) : _ri(FISH_SCHOOL_MIN, FISH_SCHOOL_MAX);
    for (let k = 0; k < n; k++) {
      const fy = FISH[species].bottom ? bed + 1.1 : bed + 1.1 + Math.random() * Math.max(0, depth - 2);
      spawnFish(x + 0.5 + (Math.random() - 0.5) * 0.4, fy, z + 0.5 + (Math.random() - 0.5) * 0.4, { species });   // mid-column: wholly in water
    }
    return;
  }
}
/* One grazer group. They only appear on grass, and they arrive clustered on a single vetted spot
   rather than scattered across the chunk — which is what makes a field read as a field. */
function _rollHerd(cx, cz, chance, biomes, min, max, spawn) {
  if (Math.random() >= chance) return;
  const s = _findChunkSpot(cx, cz, biomes);
  if (!s || s.top !== B.GRASS) return;
  const n = min + Math.floor(Math.random() * (max - min + 1));
  for (let i = 0; i < n; i++) {
    const sx = s.x + (Math.random() * 4 - 2), sz = s.z + (Math.random() * 4 - 2);
    // a scattered member that lands somewhere cramped falls back to the anchor spot, which
    // already passed the full room test
    if (_entBlocked(sx, s.y, sz) || _entHazard(sx, s.y, sz) || !_entSpawnRoom(sx, s.y, sz))
      { spawn(s.x, s.y, s.z); continue; }
    spawn(sx, s.y, sz);
  }
}
/* Night mobs, rolled on EVERY chunk-gen finish rather than once per chunk for ever: a chunk that
   was empty at noon is a candidate again after dusk. Called from finishChunkGen alongside the
   permanent population roll, so a freshly generated chunk and an old one being streamed back in
   are treated identically — which is exactly what "loading old ones" has to mean here, since a
   chunk you walk away from is regenerated from the seed when you return. */
function trySpawnNightMobsInChunk(cx, cz) {
  if (menuScene || !currentWorld || !anyPlayerSpawned()) return;
  if (!isNightForMobs()) return;
  const nowS = performance.now() / 1000;
  if (nowS - _zombieSpawnT < ZOMBIE_SPAWN_GAP) return;   // still inside the world-wide cooldown
  if (Math.random() >= ZOMBIE_CHUNK_CHANCE) return;
  let live = 0;
  // one population, two species: the cap, the cooldown and the chunk roll are shared, so adding
  // skeletons made the night more varied rather than twice as crowded
  for (const e of ENTITIES) if (isNightMob(e)) live++;
  if (live >= ZOMBIE_CAP) return;
  const s = _findChunkSpot(cx, cz, null);              // any biome — night is night everywhere
  if (!s) return;
  // "in the player's face" means ANY player's face in split screen
  for (const p of PLAYERS) {
    const dx = s.x - p.pos.x, dz = s.z - p.pos.z;
    if (dx * dx + dz * dz < ZOMBIE_SPAWN_MIN_DIST * ZOMBIE_SPAWN_MIN_DIST) return;
  }
  const n = Math.min(ZOMBIE_CAP - live, _ri(ZOMBIE_PACK_MIN, ZOMBIE_PACK_MAX));
  if (n > 0) _zombieSpawnT = nowS;                  // armed only when one actually comes up
  for (let i = 0; i < n; i++) {
    const spawn = Math.random() < SKEL_SPAWN_SHARE ? spawnSkeleton : spawnZombie;
    const ox = Math.random() * 3 - 1.5, oz = Math.random() * 3 - 1.5;
    const zx = s.x + ox, zz = s.z + oz;
    if (_entBlocked(zx, s.y, zz) || _entHazard(zx, s.y, zz) || !_entSpawnRoom(zx, s.y, zz))
      { spawn(s.x, s.y, s.z); continue; }              // fall back to the vetted anchor spot
    spawn(zx, s.y, zz);
  }
  if (n > 0 && typeof fxPuff === 'function') fxPuff(s.x, s.y + 0.8, s.z, [0.22, 0.2, 0.26], 14, 1.6);   // they rise out of a dark puff (0.803)
}

function serializeEntChunks() { return [..._entChunks]; }
function restoreEntChunks(list) {
  _entChunks.clear();
  if (Array.isArray(list)) for (const k of list) if (typeof k === 'string') _entChunks.add(k);
}

/* Player shove: mob hits and body collisions feed a decaying velocity here rather than moving
   the player outright, so being struck slides you back instead of teleporting you. */
/* Shove state lives ON the player object (0.72) so each split-screen player is knocked about
   independently. `_plyKick` stays as the active player's alias for the code that reads it. */
var _plyKick = { x: 0, z: 0 };
function playerKick(p) { return p._kick || (p._kick = { x: 0, z: 0 }); }
function _movePlayerBy(p, dx, dz) {
  const q = p.pos;
  if (!_entBlocked(q.x + dx, q.y, q.z)) q.x += dx;
  if (!_entBlocked(q.x, q.y, q.z + dz)) q.z += dz;
}
function _updatePlayerKick(dt) {
  for (const p of PLAYERS) {
    const k = playerKick(p);
    if (!k.x && !k.z) continue;
    _movePlayerBy(p, k.x * dt, k.z * dt);
    const d = Math.max(0, 1 - PLY_KNOCK_DECAY * dt);
    k.x *= d; k.z *= d;
    if (Math.abs(k.x) < 0.05 && Math.abs(k.z) < 0.05) { k.x = 0; k.z = 0; }
  }
}

/* Bodies are solid to each other: overlapping mobs (and the player) get pushed apart so nothing
   ends up standing inside anyone. Vertical overlap is required, otherwise stacked mobs on
   different floors would shove each other. */
function _separateBodies(dt) {
  for (let a = 0; a < ENTITIES.length; a++) {
    const e = ENTITIES[a];
    if (e.active === false || isFish(e)) continue;   // frozen in an unloaded chunk — nothing to push; fish shove nobody (0.805)
    // vs other entities — two bodies touch at the SUM of their own radii
    for (let b = a + 1; b < ENTITIES.length; b++) {
      const o = ENTITIES[b];
      if (o.active === false || isFish(o)) continue;
      if (Math.abs(o.y - e.y) >= Math.max(entH(e), entH(o))) continue;
      const minD = entR(e) + entR(o), minD2 = minD * minD;
      let dx = o.x - e.x, dz = o.z - e.z;
      let d2 = dx * dx + dz * dz;
      if (d2 >= minD2) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz) || 1; }
      const push = (minD - d) / minD * ENT_PUSH * dt;
      const ux = dx / d * push, uz = dz / d * push;
      _useBox(e); if (!_entBlocked(e.x - ux, e.y, e.z - uz)) { e.x -= ux; e.z -= uz; }
      _useBox(o); if (!_entBlocked(o.x + ux, o.y, o.z + uz)) { o.x += ux; o.z += uz; }
    }
    // vs every player — creative flying passes through, survival gets shoved
    _useBox(e);
    for (const p of PLAYERS) {
      if (!p.spawned || (p.canFly && p.flying)) continue;
      if (Math.abs(p.pos.y - e.y) >= entH(e)) continue;
      if (p.riding === e) continue;             // its own rider sits inside it by design
      let dx = p.pos.x - e.x, dz = p.pos.z - e.z;
      const d2 = dx * dx + dz * dz;
      const pMin = entR(e) + p.R;
      if (d2 >= pMin * pMin) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz) || 1; }
      const push = (pMin - d) / pMin * ENT_PUSH * dt;
      const ux = dx / d * push, uz = dz / d * push;
      if (!_entBlocked(e.x - ux, e.y, e.z - uz)) { e.x -= ux; e.z -= uz; }
      _movePlayerBy(p, ux, uz);
    }
  }
}

/* Grazer tick — sheep and cows (0.73). Passive: wander, and sprint directly away from the player
   after being hit. The fleece half is sheep-only: a shorn sheep periodically tries to eat the
   grass block under it, which converts the grass to dirt and starts the wool growing back,
   animated by scaling the fleece boxes. A cow simply skips that whole section. */
function _updateGrazer(e, dt, pdx, pdz, distXZ, i) {
  const cow = e.kind === 'cow';
  const horse = e.kind === 'horse';
  const pig = e.kind === 'pig';                 // 0.789
  const walkSpeed = horse ? HORSE_WALK_SPEED * horseSpeedStat(e)
                          : cow ? COW_SPEED : pig ? PIG_SPEED : SHEEP_SPEED;
  const fleeSpeed = (horse ? HORSE_FLEE_SPEED * horseSpeedStat(e)
                           : cow ? COW_FLEE_SPEED : pig ? PIG_FLEE_SPEED : SHEEP_FLEE_SPEED) * FLEE_SPEED_MUL;
  if (e.flailT > 0) e.flailT -= dt;
  if (e.turnCd > 0) e.turnCd -= dt;
  if (e.fleeT > 0) e.fleeT -= dt;

  const inWater = (getBlock(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z)) & 255) === B.WATER;

  /* ---- fleece: graze to regrow, then animate it filling out (sheep only) ---- */
  if (!cow && !horse && !pig && !e.woolly) {
    if (e.regrowing) {
      e.woolGrow = Math.min(1, e.woolGrow + dt / SHEEP_REGROW);
      if (e.woolGrow >= 1) { e.woolly = true; e.regrowing = false; }
    } else {
      e.grazeCd -= dt;
      if (e.grazeCd <= 0) {
        e.grazeCd = SHEEP_GRAZE_CD;
        const gx = Math.floor(e.x), gy = Math.floor(e.y - 0.02), gz = Math.floor(e.z);
        if (e.onGround && _plainGrass(getBlock(gx, gy, gz)) && Math.random() < SHEEP_GRAZE_CHANCE) {
          setBlock(gx, gy, gz, B.DIRT);        // eats the turf down to bare dirt
          playBlockSound(B.GRASS, 'break', gx, gy, gz);
          e.regrowing = true;
          e.woolGrow = 0;
          e.state = 'idle';
          e.wanderT = 1.2;                     // pause to chew
        }
      }
    }
  }

  /* ---- heading ---- */
  let moveSpeed = 0;
  e.faceYaw = null;                       // a ridden horse walks one way and looks another
  if (horse && e.rider) {
    /* ---- carrying someone ----
       Two completely different animals depending on whether it has accepted you yet. Tamed and
       saddled, it goes where the rider looks and jumps on command with its own jump stat. Not
       yet tamed, it bolts: it picks its own headings, changes them every second or so and bucks
       — which is the ride you have to sit through for the taming bar to fill. */
    const r = e.rider;
    if (e.tame && e.saddled) {
      const drive = r._rideFwd || 0;
      e.faceYaw = r.yaw;
      // reverse is expressed as "walk the other way while still facing forward", because the
      // move step below only ever advances along +yaw
      e.yaw = drive < 0 ? r.yaw + Math.PI : r.yaw;
      // a starving horse still carries you, just slower and lower
      moveSpeed = Math.abs(drive) * HORSE_RIDE_SPEED * horseSpeedStat(e) * horseFedMul(e)
                * (drive < 0 ? 0.45 : 1);
      if (r._rideJump && e.onGround && e.jumpCd <= 0) {
        e.vy = HORSE_RIDE_JUMP * horseJumpStat(e) * Math.sqrt(horseFedMul(e));
        e.onGround = false; e.jumpCd = 0.35;
      }
    } else {
      e.bolt -= dt;
      if (e.bolt <= 0) { e.bolt = 0.5 + Math.random() * 1.3; e.yaw += (Math.random() - 0.5) * 2.4; }
      moveSpeed = HORSE_BOLT_SPEED * horseSpeedStat(e);
      if (e.onGround && e.jumpCd <= 0 && Math.random() < dt * 1.5) {
        e.vy = ENT_JUMP * 0.9; e.onGround = false; e.jumpCd = 0.5;   // the buck
      }
    }
  } else if (inWater) {
    e.escapeT -= dt;
    if (e.escapeT <= 0) { e.escapeT = 0.8; e.yaw += 1.2; }
    moveSpeed = walkSpeed;
  } else if (e.fleeT > 0) {
    e.yaw = Math.atan2(-pdx, -pdz);            // straight away from whoever hit it
    moveSpeed = fleeSpeed;
  } else {
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = 2 + Math.random() * 5;
      e.state = Math.random() < 0.45 ? 'idle' : 'wander';
      if (e.state === 'wander') e.yaw = Math.random() * Math.PI * 2;
    }
    moveSpeed = e.state === 'wander' ? walkSpeed : 0;
    const hdx = e.hx - e.x, hdz = e.hz - e.z;
    if (Math.hypot(hdx, hdz) > ENT_HOME_RANGE) {
      e.yaw = Math.atan2(hdx, hdz); e.state = 'wander'; moveSpeed = walkSpeed;
    }
  }

  /* ---- move ---- */
  let moved = 0;
  /* A knockback no longer stuns a FLEEING animal (0.799): the hit that makes it bolt also shoved it, and
     that shove held it standing still until it had worn off, so the flight looked cancelled. It runs at
     once now, the shove carrying it along on top. */
  const stunned = (e.kx !== 0 || e.kz !== 0) && !(e.fleeT > 0);
  e.wantMove = moveSpeed > 0 && !stunned;        // read by the stuck watchdog next tick
  if (moveSpeed > 0 && !stunned) {
    moveSpeed *= boxDragMul(e.x, e.y, e.z, _boxR, _boxH);   // leaves/litter -40%, snow -70%
    const sx = Math.sin(e.yaw) * moveSpeed * dt, sz = Math.cos(e.yaw) * moveSpeed * dt;
    const bad = (nx, nz) => _entBlocked(nx, e.y, nz) || (!inWater && _entHazard(nx, e.y, nz));
    let blocked = false;
    if (!bad(e.x + sx, e.z)) { e.x += sx; moved += Math.abs(sx); } else blocked = true;
    if (!bad(e.x, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else blocked = true;
    const climbY = blocked ? _stepUpTarget(e, e.x + sx, e.z + sz) : null;
    if (blocked && horse && climbY !== null && climbY - e.y <= HORSE_STEP_UP && (e.onGround || inWater)) {
      /* STEP ASSIST (0.741). A horse walks up a one-block ledge rather than jumping it — the
         jump is saved for what actually needs one, and a ridden horse no longer hops at every
         terrace. The body snaps up at once (collision must be exact); the MODEL keeps the old
         height as `stepOff` and eases up to it, so the climb reads as a stride, not a teleport. */
      e.stepOff = (e.stepOff || 0) - (climbY - e.y);
      e.y = climbY; e.x += sx; e.z += sz; e.vy = 0; e.onGround = true;
      moved += Math.hypot(sx, sz);
    } else if (blocked && inWater && climbY !== null) {
      // wading ashore: lift straight onto the ledge, swimming has no real jump arc
      e.y = climbY; e.x += sx; e.z += sz; e.vy = 1.5; e.onGround = false; e.jumpCd = 0.3;
    } else if (blocked && (e.onGround || inWater) && e.jumpCd <= 0 && climbY !== null) {
      e.vy = ENT_JUMP; e.jumpCd = 0.6; e.onGround = false;
    } else if (blocked && e.turnCd <= 0 && !inWater) {
      e.yaw = Math.random() * Math.PI * 2; e.turnCd = 0.5;
    }
  }
  if (e.kx || e.kz) {
    const kdx = e.kx * dt, kdz = e.kz * dt;
    if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
    if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
    const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt);
    e.kx *= k; e.kz *= k;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) { e.kx = 0; e.kz = 0; }
  }
  if (inWater && waterFlowVec(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z), _flowV)) {
    const fdx = _flowV.x * 1.9 * dt, fdz = _flowV.z * 1.9 * dt;
    if (!_entBlocked(e.x + fdx, e.y, e.z)) e.x += fdx;
    if (!_entBlocked(e.x, e.y, e.z + fdz)) e.z += fdz;
  }

  /* ---- hazards ---- */
  if (e.hazCd > 0) e.hazCd -= dt;
  const feetId = getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255;
  const headId = getBlock(Math.floor(e.x), Math.floor(e.y + 1.0), Math.floor(e.z)) & 255;
  if (e.hazCd <= 0) {
    let dmg = 0;
    if (feetId === B.LAVA || headId === B.LAVA) dmg = ENT_LAVA_DMG;
    else if (feetId === B.CACTUS) dmg = ENT_CACTUS_DMG;
    if (dmg > 0) {
      e.hazCd = ENT_HAZARD_CD; e.hurtT = 0.25; e.hp -= dmg;
      if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return; }
    }
  }
  if (headId === B.WATER) {
    e.airT -= dt;
    if (e.airT <= 0) {
      e.airT = 1; e.hurtT = 0.25; e.hp -= ENT_DROWN_DMG;
      if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return; }
    }
  } else e.airT = ENT_AIR_MAX;

  /* ---- gravity ---- */
  const wasGround = e.onGround;
  const standing = !inWater && e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z);
  if (standing) {
    e.y = Math.floor(e.y - 0.02) + 1; e.vy = 0; e.onGround = true;
  } else {
    e.vy -= ENT_GRAVITY * dt;
    if (e.vy < -34) e.vy = -34;
    const ny = e.y + e.vy * dt;
    if (_entBlocked(e.x, ny, e.z)) {
      if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; }
      e.vy = 0;
    } else { e.y = ny; e.onGround = false; }
  }
  if (_entFallDamage(e, i, wasGround, inWater)) return;
  // Buoyancy, but never CLAMP an active climb/jump: the old unconditional Math.min pulled a
  // fresh 7.6 hop straight back down to 4.2, which is the other half of the shoreline trap.
  if (inWater) {
    if (e.vy < 4.2) e.vy = Math.min(e.vy + 40 * dt, 4.2);
    e.onGround = false;
  }

  /* ---- visuals ---- */
  const spd = moved / Math.max(dt, 1e-4);
  entityStepSound(e, dt, spd);
  let swing = Math.min(spd / 3.5, 1) * 0.7;
  if (e.flailT > 0) { e.walk += 11 * dt; swing = Math.max(swing, 0.8); }
  else e.walk += Math.min(spd, 9) * dt * 2.6;
  const m = e.model;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.faceYaw != null ? e.faceYaw : e.yaw;
  /* Grazing dips the head toward the ground. A standing cow crops grass too, and since it idles
     roughly half the time the dip is EASED on the entity rather than snapped — the sheep's is a
     brief one-off, a cow's would otherwise flick up and down all day. */
  // a pig roots with its snout down, so it idles nose-to-the-ground harder than a cow crops grass
  const dipTo = horse ? ((e.state === 'idle' && !e.rider && e.fleeT <= 0 && e.onGround) ? 1 : 0)
              : cow ? ((e.state === 'idle' && e.fleeT <= 0 && e.onGround) ? 0.55 : 0)
              : pig ? ((e.state === 'idle' && e.fleeT <= 0 && e.onGround) ? 0.75 : 0)
                    : ((!e.woolly && e.regrowing && e.woolGrow < 0.08) ? 0.9 : 0);
  e.headDip = (e.headDip || 0) + (dipTo - (e.headDip || 0)) * Math.min(1, dt * 3.5);
  if (horse) {
    /* The horse's "head" IS its neck pivot, so the dip swings the whole assembly down to the
       grass from its carried-high resting angle rather than just nodding the skull. */
    animateQuadruped(m, e.walk, swing,
                     HORSE_NECK_REST + (HORSE_NECK_GRAZE - HORSE_NECK_REST) * e.headDip);
    if (m.tail) m.tail.rotation.z = Math.sin(e.walk * 0.9) * 0.10;      // a tail is never still
    if (m.saddle) m.saddle.visible = !!e.saddled;
    /* ---- hunger: the horse is the one animal that acts on it ----
       Grazing is the idle head-dip it already does — standing on grass with its nose down now
       actually feeds it (the turf is left alone: a horse in your garden must not strip it to
       dirt the way a sheep does). A rider at speed burns it faster; a full belly heals. */
    if (e.rider && spd > 0.5) e.hunger = Math.max(0, entHunger(e) - ENT_HUNGER_DECAY * (HORSE_RIDE_HUNGER - 1) * dt);
    if (!e.rider && e.headDip > 0.7 && e.onGround &&
        (getBlock(Math.floor(e.x), Math.floor(e.y - 0.02), Math.floor(e.z)) & 255) === B.GRASS)
      e.hunger = Math.min(ENT_HUNGER_MAX, entHunger(e) + HORSE_GRAZE_RATE * dt);
    const maxHp = (e.stats && e.stats.maxHp) || HORSE_HP_MAX;
    if (e.hp < maxHp && (e._calmT || 0) >= ENT_REGEN_DELAY && entHunger(e) > ENT_HUNGER_MAX * HORSE_REGEN_ABOVE) {
      e.regenT = (e.regenT || 0) + dt;
      if (e.regenT >= HORSE_REGEN_EVERY) {
        e.regenT = 0;
        e.hp = Math.min(maxHp, e.hp + 1);
        e.hunger = Math.max(0, entHunger(e) - HORSE_REGEN_COST);
      }
    } else e.regenT = 0;
    // step assist: the model eases up the ledge the body has already climbed
    if (e.stepOff) {
      e.stepOff *= Math.max(0, 1 - dt * 11);
      if (e.stepOff > -0.01) e.stepOff = 0;
    }
    const vy = e.y + (e.stepOff || 0);
    m.root.position.set(e.x, vy, e.z);
    // Whoever is on its back travels with it. Written here, AFTER the horse has moved, so the
    // seat never trails a frame behind the animal — which is what makes riding feel attached.
    // It rides the EASED height too, so a step lifts the rider smoothly instead of popping them.
    if (e.rider) {
      e.rider.pos.set(e.x, vy + HORSE_SEAT_Y * (e.size || 1), e.z);   // a bigger horse, a higher seat
      e.rider.vy = 0;
    }
    shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0);
    return;
  }
  animateQuadruped(m, e.walk, swing, e.headDip);
  if (m.wool) {                                  // fleece visibility/scale IS the regrow animation
    const g = e.woolly ? 1 : (e.regrowing ? Math.max(0.06, e.woolGrow) : 0);
    for (const w of m.wool) {
      w.visible = g > 0.02;
      w.scale.setScalar(g);
    }
  }
  shadeHumanoid(m, e.x, e.y, e.z, e.hurtT > 0);
}

/* Sunlight kills. The test is SKY light at head height, not the day/night shading — standing in
   a doorway, under leaves, in a cave or one block into an overhang all read as shade, which is
   what makes hiding spots meaningful. Water puts the fire out too. A short grace period stops a
   zombie flickering alight every time it crosses a one-block gap in a roof.
   Returns true if it burned to death (the caller must remove it immediately). */
/* Fish tick (0.805). In water it drifts on its own heading and depth, darts away from whoever is nearest
   after a hit, and keeps its whole body in water — at a wall, a bank or the surface it turns rather than
   leave. Stranded, it flops about and after FISH_DRY_GRACE seconds starts to suffocate. Returns true when
   it died and was removed. */
function _fishWet(e, x, y, z) {
  const R = entR(e), H = entH(e);
  for (const yy of [y + 0.02, y + H - 0.02])
    for (const dx of [-R, R]) for (const dz of [-R, R])
      if ((getBlock(Math.floor(x + dx), Math.floor(yy), Math.floor(z + dz)) & 255) !== B.WATER) return false;
  return true;
}
function _updateFish(e, dt, tp, i) {
  const sp = FISH[e.species] || FISH.cod;
  const H = entH(e);
  const inWater = (getBlock(Math.floor(e.x), Math.floor(e.y + H * 0.5), Math.floor(e.z)) & 255) === B.WATER;
  if (e.fleeT > 0) e.fleeT -= dt;
  if (e.flailT > 0) e.flailT -= dt;
  if (e.turnCd > 0) e.turnCd -= dt;
  let speed = 0;
  if (inWater) {
    e.dryT = 0; e.onGround = false; e.vy = 0;
    if (e.fleeT > 0) {
      // away from the nearest player, jinking a little
      if (e.turnCd <= 0) {
        e.yaw = Math.atan2(e.x - tp.pos.x, e.z - tp.pos.z) + (Math.random() - 0.5) * 0.8;
        e.swimVy = (Math.random() - 0.5) * 1.2; e.turnCd = 0.4;
      }
      speed = sp.flee;
    } else {
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 1.5 + Math.random() * 3.5;
        e.state = Math.random() < 0.25 ? 'idle' : 'wander';
        e.yaw += (Math.random() - 0.5) * 2.2;
        e.swimVy = sp.bottom ? -0.25 : (Math.random() - 0.5) * 0.7;
        const hdx = e.hx - e.x, hdz = e.hz - e.z;             // a short leash: a school stays a school
        if (Math.hypot(hdx, hdz) > 48) e.yaw = Math.atan2(hdx, hdz);
      }
      speed = e.state === 'idle' ? sp.speed * 0.15 : sp.speed;
    }
    const sx = Math.sin(e.yaw) * speed * dt, sz = Math.cos(e.yaw) * speed * dt;
    if (_fishWet(e, e.x + sx, e.y, e.z + sz)) { e.x += sx; e.z += sz; }
    else if (e.turnCd <= 0) { e.yaw += Math.PI * (0.6 + Math.random() * 0.8); e.turnCd = 0.35; }
    // up and down: it never breaks the surface, and bounces gently off the bed
    const ny = e.y + e.swimVy * dt;
    if (_fishWet(e, e.x, ny, e.z)) e.y = ny; else e.swimVy = -e.swimVy * 0.5;
    if (e.kx || e.kz) {                                     // a hit's knockback, spent in the water
      const kdx = e.kx * dt, kdz = e.kz * dt;
      if (_fishWet(e, e.x + kdx, e.y, e.z + kdz)) { e.x += kdx; e.z += kdz; }
      const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
    }
    if (waterFlowVec(Math.floor(e.x), Math.floor(e.y + H * 0.5), Math.floor(e.z), _flowV)) {
      const fdx = _flowV.x * 1.2 * dt, fdz = _flowV.z * 1.2 * dt;
      if (_fishWet(e, e.x + fdx, e.y, e.z + fdz)) { e.x += fdx; e.z += fdz; }
    }
    e.walk += (1.5 + speed * 1.6) * dt;
  } else {
    // stranded: it falls, flops, and slowly suffocates
    e.vy = Math.max(-34, e.vy - ENT_GRAVITY * dt);
    const ny = e.y + e.vy * dt;
    if (_entBlocked(e.x, ny, e.z)) { if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; } e.vy = 0; }
    else { e.y = ny; e.onGround = false; }
    if (e.onGround && e.jumpCd <= 0) {
      e.jumpCd = 0.5 + Math.random() * 0.9;
      e.vy = 3 + Math.random() * 2;
      e.yaw += (Math.random() - 0.5) * 2;
      e.kx = Math.sin(e.yaw) * 1.4; e.kz = Math.cos(e.yaw) * 1.4;
    }
    if (e.kx || e.kz) {
      const kdx = e.kx * dt, kdz = e.kz * dt;
      if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
      if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
      const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt); e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
    }
    e.dryT = (e.dryT || 0) + dt;
    if (e.dryT > FISH_DRY_GRACE) {
      e.hazCd -= dt;
      if (e.hazCd <= 0) {
        e.hazCd = FISH_DRY_EVERY;
        e.hp -= 1; e.hurtT = 0.25;
        if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return true; }
      }
    }
    e.walk += 12 * dt;
  }
  // lava is lava
  if ((getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255) === B.LAVA) {
    if (!player.canFly) _entDropLoot(e);
    _removeEntity(i); return true;
  }
  /* ---- visuals: the tail beats faster the faster it swims, the body counter-sways, it pitches with
     the dive, and stranded it lies on its side thrashing ---- */
  const m = e.model;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.yaw;
  const beat = Math.sin(e.walk * 3);
  const wag = inWater ? beat * (0.25 + Math.min(0.35, speed * 0.07)) : beat * 0.7;
  m.tail.rotation.y = wag;
  m.swim.rotation.y = -wag * 0.25;
  m.swim.rotation.x = inWater ? -Math.max(-0.5, Math.min(0.5, e.swimVy * 0.5)) : 0;
  m.swim.rotation.z = inWater ? 0 : Math.PI / 2 * 0.92;
  m.swim.position.y = (inWater ? 3 * sp.body[1] : 2 * sp.body[0] * sp.head[0]) * PX;
  m.fins[0].rotation.y = 0.3 + Math.sin(e.walk * 2) * 0.25;
  m.fins[1].rotation.y = -0.3 - Math.sin(e.walk * 2) * 0.25;
  shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0);
  return false;
}

function _zombieBurnTick(e, dt) {
  const hx = Math.floor(e.x), hz = Math.floor(e.z);
  const wet = (getBlock(hx, Math.floor(e.y + 0.4), hz) & 255) === B.WATER;
  const lit = isBurningDaylight() && !wet && getSkyWorld(hx, Math.floor(e.y + 1.5), hz) >= 15;
  if (!lit) {
    e.sunT = 0;
    if (e.burnT > 0) e.burnT = Math.max(0, e.burnT - dt * 2);
    return false;
  }
  e.sunT += dt;
  if (e.sunT < ZOMBIE_BURN_GRACE) return false;
  e.burnT = 0.5;
  e.hp -= ZOMBIE_BURN_DPS * dt;
  if (e.hp > 0) return false;
  if (!player.canFly) _entDropLoot(e);       // no XP: the sun did it, not the player
  return true;
}

/* Swing pacing is PER PLAYER, so it ticks inside each player's own context rather than once for
   the world — see the per-player pass in 22-main-loop.js. */
function updateAttackCooldown(dt) {
  if (_atkCooldown > 0) _atkCooldown -= dt;
  // swapping hotbar slot / item re-arms the full bare-hand delay
  const heldNow = slotId(HOTBAR[hotbarSel]);
  if (heldNow !== _lastHeldForAtk) {
    if (_lastHeldForAtk !== undefined) _atkCooldown = Math.max(_atkCooldown, HAND_ATTACK_TIME);
    _lastHeldForAtk = heldNow;
  }
}

function updateEntities(dt) {
  if (!playing || menuScene || !anyPlayerSpawned()) return;
  _updatePlayerKick(dt);

  for (let i = ENTITIES.length - 1; i >= 0; i--) {
    const e = ENTITIES[i];
    _useBox(e);                                        // every collision test below uses ITS box
    if (e.y < -30) { _removeEntity(i); continue; }     // fell out of the world: genuinely gone
    if (e._killedByMob) { _removeEntity(i); continue; }   // killed by another creature: nothing drops (0.7912)
    /* TWO RADII (0.712). Visibility follows the GENERATION radius — if the chunk is loaded, the
       mob is drawn, standing still, exactly where it was. Simulation follows the much smaller
       `simDist`: outside it the mob is skipped by every per-frame system (`active` is what
       _separateBodies reads) even though you can still see it in the distance.

       That split is the point of the change. A render distance of 32 draws ~4000 chunks, and
       stepping mobs through all of them was pure waste when the player can only reach the
       nearest handful. A parked mob resumes mid-stride the moment it comes back in range. */
    const ecx = Math.floor(e.x / 16), ecz = Math.floor(e.z / 16);
    const ec = getChunk(ecx, ecz);
    const loaded = !!(ec && ec.data);
    if (e.model.root.visible !== loaded) e.model.root.visible = loaded;
    const sim = loaded && inSimRangeChunk(ecx, ecz);
    /* WAKE-UP AUDIT. The moment a parked mob starts simulating again, check it is somewhere it
       can actually live. A mob embedded in solid blocks — walled in by a player build, buried by
       falling gravel, or in a pocket the world has since closed — is removed rather than left
       twitching inside a wall forever. Runs once per entity per wake-up, not per frame. */
    if (sim && e.active === false && !isClaimed(e) && _entBlocked(e.x, e.y, e.z)) { _removeEntity(i); continue; }
    /* Frozen zombies never reach _zombieBurnTick, so daybreak would leave a ring of them parked
       out at the render edge waiting to combust the moment the player walked over. Sweep them at
       dawn instead — the sun reached them too, it just had nobody to show. */
    // ...and anything it was carrying is left behind rather than deleted with it
    if (!sim && isNightMob(e) && isBurningDaylight()) { _mobDropHeld(e); _removeEntity(i); continue; }
    if (!sim) { e.active = false; continue; }
    e.active = true;
    // hunger drains for every simulating entity; only the horse acts on it (see _updateGrazer)
    e.hunger = Math.max(0, entHunger(e) - ENT_HUNGER_DECAY * dt);
    if (e.milkCd > 0) e.milkCd -= dt;                  // a milked cow refills (0.767, 39-taming.js)
    // a hit is noticed as hp lower than last tick; healing never restarts the no-damage clock (0.757)
    if (e._hpSeen != null && e.hp < e._hpSeen) e._calmT = 0; else e._calmT = (e._calmT || 0) + dt;
    if (e.kind !== 'horse') {
      const maxHp = entMaxHp(e);
      if (e.hp > 0 && e.hp < maxHp && e._calmT >= ENT_REGEN_DELAY && entHunger(e) > 0) {
        e._regenT = (e._regenT || 0) + dt;
        if (e._regenT >= ENT_REGEN_EVERY) {
          e._regenT = 0;
          e.hp = Math.min(maxHp, e.hp + 1);
          e.hunger = Math.max(0, entHunger(e) - ENT_REGEN_COST);
        }
      } else e._regenT = 0;
    }
    e._hpSeen = e.hp;
    /* THE mob's target is whichever player is nearest right now (0.72). Everything below reads
       `tp` instead of the active-context `player`, because entities tick once for the world, not
       once per viewport — a mob must not chase whoever happens to be mid-render. */
    const tp = nearestPlayerTo(e.x, e.z);
    const pdx = tp.pos.x - e.x, pdz = tp.pos.z - e.z;
    const pdy = tp.pos.y - e.y;
    const distXZ = Math.hypot(pdx, pdz);

    /* STUCK WATCHDOG. `wantMove` is set by the movement blocks below: it means the mob asked to
       walk this tick. If it asks and asks and never actually moves, it is wedged — a one-block
       hole it fell into, a crevice, a pocket a build sealed around it — and no amount of further
       ticking will free it, so it is removed. Only ever out of sight (>16 blocks): nothing is
       allowed to blink out while you are looking at it. */
    if (e._px !== undefined && e.wantMove) {
      const dx2 = e.x - e._px, dz2 = e.z - e._pz;
      if (dx2 * dx2 + dz2 * dz2 < 1e-6) {
        e.stuckT = (e.stuckT || 0) + dt;
        if (e.stuckT > ENT_STUCK_TIME && distXZ > 16 && !isClaimed(e)) { _fxEntGone(e); _removeEntity(i); continue; }
      } else e.stuckT = 0;
    } else e.stuckT = 0;
    e._px = e.x; e._pz = e.z;

    if (e.hurtT > 0) e.hurtT -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.jumpCd > 0) e.jumpCd -= dt;
    if (isGrazer(e)) { _updateGrazer(e, dt, pdx, pdz, distXZ, i); continue; }
    if (isFish(e)) { _updateFish(e, dt, tp, i); continue; }   // 0.805
    /* ---- night mobs: claw out of the ground, hunt on sight, burn at dawn ---- */
    if (isNightMob(e)) {
      if (e.riseT > 0) {
        // Emerging. The body is already at its final position; only the MODEL is sunk, so the
        // terrain it is rising through hides the buried half for free.
        e.riseT -= dt;
        const sunk = ENT_H * Math.max(0, e.riseT / ZOMBIE_RISE_TIME);
        e.model.root.position.set(e.x, e.y - sunk, e.z);
        e.model.root.rotation.y = e.yaw;
        // arms up out of the soil first, legs still
        animateHumanoid(e.model, 0, 0, 0);
        e.model.armR.rotation.x = e.model.armL.rotation.x = -2.4;
        shadeHumanoid(e.model, e.x, e.y, e.z, false, false);
        continue;                                    // no AI, no gravity, no damage while rising
      }
      if (_zombieBurnTick(e, dt)) { _fxEntGone(e, true); _removeEntity(i); continue; }
      if (e.burnT > 0) e.burnT -= dt;
      // Always hostile inside the hunting radius; creative flight and death call it off.
      if (!tp.canFly && !tp.dead && distXZ <= ZOMBIE_CHASE_RANGE) e.state = 'chase';
      else if (e.state === 'chase') e.state = 'wander';
      // a skeleton shows what it is holding the moment it is out of the ground
      if (e.kind === 'skeleton')
        setMobHeld(e, e.arm === 'bow' ? ITEM.BOW : e.arm === 'sword' ? ITEM.FLINT_SWORD : null);
      // a zombie comes up empty-handed and scavenges: anything dropped near it is fair game
      if (e.kind === 'zombie') {
        e.pickCd = (e.pickCd || 0) - dt;
        if (e.pickCd <= 0) { e.pickCd = MOB_PICKUP_CD; _mobTryPickup(e, ZOMBIE_DMG); }
      }
    }
    if (tp.canFly && (e.aggroT > 0 || e.state === 'chase')) {
      e.aggroT = 0; e.thinkT = 0; e.state = 'wander';   // switching to creative calls off the fight
    }
    if (e.aggroT > 0) {
      e.aggroT -= dt;
      if (e.aggroT <= 0 || distXZ > ENT_AGGRO_RANGE) { e.aggroT = 0; e.state = 'wander'; }
    }
    /* ---- who it is fighting (0.7912) ----
       A monster or a villager with a creature to fight chases THAT; everything below, up to the swing,
       reads its target through tg*, which is the foe when there is one and the player otherwise — so
       the chase, the aim, the reach and the blow are one code path for both. A villager whose fight
       with a monster ends goes back to its day, unless a player has provoked it meanwhile. */
    const foe = _entFoe(e, tp, distXZ, dt);
    if (foe) { e.state = 'chase'; e._foeChase = true; }
    else if (e._foeChase) { e._foeChase = false; if (e.kind === 'npc' && !(e.aggroT > 0)) e.state = 'wander'; }
    const tgX = foe ? foe.x : tp.pos.x, tgY = foe ? foe.y : tp.pos.y, tgZ = foe ? foe.z : tp.pos.z;
    const tgDx = tgX - e.x, tgDz = tgZ - e.z, tgDy = tgY - e.y, tgDist = Math.hypot(tgDx, tgDz);
    const tgDead = foe ? foe.hp <= 0 : tp.dead;
    const tgReach = entAttackRange(e, foe ? { R: entR(foe) } : tp);
    const tgEye = foe ? 1.62 : (tp.EYE || 1.62);

    /* ---- water state: drives escape steering, swimming and current drift ---- */
    const inWater = (getBlock(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z)) & 255) === B.WATER;

    /* ---- decide a heading ---- */
    let moveSpeed = 0;
    /* An archer walks one way and looks another — it gives ground while still aiming at you — so
       the model's facing is allowed to come apart from the travel heading for one tick. Cleared
       every frame: anything that does not set it walks the way it faces, as before. */
    e.faceYaw = null;
    /* Monsters have no sense of danger (0.7574): a hunting zombie or skeleton keeps coming straight
       through water after you instead of breaking off to swim ashore, and (see `bad` below) walks
       off ledges and into lava without a second look. Only a monster with nothing to chase swims
       for the shore. */
    const mindless = isNightMob(e);
    const huntingInWater = inWater && mindless && e.state === 'chase' && !tgDead;
    if (inWater && !huntingInWater) {
      // Swim straight for the nearest dry land. The heading is latched for a moment so a mob
      // can't re-pick a direction every frame (that was the spin-in-place bug), and water is no
      // longer treated as an obstacle here — otherwise every step was "blocked" and it froze.
      e.escapeT -= dt;
      if (e.escapeT <= 0) {
        e.escapeT = 0.8;
        let best = null, bestD = Infinity;
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          for (let r = 2; r <= 8; r++) {
            const tx = Math.floor(e.x + Math.sin(ang) * r), tz = Math.floor(e.z + Math.cos(ang) * r);
            const sy = surfaceY(tx, tz);
            const st = getBlock(tx, sy, tz) & 255;
            if (st === B.WATER || st === B.AIR || st === B.LAVA) continue;
            if (sy + 1 > e.y + 3) continue;                 // can't climb out onto a cliff
            if (r < bestD) { bestD = r; best = ang; }
            break;
          }
        }
        if (best !== null) e.yaw = best;
        else if (e.escapeT >= 0.8) e.yaw += 1.2;            // no shore found: sweep slowly, no spin
      }
      moveSpeed = ENT_SPEED;
      e.state = 'wander';
    } else if (e.thinkT > 0) {
      // just got hit: stand still and process it for a beat before turning and swinging back
      e.thinkT -= dt;
      moveSpeed = 0;
    } else if (e.kind === 'skeleton' && e.arm === 'bow' && e.ammo > 0 && e.state === 'chase' && !tgDead) {
      /* ---- archer: fights at range ----
         It closes only until it has a clear shot, gives ground when you crowd it, and stands
         perfectly still while the string is back — a drawing skeleton is a stationary one, which
         is what makes charging it the right answer. Behind a wall it keeps walking rather than
         firing into the stone. */
      const aimY = tgY + tgEye * 0.6;
      const los = hasLineOfSight(e.x, e.y + 1.45, e.z, tgX, aimY, tgZ);
      e.faceYaw = Math.atan2(tgDx, tgDz);
      if (e.shootCd > 0) e.shootCd -= dt;
      if (tgDist > SKEL_SHOOT_RANGE || !los) {
        e.yaw = e.faceYaw; moveSpeed = SKEL_CHASE_SPEED; e.drawT = 0;
      } else if (tgDist < SKEL_KEEP_DIST) {
        e.yaw = e.faceYaw + Math.PI; moveSpeed = SKEL_SPEED; e.drawT = 0;
        /* Cornered. An archer with its back to a wall cannot retreat and must not stand there
           being free damage, so at arm's length it swings the bow instead — bare-bones damage,
           not a sword's, and it still refuses to shoot from inside your face. */
        if (tgDist < tgReach && Math.abs(tgDy) < 2 && e.atkCd <= 0) {
          e.atkCd = ENT_ATTACK_CD;
          e.atkAnimT = ENT_ATK_ANIM;
          moveSpeed = 0;
          if (foe) _mobHitsMob(e, foe, SKEL_DMG_HANDS, tgDx, tgDz, tgDist);   // a villager in its face (0.7912)
          else {
            const blocked = typeof shieldBlock === 'function' && shieldBlock(tp, e.x, e.z, SKEL_DMG_HANDS);
            if (!blocked) {
              tp.hp -= SKEL_DMG_HANDS;
              tp._dmgCause = `was slain by a ${e.name}`;
            }
            const mlen = distXZ || 1;
            const kick = playerKick(tp);
            const kbMul = (1 - (typeof playerKnockbackResist === 'function'
                                ? withPlayer(tp, playerKnockbackResist) : 0)) * (blocked ? SHIELD_KNOCK_MUL : 1);
            kick.x = pdx / mlen * PLY_KNOCK * 0.7 * kbMul;
            kick.z = pdz / mlen * PLY_KNOCK * 0.7 * kbMul;
          }
        }
      } else {
        e.yaw = e.faceYaw;
        if (e.shootCd <= 0) {
          e.drawT += dt;
          if (e.drawT >= SKEL_DRAW_TIME) {
            e.drawT = 0;
            e.shootCd = SKEL_SHOOT_CD;
            e.ammo--;
            mobShoot(e, foe ? _entAimTarget(foe) : tp, { ammoId: e.ammoId, dmg: SKEL_ARROW_DMG, speed: SKEL_ARROW_SPEED });
            // quiver empty: it comes at you with what is left of it
            if (e.ammo <= 0) { e.arm = 'hands'; e.dmg = SKEL_DMG_HANDS; setMobHeld(e, null); }
          }
        }
      }
    } else if (e.state === 'chase' && !tgDead) {
      e.yaw = Math.atan2(tgDx, tgDz);
      moveSpeed = e.kind === 'zombie' ? ZOMBIE_CHASE_SPEED
                : e.kind === 'skeleton' ? SKEL_CHASE_SPEED : ENT_CHASE_SPEED;
      if (tgDist < tgReach && Math.abs(tgDy) < 2 && e.atkCd <= 0) {
        e.atkCd = ENT_ATTACK_CD;
        e.atkAnimT = ENT_ATK_ANIM;                 // arm chops through on the hit
        moveSpeed = 0;
        // another creature: it takes the blow, and none of the player's shield or knockback applies (0.7912)
        if (foe) { _mobHitsMob(e, foe, e.dmg || ENT_ATTACK_DMG, tgDx, tgDz, tgDist); }
        else {
        // a raised shield facing the blow stops it outright (40-shield.js)
        const blocked = typeof shieldBlock === 'function' && shieldBlock(tp, e.x, e.z, e.dmg || ENT_ATTACK_DMG);
        if (!blocked) {
          tp.hp -= (e.dmg || ENT_ATTACK_DMG);
          tp._dmgCause = `was slain by a ${e.name}`;
        }
        /* Knock the player back with the same decaying-velocity model the mobs use, minus
           whatever their armour set resists. Read inside `withPlayer(tp, ...)`: entities tick
           once for the WORLD, so the equipment globals belong to whichever seat happens to be
           installed — the resistance has to come from the player actually being hit. */
        const m = distXZ || 1;
        const kick = playerKick(tp);
        const kbMul = 1 - (typeof playerKnockbackResist === 'function'
                           ? withPlayer(tp, playerKnockbackResist) : 0);
        const kbShield = blocked ? SHIELD_KNOCK_MUL : 1;   // a blocked blow still shoves, a little
        kick.x = pdx / m * PLY_KNOCK * kbMul * kbShield;
        kick.z = pdz / m * PLY_KNOCK * kbMul * kbShield;
        if (!blocked && !tp.flying && Math.abs(tp.vy) < 0.5) tp.vy = PLY_KNOCK_HOP * kbMul;
        }
      }
    } else {
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 2 + Math.random() * 4;
        e.state = Math.random() < 0.35 ? 'idle' : 'wander';
        if (e.state === 'wander') e.yaw = Math.random() * Math.PI * 2;
      }
      const walkSpeed = e.kind === 'zombie' ? ZOMBIE_SPEED
                      : e.kind === 'skeleton' ? SKEL_SPEED : ENT_SPEED;
      moveSpeed = e.state === 'wander' ? walkSpeed : 0;
      // leash: outside its home radius the next heading always points back, so a mob can drift
      // around its spawn region but never migrates across the world
      const hdx = e.hx - e.x, hdz = e.hz - e.z;
      if (Math.hypot(hdx, hdz) > ENT_HOME_RANGE) {
        e.yaw = Math.atan2(hdx, hdz);
        e.state = 'wander';
        moveSpeed = walkSpeed;
      }
    }

    /* ---- horizontal move with a hop over 1-block steps ---- */
    let moved = 0;
    // getting knocked back briefly overrides walking, so a chasing mob can't immediately
    // stride back through its own knockback and cancel it out
    const stunned = (e.kx !== 0 || e.kz !== 0);
    e.wantMove = moveSpeed > 0 && !stunned;      // read by the stuck watchdog next tick
    if (moveSpeed > 0 && !stunned) {
      moveSpeed *= boxDragMul(e.x, e.y, e.z, _boxR, _boxH);  // leaves/litter -40%, snow -70%
      const sx = Math.sin(e.yaw) * moveSpeed * dt;
      const sz = Math.cos(e.yaw) * moveSpeed * dt;
      // while swimming, water is the medium rather than an obstacle; a monster never checks hazards
      const bad = (nx, nz) => _entBlocked(nx, e.y, nz) || (!inWater && !mindless && _entHazard(nx, e.y, nz));
      let blocked = false;
      if (!bad(e.x + sx, e.z)) { e.x += sx; moved += Math.abs(sx); } else blocked = true;
      if (!bad(e.x, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else blocked = true;
      // a wall it could clear by stepping up one block: jump instead of grinding into it
      if (blocked && (e.onGround || inWater) && e.jumpCd <= 0 && !_entBlocked(e.x + sx, e.y + 1, e.z + sz)) {
        e.vy = ENT_JUMP; e.jumpCd = 0.6; e.onGround = false;
      } else if (blocked && e.state !== 'chase' && !inWater) {
        // re-roll on the wander timer, never every frame — that produced a fast spin in place
        if (e.turnCd <= 0) { e.yaw = Math.random() * Math.PI * 2; e.turnCd = 0.5; }
      }
    }
    if (e.turnCd > 0) e.turnCd -= dt;

    /* ---- current drift: flowing water carries a mob along, same as the player and drops ---- */
    if (inWater && waterFlowVec(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z), _flowV)) {
      const fdx = _flowV.x * 1.9 * dt, fdz = _flowV.z * 1.9 * dt;
      if (!_entBlocked(e.x + fdx, e.y, e.z)) e.x += fdx;
      if (!_entBlocked(e.x, e.y, e.z + fdz)) e.z += fdz;
    }

    /* ---- knockback slide: decays away instead of snapping the position ---- */
    if (e.kx || e.kz) {
      const kdx = e.kx * dt, kdz = e.kz * dt;
      if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
      if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
      const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt);
      e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) { e.kx = 0; e.kz = 0; }
    }

    /* ---- environmental damage: lava burns, cactus pricks, deep water drowns ---- */
    if (e.hazCd > 0) e.hazCd -= dt;
    const feetId = getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255;
    const headId = getBlock(Math.floor(e.x), Math.floor(e.y + 1.5), Math.floor(e.z)) & 255;
    let touchCactus = false;
    for (const [cx2, cz2] of [[1,0],[-1,0],[0,1],[0,-1]])
      if ((getBlock(Math.floor(e.x) + cx2, Math.floor(e.y + 0.9), Math.floor(e.z) + cz2) & 255) === B.CACTUS)
        { touchCactus = true; break; }
    if (e.hazCd <= 0) {
      let dmg = 0;
      if (feetId === B.LAVA || headId === B.LAVA) dmg = ENT_LAVA_DMG;
      else if (feetId === B.CACTUS || touchCactus) dmg = ENT_CACTUS_DMG;
      if (dmg > 0) {
        e.hazCd = ENT_HAZARD_CD;
        e.hurtT = 0.25;
        e.hp -= dmg;
        if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); continue; }
      }
    }
    if (headId === B.WATER) {
      e.airT -= dt;
      if (e.airT <= 0) {
        e.airT = 1;                                   // one drown tick per second once out of air
        e.hurtT = 0.25;
        e.hp -= ENT_DROWN_DMG;
        if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); continue; }
      }
    } else e.airT = ENT_AIR_MAX;

    /* ---- gravity + ground ---- */
    // Resting on a floor is a hard stop: don't integrate gravity at all, or the mob spends every
    // frame falling a hair and being snapped back up (the shake).
    const wasGround = e.onGround;
    const standing = !inWater && e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z);
    if (standing) {
      e.y = Math.floor(e.y - 0.02) + 1;                  // seat exactly on the block top
      e.vy = 0;
      e.onGround = true;
    } else {
      e.vy -= ENT_GRAVITY * dt;
      if (e.vy < -34) e.vy = -34;
      const ny = e.y + e.vy * dt;
      if (_entBlocked(e.x, ny, e.z)) {
        if (e.vy < 0) {
          e.y = Math.floor(ny) + 1;                      // land on the block top
          e.onGround = true;
        }
        e.vy = 0;
      } else {
        e.y = ny;
        e.onGround = false;
      }
    }
    if (_entFallDamage(e, i, wasGround, inWater)) continue;   // in updateEntities' own loop
    // Swimming: buoyancy holds the mob at the surface, but it must never CLAMP an active climb
    // — the old unconditional Math.min pulled a fresh hop straight back down to 4.2.
    if (inWater) {
      if (e.vy < 4.2) e.vy = Math.min(e.vy + 40 * dt, 4.2);
      e.onGround = false;
      // Right at the edge of land, climb straight onto the ledge. Probing a real standing
      // height (not just y+1) is what makes this work at a shoreline.
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      const ax = e.x + fx * 0.6, az = e.z + fz * 0.6;
      if (e.jumpCd <= 0 && _entBlocked(ax, e.y, az)) {
        const ty = _stepUpTarget(e, ax, az);
        if (ty !== null) { e.y = ty; e.x = ax; e.z = az; e.vy = 1.5; e.jumpCd = 0.3; }
      }
    }

    /* ---- visuals ---- */
    if (e.atkAnimT > 0) e.atkAnimT -= dt;
    if (e.flailT > 0) e.flailT -= dt;
    const spd = moved / Math.max(dt, 1e-4);
    entityStepSound(e, dt, spd);
    let swing = Math.min(spd / 4.5, 1) * 0.75;
    // taking a hit thrashes the limbs through the walk cycle even when standing still
    if (e.flailT > 0) {
      e.walk += 11 * dt;
      swing = Math.max(swing, 0.85);
    } else {
      e.walk += Math.min(spd, 9) * dt * 2.2;
    }
    const m = e.model;
    m.root.position.set(e.x, e.y, e.z);
    // model faces +Z; yaw is measured the same way. An archer backing away keeps facing its shot.
    m.root.rotation.y = e.faceYaw != null ? e.faceYaw : e.yaw;
    // aggroed mobs stare at the player
    const lookPitch = e.state === 'chase'
      ? Math.max(-0.7, Math.min(0.7, -Math.atan2(pdy + 1.2, Math.max(distXZ, 0.1)) * 0.8)) : 0;
    /* A drawing mob poses from the SAME animateHumanoid draw as a drawing player, and reveals
       the arrow it actually has nocked — so multi-ammo weapons show what is about to hit you. */
    const drawP = (e.drawT > 0 && e.arm === 'bow') ? Math.min(1, e.drawT / SKEL_DRAW_TIME) : 0;
    animateHumanoid(m, e.walk, swing, lookPitch, Math.max(0, e.atkAnimT) / ENT_ATK_ANIM,
                    drawP > 0 ? { draw: drawP } : undefined);
    /* Every frame, for every skeleton — NOT only the bow-armed ones (0.7351). A shooter that
       empties its quiver drops to `hands`, and skipping this call then left the last nocked
       arrow floating in the fist of a mob that has no bow any more. */
    if (e.kind === 'skeleton')
      poseModelNock(m, e.arm === 'bow' ? e.ammoId : null, e.arm === 'bow' ? drawP : 0);
    // zombies hold both arms out in front; the attack chop still wins when it is swinging
    if (e.kind === 'zombie' && e.atkAnimT <= 0) {
      const sway = Math.sin(e.walk * 0.6) * 0.09;
      m.armR.rotation.x = -1.55 + sway;  m.armL.rotation.x = -1.55 - sway;
      m.armR.rotation.z = 0.06;          m.armL.rotation.z = -0.06;
    }
    shadeHumanoid(m, e.x, e.y, e.z, e.hurtT > 0, e.burnT > 0);
  }
  _separateBodies(dt);
  _useBox(null);                // spawn checks and everything else outside the loop: humanoid box
}
