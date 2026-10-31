'use strict';
/* blocks/glow-and-storage.js: the glow vine and the jungle's vine, glowstone and glow crystal (and their burnt-out forms), the cobweb, and
   the storage blocks (ten of a material pressed into one).
   A part of BLOCK_CORE (blocks/blocks.js). */

corePart('blocks', function () {
  /* Glow vine: a thin plate against the wall it hangs on, drawn like a carpet turned upright
     ('wall' model, see the carpet branch of the mesher). Walk-through, climbable, and a light source.
     Variant = the wall it clings to: 0 -Z, 1 +Z, 2 -X, 3 +X; with WALL_PAIR (below) a second one in the corner. */
  const WALL_T = 1 / 16;
  const WALL_VAR = [[[0, 0, 0, 1, 1, WALL_T]], [[0, 0, 1 - WALL_T, 1, 1, 1]],
                    [[0, 0, 0, WALL_T, 1, 1]], [[1 - WALL_T, 0, 0, 1, 1, 1]]];
  /* A CORNER: variant bit 2 (WALL_PAIR) puts a second plate on the side a quarter round from the first (WALL_NEXT: -Z -X +Z
     +X), so one cell holds a vine, or a ladder (shapes/boxes.js), on each wall of an inside corner. The four pairs are the
     four corners. The second plate stops at the first one's face, so the two never overlap. */
  const WALL_PAIR = 4, WALL_NEXT = [2, 3, 1, 0];
  const wallSides = (va) => (va & WALL_PAIR) ? [va & 3, WALL_NEXT[va & 3]] : [va & 3];
  // the low variant bits for plates on sides a and b: one side, a corner, or -1 (the same side, or opposite ones)
  const wallPairVar = (a, b) => a === b ? -1 : WALL_NEXT[a] === b ? WALL_PAIR | a : WALL_NEXT[b] === a ? WALL_PAIR | b : -1;
  // a box (cell units, or 16ths with n 16) cut back to start where a plate on side s, `t` thick, ends
  const wallClip = (b, s, t, n = 1) => {
    const c = b.slice();
    if (s === 0) c[2] = Math.max(c[2], t); else if (s === 1) c[5] = Math.min(c[5], n - t);
    else if (s === 2) c[0] = Math.max(c[0], t); else c[3] = Math.min(c[3], n - t);
    return c;
  };
  for (let s = 0; s < 4; s++) WALL_VAR[WALL_PAIR | s] = [WALL_VAR[s][0], wallClip(WALL_VAR[WALL_NEXT[s]][0], s, WALL_T)];
  // coldLight: its light is blue, carried through the flood fill (08) to the shader (04)
  PROPS[B.GLOW_VINE] = { name:'Glow vine', solid:false, opaque:false, raycast:true, pass:1, model:'wall', climbable:true,
                         light:10, coldLight:true, stack:50, hardness:0.3, type:'grass', boxes:WALL_VAR[0], boxesByVar:WALL_VAR,
                         faces:[T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE,T.GLOW_VINE], desc: '' };
  /* The jungle's vine: the same plate, climbable, no light. Held by what is behind it or by a vine over it, and it grows
     down (woods/vines.js); look 1 is the half-cut one shears leave (blocks/looks.js). Variant = the side it hangs on, as
     the glow vine's. */
  PROPS[B.VINE] = { name:'Vine', solid:false, opaque:false, raycast:true, pass:1, model:'wall', climbable:true, stack:50,
                    hardness:0.2, type:'grass', boxes:WALL_VAR[0], boxesByVar:WALL_VAR, faces:Array(6).fill(T.VINE), desc: '' };
  // five glow crystals pressed into a block: brighter than glowstone's reach, a real room light
  PROPS[B.GLOWCRYSTAL_BLOCK] = { name:'Glowcrystal block', solid:true, opaque:true, raycast:true, pass:0, model:'cube',
                         light:18, handLight:12, coldLight:true, stack:50, hardness:2.5, type:'glass',
                         faces:[T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL,T.GLOWCRYSTAL], desc: '' };
  /* The glow blocks burn out (blocks/torches.js): 30-60 minutes after they are placed or first seen they go dark,
     their own picture in grey. A spent one gives no light and breaks into nothing. */
  PROPS[B.GLOWSTONE_SPENT] = { name:'Spent glow dust block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50,
                         hardness:2.5, type:'glass', faces:Array(6).fill(T.GLOWSTONE_SPENT), desc: 'Burnt out: it gives no light, and breaks into nothing' };
  PROPS[B.GLOWCRYSTAL_SPENT] = { name:'Spent glowcrystal block', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50,
                         hardness:2.5, type:'glass', faces:Array(6).fill(T.GLOWCRYSTAL_SPENT), desc: 'Burnt out: it gives no light, and breaks into nothing' };
  /* Cobweb: a billboard strung in cave corners — floor, wall or ceiling, it needs no support.
     Walking into one slows you by 80% (player/movement.js); only a sword cuts the string out of it. */
  PROPS[B.COBWEB] = { name:'Cobweb', solid:false, opaque:false, raycast:true, pass:1, model:'cross', stack:50,
                      hardness:0.8, type:'wool', boxes:[[0.05,0,0.05,0.95,1,0.95]],
                      faces:[T.COBWEB,T.COBWEB,T.COBWEB,T.COBWEB,T.COBWEB,T.COBWEB], desc: '' };
  // gem ores: an iron pickaxe or better, and they glow like diamond ore so they read in the dark
  PROPS[B.EMERALD_ORE]  = { name:'Emerald ore',  solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:15.0, type:'stone', selfGlow:3, faces:[T.EMERALD_ORE,T.EMERALD_ORE,T.EMERALD_ORE,T.EMERALD_ORE,T.EMERALD_ORE,T.EMERALD_ORE], desc: '' };
  PROPS[B.RUBY_ORE]     = { name:'Ruby ore',     solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:15.0, type:'stone', selfGlow:3, faces:[T.RUBY_ORE,T.RUBY_ORE,T.RUBY_ORE,T.RUBY_ORE,T.RUBY_ORE,T.RUBY_ORE], desc: '' };
  PROPS[B.SAPPHIRE_ORE] = { name:'Sapphire ore', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:15.0, type:'stone', selfGlow:3, faces:[T.SAPPHIRE_ORE,T.SAPPHIRE_ORE,T.SAPPHIRE_ORE,T.SAPPHIRE_ORE,T.SAPPHIRE_ORE,T.SAPPHIRE_ORE], desc: '' };
  /* Storage blocks: ten of a material pressed into one block, and back again at the bench. Plain
     cubes that drop themselves; the coal and charcoal ones burn in a furnace (blocks/furnace.js). */
  for (const [bid, name, tile] of [
    [B.COAL_BLOCK, 'Block of coal', T.COAL_BLOCK],         [B.CHARCOAL_BLOCK, 'Block of charcoal', T.CHARCOAL_BLOCK],
    [B.IRON_BLOCK, 'Block of iron', T.IRON_BLOCK],         [B.GOLD_BLOCK, 'Block of gold', T.GOLD_BLOCK],
    [B.TIN_BLOCK, 'Block of tin', T.TIN_BLOCK],            [B.COPPER_BLOCK, 'Block of copper', T.COPPER_BLOCK],
    [B.DIAMOND_BLOCK, 'Block of diamond', T.DIAMOND_BLOCK], [B.EMERALD_BLOCK, 'Block of emerald', T.EMERALD_BLOCK],
    [B.RUBY_BLOCK, 'Block of ruby', T.RUBY_BLOCK],         [B.SAPPHIRE_BLOCK, 'Block of sapphire', T.SAPPHIRE_BLOCK],
    [B.RAW_IRON_BLOCK, 'Block of raw iron', T.RAW_IRON_BLOCK], [B.RAW_GOLD_BLOCK, 'Block of raw gold', T.RAW_GOLD_BLOCK],
    [B.RAW_TIN_BLOCK, 'Block of raw tin', T.RAW_TIN_BLOCK],   [B.RAW_COPPER_BLOCK, 'Block of raw copper', T.RAW_COPPER_BLOCK],
    [B.TOPAZ_BLOCK, 'Block of topaz', T.TOPAZ_BLOCK],                                              // 0.769
  ])
    PROPS[bid] = { name, solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:6.0, type:'stone',
                   faces:[tile,tile,tile,tile,tile,tile], desc: '' };
  // topaz ore: the fourth gem, same rules as the others
  PROPS[B.TOPAZ_ORE] = { name:'Topaz ore', solid:true, opaque:true, raycast:true, pass:0, model:'cube', stack:50, hardness:15.0, type:'stone', selfGlow:3, faces:[T.TOPAZ_ORE,T.TOPAZ_ORE,T.TOPAZ_ORE,T.TOPAZ_ORE,T.TOPAZ_ORE,T.TOPAZ_ORE], desc: '' };
});
