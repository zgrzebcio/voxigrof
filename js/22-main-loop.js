'use strict';
/* 22-main-loop.js: the loop. frame() (once a screen refresh), simTick() (the world's clockwork, 20 times a second),
   runWorldTick (the chunk stream and the world's slow passes), the F3 timings and read-out, and the hand's own
   render pass. A player's own frame is player/tick.js. */

function perfLap(name, t0) {
  if (!_perfOn) return 0;
  const now = performance.now();
  _perfAcc.set(name, (_perfAcc.get(name) || 0) + now - t0);
  return now;
}
function _perfFrameStart(now) {
  let on = false;
  for (let i = 0; i < PSTATE.length && !on; i++) on = !debugHudHidden(i);
  if (on !== _perfOn) { _perfOn = on; _perfAcc.clear(); _perfFrames = 0; _perfMax = 0; _perfWinT = now; _perfLine = ''; }
  if (!on || now - _perfWinT < 1000 || !_perfFrames) return;
  const f = _perfFrames, total = (_perfAcc.get('frame') || 0) / f;
  const parts = [..._perfAcc].filter(([k]) => k !== 'frame').sort((a, b) => b[1] - a[1]).slice(0, 8);
  _perfLine = `cpu ${total.toFixed(1)} ms/frame &middot; worst ${_perfMax.toFixed(0)} ms<br>` +
    parts.map(([k, v]) => `${k} ${(v / f).toFixed(2)}`).join(' &middot; ');
  _perfAcc.clear(); _perfFrames = 0; _perfMax = 0; _perfWinT = now;
}
function _perfFrameEnd(t0) {
  if (!_perfOn) return;
  const ms = performance.now() - t0;
  _perfAcc.set('frame', (_perfAcc.get('frame') || 0) + ms);
  if (ms > _perfMax) _perfMax = ms;
  _perfFrames++;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (fpsLimit > 0 && now - lastT < 1000 / fpsLimit - 2) return;   // fps cap: skip whole tick
  _perfFrameStart(now);                     // F3 timings
  const tFrame = perfNow();
  const realDt = Math.max(0, (now - lastT) / 1000);
  frameMsAvg += (Math.min(250, realDt * 1000) - frameMsAvg) * 0.1;   // a frame's real length, eased: the chunk stream paces by it (chunks/chunks.js)
  // a frame's own time: capped at FRAME_DT_MAX with the fixed tick (0.05 before, slow motion under 20 fps)
  const dt = Math.min(SIM_FIXED ? FRAME_DT_MAX : 0.05, realDt);
  lastT = now;
  sharedUniforms.uTime.value += dt;
  updateTileAnimation(now);                 // water and lava step through their frames
  updateWindUniforms();                     // grass and leaves bend with the wind
  updateMusic();                            // menu track on/off follows menuScene
  updateWeatherSound(dt);                   // rain and snow loops (32-sound.js)
  /* Input routing, before anybody is ticked: which pad drives which seat, and — while the player
     is rebinding from the pause menu — whether a device has just spoken up. Both run whether or
     not the game is unpaused, because binding is done with the menu open. */
  pollInputCapture();
  updatePauseRespawn(dt);                   // the pause menu's hold-to-arm Respawn (player/hazards.js)
  let tp = perfLap('input+sound', tFrame);
  /* LAND FIRST: the chunk stream takes its turn before anything else of the world does, so the workers get their
     next jobs and finished chunks are lit and shown ahead of the frame's simulation, however long that runs. It
     also says whether land is waiting (`streamBehind`), which the rest of this frame reads to give way. */
  useSlot(0);
  runChunkStream(dt);
  tp = perfNow();                           // the stream timed its own parts
  /* The title panorama is scenery, not a world. Nothing in it is meant to change: no
     rot, no melt, no regrowth, no felling, no structures assembling, no leaves coming down. Each
     of these was individually harmless there — their queues are empty on a backdrop — but they
     were still called every frame, and gating them in one place makes the rule explicit rather
     than relying on each system to notice where it is. Boot spends its frames on the panorama. */
  // a world still joining is held the same way until its chunks are in, and so is one under the pause menu (worldHeld)
  if (!menuScene && !worldHeld()) {
    /* the fixed tick (SIM_FIXED in 00-config): the world's clockwork steps SIM_DT at a time, as many times as
       the real time since the last frame holds; a gap over SIM_MAX_FRAME is dropped (a hidden tab: the world waits) */
    if (SIM_FIXED) {
      _simAcc += Math.min(realDt, SIM_MAX_FRAME);
      let n = 0;
      useSlot(0);
      while (_simAcc >= SIM_DT && n < SIM_MAX_STEPS) { simTick(SIM_DT); _simAcc -= SIM_DT; n++; }
      if (n >= SIM_MAX_STEPS) _simAcc = Math.min(_simAcc, SIM_DT);
      _simTicksLast = n;
      tp = perfNow();                       // simTick timed its own parts
    }
    updateFelling(dt);                      // felled trunks come apart a few cells per tick
    tp = perfLap('felling', tp);
    if (!SIM_FIXED) {
      updateLitterRot(dt);                  // fallen leaves rot off the forest floor
      updateSnowMelt(dt);                   // snow outside a cold biome thins away a layer at a time
      updateBerryGrow(dt);                  // picked berry bushes ripen again, one stage at a time
      updateSeasons(dt);                    // leaves fall and come back, plants wither and return, wheat grows
      updateGrassGrow(dt);                  // bare grass slowly sprouts short grass, short grass grows tall
    } else updateSeasonScan(dt);            // the seasons' chunk scans stay a frame's background work
    tp = perfLap('season scan', tp);
    updateStructOutline();                  // drop the capture box if its block was broken
    processPlacementQueue();                // villages/dungeons assemble a few cells per frame
    if (typeof updateBossLairs === 'function') updateBossLairs();   // the snow castles: found, placed, their kings
    tp = perfLap('structures', tp);
    updateFallingLeaves(dt);                // canopy coming down after a tree was felled
    updateStorms(dt);                       // lightning, fire, hail, the aurora
    tp = perfLap('storms+leaves', tp);
  }

  // fps
  fpsFrames++;
  if (now - fpsT >= 500) { fps = Math.round(fpsFrames * 1000 / (now - fpsT)); fpsFrames = 0; fpsT = now; }

  /* ---- each player, in their own context ----
     `useSlot` repoints `player`, `camera`, the hotbar, the arm rig and the HUD at one player, so
     everything inside tickPlayer is the same single-player code it always was. The WORLD is then
     stepped exactly once afterwards, never once per player. */
  tp = perfNow();
  for (let i = 0; i < PSTATE.length; i++) { useSlot(i); tickPlayer(dt, now, i); }
  useSlot(0);
  perfLap('players', tp);
  runWorldTick(dt, now);
  _perfFrameEnd(tFrame);
}

