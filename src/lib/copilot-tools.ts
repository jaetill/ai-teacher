// The copilot's tools: three ways to propose a Google file.
//
// These replace the ```draft mini-format for file creation. The difference is
// not cosmetic. A draft block could carry a title, a type and plain text; the
// app then translated it with a handful of hand-written requests. Design had
// nowhere to go, so a teacher who asked for a "weathered parchment" deck got
// default white slides in a file named "(Weathered Document Theme)".
//
// A tool call carries the whole specification — including the theme — so the
// ceiling becomes what the Google APIs support rather than what someone
// remembered to hand-code.
//
// PROPOSE, not create. Calling one of these writes nothing. The route captures
// the input and renders it as a draft card; the file is created only when she
// clicks Accept & Create. Tool names say `propose_` for that reason: the model
// should not tell her a file exists.

import type Anthropic from "@anthropic-ai/sdk";

const THEME_SCHEMA = {
  type: "object" as const,
  description:
    "Optional visual styling. Omit entirely for a plain, printable file — that is the right choice for a worksheet she will photocopy. Supply it when she asks for a look, a theme, or a background, or when the material is meant to be projected.",
  properties: {
    backgroundColor: {
      type: "string" as const,
      description:
        'Page or slide background as "#RRGGBB". Choose something that keeps body text readable when projected in a lit classroom — very dark or very saturated backgrounds need light text to match.',
    },
    titleFont: {
      type: "string" as const,
      description:
        'A Google Fonts family name, e.g. "Libre Baskerville", "Playfair Display", "Montserrat". Letters, numbers and spaces only.',
    },
    bodyFont: {
      type: "string" as const,
      description: 'A Google Fonts family name for body text, e.g. "Source Sans Pro", "Lato".',
    },
    titleColor: { type: "string" as const, description: 'Title text colour, "#RRGGBB".' },
    bodyColor: { type: "string" as const, description: 'Body text colour, "#RRGGBB".' },
    accentColor: {
      type: "string" as const,
      description:
        'Accent colour for header rows and key terms, "#RRGGBB". On a sheet this fills the header row.',
    },
  },
};

const SHARED_PLACEMENT = {
  materialType: {
    type: "string" as const,
    enum: ["reading", "activity", "rubric", "lesson", "assessment", "resource", "curriculum", "other"],
    description: "What kind of material this is. Decides which folder it lands in.",
  },
  grade: { type: "number" as const, enum: [6, 7, 8], description: "Grade, from the curriculum context." },
  quarter: {
    type: "string" as const,
    enum: ["Summer", "Q1", "Q2", "Q3", "Q4"],
    description: "Where it belongs in the year.",
  },
  unitTitle: {
    type: "string" as const,
    description: "Exact unit title from her curriculum, so the file attaches to the right unit.",
  },
  lessonTitle: {
    type: "string" as const,
    description: "Exact lesson title from her curriculum, when the file belongs to one lesson.",
  },
};

export const COPILOT_TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_slides",
    description:
      "Propose a Google Slides deck for something she will project: lesson slides, a warm-up, a vocabulary deck, discussion prompts. You control the visual design through `theme` — backgrounds, fonts and colours are applied for real, so do not tell her to style it herself afterwards. Keep bullets short enough to read from the back of a room (roughly 12 words); anything longer belongs in `notes`.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Filename for the deck." },
        theme: THEME_SCHEMA,
        slides: {
          type: "array",
          description: "The slides, in order.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Slide heading." },
              bullets: {
                type: "array",
                items: { type: "string" },
                description: "Body bullets. Omit or leave empty for a title-only slide.",
              },
              notes: {
                type: "string",
                description:
                  "Speaker notes — hers to read, never projected. Put the longer explanation, the timing, and the questions to ask here.",
              },
            },
            required: ["title"],
          },
        },
        ...SHARED_PLACEMENT,
      },
      required: ["title", "slides"],
    },
  },
  {
    name: "propose_sheet",
    description:
      "Propose a Google Sheet for anything naturally a grid: a curriculum map, a pacing guide, a standards-coverage tracker, a gradebook template, a data table. If you catch yourself writing a table inside a document, it should have been a sheet. The header row is bolded and frozen automatically; `theme.accentColor` fills it.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Filename for the spreadsheet." },
        theme: THEME_SCHEMA,
        headers: {
          type: "array",
          items: { type: "string" },
          description: "Column headers, left to right. Required.",
        },
        rows: {
          type: "array",
          description: "Data rows, each an array of cell strings matching the header order.",
          items: { type: "array", items: { type: "string" } },
        },
        freezeHeader: {
          type: "boolean",
          description: "Keep the header visible while scrolling. Defaults to true.",
        },
        columnWidths: {
          type: "array",
          items: { type: "number" },
          description:
            "Optional per-column pixel widths, matching header order. Omit to let Google size columns to their content, which is usually right.",
        },
        ...SHARED_PLACEMENT,
      },
      required: ["title", "headers", "rows"],
    },
  },
  {
    name: "propose_doc",
    description:
      "Propose a Google Doc for prose and printable handouts: readings, letters, rubrics, quizzes, activity sheets, lesson plans, parent communications. Structure it with heading and bullet blocks rather than writing markdown — the headings become real Google Docs heading styles, so her document outline works.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Filename for the document." },
        theme: THEME_SCHEMA,
        blocks: {
          type: "array",
          description: "The document body, in order.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["heading1", "heading2", "heading3", "paragraph", "bullet"],
                description: "How this block is styled.",
              },
              text: { type: "string", description: "The block's text, without markdown markers." },
            },
            required: ["type", "text"],
          },
        },
        ...SHARED_PLACEMENT,
      },
      required: ["title", "blocks"],
    },
  },
];

export const TOOL_TO_KIND: Record<string, "doc" | "sheet" | "slides"> = {
  propose_doc: "doc",
  propose_sheet: "sheet",
  propose_slides: "slides",
};

/**
 * What the system prompt says about the tools.
 *
 * The old prompt ended with "never say you cannot produce a file — choose the
 * right FORMAT instead", which was written to stop the copilot telling her to
 * paste rows into a spreadsheet by hand. It had the side effect of pushing the
 * model to promise decks it had no way to style. Now the promise is true.
 */
export const TOOL_SYSTEM_INSTRUCTIONS = `
── Creating files ───

You can create real Google Docs, Sheets and Slides for her, including their
visual design, using propose_doc, propose_sheet and propose_slides.

- Choose by artifact, not by what is easiest to write. Grids are sheets. Anything
  projected is slides. Prose and handouts are docs.
- You control the design. If she asks for a background, a theme, or a particular
  look, put it in \`theme\` — it is applied to the real file. Never tell her to
  apply styling herself afterwards, and never describe a design you are not also
  building.
- Calling a tool PROPOSES the file. Nothing is written to her Drive until she
  clicks Accept & Create, so say "here's a draft" rather than "I've created".
- Fill in unitTitle and lessonTitle from her actual curriculum when the file
  belongs to one, using the exact titles you were given, so it attaches itself.
- One file per turn unless she asks for several. If she asks for two versions,
  call the tool twice.
`.trim();
