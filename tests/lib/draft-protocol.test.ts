import { describe, it, expect } from "vitest";
import {
  parseDraftBlock,
  renderSpecAsDraftBlock,
  normalizeMaterialType,
  normalizeQuarter,
  DRAFT_SYSTEM_INSTRUCTIONS,
} from "../../src/lib/draft-protocol";

const FULL_BLOCK = `TITLE: Animal Farm Ch. 1–4 Quiz
TYPE: assessment
GRADE: 8
QUARTER: Q1
UNIT: Animal Farm
LESSON: Animal Farm: Ch. 1–4
---
1. Who leads the rebellion?
2. What are the Seven Commandments?`;

describe("parseDraftBlock", () => {
  it("parses a complete block with all header fields", () => {
    const d = parseDraftBlock(FULL_BLOCK);
    expect(d).not.toBeNull();
    expect(d!.title).toBe("Animal Farm Ch. 1–4 Quiz");
    expect(d!.materialType).toBe("assessment");
    expect(d!.grade).toBe(8);
    expect(d!.quarter).toBe("Q1");
    expect(d!.unitTitle).toBe("Animal Farm");
    expect(d!.lessonTitle).toBe("Animal Farm: Ch. 1–4");
    expect(d!.content).toContain("Seven Commandments");
    expect(d!.content.startsWith("1. Who leads")).toBe(true);
  });

  it("parses a minimal block (TITLE + separator + content)", () => {
    const d = parseDraftBlock("TITLE: Exit Ticket\n---\nName one theme.");
    expect(d).not.toBeNull();
    expect(d!.title).toBe("Exit Ticket");
    expect(d!.materialType).toBe("other");
    expect(d!.grade).toBeNull();
    expect(d!.quarter).toBeNull();
    expect(d!.unitTitle).toBeNull();
    expect(d!.lessonTitle).toBeNull();
    expect(d!.content).toBe("Name one theme.");
  });

  it("returns null while the block is still streaming (no separator yet)", () => {
    expect(parseDraftBlock("TITLE: Quiz\nTYPE: assessment\n")).toBeNull();
  });

  it("returns null when TITLE is missing", () => {
    expect(parseDraftBlock("TYPE: assessment\n---\nbody")).toBeNull();
  });

  it("returns null when content is empty", () => {
    expect(parseDraftBlock("TITLE: Quiz\n---\n")).toBeNull();
  });

  it("does not treat --- inside content as a second separator", () => {
    const d = parseDraftBlock("TITLE: T\n---\nline one\n---\nline two");
    expect(d).not.toBeNull();
    expect(d!.content).toBe("line one\n---\nline two");
  });

  it("normalizes an invalid grade to null", () => {
    const d = parseDraftBlock("TITLE: T\nGRADE: 12\n---\nbody");
    expect(d!.grade).toBeNull();
  });

  it("handles CRLF line endings", () => {
    const d = parseDraftBlock("TITLE: T\r\nTYPE: rubric\r\n---\r\nbody");
    expect(d).not.toBeNull();
    expect(d!.materialType).toBe("rubric");
    expect(d!.content).toBe("body");
  });
});

describe("normalizeMaterialType", () => {
  it("accepts valid types case-insensitively", () => {
    expect(normalizeMaterialType("Assessment")).toBe("assessment");
    expect(normalizeMaterialType("rubric")).toBe("rubric");
  });
  it("falls back to other for junk", () => {
    expect(normalizeMaterialType("worksheet")).toBe("other");
    expect(normalizeMaterialType(42)).toBe("other");
    expect(normalizeMaterialType(undefined)).toBe("other");
  });
});

describe("normalizeQuarter", () => {
  it("accepts valid quarters case-insensitively", () => {
    expect(normalizeQuarter("q1")).toBe("Q1");
    expect(normalizeQuarter("Summer")).toBe("Summer");
  });
  it("rejects junk", () => {
    expect(normalizeQuarter("Q5")).toBeNull();
    expect(normalizeQuarter(3)).toBeNull();
  });
});

