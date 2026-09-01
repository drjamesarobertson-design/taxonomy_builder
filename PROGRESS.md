# Taxonomy Builder — Progress Log

A running record of what's been built, round by round, so "where are we?" has a
single answer without scrolling through PR history. `CLAUDE.md` is still the
source of truth for what the tool is *supposed* to do; this file tracks what
actually exists in `main` right now and how it got there.

**Live app:** https://drjamesarobertson-design.github.io/taxonomy_builder/
(auto-deployed by GitHub Actions on every push to `main`)

**Workflow:** each round of feedback is implemented on branch
`claude/review-claude-md-5ktqcm`, tested (build, lint, Playwright), opened as
a PR against `main`, squash-merged, and verified live before moving on.

**Milestone:** James considers Phase 1 complete as of PR #52 (2026-09-01) —
not a hard stop, but a marker in what he sees as one continuous progressive
learning-and-refinement process. Work keeps going the same way; "Phase 2"
just means whatever comes next, not a different process or a rewrite.

---

## Current status (as of PR #66, 2026-09-01)

Stages 1–5 of the original build sequence are complete, plus roughly 40
further rounds of testing feedback. The tool currently supports, in full:

- The core grid — code columns, delimiter columns, description columns,
  colour coding, ALL CAPS/Proper Case, per Section 4.
- Full editing: case toggle, promote/demote (single entry or with children),
  alpha sort, drag/manual reorder, insert/delete row, Move, Copy Rows.
- Code validation: charset, left-to-right population, ASCII ascending order
  (with Override), the "0" soft warning, and a hard cross-block duplicate
  check on the deepest column.
- Undo/redo across all structural and content operations.
- Notes are **not yet implemented** (Section 6.9 — see "Not yet built" below).
- Export: CSV and Excel, in both Discrete Columns and Concatenated modes,
  plus a CSV-only "No Delimiter" variant; export-time "." → "0" padding
  substitution; column collapse/filter carets (level-based on description
  columns, literal "." filter on code columns).
- Save/load as a local JSON project file, with the File System Access API's
  native Save As dialog (remembered export folder) on Chromium, and a plain
  download fallback elsewhere.
- Settings screen to revisit title/purpose/description-length/padding/
  delimiter/code-column-count after creation; right-click Add/Delete Column.
- Create Block / Import Block for moving content between separate taxonomy
  files.
- Field-level help icons (New Taxonomy + Settings) and right-click menu help,
  both driven by `public/help-text.csv` (editable without a rebuild), plus a
  collapsible "Worksheet Guidance" panel.
- A Library sidebar (left-hand, collapsible) for saving multiple taxonomies
  under eight fixed headings, independent of file-based Save/Load: "Add to
  Library" (prompts for a heading, or updates the linked entry in place),
  right-click Move to Work Area / Edit Title / Move Up / Move Down / Move
  to Category… / Remove from Library, and drag-and-drop reordering within
  or across headings (both the right-click and drag mechanisms work side
  by side). Persisted in this browser's own IndexedDB — per-browser, not a
  file, and not synced anywhere.
- A "Code Restrictions" dropdown at the top of the work area, narrowing
  real codes to Numeric Only / Alpha Numeric with All Alpha / Alpha Numeric
  with Upper Case Alpha Only / Alpha Upper Case Only / Alpha Both Cases
  Only, on top of the fixed global charset; the padding character is
  always exempt.
