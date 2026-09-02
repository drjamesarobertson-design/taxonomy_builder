import { useEffect, useRef, useState } from 'react';
import type { TaxonomyProject, TaxonomyRow, TaxonomySettings, SuffixField, CodeRestriction, WorkflowLevel } from './types';
import { createEmptyRow, createProject, growRowsToLevels, CODE_RESTRICTIONS } from './types';
import { saveProjectToFile, loadProjectFromFile, saveAutosave, loadAutosave } from './storage';
import {
  exportDiscreteCsv,
  exportDiscreteXlsx,
  exportConcatenatedCsv,
  exportConcatenatedXlsx,
} from './gridExport';
import { exportBlock } from './blockTransfer';
import { chooseExportFolder, peekExportFolderName, supportsFileSystemAccess } from './exportFolder';
import { hasBlankCodeGaps } from './codeValidation';
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
import { getStoredAuthEmail, clearAuthEmail } from './auth';
import {
  LIBRARY_CATEGORIES,
  listLibraryEntries,
  addLibraryEntry,
  updateLibraryEntryProject,
  renameLibraryEntry,
  setLibraryCategoryOrder,
  deleteLibraryEntry,
} from './library';
import type { LibraryCategory, LibraryEntry } from './library';
import './App.css';

export default function App() {
  // Sign-on gate (see auth.ts for what this can and can't actually guard). Remembered in this
  // browser's localStorage so it isn't asked on every visit — only Log Out or clearing site
  // data forgets it.
  const [authedEmail, setAuthedEmail] = useState<string | null>(() => getStoredAuthEmail());
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
  const [libraryRemoveTarget, setLibraryRemoveTarget] = useState<LibraryEntry | null>(null);
  const [justAddedToLibrary, setJustAddedToLibrary] = useState(false);
  const libraryAddedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      updateLibraryEntryProject(currentLibraryEntryId, project).then(() => {
        refreshLibrary();
        flashAddedToLibrary();
      });
    } else {
      setLibraryCategoryPrompt(LIBRARY_CATEGORIES[0]);
      setShowLibraryCategoryPrompt(true);
    }
  }

  function confirmAddToLibrary() {
    if (!project) return;
    addLibraryEntry(project, libraryCategoryPrompt).then((entry) => {
      setCurrentLibraryEntryId(entry.id);
      setShowLibraryCategoryPrompt(false);
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
  // Section 5 step 1 actually needs up front — everything structural (delimiters, suffixes,
  // code restriction) stays at its default until the wizard's coding stage needs it. Starts at
  // a single description level with no code columns yet; GuidanceBanner drives it from there.
  function handleCreateSimpleTaxonomy(title: string, tableName: string, purpose: string, maxDescriptionLength: number) {
    const newProject = createProject(title, tableName, purpose, maxDescriptionLength, [], ' ', 1);
    newProject.settings.guidance = { level: 'Simple Taxonomy', stage: 'headings' };
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
  function handleLockTaxonomy() {
    if (!project) return;
    if (
      !confirm(
        'Lock this taxonomy? Every row currently in the table becomes protected — its code and description can no longer be edited or deleted (Mark as Delete can still retire an entry), and new rows can only be inserted where a code gap already exists. The file will be saved. Continue?',
      )
    ) {
      return;
    }
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
  // knows what was already historical, and nothing here is silently forgotten.
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
    clearAuthEmail();
    setAuthedEmail(null);
  }

  if (!authedEmail) {
    return <Login onSuccess={setAuthedEmail} />;
  }

  return (
    <div className="app-shell">
      <LibrarySidebar
        entries={libraryEntries}
        onRename={handleRenameLibraryEntry}
        onReorder={handleReorderLibrary}
        onMoveToWorkArea={handleMoveToWorkArea}
        onRemove={setLibraryRemoveTarget}
      />
      <div className="app">
      <header className="app-header">
        <div className="app-heading-block">
          <h1 className="app-heading">The ERP Doctor Taxonomy Builder</h1>
          {!project && (
            <p className="app-tagline">Taxonomy Builder by the ERP Doctor James A Robertson and Associates Limited</p>
          )}
        </div>
        <div className="header-right">
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
            {project && !project.settings.locked && (
              <button
                type="button"
                className="lock-btn"
                onClick={handleLockTaxonomy}
                title="Protect every existing row's code and description once this taxonomy has gone live with real transactions"
              >
                🔒 Lock Taxonomy
              </button>
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
            {project && (
              <button type="button" onClick={() => setExportChoice({ format: 'csv' })}>
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
            {project && (
              <button type="button" onClick={handleLoadClick}>
                Load from File
              </button>
            )}
            {project && (
              <button type="button" onClick={handleImportCsvClick} title="Import a taxonomy from a Discrete Columns CSV">
                Import CSV
              </button>
            )}
            {project && (
              <button type="button" onClick={() => setShowSettings(true)}>
                Settings
              </button>
            )}
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
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleCsvFileSelected}
            />
          </div>
          <button type="button" className="log-out-btn" onClick={handleLogOut} title={`Signed in as ${authedEmail}`}>
            Log Out
          </button>
          <Logo className="app-logo" />
        </div>
      </header>

      {loadError && <p className="load-error">{loadError}</p>}

      {!project && signOnStage === 'menu' && (
        <>
          <WorkflowMenu
            onChooseNew={handleChooseWorkflowLevel}
            onChooseExisting={() => setSignOnStage('existing')}
            resumeTitle={loadAutosave()?.title ?? null}
            onResume={handleResumeWorkInProgress}
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
            <p>Or pick one from your Library on the left.</p>
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
          {project.settings.guidance ? (
            <GuidanceBanner
              project={project}
              onSettingsAndRowsChange={handleSettingsAndRowsChange}
              onExitGuidance={handleExitGuidance}
            />
          ) : (
            <section className={`worksheet-guidance ${guidanceExpanded ? 'expanded' : 'collapsed'}`}>
              <div className="worksheet-guidance-text">
                {helpText.worksheetGuidance?.trim() || 'No worksheet guidance has been added yet.'}
              </div>
              <button
                type="button"
                className="worksheet-guidance-toggle"
                onClick={() => setGuidanceExpanded((e) => !e)}
              >
                {guidanceExpanded ? 'Show less ▴' : 'Show more ▾'}
              </button>
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
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setBlankCodeWarning(null)}>
                Cancel
              </button>
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
      </div>
    </div>
  );
}
