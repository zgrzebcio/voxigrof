'use strict';
/* blocks/mining-rules.js: which tool a block needs and how fast it breaks. MINE_REQ (the tool and tier that keep the
   drop), TOOL_BLOCKS (what each tool is quick on), hand mining, flint pebbles from rock, hollow-log helpers,
   LEAF_BLOCKS and the loose-layer sets. */

// Items (IDs >= 256): ITEM and ITEM_PROPS live in items/items.js since 0.8377, loaded right after this file
/* A pumpkin is food now, not masonry: it goes off in four hours and cannot be planted back into
   the ground in survival. One that grew in the world is still a block, and creative still places them. */
PROPS[B.PUMPKIN].spoil = 14400;
PROPS[B.PUMPKIN].noPlace = true;
// flowers cannot be planted in survival either: picked, they come apart into fiber (FLOWER_BLOCKS, 50-loottable.js)
for (const id of [B.POPPY, B.ORCHID, B.PINCUSHION]) PROPS[id].noPlace = true;

// blocks that only DROP when broken with the right tool type at (or above) a tier.
// Not listed = always drops. Block still breaks either way, just yields nothing.
const MINE_REQ = {
  [B.STONE]:       { tool: 'pick', tier: 2 },
  [B.COBBLE]:      { tool: 'pick', tier: 1 },
  [B.STONE_BRICK]: { tool: 'pick', tier: 2 },
  [B.BRICKS]:      { tool: 'pick', tier: 1 },
  [B.FURNACE]:     { tool: 'pick', tier: 1 },
  [B.COAL_ORE]:    { tool: 'pick', tier: 2 },     // stone pickaxe and up, like stone itself
  [B.COPPER_ORE]:  { tool: 'pick', tier: 2 },     // 0.829
  [B.IRON_ORE]:    { tool: 'pick', tier: 2 },
  [B.TIN_ORE]:     { tool: 'pick', tier: 2 },
  [B.GOLD_ORE]:    { tool: 'pick', tier: 3 },
  // diamond and every gem need a bronze pickaxe (tier 4) or better since 0.774
  [B.DIAMOND_ORE]: { tool: 'pick', tier: 4 },
  [B.EMERALD_ORE]: { tool: 'pick', tier: 4 },
  [B.RUBY_ORE]:    { tool: 'pick', tier: 4 },
  [B.SAPPHIRE_ORE]:{ tool: 'pick', tier: 4 },
  [B.COBWEB]:      { tool: 'sword', tier: 0 },      // any sword cuts the string out; anything else just tears it
  [B.OBSIDIAN]: { tool: 'pick', tier: 5 },          // a steel pickaxe only (bronze is tier 4)
  [B.SNOW]:        { tool: 'shovel', tier: 1 },
  [B.SULFUR_BLOCK]:    { tool: 'pick', tier: 2 },
  [B.SULFUR_DOWN_TIP]: { tool: 'pick', tier: 2 },
  [B.SULFUR_UP_TIP]:   { tool: 'pick', tier: 2 },
  [B.MARBLE]:      { tool: 'pick', tier: 2 },
  [B.GRANITE]:     { tool: 'pick', tier: 2 },
  [B.LIMESTONE]:   { tool: 'pick', tier: 2 },
  [B.DOLOMITE]:    { tool: 'pick', tier: 2 },      // 0.809
  // glow vine: any tool at all harvests its crystals; a bare hand just tears it down
  [B.GLOW_VINE]:   { tool: 'any', tier: 0 },
};
// storage blocks: any pickaxe takes one back up; also on the pickaxe's list and in creative
const STORAGE_BLOCK_IDS = [B.COAL_BLOCK, B.CHARCOAL_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.TIN_BLOCK, B.COPPER_BLOCK,
  B.DIAMOND_BLOCK, B.EMERALD_BLOCK, B.RUBY_BLOCK, B.SAPPHIRE_BLOCK,
  B.RAW_IRON_BLOCK, B.RAW_GOLD_BLOCK, B.RAW_TIN_BLOCK, B.RAW_COPPER_BLOCK, B.TOPAZ_BLOCK];
