// Spec -> Google API requests. Pure functions, no client, no network.
//
// This is the layer that was missing. The old slides builder could emit four
// request types (create a slide, insert text, bullet it, delete the blank one)
// and nothing else — so a theme had nowhere to go. Everything here exists to
// widen that: backgrounds, fonts, colours, frozen headers, column widths,
// heading styles.
//
// Purity is the point, not tidiness. The bug that made every Slides draft fail
// for two hours — a two-character object ID where Google requires five — was
// unreachable by any test because it lived inline behind a Google client. Every
// request shape in this file can be asserted without touching Google.

import {
  hexToRgb,
  type DocSpec,
  type DraftTheme,
  type SheetSpec,
  type SlidesSpec,
} from "@/lib/draft-spec";

// ── Slides ───

/**
 * Google requires object IDs of 5-50 characters matching [a-zA-Z0-9_-].
 * `slide_0` is 7 and the derived ids are longer. See SLIDE_ID_MIN.
 */
export const SLIDE_ID_MIN = 5;
export const slideObjectIds = (i: number) => ({
  slideId: `slide_${i}`,
  titleId: `slide_${i}_title`,
  bodyId: `slide_${i}_body`,
});

/** Text styling for one placeholder, or [] when the theme says nothing. */
function textStyleRequests(
  objectId: string,
  opts: { font?: string; color?: string; bold?: boolean }
): object[] {
  const style: Record<string, unknown> = {};
  const fields: string[] = [];

  if (opts.font) {
    style.fontFamily = opts.font;
    fields.push("fontFamily");
  }
  const rgb = hexToRgb(opts.color);
  if (rgb) {
    style.foregroundColor = { opaqueColor: { rgbColor: rgb } };
    fields.push("foregroundColor");
  }
  if (opts.bold) {
    style.bold = true;
    fields.push("bold");
  }
  if (fields.length === 0) return [];

  return [
    {
      updateTextStyle: {
        objectId,
        textRange: { type: "ALL" },
        style,
        fields: fields.join(","),
      },
    },
  ];
}

export function buildSlidesRequests(
  spec: SlidesSpec,
  blankSlideId?: string | null
): object[] {
  const requests: object[] = [];
  const theme = spec.theme ?? {};
  const bg = hexToRgb(theme.backgroundColor);

  spec.slides.forEach((slide, i) => {
    const { slideId, titleId, bodyId } = slideObjectIds(i);

    requests.push({
      createSlide: {
        objectId: slideId,
        slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        placeholderIdMappings: [
          { layoutPlaceholder: { type: "TITLE" }, objectId: titleId },
          { layoutPlaceholder: { type: "BODY", index: 0 }, objectId: bodyId },
        ],
      },
    });

    // The background is a property of the page, not of any shape on it — this
    // is the request the old builder never made, and the whole reason a
    // "weathered parchment" deck came out plain white.
    if (bg) {
      requests.push({
        updatePageProperties: {
          objectId: slideId,
          pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: bg } } } },
          fields: "pageBackgroundFill.solidFill.color",
        },
      });
    }

    if (slide.title) {
      requests.push({ insertText: { objectId: titleId, text: slide.title } });
      requests.push(
        ...textStyleRequests(titleId, {
          font: theme.titleFont,
          color: theme.titleColor,
        })
      );
    }

    if (slide.bullets.length > 0) {
      requests.push({ insertText: { objectId: bodyId, text: slide.bullets.join("\n") } });
      requests.push({
        createParagraphBullets: {
          objectId: bodyId,
          textRange: { type: "ALL" },
          bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
        },
      });
      requests.push(
        ...textStyleRequests(bodyId, { font: theme.bodyFont, color: theme.bodyColor })
      );
    }

    // Speaker notes: hers to read, never projected. The text mini-format had
    // no way to carry these at all.
    if (slide.notes) {
      requests.push({
        insertText: {
          objectId: `${slideId}_notes_placeholder`,
          text: slide.notes,
        },
      });
    }
  });

  if (blankSlideId) requests.push({ deleteObject: { objectId: blankSlideId } });
  return requests;
}

/**
 * Notes need the real notes-page shape id, which only exists once Google has
 * created the slide, so they cannot be part of the first batch. Callers resolve
 * the ids from the created presentation and send these separately.
 */
export function buildSlideNotesRequests(
  spec: SlidesSpec,
  notesShapeIdBySlideIndex: (i: number) => string | null | undefined
): object[] {
  const requests: object[] = [];
  spec.slides.forEach((slide, i) => {
    if (!slide.notes) return;
    const shapeId = notesShapeIdBySlideIndex(i);
    if (!shapeId) return;
    requests.push({ insertText: { objectId: shapeId, text: slide.notes } });
  });
  return requests;
}

