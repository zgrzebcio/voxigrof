'use strict';
/* voxiGrof — structures: capture, save, and spawn prefabs.

   ================================================================================================
   HOW THE WHOLE THING FITS TOGETHER
   ================================================================================================
   1. AUTHORING. Place a Structure Block, right-click it, type a size + a name, press JSON. The
      block reads the volume out of the world and writes a JSON prefab. The prefab holds every
      non-air cell as [x, y, z, id, variant] — variant is what preserves double slabs, stair
      facings, log widths, door hinges and everything else that lives in the high byte.

   2. STORAGE. The JSON is downloaded, to drop into structures/ and list in the manifest. Since
      0.82424 the browser keeps no copy (they used to go to localStorage and spawn on their own);
      old copies are cleared at load.

   3. SPAWNING. Prefabs carry a `spawn` block naming biomes, a per-chunk chance and a height band.
      When a chunk finishes generating, a seeded hash decides whether that chunk gets a structure,
      and the prefab is stamped in with setBlock.

      Placement runs on the MAIN THREAD, not in the generator. The generator lives in a worker
      that only ever sees raw chunk data, so shipping prefabs into it would mean a whole new
      transfer path and a save-format change. Stamping afterwards costs one pass over the prefab's
      cells, reuses the existing edit/persistence machinery for free, and means a structure that
      spawns is saved exactly like something the player built.

   4. LOOT. A prefab may mark cells as loot containers. Nothing is generated at spawn time — the
      chest records which table it owes, and the roll happens the first time it is OPENED. That
      keeps a hundred untouched chests from costing anything, and it is what makes the contents
      feel rolled-for-you rather than baked into the map.
   ================================================================================================ */

const STRUCT_LS_KEY = 'vg_structures';
const STRUCT_DIR = 'structures/';
const STRUCT_MANIFEST = STRUCT_DIR + 'manifest.json';

const STRUCTURES = new Map();          // id -> prefab
const STRUCT_GROUPS = new Map();       // group name -> settlement/dungeon config from the manifest
const STRUCT_MAX_SPAN = 48;            // per-axis clamp; a prefab is stamped in one frame

/* ---------------------------------- loot ---------------------------------- */
/* A table is { rolls: [min, max], entries: [{ id, min, max, chance }] }. A roll picks one entry
   at random, tests its chance, and on success drops a stack of min..max into a free slot. Entries
   are referenced by NAME so several chests can share one table and a prefab stays readable. */
const DEFAULT_LOOT = {
  '1': {
    name: 'basic',
    rolls: [3, 6],
    xp: [3, 8],                        // experience for the first open — see awardLootXP
    entries: [
      // no tools or weapons since 0.7443 — see isGearLoot below
      { id: 'APPLE',          min: 1, max: 3, chance: 0.60 },
      { id: 'BREAD',          min: 1, max: 2, chance: 0.50 },
      { id: 'STRING',         min: 1, max: 4, chance: 0.30 },
      { id: 'GUNPOWDER',      min: 1, max: 2, chance: 0.25 },
      { id: 'FLINT',          min: 1, max: 3, chance: 0.30 },
      { id: 'BRICK',          min: 1, max: 4, chance: 0.25 },
      { id: 'FEATHER',        min: 1, max: 3, chance: 0.30 },
      { id: 'FLOUR',          min: 1, max: 2, chance: 0.25 },
      { id: 'B:LOG',          min: 1, max: 5, chance: 0.45 },
    ],
  },
};

/* Entries name their contents rather than hardcoding numbers, so a prefab stays valid when block
   and item ids shift around. "B:NAME" is a block from the B enum, anything else an ITEM. */
function resolveLootId(name) {
  if (typeof name === 'number') return name;
  if (typeof name !== 'string') return null;
  if (name.startsWith('B:')) { const v = B[name.slice(2)]; return v == null ? null : v; }
  const v = ITEM[name];
  return v == null ? null : v;
}

// NOT `_ri` — 28-entities.js already owns that name, and these are classic scripts sharing one
// global lexical scope, so a duplicate top-level const throws and takes the whole file with it
const _lootRange = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* Roll a table into a slot array, scattering stacks across random EMPTY slots. Returns how many
   stacks landed. Slots already holding something are left alone, so re-rolling is harmless. */
/* NO TOOLS OR WEAPONS IN LOOT (0.7443). Every pick, hatchet, shovel, hoe, sword, shears and bow
   is earned at a bench — a chest that hands out a pickaxe skips the whole tool ladder. Enforced
   HERE, at roll time, rather than by editing each table, because structure files are authored
   with the structure block and ship their own tables: an entry naming a tool simply never lands,
   whatever file it came from. (The skeleton's rare bow is a mob drop, not a loot table.) */
function isGearLoot(id) {
  const p = id != null && id >= 256 ? ITEM_PROPS[id] : null;
  return !!(p && (p.tool || p.ranged));
}
function rollLootInto(slots, table) {
  if (!table || !Array.isArray(table.entries)) return 0;
  const entries = table.entries.filter((e) => {
    const id = e && resolveLootId(e.id);
    return id != null && !isGearLoot(id);
  });
  if (!entries.length) return 0;
  const [rMin, rMax] = Array.isArray(table.rolls) ? table.rolls : [1, 3];
  const rolls = _lootRange(Math.max(0, rMin | 0), Math.max(rMin | 0, rMax | 0));
  let placed = 0;
  for (let r = 0; r < rolls; r++) {
    const e = entries[Math.floor(Math.random() * entries.length)];
    if (!e || Math.random() >= (e.chance ?? 1)) continue;
    const id = resolveLootId(e.id);
    if (id == null) continue;
    // pick a free slot at random rather than filling front-to-back, so a chest looks looted
    const free = [];
    for (let i = 0; i < slots.length; i++) if (!slots[i]) free.push(i);
    if (!free.length) break;
    const at = free[Math.floor(Math.random() * free.length)];
    const n = Math.max(1, Math.min(stackSize(id), _lootRange(e.min ?? 1, e.max ?? 1)));
    slots[at] = mkSlot(id, n);
    placed++;
  }
  /* Never hand back an empty chest (0.7291). Every roll testing its own `chance` means a table
     with 3-6 rolls at ~35% each lands nothing surprisingly often, and walking a dungeon to open a
     chest with nothing in it reads as a bug even when the dice were honest. So if the rolls came
     up empty, take one entry unconditionally — chance ignored, since this IS the failure case. */
  if (!placed) {
    const free = [];
    for (let i = 0; i < slots.length; i++) if (!slots[i]) free.push(i);
    // walk from a random start so the guaranteed item is not always the first valid entry
    // the FILTERED list, same as the rolls — the guarantee must not be a back door for gear
    const off = Math.floor(Math.random() * entries.length);
    for (let j = 0; j < entries.length && free.length; j++) {
      const e = entries[(off + j) % entries.length];
      const id = e && resolveLootId(e.id);
      if (id == null) continue;
      const at = free[Math.floor(Math.random() * free.length)];
      slots[at] = mkSlot(id, Math.max(1, Math.min(stackSize(id), _lootRange(e.min ?? 1, e.max ?? 1))));
      placed++;
      break;
    }
  }
  return placed;
}

/* Cells owing a loot roll: "x,y,z" -> table name. Populated when a structure is stamped, consumed
   the first time that container is opened, and persisted with the world so an unopened chest is
   still full after a reload. */
const PENDING_LOOT = new Map();
const lootKey = (x, y, z) => x + ',' + y + ',' + z;

function markPendingLoot(x, y, z, tableName, structId) {
  PENDING_LOOT.set(lootKey(x, y, z), { table: tableName, struct: structId });
}
/* Called from openChest. Fills the chest the first time it is opened and clears the marker, so a
   player who empties a chest and walks away does not find it refilled. */
/* Resolve a table reference against a prefab's own tables. A chest may name either the KEY
   ("1", "2") or the table's human `name` ("basic", "super good"), so a prefab stays readable
   whichever convention its author prefers. Falls back to the built-in tables. */
function resolveLootTable(prefab, ref) {
  const tables = (prefab && prefab.lootTables) || DEFAULT_LOOT;
  if (tables[ref]) return tables[ref];
  for (const k in tables) if (tables[k] && tables[k].name === ref) return tables[k];
  return DEFAULT_LOOT[ref] || null;
}
function rollLootExtra(slots, table) {
  const entries = (table && Array.isArray(table.entries) ? table.entries : []).filter((e) => {
    const id = e && resolveLootId(e.id);
    return id != null && !isGearLoot(id);
  });
  const free = [];
  for (let i = 0; i < slots.length; i++) if (!slots[i]) free.push(i);
  if (!entries.length || !free.length) return false;
  const e = entries[Math.floor(Math.random() * entries.length)], id = resolveLootId(e.id);
  slots[free[Math.floor(Math.random() * free.length)]] = mkSlot(id, Math.max(1, Math.min(stackSize(id), _lootRange(e.min ?? 1, e.max ?? 1))));
  return true;
}
function fillPendingLoot(x, y, z, slots) {
  const k = lootKey(x, y, z);
  const rec = PENDING_LOOT.get(k);
  if (!rec) return false;
  PENDING_LOOT.delete(k);
  const table = resolveLootTable(STRUCTURES.get(rec.struct), rec.table);
  rollLootInto(slots, table);
  /* Treasure Nose (0.79): one chest in four holds one item more. Chance ignored on the extra roll,
     the same way the empty-chest guarantee below ignores it — "one more" should mean one more. */
  if (typeof hasSkill === 'function' && hasSkill('treasureNose') && Math.random() < 0.25) rollLootExtra(slots, table);
  awardLootXP(table);                    // finding the chest is the achievement, not its contents
  return true;
}
function serializePendingLoot() {
  return [...PENDING_LOOT].map(([k, v]) => [k, v.table, v.struct]);
}
function restorePendingLoot(list) {
  PENDING_LOOT.clear();
  if (!Array.isArray(list)) return;
  for (const rec of list)
    if (Array.isArray(rec) && typeof rec[0] === 'string') PENDING_LOOT.set(rec[0], { table: rec[1], struct: rec[2] });
}

/* ---------------------------------- prefab store ----------------------------------
   Gone since 0.82424: the structure block downloads JSON only, and loadStructures clears the old browser copies. */

/* ---------------------------------- diagnostics ---------------------------------- */
/* These files are hand-edited, so a missing comma or bracket is the normal failure — not an
   exotic one. Everything below exists to turn "nothing spawned and I don't know why" into a
   message that names the file, the line, and the character. */
function _structReport(level, src, msg) {
  const line = `[structure] ${src}: ${msg}`;
  if (level === 'error') { console.error(line); toast('structure error — see console'); }
  else console.warn(line);
}

// byte offset -> "line N col M", plus that line's text and a caret under the offending character
function _posInfo(text, pos) {
  const upto = text.slice(0, pos);
  const line = upto.split('\n').length;
  const col = pos - (upto.lastIndexOf('\n') + 1);
  const body = text.split('\n')[line - 1] ?? '';
  return { line, col, body, caret: ' '.repeat(Math.max(0, col)) + '^' };
}

/* JSON.parse messages differ between engines and rarely say WHICH bracket is unbalanced, so on
   failure we do our own scan: walk the text tracking string state, count the delimiters, and
   report the first structural problem we can actually name. */
