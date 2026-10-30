'use strict';
/* ui/chest-panel.js: the chest's window. */

/* ---------------------------------- GUI ---------------------------------- */
/* Rendered to the RIGHT of the inventory, as tall as its chest and never taller than the equipment panel (css
   #chestPanel). A single chest is CHEST_ROWS x CHEST_COLS (a metal one CHEST_ROWS_METAL); a double stacks its
   partner's grid above the first half's (which has the bonus row). The largest, a metal double's 9 rows, fits whole:
   nothing scrolls. */
function buildChestPanel() {
  const panel = invPanel('chestPanel');
  if (!panel) return;
  const a = activeChest && CHESTS.get(activeChest);
  if (!a || invRightTab() !== 'chest') { panel.style.display = 'none'; return; }   // or another tab is up
  if (invPanelHeld(panel)) return;                                                  // the skill tree is up
  const b = activeChest2 && CHESTS.get(activeChest2);
  panel.style.display = 'flex';
  panel.innerHTML = '';                                       // its tab names it (was a "Chest" title)
  addInvTabs(panel, 'chest');                                 // Chest / Equipment / Skill tree
  const mkGrid = (arr, region) => {
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.dataset.region = region;
    const rows = Math.ceil(arr.length / CHEST_COLS);   // 2 (metal 4), and one more for a double's first half
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
  if (b) panel.appendChild(mkGrid(b.slots, 'chest2'));      // partner sits above
  panel.appendChild(mkGrid(a.slots, 'chest'));
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
