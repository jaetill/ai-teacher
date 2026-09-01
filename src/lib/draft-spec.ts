// The structured shape the copilot fills in when it proposes a Drive file.
//
// ── Why this exists ───
//
// The original draft protocol gave the model one channel: plain text in a small
// mini-format (`# title` / `- bullet`). The app then translated that with four
// hand-written Slides requests. So when a teacher asked for a deck on a
// "weathered parchment" background, the model described the design perfectly —
// hex codes, font pairings, borders — and every word of it was dropped on the
// floor, because there was no wire for design to travel down. She got default
// white slides in a file titled "(Barbed Wire Theme)".
//
// The ceiling was never the model. It was that the app's parser only understood
// text, so every new capability had to be hand-coded into the translator.
//
// A spec is that wire. The model fills one in through a tool call, and the app
// turns it into real Google API requests — backgrounds, fonts, colours, column
// widths, heading styles. New capability means widening the spec, not inventing
// another mini-format.
//
// ── What a spec is NOT ───
//
// It is not an instruction to write anything. The route captures the tool input
// and renders it as a draft card; nothing reaches her Drive until she clicks
// Accept & Create. That guarantee predates this file and survives it.

export const SPEC_KINDS = ["doc", "sheet", "slides"] as const;
export type SpecKind = (typeof SPEC_KINDS)[number];

/** A colour the Google APIs will accept, 0-1 per channel. */
export type RgbColor = { red: number; green: number; blue: number };

/**
 * Presentation choices shared by all three formats. Every field is optional —
 * an omitted theme means Google's defaults, which is the right answer for a
 * plain handout.
 */
export type DraftTheme = {
  /** Page/slide background. Hex, e.g. "#F3E9D2". */
  backgroundColor?: string;
  titleFont?: string;
  bodyFont?: string;
  titleColor?: string;
  bodyColor?: string;
  /** Used for header rows, accent rules, key terms. */
  accentColor?: string;
};

export type SlideSpec = {
  title: string;
  bullets: string[];
  /** Speaker notes. Slides carries them natively; the text format could not. */
  notes?: string;
};

export type SlidesSpec = {
  kind: "slides";
  title: string;
  theme?: DraftTheme;
  slides: SlideSpec[];
};

export type SheetSpec = {
  kind: "sheet";
  title: string;
  theme?: DraftTheme;
  headers: string[];
  rows: string[][];
  /** Keep the header visible while she scrolls. Defaults to true. */
  freezeHeader?: boolean;
  /** Per-column width in points, positionally matched to headers. */
  columnWidths?: number[];
};

export type DocBlockType = "heading1" | "heading2" | "heading3" | "paragraph" | "bullet";
export type DocBlock = { type: DocBlockType; text: string };

export type DocSpec = {
  kind: "doc";
  title: string;
  theme?: DraftTheme;
  blocks: DocBlock[];
};

export type DraftSpec = DocSpec | SheetSpec | SlidesSpec;

// ── Parsing and bounds ───
//
// Everything below treats the spec as untrusted. It arrives as tool input from
// a model, so a field may be missing, the wrong type, or absurdly large. The
// rule is the same one the standards work used: never hand a model's raw string
// to an API that will either reject it loudly or, worse, accept it.

export const MAX_SLIDES = 60;
export const MAX_BULLETS_PER_SLIDE = 12;
export const MAX_SHEET_ROWS = 1000;
export const MAX_SHEET_COLS = 26;
export const MAX_DOC_BLOCKS = 500;
const MAX_TEXT = 5000;

const str = (v: unknown, max = MAX_TEXT): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const strArray = (v: unknown, maxItems: number): string[] =>
  Array.isArray(v) ? v.slice(0, maxItems).map((x) => str(x)).filter((s) => s.length > 0) : [];

/**
 * "#RRGGBB" -> Google's 0-1 RgbColor, or null when it isn't a colour.
 *
 * Null rather than a fallback colour on purpose: a caller that cannot read the
 * value should omit the styling request entirely, so Google's default applies.
 * Substituting black would silently produce a deck nobody asked for.
 */
export function hexToRgb(hex: unknown): RgbColor | null {
  if (typeof hex !== "string") return null;
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return {
    red: ((n >> 16) & 255) / 255,
    green: ((n >> 8) & 255) / 255,
    blue: (n & 255) / 255,
  };
}