function _diagnoseJson(text) {
  const stack = [];
  let inStr = false, esc = false, lineNo = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') lineNo++;
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      else if (c === '\n') return `unterminated string starting on line ${lineNo - 1} — missing a closing "`;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push({ c, lineNo });
    else if (c === '}' || c === ']') {
      const want = c === '}' ? '{' : '[';
      const top = stack.pop();
      if (!top) return `stray '${c}' on line ${lineNo} — one closing bracket too many`;
      if (top.c !== want) return `'${c}' on line ${lineNo} closes a '${top.c}' opened on line ${top.lineNo} — brackets crossed`;
    } else if (c === ',') {
      // a comma directly before a closer is the classic trailing comma JSON rejects
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') return `trailing comma on line ${lineNo} — JSON does not allow one before '${text[j]}'`;
    }
  }
  if (inStr) return 'unterminated string — a " is missing somewhere';
  if (stack.length) {
    const t = stack[stack.length - 1];
    return `'${t.c}' opened on line ${t.lineNo} is never closed`;
  }
  return null;
}

function parseStructureText(text, src) {
  try {
    return JSON.parse(text);
  } catch (err) {
    const hint = _diagnoseJson(text);
    const m = /position (\d+)/.exec(err.message);
    let where = '';
    if (m) {
      const p = _posInfo(text, +m[1]);
      where = `\n  line ${p.line}, col ${p.col + 1}:\n  ${p.body}\n  ${p.caret}`;
    }
    _structReport('error', src, `${hint || err.message}${where}`);
    return null;
  }
}

/* ---------------------------------- migration ---------------------------------- */
/* Prefabs are data files that outlive the code that wrote them. Rather than demanding the author
   rewrite old files whenever a field is added, normalise on load: fill in defaults, translate
   retired fields, and coerce loose types. Anything actually broken is reported and dropped rather
   than left to fail later inside the mesher. */
const STRUCT_FORMAT = 2;         // 1 = pre-modes (spawn.surface boolean), 2 = spawn.mode

function migrateStructure(raw, src) {
  if (!raw || typeof raw !== 'object') { _structReport('error', src, 'file is not a JSON object'); return null; }
  const p = raw;
  const fixes = [];

  if (typeof p.id !== 'string' || !p.id) {
    p.id = src.replace(/\.json$/i, '') || 'structure';
    fixes.push(`missing "id" — using "${p.id}"`);
  }

  if (!Array.isArray(p.blocks)) { _structReport('error', src, 'missing or non-array "blocks"'); return null; }
  // drop malformed cells rather than letting a bad tuple crash stampStructure later
  const before = p.blocks.length;
  p.blocks = p.blocks.filter(b =>
    Array.isArray(b) && b.length >= 4 && b.slice(0, 4).every(v => Number.isFinite(v)));
  if (p.blocks.length !== before) fixes.push(`dropped ${before - p.blocks.length} malformed block entries`);
  if (!p.blocks.length) { _structReport('error', src, '"blocks" is empty after validation'); return null; }

  // size may be absent or stale — recompute it from the cells, which is always authoritative
  let mx = 0, my = 0, mz = 0;
  for (const b of p.blocks) { mx = Math.max(mx, b[0]); my = Math.max(my, b[1]); mz = Math.max(mz, b[2]); }
  const want = [mx + 1, my + 1, mz + 1];
  if (!Array.isArray(p.size) || p.size.length !== 3 || p.size.some((v, i) => v !== want[i])) {
    if (Array.isArray(p.size)) fixes.push(`size ${JSON.stringify(p.size)} did not match the blocks — corrected to ${JSON.stringify(want)}`);
    p.size = want;
  }

  // slabs and stairs lost their own ids in 0.783: an older prefab's become shape variants of the full block
  for (const b of p.blocks) {
    const v = b[3] | ((b[4] | 0) << 8), nv = migrateLegacyVal(v);
    if (nv !== v) { b[3] = nv & 255; b[4] = (nv >> 8) & 255; }
  }
  // unknown block ids: a prefab built on a newer build, or an id that has since moved
  const unknown = new Set();
  for (const b of p.blocks) if (!PROPS[b[3]]) unknown.add(b[3]);
  if (unknown.size) {
    p.blocks = p.blocks.filter(b => PROPS[b[3]]);
    fixes.push(`skipped unknown block ids [${[...unknown].join(', ')}]`);
  }

  /* spawn: fill defaults and translate the retired `surface` boolean into `mode`. */
  const s = (p.spawn && typeof p.spawn === 'object') ? p.spawn : (p.spawn = {});
  if (!s.mode) {
    s.mode = s.surface === false ? 'air' : 'surface';
    if ('surface' in s) fixes.push(`converted "surface": ${s.surface} to "mode": "${s.mode}"`);
  }
  if (!STRUCT_MODES.includes(s.mode)) {
    fixes.push(`unknown mode "${s.mode}" — falling back to "surface"`);
    s.mode = 'surface';
  }
  if (p.group != null && typeof p.group !== 'string') { delete p.group; fixes.push('"group" was not a string — ignored'); }
  // a group member is positioned by its group, so it has no business rolling its own chance
  if (typeof s.chance !== 'number') {
    s.chance = 0;
    if (!p.group) fixes.push('no spawn chance — this prefab will not spawn naturally');
  }
  if (typeof s.minY !== 'number') s.minY = 0;
  if (typeof s.maxY !== 'number') s.maxY = 255;
  if (s.minY > s.maxY) { const t = s.minY; s.minY = s.maxY; s.maxY = t; fixes.push('minY was above maxY — swapped'); }
  if (s.biomes != null && !Array.isArray(s.biomes)) { delete s.biomes; fixes.push('"biomes" was not an array — ignored'); }

  /* loot: every referenced table must exist, and every marked cell must actually hold a container,
     or the marker sits on a block nothing can ever open. */
  if (p.loot && typeof p.loot === 'object') {
    const tables = (p.lootTables && typeof p.lootTables === 'object') ? p.lootTables : {};
    const names = new Set(Object.keys(tables));
    for (const k in tables) if (tables[k] && tables[k].name) names.add(tables[k].name);
    const cells = new Set(p.blocks.filter(b => PROPS[b[3]]?.model === 'chest' || b[3] === B.FURNACE)
                                  .map(b => b[0] + ',' + b[1] + ',' + b[2]));
    for (const k of Object.keys(p.loot)) {
      if (!cells.has(k)) { delete p.loot[k]; fixes.push(`loot cell "${k}" is not a chest or furnace — ignored`); continue; }
      const ref = p.loot[k];
      if (!names.has(ref) && !DEFAULT_LOOT[ref])
        fixes.push(`loot cell "${k}" points at table "${ref}", which this file does not define`);
    }
  }
  if (p.lootTables && typeof p.lootTables === 'object')
    for (const k in p.lootTables) {
      const t = p.lootTables[k];
      if (!t || !Array.isArray(t.entries)) { fixes.push(`loot table "${k}" has no entries array`); continue; }
      if (!Array.isArray(t.rolls)) { t.rolls = [1, 3]; fixes.push(`loot table "${k}" had no rolls — defaulted to [1, 3]`); }
      for (const e of t.entries)
        if (e && resolveLootId(e.id) == null) fixes.push(`loot table "${k}" references unknown item "${e.id}"`);
    }

  p.format = STRUCT_FORMAT;
  if (fixes.length) _structReport('warn', src, 'auto-fixed on load:\n  - ' + fixes.join('\n  - '));
  return p;
}

function registerStructure(prefab, src) {
  const p = migrateStructure(prefab, src || (prefab && prefab.id) || 'structure');
  if (!p) return false;
  STRUCTURES.set(p.id, p);
  return true;
}

/* Boot load: localStorage drafts first, then structures/ files overwrite them by id. A shipped
   prefab is the source of truth; a local draft is a work in progress. */
/* The manifest is either the original bare array of file names, or an object that also declares
   GROUPS. A group is a set of prefabs that spawn together as one settlement or dungeon rather
   than independently — see the group section further down for what each type does. */
function _readManifest(raw, src) {
  if (Array.isArray(raw)) return raw;                 // v1: just a file list
  if (!raw || typeof raw !== 'object') {
    _structReport('error', src, 'must be an array of file names, or an object with a "files" array');
    return null;
  }
  if (raw.groups && typeof raw.groups === 'object')
    for (const [name, g] of Object.entries(raw.groups)) {
      if (!g || typeof g !== 'object') { _structReport('error', src, `group "${name}" is not an object`); continue; }
      if (!['village', 'dungeon'].includes(g.type)) {
        _structReport('error', src, `group "${name}" has type "${g.type}" — expected "village" or "dungeon"`);
        continue;
      }
      STRUCT_GROUPS.set(name, Object.assign({ name }, g));
    }
  if (!Array.isArray(raw.files)) { _structReport('error', src, 'object manifest needs a "files" array'); return null; }
  return raw.files;
}

async function loadStructures() {
  /* The structure block no longer keeps copies in the browser (0.82424): it only downloads JSON, and what exists is
     what the manifest ships. Old copies (vg_structures) are cleared here; worlds and profiles are other keys. */
  try { localStorage.removeItem(STRUCT_LS_KEY); } catch {}

  let raw = null;
  try {
    const res = await fetch(STRUCT_MANIFEST, { cache: 'no-store' });
    if (!res.ok) return;                              // no manifest is fine — the folder is optional
    raw = parseStructureText(await res.text(), 'manifest.json');
  } catch { return; }                                 // offline / file:// — nothing to report
  if (raw === null) return;                           // parse failed; parseStructureText already said why
  const names = _readManifest(raw, 'manifest.json');
  if (!names) return;

  /* Fetched in PARALLEL. This was an `await` inside the loop, so N prefabs meant N round trips
     end to end — each one waiting for the last to finish before its request was even sent.
     Registration still happens in manifest order afterwards, so prefab precedence is unchanged. */
  const fetched = await Promise.all(names.map(async (n) => {
    if (typeof n !== 'string') { _structReport('error', 'manifest.json', `entry ${JSON.stringify(n)} is not a file name`); return null; }
    try {
      const r = await fetch(STRUCT_DIR + n, { cache: 'no-store' });
      if (!r.ok) { _structReport('error', n, `not found (HTTP ${r.status}) — listed in the manifest but missing from ${STRUCT_DIR}`); return null; }
      return { n, text: await r.text() };
    } catch (e) { _structReport('error', n, 'could not be fetched: ' + e.message); return null; }
  }));
  for (const f of fetched) {
    if (!f) continue;
    const prefab = parseStructureText(f.text, f.n);
    if (prefab) registerStructure(prefab, f.n);
  }
  const n = STRUCTURES.size;
  console.log(`[structure] loaded ${n} prefab${n === 1 ? '' : 's'}: ${[...STRUCTURES.keys()].join(', ') || '(none)'}`);
  // a group with no members would silently never fire, which is a confusing thing to debug
  for (const [name, g] of STRUCT_GROUPS) {
    const members = groupMembers(name);
    if (!members.length) _structReport('error', 'manifest.json', `group "${name}" has no prefabs — no file sets "group": "${name}"`);
    else console.log(`[structure] group "${name}" (${g.type}): ${members.map(p => p.id).join(', ')}`);
  }
  /* ...and now the chunks that arrived while this was loading get their one try after all (0.799).
     Only the ones still in memory: an unloaded chunk is stamped when it streams back in. */
  if (_structWaiting.size) {
    const waited = [..._structWaiting];
    _structWaiting.clear();
    for (const k of waited) {
      const [wx, wz] = k.split(',').map(Number);
      const c = typeof getChunk === 'function' ? getChunk(wx, wz) : null;
      if (c && c.data) trySpawnStructureInChunk(wx, wz);
    }
  }
  // the mirror case: a prefab claiming a group the manifest never declares would never spawn
  for (const p of STRUCTURES.values())
    if (p.group && !STRUCT_GROUPS.has(p.group))
      _structReport('error', p.id, `"group": "${p.group}" is not declared in manifest.json — this prefab will never spawn`);
}

