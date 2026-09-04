# Onboarding Prompt — Taxonomy Builder

**Purpose of this file:** this is a self-contained briefing for a brand-new Claude Code
session that has never seen this project before, has no memory of any prior conversation, and
knows nothing about the person who owns it. It exists because James A Robertson (the project
owner) asked for "an extremely detailed prompt for an instance of Claude Code that does not
know me and knows nothing about this project," as part of a full backup of the application.

If you are a Claude Code instance reading this because James (or whoever is running this
session) has pasted this file's contents to you, or pointed you at it: **read this whole file
first**, then follow the "First things to do" section at the bottom before touching any code.

---

## 1. What this project is

**Taxonomy Builder** is a browser-based facilitation tool for building structured, hierarchical
taxonomies — plain-English descriptive terms organised into a coded hierarchy (a Chart of
Accounts, a Product Class, a Division list, a Location list, and so on) — for use as master
data in an ERP or other business software.

It is explicitly **a facilitation aid, not an automated generator**. It guides a user (or a
small group of stakeholders) through a structured thinking process — prompting, warning,
assisting — while the actual judgement about what the taxonomy should contain remains theirs.
This philosophy matters: when in doubt about whether to build something *automatic* versus
something that *asks the user*, lean toward asking, unless the project's history (see
PROGRESS.md) shows the owner explicitly asked for an automated exception.

The owner, James A Robertson, runs "The ERP Doctor" (James A Robertson and Associates Limited).
He is a real, hands-on user of this tool — he builds real taxonomies with it (Chart of
Accounts, Divisions, Locations, GL mappings) using his own real client data (anonymised), finds
real bugs by using the app for real work, and gives direct, specific, practical feedback,
usually as a numbered list of several small items per message, sometimes with a spreadsheet or
CSV file attached showing exactly what he means. He is warm, appreciative, and direct — he says
thank you and means it, and he corrects course clearly and without fuss when something isn't
right. Match that tone: be precise, be thorough, and don't be afraid to ship real fixes rather
than just discussing them.

**Live app:** https://drjamesarobertson-design.github.io/taxonomy_builder/
**Repository:** `drjamesarobertson-design/taxonomy_builder` on GitHub.

## 2. The two documents that actually define this project

Before writing a single line of code, **read these two files in full**:

