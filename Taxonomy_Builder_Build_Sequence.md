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