/* ---------------------------------- capture ---------------------------------- */
/* The volume starts ONE CELL in front of the structure block and grows +X/+Y/+Z, so the block is
   never inside its own capture and the corner is always predictable. */
function structVolume(x, y, z, size) {
  return { x0: x + 1, y0: y, z0: z, w: size.w, h: size.h, l: size.l };
}

function captureStructure(bx, by, bz, size, name) {
  const v = structVolume(bx, by, bz, size);
  const blocks = [];
  const loot = {};
  for (let dy = 0; dy < v.h; dy++)
    for (let dz = 0; dz < v.l; dz++)
      for (let dx = 0; dx < v.w; dx++) {
        const val = getBlock(v.x0 + dx, v.y0 + dy, v.z0 + dz);
        const id = val & 255;
        if (id === B.AIR || id === B.STRUCTURE_BLOCK) continue;
        blocks.push([dx, dy, dz, id, (val >> 8) & 255]);
        // every captured container is wired to the default table; edit the JSON to retarget it
        if (id === B.CHEST) loot[dx + ',' + dy + ',' + dz] = '1';
      }
  return {
    id: name,
    size: [v.w, v.h, v.l],
    blocks,
    loot,
    lootTables: DEFAULT_LOOT,
    // sensible defaults so a freshly saved prefab already spawns; tune in the JSON.
    // mode: surface | embed | air | cave | underground — see the header for what each one does
    // chance 0 since 0.82423: a saved prefab spawns only once it ships in the manifest with a chance of its own
    spawn: { mode: 'embed', biomes: ['Forest', 'Plains'], chance: 0, minY: 60, maxY: 150 },
  };
}

