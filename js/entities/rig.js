'use strict';
/* entities/rig.js: the model kit creatures and players are built with. The light a body stands in (_lightAt), box
   UVs (_skinUV, _part, _limb), and the humanoid rig: building, animating and shading it. */

/* voxiGrof — humanoid entities + third-person camera

   The player and the wandering NPCs share one model builder: a Minecraft-layout 64x64 skin
   (textures/Entity/Human/player.png) mapped onto six boxes with per-face UVs. Limbs hang off pivot
   groups so a single walk phase drives the swing.

   NPCs are NEUTRAL: they wander until something hurts them, then they chase and hit back.
   Each carries a small randomly-rolled survival inventory that spills on death, on top of a
   guaranteed loot entry. */

/* ================================ skin + model ================================ */
const SKIN_PX = 64;                                  // skin is 64x64
const MODEL_PX = 32;                                 // model is 32px tall (head 8 + body 12 + legs 12)
const PX = 1.8 / MODEL_PX;                           // world units per skin pixel (player.H = 1.8)

const _skinTex = new THREE.TextureLoader().load('textures/Entity/Human/player.png');
_skinTex.colorSpace = THREE.SRGBColorSpace;
_skinTex.magFilter = THREE.NearestFilter;
_skinTex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
_skinTex.generateMipmaps = true;
// Every humanoid owns its material so it can be lit (and hurt-flashed) independently. The skin
// is a MeshBasicMaterial — it never sees the world shader's lighting — so brightness is baked
// into the material colour each frame from the sky/block light at the entity's own cell.
function _newSkinMat() {
  return new THREE.MeshBasicMaterial({ map: _skinTex, transparent: true, alphaTest: 0.5 });
}
const _HURT_COL = new THREE.Color(0xff6a6a).convertSRGBToLinear();
const _BURN_COL = new THREE.Color(0xff8a2a).convertSRGBToLinear();   // sunlight scorch on a zombie
/* Zombie skin (textures/Entity/Zombie/zombie.png): the player sheet with every skin tone pushed to
   green and the eye pixels blacked out, so the rig, UVs and animation are shared unchanged. */
const _zombieTex = new THREE.TextureLoader().load('textures/Entity/Zombie/zombie.png');
_zombieTex.colorSpace = THREE.SRGBColorSpace;
_zombieTex.magFilter = THREE.NearestFilter;
_zombieTex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
_zombieTex.generateMipmaps = true;
function _newZombieMat() {
  return new THREE.MeshBasicMaterial({ map: _zombieTex, transparent: true, alphaTest: 0.5 });
}
/* Skeleton skin (textures/Entity/Monsters/skeleton.png): the same six-box layout at DOUBLE the zombie's
   resolution — a 128x128 sheet instead of 64x64 — because a skull, a ribcage and a jaw full of
   teeth need pixels the zombie's flat green never did. The UV math is proportional (regions are
   fractions of the sheet), so the rig, _skinUV and every animation work unchanged; only the
   texture is finer. */
const _skeletonTex = new THREE.TextureLoader().load('textures/Entity/Monsters/skeleton.png');
_skeletonTex.colorSpace = THREE.SRGBColorSpace;
_skeletonTex.magFilter = THREE.NearestFilter;
_skeletonTex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
_skeletonTex.generateMipmaps = true;
function _newSkeletonMat() {
  return new THREE.MeshBasicMaterial({ map: _skeletonTex, transparent: true, alphaTest: 0.5 });
}
/* Mummy skin (textures/Entity/Zombie/mummy.png, drawn by toolsrc/mummy-tex.js): a zombie in the desert, wrapped in old
   linen. The zombie's layout at the skeleton's double resolution (128x128), so the same rig takes it. */
