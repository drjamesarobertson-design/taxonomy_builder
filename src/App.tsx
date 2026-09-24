import { useEffect, useRef, useState } from 'react';
import type { TaxonomyProject, TaxonomyRow, TaxonomySettings, SuffixField, CodeRestriction, WorkflowLevel } from './types';
import { createEmptyRow, createProject, growRowsToLevels, CODE_RESTRICTIONS } from './types';
import { saveProjectToFile, loadProjectFromFile, saveAutosave, loadAutosave } from './storage';
import {
  exportDiscreteCsv,
  exportDiscreteXlsx,
  exportConcatenatedCsv,
  exportConcatenatedXlsx,
  exportLockedXlsx,
  exportIncrementCsv,
  isChangedSinceLock,
  exportDiscreteCsvAs,
} from './gridExport';
import { exportBlock } from './blockTransfer';
import { chooseExportFolder, peekExportFolderName, supportsFileSystemAccess } from './exportFolder';
import { hasBlankCodeGaps, findAuditIssues } from './codeValidation';
import { padTrailingCodes } from './guidance';
import { toggleCase } from './caseUtils';
import type { AuditIssue } from './codeValidation';
import { codeInputId, descInputId } from './domIds';
import AuditPanel from './AuditPanel';
import type { AuditOrigin } from './AuditPanel';
import { AUTO_CODE_TYPES, IMPLEMENTED_AUTO_CODE_TYPES, autoCodeAlphaNumeric, fillRestOfGroup } from './autoCode';
import type { AutoCodeType } from './autoCode';
import { FORMAT_MODES, applyFormatDescriptions, collectUnknownAbbreviationWords } from './formatDescriptions';
import type { FormatMode } from './formatDescriptions';
import { loadHelpText } from './helpText';
import type { HelpTextMap } from './helpText';
import NewTaxonomyForm from './NewTaxonomyForm';
import SimpleTaxonomySetup from './SimpleTaxonomySetup';
import GuidanceBanner from './GuidanceBanner';
import SettingsModal from './SettingsModal';
import { parseDiscreteCsv, readFileAsText } from './csvImport';
import type { ParsedDiscreteCsv } from './csvImport';
import CsvImportConfirm from './CsvImportConfirm';
import type { CsvImportFields } from './CsvImportConfirm';
import type { SettingsFields } from './SettingsModal';
import Grid from './Grid';
import Logo from './Logo';
import LibrarySidebar from './LibrarySidebar';
import WorkflowMenu from './WorkflowMenu';
import Login from './Login';
import ResetPassword from './ResetPassword';
import { getSession, onAuthStateChange, signOut } from './auth';
import {
  LIBRARY_CATEGORIES,
  CUBIC_BUSINESS_MODEL_LIBRARY_CATEGORIES,
  listLibraryEntries,
  addLibraryEntry,
  updateLibraryEntryProject,
  renameLibraryEntry,
  setLibraryCategoryOrder,
  deleteLibraryEntry,
  importLibraryBundle,
} from './library';
import type { LibraryCategory, LibraryEntry, LibraryExportBundle } from './library';
import { bumpFileVersion } from './fileVersion';
import './App.css';

