import { describe, it, expect } from "vitest";
import {
  slugify,
  uniqueKey,
  normalizeFields,
  templateToPromptSchema,
  checkLesson,
  coerceToTemplate,
  CLASSIC_FIELDS,
  STARTER_FIELDS,
  MAX_FIELDS,
  type TemplateField,
} from "../../src/lib/lesson-template";

// Lesson templates (#647). The rules live in pure functions so they can be
// enforced identically by the API, the editor UI, and the AI derive path.

const FIELDS: TemplateField[] = [
  {
    key: "bell_ringer",
    label: "Bell Ringer",
    type: "text",
    required: true,
    aiHint: "5 min opener",
  },
  { key: "reading", label: "Reading", type: "list", required: true, aiHint: null },
  { key: "exit_ticket", label: "Exit Ticket", type: "text", required: false, aiHint: null },
];

describe("slugify", () => {
  it("turns a label into a stable key", () => {
    expect(slugify("Bell Ringer")).toBe("bell_ringer");
    expect(slugify("Exit Ticket!")).toBe("exit_ticket");
  });

  it("prefixes keys that would start with a digit", () => {
    // Keys must start with a letter to stay valid identifiers.
    expect(slugify("3-2-1 Reflection")).toMatch(/^[a-z]/);
  });

  it("never returns an empty key", () => {
    expect(slugify("???")).toBe("field");
    expect(slugify("")).toBe("field");
  });
});

describe("uniqueKey", () => {
  it("passes through an unused key", () => {
    expect(uniqueKey("reading", new Set())).toBe("reading");
  });

  it("suffixes a collision", () => {
    expect(uniqueKey("reading", new Set(["reading"]))).toBe("reading_2");
    expect(uniqueKey("reading", new Set(["reading", "reading_2"]))).toBe("reading_3");
  });
});