function downloadStructure(prefab) {
  const blob = new Blob([JSON.stringify(prefab, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = prefab.id + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------------------------- stamping ---------------------------------- */
/* Place a prefab with its (0,0,0) corner at the given world cell. No rotation: prefabs go down in
   the orientation they were saved, which keeps every rotatable block's variant valid as-is. */
/* Stamp a SLICE of a prefab, `from` .. `from + budget`, and return where to resume.

   Every cell is a setBlock, and setBlock is not cheap: it marks the chunk dirty, rewrites the
   edit store, re-floods light and runs the per-block hooks. A dungeon is well over a thousand
   cells and a village several hundred, so doing one in a single frame is a visible freeze. The
   caller feeds this a budget and comes back next frame. */
// `swap` (0.82426): block id -> block id while stamping, a group's `replace` (a desert village's dirt is sand)
function stampStructureSlice(prefab, ox, oy, oz, from, budget, swap = null) {
  const blocks = prefab.blocks;
  const end = Math.min(blocks.length, from + budget);
  for (let i = from; i < end; i++) {
    const b = blocks[i];
    if (!Array.isArray(b) || b.length < 4) continue;
    const [dx, dy, dz, id0, variant = 0] = b;
    const id = swap && swap[id0] != null ? swap[id0] : id0;
    if (!PROPS[id]) continue;                       // prefab references a block this build lacks
    const x = ox + dx, y = oy + dy, z = oz + dz;
    if (y < 1 || y > 198) continue;
    setBlock(x, y, z, id | ((variant & 255) << 8));
    if (id === B.CHEST) registerChest(x, y, z, variant & 3);
    if (id === B.DOOR && !((variant >> 3) & 1))
      registerDoor(x, y, z, variant & 3, !!(variant & 4), !!(variant & DOOR_HINGE_R));
    if (id === B.BED && !((variant >> 3) & 1)) registerBed(x, y, z, variant & 3);
  }
  return end;
}

// loot markers are keyed by prefab-local coords; translate them into the world once, at the end
function applyStructureLoot(prefab, ox, oy, oz) {
  if (!prefab.loot) return;
  for (const k in prefab.loot) {
    const p = k.split(',').map(Number);
    if (p.length !== 3 || p.some(isNaN)) continue;
    markPendingLoot(ox + p[0], oy + p[1], oz + p[2], prefab.loot[k], prefab.id);
  }
}

// whole-prefab convenience for the small single-structure path, where one frame is fine
function stampStructure(prefab, ox, oy, oz) {
  if (!prefab || !Array.isArray(prefab.blocks)) return 0;
  stampStructureSlice(prefab, ox, oy, oz, 0, prefab.blocks.length);
  applyStructureLoot(prefab, ox, oy, oz);
  return prefab.blocks.length;
}

/* ---------------------------------- natural spawning ---------------------------------- */
/* One deterministic roll per chunk. `placedChunks` stops a structure being stamped twice when a
   chunk unloads and streams back in — the blocks themselves persist as edits, so a second stamp
   would just be wasted work, and would re-arm loot in a chest the player already emptied. */
const _structPlaced = new Set();
const _structWaiting = new Set();    // chunks that landed before the prefabs did (0.799)
function structChunkKey(cx, cz) { return cx + ',' + cz; }

// cheap deterministic hash of (seed, chunk, salt) -> 0..1
function _structHash(cx, cz, salt) {
  let h = Math.imul(cx, 374761393) ^ Math.imul(cz, 668265263) ^ Math.imul(salt, 2246822519);
  for (let i = 0; i < String(SEED).length; i++) h = Math.imul(h ^ String(SEED).charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* Prefabs that spawn on their own. A prefab belonging to a group is excluded — its placement is
   the group's business, and letting it also roll independently would scatter lone village houses
   across the countryside. */
function _spawnCandidates() {
  const out = [];
  for (const p of STRUCTURES.values())
    if (!_groupOf(p) && p.spawn && (p.spawn.chance || 0) > 0) out.push(p);
  return out;
}

/* ---- placement modes ----
   spawn.mode picks how a prefab meets the world:

     "surface" (default)  Sits ON the ground and demands a flat, dry footprint. Cheapest and most
                          predictable, but a lumpy site is simply rejected.
     "embed"              Blends INTO the terrain. Anchors on the LOWEST surface in the footprint,
                          carves out whatever hillside is in the way, and pillars any column that
                          would otherwise overhang. Accepts slopes that "surface" rejects and never
                          leaves a floating platform.
     "air"                Deliberately airborne: no ground contact at all, anchored at a random
                          height inside the prefab's own minY..maxY band.
     "cave"               Drops into a cave that already exists — hunts the minY..maxY band for an
                          open pocket standing on a solid floor. Nothing is carved, so the prefab
                          has to fit a natural cavern.
     "underground"        Digs its own room. Wants SOLID rock through the whole volume plus a
                          shell around it, then hollows it out — so a buried vault never opens
                          into a cave or breaches the surface by accident.

   For surface/embed the Y band filters the terrain height; for air/cave/underground it is the
   band the prefab is placed in.

   Legacy `surface: false` still reads as "air", so prefabs written before modes existed keep
   working. */
const STRUCT_MODES = ['surface', 'embed', 'air', 'cave', 'underground'];
const STRUCT_Y_TRIES = 8;        // hashed height samples per underground/cave attempt
function structMode(s) {
  if (s.mode) return s.mode;
  return s.surface === false ? 'air' : 'surface';
}

/* Real ground, not "the first thing that isn't air".

   surfaceY stops at the highest non-air/water/lava cell, which on any grassy plain is a tall-grass
   billboard, a flower or a layer of leaf litter — never the block you want to build on. That one
   discrepancy caused two separate bugs: paths refused to pave (the cell they found was a
   non-solid plant) and buildings anchored a block too high or too low depending on cover. Walk
   down past anything that is not a real full block. */
// by VALUE since 0.785: a snow or litter layer is its block's id, so the layer count is what makes it cover
const _isCover = (v) => {
  const p = PROPS[v & 255];
  return !p || !CORE.solidVal(v) || p.model === 'cross' || p.model === 'carpet' || CORE.layerCount(v) > 0;
};
function structGroundY(x, z) {
  let y = surfaceY(x, z);
  for (let i = 0; i < 10 && y > 1; i++) {
    if (!_isCover(getBlock(x, y, z))) break;
    y--;
  }
  return y;
}

/* Lowest and highest ground under a footprint, plus whether any of it is fluid. One pass, reused
   by both the acceptance test and the anchor choice. */
function _footprint(ax, az, w, l) {
  let lo = 1e9, hi = -1e9, wet = false;
  for (let dz = 0; dz < l; dz++)
    for (let dx = 0; dx < w; dx++) {
      const y = structGroundY(ax + dx, az + dz);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
      const top = getBlock(ax + dx, y, az + dz) & 255;
      if (top === B.WATER || top === B.LAVA || !PROPS[top]?.solid) wet = true;
    }
  return { lo, hi, wet };
}

/* Cut the prefab's own volume out of the hillside, then prop up anything left overhanging.
   Without the carve an embedded building is packed solid with dirt; without the pillars a slope
   that falls away leaves its lower corner hanging in mid-air. */
/* o (0.82426): `from` — the first layer carved (1 keeps the ground the prefab stands in, a village house sunk to its
   doorstep); `cols` — carve only these columns (a well's own shaft and collar, so no sand is left in it); `top` /
   `deep` — the pillar blocks (sand in a desert village, not dirt and stone). */
function _blendIntoTerrain(prefab, ox, oy, oz, o = {}) {
  const [w, h, l] = prefab.size || [1, 1, 1];
  const filled = new Set();
  for (const b of prefab.blocks) if (Array.isArray(b)) filled.add(b[0] + ',' + b[1] + ',' + b[2]);
  // carve: any terrain sharing a cell with the prefab's bounding box that the prefab did not fill
  for (let dy = o.from | 0; dy < h; dy++)
    for (let dz = 0; dz < l; dz++)
      for (let dx = 0; dx < w; dx++) {
        if (filled.has(dx + ',' + dy + ',' + dz)) continue;
        if (o.cols && !o.cols.has(dx + ',' + dz)) continue;
        const x = ox + dx, y = oy + dy, z = oz + dz;
        const cur = getBlock(x, y, z) & 255;
        if (cur !== B.AIR && cur !== B.WATER) setBlock(x, y, z, B.AIR);
      }
  // pillar: every bottom-layer cell of the prefab gets solid ground beneath it
  const PILLAR_MAX = 8;
  for (let dz = 0; dz < l; dz++)
    for (let dx = 0; dx < w; dx++) {
      if (!filled.has(dx + ',0,' + dz)) continue;
      const x = ox + dx, z = oz + dz;
      // how deep the gap goes, then filled from the bottom up (0.82426): a sand pillar never stands on air, so none falls
      let n = 0;
      while (n < PILLAR_MAX && oy - n - 1 >= 1) {
        const cur = getBlock(x, oy - n - 1, z) & 255;
        if (cur !== B.AIR && cur !== B.WATER && PROPS[cur]?.solid) break;
        n++;
      }
      for (let d = n; d >= 1; d--) setBlock(x, oy - d, z, d === 1 ? (o.top ?? B.DIRT) : (o.deep ?? B.STONE));
    }
}

/* ================================================================================================
   GROUPS — villages and dungeons
   ================================================================================================
   A prefab with `"group": "name"` no longer spawns on its own. Instead the manifest's group entry
   rolls ONCE per chunk and lays out the whole settlement: several member prefabs positioned
   relative to a common origin, plus the connective tissue between them (gravel paths above
   ground, carved corridors below).

   THE CHUNK PROBLEM, AND WHY THERE IS A QUEUE
   -------------------------------------------
   A village is 40-60 blocks across, so it spans three or four chunks. setBlock silently discards
   writes into chunks that have not generated yet, so laying the whole thing down at roll time
   would leave the far half missing forever. The layout is therefore computed up front — it is
   pure arithmetic on a seeded hash, so it never changes — and each piece is pushed onto a queue.
   Pieces are stamped when their footprint's chunks exist, retried as more terrain streams in, and
   given up on after PLACE_MAX_TRIES so a village at the edge of the render distance cannot leak
   entries forever.

   Because the layout is deterministic, a piece placed on this visit lands in exactly the spot it
   would have on any other, no matter which chunk the player approached from. */

const PLACE_QUEUE = [];              // { kind, prefab|cells, ox, oy, oz, tries }
const PLACE_MAX_TRIES = 240;
/* "cx,cz" -> the kinds of settlement holding that chunk (0.82425: a Set of group types, 'village' / 'dungeon'). A chunk
   keeps out a second one of the SAME kind only — a dungeon may lie under a village — and a village's keeps out lone
   prefabs built on the ground (no shed in the square). */
const _groupClaimed = new Map();
const _claim = (k, kind) => { let s = _groupClaimed.get(k); if (!s) _groupClaimed.set(k, s = new Set()); s.add(kind); };

/* A prefab's group (0.82422): its own `group`, or else the declared group its id begins with — `desert_village_house1`
   is a desert_village member — so one saved fresh from a structure block (which writes no group) still joins. */
function _groupOf(p) {
  if (p.group) return p.group;
  let best = null;
  for (const name of STRUCT_GROUPS.keys())
    if (String(p.id || '').startsWith(name + '_') && (!best || name.length > best.length)) best = name;
  return best;
}
const groupMembers = (name) => [...STRUCTURES.values()].filter(p => _groupOf(p) === name);

function _chunkLoaded(x, z) {
  const c = getChunk(Math.floor(x / 16), Math.floor(z / 16));
  return !!(c && c.data);
}
// every chunk the footprint touches must exist before a piece can be stamped
function _footprintReady(ox, oz, w, l) {
  for (let z = oz; z <= oz + l; z += 8)
    for (let x = ox; x <= ox + w; x += 8) if (!_chunkLoaded(x, z)) return false;
  return _chunkLoaded(ox + w, oz + l);
}

function queuePlacement(job) { PLACE_QUEUE.push(Object.assign({ tries: 0, step: 0, phase: 0 }, job)); }

/* Cells written per drain. A settlement is thousands of setBlocks; spreading them over frames
   turns a freeze into a building that visibly assembles itself over about a second. */
const PLACE_BUDGET = 48;

/* ---- deferred lighting ----
   Budgeting the WRITES was only half the problem. Each setBlock that changes opacity starts a
   sky-light BFS, and hollowing a dungeon room is ~200 of those in a row — spreading them over
   frames still pays the same total, it just stretches the stutter out.

   So structure writes run with lighting suppressed (`structBulkLight`), the chunks they touched
   are remembered, and each one is re-lit exactly once afterwards with the same pair of functions
   chunk loading uses. Hundreds of localised floods collapse into a handful of chunk-wide passes,
   and those are drained one chunk per frame so even the flush cannot spike. */
const _lightPending = new Set();          // "cx,cz" awaiting a post-stamp re-light

function _markLightDirty(ox, oz, w, l) {
  const cx0 = Math.floor(ox / 16), cx1 = Math.floor((ox + w) / 16);
  const cz0 = Math.floor(oz / 16), cz1 = Math.floor((oz + l) / 16);
  for (let cz = cz0; cz <= cz1; cz++)
    for (let cx = cx0; cx <= cx1; cx++) _lightPending.add(cx + ',' + cz);
}

function _flushOneLight() {
  const it = _lightPending.values().next();
  if (it.done) return false;
  _lightPending.delete(it.value);
  const [cx, cz] = it.value.split(',').map(Number);
  const c = getChunk(cx, cz);
  if (!c || !c.data) return true;         // unloaded since; it will be lit fresh on reload anyway
  seedSkyForChunk(c);
  relightForChunk(cx, cz);
  markDirty(c);
  return true;
}

/* Run `fn` with per-cell lighting off, recording the region so it can be re-lit afterwards. */
function _bulkWrite(ox, oz, w, l, fn) {
  structBulkLight = true;
  try { return fn(); }
  finally {
    structBulkLight = false;
    _markLightDirty(ox, oz, w, l);
  }
}

/* Drain up to PLACE_BUDGET cells of work. Called from the frame loop AND on chunk arrival, so it
   keeps pace with streaming without needing a timer of its own.

   Each job is a little state machine (`phase`, `step`) rather than an all-at-once action, so a
   half-placed building simply resumes next frame. */
function processPlacementQueue(budget = PLACE_BUDGET) {
  let left = budget;
  for (let i = 0; i < PLACE_QUEUE.length && left > 0; i++) {
    const j = PLACE_QUEUE[i];
    const w = j.w ?? 1, h = j.h ?? 1, l = j.l ?? 1;
    if (j.phase === 0 && !_footprintReady(j.ox, j.oz, w, l)) {
      if (++j.tries > PLACE_MAX_TRIES) { PLACE_QUEUE.splice(i--, 1); }
      continue;
    }
    if (j.kind === 'sweep') {                          // a village's sand carpets (0.82422)
      const before = j.step;
      _bulkWrite(j.ox, j.oz, w, l, () => { j.step = _sweepSand(j.cells, j.step, left * 2); });
      left -= (j.step - before) >> 1;                  // mostly reads: half the charge of a write
      if (j.step >= j.cells.length) PLACE_QUEUE.splice(i--, 1);
      continue;
    }
    if (j.kind === 'path') {
      const before = j.step;
      _bulkWrite(j.ox, j.oz, w, l, () => { j.step = _layPath(j.cells, j.block, j.step, left, j.bridge); });
      left -= j.step - before;
      if (j.step >= j.cells.length) PLACE_QUEUE.splice(i--, 1);
      continue;
    }
    if (j.kind === 'corridor') {
      const before = j.step;
      /* A corridor cell hollows the passage AND inspects a 5-wide, 5-tall shell around it — about
         25 reads and up to 25 writes. Charging it 12 let a long tunnel blow through the frame
         budget twice over. */
      const CORRIDOR_COST = 25;
      _bulkWrite(j.ox, j.oz, w, l, () => {
        j.step = _digCorridor(j.cells, j.height, j.step, Math.max(1, (left / CORRIDOR_COST) | 0));
      });
      left -= (j.step - before) * CORRIDOR_COST;
      if (j.step >= j.cells.length) PLACE_QUEUE.splice(i--, 1);
      continue;
    }
    // prefab: phase 0 = carve/blend the site, phase 1 = lay the blocks, then loot + retire
    if (j.phase === 0) {
      if (j.carve) {
        /* Only hollow the cells the prefab will NOT fill. Clearing the whole box first meant
           three quarters of a dungeon room's carve writes were immediately overwritten by its
           own walls — pure waste, and each one still cost a chunk-dirty and an edit-store entry. */
        if (!j.filled) {
          j.filled = new Set();
          for (const b of j.prefab.blocks) if (Array.isArray(b)) j.filled.add(b[0] + ',' + b[1] + ',' + b[2]);
        }
        const total = w * h * l;
        const end = Math.min(total, j.step + left);
        _bulkWrite(j.ox, j.oz, w, l, () => {
          for (let k = j.step; k < end; k++) {
            const dx = k % w, dy = ((k / w) | 0) % h, dz = (k / (w * h)) | 0;
            if (j.filled.has(dx + ',' + dy + ',' + dz)) continue;
            setBlock(j.ox + dx, j.oy + dy, j.oz + dz, B.AIR);
          }
        });
        left -= end - j.step;
        j.step = end;
        if (j.step < total) continue;
      } else if (j.blend) {
        _bulkWrite(j.ox, j.oz, w, l, () => _blendIntoTerrain(j.prefab, j.ox, j.oy, j.oz, j.blendOpts));
        left -= w * l * 2;                             // rough charge for the carve+pillar pass
      }
      j.phase = 1; j.step = 0;
      if (left <= 0) continue;
    }
    const before = j.step;
    _bulkWrite(j.ox, j.oz, w, l, () => {
      j.step = stampStructureSlice(j.prefab, j.ox, j.oy, j.oz, j.step, left, j.swap);
    });
    left -= j.step - before;
    if (j.step >= j.prefab.blocks.length) {
      applyStructureLoot(j.prefab, j.ox, j.oy, j.oz);
      PLACE_QUEUE.splice(i--, 1);
    }
  }
  // one chunk re-lit per call, and only once the writes for this frame are done
  if (_lightPending.size) _flushOneLight();
}
function clearPlacementQueue() {
  PLACE_QUEUE.length = 0;
  _groupClaimed.clear();
  _lightPending.clear();
  structBulkLight = false;      // a world swap mid-stamp must not leave lighting suppressed
}

/* ---- village ---- */
/* 0.8242: at least three houses and a well for every four of them, the first in the middle of the square; every
   doorstep joins the paths, and no path ever runs through a building.
   Houses are the group's members with a door, wells its members without one. Houses scatter round a centre on a
   jittered ring, each dropped onto its own local ground with the embed rules so slopes are fine. The ground is read
   from the world where its chunk has arrived and from the generator where it has not (_planGround), so a house is no
   longer dropped only because its chunk was still on its way — that was what left villages with one or two houses.
   Paths: every doorstep is joined to the road already laid (at first the square round the middle) by the cheapest way
   round the buildings, a search over the village's own grid where footprints are walls, water and climbs cost more and
   road already laid costs little, so later houses branch off earlier roads. They are `pathWidth` wide (manifest). */
const VILLAGE_MIN_HOUSES = 4, VILLAGE_WELL_EVERY = 4;   // 4 houses at least since 0.82425 (3): fewer is not a village
// the ground for planning: trees stand on it, they are not it
const _planSkip = (v) => _isCover(v) || PROPS[v & 255]?.model === 'log' || PROPS[v & 255]?.model === 'hollow';
function _planGround(x, z) {
  if (_chunkLoaded(x, z)) {
    let y = surfaceY(x, z);
    for (let i = 0; i < 40 && y > 1 && _planSkip(getBlock(x, y, z)); i++) y--;
    const top = getBlock(x, y, z) & 255, over = getBlock(x, y + 1, z) & 255;
    return { y, wet: top === B.WATER || top === B.LAVA || !PROPS[top]?.solid || over === B.WATER || over === B.LAVA };
  }
  const y = mainGen.heightAt(x, z);                  // not generated yet: the generator's own ground, the same one
  return { y, wet: y < WATER_Y };
}
function _planFootprint(ax, az, w, l) {
  let lo = 1e9, hi = -1e9, wet = false;
  for (let dz = 0; dz < l; dz++)
    for (let dx = 0; dx < w; dx++) {
      const g = _planGround(ax + dx, az + dz);
      if (g.y < lo) lo = g.y;
      if (g.y > hi) hi = g.y;
      if (g.wet) wet = true;
    }
  return { lo, hi, wet };
}
/* A prefab's way in: its door (the lower half) in the outer wall, which way it opens, and its doorstep — the first
   cell that way outside the prefab's whole box (a porch or an overhanging roof is part of the box), where the path
   starts. `dx, dz` are that doorstep, from the prefab's corner (so -1 or the width). null: no door, a well. The outer
   wall is the ring round the blocks at the door's own height, so a door set back behind a porch still counts. */
// the prefab's columns with something at ground level (y 0-2): what a path must go round (0.82422)
function _prefabLowCols(p) {
  if (!p._lowCols) { p._lowCols = new Set(); for (const b of p.blocks || []) if (Array.isArray(b) && b[1] <= 2) p._lowCols.add(b[0] + ',' + b[2]); }
  return p._lowCols;
}
function _prefabDoor(p) {
  if (p._door !== undefined) return p._door;
  const [w, , l] = p.size || [1, 1, 1];
  p._door = null;
  // a prefab can name its path's start itself (0.82422): `"entry": [x, z]`, e.g. beside the foot of a stair
  if (Array.isArray(p.entry)) return (p._door = { dx: p.entry[0] | 0, dz: p.entry[1] | 0, out: [0, 0] });
  for (const b of p.blocks || []) {
    if (!Array.isArray(b) || b[3] !== B.DOOR || ((b[4] | 0) & 8)) continue;          // the lower half only
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const c of p.blocks) if (Array.isArray(c) && c[1] === b[1]) {
      if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[2] < z0) z0 = c[2]; if (c[2] > z1) z1 = c[2];
    }
    const out = b[2] === z0 ? [0, -1] : b[2] === z1 ? [0, 1] : b[0] === x0 ? [-1, 0] : b[0] === x1 ? [1, 0] : null;
    if (!out) continue;                                                             // a door inside the house
    // out to the first column with nothing at ground level — right against a porch step (0.82422), else past the box
    let sx = b[0] + out[0], sz = b[2] + out[1];
    const low = _prefabLowCols(p);
    while (sx >= 0 && sz >= 0 && sx < w && sz < l && low.has(sx + ',' + sz)) { sx += out[0]; sz += out[1]; }
    p._door = { dx: sx, dz: sz, out };
    break;
  }
  /* No door block (0.82422): a doorway is a gap two high (y 1 and 2) in the ground-floor wall ring, not at a corner —
     so a house saved without its door still gets its path. */
  if (!p._door) {
    const has = new Set((p.blocks || []).filter(Array.isArray).map(c => c[0] + ',' + c[1] + ',' + c[2]));
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const c of p.blocks || []) if (Array.isArray(c) && c[1] === 1) {
      if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[2] < z0) z0 = c[2]; if (c[2] > z1) z1 = c[2];
    }
    const low = _prefabLowCols(p);
    for (let z = z0; z <= z1 && !p._door; z++) for (let x = x0; x <= x1; x++) {
      const onX = x === x0 || x === x1, onZ = z === z0 || z === z1;
      if (!(onX || onZ) || (onX && onZ) || has.has(x + ',1,' + z) || has.has(x + ',2,' + z)) continue;
      const out = z === z0 ? [0, -1] : z === z1 ? [0, 1] : x === x0 ? [-1, 0] : [1, 0];
      let sx = x + out[0], sz = z + out[1];
      while (sx >= 0 && sz >= 0 && sx < w && sz < l && low.has(sx + ',' + sz)) { sx += out[0]; sz += out[1]; }
      p._door = { dx: sx, dz: sz, out };
      break;
    }
  }
  return p._door;
}
function _planVillage(g, cx, cz) {
  const members = groupMembers(g.name);
  const houseKinds = members.filter(p => _prefabDoor(p)), wellKinds = members.filter(p => !_prefabDoor(p));
  if (!houseKinds.length) return false;
  const originX = cx * 16 + 8, originZ = cz * 16 + 8;
  const gy = structGroundY(originX, originZ);
  if (gy < (g.minY ?? 0) || gy > (g.maxY ?? 255)) return false;
  if (Array.isArray(g.biomes) && g.biomes.length && !g.biomes.includes(BIOMES.biomeBase(mainGen.biomeAt(originX, originZ)))) return false;   // base name (0.823)

  const [nMin, nMax] = Array.isArray(g.count) ? g.count : [3, 6];
  const nHouses = Math.max(VILLAGE_MIN_HOUSES, nMin + Math.floor(_structHash(cx, cz, 301) * (nMax - nMin + 1)));
  const radius = g.radius ?? 24;
  const spacing = g.spacing ?? 2;
  const pathBlock = g.path == null ? B.GRAVEL : g.path;
  const [pwMin, pwMax] = Array.isArray(g.pathWidth) ? g.pathWidth : [2, 3];
  const pathW = Math.max(1, Math.min(3, pwMin + Math.floor(_structHash(cx, cz, 311) * (pwMax - pwMin + 1))));

  const taken = [];                                   // placed footprints: { p, x, z, w, h, l, y, well }
  const fits = (bx, bz, w, l) => !taken.some(t => bx < t.x + t.w + spacing && bx + w + spacing > t.x &&
                                                  bz < t.z + t.l + spacing && bz + l + spacing > t.z);
  // a footprint centred on (ax, az), if it is free, dry and flat enough
  function site(p, ax, az, well) {
    const [w, h, l] = p.size, bx = Math.round(ax) - (w >> 1), bz = Math.round(az) - (l >> 1);
    if (!fits(bx, bz, w, l)) return null;
    /* Anchor on the HIGHEST ground under the footprint, not a centre sample: on uneven ground a centre sample buries
       the uphill half. Sitting on the high point only ever leaves a gap underneath, which the blend pass pillars into
       a foundation. Steep sites are skipped rather than stilted. */
    // every house in the group's own biome, not only the square (0.82423): no desert house on the plains next door
    if (Array.isArray(g.biomes) && g.biomes.length && !g.biomes.includes(BIOMES.biomeBase(mainGen.biomeAt(bx + (w >> 1), bz + (l >> 1))))) return null;
    const fp = _planFootprint(bx, bz, w, l);
    if (fp.wet || fp.hi - fp.lo > 4) return null;
    // `sink` (0.82422): layers of it set into the ground, a well's shaft. Sunk on the LOWEST ground (0.82423), so its
    // collar meets the surface all round instead of standing proud of a dip; nothing is carved round it (no blend)
    let y = (p.sink ? fp.lo : fp.hi) + 1 - (p.sink | 0);
    /* A house sits with its bottom layer IN the ground at its doorstep (0.82426): the porch and floor level with the
       path, not perched on the highest ground under it with a band of dirt and stone foundation showing. Higher ground
       round it is carved away (from the layer above), lower is pillared up. */
    const door = !well && _prefabDoor(p);
    if (door) y = Math.max(fp.lo, Math.min(fp.hi, _planGround(bx + door.dx, bz + door.dz).y));
    const t = { p, x: bx, z: bz, w, h, l, y, well, sunkHouse: !!door };
    taken.push(t);
    return t;
  }
  // by each member's `weight` (0.82422, default 1): a desert village is mostly big houses
  const pick = (list, salt) => {
    let r = _structHash(cx, cz, salt) * list.reduce((a, p) => a + (p.weight ?? 1), 0);
    for (const p of list) { r -= p.weight ?? 1; if (r < 0) return p; }
    return list[list.length - 1];
  };
  // the square's well goes first, so no house takes the middle; kept only if four houses come
  if (wellKinds.length && nHouses >= VILLAGE_WELL_EVERY) site(pick(wellKinds, 700), originX, originZ, true);
  /* houses on the ring, each with a few tries round its own spot; where the picked kind does not fit (a big house
     wants more flat ground), the other kinds try the same spots (0.82422), so the big ones are not crowded out */
  let houses = 0;
  for (let i = 0; i < nHouses; i++) {
    const first = pick(houseKinds, 400 + i * 13);
    let placed = false;
    for (const p of [first, ...houseKinds.filter(q => q !== first)]) {
      for (let k = 0; k < 6 && !placed; k++) {
        const ang = (i / nHouses) * Math.PI * 2 + (_structHash(cx, cz, 500 + i * 7 + k) - 0.5) * 1.1;
        const dist = radius * (0.35 + 0.65 * _structHash(cx, cz, 600 + i * 7 + k));
        if (site(p, originX + Math.cos(ang) * dist, originZ + Math.sin(ang) * dist, false)) placed = true;
      }
      if (placed) { houses++; break; }
    }
  }
  if (houses < VILLAGE_MIN_HOUSES) return false;     // too cramped, steep or wet for a village: none at all
  // a well for every four houses: the square's, then the rest out between the houses
  const wells = wellKinds.length ? Math.floor(houses / VILLAGE_WELL_EVERY) : 0;
  let haveWells = taken.filter(t => t.well).length;
  if (haveWells > wells) { taken.splice(taken.findIndex(t => t.well), 1); haveWells--; }
  for (let j = haveWells; j < wells; j++)
    for (let k = 0; k < 6; k++) {
      const ang = ((j + 0.5) / wells) * Math.PI * 2 + (_structHash(cx, cz, 800 + j * 7 + k) - 0.5) * 0.8;
      const dist = radius * (0.45 + 0.4 * _structHash(cx, cz, 900 + j * 7 + k));
      if (site(pick(wellKinds, 710 + j), originX + Math.cos(ang) * dist, originZ + Math.sin(ang) * dist, true)) break;
    }
  /* A group's `replace` (0.82426): block swaps for everything it builds, its foundations too — a desert village's dirt
     is sand ({"2": 7}); its paths keep their own block. */
  const swap = g.replace && typeof g.replace === 'object' ? g.replace : null;
  const sand = swap && swap[B.DIRT] != null ? swap[B.DIRT] : null;
  for (const t of taken) {
    const o = { top: sand ?? B.DIRT, deep: sand ?? B.STONE };
    if (t.sunkHouse) o.from = 1;                     // its floor is in the ground: keep the ground round it
    if (t.p.sink) {                                  // a well: carve only its own columns above the sunk part
      o.from = t.p.sink | 0; o.cols = new Set();
      for (const b of t.p.blocks) if (Array.isArray(b) && b[1] >= (t.p.sink | 0)) o.cols.add(b[0] + ',' + b[2]);
      // ...and the cells inside its rim (the opening over the water)
      for (const k of [...o.cols]) { const [x, z] = k.split(',').map(Number); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (o.cols.has((x + 2 * dx) + ',' + (z + 2 * dz))) o.cols.add((x + dx) + ',' + (z + dz)); }
    }
    queuePlacement({ kind: 'prefab', prefab: t.p, ox: t.x, oy: t.y, oz: t.z, w: t.w, h: t.h, l: t.l,
                     blend: true, blendOpts: o, swap });
  }

  // ---- the paths: a grid over the village, buildings as walls ----
  const PAD = 10, x0 = originX - radius - PAD, z0 = originZ - radius - PAD, G = 2 * (radius + PAD) + 1;
  const inG = (x, z) => x >= x0 && z >= z0 && x < x0 + G && z < z0 + G;
  const gi = (x, z) => (x - x0) + (z - z0) * G;
  const wall = new Uint8Array(G * G), road = new Uint8Array(G * G), wet = new Uint8Array(G * G);
  const hgt = new Int16Array(G * G).fill(-32768);
  // walls: each building's columns with something at ground level, so a path can run up to a porch step (0.82422)
  for (const t of taken)
    for (const k of _prefabLowCols(t.p)) { const [dx, dz] = k.split(',').map(Number), x = t.x + dx, z = t.z + dz; if (inG(x, z)) wall[gi(x, z)] = 1; }
  const ground = (i) => {
    if (hgt[i] === -32768) { const g2 = _planGround(x0 + i % G, z0 + ((i / G) | 0)); hgt[i] = g2.y; wet[i] = g2.wet ? 1 : 0; }
    return hgt[i];
  };
  const byWall = (x, z) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inG(x + dx, z + dz) && wall[gi(x + dx, z + dz)]) return true;
    return false;
  };
  const lines = [];                                   // every stretch of road as a list of cells, for widening
  // the square: a ring round the middle well, or the middle itself
  const mid = taken.find(t => t.well && Math.abs(t.x + (t.w >> 1) - originX) <= 1 && Math.abs(t.z + (t.l >> 1) - originZ) <= 1);
  const square = [];
  if (mid) {
    for (let x = mid.x - 1; x <= mid.x + mid.w; x++) square.push([x, mid.z - 1], [x, mid.z + mid.l]);
    for (let z = mid.z; z < mid.z + mid.l; z++) square.push([mid.x - 1, z], [mid.x + mid.w, z]);
  } else for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) square.push([originX + dx, originZ + dz]);
  for (const [x, z] of square) if (inG(x, z) && !wall[gi(x, z)]) road[gi(x, z)] = 1;
  lines.push(square);
  // the cheapest way from a cell to the road already laid (Dijkstra, a small binary heap), as cells from the start
  // Float64: a Float32 cost rounds down when stored, and the stale-entry test then threw the cell away unexpanded
  const dist = new Float64Array(G * G), prev = new Int32Array(G * G), hd = [], hi = [];
  const push = (d, i) => {
    let k = hd.length; hd.push(d); hi.push(i);
    while (k > 0) { const p = (k - 1) >> 1; if (hd[p] <= d) break; hd[k] = hd[p]; hi[k] = hi[p]; k = p; }
    hd[k] = d; hi[k] = i;
  };
  const pop = () => {
    const d = hd[0], i = hi[0], ld = hd.pop(), li = hi.pop();
    if (hd.length) {
      let k = 0;
      for (;;) {
        const a = 2 * k + 1, b = a + 1;
        let m = k, md = ld;
        if (a < hd.length && hd[a] < md) { m = a; md = hd[a]; }
        if (b < hd.length && hd[b] < md) { m = b; md = hd[b]; }
        if (m === k) break;
        hd[k] = hd[m]; hi[k] = hi[m]; k = m;
      }
      hd[k] = ld; hi[k] = li;
    }
    return [d, i];
  };
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function route(sx, sz) {
    if (!inG(sx, sz) || wall[gi(sx, sz)]) return null;
    dist.fill(Infinity); prev.fill(-1); hd.length = 0; hi.length = 0;
    const s = gi(sx, sz);
    dist[s] = 0; push(0, s);
    while (hd.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      if (road[i]) {
        const out = [];
        for (let k = i; k !== -1; k = prev[k]) out.push([x0 + k % G, z0 + ((k / G) | 0)]);
        return out.reverse();
      }
      const x = x0 + i % G, z = z0 + ((i / G) | 0), h = ground(i);
      for (const [dx, dz] of STEPS) {
        const nx = x + dx, nz = z + dz;
        if (!inG(nx, nz)) continue;
        const j = gi(nx, nz);
        if (wall[j]) continue;
        let c = road[j] ? 0.3 : 1;
        c += Math.min(6, Math.abs(ground(j) - h)) * 1.5;         // a climb
        if (wet[j]) c += 30;                                     // water: round it if at all possible
        if (!road[j] && byWall(nx, nz)) c += 2;                  // not hard along a wall
        if (d + c < dist[j]) { dist[j] = d + c; prev[j] = i; push(d + c, j); }
      }
    }
    return null;
  }
  // every house from its doorstep, nearest the middle first, so the roads grow outward from the square
  const starts = [];
  for (const t of taken) {
    const door = _prefabDoor(t.p);
    if (door) { starts.push([t.x + door.dx, t.z + door.dz]); continue; }
    if (t === mid) continue;
    // a well out on its own: from the middle of whichever of its sides faces the square
    const sides = [[t.x + (t.w >> 1), t.z - 1], [t.x + (t.w >> 1), t.z + t.l], [t.x - 1, t.z + (t.l >> 1)], [t.x + t.w, t.z + (t.l >> 1)]];
    sides.sort((a, b) => Math.hypot(a[0] - originX, a[1] - originZ) - Math.hypot(b[0] - originX, b[1] - originZ));
    starts.push(sides[0]);
  }
  starts.sort((a, b) => Math.hypot(a[0] - originX, a[1] - originZ) - Math.hypot(b[0] - originX, b[1] - originZ));
  for (const [sx, sz] of starts) {
    const cells = route(sx, sz) || [[sx, sz]];       // cut off by water: at least its own doorstep
    for (const [x, z] of cells) if (inG(x, z)) road[gi(x, z)] = 1;
    lines.push(cells);
  }
  // widen: each cell takes its neighbours across the way it runs — one side for 2 wide, both for 3
  // ...and where a road has to cross water it is a plank bridge on the surface, so every door still reaches the square
  const paved = new Map(), bridged = new Map();
  const pave = (x, z) => {
    if (!inG(x, z)) return;
    const i = gi(x, z);
    if (wall[i]) return;
    ground(i);
    (wet[i] ? bridged : paved).set(i, [x, z]);
  };
  for (const cells of lines)
    for (let k = 0; k < cells.length; k++) {
      const [x, z] = cells[k];
      pave(x, z);
      if (pathW < 2) continue;
      for (const o of [cells[k - 1], cells[k + 1]]) {
        if (!o) continue;
        const dx = x - o[0], dz = z - o[1];
        if (Math.abs(dx) + Math.abs(dz) !== 1) continue;   // the square's ring is not one line
        pave(x - dz, z + dx);
        if (pathW >= 3) pave(x + dz, z - dx);
      }
    }
  // queued a chunk at a time, so a stretch waits only for its own chunk rather than the whole village's
  for (const [cellMap, block, bridge] of [[paved, pathBlock, false], [bridged, g.bridge ?? B.PLANKS, true]]) {
    const byChunk = new Map();
    for (const [x, z] of cellMap.values()) {
      const k = Math.floor(x / 16) + ',' + Math.floor(z / 16);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push([x, z]);
    }
    for (const cells of byChunk.values()) {
      const xs = cells.map(c => c[0]), zs = cells.map(c => c[1]);
      queuePlacement({ kind: 'path', cells, block, bridge,
                       ox: Math.min(...xs), oz: Math.min(...zs),
                       w: Math.max(...xs) - Math.min(...xs), l: Math.max(...zs) - Math.min(...zs) });
    }
  }
  // sweep the loose sand carpets off the village and a little round it (0.82422), a chunk at a time like the paths
  const SWEEP = radius + 6, sweep = new Map();
  for (let z = originZ - SWEEP; z <= originZ + SWEEP; z++)
    for (let x = originX - SWEEP; x <= originX + SWEEP; x++) {
      if ((x - originX) ** 2 + (z - originZ) ** 2 > SWEEP * SWEEP) continue;
      const k = Math.floor(x / 16) + ',' + Math.floor(z / 16);
      if (!sweep.has(k)) sweep.set(k, []);
      sweep.get(k).push([x, z]);
    }
  for (const cells of sweep.values()) {
    const xs = cells.map(c => c[0]), zs = cells.map(c => c[1]);
    queuePlacement({ kind: 'sweep', cells, ox: Math.min(...xs), oz: Math.min(...zs),
                     w: Math.max(...xs) - Math.min(...xs), l: Math.max(...zs) - Math.min(...zs) });
  }
  // claim the footprint so lone prefabs do not drop a shed in the middle of the square
  const rc = Math.ceil((radius + 8) / 16);
  for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) _claim((cx + dx) + ',' + (cz + dz), g.type);   // by kind (0.82425)
  return true;
}

