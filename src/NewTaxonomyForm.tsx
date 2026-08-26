import { useState } from 'react';
import { DEFAULT_SETTINGS } from './types';

interface NewTaxonomyFormProps {
  onCreate: (title: string, tableName: string, purpose: string, maxDescriptionLength: number) => void;
}

export default function NewTaxonomyForm({ onCreate }: NewTaxonomyFormProps) {
  const [title, setTitle] = useState('');
  const [tableName, setTableName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [maxDescriptionLength, setMaxDescriptionLength] = useState(
    DEFAULT_SETTINGS.maxDescriptionLength,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !tableName.trim()) return;
    onCreate(title.trim(), tableName.trim(), purpose.trim(), maxDescriptionLength);
  }

  return (
    <form className="new-taxonomy-form" onSubmit={handleSubmit}>
      <h2>Create a New Taxonomy</h2>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Table Name
        <input value={tableName} onChange={(e) => setTableName(e.target.value)} required />
      </label>
      <label>
        Purpose
        <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} />
      </label>
      <label>
        Maximum ERP Description Field Length
        <input
          type="number"
          min={1}
          value={maxDescriptionLength}
          onChange={(e) => setMaxDescriptionLength(Number(e.target.value))}
        />
      </label>
      <button type="submit">Create Taxonomy</button>
    </form>
  );
}
