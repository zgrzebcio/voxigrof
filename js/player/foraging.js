'use strict';
/* player/foraging.js: picking things up with E. Berries, grass and fiber, wheat, gourds, mushrooms, flint: what each
   gives, which one is under the crosshair, and holding E to take only what is ready. */

/* ---- bush pickup ----
   Short grass, tall grass and wheat are all `noTarget`, so the crosshair ray passes straight
   through them and none of them can be mined the ordinary way. Bush pickup is how you gather
   them: hold the bind and whatever bush you brush against comes up, repeatedly, straight into
   the inventory. ("Bush pickup" is this system's internal name — the on-screen prompt always
   says the plant's own name.)

     wheat       always yields wheat, plus one fiber roll on top
     short grass one fiber roll — it is one cell
     tall grass  one fiber roll PER HALF, so a full plant rolls twice: 0, 1 or 2 fiber

   Reach is the player's own collision box widened by BUSH_REACH — brushing past a bush is
   enough, you do not have to stand exactly in its cell. Nearest candidate wins, so in a thick
   patch you always take the one you are actually touching. */
/* Fiber is the sole gate on every tool recipe (5 per tool), so this rate sets how long the
   stone age lasts. Lowered again in 0.7575: grass 15%, wheat and ripe bushes 20%, bare bushes 30%. */
const HARVEST_FIBER_CHANCE = 0.2;
/* The grass plants by size, as a pick's chance in the end (FIBER_BONUS below is added to every chance): tall grass
   cut down 25% (HARVEST_FIBER_CHANCE), grass half that, 12%, short grass half again, 6% */
const GRASS_FIBER_PICK = 0.2, SHORT_GRASS_FIBER_PICK = 0.1;
const WHEAT_FIBER_PER_STAGE = 0.1;               // wheat straw is fibrous: 5% a growth stage, ripe 35% (20% flat since 0.7571)
const BUSH_REACH = 1.3;                          // multiplier on the player's half-width
// what the on-screen prompt calls each pickable — the plant's own name, not the system's
const BUSH_NAME = [];
BUSH_NAME[B.TALLGRASS] = 'grass';
BUSH_NAME[B.SHORT_GRASS] = 'short grass';
BUSH_NAME[B.TALL_LOWER] = BUSH_NAME[B.TALL_UPPER] = 'tall grass';
BUSH_NAME[B.WHEAT] = 'wheat';
BUSH_NAME[B.CARROT] = 'carrot';
BUSH_NAME[B.DRY_GRASS] = 'dry grass';                                          // the desert's dry plants
BUSH_NAME[B.DRY_TALL_LOWER] = BUSH_NAME[B.DRY_TALL_UPPER] = 'tall dry grass';
BUSH_NAME[B.DRY_BUSH] = 'dry bush';
const DRY_FIBER_CHANCE = 0.1;                                                 // dry grass is a poor fiber: 10% a pick
BUSH_NAME[B.REDBERRY_BUSH] = 'red berry bush';
BUSH_NAME[B.BLUEBERRY_BUSH] = 'blue berry bush';
BUSH_NAME[B.BLACKBERRY_BUSH] = 'blackberry bush';   // renamed 0.8099
BUSH_NAME[B.YELLOWBERRY_BUSH] = 'yellow berry bush';   // 0.827
BUSH_NAME[B.WHITEBERRY_BUSH] = 'white berry bush';
BUSH_NAME[B.FLINT_ROCK] = 'flint pebble';
BUSH_NAME[B.STONE_PEBBLE] = 'stone pebble';   // 0.8095
BUSH_NAME[B.SEASHELL] = 'seashell';
const PEBBLE_SPIDER_CHANCE = 0.2;                    // a stone or flint picked up: a spider was under it
BUSH_NAME[B.MELON] = 'watermelon';
BUSH_NAME[B.PUMPKIN] = 'pumpkin';
BUSH_NAME[B.CANTALOUPE] = 'cantaloupe';   // 0.8091
BUSH_NAME[B.CARVED_PUMPKIN] = 'carved pumpkin';   // 0.824
BUSH_NAME[B.JACK_O_LANTERN] = "jack o'lantern";
// flowers and mushrooms are foraged too: picked whole, straight into the bag
const FORAGE_WHOLE = new Set([B.POPPY, B.ORCHID, B.PINCUSHION, B.RED_MUSHROOM, B.BROWN_MUSHROOM, B.BLUE_MUSHROOM,
                              B.BLACK_MUSHROOM, B.WHITE_TALL_MUSHROOM, B.LAVA_MUSHROOM, B.YELLOW_MUSHROOM]);   // yellow 0.821
