import { describe, it, expect } from "vitest";
import {
  parseDraftBlock,
  renderSpecAsDraftBlock,
  normalizeMaterialType,
  normalizeQuarter,
  DRAFT_SYSTEM_INSTRUCTIONS,
  SPEC_SENTINEL,
} from "../../src/lib/draft-protocol";
import { COPILOT_TOOLS, TOOL_TO_KIND, TOOL_SYSTEM_INSTRUCTIONS } from "../../src/lib/copilot-tools";

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

  // Extract the way CommonMark does: an opening fence, then the FIRST line
  // that is only backticks of at least the opening length.
  //
  // The original helper here anchored to the end of the string, so it found the
  // outermost fence and happily parsed a block that remark would have cut in
  // half. It passed while the feature was broken — every theme was being
  // discarded on accept, which is the exact bug this work exists to fix. A test
  // that models the real parser is the only kind worth having here.
  const inner = (block: string): string => {
    const lines = block.split("\n");
    const openAt = lines.findIndex((l) => /^`{3,}draft\s*$/.test(l.trim()));
    if (openAt === -1) return "";
    const openLen = (lines[openAt].trim().match(/^`+/) ?? [""])[0].length;
    const closeAt = lines.findIndex(
      (l, i) => i > openAt && new RegExp(`^\`{${openLen},}\\s*$`).test(l.trim()),
    );
    return lines.slice(openAt + 1, closeAt === -1 ? undefined : closeAt).join("\n");
  };

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
      `TITLE: X\nSPEC: 1\n---\npreview\n${SPEC_SENTINEL}\n{"kind":"sli`,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.spec).toBeNull();
    expect(parsed!.content).toBe("preview"); // she still sees the draft
  });

  it("survives a stray triple backtick in her content", () => {
    // A lesson containing a code sample would otherwise close the block early.
    const withTicks = renderSpecAsDraftBlock({
      ...spec,
      slides: [{ title: "Code", bullets: ["Use ``` to fence a block"] }],
    });
    const parsed = parseDraftBlock(inner(withTicks));
    expect(parsed?.spec?.kind).toBe("slides");
  });

  it("flattens a newline in the title so it cannot shift the separator", () => {
    const rendered = renderSpecAsDraftBlock({ ...spec, title: "Day 4\n---\nInjected" });
    const parsed = parseDraftBlock(inner(rendered));
    expect(parsed).not.toBeNull();
    expect(parsed!.title).not.toContain("\n");
    expect(parsed!.spec).not.toBeNull();
  });

  it("keeps the machine-readable spec out of what she reads", () => {
    const parsed = parseDraftBlock(inner(renderSpecAsDraftBlock(spec)));
    expect(parsed!.content).not.toContain(SPEC_SENTINEL);
    expect(parsed!.content).not.toContain('"kind"');
  });
});

// ── Tool wiring ───
// TOOL_TO_KIND is how the route decides whether a tool_use block becomes a
// draft. A name that does not match silently drops the card — the model would
// appear to have proposed nothing at all.
describe("copilot tools", () => {
  it("maps every tool name to a spec kind", () => {
    for (const tool of COPILOT_TOOLS) {
      expect(
        TOOL_TO_KIND[tool.name],
        `${tool.name} has no kind, so its drafts vanish`,
      ).toBeDefined();
    }
  });

  it("has no kind mapping for a tool that does not exist", () => {
    expect(Object.keys(TOOL_TO_KIND).sort()).toEqual(COPILOT_TOOLS.map((t) => t.name).sort());
  });

  it("requires the fields each executor cannot work without", () => {
    const required = (name: string) =>
      (COPILOT_TOOLS.find((t) => t.name === name)!.input_schema as { required?: string[] })
        .required ?? [];
    expect(required("propose_slides")).toEqual(expect.arrayContaining(["title", "slides"]));
    expect(required("propose_sheet")).toEqual(expect.arrayContaining(["title", "headers", "rows"]));
    expect(required("propose_doc")).toEqual(expect.arrayContaining(["title", "blocks"]));
  });

  it("tells the model it owns the design, since that was the whole failure", () => {
    // The old prompt said "never say you cannot produce a file" while giving it
    // no way to style one, which is how a "(Barbed Wire Theme)" deck came out
    // plain white.
    // Collapsed, because the prompt hard-wraps and an assertion that breaks on
    // rewrapping is noise rather than a guard.
    const flat = TOOL_SYSTEM_INSTRUCTIONS.replace(/\s+/g, " ");
    expect(flat).toMatch(/you control the design/i);
    expect(flat).toMatch(/never tell her to apply styling herself/i);
  });

  it("tells the model a tool call proposes rather than creates", () => {
    expect(TOOL_SYSTEM_INSTRUCTIONS).toMatch(/PROPOSES|proposes/);
    expect(TOOL_SYSTEM_INSTRUCTIONS).toMatch(/Accept & Create/);
  });
});
