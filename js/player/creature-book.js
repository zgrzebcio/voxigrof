'use strict';
/* player/creature-book.js: the creature book. The use button held BOOK_HOLD_S with a book (ITEM.BOOK) on a creature whose
   kind is not in this player's book yet writes it in: one book is used up and it pays XP_BOOK_MOB, plus XP_BOOK_STEP for every kind
   written before it (kills pay XP_KILL_MUL less for it, player/leveling.js). The kinds written are the player's feats
   (`mobs`: restoreFeats / serializeFeats in player/leveling.js, saved with the player). A fish is written by its species,
   a mummy apart from the zombie; a kind with `book: false` in the creature table (the tumbleweed) is no creature to write.
   Called from _doPlace (player/place-block.js) before the animals' own uses; its prompt from _interactText (ui/hud.js). */
const XP_BOOK_MOB = 5000, XP_BOOK_STEP = 100;

// what a creature is written in the book as, and under what name
const bookKeyOf = (e) => e.kind === 'fish' && e.species ? 'fish:' + e.species : e.mummy ? 'zombie:mummy' : e.kind;
const bookNameOf = (e) => e.mummy ? 'Mummy' : (e.name || mobOf(e).name);
const _bookFeats = () => player._feats || (player._feats = restoreFeats(null));
// the creature under the crosshair a book in hand could be used on, or null
function _bookTarget() {
  if (!playing || menuScene || invOpen || player.dead || player.riding || player.canFly) return null;
  if (slotId(HOTBAR[hotbarSel]) !== ITEM.BOOK) return null;
  const e = pickEntity(ENT_INTERACT_REACH);
  return e && mobOf(e).book !== false ? e : null;
}

/* The use button with a book: true when the click was the book's. It starts the hold: BOOK_HOLD_S of the button kept down
   with the crosshair on the creature (updateBookHold, from tickPlayer; the progress ring, interactProgress in ui/hud.js) */
const BOOK_HOLD_S = 1;
function tryBookInteract() {
  const e = _bookTarget();
  if (!e) return false;
  if (act && act.place) return true;                  // fresh presses only
  if (_bookFeats().mobs.has(bookKeyOf(e))) { toast(`The ${bookNameOf(e).toLowerCase()} is already in your book`); return true; }
  player._bookHold = { e, t: 0, sel: hotbarSel };
  return true;
}
// once a frame per seat: 0..1 for the ring; `held` the RAW right button. Let go, or the creature out of the crosshair, ends it
function updateBookHold(dt, held) {
  const h = player._bookHold;
  if (!h) return 0;
  const e = h.e;
  if (!(held && hotbarSel === h.sel && e.hp > 0 && ENTITIES.includes(e) && _bookTarget() === e)) { player._bookHold = null; return 0; }
  player._milkLatch = true;                           // the held button is the book's, nothing else's (tickPlayer)
  h.t += dt;
  if (h.t < BOOK_HOLD_S) return h.t / BOOK_HOLD_S;
  player._bookHold = null;
  _bookWrite(e);
  return 0;
}
// the hold done: the kind written in, the book used up, the XP paid
function _bookWrite(e) {
  const f = _bookFeats(), key = bookKeyOf(e), name = bookNameOf(e);
  if (f.mobs.has(key)) return;
  const xp = XP_BOOK_MOB + XP_BOOK_STEP * f.mobs.size;
  f.mobs.add(key);
  const slot = HOTBAR[hotbarSel];
  slot.count--; if (slot.count <= 0) HOTBAR[hotbarSel] = null;
  saveHotbar(); buildHotbar(); updateHotbar();
  addXP(xp);
  if (typeof feedFeat === 'function') feedFeat(`Wrote the ${name.toLowerCase()} into your book (${f.mobs.size} creatures)`, xp);
}

// what the prompt says while a book is aimed at a creature
function bookPrompt() {
  const e = _bookTarget();
  if (!e) return '';
  const head = entityHead(e), dim = (s) => `<span style="opacity:.8;font-size:.9em">${s}</span>`;
  const f = _bookFeats();
  if (f.mobs.has(bookKeyOf(e))) return `${head}<br>${dim('already in your book')}`;
  return `${head}<br>${dim(`(hold <b>use</b>) write it into your book: ${XP_BOOK_MOB + XP_BOOK_STEP * f.mobs.size} XP, the book is used up`)}`;
}