/* THE FIXED TICK (SIM_FIXED / SIM_HZ in 00-config): the world's clockwork, SIM_DT of
   real time a step, the same at any frame rate. Called from frame() with player one's slot installed. What moves on
   screen (creatures, drops, arrows, falling blocks, particles, doors), the players and the chunk streaming stay once a
   frame; so do the budgeted background jobs (the seasons' chunk scans, felling, villages assembling). */
let _simAcc = 0, _simTime = 0, _simTicksLast = 0, _simTickN = 0;
function simTick(dt) {
  _simTime += dt;
  let tp = perfNow();                       // F3 timings, summed over the frame's ticks
  /* While land is waiting near a player the world's slow background gives way to it (LAND FIRST, chunks/stream.js):
     it steps one tick in STREAM_BG_EVERY, so it never stops but takes a fifth of the time, and of the chunks it would
     send to be meshed again. `bg` is false on the ticks it sits out. What has a clock a player watches (growth,
     furnaces, burning lights, the day) is not part of it and keeps every tick. */
  const bg = !streamBehind || (++_simTickN % STREAM_BG_EVERY) === 0;
  /* each player's bars and what they carry (part A2), in their own slot as tickPlayer does: hunger, thirst,
     stamina, energy, nutrients, effects, oxygen, temperature, heatstroke, a held torch burning down (tickStats), and
     food spoiling. `_statsLive` is set each frame by updateVitals: survival, spawned, the ground under them loaded.
     What stays per frame: movement, eating and drinking (they follow the held button), hazards (fall, cactus, lava,
     fire), the armor soak, dying, and the HUD. */
  for (let i = 0; i < PSTATE.length; i++) {
    useSlot(i);
    if (player._statsLive) tickStats(dt);
    if (typeof tickSpoilage === 'function') tickSpoilage(dt);
  }
  useSlot(0);
  tp = perfLap('t:stats', tp);
  if (bg) {
    updateLitterRot(dt);                    // fallen leaves rot off the forest floor
    updateSnowMelt(dt);                     // snow outside a cold biome thins away a layer at a time
  }
  updateBerryGrow(dt);                      // picked berry bushes ripen again
  tp = perfLap('t:rot+melt', tp);
  updateSeasonGrowth(dt, bg);               // wheat, mushrooms, cane, ice, lights burning out; the weather on the ground when `bg`
  tp = perfLap('t:seasons', tp);
  if (bg) {
    updateGrassGrow(dt);                    // bare grass sprouts short grass, short grass grows tall
    if (!player.canFly) processLeavesDecay(dt);
  }
  tp = perfLap('t:grass+leaves', tp);
  updateEntitiesTick(dt);                   // creatures' AI and bodies (part A3, 0.838; drawn between ticks per frame)
  tp = perfLap('t:creatures', tp);
  // dropped items, thrown things and arrows, kept as poses and drawn between ticks (_tickPosesDraw)
  if (!player.canFly) {
    _tickPoses(DROPS, true); _tickPoses(PROJECTILES, true);
    updateDrops(dt); updateProjectiles(dt);
    _tickPoses(DROPS, false); _tickPoses(PROJECTILES, false);
  }
  _tickPoses(ARROWS, true); updateArrows(dt); _tickPoses(ARROWS, false);
  // a boss's fireballs, ice spikes, burning snow and beams (entities/frozen-king.js), drawn between ticks too
  _tickPoses(BOSS_FX, true); updateBossFx(dt); _tickPoses(BOSS_FX, false);
  tp = perfLap('t:drops+arrows', tp);
  updateFluids(dt);
  tp = perfLap('t:fluids', tp);
  updateTNTs(dt);
  updateSaplings();
  if (bg) {
    processGrassSpread(dt);
    processHollowMushrooms(dt);             // lying hollow logs full of dirt grow mushrooms
  }
  updateFurnaces(dt);
  advanceWorldClock(dt);                    // the day moves on; the sky only draws from it (updateDayNight)
  perfLap('t:blocks+clock', tp);
}