for (const id of STORAGE_BLOCK_IDS) MINE_REQ[id] = { tool: 'pick', tier: 1 };
// topaz ore needs iron like the other gems; sandstone any pickaxe
MINE_REQ[B.TOPAZ_ORE] = { tool: 'pick', tier: 4 };   // bronze, like the other gems
MINE_REQ[B.SANDSTONE] = MINE_REQ[B.RED_SANDSTONE] = MINE_REQ[B.PINK_SANDSTONE] = { tool: 'pick', tier: 1 };   // pink 0.822
MINE_REQ[B.METAL_CHEST] = { tool: 'pick', tier: 1 };   // any pickaxe takes an opened one home
MINE_REQ[B.ADOBE] = { tool: 'pick', tier: 1 };   // a flint pickaxe keeps it   // 0.8096: flint keeps crafted blocks, not natural rock
/* stone, cobblestone, the rocks, sandstone, terracotta and the furnace keep nothing for a flint pickaxe —
   it still breaks them, but only stone (tier 2) and up brings them home. Stone pebbles are the way round it. */
// does the held item satisfy the block's drop requirement? (hand = tier 0, no tool type)
function mineDropAllowed(heldId, blockId) {
  const req = MINE_REQ[blockId];
  if (!req) return true;
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  return !!(p && p.tool && (req.tool === 'any' || p.tool === req.tool) && (p.tier || 0) >= req.tier);
}

// which blocks each tool class speeds up (material families, incl. their slab/stair forms)
const TOOL_BLOCKS = {
  shovel: new Set([B.SAND, B.RED_SAND, B.PINK_SAND, B.DIRT, B.GRASS, B.SNOW, B.CLAY, B.GRAVEL, B.SALT_CRUST, B.ASH, B.GLASSY_SAND, B.GLASSY_RED_SAND, B.GLASSY_PINK_SAND,
                   B.TERMITE_HILL]),   // glassy 0.824, red and pink 0.8241   // ash 0.8191   // salt crust 0.8091
  pick:   new Set([B.STONE, B.COBBLE, B.COAL_ORE, B.IRON_ORE, B.DIAMOND_ORE, B.BRICKS, B.STONE_BRICK, B.ICE, B.BONE_BLOCK, B.PACKED_ICE,   // ice 0.8321; bone 0.833; packed 0.835
                   B.FURNACE, B.GRASS,
                   B.MARBLE, B.GRANITE, B.LIMESTONE, B.DOLOMITE, B.ADOBE, B.GLASS,   // adobe 0.8091
                   B.SULFUR_BLOCK, B.SULFUR_DOWN_TIP, B.SULFUR_UP_TIP, B.TIN_ORE, B.COPPER_ORE, B.GOLD_ORE,
                   B.EMERALD_ORE, B.RUBY_ORE, B.SAPPHIRE_ORE, ...STORAGE_BLOCK_IDS,
                   B.TOPAZ_ORE, B.SANDSTONE, B.RED_SANDSTONE, B.PINK_SANDSTONE,   // pink 0.822
                   B.METAL_CHEST]),                                               // 0.843
  // every wood's log, stripped log and planks come from the woods table (woods/woods.js); hollow logs join below
  hatchet: new Set([...woodBlocks('log'), ...woodBlocks('stripped'), ...woodBlocks('planks'),
                    B.MELON, B.PUMPKIN, B.CANTALOUPE, B.CRAFTING_BENCH, B.CACTUS, B.CHEST, B.BED,
                    B.CARVED_PUMPKIN, B.JACK_O_LANTERN]),
  hoe:    new Set([...woodBlocks('leaves'), B.HAY]),          // every wood's leaves, the dry bush's too
  // shears are the wool tool; they also snip plant matter cleanly
  shears: new Set([B.WOOL, ...woodBlocks('leaves'), B.SHORT_GRASS, B.TALLGRASS, B.TALL_LOWER, B.TALL_UPPER,
                   B.POPPY, B.ORCHID, B.SUGAR_CANE, B.DRY_GRASS, B.DRY_TALL_LOWER, B.DRY_TALL_UPPER, B.DRY_BUSH]),
  // a blade cuts soft, fibrous things fast — plants, leaves, saplings, melons, cane and webbing-like props
  sword:  new Set([B.COBWEB, ...woodBlocks('leaves'), ...woodBlocks('sapling'), B.HAY, B.MELON, B.PUMPKIN, B.CANTALOUPE, B.SUGAR_CANE,
                   B.BLACK_MUSHROOM, B.WHITE_TALL_MUSHROOM, B.LAVA_MUSHROOM, B.YELLOW_MUSHROOM,
                   B.SHORT_GRASS, B.TALLGRASS, B.TALL_LOWER, B.TALL_UPPER, B.POPPY, B.ORCHID,
                   B.DRY_GRASS, B.DRY_TALL_LOWER, B.DRY_TALL_UPPER, B.DRY_BUSH,
                   B.PINCUSHION, B.RED_MUSHROOM, B.BROWN_MUSHROOM, B.BLUE_MUSHROOM, B.CACTUS]),
};
// variant blocks mine exactly like the block each plays like: same tool, same drop gate
for (const [id, like] of CORE.VARIANT_BLOCKS) {
  if (MINE_REQ[like]) MINE_REQ[id] = MINE_REQ[like];
  for (const k in TOOL_BLOCKS) if (TOOL_BLOCKS[k].has(like)) TOOL_BLOCKS[k].add(id);
}
/* A flint pickaxe on stone or a rock keeps no block, but knocks out a stone pebble, and a second one 25% of
   the time. Not cobblestone: flint keeps that whole. A rock's variants (bricks, polished...) count as the rock. */