describe("normalizeFields", () => {
  it("rejects a non-list", () => {
    expect(normalizeFields({}).ok).toBe(false);
    expect(normalizeFields(null).ok).toBe(false);
  });

  it("rejects an empty template", () => {
    const r = normalizeFields([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least one field/i);
  });

  it("rejects more than the field cap", () => {
    const many = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({
      label: `Field ${i}`,
      type: "text",
    }));
    expect(normalizeFields(many).ok).toBe(false);
  });

  it("derives keys from labels and defaults required to false", () => {
    const r = normalizeFields([{ label: "Bell Ringer", type: "text" }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields[0].key).toBe("bell_ringer");
      expect(r.fields[0].required).toBe(false);
      expect(r.fields[0].aiHint).toBeNull();
    }
  });

  it("de-collides duplicate labels instead of losing a field", () => {
    const r = normalizeFields([
      { label: "Reading", type: "list" },
      { label: "Reading", type: "text" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields).toHaveLength(2);
      expect(new Set(r.fields.map((f) => f.key)).size).toBe(2);
    }
  });

  it("honours a valid explicit key so renaming a label keeps content", () => {
    const r = normalizeFields([{ key: "bell_ringer", label: "Do Now", type: "text" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields[0].key).toBe("bell_ringer");
  });

  it("rejects an unknown field type", () => {
    expect(normalizeFields([{ label: "Reading", type: "checkbox" }]).ok).toBe(false);
  });

  it("rejects a blank or overlong label", () => {
    expect(normalizeFields([{ label: "   ", type: "text" }]).ok).toBe(false);
    expect(normalizeFields([{ label: "x".repeat(61), type: "text" }]).ok).toBe(false);
  });

  it("rejects an overlong hint", () => {
    expect(normalizeFields([{ label: "Reading", type: "text", aiHint: "x".repeat(201) }]).ok).toBe(
      false,
    );
  });
});

describe("templateToPromptSchema", () => {
  it("names every field key so the model fills the teacher's structure", () => {
    const schema = templateToPromptSchema(FIELDS);
    for (const f of FIELDS) expect(schema).toContain(`"${f.key}"`);
  });

  it("marks required fields and carries the hint through", () => {
    const schema = templateToPromptSchema(FIELDS);
    expect(schema).toContain("required");
    expect(schema).toContain("5 min opener");
  });

  it("asks for an array for list fields and a string for text fields", () => {
    const schema = templateToPromptSchema(FIELDS);
    expect(schema).toMatch(/"reading":\s*\[/);
    expect(schema).toMatch(/"bell_ringer":\s*"/);
  });
});

describe("checkLesson", () => {
  it("reports a complete lesson", () => {
    const r = checkLesson(
      { bell_ringer: "Journal prompt", reading: ["Ch. 4"], exit_ticket: "One sentence" },
      FIELDS,
    );
    expect(r.complete).toBe(true);
    expect(r.missingRequired).toEqual([]);
    expect(r.emptyFields).toEqual([]);
  });

  it("flags missing required fields by label, not key", () => {
    const r = checkLesson({ reading: ["Ch. 4"] }, FIELDS);
    expect(r.complete).toBe(false);
    expect(r.missingRequired).toEqual(["Bell Ringer"]);
    // Optional-but-empty shows up in emptyFields without failing the check.
    expect(r.emptyFields).toContain("Exit Ticket");
  });

  it("treats blank strings and empty lists as missing", () => {
    const r = checkLesson({ bell_ringer: "   ", reading: [] }, FIELDS);
    expect(r.missingRequired).toEqual(["Bell Ringer", "Reading"]);
  });

  it("reports content the template does not describe", () => {
    const r = checkLesson({ bell_ringer: "x", reading: ["y"], homework: "Read ch. 5" }, FIELDS);
    expect(r.unknownKeys).toEqual(["homework"]);
  });

  it("does not report empty unknown keys as content", () => {
    const r = checkLesson({ bell_ringer: "x", reading: ["y"], homework: "" }, FIELDS);
    expect(r.unknownKeys).toEqual([]);
  });

  it("handles a lesson with no plan at all", () => {
    const r = checkLesson(null, FIELDS);
    expect(r.complete).toBe(false);
    expect(r.missingRequired).toEqual(["Bell Ringer", "Reading"]);
  });

  it("validates every pre-template lesson against Classic unchanged", () => {
    // The back-compat promise: {activities: [...]} is valid Classic content.
    const r = checkLesson({ activities: ["Read aloud", "Discuss"] }, CLASSIC_FIELDS);
    expect(r.complete).toBe(true);
    expect(r.unknownKeys).toEqual([]);
  });
});

describe("coerceToTemplate", () => {
  it("wraps a stray string into a list field", () => {
    const out = coerceToTemplate({ reading: "Ch. 4" }, FIELDS);
    expect(out.reading).toEqual(["Ch. 4"]);
  });

  it("joins a stray array into a text field", () => {
    const out = coerceToTemplate({ bell_ringer: ["a", "b"] }, FIELDS);
    expect(out.bell_ringer).toBe("a\nb");
  });

  it("drops keys the template does not describe", () => {
    const out = coerceToTemplate({ bell_ringer: "x", nonsense: "y" }, FIELDS);
    expect(out.nonsense).toBeUndefined();
  });

  it("drops empty values rather than storing blanks", () => {
    const out = coerceToTemplate({ bell_ringer: "  ", reading: ["", " "] }, FIELDS);
    expect(out).toEqual({});
  });

  it("survives junk input", () => {
    expect(coerceToTemplate(null, FIELDS)).toEqual({});
    expect(coerceToTemplate("nope", FIELDS)).toEqual({});
    expect(coerceToTemplate([1, 2], FIELDS)).toEqual({});
  });
});

describe("built-in templates", () => {
  it("Classic and Starter are themselves valid templates", () => {
    for (const fields of [CLASSIC_FIELDS, STARTER_FIELDS]) {
      const r = normalizeFields(fields);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.fields).toEqual(fields);
    }
  });
});