/* Things whose state IS their model's place and turn (dropped items, thrown things, arrows; `o.group`). Around
   each tick: before it the pose the last tick left is put back (the tick reads and moves it), after it that pose is
   kept. Each frame they are drawn between their last two poses by how far the next tick is, a tick behind, so they
   move smoothly at any frame rate. One just made (no pose yet) stays where it was put until its first tick. */
function _tickPoses(list, before) {
  for (const o of list) {
    const g = o.group;
    if (!g) continue;
    if (before) {
      const c = o._poseC;
      if (c) { g.position.set(c[0], c[1], c[2]); g.rotation.set(c[3], c[4], c[5]); g.scale.set(c[6], c[7], c[8]); o._poseP = c; }
    } else {
      const c = [g.position.x, g.position.y, g.position.z, g.rotation.x, g.rotation.y, g.rotation.z, g.scale.x, g.scale.y, g.scale.z];
      if (!o._poseP) o._poseP = c;
      o._poseC = c;
    }
  }
}
function _tickPosesDraw(list, t) {
  for (const o of list) {
    const g = o.group, a = o._poseP, b = o._poseC;
    if (!g || !a || !b || !g.visible) continue;
    const L = (n) => a[n] + (b[n] - a[n]) * t;
    const R = (n) => { let d = b[n] - a[n]; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2; return a[n] + d * t; };
    g.position.set(L(0), L(1), L(2)); g.rotation.set(R(3), R(4), R(5)); g.scale.set(L(6), L(7), L(8));
  }
}

/* A held torch goes out with your head under water: no light, no warmth, and the hand that holds it
   (player/hands.js, 40-shield.js) is put away until you surface. */
function torchDoused(p = player) {
  return !!p && !!p.pos && (getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + p.EYE), Math.floor(p.pos.z)) & 255) === B.WATER;
}

/* THE CHUNK STREAM'S TURN, first in every frame (frame() calls it before the simulation): which chunks are wanted,
   the arrived ones lit and finished, finished meshes put on screen, and the workers handed their next jobs. It runs
   on the title screen and while a world is joining too. It sets `streamBehind` for the rest of the frame. */
