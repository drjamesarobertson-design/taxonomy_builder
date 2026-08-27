import { useEffect, useRef, useState } from 'react';
import type { TaxonomyProject, TaxonomyRow } from './types';
import { createEmptyRow, createProject } from './types';
import { saveProjectToFile, loadProjectFromFile } from './storage';
import {
  exportDiscreteCsv,
  exportDiscreteXlsx,
  exportConcatenatedCsv,
  exportConcatenatedXlsx,
} from './gridExport';
import NewTaxonomyForm from './NewTaxonomyForm';
import Grid from './Grid';
import Logo from './Logo';
import './App.css';

export default function App() {
  const [project, setProject] = useState<TaxonomyProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autoFocusFirstRow, setAutoFocusFirstRow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // The sign-on (New Taxonomy) screen gets its own dark theme; the working grid keeps the
  // existing light one. Toggled on the body so the theme covers the full page, not just the
  // width-constrained .app box.
  useEffect(() => {
    document.body.classList.toggle('sign-on-theme', !project);
    return () => document.body.classList.remove('sign-on-theme');
  }, [project]);

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
  ) {
    const newProject = createProject(title, tableName, purpose, maxDescriptionLength, delimiterPositions);
    // Start the user off with a row already in place, cursor ready, rather than an empty grid.
    newProject.rows = [createEmptyRow(newProject.settings.numLevels)];
    setProject(newProject);
    setDirty(true);
    setAutoFocusFirstRow(true);
    setUndoStack([]);
    setRedoStack([]);
    lastEditKeyRef.current = null;
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

  function handleSave() {
    if (!project) return;
    saveProjectToFile(project);
    setDirty(false);
  }

  function handleLoadClick() {
    fileInputRef.current?.click();
  }

  function runExport(mode: 'discrete' | 'concatenated') {
    if (!project || !exportChoice) return;
    const { format } = exportChoice;
    if (format === 'csv') {
      if (mode === 'discrete') exportDiscreteCsv(project);
      else exportConcatenatedCsv(project);
    } else {
      if (mode === 'discrete') exportDiscreteXlsx(project);
      else exportConcatenatedXlsx(project);
    }
    setExportChoice(null);
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
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this file.');
    }
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
            {project && (
              <button type="button" onClick={handleSave}>
                Save to File
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
              <button type="button" onClick={handleLoadClick}>
                Load from File
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
          <NewTaxonomyForm onCreate={handleCreate} onLoadClick={handleLoadClick} />
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
          <Grid
            settings={project.settings}
            rows={project.rows}
            onChange={handleRowsChange}
            autoFocusFirstRow={autoFocusFirstRow}
          />
        </>
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
    </div>
  );
}
