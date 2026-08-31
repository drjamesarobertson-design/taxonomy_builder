// Field-level help text, loaded from a plain CSV file at runtime (public/help-text.csv) rather
// than bundled into the app's code. That file is meant to be edited directly — in Excel, or any
// text editor — and pushed to the repo; the next deploy picks it up with no code change and no
// rebuild step beyond the site's own normal GitHub Pages deploy.

export type HelpTextMap = Record<string, string>;

// A minimal RFC 4180 CSV parser: handles quoted fields (so a field's own text can contain
// commas or newlines) and "" as an escaped quote inside a quoted field. Only what this one
// three-column file actually needs — not a general-purpose CSV library.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Fetches and parses public/help-text.csv into a Field → HelpText lookup. Never throws — a
 * missing or malformed file just means no help text is available yet, not a broken app. */
export async function loadHelpText(): Promise<HelpTextMap> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}help-text.csv`);
    if (!res.ok) return {};
    const rows = parseCsv(await res.text());
    if (rows.length === 0) return {};
    const [header, ...body] = rows;
    const fieldCol = header.indexOf('Field');
    const helpCol = header.indexOf('HelpText');
    if (fieldCol === -1 || helpCol === -1) return {};
    const map: HelpTextMap = {};
    for (const cols of body) {
      const key = cols[fieldCol]?.trim();
      if (key) map[key] = cols[helpCol] ?? '';
    }
    return map;
  } catch {
    return {};
  }
}
