'use strict';
/* entities/box-models.js: box models, in the shape Blockbench writes ("Java block model"): a list of boxes
   (`elements`), each with its `from` and `to` corners in 16ths of a block, its six `faces` and the part of the sheet each
   shows (`uv`: left, top, right, bottom), maybe a `rotation` { origin, axis, angle } and the `bone` it moves with
   (`bones`: name, pivot, parent). Used by the termite hill (blocks/termite-hill.js), the termites (entities/termite.js),
   the otter (entities/otter.js), the clam (blocks/clam.js); the worn backpack reads the same shape its own way
   (41-backpack.js, from BOX_MODEL_DATA too).

   THE MODELS ARE SCRIPTS: js/models/*.js, each a defineBoxModel(name, {...}) made from the JSON a model was handed over in
   (toolsrc/json-to-model.js), loaded right after this file. The game never fetches a model file; a model is asked for by
   its name (boxModel) and only its sheet is loaded, the first time.

   UV UNITS. A model with `texture_size` gives its uv in 16ths of the sheet each way (Blockbench's own). One without it
   (the termite hill's) gives them in model pixels of 8 texels, the block art's scale: a 256 px sheet is 32 wide. So does
   one whose uv run past 16 though it has a `texture_size` (the clam's): 16ths never do.

   Until a model's sheet is in, `ready` is false and the callers ask again. */
const BOX_MODEL_DATA = {};                     // name -> the model's boxes (js/models/*.js)
function defineBoxModel(name, json) { BOX_MODEL_DATA[name] = json; }
const _boxModels = {};                         // name -> { ready, failed, json, tex, du, dv }
function boxModel(name, texUrl) {
  let m = _boxModels[name];
  if (m) return m;
  m = _boxModels[name] = { ready: false, failed: false, json: BOX_MODEL_DATA[name] || null, tex: null, du: 16, dv: 16 };
  if (!m.json) { m.failed = true; console.error('box model ' + name + ': no such model (js/models/*.js)'); }
  m.tex = new THREE.TextureLoader().load(texUrl, () => {
    if (!m.json) return;
    const w = m.tex.image.width, h = m.tex.image.height, els = m.json.elements || [];
    const past16 = els.some(el => Object.values(el.faces || {}).some(f => f.uv && f.uv.some(n => n > 16)));
    const ts = m.json.texture_size && !past16;
    m.du = ts ? 16 : w / 8; m.dv = ts ? 16 : h / 8;
    m.ready = true;
  }, undefined, (e) => { m.failed = true; console.error('box model sheet ' + texUrl + ':', e); });
  m.tex.colorSpace = THREE.SRGBColorSpace;
  m.tex.magFilter = THREE.NearestFilter;
  m.tex.minFilter = THREE.NearestMipmapLinearFilter;
  m.tex.generateMipmaps = true;
  return m;
}
// a box's six faces as seen from outside: [the JSON's name for it, its corners top left, top right, bottom left,
// bottom right], each corner by which end (0 = from, 1 = to) it takes on x, y, z (as 41-backpack.js)
const _BOX_FACES = [
  ['east',  [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0]]],
  ['west',  [[0, 1, 0], [0, 1, 1], [0, 0, 0], [0, 0, 1]]],
  ['up',    [[0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]]],
  ['down',  [[0, 0, 1], [1, 0, 1], [0, 0, 0], [1, 0, 0]]],
  ['south', [[0, 1, 1], [1, 1, 1], [0, 0, 1], [1, 0, 1]]],
  ['north', [[1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]]],
];
const _boxRot = new THREE.Matrix4(), _boxV = new THREE.Vector3();
const _BOX_AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
/* Some of a model's boxes as ONE geometry, in blocks. `els` the elements; `at` [x, y, z] in 16ths, the point that is
   the geometry's origin (a bone's pivot); `turn` true: turned half round about it (a creature's file faces -Z, the
   game's creatures +Z: a turn, not a mirror, so every face keeps its picture the right way round). */
function boxModelGeometry(m, els, at = [0, 0, 0], turn = false) {
  const pos = [], uv = [], idx = [], s = turn ? -1 : 1;
  for (const el of els) {
    const ends = [el.from, el.to], r = el.rotation;
    if (r && r.angle) _boxRot.makeRotationAxis(_BOX_AXIS[r.axis] || _BOX_AXIS.y, r.angle * Math.PI / 180);
    for (const [name, corners] of _BOX_FACES) {
      const f = el.faces && el.faces[name];
      if (!f || !f.uv) continue;
      const [u0, v0, u1, v1] = f.uv, base = pos.length / 3;
      corners.forEach(([ex, ey, ez], k) => {
        _boxV.set(ends[ex][0], ends[ey][1], ends[ez][2]);
        if (r && r.angle) { const o = r.origin; _boxV.sub(_BOX_V3.set(o[0], o[1], o[2])).applyMatrix4(_boxRot).add(_BOX_V3); }
        pos.push(s * (_boxV.x - at[0]) / 16, (_boxV.y - at[1]) / 16, s * (_boxV.z - at[2]) / 16);
        uv.push((k % 2 ? u1 : u0) / m.du, 1 - (k < 2 ? v0 : v1) / m.dv);   // the sheet's top is v = 1
      });
      idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
const _BOX_V3 = new THREE.Vector3();
/* A creature from its model, built into `root` (a THREE.Group already in the world): a group per bone at its pivot,
   nested by `parent`, each with its boxes as one mesh; a box whose name matches `own` (the legs) gets a mesh and a
   group of its own at its rotation's origin, so it can swing there. The model's (x 8, z 8) at its feet is the
   creature's place. Returns { bones: name -> group, parts: name -> group } sharing `mat`. */
function buildBoxRig(m, root, mat, own = null) {
  const json = m.json, bones = {}, parts = {};
  const pivotOf = (name) => { const b = (json.bones || []).find(x => x.name === name); return b ? b.pivot : [8, 0, 8]; };
  const place = (g, p, parentPivot) => g.position.set(-(p[0] - parentPivot[0]) / 16, (p[1] - parentPivot[1]) / 16, -(p[2] - parentPivot[2]) / 16);
  const feet = [8, 0, 8];
  for (const b of json.bones || []) { bones[b.name] = new THREE.Group(); bones[b.name].name = b.name; }
  for (const b of json.bones || []) {
    const g = bones[b.name], parent = b.parent && bones[b.parent];
    place(g, b.pivot, parent ? pivotOf(b.parent) : feet);
    (parent || root).add(g);
  }
  const byBone = {};
  for (const el of json.elements || []) {
    const bone = bones[el.bone] ? el.bone : null;
    if (own && own.test(el.name || '')) {
      const o = el.rotation ? el.rotation.origin : [(el.from[0] + el.to[0]) / 2, el.from[1], (el.from[2] + el.to[2]) / 2];
      const g = new THREE.Group();
      place(g, o, bone ? pivotOf(bone) : feet);
      g.add(new THREE.Mesh(boxModelGeometry(m, [el], o, true), mat));
      (bone ? bones[bone] : root).add(g);
      parts[el.name] = g;
      continue;
    }
    (byBone[bone || ''] || (byBone[bone || ''] = [])).push(el);
  }
  for (const [bone, els] of Object.entries(byBone)) {
    const mesh = new THREE.Mesh(boxModelGeometry(m, els, bone ? pivotOf(bone) : feet, true), mat);
    (bone ? bones[bone] : root).add(mesh);
  }
  return { bones, parts };
}