function runChunkStream(dt) {
  let tp = perfNow();                       // F3 timings
  /* ---- chunk streaming, centred on the union of every player's position ---- */
  syncPlayerChunks();
  _rqWalkSome(RQ_WALK_PER_FRAME);           // a chunk border's walk over the chunks, a share a frame (rebuildQueues)
  /* Finish arrived chunks before uploading meshes — a chunk must be lit before it is meshed.
     Generous while the loading screen is up (nothing is on screen to stutter), tight in play.

     Both drains also carry a DEADLINE. The counts alone were a poor budget: a chunk
     finish pass costs anything from a fraction of a millisecond to several depending on how much
     decoration landed in it, so a fixed count is either wasteful or a stutter depending on where
     you happen to be standing. The deadline is a hard wall in real time — whatever is left over
     simply waits for the next frame, and nothing is ever dropped. */
  /* CATCH-UP. The in-play budgets are sized for the steady state — a chunk or two arriving as you
     walk — and they are far too tight for the moments when a whole neighbourhood lands at once:
     entering a world, joining one, respawning. Those all dump hundreds of chunks into the
     pipeline with the loading screen already gone, and two finishes plus twelve uploads a frame
     took about five seconds to work through, which is exactly how long the world stayed invisible
     around you.

     Rather than special-casing each of those events, the condition is simply "is a lot of work
     already sitting in the queues" — which is true for all three and false during ordinary play.
     While it holds, spend a bigger slice of the frame: an empty world is a far worse thing to
     look at than a frame that ran a few milliseconds long. */
  const _rush = _loadingWorld || menuScene;   // nothing to stutter; the player is waiting on this
  const _catchUp = genFinishQueue.length > 6 || meshResults.length > 12;
  /* UNDER STRESS. These budgets were per frame, so a low frame rate starved the stream: at 10 fps a second of
     play got a sixth of the finishing and uploading 60 fps gets, and the world stayed full of holes and half-built
     chunks just when it was hardest to keep up. Now the slice is also never less than a SHARE of the frame's real
     length — STREAM_SHARE of it, STREAM_SHARE_BEHIND while land is waiting, up to STREAM_MS_MAX — and the counts grow
     with the frame the same way, so a second finishes and shows about as much land at 10 fps as at 60. At 60 fps the
     numbers are what they were. The frame rate pays for it while the land catches up: a hole in the world is the worse
     thing to look at. `streamBehind` (chunks/stream.js) tells the work that can wait to wait. */
  /* land waiting = finished chunks piling up, or a chunk near a player still to be made, or made and never drawn
     (streamLandWaiting; a re-mesh after an edit is not it). While it holds the stream takes more: at least
     STREAM_MS_BEHIND ms and STREAM_SHARE_BEHIND of the frame, twice the chunks finished and shown a frame. What it
     takes, the background gives up (LAND FIRST, chunks/stream.js), so the frame is not much longer for it. */
  streamBehind = !_rush && (_catchUp || streamLandWaiting());
  /* ...and above 60 fps the other way: the counts and the least slice are a 60 fps frame's share, so a frame of half
     the length (120 fps) finishes and shows half as many chunks and takes at most half the time, the same land each
     second. A whole 60 fps slice (up to 12 ms) in an 8 ms frame was a dropped frame every time land came in. */
  const _slow = _rush ? 1 : Math.min(STREAM_COUNT_MAX, Math.max(0.5, frameMsAvg / 16.7));
  const _least = Math.min(1, frameMsAvg / 16.7);
  const _streamMs = _rush ? 30 : Math.min(STREAM_MS_MAX, Math.max((_catchUp ? 12 : streamBehind ? STREAM_MS_BEHIND : 5) * _least,
                                                                  frameMsAvg * (streamBehind ? STREAM_SHARE_BEHIND : STREAM_SHARE)));
  const _streamDeadline = performance.now() + _streamMs;
  tp = perfLap('stream', tp);
  processGenFinish(Math.max(1, Math.round((_rush ? 8 : _catchUp ? 6 : streamBehind ? 4 : 2) * _slow)), _streamDeadline);
  tp = perfLap('chunk finish', tp);
  updateChunkFades(dt);                     // chunks fading in and out
  // the uploads keep at least a third of the slice to themselves, however long the finishing took
  applyMeshResults(Math.max(1, Math.round((_rush ? 48 : _catchUp ? 32 : streamBehind ? 24 : 12) * _slow)), Math.max(_streamDeadline, performance.now() + _streamMs * STREAM_UPLOAD_KEEP));
  tp = perfLap('mesh upload', tp);
  updateFarRegions();                       // settled far chunks drawn 4x4 to a mesh (C8)
  tp = perfLap('far regions', tp);
  pump();
  perfLap('stream', tp);
}

/* ================================================================================================
   WORLD TICK — everything that belongs to the world rather than to a player. Runs exactly once a
   frame no matter how many people are playing. (The chunk stream had its turn at the start of the frame:
   runChunkStream.)
   ================================================================================================ */
