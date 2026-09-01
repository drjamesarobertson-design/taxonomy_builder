import { useState } from 'react';
import { DEFAULT_SETTINGS } from './types';
import HelpIcon from './HelpIcon';
import type { HelpTextMap } from './helpText';

interface SimpleTaxonomySetupProps {
  onCreate: (title: string, tableName: string, purpose: string, maxDescriptionLength: number) => void;
  helpText: HelpTextMap;
}

// A trimmed setup screen for the Simple Taxonomy guided wizard — just the four things Section
// 5 step 1 actually asks for up front (title, table name, purpose, max description length).
// Everything else the full New Taxonomy form collects (code column count, delimiters,
// suffixes, code delimiter character) is silently defaulted here and only ever surfaces once
// the wizard's coding stage actually needs it — no reason to ask a first-time user to make
// five structural decisions before they've typed a single heading. Every other workflow-menu
// level still uses the full form unchanged.
export default function SimpleTaxonomySetup({ onCreate, helpText }: SimpleTaxonomySetupProps) {
  const [title, setTitle] = useState('');
  const [tableName, setTableName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [maxDescriptionLengthText, setMaxDescriptionLengthText] = useState(
    String(DEFAULT_SETTINGS.maxDescriptionLength),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !tableName.trim()) return;
    const maxDescriptionLength = Math.max(1, Number(maxDescriptionLengthText) || DEFAULT_SETTINGS.maxDescriptionLength);
    onCreate(title.trim(), tableName.trim(), purpose.trim(), maxDescriptionLength);
  }

  return (
    <form className="new-taxonomy-form" onSubmit={handleSubmit}>
      <h2>Create a Simple Taxonomy</h2>
      <p className="simple-setup-intro">
        You'll be guided through building this one step at a time — headings first, then any
        sub-items, then coding. Everything else can be set up once you get there.
      </p>
      <label>
        Title
        <HelpIcon field="title" helpText={helpText} />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          title="The name by which this table will be known in project documentation and the description of the table in the ERP"
        />
      </label>
      <label>
        Table Name
        <HelpIcon field="tableName" helpText={helpText} />
        <input
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          required
          title="The database table name that will be used in the ERP"
        />
      </label>
      <label>
        Purpose
        <HelpIcon field="purpose" helpText={helpText} />
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={3}
          title="A description of the role of this table in the ERP"
        />
      </label>
      <label>
        Maximum ERP Description Field Length
        <HelpIcon field="maxDescriptionLength" helpText={helpText} />
        <input
          type="number"
          min={1}
          value={maxDescriptionLengthText}
          onChange={(e) => setMaxDescriptionLengthText(e.target.value)}
          onBlur={() => {
            const n = Number(maxDescriptionLengthText);
            if (!maxDescriptionLengthText || Number.isNaN(n) || n < 1) {
              setMaxDescriptionLengthText(String(DEFAULT_SETTINGS.maxDescriptionLength));
            }
          }}
          title="This is the description field length limit imposed by the ERP or a lesser length if it is desired to curtail description length, should never exceed the field length in the ERP"
        />
      </label>
      <div className="form-actions">
        <button type="submit">Start Building</button>
      </div>
    </form>
  );
}
