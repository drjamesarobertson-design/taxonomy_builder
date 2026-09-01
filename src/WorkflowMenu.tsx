// The landing menu shown once signed in with no taxonomy open (Section 5-adjacent facilitation
// entry point): pick a starting complexity level for a new taxonomy, or go work on one that
// already exists. The six levels are all wired to today's same taxonomy setup screen for now —
// per-level guided workflows (hiding/revealing columns, step-by-step prompts) are the next
// piece of work, tracked separately; this screen exists so the choice itself has a home before
// that logic is built, and so choosing a level in the meantime isn't a dead end.

import { WORKFLOW_LEVELS } from './types';
import type { WorkflowLevel } from './types';

interface WorkflowMenuProps {
  onChooseNew: (level: WorkflowLevel) => void;
  onChooseExisting: () => void;
}

export default function WorkflowMenu({ onChooseNew, onChooseExisting }: WorkflowMenuProps) {
  return (
    <section className="workflow-menu">
      <h2>What would you like to do?</h2>
      <div className="workflow-menu-columns">
        <div className="workflow-menu-column">
          <h3>Create a New Taxonomy</h3>
          <p className="workflow-menu-hint">
            Step-by-step guidance tailored to each level below is coming soon — for now every
            option opens the same taxonomy setup screen.
          </p>
          <div className="workflow-level-buttons">
            {WORKFLOW_LEVELS.map((level) => (
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