/* Take the loose sand carpets (sand, red or pink, a layer or a few) off the top of each column (0.82422): drifted
   over a village's yards and paths they read as clutter. Whole sand blocks stay. */
const _SWEEP_SANDS = new Set([B.SAND, B.RED_SAND, B.PINK_SAND]);
function _sweepSand(cells, from, budget) {
  const end = Math.min(cells.length, from + budget);
  for (let i = from; i < end; i++) {
    const [x, z] = cells[i];
    for (let y = surfaceY(x, z), n = 0; n < 3 && y > 1; n++, y--) {
      const v = getBlock(x, y, z);
      if (!_SWEEP_SANDS.has(v & 255) || !CORE.layerCount(v)) break;
      setBlock(x, y, z, B.AIR);
    }
  }
  return end;
}
/* Replace the surface cell of each path column, and clear the one above it so a path never runs
   under a bush. Sampling the surface per cell is what lets a path climb a hill. The ground is found under any tree
   standing there (0.8242, _planGround): paving the top of a trunk put gravel up in the air. */
function _layPath(cells, block, from, budget, bridge = false) {
  const end = Math.min(cells.length, from + budget);
  for (let i = from; i < end; i++) {
    const [x, z] = cells[i];
    const y = _planGround(x, z).y;                 // NOT surfaceY — that lands on the grass or a tree, not the soil
    // a bridge (0.8242): a plank on the water's top cell, level with the surface
    if (bridge) {
      let top = y;
      while (top < 198 && (getBlock(x, top + 1, z) & 255) === B.WATER) top++;
      if (top > y) { setBlock(x, top, z, block); continue; }
      if ((getBlock(x, y + 1, z) & 255) === B.LAVA) continue;    // no plank bridges over lava
    }
    const cur = getBlock(x, y, z) & 255;
    if (cur === B.WATER || cur === B.LAVA || !PROPS[cur]?.solid) continue;
    setBlock(x, y, z, block);
    // sweep the cover off the paved cell so a path never runs underneath a bush
    for (let up = 1; up <= 3; up++) {
      const a = getBlock(x, y + up, z) & 255;
      if (a === B.AIR) break;
      if (!_isCover(a)) break;
      setBlock(x, y + up, z, B.AIR);
    }
  }
  return end;
}

