// Shared by every "jump the cursor to this cell" action (the Numeric Only overflow prompt's
// focus jump in App.tsx, Find's match jump in Grid.tsx) — James's report: a row scrolled to the
// very top of the page can still end up hidden, because several things in this app occupy that
// same top strip without taking up room in the page's own scroll flow: the app's sticky header
// bar (.app-sticky-top, height varies with whether a guidance banner is showing), the grid's own
// frozen column-number header rows (.taxonomy-grid thead), and — only while one is open — a
// centered validation dialog. scrollIntoView has no way to know about any of these, so this
// checks the real, current bottom edge of whichever of them are present and nudges the target
// down past all of them if it would otherwise land underneath.
export function nudgeBelowStickyObstructions(input: HTMLElement) {
  const obstructionBottoms: number[] = [];

  const stickyTop = document.querySelector('.app-sticky-top');
  if (stickyTop) obstructionBottoms.push(stickyTop.getBoundingClientRect().bottom);

  // A <thead> element itself is display: table-header-group and never moves on its own — only
  // its sticky <th> children "detach" visually while scrolling — so its own bounding rect always
  // reports where it would be WITHOUT stickiness, not its real on-screen position. Reads the last
  // header row's own th instead, which is the one that actually reaches furthest down the page.
  const gridHeaderCell = document.querySelector('.taxonomy-grid thead tr:last-child th');
  if (gridHeaderCell) obstructionBottoms.push(gridHeaderCell.getBoundingClientRect().bottom);

  const dialogs = document.querySelectorAll('.validation-dialog');
  const dialog = dialogs[dialogs.length - 1];
  if (dialog) obstructionBottoms.push(dialog.getBoundingClientRect().bottom);

  if (obstructionBottoms.length === 0) return;
  const obstructionBottom = Math.max(...obstructionBottoms);

  const inputTop = input.getBoundingClientRect().top;
  if (inputTop >= obstructionBottom) return;
  const delta = inputTop - (obstructionBottom + 16);

  // .grid-wrapper is now a genuinely bounded, independently-scrolling box (so its own sticky
  // header has something to stick within) — the target's on-screen position depends mostly on ITS
  // scroll position, not the page's, so that's the first thing nudged. Walks up to find whichever
  // ancestor is the real scroll container rather than assuming it's always .grid-wrapper, falling
  // straight through to the page itself if the target isn't inside a scrolling ancestor at all.
  // A row near the very top of a long taxonomy can be scrolled about as far as .grid-wrapper's own
  // (fairly short) box allows before clamping — e.g. already at scrollTop 0 — with real clearance
  // still needed beyond that; whatever the ancestor's own clamped range couldn't absorb is applied
  // to the page's own scroll instead, which still has the room .grid-wrapper's bounded box doesn't.
  let ancestor = input.parentElement;
  let absorbed = 0;
  while (ancestor) {
    if (ancestor.scrollHeight > ancestor.clientHeight) {
      const clamped = Math.min(Math.max(ancestor.scrollTop + delta, 0), ancestor.scrollHeight - ancestor.clientHeight);
      absorbed = clamped - ancestor.scrollTop;
      ancestor.scrollTop = clamped;
      break;
    }
    ancestor = ancestor.parentElement;
  }
  const remainder = delta - absorbed;
  if (remainder !== 0) window.scrollBy({ top: remainder });
}
