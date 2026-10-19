'use strict';
/* player/tick.js: tickPlayer, everything one player does in a frame. Input to movement, the camera, breaking and
   placing, mining, held light, eating, the bow, riding. */

/* ================================================================================================
   PER-PLAYER TICK — input, movement, camera, targeting, mining/placing, vitals, hand.
   Runs once per player per frame with that player's globals installed.
   ================================================================================================ */
function tickPlayer(dt, now, slot) {
  const kbOwner = slot === 0;               // keyboard and mouse belong to player one only
  /* ---- input & movement ---- */
  const _preYaw = player.yaw, _prePitch = player.pitch;
  const gp = pollGamepad(dt);
  const joining = worldHeld();              // world still loading in, or the pause menu up: frozen like the dead
  // ...and the same while a cow is being milked (updateMilking in entities/taming.js): you stand still for it
  const benching = !!player._benchWork || !!player._milk;     // holding E at a crafting bench: nothing else answers
  if (player.dead || joining || benching) {             // dead: no look (mouse gated in input, pad undone here),
    player.yaw = _preYaw; player.pitch = _prePitch;   // no movement, no fly/jump input
    gp.mx = gp.mz = 0; gp.up = gp.dn = false;
  }
  const kb = kbOwner && playing && !invOpen && !player.dead && !joining && !benching;   // keyboard steers when no menu/inventory is open
  let fwd = (kb && keys.KeyW ? 1 : 0) - (kb && keys.KeyS ? 1 : 0) - gp.mz;
  let str = (kb && keys.KeyD ? 1 : 0) - (kb && keys.KeyA ? 1 : 0) + gp.mx;
  const upHeld = (kb && keys.Space) || gp.up;
  const dnHeld = (kb && (keys.ShiftLeft || keys.ShiftRight)) || gp.dn;
  /* Sneak waits for a fresh press after the inventory opens or closes: Shift held for a shift-click, or the
     pad's button held as it shut, does not drop you into a sneak until it has been let go. */
  const dnRaw = (kbOwner && (keys.ShiftLeft || keys.ShiftRight)) || gp.dn;
  if (player._sneakLatch && !dnRaw) player._sneakLatch = false;
  /* A sneak kept through the inventory (toggleInventory in ui/inventory-open.js) ends, once it is shut, when sneak
     is let go after a press or you walk; looking around keeps it. */
  if (player._sneakKeep && !invOpen) {
    if (fwd || str || player.dead || player.flying) player._sneakKeep = false;
    else if (dnRaw) player._sneakKeepDn = true;
    else if (player._sneakKeepDn) player._sneakKeep = false;
  }
  if (!player._sneakKeep) player._sneakKeepDn = false;
  /* Eating or holding up a shield means walking, never sprinting. Both flags are last frame's,
     which is all a one-frame-late cancel needs. */
  if (player.blocking || player._eatProg > 0 || player._drawProg > 0 || playerIsCrafting()) player.fast = false;   // ...and a running crafting queue   // drawing a bow too
  if (playerTired()) player.fast = false;   // out of stamina: no sprint until it is back to 20
  const len = Math.hypot(fwd, str);
  if (len > 1) { fwd /= len; str /= len; }

  /* ---- lying in a bed ----
     Sneak is the only control that still means anything: it gets you back up. Everything else is
     zeroed below, next to the title-screen case, so the body stays pinned to the mattress. The
     look stick stays live so you can glance around from the pillow. */
  if (player.sleepingAt && dnHeld) leaveBed(player);
  const lying = !!player.sleepingAt;
  const grounded = onGround();
  const inWater = (getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + 0.4), Math.floor(player.pos.z)) & 255) === B.WATER;
  player._inWater = inWater;               // exposed for fall damage + hand animation
  // loose ground with nothing under it gives way as you step on it (_fallUnderFeet)
  if (grounded && !player.flying && player.spawned && !player.dead && !menuScene && !joining) _fallUnderFeet();
  // never in the inventory, unless you were crouched as it opened
  player.sneaking = !player.flying && !inWater && grounded && !player.dead
    && ((dnHeld && !invOpen && !player._sneakLatch) || !!player._sneakKeep);
  /* Sneak and sprint never together, and a sprint only runs forward: backing up or a pure sidestep drops
     it. Flying keeps its fast move in every direction. */
  if (player.sneaking) player.fast = false;
  if (!player.flying && (fwd || str) && fwd <= 0.1) player.fast = false;
  const fast = player.fast;
  const onClimb = !player.flying && !inWater && player.spawned && !menuScene && playerOnClimbable();   // 0.765
  // up a bare wall (player/movement.js); at its lip a last heave carries you over the edge
  const wallClimb = !onClimb && player.spawned && !menuScene && !joining && !benching && !lying
                    && wallClimbWanted(upHeld, fwd, grounded, inWater);
  if (!wallClimb && player._wallClimbing && upHeld && fwd > 0.1 && !wallAhead()) player.vy = Math.max(player.vy, WALL_CLIMB_MANTLE_VY);
  player._wallClimbing = wallClimb;
  let dy, hSpeed;
  player._swimUp = false;                   // swimming up costs stamina (tickStats in player/stats.js)
  if (player.flying) {
    hSpeed = player.speed * (fast ? player.fastMul : 1);
    dy = ((upHeld ? 1 : 0) - (dnHeld ? 1 : 0)) * hSpeed * dt;
    player.vy = 0;
    if (dnHeld && grounded) player.flying = false;  // sneak onto a block top -> land & walk
  } else {
    if (inWater) {                          // swim: jump = up, shift = fast sink, else slow sink
      // sprint-swim: passive float/sink 95% weaker AND vy damped hard so the player
      // glides at near-constant depth (no drift up or down)
      const sprintSwim = fast && fwd > 0.1;
      const glide = sprintSwim && !upHeld && !dnHeld;
      // out of stamina you still rise, at about half the pull, so a tired swimmer is not drowned by it
      const tired = playerTired();
      player._swimUp = upHeld;
      const acc = (upHeld ? (tired ? 20 : 36) : dnHeld ? -32 : -14) * (glide ? 0.05 : 1);
      player.vy = Math.max(dnHeld ? -7 : -5, Math.min(4.5, player.vy + acc * dt));
      if (glide) player.vy *= Math.max(0, 1 - 10 * dt);
      // sprint-swim: pitch steers depth, but vertical component is 95% slower than horizontal
      if (fast && fwd > 0.1) {
        const pitchVert = Math.sin(player.pitch) * 30 * dt * 0.05;
        player.vy = Math.max(-6, Math.min(6, player.vy + pitchVert));
      }
      // near the surface + holding jump: full pop-out ONLY next to a climbable wall —
      // otherwise cap upward speed so you bob at the surface instead of jumping on water
      if (upHeld && (getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + 1.2), Math.floor(player.pos.z)) & 255) !== B.WATER) {
        const px = Math.floor(player.pos.x), pyF = Math.floor(player.pos.y), pz = Math.floor(player.pos.z);
        let nearWall = false;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]])
          if (isSolid(px + dx, pyF, pz + dz) || isSolid(px + dx, pyF + 1, pz + dz)) { nearWall = true; break; }
        if (nearWall) player.vy = 8.0;
        else player.vy = Math.min(player.vy, 3.0);
      }
    } else if (onClimb) {
      // on a glow vine: forward or jump climbs, sneak holds on, otherwise a slow slide down
      /* Where you look sets the pace: straight up climbs CLIMB_LOOK_BONUS faster, straight down
         slides that much faster, blending smoothly in between; level ground is the normal speed. */
      const look = Math.max(-1, Math.min(1, player.pitch / (Math.PI / 2)));
      if (upHeld || fwd > 0.1) player.vy = CLIMB_SPEED * (1 + CLIMB_LOOK_BONUS * Math.max(0, look));
      else if (dnHeld) player.vy = 0;
      else player.vy = Math.max(player.vy - 27 * dt, -CLIMB_SLIDE * (1 + CLIMB_LOOK_BONUS * Math.max(0, -look)));
      player.fallStart = null;                  // a climb is never a fall
    } else if (wallClimb) {
      player.vy = WALL_CLIMB_SPEED;             // hand over hand up the wall
      player.fallStart = null;
    } else {
      // jump strength is a HEIGHT multiplier and height goes with velocity squared, hence the root
      // ...and no jumping out of stamina; a crafting queue running halves its strength (no jump 0.804-0.825)
      if (grounded) { if (player.vy < 0) player.vy = 0; if (upHeld && !playerTired()) player.vy = 8.7 * Math.sqrt(playerJumpMul() * snowJumpMul() * (playerIsCrafting() ? CRAFT_JUMP_MUL : 1)); }
      player.vy = Math.max(-58, player.vy - 27 * dt);           // gravity
      // in a cobweb you sink slowly and barely hop
      if (playerInCobweb()) player.vy = Math.max(-COBWEB_VY_MAX, Math.min(COBWEB_VY_MAX, player.vy));
    }
    dy = player.vy * dt;
    hSpeed = player.walkSpeed * (player.sneaking ? 0.3 : fast ? (inWater ? 1.9 : 1.6) : 1) * (inWater ? 0.45 : 1)
           * playerMoveSpeedMul()                // heavy armor slows you down
           * terrainSpeedMul()                   // leaves/litter -40%, snow carpet -70%
           * playerStormMoveMul()                // a sandstorm, up to -45%
           * (player.blocking ? SHIELD_MOVE_MUL : 1)    // behind a raised shield
           * (player._eatProg > 0 ? EAT_MOVE_MUL : 1)   // mid-bite: as slow as a raised shield
           * (player._drawProg > 0 ? DRAW_MOVE_MUL : 1)  // bow string back: the same again
           * (playerIsCrafting() ? craftMoveMul() : 1);  // crafting queue running (0.76; Walk and Work 0.79)
  }
  if (!player.spawned) { player.vy = 0; dy = 0; }   // hold still until the spawn chunk exists
  // hands on a wall, or on a ladder going somewhere: the climbing arms play and the hands are busy
  player._climbAnim = wallClimb || (onClimb && Math.abs(player.vy) > 0.2);
  if (joining || benching) { fwd = 0; str = 0; dy = 0; player.vy = 0; }   // ...and until the whole neighbourhood does
  if (menuScene) { fwd = 0; str = 0; dy = 0; player.vy = 0; }   // title camera: rotation only
  if (lying) {                                  // asleep: pinned to the mattress, look only
    fwd = 0; str = 0; dy = 0; player.vy = 0; player.sneaking = false; player._movingH = 0; player._climbAnim = false;
    const s = player.sleepingAt, d = BED_DIR[s.facing & 3];
    player.pos.set(s.x + 0.5 + d[0] * 0.5, s.y + BED_H, s.z + 0.5 + d[1] * 0.5);
  }
  /* ---- riding ----
     The rider does not move: the ANIMAL does. The intent is handed over here — forward/back and
     jump — and entities/entities.js drives the body with it and then plants the rider on its back, so
     the seat never lags a frame behind. Sneak is the only control that still means "me": it gets
     you down. Steering is the mouse, because the animal follows where its rider is looking. */
  if (player.riding && dnHeld) dismountRider(player);
  if (player.riding) {
    player._rideFwd = fwd;
    player._rideJump = upHeld;
    fwd = 0; str = 0; dy = 0; player.vy = 0; player.sneaking = false; player._movingH = 0;
  }
  if (fwd || str || dy) {
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    let mdx = (str * cos - fwd * sin) * hSpeed * dt, mdz = (-fwd * cos - str * sin) * hSpeed * dt;
    // a strong wind carries a walker along or holds them back (0.81; not while flying or swimming)
    // ...stronger up high, and not indoors or behind a wall
    if (!player.flying && !player.canFly && !inWater && (mdx || mdz)) {   // never in creative
      const wm = windMoveMul(weatherAt(player.pos.x, player.pos.z, player.pos.y), mdx, mdz, windShelter(player));
      mdx *= wm; mdz *= wm;
    }
    // sneak edge-catch: cancel horizontal movement that would leave the player unsupported
    if (player.sneaking && (mdx || mdz)) {
      const p = player.pos;
      if (!onGroundAt(p.x + mdx, p.y, p.z + mdz)) {
        if (onGroundAt(p.x + mdx, p.y, p.z))       mdz = 0;
        else if (onGroundAt(p.x, p.y, p.z + mdz))  mdx = 0;
        else                                         mdx = mdz = 0;
      }
    }
    const wantY = player.pos.y + dy, x0 = player.pos.x, z0 = player.pos.z;
    movePlayer(mdx, dy, mdz);
    if (!player.flying && Math.abs(player.pos.y - wantY) > 1e-7) player.vy = 0;  // hit floor/ceiling
    // sprint drops when a wall stops us (moved <20% of the intended horizontal distance)
    const want2 = mdx * mdx + mdz * mdz;
    const got2 = (player.pos.x - x0) ** 2 + (player.pos.z - z0) ** 2;
    if (player.fast && want2 > 1e-8 && got2 < want2 * 0.04) player.fast = false;
  }
  // water current pushes the player (walking mode only; flying ignores it)
  if (!player.flying && player.spawned && !menuScene && !joining && inWater) {
    if (waterFlowVec(Math.floor(player.pos.x), Math.floor(player.pos.y + 0.4), Math.floor(player.pos.z), _flowV))
      movePlayer(_flowV.x * 1.7 * dt, 0, _flowV.z * 1.7 * dt);
  }
  /* ...and a strong wind pushes a player who is standing still, too: not flying, swimming, riding
     or asleep, and not where it is sheltered (windShelter). */
  // ...never a creative player
  if (!player.flying && !player.canFly && player.spawned && !menuScene && !joining && !benching && !inWater && !player.riding && !lying && !(fwd || str)) {
    const dr = windDrift(player, dt);
    if (dr) {
      // sneaking holds the edge against it, the same catch a sneaking walk gets
      let [ddx, ddz] = dr;
      const p = player.pos;
      if (player.sneaking && onGroundAt(p.x, p.y, p.z) && !onGroundAt(p.x + ddx, p.y, p.z + ddz)) {
        if (onGroundAt(p.x + ddx, p.y, p.z))      ddz = 0;
        else if (onGroundAt(p.x, p.y, p.z + ddz)) ddx = 0;
        else                                      ddx = ddz = 0;
      }
      if (ddx || ddz) movePlayer(ddx, 0, ddz);
    }
  }
  updateFootsteps(grounded);
  // sprint also releases when movement input stops, and on any fly<->walk transition
  const movingNow = !!(fwd || str);
  player._movingH = movingNow ? 1 : 0;   // exposed for survival sprint-drain detection
  if (player.fast && wasMoving && !movingNow) player.fast = false;
  wasMoving = movingNow;
  if (player.flying !== lastFlying) { player.fast = false; lastFlying = player.flying; }

  // void safety: fell below the world -> teleport above terrain at this X/Z
  if (player.pos.y < -16) {
    const sy = surfaceY(Math.floor(player.pos.x), Math.floor(player.pos.z));
    player.pos.y = Math.max(sy + 2, WATER_Y + 3);
    player.vy = 0;
  }

  // one-time spawn snap once a valid spawn column is loaded. A loaded save restores the
  // exact player state instead, as soon as the chunk under the saved position exists.
  if (!player.spawned) {
    // Players two and up either restore from the save (once the ground under their stored
    // position has streamed in) or, having none, step out next to player one.
    if (slot > 0) {
      /* A saved player WAITS for their own chunk — the fallback seat next to player one must
         never win that race, or their inventory and position would be silently thrown away the
         moment player one happened to spawn a frame earlier. */
      if (!applyExtraPlayerRestore(slot) && !hasPendingExtraRestore(slot) && PLAYERS[0].spawned)
        seatNewPlayer(player);
    } else if (pendingRestore) {
      const c = getChunk(Math.floor(pendingRestore.pos[0] / 16), Math.floor(pendingRestore.pos[2] / 16));
      if (c && c.data) {
        const pr = pendingRestore; pendingRestore = null;
        player.pos.set(pr.pos[0], pr.pos[1], pr.pos[2]);
        if (typeof pr.yaw === 'number') player.yaw = pr.yaw;
        if (typeof pr.pitch === 'number') player.pitch = pr.pitch;
        restoreVitals(player, pr);             // every bar; a save from before 0.82 is scaled up (player/stats.js)
        player.flying = !!pr.flying && player.canFly;
        player.vy = 0; player.fallStart = null;
        player.spawnPos = Array.isArray(pr.spawnPos)
          ? new THREE.Vector3(pr.spawnPos[0], pr.spawnPos[1], pr.spawnPos[2]) : null;
        // the world spawn and which bed (if any) currently overrides it — see releaseBedSpawns
        player.homeSpawn = Array.isArray(pr.homeSpawn)
          ? new THREE.Vector3(pr.homeSpawn[0], pr.homeSpawn[1], pr.homeSpawn[2])
          : (player.spawnPos ? player.spawnPos.clone() : null);   // pre-0.7341 save: best guess
        player.spawnBedKey = pr.spawnBedKey || null;
        // a death saved by leaving comes back as a death: updateVitals reopens its screen
        player.aliveT = +pr.aliveT || 0; player.dead = !!pr.dead; player._dmgCause = pr.cause || null;
        player._deathDay = typeof pr.deathDay === 'number' ? pr.deathDay : null;
        player._deathMarks = restoreDeathMark(pr.deathMark);   // 0.827; a list since 0.8442
        player._restacked = false;                            // stacks fitted once the inventory is back
        player._feats = restoreFeats(pr.feats);               // 0.8283
        player.craftQueue = restoreCraftQueue(pr.craftQueue);   // 0.76
        if (typeof pr.hotSel === 'number' && pr.hotSel >= 0 && pr.hotSel < HOTBAR_MAX) {
          hotbarSel = pr.hotSel; buildHotbar();
        }
        player.spawned = true;
      }
    } else {
      const s = findValidSpawn();
      if (s) {
        player.pos.set(s.x, s.y, s.z);
        player.spawned = true;
        fillVitals(player);                  // new world: every bar full, the over-stats too (0.82; all but thirst's 0.821)
        if (!player.spawnPos) player.spawnPos = player.pos.clone();
        // the world spawn, kept apart from spawnPos so a broken bed has somewhere to fall back to
        if (!player.homeSpawn) player.homeSpawn = player.pos.clone();
      }
    }
  }
  /* Loose drops and wandering mobs belong to the WORLD, not to whoever is in seat one — a profile
     opening this world for the first time has no record of its own, so restoring them alongside a
     player's spawn (as it used to be) would have quietly lost them. */
  if (slot === 0 && pendingWorldRestore && player.spawned) {
    const pw = pendingWorldRestore; pendingWorldRestore = null;
    restoreDrops(pw.drops);
    restoreEntities(pw.entities);
  }

  if (menuScene) player.yaw += dt * 0.06;   // title panorama slowly circles the overlook

  camera.position.set(player.pos.x, player.pos.y + (player.sneaking ? 1.42 : player.EYE), player.pos.z);
  // hit kick: brief decaying pitch/roll wobble on damage (camShake set by hurtFlash in 19-vitals)
  let shP = 0, shR = 0;
  if (camShake.t > 0) {
    const k = camShake.t / camShake.dur;
    shP = Math.sin(camShake.t * 50) * camShake.amp * k;
    shR = Math.cos(camShake.t * 37) * camShake.amp * 0.6 * k;
    camShake.t -= dt;
  }
  /* Nausea: the view rolls from side to side and the heading drifts on its own, slowly
     turning you one way and then back, for as long as the effect lasts. */
  if (!menuScene && !player.dead && typeof playerHasEffect === 'function' && playerHasEffect('sway')) {
    const t = sharedUniforms.uTime.value;
    // twice as fast, half as far
    shR += Math.sin(t * 2.3) * 0.11;
    shP += Math.sin(t * 1.46) * 0.025;
    player.yaw += Math.sin(t * 0.9) * 0.7 * dt;
  }
  // Clear Eyes: the shake of a hit and nausea's sway both 30% weaker (player/skills.js)
  { const sm = typeof skillSightMul === 'function' ? skillSightMul() : 1; shP *= sm; shR *= sm; }
  camera.rotation.set(player.pitch + shP, player.yaw, shR);
  applyCameraView(dt);            // F5 third-person: moves the camera back + shows the body

  /* ---- break / place (mouse + gamepad share repeat timing) ---- */
  // in bed you can look around and nothing else — no swinging, no placing, no eating
  const climbing = !!player._climbAnim;      // both hands on the wall or the ladder
  const wantBreak = !lying && !joining && !benching && !climbing && ((mouseBreak && pointerLocked) || act.padBreak);
  // ...nor while the button that just milked a cow is still down (_milkLatch in entities/taming.js)
  const wantPlace = !lying && !joining && !benching && !climbing && !player._milkLatch && ((mousePlace && pointerLocked) || act.padPlace);
  // selection highlight
  updateInvCursorVisual(dt);                 // this seat's cursor / drag ghost / hover / tooltip
  if (typeof updateSkillHold === 'function') updateSkillHold(dt);   // a skill being held to learn
  if (typeof updateDropZones === 'function') updateDropZones();      // repair / dismantle zones while carrying gear
  const hit = (playing && !invOpen) ? currentRay() : null;

  // Swinging at a mob takes priority over the block behind it. Priority is decided by AIM alone,
  // never by the attack cooldown — gating it on tryAttackEntity() meant every swing after the
  // first (while still on cooldown) fell through to the block code and mined straight through
  // the mob. wantBreak still drives the hand swing so the attack animates.
  const _entAim = (playing && !invOpen) ? pickEntityHit() : null;
  const _entPriority = entityBeatsBlock(_entAim, hit);
  if (wantBreak && _entPriority) tryAttackEntity(_entAim.ent);
  /* a sword is for creatures: it takes no block but a cobweb (it neither mines nor outlines one); swung at a block it
     is a swing at the air */
  const _heldP = ITEM_PROPS[heldUseId()];
  const _swordOff = !!(hit && _heldP && _heldP.tool === 'sword' && hit.id !== B.COBWEB);
  const wantMine = wantBreak && !_entPriority && !_swordOff;
  selBox.visible = !!hit && !_swordOff;
  if (hit) {
    const boxes = rayBoxesAt(hit.x, hit.y, hit.z);
    if (boxes && boxes.length) {
      let x0=1,y0=1,z0=1,x1=0,y1=0,z1=0;
      for (const b of boxes) { x0=Math.min(x0,b[0]); y0=Math.min(y0,b[1]); z0=Math.min(z0,b[2]);
                               x1=Math.max(x1,b[3]); y1=Math.max(y1,b[4]); z1=Math.max(z1,b[5]); }
      selBox.position.set(hit.x + (x0+x1)/2, hit.y + (y0+y1)/2, hit.z + (z0+z1)/2);
      selBox.scale.set(x1-x0, y1-y0, z1-z0);
    } else {
      selBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      selBox.scale.set(1, 1, 1);
    }
    selBox.updateMatrix();
  }
  if (typeof updateWandOutline === 'function') updateWandOutline(hit);   // what a held wand would do, outlined

  updateInteractPrompt();                   // "(E) to pickup grass" under the crosshair
  /* Crafting bench: E works the bench you are looking at, a tap takes what is finished, holding
     the right button cancels its order. Runs before bush pickup, which it replaces while aimed at one. */
  const _eHeld = (playing && !invOpen && !menuScene && !joining) && ((kbOwner && !!keys['KeyE']) || act.padPick);
  const _rmbRaw = (playing && !invOpen && !menuScene) && ((mousePlace && pointerLocked) || act.padPlace);
  // a hand on the world (chunks/block-access.js): the block changes this player makes now, with either button or
  // with E, are meshed at once, ahead of everything else the workers hold, new land included (the edit lane, chunks/stream.js)
  if (wantMine || wantPlace || _eHeld) notePlayerEdit();
  updateBenchWork(dt, _eHeld, _rmbRaw);
  // milking: the right button held on a cow for MILK_TIME; read raw, since the hold locks the controls
  if (typeof updateMilking === 'function') updateMilking(dt, _rmbRaw);
  // a sealed chest's key being turned (blocks/chest.js)
  player._unsealProg = typeof updateChestUnseal === 'function' ? updateChestUnseal(dt, _rmbRaw) : 0;
  // a glass bottle held on water fills (player/stats.js)
  player._fillProg = typeof updateBottleFill === 'function' ? updateBottleFill(dt, wantPlace) : 0;
  // drinking: crosshair on water, empty hand, E held — it takes E from the bushes around you while it runs
  player._drinkProg = updateDrinking(dt, _eHeld && !player._benchAim);
  // E on an animal you tamed pets it (entities/taming.js); while you look at one, E is its and not the bushes'
  const _petting = typeof updatePetting === 'function' && updatePetting(dt, _eHeld && !player._benchAim);
  // bush pickup: held on KeyE or pad North, repeating on its own short cooldown
  // ...and not while eating or drawing a bow: both take two hands, and foraging needs them free
  updateBushPickup(dt, _eHeld && !_petting && !player._benchAim && !(player._drinkProg > 0) && !(player._eatProg > 0) && !(player._drawProg > 0));

  // Single-press throw (edge: was not held last frame). Must run before doPlace calls.
  const _didThrow = (wantPlace && !act.place) ? tryThrow() : false;

  // Creative: instant break with 240ms repeat. Survival: progressive mining vs. hardness.
  const survivalMining = !player.canFly;
  if (survivalMining) {
    if (wantMine && hit && PROPS[hit.id].hardness === 0 && PROPS[hit.id].raycast) {
      resetMining();
      if (!act.break || now - act.lastBreak > 240) {
        if (isTNTFuseActive(hit.x, hit.y, hit.z)) { act.lastBreak = now; }
        // a hoe on grass cuts a whole square of it at once, each plant yielding as foraged (player/mining.js)
        else if (typeof hoeTargetsPlant === 'function' && hoeTargetsPlant(getBlock(hit.x, hit.y, hit.z) & 255)) {
          hoeCutGrass(hit.x, hit.y, hit.z); act.lastBreak = now;
        }
        else {
        const minedVal = getBlock(hit.x, hit.y, hit.z), minedId = minedVal & 255;
        playBlockSound(minedId, 'break', hit.x, hit.y, hit.z);
        if (typeof fxBreak === 'function') fxBreak(hit.x, hit.y, hit.z, minedVal);   // 0.8
        setBlock(hit.x, hit.y, hit.z, B.AIR);
        queueWaterAround(hit.x, hit.y, hit.z);
        queueLavaAround(hit.x, hit.y, hit.z);
        /* What it leaves (the two lines that asked blockDrop were lost long ago, and the loop left behind read a
           `drop` that was never set: every soft block broken by hand — a mushroom, a torch, a flower — threw an error and
           gave nothing). A mushroom broken gives itself, with no Lucky Hands (that is for picking, E); one still too
           small to pick gives nothing, as it gives nothing picked. */
        const tooSmall = typeof shroomTooSmall === 'function' && shroomTooSmall(minedId, (minedVal >> 8) & 255);
        if (!tooSmall)
          for (const drop of blockDrop(minedId, false))
            for (let i = 0; i < drop.count; i++) spawnDrop(drop.id, hit.x, hit.y, hit.z);
        act.lastBreak = now;
        }
      }
    } else if (wantMine && hit && Number.isFinite(PROPS[hit.id].hardness) && PROPS[hit.id].hardness > 0
               && (isToolItem(slotId(HOTBAR[hotbarSel])) || handBreakable(getBlock(hit.x, hit.y, hit.z)))) {
      // no tool, no crack — bare hands only take foliage; see handBreakable
      if (isTNTFuseActive(hit.x, hit.y, hit.z)) { resetMining(); }
      else
      if (!mining.active || mining.x !== hit.x || mining.y !== hit.y || mining.z !== hit.z
          || mining.bi !== (hit.bi || 0)          // aiming at the other half of a double slab restarts
          || mining.sel !== hotbarSel) {          // so does switching the held item (tool speed changes)
        mining.active = true;
        mining.x = hit.x; mining.y = hit.y; mining.z = hit.z; mining.bi = hit.bi || 0;
        mining.sel = hotbarSel;
        mining.elapsed = 0;
        // per user (2026-07-12): all break times shortened by 10% (multiplier 0.9).
        // right tool in hand (shovel/pickaxe/axe) divides the time further (1.5 = 50% faster).
        // wood and ground dig 1.5x slower than they used to, stone unchanged (player/mining.js)
        // one layer comes off quickly: a quarter of the block for a drift, half for a solid layer
        const hv = getBlock(hit.x, hit.y, hit.z);
        /* By hand: sand, gravel, snow and glass come away at half a flint tool's speed, and a whole sand,
           gravel or snow block only a layer at a time — each dig is timed as one layer of it. */
        const hand = !isToolItem(heldUseId()) && HAND_SLOW_BLOCKS.has(hit.id & 255);
        const byLayer = hand && DIG_BY_LAYER.has(hit.id & 255) && !CORE.layerCount(hv) && !CORE.shapeOfVal(hv);
        const layerMul = (CORE.layerCount(hv) || byLayer) ? (PROPS[hit.id].layerStack ? 0.25 : 0.5) : 1;
        mining.needed = PROPS[hit.id].hardness * layerMul * 0.9 * softBlockMineMul(hit.id)
                      / (hand ? handMineFactor(hit.id) : toolFactor(heldUseId(), hit.id))
                      / Math.max(0.01, typeof playerMiningSpeedMul === 'function' ? playerMiningSpeedMul() : 1);   // mining speed stat
        mining.stage = -1;
      }
      mining.elapsed += dt;
      const progress = Math.min(1, mining.elapsed / mining.needed);
      const stage = Math.min(9, Math.floor(progress * 10));
      if (stage !== mining.stage) {
        mining.stage = stage;
        drawCrack(progress);
        if (stage & 1) playBlockSound(hit.id, 'hit', hit.x, hit.y, hit.z);   // every other stage
        // chips off the face being hit, on every stage (0.8)
        if (stage > 0 && typeof fxHit === 'function') fxHit(hit.x, hit.y, hit.z, getBlock(hit.x, hit.y, hit.z), hit.nx, hit.ny, hit.nz);
      }
      let cboxes = rayBoxesAt(hit.x, hit.y, hit.z);
      if (cboxes && CORE.slabMixed(getBlock(hit.x, hit.y, hit.z))) cboxes = [cboxes[hit.bi || 0]];   // only the half being dug
      if (cboxes && cboxes.length) {
        let x0=1,y0=1,z0=1,x1=0,y1=0,z1=0;
        for (const b of cboxes) { x0=Math.min(x0,b[0]); y0=Math.min(y0,b[1]); z0=Math.min(z0,b[2]);
                                   x1=Math.max(x1,b[3]); y1=Math.max(y1,b[4]); z1=Math.max(z1,b[5]); }
        crackMesh.position.set(hit.x + (x0+x1)/2, hit.y + (y0+y1)/2, hit.z + (z0+z1)/2);
        crackMesh.scale.set((x1-x0) * 1.004, (y1-y0) * 1.004, (z1-z0) * 1.004);
      } else {
        crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        crackMesh.scale.set(1.004, 1.004, 1.004);
      }
      crackMesh.visible = true;
      if (mining.elapsed >= mining.needed) {
        const mval = getBlock(mining.x, mining.y, mining.z);
        const mx = mining.x, my = mining.y, mz = mining.z, mbi = mining.bi || 0;
        // a mixed slab: it is the half you were aiming at that breaks, and that block that counts
        const mix = slabMixIdsAt(mx, my, mz, mval), minedId = mix ? mix[mbi ? 1 : 0] : mval & 255;
        resetMining();
        // axe on a log: strip it, or fell the tree if it is already stripped. It performs its own
        // block edit and drops, so the ordinary break path is skipped when it claims the hit.
        // NOT an early return — the rest of frame() still has to stream chunks and render.
        const chopped = tryChopLog(mx, my, mz);
        if (!chopped) playBlockSound(minedId, 'break', mx, my, mz);
        // the block bursts into bits of itself; a log the axe only notched sheds a few chips (0.8)
        if (typeof fxBreak === 'function') { if (chopped) fxHit(mx, my, mz, mval, 0, 1, 0); else fxBreak(mx, my, mz, mval); }
        // the wrong tool for the job (a pickaxe on dirt): double wear below, and no experience
        const wrongTool = isWrongTool(heldUseId(), mix ? minedId : mval);
        // tier gate: wrong/too-weak tool still breaks the block but yields no drops
        const dropsOk = mineDropAllowed(heldUseId(), minedId);
        let inf = chopped ? null : layerBreakInfo(mx, my, mz, mval);     // a layer stack: only its top layer
        // a whole sand, gravel or snow block dug by hand loses one layer, and stands on as a drift
        if (!chopped && !inf && !isToolItem(heldUseId()) && DIG_BY_LAYER.has(minedId) && !CORE.shapeOfVal(mval))
          inf = { layerId: minedId, apply: () => setLayerStack(mx, my, mz, new Array(LAYER_MAX - 1).fill(minedId)) };
        // natural blocks only; your own placements pay 0 — and a single layer pays nothing
        // no drop, no experience: a flint pickaxe on ore gets nothing
        if (!wrongTool && dropsOk && !CORE.layerCount(mval) && !inf) awardBlockXP(mx, my, mz, minedId);
        // ...except salt crust, nearly always a single layer on the beach: each salt layer pays
        else if (!wrongTool && dropsOk && inf && inf.layerId === B.SALT_CRUST) awardBlockXP(mx, my, mz, B.SALT_CRUST);
        // ...and a shovel takes a whole stack at once, every layer with its own drop
        const stack = inf && !chopped && ITEM_PROPS[heldUseId()]?.tool === 'shovel' ? layerIdsAt(mx, my, mz, mval) : null;
        if (chopped) {
          /* felling already did everything */
        } else if (mix) {
          breakSlabMixHalf(mx, my, mz, mbi ? 1 : 0, mval);   // the other half stays as a slab of its own
          if (dropsOk) for (const drop of blockDrop(minedId, false)) for (let i = 0; i < drop.count; i++) spawnDrop(drop.id, mx, my, mz);
        } else if (stack) {
          setBlock(mx, my, mz, B.AIR);
          if (dropsOk) _dropStackLayers(stack, mx, my, mz);
        } else if (inf) {
          inf.apply();
          if (dropsOk) _dropLayer(inf.layerId, mx, my, mz);
        } else {
          const lockedChest = isChestId(minedId) && chestLocked(mx, my, mz, mval);
          // broken ice leaves its water behind — only ice that froze from water; creative just clears it
          setBlock(mx, my, mz, minedId === B.ICE && !player.canFly && ((mval >> 8) & 255) === ICE_FROM_WATER ? B.WATER : B.AIR);
          queueWaterAround(mx, my, mz);
          queueLavaAround(mx, my, mz);
          if (_isLog(minedId)) scheduleLeavesCheck(mx, my, mz);
          // a locked or sealed chest broken gives nothing back, itself included (asked before setBlock let go of its lock)
          if (dropsOk && !lockedChest) {
            // a door gives back the blocks it was made of (three, as the block a look belongs to)
            const drops = BLOCKS.isDoorVal(mval) ? doorDropOf(mval) : blockDrop(minedId, false);
            if (drops.length && !BLOCKS.isDoorVal(mval)) drops[0].count += skillOreBonus(minedId);   // Prospector
            // ...and a roll of its own for one more of the ore's stone pebbles (LOOT.orePebble)
            if (drops.length && typeof ORE_BLOCKS !== 'undefined' && ORE_BLOCKS.has(minedId)) {
              const more = skillOreBonus(minedId), peb = more ? drops.find(d => d.id === ITEM.STONE_PEBBLE) : null;
              if (peb) peb.count += more; else if (more) drops.push({ id: ITEM.STONE_PEBBLE, count: more });
            }
            for (const drop of drops)
              for (let i = 0; i < drop.count; i++) spawnDrop(drop.id, mx, my, mz);
          }
          // a hollow log also gives back what was packed into it
          if (dropsOk && hollowFillOf(mval)) spawnDrop(hollowFillOf(mval), mx, my, mz);
        }
        // stone a flint pickaxe cannot keep still gives a pebble or two (flintPebbles in blocks/mining-rules.js)
        if (!dropsOk && !chopped) for (let i = flintPebbles(heldUseId(), minedId); i > 0; i--) spawnDrop(ITEM.STONE_PEBBLE, mx, my, mz);
        /* Tool wear: an ordinary survival break costs 1 durability, 2 when the tool had no
           business on that block (isWrongTool), and NOTHING at all for a billboard — a torch or
           a flower is brushed aside rather than dug, so no edge dulls on it. */
        const tslot = HOTBAR[hotbarSel];
        if (tslot && tslot.dur != null && !isFreeBreak(minedId)) {
          if (wearSlot(tslot, wrongTool ? 2 : 1) === 'gone') HOTBAR[hotbarSel] = null;
          saveHotbar(); buildHotbar(); updateHotbar();
        }
      }
    } else {
      resetMining();
    }
    // Place uses the same repeat-tap timing as creative.
    if (wantPlace && !_didThrow) { if (!act.place || now - act.lastPlace > 240) { doPlace(); act.lastPlace = now; } }
  } else {
    resetMining();
    if (wantMine) { if (!act.break || now - act.lastBreak > 240) { doBreak(); act.lastBreak = now; } }
    // a wand acts once a press: held, it would lay a second layer a moment later
    if (wantPlace && !_didThrow) { if (!act.place || (now - act.lastPlace > 240 && !holdingWand())) { doPlace(); act.lastPlace = now; } }
  }
  act.break = wantBreak; act.place = wantPlace;

  /* ---- held-block light: a virtual glow source that follows this player ---- */
  {
    // the brighter of your two hands lights you — a torch in the OFFHAND glows too; not one under water
    const doused = torchDoused(player);
    const lightOf = (i) => i === null || (doused && i === B.TORCH) ? 0 : i < 256 ? (PROPS[i]?.light ?? 0) : (ITEM_PROPS[i]?.light ?? 0);
    const mainId = HOTBAR[hotbarSel] ? HOTBAR[hotbarSel].id : null;
    const offId  = typeof offhandItemId === 'function' ? offhandItemId() : null;
    const id   = lightOf(offId) > lightOf(mainId) ? offId : mainId;
    const raw  = lightOf(id);
    const hand = id === null ? null : id < 256 ? PROPS[id]?.handLight : ITEM_PROPS[id]?.handLight;
    const lvl  = (playing && player.spawned && raw > 0) ? (hand ?? Math.max(1, Math.round(raw * 0.65))) : 0;
    _hlRaw = raw;
    /* Math.round for XZ: triggers 0.5 blocks early so mesh is ready when player arrives. But hard against
       a wall that half-block lead rounds INTO the wall, and a light source inside an opaque block emits
       nothing: walking up to a wall with a torch put the light out. So the first OPEN cell wins,
       working back from the rounded one to the cell the eye is really in, then the body's. */
    const rx = Math.round(player.pos.x), rz = Math.round(player.pos.z);
    const fx = Math.floor(player.pos.x), fz = Math.floor(player.pos.z);
    const ey = Math.floor(player.pos.y + player.EYE), by = Math.floor(player.pos.y + 0.5);
    const _open = (x, y, z) => !CORE.opaqueVal(getBlock(x, y, z));
    let px = fx, py = ey, pz = fz;
    if (_open(rx, ey, rz)) { px = rx; pz = rz; }
    else if (_open(rx, ey, fz)) { px = rx; }
    else if (_open(fx, ey, rz)) { pz = rz; }
    else if (!_open(fx, ey, fz) && _open(fx, by, fz)) { py = by; }
    if (lvl !== _hlLevel || id !== _hlId || px !== _hlX || py !== _hlY || pz !== _hlZ) {
      _hlId = id; _hlLevel = lvl; _hlX = px; _hlY = py; _hlZ = pz;
      updatePlayerLight(slot, px, py, pz, lvl, id != null && id < 256 && !!PROPS[id]?.coldLight);   // each player owns one glow slot; a crystal torch's is blue
    }
  }

  /* ---- eating ---- */
  // a drink lifts the arm the same way: walking pace, no sprint, and the body shows it
  const eatProg = Math.max(updateEating(dt, wantPlace), player._drinkProg || 0);
  // the third-person body mirrors it next frame, so everyone else sees this player eating
  player._eatProg = eatProg;

  /* ---- ranged: the same right button draws a bow (38-ranged.js) ---- */
  const drawProg = updateRanged(dt, wantPlace);
  player._drawProg = drawProg;              // read by the third-person body, same as _eatProg

  /* ---- taming: the ride fills the bar, and finishing it opens the naming panel ---- */
  updateTaming(dt);

  /* ---- this player's own upkeep: swing pacing, vitals, XP bar, first-person arm ---- */
  updateAttackCooldown(dt);
  /* Vitals stand still while the world is joining, and whenever the ground under this player has not
     loaded: hunger, air and damage wait for a world you can actually see and move in. */
  const _hereC = getChunk(Math.floor(player.pos.x / 16), Math.floor(player.pos.z / 16));
  /* The chisel's shape slot and radial, in both modes. Moved out of updateVitals in 0.7844: that one waits
     for the chunk you stand in to be loaded, and until then a radial opened by Q was never drawn. */
  if (!menuScene && typeof syncChiselHud === 'function') syncChiselHud();
  if (!menuScene && typeof syncVariantHud === 'function') syncVariantHud();   // 0.794
  if (!menuScene && typeof syncEffectBar === 'function') syncEffectBar();     // running effects beside the hotbar
  if (typeof updateQuests === 'function') updateQuests(dt);                   // the starter quest, top right
  if (typeof syncBossHud === 'function') syncBossHud();                       // a boss's bar, the last quest's marker
  /* stacks made to fit, once as this seat's world is joined (15-drops.js): on loaded ground, alive and in
     survival, so what does not fit can fall at their feet; `_restacked` is cleared when a world or a record loads */
  if (!player._restacked && !menuScene && !joining && player.spawned && !player.dead && !player.canFly && _hereC && _hereC.data) {
    player._restacked = true;
    restackInventory();
  }
  // food rots in your hands, a second at a time (44-spoil.js); with the fixed tick in simTick
  if (!SIM_FIXED && !menuScene && typeof tickSpoilage === 'function') tickSpoilage(dt);
  if (!menuScene && !joining && _hereC && _hereC.data) updateVitals(dt);
  else player._statsLive = false;           // the bars wait with the vitals (simTick)
  updateXPBar(dt);
  if (typeof updateProgressRing === 'function') updateProgressRing();   // the ring round the crosshair (ui/hud.js)
  updateCraftQueue(dt);                     // this player's crafting queue, and its HUD strip
  updateHands(dt, wantBreak, wantPlace, eatProg, drawProg);
  updateShield(dt, wantPlace);              // offhand arm + blocking state (40-shield.js)

  /* Selection outline and crack overlay are single scene MESHES shared by every viewport, so each
     player records the transform it wants and the render pass re-applies it per view. The crack
     MATERIAL is per seat since 0.734 — sharing it was not the harmless overlap the old note here
     claimed: both players wrote their own stage into it as their progress crossed each 10%, so
     both viewports flickered between the two stages several times a second. */
  const st = PSTATE[slot];
  st.handVisible = handRoot.visible;
  st.offVisible = !!(handRoot.userData.off && handRoot.userData.off.root.visible);
  st.sel = selBox.visible
    ? { px: selBox.position.x, py: selBox.position.y, pz: selBox.position.z,
        sx: selBox.scale.x,    sy: selBox.scale.y,    sz: selBox.scale.z } : null;
  st.crack = crackMesh.visible
    ? { px: crackMesh.position.x, py: crackMesh.position.y, pz: crackMesh.position.z,
        sx: crackMesh.scale.x,    sy: crackMesh.scale.y,    sz: crackMesh.scale.z } : null;
}
