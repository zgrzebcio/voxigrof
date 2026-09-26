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
  // leaves, as they decay (or cut with a tool); by bare hand every chance is halved
  stick:       [[1, 0.3], [1, 0.15], [1, 0.03], [1, 0.005]],
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
