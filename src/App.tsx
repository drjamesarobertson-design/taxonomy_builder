import { useEffect, useRef, useState } from 'react';
import type { TaxonomyProject, TaxonomyRow } from './types';
import { createEmptyRow, createProject } from './types';
import { saveProjectToFile, loadProjectFromFile } from './storage';
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

  // The sign-on (New Taxonomy) screen gets its own dark theme; the working grid keeps the
  // existing light one. Toggled on the body so the theme covers the full page, not just the
  // width-constrained .app box.
  useEffect(() => {
    document.body.classList.toggle('sign-on-theme', !project);
    return () => document.body.classList.remove('sign-on-theme');
  }, [project]);

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
  }

  function handleRowsChange(rows: TaxonomyRow[]) {
    if (!project) return;
    setProject({ ...project, rows });
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
              <button type="button" onClick={handleSave}>
                Save to File
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
    </div>
  );
}
