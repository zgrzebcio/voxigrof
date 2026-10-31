'use strict';
/* voxiGrof — loot tables

   Every drop count in the game rolls here. A drop is no longer "1 to 3" but a list of rolls, each
   tried on its own, and the counts that land add up:

     [[1, 1], [1, 0.6]]    one for sure, and a second 60% of the time

   so the first number of a roll is how many it gives and the second its chance (1 = always). The
   tables are LOOT below, one per kind of drop, and the few places that pay a drop out (blockDrop here,
   _entDropLoot in entities/entities.js, bush pickup in player/placing.js, felling in woods/felling.js) read them.

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
  orePebble:   [[1, 0.75], [1, 0.25]],                    // the rock round any ore: stone pebbles, 0-2
  // plants
  berry:       [[1, 1], [1, 0.75], [1, 0.35]],            // a ripe bush picked
  wheat:       [[1, 1], [1, 0.4]],
  carrot:      [[1, 1]],                                  // a ripe carrot: one; only Lucky Hands adds a second
  cocoaBeans:  [[1, 1], [1, 0.5]],                        // a ripe cocoa pod: one bean, half the time a second (woods/cocoa.js)...
  cocoaFat:    [[1, 0.25]],                               // ...and a quarter of the time a lump of fat
  melon:       [[2, 1], [1, 0.7], [1, 0.5], [1, 0.3], [1, 0.15]],
  salt:        [[1, 0.7], [1, 0.1]],                          // salt crust: 70% one, 10% a second
  fiberCarpet: [[1, 0.85], [1, 0.1625]],                      // a fiber carpet layer: 85% one fiber, 16% a second (25% more 0.827; +10 points each 0.8441)
  ashLayer:    [[1, 0.5]],                                    // an ash layer: ashes half the time
  flower:      [[1, 0.6]],                                    // a flower picked or broken: 60% one fiber (50% until 0.8441)
  // leaves, as they decay (or cut with a tool); by bare hand every chance is halved
  stick:       [[1, 0.21], [1, 0.105], [1, 0.021], [1, 0.0035]],   // 30% rarer since 0.826 (0.3, 0.15, 0.03, 0.005)
  apple:       [[1, 0.01]],
  sapling:     [[1, 0.05]],
  dryBush:     [[1, 0.7], [1, 0.2]],                          // sticks from a dry bush picked
  // half as likely each since 0.8442 (1, 0.6, 0.3 and 0.9, 0.5, 0.1 before): a bone block may give nothing now
  // ...and a tenth of that since 0.8444 (0.5, 0.3, 0.15 and 0.45, 0.25, 0.05): most bone blocks give nothing
  boneBlock:   [[1, 0.05], [1, 0.03], [1, 0.015]],            // a bone block broken: bones...
  boneBlockAsh:[[1, 0.045], [1, 0.025], [1, 0.005]],          // ...and bone ash
  // animals
  meat:        [[1, 1], [1, 0.4], [1, 0.05]],             // mutton, beef, pork
  fish:        [[1, 1]],                                  // always exactly one
  leather:     [[1, 1], [1, 0.5], [1, 0.2]],                    // cow, horse; the first 40% likelier, the second 20% (0.7, 0.4 before)
  fat:         [[1, 0.4], [1, 0.15]],
  bearLeather: [[1, 1], [1, 0.6], [1, 0.3], [1, 0.05]],              // a polar bear's thick hide, 1-3
  bearFat:     [[1, 1], [1, 0.8], [1, 0.5], [1, 0.2]],    // ...and all that fat, 1-4
  bearFur:     [[1, 0.9], [1, 0.3]],                      // ...and its fur, 90% one and 30% a second (Butcher adds)
  houndFire:   [[1, 1], [1, 0.33], [1, 0.33]],            // a hellhound: fire, 1-3
  tigerFur:    [[1, 1], [1, 0.4]],                        // a tiger's pelt: fur, one and 40% a second (Butcher adds)
  tigerBone:   [[1, 0.6], [1, 0.25]],                     // ...and a bone or two
  fireKill:    [[1, 1]],                                  // what a hound killed, or a player killed with fire, leaves: 1 fire
  otterFur:    [[1, 0.4], [1, 0.05]],                     // an otter: fur, 40% one and 5% a second
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
  glassySand:  [[1, 1], [1, 0.3]],           // lightning-fused sand: 1-3 shards
  snowball:    [[2, 1], [1, 0.5], [1, 0.25]],
  sulfur:      [[1, 0.6], [1, 0.25]],
  bark:        [[1, 1], [1, 0.4],[1, 0.05]],
  barkStrip:   [[1, 1], [1, 0.2]],                        // a log stripped by holding the right button with a hatchet (woods/felling.js)
  // a termite hill broken (its whole hill, once: blocks/termite-hill.js), and a termite
  hillBrick:   [[2, 0.2]],                                // clay bricks, the earth baked hard
  hillDirt:    [[1, 0.5]],
  hillBark:    [[1, 0.7], [1, 0.45], [1, 0.1]],           // wood bark the termites brought in
  chitin:      [[1, 0.25]],                               // a termite's chitin plate
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
const GRAVEL_FLINT_CHANCE = 0.1;           // a gravel block, and a gravel layer dug off (blocks/layer-drops.js)
const GOURD_FIBER_CHANCE = 0.5;            // a melon or pumpkin also gives a fiber (40% until 0.8441)
const ORE_LOOT = {
  [B.IRON_ORE]: [ITEM.RAW_IRON, 'iron'], [B.GOLD_ORE]: [ITEM.RAW_GOLD, 'gold'],
  [B.COPPER_ORE]: [ITEM.RAW_COPPER, 'copper'], [B.TIN_ORE]: [ITEM.RAW_TIN, 'tin'],
  [B.DIAMOND_ORE]: [ITEM.DIAMOND, 'gem'], [B.EMERALD_ORE]: [ITEM.EMERALD, 'gem'], [B.RUBY_ORE]: [ITEM.RUBY, 'gem'],
  [B.SAPPHIRE_ORE]: [ITEM.SAPPHIRE, 'gem'], [B.TOPAZ_ORE]: [ITEM.TOPAZ, 'gem'],
};
const _drop = (id, n) => (n > 0 ? [{ id, count: n }] : []);

/* Returns [{id, count}, ...] (empty array = no drops). isNatural = the leaf decayed on its own. Takes an id or a cell's VALUE:
   a value with a look (polished stone, blocks/looks.js) gives its block back whole, whatever the block itself drops; a
   value that took a second thing to place (a mossy look's vine, a chest's planks: paidNeedOf, blocks/variants.js) gives
   that back too. */