const _mummyTex = new THREE.TextureLoader().load('textures/Entity/Zombie/mummy.png');
_mummyTex.colorSpace = THREE.SRGBColorSpace;
_mummyTex.magFilter = THREE.NearestFilter;
_mummyTex.minFilter = THREE.NearestMipmapLinearFilter;   // mipmapped
_mummyTex.generateMipmaps = true;
function _newMummyMat() {
  return new THREE.MeshBasicMaterial({ map: _mummyTex, transparent: true, alphaTest: 0.5 });
}
const ENT_WATER_DARK = 0.55;                 // a creature's light under water
// light at a cell -> 0..1 brightness, matching the world shader's day/night response
function _lightAt(x, y, z) {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const sky = getSkyWorld(bx, by, bz) / 15;
  const blk = getLightWorld(bx, by, bz) / 15;
  const amb = sharedUniforms.uAmbient.value, dir = sharedUniforms.uDirect.value;
  /* dimmed by the light's own colour as the ground is (the night's blue light is darker than day's white),
     so a creature at night is as dark as the ground it stands on, not twice as bright. */
  const lc = sharedUniforms.uLightColor.value, luma = 0.3 * lc.r + 0.59 * lc.g + 0.11 * lc.b;
  // the world shader's own sky curve since 0.8242 (skyF, 04-materials.js), so in a cave a creature is as lit as the rock
  const daylight = (amb + dir * sky) * (SKY_FLOOR + (1 - SKY_FLOOR) * sky * sky) * luma;   // SKY_FLOOR (00-config.js)
  /* A creature never goes fully to the dark: a little glow of its own, a little more under a bright moon,
     so it can still be made out. A third of what it was since 0.8241 (0.3 + 0.12 under a full moon). */
  const floor = 0.1 + 0.05 * (typeof _skyMoonGlow === 'number' ? _skyMoonGlow : 0);
  const b = Math.min(1, Math.max(floor, Math.max(daylight, blk * 0.95)));   // floor tracked skyF (0.24) before 0.8191
  // under water it is darker, as the water around it looks: fish, and anyone swimming
  return (getBlock(bx, by, bz) & 255) === B.WATER ? b * ENT_WATER_DARK : b;
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
/* The head, chest and arms hang off a TORSO group pivoted at the hips rather than
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
    // ...and the LEFT arm, for something carried in the offhand that is not a shield: a torch
    if (opts.holdL) {
      m.armL.rotation.x -= 1.05 + pitch * 0.45;
      m.armL.rotation.z = 0.18;
    }
    // sneaking tucks the arms in slightly, the way a crouch does
    if (lean > 0.01) { m.armR.rotation.z -= 0.10; m.armL.rotation.z += 0.10; }
  }
  /* Drawing a bow. `draw` is 0..1 — the bow arm comes up straight along the line of
     sight first, then the string hand hauls back past the jaw as the draw fills. Shared by the
     player's own body and by every mob that can shoot, so a skeleton at full draw and a player
     at full draw are the same silhouette. */
  const drw = (opts && opts.draw) || 0;
  if (drw > 0) {
    const r = Math.min(1, drw * 3);                   // arms are up well before the string is back
    /* The RIGHT arm is the bow arm — it holds the weapon, and every held-item rig in the game
       (the player's _selfHeld, a mob's heldGrp, the first-person hand) hangs off armR, so the
       bow ends up in the hand that is actually presenting it. */
    /* both arms turn IN, toward the middle of the body, where the bow and the string are (their z and the
       string arm's yaw had the wrong sign: the arms splayed outward. Right arm inward is +z, left arm inward -z, as
       eating and blocking have it). */
    m.armR.rotation.x = (-Math.PI / 2 + pitch - lean) * r;
    m.armR.rotation.z = 0.26 * r;
    // the left is the string hand: alongside the bow at first, hauled back to the cheek at full draw
    m.armL.rotation.x = (-Math.PI / 2 + pitch - lean) * r + 0.30 * drw;
    m.armL.rotation.z = -(0.28 + 0.5 * drw) * r;
    m.armL.rotation.y = 0.35 * drw;
  }
  /* Blocking. The LEFT arm comes up in front of the chest and in across the body, carrying
     the offhand shield (40-shield.js poseBodyOffhand) between the body and whatever it faces.
     Negative z swings the left hand inward — the same convention the zombie pose uses. */
  const blk = (opts && opts.block) || 0;
  if (blk > 0) {
    m.armL.rotation.x = m.armL.rotation.x * (1 - blk) + (-1.2 + pitch * 0.5 - lean) * blk;
    m.armL.rotation.z = -0.55 * blk;
    m.armL.rotation.y = 0;
  }
  // ...and the RIGHT arm, for a shield in the main hand; positive z swings it inward
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
    /* A material may carry its own tint in userData — the sheep's fleece does, so one
       white sheet can be any colour of wool. Lighting is multiplied INTO the tint, never
       written over it, or every dyed sheep would wash back to white the first frame it moved. */
    else if (mat.userData && mat.userData.tint) {
      const t = mat.userData.tint;
      mat.color.setRGB(t.r * b, t.g * b, t.b * b);
    }
    else mat.color.setScalar(b);
  }
}