function runWorldTick(dt, now) {
  let tp = perfNow();                       // F3 timings

  /* Title panorama: lift the veil once every chunk in the (small) menu radius has both data and
     geometry, and nothing is still in flight. Any other state — a world loading, or gameplay —
     restores the canvas unconditionally, so an early "Singleplayer" click can never strand it
     invisible. */
  if (menuScene) {
    if (_menuVeil) {
      let ready = true;
      const R = drawDist();                  // the far ring too: nothing pops in behind the title
      outerMenu: for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dz * dz > R * R) continue;
          const c = getChunk(playerCX + dx, playerCZ + dz);
          if (!c || !c.data || !(c.meshes[0] || c.meshes[1] || c.meshes[2] || c.meshes[3])) {
            ready = false; break outerMenu;
          }
        }
      const done = ready && !meshResults.length && !genFinishQueue.length && !genQueue.length;
      /* Safety valve: a chunk with nothing to draw (solid rock, or open sky) never gets geometry,
         so "every chunk has a mesh" is not guaranteed to become true. A blank title screen is a
         far worse failure than a little pop-in, so the veil always lifts within 4 seconds. */
      if (done || performance.now() - _menuVeilT > 4000) {
        _menuVeil = false;
        // boot metric: ms from page start to a finished, visible title screen (see __vg.stats)
        if (window.__bootMs === undefined) window.__bootMs = Math.round(performance.now());
        canvas.style.opacity = '1';
        liftBootCover();
        // the panel is one transition behind the terrain, so the menu settles onto a finished view
        setTimeout(() => overlay.classList.remove('veiled'), 120);
      }
    }
  } else if (canvas.style.opacity !== '1') {
    _menuVeil = false;
    canvas.style.opacity = '1';
    overlay.classList.remove('veiled');
    liftBootCover();
  }

  /* Loading screen: dismiss once the player has spawned, the chunks within radius 4 are ready,
     AND the art is in. Chunk readiness alone used to be enough, which is how a cold join
     landed you in a finished world holding invisible items beside a black chest. */
  /* ...with a rough percentage and what is left: terrain generated, chunks built, art loaded and
     icons drawn, weighted by about how long each takes. Close, not exact. */
  if (_loadingWorld) {
    const R = Math.min(viewDist, Math.max(4, simDist()));
    let total = 0, genned = 0, built = 0;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R) continue;
        total++;
        const c = getChunk(playerCX + dx, playerCZ + dz);
        if (!c || !c.data) continue;
        genned++;
        if (!c.meshing && !c.queuedMesh) built++;
      }
    const art = gameAssetsReady ? 1 : (typeof gameArtTotal !== 'undefined' && gameArtTotal
      ? 0.7 * gameArtDone / gameArtTotal + (gameIconsLeft >= 0 && typeof PLACEABLE !== 'undefined'
          ? 0.3 * (1 - gameIconsLeft / Math.max(1, PLACEABLE.length)) : 0) : 0);
    const pct = Math.min(99, Math.floor(100 * (0.35 * genned / total + 0.45 * built / total + 0.2 * art)));
    const step = !player.spawned || genned < total ? `generating terrain · ${total - genned} chunks left`
               : !gameAssetsReady ? (gameIconsLeft > 0 ? `drawing icons · ${gameIconsLeft} left`
                                    : `loading textures · ${Math.max(0, gameArtTotal - gameArtDone)} left`)
               : built < total ? `building chunks · ${total - built} left`
               : 'lighting';
    setLoadingStep(`${pct}% · ${step}`);
  }
  if (_loadingWorld && player.spawned && gameAssetsReady) {
    let _ldDone = true;
    // every chunk the simulation will touch, not just the nearest ring, capped at the view distance
    const _ldR = Math.min(viewDist, Math.max(4, simDist()));
    outer: for (let ldz = -_ldR; ldz <= _ldR; ldz++) {
      for (let ldx = -_ldR; ldx <= _ldR; ldx++) {
        if (ldx * ldx + ldz * ldz > _ldR * _ldR) continue;
        const nc = getChunk(playerCX + ldx, playerCZ + ldz);
        if (!nc || !nc.data || nc.meshing || nc.queuedMesh) { _ldDone = false; break outer; }
      }
    }
    // genFinishQueue too: a chunk with data but no lighting pass yet is not actually ready
    if (_ldDone && meshResults.length === 0 && genFinishQueue.length === 0) {
      _loadingWorld = false;
      worldLoadingEl.style.display = 'none';
      /* Focus was lost while loading: pause now only if the window is still minimised or in the
         background; still looking at the game, it simply carries on — a click on it takes the mouse back. */
      if (pauseAfterJoin) {
        pauseAfterJoin = false;
        if (playing && (document.hidden || !document.hasFocus()) && !pointerLocked) setPlaying(false);
      }
    }
  }

  /* ---- world simulation: fluids, mobs, growth, falling blocks ---- */
  /* The whole simulation block is skipped on the title screen. The panorama has no physics, no
     fluids, no mobs and no growth — it is a camera pointed at generated terrain — so every one of
     these is dead weight there, and the boot frames are better spent streaming the backdrop in. */
  // ...and while a world is joining or paused nothing runs either: no mobs, fluids, drops or growth
  tp = perfLap('stream', tp);
  if (!menuScene && !worldHeld()) {
    updateSimWake();                        // seed physics for chunks entering the sim radius
    processFalling(dt);
    tp = perfLap('falling', tp);
    if (SIM_FIXED) {
      // dropped items, thrown things and arrows step in simTick: drawn here between their ticks
      const t = Math.max(0, Math.min(1, _simAcc / SIM_DT));
      if (!player.canFly) { _tickPosesDraw(DROPS, t); _tickPosesDraw(PROJECTILES, t); }
      _tickPosesDraw(ARROWS, t);
      _tickPosesDraw(BOSS_FX, t);           // 0.839
    } else {
      if (!player.canFly) { updateDrops(dt); updateProjectiles(dt); processLeavesDecay(dt); }
      updateArrows(dt);                     // arrows fly in both modes: mobs shoot, creative tests
      updateBossFx(dt);                     // 0.839
    }
    if (!SIM_FIXED) updateFluids(dt);       // with the fixed tick these step in simTick
    // creatures: with the fixed tick they step in simTick and are drawn here between their ticks
    if (SIM_FIXED) updateEntitiesFrame(dt, _simAcc / SIM_DT);
    else updateEntities(dt);
    tp = perfLap('creatures+drops draw', tp);
    if (!SIM_FIXED) {
      updateTNTs(dt);
      updateSaplings();
      processGrassSpread(dt);
      processHollowMushrooms(dt);           // lying hollow logs full of dirt grow mushrooms
      updateFurnaces(dt);
    }
    updateDoors(dt);
    updateBed(dt);
    updateChests(dt);
    updateTermiteHills(dt);                 // the Savanna's hills: their models and their termites (blocks/termite-hill.js)
    updateNightMobs(dt);                    // the loaded land's monsters as night falls, and a few later (entities/spawning.js)
    updateBenchDisplays();                  // the order floating over each busy crafting bench
    tp = perfLap('doors+chests', tp);
    if (typeof updateWaves === 'function') updateWaves(dt);           // the sea's waves (seasons/waves.js), before their foam is drawn
    if (typeof updateWetness === 'function') updateWetness(dt);       // wet ground: the rain, the waves' wash, drips (seasons/wetness.js)
  if (typeof updateParticles === 'function') updateParticles(dt);   // 49-particles.js (0.8)
    tp = perfLap('particles', tp);
  }
  /* The armour-stand preview is a single WebGL renderer whose canvas can only live in one panel at
     a time. It follows whoever opened their inventory MOST RECENTLY, and the moment they close it
     falls back to whoever is still in theirs — so opening a second inventory borrows the preview
     and closing it hands the preview straight back, instead of stranding the first player with an
     empty box until they reopen. */
  let pv = -1, pvSeq = -1;
  forEachPlayerState((g, i) => { if (g.invOpen && (g._invSeq || 0) > pvSeq) { pvSeq = g._invSeq || 0; pv = i; } });
  if (pv >= 0) withSlot(pv, () => updateEquipPreview(dt));
  tp = perfLap('gear preview', tp);

  /* ---- sky, lighting & shadow maps, then one render pass per player ---- */
  // the clock waits for the world too; with the fixed tick it moves in simTick, but on the title here
  updateDayNight(worldHeld() ? 0 : dt, !SIM_FIXED || !!menuScene);
  updateClouds(worldHeld() ? 0 : dt);           // the cloud layer drifts with the wind
  tp = perfLap('sky+clouds', tp);
  renderAllViews(dt);
  tp = perfLap('render', tp);
  if (typeof updateCameraFilter === 'function') updateCameraFilter(worldHeld() ? 0 : dt);   // what is on each lens
  tp = perfLap('lens', tp);

  /* ---- HUD text (after the render so draw/tri stats reflect the main pass) ---- */
  hudT += dt;
  if (hudT > 0.15) {
    hudT = 0;
    forEachPlayerSlot(paintDebugHud);
  }
  perfLap('hud', tp);
}

