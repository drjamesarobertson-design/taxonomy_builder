import { useState } from 'react';
import type { CodeRestriction, TaxonomyProject, TaxonomyRow, TaxonomySettings } from './types';
import { CODE_RESTRICTIONS, growRowsToLevels } from './types';
import {
  countChildrenPerHeading,
  countHeadings,
  fillCodesDown,
  findAlphabetBandSuggestions,
  findDuplicateCode,
  findRowsNeedingManualCode,
  hasOutOfOrderCodes,
  maxLevelUsed,
  padCodes,
  sortAllCodesAscending,
  suggestMnemonicCodes,
} from './guidance';
import { codeInputId } from './domIds';

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
  // James's ask: asked at the end of every description column (not just after the first) so
  // the wizard supports more than two columns — see resolveAnotherColumn below.
  const [anotherColumnPrompt, setAnotherColumnPrompt] = useState(false);
  const [codingPrompt, setCodingPrompt] = useState<'restriction' | 'mnemonic' | null>(null);
  const [pendingRestriction, setPendingRestriction] = useState<CodeRestriction | null>(null);
  // Item 5: the wizard's own "Numeric or Alpha?" prompt now carries the full Code Restriction
  // choice itself (defaulting to whatever the taxonomy already has), rather than showing a
  // binary Numeric/Alpha pair AND leaving the separate main-screen dropdown visible at the same
  // time — the two were conflicting during the wizard, per James's report. App.tsx hides that
  // main-screen dropdown for the whole time guidance is active.
  const [selectedRestriction, setSelectedRestriction] = useState<CodeRestriction>(project.settings.codeRestriction);
  // Item 6's safety net: the first row (if any) whose suggested code duplicates an earlier
  // sibling's — the root cause in guidance.ts is fixed, so this should rarely fire, but it's a
  // cheap backstop, and also catches a duplicate the user had typed in manually before Suggest
  // Codes ever ran.
  const [duplicateWarning, setDuplicateWarning] = useState<{ rowId: string; level: number } | null>(null);
  // Item 2: any level's sibling codes not in strictly ascending order after Suggest Codes.
  const [showOrderWarning, setShowOrderWarning] = useState(false);
  // Round-3 feedback, step 5 of the word/consonant rule: rows the suggestion algorithm
  // couldn't find a usable letter for at all — flagged for manual entry rather than left
  // silently blank.
  const [manualCodeWarning, setManualCodeWarning] = useState<{ rowId: string; level: number }[] | null>(null);
  // James's "ORDER CANCELLED still codes O" report: a queue of level-0 headings whose default
  // mnemonic code reaches further into the alphabet than his "first third" guidance allows for
  // their position among the taxonomy's other headings, each with an earlier, still-unused
  // alternative on offer — resolved one Y/N prompt at a time, first-to-last, before the usual
  // duplicate/order/manual-code checks run against whatever the user decided.
  const [bandSuggestions, setBandSuggestions] = useState<
    { rowId: string; defaultCode: string; suggestedCode: string }[]
  >([]);

  const guidance = project.settings.guidance;
  if (!guidance) return null;
  const { stage, level: guidanceLevel } = guidance;
  const rows = project.rows;

  // Reveals exactly one more description column than exists already (1 -> 2 the first time,
  // then 2 -> 3, 3 -> 4, ... on every later "Yes" from the Another Description Column? prompt —
  // James's ask for more than two columns). The Math.max floor only matters on that very first
  // call, from the headings stage's numLevels of 1.
  function advanceToSubItems() {
    const newNumLevels = Math.max(project.settings.numLevels + 1, 2);
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
          setAnotherColumnPrompt(true);
        },
      });
      return;
    }
    setAnotherColumnPrompt(true);
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
          setAnotherColumnPrompt(true);
        },
      });
      return;
    }
    setAnotherColumnPrompt(true);
  }

  // James's ask: this used to jump straight from headings to exactly one further column
  // (subItems) and then straight to coding — now every column's "Next Step" (headings included)
  // asks first, so the wizard supports as many description columns as the taxonomy actually
  // needs, not just two. "Yes" reveals one more column and stays on the same repeatable stage;
  // "No" moves on to coding with however many columns exist so far.
  function resolveAnotherColumn(addAnother: boolean) {
    setAnotherColumnPrompt(false);
    if (addAnother) advanceToSubItems();
    else beginCoding();
  }

  function chooseRestriction(restriction: CodeRestriction) {
    if (restriction === 'Numeric Only') {
      applyCoding(restriction, false);
      return;
    }
    setPendingRestriction(restriction);
    setCodingPrompt('mnemonic');
  }

  // Applying the coding choice sets up the base, per-row codes (James asked for real
  // auto-suggested codes here — a deliberate, scoped exception to Section 9.6, see guidance.ts
  // — pre-filled directly into ordinary, still fully-editable code cells) but deliberately
  // does NOT end the wizard: James's round-2 testing found the ancestor columns still needed
  // filling in and padding out once the base codes looked right, so the coding stage stays
  // open with Fill Codes / Pad Codes / Finish rather than closing itself immediately.
  function applyCoding(restriction: CodeRestriction, useMnemonic: boolean) {
    const level = maxLevelUsed(rows);
    const newRows = useMnemonic ? suggestMnemonicCodes(rows, level, restriction) : rows;
    onSettingsAndRowsChange({ ...project.settings, codeRestriction: restriction }, newRows);
    setCodingPrompt(null);
    setPendingRestriction(null);

    if (!useMnemonic) return;
    const bandSuggestionsFound = findAlphabetBandSuggestions(newRows, restriction);
    if (bandSuggestionsFound.length > 0) {
      setBandSuggestions(bandSuggestionsFound);
      return;
    }
    runPostSuggestChecks(newRows, level);
  }

  function runPostSuggestChecks(currentRows: TaxonomyRow[], level: number) {
    const duplicate = findDuplicateCode(currentRows, level);
    if (duplicate) {
      setDuplicateWarning(duplicate);
      return;
    }
    if (hasOutOfOrderCodes(currentRows, level)) {
      setShowOrderWarning(true);
      return;
    }
    const needManual = findRowsNeedingManualCode(currentRows);
    if (needManual.length > 0) setManualCodeWarning(needManual);
  }

  // Item 3's Y/N prompt: "Yes" swaps the flagged heading's code for the earlier, still-unused
  // alternative; "No" leaves the word-rule's own default in place. Either way, the queue moves
  // on to the next flagged heading (if any), and once it's empty the usual duplicate/order/
  // manual-code checks run against wherever the user ended up.
  function resolveBandSuggestion(accept: boolean) {
    const current = bandSuggestions[0];
    if (!current) return;
    const updatedRows = accept
      ? rows.map((r) =>
          r.id === current.rowId ? { ...r, codes: r.codes.map((c, i) => (i === 0 ? current.suggestedCode : c)) } : r,
        )
      : rows;
    if (accept) onSettingsAndRowsChange(project.settings, updatedRows);
    const remaining = bandSuggestions.slice(1);
    setBandSuggestions(remaining);
    if (remaining.length === 0) runPostSuggestChecks(updatedRows, maxLevelUsed(updatedRows));
  }

  // Item 6: dismissing the duplicate notice drops the cursor straight onto the offending cell
  // so it's ready to edit, rather than leaving the user to go hunting for it.
  function dismissDuplicateWarning() {
    if (duplicateWarning) focusCode(duplicateWarning);
    setDuplicateWarning(null);
  }

  // Round-3 feedback: same "drop the cursor there" treatment for a row the suggestion
  // algorithm couldn't find any usable letter for at all.
  function dismissManualCodeWarning() {
    if (manualCodeWarning && manualCodeWarning[0]) focusCode(manualCodeWarning[0]);
    setManualCodeWarning(null);
  }

  function focusCode(target: { rowId: string; level: number }) {
    const id = codeInputId(target.level, target.rowId);
    requestAnimationFrame(() => {
      const input = document.getElementById(id) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  // Item 2: "Sort" reorders every level's sibling groups by code, ascending, each entry
  // carrying its own children along — "Accept" leaves the codes exactly as suggested.
  function handleSortCodes() {
    onSettingsAndRowsChange(project.settings, sortAllCodesAscending(rows, maxLevelUsed(rows)));
    setShowOrderWarning(false);
  }

  // Fill Codes / Pad Codes (James's round-2 feedback): the per-row mnemonic suggestion only
  // ever set a row's own column, leaving every ancestor column blank instead of carrying the
  // parent's code down (the convention the rest of the app already relies on — Section 4.1's
  // worked example) and leaving every column deeper than a row's own level blank instead of
  // padded. Both are deliberate, separately-triggered steps — run once the base codes above
  // look right, and safe to re-run any time afterwards since both only ever touch genuinely
  // blank cells.
  function handleFillCodes() {
    onSettingsAndRowsChange(project.settings, fillCodesDown(rows));
  }

  function handlePadCodes() {
    onSettingsAndRowsChange(project.settings, padCodes(rows, project.settings.paddingChar));
  }

  function finishCoding() {
    onSettingsAndRowsChange({ ...project.settings, guidance: undefined }, rows);
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
            <strong>Step 3 — Coding.</strong> Enter or adjust the codes for each entry, then use
            Fill Codes to carry each heading's code down through its own rows, and Pad Codes to
            mark the rows that don't go any deeper — then Finish when it looks right.
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
        {stage === 'coding' && !codingPrompt && (
          <>
            <button type="button" onClick={handleFillCodes}>
              Fill Codes
            </button>
            <button type="button" onClick={handlePadCodes}>
              Pad Codes
            </button>
            <button type="button" onClick={finishCoding}>
              Finish
            </button>
          </>
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

      {anotherColumnPrompt && (
        <div className="validation-overlay">
          <div className="validation-dialog">
            <p>Another Description Column?</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => resolveAnotherColumn(false)}>
                No — Move to Coding
              </button>
              <button type="button" onClick={() => resolveAnotherColumn(true)}>
                Yes — Add Another Column
              </button>
            </div>
          </div>
        </div>
      )}

      {codingPrompt === 'restriction' && (
        <div className="validation-overlay">
          <div className="validation-dialog">
            <p>Choose the Code Restriction for this taxonomy:</p>
            <select
              value={selectedRestriction}
              onChange={(e) => setSelectedRestriction(e.target.value as CodeRestriction)}
            >
              {CODE_RESTRICTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => chooseRestriction(selectedRestriction)}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateWarning && (
        <div className="validation-overlay" onClick={dismissDuplicateWarning}>
          <div className="validation-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Duplicate First Letters. Please edit manually.</p>
            <button type="button" onClick={dismissDuplicateWarning}>
              OK
            </button>
          </div>
        </div>
      )}

      {manualCodeWarning && (
        <div className="validation-overlay" onClick={dismissManualCodeWarning}>
          <div className="validation-dialog" onClick={(e) => e.stopPropagation()}>
            <p>
              {manualCodeWarning.length === 1
                ? "One entry couldn't get an automatic code — please enter it manually."
                : `${manualCodeWarning.length} entries couldn't get an automatic code — please enter them manually.`}
            </p>
            <button type="button" onClick={dismissManualCodeWarning}>
              OK
            </button>
          </div>
        </div>
      )}

      {bandSuggestions[0] && (
        <div className="validation-overlay">
          <div className="validation-dialog">
            <p>
              This is early in the taxonomy — the default match is "{bandSuggestions[0].defaultCode}", which is
              well into the alphabet and limits mnemonic choices for the rest of the taxonomy. "
              {bandSuggestions[0].suggestedCode}" is suggested instead.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => resolveBandSuggestion(false)}>
                No — Keep "{bandSuggestions[0].defaultCode}"
              </button>
              <button type="button" onClick={() => resolveBandSuggestion(true)}>
                Yes — Use "{bandSuggestions[0].suggestedCode}"
              </button>
            </div>
          </div>
        </div>
      )}

      {showOrderWarning && (
        <div className="validation-overlay">
          <div className="validation-dialog">
            <p>Mnemonic codes are not in increasing order, sort or accept?</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowOrderWarning(false)}>
                Accept
              </button>
              <button type="button" onClick={handleSortCodes}>
                Sort
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
