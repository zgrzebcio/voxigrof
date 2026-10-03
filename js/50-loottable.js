'use strict';
/* voxiGrof — loot tables (0.806)

   Every drop count in the game rolls here. A drop is no longer "1 to 3" but a list of rolls, each
   tried on its own, and the counts that land add up:

     [[1, 1], [1, 0.6]]    one for sure, and a second 60% of the time

   so the first number of a roll is how many it gives and the second its chance (1 = always). The
   tables are LOOT below, one per kind of drop, and the few places that pay a drop out (blockDrop here,
   _entDropLoot in 28-entities.js, bush pickup in 13-actions.js, felling in 33-felling.js) read them.

   Skills: Prospector and Butcher give a 20% chance of one more of the FIRST drop (the ore, the meat).
   Canopy Forager scales the leaf chances. */

// how many a roll list gives; `mul` scales every chance (a skill, or a bare hand on leaves)
function rollLoot(rolls, mul = 1) {
  let n = 0;
  for (const [count, chance] of rolls) if (chance >= 1 || Math.random() < chance * mul) n += count;
  return n;
}
const LOOT_BONUS_CHANCE = 0.2;              // Prospector / Butcher: one more of the first drop

const LOOT = {
  // ores
  iron:        [[1, 1], [1, 0.6]],
  gold:        [[1, 1], [1, 0.6]],
  copper:      [[1, 1], [1, 0.7], [1, 0.4]],
  tin:         [[1, 1], [1, 0.7], [1, 0.4]],
  coal:        [[1, 1], [1, 0.8], [1, 0.5]],
  coalChunk:   [[2, 1], [1, 0.7], [1, 0.4], [1, 0.25]],
  gem:         [[1, 1], [1, 0.4]],                        // diamond, emerald, ruby, sapphire, topaz
  // plants
  berry:       [[1, 1], [1, 0.75], [1, 0.35]],            // a ripe bush picked
  wheat:       [[1, 1], [1, 0.4]],
  melon:       [[2, 1], [1, 0.7], [1, 0.5], [1, 0.3], [1, 0.15]],
  salt:        [[1, 0.7], [1, 0.1]],                          // salt crust: 70% one, 10% a second (0.8097)
  fiberCarpet: [[1, 0.75], [1, 0.0625]],                      // a fiber carpet layer: 75% one fiber, 6% a second (0.819; 25% more 0.827)
  ashLayer:    [[1, 0.5]],                                    // an ash layer: ashes half the time (0.8191)
  flower:      [[1, 0.5]],                                    // a flower picked or broken: half the time one fiber (0.826)
  // leaves, as they decay (or cut with a tool); by bare hand every chance is halved
  stick:       [[1, 0.21], [1, 0.105], [1, 0.021], [1, 0.0035]],   // 30% rarer since 0.826 (0.3, 0.15, 0.03, 0.005)
  apple:       [[1, 0.01]],
  sapling:     [[1, 0.05]],
  // animals
  meat:        [[1, 1], [1, 0.4], [1, 0.05]],             // mutton, beef, pork
  fish:        [[1, 1]],                                  // always exactly one
  leather:     [[1, 0.7], [1, 0.4]],                      // cow, horse
  fat:         [[1, 0.5], [1, 0.15]],
  woolString:  [[1, 0.7], [1, 0.2]],                      // a woolly sheep killed
  shearWool:   [[1, 1], [1, 0.6], [1, 0.25]],             // shearing
  // monsters
  monster:     [[1, 1], [2, 0.33]],                       // rotten flesh, bones
  arrows:      [[1, 0.6], [1, 0.25]],                     // what a skeleton had left in its quiver
  villager:    [[1, 1], [1, 0.5], [1, 0.2]],              // feathers, bread
  // everything else that used to be a range
  glowCrystal: [[1, 1], [1, 0.4]],
  cobwebString:[[1, 1], [1, 0.5], [1, 0.2]],
  glassShard:  [[2, 1], [1, 0.6], [1, 0.3]],
  glassySand:  [[1, 0.8], [1, 0.1]],           // lightning-fused sand (0.824): 0-2 shards
  snowball:    [[2, 1], [1, 0.5], [1, 0.25]],
  sulfur:      [[1, 0.6], [1, 0.25]],
  bark:        [[1, 1], [1, 0.4]],
};
// Prospector (ores) and Butcher (animals): 20% for one more
const lootBonus = (has) => (has && Math.random() < LOOT_BONUS_CHANCE) ? 1 : 0;

