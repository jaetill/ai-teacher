import { describe, it, expect } from "vitest";
import {
  SLIDE_ID_MIN,
  buildSlidesRequests,
  normalizeDraftFormat,
  parseSlideOutline,
  parseTsv,
  slideObjectIds,
  toCsv,
  tsvToCsv,
} from "../../src/lib/draft-formats";

describe("normalizeDraftFormat", () => {
  it("accepts the three known formats, case-insensitively", () => {
    expect(normalizeDraftFormat("doc")).toBe("doc");
    expect(normalizeDraftFormat("Sheet")).toBe("sheet");
    expect(normalizeDraftFormat("  SLIDES ")).toBe("slides");
  });

  it("falls back to doc for anything else", () => {
    expect(normalizeDraftFormat("xlsx")).toBe("doc");
    expect(normalizeDraftFormat(undefined)).toBe("doc");
    expect(normalizeDraftFormat(42)).toBe("doc");
  });
});

describe("parseTsv", () => {
  it("splits rows and columns", () => {
    expect(parseTsv("A\tB\n1\t2")).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  it("drops blank spacer lines the model leaves under the header", () => {
    expect(parseTsv("A\tB\n\n1\t2\n")).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  it("pads short rows so a missing trailing tab cannot shift a column", () => {
    expect(parseTsv("A\tB\tC\n1\t2")).toEqual([
      ["A", "B", "C"],
      ["1", "2", ""],
    ]);
  });

  it("handles CRLF", () => {
    expect(parseTsv("A\tB\r\n1\t2")).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  it("returns nothing for empty content", () => {
    expect(parseTsv("   \n\n")).toEqual([]);
  });
});

describe("toCsv", () => {
  // The whole reason the model emits tabs and we emit the commas.
  it("quotes cells containing commas", () => {
    expect(toCsv([["simile, metaphor, personification", "x"]])).toBe(
      '"simile, metaphor, personification",x',
    );
  });

  it("doubles embedded quotes", () => {
    expect(toCsv([['She said "no"']])).toBe('"She said ""no"""');
  });

  it("quotes cells containing newlines", () => {
    expect(toCsv([["line1\nline2"]])).toBe('"line1\nline2"');
  });

  it("leaves plain cells unquoted", () => {
    expect(toCsv([["Day 1", "8.RV.1.E"]])).toBe("Day 1,8.RV.1.E");
  });
});

describe("tsvToCsv", () => {
  it("survives a realistic curriculum-map row", () => {
    const tsv =
      "TIMEFRAME\tSTANDARDS\tSKILLS\n" +
      "Day 1 (Week 1)\t8.RV.1.E, 8.W.1.A\tIdentify figurative language (simile, metaphor)";
    expect(tsvToCsv(tsv)).toBe(
      "TIMEFRAME,STANDARDS,SKILLS\n" +
        // Only the comma-bearing cells get quoted; the rest stay readable.
        'Day 1 (Week 1),"8.RV.1.E, 8.W.1.A","Identify figurative language (simile, metaphor)"',
    );
  });
});

describe("parseSlideOutline", () => {
  it("builds a slide per heading with its bullets", () => {
    expect(parseSlideOutline("# One\n- a\n- b\n# Two\n- c")).toEqual([
      { title: "One", bullets: ["a", "b"] },
      { title: "Two", bullets: ["c"] },
    ]);
  });

  it("accepts -, * and • as bullet markers", () => {
    expect(parseSlideOutline("# T\n- a\n* b\n• c")[0].bullets).toEqual(["a", "b", "c"]);
  });

  it("keeps unmarked lines rather than losing them", () => {
    expect(parseSlideOutline("# T\nplain line")[0].bullets).toEqual(["plain line"]);
  });

  it("ignores narration before the first heading", () => {
    expect(parseSlideOutline("Here is your deck:\n# T\n- a")).toEqual([
      { title: "T", bullets: ["a"] },
    ]);
  });

  it("accepts a title-only slide", () => {
    expect(parseSlideOutline("# Just a title")).toEqual([{ title: "Just a title", bullets: [] }]);
  });

  it("returns nothing when there are no headings", () => {
    expect(parseSlideOutline("- a\n- b")).toEqual([]);
  });
});

// ── Slides batchUpdate requests ───
// Regression: the first version used `s${i}` for the slide object ID. Google
// requires 5-50 chars, so every Slides draft failed on requests[0] with
// "The object ID (s0) length should not be less than 5" and the whole batch
// was rejected. Slides never worked once in production.
describe("buildSlidesRequests", () => {
  const outline = [
    { title: "Night Book 1: Voice and Tone", bullets: ["Wiesel's diction", "Shifts in tone"] },
    { title: "Discussion", bullets: [] },
  ];

  const objectIds = (requests: object[]): string[] => {
    const found: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (k === "objectId" && typeof val === "string") found.push(val);
          else walk(val);
        }
      }
    };
    walk(requests);
    return found;
  };

  it("gives every object an id Google will accept", () => {
    const ids = objectIds(buildSlidesRequests(outline, "blank_slide_id"));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(
        id.length,
        `"${id}" is ${id.length} chars; Google requires >= ${SLIDE_ID_MIN}`,
      ).toBeGreaterThanOrEqual(SLIDE_ID_MIN);
      expect(id.length).toBeLessThanOrEqual(50);
      expect(id, `"${id}" has characters Google rejects`).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  it("holds the floor for the very first slide, which is where it broke", () => {
    const { slideId, titleId, bodyId } = slideObjectIds(0);
    for (const id of [slideId, titleId, bodyId]) {
      expect(id.length).toBeGreaterThanOrEqual(SLIDE_ID_MIN);
    }
    expect(slideId).not.toBe("s0");
  });

  it("keeps ids distinct between slides", () => {
    // An id repeats within a slide by design — the body is referenced by
    // createSlide, insertText and createParagraphBullets, all pointing at the
    // same object. What must never collide is one slide's ids with another's.
    const a = Object.values(slideObjectIds(0));
    const b = Object.values(slideObjectIds(1));
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it("creates a slide, titles it, and bullets the body", () => {
    const reqs = buildSlidesRequests([outline[0]], null) as Record<string, unknown>[];
    expect(reqs[0]).toHaveProperty("createSlide");
    expect(reqs.some((r) => "insertText" in r)).toBe(true);
    expect(reqs.some((r) => "createParagraphBullets" in r)).toBe(true);
  });

  it("skips the body requests for a slide with no bullets", () => {
    const reqs = buildSlidesRequests([outline[1]], null) as Record<string, unknown>[];
    expect(reqs.some((r) => "createParagraphBullets" in r)).toBe(false);
  });

  it("deletes the blank first slide only when there is one", () => {
    const withBlank = buildSlidesRequests(outline, "blank_slide_id") as Record<string, unknown>[];
    expect(withBlank.some((r) => "deleteObject" in r)).toBe(true);
    const without = buildSlidesRequests(outline, null) as Record<string, unknown>[];
    expect(without.some((r) => "deleteObject" in r)).toBe(false);
  });

  it("returns nothing for an empty outline, so no batch is sent", () => {
    expect(buildSlidesRequests([], null)).toEqual([]);
  });
});
