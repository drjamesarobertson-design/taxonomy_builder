// Field-level help text, loaded from a plain CSV file at runtime (public/help-text.csv) rather
// than bundled into the app's code. That file is meant to be edited directly — in Excel, or any
// text editor — and pushed to the repo; the next deploy picks it up with no code change and no
// rebuild step beyond the site's own normal GitHub Pages deploy.
//
// James's ask: extend this same one file to also drive a hover tooltip on every toolbar button
// and right-click menu item (Tooltip.tsx), and a searchable, professional-looking Help page
// (HelpPage.tsx) — both reuse this exact data rather than each maintaining their own copy, so
// James only ever writes a given field's text once. Four columns now instead of three: Field,
// Label (short name shown in the Help page's list and as its section heading), HelpText (the
// same explanatory text HelpIcon already showed), and VideoUrl (optional — a YouTube link shown
// as a "Watch video" link wherever that field's help appears, blank for most rows).

export interface HelpEntry {
  label: string;
  helpText: string;
  videoUrl?: string;
}

export type HelpTextMap = Record<string, HelpEntry>;

// A minimal RFC 4180 CSV parser: handles quoted fields (so a field's own text can contain
// commas or newlines) and "" as an escaped quote inside a quoted field. Only what this one
// four-column file actually needs — not a general-purpose CSV library.
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

/** Fetches and parses public/help-text.csv into a Field → {label, helpText, videoUrl} lookup.
 * Never throws — a missing or malformed file just means no help text is available yet, not a
 * broken app. VideoUrl is entirely optional: a file saved without that column (or with a blank
 * cell) just means no field has a video link yet, not an error. */
export async function loadHelpText(): Promise<HelpTextMap> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}help-text.csv`);
    if (!res.ok) return {};
    const rows = parseCsv(await res.text());
    if (rows.length === 0) return {};
    const [header, ...body] = rows;
    const fieldCol = header.indexOf('Field');
    const labelCol = header.indexOf('Label');
    const helpCol = header.indexOf('HelpText');
    const videoCol = header.indexOf('VideoUrl');
    if (fieldCol === -1 || helpCol === -1) return {};
    const map: HelpTextMap = {};
    for (const cols of body) {
      const key = cols[fieldCol]?.trim();
      if (!key) continue;
      const videoUrl = videoCol !== -1 ? cols[videoCol]?.trim() : '';
      map[key] = {
        label: (labelCol !== -1 ? cols[labelCol] : '')?.trim() || key,
        helpText: cols[helpCol] ?? '',
        videoUrl: videoUrl ? videoUrl : undefined,
      };
    }
    return map;
  } catch {
    return {};
  }
}
