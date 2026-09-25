'use strict';
/* voxiGrof — the item feed (0.751)

   One list at the top middle of the screen saying what just entered or left your hands, and how it
   happened: picked up, crafted, smelted, placed, used, eaten, dropped, broken. An item event
   carries that item's own icon — the same 3D render the inventory slots use — and anything that is
   not about an item (a warning, "world saved", a bind prompt) carries an info badge instead.

   This REPLACES the old single-line toast. That one could only ever show the newest message, threw
   away everything before it, and said nothing at all about what you were carrying. `toast()` still
   exists and still behaves the same way from a caller's point of view — it now pushes an info row
   into this list — so none of its fifty call sites had to change.

   Rows STACK. Picking up eight dirt over eight steps is one row counting up to +8, not eight rows
   shoving each other off the screen. The key is the item AND the reason together, so dirt you
   picked up and dirt you just placed stay on separate lines rather than cancelling out. */

const FEED_MAX = 6;              // rows on screen; the oldest is retired early to make room
const FEED_LIFE = 3400;          // ms a row lives once nothing has added to it
const FEED_LIFE_WARN = 7000;     // ms a WARNING row lives: starving, drowning, no room (0.7572)
const FEED_OUT = 320;            // ms the leaving animation takes — must match the CSS transition

let _feedEl = null;
const FEED_ROWS = new Map();     // key -> { el, amt, timer, info }

function _feedHost() {
  if (_feedEl && _feedEl.isConnected) return _feedEl;
  _feedEl = document.getElementById('feed');
  if (!_feedEl) {                                  // built here if the page did not ship one
    _feedEl = document.createElement('div');
    _feedEl.id = 'feed';
    document.body.appendChild(_feedEl);
  }
  return _feedEl;
}
const _feedName = (id) => (id >= 256 ? ITEM_PROPS[id]?.name : PROPS[id]?.name) || 'Item';
const _feedEsc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
/* The info badge: a circled "i", drawn inline so it needs no texture and stays crisp at any HUD
   scale. Warnings reuse the same mark in a warmer colour, set by the row's class. */
const FEED_INFO_SVG =
  '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">' +
  '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<circle cx="8" cy="4.4" r="1.05" fill="currentColor"/>' +
  '<rect x="7.05" y="6.6" width="1.9" height="5.4" rx=".9" fill="currentColor"/></svg>';

/* Retire a row: play the leaving animation, then take it out of the DOM. `.out` collapses the
   row's height as well as fading it, so the rows below slide up into the gap instead of jumping. */
function _feedRetire(key) {
  const row = FEED_ROWS.get(key);
  if (!row) return;
  FEED_ROWS.delete(key);
  clearTimeout(row.timer);
  row.el.classList.add('out');
  setTimeout(() => row.el.remove(), FEED_OUT);
}
// oldest first, so trimming to FEED_MAX drops the one you are least likely to still be reading
function _feedTrim() {
  while (FEED_ROWS.size > FEED_MAX) _feedRetire(FEED_ROWS.keys().next().value);
}
/* Replay the pulse on a row that just grew. The class has to come off and the layout be flushed
   before it goes back on, or the browser sees no change and the animation never restarts. */
function _feedBump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

/* The one way anything gets onto the feed. `key` decides what stacks with what; `html` is the row
   body. Returns the row so the callers can update their own text after a merge. */
/* One chime for every row that matters (0.7576), pitched by how much it matters: a level-up rings high,
   a warning at the file's own pitch, a critical one low. Rate shifts pitch here (see playSound's
   `pitch`). The same row cannot chime more than once in FEED_CHIME_GAP, so drowning's hit every second
   is a steady pulse rather than a pile-up. */
const FEED_CHIME_RATE = { level: 1.26, warn: 1.0, crit: 0.72 };
const FEED_CHIME_GAP = 900;      // ms
/* A gold row's chime is capped across ALL of them (0.7992): finishing a quest that also levels you up,
   or two quests at once, used to ring two or three times over each other. One ring, then a pause. */
