'use strict';
/* player/skills.js: the skill tree's data (SKILLS), hasSkill, learning a skill, and what skills change elsewhere. */

/* voxiGrof — skills

   POINTS
   ------
   Every level is one skill point. Spending points does NOT spend levels: a level is still a permanent
   record of what you have done (see player/leveling.js), and the points are simply what those levels have
   bought. Free points = level - the cost of everything already learned. There is no respec.

   THE TREES
   ---------
   SKILLS below is the whole design: one entry per skill, with the category it belongs to, its cost
   and the skills it requires. The trees are NOT laid out by hand — skillLayout() derives each one
   from the `req` links alone: a skill sits one row below the deepest thing it needs, and the rows are
   ordered to keep the connecting lines from crossing. Adding a skill is one entry here, nothing else.

   STATE
   -----
   `player.skills` is a Set of learned ids, on the per-seat player object, so every split-screen seat
   has its own tree exactly as it has its own inventory. It is saved in that player's record beside the
   crafting queue. What each skill DOES lives at the gameplay site it changes, behind hasSkill(id) —
   grep for the id to find it.

   THE VIEW
   --------
   The equipment panel has a Skill tree button; K opens the inventory straight onto the tree. While the
   tree is shown it replaces every other panel in the inventory window, and Back (or K again, or
   closing the inventory) returns. Learning takes two clicks on the same skill — the first arms it,
   the second learns it — since a point spent is spent for good. */

const SKILL_CATS = [
  { key: 'survival',  name: 'Survival' },
  { key: 'crafting',  name: 'Crafting' },
  { key: 'exploring', name: 'Exploring' },
  { key: 'husbandry', name: 'Husbandry' },
];

