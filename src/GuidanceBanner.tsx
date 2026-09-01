import { useState } from 'react';
import type { CodeRestriction, TaxonomyProject, TaxonomyRow, TaxonomySettings } from './types';
import { growRowsToLevels } from './types';
import { countChildrenPerHeading, countHeadings, maxLevelUsed, suggestMnemonicCodes } from './guidance';

interface GuidanceBannerProps {
  project: TaxonomyProject;
  onSettingsAndRowsChange: (settings: TaxonomySettings, rows: TaxonomyRow[]) => void;
  onExitGuidance: () => void;
}

// The Simple Taxonomy guided wizard's on-screen driver: stage instructions, the "Next Step"
// gate (with a confirm-style override when the 5-to-9 recommendation is exceeded — a positive
// click required, not just a dismissible notice, per James's explicit ask), and the coding
// stage's Numeric/Alpha + mnemonic-suggestion prompts. Column visibility itself is Grid.tsx's
// concern (driven by the same `settings.guidance` this component reads); this just drives the
// stage machine and hands Grid whatever new settings/rows a transition produces.
export default function GuidanceBanner({ project, onSettingsAndRowsChange, onExitGuidance }: GuidanceBannerProps) {
  const [confirmOverride, setConfirmOverride] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [codingPrompt, setCodingPrompt] = useState<'restriction' | 'mnemonic' | null>(null);
  const [pendingRestriction, setPendingRestriction] = useState<CodeRestriction | null>(null);

  const guidance = project.settings.guidance;
  if (!guidance) return null;
  const { stage, level: guidanceLevel } = guidance;
  const rows = project.rows;

  function advanceToSubItems() {
    const newNumLevels = Math.max(project.settings.numLevels, 2);
    onSettingsAndRowsChange(
      { ...project.settings, numLevels: newNumLevels, guidance: { level: guidanceLevel, stage: 'subItems' } },
      growRowsToLevels(rows, newNumLevels),
    );
  }

  function handleHeadingsNext() {
    const count = countHeadings(rows);
    if (count === 0) return;
    if (count < 5 || count > 9) {
      setConfirmOverride({
        message: `You have ${count} heading${count === 1 ? '' : 's'} — recommended 5 to 9. Continue anyway?`,
        onConfirm: () => {
          setConfirmOverride(null);
          advanceToSubItems();
        },
      });
      return;
    }
    advanceToSubItems();
  }

  function beginCoding() {
    const level = maxLevelUsed(rows);
    const newNumLevels = level + 1;
    const trimmedRows = rows.map((row) => ({
      ...row,
      codes: row.codes.slice(0, newNumLevels),
      descriptions: row.descriptions.slice(0, newNumLevels),
    }));
    onSettingsAndRowsChange(
      { ...project.settings, numLevels: newNumLevels, guidance: { level: guidanceLevel, stage: 'coding' } },
      trimmedRows,
    );
    setCodingPrompt('restriction');
  }

  function handleSubItemsNext() {
    // A heading with zero children is a deliberate choice (Simple Taxonomy allows some
    // headings to stay flat), so only a *non-zero* count outside 5-9 is worth flagging.
    const outOfRange = countChildrenPerHeading(rows).filter((c) => c > 0 && (c < 5 || c > 9));
    if (outOfRange.length > 0) {
      setConfirmOverride({
        message: `${outOfRange.length} heading${outOfRange.length === 1 ? '' : 's'} ${
          outOfRange.length === 1 ? 'has' : 'have'
        } an unusual number of sub-items (recommended 5 to 9, when used at all). Continue anyway?`,
        onConfirm: () => {
          setConfirmOverride(null);
          beginCoding();
        },
      });
      return;
    }
    beginCoding();
  }

  function chooseRestriction(restriction: CodeRestriction) {
    if (restriction === 'Numeric Only') {
      applyCoding(restriction, false);
      return;
    }
    setPendingRestriction(restriction);
    setCodingPrompt('mnemonic');
  }

  // Applying the coding choice ends the wizard outright (guidance: undefined) — its job was
  // just to get the codes started, not to keep gating anything past this point. James asked
  // for real auto-suggested codes here (a deliberate, scoped exception to Section 9.6 — see
  // guidance.ts), pre-filled directly into ordinary, still fully-editable code cells.
  function applyCoding(restriction: CodeRestriction, useMnemonic: boolean) {
    const level = maxLevelUsed(rows);
    const newRows = useMnemonic ? suggestMnemonicCodes(rows, level, restriction) : rows;
    onSettingsAndRowsChange({ ...project.settings, codeRestriction: restriction, guidance: undefined }, newRows);
    setCodingPrompt(null);
    setPendingRestriction(null);
  }

  const headingCount = countHeadings(rows);

  return (
    <section className="guidance-banner">
      <div className="guidance-banner-text">
        {stage === 'headings' && (
          <>
            <strong>Step 1 — Major Headings.</strong> List the major categories that make up the
            top level of your taxonomy — aim for 5 to 9. Right-click a heading for Alpha Sort
            once you're done.
            <span className="guidance-count">
              {' '}
              {headingCount} heading{headingCount === 1 ? '' : 's'} so far.
            </span>
          </>
        )}
        {stage === 'subItems' && (
          <>
            <strong>Step 2 — Sub-Items.</strong> For any heading that needs breaking down
            further, add its sub-items underneath it (aim for 5 to 9 each) — headings that don't
            need further detail can stay just as they are.
          </>
        )}
        {stage === 'coding' && !codingPrompt && (
          <>
            <strong>Step 3 — Coding.</strong> Enter or adjust the codes for each entry.
          </>
        )}
      </div>
      <div className="guidance-banner-actions">
        {stage === 'headings' && (
          <button type="button" onClick={handleHeadingsNext} disabled={headingCount === 0}>
            Next Step →
          </button>
        )}
        {stage === 'subItems' && (
          <button type="button" onClick={handleSubItemsNext}>
            Next Step →
          </button>
        )}
        <button type="button" className="guidance-exit-btn" onClick={onExitGuidance}>
          Exit Guidance
        </button>
      </div>

      {confirmOverride && (
        <div className="validation-overlay" onClick={() => setConfirmOverride(null)}>
          <div className="validation-dialog" onClick={(e) => e.stopPropagation()}>
            <p>{confirmOverride.message}</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setConfirmOverride(null)}>
                Cancel
              </button>
              <button type="button" onClick={confirmOverride.onConfirm}>
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {codingPrompt === 'restriction' && (
        <div className="validation-overlay">
          <div className="validation-dialog">
            <p>Numeric or Alpha codes?</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => chooseRestriction('Numeric Only')}>
                Numeric
              </button>
              <button type="button" onClick={() => chooseRestriction('Alpha Upper Case Only')}>
                Alpha
              </button>
            </div>
          </div>
        </div>
      )}

      {codingPrompt === 'mnemonic' && pendingRestriction && (
        <div className="validation-overlay">
          <div className="validation-dialog">
            <p>
              Base codes on the first letter of each description (a memorable, mnemonic code)?
              Suggested codes are dropped straight into the grid — you can overtype any of them
              afterwards with the usual editing controls.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => applyCoding(pendingRestriction, false)}>
                No — I'll Enter Codes Myself
              </button>
              <button type="button" onClick={() => applyCoding(pendingRestriction, true)}>
                Yes — Suggest Codes
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
