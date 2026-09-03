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

interface WorkflowMenuProps {
  onChooseNew: (level: WorkflowLevel) => void;
  onChooseExisting: () => void;
  /** The title of whatever's sitting in the session autosave slot, if anything — shown as a
   * "Resume Work in Progress" option so signing out, reloading, or navigating back here never
   * strands an open taxonomy with no way back to it. */
  resumeTitle?: string | null;
  onResume?: () => void;
}

export default function WorkflowMenu({ onChooseNew, onChooseExisting, resumeTitle, onResume }: WorkflowMenuProps) {
  return (
    <section className="workflow-menu">
      <h2>What would you like to do?</h2>
      {resumeTitle && onResume && (
        <button type="button" className="workflow-resume-btn" onClick={onResume}>
          ▶ Resume Work in Progress — "{resumeTitle}"
        </button>
      )}
      <div className="workflow-menu-columns">
        <div className="workflow-menu-column">
          <h3>Create a New Taxonomy</h3>
          <p className="workflow-menu-hint">
            Step-by-step guidance tailored to each level below is coming soon — for now every
            option opens the same taxonomy setup screen.
          </p>
          <div className="workflow-level-buttons">
            <span className="workflow-level-group-heading">Cubic Business Model</span>
            {CUBIC_BUSINESS_MODEL_WORKFLOW_LEVELS.map((level) => (
              <button key={level} type="button" onClick={() => onChooseNew(level)}>
                {level}
              </button>
            ))}
            {WORKFLOW_LEVELS.filter((level) => !CUBIC_BUSINESS_MODEL_WORKFLOW_LEVELS.includes(level)).map((level) => (
              <button key={level} type="button" onClick={() => onChooseNew(level)}>
                {level}
              </button>
            ))}
          </div>
        </div>
        <div className="workflow-menu-column">
          <h3>Work on an Existing Taxonomy</h3>
          <p className="workflow-menu-hint">
            Load a saved project file, import a CSV, or open one already saved in your Library
            on the left.
          </p>
          <button type="button" className="workflow-existing-btn" onClick={onChooseExisting}>
            Work on an Existing Taxonomy
          </button>
        </div>
      </div>
    </section>
  );
}
