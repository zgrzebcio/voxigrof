'use strict';
/* items/finish.js: the passes over the whole item table, once every group file has added its items (items/items.js):
   how long tools and armor last, and what food leaves when it goes off. Loaded LAST of the items/ files. */

/* ---- tool wear ----
   A hoe used to wear out a quarter faster than the rest of its set for no reason anyone could name, so
   each one now lasts exactly as long as its own pickaxe. Then every tool and weapon — not armor, and not
   the hammer or chisel, whose wear is one point per shaped block — gained 20%. Written as a pass over the
   table rather than 30 edited numbers, so the ratios between materials stay where they were. */
for (const [hoe, pick] of [[ITEM.FLINT_HOE, ITEM.FLINT_PICKAXE], [ITEM.STONE_HOE, ITEM.STONE_PICKAXE],
                           [ITEM.IRON_HOE, ITEM.IRON_PICKAXE], [ITEM.GOLDEN_HOE, ITEM.GOLDEN_PICKAXE],
                           [ITEM.BRONZE_HOE, ITEM.BRONZE_PICKAXE], [ITEM.STEEL_HOE, ITEM.STEEL_PICKAXE]])
  if (ITEM_PROPS[hoe] && ITEM_PROPS[pick]) ITEM_PROPS[hoe].durability = ITEM_PROPS[pick].durability;
const TOOL_DURABILITY_MUL = 1.2;
for (const p of Object.values(ITEM_PROPS))
  if (p && p.durability && (p.tool || p.ranged || p.shield)) p.durability = Math.round(p.durability * TOOL_DURABILITY_MUL);
/* Armor wear: a helmet, leggings, boots and gloves last exactly as long as the chestplate of their material
   (leather 80, iron 240, golden 112, diamond 528, cloth 60). A piece saved with the wear it had keeps that number. */
{
  const chest = {};
  for (const p of Object.values(ITEM_PROPS)) if (p && p.armorMat && p.equip === 'chestplate' && p.durability) chest[p.armorMat] = p.durability;
  for (const p of Object.values(ITEM_PROPS)) if (p && p.armor && p.armorMat && chest[p.armorMat]) p.durability = chest[p.armorMat];
}
// every meat leaves rotten flesh behind when it turns, cooked or raw
for (const id of [ITEM.MUTTON, ITEM.COOKED_MUTTON, ITEM.BEEF, ITEM.COOKED_BEEF, ITEM.PORK, ITEM.COOKED_PORK,
                  ITEM.COD, ITEM.COOKED_COD, ITEM.SALMON, ITEM.COOKED_SALMON,          // fish too
                  ITEM.PIKE, ITEM.COOKED_PIKE, ITEM.CATFISH, ITEM.COOKED_CATFISH])
  if (ITEM_PROPS[id]) ITEM_PROPS[id].spoilInto = ITEM.ROTTEN_FLESH;
/* ...and fruit and plant food leaves a fiber: apples, the melon and cantaloupe slices, every berry, the
   pumpkin and the grilled mushrooms (those two are blocks: their clocks are in PROPS). Baked and cooked dishes
   (bread, pies, the stew) still leave nothing but their bowl or bucket. */
for (const id of [ITEM.APPLE, ITEM.MELON_SLICE, ITEM.CANTALOUPE_SLICE, ITEM.BERRIES, ITEM.BLUE_BERRIES,
                  ITEM.BLACKBERRIES, ITEM.YELLOW_BERRIES, ITEM.WHITE_BERRIES])
  if (ITEM_PROPS[id]) ITEM_PROPS[id].spoilInto = ITEM.FIBER;
for (const id of [B.PUMPKIN, B.GRILLED_RED_MUSHROOM, B.GRILLED_BROWN_MUSHROOM, B.GRILLED_BLUE_MUSHROOM,
                  B.GRILLED_BLACK_MUSHROOM, B.GRILLED_WHITE_MUSHROOM, B.GRILLED_YELLOW_MUSHROOM])
  if (id != null && PROPS[id]) PROPS[id].spoilInto = ITEM.FIBER;
