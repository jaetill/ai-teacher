import { describe, it, expect } from "vitest";
import {
  SLIDE_ID_MIN,
  buildDocBackgroundRequest,
  buildDocRequests,
  buildSheetFormatRequests,
  buildSlideNotesRequests,
  buildSlidesRequests,
  sheetValues,
  slideObjectIds,
} from "@/lib/google-requests";
import {
  hexToRgb,
  parseSpec,
  type DocSpec,
  type SheetSpec,
  type SlidesSpec,
} from "@/lib/draft-spec";

// The layer that did not exist. The old builder could emit four request types
// and no styling at all, so a teacher who asked for a parchment background got
// default white slides in a file titled "(Weathered Document Theme)". Every
// assertion here is about a request the old pipeline could not make.

const THEME = {
  backgroundColor: "#F3E9D2",
  titleFont: "Libre Baskerville",
  bodyFont: "Source Sans Pro",
  titleColor: "#3E2723",
  bodyColor: "#212121",
  accentColor: "#6D1A1A",
};

const slidesSpec: SlidesSpec = {
  kind: "slides",
  title: "Day 4 — Bystander Effect",
  theme: THEME,
  slides: [
    {
      title: "What Is the Bystander Effect?",
      bullets: ["Diffusion of responsibility"],
      notes: "5 min",
    },
    { title: "Discussion", bullets: [] },
  ],
};

const has = (reqs: object[], key: string) => reqs.some((r) => key in (r as object));
const all = (reqs: object[], key: string) =>
  reqs.filter((r) => key in (r as object)).map((r) => (r as Record<string, never>)[key]);

describe("hexToRgb", () => {
  it("converts to Google's 0-1 channels", () => {
    expect(hexToRgb("#FFFFFF")).toEqual({ red: 1, green: 1, blue: 1 });
    expect(hexToRgb("#000000")).toEqual({ red: 0, green: 0, blue: 0 });
  });

  it("accepts a missing leading hash", () => {
    expect(hexToRgb("F3E9D2")).not.toBeNull();
  });

  it("returns null rather than a fallback colour", () => {
    // A caller that cannot read the value must omit the request so Google's
    // default applies. Substituting black would produce a deck nobody asked for.
    for (const bad of ["red", "#FFF", "", null, undefined, 42, "#GGGGGG"]) {
      expect(hexToRgb(bad)).toBeNull();
    }
  });
});

describe("buildSlidesRequests — styling", () => {
  it("sets a page background, which is the request the old builder never made", () => {
    const reqs = buildSlidesRequests(slidesSpec, null);
    const backgrounds = all(reqs, "updatePageProperties");
    expect(backgrounds).toHaveLength(2); // one per slide
    expect(backgrounds[0]).toMatchObject({
      pageProperties: {
        pageBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(THEME.backgroundColor) } } },
      },
    });
  });

  it("applies title and body fonts and colours", () => {
    const styles = all(buildSlidesRequests(slidesSpec, null), "updateTextStyle") as {
      objectId: string;
      style: { fontFamily?: string };
    }[];
    const titleStyle = styles.find((s) => s.objectId.endsWith("_title"));
    const bodyStyle = styles.find((s) => s.objectId.endsWith("_body"));
    expect(titleStyle?.style.fontFamily).toBe("Libre Baskerville");
    expect(bodyStyle?.style.fontFamily).toBe("Source Sans Pro");
  });

  it("emits no styling requests at all when there is no theme", () => {
    const plain = buildSlidesRequests({ ...slidesSpec, theme: undefined }, null);
    expect(has(plain, "updatePageProperties")).toBe(false);
    expect(has(plain, "updateTextStyle")).toBe(false);
    // …but still builds the deck.
    expect(has(plain, "createSlide")).toBe(true);
  });

  it("keeps every object id inside Google's length and charset rules", () => {
    // The regression that made every Slides draft fail for two hours: `s0` is
    // two characters where Google requires five, and it is requests[0], so the
    // entire batch was rejected.
    const ids: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (k === "objectId" && typeof val === "string") ids.push(val);
          else walk(val);
        }
      }
    };
    walk(buildSlidesRequests(slidesSpec, "blank_slide"));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.length, `"${id}" is ${id.length} chars`).toBeGreaterThanOrEqual(SLIDE_ID_MIN);
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
    expect(slideObjectIds(0).slideId).not.toBe("s0");
  });

  it("never references an object it did not create", () => {
    // The test that was missing. The first version emitted an insertText at a
    // fabricated `slide_0_notes_placeholder` — 25 characters, valid charset, so
    // the id-format test above passed it happily. But Slides batchUpdate is
    // transactional: one request naming a shape that does not exist 400s the
    // whole deck. Checking the id *shape* was never enough; what matters is
    // whether the batch creates what it then writes to.
    const reqs = buildSlidesRequests(slidesSpec, "blank_slide") as Record<string, never>[];

    const created = new Set<string>();
    for (const r of reqs) {
      const cs = r.createSlide as {
        objectId?: string;
        placeholderIdMappings?: { objectId: string }[];
      };
      if (!cs) continue;
      if (cs.objectId) created.add(cs.objectId);
      for (const m of cs.placeholderIdMappings ?? []) created.add(m.objectId);
    }
    created.add("blank_slide"); // pre-existing, legitimately referenced

    for (const r of reqs) {
      for (const key of [
        "insertText",
        "updateTextStyle",
        "createParagraphBullets",
        "updatePageProperties",
        "deleteObject",
      ]) {
        const objectId = (r[key] as { objectId?: string } | undefined)?.objectId;
        if (!objectId) continue;
        expect(
          created.has(objectId),
          `${key} targets "${objectId}", which this batch never creates`,
        ).toBe(true);
      }
    }
  });

  it("leaves speaker notes to the second pass", () => {
    // Notes shapes are created by Google with unpredictable ids, so they can
    // only be written after the slides exist.
    const withNotes = slidesSpec.slides.filter((s) => s.notes);
    expect(withNotes.length).toBeGreaterThan(0); // the fixture must exercise this
    const reqs = buildSlidesRequests(slidesSpec, null) as Record<string, never>[];
    const inserted = reqs
      .map((r) => (r.insertText as { text?: string } | undefined)?.text)
      .filter(Boolean);
    expect(inserted).not.toContain("5 min");
  });

  it("skips body requests for a title-only slide", () => {
    const reqs = buildSlidesRequests({ ...slidesSpec, slides: [slidesSpec.slides[1]] }, null);
    expect(has(reqs, "createParagraphBullets")).toBe(false);
  });

  it("deletes the blank first slide only when there is one", () => {
    expect(has(buildSlidesRequests(slidesSpec, "blank"), "deleteObject")).toBe(true);
    expect(has(buildSlidesRequests(slidesSpec, null), "deleteObject")).toBe(false);
  });
});

