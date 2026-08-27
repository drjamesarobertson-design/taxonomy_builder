// Column colour, per CLAUDE.md Section 4.2: colour belongs to the column position,
// alternating coloured/uncoloured by level, each coloured level its own light hue.

const LEVEL_PALETTE = ['#fdf1a8', '#c3f0c8', '#f7c9dc', '#c3dff7', '#e3d3f7', '#f7ddb8'];

export function isColouredLevel(levelIndex: number): boolean {
  return levelIndex % 2 === 0;
}

export function getLevelColor(levelIndex: number): string | undefined {
  if (!isColouredLevel(levelIndex)) return undefined;
  return LEVEL_PALETTE[(levelIndex / 2) % LEVEL_PALETTE.length];
}
