# Taxonomy Builder

A browser-based facilitation tool for building structured hierarchical taxonomies. See `CLAUDE.md` for the full project specification and `Taxonomy_Builder_Build_Sequence.md` for the staged build plan.

## Status

**Stage 1 — Foundation and Data Model** is implemented:

- Core grid with single-character code columns, a fixed delimiter column, and matching description columns (default 8 levels, per Section 4.1).
- Type a single character into any code cell, free text into any description cell.
- Create a new taxonomy (title, table name, purpose, maximum description length).
- Save the whole taxonomy to a local JSON project file, and load it back.

Not yet built (later stages): colour coding, case toggling, promote/demote, sorting, insert/delete row, validation warnings, undo, comments, export.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build
npm run lint     # lint
```
