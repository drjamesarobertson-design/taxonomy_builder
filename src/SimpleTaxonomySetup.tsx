import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from './types';
import HelpIcon from './HelpIcon';
import Tooltip from './Tooltip';
import type { HelpTextMap } from './helpText';

interface SimpleTaxonomySetupProps {
  onCreate: (
    title: string,
    tableName: string,
    purpose: string,
    maxDescriptionLength: number,
    column1CodeLength: number,
    properCaseOnly: boolean,
    singleCodeColumn: boolean,
  ) => void;
  helpText: HelpTextMap;
}

// A trimmed setup screen for the Simple Taxonomy guided wizard — just the four things Section
// 5 step 1 actually asks for up front (title, table name, purpose, max description length),
// plus Limit to Single Code Column and, only meaningful once that's checked, Column 1 Code
// Length: deliberately offered ONLY here, not on the full New Taxonomy form and not in the
// ongoing Settings dialog. Everything else the full New Taxonomy form collects (code column
// count, delimiters, suffixes, code delimiter character) is silently defaulted here and only
// ever surfaces once the wizard's coding stage actually needs it — no reason to ask a
// first-time user to make five structural decisions before they've typed a single heading.
// Every other workflow-menu level still uses the full form unchanged, with column 1 staying a
// single character.
export default function SimpleTaxonomySetup({ onCreate, helpText }: SimpleTaxonomySetupProps) {
  // Same fix as NewTaxonomyForm's own — arriving here with the page already scrolled down
  // leaves the sticky header pinned over this form's own top content. Reset to the top on mount.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [title, setTitle] = useState('');
  const [tableName, setTableName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [maxDescriptionLengthText, setMaxDescriptionLengthText] = useState(
    String(DEFAULT_SETTINGS.maxDescriptionLength),
  );
  // James's realisation: a multi-character column 1 code (and the Proper-Case-throughout
  // convention that goes with it — a flat list has no headings, so every entry is a leaf) only
  // ever makes sense for a genuinely flat, single-column list (e.g. Reason Codes) — never for an
  // ordinary multi-level taxonomy, where every level still needs its own single-character
  // column. Both are hidden entirely until this is checked, and Column 1 Code Length resets to
  // 1 (an ordinary taxonomy) the moment it's unchecked again.
  const [singleCodeColumn, setSingleCodeColumn] = useState(false);
  const [column1CodeLengthText, setColumn1CodeLengthText] = useState(String(DEFAULT_SETTINGS.column1CodeLength));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !tableName.trim()) return;
    const maxDescriptionLength = Math.max(1, Number(maxDescriptionLengthText) || DEFAULT_SETTINGS.maxDescriptionLength);
    const column1CodeLength = singleCodeColumn
      ? Math.max(1, Math.min(5, Number(column1CodeLengthText) || DEFAULT_SETTINGS.column1CodeLength))
      : 1;
    onCreate(
      title.trim(),
      tableName.trim(),
      purpose.trim(),
      maxDescriptionLength,
      column1CodeLength,
      singleCodeColumn,
      singleCodeColumn,
    );
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
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={singleCodeColumn}
          onChange={(e) => setSingleCodeColumn(e.target.checked)}
        />
        Limit to Single Code Column — this will be a flat list with no headings or hierarchy
        (e.g. Reason Codes), not a multi-level taxonomy?
        <HelpIcon field="singleCodeColumn" helpText={helpText} />
      </label>
      {singleCodeColumn && (
        <>
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
          <p className="simple-setup-intro">
            All entries will be kept in Proper Case — a flat list has no headings, so the usual
            ALL CAPS heading convention doesn't apply here.
          </p>
        </>
      )}
      <div className="form-actions">
        <Tooltip field="btnStartBuilding" helpText={helpText}>
          <button type="submit">Start Building</button>
        </Tooltip>
      </div>
    </form>
  );
}