const FEED_LEVEL_GAP = 2000;
var _feedLevelChimeAt = -1e9;
const _feedChimeAt = new Map();  // row key -> when it last chimed
function _feedChime(key, cls) {
  const rate = FEED_CHIME_RATE[cls];
  if (rate == null || typeof playSound !== 'function') return;
  const now = performance.now();
  if (cls === 'level') {
    if (now - _feedLevelChimeAt < FEED_LEVEL_GAP) return;
    _feedLevelChimeAt = now;
  }
  if (now - (_feedChimeAt.get(key) || -1e9) < FEED_CHIME_GAP) return;
  _feedChimeAt.set(key, now);
  playSound('feedAlert', { gain: cls === 'crit' ? 0.9 : 0.7, rate, pitch: true });
}
// a dead player gets no feed (0.7576): the death screen is the only thing to read. Returns null.
const _feedMuted = () => typeof player !== 'undefined' && !!player && !!player.dead;

function _feedPush(key, cls, html) {
  if (_feedMuted()) return null;
  const host = _feedHost();
  let row = FEED_ROWS.get(key);
  if (row && row.el.isConnected && !row.el.classList.contains('out')) {
    clearTimeout(row.timer);
    // re-inserting keeps a row that is still being added to at the top, where you are looking
    if (host.firstChild !== row.el) host.insertBefore(row.el, host.firstChild);
    FEED_ROWS.delete(key);                         // ...and re-key it so it is now the NEWEST
    row.fresh = false;
  } else {
    const el = document.createElement('div');
    /* Born `.in` — offset and transparent — then the layout is flushed and the class taken off,
       which is what gives the transition a start state to travel from. Waiting for a frame instead
       would not work: the row has not been painted yet, so the browser would see one style and
       animate nothing. */
    el.className = 'feedRow ' + cls + ' in';
    el.innerHTML = html;
    host.insertBefore(el, host.firstChild);
    void el.offsetWidth;
    el.classList.remove('in');
    row = { el, amt: 0, fresh: true, info: cls === 'info' || cls === 'warn' || cls === 'crit' };
  }
  FEED_ROWS.set(key, row);
  // critical rows stay up twice as long, so a warning cannot scroll past unread (0.7572)
  row.timer = setTimeout(() => _feedRetire(key), cls === 'warn' || cls === 'crit' ? FEED_LIFE_WARN : FEED_LIFE);
  _feedTrim();
  _feedChime(key, cls);
  return row;
}

/* ---------------------------------- item events ----------------------------------
   `delta` is signed: positive for what you gained, negative for what left. `reason` is how it
   happened, and is part of the stacking key. */
function feedItem(id, delta, reason) {
  if (id == null || !delta) return;
  if (typeof PROPS === 'undefined') return;
  if (id >= 256 ? !ITEM_PROPS[id] : !PROPS[id]) return;
  const sign = delta > 0 ? 1 : -1;
  const key = 'i:' + id + ':' + sign + ':' + (reason || '');
  const src = typeof renderBlockIcon === 'function' ? renderBlockIcon(id) : '';
  const row = _feedPush(key, sign > 0 ? 'gain' : 'loss',
    `<span class="fIcon">${src ? `<img class="i3d" src="${src}" alt="">` : FEED_INFO_SVG}</span>` +
    '<span class="fTxt"><b class="fAmt"></b> <span class="fName"></span></span>' +
    `<span class="fWhy">${_feedEsc(reason || '')}</span>`);
  if (!row) return;
  row.amt += Math.abs(delta);
  row.el.querySelector('.fAmt').textContent = (sign > 0 ? '+' : '−') + row.amt;
  row.el.querySelector('.fName').textContent = _feedName(id);
  /* The icon can come back empty while a block's mesh art is still loading (renderBlockIcon does
     not cache a miss), so a row that opened with the info badge picks the real icon up on its
     next hit rather than being stuck with a placeholder for its whole life. */
  const ic = row.el.querySelector('.fIcon');
  if (src && !ic.firstElementChild?.src) ic.innerHTML = `<img class="i3d" src="${src}" alt="">`;
  if (!row.fresh) _feedBump(row.el);   // a brand-new row is already animating itself in
}