1. **`CLAUDE.md`** — the complete, authoritative functional specification (v1.1), agreed with
   James across many rounds of review. This is the source of truth for what the tool is
   *supposed* to do: the data model, the colour-coding rules, the case conventions (ALL
   CAPS vs. Proper Case), the coding conventions (gap coding, ascending order, padding), the
   facilitation workflow, every feature requirement, export/persistence behaviour, and — just
   as important — Section 9, "Explicitly Out of Scope for This Version," which lists things
   deliberately NOT built yet (don't build them unprompted).
2. **`PROGRESS.md`** — a running, round-by-round history of everything actually built, in the
   order it was built, including the exact wording of James's feedback that drove each change,
   what was tried, what broke, and how it was fixed. This is much more than a changelog — it
   carries the *reasoning* behind non-obvious decisions (e.g. why Auto Code reserves "9" for an
   Other/Miscellaneous entry, why the login's password check had to be case-insensitive, why a
   given CSV import heuristic exists). When you're unsure why something in the code works the
   way it does, search PROGRESS.md for it before assuming it's a bug.

Neither file is optional reading. `CLAUDE.md` is short enough to read in full every session (it
explicitly asks for this). `PROGRESS.md` is long — read the "Current status" section in full,
and search it (grep / find) for anything relevant to the task at hand rather than reading the
entire history top to bottom every time, unless you genuinely need the full picture.

Also present, for reference only (superseded in practice by the above, kept for history):
`Taxonomy_Builder_Build_Sequence.md` — the original staged build plan from before development
started (Stage 1 through Stage 5). It's useful background on the original intent but
`PROGRESS.md` is the record of what actually happened, which sometimes diverged.

## 3. Technology stack

- **React + TypeScript**, built with **Vite**.
- **Fully client-side** — no backend, no server, no database. Everything runs in the browser.
  This is a deliberate v1 constraint (CLAUDE.md Section 2), not an oversight — it shapes real
  design decisions (e.g. the login gate is explicitly a "speed bump, not real security," since
  there's no backend to actually guard anything; see `src/auth.ts`'s own file-level comment).
- **Persistence**: taxonomy project files are saved/loaded as local JSON files (via the
  File System Access API where supported, with a plain-download fallback) — see `src/storage.ts`.
  A separate "Library" feature persists multiple taxonomies in the browser's own IndexedDB —
  see `src/library.ts`. Session autosave uses `localStorage`.
- **Deployment**: static hosting on **GitHub Pages**, auto-deployed by a GitHub Actions
  workflow (`.github/workflows/deploy-pages.yml`) on every push to `main`. There is no manual
  deploy step — merging to `main` IS the deploy trigger.
- **Excel export** uses the `exceljs` library (see `src/gridExport.ts`).

### Running it locally

```bash
npm install
npm run dev        # starts a Vite dev server, default port 5173
npm run build      # tsc -b && vite build — type-checks AND builds; this is the CI-equivalent check
npm run lint       # oxlint
```

The dev server serves the app at `http://localhost:5173/taxonomy_builder/` (note the
`/taxonomy_builder/` base path — the app is configured to run under that path both locally and
on GitHub Pages, see `vite.config.ts`).

### Logging in

The app has a simple email/password sign-on gate (`src/Login.tsx` / `src/auth.ts`) shown before
anything else — explicitly a speed bump against casual access, not real security (read
`auth.ts`'s file comment for why). Test credentials, all seeded in `AUTH_USERS` in `auth.ts`:

- James's own: username `jamesar@jar-and-a.com`, password `jamesar@jar-and-a.com` (yes, the
  password is the same string as the username — this is intentional, see PROGRESS.md's login
  history). Both the username and password fields are compared case-insensitively.
- Nine simple friend accounts: username `Friend_1` through `Friend_9`, password same as
  username, for James to hand out to people trying the app without sharing his own credential.

If you ever need to add or change a login, `auth.ts`'s own comment gives the exact Node snippet
to generate a fresh salt + hash.

## 4. Repository structure (source of truth is the code — this is an orientation, not a full map)

```
CLAUDE.md                  — the functional specification (read first)
PROGRESS.md                — round-by-round build history (read second)
Taxonomy_Builder_Build_Sequence.md — original staged build plan (historical reference)
README.md                  — short dev-setup pointer
index.html                 — Vite entry HTML
vite.config.ts             — Vite config (note the /taxonomy_builder/ base path)
tsconfig*.json              — TypeScript project config
package.json / package-lock.json — dependencies and npm scripts
.github/workflows/deploy-pages.yml — the GitHub Pages auto-deploy workflow
public/
  help-text.csv            — field-level help text shown via "?" icons in the UI, editable
                              without a rebuild (a plain CSV, loaded at runtime)
src/
  App.tsx                  — the top-level app shell: sign-on gate, toolbar, all the modal
                              dialogs (Settings, Export choices, Library prompts, etc.), and
                              the glue between all the other components. This file is large and
                              grows with almost every feature — expect to spend time here.
  Grid.tsx                 — the actual taxonomy grid/spreadsheet component: cell editing, all
                              validation rules, right-click context menus, promote/demote,
                              sort, drag-and-drop, undo-relevant state. Also large, also central.
  types.ts                 — the core data model (TaxonomyProject, TaxonomyRow,
                              TaxonomySettings, WORKFLOW_LEVELS, etc.) — read this early to
                              understand the shape of everything else.
  guidance.ts               — the Simple Taxonomy guided wizard's supporting logic (mnemonic
                              code suggestion, ascending-order checks, Fill Codes/Pad Codes).
  autoCode.ts               — the general-purpose "Auto Code" gap-coding scheme, independent
                              of the wizard.
  csvImport.ts               — CSV import: three auto-detected shapes (this app's own Discrete
                              Columns export format with codes; a headerless code+description
                              format; a codeless "Level 1, Level 2, ..." format for tools like
                              a GL-mapping "GL Analyser"). This file's own comments explain the
                              detection heuristics in detail — read them before changing this
                              logic, it has accumulated a lot of hard-won nuance.
  gridExport.ts              — CSV/XLSX export (Discrete Columns and Concatenated modes).
  library.ts                 — the Library sidebar's IndexedDB persistence.
  storage.ts                  — save/load project files, session autosave, and the version-
                              migration logic for older project file shapes.
  auth.ts                     — the login gate.
  WorkflowMenu.tsx            — the post-sign-on landing menu (choose a taxonomy "level" to
                              start, or work on an existing one).
  SimpleTaxonomySetup.tsx / GuidanceBanner.tsx — the Simple Taxonomy guided wizard's own screens.
  NewTaxonomyForm.tsx / SettingsModal.tsx — the full taxonomy setup/settings forms used by every
                              other workflow level.
  LibrarySidebar.tsx          — the Library UI.
  colors.ts / caseUtils.ts / codeValidation.ts / domIds.ts / blockTransfer.ts / fileVersion.ts /
  exportFolder.ts / helpText.ts — smaller, focused helper modules; names are self-explanatory.
```

Every non-trivial function and most non-obvious lines in this codebase carry a comment
explaining *why*, not just *what* — this is a deliberate style choice throughout the project.
Read those comments; they usually pre-empt a question you'd otherwise have to ask, and they
often reference the specific round of feedback that produced that exact line of code (cross-
reference PROGRESS.md by PR number if you want the full story).

## 5. The established working relationship / workflow (important — read this section closely)

Across many rounds, a specific collaborative pattern has emerged. Unless James says otherwise,
follow it:

1. **James sends feedback** — usually a numbered list of several distinct, small-to-medium
   items in one message, sometimes with a real file attached (a CSV, an XLSX) that reproduces a
   bug or demonstrates what he wants. Read attachments carefully; he often includes exact,
   precise examples (e.g. "2 entries should code as 1, 5, not 1, 8") that should be matched
   exactly, not approximated.
2. **Work happens on a long-lived feature branch**, conventionally named
   `claude/review-claude-md-5ktqcm` in this project's history — recreated fresh from
   `origin/main` at the start of each round (`git fetch origin main && git checkout -B
   claude/review-claude-md-5ktqcm origin/main`), rather than left to accumulate across rounds.
   If continuing this exact project, you may find that branch name still in use; keep using it
   unless told otherwise. If this is a fresh fork/rebuild rather than a continuation, use
   whatever branch naming convention the actual repository owner asks for.
3. **Before implementing**, reproduce the reported bug first when one is reported — write a
   quick Playwright script against the local dev server, confirm you can see the actual
   failure, THEN fix it, THEN re-run the same script to confirm the fix. This project's history
   is full of cases where the real root cause was subtler than the first hypothesis (e.g. a
   confirm dialog's own focus-steal spuriously triggering a second, unrelated check) — a
   reproduction step before fixing saves real time versus guessing.
4. **Every round is verified with**, in order: `npx tsc --noEmit` (or `npm run build`, which
   includes it), `npm run lint`, and Playwright end-to-end tests exercising the actual change
   through the real UI (not just unit tests of the underlying function, though those are good
   too for pure-logic changes like CSV parsing or the Auto Code algorithm). Do not report a
   round as complete without all three passing.
5. **Each round ships as its own pull request** (or occasionally several, when the changes are
   large enough to verify independently) — implement, commit with a clear message explaining
   the "why," push, open a PR against `main`, squash-merge it, then confirm via the GitHub
   Actions API that the resulting `Deploy to GitHub Pages` workflow run actually succeeded
   before considering the round done. GitHub Actions runs on this project have occasionally
   taken much longer than usual on the `npm ci` step (7+ minutes some rounds) — this is
   infrastructure latency, not a sign of failure; be patient and re-check rather than assuming
   something broke.
6. **`PROGRESS.md` is updated as a separate, subsequent PR** after the code PR(s) merge and
   deploy successfully — not bundled into the same PR as the code change. Update both the
   "Current status" section (the feature-by-feature summary near the top) AND add a new,
   dated, narrative history entry (newest-first, inserted near the top of the history log,
   after the "Current status"/"Not yet built"/"Known open questions" sections) describing what
   was asked, what was found, and what was actually changed — in enough detail that a future
   session (like this one) can understand the reasoning without re-deriving it. Look at the
   existing history entries for the expected level of detail and tone before writing a new one.
7. **Commit and PR attribution**: follow whatever attribution convention the current session's
   system instructions specify (this has included a `Co-Authored-By:` trailer and a
   `Claude-Session:` link in past rounds) — check your own current instructions for the exact
   required format rather than copying an old commit verbatim, since the required format can
   change between sessions.
8. **After shipping**, send James a concise, plain-language summary of what changed — he is not
   a developer reading diffs; describe the user-visible behaviour, not the code.
9. When a request is genuinely ambiguous and there's no way to make a reasonable, low-risk call
   (as opposed to just under-specified, where a sensible default is fine), ask — but default to
   acting on a clear, well-reasoned interpretation rather than stalling on minor ambiguity,
   consistent with James's own evident preference for forward progress over back-and-forth.

## 6. A few running themes worth knowing up front

- **Multi-character Column 1 codes**: a taxonomy can configure Column 1 to hold 1–5 characters
  instead of the usual single character (`TaxonomySettings.column1CodeLength`). This single
  feature has required a surprising amount of care across the grid's validation, cascading,
  padding, and ascending-order-check logic — read the relevant comments in `Grid.tsx` closely
  before touching any code-cell logic, since a fix for the single-character case can easily
  break the multi-character case and vice versa.
- **The Simple Taxonomy guided wizard** vs. every other "workflow level": only "Simple
  Taxonomy" currently has a real guided, staged wizard (`SimpleTaxonomySetup.tsx` /
  `GuidanceBanner.tsx` / `guidance.ts`). Every other level (Advanced, Highly Experienced,
  Division, Location, Function, Chart of Accounts, Item Master) opens the same full,
  ungated setup form and grid — building out guided wizards for those is explicitly flagged as
  "not yet built" in PROGRESS.md, awaiting more detailed guidance from James.
- **CSV import auto-detects three distinct shapes** rather than asking the user to pick an
  importer — this was a deliberate design decision (see PROGRESS.md's discussion of whether a
  separate "Import GL Analyser" function was needed — the answer was no, the existing
  auto-detection already covers it).
- **Real files get attached often.** James frequently attaches real (anonymised) client data —
  GL Analyser exports, Chart of Accounts spreadsheets — to demonstrate exactly what's failing
  or what a feature should handle. Treat these as authoritative test fixtures, not just
  examples; write unit/Playwright tests against the actual attached file when practical.

## 7. First things to do, in order

1. Read `CLAUDE.md` in full.
2. Read the "Current status" section of `PROGRESS.md` in full (and skim the history section
   headings to know what's there, without necessarily reading every entry yet).
3. Run `npm install`, then `npm run dev` and `npm run build` to confirm the project builds
   cleanly in this environment before making any changes.
4. Confirm you can log in locally with the test credentials above and click through the app
   once (create a taxonomy, type a few rows, look at the right-click menus) to build a mental
   model that matches the spec you just read.
5. Only then start on whatever specific task you've actually been asked to do.

If you were hand ed this file as part of a full project backup (a zip of the repository plus
this document) rather than as a live continuation of an existing session, the git history in
`.git/` (if included in that backup) contains the complete commit-by-commit record referenced
throughout `PROGRESS.md` — every PR number mentioned there corresponds to a real, inspectable
commit or squash-merge in that history.
