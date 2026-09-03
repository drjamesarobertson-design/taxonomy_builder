import { useEffect, useRef, useState } from 'react';
import { CUBIC_BUSINESS_MODEL_CATEGORY, CUBIC_BUSINESS_MODEL_SUBCATEGORIES, LIBRARY_CATEGORIES } from './library';
import type { CubicBusinessModelSubcategory, LibraryCategory, LibraryEntry } from './library';

interface LibrarySidebarProps {
  entries: LibraryEntry[];
  onRename: (id: string, title: string) => void;
  onReorder: (category: LibraryCategory, orderedIds: string[], subcategory?: CubicBusinessModelSubcategory) => void;
  onMoveToWorkArea: (entry: LibraryEntry) => void;
  onRemove: (entry: LibraryEntry) => void;
}

interface ContextMenuState {
  id: string;
  x: number;
  y: number;
}

// The Library (left-hand sidebar, per James's request): every taxonomy added to it is kept
// under one of eight fixed headings, listed by title. One of those headings — Cubic Business
// Model Related (CLAUDE.md Section 9's Cubic Business Model©) — is itself broken into four
// fixed sub-headings (DIVISIONS/LOCATIONS/FUNCTIONS/GL ACCOUNTS) rather than holding a single
// flat list; every other heading stays flat, exactly as before. Two independent ways to
// reorganise it — drag-and-drop (within or across headings/sub-headings), and a right-click
// "Move to Category" / "Move Up" / "Move Down" for when dragging isn't convenient — plus inline
// title editing and a right-click "Move to Work Area" to bring an entry back into the grid.
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
  const [moveSubcategoryChoice, setMoveSubcategoryChoice] = useState<CubicBusinessModelSubcategory>(
    CUBIC_BUSINESS_MODEL_SUBCATEGORIES[0],
  );
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  // The grouping scope an entry belongs to: category alone for seven of the eight headings,
  // category+subcategory for Cubic Business Model Related. Passing `subcategory: undefined`
  // for every other category keeps this a single, uniform comparison everywhere below.
  function entriesFor(category: LibraryCategory, subcategory?: CubicBusinessModelSubcategory): LibraryEntry[] {
    return entries.filter((e) => e.category === category && e.subcategory === subcategory).sort((a, b) => a.order - b.order);
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

  function handleDrop(category: LibraryCategory, index: number, subcategory?: CubicBusinessModelSubcategory) {
    if (!draggedId) return;
    const currentInScope = entriesFor(category, subcategory)
      .filter((e) => e.id !== draggedId)
      .map((e) => e.id);
    const insertAt = Math.min(index, currentInScope.length);
    const newOrder = [...currentInScope.slice(0, insertAt), draggedId, ...currentInScope.slice(insertAt)];
    onReorder(category, newOrder, subcategory);
    setDraggedId(null);
    setDragOverKey(null);
  }

  // Right-click "Move Up" / "Move Down" — swaps an entry with its neighbour within the same
  // heading (and, where it applies, the same sub-heading), a non-drag alternative to
  // reordering by hand.
  function moveWithinCategory(entry: LibraryEntry, direction: 'up' | 'down') {
    const list = entriesFor(entry.category, entry.subcategory);
    const idx = list.findIndex((e) => e.id === entry.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
    const ids = list.map((e) => e.id);
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    onReorder(entry.category, ids, entry.subcategory);
    setContextMenu(null);
  }

  function startMoveToCategory(entry: LibraryEntry) {
    setMoveCategoryTarget(entry);
    setMoveCategoryChoice(entry.category);
    setMoveSubcategoryChoice(entry.subcategory ?? CUBIC_BUSINESS_MODEL_SUBCATEGORIES[0]);
    setContextMenu(null);
  }

  // Right-click "Move to Category" — a non-drag alternative to dragging an entry across
  // headings; lands at the end of the chosen heading's (or sub-heading's) list.
  function confirmMoveToCategory() {
    if (!moveCategoryTarget) return;
    const subcategory = moveCategoryChoice === CUBIC_BUSINESS_MODEL_CATEGORY ? moveSubcategoryChoice : undefined;
    const targetIds = entriesFor(moveCategoryChoice, subcategory)
      .filter((e) => e.id !== moveCategoryTarget.id)
      .map((e) => e.id);
    onReorder(moveCategoryChoice, [...targetIds, moveCategoryTarget.id], subcategory);
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

  // Shared entry-list rendering for one (category, subcategory) scope — used both for a plain
  // flat heading and for one of Cubic Business Model Related's four sub-headings.
  function renderEntryList(category: LibraryCategory, subcategory: CubicBusinessModelSubcategory | undefined, scopeKey: string) {
    const scopeEntries = entriesFor(category, subcategory);
    return (
      <ul className="library-entry-list">
        {scopeEntries.map((entry, index) => (
          <li
            key={entry.id}
            draggable={renamingId !== entry.id}
            className={[
              'library-entry',
              selectedId === entry.id ? 'library-entry-selected' : '',
              dragOverKey === `${scopeKey}:${index}` ? 'library-dragover' : '',
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
              setDragOverKey(`${scopeKey}:${index}`);
            }}
            onDragLeave={() => setDragOverKey(null)}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(category, index, subcategory);
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
      {LIBRARY_CATEGORIES.map((category) => {
        if (category === CUBIC_BUSINESS_MODEL_CATEGORY) {
          return (
            <div key={category} className="library-category">
              <h3 className="library-category-heading library-category-heading-static">{category}</h3>
              {CUBIC_BUSINESS_MODEL_SUBCATEGORIES.map((subcategory) => {
                const scopeKey = `${category}:${subcategory}`;
                return (
                  <div key={subcategory} className="library-subcategory">
                    <h4
                      className={`library-subcategory-heading${dragOverKey === `${scopeKey}:end` ? ' library-dragover' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverKey(`${scopeKey}:end`);
                      }}
                      onDragLeave={() => setDragOverKey(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(category, entriesFor(category, subcategory).length, subcategory);
                      }}
                    >
                      {subcategory}
                    </h4>
                    {renderEntryList(category, subcategory, scopeKey)}
                  </div>
                );
              })}
            </div>
          );
        }
        const categoryEntries = entriesFor(category);
        return (
          <div key={category} className="library-category">
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
            {renderEntryList(category, undefined, category)}
          </div>
        );
      })}

      {contextMenu &&
        (() => {
          const entry = entries.find((e) => e.id === contextMenu.id);
          if (!entry) return null;
          const list = entriesFor(entry.category, entry.subcategory);
          const idx = list.findIndex((e) => e.id === entry.id);
          const isFirst = idx <= 0;
          const isLast = idx === -1 || idx >= list.length - 1;
          return (
            <ul className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
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
            {moveCategoryChoice === CUBIC_BUSINESS_MODEL_CATEGORY && (
              <select
                className="library-category-select"
                value={moveSubcategoryChoice}
                onChange={(e) => setMoveSubcategoryChoice(e.target.value as CubicBusinessModelSubcategory)}
              >
                {CUBIC_BUSINESS_MODEL_SUBCATEGORIES.map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
            )}
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