/* ---------------------------------- info + warnings ----------------------------------
   Everything that is not about an item. Repeats collapse into a xN counter instead of filling the
   list with the same sentence — pressing a blocked bind five times says so once. */
// `warn`: falsy = info (blue), true = warning (yellow), 'crit' = critical (red, 0.7576)
function feedInfo(msg, warn) {
  const text = String(msg == null ? '' : msg);
  if (!text) return;
  const row = _feedPush('m:' + text, warn === 'crit' ? 'crit' : warn ? 'warn' : 'info',
    `<span class="fIcon">${FEED_INFO_SVG}</span>` +
    `<span class="fTxt">${_feedEsc(text)}</span><span class="fMul"></span>`);
  if (!row) return;
  row.amt++;
  row.el.querySelector('.fMul').textContent = row.amt > 1 ? '×' + row.amt : '';
  if (!row.fresh) _feedBump(row.el);   // a brand-new row is already animating itself in
}
const feedWarn = (msg) => feedInfo(msg, true);
const feedCrit = (msg) => feedInfo(msg, 'crit');   // you are losing health right now

/* Level-ups get a row of their own (0.7523): a gold star instead of the plain info badge, under one
   key, so levelling twice in a burst reads as the newest level rather than two lines. */
const FEED_STAR_SVG =
  '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">' +
  '<path d="M8 1.2l2.05 4.3 4.7.6-3.45 3.25.88 4.65L8 11.75 3.82 14l.88-4.65L1.25 6.1l4.7-.6z" fill="currentColor"/></svg>';
function feedLevel(level) {
  const row = _feedPush('lvl', 'level',
    `<span class="fIcon">${FEED_STAR_SVG}</span><span class="fTxt">Reached level <b class="fAmt"></b></span>`);
  if (!row) return;
  row.el.querySelector('.fAmt').textContent = level;
  if (!row.fresh) _feedBump(row.el);
}

/* Learning a skill (0.7911): the same gold star as a level-up, since it is what the level paid for.
   Keyed per skill so two learned back to back read as two rows. */
// a gold reminder that skill points are waiting (0.807, 45-skills.js repeats it every SKILL_REMIND seconds)
function feedSkillPoints(n) {
  const row = _feedPush('skillpts', 'level',
    `<span class="fIcon">${FEED_STAR_SVG}</span><span class="fTxt"></span>`);
  if (!row) return;
  row.el.querySelector('.fTxt').innerHTML = `<b class="fAmt">${n}</b> skill point${n === 1 ? '' : 's'} to spend &middot; open the tree`;
  if (!row.fresh) _feedBump(row.el);
}
function feedSkill(name) {
  const row = _feedPush('skill:' + name, 'level',
    `<span class="fIcon">${FEED_STAR_SVG}</span><span class="fTxt">Learned <b class="fAmt"></b></span>`);
  if (!row) return;
  row.el.querySelector('.fAmt').textContent = name;
  if (!row.fresh) _feedBump(row.el);
}

/* A finished quest (0.7992): the same gold star as a level-up, with what it paid on the right. Keyed per
   quest, so two finished at once read as two rows — but only one of them rings (see _feedChime). */
function feedQuest(name, xp) {
  const row = _feedPush('quest:' + name, 'level',
    `<span class="fIcon">${FEED_STAR_SVG}</span><span class="fTxt">Quest done: <b class="fAmt"></b></span>` +
    '<span class="fWhy"></span>');
  if (!row) return;
  row.el.querySelector('.fAmt').textContent = name;
  row.el.querySelector('.fWhy').textContent = '+' + xp + ' XP';
  if (!row.fresh) _feedBump(row.el);
}

/* The old entry point, kept so every existing caller still works. It now lands in the feed as an
   info row; the single-line #toast element it used to write into is gone. */
function toast(msg) { feedInfo(msg); }

// leaving a world should not carry the last world's messages into the menu
function clearFeed() {
  for (const key of [...FEED_ROWS.keys()]) {
    const row = FEED_ROWS.get(key);
    clearTimeout(row.timer);
    row.el.remove();
    FEED_ROWS.delete(key);
  }
}
