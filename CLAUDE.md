# Taxonomy Builder — Project Specification

This file is persistent project context for Claude Code. It stays in place for the whole project and should be read at the start of every session. It reflects the full v1.1 specification, agreed and clarified with the project owner (James) across a detailed review process, including direct examination of two real example spreadsheets he supplied.

**Read this file in full before writing any code.** Where a build-sequence prompt (given separately, session by session) asks for a specific piece of this system, everything else here still matters as context — later pieces depend on the data model and conventions established here.

---

## 1. Purpose and Context

Taxonomy Builder is a general-purpose facilitation tool for building structured hierarchical taxonomies — lists of plain-English descriptive terms, organised into a coded hierarchy — for use as master data in any software application. Typical examples: a Chart of Accounts, Product Class, Asset Class, Employee Class, Division, Location, or Reason Codes.

The tool is a **facilitation aid, not an automated generator**. It exists to guide a user, or a small group of stakeholders, through a structured thinking process — prompting, warning, and assisting — while the actual judgement about what the taxonomy should contain remains entirely theirs.

This is a v1 / proof-of-concept build. The goal at this stage is to establish the core, single-user, single-taxonomy editing utility. Several capabilities are explicitly deferred to later phases — see Section 9.

---

## 2. Technology Approach

Build this as a **standalone, browser-based web application** — not an Excel add-in, macro, or template.

- **Stack:** React with TypeScript. A purpose-built grid component rather than a generic spreadsheet library — the requirements here (single-character code cells, columns with fixed independent colouring, level-based description columns, promote/demote between columns) are specific enough that a generic spreadsheet library's assumptions would likely fight against them more than help.
- **No backend or database required for v1.** The application runs entirely client-side.
- Taxonomies are saved and opened as local project files (Section 8), not stored server-side.

---

## 3. Core Concept (Design Philosophy)

A taxonomy is a structured hierarchy of plain-English descriptive terms describing a physical body of knowledge. A well-designed taxonomy holds between five and nine items at every level, each divided into between five and nine sub-items, nested down to the finest practical level of detail — such that it is never necessary to analyse the contents of a posting-level code; totals are always simply added up.

Codes are allocated only once the English-language hierarchy is well advanced, and may be deleted and re-prototyped repeatedly before that point. The code exactly follows the structure of the descriptions: for each level, the code increments by one or more values as you move through the sibling entries at that level.

---

## 4. Data Model

This is confirmed directly against two real reference spreadsheets supplied during specification (a corrected example, "Milling Master Chart Reference v1.1"). Treat this section as ground truth for the data model.

### 4.1 The Grid

- Each row represents one entry — one node — in the taxonomy tree.
- A configurable number of **single-character code columns** (default 8, expandable — see 6.1), one per hierarchy level. Each cell holds exactly one character: a digit, a letter, or the padding character (`.` by default; see 4.4).
- At a configurable position (default: after every third code column), a fixed, non-editable **delimiter column** displays `-`. This is part of the column layout itself, not typed per row.
- A matching set of **description columns**, one per hierarchy level, positioned after the code block. Only the column matching a row's deepest occupied level holds text — every other description column on that row is empty.
- A row's "level" is defined by the position of its deepest populated code column, which corresponds exactly to the position of its populated description column.

Example row shape (7 levels, delimiter after level 3), matching the reference file:

```
Code columns:        [1][1][1][-][1][.][.] 
Description columns: [ ][ ][ ][   Turnover Auto Industrial   ][ ][ ]
                       (text appears only in the column matching the deepest populated code column — here, level 4)
```

### 4.2 Colour Coding

Colour is a property of the **column**, not of any row or any piece of content.

- The first code column and the first description column share the same colour.
- Colouring alternates by level: level 1 coloured, level 2 uncoloured, level 3 coloured, level 4 uncoloured, and so on.
- Each coloured level uses its own distinct **light** colour — not a single repeated colour — cycling through a small palette (the reference example used yellow, green, and pink for levels 1, 3, and 5 respectively). Exact hues are not important, only that they are light enough for text to stay easily readable, and distinct enough to tell apart.
- Delimiter columns are unstyled (or a neutral grey), separate from this alternation.
- **Critically: colour belongs to the column position and never moves with content.** When an entry is promoted or demoted (4.3 / 6.3), the moved text simply takes on whatever colour is already fixed to its destination column.

### 4.3 Case Convention

