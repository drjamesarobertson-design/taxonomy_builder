import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildLibraryExportBundle,
  CUBIC_BUSINESS_MODEL_LIBRARY_CATEGORIES,
  LIBRARY_CATEGORIES,
  parseLibraryExportBundle,
} from './library';
import type { LibraryCategory, LibraryEntry, LibraryExportBundle } from './library';
import { saveExportFile } from './exportFolder';
import type { HelpTextMap } from './helpText';
import { useMenuTooltip, MenuTooltipPortal } from './menuTooltip';
import Tooltip from './Tooltip';

interface LibrarySidebarProps {
  entries: LibraryEntry[];
  helpText: HelpTextMap;
  onRename: (id: string, title: string) => void;
  onReorder: (category: LibraryCategory, orderedIds: string[]) => void;
  onMoveToWorkArea: (entry: LibraryEntry) => void;
  onRemove: (entry: LibraryEntry) => void;
  onImport: (bundle: LibraryExportBundle) => void;
  onSetStarterSample: (id: string, isStarterSample: boolean) => void;
  /** "Refresh Library" (James's ask): null while the dialog is closed; an array (possibly
   * empty) once onCheckForNewSamples has resolved, listing every starter sample this account
   * doesn't already have a copy of. */
  newSampleCandidates: LibraryEntry[] | null;
  onCheckForNewSamples: () => void;
  onImportNewSamples: (ids: string[]) => void;
  onCloseNewSamples: () => void;
}

interface ContextMenuState {
  id: string;
  x: number;
  y: number;
}