- "Import CSV": brings in a taxonomy already in the same shape this app's
  own Discrete Columns CSV export produces — level count, delimiter
  positions, and suffix columns inferred from the file's own structure,
  with a short confirm step for title/table name/purpose/max description
  length (the only things a CSV can't carry).
- Grid's own right-click "Export Block" on a selected row range (alongside
  the toolbar's whole-table Create Block), with an "Include Suffix? Y/N"
  choice.
- A suffix export-mode choice on CSV/Excel export — Concatenate (folds
  suffix values onto the description, dropping their separate columns) or
  Right Align (today's default, suffixes stay in their own column(s)) —
  only asked when the taxonomy actually has suffix columns.
- **Lock Taxonomy**: once a taxonomy has gone live in an ERP with real
  transactions against its codes, "Lock Taxonomy" marks every row then in
  the table `protected` and saves the file; "Unlock Taxonomy" lifts
  enforcement (with a strong warning) without ever clearing which rows were
  protected, so a later re-lock still knows what's historical. Protected
  rows are greyed out in the grid (persists across an unlock) and show a
  padlock icon in the Library sidebar. While locked: editing or deleting a
  protected row's own code/description is blocked with an explicit
  warning (also covers Delete Codes, Clear Codes and Start Again, Paste
  Codes, and Promote/Demote — anything else that can overwrite or blank a
  protected row's code); Toggle Case, Alpha Sort, and Move (the manual-
  reorder mechanism) are also blocked on a protected row, since reordering
  or recasing one risks the same kind of integrity loss; new rows can only
  be inserted where a real code gap exists between two neighbours (hard
  block, no override) — Import Block's own insertion point goes through
  the same check; "Mark as Delete" (right-click a description) prefixes
  it with "XXX " as the sanctioned way to retire a protected entry instead
  of deleting it; and CSV Import (which replaces the whole table outside
  any per-cell guard) is blocked outright.

### Not yet built
- Section 6.9 comments/notes on entries (no on-row indicator or add/edit UI
  yet).
- Section 9's explicitly-deferred items (concatenated/padded ERP-ready export
  with indent substitution applied, GL account type tagging, multi-taxonomy
  library management, multi-user collaboration, intelligent code suggestion,
  live-posting reporting) — all correctly still out of scope for this
  version.

### Known open questions / flagged interpretations
- The collapse/filter caret's two different behaviours (description
  columns collapse by level; code columns filter literally on the padding
  character) were flagged and confirmed correct by James in PR #49.
