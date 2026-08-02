// Lesson templates (#647) — the shape of a lesson, as data.
//
// Before this, `lessons.lesson_plan` held exactly one shape — `{activities:
// [...]}` — hardcoded here in the app and in the generation prompt. That made
// the structure of Heidi's lessons a decision made in our code rather than by
// her. A template turns that into data she owns: an ordered list of fields,
// each with a stable key, her label, a type, whether it's required, and one
// line telling the AI what belongs there.
//
// Two jobs follow from having the template as data:
//   1. Generation — templateToPromptSchema() builds the JSON schema the model
//      is asked to fill, so the AI produces HER structure, not ours.
//   2. Consistency — checkLesson() reports which required fields a lesson is
//      missing, which is the whole point of the feature: "help make my
//      material consistent."
//
// Back-compat: every lesson written before templates has `{activities: [...]}`.
// CLASSIC_FIELDS describes exactly that shape, so old lessons render and
// validate unchanged against the built-in "Classic" template. Nothing needs a
// backfill (same open-null spirit as ADR-0044).
//
// Pure functions only — no I/O, no DB. That keeps the rules testable without
// a database and lets both the API routes and the UI share one definition of
// what a valid template is.

/** A field holds either one block of prose or an ordered list of short items. */
export type FieldType = "text" | "list";

export const FIELD_TYPES: readonly FieldType[] = ["text", "list"] as const;

export type TemplateField = {
  /** Stable slug; the key under which this field's content lives in lesson_plan. */
  key: string;
  /** What the teacher calls it: "Bell Ringer". */
  label: string;
  type: FieldType;
  /** Required fields drive the consistency report. */
  required: boolean;
  /** One line of guidance for the AI: "3-5 minute warm-up tied to last night's reading." */
  aiHint: string | null;
};

export const MAX_FIELDS = 30;
export const MAX_LABEL = 60;
export const MAX_HINT = 200;
export const MAX_KEY = 40;

/** Keys are slugs so they survive a label rename without orphaning content. */
export const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * The shape every pre-template lesson already has. Seeded as the built-in
 * "Classic" template so existing content stays valid on day one.
 */
export const CLASSIC_FIELDS: TemplateField[] = [
  {
    key: "activities",
    label: "Activities",
    type: "list",
    required: false,
    aiHint: "What the class does, in order.",
  },
];

/**
 * A conventional starting point, offered when we can't derive one from the
 * teacher's own lessons (too few lessons, or the AI call fails).
 */
export const STARTER_FIELDS: TemplateField[] = [
  {
    key: "warm_up",
    label: "Warm-up",
    type: "text",
    required: false,
    aiHint: "A short opener that activates prior knowledge.",
  },
  {
    key: "instruction",
    label: "Instruction",
    type: "list",
    required: true,
    aiHint: "The main teaching moves, in order.",
  },
  {
    key: "practice",
    label: "Practice",
    type: "list",
    required: false,
    aiHint: "What students do to apply the lesson.",
  },
  {
    key: "closing",
    label: "Closing",
    type: "text",
    required: false,
    aiHint: "How the lesson wraps up or checks understanding.",
  },
];

/** Turn a human label into a stable key: "Bell Ringer" → "bell_ringer". */
export function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_KEY)
    .replace(/_+$/g, "");
  // Keys must start with a letter; prefix anything that doesn't.
  if (!slug) return "field";
  return KEY_RE.test(slug) ? slug : `f_${slug}`.slice(0, MAX_KEY);
}