const SKILLS = [
  // ---- survival ----
  { id: 'thickSkin',   cat: 'survival', name: 'Thick Skin',     cost: 1, req: [],
    desc: '+10 health' },                    // was +10% health until 0.791; +10 health again 0.828; no damage reduction since 0.8446
  { id: 'grassWeaver', cat: 'survival', name: 'Grass Weaver',   cost: 1, req: [],
    desc: '40% better chance of fiber from grass, wheat and bushes' },     // 30% until 0.8441
  { id: 'slowBurner',  cat: 'survival', name: 'Slow Burner',    cost: 1, req: ['thickSkin'],
    desc: 'Every bar drains 5% slower: food, thirst, stamina, oxygen, energy, fruit, vegetables and protein' },   // hunger and oxygen until 0.828
  // wall climbing goes a block higher and costs 30% less stamina
  { id: 'climber',     cat: 'survival', name: 'Climber',        cost: 1, req: ['slowBurner'],
    desc: 'Climb a bare wall one block higher, for 30% less stamina' },
  { id: 'canopy',      cat: 'survival', name: 'Canopy Forager', cost: 1, req: ['grassWeaver'],
    desc: '30% better chance of sticks, saplings and apples from leaves' },
  { id: 'timberShake', cat: 'survival', name: 'Timber Shaker',  cost: 2, req: ['canopy'],
    desc: 'Each log you cut shakes the tree: every leaf on it has a 2% chance to fall and drop its loot' },
  // ---- crafting ----
  // the ids stay (they are what a save holds). `nimble` is Work Fingers now, and took the walking bonus over
  // from `walkWork`, which became Precise Focus (player/crafting.js: craftMoveMul, benchFocusMul)
  { id: 'nimble',      cat: 'crafting', name: 'Work Fingers',   cost: 1, req: [],
    desc: '+10% crafting speed, and crafting slows your walk 25% less' },
  { id: 'walkWork',    cat: 'crafting', name: 'Precise Focus',  cost: 1, req: ['nimble'],
    desc: 'Crafting without a break gets faster, at a station you keep working or in your pocket queue: after 4 seconds the crafting speed starts to rise, up to +50% at 14 seconds. Any break starts it over' },   // the pocket queue 0.84471
  { id: 'fineWork',    cat: 'crafting', name: 'Fine Work',      cost: 1, req: ['nimble'],
    desc: 'Tools and gear you craft from now on are Well made: 10% chance a use costs no durability' },
  { id: 'spareParts',  cat: 'crafting', name: 'Spare Parts',    cost: 1, req: ['nimble'],
    desc: '5% chance an ammo craft gives 1 extra' },
  { id: 'mender',      cat: 'crafting', name: 'Mender',         cost: 2, req: ['fineWork', 'walkWork'],
    desc: 'Worn-out tools and gear break instead of vanishing. Drop a worn one on the Repair zone under the crafting panel: half its recipe when broken, less the less worn it is (flint anywhere, the rest at a bench)' },
  { id: 'dismantle',   cat: 'crafting', name: 'Dismantle',      cost: 2, req: ['mender'],   // 0.807
    desc: 'Drop a tool, weapon or piece of armor on the Dismantle zone under the equipment panel to break it down into half its recipe, less the more worn it is' },
  // ---- exploring ----
  { id: 'treasureNose', cat: 'exploring', name: 'Treasure Nose', cost: 1, req: [],
    desc: '25% chance a loot chest holds one extra item, and 1% that it holds a key (wooden, copper, iron or golden)' },   // the key 0.8446
  { id: 'prospector',   cat: 'exploring', name: 'Prospector',    cost: 1, req: [],
    desc: '20% chance of one more ore from every ore block you mine' },
  { id: 'weathered',    cat: 'exploring', name: 'Weathered',     cost: 2, req: [],
    desc: '+10% cold and heat resistance' },
  { id: 'packRat',      cat: 'exploring', name: 'Pack Rat',      cost: 1, req: ['treasureNose'],
    desc: 'Item stacks hold 20 more (99) and block stacks 10 more (60); not the small stacks (stews, bowls, buckets)' },   // blocks only until 0.8442
  { id: 'hazardHide',   cat: 'exploring', name: 'Hazard Hide',   cost: 1, req: ['prospector', 'treasureNose', 'weathered'],
    desc: '30% less damage from falls, lava and cactus' },   // explosions and temperature once they hurt
  // whatever clouds your sight or shakes it is 30% weaker: fog, a sandstorm, murky water, heatstroke's blur,
  // nausea's sway and the jolt of a hit
  { id: 'clearEyes',    cat: 'exploring', name: 'Clear Eyes',    cost: 1, req: ['hazardHide'],
    desc: 'Fog, sandstorms, murky water, blur, sway and the shake of a hit cloud or move your view 30% less' },
  // ---- husbandry ----
  { id: 'butcher',     cat: 'husbandry', name: 'Butcher',        cost: 1, req: [],
    desc: '20% chance of one more meat (or leather) from animals you kill' },
  { id: 'preserver',   cat: 'husbandry', name: 'Preserver',      cost: 1, req: [],
    desc: 'Food you carry spoils 10% slower' },                        // 0.7911
  { id: 'lingering',   cat: 'husbandry', name: 'Lingering',      cost: 1, req: ['preserver'],   // after Preserver since 0.7911
    desc: 'Good food and potion effects last 25% longer' },   // good ones only
  { id: 'gentleHand',  cat: 'husbandry', name: 'Gentle Hand',    cost: 2, req: ['butcher'],
    desc: 'Taming horses and other tameable animals is 10% faster' },
  { id: 'saddler',     cat: 'husbandry', name: 'Saddler',        cost: 2, req: ['gentleHand'],
    desc: 'The saddle recipe costs 20% less' },
  // 0.828, a path of its own
  { id: 'luckyHands',  cat: 'husbandry', name: 'Lucky Hands',    cost: 1, req: [],
    desc: '20% chance of one more flint, stone pebble, berry, mushroom, wheat, melon or cantaloupe slice or pumpkin when you forage one' },   // mushrooms, wheat and gourds 0.8442
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));