for (const id of FORAGE_WHOLE) BUSH_NAME[id] = PROPS[id].name.toLowerCase();
// which fruit each bush hands over when it is ripe
const BERRY_FRUIT = [];
BERRY_FRUIT[B.REDBERRY_BUSH] = ITEM.BERRIES;
BERRY_FRUIT[B.BLUEBERRY_BUSH] = ITEM.BLUE_BERRIES;
BERRY_FRUIT[B.BLACKBERRY_BUSH] = ITEM.BLACKBERRIES;   // poisonous
BERRY_FRUIT[B.YELLOWBERRY_BUSH] = ITEM.YELLOW_BERRIES;   // 0.827
BERRY_FRUIT[B.WHITEBERRY_BUSH] = ITEM.WHITE_BERRIES;
/* Berry bush. Picking a GROWN bush takes the fruit and leaves the plant standing at
   `empty`, so it regrows (woods/felling.js) instead of being consumed — a bush is a renewable
   patch, not a one-shot pickup. An unripe bush yields nothing but a better fiber roll, since
   all you did was strip leaves off it. */
// how many berries a ripe pick gives: LOOT.berry in 50-loottable.js
// a fiber with any pick (20% ripe, 30% unripe before): 7% at a sprout and 7% more each stage on, 42% ripe
const BERRY_FIBER_BASE = 0.07, BERRY_FIBER_PER_STAGE = 0.07;
const berryFiberChance = (stage) => BERRY_FIBER_BASE + BERRY_FIBER_PER_STAGE * stage;
/* Yield goes STRAIGHT into the inventory — no dropped entity to walk back over. That is what
   makes it work at a sprint: hold the key through a field and every bush lands in a slot as you
   pass. Only when there is genuinely no room does it fall on the ground instead of vanishing. */
function bushGive(id, x, y, z) {
  if (player.canFly) return;                    // creative: no yield, same as every other break
  if (!tryPickup(id, null, 'picked')) spawnDrop(id, x, y, z);
}
// is this cell something the player put down (the leveling ledger, 35)? Lucky Hands gives nothing more off those
const _ownPlaced = (x, y, z) => typeof playerPlaced !== 'undefined' && typeof pkey === 'function' && playerPlaced.has(pkey(x, y, z));
/* A fiber roll that hits yields ONE fiber (0.757 briefly made it 1 or 2, which was too much). The chances are
   set in 0.7571: 20% per grass roll, 30% for wheat, 20% on a ripe berry pick, 40% stripping a bare bush. */
function _giveFiber(x, y, z) {
  bushGive(ITEM.FIBER, x, y, z);
}
// every fiber roll goes through here: Grass Weaver makes each one 30% likelier
/* every roll 10 points likelier first (grass 25%, dry grass 20%, a ripe bush 52%...), Grass Weaver 40% then, and
   never past FIBER_CHANCE_MAX */
