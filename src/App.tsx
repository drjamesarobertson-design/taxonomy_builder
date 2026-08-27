import { useRef, useState } from 'react';
import type { TaxonomyProject, TaxonomyRow } from './types';
import { createProject } from './types';
import { saveProjectToFile, loadProjectFromFile } from './storage';
import NewTaxonomyForm from './NewTaxonomyForm';
import Grid from './Grid';
import './App.css';

export default function App() {
  const [project, setProject] = useState<TaxonomyProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleCreate(
    title: string,
    tableName: string,
    purpose: string,
    maxDescriptionLength: number,
    delimiterPositions: number[],
  ) {
    setProject(createProject(title, tableName, purpose, maxDescriptionLength, delimiterPositions));
    setDirty(true);
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
        <h1>Taxonomy Builder</h1>
        <div className="toolbar">
          {project && (
            <button type="button" onClick={handleSave}>
              Save to File
            </button>
          )}
          <button type="button" onClick={handleLoadClick}>
            Load from File
          </button>
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
      </header>

      {loadError && <p className="load-error">{loadError}</p>}

      {!project && <NewTaxonomyForm onCreate={handleCreate} />}

      {project && (
        <>
          <section className="taxonomy-meta">
            <h2>{project.title}</h2>
            <p className="table-name">Table: {project.tableName}</p>
            {project.purpose && <p className="purpose">{project.purpose}</p>}
          </section>
          <Grid settings={project.settings} rows={project.rows} onChange={handleRowsChange} />
        </>
      )}
    </div>
  );
}
