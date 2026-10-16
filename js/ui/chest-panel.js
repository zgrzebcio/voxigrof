'use strict';
/* ui/chest-panel.js: the chest's window. */

/* ---------------------------------- GUI ---------------------------------- */
// Rendered to the RIGHT of the inventory. A single chest is CHEST_ROWS x CHEST_COLS; a double
// stacks its partner's grid above the first half's (which has the bonus row): 7 x 7.
const CHEST_SCROLL_ROWS = 7;                                  // more rows than this scroll (css #chestPanel .chestScroll)
function buildChestPanel() {
  const panel = invPanel('chestPanel');
  if (!panel) return;
  const a = activeChest && CHESTS.get(activeChest);
  if (!a || invRightTab() !== 'chest') { panel.style.display = 'none'; return; }   // or another tab is up
  if (invPanelHeld(panel)) return;                                                  // the skill tree is up
  const b = activeChest2 && CHESTS.get(activeChest2);
  panel.style.display = 'flex';
  // a rebuild (every drag and drop) keeps a large metal chest where it was scrolled; a new chest opens at the bottom
  const oldBox = panel.querySelector('.chestScroll');
  const keepScroll = oldBox && panel._chestKey === activeChest ? oldBox.scrollTop : null;
  panel._chestKey = activeChest;
  panel.innerHTML = '';                                       // its tab names it (was a "Chest" title)
  addInvTabs(panel, 'chest');                                 // Chest / Equipment / Skill tree
  const mkGrid = (arr, region) => {
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.dataset.region = region;
    const rows = Math.ceil(arr.length / CHEST_COLS);   // 3, or 4 for a double's first half
    for (let row = 0; row < rows; row++) {             // row 0 renders at the bottom
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      for (let col = 0; col < CHEST_COLS; col++) {
        const div = document.createElement('div');
        div.className = 'slot';
        div.innerHTML = slotInner(arr[row * CHEST_COLS + col]);
        rowEl.appendChild(div);
      }
      grid.appendChild(rowEl);
    }
    return grid;
  };
  /* 3 x 7 fits on screen outright, and a wooden double is only 7 rows. A metal chest's 6 do too, but a double's 13
 sit in a box CHEST_SCROLL_ROWS tall that scrolls: the wheel, or the right stick under the pad cursor (17) */
  const rowsAll = Math.ceil(a.slots.length / CHEST_COLS) + (b ? Math.ceil(b.slots.length / CHEST_COLS) : 0);
  let box = panel;
  if (rowsAll > CHEST_SCROLL_ROWS) { box = document.createElement('div'); box.className = 'chestScroll'; panel.appendChild(box); }
  if (b) box.appendChild(mkGrid(b.slots, 'chest2'));        // partner sits above
  box.appendChild(mkGrid(a.slots, 'chest'));
  if (box !== panel) {
    // done twice, as the creative palette does (20): before layout the scroll height is still 0
    const settle = () => { box.scrollTop = keepScroll ?? box.scrollHeight; };
    settle();
    requestAnimationFrame(settle);
  }
  // its own Sort under the slots: both halves of a large chest sort as one
  if (typeof invButton === 'function') {
    const row = document.createElement('div');
    row.className = 'invActions';
    row.appendChild(invButton('Sort A-Z', 'Merge stacks and sort this chest by name', sortChest));
    // emptying the chest belongs on the chest — everything, or only what you already carry
    row.appendChild(invButton('Pull all', 'Take everything out of the chest', pullAll));
    row.appendChild(invButton('Quick stack', 'Take out only the items you already carry some of', quickStackToMe));
    panel.appendChild(row);
  }
}