Entries that will have child entries are shown in **ALL CAPS** and are structural — never used for posting. The deepest populated entry in any branch is shown in **Proper Case**, and represents an actual posting-level item.

### 4.4 Coding Conventions

- Codes may be numeric, alphabetic, or alpha-numeric, chosen per level based on the content — for example, a mnemonic letter may be used where it aids recognition.
- Gap coding (1, 3, 5…) is encouraged where practical, to leave room for later insertions — though with fewer than 10 items at a level using pure numeric codes, gap coding is often impractical.
- Codes ideally start at 1 rather than 0 — this is guidance, not a hard rule (see 6.7).
- The padding character is `.` by default. Some ERPs do not accept `.` in a code field, in which case `0` should be used instead — this should be a per-taxonomy configurable setting, defaulting to `.`.
- **Hard rule, confirmed by James:** within any column, codes must always sort in ascending order according to their ASCII value, top to bottom. This is enforced, not a soft warning — the software should actively prevent or immediately flag a code entry that would break ascending ASCII order within its column, distinct from the soft warnings in Section 6.7.

---

## 5. Facilitation Workflow

Guide a first-time user through the following sequence. This is a facilitation aid — the software provides structure and prompts; the user (or group of stakeholders) supplies the actual judgement.

1. Capture the title of the hierarchy, a short table name, and a description of its purpose.
2. Prompt the user to list between five and nine major categories that make up the top level of the hierarchy, entered into the first description column. Encourage sequencing with the most core/central items first and the most general items last, since this sequence becomes the default report and dashboard order.
3. For each top-level entry that needs to be broken down further, repeat the same process one level deeper, and continue recursively until the hierarchy is judged complete.
4. Entries with children are marked ALL CAPS; the deepest entry in each branch is Proper Case (Section 4.3).
5. Once the English-language structure feels complete, move to coding: allocate a code character to each entry, starting at the top level, following the conventions in Section 4.4.
6. Where an information domain is open-ended and cannot be exhaustively listed, the last entry at that level should be "Other [category name]", conventionally coded last (e.g. 9 or z).

---

## 6. Feature Requirements

### 6.1 Grid and Cell Editing
- Default depth of 8 levels (8 code columns, 8 matching description columns, delimiter positioned per 4.1). The user can add further levels by adding additional column pairs to the right, at any time.
- Each code cell accepts exactly one character.
- Each description cell accepts free text, validated against the length rule in 6.7.

### 6.2 Case Toggle
- Right-click option "Toggle Case" — switches the selected entry between Proper Case and ALL CAPS.
- Also operates on a selected series of rows within the same column (i.e. a set of sibling entries at one level) — applying the toggle to each selected row independently.
- **Case toggle never cascades to child entries in other columns.** It is strictly a single-column operation, on one row or a selected block of rows at that same level.

### 6.3 Promote and Demote
- Right-click or toolbar actions "Promote" and "Demote" — move a selected entry, and all of its descendant rows, one column left (promote) or one column right (demote).
- **Only the description content moves with the entry.** The code for every affected row — the selected entry and all of its descendants, since all of them shift column — is **blanked, not carried over**. The user must recode these entries manually at their new level. This is deliberate: a code that was valid at the old level has no guaranteed validity at the new one.
- Must also operate on a selected range of entries at once (e.g. several top-level items selected together), each carrying its own children and following the same rule: descriptions move, codes blank.
- Colour never moves with the content (Section 4.2) — after a promote or demote, moved text is displayed in whatever colour already belongs to its new column.

### 6.4 Sort
- Alpha sort: select a block of sibling entries within a single column — this may be the whole column or any contiguous subset of it — and sort just that selected block by description text, without affecting rows outside the selection. Each sorted entry carries its children with it.
- Manual sort: drag-and-drop reordering of any entry (with its children) to a new position among its siblings, at any level.

### 6.5 Row Management
- Right-click "Insert Row Above" / "Insert Row Below" — inserts a new, empty entry at the correct hierarchy position. This replaces the older manual-spreadsheet convention of leaving blank rows between entries to allow later insertion.
- Right-click "Delete Row" — deletes the entry. If the entry has children, warn clearly that its children will be deleted with it before proceeding.

### 6.6 Colour Coding
- Implemented exactly as specified in Section 4.2 — a persistent, column-level visual property, applied consistently across the working grid.

### 6.7 Validation and Warnings