const FIBER_BONUS = 0.1, FIBER_CHANCE_MAX = 0.9;
const fiberChance = (c) => Math.min(FIBER_CHANCE_MAX, (c + FIBER_BONUS) * (typeof skillFiberMul === 'function' ? skillFiberMul() : 1));
function _harvestFiber(x, y, z, rolls, chance = HARVEST_FIBER_CHANCE) {
  if (player.canFly) return;
  for (let i = 0; i < rolls; i++)
    if (Math.random() < fiberChance(chance)) _giveFiber(x, y, z);
}
/* The single source of truth for both the prompt and the action: what would a pickup take right
   now? Returns {x, y, z, id, name} or null. Pure — it never changes the world.
   readyOnly (a HELD E past its first tap): only what is ready comes — a berry bush with ripe fruit, ripe wheat,
   a mushroom done growing — so walking a field with the key down no longer strips young bushes, pulls up growing wheat
   or takes half-grown mushrooms. A tap (and the prompt) still sees everything, as before. */
function findBushPickup(readyOnly = false) {
  if (!playing || invOpen || menuScene || player.dead) return null;
  /* Creative has no bush pickup. It never yielded anything there anyway — bushGive and
     _harvestFiber both bail on canFly — so all it did was uproot plants on a key you were more
     likely to be holding by accident. Creative removes them with the crosshair instead, which is
     why raycastVoxel stops on plants in that mode. */
  if (player.canFly) return null;
  /* A free hand picks: the right one when it is empty, else the left. The offhand may carry a
     shield as long as it is not raised; anything else there (a torch) leaves no hand free. */
  if (typeof equipSlots !== 'undefined' && typeof EQUIP_INDEX !== 'undefined') {
    const off = equipSlots[EQUIP_INDEX.offhand];
    // ...but an empty main hand picks whatever the offhand holds (a torch no longer blocks it)
    if (off && HOTBAR[hotbarSel] && !(isShieldId(off.id) && !player.blocking && !(player._shieldUp > 0.05))) return null;
  }
  // ...further with a meerkat on the shoulder (wornReachMul, entities/meerkat.js)
  const p = player.pos, r = player.R * BUSH_REACH * (typeof wornReachMul === 'function' ? wornReachMul(player) : 1);
  const y0 = Math.floor(p.y);
  const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r);
  const z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
  /* A growing mushroom says how big it is now; one under 40% grown says it is too small and cannot be
     picked. Such a one is only the answer when nothing pickable is in reach (`small`, harvestAtPlayer skips it). */
  let best = null, bestD = Infinity, small = null, smallD = Infinity;
  for (let y = y0; y <= y0 + 1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const val = getBlock(x, y, z), id = val & 255;
        if (!BUSH_NAME[id]) continue;
        const dx = (x + 0.5) - p.x, dz = (z + 0.5) - p.z;
        const d = dx * dx + dz * dz;
        const v = (val >> 8) & 255;
        // every mushroom says its size, a grown one too (only growing ones did)
        if (PROPS[id].shroom != null && typeof shroomSizeAt === 'function') {
          const tiny = shroomTooSmall(id, v), size = +shroomSizeAt(x, y, z, v).toFixed(2);
          const name = `${BUSH_NAME[id]} (${size}x${tiny ? ', too small' : ''})`;
          if (tiny) { if (d < smallD) { smallD = d; small = { x, y, z, id, v, name, small: true }; } continue; }
          if (readyOnly && typeof shroomLeft === 'function' && shroomLeft(v) > 0) continue;   // still growing
          if (d < bestD) { bestD = d; best = { x, y, z, id, v, name }; }
          continue;
        }
        if (readyOnly && ((isBerryBush(id) && berryStage(v) !== BERRY_STAGE.GROWN) || ((id === B.WHEAT || id === B.CARROT) && (v & 7)))) continue;   // 0.8443
        if (d >= bestD) continue;
        bestD = d;
        // the prompt says what you would actually get, so a bare bush reads as bare
        let name = BUSH_NAME[id];
        if (isBerryBush(id)) {
          const st = berryStage(v);
          // an unripe bush is not yet telling you which one it is, so neither does the prompt
          if (st <= BERRY_STAGE.BUSH) name = 'berry bush (young)';            // seven stages (blocks/plants.js)
          else if (st === BERRY_STAGE.EMPTY) name = 'berry bush (bare)';
          else if (st !== BERRY_STAGE.GROWN) name = 'berry bush (unripe)';
        }
        best = { x, y, z, id, v, name };
      }
  return best || small;
}
/* Returns the cooldown to arm (seconds) on a successful pick, or 0 when nothing was taken. */
function harvestAtPlayer(readyOnly = false) {
  const t = findBushPickup(readyOnly);
  if (!t || t.small) return 0;                   // a mushroom too small to pick stays where it is
  const { x, z, id } = t;
  // the right hand grabs when empty; holding anything, the left does it (40-shield.js shows that arm)
  if (HOTBAR[hotbarSel]) player._offPickT = 0.35;
  else handPickSwing = true;                     // player/hands.js plays the grab on the next frame
  // foraging counts, same as breaking a wild block; a carved pumpkin or a jack o'lantern taken back up does not
  if (id !== B.CARVED_PUMPKIN && id !== B.JACK_O_LANTERN) addXP(XP_HARVEST);
  // bits of the plant you pulled; the whole cell value, not just the variant (fixed 0.803)
  if (typeof fxForage === 'function') fxForage(x, t.y, z, id | (t.v << 8));
  if (isBerryBush(id)) {
    const stage = berryStage(t.v);
    // the BLOCK is the kind now, so a bush stays the bush it was through every pick for free
    if (stage === BERRY_STAGE.GROWN) {
      // first pick on a ripe bush: take the fruit, leave the plant standing and empty
      setBlock(x, t.y, z, id | (BERRY_STAGE.EMPTY << 8));
      const fruit = BERRY_FRUIT[id];
      const n = rollLoot(LOOT.berry)            // 1 sure, then 75% and 35% for more (50-loottable.js)
              + lootBonus(hasSkill('luckyHands'));   // Lucky Hands: 20% for one more
      for (let i = 0; i < n; i++) bushGive(fruit, x, t.y, z);
      addXP(n * XP_FORAGE_ITEM);    // one more a berry
      if (!player.canFly && Math.random() < fiberChance(berryFiberChance(stage))) _giveFiber(x, t.y, z);
      queueBerryGrow(x, t.y, z);
    } else if (stage === BERRY_STAGE.FRUITLING) {
      // half-grown: the unripe fruit is lost, the plant survives at empty
      setBlock(x, t.y, z, id | (BERRY_STAGE.EMPTY << 8));
      if (!player.canFly && Math.random() < fiberChance(berryFiberChance(stage))) _giveFiber(x, t.y, z);
      queueBerryGrow(x, t.y, z);
    } else {
      /* Empty or still a sprout: nothing left to strip, so this pick takes the whole plant. On an
         empty bush that is the SECOND pick on one you just picked — and the 1.1s cooldown between
         them is what keeps one held key from stripping and uprooting it in the same motion. */
      setBlock(x, t.y, z, B.AIR);
      if (!player.canFly && Math.random() < fiberChance(berryFiberChance(stage))) _giveFiber(x, t.y, z);
    }
    playBlockSound(B.TALLGRASS, 'break', x, t.y, z);
    return BERRY_REPEAT;
  }
  /* Flint stone: the one pickup with a GUARANTEED yield. Fiber comes in rolls because grass is
     everywhere; a flint nodule is rare enough (see FLINT_ROCK_CHANCE) that walking to one and
     getting nothing would just be a punishment. */
  if (FORAGE_WHOLE.has(id)) {                        // a flower or a mushroom: the plant itself
    const own = _ownPlaced(x, t.y, z);               // asked before the cell is cleared
    setBlock(x, t.y, z, B.AIR);
    playBlockSound(B.TALLGRASS, 'break', x, t.y, z);
    /* What it gives (back in 0.826: the line was lost in 0.821, and every pick gave nothing): a mushroom itself, a
       flower half the time a fiber (blockDrop, 50-loottable.js). One under 40% grown is never picked (above). */
    const drops = blockDrop(id);
    // Lucky Hands: 20% for one more mushroom, unless you put this one down yourself
    if (PROPS[id].shroom != null && !own && drops.length) drops[0].count += lootBonus(hasSkill('luckyHands'));
    for (const d of drops) for (let n = 0; n < d.count; n++) bushGive(d.id, x, t.y, z);
    // a mushroom pays by its size: one more every 0.2x, and more again fully grown (player/leveling.js)
    if (PROPS[id].shroom != null && typeof shroomSizeAt === 'function')
      addXP(Math.floor(shroomSizeAt(x, t.y, z, t.v) / XP_SHROOM_STEP + 1e-6) + (shroomLeft(t.v) ? 0 : XP_SHROOM_GROWN));
    return BUSH_REPEAT;
  }
  if (id === B.FLINT_ROCK || id === B.STONE_PEBBLE || id === B.SEASHELL) {   // the stone pebble and the seashell the same way
    setBlock(x, t.y, z, B.AIR);
    playBlockSound(B.COBBLE, 'break', x, t.y, z);
    // now and then a spider was under a stone or a flint, and runs off (49-particles.js; none with Arachnophobia)
    if (id !== B.SEASHELL && Math.random() < PEBBLE_SPIDER_CHANCE && typeof fxSpiderFlee === 'function') fxSpiderFlee(x, t.y, z, player);
    const got = id === B.FLINT_ROCK ? ITEM.FLINT : id === B.SEASHELL ? ITEM.SEASHELL : ITEM.STONE_PEBBLE;
    const n = 1 + lootBonus(hasSkill('luckyHands'));                  // Lucky Hands
    for (let i = 0; i < n; i++) bushGive(got, x, t.y, z);
    addXP(n * XP_FORAGE_ITEM);                            // one more a flint or pebble
    return BUSH_REPEAT;
  }
  /* Gourds: picked up whole, and they hand over exactly what breaking them used to —
     a melon comes apart into slices, a pumpkin comes away as itself. */
  if (id === B.MELON || id === B.PUMPKIN || id === B.CANTALOUPE || id === B.CARVED_PUMPKIN || id === B.JACK_O_LANTERN) {   // cantaloupe 0.8091, carved 0.824
    const own = _ownPlaced(x, t.y, z);               // asked before the cell is cleared
    setBlock(x, t.y, z, B.AIR);
    playBlockSound(id, 'break', x, t.y, z);
    let slices = 0;
    const drops = blockDrop(id, true);
    /* Lucky Hands: 20% for one more slice of a melon or cantaloupe, or a second pumpkin; not off a carved one,
       nor off one you put down yourself (a pumpkin placed and picked again would be free pumpkins) */
    if (id !== B.CARVED_PUMPKIN && id !== B.JACK_O_LANTERN && !own && drops.length) drops[0].count += lootBonus(hasSkill('luckyHands'));
    for (const d of drops) {
      for (let n = 0; n < d.count; n++) bushGive(d.id, x, t.y, z);
      if (d.id === ITEM.MELON_SLICE || d.id === ITEM.CANTALOUPE_SLICE) slices += d.count;
    }
    // a pumpkin XP_PUMPKIN in all; a melon or cantaloupe one more a slice (its fiber not counted)
    if (id === B.PUMPKIN) addXP(XP_PUMPKIN - XP_HARVEST);
    else addXP(slices * XP_FORAGE_ITEM);
    return BUSH_REPEAT;
  }
  if (id === B.WHEAT) {
    const st = (getBlock(x, t.y, z) >> 8) & 7, ripe = !st;           // growing wheat gives straw only
    /* a ripe one is cut, not pulled up: the plant stays at its first stage and grows again (seasons/seasons.js).
       One still growing comes up whole, as before: a tap only, a held E leaves it be (findBushPickup). */
    if (ripe && typeof cropRegrow === 'function') cropRegrow(x, t.y, z, B.WHEAT);
    else setBlock(x, t.y, z, B.AIR);
    playBlockSound(B.WHEAT, 'break', x, t.y, z);
    if (ripe) {
      const drops = blockDrop(B.WHEAT);
      if (drops.length) drops[0].count += lootBonus(hasSkill('luckyHands'));   // Lucky Hands: 20% for one more wheat
      for (const d of drops) {
        for (let n = 0; n < d.count; n++) bushGive(d.id, x, t.y, z);
        addXP(d.count * XP_FORAGE_ITEM);                     // one more a wheat
      }
    }
    // wheat straw yields fiber as well: 5% at its first stage, 5% more each stage on, 40% ripe (20% flat before)
    _harvestFiber(x, t.y, z, 1, WHEAT_FIBER_PER_STAGE * (ripe ? 7 : Math.min(6, st)));   // 35% ripe since 0.8273 (six stages)
    return BUSH_REPEAT;
  }
  /* A carrot as wheat is: a ripe one pulled gives one carrot (Lucky Hands may add one) and its top stays, cut back to its
     first stage, to grow again; one still growing comes up whole with nothing (a tap only, findBushPickup). No fiber. */
  if (id === B.CARROT) {
    const ripe = !((getBlock(x, t.y, z) >> 8) & 7);
    if (ripe && typeof cropRegrow === 'function') cropRegrow(x, t.y, z, B.CARROT);
    else setBlock(x, t.y, z, B.AIR);
    playBlockSound(B.CARROT, 'break', x, t.y, z);
    if (ripe) {
      const drops = blockDrop(B.CARROT);
      if (drops.length) drops[0].count += lootBonus(hasSkill('luckyHands'));   // Lucky Hands: 20% for one more carrot
      for (const d of drops) {
        for (let n = 0; n < d.count; n++) bushGive(d.id, x, t.y, z);
        addXP(d.count * XP_FORAGE_ITEM);
      }
    }
    return BUSH_REPEAT;
  }
  // the grass is cut down to short grass, as the tall grass to grass; short grass comes up whole
  if (id === B.TALLGRASS || id === B.SHORT_GRASS) {
    setBlock(x, t.y, z, id === B.TALLGRASS ? B.SHORT_GRASS : B.AIR);
    playBlockSound(B.TALLGRASS, 'break', x, t.y, z);
    _harvestFiber(x, t.y, z, 1, (id === B.SHORT_GRASS ? SHORT_GRASS_FIBER_PICK : GRASS_FIBER_PICK) - FIBER_BONUS);
    return BUSH_REPEAT;
  }
  /* The desert's dry plants: dry grass gives a fiber 10% of the time; tall dry grass is cut down to dry grass with
     the same roll, as the tall grass is; a dry bush comes up whole with its sticks (LOOT.dryBush, 50-loottable.js). */
  if (id === B.DRY_GRASS) {
    setBlock(x, t.y, z, B.AIR);
    playBlockSound(B.TALLGRASS, 'break', x, t.y, z);
    _harvestFiber(x, t.y, z, 1, DRY_FIBER_CHANCE);
    return BUSH_REPEAT;
  }
  if (id === B.DRY_TALL_LOWER || id === B.DRY_TALL_UPPER) {
    const dy = id === B.DRY_TALL_LOWER ? t.y : t.y - 1;
    setBlock(x, dy, z, B.DRY_GRASS);
    setBlock(x, dy + 1, z, B.AIR);
    playBlockSound(B.TALL_LOWER, 'break', x, dy, z);
    _harvestFiber(x, dy, z, 1, DRY_FIBER_CHANCE);
    return BUSH_REPEAT;
  }
  if (id === B.DRY_BUSH) {
    setBlock(x, t.y, z, B.AIR);
    playBlockSound(B.TALLGRASS, 'break', x, t.y, z);
    if (!player.canFly) {
      const n = rollLoot(LOOT.dryBush);
      for (let i = 0; i < n; i++) bushGive(ITEM.STICK, x, t.y, z);
      addXP(n * XP_FORAGE_ITEM);
    }
    return BUSH_REPEAT;
  }
  /* Tall grass is cut DOWN rather than pulled up: the first pick trims it to short grass and
     yields exactly what picking short grass yields; the short grass left behind is a pick of its own. */
  const ly = id === B.TALL_LOWER ? t.y : t.y - 1;
  setBlock(x, ly, z, B.TALLGRASS);
  setBlock(x, ly + 1, z, B.AIR);
  playBlockSound(B.TALL_LOWER, 'break', x, ly, z);
  _harvestFiber(x, ly, z, 1);
  return BUSH_REPEAT;
}
/* Held, not tapped: the first pick fires the instant the key goes down, then it repeats on a
   short cooldown for as long as you hold it. Releasing clears the cooldown so a deliberate tap
   is always immediate.

   The cooldown is a touch longer than the hand's 0.28s swing, so every pick gets one complete
   grab animation instead of the arm stuttering back to the start. It is only armed on a pick
   that actually TOOK something — holding the key while walking up to a bush must not eat the
   first one, so an empty attempt costs nothing. */