/* Volume fog for the camera currently installed: lava murk, water murk, or the ordinary surface
   range. Called once per viewport so each player's eye gets its own tint — one player underwater
   must not turn everyone else's view blue. */
function applyEyeVolumeFog() {
  const eyeId = getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) & 255;
  const far = drawDist() * 16;              // over the far ring
  if (eyeId === B.LAVA) {
    sharedUniforms.fogColor.value.set(0.72, 0.22, 0.0);
    renderer.setClearColor(sharedUniforms.fogColor.value);
    sharedUniforms.fogNear.value = 1;
    sharedUniforms.fogFar.value = 6;
    sharedUniforms.uAmbient.value = Math.min(sharedUniforms.uAmbient.value + 0.5, 1.0);
  } else if (eyeId === B.WATER) {
    sharedUniforms.fogColor.value.copy(_skyFogColor).multiplyScalar(0.45).lerp(_uwTint, 0.4);
    renderer.setClearColor(sharedUniforms.fogColor.value);
    // ...30% farther with Clear Eyes
    const see = typeof skillSightMul === 'function' ? 2 - skillSightMul() : 1;
    sharedUniforms.fogNear.value = 5 * see;
    sharedUniforms.fogFar.value = 36 * see;
    sharedUniforms.uAmbient.value = _skyAmbient * 0.78;
    sharedUniforms.uDirect.value  = _skyDirect  * 0.65;
  } else {
    // restore whatever updateDayNight computed for this instant — the previous viewport may have
    // been submerged and left the murk behind
    sharedUniforms.fogColor.value.copy(_skyFogColor);
    sharedUniforms.uAmbient.value = _skyAmbient;
    sharedUniforms.uDirect.value  = _skyDirect;
    sharedUniforms.fogNear.value = far * 0.55;
    sharedUniforms.fogFar.value  = far * 0.98;
    sharedUniforms.uSkyFog.value = 0; sharedUniforms.uHaze.value = 1;   // open sky; applyMist may fog it
    applyMist(camera);                                    // weather fog and the rainbow where this eye is
    renderer.setClearColor(sharedUniforms.fogColor.value);
  }
  // the rain's wet ground where this eye is (seasons/wetness.js)
  if (typeof wetRainHere === 'function') sharedUniforms.uWet.value = wetRainHere(camera.position);
  // under water or in lava the sky is only murk: no dome, sun, moon, stars, flare or haze
  if (eyeId === B.LAVA || eyeId === B.WATER) {
    sharedUniforms.uSkyFog.value = 1; sharedUniforms.uHaze.value = 0;
    skyVisibility(0); rainbowMesh.visible = false;
  }
  // everything drawn with three's own materials (mobs, gear, doors) fogs with the land since 0.816
  scene.fog.color.copy(sharedUniforms.fogColor.value);
  scene.fog.near = sharedUniforms.fogNear.value;
  scene.fog.far = sharedUniforms.fogFar.value;
}

