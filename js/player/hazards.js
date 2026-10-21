'use strict';
/* player/hazards.js: updateVitals, each frame for a player in survival. Falls, cactus, lava and fire, the armor's
   soak, and the moment of death. */

/* Per frame, survival only. The bars themselves move in tickStats (player/stats.js); this runs the
   outside hazards, soaks the frame's damage with armor, and handles dying. Every hit is out of 100 health
   since 0.82 (VITAL_K times what it was). */
function updateVitals(dt) {
  _vitalsWaitT += dt;
  const artReady = vitalsSpritesReady || _vitalsWaitT > 1.0;
  const survival = !player.canFly && player.spawned && artReady;
  if (survival !== vitalsShown) {
    vitalsShown = survival;
    vitalsEl.style.display = survival ? 'block' : 'none';
    // ...and the stamina and oxygen under the crosshair at once: the repaint that hides them comes after the creative return below
    if (!survival && typeof vitalsNearEl !== 'undefined' && vitalsNearEl) vitalsNearEl.style.display = 'none';
    vitalsDirty = true;
  }
  // hurt vignette fade-out (runs in any mode so it never sticks)
  if (_hurtA > 0) {
    _hurtA = Math.max(0, _hurtA - dt * 1.6);
    hurtEl.style.opacity = _hurtA.toFixed(3);
  }
  // heatstroke's blur and mirages: before the survival test, so creative clears them
  _syncHeatBlur();
  _updateMirages(dt);
  _syncDeathMark(dt);                            // where you last died
  player._statsLive = survival;                  // the fixed tick runs this player's bars only while this holds
  if (!survival) return;
  if (typeof flushOwedXP === 'function') flushOwedXP();   // XP earned while another seat ran (a sapling grew)
  if (!player.dead) player.aliveT = (player.aliveT || 0) + dt;   // survival stopwatch for the death screen
  /* The damage baseline is the HP this player had when updateVitals LAST FINISHED, not the HP it
     has on entry.

     Mobs hit in updateEntities, which is part of the world tick and therefore runs AFTER every
     player's updateVitals. Diffing within the call could only ever see damage the call inflicted
     itself — fall, cactus, drowning, starvation — so a mob landing a blow produced no red flash,
     no camera kick, no hit sound, and (worse) skipped the armour soak entirely, since that used
     the same in-call baseline. Carrying the value across the frame boundary catches both. */
  const dmgBase = (typeof player._hpLast === 'number') ? player._hpLast : player.hp;

  /* every bar: effects, stamina, healing, hunger and thirst, oxygen and drowning, temperature. With the fixed
     tick (SIM_FIXED) they step in simTick instead, SIM_DT at a time; what they cost in health since the last
     frame still shows here, as the baseline above is last frame's. */
  if (!SIM_FIXED) tickStats(dt);

  /* Fall damage: track apex → landing (walking mode only); water cancels any fall.
     The landing test is `onGround()` since 0.7341, not `vy >= 0`. Velocity is a poor proxy for
     having landed: a fall that ends on a slab, a stair or any partial box can leave vy negative
     for several frames while the body settles, and the hit only registered once something else
     happened to push it back up — which is the damage that "arrived late". Standing on ground is
     unambiguous and true on the very frame you touch down. `vy > 0` still clears the fall too, so
     jumping out of a descent is not banked and charged to you on the next landing. */
  if (!player.flying) {
    if (player._inWater) player.fallStart = null;
    if (player.vy < -0.1 && player.fallStart == null) player.fallStart = player.pos.y;
    else if ((onGround() || player.vy > 0) && player.fallStart != null) {
      const fell = player.fallStart - player.pos.y;
      // hay bale fully absorbs fall damage when you land on it
      const landOn = getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.1), Math.floor(player.pos.z)) & 255;
      // half a block more slack before it counts: the free-fall allowance is 3.5 blocks
      // and damage is measured past that, so a drop that only just exceeds it costs nothing
      if (fell > 4.0 && landOn !== B.HAY) { player.hp = Math.max(0, player.hp - (fell - 3.5) * VITAL_K * skillHazardMul()); player._dmgCause = 'fell from a high place'; }   // 5 health per block past 3.5
      player.fallStart = null;
    }
  } else player.fallStart = null;

  // cactus: any contact hurts (5 health / 0.8s) and knocks you away — small hop plus a horizontal
  // shove away from the cactus centre, applied through collision over a short burst
  if (!player.flying) {
    const p = player.pos, CR = player.R + 0.08;                // slightly expanded AABB = touch range
    let cactX = null, cactZ = null;
    const yLo = Math.floor(p.y - 0.1), yHi = Math.floor(p.y + player.H);
    outer:
    for (let yy = yLo; yy <= yHi; yy++)
      for (let xx = Math.floor(p.x - CR); xx <= Math.floor(p.x + CR); xx++)
        for (let zz = Math.floor(p.z - CR); zz <= Math.floor(p.z + CR); zz++)
          if ((getBlock(xx, yy, zz) & 255) === B.CACTUS) { cactX = xx; cactZ = zz; break outer; }
    if (cactX !== null) {
      updateVitals._cactusT = (updateVitals._cactusT || 0) - dt;
      if (updateVitals._cactusT <= 0) {
        updateVitals._cactusT = 0.8;
        player.hp = Math.max(0, player.hp - VITAL_K * skillHazardMul());   // Hazard Hide
        player._dmgCause = 'was pricked by a cactus';
        player.vy = Math.max(player.vy, 5.5);
        let kx = p.x - (cactX + 0.5), kz = p.z - (cactZ + 0.5);
        const len = Math.hypot(kx, kz);
        if (len < 0.05) { const a = Math.random() * Math.PI * 2; kx = Math.cos(a); kz = Math.sin(a); }
        else { kx /= len; kz /= len; }
        player._kbx = kx * 10; player._kbz = kz * 10; player._kbT = 0.35;   // strong enough to beat walk speed
      }
    } else updateVitals._cactusT = 0;
  }
  // lava: 10 health per 0.5s while feet or body are inside lava
  if (!player.flying) {
    const p = player.pos;
    const feetId  = getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z)) & 255;
    const bodyId  = getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)) & 255;
    if (feetId === B.LAVA || bodyId === B.LAVA) {
      // ...and it sets you alight: you keep burning for LAVA_FIRE_S after you get out
      if (!player.canFly) {
        if (!(player.fireT > 0) && typeof playSound === 'function') playSound('fireIgnite', { gain: 0.8, pos: { x: p.x, y: p.y, z: p.z } });
        player.fireT = Math.max(player.fireT || 0, LAVA_FIRE_S);
      }
      updateVitals._lavaT = (updateVitals._lavaT || 0) - dt;
      if (updateVitals._lavaT <= 0) {
        updateVitals._lavaT = 0.5;
        player.hp = Math.max(0, player.hp - 2 * VITAL_K * skillHazardMul());   // Hazard Hide
        player._dmgCause = 'burned to death';
      }
    } else updateVitals._lavaT = 0;
  }
  /* On fire (a lightning strike, 53-storms.js): 5 health a second until it burns out, or at once in water.
     The clock is on the player, since this runs once per seat. */
  if (player.fireT > 0) {
    const p = player.pos;
    const wet = isWaterVal(getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)));
    if (wet || player.canFly || player.dead) {
      if (wet && typeof playSound === 'function') playSound('fireOff', { gain: 0.8, pos: { x: p.x, y: p.y, z: p.z } });   // 0.8191
      player.fireT = 0;
    }
    else {
      player.fireT -= dt;
      player._fireHurtT = (player._fireHurtT || 0) - dt;
      if (player._fireHurtT <= 0) {
        player._fireHurtT = 1;
        player.hp = Math.max(0, player.hp - VITAL_K * skillHazardMul());
        player._dmgCause = 'burned to death';
      }
      if (typeof fxOnFire === 'function') fxOnFire(p.x, p.y, p.z, player.H || 1.8, dt, !!player._fireCold);   // cold fire blue
    }
  }
  if (player._kbT > 0) {
    player._kbT -= dt;
    collideAxis(0, player._kbx * dt);
    collideAxis(2, player._kbz * dt);
  }
  // the offhand beside the hotbar follows whatever the offhand holds, however it changed
  if (typeof syncOffhandSlot === 'function') syncOffhandSlot();

  /* Armor soak. Damage arrives from many places (fall, cactus, lava, drowning, mobs) as direct
     `player.hp -= n` writes, so rather than threading a helper through all of them the whole
     frame's loss is reduced here — before the death check, so armor can actually save you.
     The 2.5 floor (half an old point) keeps the slow poison drip from counting as a hit. */
  {
    const lost = dmgBase - player.hp;      // cross-frame, so a mob's blow is soaked too
    if (lost >= 0.5 * VITAL_K && !player.dead) {
      const mult = armorDamageMultiplier();
      if (mult < 1) player.hp = Math.min(playerMaxHP(), dmgBase - lost * mult);
      damageArmorDurability(lost / VITAL_K);   // wear follows how hard the hit was, in the old points
      statsOnHit(player, dmgBase - player.hp);  // a hit costs energy too
      // ...and healing waits: Rapid regen shortens the wait rather than ignoring it
      const wait = playerHasEffect('regen') ? REGEN_HIT_WAIT_FAST : REGEN_HIT_WAIT;   // `regen` since 0.832 (regenMul)
      player._regenWaitT = Math.max(player._regenWaitT || 0, wait);
      // red hearts for the hit — one per 5 health lost, hidden in your own first-person view (0.8)
      if (typeof fxHearts === 'function')
        fxHearts(player.pos.x, player.pos.y + 1.3, player.pos.z, false, (dmgBase - player.hp) / VITAL_K, fxOwner(player));
    }
  }
  // void death
  if (player.pos.y < -30) { player.hp = 0; player._dmgCause = 'fell into the void'; }
  // heatstroke at 100% (player/stats.js): no armor softens it
  if (player.heatstroke >= 100) { player.hp = 0; player._dmgCause = 'died of heatstroke'; }
  // the pause menu's Respawn: after the soak too, so armor never saves you from your own choice
  if (player._giveUp) { player._giveUp = false; player.hp = 0; player._dmgCause = 'gave up'; }
  // death: drop everything around the body, freeze input, show the death screen —
  // respawn happens when the player clicks Respawn (respawnPlayer below)
  if (player.hp <= 0 && !player.dead) {
    player.dead = true;
    player.effects = [];                         // death ends every timed effect
    player._saltT = 0;                           // ...and the salt in use, so Salted goes with them
    // the feed is one strip for the whole screen: it clears once nobody is left alive to read it
    if (typeof clearFeed === 'function' && PLAYERS.every(p => !p.spawned || p.dead)) clearFeed();
    player._deathDay = worldDay;                 // the day on the death screen, kept through a save
    if (player.sleepingAt) leaveBed(player);     // dying in your sleep still gets you out of it
    playSound('death', { gain: 1 });
    const dx0 = Math.floor(player.pos.x), dy0 = Math.floor(player.pos.y + 0.5), dz0 = Math.floor(player.pos.z);
    /* Everything carried — worn gear included, and everything the belt and the backpack hold: a
       bag on your back is not a safe. The backpack is bounded by what the worn pack
       actually opened, so creative's block palette, which lives in that same array, is never
       touched. Read before equipSlots is emptied, since that is where the pack itself sits. */
    const packN = typeof backpackCapacity === 'function' ? backpackCapacity() : 0;
    _dropLifeOverride = DROP_LIFE_DEATH;         // everything a death spills lies 20 minutes
    // ...and the spot is marked on this player's screen until they get back to it or it all runs out
    // the last DEATH_MARKS_MAX deaths each keep theirs: a new one starts its own clock and leaves the others' running
    (player._deathMarks || (player._deathMarks = [])).push({ x: dx0, y: dy0, z: dz0, left: DROP_LIFE_DEATH });
    while (player._deathMarks.length > DEATH_MARKS_MAX) player._deathMarks.shift();
    for (const [arr, len] of [[HOTBAR, HOTBAR.length], [invSlots, invSlots.length],
                              [equipSlots, equipSlots.length], [beltSlots, beltSlots.length],
                              [invSlots2, packN]])
      for (let i = 0; i < len; i++) {
        const s = arr[i];
        if (!s) continue;
        spawnDrop(s.id, dx0, dy0, dz0,
          { x: (Math.random() - 0.5) * 5, y: 2 + Math.random() * 3, z: (Math.random() - 0.5) * 5 }, 2,
          s.dur ?? null, slotMeta(s), 0, s.count);   // falls as it was: wear and extras kept, no free repair by dying; one stack a slot
        arr[i] = null;
      }
    // the crafting queue's ingredients were already taken from you, so they fall with the rest
    if (typeof dropCraftQueueAt === 'function') dropCraftQueueAt(dx0, dy0, dz0);
    _dropLifeOverride = 0;
    saveAll(); buildHotbar();
    if (invOpen) toggleInventory(false);
    showDeathScreen(player._dmgCause || 'died');
  }
  if (player.dead) for (const k in keys) keys[k] = false;   // no wandering while dead
  // a death loaded from a save reopens its own screen, with the saved time, day and cause
  if (player.dead && deathEl && deathEl.style.display !== 'flex') showDeathScreen(player._dmgCause || 'died');
  // ...and a living player never keeps one left over from another world
  else if (!player.dead && deathEl && deathEl.style.display === 'flex') deathEl.style.display = 'none';
  // dead: this pane shows the death screen and nothing else (the .dying rules in style.css)
  if (deathEl && deathEl.parentElement) deathEl.parentElement.classList.toggle('dying', !!player.dead);
  // discrete hit this frame (fall / cactus / drown / starving — the slow poison drip stays below threshold):
  // red flash + camera kick, both scaled by how hard the hit was (in the old 20-point health, 0.82)
  const lostHp = dmgBase - player.hp;
  if (lostHp >= 0.5 * VITAL_K && !player.dead) {
    hurtFlash(lostHp / VITAL_K);
    if (typeof interruptBenchWork === 'function') interruptBenchWork();   // a hit knocks you off the bench
    // central hook: every damage source (fall, cactus, lava, drowning, mobs) lands here
    playSound('hit', { gain: 0.9, rate: 0.95 + Math.random() * 0.1,
                       pos: { x: player.pos.x, y: player.pos.y + 1, z: player.pos.z } });
  }
  player._hpLast = player.hp;                 // baseline for whatever hurts them before next tick
  // repaint when anything the strip shows has visibly moved, the inventory opened or shut, or someone asked
  const vk = _vitalsKey();
  if (vitalsDirty || vk !== vitalsEl._key) { vitalsEl._key = vk; paintVitals(); vitalsDirty = false; }
}