- CSV import's "Expected 1 description columns... found 0" bug is
  **resolved** (PR #60) — root-caused directly against James's actual
  uploaded file rather than a pasted-table guess: the real file has no
  header row at all (data starts on line 1) and uses two blank spacer
  columns, not one. Verified end-to-end against the real 1840-row file.
- Import Block "2 columns to the right" bug is **resolved** (PR #62) —
  root-caused directly against James's actual block file
  (`Test 16 Milling Asset Range Selection Block v1.01.json`), which the
  three earlier synthetic reproduction attempts had missed: a block cut
  from partway down a table (its shallowest entry at level 2, not level 0)
  carries each entry's FULL ancestor path from the *source* table's own
  root (`buildBlock`: `row.codes.slice(0, level + 1)`), not a path
  relative to the block's own top entry. `finalizeImport` placed
  `entry.codes[0]` straight onto the anchor column, so a block whose
  shallowest entry was itself two levels deep landed two columns to the
  right of the anchor — and the required-levels calculation, using that
  same absolute depth, could also demand columns the import didn't
  actually need. Fixed by computing `baseLevel` — the shallowest entry's
  own depth — and stripping every entry's ancestor prefix above it before
  placing codes/descriptions relative to the anchor. Verified with a
  Playwright test importing the real block file at the exact anchor James
  described (right-click on a level-3 code cell showing "1"), into a
  taxonomy with a configured suffix column so the previously-untested
  suffix1Source dialog branch is exercised too.
- CSV import "columns 6 and 7 filled with '.'" report turned out **not to
  be a bug** — checked directly against James's actual Milling CSV: the
  file genuinely has 7 code-column levels (3 columns, a delimiter, then 4
  more), and columns 6 and 7 hold real, non-padding codes in 530 and 172
  of the 1840 rows respectively, with matching real description text —
  not artifacts of parsing. The `.` seen elsewhere is padding already
  present in the source file itself for the (majority of) rows that don't
  go that deep, exactly per Section 4.4's padding convention. Confirmed
  with James; no code change needed.
- **Lock Taxonomy scope decisions**, confirmed with James before building
  (PR #64): protection is per-row, snapshotted at each Lock (not
  whole-file-forever) — a row added after unlocking is only protected once
  a *later* Lock sweeps it in; Delete Row is fully blocked on a protected
  row rather than degraded to some partial behaviour (Mark as Delete is
  the only way to retire one); the gap-only insert rule applies only while
  locked, not to unlocked taxonomies generally; Mark as Delete prefixes
  ("XXX " + description) rather than replacing or suffixing.
- **Lock Taxonomy follow-up (PR #66)**: James confirmed the gaps flagged
  after the initial round did matter — Toggle Case, Alpha Sort, and Move
  are now all blocked on a protected row too (a new "Reordering an
  existing entry protected by Lock Taxonomy..." message covers Alpha Sort
  and Move, since they don't touch the code/description text itself but
  can still break the ascending-code-order invariant by repositioning a
  protected row relative to its siblings), and Import Block's insertion
  point now shares Insert Row's gap-only check. Fixed a UX bug found while
  testing this: the new guards were leaving the right-click context menu
  open behind the warning dialog — now closed immediately, matching the
  rest of the app. Still intentionally unguarded: Replicate Codes
  Above/Below (can't actually overwrite a protected row's real code
  anyway — they only ever fill genuinely blank cells) and suffix column
  values on a protected row (only code/description were named as
  protected) — worth a follow-up if either turns out to matter in
  practice.

---

## History

### Stage 1 — Foundation and data model (PR #1)
Core grid (code/delimiter/description columns, 8 levels default), single-
character code cells, free-text description cells, create-taxonomy flow
(title/table name/purpose/max description length), save/load as local JSON.

### Stage 2 — Visual conventions (PR #2–#4)
Colour coding fixed to column position (Section 4.2), case toggle
(single row or selection, never cascading), monospace font, description
overflow into a dedicated column, code fill-down on entry, GitHub Pages
auto-deploy workflow.

### Code validation & entry rules (PR #5–#8)
Charset restriction (`.`, 0–9, a–z, A–Z), ASCII ascending-order enforcement
scoped to sibling groups, clear-codes-to-the-right on change, overtype
support, "." as the padding character (exempt from ordering, fills
rightward), the code/description correspondence gate corrected to a global
rightmost-column rule (not a same-row/same-column rule), and custom on-screen
validation dialogs (replacing native `alert()`, which buffered keystrokes
could dismiss unread).

### Grid editing fixes (PR #9)
Cascade correctness for overtyping, left-to-right code population, paste
rejection on code cells, dirty-flag-gated discard prompt.

### Stage 3 — Promote/Demote (PR #10–#11)
Promote/Demote with descendants, colour following the column not the
content, code blanking on move, shift-select and delete for code ranges.

### Delimiter wizard, row insert/delete, branding (PR #12–#23)
Configurable/multiple code delimiters; free-text max-description-length
field; new taxonomy starts with one row; "." padding cascade fixed to
cascade per-column; promote/demote blanks only the moved-to column; Insert
Row Above/Below and Delete Row (with children warning); sign-on screen
rebrand and dark theme; "Replicate Codes Above"; promote/demote's
entry-only-vs-with-children choice; drag-select bulk row insert; click-based
Move; the ERP Doctor logo (SVG, then the real uploaded asset).

### Undo/redo, multi-column replicate, code override (PR #22, #24)
Full undo/redo (Section 6.8) with keystroke coalescing; multi-column
Replicate Codes Above via rectangular drag-select; an Override option on the
ascending-order hard rule; Insert Row duplicating the row-above's codes;
reliability fix for fast mouse drags skipping narrow code cells.

### Export (PR #25–#31)
CSV and Excel export, Discrete Columns mode (Section 7) then Concatenated
mode (Section 9); export-folder memory via the File System Access API;
configurable Concatenated-export indent character; versioned filenames
(" v1.NN"); fixes for trailing padding survival, XLSX blank-cell overflow,
narrow per-column XLSX widths, and one-description-per-row enforcement.

### Suffix columns, dark theme, sorting (PR #32–#34)
Alpha Sort actually wired up; configurable suffix columns (constant or
editable, up to 6); dark theme applied to the working screen's chrome (grid
itself stays white); duplicate-suffix-value warning; fix for invisible
popup/dialog text caused by the dark-theme rollout.

### Round-10 through round-15 feedback (PR #35–#37)
Padding-preservation fix (real codes no longer clear "." to their right);
Excel-export hang fix (folder-permission rejection now falls back to plain
download); Concatenated export delimiter fix; F2/Delete/arrow-key Excel-style
editing on description cells; suffix duplicate dialog becomes
Accept/Edit/Cancel; row-number column; sticky header; a Settings screen for
revisiting setup after creation.

### Round-16 through round-18 feedback (PR #38–#40)
Home-page dropdown legibility fix; reverted an over-eager padding-boundary
change back to the description-range bound; "." blocked as a left-neighbour
for a real code; Save confirmation flash; Load-from-File moved to the top of
the home screen; one-time capitalization notice (with a Caps-Lock-off
suggestion); blank-code-range warning before Save/Export.

### Create Block / Import Block (PR #41–#43)
Cross-taxonomy content transfer: Create Block exports the working table as a
self-describing JSON block; Import Block anchors on a code cell and inserts,
inheriting left-hand codes and handling suffix concatenation/right-justify
choices, including a later refinement letting Suffix 1 either be typed fresh
or carried over from the source block.

### Settings expansion, Add/Delete Column, help system (PR #44–#47)
Settings gains Number of Code Columns and delimiter-position editing;
right-click Add Column and its mirror, Delete Column; context menus that
keep themselves on-screen; field-level help icons driven by
`public/help-text.csv` (editable with no rebuild); right-click menu Help
items; a collapsible "Worksheet Guidance" panel; the padding character fixed
to "." in storage, with a one-off "." → "0" export-time substitution choice
replacing the old taxonomy-wide setting; an Insert-Row no-gap warning.

### Round-19 feedback: CSV Save-As fix, duplicate-code check, column filters (PR #48–#49)
- Export to CSV now shows the native Save As dialog again (a malformed MIME
  type string was making it silently fall back to a plain download).
- The deepest code column hard-blocks two array-adjacent rows sharing the
  same leaf code with nothing real between them, regardless of parent —
  narrower than, and independent of, the existing sibling-scoped
  ascending-order check.
- "Clear Codes and Start Again" on the code-cell right-click menu, gated
  behind a Confirm dialog.
- CSV-only "No Delimiter" export variant (Discrete and Concatenated).
- A collapse/filter caret under every code and description column header —
  description columns collapse by hierarchy level; code columns filter
  literally on rows padded with "." in that exact column (confirmed as the
  correct behaviour after an initial round where both used the level-based
  rule).

### Library sidebar (PR #51)
A left-hand Library for saving and retrieving taxonomies, kept under eight
fixed headings (General Ledger / Item and Product / Customer / Personnel /
Asset / Projects / Plant / General-Other Related). "Add to Library" prompts
for a heading the first time, then updates that same entry in place on
later clicks; entries are listed by title with right-click Move to Work
Area, Edit Title, and Remove from Library, plus drag-and-drop reordering
within or across headings. This is genuinely outside CLAUDE.md's original
v1 scope (Section 9 lists multi-taxonomy library management as a later
phase) — built now at James's explicit request. Stored client-side in
IndexedDB, separate from the file-based save/export the spec describes.

### Code Restrictions, CSV import, scoped Export Block, suffix export mode (PR #54)
- A "Code Restrictions" dropdown at the top of the work area narrows real
  codes beyond the fixed global charset, enforced the same way as that
  charset rule (a hard block with a clear message, no override); the
  padding character is always exempt.
- "Import CSV" reads a taxonomy already in this app's own Discrete Columns
  CSV shape — level count, delimiter positions, and suffix columns are
  inferred from the file's header/structure — then asks only for what a
  CSV can't carry (title/table name/purpose/max description length).
  Note: this originally required the exact column layout this app's own
  CSV export produces (including a blank spacer column between the code
  and description blocks) — loosened in PR #56 to make that spacer column
  optional, since James's real files don't have one. Padding character
  always defaults to "." on import (not inferred), and suffix mode always
  defaults to "editable" since that can't be reliably inferred from
  static data.
- Grid's own right-click "Export Block" exports just a selected row range
  as a block, alongside the toolbar's existing whole-table "Create Block".
- CSV/Excel export now asks whether to concatenate suffix values onto the
  description or keep them right-aligned in their own column(s), only when
  the taxonomy has suffix columns configured.

### Export Block range fix, Library move/reorder, looser CSV import (PR #56)
- Export Block's row-range selection was actually broken: dragging or
  shift-clicking from a code cell across to a description cell (PR #54's
  own described gesture) silently failed to extend the selection, since
  the drag/shift-click logic required the cell kind to match throughout,
  and right-clicking a different-kind cell afterward reset the selection
  to a single cell. Fixed so the row range extends across a kind change;
  same-kind selections are unaffected.
- Library: right-click "Move Up" / "Move Down" / "Move to Category…",
  alongside the existing drag-and-drop, for reordering/recategorising
  without needing to drag.
- CSV import: the blank spacer column between the code and description
  blocks is now optional (see the corrected PR #54 note above) — James's
  real files are just code columns immediately followed by description
  columns, adjacent, nothing in between.
- Fixed a dialog-stacking bug found while building the suffix-mode choice:
  the CSV/Excel format-choice dialog stayed mounted underneath later-step
  dialogs (its state was still needed for the eventual export call),
  risking a mis-click once a later dialog's button label happened to
  substring-match one of its own.

### Library drop fix, cross-kind highlight fix, CSV overwrite warning, error colour (PR #58)
- Library drag-and-drop worked in automated testing but not in a real
  browser: `dragstart` never called `dataTransfer.setData`, which some
  browsers (Firefox in particular) require before firing a `drop` event on
  any target — James could drag but nothing ever dropped. Fixed.
- Export Block's cross-kind selection (PR #56) extended the row range
  correctly but never highlighted it properly — only the anchor's own
  column lit up, and right-clicking a different, unhighlighted-but-
  actually-selected column collapsed the range back to one cell. A
  cross-kind selection now highlights every code and description column
  for the affected rows, and stays that way regardless of which column is
  right-clicked next.
- Import CSV now warns "This will clear the existing table content —
  proceed?" before opening the file picker, whenever the current taxonomy
  has any real content (it always fully replaces the working project).
- The CSV-import/Load-from-File error banner was dark red text directly on
  the app's dark blue background — barely legible. Now a solid bright
  yellow box with dark text.

### CSV import fixed for real, headerless files (PR #60)
Root-caused directly against the actual file James uploaded (1840 rows,
his Milling Master Chart) rather than guessing further from a pasted
table. The real cause: his file has no header row at all — data starts on
line 1 — and uses two blank spacer columns between the code and
description blocks (this app's own export uses one). The parser rewrite
tries the original header-based read first (unchanged, still handles this
app's own export), then falls back to a data-driven detection that
identifies code/delimiter columns from their own content, skips any
number of blank filler columns rather than exactly one, and tolerates a
small minority of malformed rows (90% threshold per column) rather than
requiring unanimous agreement — the real file has 9 rows out of 1840
missing a trailing padding character. Verified end-to-end against the
real file: all 1840 rows import with the correct 7 levels and delimiter
position.

### Lock Taxonomy (PR #64)
New feature, not a bug fix: once a taxonomy goes live in an ERP with real
transactions posted against its codes, further free-form editing risks
corrupting that history. "Lock Taxonomy" (toolbar button) marks every row
then in the table `protected` and saves the file; "Unlock Taxonomy" lifts
enforcement, with the exact warning text James specified, but never clears
which rows were protected — a later re-lock still knows what's historical.
Protected rows grey out in the grid and show a padlock icon in the Library
sidebar. While locked: editing/deleting a protected row's own code or
description is blocked (exact warning text specified, reused across Delete
Codes / Clear Codes and Start Again / Paste Codes / Promote-Demote, since
all of them can overwrite or blank a protected row's code just as directly
as typing into it); new rows can only be inserted where a real code gap
exists between two neighbours while locked (a hard block, unlike the
existing soft "no gap" warning used when unlocked); "Mark as Delete"
(right-click a description) prefixes it with "XXX " as the sanctioned way
to retire a protected entry; CSV Import is blocked outright while locked
(it replaces the whole table and doesn't go through any per-cell guard).
`locked`/`protected` round-trip through the saved JSON file. See "Known
open questions" for the scope decisions confirmed with James up front and
the handful of related operations (Toggle Case, Alpha Sort, drag reorder,
Import Block's insertion point, suffix values) intentionally left
unguarded this round.

### Lock Taxonomy follow-up: reorder/recase guards, Import Block gap check (PR #66)
James's answer to the "known gaps" flagged in PR #64: yes, Toggle Case,
Alpha Sort, and Move should all be blocked on a protected row too, and
Import Block's insertion needs the same gap check Insert Row got. Alpha
Sort and Move reuse a new "Reordering an existing entry protected by Lock
Taxonomy..." message (repositioning a protected row can silently break
ascending-code-order relative to its siblings even though its own code
never changes); Toggle Case reuses the existing description-corruption
message. Import Block inserts right at its anchor, pushing the anchor row
down — structurally identical to Insert Row's own "wedge between two
neighbours" — so it now runs the same `hasCodeGap` check before proceeding.
Along the way, found and fixed a UX bug the new guards introduced: blocking
Toggle Case/Alpha Sort/Move left the right-click context menu open behind
the warning dialog; all three now close it immediately, matching every
other menu action in the app.

---

*Maintained alongside each PR — update the "Current status" section and add
a new history entry whenever a round ships.*
