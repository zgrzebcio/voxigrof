'use strict';
/* entities/update.js: updateEntities, the loop over every creature: waking and parking by distance, hunger and
   healing, then the step of a villager or a monster (animals go to grazers.js, bosses to frozen-king.js, termites to
   termite.js). */

/* `pick`: only the creatures it says yes to; `frameJobs`: the player's knockback and the villagers' torch lights,
   which follow the frame. With the fixed tick (SIM_FIXED) updateEntitiesTick steps every creature but a ridden horse and
   updateEntitiesFrame the ridden one (its rider's camera rides on it) and draws the rest between their last two ticks. */
function updateEntities(dtAll, pick = null, frameJobs = true) {
  if (!playing || menuScene || !anyPlayerSpawned()) return;
  if (frameJobs) {
    _updatePlayerKick(dtAll);
    updateNpcTorchLights();                            // villagers' torches light the ground
  }
  // once a world step, not on the ridden horse's per-frame pass: hounds left behind come to their owner, a taming's
  // day runs out (entities/hellhound.js)
  if ((!pick || pick === _entIsDue) && typeof houndWorldTick === 'function') houndWorldTick(dtAll);

  for (let i = ENTITIES.length - 1; i >= 0; i--) {
    const e = ENTITIES[i];
    if (pick && !pick(e)) continue;
    // a far creature stepping every few ticks steps the time it skipped (_entDue)
    const dt = pick === _entIsDue && e._stepDt > 0 ? e._stepDt : dtAll;
    if (e.boss) { if (typeof updateBoss === 'function') updateBoss(e, dt); continue; }   // a boss has its own mind (entities/frozen-king.js)
    _useBox(e);                                        // every collision test below uses ITS box
    if (e.y < -30) { _removeEntity(i); continue; }     // fell out of the world: genuinely gone
    if (e._killedByMob) { _removeEntity(i); continue; }   // killed by another creature: nothing drops
    /* TWO RADII. Visibility follows the GENERATION radius — if the chunk is loaded, the
       mob is drawn, standing still, exactly where it was. Simulation follows the much smaller
       `simDist`: outside it the mob is skipped by every per-frame system (`active` is what
       _separateBodies reads) even though you can still see it in the distance.

       That split is the point of the change. A render distance of 32 draws ~4000 chunks, and
       stepping mobs through all of them was pure waste when the player can only reach the
       nearest handful. A parked mob resumes mid-stride the moment it comes back in range. */
    const ecx = Math.floor(e.x / 16), ecz = Math.floor(e.z / 16);
    const ec = getChunk(ecx, ecz);
    const loaded = !!(ec && ec.data);
    // shown only inside the full-detail radius: the far ring draws land, not creatures
    const shown = loaded && chunkDist2ToPlayers(ecx, ecz) <= viewDist * viewDist;
    if (e.model.root.visible !== shown) e.model.root.visible = shown;
    const sim = loaded && inSimRangeChunk(ecx, ecz);
    /* WAKE-UP AUDIT. The moment a parked mob starts simulating again, check it is somewhere it
       can actually live. A mob embedded in solid blocks — walled in by a player build, buried by
       falling gravel, or in a pocket the world has since closed — is removed rather than left
       twitching inside a wall forever. Runs once per entity per wake-up, not per frame. */
    if (sim && e.active === false && !isClaimed(e) && _entBlocked(e.x, e.y, e.z)) { _removeEntity(i); continue; }
    /* Frozen zombies never reach _zombieBurnTick, so daybreak would leave a ring of them parked
       out at the render edge waiting to combust the moment the player walked over. Sweep them at
       dawn instead — the sun reached them too, it just had nobody to show. */
    // ...and anything it was carrying is left behind rather than deleted with it
    if (!sim && isNightMob(e) && isBurningDaylight()) { _mobDropHeld(e); _removeEntity(i); continue; }
    if (!sim) { e.active = false; continue; }
    e.active = true;
    // hunger drains for every simulating entity; only the horse acts on it (see _updateGrazer)
    // ...and a hellhound, whose food is out of 120 and whose thirst is its fire (it starts on its own numbers)
    e.hunger = Math.max(0, entHunger(e) - ENT_HUNGER_DECAY * dt);
    e.thirst = Math.max(0, entThirst(e) - ENT_THIRST_DECAY * dt);   // 0.823
    if (e.milkCd > 0) e.milkCd -= dt;                  // a milked cow refills (entities/taming.js)
    // a hit is noticed as hp lower than last tick; healing never restarts the no-damage clock
    if (e._hpSeen != null && e.hp < e._hpSeen) e._calmT = 0; else e._calmT = (e._calmT || 0) + dt;
    if (e.kind !== 'horse') {
      const maxHp = entMaxHp(e);
      if (e.hp > 0 && e.hp < maxHp && e._calmT >= ENT_REGEN_DELAY && entHunger(e) > 0) {
        e._regenT = (e._regenT || 0) + dt;
        if (e._regenT >= ENT_REGEN_EVERY) {
          e._regenT = 0;
          e.hp = Math.min(maxHp, e.hp + ENT_REGEN_HP);
          e.hunger = Math.max(0, entHunger(e) - ENT_REGEN_COST);
        }
      } else e._regenT = 0;
    }
    e._hpSeen = e.hp;
    /* THE mob's target is whichever player is nearest right now. Everything below reads
       `tp` instead of the active-context `player`, because entities tick once for the world, not
       once per viewport — a mob must not chase whoever happens to be mid-render. */
    const tp = nearestPlayerTo(e.x, e.z);
    const pdx = tp.pos.x - e.x, pdz = tp.pos.z - e.z;
    const pdy = tp.pos.y - e.y;
    const distXZ = Math.hypot(pdx, pdz);

    /* STUCK WATCHDOG. `wantMove` is set by the movement blocks below: it means the mob asked to
       walk this tick. If it asks and asks and never actually moves, it is wedged — a one-block
       hole it fell into, a crevice, a pocket a build sealed around it — and no amount of further
       ticking will free it, so it is removed. Only ever out of sight (>16 blocks): nothing is
       allowed to blink out while you are looking at it. */
    if (e._px !== undefined && e.wantMove) {
      const dx2 = e.x - e._px, dz2 = e.z - e._pz;
      if (dx2 * dx2 + dz2 * dz2 < 1e-6) {
        e.stuckT = (e.stuckT || 0) + dt;
        if (e.stuckT > ENT_STUCK_TIME && distXZ > 16 && !isClaimed(e)) { _fxEntGone(e); _removeEntity(i); continue; }
      } else e.stuckT = 0;
    } else e.stuckT = 0;
    e._px = e.x; e._pz = e.z;

    if (e.hurtT > 0) e.hurtT -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.jumpCd > 0) e.jumpCd -= dt;
    if (isGrazer(e)) { _updateGrazer(e, dt, pdx, pdz, distXZ, i, tp); continue; }   // tp: whom a bear hunts
    if (isFish(e)) { _updateFish(e, dt, tp, i); continue; }   // 0.805
    if (mobOf(e).body === 'insect') { updateTermite(e, dt, tp, i); continue; }   // termites (entities/termite.js)
    /* ---- night mobs: claw out of the ground, hunt on sight, burn at dawn ---- */
    if (isNightMob(e)) {
      if (e.riseT > 0) {
        // Emerging. The body is already at its final position; only the MODEL is sunk, so the
        // terrain it is rising through hides the buried half for free.
        e.riseT -= dt;
        const sunk = ENT_H * Math.max(0, e.riseT / ZOMBIE_RISE_TIME);
        e.model.root.position.set(e.x, e.y - sunk, e.z);
        e.model.root.rotation.y = e.yaw;
        // arms up out of the soil first, legs still
        animateHumanoid(e.model, 0, 0, 0);
        e.model.armR.rotation.x = e.model.armL.rotation.x = -2.4;
        shadeHumanoid(e.model, e.x, e.y, e.z, false, false);
        continue;                                    // no AI, no gravity, no damage while rising
      }
      if (_zombieBurnTick(e, dt)) { _fxEntGone(e, true); _removeEntity(i); continue; }
      if (e.burnT > 0) e.burnT -= dt;
      // Always hostile inside the hunting radius; creative flight and death call it off.
      if (!tp.canFly && !tp.dead && distXZ <= ZOMBIE_CHASE_RANGE) e.state = 'chase';
      else if (e.state === 'chase') e.state = 'wander';
      // a skeleton shows what it is holding the moment it is out of the ground
      if (e.kind === 'skeleton')
        setMobHeld(e, e.arm === 'bow' ? ITEM.BOW : e.arm === 'sword' ? ITEM.FLINT_SWORD : null);
      // a zombie comes up empty-handed and scavenges: anything dropped near it is fair game
      if (e.kind === 'zombie') {
        e.pickCd = (e.pickCd || 0) - dt;
        if (e.pickCd <= 0) { e.pickCd = MOB_PICKUP_CD; _mobTryPickup(e, ZOMBIE_DMG); }
      }
    }
    if (tp.canFly && (e.aggroT > 0 || e.state === 'chase')) {
      e.aggroT = 0; e.thinkT = 0; e.state = 'wander';   // switching to creative calls off the fight
    }
    if (e.aggroT > 0) {
      e.aggroT -= dt;
      if (e.aggroT <= 0 || distXZ > ENT_AGGRO_RANGE) { e.aggroT = 0; e.state = 'wander'; }
    }
    /* ---- who it is fighting ----
       A monster or a villager with a creature to fight chases THAT; everything below, up to the swing,
       reads its target through tg*, which is the foe when there is one and the player otherwise — so
       the chase, the aim, the reach and the blow are one code path for both. A villager whose fight
       with a monster ends goes back to its day, unless a player has provoked it meanwhile. */
    const foe = _entFoe(e, tp, distXZ, dt);
    if (foe) { e.state = 'chase'; e._foeChase = true; }
    else if (e._foeChase) { e._foeChase = false; if (e.kind === 'npc' && !(e.aggroT > 0)) e.state = 'wander'; }
    const tgX = foe ? foe.x : tp.pos.x, tgY = foe ? foe.y : tp.pos.y, tgZ = foe ? foe.z : tp.pos.z;
    const tgDx = tgX - e.x, tgDz = tgZ - e.z, tgDy = tgY - e.y, tgDist = Math.hypot(tgDx, tgDz);
    const tgDead = foe ? foe.hp <= 0 : tp.dead;
    const tgReach = entAttackRange(e, foe ? { R: entR(foe) } : tp);
    const tgEye = foe ? 1.62 : (tp.EYE || 1.62);

    /* ---- water state: drives escape steering, swimming and current drift ---- */
    const inWater = isWaterVal(getBlock(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z)));

    /* ---- decide a heading ---- */
    let moveSpeed = 0;
    /* An archer walks one way and looks another — it gives ground while still aiming at you — so
       the model's facing is allowed to come apart from the travel heading for one tick. Cleared
       every frame: anything that does not set it walks the way it faces, as before. */
    e.faceYaw = null;
    /* Monsters have no sense of danger: a hunting zombie or skeleton keeps coming straight
       through water after you instead of breaking off to swim ashore, and (see `bad` below) walks
       off ledges and into lava without a second look. Only a monster with nothing to chase swims
       for the shore. */
    const mindless = isNightMob(e);
    const huntingInWater = inWater && mindless && e.state === 'chase' && !tgDead;
    if (inWater && !huntingInWater) {
      // Swim straight for the nearest dry land. The heading is latched for a moment so a mob
      // can't re-pick a direction every frame (that was the spin-in-place bug), and water is no
      // longer treated as an obstacle here — otherwise every step was "blocked" and it froze.
      e.escapeT -= dt;
      if (e.escapeT <= 0) {
        e.escapeT = 0.8;
        let best = null, bestD = Infinity;
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          for (let r = 2; r <= 8; r++) {
            const tx = Math.floor(e.x + Math.sin(ang) * r), tz = Math.floor(e.z + Math.cos(ang) * r);
            const sy = surfaceY(tx, tz);
            const st = getBlock(tx, sy, tz) & 255;
            if (st === B.WATER || st === B.AIR || st === B.LAVA) continue;
            if (sy + 1 > e.y + 3) continue;                 // can't climb out onto a cliff
            if (r < bestD) { bestD = r; best = ang; }
            break;
          }
        }
        if (best !== null) e.yaw = best;
        else if (e.escapeT >= 0.8) e.yaw += 1.2;            // no shore found: sweep slowly, no spin
      }
      moveSpeed = ENT_SPEED;
      e.state = 'wander';
    } else if (e.thinkT > 0) {
      // just got hit: stand still and process it for a beat before turning and swinging back
      e.thinkT -= dt;
      moveSpeed = 0;
    } else if (e.kind === 'skeleton' && e.arm === 'bow' && e.ammo > 0 && e.state === 'chase' && !tgDead) {
      /* ---- archer: fights at range ----
         It closes only until it has a clear shot, gives ground when you crowd it, and stands
         perfectly still while the string is back — a drawing skeleton is a stationary one, which
         is what makes charging it the right answer. Behind a wall it keeps walking rather than
         firing into the stone. */
      const aimY = tgY + tgEye * 0.6;
      const los = hasLineOfSight(e.x, e.y + 1.45, e.z, tgX, aimY, tgZ);
      e.faceYaw = Math.atan2(tgDx, tgDz);
      if (e.shootCd > 0) e.shootCd -= dt;
      if (tgDist > SKEL_SHOOT_RANGE || !los) {
        e.yaw = e.faceYaw; moveSpeed = SKEL_CHASE_SPEED; e.drawT = 0;
      } else if (tgDist < SKEL_KEEP_DIST) {
        e.yaw = e.faceYaw + Math.PI; moveSpeed = SKEL_SPEED; e.drawT = 0;
        /* Cornered. An archer with its back to a wall cannot retreat and must not stand there
           being free damage, so at arm's length it swings the bow instead — bare-bones damage,
           not a sword's, and it still refuses to shoot from inside your face. */
        if (tgDist < tgReach && Math.abs(tgDy) < 2 && e.atkCd <= 0) {
          e.atkCd = ENT_ATTACK_CD;
          e.atkAnimT = ENT_ATK_ANIM;
          moveSpeed = 0;
          if (foe) _mobHitsMob(e, foe, SKEL_DMG_HANDS, tgDx, tgDz, tgDist);   // a villager in its face
          else {
            const blocked = typeof shieldBlock === 'function' && shieldBlock(tp, e.x, e.z, SKEL_DMG_HANDS);
            if (!blocked) {
              tp.hp -= SKEL_DMG_HANDS;             // out of 100 on both sides since 0.823
              tp._dmgCause = `was slain by a ${e.name}`;
            }
            tp._hitBy = e; tp._hitByAt = performance.now();   // 0.845
            const mlen = distXZ || 1;
            const kick = playerKick(tp);
            const kbMul = (1 - (typeof playerKnockbackResist === 'function'
                                ? withPlayer(tp, playerKnockbackResist) : 0)) * (blocked ? SHIELD_KNOCK_MUL : 1);
            kick.x = pdx / mlen * PLY_KNOCK * 0.7 * kbMul;
            kick.z = pdz / mlen * PLY_KNOCK * 0.7 * kbMul;
          }
        }
      } else {
        e.yaw = e.faceYaw;
        if (e.shootCd <= 0) {
          e.drawT += dt;
          if (e.drawT >= SKEL_DRAW_TIME) {
            e.drawT = 0;
            e.shootCd = SKEL_SHOOT_CD;
            e.ammo--;
            mobShoot(e, foe ? _entAimTarget(foe) : tp, { ammoId: e.ammoId, dmg: SKEL_ARROW_DMG, speed: SKEL_ARROW_SPEED });
            // quiver empty: it comes at you with what is left of it
            if (e.ammo <= 0) { e.arm = 'hands'; e.dmg = SKEL_DMG_HANDS; setMobHeld(e, null); }
          }
        }
      }
    } else if (e.state === 'chase' && !tgDead) {
      e.yaw = Math.atan2(tgDx, tgDz);
      moveSpeed = mobOf(e).chase;                  // its kind's `chase` (the creature table, entities/mobs.js)
      if (tgDist < tgReach && Math.abs(tgDy) < 2 && e.atkCd <= 0) {
        e.atkCd = ENT_ATTACK_CD;
        e.atkAnimT = ENT_ATK_ANIM;                 // arm chops through on the hit
        moveSpeed = 0;
        // another creature: it takes the blow, and none of the player's shield or knockback applies
        if (foe) { _mobHitsMob(e, foe, e.dmg || ENT_ATTACK_DMG, tgDx, tgDz, tgDist); }
        else {
        // a raised shield facing the blow stops it outright (40-shield.js)
        const blocked = typeof shieldBlock === 'function' && shieldBlock(tp, e.x, e.z, e.dmg || ENT_ATTACK_DMG);
        if (!blocked) {
          tp.hp -= (e.dmg || ENT_ATTACK_DMG);   // out of 100 on both sides since 0.823
          tp._dmgCause = `was slain by a ${e.name}`;
        }
        tp._hitBy = e; tp._hitByAt = performance.now();   // 0.845
        /* Knock the player back with the same decaying-velocity model the mobs use, minus
           whatever their armour set resists. Read inside `withPlayer(tp, ...)`: entities tick
           once for the WORLD, so the equipment globals belong to whichever seat happens to be
           installed — the resistance has to come from the player actually being hit. */
        const m = distXZ || 1;
        const kick = playerKick(tp);
        const kbMul = 1 - (typeof playerKnockbackResist === 'function'
                           ? withPlayer(tp, playerKnockbackResist) : 0);
        const kbShield = blocked ? SHIELD_KNOCK_MUL : 1;   // a blocked blow still shoves, a little
        kick.x = pdx / m * PLY_KNOCK * kbMul * kbShield;
        kick.z = pdz / m * PLY_KNOCK * kbMul * kbShield;
        if (!blocked && !tp.flying && Math.abs(tp.vy) < 0.5) tp.vy = PLY_KNOCK_HOP * kbMul;
        }
      }
    } else {
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 2 + Math.random() * 4;
        e.state = Math.random() < 0.35 ? 'idle' : 'wander';
        if (e.state === 'wander') e.yaw = Math.random() * Math.PI * 2;
      }
      const walkSpeed = mobOf(e).walk;             // its kind's `walk`
      moveSpeed = e.state === 'wander' ? walkSpeed : 0;
      // leash: outside its home radius the next heading always points back, so a mob can drift
      // around its spawn region but never migrates across the world
      const hdx = e.hx - e.x, hdz = e.hz - e.z;
      if (Math.hypot(hdx, hdz) > ENT_HOME_RANGE) {
        e.yaw = Math.atan2(hdx, hdz);
        e.state = 'wander';
        moveSpeed = walkSpeed;
      }
    }

    /* ---- horizontal move with a hop over 1-block steps ---- */
    let moved = 0;
    // getting knocked back briefly overrides walking, so a chasing mob can't immediately
    // stride back through its own knockback and cancel it out
    const stunned = (e.kx !== 0 || e.kz !== 0);
    e.wantMove = moveSpeed > 0 && !stunned;      // read by the stuck watchdog next tick
    if (moveSpeed > 0 && !stunned) {
      moveSpeed *= boxDragMul(e.x, e.y, e.z, _boxR, _boxH);  // leaves/litter -40%, snow -70%
      const sx = Math.sin(e.yaw) * moveSpeed * dt;
      const sz = Math.cos(e.yaw) * moveSpeed * dt;
      // while swimming, water is the medium rather than an obstacle; a monster never checks hazards
      const bad = (nx, nz) => _entBlocked(nx, e.y, nz) || (!inWater && !mindless && _entHazard(nx, e.y, nz));
      let blocked = false;
      if (!bad(e.x + sx, e.z)) { e.x += sx; moved += Math.abs(sx); } else blocked = true;
      if (!bad(e.x, e.z + sz)) { e.z += sz; moved += Math.abs(sz); } else blocked = true;
      // a wall it could clear by stepping up one block: jump instead of grinding into it
      if (blocked && (e.onGround || inWater) && e.jumpCd <= 0 && !_entBlocked(e.x + sx, e.y + 1, e.z + sz)) {
        e.vy = ENT_JUMP; e.jumpCd = 0.6; e.onGround = false;
      } else if (blocked && e.state !== 'chase' && !inWater) {
        // re-roll on the wander timer, never every frame — that produced a fast spin in place
        if (e.turnCd <= 0) { e.yaw = Math.random() * Math.PI * 2; e.turnCd = 0.5; }
      }
    }
    if (e.turnCd > 0) e.turnCd -= dt;

    /* ---- current drift: flowing water carries a mob along, same as the player and drops ---- */
    if (inWater && waterFlowVec(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z), _flowV)) {
      const fdx = _flowV.x * 1.9 * dt, fdz = _flowV.z * 1.9 * dt;
      if (!_entBlocked(e.x + fdx, e.y, e.z)) e.x += fdx;
      if (!_entBlocked(e.x, e.y, e.z + fdz)) e.z += fdz;
    }

    /* ---- knockback slide: decays away instead of snapping the position ---- */
    if (e.kx || e.kz) {
      const kdx = e.kx * dt, kdz = e.kz * dt;
      if (!_entBlocked(e.x + kdx, e.y, e.z)) e.x += kdx;
      if (!_entBlocked(e.x, e.y, e.z + kdz)) e.z += kdz;
      const k = Math.max(0, 1 - ENT_KNOCK_DECAY * dt);
      e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) { e.kx = 0; e.kz = 0; }
    }

    /* ---- environmental damage: lava burns, cactus pricks, deep water drowns ---- */
    if (e.hazCd > 0) e.hazCd -= dt;
    const feetId = getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)) & 255;
    const headId = getBlock(Math.floor(e.x), Math.floor(e.y + 1.5), Math.floor(e.z)) & 255;
    let touchCactus = false;
    for (const [cx2, cz2] of [[1,0],[-1,0],[0,1],[0,-1]])
      if ((getBlock(Math.floor(e.x) + cx2, Math.floor(e.y + 0.9), Math.floor(e.z) + cz2) & 255) === B.CACTUS)
        { touchCactus = true; break; }
    if (feetId === B.LAVA || headId === B.LAVA) e.fireT = Math.max(e.fireT || 0, LAVA_FIRE_S);   // alight for 10 s
    if (e.hazCd <= 0) {
      let dmg = 0;
      if (feetId === B.LAVA || headId === B.LAVA) dmg = ENT_LAVA_DMG;
      else if (feetId === B.CACTUS || touchCactus) dmg = ENT_CACTUS_DMG;
      if (dmg > 0) {
        e.hazCd = ENT_HAZARD_CD;
        e.hurtT = 0.25;
        e.hp -= dmg;
        if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); continue; }
      }
    }
    if (headId === B.WATER) {
      e.airT -= dt;
      if (e.airT <= 0) {
        e.airT = 1;                                   // one drown tick per second once out of air
        e.hurtT = 0.25;
        e.hp -= ENT_DROWN_DMG;
        if (e.hp <= 0) { if (!player.canFly) _entDropLoot(e); _removeEntity(i); continue; }
      }
    } else e.airT = ENT_AIR_MAX;

    /* ---- gravity + ground ---- */
    // Resting on a floor is a hard stop: don't integrate gravity at all, or the mob spends every
    // frame falling a hair and being snapped back up (the shake).
    const wasGround = e.onGround;
    const standing = !inWater && e.vy <= 0 && _entBlocked(e.x, e.y - 0.02, e.z);
    if (standing) {
      e.y = Math.floor(e.y - 0.02) + 1;                  // seat exactly on the block top
      e.vy = 0;
      e.onGround = true;
    } else {
      const ny = _entFallStep(e, dt);                    // 0.8451
      if (_entBlocked(e.x, ny, e.z)) {
        if (e.vy < 0) {
          e.y = Math.floor(ny) + 1;                      // land on the block top
          e.onGround = true;
        }
        e.vy = 0;
      } else {
        e.y = ny;
        e.onGround = false;
      }
    }
    if (_entFallDamage(e, i, wasGround, inWater)) continue;   // in updateEntities' own loop
    // Swimming: buoyancy holds the mob at the surface, but it must never CLAMP an active climb
    // — the old unconditional Math.min pulled a fresh hop straight back down to 4.2.
    if (inWater) {
      if (e.vy < 4.2) e.vy = Math.min(e.vy + 40 * dt, 4.2);
      e.onGround = false;
      // Right at the edge of land, climb straight onto the ledge. Probing a real standing
      // height (not just y+1) is what makes this work at a shoreline.
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      const ax = e.x + fx * 0.6, az = e.z + fz * 0.6;
      if (e.jumpCd <= 0 && _entBlocked(ax, e.y, az)) {
        const ty = _stepUpTarget(e, ax, az);
        if (ty !== null) { e.y = ty; e.x = ax; e.z = az; e.vy = 1.5; e.jumpCd = 0.3; }
      }
    }

    /* ---- visuals ---- */
    if (e.atkAnimT > 0) e.atkAnimT -= dt;
    if (e.flailT > 0) e.flailT -= dt;
    const spd = moved / Math.max(dt, 1e-4);
    entityStepSound(e, dt, spd);
    let swing = Math.min(spd / 4.5, 1) * 0.75;
    // taking a hit thrashes the limbs through the walk cycle even when standing still
    if (e.flailT > 0) {
      e.walk += 11 * dt;
      swing = Math.max(swing, 0.85);
    } else {
      e.walk += Math.min(spd, 9) * dt * 2.2;
    }
    const m = e.model;
    m.root.position.set(e.x, e.y, e.z);
    // model faces +Z; yaw is measured the same way. An archer backing away keeps facing its shot.
    m.root.rotation.y = e.faceYaw != null ? e.faceYaw : e.yaw;
    // aggroed mobs stare at the player
    const lookPitch = e.state === 'chase'
      ? Math.max(-0.7, Math.min(0.7, -Math.atan2(pdy + 1.2, Math.max(distXZ, 0.1)) * 0.8)) : 0;
    /* A drawing mob poses from the SAME animateHumanoid draw as a drawing player, and reveals
       the arrow it actually has nocked — so multi-ammo weapons show what is about to hit you. */
    const drawP = (e.drawT > 0 && e.arm === 'bow') ? Math.min(1, e.drawT / SKEL_DRAW_TIME) : 0;
    /* A villager's torch: as each night falls, half of them light one and carry it in the left hand
       till morning. Rolled once a night per villager. */
    if (e.kind === 'npc') {
      const dark = isDarkTime(worldTime, 0.02), night = Math.floor(worldDay + worldTime + 0.25);
      if (dark && e._torchNight !== night) { e._torchNight = night; e.torchL = Math.random() < NPC_TORCH_CHANCE; }
      if (!dark) e.torchL = false;
      if (!m.offGrp) { m.offGrp = new THREE.Group(); m.armL.add(m.offGrp); m._offId = null; }
      const want = e.torchL ? B.TORCH : null;
      if (m._offId !== want) { m._offId = want; setHeldOnArm(m.offGrp, want); }
      if (e.torchL && typeof _fxFlame === 'function' && Math.random() < dt * 6) {
        m.offGrp.getWorldPosition(_npcTorchPos);
        _fxFlame(_npcTorchPos.x, _npcTorchPos.y + 0.35, _npcTorchPos.z, 0.35, 0.1);
      }
    }
    const hopts = drawP > 0 ? { draw: drawP } : e.torchL ? { holdL: true } : undefined;
    animateHumanoid(m, e.walk, swing, lookPitch, Math.max(0, e.atkAnimT) / ENT_ATK_ANIM, hopts);
    /* Every frame, for every skeleton — NOT only the bow-armed ones. A shooter that
       empties its quiver drops to `hands`, and skipping this call then left the last nocked
       arrow floating in the fist of a mob that has no bow any more. */
    if (e.kind === 'skeleton')
      poseModelNock(m, e.arm === 'bow' ? e.ammoId : null, e.arm === 'bow' ? drawP : 0);
    // zombies hold both arms out in front; the attack chop still wins when it is swinging
    if (e.kind === 'zombie' && e.atkAnimT <= 0) {
      const sway = Math.sin(e.walk * 0.6) * 0.09;
      m.armR.rotation.x = -1.55 + sway;  m.armL.rotation.x = -1.55 - sway;
      m.armR.rotation.z = 0.06;          m.armL.rotation.z = -0.06;
    }
    shadeHumanoid(m, e.x, e.y, e.z, e.hurtT > 0, e.burnT > 0);
  }
  _separateBodies(dtAll);
  _useBox(null);                // spawn checks and everything else outside the loop: humanoid box
}
