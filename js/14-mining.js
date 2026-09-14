'use strict';
/* voxiGrof — selection highlight + survival mining crack overlay */

/* ---------------------------------- selection highlight ---------------------------------- */
const selBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
selBox.visible = false;
selBox.renderOrder = 3;
selBox.layers.set(1);                       // never casts a shadow
scene.add(selBox);

/* ---------------------------------- mining crack overlay ----------------------------------
   Survival-only progressive mining: while LMB / RT is held on a breakable block, the crack
   texture grows from the block's centre out to its edges. Elapsed vs. hardness drives the
   stage, hitting hardness breaks the block. Switching target resets progress.

   Ten authored stage textures (textures/Cracks/destroy_stage_0..9.png) drive the overlay —
   progress picks one, and the material's map is swapped to it. Loaded once up front so the
   first block mined doesn't flash an untextured box. */
const CRACK_STAGES = 10;
const crackTextures = [];
{
  const loader = new THREE.TextureLoader();
  for (let i = 0; i < CRACK_STAGES; i++) {
    const t = loader.load(`textures/Cracks/destroy_stage_${i}.png`);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    crackTextures.push(t);
  }
}
/* One material PER SEAT (0.734). The stage textures are shared — they are just images — but the
   material is what carries "which stage am I showing", and a single shared one made two players
   mining at once fight over it: each wrote its own stage every time its progress crossed 10%, so
   BOTH viewports flickered between the two stages several times a second. The mesh stays shared
   and is re-transformed per view; the render pass points it at the drawing seat's material.
   `var`, not `const`, because SWAP_KEYS reaches it through globalThis. */
function newCrackMat() {
  return new THREE.MeshBasicMaterial({
    map: crackTextures[0], transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
}
var crackMat = newCrackMat();
function drawCrack(progress) {
  const i = Math.max(0, Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES)));
  if (crackMat.map !== crackTextures[i]) { crackMat.map = crackTextures[i]; crackMat.needsUpdate = true; }
}
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), crackMat);
crackMesh.visible = false;
crackMesh.renderOrder = 2;
crackMesh.layers.set(1);
scene.add(crackMesh);
var mining = { active:false, x:0, y:0, z:0, elapsed:0, needed:0, stage:-1 };
function resetMining() {
  mining.active = false;
  mining.stage = -1;
  crackMesh.visible = false;
}


/* Wood and ground are slower to dig (0.756): the wood family (logs, planks, benches, chests, beds) and the
   ground family (dirt, sand, gravel, clay, grass blocks) take 1.5x as long. Stone, glass, snow and the
   rest are unchanged. Plants have no hardness, so they still break instantly. Read by the mining tick
   in 22-main-loop.js. */
const SOFT_MINE_MUL = 1.5;
const SOFT_MINE_TYPES = new Set(['wood', 'ground', 'grass']);
/* Furniture comes apart quicker than the wood it is made of (0.759): a crafting bench, chest or bed
   mines 1.6x faster than it did, so moving house is not a slog. */
const FURNITURE_MINE_FASTER = 1.6;
const FURNITURE_IDS = new Set([B.CRAFTING_BENCH, B.CHEST, B.BED, B.LADDER]);   // a ladder comes down like a bench (0.769)
function softBlockMineMul(id) {
  const mul = SOFT_MINE_TYPES.has(PROPS[id & 255]?.type) ? SOFT_MINE_MUL : 1;
  return FURNITURE_IDS.has(id & 255) ? mul / FURNITURE_MINE_FASTER : mul;
}

/* ---- a hoe on grass (0.757) ----
   Holding a hoe makes short and tall grass targetable (12-player.js raycast), and breaking one cuts a
   SQUARE of grass centred on it: flint 1x1 (just that plant), stone 3x3, iron 5x5, gold 5x5, diamond 9x9.
   A wider square also reaches one block up and down, so a field on a slope is cut too. Every plant cut
   yields what foraging it by hand yields (short grass one fiber roll, tall grass two) and costs the hoe
   1 durability; the cut stops the moment the hoe breaks. */
const HOE_GRASS = new Set([B.TALLGRASS, B.TALL_LOWER, B.TALL_UPPER]);
const HOE_WIDTH = {
  [ITEM.FLINT_HOE]: 1, [ITEM.STONE_HOE]: 3, [ITEM.IRON_HOE]: 5, [ITEM.GOLDEN_HOE]: 5, [ITEM.DIAMOND_HOE]: 9,
  [ITEM.BRONZE_HOE]: 7,                                            // 0.774
};
function heldHoeWidth() {
  if (typeof player === 'undefined' || player.canFly || typeof HOTBAR === 'undefined') return 0;
  return HOE_WIDTH[slotId(HOTBAR[hotbarSel])] || 0;
}
const hoeTargetsPlant = (id) => HOE_GRASS.has(id) && heldHoeWidth() > 0;
// one plant: tall grass goes whole (both halves, two rolls), short grass or a stray top half one roll
function _hoeCutOne(x, y, z, id) {
  if (id === B.TALL_UPPER && (getBlock(x, y - 1, z) & 255) === B.TALL_LOWER) { y -= 1; id = B.TALL_LOWER; }
  if (id === B.TALL_LOWER) {
    setBlock(x, y + 1, z, B.AIR);
    setBlock(x, y, z, B.AIR);
    _harvestFiber(x, y, z, 2);
  } else {
    setBlock(x, y, z, B.AIR);
    _harvestFiber(x, y, z, 1);
  }
}
function hoeCutGrass(cx, cy, cz) {
  const w = heldHoeWidth();
  const slot = HOTBAR[hotbarSel];
  if (!w || !slot) return 0;
  const r = (w - 1) / 2, ry = w > 1 ? 1 : 0;
  let cut = 0, broke = false;
  for (let dy = -ry; dy <= ry && !broke; dy++)
    for (let dz = -r; dz <= r && !broke; dz++)
      for (let dx = -r; dx <= r && !broke; dx++) {
        const x = cx + dx, y = cy + dy, z = cz + dz;
        const id = getBlock(x, y, z) & 255;
        if (!HOE_GRASS.has(id)) continue;
        _hoeCutOne(x, y, z, id);
        cut++;
        if (slot.dur != null && --slot.dur <= 0) broke = true;
      }
  if (!cut) return 0;
  playBlockSound(B.TALLGRASS, 'break', cx, cy, cz);
  if (typeof addXP === 'function' && typeof XP_HARVEST !== 'undefined') addXP(XP_HARVEST * cut);
  if (broke) {
    HOTBAR[hotbarSel] = null;
    if (typeof feedItem === 'function') feedItem(slot.id, -1, 'broke');
    playSound('toolBreak', { gain: 0.7 });
  }
  saveHotbar(); buildHotbar(); updateHotbar();
  return cut;
}
