// Draft body formats — the parsing half of the FORMAT header in
// src/lib/draft-protocol.ts.
//
// A draft's body is always plain text the teacher can read and copy. What
// differs by format is how that text becomes a Drive file:
//
//   doc    → the text, verbatim, as a Google Doc
//   sheet  → tab-separated rows → CSV → Drive imports it as a Google Sheet
//   slides → a `# title` / `- bullet` outline → Slides API batchUpdate
//
// Everything here is a pure function on strings so the whole translation layer
// is testable without touching Google.

export const DRAFT_FORMATS = ["doc", "sheet", "slides"] as const;
export type DraftFormat = (typeof DRAFT_FORMATS)[number];

export function normalizeDraftFormat(value: unknown): DraftFormat {
  return typeof value === "string" &&
    (DRAFT_FORMATS as readonly string[]).includes(value.trim().toLowerCase())
    ? (value.trim().toLowerCase() as DraftFormat)
    : "doc";
}

// ── Sheets ───

/**
 * Tab-separated text → a rectangular grid.
 *
 * Blank lines are dropped rather than becoming empty rows: the model tends to
 * put one between the header and the body for readability, and an empty first
 * row in her spreadsheet is pure annoyance. Short rows are padded so the grid
 * is rectangular, which is what keeps a missing trailing tab from shifting a
 * column.
 */
export function parseTsv(content: string): string[][] {
  const rows = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t").map((cell) => cell.trim()));

  if (rows.length === 0) return [];

  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill("")]));
}

/**
 * A grid → RFC 4180 CSV.
 *
 * We do the quoting rather than asking the model for CSV directly, and that is
 * the whole point: her cells are full of commas ("simile, metaphor,
 * personification") and one unquoted cell silently shifts an entire row into
 * the wrong columns. Tabs are a delimiter the model won't accidentally put
 * inside a cell; commas are not.
 */
export function toCsv(rows: string[][]): string {
  const escapeCell = (cell: string) =>
    /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function tsvToCsv(content: string): string {
  return toCsv(parseTsv(content));
}

// ── Slides ───

export type SlideOutline = { title: string; bullets: string[] };

/**
 * A `# title` / `- bullet` outline → slides.
 *
 * Deliberately forgiving about what a bullet marker looks like (-, *, •) and
 * about text that appears under a heading without one, because the cost of
 * being strict is a deck that silently loses a line. Anything before the first
 * heading is ignored — that's the model narrating, not a slide.
 */
export function parseSlideOutline(content: string): SlideOutline[] {
  const slides: SlideOutline[] = [];
  let current: SlideOutline | null = null;

  for (const rawLine of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      current = { title: heading[1].trim(), bullets: [] };
      slides.push(current);
      continue;
    }

    // Text before the first heading has no slide to belong to.
    if (!current) continue;

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    current.bullets.push((bullet ? bullet[1] : line).trim());
  }

  return slides.filter((s) => s.title.length > 0 || s.bullets.length > 0);
}
