// A small, growing library of standalone reference documents (rules, investigations, worked
// examples) that don't fit the short, per-field wording of help-text.csv — each one lives as its
// own static HTML file under public/reference-docs/ and is just linked to from here, opened in a
// new tab, rather than rendered inline. Adding a future document is just appending an entry below
// plus dropping its file in that folder.
export interface ReferenceDocument {
  title: string;
  description: string;
  fileName: string;
}

export const REFERENCE_DOCUMENTS: ReferenceDocument[] = [
  {
    title: 'Two-Digit Code Levels and Precision Taxonomies',
    description:
      'Why Taxonomy Builder keeps to one character per code level rather than allowing two-digit ' +
      '(or wider) codes, with a worked example and the rule this led to.',
    fileName: 'two-digit-code-levels-and-precision-taxonomies.html',
  },
];