/* ---------------------------------- blocks ---------------------------------- */
// Block drop table: block ID -> drop block ID (null = nothing, undefined = drop self)
const BLOCK_DROP = {
  [B.GRASS]: B.DIRT,
  [B.STONE]: B.COBBLE,
};
const FLOWER_BLOCKS = new Set([B.POPPY, B.ORCHID, B.PINCUSHION]);   // 0.826
const GRAVEL_FLINT_CHANCE = 0.05;          // a gravel block, and since 0.799 a gravel layer too (22-main-loop.js)
const GOURD_FIBER_CHANCE = 0.4;            // a melon or pumpkin also gives a fiber (0.799)
const ORE_LOOT = {
  [B.IRON_ORE]: [ITEM.RAW_IRON, 'iron'], [B.GOLD_ORE]: [ITEM.RAW_GOLD, 'gold'],
  [B.COPPER_ORE]: [ITEM.RAW_COPPER, 'copper'], [B.TIN_ORE]: [ITEM.RAW_TIN, 'tin'],
  [B.DIAMOND_ORE]: [ITEM.DIAMOND, 'gem'], [B.EMERALD_ORE]: [ITEM.EMERALD, 'gem'], [B.RUBY_ORE]: [ITEM.RUBY, 'gem'],
  [B.SAPPHIRE_ORE]: [ITEM.SAPPHIRE, 'gem'], [B.TOPAZ_ORE]: [ITEM.TOPAZ, 'gem'],
};
const _drop = (id, n) => (n > 0 ? [{ id, count: n }] : []);