/** Font families are passed to Google verbatim, so keep them plausible. */
const font = (v: unknown): string | undefined => {
  const s = str(v, 60).trim();
  return /^[a-zA-Z0-9 ]{2,60}$/.test(s) ? s : undefined;
};

const color = (v: unknown): string | undefined => (hexToRgb(v) ? str(v, 7).trim() : undefined);

export function normalizeTheme(v: unknown): DraftTheme | undefined {
  if (!v || typeof v !== "object") return undefined;
  const t = v as Record<string, unknown>;
  const out: DraftTheme = {
    backgroundColor: color(t.backgroundColor),
    titleFont: font(t.titleFont),
    bodyFont: font(t.bodyFont),
    titleColor: color(t.titleColor),
    bodyColor: color(t.bodyColor),
    accentColor: color(t.accentColor),
  };
  // Drop undefined keys so an all-empty theme is indistinguishable from none.
  const cleaned = Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
  return Object.keys(cleaned).length > 0 ? (cleaned as DraftTheme) : undefined;
}

/**
 * Tool input -> a spec, or null when it cannot become the file it claims to be.
 *
 * Null is a real answer: an empty deck or a headerless sheet is a worse outcome
 * for a teacher than being told the draft was malformed.
 */
export function parseSpec(kind: unknown, input: unknown): DraftSpec | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const title = str(raw.title, 200).trim();
  if (!title) return null;
  const theme = normalizeTheme(raw.theme);

  if (kind === "slides") {
    const slides = (Array.isArray(raw.slides) ? raw.slides : [])
      .slice(0, MAX_SLIDES)
      .map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return {
          title: str(o.title, 300).trim(),
          bullets: strArray(o.bullets, MAX_BULLETS_PER_SLIDE),
          notes: str(o.notes, 2000).trim() || undefined,
        };
      })
      .filter((s) => s.title.length > 0 || s.bullets.length > 0);
    return slides.length > 0 ? { kind: "slides", title, theme, slides } : null;
  }

  if (kind === "sheet") {
    const headers = strArray(raw.headers, MAX_SHEET_COLS);
    if (headers.length === 0) return null;
    const rows = (Array.isArray(raw.rows) ? raw.rows : [])
      .slice(0, MAX_SHEET_ROWS)
      .map((r) => {
        const cells = strArray(r, MAX_SHEET_COLS);
        // Pad to the header width so a short row cannot shift a column — the
        // same failure the TSV parser guards against.
        return [...cells, ...Array(Math.max(0, headers.length - cells.length)).fill("")].slice(
          0,
          headers.length
        );
      });
    const widths = Array.isArray(raw.columnWidths)
      ? raw.columnWidths
          .slice(0, headers.length)
          .map((w) => (typeof w === "number" && w > 20 && w < 800 ? Math.round(w) : 0))
      : undefined;
    return {
      kind: "sheet",
      title,
      theme,
      headers,
      rows,
      freezeHeader: raw.freezeHeader !== false,
      columnWidths: widths?.some((w) => w > 0) ? widths : undefined,
    };
  }

  if (kind === "doc") {
    const allowed: DocBlockType[] = ["heading1", "heading2", "heading3", "paragraph", "bullet"];
    const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
      .slice(0, MAX_DOC_BLOCKS)
      .map((b) => {
        const o = (b ?? {}) as Record<string, unknown>;
        const type = allowed.includes(o.type as DocBlockType)
          ? (o.type as DocBlockType)
          : "paragraph";
        return { type, text: str(o.text).trim() };
      })
      .filter((b) => b.text.length > 0);
    return blocks.length > 0 ? { kind: "doc", title, theme, blocks } : null;
  }

  return null;
}

/** A short human line for the draft card, so she sees what she is accepting. */
export function describeSpec(spec: DraftSpec): string {
  const themed = spec.theme ? ", styled" : "";
  if (spec.kind === "slides") return `${spec.slides.length} slides${themed}`;
  if (spec.kind === "sheet")
    return `${spec.rows.length} rows × ${spec.headers.length} columns${themed}`;
  return `${spec.blocks.length} blocks${themed}`;
}