const FLINT_PEBBLE_ROCKS = new Set([B.STONE, B.STONE_BRICK, B.GRANITE, B.MARBLE, B.LIMESTONE, B.DOLOMITE]);
for (const [id, like] of CORE.VARIANT_BLOCKS) if (FLINT_PEBBLE_ROCKS.has(like)) FLINT_PEBBLE_ROCKS.add(id);
function flintPebbles(heldId, blockId) {
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  if (!p || p.tool !== 'pick' || (p.tier || 0) !== 1 || !FLINT_PEBBLE_ROCKS.has(blockId)) return 0;
  return 1 + (Math.random() < 0.25 ? 1 : 0);
}
/* Hollow logs: cut with a hatchet like any log. HOLLOW_FILL_OF is what can be packed into one
   (block id -> fill index in its variant); an UPRIGHT one full of dirt or grass takes what grass takes, and
   one full of sand takes a cactus. */
for (const id of woodBlocks('hollow')) TOOL_BLOCKS.hatchet.add(id);
const HOLLOW_FILL_OF = {};
HOLLOW_FILLS.forEach((id, i) => { if (id) HOLLOW_FILL_OF[id] = i; });
const isHollowLog = (v) => PROPS[v & 255]?.model === 'hollow';
const hollowFillOf = (v) => (isHollowLog(v) ? HOLLOW_FILLS[(v >> 10) & 7] || 0 : 0);
const potSoil = (v) => { const f = hollowFillOf(v); return ((v >> 8) & 3) === 0 && (f === B.DIRT || f === B.GRASS); };
const potSand = (v) => { const f = hollowFillOf(v); return ((v >> 8) & 3) === 0 && (f === B.SAND || f === B.RED_SAND); };
// mining-time divisor for held item vs block: 1.5 when the right tool, 1 otherwise
function toolFactor(heldId, blockId) {
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  return (p && p.tool && TOOL_BLOCKS[p.tool] && TOOL_BLOCKS[p.tool].has(blockId)) ? p.toolSpeed : 1;
}
/* Billboards cost a tool NOTHING: a torch, a flower, a sapling, a mushroom. You brush
   them aside — no edge touches anything, so no edge dulls. */
const isFreeBreak = (id) => { const p = PROPS[id & 255]; return !!(p && p.model === 'cross'); };
// ...and the ground layers — leaf litter, snow, any layer stack — are swept, not dug. They still cost the
// ordinary point of wear, they just never count as the WRONG tool for the job. Takes a VALUE.
const isLayerBlock = (v) => {
  const p = PROPS[v & 255];
  return !!(p && (p.model === 'carpet' || CORE.layerCount(v)));
};

/* Using the WRONG tool on a block — a pickaxe on dirt. Costs double wear and pays no
   experience, so a tool is something you pick for the job rather than one blunt instrument.

   True only when some tool class actually CLAIMS the block and what you are holding is not one of
   them. Two cases deliberately excluded: bare hands (nothing to blunt, and hands are not a wrong
   choice), and blocks no class claims at all — glass, wool, a torch have no right tool, so there
   is nothing to get wrong about them. */