// Returns [{id, count}, ...] (empty array = no drops). isNatural = the leaf decayed on its own.
function blockDrop(blockId, isNatural = false) {
  // a flint stone is never mined by hand (noTarget), but an explosion can still take one out —
  // and when it does it should hand over the same flint a pickup would
  if (blockId === B.FLINT_ROCK) return [{ id: ITEM.FLINT, count: 1 }];
  if (blockId === B.STONE_PEBBLE) return [{ id: ITEM.STONE_PEBBLE, count: 1 }];   // 0.8095
  if (blockId === B.SALT_CRUST) return _drop(ITEM.SALT, rollLoot(LOOT.salt));      // 0.8097
  if (blockId === B.ASH) return [{ id: ITEM.ASHES, count: 4 }];                    // a whole block of ash (0.8191)
  if (blockId === B.FIRE) return [];
  if (blockId === B.ICE) return [];                                                // breaks into water (0.8321)
  /* Torches (0.834): a lit fire torch comes off unlit, a crystal one keeps its crystal half the time, so breaking and
     placing again never buys a fresh light; an unlit one is a burnt stick, a stick back one time in four. */
  if (blockId === B.TORCH) return [{ id: B.TORCH_UNLIT, count: 1 }];
  if (blockId === B.CRYSTAL_TORCH) return [{ id: Math.random() < 0.5 ? B.CRYSTAL_TORCH : B.TORCH_UNLIT, count: 1 }];
  if (blockId === B.TORCH_UNLIT) return Math.random() < 0.25 ? [{ id: ITEM.STICK, count: 1 }] : [];
  // a lit glow block gives back half of the five it took (2 or 3); a spent one nothing (0.834)
  if (blockId === B.GLOWSTONE) return [{ id: ITEM.GLOW_DUST, count: 2 + (Math.random() < 0.5 ? 1 : 0) }];
  if (blockId === B.GLOWCRYSTAL_BLOCK) return [{ id: ITEM.GLOW_CRYSTAL, count: 2 + (Math.random() < 0.5 ? 1 : 0) }];
  if (blockId === B.GLOWSTONE_SPENT || blockId === B.GLOWCRYSTAL_SPENT) return [];
  // a flower comes apart into fiber, never the flower (0.826; its dye, picked with shears, comes with the paint update)
  if (FLOWER_BLOCKS.has(blockId)) return _drop(ITEM.FIBER, rollLoot(LOOT.flower));
  /* Glassy sand, and its red and pink looks (variants since 0.8263), always break into glass shards: ahead of the
     variant rule below, which would hand a red one back as plain glassy sand */
  if (blockId === B.GLASSY_SAND || blockId === B.GLASSY_RED_SAND || blockId === B.GLASSY_PINK_SAND)   // 0.824; red, pink 0.8241
    return _drop(ITEM.GLASS_SHARD, rollLoot(LOOT.glassySand));
  // a block placed as a variant comes back as the block it is a variant of: stone brick gives stone (0.794)
  const vBase = typeof variantBaseOf === 'function' ? variantBaseOf(blockId) : null;
  // ...unless it drops what its base DROPS: a gem cluster on plain stone gives gems, not a cluster (0.7947)
  if (vBase != null) return PROPS[blockId]?.dropsAsBase ? blockDrop(vBase, isNatural) : [{ id: vBase, count: 1 }];
  if (LEAF_BLOCKS.has(blockId)) {
    /* Leaves (0.806): the full chances when a leaf decays or is cut with a tool, half of them when it is
       torn off by hand. Canopy Forager (45-skills.js) scales all three. */
    const hand = !isNatural && typeof heldUseId === 'function' && !isToolItem(heldUseId());
    const mul = (hand ? 0.5 : 1) * (typeof skillLeafMul === 'function' ? skillLeafMul() : 1);
    const sap = blockId === B.BIRCH_LEAVES ? B.BIRCH_SAPLING : blockId === B.SPRUCE_LEAVES ? B.SPRUCE_SAPLING : B.OAK_SAPLING;
    return [..._drop(ITEM.STICK, rollLoot(LOOT.stick, mul)),
            ..._drop(ITEM.APPLE, rollLoot(LOOT.apple, mul)),
            ..._drop(sap, rollLoot(LOOT.sapling, mul))];
  }
  if (blockId === B.COAL_ORE) return [
    { id: ITEM.COAL, count: rollLoot(LOOT.coal) },
    ..._drop(ITEM.COAL_CHUNK, rollLoot(LOOT.coalChunk)),
  ];
  if (ORE_LOOT[blockId]) { const [id, t] = ORE_LOOT[blockId]; return [{ id, count: rollLoot(LOOT[t]) }]; }
  if (blockId === B.GLOW_VINE) return _drop(ITEM.GLOW_CRYSTAL, rollLoot(LOOT.glowCrystal));   // 0.765
  if (blockId === B.COBWEB)    return _drop(ITEM.STRING, rollLoot(LOOT.cobwebString));
  if (blockId === B.GRAVEL) {
    if (Math.random() < GRAVEL_FLINT_CHANCE) return [{ id: ITEM.FLINT, count: 1 }];
    return [{ id: B.GRAVEL, count: 1 }];
  }
  // a gourd comes off its vine with a 40% chance of a fiber too (0.799), picked or broken
  if (blockId === B.MELON || blockId === B.PUMPKIN || blockId === B.CANTALOUPE) {
    const out = blockId === B.MELON ? _drop(ITEM.MELON_SLICE, rollLoot(LOOT.melon))
              : blockId === B.CANTALOUPE ? _drop(ITEM.CANTALOUPE_SLICE, rollLoot(LOOT.melon))   // sliced like the melon (0.8091)
              : [{ id: B.PUMPKIN, count: 1 }];
    if (Math.random() < GOURD_FIBER_CHANCE) out.push({ id: ITEM.FIBER, count: 1 });
    return out;
  }
  if (blockId === B.WHEAT) return _drop(ITEM.WHEAT, rollLoot(LOOT.wheat));
  // grass and berry bushes drop nothing when destroyed — bush pickup is the only way to work them
  if (blockId === B.TALLGRASS || blockId === B.TALL_LOWER || blockId === B.TALL_UPPER ||
      isBerryBush(blockId)) return [];
  if (blockId === B.GLASS) return _drop(ITEM.GLASS_SHARD, rollLoot(LOOT.glassShard));
  if (blockId === B.CLAY)  return [{ id: ITEM.CLAY_BALL, count: 5 }];   // 5, what the block costs (0.769)
  if (blockId === B.SNOW)  return _drop(ITEM.SNOWBALL, rollLoot(LOOT.snowball));
  if (blockId === B.SUGAR_CANE) return [{ id: ITEM.SUGAR_CANE, count: 1 }];
  if (blockId === B.OAK_SAPLING || blockId === B.BIRCH_SAPLING || blockId === B.SPRUCE_SAPLING)
    return [{ id: blockId, count: 1 }];
  // legacy DOWN_TIP still drops sulfur so terrain-generated tips work; both drop sulfur only, never the tip
  if (blockId === B.SULFUR_DOWN_TIP || blockId === B.SULFUR_UP_TIP) return _drop(ITEM.SULFUR, rollLoot(LOOT.sulfur));
  const override = BLOCK_DROP[blockId];
  if (override === undefined) return [{ id: blockId, count: 1 }];
  if (override === null)      return [];
  return [{ id: override, count: 1 }];
}