/* ---- dungeon ---- */
/* Rooms grow outward from a seed room: pick an already-placed room, step off it in a cardinal
   direction by its own size plus a gap, and carve the next one there. Corridors are dug between
   the two centres afterwards. All of it is planned in one pass so nothing depends on load order. */
function _planDungeon(g, cx, cz) {
  const members = groupMembers(g.name);
  if (!members.length) return false;
  const ox0 = cx * 16 + 8, oz0 = cz * 16 + 8;
  const surf = structGroundY(ox0, oz0);
  const lo = Math.max(3, Math.min(g.minY ?? 12, g.maxY ?? 48));
  const hi = Math.min(Math.max(g.minY ?? 12, g.maxY ?? 48), surf - 8);
  if (hi < lo) return false;
  const baseY = lo + Math.floor(_structHash(cx, cz, 701) * (hi - lo + 1));

  const [rMin, rMax] = Array.isArray(g.rooms) ? g.rooms : [4, 8];
  const nRooms = rMin + Math.floor(_structHash(cx, cz, 703) * (rMax - rMin + 1));
  const gap = g.corridor ?? 5;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const placed = [];
  for (let i = 0; i < nRooms; i++) {
    const p = members[Math.floor(_structHash(cx, cz, 800 + i * 11) * members.length)];
    const [w, h, l] = p.size;
    let rx, ry, rz;
    if (!placed.length) { rx = ox0 - (w >> 1); ry = baseY; rz = oz0 - (l >> 1); }
    else {
      const from = placed[Math.floor(_structHash(cx, cz, 900 + i * 7) * placed.length)];
      const d = DIRS[Math.floor(_structHash(cx, cz, 1000 + i * 5) * 4)];
      rx = from.x + d[0] * (from.w + gap);
      rz = from.z + d[1] * (from.l + gap);
      ry = from.y;                                   // one level per dungeon keeps corridors flat
    }
    if (ry < 3 || ry + h > surf - 4) continue;
    if (placed.some(t => rx < t.x + t.w + 2 && rx + w + 2 > t.x && rz < t.z + t.l + 2 && rz + l + 2 > t.z)) continue;
    const room = { x: rx, y: ry, z: rz, w, h, l, prefab: p };
    placed.push(room);
    queuePlacement({ kind: 'prefab', prefab: p, ox: rx, oy: ry, oz: rz, w, h, l, carve: true });
    if (placed.length > 1) {
      const from = placed[placed.length - 2];
      const cells = _corridorCells(from.x + (from.w >> 1), from.z + (from.l >> 1),
                                   rx + (w >> 1), rz + (l >> 1), ry);
      const xs = cells.map(c => c[0]), zs = cells.map(c => c[2]);
      queuePlacement({ kind: 'corridor', cells, height: Math.min(3, h),
                       ox: Math.min(...xs), oz: Math.min(...zs),
                       w: Math.max(...xs) - Math.min(...xs), l: Math.max(...zs) - Math.min(...zs) });
    }
  }
  if (!placed.length) return false;
  const spread = g.spread ?? 24;
  const rc = Math.ceil(spread / 16);
  for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) _claim((cx + dx) + ',' + (cz + dz), g.type);   // by kind (0.82425)
  return true;
}