/** Make `key` unique within `taken` by suffixing _2, _3, ... */
export function uniqueKey(key: string, taken: Set<string>): string {
  if (!taken.has(key)) return key;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${key.slice(0, MAX_KEY - 4)}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${key.slice(0, MAX_KEY - 6)}_${Date.now() % 10000}`;
}

export type NormalizeResult =
  | { ok: true; fields: TemplateField[] }
  | { ok: false; error: string };

/**
 * Validate and normalize whatever the client (or the AI) sent into a clean
 * field list. Missing keys are derived from labels, duplicates are
 * de-collided, and anything structurally wrong is rejected with a message
 * the UI can show verbatim.
 */
export function normalizeFields(input: unknown): NormalizeResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Template fields must be a list" };
  }
  if (input.length < 1) {
    return { ok: false, error: "A template needs at least one field" };
  }
  if (input.length > MAX_FIELDS) {
    return { ok: false, error: `A template can have at most ${MAX_FIELDS} fields` };
  }

  const fields: TemplateField[] = [];
  const taken = new Set<string>();

  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Each field must be an object" };
    }
    const r = raw as Record<string, unknown>;

    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (label.length < 1 || label.length > MAX_LABEL) {
      return { ok: false, error: `Field labels must be 1-${MAX_LABEL} characters` };
    }

    const type = r.type === "list" ? "list" : r.type === "text" ? "text" : null;
    if (!type) {
      return { ok: false, error: `Field "${label}" needs a type of text or list` };
    }

    // An explicit key is honoured when it's a valid slug; otherwise derive one
    // from the label. Either way it has to be unique within the template.
    const explicit = typeof r.key === "string" ? r.key.trim().toLowerCase() : "";
    const base = explicit && KEY_RE.test(explicit) ? explicit.slice(0, MAX_KEY) : slugify(label);
    const key = uniqueKey(base, taken);
    taken.add(key);

    const hintRaw = typeof r.aiHint === "string" ? r.aiHint.trim() : "";
    if (hintRaw.length > MAX_HINT) {
      return { ok: false, error: `Field "${label}" hint must be at most ${MAX_HINT} characters` };
    }

    fields.push({
      key,
      label,
      type,
      required: r.required === true,
      aiHint: hintRaw || null,
    });
  }

  return { ok: true, fields };
}

/**
 * Build the JSON schema fragment the generation prompt asks the model to fill.
 * This is what makes generated lessons match the teacher's structure instead
 * of ours — the prompt is derived from her template, not hardcoded.
 */
export function templateToPromptSchema(fields: TemplateField[]): string {
  const lines = fields.map((f) => {
    const example =
      f.type === "list"
        ? `["${f.label.toLowerCase()} item 1", "${f.label.toLowerCase()} item 2"]`
        : `"${f.aiHint ?? f.label}"`;
    const notes = [f.required ? "required" : "optional", f.aiHint].filter(Boolean).join("; ");
    return `    "${f.key}": ${example}  // ${f.label} — ${notes}`;
  });
  return `{\n${lines.join(",\n")}\n  }`;
}

/** Content stored under a template: field key → prose or list of items. */
export type LessonPlanContent = Record<string, unknown>;

export type LessonCheck = {
  /** Labels of required fields that are absent or empty. */
  missingRequired: string[];
  /** Labels of template fields with no content (required or not). */
  emptyFields: string[];
  /** Keys present in the lesson that the template doesn't describe. */
  unknownKeys: string[];
  complete: boolean;
};

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === "string" && v.trim().length === 0) || value.length === 0;
  }
  return false;
}

/**
 * Compare one lesson's stored plan against a template. The report layer —
 * "which of my lessons don't match how I say I teach?" — is built on this.
 */
export function checkLesson(plan: unknown, fields: TemplateField[]): LessonCheck {
  const content: LessonPlanContent =
    plan && typeof plan === "object" && !Array.isArray(plan)
      ? (plan as LessonPlanContent)
      : {};

  const missingRequired: string[] = [];
  const emptyFields: string[] = [];

  for (const f of fields) {
    if (isEmptyValue(content[f.key])) {
      emptyFields.push(f.label);
      if (f.required) missingRequired.push(f.label);
    }
  }

  const known = new Set(fields.map((f) => f.key));
  const unknownKeys = Object.keys(content).filter(
    (k) => !known.has(k) && !isEmptyValue(content[k]),
  );

  return {
    missingRequired,
    emptyFields,
    unknownKeys,
    complete: missingRequired.length === 0,
  };
}

/**
 * Coerce AI or form output into the types the template promises: `list`
 * fields become string arrays, `text` fields become a single string. Keeps
 * junk out of lesson_plan regardless of what the model returned.
 */
export function coerceToTemplate(
  plan: unknown,
  fields: TemplateField[],
): LessonPlanContent {
  const content: LessonPlanContent =
    plan && typeof plan === "object" && !Array.isArray(plan)
      ? (plan as LessonPlanContent)
      : {};
  const out: LessonPlanContent = {};

  for (const f of fields) {
    const value = content[f.key];
    if (value === undefined || value === null) continue;

    if (f.type === "list") {
      const items = Array.isArray(value) ? value : [value];
      const cleaned = items
        .map((v) => (typeof v === "string" ? v.trim() : String(v ?? "").trim()))
        .filter((v) => v.length > 0);
      if (cleaned.length > 0) out[f.key] = cleaned;
    } else {
      const text = Array.isArray(value)
        ? value.filter((v) => typeof v === "string").join("\n")
        : typeof value === "string"
          ? value
          : String(value);
      if (text.trim().length > 0) out[f.key] = text.trim();
    }
  }

  return out;
}
