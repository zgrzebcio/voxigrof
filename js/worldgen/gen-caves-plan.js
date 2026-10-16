'use strict';
/* worldgen/gen-caves-plan.js: where the big underground things ARE, planned per cell from the seed so every chunk
   agrees: rooms and tunnels, cave mouths, mountain halls and shafts, mine shafts. genChunk only carves the plan.
   A part of makeGen's body (worldgen/make-gen.js). */

corePart('gen.make', function () {
    /* Rooms and cave mouths (biomeRev 15; carved in genChunk): one candidate per cell, a pure function of the
       cell, kept for the generator's life so the neighbouring chunks asking again cost nothing. A room: in most
       ROOM_CELL squares, 4-14 across (a hall to 26 now and then) at any depth under the crust. A mouth: the steepest
       drop (5+ over 8 blocks) at five points of a MOUTH_CELL square, the tunnel's start at its foot, heading in. */
    const ROOM_CELL = 24, MOUTH_CELL = 40, _rooms = new Map(), _mouths = new Map();
    function roomOf(gx, gz) {
      const k = gx + ',' + gz;
      if (_rooms.has(k)) return _rooms.get(k);
      let rm = null;
      if (hash2(gx * 7151 + 13, gz * 6007 - 29) < 0.8) {
        const x = (gx + 0.15 + 0.7 * hash2(gx * 31 + 7, gz * 17 + 3)) * ROOM_CELL, z = (gz + 0.15 + 0.7 * hash2(gx * 13 - 5, gz * 37 + 11)) * ROOM_CELL;
        const hall = hash2(gx * 97 + 1, gz * 89 - 1) < 0.07;
        const r = hall ? 9 + 4 * hash2(gx * 3 + 41, gz * 5 - 43) : 2 + 5 * hash2(gx * 11 + 61, gz * 7 - 59);
        const ry = r * (hall ? 0.6 : 0.8), ti = terrainInfo(x, z);
        const top = ti.h - (ti.h < ti.wl ? 11 : 8) - ry, lo = 6 + ry;
        if (top > lo) rm = { x, z, r, ry, y: lo + (top - lo) * Math.pow(hash2(gx * 23 + 9, gz * 29 - 9), 1.4) };
      }
      _rooms.set(k, rm);
      return rm;
    }
    function mouthOf(gx, gz) {
      const k = gx + ',' + gz;
      if (_mouths.has(k)) return _mouths.get(k);
      let m = null;
      const roll = hash2(gx * 5113 + 77, gz * 4271 - 91);
      if (roll < 0.6) {
        const cx0 = (gx + 0.5) * MOUTH_CELL, cz0 = (gz + 0.5) * MOUTH_CELL;
        let best = 4, pick = null;
        for (const [ox, oz] of [[0, 0], [-11, -7], [11, -7], [-7, 11], [7, 11]]) {
          const px = cx0 + ox, pz = cz0 + oz, c = terrainInfo(px, pz);
          if (c.h < c.wl + 3 || c.h <= WATER_LEVEL + 3) continue;
          for (let a = 0; a < 8; a++) {
            const ax = Math.cos(a * Math.PI / 4), az = Math.sin(a * Math.PI / 4), t = terrainInfo(px + ax * 8, pz + az * 8);
            const g = t.h, drop = c.h - g;
            if (drop > best && g > WATER_LEVEL && g >= t.wl) { best = drop; pick = [px + ax * 8, pz + az * 8, g, Math.atan2(-az, -ax)]; }   // its foot on dry ground
          }
        }
        if (pick) {
          /* the way in, step by step [x, y, z, roof]: open (roof 0) wherever its top comes within 3 of the ground, so it
             breaks out of the face (and an arch out of the far side, where it ends), 2 blocks of roof inside */
          const arch = roll < 0.18, rad = arch ? 2.2 + 1.2 * hash2(gx * 29 + 2, gz * 31 - 2) : 1.6 + 0.9 * hash2(gx * 37 + 2, gz * 41 - 2);
          const len = (arch ? 22 : 14) + 22 * hash2(gx * 17 + 1, gz * 19 - 1), fall = arch ? 0 : 0.12 + 0.2 * hash2(gx * 53 + 2, gz * 59 - 2);
          let ang = pick[3] + (hash2(gx * 43 + 2, gz * 47 - 2) - 0.5) * 0.6, x = pick[0], z = pick[1], y = pick[2] + rad - 0.3, inside = false;
          const path = [];
          for (let s = 0, n = 0; s < len; s += 0.8, n++) {
            x += Math.cos(ang) * 0.8; z += Math.sin(ang) * 0.8; y -= fall * 0.8;
            ang += (hash2(gx * 7 + n, gz * 11 - n) - 0.5) * 0.1;
            const g = terrainInfo(x, z).h;
            if (g >= y + rad + 3) inside = true;
            else if (inside && g < y - rad) break;                                        // out the far side
            path.push([x, y, z, g >= y + rad + 3 ? 2 : 0]);
          }
          if (inside) m = { x: pick[0], z: pick[1], low: pick[2], arch, rad, path };
        }
      }
      _mouths.set(k, m);
      return m;
    }

    /* Mountain caves (biomeRev 22; carved in genChunk): in most MT_CELL squares of high land (MT_HIGH and over: the
       mountains, the hills' tops, the desert's mesas and crags) a hall inside the mass, 10-22 across, a third to a half of
       the way up; a tunnel from it out to the slope the way the ground falls soonest (now and then a second the other way,
       so it runs through), and a winding shaft from its floor down into the deep caves. Halls of neighbouring squares are
       joined by the rooms' tunnels. A pure function of the cell, kept for the generator's life like the rooms. */
    const MT_CELL = 64, MT_HIGH = 128, _mtCaves = new Map();
    function mtCaveOf(gx, gz) {
      const k = gx + ',' + gz;
      if (_mtCaves.has(k)) return _mtCaves.get(k);
      let cv = null;
      const rr = (n) => hash2(gx * 1301 + n * 97 + 7, gz * 1709 - n * 131 - 3);
      if (DESERT3 && !FLAT && rr(0) < 0.85) {
        const x = (gx + 0.2 + 0.6 * rr(1)) * MT_CELL, z = (gz + 0.2 + 0.6 * rr(2)) * MT_CELL, ti = terrainInfo(x, z);
        if (ti.h >= MT_HIGH && ti.h >= ti.wl + 6) {
          const r = 5 + 6 * rr(3), ry = r * 0.55;
          const y = Math.min(ti.h - 9 - ry, 100 + (ti.h - 100) * (0.3 + 0.2 * rr(4)));
          // the ways out: from the hall, along each of 8 ways, how far before the ground is under the tunnel's roof
          const reach = [];
          for (let a = 0; a < 8; a++) {
            const ca = Math.cos(a * Math.PI / 4), sa = Math.sin(a * Math.PI / 4);
            let d = 0;
            for (let s = r + 4; s <= 64 && !d; s += 4) if (terrainInfo(x + ca * s, z + sa * s).h < y + 3) d = s;
            reach.push(d || 999);
          }
          let best = 0;
          for (let a = 1; a < 8; a++) if (reach[a] < reach[best]) best = a;
          const exits = [];
          const exitPath = (a, d, seed) => {
            const ca = Math.cos(a * Math.PI / 4), sa = Math.sin(a * Math.PI / 4), pts = [], fl = y - ry * 0.5 + 1.6;
            let px = x, pz = z, ang = 0;
            for (let s = 0; s <= d + 5; s += 0.8) {
              ang += (hash2(seed * 13 + s * 7, gz * 11 - s) - 0.5) * 0.12;
              const c2 = Math.cos(ang), s2 = Math.sin(ang);
              px = x + (ca * c2 - sa * s2) * s; pz = z + (ca * s2 + sa * c2) * s;
              const g = terrainInfo(px, pz).h;
              pts.push([px, fl, pz, g >= fl + 4.5 ? 2 : 0]);               // open (roof 0) where the slope comes down to it
              if (g < fl - 1) break;                                         // out in the open
            }
            return pts;
          };
          if (reach[best] < 999) {
            exits.push(exitPath(best, reach[best], 1));
            // the other side too, now and then, so it runs right through the mountain
            const opp = (best + 4) % 8;
            if (rr(5) < 0.45 && reach[opp] < 999) exits.push(exitPath(opp, reach[opp], 2));
          }
          // the deep shaft: winding down from the hall's floor to the deep caves
          const deep = [], bottom = 18 + 22 * rr(6);
          let dx = x + (rr(7) - 0.5) * r, dz = z + (rr(8) - 0.5) * r, da = rr(9) * Math.PI * 2;
          for (let dy = y - ry * 0.4; dy > bottom; dy -= 0.7) {
            da += (hash2(gx * 17 + dy * 3, gz * 19 - dy) - 0.5) * 0.5;
            dx += Math.cos(da) * 0.55; dz += Math.sin(da) * 0.55;
            if (Math.hypot(dx - x, dz - z) > 14) { dx -= Math.cos(da) * 1.1; dz -= Math.sin(da) * 1.1; }
            deep.push([dx, dy, dz]);
          }
          cv = { x, y, z, r, ry, exits, deep, dr: 1.6 + 0.8 * rr(10) };
        }
      }
      _mtCaves.set(k, cv);
      return cv;
    }
    /* Mine shafts (biomeRev 22; dug in genChunk): in a desert's hills (mostly the red desert's), from the foot of a
       face dropping 6+ over 7, a tunnel 3 wide and 3 tall straight into the hill, framed in oak every 4 (fence posts and
       a beam), then a shaft down 8-16 with a ladder to a room with a side tunnel. Burnt-out torches, cobwebs, a few
       collapsed frames and gravel; gold showing in the red desert's walls. No chest. One per MS_CELL square at most. */
    const MS_CELL = 80, _mines = new Map();
    function mineOf(gx, gz) {
      const k = gx + ',' + gz;
      if (_mines.has(k)) return _mines.get(k);
      let m = null;
      const rr = (n) => hash2(gx * 3301 + n * 61 + 17, gz * 2203 - n * 89 - 41);
      const c = DESERT3 && !FLAT ? terrainInfo((gx + 0.5) * MS_CELL, (gz + 0.5) * MS_CELL) : null;
      if (c && c.fDesert > 0.5 && !(c.oas > 0.5) && rr(0) < (c.fRed > 0.5 && !(c.fDeepD > 0.5 && c.ddRed <= 0.5) ? 0.6 : 0.15)) {
        let best = 5, pick = null;
        for (let i = 0; i < 9; i++) {
          const px = (gx + 0.2 + 0.6 * (i % 3) / 2) * MS_CELL, pz = (gz + 0.2 + 0.6 * ((i / 3) | 0) / 2) * MS_CELL, t = terrainInfo(px, pz);
          if (!(t.fDesert > 0.5) || t.h < t.wl) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const f = terrainInfo(px - dx * 7, pz - dz * 7), drop = t.h - f.h;   // the foot, 7 out from the high point
            if (drop > best && f.h > WATER_LEVEL && f.h >= f.wl && f.fDesert > 0.5) { best = drop; pick = [Math.floor(px - dx * 7), Math.floor(pz - dz * 7), f.h, dx, dz]; }
          }
        }
        if (pick) {
          const [fx, fz, g, dx, dz] = pick, len = 13 + Math.floor(rr(1) * 10);
          // the hill must stand over the tunnel's middle and end, or it would be a trench
          const mid = terrainInfo(fx + dx * (len >> 1), fz + dz * (len >> 1)).h, end = terrainInfo(fx + dx * len, fz + dz * len).h;
          if (mid >= g + 6 && end >= g + 6) {
            const depth = 8 + Math.floor(rr(2) * 9);
            m = { fx, fz, y: g + 1, dx, dz, len, depth: Math.min(depth, g + 1 - 12), side: rr(3) < 0.5 ? 1 : -1, sideLen: 5 + Math.floor(rr(4) * 5),
                  red: c.fRed > 0.5 };
          }
        }
      }
      _mines.set(k, m);
      return m;
    }
});
