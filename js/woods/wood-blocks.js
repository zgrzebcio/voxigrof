'use strict';
/* woods/wood-blocks.js: the blocks of the woods. Stripped logs, spruce, rime and palm (log, planks, leaves), and the
   Dryland's dry leaves.
   A part of BLOCK_CORE (blocks/blocks.js): it fills PROPS for its blocks. */

corePart('blocks', function () {
  /* Stripped logs: what a log becomes after the first axe hit. Same 'log' model so the 0.6692
     gap-fill still welds them to their neighbours, and softer than a live log because the bark
     is already off. */
  PROPS[B.STRIPPED_LOG]       = { name:'Stripped oak log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:3.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_LOG,T.STRIPPED_LOG,T.STRIPPED_LOG_TOP,T.STRIPPED_LOG_TOP,T.STRIPPED_LOG,T.STRIPPED_LOG], desc: '' };
  PROPS[B.STRIPPED_BIRCH_LOG] = { name:'Stripped birch log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:3.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_BIRCH_LOG,T.STRIPPED_BIRCH_LOG,T.STRIPPED_BIRCH_LOG_TOP,T.STRIPPED_BIRCH_LOG_TOP,T.STRIPPED_BIRCH_LOG,T.STRIPPED_BIRCH_LOG], desc: '' };
  /* Spruce: the cold-forest conifer. */
  PROPS[B.SPRUCE_LOG]          = { name:'Spruce log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:4.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.SPRUCE_LOG,T.SPRUCE_LOG,T.SPRUCE_LOG_TOP,T.SPRUCE_LOG_TOP,T.SPRUCE_LOG,T.SPRUCE_LOG], desc: '' };
  PROPS[B.STRIPPED_SPRUCE_LOG] = { name:'Stripped spruce log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:3.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_SPRUCE_LOG,T.STRIPPED_SPRUCE_LOG,T.STRIPPED_SPRUCE_LOG_TOP,T.STRIPPED_SPRUCE_LOG_TOP,T.STRIPPED_SPRUCE_LOG,T.STRIPPED_SPRUCE_LOG], desc: '' };
  PROPS[B.SPRUCE_PLANKS]       = { name:'Spruce planks', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:3.0, type:'wood', faces:[T.SPRUCE_PLANKS,T.SPRUCE_PLANKS,T.SPRUCE_PLANKS,T.SPRUCE_PLANKS,T.SPRUCE_PLANKS,T.SPRUCE_PLANKS], desc: '' };
  PROPS[B.SPRUCE_LEAVES]       = { name:'Spruce leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:50, hardness:0.4, type:'grass', faces:[T.SPRUCE_LEAVES,T.SPRUCE_LEAVES,T.SPRUCE_LEAVES,T.SPRUCE_LEAVES,T.SPRUCE_LEAVES,T.SPRUCE_LEAVES], desc: '' };
  PROPS[B.SPRUCE_SAPLING]      = { name:'Spruce sapling', solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.8,0.75]], faces:[T.SPRUCE_SAPLING], desc: '' };
  /* Rime: the frozen trees of the Coldest Deep Snow, wood hard with frost all through. Its leaves give sticks,
     never a sapling or an apple (50-loottable.js). */
  PROPS[B.RIME_LOG]          = { name:'Rime log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:5.0, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.RIME_LOG,T.RIME_LOG,T.RIME_LOG_TOP,T.RIME_LOG_TOP,T.RIME_LOG,T.RIME_LOG], desc: 'Frozen wood from the Coldest Deep Snow' };
  PROPS[B.STRIPPED_RIME_LOG] = { name:'Stripped rime log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:3.5, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_RIME_LOG,T.STRIPPED_RIME_LOG,T.STRIPPED_RIME_LOG_TOP,T.STRIPPED_RIME_LOG_TOP,T.STRIPPED_RIME_LOG,T.STRIPPED_RIME_LOG], desc: '' };
  PROPS[B.RIME_PLANKS]       = { name:'Rime planks', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:3.5, type:'wood', faces:Array(6).fill(T.RIME_PLANKS), desc: '' };
  PROPS[B.RIME_LEAVES]       = { name:'Rime leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:50, hardness:0.5, type:'grass', faces:Array(6).fill(T.RIME_LEAVES), desc: 'Needles under a crust of frost' };
  /* Palm: the oases' and warm shores' tree, a slim bending trunk under a crown of drooping fronds. Its sapling
     takes grass, dirt or sand. */
  PROPS[B.PALM_LOG]          = { name:'Palm log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:3.5, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.PALM_LOG,T.PALM_LOG,T.PALM_LOG_TOP,T.PALM_LOG_TOP,T.PALM_LOG,T.PALM_LOG], desc: 'Grows in oases and on warm shores' };
  PROPS[B.STRIPPED_PALM_LOG] = { name:'Stripped palm log', solid:true, opaque:false, raycast:true, pass:0, model:'log', rot:'all', stack:50, hardness:2.5, type:'wood', boxes:LOG_CUT_COLL[0], boxesByVar:LOG_CUT_COLL, faces:[T.STRIPPED_PALM_LOG,T.STRIPPED_PALM_LOG,T.STRIPPED_PALM_LOG_TOP,T.STRIPPED_PALM_LOG_TOP,T.STRIPPED_PALM_LOG,T.STRIPPED_PALM_LOG], desc: '' };
  PROPS[B.PALM_PLANKS]       = { name:'Palm planks', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:3.0, type:'wood', faces:Array(6).fill(T.PALM_PLANKS), desc: '' };
  PROPS[B.PALM_LEAVES]       = { name:'Palm leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:50, hardness:0.4, type:'grass', faces:Array(6).fill(T.PALM_LEAVES), desc: '' };
  /* Dry leaves: the Dryland's big dry bushes, oak leaves gone pale. They stand on the ground with no wood, so they
     never decay (not leaves to 22-main-loop.js), and give sticks only (50-loottable.js). */
  PROPS[B.DRY_LEAVES]        = { name:'Dry leaves', solid:false, opaque:false, raycast:true, pass:1, model:'cube', stack:50, hardness:0.4, type:'grass', faces:Array(6).fill(T.DRY_LEAVES),
                                 desc: 'The Dryland\'s bushes. Gives sticks' };
  PROPS[B.PALM_SAPLING]      = { name:'Palm sapling', solid:false, opaque:false, raycast:true, pass:1, model:'cross', topOnly:true, stack:79, hardness:0, type:'grass', boxes:[[0.25,0,0.25,0.75,0.8,0.75]], faces:[T.PALM_SAPLING],
                                 desc: 'Plant it on grass, dirt or sand' };
  PROPS[B.COBBLE]      = { name:'Cobblestone', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:8.0, type:'stone', faces:[T.COBBLE,T.COBBLE,T.COBBLE,T.COBBLE,T.COBBLE,T.COBBLE], desc: '' };
  PROPS[B.COAL_ORE]    = { name:'Coal ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:9.0, type:'stone', faces:[T.COAL_ORE,T.COAL_ORE,T.COAL_ORE,T.COAL_ORE,T.COAL_ORE,T.COAL_ORE], desc: '' };
  PROPS[B.IRON_ORE]    = { name:'Iron ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:12.0, type:'stone', selfGlow:2, faces:[T.IRON_ORE,T.IRON_ORE,T.IRON_ORE,T.IRON_ORE,T.IRON_ORE,T.IRON_ORE], desc: '' };
  PROPS[B.DIAMOND_ORE] = { name:'Diamond ore', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:18.0, type:'stone', selfGlow:3, faces:[T.DIAMOND_ORE,T.DIAMOND_ORE,T.DIAMOND_ORE,T.DIAMOND_ORE,T.DIAMOND_ORE,T.DIAMOND_ORE], desc: '' };
  PROPS[B.COPPER_ORE]    = { name:'Copper ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:10.0, type:'stone', selfGlow:2, faces:[T.COPPER_ORE,T.COPPER_ORE,T.COPPER_ORE,T.COPPER_ORE,T.COPPER_ORE,T.COPPER_ORE], desc: '' };
  PROPS[B.TIN_ORE]    = { name:'Tin ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:13.0, type:'stone', selfGlow:2, faces:[T.TIN_ORE,T.TIN_ORE,T.TIN_ORE,T.TIN_ORE,T.TIN_ORE,T.TIN_ORE], desc: '' };
  PROPS[B.GOLD_ORE]    = { name:'Gold ore',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:15.0, type:'stone',  selfGlow:2, faces:[T.GOLD_ORE,T.GOLD_ORE,T.GOLD_ORE,T.GOLD_ORE,T.GOLD_ORE,T.GOLD_ORE], desc: '' };
  PROPS[B.MARBLE]      = { name:'Marble',    solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:8.0, type:'stone', faces:[T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE,T.MARBLE], desc: '' };
  PROPS[B.GRANITE]     = { name:'Granite',   solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:8.5, type:'stone', faces:[T.GRANITE,T.GRANITE,T.GRANITE,T.GRANITE,T.GRANITE,T.GRANITE], desc: '' };
  PROPS[B.LIMESTONE]   = { name:'Limestone', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:7.5, type:'stone', faces:[T.LIMESTONE,T.LIMESTONE,T.LIMESTONE,T.LIMESTONE,T.LIMESTONE,T.LIMESTONE], desc: '' };
  PROPS[B.DOLOMITE]    = { name:'Dolomite',  solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:8.0, type:'stone', faces:Array(6).fill(T.DOLOMITE), desc: '' };   // 0.809
  // adobe: a clay block and 5 wheat make 4 at the bench; its brick is a variant
  PROPS[B.ADOBE]       = { name:'Adobe',     solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:4.0, type:'stone', faces:Array(6).fill(T.ADOBE), desc: '' };
  PROPS[B.LAVA]        = { name:'Lava',      solid:false,opaque:false, raycast:false, pass:3, model:'cube', light:15, hardness:0, faces:[T.LAVA,T.LAVA,T.LAVA,T.LAVA,T.LAVA,T.LAVA], desc: '' };
  // Sulfur crystal block: full opaque cube, drops itself. Common cave form.
  PROPS[B.SULFUR_BLOCK] = { name:'Sulfur block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:2.5, type:'stone', faces:[T.SULFUR_BLOCK,T.SULFUR_BLOCK,T.SULFUR_BLOCK,T.SULFUR_BLOCK,T.SULFUR_BLOCK,T.SULFUR_BLOCK], desc: '' };
  // Sulfur tip billboards: cross model, two orientations. Down tip = stalactite (from ceiling),
  // up tip = stalagmite (from floor). Break drops ITEM.SULFUR only (handled in blockDrop).
  // Sulfur tip — single placeable block with rotation via variant (0 = up, 1 = down).
  // Legacy SULFUR_DOWN_TIP kept for storage compatibility, hidden from inventory, drops as SULFUR_UP_TIP.
  PROPS[B.SULFUR_DOWN_TIP] = { name:'Sulfur tip', solid:false, opaque:false, raycast:true, pass:1, model:'cross', noInv:true, stack:50, hardness:0.6, type:'stone', boxes:[[0.2,0.2,0.2,0.8,1,0.8]], faces:[T.SULFUR_DOWN_TIP], desc: '' };
});
