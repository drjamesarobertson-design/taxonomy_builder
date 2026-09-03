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

## Current status (as of PR #100, 2026-09-03)

Stages 1–5 of the original build sequence are complete, plus roughly 40
further rounds of testing feedback. The tool currently supports, in full:

- The core grid — code columns, delimiter columns, description columns,
  colour coding, ALL CAPS/Proper Case, per Section 4.
- Full editing: case toggle, promote/demote (single entry or with children),
  alpha sort, drag/manual reorder, insert/delete row, Move, Copy Rows.
  Insert Row Above/Below and Delete Row both work on a multi-row selection
  (Insert relative to the top of the range either way; Delete removes every
  selected row, with its own subtree, after one "Delete N rows?" confirm —
  PR #80 fix, it previously only ever acted on the single row right-clicked
  or inserted below the bottom of the range). A right-click "Add Row on
  Down Arrow" toggle (PR #80) makes Down Arrow insert-and-focus a new row
  beneath the current one anywhere, not just at the very last row.
- Code validation: charset, left-to-right population, ASCII ascending order
  (with Override), the "0" soft warning, and a hard cross-block duplicate
  check on the deepest column. The deepest (rightmost) column never
  cascades a real code down to blank rows below it (PR #80) — each row
  holds its own distinct leaf identifier — and its uniqueness check scans
  the whole sibling range (ahead of the softer, overridable ascending-order
  check, so an exact duplicate there is a hard block); entering a code
  there auto-advances the cursor down. Both that duplicate check and the
  ascending-order bounds check scope "the sibling range" by row structure
  (nearest shallower row = actual parent), not by comparing ancestor code
  values (PR #88) — the latter collapsed every not-yet-Fill-Codes'd
  segment in the whole taxonomy into one false group, since every child
  row's blank ancestor column reads the same "" regardless of which
  heading it's actually under, hard-blocking a code that only happened to
  match an unrelated segment's own (entirely legitimate) reuse of the same
  mnemonic letter. A code typed in the wrong case for
  the active Code Restriction is auto-corrected instead of rejected (PR #80),
  with a one-time notice explaining the correction — an earlier version of
  this and the heading-capitalization notice guessed at whether to add
  "please turn Caps Lock on" via `getModifierState('CapsLock')`, but James
  found it firing even with Caps Lock genuinely on; removed that guess
  entirely (PR #84) since both cells force/convert case regardless of the
  physical key anyway, so the suggestion was never functionally necessary.
- Undo/redo across all structural and content operations.
- Section 6.9 notes: an optional free-text note per entry, added/edited via
  right-click "Add Note"/"Edit Note" on the description cell (PR #94) — a
  small on-row indicator appears only once a row actually has one, showing
  the note's content on hover and opening the editor on click. Not part of
  CSV/XLSX export (Section 7's "raw-grid export" scope), just the
  working-grid feature and Save/Load round-trip.
- Export: CSV and Excel, in both Discrete Columns and Concatenated modes,
  plus a CSV-only "No Delimiter" variant; export-time "." → "0" padding
  substitution; column collapse/filter carets (level-based on description
  columns, literal "." filter on code columns).
- Save/load as a local JSON project file, with the File System Access API's
  native Save As dialog on Chromium, and a plain download fallback
  elsewhere. The dialog remembers the last folder actually used across
  every Save/Export call, via a fixed picker `id` (PR #86) — the existing
  "Choose Export Folder" `startIn` hint only ever covered the one folder
  explicitly chosen through that menu action, not the common case of
  picking a folder ad hoc in the dialog itself. That explicit pick is now
  one-shot (PR #88) — consumed by the very next successful save, then
  cleared — since passing it as `startIn` on *every* future save (the
  PR #86 fix's own oversight) permanently overrode the `id`'s own
  continuously-updating memory of wherever the user actually last saved,
  which is exactly what kept reopening the dialog on a stale, days-old
  default.
- Settings screen to revisit title/purpose/description-length/padding/
  delimiter/code-column-count after creation; right-click Add/Delete Column.
- Create Block / Import Block for moving content between separate taxonomy
  files.
- Field-level help icons (New Taxonomy + Settings) and right-click menu help,
  both driven by `public/help-text.csv` (editable without a rebuild), plus a
  collapsible "Worksheet Guidance" panel.
- A Library sidebar (left-hand, collapsible) for saving multiple taxonomies
  under eight fixed headings, independent of file-based Save/Load: "Add to
  Library" (prompts for a heading; if the open taxonomy is already linked
  to an entry, asks Overwrite-or-New-Version instead of updating it
  silently — PR #98 — with "New Version" adding a separate entry under the
  same heading, titled with an incrementing " v1.NN" suffix), right-click
  Move to Work Area / Edit Title / Move Up / Move Down / Move to Category…
  / Remove from Library, and drag-and-drop reordering within or across
  headings (both the right-click and drag mechanisms work side by side).
  One heading — Cubic Business Model Related (PR #100, renamed from
  "General Ledger Related") — is itself broken into four fixed sub-headings
  (DIVISIONS / LOCATIONS / FUNCTIONS / GL ACCOUNTS), each with its own
  drag/drop, Move Up/Down, and Move to Category sub-heading picker; every
  other heading stays a single flat list.
  Persisted in this browser's own IndexedDB — per-browser, not a file, and
  not synced anywhere.
- A "Code Restrictions" dropdown at the top of the work area, narrowing
  real codes to Numeric Only / Alpha Numeric with All Alpha / Alpha Numeric
  with Upper Case Alpha Only / Alpha Upper Case Only / Alpha Both Cases
  Only, on top of the fixed global charset; the padding character is
  always exempt.
- **Auto Code** (PR #96): a general-purpose toolbar action for coding a
  taxonomy that has none yet — independent of the Simple Taxonomy wizard's
  own mnemonic Suggest Codes (guidance.ts), so it works on any taxonomy,
  not just ones built through that wizard. Within any sibling group,
  spreads codes evenly across 1-9 (first sibling "1", last "9", "0" never
  used), extending into capital letters only past 9 members, applied
  uniformly at every level; then carries ancestor codes down through
  descendants and pads every deeper column, reusing `fillCodesDown`/
  `padCodes` rather than reimplementing them. A dropdown names all five
  Code-Restriction-style types up front, though only "Alpha Numeric with
  Upper Case Alpha Only" is actually implemented so far — the rest say
  plainly they're coming soon rather than doing nothing or the wrong
  thing. Only fills genuinely blank codes; blocked outright while locked.
- "Import CSV": brings in a taxonomy already in the same shape this app's
  own Discrete Columns CSV export produces — level count, delimiter
  positions, and suffix columns inferred from the file's own structure,
  with a short confirm step for title/table name/purpose/max description
  length (the only things a CSV can't carry). Also recognises a codeless
  file with no code columns at all — a header reading "Level 1", "Level
  2", ... optionally followed by "Notes" (PR #94) — bringing in every
  Level column as a real description level with codes left genuinely
  blank, and each row's Notes text landing in that row's note.
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
  with a non-clickable "Cubic Business Model" heading (PR #100 — CLAUDE.md
  Section 9's Cubic Business Model©) grouping Division / Location /
  Function / Chart of Accounts, followed by Simple Taxonomy / Advanced
  Complexity Taxonomy / Item Master / Highly Experienced User — No Guidance
  (Intermediate Complexity Taxonomy removed, PR #100); and "Work on an
  Existing Taxonomy" (Load from File / Import CSV / Library). Every level
  but Simple Taxonomy still opens today's same taxonomy setup screen with a
  "Creating a `<level>`" label and no further guidance — their guided
  workflows remain not-yet-built follow-up work (see "Not yet built"). Also:
  a larger header logo and a "Taxonomy Builder by the ERP Doctor James A
  Robertson and Associates Limited" tagline on the sign-on screens.
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
  mnemonic-code suggestion is pre-filled directly into the grid, per
  sibling group; suggested codes are ordinary, fully-editable cells from
  that point on, normal overtype and validation, nothing special once
  written. Before suggesting anything, any leading words every sibling in
  a group shares verbatim (typically the heading's own wording, repeated
  at the start of each child's description) are stripped from all of them
  first (PR #84) — not just the ones that happen to collide — since using
  such a word's letter for even the first child wastes it for zero
  distinguishing benefit and pushes every later sibling toward the end of
  the alphabet chasing a fallback. What's left follows James's own stated
  manual practice (PR #84, restating PR #82's version against his precise
  worked example): first letter of word 1, then word 2, then word 3 (each
  only if it exists); failing that, word 1's first and second consonant,
  then word 2's, then word 3's; a short connector-word list (by/and/etc.)
  is removed from the word list entirely first, not merely skipped, so a
  connector never supplies a real-but-meaningless, potentially
  order-breaking letter; and if none of that yields a usable,
  not-already-taken letter, the row is left blank and flagged — "Some
  entries couldn't get an automatic code — please enter them manually",
  with the cursor dropped on the first one — rather than falling back to
  an arbitrary charset letter with no connection to the description.
  Applies at every level, not just the rightmost column. An "Other"/
  "Miscellaneous" entry (Section 5, step 6) skips this word/consonant rule
  entirely — it always gets the last character its Code Restriction allows
  ("Z", "z", or "9") instead, since mining a mnemonic letter out of the
  word "Other" itself was exactly why these rows (including in the
  rightmost column) sometimes came out blank (PR #86). Separately, a
  soft warning ("Other or Miscellaneous Should be the Last Entry in a
  Segment") fires if a later sibling is typed after one — checked across
  the whole sibling group on every description blur, so it also catches
  an *earlier* "Other" row retroactively once a later sibling makes it a
  violation, not just the row just edited (PR #86). And each level-0
  heading's default code is checked against how early it sits among the
  taxonomy's other headings — "the first mnemonic code should be in the
  first third of the alphabet depending on number of column 1 categories"
  — offering a Y/N prompt to swap in an earlier, still-unused alternative
  when the default reaches too far into the alphabet (PR #86; James's own
  worked example: "ORDER CANCELLED", heading 1 of 3, defaults to "O" and
  is offered "C" instead). The coding stage then stays
  open (round-2 fix, PR #78) for two further deliberate steps: **Fill
  Codes** carries each heading's own code down through its child rows'
  otherwise-blank ancestor columns (mirroring the existing "Replicate
  Codes Below", but automatic across the whole column and keyed off each
  row's own level rather than a manual selection), and **Pad Codes** fills
  every column deeper than a row's own level with the padding character —
  both leave a row's own code column and any already-filled cell alone,
  and both stay correct at any depth, not just Simple Taxonomy's two
  levels. **Finish** ends the wizard once these look right. "Exit
  Guidance" drops out to full unrestricted editing at any stage. The
  coding stage's Numeric/Alpha choice is now the full Code Restriction
  dropdown (round-2 fix, PR #80) — the same five options as the main
  screen's own dropdown, which is hidden for the wizard's whole duration
  so the two never show at once. A genuine bug in the mnemonic suggestion
  itself is also fixed (PR #80): it was clearing its duplicate-avoidance
  tracking on every same-level sibling instead of only when moving to a
  shallower level, so it forgot what it had just assigned to the previous
  sibling — this is what produced repeated first-letter codes. A
  "Duplicate First Letters" notice (focusing the offending cell) and a
  "Sort or Accept" prompt for codes that land out of order (e.g. children
  typed out of alpha order — Sort reorders by code, ascending, carrying
  each entry's own children with it) now back that fix up. The other four
  guided levels (Intermediate/Advanced/Chart of Accounts/Item Master)
  still open today's ungated setup screen — not yet built.
- A simple email/password sign-on gate (`Login.tsx`/`auth.ts`), shown
  before anything else: checks a salted SHA-256 hash (via the browser's
  built-in `crypto.subtle`), remembers a successful login in this
  browser's `localStorage` (Log Out button clears it), and points a
  forgotten password at emailing James rather than an automated reset
  (there's no backend to send email or manage tokens). Explicitly a speed
  bump against casual access, not real security — see "Known open
  questions" for why that's an inherent limit of a backend-less static
  app, not a shortcut taken here. The login field accepts any plain-text
  identifier, not just a real email address (PR #92) — `AUTH_USERS` now
  also seeds nine simple `Friend_1`.."Friend_9" logins (username =
  password) alongside James's own, so he can hand the app URL to friends
  without sharing his own credential; each still just gates entry, it
  doesn't partition Library/autosave storage per login (see that PR's own
  note, and the "sharing the URL" answer in the History below, for what
  that does and doesn't mean for data isolation).
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
- **Phonetically-intuitive mnemonic codes — flagged by James as possibly
  under-specified, not yet built.** His round-2 feedback (item 7)
  described how he actually picks a manual code in practice: not always
  the first letter, but a consonant elsewhere in the description that's
  phonetically memorable AND keeps ascending order against the row above
  — his worked example was "Order Cancelled by Consumer" needing to sort
  after "Order Cancelled by Credit Control" (coded "C"), so he'd pick the
  "S" in "ConSumer" (emphasizing the sound) rather than reuse "C". He
  said himself he wasn't sure he'd given enough to replicate this — it's
  a judgement call blending phonetics, sort-order constraints, and
  memorability, not a mechanical rule like "first usable letter." Current
  `suggestUnusedCode` (guidance.ts) already falls back through a
  description's OTHER letters when the first one collides, and the
  wizard's Sort/Accept + duplicate-notice (PR #80) now cover the
  uniqueness and ordering half of what he's asking for — the missing
  piece is specifically the *phonetic* judgement of which letter to pick
  when there's a choice. Left for a follow-up conversation rather than
  guessed at.

### Cubic Business Model heading/sub-headings in the Library and New Taxonomy menu (PR #100)
James's next round, right after confirming the Library fixes: two structural
asks, applied in parallel to the two places a taxonomy's "kind" gets picked.

1. **Library:** "replace GENERAL LEDGER RELATED with CUBIC BUSINESS MODEL
   RELATED and under that sub-headings DIVISIONS / LOCATIONS / FUNCTIONS /
   GL ACCOUNTS." Renamed `LIBRARY_CATEGORIES[0]` and gave `LibraryEntry` an
   optional `subcategory` field, meaningful only for this one category
   (CLAUDE.md Section 9's Cubic Business Model© — Divisions, Locations,
   Functions and [GL] Asset Class "all interacting", the multi-taxonomy
   library management explicitly deferred there; this is the Library
   groundwork for that, not the full deferred feature). Every grouping
   operation that used to key on `category` alone now keys on
   `(category, subcategory)` — `entriesFor`, `nextOrder`,
   `setLibraryCategoryOrder` — so an ordinary heading (subcategory always
   undefined for every one of its entries) behaves exactly as before, and
   Cubic Business Model Related additionally partitions by sub-heading.
   `LibrarySidebar` renders that one heading's four sub-headings as nested
   drop targets/lists instead of one flat `<ul>`, each with its own
   drag/drop, Move Up/Down, and Move to Category sub-heading picker (a
   second `<select>` that only appears once Cubic Business Model Related is
   chosen, in both the "Add to Library" and "Move to Category…" dialogs).
   Renaming a live category string risks orphaning any real data already
   saved under the old name — added a one-time migration in
   `listLibraryEntries()` that re-saves any entry still carrying the literal
   old "General Ledger Related" string as Cubic Business Model
   Related/GL ACCOUNTS, so nothing already in James's own Library vanishes
   from every heading the next time it loads.
2. **New Taxonomy menu:** "Do the same on the Wizard menu – need Wizards for
   each of these." Clarified with James (menu structure and wizard depth)
   before building, since a literal "same as Library" read as sub-headings
   nested arbitrarily deep, and "need Wizards" was ambiguous between a
   genuine guided multi-stage wizard per item versus routing to today's
   plain setup screen. His answer: a plain, non-clickable "Cubic Business
   Model" label above four items — Division, Location, Function, and the
   existing Chart of Accounts moved under it (not a new fifth "GL Accounts"
   wizard, reusing Chart of Accounts instead) — with every other level kept
   except Intermediate Complexity Taxonomy, removed; and the three new
   items should route to today's standard setup screen, same as every other
   still-unguided level, not a new guided wizard. `WORKFLOW_LEVELS`
   reordered with Division/Location/Function/Chart of Accounts first, and a
   new `CUBIC_BUSINESS_MODEL_WORKFLOW_LEVELS` constant tells
   `WorkflowMenu.tsx` which of them sit under the plain heading label versus
   rendering as ordinary top-level buttons (everything else, unchanged).

Separately answered (no code change): whether spell-checking needs a
browser add-in like Grammarly — no, description cells are plain
`<input type="text">` with no `spellCheck={false}` override, so the
browser's own native spellcheck (red squiggly underline) already applies;
confirmed no `spellcheck`/`spellCheck` attribute anywhere in the codebase
overrides that default.

New `smoke_cubic_business_model.mjs` covers the sub-heading picker on both
Add to Library and Move to Category, the DIVISIONS/GL-etc. sub-heading
assignment, the removed Intermediate Complexity Taxonomy button, and the
non-clickable Cubic Business Model heading. `smoke_library.mjs`,
`smoke_library_bugs.mjs`, and `smoke_workflow_menu.mjs` updated for the
renamed category and restructured menu. Full existing Playwright suite
re-run clean.

### Library silent-overwrite and Edit Title layout fixes (PR #98)
Two bugs from James, right after confirming Auto Code worked well:

1. **"When one takes a taxonomy out of the library and save it back to the
   library it over rides without checking if want to keep previous version
   – prompt 'Overwrite or New Version' – if new version give an incremental
   version number."** `handleAddToLibraryClick` had no confirmation branch
   at all once a taxonomy was linked to a Library entry (via "Move to Work
   Area" or a first "Add to Library") — it called `updateLibraryEntryProject`
   straight away. Added a confirm dialog with three choices: Cancel,
   Overwrite (the prior direct-update behaviour), and New Version, which
   creates a genuinely separate entry under the same heading via
   `addLibraryEntry`, carrying the incrementing " v1.NN" title suffix
   already used for Save-to-File filenames — reused the existing
   `bumpFileVersion`/`fileVersions` mechanism from `fileVersion.ts` with a
   new `'library'` counter key, rather than inventing a second scheme. A
   prior version suffix is stripped before appending the next one, so
   repeated versioning reads "Title v1.03", never "Title v1.02 v1.03". The
   work area re-links to the newly created entry afterwards, matching what
   "Move to Work Area" already does.
2. **"When Edit Title in the Library get a blank field and the entry moves
   one column left in the Library display."** Root-caused as a pure CSS
   layout bug, not a data bug — the entry's category/order were never
   touched. `.library-entry`'s lock-icon span and the rename `<input>`
   were laid out as plain inline siblings, and the input's `width: 100%`
   resolved against the whole row rather than the space left after the
   icon; the two together overflowed the row's own box, and the browser's
   inline layout pushed the icon left, outside its own container — reading
   as a blank, shifted field even though the input's actual value (checked
   directly) was always correctly pre-filled. Fixed by making
   `.library-entry` a flex container (`display: flex; align-items:
   center`) with `flex-shrink: 0` on the icon and `flex: 1; min-width: 0`
   on both the rename input and the read-only title span, so the two
   states lay out identically.

New `smoke_library_bugs.mjs` covers both: the Cancel/Overwrite/New Version
dialog and its distinct-entry/title-suffix behaviour, and the rename
input's pre-filled value plus its bounding-box position relative to the
lock icon. `smoke_library.mjs` and `smoke_lock_taxonomy.mjs` (both
pre-dating this fix) updated for the new confirmation step on a second
"Add to Library" click, and — while touching `smoke_library.mjs` — also
updated its `createTaxonomy` helper for the sign-on/workflow-menu flow it
predated, since it's the most thorough drag/drop/category regression test
the Library has. Full existing Playwright suite re-run clean.

### "Other"/"Miscellaneous" handling, early-alphabet heading guidance, save-folder memory (PR #86)
James's fifth round, still building out his real ASCO Credit Note Reasons
taxonomy. Four items:

1. **"Other"/"Miscellaneous" should sit last, and be coded last.** Section
   5, step 6 already says a catch-all is "conventionally coded last (e.g.
   9 or z)" — a new soft warning ("Other or Miscellaneous Should be the
   Last Entry in a Segment") now fires when a later sibling is typed after
   one. Checked across the whole sibling group on every description blur
   (`findOtherNotLastInGroup`), not just the row just edited — a later
   sibling being typed is exactly what turns an *earlier*, already-typed
   "Other" row into a violation without that earlier cell ever being
   touched again. Warned once per row while the condition holds, cleared
   again if it stops (renamed, or the later sibling removed), so the same
   row can re-warn if it becomes a problem again.
2. **"OTHER does not guess mnemonic codes in right most column."** Root
   cause: the word/consonant rule was still being run against the literal
   word "Other" or "Miscellaneous", which exhausts its two-consonant
   fallback quickly and collides often (the same word recurs as a catch-
   all across many segments of one taxonomy) — exactly the single-word-
   collision case that leaves a row blank. Fixed by skipping the rule
   entirely for an Other/Miscellaneous entry (`isOtherOrMiscellaneousLabel`)
   and always assigning the *last* character its Code Restriction allows
   ("Z", "z", or "9" — `suggestOtherOrMiscellaneousCode`, descending
   through the full charset on the rare collision) — matching James's ask
   directly and fixing the rightmost-column report as a side effect, since
   the same code path runs at every level.
3. **Early-alphabet heading guidance.** James's exact report: "ORDER
   CANCELLED still codes 'O' in column 1 which is too far down the
   alphabet for a first character" — his rule of thumb, "the first
   mnemonic code should be in the first third of the alphabet depending on
   number of column 1 categories", generalises to dividing the alphabet
   into as many equal bands as there are headings, one per heading
   position (`idealMaxAlphaIndexForHeading`) — heading 1 of 3 keeps to
   roughly the first third, heading 2 to two-thirds, and so on, so an
   early heading's default pick never eats into the range later headings
   will need. `findAlphabetBandSuggestions` runs this check after Suggest
   Codes, over the very same word/consonant candidate order just under an
   extra ceiling, and `GuidanceBanner.tsx` offers a Y/N prompt per flagged
   heading rather than silently overriding what was already suggested.
   Reproduces his own worked example precisely: 3 headings, "ORDER
   CANCELLED" defaults to "O", offered "C" instead — matching the specific
   wording he asked for. Skipped entirely for an Other/Miscellaneous
   heading, which is *supposed* to sit at the far end.
4. **Save/Export folder memory.** "Save to file is still offering the
   previous session's default disk folder... same with export." The
   existing `startIn` hint (PR #25's export-folder memory) only ever
   pointed at the one folder explicitly chosen via "Choose Export Folder"
   — most saves pick a folder ad hoc in the native dialog itself, which
   that mechanism never captured. Added a fixed `id: 'taxonomy-builder-
   save'` to the `showSaveFilePicker` call in `saveExportFile` — the
   actual spec mechanism Chromium uses to remember the last folder used
   across picker calls for a given id, automatically, with or without
   `startIn`. Since Save/CSV export/XLSX export/block transfer all funnel
   through this one shared function, all of them now pick up the fix at
   once ("same with export, etcetera").

Also re-investigated (once more, unprompted) the still-unreproduced Fill
Codes/blank-codes report — James: "I have raised this before, I am sure I
refreshed the browser twice... the multiple Order Cancelled items are
still blank." Re-ran the full existing unit and Playwright coverage for
the "ORDER CANCELLED" example against the current word/consonant algorithm
with zero regressions (still resolves to distinct, non-blank C/N/S), and
found no code path that would leave those specific rows blank. Left open
pending a fresh check now that this round is live (GitHub Pages' CDN can
briefly serve a stale bundle for a minute or two right after a deploy,
which a browser hard-refresh alone doesn't bypass) or, failing that, exact
repro steps or the actual project file.

New/updated tests: `unit_guidance.mjs`/new `unit_guidance2.mjs` cover the
Other/Miscellaneous label match and code assignment (per restriction),
`isOtherEntryNotLast`/`findOtherNotLastInGroup`, and
`findAlphabetBandSuggestions` (including James's exact 3-heading example);
new `smoke_other_not_last.mjs`, `smoke_other_code.mjs`, and
`smoke_alphabet_band.mjs` drive each feature end to end through the real
wizard; full existing regression suite (9 prior smoke scripts plus the
round-4 word-rule tests) re-run clean.

### Cross-segment code collisions before Fill Codes, one-shot export folder (PR #88)
James finally supplied the missing piece for the "Fill Codes"/blank-code
reports that had gone unreproduced across three prior rounds: a saved
project file captured mid-error (`Test 27 Credit Note Reason Codes ...
ERROR_ON_CODE_FOR_FIRST_IN_SEGMENT.json`), with his exact narration —
"SUPPLY ISSUES / Order Duplication at the top of the segment auto codes
'O', overtype or delete to enter 'D' get [an error] ... No matter what I
do I get this error and cannot code that cell – the message give OK but
needs to give 'Override' as well. The error also refers to 'delimited by
"."' but there are no '.' at this point in the wizard."

Root cause, found directly against the file: Grid.tsx's rightmost-column
duplicate check and its ascending-order bounds check (`findOrderBounds`)
both determined "which rows are this row's siblings" by comparing each
row's own ancestor code value (`codes[level-1]`) to the edited row's. In
the wizard's coding stage, before Fill Codes has run, every not-yet-filled
child row's ancestor column genuinely reads `""` — the *same* blank value
for every segment in the entire taxonomy, not just the one being edited
— so both checks treated all of them as one giant false sibling group. His
"Order Duplication" (first child of "SUPPLY ISSUES") collided on "D" with
"Defective Product" and "Discontinued", both children of entirely
different headings several segments away — a completely legitimate reuse
of the same mnemonic letter, wrongly caught by a hard, no-override
duplicate check that was never supposed to compare across segments at all.

Fixed by scoping both checks the way `guidance.ts`'s mnemonic suggestion
already does (PR #84's own fix for the identical class of bug there): by
row *structure* — the nearest shallower row is a row's actual parent,
regardless of what code value that parent currently holds — via a new
`immediateParentIndex` helper. Once the false hard block was gone, the
softer, already-overridable ascending-order check (re-scoped the same
way) correctly took over for the genuine, if pre-existing, ordering
question underneath (SUPPLY ISSUES' own children were already out of
strict order as a block) — which is exactly what resolves James's
"needs to give Override as well" ask, without adding an override to the
hard duplicate check itself, which should stay a hard block once it's
actually comparing the right rows. Left the "delimited by '.'" message
wording alone, since it was never really about literal padding characters
being present yet — it was purely a symptom of the false trigger, which
no longer fires for this case.

Separately fixed a real regression in last round's own save-folder fix:
PR #86 added a fixed `id` to the native Save As picker (the mechanism
Chromium actually uses to remember the last folder used across calls),
but left the OLD `startIn` hint — sourced from whatever folder was ever
explicitly set via "Choose Export Folder" — being passed on *every*
subsequent save, which permanently pins the dialog to that one folder
forever, overriding the `id`'s own steadily-more-current memory. Exactly
James's "still points to the default of yesterday" report. Made the
explicit pick one-shot (`pendingExplicitFolder` in `exportFolder.ts`):
consumed by the very next successful save, then cleared, so a folder
picked once doesn't keep winning over wherever the user has actually been
saving since. Updated the toolbar button's tooltip to describe this
honestly ("Sets where your next Save/Export starts — after that, it
reopens wherever you last saved").

New `smoke_first_in_segment.mjs` loads James's actual uploaded file and
drives the exact repro end to end: confirms the false "must be unique"
hard block is gone, the code is successfully entered (via the legitimate
Override prompt underneath), unrelated segments' own "D"s are untouched,
and a genuine same-segment duplicate is still hard-blocked. Full existing
regression suite (14 prior smoke scripts) re-run clean.

### Tagline wraps onto two lines (PR #90)
Small cosmetic ask: on both the login screen and the post-sign-on home
screen, "James A Robertson and Associates Limited" now sits on its own
line beneath "Taxonomy Builder by the ERP Doctor", rather than running on
in one long line. No text changed, just a `<br />`.

### Sharing the app, and nine friend logins (PR #92)
James asked what happens if he shares the app's URL with others — would
they see his Library/data, or get to try it independently? Answered
directly: this is a fully static site with no backend, so everything it
stores (Library entries, autosaved work, remembered sign-in) lives only
in the visitor's own browser, never uploaded anywhere — sharing the URL
alone exposes nothing of his, and a visitor lands on a genuinely blank
workspace. The one caveat: there's a single shared login, and since the
whole app (including `auth.ts`'s user list) ships as public JavaScript,
that credential is technically visible to anyone who opens dev tools —
a real, if unlikely-to-be-exploited-in-practice, gap for something
meant to be handed out.

James's follow-up: give up to nine friends their own login instead of
sharing his. Added `Friend_1`/`Friend_1` through `Friend_9`/`Friend_9`
(username = password, as he asked) to `AUTH_USERS`. Since these aren't
real email addresses, the login field's native `type="email"` would have
rejected them outright via browser validation (requires an "@") —
switched it to a plain text field, relabelled "Email or Username";
`verifyLogin` already only ever compared it as a case-insensitive string,
so James's own real email keeps working unchanged. Restated plainly (in
code and back to James) that a login is still only a gate, not a data
partition: Library/autosave storage isn't scoped per account, so this
only matters if two different logins are ever used on the very same
physical browser — the ordinary case of each friend on their own device
already gets a fully separate, empty workspace regardless. New
`smoke_friend_logins.mjs` logs in as all nine (separate browser contexts,
standing in for separate devices), confirms each sees its own identity
and a genuinely empty Library, and that James's own login and a rejected
wrong password both still work correctly. Every scratch test script's
login-field selector was updated from `input[type="email"]` to a new
stable `.login-email-input` class to match the field's new type — full
existing regression suite (15 prior smoke scripts) re-run clean.

### Section 6.9 Notes, and a codeless "Level N" + Notes CSV import (PR #94)
James is building a GL Analyzer Concept Chart of Accounts template with
Claude Chat and wanted to bring it into Taxonomy Builder: a plain CSV with
`Level 1, Level 2, Level 3, Level 4, Notes` columns and no codes at all
(Levels 1-3 populated for a general template; Level 4 deliberately blank,
reserved for when a real client's accounts get mapped in beneath it later).
Asked directly whether this would work as-is or needed a special "Import
without Codes" button — traced it and found it needed real work on two
separate fronts, not a workaround:

1. **Import CSV always required at least one code column.** Every existing
   detection path (`tryParseHeaderedCsv`, `parseHeaderlessCsv`) anchors on
   finding a run of single-character code cells first, and hard-errors —
   "Could not find any code columns... this doesn't look like a taxonomy
   in code-columns/description-columns format" — when there are none.
2. **Section 6.9 (notes) had never actually been built** — no data field,
   no UI — so column E's content had nowhere to go even once the CSV
   itself could be read.

Built both. `TaxonomyRow` gains an optional `note` field; `Grid.tsx` gets
a right-click "Add Note"/"Edit Note" on the description cell (opens a
small dialog — textarea, Save/Delete Note/Cancel), and a small on-row
indicator that only appears once a row actually has a note, revealing its
content on hover and opening the editor on click — deliberately not
gated behind Lock Taxonomy's protected-row checks, matching the existing
precedent for suffix values (only code/description were ever named as
protected). `csvImport.ts` gained a third, independent detection path
(`tryParseDescriptionOnlyCsv`, tried after the two existing code-column
paths so it can't regress anything already working): a header reading
"Level 1", "Level 2", ... in sequence, optionally followed by "Notes".
Brings in every Level column found — including one that's blank for
every row right now, per James's explicit "bring in all columns" — with
every code cell genuinely blank (ready for manual coding later, same as
any other not-yet-coded taxonomy) and each row's Notes-column text
landing directly in its new note field.

James originally supplied the source as an .xlsx; asked whether to also
build direct .xlsx reading (`exceljs` is already a dependency, used for
export) or build against a CSV he exports himself — he confirmed CSV,
supplying `GL_Analyzer_Concept_Chart_of_Accounts_v_2_10_02.csv` directly,
so direct .xlsx import remains unbuilt for now. Verified end-to-end
against that real 144-row file (`unit_csv_description_only.mjs` against
the parser directly, `smoke_description_only_import.mjs` through the full
UI) and with a dedicated Save-to-file/reload round trip for notes
(`smoke_notes_persist.mjs`); `smoke_csv_import_regression.mjs` confirms
the existing coded-CSV import path is unaffected. Full existing regression
suite (16 prior smoke scripts) re-run clean.

### General-purpose Auto Code (PR #96)
James's next request against the freshly-imported GL Analyzer CoA (144
rows, no codes at all): auto-code the whole structure. He explicitly
invited clarification before starting, and it took two rounds to land on
a precise rule:

- **Round 1** (his original message): numeric-first codes, 1-9, gap-coded
  so the last item in a sibling group reaches "9" where there's room,
  overflowing into capital letters only if a group exceeds 9 members —
  but a *different*, tighter "sequential number, no gaps" rule specifically
  for the deepest column actually used per branch, versus gap-spread
  everywhere shallower. Also floated whether this needed a dedicated
  "Auto Code" button distinct from the wizard's own mnemonic Suggest Codes.
- **Round 2** (his corrections): (1) same gap-coding rule throughout —
  no special tighter rule for the deepest column after all; (2) yes to a
  genuinely general-purpose "Auto Code" button, with a dropdown asking
  which code type to generate and acting accordingly — built now for
  "Alpha Numeric" (digits + capital letters), with the dropdown naming
  every other type up front and a plain note that their functionality is
  still to follow, so the UI doesn't need rebuilding later.

Built as new `src/autoCode.ts`, deliberately separate from guidance.ts
(which is scoped to the Simple Taxonomy wizard's own letter-derived
mnemonic scheme) since this needed to work on any taxonomy, wizard-built
or not. The rule: within any sibling group — rows sharing the same
immediate parent by row structure, the same grouping approach used
elsewhere in this app for exactly the reason that ancestor codes are
often still blank at this point — spread codes evenly across "1" to "9"
(proportional rounding, not a fixed step, so the first sibling always
lands on "1" and the last always lands on "9" regardless of count) with
"0" excluded entirely, extending into "A", "B", "C"... with no further
gapping once a group genuinely exceeds 9 members (already past the
taxonomy's own 5-9 guidance by then, so nothing left to reserve room
for). Own-level codes assigned this way at every level, then
`fillCodesDown`/`padCodes` (both already built, both reused rather than
reimplemented) carry each ancestor's code down through its descendants
and pad every column deeper than a row's own level.

The "Auto Code" toolbar button opens a dropdown listing all five
Code-Restriction-style type names, defaulting to "Alpha Numeric with
Upper Case Alpha Only" — the only one actually wired up
(`IMPLEMENTED_AUTO_CODE_TYPES`) — with the other four visibly marked
"(coming soon)" and a note line saying the same. Picking one of the
unimplemented four and clicking "Generate Codes" shows a plain "isn't
built yet" message and leaves the dropdown open rather than closing or
silently doing nothing. Generating codes for real also updates the
taxonomy's own Code Restriction to match, so a code typed manually
afterwards validates against the same rule Auto Code just used. Only
ever fills genuinely blank codes — a taxonomy with some codes already
entered keeps them exactly as they are — and is blocked outright while
locked, the same precedent CSV Import already set for a bulk,
whole-table structural operation.

New `unit_autocode.mjs` (tsc-compiled, Node-run) covers the spread
maths directly — 2/3/5-way groups landing exactly on 1 and 9, the
>9-member overflow into letters staying distinct, a pre-existing manual
code never being touched or collided with, "0" never appearing — plus a
full run against James's real 144-row file confirming every row gets a
valid code and the always-blank Level 4 column ends up padded
throughout. New `smoke_auto_code.mjs` drives the dropdown, the
unimplemented-type message, and the generated result through the actual
UI end to end. Full existing regression suite (19 prior smoke scripts)
re-run clean.

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

### Fill Codes / Pad Codes for the Simple Taxonomy wizard (PR #78)
James's round-2 testing of the wizard against his own reference example:
the mnemonic suggestion was "spot on" on every code, but only ever set a
row's own column — a heading's code never carried down through its
children's shallower columns (the ancestor-path convention the rest of
the app already relies on and Section 4.1's own worked example shows),
and columns deeper than a row's own level were left blank instead of
padded with "." (also, once padded, that "." itself needs to keep
replicating down like any other code — not stop after one row). He
proposed two separate steps rather than one automatic pass — "work out
the codes from the description hierarchy and then afterwards as a
separate step fill in the blanks once the direct corresponding codes
have been approved" — and pointed at the existing right-click "Replicate
Codes Below" as already getting this right, just needing to be automated
down each column instead of run manually. Added exactly that shape:
`guidance.ts` gained `fillCodesDown` (carries each row's own code into
every blank ancestor column beneath it, one pass top to bottom, keyed off
each row's own level so it works at any depth rather than blindly
cascading by scan order) and `padCodes` (fills every column deeper than
a row's own level with the padding character); `GuidanceBanner.tsx`'s
coding stage no longer ends itself the instant the Numeric/Alpha +
mnemonic choice is made — it now stays open with "Fill Codes", "Pad
Codes", and a new "Finish" button, so James can review the base codes
first and run each step deliberately once they look right (both are safe
to re-run, since they only ever touch genuinely blank cells). Caught and
fixed a self-inflicted test bug while verifying this: overtyping a code
mid-scenario in the Playwright test triggered the app's own *existing*,
separate interactive cascade-on-type behavior (Grid.tsx's `updateCode`
already sweeps a freshly typed code down through blank/lesser cells
below it in the same column, and auto-pads a completed leaf's remaining
columns) — moved the overtype-still-works check to the very last row
(nothing beneath it to sweep into) so it can't interfere with the
Fill/Pad assertions above it. Verified with an extended
`smoke_simple_wizard.mjs` plus a re-run of `smoke_workflow_menu.mjs`,
`smoke_lock_taxonomy.mjs`, and `smoke_resume_work.mjs` — no regressions.

### Round-2 wizard/grid refinements (PR #80)
A second batch from James actually building out a real example against
the wizard end to end. Eleven points; all but one were clear enough to
build straight away (see "Known open questions" for the one that wasn't).
The standout was a genuine bug: `suggestMnemonicCodes` cleared its
duplicate-avoidance tracking on `level <= prevLevel`, starting the clear
AT that level — meaning two siblings at the very same level (a run of
children, or two headings in a row) wiped each other's tracking on every
single transition, which is exactly what let four descriptions all
starting with "D" suggest the same letter four times over. Fixed to
`level < prevLevel`, clearing only levels strictly deeper than the
current one — verified against James's exact repro plus a suite of
multi-level cases in a new `unit_guidance.mjs` (compiled straight from
`guidance.ts` via `tsc`, run under plain Node — faster and more reliable
than trying to force a duplicate through the browser once the root cause
was actually fixed). Backed up with `findDuplicateCode` (a defensive
safety net — a genuine pre-existing duplicate, e.g. typed manually or
pushed through the ascending-order Override, still gets caught and the
cursor dropped on it) and `hasOutOfOrderCodes`/`sortAllCodesAscending`
(a "Sort or Accept" prompt when a sibling group's codes land out of
order — e.g. children typed out of alpha order — Sort reorders by code
per sibling group, shallowest level first, each entry carrying its own
children along, same rule as Alpha Sort).

Also: a right-click "Add Row on Down Arrow" toggle (Down Arrow inserts
and focuses a new row beneath the current one anywhere, not just at the
last row); "Insert Rows Below" on a multi-row selection is now relative
to the *first* row in the range rather than the last (previously "select
row 1 downward, Insert Below" landed the new rows after the whole range,
never immediately under row 1 itself); multi-row "Delete Row" confirms
once ("Delete N rows?") and removes every selected row instead of just
the one right-clicked; the rightmost code column no longer cascades a
real code down to rows below it and checks uniqueness across the whole
sibling range rather than just the adjacent row — moved ahead of the
softer, overridable ascending-order check so an exact duplicate there is
a hard block (an "Override" on the order check would otherwise have let
two identical rightmost codes through, since equal counts as "not
greater" there too) — and auto-advances the cursor down after a
successful entry; a code typed in the wrong case for the active Code
Restriction is auto-corrected instead of rejected, with a one-time Caps
Lock notice (reusing the same caps-lock-tracking approach as the existing
heading-capitalization notice); the wizard's own "Codes must advance from
left to right" check is suppressed while guidance is active (entering a
row's own code before Fill Codes has carried the ancestor columns down is
the wizard's normal flow, not a mistake — the check still fires as before
everywhere else); and the coding stage's Numeric/Alpha prompt is now the
full Code Restriction dropdown, with the main-screen dropdown hidden for
guidance's whole duration so the two can't show, and conflict, at once.

New `src/domIds.ts` holds the code/desc cell DOM-id helpers, shared
between `Grid.tsx` (which renders them) and `GuidanceBanner.tsx` (which
needs to focus a specific cell directly for the duplicate notice) —
pulled out of `Grid.tsx` specifically to keep that file component-only
after oxlint's `only-export-components` flagged exporting a plain
function from it. Verified with `smoke_grid_refinements.mjs` (the
toggle, insert-anchor fix, multi-delete, wizard-only left-to-right
suppression with an outside-the-wizard regression check, case
auto-correction, and the rightmost column's no-cascade/full-range-
duplicate/auto-advance behavior) and `smoke_wizard_sort_and_duplicate.mjs`
(the Sort action end to end), plus a full re-run of the existing
regression suite — no regressions.

### Word/consonant mnemonic-suggestion rule (PR #82)
James's round-3 message walked back his own earlier "phonetic" framing
from PR #80's open question — what he actually does manually, working
through his real ASCO Credit Note Reasons example (attached in chat:
6 headings, e.g. "ORDER CANCELLED" with children "Order Cancelled Credit
Control" / "...by Consumer" / "...by Customer"), is pick a consonant from
a later, distinguishing word in the description, not a phonetic
judgement — no special library needed, just a clear priority order,
which he then stated directly. Replaced `suggestUnusedCode`'s old
"scan every character of the whole description in order" fallback with
exactly that order: first letter of the first word; then the first
letter of the next significant word (second word, or third if the second
is insignificant — a short stoplist: by/and/or/of/the/a/an/to/in/on/for/
with/from/as/at); then that word's first and second consonant; then the
first and second consonant of the word after that; and, if nothing there
is both usable and not already taken by an earlier sibling, leave the
row blank rather than grabbing an arbitrary next-available charset
letter with no connection to the description at all (his explicit "step
5" — prompt the user instead). New `findRowsNeedingManualCode` flags
exactly those left-blank rows; `GuidanceBanner.tsx` shows "Some entries
couldn't get an automatic code — please enter them manually" (checked
after the duplicate and out-of-order checks, in that priority) and drops
the cursor on the first one, same "drop the cursor there" treatment as
the duplicate notice. Applies at every level per his explicit ask to
generalize it, not just the rightmost column — no change needed to the
calling code, since `suggestMnemonicCodes` already looped over every
level. Removed `codeValidation.ts`'s `restrictionCharset`, which only
existed to serve the fallback this replaces. Verified against James's
own real dataset (both a single-heading case and the full 25-row Credit
Note Reasons structure, loaded as a project file to skip re-typing it
through the wizard) while investigating a separate Fill Codes bug report
from the same message that could **not** be reproduced despite
significant effort — tried the small case, the full real dataset, an
overtype-before-Fill-Codes sequence, an overtype-after-Fill-Codes-already-
ran sequence, and a fresh row added after an earlier Fill Codes pass;
Fill Codes worked correctly in every one. Left unfixed pending exact
repro steps from James (or the actual project file) rather than guessing
at a change that might not touch the real cause. New/updated tests:
extended `unit_guidance.mjs` for the word rule's priority steps
(including the stopword-skip case) and `findRowsNeedingManualCode`, new
`smoke_wizard_word_rule.mjs` for the manual-entry notice end to end; full
existing regression suite re-run clean.

### Caps Lock false-positive fix; shared sibling-group prefix stripping (PR #84)
James's fourth round, continuing to build out his real ASCO Credit Note
Reasons taxonomy. Two things:

1. Typing into the very first description cell with Caps Lock genuinely
   on still triggered "please turn Caps Lock on". Both that notice and
   the PR #80 code-case auto-correction notice relied on
   `KeyboardEvent.getModifierState('CapsLock')`, tracked passively from
   whatever typing happens anywhere in the grid, to guess whether to
   append the suggestion. Rather than chase why that guess misfired (not
   independently verifiable from here, and the physical key was never
   actually load-bearing — both cells force or convert case regardless),
   removed the guess entirely from both notices, keeping the plain
   explanatory text.
2. His own worked example: three children under "ORDER CANCELLED" — all
   starting "Order Cancelled..." — kept getting suggested "O" or "C" for
   every one of them, even the first, because nothing yet told the
   algorithm those two words were shared, meaningless boilerplate rather
   than genuine first-choice content. His exact words: "First Column code
   picks Order even though O pushes the available codes lower down to the
   end of the alphabet which does not work I used C for Cancelled — first
   letter of second word." Added `computeSharedPrefixLengths`: for each
   sibling group — determined from row structure (nearest shallower row
   above each row, i.e. its actual parent), not from parent *codes*, which
   are normally still blank at this point since Fill Codes hasn't run yet
   — finds how many leading words every member's description starts with
   in common (case-insensitively) and strips that many for every sibling
   before suggesting, not just the ones a collision happens to force
   further down the fallback chain. Also restated `suggestUnusedCode`'s
   priority order to match James's more precise round-4 rule: word 1's
   first letter, then word 2's, then word 3's; then word 1's first and
   second consonant, then word 2's, then word 3's; then leave blank. Kept
   PR #82's connector-word filter (by/and/etc.) — without it, "Order
   Cancelled BY Consumer" would offer "B" as a real candidate, which
   isn't just meaningless but can land earlier in the alphabet than an
   already-used sibling code and break ascending order for no reason —
   filtering removes it from the word list entirely now, rather than
   skipping-with-fallback-to-the-next-word as PR #82 did. Verified against
   his exact repro: produces C / N / S for the three children — distinct,
   ascending, each traceable to a real letter in its own description, but
   not byte-identical to his hand-picked C / S / T. Documented that gap
   plainly (in the PR and back to James) rather than quietly forcing a
   match: the consonant-counting mechanics land on the *first* available
   consonant each time, where his own picks seem to have skipped one
   further for reasons not fully recoverable from the example alone — he
   was clear this "particularly tricky example" was as much an invitation
   to see what the stated rule actually produces as a request to match it
   exactly.

Also re-attempted (unprompted, before writing up the response) the
still-unreproduced Fill Codes-after-overtype bug from PR #82/#83 against
this new algorithm's actual output plus an overtype-and-Override
sequence on the real dataset — still could not make Fill Codes fail.
Continues to await exact repro steps or the project file from James.
New/updated tests: `unit_guidance.mjs` gained James's exact 4-row repro,
a same-group-different-heading prefix case, a connector-word-only
isolation case, and an updated single-word-collision case (many now
resolve via word-1's own consonants rather than needing manual entry,
per the restated rule); `smoke_wizard_word_rule.mjs` rewritten around the
real repro; new `smoke_wizard_manual_entry.mjs` for the genuine
"nothing works" fallback. Full existing regression suite re-run clean.

---

*Maintained alongside each PR — update the "Current status" section and add
a new history entry whenever a round ships.*
