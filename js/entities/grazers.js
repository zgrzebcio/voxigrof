'use strict';
/* entities/grazers.js: _updateGrazer, one step of an animal on four legs: sheep, cow, pig, horse (ridden too), polar
   bear, hellhound. Heading, moving, hazards, gravity, then its pose. */

/* Grazer tick — sheep and cows. Passive: wander, and sprint directly away from the player
   after being hit. The fleece half is sheep-only: a shorn sheep periodically tries to eat the
   grass block under it, which converts the grass to dirt and starts the wool growing back,
   animated by scaling the fleece boxes. A cow simply skips that whole section. */
function _updateGrazer(e, dt, pdx, pdz, distXZ, i, tp = null) {
  const cow = e.kind === 'cow';
  const horse = e.kind === 'horse';
  const pig = e.kind === 'pig';                 // 0.789
  const bear = e.kind === 'polar_bear';         // the grazer's legs, a hunter's head
  const hound = e.kind === 'hellhound';         // the same legs again, its mind in entities/hellhound.js
  // its kind's `walk` and `flee` from the creature table (entities/mobs.js); a horse's are for its own speed stat
  const def = mobOf(e), stat = horse ? horseSpeedStat(e) : 1;
  const walkSpeed = def.walk * stat;
  const fleeSpeed = def.flee * stat * FLEE_SPEED_MUL;
  if (e.flailT > 0) e.flailT -= dt;
  if (e.turnCd > 0) e.turnCd -= dt;
  if (e.fleeT > 0) e.fleeT -= dt;
  if (e._lookT > 0) e._lookT -= dt;             // petted: it looks at whoever did (updatePetting in entities/taming.js)
  if (e._petT > 0) e._petT -= dt;

  const inWater = (getBlock(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z)) & 255) === B.WATER;
  // lava carries a hellhound as water carries the rest: it wades in it and climbs out of it
  const swim = inWater || (e.kind === 'hellhound' && (getBlock(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z)) & 255) === B.LAVA);

  /* ---- a polar bear hunts: a player in survival within POLAR_BEAR_SEES (or who hit it, from up to
     POLAR_BEAR_GIVES_UP), till they are POLAR_BEAR_GIVES_UP away, dead, or flying in creative. Then it walks back to
     where the chase began ('return', retX/retZ) and takes up its day there. ---- */
  const hunting = bear && !!tp && !tp.canFly && !tp.dead;
  if (bear) {
    if (e.aggroT > 0) e.aggroT -= dt;
    if (e.atkAnimT > 0) e.atkAnimT -= dt;
    const inReach = hunting && Math.abs(tp.pos.y - e.y) < 10
                 && (distXZ <= POLAR_BEAR_SEES || (e.aggroT > 0 && distXZ <= POLAR_BEAR_GIVES_UP));
    if (inReach) {
      if (e.state !== 'chase' && e.state !== 'return') { e.retX = e.x; e.retZ = e.z; }   // where it was
      e.state = 'chase';
    } else if (e.state === 'chase' && (!hunting || distXZ > POLAR_BEAR_GIVES_UP)) {
      e.aggroT = 0;
      e.state = e.retX != null ? 'return' : 'wander';
    }
  }

  /* ---- fleece: back on its own SHEEP_WOOL_S after shearing, growing all the while; every patch of grass it
     eats takes SHEEP_GRAZE_CUT off. Until 0.8324 it had to eat once and then grew back in 10 s. ---- */
  if (!cow && !horse && !pig && !hound && !e.woolly) {
    if (!(e.woolLeft >= 0)) e.woolLeft = SHEEP_WOOL_S;   // a save from before 0.8324 starts the clock
    e.woolLeft = Math.max(0, e.woolLeft - dt);
    if (e.chewT > 0) e.chewT -= dt;
    e.grazeCd -= dt;
    if (e.grazeCd <= 0) {
      e.grazeCd = SHEEP_GRAZE_CD;
      const gx = Math.floor(e.x), gy = Math.floor(e.y - 0.02), gz = Math.floor(e.z);
      if (e.onGround && _plainGrass(getBlock(gx, gy, gz)) && Math.random() < SHEEP_GRAZE_CHANCE) {
        setBlock(gx, gy, gz, B.DIRT);          // eats the turf down to bare dirt
        playBlockSound(B.GRASS, 'break', gx, gy, gz);
        e.woolLeft = Math.max(0, e.woolLeft - SHEEP_GRAZE_CUT);
        e.chewT = 1.2;                         // head down a moment to chew
        e.state = 'idle';
        e.wanderT = 1.2;
      }
    }
    e.regrowing = true;
    e.woolGrow = Math.max(0, Math.min(1, 1 - e.woolLeft / SHEEP_WOOL_S));
    if (e.woolLeft <= 0) { e.woolly = true; e.regrowing = false; e.woolGrow = 1; }
  }

  /* ---- heading ---- */
  let moveSpeed = 0;
  e.faceYaw = null;                       // a ridden horse walks one way and looks another
  if (horse && e.tame) horseStanceTick(e, dt);   // a stance pressed for, after its wait (entities/taming.js)
  /* a hellhound: houndThink turns it and says how fast it goes, whom it hunts, follows or bites; `houndBold`
     = it is after something, and goes off ledges and through water for it as a hunting bear does */
  let houndBold = false;
  if (hound) {
    moveSpeed = houndThink(e, dt, tp, inWater);
    houndBold = !!e._bold;
  } else
  if (horse && e.rider) {
    /* ---- carrying someone ----
       Two completely different animals depending on whether it has accepted you yet. Tamed and
       saddled, it goes where the rider looks and jumps on command with its own jump stat. Not
       yet tamed, it bolts: it picks its own headings, changes them every second or so and bucks
       — which is the ride you have to sit through for the taming bar to fill. */
    const r = e.rider;
    if (e.tame && e.saddled) {
      const drive = r._rideFwd || 0;
      /* a creature's yaw 0 faces +Z and a player's looks down -Z, half a turn apart. The horse took the
         rider's yaw as it was, so it stood and ran the opposite way to where its rider looked: the rider sat on it
         backward, and forward drove it back. */
      const look = r.yaw + Math.PI;
      e.faceYaw = look;
      // reverse is expressed as "walk the other way while still facing forward", because the
      // move step below only ever advances along +yaw
      e.yaw = drive < 0 ? look + Math.PI : look;
      // a starving horse still carries you, just slower and lower
      moveSpeed = Math.abs(drive) * HORSE_RIDE_SPEED * horseSpeedStat(e) * horseFedMul(e)
                * (drive < 0 ? 0.45 : 1);
      if (r._rideJump && e.onGround && e.jumpCd <= 0) {
        e.vy = HORSE_RIDE_JUMP * horseJumpStat(e) * Math.sqrt(horseFedMul(e));
        e.onGround = false; e.jumpCd = 0.35;
      }
    } else {
      e.bolt -= dt;
      if (e.bolt <= 0) { e.bolt = 0.5 + Math.random() * 1.3; e.yaw += (Math.random() - 0.5) * 2.4; }
      moveSpeed = HORSE_BOLT_SPEED * horseSpeedStat(e);
      if (e.onGround && e.jumpCd <= 0 && Math.random() < dt * 1.5) {
        e.vy = ENT_JUMP * 0.9; e.onGround = false; e.jumpCd = 0.5;   // the buck
      }
    }
  } else if (hunting && e.state === 'chase') {
    // straight at them at a sprint, swimming too (a polar bear swims well), and a bite in reach
    e.yaw = Math.atan2(pdx, pdz);
    moveSpeed = POLAR_BEAR_CHASE_SPEED * (inWater ? 0.5 : 1);
    if (distXZ < entAttackRange(e, tp) && Math.abs(tp.pos.y - e.y) < 2 && e.atkCd <= 0) {
      e.atkCd = POLAR_BEAR_ATTACK_CD;
      e.atkAnimT = ENT_ATK_ANIM;                 // the head lunges with the bite
      moveSpeed = 0;
      _mobStrikePlayer(e, tp, POLAR_BEAR_DMG, pdx, pdz, distXZ);
      playSound('hit', { gain: 0.7, rate: 0.75, pos: { x: tp.pos.x, y: tp.pos.y + 1, z: tp.pos.z } });
    }
  } else if (bear && e.state === 'return') {
    // let go: back at a steady walk to where the chase began, then its day goes on from there
    const rdx = e.retX - e.x, rdz = e.retZ - e.z;
    e.retT = (e.retT || 0) + dt;                 // a way back it cannot find is given up after a while
    if (rdx * rdx + rdz * rdz < 4 || e.retT > 45) { e.state = 'idle'; e.wanderT = 2 + Math.random() * 3; e.retX = e.retZ = null; e.retT = 0; }
    else { e.yaw = Math.atan2(rdx, rdz); moveSpeed = walkSpeed * 1.5; }
  } else if (inWater) {
    e.escapeT -= dt;
    if (e.escapeT <= 0) { e.escapeT = 0.8; e.yaw += 1.2; }
    moveSpeed = walkSpeed;
  } else if (e.fleeT > 0) {
    e.yaw = Math.atan2(-pdx, -pdz);            // straight away from whoever hit it
    moveSpeed = fleeSpeed;
  } else if (horse && e.tame && e.stance && e.stance !== 'wander') {
    // a tamed horse told to lie, wait or follow (horseStanceMove in entities/taming.js)
    moveSpeed = horseStanceMove(e, dt);
  } else {
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = 2 + Math.random() * 5;
      e.state = Math.random() < 0.45 ? 'idle' : 'wander';
      if (e.state === 'wander') e.yaw = Math.random() * Math.PI * 2;
    }
    moveSpeed = e.state === 'wander' ? walkSpeed : 0;
    const hdx = e.hx - e.x, hdz = e.hz - e.z;
    if (Math.hypot(hdx, hdz) > ENT_HOME_RANGE) {
      e.yaw = Math.atan2(hdx, hdz); e.state = 'wander'; moveSpeed = walkSpeed;
    }
  }

  // a cow being milked stands where it is for as long as the bucket is held under it (updateMilking in entities/taming.js)
  if (e._milkHold > 0) { e._milkHold -= dt; moveSpeed = 0; }

  /* ---- move ---- */
  let moved = 0;
  /* A knockback no longer stuns a FLEEING animal: the hit that makes it bolt also shoved it, and
     that shove held it standing still until it had worn off, so the flight looked cancelled. It runs at
     once now, the shove carrying it along on top. */
  const stunned = (e.kx !== 0 || e.kz !== 0) && !(e.fleeT > 0);
  e.wantMove = moveSpeed > 0 && !stunned;        // read by the stuck watchdog next tick
  if (moveSpeed > 0 && !stunned) {
    moveSpeed *= boxDragMul(e.x, e.y, e.z, _boxR, _boxH);   // leaves/litter -40%, snow -70%
    const sx = Math.sin(e.yaw) * moveSpeed * dt, sz = Math.cos(e.yaw) * moveSpeed * dt;
    // a hunting bear goes where you go: off a bank into the sea, down a drop
    const reckless = (hunting && e.state === 'chase') || houndBold;
    // lava is no hazard to a hellhound, water and a long drop still are (houndHazard in entities/hellhound.js)
    const bad = (nx, nz) => _entBlocked(nx, e.y, nz) || (!inWater && !reckless && (hound ? houndHazard(nx, e.y, nz) : _entHazard(nx, e.y, nz)));
    let blocked = false;
    if (!bad(e.x + sx, e.z)) { e.x += sx; moved += Math.abs(sx); } else blocked = true;
    if (!bad(e.x, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else blocked = true;
    const climbY = blocked ? _stepUpTarget(e, e.x + sx, e.z + sz) : null;
    if (blocked && horse && climbY !== null && climbY - e.y <= HORSE_STEP_UP && (e.onGround || inWater)) {
      /* STEP ASSIST. A horse walks up a one-block ledge rather than jumping it — the
         jump is saved for what actually needs one, and a ridden horse no longer hops at every
         terrace. The body snaps up at once (collision must be exact); the MODEL keeps the old
         height as `stepOff` and eases up to it, so the climb reads as a stride, not a teleport. */
      e.stepOff = (e.stepOff || 0) - (climbY - e.y);
      e.y = climbY; e.x += sx; e.z += sz; e.vy = 0; e.onGround = true;
      moved += Math.hypot(sx, sz);
    } else if (blocked && swim && climbY !== null) {
      // wading ashore: lift straight onto the ledge, swimming has no real jump arc
      e.y = climbY; e.x += sx; e.z += sz; e.vy = 1.5; e.onGround = false; e.jumpCd = 0.3;
    } else if (blocked && (e.onGround || swim) && e.jumpCd <= 0 && climbY !== null) {
      e.vy = ENT_JUMP; e.jumpCd = 0.6; e.onGround = false;
    } else if (blocked && e.turnCd <= 0 && !inWater) {
      e.yaw = Math.random() * Math.PI * 2; e.turnCd = 0.5;
    }
  }
  if (e.kx || e.kz) {
    const kdx = e.kx * dt, kdz = e.kz * dt;
    if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
    if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
    const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt);
    e.kx *= k; e.kz *= k;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) { e.kx = 0; e.kz = 0; }
  }
  if (inWater && waterFlowVec(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z), _flowV)) {
    const fdx = _flowV.x * 1.9 * dt, fdz = _flowV.z * 1.9 * dt;
    if (!_entBlocked(e.x + fdx, e.y, e.z)) e.x += fdx;
    if (!_entBlocked(e.x, e.y, e.z + fdz)) e.z += fdz;
  }

  /* ---- hazards ---- */
  if (e.hazCd > 0) e.hazCd -= dt;
  const feetId = getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255;
  const headId = getBlock(Math.floor(e.x), Math.floor(e.y + 1.0), Math.floor(e.z)) & 255;
  const inLava = feetId === B.LAVA || headId === B.LAVA;
  if (inLava && !hound) e.fireT = Math.max(e.fireT || 0, LAVA_FIRE_S);   // alight for 10 s; never a hellhound
  if (e.hazCd <= 0) {
    let dmg = 0;
    if (inLava) dmg = hound ? 0 : ENT_LAVA_DMG;
    else if (feetId === B.CACTUS) dmg = ENT_CACTUS_DMG;
    if (dmg > 0) {
      e.hazCd = ENT_HAZARD_CD; e.hurtT = 0.25; e.hp -= dmg;
      if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return; }
    }
  }
  if (headId === B.WATER) {
    e.airT -= dt;
    if (e.airT <= 0) {
      e.airT = 1; e.hurtT = 0.25; e.hp -= ENT_DROWN_DMG;
      if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return; }
    }
  } else e.airT = ENT_AIR_MAX;
  // a hellhound's own needs: lava and fire feed and heal it, water and rain wear it down, a fire drop is eaten
  if (hound && houndBody(e, dt, inWater, inLava)) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); return; }

  /* ---- gravity ---- */
  const wasGround = e.onGround;
  const afloat = swim;                         // water, or lava under a hellhound
  const standing = !afloat && e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z);
  if (standing) {
    e.y = Math.floor(e.y - 0.02) + 1; e.vy = 0; e.onGround = true;
  } else {
    const ny = _entFallStep(e, dt);              // 0.8451
    if (_entBlocked(e.x, ny, e.z)) {
      if (e.vy < 0) { e.y = Math.floor(ny) + 1; e.onGround = true; }
      e.vy = 0;
    } else { e.y = ny; e.onGround = false; }
  }
  if (_entFallDamage(e, i, wasGround, afloat)) return;
  // Buoyancy, but never CLAMP an active climb/jump: the old unconditional Math.min pulled a
  // fresh 7.6 hop straight back down to 4.2, which is the other half of the shoreline trap.
  if (afloat) {
    if (e.vy < 4.2) e.vy = Math.min(e.vy + 40 * dt, 4.2);
    e.onGround = false;
  }

  /* ---- visuals ---- */
  const spd = moved / Math.max(dt, 1e-4);
  entityStepSound(e, dt, spd);
  let swing = Math.min(spd / 3.5, 1) * 0.7;
  if (e.flailT > 0) { e.walk += 11 * dt; swing = Math.max(swing, 0.8); }
  else e.walk += Math.min(spd, 9) * dt * 2.6;
  const m = e.model;
  m.root.position.set(e.x, e.y, e.z);
  m.root.rotation.y = e.faceYaw != null ? e.faceYaw : e.yaw;
  // a hellhound poses itself: its gait, the bite, sitting, lying, the glow that never goes dark
  if (hound) { houndPose(e, m, dt, swing); return; }
  /* Grazing dips the head toward the ground. A standing cow crops grass too, and since it idles
     roughly half the time the dip is EASED on the entity rather than snapped — the sheep's is a
     brief one-off, a cow's would otherwise flick up and down all day. */
  // a pig roots with its snout down, so it idles nose-to-the-ground harder than a cow crops grass
  /* a bear: nose down sniffing when idle, head up on the hunt, and a lunge down and forward with each bite */
  /* a horse that minds a player (horseLooksAt, entities/taming.js: one it was tamed or won over by, one holding
     what it eats, one who just petted it) turns its head to them, and keeps it up while it does */
  const lookP = horse ? horseLooksAt(e, tp) : null;
  const dipTo = bear ? (e.atkAnimT > 0 ? 0.7 : e.state === 'chase' ? -0.15 : e.state === 'idle' ? 0.35 : 0.1)
              : horse ? ((e.state === 'idle' && !e.rider && e.fleeT <= 0 && e.onGround && !lookP) ? 1 : 0)
              : cow ? ((e.state === 'idle' && e.fleeT <= 0 && e.onGround) ? 0.55 : 0)
              : pig ? ((e.state === 'idle' && e.fleeT <= 0 && e.onGround) ? 0.75 : 0)
                    : ((e.chewT > 0) ? 0.9 : 0);   // a sheep chewing what it just cropped
  e.headDip = (e.headDip || 0) + (dipTo - (e.headDip || 0)) * Math.min(1, dt * (bear && e.atkAnimT > 0 ? 14 : 3.5));   // a bite snaps
  if (bear && m.tail) m.tail.rotation.y = Math.sin(e.walk * 0.7) * 0.15;   // 0.835
  if (horse) {
    /* The horse's "head" IS its neck pivot, so the dip swings the whole assembly down to the
       grass from its carried-high resting angle rather than just nodding the skull. */
    animateQuadruped(m, e.walk, swing,
                     HORSE_NECK_REST + (HORSE_NECK_GRAZE - HORSE_NECK_REST) * e.headDip);
    m.head.rotation.y = _entHeadTurn(e, lookP, dt, m.root.rotation.y);   // its head to the side, toward them
    /* Lying down (the 'lie' stance): eased; the legs fold forward along the ground and the body comes
       down onto them (HORSE_LIE_DROP of the model's own units, under its scale). */
    const lieTo = (e.tame && e.stance === 'lie' && !e.rider && !(e.fleeT > 0) && e.onGround && !inWater) ? 1 : 0;
    e.lieK = (e.lieK || 0) + (lieTo - (e.lieK || 0)) * Math.min(1, dt * 4);
    if (e.lieK > 0.001) for (const leg of m.legs) leg.rotation.x = leg.rotation.x * (1 - e.lieK) - 1.45 * e.lieK;
    if (m.tail) m.tail.rotation.z = Math.sin(e.walk * 0.9) * 0.10;      // a tail is never still
    if (m.saddle) m.saddle.visible = !!e.saddled;
    /* ---- hunger: the horse is the one animal that acts on it ----
       Grazing is the idle head-dip it already does — standing on grass with its nose down now
       actually feeds it (the turf is left alone: a horse in your garden must not strip it to
       dirt the way a sheep does). A rider at speed burns it faster; a full belly heals. */
    if (e.rider && spd > 0.5) e.hunger = Math.max(0, entHunger(e) - ENT_HUNGER_DECAY * (HORSE_RIDE_HUNGER - 1) * dt);
    if (!e.rider && e.headDip > 0.7 && e.onGround &&
        (getBlock(Math.floor(e.x), Math.floor(e.y - 0.02), Math.floor(e.z)) & 255) === B.GRASS)
      e.hunger = Math.min(ENT_HUNGER_MAX, entHunger(e) + HORSE_GRAZE_RATE * dt);
    const maxHp = entMaxHp(e);
    if (e.hp < maxHp && (e._calmT || 0) >= ENT_REGEN_DELAY && entHunger(e) > ENT_HUNGER_MAX * HORSE_REGEN_ABOVE) {
      e.regenT = (e.regenT || 0) + dt;
      if (e.regenT >= HORSE_REGEN_EVERY) {
        e.regenT = 0;
        e.hp = Math.min(maxHp, e.hp + ENT_REGEN_HP);
        e.hunger = Math.max(0, entHunger(e) - HORSE_REGEN_COST);
      }
    } else e.regenT = 0;
    // step assist: the model eases up the ledge the body has already climbed
    if (e.stepOff) {
      e.stepOff *= Math.max(0, 1 - dt * 11);
      if (e.stepOff > -0.01) e.stepOff = 0;
    }
    const vy = e.y + (e.stepOff || 0) - HORSE_LIE_DROP * PX * HORSE_SCALE * (e.size || 1) * (e.lieK || 0);
    m.root.position.set(e.x, vy, e.z);
    // Whoever is on its back travels with it. Written here, AFTER the horse has moved, so the
    // seat never trails a frame behind the animal — which is what makes riding feel attached.
    // It rides the EASED height too, so a step lifts the rider smoothly instead of popping them.
    if (e.rider) {
      e.rider.pos.set(e.x, vy + HORSE_SEAT_Y * (e.size || 1), e.z);   // a bigger horse, a higher seat
      e.rider.vy = 0;
    }
    shadeTinted(m, e.x, e.y, e.z, e.hurtT > 0);
    return;
  }
  animateQuadruped(m, e.walk, swing, e.headDip);
  if (m.wool) {                                  // fleece visibility/scale IS the regrow animation
    const g = e.woolly ? 1 : (e.regrowing ? Math.max(0.06, e.woolGrow) : 0);
    for (const w of m.wool) {
      w.visible = g > 0.02;
      w.scale.setScalar(g);
    }
  }
  shadeHumanoid(m, e.x, e.y, e.z, e.hurtT > 0);
}
