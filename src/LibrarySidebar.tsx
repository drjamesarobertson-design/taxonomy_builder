import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CUBIC_BUSINESS_MODEL_LIBRARY_CATEGORIES, LIBRARY_CATEGORIES } from './library';
import type { LibraryCategory, LibraryEntry } from './library';

interface LibrarySidebarProps {
  entries: LibraryEntry[];
  onRename: (id: string, title: string) => void;
  onReorder: (category: LibraryCategory, orderedIds: string[]) => void;
  onMoveToWorkArea: (entry: LibraryEntry) => void;
  onRemove: (entry: LibraryEntry) => void;
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
export default function LibrarySidebar({ entries, onRename, onReorder, onMoveToWorkArea, onRemove }: LibrarySidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [moveCategoryTarget, setMoveCategoryTarget] = useState<LibraryEntry | null>(null);
  const [moveCategoryChoice, setMoveCategoryChoice] = useState<LibraryCategory>(LIBRARY_CATEGORIES[0]);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLUListElement>(null);

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

  if (collapsed) {
    return (
      <div className="library-sidebar library-sidebar-collapsed">
        <button type="button" className="library-collapse-toggle" onClick={() => setCollapsed(false)} title="Show Library">
          ▶ Library
        </button>
      </div>
    );
  }

  // Shared entry-list rendering for one category — used for every heading, grouped or not.
  function renderEntryList(category: LibraryCategory) {
    const scopeEntries = entriesFor(category);
    return (
      <ul className="library-entry-list">
        {scopeEntries.map((entry, index) => (
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
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="library-sidebar">
      <div className="library-header">
        <h2>Library</h2>
        <button type="button" className="library-collapse-toggle" onClick={() => setCollapsed(true)} title="Hide Library">
          ◀
        </button>
      </div>
      {entries.length === 0 && <p className="library-empty">No taxonomies saved yet.</p>}
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

      {contextMenu &&
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
              >
                Move to Work Area
              </li>
              <li onClick={() => startRename(entry)}>Edit Title</li>
              <li
                className={isFirst ? 'context-menu-disabled' : undefined}
                onClick={() => !isFirst && moveWithinCategory(entry, 'up')}
              >
                Move Up
              </li>
              <li
                className={isLast ? 'context-menu-disabled' : undefined}
                onClick={() => !isLast && moveWithinCategory(entry, 'down')}
              >
                Move Down
              </li>
              <li onClick={() => startMoveToCategory(entry)}>Move to Category…</li>
              <li className="context-menu-separator" onClick={() => onRemove(entry)}>
                Remove from Library
              </li>
            </ul>
          );
        })()}

      {moveCategoryTarget && (
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
              <button type="button" onClick={confirmMoveToCategory}>
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