const BUSH_REPEAT = 0.26;                         // seconds between picks while the key is held
/* A berry bush is not consumed by a pick — it drops a stage and stays there — so the plain 0.3s
   repeat would let one held key strip a ripe bush AND immediately re-pick the empty one it just
   became, in the same breath. The longer cooldown makes each stage a deliberate, separate pick. */
const BERRY_REPEAT = 0.96;
/* a TAP takes whatever is nearest, as it always did; once the key has been down longer than BUSH_TAP_S it is
   being held, and a held key only takes what is ready (findBushPickup's readyOnly). _bushHeldT is how long it has been
   down, per seat like the cooldown (36-splitscreen.js). */
const BUSH_TAP_S = 0.25;
var _bushCd = 0, _bushHeldT = 0;
function updateBushPickup(dt, wantPick) {
  if (!wantPick) { _bushCd = 0; _bushHeldT = 0; return; }
  const held = _bushHeldT > BUSH_TAP_S;
  _bushHeldT += dt;
  _bushCd -= dt;
  // a held key takes only what is ready (readyOnly), so a picked bush is never stripped bare: no long berry wait then
  if (held && _bushCd > BUSH_REPEAT) _bushCd = BUSH_REPEAT;
  if (_bushCd > 0) return;
  const cd = harvestAtPlayer(held);
  if (cd) _bushCd = held ? Math.min(cd, BUSH_REPEAT) : cd;
}
var handPlaceSwing = false;   // set on a SUCCESSFUL place; 24-hands consumes it for the swing
var handPickSwing  = false;   // same, for a successful bush pickup
/* Chisel shapes are variants of the full block, so two halves of the SAME block in one cell are
   simply that full block again: a slab shape put into a half of it fills the cell. */
const isSlabHalfVal = (v) => { const va = (v >> 8) & 255; return !!PROPS[v & 255]?.shapes?.slab && (va & SHAPE_MASK) === SHAPE_SLAB; };
/* ...and two halves of DIFFERENT blocks that both take a slab make a mixed slab (setSlabMix in chunks/chunks.js):
   the cell keeps both, each in its own art. */
// `mat`: the held block as a value, id | look << 16 (blocks/looks.js): polished stone fills a polished stone half, and mixes with stone
const slabHalfTakes = (hv, mat) => isSlabHalfVal(hv) && (matKey(hv) === mat || CORE.slabsMix(stackEntry(hv), stackEntry(mat)));