/* ---------------------------------- state and points ---------------------------------- */
const _skillSet = () => (player.skills instanceof Set ? player.skills : (player.skills = new Set()));
// the one question every gameplay site asks; `p` for a site that handles a seat other than the installed one
function hasSkill(id, p = (typeof player !== 'undefined' ? player : null)) {
  return !!p && p.skills instanceof Set && p.skills.has(id);
}
const skillPointsTotal = () => (typeof playerLevel === 'number' ? playerLevel : 0);
const skillPointsSpent = () => [..._skillSet()].reduce((n, id) => n + (SKILL_BY_ID[id]?.cost || 0), 0);
const skillPointsFree  = () => Math.max(0, skillPointsTotal() - skillPointsSpent());

// 'owned' | 'ready' (can learn now) | 'poor' (requirements met, not enough points) | 'locked'
function skillState(id) {
  const s = SKILL_BY_ID[id];
  if (!s) return 'locked';
  if (hasSkill(id)) return 'owned';
  // arrow, not every(hasSkill): every() passes the index as hasSkill's `p`, which made every requirement read unmet
  if (!s.req.every(r => hasSkill(r))) return 'locked';
  return skillPointsFree() >= s.cost ? 'ready' : 'poor';
}
function learnSkill(id) {
  if (player.canFly || skillState(id) !== 'ready') return false;
  _skillSet().add(id);
  if (typeof playSound === 'function') playSound('levelUp', { gain: 0.5 });
  if (typeof feedSkill === 'function') feedSkill(SKILL_BY_ID[id].name);   // gold, like a level-up
  // anything that reads a skill-driven number is redrawn once: stack caps, stats, the tree itself
  if (typeof vitalsDirty !== 'undefined') vitalsDirty = true;
  if (typeof buildHotbar === 'function') buildHotbar();
  if (invOpen && typeof buildInventory === 'function') buildInventory();
  if (typeof saveAll === 'function') saveAll();
  return true;
}

// saved in each player's record (16-worlds.js for player one, 36-splitscreen.js for the rest)
const serializeSkills = (p) => [...((p && p.skills instanceof Set) ? p.skills : [])];
const restoreSkills = (list) => new Set(Array.isArray(list) ? list.filter(id => SKILL_BY_ID[id]) : []);

/* ---------------------------------- the effects ----------------------------------
   Small helpers the gameplay sites call, so each number lives here beside the skill that sets it. */
const skillLeafMul   = () => hasSkill('canopy') ? 1.3 : 1;          // Canopy Forager: leaf loot chances
const skillFiberMul  = () => hasSkill('grassWeaver') ? 1.4 : 1;     // Grass Weaver: fiber chances (1.3 until 0.8441)
const skillHazardMul = () => hasSkill('hazardHide') ? 0.7 : 1;      // Hazard Hide: fall, cactus, fire, lava
const skillSightMul  = () => hasSkill('clearEyes') ? 0.7 : 1;       // Clear Eyes: how strongly fog, blur, sway, shake work
const skillClimbMul  = () => hasSkill('climber') ? 0.7 : 1;         // Climber: wall-climb stamina
const skillClimbExtra = () => hasSkill('climber') ? 1 : 0;          // ...and one block more of wall
const ORE_BLOCKS = new Set([B.COAL_ORE, B.IRON_ORE, B.COPPER_ORE, B.TIN_ORE, B.GOLD_ORE, B.DIAMOND_ORE,
                            B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, B.TOPAZ_ORE]);
// Prospector: a 20% chance of one more of an ore's first drop (a flat +1 until 0.806; 50-loottable.js)
const skillOreBonus  = (blockId) => lootBonus(ORE_BLOCKS.has(blockId) && hasSkill('prospector'));
// Spare Parts: an ammo craft has a 5% chance of one extra, rolled once per craft
function skillSpareParts(outId, crafts) {
  if (!ITEM_PROPS[outId]?.ammo || !hasSkill('spareParts')) return 0;
  let n = 0;
  for (let i = 0; i < crafts; i++) if (Math.random() < 0.05) n++;
  return n;
}
// Fine Work: what a finished craft is stamped with — Well made, if it is something that wears
const skillCraftMeta = (outId) => (hasSkill('fineWork') && ITEM_PROPS[outId]?.durability) ? { wm: 1 } : null;

