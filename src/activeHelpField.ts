// Tracks which help-text field (helpText.ts's keys) is currently hovered/focused, across every
// Tooltip and right-click-menu tooltip instance in the app -- read by the F1 "edit this tooltip"
// shortcut (App.tsx), which has no other way to know which of the many separate Tooltip/
// menuTooltip instances scattered across the app is the one currently showing. A plain
// module-level value rather than React state or context: nothing needs to re-render when this
// changes, it's only ever read once, at the moment F1 is actually pressed.
let activeField: string | null = null;

export function setActiveHelpField(field: string | null): void {
  activeField = field;
}

export function getActiveHelpField(): string | null {
  return activeField;
}
