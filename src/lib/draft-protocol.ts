// Draft protocol — shared between the copilot API route (which instructs the
// model to emit draft blocks) and the copilot UI (which parses them into
// DraftCard components with copy / Accept & Create actions).
//
// A draft block is a fenced code block with language `draft`:
//
//   ```draft
//   TITLE: Animal Farm Ch. 1–4 Quiz
//   TYPE: assessment
//   GRADE: 8
//   QUARTER: Q1
//   UNIT: Animal Farm
//   LESSON: Animal Farm: Ch. 1–4
//   ---
//   <plain-text deliverable>
//   ```
//
// TITLE and the `---` separator are required; everything else is optional.
// The block is only ever a PROPOSAL — nothing touches the teacher's Drive
// until she explicitly clicks Accept & Create (see
// /api/copilot/accept-draft). Revisions are new drafts (new versions), never
// in-place edits of an existing file.

import { MATERIAL_TYPES, type MaterialType } from "@/lib/upload-utils";
import { normalizeDraftFormat, type DraftFormat } from "@/lib/draft-formats";
import { parseSpec, type DraftSpec } from "@/lib/draft-spec";

export type ParsedDraft = {
  title: string;
  materialType: MaterialType;
  /** Which kind of Drive file Accept & Create makes. Defaults to "doc". */
  format: DraftFormat;
  grade: number | null;
  quarter: string | null;
  unitTitle: string | null;
  lessonTitle: string | null;
  content: string;
  /** Set when the draft came from a tool call and carries full styling. */
  spec: DraftSpec | null;
};

const VALID_QUARTERS = ["Summer", "Q1", "Q2", "Q3", "Q4"] as const;

export function normalizeMaterialType(value: unknown): MaterialType {
  return typeof value === "string" &&
    (MATERIAL_TYPES as readonly string[]).includes(value.toLowerCase())
    ? (value.toLowerCase() as MaterialType)
    : "other";
}

export function normalizeQuarter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = VALID_QUARTERS.find(
    (q) => q.toLowerCase() === value.trim().toLowerCase()
  );
  return match ?? null;
}

/**
 * Parse the inside of a ```draft fenced block. Returns null when the text
 * doesn't contain a complete header (TITLE + `---` separator) — e.g. while
 * the block is still streaming in.
 */
export function parseDraftBlock(raw: string): ParsedDraft | null {
  const sepIndex = raw.search(/^\s*---\s*$/m);
  if (sepIndex === -1) return null;

  const sepMatch = raw.slice(sepIndex).match(/^\s*---\s*$/m);
  const headerText = raw.slice(0, sepIndex);
  const content = raw
    .slice(sepIndex + (sepMatch ? sepMatch[0].length : 3))
    .replace(/^\r?\n/, "")
    .trimEnd();

  const header: Record<string, string> = {};
  for (const rawLine of headerText.split(/\r?\n/)) {
    // A dangling \r can survive the split (JS multiline ^ also matches after
    // \r, so the separator match can start mid-CRLF) — strip it before
    // matching, since `.` won't cross a line terminator.
    const m = rawLine.replace(/\r+$/, "").match(/^([A-Z]+):\s*(.*)$/);
    if (m) header[m[1]] = m[2].trim();
  }

  const title = header.TITLE;
  if (!title || content.length === 0) return null;

  const gradeNum = header.GRADE ? parseInt(header.GRADE, 10) : NaN;

  // A spec-backed draft carries its whole structure — including the theme —
  // as JSON after the separator. The plain-text body is still rendered for
  // her to read; the spec is what Accept & Create actually executes.
  let spec: DraftSpec | null = null;
  if (header.SPEC === "1") {
    const fence = content.match(/```json\s*([\s\S]*?)```/);
    if (fence) {
      try {
        const parsed = JSON.parse(fence[1]) as { kind?: unknown };
        spec = parseSpec(parsed.kind, parsed);
      } catch {
        spec = null; // Still streaming, or malformed — fall back to text.
      }
    }
  }

  return {
    title: title.slice(0, 200),
    materialType: normalizeMaterialType(header.TYPE),
    format: normalizeDraftFormat(header.FORMAT),
    grade: [6, 7, 8].includes(gradeNum) ? gradeNum : null,
    quarter: normalizeQuarter(header.QUARTER),
    unitTitle: header.UNIT || null,
    lessonTitle: header.LESSON || null,
    content,
    spec,
  };
}

/**
 * A spec -> the ```draft block the panel already knows how to render.
 *
 * Two audiences in one block. The human-readable preview is what she reads
 * before deciding, so it must show the real content; the JSON is what the
 * accept route executes, so it must be complete. Keeping both in the existing
 * fence means DraftCard, the accept flow and the stored transcript all keep
 * working unchanged.
 */