export default function App() {
  // James's ask: a small, always-visible "PR #nnn" tag so he can confirm — from inside the app
  // itself, without ever touching GitHub — that a refresh actually picked up the fix he was told
  // to expect. VITE_PR_NUMBER is set at build time by the GitHub Pages deploy workflow, parsed
  // straight from the merged commit's own message (deploy-pages.yml); it's genuinely absent in
  // an ordinary local `npm run dev`, which is the only time "Local build" shows instead.
  const buildInfoTag = (
    <div className="build-info-tag" aria-hidden="true">
      {import.meta.env.VITE_PR_NUMBER ? `PR #${import.meta.env.VITE_PR_NUMBER}` : 'Local build'}
    </div>
  );

  // Sign-on gate — real accounts via Supabase (auth.ts), which persists its own session in
  // this browser (survives reloads; only Log Out or clearing site data forgets it). The
  // initial session check is async, so `authChecked` gates rendering Login vs. the app itself
  // to avoid flashing the login screen for a split second on every reload before the existing
  // session is confirmed. `passwordRecovery` is set when the auth listener sees a
  // PASSWORD_RECOVERY event — the user just clicked a "reset your password" email link — and
  // shows the Set New Password screen instead of either Login or the ordinary app.
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  // Automated testing hook, dev builds only: Supabase now owns real sign-on, but the sandboxed
  // environment this is developed in has no network path to Supabase's own domain (a hard
  // gateway policy, confirmed via the proxy's own status endpoint) — so every Playwright test
  // of the REST of the app (Grid, exports, etc.) would otherwise be unable to get past the
  // login screen at all. `import.meta.env.DEV` is always false in a production build (`vite
  // build`), so this can never activate on the deployed site regardless of URL — it also
  // requires the explicit query param, so an ordinary `npm run dev` session still goes through
  // real Supabase login unless a test script deliberately asks to skip it.
  const devAuthBypass =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('test-bypass-auth') === '1';
  useEffect(() => {
    if (devAuthBypass) {
      setAuthedEmail('dev-test@local');
      setAuthChecked(true);
      return;
    }
    getSession().then((session) => {
      setAuthedEmail(session?.user.email ?? null);
      setAuthChecked(true);
    });
    const {
      data: { subscription },
    } = onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
        return;
      }
      setAuthedEmail(session?.user.email ?? null);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [project, setProject] = useState<TaxonomyProject | null>(null);
  // The sign-on landing menu (WorkflowMenu) shows first with no taxonomy open; picking either
  // path reveals today's existing screens underneath. `chosenWorkflowLevel` is purely a label
  // shown above the setup form for now — the six levels don't yet drive different behaviour,
  // so it isn't persisted into the project itself (that's the next piece of work).
  const [signOnStage, setSignOnStage] = useState<'menu' | 'new' | 'existing'>('menu');
  const [chosenWorkflowLevel, setChosenWorkflowLevel] = useState<WorkflowLevel | null>(null);
  // Session autosave (storage.ts): whatever's currently open is written there on every change,
  // independent of signing in/out, so "Resume Work in Progress" on the landing menu can bring
  // it back after a reload, a browser restart, or a log-out/log-in cycle — none of which
  // otherwise leave anything to return to, since `project` itself is plain in-memory state.
  useEffect(() => {
    if (project) saveAutosave(project);
  }, [project]);

  // James's ask: every popup/dialog in the app (there are dozens, scattered across this file,
  // Grid.tsx, GuidanceBanner.tsx, SettingsModal.tsx, NewTaxonomyForm.tsx, CsvImportConfirm.tsx
  // and LibrarySidebar.tsx) should accept Enter for its own default response, not just a mouse
  // click. Rather than wiring an onKeyDown into each one individually, this single listener
  // covers all of them at once: every such dialog shares the "validation-dialog" class and lists
  // its buttons with the primary/forward action last (Cancel-then-Confirm, No-then-Yes,
  // Keep-then-Fix, or a single OK/Continue), so Enter activates whichever button is last.
  //
  // Led by "is a dialog open" rather than "what currently has focus": several of these dialogs
  // (the simpler one-off notices especially) never explicitly move focus into themselves when
  // they appear, so focus can easily still be sitting on whatever grid cell or button was active
  // just before — checking the target's own ancestry for a dialog would miss those entirely.
  // Once a dialog is open, Enter is only left alone for a text INPUT/TEXTAREA that's genuinely
  // INSIDE that dialog (the Find box, the note editor) — those already do the right thing with
  // Enter on their own, whether that's a newline or their own form submission. A dialog that
  // calls stopPropagation on its own keydown (Add Columns' picker, deliberately, to stop Enter
  // doing anything while choosing) never reaches this handler at all, same as it never reaches
  // any other ancestor listener.
  useEffect(() => {
    function handleGlobalEnterKey(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      const dialog = document.querySelector('.validation-dialog');
      if (!dialog) return;
      const target = e.target as HTMLElement | null;
      if (target && dialog.contains(target) && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      const buttons = dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const defaultButton = buttons[buttons.length - 1];
      if (defaultButton) {
        e.preventDefault();
        defaultButton.click();
      }
    }
    document.addEventListener('keydown', handleGlobalEnterKey);
    return () => document.removeEventListener('keydown', handleGlobalEnterKey);
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autoFocusFirstRow, setAutoFocusFirstRow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Item 2: importing an existing taxonomy already in the same code-columns/description-
  // columns shape this app's own Discrete Columns CSV export uses (csvImport.ts infers the
  // structure; the file itself carries no title/table name/purpose, so those are collected
  // in a small confirm step once parsing succeeds).
  const csvImportFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingCsvImport, setPendingCsvImport] = useState<{ parsed: ParsedDiscreteCsv; defaultTitle: string } | null>(
    null,
  );

  // Bumped every time a genuinely new or freshly-loaded project replaces the current one (never
  // on an ordinary edit) — passed to Grid as its React key, so Grid remounts cleanly instead of
  // carrying over stale internal state (selection, the one-time capitalization notice, etc.)
  // from whatever taxonomy was open before.
  const [projectGeneration, setProjectGeneration] = useState(0);

  // Undo/redo (Section 6.8) over the grid's rows. Consecutive edits to the same field (the
  // same code or description cell, identified by Grid's coalesceKey) merge into one undo
  // step rather than one step per keystroke; every other kind of change — promote/demote,
  // insert/delete, sort, case toggle, move — always gets its own step.
  const [undoStack, setUndoStack] = useState<TaxonomyRow[][]>([]);
  const [redoStack, setRedoStack] = useState<TaxonomyRow[][]>([]);
  const lastEditKeyRef = useRef<string | null>(null);

  // Export (Section 7 / Section 9): choosing "Export to CSV" or "Export to Excel" opens a
  // small dialog to pick Discrete Columns (Section 7, matches the on-screen grid) or
  // Concatenated (Section 9, one combined code/description per row for ERP import).
  const [exportChoice, setExportChoice] = useState<{ format: 'csv' | 'xlsx' } | null>(null);
  const exportDialogRef = useRef<HTMLDivElement>(null);

  // Padding is always typed as "." now (Settings/New Taxonomy no longer offer "0" — some ERPs
  // still can't accept "." in a code field, so that's handled as a one-off substitution on the
  // way out, per export, rather than a taxonomy-wide setting that risks getting left on by
  // habit). Only offered when the taxonomy's own padding character is still ".": an older
  // project already configured with "0" has nothing to substitute.
  const [paddingSubstituteChoice, setPaddingSubstituteChoice] = useState<{
    mode: 'discrete' | 'concatenated';
    excludeDelimiters?: boolean;
    suffixMode?: 'concatenate' | 'rightAlign';
  } | null>(null);
  const paddingSubstituteDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paddingSubstituteChoice) paddingSubstituteDialogRef.current?.focus();
  }, [paddingSubstituteChoice]);

  // Item 4: only asked when the taxonomy actually has suffix columns configured — meaningless
  // otherwise. "Concatenate" folds every suffix's value (with its own delimiter) onto the end
  // of the row's description text and drops the separate suffix column(s) from the export;
  // "Right Align" is today's existing behaviour — suffixes stay in their own column(s)
  // (Concatenated mode has no suffix columns at all, so there "Right Align" just means suffixes
  // are left out of that export, same as before this option existed).
  const [suffixModeChoice, setSuffixModeChoice] = useState<{
    mode: 'discrete' | 'concatenated';
    excludeDelimiters?: boolean;
  } | null>(null);
  const suffixModeDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (suffixModeChoice) suffixModeDialogRef.current?.focus();
  }, [suffixModeChoice]);

  // Item 3: "Export Block" from the grid's own right-click menu, scoped to a selected row
  // range rather than the whole table (the toolbar's "Create Block" button).
  const [exportBlockRangeChoice, setExportBlockRangeChoice] = useState<{ rows: TaxonomyRow[] } | null>(null);
  const exportBlockRangeDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (exportBlockRangeChoice) exportBlockRangeDialogRef.current?.focus();
  }, [exportBlockRangeChoice]);

  // Save/Export both check for a code cell left blank within a row's own valid range first —
  // easy to overlook mid-entry, and worth a nudge before the file goes out the door. "Accept"
  // proceeds with whichever save/export action was actually requested; "Cancel" backs out
  // entirely so the user can go fix it.
  const [blankCodeWarning, setBlankCodeWarning] = useState<{ action: () => void } | null>(null);
  const blankCodeDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (blankCodeWarning) blankCodeDialogRef.current?.focus();
  }, [blankCodeWarning]);

  // A save gave no visible sign it had happened — the button looked identical before and
  // after. Flash its label to confirm the click actually registered and the file was written.
  const [justSaved, setJustSaved] = useState(false);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Item 14: a way back to the taxonomy's own settings from the working screen, since it's
  // easy to forget to adjust something (e.g. the description length limit) before the grid
  // fills up with rows built against it.
  const [showSettings, setShowSettings] = useState(false);

  // Lock Taxonomy menu (James's ask): the plain "Lock Taxonomy" button becomes a small dropdown
  // once a taxonomy exists — item (a) is the original lock action unchanged; items (b)-(f) only
  // make sense once actually locked (there's nothing "since the last Lock" before the first
  // one), so they're only shown then.
  const [showLockMenu, setShowLockMenu] = useState(false);
  const lockMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLockMenu) return;
    const close = (e: MouseEvent) => {
      if (!lockMenuRef.current?.contains(e.target as Node)) setShowLockMenu(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showLockMenu]);

  // A React-rendered confirm for Lock/Lock updates, in place of window.confirm() — see
  // handleLockTaxonomy's own comment for why: a native confirm() dialog can consume the click's
  // user activation before the save afterward gets to call the native Save-As picker.
  const [lockConfirm, setLockConfirm] = useState<'lock' | 'lockUpdates' | null>(null);

  // Audit Taxonomy (James's spec, considerably elaborated in review): Lock Taxonomy no longer
  // runs its own separate integrity check — it launches this walkthrough instead, and can't
  // proceed until it comes back clean (mandatory, no bypass — James: "should not be able to
  // lock an incomplete taxonomy"). Also reachable standalone from its own toolbar button, and
  // offered (default yes) before Export to CSV, since that export feeds other software where
  // completeness matters — Export to Excel, being for review/inspection, isn't gated by it.
  //
  // `originalIssues` is the fixed list found when this run started; `cursor` walks through it.
  // The "N" in "Issue X of N" stays fixed at that original count for the whole run, even though
  // an already-cleared entry is silently skipped over (advanceAudit) rather than lowering N —
  // matching James's own worked example ("Fixed. Issue 3 of 5").
  // Walks row-by-row (`originalRowIds`, distinct rows carrying >=1 issue, in row order,
  // captured when this run started — that's the fixed "N" in "Issue X of N") rather than a
  // frozen list of individual issues. That distinction matters: fixing one problem on a row can
  // reveal a genuinely different one on the SAME row that wasn't checkable before (a blank
  // description also masks whatever's wrong with that row's code, since the code check only
  // runs once a level exists) — tracking issue *instances* missed that case entirely (a first
  // cut of this did, and silently reported "clean" with a still-blank code left behind).
  // `currentIssue` is always the latest fresh check's result for `originalRowIds[cursor]`, so a
  // row with two problems in sequence is shown correctly both times without advancing cursor
  // between them.
  const [audit, setAudit] = useState<{
    origin: AuditOrigin;
    originalRowIds: string[];
    cursor: number;
    currentIssue: AuditIssue | null;
    status: 'checking' | 'clean' | 'issue' | 'resuming';
    // Tranche 2's soft, override-able checks (otherNotLast/oversized/outlier — Section 6.7:
    // "inform, never block") are "Accept"-ed rather than fixed. Keys are `${rowId}:${kind}`,
    // scoped to this one audit run — a fresh run re-surfaces anything still true, since
    // accepting one is a judgement call for right now, not a standing suppression.
    accepted: ReadonlySet<string>;
  } | null>(null);
  // The "Audit — Y/N" prompt (default Yes) shown before Export to CSV specifically.
  const [csvAuditPrompt, setCsvAuditPrompt] = useState(false);
  // James's report: on a long walkthrough (his real file's 19-20 issues), an accidental or
  // exploratory click on "Exit Audit" dropped straight out of the whole thing with no way back
  // to exactly where he was — "really need a pop-up 'Exit Audit? Please Confirm'". Gates the
  // actual exit (performAuditExit) behind one extra confirm, same validation-overlay/-dialog
  // pattern as every other confirm in this app.
  const [auditExitConfirm, setAuditExitConfirm] = useState(false);
  // Where the panel should re-anchor to (near the cell App.tsx just jumped to) — null while
  // there's no cell for the current state (checking/clean/auto-fixable). Set only by
  // jumpToAuditIssue below.
  const [auditAnchor, setAuditAnchor] = useState<{ top: number; left: number } | null>(null);
  // The one DOM id currently wearing the audit-target-cell highlight, so the NEXT jump (or
  // Exit) can clean up the PREVIOUS one before applying a new one — a plain ref rather than
  // state, since it's a direct DOM side effect, not something that drives a render.
  const highlightedCellIdRef = useRef<string | null>(null);

  // Auto Code (James's ask): a general-purpose numeric-first gap-coding action, independent of
  // the Simple Taxonomy wizard's own mnemonic Suggest Codes — usable any time, on any taxonomy,
  // most useful for one imported with no codes at all (like Import CSV's description-only path).
  // The dropdown names every code type up front, per James's own ask, so it doesn't need
  // rebuilding later — only one is actually implemented so far (autoCode.ts).
  const [showAutoCode, setShowAutoCode] = useState(false);
  const [autoCodeType, setAutoCodeType] = useState<AutoCodeType>(AUTO_CODE_TYPES[0]);

  // Format Descriptions (James's ask): bulk ALL CAPS / Proper Case cleanup for scrappy input,
  // scoped by `formatMode`, with an interactive "keep this in caps?" queue for any ALL-CAPS
  // word Format Descriptions doesn't already recognise as an abbreviation — mirrors
  // GuidanceBanner's own bandSuggestions queue: one prompt at a time, `queue` shrinks by one
  // per answer, `accepted` collects the words to add to this taxonomy's own custom
  // abbreviation library once the whole queue is resolved.
  const [showFormatDescriptions, setShowFormatDescriptions] = useState(false);
  const [formatMode, setFormatMode] = useState<FormatMode>(FORMAT_MODES[2]);
  const [abbreviationPrompt, setAbbreviationPrompt] = useState<{
    mode: FormatMode;
    scopeRowIds: ReadonlySet<string> | undefined;
    queue: string[];
    accepted: string[];
  } | null>(null);
  // James's ask: Format Descriptions should default to formatting just whatever's currently
  // selected in the grid, offering the whole taxonomy as a separate, explicitly confirmed
  // action rather than the only option — Grid.tsx reports its own internal selection up via
  // onSelectionChange since App.tsx doesn't otherwise have visibility into it. undefined
  // scopeRowIds (passed to formatDescriptions.ts) means "every row" throughout.
  const [gridSelectionRowIds, setGridSelectionRowIds] = useState<ReadonlySet<string> | null>(null);
  // "Format Entire Worksheet" needs its own confirmation step (James's ask) — holds the mode to
  // run once confirmed; null means that confirmation isn't currently showing.
  const [formatEntireConfirm, setFormatEntireConfirm] = useState<FormatMode | null>(null);

  // Export folder (Section 8-adjacent convenience James asked for): on Chromium browsers,
  // Save/Export can write straight into a folder picked once via the File System Access API,
  // remembered across reloads, instead of prompting a fresh "Save As" dialog every time.
  const [exportFolderName, setExportFolderName] = useState<string | null>(null);
  useEffect(() => {
    peekExportFolderName().then(setExportFolderName);
  }, []);

  // Field-level help text (item: help icons on the setup screens): loaded once from
  // public/help-text.csv, a plain file meant to be edited directly and pushed to the repo —
  // no code change or rebuild step of its own needed for new help text to go live.
  const [helpText, setHelpText] = useState<HelpTextMap>({});
  useEffect(() => {
    loadHelpText().then(setHelpText);
  }, []);

  // Worksheet Guidance (process/convention guidance for building this taxonomy, as opposed to
  // the per-field help icons): collapsed to a short preview by default since it's expected to
  // hold a fair amount of text, with a click to expand to the full thing.
  const [guidanceExpanded, setGuidanceExpanded] = useState(false);

  // The Library (left-hand sidebar): a place to keep multiple built taxonomies for quick
  // reference/further work, per taxonomy heading. Entries persist in this browser's own
  // IndexedDB (see library.ts) — a separate, additional place to park a copy, not a
  // replacement for Save to File. currentLibraryEntryId tracks whether the taxonomy
  // currently open in the work area is tied to one particular Library entry — set whenever
  // a taxonomy is brought in via "Move to Work Area" or freshly added, cleared whenever a
  // genuinely different project replaces it (New Taxonomy, Load from File) — so "Add to
  // Library" knows whether to update that same entry in place or prompt for a new one.
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [currentLibraryEntryId, setCurrentLibraryEntryId] = useState<string | null>(null);
  const [libraryCategoryPrompt, setLibraryCategoryPrompt] = useState<LibraryCategory>(LIBRARY_CATEGORIES[0]);
  const [showLibraryCategoryPrompt, setShowLibraryCategoryPrompt] = useState(false);
  // James's ask: let the taxonomy's name be adjusted right here, before it's saved to the
  // Library, rather than only after the fact via a separate rename — initialised from the
  // taxonomy's own current title each time the dialog opens.
  const [libraryNamePrompt, setLibraryNamePrompt] = useState('');
  const [libraryRemoveTarget, setLibraryRemoveTarget] = useState<LibraryEntry | null>(null);
  // James's report: with the Library sidebar sitting off to the side, picking a taxonomy from
  // it wasn't obvious from "Work on an Existing Taxonomy" — right-click "Move to Work Area" got
  // it done, but nothing here pointed at that. This dialog is a direct, discoverable way in.
  const [showLoadFromLibrary, setShowLoadFromLibrary] = useState(false);
  const [showLibraryOverwritePrompt, setShowLibraryOverwritePrompt] = useState(false);
  const [justAddedToLibrary, setJustAddedToLibrary] = useState(false);
  const libraryAddedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // James's ask: two more entries under "Work on an Existing Taxonomy". GL Analyser doesn't
  // exist yet — this is purely a placeholder notice. GL Builder points at a 15-year-old client
  // product being converted for Taxonomy Builder; in the meantime it offers the one piece of
  // that workflow that's genuinely useful now — exporting the four Cubic Business Model tables
  // (Division/Location/Function/Chart of Accounts) as a matched set of standard CSVs, each
  // picked from the Library and named for direct hand-off to GL Builder once it exists.
  const [showGLAnalyserNotice, setShowGLAnalyserNotice] = useState(false);
  const [showGLBuilder, setShowGLBuilder] = useState(false);
  const [glBuilderSuffix, setGlBuilderSuffix] = useState('');
  const GL_BUILDER_CATEGORIES: { category: LibraryCategory; prefix: string; label: string }[] = [
    { category: 'Division', prefix: '1_Division', label: 'Division' },
    { category: 'Location', prefix: '2_Location', label: 'Location' },
    { category: 'Function', prefix: '3_Function', label: 'Function' },
    { category: 'Chart of Accounts', prefix: '4_Accounts', label: 'Chart of Accounts' },
  ];
  const [glBuilderSelection, setGlBuilderSelection] = useState<Record<string, string>>({});
  const [glBuilderExporting, setGlBuilderExporting] = useState(false);

  function openGLBuilder() {
    setGlBuilderSuffix('');
    setGlBuilderSelection({});
    setShowGLBuilder(true);
  }

  async function handleGLBuilderExport() {
    const suffix = glBuilderSuffix.trim();
    if (!suffix) return;
    setGlBuilderExporting(true);
    for (const { category, prefix } of GL_BUILDER_CATEGORIES) {
      const entryId = glBuilderSelection[category];
      if (!entryId) continue;
      const entry = libraryEntries.find((e) => e.id === entryId);
      if (!entry) continue;
      const { cancelled } = await exportDiscreteCsvAs(entry.project, `${prefix} ${suffix}.csv`);
      if (cancelled) break; // user backed out of the Save dialog — stop rather than firing the rest unattended
    }
    setGlBuilderExporting(false);
    setShowGLBuilder(false);
  }

  function refreshLibrary() {
    listLibraryEntries().then(setLibraryEntries);
  }

  useEffect(() => {
    refreshLibrary();
  }, []);

  function flashAddedToLibrary() {
    if (libraryAddedFlashTimer.current) clearTimeout(libraryAddedFlashTimer.current);
    setJustAddedToLibrary(true);
    libraryAddedFlashTimer.current = setTimeout(() => setJustAddedToLibrary(false), 1600);
  }

  function handleAddToLibraryClick() {
    if (!project) return;
    if (currentLibraryEntryId) {
      // Already linked to a Library entry — never overwrite silently (James's report):
      // ask whether to update that same entry or park this as a new, separately-numbered
      // version alongside it.
      setShowLibraryOverwritePrompt(true);
    } else {
      setLibraryCategoryPrompt(LIBRARY_CATEGORIES[0]);
      setLibraryNamePrompt(project.title || '');
      setShowLibraryCategoryPrompt(true);
    }
  }

  function confirmAddToLibrary() {
    if (!project) return;
    const title = libraryNamePrompt.trim() || project.title;
    const namedProject = { ...project, title };
    addLibraryEntry(namedProject, libraryCategoryPrompt).then((entry) => {
      setProject(namedProject);
      setCurrentLibraryEntryId(entry.id);
      setShowLibraryCategoryPrompt(false);
      refreshLibrary();
      flashAddedToLibrary();
    });
  }

  function confirmOverwriteLibraryEntry() {
    if (!project || !currentLibraryEntryId) return;
    updateLibraryEntryProject(currentLibraryEntryId, project).then(() => {
      setShowLibraryOverwritePrompt(false);
      refreshLibrary();
      flashAddedToLibrary();
    });
  }

  // A prior "New Version" leaves an " v1.NN" suffix on the title (mirroring the existing
  // Save-to-File filename convention) — stripped before appending the next one, so repeated
  // versioning reads "Title v1.03", never "Title v1.02 v1.03".
  function stripLibraryVersionSuffix(title: string): string {
    return title.replace(/ v1\.\d{2,}$/, '');
  }

  function confirmNewLibraryVersion() {
    if (!project || !currentLibraryEntryId) return;
    const linkedEntry = libraryEntries.find((e) => e.id === currentLibraryEntryId);
    const category = linkedEntry?.category ?? LIBRARY_CATEGORIES[0];
    const { project: versioned, versionLabel } = bumpFileVersion(project, 'library');
    const newProject = { ...versioned, title: `${stripLibraryVersionSuffix(versioned.title)}${versionLabel}` };
    addLibraryEntry(newProject, category).then((entry) => {
      setProject(newProject);
      setCurrentLibraryEntryId(entry.id);
      setShowLibraryOverwritePrompt(false);
      refreshLibrary();
      flashAddedToLibrary();
    });
  }

  function handleMoveToWorkArea(entry: LibraryEntry) {
    if (dirty && !confirm('Discard unsaved changes to the current taxonomy and open this one from the Library?')) {
      return;
    }
    setProject(entry.project);
    setCurrentLibraryEntryId(entry.id);
    setDirty(false);
    setAutoFocusFirstRow(false);
    setLoadError(null);
    setUndoStack([]);
    setRedoStack([]);
    lastEditKeyRef.current = null;
    setProjectGeneration((g) => g + 1);
  }

  function handleRenameLibraryEntry(id: string, title: string) {
    renameLibraryEntry(id, title).then(refreshLibrary);
  }

  function handleReorderLibrary(category: LibraryCategory, orderedIds: string[]) {
    setLibraryCategoryOrder(category, orderedIds).then(refreshLibrary);
  }

  function handleImportLibrary(bundle: LibraryExportBundle) {
    importLibraryBundle(bundle).then(refreshLibrary);
  }

  function handleRemoveLibraryEntry() {
    if (!libraryRemoveTarget) return;
    const { id } = libraryRemoveTarget;
    deleteLibraryEntry(id).then(() => {
      if (id === currentLibraryEntryId) setCurrentLibraryEntryId(null);
      setLibraryRemoveTarget(null);
      refreshLibrary();
    });
  }

  async function handleChooseFolder() {
    const folder = await chooseExportFolder();
    if (folder) setExportFolderName(folder.name);
  }

  // The whole app (sign-on screen and the working grid screen alike) uses the dark blue /
  // white sans-serif chrome; only the grid table itself stays white (styled directly, not
  // via this theme). Applied on the body so it covers the full page, not just the
  // width-constrained .app box.
  useEffect(() => {
    document.body.classList.add('app-dark-theme');
    return () => document.body.classList.remove('app-dark-theme');
  }, []);

  useEffect(() => {
    if (exportChoice) exportDialogRef.current?.focus();
  }, [exportChoice]);

  // Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo) work anywhere in the grid,
  // including while a cell is focused — our own row-level undo takes priority over the
  // browser's native per-field undo, so it stays consistent with the toolbar buttons.
  useEffect(() => {
    if (!project) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if (e.altKey) return;
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function handleCreate(
    title: string,
    tableName: string,
    purpose: string,
    maxDescriptionLength: number,
    delimiterPositions: number[],
    indentChar: string,
    numLevels: number,
    suffixes: SuffixField[],
    paddingChar: string,
    codeDelimiterChar: string,
  ) {
    const newProject = createProject(
      title,
      tableName,
      purpose,
      maxDescriptionLength,
      delimiterPositions,
      indentChar,
      numLevels,
      suffixes,
      paddingChar,
      codeDelimiterChar,
    );
    // Start the user off with a row already in place, cursor ready, rather than an empty grid.
    newProject.rows = [createEmptyRow(newProject.settings.numLevels, suffixes)];
    setProject(newProject);
    setDirty(true);
    setAutoFocusFirstRow(true);
    setUndoStack([]);
    setRedoStack([]);
    lastEditKeyRef.current = null;
    setCurrentLibraryEntryId(null);
    setProjectGeneration((g) => g + 1);
  }

  // Simple Taxonomy's trimmed setup screen (SimpleTaxonomySetup) only asks for the four fields
  // Section 5 step 1 actually needs up front, plus Column 1 Code Length — everything else
  // structural (delimiters, suffixes, code restriction) stays at its default until the wizard's
  // coding stage needs it. Starts at a single description level with no code columns yet;
  // GuidanceBanner drives it from there.
  function handleCreateSimpleTaxonomy(
    title: string,
    tableName: string,
    purpose: string,
    maxDescriptionLength: number,
    column1CodeLength: number,
    properCaseOnly: boolean,
    singleCodeColumn: boolean,
  ) {
    const newProject = createProject(title, tableName, purpose, maxDescriptionLength, [], ' ', 1);
    newProject.settings.guidance = { level: 'Simple Taxonomy', stage: 'headings' };
    newProject.settings.column1CodeLength = column1CodeLength;
    newProject.settings.properCaseOnly = properCaseOnly;
    newProject.settings.singleCodeColumn = singleCodeColumn;
    // James's report: the wizard's own Code Restriction prompt (GuidanceBanner) preselects
    // whatever the taxonomy already has, which was silently the global default "Alpha Numeric
    // with All Alpha" — not the sensible starting point for auto-suggested mnemonic codes drawn
    // from ALL CAPS/Proper Case English text. Simple Taxonomy taxonomies start from the
    // upper-case-alpha restriction instead; still fully changeable in that same prompt.
    newProject.settings.codeRestriction = 'Alpha Numeric with Upper Case Alpha Only';
    newProject.rows = [createEmptyRow(1)];
    setProject(newProject);
    setDirty(true);
    setAutoFocusFirstRow(true);
    setUndoStack([]);
    setRedoStack([]);
    lastEditKeyRef.current = null;
    setCurrentLibraryEntryId(null);
    setProjectGeneration((g) => g + 1);
  }

  function handleExitGuidance() {
    if (!project) return;
    handleSettingsAndRowsChange({ ...project.settings, guidance: undefined }, project.rows);
  }

  function handleRowsChange(rows: TaxonomyRow[], coalesceKey?: string) {
    if (!project) return;
    const shouldCoalesce = coalesceKey !== undefined && coalesceKey === lastEditKeyRef.current;
    if (!shouldCoalesce) {
      setUndoStack((stack) => [...stack, project.rows]);
      setRedoStack([]);
    }
    lastEditKeyRef.current = coalesceKey ?? null;
    setProject({ ...project, rows });
    setDirty(true);
  }

  function handleUndo() {
    if (undoStack.length === 0 || !project) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, project.rows]);
    lastEditKeyRef.current = null;
    setProject({ ...project, rows: previous });
    setDirty(true);
  }

  function handleRedo() {
    if (redoStack.length === 0 || !project) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, project.rows]);
    lastEditKeyRef.current = null;
    setProject({ ...project, rows: next });
    setDirty(true);
  }

  // `projectOverride` (Lock Taxonomy): saves a freshly-built project object directly rather
  // than whatever's currently in `project` state — needed because setProject() followed
  // immediately by performSave() would still see the OLD project through this render's
  // closure, saving the taxonomy un-locked.
  async function performSave(projectOverride?: TaxonomyProject) {
    const toSave = projectOverride ?? project;
    if (!toSave) return;
    // saveProjectToFile bumps and returns the project's own "save" version counter (used to
    // build its " v1.NN" filename) — persisted back into state, bypassing undo/redo, since
    // it's bookkeeping metadata, not a user edit. It also reports whether the file actually
    // landed in the remembered folder or fell back to a plain download (e.g. permission
    // lapsed) — if it fell back, the "Folder: X" button is no longer telling the truth, so
    // clear it back to "Choose Export Folder" rather than leave a stale, inoperative label.
    const { project: versioned, usedFolder, cancelled } = await saveProjectToFile(toSave);
    if (cancelled) return; // backed out of the Save As dialog — nothing happened
    setProject(versioned);
    setDirty(false);
    if (usedFolder) peekExportFolderName().then(setExportFolderName);
    else setExportFolderName(null);
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    setJustSaved(true);
    savedFlashTimer.current = setTimeout(() => setJustSaved(false), 1600);
  }

  function handleSave() {
    if (!project) return;
    if (hasBlankCodeGaps(project.rows)) {
      setBlankCodeWarning({ action: performSave });
      return;
    }
    performSave();
  }

  // Lock Taxonomy: once a taxonomy has gone live and carries real transactions against its
  // codes, every row currently in the table gets marked `protected` (Grid.tsx then refuses to
  // edit or delete them, and only allows inserting new rows where a real code gap exists) and
  // the file is saved immediately, so the locked state is captured on disk, not just in memory.
  //
  // James's report: the native window.confirm() this used to go through opened the Save dialog
  // with no prompt for a location — it just fell straight through to a plain download. A native
  // confirm() dialog can consume the click's own "user activation" before performSave ever gets
  // to call the File System Access API's showSaveFilePicker(), which silently falls back to a
  // plain download the moment it's called without one (saveExportFile's own catch-all). Every
  // other Save/Export button in this app calls performSave/its export function directly from a
  // React onClick with nothing native in between, which is exactly why only Lock had this bug.
  // Fixed by asking through the app's own React-rendered confirm dialog instead (lockConfirm
  // below) — its "Continue" button's own onClick is a fresh, valid user gesture in its own
  // right, so the picker opens normally from there.
  function handleLockTaxonomy() {
    if (!project) return;
    // James's report: Lock allowed locking a taxonomy with no codes at all. This is a hard
    // gate, not a dismissible warning — Lock exists specifically to guarantee integrity for
    // data an ERP may already be posting against, so letting an incomplete taxonomy through
    // (even with an explicit "yes I know") would undermine the one thing Lock is for. Now
    // routed entirely through Audit Taxonomy (below) rather than a separate check of its own.
    runAudit('lock');
  }

  /** Identifies one issue for the Accept set — a row can only ever carry one issue of a given
   * kind at a time, so rowId+kind is a stable, sufficient key across repeated fresh checks. */
  function auditIssueKey(issue: AuditIssue): string {
    return `${issue.rowId}:${issue.kind}`;
  }

  /** Every distinct rowId carrying >=1 issue, in row order — the fixed "N" denominator for
   * "Issue X of N", and the list `advanceAudit` walks. */
  function rowsWithIssues(issues: AuditIssue[]): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const issue of issues) {
      if (!seen.has(issue.rowId)) {
        seen.add(issue.rowId);
        ids.push(issue.rowId);
      }
    }
    return ids;
  }

  function clearAuditHighlight() {
    if (highlightedCellIdRef.current) {
      document.getElementById(highlightedCellIdRef.current)?.classList.remove('audit-target-cell');
      highlightedCellIdRef.current = null;
    }
  }

  /** James's report: the panel's text advanced on Resume Audit/Skip, but nothing about the
   * cursor or the grid followed — the cell that had been jumped to (Clear Error) was left
   * behind, stranded on whatever row that was, while the message went on to describe a
   * different row entirely. The fix is to make every transition onto a new current issue —
   * not just an explicit Clear Error click — scroll/focus/highlight that cell and re-anchor the
   * panel near it itself, so the panel, the highlight and the message always agree about where
   * the problem actually is. */
  function jumpToAuditIssue(issue: AuditIssue | null) {
    clearAuditHighlight();
    if (!issue) {
      setAuditAnchor(null);
      return;
    }
    // 'auto' (padding-symmetry): no single cell to fix by hand — the grid refuses to let a code
    // character be typed past a row's own level — so `issue.level` here is the first OFFENDING
    // trailing column, not a cell to focus. James's report (twice): with no highlight at all for
    // this kind, there was no way to tell which row a padding message was even about. Still
    // highlights (scroll + outline only, no focus/select — there's genuinely nothing to type
    // into) the row's OWN description cell, found by scanning for its last non-blank column,
    // same logic as codeValidation.ts's own (unexported) levelOf.
    let level = issue.level;
    if (issue.kind === 'auto') {
      const row = project?.rows.find((r) => r.id === issue.rowId);
      let ownLevel = -1;
      if (row) {
        for (let i = row.descriptions.length - 1; i >= 0; i--) {
          if ((row.descriptions[i] ?? '').trim()) {
            ownLevel = i;
            break;
          }
        }
      }
      if (ownLevel === -1) {
        setAuditAnchor(null);
        return;
      }
      level = ownLevel;
    }
    const id = issue.kind === 'code' ? codeInputId(level, issue.rowId) : descInputId(level, issue.rowId);
    requestAnimationFrame(() => {
      const input = document.getElementById(id) as HTMLInputElement | null;
      if (!input) return;
      input.scrollIntoView({ block: 'center' });
      if (issue.kind !== 'auto') {
        input.focus();
        input.select();
      }
      input.classList.add('audit-target-cell');
      highlightedCellIdRef.current = id;
      const rect = input.getBoundingClientRect();
      const panelWidth = 360; // matches .audit-panel's own width (22rem) plus a small margin
      // Reserve enough height for the tallest realistic panel content (a two/three-line
      // message plus its button row) — 200px wasn't enough headroom and let a longer message
      // push the panel's own buttons below the viewport, unclickable, on a short page (James's
      // report reproduced this exact way on a one-row taxonomy).
      const panelMaxHeight = 300;
      setAuditAnchor({
        top: Math.max(8, Math.min(rect.top - 10, window.innerHeight - panelMaxHeight)),
        left: Math.min(Math.max(8, rect.right + 16), window.innerWidth - panelWidth),
      });
    });
  }

  /** Starts (or restarts) an audit run. The issue list is computed synchronously right here —
   * fast enough that no genuine async gap exists — with only the "Conducting Taxonomy Health
   * Check…" -> next-status transition deliberately delayed (James approved this wording; a
   * near-instant flash would read as if nothing happened for a check this is meant to feel
   * thorough). The setTimeout re-checks `current.origin` against a closed-over `origin` so a
   * fast Exit-then-rerun in that window can't resurrect a stale run. */
  function runAudit(origin: AuditOrigin) {
    if (!project) return;
    clearAuditHighlight();
    const issues = findAuditIssues(project.rows, project.settings.properCaseOnly, project.settings.paddingChar);
    const originalRowIds = rowsWithIssues(issues);
    const firstIssue = issues[0] ?? null;
    setAudit({ origin, originalRowIds, cursor: 0, currentIssue: firstIssue, status: 'checking', accepted: new Set() });
    setTimeout(() => {
      setAudit((current) => {
        if (!current || current.origin !== origin) return current;
        return { ...current, status: current.originalRowIds.length === 0 ? 'clean' : 'issue' };
      });
      if (originalRowIds.length > 0) jumpToAuditIssue(firstIssue);
    }, 400);
  }

  /** Re-checks the taxonomy fresh and walks `originalRowIds` forward from `fromIndex`, looking
   * for the next row that still has ANY current issue — not necessarily the same problem it had
   * before (fixing one thing on a row can genuinely reveal a different, previously-unchecked
   * problem on that same row, e.g. a blank description also hides whatever's wrong with that
   * row's code) — skipping any row that's now fully clean, including as a side effect of fixing
   * a different one (Fill Codes / Pad Codes can clear several rows in one action). Every caller
   * passes `fromIndex = audit.cursor` (the row just fixed or accepted) — there's no Skip to move
   * `fromIndex` past a still-unresolved row (James's report: repeated Skips left row 54's
   * incomplete code unresolved while the panel had moved on to row 61, hiding an earlier hard
   * issue behind a later one — Tranche 1's hard checks aren't dismissible, per Section 6.7, so
   * the walk can now only ever advance past a row once it's actually fixed). Takes `rows`
   * explicitly rather than reading `project.rows` from closure — a caller that just applied a
   * fix via setProject/handleSettingsAndRowsChange can't rely on `project` reflecting it yet in
   * that same tick (React batches the state update), so it passes the just-computed rows
   * straight through instead of reading the still-stale `project`. Always jumps to (or clears,
   * on reaching clean) wherever it lands — see jumpToAuditIssue. */
  function advanceAudit(
    fromIndex: number,
    rows: TaxonomyRow[] = project?.rows ?? [],
    accepted: ReadonlySet<string> = audit?.accepted ?? new Set<string>(),
  ) {
    if (!project || !audit) return;
    const rawFresh = findAuditIssues(rows, project.settings.properCaseOnly, project.settings.paddingChar);
    // Tranche 2's soft checks are dismissed via Accept rather than fixed — an accepted issue is
    // filtered out here so it neither reappears in the walk nor counts against reaching "clean".
    const fresh = rawFresh.filter((issue) => !accepted.has(auditIssueKey(issue)));

    // James's report (and a real, serious bug): Skip on the LAST issue in the walk-through was
    // reporting "clean" — including routing a Lock-origin run straight to "Confirm Lock" — even
    // though that skipped issue was never actually fixed, just passed over. Reaching the end of
    // `originalRowIds` only means "nothing left to walk forward to," not "nothing wrong" — a
    // full fresh check across the whole taxonomy, independent of where the cursor happens to be,
    // is the only thing allowed to report clean. Never let Lock through on anything less.
    if (fresh.length === 0) {
      setAudit({ ...audit, accepted, cursor: audit.originalRowIds.length, currentIssue: null, status: 'clean' });
      jumpToAuditIssue(null);
      return;
    }

    const firstIssueByRow = new Map<string, AuditIssue>();
    for (const issue of fresh) {
      if (!firstIssueByRow.has(issue.rowId)) firstIssueByRow.set(issue.rowId, issue);
    }

    // Walk forward from fromIndex to the end of the original list first...
    let next = fromIndex;
    while (next < audit.originalRowIds.length && !firstIssueByRow.has(audit.originalRowIds[next])) {
      next++;
    }
    // ...and if that runs out without finding one, wrap around and check from the start back up
    // to fromIndex — covers exactly the Skip-past-the-last-issue case: the row(s) skipped
    // earlier in this same walk are still broken and need revisiting, not a false "clean".
    if (next >= audit.originalRowIds.length) {
      next = 0;
      while (next < fromIndex && !firstIssueByRow.has(audit.originalRowIds[next])) {
        next++;
      }
    }

    if (next < audit.originalRowIds.length && firstIssueByRow.has(audit.originalRowIds[next])) {
      const nextIssue = firstIssueByRow.get(audit.originalRowIds[next]) ?? null;
      setAudit({ ...audit, accepted, cursor: next, currentIssue: nextIssue, status: 'issue' });
      jumpToAuditIssue(nextIssue);
      return;
    }

    // Nothing in the ORIGINAL walk list is broken anymore, yet fresh.length > 0 — a genuinely
    // new problem appeared on a row that had none when this run started (a manual edit
    // elsewhere, or Undo). Extend the walk to include it rather than declaring victory.
    const newIssue = fresh[0];
    setAudit({
      ...audit,
      accepted,
      originalRowIds: [...audit.originalRowIds, newIssue.rowId],
      cursor: audit.originalRowIds.length,
      currentIssue: newIssue,
      status: 'issue',
    });
    jumpToAuditIssue(newIssue);
  }

  // Clear Error: re-jumps to (in case the user scrolled away) and focuses the exact cell the
  // current issue is about — the same "drop the cursor there" pattern GuidanceBanner.tsx
  // already uses for its own duplicate-code and manual-code notices — then switches the panel
  // to Resume Audit for when the fix is done. The initial jump already happened automatically
  // (jumpToAuditIssue, above) the moment this became the current issue.
  function handleAuditClearError() {
    if (!audit || !audit.currentIssue || !project) return;
    const issue = audit.currentIssue;
    if (issue.kind === 'auto') {
      // Padding-symmetry: the grid itself refuses to let a code character be typed into a
      // column beyond a row's own level, so there's no cell to TYPE into and no manual fix —
      // apply padTrailingCodes (guidance.ts) to fill in trailing padding only, then immediately
      // re-check and advance rather than waiting on a Resume Audit click. Deliberately NOT the
      // broader padCodes Fill Codes/Pad Codes use elsewhere — that one also pads an ancestor
      // column with nothing to inherit, which is only safe there because it always runs right
      // after fillCodesDown. Called standalone here, it would silently paper over a genuinely
      // incomplete code (the SEPARATE issue codeCompletion already catches) instead of leaving
      // it for the user to actually fill in — exactly what made "Fix Automatically" look stuck
      // on James's real file, which still had plenty of headings never coded at all.
      const paddedRows = padTrailingCodes(project.rows, project.settings.paddingChar);
      handleSettingsAndRowsChange(project.settings, paddedRows);
      advanceAudit(audit.cursor, paddedRows);
      return;
    }
    if (issue.kind === 'toggleCase') {
      // James's report: repeatedly clicking Resume Audit without first doing this by hand
      // (right-click -> Toggle Case) understandably read as "the fix isn't registering" — one
      // button now does both, same toggleCase() Grid.tsx's own right-click menu uses.
      const toggledRows = project.rows.map((row) =>
        row.id === issue.rowId
          ? {
              ...row,
              descriptions: row.descriptions.map((d, i) =>
                i === issue.level ? toggleCase(d, project.settings.customAbbreviations) : d,
              ),
            }
          : row,
      );
      handleSettingsAndRowsChange(project.settings, toggledRows);
      advanceAudit(audit.cursor, toggledRows);
      return;
    }
    jumpToAuditIssue(issue);
    setAudit({ ...audit, status: 'resuming' });
  }

  // Accept (Tranche 2's soft, override-able checks only — Section 6.7: "inform, never block"):
  // dismisses this one warning for the rest of the current audit run without requiring an actual
  // fix, then re-checks from the same position in case this row has another issue underneath it.
  function handleAuditAccept() {
    if (!audit || !audit.currentIssue || !project) return;
    const nextAccepted = new Set(audit.accepted);
    nextAccepted.add(auditIssueKey(audit.currentIssue));
    advanceAudit(audit.cursor, project.rows, nextAccepted);
  }

  function handleAuditResume() {
    if (!audit) return;
    advanceAudit(audit.cursor);
  }

  // Exit Audit click: confirm first (James's ask) rather than dropping straight out — see
  // auditExitConfirm above. performAuditExit (below) is the actual exit, run once confirmed.
  // Also doubles as the clean state's own "Close" button (AuditPanel), which skips the confirm
  // — nothing's left outstanding to lose at that point, so asking would just be friction.
  function handleAuditExit() {
    if (!audit) return;
    if (audit.status === 'clean') {
      performAuditExit();
      return;
    }
    setAuditExitConfirm(true);
  }

  // The actual exit, gated behind auditExitConfirm. For Lock/Lock updates it's genuinely a dead
  // end — "mandatory, no bypass" (James) — locking simply doesn't happen. For Export to CSV,
  // Audit was only ever advisory (the Y/N prompt before it), so exiting mid-walkthrough still
  // lets the export proceed rather than losing the work of getting there.
  function performAuditExit() {
    if (!audit) return;
    const origin = audit.origin;
    setAudit(null);
    clearAuditHighlight();
    setAuditAnchor(null);
    if (origin === 'export-csv') setExportChoice({ format: 'csv' });
  }

  // Standalone "Audit Taxonomy" toolbar button — usable any time, whether or not locking or
  // exporting is on the user's mind at all (James: "one can use Audit even if NO lock
  // intended — to check before exporting").
  function handleAuditTaxonomyClick() {
    runAudit('standalone');
  }

  // The "Audit — Y/N" prompt before Export to CSV (default Yes). Export to Excel is deliberately
  // not gated by this at all — James: CSV feeds other software (needs to be complete), Excel is
  // for review/inspection (doesn't).
  function handleExportCsvClick() {
    setCsvAuditPrompt(true);
  }

  // Effect (rather than inline in runAudit's setTimeout) so it covers every path into a clean
  // result — the initial check, and every Resume/Skip that lands on "nothing left" via
  // advanceAudit. Lock and Export-to-CSV each have their own "what next" step once clean;
  // standalone Audit shows its own clean-state buttons (AuditPanel) and just waits.
  useEffect(() => {
    if (!audit || audit.status !== 'clean') return;
    if (audit.origin === 'lock') {
      setAudit(null);
      setLockConfirm('lock');
    } else if (audit.origin === 'lockUpdates') {
      setAudit(null);
      setLockConfirm('lockUpdates');
    } else if (audit.origin === 'export-csv') {
      setAudit(null);
      setExportChoice({ format: 'csv' });
    }
  }, [audit]);

  // James's repeated report, across several rounds of real-file testing: after Clear Error
  // jumps to the flagged cell (status 'resuming'), nothing re-checks the fix until "Resume
  // Audit" is clicked by hand — type the correction, tab/click on to the next thing (a very
  // natural next move), and the panel just sits there still describing the now-fixed cell as
  // broken. Read as "the fix isn't registering" / "doubling up" / "this error does not exist"
  // each time, even though the fix genuinely landed. Auto-rechecks the moment the SPECIFIC cell
  // this issue is about loses focus — not on every keystroke (which would fight typing in a
  // multi-character description by re-selecting it after each character via jumpToAuditIssue's
  // own focus/select) — so a click on "Resume Audit" itself still works exactly as before
  // (mousedown blurs the cell first either way), just no longer the ONLY way forward.
  //
  // Also covers status 'issue', not just 'resuming': jumpToAuditIssue ALREADY auto-focuses and
  // selects the target cell the moment a NEW issue becomes current — advanceAudit calls it
  // directly, before the user has clicked anything. So a user can reasonably just start typing
  // straight into that already-focused cell without ever clicking "Clear Error" first (there's
  // nothing left to click for — it's already active). James's own report traced to exactly
  // this: this effect originally only armed once status reached 'resuming' (i.e. only after an
  // explicit Clear Error click), so typing directly into an auto-focused cell and tabbing away
  // never triggered a recheck at all — the panel stayed on the original message forever, not
  // because the fix didn't land, but because nothing was ever listening for that blur.
  //
  // Re-registered on every `project` change (i.e. every keystroke) specifically so the listener
  // always closes over the LATEST rows — advanceAudit's default `rows` param reads `project`
  // from this closure, and a stale one here would re-check against what the cell held before
  // the very edit this effect exists to catch.
  useEffect(() => {
    if (!audit || (audit.status !== 'resuming' && audit.status !== 'issue') || !audit.currentIssue) return;
    const issue = audit.currentIssue;
    if (issue.kind !== 'code' && issue.kind !== 'desc') return;
    const targetId = issue.kind === 'code' ? codeInputId(issue.level, issue.rowId) : descInputId(issue.level, issue.rowId);
    function handleFocusOut(e: FocusEvent) {
      if ((e.target as HTMLElement | null)?.id !== targetId || !project) return;
      // James's ask, straight from the walkthrough: a whole run of siblings sharing the exact
      // same blank code column ("a series") shouldn't mean one Audit trip per row — the value
      // just typed for THIS row is enough to gap-code the rest of its own immediate sibling
      // group right away, same rule Auto Code/Fill Missing Codes already use. Scoped to only
      // THIS row's group (fillRestOfGroup), never the whole column, and a no-op (same rows
      // reference back) for the ordinary case of one isolated blank code elsewhere. Gated on the
      // row Audit was actually pointing at having a REAL value now, not merely "this cell lost
      // focus" — jumpToAuditIssue's own focus+select of the NEXT issue's cell, immediately after
      // this one, is itself a focus change that can end up re-entering this handler for a row
      // nobody has typed into yet; without this check that spilled a full group-fill onto an
      // entirely unrelated, still-blank sibling group elsewhere in the same column.
      let rows = project.rows;
      const editedRow = issue.kind === 'code' ? rows.find((r) => r.id === issue.rowId) : undefined;
      if (issue.kind === 'code' && editedRow?.codes[issue.level]) {
        const filled = fillRestOfGroup(rows, issue.rowId, issue.level, project.settings.paddingChar);
        if (filled !== rows) {
          rows = filled;
          handleSettingsAndRowsChange(project.settings, rows);
        }
      }
      advanceAudit(audit!.cursor, rows);
    }
    document.addEventListener('focusout', handleFocusOut);
    return () => document.removeEventListener('focusout', handleFocusOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit?.status, audit?.currentIssue, project]);

  function performLockTaxonomy() {
    if (!project) return;
    const lockedProject: TaxonomyProject = {
      ...project,
      settings: { ...project.settings, locked: true },
      rows: project.rows.map((row) => ({ ...row, protected: true })),
    };
    setProject(lockedProject);
    setDirty(false);
    performSave(lockedProject);
  }

  // Unlock: lifts the enforcement only — every row's `protected` flag from the last Lock is
  // left exactly as it is (Grid.tsx keeps greying those rows out), so a later re-lock still
  // knows what was already historical, and nothing here is silently forgotten. No file is saved
  // here, so the native-confirm/Save-picker interaction above doesn't apply — left as a plain
  // window.confirm().
  function handleUnlockTaxonomy() {
    if (!project) return;
    if (
      !confirm(
        'Unlocking this taxonomy and changing existing codes or descriptions will potentially corrupt the existing historical data and lead to inexplicable errors and is strongly advised against.  If you unlock please be very careful with what you do.',
      )
    ) {
      return;
    }
    setProject({ ...project, settings: { ...project.settings, locked: false } });
    setDirty(true);
  }

  // Lock Taxonomy menu item (f) — "Lock updates": re-runs the exact same sweep as the initial
  // Lock (every row currently in the table, including whatever's been added or marked deleted
  // since, becomes protected), just with wording that matches what's actually being locked this
  // time — the taxonomy's own history plus everything added since the last Lock, as one list.
  function handleLockUpdates() {
    if (!project) return;
    // Same mandatory Audit gate as the initial Lock — the new rows being locked in this time
    // need to be just as complete as the ones the first Lock already protected.
    runAudit('lockUpdates');
  }

  function performLockUpdates() {
    if (!project) return;
    const lockedProject: TaxonomyProject = {
      ...project,
      rows: project.rows.map((row) => ({ ...row, protected: true })),
    };
    setProject(lockedProject);
    setDirty(false);
    performSave(lockedProject);
  }

  async function performExportLockedXlsx() {
    if (!project) return;
    const { project: versioned, usedFolder, cancelled } = await exportLockedXlsx(project);
    if (cancelled) return;
    setProject(versioned);
    if (usedFolder) peekExportFolderName().then(setExportFolderName);
    else setExportFolderName(null);
  }

  // Lock Taxonomy menu item (b).
  function handleExportLockedXlsx() {
    if (!project) return;
    if (hasBlankCodeGaps(project.rows)) {
      setBlankCodeWarning({ action: performExportLockedXlsx });
      return;
    }
    performExportLockedXlsx();
  }

  // Lock Taxonomy menu item (c).
  function handleExportIncrementCsv() {
    if (!project) return;
    if (!project.rows.some(isChangedSinceLock)) {
      setLoadError('Nothing to export — every row is already locked, there is no increment yet.');
      return;
    }
    exportIncrementCsv(project).then(({ project: versioned, usedFolder, cancelled }) => {
      if (cancelled) return;
      setProject(versioned);
      if (usedFolder) peekExportFolderName().then(setExportFolderName);
      else setExportFolderName(null);
    });
  }

  // Lock Taxonomy menu item (d) — the entire taxonomy (locked history plus any increment),
  // exactly what "Export to CSV" already produces; this is the same action under a label
  // that makes sense from the Lock Taxonomy menu specifically.
  function handleExportEntireLockedCsv() {
    if (!project) return;
    exportDiscreteCsv(project).then(({ project: versioned, usedFolder, cancelled }) => {
      if (cancelled) return;
      setProject(versioned);
      if (usedFolder) peekExportFolderName().then(setExportFolderName);
      else setExportFolderName(null);
    });
  }

  function handleLoadClick() {
    fileInputRef.current?.click();
  }

  async function performExport(
    mode: 'discrete' | 'concatenated',
    paddingOverride?: string,
    excludeDelimiters?: boolean,
    suffixMode?: 'concatenate' | 'rightAlign',
  ) {
    if (!project || !exportChoice) return;
    const { format } = exportChoice;
    const options = {
      ...(paddingOverride ? { paddingOverride } : {}),
      ...(excludeDelimiters ? { excludeDelimiters } : {}),
      ...(suffixMode === 'concatenate' ? { suffixMode } : {}),
    };
    let versioned: TaxonomyProject;
    let usedFolder: boolean;
    let cancelled: boolean;
    if (format === 'csv') {
      ({ project: versioned, usedFolder, cancelled } =
        mode === 'discrete' ? await exportDiscreteCsv(project, options) : await exportConcatenatedCsv(project, options));
    } else {
      ({ project: versioned, usedFolder, cancelled } =
        mode === 'discrete' ? await exportDiscreteXlsx(project, options) : await exportConcatenatedXlsx(project, options));
    }
    setExportChoice(null);
    if (cancelled) return; // backed out of the Save As dialog — nothing happened
    setProject(versioned);
    if (usedFolder) peekExportFolderName().then(setExportFolderName);
    else setExportFolderName(null);
  }

  // Last step before actually exporting: if the taxonomy's codes are still padded with "."
  // (the only option Settings/New Taxonomy offer now), ask whether to substitute "0" in this
  // one export's output — a one-off, per-file choice rather than a standing setting, since
  // it's meant only for the rare ERP that genuinely can't accept ".".
  function proceedToExport(mode: 'discrete' | 'concatenated', excludeDelimiters?: boolean, suffixMode?: 'concatenate' | 'rightAlign') {
    if (!project) return;
    if (project.settings.paddingChar === '.') {
      setPaddingSubstituteChoice({ mode, excludeDelimiters, suffixMode });
    } else {
      performExport(mode, undefined, excludeDelimiters, suffixMode);
    }
  }

  // Item 4: only asked when suffix columns actually exist — otherwise straight through to the
  // padding-substitution step above.
  function proceedPastSuffixChoice(mode: 'discrete' | 'concatenated', excludeDelimiters?: boolean) {
    if (!project) return;
    if (project.settings.suffixes.length > 0) {
      setSuffixModeChoice({ mode, excludeDelimiters });
    } else {
      proceedToExport(mode, excludeDelimiters);
    }
  }

  function runExport(mode: 'discrete' | 'concatenated', excludeDelimiters?: boolean) {
    if (!project) return;
    if (hasBlankCodeGaps(project.rows)) {
      setBlankCodeWarning({ action: () => proceedPastSuffixChoice(mode, excludeDelimiters) });
      return;
    }
    proceedPastSuffixChoice(mode, excludeDelimiters);
  }

  async function performCreateBlock() {
    if (!project) return;
    const { project: versioned, usedFolder, cancelled } = await exportBlock(project);
    if (cancelled) return; // backed out of the Save As dialog — nothing happened
    setProject(versioned);
    if (usedFolder) peekExportFolderName().then(setExportFolderName);
    else setExportFolderName(null);
  }

  function handleCreateBlock() {
    if (!project) return;
    if (hasBlankCodeGaps(project.rows)) {
      setBlankCodeWarning({ action: performCreateBlock });
      return;
    }
    performCreateBlock();
  }

  // Item 3: the grid's own right-click "Export Block", scoped to whatever row range was
  // selected rather than the whole table. "Include Suffix?" is asked every time, since a
  // block meant for a target with a different suffix setup might deliberately want to leave
  // suffix values out.
  function handleExportBlockRange(rowsSubset: TaxonomyRow[]) {
    if (!project || rowsSubset.length === 0) return;
    if (hasBlankCodeGaps(rowsSubset)) {
      setBlankCodeWarning({ action: () => setExportBlockRangeChoice({ rows: rowsSubset }) });
      return;
    }
    setExportBlockRangeChoice({ rows: rowsSubset });
  }

  async function performExportBlockRange(includeSuffixes: boolean) {
    if (!project || !exportBlockRangeChoice) return;
    const { rows: rowsSubset } = exportBlockRangeChoice;
    setExportBlockRangeChoice(null);
    const { project: versioned, usedFolder, cancelled } = await exportBlock(project, { rowsOverride: rowsSubset, includeSuffixes });
    if (cancelled) return; // backed out of the Save As dialog — nothing happened
    setProject(versioned);
    if (usedFolder) peekExportFolderName().then(setExportFolderName);
    else setExportFolderName(null);
  }

  // For Grid actions that touch settings and rows together — Import Block's anchor/level-growth
  // flow, and the grid's own right-click "Add Column" — Grid works out the details itself and
  // hands back the final settings + rows in one shot, folded into undo history exactly like any
  // other row edit, since these are grid actions, not a separate Settings-screen change.
  function handleSettingsAndRowsChange(settings: TaxonomySettings, rows: TaxonomyRow[]) {
    if (!project) return;
    setUndoStack((stack) => [...stack, project.rows]);
    setRedoStack([]);
    lastEditKeyRef.current = null;
    setProject({ ...project, settings, rows });
    setDirty(true);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const loaded = await loadProjectFromFile(file);
      setProject(loaded);
      setDirty(false);
      setAutoFocusFirstRow(false);
      setLoadError(null);
      setUndoStack([]);
      setRedoStack([]);
      lastEditKeyRef.current = null;
      setCurrentLibraryEntryId(null);
      setProjectGeneration((g) => g + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this file.');
    }
  }

  // Importing a CSV always replaces the whole working project — worth a clear warning first
  // if there's any real content already in place (an empty just-created taxonomy needs no
  // warning; a taxonomy someone's actually been building does).
  function hasAnyContent(rows: TaxonomyRow[]): boolean {
    return rows.some((row) => row.codes.some((c) => c.trim()) || row.descriptions.some((d) => d.trim()));
  }

  function handleImportCsvClick() {
    // Lock Taxonomy: CSV Import replaces the whole table wholesale — it doesn't go through
    // Grid.tsx's per-cell protected-row guards at all, so it's the one path that could
    // silently wipe out a locked taxonomy's protected rows if it weren't blocked here.
    if (project?.settings.locked) {
      alert('This taxonomy is locked and cannot be replaced by a CSV import. Unlock it first if this is genuinely necessary.');
      return;
    }
    if (project && hasAnyContent(project.rows) && !confirm('This will clear the existing table content — proceed?')) {
      return;
    }
    csvImportFileInputRef.current?.click();
  }

  async function handleCsvFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = parseDiscreteCsv(text);
      if ('error' in parsed) {
        setLoadError(parsed.error);
        return;
      }
      setLoadError(null);
      const defaultTitle = file.name.replace(/\.csv$/i, '');
      setPendingCsvImport({ parsed, defaultTitle });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  }

  function handleCsvImportConfirm(fields: CsvImportFields) {
    if (!pendingCsvImport) return;
    const { parsed } = pendingCsvImport;
    const newProject = createProject(
      fields.title,
      fields.tableName,
      fields.purpose,
      fields.maxDescriptionLength,
      parsed.delimiterPositions,
      ' ',
      parsed.numLevels,
      parsed.suffixes,
      '.',
      parsed.codeDelimiterChar,
    );
    newProject.rows = parsed.rows;
    setProject(newProject);
    setDirty(true);
    setAutoFocusFirstRow(false);
    setLoadError(null);
    setUndoStack([]);
    setRedoStack([]);
    lastEditKeyRef.current = null;
    setCurrentLibraryEntryId(null);
    setPendingCsvImport(null);
    setProjectGeneration((g) => g + 1);
  }

  function handleSaveSettings(fields: SettingsFields) {
    if (!project) return;
    // Number of code columns can move either way here — SettingsModal only ever submits a
    // decrease once it's confirmed no row actually has content beyond the new limit, so
    // trimming is as safe as growing. Not folded into undo history, matching every other
    // Settings field — this is a setup correction, not a row edit to step back through.
    const newNumLevels = fields.numLevels;
    const oldNumLevels = project.settings.numLevels;
    let rows = project.rows;
    if (newNumLevels > oldNumLevels) {
      rows = growRowsToLevels(rows, newNumLevels);
    } else if (newNumLevels < oldNumLevels) {
      rows = rows.map((row) => ({
        ...row,
        codes: row.codes.slice(0, newNumLevels),
        descriptions: row.descriptions.slice(0, newNumLevels),
      }));
    }
    setProject({
      ...project,
      title: fields.title,
      tableName: fields.tableName,
      purpose: fields.purpose,
      rows,
      settings: {
        ...project.settings,
        maxDescriptionLength: fields.maxDescriptionLength,
        codeDelimiterChar: fields.codeDelimiterChar,
        indentChar: fields.indentChar,
        numLevels: newNumLevels,
        delimiterPositions: fields.delimiterPositions,
      },
    });
    setDirty(true);
    setShowSettings(false);
  }

  // Item 1: a dropdown at the top of the work area, separate from the Settings screen, since
  // this is the kind of thing worth switching often while coding a taxonomy. Not folded into
  // undo history, matching every other Settings-style field — this narrows future entry, it
  // doesn't touch any row already there.
  function handleCodeRestrictionChange(codeRestriction: CodeRestriction) {
    if (!project) return;
    setProject({ ...project, settings: { ...project.settings, codeRestriction } });
    setDirty(true);
  }

  function handleAutoCodeClick() {
    if (!project) return;
    // Bulk, whole-table structural operation — same precedent as CSV Import, blocked outright
    // while locked rather than trying to thread protected-row guards through it.
    if (project.settings.locked) {
      alert('This taxonomy is locked and cannot be auto-coded. Unlock it first if this is genuinely necessary.');
      return;
    }
    setAutoCodeType(AUTO_CODE_TYPES[0]);
    setShowAutoCode(true);
  }

  function handleAutoCodeGenerate() {
    if (!project) return;
    if (!IMPLEMENTED_AUTO_CODE_TYPES.includes(autoCodeType)) {
      setLoadError(`Auto Code for "${autoCodeType}" isn't built yet — only "${IMPLEMENTED_AUTO_CODE_TYPES[0]}" is available right now.`);
      return;
    }
    const newRows = autoCodeAlphaNumeric(project.rows, project.settings.paddingChar);
    handleSettingsAndRowsChange({ ...project.settings, codeRestriction: autoCodeType }, newRows);
    setShowAutoCode(false);
  }

  function handleFormatDescriptionsClick() {
    if (!project) return;
    // Bulk, whole-table content operation — same precedent as Auto Code / CSV Import: blocked
    // outright while locked rather than threading protected-row guards through a bulk rewrite.
    if (project.settings.locked) {
      alert('This taxonomy is locked and descriptions cannot be bulk-formatted. Unlock it first if this is genuinely necessary.');
      return;
    }
    setFormatMode(FORMAT_MODES[2]);
    setShowFormatDescriptions(true);
  }

  // Runs the actual rewrite and persists any newly-accepted abbreviations into this taxonomy's
  // settings, so the next Format Descriptions run (and Format Descriptions itself, mid-queue)
  // already knows them. `scopeRowIds` undefined means every row; otherwise only rows in that
  // set are eligible for rewriting (James's "Format Selected Range").
  function runFormatDescriptions(mode: FormatMode, customAbbreviations: string[], scopeRowIds: ReadonlySet<string> | undefined) {
    if (!project) return;
    const newRows = applyFormatDescriptions(project.rows, mode, customAbbreviations, scopeRowIds);
    handleSettingsAndRowsChange({ ...project.settings, customAbbreviations }, newRows);
  }

  // Shared by both "Format Selected Range" and (after its own confirmation) "Format Entire
  // Worksheet" — collects any not-yet-recognised ALL-CAPS words within scope first, prompting
  // for each before the actual rewrite runs.
  function beginFormatDescriptions(mode: FormatMode, scopeRowIds: ReadonlySet<string> | undefined) {
    if (!project) return;
    const unknown = collectUnknownAbbreviationWords(project.rows, mode, project.settings.customAbbreviations, scopeRowIds);
    if (unknown.length === 0) {
      runFormatDescriptions(mode, project.settings.customAbbreviations, scopeRowIds);
      return;
    }
    setAbbreviationPrompt({ mode, scopeRowIds, queue: unknown, accepted: [] });
  }

  // "Format Selected Range" (the dialog's default action) — the currently selected rows only.
  function handleFormatSelectedRange() {
    if (!gridSelectionRowIds || gridSelectionRowIds.size === 0) return;
    setShowFormatDescriptions(false);
    beginFormatDescriptions(formatMode, gridSelectionRowIds);
  }

  // "Format Entire Worksheet" — James's ask: this sweeping, less-common action always gets its
  // own confirmation step, separate from (and after) the mode-picker dialog.
  function handleFormatEntireWorksheetClick() {
    setShowFormatDescriptions(false);
    setFormatEntireConfirm(formatMode);
  }

  function handleFormatEntireWorksheetConfirm() {
    if (!formatEntireConfirm) return;
    const mode = formatEntireConfirm;
    setFormatEntireConfirm(null);
    beginFormatDescriptions(mode, undefined);
  }

  // Answers one "Keep 'XYZ' in caps?" prompt at a time; once the queue is empty, runs the
  // formatter with the seed list plus this taxonomy's existing custom abbreviations plus
  // whichever words were accepted this round.
  function resolveAbbreviationPrompt(accept: boolean) {
    if (!abbreviationPrompt || !project) return;
    const [word, ...rest] = abbreviationPrompt.queue;
    const accepted = accept ? [...abbreviationPrompt.accepted, word] : abbreviationPrompt.accepted;
    if (rest.length === 0) {
      setAbbreviationPrompt(null);
      runFormatDescriptions(abbreviationPrompt.mode, [...project.settings.customAbbreviations, ...accepted], abbreviationPrompt.scopeRowIds);
    } else {
      setAbbreviationPrompt({ ...abbreviationPrompt, queue: rest, accepted });
    }
  }

  function handleNewTaxonomy() {
    if (project && dirty && !confirm('Discard the current taxonomy and start a new one?')) return;
    setProject(null);
    setLoadError(null);
    setCurrentLibraryEntryId(null);
    setSignOnStage('menu');
    setChosenWorkflowLevel(null);
  }

  function handleChooseWorkflowLevel(level: WorkflowLevel) {
    setChosenWorkflowLevel(level);
    setSignOnStage('new');
  }

  // Back to Menu: returns to the landing menu without discarding the open taxonomy — it's
  // still sitting in the autosave slot (written on every change), so "Resume Work in Progress"
  // brings it straight back. This is what James asked for after finding no way back to the
  // workflow picker once a taxonomy was open.
  function handleBackToMenu() {
    setProject(null);
    setLoadError(null);
    setCurrentLibraryEntryId(null);
    setSignOnStage('menu');
    setChosenWorkflowLevel(null);
  }

  function handleResumeWorkInProgress() {
    const saved = loadAutosave();
    if (!saved) return;
    setProject(saved);
    setDirty(false);
    setUndoStack([]);
    setRedoStack([]);
    lastEditKeyRef.current = null;
    setCurrentLibraryEntryId(null);
    setProjectGeneration((g) => g + 1);
  }

  // Logging out always lands back on the landing menu on the next sign-in — never straight
  // back into whatever was open (that was the bug: `project` is plain React state, untouched
  // by signing out, so a same-tab log-out/log-in used to drop straight back into the grid).
  // The menu is the one consistent landing point after any sign-in; nothing is actually lost
  // either way, since the autosave slot (written on every change, independent of sign-in
  // state) already has the latest state, and "Resume Work in Progress" brings it back.
  function handleLogOut() {
    handleBackToMenu();
    signOut();
    setAuthedEmail(null);
  }

  if (!authChecked) return null;
  if (passwordRecovery) {
    return (
      <>
        <ResetPassword onDone={() => setPasswordRecovery(false)} />
        {buildInfoTag}
      </>
    );
  }
  if (!authedEmail) {
    return (
      <>
        <Login onSuccess={setAuthedEmail} />
        {buildInfoTag}
      </>
    );
  }

  return (
    <>
    <div className="app-shell">
      <LibrarySidebar
        entries={libraryEntries}
        onRename={handleRenameLibraryEntry}
        onReorder={handleReorderLibrary}
        onMoveToWorkArea={handleMoveToWorkArea}
        onRemove={setLibraryRemoveTarget}
        onImport={handleImportLibrary}
      />
      <div className="app">
      <div className="app-sticky-top">
      <header className="app-header">
        <div className="app-heading-block">
          <h1 className="app-heading">The ERP Doctor Taxonomy Builder</h1>
          {!project && (
            <p className="app-tagline">
              Taxonomy Builder by the ERP Doctor
              <br />
              James A Robertson and Associates Limited
            </p>
          )}
        </div>
        <div className="header-right">
          {/* Sequence, grouping and colour treatment per James's "Taxonomy Builder Button
              Sequence" spreadsheet (v1.22) — 8 groups, alternating between the existing button
              blue and a second, restrained blue tone (Option C of the mock-up: colour rhythm
              plus a vertical divider bar between every group, rather than a distinct shade per
              group, which stopped being reliably tellable apart on its own past 5-6 groups).
              Log Out stays ungated by `project` (always available, including from the landing
              menu with no taxonomy open) but now sits inside .toolbar, styled like the rest of
              its group, rather than as a separately-styled button off to the side. */}
          <div className="toolbar">
            {project && (
              <button type="button" onClick={handleUndo} disabled={undoStack.length === 0}>
                Undo
              </button>
            )}
            {project && (
              <button type="button" onClick={handleRedo} disabled={redoStack.length === 0}>
                Redo
              </button>
            )}
            {project && <span className="toolbar-divider" />}
            {project && (
              <button type="button" className="toolbar-alt" onClick={() => setShowSettings(true)}>
                Settings
              </button>
            )}
            {project && <span className="toolbar-divider" />}
            {project && supportsFileSystemAccess() && (
              <button
                type="button"
                onClick={handleChooseFolder}
                title="Sets where your next Save/Export starts — after that, it reopens wherever you last saved"
              >
                {exportFolderName ? `Folder: ${exportFolderName}` : 'Choose Export Folder'}
              </button>
            )}
            {project && (
              <button type="button" className={justSaved ? 'save-flash' : undefined} onClick={handleSave}>
                {justSaved ? 'Saved ✓' : 'Save to File'}
              </button>
            )}
            {project && (
              <button type="button" onClick={handleExportCsvClick}>
                Export to CSV
              </button>
            )}
            {project && (
              <button type="button" onClick={() => setExportChoice({ format: 'xlsx' })}>
                Export to Excel
              </button>
            )}
            {project && (
              <button
                type="button"
                onClick={handleCreateBlock}
                title="Export the whole table as a block another taxonomy can import"
              >
                Create Block
              </button>
            )}
            {project && (
              <button
                type="button"
                className={justAddedToLibrary ? 'save-flash' : undefined}
                onClick={handleAddToLibraryClick}
                title={
                  currentLibraryEntryId
                    ? "Update this taxonomy's existing Library entry"
                    : 'Save a copy of this taxonomy to the Library'
                }
              >
                {justAddedToLibrary ? 'Added ✓' : 'Add to Library'}
              </button>
            )}
            {project && <span className="toolbar-divider" />}
            {project && (
              <button type="button" className="toolbar-alt" onClick={handleLoadClick}>
                Load from File
              </button>
            )}
            {project && (
              <button
                type="button"
                className="toolbar-alt"
                onClick={handleImportCsvClick}
                title="Import a taxonomy from a Discrete Columns CSV"
              >
                Import CSV
              </button>
            )}
            {project && <span className="toolbar-divider" />}
            {project && (
              <div className="lock-menu-wrapper" ref={lockMenuRef}>
                <button
                  type="button"
                  className="lock-btn"
                  onClick={() => setShowLockMenu((v) => !v)}
                  title="Protect every existing row's code and description once this taxonomy has gone live with real transactions"
                >
                  🔒 Lock Taxonomy ▾
                </button>
                {showLockMenu && (
                  <ul className="context-menu lock-menu">
                    {!project.settings.locked && (
                      <li
                        onClick={() => {
                          setShowLockMenu(false);
                          handleLockTaxonomy();
                        }}
                      >
                        Lock Taxonomy
                      </li>
                    )}
                    {project.settings.locked && (
                      <>
                        <li
                          onClick={() => {
                            setShowLockMenu(false);
                            handleExportLockedXlsx();
                          }}
                        >
                          Export Locked Taxonomy to Excel
                        </li>
                        <li
                          onClick={() => {
                            setShowLockMenu(false);
                            handleExportIncrementCsv();
                          }}
                        >
                          Export increment to CSV
                        </li>
                        <li
                          onClick={() => {
                            setShowLockMenu(false);
                            handleExportEntireLockedCsv();
                          }}
                        >
                          Export entire locked Taxonomy as CSV
                        </li>
                        <li
                          onClick={() => {
                            setShowLockMenu(false);
                            handleAddToLibraryClick();
                          }}
                        >
                          Update locked Taxonomy in Library
                        </li>
                        <li
                          onClick={() => {
                            setShowLockMenu(false);
                            handleLockUpdates();
                          }}
                        >
                          Lock updates
                        </li>
                      </>
                    )}
                  </ul>
                )}
              </div>
            )}
            {project && project.settings.locked && (
              <button
                type="button"
                className="unlock-btn"
                onClick={handleUnlockTaxonomy}
                title="Lift protection so existing rows can be edited again — use with care"
              >
                🔓 Unlock Taxonomy
              </button>
            )}
            {project && <span className="toolbar-divider" />}
            {project && (
              <button
                type="button"
                className="toolbar-alt"
                onClick={handleAutoCodeClick}
                title="Auto-fill blank codes throughout the taxonomy"
              >
                Auto Code
              </button>
            )}
            {project && (
              <button
                type="button"
                className="toolbar-alt"
                onClick={handleFormatDescriptionsClick}
                title="Clean up scrappy capitalisation — ALL CAPS headings, Proper Case posting-level entries"
              >
                Format Descriptions
              </button>
            )}
            {project && <span className="toolbar-divider" />}
            {project && (
              <button
                type="button"
                onClick={handleAuditTaxonomyClick}
                title="Walk through every open issue one at a time, with a jump straight to each one"
              >
                Audit Taxonomy
              </button>
            )}
            {project && <span className="toolbar-divider" />}
            {project && (
              <button
                type="button"
                onClick={handleBackToMenu}
                title="Return to the landing menu — this taxonomy stays recoverable via Resume Work in Progress"
              >
                Back to Menu
              </button>
            )}
            {project && (
              <button type="button" onClick={handleNewTaxonomy}>
                New Taxonomy
              </button>
            )}
            <button type="button" className="toolbar-alt" onClick={handleLogOut} title={`Signed in as ${authedEmail}`}>
              Log Out
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />
            <input
              ref={csvImportFileInputRef}
              type="file"
              // James's report: Windows' native file-picker defaulted to a "Custom Files" type
              // filter with no separate "CSV" option, forcing a manual switch to "All Files".
              // Mixing an extension with a MIME type (".csv,text/csv") is what usually causes
              // that — Chromium/Edge can't always resolve "text/csv" to a friendly OS-registered
              // label, so it falls back to a generic "Custom Files" bucket. Extension-only is the
              // standard fix, though the exact label/behaviour is entirely the OS/browser's own
              // and can't be tested from here — worth confirming after the next deploy.
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleCsvFileSelected}
            />
          </div>
          <Logo className="app-logo" />
        </div>
      </header>

      {loadError && <p className="load-error">{loadError}</p>}

      {/* James's report: the guided-wizard banner (and the equivalent "worksheet guidance"
          help block every other taxonomy type shows) scrolled out of view once the grid grew
          past ~21 rows — it sat in normal document flow below the header, which is itself
          sticky, so as the page scrolled the banner slid away underneath it. Moved in here,
          alongside the header, inside one shared sticky region — keeps whichever one is
          showing genuinely on screen "no matter how long the work area", for every taxonomy
          type that can show one, not just the Simple Taxonomy wizard. */}
      {project && project.settings.guidance && (
        <GuidanceBanner
          project={project}
          onSettingsAndRowsChange={handleSettingsAndRowsChange}
          onExitGuidance={handleExitGuidance}
        />
      )}
      {project && !project.settings.guidance && (
        <section className={`worksheet-guidance ${guidanceExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="worksheet-guidance-text">
            {helpText.worksheetGuidance?.trim() || 'No worksheet guidance has been added yet.'}
          </div>
          <button type="button" className="worksheet-guidance-toggle" onClick={() => setGuidanceExpanded((e) => !e)}>
            {guidanceExpanded ? 'Show less ▴' : 'Show more ▾'}
          </button>
        </section>
      )}
      </div>

      {!project && signOnStage === 'menu' && (
        <>
          <WorkflowMenu
            onChooseNew={handleChooseWorkflowLevel}
            onChooseExisting={() => setSignOnStage('existing')}
            resumeTitle={loadAutosave()?.title ?? null}
            onResume={handleResumeWorkInProgress}
            onLoadGLAnalyser={() => setShowGLAnalyserNotice(true)}
            onOpenGLBuilder={openGLBuilder}
          />
          <footer className="app-footer">
            The ERP Doctor Taxonomy Builder is the Intellectual Property of the ERP Doctor and
            James A Robertson and Associates Limited, it is copyright © 2026
          </footer>
        </>
      )}

      {!project && signOnStage === 'existing' && (
        <>
          <button type="button" className="sign-on-back-btn" onClick={() => setSignOnStage('menu')}>
            ← Back
          </button>
          <section className="load-from-file-section">
            <button type="button" onClick={handleLoadClick}>
              Load from File
            </button>
            <button type="button" onClick={handleImportCsvClick} title="Import a taxonomy from a Discrete Columns CSV">
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => setShowLoadFromLibrary(true)}
              disabled={libraryEntries.length === 0}
              title={libraryEntries.length === 0 ? 'Your Library is empty' : 'Open a taxonomy already saved in your Library'}
            >
              Load from Library
            </button>
          </section>
          <footer className="app-footer">
            The ERP Doctor Taxonomy Builder is the Intellectual Property of the ERP Doctor and
            James A Robertson and Associates Limited, it is copyright © 2026
          </footer>
        </>
      )}

      {!project && signOnStage === 'new' && (
        <>
          <button type="button" className="sign-on-back-btn" onClick={() => setSignOnStage('menu')}>
            ← Back
          </button>
          {chosenWorkflowLevel && chosenWorkflowLevel !== 'Simple Taxonomy' && (
            <p className="chosen-workflow-level">Creating a {chosenWorkflowLevel}</p>
          )}
          {chosenWorkflowLevel === 'Simple Taxonomy' ? (
            <SimpleTaxonomySetup onCreate={handleCreateSimpleTaxonomy} helpText={helpText} />
          ) : (
            <NewTaxonomyForm onCreate={handleCreate} helpText={helpText} />
          )}
          <footer className="app-footer">
            The ERP Doctor Taxonomy Builder is the Intellectual Property of the ERP Doctor and
            James A Robertson and Associates Limited, it is copyright © 2026
          </footer>
        </>
      )}

      {project && (
        <>
          <section className="taxonomy-meta">
            <h2>
              {project.title}
              {project.settings.locked && <span className="locked-badge">🔒 Locked</span>}
            </h2>
            <p className="table-name">Table: {project.tableName}</p>
            {project.purpose && <p className="purpose">{project.purpose}</p>}
          </section>
          {!project.settings.guidance && (
            <section className="code-restriction-bar">
              <label>
                Code Restrictions
                <select
                  value={project.settings.codeRestriction}
                  onChange={(e) => handleCodeRestrictionChange(e.target.value as CodeRestriction)}
                >
                  {CODE_RESTRICTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
          <Grid
            key={projectGeneration}
            settings={project.settings}
            rows={project.rows}
            onChange={handleRowsChange}
            onSettingsAndRowsChange={handleSettingsAndRowsChange}
            helpText={helpText}
            autoFocusFirstRow={autoFocusFirstRow}
            onExportBlock={handleExportBlockRange}
            onSelectionChange={setGridSelectionRowIds}
            auditActive={!!audit}
          />
          <footer className="app-footer">
            The ERP Doctor Taxonomy Builder is the Intellectual Property of the ERP Doctor and
            James A Robertson and Associates Limited, it is copyright © 2026
          </footer>
        </>
      )}

      {showSettings && project && (
        <SettingsModal
          project={project}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
          helpText={helpText}
        />
      )}

      {showAutoCode && (
        <div className="validation-overlay" onClick={() => setShowAutoCode(false)}>
          <div className="validation-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Choose the type of code to generate:</p>
            <select value={autoCodeType} onChange={(e) => setAutoCodeType(e.target.value as AutoCodeType)}>
              {AUTO_CODE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                  {IMPLEMENTED_AUTO_CODE_TYPES.includes(type) ? '' : ' (coming soon)'}
                </option>
              ))}
            </select>
            <p className="csv-import-summary">
              Only "{IMPLEMENTED_AUTO_CODE_TYPES[0]}" is available right now — the rest are coming soon.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowAutoCode(false)}>
                Cancel
              </button>
              <button type="button" onClick={handleAutoCodeGenerate}>
                Generate Codes
              </button>
            </div>
          </div>
        </div>
      )}

      {showFormatDescriptions && (
        <div className="validation-overlay" onClick={() => setShowFormatDescriptions(false)}>
          <div className="validation-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Choose what Format Descriptions should clean up:</p>
            <select value={formatMode} onChange={(e) => setFormatMode(e.target.value as FormatMode)}>
              {FORMAT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <p className="csv-import-summary">
              Recognised abbreviations (ERP, CoA, etc.) keep their own casing rather than being
              Proper-Cased. If an ALL-CAPS word isn't recognised, you'll be asked whether to keep
              it in caps.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowFormatDescriptions(false)}>
                Cancel
              </button>
              <button type="button" onClick={handleFormatEntireWorksheetClick}>
                Format Entire Worksheet
              </button>
              <button
                type="button"
                onClick={handleFormatSelectedRange}
                disabled={!gridSelectionRowIds || gridSelectionRowIds.size === 0}
                title={
                  !gridSelectionRowIds || gridSelectionRowIds.size === 0
                    ? 'Select a row or range in the grid first'
                    : undefined
                }
              >
                Format Selected Range
              </button>
            </div>
          </div>
        </div>
      )}

      {formatEntireConfirm && (
        <div className="validation-overlay" onClick={() => setFormatEntireConfirm(null)}>
          <div className="validation-dialog" onClick={(e) => e.stopPropagation()}>
            <p>
              This will reformat descriptions across the entire taxonomy, not just a selected
              range — continue?
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setFormatEntireConfirm(null)}>
                Cancel
              </button>
              <button type="button" onClick={handleFormatEntireWorksheetConfirm}>
                Format Entire Worksheet
              </button>
            </div>
          </div>
        </div>
      )}

      {abbreviationPrompt && (
        <div className="validation-overlay">
          <div className="validation-dialog">
            <p>
              Keep "{abbreviationPrompt.queue[0]}" in capitals? It isn't in this taxonomy's list of
              recognised abbreviations yet.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => resolveAbbreviationPrompt(false)}>
                No — Proper Case It
              </button>
              <button type="button" onClick={() => resolveAbbreviationPrompt(true)}>
                Yes — Keep in Caps
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCsvImport && (
        <CsvImportConfirm
          parsed={pendingCsvImport.parsed}
          defaultTitle={pendingCsvImport.defaultTitle}
          onConfirm={handleCsvImportConfirm}
          onCancel={() => setPendingCsvImport(null)}
        />
      )}

      {exportChoice && !suffixModeChoice && !paddingSubstituteChoice && !blankCodeWarning && (
        <div className="validation-overlay" onClick={() => setExportChoice(null)}>
          <div
            ref={exportDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>
              Export to {exportChoice.format === 'csv' ? 'CSV' : 'Excel'} — Discrete Columns or
              Concatenated?
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setExportChoice(null)}>
                Cancel
              </button>
              <button type="button" onClick={() => runExport('discrete')}>
                Discrete Columns
              </button>
              <button type="button" onClick={() => runExport('concatenated')}>
                Concatenated
              </button>
              {exportChoice.format === 'csv' && (
                <>
                  <button type="button" onClick={() => runExport('discrete', true)}>
                    Discrete Columns (No Delimiter)
                  </button>
                  <button type="button" onClick={() => runExport('concatenated', true)}>
                    Concatenated (No Delimiter)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {paddingSubstituteChoice && (
        <div className="validation-overlay" onClick={() => setPaddingSubstituteChoice(null)}>
          <div
            ref={paddingSubstituteDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>
              It is strongly recommended NOT to use "0" unless the target software absolutely
              blocks "." and after detailed technical assessment "." is simply not permissible.
              Note that "0" makes use of the taxonomy less effective in analysis and manipulation
              of the content.
            </p>
            <div className="confirm-dialog-actions">
              {/* Last button = the default (Enter-activated, styled blue — App.tsx's global
                  Enter handler and App.css both key off "last button in this row"), so the
                  recommended "Keep '.'" choice goes last, not "Replace with '0'" — James's
                  report: the dialog argued strongly against "0" but still defaulted to it. */}
              <button
                type="button"
                onClick={() => {
                  const { mode, excludeDelimiters, suffixMode } = paddingSubstituteChoice;
                  setPaddingSubstituteChoice(null);
                  performExport(mode, '0', excludeDelimiters, suffixMode);
                }}
              >
                Replace with "0"
              </button>
              <button
                type="button"
                onClick={() => {
                  const { mode, excludeDelimiters, suffixMode } = paddingSubstituteChoice;
                  setPaddingSubstituteChoice(null);
                  performExport(mode, undefined, excludeDelimiters, suffixMode);
                }}
              >
                Keep "."
              </button>
            </div>
          </div>
        </div>
      )}

      {suffixModeChoice && (
        <div className="validation-overlay" onClick={() => setSuffixModeChoice(null)}>
          <div
            ref={suffixModeDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>Concatenate suffixes onto the description, or keep them right aligned in their own column(s)?</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  const { mode, excludeDelimiters } = suffixModeChoice;
                  setSuffixModeChoice(null);
                  proceedToExport(mode, excludeDelimiters, 'concatenate');
                }}
              >
                Concatenate
              </button>
              <button
                type="button"
                onClick={() => {
                  const { mode, excludeDelimiters } = suffixModeChoice;
                  setSuffixModeChoice(null);
                  proceedToExport(mode, excludeDelimiters, 'rightAlign');
                }}
              >
                Right Align
              </button>
            </div>
          </div>
        </div>
      )}

      {blankCodeWarning && (
        <div className="validation-overlay" onClick={() => setBlankCodeWarning(null)}>
          <div
            ref={blankCodeDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>Blank cells in code range, all cells in code range must contain a character</p>
            {/* James's ask: Cancel goes last (default/blue/Enter-activated) rather than
                "Accept" — proceeding with blank codes isn't the recommended path. */}
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  const { action } = blankCodeWarning;
                  setBlankCodeWarning(null);
                  action();
                }}
              >
                Accept
              </button>
              <button type="button" onClick={() => setBlankCodeWarning(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {exportBlockRangeChoice && (
        <div className="validation-overlay" onClick={() => setExportBlockRangeChoice(null)}>
          <div
            ref={exportBlockRangeDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>
              Export {exportBlockRangeChoice.rows.length} selected row{exportBlockRangeChoice.rows.length === 1 ? '' : 's'} as a
              block — Include Suffix?
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setExportBlockRangeChoice(null)}>
                Cancel
              </button>
              <button type="button" onClick={() => performExportBlockRange(false)}>
                No
              </button>
              <button type="button" onClick={() => performExportBlockRange(true)}>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {showLibraryCategoryPrompt && (
        <div className="validation-overlay" onClick={() => setShowLibraryCategoryPrompt(false)}>
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Save this taxonomy to the Library under which heading?</p>
            <label className="library-name-label">
              Name
              <input
                type="text"
                className="library-name-input"
                value={libraryNamePrompt}
                onChange={(e) => setLibraryNamePrompt(e.target.value)}
              />
            </label>
            <select
              className="library-category-select"
              value={libraryCategoryPrompt}
              onChange={(e) => setLibraryCategoryPrompt(e.target.value as LibraryCategory)}
            >
              {LIBRARY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowLibraryCategoryPrompt(false)}>
                Cancel
              </button>
              <button type="button" onClick={confirmAddToLibrary}>
                Add to Library
              </button>
            </div>
          </div>
        </div>
      )}

      {showLibraryOverwritePrompt && (
        <div className="validation-overlay" onClick={() => setShowLibraryOverwritePrompt(false)}>
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>This taxonomy is already in the Library. Overwrite that entry, or keep it and save this as a new version?</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowLibraryOverwritePrompt(false)}>
                Cancel
              </button>
              <button type="button" onClick={confirmOverwriteLibraryEntry}>
                Overwrite
              </button>
              <button type="button" onClick={confirmNewLibraryVersion}>
                New Version
              </button>
            </div>
          </div>
        </div>
      )}

      {libraryRemoveTarget && (
        <div className="validation-overlay" onClick={() => setLibraryRemoveTarget(null)}>
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Remove "{libraryRemoveTarget.project.title || '(untitled)'}" from the Library? This does not affect the work area.</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setLibraryRemoveTarget(null)}>
                Cancel
              </button>
              <button type="button" onClick={handleRemoveLibraryEntry}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoadFromLibrary && (
        <div className="validation-overlay" onClick={() => setShowLoadFromLibrary(false)}>
          <div className="validation-dialog library-export-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Choose a taxonomy to open from your Library:</p>
            <div className="library-export-checklist">
              {LIBRARY_CATEGORIES.filter((category) => libraryEntries.some((e) => e.category === category)).map(
                (category, index, visibleCategories) => {
                  const isFirstCubicCategory =
                    CUBIC_BUSINESS_MODEL_LIBRARY_CATEGORIES.includes(category) &&
                    visibleCategories.slice(0, index).every((c) => !CUBIC_BUSINESS_MODEL_LIBRARY_CATEGORIES.includes(c));
                  return (
                    <div key={category} className="library-export-checklist-group">
                      {isFirstCubicCategory && <h4 className="library-load-picker-group-heading">Cubic Business Model</h4>}
                      <h4>{category}</h4>
                      {libraryEntries
                        .filter((e) => e.category === category)
                        .sort((a, b) => a.order - b.order)
                        .map((entry) => (
                          <button
                            type="button"
                            key={entry.id}
                            className="library-load-picker-item"
                            onClick={() => {
                              handleMoveToWorkArea(entry);
                              setShowLoadFromLibrary(false);
                            }}
                          >
                            {entry.project.title || '(untitled)'}
                          </button>
                        ))}
                    </div>
                  );
                },
              )}
            </div>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowLoadFromLibrary(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showGLAnalyserNotice && (
        <div className="validation-overlay" onClick={() => setShowGLAnalyserNotice(false)}>
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Under development – ERP Doctor Managed Version Available</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowGLAnalyserNotice(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showGLBuilder && (
        <div className="validation-overlay" onClick={() => !glBuilderExporting && setShowGLBuilder(false)}>
          <div className="validation-dialog gl-builder-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>
              Build Cubic Business Model Chart of Accounts – being upgraded -- facility pending --
              contact us if interested.
            </p>
            <p>In the meantime, export the four Cubic Business Model tables as standard CSVs.</p>
            <p>Pick which Library entry each file comes from.</p>
            <p>Unique filename suffix to identify the corporate entity to be analysed in GL Builder.</p>
            <label>
              File name suffix
              <input
                type="text"
                value={glBuilderSuffix}
                onChange={(e) => setGlBuilderSuffix(e.target.value)}
                placeholder="e.g. Client ABC"
              />
            </label>
            {GL_BUILDER_CATEGORIES.map(({ category, prefix, label }) => {
              const entriesInCategory = libraryEntries.filter((e) => e.category === category);
              return (
                <label key={category}>
                  {prefix} — {label}
                  <select
                    value={glBuilderSelection[category] ?? ''}
                    onChange={(e) => setGlBuilderSelection({ ...glBuilderSelection, [category]: e.target.value })}
                    disabled={entriesInCategory.length === 0}
                  >
                    <option value="">
                      {entriesInCategory.length === 0 ? '(none in Library yet — skipped)' : '(skip this file)'}
                    </option>
                    {entriesInCategory.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.project.title || '(untitled)'}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowGLBuilder(false)} disabled={glBuilderExporting}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGLBuilderExport}
                disabled={
                  glBuilderExporting ||
                  !glBuilderSuffix.trim() ||
                  GL_BUILDER_CATEGORIES.every(({ category }) => !glBuilderSelection[category])
                }
              >
                {glBuilderExporting ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      )}

      {csvAuditPrompt && (
        <div className="validation-overlay" onClick={() => setCsvAuditPrompt(false)}>
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Run Audit Taxonomy before exporting to CSV? Recommended — this export feeds other software, where a gap is much harder to spot after the fact than a quick check now.</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setCsvAuditPrompt(false);
                  setExportChoice({ format: 'csv' });
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setCsvAuditPrompt(false);
                  runAudit('export-csv');
                }}
              >
                Yes, Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {auditExitConfirm && (
        <div className="validation-overlay" onClick={() => setAuditExitConfirm(false)}>
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Exit Audit? Any issues not yet fixed will need a fresh Audit run to find again.</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setAuditExitConfirm(false);
                  performAuditExit();
                }}
              >
                Exit Audit
              </button>
              <button type="button" onClick={() => setAuditExitConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {audit && (
        <AuditPanel
          status={audit.status}
          origin={audit.origin}
          currentIndex={Math.min(audit.cursor + 1, audit.originalRowIds.length)}
          originalTotal={audit.originalRowIds.length}
          message={audit.currentIssue?.message ?? ''}
          currentIssueKind={audit.currentIssue?.kind ?? null}
          anchor={auditAnchor}
          onClearError={handleAuditClearError}
          onAccept={handleAuditAccept}
          onExit={handleAuditExit}
          onResume={handleAuditResume}
          onLockFromClean={() => {
            setAudit(null);
            setLockConfirm('lock');
          }}
          onExportCsvFromClean={() => {
            setAudit(null);
            setExportChoice({ format: 'csv' });
          }}
        />
      )}

      {lockConfirm && (
        <div className="validation-overlay" onClick={() => setLockConfirm(null)}>
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>
              {lockConfirm === 'lock'
                ? 'Lock this taxonomy? Every row currently in the table becomes protected — its code and description can no longer be edited or deleted (Mark as Delete can still retire an entry), and new rows can only be inserted where a code gap already exists. The file will be saved.'
                : 'Lock these updates? Every row currently in the table — including whatever has been added since the last Lock — becomes protected, and the taxonomy shows the original plus the updates as one locked list. The file will be saved.'}
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setLockConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const kind = lockConfirm;
                  setLockConfirm(null);
                  if (kind === 'lock') performLockTaxonomy();
                  else performLockUpdates();
                }}
              >
                {lockConfirm === 'lock' ? 'Continue and Lock' : 'Continue and Lock Updates'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
    {buildInfoTag}
    </>
  );
}
