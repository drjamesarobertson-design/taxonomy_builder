import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from './types';
import HelpIcon from './HelpIcon';
import Tooltip from './Tooltip';
import type { HelpTextMap } from './helpText';

interface FlatListSetupProps {
  onCreate: (
    title: string,
    tableName: string,
    purpose: string,
    maxDescriptionLength: number,
    column1CodeLength: number,
    properCaseOnly: boolean,
  ) => void;
  helpText: HelpTextMap;
}

// A dedicated setup screen for a genuinely flat, single-column list with no hierarchy at all
// (e.g. Reason Codes) — James's ask, split out from Simple Taxonomy's own setup form (where this
// used to live behind a "Limit to Single Code Column" checkbox) because the multi-level guided
// wizard's banner (Fill Codes / Pad Codes / Finish) and its own two-stage prompts (headings, then
// sub-items) don't apply to a flat list at all — there's no hierarchy to fill codes down through
// or pad out, and no second description column ever comes into play. This type goes straight to
// the ordinary working grid once created, no wizard stage.
export default function FlatListSetup({ onCreate, helpText }: FlatListSetupProps) {
  // Same fix as every other setup form's own — arriving here with the page already scrolled
  // down leaves the sticky header pinned over this form's own top content.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [title, setTitle] = useState('');
  const [tableName, setTableName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [maxDescriptionLengthText, setMaxDescriptionLengthText] = useState(
    String(DEFAULT_SETTINGS.maxDescriptionLength),
  );
  const [column1CodeLengthText, setColumn1CodeLengthText] = useState(String(DEFAULT_SETTINGS.column1CodeLength));
  // James's ask: an explicit choice here rather than always Proper Case — a flat list's entries
  // are always leaves (there's no hierarchy for ALL CAPS structural rows to apply to either
  // way), so which convention reads better is purely a matter of house style for this table.
  const [properCaseOnly, setProperCaseOnly] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !tableName.trim()) return;
    const maxDescriptionLength = Math.max(1, Number(maxDescriptionLengthText) || DEFAULT_SETTINGS.maxDescriptionLength);
    const column1CodeLength = Math.max(1, Math.min(5, Number(column1CodeLengthText) || DEFAULT_SETTINGS.column1CodeLength));
    onCreate(title.trim(), tableName.trim(), purpose.trim(), maxDescriptionLength, column1CodeLength, properCaseOnly);
  }

  return (
    <form className="new-taxonomy-form" onSubmit={handleSubmit}>
      <h2>Create a One Column List with Multiple Character Codes</h2>
      <p className="simple-setup-intro">
        A flat list with no headings or hierarchy — e.g. Reason Codes — where column 1's own code
        may hold more than one character.
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
      <label>
        Column 1 Code Length
        <HelpIcon field="column1CodeLength" helpText={helpText} />
        <select value={column1CodeLengthText} onChange={(e) => setColumn1CodeLengthText(e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} character{n === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flat-list-case-choice">
        <legend>
          Description Case
          <HelpIcon field="properCaseOnly" helpText={helpText} />
        </legend>
        <label className="checkbox-label">
          <input type="radio" checked={properCaseOnly} onChange={() => setProperCaseOnly(true)} />
          Proper Case
        </label>
        <label className="checkbox-label">
          <input type="radio" checked={!properCaseOnly} onChange={() => setProperCaseOnly(false)} />
          ALL CAPS
        </label>
      </fieldset>
      <div className="form-actions">
        <Tooltip field="btnStartBuilding" helpText={helpText}>
          <button type="submit">Start Building</button>
        </Tooltip>
      </div>
    </form>
  );
}
