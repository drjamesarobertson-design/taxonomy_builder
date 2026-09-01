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

## Current status (as of PR #76, 2026-09-01)

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
- A post-sign-on landing menu (`WorkflowMenu.tsx`): "Create a New Taxonomy"
  with six starting points (Simple / Intermediate / Advanced Complexity
  Taxonomy, Chart of Accounts, Item Master, Highly Experienced User — No
  Guidance) and "Work on an Existing Taxonomy" (Load from File / Import
  CSV / Library). Five of the six levels (all but Simple Taxonomy) still
  open today's same taxonomy setup screen with a "Creating a `<level>`"
  label and no further guidance — their guided workflows remain
  not-yet-built follow-up work (see "Not yet built"). Also: a larger
  header logo and a "Taxonomy Builder by the ERP Doctor James A Robertson
  and Associates Limited" tagline on the sign-on screens.
- **Simple Taxonomy guided wizard** (`SimpleTaxonomySetup.tsx`,
  `GuidanceBanner.tsx`, `guidance.ts`): choosing "Simple Taxonomy" opens a
  trimmed setup screen (title, table name, purpose, max description length
  only — every structural setting defaults silently until the coding stage
  needs it) and starts a three-stage wizard. **Headings**: one description
  column, all code columns hidden; a live heading count; "Next Step" warns
  (with a positive "Continue Anyway" click required, not a dismissible
  notice) if outside 5–9. **Sub-Items**: a second description column is
  revealed (code columns stay hidden); any heading may stay flat — only a
  *non-zero* out-of-range child count triggers the same override-required
  warning; a heading's first child is auto-capped to ALL CAPS as it's
  typed. **Coding**: code columns are revealed to exactly the depth
  actually used, then Numeric vs. Alpha is asked, then — a deliberate,
  scoped exception to Section 9's "no automatic code generation" that
  James explicitly asked for ("please ignore previous constraints, we are
  now pushing the boundaries to create an increasingly intelligent
  application"), confined to this wizard's coding stage — an optional
  mnemonic-code suggestion (first usable letter of each description, per
  sibling group) is pre-filled directly into the grid; suggested codes are
  ordinary, fully-editable cells from that point on, normal overtype and
  validation, nothing special once written. "Exit Guidance" drops out to
  full unrestricted editing at any stage. The other four guided levels
  (Intermediate/Advanced/Chart of Accounts/Item Master) still open today's
  ungated setup screen — not yet built.
- A simple email/password sign-on gate (`Login.tsx`/`auth.ts`), shown
  before anything else: checks a salted SHA-256 hash (via the browser's
  built-in `crypto.subtle`), remembers a successful login in this
  browser's `localStorage` (Log Out button clears it), and points a
  forgotten password at emailing James rather than an automated reset
  (there's no backend to send email or manage tokens). Explicitly a speed
  bump against casual access, not real security — see "Known open
  questions" for why that's an inherent limit of a backend-less static
  app, not a shortcut taken here.
- Session autosave (`storage.ts`): the open taxonomy is written to a
  single `localStorage` slot on every change, independent of sign-in
  state. A "Back to Menu" toolbar button returns to the landing menu
  without discarding it, and "Resume Work in Progress" there brings it
  straight back — covering both a same-tab log-out/log-in (where it's
  actually unnecessary, since `project` state survives that untouched
  anyway) and a real reload/browser-restart (where it's the only way
  back).

### Not yet built
- **Guided, step-by-step taxonomy-building workflows for the remaining
  four levels** (Intermediate / Advanced Complexity Taxonomy, Chart of
  Accounts, Item Master — "Highly Experienced User" is intentionally just
  today's ungated grid). Simple Taxonomy's wizard shipped in PR #76 (see
  "Current status" and the History entry below) and was built as a
  reusable stage-machine shape (`settings.guidance = { level, stage }`
  driving column visibility and a "Next Step" banner) that the other
  levels can plug their own stage definitions into — CoA and Item Master
  would mostly differ in their stage *prompts* (e.g. CoA's first stage
  plausibly being an account-type choice) rather than needing new
  mechanics. James will give more detailed per-level guidance before this
  gets built.
- **Scheduled autosave-to-a-real-file** (distinct from the always-on,
  invisible `localStorage` autosave already built): James asked whether a
  literal "save to file every N minutes" is needed. Flagged back to him
  that `showSaveFilePicker()` can only run from a user gesture, so a
  timer-triggered version would either interrupt with a native save dialog
  every interval or silently pile up a new downloaded file in Downloads
  every interval — there's no way to keep one file silently up to date on
  disk. Awaiting his answer on whether to build the "repeated download"
  version anyway, given the continuous `localStorage` autosave already
  covers data loss.
- **Voice-to-text input for descriptions**: James asked purely for
  information (not a build request). Answered: the Web Speech API only
  works in Chrome/Edge (no Firefox/Safari), and Chrome's implementation
  sends audio to Google's servers for transcription — it would be the
  first feature in the app to transmit any data externally. No action
  taken pending a decision from James.
- **A larger, crisper logo with a genuinely transparent background.**
  James pasted a bigger version of the logo inline in chat, but it didn't
  come through as an attachable file — there's no real pixel data to
  process yet. (The existing small logo asset already has a transparent
  background — it was just scaled up in PR #68 as a stopgap. Note for
  next time: an earlier round of this project already tried recreating
  this logo as hand-drawn SVG shapes and James replaced it with his real
  logo file afterward, so don't repeat that — wait for the real file.)
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
- **Guided-workflow design commentary (PR #68 round) — superseded by the
  actual Simple Taxonomy build in PR #76.** The original commentary's
  suggested shape (an explicit stored `settings.guidance = { level,
  stage }`, column visibility driven by the stage rather than mutating
  `numLevels` structurally, an explicit "Next Step" action in a guidance
  banner, per-level "stage definition" data feeding one shared wizard
  engine) was refined during the actual build: James's answers confirmed
  per-heading optional depth (not a whole-taxonomy yes/no) let `numLevels`
  itself just track how many description levels are needed so far, which
  turned out simpler than keeping visibility fully decoupled from it. The
  remaining four levels (Intermediate/Advanced/CoA/Item Master) still need
  their own stage prompts — see "Not yet built".
- **Sign-on gate is a speed bump, not real security (PR #70)** — worth
  restating plainly since it's easy to mistake a login *screen* for actual
  access control: this app is a fully static, client-side site with no
  backend (Section 2/9), deployed straight to GitHub Pages. Everything
  shipped to the browser, including `auth.ts`'s salted password hash, is
  downloadable and inspectable by anyone who opens dev tools or clones the
  repo. Salting and hashing (rather than storing the password in plain
  text) is worth doing since it's nearly free, but neither changes that
  fact. James confirmed he wants the simple version anyway, with this
  limitation understood.
- **Multi-user / multi-instance access model — decided, not yet built.**
  James asked about tracking individual users across "instances" of the
  software (giving each a username/password when he hands it out) and
  floated a separate "taxonomy_builder_access" app for it. Given three
  options — (1) more rows in the one shared `AUTH_USERS` list this app
  already has, (2) a small separate admin app just to self-serve editing
  that same list, (3) genuinely separate per-client deployments each with
  their own credentials, matching "instance" literally — James chose (1)
  for now, with (3) explicitly anticipated "in due course" if things go
  well. So: adding a user today is still "tell me the email/password, I
  add a row to `auth.ts`" — no new work needed until (3) actually becomes
  the ask, at which point it's a real distribution-model conversation
  (separate deployments, a way to push updates to all of them, a way to
  track who has which), not a small addition.

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

### Post-sign-on workflow menu, larger logo, tagline (PR #68)
First slice of a larger request (login screen, bigger transparent-background
logo, aesthetic pass, post-login menu with guided-workflow starting points).
Shipped: a new landing menu (`WorkflowMenu.tsx`) between signing on and the
taxonomy setup screen — "Create a New Taxonomy" with six starting points
(Simple/Intermediate/Advanced Complexity Taxonomy, Chart of Accounts, Item
Master, Highly Experienced User — No Guidance) and "Work on an Existing
Taxonomy" (Load from File/Import CSV/Library); all six new-taxonomy options
currently open today's same setup screen with a "Creating a `<level>`"
label, since the guided per-level workflow itself is separate follow-up
work James wants to design further first. "New Taxonomy" from the toolbar
now returns to this menu rather than straight to the form. Also a larger
header logo (existing asset — already transparent, just scaled up) and a
"Taxonomy Builder by the ERP Doctor James A Robertson and Associates
Limited" tagline on the sign-on screens.

Held back, pending information only James can supply: the actual login
screen (needs a real email/password to seed — flagged that this can only
ever be a client-side speed bump, not real security, since the app has no
backend) and a crisper, genuinely-transparent large logo (the version he
pasted came through inline in chat, not as an attachable file, so there
was no real image data to process — and an earlier round of this project
already tried substituting a hand-drawn SVG recreation for this same logo,
which he specifically undid in favour of his real logo file, so that
approach wasn't repeated).

Also gave requested design commentary (not implementation) on the guided
per-level workflow concept — see "Known open questions" above.

### Sign-on gate (PR #70)
James supplied the login credentials to seed (`jamesar@jar-and-a.com`,
same value for both email and password "for now"), unblocking the login
screen held back from PR #68. Built `Login.tsx` (email/password form,
same colour scheme/font/logo treatment as the rest of the sign-on flow)
and `auth.ts` (a salted SHA-256 hash checked via the browser's built-in
`crypto.subtle`, no new dependency; a successful login is remembered in
`localStorage`; a new Log Out button in the header clears it). Restated
the security limitation directly in `auth.ts` and in "Known open
questions" above: this can only ever be a speed bump against casual
access, never real security, since the app is fully static with no
backend. Also asked James how to actually attach the larger logo file
(his first attempt came through as an inline chat image, not a file
Claude Code can open) — still pending for a future round.

### Session autosave, Resume Work in Progress, Back to Menu (PR #72)
James found the sign-on flow had two related gaps: logging out and back
in while a taxonomy was open dropped him onto the workflow picker instead
of back into his work, and there was no way to get back to that picker at
all once a taxonomy was open — no "Close Session" or similar. Fixed both
with one mechanism (session autosave, `storage.ts`): the open taxonomy is
written to a `localStorage` slot on every change, independent of sign-in
state. "Back to Menu" (new toolbar button) returns to the landing menu
without discarding anything; "Resume Work in Progress" there brings it
back by name. Also: James decided the multi-user/access-model question
(see "Known open questions") — one shared login list for now, real
separate-instance deployments later if the tool's adoption justifies it.

**Correction shipped in PR #74**: this round shipped Log Out without
resetting `project`/`signOnStage` — reasoning (wrongly) that since
`project` is plain React state untouched by signing out, dropping
straight back into the open taxonomy on a same-tab log-out/log-in was a
*better* outcome than detouring through the menu. James confirmed that
was actually the same bug restated, not a fix: the landing menu should
always be where sign-in lands, full stop, with Resume Work in Progress as
the one deliberate way back in. See PR #74 below.

### Fix: log-out/log-in must land on the workflow menu (PR #74)
James's exact repro: "if I log out on the worksheet ... login ... go
directly to the worksheet, should be going to the workflow menu screen —
same issue as before." `handleLogOut` now also runs the same reset
`handleBackToMenu` does (clearing `project`/`signOnStage`) before clearing
auth, so every sign-in — same-tab or otherwise — lands on the landing
menu, with Resume Work in Progress as the way back into whatever was open.

### Simple Taxonomy guided wizard (PR #76)
Built the first of the five guided workflows, per James's approval of the
proposed stage sequence and his answers to six open design questions:
(1) Simple Taxonomy gets its own trimmed setup screen
(`SimpleTaxonomySetup.tsx` — title/table name/purpose/max description
length only); (2) sub-items are optional per heading, not an
all-or-nothing choice — this let `numLevels` itself just track how many
description levels are needed so far (1 during Headings, grown to 2 for
Sub-Items, trimmed to the actually-used depth entering Coding), simpler
than keeping column visibility fully decoupled from it; (3) mnemonic code
suggestions are pre-filled directly into the grid, not just shown as a
hint, and remain ordinary overtype-able cells afterwards — James
explicitly waived Section 9's "no automatic code generation" for this
one scoped case ("we are now pushing the boundaries to create an
increasingly intelligent application"); (4) a heading's first child is
auto-capped to ALL CAPS as it's typed; (5) "going back" is an "Exit
Guidance" escape hatch to full unrestricted editing, not per-stage
backward navigation; (6) the 5-to-9 item-count guidance requires a
positive "Continue Anyway" click to override, not a passive dismissible
notice. `Grid.tsx`'s code-column JSX (both header rows and every body
row) is wrapped in `{!hideAllCodes && (...)}` rather than CSS-hidden per
cell, avoiding any risk to the existing `colSpan` header math. New:
`guidance.ts` (heading/child counting, mnemonic suggestion — never
overwrites a row that already has a real code, best-effort on ascending
order relying on the wizard's own alpha-sort encouragement, with "Check
Ascending Order" as the existing fallback), `GuidanceBanner.tsx` (the
stage-machine driver and its confirm-override / coding-choice dialogs).
Also fixed a `TaxonomySettings.guidance` narrowing issue where TypeScript
didn't retain the outer `if (!guidance) return null` narrowing inside
nested function declarations that captured it — worked around by pulling
`guidance.level` into its own `const` up front rather than spreading
`guidance` itself when building the next stage's value. Verified with a
new Playwright test (`smoke_simple_wizard.mjs`) driving the full flow
end to end, plus updates to `smoke_workflow_menu.mjs` for the new trimmed
setup screen; existing Lock Taxonomy, sign-on, and resume-work regression
scripts all still pass unchanged. The remaining four guided levels
(Intermediate/Advanced/Chart of Accounts/Item Master) are still not yet
built — see "Not yet built".

---

*Maintained alongside each PR — update the "Current status" section and add
a new history entry whenever a round ships.*
