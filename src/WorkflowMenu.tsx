// The landing menu shown once signed in with no taxonomy open (Section 5-adjacent facilitation
// entry point): pick a starting complexity level for a new taxonomy, or go work on one that
// already exists. Every level (Simple Taxonomy aside, which has its own guided wizard) is wired
// to today's same taxonomy setup screen for now — per-level guided workflows (hiding/revealing
// columns, step-by-step prompts) are the next piece of work, tracked separately; this screen
// exists so the choice itself has a home before that logic is built, and so choosing a level in
// the meantime isn't a dead end. Division/Location/Function/Chart of Accounts are grouped under
// a plain "Cubic Business Model" label (James's ask) — that label is not itself a button.

import { CUBIC_BUSINESS_MODEL_WORKFLOW_LEVELS, WORKFLOW_LEVELS } from './types';
import type { WorkflowLevel } from './types';
import Tooltip from './Tooltip';
import type { HelpTextMap } from './helpText';

interface WorkflowMenuProps {
  onChooseNew: (level: WorkflowLevel) => void;
  onChooseExisting: () => void;
  /** The title of whatever's sitting in the session autosave slot, if anything — shown as a
   * "Resume Work in Progress" option so signing out, reloading, or navigating back here never
   * strands an open taxonomy with no way back to it. */
  resumeTitle?: string | null;
  onResume?: () => void;
  /** James's report: no way to dismiss this if it's not actually wanted (e.g. already dealt
   * with some other way) — it just sat there indefinitely. Clears the autosave slot itself,
   * not just this one render, so it stays gone rather than reappearing next visit. */
  onDismissResume?: () => void;
  /** James's ask: two more entries under "Work on an Existing Taxonomy" pointing at future,
   * separate pieces of software — GL Analyser (not built yet, this button just explains that)
   * and GL Builder (the four-CSV Cubic Business Model export James asked for now, a placeholder
   * for the eventual full software). */
  onLoadGLAnalyser: () => void;
  onOpenGLBuilder: () => void;
  onViewPricing: () => void;
  helpText: HelpTextMap;
}

// One tooltip field per fixed WORKFLOW_LEVELS entry — "workflowLevelSimpleTaxonomy",
// "workflowLevelAdvancedComplexityTaxonomy", etc.
function workflowLevelField(level: WorkflowLevel): string {
  return `workflowLevel${level.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export default function WorkflowMenu({
  onChooseNew,
  onChooseExisting,
  resumeTitle,
  onResume,
  onDismissResume,
  onLoadGLAnalyser,
  onOpenGLBuilder,
  onViewPricing,
  helpText,
}: WorkflowMenuProps) {
  return (
    <section className="workflow-menu">
      <h2>What would you like to do?</h2>
      <p className="workflow-menu-hint">
        <a href="#" onClick={(e) => { e.preventDefault(); onViewPricing(); }}>
          View Pricing
        </a>
      </p>
      {resumeTitle && onResume && (
        <div className="workflow-resume-row">
          <Tooltip field="btnResumeWorkInProgress" helpText={helpText}>
            <button type="button" className="workflow-resume-btn" onClick={onResume}>
              ▶ Resume Work in Progress — "{resumeTitle}"
            </button>
          </Tooltip>
          {onDismissResume && (
            <Tooltip field="btnDismissResume" helpText={helpText}>
              <button
                type="button"
                className="workflow-resume-dismiss"
                onClick={onDismissResume}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </Tooltip>
          )}
        </div>
      )}
      <div className="workflow-menu-columns">
        <div className="workflow-menu-column">
          <h3>Create a New Taxonomy</h3>
          <p className="workflow-menu-hint">
            Step-by-step guidance tailored to each level below is coming soon — for now every
            option opens the same taxonomy setup screen.
          </p>
          <div className="workflow-level-buttons">
            {WORKFLOW_LEVELS.map((level, index) => {
              // The heading sits directly above the first Cubic Business Model item wherever
              // that falls in WORKFLOW_LEVELS — keeps the four grouped together without this
              // component needing to know (or care) which position that group is currently in.
              const isFirstCubicLevel =
                CUBIC_BUSINESS_MODEL_WORKFLOW_LEVELS.includes(level) &&
                WORKFLOW_LEVELS.slice(0, index).every((l) => !CUBIC_BUSINESS_MODEL_WORKFLOW_LEVELS.includes(l));
              return (
                <div key={level} className="workflow-level-item">
                  {isFirstCubicLevel && <span className="workflow-level-group-heading">Cubic Business Model</span>}
                  <Tooltip field={workflowLevelField(level)} helpText={helpText}>
                    <button type="button" onClick={() => onChooseNew(level)}>
                      {level}
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
        <div className="workflow-menu-column">
          <h3>Work on an Existing Taxonomy</h3>
          <p className="workflow-menu-hint">
            Load a saved project file, import a CSV, or open one already saved in your Library
            on the left.
          </p>
          <Tooltip field="btnWorkOnExisting" helpText={helpText}>
            <button type="button" className="workflow-existing-btn" onClick={onChooseExisting}>
              Work on an Existing Taxonomy
            </button>
          </Tooltip>

          <div className="workflow-level-item">
            <h3>Load GL Analyser</h3>
            <p className="workflow-menu-hint">
              Analyse existing Trial Balance and other files to create first draft precision
              Divisions, Locations, Functions and Chart of Accounts Tables from existing data
              tables
            </p>
            <Tooltip field="btnLoadGLAnalyser" helpText={helpText}>
              <button type="button" className="workflow-existing-btn" onClick={onLoadGLAnalyser}>
                Load GL Analyser
              </button>
            </Tooltip>
          </div>

          <div className="workflow-level-item">
            <h3>GL Builder</h3>
            <p className="workflow-menu-hint">
              Build Cubic Business Model Chart of Accounts – being upgraded -- facility pending --
              contact us if interested
            </p>
            <Tooltip field="btnOpenGLBuilder" helpText={helpText}>
              <button type="button" className="workflow-existing-btn" onClick={onOpenGLBuilder}>
                GL Builder
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className="workflow-menu-books">
        <p>
          To learn more about taxonomies please read the ERP Doctor{' '}
          <a href="https://www.amazon.com/dp/B0HFXF7BZQ" target="_blank" rel="noopener noreferrer">
            "ERP Taxonomy Handbook"
          </a>{' '}
          available on Amazon (Paperback / Hardcover / Kindle).
        </p>
        <p>
          For business context please read the ERP Doctor book{' '}
          <a href="https://www.amazon.com/dp/B0HG78SGHW" target="_blank" rel="noopener noreferrer">
            "Unlocking the Full Potential of ERP"
          </a>{' '}
          available on Amazon (Paperback / Hardcover / Kindle).
        </p>
        <p>
          For broader context please read the ERP Doctor book{' '}
          <a href="https://www.amazon.com/dp/B0HFTL6LD5" target="_blank" rel="noopener noreferrer">
            "The Critical Factors for Information Technology (ERP) Investment Success"
          </a>{' '}
          available on Amazon (Paperback / Hardcover / Kindle).
        </p>
      </div>
    </section>
  );
}