describe("buildSlideNotesRequests", () => {
  it("writes notes to the resolved shape id", () => {
    const reqs = buildSlideNotesRequests(slidesSpec, () => "real_notes_shape") as Record<
      string,
      never
    >[];
    expect(reqs).toHaveLength(1); // only the slide that has notes
    expect(reqs[0].insertText).toMatchObject({ objectId: "real_notes_shape", text: "5 min" });
  });

  it("drops notes rather than sending a bad id when Google's shape is missing", () => {
    // If the response schema differs from what we expect, silently skipping is
    // right: a request naming a non-existent shape would fail the whole batch,
    // costing her the notes AND the deck.
    expect(buildSlideNotesRequests(slidesSpec, () => null)).toEqual([]);
    expect(buildSlideNotesRequests(slidesSpec, () => undefined)).toEqual([]);
  });

  it("emits nothing when no slide has notes", () => {
    const noNotes = {
      ...slidesSpec,
      slides: slidesSpec.slides.map((s) => ({ ...s, notes: undefined })),
    };
    expect(buildSlideNotesRequests(noNotes, () => "shape")).toEqual([]);
  });
});

describe("buildSheetFormatRequests", () => {
  const sheetSpec: SheetSpec = {
    kind: "sheet",
    title: "Q1 Pacing Guide",
    theme: THEME,
    headers: ["Week", "Text", "Standards"],
    rows: [["1", "Night Ch. 1", "8.RL.1.A"]],
    freezeHeader: true,
  };

  it("bolds the header row even with no theme", () => {
    // An unstyled header row is the single most common complaint about a
    // generated spreadsheet, so bold is a default rather than a theme option.
    const reqs = buildSheetFormatRequests({ ...sheetSpec, theme: undefined });
    const header = all(reqs, "repeatCell")[0] as {
      cell: { userEnteredFormat: { textFormat: { bold: boolean } } };
    };
    expect(header.cell.userEnteredFormat.textFormat.bold).toBe(true);
  });

  it("fills the header with the accent colour when themed", () => {
    const header = all(buildSheetFormatRequests(sheetSpec), "repeatCell")[0] as {
      cell: { userEnteredFormat: { backgroundColor?: unknown } };
      fields: string;
    };
    expect(header.cell.userEnteredFormat.backgroundColor).toEqual(hexToRgb(THEME.accentColor));
    expect(header.fields).toContain("backgroundColor");
  });

  it("freezes the header by default and honours an explicit false", () => {
    expect(has(buildSheetFormatRequests(sheetSpec), "updateSheetProperties")).toBe(true);
    expect(
      has(buildSheetFormatRequests({ ...sheetSpec, freezeHeader: false }), "updateSheetProperties"),
    ).toBe(false);
  });

  it("auto-resizes columns when no widths are given", () => {
    // Otherwise every column is 100px and every cell is truncated.
    expect(has(buildSheetFormatRequests(sheetSpec), "autoResizeDimensions")).toBe(true);
  });

  it("uses explicit widths when supplied, instead of auto-resizing", () => {
    const reqs = buildSheetFormatRequests({ ...sheetSpec, columnWidths: [80, 300, 200] });
    expect(has(reqs, "autoResizeDimensions")).toBe(false);
    expect(all(reqs, "updateDimensionProperties")).toHaveLength(3);
  });

  it("puts the header first in the values", () => {
    expect(sheetValues(sheetSpec)[0]).toEqual(["Week", "Text", "Standards"]);
  });
});