/* ONE use's worth of wear on a tool or a piece of gear. Every wear site calls this instead of
   subtracting on its own, so Well made and Mender apply everywhere at once:
     - Well made (Fine Work) shrugs a use off one time in ten
     - at zero the item BREAKS. Without Mender that is the end of it: 'gone', the caller clears the
       slot. With Mender it stays where it is at 0 durability — 'broken', useless until repaired
     - something already broken takes no further wear: 'kept'
   Returns 'kept' | 'broken' | 'gone'. */
function wearSlot(s, n = 1) {
  if (!s || s.dur == null || s.dur <= 0) return 'kept';
  if (s.wm && Math.random() < 0.1) return 'kept';
  s.dur = Math.max(0, s.dur - n);
  if (s.dur > 0) return 'kept';
  if (hasSkill('mender')) {
    if (typeof feedWarn === 'function') feedWarn(`${ITEM_PROPS[s.id]?.name || 'Tool'} broke — drag it onto the crafting list to repair`);
    return 'broken';
  }
  if (typeof feedItem === 'function') feedItem(s.id, -1, 'broke');
  return 'gone';
}

/* Timber Shaker: every swing that bites into a standing tree's log shakes it, and each leaf of that
   tree has a 2% chance to fall, dropping what a leaf that fell on its own would. "That tree" is the
   same one felling would take: its natural logs flooded from the cut, then the leaves connected to
   them. Placed logs end the flood, so a build next to a tree is never part of it. */
const SHAKE_CHANCE = 0.02, SHAKE_MAX_LOGS = 64, SHAKE_MAX_LEAVES = 900;
function skillShakeTree(x, y, z) {
  if (!hasSkill('timberShake') || player.canFly) return;
  const logs = [], seen = new Set([x + ',' + y + ',' + z]), stack = [[x, y, z]];
  while (stack.length && logs.length < SHAKE_MAX_LOGS) {
    const [cx, cy, cz] = stack.pop();
    logs.push([cx, cy, cz]);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const nx = cx + dx, ny = cy + dy, nz = cz + dz, k = nx + ',' + ny + ',' + nz;
      if (seen.has(k)) continue;
      seen.add(k);
      const v = getBlock(nx, ny, nz);
      if (isAnyLog(v & 255) && !isPlacedLog(v)) stack.push([nx, ny, nz]);
    }
  }
  /* The leaf flood keeps its OWN visited set: the log flood above marks every neighbour of every log
     as seen, leaves included, and sharing that set would hide exactly the leaves touching the trunk. */
  const leaves = [], lq = [], leafSeen = new Set();
  const tryLeaf = (nx, ny, nz) => {
    const k = nx + ',' + ny + ',' + nz;
    if (leafSeen.has(k)) return;
    leafSeen.add(k);
    const v = getBlock(nx, ny, nz);
    if (_isLeafVal(v)) { leaves.push([nx, ny, nz, v & 255]); lq.push([nx, ny, nz]); }
  };
  const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [lx, ly, lz] of logs) for (const [dx, dy, dz] of D6) tryLeaf(lx + dx, ly + dy, lz + dz);
  while (lq.length && leaves.length < SHAKE_MAX_LEAVES) {
    const [cx, cy, cz] = lq.pop();
    for (const [dx, dy, dz] of D6) tryLeaf(cx + dx, cy + dy, cz + dz);
  }
  let fell = null;
  for (const [lx, ly, lz, id] of leaves) {
    if (Math.random() >= SHAKE_CHANCE) continue;
    setBlock(lx, ly, lz, B.AIR);
    for (const d of blockDrop(id, true)) for (let n = 0; n < d.count; n++) spawnDrop(d.id, lx, ly, lz);
    fell = fell || [lx, ly, lz, id];
  }
  if (fell && typeof playBlockSound === 'function') playBlockSound(fell[3], 'break', fell[0], fell[1], fell[2]);
}
