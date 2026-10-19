'use strict';
/* woods/woods.js: THE WOODS TABLE. One entry per wood, and the lists the rest of the game makes from it.

   Each wood's own file adds its entry with defineWood: oak.js, birch.js, spruce.js, rime.js, palm.js, dry-bush.js,
   acacia.js.
   THEIR ORDER IN index.html IS THE ORDER OF EVERY LIST made here (the creative palette, the recipe groups, the
   smelting book), so a new wood goes after the others.

   WHAT AN ENTRY HOLDS (a wood leaves out what it does not have)

     its blocks, by id
       log, stripped, hollow, planks, leaves, sapling     (rime and acacia have no sapling, palm no hollow log, the
                                                           dry bush only leaves)
     what it is like
       name       what it is called
       tree       false: not a tree (the dry bush). Its leaves stand on the ground: they never decay, never
                  lie as litter and cannot be stacked in layers
       seasonal   true: its leaves thin out in autumn and winter (seasons/seasons.js)
       apples     true: its leaves may drop an apple (50-loottable.js). Every leaf drops sticks, and its own
                  sapling if the wood has one
       shroom     the mushroom a lying hollow log of it grows (woods/log-mushrooms.js)
     its numbers
       charcoalS  seconds a log takes to burn to charcoal in a furnace (not given: 4; blocks/furnace.js)
       burn       { log, planks, leaves }: [seconds to burn away, chance a tick to pass the fire on], where it
                  differs from WOOD_BURN below (53-storms.js)
       xp         { log, hollow, sapling }: XP for breaking its log and its hollow log, and for a sapling of it
                  that grew (player/leveling.js). Not given: that block pays what any block pays
     its sapling
       saplingOn  'sand': it takes grass, dirt, sand or red sand (the palm). Not given: grass only
                  (player/place-block.js)
       grow       (x, y, z) => builds its tree where its sapling stood (the shapes: woods/saplings.js)

   WHO READS IT: the fire table (53-storms.js), the recipe groups (items/recipes.js), charcoal and sapling fuel
   (blocks/furnace.js), stripping and leaf litter (woods/felling.js), leaf decay (woods/leaf-decay.js), mushrooms
   on logs (woods/log-mushrooms.js), saplings (woods/saplings.js, player/place-block.js), leaf drops
   (50-loottable.js), the tools' blocks and LEAF_BLOCKS (blocks/mining-rules.js), the creative palette
   (player/inventory.js), wading through leaves (player/movement.js), XP (player/leveling.js), the first quests
   (player/quests.js), what may sit under a log (player/breaking.js) and autumn (seasons/seasons.js).

   WHAT IT DOES NOT HOLD YET, so a new wood is still added there by hand:
     - its blocks themselves: ids, tiles and PROPS (blocks/ids.js, blocks/tiles.js, woods/wood-blocks.js,
       woods/hollow-logs.js), and three lists in the block core (_ALL_PLANKS in blocks/looks.js, the leaf layers
       in shapes/shape-blocks.js). Those run in the workers too, where this table does not exist
     - its tree in a new world (woods/gen-*.js, worker code)
     - its planks recipe: a recipe's place in its list is in the saves, so it is appended by hand
       (items/recipes.js)

   Loaded right after the block ids exist (chunks/voxel-core.js) and before everything that makes a list from it.
   An entry is read while its file loads: outside a function it may name block ids (B) and nothing loaded later. */
const WOODS = {};
const WOOD_PARTS = ['log', 'stripped', 'hollow', 'planks', 'leaves', 'sapling'];
const _WOOD_OF = {};                     // block id -> the wood it is a part of
function defineWood(woodKey, def) {
  def.key = woodKey;
  WOODS[woodKey] = def;
  for (const part of WOOD_PARTS) if (def[part] != null) _WOOD_OF[def[part]] = def;
  return def;
}

// every wood, in the order their files load
const woodList = () => Object.values(WOODS);
// the wood a block id is a part of (any of its six blocks), or null
const woodOf = (id) => _WOOD_OF[id] || null;
/* The ids of one part across the woods, in order: woodBlocks('planks') is every kind of planks. `pick` keeps only
   the woods it says yes to: woodBlocks('leaves', isTreeWood) leaves the dry bush out. */
function woodBlocks(part, pick = null) {
  const out = [];
  for (const w of woodList()) if (w[part] != null && (!pick || pick(w))) out.push(w[part]);
  return out;
}
// one wood's log in every form it has: log, stripped, hollow (what saws into its planks)
const woodLogs = (woodKey) => [WOODS[woodKey].log, WOODS[woodKey].stripped, WOODS[woodKey].hollow].filter(id => id != null);
const isTreeWood = (w) => w.tree !== false;
const isSapling = (id) => { const w = _WOOD_OF[id]; return !!w && w.sapling === id; };

/* How wood burns as a block on fire: [seconds to burn away, chance a tick to pass the fire on]. Logs (stripped
   and hollow too) and planks pass it on as readily as each other, leaves much more. A wood's own `burn` wins. */
const WOOD_BURN = { log: [9, 0.3], planks: [8, 0.3], leaves: [3.5, 0.5] };
const woodBurn = (w, part) => ((w.burn && w.burn[part]) || WOOD_BURN[part]).slice();