// ── Sheets ───

export function sheetValues(spec: SheetSpec): string[][] {
  return [spec.headers, ...spec.rows];
}

/**
 * Formatting for a spreadsheet that already has its values.
 *
 * `sheetId` is Google's numeric id for the tab (0 for a new spreadsheet's first
 * sheet), not the spreadsheet id.
 */
export function buildSheetFormatRequests(spec: SheetSpec, sheetId = 0): object[] {
  const requests: object[] = [];
  const theme = spec.theme ?? {};
  const accent = hexToRgb(theme.accentColor) ?? hexToRgb(theme.backgroundColor);
  const headerText = hexToRgb(theme.titleColor);

  // Header row: bold always, themed when a theme was given. Bold-always is a
  // deliberate default — an unstyled header row is the single most common
  // complaint about a generated spreadsheet.
  const headerFormat: Record<string, unknown> = {
    textFormat: {
      bold: true,
      ...(theme.titleFont ? { fontFamily: theme.titleFont } : {}),
      ...(headerText ? { foregroundColor: headerText } : {}),
    },
  };
  if (accent) headerFormat.backgroundColor = accent;

  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: headerFormat },
      fields: `userEnteredFormat(textFormat${accent ? ",backgroundColor" : ""})`,
    },
  });

  if (theme.bodyFont || theme.bodyColor) {
    const bodyColor = hexToRgb(theme.bodyColor);
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: {
              ...(theme.bodyFont ? { fontFamily: theme.bodyFont } : {}),
              ...(bodyColor ? { foregroundColor: bodyColor } : {}),
            },
          },
        },
        fields: "userEnteredFormat(textFormat)",
      },
    });
  }

  if (spec.freezeHeader !== false) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    });
  }

  if (spec.columnWidths?.length) {
    spec.columnWidths.forEach((width, i) => {
      if (!width) return;
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: width },
          fields: "pixelSize",
        },
      });
    });
  } else {
    // Nothing worse than a curriculum map where every column is 100px and
    // every cell is truncated.
    requests.push({
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: spec.headers.length },
      },
    });
  }

  return requests;
}

// ── Docs ───

const DOC_NAMED_STYLE: Record<string, string> = {
  heading1: "HEADING_1",
  heading2: "HEADING_2",
  heading3: "HEADING_3",
  paragraph: "NORMAL_TEXT",
  bullet: "NORMAL_TEXT",
};

/**
 * Docs batchUpdate for a whole document.
 *
 * Index arithmetic is the trap here. A new document's body starts at index 1,
 * every insert shifts everything after it, and a range that runs past the end
 * is rejected outright. So the text is inserted in ONE request and the styling
 * ranges are computed against the offsets that text will occupy — rather than
 * inserting block by block and trying to track a moving cursor.
 */
export function buildDocRequests(spec: DocSpec): object[] {
  const theme = spec.theme ?? {};
  const requests: object[] = [];

  let cursor = 1; // Docs body content begins at index 1.
  const ranges: { block: (typeof spec.blocks)[number]; start: number; end: number }[] = [];
  let text = "";

  for (const block of spec.blocks) {
    const line = `${block.text}\n`;
    ranges.push({ block, start: cursor, end: cursor + line.length });
    text += line;
    cursor += line.length;
  }

  if (text.length === 0) return [];

  requests.push({ insertText: { location: { index: 1 }, text } });

  for (const { block, start, end } of ranges) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle: { namedStyleType: DOC_NAMED_STYLE[block.type] ?? "NORMAL_TEXT" },
        fields: "namedStyleType",
      },
    });

    if (block.type === "bullet") {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: start, endIndex: end },
          bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
        },
      });
    }

    const isHeading = block.type.startsWith("heading");
    const fontFamily = isHeading ? theme.titleFont : theme.bodyFont;
    const rgb = hexToRgb(isHeading ? theme.titleColor : theme.bodyColor);
    const style: Record<string, unknown> = {};
    const fields: string[] = [];
    if (fontFamily) {
      style.weightedFontFamily = { fontFamily };
      fields.push("weightedFontFamily");
    }
    if (rgb) {
      style.foregroundColor = { color: { rgbColor: rgb } };
      fields.push("foregroundColor");
    }
    if (fields.length > 0) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end },
          textStyle: style,
          fields: fields.join(","),
        },
      });
    }
  }

  return requests;
}

/** Page background for a Doc, which is a document-level property, not a range. */
export function buildDocBackgroundRequest(theme?: DraftTheme): object | null {
  const rgb = hexToRgb(theme?.backgroundColor);
  if (!rgb) return null;
  return {
    updateDocumentStyle: {
      documentStyle: { background: { color: { color: { rgbColor: rgb } } } },
      fields: "background",
    },
  };
}
