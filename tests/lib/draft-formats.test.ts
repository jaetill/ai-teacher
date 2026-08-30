import { describe, it, expect } from "vitest";
import {
  normalizeDraftFormat,
  parseSlideOutline,
  parseTsv,
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