function isWrongTool(heldId, blockId) {
  const p = heldId != null && heldId >= 256 ? ITEM_PROPS[heldId] : null;
  if (!p || !p.tool) return false;
  const id = blockId & 255;
  // a billboard or a ground layer is a brush-aside, not a dig — nothing to do wrong
  if (isFreeBreak(id) || isLayerBlock(blockId)) return false;
  let claimed = false;
  for (const cls in TOOL_BLOCKS) {
    if (!TOOL_BLOCKS[cls].has(id)) continue;
    if (cls === p.tool) return false;               // the held tool is one of this block's own
    claimed = true;
  }
  return claimed;
}
/* Bare hands break FOLIAGE and nothing else. Carpets, billboards and leaves come away by
   hand; every solid block needs a tool in hand before the crack even starts. That is what makes
   the flint tier a real gate rather than a convenience — and it is why the flint recipes cost no
   wood, since a log is on the far side of this rule. */
const LEAF_BLOCKS = new Set(woodBlocks('leaves'));   // every wood's leaves (the woods table, woods/woods.js), the dry bush's too
/* Loose blocks: they fall, land as a pile of 8 walk-through layers (pouring into a pile below), and
   a layer of one breaks away to nothing. */
const LOOSE_LAYER_BLOCKS = new Set([B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL, B.FIBER_BLOCK,   // not ash: a whole ash block stands, its layers fall
                                    B.SNOW,     // a whole snow block falls too, and lands as a drift
                                    B.ASH]);    // ...and a whole ash block, landing as a pile of 8 layers
/* By hand, slowly: the loose ground and glass. Twice what a flint tool of the block's own kind takes
   (handMineFactor); sand, gravel and snow come away a layer at a time (DIG_BY_LAYER, 22-main-loop.js), glass whole. */
const DIG_BY_LAYER = new Set([B.SAND, B.RED_SAND, B.PINK_SAND, B.GRAVEL, B.SNOW]);
const HAND_SLOW_BLOCKS = new Set([...DIG_BY_LAYER, B.GLASS, B.GLASSY_SAND, B.GLASSY_RED_SAND, B.GLASSY_PINK_SAND]);
// the bare hand's speed on such a block: half of the flint tool that claims it (a flint pickaxe for glass, no class)
function handMineFactor(id) {
  const FLINT = { shovel: ITEM.FLINT_SHOVEL, pick: ITEM.FLINT_PICKAXE, hatchet: ITEM.FLINT_HATCHET };
  for (const cls in TOOL_BLOCKS) if (TOOL_BLOCKS[cls].has(id & 255) && FLINT[cls]) return (ITEM_PROPS[FLINT[cls]].toolSpeed || 1) / 2;
  return (ITEM_PROPS[ITEM.FLINT_PICKAXE].toolSpeed || 1) / 2;
}
/* FURNITURE comes apart by hand too. A bench, a chest, a bed and a hay bale are things
   you built or stacked, not ground you dig — needing an axe to move your own bed was a chore, and
   the flint gate is about the WORLD, not your furniture. They also pay no XP (see XP_BLOCK in
   player/leveling.js), so hand-breaking them is housekeeping and never a grind. */
const HAND_BREAK_BLOCKS = new Set([B.CRAFTING_BENCH, B.CHEST, B.BED, B.HAY, B.FIBER_BLOCK, B.LADDER,   // + fiber block, ladder
                                   B.MORTAR]);                                                         // + mortar
// takes a VALUE since 0.785: a stack of snow, leaves or sand comes away by hand, a stone layer does not
function handBreakable(id) {
  const p = PROPS[id & 255];
  if (!p) return false;
  return p.model === 'cross' || p.model === 'carpet' || (p.layerStack && CORE.layerCount(id) > 0) || p.model === 'wall'
      || LEAF_BLOCKS.has(id & 255) || HAND_BREAK_BLOCKS.has(id & 255) || HAND_SLOW_BLOCKS.has(id & 255);   // slow ones 0.8244
}
// does what is in hand count as a tool at all? (any tool class — pick, shovel, hatchet, hoe, ...)
const isToolItem = (id) => !!(id != null && id >= 256 && ITEM_PROPS[id] && ITEM_PROPS[id].tool);

// blockDrop, BLOCK_DROP and every drop chance live in 50-loottable.js since 0.806