/* The first-person arm, drawn on top of the finished view with its own cleared depth buffer.
   Split into its own function because it now runs once per viewport. */
function renderHandPass() {
  renderer.autoClear = false;
  renderer.clearDepth();
  /* hand scene: force neutral-bright uniforms so held items are never dark at night or in caves.
     Shadow coords (vSC) are in world space and meaningless for hand geometry, so disable shadow. */
  const _hsa = sharedUniforms.uAmbient.value, _hsd = sharedUniforms.uDirect.value, _hss = sharedUniforms.uShadowOn.value;
  const _hsc = sharedUniforms.uCloudOn.value;   // cloud shade is world space too
  const _hwet = sharedUniforms.uWet.value, _hwm = sharedUniforms.uWetBox.value.w;   // ...and the wet ground
  sharedUniforms.uWet.value = 0; sharedUniforms.uWetBox.value.w = 0;
  _handSaveLC.copy(sharedUniforms.uLightColor.value);
  sharedUniforms.uAmbient.value = 1.0; sharedUniforms.uDirect.value = 0.0; sharedUniforms.uShadowOn.value = 0.0;
  sharedUniforms.uCloudOn.value = 0;
  sharedUniforms.uLightColor.value.set(1, 1, 1);
  renderer.render(handScene, handCam);
  sharedUniforms.uAmbient.value = _hsa; sharedUniforms.uDirect.value = _hsd; sharedUniforms.uShadowOn.value = _hss;
  sharedUniforms.uCloudOn.value = _hsc;
  sharedUniforms.uWet.value = _hwet; sharedUniforms.uWetBox.value.w = _hwm;
  sharedUniforms.uLightColor.value.copy(_handSaveLC);
  renderer.autoClear = true;
}