// L-shaped run of cells between two room centres, all at one height
function _corridorCells(x0, z0, x1, z1, y) {
  const cells = [];
  const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
  for (let x = x0; x !== x1; x += sx) cells.push([x, y, z0]);
  for (let z = z0; z !== z1; z += sz) cells.push([x1, y, z]);
  cells.push([x1, y, z1]);
  return cells;
}
/* Hollow the corridor and wall whatever it opens into, so a tunnel that clips a cave or a water
   pocket does not flood the dungeon. */
function _digCorridor(cells, height, from, budget) {
  const end = Math.min(cells.length, from + Math.max(1, budget));
  for (let i = from; i < end; i++) {
    const [x, y, z] = cells[i];
    for (let dy = 0; dy < height; dy++) setBlock(x, y + dy, z, B.AIR);
    for (let dy = -1; dy <= height; dy++)
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
        if (dy >= 0 && dy < height && ax === 0 && az === 0) continue;   // that is the passage itself
        const nid = getBlock(x + ax, y + dy, z + az) & 255;
        if (nid === B.AIR || nid === B.WATER || nid === B.LAVA) setBlock(x + ax, y + dy, z + az, B.COBBLE);
      }
  }
  return end;
}

/* One roll per group per chunk. Returns true if a settlement was planned, so the caller skips its
   lone-prefab pass for this chunk. */
/* Spacing (0.82425). A structure never starts within `apart` blocks of another of its own kind — every village
   (village, desert village) is one kind, every dungeon one, each lone prefab its own — while different kinds may sit
   together: a supply crate beside a village, a dungeon under it. Where two sites of a kind roll too close, the one
   with the lower roll wins, decided from the hashes alone, so it comes out the same whichever chunk loads first. */
const STRUCT_APART = { village: 640, dungeon: 512 }, STRUCT_APART_LONE = 320;   // doubled in 0.82426
const _groupSalts = () => { const m = new Map(); let s = 2000; for (const g of STRUCT_GROUPS.values()) m.set(g, s++); return m; };
// would group g roll a site at chunk (x, z)? The roll, then what the generator alone can say about the place
function _groupRolls(g, salt, x, z) {
  const r = _structHash(x, z, salt);
  if (r >= (g.chance || 0)) return -1;
  const ox = x * 16 + 8, oz = z * 16 + 8;
  if (Array.isArray(g.biomes) && g.biomes.length && !g.biomes.includes(BIOMES.biomeBase(mainGen.biomeAt(ox, oz)))) return -1;
  if (g.type === 'village') { const h = mainGen.heightAt(ox, oz); if (h < (g.minY ?? 0) || h > (g.maxY ?? 255)) return -1; }
  return r;
}
// a stronger roll of the same kind within `apart` blocks of (cx, cz)? `rollsAt(x, z)` gives that kind's roll there, or -1
function _rivalNear(cx, cz, mine, apart, rollsAt) {
  const R = Math.ceil(apart / 16);
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      if ((!dx && !dz) || (dx * dx + dz * dz) * 256 > apart * apart) continue;
      const r = rollsAt(cx + dx, cz + dz);
      if (r >= 0 && (r < mine || (r === mine && (dz < 0 || (dz === 0 && dx < 0))))) return true;
    }
  return false;
}
function _trySpawnGroups(cx, cz) {
  const salts = _groupSalts(), ck = structChunkKey(cx, cz);
  let any = false;
  for (const g of STRUCT_GROUPS.values()) {
    if (_groupClaimed.get(ck)?.has(g.type)) continue;           // one of its kind already holds this chunk
    const mine = _groupRolls(g, salts.get(g), cx, cz);
    if (mine < 0) continue;
    const apart = g.apart ?? STRUCT_APART[g.type] ?? 256;
    const kin = [...STRUCT_GROUPS.values()].filter(h => h.type === g.type);
    const rollsAt = (x, z) => { let best = -1; for (const h of kin) { const r = _groupRolls(h, salts.get(h), x, z); if (r >= 0 && (best < 0 || r < best)) best = r; } return best; };
    if (_rivalNear(cx, cz, mine, apart, rollsAt)) continue;
    const ok = g.type === 'village' ? _planVillage(g, cx, cz) : _planDungeon(g, cx, cz);
    if (ok) any = true;                                          // a dungeon can still go under a village here
  }
  return any;
}

/* Called once per chunk, right after its terrain lands. Deliberately conservative: one structure
   per chunk at most, and the site must satisfy that prefab's placement mode. */
function trySpawnStructureInChunk(cx, cz) {
  // a world created with structures switched off never gets any (0.7594); older worlds have no flag and keep them
  if (menuScene || !currentWorld || currentWorld.structures === false) return;
  /* The prefabs are fetched once, on the first world opened, and the chunks around spawn land while that
     is still in flight. They used to be dropped on the floor here — one try per chunk, ever — so the whole
     area a player starts in could never hold a structure. They wait in line instead now (0.799). */
  if (!STRUCTURES.size) {
    if (_structWaiting.size < 4096) _structWaiting.add(cx + ',' + cz);
    return;
  }
  // a new chunk may unblock a piece that was waiting on it; the frame loop does the bulk of the
  // draining, so keep this slice small — chunk arrival is already a busy moment
  processPlacementQueue(16);
  const ck = structChunkKey(cx, cz);
  if (_structPlaced.has(ck)) return;
  _structPlaced.add(ck);            // one attempt per chunk either way — never retried on reload

  /* Settlements first, each kind apart from its own (0.82425); then one lone prefab, which may stand beside a
     settlement of another kind — only not on the ground inside a village (a crate in the square). */
  _trySpawnGroups(cx, cz);
  const inVillage = !!_groupClaimed.get(ck)?.has('village');
  const cands = _spawnCandidates();
  if (!cands.length) return;

  let salt = 1;
  for (const p of cands) {
    const s = p.spawn, mySalt = salt++;
    const mine = _structHash(cx, cz, mySalt);
    if (mine >= (s.chance || 0)) continue;
    if (inVillage && !['cave', 'underground', 'air'].includes(structMode(s))) continue;
    // ...and apart from its own kind (0.82425)
    if (_rivalNear(cx, cz, mine, s.apart ?? STRUCT_APART_LONE, (x, z) => { const r = _structHash(x, z, mySalt); return r < (s.chance || 0) ? r : -1; })) continue;
    const [w, h, l] = p.size || [1, 1, 1];
    /* The prefab is stamped the moment this chunk's terrain lands, and setBlock silently drops
       writes into chunks that have not generated yet. Anchoring inside the chunk keeps the whole
       footprint local; anything too wide to fit is skipped rather than half-placed. */
    if (w > 14 || l > 14) continue;
    const ax = cx * 16 + 1 + Math.floor(_structHash(cx, cz, 91) * Math.max(1, 15 - w));
    const az = cz * 16 + 1 + Math.floor(_structHash(cx, cz, 97) * Math.max(1, 15 - l));
    if (Array.isArray(s.biomes) && s.biomes.length) {
      const bio = BIOMES.biomeBase(mainGen.biomeAt(ax, az));   // base name (0.823)
      if (!s.biomes.includes(bio)) continue;
    }
    const minY = s.minY ?? 0, maxY = s.maxY ?? 255;
    const mode = structMode(s);

    if (mode === 'cave' || mode === 'underground') {
      /* Both live entirely inside the Y band — the surface height is irrelevant except as a
         ceiling, so a "cave" prefab never pops out of a hillside. */
      const surf = structGroundY(ax, az);
      const lo = Math.max(2, Math.min(minY, maxY));
      const hi = Math.min(Math.max(minY, maxY), surf - h - 3);
      if (hi < lo) continue;
      let done = false;
      for (const ay of _candidateYs(cx, cz, lo, hi, 211)) {
        if (ay < lo || ay > hi) continue;
        if (mode === 'cave') {
          // take an existing cavern: the room must already be open and standing on rock
          if (!_volumeClear(ax, ay, az, w, h, l)) continue;
          if (!_floorSolid(ax, ay, az, w, l)) continue;
        } else {
          // dig a new one: solid all the way through plus a 1-block shell, then hollow it out
          if (!_volumeSolid(ax, ay, az, w, h, l, 1)) continue;
        }
        // queued like every other piece so the carve + stamp is spread across frames
        queuePlacement({ kind: 'prefab', prefab: p, ox: ax, oy: ay, oz: az, w, h, l,
                         carve: mode === 'underground' });
        done = true;
        break;
      }
      if (done) return;
      continue;                      // no pocket found at any sampled height — try the next prefab
    }

    if (mode === 'air') {
      /* Free-floating: the height band IS the placement, not a filter on the ground. Only the
         volume itself has to be clear, so an island never materialises inside a mountain. */
      const lo = Math.max(2, Math.min(minY, maxY)), hi = Math.min(197 - h, Math.max(minY, maxY));
      if (hi < lo) continue;
      const ay = lo + Math.floor(_structHash(cx, cz, 131) * (hi - lo + 1));
      if (!_volumeClear(ax, ay, az, w, h, l)) continue;
      queuePlacement({ kind: 'prefab', prefab: p, ox: ax, oy: ay, oz: az, w, h, l });
      return;
    }

    const fp = _footprint(ax, az, w, l);
    if (fp.lo < minY || fp.lo > maxY) continue;
    if (fp.wet) continue;                                   // never build over water or lava

    if (mode === 'embed') {
      // sit on the LOWEST ground so no column can overhang, then carve the hill out of the walls
      if (fp.hi - fp.lo > 10) continue;                     // a cliff, not a slope
      queuePlacement({ kind: 'prefab', prefab: p, ox: ax, oy: fp.lo + 1, oz: az, w, h, l, blend: true });
      return;
    }

    // "surface": untouched behaviour — demands a flat site rather than reshaping one
    if (fp.hi - fp.lo > 1) continue;
    queuePlacement({ kind: 'prefab', prefab: p, ox: ax, oy: fp.lo + 1, oz: az, w, h, l });
    return;                          // at most one structure per chunk
  }
}