// The Library (left-hand sidebar, per James's request): every taxonomy added to it is kept
// under one of eleven fixed, flat headings, listed by title. Four of those headings — Division,
// Location, Function, Chart of Accounts (CLAUDE.md Section 9's Cubic Business Model©) — sit
// together under a shared, non-clickable "Cubic Business Model" heading (mirroring
// WorkflowMenu's own grouping of the same four) rather than each getting its own top-level
// section; every heading, grouped or not, holds a single flat list. James's report that the
// earlier single "Cubic Business Model Related" category (with a second dropdown for which of
// the four) hid the real choices is why these are flat top-level categories now, just visually
// grouped. Two independent ways to reorganise the list — drag-and-drop (within or across
// headings), and a right-click "Move to Category" / "Move Up" / "Move Down" for when dragging
// isn't convenient — plus inline title editing and a right-click "Move to Work Area" to bring an
// entry back into the grid.
export default function LibrarySidebar({
  entries,
  helpText,
  onRename,
  onReorder,
  onMoveToWorkArea,
  onRemove,
  onImport,
  onSetStarterSample,
  newSampleCandidates,
  onCheckForNewSamples,
  onImportNewSamples,
  onCloseNewSamples,
}: LibrarySidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const { tooltip: menuTooltip, showTooltip: showMenuTooltip, hideTooltip: hideMenuTooltip } = useMenuTooltip();
  useEffect(() => {
    if (!contextMenu) hideMenuTooltip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [moveCategoryTarget, setMoveCategoryTarget] = useState<LibraryEntry | null>(null);
  const [moveCategoryChoice, setMoveCategoryChoice] = useState<LibraryCategory>(LIBRARY_CATEGORIES[0]);
  // Export/Import Library (James's request — see library.ts): showExportPicker holds a
  // Select-All-by-default checklist of every entry, grouped the same way the list itself is;
  // pendingImport holds a parsed-and-validated bundle awaiting the user's confirmation before
  // anything is actually added.
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exportSelection, setExportSelection] = useState<Set<string>>(new Set());
  const [pendingImport, setPendingImport] = useState<LibraryExportBundle | null>(null);
  // Which entries (by index into pendingImport.entries) are ticked in the import checklist —
  // James's ask: let him check the contents before committing, same as Export's own picker.
  const [importSelection, setImportSelection] = useState<Set<number>>(new Set());
  // "Refresh Library": which of newSampleCandidates are ticked, same Select-All-by-default
  // convention as the other two checklists above. Reset (to select-all) every time a fresh
  // candidates list arrives, so a stale selection from a previous check never carries over.
  const [newSampleSelection, setNewSampleSelection] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (newSampleCandidates) setNewSampleSelection(new Set(newSampleCandidates.map((e) => e.id)));
  }, [newSampleCandidates]);
  // "View locked Taxonomies" (James's ask): a plain display filter, local to this component —
  // narrows every heading's list down to locked entries only, without touching what's actually
  // stored or how any other Library action works.
  const [lockedOnly, setLockedOnly] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLUListElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // James's report: right-clicking an entry near the bottom of a long Library list opened the
  // menu at the click position with no regard for whether it would actually fit, running off
  // the bottom of the screen with its lower items unreachable — same fix already applied to the
  // grid's own right-click menu (Grid.tsx), ported here. Runs before paint so it corrects the
  // position in place rather than flashing the overflowing menu first.
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const rect = el.getBoundingClientRect();
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowY > 0) {
      el.style.top = `${Math.max(8, contextMenu.y - overflowY - 8)}px`;
    }
    const overflowX = rect.right - window.innerWidth;
    if (overflowX > 0) {
      el.style.left = `${Math.max(8, contextMenu.x - overflowX - 8)}px`;
    }
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  function entriesFor(category: LibraryCategory): LibraryEntry[] {
    return entries.filter((e) => e.category === category).sort((a, b) => a.order - b.order);
  }

  function startRename(entry: LibraryEntry) {
    setRenamingId(entry.id);
    setRenameValue(entry.project.title);
    setContextMenu(null);
  }

  function commitRename() {
    if (!renamingId) return;
    const title = renameValue.trim();
    if (title) onRename(renamingId, title);
    setRenamingId(null);
  }

  function handleDrop(category: LibraryCategory, index: number) {
    if (!draggedId) return;
    const currentInScope = entriesFor(category)
      .filter((e) => e.id !== draggedId)
      .map((e) => e.id);
    const insertAt = Math.min(index, currentInScope.length);
    const newOrder = [...currentInScope.slice(0, insertAt), draggedId, ...currentInScope.slice(insertAt)];
    onReorder(category, newOrder);
    setDraggedId(null);
    setDragOverKey(null);
  }

  // Right-click "Move Up" / "Move Down" — swaps an entry with its neighbour within the same
  // heading, a non-drag alternative to reordering by hand.
  function moveWithinCategory(entry: LibraryEntry, direction: 'up' | 'down') {
    const list = entriesFor(entry.category);
    const idx = list.findIndex((e) => e.id === entry.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
    const ids = list.map((e) => e.id);
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    onReorder(entry.category, ids);
    setContextMenu(null);
  }

  function startMoveToCategory(entry: LibraryEntry) {
    setMoveCategoryTarget(entry);
    setMoveCategoryChoice(entry.category);
    setContextMenu(null);
  }

  // Right-click "Move to Category" — a non-drag alternative to dragging an entry across
  // headings; lands at the end of the chosen heading's list.
  function confirmMoveToCategory() {
    if (!moveCategoryTarget) return;
    const targetIds = entriesFor(moveCategoryChoice)
      .filter((e) => e.id !== moveCategoryTarget.id)
      .map((e) => e.id);
    onReorder(moveCategoryChoice, [...targetIds, moveCategoryTarget.id]);
    setMoveCategoryTarget(null);
  }

  function openExportPicker() {
    setExportSelection(new Set(entries.map((e) => e.id)));
    setShowExportPicker(true);
  }

  function toggleExportSelection(id: string) {
    setExportSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Same native "Save As" dialog (remembering wherever the last Save/Export actually went) as
  // every other Save/Export action in the app — James's report that Export always dropped
  // straight into Downloads with no chance to pick a folder or edit the filename first.
  async function confirmExport() {
    const selected = entries.filter((e) => exportSelection.has(e.id));
    const bundle = buildLibraryExportBundle(selected);
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    const { cancelled } = await saveExportFile(blob, `taxonomy-library-export-${date}.json`);
    if (!cancelled) setShowExportPicker(false);
  }

  function handleImportFileChosen(file: File) {
    file
      .text()
      .then((text) => {
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('Could not parse this file as JSON.');
        }
        const bundle = parseLibraryExportBundle(data);
        setPendingImport(bundle);
        setImportSelection(new Set(bundle.entries.map((_, i) => i)));
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : 'Could not read this file as a Library export.');
      });
  }

  function toggleImportSelection(index: number) {
    setImportSelection((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function confirmImport() {
    if (!pendingImport) return;
    const entries = pendingImport.entries.filter((_, i) => importSelection.has(i));
    onImport({ ...pendingImport, entries });
    setPendingImport(null);
  }

  function toggleNewSampleSelection(id: string) {
    setNewSampleSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmImportNewSamples() {
    onImportNewSamples([...newSampleSelection]);
  }

  if (collapsed) {
    return (
      <div className="library-sidebar library-sidebar-collapsed">
        <Tooltip field="btnLibShowToggle" helpText={helpText}>
          <button type="button" className="library-collapse-toggle" onClick={() => setCollapsed(false)}>
            ▶ Library
          </button>
        </Tooltip>
      </div>
    );
  }

  // Shared entry-list rendering for one category — used for every heading, grouped or not.
  function renderEntryList(category: LibraryCategory) {
    const scopeEntries = entriesFor(category);
    // "View locked Taxonomies" only narrows what's shown — index still comes from scopeEntries
    // (the real, full list) so drag-and-drop reordering (which reads/writes that same real
    // list) keeps working correctly even while some entries are hidden from view.
    const visibleEntries = lockedOnly ? scopeEntries.filter((e) => e.project.settings.locked) : scopeEntries;
    return (
      <ul className="library-entry-list">
        {visibleEntries.map((entry) => {
          const index = scopeEntries.findIndex((e) => e.id === entry.id);
          return (
          <li
            key={entry.id}
            draggable={renamingId !== entry.id}
            className={[
              'library-entry',
              selectedId === entry.id ? 'library-entry-selected' : '',
              dragOverKey === `${category}:${index}` ? 'library-dragover' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setSelectedId(entry.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setSelectedId(entry.id);
              setContextMenu({ id: entry.id, x: e.clientX, y: e.clientY });
            }}
            onDragStart={(e) => {
              setDraggedId(entry.id);
              // Some browsers (Firefox in particular) refuse to complete a drag — no
              // drop event fires anywhere — unless dataTransfer actually carries data;
              // relying on React state (draggedId) alone isn't enough on its own.
              e.dataTransfer.setData('text/plain', entry.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverKey(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverKey(`${category}:${index}`);
            }}
            onDragLeave={() => setDragOverKey(null)}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(category, index);
            }}
            onDoubleClick={() => startRename(entry)}
            title={entry.project.title}
          >
            <span
              className="library-lock-icon"
              title={entry.project.settings.locked ? 'Locked — protected rows can no longer be edited' : 'Unlocked'}
            >
              {entry.project.settings.locked ? '🔒' : '🔓'}
            </span>
            {renamingId === entry.id ? (
              <input
                ref={renameInputRef}
                className="library-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
              />
            ) : (
              <span className="library-entry-title">{entry.project.title || '(untitled)'}</span>
            )}
            {entry.isStarterSample && (
              <span className="library-starter-sample-icon" title="Starter Sample — copied into every new subscriber's own Library">
                ⭐
              </span>
            )}
          </li>
          );
        })}
      </ul>
    );
  }

  // The context menu and every dialog below are portaled straight to document.body: nested
  // inside .library-sidebar (position: sticky — which, like position: fixed, always starts a
  // new stacking context) they'd be trapped in that context, so however high their own z-index
  // goes, .app-header's z-index:50 (a sibling context outside the sidebar entirely) could still
  // paint over them — exactly what caused James's Export/Import checklist to be unclickable
  // behind the header on a short window. Portaling avoids the whole ancestor-stacking-context
  // problem rather than chasing z-index numbers.
  return (
    <>
    <div className="library-sidebar">
      <div className="library-header">
        <h2>Library</h2>
        <Tooltip field="btnLibHideToggle" helpText={helpText}>
          <button type="button" className="library-collapse-toggle" onClick={() => setCollapsed(true)}>
            ◀
          </button>
        </Tooltip>
      </div>
      <div className="library-transfer-buttons">
        <Tooltip field="btnLibExport" helpText={helpText}>
          <button
            type="button"
            className="library-transfer-button"
            onClick={openExportPicker}
            disabled={entries.length === 0}
          >
            Export…
          </button>
        </Tooltip>
        <Tooltip field="btnLibImport" helpText={helpText}>
          <button
            type="button"
            className="library-transfer-button"
            onClick={() => importFileInputRef.current?.click()}
          >
            Import…
          </button>
        </Tooltip>
        <Tooltip field="btnLibCheckNewSamples" helpText={helpText}>
          <button type="button" className="library-transfer-button" onClick={onCheckForNewSamples}>
            Check for New Samples
          </button>
        </Tooltip>
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json,.json"
          className="library-import-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFileChosen(file);
            e.target.value = '';
          }}
        />
      </div>
      <label className="library-locked-only-toggle" title="Show only taxonomies that have been Locked">
        <input type="checkbox" checked={lockedOnly} onChange={(e) => setLockedOnly(e.target.checked)} />
        View locked Taxonomies
      </label>
      {entries.length === 0 && <p className="library-empty">No taxonomies saved yet.</p>}
      {entries.length > 0 && lockedOnly && !entries.some((e) => e.project.settings.locked) && (
        <p className="library-empty">No locked taxonomies in the Library yet.</p>
      )}
      {LIBRARY_CATEGORIES.map((category, index) => {
        // The heading sits directly above the first Cubic Business Model category wherever
        // that falls in LIBRARY_CATEGORIES — same grouping approach as WorkflowMenu's own
        // "Cubic Business Model" heading, just for this list.
        const isFirstCubicCategory =
          CUBIC_BUSINESS_MODEL_LIBRARY_CATEGORIES.includes(category) &&
          LIBRARY_CATEGORIES.slice(0, index).every((c) => !CUBIC_BUSINESS_MODEL_LIBRARY_CATEGORIES.includes(c));
        const categoryEntries = entriesFor(category);
        return (
          <div key={category} className="library-category">
            {isFirstCubicCategory && <h3 className="library-category-group-heading">Cubic Business Model</h3>}
            <h3
              className={`library-category-heading${dragOverKey === `${category}:end` ? ' library-dragover' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverKey(`${category}:end`);
              }}
              onDragLeave={() => setDragOverKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(category, categoryEntries.length);
              }}
            >
              {category}
            </h3>
            {renderEntryList(category)}
          </div>
        );
      })}
    </div>

    {contextMenu &&
      createPortal(
        (() => {
          const entry = entries.find((e) => e.id === contextMenu.id);
          if (!entry) return null;
          const list = entriesFor(entry.category);
          const idx = list.findIndex((e) => e.id === entry.id);
          const isFirst = idx <= 0;
          const isLast = idx === -1 || idx >= list.length - 1;
          return (
            <ul
              ref={contextMenuRef}
              className="context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <li
                onClick={() => {
                  setContextMenu(null);
                  onMoveToWorkArea(entry);
                }}
                onMouseEnter={showMenuTooltip('libMenuMoveToWorkArea')}
                onMouseLeave={hideMenuTooltip}
              >
                Move to Work Area
              </li>
              <li onClick={() => startRename(entry)} onMouseEnter={showMenuTooltip('libMenuEditTitle')} onMouseLeave={hideMenuTooltip}>
                Edit Title
              </li>
              <li
                className={isFirst ? 'context-menu-disabled' : undefined}
                onClick={() => !isFirst && moveWithinCategory(entry, 'up')}
                onMouseEnter={showMenuTooltip('libMenuMoveUp')}
                onMouseLeave={hideMenuTooltip}
              >
                Move Up
              </li>
              <li
                className={isLast ? 'context-menu-disabled' : undefined}
                onClick={() => !isLast && moveWithinCategory(entry, 'down')}
                onMouseEnter={showMenuTooltip('libMenuMoveDown')}
                onMouseLeave={hideMenuTooltip}
              >
                Move Down
              </li>
              <li
                onClick={() => startMoveToCategory(entry)}
                onMouseEnter={showMenuTooltip('libMenuMoveToCategory')}
                onMouseLeave={hideMenuTooltip}
              >
                Move to Category…
              </li>
              <li
                className="context-menu-separator"
                onClick={() => {
                  setContextMenu(null);
                  onSetStarterSample(entry.id, !entry.isStarterSample);
                }}
                onMouseEnter={showMenuTooltip('libMenuStarterSample')}
                onMouseLeave={hideMenuTooltip}
              >
                {entry.isStarterSample ? 'Remove Starter Sample' : 'Mark as Starter Sample'}
              </li>
              <li onClick={() => onRemove(entry)} onMouseEnter={showMenuTooltip('libMenuRemove')} onMouseLeave={hideMenuTooltip}>
                Remove from Library
              </li>
            </ul>
          );
        })(),
        document.body,
      )}
      <MenuTooltipPortal tooltip={menuTooltip} helpText={helpText} />

    {moveCategoryTarget &&
      createPortal(
        <div className="validation-overlay" onClick={() => setMoveCategoryTarget(null)}>
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Move "{moveCategoryTarget.project.title || '(untitled)'}" to which heading?</p>
            <select
              className="library-category-select"
              value={moveCategoryChoice}
              onChange={(e) => setMoveCategoryChoice(e.target.value as LibraryCategory)}
            >
              {LIBRARY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setMoveCategoryTarget(null)}>
                Cancel
              </button>
              <Tooltip field="btnLibMoveToCategoryConfirm" helpText={helpText}>
                <button type="button" onClick={confirmMoveToCategory}>
                  Move
                </button>
              </Tooltip>
            </div>
          </div>
        </div>,
        document.body,
      )}

    {showExportPicker &&
      createPortal(
        <div className="validation-overlay" onClick={() => setShowExportPicker(false)}>
          <div className="validation-dialog library-export-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Choose which taxonomies to include in the export file:</p>
            <div className="library-export-select-all">
              <button type="button" onClick={() => setExportSelection(new Set(entries.map((e) => e.id)))}>
                Select All
              </button>
              <button type="button" onClick={() => setExportSelection(new Set())}>
                Select None
              </button>
            </div>
            <div className="library-export-checklist">
              {LIBRARY_CATEGORIES.filter((category) => entriesFor(category).length > 0).map((category) => (
                <div key={category} className="library-export-checklist-group">
                  <h4>{category}</h4>
                  {entriesFor(category).map((entry) => (
                    <label key={entry.id} className="library-export-checklist-item">
                      <input
                        type="checkbox"
                        checked={exportSelection.has(entry.id)}
                        onChange={() => toggleExportSelection(entry.id)}
                      />
                      {entry.project.title || '(untitled)'}
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setShowExportPicker(false)}>
                Cancel
              </button>
              <Tooltip field="btnLibExportConfirm" helpText={helpText}>
                <button type="button" disabled={exportSelection.size === 0} onClick={confirmExport}>
                  Export {exportSelection.size} {exportSelection.size === 1 ? 'Taxonomy' : 'Taxonomies'}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>,
        document.body,
      )}

    {pendingImport &&
      createPortal(
        (() => {
          const byCategory = new Map<LibraryCategory, number[]>();
          pendingImport.entries.forEach((e, i) => {
            const list = byCategory.get(e.category) ?? [];
            list.push(i);
            byCategory.set(e.category, list);
          });
          return (
            <div className="validation-overlay" onClick={() => setPendingImport(null)}>
              <div className="validation-dialog library-export-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
                <p>
                  Choose which taxonomies to import. Each one is added as a new entry alongside what's already in your
                  Library — nothing existing is overwritten.
                </p>
                <div className="library-export-select-all">
                  <button
                    type="button"
                    onClick={() => setImportSelection(new Set(pendingImport.entries.map((_, i) => i)))}
                  >
                    Select All
                  </button>
                  <button type="button" onClick={() => setImportSelection(new Set())}>
                    Select None
                  </button>
                </div>
                <div className="library-export-checklist">
                  {LIBRARY_CATEGORIES.filter((category) => (byCategory.get(category)?.length ?? 0) > 0).map(
                    (category) => (
                      <div key={category} className="library-export-checklist-group">
                        <h4>{category}</h4>
                        {byCategory.get(category)!.map((i) => (
                          <label key={i} className="library-export-checklist-item">
                            <input
                              type="checkbox"
                              checked={importSelection.has(i)}
                              onChange={() => toggleImportSelection(i)}
                            />
                            {pendingImport.entries[i].project.title || '(untitled)'}
                          </label>
                        ))}
                      </div>
                    ),
                  )}
                </div>
                <div className="confirm-dialog-actions">
                  <button type="button" onClick={() => setPendingImport(null)}>
                    Cancel
                  </button>
                  <Tooltip field="btnLibImportConfirm" helpText={helpText}>
                    <button type="button" disabled={importSelection.size === 0} onClick={confirmImport}>
                      Import {importSelection.size} {importSelection.size === 1 ? 'Taxonomy' : 'Taxonomies'}
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })(),
        document.body,
      )}

    {newSampleCandidates &&
      createPortal(
        (() => {
          const byCategory = new Map<LibraryCategory, LibraryEntry[]>();
          newSampleCandidates.forEach((e) => {
            const list = byCategory.get(e.category) ?? [];
            list.push(e);
            byCategory.set(e.category, list);
          });
          return (
            <div className="validation-overlay" onClick={onCloseNewSamples}>
              <div className="validation-dialog library-export-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
                {newSampleCandidates.length === 0 ? (
                  <p>No new starter samples right now — you already have every one that's been marked.</p>
                ) : (
                  <>
                    <p>New starter sample taxonomies are available. Choose which to add to your Library:</p>
                    <div className="library-export-select-all">
                      <button
                        type="button"
                        onClick={() => setNewSampleSelection(new Set(newSampleCandidates.map((e) => e.id)))}
                      >
                        Select All
                      </button>
                      <button type="button" onClick={() => setNewSampleSelection(new Set())}>
                        Select None
                      </button>
                    </div>
                    <div className="library-export-checklist">
                      {LIBRARY_CATEGORIES.filter((category) => (byCategory.get(category)?.length ?? 0) > 0).map(
                        (category) => (
                          <div key={category} className="library-export-checklist-group">
                            <h4>{category}</h4>
                            {byCategory.get(category)!.map((entry) => (
                              <label key={entry.id} className="library-export-checklist-item library-new-sample-item">
                                <input
                                  type="checkbox"
                                  checked={newSampleSelection.has(entry.id)}
                                  onChange={() => toggleNewSampleSelection(entry.id)}
                                />
                                <span>
                                  <span className="library-new-sample-title">{entry.project.title || '(untitled)'}</span>
                                  {entry.project.purpose && (
                                    <span className="library-new-sample-purpose"> — {entry.project.purpose}</span>
                                  )}
                                </span>
                              </label>
                            ))}
                          </div>
                        ),
                      )}
                    </div>
                  </>
                )}
                <div className="confirm-dialog-actions">
                  <button type="button" onClick={onCloseNewSamples}>
                    {newSampleCandidates.length === 0 ? 'Close' : 'Cancel'}
                  </button>
                  {newSampleCandidates.length > 0 && (
                    <Tooltip field="btnLibAddNewSamplesConfirm" helpText={helpText}>
                      <button type="button" disabled={newSampleSelection.size === 0} onClick={confirmImportNewSamples}>
                        Add {newSampleSelection.size} {newSampleSelection.size === 1 ? 'Sample' : 'Samples'}
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          );
        })(),
        document.body,
      )}
    </>
  );
}