// any other weather blending in here with at least a fifth of the weight, e.g. " (storm 30%)"
const _dbgMix = (w) => Object.entries(w.mix || {}).filter(([t, v]) => t !== w.type && v >= 0.2)
  .map(([t, v]) => ` (${t} ${Math.round(v * 100)}%)`).join('');
// the morning / after-rain fog and a rainbow where the player stands, when there is any
const _dbgMist = () => {
  const m = mistAt(player.pos.x, player.pos.z);
  return (m.light >= 0.05 ? ` &middot; mist ${Math.round(m.light * 100)}%` : '') + (m.bow >= 0.05 ? ` &middot; rainbow ${Math.round(m.bow * 100)}%` : '')
       + (typeof isBloodMoon === 'function' && isBloodMoon() ? ' &middot; blood moon' : '');   // 0.8192
};
// the date, weather and wind lines of the debug read-out
function _dbgDate() {
  const d = gameDate(), w = weatherAt(player.pos.x, player.pos.z, player.pos.y);
  const wdir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(w.dir / 45) % 8];
  // where the wind is heading over the next in-game hour: > rising, < falling, = steady
  const soon = weatherAt(player.pos.x, player.pos.z, player.pos.y, 1).speed;
  const trend = soon > w.speed + 1 ? '&gt;' : soon < w.speed - 1 ? '&lt;' : '=';
  const felt = windShelter(player);
  // today's sunrise and sunset: the days lengthen and shorten with the season
  const st = sunTimes(), hm = (t) => { const m = Math.round((((t * 24 + 6) % 24) + 24) % 24 * 60); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  return `Day ${worldDay} &middot; ${d.day} ${MONTH_NAMES[d.month]}, year ${d.year} (${SEASON_NAMES[d.season]}) &middot; ${moonPhaseName()} &middot; sun ${hm(st.rise)}-${hm(st.set)}<br>` +   // moon 0.817
    `weather: ${w.name}${_dbgMix(w)}${w.next ? ` &rarr; ${w.nextName} in ${w.nextIn}h` : ''}${_dbgMist()}<br>` +
    `wind: ${w.speed.toFixed(0)} km/h ${trend} ${soon.toFixed(0)} &middot; ${w.dir.toFixed(0)}&deg; ${wdir}` +
    (felt < 1 ? ` &middot; ${felt === 0 ? 'sheltered' : 'felt ' + Math.round(felt * 100) + '%'}` : '');
}
// the debug read-out, written into whichever player's pane is currently installed
function paintDebugHud() {
  if (debugHudHidden(activePlayerSlot())) return;    // F3 / pad Back turned it off for this seat
  const p = player.pos, info = renderer.info.render;
  const heading = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360;
  const cdir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(heading / 45) % 8];
  const mins = ((worldTime * 24 + 6) % 24) * 60;          // clock: sunrise = 06:00
  const clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.floor(mins % 60)).padStart(2, '0')}`;
  const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
  hudEl.innerHTML =
    `FPS ${fps} / ${fpsLimit ? Math.min(fpsLimit, rafHz) : rafHz}${SIM_FIXED ? ` &middot; sim ${SIM_HZ} Hz x${_simTicksLast}` : ''} &middot; ${player.flying ? 'flying' : (player._inWater ? 'swim' : 'walking')}${player.fast ? ' &middot; fast' : player.sneaking ? ' &middot; slow' : ''}${player.canFly ? '' : ' &middot; survival'}<br>` +
    `facing ${cdir} ${heading.toFixed(0)}&deg; &middot; ${clock}<br>` +
    // the date, the weather and the wind where you stand (0.81, seasons/seasons.js)
    `${_dbgDate()}<br>` +
    `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}<br>` +
    `biome ${mainGen.biomeAt(Math.floor(p.x), Math.floor(p.z))}<br>` +
    `chunk ${cx} , ${cz} &middot; loaded ${chunks.size}<br>` +
    `seed ${SEED} &middot; dist ${viewDist} [ ] &middot; sim ${simDist()}<br>` +
    // what this seat is actually listening to — the quickest answer to "is my controller detected"
    `input ${escapeHtml(inputLabelFor(activePlayerSlot()))}<br>` +
    `draws ${info.calls} &middot; tris ${(info.triangles / 1000).toFixed(0)}k &middot; creatures ${ENTITIES.length} &middot; drops ${DROPS.length}` +
    (_perfLine ? `<br>${_perfLine}` : '') +     // where the time goes
    (typeof fluidDebugLine === 'function' && fluidDebugLine() ? `<br>${fluidDebugLine()}` : '');   // the fluids' work (fluids/fluids.js)
}