export function renderSpecAsDraftBlock(
  spec: DraftSpec,
  placement: Record<string, unknown> = {}
): string {
  const header = [
    `TITLE: ${spec.title}`,
    `TYPE: ${normalizeMaterialType(placement.materialType)}`,
    `FORMAT: ${spec.kind}`,
    `SPEC: 1`,
  ];
  if (typeof placement.grade === "number") header.push(`GRADE: ${placement.grade}`);
  const q = normalizeQuarter(placement.quarter);
  if (q) header.push(`QUARTER: ${q}`);
  if (typeof placement.unitTitle === "string" && placement.unitTitle.trim()) {
    header.push(`UNIT: ${placement.unitTitle.trim()}`);
  }
  if (typeof placement.lessonTitle === "string" && placement.lessonTitle.trim()) {
    header.push(`LESSON: ${placement.lessonTitle.trim()}`);
  }

  return `\n\n\`\`\`draft\n${header.join("\n")}\n---\n${specPreview(spec)}\n\n\`\`\`json\n${JSON.stringify(spec)}\n\`\`\`\n\`\`\`\n`;
}

/** What she reads in the card — the content, not the JSON. */
function specPreview(spec: DraftSpec): string {
  if (spec.kind === "slides") {
    return spec.slides
      .map(
        (s) =>
          `# ${s.title}` +
          (s.bullets.length ? `\n${s.bullets.map((b) => `- ${b}`).join("\n")}` : "") +
          (s.notes ? `\n  (notes: ${s.notes})` : "")
      )
      .join("\n\n");
  }
  if (spec.kind === "sheet") {
    return [spec.headers, ...spec.rows].map((r) => r.join("\t")).join("\n");
  }
  return spec.blocks
    .map((b) => {
      if (b.type === "heading1") return `# ${b.text}`;
      if (b.type === "heading2") return `## ${b.text}`;
      if (b.type === "heading3") return `### ${b.text}`;
      if (b.type === "bullet") return `- ${b.text}`;
      return b.text;
    })
    .join("\n");
}

// Appended to the copilot system prompt. Kept here so route and tests share
// one source of truth.
export const DRAFT_SYSTEM_INSTRUCTIONS = `
── CREATABLE DRAFTS ──
When the teacher asks you to produce a concrete artifact (a quiz, rubric, checklist, activity sheet, handout, letter, or similar deliverable), present the finished deliverable inside a fenced code block with language "draft" so the app can offer her copy/paste and one-click creation in her Google Drive. Exact format:

\`\`\`draft
TITLE: <short title — used as the Drive filename>
TYPE: <one of: reading | activity | rubric | lesson | assessment | resource | curriculum | other>
FORMAT: <doc | sheet | slides — see below. Omit for doc.>
GRADE: <6 | 7 | 8 — the grade this is for, from the curriculum data>
QUARTER: <Summer | Q1 | Q2 | Q3 | Q4 — where this belongs in the year>
UNIT: <exact unit title from the curriculum data, if this belongs to a unit>
LESSON: <exact lesson title from the curriculum data — ONLY if the teacher asked for it to be placed into a specific lesson>
---
<the deliverable itself, in the body format for FORMAT>
\`\`\`

Choosing FORMAT — pick the one that matches the artifact, not the one that is easiest to write:
- **doc** (default) — prose and printable handouts: readings, letters, rubrics, quizzes, activity sheets, lesson plans.
- **sheet** — anything naturally a grid: curriculum maps, pacing guides, standards-coverage trackers, gradebook templates, data tables. If you catch yourself writing a table in a doc, it should have been a sheet.
- **slides** — anything meant to be projected to a class: lesson slides, warm-ups, vocabulary decks, discussion prompts.

Body format by FORMAT:
- **doc** — plain printable text. No markdown tables.
- **sheet** — tab-separated rows, one row per line, first line is the header row. One tab between cells and no tabs inside a cell. Do not add markdown pipes, separator lines, or blank spacer rows; the app builds the real spreadsheet from these rows.
- **slides** — one \`# Slide title\` line per slide, followed by \`- bullet\` lines for that slide's body. Keep bullets short enough to project (roughly 12 words); put anything longer in the teacher's notes outside the block. No text before the first \`#\`.

Rules:
- Keep all discussion, options, and questions OUTSIDE the block. The block holds only the final deliverable.
- Concise by default; expand only when asked.
- Ground everything in the teacher's actual curriculum and materials. Never invent page numbers, quotes, or chapter details you are not certain of — say what you'd need instead.
- When the teacher asks for changes, emit a complete fresh draft block (it becomes a new version; existing files are never edited in place).
- Nothing is written to Drive unless the teacher explicitly clicks Accept & Create — a draft block is a proposal, not an action.
- You can create Google Docs, Sheets, and Slides directly through this block. Never tell the teacher to paste something into a spreadsheet by hand, and never say you cannot produce a file — choose the right FORMAT instead.`;