/* Nothing solid anywhere in the box. Used by air placement, where there is no ground to test. */
function _volumeClear(ax, ay, az, w, h, l) {
  for (let dy = 0; dy < h; dy++)
    for (let dz = 0; dz < l; dz++)
      for (let dx = 0; dx < w; dx++) {
        const id = getBlock(ax + dx, ay + dy, az + dz) & 255;
        if (id !== B.AIR && id !== B.WATER) return false;
      }
  return true;
}

/* Solid rock everywhere in the box, with a margin so an "underground" room cannot end up sharing
   a wall with a cave, a lava tube or open air. Bedrock is rejected too — digging into it would
   punch a hole in the world floor. */
function _volumeSolid(ax, ay, az, w, h, l, margin) {
  for (let dy = -margin; dy < h + margin; dy++)
    for (let dz = -margin; dz < l + margin; dz++)
      for (let dx = -margin; dx < w + margin; dx++) {
        const y = ay + dy;
        if (y < 2 || y > 198) return false;
        const id = getBlock(ax + dx, y, az + dz) & 255;
        if (id === B.BEDROCK) return false;
        if (!PROPS[id]?.opaque) return false;              // air, water, lava, cave — all disqualify
      }
  return true;
}

/* Every cell under the prefab's base layer is solid, so a cave placement rests on the floor
   rather than hanging over the void. */
function _floorSolid(ax, ay, az, w, l) {
  for (let dz = 0; dz < l; dz++)
    for (let dx = 0; dx < w; dx++) {
      const id = getBlock(ax + dx, ay - 1, az + dz) & 255;
      if (!PROPS[id]?.solid) return false;
    }
  return true;
}

/* Deterministic ordering of candidate heights inside the band. Scanning the whole band per chunk
   would cost thousands of getBlock calls; a handful of hashed samples finds a pocket often enough
   and costs a fixed amount whatever the band's size. */
function _candidateYs(cx, cz, lo, hi, salt) {
  const out = [];
  const span = Math.max(1, hi - lo + 1);
  for (let i = 0; i < STRUCT_Y_TRIES; i++)
    out.push(lo + Math.floor(_structHash(cx, cz, salt + i * 17) * span));
  return out;
}

function clearStructureState() {
  clearPlacementQueue();
  _structPlaced.clear();
  PENDING_LOOT.clear();
}
function serializeStructPlaced() { return [..._structPlaced]; }
function restoreStructPlaced(list) {
  _structPlaced.clear();
  if (Array.isArray(list)) for (const k of list) if (typeof k === 'string') _structPlaced.add(k);
}

/* ---------------------------------- outline ---------------------------------- */
/* A single reusable wireframe box. Only the structure block the player last opened shows one, so
   one mesh is enough and there is nothing to pool. */
let _outline = null;
let _outlineFor = null;             // "x,y,z" of the structure block that owns it
function _ensureOutline() {
  if (_outline) return _outline;
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const mat = new THREE.LineBasicMaterial({ color: 0x53d7ff, transparent: true, opacity: 0.9, depthTest: false });
  _outline = new THREE.LineSegments(geo, mat);
  _outline.renderOrder = 4;
  _outline.layers.set(1);           // never casts a shadow
  _outline.visible = false;
  scene.add(_outline);
  return _outline;
}
function showStructOutline(bx, by, bz, size) {
  const o = _ensureOutline();
  const v = structVolume(bx, by, bz, size);
  o.scale.set(Math.max(1, v.w), Math.max(1, v.h), Math.max(1, v.l));
  o.position.set(v.x0 + v.w / 2, v.y0 + v.h / 2, v.z0 + v.l / 2);
  o.visible = true;
  _outlineFor = bx + ',' + by + ',' + bz;
}
function hideStructOutline() {
  if (_outline) _outline.visible = false;
  _outlineFor = null;
}
/* Per-frame: drop the outline as soon as its block is gone, so breaking a structure block never
   leaves a ghost box floating in the world. */
function updateStructOutline() {
  if (!_outlineFor || !_outline || !_outline.visible) return;
  const p = _outlineFor.split(',').map(Number);
  if ((getBlock(p[0], p[1], p[2]) & 255) !== B.STRUCTURE_BLOCK) hideStructOutline();
}

/* ---------------------------------- per-block settings + UI ---------------------------------- */
/* Size/name live per structure-block cell, keyed by position, and ride along in the world save so
   a half-built capture survives a reload. */
const STRUCT_BLOCKS = new Map();    // "x,y,z" -> { w, h, l, name }
const structDefaults = () => ({ w: 5, h: 4, l: 5, name: 'structure' });
function structSettings(x, y, z) {
  const k = lootKey(x, y, z);
  let s = STRUCT_BLOCKS.get(k);
  if (!s) { s = structDefaults(); STRUCT_BLOCKS.set(k, s); }
  return s;
}
function serializeStructBlocks() {
  return [...STRUCT_BLOCKS].map(([k, s]) => [k, s.w, s.h, s.l, s.name]);
}
function restoreStructBlocks(list) {
  STRUCT_BLOCKS.clear();
  if (!Array.isArray(list)) return;
  for (const r of list)
    if (Array.isArray(r) && typeof r[0] === 'string')
      STRUCT_BLOCKS.set(r[0], { w: r[1] | 0 || 5, h: r[2] | 0 || 4, l: r[3] | 0 || 5, name: r[4] || 'structure' });
}
function structBlockBroken(x, y, z) {
  STRUCT_BLOCKS.delete(lootKey(x, y, z));
  if (_outlineFor === lootKey(x, y, z)) hideStructOutline();
}

var activeStructBlock = null;       // "x,y,z" of the block whose panel is open

function openStructureBlock(x, y, z) {
  activeStructBlock = lootKey(x, y, z);
  const s = structSettings(x, y, z);
  showStructOutline(x, y, z, s);
  toggleInventory(true);
}

const _clampSpan = (v, d) => Math.max(1, Math.min(STRUCT_MAX_SPAN, parseInt(v, 10) || d));

function buildStructPanel() {
  const panel = invPanel('structPanel');
  if (!panel) return;
  if (!activeStructBlock || invRightTab() !== 'struct') { panel.style.display = 'none'; return; }   // or another tab (0.795)
  const p = activeStructBlock.split(',').map(Number);
  if ((getBlock(p[0], p[1], p[2]) & 255) !== B.STRUCTURE_BLOCK) {
    activeStructBlock = null; panel.style.display = 'none'; return;
  }
  const s = structSettings(p[0], p[1], p[2]);
  panel.style.display = 'flex';
  panel.innerHTML =                                           // untitled since 0.796: the tab names it
    `<label>name<input id="stName" maxlength="64" spellcheck="false" value="${s.name}"></label>` +
    `<label>width  X<input id="stW" type="number" min="1" max="${STRUCT_MAX_SPAN}" value="${s.w}"></label>` +
    `<label>height Y<input id="stH" type="number" min="1" max="${STRUCT_MAX_SPAN}" value="${s.h}"></label>` +
    `<label>length Z<input id="stL" type="number" min="1" max="${STRUCT_MAX_SPAN}" value="${s.l}"></label>` +
    // JSON only since 0.82424: the browser keeps no copy; the file goes in structures/ and the manifest
    '<div class="strow"><button id="stDl">JSON</button></div>' +
    '<div id="stMsg"></div>';
  addInvTabs(panel, 'struct');                                // Structure / Equipment / Skill tree (0.795)

  const nameEl = panel.querySelector('#stName');
  const wEl = panel.querySelector('#stW'), hEl = panel.querySelector('#stH'), lEl = panel.querySelector('#stL');
  const msg = panel.querySelector('#stMsg');
  // live outline: every keystroke on a size field re-draws the box so you can see what you'll get
  const sync = () => {
    s.w = _clampSpan(wEl.value, 5); s.h = _clampSpan(hEl.value, 4); s.l = _clampSpan(lEl.value, 5);
    s.name = (nameEl.value || 'structure').trim().replace(/[^a-z0-9_-]/gi, '_') || 'structure';
    showStructOutline(p[0], p[1], p[2], s);
  };
  for (const el of [wEl, hEl, lEl, nameEl]) el.addEventListener('input', sync);

  panel.querySelector('#stDl').addEventListener('click', () => {
    sync();
    const prefab = captureStructure(p[0], p[1], p[2], s, s.name);
    downloadStructure(prefab);
    msg.textContent = `downloaded "${prefab.id}.json" — ${prefab.blocks.length} blocks`;
  });
}

/* Deferred to world load (0.7146). Prefabs are a gameplay asset — trySpawnStructureInChunk bails
   out on `menuScene || !currentWorld`, so nothing on the title screen can ever consult them — yet
   this used to fire a manifest fetch plus one request per prefab while the player was still
   waiting for the menu to appear. `ensureStructuresLoaded` runs the load exactly once, on the
   first world opened; a second call returns the same promise. */
let _structuresPromise = null;
function ensureStructuresLoaded() {
  if (!_structuresPromise) _structuresPromise = loadStructures();
  return _structuresPromise;
}
