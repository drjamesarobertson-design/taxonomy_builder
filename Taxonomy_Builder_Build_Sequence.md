# Taxonomy Builder — Staged Build Sequence

How to use this: put `CLAUDE.md` in the root of a new project folder, open that folder in Claude Code, and work through the five stages below in order — one Claude Code session per stage. Each box is a ready-to-paste opening message. Don't skip ahead; each stage depends on the one before it actually working.

After each stage, test it yourself before moving on. If something's off, say so in that same session and get it right before starting the next stage fresh — a working Stage 1 is worth far more than a rushed Stage 3.

---

## Stage 1 — Foundation and Data Model

Gets a working grid on screen holding the core data correctly, with save and load. No colours, no right-click menus, no fancy behaviour yet — just: does the data model actually work.

> Read CLAUDE.md in full before starting. Let's build Stage 1 only: the foundation and data model.
>
> Set up a new React + TypeScript project. Build the core grid: single-character code columns, the fixed delimiter column, and the matching description columns, as described in Section 4.1 of CLAUDE.md, defaulting to 8 levels. I should be able to type a single character into any code cell and free text into any description cell. Add save-to-file and load-from-file for the whole taxonomy as a local JSON project file, including the title, table name, and purpose captured at creation (Section 5, step 1).
>
> Don't build colour coding, case toggling, promote/demote, sorting, validation warnings, undo, comments, or export yet — those are later stages. Stop once I can create a taxonomy, type a few rows by hand across two or three levels, save it, reload it, and see the same data back.

---

### Backlog raised after Stage 1 testing (not yet in CLAUDE.md)

James tested the Stage 1 build and raised the following, to be picked up at the noted later stage rather than now:

1. **Description text overflow.** Description cells should visually overlap into empty adjacent description columns, indented one character width per level, so the hierarchy reads as a tight, indented tree rather than columns of blank cells. → Done in **Stage 2**; refined further after testing (see below) so each description column is narrow and text overflows into a dedicated overflow column instead of adjacent description columns.
2. **One description cell per row, enforced.** Only the description column matching a row's deepest occupied level should be enterable (Section 4.1's rule made real, not just a convention). Clarified: once a row has an entry in any description cell, entering text to its left or right is not permitted — moving it to a different level requires Promote/Demote. → **Stage 3** (ties to promote/demote redefining a row's level). Still outstanding.
3. **Code cell width.** Code cells should be sized to the width of a capital "O" plus 2px padding either side, rather than a generic input width. → Done in **Stage 2**.
4. **Code column headers.** Header labels should be short numerals ("1", "2", …) rather than "Code 1", "Code 2", to fit the narrow code columns. → Done in **Stage 2**.
5. **Code fill-down.** Entering a code should replicate it down the column to subsequent rows until a different code is entered, at which point the new value replicates from there. Clarified: fill-down stops when the code in the column to its left changes (i.e. a shallower/higher level in the hierarchy) — it does not wait for a change in its own column. → Originally proposed for Stage 3, but **built ahead of schedule** after Stage 2 testing, since James asked for it directly. Implemented as: new rows inherit the full code path of the row above when added, and editing a code propagates forward through the contiguous run of rows that shared the old value, stopping at the first row whose value already differed or whose parent (column-to-the-left) differs.

### Further refinements requested after Stage 2 testing (implemented, not deferred)

- Monospace font (Courier New) throughout, which also makes "character width" (e.g. "O" width) sizing exact via CSS `ch` units.
- A blank spacer column (~3 characters wide) between the code block and the description block.
- Description column headers shortened to plain numerals ("1".."8"), matching the code columns.
- Description columns narrowed to "O" width + 2px each (matching code columns' tightness), with overflow now flowing across these narrow columns into a dedicated final overflow column rather than just the next column.
- The overflow column's width is derived from the taxonomy's "Maximum ERP Description Field Length" setting (captured at creation): `overflow column width = maxDescriptionLength − number of levels`, clamped to a sensible minimum. It has a visible dashed right boundary marking the "indicative width", while text is still allowed to visually overflow past it.
- Enter and arrow keys now navigate between cells (Enter/↓ moves down, ↑ moves up, ←/→ move to the adjacent column when the text caret is already at that edge of the cell, otherwise they move the caret as normal).

### Code validation, brought forward from Stage 4

After trying fill-down, James asked for the following ahead of schedule (originally Section 6.7's hard rule, planned for Stage 4):

- **Restricted character set.** Only `.`, `0`-`9`, `a`-`z`, `A`-`Z` are valid in a code cell; any other character is rejected with a popup: `Invalid code. Valid codes are: ".", 0 to 9, A to Z, a to z`.
- **Ascending ASCII order, enforced.** Within a column, and scoped to rows sharing the same parent (the column to the left), a new code must sort strictly between its nearest non-blank neighbours above and below — e.g. if the row above holds `3`, only `4` or higher is accepted. A violation shows a popup: "Code must increase. Valid codes are: …", listing the actual valid characters/ranges. Comparison is case-sensitive per raw ASCII value, so uppercase (`A`-`Z`) sorts before lowercase (`a`-`z`).
- **Changing a code clears codes to the right.** If a row's code at some level changes, every code at a deeper level (to its right) for that row is cleared, since those child-level codes were only meaningful relative to the old parent code. This applies to every row affected by a fill-down cascade triggered by the edit, not just the row directly typed into.

### Code entry fix, after further testing

James found that changing an existing code required deleting it first before typing the replacement, and that this two-step interaction was breaking the clear-to-the-right and cascade behaviour above (since the delete and the retype landed as two separate edits, losing the cascade's reference to the value being replaced). Root-caused to overtype not being supported: a code cell now selects its existing character on focus, so typing directly replaces it in one step, matching the two rules above correctly in the common case. Verified with the exact scenario James described (a column reading `2, 3, 6`; changing `3` to `4` clears only that row's deeper codes and leaves the `6` row's own codes untouched) and confirmed a genuine two-step delete-then-retype still cascades correctly too.

### "." padding and description-correspondence gate

Further feedback after trying overtype:

- **Retyping the same character now still applies.** The browser genuinely never fires a change event when a text input's value doesn't actually change (true for both real keystrokes and programmatic fill, confirmed by tracing it directly) — so retyping "." (or any code) to deliberately re-trigger the cascade/padding-fill below was silently doing nothing. Fixed by detecting this exact case in the key handler and applying the same update logic directly, since the normal change event never arrives.
- **"." is the Section 4.4 padding character**, so it's exempt from the ascending-order rule (padding isn't a real sibling code) and, when entered at some level, fills every column to its right with "." too — rather than clearing them to blank as any other code change does. (The exact rightward extent of this fill was corrected below, after James supplied a working file.)
- ~~A real code can only be entered in a column with a corresponding description at that exact level, for that row.~~ **Superseded — see below.** James's working file showed this same-row-same-column reading was wrong: e.g. its first row has a real code at column 2 even though that row's own description is only at column 1.

### Corrected description/code correspondence rule, from James's working file

James attached a real working file (`Milling_Test_Taxonomy_5.json`) and clarified the actual rule, which replaces the same-row check above:

- **Descriptions cascade rightward by at most one column per row.** Looking at the nearest row above with any description, the current row's description can be in the same column, any column to its left (unlimited), or exactly one column to its right — never more than one to the right. Violating this shows a popup: "Descriptions must cascade no more than one column right". This is checked at the moment a description cell goes from empty to non-empty (editing an already-populated one doesn't re-check its column).
- **Track the rightmost description column used anywhere in the taxonomy** (across every row, not just nearby ones) — call it R. In the sample file, descriptions reach column 5 (1-indexed), so R = 5.
- **No code — real or "." padding — can exist to the right of column R.** A real code there is rejected with the existing popup ("There is no corresponding description…"); the "." rightward-fill now stops at R instead of running to the last configured level.

### Popup reliability fix

James reported the invalid-code popup "flashes and disappears" — reliably reproduced: a browser's native `window.alert()` can be silently dismissed by keystrokes the user is still buffering in from typing (e.g. a subsequent Enter reaches the alert as its dismiss action before the user has read it). All validation popups (invalid character, ordering, description-correspondence, description-cascade) now use a custom on-screen dialog instead of `window.alert()`. It captures keyboard focus on itself (not the OK button) and swallows every keystroke while open, so no keystroke — buffered or otherwise — can dismiss it; only an explicit click on OK or the backdrop closes it. Verified directly: typing an invalid character followed immediately by more keystrokes and two Enter presses (simulating a fast typist not noticing the popup) no longer dismisses it.

### Grid-editing refinement batch

James sent a long list of further feedback and suggested splitting it up. The following were done together as one batch of closely-related grid-editing fixes:

- **Keyboard exit from a description cell.** Enter and all arrow keys now always move to the adjacent cell from a description, matching code cells, rather than only when the text caret was already at that edge.
- **Auto-add row at the bottom.** Pressing Enter or ↓ in a description cell on the last row now adds a new row (inheriting the row above's codes, as `+ Add Row` already does) and moves focus into its same column, instead of doing nothing.
- **Corrected code cascade.** Overtyping a code with a *larger* value now sweeps every row below it that's blank or holds a smaller value, stopping at the first row that already holds an equal-or-greater one — rather than only propagating to rows that exactly matched the old value. Clearing a code still only propagates through rows that held the exact value being cleared. "." now cascades down through blank rows too (in addition to its existing rightward fill), stopping at — and never overwriting — the first non-blank cell.
- **Root-caused a real bug this surfaced:** clicking a code cell that already has keyboard focus doesn't re-fire its focus event, so the existing "select on focus" overtype fix didn't reselect the character, and the browser's native `maxLength=1` then silently swallowed the next keystroke before any code ever ran. Fixed by having code cells handle every printable keystroke directly in the key handler instead of relying on the browser's native text-input behaviour at all.
- **Codes must populate left to right.** Entering a code where any column to its left (for that row) is still blank is now rejected: "Code to left is blank, codes must populate from left to right".
- **Single-character enforcement.** A paste or programmatic value longer than one character into a code cell is now rejected with a popup ("Only one character permitted") instead of silently keeping just the last character.
- **Discard-prompt fix.** "New Taxonomy" now only asks to confirm discarding when something has actually changed since the last save (or load) — a `dirty` flag is set on any edit and cleared by a successful save or load.

Verified against a mix of targeted new tests and the full existing regression suite (save/load, case toggle, keyboard navigation, ASCII ordering, description-correspondence, the earlier 2/3/6 boundary scenario) — no regressions. Note: reloading James's own sample file and trying to extend a code further right on rows 3 or 4 now also triggers the new left-to-right rule, since those rows have a deeper description than their populated codes reach — expected given today's new rule, not a bug.

### Deferred as separate follow-up work

James suggested splitting the list further; these three are substantial enough to be their own pieces of work rather than quick fixes. He asked for them in this order: promote/demote, then shift-select-and-delete, then the delimiter wizard.

1. **Optional/multiple delimiters with a setup wizard.** Replacing the single fixed `delimiterAfter` setting with a sequential "Insert delimiter? / after how many columns? / another one?" setup flow, and extending the data model to support zero or more delimiter positions. Also notes wanting more than 8 columns as a future setup option.
2. **Shift-select and delete a range of codes.** Extending the existing shift-click multi-select (already built for description Toggle Case) to code cells, with a way to clear the selected range.
3. **Promote/demote with children** — this is Stage 3's core feature from the original build plan (Section 6.3). Done: right-click a description cell (or a shift/ctrl-extended selection of sibling description cells, reusing the same selection mechanism as Toggle Case) and choose Promote or Demote. Each selected entry moves one column left or right along with every one of its descendant rows (found by scanning forward for rows at a deeper level, stopping at the first row at the same level or shallower). Only the description moves — colour follows automatically since it's a property of the column, never stored per row — and every affected row's codes are blanked, not carried over, per Section 6.3. Blocked, with a popup, in three cases: moving past the leftmost or rightmost column; and moving in a way that would leave the block's new position skipping a level relative to an unmoved neighbour above or below it, reusing the same description-cascade rule that governs typing a description directly. Verified: promoting/demoting a single entry with a child carries the child along and blanks both rows' codes; multi-selecting several siblings and demoting them together moves each with its own descendants; boundary and cascade-violation attempts are correctly blocked with the right message; colour visually follows the new column position.

---

## Stage 2 — Visual Conventions

Makes the grid actually look right and communicate level and type visually. Also folds in backlog items 1, 3, and 4 above (description overflow/indent, code cell width, code column headers), per James's accepted timing.

> Read CLAUDE.md in full. Stage 1 is working. Now build Stage 2: colour coding and case convention, as described in Sections 4.2 and 4.3 of CLAUDE.md.
>
> Apply the fixed, alternating column colours (first code column and first description column share a colour; alternates coloured/uncoloured by level; colour belongs to the column, never the content). Apply the ALL CAPS / Proper Case display convention. Build the case toggle from Section 6.2 — right-click on a single row, or a selected block of rows within one column, never cascading to other columns.
>
> Don't build promote/demote, sorting, insert/delete, validation warnings, undo, comments, or export yet.

---

## Stage 3 — Structural Editing

Lets the user actually build out and rearrange the hierarchy interactively, instead of only typing into fixed rows.

> Read CLAUDE.md in full. Stages 1 and 2 are working. Now build Stage 3: structural editing.
>
> Build insert row (above/below, right-click, Section 6.5) and delete row (with a clear warning if the row has children). Build promote and demote (Section 6.3) — for a single entry and for a selected range, each with its children. Confirm you've implemented the confirmed rule correctly: only the description moves to the new column; the code for every affected row blanks out and is not carried over. Build sort (Section 6.4) — alpha sort on a selected block within one column (not necessarily the whole column), and manual drag-and-drop reordering — both carrying children with their parent.
>
> Don't build validation warnings, undo, comments, or export yet.

---

## Stage 4 — Guidance and Safety

Adds the facilitation behaviour that makes this a guidance tool, not just a grid.

> Read CLAUDE.md in full. Stages 1 through 3 are working. Now build Stage 4: validation, undo, and comments, as described in Section 6.7, 6.8, and 6.9 of CLAUDE.md.
>
> Build the soft warnings (dismissible, never blocking): fewer than five or more than nine items at a level; description length approaching the configured maximum; a level's codes starting at 0 or mixing numeric/alphabetic inconsistently. Separately, build the ASCII ascending-sort rule as a hard, enforced rule, not a dismissible warning — confirm this distinction is implemented correctly, since it's the one rule in this section that isn't optional. Build deep undo across every operation from Stages 1 to 3. Build per-entry comments/notes — a right-click to add/edit, a small on-row indicator, content revealed on hover or click, never cluttering the grid itself.

---

## Stage 5 — Export

Gets data out of the tool.

> Read CLAUDE.md in full. Stages 1 through 4 are working. Now build Stage 5: export, as described in Section 7.
>
> Build CSV export and XLSX export, both as a raw-grid export exactly matching what Section 7 describes — one column per code character (including the delimiter as a literal "-"), one column per description level, no concatenation or padding substitution. The XLSX export should also preserve the column colour-coding and the ALL CAPS / Proper Case formatting as real Excel formatting, so the exported file visually matches the working screen.

---

## After Stage 5

That's the full v1 scope in CLAUDE.md. Section 9 of CLAUDE.md lists what's deliberately not in this version — worth rereading before deciding what comes next.