function blockDrop(blockVal, isNatural = false) {
  // a ladder or a vine in a corner is two of it (blocks/ladders.js)
  if (typeof wallPaired === 'function' && wallPaired(blockVal))
    return blockDrop(wallSingle(blockVal, 0), isNatural).concat(blockDrop(wallSingle(blockVal, 1), isNatural));
  const out = _blockDropOwn(blockVal, isNatural);
  const back = typeof paidNeedOf === 'function' ? paidNeedOf(blockVal) : null;
  if (back != null) out.push({ id: back, count: 1 });
  return out;
}
function _blockDropOwn(blockVal, isNatural) {
  const blockId = blockVal & 255;
  // someone else's bed (a village's, blocks/bed.js) gives one wool and no bed
  if (isForeignBed(blockVal)) return [{ id: B.WOOL, count: 1 }];
  // worked snow and ice, every look of them too: a shovel gets snowballs from snow brick as from snow; ice brick gives nothing, as ice
  if (blockId === B.SNOW_BRICKS) return _drop(ITEM.SNOWBALL, rollLoot(LOOT.snowball));
  if (blockId === B.ICE_BRICKS) return [];
  if (lookOf(blockVal) && blockId !== B.GLASSY_SAND && blockId !== B.COBWEB) return [{ id: blockId, count: 1 }];   // glassy sand's and the cobweb's looks break like them
  // a flint stone is never mined by hand (noTarget), but an explosion can still take one out —
  // and when it does it should hand over the same flint a pickup would
  if (blockId === B.FLINT_ROCK) return [{ id: ITEM.FLINT, count: 1 }];
  if (blockId === B.STONE_PEBBLE) return [{ id: ITEM.STONE_PEBBLE, count: 1 }];   // 0.8095
  if (blockId === B.SEASHELL) return [{ id: ITEM.SEASHELL, count: 1 }];
  // a coconut: whole when ripe, nothing while it is green (its stage, variant bits 0-2: woods/coconuts.js)
  if (blockId === B.COCONUT) return ((blockVal >> 8) & 7) >= PROPS[B.COCONUT].ripeStage ? [{ id: ITEM.COCONUT, count: 1 }] : [];
  // a cocoa pod: beans and now and then fat when ripe, nothing while it is green (its stage: COCOA_BITS, woods/cocoa.js)
  if (blockId === B.COCOA)
    return cocoaRipe(blockVal) ? [..._drop(ITEM.COCOA_BEANS, rollLoot(LOOT.cocoaBeans)), ..._drop(ITEM.FAT, rollLoot(LOOT.cocoaFat))] : [];
  if (blockId === B.SALT_CRUST) return _drop(ITEM.SALT, rollLoot(LOOT.salt));      // 0.8097
  if (blockId === B.ASH) return [{ id: ITEM.ASHES, count: 4 }];                    // a whole block of ash
  if (blockId === B.FIRE) return [];
  if (blockId === B.ICE) return [];                                                // breaks into water
  // a termite hill: what the whole hill gives, rolled for the one cell broken (the rest of a big one goes with nothing)
  if (blockId === B.TERMITE_HILL)
    return [..._drop(ITEM.BRICK, rollLoot(LOOT.hillBrick)), ..._drop(B.DIRT, rollLoot(LOOT.hillDirt)), ..._drop(ITEM.BARK, rollLoot(LOOT.hillBark))];
  /* Torches: a lit one, fire or crystal, comes off as an unlit torch, so breaking and placing again
     never buys a fresh light; an unlit one is a burnt stick, a stick back one time in four. (0.8443 gave a stick for
     any fire torch, and a crystal torch kept its crystal half the time.) */
  if (blockId === B.TORCH || blockId === B.CRYSTAL_TORCH) return [{ id: B.TORCH_UNLIT, count: 1 }];
  if (blockId === B.TORCH_UNLIT) return Math.random() < 0.25 ? [{ id: ITEM.STICK, count: 1 }] : [];
  // a lit glow block gives back half of the five it took (2 or 3); a spent one nothing
  if (blockId === B.GLOWSTONE) return [{ id: ITEM.GLOW_DUST, count: 2 + (Math.random() < 0.5 ? 1 : 0) }];
  if (blockId === B.GLOWCRYSTAL_BLOCK) return [{ id: ITEM.GLOW_CRYSTAL, count: 2 + (Math.random() < 0.5 ? 1 : 0) }];
  if (blockId === B.GLOWSTONE_SPENT || blockId === B.GLOWCRYSTAL_SPENT) return [];
  // a flower comes apart into fiber, never the flower (its dye, picked with shears, comes with the paint update)
  if (FLOWER_BLOCKS.has(blockId)) return _drop(ITEM.FIBER, rollLoot(LOOT.flower));
  // glassy sand, its red and pink looks too, always breaks into glass shards
  if (blockId === B.GLASSY_SAND)
    return _drop(ITEM.GLASS_SHARD, rollLoot(LOOT.glassySand));
  // a look that is a block of its own comes back as the block it is a look of: snow brick gives snow
  const vBase = typeof variantBaseOf === 'function' ? variantBaseOf(blockId) : null;
  if (vBase != null) return [{ id: vBase, count: 1 }];
  if (LEAF_BLOCKS.has(blockId)) {
    /* Leaves: the full chances when a leaf decays or is cut with a tool, half of them when it is
       torn off by hand. Canopy Forager (player/skills.js) scales all three. */
    const hand = !isNatural && typeof heldUseId === 'function' && !isToolItem(heldUseId());
    const mul = (hand ? 0.5 : 1) * (typeof skillLeafMul === 'function' ? skillLeafMul() : 1);
    /* By its wood (the woods table, woods/woods.js): sticks from every leaf; an apple from the woods that bear
       them (`apples`: not a palm); its own sapling if the wood has one (the dry bush has none, so it
       gives sticks only). */
    const wood = woodOf(blockId);
    return [..._drop(ITEM.STICK, rollLoot(LOOT.stick, mul)),
            ...(wood.apples ? _drop(ITEM.APPLE, rollLoot(LOOT.apple, mul)) : []),
            ...(wood.sapling != null ? _drop(wood.sapling, rollLoot(LOOT.sapling, mul)) : [])];
  }
  // an ore also gives the stone it sat in as pebbles (LOOT.orePebble; Prospector's extra one is added where
  // the block is mined, 22-main-loop.js)
  if (blockId === B.COAL_ORE) return [
    { id: ITEM.COAL, count: rollLoot(LOOT.coal) },
    ..._drop(ITEM.COAL_CHUNK, rollLoot(LOOT.coalChunk)),
    ..._drop(ITEM.STONE_PEBBLE, rollLoot(LOOT.orePebble)),
  ];
  if (ORE_LOOT[blockId]) {
    const [id, t] = ORE_LOOT[blockId];
    return [{ id, count: rollLoot(LOOT[t]) }, ..._drop(ITEM.STONE_PEBBLE, rollLoot(LOOT.orePebble))];
  }
  if (blockId === B.GLOW_VINE) return _drop(ITEM.GLOW_CRYSTAL, rollLoot(LOOT.glowCrystal));   // 0.765
  if (blockId === B.COBWEB)    return _drop(ITEM.STRING, rollLoot(LOOT.cobwebString));
  if (blockId === B.GRAVEL) {
    if (Math.random() < GRAVEL_FLINT_CHANCE) return [{ id: ITEM.FLINT, count: 1 }];
    return [{ id: B.GRAVEL, count: 1 }];
  }
  // a gourd comes off its vine with a 40% chance of a fiber too, picked or broken
  if (blockId === B.MELON || blockId === B.PUMPKIN || blockId === B.CANTALOUPE) {
    const out = blockId === B.MELON ? _drop(ITEM.MELON_SLICE, rollLoot(LOOT.melon))
              : blockId === B.CANTALOUPE ? _drop(ITEM.CANTALOUPE_SLICE, rollLoot(LOOT.melon))   // sliced like the melon
              : [{ id: B.PUMPKIN, count: 1 }];
    if (Math.random() < GOURD_FIBER_CHANCE) out.push({ id: ITEM.FIBER, count: 1 });
    return out;
  }
  if (blockId === B.WHEAT) return _drop(ITEM.WHEAT, rollLoot(LOOT.wheat));
  // a carrot: one when ripe (variant 0), nothing while it grows
  if (blockId === B.CARROT) return ((blockVal >> 8) & 7) ? [] : _drop(ITEM.CARROT, rollLoot(LOOT.carrot));
  // grass and berry bushes drop nothing when destroyed — bush pickup is the only way to work them
  if (blockId === B.SHORT_GRASS || blockId === B.TALLGRASS || blockId === B.TALL_LOWER || blockId === B.TALL_UPPER ||
      isBerryBush(blockId)) return [];
  // ...nor do the dry plants
  if (blockId === B.DRY_GRASS || blockId === B.DRY_TALL_LOWER || blockId === B.DRY_TALL_UPPER || blockId === B.DRY_BUSH) return [];
  // a bone block breaks into bones and bone ash, never itself (0.84; ten bones still press into one)
  if (blockId === B.BONE_BLOCK) return [..._drop(ITEM.BONE, rollLoot(LOOT.boneBlock)), ..._drop(ITEM.BONE_ASH, rollLoot(LOOT.boneBlockAsh))];
  if (blockId === B.GLASS) return _drop(ITEM.GLASS_SHARD, rollLoot(LOOT.glassShard));
  if (blockId === B.CLAY)  return [{ id: ITEM.CLAY_BALL, count: 5 }];   // 5, what the block costs
  if (blockId === B.SNOW)  return _drop(ITEM.SNOWBALL, rollLoot(LOOT.snowball));
  if (blockId === B.SUGAR_CANE) return [{ id: ITEM.SUGAR_CANE, count: 1 }];
  if (isSapling(blockId)) return [{ id: blockId, count: 1 }];   // any wood's sapling (woods/woods.js)
  // legacy DOWN_TIP still drops sulfur so terrain-generated tips work; both drop sulfur only, never the tip
  if (blockId === B.SULFUR_DOWN_TIP || blockId === B.SULFUR_UP_TIP) return _drop(ITEM.SULFUR, rollLoot(LOOT.sulfur));
  const override = BLOCK_DROP[blockId];
  if (override === undefined) return [{ id: blockId, count: 1 }];
  if (override === null)      return [];
  return [{ id: override, count: 1 }];
}
