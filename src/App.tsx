import { useEffect, useRef, useState } from 'react';
import type { TaxonomyProject, TaxonomyRow, TaxonomySettings, SuffixField } from './types';
import { createEmptyRow, createProject, growRowsToLevels } from './types';
import { saveProjectToFile, loadProjectFromFile } from './storage';
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
import SettingsModal from './SettingsModal';
import type { SettingsFields } from './SettingsModal';
import Grid from './Grid';
import Logo from './Logo';
import './App.css';

export default function App() {
  const [project, setProject] = useState<TaxonomyProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autoFocusFirstRow, setAutoFocusFirstRow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  } | null>(null);
  const paddingSubstituteDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paddingSubstituteChoice) paddingSubstituteDialogRef.current?.focus();
  }, [paddingSubstituteChoice]);

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
    setProjectGeneration((g) => g + 1);
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

  async function performSave() {
    if (!project) return;
    // saveProjectToFile bumps and returns the project's own "save" version counter (used to
    // build its " v1.NN" filename) — persisted back into state, bypassing undo/redo, since
    // it's bookkeeping metadata, not a user edit. It also reports whether the file actually
    // landed in the remembered folder or fell back to a plain download (e.g. permission
    // lapsed) — if it fell back, the "Folder: X" button is no longer telling the truth, so
    // clear it back to "Choose Export Folder" rather than leave a stale, inoperative label.
    const { project: versioned, usedFolder, cancelled } = await saveProjectToFile(project);
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

  function handleLoadClick() {
    fileInputRef.current?.click();
  }

  async function performExport(mode: 'discrete' | 'concatenated', paddingOverride?: string) {
    if (!project || !exportChoice) return;
    const { format } = exportChoice;
    const options = paddingOverride ? { paddingOverride } : undefined;
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

  // Between choosing Discrete/Concatenated and actually exporting: if the taxonomy's codes are
  // still padded with "." (the only option Settings/New Taxonomy offer now), ask whether to
  // substitute "0" in this one export's output — a one-off, per-file choice rather than a
  // standing setting, since it's meant only for the rare ERP that genuinely can't accept ".".
  function proceedToExport(mode: 'discrete' | 'concatenated') {
    if (!project) return;
    if (project.settings.paddingChar === '.') {
      setPaddingSubstituteChoice({ mode });
    } else {
      performExport(mode);
    }
  }

  function runExport(mode: 'discrete' | 'concatenated') {
    if (!project) return;
    if (hasBlankCodeGaps(project.rows)) {
      setBlankCodeWarning({ action: () => proceedToExport(mode) });
      return;
    }
    proceedToExport(mode);
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
      setProjectGeneration((g) => g + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this file.');
    }
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

  function handleNewTaxonomy() {
    if (project && dirty && !confirm('Discard the current taxonomy and start a new one?')) return;
    setProject(null);
    setLoadError(null);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-heading">The ERP Doctor Taxonomy Builder</h1>
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
              <button type="button" onClick={handleChooseFolder} title="Where Save to File and Export write their files">
                {exportFolderName ? `Folder: ${exportFolderName}` : 'Choose Export Folder'}
              </button>
            )}
            {project && (
              <button type="button" className={justSaved ? 'save-flash' : undefined} onClick={handleSave}>
                {justSaved ? 'Saved ✓' : 'Save to File'}
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
              <button type="button" onClick={handleLoadClick}>
                Load from File
              </button>
            )}
            {project && (
              <button type="button" onClick={() => setShowSettings(true)}>
                Settings
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
          </div>
          <Logo className="app-logo" />
        </div>
      </header>

      {loadError && <p className="load-error">{loadError}</p>}

      {!project && (
        <>
          <section className="load-from-file-section">
            <button type="button" onClick={handleLoadClick}>
              Load from File
            </button>
            <p>Already have a saved taxonomy? Loading one replaces anything entered below.</p>
          </section>
          <NewTaxonomyForm onCreate={handleCreate} helpText={helpText} />
          <footer className="app-footer">
            The ERP Doctor Taxonomy Builder is the Intellectual Property of the ERP Doctor and
            James A Robertson and Associates Limited, it is copyright © 2026
          </footer>
        </>
      )}

      {project && (
        <>
          <section className="taxonomy-meta">
            <h2>{project.title}</h2>
            <p className="table-name">Table: {project.tableName}</p>
            {project.purpose && <p className="purpose">{project.purpose}</p>}
          </section>
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
          <Grid
            key={projectGeneration}
            settings={project.settings}
            rows={project.rows}
            onChange={handleRowsChange}
            onSettingsAndRowsChange={handleSettingsAndRowsChange}
            helpText={helpText}
            autoFocusFirstRow={autoFocusFirstRow}
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

      {exportChoice && (
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
                  const { mode } = paddingSubstituteChoice;
                  setPaddingSubstituteChoice(null);
                  performExport(mode);
                }}
              >
                Keep "."
              </button>
              <button
                type="button"
                onClick={() => {
                  const { mode } = paddingSubstituteChoice;
                  setPaddingSubstituteChoice(null);
                  performExport(mode, '0');
                }}
              >
                Replace with "0"
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
    </div>
  );
}
