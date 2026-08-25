// POST /api/import/classify
//
// Fills in the classification her folders did not already answer — and only
// that. The import screen reads a category straight out of a "Lessons" or
// "Assessments" folder for free; this route is for the files that sit directly
// under a unit with nothing to go on but their name.
//
// Deliberately NOT the same thing as /api/upload/classify, which also asks the
// model for grade and destination. She now states the grade, the year and the
// quarter herself. Asking the model for facts she has already given is how a
// guess ends up overriding her, and #680/#682 were both that mistake.
//
// The category definitions come from the glossary, so her wording is what the
// model is told — the glossary was written to be that contract.

import { getUserEmail } from "@/lib/auth-helpers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { readJson } from "@/lib/api-utils";
import { MODELS } from "@/lib/models";
import { parseAiJson } from "@/lib/parse-ai-json";
import { CATEGORIES, MATERIAL_TYPES } from "@/lib/upload-utils";
import { db } from "@/db";
import { glossaryTerms } from "@/db/schema";
import { DEFAULT_TERMS } from "@/lib/glossary-terms";
import { and, eq, inArray } from "drizzle-orm";

export const maxDuration = 120;

const MAX_FILES = 200;
const MAX_NAME_CHARS = 300;

type Incoming = { files: { id: string; name: string; unit?: string | null }[] };

/** Category and type definitions, in her words where she has rewritten them. */
async function definitions(ownerEmail: string) {
  const keys = [
    ...CATEGORIES.map((c) => c.toLowerCase().replace(/s$/, "")),
    ...MATERIAL_TYPES,
  ];
  let overrides: { termKey: string; definition: string }[] = [];
  try {
    overrides = await db
      .select({ termKey: glossaryTerms.termKey, definition: glossaryTerms.definition })
      .from(glossaryTerms)
      .where(and(eq(glossaryTerms.ownerEmail, ownerEmail), inArray(glossaryTerms.termKey, keys)));
  } catch {
    // The glossary is a nicety here; a lookup failure must not block an import.
    overrides = [];
  }
  const byKey = new Map(overrides.map((o) => [o.termKey, o.definition]));

  const lines: string[] = [];
  for (const key of MATERIAL_TYPES) {
    const term = DEFAULT_TERMS.find((t) => t.key === key);
    if (term) lines.push(`- ${key}: ${byKey.get(key) ?? term.definition}`);
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimited = await checkAiRateLimit(await getUserEmail());
  if (rateLimited) return rateLimited;

  const body = await readJson<Incoming>(req);
  if (!body || !Array.isArray(body.files) || body.files.length === 0) {
    return Response.json({ error: "files is required" }, { status: 400 });
  }
  if (body.files.length > MAX_FILES) {
    return Response.json({ error: `Too many files (max ${MAX_FILES})` }, { status: 413 });
  }
  if (
    !body.files.every(
      (f) =>
        f &&
        typeof f.id === "string" &&
        typeof f.name === "string" &&
        f.name.length <= MAX_NAME_CHARS
    )
  ) {
    return Response.json({ error: "Each file needs an id and a short name" }, { status: 400 });
  }

  const system = `You classify a middle-school English teacher's existing teaching materials.

You are given filenames, each with the unit it belongs to. Decide two things only:

1. **category** — one of: ${CATEGORIES.join(", ")}
2. **materialType** — one of: ${MATERIAL_TYPES.join(", ")}

What the types mean, in the teacher's own words:
${await definitions(ownerEmail)}

Do NOT infer grade, quarter, school year or unit. The teacher has already told
us those and your guess would overwrite hers.

A lesson is a file she teaches from, usually a slide deck, and it can span
several days. Prefer "other" over a confident wrong answer.

Return ONLY a JSON array, one object per file, echoing the id you were given:
[{"id":"...","category":"Lessons","materialType":"lesson"}]

No markdown fencing, no explanation.`;

  const listing = body.files
    .map((f) => `${f.id} :: ${f.name}${f.unit ? ` (unit: ${f.unit})` : ""}`)
    .join("\n");

  let raw: string;
  try {
    const message = await getAnthropic().messages.create({
      model: MODELS.structured,
      max_tokens: 8192,
      system,
      messages: [
        { role: "user", content: `Classify these ${body.files.length} files:\n\n${listing}` },
      ],
    });
    raw = message.content[0].type === "text" ? message.content[0].text : "";
  } catch (err) {
    console.error("[import/classify] AI call failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Classification failed" }, { status: 502 });
  }

  const parsed = parseAiJson<{ id?: string; category?: string; materialType?: string }[]>(raw);
  if (!Array.isArray(parsed)) {
    console.error("[import/classify] unparseable response:", raw.slice(0, 500));
    return Response.json({ error: "Failed to parse classification" }, { status: 500 });
  }

  // Keep only rows that name a file we asked about and a value we recognise.
  // A hallucinated id or category becomes "unclassified", which she can see
  // and fix — never a silently wrong row in her curriculum.
  const asked = new Set(body.files.map((f) => f.id));
  const classifications = parsed
    .filter((c) => c && typeof c.id === "string" && asked.has(c.id))
    .map((c) => ({
      id: c.id!,
      category: (CATEGORIES as readonly string[]).includes(c.category ?? "")
        ? c.category!
        : null,
      materialType: (MATERIAL_TYPES as readonly string[]).includes(c.materialType ?? "")
        ? c.materialType!
        : null,
    }))
    .filter((c) => c.category || c.materialType);

  return Response.json({ classifications });
}