Soft warnings (inform, never block — the user's judgement always overrides the software's guidance):
- **Items per level:** warn if a parent entry has fewer than five or more than nine direct children, but allow the user to proceed regardless.
- **Description length:** each taxonomy has a configurable "Maximum ERP Description Field Length" setting, captured when the taxonomy is created. Warn if an entry's description length exceeds this maximum minus (level number − 1) — reserving space for the one-character-per-level indent padding that will be applied when descriptions are eventually concatenated (a later-phase feature — Section 9), even though that padding is not applied in this version.
- **Code start value:** gently flag a level whose codes start at 0 rather than 1, or that mixes numeric and alphabetic codes inconsistently with the rest of the taxonomy.

Hard rule (enforced, not a warning):
- **Code sort order:** within any column, codes must always sort in ascending order according to their ASCII value, top to bottom. This is a structural requirement — the software should prevent or immediately flag entry of a code that would break ascending ASCII order within its column.

### 6.8 Undo
- Deep undo history across all structural and content operations — edits, promote/demote, sort, insert, delete, case toggle. Not capped at a small fixed number of steps.

### 6.9 Comments and Notes
- Each entry may carry an optional note. Add/edit via a right-click option; display a small, unobtrusive indicator on any row that has a note, revealing the note's content on hover or click — the working grid itself should never look cluttered by this.

---

## 7. Export

At this stage, export is a **raw-grid export** — no concatenation, padding-substitution, or single combined code/description column is generated. That logic is explicitly deferred (Section 9).

- **CSV export:** the grid exactly as it appears on screen — one column per code-character position (including the delimiter, exported as a literal `-`), followed by one column per description level.
- **XLSX export:** the same raw-grid content, additionally preserving the column colour-coding and the ALL CAPS / Proper Case formatting as real Excel cell formatting, so the exported file visually matches the working view.

---

## 8. Persistence

At this stage, each taxonomy is a standalone project — there is no library or dashboard for managing multiple taxonomies (that is a later-phase feature — Section 9).

- Save and open taxonomies as a local project file, in a format that preserves full fidelity — grid content, notes/comments, and the taxonomy's configured settings (maximum description length, delimiter position, padding character).
- A taxonomy's title, table name, and purpose description (captured in Section 5, step 1) are stored as part of the project file.

---

## 9. Explicitly Out of Scope for This Version

Noting these here so they are not accidentally built prematurely, and so the later-phase roadmap is visible:

1. Generating a concatenated, padded, delimited "final" code and a concatenated, indent-padded "final" description per posting-level entry, ready for direct ERP import.
2. Direct posting or integration with a live ERP database.
3. General Ledger account classification / type tagging (Income, Expense, Asset, Liability, etc.) and any related summarisation or concatenation logic.
4. Multi-taxonomy library management — maintaining a related set of taxonomies (for example, Divisions, Locations, Functions and Asset Class all interacting for a Cubic Business Model©), potentially running to dozens of tables.
5. Multi-user collaboration, concurrent editing, or in-tool stakeholder review workflows.
6. Automatic or intelligent code suggestion or generation.
7. Reporting against live transactional or posting data (for example, listing every account currently posted against an "Other" catch-all code).

---

## 10. Overall Acceptance Criteria

This version is complete when a user can, without leaving the tool:

1. Create a new taxonomy, naming it and setting its maximum description field length.
2. Build a multi-level hierarchy by typing descriptions and single-character codes directly into the grid, with the delimiter column appearing automatically at the configured position.
3. See ALL CAPS applied to structural entries and Proper Case to posting-level entries, and toggle either, for a single entry or a selected series of rows within the same column, via right-click.
4. Promote or demote a single entry with its children, and a selected range of entries, one level left or right, and see the description move to its new column while the code for every affected row blanks out for manual recoding.
5. Sort a selected block of sibling entries — whether the whole column or a subset of it — alphabetically by description, or manually reorder them by drag-and-drop, in both cases carrying children along with their parent.
6. Insert a new row at any point via right-click, without needing to pre-leave blank rows.
7. Add a note to any entry and see a discreet on-row indicator, without the note text cluttering the grid.
8. Receive a clear, dismissible soft warning when a level has fewer than five or more than nine entries, or when a description approaches its configured maximum length — remaining free to proceed regardless.
9. Be prevented from (or immediately warned on) entering a code that would break ascending ASCII sort order within its column — this one is enforced, not dismissible.
10. Undo a meaningful sequence of prior actions, not just the last two or three.
11. Save the taxonomy to a project file and reopen it later with everything intact, and export the current grid to both CSV and XLSX, matching the on-screen layout and formatting.