describe("FORMAT header", () => {
  const withFormat = (f: string) => `TITLE: T\nTYPE: curriculum\nFORMAT: ${f}\n---\nbody`;

  it("defaults to doc when the header is absent — every pre-existing draft stays a Doc", () => {
    expect(parseDraftBlock(FULL_BLOCK)!.format).toBe("doc");
  });

  it("reads sheet and slides", () => {
    expect(parseDraftBlock(withFormat("sheet"))!.format).toBe("sheet");
    expect(parseDraftBlock(withFormat("slides"))!.format).toBe("slides");
  });

  it("falls back to doc on an unknown format", () => {
    expect(parseDraftBlock(withFormat("xlsx"))!.format).toBe("doc");
  });

  it("accepts curriculum as a TYPE, so a curriculum map files under Curriculum", () => {
    expect(parseDraftBlock(withFormat("sheet"))!.materialType).toBe("curriculum");
  });
});

describe("DRAFT_SYSTEM_INSTRUCTIONS", () => {
  it("documents the fence and required fields", () => {
    expect(DRAFT_SYSTEM_INSTRUCTIONS).toContain("```draft");
    expect(DRAFT_SYSTEM_INSTRUCTIONS).toContain("TITLE:");
    expect(DRAFT_SYSTEM_INSTRUCTIONS).toContain("Accept & Create");
  });

  it("offers all three formats and the curriculum type", () => {
    expect(DRAFT_SYSTEM_INSTRUCTIONS).toContain("FORMAT:");
    for (const f of ["doc", "sheet", "slides"]) {
      expect(DRAFT_SYSTEM_INSTRUCTIONS).toContain(f);
    }
    expect(DRAFT_SYSTEM_INSTRUCTIONS).toContain("curriculum");
  });

  // The behaviour that started this: the copilot told the teacher to paste
  // tab-separated text into a spreadsheet by hand because the prompt had
  // banned tables and never mentioned Sheets.
  it("tells the model not to claim it cannot produce a file", () => {
    expect(DRAFT_SYSTEM_INSTRUCTIONS).toContain("never say you cannot produce a file");
    expect(DRAFT_SYSTEM_INSTRUCTIONS).not.toContain("no markdown tables, no interactive elements");
  });
});

// ── Tool-call drafts ───
// A propose_* tool call is serialised into the same ```draft fence the panel
// already renders, so DraftCard, the accept flow and the stored transcript all
// keep working. This round trip is the contract between route and client: if it
// breaks, the card either vanishes or loses its styling silently.
describe("renderSpecAsDraftBlock -> parseDraftBlock", () => {
  const spec = {
    kind: "slides" as const,
    title: "Day 4 — Bystander Effect",
    theme: { backgroundColor: "#F3E9D2", titleFont: "Libre Baskerville" },
    slides: [{ title: "What Is the Bystander Effect?", bullets: ["Diffusion of responsibility"] }],
  };

  const inner = (block: string) => block.match(/```draft\n([\s\S]*?)\n```\s*$/)?.[1] ?? "";

  it("round-trips the spec, styling intact", () => {
    const rendered = renderSpecAsDraftBlock(spec, {
      materialType: "lesson",
      grade: 8,
      quarter: "Q1",
      unitTitle: "Night & The Hiding Place",
    });
    const parsed = parseDraftBlock(inner(rendered));

    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe("Day 4 — Bystander Effect");
    expect(parsed!.format).toBe("slides");
    expect(parsed!.grade).toBe(8);
    expect(parsed!.unitTitle).toBe("Night & The Hiding Place");
    // The part that matters: the theme survives to the accept route.
    expect(parsed!.spec?.theme?.backgroundColor).toBe("#F3E9D2");
    expect(parsed!.spec?.kind).toBe("slides");
  });

  it("shows her the real content, not the JSON, in the preview", () => {
    const parsed = parseDraftBlock(inner(renderSpecAsDraftBlock(spec)));
    expect(parsed!.content).toContain("# What Is the Bystander Effect?");
    expect(parsed!.content).toContain("- Diffusion of responsibility");
  });

  it("leaves spec null for an old-style text draft", () => {
    const parsed = parseDraftBlock("TITLE: Plain\nTYPE: lesson\n---\nJust text.");
    expect(parsed!.spec).toBeNull();
    expect(parsed!.content).toBe("Just text.");
  });

  it("degrades to text rather than throwing on malformed spec JSON", () => {
    // Half-streamed JSON is the common case here, not corruption.
    const parsed = parseDraftBlock(
      'TITLE: X\nSPEC: 1\n---\npreview\n\n```json\n{"kind":"slides",\n```',
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.spec).toBeNull();
  });
});