describe("buildDocRequests", () => {
  const docSpec: DocSpec = {
    kind: "doc",
    title: "Night — Study Guide",
    theme: THEME,
    blocks: [
      { type: "heading1", text: "Night" },
      { type: "paragraph", text: "A memoir by Elie Wiesel." },
      { type: "bullet", text: "Setting: Sighet" },
    ],
  };

  it("inserts all text in one request, so ranges cannot drift", () => {
    // Inserting block by block shifts every later index; a range past the end
    // is rejected outright. One insert, then ranges computed against it.
    const inserts = all(buildDocRequests(docSpec), "insertText");
    expect(inserts).toHaveLength(1);
  });

  it("maps block types to real Google heading styles", () => {
    const styles = all(buildDocRequests(docSpec), "updateParagraphStyle") as {
      paragraphStyle: { namedStyleType: string };
    }[];
    expect(styles[0].paragraphStyle.namedStyleType).toBe("HEADING_1");
    expect(styles[1].paragraphStyle.namedStyleType).toBe("NORMAL_TEXT");
  });

  it("gives ranges that start at 1 and never overlap", () => {
    const ranges = (
      all(buildDocRequests(docSpec), "updateParagraphStyle") as {
        range: { startIndex: number; endIndex: number };
      }[]
    ).map((r) => r.range);
    expect(ranges[0].startIndex).toBe(1); // Docs body begins at 1, not 0.
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].startIndex).toBe(ranges[i - 1].endIndex);
    }
  });

  it("bullets only the bullet blocks", () => {
    expect(all(buildDocRequests(docSpec), "createParagraphBullets")).toHaveLength(1);
  });

  it("returns a background request only when the theme names one", () => {
    expect(buildDocBackgroundRequest(THEME)).not.toBeNull();
    expect(buildDocBackgroundRequest({ titleFont: "Lato" })).toBeNull();
    expect(buildDocBackgroundRequest(undefined)).toBeNull();
  });

  it("builds nothing for an empty document", () => {
    expect(buildDocRequests({ ...docSpec, blocks: [] })).toEqual([]);
  });
});

describe("parseSpec — the model's input is untrusted", () => {
  it("rejects a deck with no slides rather than creating an empty one", () => {
    expect(parseSpec("slides", { title: "X", slides: [] })).toBeNull();
  });

  it("rejects a sheet with no headers", () => {
    expect(parseSpec("sheet", { title: "X", headers: [], rows: [["a"]] })).toBeNull();
  });

  it("rejects anything without a title", () => {
    expect(parseSpec("slides", { slides: [{ title: "a" }] })).toBeNull();
  });

  it("pads short rows so a missing cell cannot shift a column", () => {
    const spec = parseSpec("sheet", {
      title: "X",
      headers: ["A", "B", "C"],
      rows: [["1", "2"]],
    }) as SheetSpec;
    expect(spec.rows[0]).toEqual(["1", "2", ""]);
  });

  it("drops junk theme values instead of passing them to Google", () => {
    const spec = parseSpec("slides", {
      title: "X",
      slides: [{ title: "a" }],
      theme: { backgroundColor: "chartreuse", titleFont: "'; DROP TABLE--", bodyFont: "Lato" },
    }) as SlidesSpec;
    expect(spec.theme?.backgroundColor).toBeUndefined();
    expect(spec.theme?.titleFont).toBeUndefined();
    expect(spec.theme?.bodyFont).toBe("Lato");
  });

  it("treats an all-junk theme as no theme", () => {
    const spec = parseSpec("slides", {
      title: "X",
      slides: [{ title: "a" }],
      theme: { backgroundColor: "nope" },
    }) as SlidesSpec;
    expect(spec.theme).toBeUndefined();
  });

  it("caps runaway input", () => {
    const spec = parseSpec("slides", {
      title: "X",
      slides: Array.from({ length: 500 }, () => ({ title: "s" })),
    }) as SlidesSpec;
    expect(spec.slides.length).toBeLessThanOrEqual(60);
  });
});
