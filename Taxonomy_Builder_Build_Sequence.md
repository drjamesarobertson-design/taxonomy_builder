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

## Stage 2 — Visual Conventions

Makes the grid actually look right and communicate level and type visually.

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
